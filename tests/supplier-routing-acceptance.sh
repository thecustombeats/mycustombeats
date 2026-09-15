#!/bin/bash
# MCB™ SUPPLIER INTELLIGENCE & COMMERCIAL ROUTING (16 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# DECISION SUPPORT, NOT PROCUREMENT: nothing is purchased, paid, refunded or
# repriced. Every route, partner and cost below is SYNTHETIC test data (the
# real routes live only in the server's uploaded supplier-routes.json and are
# never committed). Payments are TEST; Stripe and Resend are local stubs.
#
# Covers: the 33-SKU physical registry (cards FOUNDER DATA REQUIRED); vinyl
# prices and songs; exact artwork specifications and unknown manufacturing
# values; route model v2 and verification (VERIFIED needs source + date,
# issues hold verification, suspended, unavailable, configurable staleness);
# the routing engine by customer destination (groups, recommendation for
# review with reasons, costs by component, shipping/destination certainty,
# fallback, determinism); frames, gramophones (manual, delivered cost before
# purchase) and the plaque (manual, never a country-only message); new-sale
# commercial safety and the customer quote; route decisions (never an
# authorisation); actual cost with tax/duty, variance; card alternatives; split
# partner orders; research and manufacturing data lists; scorecards with sample
# sizes; the Command Centre Suppliers view and the Business tab; founder
# decisions (Europe/London, actual-first fees, £49 video, no thresholds); and
# that no money moves.
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


# ---- Supplier routing helpers ----------------------------------------------
SUP="crm/suppliers"
SUPQ="staff=Routing%20Tester"
sup() { crm "$SUP?$1&$SUPQ" >/dev/null; cp /tmp/tx.json "/tmp/sup-$2.json"; }
sj() { cj "$2" "/tmp/sup-$1.json"; }
look() { sup "view=lookup&sku=$1&country=$2" "$3"; }
# decide REF SKU ROUTE [PYTHON_DICT_EXPR extra] → code (/tmp/tx.json)
decide() { local spec="${4:-}" extra; [ -z "$spec" ] && spec='{}'; extra=$(js "$spec"); crmpost "$SUP" "$(python3 -c 'import json,sys;d=json.loads(sys.argv[4]);d.update({"action":"RECORD_ROUTE_DECISION","staff":"Routing Tester","order_reference":sys.argv[1],"sku":sys.argv[2],"route_id":sys.argv[3]});print(json.dumps(d))' "$1" "$2" "$3" "$extra")"; }
day() { python3 -c 'import datetime,sys;print((datetime.datetime.now(datetime.timezone.utc).date()+datetime.timedelta(days=int(sys.argv[1]))).isoformat())' "$1"; }
quote() { post_json order-quote "$(SKU_=$1 CC_=$2 js '{"lines":[{"sku":E["SKU_"],"quantity":1}],"shippingCountryCode":E["CC_"]}')" >/dev/null; cp /tmp/tx.json /tmp/quote.json; }
SJ=public/api/data/suppliers.json
CAT_BACKUP=$(mktemp)
cp "$CATALOGUE" "$CAT_BACKUP"
trap 'restore_config; cp "$CAT_BACKUP" "$CATALOGUE"; rm -f "$CAT_BACKUP" public/api/_test-config-base.php "$ROUTES" "$RATES"' EXIT
RECENT=$(day -6); OLDER=$(day -15); OLD=$(day -200); FUTURE=$(day 10)

# SYNTHETIC routes: invented partners, links and amounts for testing only.
ROUTES_V2=$(RECENT=$RECENT OLDER=$OLDER OLD=$OLD FUTURE=$FUTURE python3 - <<'PY'
import json, os
E = os.environ
def route(rid, skus, **kw):
    r = {"route_id": rid, "skus": skus, "supplier": f"TEST PARTNER {rid} (synthetic)", "product_url": f"https://partner.example/{rid.lower()}",
         "currency": "GBP", "tracking_capability": "FULL", "production_estimate": "10 working days (test)", "delivery_estimate": "3 to 5 working days (test)"}
    r.update(kw); return r
routes = [
  route("R-PIC-DIRECT", ["keepsake-12-picture-disc"], route_type="DIRECT_MANUFACTURER", supplier_product_reference="PIC-12-TEST",
        destinations={"supported": ["GB"], "check_required": ["DE"], "unsupported": ["US"]}, shipping_model="DESTINATION_CALCULATED",
        expected_purchase_cost_minor=3100, internal_allowance={"expected_supplier_shipping_minor": 700, "shipping_contingency_minor": 100, "mcb_fulfilment_handling_allowance_minor": 200},
        verification_state="VERIFIED", source="synthetic evidence: partner price page (test)", last_verified_date=E["RECENT"], availability="AVAILABLE", availability_checked_date=E["RECENT"],
        destination_evidence={"GB": {"shipping_rule": "Tracked courier, calculated at partner checkout (test)", "tracking": "Tracked (test)", "customs_duties": "None within GB (test)", "delivery_estimate": "3 to 5 working days (test)", "restrictions": "None recorded (test)", "source": "synthetic partner shipping page", "checked_date": E["RECENT"]}},
        fallback_authorised=True, fallback_route_id="R-PIC-MARKET", last_reviewed_date=E["RECENT"], risk_notes=["Test risk note: long production in December"]),
  route("R-PIC-MARKET", ["keepsake-12-picture-disc"], route_type="MARKETPLACE",
        destinations={"supported": ["GB"], "check_required": [], "unsupported": ["US"]}, shipping_model="MARKETPLACE_LISTING_DEPENDENT",
        expected_purchase_cost_minor=2900, internal_allowance={"expected_supplier_shipping_minor": 900},
        verification_state="PARTIALLY_VERIFIED", source="synthetic listing capture (test)", last_verified_date=E["OLDER"], availability="AVAILABLE", tracking_capability="PARTIAL"),
  route("R-10-NOSOURCE", ["keepsake-10-picture-disc"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=2600, internal_allowance={"expected_supplier_shipping_minor": 700}, verification_state="VERIFIED", last_verified_date=E["RECENT"]),
  route("R-10-SUSPENDED", ["keepsake-10-picture-disc"], route_type="DIRECT_MANUFACTURER", active=False, destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=2000, internal_allowance={"expected_supplier_shipping_minor": 500}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-10-UNAVAILABLE", ["keepsake-10-picture-disc"], route_type="MARKETPLACE", availability="UNAVAILABLE", availability_checked_date=E["RECENT"], destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=1900, internal_allowance={"expected_supplier_shipping_minor": 500}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-10-FUTURE", ["keepsake-10-picture-disc"], route_type="DIRECT_RETAILER", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", verification_state="VERIFIED", source="synthetic", last_verified_date=E["FUTURE"]),
  route("R-10-UNSUP-NOEVIDENCE", ["keepsake-10-picture-disc"], route_type="MARKETPLACE", verification_state="UNSUPPORTED", destinations={"supported": [], "check_required": [], "unsupported": []}),
  route("R-7-STALE-MARKET", ["keepsake-7-picture-disc"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=2000, internal_allowance={"expected_supplier_shipping_minor": 800},
        verification_state="VERIFIED", source="synthetic listing capture (test)", last_verified_date=E["OLD"], availability="AVAILABLE"),
  route("R-HEART", ["keepsake-10-heart-picture-disc"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=2200, internal_allowance={"expected_supplier_shipping_minor": 700}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-GATEFOLD", ["journey-12"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=36000, internal_allowance={"expected_supplier_shipping_minor": 2000}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-FRAME-DIRECT", ["lyrics-frame-10x15"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=1500, internal_allowance={"expected_supplier_shipping_minor": 800}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-FRAME-MARKET-A", ["lyrics-frame-10x15"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=1200, internal_allowance={"expected_supplier_shipping_minor": 1000}),
  route("R-FRAME-MARKET-B", ["lyrics-frame-10x15"], route_type="MARKETPLACE", destinations={"supported": ["GB", "CA"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=1100, internal_allowance={"expected_supplier_shipping_minor": 1000},
        verification_state="VERIFIED", source="synthetic listing capture (test)", last_verified_date=E["RECENT"], known_issues=["GEOGRAPHIC_INCONSISTENCY"], risk_notes=["Listing has shown different ship-from countries (test)"]),
  route("R-FR14-MARKET", ["lyrics-frame-14x21"], route_type="MARKETPLACE", shipping_model="MARKETPLACE_LISTING_DEPENDENT"),
  route("R-FR14-DIRECT", ["lyrics-frame-14x21"], route_type="DIRECT_MANUFACTURER", shipping_model="DESTINATION_CALCULATED"),
  route("R-GRAMO-HV", ["antique-brass-gramophone"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=50000, internal_allowance={"expected_supplier_shipping_minor": 2000}, verification_state="PARTIALLY_VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-GRAMO-V", ["vintage-smartphone-gramophone"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []},
        shipping_model="MARKETPLACE_LISTING_DEPENDENT", expected_purchase_cost_minor=5000, internal_allowance={"expected_supplier_shipping_minor": 1000}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
  route("R-PLAQUE", ["personalised-music-plaque"], route_type="DIRECT_RETAILER", destinations={"supported": ["IN"], "check_required": [], "unsupported": []},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=1200, internal_allowance={"expected_supplier_shipping_minor": 800}, verification_state="VERIFIED", source="synthetic", last_verified_date=E["RECENT"]),
]
print(json.dumps({"routes": routes}))
PY
)

stub_reset
reset_limits

section "1. THE PHYSICAL REGISTRY, PRICES, SPECIFICATIONS AND THE MIGRATION"
t "the supplier policy is not served over HTTP; the Suppliers API needs the CRM key and a staff name" "403|401|422" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/suppliers.json")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$SUP?view=overview&$SUPQ")|$(crm "$SUP?view=overview")"
t "33 physical supplier-linked SKUs: vinyl 6, frames 5, pop-up cards 18, gramophones 3, plaque 1" "33|VINYL:6,FRAME:5,CARD:18,GRAMOPHONE:3,PLAQUE:1" "$(cj 'd["expected_physical_skus"]' $SJ)|$(cj '",".join(f["family"]+":"+str(f["expected"]) for f in d["families"])' $SJ)"
t "  → every catalogue physical SKU is mapped (15); the 18 cards are FOUNDER DATA REQUIRED, not invented" "15|True|0|0" "$(cj 'len(d["registry"])' $SJ)|$(python3 -c 'import json;c=json.load(open("'"$CATALOGUE"'"))["skus"];s=json.load(open("'"$SJ"'"));print({k for k,v in c.items() if v["fulfilment"]=="PHYSICAL"}=={e["sku"] for e in s["registry"]})')|$(cj 'len(d["card_listings"])' $SJ)|$(cj '[f["mapped"] for f in d["families"] if f["family"]=="CARD"][0]' $SJ)"
t "vinyl selling data: Gatefold 12/£349, 12\" 6/£199, 12\" picture 4/£149.99, 10\" 3/£139.99, Heart 1/£129.99, 7\" 1/£99" "journey-12:12:34900,journey-6:6:19900,keepsake-12-picture-disc:4:14999,keepsake-10-picture-disc:3:13999,keepsake-10-heart-picture-disc:1:12999,keepsake-7-picture-disc:1:9900" "$(cj '",".join(e["sku"]+":"+str(e["songs"])+":"+str(e["price_minor"]) for e in d["registry"] if e["family"]=="VINYL")' $SJ)"
t "  → the catalogue agrees, and the stale values are gone (12\" £129.99, 10\" £119.99, Heart 2 songs, 7\" £79.99)" "14999|13999|1|12999|9900" "$(price keepsake-12-picture-disc)|$(price keepsake-10-picture-disc)|$(cj 'd["skus"]["keepsake-10-heart-picture-disc"]["song_count"]' $CATALOGUE)|$(price keepsake-10-heart-picture-disc)|$(price keepsake-7-picture-disc)"
t "pop-up card price points: singles £49.99, Large Anniversary £69.99, Birthday Auto-Play £19.99, 4-packs £79.99, 8-pack £129.99" "4999,6999,1999,7999,12999" "$(cj '",".join(str(p["price_minor"]) for p in d["card_price_points"])' $SJ)"
tc "no Prodigi or Kunaki anywhere in the policy, catalogue or public feed; no route data file is committed" "$(! grep -qiE 'prodigi|kunaki' $SJ $CATALOGUE public/catalogue.json && ! git ls-files public/api/data | grep -qE 'supplier-(routes|orders)' && echo 1 || echo 0)"
tc "the public catalogue carries no route, partner, allowance or cost field" "$(! grep -qiE 'route_id|supplier|internal_allowance|contingency|expected_purchase|partner_group|routing_mode' public/catalogue.json && echo 1 || echo 0)"
t "sleeve specs exact: front 3756×3827, bleed 3 mm ≈ 35 px, spine 3 mm ≈ 35 px; back 3756×3756, bleed 3 mm" "3756x3827|3|35|3|35|3756x3756|3" "$(spec 't["SLEEVE_12_FRONT"]["output_px"]["width"]')x$(spec 't["SLEEVE_12_FRONT"]["output_px"]["height"]')|$(spec 't["SLEEVE_12_FRONT"]["bleed"]["min"]["mm"]')|$(spec 't["SLEEVE_12_FRONT"]["bleed"]["min"]["px"]')|$(spec 't["SLEEVE_12_FRONT"]["spine_allowance"]["top"]["mm"]')|$(spec 't["SLEEVE_12_FRONT"]["spine_allowance"]["bottom"]["px"]')|$(spec 't["SLEEVE_12_BACK"]["output_px"]["width"]')x$(spec 't["SLEEVE_12_BACK"]["output_px"]["height"]')|$(spec 't["SLEEVE_12_BACK"]["bleed"]["max"]["mm"]')"
t "disc geometry exact: 12\" 302 mm hole 7.23 mm; 10\" 250 mm hole unknown; 7\" 174 mm hole unknown" "302|7.23|250|None|174|None" "$(spec 't["PICTURE_DISC_12"]["diameter_mm"]')|$(spec 't["PICTURE_DISC_12"]["centre_hole_mm"]')|$(spec 't["PICTURE_DISC_10"]["diameter_mm"]')|$(spec 't["PICTURE_DISC_10"]["centre_hole_mm"]')|$(spec 't["PICTURE_DISC_7"]["diameter_mm"]')|$(spec 't["PICTURE_DISC_7"]["centre_hole_mm"]')"
t "unknown manufacturing values stay unknown: no safe area, trim or disc pixel canvas; Heart and Gatefold TEMPLATE_REQUIRED" "None|None|None|TEMPLATE_REQUIRED|None|TEMPLATE_REQUIRED|None" "$(spec 't["PICTURE_DISC_12"]["safe_inset_mm"]')|$(spec 't["SLEEVE_12_FRONT"]["trim_px"]')|$(spec 't["PICTURE_DISC_12"]["output_px"]')|$(spec 't["PICTURE_DISC_HEART"]["status"]')|$(spec 't["PICTURE_DISC_HEART"]["output_px"]')|$(spec 't["GATEFOLD_12_DOUBLE"]["status"]')|$(spec 't["GATEFOLD_12_DOUBLE"]["output_px"]')"
t "song counts are not programme duration: every vinyl capacity is UNVERIFIED with no invented minutes" "6|0" "$(cj 'len([p for p in d["capacity_profiles"] if p["status"]=="UNVERIFIED"])' public/api/data/creative.json)|$(cj 'len([p for p in d["capacity_profiles"] if p["verified_per_side_seconds"] is not None or p["verified_total_capacity_seconds"] is not None])' public/api/data/creative.json)"
t "the high-value gramophone needs its delivered cost confirmed; gramophones manual; plaque manual when unverified" "antique-brass-gramophone|MANUAL_AVAILABILITY_CONFIRMED|MANUAL_WHEN_UNVERIFIED" "$(cj '",".join(e["sku"] for e in d["registry"] if e["delivered_cost_confirmation_required"])' $SJ)|$(cj '",".join(sorted({e["routing_mode"] for e in d["registry"] if e["family"]=="GRAMOPHONE"}))' $SJ)|$(cj '[e["routing_mode"] for e in d["registry"] if e["family"]=="PLAQUE"][0]' $SJ)"
tc "the plaque is 8 × 12, one song, and does not play music" "$(python3 -c 'import json;e=[e for e in json.load(open("'"$SJ"'"))["registry"] if e["family"]=="PLAQUE"][0];t=json.dumps(e,ensure_ascii=False);print(1 if "8 × 12" in t and "does not play music" in t and e["songs"]==1 else 0)')"

ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS sra; DROP DATABASE IF EXISTS srb; CREATE DATABASE sra; CREATE DATABASE srb;' 2>/dev/null
ROOTQ sra < db/schema.sql 2>/dev/null
git show 4e2395c1:db/schema.sql | ROOTQ srb 2>/dev/null
q "SELECT 1" >/dev/null
ROOTQ srb -e "INSERT INTO customers (name, email) VALUES ('M','m@example.com'); INSERT INTO orders (customer_id, package, fulfilment_type, amount_gbp, currency, total_minor, status) VALUES (1,'keepsake','PHYSICAL',99.00,'GBP',9900,'PAID'); INSERT INTO supplier_orders (order_id, supplier_order_reference, skus, purchased_at, operator, financial_authoriser, currency, actual_purchase_cost_minor, actual_shipping_cost_minor, actual_total_cost_minor) VALUES (1,'SO-OLD','keepsake-7-picture-disc',UTC_TIMESTAMP(),'Ops','BELLA','GBP',4000,800,4800);" 2>/dev/null
ROOTQ srb < db/migrations/2026-09-16-supplier-routing.sql 2>/dev/null; M1=$?
ROOTQ srb < db/migrations/2026-09-16-supplier-routing.sql 2>/dev/null; M2=$?
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the routing migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$M1" = 0 ] && [ "$M2" = 0 ] && [ "$(dumpdb sra | shasum)" = "$(dumpdb srb | shasum)" ] && echo 1 || echo 0)"
t "  → an existing partner order keeps its costs; its tax or duty is unknown (NULL), never £0" "4800|NULL" "$(ROOTQ -N -e "SELECT actual_total_cost_minor FROM supplier_orders" srb 2>/dev/null)|$(ROOTQ -N -e "SELECT IFNULL(actual_tax_duty_minor,'NULL') FROM supplier_orders" srb 2>/dev/null)"
ROOTQ -e 'DROP DATABASE sra; DROP DATABASE srb;' 2>/dev/null

section "2. NO ROUTE DATA: NOTHING IS ASSUMED"
sup view=overview ov0
t "without route data every mapped product has no safe route; nothing is ready; research says NO_ROUTE" "False|15|0|15" "$(sj ov0 'str(d["route_data_present"])')|$(sj ov0 '[t["count"] for t in d["tiles"] if t["key"]=="products_without_safe_route"][0]')|$(sj ov0 '[t["count"] for t in d["tiles"] if t["key"]=="routes_ready"][0]')|$(sj ov0 'len([r for r in d["research"] if r["kind"]=="NO_ROUTE"])')"
t "  → the cards: 0 of 18 recorded, FOUNDER_DATA_REQUIRED, and a research item says so" "0|18|FOUNDER_DATA_REQUIRED|True" "$(sj ov0 'd["catalogue"]["cards"]["mapped"]')|$(sj ov0 'd["catalogue"]["cards"]["expected"]')|$(sj ov0 'd["catalogue"]["cards"]["status"]')|$(sj ov0 'str(any(r["kind"]=="FOUNDER_DATA_REQUIRED" and "18 of 18" in r["detail"] for r in d["research"]))')"
t "a quote without route data is unchanged (no evidence either way): GB keepsake quoted from the TEST rate" "QUOTED" "$(quote keepsake-12-picture-disc GB; cj 'd["quote"]["delivery"]["status"] if "quote" in d else d["delivery"]["status"]' /tmp/quote.json)"

echo "$ROUTES_V2" | write_routes

section "3. VERIFICATION AND STALENESS"
look keepsake-10-picture-disc GB k10
k10() { sj k10 "[o for g in d['result']['groups'].values() for o in g if o['route_id']=='$1'][0]$2"; }
t "VERIFIED without a source is not verified: VERIFICATION_REQUIRED (no verification source)" "VERIFICATION_REQUIRED|NO_VERIFICATION_SOURCE|UNVERIFIED" "$(k10 R-10-NOSOURCE '["verification"]["state"]')|$(k10 R-10-NOSOURCE '["verification"]["reasons"][0]')|$(k10 R-10-NOSOURCE '["group"]')"
t "  → a verification dated in the future is not a date: VERIFICATION_REQUIRED" "VERIFICATION_REQUIRED|NO_VERIFICATION_DATE" "$(k10 R-10-FUTURE '["verification"]["state"]')|$(k10 R-10-FUTURE '["verification"]["reasons"][0]')"
t "  → 'unsupported' needs evidence too; a suspended route and an unavailable product are unsupported here" "VERIFICATION_REQUIRED|SUSPENDED|UNSUPPORTED|ROUTE_SUSPENDED|UNSUPPORTED|PRODUCT_UNAVAILABLE" "$(k10 R-10-UNSUP-NOEVIDENCE '["verification"]["state"]')|$(k10 R-10-SUSPENDED '["verification"]["state"]')|$(k10 R-10-SUSPENDED '["group"]')|$(k10 R-10-SUSPENDED '["reasons"][0]')|$(k10 R-10-UNAVAILABLE '["group"]')|$(k10 R-10-UNAVAILABLE '["reasons"][0]')"
look lyrics-frame-10x15 GB fr
fr() { sj fr "[o for g in d['result']['groups'].values() for o in g if o['route_id']=='$1'][0]$2"; }
t "frames: three routes represented; the direct partner is recommended for review" "3|R-FRAME-DIRECT|SUPPORTED" "$(sj fr 'sum(len(g) for g in d["result"]["groups"].values())')|$(sj fr 'd["result"]["recommendation"]["route_id"]')|$(sj fr 'd["result"]["recommendation"]["group"]')"
t "  → the route with a geographic inconsistency stays VERIFICATION_REQUIRED even when entered as VERIFIED" "VERIFIED|VERIFICATION_REQUIRED|GEOGRAPHIC_INCONSISTENCY|true" "$(fr R-FRAME-MARKET-B '["verification"]["claimed"]')|$(fr R-FRAME-MARKET-B '["verification"]["state"]')|$(fr R-FRAME-MARKET-B '["verification"]["reasons"][0]')|$(fr R-FRAME-MARKET-B '["high_risk_marketplace"]')"
t "  → a URL alone makes nothing reliable: the unverified marketplace route has no verification" "VERIFICATION_REQUIRED|NOT_VERIFIED" "$(fr R-FRAME-MARKET-A '["verification"]["state"]')|$(fr R-FRAME-MARKET-A '["verification"]["reasons"][0]')"
look lyrics-frame-14x21 GB fr14
t "  → with nothing verified, a direct partner is reviewed before a marketplace whose destination is only 'check at checkout'" "R-FR14-DIRECT|True" "$(sj fr14 'd["result"]["recommendation"]["route_id"]')|$(sj fr14 'str(d["result"]["recommendation"]["explanation"].startswith("Direct manufacturer route"))')"
look keepsake-7-picture-disc GB k7a
t "freshness is NOT CONFIGURED by default: a 200-day-old verification is not called stale (no invented period)" "VERIFIED|NOT_CONFIGURED|False" "$(sj k7a '[o for o in d["result"]["groups"]["SUPPORTED"]+d["result"]["groups"]["UNVERIFIED"] if o["route_id"]=="R-7-STALE-MARKET"][0]["verification"]["state"]')|$(sj k7a '[o for g in d["result"]["groups"].values() for o in g][0]["verification"]["freshness"]["status"]')|$(sj k7a 'str([o for g in d["result"]["groups"].values() for o in g][0]["verification"]["reverify"])')"
with_config "\$c['fulfilment'] = ['route_freshness_days' => 90];"
look keepsake-7-picture-disc GB k7
t "with a configured freshness of 90 days the marketplace route is STALE: REVERIFY ROUTE" "STALE|True|200|90|UNVERIFIED" "$(sj k7 '[o for g in d["result"]["groups"].values() for o in g][0]["verification"]["state"]')|$(sj k7 'str([o for g in d["result"]["groups"].values() for o in g][0]["verification"]["reverify"])')|$(sj k7 '[o for g in d["result"]["groups"].values() for o in g][0]["verification"]["freshness"]["age_days"]')|$(sj k7 '[o for g in d["result"]["groups"].values() for o in g][0]["verification"]["freshness"]["freshness_days"]')|$(sj k7 '[o for g in d["result"]["groups"].values() for o in g][0]["group"]')"
sup view=overview ovs
t "  → the stale route is in 'routes needing verification' and research says REVERIFY ROUTE" "True|True" "$(sj ovs 'str(any(i["route_id"]=="R-7-STALE-MARKET" and i["reverify"] for i in [t for t in d["tiles"] if t["key"]=="routes_needing_verification"][0]["items"]))')|$(sj ovs 'str(any(r["kind"]=="REVERIFY_ROUTE" and r["route_id"]=="R-7-STALE-MARKET" for r in d["research"]))')"
to_ready '{"sku":"keepsake-7-picture-disc","email":"sr-stale@example.com"}'; ST=$OID; STREF=$(ref_of $ST)
t "  → a paid order on the stale route is never disabled: still ready, and Bella can authorise it" "FULFILMENT.READY|200|FULFILMENT.AUTHORISED" "$(state_of $ST)|$(founder_authorise $ST BELLA "$FOUNDER_CODE_BELLA")|$(state_of $ST)"
restore_config

section "4. THE ROUTING ENGINE: CUSTOMER DESTINATION, GROUPS, RECOMMENDATION FOR REVIEW"
look keepsake-12-picture-disc GB kgb
t "keepsake 12\" to GB: supported (direct) and unverified (marketplace); the direct route recommended for review" "ROUTE_FOR_REVIEW|R-PIC-DIRECT|R-PIC-MARKET|0|0|RECOMMENDED FOR REVIEW|R-PIC-DIRECT" "$(sj kgb 'd["result"]["status"]')|$(sj kgb '",".join(o["route_id"] for o in d["result"]["groups"]["SUPPORTED"])')|$(sj kgb '",".join(o["route_id"] for o in d["result"]["groups"]["UNVERIFIED"])')|$(sj kgb 'len(d["result"]["groups"]["UNSUPPORTED"])')|$(sj kgb 'len(d["result"]["groups"]["MANUAL_REVIEW"])')|$(sj kgb 'd["result"]["recommendation"]["label"]')|$(sj kgb 'd["result"]["recommendation"]["route_id"]')"
t "  → it explains why, and it authorises nothing" "Direct manufacturer route; destination verified; route verified; verified more recently; better destination evidence than the alternatives.|False|False" "$(sj kgb 'd["result"]["recommendation"]["explanation"]')|$(sj kgb 'str(d["result"]["recommendation"]["authorises_purchase"])')|$(sj kgb 'str(d["result"]["recommendation"]["places_order"])')"
tc "  → never 'auto selected'" "$(! grep -qiE 'auto[- ]?selected|selected automatically|automatically selected' /tmp/sup-kgb.json && echo 1 || echo 0)"
kd() { sj kgb "[o for g in d['result']['groups'].values() for o in g if o['route_id']=='$1'][0]$2"; }
t "expected direct cost by component: product £31 + internal shipping estimate £7 + contingency £1 + handling £2 = £41 (allowance £10 counted once)" "3100|700|100|200|1000|4100|true" "$(kd R-PIC-DIRECT '["expected_cost"]["product_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["expected_supplier_shipping_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["shipping_contingency_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["mcb_fulfilment_handling_allowance_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["total_internal_fulfilment_allowance_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["total_minor"]')|$(kd R-PIC-DIRECT '["expected_cost"]["complete"]')"
tc "  → the shipping figure is an internal estimate, not a verified quote or customer delivery charge" "$(kd R-PIC-DIRECT '["expected_cost"]["note"]' | grep -q 'not a verified partner quote and never a customer delivery charge' && echo 1 || echo 0)"
t "certainty: GB destination verified with a recorded shipping rule; marketplace must be confirmed on the listing" "VERIFIED|DESTINATION_RULE_RECORDED|CHECK_REQUIRED|CONFIRM_ON_LISTING" "$(kd R-PIC-DIRECT '["destination"]["certainty"]')|$(kd R-PIC-DIRECT '["shipping_certainty"]')|$(kd R-PIC-MARKET '["destination"]["certainty"]')|$(kd R-PIC-MARKET '["shipping_certainty"]')"
t "international evidence per country: shipping rule, tracking, customs, estimate, restrictions (from the route, never promised)" "true|true|true|true|true" "$(kd R-PIC-DIRECT '["international_evidence"]["shipping_rule"] is not None')|$(kd R-PIC-DIRECT '["international_evidence"]["tracking"] is not None')|$(kd R-PIC-DIRECT '["international_evidence"]["customs_duties"] is not None')|$(kd R-PIC-DIRECT '["international_evidence"]["delivery_estimate"] is not None')|$(kd R-PIC-DIRECT '["international_evidence"]["restrictions"] is not None')"
t "  → freshness (not configured by default), risks and an available fallback are shown" "NOT_CONFIGURED|True|R-PIC-MARKET|true" "$(kd R-PIC-DIRECT '["verification"]["freshness"]["status"]')|$(kd R-PIC-DIRECT '["risks"]' | grep -q 'Test risk note: long production in December' && echo True || echo False)|$(kd R-PIC-DIRECT '["fallback"]["route_id"]')|$(kd R-PIC-DIRECT '["fallback"]["available"]')"
look keepsake-12-picture-disc GB kgb2
t "deterministic: the same product and destination give the same result" "0" "$(python3 -c 'import json;a=json.load(open("/tmp/sup-kgb.json"))["result"];b=json.load(open("/tmp/sup-kgb2.json"))["result"];print(0 if json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True) else 1)')"
look keepsake-12-picture-disc DE kde
t "to DE the direct route needs a destination check: unverified, still recommended for review with that reason" "UNVERIFIED|R-PIC-DIRECT|QUOTE_REQUIRED|True" "$(sj kde '[o for g in d["result"]["groups"].values() for o in g if o["route_id"]=="R-PIC-DIRECT"][0]["group"]')|$(sj kde 'd["result"]["recommendation"]["route_id"]')|$(sj kde '[o for g in d["result"]["groups"].values() for o in g if o["route_id"]=="R-PIC-DIRECT"][0]["shipping_certainty"]')|$(sj kde 'str("destination must be checked" in d["result"]["recommendation"]["explanation"])')"
look keepsake-12-picture-disc US kus
t "to US every route excludes the destination: NO SAFE ROUTE, nothing recommended, both unsupported" "NO_SAFE_ROUTE|null|2" "$(sj kus 'd["result"]["status"]')|$(sj kus 'd["result"]["recommendation"]')|$(sj kus 'len(d["result"]["groups"]["UNSUPPORTED"])')"
with_config "\$c['business'] = ['timezone' => 'Asia/Kolkata']; \$c['founders']['BELLA']['location'] = 'IN'; \$c['app']['server_country'] = 'US';"
look keepsake-12-picture-disc GB kfl
t "routing ignores where the Founders or the server are: identical result with other locations configured" "0|CUSTOMER_DELIVERY_DESTINATION" "$(python3 -c 'import json;a=json.load(open("/tmp/sup-kgb.json"))["result"];b=json.load(open("/tmp/sup-kfl.json"))["result"];print(0 if json.dumps(a,sort_keys=True)==json.dumps(b,sort_keys=True) else 1)')|$(sj kfl 'd["result"]["destination"]["basis"]')"
restore_config
tc "  → the engine takes no location except the customer's country" "$(! grep -nE 'client_ip|REMOTE_ADDR|date_default_timezone|founders.*location|server_country|geoip' public/api/lib/routing.php | grep -q . && echo 1 || echo 0)"
look antique-brass-gramophone GB gram
t "the £1,000 gramophone: manual review (availability confirmed by a person), never auto-purchased" "MANUAL_AVAILABILITY_CONFIRMED|R-GRAMO-HV|MANUAL_REVIEW|AVAILABILITY_CONFIRMED_BY_A_PERSON" "$(sj gram 'd["result"]["routing_mode"]')|$(sj gram 'd["result"]["recommendation"]["route_id"]')|$(sj gram 'd["result"]["recommendation"]["group"]')|$(sj gram 'd["result"]["groups"]["MANUAL_REVIEW"][0]["reasons"][0]')"
tc "  → the explanation says a person confirms availability, destination and the delivered cost" "$(sj gram 'd["result"]["recommendation"]["explanation"]' | grep -q 'a person must confirm availability, destination and the delivered cost' && echo 1 || echo 0)"
look personalised-music-plaque GB plgb
look personalised-music-plaque IN plin
t "plaque: India-evidenced route supports IN; GB (unverified) goes to manual fulfilment review" "SUPPORTED|MANUAL_REVIEW|UNVERIFIED_DESTINATION_GOES_TO_A_PERSON" "$(sj plin 'd["result"]["recommendation"]["group"]')|$(sj plgb 'd["result"]["recommendation"]["group"]')|$(sj plgb 'd["result"]["groups"]["MANUAL_REVIEW"][0]["reasons"][0]')"
tc "  → nothing says 'India only', 'worldwide', 'duties included' or 'tax included'" "$(! grep -qiE 'india only|worldwide|duties included|tax included' /tmp/sup-plgb.json /tmp/sup-plin.json /tmp/sup-kgb.json /tmp/sup-kus.json && echo 1 || echo 0)"

section "5. NEW-SALE COMMERCIAL SAFETY AND THE CUSTOMER QUOTE"
quote keepsake-12-picture-disc US
t "a destination the routes prove unsupported is never sold as supported: MCB confirms delivery before payment" "UNAVAILABLE|MCB_CONFIRMS_DELIVERY|Keepsake" "$(cj '(d.get("quote") or d)["delivery"]["status"]' /tmp/quote.json)|$(cj '(d.get("quote") or d)["delivery"]["reason"]' /tmp/quote.json)|$(cj '",".join((d.get("quote") or d)["delivery"]["review_items"])' /tmp/quote.json)"
tc "  → the customer sees no partner, route, allowance, cost or margin" "$(! grep -qiE 'R-PIC|TEST PARTNER|partner\.example|route|allowance|expected|contingency|margin|contribution|supplier' /tmp/quote.json && echo 1 || echo 0)"
quote keepsake-12-picture-disc GB
t "  → a supported destination is quoted as before" "QUOTED" "$(cj '(d.get("quote") or d)["delivery"]["status"]' /tmp/quote.json)"
sup view=overview ovn
t "known negative contribution (Gatefold route £380 vs £349) is flagged for NEW sales, advisory by default" "True|ADVISORY" "$(sj ovn 'str(any(i["kind"]=="NEW_SALES" and i["sku"]=="journey-12" and "NEGATIVE_CONTRIBUTION" in i["type"] for i in [t for t in d["tiles"] if t["key"]=="commercial_exceptions"][0]["items"]))')|$(sj ovn 'd["enforcement"]["new_sale_safety"]')"
quote journey-12 GB
t "  → advisory: the Gatefold is still quoted; nothing is suspended or repriced" "QUOTED|34900|0" "$(cj '(d.get("quote") or d)["delivery"]["status"]' /tmp/quote.json)|$(price journey-12)|$(q "SELECT COUNT(*) FROM product_sales_suspensions")"
with_config "\$c['fulfilment'] = ['new_sale_safety' => 'REQUIRED'];"
quote journey-12 GB
t "  → REQUIRED (a founder setting): MCB confirms delivery first instead of an online sale" "UNAVAILABLE|MCB_CONFIRMS_DELIVERY" "$(cj '(d.get("quote") or d)["delivery"]["status"]' /tmp/quote.json)|$(cj '(d.get("quote") or d)["delivery"]["reason"]' /tmp/quote.json)"
restore_config
flags() { docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require "/var/www/html/api/lib/routing.php"; echo implode(",", new_sale_route_flags($argv[1], $argv[2] === "-" ? null : $argv[2])["flags"]);' "$1" "$2" 2>/dev/null; }
t "flags from recorded data only: missing route; manufacturing data missing (Heart dieline); unverified high-risk marketplace" "MISSING_ROUTE|MANUFACTURING_DATA_MISSING|UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE" "$(flags lyrics-frame-12x18 GB)|$(flags keepsake-10-heart-picture-disc GB)|$(flags antique-brass-gramophone GB)"
to_ready '{"sku":"journey-12","email":"sr-susp@example.com"}'; JS=$OID
JTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$JS")
t "suspending new Gatefold sales: currently unavailable to new customers, the Founders notified" "200|True|1" "$(crmpost crm/product-sales '{"action":"SUSPEND","subject":"journey-12","reason":"SUPPLIER_PRICE_CHANGE","staff":"Routing Tester"}')|$(get product-availability >/dev/null; cj 'str("journey-12" in d["unavailable"])')|$(q "SELECT COUNT(*) FROM founder_notifications WHERE notification_type='PRODUCT_SALES_SUSPENDED' AND subject_reference='journey-12'")"
t "  → the paid Gatefold order is untouched: still paid and ready, same price, nothing refunded, cancelled or purchased" "PAID|$JTOTAL|FULFILMENT.READY|0|0" "$(q "SELECT status FROM orders WHERE id=$JS")|$(q "SELECT total_minor FROM orders WHERE id=$JS")|$(state_of $JS)|$(q "SELECT COUNT(*) FROM refund_reviews WHERE order_id=$JS")|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$JS")"
crmpost crm/product-sales '{"action":"RESUME","subject":"journey-12","staff":"Routing Tester"}' >/dev/null

section "6. ROUTE REVIEW, FOUNDER AUTHORISATION AND WHAT NEVER FOLLOWS"
to_ready '{"sku":"keepsake-12-picture-disc","email":"sr-k12@example.com"}'; K=$OID; KREF=$(ref_of $K); KTOK=$TOK
sup view=orders ord
t "the order waits for a route review: recommended for review, no decision, nothing authorised" "R-PIC-DIRECT|null|1|NULL" "$(sj ord '[l for o in d["orders"] if o["order_id"]=='"$K"' for l in o["lines"]][0]["recommendation"]["route_id"]')|$(sj ord '[l for o in d["orders"] if o["order_id"]=='"$K"' for l in o["lines"]][0]["decision"]')|$(sj ord 'len([o for o in d["orders"] if o["order_id"]=='"$K"'][0]["routes_not_reviewed"])')|$(q "SELECT IFNULL(supplier_purchase_authorised_at,'NULL') FROM order_production WHERE order_id=$K")"
ctl $K
t "the founder decision card shows the recommendation and that the route is not yet reviewed" "R-PIC-DIRECT|True" "$(ctlj 'd["decision"]["lines"][0]["recommendation"]["route_id"]')|$(ctlj 'str("ROUTE_NOT_REVIEWED" in d["decision"]["would_block_if_required"])')"
t "choosing a different route needs a reason and a note; an unknown route is refused" "422|deviation_reason_required|422|invalid_route" "$(decide $KREF keepsake-12-picture-disc R-PIC-MARKET)|$(jget error)|$(decide $KREF keepsake-12-picture-disc R-NOPE)|$(jget error)"
EV0=$(events_total)
t "staff choose the marketplace route with a reason: recorded, never an authorisation" "200|false|false|1|NULL|0|FULFILMENT.READY" "$(decide $KREF keepsake-12-picture-disc R-PIC-MARKET '{"deviation_reason":"DELIVERY_TIME","note":"Faster for the anniversary date (test)."}')|$(jget authorises_purchase)|$(jget followed_recommendation)|$(evcount $K ROUTING.DECISION_RECORDED)|$(q "SELECT IFNULL(supplier_purchase_authorised_at,'NULL') FROM order_production WHERE order_id=$K")|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$K")|$(state_of $K)"
t "  → a new choice supersedes the old one; history kept" "200|2|1" "$(decide $KREF keepsake-12-picture-disc R-PIC-DIRECT '{"note":"Back to the recommendation (test)."}')|$(q "SELECT COUNT(*) FROM order_route_decisions WHERE order_id=$K")|$(q "SELECT COUNT(*) FROM order_route_decisions WHERE order_id=$K AND status='CURRENT'")"
decide $KREF keepsake-12-picture-disc R-PIC-MARKET '{"deviation_reason":"DELIVERY_TIME","note":"Faster for the anniversary date (test)."}' >/dev/null
to_ready '{"sku":"keepsake-10-picture-disc","email":"sr-k10@example.com"}'; K10=$OID; K10REF=$(ref_of $K10)
t "a suspended route cannot be chosen for an order" "409|route_unsupported" "$(decide $K10REF keepsake-10-picture-disc R-10-SUSPENDED '{"deviation_reason":"OTHER","note":"trying (test)"}')|$(jget error)"
t "a deep link to the order changes nothing financially" "200|NULL" "$(cc "view=search&q=$KREF")|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$K")"
t "Bella authorises with her own code; the expected economics use the chosen route (£29 + £9)" "200|BELLA|2900|900" "$(founder_authorise $K BELLA "$FOUNDER_CODE_BELLA")|$(q "SELECT supplier_purchase_authorised_by FROM order_production WHERE order_id=$K")|$(q "SELECT purchase_cost_minor FROM order_economics WHERE order_id=$K AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")|$(q "SELECT shipping_cost_minor FROM order_economics WHERE order_id=$K AND kind='EXPECTED' ORDER BY id DESC LIMIT 1")"
t "  → authorised but not placed: no partner order exists until a person records one" "0|FULFILMENT.AUTHORISED" "$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$K")|$(state_of $K)"
t "staff record the partner order with actual product, shipping and tax/duty (a person placed it)" "200|1500|3200|1000|1500" "$(act $K RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-K1","route_id":"R-PIC-MARKET","skus":["keepsake-12-picture-disc"],"actual_purchase_cost_minor":3200,"actual_shipping_cost_minor":1000,"actual_tax_duty_minor":1500,"variance_reason":"SUPPLIER_PRICE_CHANGE","send_email":false')|$(q "SELECT actual_tax_duty_minor FROM supplier_orders WHERE order_id=$K")|$(q "SELECT actual_purchase_cost_minor FROM supplier_orders WHERE order_id=$K")|$(q "SELECT actual_shipping_cost_minor FROM supplier_orders WHERE order_id=$K")|$(q "SELECT JSON_VALUE(body,'$.tax_duty_minor') FROM order_economics WHERE order_id=$K AND kind='ACTUAL' ORDER BY id DESC LIMIT 1")"
t "  → actual economics: £32 + £10 + £15 tax/duty = £57; variance on product and shipping stays separate (£4)" "5700|400|R-PIC-MARKET" "$(q "SELECT total_cost_minor FROM order_economics WHERE order_id=$K AND kind='ACTUAL' ORDER BY id DESC LIMIT 1")|$(q "SELECT variance_minor FROM supplier_orders WHERE order_id=$K")|$(q "SELECT route_id FROM supplier_orders WHERE order_id=$K")"

# The customer's delivery charge for players and cards comes only from the (TEST) customer rate table.
printf '%s' '{"currency":"GBP","pricing":{"PLAYER":"DESTINATION_CALCULATED","CARD":"DESTINATION_CALCULATED"},"rates":[{"id":"T_UK","label":"UK delivery (test table)","countries":["GB"],"first_item_minor":400,"additional_item_minor":100},{"id":"T_UK_PLAYER","label":"Player delivery (test table)","countries":["GB"],"classes":["PLAYER"],"first_item_minor":1200,"additional_item_minor":900}]}' > "$RATES"; settle
to_ready '{"sku":"keepsake-7-picture-disc","players":[["antique-brass-gramophone",1]],"email":"sr-gram@example.com"}'; G=$OID; GREF=$(ref_of $G)
t "the £1,000 gramophone cannot be authorised before its delivered cost is confirmed (in any mode)" "409|delivered_cost_confirmation_required|NULL" "$(founder_authorise $G LEWIS "$FOUNDER_CODE_LEWIS")|$(jget error /tmp/fa.json)|$(q "SELECT IFNULL(supplier_purchase_authorised_at,'NULL') FROM order_production WHERE order_id=$G")"
t "  → a route choice without the cost does not unlock it; card details in the evidence are refused" "200|409|422|card_number_in_note" "$(decide $GREF antique-brass-gramophone R-GRAMO-HV)|$(founder_authorise $G LEWIS "$FOUNDER_CODE_LEWIS")|$(decide $GREF antique-brass-gramophone R-GRAMO-HV '{"confirmed_delivered_cost_minor":125000,"confirmed_delivered_currency":"GBP","delivered_cost_evidence":"paid with 4242 4242 4242 4242"}')|$(jget error)"
t "  → with the confirmed delivered cost recorded, Lewis can authorise; nothing is purchased by that" "200|200|LEWIS|0" "$(decide $GREF antique-brass-gramophone R-GRAMO-HV '{"confirmed_delivered_cost_minor":125000,"confirmed_delivered_currency":"GBP","delivered_cost_evidence":"Partner checkout total to the GB address, screenshot filed (test)"}')|$(founder_authorise $G LEWIS "$FOUNDER_CODE_LEWIS")|$(q "SELECT supplier_purchase_authorised_by FROM order_production WHERE order_id=$G")|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$G")"
t "split partner orders: the gramophone and the record placed with different partners, separate parcels" "200|200|2|2|200|200|2" "$(act $G RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-G1","route_id":"R-7-STALE-MARKET","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":2000,"actual_shipping_cost_minor":800,"send_email":false')|$(act $G RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-G2","route_id":"R-GRAMO-HV","skus":["antique-brass-gramophone"],"actual_purchase_cost_minor":123000,"actual_shipping_cost_minor":2000,"variance_reason":"MARKETPLACE_VARIANCE","send_email":false')|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$G")|$(q "SELECT COUNT(DISTINCT route_id) FROM supplier_orders WHERE order_id=$G")|$(SO=$(q "SELECT id FROM supplier_orders WHERE order_id=$G AND supplier_order_reference='SO-SR-G1'") actj $G ADD_SHIPMENT '{"supplier_order_id":int(E["SO"]),"skus":["keepsake-7-picture-disc"]}')|$(SO=$(q "SELECT id FROM supplier_orders WHERE order_id=$G AND supplier_order_reference='SO-SR-G2'") actj $G ADD_SHIPMENT '{"supplier_order_id":int(E["SO"]),"skus":["antique-brass-gramophone"]}')|$(q "SELECT COUNT(*) FROM shipments WHERE order_id=$G")"
P1=$(ship_id $G 1)
t "the record's parcel is dispatched with its own tracking; the gramophone parcel follows separately" "200|DISPATCHED|AWAITING_DISPATCH" "$(P=$P1 D=$TODAY actj $G MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Test Carrier","tracking_reference":"TRK-SR-1","dispatched_on":E["D"],"send_email":False}')|$(q "SELECT state FROM shipments WHERE id=$P1")|$(q "SELECT state FROM shipments WHERE order_id=$G AND sequence=2")"
t "a delivery problem on one parcel: a delivery exception, the order not cancelled" "200|1|PAID" "$(P=$P1 actj $G UPDATE_SHIPMENT '{"shipment_id":int(E["P"]),"state":"DELAYED","notify_customer":False}')|$(q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id=$G AND type='PARCEL_DELAYED' AND status='OPEN'")|$(q "SELECT status FROM orders WHERE id=$G")"

section "7. CARD ALTERNATIVES: THE ONLY SUBSTITUTION, RECORDED IN FULL"
python3 - "$CATALOGUE" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p))
d["skus"]["test-pop-up-card"] = {"product_id": "test-pop-up-card", "name": "TEST Pop-Up Card (synthetic)", "price_minor": 4999, "currency": "GBP", "orderable": False, "category": "CARD", "fulfilment": "PHYSICAL", "delivery_class": "CARD", "song_count": None, "vinyl": None, "priority_replacement_eligible": False}
json.dump(d, open(p, "w"), indent=2)
PY
settle
to_ready '{"sku":"keepsake-7-picture-disc","email":"sr-card@example.com"}'; CD=$OID
q "INSERT INTO order_items (order_id, item_id, product_id, item_name, category, fulfilment, quantity, unit_gbp, line_gbp, unit_minor, line_minor) VALUES ($CD, 'test-pop-up-card', 'test-pop-up-card', 'TEST Pop-Up Card (synthetic)', 'CARD', 'PHYSICAL', 1, 49.99, 49.99, 4999, 4999)" >/dev/null
act $CD CONFIRM_FULFILMENT_REVIEW '"confirmed":true,"note":"Card availability and destination confirmed with the partner (test)."' >/dev/null
founder_authorise $CD BELLA "$FOUNDER_CODE_BELLA" >/dev/null
t "an alternative card needs the customer-impact assessment" "422|customer_impact_required" "$(act $CD RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-C1","skus":["test-pop-up-card"],"substitute_sku":"TEST alternative card design (synthetic)","substitute_for_sku":"test-pop-up-card","substitution_note":"Original design out of stock; same occasion and style (test).","send_email":false')|$(jget error)"
t "  → with it, the original, alternative, reason, authority and impact are recorded" "200|test-pop-up-card|TEST alternative card design (synthetic)|STAFF|Ops Tester|CUSTOMER_TOLD|1" "$(act $CD RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-C1","skus":["test-pop-up-card"],"substitute_sku":"TEST alternative card design (synthetic)","substitute_for_sku":"test-pop-up-card","substitution_note":"Original design out of stock; same occasion and style (test).","customer_impact":"CUSTOMER_TOLD","customer_impact_note":"Customer emailed about the design change (test).","send_email":false')|$(q "SELECT original_sku FROM card_alternatives WHERE order_id=$CD")|$(q "SELECT alternative FROM card_alternatives WHERE order_id=$CD")|$(q "SELECT authority FROM card_alternatives WHERE order_id=$CD")|$(q "SELECT authorised_by FROM card_alternatives WHERE order_id=$CD")|$(q "SELECT customer_impact FROM card_alternatives WHERE order_id=$CD")|$(q "SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id=$CD AND type='AUTHORISED_CARD_ALTERNATIVE'")"
t "  → the rule is not broadened: substituting the record needs a founder decision" "409|substitution_approval_required|0" "$(act $CD RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-SR-C2","skus":["keepsake-7-picture-disc"],"substitute_sku":"keepsake-10-picture-disc","substitute_for_sku":"keepsake-7-picture-disc","customer_impact":"CUSTOMER_TOLD","substitution_note":"trying (test)","send_email":false')|$(jget error)|$(q "SELECT COUNT(*) FROM card_alternatives WHERE original_sku='keepsake-7-picture-disc'")"
cp "$CAT_BACKUP" "$CATALOGUE"; settle

section "8. RESEARCH, MANUFACTURING DATA, SCORECARDS, COMMAND CENTRE AND BUSINESS"
sup view=overview ov
kinds() { sj ov "sorted({r['kind'] for r in d['research']})"; }
tc "SUPPLIER DATA NEEDS REVIEW lists shipping quote, destination, unavailable, template, capacity, fallback, no route, cards" "$(sj ov 'str(all(k in {r["kind"] for r in d["research"]} for k in ["SHIPPING_QUOTE_MISSING","VERIFICATION_REQUIRED","PRODUCT_UNAVAILABLE","TEMPLATE_MISSING","CAPACITY_MISSING","FALLBACK_ABSENT","NO_ROUTE","COST_MISSING","DESTINATION_UNVERIFIED","FOUNDER_DATA_REQUIRED"]))' | grep -qx True && echo 1 || echo 0)"
t "  → the direct route with recorded shipping evidence needs no shipping quote; the unverified ones do" "False|True" "$(sj ov 'str(any(r["kind"]=="SHIPPING_QUOTE_MISSING" and r["route_id"]=="R-PIC-DIRECT" for r in d["research"]))')|$(sj ov 'str(any(r["kind"]=="SHIPPING_QUOTE_MISSING" and r["route_id"]=="R-PIC-MARKET" for r in d["research"]))')"
mfg() { sj ov "[t for t in d['tiles'] if t['key']=='manufacturing_data_missing'][0]['items']$1"; }
t "MANUFACTURING DATA REQUIRED (kept apart): Heart dieline and Gatefold template block manufacture; 6 programme durations" "True|True|6" "$(mfg '' >/dev/null; sj ov 'str(any(i["kind"]=="HEART_DIELINE" and i["blocks_manufacture"] for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"]))')|$(sj ov 'str(any(i["kind"]=="GATEFOLD_TEMPLATE" and i["blocks_manufacture"] for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"]))')|$(sj ov 'len([i for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"] if i["kind"]=="PROGRAMME_DURATION"])')"
t "  → centre holes for 10\" and 7\", disc pixel canvas, safe areas and trim are asked for; the 12\" hole is known (7.23 mm)" "True|True|True|True|True" "$(sj ov 'str(sorted({i["template"] for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"] if i["kind"]=="CENTRE_HOLE"})==["PICTURE_DISC_10","PICTURE_DISC_7"])')|$(sj ov 'str(any(i["kind"]=="DISC_PIXEL_CANVAS" for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"]))')|$(sj ov 'str(any(i["kind"]=="SAFE_AREA" for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"]))')|$(sj ov 'str(any(i["kind"]=="TRIM" for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"]))')|$(sj ov 'str(any("Centre hole 7.23 mm" in i["known"] for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"] if i["template"]=="PICTURE_DISC_12"))')"
tc "  → programme durations are never invented (the song count is shown as a song count only)" "$(sj ov '[i for i in [t for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0]["items"] if i["kind"]=="PROGRAMME_DURATION"][0]["known"][0]' | grep -q 'not a manufacturer duration' && echo 1 || echo 0)"
tile() { sj ov "[t['count'] for t in d['tiles'] if t['key']=='$1'][0]"; }
EXP_READY=$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require "/var/www/html/api/lib/routing.php"; echo count(array_filter(supplier_routes(), fn($r) => $r["verification_state"]==="VERIFIED" && $r["availability"]!=="UNAVAILABLE"));' 2>/dev/null)
t "Command Centre counts: routes ready (R-PIC-DIRECT, R-HEART, R-GATEFOLD, R-FRAME-DIRECT, R-GRAMO-V, R-PLAQUE, R-7 without freshness) = 7" "7|$EXP_READY" "$(tile routes_ready)|$(tile routes_ready)"
t "  → needing verification: R-PIC-MARKET, R-10-NOSOURCE, R-10-FUTURE, R-10-UNSUP-NOEVIDENCE, R-FRAME-MARKET-A/B, R-FR14-MARKET/DIRECT, R-GRAMO-HV = 9" "9" "$(tile routes_needing_verification)"
t "  → products with no safe route: 4 frames, journey-6, keepsake-10, the portable player and the £1,000 gramophone (partly verified) = 8" "8|True" "$(tile products_without_safe_route)|$(sj ov 'str({i["sku"] for i in [t for t in d["tiles"] if t["key"]=="products_without_safe_route"][0]["items"]}=={"lyrics-frame-12x18","lyrics-frame-14x21","lyrics-frame-16x24","lyrics-frame-20x30","journey-6","keepsake-10-picture-disc","portable-suitcase-record-player","antique-brass-gramophone"})')"
READY_ORDERS=$(q "SELECT COUNT(*) FROM order_production p JOIN orders o ON o.id=p.order_id WHERE o.status='PAID' AND o.fulfilment_type='PHYSICAL' AND p.fulfilment_state='READY' AND p.supplier_purchase_authorised_at IS NULL")
t "  → awaiting founder approval, authorised but not placed, being made, supplier/delivery problems" "$READY_ORDERS|1|2|1" "$(tile awaiting_founder_authorisation)|$(tile authorised_not_placed)|$(tile being_made)|$(tile supplier_delivery_problems)"
t "  → commercial exceptions include the new-sale Gatefold flag; research and manufacturing counts are non-zero" "True|True" "$(sj ov 'str([t["count"] for t in d["tiles"] if t["key"]=="commercial_exceptions"][0] >= 1)')|$(sj ov 'str(len(d["research"]) > 0 and [t["count"] for t in d["tiles"] if t["key"]=="manufacturing_data_missing"][0] > 0)')"
sup view=scorecards sc
scd() { sj sc "[s for s in d['scorecards'] if s['route_id']=='$1'][0]['components']$2"; }
t "scorecard for the marketplace route: transparent components, no combined score, early data with 1 order" "None|EARLY DATA|1|2900|3200|300|900|1000|100|3800|4200|400|1500" "$(sj sc 'str([s for s in d["scorecards"] if s["route_id"]=="R-PIC-MARKET"][0]["combined_score"])')|$(scd R-PIC-MARKET '["SAMPLE_SIZE"]["label"]')|$(scd R-PIC-MARKET '["SAMPLE_SIZE"]["sample_size"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["expected_product_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["actual_product_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["product_variance_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["expected_shipping_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["actual_shipping_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["shipping_variance_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["expected_total_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["actual_total_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["total_variance_minor"]')|$(scd R-PIC-MARKET '["COST_COMPLETENESS"]["actual_tax_duty_minor"]')"
t "  → a route with no orders is INSUFFICIENT DATA; every component is present" "INSUFFICIENT DATA|VERIFICATION_QUALITY,COST_COMPLETENESS,DESTINATION_CERTAINTY,TRACKING_EVIDENCE,FULFILMENT_RELIABILITY,CUSTOMER_PROBLEM_RATE,SAMPLE_SIZE" "$(scd R-HEART '["SAMPLE_SIZE"]["label"]')|$(sj sc '",".join([s for s in d["scorecards"] if s["route_id"]=="R-HEART"][0]["components"].keys())')"
tc "  → variance is never labelled good or bad, and nothing ranks or switches a partner" "$(! grep -qiE '"(good|bad|poor|excellent|best|worst|winner)"|switch(ed)? (to|partner)|rank' /tmp/sup-sc.json && echo 1 || echo 0)"
q "UPDATE orders SET stripe_livemode = 1 WHERE id=$K" >/dev/null
biz suppliers
t "Business tab receives route data: readiness tiles match the Suppliers view; tax/duty and components per route" "$(tile routes_ready)|$(tile products_without_safe_route)|1500|EARLY DATA" "$(bj suppliers '[t["count"] for t in d["routing"]["tiles"] if t["key"]=="routes_ready"][0]')|$(bj suppliers '[t["count"] for t in d["routing"]["tiles"] if t["key"]=="products_without_safe_route"][0]')|$(bj suppliers '[r for r in d["supplier_routes"]["routes"] if r["route_id"]=="R-PIC-MARKET"][0]["actual_tax_duty_minor"]')|$(bj suppliers '[s for s in d["route_scorecards"] if s["route_id"]=="R-PIC-MARKET"][0]["components"]["SAMPLE_SIZE"]["label"]')"
cost '{"order_reference":"'"$KREF"'","category":"PAYMENT_PROCESSING_FEE","basis":"ACTUAL","amount_minor":250}' >/dev/null
biz products
t "  → actual costs feed Business Intelligence: product, shipping and tax/duty on the live order; expected kept separate" "$(( $(q "SELECT total_minor FROM orders WHERE id=$K") - 3200 - 1000 - 1500 - 250 ))|$(( $(q "SELECT total_minor FROM orders WHERE id=$K") - 2900 - 900 - 250 ))" "$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-12-picture-disc"][0]["actual"]["contribution_minor"]')|$(bj products '[p for p in d["products"]["products"] if p["sku"]=="keepsake-12-picture-disc"][0]["expected"]["contribution_minor"]')"
t "founder decisions hold: Europe/London; a payment fee unknown until recorded; video £49 with no price test; thresholds not configured" "Europe/London|NOT_AUTHORISED|4900|6" "$(bj suppliers 'd["timezone"]["timezone"]')|$(cj 'd["founder_decisions"]["video_price_test"]' public/api/data/business.json)|$(price memory-music-video)|$(biz data; bj data '[g["count"] for g in d["data_quality"]["gaps"] if g["key"]=="thresholds_not_configured"][0]')"

section "9. PRIVACY, SECURITY AND WHAT NEVER HAPPENS"
t "Suppliers responses are no-store and noindex" "1|1" "$(curl -s -D - -o /dev/null "$BASE/$SUP?view=overview&$SUPQ" -H "Authorization: Bearer $CRMKEY" | grep -ci 'cache-control: no-store' | awk '{print ($1>=1)?1:0}')|$(curl -s -D - -o /dev/null "$BASE/$SUP?view=overview&$SUPQ" -H "Authorization: Bearer $CRMKEY" | grep -ci 'x-robots-tag: noindex' | awk '{print ($1>=1)?1:0}')"
tc "the customer's order status shows no partner, route, cost or allowance" "$(status_of $K $KTOK >/dev/null; grep -q '"status"' /tmp/tx.json && ! grep -qiE 'R-PIC|TEST PARTNER|partner\.example|route_id|allowance|expected_purchase|contingency' /tmp/tx.json && echo 1 || echo 0)"
tc "no outbound call from the routing layer (no partner, courier, marketplace or payment API)" "$(! grep -niE 'curl_init|file_get_contents\(.https?:|fsockopen|stripe|/v1/' public/api/lib/routing.php public/api/crm/suppliers.php | grep -q . && echo 1 || echo 0)"
t "every authorisation is a founder's, by code; no refund, payout or transfer was requested of the payment provider" "0|0" "$(q "SELECT COUNT(*) FROM order_events WHERE event_type='FULFILMENT.AUTHORISED' AND JSON_VALUE(detail,'$.founder') NOT IN ('BELLA','LEWIS')")|$(docker exec mcb-api sh -c 'grep -ciE "refund|payout|transfer|subscription" /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"
t "no paid order was cancelled or repriced; partner orders exist only where a person recorded them" "0|4" "$(q "SELECT COUNT(*) FROM orders WHERE status NOT IN ('PAID','PENDING','AWAITING_PAYMENT')" )|$(q "SELECT COUNT(*) FROM supplier_orders")"
tc "no Mozart or model call, credential or purchase in the routing, business or supplier code" "$(! grep -niE 'mozart\.|api\.mozart|openai|anthropic' public/api/lib/routing.php public/api/crm/suppliers.php public/api/lib/business.php | grep -q . && echo 1 || echo 0)"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
