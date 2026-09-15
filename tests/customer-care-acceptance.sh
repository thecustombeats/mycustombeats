#!/bin/bash
# MCB™ CUSTOMER CARE & RECOVERY CONTROLLER (16 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# Nothing is refunded, purchased or charged: payments are TEST, Stripe and
# Resend are local stubs, and the refund workflow records decisions only.
#
# Covers: the executive corrections (Moment £15, Moment + video £64, video
# duration); the support entry and the canonical case; states, priorities and
# the service target; the private thread (customer never sees internal notes,
# system events, staff names or economics); cross-order isolation; optional,
# private evidence; damage, wrong item and privacy review; objective error vs
# subjective preference (no creative rework, no approval loop); remedies and
# founder authorisation for replacements; refund review, founder decision and
# record (full and partial) with revenue handled correctly; secure link
# reissue; video rework without touching capacity; the Command Centre
# (attention vs approvals, counts); health checks (no customer abandoned);
# templates; metrics; recovery cooling; no secrets, paid API or purchase.

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
SUPPLIER_ORDERS0=$(q "SELECT COUNT(*) FROM supplier_orders")

stub_reset
reset_limits

section "1. EXECUTIVE CORRECTIONS, POLICY AND THE MIGRATION"
t "the customer care policy is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/customer-care.json")"
t "Moment is £15 on the server; Moment + one Memory Music Video is quoted £64" "1500|6400" "$(price moment)|$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1},{"sku":"memory-music-video","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null; jget subtotal_minor)"
t "a video over 240 seconds waits for platform verification; staff can only escalate" "VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED|ESCALATE_TO_FOUNDERS" "$(cj '[s for s in d["duration_statuses"] if "VERIFICATION" in s][0]' $VJ)|$(cj '",".join(d["duration_decisions"])' $VJ)"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS cca; DROP DATABASE IF EXISTS ccb; CREATE DATABASE cca; CREATE DATABASE ccb;' 2>/dev/null
ROOTQ cca < db/schema.sql 2>/dev/null
git show db6ecc9e:db/schema.sql | ROOTQ ccb 2>/dev/null
ROOTQ ccb -e "SET FOREIGN_KEY_CHECKS=0; INSERT INTO order_service_requests (order_id, kind, eligibility, description, status) VALUES (1, 'QUESTION', 'NOT_APPLICABLE', 'Legacy open question', 'OPEN'), (1, 'DAMAGED_OR_FAULTY', 'NOT_APPLICABLE', 'Legacy declined', 'DECLINED')" 2>/dev/null
ROOTQ ccb < db/migrations/2026-09-16-customer-care.sql 2>/dev/null; M1=$?
ROOTQ ccb < db/migrations/2026-09-16-customer-care.sql 2>/dev/null; M2=$?
ROOTQ ccb < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null
ROOTQ ccb < db/migrations/2026-09-16-supplier-routing.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the customer care migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$M1" = 0 ] && [ "$M2" = 0 ] && [ "$(dumpdb cca | shasum)" = "$(dumpdb ccb | shasum)" ] && echo 1 || echo 0)"
t "  → existing requests keep their meaning: OPEN → NEW, DECLINED → CLOSED; a damage report is urgent" "NEW,CLOSED|NORMAL,URGENT" "$(ROOTQ -N -e "SELECT GROUP_CONCAT(status ORDER BY id) FROM order_service_requests" ccb 2>/dev/null)|$(ROOTQ -N -e "SELECT GROUP_CONCAT(priority ORDER BY id) FROM order_service_requests" ccb 2>/dev/null)"
ROOTQ -e 'DROP DATABASE cca; DROP DATABASE ccb;' 2>/dev/null

section "2. ORDINARY SUPPORT ENTRY, THE THREAD AND THE CUSTOMER'S VIEW"
paid_order '{"sku":"moment","email":"care-moment@example.com"}'; MO=$OID
act $MO ISSUE_STATUS_LINK >/dev/null; MT=$(link_token status)
paid_order '{"sku":"moment","email":"care-other@example.com"}'; XO=$OID
act $XO ISSUE_STATUS_LINK >/dev/null; XT=$(link_token status)
progress $MT
t "a Moment customer is offered the kinds that apply (nothing about parcels or videos)" "QUESTION,INCORRECT_DETAIL,DIGITAL_DELIVERY_PROBLEM,OTHER" "$(pj '",".join(k["kind"] for k in d["support_kinds"])')"
t "an ordinary question opens a case: NEW, normal priority, the service target, no founder interruption" "201|NEW|NORMAL|0" "$(help_req $MT '{"kind":"QUESTION","description":"Can I play my song at the anniversary party?"}')|$(cstat $(jget case_id))|$(q "SELECT priority FROM order_service_requests WHERE id=$(jget case_id)")|$(notes $MO CUSTOMER_SUPPORT_EXCEPTION)"
Q1=$(jget case_id)
tc "  → the customer is told MCB aims to reply within one working day (no guarantee)" "$(jget message | grep -q 'aim to reply within one working day' && ! jget message | grep -qiE 'guarantee|within 24 hours' && echo 1 || echo 0)"
t "a digital order cannot report a damaged parcel" "422" "$(help_req $MT '{"kind":"DAMAGED_OR_FAULTY","description":"The parcel was crushed on arrival."}')"
t "card numbers are refused in a message" "422" "$(help_req $MT '{"kind":"QUESTION","description":"My card is 4242 4242 4242 4242 please refund"}')"
progress $MT
t "the customer's page shows the case in plain words: we're looking into this" "1|I have a question|We're looking into this|False|1" "$(pj 'len(d["support"])')|$(pj 'd["support"][0]["type"]')|$(pj 'd["support"][0]["status_label"]')|$(pj 'str(d["support"][0]["needs_you"])')|$(pj 'len(d["support"][0]["thread"])')"
MAIL0=$(mail_count)
REPLY_TEXT="Hello Tx, yes — your song is yours to play at the party. Warm wishes, MCB"
t "staff reply from a template (edited): first response recorded, waiting for the customer, one email" "200|WAITING_FOR_CUSTOMER|1|1" "$(R="$REPLY_TEXT" care RESPOND $Q1 '{"body":E["R"],"template_key":"ANSWER_QUESTION","next_status":"WAITING_FOR_CUSTOMER"}')|$(cstat $Q1)|$(q "SELECT first_response_at IS NOT NULL FROM order_service_requests WHERE id=$Q1")|$(sent_count $MO SUPPORT_RESPONSE)"
tc "  → the email says MCB has replied and links to the private page; it never carries the reply" "$(mail_log | tail -1 | grep -q "We've replied to your message" && ! mail_log | grep -q 'yours to play at the party' && echo 1 || echo 0)"
tc "  → replies to MCB emails go to hello@mycustombeats.com" "$(mail_log | tail -1 | grep -q '"reply_to":"hello@mycustombeats.com"' && echo 1 || echo 0)"
care ADD_INTERNAL_NOTE $Q1 '{"body":"INTERNAL-ONLY: partner slow this week, margin thin"}' >/dev/null
progress $MT
t "the customer sees MCB's reply and is asked for nothing more than a reply" "We need a little more from you|True|MCB|2" "$(pj 'd["support"][0]["status_label"]')|$(pj 'str(d["support"][0]["needs_you"])')|$(pj 'd["support"][0]["latest_response"]["from"]')|$(pj 'len(d["support"][0]["thread"])')"
tc "  → internal notes, system events, staff names, priority and economics never reach the customer" "$(! grep -qE 'INTERNAL-ONLY|margin|Care Tester|priority|classification|privacy_review|sentiment|remed|root_cause|SYSTEM_EVENT|INTERNAL_NOTE|supplier|cost' /tmp/progress.json && echo 1 || echo 0)"
t "the customer replies: waiting for MCB again" "201|WAITING_FOR_MCB" "$(case_msg $MT $Q1 'Thank you! Could you also send the lyrics?')|$(cstat $Q1)"
t "another order's link cannot read or write this case (not found)" "404|case_not_found|0" "$(case_msg $XT $Q1 'Trying to write on someone else')|$(jget error)|$(post_json order-progress "$(tokonly $XT)" >/dev/null; cj 'len(d["support"])')"
t "  → nor add evidence to it" "404" "$(ev -F "token=$XT" -F "request_id=$Q1" -F kind=OTHER -F "reference=not mine")"
t "an unknown link is refused" "404" "$(case_msg AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA $Q1 'hello')"
t "message and evidence content never reach order events or founder notifications" "0|0" "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%anniversary party%' OR detail LIKE '%send the lyrics%' OR detail LIKE '%INTERNAL-ONLY%'")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE payload LIKE '%anniversary party%' OR payload LIKE '%send the lyrics%'")"
t "the staff console needs the CRM key and a staff name; opening a case is audited" "401|422|200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$CARE?view=list&$CAREQ")|$(crm "$CARE?case_id=$Q1")|$(cget "case_id=$Q1")|$(q "SELECT COUNT(*)>=1 FROM order_events WHERE order_id=$MO AND event_type='SUPPORT.CASE_VIEWED'")"
tc "  → staff see the whole thread, labelled, with who replied" "$(cj 'str(d["thread"][0]["kind"]=="CUSTOMER_MESSAGE" and any(m["kind"]=="SYSTEM_EVENT" for m in d["thread"]) and any(m["kind"]=="MCB_RESPONSE" and m["author"]=="Care Tester" for m in d["thread"]) and any(m["kind"]=="INTERNAL_NOTE" for m in d["thread"]))' | grep -qx True && echo 1 || echo 0)"
tc "  → staff see what they need, not the customer's story, address or song copied into the case" "$(! grep -qiE 'the evening on deck|Harbour Row|shippingAddress|lyric_package' /tmp/tx.json && echo 1 || echo 0)"
tc "the staff console is noindex and no-store" "$(H=$(curl -s -D - -o /dev/null "$BASE/$CARE?view=list&$CAREQ" -H "Authorization: Bearer $CRMKEY"); echo "$H" | grep -qi 'x-robots-tag: noindex' && echo "$H" | grep -qi 'cache-control: no-store' && echo 1 || echo 0)"

section "3. DAMAGE, EVIDENCE AND ONE CASE PER OCCURRENCE"
paid_order '{"sku":"keepsake-7-picture-disc","email":"care-keepsake@example.com"}'; KO=$OID
act $KO ISSUE_STATUS_LINK >/dev/null; KT=$(link_token status)
progress $KT
tc "a Keepsake customer is offered delivery, damaged, wrong item and manufacturing choices (no video)" "$(pj 'str(set(["DELIVERY_PROBLEM","DAMAGED_OR_FAULTY","WRONG_ITEM","MANUFACTURING_DEFECT"]) <= set(k["kind"] for k in d["support_kinds"]) and "VIDEO_PROBLEM" not in [k["kind"] for k in d["support_kinds"]])' | grep -qx True && echo 1 || echo 0)"
reset_limits
t "a damaged item without evidence is accepted in full: urgent, evidence optional, founders told" "201|false|URGENT|1" "$(help_req $KT '{"kind":"DAMAGED_OR_FAULTY","item":"item-1","description":"The record arrived cracked across the label."}')|$(jget evidence.required)|$(q "SELECT priority FROM order_service_requests WHERE id=$(jget case_id)")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE dedupe_key='support:$KO:$(jget case_id)'")"
D1=$(jget case_id)
t "  → one structured damage exception, linked to the case" "PARCEL_DAMAGED|1" "$(q "SELECT type FROM fulfilment_exceptions WHERE service_request_id=$D1")|$(q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id=$KO")"
t "a parcel photograph is added privately (outside the web root, random name)" "201|64|no" "$(ev -F "token=$KT" -F "request_id=$D1" -F kind=PARCEL_PHOTO -F "photo=@$FIX/photo-2500.jpg;filename=parcel.jpg")|$(q "SELECT LENGTH(stored_name) FROM support_evidence WHERE service_request_id=$D1 LIMIT 1")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/storage/uploads/support/$(q "SELECT stored_name FROM support_evidence WHERE service_request_id=$D1 LIMIT 1")" | grep -q '^200$' && echo yes || echo no)"
EVID=$(q "SELECT id FROM support_evidence WHERE service_request_id=$D1 LIMIT 1")
t "  → staff download it with the key and a name, audited" "401|200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/fulfilment?evidence_id=$EVID&staff=X")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/fulfilment?evidence_id=$EVID&staff=Care%20Tester" -H "Authorization: Bearer $CRMKEY")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$KO AND event_type='SUPPORT.EVIDENCE_DOWNLOADED'")"
t "  → no evidence was needed: the case is simply new" "NEW" "$(cstat $D1)"
reset_limits
t "a delivery problem opens one case; a later tracking exception joins it rather than starting another" "201|2|$(q "SELECT COUNT(*)+1 FROM order_service_requests WHERE order_id=$KO")" "$(help_req $KT '{"kind":"DELIVERY_PROBLEM","item":"item-1","description":"Tracking has not moved for a week now."}')|$(DL=$(jget case_id); actj $KO RAISE_FULFILMENT_EXCEPTION '{"type":"TRACKING_STALLED","blocking":False,"detail":"Carrier scan stalled"}' >/dev/null; q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE service_request_id=$DL")|$(q "SELECT COUNT(*) FROM order_service_requests WHERE order_id=$KO")"
DL=$(q "SELECT id FROM order_service_requests WHERE order_id=$KO AND kind='DELIVERY_PROBLEM'")

section "4. WRONG ITEM AND A POSSIBLE CROSS-CUSTOMER INCIDENT"
reset_limits
t "wrong item showing someone else's details: urgent privacy review, founders told" "201|URGENT|PRIVACY_REVIEW_REQUIRED|1" "$(help_req $KT '{"kind":"WRONG_ITEM","item":"item-1","otherCustomerDetails":True,"description":"The record has another family names and photos on it."}')|$(q "SELECT priority FROM order_service_requests WHERE id=$(jget case_id)")|$(q "SELECT privacy_review FROM order_service_requests WHERE id=$(jget case_id)")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE dedupe_key='support-privacy:$(jget case_id)'")"
W1=$(jget case_id)
progress $KT
tc "  → the customer sees no privacy review, no other customer and no legal conclusion" "$(! grep -qiE 'privacy|breach|incident|legal|another customer' /tmp/progress.json && echo 1 || echo 0)"
ov
t "  → the Command Centre shows a priority privacy review card; counts it" "1|1|1" "$(ovj 'sum(1 for a in d["attention"] if a["title"]=="Privacy review required" and a["priority"]==1)')|$(ovj 'd["customer_care"]["privacy_review_required"]')|$(ovj 'sum(1 for i in d["health"]["items"] if i["key"]=="support_privacy_review_unresolved" and i["count"]==1)')"
t "an open privacy review stays urgent" "409|privacy_review_open" "$(care SET_PRIORITY $W1 '{"priority":"NORMAL"}')|$(jget error)"
t "completing the review needs a record of what was checked" "422|200|PRIVACY_REVIEW_COMPLETED|Care Tester" "$(care COMPLETE_PRIVACY_REVIEW $W1)|$(care COMPLETE_PRIVACY_REVIEW $W1 '{"note":"Confirmed mispack at partner; other order identified internally; collection arranged."}')|$(q "SELECT privacy_review FROM order_service_requests WHERE id=$W1")|$(q "SELECT privacy_reviewed_by FROM order_service_requests WHERE id=$W1")"

section "5. OBJECTIVE ERROR OR CREATIVE PREFERENCE — SINGLE CREATIVE AUTHORITY"
reset_limits
MJOBS_BEFORE=$(q "SELECT GROUP_CONCAT(CONCAT(id,':',status)) FROM creative_jobs WHERE order_id=$MO")
MSTAGE_BEFORE=$(q "SELECT CONCAT_WS('|',stage,reopen_count) FROM order_production WHERE order_id=$MO")
help_req $MT '{"kind":"INCORRECT_DETAIL","description":"I do not like the style, I imagined something slower."}' >/dev/null; S1=$(jget case_id)
t "a creative preference is recorded and answered" "200|SUBJECTIVE_CREATIVE_PREFERENCE|false" "$(care CLASSIFY $S1 '{"classification":"SUBJECTIVE_CREATIVE_PREFERENCE","note":"Checked against the story: names, dates and occasion all correct; a style preference."}')|$(q "SELECT classification FROM order_service_requests WHERE id=$S1")|$(jget creative_rework_started)"
t "  → it can never become a correction or a reproduction (not a revision)" "409|subjective_preference_not_a_revision|409" "$(care PROPOSE_REMEDY $S1 '{"type":"INTERNAL_CORRECTION"}')|$(jget error)|$(care PROPOSE_REMEDY $S1 '{"type":"REPRODUCTION_REQUIRED"}')"
t "  → no creative job, production stage or reopen changed" "$MJOBS_BEFORE|$MSTAGE_BEFORE" "$(q "SELECT GROUP_CONCAT(CONCAT(id,':',status)) FROM creative_jobs WHERE order_id=$MO")|$(q "SELECT CONCAT_WS('|',stage,reopen_count) FROM order_production WHERE order_id=$MO")"
t "  → the retired customer approval actions stay retired" "410|action_retired" "$(act $MO REQUEST_APPROVAL)|$(jget error)"
tc "  → the creative preference template is warm, keeps rights, promises no remake" "$(cget "case_id=$S1" >/dev/null; cj '[t["body"] for t in d["templates"] if t["key"]=="CREATIVE_PREFERENCE"][0]' | grep -q 'consumer rights are not affected' && ! cj '[t["body"] for t in d["templates"] if t["key"]=="CREATIVE_PREFERENCE"][0]' | grep -qiE 'remake|redo|new version|revision|approve' && echo 1 || echo 0)"
help_req $MT '{"kind":"INCORRECT_DETAIL","description":"The song says Sarah but my wife is Sara, as I wrote."}' >/dev/null; O1=$(jget case_id)
t "an unclassified incorrect detail cannot be corrected yet" "409|classification_required" "$(care PROPOSE_REMEDY $O1 '{"type":"INTERNAL_CORRECTION"}')|$(jget error)"
t "an objective MCB error gets an internal correction (no founder needed, nothing bought)" "200|200|PROPOSED|false" "$(care CLASSIFY $O1 '{"classification":"OBJECTIVE_MCB_ERROR","note":"Order data says Sara; the lyric says Sarah."}')|$(care PROPOSE_REMEDY $O1 '{"type":"INTERNAL_CORRECTION","note":"Correct the name through REOPEN MCB_CORRECTION."}')|$(jget remedy_status)|$(jget purchased)"
t "  → proposing it does not reopen production by itself" "$MSTAGE_BEFORE|RESOLUTION_IN_PROGRESS" "$(q "SELECT CONCAT_WS('|',stage,reopen_count) FROM order_production WHERE order_id=$MO")|$(cstat $O1)"

section "6. REPLACEMENT CONTROL — BELLA OR LEWIS WHEN IT COSTS MCB MONEY"
STRIPE_BEFORE=$(stub_count)
ov; APPROVALS0=$(ovj 'd["approvals"]["pending"]')
t "a replacement is prepared and waits for a founder: nothing is purchased" "200|FOUNDER_APPROVAL_REQUIRED|false|$SUPPLIER_ORDERS0" "$(care PROPOSE_REMEDY $D1 '{"type":"REPLACEMENT_REQUIRED","note":"Cracked record: replace like for like."}')|$(jget remedy_status)|$(jget purchased)|$(q "SELECT COUNT(*) FROM supplier_orders")"
R1=$(jget remedy_id)
cc "view=approvals" >/dev/null
t "  → it is in Approvals for Bella or Lewis; ordinary support is not" "1|0" "$(cj 'sum(1 for a in d["pending"] if a["kind"]=="SUPPORT_REMEDY" and a["title"]=="Replacement approval required")')|$(cj 'sum(1 for a in d["pending"] if a["kind"] in ("CUSTOMER_SUPPORT","PRIVACY_REVIEW"))')"
ov
t "  → Needs your approval counts exactly the founder decisions" "$((APPROVALS0+1))" "$(ovj 'd["approvals"]["pending"]')"
t "it cannot be started before a founder decides" "409" "$(R=$R1 care START_REMEDY $D1 '{"remedy_id":int(E["R"])}')"
t "a wrong founder code is refused and audited" "403|founder_authorisation_failed|1" "$(R=$R1 care DECIDE_REMEDY $D1 '{"remedy_id":int(E["R"]),"decision":"AUTHORISE","note":"ok","founder":"BELLA","founder_code":"wrong-code-000000","confirm":True}')|$(jget error)|$(q "SELECT COUNT(*)>=1 FROM order_events WHERE order_id=$KO AND event_type='FULFILMENT.AUTHORISATION_REFUSED'")"
t "Bella authorises it: authorised, still nothing purchased, no payment request" "200|AUTHORISED|BELLA|$SUPPLIER_ORDERS0|$STRIPE_BEFORE" "$(R=$R1 C="$FOUNDER_CODE_BELLA" care DECIDE_REMEDY $D1 '{"remedy_id":int(E["R"]),"decision":"AUTHORISE","note":"Replace like for like.","founder":"BELLA","founder_code":E["C"],"confirm":True}')|$(q "SELECT status FROM support_remedies WHERE id=$R1")|$(q "SELECT authorised_by FROM support_remedies WHERE id=$R1")|$(q "SELECT COUNT(*) FROM supplier_orders")|$(stub_count)"
t "saying a remedy costs MCB nothing needs a reason" "422|invalid_note" "$(care PROPOSE_REMEDY $DL '{"type":"REPLACEMENT_REQUIRED","costs_mcb":"NO"}')|$(jget error)"
q "UPDATE support_remedies SET decided_at = UTC_TIMESTAMP() - INTERVAL 10 DAY WHERE id=$R1" >/dev/null
t "health: an approved replacement not actioned is caught" "1" "$(cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="REPLACEMENT_APPROVED_NOT_ACTIONED" and f["case_id"]=='"$D1"')')"
t "completing it (after placing it through fulfilment) clears the finding" "200|COMPLETED|0" "$(R=$R1 care COMPLETE_REMEDY $D1 '{"remedy_id":int(E["R"]),"note":"Replacement placed through the fulfilment workflow."}')|$(q "SELECT status FROM support_remedies WHERE id=$R1")|$(cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="REPLACEMENT_APPROVED_NOT_ACTIONED")')"

section "7. REFUND REVIEW — NO REFUND IS EXECUTED; PARTIAL REFUNDS COUNTED CORRECTLY"
KTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$KO")
# Revenue counts live payments only: this rehearsal order is marked live in the database (test data only).
q "UPDATE orders SET stripe_livemode = 1 WHERE id=$KO" >/dev/null
ov; GROSS0=$(ovj 'd["revenue"]["month"]["gross_paid_minor"]'); REF0=$(ovj 'd["revenue"]["month"]["refunds_minor"]')
t "a partial refund review is requested: nothing refunded" "200|REFUND_REVIEW_REQUIRED|2000|false" "$(care REQUEST_REFUND_REVIEW $D1 '{"refund_type":"PARTIAL","amount_minor":2000,"reason":"Goodwill for the delay while the replacement is made."}')|$(jget refund_status)|$(jget amount_minor)|$(jget refund_executed)"
F1=$(jget refund_id)
t "  → one open review at a time; a partial cannot be the whole amount" "409|refund_review_open" "$(care REQUEST_REFUND_REVIEW $D1 '{"refund_type":"FULL","reason":"again"}')|$(jget error)"
t "recording before a founder decision is refused" "409" "$(F=$F1 care RECORD_REFUND $D1 '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'"}')"
t "sent to the founders: a refund decision in Approvals" "200|FOUNDER_DECISION_REQUIRED|1" "$(F=$F1 care SUBMIT_REFUND_FOR_DECISION $D1 '{"refund_id":int(E["F"])}')|$(jget refund_status)|$(cc "view=approvals" >/dev/null; cj 'sum(1 for a in d["pending"] if a["kind"]=="REFUND_DECISION")')"
t "Lewis authorises: authorised, still no refund request anywhere" "200|AUTHORISED|LEWIS|0" "$(F=$F1 C="$FOUNDER_CODE_LEWIS" care DECIDE_REFUND $D1 '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"Agreed goodwill.","founder":"LEWIS","founder_code":E["C"],"confirm":True}')|$(jget refund_status)|$(q "SELECT founder FROM refund_reviews WHERE id=$F1")|$(docker exec mcb-api sh -c 'grep -c refunds /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"
q "UPDATE refund_reviews SET decided_at = UTC_TIMESTAMP() - INTERVAL 10 DAY WHERE id=$F1" >/dev/null
t "health: an authorised refund not recorded is caught" "1" "$(cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="REFUND_AUTHORISED_NOT_RECORDED")')"
t "a key or a future date is refused as the record" "422|invalid_reference|422|invalid_date" "$(F=$F1 care RECORD_REFUND $D1 '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'","external_reference":"sk_live_notarealkey"}')|$(jget error)|$(F=$F1 care RECORD_REFUND $D1 '{"refund_id":int(E["F"]),"refunded_on":"2999-01-01"}')|$(jget error)"
t "the partial refund made outside MCB is recorded: order still PAID, not refunded" "200|RECORDED|PAID|$((KTOTAL-2000))|false|PARTIALLY_REFUNDED" "$(F=$F1 care RECORD_REFUND $D1 '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'","external_reference":"re_test_partial_001"}')|$(q "SELECT status FROM refund_reviews WHERE id=$F1")|$(q "SELECT status FROM orders WHERE id=$KO")|$(jget money.net_paid_minor)|$(jget money.fully_refunded)|$(jget suggested_recovery_outcome)"
ov
t "revenue: gross unchanged, net paid less the partial refund, no order counted as refunded" "$GROSS0|$((REF0+2000))|2000|$((GROSS0-REF0-2000))|0|1" "$(ovj 'd["revenue"]["month"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["month"]["refunds_minor"]')|$(ovj 'd["revenue"]["month"]["partial_refunds_minor"]')|$(ovj 'd["revenue"]["month"]["net_paid_minor"]')|$(ovj 'd["revenue"]["month"]["refunded_orders"]')|$(ovj 'd["revenue"]["month"]["partially_refunded_orders"]')"
care REQUEST_REFUND_REVIEW $D1 '{"refund_type":"FULL","reason":"Customer no longer wants the replacement."}' >/dev/null; F2=$(jget refund_id)
t "a full refund of the remainder is only the remainder" "$((KTOTAL-2000))" "$(q "SELECT amount_minor FROM refund_reviews WHERE id=$F2")"
F=$F2 care SUBMIT_REFUND_FOR_DECISION $D1 '{"refund_id":int(E["F"])}' >/dev/null
F=$F2 C="$FOUNDER_CODE_BELLA" care DECIDE_REFUND $D1 '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"Full refund agreed.","founder":"BELLA","founder_code":E["C"],"confirm":True}' >/dev/null
F=$F2 care RECORD_REFUND $D1 '{"refund_id":int(E["F"]),"refunded_on":"'"$TODAY"'"}' >/dev/null
ov
t "  → once everything is refunded the order counts as refunded once; partial value stays partial" "1|0|2000|$GROSS0|$((GROSS0-REF0-KTOTAL))" "$(ovj 'd["revenue"]["month"]["refunded_orders"]')|$(ovj 'd["revenue"]["month"]["partially_refunded_orders"]')|$(ovj 'd["revenue"]["month"]["partial_refunds_minor"]')|$(ovj 'd["revenue"]["month"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["month"]["net_paid_minor"]')"
t "metrics: partial and full refund values kept apart" "2000|$((KTOTAL-2000))" "$(cget view=metrics >/dev/null; cj 'd["metrics"]["partial_refund_value_minor"]')|$(cj 'd["metrics"]["full_refund_value_minor"]')"
q "UPDATE orders SET stripe_livemode = 0 WHERE id=$KO" >/dev/null
tc "no refund, payout or supplier API exists in the customer care code" "$(grep -niE 'curl_init|stripe_request|/v1/refunds|/v1/payouts|/v1/transfers|api\.mozart|file_get_contents\(.https?:' public/api/lib/customer-care.php public/api/crm/support.php public/api/order-support.php public/api/order-support-case.php | grep -q . && echo 0 || echo 1)"

section "8. DIGITAL AND VIDEO SUPPORT"
reset_limits
t "a link that stopped working: digital delivery case" "201|IMPORTANT|EXPIRED_LINK" "$(help_req $MT '{"kind":"DIGITAL_DELIVERY_PROBLEM","issue":"EXPIRED_LINK","description":"The link in my email does not open any more."}')|$(q "SELECT priority FROM order_service_requests WHERE id=$(jget case_id)")|$(q "SELECT issue FROM order_service_requests WHERE id=$(jget case_id)")"
L1=$(jget case_id)
care REISSUE_ORDER_LINK $L1 >/dev/null; NEWT=$(jget link | sed 's/.*#//')
t "staff issue a fresh private link: audited, it works, and it is not a creative revision" "1|200|$MJOBS_BEFORE" "$(evcount $MO SUPPORT.ACCESS_REISSUED)|$(post_json order-progress "$(tokonly $NEWT)")|$(q "SELECT GROUP_CONCAT(CONCAT(id,':',status)) FROM creative_jobs WHERE order_id=$MO")"
MT=$NEWT
# A revealed Memory Music Video.
paid_order '{"sku":"moment","email":"care-video@example.com","video":[1,1]}'; VO=$OID; VREF=$(ref_of $VO); VJOB=$(job_of $VO)
act $VO ISSUE_STATUS_LINK >/dev/null; VT=$(link_token status)
vpost "$(vact $VO $VJOB CONFIRM_INPUTS)" >/dev/null
song_to_master $VO $VREF
vpost "$(vact $VO $VJOB START_PRODUCTION)" >/dev/null
mkmp4 $TMPV/care.mp4 195 1920 1080; cand $VO $VREF $VJOB $TMPV/care.mp4 >/dev/null
VC1=$(q "SELECT id FROM video_candidates WHERE video_job_id=$VJOB AND version=1")
ccpost "$(vqc $VO $VC1 "$VQ_YES" PASS)" >/dev/null
vpost "$(vact $VO $VJOB REVEAL_VIDEO '{"send_email":true}')" >/dev/null
RES_BEFORE=$(q "SELECT CONCAT_WS('|',id,status,period_id) FROM video_capacity_reservations WHERE order_id=$VO")
USED_BEFORE=$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE status IN ('HELD','RESERVED','COMPLETED')")
reset_limits
progress $VT
t "a video order is offered 'Video problem'; the film is revealed" "True|REVEALED" "$(pj 'str("VIDEO_PROBLEM" in [k["kind"] for k in d["support_kinds"]])')|$(jstat $VJOB)"
t "the film won't play: a video case linked to the job" "201|$VJOB|PLAYBACK" "$(help_req $VT '{"kind":"VIDEO_PROBLEM","issue":"PLAYBACK","description":"The film stops after ten seconds on my tablet."}')|$(q "SELECT video_job_id FROM order_service_requests WHERE id=$(jget case_id)")|$(q "SELECT issue FROM order_service_requests WHERE id=$(jget case_id)")"
V1=$(jget case_id)
t "a remade film needs an objective error; a preference cannot remake it" "409|classification_required" "$(VJ_=$VJOB care PROPOSE_REMEDY $V1 '{"type":"VIDEO_REDELIVERY","capacity_basis":"REWORK_ATTEMPT","video_job_id":int(E["VJ_"])}')|$(jget error)"
care CLASSIFY $V1 '{"classification":"OBJECTIVE_MCB_ERROR","note":"Checked the master: the file is damaged after 10 seconds."}' >/dev/null
t "a rework attempt is proposed and started: the job goes back to rework" "200|REWORK_ATTEMPT|200|REWORK_REQUIRED" "$(VJ_=$VJOB care PROPOSE_REMEDY $V1 '{"type":"VIDEO_REDELIVERY","capacity_basis":"REWORK_ATTEMPT","video_job_id":int(E["VJ_"])}')|$(q "SELECT capacity_basis FROM support_remedies WHERE id=$(jget remedy_id)")|$(R=$(jget remedy_id) care START_REMEDY $V1 '{"remedy_id":int(E["R"])}')|$(jstat $VJOB)"
tc "  → the capacity uncertainty is stated, not guessed" "$(jget capacity_note | grep -q PENDING_EXTERNAL_VERIFICATION && echo 1 || echo 0)"
t "  → the original reservation is untouched; no other customer's space is used; the master history stays" "$RES_BEFORE|$USED_BEFORE|1" "$(q "SELECT CONCAT_WS('|',id,status,period_id) FROM video_capacity_reservations WHERE order_id=$VO")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE status IN ('HELD','RESERVED','COMPLETED')")|$(q "SELECT COUNT(*) FROM video_masters WHERE video_job_id=$VJOB")"

section "9. COMMAND CENTRE, CONSOLE, HEALTH AND RECOVERY"
ov
t "ordinary support work is attention, not approval" "1|0" "$(ovj 'sum(1 for a in d["attention"] if a["kind"]=="CUSTOMER_SUPPORT" and a["facts"]["case_id"]=='"$Q1"')')|$(cc "view=approvals" >/dev/null; cj 'sum(1 for a in d["pending"] if a.get("facts",{}).get("case_id")=='"$Q1"' and a["kind"] not in ("SUPPORT_REMEDY","REFUND_DECISION"))')"
t "the customers view counts match the cases" "$(q "SELECT COUNT(*) FROM order_service_requests WHERE status='NEW'")|$(q "SELECT COUNT(*) FROM order_service_requests WHERE status IN ('NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS') AND priority='URGENT'")|$(q "SELECT COUNT(*) FROM order_service_requests WHERE status IN ('NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS')")" "$(cc view=customers >/dev/null; cj 'd["summary"]["new_cases"]')|$(cj 'd["summary"]["urgent"]')|$(cj 'd["summary"]["open_cases"]')"
t "console filters: urgent includes the damaged and wrong-item cases; waiting-for-customer is empty" "True|0" "$(cget "view=list&filter=urgent" >/dev/null; cj 'str({'"$D1"','"$W1"'} <= {c["case_id"] for c in d["cases"]})')|$(cget "view=list&filter=waiting_customer" >/dev/null; cj 'd["counts"]["waiting_customer"]')"
q "UPDATE order_service_requests SET status_since = UTC_TIMESTAMP() - INTERVAL 6 DAY, created_at = UTC_TIMESTAMP() - INTERVAL 6 DAY WHERE id=$DL" >/dev/null
q "UPDATE order_service_requests SET first_response_at = NULL WHERE id=$DL" >/dev/null
ov
t "health: a customer with no reply beyond one working day, and an urgent case not reviewed" "1|1" "$(cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="CUSTOMER_MESSAGE_WITHOUT_RESPONSE" and f["case_id"]=='"$DL"')')|$(q "UPDATE order_service_requests SET created_at = UTC_TIMESTAMP() - INTERVAL 6 HOUR WHERE id=$D1" >/dev/null; q "UPDATE order_service_requests SET status='NEW' WHERE id=$D1" >/dev/null; cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="URGENT_CASE_NOT_REVIEWED" and f["case_id"]=='"$D1"')')"
t "  → the Command Centre shows an overdue reply card and counts it" "1|True" "$(ovj 'sum(1 for a in d["attention"] if a["title"].startswith("Overdue reply") and a["facts"]["case_id"]=='"$DL"')')|$(ovj 'str(d["customer_care"]["overdue_mcb_response"] >= 1)')"
t "resolving an operational case needs an outcome and a root cause (not blame)" "422|invalid_recovery_outcome|422|invalid_root_cause" "$(care RESOLVE $DL)|$(jget error)|$(care RESOLVE $DL '{"recovery_outcome":"RESOLVED"}')|$(jget error)"
q "UPDATE fulfilment_exceptions SET blocking = 1 WHERE service_request_id=$DL" >/dev/null
t "resolving with a blocking exception still open warns, and health catches it" "200|RESOLVED|1|1" "$(care RESOLVE $DL '{"recovery_outcome":"RESOLVED","root_cause":"DELIVERY_ERROR","resolution_note":"Carrier found the parcel."}')|$(cstat $DL)|$(jget warning | grep -c 'blocking')|$(cget view=health >/dev/null; cj 'sum(1 for f in d["findings"] if f["check"]=="RESOLVED_WITH_BLOCKING_EXCEPTION")')"
t "a question resolves without a root cause" "200|RESOLVED" "$(care RESOLVE $Q1 '{"recovery_outcome":"RESOLVED"}')|$(cstat $Q1)"
progress $MT
t "the resolved case stays on the customer's page and asks, once and optionally, if it was resolved" "Resolved|True" "$(pj '[c for c in d["support"] if c["case_id"]=='"$Q1"'][0]["status_label"]')|$(pj 'str([c for c in d["support"] if c["case_id"]=='"$Q1"'][0]["satisfaction"]["asked"])')"
t "  → yes is recorded once; asking an open case is refused" "201|409|409" "$(case_sat $MT $Q1 YES)|$(case_sat $MT $Q1 NO)|$(case_sat $MT $O1 YES)"
t "a resolved case keeps the customer out of review requests for the cooling period" "1" "$(q "SELECT review_request_hold_until > UTC_TIMESTAMP() + INTERVAL 20 DAY FROM order_service_requests WHERE id=$DL")"
t "writing again on a resolved case reopens it for MCB and counts a repeat contact" "201|WAITING_FOR_MCB|1" "$(case_msg $MT $Q1 'One more thing about the party.')|$(cstat $Q1)|$(q "SELECT repeat_contacts FROM order_service_requests WHERE id=$Q1")"
t "metrics carry counts and rates only, never content" "True|0" "$(cget view=metrics >/dev/null; cj 'str(all(k in d["metrics"] for k in ["open_cases","new_cases","urgent_cases","average_first_response_hours","average_resolution_hours","overdue_mcb_cases","cases_by_reason","damage_rate","wrong_item_rate","objective_mcb_error_rate","subjective_preference_contact_rate","replacement_rate","refund_rate","partial_refund_value_minor","full_refund_value_minor","recovery_success_rate","repeat_contact_rate"]))')|$(grep -ciE 'party|cracked|Sarah' /tmp/tx.json)"
t "a customer-impacting exception with no case can become one MCB case (once)" "200|200|already_linked" "$(XID=$(q "SELECT id FROM fulfilment_exceptions WHERE order_id=$KO AND service_request_id IS NULL AND status='OPEN' LIMIT 1"); [ -z "$XID" ] && { actj $KO RAISE_FULFILMENT_EXCEPTION '{"type":"CUSTOMS_EXCEPTION","blocking":False,"detail":"Held at customs"}' >/dev/null; q "UPDATE fulfilment_exceptions SET service_request_id=NULL WHERE order_id=$KO AND type='CUSTOMS_EXCEPTION'" >/dev/null; XID=$(q "SELECT id FROM fulfilment_exceptions WHERE order_id=$KO AND type='CUSTOMS_EXCEPTION'"); }; echo "$XID" > $TMPV/xid; XID_=$XID crmpost $CARE "$(XID_=$XID js '{"action":"OPEN_CASE_FROM_EXCEPTION","exception_id":int(E["XID_"]),"staff":"Care Tester"}')")|$(XID_=$(cat $TMPV/xid) crmpost $CARE "$(XID_=$(cat $TMPV/xid) js '{"action":"OPEN_CASE_FROM_EXCEPTION","exception_id":int(E["XID_"]),"staff":"Care Tester"}')")|$(jget outcome)"

section "10. SECURITY, PRIVACY AND WHAT NEVER HAPPENS"
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
crm crm/preflight >/dev/null
t "deployment preflight checks the customer care migration" "PASS" "$(pf customer_care_migration_applied)"
t "no supplier purchase happened during customer care" "$SUPPLIER_ORDERS0" "$(q "SELECT COUNT(*) FROM supplier_orders")"
tc "customer care code holds no secret, key or provider credential" "$(grep -nE 'sk_live_[A-Za-z0-9]{8,}|rk_live_|whsec_[A-Za-z0-9]{10,}|Bearer [A-Za-z0-9]{20,}' public/api/lib/customer-care.php public/api/crm/support.php public/api/order-support.php public/api/order-support-case.php src/pages/order/SupportSection.tsx src/pages/CustomerCare.tsx src/pages/customer-care/CaseView.tsx | grep -q . && echo 0 || echo 1)"
tc "ordinary order support is MCB email and the order page — never WhatsApp" "$(! grep -qiE 'wa\.me|whatsapp\.com|api\.whatsapp' src/pages/order/SupportSection.tsx public/api/order-support.php public/api/order-support-case.php && grep -q 'hello@mycustombeats.com' public/api/data/customer-care.json && echo 1 || echo 0)"
tc "customer-facing support copy never names a supplier, partner, provider or automation" "$(python3 -c 'import json;d=json.load(open("public/api/data/customer-care.json"));import re;t=json.dumps([d["copy"],d["customer_status"],d["case_types"],d["digital_issues"],d["templates"]]);print(0 if re.search(r"supplier|partner|manufacturer|provider|automat|\bAI\b|mozart|founder",t,re.I) else 1)')"
rm -rf "$TMPV"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
