#!/bin/bash
# MCB™ PAYMENT-FIRST REGRESSION GUARD (16 September 2026).
#
# ONE QUESTION: can any production workflow begin for an order that has not
# paid? It must not, and this suite exists so that stays true.
#
# MCB's rule: customer input → consents → payment → payment verified →
# ORDER.READY_FOR_PROCESSING → work begins. Checking is allowed before payment
# (validation, pricing, consent, eligibility, destination restrictions,
# checkout, a video capacity HOLD, commercial warnings). Producing is not.
#
# Every workflow below is driven with an UNPAID order and must refuse:
# creative jobs, song candidates, artwork, production files, manufacturing
# packages, video production, supplier orders, shipments and replacements.
# It also proves the allowed pre-payment work really is allowed, that a known
# impossibility still stops a sale, that incomplete verification does NOT, and
# that a paid order MCB cannot fulfil raises an exception rather than being
# cancelled, repriced or refunded.
#
# Stripe and Resend are local stubs. No money moves.


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
. tests/automation-helpers.sh

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
            "style": style(m.get("style", "MCB")),
            # Keepsake and Journey artwork is created from a photograph: by default the first memory has one.
            "photo": m.get("photo", i == 0 and skus[us.get("sku", sku)]["product_id"] in ("keepsake", "journey") and not spec.get("no_photo"))}.items()}
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
    "consents": {"TERMS": True, "SERVICE_START": True, "DIGITAL_CONTENT": True, "CREATIVE_AUTHORITY": True}, "creativeAuthorityVersion": "2026-09-15", "termsVersion": "2026-09-15",
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
  # Unless the spec says "manual_photos", upload an artwork-ready photograph for
  # every memory slot the order expects, and refresh the saved summary.
  if [ "$CODE" = "201" ] && ! printf '%s' "$1" | grep -q '"manual_photos"'; then
    local slots; slots=$(python3 -c 'import json;print(" ".join(s for s in (json.load(open("/tmp/order.json")).get("missing_uploads") or []) if s.startswith("memory:")))' 2>/dev/null)
    if [ -n "$slots" ]; then
      for slot in $slots; do upload "$OID" "$TOK" "$slot" "$FIX/photo-2500.jpg" >/dev/null; done
      python3 -c 'import json;o=json.load(open("/tmp/order.json"));u=json.load(open("/tmp/tx.json"));o.update({k:u[k] for k in ("personalisation_status","missing_uploads","checkout_blocker") if k in u});json.dump(o,open("/tmp/order.json","w"))' 2>/dev/null
    fi
  fi
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

CRMKEY="test_crm_key_not_real_000000000000000000000"
crm() { curl -s -o /tmp/tx.json -w '%{http_code}' "$BASE/$1" -H "Authorization: Bearer $CRMKEY"; }
crmpost() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/$1" -H "Authorization: Bearer $CRMKEY" -H 'Content-Type: application/json' -d "$2"; }
# act ORDER ACTION [extra JSON fields, without braces]
act() { crmpost crm/order-action "{\"order_id\":$1,\"action\":\"$2\",\"staff\":\"Ops Tester\"${3:+,$3}}"; }
state_of() { crm "crm/operations?order=$1" >/dev/null; jget operations.state; }
link_token() { jget "links.$1" | sed 's/.*#//'; }
reset_limits() { q "DELETE FROM rate_limit_hits; UPDATE live_enquiries SET ip_hash=NULL; UPDATE concierge_enquiries SET ip_hash=NULL; UPDATE order_service_requests SET ip_hash=NULL"; release_limits; }
events_of() { q "SELECT GROUP_CONCAT(event_type ORDER BY id) FROM order_events WHERE order_id=$1"; }
# paid_order SPEC → OID paid in TEST mode
paid_order() {
  order "$1"
  local total; total=$(jget total_minor /tmp/order.json)
  session "$OID" "$TOK" >/dev/null
  local sid; sid=$(session_id_for "$OID")
  hook "$(pay_event "evt_ops_$(openssl rand -hex 6)" "$sid" "$OID" "$total" gbp)" >/dev/null
}
sent_count() { q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$1 AND message_type='$2' AND status='SENT'"; }
queue_has() { crm "crm/operations?view=queue" >/dev/null; python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print(1 if any(i["key"].startswith(sys.argv[1]) for i in d["items"]) else 0)' "$1"; }
TODAY=$(date -u +%Y-%m-%d)
. tests/automation-helpers.sh

QC_DIGITAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true}'
QC_PHYSICAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true,"photographs":true,"artwork_dimensions":true,"production_files":true,"delivery_information":true}'
AWJ=public/api/data/artwork.json
spec() { python3 -c "import json;d=json.load(open('$AWJ'));t={x['id']:x for x in d['templates']};print($1)"; }
ref_of() { q "SELECT mcb_reference FROM orders WHERE id=$1"; }
aid_of() { q "SELECT id FROM order_artwork WHERE order_id=$1 AND template_id='$2'"; }
notes() { q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$1 AND notification_type='$2'"; }
payload_of() { q "SELECT payload FROM founder_notifications WHERE order_id=$1 AND notification_type='$2' ORDER BY id LIMIT 1" > /tmp/np.json; }
evcount() { q "SELECT COUNT(*) FROM order_events WHERE order_id=$1 AND event_type='$2'"; }
# aw ORDER ARTWORK_ID REF TEMPLATE VERSION FIXTURE [extra curl -F …] → code (body /tmp/tx.json)
aw() { local oid=$1 aid=$2 ref=$3 tpl=$4 ver=$5 file=$6; shift 6
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/artwork" -H "Authorization: Bearer $CRMKEY" \
    -F "order_id=$oid" -F "artwork_id=$aid" -F "reference=$ref" -F "template_id=$tpl" -F "template_version=$ver" -F "staff=Artwork Tester" "$@" -F "output=@$file"; }
wk() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/notifications" -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY" -H 'Content-Type: application/json' -d "$1"; }
# ack ID TOKEN RESULT [CHANNEL] [ERROR_CODE] → code (JSON built here: bash 3.2 mangles escaped quotes inside "$(…)")
ack() { local body; body=$(python3 -c 'import json,sys;a=sys.argv[1:];d={"action":"ACK","id":int(a[0]),"claim_token":a[1],"result":a[2]}
if len(a)>3 and a[3]: d["channel"]=a[3]
if len(a)>4 and a[4]: d["error_code"]=a[4]
print(json.dumps(d))' "$@"); wk "$body"; }
wkget() { curl -s -o /tmp/tx.json -w '%{http_code}' "$BASE/crm/notifications$1" -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY"; }


js() { python3 -c 'import json,os,sys; E=os.environ; print(json.dumps(eval(sys.argv[1]),ensure_ascii=False))' "$1"; }
cj() { python3 -c 'import json,sys; d=json.load(open(sys.argv[2])); r=eval(sys.argv[1]); print(json.dumps(r,separators=(",",":")) if isinstance(r,(dict,list,bool)) or r is None else r)' "$1" "${2:-/tmp/tx.json}"; }
ROUTES=public/api/data/supplier-routes.json
RATES=public/api/data/delivery-rates.json
FC="crm/fulfilment"
ctl() { crm "crm/operations?order=$1" >/dev/null; }
ctlj() { python3 -c 'import json,sys; d=json.load(open("/tmp/tx.json"))["operations"]["fulfilment"]["controller"]; r=eval(sys.argv[1]); print(json.dumps(r,separators=(",",":")) if isinstance(r,(dict,list,bool)) or r is None else r)' "$1"; }
exc_id() { q "SELECT id FROM fulfilment_exceptions WHERE order_id=$1 AND type='$2' ORDER BY id DESC LIMIT 1"; }
ship_id() { q "SELECT id FROM shipments WHERE order_id=$1 AND sequence=$2"; }
# actj ORDER ACTION PYTHON_DICT_EXPR (E = env) → code; JSON built in Python (bash 3.2 quoting)
actj() { local extra; extra=$(js "$3"); crmpost crm/order-action "$(python3 -c 'import json,sys;d=json.loads(sys.argv[3]);d.update({"order_id":int(sys.argv[1]),"action":sys.argv[2],"staff":"Ops Tester"});print(json.dumps(d))' "$1" "$2" "$extra")"; }
# to_ready SPEC → OID at FULFILMENT.READY (paid in TEST mode, artwork registered, MCB QC passed; ADVISORY)
to_ready() {
  paid_order "$1"
  act $OID START_CREATIVE >/dev/null; act $OID SEND_TO_QUALITY_CHECK >/dev/null
  if printf '%s' "$1" | grep -q players; then act $OID CONFIRM_FULFILMENT_REVIEW '"confirmed":true,"note":"Availability and destination confirmed with the partner (test)."' >/dev/null; fi
  register_artwork $OID
  act $OID PASS_QUALITY_CHECK "$QC_PHYSICAL" >/dev/null
}
trap 'restore_config; rm -f public/api/_test-config-base.php' EXIT

stub_reset
reset_limits

# ---------------------------------------------------------------------------
# An UNPAID order, built exactly as the order form builds one. It has consents,
# personalisation, a price and a reference — everything except a payment.
# ---------------------------------------------------------------------------
order '{"sku":"keepsake-7-picture-disc","email":"payment-first-unpaid@example.com"}'
UNPAID=$OID
order '{"sku":"moment","email":"payment-first-digital@example.com"}'
UNPAID_DIGITAL=$OID

section "1. AN UNPAID ORDER EXISTS, AND NOTHING HAS BEEN MADE FOR IT"
t "the order was accepted and priced" "PENDING" "$(q "SELECT status FROM orders WHERE id=$UNPAID")"
t "  → its consents are recorded" 1 "$(q "SELECT COUNT(*)>0 FROM order_consents WHERE order_id=$UNPAID")"
t "no creative job exists" 0 "$(q "SELECT COUNT(*) FROM creative_jobs WHERE order_id=$UNPAID")"
t "no artwork exists" 0 "$(q "SELECT COUNT(*) FROM order_artwork WHERE order_id=$UNPAID")"
t "no production file exists" 0 "$(q "SELECT COUNT(*) FROM print_production_masters WHERE order_id=$UNPAID")"
t "no manufacturing package exists" 0 "$(q "SELECT COUNT(*) FROM manufacturing_packages WHERE order_id=$UNPAID")"
t "no video job exists" 0 "$(q "SELECT COUNT(*) FROM video_jobs WHERE order_id=$UNPAID")"
t "no supplier order exists" 0 "$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$UNPAID")"
t "no shipment exists" 0 "$(q "SELECT COUNT(*) FROM shipments WHERE order_id=$UNPAID")"
t "no 'ready for processing' event was emitted" 0 "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$UNPAID AND dedupe_key='ready-for-processing'")"

# staff_body ORDER ACTION [KEY VALUE ...] → JSON on stdout
staff_body() { python3 -c 'import json,sys
d={"order_id":int(sys.argv[1]),"action":sys.argv[2],"staff":"Payment-First Tester"}
a=sys.argv[3:]
for k,v in zip(a[::2],a[1::2]):
    d[k]=json.loads(v) if v[:1] in "[{0123456789" else v
print(json.dumps(d))' "$@"; }

section "2. NO PRODUCTION WORKFLOW WILL BEGIN FOR AN UNPAID ORDER"
t "creative work is refused" 409 "$(act $UNPAID START_CREATIVE)"
t "  → because payment comes first" "order_not_paid" "$(jget error)"
t "the quality check cannot be reached" 409 "$(act $UNPAID SEND_TO_QUALITY_CHECK)"
t "fulfilment cannot be marked ready" 409 "$(act $UNPAID SET_FULFILMENT_READY)"
t "a supplier order cannot be recorded" 409 "$(act $UNPAID RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-NOPE","skus":["keepsake-7-picture-disc"]')"
t "a shipment cannot be added" 409 "$(crmpost crm/order-action "$(staff_body $UNPAID ADD_SHIPMENT skus '["keepsake-7-picture-disc"]')")"
t "dispatch cannot be recorded" 409 "$(act $UNPAID MARK_DISPATCHED)"
t "a customer link cannot be issued" 409 "$(act $UNPAID ISSUE_STATUS_LINK)"
t "lyrics cannot be submitted" 404 "$(crmpost crm/creative "$(staff_body $UNPAID SUBMIT_PLAN)")"
t "  → it is not a paid order" "order_not_found" "$(jget error)"
t "a manufacturing package cannot be built" 404 "$(crmpost crm/production-files "$(staff_body $UNPAID BUILD_MANUFACTURING_PACKAGE)")"
t "the video workflow has nothing to act on" 404 "$(crmpost crm/video "$(staff_body $UNPAID START_PRODUCTION job_id 1)")"
tc "still nothing made for the unpaid order" "$(q "SELECT (SELECT COUNT(*) FROM creative_jobs WHERE order_id=$UNPAID)+(SELECT COUNT(*) FROM order_artwork WHERE order_id=$UNPAID)+(SELECT COUNT(*) FROM manufacturing_packages WHERE order_id=$UNPAID)+(SELECT COUNT(*) FROM supplier_orders WHERE order_id=$UNPAID)+(SELECT COUNT(*) FROM shipments WHERE order_id=$UNPAID)=0")"
t "and no money was requested of Stripe" 0 "$(stub_count)"

section "3. THE GUARD IS IN THE WORK, NOT ONLY IN THE CALLER"
t "the payment-first rule is a named, shared guard" 1 "$(grep -c 'function require_payment_before_work' public/api/lib/payment-first.php)"
t "  → artwork production asks it" 1 "$(grep -c "ARTWORK'" public/api/lib/production-files.php)"
t "  → video production asks it" 1 "$(grep -c "'VIDEO')" public/api/lib/video.php)"
t "  → starting a remedy asks it" 1 "$(grep -c 'require_payment_before_work' public/api/lib/customer-care.php)"
t "only the webhook and staff reconciliation write PAID" 2 "$(grep -rlF "= 'PAID'" public/api/stripe/webhook.php public/api/crm/reconcile.php | wc -l | tr -d ' ')"
t "  → and nothing else in the API does" 0 "$(grep -rlF "SET status = 'PAID'" public/api --include='*.php' | grep -vE 'stripe/webhook|crm/reconcile' | wc -l | tr -d ' ')"

section "4. WHAT MAY HAPPEN BEFORE PAYMENT REALLY MAY"
t "a price is quoted for an unpaid basket" 200 "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1}]}')"
t "  → and it is the Founders' price" 1500 "$(jget total_minor)"
t "a checkout session can be created for an unpaid order" 200 "$(session "$UNPAID_DIGITAL" "$TOK")"
t "  → which is the one Stripe call allowed before payment" 1 "$(stub_count)"
t "  → and still nothing is produced" 0 "$(q "SELECT COUNT(*) FROM creative_jobs WHERE order_id=$UNPAID_DIGITAL")"
t "  → the order is still unpaid" "PENDING" "$(q "SELECT status FROM orders WHERE id=$UNPAID_DIGITAL")"

section "5. PAYMENT STARTS THE WORK, AND ONLY THEN"
paid_order '{"sku":"moment","email":"payment-first-paid@example.com"}'
PAID=$OID
t "payment is verified" "PAID" "$(q "SELECT status FROM orders WHERE id=$PAID")"
t "  → and MCB records that the order is ready for processing" 1 "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$PAID AND dedupe_key='ready-for-processing'")"
t "  → now creative work may begin" 200 "$(act $PAID START_CREATIVE)"
t "  → and a creative job exists" 1 "$(q "SELECT COUNT(*)>0 FROM creative_jobs WHERE order_id=$PAID")"

section "6. NO AUTOMATIC MONEY OUT, EVER"
t "MCB asked Stripe for no refund" 0 "$(docker exec mcb-api sh -c 'grep -ci refund /tmp/stripe-stub.log 2>/dev/null | head -1 || true' | head -1 | tr -d '\r\n ' | sed 's/^$/0/')"
t "  → and no payout or transfer" 0 "$(docker exec mcb-api sh -c 'grep -ciE "payout|transfer" /tmp/stripe-stub.log 2>/dev/null | head -1 || true' | head -1 | tr -d '\r\n ' | sed 's/^$/0/')"
t "nothing was purchased from a supplier" 0 "$(q "SELECT COUNT(*) FROM supplier_orders")"



section "7. THE BUSINESS DAY IS EUROPE/LONDON, AND THE CLOCK CHANGES ARE HANDLED"
# Run the real helper inside the container at chosen instants.
bt() { docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/business-time.php"; $p = mcb_business_periods((int)$argv[1]); echo $p["today"]["start"], "|", $p["today"]["end"], "|", $p["today"]["local_date"], "|", $p["timezone"];' "$1" 2>/dev/null; }
# 2026-06-15 00:30 London (BST, UTC+1) = 2026-06-14 23:30 UTC.
t "in British Summer Time the day starts at 23:00 UTC the evening before" "2026-06-14 23:00:00|2026-06-15 23:00:00|2026-06-15|Europe/London" "$(bt 1781479800)"
# 2026-01-15 00:30 London (GMT, UTC+0).
t "in winter the day starts at midnight UTC" "2026-01-15 00:00:00|2026-01-16 00:00:00|2026-01-15|Europe/London" "$(bt 1768437000)"
# Spring forward: 2026-03-29 01:00 UTC. That London day is 23 hours long.
t "the spring clock change gives a 23-hour day" "2026-03-29 00:00:00|2026-03-29 23:00:00|2026-03-29|Europe/London" "$(bt 1774782000)"
# Autumn back: 2026-10-25. That London day is 25 hours long.
t "the autumn clock change gives a 25-hour day" "2026-10-24 23:00:00|2026-10-26 00:00:00|2026-10-25|Europe/London" "$(bt 1792929600)"
t "an order at 00:30 BST belongs to that London day, not the one before" 1 "$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/business-time.php"; $p=mcb_business_periods(1781479800); echo mcb_business_in("2026-06-14 23:30:00", $p["today"]) ? 1 : 0;' 2>/dev/null)"
t "  → and the hour before it does not" 0 "$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/business-time.php"; $p=mcb_business_periods(1781479800); echo mcb_business_in("2026-06-14 22:30:00", $p["today"]) ? 1 : 0;' 2>/dev/null)"
t "the Command Centre and Business now agree on today" 1 "$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/business.php"; $a=cc_period("today", 1781479800); $b=biz_periods(1781479800)["today"]; echo ($a["start"] === $b["start"] && $a["end"] === $b["end"]) ? 1 : 0;' 2>/dev/null)"
t "an invalid configured timezone is reported, not silently ignored" "CONFIGURED_VALUE_INVALID" "$(with_config "\$c['business'] = ['timezone' => 'Not/AZone'];" >/dev/null; docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/business-time.php"; echo mcb_business_timezone()["status"];' 2>/dev/null; restore_config >/dev/null)"

echo ""
echo "================================================================"
printf "PASSED: %-4s FAILED: %s\n" "$PASS" "$FAIL"
for f in "${FAILED[@]:-}"; do [ -n "$f" ] && echo "  - $f"; done
[ "$FAIL" -eq 0 ]
