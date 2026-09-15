#!/bin/bash
# MCB MEMORY MUSIC VIDEO™ — commerce, capacity and production (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# NO video platform exists or is called: videos are synthetic MP4 files a
# "person" registers. Capacity is the server's ledger (45 planning spaces,
# pending verification). Payments are TEST; nothing is refunded or bought.
#
# Covers: £49 optional enhancement, never preselected, one video for one song
# (Moment and multi-song); server pricing and personalisation rules; the
# capacity ledger (slot 45 accepted, 46 refused, concurrency, holds, expiry,
# duplicate webhooks, truthful availability, full state); duration policy
# (195 s and 240 s eligible, longer → review, master untouched); manual
# production, cross-order refusal, video QC (rework never contacts the
# customer), immutable versioned video masters with audio lineage; private
# customer delivery (signed short-lived links, Range, other tokens refused);
# rights confirmation separate from marketing permission; capacity release;
# metrics; Command Centre; no platform call or credential.

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

section "1. PRODUCT, PRICE, POLICY AND THE MIGRATION"
t "the video policy is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/video.json")"
t "MCB Memory Music Video is £49, digital, orderable, one per order at launch" "4900|DIGITAL|True|1|1" "$(cj 'd["skus"]["memory-music-video"]["price_minor"]' $CATALOGUE)|$(cj 'd["skus"]["memory-music-video"]["fulfilment"]' $CATALOGUE)|$(cj 'str(d["skus"]["memory-music-video"]["orderable"])' $CATALOGUE)|$(cj 'd["rules"]["memory_video_max_per_order"]' $CATALOGUE)|$(cj 'd["max_per_order"]' $VJ)"
t "planning limits are founder-supplied and pending external verification — never called verified" "45|240|FOUNDER_SUPPLIED_PROVIDER_LIMIT|PENDING_EXTERNAL_VERIFICATION" "$(cj 'd["planning_limits"]["capacity_per_period"]' $VJ)|$(cj 'd["planning_limits"]["max_video_seconds"]' $VJ)|$(cj 'd["planning_limits"]["source"]' $VJ)|$(cj 'd["planning_limits"]["verification"]' $VJ)"
t "the platform: founder selected, account not opened, integration and video capabilities pending" "Mozart AI|FOUNDER_SELECTED|NOT_OPENED|PENDING|PENDING_EXTERNAL_VERIFICATION|MANUAL" "$(cj 'd["platform"]["name"]' $VJ)|$(cj 'd["platform"]["decision"]' $VJ)|$(cj 'd["platform"]["account"]' $VJ)|$(cj 'd["platform"]["integration"]' $VJ)|$(cj 'd["platform"]["video_capabilities"]' $VJ)|$(cj '",".join(d["production_methods"])' $VJ)"
tc "the public feed offers it as optional, never included, with no platform or AI wording" "$(python3 -c 'import json;d=json.load(open("public/catalogue.json"));p=[x for x in d["products"] if x["id"]=="memory-music-video"][0];t=json.dumps(p)+d["ordering_rules"]["memory_music_video"];print(1 if p["variants"][0]["price"]["minor_units"]==4900 and "never pre-selected" in d["ordering_rules"]["memory_music_video"] and not __import__("re").search(r"mozart|\bAI\b|credit|generat",t,__import__("re").I) else 0)')"
tc "no platform call, endpoint, credential or configuration exists" "$(grep -rniE 'curl_init|file_get_contents\(.https?:|fsockopen|api\.mozart|mozart_(api|key|token)' public/api/lib/video.php public/api/crm/video.php public/api/order-video.php public/api/order-video-media.php public/api/video-availability.php public/api/video-offer-event.php | grep -q . && echo 0 || echo 1)$(grep -qi mozart public/api/config.example.php && echo X)"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS mva; DROP DATABASE IF EXISTS mvb; CREATE DATABASE mva; CREATE DATABASE mvb;' 2>/dev/null
ROOTQ mva < db/schema.sql 2>/dev/null
git show e6886a34:db/schema.sql | ROOTQ mvb 2>/dev/null
ROOTQ mvb < db/migrations/2026-09-15-memory-music-video.sql 2>/dev/null; V1=$?
ROOTQ mvb < db/migrations/2026-09-15-memory-music-video.sql 2>/dev/null; V2=$?
ROOTQ mvb < db/migrations/2026-09-16-customer-care.sql 2>/dev/null
ROOTQ mvb < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null
ROOTQ mvb < db/migrations/2026-09-16-supplier-routing.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the video migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$V1" = 0 ] && [ "$V2" = 0 ] && [ "$(dumpdb mva | shasum)" = "$(dumpdb mvb | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE mva; DROP DATABASE mvb;' 2>/dev/null

section "2. OPTIONAL, ONE FILM FOR ONE SONG, PRICED BY THE SERVER"
t "a Moment quote with the video: £15 + £49, the video once" "$((1500+4900))|1" "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1},{"sku":"memory-music-video","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null; jget subtotal_minor)|$(cj 'sum(l["quantity"] for l in d["lines"] if l["sku"]=="memory-music-video")')"
t "two videos in one order are refused at launch" "422|memory_video_ineligible" "$(post_json order-quote '{"lines":[{"sku":"journey-6","quantity":1},{"sku":"memory-music-video","quantity":2}],"shippingCountryCode":"GB"}')|$(jget error)"
t "a video without a song is refused" "422|no_song_experience" "$(post_json order-quote '{"lines":[{"sku":"memory-music-video","quantity":1}],"shippingCountryCode":"GB"}')|$(jget error)"
order '{"sku":"moment","email":"mv-none@example.com"}'
t "an order without the choice has no video (never preselected)" "201|0|0" "$CODE|$(q "SELECT COUNT(*) FROM video_entitlements WHERE order_id=$OID")|$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$OID AND item_id='$VSKU'")"
reset_limits
t "a video line without choosing the song is refused" "422" "$(release_limits; post_json order "$(build_order '{"sku":"moment","email":"mv-bad1@example.com","video_line_only":1}')")"
t "choosing a song without the video line is refused" "422" "$(release_limits; post_json order "$(build_order '{"sku":"moment","email":"mv-bad2@example.com","video_flag_only":[1,1]}')")"
order '{"sku":"journey-6","email":"mv-journey@example.com","video":[1,3]}'; JO=$OID
t "a multi-song order: one video for the chosen song (chapter 3), £49 once" "201|1|3|4900|AWAITING_PAYMENT" "$CODE|$(q "SELECT COUNT(*) FROM video_entitlements WHERE order_id=$JO")|$(q "SELECT m.sequence FROM video_entitlements e JOIN order_memories m ON m.id=e.memory_id WHERE e.order_id=$JO")|$(q "SELECT line_minor FROM order_items WHERE order_id=$JO AND item_id='$VSKU'")|$(q "SELECT status FROM video_entitlements WHERE order_id=$JO")"
t "  → six songs never become six videos" "1" "$(q "SELECT quantity FROM order_items WHERE order_id=$JO AND item_id='$VSKU'")"
reset_limits
avail
t "availability is truthful: limited monthly availability, no invented count while plenty remain" "True|Limited monthly availability.|None" "$(cj 'str(d["available"])' /tmp/va.json)|$(cj 'd["message"]' /tmp/va.json)|$(cj 'str(d["remaining"])' /tmp/va.json)"

section "3. PAYMENT, WEBHOOK REPLAY AND THE PROTECTED AUDIO MASTER"
order '{"sku":"moment","email":"mv-moment@example.com","video":[1,1]}'; MO=$OID; MTOK=$TOK
STRIPE0=$(stub_count)
t "checkout holds one space before payment" "200|HELD|1" "$(session $MO $MTOK)|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE order_id=$MO")"
tc "  → Stripe is sent exactly Moment £15 + Memory Music Video £49 = £64 (server-authoritative, GBP)" "$([ "$(q "SELECT total_minor FROM orders WHERE id=$MO")" = 6400 ] && last_params | python3 -c 'import json,sys;p=json.loads(sys.stdin.read())["params"];li=p["line_items"];a=sorted(int(l["price_data"]["unit_amount"])*int(l["quantity"]) for l in li);print(1 if a==[1500,4900] and all(l["price_data"]["currency"]=="gbp" for l in li) else 0)' | grep -qx 1 && echo 1 || echo 0)"
t "  → a repeated session reuses the same hold" "200|1" "$(session $MO $MTOK)|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE order_id=$MO")"
MSID=$(session_id_for $MO); MTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$MO")
EVT=$(pay_event "evt_mv_$(openssl rand -hex 6)" "$MSID" "$MO" "$MTOTAL" gbp)
t "payment reserves the space, entitles the video and opens the job (input required)" "200|RESERVED|ENTITLED|INPUT_REQUIRED" "$(hook "$EVT")|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$MO")|$(q "SELECT status FROM video_entitlements WHERE order_id=$MO")|$(q "SELECT status FROM video_jobs WHERE order_id=$MO")"
t "  → the paid order retains exactly one video entitlement" "PAID|1|4900" "$(q "SELECT status FROM orders WHERE id=$MO")|$(q "SELECT COUNT(*) FROM video_entitlements WHERE order_id=$MO AND status='ENTITLED'")|$(q "SELECT price_minor FROM video_entitlements WHERE order_id=$MO")"
t "a replayed webhook reserves nothing twice" "200|1|1|1" "$(hook "$EVT")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM video_jobs WHERE order_id=$MO")|$(evcount $MO VIDEO.ENTITLED)"
MREF=$(ref_of $MO); MJOB=$(job_of $MO)
act $MO ISSUE_STATUS_LINK >/dev/null; MLINK=$(link_token status)
mkmp4 $TMPV/wide.jpg 1 1 1 >/dev/null; cp $FIX/photo-3000x2000.jpg $TMPV/landscape.jpg
t "video photographs need the customer's confirmation of their right to provide them" "422" "$(vmedia $MLINK $MJOB -F "photo=@$TMPV/landscape.jpg;type=image/jpeg")"
t "  → a landscape photograph is welcome (not the square artwork rule)" "201|1" "$(vmedia $MLINK $MJOB -F rightsConfirmed=yes -F "photo=@$TMPV/landscape.jpg;type=image/jpeg")|$(jget photographs)"
t "  → a tiny photograph is refused; a non-image is refused" "422|415" "$(vmedia $MLINK $MJOB -F rightsConfirmed=yes -F "photo=@$FIX/photo-8x8.jpg;type=image/jpeg")|$(vmedia $MLINK $MJOB -F rightsConfirmed=yes -F "photo=@$FIX/audio-1s.wav;type=image/jpeg")"
t "  → private production permission is not marketing permission" "0|64" "$(q "SELECT COUNT(*) FROM customer_content_permissions WHERE order_id=$MO")|$(q "SELECT LENGTH(rights_statement_sha256) FROM video_media WHERE order_id=$MO LIMIT 1")"
t "the customer finishes adding photographs: ready, waiting for the song" "200|READY|AUDIO_MASTER" "$(post_json order-video-media "$(tokjob $MLINK $MJOB '{"action":"PHOTOGRAPHS_DONE"}')")|$(jstat $MJOB)|$(q "SELECT waiting_on FROM video_jobs WHERE id=$MJOB")"
song_to_master $MO $MREF
AMID=$(q "SELECT current_master_id FROM creative_jobs WHERE order_id=$MO"); ASTORED=$(q "SELECT stored_name FROM creative_masters WHERE id=$AMID")
AHASH_ROW=$(q "SELECT CONCAT_WS('|',sha256,byte_size,duration_ms,version,is_current) FROM creative_masters WHERE id=$AMID")
AHASH_FILE=$(docker exec mcb-api sh -c "sha256sum \$(find / -name $ASTORED -type f 2>/dev/null | head -1)" | cut -d' ' -f1)
t "a 195-second song is eligible; the job records the master's id, version and hash (lineage)" "PRODUCTION_REQUIRED|VIDEO_DURATION_ELIGIBLE|$AMID|$(q "SELECT sha256 FROM creative_masters WHERE id=$AMID")" "$(jstat $MJOB)|$(q "SELECT duration_status FROM video_jobs WHERE id=$MJOB")|$(q "SELECT audio_master_id FROM video_jobs WHERE id=$MJOB")|$(q "SELECT audio_master_sha256 FROM video_jobs WHERE id=$MJOB")"
vget "order_id=$MO" >/dev/null
tc "staff inputs: song, protected audio reference, photographs, memory — and no email, phone, address or payment" "$(cj 'str(d["jobs"][0]["inputs"]["audio_master"]["access"]=="READ_ONLY_REFERENCE" and d["jobs"][0]["inputs"]["song_title"] is not None and len(d["jobs"][0]["inputs"]["photographs"])==1)' | grep -q True && ! python3 -c 'import json;i=json.load(open("/tmp/tx.json"))["jobs"][0]["inputs"];x=i.pop("excluded");print(json.dumps(i) if "email" in x and "payment" in x else "missing-exclusions supplier")' | grep -qiE 'mv-moment@|447000000456|stripe|cs_test|pi_|Harbour Row|supplier|cost_minor' && echo 1 || echo 0)"
t "  → the inputs view needs the CRM key and is audited" "401|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/video?order_id=$MO&$STAFFQ")|$(q "SELECT COUNT(*) FROM video_access_log WHERE order_id=$MO AND action='VIEW_VIDEO_JOBS'" | awk '{print ($1>=1)?1:0}')"
t "the audio reference downloads for production (audited)" "200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/video?download=audio&id=$AMID&$STAFFQ" -H "Authorization: Bearer $CRMKEY")|$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$MO AND action='VIDEO_PRODUCTION_REFERENCE'")"

section "4. MANUAL PRODUCTION, VIDEO QC AND THE IMMUTABLE VIDEO MASTER"
t "a video cannot be registered before production starts" "409|invalid_transition" "$(mkmp4 $TMPV/v1.mp4 195 1920 1080; cand $MO $MREF $MJOB $TMPV/v1.mp4)|$(jget error)"
t "production starts (manual, by a person)" "200|PRODUCTION_IN_PROGRESS|MANUAL" "$(vpost "$(vact $MO $MJOB START_PRODUCTION)")|$(jstat $MJOB)|$(q "SELECT production_method FROM video_jobs WHERE id=$MJOB")"
t "a video registered against another order's reference is refused" "404|video_job_not_found" "$(cand $MO $(ref_of $JO) $MJOB $TMPV/v1.mp4)|$(jget error)"
t "a file that is not a video is refused" "422|video_unreadable" "$(cand $MO $MREF $MJOB $FIX/audio-195s.flac)|$(jget error)"
t "the finished film is registered: version 1, whole song, picture size read, needs quality check" "200|1|PASS|PASS|QUALITY_CHECK_REQUIRED" "$(cand $MO $MREF $MJOB $TMPV/v1.mp4 -F external_reference=manual-001)|$(jget version)|$(jget checks.COVERS_WHOLE_SONG)|$(jget checks.PICTURE_SIZE_READABLE)|$(jstat $MJOB)"
C1=$(q "SELECT id FROM video_candidates WHERE video_job_id=$MJOB AND version=1")
ov
t "Command Centre: a video quality check card; Videos summary counts it" "1|1" "$(ovj 'sum(1 for a in d["attention"] if a["title"]=="Video quality check required")')|$(ovj 'd["videos"]["needs_quality_check"]')"
t "  → the quality view shows the video with fourteen plain questions" "200|1|14|195|1920 × 1080" "$(cc "view=quality&order_id=$MO")|$(cj 'len(d["videos"])')|$(cj 'len(d["video_questions"])')|$(cj 'd["videos"][0]["video_seconds"]')|$(cj 'd["videos"][0]["picture"]')"
t "a video with a 'no' cannot pass" "422|video_qc_concern" "$(ccpost "$(vqc $MO $C1 "$VQ_NO" PASS)")|$(jget error)"
MAIL0=$(mail_count); COMMS0=$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")
t "send back for internal rework: rework required, the customer is not contacted" "200|REWORK_REQUIRED|1|$MAIL0|$COMMS0" "$(ccpost "$(vqc $MO $C1 "$VQ_NO" REWORK)")|$(jstat $MJOB)|$(q "SELECT rework_count FROM video_jobs WHERE id=$MJOB")|$(mail_count)|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")"
vpost "$(vact $MO $MJOB START_PRODUCTION)" >/dev/null
mkmp4 $TMPV/v2.mp4 196 1920 1080
cand $MO $MREF $MJOB $TMPV/v2.mp4 >/dev/null; C2=$(q "SELECT id FROM video_candidates WHERE video_job_id=$MJOB AND version=2")
C2SHA=$(shasum -a 256 $TMPV/v2.mp4 | cut -d' ' -f1)
t "the reworked film passes: Video Master v1 from candidate v2, lineage to the audio master, space completed" "200|READY_FOR_REVEAL|1|$C2|$AMID|$C2SHA|COMPLETED" "$(ccpost "$(vqc $MO $C2 "$VQ_YES" PASS)")|$(jstat $MJOB)|$(q "SELECT version FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT candidate_id FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT audio_master_id FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT sha256 FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$MO")"
t "  → QC evidence and who decided are recorded" "PASS|Founder Tester|CANDIDATE_FILE_UNCHANGED" "$(q "SELECT JSON_VALUE(qc_evidence,'$.qc.outcome') FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT JSON_VALUE(qc_evidence,'$.qc.by') FROM video_masters WHERE video_job_id=$MJOB")|$(q "SELECT JSON_VALUE(qc_evidence,'$.provenance') FROM video_masters WHERE video_job_id=$MJOB")"
t "the MCB Production Master is untouched: row and file hash unchanged" "$AHASH_ROW|$AHASH_FILE" "$(q "SELECT CONCAT_WS('|',sha256,byte_size,duration_ms,version,is_current) FROM creative_masters WHERE id=$AMID")|$(docker exec mcb-api sh -c "sha256sum \$(find / -name $ASTORED -type f 2>/dev/null | head -1)" | cut -d' ' -f1)"
tc "  → no code writes, trims or re-encodes the audio master" "$(grep -niE 'UPDATE creative_masters|ffmpeg|sox |lame |shell_exec|proc_open|exec\(' public/api/lib/video.php public/api/crm/video.php | grep -q . && echo 0 || echo 1)"
t "checking an already-checked video again is refused (masters never silently change)" "409" "$(ccpost "$(vqc $MO $C2 "$VQ_YES" PASS)")"

section "5. PRIVATE CUSTOMER DELIVERY"
t "before the reveal, the customer sees 'being made' and cannot get the file" "BEING_MADE|404|video_not_ready" "$(post_json order-progress "$(tokonly $MLINK)" >/dev/null; jget videos.0.status)|$(post_json order-video "$(tokjob $MLINK $MJOB)")|$(jget error)"
t "the reveal: REVEALED and one VIDEO_READY email" "200|REVEALED|1" "$(vpost "$(vact $MO $MJOB REVEAL_VIDEO '{"send_email":true}')")|$(jstat $MJOB)|$(sent_count $MO VIDEO_READY)"
t "  → revealing again changes nothing and sends nothing" "409|1" "$(vpost "$(vact $MO $MJOB REVEAL_VIDEO '{"send_email":true}')")|$(sent_count $MO VIDEO_READY)"
t "the order page shows the film as ready" "READY" "$(post_json order-progress "$(tokonly $MLINK)" >/dev/null; jget videos.0.status)"
post_json order-video "$(tokjob $MLINK $MJOB)" >/dev/null; VURL=$(jget url)
tc "  → a short-lived signed link, never a permanent file path" "$(printf '%s' "$VURL" | grep -qE '^/api/order-video\?o=[0-9]+&m=[0-9]+&e=[0-9]+&d=0&s=[a-f0-9]{64}$' && ! printf '%s' "$VURL" | grep -q "$MLINK" && echo 1 || echo 0)"
t "the film plays privately (video/mp4, the master's exact bytes, no-store)" "200|video/mp4|$C2SHA|1" "$(curl -s -o $TMPV/got.mp4 -D $TMPV/h.txt -w '%{http_code}' "http://localhost:8080$VURL")|$(awk -F': ' 'tolower($1)=="content-type"{print $2}' $TMPV/h.txt | tr -d '\r')|$(shasum -a 256 $TMPV/got.mp4 | cut -d' ' -f1)|$(awk -F': ' 'tolower($1)=="cache-control"{print $2}' $TMPV/h.txt | grep -c no-store | awk '{print ($1>=1)?1:0}')"
t "  → seeking works (Range → 206)" "206|bytes 0-99/" "$(curl -s -o /dev/null -D $TMPV/r.txt -w '%{http_code}' -H 'Range: bytes=0-99' "http://localhost:8080$VURL")|$(awk -F': ' 'tolower($1)=="content-range"{print $2}' $TMPV/r.txt | tr -d '\r' | sed 's/[0-9]*$//')"
t "  → a tampered or expired link is refused" "403|403" "$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080$(printf '%s' "$VURL" | sed 's/&s=./\&s=0/')")|$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080$(printf '%s' "$VURL" | sed -E 's/e=[0-9]+/e=1000000000/')")"
t "  → a download link, and access is recorded (view, download, version)" "attachment|1" "$(post_json order-video "$(tokjob $MLINK $MJOB '{"download":true}')" >/dev/null; curl -s -o /dev/null -D $TMPV/d.txt "http://localhost:8080$(jget url)"; awk -F': ' 'tolower($1)=="content-disposition"{print $2}' $TMPV/d.txt | cut -d';' -f1)|$(q "SELECT COUNT(DISTINCT action) >= 2 AND MIN(version)=1 FROM video_access_log WHERE order_id=$MO AND actor='CUSTOMER'")"
act $JO ISSUE_STATUS_LINK >/dev/null 2>&1
paid_order '{"sku":"moment","email":"mv-other@example.com"}'; OO=$OID
act $OO ISSUE_STATUS_LINK >/dev/null; OLINK=$(link_token status)
t "another customer's link cannot reach this video" "404" "$(post_json order-video "$(tokjob $OLINK $MJOB)")"
t "  → nor add photographs to it" "404" "$(vmedia $OLINK $MJOB -F rightsConfirmed=yes -F "photo=@$TMPV/landscape.jpg;type=image/jpeg")"

section "6. DURATION POLICY: 240 SECONDS ELIGIBLE, LONGER REVIEWED, NEVER EDITED"
reset_limits
paid_order '{"sku":"moment","email":"mv-240@example.com","video":[1,1]}'; D4=$OID; D4REF=$(ref_of $D4); D4JOB=$(job_of $D4)
vpost "$(vact $D4 $D4JOB CONFIRM_INPUTS)" >/dev/null
song_to_master $D4 $D4REF audio-240s.flac
t "a 240-second song is eligible" "PRODUCTION_REQUIRED|VIDEO_DURATION_ELIGIBLE|240000" "$(jstat $D4JOB)|$(q "SELECT duration_status FROM video_jobs WHERE id=$D4JOB")|$(q "SELECT audio_duration_ms FROM video_jobs WHERE id=$D4JOB")"
reset_limits
paid_order '{"sku":"moment","email":"mv-300@example.com","video":[1,1]}'; D5=$OID; D5REF=$(ref_of $D5); D5JOB=$(job_of $D5)
song_to_master $D5 $D5REF
D5M=$(q "SELECT current_master_id FROM creative_jobs WHERE order_id=$D5")
# A master recorded at 300 seconds (the MCB maximum), simulated in its metadata.
q "UPDATE creative_masters SET duration_ms=300000 WHERE id=$D5M" >/dev/null
D5ROW=$(q "SELECT CONCAT_WS('|',sha256,byte_size,duration_ms,version) FROM creative_masters WHERE id=$D5M")
vpost "$(vact $D5 $D5JOB CONFIRM_INPUTS)" >/dev/null
t "a song over 240 seconds waits for platform verification — no production, no promise, no editing" "READY|VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED|PROVIDER_VERIFICATION|1" "$(jstat $D5JOB)|$(q "SELECT duration_status FROM video_jobs WHERE id=$D5JOB")|$(q "SELECT waiting_on FROM video_jobs WHERE id=$D5JOB")|$(evcount $D5 VIDEO.DURATION_PROVIDER_VERIFICATION_REQUIRED)"
t "  → the Command Centre shows the length needs platform verification" "1" "$(ov; ovj 'sum(1 for a in d["attention"] if a["title"]=="Video length needs platform verification" and a["order"]["order_id"]=='"$D5"')')"
t "staff cannot choose a film for the full song while the 4-minute limit is unverified; nothing changes" "409|provider_verification_required|READY|NULL|$D5ROW" "$(vpost "$(vact $D5 $D5JOB DURATION_REVIEW '{"decision":"PROCEED_FULL_SONG"}')")|$(jget error)|$(jstat $D5JOB)|$(q "SELECT IFNULL(duration_decision,'NULL') FROM video_jobs WHERE id=$D5JOB")|$(q "SELECT CONCAT_WS('|',sha256,byte_size,duration_ms,version) FROM creative_masters WHERE id=$D5M")"
t "  → the only choice is to escalate to the Founders; the 300-second master is untouched" "200|EXCEPTION|ESCALATE_TO_FOUNDERS|SONG_LONGER_THAN_PLANNING_MAXIMUM|$D5ROW" "$(vpost "$(vact $D5 $D5JOB DURATION_REVIEW '{"decision":"ESCALATE_TO_FOUNDERS"}')")|$(jstat $D5JOB)|$(q "SELECT duration_decision FROM video_jobs WHERE id=$D5JOB")|$(q "SELECT exception_reason FROM video_jobs WHERE id=$D5JOB")|$(q "SELECT CONCAT_WS('|',sha256,byte_size,duration_ms,version) FROM creative_masters WHERE id=$D5M")"
tc "  → no full-song, shortening, speeding up or fading option exists" "$(cj '",".join(d["duration_decisions"])' $VJ | grep -qx 'ESCALATE_TO_FOUNDERS' && echo 1 || echo 0)"

section "7. CANCELLATION BEFORE PRODUCTION RELEASES THE SPACE; PRODUCED CAPACITY IS NEVER RECYCLED"
reset_limits
paid_order '{"sku":"moment","email":"mv-cancel@example.com","video":[1,1]}'; XO=$OID; XJOB=$(job_of $XO)
t "releasing needs a reason" "422|release_reason_required" "$(vpost "$(vact $XO $XJOB RELEASE_CAPACITY)")|$(jget error)"
t "released before production: space RELEASED, entitlement CANCELLED, audited, no refund" "200|RELEASED|CANCELLED|1|PAID" "$(vpost "$(vact $XO $XJOB RELEASE_CAPACITY '{"note":"Customer cancelled the video before production"}')")|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$XO")|$(q "SELECT status FROM video_entitlements WHERE order_id=$XO")|$(evcount $XO VIDEO.CAPACITY_RELEASED)|$(q "SELECT status FROM orders WHERE id=$XO")"
t "a video in production (or made) cannot release its space" "409|capacity_consumed" "$(vpost "$(vact $D4 $D4JOB START_PRODUCTION)" >/dev/null; vpost "$(vact $D4 $D4JOB RELEASE_CAPACITY '{"note":"try"}')")|$(jget error)"

section "8. CAPACITY: SLOT 45 ACCEPTED, SLOT 46 REFUSED, CONCURRENCY, HOLDS"
PERIOD=$(q "SELECT id FROM video_capacity_periods ORDER BY id DESC LIMIT 1")
USED=$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIOD AND (status IN ('RESERVED','COMPLETED') OR (status='HELD' AND held_until>UTC_TIMESTAMP()))")
t "capacity for this period is the planning figure, pending verification" "200|45|PENDING_EXTERNAL_VERIFICATION|FOUNDER_SUPPLIED_PROVIDER_LIMIT" "$(vget view=capacity)|$(jget capacity.capacity)|$(jget capacity.verification)|$(jget capacity.source)"
# Other customers' reserved videos, recorded directly, to bring the period to 43 of 45 (two spaces left).
for n in $(seq $((USED+1)) 43); do q "INSERT INTO video_capacity_reservations (period_id, entitlement_id, order_id, status, reserved_at) VALUES ($PERIOD, $((900000+n)), $MO, 'RESERVED', UTC_TIMESTAMP())" >/dev/null; done
avail
t "two spaces left: the real count is shown" "True|2 video spaces remaining this month.|2" "$(cj 'str(d["available"])' /tmp/va.json)|$(cj 'd["message"]' /tmp/va.json)|$(cj 'd["remaining"]' /tmp/va.json)"
reset_limits
order '{"sku":"moment","email":"mv-44@example.com","video":[1,1]}'; S44=$OID; S44T=$TOK
order '{"sku":"moment","email":"mv-45@example.com","video":[1,1]}'; S45=$OID; S45T=$TOK
order '{"sku":"moment","email":"mv-46a@example.com","video":[1,1]}'; S46A=$OID; S46AT=$TOK
order '{"sku":"moment","email":"mv-46b@example.com","video":[1,1]}'; S46B=$OID; S46BT=$TOK
t "slot 44 is held" "200" "$(session $S44 $S44T)"
STRIPE1=$(stub_count)
# Three customers reach checkout for the last space at the same moment.
release_limits
for pair in "$S45:$S45T" "$S46A:$S46AT" "$S46B:$S46BT"; do
  o=${pair%%:*}; k=${pair##*:}
  curl -s -o $TMPV/race-$o.json -w '%{http_code}\n' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -H "Idempotency-Key: $(idem)" -d "{\"orderId\":$o,\"checkoutToken\":\"$k\"}" > $TMPV/race-$o.code &
done
wait
WINNERS=$(cat $TMPV/race-*.code | grep -c '^200$'); LOSERS=$(cat $TMPV/race-*.code | grep -c '^409$')
t "concurrency: exactly one of three gets the 45th space; the others are refused (fully booked)" "1|2|45" "$WINNERS|$LOSERS|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIOD AND (status IN ('RESERVED','COMPLETED') OR (status='HELD' AND held_until>UTC_TIMESTAMP()))")"
tc "  → no Stripe session was created for a refused video" "$([ "$(stub_count)" -le "$((STRIPE1+1))" ] && grep -h video_capacity_full $TMPV/race-*.json | grep -q 'fully booked' && echo 1 || echo 0)"
avail
t "fully booked is shown truthfully and a new video order is refused" "False|Memory Music Video is fully booked for this production month.|409|video_capacity_full" "$(cj 'str(d["available"])' /tmp/va.json)|$(cj 'd["message"]' /tmp/va.json)|$(release_limits; post_json order "$(build_order '{"sku":"moment","email":"mv-47@example.com","video":[1,1]}')")|$(jget error)"
ov
t "Command Centre: capacity full card, labelled pending platform verification" "VIDEO_CAPACITY_FULL|0|PENDING MOZART VERIFICATION|45" "$(ovj '[a["kind"] for a in d["attention"] if a["kind"].startswith("VIDEO_CAPACITY")][0]')|$(ovj 'd["videos"]["capacity"]["remaining"]')|$(ovj 'd["videos"]["capacity"]["label"]')|$(ovj 'd["videos"]["capacity"]["planned"]')"
# The winner's hold lapses (abandoned checkout); a loser can now take the space.
WIN=$(for o in $S45 $S46A $S46B; do [ "$(cat $TMPV/race-$o.code)" = 200 ] && echo $o; done | head -1)
q "UPDATE video_capacity_reservations SET held_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_id=$WIN" >/dev/null
LOSE=$(for o in $S46A $S46B $S45; do [ "$o" != "$WIN" ] && echo $o; done | head -1)
LOSET=$(q "SELECT 1" >/dev/null; [ "$LOSE" = "$S46A" ] && echo $S46AT || { [ "$LOSE" = "$S46B" ] && echo $S46BT || echo $S45T; })
t "an abandoned hold expires and the space is offered again (once)" "200|EXPIRED|HELD" "$(session $LOSE $LOSET)|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$WIN")|$(q "SELECT status FROM video_capacity_reservations WHERE order_id=$LOSE")"
WSID=$(session_id_for $WIN); WTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$WIN")
t "a payment that arrives after its hold was taken does not oversell: capacity exception for the Founders, order kept" "200|PAID|CAPACITY_EXCEPTION|45|1" "$(hook "$(pay_event "evt_mv_late_$(openssl rand -hex 4)" "$WSID" "$WIN" "$WTOTAL" gbp)")|$(q "SELECT status FROM orders WHERE id=$WIN")|$(q "SELECT status FROM video_entitlements WHERE order_id=$WIN")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIOD AND (status IN ('RESERVED','COMPLETED') OR (status='HELD' AND held_until>UTC_TIMESTAMP()))")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$WIN AND notification_type='VIDEO_EXCEPTION'")"
t "  → no refund: no Stripe refund request exists" "0" "$(docker exec mcb-api sh -c 'grep -c refunds /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"
t "  → the Command Centre shows the paid video without a space" "1" "$(ov; ovj 'sum(1 for a in d["attention"] if a["title"]=="Video paid without a production space")')"
t "capacity cannot be set below the spaces already in use" "409|capacity_below_use" "$(vpost "$(js '{"action":"SET_PERIOD_CAPACITY","period_key":"'"$(q "SELECT period_key FROM video_capacity_periods WHERE id=$PERIOD")"'","capacity":10,"staff":"Founder Tester"}')")|$(jget error)"
t "a future period can be defined without moving any reservation" "200|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIOD")" "$(vpost "$(js '{"action":"DEFINE_PERIOD","period_key":"2099-01","starts_at":"2099-01-01 00:00:00","ends_at":"2099-02-01 00:00:00","capacity":45,"staff":"Founder Tester"}')")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIOD")"

section "9. METRICS, READINESS AND PRIVACY"
t "offer events are counted without personal data; unknown events refused" "202|202|422" "$(post_json video-offer-event '{"event":"OFFER_VIEWED","productId":"moment"}')|$(post_json video-offer-event '{"event":"SELECTED","productId":"moment"}')|$(post_json video-offer-event '{"event":"STORY_TEXT","productId":"moment"}')"
t "internal metrics: impressions, purchases, revenue at £49, rework and QC failure rates; cost unknown is not zero" "200|1|4900|None" "$(vget view=metrics)|$(jget metrics.offer_impressions)|$(jget metrics.average_selling_price_minor)|$(cj 'str(d["metrics"]["contribution_minor_where_cost_known"])')"
t "  → metrics and capacity need the CRM key" "401|401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/video?view=metrics&$STAFFQ")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/command-centre?view=videos&$STAFFQ")"
t "readiness: video capacity needs external verification" "NEEDS_EXTERNAL_VERIFICATION" "$(cc view=readiness >/dev/null; cj '[r["status"] for r in d["readiness"] if r["key"]=="video_capacity"][0]')"
tc "customer-facing copy never says AI, credits, generation or the platform" "$(grep -hoiE '\bAI video\b|\bcredits?\b|\bgenerat[a-z]*|mozart' src/pages/create/VideoOffer.tsx src/pages/order/VideoSection.tsx public/api/order-video.php public/api/order-video-media.php public/api/video-availability.php | grep -q . && echo 0 || echo 1)"
tc "video files are stored privately (outside the web root) with random names" "$([ ! -d public/api/storage/video ] && [ "$(q "SELECT COUNT(*) FROM video_masters WHERE stored_name NOT REGEXP '^[a-f0-9]{64}$'")" = 0 ] && echo 1 || echo 0)"
rm -rf "$TMPV"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
