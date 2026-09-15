#!/bin/bash
# MCB FOUNDER COMMAND CENTRE — SPRINT 1 (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# The Command Centre is a READ MODEL plus founder-language quality checks:
# nothing here purchases, refunds, sends to a customer or calls Mozart AI
# (founder selected, integration pending). Payments are TEST; supplier data
# is absent (unknown economics must stay unknown).
#
# Covers: staff-only access; MCB Today counts (paid, memories, creating,
# quality check, approval, being made, on the way, delivered, attention);
# paid revenue (live vs TEST, recorded refunds); estimated vs actual
# contribution and unknown economics; action cards and their deep links;
# opening changes nothing; song and artwork quality checks (pass, internal
# rework without contacting the customer, escalate); founder authorisation
# still needs Bella or Lewis; approvals exclude staff tasks; customer problems
# stay visible after completion; health and stranded orders; truthful
# readiness; Mozart status; Telegram not shown connected until it delivered;
# search; no sensitive content in lists; advanced view; no financial action.

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

stub_reset
reset_limits

section "1. ACCESS, PRIVACY AND AN EMPTY, HEALTHY DAY"
t "the Command Centre needs the CRM key" "401|401|401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$CC?view=overview&$STAFFQ")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$CC?view=search&q=MCB&$STAFFQ")|$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/$CC" -H 'Content-Type: application/json' -d '{}')"
t "  → and a staff name for the audit trail" "422|staff_required" "$(crm "$CC?view=overview")|$(jget error)"
t "  → responses are not cached or indexed" "no-store|noindex, nofollow" "$(curl -s -D - -o /dev/null "$BASE/$CC?view=health&$STAFFQ" -H "Authorization: Bearer $CRMKEY" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{c=$2} tolower($1)=="x-robots-tag"{r=$2} END{print c"|"r}')"
ov
t "an empty day: every count is zero and nothing needs attention" "0|0|0|0|0|0|0|0|0|0" "$(ovj '"|".join(str(d["today"][k]) for k in ["paid","new_memories","creating","needs_quality_check","needs_your_approval","being_made","on_the_way","delivered","needs_attention"])')|$(ovj 'len(d["attention"])')"
t "  → system health: ALL GOOD" "ALL_GOOD|All good" "$(ovj 'd["health"]["status"]')|$(ovj 'd["health"]["label"]')"
t "  → contribution with no cost data is unknown, not zero" "None|None|0" "$(ovj 'str(d["today"]["estimated_gross_contribution_minor"])')|$(ovj 'str(d["today"]["actual_gross_contribution_minor"])')|$(ovj 'd["profit"]["estimated"]["orders"]')"
t "  → days are UTC (no business timezone is configured) and the week starts Monday" "UTC|UTC|1" "$(ovj 'd["period"]["timezone"]')|$(ovj 'd["revenue"]["timezone"]')|$(cc 'view=overview&period=week' >/dev/null; cj 'int(__import__("datetime").date.fromisoformat(d["period"]["start"][:10]).weekday()==0)')"
t "Mozart AI: founder selected, account not yet opened, integration pending" "Mozart AI|FOUNDER_SELECTED|NOT_YET_OPENED|PENDING|False" "$(ovj 'd["music_platform"]["name"]')|$(ovj 'd["music_platform"]["decision"]')|$(ovj 'd["music_platform"]["account"]')|$(ovj 'd["music_platform"]["integration"]')|$(ovj 'str(d["music_platform"]["capabilities_verified"])')"
t "  → generation still routes to manual; no adapter exists for Mozart" "AWAITING_PROVIDER|PENDING|DISABLED|None" "$(crm crm/creative?view=providers >/dev/null; jget route.route)|$(jget route.integration)|$(cj '[p["role"] for p in d["providers"] if p["id"]=="candidate-mozart-ai"][0]')|$(cj 'str([p["adapter"] for p in d["providers"] if p["id"]=="candidate-mozart-ai"][0])')"
tc "  → no Mozart, provider or outbound call exists in the Command Centre or provider code" "$(grep -niE 'mozart\.|api\.mozart|curl_init|file_get_contents\(.https?:|fsockopen' public/api/lib/command-centre.php public/api/crm/command-centre.php public/api/lib/creative-providers.php | grep -q . && echo 0 || echo 1)"
cc view=readiness >/dev/null; cp /tmp/tx.json /tmp/cc-ready.json
rd() { cj '[r["status"] for r in d["readiness"] if r["key"]=="'"$1"'"][0]' /tmp/cc-ready.json; }
t "launch readiness is truthful: nothing READY from code alone" "NEEDS_FOUNDER_ACTION|NEEDS_EXTERNAL_VERIFICATION|NEEDS_EXTERNAL_VERIFICATION|NEEDS_FOUNDER_ACTION|NEEDS_FOUNDER_ACTION|DEFERRED|NEEDS_EXTERNAL_VERIFICATION|NEEDS_EXTERNAL_VERIFICATION" "$(rd supplier_routes)|$(rd manufacturer_templates)|$(rd vinyl_capacities)|$(rd commercial_safety_rule)|$(rd music_platform)|$(rd artwork_production)|$(rd legal_review)|$(rd live_payment)"
t "  → the notification bridge is not READY while Telegram has delivered nothing; founder codes (configured here) are" "NEEDS_EXTERNAL_VERIFICATION|READY" "$(rd notification_bridge)|$(rd founder_authorisation)"
tc "  → readiness exposes no secret, key or hash" "$(grep -qiE 'test_notification_worker_key|\$2y\$|test_crm_key|re_teststub|whsec_' /tmp/cc-ready.json && echo 0 || echo 1)"

section "2. A SONG: CREATING → NEEDS QUALITY CHECK → REWORK → PASS"
paid_order '{"sku":"moment","email":"cc-song@example.com","units":[{"memories":[{"story":"Our secret cove story, never for lists","about":"Anna Winterbourne","occasion":"anniversary"}]}]}'
MO=$OID; MREF=$(ref_of $MO); MJ=$(jobs_of $MO)
ov
t "a paid order counts: paid, new memories, creating (new)" "1|1|1" "$(ovj 'd["today"]["paid"]')|$(ovj 'd["today"]["new_memories"]')|$(ovj 'd["today"]["creating"]')"
tc "  → a routine order in progress creates no attention card" "$(ovj 'len(d["attention"])' | grep -qx 0 && echo 1 || echo 0)"
act $MO START_CREATIVE >/dev/null
cpost "$(lyrics_body $MO $MJ 1 "A secret cove and twenty five years of tides together" "Always the cove")" >/dev/null
[ "$(jstatus $MJ)" = LYRICS_REVIEW_REQUIRED ] && cpost "$(OID=$MO JOB=$MJ js '{"action":"LYRICS_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"outcome":"PASS"}')" >/dev/null
cfile $MO $MREF $MJ $FIX/audio-195s.flac >/dev/null
C1=$(cand_of $MJ)
ov
t "the song awaits quality review: Needs Quality Check = 1, still Creating" "CREATIVE_QC_REQUIRED|1|CREATING" "$(jstatus $MJ)|$(ovj 'd["today"]["needs_quality_check"]')|$(ovj '[p["count"] for p in d["pipeline"] if p["stage"]=="CREATING"][0]' | sed 's/^1$/CREATING/')"
t "  → one action card: song quality check, opening the quality view" "QUALITY_CHECK|Song quality check required|quality|$MREF" "$(ovj 'd["attention"][0]["kind"]')|$(ovj 'd["attention"][0]["title"]')|$(ovj 'd["attention"][0]["action"]["open"]')|$(ovj 'd["attention"][0]["order"]["reference"]')"
tc "  → list views carry no story, email, surname or address" "$(grep -qiE 'secret cove|cc-song@|Tx Customer|Harbour|Southampton|stored_name|Winterbourne' /tmp/cc-ov.json && echo 0 || echo 1)"
t "  → the card names the customer safely (first name and initial)" "Tx C." "$(ovj 'd["attention"][0]["order"]["customer"]')"
BEFORE=$(events_total)
t "opening the order card changes nothing" "200|$MREF|$BEFORE" "$(cc "view=order&order_id=$MO")|$(jget summary.reference)|$(events_total)"
t "opening the quality view changes nothing but records who looked" "200|1|$BEFORE|1" "$(cc "view=quality&order_id=$MO")|$(cj 'len(d["songs"])')|$(events_total)|$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$MO AND action='COMMAND_CENTRE_QUALITY_VIEW'")"
cp /tmp/tx.json /tmp/cc-q.json
t "  → the song: title, target and actual length, style, protected facts, lyrics, eight founder questions" "Chapter 1 Always|195|195|8|True" "$(cj 'd["songs"][0]["title"]' /tmp/cc-q.json)|$(cj 'd["songs"][0]["target_duration_seconds"]' /tmp/cc-q.json)|$(cj 'd["songs"][0]["actual_duration_seconds"]' /tmp/cc-q.json)|$(cj 'len(d["song_questions"])' /tmp/cc-q.json)|$(cj 'str(any("Anna Winterbourne" in str(f["value"]) for f in d["songs"][0]["facts"]) and len(d["songs"][0]["lyrics"])>0)' /tmp/cc-q.json)"
t "  → the song itself can be listened to (staff key; audited)" "200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/creative-file?candidate_id=$C1&staff=Founder%20Tester" -H "Authorization: Bearer $CRMKEY")|$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$MO AND action='DOWNLOAD_CANDIDATE'")"
t "a quality decision needs every question answered" "422|quality_answers_required" "$(ccpost "$(OID=$MO CID=$C1 js '{"action":"SONG_QUALITY_CHECK","order_id":int(E["OID"]),"candidate_id":int(E["CID"]),"answers":{"story":"YES"},"decision":"PASS","staff":"Founder Tester"}')")|$(jget error)"
t "a song with a 'no' cannot pass" "422|creative_qc_concern" "$(ccpost "$(song_qc $MO $C1 "$SONG_NO" PASS)")|$(jget error)"
MAIL0=$(mail_count); COMMS0=$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")
t "send back for internal rework: the song goes back to MCB's team" "200|REWORK|CREATIVE_FAIL|1" "$(ccpost "$(song_qc $MO $C1 "$SONG_NO" REWORK)")|$(jget decision)|$(q "SELECT status FROM creative_generation_attempts WHERE id=(SELECT attempt_id FROM creative_candidates WHERE id=$C1)")|$(evcount $MO FOUNDER.QUALITY_REVIEWED)"
t "  → rework does not contact the customer" "$MAIL0|$COMMS0" "$(mail_count)|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")"
t "  → audit: who, what, order, when, result" "SONG|REWORK|Founder Tester|yes" "$(q "SELECT CONCAT_WS('|',JSON_VALUE(detail,'$.kind'),JSON_VALUE(detail,'$.decision'),JSON_VALUE(detail,'$.by'),IF(created_at IS NULL,'no','yes')) FROM order_events WHERE order_id=$MO AND event_type='FOUNDER.QUALITY_REVIEWED'")"
cfile $MO $MREF $MJ $FIX/audio-195s.flac >/dev/null
C2=$(cand_of $MJ)
t "the reworked song passes: it becomes the production master" "200|PASS|MASTER_READY|1" "$(ccpost "$(song_qc $MO $C2 "$SONG_YES" PASS)")|$(jget decision)|$(jstatus $MJ)|$(q "SELECT COUNT(*) FROM creative_masters WHERE job_id=$MJ AND kind='PRODUCTION_MASTER'")"
t "  → quality check cleared from Today; the customer was still not contacted" "0|$MAIL0" "$(ov; ovj 'd["today"]["needs_quality_check"]')|$(mail_count)"
tc "  → no customer approval exists in the Command Centre" "$(grep -qiE 'REQUEST_APPROVAL|customer approv(al|es) (step|required)' public/api/lib/command-centre.php src/pages/CommandCentre.tsx src/pages/command-centre/*.tsx && echo 0 || echo 1)"

section "3. ARTWORK QUALITY CHECK AND FOUNDER APPROVAL (UNKNOWN ECONOMICS)"
reset_limits
paid_order '{"sku":"keepsake-12-picture-disc","email":"cc-keepsake@example.com"}'
KO=$OID; KREF=$(ref_of $KO)
act $KO START_CREATIVE >/dev/null; act $KO SEND_TO_QUALITY_CHECK >/dev/null
pfget $KO >/dev/null
KJOB=$(ajob_of $KO); KPHOTO=$(photos_of $KO)
art $KO $KREF $KJOB $KPHOTO $FIX/artwork-3600x3600.png >/dev/null; A1=$(jget art_master_id)
ov
t "artwork awaiting review adds an artwork quality card (and the final check card)" "1|1" "$(ovj 'sum(1 for a in d["attention"] if a["title"]=="Artwork quality check required" and a["order"]["order_id"]=='"$KO"')')|$(ovj 'sum(1 for a in d["attention"] if a["title"]=="Final quality check required" and a["order"]["order_id"]=='"$KO"')')"
t "  → Needs Quality Check counts orders, not items" "1" "$(ovj 'd["today"]["needs_quality_check"]')"
t "the artwork review: product, nine founder questions, source photo, faces and branding may be not applicable" "200|1|9|1|No faces in this artwork" "$(cc "view=quality&order_id=$KO")|$(cj 'len(d["artwork"])')|$(cj 'len(d["artwork_questions"])')|$(cj 'len(d["artwork"][0]["source_photo_ids"])')|$(cj '[q["not_applicable"] for q in d["artwork_questions"] if q["key"]=="faces"][0]')"
t "  → the artwork and the source photograph open with the staff key" "200|200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/production-files?art_master_id=$A1&download=1&$STAFFQ" -H "Authorization: Bearer $CRMKEY")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/upload?id=$(cj 'd["artwork"][0]["source_photo_ids"][0]')" -H "Authorization: Bearer $CRMKEY")"
MAIL0=$(mail_count)
t "artwork with a spelling problem is sent back for internal rework" "200|REWORK_REQUIRED|$MAIL0" "$(ccpost "$(art_qc $KO $A1 "$ART_NO" REWORK)")|$(q "SELECT status FROM artwork_creative_jobs WHERE id=$KJOB")|$(mail_count)"
art $KO $KREF $KJOB $KPHOTO $FIX/artwork-3600x3600.png >/dev/null; A2=$(jget art_master_id)
t "the new version passes the founder's artwork quality check" "200|PASS|ART_READY" "$(ccpost "$(art_qc $KO $A2 "$ART_YES" PASS)")|$(q "SELECT visual_qc_status FROM artwork_art_masters WHERE id=$A2")|$(q "SELECT status FROM artwork_creative_jobs WHERE id=$KJOB")"
t "  → escalation of an art master that is not awaiting review is refused" "409|invalid_transition" "$(ccpost "$(art_qc $KO $A2 "$ART_YES" ESCALATE)")|$(jget error)"
register_artwork $KO
act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL" >/dev/null
ov
t "ready for fulfilment: Needs Your Approval = 1, with a purchase approval card" "FULFILMENT.READY|1|PURCHASE_APPROVAL|approve" "$(state_of $KO)|$(ovj 'd["today"]["needs_your_approval"]')|$(ovj '[a["kind"] for a in d["attention"] if a["order"]["order_id"]=='"$KO"'][0]')|$(ovj '[a["action"]["open"] for a in d["attention"] if a["order"]["order_id"]=='"$KO"'][0]')"
t "  → unknown economics stay unknown: no expected fulfilment or contribution invented" "None|None|COMMERCIAL_DATA_REQUIRED|VERIFIED|PASSED" "$(ovj 'str([a["facts"]["expected_fulfilment_minor"] for a in d["attention"] if a["kind"]=="PURCHASE_APPROVAL"][0])')|$(ovj 'str([a["facts"]["estimated_contribution_minor"] for a in d["attention"] if a["kind"]=="PURCHASE_APPROVAL"][0])')|$(ovj '[a["facts"]["economics"] for a in d["attention"] if a["kind"]=="PURCHASE_APPROVAL"][0]')|$(ovj '[a["facts"]["payment"] for a in d["attention"] if a["kind"]=="PURCHASE_APPROVAL"][0]')|$(ovj '[a["facts"]["mcb_checks"] for a in d["attention"] if a["kind"]=="PURCHASE_APPROVAL"][0]')"
t "  → the profit snapshot counts the order as awaiting cost data, not zero cost" "0|None|1|ESTIMATED|ACTUAL" "$(ovj 'd["profit"]["estimated"]["orders"]')|$(ovj 'str(d["profit"]["estimated"]["contribution_minor"])')|$(ovj 'd["profit"]["orders_awaiting_cost_data"]')|$(ovj 'd["profit"]["estimated"]["label"]')|$(ovj 'd["profit"]["actual"]["label"]')"
tc "  → contribution is never called net profit" "$(ovj 'd["profit"]["note"]' | grep -q 'not net profit' && ! grep -rniE '>[^<]*net profit[^<]*<' src/pages/CommandCentre.tsx src/pages/command-centre/ && echo 1 || echo 0)"
cc view=approvals >/dev/null
t "approvals: the purchase is waiting; staff-only tasks (quality checks, placing orders) are not listed" "1|SUPPLIER_PURCHASE|0" "$(cj 'len(d["pending"])')|$(cj 'd["pending"][0]["kind"]')|$(cj 'sum(1 for p in d["pending"] if p["kind"] not in ("SUPPLIER_PURCHASE","EXCEPTION_DECISION"))')"
BEFORE=$(events_total)
t "opening the approval (the card's deep link target) authorises nothing" "200|FULFILMENT.READY|NULL|$BEFORE" "$(cc "view=order&order_id=$KO")|$(state_of $KO)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$KO")|$(events_total)"
t "  → the order card offers the approval with the decision data" "True|COMMERCIAL_DATA_REQUIRED|DESTINATION_UNKNOWN" "$(cc "view=order&order_id=$KO" >/dev/null; cj 'str("AUTHORISE_SUPPLIER_PURCHASE" in d["available_actions"])')|$(cj 'd["decision"]["economics"]["status"]')|$(cj 'd["decision"]["destination_status"]')"
t "supplier authorisation still needs Bella or Lewis with their own code" "422|founder_required|403" "$(act $KO AUTHORISE_SUPPLIER_PURCHASE '"confirm":true,"destination_acknowledged":true,"commercial_acknowledged":true')|$(jget error)|$(founder_authorise $KO LEWIS wrong-code-000000)"
t "Lewis authorises; Approvals shows who and when" "200|LEWIS|yes|0" "$(founder_authorise $KO LEWIS "$FOUNDER_CODE_LEWIS")|$(cc view=approvals >/dev/null; cj 'd["decided"][0]["decided_by"]')|$(cj '"yes" if d["decided"][0]["decided_at"] else "no"')|$(cj 'len(d["pending"])')"
t "  → placing the supplier order is a staff card, not a founder approval" "SUPPLIER_ORDER|0" "$(ov; ovj '[a["kind"] for a in d["attention"] if a["order"]["order_id"]=='"$KO"'][0]')|$(ovj 'd["today"]["needs_your_approval"]')"

section "4. BEING MADE, ON THE WAY, DELIVERED, AND A CUSTOMER PROBLEM AFTER COMPLETION"
act $KO RECORD_SUPPLIER_ORDER '"supplier_order_reference":"CC-SO-1","send_email":false' >/dev/null
t "recorded supplier order: Being Made = 1" "1|1" "$(ov; ovj 'd["today"]["being_made"]')|$(ovj '[p["count"] for p in d["pipeline"] if p["stage"]=="BEING_MADE"][0]')"
t "  → a substitution raises a founder decision in Approvals" "409|Product substitution decision" "$(act $KO RECORD_SUPPLIER_ORDER '"supplier_order_reference":"CC-SO-2","substitute_sku":"keepsake-10-picture-disc"')|$(cc view=approvals >/dev/null; cj '[p["title"] for p in d["pending"] if p["kind"]=="EXCEPTION_DECISION"][0]')"
SUBX=$(exc_id $KO SUBSTITUTION_APPROVAL_REQUIRED)
OX=$SUBX actj $KO RESOLVE_FULFILMENT_EXCEPTION '{"exception_id":int(E["OX"]),"resolution":"NO_ACTION_NEEDED","note":"Ordered product used."}' >/dev/null
act $KO MARK_DISPATCHED "\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\",\"send_email\":false" >/dev/null
t "dispatched: On The Way = 1" "1|0" "$(ov; ovj 'd["today"]["on_the_way"]')|$(ovj 'd["today"]["being_made"]')"
act $KO MARK_DELIVERED "\"delivered_on\":\"$TODAY\"" >/dev/null
t "delivered and completed: Delivered today = 1" "COMPLETED|1|0" "$(state_of $KO)|$(ov; ovj 'd["today"]["delivered"]')|$(ovj 'd["today"]["on_the_way"]')"
act $KO ISSUE_STATUS_LINK >/dev/null; KTOK=$(link_token status)
reset_limits
post_json order-support "$(TOK=$KTOK js '{"token":E["TOK"],"kind":"DAMAGED_OR_FAULTY","item":"item-1","description":"The record arrived cracked across the label."}')" >/dev/null
ov
t "a damaged item after completion stays visible: Customers needing help" "1|Damaged item|Delivered" "$(ovj 'len(d["customers"])')|$(ovj 'd["customers"][0]["label"]')|$(ovj 'd["customers"][0]["order"]["stage_label"]')"
t "  → it is a priority attention card and counts as Needs Attention" "CUSTOMER_SUPPORT|1|1" "$(ovj '[a["kind"] for a in d["attention"] if a["order"]["order_id"]=='"$KO"'][0]')|$(ovj '[a["priority"] for a in d["attention"] if a["kind"]=="CUSTOMER_SUPPORT"][0]')|$(ovj 'd["today"]["needs_attention"]')"
tc "  → the list shows the kind and age, never the customer's description" "$(grep -q 'cracked across the label' /tmp/cc-ov.json && echo 0 || echo 1)"
t "a delivery exception with no customer report is also a customer to help" "Delivery issue" "$(act $KO RAISE_FULFILMENT_EXCEPTION '"type":"PARCEL_DELAYED","detail":"Carrier scan missing","blocking":false' >/dev/null; cc view=customers >/dev/null; cj '[c["label"] for c in d["customers"] if c["kind"]=="DELIVERY_EXCEPTION"][0]')"

section "5. REVENUE: PAID, NOT CHECKOUT VALUE; LIVE VS TEST; RECORDED REFUNDS"
reset_limits
order '{"sku":"moment","email":"cc-unpaid@example.com"}'
UNPAID_TOTAL=$(jget total_minor /tmp/order.json)
ov
TEST_TOTAL=$(q "SELECT SUM(o.total_minor) FROM orders o JOIN order_events e ON e.order_id=o.id AND e.dedupe_key='paid'")
t "an unpaid checkout is not revenue; TEST payments are shown apart and are not revenue" "0|$TEST_TOTAL|2" "$(ovj 'd["revenue"]["today"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["today"]["test_paid_minor"]')|$(ovj 'd["revenue"]["today"]["test_orders"]')"
q "UPDATE orders SET stripe_livemode=1 WHERE id=$MO" >/dev/null
MTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$MO")
t "a live paid order is paid revenue (today, week, month)" "$MTOTAL|$MTOTAL|$MTOTAL|1" "$(ov; ovj 'd["revenue"]["today"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["week"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["month"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["today"]["paid_orders"]')"
q "UPDATE orders SET stripe_livemode=1, status='REFUNDED' WHERE id=$KO" >/dev/null
KTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$KO")
t "a recorded refund: gross, refunds and net paid" "$((MTOTAL+KTOTAL))|$KTOTAL|$MTOTAL" "$(ov; ovj 'd["revenue"]["today"]["gross_paid_minor"]')|$(ovj 'd["revenue"]["today"]["refunds_minor"]')|$(ovj 'd["revenue"]["today"]["net_paid_minor"]')"
q "UPDATE orders SET stripe_livemode=0, status='PAID' WHERE id=$KO; UPDATE orders SET stripe_livemode=0 WHERE id=$MO" >/dev/null

section "6. HEALTH, STRANDED ORDERS AND NOTIFICATIONS"
reset_limits
paid_order '{"sku":"moment","email":"cc-stranded@example.com"}'; SO=$OID
q "DELETE FROM order_events WHERE order_id=$SO AND dedupe_key='ready-for-processing'" >/dev/null
ov
t "a stranded paid order: health ACTION NEEDED and a stranded order card" "ACTION_NEEDED|1|STRANDED_ORDER" "$(ovj 'd["health"]["status"]')|$(ovj '[i["count"] for i in d["health"]["items"] if i["key"]=="stranded_orders"][0]')|$(ovj '[a["kind"] for a in d["attention"] if a["order"]["order_id"]=='"$SO"'][0]')"
tc "  → health is in plain words, with no raw logs" "$(cc view=health >/dev/null; grep -qiE 'stack|trace|SQLSTATE|last_error|payload' /tmp/tx.json && echo 0 || echo 1)"
t "Telegram is not shown connected before it has delivered" "NOT_CONNECTED" "$(cc view=notifications >/dev/null; jget bridge.telegram)"
wk '{"action":"CLAIM","worker":"cc-bridge-test","limit":2}' >/dev/null; cp /tmp/tx.json /tmp/cc-claim.json
N1=$(cj 'd["notifications"][0]["id"]' /tmp/cc-claim.json); T1=$(cj 'd["notifications"][0]["claim_token"]' /tmp/cc-claim.json)
N2=$(cj 'd["notifications"][1]["id"]' /tmp/cc-claim.json); T2=$(cj 'd["notifications"][1]["claim_token"]' /tmp/cc-claim.json)
ack $N1 $T1 DELIVERED STAFF_QUEUE >/dev/null
t "a notification delivered to the staff queue says so; Telegram is still not connected" "Staff queue|NOT_CONNECTED" "$(cc 'view=notifications&filter=delivered' >/dev/null; cj '[n["channel"] for n in d["notifications"] if n["id"]=='"$N1"'][0]')|$(jget bridge.telegram)"
ack $N2 $T2 DELIVERED TELEGRAM >/dev/null
t "  → only an actual Telegram delivery shows Telegram connected" "CONNECTED|Telegram" "$(cc 'view=notifications&filter=all' >/dev/null; jget bridge.telegram)|$(cj '[n["channel"] for n in d["notifications"] if n["id"]=='"$N2"'][0]')"
q "UPDATE founder_notifications SET status='ABANDONED' WHERE id=(SELECT id FROM (SELECT MIN(id) AS id FROM founder_notifications WHERE status='PENDING') x)" >/dev/null
t "failed notifications appear under Needs action and Failed, and in health" "1|1|1" "$(cc 'view=notifications&filter=needs_action' >/dev/null; cj 'sum(1 for n in d["notifications"] if n["needs_action"])')|$(cc 'view=notifications&filter=failed' >/dev/null; cj 'len(d["notifications"])')|$(cc view=health >/dev/null; cj '[i["count"] for i in d["items"] if i["key"]=="notification_failures"][0]')"

section "7. SEARCH, ADVANCED VIEW, AND NO FINANCIAL ACTION"
EV=$(events_total)
t "search by reference, customer email and product" "$MREF|1|True" "$(cc "view=search&q=$MREF" >/dev/null; cj 'd["results"][0]["reference"]')|$(cc 'view=search&q=cc-keepsake%40example' >/dev/null; cj 'len(d["results"])')|$(cc 'view=search&q=Picture%20Disc' >/dev/null; cj 'str(any(r["reference"]=="'"$KREF"'" for r in d["results"]))')"
t "  → results carry safe list fields only; the search text is not recorded" "0|$EV" "$(grep -ciE 'cc-keepsake@|email|story' /tmp/tx.json)|$(events_total)"
t "  → a one-letter search returns nothing" "0" "$(cc 'view=search&q=a' >/dev/null; cj 'len(d["results"])')"
t "the advanced / technical view is available for troubleshooting" "200|True|True" "$(cc "view=advanced&order_id=$KO")|$(cj 'str(len(d["events"])>5)')|$(cj 'str("lifecycle" in d and "quality_records" in d)')"
t "pipeline stage filters orders" "200|True" "$(cc 'view=orders&stage=DELIVERED&period=today')|$(cj 'str(all(o["stage"]=="DELIVERED" for o in d["orders"]) and any(o["order_id"]=='"$KO"' for o in d["orders"]))')"
t "the Command Centre accepts only the two quality actions" "422|unknown_action" "$(ccpost "$(OID=$KO js '{"action":"AUTHORISE_SUPPLIER_PURCHASE","order_id":int(E["OID"]),"staff":"Founder Tester"}')")|$(jget error)"
tc "no purchase, refund, transfer or subscription path in the Command Centre" "$(grep -niE '/v1/refunds|/v1/payouts|/v1/transfers|stripe_request|subscriptions|curl_init|INSERT INTO supplier_orders|UPDATE orders' public/api/lib/command-centre.php public/api/crm/command-centre.php | grep -q . && echo 0 || echo 1)"
t "no Stripe request was made after the TEST payments" "$(stub_count)" "$(ov; stub_count)"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
