#!/bin/bash
# MCB PRODUCTION FILE FACTORY (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# NO artwork or music provider exists or is called; art masters, print files
# and audio are synthetic fixtures. Supplier data is a TEST-ONLY file created
# and removed by this suite (never committed). Nothing is purchased.
#
# Covers: art vs print masters and their versions and lineage; visual QC;
# source-photo preparation; template-versioned render jobs; production file
# QC (dimensions, orientation, template, SKU, order, art master, safe zone,
# metadata); manufacturing package gates, versions and idempotency; capacity;
# supplier order pack (staff only); founder deep link and explicit
# authorisation; role upload limits; MP3 capability; privacy; no spending.

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

. tests/automation-helpers.sh

QC_DIGITAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true}'
QC_PHYSICAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true,"photographs":true,"artwork_dimensions":true,"production_files":true,"delivery_information":true}'
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
CAP=public/api/data/physical-capacity.json
SUP=public/api/data/supplier-orders.json
ROUTES=public/api/data/supplier-routes.json
trap 'restore_config; rm -f public/api/_test-config-base.php "$CAP" "$SUP" "$ROUTES"' EXIT

stub_reset
reset_limits

# ===========================================================================
section "0. ART IS NOT MANUFACTURING: THE SPECIFICATION"
t "sleeve front exactly 3756 × 3827, bleed 35 px, spine 35 px; back exactly 3756 × 3756" "3756x3827|35|35|3756x3756" "$(cj '"%dx%d|%d|%d|%dx%d"%(*[x for t in d["templates"] if t["id"]=="SLEEVE_12_FRONT" for x in (t["output_px"]["width"],t["output_px"]["height"],t["bleed"]["min"]["px"],t["spine_allowance"]["top"]["px"])], *[x for t in d["templates"] if t["id"]=="SLEEVE_12_BACK" for x in (t["output_px"]["width"],t["output_px"]["height"])])' $AJ)"
t "discs: 302 mm with a 7.23 mm hole and a 38.1 mm creative exclusion; 250 mm and 174 mm with holes not verified" "302|7.23|38.1|250|None|174|None" "$(cj '"|".join(str(x) for x in [[t for t in d["templates"] if t["id"]=="PICTURE_DISC_12"][0][k] for k in ("diameter_mm","centre_hole_mm")]+[[t for t in d["templates"] if t["id"]=="PICTURE_DISC_12"][0]["centre_creative_exclusion"]["diameter_mm"]]+[[t for t in d["templates"] if t["id"]==i][0][k] for i in ("PICTURE_DISC_10","PICTURE_DISC_7") for k in ("diameter_mm","centre_hole_mm")])' $AJ)"
t "Heart and double gatefold stay TEMPLATE_REQUIRED and require manufacturer data" "TEMPLATE_REQUIRED|1|TEMPLATE_REQUIRED|1" "$(cj '"|".join(str(x) for i in ("PICTURE_DISC_HEART","GATEFOLD_12_DOUBLE") for t in d["templates"] if t["id"]==i for x in (t["status"], len(t["manufacturing_data_required"])))' $AJ)"
tc "no safe zone is invented: every template is UNVERIFIED with no safe inset" "$(cj 'all(t["safe_zone_status"]=="UNVERIFIED" and t["safe_inset_mm"] is None for t in d["templates"])' $AJ | grep -q true && echo 1 || echo 0)"
t "the artwork provider is DEFERRED; only manual design and MCB internal are available" "DEFERRED|MANUAL_DESIGN,MCB_INTERNAL|MANUAL_EXTERNAL" "$(cj 'd["artwork_provider_decision_status"]' $AJ)|$(cj '",".join(d["art_creation_methods_available"])' $AJ)|$(cj '",".join(d["renderers_available"])' $AJ)"
t "file roles have their own limits (not one 10 MB cap)" "10485760|104857600|104857600|262144000|52428800" "$(cj '"|".join(str(d["file_role_limits"][r]) for r in ("CUSTOMER_SOURCE_PHOTO","CREATIVE_ART_MASTER","PRINT_PRODUCTION_MASTER","AUDIO_PRODUCTION_MASTER","CUSTOMER_LISTENING_COPY"))' $AJ)"
t "MP3 is a supported format whose duration cannot be inspected; WAV/FLAC/AIFF can" "True|NOT_AVAILABLE|HEADER|HEADER|HEADER" "$(cj 'str(d["audio_format_capabilities"]["MP3"]["format_supported"])+"|"+d["audio_format_capabilities"]["MP3"]["duration_inspection"]+"|"+"|".join(d["audio_format_capabilities"][k]["duration_inspection"] for k in ("WAV","FLAC","AIFF"))' public/api/data/creative.json)"
tc "no image-generation, music-generation or supplier API call exists in the production code" "$(grep -rniE 'curl_init|file_get_contents\(.https?:|openai|stability|midjourney|replicate|elevenlabs|mozart|fsockopen' public/api/lib/production-files.php public/api/crm/production-files.php public/api/crm/artwork.php | grep -q . && echo 0 || echo 1)"
tc "no supplier data file is committed" "$(git ls-files public/api/data | grep -q 'supplier-orders' && echo 0 || echo 1)"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS pfa; DROP DATABASE IF EXISTS pfb; CREATE DATABASE pfa; CREATE DATABASE pfb;' 2>/dev/null
ROOTQ pfa < db/schema.sql 2>/dev/null
git show 25c428e1:db/schema.sql | ROOTQ pfb 2>/dev/null
ROOTQ pfb < db/migrations/2026-09-15-production-file-factory.sql 2>/dev/null; P1=$?
ROOTQ pfb < db/migrations/2026-09-15-production-file-factory.sql 2>/dev/null; P2=$?
ROOTQ pfb < db/migrations/2026-09-15-fulfilment-controller.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the Production File Factory migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$P1" = 0 ] && [ "$P2" = 0 ] && [ "$(dumpdb pfa | shasum)" = "$(dumpdb pfb | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE pfa; DROP DATABASE pfb;' 2>/dev/null
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
t "preflight: migration applied; artwork provider deferred; production upload limits; supplier data not on file" "PASS|WARN|PASS|WARN" "$(pf production_file_factory_migration_applied)|$(pf artwork_provider_decision)|$(pf production_upload_limits)|$(pf supplier_order_data)"
t "PHP upload limits on the staff endpoints cover the audio production master role" "262144000|True" "$(crm "$PF?view=limits" >/dev/null; cj '[r["configured_bytes"] for r in d["roles"] if r["role"]=="AUDIO_PRODUCTION_MASTER"][0]')|$(cj 'str([r["effective_bytes"]==r["configured_bytes"] for r in d["roles"] if r["role"]=="AUDIO_PRODUCTION_MASTER"][0])')"

# ===========================================================================
section "1. HEART: AN ORDER TO TEST ISOLATION AND MANUFACTURING DATA"
reset_limits
paid_order '{"sku":"keepsake-10-heart-picture-disc","email":"pf-heart@example.com"}'
HO=$OID; HREF=$(ref_of $HO); HUNIT=$(unit_of $HO)
t "the Heart record gets an Artwork Creative Job and a SOURCE_READY photo record" "200|AWAITING_ART_MASTER|SOURCE_READY" "$(pfget $HO)|$(jget jobs.0.status)|$(jget image_preparation.0.status)"
HJOB=$(ajob_of $HO); HPHOTO=$(photos_of $HO)

# ===========================================================================
section "2. JOURNEY 6: CREATIVE ART MASTER, VISUAL QC, VERSIONS"
reset_limits
paid_order '{"sku":"journey-6","email":"pf-journey@example.com"}'
JO=$OID; JREF=$(ref_of $JO); JUNIT=$(unit_of $JO)
t "the production view needs the CRM key and a staff name" "401|422" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$PF?order_id=$JO&$STAFFQ")|$(crm "$PF?order_id=$JO")"
t "the Journey has one artwork job, its photograph SOURCE_READY, provider DEFERRED" "200|1|SOURCE_READY|DEFERRED" "$(pfget $JO)|$(cj 'len(d["jobs"])')|$(jget image_preparation.0.status)|$(jget artwork_provider_decision)"
cp /tmp/tx.json /tmp/pf-journey.json
tc "the artwork job input is minimal: reference, product, photo refs, facts, titles, brand rules, template context" "$(python3 -c 'import json;i=json.load(open("/tmp/pf-journey.json"))["jobs"][0]["input"];print(1 if set(i)>={"reference","product","photos","facts","track_titles","brand_rules","product_context","visual_direction","personalisation_version"} and [c["template_id"] for c in i["product_context"]]==["SLEEVE_12_FRONT","SLEEVE_12_BACK"] else 0)')"
tc "  → with no address, email, phone, payment data, costs or story text" "$(python3 -c 'import json;print(json.dumps(json.load(open("/tmp/pf-journey.json"))["jobs"][0]["input"]))' | grep -qiE 'pf-journey@|Harbour|Southampton|447000000456|stripe|cs_test|total|cost|margin|on deck|Unit 1, memory' && echo 0 || echo 1)"
JJOB=$(ajob_of $JO); JPHOTO=$(photos_of $JO)
t "an AI provider cannot create art while the decision is DEFERRED" "422|artwork_provider_deferred" "$(art $JO $JREF $JJOB $JPHOTO $FIX/artwork-3600x3600.png AI_PROVIDER)|$(jget error)"
t "another order's photograph cannot be used (cross-order)" "422|source_not_on_order" "$(art $JO $JREF $JJOB $HPHOTO $FIX/artwork-3600x3600.png)|$(jget error)"
t "a file that is not an image is refused" "422|art_master_unreadable" "$(art $JO $JREF $JJOB $JPHOTO tests/README.md)|$(jget error)"
t "a reference that is not this order's is refused" "422|order_mismatch" "$(art $JO $HREF $JJOB $JPHOTO $FIX/artwork-3600x3600.png)|$(jget error)"
t "Creative Art Master v1 (manual design) — independent of any template: any size" "200|1|VISUAL_QC_REQUIRED" "$(art $JO $JREF $JJOB $JPHOTO $FIX/artwork-3600x3500.png)|$(jget version)|$(jget status)"
ART1=$(jget art_master_id)
t "  → recorded with sources, personalisation version, file facts and hash" "$JPHOTO|1|3600|3500|64|MANUAL_DESIGN" "$(q "SELECT CONCAT_WS('|',source_upload_ids,personalisation_version,width,height,LENGTH(sha256),creation_method) FROM artwork_art_masters WHERE id=$ART1")"
FRONT=$(comp $JO SLEEVE_12_FRONT); BACK=$(comp $JO SLEEVE_12_BACK)
t "no print file can be registered before MCB's visual QC" "409|art_master_not_passed" "$(print_file $JO $FRONT $ART1 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget error)"
t "visual QC must mark every criterion" "422|visual_qc_incomplete" "$(vqc $JO $ART1 PASS '{"spelling":"PASS"}')|$(jget error)"
t "  → a concern cannot pass" "422|visual_qc_concern" "$(vqc $JO $ART1 PASS "$(echo "$VQC_ALL" | sed 's/"spelling":"PASS"/"spelling":"CONCERN"/')")|$(jget error)"
t "visual QC asks for rework (internal; the customer is not involved)" "200|REWORK_REQUIRED" "$(vqc $JO $ART1 REWORK "$(echo "$VQC_ALL" | sed 's/"crop_composition":"PASS"/"crop_composition":"CONCERN"/')")|$(q "SELECT status FROM artwork_creative_jobs WHERE id=$JJOB")"
t "Creative Art Master v2: a new version, v1 kept and no longer current" "200|2|1:0:REWORK,2:1:PENDING" "$(art $JO $JREF $JJOB $JPHOTO $FIX/artwork-3600x3600.png)|$(jget version)|$(q "SELECT GROUP_CONCAT(CONCAT(version,':',is_current,':',visual_qc_status) ORDER BY version) FROM artwork_art_masters WHERE job_id=$JJOB")"
ART2=$(jget art_master_id)
t "visual QC passes: one render job per component at the template's current version" "200|2|SLEEVE_12_BACK:1,SLEEVE_12_FRONT:1" "$(vqc $JO $ART2 PASS)|$(q "SELECT COUNT(*) FROM production_render_jobs WHERE art_master_id=$ART2")|$(q "SELECT GROUP_CONCAT(CONCAT(template_id,':',template_version) ORDER BY template_id) FROM production_render_jobs WHERE art_master_id=$ART2")"
t "  → the render job's output spec carries the exact geometry, and safe zone UNVERIFIED" "3756|3827|35|35|UNVERIFIED|None" "$(q "SELECT output_spec FROM production_render_jobs WHERE art_master_id=$ART2 AND template_id='SLEEVE_12_FRONT'" | python3 -c 'import json,sys;s=json.loads(sys.stdin.read());print("|".join(str(x) for x in (s["output_px"]["width"],s["output_px"]["height"],s["bleed"]["min"]["px"],s["spine_allowance"]["bottom"]["px"],s["safe_zone_status"],s["safe_inset_mm"])))')"
t "  → ARTWORK.CREATIVE_JOB_READY, CREATIVE_MASTER_READY ×2, VISUAL_QC_PASSED, PRODUCTION.RENDER_REQUIRED ×2" "1|2|1|2" "$(evcount $JO ARTWORK.CREATIVE_JOB_READY)|$(evcount $JO ARTWORK.CREATIVE_MASTER_READY)|$(evcount $JO ARTWORK.VISUAL_QC_PASSED)|$(evcount $JO PRODUCTION.RENDER_REQUIRED)"

section "3. PRINT PRODUCTION MASTERS: FILE QC, VERSIONS, LINEAGE"
act $JO START_CREATIVE >/dev/null
t "a front at the back's size is refused (dimensions and orientation)" "422|FAIL|FAIL" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3756.png -F safe_zone_reviewed=true)|$(jget checks.EXACT_DIMENSIONS)|$(jget checks.ORIENTATION)"
t "the wrong template is refused" "422|FAIL" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_BACK 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget checks.TEMPLATE_ID)"
t "the wrong template version is refused" "422|FAIL" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_FRONT 2 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget checks.TEMPLATE_VERSION)"
t "another order's reference is refused" "422|FAIL" "$(print_file $JO $FRONT $ART2 journey-6 $HREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget checks.ORDER_ASSOCIATION)"
t "the wrong product/SKU is refused" "422|FAIL" "$(print_file $JO $FRONT $ART2 journey-12 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget checks.SKU_ASSOCIATION)"
t "a superseded art master is refused as the source" "422|FAIL" "$(print_file $JO $FRONT $ART1 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget checks.ART_MASTER_ASSOCIATION)"
t "without MCB's manual safe-zone review (manufacturer safe zone UNVERIFIED) it is refused" "422|FAIL" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png)|$(jget checks.SAFE_ZONE)"
t "another order's component cannot be registered through this order" 404 "$(print_file $JO $(comp $HO PICTURE_DISC_HEART) $ART2 journey-6 $JREF PICTURE_DISC_HEART 1 $FIX/artwork-3600x3600.png -F safe_zone_reviewed=true)"
t "  → nothing was stored by any refusal; the render job shows the failure" "0|FILE_QC_FAILED" "$(q "SELECT COUNT(*) FROM print_production_masters WHERE order_id=$JO")|$(q "SELECT status FROM production_render_jobs WHERE art_master_id=$ART2 AND template_id='SLEEVE_12_FRONT'")"
t "the front at exactly 3756 × 3827 passes: print master v1" "200|1|PASS|PASS|PASS|MISSING_FROM_MANUFACTURER|MANUAL_REVIEW_PASSED" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget version)|$(jget checks.BLEED_METADATA)|$(jget checks.SPINE_METADATA)|$(jget checks.HASH)|$(jget checks.TRIM_METADATA)|$(jget checks.SAFE_ZONE)"
t "the back at exactly 3756 × 3756 passes" "200|1" "$(print_file $JO $BACK $ART2 journey-6 $JREF SLEEVE_12_BACK 1 $FIX/artwork-3756x3756.png -F safe_zone_reviewed=true)|$(jget version)"
PM1=$(q "SELECT id FROM print_production_masters WHERE artwork_id=$FRONT AND version=1")
t "a re-render of the front is print master v2; v1 is kept, not current, not deleted" "200|2|1:0,2:1" "$(print_file $JO $FRONT $ART2 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true)|$(jget version)|$(q "SELECT GROUP_CONCAT(CONCAT(version,':',is_current) ORDER BY version) FROM print_production_masters WHERE artwork_id=$FRONT")"
t "lineage: print master → render job → art master v2 → template id and version" "$ART2|SLEEVE_12_FRONT|1|$ART2" "$(q "SELECT CONCAT_WS('|',p.art_master_id,p.template_id,p.template_version,r.art_master_id) FROM print_production_masters p JOIN production_render_jobs r ON r.id=p.render_job_id WHERE p.artwork_id=$FRONT AND p.is_current=1")"
t "  → the art master itself was not changed by rendering" "1|PASS|3600|3600" "$(q "SELECT CONCAT_WS('|',is_current,visual_qc_status,width,height) FROM artwork_art_masters WHERE id=$ART2")"
t "production file download needs a staff name, is audited, and is never a public URL" "422|200|1|403" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$PF?print_master_id=$PM1&download=1" -H "Authorization: Bearer $CRMKEY")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$PF?print_master_id=$PM1&download=1&$STAFFQ" -H "Authorization: Bearer $CRMKEY")|$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$JO AND action='DOWNLOAD_PRINT_MASTER'")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/storage/")"
t "PRODUCTION.MASTER_READY and FILE_QC_PASSED once per print master" "3|3" "$(evcount $JO PRODUCTION.MASTER_READY)|$(evcount $JO PRODUCTION.FILE_QC_PASSED)"
with_config "\$c['uploads']['role_limits']['PRINT_PRODUCTION_MASTER']=1000;"
t "a print file over its role limit is refused (limits are per file role, never compression)" "413|upload_too_large_for_role" "$(print_file $JO $BACK $ART2 journey-6 $JREF SLEEVE_12_BACK 1 $FIX/artwork-3756x3756.png -F safe_zone_reviewed=true)|$(jget error)"
restore_config

section "4. MANUFACTURING PACKAGE: GATES AND VERSIONS"
t "a package now is NOT_READY: no audio masters, album QC, capacity or final QC" "200|NOT_READY|1" "$(build $JO)|$(jget status)|$(jget version)"
tc "  → every missing track is named" "$(python3 -c 'import json;b=json.load(open("/tmp/tx.json"))["blockers"];print(1 if all(any("TRACK_%d:AUDIO_MASTER_MISSING"%n in x for x in b) for n in range(1,7)) and "FINAL_MCB_QC_NOT_PASSED" in b and any("ALBUM_QC_NOT_PASSED" in x for x in b) else 0)')"
t "building again changes nothing (same content, same version, no duplicate event)" "1|1|1" "$(build $JO >/dev/null; jget version)|$(q "SELECT COUNT(*) FROM manufacturing_packages WHERE order_id=$JO")|$(evcount $JO MANUFACTURING.PACKAGE_REQUIRED)"
IFS=, read -r J1 J2 J3 J4 J5 J6 <<< "$(jobs_of $JO)"
complete_song $JO $JREF $J1 1 "Harbour lights at dawn when we first set sail together" "Every mile began with you"
complete_song $JO $JREF $J2 2 "Lisbon trams rattling up the hill while you laughed" "Climbing every street for love"
complete_song $JO $JREF $J3 3 "Cretan olive groves and the heat of that August noon" "Shade and wine and you"
complete_song $JO $JREF $J4 4 "Norwegian fjords so still the mountains mirrored twice" "Silent water holding us"
complete_song $JO $JREF $J5 5 "Caribbean rain drumming on the cabin roof at night" "Dancing in the storm"
t "with five of six songs mastered the package names only track 6" "NOT_READY|TRACK_6" "$(build $JO >/dev/null; jget status)|$(python3 -c 'import json;print(",".join(b.split(":")[1] for b in json.load(open("/tmp/tx.json"))["blockers"] if "AUDIO_MASTER_MISSING" in b))')"
complete_song $JO $JREF $J6 6 "Home again, the garden gate, the kettle on for two" "The best voyage is home"
JALBUM=$(q "SELECT id FROM creative_albums WHERE order_id=$JO")
cget $JO >/dev/null; cj 'd["albums"][0]["album_map"]["body"]' > /tmp/pf-map.json
B=$(OID=$JO ALBUM=$JALBUM js '{"action":"UPDATE_ALBUM_MAP","order_id":int(E["OID"]),"staff":"Production Tester","album_id":int(E["ALBUM"]),"album_map":dict(json.load(open("/tmp/pf-map.json")),album_title="Our Voyages")}')
t "the album gets its title (authored album map v2)" 200 "$(cpost "$B")"
t "album QC review passes; programme capacity is UNVERIFIED" "200|CAPACITY_UNVERIFIED" "$(cpost "$(OID=$JO ALBUM=$JALBUM js '{"action":"ALBUM_QC_REVIEW","order_id":int(E["OID"]),"staff":"Production Tester","album_id":int(E["ALBUM"]),"criteria":{"narrative_progression":"PASS","musical_cohesion":"PASS","deliberate_variation":"PASS"},"outcome":"PASS"}')")|$(q "SELECT capacity_status FROM creative_albums WHERE id=$JALBUM")"
t "the package still is not READY: unverified capacity and final QC" "NOT_READY" "$(build $JO >/dev/null; jget status)"
tc "  → CAPACITY_UNVERIFIED is a blocker, never an invented pass" "$(python3 -c 'import json;b=json.load(open("/tmp/tx.json"))["blockers"];print(1 if "CAPACITY_UNVERIFIED" in b and not any("AUDIO_MASTER_MISSING" in x or "ALBUM" in x or "PRODUCTION_FILE" in x or "VISUAL" in x for x in b) else 0)')"
SHAS=$(q "SELECT GROUP_CONCAT(CONCAT(sha256,duration_ms) ORDER BY id) FROM creative_masters WHERE order_id=$JO")
printf '%s' '{"profiles":[{"sku":"journey-6","verified_per_side_seconds":500,"version":1,"source":"TEST FIXTURE ONLY","last_verified_date":"2026-09-15"}]}' > "$CAP"
t "against a VERIFIED 500 s per side the 1,170 s programme overflows" "AUDIO_CAPACITY_EXCEPTION" "$(cpost "$(OID=$JO ALBUM=$JALBUM js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Production Tester","album_id":int(E["ALBUM"])}')" >/dev/null; jget capacity.status)"
tc "  → the package names the overflow and audio is untouched" "$(build $JO >/dev/null; python3 -c 'import json;b=json.load(open("/tmp/tx.json"))["blockers"];print(1 if any("AUDIO_CAPACITY_EXCEPTION" in x for x in b) else 0)')$([ "$(q "SELECT GROUP_CONCAT(CONCAT(sha256,duration_ms) ORDER BY id) FROM creative_masters WHERE order_id=$JO")" = "$SHAS" ] && echo '' || echo X)"
printf '%s' '{"profiles":[{"sku":"journey-6","verified_per_side_seconds":700,"version":2,"source":"TEST FIXTURE ONLY","last_verified_date":"2026-09-15"}]}' > "$CAP"
t "against a VERIFIED 700 s per side the programme passes" "CAPACITY_PASSED" "$(cpost "$(OID=$JO ALBUM=$JALBUM js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Production Tester","album_id":int(E["ALBUM"])}')" >/dev/null; jget capacity.status)"
t "a new art master (awaiting visual QC) blocks the package again: artwork QC gates manufacturing" "200|NOT_READY" "$(art $JO $JREF $JJOB $JPHOTO $FIX/artwork-3600x3600.png)|$(build $JO >/dev/null; jget status)"
ART3=$(q "SELECT id FROM artwork_art_masters WHERE job_id=$JJOB AND is_current=1")
tc "  → visual QC and both production files are named; earlier print files stay on record, not current" "$(python3 -c 'import json;b=json.load(open("/tmp/tx.json"))["blockers"];print(1 if any("ARTWORK_VISUAL_QC_NOT_PASSED" in x for x in b) and sum("PRODUCTION_FILE_NOT_READY" in x for x in b)==2 else 0)')$([ "$(q "SELECT COUNT(*) FROM print_production_masters WHERE order_id=$JO AND is_current=0")" = 3 ] && echo '' || echo X)"
vqc $JO $ART3 PASS >/dev/null
print_file $JO $FRONT $ART3 journey-6 $JREF SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png -F safe_zone_reviewed=true >/dev/null
print_file $JO $BACK $ART3 journey-6 $JREF SLEEVE_12_BACK 1 $FIX/artwork-3756x3756.png -F safe_zone_reviewed=true >/dev/null
t "  → re-rendered from art master v3: front v3, back v2" "3|2|$ART3" "$(q "SELECT version FROM print_production_masters WHERE artwork_id=$FRONT AND is_current=1")|$(q "SELECT version FROM print_production_masters WHERE artwork_id=$BACK AND is_current=1")|$(q "SELECT DISTINCT art_master_id FROM print_production_masters WHERE order_id=$JO AND is_current=1")"
printf '%s' '{"skus":{"journey-6":{"supplier":"TEST SUPPLIER ONLY","product_url":"https://supplier.example.test/journey-6","configuration":"12in black vinyl, printed sleeve","expected_cost_minor":4321,"shipping_allowance_minor":987,"currency":"GBP","destination_limitations":["TEST: none"],"order_notes":"TEST ONLY"}}}' > "$SUP"
with_config "\$c['creative']['enforcement']='REQUIRED';"
act $JO SEND_TO_QUALITY_CHECK >/dev/null
t "MCB's final quality check passes (REQUIRED mode): the package is READY and fulfilment is ready" "200|FULFILMENT.READY|READY" "$(act $JO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget state)|$(q "SELECT status FROM manufacturing_packages WHERE order_id=$JO AND status<>'SUPERSEDED'")"
PKG=$(q "SELECT id FROM manufacturing_packages WHERE order_id=$JO AND status='READY'")
q "SELECT body FROM manufacturing_packages WHERE id=$PKG" > /tmp/pf-package.json
tc "the package links 6 audio masters in order with titles and durations, two sides, the album title, both print masters with template versions, capacity and QC" "$(python3 -c 'import json;b=json.load(open("/tmp/pf-package.json"));r=b["records"][0];print(1 if [t["track"] for t in r["tracks"]]==[1,2,3,4,5,6] and all(t["audio_master_id"] and t["title"] and t["duration_seconds"]==195 for t in r["tracks"]) and len(r["sides"])==2 and r["album_title"]=="Our Voyages" and sorted((f["component"],f["template_version"],f["print_master_version"]) for f in r["artwork"]["files"])==[("SLEEVE_12_BACK",1,2),("SLEEVE_12_FRONT",1,3)] and r["capacity"]["status"]=="CAPACITY_PASSED" and b["final_mcb_qc"]["passed_at"] and r["audio_modified"] is False and b["blockers"]==[] else 0)')"
tc "  → it holds no supplier credentials, costs or delivery address" "$(grep -qiE 'password|api_key|token|cost|4321|Harbour|Southampton|TEST SUPPLIER' /tmp/pf-package.json && echo 0 || echo 1)"
t "MANUFACTURING.PACKAGE_REQUIRED and PACKAGE_READY recorded once" "1|1" "$(evcount $JO MANUFACTURING.PACKAGE_REQUIRED)|$(evcount $JO MANUFACTURING.PACKAGE_READY)"
build $JO >/dev/null; build $JO >/dev/null
t "repeated builds duplicate no package, event, supplier pack or notification" "READY|1|1|1" "$(jget status)|$(evcount $JO MANUFACTURING.PACKAGE_READY)|$(q "SELECT COUNT(*) FROM supplier_order_packs WHERE order_id=$JO")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$JO AND notification_type='FULFILMENT_APPROVAL_REQUIRED'")"

section "5. FOUNDER APPROVAL, SUPPLIER ORDER PACK, FINANCIAL CONTROL"
q "SELECT payload FROM founder_notifications WHERE order_id=$JO AND notification_type='FULFILMENT_APPROVAL_REQUIRED'" > /tmp/pf-np.json
tc "the founder notification: reference, product, payment VERIFIED, QC PASSED, package READY, action, deep link" "$(python3 -c 'import json,sys;p=json.load(open("/tmp/pf-np.json"));r=sys.argv[1];print(1 if p["reference"]==r and "Journey" in p["product"] and p["payment"]=="VERIFIED" and p["qc"]=="PASSED" and p["manufacturing_package"]=="READY" and p["required_action"] and p["action_url"]=="http://localhost:8080/operations#order=%s&action=AUTHORISE_SUPPLIER_PURCHASE"%r else 0)' "$JREF")"
tc "  → no story, photo, address, supplier, link or cost in it" "$(grep -qiE 'Harbour|Southampton|voyage|photo|supplier\.example|TEST SUPPLIER|4321|987|upload' /tmp/pf-np.json && echo 0 || echo 1)"
crm "crm/operations?order=$JO" >/dev/null
t "the protected deep-link page shows package READY and the supplier pack with link and costs (staff only)" "READY|TEST SUPPLIER ONLY|https://supplier.example.test/journey-6|4321|987" "$(jget operations.fulfilment.approval.manufacturing_package.status)|$(jget operations.fulfilment.approval.supplier_order_pack.lines.0.supplier)|$(jget operations.fulfilment.approval.supplier_order_pack.lines.0.product_url)|$(jget operations.fulfilment.approval.supplier_order_pack.lines.0.expected_cost_minor)|$(jget operations.fulfilment.approval.supplier_order_pack.lines.0.shipping_allowance_minor)"
pfget $JO >/dev/null
t "the supplier order pack carries files, audio, sides and the delivery details a person needs to order by hand" "PREPARED|2|6|Rec Ipient|ON_FILE" "$(jget supplier_order_pack.status)|$(cj 'len(d["supplier_order_pack"]["body"]["production_files"])')|$(cj 'len(d["supplier_order_pack"]["body"]["audio"])')|$(jget supplier_order_pack.body.delivery.recipient_name)|$(jget supplier_order_pack.body.lines.0.supplier_data_status)"
t "opening the page without signing in shows nothing; the pack is never public" "401|401" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/operations?order=$JO")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/$PF?order_id=$JO&$STAFFQ")"
act $JO ISSUE_STATUS_LINK >/dev/null; JP="{\"token\":\"$(link_token status)\"}"
tc "the customer's page, quote and public catalogue show no supplier, link, cost, package or production file" "$(post_json order-progress "$JP" >/dev/null; P1=$(cat /tmp/tx.json); post_json order-quote '{"lines":[{"sku":"journey-6","quantity":1}],"shippingCountryCode":"GB"}' >/dev/null; P2=$(cat /tmp/tx.json); echo "$P1 $P2 $(cat public/catalogue.json)" | grep -qiE 'TEST SUPPLIER|supplier\.example|4321|shipping_allowance|expected_cost|manufacturing_package|print_master|art_master' && echo 0 || echo 1)"
t "opening the deep link authorised nothing" "FULFILMENT.READY|NULL" "$(state_of $JO)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$JO")"
STRIPE_BEFORE=$(stub_count)
t "the supplier order cannot be recorded before Bella or Lewis authorises" "409|founder_authorisation_required" "$(act $JO CONFIRM_FULFILMENT)|$(jget error)"
t "a wrong founder code authorises nothing" 403 "$(founder_authorise $JO BELLA wrong-code-000000)"
t "in REQUIRED mode a destination the supplier data does not cover blocks the authorisation (Fulfilment Controller)" "409|destination_unknown|NULL" "$(founder_authorise $JO LEWIS "$FOUNDER_CODE_LEWIS")|$(jget error /tmp/fa.json)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$JO")"
cat > "$ROUTES" <<'JSON'
{"routes":[{"route_id":"TEST-ROUTE-J6","skus":["journey-6"],"supplier":"TEST SUPPLIER (synthetic)","product_url":"https://supplier.example/journey-6","configuration":"12-inch picture disc, gatefold","destinations":{"supported":["GB"],"check_required":[],"unsupported":[]},"shipping_model":"DESTINATION_CALCULATED","currency":"GBP","expected_purchase_cost_minor":4321,"internal_allowance":{"expected_supplier_shipping_minor":800},"verification_status":"VERIFIED","source":"synthetic test fixture","last_verified_date":"2026-09-15"}]}
JSON
settle
t "Lewis explicitly authorises the purchase" "200|FULFILMENT.AUTHORISED" "$(founder_authorise $JO LEWIS "$FOUNDER_CODE_LEWIS")|$(jget state /tmp/fa.json)"
t "only then is the supplier order recorded as placed by hand; the pack records who" "FULFILMENT.CONFIRMED|ORDER_PLACED|Ops Tester" "$(act $JO CONFIRM_FULFILMENT '"fulfilment_reference":"HAND-PF-1","send_email":false' >/dev/null; jget state)|$(q "SELECT status FROM supplier_order_packs WHERE order_id=$JO ORDER BY version DESC LIMIT 1")|$(q "SELECT placed_by FROM supplier_order_packs WHERE order_id=$JO ORDER BY version DESC LIMIT 1")"
tc "  → and nothing was bought, charged or sent to a supplier by code" "$([ "$(stub_count)" = "$STRIPE_BEFORE" ] && ! grep -rniE 'curl_init|stripe_request' public/api/lib/production-files.php public/api/crm/production-files.php && echo 1 || echo 0)"
restore_config

# ===========================================================================
section "6. HEART: MANUFACTURING DATA REQUIRED, NEVER A FAKE READY"
HA=$(comp $HO PICTURE_DISC_HEART)
art $HO $HREF $HJOB $HPHOTO $FIX/artwork-3600x3600.png >/dev/null; HART=$(jget art_master_id)
vqc $HO $HART PASS >/dev/null
t "a Heart print file needs the manual dieline confirmation" "422|manual_template_confirmation_required" "$(print_file $HO $HA $HART keepsake-10-heart-picture-disc $HREF PICTURE_DISC_HEART 1 $FIX/artwork-3600x3500.png -F safe_zone_reviewed=true)|$(jget error)"
t "with it, the manual print master records missing geometry as missing" "200|MISSING_FROM_MANUFACTURER|NOT_APPLICABLE" "$(print_file $HO $HA $HART keepsake-10-heart-picture-disc $HREF PICTURE_DISC_HEART 1 $FIX/artwork-3600x3500.png -F safe_zone_reviewed=true -F manual_template_confirmed=true)|$(jget checks.BLEED_METADATA)|$(jget checks.ORIENTATION)"
HJ=$(jobs_of $HO)
complete_song $HO $HREF $HJ 1 "Your heart on my sleeve and the sea air in your hair" "Always the heart of us"
printf '%s' '{"profiles":[{"sku":"keepsake-10-heart-picture-disc","verified_per_side_seconds":400,"version":1,"source":"TEST FIXTURE ONLY","last_verified_date":"2026-09-15"}]}' > "$CAP"
HALBUM=$(q "SELECT id FROM creative_albums WHERE order_id=$HO")
cpost "$(OID=$HO ALBUM=$HALBUM js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Production Tester","album_id":int(E["ALBUM"])}')" >/dev/null
act $HO START_CREATIVE >/dev/null; act $HO SEND_TO_QUALITY_CHECK >/dev/null
t "everything MCB controls is done; the Heart's final QC passes (advisory mode)" "200|CAPACITY_PASSED" "$(act $HO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(q "SELECT capacity_status FROM creative_albums WHERE id=$HALBUM")"
t "the package is MANUFACTURING_DATA_REQUIRED (the heart dieline), not READY" "MANUFACTURING_DATA_REQUIRED|MANUFACTURER_DATA:PICTURE_DISC_HEART:Manufacturer heart dieline / cut line, bleed and output size" "$(build $HO >/dev/null; jget status)|$(cj '",".join(d["blockers"])')"
t "  → MANUFACTURING.DATA_REQUIRED and one MANUFACTURING_DATA_REQUIRED notification for the Founders; no supplier pack" "1|1|MANUFACTURING_DATA_REQUIRED|0" "$(evcount $HO MANUFACTURING.DATA_REQUIRED)|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$HO AND notification_type='MANUFACTURING_DATA_REQUIRED'")|$(q "SELECT JSON_VALUE(payload,'$.reason') FROM founder_notifications WHERE order_id=$HO AND notification_type='MANUFACTURING_DATA_REQUIRED'")|$(q "SELECT COUNT(*) FROM supplier_order_packs WHERE order_id=$HO")"
t "  → surfaced as a production exception in the staff queue" 1 "$(queue_has "PRODUCTION:$HO:EXCEPTION")"
with_config "\$c['creative']['enforcement']='REQUIRED';"
t "in REQUIRED mode the founder cannot authorise a purchase with no READY package" "409|manufacturing_package_not_ready" "$(founder_authorise $HO BELLA "$FOUNDER_CODE_BELLA")|$(jget error /tmp/fa.json)"
restore_config

# ===========================================================================
section "7. SOURCE PREPARATION, MP3 CAPABILITY, PRIVACY"
reset_limits
order '{"sku":"keepsake-12-picture-disc","email":"pf-prep@example.com","manual_photos":true,"lines_override":[{"sku":"keepsake-12-picture-disc","quantity":1},{"sku":"artwork-preparation","quantity":1}]}'
PO=$OID; PTOK=$TOK
for slot in $(python3 -c 'import json;print(" ".join(s for s in json.load(open("/tmp/order.json"))["missing_uploads"] if s.startswith("memory:")))'); do upload $PO $PTOK $slot $FIX/photo-3000x2000.jpg >/dev/null; done
session $PO $PTOK >/dev/null; hook "$(pay_event "evt_pf_$(openssl rand -hex 6)" "$(session_id_for $PO)" "$PO" "$(q "SELECT total_minor FROM orders WHERE id=$PO")" gbp)" >/dev/null
PREF=$(ref_of $PO); pfget $PO >/dev/null
PPHOTO=$(photos_of $PO); PJOB=$(ajob_of $PO)
t "an unready photo with the £15 service is PREPARATION_REQUIRED" "PREPARATION_REQUIRED" "$(q "SELECT status FROM image_preparation_records WHERE upload_id=$PPHOTO")"
t "art cannot use it until it is prepared" "409|source_not_ready" "$(art $PO $PREF $PJOB $PPHOTO $FIX/artwork-3600x3600.png)|$(jget error)"
export PO PPHOTO
PREP_SKIP=$(js '{"action":"IMAGE_PREPARATION","order_id":int(E["PO"]),"staff":"P","upload_id":int(E["PPHOTO"]),"status":"PREPARED","notes":"x","identity_preserved":True}')
PREP_START=$(js '{"action":"IMAGE_PREPARATION","order_id":int(E["PO"]),"staff":"P","upload_id":int(E["PPHOTO"]),"status":"PREPARATION_IN_PROGRESS"}')
PREP_NOID=$(js '{"action":"IMAGE_PREPARATION","order_id":int(E["PO"]),"staff":"P","upload_id":int(E["PPHOTO"]),"status":"PREPARED","notes":"Cropped to square, colour balanced"}')
PREP_DONE=$(js '{"action":"IMAGE_PREPARATION","order_id":int(E["PO"]),"staff":"P","upload_id":int(E["PPHOTO"]),"status":"PREPARED","notes":"Cropped to square, colour balanced","identity_preserved":True}')
t "  → preparation cannot skip straight to prepared" 409 "$(pfpostj "$PREP_SKIP")"
pfpostj "$PREP_START" >/dev/null
t "  → prepared needs a note of what was done and confirmation identity was preserved" "422|identity_confirmation_required" "$(pfpostj "$PREP_NOID")|$(jget error)"
t "  → PREPARED, with the record of what was done" "200|PREPARED|Cropped to square, colour balanced|1" "$(pfpostj "$PREP_DONE")|$(q "SELECT status FROM image_preparation_records WHERE upload_id=$PPHOTO")|$(q "SELECT preparation_notes FROM image_preparation_records WHERE upload_id=$PPHOTO")|$(q "SELECT identity_preserved FROM image_preparation_records WHERE upload_id=$PPHOTO")"
t "  → then the art master can use it" 200 "$(art $PO $PREF $PJOB $PPHOTO $FIX/artwork-3600x3600.png)"
reset_limits
paid_order '{"sku":"moment","email":"pf-mp3@example.com"}'
MO=$OID; MREF=$(ref_of $MO); MJ=$(jobs_of $MO)
complete_song $MO $MREF $MJ 1 "A quiet song for a quiet morning by the sea" "Morning with you"
MID=$(q "SELECT id FROM creative_masters WHERE job_id=$MJ AND kind='PRODUCTION_MASTER'")
t "an MP3 customer listening copy is accepted (format supported; no verified duration needed)" "200|PASS" "$(curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/creative-file" -H "Authorization: Bearer $CRMKEY" -F action=REGISTER_DERIVED_MASTER -F "order_id=$MO" -F "reference=$MREF" -F "job_id=$MJ" -F "staff=Production Tester" -F kind=CUSTOMER_LISTENING_COPY -F "derived_from_master_id=$MID" -F "conversion_note=Engineer's MP3 export" -F "audio=@$FIX/audio-listening.mp3")|$(jget checks.SUPPORTED_TYPE)"
reset_limits
paid_order '{"sku":"moment","email":"pf-mp3b@example.com"}'
M2=$OID; M2REF=$(ref_of $M2); M2J=$(jobs_of $M2)
cpost "$(lyrics_body $M2 $M2J 1 "Another quiet song for another morning" "Mornings")" >/dev/null
cpost "$(OID=$M2 JOB=$M2J js '{"action":"LYRICS_REVIEW","order_id":int(E["OID"]),"staff":"Production Tester","job_id":int(E["JOB"]),"outcome":"PASS"}')" >/dev/null
t "an MP3 candidate is not called unsupported: its duration simply cannot be verified, so it cannot pass" "TECHNICAL_FAIL|PASS|FAIL|NOT_AVAILABLE|DURATION_INSPECTION_NOT_AVAILABLE_FOR_FORMAT" "$(cfile $M2 $M2REF $M2J $FIX/audio-listening.mp3 >/dev/null; jget outcome)|$(jget technical.checks.SUPPORTED_TYPE)|$(jget technical.checks.DURATION_READABLE)|$(jget technical.notes.duration_inspection_capability)|$(jget technical.notes.duration_check)"
tc "no customer approval, no spending and no provider in the production code" "$([ "$(act $JO REQUEST_APPROVAL >/dev/null; jget error)" = action_retired ] && ! grep -qiE 'approve_|stripe_request|refund|payout|subscription|curl_init' public/api/lib/production-files.php public/api/crm/production-files.php && echo 1 || echo 0)"
tc "production files live in private storage only" "$(grep -q "upload_directory()" public/api/lib/production-files.php && [ ! -d public/api/storage/production ] && echo 1 || echo 0)"
tc "automation events publish the production milestones" "$(crm 'crm/automation-events?limit=500' >/dev/null; python3 -c 'import json;n={e["event"] for e in json.load(open("/tmp/tx.json"))["order_events"]};print(1 if {"ARTWORK.CREATIVE_JOB_READY","ARTWORK.CREATIVE_MASTER_READY","ARTWORK.VISUAL_QC_REQUIRED","ARTWORK.VISUAL_QC_PASSED","PRODUCTION.RENDER_REQUIRED","PRODUCTION.MASTER_READY","PRODUCTION.FILE_QC_PASSED","MANUFACTURING.PACKAGE_REQUIRED","MANUFACTURING.PACKAGE_READY","MANUFACTURING.DATA_REQUIRED","FULFILMENT.READY"}<=n else 0)')"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
