#!/bin/bash
# MCB FULFILMENT CONTROLLER & CUSTOMER DELIVERY AUTOMATION (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# MCB IS THE MIDDLEMAN: nothing here buys, pays, refunds or books a courier.
# Supplier routes are a TEST-ONLY file created and removed by this suite
# (never committed); every supplier, link and cost in it is synthetic.
#
# Covers: founder decision card and explicit authorisation (a deep link
# never approves); expected economics (data required, safety exception, no
# cancellation); supplier routes and destination checks (UNKNOWN is never
# SUPPORTED); allowances never a customer charge; supplier order workspace
# and recording (no payment credentials); expected vs actual cost; parcels,
# split delivery and completion; customer page and messages; lost parcels
# and authorised resolutions; substitution; support cases and evidence;
# review request vs marketing permission; lifecycle hooks; metrics,
# scorecards, health and the command centre; notification channels;
# ADVISORY preserved; migration equivalence.

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
trap 'restore_config; rm -f public/api/_test-config-base.php "$ROUTES" "$RATES"' EXIT
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
phpx() { docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require_once "/var/www/html/api/lib/operations.php"; '"$1" 2>/dev/null; }
write_routes() { cat > "$ROUTES"; settle; }
ROUTES_STANDARD='{"routes":[
 {"route_id":"TEST-ROUTE-K12","skus":["keepsake-12-picture-disc","keepsake-7-picture-disc"],"supplier":"TEST SUPPLIER K (synthetic)","product_url":"https://supplier.example/k12","configuration":"12-inch picture disc (test)",
  "destinations":{"supported":["GB"],"check_required":[],"unsupported":["US"]},"shipping_model":"DESTINATION_CALCULATED","currency":"GBP","expected_purchase_cost_minor":4000,
  "internal_allowance":{"expected_supplier_shipping_minor":800,"shipping_contingency_minor":200,"mcb_fulfilment_handling_allowance_minor":300},"checkout_shipping_required":true,
  "production_estimate":"10 working days (test)","delivery_estimate":"3 to 5 working days (test)","tracking_capability":"FULL","order_instructions":"Upload the print masters; choose the black inner sleeve (test).",
  "cancellation_cutoff":"Before production starts (test)","limitations":["Test limitation"],"verification_status":"VERIFIED","source":"synthetic test fixture","last_verified_date":"2026-09-15"},
 {"route_id":"TEST-ROUTE-PLAYER","skus":["vintage-smartphone-gramophone"],"supplier":"TEST MARKETPLACE P (synthetic)","product_url":"https://marketplace.example/player","configuration":"Standard (test)",
  "destinations":{"supported":["GB"],"check_required":[],"unsupported":[]},"shipping_model":"MARKETPLACE_LISTING_DEPENDENT","currency":"GBP","expected_purchase_cost_minor":6000,
  "internal_allowance":{"expected_supplier_shipping_minor":1000},"tracking_capability":"PARTIAL","verification_status":"VERIFIED","source":"synthetic test fixture","last_verified_date":"2026-09-15"}]}'
FOUNDER_JSON_BELLA='"founder":"BELLA","founder_code":"'"$FOUNDER_CODE_BELLA"'","confirm":true'
FOUNDER_JSON_LEWIS='"founder":"LEWIS","founder_code":"'"$FOUNDER_CODE_LEWIS"'","confirm":true'

stub_reset
reset_limits

section "1. POLICY DATA, PRIVACY AND THE MIGRATION"
FJ=public/api/data/fulfilment.json
t "the fulfilment policy is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/fulfilment.json")"
t "delivery routing states" "VERIFIED_FIXED_OR_FREE,DESTINATION_CALCULATED,MARKETPLACE_LISTING_DEPENDENT,MANUAL_FULFILMENT_REVIEW" "$(cj '",".join(d["delivery_routing_states"])' $FJ)"
t "internal allowance components are separate" "EXPECTED_SUPPLIER_SHIPPING,SHIPPING_CONTINGENCY,MCB_FULFILMENT_HANDLING_ALLOWANCE,TOTAL_INTERNAL_FULFILMENT_ALLOWANCE" "$(cj '",".join(d["internal_allowance_components"])' $FJ)"
tc "every brief delivery exception type exists" "$(cj 'all(x in d["fulfilment_exception_types"] for x in ["SUPPLIER_DELAY","PRODUCTION_DELAY","TRACKING_NOT_RECEIVED","TRACKING_STALLED","PARCEL_DELAYED","PARCEL_LOST","PARCEL_DAMAGED","WRONG_ITEM","MANUFACTURING_DEFECT","PARTIAL_DELIVERY","DESTINATION_PROBLEM","CUSTOMS_EXCEPTION","SUPPLIER_CANCELLED","OTHER_FULFILMENT_EXCEPTION"])' $FJ | grep -q true && echo 1 || echo 0)"
t "variance reasons" "SUPPLIER_PRICE_CHANGE,SHIPPING_VARIANCE,CURRENCY_VARIANCE,MARKETPLACE_VARIANCE,MANUAL_ADJUSTMENT,OTHER" "$(cj '",".join(d["variance_reasons"])' $FJ)"
t "founder-only resolutions" "PARTIAL_DELIVERY_ACCEPTED,SUBSTITUTION_APPROVED,REFUND_TO_BE_HANDLED_BY_FOUNDER,PROCEED_AT_PAID_PRICE" "$(cj '",".join(d["founder_only_resolutions"])' $FJ)"
tc "no supplier route or order data file is committed" "$(git ls-files public/api/data | grep -qE 'supplier-(routes|orders)' && echo 0 || echo 1)"
tc "the public catalogue carries no route, allowance or economics field" "$(grep -qiE 'route_id|internal_allowance|contingency|handling_allowance|expected_purchase|contribution|margin' public/catalogue.json && echo 0 || echo 1)"
tc "the controller makes no outbound call (no supplier, courier, payment or messaging API)" "$(grep -niE 'curl_init|file_get_contents\(.https?:|fsockopen|api\.telegram|stripe\.com|/v1/refunds' public/api/lib/fulfilment-controller.php public/api/crm/fulfilment.php public/api/order-evidence.php | grep -q . && echo 0 || echo 1)"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS fca; DROP DATABASE IF EXISTS fcb; CREATE DATABASE fca; CREATE DATABASE fcb;' 2>/dev/null
ROOTQ fca < db/schema.sql 2>/dev/null
git show cf92949f:db/schema.sql | ROOTQ fcb 2>/dev/null
ROOTQ fcb < db/migrations/2026-09-15-fulfilment-controller.sql 2>/dev/null; F1=$?
ROOTQ fcb < db/migrations/2026-09-15-fulfilment-controller.sql 2>/dev/null; F2=$?
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the Fulfilment Controller migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$F1" = 0 ] && [ "$F2" = 0 ] && [ "$(dumpdb fca | shasum)" = "$(dumpdb fcb | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE fca; DROP DATABASE fcb;' 2>/dev/null
tc "  → it only adds (no DROP, DELETE, TRUNCATE, RENAME or UPDATE)" "$(grep -qE '^[[:space:]]*(DROP|DELETE|TRUNCATE|RENAME|UPDATE) ' db/migrations/2026-09-15-fulfilment-controller.sql && echo 0 || echo 1)"
tc "no column can hold card or payment credentials" "$(q "SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='mcb_crm' AND table_name IN ('supplier_orders','order_economics','shipments','fulfilment_exceptions') AND column_name REGEXP 'card|cvv|cvc|pan|expiry|password|secret|token'" | grep -qx 0 && echo 1 || echo 0)"
t "enforcement stays ADVISORY by default" "ADVISORY" "$(grep -A3 "'creative' =>" public/api/config.example.php | grep -o "'enforcement' => '[A-Z]*'" | grep -o "[A-Z]*'$" | tr -d "'")"

section "2. DESTINATIONS AND ROUTES (PURE CHECKS)"
t "no route → DESTINATION_UNKNOWN" "DESTINATION_UNKNOWN" "$(phpx 'echo destination_check(null, "GB")["status"];')"
t "a verified route listing the country → SUPPORTED" "DESTINATION_SUPPORTED" "$(phpx 'echo destination_check(["destinations"=>["supported"=>["GB"],"check_required"=>[],"unsupported"=>[]],"shipping_model"=>"DESTINATION_CALCULATED","verification_status"=>"VERIFIED"], "GB")["status"];')"
t "a country the route does not list → UNKNOWN, never SUPPORTED" "DESTINATION_UNKNOWN" "$(phpx 'echo destination_check(["destinations"=>["supported"=>["GB"],"check_required"=>[],"unsupported"=>[]],"shipping_model"=>"DESTINATION_CALCULATED","verification_status"=>"VERIFIED"], "FR")["status"];')"
t "an excluded country → UNSUPPORTED" "DESTINATION_UNSUPPORTED" "$(phpx 'echo destination_check(["destinations"=>["supported"=>["GB"],"check_required"=>[],"unsupported"=>["US"]],"shipping_model"=>"DESTINATION_CALCULATED","verification_status"=>"VERIFIED"], "US")["status"];')"
t "a marketplace listing → CHECK_REQUIRED (manual checkout verification), even when listed" "DESTINATION_CHECK_REQUIRED" "$(phpx 'echo destination_check(["destinations"=>["supported"=>["GB"],"check_required"=>[],"unsupported"=>[]],"shipping_model"=>"MARKETPLACE_LISTING_DEPENDENT","verification_status"=>"VERIFIED"], "GB")["status"];')"
t "an unverified route listing the country → CHECK_REQUIRED" "DESTINATION_CHECK_REQUIRED" "$(phpx 'echo destination_check(["destinations"=>["supported"=>["GB"],"check_required"=>[],"unsupported"=>[]],"shipping_model"=>"DESTINATION_CALCULATED","verification_status"=>"UNVERIFIED"], "GB")["status"];')"
t "card numbers are recognised (Luhn) and ordinary references are not" "1|0|1" "$(phpx 'echo (int) looks_like_card_number("ref 4242 4242 4242 4242"), "|", (int) looks_like_card_number("SO-2026-000123456"), "|", (int) looks_like_card_number("cvv 123");')"
t "approved alternatives apply to the pop-up card class only" "CARD|0" "$(cj '",".join(d["authorised_alternative_delivery_classes"])' $FJ)|$(phpx 'echo (int) substitution_is_approved_card_alternative("keepsake-12-picture-disc");')"

section "3. NO ROUTE DATA: COMMERCIAL DATA REQUIRED, EXPLICIT FOUNDER DECISION"
to_ready '{"sku":"keepsake-12-picture-disc","email":"fc-a@example.com"}'; OA=$OID
t "order A is ready for the founder decision" "FULFILMENT.READY" "$(state_of $OA)"
t "expected economics: COMMERCIAL_DATA_REQUIRED, nothing estimated" "COMMERCIAL_DATA_REQUIRED|NULL|NULL" "$(q "SELECT CONCAT_WS('|',status,IFNULL(total_cost_minor,'NULL'),IFNULL(contribution_minor,'NULL')) FROM order_economics WHERE order_id=$OA AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")"
ctl $OA
t "the decision card: payment, QC, package, destination, economics, would-block list, ADVISORY" "VERIFIED|PASSED|DESTINATION_UNKNOWN|COMMERCIAL_DATA_REQUIRED|ADVISORY" "$(jget operations.fulfilment.approval.customer_payment)|$(jget operations.fulfilment.approval.mcb_qc)|$(ctlj 'd["decision"]["destination_status"]')|$(ctlj 'd["decision"]["economics"]["status"]')|$(ctlj 'd["decision"]["enforcement"]')"
tc "  → it names what would block under REQUIRED" "$(ctlj 'all(x in d["decision"]["would_block_if_required"] for x in ["COMMERCIAL_DATA_REQUIRED","DESTINATION_UNKNOWN"])' | grep -q true && echo 1 || echo 0)"
tc "  → the destination is a safe summary (town and country only)" "$(ctlj 'd["decision"]["destination"]' | grep -q 'Southampton' && ! ctlj 'd["decision"]' | grep -qiE 'Harbour Row|SO14|Rec Ipient|\+44' && echo 1 || echo 0)"
tc "  → it carries no story, photograph or secret" "$(ctlj 'd["decision"]' | grep -qiE 'memory 1|evening on deck|stored_name|photo-|founder_code|not-real' && echo 0 || echo 1)"
tc "  → the missing data is named" "$(ctlj 'd["decision"]["economics"]["missing"]' | grep -q 'SUPPLIER_ROUTE:keepsake-12-picture-disc' && echo 1 || echo 0)"
crm "crm/operations?order=$OA&action=AUTHORISE_SUPPLIER_PURCHASE" >/dev/null
t "opening the deep link authorises nothing" "FULFILMENT.READY|NULL" "$(state_of $OA)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$OA")"
t "no supplier order can be recorded before a founder authorises" "409|founder_authorisation_required|0" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-EARLY"')|$(jget error)|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$OA")"
t "no workspace before authorisation" "null" "$(ctl $OA; ctlj 'd["workspace"]')"
t "authorising without acknowledging the unverified destination is refused" "422|destination_acknowledgement_required|NULL" "$(act $OA AUTHORISE_SUPPLIER_PURCHASE "$FOUNDER_JSON_BELLA")|$(jget error)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$OA")"
t "  → and without acknowledging the missing commercial data" "422|commercial_acknowledgement_required" "$(act $OA AUTHORISE_SUPPLIER_PURCHASE "$FOUNDER_JSON_BELLA"',"destination_acknowledged":true')|$(jget error)"
t "Bella explicitly authorises, having acknowledged both" "200|FULFILMENT.AUTHORISED" "$(founder_authorise $OA BELLA "$FOUNDER_CODE_BELLA")|$(jget state /tmp/fa.json)"
t "  → the audit records what she saw" "DESTINATION_UNKNOWN|COMMERCIAL_DATA_REQUIRED|1|1" "$(q "SELECT CONCAT_WS('|',JSON_VALUE(detail,'$.destination'),JSON_VALUE(detail,'$.economics'),JSON_VALUE(detail,'$.destination_acknowledged'),JSON_VALUE(detail,'$.commercial_acknowledged')) FROM order_events WHERE order_id=$OA AND event_type='FULFILMENT.AUTHORISED'")"
ctl $OA
t "the supplier order workspace appears only now, staff only" "BELLA|NOT_ON_FILE|true" "$(ctlj 'd["workspace"]["authorised_by"]')|$(ctlj '"NOT_ON_FILE" if d["workspace"]["instructions"][0]["supplier"] is None else "ON_FILE"')|$(ctlj 'd["workspace"]["instructions"][0]["checkout_destination_check"]')"
tc "  → it says nothing is checked out or paid automatically" "$(ctlj 'd["workspace"]["note"]' | grep -q 'Nothing here checks out or pays' && echo 1 || echo 0)"
t "a card number in the reference is refused and nothing recorded" "422|payment_credentials_refused|0" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"4111 1111 1111 1111"')|$(jget error)|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$OA")"
t "  → so is a security code in the notes" "422|payment_credentials_refused" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-1","notes":"paid with card, CVV 123"')|$(jget error)"
t "an ordinary product substituted without a founder decision is refused" "409|substitution_approval_required|0" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-SUB","substitute_sku":"keepsake-10-picture-disc"')|$(jget error)|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$OA")"
t "  → a blocking SUBSTITUTION_APPROVAL_REQUIRED exception is kept and the Founders told" "OPEN|1|1" "$(q "SELECT CONCAT_WS('|',status,blocking) FROM fulfilment_exceptions WHERE order_id=$OA AND type='SUBSTITUTION_APPROVAL_REQUIRED'")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$OA AND notification_type='FULFILMENT_EXCEPTION' AND payload LIKE '%SUBSTITUTION_APPROVAL_REQUIRED%'")"
t "  → trying again raises no duplicate" "1" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-SUB","substitute_sku":"keepsake-10-picture-disc"' >/dev/null; q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id=$OA AND type='SUBSTITUTION_APPROVAL_REQUIRED'")"
SUBX=$(exc_id $OA SUBSTITUTION_APPROVAL_REQUIRED)
t "approving a substitution needs Bella or Lewis's own code" "422|founder_required|OPEN" "$(OX=$SUBX actj $OA RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"SUBSTITUTION_APPROVED","note":"Staff trying"}')|$(jget error)|$(q "SELECT status FROM fulfilment_exceptions WHERE id=$SUBX")"
t "staff close it as not needed (the ordered product will be used)" "200|RESOLVED|NO_ACTION_NEEDED|NULL" "$(OX=$SUBX actj $OA RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"NO_ACTION_NEEDED","note":"Ordered product is available after all."}')|$(q "SELECT CONCAT_WS('|',status,resolution,IFNULL(resolution_authorised_by,'NULL')) FROM fulfilment_exceptions WHERE id=$SUBX")"
t "  → which is not an approval: the substitution is still refused" "409" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-SUB","substitute_sku":"keepsake-10-picture-disc"')"
t "the supplier order placed by hand is recorded (actual costs, no expected data)" "200|FULFILMENT.CONFIRMED" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-1","actual_purchase_cost_minor":5000,"actual_shipping_cost_minor":900,"currency":"GBP","expected_dispatch_date":"2026-09-01","send_email":false')|$(jget state)"
TOTAL_A=$(q "SELECT total_minor FROM orders WHERE id=$OA")
t "  → operator, founder, costs; variance unknown without expected data" "Ops Tester|BELLA|5900|NULL|1" "$(q "SELECT CONCAT_WS('|',operator,financial_authoriser,actual_total_cost_minor,IFNULL(variance_minor,'NULL'),tracking_pending) FROM supplier_orders WHERE order_id=$OA")"
t "  → actual economics: contribution from what was paid and spent" "ACTUAL|$((TOTAL_A-5900))" "$(q "SELECT CONCAT_WS('|',kind,contribution_minor) FROM order_economics WHERE order_id=$OA AND kind='ACTUAL' ORDER BY id DESC LIMIT 1")"
t "  → FULFILMENT.PARTNER_ORDER_RECORDED and FULFILMENT.CONFIRMED audited once" "1|1" "$(evcount $OA FULFILMENT.PARTNER_ORDER_RECORDED)|$(evcount $OA FULFILMENT.CONFIRMED)"
t "the same supplier reference cannot be recorded twice" "409|duplicate_supplier_order" "$(act $OA RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-A-1"')|$(jget error)"

section "4. VERIFIED ROUTES: ECONOMICS, ALLOWANCES, SPLIT SHIPMENTS, COMPLETION"
# The customer's delivery charge comes only from the (TEST) customer rate table, as before this sprint.
printf '%s' '{"currency":"GBP","pricing":{"PLAYER":"DESTINATION_CALCULATED"},"rates":[{"id":"T_UK","label":"UK delivery (test table)","countries":["GB"],"first_item_minor":400,"additional_item_minor":100},{"id":"T_UK_PLAYER","label":"Player delivery (test table)","countries":["GB"],"classes":["PLAYER"],"first_item_minor":1200,"additional_item_minor":900}]}' > "$RATES"; settle
post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"vintage-smartphone-gramophone","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null; cp /tmp/tx.json /tmp/fc-quote-before.json
echo "$ROUTES_STANDARD" | write_routes
post_json order-quote '{"lines":[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"vintage-smartphone-gramophone","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null
t "the customer is quoted from the customer rate table only" "QUOTED|1600" "$(jget delivery.status)|$(jget delivery.minor)"
tc "internal allowances never change what the customer is quoted" "$([ "$(python3 -c 'import json;print(json.dumps(json.load(open("/tmp/fc-quote-before.json")),sort_keys=True))')" = "$(python3 -c 'import json;print(json.dumps(json.load(open("/tmp/tx.json")),sort_keys=True))')" ] && ! grep -qiE 'TEST SUPPLIER|marketplace\.example|supplier\.example|allowance|contingency|handling' /tmp/tx.json && echo 1 || echo 0)"
to_ready '{"sku":"keepsake-7-picture-disc","players":[["vintage-smartphone-gramophone",1]],"email":"fc-b@example.com"}'; OB=$OID
TOTAL_B=$(q "SELECT total_minor FROM orders WHERE id=$OB")
t "order B (record + player) is ready" "FULFILMENT.READY" "$(state_of $OB)"
t "expected economics calculated: purchase, shipping, contingency, handling, total, contribution" "CALCULATED|10000|1800|200|300|12300|$((TOTAL_B-12300))" "$(q "SELECT CONCAT_WS('|',status,purchase_cost_minor,shipping_cost_minor,contingency_minor,handling_minor,total_cost_minor,contribution_minor) FROM order_economics WHERE order_id=$OB AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")"
t "  → margin in basis points; exclusions listed (VAT, fees, time, marketing)" "$(( (TOTAL_B-12300)*10000/TOTAL_B ))|4" "$(q "SELECT margin_basis_points FROM order_economics WHERE order_id=$OB AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")|$(q "SELECT JSON_LENGTH(body,'$.excludes') FROM order_economics WHERE order_id=$OB AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")"
ctl $OB
t "the decision card shows each route and the destination needs a checkout check (marketplace)" "TEST-ROUTE-K12,TEST-ROUTE-PLAYER|DESTINATION_CHECK_REQUIRED|MARKETPLACE_LISTING_DEPENDENT" "$(ctlj '",".join(l["route"]["route_id"] for l in d["decision"]["lines"])')|$(ctlj 'd["decision"]["destination_status"]')|$(ctlj 'd["decision"]["lines"][1]["route"]["shipping_model"]')"
tc "  → CHECK_REQUIRED is acknowledged, not a REQUIRED-mode block" "$(ctlj 'd["decision"]["would_block_if_required"]' | grep -q DESTINATION && echo 0 || echo 1)"
t "the economics snapshot is stored once however often it is checked" "1" "$(q "SELECT COUNT(*) FROM order_economics WHERE order_id=$OB AND kind='EXPECTED'")"
t "Lewis authorises (destination acknowledged)" "200|FULFILMENT.AUTHORISED" "$(founder_authorise $OB LEWIS "$FOUNDER_CODE_LEWIS")|$(jget state /tmp/fa.json)"
t "  → still one expected snapshot (same content)" "1" "$(q "SELECT COUNT(*) FROM order_economics WHERE order_id=$OB AND kind='EXPECTED'")"
ctl $OB
t "workspace: route, link, configuration and instructions for a person" "TEST-ROUTE-K12|https://supplier.example/k12|Upload the print masters; choose the black inner sleeve (test).|true" "$(ctlj 'd["workspace"]["instructions"][0]["route_id"]')|$(ctlj 'd["workspace"]["instructions"][0]["product_url"]')|$(ctlj 'd["workspace"]["instructions"][0]["order_instructions"]')|$(ctlj 'd["workspace"]["instructions"][1]["checkout_destination_check"]')"
t "an actual cost different from expected needs a variance reason" "422|variance_reason_required|0" "$(act $OB RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-B-1","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":4100,"actual_shipping_cost_minor":800')|$(jget error)|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$OB")"
t "supplier order 1 (record): +100 variance, SUPPLIER_PRICE_CHANGE" "200|FULFILMENT.CONFIRMED|4800|4900|100|SUPPLIER_PRICE_CHANGE" "$(act $OB RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-B-1","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":4100,"actual_shipping_cost_minor":800,"variance_reason":"SUPPLIER_PRICE_CHANGE","send_email":false')|$(jget state)|$(q "SELECT CONCAT_WS('|',expected_total_cost_minor,actual_total_cost_minor,variance_minor,variance_reason) FROM supplier_orders WHERE order_id=$OB AND supplier_order_reference='SO-B-1'")"
t "supplier order 2 (player, a different partner) on the same order: no variance" "200|TEST-ROUTE-PLAYER|0|NULL" "$(act $OB RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-B-2","skus":["vintage-smartphone-gramophone"],"actual_purchase_cost_minor":6000,"actual_shipping_cost_minor":1000')|$(q "SELECT CONCAT_WS('|',route_id,variance_minor,IFNULL(variance_reason,'NULL')) FROM supplier_orders WHERE order_id=$OB AND supplier_order_reference='SO-B-2'")"
t "actual economics over both orders; contribution variance against expected" "11900|$((TOTAL_B-11900))" "$(q "SELECT CONCAT_WS('|',total_cost_minor,contribution_minor) FROM order_economics WHERE order_id=$OB AND kind='ACTUAL' ORDER BY id DESC LIMIT 1")"
tc "  → the customer's price is untouched" "$([ "$(q "SELECT total_minor FROM orders WHERE id=$OB")" = "$TOTAL_B" ] && echo 1 || echo 0)"
SO1=$(q "SELECT id FROM supplier_orders WHERE order_id=$OB AND supplier_order_reference='SO-B-1'"); SO2=$(q "SELECT id FROM supplier_orders WHERE order_id=$OB AND supplier_order_reference='SO-B-2'")
t "two parcels are added, one per supplier order" "200|200|2" "$(SO=$SO1 actj $OB ADD_SHIPMENT '{"supplier_order_id":int(E["SO"]),"skus":["keepsake-7-picture-disc"]}')|$(SO=$SO2 actj $OB ADD_SHIPMENT '{"supplier_order_id":int(E["SO"]),"skus":["vintage-smartphone-gramophone"]}')|$(q "SELECT COUNT(*) FROM shipments WHERE order_id=$OB")"
P1=$(ship_id $OB 1); P2=$(ship_id $OB 2)
act $OB ISSUE_STATUS_LINK >/dev/null; BTOK=$(link_token status); BPB="{\"token\":\"$BTOK\"}"
t "the customer page shows 'being made', no parcels yet" "making|[]" "$(post_json order-progress "$BPB" >/dev/null; jget stage)|$(jget parcels)"
MAIL0=$(mail_count)
t "parcel 1 dispatched with tracking: the order is DISPATCHED, the customer is emailed" "200|DISPATCHED|1" "$(P=$P1 D=$TODAY actj $OB MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Royal Mail","tracking_reference":"TRK-B-1","tracking_url":"https://tracking.example/TRK-B-1","dispatched_on":E["D"]}')|$(jget state)|$(sent_count $OB DISPATCHED)"
post_json order-progress "$BPB" >/dev/null
t "customer page: on its way; parcel 1 on the way with tracking, parcel 2 being made" "on-its-way|2|ON_THE_WAY|TRK-B-1|BEING_MADE" "$(jget stage)|$(cj 'len(d["parcels"])')|$(jget parcels.0.status)|$(jget parcels.0.tracking_reference)|$(jget parcels.1.status)"
tc "  → no supplier, route, link, cost, founder or exception detail on the customer page" "$(grep -qiE 'TEST SUPPLIER|TEST MARKETPLACE|supplier\.example|marketplace\.example|route|SO-B-|4100|6000|LEWIS|BELLA|authoris|exception|contribution|allowance' /tmp/tx.json && echo 0 || echo 1)"
t "parcel 1 delivered: NOT delivered or complete while parcel 2 is outstanding" "200|partial|DISPATCHED|0" "$(P=$P1 D=$TODAY actj $OB MARK_SHIPMENT_DELIVERED '{"shipment_id":int(E["P"]),"delivered_on":E["D"]}')|$(jget outcome)|$(jget state)|$(evcount $OB ORDER.COMPLETED)"
t "  → the old whole-order MARK_DELIVERED cannot skip the outstanding parcel" "409|parcels_recorded_separately" "$(act $OB MARK_DELIVERED "\"delivered_on\":\"$TODAY\"")|$(jget error)"
t "parcel 2 dispatched: the ADDITIONAL PARCEL message goes, with its own tracking" "200|1" "$(P=$P2 D=$TODAY actj $OB MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"DPD","tracking_reference":"TRK-B-2","dispatched_on":E["D"],"estimated_delivery_date":"2026-01-01"}')|$(sent_count $OB ADDITIONAL_PARCEL_DISPATCHED)"
tc "  → the email names the parcel's tracking and never the partner" "$(mail_log | tail -1 | grep -q 'TRK-B-2' && ! mail_log | tail -1 | grep -qiE 'TEST MARKETPLACE|marketplace\.example|supplier|partner direct' && echo 1 || echo 0)"
t "parcel 2 delayed: a non-blocking PARCEL_DELAYED exception, DELIVERY_EXCEPTION once, customer updated" "200|0|1|1" "$(P=$P2 actj $OB UPDATE_SHIPMENT '{"shipment_id":int(E["P"]),"state":"DELAYED","notify_customer":True}')|$(q "SELECT blocking FROM fulfilment_exceptions WHERE order_id=$OB AND type='PARCEL_DELAYED'")|$(P=$P2 actj $OB UPDATE_SHIPMENT '{"shipment_id":int(E["P"]),"state":"DELAYED","notify_customer":True}' >/dev/null; notes $OB DELIVERY_EXCEPTION)|$(sent_count $OB DELIVERY_UPDATE)"
tc "  → the delay email tells the customer MCB is dealing with it, with no supplier or cost" "$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$OB AND message_type='DELIVERY_UPDATE'" | grep -qx 1 && mail_log | grep -q "taking longer than expected" && ! mail_log | grep -qiE 'TEST MARKETPLACE|contact the (supplier|partner)' && echo 1 || echo 0)"
t "the queue shows the open exception" 1 "$(queue_has "FULFILMENT_EXCEPTION:$(exc_id $OB PARCEL_DELAYED)")"
t "health notices the parcel past its estimated delivery" 1 "$(crm "$FC?view=health" >/dev/null; cj 'int(any(f["check"]=="DISPATCHED_PARCEL_OVERDUE" and f["order_id"]=='"$OB"' for f in d["findings"]))')"
t "parcel 2 delivered: now DELIVERED and COMPLETED, once" "200|done|COMPLETED|1|1" "$(P=$P2 D=$TODAY actj $OB MARK_SHIPMENT_DELIVERED '{"shipment_id":int(E["P"]),"delivered_on":E["D"]}')|$(jget outcome)|$(jget state)|$(evcount $OB ORDER.COMPLETED)|$(evcount $OB DELIVERED)"
t "  → completion does not wait for follow-up, review or permission" "NULL|yes|0|0" "$(q "SELECT IFNULL(follow_up_done_at,'NULL') FROM order_production WHERE order_id=$OB")|$(q "SELECT IF(follow_up_due_at IS NULL,'no','yes') FROM order_production WHERE order_id=$OB")|$(evcount $OB REVIEW.REQUESTED)|$(q "SELECT COUNT(*) FROM customer_content_permissions WHERE order_id=$OB")"
t "  → re-engagement hooks are prepared, nothing sent, consent required" "ANOTHER_MEMORY,ANNIVERSARY_FOLLOW_UP,RELATED_KEEPSAKE|PREPARED|1" "$(q "SELECT GROUP_CONCAT(hook ORDER BY hook) FROM lifecycle_hooks WHERE order_id=$OB")|$(q "SELECT GROUP_CONCAT(DISTINCT status) FROM lifecycle_hooks WHERE order_id=$OB")|$(q "SELECT MIN(requires_marketing_consent) FROM lifecycle_hooks WHERE order_id=$OB")"
post_json order-progress "$BPB" >/dev/null
t "customer page: delivered, both parcels delivered" "delivered|DELIVERED|DELIVERED" "$(jget stage)|$(jget parcels.0.status)|$(jget parcels.1.status)"
DELAYX=$(exc_id $OB PARCEL_DELAYED)
t "the delay exception is resolved by staff (no founder needed)" "200|RESOLVED|RESOLVED_DELIVERED" "$(OX=$DELAYX actj $OB RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"RESOLVED_DELIVERED","note":"Arrived two days late."}')|$(q "SELECT CONCAT_WS('|',status,resolution) FROM fulfilment_exceptions WHERE id=$DELAYX")"
t "  → resolving creates no new approval: one approval notification ever" "1" "$(notes $OB FULFILMENT_APPROVAL_REQUIRED)"

section "5. LOST PARCEL, REPLACEMENT AND FOUNDER-ACCEPTED PARTIAL DELIVERY"
to_ready '{"sku":"keepsake-12-picture-disc","email":"fc-c@example.com"}'; OC=$OID
founder_authorise $OC BELLA "$FOUNDER_CODE_BELLA" >/dev/null
act $OC RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-C-1","actual_purchase_cost_minor":4000,"actual_shipping_cost_minor":800,"send_email":false' >/dev/null
actj $OC ADD_SHIPMENT '{}' >/dev/null; C1=$(ship_id $OC 1)
P=$C1 D=$TODAY actj $OC MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Royal Mail","tracking_reference":"TRK-C-1","dispatched_on":E["D"],"send_email":False}' >/dev/null
t "a lost parcel raises a blocking PARCEL_LOST exception and tells the Founders" "200|LOST|1|1" "$(P=$C1 actj $OC MARK_SHIPMENT_LOST '{"shipment_id":int(E["P"])}')|$(q "SELECT state FROM shipments WHERE id=$C1")|$(q "SELECT blocking FROM fulfilment_exceptions WHERE order_id=$OC AND type='PARCEL_LOST'")|$(notes $OC DELIVERY_EXCEPTION)"
act $OC ISSUE_STATUS_LINK >/dev/null; CPB="{\"token\":\"$(link_token status)\"}"
tc "  → the customer page does not show a lost parcel or the word lost" "$(post_json order-progress "$CPB" >/dev/null; [ "$(cj 'len(d["parcels"])')" = 0 ] && ! grep -qi lost /tmp/tx.json && echo 1 || echo 0)"
LOSTX=$(exc_id $OC PARCEL_LOST)
t "it cannot be resolved as replaced before a replacement parcel exists" "422|replacement_parcel_required" "$(OX=$LOSTX actj $OC RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"REPLACEMENT_ARRANGED","note":"Replacement ordered."}')|$(jget error)"
actj $OC ADD_SHIPMENT '{}' >/dev/null; C2=$(ship_id $OC 2)
P=$C2 D=$TODAY actj $OC MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Royal Mail","tracking_reference":"TRK-C-2","dispatched_on":E["D"],"send_email":False}' >/dev/null
t "the replacement arrives, but the open blocking exception keeps the order incomplete" "partial|DISPATCHED|0" "$(P=$C2 D=$TODAY actj $OC MARK_SHIPMENT_DELIVERED '{"shipment_id":int(E["P"]),"delivered_on":E["D"]}' >/dev/null; jget outcome)|$(jget state)|$(evcount $OC ORDER.COMPLETED)"
t "resolved as replaced: the lost parcel is no longer awaited and the order completes" "200|COMPLETED|1|0" "$(OX=$LOSTX actj $OC RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"REPLACEMENT_ARRANGED","note":"Replacement delivered."}')|$(jget state)|$(evcount $OC ORDER.COMPLETED)|$(q "SELECT required FROM shipments WHERE id=$C1")"
to_ready '{"sku":"keepsake-7-picture-disc","players":[["vintage-smartphone-gramophone",1]],"email":"fc-d@example.com"}'; OD=$OID
founder_authorise $OD LEWIS "$FOUNDER_CODE_LEWIS" >/dev/null
act $OD RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-D-1","send_email":false' >/dev/null
actj $OD ADD_SHIPMENT '{}' >/dev/null; actj $OD ADD_SHIPMENT '{}' >/dev/null; D1=$(ship_id $OD 1); D2=$(ship_id $OD 2)
for P in $D1 $D2; do P=$P D=$TODAY actj $OD MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Royal Mail","dispatched_on":E["D"],"send_email":False}' >/dev/null; done
P=$D1 D=$TODAY actj $OD MARK_SHIPMENT_DELIVERED '{"shipment_id":int(E["P"]),"delivered_on":E["D"]}' >/dev/null
P=$D2 actj $OD MARK_SHIPMENT_LOST '{"shipment_id":int(E["P"])}' >/dev/null
DLOST=$(exc_id $OD PARCEL_LOST)
t "accepting partial delivery needs a founder's own code" "422|founder_required|DISPATCHED" "$(OX=$DLOST actj $OD RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"PARTIAL_DELIVERY_ACCEPTED","note":"Customer agreed."}')|$(jget error)|$(state_of $OD)"
t "  → a wrong code is refused and audited" "403|1" "$(OX=$DLOST actj $OD RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"PARTIAL_DELIVERY_ACCEPTED","note":"x","founder":"LEWIS","founder_code":"wrong-code-000000","confirm":True}')|$(evcount $OD FULFILMENT.AUTHORISATION_REFUSED)"
t "Lewis accepts partial delivery: the order completes, the decision attributed" "200|COMPLETED|LEWIS|PARTIAL_DELIVERY_ACCEPTED" "$(OX=$DLOST C="$FOUNDER_CODE_LEWIS" actj $OD RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"PARTIAL_DELIVERY_ACCEPTED","note":"Customer happy to keep the record; player refunded separately by the Founders.","founder":"LEWIS","founder_code":E["C"],"confirm":True}')|$(jget state)|$(q "SELECT resolution_authorised_by FROM fulfilment_exceptions WHERE id=$DLOST")|$(q "SELECT resolution FROM fulfilment_exceptions WHERE id=$DLOST")"
tc "  → no code is stored in the audit" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%not-real%' OR detail LIKE '%wrong-code%'")" = 0 ] && echo 1 || echo 0)"

section "6. COMMERCIAL SAFETY: EXCEPTION, NEVER A CANCELLATION"
python3 -c 'import json,sys;d=json.loads(sys.argv[1]);d["routes"][0]["expected_purchase_cost_minor"]=20000;print(json.dumps(d))' "$ROUTES_STANDARD" | write_routes
with_config "\$c['fulfilment']['commercial_safety']['suspend_new_sales']=true;"
STRIPE_BEFORE=$(stub_count)
to_ready '{"sku":"keepsake-12-picture-disc","email":"fc-e@example.com"}'; OE=$OID
TOTAL_E=$(q "SELECT total_minor FROM orders WHERE id=$OE")
STRIPE_AFTER_PAY=$(stub_count)
t "a negative expected contribution: COMMERCIAL_SAFETY_EXCEPTION, the Founders told once" "COMMERCIAL_SAFETY_EXCEPTION|OPEN|1" "$(q "SELECT status FROM order_economics WHERE order_id=$OE AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")|$(q "SELECT status FROM fulfilment_exceptions WHERE order_id=$OE AND type='COMMERCIAL_SAFETY_EXCEPTION'")|$(notes $OE COMMERCIAL_SAFETY_EXCEPTION)"
t "  → the paid order is not cancelled, changed or refunded" "PAID|$TOTAL_E|FULFILMENT.READY" "$(q "SELECT status FROM orders WHERE id=$OE")|$(q "SELECT total_minor FROM orders WHERE id=$OE")|$(state_of $OE)"
t "  → new sales of the product are suspended (configured) and the Founders told" "1|1" "$(q "SELECT COUNT(*) FROM product_sales_suspensions WHERE subject='keepsake-12-picture-disc' AND resumed_at IS NULL")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE notification_type='PRODUCT_SALES_SUSPENDED' AND subject_reference='keepsake-12-picture-disc'")"
tc "  → the notification carries no cost, margin or supplier" "$(payload_of $OE COMMERCIAL_SAFETY_EXCEPTION; grep -qiE '20000|contribution_minor|TEST SUPPLIER|supplier\.example|margin_basis' /tmp/np.json && echo 0 || echo 1)"
ctl $OE
tc "the decision card reports it would block under REQUIRED" "$(ctlj 'd["decision"]["would_block_if_required"]' | grep -q COMMERCIAL_SAFETY_EXCEPTION_UNRESOLVED && echo 1 || echo 0)"
t "authorising needs the commercial acknowledgement while it is open" "422|commercial_acknowledgement_required" "$(act $OE AUTHORISE_SUPPLIER_PURCHASE "$FOUNDER_JSON_BELLA")|$(jget error)"
SAFEX=$(exc_id $OE COMMERCIAL_SAFETY_EXCEPTION)
t "proceeding at the paid price is a founder decision" "422|founder_required" "$(OX=$SAFEX actj $OE RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"PROCEED_AT_PAID_PRICE","note":"Honour it."}')|$(jget error)"
t "Bella decides to proceed at the paid price" "200|RESOLVED|BELLA" "$(OX=$SAFEX C="$FOUNDER_CODE_BELLA" actj $OE RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"PROCEED_AT_PAID_PRICE","note":"Honour the customer price; review the route cost.","founder":"BELLA","founder_code":E["C"],"confirm":True}')|$(q "SELECT status FROM fulfilment_exceptions WHERE id=$SAFEX")|$(q "SELECT resolution_authorised_by FROM fulfilment_exceptions WHERE id=$SAFEX")"
t "  → authorisation then needs no commercial acknowledgement (no approval loop)" "200|FULFILMENT.AUTHORISED|1" "$(act $OE AUTHORISE_SUPPLIER_PURCHASE "$FOUNDER_JSON_BELLA")|$(jget state)|$(q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id=$OE AND type='COMMERCIAL_SAFETY_EXCEPTION'")"
tc "no Stripe request was made after payment (no refund, no charge)" "$([ "$(stub_count)" = "$STRIPE_AFTER_PAY" ] && echo 1 || echo 0)"
q "UPDATE product_sales_suspensions SET resumed_at=UTC_TIMESTAMP(), resumed_by='Test cleanup' WHERE resumed_at IS NULL" >/dev/null
restore_config

section "7. SUPPORT CASES AND EVIDENCE"
reset_limits
t "a damage report without evidence is accepted in full" "201|false" "$(post_json order-support "$(TOK=$BTOK js '{"token":E["TOK"],"kind":"DAMAGED_OR_FAULTY","item":"item-1","description":"The record sleeve arrived crushed at one corner."}')")|$(jget evidence.required)"
REQ=$(jget request_id)
t "  → a structured PARCEL_DAMAGED case, linked, and the Founders told" "PARCEL_DAMAGED|OPEN|1" "$(q "SELECT type FROM fulfilment_exceptions WHERE service_request_id=$REQ")|$(q "SELECT status FROM fulfilment_exceptions WHERE service_request_id=$REQ")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE dedupe_key='support:$OB:$REQ'")"
tc "  → the reply keeps consumer rights and asks for nothing as a condition" "$(grep -q 'normal consumer rights are not affected' /tmp/tx.json && ! grep -qiE 'must (send|provide)|required to' /tmp/tx.json && echo 1 || echo 0)"
t "wrong item and manufacturing defect are their own case types" "201|WRONG_ITEM|201|MANUFACTURING_DEFECT" "$(post_json order-support "$(TOK=$BTOK js '{"token":E["TOK"],"kind":"WRONG_ITEM","description":"This is not the record we ordered at all."}')")|$(q "SELECT type FROM fulfilment_exceptions WHERE service_request_id=$(jget request_id)")|$(post_json order-support "$(TOK=$BTOK js '{"token":E["TOK"],"kind":"MANUFACTURING_DEFECT","description":"The disc skips on the second track every time."}')")|$(q "SELECT type FROM fulfilment_exceptions WHERE service_request_id=$(jget request_id)")"
ev() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/order-evidence" -H "Origin: $ORIGIN" "$@"; }
t "a parcel photograph is added privately" "201|PARCEL_PHOTO|64|image/jpeg" "$(ev -F "token=$BTOK" -F "request_id=$REQ" -F kind=PARCEL_PHOTO -F "photo=@$FIX/photo-2500.jpg;filename=parcel.jpg")|$(q "SELECT kind FROM support_evidence WHERE service_request_id=$REQ ORDER BY id LIMIT 1")|$(q "SELECT LENGTH(stored_name) FROM support_evidence WHERE service_request_id=$REQ ORDER BY id LIMIT 1")|$(q "SELECT mime_type FROM support_evidence WHERE service_request_id=$REQ ORDER BY id LIMIT 1")"
t "an unboxing video is a reference, not an upload" "201|UNBOXING_VIDEO_REFERENCE|NULL" "$(ev -F "token=$BTOK" -F "request_id=$REQ" -F kind=UNBOXING_VIDEO_REFERENCE -F "reference=On my phone, recorded on arrival")|$(q "SELECT kind FROM support_evidence WHERE service_request_id=$REQ ORDER BY id DESC LIMIT 1")|$(q "SELECT IFNULL(stored_name,'NULL') FROM support_evidence WHERE service_request_id=$REQ ORDER BY id DESC LIMIT 1")"
printf '<?php echo 1; ?>' > /tmp/fc-evil.jpg
t "a non-image file is refused" "415" "$(ev -F "token=$BTOK" -F "request_id=$REQ" -F kind=PRODUCT_PHOTO -F "photo=@/tmp/fc-evil.jpg;filename=product.jpg")"
t "without a token nothing is added" "404" "$(ev -F "token=nope" -F "request_id=$REQ" -F kind=PARCEL_PHOTO -F "reference=x")"
t "  → missing evidence never closes or refuses the case" "OPEN" "$(q "SELECT status FROM order_service_requests WHERE id=$REQ")"
EVID=$(q "SELECT id FROM support_evidence WHERE service_request_id=$REQ AND stored_name IS NOT NULL LIMIT 1")
t "evidence downloads need the CRM key and a staff name, and are audited" "401|422|200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$FC?evidence_id=$EVID&staff=X")|$(crm "$FC?evidence_id=$EVID")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$FC?evidence_id=$EVID&staff=Support%20Tester" -H "Authorization: Bearer $CRMKEY")|$(evcount $OB SUPPORT.EVIDENCE_DOWNLOADED)"
ctl $OB
t "the workspace lists the evidence and the cases" "2|3" "$(ctlj 'len(d["evidence"])')|$(ctlj 'len([e for e in d["exceptions"] if e["service_request_id"]])')"

section "8. REVIEW REQUEST AND MARKETING PERMISSION ARE SEPARATE"
t "a review request offering an incentive is refused" "422|incentive_refused" "$(act $OB RECORD_REVIEW_REQUEST '"channel":"WHATSAPP","incentive_offered":true')|$(jget error)"
t "a review requested by WhatsApp is recorded, once" "200|1" "$(act $OB RECORD_REVIEW_REQUEST '"channel":"WHATSAPP"')|$(act $OB RECORD_REVIEW_REQUEST '"channel":"WHATSAPP"' >/dev/null; evcount $OB REVIEW.REQUESTED)"
t "  → a review request grants no content permission" "0" "$(q "SELECT COUNT(*) FROM customer_content_permissions WHERE order_id=$OB")"
t "a permission without evidence of consent is refused" "422|permission_evidence_required" "$(act $OB RECORD_CONTENT_PERMISSION '"scope":"PHOTOGRAPHS","status":"GRANTED"')|$(jget error)"
t "an explicit permission is recorded per scope with its evidence" "200|GRANTED|EMAIL|Email 2026-09-15 from customer" "$(act $OB RECORD_CONTENT_PERMISSION '"scope":"REVIEW_QUOTE","status":"GRANTED","granted_via":"EMAIL","evidence_reference":"Email 2026-09-15 from customer"')|$(q "SELECT CONCAT_WS('|',status,granted_via,evidence_reference) FROM customer_content_permissions WHERE order_id=$OB AND scope='REVIEW_QUOTE'")"
t "  → other scopes stay ungranted; a scope never granted cannot be withdrawn; withdrawal is recorded" "1|unchanged|WITHDRAWN|yes" "$(q "SELECT COUNT(*) FROM customer_content_permissions WHERE order_id=$OB")|$(act $OB RECORD_CONTENT_PERMISSION '"scope":"PHOTOGRAPHS","status":"WITHDRAWN"' >/dev/null; jget outcome)|$(act $OB RECORD_CONTENT_PERMISSION '"scope":"REVIEW_QUOTE","status":"WITHDRAWN"' >/dev/null; q "SELECT status FROM customer_content_permissions WHERE order_id=$OB AND scope='REVIEW_QUOTE'")|$(q "SELECT IF(withdrawn_at IS NULL,'no','yes') FROM customer_content_permissions WHERE order_id=$OB AND scope='REVIEW_QUOTE'")"

section "9. HEALTH, METRICS, SCORECARDS AND THE COMMAND CENTRE"
to_ready '{"sku":"keepsake-12-picture-disc","email":"fc-f@example.com"}'; OF=$OID
founder_authorise $OF BELLA "$FOUNDER_CODE_BELLA" >/dev/null
paid_order '{"sku":"keepsake-12-picture-disc","email":"fc-g@example.com"}'; OG=$OID
q "DELETE FROM order_events WHERE order_id=$OG AND dedupe_key='ready-for-processing'" >/dev/null
q "UPDATE order_production SET follow_up_due_at=NULL WHERE order_id=$OC" >/dev/null
EVENTS_BEFORE=$(q "SELECT COUNT(*) FROM order_events")
crm "$FC?view=health" >/dev/null; cp /tmp/tx.json /tmp/fc-health.json
has() { cj 'int(any(f["check"]=="'"$1"'" and f["order_id"]=='"$2"' for f in d["findings"]))' /tmp/fc-health.json; }
t "health: a paid order with no processing event" 1 "$(has PAID_ORDER_WITHOUT_PROCESSING_EVENT $OG)"
t "health: an authorised order with no supplier order" 1 "$(has AUTHORISED_WITHOUT_SUPPLIER_ORDER $OF)"
t "health: a supplier order past its expected dispatch with no parcel sent" 1 "$(has SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH $OA)"
t "health: a completed order with no follow-up scheduled" 1 "$(has COMPLETED_WITHOUT_FOLLOW_UP $OC)"
t "health: unresolved exceptions" 1 "$(has UNRESOLVED_FULFILMENT_EXCEPTION $OB)"
q "UPDATE order_production SET fulfilment_state='DELIVERED', stage='FULFILMENT' WHERE order_id=$OA" >/dev/null
q "INSERT INTO manufacturing_packages (order_id, version, status, blockers, body, body_sha256, created_by) VALUES ($OF, 99, 'READY', '[]', '{}', SHA2('fc-health',256), 'Health Test')" >/dev/null
q "DELETE FROM founder_notifications WHERE order_id=$OF AND notification_type='FULFILMENT_APPROVAL_REQUIRED'" >/dev/null
q "UPDATE founder_notifications SET status='ABANDONED' WHERE order_id=$OE AND notification_type='COMMERCIAL_SAFETY_EXCEPTION'" >/dev/null
crm "$FC?view=health" >/dev/null; cp /tmp/tx.json /tmp/fc-health.json
t "health: delivered but not completed; READY package with no founder notification; abandoned notification" "1|1|1" "$(has DELIVERED_NOT_COMPLETED $OA)|$(has READY_PACKAGE_WITHOUT_FOUNDER_NOTIFICATION $OF)|$(has ABANDONED_NOTIFICATION $OE)"
t "  → health changes nothing" "$EVENTS_BEFORE" "$(q "SELECT COUNT(*) FROM order_events")"
t "  → the queue carries the stranded orders" "1|1" "$(queue_has "FULFILMENT_HEALTH:$OA:DELIVERED_NOT_COMPLETED")|$(queue_has "FULFILMENT_HEALTH:$OA:SUPPLIER_ORDER_WITHOUT_TRACKING")"
t "metrics: supplier orders, spend, variance (internal; no automatic decision)" "200|5|True" "$(crm "$FC?view=metrics")|$(jget metrics.supplier_orders)|$(cj 'str(d["metrics"]["cost_variance_minor"]==100 and "No financial decision" in d["metrics"]["note"] and d["internal"] is True)')"
t "scorecards per route; no supplier replaced automatically" "200|3|1|True" "$(crm "$FC?view=scorecards")|$(cj '[s for s in d["scorecards"] if s["route_id"]=="TEST-ROUTE-K12"][0]["fulfilments"]')|$(cj '[s for s in d["scorecards"] if s["route_id"]=="TEST-ROUTE-PLAYER"][0]["fulfilments"]')|$(cj 'str("No supplier is replaced automatically" in d["note"])')"
t "the command centre: approvals, supplier orders required, exceptions, revenue" "200|True" "$(crm "$FC?view=today")|$(cj 'str(all(k in d["today"] for k in ["new_paid_orders","revenue_minor","orders_creating","qc_required","founder_approvals_required","supplier_orders_required","dispatched","delivered_today","open_exceptions","estimated_gross_contribution_minor","actual_gross_contribution_minor"]) and d["today"]["open_exceptions"]>=1 and d["today"]["supplier_orders_required"]>=1)')"
t "every controller view needs the CRM key" "401|401|401|401" "$(for v in today metrics scorecards health; do curl -s -o /dev/null -w '%{http_code}' "$BASE/$FC?view=$v"; printf '|'; done | sed 's/|$//')"

section "10. NOTIFICATIONS, BRIDGE AND SAFETY"
wk '{"action":"CLAIM","worker":"fc-bridge-test","limit":3}' >/dev/null; cp /tmp/tx.json /tmp/fc-claim.json
N1=$(cj 'd["notifications"][0]["id"]' /tmp/fc-claim.json); T1=$(cj 'd["notifications"][0]["claim_token"]' /tmp/fc-claim.json)
N2=$(cj 'd["notifications"][1]["id"]' /tmp/fc-claim.json); T2=$(cj 'd["notifications"][1]["claim_token"]' /tmp/fc-claim.json)
N3=$(cj 'd["notifications"][2]["id"]' /tmp/fc-claim.json); T3=$(cj 'd["notifications"][2]["claim_token"]' /tmp/fc-claim.json)
t "an unknown delivery channel is refused" "422|invalid_channel" "$(ack $N3 $T3 DELIVERED PIGEON)|$(jget error)"
t "the bridge may deliver by Telegram, email fallback or the staff queue" "200|200|200" "$(ack $N1 $T1 DELIVERED EMAIL_FALLBACK)|$(ack $N2 $T2 DELIVERED STAFF_QUEUE)|$(ack $N3 $T3 DELIVERED TELEGRAM)"
t "  → the channel is recorded" "EMAIL_FALLBACK|STAFF_QUEUE" "$(q "SELECT delivered_channel FROM founder_notifications WHERE id=$N1")|$(q "SELECT delivered_channel FROM founder_notifications WHERE id=$N2")"
t "acknowledging again is idempotent" "already_delivered" "$(ack $N1 $T1 DELIVERED EMAIL_FALLBACK >/dev/null; jget outcome)"
tc "no Telegram token, bot URL or TaskNotify credential exists in the code or config example" "$(grep -rniE 'api\.telegram\.org|bot[0-9]{6,}:|tasknotify.*(key|token|secret)' public/api src --include='*.php' --include='*.ts' --include='*.tsx' | grep -q . && echo 0 || echo 1)"
tc "new customer messages exist and never tell the customer to contact the partner" "$(for ty in ADDITIONAL_PARCEL_DISPATCHED DELIVERY_UPDATE DELIVERED; do grep -q "'$ty' =>" public/api/lib/lifecycle-messages.php || echo X; done | grep -q X && echo 0 || (grep -qiE 'contact (the )?(supplier|partner|manufacturer)' public/api/lib/lifecycle-messages.php && echo 0 || echo 1))"
tc "enforcement stayed ADVISORY throughout (config restored)" "$(grep -q "'enforcement'" public/api/config.php && echo 0 || echo 1)"
tc "no live key, supplier purchase or refund path in the new code" "$(grep -rniE 'sk_live|rk_live|\/v1\/refunds|checkout.*supplier.*(submit|pay)' public/api/lib/fulfilment-controller.php public/api/crm/fulfilment.php public/api/order-evidence.php | grep -q . && echo 0 || echo 1)"
rm -f "$ROUTES"; settle
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
t "preflight: migration applied; supplier routes missing is a warning" "PASS|WARN" "$(pf fulfilment_controller_migration_applied)|$(pf supplier_routes)"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
