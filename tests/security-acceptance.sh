#!/bin/bash
# MCB™ SECURITY, RESILIENCE & AUTOMATION READINESS (17 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites. This
# suite ATTACKS the release candidate and proves it fails safely: nothing is
# purchased, paid out or refunded (Stripe and Resend are local stubs; supplier
# routes are SYNTHETIC).
#
# Covers: the exposed surface and security headers; PUBLIC / CUSTOMER / STAFF /
# FOUNDER separation (horizontal and vertical escalation, forged founders,
# wrong and missing codes, code guessing across orders, staff-key guessing);
# cross-customer isolation (changed ids, swapped, tampered, expired and revoked
# tokens, other customers' cases, evidence and videos, signed-link
# manipulation); upload hardening (disguised scripts, wrong signatures, SVG,
# empty, oversized, corrupt, traversal names, duplicates, private storage);
# private media headers; payment idempotency (duplicate, replayed, reordered,
# late and mismatched webhooks, double submit, refresh); automation
# idempotency and concurrency races; failure recovery (failed email,
# interrupted email, undelivered founder notification, stranded paid order,
# missing hooks) with idempotent retries and no retry for money; the refund and
# supplier money boundaries; REQUIRED new-sale safety; pop-up cards; the
# complete migration chain from the original base schema; configuration audit;
# the automation and founder action matrices; and that no money moves.
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


# ---- Security suite helpers ------------------------------------------------
SYS="crm/system"
SYSQ="staff=Security%20Tester"
sysget() { crm "$SYS?view=$1&$SYSQ" >/dev/null; cp /tmp/tx.json "/tmp/sys-$1.json"; }
sysj() { cj "$2" "/tmp/sys-$1.json"; }
syspost() { crmpost "$SYS" "$(ACT_=$1 ID_=$2 js '{"action":E["ACT_"],"id":int(E["ID_"]),"staff":"Security Tester"}')"; }
failcount() { sysget failures; sysj failures "[c['count'] for c in d['checks'] if c['key']=='$1'][0]"; }
status_link() { act $1 ISSUE_STATUS_LINK >/dev/null; jget links.status | sed 's/.*#//'; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
# has HEADERS PATTERN → 1 when the header is present (once or more)
has() { echo "$1" | grep -ci "$2" | awk '{print ($1>=1)?1:0}'; }
SUP="crm/suppliers"
decide() { local spec="${4:-}" extra; [ -z "$spec" ] && spec='{}'; extra=$(js "$spec"); crmpost "$SUP" "$(python3 -c 'import json,sys;d=json.loads(sys.argv[4]);d.update({"action":"RECORD_ROUTE_DECISION","staff":"Security Tester","order_reference":sys.argv[1],"sku":sys.argv[2],"route_id":sys.argv[3]});print(json.dumps(d))' "$1" "$2" "$3" "$extra")"; }
quote() { post_json order-quote "$(LINES_="$1" CC_=$2 js '{"lines":json.loads(E["LINES_"]),"shippingCountryCode":E["CC_"]}')" >/dev/null; cp /tmp/tx.json /tmp/quote.json; }
qj() { cj "$1" /tmp/quote.json; }
day() { python3 -c 'import datetime,sys;print((datetime.datetime.now(datetime.timezone.utc).date()+datetime.timedelta(days=int(sys.argv[1]))).isoformat())' "$1"; }
RECENT=$(day -6)
CARE="crm/support"
care() { local spec="${3:-}" extra; [ -z "$spec" ] && spec='{}'; extra=$(js "$spec"); crmpost "$CARE" "$(python3 -c 'import json,sys;d=json.loads(sys.argv[3]);d.update({"action":sys.argv[1],"case_id":int(sys.argv[2]),"staff":"Care Tester"});print(json.dumps(d))' "$1" "$2" "$extra")"; }
help_req() { post_json order-support "$(TOK_=$1 js '{**{"token":E["TOK_"]},**('"$2"')}')"; }
case_msg() { post_json order-support-case "$(TOK_=$1 CID_=$2 MSG_="$3" js '{"token":E["TOK_"],"case_id":int(E["CID_"]),"action":"message","message":E["MSG_"]}')"; }
progress() { post_json order-progress "$(TOK_=$1 js '{"token":E["TOK_"]}')"; }
evidence() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/order-evidence" -H "Origin: $ORIGIN" "$@"; }
# SYNTHETIC routes for the REQUIRED-safety rehearsal.
ROUTES_SEC=$(RECENT=$RECENT python3 - <<'PY'
import json, os
E = os.environ
def route(rid, skus, **kw):
    r = {"route_id": rid, "skus": skus, "supplier": f"TEST PARTNER {rid} (synthetic)", "currency": "GBP", "tracking_capability": "FULL"}
    r.update(kw); return r
ok = dict(verification_state="VERIFIED", source="synthetic evidence (test)", last_verified_date=E["RECENT"], availability="AVAILABLE")
print(json.dumps({"routes": [
  route("S-J6", ["journey-6"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": ["US"]}, shipping_model="DESTINATION_CALCULATED",
        expected_purchase_cost_minor=7000, internal_allowance={"expected_supplier_shipping_minor": 1500}, **ok),
  route("S-K12", ["keepsake-12-picture-disc", "keepsake-7-picture-disc", "keepsake-10-heart-picture-disc"], route_type="DIRECT_MANUFACTURER", destinations={"supported": ["GB"], "check_required": [], "unsupported": ["US"]},
        shipping_model="DESTINATION_CALCULATED", expected_purchase_cost_minor=4000, internal_allowance={"expected_supplier_shipping_minor": 1500}, **ok),
  route("S-FRAME-MKT", ["lyrics-frame-10x15"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []}, shipping_model="MARKETPLACE_LISTING_DEPENDENT",
        expected_purchase_cost_minor=1500, internal_allowance={"expected_supplier_shipping_minor": 800}),
  route("S-GRAMO", ["antique-brass-gramophone"], route_type="MARKETPLACE", destinations={"supported": ["GB"], "check_required": [], "unsupported": []}, shipping_model="MARKETPLACE_LISTING_DEPENDENT",
        expected_purchase_cost_minor=50000, internal_allowance={"expected_supplier_shipping_minor": 3000}, **ok),
]}))
PY
)
STRIPE_AT_START=$(stub_count)
stub_reset
reset_limits

section "1. THE EXPOSED SURFACE"
t "configuration, libraries, data, private storage and test stubs are never served" "403|403|403|403|403" "$(code "$BASE/config.php")|$(code "$BASE/lib/security.php")|$(code "$BASE/data/catalogue.json")|$(code "$BASE/data/schema-manifest.json")|$(code "$BASE/storage/")"
tc "no directory listing for the API or its private folders" "$(for p in "" crm/ lib/ data/ storage/ fx/; do c=$(code "$BASE/$p"); [ "$c" = 200 ] && curl -s "$BASE/$p" | grep -qi 'Index of' && echo LISTED; done | grep -q LISTED && echo 0 || echo 1)"
UNPROT=""
for f in public/api/crm/*.php; do ep="crm/$(basename "$f" .php)"; [ "$ep" = "crm/notifications" ] && continue
  g=$(code "$BASE/$ep"); p=$(code -X POST "$BASE/$ep" -H 'Content-Type: application/json' -d '{}')
  [ "$g" != 401 ] && [ "$g" != 405 ] && UNPROT="$UNPROT $ep:GET=$g"; [ "$p" != 401 ] && [ "$p" != 405 ] && UNPROT="$UNPROT $ep:POST=$p"; done
t "every staff endpoint refuses a request without the staff key (GET and POST)" "" "$UNPROT"
t "a wrong key, a customer's link token or the notification worker key is not the staff key" "401|401|401" "$(code "$BASE/crm/orders" -H 'Authorization: Bearer test_crm_key_not_real_000000000000000000001')|$(code "$BASE/crm/orders" -H 'Authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')|$(code "$BASE/crm/order-action" -X POST -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY" -H 'Content-Type: application/json' -d '{}')"
t "the notification bridge refuses a request without a key; the staff key there works only as staff" "401|200" "$(code -X POST "$BASE/crm/notifications" -H 'Content-Type: application/json' -d '{"action":"CLAIM"}')|$(code "$BASE/crm/notifications?view=health" -H "Authorization: Bearer $CRMKEY")"
hdrs=$(curl -s -D - -o /dev/null -X POST "$BASE/order-status" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{}')
t "JSON endpoints: nosniff, no-store, no-referrer, CSP none, frame DENY, noindex" "1|1|1|1|1|1" "$(has "$hdrs" 'x-content-type-options: nosniff')|$(has "$hdrs" 'cache-control: no-store')|$(has "$hdrs" 'referrer-policy: no-referrer')|$(has "$hdrs" "content-security-policy: default-src 'none'")|$(has "$hdrs" 'x-frame-options: deny')|$(has "$hdrs" 'x-robots-tag: noindex')"
t "a cross-site POST to customer endpoints is refused (same-origin rule)" "403|403" "$(code -X POST "$BASE/order-support" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}')|$(code -X POST "$BASE/order-progress" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}')"
q "DELETE FROM rate_limit_hits WHERE scope='crm-auth-failure'" >/dev/null
for i in $(seq 1 101); do code "$BASE/crm/orders" -H "Authorization: Bearer wrong$i" >/dev/null; done
t "guessing the staff key is throttled after 100 failures from one address (429); the real key still works" "429|200" "$(code "$BASE/crm/orders" -H 'Authorization: Bearer wrong-again')|$(code "$BASE/crm/orders" -H "Authorization: Bearer $CRMKEY")"
q "DELETE FROM rate_limit_hits WHERE scope='crm-auth-failure'" >/dev/null

section "2. CUSTOMER ISOLATION: ONE CUSTOMER NEVER REACHES ANOTHER'S ORDER"
paid_order '{"sku":"moment","email":"iso-a@example.com","video":[1,1]}'; A=$OID; ATOK=$TOK; AREF=$(ref_of $A)
paid_order '{"sku":"moment","email":"iso-b@example.com","video":[1,1]}'; B=$OID; BTOK=$TOK; BREF=$(ref_of $B)
TA=$(status_link $A); TB=$(status_link $B)
t "each customer's link opens only their own order" "$AREF|$BREF" "$(progress $TA >/dev/null; jget reference)|$(progress $TB >/dev/null; jget reference)"
tc "  → A's order page carries nothing of B (reference, email, story)" "$(progress $TA >/dev/null; ! grep -qE "$BREF|iso-b@example.com" /tmp/tx.json && echo 1 || echo 0)"
TAX="${TA%?}$( [ "${TA: -1}" = A ] && echo B || echo A )"
t "a changed, random or empty token opens nothing (same answer, no hint)" "404|404|404" "$(progress "$TAX")|$(progress "$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=' | cut -c1-43)")|$(progress "")"
t "A's checkout token cannot read, pay for or upload to B's order" "404|404|404" "$(status_of $B $ATOK)|$(session $B $ATOK)|$(upload $B $ATOK memory:1:1 $FIX/photo-2500.jpg)"
q "UPDATE order_access_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_id=$A AND purpose='STATUS'" >/dev/null
t "an expired link opens nothing" "404" "$(progress $TA)"
TA=$(status_link $A)
act $A REVOKE_LINKS >/dev/null
t "a revoked link opens nothing; a newly issued one works" "404|$AREF" "$(progress $TA)|$(TA2=$(status_link $A); progress $TA2 >/dev/null; jget reference)"
TA=$(status_link $A)
help_req $TB '{"kind":"QUESTION","description":"When will my video be ready? (B)"}' >/dev/null; CB=$(jget case_id)
help_req $TA '{"kind":"QUESTION","description":"A question from customer A."}' >/dev/null; CA=$(jget case_id)
t "A cannot message B's case, answer its satisfaction question or attach evidence to it" "404|404|404" "$(case_msg $TA $CB 'Injected into another case')|$(post_json order-support-case "$(TOK_=$TA CID_=$CB js '{"token":E["TOK_"],"case_id":int(E["CID_"]),"action":"satisfaction","answer":"YES"}')")|$(evidence -F "token=$TA" -F "request_id=$CB" -F kind=OTHER -F 'reference=injected')"
t "  → B's case holds only B's own message" "0" "$(q "SELECT COUNT(*) FROM support_case_messages WHERE case_id=$CB AND body LIKE '%Injected%'")"
VJB=$(q "SELECT id FROM video_jobs WHERE order_id=$B LIMIT 1")
t "A cannot open B's Memory Music Video, even with B's video job number" "404" "$(post_json order-video "$(TOK_=$TA J_=$VJB js '{"token":E["TOK_"],"videoJobId":int(E["J_"])}')")"
SIGOK=$(docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; $e = time() + 300; echo "$e " . hash_hmac("sha256", "mcb-video|" . $argv[1] . "|999999|$e|0", (string) mcb_setting("token_secret", ""));' $A 2>/dev/null)
EXP=${SIGOK%% *}; SIG=${SIGOK##* }
t "signed video links: another order id, a changed expiry, a forged or expired signature are refused" "403|403|403|403|404" "$(code "$BASE/order-video?o=$B&m=999999&e=$EXP&d=0&s=$SIG")|$(code "$BASE/order-video?o=$A&m=999999&e=$((EXP+1))&d=0&s=$SIG")|$(code "$BASE/order-video?o=$A&m=999999&e=$EXP&d=0&s=$(openssl rand -hex 32)")|$(code "$BASE/order-video?o=$A&m=999999&e=$((EXP-100000))&d=0&s=$SIG")|$(code "$BASE/order-video?o=$A&m=999999&e=$EXP&d=0&s=$SIG")"
t "guessing a checkout session id reveals no order reference" "200|False" "$(get "order-reference?session_id=cs_test_$(openssl rand -hex 24)")|$(grep -qE "MCB-[0-9]{4}-[0-9]{6}" /tmp/tx.json && echo True || echo False)"
reset_limits
for i in $(seq 1 61); do progress "$(openssl rand -hex 21 | cut -c1-43)" >/dev/null; done
t "guessing customer links is rate limited (60 per 10 minutes per address)" "429" "$(progress "$(openssl rand -hex 21 | cut -c1-43)")"
reset_limits

section "3. STAFF IS NOT FOUNDER: FINANCIAL AUTHORITY NEEDS BELLA OR LEWIS"
echo "$ROUTES_SEC" | write_routes
to_ready '{"sku":"keepsake-7-picture-disc","email":"auth-k@example.com"}'; K=$OID; KREF=$(ref_of $K)
t "staff without a founder, confirmation or code cannot authorise a supplier purchase" "422|founder_required|422|authorisation_confirmation_required|403|founder_authorisation_failed" "$(act $K AUTHORISE_SUPPLIER_PURCHASE)|$(jget error)|$(act $K AUTHORISE_SUPPLIER_PURCHASE '"founder":"BELLA"')|$(jget error)|$(act $K AUTHORISE_SUPPLIER_PURCHASE '"founder":"BELLA","confirm":true,"destination_acknowledged":true,"commercial_acknowledged":true')|$(jget error)"
t "a forged founder, the other founder's code, or a guessed code is refused and audited" "422|403|403|3" "$(act $K AUTHORISE_SUPPLIER_PURCHASE '"founder":"CAROL","founder_code":"'"$FOUNDER_CODE_BELLA"'","confirm":true')|$(act $K AUTHORISE_SUPPLIER_PURCHASE '"founder":"BELLA","founder_code":"'"$FOUNDER_CODE_LEWIS"'","confirm":true,"destination_acknowledged":true,"commercial_acknowledged":true')|$(act $K AUTHORISE_SUPPLIER_PURCHASE '"founder":"LEWIS","founder_code":"000000","confirm":true,"destination_acknowledged":true,"commercial_acknowledged":true')|$(evcount $K FULFILMENT.AUTHORISATION_REFUSED)"
t "  → nothing was authorised, and the codes never appear in any record" "NULL|0" "$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$K")|$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%not-real%'")"
t "opening every Command Centre view and deep link for the order authorises nothing" "200|200|200|NULL" "$(crm "crm/command-centre?view=order&order_id=$K&staff=x")|$(crm "crm/command-centre?view=approvals&staff=x")|$(crm "crm/operations?order=$K&open=authorise&founder_code=$FOUNDER_CODE_BELLA")|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$K")"
t "a route recommendation, a route decision or the Suppliers view authorises nothing" "200|200|NULL" "$(crm "$SUP?view=orders&staff=x")|$(decide $KREF keepsake-7-picture-disc S-K12)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$K")"
t "Bella authorises with her own code; replaying the same request (double click, API replay) changes nothing" "200|200|unchanged|1" "$(founder_authorise $K BELLA "$FOUNDER_CODE_BELLA")|$(founder_authorise $K BELLA "$FOUNDER_CODE_BELLA")|$(jget outcome /tmp/fa.json)|$(evcount $K FULFILMENT.AUTHORISED)"
t "  → an authorisation is not a purchase: no partner order exists until a person records one" "0" "$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$K")"
# Guessing codes by spreading attempts over many orders is stopped.
for n in 1 2 3; do to_ready "{\"sku\":\"keepsake-7-picture-disc\",\"email\":\"guess-$n@example.com\"}"; eval "G$n=$OID"; done
for g in $G1 $G2 $G3; do for i in 1 2 3 4 5; do act $g AUTHORISE_SUPPLIER_PURCHASE '"founder":"LEWIS","founder_code":"guess'$i'","confirm":true' >/dev/null; done; done
t "code guessing across orders pauses every authorisation for 15 minutes (429), even the right code" "429|too_many_attempts" "$(founder_authorise $G1 LEWIS "$FOUNDER_CODE_LEWIS")|$(jget error /tmp/fa.json)"
q "DELETE FROM order_events WHERE event_type='FULFILMENT.AUTHORISATION_REFUSED'" >/dev/null
t "  → after the pause the real code works again" "200" "$(founder_authorise $G1 LEWIS "$FOUNDER_CODE_LEWIS")"

section "4. UPLOADS: CONTENT-CHECKED, PRIVATE, NEVER EXECUTED"
order '{"sku":"keepsake-7-picture-disc","email":"upload@example.com","manual_photos":1}'; U=$OID; UTOK=$TOK
SLOT=$(python3 -c 'import json;print([s for s in json.load(open("/tmp/order.json"))["missing_uploads"] if s.startswith("memory:")][0])')
TMPU=$(mktemp -d)
printf '<?php system($_GET["c"]); ?>' > "$TMPU/shell.jpg"
{ printf '\xFF\xD8\xFF\xE0'; printf '<?php echo 1; ?>'; } > "$TMPU/polyglot.jpg"
printf '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' > "$TMPU/image.svg"
: > "$TMPU/empty.jpg"
head -c 3000 "$FIX/photo-2500.jpg" > "$TMPU/truncated.jpg"
head -c 11000000 /dev/urandom > "$TMPU/huge.jpg"
t "a script named .jpg, a JPEG-headed script, an SVG, an empty file are refused" "415|415|415|422" "$(upload $U $UTOK $SLOT "$TMPU/shell.jpg")|$(upload $U $UTOK $SLOT "$TMPU/polyglot.jpg")|$(upload $U $UTOK $SLOT "$TMPU/image.svg" image.svg)|$(upload $U $UTOK $SLOT "$TMPU/empty.jpg")"
t "a corrupt (truncated) photograph and an oversized file are refused" "415|413" "$(upload $U $UTOK $SLOT "$TMPU/truncated.jpg")|$(upload $U $UTOK $SLOT "$TMPU/huge.jpg")"
t "a real photograph with a traversal file name is stored under a random server name" "201|1" "$(upload $U $UTOK $SLOT "$FIX/photo-2500.jpg" '../../../../var/www/html/api/evil.php')|$(q "SELECT COUNT(*) FROM order_uploads WHERE order_id=$U AND stored_name REGEXP '^[a-f0-9]{64}$'")"
t "  → nothing reached the web root; the private directory is outside it" "404|0" "$(code "$BASE/evil.php")|$(docker exec mcb-api sh -c 'find /var/www/html -newer /tmp -name "*.php" -path "*evil*" 2>/dev/null | wc -l' | tr -d ' ')"
t "uploading again for the same memory replaces the photo (one current upload, no orphan row)" "201|1" "$(upload $U $UTOK $SLOT "$FIX/photo-3000.jpg")|$(q "SELECT COUNT(*) FROM order_uploads WHERE order_id=$U")"
UID1=$(q "SELECT public_id FROM order_uploads WHERE order_id=$U LIMIT 1")
UH=$(curl -s -D - -o /dev/null "$BASE/crm/upload?id=$UID1" -H "Authorization: Bearer $CRMKEY")
t "staff photo download: attachment, nosniff, sandboxed CSP, no-store, no-referrer; public or keyless access refused" "1|1|1|1|1|401" "$(has "$UH" 'content-disposition: attachment')|$(has "$UH" 'x-content-type-options: nosniff')|$(has "$UH" 'sandbox')|$(has "$UH" 'cache-control: no-store')|$(has "$UH" 'referrer-policy: no-referrer')|$(code "$BASE/crm/upload?id=$UID1")"
t "no photo can be added once an order is paid" "409" "$(upload $A $ATOK memory:1:1 "$FIX/photo-2500.jpg")"
rm -rf "$TMPU"
tc "malware scanning is reported truthfully as not present" "$(sysget readiness; sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="malware_scanning"][0]' | grep -qx NOT_PRESENT && echo 1 || echo 0)"

section "5. PAYMENTS: ONE PAYMENT, ONE ORDER, NEVER LOST"
order '{"sku":"moment","email":"pay@example.com","video":[1,1]}'; P=$OID; PTOK=$TOK
IK="idem-$(openssl rand -hex 12)"; BODY=$(build_order '{"sku":"moment","email":"double@example.com"}')
t "double submit with the same idempotency key returns the same order, not a second one" "True|1" "$(IDEM=$IK post_json order "$BODY" >/dev/null; O1=$(jget order_id); IDEM=$IK post_json order "$BODY" >/dev/null; [ "$O1" = "$(jget order_id)" ] && echo True || echo False)|$(q "SELECT COUNT(*) FROM customers c JOIN orders o ON o.customer_id=c.id WHERE c.email='double@example.com'")"
t "refreshing checkout creates no second order" "200|200|1" "$(session $P $PTOK)|$(session $P $PTOK)|$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='pay@example.com'")"
PSID=$(session_id_for $P); PTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$P")
MAIL0=$(mail_count)
EV="evt_sec_$(openssl rand -hex 6)"
t "the same payment event delivered twice: one payment, one reference, one video space, one confirmation" "200|200|PAID|1|1|1|1" "$(pay_with $P $EV)|$(pay_with $P $EV)|$(q "SELECT status FROM orders WHERE id=$P")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$P AND dedupe_key='paid'")|$(q "SELECT COUNT(*) FROM video_entitlements WHERE order_id=$P")|$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE order_id=$P AND status IN ('RESERVED','COMPLETED')")|$(( $(mail_count) - MAIL0 ))"
t "a second, different event for the same session changes nothing (no second charge record, no second space)" "200|1|1|1" "$(pay_with $P "evt_sec_other_$(openssl rand -hex 6)")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$P AND event_type='PAYMENT.RECEIVED'")|$(q "SELECT COUNT(*) FROM video_entitlements WHERE order_id=$P")|$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$P AND item_id='memory-music-video'")"
EXPIRED=$(python3 -c 'import json,sys;print(json.dumps({"id":"evt_exp_"+sys.argv[1],"type":"checkout.session.expired","livemode":False,"data":{"object":{"id":sys.argv[2],"object":"checkout.session","client_reference_id":sys.argv[3],"status":"expired","payment_status":"unpaid","metadata":{"mcb_order_id":sys.argv[3]}}}}))' "$(openssl rand -hex 4)" "$PSID" "$P")
t "a late 'session expired' event after payment never unpays the order; the customer still sees it paid" "200|PAID|PAID" "$(hook "$EXPIRED")|$(q "SELECT status FROM orders WHERE id=$P")|$(status_of $P $PTOK >/dev/null; jget status)"
OLDTS=$(( $(date +%s) - 1000 )); OLDSIG=$(printf '%s.%s' "$OLDTS" "$(pay_event evt_old x $P $PTOTAL gbp)" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//')
t "a captured webhook replayed after the tolerance window, or with a forged signature, is refused" "400|400" "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H 'Content-Type: application/json' -H "Stripe-Signature: t=$OLDTS,v1=$OLDSIG" -d "$(pay_event evt_old x $P $PTOTAL gbp)")|$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H 'Content-Type: application/json' -H "Stripe-Signature: t=$(date +%s),v1=$(openssl rand -hex 32)" -d "$(pay_event evt_forged x $P $PTOTAL gbp)")"
order '{"sku":"moment","email":"under@example.com"}'; UP=$OID; session $UP $TOK >/dev/null
t "an underpayment never completes an order (payment review, no reference)" "PAYMENT_REVIEW|NULL" "$(hook "$(pay_event "evt_under_$(openssl rand -hex 4)" "$(session_id_for $UP)" "$UP" 100 gbp)" >/dev/null; q "SELECT status FROM orders WHERE id=$UP")|$(q "SELECT IFNULL(mcb_reference,'NULL') FROM orders WHERE id=$UP")"
# Interrupted between payment and the processing hand-over: surfaced, then retried once.
q "DELETE FROM order_events WHERE order_id=$B AND dedupe_key='ready-for-processing'" >/dev/null
t "a paid order whose hand-over was interrupted is visible, and its retry is idempotent" "1|200|recorded|200|already_recorded|1|0" "$(failcount PAID_ORDER_NOT_PROCESSED)|$(syspost RECORD_PROCESSING_EVENT $B)|$(jget outcome)|$(syspost RECORD_PROCESSING_EVENT $B)|$(jget outcome)|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$B AND dedupe_key='ready-for-processing'")|$(failcount PAID_ORDER_NOT_PROCESSED)"

section "6. FAILED EMAIL AND NOTIFICATIONS NEVER CORRUPT AN ORDER"
docker exec mcb-api sh -c 'echo http_fail > /tmp/resend-mode'
order '{"sku":"moment","email":"mailfail@example.com"}'; MF=$OID; session $MF $TOK >/dev/null
t "the email provider rejects the confirmation: the payment is still recorded, the order paid" "200|PAID|NULL" "$(pay_with $MF "evt_mf_$(openssl rand -hex 4)")|$(q "SELECT status FROM orders WHERE id=$MF")|$(q "SELECT IFNULL(customer_notified_at,'NULL') FROM orders WHERE id=$MF")"
q "UPDATE order_events SET created_at = UTC_TIMESTAMP() - INTERVAL 1 HOUR WHERE order_id=$MF" >/dev/null
t "  → it is not claimed as delivered: it surfaces as a confirmation not sent" "1|RETRY_WITH_IDEMPOTENCY_KEY|RETRY_PAYMENT_CONFIRMATION" "$(failcount PAYMENT_CONFIRMATION_NOT_SENT)|$(sysj failures '[c["retry"] for c in d["checks"] if c["key"]=="PAYMENT_CONFIRMATION_NOT_SENT"][0]')|$(sysj failures '[c["recovery_action"] for c in d["checks"] if c["key"]=="PAYMENT_CONFIRMATION_NOT_SENT"][0]')"
docker exec mcb-api sh -c 'echo ok > /tmp/resend-mode'
MAIL1=$(mail_count)
t "retrying once the provider is back sends it exactly once; a second retry sends nothing" "notified|already_notified|1|0" "$(syspost RETRY_PAYMENT_CONFIRMATION $MF >/dev/null; jget outcome)|$(syspost RETRY_PAYMENT_CONFIRMATION $MF >/dev/null; jget outcome)|$(( $(mail_count) - MAIL1 ))|$(failcount PAYMENT_CONFIRMATION_NOT_SENT)"
# A lifecycle email that failed, and one interrupted mid-send.
q "INSERT INTO customer_communications (order_id, customer_id, message_type, dedupe_key, status, attempted_at, failure_code) SELECT id, customer_id, 'IN_PRODUCTION', 'in-production-0', 'FAILED', UTC_TIMESTAMP(), 'http_422' FROM orders WHERE id=$K" >/dev/null
q "INSERT INTO customer_communications (order_id, customer_id, message_type, dedupe_key, status, attempted_at) SELECT id, customer_id, 'DISPATCHED', 'dispatched-0', 'CLAIMED', UTC_TIMESTAMP() - INTERVAL 1 HOUR FROM orders WHERE id=$K" >/dev/null
FAILED_ID=$(q "SELECT id FROM customer_communications WHERE order_id=$K AND status='FAILED' LIMIT 1"); CLAIMED_ID=$(q "SELECT id FROM customer_communications WHERE order_id=$K AND status='CLAIMED' LIMIT 1")
t "a failed update email can be retried; one interrupted mid-send needs a person to check first (no retry offered)" "1|1|null|409|not_retryable" "$(failcount CUSTOMER_EMAIL_FAILED)|$(failcount CUSTOMER_EMAIL_INTERRUPTED)|$(sysj failures '[c["recovery_action"] for c in d["checks"] if c["key"]=="CUSTOMER_EMAIL_INTERRUPTED"][0]')|$(syspost RETRY_CUSTOMER_EMAIL $CLAIMED_ID)|$(jget error)"
t "  → the failed one is retried under its key and sent once" "200|SENT|0" "$(syspost RETRY_CUSTOMER_EMAIL $FAILED_ID)|$(q "SELECT status FROM customer_communications WHERE id=$FAILED_ID")|$(failcount CUSTOMER_EMAIL_FAILED)"
# Founder notification bridge unavailable.
NID=$(q "SELECT id FROM founder_notifications ORDER BY id LIMIT 1")
q "UPDATE founder_notifications SET status='ABANDONED', attempts=8 WHERE id=$NID" >/dev/null
t "an undelivered founder notification is not lost: surfaced, still in the staff queue, retried safely" "1|SAFE_TO_RETRY|200|PENDING|0" "$(failcount FOUNDER_NOTIFICATION_UNDELIVERED)|$(sysj failures '[c["retry"] for c in d["checks"] if c["key"]=="FOUNDER_NOTIFICATION_UNDELIVERED"][0]')|$(syspost RETRY_FOUNDER_NOTIFICATION $NID)|$(q "SELECT status FROM founder_notifications WHERE id=$NID")|$(failcount FOUNDER_NOTIFICATION_UNDELIVERED)"
t "Telegram is not claimed as connected until a delivery is actually confirmed" "NOT_VERIFIED" "$(sysget readiness; sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="telegram_delivery"][0]')"
t "money work has no retry at all: refunds, replacements and purchases are DO_NOT_AUTO_RETRY and refused by recovery" "DO_NOT_AUTO_RETRY|DO_NOT_AUTO_RETRY|DO_NOT_AUTO_RETRY|DO_NOT_AUTO_RETRY|422|no_automatic_recovery" "$(crm "$SYS?view=retry-policy&$SYSQ" >/dev/null; cj 'd["work"]["REFUND"]["retry"]')|$(cj 'd["work"]["REPLACEMENT_PURCHASE"]["retry"]')|$(cj 'd["work"]["SUPPLIER_PURCHASE"]["retry"]')|$(cj 'd["work"]["SUPPLIER_PURCHASE_AUTHORISATION"]["retry"]')|$(crmpost "$SYS" '{"action":"AUTHORISE_SUPPLIER_PURCHASE","id":1,"staff":"Security Tester"}')|$(jget error)"

section "7. AUTOMATION IDEMPOTENCY AND RACES"
to_ready '{"sku":"keepsake-7-picture-disc","email":"race@example.com"}'; R=$OID; RREF=$(ref_of $R)
for i in 1 2 3 4; do founder_authorise $R LEWIS "$FOUNDER_CODE_LEWIS" > /tmp/race-$i.code & done; wait
t "the same founder authorisation submitted four times at once: one authorisation" "1|LEWIS" "$(evcount $R FULFILMENT.AUTHORISED)|$(q "SELECT supplier_purchase_authorised_by FROM order_production WHERE order_id=$R")"
for i in 1 2 3; do act $R RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-RACE-1","skus":["keepsake-7-picture-disc"],"actual_purchase_cost_minor":4000,"actual_shipping_cost_minor":1500,"send_email":false' > /dev/null & done; wait
t "the same partner order recorded three times at once: one record" "1" "$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$R AND supplier_order_reference='SO-RACE-1'")"
for i in 1 2 3; do decide $RREF keepsake-7-picture-disc S-K12 '{"note":"race"}' >/dev/null & done; wait
t "the same route decision submitted three times at once: exactly one is current" "1" "$(q "SELECT COUNT(*) FROM order_route_decisions WHERE order_id=$R AND status='CURRENT'")"
SH=$(actj $R ADD_SHIPMENT '{"skus":["keepsake-7-picture-disc"]}' >/dev/null; ship_id $R 1)
for i in 1 2 3; do P=$SH D=$TODAY actj $R MARK_SHIPMENT_DISPATCHED '{"shipment_id":int(E["P"]),"carrier":"Race Carrier","tracking_reference":"TRK-RACE","dispatched_on":E["D"],"send_email":True}' >/dev/null & done; wait
t "the same dispatch recorded three times at once: one dispatch event, one customer email" "1|1" "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$R AND event_type='SHIPMENT.PARCEL_DISPATCHED'")|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$R AND message_type IN ('DISPATCHED','ADDITIONAL_PARCEL_DISPATCHED') AND status='SENT'")"
t "a repeated partner order reference is refused afterwards too" "409|duplicate_supplier_order" "$(act $R RECORD_SUPPLIER_ORDER '"supplier_order_reference":"SO-RACE-1","skus":["keepsake-7-picture-disc"],"send_email":false')|$(jget error)"
paid_order '{"sku":"moment","email":"qc-race@example.com"}'; QR=$OID
act $QR START_CREATIVE >/dev/null; act $QR SEND_TO_QUALITY_CHECK >/dev/null
for i in 1 2 3; do act $QR PASS_QUALITY_CHECK "$QC_DIGITAL,\"reveal_url\":\"https://songs.example/qc-race\"" >/dev/null & done; wait
t "the same quality-check pass submitted three times at once: one decision" "1" "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$QR AND event_type='QUALITY_CHECK.PASSED'")"
TQ=$(status_link $QR)
help_req $TQ '{"kind":"QUESTION","description":"Double reply test."}' >/dev/null; CQ=$(jget case_id)
for i in 1 2; do care RESPOND $CQ '{"body":"Thank you, we are on it.","send_email":True}' >/dev/null & done; wait
t "a staff reply double-submitted: each reply is kept (none lost); the customer email per message is sent at most once" "True" "$(python3 -c 'import sys;m=int(sys.argv[1]);e=int(sys.argv[2]);print(m>=1 and e<=m)' "$(q "SELECT COUNT(*) FROM support_case_messages WHERE case_id=$CQ AND kind='MCB_RESPONSE'")" "$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$QR AND message_type='SUPPORT_RESPONSE' AND status='SENT'")")"
for i in 1 2; do case_msg $TQ $CQ "Same message twice" >/dev/null & done; wait
t "a customer message sent twice is recorded (never silently dropped)" "True" "$([ "$(q "SELECT COUNT(*) FROM support_case_messages WHERE case_id=$CQ AND kind='CUSTOMER_MESSAGE' AND body='Same message twice'")" -ge 1 ] && echo True || echo False)"
care REQUEST_REFUND_REVIEW $CQ '{"refund_type":"FULL","reason":"Race test."}' >/dev/null
t "a duplicate refund review is refused while one is open" "409|refund_review_open|1" "$(care REQUEST_REFUND_REVIEW $CQ '{"refund_type":"FULL","reason":"Again."}')|$(jget error)|$(q "SELECT COUNT(*) FROM refund_reviews WHERE case_id=$CQ")"
# The last Memory Music Video space, three checkouts at once.
PERIODID=$(q "SELECT id FROM video_capacity_periods ORDER BY id DESC LIMIT 1")
USED=$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIODID AND (status IN ('RESERVED','COMPLETED') OR (status='HELD' AND held_until>UTC_TIMESTAMP()))")
q "UPDATE video_capacity_periods SET capacity=$((USED+1)) WHERE id=$PERIODID" >/dev/null
for n in 1 2 3; do order "{\"sku\":\"moment\",\"email\":\"slot-$n@example.com\",\"video\":[1,1]}"; eval "S$n=$OID; ST$n=$TOK"; done
for n in 1 2 3; do eval "session \$S$n \$ST$n" > /tmp/slot-$n.code & done; wait
t "the last video space, three checkouts at once: exactly one holds it" "1" "$(q "SELECT COUNT(*) FROM video_capacity_reservations WHERE period_id=$PERIODID AND status='HELD' AND order_id IN ($S1,$S2,$S3)")"
WINNER=$(q "SELECT order_id FROM video_capacity_reservations WHERE period_id=$PERIODID AND status='HELD' AND order_id IN ($S1,$S2,$S3) LIMIT 1")
q "UPDATE video_capacity_reservations SET held_until = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_id=$WINNER" >/dev/null
for n in 1 2 3; do eval "[ \$S$n != $WINNER ] && { session \$S$n \$ST$n >/dev/null; break; }"; done
WTOT=$(q "SELECT total_minor FROM orders WHERE id=$WINNER")
hook "$(pay_event "evt_slot_late_$(openssl rand -hex 4)" "$(session_id_for $WINNER)" "$WINNER" "$WTOT" gbp)" >/dev/null
t "a payment after its hold lapsed never oversells and is never silent: paid, capacity exception, surfaced" "PAID|CAPACITY_EXCEPTION|1" "$(q "SELECT status FROM orders WHERE id=$WINNER")|$(q "SELECT status FROM video_entitlements WHERE order_id=$WINNER")|$(sysget failures; sysj failures 'sum(1 for c in d["checks"] if c["key"]=="VIDEO_STRANDED" for i in c["items"] if i["order_id"]=='"$WINNER"')')"

section "8. MONEY NEVER LEAVES MCB AUTOMATICALLY"
TR=$(status_link $R)
help_req $TR '{"kind":"DAMAGED_OR_FAULTY","item":"item-1","description":"The record arrived cracked."}' >/dev/null; CR=$(jget case_id)
care REQUEST_REFUND_REVIEW $CR '{"refund_type":"PARTIAL","amount_minor":1000,"reason":"Goodwill for the damage."}' >/dev/null; RF=$(jget refund_id)
F=$RF care SUBMIT_REFUND_FOR_DECISION $CR '{"refund_id":int(E["F"])}' >/dev/null
t "a refund decision without a founder code, or with the wrong one, is refused" "422|403|FOUNDER_DECISION_REQUIRED" "$(F=$RF care DECIDE_REFUND $CR '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"staff try","confirm":True}')|$(F=$RF care DECIDE_REFUND $CR '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"wrong code","founder":"BELLA","founder_code":"nope","confirm":True}')|$(q "SELECT status FROM refund_reviews WHERE id=$RF")"
STRIPE_BEFORE=$(stub_count)
t "Bella authorises it: recorded as authorised, not executed, and no payment-provider request is made" "200|AUTHORISED|false|0" "$(F=$RF C="$FOUNDER_CODE_BELLA" care DECIDE_REFUND $CR '{"refund_id":int(E["F"]),"decision":"AUTHORISE","note":"Agreed.","founder":"BELLA","founder_code":E["C"],"confirm":True}')|$(q "SELECT status FROM refund_reviews WHERE id=$RF")|$(jget refund_executed)|$(( $(stub_count) - STRIPE_BEFORE ))"
q "UPDATE refund_reviews SET decided_at = UTC_TIMESTAMP() - INTERVAL 15 DAY, updated_at = UTC_TIMESTAMP() - INTERVAL 15 DAY WHERE id=$RF" >/dev/null
t "  → an authorised refund not yet made is surfaced for a person, never retried" "True|DO_NOT_AUTO_RETRY|null" "$(sysget failures; sysj failures 'str([c["count"] for c in d["checks"] if c["key"]=="REFUND_AUTHORISED_NOT_RECORDED"][0] >= 1)')|$(sysj failures '[c["retry"] for c in d["checks"] if c["key"]=="REFUND_AUTHORISED_NOT_RECORDED"][0]')|$(sysj failures '[c["recovery_action"] for c in d["checks"] if c["key"]=="REFUND_AUTHORISED_NOT_RECORDED"][0]')"
t "a replacement is prepared and waits for a founder: nothing purchased, no partner order" "200|FOUNDER_APPROVAL_REQUIRED|false|1" "$(care PROPOSE_REMEDY $CR '{"type":"REPLACEMENT_REQUIRED","note":"Replace like for like."}')|$(jget remedy_status)|$(jget purchased)|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$R")"
t "no refund, payout, transfer or subscription request ever reached the payment provider" "0" "$(docker exec mcb-api sh -c 'grep -ciE "refund|payout|transfer|subscription" /tmp/stripe-stub.log 2>/dev/null || echo 0' | tail -1)"
t "every supplier purchase authorisation in this run names Bella or Lewis; every partner order a person recorded is authorised" "0|0" "$(q "SELECT COUNT(*) FROM order_events WHERE event_type='FULFILMENT.AUTHORISED' AND JSON_VALUE(detail,'$.founder') NOT IN ('BELLA','LEWIS')")|$(q "SELECT COUNT(*) FROM supplier_orders s JOIN order_production p ON p.order_id=s.order_id WHERE p.supplier_purchase_authorised_by IS NULL")"
tc "no automatic supplier checkout, refund or payout code exists (the permanent guard is tests/no-money-automation.test.mjs)" "$(! grep -rniE 'curl_init|file_get_contents\(.https?:' public/api/lib/routing.php public/api/lib/resilience.php public/api/crm/system.php public/api/crm/suppliers.php public/api/lib/customer-care.php public/api/lib/fulfilment-controller.php | grep -q . && echo 1 || echo 0)"

section "9. SUPPLIER ROUTING FAILURE: NEW SALES HELD, PAID ORDERS HONOURED"
with_config "unset(\$c['fulfilment']);"
tc "with no configuration the Founders' decision applies: new-sale safety REQUIRED, route freshness 30 days" "$(sysget readiness; [ "$(sysj readiness '[c["detail"] for c in d["configuration"] if c["key"]=="new_sale_safety"][0]' | cut -d' ' -f1)" = "REQUIRED" ] && sysj readiness '[c["detail"] for c in d["configuration"] if c["key"]=="route_freshness"][0]' | grep -q 'every 30 days' && echo 1 || echo 0)"
quote '[{"sku":"journey-6","quantity":1}]' GB
t "REQUIRED: a verified, costed, supported route with complete manufacturing data proceeds normally (Journey to GB)" "QUOTED|True" "$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')"
quote '[{"sku":"journey-6","quantity":1}]' US
t "REQUIRED: a destination the routes prove unsupported is held before payment" "UNAVAILABLE|MCB_CONFIRMS_DELIVERY|False" "$(qj 'd["delivery"]["status"]')|$(qj 'd["delivery"]["reason"]')|$(qj 'str(d["payable"])')"
# UNCERTAINTY IS NOT IMPOSSIBILITY (16 Sept). Evidence MCB has not finished
# recording no longer stops a customer paying; it stops the WORK on the paid
# order instead (POST_PAYMENT_VERIFICATION_REQUIRED). Only a known
# impossibility — an evidenced unsupported destination, or nothing to sell —
# blocks a payment.
quote '[{"sku":"keepsake-10-heart-picture-disc","quantity":1}]' GB
t "missing manufacturer data is uncertainty, so the customer may still pay" "QUOTED|True" "$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')"
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"lyrics-frame-10x15","quantity":1}]' GB
t "an unverified marketplace route is uncertainty, so the customer may still pay" "QUOTED|True" "$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')"
tc "  → and the customer still sees no partner, route, cost or reason code" "$(! grep -qiE 'S-FRAME-MKT|TEST PARTNER|marketplace|expected_purchase|unverified|dieline|allowance' /tmp/quote.json && echo 1 || echo 0)"
quote '[{"sku":"moment","quantity":1}]' GB
t "REQUIRED never blocks a digital Moment" "NOT_REQUIRED|True|1500" "$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')|$(qj 'd["total_minor"]')"
quote '[{"sku":"moment","quantity":1},{"sku":"memory-music-video","quantity":1}]' GB
t "REQUIRED never blocks a Memory Music Video (Moment + video £64)" "NOT_REQUIRED|True|6400" "$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')|$(qj 'd["total_minor"]')"
rm -f "$ROUTES"; settle
quote '[{"sku":"journey-6","quantity":1}]' GB
t "with no route data at all the customer may still pay; MCB verifies before it makes anything" "QUOTED|NOT_REQUIRED" "$(qj 'd["delivery"]["status"]')|$(quote '[{"sku":"moment","quantity":1}]' GB; qj 'd["delivery"]["status"]')"
t "  → the paid physical order from earlier is untouched: still paid, same total, not cancelled" "PAID|$(q "SELECT total_minor FROM orders WHERE id=$K")|0" "$(q "SELECT status FROM orders WHERE id=$K")|$(q "SELECT total_minor FROM orders WHERE id=$K")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$K AND event_type LIKE '%CANCEL%'")"
restore_config

section "10. POP-UP CARDS: THE FOUNDERS' 18, PRICED, NOTHING INVENTED"
t "18 catalogued cards at the authoritative prices" "18|4999:12,6999:1,1999:1,7999:3,12999:1" "$(cj 'len([s for s in d["skus"] if s.startswith("pop-up-card-")])' $CATALOGUE)|$(python3 -c 'import json,collections;c=json.load(open("'"$CATALOGUE"'"))["skus"];n=collections.Counter(v["price_minor"] for k,v in c.items() if k.startswith("pop-up-card-"));print(",".join(f"{p}:{n[p]}" for p in (4999,6999,1999,7999,12999)))')"
t "the public feed lists them as MCB products with no partner or route detail" "18|False" "$(python3 -c 'import json;f=json.load(open("public/catalogue.json"));print(sum(1 for p in f.get("products",[]) for v in p.get("variants",p.get("offers",[])) if str(v.get("sku","")).startswith("pop-up-card-")))' 2>/dev/null)|$(grep -qiE 'route_id|supplier|partner_group|verification' public/catalogue.json && echo True || echo False)"
quote '[{"sku":"moment","quantity":1},{"sku":"pop-up-card-wedding","quantity":2},{"sku":"pop-up-card-paper-flower-pack-8","quantity":1}]' GB
# PAYMENT FIRST (Founder correction, 16 Sept): MCB arranges card delivery
# itself and verifies after payment. Incomplete route evidence no longer stops
# the customer paying; nothing extra is charged for those pieces.
t "a card order totals correctly (£15 + 2 × £49.99 + £129.99) and can be paid" "24497|QUOTED|True" "$(qj 'd["subtotal_minor"]')|$(qj 'd["delivery"]["status"]')|$(qj 'str(d["payable"])')"
t "  → the cards are named as arranged by MCB, at no extra charge" "True|24497" "$(qj 'str(any("Pop-Up" in i for i in d["delivery"]["arranged_items"]))')|$(qj 'd["total_minor"]')"
tc "  → and the customer is still told no partner, listing or route" "$(! grep -qiE 'listing|marketplace|supplier|partner|route_id' /tmp/quote.json && echo 1 || echo 0)"
t "card product data is known; no card route is claimed verified" "MAPPED|0" "$(crm "$SUP?view=overview&staff=x" >/dev/null; cj 'd["catalogue"]["cards"]["status"]')|$(cj 'sum(1 for t in d["tiles"] if t["key"]=="routes_ready" for i in t["items"] if any("Pop-Up" in p or "—" in p for p in i["products"]))')"

section "11. THE £1,000 GRAMOPHONE: EVERY PIECE OF EVIDENCE BEFORE AUTHORISATION"
echo "$ROUTES_SEC" | write_routes
printf '%s' '{"currency":"GBP","pricing":{"PLAYER":"DESTINATION_CALCULATED"},"rates":[{"id":"T_UK","label":"UK delivery (test table)","countries":["GB"],"first_item_minor":400,"additional_item_minor":100},{"id":"T_UK_PLAYER","label":"Player delivery (test table)","countries":["GB"],"classes":["PLAYER"],"first_item_minor":1200,"additional_item_minor":900}]}' > "$RATES"; settle
to_ready '{"sku":"keepsake-7-picture-disc","players":[["antique-brass-gramophone",1]],"email":"gram@example.com"}'; GR=$OID; GRREF=$(ref_of $GR)
REQS() { docker exec mcb-api php -r 'require "/var/www/html/api/lib/bootstrap.php"; require "/var/www/html/api/lib/routing.php"; echo implode(",", array_column(route_authorisation_requirements(db(), (int) $argv[1])["unmet"], "requirement"));' $GR 2>/dev/null; }
t "before evidence: authorisation refused; cost, currency, availability, destination support and evidence all required" "409|CONFIRMED_DELIVERED_COST,AVAILABILITY_CONFIRMED,DESTINATION_SUPPORT_CONFIRMED,SUPPORTING_EVIDENCE" "$(founder_authorise $GR BELLA "$FOUNDER_CODE_BELLA")|$(REQS)"
t "availability without evidence is refused; cost alone is not enough" "422|200|409|AVAILABILITY_CONFIRMED,DESTINATION_SUPPORT_CONFIRMED" "$(decide $GRREF antique-brass-gramophone S-GRAMO '{"availability_confirmed":True}')|$(decide $GRREF antique-brass-gramophone S-GRAMO '{"confirmed_delivered_cost_minor":131000,"confirmed_delivered_currency":"GBP","delivered_cost_evidence":"Checkout total to GB (test)"}')|$(founder_authorise $GR BELLA "$FOUNDER_CODE_BELLA")|$(REQS)"
t "with everything evidenced by a person, Bella can authorise; nothing is bought by that" "200|200|BELLA|0" "$(decide $GRREF antique-brass-gramophone S-GRAMO '{"confirmed_delivered_cost_minor":131000,"confirmed_delivered_currency":"GBP","availability_confirmed":True,"destination_confirmed":True,"delivered_cost_evidence":"In stock; checkout total to the GB address; screenshot filed (test)"}')|$(founder_authorise $GR BELLA "$FOUNDER_CODE_BELLA")|$(q "SELECT supplier_purchase_authorised_by FROM order_production WHERE order_id=$GR")|$(q "SELECT COUNT(*) FROM supplier_orders WHERE order_id=$GR")"

section "12. THE DATABASE: COMPLETE MIGRATION CHAIN AND INTEGRITY"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
ROOTQ -e 'DROP DATABASE IF EXISTS chn; DROP DATABASE IF EXISTS frs; DROP DATABASE IF EXISTS prv; CREATE DATABASE chn; CREATE DATABASE frs; CREATE DATABASE prv;' 2>/dev/null
ROOTQ frs < db/schema.sql 2>/dev/null
git show bd890db9^:db/schema.sql | ROOTQ chn 2>/dev/null
ERR=0; for m in $(grep -v '^#' db/migrations/MANIFEST); do ROOTQ chn < "db/migrations/$m" 2>/dev/null || ERR=$((ERR+1)); done
t "the complete chain, in MANIFEST order, from the original CRM base schema equals a fresh schema.sql" "0|True" "$ERR|$([ "$(dumpdb chn | shasum)" = "$(dumpdb frs | shasum)" ] && echo True || echo False)"
ERR2=0; for m in $(grep -v '^#' db/migrations/MANIFEST); do ROOTQ chn < "db/migrations/$m" 2>/dev/null || ERR2=$((ERR2+1)); done
t "  → re-applying the whole chain is harmless (idempotent) and changes nothing" "0|True" "$ERR2|$([ "$(dumpdb chn | shasum)" = "$(dumpdb frs | shasum)" ] && echo True || echo False)"
t "the MANIFEST lists every migration exactly once, and filename order is NOT safe (it is documented)" "True|True" "$(python3 -c 'import os;m=[l.strip() for l in open("db/migrations/MANIFEST") if l.strip() and not l.startswith("#")];f=sorted(x for x in os.listdir("db/migrations") if x.endswith(".sql"));print(sorted(m)==f and len(set(m))==len(m))')|$(python3 -c 'import os;m=[l.strip() for l in open("db/migrations/MANIFEST") if l.strip() and not l.startswith("#")];print(m!=sorted(m))')"
git show d352dbe3:db/schema.sql | ROOTQ prv 2>/dev/null
ROOTQ prv < db/migrations/2026-09-17-resilience.sql 2>/dev/null; U1=$?
ROOTQ prv < db/migrations/2026-09-17-resilience.sql 2>/dev/null; U2=$?
t "upgrade from the previous accepted schema (d352dbe3) applies twice and equals a fresh schema" "0|0|True" "$U1|$U2|$([ "$(dumpdb prv | shasum)" = "$(dumpdb frs | shasum)" ] && echo True || echo False)"
tc "no migration drops, truncates or deletes data" "$(for m in db/migrations/*.sql; do sed 's/--.*$//' "$m"; done | grep -qiE '^\s*(DROP TABLE|TRUNCATE|DELETE FROM)\b' && echo 0 || echo 1)"
ROOTQ -e 'DROP DATABASE chn; DROP DATABASE frs; DROP DATABASE prv;' 2>/dev/null
crm crm/preflight >/dev/null
t "deployment preflight checks every expected table and column against the schema manifest" "PASS" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get("schema_complete","MISSING"))')"
q "ALTER TABLE order_route_decisions DROP COLUMN destination_confirmed" >/dev/null
crm crm/preflight >/dev/null
t "  → a missing column is caught and the migration that adds it is named" "FAIL|True" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}["schema_complete"])')|$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print("2026-09-17-resilience.sql" in {c["id"]:c["detail"] for c in d["checks"]}["schema_complete"])')"
q "ALTER TABLE order_route_decisions ADD COLUMN destination_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER availability_confirmed" >/dev/null
t "integrity: every order child table cascades from orders; duplicate partner references and uploads per memory are unique" "0|1|1" "$(q "SELECT COUNT(*) FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_name=k.constraint_name AND r.constraint_schema=k.constraint_schema WHERE k.table_schema=DATABASE() AND k.referenced_table_name='orders' AND r.delete_rule NOT IN ('CASCADE','RESTRICT','SET NULL')")|$(q "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='supplier_orders' AND index_name='uq_supplier_order_reference' AND seq_in_index=1")|$(q "SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='order_uploads' AND index_name='uq_order_uploads_memory'")"

section "13. READINESS, AUTOMATION AND FOUNDER ACTIONS: TRUTHFUL"
sysget readiness
t "configuration is classified: required for launch, optional, external verification, deferred" "True" "$(sysj readiness 'str({c["class"] for c in d["configuration"]}=={"REQUIRED_FOR_LAUNCH","OPTIONAL","EXTERNAL_VERIFICATION","DEFERRED"})')"
t "the TEST stack is truthfully not launch-ready: live payment key and unsafe test overrides are named" "TEST_ONLY|UNSAFE|UNSAFE|MISSING" "$(sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="stripe_secret_key"][0]')|$(sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="absent_delivery_use_test_fixtures"][0]')|$(sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="absent_stripe_api_base"][0]')|$(sysj readiness '[c["status"] for c in d["configuration"] if c["key"]=="site_origin"][0]')"
tc "no configuration value or secret ever appears in the system views" "$(for v in failures readiness automation founder-actions retry-policy; do crm "$SYS?view=$v&$SYSQ" >/dev/null; cat /tmp/tx.json; done | grep -qE 'test_crm_key_not_real|sk_test_stub|whsec_test|re_teststub|test_token_secret|test_ip_salt|test_notification_worker|\$2y\$10\$' && echo 0 || echo 1)"
tc "the failures view never claims ALL GOOD while launch configuration is missing" "$(sysget failures; [ "$(sysj failures 'd["status"]')" = "ATTENTION_NEEDED" ] && [ "$(sysj failures '[c["count"] for c in d["checks"] if c["key"]=="REQUIRED_CONFIGURATION_MISSING"][0]')" -ge 1 ] && echo 1 || echo 0)"
sysget automation
t "the automation matrix covers every required workflow with an allowed status" "19|True" "$(sysj automation 'len(d["workflows"])')|$(sysj automation 'str(all(w["status"] in d["statuses"] for w in d["workflows"]))')"
t "  → nothing is called automated because code exists: music generation is prepared (connection required); purchase and refund are founder decisions; payment is not live" "AUTOMATION_READY_CONNECTION_REQUIRED|FOUNDER_APPROVAL_REQUIRED|FOUNDER_APPROVAL_REQUIRED|FOUNDER_APPROVAL_REQUIRED|AUTOMATION_READY_CONNECTION_REQUIRED|AUTOMATION_READY_CONNECTION_REQUIRED" "$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Music generation"][0]')|$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Supplier purchase"][0]')|$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Refund"][0]')|$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Replacement"][0]')|$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Payment and order creation"][0]')|$(sysj automation '[w["status"] for w in d["workflows"] if w["workflow"]=="Founder notifications"][0]')"
tc "  → Mozart is shown exactly: founder selected, account not opened, integration pending, capabilities pending external verification" "$(sysj automation '[w["external"] for w in d["workflows"] if w["workflow"]=="Music generation"][0]' | grep -q 'FOUNDER SELECTED, ACCOUNT NOT OPENED, INTEGRATION PENDING, CAPABILITIES PENDING EXTERNAL VERIFICATION' && echo 1 || echo 0)"
sysget founder-actions
t "founder actions: four categories, with live counts (a pending authorisation and a refund decision appear)" "ONE_TIME_BEFORE_LAUNCH,PER_ORDER,ONLY_WHEN_EXCEPTION,PERIODIC_BUSINESS_REVIEW|True" "$(sysj founder-actions '",".join(c["category"] for c in d["categories"])')|$(sysj founder-actions 'str([i["count"] for c in d["categories"] if c["category"]=="PER_ORDER" for i in c["items"] if i["text"].startswith("Authorise supplier")][0] >= 1)')"
t "the system endpoint needs the key and a staff name; responses are no-store and noindex" "401|422|1|1" "$(code "$BASE/$SYS?view=failures")|$(crm "$SYS?view=failures")|$(has "$(curl -s -D - -o /dev/null "$BASE/$SYS?view=failures&$SYSQ" -H "Authorization: Bearer $CRMKEY")" 'cache-control: no-store')|$(has "$(curl -s -D - -o /dev/null "$BASE/$SYS?view=failures&$SYSQ" -H "Authorization: Bearer $CRMKEY")" 'x-robots-tag: noindex')"

section "14. OBSERVABILITY AND PRIVACY"
t "a recovery attempt leaves an audit event with who and what, never a secret or message body" "True|False" "$(q "SELECT COUNT(*) FROM order_events WHERE event_type='SYSTEM.RECOVERY_ATTEMPTED'" | awk '{print ($1>=1)?"True":"False"}')|$(q "SELECT GROUP_CONCAT(detail) FROM order_events WHERE event_type='SYSTEM.RECOVERY_ATTEMPTED'" | grep -qiE 'token|secret|@example|story' && echo True || echo False)"
tc "the PHP error log holds no key, founder code or customer story from this run" "$(docker exec mcb-api sh -c 'cat /var/log/apache2/error.log 2>/dev/null' | grep -qE 'test_crm_key_not_real|test-founder-(bella|lewis)-not-real|sk_test_stub|whsec_test|cracked|Double reply test' && echo 0 || echo 1)"
t "no Mozart, model or partner API call reached any stub; no refund was requested" "0|0" "$(docker exec mcb-api sh -c 'cat /tmp/stripe-stub.log /tmp/resend-stub.log 2>/dev/null' | grep -ciE 'mozart|openai|anthropic|suno' | tr -d ' ')|$(docker exec mcb-api sh -c 'cat /tmp/stripe-stub.log 2>/dev/null' | grep -ciE '/v1/refunds|"refund' | tr -d ' ')"

echo ""
echo "  PASSED: $PASS   FAILED: $FAIL"
[ "$FAIL" -gt 0 ] && { printf '  - %s\n' "${FAILED[@]}"; exit 1; }
exit 0
