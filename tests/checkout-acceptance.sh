#!/bin/bash
# MCB CANONICAL CATALOGUE & DYNAMIC CHECKOUT — acceptance tests against a live
# PHP + MariaDB stack.
#
# Runs against the same throwaway containers as api-acceptance.sh, with
# `stripe.checkout_sessions_enabled` turned ON in the TEST config only and
# `stripe.api_base` pointed at tests/stripe-stub.php.
#
# NO REQUEST EVER REACHES STRIPE. There is no real secret key, test-mode or
# otherwise, and the stub is a local file. A test run cannot create anything
# in a Stripe account.
#
# WHAT IS BEING PROVED: the browser chooses SKUs and integer quantities and
# nothing else; the server prices them from the generated catalogue; an order
# submission is idempotent; checkout is authorised by a secret token and built
# from the SAVED lines; and a payment marks an order PAID only when the exact
# amount, currency and order identifiers agree.

BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then printf "  PASS  %-66s [%s]\n" "$name" "$got"; PASS=$((PASS+1));
  else printf "  FAIL  %-66s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
tc() { local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-66s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-66s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }

CONSENT_BLOCK='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true,"CREATIVE_AUTHORITY":true},"creativeAuthorityVersion":"2026-09-15","termsVersion":"2026-09-09.4","cruiseCompanions":"My husband David"'
ADDR='"shippingName":"Cs Tester","shippingAddress":"1 Test St","shippingCity":"London","shippingPostcode":"E1 1AA","shippingCountry":"United Kingdom"'
CRMKEY="test_crm_key_not_real_000000000000000000000"

q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }

# ---- Canonical catalogue ----------------------------------------------
# Expected amounts are READ from the generated server catalogue. Section 1
# separately pins that file to the authorised numbers, once.
CATALOGUE=public/api/data/catalogue.json
price() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["skus"][sys.argv[2]]["price_minor"])' "$CATALOGUE" "$1"; }
sku_name() { python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["skus"][sys.argv[2]]["name"])' "$CATALOGUE" "$1"; }
dec() { python3 -c 'import sys;m=int(sys.argv[1]);print("%d.%02d"%(m//100,m%100))' "$1"; }
idem() { echo "test-$(openssl rand -hex 16)"; }

# ---- Rate limits ---------------------------------------------------------
# Ten orders and twenty checkout snapshots an hour per source. This suite
# makes far more of both from one address, so the attribution is released
# before each call. That the order limiter fires is proved in
# hardening-acceptance.sh; the checkout limiter is proved in SECURITY below.
release_order_limit()    { q "UPDATE order_consents SET ip_hash = NULL" >/dev/null 2>&1; }
release_checkout_limit() { q "UPDATE checkout_sessions SET ip_hash = NULL" >/dev/null 2>&1; }

# Sends exactly what it is given, with a fresh Idempotency-Key unless IDEM is set.
post_raw() { curl -s -o /tmp/c.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "Idempotency-Key: ${IDEM:-$(idem)}" -d "$2"; }
body() { cat /tmp/c.json; }
jget() { python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."):
    d=d[int(k)] if isinstance(d,list) else d.get(k)
print("null" if d is None else (json.dumps(d) if isinstance(d,(dict,list,bool)) else d))' "${2:-/tmp/c.json}" "$1" 2>/dev/null; }

# An order body: $1 email, $2 lines JSON array, $3 extra fields (leading comma).
# Per-memory personalisation matching the lines, as /create sends it — emitted
# only when the lines are a personalisable order (one song experience; several
# units only for Keepsakes). Otherwise nothing, and the order is recorded
# NOT_PROVIDED, which checkout refuses. Priority Replacement is chosen for the
# first N Keepsakes; each frame shows the first song. No photos are promised.
pz() {
  python3 - "$1" "$CATALOGUE" <<'PY'
import json, sys
try:
    lines = json.loads(sys.argv[1])
    skus = json.load(open(sys.argv[2]))["skus"]
except Exception:
    sys.exit(0)
if not isinstance(lines, list):
    sys.exit(0)
qty = {}
for l in lines:
    if isinstance(l, dict) and isinstance(l.get("sku"), str) and isinstance(l.get("quantity"), int):
        qty[l["sku"]] = qty.get(l["sku"], 0) + l["quantity"]
songs = [s for s in qty if skus.get(s, {}).get("category") == "SONG_EXPERIENCE" and skus[s]["orderable"]]
if len(songs) != 1:
    sys.exit(0)
song = songs[0]; n = qty[song]
if skus[song]["product_id"] != "keepsake" and n != 1:
    sys.exit(0)
pr = qty.get("priority-replacement", 0)
units = [{"sku": song, "priorityReplacement": i < pr,
          # Keepsake and Journey artwork is created from a photograph: the first memory promises one.
          "memories": [{"story": "A story.", "style": {"choice": "MCB_CHOICE"}, "photo": m == 0 and skus[song]["product_id"] in ("keepsake", "journey")} for m in range(skus[song]["song_count"])]}
         for i in range(n)]
plaques = [{"songTitle": "Our Song", "artist": "The Band"} for _ in range(qty.get("personalised-music-plaque", 0))]
frames = [{"sku": s, "unit": 1, "memory": 1} for s in qty if s.startswith("lyrics-frame-") for _ in range(qty[s])]
print(',"personalisation":' + json.dumps({"units": units, "plaques": plaques, "frames": frames}, separators=(",", ":")), end="")
PY
}
order_body() { printf '{%s,"firstName":"Cs","lastName":"Tester","email":"%s","whatsapp":"+447000000123","lines":%s,%s,"story":"A story."%s%s}' "$CONSENT_BLOCK" "$1" "$2" "$ADDR" "$(pz "$2")" "$3"; }
# Places an order and sets MK_OID / MK_TOK / MK_CODE. Not for use inside $( ).
mkorder() {
  release_order_limit
  MK_CODE=$(post_raw order "$(order_body "$1" "$2" "$3")")
  cp /tmp/c.json /tmp/o.json
  MK_OID=$(jget order_id /tmp/o.json); MK_TOK=$(jget checkout_token /tmp/o.json)
  # Upload an artwork-ready photograph for every memory slot the order expects.
  for slot in $(python3 -c 'import json;print(" ".join(s for s in (json.load(open("/tmp/o.json")).get("missing_uploads") or []) if s.startswith("memory:")))' 2>/dev/null); do
    release_order_limit
    q "UPDATE order_uploads SET ip_hash = NULL" >/dev/null 2>&1
    curl -s -o /dev/null -X POST "$BASE/order-upload" -H "Origin: $ORIGIN" -F "orderId=$MK_OID" -F "checkoutToken=$MK_TOK" -F "slot=$slot" -F "photo=@tests/fixtures/photo-2500.jpg;filename=photo.jpg"
  done
}
L() { printf '[{"sku":"%s","quantity":%s}]' "$1" "${2:-1}"; }
order_minor() { q "SELECT total_minor FROM orders WHERE id=$1"; }
count_orders() { q "SELECT COUNT(*) FROM orders"; }

session() { # $1 order id, $2 token, $3 extra fields (leading comma)
  release_checkout_limit
  post_raw checkout/session "{\"orderId\":$1,\"checkoutToken\":\"$2\"$3}"
}

stub() { docker exec mcb-api sh -c "echo '$1' > /tmp/stripe-mode"; }
stub_log() { docker exec mcb-api sh -c 'cat /tmp/stripe-stub.log 2>/dev/null'; }
stub_count() { docker exec mcb-api sh -c 'grep -c "" /tmp/stripe-stub.log 2>/dev/null || echo 0' | tr -d ' '; }
stub_reset() { docker exec mcb-api sh -c 'rm -f /tmp/stripe-stub.log'; }
last_params() { stub_log | tail -1; }
# "quantity:unit_amount" for every line item Stripe was last sent …
sent_lines() { last_params | python3 -c 'import json,sys
p=json.loads(sys.stdin.read())["params"]
print(",".join("%s:%s:%s" % (l["quantity"], l["price_data"]["unit_amount"], l["price_data"]["currency"]) for l in p["line_items"]))' 2>/dev/null; }
# … and the same for the order's saved lines.
saved_lines() { q "SELECT CONCAT(quantity,':',unit_minor,':gbp') FROM order_items WHERE order_id=$1 ORDER BY id" | paste -sd, -; }
sent_field() { last_params | python3 -c 'import json,sys
d=json.loads(sys.stdin.read())["params"]
for k in sys.argv[1].split("."): d=d.get(k) if isinstance(d,dict) else None
print("" if d is None else d)' "$1" 2>/dev/null; }

SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local sig=$(printf '%s.%s' "$ts" "$1" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
hook() { curl -s -o /tmp/w.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$1")" -d "$1"; }
wbody() { cat /tmp/w.json; }
# event EVT TYPE SESSION CLIENT_REF PAYMENT_STATUS AMOUNT|none CURRENCY [METADATA_ORDER]
event() {
  python3 - "$@" <<'PY'
import json, sys
a = sys.argv[1:]
o = {"id": a[2], "object": "checkout.session", "client_reference_id": a[3],
     "payment_intent": "pi_" + a[2], "payment_status": a[4], "currency": a[6]}
if a[5] != "none":
    o["amount_total"] = int(a[5])
if len(a) > 7 and a[7] != "":
    o["metadata"] = {"mcb_order_id": a[7]}
# Genuine Stripe events always say which mode they were made in; the
# test server holds a test key, so its events are livemode false.
print(json.dumps({"id": a[0], "type": a[1], "livemode": False, "data": {"object": o}}, separators=(",", ":")))
PY
}
unrec() { q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$1'"; }

stub ok
stub_reset

echo "================ 0. FLAGS & DORMANCY ================"
tc "1. shipped config template keeps checkout sessions OFF" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "1. no browser switch can open checkout; the server decides and ships closed" \
  "$(! grep -rq 'CHECKOUT_SESSIONS_ENABLED' src/ && grep -q '/api/checkout/status' src/lib/orderApi.ts && grep -q "'live_checkout_approved' => false" public/api/config.example.php && echo 1 || echo 0)"
tc "20. no Stripe secret anywhere in browser source" \
  "$(grep -rqE 'sk_(live|test)_[A-Za-z0-9]' src/ index.html 2>/dev/null && echo 0 || echo 1)"
tc "22. no browser source calls the Stripe API host" \
  "$(grep -rq 'api\.stripe\.com' src/ 2>/dev/null && echo 0 || echo 1)"
tc "the ops notification is dormant in the shipped template" \
  "$(grep -A2 "'operations'" public/api/config.example.php | grep -q "'order_paid_webhook_url'    => ''" && echo 1 || echo 0)"

echo ""
echo "================ 1. THE CATALOGUE CARRIES THE AUTHORISED PRICES ================"
tc "authorised price table: every orderable SKU at its approved price" "$(python3 - <<'PY'
import json
d = json.load(open("public/api/data/catalogue.json"))
skus = d["skus"]
authorised = {
    "moment": 1500,
    "keepsake-12-picture-disc": 14999, "keepsake-10-picture-disc": 13999,
    "keepsake-10-heart-picture-disc": 12999, "keepsake-7-picture-disc": 9900,
    "journey-6": 19900, "journey-12": 34900,
    "personalised-music-plaque": 4999,
    "lyrics-frame-10x15": 4999, "lyrics-frame-12x18": 6999, "lyrics-frame-14x21": 7999,
    "lyrics-frame-16x24": 8999, "lyrics-frame-20x30": 9999,
    "vintage-smartphone-gramophone": 10000, "antique-brass-gramophone": 100000,
    "portable-suitcase-record-player": 20000, "priority-replacement": 1999,
    "artwork-preparation": 1500,
    "memory-music-video": 4900,
}
orderable = {k for k, v in skus.items() if v.get("orderable") is True}
ok = orderable == set(authorised) and all(
    skus[k]["price_minor"] == v and isinstance(skus[k]["price_minor"], int) and skus[k]["currency"] == "GBP"
    for k, v in authorised.items())
print(1 if ok else 0)
PY
)"
tc "  → the Cruise Ship DJ Bible is priced but NOT orderable" "$(python3 - <<'PY'
import json
s = json.load(open("public/api/data/catalogue.json"))["skus"]
want = {"cruise-ship-dj-bible-beginner": 39999, "cruise-ship-dj-bible-experienced": 50000, "cruise-ship-dj-bible-pro": 59999}
print(1 if all(s[k]["price_minor"] == v and s[k]["orderable"] is False for k, v in want.items()) else 0)
PY
)"
tc "  → Bespoke, MCB LIVE and gift vouchers have no SKU at all" "$(python3 - <<'PY'
import json
d = json.load(open("public/api/data/catalogue.json"))
print(1 if all(p in d["products"] and not any(v["product_id"] == p for v in d["skus"].values())
               for p in ("bespoke", "mcb-live", "gift-voucher")) else 0)
PY
)"
tc "  → no retired product survives in the server catalogue" "$(python3 - <<'PY'
import json
d = json.load(open("public/api/data/catalogue.json"))
gone = ["heirloom", "cd", "mp3", "music-box-experience", "plaque", "vinyl-frame",
        "gift-pop-up-card-anniversary", "additional-vinyl-copy", "digital-player", "vinyl-12"]
print(1 if not any(g in d["skus"] or g in d["products"] for g in gone) else 0)
PY
)"
tc "  → the rules are the approved technical limits" "$(python3 - <<'PY'
import json
r = json.load(open("public/api/data/catalogue.json"))["rules"]
print(1 if r == {"max_lines": 20, "max_quantity_per_line": 50, "primary_category": "SONG_EXPERIENCE",
                 "priority_replacement_sku": "priority-replacement", "artwork_preparation_sku": "artwork-preparation",
                 "photo_artwork_product_ids": ["keepsake", "journey"], "artwork_photo_min_px": 2500,
                 "memory_video_sku": "memory-music-video", "memory_video_max_per_order": 1} else 0)
PY
)"
tc "  → only the four Keepsake variants are Priority Replacement eligible" "$(python3 - <<'PY'
import json
s = json.load(open("public/api/data/catalogue.json"))["skus"]
print(1 if {k for k, v in s.items() if v["priority_replacement_eligible"]} ==
      {"keepsake-12-picture-disc", "keepsake-10-picture-disc", "keepsake-10-heart-picture-disc", "keepsake-7-picture-disc"} else 0)
PY
)"
tc "  → catalogue.json is the generator's current output (--check)" \
  "$(node scripts/generate-catalogue-json.mjs --check >/dev/null 2>&1 && echo 1 || echo 0)"
tc "  → PHP has no second price table (no literal prices in lib or endpoints)" \
  "$(grep -rnE '\b(1500|14999|13999|12999|9900|19900|34900|1999)\b' public/api --include='*.php' 2>/dev/null | grep -v '_test-' | grep -q . && echo 0 || echo 1)"

echo ""
echo "================ 2. SERVER PRICES EVERY SONG EXPERIENCE ================"
for SKU in moment keepsake-12-picture-disc keepsake-10-picture-disc keepsake-10-heart-picture-disc keepsake-7-picture-disc journey-6 journey-12; do
  P=$(price "$SKU")
  mkorder "cs-price-$SKU@example.com" "$(L "$SKU")"
  # The goods are the catalogue price; the payable total adds the delivery the
  # SERVER quoted (a TEST_ONLY fixture in this suite, none for a Moment).
  tc "$SKU accepted and priced ${P} from the catalogue" \
    "$([ "$MK_CODE" = "201" ] && [ "$(jget lines.0.unit_minor /tmp/o.json)" = "$P" ] && [ "$(jget subtotal_minor /tmp/o.json)" = "$P" ] \
       && [ "$(jget total_minor /tmp/o.json)" = "$((P + $(jget delivery.minor /tmp/o.json)))" ] \
       && [ "$(q "SELECT CONCAT(unit_minor,'|',line_minor,'|',subtotal_minor,'|',total_minor - delivery_minor) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.id=$MK_OID")" = "$P|$P|$P|$P" ] && echo 1 || echo 0)"
done

PR=$(price priority-replacement); K7=$(price keepsake-7-picture-disc); LF=$(price lyrics-frame-10x15)
mkorder "cs-multi@example.com" '[{"sku":"keepsake-7-picture-disc","quantity":2},{"sku":"priority-replacement","quantity":2},{"sku":"lyrics-frame-10x15","quantity":1}]'
EXPECT=$((2*K7 + 2*PR + LF))
t "a multi-line order is accepted" 201 "$MK_CODE"
tc "  → Priority Replacement is priced ${PR} per unit" "$([ "$(jget lines.1.unit_minor /tmp/o.json)" = "$PR" ] && [ "$(jget lines.1.line_minor /tmp/o.json)" = "$((2*PR))" ] && echo 1 || echo 0)"
tc "  → subtotal is the exact integer sum of the lines ($EXPECT)" "$([ "$(jget subtotal_minor /tmp/o.json)" = "$EXPECT" ] && [ "$(q "SELECT subtotal_minor FROM orders WHERE id=$MK_OID")" = "$EXPECT" ] && echo 1 || echo 0)"
tc "  → payable total is subtotal plus the server-quoted delivery" "$([ "$(order_minor $MK_OID)" = "$((EXPECT + $(q "SELECT delivery_minor FROM orders WHERE id=$MK_OID")))" ] && [ "$(jget delivery.status /tmp/o.json)" = "QUOTED" ] && echo 1 || echo 0)"
tc "  → amount_gbp is the payable total, exact, never float-derived" "$([ "$(q "SELECT amount_gbp FROM orders WHERE id=$MK_OID")" = "$(dec $(order_minor $MK_OID))" ] && echo 1 || echo 0)"
tc "  → every line is saved with its product, category and fulfilment" \
  "$([ "$(q "SELECT CONCAT_WS('|',item_id,product_id,category,fulfilment,quantity) FROM order_items WHERE order_id=$MK_OID ORDER BY id" | paste -sd, -)" = "keepsake-7-picture-disc|keepsake|SONG_EXPERIENCE|PHYSICAL|2,priority-replacement|priority-replacement|PROTECTION|SERVICE|2,lyrics-frame-10x15|lyrics-frame|PERSONALISED_DECOR|PHYSICAL|1" ] && echo 1 || echo 0)"
tc "  → a name snapshot is stored for operators" "$([ "$(q "SELECT item_name FROM order_items WHERE order_id=$MK_OID AND item_id='keepsake-7-picture-disc'")" = "$(sku_name keepsake-7-picture-disc)" ] && echo 1 || echo 0)"
tc "  → orders.package is the song experience; format is NULL" "$([ "$(q "SELECT CONCAT(package,'|',IFNULL(format,'NULL')) FROM orders WHERE id=$MK_OID")" = "keepsake|NULL" ] && echo 1 || echo 0)"
MULTI_OID=$MK_OID; MULTI_TOK=$MK_TOK

echo ""
echo "================ 3. THE BROWSER CANNOT STATE A PRICE ================"
mkorder "cs-forged@example.com" '[{"sku":"journey-6","quantity":1,"price_minor":1,"unit_minor":1,"unit_amount":1,"line_minor":1,"currency":"USD"}]' \
  ',"price":1,"total":1,"total_minor":1,"amount":1,"amount_gbp":0.01,"unit_amount":1,"currency":"USD","displayCurrency":"INR"'
FORGED_OID=$MK_OID; FORGED_TOK=$MK_TOK
t "an order carrying price/total/unit_amount/currency is accepted" 201 "$MK_CODE"
tc "  → and those fields are IGNORED: the goods are the catalogue price" "$([ "$(q "SELECT subtotal_minor FROM orders WHERE id=$FORGED_OID")" = "$(price journey-6)" ] && [ "$(jget subtotal_minor /tmp/o.json)" = "$(price journey-6)" ] && [ "$(jget total_minor /tmp/o.json)" != "1" ] && echo 1 || echo 0)"
tc "  → the saved line is the catalogue's, in GBP" "$([ "$(q "SELECT CONCAT(unit_minor,'|',o.currency) FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.id=$FORGED_OID")" = "$(price journey-6)|GBP" ] && echo 1 || echo 0)"
stub_reset
S=$(session "$FORGED_OID" "$FORGED_TOK" ',"package":"moment","format":"mp3","lines":[{"sku":"antique-brass-gramophone","quantity":50}],"enhancements":[{"id":"vinyl-frame","quantity":1}],"price":1,"unit_amount":1,"amount":1,"total":1,"currency":"usd","line_items":[{"price":1}],"success_url":"https://evil.example/steal","customer_email":"attacker@evil.example"')
t "a session request carrying package/lines/amount/currency is accepted" 200 "$S"
tc "  → Stripe was sent the SAVED lines, not the requested ones" "$([ "$(sent_lines)" = "$(saved_lines $FORGED_OID)" ] && echo 1 || echo 0)"
tc "  → unit_amount unchanged by the request" "$([ "$(sent_field line_items)" != "" ] && last_params | grep -q "\"unit_amount\":\"$(price journey-6)\"" && ! last_params | grep -q '"unit_amount":"1"' && echo 1 || echo 0)"
tc "  → Stripe still received gbp, never usd" "$(last_params | grep -q '"currency":"gbp"' && ! last_params | grep -qi '"currency":"usd"' && echo 1 || echo 0)"
tc "  → the snapshot expects the saved total" "$([ "$(q "SELECT CONCAT(expected_minor,'|',currency) FROM checkout_sessions WHERE order_id=$FORGED_OID")" = "$(order_minor $FORGED_OID)|GBP" ] && echo 1 || echo 0)"
tc "  → a supplied success_url cannot override config" "$(last_params | grep -q 'thank-you' && ! last_params | grep -q 'evil.example' && echo 1 || echo 0)"
tc "  → a supplied customer_email cannot override the order's" "$([ "$(sent_field customer_email)" = "cs-forged@example.com" ] && echo 1 || echo 0)"

echo ""
echo "================ 4. UNKNOWN, RETIRED AND UNSOLD SKUs ================"
BEFORE=$(count_orders)
for SKU in heirloom cd music-box-experience plaque vinyl-frame gift-pop-up-card-anniversary additional-vinyl-copy digital-player keepsake bespoke mcb-live cruise-ship-dj-bible-pro; do
  release_order_limit
  S=$(post_raw order "$(order_body "cs-unknown@example.com" "$(L "$SKU")")")
  tc "'$SKU' refused as unknown_sku" "$([ "$S" = "422" ] && body | grep -q '"error":"unknown_sku"' && echo 1 || echo 0)"
done
release_order_limit
S=$(post_raw order "$(order_body "cs-unknown@example.com" '[{"sku":"moment","quantity":1},{"sku":"heirloom","quantity":1}]')")
tc "a retired SKU beside a valid one still refuses the whole order" "$([ "$S" = "422" ] && body | grep -q '"error":"unknown_sku"' && echo 1 || echo 0)"
tc "  → and none of those requests wrote an order" "$([ "$(count_orders)" = "$BEFORE" ] && echo 1 || echo 0)"

echo ""
echo "================ 5. QUANTITY AND LINE RULES ================"
qty_refused() { # $1 label, $2 raw quantity JSON
  release_order_limit
  local lines='[{"sku":"moment","quantity":'"$2"'}]'
  local payload; payload=$(order_body "cs-qty@example.com" "$lines")
  local s; s=$(post_raw order "$payload")
  tc "quantity $1 refused as invalid_quantity" "$([ "$s" = "422" ] && body | grep -q '"error":"invalid_quantity"' && echo 1 || echo 0)"
}
qty_refused 0 0
qty_refused 51 51
qty_refused '"2" (string)' '"2"'
qty_refused 2.5 2.5
qty_refused -1 -1
qty_refused true true
qty_refused null null
mkorder "cs-qty50@example.com" "$(L moment 50)"
tc "quantity 50 (the maximum) accepted and priced 50 × unit" "$([ "$MK_CODE" = "201" ] && [ "$(jget total_minor /tmp/o.json)" = "$((50*$(price moment)))" ] && echo 1 || echo 0)"
release_order_limit
S=$(post_raw order "$(order_body "cs-dup@example.com" '[{"sku":"moment","quantity":1},{"sku":"moment","quantity":1}]')")
tc "a duplicate SKU refused as duplicate_sku" "$([ "$S" = "422" ] && body | grep -q '"error":"duplicate_sku"' && echo 1 || echo 0)"
release_order_limit
MANY=$(python3 -c 'import json;print(json.dumps([{"sku":"moment","quantity":1}]*21))')
S=$(post_raw order "$(order_body "cs-many@example.com" "$MANY")")
tc "more than 20 lines refused as too_many_lines" "$([ "$S" = "422" ] && body | grep -q '"error":"too_many_lines"' && echo 1 || echo 0)"
release_order_limit
S=$(post_raw order "$(order_body "cs-noline@example.com" '[{"quantity":1}]')")
tc "a line with no sku refused as invalid_lines" "$([ "$S" = "422" ] && body | grep -q '"error":"invalid_lines"' && echo 1 || echo 0)"

release_order_limit
S=$(post_raw order "$(order_body "cs-plaque@example.com" "$(L personalised-music-plaque)")")
tc "a plaque alone refused as no_song_experience" "$([ "$S" = "422" ] && body | grep -q '"error":"no_song_experience"' && echo 1 || echo 0)"
release_order_limit
S=$(post_raw order "$(order_body "cs-player@example.com" '[{"sku":"portable-suitcase-record-player","quantity":1},{"sku":"lyrics-frame-20x30","quantity":1}]')")
tc "add-ons without any song experience refused" "$([ "$S" = "422" ] && body | grep -q '"error":"no_song_experience"' && echo 1 || echo 0)"
release_order_limit
S=$(post_raw order "$(order_body "cs-pronly@example.com" "$(L priority-replacement)")")
tc "Priority Replacement alone refused (no song experience)" "$([ "$S" = "422" ] && body | grep -q '"error":"no_song_experience"' && echo 1 || echo 0)"

echo ""
echo "---------------- MCB Priority Replacement ----------------"
pr_case() { # $1 label, $2 lines, $3 expected code, $4 expected error (or empty)
  release_order_limit
  local s; s=$(post_raw order "$(order_body "cs-pr@example.com" "$2")")
  if [ -n "$4" ]; then
    tc "$1" "$([ "$s" = "$3" ] && body | grep -q "\"error\":\"$4\"" && echo 1 || echo 0)"
  else
    tc "$1" "$([ "$s" = "$3" ] && echo 1 || echo 0)"
  fi
}
pr_case "accepted: 1 Keepsake + 1 Priority Replacement" '[{"sku":"keepsake-12-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":1}]' 201 ""
tc "  → the PR line is priced $PR" "$([ "$(jget lines.1.unit_minor /tmp/c.json)" = "$PR" ] && echo 1 || echo 0)"
pr_case "accepted: 3 Keepsakes + 2 Priority Replacement" '[{"sku":"keepsake-10-picture-disc","quantity":3},{"sku":"priority-replacement","quantity":2}]' 201 ""
pr_case "accepted: two Keepsake variants count together (1+1 vs 2)" '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"keepsake-10-heart-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":2}]' 201 ""
pr_case "refused: Journey only" '[{"sku":"journey-6","quantity":1},{"sku":"priority-replacement","quantity":1}]' 422 priority_replacement_ineligible
pr_case "refused: Journey 12 only" '[{"sku":"journey-12","quantity":2},{"sku":"priority-replacement","quantity":1}]' 422 priority_replacement_ineligible
pr_case "refused: Moment only" '[{"sku":"moment","quantity":1},{"sku":"priority-replacement","quantity":1}]' 422 priority_replacement_ineligible
pr_case "refused: more PR than Keepsakes (1 vs 2)" '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":2}]' 422 priority_replacement_ineligible
pr_case "refused: a gramophone does not make PR eligible" '[{"sku":"moment","quantity":1},{"sku":"antique-brass-gramophone","quantity":1},{"sku":"priority-replacement","quantity":1}]' 422 priority_replacement_ineligible

echo ""
echo "================ 6. DELIVERY ADDRESS FOLLOWS THE LINES ================"
addr_order() { # $1 email, $2 lines, $3 with address? (1/0)
  release_order_limit
  local a=""; [ "$3" = "1" ] && a=",$ADDR"
  post_raw order "{$CONSENT_BLOCK,\"firstName\":\"Ad\",\"lastName\":\"Dress\",\"email\":\"$1\",\"lines\":$2$a}"
}
S=$(addr_order cs-addr1@example.com "$(L keepsake-7-picture-disc)" 0)
tc "a Keepsake without an address is refused" "$([ "$S" = "422" ] && body | grep -q 'shippingAddress' && echo 1 || echo 0)"
S=$(addr_order cs-addr2@example.com "$(L moment)" 0)
tc "a Moment alone needs no address" "$([ "$S" = "201" ] && [ "$(jget fulfilment_type)" = "DIGITAL" ] && echo 1 || echo 0)"
tc "  → and no delivery row is written" "$([ "$(q "SELECT COUNT(*) FROM delivery_addresses WHERE order_id=$(jget order_id)")" = "0" ] && echo 1 || echo 0)"
S=$(addr_order cs-addr3@example.com '[{"sku":"moment","quantity":1},{"sku":"lyrics-frame-12x18","quantity":1}]' 0)
tc "Moment + lyrics frame without an address is refused" "$([ "$S" = "422" ] && body | grep -q 'shippingAddress' && echo 1 || echo 0)"
S=$(addr_order cs-addr4@example.com '[{"sku":"moment","quantity":1},{"sku":"lyrics-frame-12x18","quantity":1}]' 1)
tc "  → and accepted as PHYSICAL once supplied" "$([ "$S" = "201" ] && [ "$(jget fulfilment_type)" = "PHYSICAL" ] && echo 1 || echo 0)"
tc "  → with the address stored" "$([ "$(q "SELECT COUNT(*) FROM delivery_addresses WHERE order_id=$(jget order_id)")" = "1" ] && echo 1 || echo 0)"
tc "  → and the digital acknowledgement still required and recorded" "$([ "$(q "SELECT digital_content_ack FROM order_consents WHERE order_id=$(jget order_id)")" = "1" ] && echo 1 || echo 0)"
S=$(addr_order cs-addr5@example.com '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"priority-replacement","quantity":1}]' 0)
tc "a SERVICE line does not remove the Keepsake's address requirement" "$([ "$S" = "422" ] && echo 1 || echo 0)"

echo ""
echo "================ 7. ORDER IDEMPOTENCY ================"
release_order_limit
S=$(curl -s -o /tmp/c.json -w '%{http_code}' -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$(order_body cs-nokey@example.com "$(L moment)")")
tc "missing Idempotency-Key refused 400 idempotency_key_required" "$([ "$S" = "400" ] && body | grep -q '"error":"idempotency_key_required"' && echo 1 || echo 0)"
t "a too-short Idempotency-Key refused" 400 "$(IDEM=short post_raw order "$(order_body cs-nokey@example.com "$(L moment)")")"
t "an Idempotency-Key with illegal characters refused" 400 "$(IDEM='bad key with spaces!!' post_raw order "$(order_body cs-nokey@example.com "$(L moment)")")"
tc "  → none of those wrote an order" "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='cs-nokey@example.com'")" = "0" ] && echo 1 || echo 0)"

KEY1=$(idem)
BODY1=$(order_body cs-idem@example.com "$(L keepsake-12-picture-disc)")
release_order_limit
S1=$(IDEM=$KEY1 post_raw order "$BODY1"); cp /tmp/c.json /tmp/i1.json
release_order_limit
S2=$(IDEM=$KEY1 post_raw order "$BODY1"); cp /tmp/c.json /tmp/i2.json
t "first submission creates the order" 201 "$S1"
t "the identical retry answers 200" 200 "$S2"
tc "  → with the SAME order_id" "$([ -n "$(jget order_id /tmp/i1.json)" ] && [ "$(jget order_id /tmp/i1.json)" = "$(jget order_id /tmp/i2.json)" ] && echo 1 || echo 0)"
tc "  → flagged replayed:true" "$([ "$(jget replayed /tmp/i2.json)" = "true" ] && echo 1 || echo 0)"
tc "  → and the same total and lines" "$([ "$(jget total_minor /tmp/i1.json)" = "$(jget total_minor /tmp/i2.json)" ] && [ "$(jget lines /tmp/i1.json)" = "$(jget lines /tmp/i2.json)" ] && echo 1 || echo 0)"
tc "  → exactly ONE orders row for that customer" "$([ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='cs-idem@example.com'")" = "1" ] && echo 1 || echo 0)"
tc "  → only the key's hash is stored" "$([ "$(q "SELECT idempotency_key_hash = SHA2('$KEY1',256) FROM orders WHERE id=$(jget order_id /tmp/i1.json)")" = "1" ] && [ "$(q "SELECT COUNT(*) FROM orders WHERE idempotency_key_hash='$KEY1'")" = "0" ] && echo 1 || echo 0)"
TOKA=$(jget checkout_token /tmp/i1.json); TOKB=$(jget checkout_token /tmp/i2.json); IOID=$(jget order_id /tmp/i1.json)
# The Keepsake's artwork photograph arrives before checkout, as it would from /create.
release_order_limit; q "UPDATE order_uploads SET ip_hash = NULL" >/dev/null 2>&1
curl -s -o /dev/null -X POST "$BASE/order-upload" -H "Origin: $ORIGIN" -F "orderId=$IOID" -F "checkoutToken=$TOKB" -F "slot=memory:1:1" -F "photo=@tests/fixtures/photo-2500.jpg;filename=photo.jpg"
tc "  → the retry receives the SAME checkout token, so a lost first response strands nobody" "$([ ${#TOKB} = 64 ] && [ "$TOKA" = "$TOKB" ] && echo 1 || echo 0)"
tc "  → and the token itself is never stored, only its hash" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE checkout_token_hash='$TOKA'")" = "0" ] && [ "$(q "SELECT checkout_token_hash = SHA2('$TOKA',256) FROM orders WHERE id=$IOID")" = "1" ] && echo 1 || echo 0)"
t "  → that token opens checkout" 200 "$(session "$IOID" "$TOKB")"
release_order_limit
S3=$(IDEM=$KEY1 post_raw order "$(order_body cs-idem@example.com "$(L keepsake-10-picture-disc)")")
tc "the same key with a DIFFERENT body is refused 409 idempotency_conflict" "$([ "$S3" = "409" ] && body | grep -q '"error":"idempotency_conflict"' && echo 1 || echo 0)"
tc "  → and wrote nothing" "$([ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='cs-idem@example.com'")" = "1" ] && echo 1 || echo 0)"

KEY2=$(idem)
BODY2=$(order_body cs-race@example.com "$(L journey-12)")
release_order_limit
for n in 1 2; do
  curl -s -o /tmp/race$n.json -w '%{http_code}' -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "Idempotency-Key: $KEY2" -d "$BODY2" > /tmp/race$n.code &
done
wait
RC1=$(cat /tmp/race1.code); RC2=$(cat /tmp/race2.code)
tc "a concurrent double submit creates ONE order (codes $RC1/$RC2)" "$([ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='cs-race@example.com'")" = "1" ] && echo 1 || echo 0)"
tc "  → both requests answered successfully with the same order_id" \
  "$( { [ "$RC1$RC2" = "201200" ] || [ "$RC1$RC2" = "200201" ]; } && [ "$(jget order_id /tmp/race1.json)" = "$(jget order_id /tmp/race2.json)" ] && echo 1 || echo 0)"

echo ""
echo "================ 8. CHECKOUT SESSION AUTHORISATION ================"
mkorder "cs-victim@example.com" "$(L keepsake-12-picture-disc)"
VOID=$MK_OID; VTOK=$MK_TOK
mkorder "cs-attacker@example.com" "$(L moment)"
AOID=$MK_OID; ATOK=$MK_TOK
stub_reset
t "missing checkout token refused" 422 "$(session "$VOID" "")"
release_checkout_limit
t "checkout token absent entirely refused" 422 "$(post_raw checkout/session "{\"orderId\":$VOID}")"
t "malformed checkout token refused" 422 "$(session "$VOID" "not-a-token")"
release_checkout_limit
t "missing order id refused" 422 "$(post_raw checkout/session "{\"checkoutToken\":\"$VTOK\"}")"
t "17. a referral string cannot become the order id" 422 "$(session '"rinaldi"' "$VTOK")"
WRONG=$(openssl rand -hex 32)
S=$(session "$VOID" "$WRONG"); WRONG_BODY=$(body)
tc "a wrong token for a real order is 404 order_not_found" "$([ "$S" = "404" ] && echo "$WRONG_BODY" | grep -q '"error":"order_not_found"' && echo 1 || echo 0)"
S=$(session 99999999 "$WRONG"); UNKNOWN_BODY=$(body)
tc "an unknown order is the SAME 404, so existence is not disclosed" "$([ "$S" = "404" ] && [ "$WRONG_BODY" = "$UNKNOWN_BODY" ] && echo 1 || echo 0)"
S=$(session "$VOID" "$ATOK")
t "another customer's order id with YOUR token is 404" 404 "$S"
tc "  → the response names no customer" "$(body | grep -q 'cs-victim\|cs-attacker' && echo 0 || echo 1)"
tc "  → and Stripe received no request at all" "$([ "$(stub_count)" = "0" ] && echo 1 || echo 0)"
tc "  → so no payment page was pre-filled with the victim's email" "$(stub_log | grep -q 'cs-victim' && echo 0 || echo 1)"
tc "  → and no snapshot was written for the victim's order" "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$VOID")" = "0" ] && echo 1 || echo 0)"

echo ""
echo "================ 9. THE SESSION IS BUILT FROM THE SAVED LINES ================"
stub_reset
S=$(session "$MULTI_OID" "$MULTI_TOK")
t "a valid token opens checkout" 200 "$S"
tc "  → the response carries a Stripe session id and url" "$(body | grep -q '"id":"cs_test_' && body | grep -q '"url":"https://checkout.stripe.com/' && echo 1 || echo 0)"
tc "  → Stripe received one line item per saved line" "$([ "$(last_params | grep -o '"unit_amount"' | wc -l | tr -d ' ')" = "$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$MULTI_OID")" ] && echo 1 || echo 0)"
tc "  → every quantity, unit_amount and currency equals the saved lines" "$([ -n "$(saved_lines $MULTI_OID)" ] && [ "$(sent_lines)" = "$(saved_lines $MULTI_OID)" ] && echo 1 || echo 0)"
tc "36. → line item names come from the saved line names" "$(last_params | grep -qF "MCB $(sku_name keepsake-7-picture-disc)" && echo 1 || echo 0)"
tc "  → customer_email is the order's own email" "$([ "$(sent_field customer_email)" = "cs-multi@example.com" ] && echo 1 || echo 0)"
tc "13. → the snapshot expects exactly the order total, in GBP" "$([ "$(q "SELECT CONCAT(expected_minor,'|',expected_amount_gbp,'|',currency) FROM checkout_sessions WHERE order_id=$MULTI_OID")" = "$(order_minor $MULTI_OID)|$(dec "$(order_minor $MULTI_OID)")|GBP" ] && echo 1 || echo 0)"
tc "29. → the itemisation is snapshotted alongside it" "$(q "SELECT basket_lines FROM checkout_sessions WHERE order_id=$MULTI_OID" | grep -q 'priority-replacement' && echo 1 || echo 0)"
tc "16. → client_reference_id is the internal order id" "$([ "$(sent_field client_reference_id)" = "$MULTI_OID" ] && echo 1 || echo 0)"
tc "  → metadata.mcb_order_id agrees with it" "$([ "$(sent_field metadata.mcb_order_id)" = "$MULTI_OID" ] && echo 1 || echo 0)"
tc "18. → success_url carries {CHECKOUT_SESSION_ID} and points at /thank-you" "$(sent_field success_url | grep -q 'thank-you?session_id={CHECKOUT_SESSION_ID}' && echo 1 || echo 0)"
tc "19. → cancel_url stays on the MCB origin" "$(sent_field cancel_url | grep -q '^http://localhost:8080' && echo 1 || echo 0)"
tc "20. → Authorization header was sent (value never logged)" "$(last_params | grep -q '"authorization":"PRESENT"' && ! last_params | grep -q 'sk_test_stub' && echo 1 || echo 0)"
tc "→ metadata carries machine ids only, no story or contact" "$(sent_field metadata | grep -qiE 'story|cruise|whatsapp|London' && echo 0 || echo 1)"
tc "A8. the cruise companion never reaches Stripe" "$(last_params | grep -qi 'husband' && echo 0 || echo 1)"
tc "23. → the order is still PENDING after session creation" "$([ "$(q "SELECT status FROM orders WHERE id=$MULTI_OID")" = "PENDING" ] && echo 1 || echo 0)"
tc "C2. Stripe is NOT asked to collect a second shipping address" "$(last_params | grep -q 'shipping_address_collection' && echo 0 || echo 1)"
tc "C3. Stripe Adaptive Pricing is OFF: the customer pays the saved GBP amount, never a converted currency" "$(last_params | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];print(1 if p.get("adaptive_pricing",{}).get("enabled")=="false" else 0)')"
tc "C3.  → and no country allowlist can block an international customer" "$(last_params | grep -q 'allowed_countries' && echo 0 || echo 1)"
tc "C4. MCB's own delivery address is still collected and stored" "$(grep -q 'INSERT INTO delivery_addresses' public/api/order.php && echo 1 || echo 0)"
tc "C5. automatic tax remains off, so amount_total equals the saved total" "$(last_params | grep -q 'automatic_tax' && echo 0 || echo 1)"
tc "28. → the Stripe idempotency key is deterministic: mcb_<hash>_<attempt>" "$(last_params | grep -qE '"idempotency_key":"mcb_[a-f0-9]{64}_0"' && echo 1 || echo 0)"

echo ""
echo "---------------- reuse and expiry ----------------"
SID1=$(jget id)
stub_reset
S=$(session "$MULTI_OID" "$MULTI_TOK")
t "31. a repeated request answers 200" 200 "$S"
tc "31. → with the SAME session, flagged reused" "$([ "$(jget id)" = "$SID1" ] && [ "$(jget reused)" = "true" ] && echo 1 || echo 0)"
tc "31. → Stripe was not called again" "$([ "$(stub_count)" = "0" ] && echo 1 || echo 0)"
tc "31. → still ONE snapshot row for the order" "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$MULTI_OID")" = "1" ] && echo 1 || echo 0)"
q "UPDATE checkout_sessions SET stripe_expires_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE order_id=$MULTI_OID" >/dev/null
stub_reset
S=$(session "$MULTI_OID" "$MULTI_TOK")
SID2=$(jget id)
t "an EXPIRED session is replaced" 200 "$S"
tc "  → by a NEW session id" "$([ -n "$SID2" ] && [ "$SID2" != "$SID1" ] && [ "$(jget reused)" = "null" ] && echo 1 || echo 0)"
tc "  → Stripe was called once, with attempt 1 in the idempotency key" "$([ "$(stub_count)" = "1" ] && last_params | grep -qE '"idempotency_key":"mcb_[a-f0-9]{64}_1"' && echo 1 || echo 0)"
tc "  → the new attempt has its own snapshot: attempt 1, the new session" "$([ "$(q "SELECT CONCAT(attempt,'|',stripe_session_id,'|',status) FROM checkout_sessions WHERE order_id=$MULTI_OID ORDER BY attempt DESC LIMIT 1")" = "1|$SID2|CREATED" ] && echo 1 || echo 0)"
tc "  → with a future expiry" "$([ "$(q "SELECT stripe_expires_at > UTC_TIMESTAMP() FROM checkout_sessions WHERE order_id=$MULTI_OID ORDER BY attempt DESC LIMIT 1")" = "1" ] && echo 1 || echo 0)"
tc "  → the replaced session KEEPS its snapshot, marked EXPIRED, for any late payment" "$([ "$(q "SELECT CONCAT(stripe_session_id,'|',status,'|',expected_minor) FROM checkout_sessions WHERE order_id=$MULTI_OID AND attempt=0")" = "$SID1|EXPIRED|$(order_minor $MULTI_OID)" ] && echo 1 || echo 0)"
tc "  → and the new session is what Stripe was sent the saved lines for" "$([ "$(sent_lines)" = "$(saved_lines $MULTI_OID)" ] && echo 1 || echo 0)"
S=$(session "$MULTI_OID" "$MULTI_TOK")
tc "  → which is then itself reused" "$([ "$S" = "200" ] && [ "$(jget id)" = "$SID2" ] && [ "$(jget reused)" = "true" ] && echo 1 || echo 0)"
q "UPDATE checkout_sessions SET stripe_expires_at = UTC_TIMESTAMP() + INTERVAL 30 SECOND WHERE order_id=$MULTI_OID" >/dev/null
S=$(session "$MULTI_OID" "$MULTI_TOK")
tc "a session expiring within a minute is replaced, not handed out" "$([ "$S" = "200" ] && [ "$(jget id)" != "$SID2" ] && [ "$(q "SELECT MAX(attempt) FROM checkout_sessions WHERE order_id=$MULTI_OID")" = "2" ] && echo 1 || echo 0)"
MULTI_SID=$(jget id)

echo ""
echo "---------------- orders that must not be charged online ----------------"
mkorder "cs-legacy@example.com" "$(L keepsake-7-picture-disc)"
LOID=$MK_OID; LTOK=$MK_TOK
q "UPDATE orders SET total_minor = NULL WHERE id=$LOID" >/dev/null
stub_reset
S=$(session "$LOID" "$LTOK")
tc "a legacy-style order (total_minor NULL) is 409 order_not_payable_online" "$([ "$S" = "409" ] && body | grep -q '"error":"order_not_payable_online"' && echo 1 || echo 0)"
tc "  → and is not re-priced from today's catalogue: Stripe not called" "$([ "$(stub_count)" = "0" ] && [ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$LOID")" = "0" ] && echo 1 || echo 0)"
mkorder "cs-tamper@example.com" "$(L moment)"
q "UPDATE order_items SET line_minor = line_minor + 1 WHERE order_id=$MK_OID" >/dev/null
S=$(session "$MK_OID" "$MK_TOK")
tc "saved lines that do not add up are 409 order_not_payable_online" "$([ "$S" = "409" ] && body | grep -q '"error":"order_not_payable_online"' && echo 1 || echo 0)"

echo ""
echo "================ 10. FAILURE HANDLING ================"
mkorder "cs-fail@example.com" "$(L journey-6)"
FOID=$MK_OID; FTOK=$MK_TOK
stub http_fail
stub_reset
t "Stripe refusal surfaces as a safe 502" 502 "$(session "$FOID" "$FTOK")"
tc "36. → the raw Stripe message is NOT echoed to the customer" "$(body | grep -q 'INTERNAL STRIPE DETAIL' && echo 0 || echo 1)"
tc "36. → no Stripe account id leaked" "$(body | grep -q 'acct_' && echo 0 || echo 1)"
tc "32. → the order is untouched and still PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$FOID")" = "PENDING" ] && echo 1 || echo 0)"
tc "32. → the snapshot records the attempt as FAILED" "$([ "$(q "SELECT status FROM checkout_sessions WHERE order_id=$FOID")" = "FAILED" ] && echo 1 || echo 0)"
stub malformed
mkorder "cs-malformed@example.com" "$(L journey-6)"
t "a malformed Stripe response is refused, not trusted" 502 "$(session "$MK_OID" "$MK_TOK")"
tc "32. → order still PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$MK_OID")" = "PENDING" ] && echo 1 || echo 0)"
stub ok
stub_reset
t "once Stripe recovers, the FAILED attempt is retried" 200 "$(session "$FOID" "$FTOK")"
tc "  → as attempt 1, on the same snapshot" "$([ "$(q "SELECT CONCAT(COUNT(*),'|',MAX(attempt),'|',MAX(status)) FROM checkout_sessions WHERE order_id=$FOID")" = "1|1|CREATED" ] && echo 1 || echo 0)"

echo ""
echo "================ 11. WEBHOOK — EXACT PAYMENT ONLY ================"
# One fresh order and session per case, so each refusal is filed against its
# own Stripe session id and nothing earlier can satisfy a later assertion.
new_paid_candidate() { # $1 email, $2 lines; sets W_OID W_SID W_MINOR
  mkorder "$1" "$2"
  W_OID=$MK_OID
  session "$MK_OID" "$MK_TOK" >/dev/null
  W_SID=$(q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$W_OID")
  W_MINOR=$(q "SELECT expected_minor FROM checkout_sessions WHERE order_id=$W_OID")
}
YEAR=$(date -u +%Y)

new_paid_candidate "cs-under@example.com" "$(L keepsake-10-heart-picture-disc)"
t "underpayment acknowledged to Stripe" 200 "$(hook "$(event evt_under checkout.session.completed "$W_SID" "$W_OID" paid $((W_MINOR-1)) gbp "$W_OID")")"
# Money arrived for this order, but not the amount expected: PAYMENT_REVIEW,
# so it can never be paid a second time while a person decides.
tc "  → order is NOT paid: PAYMENT_REVIEW with no reference" "$([ "$(q "SELECT CONCAT(status,'|',IFNULL(mcb_reference,'NULL')) FROM orders WHERE id=$W_OID")" = "PAYMENT_REVIEW|NULL" ] && echo 1 || echo 0)"
tc "  → and it cannot start a second checkout" "$([ "$(session "$W_OID" "$MK_TOK")" = "409" ] && echo 1 || echo 0)"
tc "  → the audit trail records the review, with no customer text" "$([ "$(q "SELECT GROUP_CONCAT(event_type ORDER BY id) FROM order_events WHERE order_id=$W_OID AND event_type LIKE 'PAYMENT.%'")" = "PAYMENT.RECEIVED,PAYMENT.REVIEW" ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$W_OID AND detail LIKE '%story%'")" = "0" ] && echo 1 || echo 0)"
tc "  → filed AMOUNT_MISMATCH" "$([ "$(unrec "$W_SID")" = "AMOUNT_MISMATCH" ] && echo 1 || echo 0)"

new_paid_candidate "cs-over@example.com" "$(L keepsake-10-heart-picture-disc)"
t "overpayment acknowledged to Stripe" 200 "$(hook "$(event evt_over checkout.session.completed "$W_SID" "$W_OID" paid $((W_MINOR+1)) gbp "$W_OID")")"
tc "  → order is NOT paid: PAYMENT_REVIEW" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PAYMENT_REVIEW" ] && echo 1 || echo 0)"
tc "  → filed AMOUNT_MISMATCH" "$([ "$(unrec "$W_SID")" = "AMOUNT_MISMATCH" ] && echo 1 || echo 0)"

new_paid_candidate "cs-noamount@example.com" "$(L keepsake-10-heart-picture-disc)"
t "a paid event with no amount acknowledged" 200 "$(hook "$(event evt_noamt checkout.session.completed "$W_SID" "$W_OID" paid none gbp "$W_OID")")"
tc "  → order is NOT paid: PAYMENT_REVIEW" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PAYMENT_REVIEW" ] && echo 1 || echo 0)"
tc "  → filed AMOUNT_MISMATCH" "$([ "$(unrec "$W_SID")" = "AMOUNT_MISMATCH" ] && echo 1 || echo 0)"

new_paid_candidate "cs-wrongcur@example.com" "$(L keepsake-10-heart-picture-disc)"
t "the exact figure in the wrong currency acknowledged" 200 "$(hook "$(event evt_cur checkout.session.completed "$W_SID" "$W_OID" paid "$W_MINOR" eur "$W_OID")")"
tc "  → order is NOT paid: PAYMENT_REVIEW" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PAYMENT_REVIEW" ] && echo 1 || echo 0)"
tc "  → filed CURRENCY_MISMATCH" "$([ "$(unrec "$W_SID")" = "CURRENCY_MISMATCH" ] && echo 1 || echo 0)"

new_paid_candidate "cs-meta@example.com" "$(L moment)"
OTHER_OID=$FOID
t "metadata naming a different order acknowledged" 200 "$(hook "$(event evt_meta checkout.session.completed "$W_SID" "$W_OID" paid "$W_MINOR" gbp "$OTHER_OID")")"
tc "  → order stays PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PENDING" ] && echo 1 || echo 0)"
tc "  → filed ORDER_MISMATCH" "$([ "$(unrec "$W_SID")" = "ORDER_MISMATCH" ] && echo 1 || echo 0)"
tc "  → and the other order is untouched" "$([ "$(q "SELECT status FROM orders WHERE id=$OTHER_OID")" = "PENDING" ] && echo 1 || echo 0)"

new_paid_candidate "cs-snapA@example.com" "$(L moment)"
SNAP_A_SID=$W_SID; SNAP_A_OID=$W_OID
mkorder "cs-snapB@example.com" "$(L moment)"
SNAP_B_OID=$MK_OID
t "a snapshot's session presented for ANOTHER order acknowledged" 200 "$(hook "$(event evt_snap checkout.session.completed "$SNAP_A_SID" "$SNAP_B_OID" paid "$(order_minor $SNAP_B_OID)" gbp "$SNAP_B_OID")")"
tc "  → filed ORDER_MISMATCH" "$([ "$(unrec "$SNAP_A_SID")" = "ORDER_MISMATCH" ] && echo 1 || echo 0)"
tc "  → neither order was marked PAID" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE id IN ($SNAP_A_OID,$SNAP_B_OID) AND status='PENDING'")" = "2" ] && echo 1 || echo 0)"
tc "every refusal left no reference issued anywhere" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE mcb_reference IS NOT NULL")" = "0" ] && echo 1 || echo 0)"

echo ""
echo "---------------- delayed payment methods ----------------"
new_paid_candidate "cs-async@example.com" "$(L journey-6)"
ASYNC_OID=$W_OID; ASYNC_SID=$W_SID
t "checkout completed with payment_status unpaid acknowledged" 200 "$(hook "$(event evt_async_1 checkout.session.completed "$W_SID" "$W_OID" unpaid "$W_MINOR" gbp "$W_OID")")"
tc "  → outcome awaiting_payment" "$(wbody | grep -q '"outcome":"awaiting_payment"' && echo 1 || echo 0)"
tc "  → order stays PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PENDING" ] && echo 1 || echo 0)"
tc "  → nothing captured: no unreconciled row, no event consumed" "$([ "$(q "SELECT COUNT(*) FROM unreconciled_payments WHERE stripe_session_id='$W_SID'")" = "0" ] && [ "$(q "SELECT COUNT(*) FROM stripe_events WHERE event_id='evt_async_1'")" = "0" ] && echo 1 || echo 0)"
t "async_payment_succeeded with paid acknowledged" 200 "$(hook "$(event evt_async_2 checkout.session.async_payment_succeeded "$W_SID" "$W_OID" paid "$W_MINOR" gbp "$W_OID")")"
tc "  → order PAID with a reference" "$([ "$(q "SELECT status FROM orders WHERE id=$W_OID")" = "PAID" ] && q "SELECT mcb_reference FROM orders WHERE id=$W_OID" | grep -qE "^MCB-$YEAR-[0-9]{6}$" && echo 1 || echo 0)"

echo ""
echo "---------------- the exact payment completes ----------------"
docker exec mcb-api sh -c 'rm -f /tmp/resend-stub.log'
post_raw affiliate/register '{"name":"Cs Affiliate","email":"cs-aff@example.com","username":"csaff"}' >/dev/null
mkorder "cs-paid@example.com" '[{"sku":"keepsake-7-picture-disc","quantity":2},{"sku":"priority-replacement","quantity":1}]' ',"referral":"csaff"'
POID=$MK_OID; PTOK=$MK_TOK
session "$POID" "$PTOK" >/dev/null
PSID=$(q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$POID")
PMINOR=$(q "SELECT expected_minor FROM checkout_sessions WHERE order_id=$POID")
tc "the expected amount is the saved payable total ($PMINOR)" "$([ "$PMINOR" = "$((2*K7 + PR + $(q "SELECT delivery_minor FROM orders WHERE id=$POID")))" ] && [ "$PMINOR" = "$(order_minor $POID)" ] && echo 1 || echo 0)"
SALES0=$(q "SELECT sales FROM affiliates WHERE username='csaff'")
OKEVT=$(event evt_cs_ok checkout.session.completed "$PSID" "$POID" paid "$PMINOR" gbp "$POID")
t "10. the exact amount in GBP is accepted" 200 "$(hook "$OKEVT")"
tc "10. → outcome recorded" "$(wbody | grep -q '"outcome":"recorded"' && echo 1 || echo 0)"
tc "10. → order marked PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$POID")" = "PAID" ] && echo 1 || echo 0)"
PREF=$(q "SELECT mcb_reference FROM orders WHERE id=$POID")
tc "24. → MCB reference issued by the existing path" "$(echo "$PREF" | grep -qE "^MCB-$YEAR-[0-9]{6}$" && echo 1 || echo 0)"
tc "→ snapshot closed as COMPLETED" "$([ "$(q "SELECT status FROM checkout_sessions WHERE stripe_session_id='$PSID'")" = "COMPLETED" ] && echo 1 || echo 0)"
tc "→ affiliate credited exactly once" "$([ "$(q "SELECT sales FROM affiliates WHERE username='csaff'")" = "$((SALES0+1))" ] && echo 1 || echo 0)"
MAIL=$(docker exec mcb-api sh -c 'cat /tmp/resend-stub.log 2>/dev/null')
tc "→ the email summarises the saved lines by name and quantity" "$(echo "$MAIL" | grep -qF "2 × $(sku_name keepsake-7-picture-disc), $(sku_name priority-replacement)" && echo 1 || echo 0)"
tc "→ and the amount from total_minor (£$(dec $PMINOR))" "$(echo "$MAIL" | grep -qF "£$(dec $PMINOR)" && echo 1 || echo 0)"
tc "→ the operations notification stayed dormant (unconfigured, nothing sent)" \
  "$([ "$(docker logs mcb-api 2>&1 | grep -c 'MCB ops')" = "0" ] && [ "$(grep -c "'operations'" public/api/config.php 2>/dev/null)" = "0" ] && echo 1 || echo 0)"
tc "→ its payload, when configured, carries no contact details or story" \
  "$(awk '/function operations_payment_payload/,/^}/' public/api/lib/ops.php | grep -qiE 'email|c\.name|brief|story|address|phone' && echo 0 || echo 1)"

SEQ=$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")
t "25. the replayed event is accepted (Stripe expects 200)" 200 "$(hook "$OKEVT")"
tc "25. → reported duplicate" "$(wbody | grep -q '"outcome":"duplicate"' && echo 1 || echo 0)"
tc "25. → reference and sequence unchanged" "$([ "$(q "SELECT mcb_reference FROM orders WHERE id=$POID")" = "$PREF" ] && [ "$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")" = "$SEQ" ] && echo 1 || echo 0)"
tc "25. → affiliate sales not double-counted" "$([ "$(q "SELECT sales FROM affiliates WHERE username='csaff'")" = "$((SALES0+1))" ] && echo 1 || echo 0)"
tc "26. → no second confirmation email" "$([ "$(docker exec mcb-api sh -c 'grep -c "" /tmp/resend-stub.log 2>/dev/null' | tr -d ' ')" = "1" ] && echo 1 || echo 0)"

DUPEVT=$(event evt_cs_dup checkout.session.completed cs_test_second_payment_for_paid "$POID" paid "$PMINOR" gbp "$POID")
t "a DIFFERENT session paying an already-PAID order is acknowledged" 200 "$(hook "$DUPEVT")"
tc "  → outcome duplicate_payment" "$(wbody | grep -q '"outcome":"duplicate_payment"' && echo 1 || echo 0)"
tc "  → filed DUPLICATE_PAYMENT for a refund decision" "$([ "$(unrec cs_test_second_payment_for_paid)" = "DUPLICATE_PAYMENT" ] && echo 1 || echo 0)"
tc "  → the order keeps its original session, reference and sequence" "$([ "$(q "SELECT CONCAT(stripe_session_id,'|',mcb_reference) FROM orders WHERE id=$POID")" = "$PSID|$PREF" ] && [ "$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")" = "$SEQ" ] && echo 1 || echo 0)"
tc "  → affiliate sales unchanged" "$([ "$(q "SELECT sales FROM affiliates WHERE username='csaff'")" = "$((SALES0+1))" ] && echo 1 || echo 0)"
tc "→ a paid order cannot get a second payable session (409)" "$([ "$(session "$POID" "$PTOK")" = "409" ] && body | grep -q '"error":"order_not_payable"' && echo 1 || echo 0)"
tc "  → the checkout token is not consulted for anything else" "$([ "$(session "$POID" "$(openssl rand -hex 32)")" = "404" ] && echo 1 || echo 0)"

echo ""
echo "================ 12. WHAT STAFF AND THE CUSTOMER READ BACK ================"
curl -s -o /tmp/crm.json "$BASE/crm/orders?reference=$PREF" -H "Authorization: Bearer $CRMKEY"
tc "CRM orders returns the order's lines" "$(python3 - "$POID" <<'PY'
import json, sys
o = json.load(open("/tmp/crm.json"))["orders"][0]
keys = {"sku", "product_id", "name", "category", "fulfilment", "quantity", "unit_minor", "line_minor"}
ok = o["order_id"] == int(sys.argv[1]) and len(o["lines"]) == 2 and all(set(l) == keys for l in o["lines"])
ok = ok and [(l["sku"], l["quantity"]) for l in o["lines"]] == [("keepsake-7-picture-disc", 2), ("priority-replacement", 1)]
print(1 if ok else 0)
PY
)"
tc "  → with unit and line amounts equal to the saved rows" "$([ "$(python3 -c 'import json;print(",".join("%d:%d:%d"%(l["quantity"],l["unit_minor"],l["line_minor"]) for l in json.load(open("/tmp/crm.json"))["orders"][0]["lines"]))')" = "$(q "SELECT CONCAT(quantity,':',unit_minor,':',line_minor) FROM order_items WHERE order_id=$POID ORDER BY id" | paste -sd, -)" ] && echo 1 || echo 0)"
tc "  → and total.minor equals the order total, in GBP" "$([ "$(jget orders.0.total.minor /tmp/crm.json)" = "$PMINOR" ] && [ "$(jget orders.0.total.currency /tmp/crm.json)" = "GBP" ] && echo 1 || echo 0)"
curl -s -o /tmp/crmall.json "$BASE/crm/orders?limit=200" -H "Authorization: Bearer $CRMKEY"
tc "  → no 'usd' anywhere in the CRM orders response" "$(grep -qi 'usd' /tmp/crmall.json && echo 0 || echo 1)"
tc "  → and none of the retired amount/enhancements/basket keys" "$(grep -qE '"(amount|enhancements|basket_total_gbp|amount_gbp)":' /tmp/crmall.json && echo 0 || echo 1)"
tc "  → every order in it carries lines and total.minor" "$(python3 -c 'import json;o=json.load(open("/tmp/crmall.json"))["orders"];print(1 if o and all(isinstance(x["lines"],list) and isinstance(x["total"]["minor"],int) for x in o) else 0)')"

curl -s -o /tmp/ref.json "$BASE/order-reference?session_id=$PSID"
tc "order-reference returns purchase for the PAID order" "$([ "$(jget purchase.value_minor /tmp/ref.json)" = "$PMINOR" ] && [ "$(jget purchase.currency /tmp/ref.json)" = "GBP" ] && echo 1 || echo 0)"
tc "  → with the saved items, sku/product/quantity/unit_minor" "$(python3 -c 'import json
p=json.load(open("/tmp/ref.json"))["purchase"]
print(1 if [(i["sku"],i["product_id"],i["quantity"]) for i in p["items"]]==[("keepsake-7-picture-disc","keepsake",2),("priority-replacement","priority-replacement",1)] and all(isinstance(i["unit_minor"],int) for i in p["items"]) else 0)')"
tc "  → and no customer email or name in the body" "$(grep -qiE 'cs-paid|example\.com|"email"|Tester|"customer' /tmp/ref.json && echo 0 || echo 1)"
tc "  → nor any Stripe payment identifier" "$(grep -q 'pi_' /tmp/ref.json && echo 0 || echo 1)"
curl -s -o /tmp/ref2.json "$BASE/order-reference?session_id=cs_test_not_a_real_session_000"
tc "an unknown session has purchase null" "$([ "$(jget purchase /tmp/ref2.json)" = "null" ] && echo 1 || echo 0)"
q "UPDATE orders SET total_minor = NULL WHERE id=$ASYNC_OID" >/dev/null
curl -s -o /tmp/ref3.json "$BASE/order-reference?session_id=$ASYNC_SID"
tc "a paid order with no integer total (legacy) has purchase null" "$([ "$(jget purchase /tmp/ref3.json)" = "null" ] && [ "$(jget status /tmp/ref3.json)" = "PAID" ] && echo 1 || echo 0)"

echo ""
echo "================ 13. SECURITY ================"
t "cross-origin session creation rejected" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: https://evil.example" -d '{"orderId":1}')"
t "GET on the session endpoint rejected" 405 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/checkout/session")"
t "malformed JSON rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{oops')"
# 35. The limiter counts snapshot rows from one source. Twenty are made to
# exist for this source, then one more request must be refused.
mkorder "cs-rate@example.com" "$(L moment)"
session "$MK_OID" "$MK_TOK" >/dev/null
IPH=$(q "SELECT ip_hash FROM checkout_sessions WHERE order_id=$MK_OID")
VALUES=$(for i in $(seq 1 19); do printf "(%s,SHA2('rate-%s',256),'[]',0,'%s')," "$MK_OID" "$i" "$IPH"; done | sed 's/,$//')
q "INSERT INTO checkout_sessions (order_id,basket_hash,basket_lines,expected_amount_gbp,ip_hash) VALUES $VALUES" >/dev/null
mkorder "cs-rate2@example.com" "$(L moment)"
S=$(post_raw checkout/session "{\"orderId\":$MK_OID,\"checkoutToken\":\"$MK_TOK\"}")
tc "35. rate limiting is enforced on session creation" "$([ -n "$IPH" ] && [ "$S" = "429" ] && body | grep -q 'rate_limited' && echo 1 || echo 0)"
q "DELETE FROM checkout_sessions WHERE basket_lines='[]'" >/dev/null

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
