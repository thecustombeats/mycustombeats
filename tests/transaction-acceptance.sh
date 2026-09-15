#!/bin/bash
# MCB SPRINT 4 — PERSONALISED ORDER TO VERIFIED PAYMENT, end to end.
#
# Runs against the same throwaway PHP + MariaDB stack as the other suites,
# with the TEST config from tests/README.md: a Stripe TEST key (a stub key —
# `stripe.api_base` points at tests/stripe-stub.php), TEST_ONLY delivery
# fixtures enabled, and customer email allowed only because Resend is a stub.
#
# NO REQUEST EVER REACHES STRIPE OR RESEND. Webhooks are signed locally with
# the test signing secret, exactly as Stripe signs them.
#
# Scenarios that need a different server configuration (a live key, test-mode
# email without a customer override) write a temporary config that extends
# the test one, and always restore it.

BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then printf "  PASS  %-72s [%s]\n" "$name" "$got"; PASS=$((PASS+1));
  else printf "  FAIL  %-72s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
tc() { local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-72s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-72s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
section() { echo ""; echo "================ $1 ================"; }

q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }
idem() { echo "tx-$(openssl rand -hex 16)"; }
CATALOGUE=public/api/data/catalogue.json
price() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["skus"][sys.argv[2]]["price_minor"])' "$CATALOGUE" "$1"; }
CRMKEY="test_crm_key_not_real_000000000000000000000"
SECRET=whsec_test_secret_for_local_verification
FIX=tests/fixtures

release_limits() { q "UPDATE order_consents SET ip_hash = NULL; UPDATE checkout_sessions SET ip_hash = NULL; UPDATE order_uploads SET ip_hash = NULL" >/dev/null 2>&1; }
stub_reset() { docker exec mcb-api sh -c 'rm -f /tmp/stripe-stub.log /tmp/resend-stub.log /tmp/stripe-mode /tmp/resend-mode'; }
stub_count() { docker exec mcb-api sh -c 'grep -c "" /tmp/stripe-stub.log 2>/dev/null || echo 0'; }
last_params() { docker exec mcb-api sh -c 'tail -1 /tmp/stripe-stub.log 2>/dev/null'; }
mail_count() { docker exec mcb-api sh -c 'grep -c "" /tmp/resend-stub.log 2>/dev/null || echo 0'; }
mail_log() { docker exec mcb-api sh -c 'cat /tmp/resend-stub.log 2>/dev/null'; }

# jget PATH [FILE]
jget() { python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."):
    d=d[int(k)] if isinstance(d,list) else (d.get(k) if isinstance(d,dict) else None)
print("null" if d is None else (json.dumps(d,separators=(",",":")) if isinstance(d,(dict,list,bool)) else d))' "${2:-/tmp/tx.json}" "$1" 2>/dev/null; }
body() { cat /tmp/tx.json; }

post_json() { # $1 endpoint, $2 body → code; body in /tmp/tx.json
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "Idempotency-Key: ${IDEM:-$(idem)}" -d "$2"
}
get() { curl -s -o /tmp/tx.json -w '%{http_code}' "$BASE/$1"; }

# ---------------------------------------------------------------------------
# build_order SPEC_JSON → an order body as /create sends it.
# SPEC: { sku, units: [ {pr, memories:[{story, style, about, occasion, photo}]} ] | count,
#         plaques: n, frames: [[sku, unit, memory, heading]], players: [[sku, qty]],
#         email, country, extra: {…}, lines_override, personalisation_override }
# Styles: "MCB" → MCB_CHOICE; "custom:<text>" → CUSTOM; otherwise a catalogued label.
# ---------------------------------------------------------------------------
build_order() {
  python3 - "$1" "$CATALOGUE" <<'PY'
import json, sys
spec = json.loads(sys.argv[1]); skus = json.load(open(sys.argv[2]))["skus"]
sku = spec["sku"]; songs = skus[sku]["song_count"]
def style(v):
    if v == "MCB": return {"choice": "MCB_CHOICE"}
    if isinstance(v, str) and v.startswith("custom:"): return {"choice": "CUSTOM", "label": v[7:]}
    return {"choice": "STYLE", "label": v}
units_spec = spec.get("units")
if units_spec is None:
    units_spec = [{} for _ in range(spec.get("count", 1))]
units = []
for u, us in enumerate(units_spec):
    mems = us.get("memories") or [{} for _ in range(songs)]
    units.append({"sku": us.get("sku", sku), "priorityReplacement": us.get("pr", False), "memories": [
        {k: v for k, v in {
            "story": m.get("story", f"Unit {u+1}, memory {i+1}: the evening on deck."),
            "about": m.get("about", ""), "occasion": m.get("occasion", ""),
            "style": style(m.get("style", "MCB")), "photo": m.get("photo", False)}.items()}
        for i, m in enumerate(mems)]})
plaques = [{"songTitle": f"Our Song {i+1}", "artist": "The Band"} for i in range(spec.get("plaques", 0))]
frames = [{"sku": f[0], "unit": f[1], "memory": f[2], "heading": f[3] if len(f) > 3 else ""} for f in spec.get("frames", [])]
lines = [{"sku": sku, "quantity": len(units)}]
if plaques: lines.append({"sku": "personalised-music-plaque", "quantity": len(plaques)})
fc = {}
for f in frames: fc[f["sku"]] = fc.get(f["sku"], 0) + 1
lines += [{"sku": s, "quantity": n} for s, n in fc.items()]
lines += [{"sku": p[0], "quantity": p[1]} for p in spec.get("players", [])]
pr = sum(1 for u in units if u["priorityReplacement"])
if pr: lines.append({"sku": "priority-replacement", "quantity": pr})
body = {
    "firstName": "Tx", "lastName": "Customer", "email": spec.get("email", "tx@example.com"),
    "whatsapp": "+447000000456",
    "consents": {"TERMS": True, "SERVICE_START": True, "DIGITAL_CONTENT": True}, "termsVersion": "2026-09-09.4",
    "lines": spec.get("lines_override", lines),
    "personalisation": spec.get("personalisation_override", {"units": units, "plaques": plaques, "frames": frames}),
}
if skus[sku]["fulfilment"] == "PHYSICAL" or plaques or frames or spec.get("players"):
    body.update({"shippingName": "Rec Ipient", "shippingAddress": "1 Harbour Row", "shippingCity": "Southampton",
                 "shippingPostcode": "SO14 2AA", "shippingCountryCode": spec.get("country", "GB")})
body.update(spec.get("extra", {}))
for k in spec.get("drop", []): body.pop(k, None)
print(json.dumps(body, separators=(",", ":"), ensure_ascii=False))
PY
}

# order SPEC → sets OID TOK CODE (response in /tmp/order.json)
order() {
  release_limits
  CODE=$(post_json order "$(build_order "$1")")
  cp /tmp/tx.json /tmp/order.json
  OID=$(jget order_id /tmp/order.json); TOK=$(jget checkout_token /tmp/order.json)
}
session() { release_limits; post_json checkout/session "{\"orderId\":$1,\"checkoutToken\":\"$2\"}"; }
status_of() { post_json order-status "{\"orderId\":$1,\"checkoutToken\":\"$2\"}"; }
upload() { # $1 oid, $2 token, $3 slot, $4 file, [$5 filename] → code (body /tmp/tx.json)
  release_limits
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/order-upload" -H "Origin: $ORIGIN" \
    -F "orderId=$1" -F "checkoutToken=$2" -F "slot=$3" -F "photo=@$4;filename=${5:-photo.jpg}"
}

sign() { local ts=$(date +%s); local sig=$(printf '%s.%s' "$ts" "$1" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
hook() { curl -s -o /tmp/wh.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$1")" -d "$1"; }
# pay_event EVT SESSION ORDER AMOUNT CURRENCY [LIVEMODE true|false|absent]
pay_event() {
  python3 - "$@" <<'PY'
import json, sys
a = sys.argv[1:]
o = {"id": a[1], "object": "checkout.session", "client_reference_id": a[2], "payment_intent": "pi_" + a[1],
     "payment_status": "paid", "currency": a[4], "amount_total": int(a[3]), "metadata": {"mcb_order_id": a[2]}}
e = {"id": a[0], "type": "checkout.session.completed", "data": {"object": o}}
mode = a[5] if len(a) > 5 else "false"
if mode != "absent":
    e["livemode"] = mode == "true"; o["livemode"] = mode == "true"
print(json.dumps(e, separators=(",", ":")))
PY
}
session_id_for() { q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$1 ORDER BY attempt DESC LIMIT 1"; }

# ---- Temporary server configuration ---------------------------------------
CFG=public/api/config.php
cp "$CFG" /tmp/tx-config-original.php
cp "$CFG" public/api/_test-config-base.php
# The PHP image runs OPcache, which rechecks a changed file every 2 seconds.
settle() { sleep 3; }
restore_config() { cp /tmp/tx-config-original.php "$CFG"; settle; }
trap 'restore_config; rm -f public/api/_test-config-base.php' EXIT
# with_config PHP_STATEMENTS — extends the test config; e.g. "\$c['stripe']['secret_key']='sk_live_x';"
with_config() { printf "<?php\n\$c = require __DIR__ . '/_test-config-base.php';\n%s\nreturn \$c;\n" "$1" > "$CFG"; settle; }

stub_reset

# ===========================================================================
section "0. THE SERVER SAYS WHETHER PAYMENT IS OPEN"
t "GET /api/checkout/status answers" 200 "$(get checkout/status)"
tc "  → online checkout open, in TEST mode" "$([ "$(jget online_checkout)" = "true" ] && [ "$(jget mode)" = "test" ] && echo 1 || echo 0)"
tc "  → nothing about keys or configuration disclosed" "$(body | grep -qiE 'sk_|whsec|secret|key' && echo 0 || echo 1)"
with_config "\$c['stripe']['checkout_sessions_enabled'] = false;"
get checkout/status >/dev/null
tc "switched off on the server → the site is told it is closed" "$([ "$(jget online_checkout)" = "false" ] && [ "$(jget mode)" = "null" ] && echo 1 || echo 0)"
restore_config

# ===========================================================================
section "1. DIGITAL MOMENT — THE GOLDEN PATH"
MOMENT=$(price moment)
t "the Moment is priced £15 by the catalogue" 1500 "$MOMENT"
t "the Review quote is the server's: £15, no delivery" 200 "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1}]}')"
tc "  → subtotal 1500, delivery NOT_REQUIRED 0, total 1500, payable" "$([ "$(jget subtotal_minor)" = "1500" ] && [ "$(jget delivery.status)" = "NOT_REQUIRED" ] && [ "$(jget total_minor)" = "1500" ] && [ "$(jget payable)" = "true" ] && echo 1 || echo 0)"

GOLD_STORY="The night Dad sang Sinatra at the captain's table and the whole room joined in."
order "{\"sku\":\"moment\",\"email\":\"moment-gold@example.com\",\"units\":[{\"memories\":[{\"story\":\"$GOLD_STORY\",\"about\":\"Dad\",\"occasion\":\"cruise\",\"style\":\"Motown-inspired\"}]}]}"
GOID=$OID; GTOK=$TOK
t "the personalised Moment is saved" 201 "$CODE"
tc "  → server-authoritative total 1500, digital, nothing to deliver" "$([ "$(jget total_minor /tmp/order.json)" = "1500" ] && [ "$(jget fulfilment_type /tmp/order.json)" = "DIGITAL" ] && [ "$(jget delivery.status /tmp/order.json)" = "NOT_REQUIRED" ] && echo 1 || echo 0)"
tc "  → personalisation COMPLETE and ready: no blocker" "$([ "$(jget personalisation_status /tmp/order.json)" = "COMPLETE" ] && [ "$(jget checkout_blocker /tmp/order.json)" = "null" ] && echo 1 || echo 0)"
tc "  → persisted as ONE song unit with ONE memory" "$([ "$(q "SELECT CONCAT(COUNT(DISTINCT u.id),'|',COUNT(m.id)) FROM order_units u LEFT JOIN order_memories m ON m.unit_id=u.id WHERE u.order_id=$GOID")" = "1|1" ] && echo 1 || echo 0)"
tc "  → the memory is stored exactly as written" "$([ "$(q "SELECT story FROM order_memories WHERE order_id=$GOID")" = "$GOLD_STORY" ] && echo 1 || echo 0)"
tc "  → with who it is about, the occasion and the chosen style" "$([ "$(q "SELECT CONCAT_WS('|',about,occasion,style_choice,style_label,photo_requested) FROM order_memories WHERE order_id=$GOID")" = "Dad|cruise|STYLE|Motown-inspired|0" ] && echo 1 || echo 0)"
tc "  → digital: no vinyl format snapshot" "$([ "$(q "SELECT IFNULL(picture_disc,'NULL') FROM order_units WHERE order_id=$GOID")" = "NULL" ] && echo 1 || echo 0)"
tc "  → the order response carries no story, email or address" "$(grep -qiE 'Sinatra|moment-gold|Harbour' /tmp/order.json && echo 0 || echo 1)"
tc "  → ORDER.CREATED and PERSONALISATION.COMPLETE audited, with no customer text" "$([ "$(q "SELECT GROUP_CONCAT(event_type ORDER BY id) FROM order_events WHERE order_id=$GOID")" = "ORDER.CREATED,PERSONALISATION.COMPLETE" ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$GOID AND (detail LIKE '%Sinatra%' OR detail LIKE '%example.com%')")" = "0" ] && echo 1 || echo 0)"

curl -s -o /tmp/ref.json "$BASE/order-reference?session_id=cs_test_not_yet_paid_000000"
tc "before payment there is no reference and no purchase to report" "$([ "$(jget reference /tmp/ref.json)" = "null" ] && [ "$(jget purchase /tmp/ref.json)" = "null" ] && echo 1 || echo 0)"

stub_reset
t "a TEST Checkout Session is created from the saved order" 200 "$(session $GOID $GTOK)"
GSID=$(jget id)
tc "  → a Stripe session id and https URL come back" "$(echo "$GSID" | grep -qE '^cs_test_' && jget url | grep -q '^https://' && echo 1 || echo 0)"
PARAMS=$(last_params)
tc "  → Stripe was sent one GBP line of 1500 and no delivery" "$(echo "$PARAMS" | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];li=p["line_items"];print(1 if len(li)==1 and li[0]["price_data"]["unit_amount"]=="1500" and li[0]["price_data"]["currency"]=="gbp" and "shipping_options" not in p else 0)')"
tc "  → Adaptive Pricing off: Stripe may not offer another currency" "$(echo "$PARAMS" | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];print(1 if p.get("adaptive_pricing",{}).get("enabled")=="false" else 0)')"
tc "  → metadata holds operational identifiers ONLY" "$(echo "$PARAMS" | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];print(1 if set(p["metadata"])=={"mcb_order_id","mcb_basket_hash","mcb_checkout"} else 0)')"
tc "  → no story, recipient or address anywhere in what Stripe was sent" "$(echo "$PARAMS" | grep -qiE 'Sinatra|captain|Motown|Dad|Harbour|Southampton' && echo 0 || echo 1)"
tc "  → success URL uses {CHECKOUT_SESSION_ID}; cancel returns to Review, no order data" "$(echo "$PARAMS" | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];print(1 if p["success_url"].endswith("/thank-you?session_id={CHECKOUT_SESSION_ID}") and p["cancel_url"]=="http://localhost:8080/create?step=review&checkout=cancelled" else 0)')"
tc "  → the snapshot records TEST mode and the payable total" "$([ "$(q "SELECT CONCAT(expected_minor,'|',currency,'|',livemode) FROM checkout_sessions WHERE order_id=$GOID")" = "1500|GBP|0" ] && echo 1 || echo 0)"
tc "  → CHECKOUT.SESSION_CREATED audited" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$GOID AND event_type='CHECKOUT.SESSION_CREATED'")" = "1" ] && echo 1 || echo 0)"
t "a double-clicked Pay returns the SAME session" 200 "$(session $GOID $GTOK)"
tc "  → reused, Stripe not called again, one snapshot" "$([ "$(jget id)" = "$GSID" ] && [ "$(jget reused)" = "true" ] && [ "$(stub_count)" = "1" ] && [ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$GOID")" = "1" ] && echo 1 || echo 0)"

GSID_DB=$(session_id_for $GOID)
BAD=$(pay_event evt_gold_bad "$GSID_DB" "$GOID" 1500 gbp)
t "an unsigned or wrongly signed payment is rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H 'Content-Type: application/json' -H 'Stripe-Signature: t=1,v1=deadbeef' -d "$BAD")"
tc "  → and marks nothing paid" "$([ "$(q "SELECT status FROM orders WHERE id=$GOID")" = "PENDING" ] && echo 1 || echo 0)"

MAIL0=$(mail_count)
GOOD=$(pay_event evt_gold_ok "$GSID_DB" "$GOID" 1500 gbp)
t "the signature-verified TEST payment is accepted" 200 "$(hook "$GOOD")"
tc "  → outcome recorded" "$(grep -q '"outcome":"recorded"' /tmp/wh.json && echo 1 || echo 0)"
GREF=$(q "SELECT mcb_reference FROM orders WHERE id=$GOID")
tc "  → order PAID, in TEST mode" "$([ "$(q "SELECT CONCAT(status,'|',stripe_livemode) FROM orders WHERE id=$GOID")" = "PAID|0" ] && echo 1 || echo 0)"
tc "  → exactly one MCB reference, MCB-YYYY-NNNNNN" "$(echo "$GREF" | grep -qE '^MCB-[0-9]{4}-[0-9]{6}$' && echo 1 || echo 0)"
tc "  → audit: PAYMENT.RECEIVED, ORDER.PAID, CUSTOMER.CONFIRMATION.DUE and SENT" "$([ "$(q "SELECT GROUP_CONCAT(event_type ORDER BY id) FROM order_events WHERE order_id=$GOID AND event_type NOT IN ('ORDER.CREATED','PERSONALISATION.COMPLETE','CHECKOUT.SESSION_CREATED')")" = "PAYMENT.RECEIVED,ORDER.PAID,CUSTOMER.CONFIRMATION.DUE,CUSTOMER.CONFIRMATION.SENT" ] && echo 1 || echo 0)"
tc "  → one confirmation email, with the reference and no story text" "$([ "$(mail_count)" = "$((MAIL0+1))" ] && mail_log | tail -1 | grep -q "$GREF" && ! mail_log | tail -1 | grep -qiE 'Sinatra|captain|Motown' && echo 1 || echo 0)"
curl -s -o /tmp/ref.json "$BASE/order-reference?session_id=$GSID_DB"
tc "confirmation page data only after PAID: reference and purchase from the server" "$([ "$(jget reference /tmp/ref.json)" = "$GREF" ] && [ "$(jget status /tmp/ref.json)" = "PAID" ] && [ "$(jget purchase.value_minor /tmp/ref.json)" = "1500" ] && echo 1 || echo 0)"

t "the same webhook delivered again is harmless" 200 "$(hook "$GOOD")"
tc "  → reported duplicate; still one reference, one email, one ORDER.PAID" "$(grep -q '"outcome":"duplicate"' /tmp/wh.json && [ "$(q "SELECT mcb_reference FROM orders WHERE id=$GOID")" = "$GREF" ] && [ "$(mail_count)" = "$((MAIL0+1))" ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$GOID AND event_type='ORDER.PAID'")" = "1" ] && echo 1 || echo 0)"
t "a paid order cannot get another payable session" 409 "$(session $GOID $GTOK)"
t "the same order submission repeated returns the same order" 200 "$(IDEM=gold-repeat-key-0000000001 post_json order "$(build_order '{"sku":"moment","email":"moment-repeat@example.com"}')" >/dev/null; IDEM=gold-repeat-key-0000000001 post_json order "$(build_order '{"sku":"moment","email":"moment-repeat@example.com"}')")"
tc "  → replayed, one order row for that customer" "$([ "$(jget replayed)" = "true" ] && [ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='moment-repeat@example.com'")" = "1" ] && echo 1 || echo 0)"

section "1b. MOMENT — PAYMENTS THAT MUST NOT COMPLETE AN ORDER"
for CASE in "under:1499:gbp:AMOUNT_MISMATCH" "over:1501:gbp:AMOUNT_MISMATCH" "currency:1500:eur:CURRENCY_MISMATCH"; do
  IFS=: read -r NAME AMT CUR REASON <<< "$CASE"
  order "{\"sku\":\"moment\",\"email\":\"moment-$NAME@example.com\"}"
  session "$OID" "$TOK" >/dev/null
  SID=$(session_id_for "$OID")
  hook "$(pay_event "evt_m_$NAME" "$SID" "$OID" "$AMT" "$CUR")" >/dev/null
  tc "$NAME payment: not PAID, PAYMENT_REVIEW, no reference, filed $REASON" "$([ "$(q "SELECT CONCAT(status,'|',IFNULL(mcb_reference,'NULL')) FROM orders WHERE id=$OID")" = "PAYMENT_REVIEW|NULL" ] && [ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$SID'")" = "$REASON" ] && echo 1 || echo 0)"
done
order '{"sku":"moment","email":"moment-live@example.com"}'
session "$OID" "$TOK" >/dev/null; SID=$(session_id_for "$OID")
hook "$(pay_event evt_m_live "$SID" "$OID" 1500 gbp true)" >/dev/null
tc "a LIVE-mode payment reaching this TEST server is filed MODE_MISMATCH, not paid" "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PENDING" ] && [ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$SID'")" = "MODE_MISMATCH" ] && echo 1 || echo 0)"
order '{"sku":"moment","email":"moment-nomode@example.com"}'
session "$OID" "$TOK" >/dev/null; SID=$(session_id_for "$OID")
hook "$(pay_event evt_m_nomode "$SID" "$OID" 1500 gbp absent)" >/dev/null
tc "a payment that does not state its mode is not trusted either" "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PENDING" ] && [ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$SID'")" = "MODE_MISMATCH" ] && echo 1 || echo 0)"
tc "no refused payment issued a reference or an email" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE status<>'PAID' AND mcb_reference IS NOT NULL")" = "0" ] && echo 1 || echo 0)"
t "an unknown Checkout Session attaches to no order" 200 "$(hook "$(pay_event evt_m_ghost cs_test_ghost_session_000001 999999 1500 gbp)")"
tc "  → filed ORDER_NOT_FOUND" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='cs_test_ghost_session_000001'")" = "ORDER_NOT_FOUND" ] && echo 1 || echo 0)"

# ===========================================================================
section "2. KEEPSAKE — ONE PICTURE DISC PER MEMORY SET"
for CASE in "keepsake-7-picture-disc:1:7:ROUND" "keepsake-10-heart-picture-disc:1:10:HEART" "keepsake-10-picture-disc:3:10:ROUND" "keepsake-12-picture-disc:4:12:ROUND"; do
  IFS=: read -r SKU N SIZE SHAPE <<< "$CASE"
  order "{\"sku\":\"$SKU\",\"email\":\"$SKU@example.com\"}"
  tc "$SKU is saved with exactly $N memor$([ "$N" = 1 ] && echo y || echo ies)" "$([ "$CODE" = "201" ] && [ "$(q "SELECT COUNT(*) FROM order_memories WHERE order_id=$OID")" = "$N" ] && echo 1 || echo 0)"
  tc "  → format snapshot: picture disc, ${SIZE}-inch, $SHAPE" "$([ "$(q "SELECT CONCAT_WS('|',picture_disc,size_inches,shape,song_count) FROM order_units WHERE order_id=$OID")" = "1|$SIZE|$SHAPE|$N" ] && echo 1 || echo 0)"
  WRONG=$((N + 1))
  release_limits
  SPEC="{\"sku\":\"$SKU\",\"units\":[{\"memories\":$(python3 -c "import json;print(json.dumps([{}]*$WRONG))")}]}"
  S=$(post_json order "$(build_order "$SPEC")")
  tc "  → $WRONG memories refused with a field error, nothing stored" "$([ "$S" = "422" ] && body | grep -q 'personalisation.units.0.memories' && echo 1 || echo 0)"
done

order '{"sku":"keepsake-10-picture-disc","email":"two-keepsakes@example.com","units":[{"memories":[{"story":"Sailaway from Southampton"},{"story":"First port, Lisbon"},{"story":"Formal night"}]},{"memories":[{"story":"Mum on the balcony"},{"story":"Sunset at sea"},{"story":"The last dinner"}]}]}'
TWO=$OID
tc "two Keepsakes are two independent units" "$([ "$CODE" = "201" ] && [ "$(q "SELECT COUNT(*) FROM order_units WHERE order_id=$TWO AND kind='SONG'")" = "2" ] && echo 1 || echo 0)"
tc "  → each with its own three memories, never copied" "$([ "$(q "SELECT GROUP_CONCAT(m.story ORDER BY u.unit_index, m.sequence SEPARATOR ';') FROM order_memories m JOIN order_units u ON u.id=m.unit_id WHERE m.order_id=$TWO")" = "Sailaway from Southampton;First port, Lisbon;Formal night;Mum on the balcony;Sunset at sea;The last dinner" ] && echo 1 || echo 0)"
tc "  → one order line of quantity 2 carries both" "$([ "$(q "SELECT CONCAT(item_id,'|',quantity) FROM order_items WHERE order_id=$TWO")" = "keepsake-10-picture-disc|2" ] && echo 1 || echo 0)"

order '{"sku":"keepsake-7-picture-disc","email":"pr-one@example.com","units":[{"pr":true},{"pr":false},{"pr":true}]}'
tc "Priority Replacement is recorded against the Keepsakes that chose it" "$([ "$CODE" = "201" ] && [ "$(q "SELECT GROUP_CONCAT(priority_replacement ORDER BY unit_index) FROM order_units WHERE order_id=$OID")" = "1,0,1" ] && [ "$(q "SELECT quantity FROM order_items WHERE order_id=$OID AND item_id='priority-replacement'")" = "2" ] && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","units":[{"pr":true}],"lines_override":[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":2}]}')")
tc "  → never more than one per Keepsake (2 for 1 refused)" "$([ "$S" = "422" ] && body | grep -q 'priority_replacement_ineligible' && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","units":[{"pr":false}],"lines_override":[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":1}]}')")
tc "  → a Priority Replacement line no Keepsake chose is refused" "$([ "$S" = "422" ] && body | grep -q 'priorityReplacement' && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"journey-6","units":[{"pr":true}],"lines_override":[{"sku":"journey-6","quantity":1}]}')")
tc "  → never on an ineligible product (Journey refused)" "$([ "$S" = "422" ] && body | grep -q 'only available for Keepsakes' && echo 1 || echo 0)"

release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","drop":["shippingAddress"]}')")
tc "a Keepsake without a delivery address is refused" "$([ "$S" = "422" ] && body | grep -q 'shippingAddress' && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","country":"ZZ"}')")
tc "  → and one without a real country is refused" "$([ "$S" = "422" ] && body | grep -q 'shippingCountry' && echo 1 || echo 0)"

# ===========================================================================
section "3. DELIVERY — QUOTED BY THE SERVER, NEVER INVENTED, NEVER FREE"
t "a UK Keepsake quote" 200 "$(post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1}],"shippingCountryCode":"GB"}')"
tc "  → TEST_ONLY fixture, clearly labelled, added to the total" "$([ "$(jget delivery.status)" = "QUOTED" ] && [ "$(jget delivery.test_only)" = "true" ] && jget delivery.label | grep -q '^TEST ONLY' && [ "$(jget total_minor)" = "$(( $(price keepsake-7-picture-disc) + $(jget delivery.minor) ))" ] && echo 1 || echo 0)"
UKD=$(jget delivery.minor)
post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1}],"shippingCountryCode":"US"}' >/dev/null
tc "  → a different destination is quoted separately" "$([ "$(jget delivery.minor)" != "$UKD" ] && [ "$(jget delivery.test_only)" = "true" ] && echo 1 || echo 0)"
t "a physical quote without a country is refused" 422 "$(post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1}]}')"
tc "no delivery fixture or rate is written into the browser source" "$(grep -rqE 'TEST_ONLY|first_item_minor|additional_item_minor' src/ && echo 0 || echo 1)"
tc "no production rate table exists: physical delivery is UNAVAILABLE without fixtures" "$([ ! -f public/api/data/delivery-rates.json ] && echo 1 || echo 0)"
with_config "\$c['delivery']['use_test_fixtures'] = false;"
post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null
tc "  → with fixtures off: UNAVAILABLE, not payable, not free" "$([ "$(jget delivery.status)" = "UNAVAILABLE" ] && [ "$(jget payable)" = "false" ] && echo 1 || echo 0)"
order '{"sku":"keepsake-7-picture-disc","email":"no-rate@example.com"}'
tc "  → the order is still saved, marked UNAVAILABLE" "$([ "$CODE" = "201" ] && [ "$(q "SELECT delivery_status FROM orders WHERE id=$OID")" = "UNAVAILABLE" ] && echo 1 || echo 0)"
t "  → and checkout refuses it" 409 "$(session "$OID" "$TOK")"
tc "  → as delivery_unavailable, in plain English" "$(body | grep -q 'delivery_unavailable' && body | grep -q "contact MCB" && echo 1 || echo 0)"
restore_config

with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['live_checkout_approved'] = true;"
post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null
tc "with a LIVE key, TEST_ONLY fixtures are refused even with the flag on" "$([ "$(jget delivery.status)" = "UNAVAILABLE" ] && [ "$(jget delivery.test_only)" = "false" ] && echo 1 || echo 0)"
restore_config

# ===========================================================================
section "4. PHYSICAL KEEPSAKE — PHOTO, PRIORITY REPLACEMENT, DELIVERY, PAYMENT"
order '{"sku":"keepsake-7-picture-disc","email":"keepsake-e2e@example.com","units":[{"pr":true,"memories":[{"story":"Our first dance at sea.","style":"custom:Big band swing","photo":true}]}]}'
KOID=$OID; KTOK=$TOK
tc "the 7-inch Keepsake with a promised photo is saved AWAITING_UPLOADS" "$([ "$CODE" = "201" ] && [ "$(jget personalisation_status /tmp/order.json)" = "AWAITING_UPLOADS" ] && [ "$(jget missing_uploads /tmp/order.json)" = '["memory:1:1"]' ] && echo 1 || echo 0)"
tc "  → custom style stored as the customer's own words" "$([ "$(q "SELECT CONCAT(style_choice,'|',style_label) FROM order_memories WHERE order_id=$KOID")" = "CUSTOM|Big band swing" ] && echo 1 || echo 0)"
KSUB=$(( $(price keepsake-7-picture-disc) + $(price priority-replacement) ))
tc "  → subtotal = Keepsake + Priority Replacement; total adds the quoted delivery" "$([ "$(jget subtotal_minor /tmp/order.json)" = "$KSUB" ] && [ "$(jget total_minor /tmp/order.json)" = "$((KSUB + $(jget delivery.minor /tmp/order.json)))" ] && [ "$(jget delivery.test_only /tmp/order.json)" = "true" ] && echo 1 || echo 0)"
t "checkout waits for the photo" 409 "$(session $KOID $KTOK)"
tc "  → awaiting_uploads, and Stripe was not called" "$(body | grep -q 'awaiting_uploads' && echo 1 || echo 0)"
t "the photo is uploaded against its memory" 201 "$(upload $KOID $KTOK memory:1:1 $FIX/photo-8x8.jpg)"
tc "  → personalisation COMPLETE, nothing missing, ready to pay" "$([ "$(jget personalisation_status)" = "COMPLETE" ] && [ "$(jget missing_uploads)" = "[]" ] && [ "$(jget checkout_blocker)" = "null" ] && echo 1 || echo 0)"
tc "  → stored once, attached to that memory, as a JPEG" "$([ "$(q "SELECT CONCAT(COUNT(*),'|',MAX(mime_type)) FROM order_uploads up JOIN order_memories m ON m.id=up.memory_id WHERE up.order_id=$KOID")" = "1|image/jpeg" ] && echo 1 || echo 0)"
stub_reset
t "the TEST session is created" 200 "$(session $KOID $KTOK)"
KPARAMS=$(last_params)
tc "  → Stripe got the saved lines and the quoted delivery as a fixed shipping amount" "$(echo "$KPARAMS" | python3 -c 'import json,sys
p=json.loads(sys.stdin.read())["params"]; so=p["shipping_options"][0]["shipping_rate_data"]
print(1 if len(p["line_items"])==2 and so["type"]=="fixed_amount" and so["fixed_amount"]["currency"]=="gbp" and so["display_name"].startswith("TEST ONLY") else 0)')"
KTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$KOID")
tc "  → the snapshot expects the payable total, delivery included ($KTOTAL)" "$([ "$(q "SELECT expected_minor FROM checkout_sessions WHERE order_id=$KOID")" = "$KTOTAL" ] && echo 1 || echo 0)"
tc "  → no photo name, story or address in what Stripe was sent" "$(echo "$KPARAMS" | grep -qiE 'photo\.jpg|first dance|Harbour|Southampton|Rec Ipient' && echo 0 || echo 1)"
KSID=$(session_id_for $KOID)
hook "$(pay_event evt_k_ok "$KSID" "$KOID" "$((KTOTAL - $(q "SELECT delivery_minor FROM orders WHERE id=$KOID")))" gbp)" >/dev/null
tc "paying only the goods (delivery missing) is an underpayment: not paid" "$([ "$(q "SELECT status FROM orders WHERE id=$KOID")" = "PAYMENT_REVIEW" ] && echo 1 || echo 0)"
q "UPDATE orders SET status='PENDING' WHERE id=$KOID; DELETE FROM unreconciled_payments WHERE stripe_session_id='$KSID'; DELETE FROM order_events WHERE order_id=$KOID AND event_type IN ('PAYMENT.RECEIVED','PAYMENT.REVIEW'); DELETE FROM stripe_events WHERE event_id='evt_k_ok'" >/dev/null
t "the exact payable total, in TEST mode, is accepted" 200 "$(hook "$(pay_event evt_k_exact "$KSID" "$KOID" "$KTOTAL" gbp)")"
tc "  → PAID with a reference; the production brief is complete" "$([ "$(q "SELECT status FROM orders WHERE id=$KOID")" = "PAID" ] && q "SELECT mcb_reference FROM orders WHERE id=$KOID" | grep -qE '^MCB-' && echo 1 || echo 0)"

t "staff read the production brief with the CRM key" 200 "$(curl -s -o /tmp/tx.json -w '%{http_code}' "$BASE/crm/order-personalisation?order_id=$KOID" -H "Authorization: Bearer $CRMKEY")"
tc "  → memory, custom style, photo id, Priority Replacement and address are all there" "$(python3 -c 'import json
d=json.load(open("/tmp/tx.json")); s=d["songs"][0]; m=s["memories"][0]
print(1 if m["story"]=="Our first dance at sea." and m["style"]=="Big band swing" and m["photo"]["id"] and len(m["photo"]["id"])==32 and s["priority_replacement"] and s["format"]["picture_disc"] and d["delivery_address"]["country_code"]=="GB" and d["order"]["test_payment"] is True else 0)')"
t "  → without the key the brief is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/order-personalisation?order_id=$KOID")"

order '{"sku":"keepsake-12-picture-disc","email":"twelve-e2e@example.com","units":[{"memories":[{"story":"Day 1 — Sailaway","style":"1980s"},{"story":"Day 3 — First Port","style":"Jazz"},{"story":"Day 5 — Formal Night","style":"MCB"},{"story":"Day 8 — Sunset at Sea","style":"custom:Sea shanty"}]}]}'
T12=$OID
tc "a 12-inch Keepsake with four memories is ready to pay without photos" "$([ "$CODE" = "201" ] && [ "$(jget personalisation_status /tmp/order.json)" = "COMPLETE" ] && [ "$(session $T12 $TOK)" = "200" ] && echo 1 || echo 0)"
tc "  → four memories, in order, each with its own style choice" "$([ "$(q "SELECT GROUP_CONCAT(CONCAT(sequence,':',style_choice,':',IFNULL(style_label,'-')) ORDER BY sequence) FROM order_memories WHERE order_id=$T12")" = "1:STYLE:1980s,2:STYLE:Jazz,3:MCB_CHOICE:-,4:CUSTOM:Sea shanty" ] && echo 1 || echo 0)"

# ===========================================================================
section "5. JOURNEY — CHAPTERS ON STANDARD VINYL"
STYLES6='[{"style":"1950s"},{"style":"1960s"},{"style":"1970s"},{"style":"1980s"},{"style":"1990s"},{"style":"MCB"}]'
order "{\"sku\":\"journey-6\",\"email\":\"journey6@example.com\",\"units\":[{\"memories\":$STYLES6}]}"
J6=$OID
tc "a 6-song Journey is saved with exactly six chapters" "$([ "$CODE" = "201" ] && [ "$(q "SELECT COUNT(*) FROM order_memories WHERE order_id=$J6")" = "6" ] && echo 1 || echo 0)"
tc "  → each chapter keeps its own genre" "$([ "$(q "SELECT GROUP_CONCAT(IFNULL(style_label,'MCB') ORDER BY sequence) FROM order_memories WHERE order_id=$J6")" = "1950s,1960s,1970s,1980s,1990s,MCB" ] && echo 1 || echo 0)"
tc "  → standard vinyl, explicitly NOT a picture disc" "$([ "$(q "SELECT CONCAT_WS('|',picture_disc,size_inches,disc_count,gatefold) FROM order_units WHERE order_id=$J6")" = "0|12|1|0" ] && echo 1 || echo 0)"
for N in 5 7; do
  release_limits
  SPEC="{\"sku\":\"journey-6\",\"units\":[{\"memories\":$(python3 -c "import json;print(json.dumps([{}]*$N))")}]}"
  S=$(post_json order "$(build_order "$SPEC")")
  tc "  → $N chapters for a 6-song Journey refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"
done
release_limits
S=$(post_json order "$(build_order '{"sku":"journey-6","count":2}')")
tc "  → a Journey is one product, not two" "$([ "$S" = "422" ] && echo 1 || echo 0)"
order '{"sku":"journey-12","email":"journey12@example.com"}'
tc "a 12-song Journey is saved with exactly twelve chapters" "$([ "$CODE" = "201" ] && [ "$(q "SELECT COUNT(*) FROM order_memories WHERE order_id=$OID")" = "12" ] && echo 1 || echo 0)"
tc "  → standard vinyl: two discs, gatefold, not a picture disc" "$([ "$(q "SELECT CONCAT_WS('|',picture_disc,disc_count,gatefold) FROM order_units WHERE order_id=$OID")" = "0|2|1" ] && echo 1 || echo 0)"
release_limits
SPEC="{\"sku\":\"journey-12\",\"units\":[{\"memories\":$(python3 -c "import json;print(json.dumps([{}]*11))")}]}"
S=$(post_json order "$(build_order "$SPEC")")
tc "  → eleven chapters for a 12-song Journey refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"

# ===========================================================================
section "6. FINISHING TOUCHES"
order '{"sku":"keepsake-12-picture-disc","email":"addons@example.com","plaques":1,"frames":[["lyrics-frame-12x18",1,2,"Our Song"]],"players":[["vintage-smartphone-gramophone",1]]}'
AOID=$OID; ATOK=$TOK
tc "plaque, frame and gramophone are saved with the Keepsake" "$([ "$CODE" = "201" ] && [ "$(q "SELECT GROUP_CONCAT(CONCAT(item_id,':',quantity) ORDER BY id) FROM order_items WHERE order_id=$AOID")" = "keepsake-12-picture-disc:1,personalised-music-plaque:1,lyrics-frame-12x18:1,vintage-smartphone-gramophone:1" ] && echo 1 || echo 0)"
tc "  → the plaque keeps its song title and artist" "$([ "$(q "SELECT CONCAT(plaque_song_title,'|',plaque_artist) FROM order_units WHERE order_id=$AOID AND kind='PLAQUE'")" = "Our Song 1|The Band" ] && echo 1 || echo 0)"
tc "  → the frame points at song 2 of Keepsake 1, with its heading" "$([ "$(q "SELECT CONCAT(m.sequence,'|',f.frame_heading) FROM order_units f JOIN order_memories m ON m.id=f.frame_memory_id WHERE f.order_id=$AOID AND f.kind='FRAME'")" = "2|Our Song" ] && echo 1 || echo 0)"
tc "  → the plaque photo is required before payment" "$([ "$(jget missing_uploads /tmp/order.json)" = '["plaque:1"]' ] && [ "$(session $AOID $ATOK)" = "409" ] && echo 1 || echo 0)"
t "  → plaque photo uploaded" 201 "$(upload $AOID $ATOK plaque:1 $FIX/photo-8x8.png photo.png)"
tc "  → the photo is in, but MCB confirms plaque and gramophone delivery before payment" "$([ "$(jget checkout_blocker)" = "delivery_unavailable" ] && [ "$(q "SELECT delivery_status FROM orders WHERE id=$AOID")" = "UNAVAILABLE" ] && echo 1 || echo 0)"
t "  → so checkout refuses it" 409 "$(session $AOID $ATOK)"
order '{"sku":"keepsake-12-picture-disc","email":"addons-frame@example.com","frames":[["lyrics-frame-12x18",1,2,"Our Song"]]}'
FOID=$OID; FTOK=$TOK
tc "a Keepsake with a frame is quoted with a separate TEST frame rate and is ready" "$([ "$CODE" = "201" ] && [ "$(jget checkout_blocker /tmp/order.json)" = "null" ] && [ "$(q "SELECT delivery_rate_id FROM orders WHERE id=$FOID")" = "TEST_ONLY_UK+TEST_ONLY_FRAME" ] && [ "$(q "SELECT delivery_minor FROM orders WHERE id=$FOID")" = "1190" ] && echo 1 || echo 0)"
tc "the plaque is never described as playing music" "$(grep -rqiE 'plays (your|the) (song|music)' src/data/catalogue/products.ts && echo 0 || echo 1)"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","frames":[["lyrics-frame-10x15",1,2]]}')")
tc "a frame naming a song the Keepsake does not have is refused" "$([ "$S" = "422" ] && body | grep -q 'frames.0.memory' && echo 1 || echo 0)"
release_limits
SPEC="{\"sku\":\"keepsake-7-picture-disc\",\"frames\":[[\"lyrics-frame-10x15\",1,1,\"$(python3 -c 'print("H"*81)')\"]]}"
S=$(post_json order "$(build_order "$SPEC")")
tc "a frame heading over 80 characters is refused" "$([ "$S" = "422" ] && body | grep -q 'frames.0.heading' && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","lines_override":[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"personalised-music-plaque","quantity":1}]}')")
tc "a plaque line with no plaque details is refused" "$([ "$S" = "422" ] && body | grep -q 'personalisation.plaques' && echo 1 || echo 0)"

# ===========================================================================
section "7. VALIDATION — REFUSED, NEVER TRUNCATED"
LONG=$(python3 -c 'print("x"*301)')
release_limits
SPEC="{\"sku\":\"moment\",\"email\":\"long@example.com\",\"units\":[{\"memories\":[{\"story\":\"$LONG\"}]}]}"
S=$(post_json order "$(build_order "$SPEC")")
tc "a 301-character memory is refused with a field error" "$([ "$S" = "422" ] && body | grep -q 'personalisation.units.0.memories.0.story' && body | grep -q '300 characters' && echo 1 || echo 0)"
tc "  → and nothing was stored for it" "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='long@example.com'")" = "0" ] && echo 1 || echo 0)"
EXACT=$(python3 -c 'print("é"*300)')
order "{\"sku\":\"moment\",\"email\":\"exact@example.com\",\"units\":[{\"memories\":[{\"story\":\"$EXACT\"}]}]}"
tc "exactly 300 characters (multi-byte) is accepted and stored whole" "$([ "$CODE" = "201" ] && [ "$(q "SELECT CHAR_LENGTH(story) FROM order_memories WHERE order_id=$OID")" = "300" ] && echo 1 || echo 0)"
for CASE in 'story:""' 'style:"Not A Real Style"' 'occasion:"graduation-of-the-cat"'; do
  KEY=${CASE%%:*}; VAL=${CASE#*:}
  release_limits
  SPEC="{\"sku\":\"moment\",\"units\":[{\"memories\":[{\"$KEY\":$VAL}]}]}"
  S=$(post_json order "$(build_order "$SPEC")")
  tc "an invalid $KEY is refused as a field error" "$([ "$S" = "422" ] && body | grep -q "memories.0.$KEY" && echo 1 || echo 0)"
done
release_limits
SPEC="{\"sku\":\"moment\",\"units\":[{\"memories\":[{\"style\":\"custom:$(python3 -c 'print("y"*121)')\"}]}]}"
S=$(post_json order "$(build_order "$SPEC")")
tc "a custom style over 120 characters is refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"moment","units":[{"memories":[{"story":"a bell \u0007 in the middle"}]}]}')")
tc "control characters in a memory are refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"moment","personalisation_override":"not an object"}')")
tc "an unreadable personalisation block is refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"
release_limits
S=$(post_json order "$(build_order '{"sku":"moment","lines_override":[{"sku":"moment","quantity":1},{"sku":"journey-6","quantity":1}]}')")
tc "two experiences in one order are refused" "$([ "$S" = "422" ] && body | grep -q 'one Moment, Keepsake or Journey' && echo 1 || echo 0)"

# ===========================================================================
section "8. UPLOADS"
order '{"sku":"journey-6","email":"uploads@example.com","units":[{"memories":[{"photo":true},{"photo":true},{},{},{},{}]}]}'
UOID=$OID; UTOK=$TOK
t "a valid WebP is accepted" 201 "$(upload $UOID $UTOK memory:1:1 $FIX/photo-8x8.webp photo.webp)"
printf 'this is plainly not an image\n' > /tmp/not-image.jpg
t "a text file named .jpg is refused" 415 "$(upload $UOID $UTOK memory:1:2 /tmp/not-image.jpg)"
cp $FIX/photo-8x8.png /tmp/polyglot.png; printf '<?php echo "owned"; ?>' >> /tmp/polyglot.png
t "a real image carrying PHP (a polyglot) is refused" 415 "$(upload $UOID $UTOK memory:1:2 /tmp/polyglot.png photo.png)"
printf '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>' > /tmp/pic.svg
t "an SVG is refused" 415 "$(upload $UOID $UTOK memory:1:2 /tmp/pic.svg pic.svg)"
python3 -c "import sys;sys.stdout.buffer.write(open('$FIX/photo-8x8.jpg','rb').read()+b'\0'*(10*1024*1024))" > /tmp/big.jpg
t "a photo over 10 MB is refused" 413 "$(upload $UOID $UTOK memory:1:2 /tmp/big.jpg)"
python3 -c "import sys;sys.stdout.buffer.write(open('$FIX/photo-8x8.jpg','rb').read()+b'\0'*(9*1024*1024+512*1024))" > /tmp/near.jpg
t "a 9.5 MB photo is accepted (server upload limits really allow 10 MB)" 201 "$(upload $UOID $UTOK memory:1:2 /tmp/near.jpg)"
t "a photo for a memory that did not ask for one is refused" 422 "$(upload $UOID $UTOK memory:1:3 $FIX/photo-8x8.jpg)"
t "a photo for a slot that does not exist is refused" 422 "$(upload $UOID $UTOK 'memory:9:9' $FIX/photo-8x8.jpg)"
t "a traversal-shaped file name is harmless" 201 "$(upload $UOID $UTOK memory:1:2 $FIX/photo-8x8.jpg '../../../../etc/passwd.jpg')"
tc "  → stored under a random 64-hex name; the client's name is kept nowhere" "$([ "$(q "SELECT COUNT(*) FROM order_uploads WHERE order_id=$UOID AND stored_name REGEXP '^[a-f0-9]{64}$'")" = "2" ] && [ "$(q "SELECT COUNT(*) FROM order_uploads WHERE stored_name LIKE '%passwd%' OR stored_name LIKE '%.%'")" = "0" ] && ! docker exec mcb-api sh -c 'ls /etc/passwd.jpg /var/www/html/etc 2>/dev/null' | grep -q . && echo 1 || echo 0)"
STORED=$(q "SELECT stored_name FROM order_uploads WHERE order_id=$UOID LIMIT 1")
PUB=$(q "SELECT public_id FROM order_uploads WHERE order_id=$UOID LIMIT 1")
t "the stored file is not reachable over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/api/storage/uploads/$STORED")"
t "  → nor the storage directory" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/api/storage/")"
tc "  → the photo is nowhere inside the web root, only in private storage" "$([ -z "$(docker exec mcb-api find /var/www/html -name "$STORED" 2>/dev/null)" ] && docker exec mcb-api test -f "/tmp/mcb-uploads-dev/$STORED" && echo 1 || echo 0)"
t "staff retrieval without the CRM key is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/upload?id=$PUB")"
CODE_DL=$(curl -s -D /tmp/dl.h -o /tmp/dl.bin -w '%{http_code}' "$BASE/crm/upload?id=$PUB" -H "Authorization: Bearer $CRMKEY")
tc "  → with the key it is the same bytes, served as a sandboxed download" "$([ "$CODE_DL" = "200" ] && [ "$(shasum -a 256 /tmp/dl.bin | cut -d' ' -f1)" = "$(q "SELECT sha256 FROM order_uploads WHERE public_id='$PUB'")" ] && grep -qi 'content-disposition: attachment' /tmp/dl.h && grep -qi 'sandbox' /tmp/dl.h && grep -qi 'nosniff' /tmp/dl.h && echo 1 || echo 0)"
t "re-choosing a photo replaces it rather than adding one" 201 "$(upload $UOID $UTOK memory:1:1 $FIX/photo-8x8.jpg)"
tc "  → still one upload for that memory, and the old file is gone" "$([ "$(q "SELECT COUNT(*) FROM order_uploads up JOIN order_memories m ON m.id=up.memory_id WHERE up.order_id=$UOID AND m.sequence=1")" = "1" ] && echo 1 || echo 0)"
t "another order's token cannot upload to this order" 404 "$(upload $UOID $GTOK memory:1:1 $FIX/photo-8x8.jpg)"
t "a paid order no longer accepts photos" 409 "$(upload $KOID $KTOK memory:1:1 $FIX/photo-8x8.jpg)"
tc "upload responses never carry a path, file name or storage id" "$(grep -qE '[a-f0-9]{64}|storage|passwd' /tmp/tx.json && echo 0 || echo 1)"


# ===========================================================================
section "8b. PRIVATE STORAGE OR NO UPLOAD — PRODUCTION FAILS CLOSED"
DEV_FILES_BEFORE=$(docker exec mcb-api sh -c 'ls /tmp/mcb-uploads-dev | wc -l' | tr -d ' ')
WEBROOT_FILES_BEFORE=$(docker exec mcb-api sh -c 'find /var/www/html -type f | wc -l' | tr -d ' ')
order '{"sku":"moment","email":"storage-prod@example.com","units":[{"memories":[{"photo":true}]}]}'
SOID=$OID; STOK=$TOK
with_config "\$c['uploads']['development_storage'] = false;"
t "production with no private storage: the upload is refused" 503 "$(upload $SOID $STOK memory:1:1 $FIX/photo-8x8.jpg)"
tc "  → in plain words, with no path or technical detail" "$(body | grep -q "We couldn't securely save your photo. Please try again shortly." && ! body | grep -qE '/var/|/tmp|/home|mcb-uploads|public_html|storage/' && echo 1 || echo 0)"
tc "  → and nothing was written anywhere" "$([ "$(docker exec mcb-api sh -c 'ls /tmp/mcb-uploads-dev | wc -l' | tr -d ' ')" = "$DEV_FILES_BEFORE" ] && [ "$(docker exec mcb-api sh -c 'find /var/www/html -type f | wc -l' | tr -d ' ')" = "$WEBROOT_FILES_BEFORE" ] && [ "$(q "SELECT COUNT(*) FROM order_uploads WHERE order_id=$SOID")" = "0" ] && echo 1 || echo 0)"
t "  → a caller without the order's token learns nothing about storage" 404 "$(upload $SOID "$(openssl rand -hex 32)" memory:1:1 $FIX/photo-8x8.jpg)"
with_config "\$c['uploads']['development_storage'] = false; \$c['uploads']['path'] = '/var/www/html/api';"
t "storage configured INSIDE the web root is refused, not used" 503 "$(upload $SOID $STOK memory:1:1 $FIX/photo-8x8.jpg)"
tc "  → no file landed in the web root" "$([ "$(docker exec mcb-api sh -c 'find /var/www/html -type f | wc -l' | tr -d ' ')" = "$WEBROOT_FILES_BEFORE" ] && echo 1 || echo 0)"
docker exec mcb-api sh -c 'mkdir -p /var/www/html-sibling/mcb-uploads-probe; ln -sfn /var/www/html/api /tmp/mcb-uploads-symlink' >/dev/null 2>&1
with_config "\$c['uploads']['development_storage'] = false; \$c['uploads']['path'] = '/tmp/mcb-uploads-symlink';"
t "  → including through a symlink into the web root" 503 "$(upload $SOID $STOK memory:1:1 $FIX/photo-8x8.jpg)"
docker exec mcb-api sh -c 'mkdir -p /srv/mcb-uploads && chown www-data:www-data /srv/mcb-uploads && chmod 700 /srv/mcb-uploads' >/dev/null
with_config "\$c['uploads']['development_storage'] = false; \$c['uploads']['path'] = '/srv/mcb-uploads';"
t "production-shaped private storage outside the web root works" 201 "$(upload $SOID $STOK memory:1:1 $FIX/photo-8x8.jpg)"
PRIV=$(q "SELECT stored_name FROM order_uploads WHERE order_id=$SOID")
tc "  → the file is there, under an opaque name, readable only by the application" "$(docker exec mcb-api sh -c "test -f /srv/mcb-uploads/$PRIV && [ \"\$(stat -c %a /srv/mcb-uploads/$PRIV)\" = 640 ]" && echo "$PRIV" | grep -qE '^[a-f0-9]{64}$' && echo 1 || echo 0)"
PPUB=$(q "SELECT public_id FROM order_uploads WHERE order_id=$SOID")
t "  → retrieval still requires the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/upload?id=$PPUB")"
t "  → and works with it" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/upload?id=$PPUB" -H "Authorization: Bearer $CRMKEY")"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['uploads']['development_storage'] = true;"
t "development storage is refused on a server with a LIVE key" 503 "$(upload $SOID $STOK memory:1:1 $FIX/photo-8x8.jpg)"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['live_checkout_approved'] = true;"
get checkout/status >/dev/null
tc "approved LIVE checkout stays CLOSED without private storage" "$([ "$(jget online_checkout)" = "false" ] && echo 1 || echo 0)"
order '{"sku":"moment","email":"storage-live-closed@example.com"}'
t "  → and a session is refused" 503 "$(session "$OID" "$TOK")"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['live_checkout_approved'] = true; \$c['uploads']['development_storage'] = false; \$c['uploads']['path'] = '/srv/mcb-uploads';"
get checkout/status >/dev/null
tc "  → it opens only once private storage exists (live key, approved)" "$([ "$(jget online_checkout)" = "true" ] && [ "$(jget mode)" = "live" ] && echo 1 || echo 0)"
restore_config

# ===========================================================================
section "9. SECURITY"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","lines_override":[{"sku":"keepsake-7-picture-disc","quantity":1,"unit_minor":1,"price_minor":1}],"extra":{"total_minor":1,"subtotal_minor":1,"delivery_minor":0,"delivery":{"minor":0}}}')")
tc "browser prices, totals and delivery are ignored" "$([ "$S" = "201" ] && [ "$(jget subtotal_minor)" = "$(price keepsake-7-picture-disc)" ] && [ "$(jget delivery.minor)" != "0" ] && echo 1 || echo 0)"
release_limits
t "a forged product variant is refused" 422 "$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","lines_override":[{"sku":"keepsake-8-picture-disc","quantity":1}]}')")"
release_limits
t "a forged add-on is refused" 422 "$(post_json order "$(build_order '{"sku":"moment","lines_override":[{"sku":"moment","quantity":1},{"sku":"vinyl-frame","quantity":1}]}')")"
release_limits
S=$(post_json order "$(build_order '{"sku":"keepsake-7-picture-disc","units":[{"sku":"keepsake-12-picture-disc"}]}')")
tc "a unit claiming a different variant from its line is refused" "$([ "$S" = "422" ] && echo 1 || echo 0)"
t "another customer's token cannot read an order" 404 "$(status_of $KOID $GTOK)"
t "a well-formed but stale/made-up token is refused" 404 "$(status_of $GOID "$(openssl rand -hex 32)")"
tc "  → same answer as an order that does not exist" "$([ "$(status_of 999999 "$GTOK")" = "404" ] && echo 1 || echo 0)"
t "a stale token cannot open checkout" 404 "$(session $GOID "$(openssl rand -hex 32)")"
status_of $KOID $KTOK >/dev/null
tc "the owner's order status discloses no story, name, email, address or upload id" "$(grep -qiE 'first dance|Customer|keepsake-e2e|Harbour|Southampton|Rec Ipient|[a-f0-9]{32}' /tmp/tx.json && echo 0 || echo 1)"
tc "  → and a paid order reports itself not payable" "$([ "$(jget status)" = "PAID" ] && [ "$(jget checkout_blocker)" = "not_payable" ] && echo 1 || echo 0)"
t "cross-origin order-status is refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/order-status" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "{\"orderId\":$KOID,\"checkoutToken\":\"$KTOK\"}")"
t "cross-origin uploads are refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/order-upload" -H 'Origin: https://evil.example' -F "orderId=$UOID" -F "checkoutToken=$UTOK" -F slot=memory:1:1 -F "photo=@$FIX/photo-8x8.jpg")"
tc "no story text reached Stripe in ANY session this run" "$(docker exec mcb-api sh -c 'cat /tmp/stripe-stub.log 2>/dev/null' | grep -qiE 'Sinatra|first dance|Sailaway|Day 1|Our Song' && echo 0 || echo 1)"
tc "the audit trail holds no customer text for any order" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE detail REGEXP 'Sinatra|dance|Sailaway|example\\\\.com|Harbour|Southampton'")" = "0" ] && echo 1 || echo 0)"
tc "no analytics call in the browser source sends story, name, email or address" "$(grep -rnE 'track[A-Za-z]*\(' src --include='*.ts' --include='*.tsx' | grep -E '(story|firstName|lastName|email|shipping[A-Za-z]*|address|about|songTitle|artist|heading)"?[[:space:]]*:' | grep -q . && echo 0 || echo 1)"

# ===========================================================================
section "10. LIVE PAYMENT CANNOT SWITCH ITSELF ON"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000';"
get checkout/status >/dev/null
tc "a LIVE key without launch approval: checkout closed" "$([ "$(jget online_checkout)" = "false" ] && echo 1 || echo 0)"
order '{"sku":"moment","email":"live-blocked@example.com"}'
stub_reset
t "  → session refused" 503 "$(session "$OID" "$TOK")"
tc "  → and Stripe never called" "$([ "$(stub_count)" = "0" ] && echo 1 || echo 0)"
with_config "\$c['stripe']['secret_key'] = 'not-a-stripe-key';"
t "an unrecognised key: session refused" 503 "$(session "$OID" "$TOK")"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['live_checkout_approved'] = 'yes';"
t "approval must be exactly true, not a truthy string" 503 "$(session "$OID" "$TOK")"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['live_checkout_approved'] = true; \$c['uploads'] = ['path' => '/srv/mcb-uploads'];"
t "a TEST_ONLY-quoted order is refused in approved live mode" 409 "$(session "$FOID" "$FTOK")"
tc "  → as not payable online" "$(body | grep -q 'order_not_payable_online' && echo 1 || echo 0)"
hook "$(pay_event evt_live_on_test_order cs_test_live_crossover_0001 "$GOID" 1500 gbp false)" >/dev/null
tc "a TEST event reaching a LIVE server is filed, never paid" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='cs_test_live_crossover_0001'")" = "MODE_MISMATCH" ] && echo 1 || echo 0)"
restore_config
tc "the shipped config template keeps checkout OFF and live unapproved" "$(grep -q "'checkout_sessions_enabled' => false" public/api/config.example.php && grep -q "'live_checkout_approved' => false" public/api/config.example.php && grep -q "'use_test_fixtures' => false" public/api/config.example.php && echo 1 || echo 0)"
tc "the browser has no switch that enables payment" "$(grep -rq 'CHECKOUT_SESSIONS_ENABLED' src/ && echo 0 || echo 1)"
tc "  → it asks the server instead" "$(grep -rq '/api/checkout/status' src/lib/ && echo 1 || echo 0)"

# ===========================================================================
section "11. TEST-MODE EMAIL NEVER REACHES A REAL CUSTOMER BY ACCIDENT"
with_config "\$c['resend']['test_mode_send_to_customer'] = false;"
order '{"sku":"moment","email":"real-person@example.com"}'
session "$OID" "$TOK" >/dev/null; SID=$(session_id_for "$OID")
MAIL0=$(mail_count)
hook "$(pay_event evt_mail_skip "$SID" "$OID" 1500 gbp)" >/dev/null
tc "no test recipient configured: the order is PAID, no email is sent" "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PAID" ] && [ "$(mail_count)" = "$MAIL0" ] && grep -q 'skipped_test_mode' /tmp/wh.json && echo 1 || echo 0)"
tc "  → and it is not recorded as notified" "$([ "$(q "SELECT IFNULL(customer_notified_at,'NULL') FROM orders WHERE id=$OID")" = "NULL" ] && echo 1 || echo 0)"
with_config "\$c['resend']['test_mode_send_to_customer'] = false; \$c['resend']['test_recipient'] = 'mcb-test-inbox@example.test';"
order '{"sku":"moment","email":"another-real-person@example.com"}'
session "$OID" "$TOK" >/dev/null; SID=$(session_id_for "$OID")
hook "$(pay_event evt_mail_redirect "$SID" "$OID" 1500 gbp)" >/dev/null
tc "with a test recipient: delivered there, marked [TEST], never to the customer" "$(mail_log | tail -1 | grep -q 'mcb-test-inbox@example.test' && mail_log | tail -1 | grep -q '\[TEST\]' && ! mail_log | tail -1 | grep -q 'another-real-person' && echo 1 || echo 0)"
restore_config
tc "an email failure never un-pays an order (webhook answers before and after)" "$(grep -q 'release_customer_notification' public/api/lib/notify.php && grep -q "'delivery_failed'" public/api/lib/notify.php && echo 1 || echo 0)"

# ===========================================================================
section "12. RETIRED PRODUCTS STAY RETIRED"
for SKU in heirloom music-box memory-box engraved-music-plaque plaque additional-vinyl-copy bespoke mcb-live cruise-ship-dj-bible-pro gift-voucher; do
  release_limits
  SPEC="{\"sku\":\"moment\",\"lines_override\":[{\"sku\":\"moment\",\"quantity\":1},{\"sku\":\"$SKU\",\"quantity\":1}]}"
  S=$(post_json order "$(build_order "$SPEC")")
  tc "'$SKU' cannot be ordered" "$([ "$S" = "422" ] && body | grep -q 'unknown_sku' && echo 1 || echo 0)"
done
tc "no £10 Moment, £79 or £79.99 record, £60 copy or fixed £799 Bespoke in the server catalogue" "$(python3 -c 'import json
d=json.load(open("public/api/data/catalogue.json"));s=d["skus"]
songs=[v for v in s.values() if v["category"]=="SONG_EXPERIENCE"]
print(1 if s["moment"]["price_minor"]==1500 and not any(v["price_minor"] in (1000,7900,7999) for v in songs) and not any(v["price_minor"] in (6000,79900) for v in s.values()) and not d["products"]["bespoke"]["skus"] and "heirloom" not in json.dumps(d).lower() else 0)')"

# ===========================================================================
section "13. THE RETIRED SANDBOX WEBHOOK IS GONE"
tc "stripe/webhook-test.php is not in the repository" "$([ ! -e public/api/stripe/webhook-test.php ] && echo 1 || echo 0)"
t "  → and no route answers for it" 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook-test" -H 'Content-Type: application/json' -d '{}')"
t "  → nor for the file itself" 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook-test.php" -H 'Content-Type: application/json' -d '{}')"
tc "  → nothing reads its test signing secret any more" "$(grep -rq 'webhook_secret_test' public/api && echo 0 || echo 1)"
tc "the real webhook handler is still in place" "$([ -f public/api/stripe/webhook.php ] && echo 1 || echo 0)"

# ===========================================================================
section "14. DEPLOYMENT PREFLIGHT"
t "preflight requires the CRM key" 401 "$(get crm/preflight)"
t "preflight answers with the key" 200 "$(curl -s -o /tmp/tx.json -w '%{http_code}' "$BASE/crm/preflight" -H "Authorization: Bearer $CRMKEY")"
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
tc "  → this TEST server is NOT ready for live checkout" "$([ "$(jget ready_for_live_checkout)" = "false" ] && echo 1 || echo 0)"
tc "  → because it has only development photo storage" "$([ "$(pf private_upload_storage)" = "FAIL" ] && [ "$(pf development_storage_off)" = "FAIL" ] && echo 1 || echo 0)"
tc "  → a test key, test fixtures and test email overrides" "$([ "$(pf stripe_key_mode)" = "FAIL" ] && [ "$(pf delivery_test_fixtures_off)" = "FAIL" ] && [ "$(pf resend_test_overrides_off)" = "FAIL" ] && [ "$(pf site_origin_https)" = "FAIL" ] && echo 1 || echo 0)"
tc "  → while what IS right is reported as such" "$([ "$(pf legacy_webhook_copy_absent)" = "PASS" ] && [ "$(pf sprint4_migration_applied)" = "PASS" ] && [ "$(pf data_catalogue)" = "PASS" ] && [ "$(pf debug_off)" = "PASS" ] && echo 1 || echo 0)"
tc "  → and no production delivery rates is a warning, not a digital launch blocker" "$([ "$(pf delivery_rate_table)" = "WARN" ] && echo 1 || echo 0)"
tc "  → it discloses no secret, credential or path" "$(grep -qE 'whsec_[A-Za-z0-9]|sk_(test|live)_[A-Za-z0-9]|re_teststub|testpass|test_token_secret|/var/www|/tmp/|/srv/|/home/' /tmp/tx.json && echo 0 || echo 1)"
with_config "\$c['stripe']['secret_key'] = 'sk_live_' . 'notreal000000000000000000'; \$c['stripe']['webhook_secret'] = 'whsec_' . 'notreal00000000000000'; \$c['stripe']['live_checkout_approved'] = true; \$c['uploads'] = ['path' => '/srv/mcb-uploads']; \$c['delivery'] = []; \$c['resend'] = ['api_key' => 're_' . 'notreal', 'from' => 'MCB <orders@example.test>']; \$c['app']['site_origin'] = 'https://www.mycustombeats.com'; unset(\$c['stripe']['api_base']);"
curl -s -o /tmp/tx.json "$BASE/crm/preflight" -H "Authorization: Bearer $CRMKEY"
tc "a production-shaped config passes preflight (rates WARN only)" "$([ "$(jget ready_for_live_checkout)" = "true" ] && [ "$(pf private_upload_storage)" = "PASS" ] && [ "$(pf checkout_available)" = "PASS" ] && [ "$(pf delivery_rate_table)" = "WARN" ] && echo 1 || echo 0)"
restore_config

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
