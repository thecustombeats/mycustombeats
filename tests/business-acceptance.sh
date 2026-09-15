#!/bin/bash
# MCB™ BUSINESS & PROFIT INTELLIGENCE (16 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# Management figures calculated from recorded data. Nothing is spent, refunded,
# purchased or repriced: payments are TEST (a few orders are marked live in the
# database to rehearse live totals), Stripe and Resend are local stubs.
#
# Covers: Moment £15 and Moment + video £64; live vs TEST; paid revenue, full
# and partial refunds and net paid; unknown costs never £0; expected vs actual;
# contribution only from complete orders, never called profit; the direct-cost
# entries (no double counting, currency, notes, voids); product performance,
# Moment and video attachment; video capacity pending verification and video
# cost not free; enhancements; replacement authorisation is not spend until its
# cost is recorded; support and root causes; supplier routes staff-only; sample
# sizes; funnel coverage; customers; structured-only cruise and occasions;
# country without addresses; thresholds never invented; alerts change nothing;
# Europe/London business time and actual-first payment fees (founder decisions);
# foreign currency never converted; CSV without private
# content (audited, formula-safe); data quality; evidence-based recommendations;
# no model, paid API, refund or purchase.

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

CJ=public/api/data/creative.json
STAFFQ="staff=Creative%20Tester"
ref_of() { q "SELECT mcb_reference FROM orders WHERE id=$1"; }
evcount() { q "SELECT COUNT(*) FROM order_events WHERE order_id=$1 AND event_type='$2'"; }
cget() { crm "crm/creative?order_id=$1&$STAFFQ"; }
cpost() { crmpost crm/creative "$1"; }
# cj PYTHON_EXPR over d = /tmp/tx.json (or $2)
cj() { python3 -c 'import json,sys; d=json.load(open(sys.argv[2])); r=eval(sys.argv[1]); print(json.dumps(r,separators=(",",":")) if isinstance(r,(dict,list,bool)) or r is None else r)' "$1" "${2:-/tmp/tx.json}"; }
# js PYTHON_EXPR → JSON, with E = environment (bash 3.2 mangles escaped quotes inside "$(…)", so bodies are built here)
js() { python3 -c 'import json,os,sys; E=os.environ; print(json.dumps(eval(sys.argv[1]),ensure_ascii=False))' "$1"; }
cfile() { local oid=$1 ref=$2 job=$3 file=$4; shift 4
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/creative-file" -H "Authorization: Bearer $CRMKEY" \
    -F action=REGISTER_CANDIDATE -F "order_id=$oid" -F "reference=$ref" -F "job_id=$job" -F "staff=Creative Tester" "$@" -F "audio=@$file"; }
jobs_of() { q "SELECT GROUP_CONCAT(id ORDER BY track_number) FROM creative_jobs WHERE order_id=$1"; }
jstatus() { q "SELECT status FROM creative_jobs WHERE id=$1"; }
# pay ORDER EVENT_ID → pays with a chosen event id, so the same event can be delivered again
pay_with() { local total sid; total=$(q "SELECT total_minor FROM orders WHERE id=$1"); sid=$(session_id_for "$1"); hook "$(pay_event "$2" "$sid" "$1" "$total" gbp)"; }
# lyrics JOB TRACK WORDS... → a lyric package referencing the track's memory, with distinct words
lyrics_body() { OID=$1 JOB=$2 TRACK=$3 VERSE="$4" CHORUS="$5" EXTRA_REFS="${6:-}" js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Chapter "+E["TRACK"]+" "+E["CHORUS"].split()[0],"sections":[{"type":"INTRO","text":"","direction":"soft piano"},{"type":"VERSE","text":E["VERSE"],"fact_refs":["M"+E["TRACK"]+"-STORY"]+[r for r in E["EXTRA_REFS"].split(",") if r],"emotional_intention":"warm"},{"type":"CHORUS","text":E["CHORUS"],"fact_refs":[]},{"type":"OUTRO","text":""}]}}'; }
# complete_song ORDER REF JOB TRACK VERSE CHORUS → lyrics reviewed, manual candidate (195 s), creative QC, master
CRITERIA='{"emotional_impact":"PASS","lyric_quality":"PASS","vocal_quality":"PASS","musical_quality":"PASS","production_quality":"PASS","genre_fit":"PASS","story_fit":"PASS","memorability":"PASS","pronunciation":"PASS","premium_standard":"PASS"}'
complete_song() {
  cpost "$(lyrics_body "$1" "$3" "$4" "$5" "$6")" >/dev/null
  [ "$(jstatus $3)" = LYRICS_REVIEW_REQUIRED ] && cpost "$(OID=$1 JOB=$3 js '{"action":"LYRICS_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"outcome":"PASS"}')" >/dev/null
  cfile "$1" "$2" "$3" "$FIX/${7:-audio-195s.flac}" >/dev/null
  local cid; cid=$(q "SELECT MAX(id) FROM creative_candidates WHERE job_id=$3")
  cpost "$(OID=$1 CID=$cid C="$CRITERIA" js '{"action":"CREATIVE_QC","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"]),"criteria":json.loads(E["C"]),"outcome":"PASS"}')" >/dev/null
  cpost "$(OID=$1 CID=$cid js '{"action":"PROMOTE_MASTER","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"])}')" >/dev/null
}

AJ=public/api/data/artwork.json
PF="crm/production-files"
pfget() { crm "$PF?order_id=$1&$STAFFQ"; }
pfpostj() { crmpost "$PF" "$1"; }
unit_of() { q "SELECT id FROM order_units WHERE order_id=$1 AND kind='SONG' LIMIT 1"; }
ajob_of() { q "SELECT id FROM artwork_creative_jobs WHERE order_id=$1 LIMIT 1"; }
comp() { q "SELECT id FROM order_artwork WHERE order_id=$1 AND template_id='$2'"; }
photos_of() { q "SELECT GROUP_CONCAT(upload_id) FROM image_preparation_records WHERE order_id=$1"; }
# art ORDER REF JOB SOURCES FILE [METHOD] → code (/tmp/tx.json)
art() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/$PF" -H "Authorization: Bearer $CRMKEY" -F action=REGISTER_ART_MASTER \
  -F "order_id=$1" -F "reference=$2" -F "artwork_job_id=$3" -F "source_upload_ids=$4" -F "creation_method=${6:-MANUAL_DESIGN}" -F "staff=Production Tester" -F "art=@$5"; }
VQC_ALL='{"correct_photographs":"PASS","correct_names":"PASS","correct_dates":"PASS","correct_title":"PASS","correct_occasion":"PASS","spelling":"PASS","image_quality":"PASS","crop_composition":"PASS","facial_visibility":"NOT_APPLICABLE","text_legibility":"PASS","visual_balance":"PASS","premium_standard":"PASS","mcb_branding":"NOT_APPLICABLE","no_other_customer_material":"PASS"}'
vqc() { OID=$1 AM=$2 OUT=$3 C="${4:-$VQC_ALL}" pfpostj "$(OID=$1 AM=$2 OUT=$3 C="${4:-$VQC_ALL}" js '{"action":"VISUAL_QC","order_id":int(E["OID"]),"staff":"Production Tester","art_master_id":int(E["AM"]),"outcome":E["OUT"],"criteria":json.loads(E["C"])}')"; }
# print ORDER ARTWORK_ID ART_MASTER SKU REF TEMPLATE VERSION FILE [extra -F …] → code
print_file() { local oid=$1 aid=$2 am=$3 sku=$4 ref=$5 tpl=$6 ver=$7 file=$8; shift 8
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/artwork" -H "Authorization: Bearer $CRMKEY" \
    -F "order_id=$oid" -F "artwork_id=$aid" -F "art_master_id=$am" -F "sku=$sku" -F "reference=$ref" -F "template_id=$tpl" -F "template_version=$ver" -F "staff=Production Tester" "$@" -F "output=@$file"; }
build() { pfpostj "{\"action\":\"BUILD_MANUFACTURING_PACKAGE\",\"order_id\":$1,\"staff\":\"Production Tester\"}"; }

CC="crm/command-centre"
STAFFQ="staff=Founder%20Tester"
cc() { crm "$CC?$1&$STAFFQ"; }
ccpost() { crmpost "$CC" "$1"; }
ov() { cc "view=overview&period=${1:-today}" >/dev/null; cp /tmp/tx.json /tmp/cc-ov.json; }
ovj() { cj "$1" /tmp/cc-ov.json; }
SONG_YES='{"story":"YES","names":"YES","professional":"YES","vocals":"YES","emotion":"YES","style":"YES","pronunciation":"YES","standard":"YES"}'
SONG_NO='{"story":"YES","names":"YES","professional":"YES","vocals":"NO","emotion":"YES","style":"YES","pronunciation":"YES","standard":"YES"}'
ART_YES='{"customer":"YES","photo":"YES","names_dates":"YES","spelling":"YES","composition":"YES","content_safe":"YES","premium":"YES","faces":"NOT_APPLICABLE","branding":"NOT_APPLICABLE"}'
ART_NO='{"customer":"YES","photo":"YES","names_dates":"YES","spelling":"NO","composition":"YES","content_safe":"YES","premium":"YES","faces":"NOT_APPLICABLE","branding":"NOT_APPLICABLE"}'
song_qc() { OID=$1 CID=$2 A="$3" D=$4 js '{"action":"SONG_QUALITY_CHECK","order_id":int(E["OID"]),"candidate_id":int(E["CID"]),"answers":json.loads(E["A"]),"decision":E["D"],"staff":"Founder Tester"}'; }
art_qc() { OID=$1 AID=$2 A="$3" D=$4 js '{"action":"ARTWORK_QUALITY_CHECK","order_id":int(E["OID"]),"art_master_id":int(E["AID"]),"answers":json.loads(E["A"]),"decision":E["D"],"staff":"Founder Tester"}'; }
cand_of() { q "SELECT MAX(id) FROM creative_candidates WHERE job_id=$1"; }
events_total() { q "SELECT COUNT(*) FROM order_events"; }


VJ=public/api/data/video.json
VSKU=memory-music-video
STAFFQ="staff=Video%20Tester"
eval "$(declare -f build_order | sed '1s/build_order/build_order_base/')"
# build_order with "video":[unit,memory] (flag + line), "video_flag_only":[u,m], "video_line_only":1, "video_qty":N
build_order() {
  local base; base=$(build_order_base "$1")
  python3 - "$1" "$base" <<'PY'
import json, sys
spec = json.loads(sys.argv[1]); body = json.loads(sys.argv[2])
flag = spec.get("video") or spec.get("video_flag_only")
if flag:
    u, m = flag
    body["personalisation"]["units"][u-1]["memories"][m-1]["video"] = True
if spec.get("video") or spec.get("video_line_only"):
    body["lines"].append({"sku": "memory-music-video", "quantity": spec.get("video_qty", 1)})
print(json.dumps(body, separators=(",", ":"), ensure_ascii=False))
PY
}
vget() { crm "crm/video?$1&$STAFFQ"; }
vpost() { crmpost crm/video "$1"; }
vact() { OID=$1 JOB=$2 A=$3 X="${4:-}" js '{**{"action":E["A"],"order_id":int(E["OID"]),"video_job_id":int(E["JOB"]),"staff":"Video Tester"},**(json.loads(E["X"]) if E["X"] else {})}'; }
tokjob() { TOK_=$1 JOB_=$2 EXTRA_="${3:-}" js '{**{"token":E["TOK_"],"videoJobId":int(E["JOB_"])},**(json.loads(E["EXTRA_"]) if E["EXTRA_"] else {})}'; }
tokonly() { TOK_=$1 js '{"token":E["TOK_"]}'; }
job_of() { q "SELECT id FROM video_jobs WHERE order_id=$1 LIMIT 1"; }
jstat() { q "SELECT status FROM video_jobs WHERE id=$1"; }
avail() { get video-availability >/dev/null; cp /tmp/tx.json /tmp/va.json; }
# mkmp4 FILE SECONDS WIDTH HEIGHT — a minimal, header-valid MP4 (ftyp + moov/mvhd + trak/tkhd + mdat)
mkmp4() { python3 - "$@" <<'PY'
import struct, sys
path, secs, w, h = sys.argv[1], float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
box = lambda t, b: struct.pack(">I", 8 + len(b)) + t + b
scale = 1000; dur = int(secs * scale)
mvhd = box(b"mvhd", b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, scale, dur) + b"\x00" * 80)
tkhd = box(b"tkhd", b"\x00\x00\x00\x07" + struct.pack(">IIIII", 0, 0, 1, 0, dur) + b"\x00" * 8 + b"\x00" * 8 + b"\x00" * 36 + struct.pack(">II", w << 16, h << 16))
moov = box(b"moov", mvhd + box(b"trak", tkhd))
data = box(b"ftyp", b"isom" + struct.pack(">I", 512) + b"isomavc1mp41") + moov + box(b"mdat", b"MCBTESTVIDEO" * 200 + sys.argv[1].encode())
open(path, "wb").write(data)
PY
}
cand() { local oid=$1 ref=$2 job=$3 file=$4; shift 4
  curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/video" -H "Authorization: Bearer $CRMKEY" -F action=REGISTER_CANDIDATE -F "order_id=$oid" -F "reference=$ref" -F "video_job_id=$job" -F "staff=Video Tester" "$@" -F "video=@$file;type=video/mp4"; }
VQ_YES='{"customer":"YES","song":"YES","whole_song":"YES","photographs":"YES","names":"YES","timing":"YES","transitions":"YES","defects":"YES","other_customer":"YES","sync":"YES","quality":"YES","emotion":"YES","standard":"YES","branding":"NOT_APPLICABLE"}'
VQ_NO='{"customer":"YES","song":"YES","whole_song":"YES","photographs":"YES","names":"YES","timing":"NO","transitions":"YES","defects":"YES","other_customer":"YES","sync":"YES","quality":"YES","emotion":"YES","standard":"YES","branding":"NOT_APPLICABLE"}'
vqc() { OID=$1 CID=$2 A="$3" D=$4 js '{"action":"VIDEO_QUALITY_CHECK","order_id":int(E["OID"]),"candidate_id":int(E["CID"]),"answers":json.loads(E["A"]),"decision":E["D"],"staff":"Founder Tester"}'; }
vmedia() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/order-video-media" -H "Origin: $ORIGIN" -F "token=$1" -F "videoJobId=$2" "${@:3}"; }
song_to_master() { # ORDER REF [FIXTURE]
  local mj; mj=$(jobs_of $1)
  act $1 START_CREATIVE >/dev/null
  complete_song $1 $2 $mj 1 "Twenty five years of harbour lights and every tide together" "Still the harbour" "${3:-audio-195s.flac}"
}
TMPV=$(mktemp -d)

stub_reset
reset_limits


CARE="crm/support"
CAREQ="staff=Care%20Tester"
cget() { crm "$CARE?$1&$CAREQ"; }
# care ACTION CASE [PYTHON_DICT_EXPR extra, E = env] → code (/tmp/tx.json)
care() { local spec="${3:-}" extra; [ -z "$spec" ] && spec='{}'; extra=$(js "$spec"); crmpost "$CARE" "$(python3 -c 'import json,sys;d=json.loads(sys.argv[3]);d.update({"action":sys.argv[1],"case_id":int(sys.argv[2]),"staff":"Care Tester"});print(json.dumps(d))' "$1" "$2" "$extra")"; }
# help TOKEN PYTHON_DICT_EXPR → code (/tmp/tx.json): the customer's "Need help with your order?"
help_req() { post_json order-support "$(TOK_=$1 js '{**{"token":E["TOK_"]},**('"$2"')}')"; }
case_msg() { post_json order-support-case "$(TOK_=$1 CID_=$2 MSG_="$3" js '{"token":E["TOK_"],"case_id":int(E["CID_"]),"action":"message","message":E["MSG_"]}')"; }
case_sat() { post_json order-support-case "$(TOK_=$1 CID_=$2 A_="$3" js '{"token":E["TOK_"],"case_id":int(E["CID_"]),"action":"satisfaction","answer":E["A_"]}')"; }
progress() { post_json order-progress "$(tokonly $1)" >/dev/null; cp /tmp/tx.json /tmp/progress.json; }
pj() { cj "$1" /tmp/progress.json; }
cstat() { q "SELECT status FROM order_service_requests WHERE id=$1"; }
ev() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/order-evidence" -H "Origin: $ORIGIN" "$@"; }

BIZ="crm/business"
BIZQ="staff=Business%20Tester"
biz() { crm "$BIZ?section=$1&$BIZQ" >/dev/null; cp /tmp/tx.json /tmp/biz-$1.json; }
bj() { cj "$2" /tmp/biz-$1.json; }
cost() { local spec="$1"; crmpost "$BIZ" "$(python3 -c 'import json,sys;d=json.loads(sys.argv[1]);d.update({"action":"RECORD_DIRECT_COST","staff":"Business Tester"});print(json.dumps(d))' "$spec")"; }
# live_paid SPEC → OID paid, then marked live in the database (rehearsing live totals; test data only)
live_paid() { paid_order "$1"; q "UPDATE orders SET stripe_livemode = 1 WHERE id=$OID" >/dev/null; }
STRIPE_AT_START=$(stub_count)

stub_reset
reset_limits

section "1. A NEW BUSINESS WITH NO ORDERS"
t "the business policy is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/business.json")"
t "the Business API needs the CRM key and a staff name" "401|422" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$BIZ?section=overview&$BIZQ")|$(crm "$BIZ?section=overview")"
biz overview
t "no orders: revenue zero, contribution awaiting data from 0 of 0, no false figures" "0|0|null|null|0 of 0 paid orders" "$(bj overview 'd["revenue"]["today"]["gross_paid_minor"]')|$(bj overview 'd["revenue"]["all"]["orders"]')|$(bj overview 'd["revenue"]["all"]["average_order_minor"]')|$(bj overview 'd["contribution"]["all"]["actual"]["contribution_minor"]')|$(bj overview 'd["contribution"]["all"]["actual"]["based_on"]')"
t "thresholds are never invented: every configurable alert is NOT CONFIGURED" "NOT_CONFIGURED,NOT_CONFIGURED,NOT_CONFIGURED,NOT_CONFIGURED,NOT_CONFIGURED,NOT_CONFIGURED" "$(bj overview '",".join(a["status"] for a in d["alerts"]["alerts"] if a["type"] in ("LOW_CONTRIBUTION","COST_VARIANCE_HIGH","REFUND_RATE_ELEVATED","REPLACEMENT_RATE_ELEVATED","SUPPLIER_EXCEPTION_ELEVATED","DATA_COMPLETENESS_LOW"))')"
t "business time is Europe/London by founder decision (never where anyone happens to be)" "Europe/London|True|CONFIGURED|FOUNDER_DECISION" "$(bj overview 'd["timezone"]["timezone"]')|$(bj overview 'str(d["timezone"]["configured"])')|$(bj overview 'd["timezone"]["status"]')|$(bj overview 'd["timezone"]["source"]')"
t "the brief: no sales yet, video 0/45 pending Mozart verification" "null|0|45|PENDING MOZART VERIFICATION" "$(bj overview 'd["brief"]["most_units_today"]')|$(bj overview 'd["brief"]["video"]["used"]')|$(bj overview 'd["brief"]["video"]["planned"]')|$(bj overview 'd["brief"]["video"]["label"]')"
tc "gross contribution is defined, and never as net profit, EBITDA or accounting profit" "$(bj overview 'str(any(x["term"]=="Gross contribution" and "not net profit" in x["meaning"] for x in d["definitions"]))' | grep -qx True && ! grep -ohiE '"(label|title|term)":"[^"]*(net profit|ebitda|accounting profit|profit after tax)' /tmp/biz-overview.json | grep -q . && echo 1 || echo 0)"
t "Moment is £15; Moment + one Memory Music Video is £64 (server quote)" "1500|6400" "$(price moment)|$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1},{"sku":"memory-music-video","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null; jget subtotal_minor)"

ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS bia; DROP DATABASE IF EXISTS bib; CREATE DATABASE bia; CREATE DATABASE bib;' 2>/dev/null
ROOTQ bia < db/schema.sql 2>/dev/null
git show 720c556a:db/schema.sql | ROOTQ bib 2>/dev/null
ROOTQ bib < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null; B1=$?
ROOTQ bib < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null; B2=$?
ROOTQ bib < db/migrations/2026-09-16-supplier-routing.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the business migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$B1" = 0 ] && [ "$B2" = 0 ] && [ "$(dumpdb bia | shasum)" = "$(dumpdb bib | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE bia; DROP DATABASE bib;' 2>/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
crm crm/preflight >/dev/null
t "deployment preflight checks the business migration" "PASS" "$(pf business_intelligence_migration_applied)"

section "2. REVENUE: LIVE ONLY, TEST SEPARATE, FOREIGN CURRENCY NEVER CONVERTED"
live_paid '{"sku":"moment","email":"biz-m1@example.com","units":[{"memories":[{"occasion":"anniversary","story":"We met on a cruise ship deck, forty years ago."}]}]}'; M1=$OID; M1REF=$(ref_of $M1)
live_paid '{"sku":"moment","email":"biz-mv@example.com","video":[1,1],"units":[{"memories":[{"occasion":"cruise"}]}]}'; MV=$OID; MVREF=$(ref_of $MV)
paid_order '{"sku":"moment","email":"biz-test@example.com"}'; TO=$OID
live_paid '{"sku":"moment","email":"biz-usd@example.com"}'; US=$OID
q "UPDATE orders SET currency='USD', total_minor=1900 WHERE id=$US" >/dev/null
biz overview
t "gross paid today counts live GBP orders only: £15 + £64" "7900|2|3950" "$(bj overview 'd["revenue"]["today"]["gross_paid_minor"]')|$(bj overview 'd["revenue"]["today"]["orders"]')|$(bj overview 'd["revenue"]["today"]["average_order_minor"]')"
t "  → the TEST payment is shown separately and never added in" "1|1500" "$(bj overview 'd["revenue"]["today"]["test"]["orders"]')|$(bj overview 'd["revenue"]["today"]["test"]["gross_paid_minor"]')"
t "  → the USD order keeps its own currency and amount; no GBP equivalent is invented" "USD|1|1900|1" "$(bj overview 'd["revenue"]["today"]["other_currencies"][0]["currency"]')|$(bj overview 'd["revenue"]["today"]["other_currencies"][0]["orders"]')|$(bj overview 'd["revenue"]["today"]["other_currencies"][0]["gross_paid_minor"]')|$(biz data; bj data '[g["count"] for g in d["data_quality"]["gaps"] if g["key"]=="foreign_currency_orders"][0]')"

section "3. UNKNOWN COSTS ARE NEVER ZERO; EXPECTED AND ACTUAL STAY APART"
biz overview
t "no payment fee recorded: the Moment order's actual contribution is awaiting data (0 of 2 complete)" "null|0|2|2" "$(bj overview 'd["contribution"]["all"]["actual"]["contribution_minor"]')|$(bj overview 'd["contribution"]["all"]["actual"]["complete_orders"]')|$(bj overview 'd["contribution"]["all"]["actual"]["incomplete_orders"]')|$(bj overview 'd["contribution"]["all"]["actual"]["awaiting"]["PAYMENT_PROCESSING_FEE"]')"
t "costs recorded elsewhere cannot be entered by hand (no double counting)" "422|recorded_elsewhere|422|recorded_elsewhere|422|recorded_elsewhere" "$(R=$M1REF cost '{"order_reference":"'"$M1REF"'","category":"SUPPLIER_PRODUCT_COST","basis":"ACTUAL","amount_minor":100}')|$(jget error)|$(cost '{"order_reference":"'"$MVREF"'","category":"VIDEO_PRODUCTION_COST","basis":"ACTUAL","amount_minor":500}')|$(jget error)|$(cost '{"order_reference":"'"$M1REF"'","category":"REFUND_VALUE","basis":"ACTUAL","amount_minor":500}')|$(jget error)"
t "a cost must be a whole, non-negative amount in the order's own currency, with no card details" "422|invalid_amount|422|currency_mismatch|422|invalid_note|422|payment_credentials_refused" "$(cost '{"order_reference":"'"$M1REF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":-5}')|$(jget error)|$(cost '{"order_reference":"'"$M1REF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":45,"currency":"USD"}')|$(jget error)|$(cost '{"order_reference":"'"$M1REF"'","category":"OTHER_DIRECT_COST","basis":"ACTUAL","amount_minor":10}')|$(jget error)|$(cost '{"order_reference":"'"$M1REF"'","category":"OTHER_DIRECT_COST","basis":"ACTUAL","amount_minor":10,"note":"card 4242 4242 4242 4242"}')|$(jget error)"
t "the actual fee is recorded (nothing spent): the Moment order is complete at £15 − £0.45" "200|false|1455|97" "$(cost '{"order_reference":"'"$M1REF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":45}')|$(jget spent)|$(biz products; bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["actual"]["contribution_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["actual"]["contribution_percent"]')"
t "actual-first: an expected fee entry never replaces a recorded actual fee" "200|1455|1455" "$(cost '{"order_reference":"'"$M1REF"'","category":"PAYMENT_PROCESSING_FEE","basis":"EXPECTED","amount_minor":60}')|$(biz products; bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["expected"]["contribution_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["actual"]["contribution_minor"]')"
t "correcting an entry voids the previous one and keeps the history" "2|1" "$(cost '{"order_reference":"'"$M1REF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":45}' >/dev/null; q "SELECT COUNT(*) FROM direct_cost_entries WHERE order_id=$M1 AND category='PAYMENT_PROCESSING_FEE' AND basis='ACTUAL'")|$(q "SELECT COUNT(*) FROM direct_cost_entries WHERE order_id=$M1 AND category='PAYMENT_PROCESSING_FEE' AND basis='ACTUAL' AND status='CURRENT'")"
MVJOB=$(job_of $MV)
cost '{"order_reference":"'"$MVREF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":120}' >/dev/null
biz overview
t "the video order with its fee but no video cost stays incomplete: the platform allowance is not free" "1|VIDEO_PRODUCTION_COST" "$(bj overview 'd["contribution"]["all"]["actual"]["complete_orders"]')|$(bj overview '",".join(d["contribution"]["all"]["actual"]["awaiting"].keys())')"
vpost "$(vact $MV $MVJOB RECORD_PRODUCTION_COST '{"cost_minor":900,"note":"Manual production time share (test)"}')" >/dev/null
biz overview
t "once the video cost is recorded it completes: £14.55 + (£64 − £1.20 − £9) = actual £68.35 from 2 of 2" "2|6835|2 of 2 paid orders|True" "$(bj overview 'd["contribution"]["all"]["actual"]["complete_orders"]')|$(bj overview 'd["contribution"]["all"]["actual"]["contribution_minor"]')|$(bj overview 'd["contribution"]["all"]["actual"]["based_on"]')|$(bj overview 'str(d["contribution"]["all"]["actual"]["whole_business"])')"

section "4. MOMENT, VIDEO AND ENHANCEMENTS"
biz products
t "Moment: 2 live GBP orders (1 Moment only, 1 with a video), attachment 50%, £30 Moment revenue" "2|1|1|0.5|3000|3950" "$(bj products 'd["moment"]["orders"]')|$(bj products 'd["moment"]["moment_only_orders"]')|$(bj products 'd["moment"]["moment_with_video_orders"]')|$(bj products 'd["moment"]["video_attachment_rate"]')|$(bj products 'd["moment"]["moment_revenue_minor"]')|$(bj products 'd["moment"]["average_order_minor"]')"
t "  → Moment price £15, with a video £64; early data labelled" "1500|6400|EARLY DATA" "$(bj products 'd["moment"]["price_minor"]')|$(bj products 'd["moment"]["with_video_price_minor"]')|$(bj products 'd["moment"]["label"]')"
t "product rows: Moment 2 orders, 2 units, £30; video 1 order, £49; sample shown" "2|2|3000|1|4900|EARLY DATA" "$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["orders"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["units"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["paid_revenue_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="memory-music-video"][0]["orders"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="memory-music-video"][0]["paid_revenue_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["label"]')"
t "enhancements: base £30, enhancement £49, attachment 50%, average order with £64 and without £15" "3000|4900|0.5|6400|1500" "$(bj products 'd["enhancements"]["base_product_revenue_minor"]')|$(bj products 'd["enhancements"]["enhancement_revenue_minor"]')|$(bj products 'd["enhancements"]["enhancement_attachment_rate"]')|$(bj products 'd["enhancements"]["average_order_with_enhancement_minor"]')|$(bj products 'd["enhancements"]["average_order_without_enhancement_minor"]')"
tc "  → a difference in order value is stated as correlation, not cause" "$(bj products 'd["enhancements"]["note"]' | grep -q 'correlation, not proof' && echo 1 || echo 0)"
biz videos
t "video: 1 purchase of 2 eligible orders, £49 revenue, capacity 45 pending Mozart verification" "1|2|0.5|4900|45|PENDING MOZART VERIFICATION|PENDING_EXTERNAL_VERIFICATION" "$(bj videos 'd["video"]["purchases"]')|$(bj videos 'd["video"]["eligible_orders"]')|$(bj videos 'd["video"]["attachment_rate"]')|$(bj videos 'd["video"]["video_revenue_minor"]')|$(bj videos 'd["video"]["capacity"]["planned"]')|$(bj videos 'd["video"]["capacity"]["label"]')|$(bj videos 'd["video"]["capacity"]["verification"]')"
t "  → known production cost only where recorded; pricing needs founder authorisation" "900|1 of 1 videos with a recorded cost (before payment fees and refunds)|4900|True|NOT_AUTHORISED" "$(bj videos 'd["video"]["production_cost"]["known_cost_minor"]')|$(bj videos 'd["video"]["known_contribution_based_on"]')|$(bj videos 'd["video"]["pricing_evidence"]["current_price_minor"]')|$(bj videos 'str(d["video"]["pricing_evidence"]["launch_price_authoritative"])')|$(bj videos 'd["video"]["pricing_evidence"]["price_test"]')"
tc "  → the allowance is not free and no price changes automatically" "$(bj videos 'd["video"]["production_cost"]["note"]' | grep -q 'not free' && bj videos 'd["video"]["pricing_evidence"]["note"]' | grep -q 'no price changes automatically' && echo 1 || echo 0)"

section "5. A PHYSICAL ORDER: EXPECTED ECONOMICS, ACTUAL SUPPLIER COST, SUPPLIER ROUTE"
echo "$ROUTES_STANDARD" | write_routes
to_ready '{"sku":"keepsake-7-picture-disc","email":"biz-k@example.com"}'; K=$OID; KREF=$(ref_of $K); q "UPDATE orders SET stripe_livemode = 1 WHERE id=$K" >/dev/null
KTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$K")
founder_authorise $K BELLA "$FOUNDER_CODE_BELLA" >/dev/null
act $K RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-BIZ-K1","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":4000,"actual_shipping_cost_minor":800,"send_email":false' >/dev/null
cost '{"order_reference":"'"$KREF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":200}' >/dev/null
biz products
t "keepsake: actual-first — the recorded £2 fee completes expected (£53 route) and actual (£48) figures" "$((KTOTAL-5300-200))|1|$((KTOTAL-4800-200))" "$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["expected"]["contribution_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["expected"]["complete_orders"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["actual"]["contribution_minor"]')"
with_config "\$c['business'] = ['payment_fee_model' => ['percent_basis_points' => 150, 'fixed_minor' => 20, 'currency' => 'GBP']];"
biz products
t "  → a configured fee model is ignored: there is no fee model, only recorded fees (internal allowances counted once)" "$((KTOTAL-5300-200))" "$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["expected"]["contribution_minor"]')"
restore_config
biz suppliers
t "supplier route (staff only): 1 order, £40 actual purchase, no variance, GB destination, early data" "1|4000|0|1|EARLY DATA" "$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="TEST-ROUTE-K12"][0]["orders"]')|$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="TEST-ROUTE-K12"][0]["actual_purchase_cost_minor"]')|$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="TEST-ROUTE-K12"][0]["purchase_variance_minor"]')|$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="TEST-ROUTE-K12"][0]["destinations"]["GB"]')|$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="TEST-ROUTE-K12"][0]["label"]')"
tc "  → routes are not ranked and nothing is switched" "$(bj suppliers 'd["supplier_routes"]["note"]' | grep -q 'not ranked and no supplier is changed automatically' && ! grep -qiE 'best|winner|rank"' /tmp/biz-suppliers.json && echo 1 || echo 0)"

section "6. NEGATIVE CONTRIBUTION, COST VARIANCE AND ALERTS THAT CHANGE NOTHING"
to_ready '{"sku":"keepsake-7-picture-disc","email":"biz-neg@example.com"}'; N=$OID; NREF=$(ref_of $N); q "UPDATE orders SET stripe_livemode = 1 WHERE id=$N" >/dev/null
NTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$N")
founder_authorise $N LEWIS "$FOUNDER_CODE_LEWIS" >/dev/null
act $N RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-BIZ-N1","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":19000,"actual_shipping_cost_minor":2000,"variance_reason":"SUPPLIER_PRICE_CHANGE","send_email":false' >/dev/null
cost '{"order_reference":"'"$NREF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":200}' >/dev/null
PRICE_BEFORE=$(price keepsake-7-picture-disc); CATALOGUE_SHA=$(shasum public/api/data/catalogue.json | cut -d' ' -f1)
biz overview
t "a negative actual contribution is flagged with the order and amount" "TRIGGERED|$NREF|$((NTOTAL-21000-200))" "$(bj overview '[a for a in d["alerts"]["alerts"] if a["type"]=="NEGATIVE_CONTRIBUTION"][0]["status"]')|$(bj overview '[f for a in d["alerts"]["alerts"] if a["type"]=="NEGATIVE_CONTRIBUTION" for f in a["findings"] if f["basis"]=="ACTUAL"][0]["reference"]')|$(bj overview '[f for a in d["alerts"]["alerts"] if a["type"]=="NEGATIVE_CONTRIBUTION" for f in a["findings"] if f["basis"]=="ACTUAL"][0]["contribution_minor"]')"
t "  → the evidence card asks for a review, never an instruction" "REVIEW_PRODUCT_ECONOMICS" "$(bj overview '[c["kind"] for c in d["recommendations"]["cards"] if "below zero" in c["text"]][0]')"
tc "  → no card or alert tells anyone to raise a price, drop a supplier or stop a product" "$(! grep -qiE 'raise price|lower price|drop supplier|switch supplier|stop product|best product|best supplier|winner' /tmp/biz-overview.json && echo 1 || echo 0)"
t "cost variance is NOT CONFIGURED until the Founders set a threshold" "NOT_CONFIGURED" "$(bj overview '[a["status"] for a in d["alerts"]["alerts"] if a["type"]=="COST_VARIANCE_HIGH"][0]')"
with_config "\$c['business'] = ['thresholds' => ['cost_variance_percent' => 20, 'data_completeness_percent' => 90, 'refund_rate_percent' => 10]];"
biz overview
t "with thresholds configured the alerts evaluate: cost variance on the negative order; completeness (4 of 4) is clear" "TRIGGERED|$NREF|20|CLEAR" "$(bj overview '[a["status"] for a in d["alerts"]["alerts"] if a["type"]=="COST_VARIANCE_HIGH"][0]')|$(bj overview '[a["findings"][0]["reference"] for a in d["alerts"]["alerts"] if a["type"]=="COST_VARIANCE_HIGH"][0]')|$(bj overview '[a["threshold"] for a in d["alerts"]["alerts"] if a["type"]=="COST_VARIANCE_HIGH"][0]')|$(bj overview '[a["status"] for a in d["alerts"]["alerts"] if a["type"]=="DATA_COMPLETENESS_LOW"][0]')"
restore_config
t "alerts changed nothing: the paid orders are still paid, the price and catalogue unchanged, no suspension" "PAID|PAID|$PRICE_BEFORE|$CATALOGUE_SHA|0" "$(q "SELECT status FROM orders WHERE id=$N")|$(q "SELECT status FROM orders WHERE id=$K")|$(price keepsake-7-picture-disc)|$(shasum public/api/data/catalogue.json | cut -d' ' -f1)|$(q "SELECT COUNT(*) FROM product_sales_suspensions WHERE resumed_at IS NULL")"
tc "business code holds no cancellation, price change, suspension or supplier switch" "$(grep -nE "UPDATE orders SET|product_sales_suspensions|INSERT INTO supplier_orders|UPDATE supplier_orders|UPDATE order_items|file_put_contents|supplier-routes\.json" public/api/lib/business.php public/api/crm/business.php | grep -q . && echo 0 || echo 1)"

section "7. REFUNDS: PARTIAL AND FULL REDUCE NET PAID CORRECTLY"
biz overview; GROSS_ALL=$(bj overview 'd["revenue"]["all"]["gross_paid_minor"]')
reset_limits
act $K ISSUE_STATUS_LINK >/dev/null; KT=$(link_token status)
post_json order-support "$(TOK_=$KT js '{"token":E["TOK_"],"kind":"DAMAGED_OR_FAULTY","item":"item-1","description":"The record arrived cracked across the label."}')" >/dev/null; KCASE=$(jget case_id)
care REQUEST_REFUND_REVIEW $KCASE '{"refund_type":"PARTIAL","amount_minor":2000,"reason":"Goodwill"}' >/dev/null; F1=$(jget refund_id)
F=$F1 care SUBMIT_REFUND_FOR_DECISION $KCASE '{"refund_id":int(E["F"])}' >/dev/null
F=$F1 C="$FOUNDER_CODE_BELLA" care DECIDE_REFUND $KCASE '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"ok","founder":"BELLA","founder_code":E["C"],"confirm":True}' >/dev/null
F=$F1 care RECORD_REFUND $KCASE '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'","external_reference":"re_test_biz_partial"}' >/dev/null
act $M1 ISSUE_STATUS_LINK >/dev/null; MT=$(link_token status)
post_json order-support "$(TOK_=$MT js '{"token":E["TOK_"],"kind":"OTHER","description":"Please cancel, we no longer need the song."}')" >/dev/null; MCASE=$(jget case_id)
care REQUEST_REFUND_REVIEW $MCASE '{"refund_type":"FULL","reason":"Cancelled before production"}' >/dev/null; F2=$(jget refund_id)
F=$F2 care SUBMIT_REFUND_FOR_DECISION $MCASE '{"refund_id":int(E["F"])}' >/dev/null
F=$F2 C="$FOUNDER_CODE_LEWIS" care DECIDE_REFUND $MCASE '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"ok","founder":"LEWIS","founder_code":E["C"],"confirm":True}' >/dev/null
F=$F2 care RECORD_REFUND $MCASE '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'"}' >/dev/null
biz overview
t "net paid = gross − £20 partial − £15 full; gross unchanged; both orders still PAID" "$GROSS_ALL|3500|2000|1500|$((GROSS_ALL-3500))|PAID|PAID" "$(bj overview 'd["revenue"]["all"]["gross_paid_minor"]')|$(bj overview 'd["revenue"]["all"]["refunds_minor"]')|$(bj overview 'd["revenue"]["all"]["partial_refunds_minor"]')|$(bj overview 'd["revenue"]["all"]["full_refunds_minor"]')|$(bj overview 'd["revenue"]["all"]["net_paid_minor"]')|$(q "SELECT status FROM orders WHERE id=$K")|$(q "SELECT status FROM orders WHERE id=$M1")"
t "  → the fully refunded Moment's actual contribution is its £0.45 fee below zero" "-45" "$(biz products; bj products '[p for p in d["products"]["products"] if p["sku"]=="moment"][0]["actual"]["contribution_minor"]')"
biz support
t "refund intelligence: 1 full £15, 1 partial £20, refund rate 2 of 4 orders, by case type" "1|1500|1|2000|0.5|1|1" "$(bj support 'd["refunds"]["full_refunds"]["count"]')|$(bj support 'd["refunds"]["full_refunds"]["minor"]')|$(bj support 'd["refunds"]["partial_refunds"]["count"]')|$(bj support 'd["refunds"]["partial_refunds"]["minor"]')|$(bj support 'd["refunds"]["refund_rate"]')|$(bj support 'd["refunds"]["by_reason"]["DAMAGED_OR_FAULTY"]["count"]')|$(bj support 'd["refunds"]["by_reason"]["OTHER"]["count"]')"
t "no refund was executed: no refund request reached the payment stub" "0" "$(docker exec mcb-api sh -c 'grep -c refunds /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"

section "8. REPLACEMENT: AUTHORISED IS NOT SPEND UNTIL ITS COST IS RECORDED"
care PROPOSE_REMEDY $KCASE '{"type":"REPLACEMENT_REQUIRED","note":"Replace the cracked record"}' >/dev/null; REM=$(jget remedy_id)
R=$REM C="$FOUNDER_CODE_BELLA" care DECIDE_REMEDY $KCASE '{"remedy_id":int(E["R"]),"decision":"AUTHORISE","note":"ok","founder":"BELLA","founder_code":E["C"],"confirm":True}' >/dev/null
biz support
t "authorised replacement: counted, but no spend and the order's contribution is awaiting the cost" "1|null|1|False" "$(bj support 'd["replacements"]["authorised_or_later"]')|$(bj support 'd["replacements"]["known_actual_cost_minor"]')|$(bj support 'd["replacements"]["authorised_without_actual_cost"]')|$(biz products; bj products 'str([p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["actual"]["complete_orders"] == 2)')"
t "a replacement cost needs its remedy on that order" "422|remedy_required" "$(cost '{"order_reference":"'"$KREF"'","category":"REPLACEMENT_COST","basis":"ACTUAL","amount_minor":4800}')|$(jget error)"
t "the actual replacement cost is recorded and counted: known £48, recovery £48 per affected order" "200|4800|4800|0" "$(cost '{"order_reference":"'"$KREF"'","category":"REPLACEMENT_COST","basis":"ACTUAL","amount_minor":4800,"remedy_id":'"$REM"'}')|$(biz support; bj support 'd["replacements"]["known_actual_cost_minor"]')|$(bj support 'd["replacements"]["recovery_cost_per_affected_order_minor"]')|$(bj support 'd["replacements"]["authorised_without_actual_cost"]')"
t "  → keepsake actual contribution now includes the replacement (both keepsake orders complete)" "$((KTOTAL-2000-4800-200-4800 + NTOTAL-21000-200))|2" "$(biz products; bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["actual"]["contribution_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-7-picture-disc"][0]["actual"]["complete_orders"]')"

section "9. SUPPORT BURDEN AND ROOT CAUSES"
care RESOLVE $KCASE '{"recovery_outcome":"REPLACED","root_cause":"SUPPLIER_ERROR"}' >/dev/null
biz support
t "support burden: 2 cases over 4 orders, 1 damage, replacement rate 1 of 4" "2|0.5|1|0.25" "$(bj support 'd["support"]["cases"]')|$(bj support 'd["support"]["cases_per_order"]')|$(bj support 'd["support"]["damage"]')|$(bj support 'd["support"]["replacement_rate"]')"
t "root cause SUPPLIER_ERROR: 1 case, keepsake affected, route TEST-ROUTE-K12, £20 refund, £48 replacement" "1|keepsake-7-picture-disc|TEST-ROUTE-K12|2000|4800" "$(bj support '[r for r in d["root_causes"]["root_causes"] if r["root_cause"]=="SUPPLIER_ERROR"][0]["count"]')|$(bj support '",".join([r for r in d["root_causes"]["root_causes"] if r["root_cause"]=="SUPPLIER_ERROR"][0]["products_affected"])')|$(bj support '",".join([r for r in d["root_causes"]["root_causes"] if r["root_cause"]=="SUPPLIER_ERROR"][0]["routes_affected"])')|$(bj support '[r for r in d["root_causes"]["root_causes"] if r["root_cause"]=="SUPPLIER_ERROR"][0]["refund_value_minor"]')|$(bj support '[r for r in d["root_causes"]["root_causes"] if r["root_cause"]=="SUPPLIER_ERROR"][0]["known_replacement_cost_minor"]')"
tc "  → no labour cost is invented" "$(bj support 'd["support"]["note"]' | grep -q 'No labour cost is assigned' && ! grep -qiE 'labour_cost|hourly' /tmp/biz-support.json && echo 1 || echo 0)"

section "10. CUSTOMERS, OCCASIONS, CRUISE, COUNTRIES AND THE FUNNEL"
biz customers
t "customers: 4 customers, all first-time, 1 order each" "4|4|0|1" "$(bj customers 'd["customers"]["customers"]')|$(bj customers 'd["customers"]["first_time_customers"]')|$(bj customers 'd["customers"]["repeat_customers"]')|$(bj customers 'd["customers"]["orders_per_customer"]')"
t "cruise uses the structured occasion only: the story mentioning a cruise ship is not counted" "1|6400|1" "$(bj customers 'd["cruise"]["orders"]')|$(bj customers 'd["cruise"]["paid_revenue_minor"]')|$(bj customers 'd["cruise"]["video_attachment_rate"]')"
t "occasions are structured choices: Anniversary 1, Cruise / Voyage 1" "1|1" "$(bj customers '[o["orders"] for o in d["occasions"]["occasions"] if o["occasion"]=="anniversary"][0]')|$(bj customers '[o["orders"] for o in d["occasions"]["occasions"] if o["occasion"]=="cruise"][0]')"
t "countries: GB 2 physical orders, digital orders have no country, early data" "2|2|EARLY DATA" "$(bj customers '[c["orders"] for c in d["geography"]["countries"] if c["country"]=="GB"][0]')|$(bj customers '[c["orders"] for c in d["geography"]["countries"] if c["country"]=="DIGITAL"][0]')|$(bj customers '[c["label"] for c in d["geography"]["countries"] if c["country"]=="GB"][0]')"
tc "  → no address, postcode, name, email or story anywhere in the customer views" "$(! grep -qiE 'Harbour Row|SO14|Southampton|@example\.com|Rec Ipient|Tx Customer|cruise ship deck|evening on deck' /tmp/biz-customers.json && echo 1 || echo 0)"
t "funnel: product views and personalisation starts are ANALYTICS COVERAGE INCOMPLETE, never estimated" "null|ANALYTICS_COVERAGE_INCOMPLETE|null|ANALYTICS_COVERAGE_INCOMPLETE" "$(bj customers '[s["count"] for s in d["funnel"]["stages"] if s["stage"]=="PRODUCT_VIEWED"][0]')|$(bj customers '[s["coverage"] for s in d["funnel"]["stages"] if s["stage"]=="PRODUCT_VIEWED"][0]')|$(bj customers '[s["count"] for s in d["funnel"]["stages"] if s["stage"]=="PERSONALISATION_STARTED"][0]')|$(bj customers 'd["funnel"]["coverage"]')"

section "11. DATA QUALITY, COMPARISONS, BRIEF, TIMEZONE"
biz data
t "data quality shows the gaps: the USD order, analytics coverage, thresholds; no fee model or timezone gap (founder decisions)" "1|ANALYTICS_COVERAGE_INCOMPLETE|6|False|False" "$(bj data '[g["count"] for g in d["data_quality"]["gaps"] if g["key"]=="foreign_currency_orders"][0]')|$(bj data '[g["status"] for g in d["data_quality"]["gaps"] if g["key"]=="analytics_coverage"][0]')|$(bj data '[g["count"] for g in d["data_quality"]["gaps"] if g["key"]=="thresholds_not_configured"][0]')|$(bj data 'str(any(g["key"]=="payment_fee_model" for g in d["data_quality"]["gaps"]))')|$(bj data 'str(any(g["key"]=="business_timezone" for g in d["data_quality"]["gaps"]))')"
t "  → recorded refunds without a provider reference are counted (the full refund had none)" "1|2" "$(bj data '[g["count"] for g in d["data_quality"]["gaps"] if g["key"]=="missing_refund_references"][0]')|$(bj data '[g["of"] for g in d["data_quality"]["gaps"] if g["key"]=="missing_refund_references"][0]')"
biz overview
t "comparisons: only complete periods get a change figure; today, this week and this month are partial" "3|Yesterday vs the day before|3|Today so far (partial)" "$(bj overview 'len(d["comparisons"]["complete"])')|$(bj overview 'd["comparisons"]["complete"][0]["label"]')|$(bj overview 'len(d["comparisons"]["partial"])')|$(bj overview 'd["comparisons"]["partial"][0]["label"]')"
tc "  → a change is never called a trend" "$(bj overview 'd["comparisons"]["complete"][0]["wording"]' | grep -q 'not a trend' && echo 1 || echo 0)"
t "the brief: net paid today, most units sold, customer care open, data missing listed" "MCB BUSINESS BRIEF|True|True" "$(bj overview 'd["brief"]["title"]')|$(bj overview 'str(d["brief"]["most_units_today"] is not None)')|$(bj overview 'str(len(d["brief"]["data_missing"]) > 0)')"
tc "  → no celebratory language" "$(! grep -qiE 'congrat|amazing|record day|great news|🎉|best ever|crushing' /tmp/biz-overview.json && echo 1 || echo 0)"
with_config "\$c['business'] = ['timezone' => 'Europe/London'];"
t "a configured business timezone is used and shown (the Founders' decision)" "Europe/London|True" "$(biz overview; bj overview 'd["timezone"]["timezone"]')|$(bj overview 'str(d["timezone"]["configured"])')"
with_config "\$c['business'] = ['timezone' => 'Mars/Olympus'];"
t "  → an invalid timezone falls back to the founder decision, never UTC or the server's zone" "Europe/London|FOUNDER_DECISION" "$(biz overview; bj overview 'd["timezone"]["timezone"]')|$(bj overview 'd["timezone"]["source"]')"
restore_config
t "readiness: timezone decided, fees actual-first, thresholds deliberately deferred (not invented)" "READY|READY|DEFERRED|False" "$(cc view=readiness >/dev/null; cj '[r["status"] for r in d["readiness"] if r["key"]=="business_timezone"][0]')|$(cj '[r["status"] for r in d["readiness"] if r["key"]=="payment_fees"][0]')|$(cj '[r["status"] for r in d["readiness"] if r["key"]=="commercial_thresholds"][0]')|$(cj 'str(any(r["key"]=="payment_fee_model" for r in d["readiness"]))')"

section "12. EXPORTS, SECURITY AND WHAT NEVER HAPPENS"
AUD0=$(q "SELECT COUNT(*) FROM business_audit_log WHERE action='EXPORT'")
t "the products export is CSV, audited, with a header and figures" "200|1|True" "$(curl -s -o /tmp/biz-products.csv -w '%{http_code}' "$BASE/$BIZ?export=products&$BIZQ" -H "Authorization: Bearer $CRMKEY")|$(( $(q "SELECT COUNT(*) FROM business_audit_log WHERE action='EXPORT'") - AUD0 ))|$(head -1 /tmp/biz-products.csv | grep -q '"sku","name"' && echo True || echo False)"
for d in supplier_routes refunds alerts root_causes geography data_quality; do curl -s "$BASE/$BIZ?export=$d&$BIZQ" -H "Authorization: Bearer $CRMKEY" >> /tmp/biz-all.csv; done
tc "exports never contain stories, lyrics, names, emails, addresses, messages or reasons" "$(cat /tmp/biz-products.csv /tmp/biz-all.csv | grep -qiE 'cruise ship deck|cracked across|no longer need|Goodwill|@example\.com|Harbour Row|SO14|Tx Customer|Rec Ipient|evening on deck' && echo 0 || echo 1)"
t "the refunds export has references, types and amounts" "True" "$(grep -q "$KREF" /tmp/biz-all.csv && grep -q '"PARTIAL","2000"' /tmp/biz-all.csv && echo True || echo False)"
t "a spreadsheet formula in a cell is neutralised" "\"'=SUM(A1)\"" "$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require "/var/www/html/api/lib/business.php"; echo biz_csv_cell("=SUM(A1)");')"
t "an unknown export is refused; exports need the key" "422|401" "$(crm "$BIZ?export=customers_emails&$BIZQ")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$BIZ?export=products&$BIZQ")"
t "Business responses are no-store and noindex" "1|1" "$(curl -s -D - -o /dev/null "$BASE/$BIZ?section=overview&$BIZQ" -H "Authorization: Bearer $CRMKEY" | grep -ci 'cache-control: no-store' | head -1 | awk '{print ($1>=1)?1:0}')|$(curl -s -D - -o /dev/null "$BASE/$BIZ?section=overview&$BIZQ" -H "Authorization: Bearer $CRMKEY" | grep -ci 'x-robots-tag: noindex' | awk '{print ($1>=1)?1:0}')"
tc "no language model, paid API or outbound call computes a figure" "$(grep -niE 'curl_init|file_get_contents\(.https?:|openai|anthropic|api\.mozart|stripe_request|/v1/' public/api/lib/business.php public/api/crm/business.php | grep -q . && echo 0 || echo 1)"
t "no payment request was made by the business layer (only checkout sessions from placing test orders)" "0" "$(docker exec mcb-api sh -c 'grep -ciE "refund|payout|transfer" /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"
t "supplier orders exist only where a person recorded them" "2" "$(q "SELECT COUNT(*) FROM supplier_orders")"

rm -rf "$TMPV" 2>/dev/null

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
