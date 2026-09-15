#!/bin/bash
# MCB CREATIVE FACTORY CORE — provider-independent (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites.
# NO MUSIC PROVIDER EXISTS OR IS CALLED: generation is MANUAL with synthetic
# audio headers (tests/fixtures/audio-*.flac, a 1-second silent WAV). No
# request reaches Stripe, Resend, a supplier or any AI/music service.
#
# Covers: duration and capacity policies; one job per song, idempotent under
# payment replay; data minimisation; the versioned Fact Ledger and its
# classifications; album map before song briefs; lyric package and objective
# fact QC (wrong fact, contamination, duplication, coverage); Music Direction;
# the provider-neutral composition plan; the provider route (Mozart AI founder
# selected, integration pending: manual generation);
# immutable attempts, retry cap and exceptions; technical, fact and creative
# QC; masters, versions and lineage; album QC; vinyl programme QC against
# VERIFIED capacity only; gating MCB's quality check; metrics; privacy.

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

stub_reset
reset_limits

# ===========================================================================
section "0. POLICY: DURATION, CAPACITY AND PROVIDER (INTERNAL DATA)"
t "the MCB song target is 195 seconds (3:15)" 195 "$(cj 'd["duration"]["target_seconds"]' $CJ)"
t "the individual ceiling is 300 seconds (5:00) — a ceiling, not the default" "300|195" "$(cj 'd["duration"]["max_seconds"]' $CJ)|$(cj 'd["duration"]["target_seconds"]' $CJ)"
t "a four-song Keepsake's normal target programme is 780 seconds (not 1,200)" "780" "$(python3 -c 'import json;c=json.load(open("public/api/data/catalogue.json"));d=json.load(open("public/api/data/creative.json"));print(c["skus"]["keepsake-12-picture-disc"]["song_count"]*d["duration"]["target_seconds"])')"
tc "physical capacity is a separate policy, one profile per record SKU from the current catalogue" "$(python3 -c 'import json;c=json.load(open("public/api/data/catalogue.json"))["skus"];d=json.load(open("public/api/data/creative.json"))["capacity_profiles"];phys={k for k,v in c.items() if v.get("vinyl") and v.get("song_count")};print(1 if {p["sku"] for p in d}==phys and all(p["song_count"]==c[p["sku"]]["song_count"] for p in d) else 0)')"
t "  → track counts follow the catalogue (1, 3, 4, 6, 12) and sides follow disc count" "1,1,3,4,6,12|4" "$(cj '",".join(str(x) for x in sorted(p["song_count"] for p in d["capacity_profiles"]))' $CJ)|$(cj '[p["side_count"] for p in d["capacity_profiles"] if p["sku"]=="journey-12"][0]' $CJ)"
tc "every capacity is UNVERIFIED with no invented figures" "$(cj 'all(p["status"]=="UNVERIFIED" and p["verified_total_capacity_seconds"] is None and p["verified_per_side_seconds"] is None and p["hard_manufacturing_maximum_seconds"] is None and p["source"] is None for p in d["capacity_profiles"])' $CJ | grep -q true && echo 1 || echo 0)"
t "Mozart AI is founder selected with integration pending; still no candidate has a role or adapter" "FOUNDER_SELECTED|DISABLED,DISABLED|None" "$(cj 'd["provider_decision_status"]' $CJ)|$(cj '",".join(p["role"] for p in d["providers"] if p["kind"]=="CANDIDATE")' $CJ)|$(cj 'str([p["adapter"] for p in d["providers"] if p["kind"]=="CANDIDATE"][0])' $CJ)"
tc "  → every candidate capability is UNKNOWN (nothing assumed)" "$(cj 'all(v=="UNKNOWN" for p in d["providers"] if p["kind"]=="CANDIDATE" for v in p["capabilities"].values())' $CJ | grep -q true && echo 1 || echo 0)"
tc "no provider SDK, endpoint, key or format in the server code" "$(grep -rniE 'elevenlabs|eleven_music|mozart|api\.eleven|xi-api-key|curl_init|file_get_contents\(.https?:' public/api/lib/creative-*.php public/api/crm/creative*.php | grep -q . && echo 0 || echo 1)"
t "the internal policy file is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/creative.json")"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS cfa; DROP DATABASE IF EXISTS cfb; CREATE DATABASE cfa; CREATE DATABASE cfb;' 2>/dev/null
ROOTQ cfa < db/schema.sql 2>/dev/null
git show 478eb469:db/schema.sql | ROOTQ cfb 2>/dev/null
ROOTQ cfb < db/migrations/2026-09-15-creative-factory.sql 2>/dev/null; C1=$?
ROOTQ cfb < db/migrations/2026-09-15-creative-factory.sql 2>/dev/null; C2=$?
ROOTQ cfb < db/migrations/2026-09-15-production-file-factory.sql 2>/dev/null
ROOTQ cfb < db/migrations/2026-09-15-fulfilment-controller.sql 2>/dev/null
ROOTQ cfb < db/migrations/2026-09-15-memory-music-video.sql 2>/dev/null
ROOTQ cfb < db/migrations/2026-09-16-customer-care.sql 2>/dev/null
ROOTQ cfb < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the Creative Factory migration applies to the previous schema, twice, and equals a fresh schema" "$([ "$C1" = 0 ] && [ "$C2" = 0 ] && [ "$(dumpdb cfa | shasum)" = "$(dumpdb cfb | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE cfa; DROP DATABASE cfb;' 2>/dev/null
tc "  → it only creates tables" "$(grep -qE '^[[:space:]]*(DROP|DELETE|TRUNCATE|RENAME|UPDATE|ALTER) ' db/migrations/2026-09-15-creative-factory.sql && echo 0 || echo 1)"
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
t "preflight: migration applied; provider deferred, advisory enforcement and unverified capacity are warnings" "PASS|WARN|WARN|WARN|PASS" "$(pf creative_factory_migration_applied)|$(pf creative_provider_decision)|$(pf creative_factory_enforcement)|$(pf physical_capacity_verified)|$(pf data_creative)"

# ===========================================================================
section "1. A PAID MOMENT BECOMES EXACTLY ONE CREATIVE JOB"
STORY="Margaret laughing on the deck at sunset as the ship left Guernsey."
order "{\"sku\":\"moment\",\"email\":\"cf-moment@example.com\",\"units\":[{\"memories\":[{\"story\":\"$STORY\",\"about\":\"My wife\",\"occasion\":\"anniversary\"}]}]}"
MO=$OID; MTOK=$TOK
session $MO $MTOK >/dev/null
EVT="evt_cf_$(openssl rand -hex 6)"
t "verified payment" 200 "$(pay_with $MO $EVT)"
MREF=$(ref_of $MO)
t "one album and one creative job for the one song" "1|1|NOT_APPLICABLE|NOT_APPLICABLE" "$(q "SELECT COUNT(*) FROM creative_albums WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM creative_jobs WHERE order_id=$MO")|$(q "SELECT album_qc_status FROM creative_albums WHERE order_id=$MO")|$(q "SELECT capacity_status FROM creative_albums WHERE order_id=$MO")"
pay_with $MO $EVT >/dev/null
pay_with $MO "evt_cf_$(openssl rand -hex 6)" >/dev/null
t "the same payment delivered again, and under another event id, creates no second job" "1|1|1" "$(q "SELECT COUNT(*) FROM creative_jobs WHERE order_id=$MO")|$(evcount $MO CREATIVE.JOB_READY)|$(q "SELECT COUNT(*) FROM creative_artifacts WHERE order_id=$MO AND kind='FACT_LEDGER'")"
MJ=$(jobs_of $MO)
t "automation reaches LYRICS_REQUIRED on its own" "LYRICS_REQUIRED|LYRIC_AUTHOR" "$(jstatus $MJ)|$(q "SELECT waiting_on FROM creative_jobs WHERE id=$MJ")"
t "  → with FACT_LEDGER_READY, STORY_MAP_READY and LYRICS_REQUIRED once each" "1|1|1" "$(evcount $MO CREATIVE.FACT_LEDGER_READY)|$(evcount $MO CREATIVE.STORY_MAP_READY)|$(evcount $MO CREATIVE.LYRICS_REQUIRED)"
t "the creative console needs the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/creative?order_id=$MO&$STAFFQ")"
t "  → and a staff name, so every read of private material is audited" 422 "$(crm "crm/creative?order_id=$MO")"
t "  → the worker key cannot read it" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/creative?order_id=$MO&$STAFFQ" -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY")"
t "the staff view" 200 "$(cget $MO)"
cp /tmp/tx.json /tmp/cf-moment.json
tc "  → access logged" "$([ "$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$MO AND staff='Creative Tester' AND action='VIEW_ORDER'")" -ge 1 ] && echo 1 || echo 0)"
tc "  → data minimisation: no email, phone, address, payment identifier or amount anywhere in the factory data" "$(grep -qiE 'cf-moment@|447000000456|Harbour|Southampton|SO14|cs_test|pi_|evt_|total_minor|amount|stripe|Rec Ipient|Tx Customer' /tmp/cf-moment.json && echo 0 || echo 1)"
t "Fact Ledger v1: what the customer supplied, classified" "SEMANTIC|CRITICAL|CUSTOMER_SUPPLIED|RELATIONSHIP|SEMANTIC|CREATIVE_GUIDANCE" "$(cj '"|".join([[f for f in d["albums"][0]["fact_ledger"]["body"]["facts"] if f["id"]=="M1-STORY"][0][k] for k in ("classification","importance","verification")]+[[f for f in d["albums"][0]["fact_ledger"]["body"]["facts"] if f["id"]=="M1-ABOUT"][0]["type"],[f for f in d["albums"][0]["fact_ledger"]["body"]["facts"] if f["id"]=="M1-ABOUT"][0]["classification"],[f for f in d["albums"][0]["fact_ledger"]["body"]["facts"] if f["id"]=="M1-STYLE"][0]["classification"]])')"
tc "  → no EXACT fact is invented from the story" "$(cj 'any(f["classification"]=="EXACT" for f in d["albums"][0]["fact_ledger"]["body"]["facts"])' | grep -q false && echo 1 || echo 0)"
t "Music Direction: target 195, ceiling 300, MCB to decide the style the customer left to MCB" "195|300|MCB_TO_DECIDE" "$(cj 'd["jobs"][0]["music_direction"]["body"]["target_duration_seconds"]')|$(cj 'd["jobs"][0]["music_direction"]["body"]["max_duration_seconds"]')|$(cj 'd["jobs"][0]["music_direction"]["body"]["status"]')"
t "the story map is a skeleton allocated to this track, not pretend authored content" "SKELETON|M1-STORY" "$(cj 'd["jobs"][0]["story_map"]["body"]["status"]')|$(cj '",".join(d["jobs"][0]["story_map"]["body"]["important_memories"])')"
t "Mozart AI selected but not integrated: awaiting provider, manual generation available, never a PRIMARY" "FOUNDER_SELECTED|None|AWAITING_PROVIDER|MANUAL_GENERATION" "$(cj 'd["provider"]["decision"]')|$(cj 'str(d["provider"]["primary"])')|$(cj 'd["provider"]["route"]')|$(cj '",".join(d["provider"]["actions"])')"

section "2. FACT LEDGER VERSIONS AND LYRIC FACT QC"
MA=$(q "SELECT id FROM creative_albums WHERE order_id=$MO")
export OID=$MO ALBUM=$MA
cj 'd["albums"][0]["fact_ledger"]["body"]' /tmp/cf-moment.json > /tmp/ledger-v1.json
B=$(js '{"action":"UPDATE_FACT_LEDGER","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"fact_ledger":{"facts":[f for f in json.load(open("/tmp/ledger-v1.json"))["facts"] if f["id"]!="M1-ABOUT"]}}')
t "a revision cannot drop a customer-supplied fact" "422|invalid_document" "$(cpost "$B")|$(jget error)"
B=$(js '{"action":"UPDATE_FACT_LEDGER","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"fact_ledger":{"facts":json.load(open("/tmp/ledger-v1.json"))["facts"]+[{"id":"F-NAME-MARGARET","type":"NAME","value":"Margaret","accepted_forms":["Maggie"],"pronunciation":"MAR-gret","classification":"EXACT","importance":"CRITICAL","tracks":[1],"source":"STAFF:from memory 1","verification":"STAFF_VERIFIED"},{"id":"F-PLACE-GUERNSEY","type":"PLACE","value":"Guernsey","classification":"EXACT","importance":"HIGH","tracks":[1],"source":"STAFF:from memory 1","verification":"STAFF_VERIFIED"},{"id":"F-TYPE-WRONG","type":"PET","value":"x","classification":"EXACT","importance":"HIGH","tracks":[1],"source":"s","verification":"UNVERIFIED"}]}}')
t "an unknown fact type is refused" 422 "$(cpost "$B")"
B=$(js '{"action":"UPDATE_FACT_LEDGER","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"fact_ledger":{"facts":json.load(open("/tmp/ledger-v1.json"))["facts"]+[{"id":"F-NAME-MARGARET","type":"NAME","value":"Margaret","accepted_forms":["Maggie"],"pronunciation":"MAR-gret","classification":"EXACT","importance":"CRITICAL","tracks":[1],"source":"STAFF:from memory 1","verification":"STAFF_VERIFIED"},{"id":"F-PLACE-GUERNSEY","type":"PLACE","value":"Guernsey","classification":"EXACT","importance":"HIGH","tracks":[1],"source":"STAFF:from memory 1","verification":"STAFF_VERIFIED"}],"exclusions":["never again"]}}')
t "staff add EXACT facts: a new ledger version" "200|2" "$(cpost "$B")|$(jget version)"
t "  → version 1 is kept unchanged beside it" "2|1" "$(q "SELECT COUNT(*) FROM creative_artifacts WHERE scope_key='album:$MA' AND kind='FACT_LEDGER'")|$(q "SELECT COUNT(*) FROM creative_artifacts WHERE scope_key='album:$MA' AND kind='FACT_LEDGER' AND version=1 AND body NOT LIKE '%Margaret\"%EXACT%'")"
export JOB=$MJ
B=$(js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Sunset","sections":[{"type":"VERSE","text":"Margret laughing on the deck\nas the ship left Guernsey","fact_refs":["M1-STORY","F-NAME-MARGARET"]}]}}')
t "lyrics that misspell an EXACT name are refused by fact QC (not by substring luck)" "LYRICS_QC_FAILED|INCORRECT_EXACT_FACT|margret" "$(cpost "$B" >/dev/null; jget lyric_qc.status >/dev/null; jstatus $MJ)|$(cj '[c["id"] for c in d["lyric_qc"]["checks"] if c["result"]=="FAIL"][0]')|$(cj '[c.get("found") for c in d["lyric_qc"]["checks"] if c["id"]=="INCORRECT_EXACT_FACT"][0]')"
B=$(js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Sunset","sections":[{"type":"VERSE","text":"Maggie laughing on the deck as the ship left Guernsey","fact_refs":["F-NAME-MARGARET"]}]}}')
t "lyrics that do not use the allocated memory are refused" "ALLOCATED_MEMORY_NOT_REFERENCED" "$(cpost "$B" >/dev/null; cj '",".join(c["id"] for c in d["lyric_qc"]["checks"] if c["result"]=="FAIL")')"
B=$(js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Sunset","sections":[{"type":"VERSE","text":"Maggie laughing on the deck, never again apart","fact_refs":["M1-STORY"]}]}}')
t "a phrase the ledger excludes is refused" "PROHIBITED_PHRASE" "$(cpost "$B" >/dev/null; cj '",".join(c["id"] for c in d["lyric_qc"]["checks"] if c["result"]=="FAIL")')"
B=$(js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Sunset","sections":[{"type":"VERSE","text":"x","fact_refs":["M9-STORY"]}]}}')
t "a lyric package citing a fact not allocated to the track is invalid" "422|invalid_document" "$(cpost "$B")|$(jget error)"
LYR_OK=$(js '{"action":"SUBMIT_LYRICS","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"lyric_package":{"title":"Sunset over Guernsey","sections":[{"type":"INTRO","text":"","direction":"slow strings"},{"type":"VERSE","text":"Maggie laughing on the deck\nthe harbour lights behind us\nwe sailed away from Guernsey","fact_refs":["M1-STORY","F-NAME-MARGARET","F-PLACE-GUERNSEY"],"emotional_intention":"tender"},{"type":"CHORUS","text":"Hold my hand as the sun goes down\nMargaret you are my home","fact_refs":["F-NAME-MARGARET"]},{"type":"OUTRO","text":""}],"pronunciation_notes":[{"fact_id":"F-NAME-MARGARET","note":"MAR-gret"}]}}')
t "correct lyrics pass the objective checks and wait for a person's semantic review (no AI reviewer is connected)" "LYRICS_REVIEW_REQUIRED|DEFERRED|M1-STORY" "$(cpost "$LYR_OK" >/dev/null; jstatus $MJ)|$(cj 'd["lyric_qc"]["semantic"]["reviewer"]')|$(cj '[i for i in d["lyric_qc"]["semantic"]["items"] if i=="M1-STORY"][0]')"
t "  → three failed and one reviewed lyric versions are all kept" 4 "$(q "SELECT COUNT(*) FROM creative_artifacts WHERE scope_key='job:$MJ' AND kind='LYRIC_PACKAGE'")"
B=$(js '{"action":"LYRICS_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"outcome":"PASS"}')
t "the semantic review passes: the plan is derived and the song needs generation" "200|GENERATION_REQUIRED|AWAITING_PROVIDER" "$(cpost "$B")|$(jstatus $MJ)|$(q "SELECT waiting_on FROM creative_jobs WHERE id=$MJ")"
cget $MO >/dev/null; cp /tmp/tx.json /tmp/cf-moment2.json
t "the MCB composition plan: provider-neutral, sections totalling the 195-second target" "mcb.composition_plan.v1|195|195|4" "$(cj 'd["jobs"][0]["composition_plan"]["body"]["schema"]')|$(cj 'd["jobs"][0]["composition_plan"]["body"]["target_duration_seconds"]')|$(cj 'sum(s["target_seconds"] for s in d["jobs"][0]["composition_plan"]["body"]["sections"])')|$(cj 'len(d["jobs"][0]["composition_plan"]["body"]["sections"])')"
tc "  → fact-bearing sections are STRICT; no provider format, model, prompt or key in it" "$(cj '[s["adherence"] for s in d["jobs"][0]["composition_plan"]["body"]["sections"]][1]' | grep -q STRICT && ! cj 'd["jobs"][0]["composition_plan"]' | grep -qiE 'eleven|mozart|prompt|model_id|api_key|composition_plan_json' && echo 1 || echo 0)"
t "  → PLAN_READY and GENERATION_REQUIRED (provider founder selected, not integrated)" "1|FOUNDER_SELECTED" "$(evcount $MO CREATIVE.PLAN_READY)|$(q "SELECT JSON_VALUE(detail,'$.provider_decision') FROM order_events WHERE order_id=$MO AND event_type='CREATIVE.GENERATION_REQUIRED' ORDER BY id DESC LIMIT 1")"
t "  → the order is not failed while no provider exists" "PAID|CREATIVE.PENDING" "$(q "SELECT status FROM orders WHERE id=$MO")|$(state_of $MO)"
cj '{"target_duration_seconds":195,"max_duration_seconds":300,"sections":[{"index":1,"type":"VERSE","target_seconds":301,"lyric_section_index":2,"adherence":"STRICT","fact_refs":[]}]}' /tmp/cf-moment2.json > /tmp/plan-long.json
B=$(js '{"action":"SUBMIT_PLAN","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"composition_plan":json.load(open("/tmp/plan-long.json"))}')
t "a plan above the 300-second ceiling is refused" "422|invalid_document" "$(cpost "$B")|$(jget error)"
cj '{"target_duration_seconds":195,"max_duration_seconds":300,"sections":[{"index":1,"type":"VERSE","target_seconds":150,"lyric_section_index":2,"adherence":"STRICT","fact_refs":[]}]}' /tmp/cf-moment2.json > /tmp/plan-short.json
B=$(js '{"action":"SUBMIT_PLAN","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"composition_plan":json.load(open("/tmp/plan-short.json"))}')
t "a plan far from the target is refused" "422" "$(cpost "$B")"
B=$(js '{"action":"UPDATE_MUSIC_DIRECTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"music_direction":{"genre":"waltz","time_signature":"3/4","bpm_min":84,"bpm_max":92,"positive_directions":["in the style of a famous crooner"],"target_duration_seconds":195,"max_duration_seconds":300}}')
t "Music Direction refuses artist imitation (describe characteristics instead)" "422" "$(cpost "$B")"
B=$(js '{"action":"UPDATE_MUSIC_DIRECTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"music_direction":{"genre":"waltz","subgenre":"ballroom waltz","era_influence":"1950s","time_signature":"3/4","bpm_min":84,"bpm_max":92,"instrumentation":["strings","brushed drums","piano"],"vocal_presentation":"warm baritone","vocal_intensity":4,"mood":"tender","energy":3,"language":"English","positive_directions":["gentle rubato","lush string pads"],"negative_directions":["electronic drums"],"target_duration_seconds":195,"max_duration_seconds":300}}')
t "  → a waltz direction as musical characteristics is a new version" "200|2" "$(cpost "$B")|$(jget version)"

section "3. MANUAL GENERATION, IMMUTABLE ATTEMPTS AND THE RETRY CAP"
t "a file that is not audio: TECHNICAL_FAIL, the song goes back for generation" "200|TECHNICAL_FAIL|GENERATION_REQUIRED" "$(cfile $MO $MREF $MJ $FIX/audio-not-audio.bin)|$(jget outcome)|$(jstatus $MJ)"
t "a 301-second song breaks the 300-second ceiling" "TECHNICAL_FAIL|FAIL" "$(cfile $MO $MREF $MJ $FIX/audio-301s.flac >/dev/null; jget outcome)|$(jget technical.checks.DURATION_WITHIN_CEILING)"
t "a 22.05 kHz file fails the production sample rate: the third failure is a CREATIVE_EXCEPTION" "TECHNICAL_FAIL|EXCEPTION|RETRY_LIMIT_REACHED" "$(cfile $MO $MREF $MJ $FIX/audio-195s-22khz.flac >/dev/null; jget outcome)|$(jstatus $MJ)|$(q "SELECT exception_reason FROM creative_jobs WHERE id=$MJ")"
t "  → the Founders are told once, without lyrics or story" "1|RETRY_LIMIT_REACHED" "$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$MO AND notification_type='CREATIVE_EXCEPTION'")|$(q "SELECT JSON_VALUE(payload,'$.reason') FROM founder_notifications WHERE order_id=$MO AND notification_type='CREATIVE_EXCEPTION'")"
tc "  → payload holds no lyric, story or name" "$(q "SELECT payload FROM founder_notifications WHERE order_id=$MO AND notification_type='CREATIVE_EXCEPTION'" | grep -qiE 'maggie|margaret|guernsey|sunset|deck|laughing' && echo 0 || echo 1)"
t "a fourth attempt is refused: no unlimited generation loop" "409|retry_limit_reached|3" "$(cfile $MO $MREF $MJ $FIX/audio-195s.flac)|$(jget error)|$(q "SELECT COUNT(*) FROM creative_generation_attempts WHERE job_id=$MJ")"
t "every failed attempt is its own unchanged row, with the versions it used" "1:TECHNICAL_FAIL,2:TECHNICAL_FAIL,3:TECHNICAL_FAIL|manual|4|3" "$(q "SELECT GROUP_CONCAT(CONCAT(attempt_number,':',status) ORDER BY attempt_number) FROM creative_generation_attempts WHERE job_id=$MJ")|$(q "SELECT DISTINCT provider_id FROM creative_generation_attempts WHERE job_id=$MJ")|$(q "SELECT MAX(lyric_version) FROM creative_generation_attempts WHERE job_id=$MJ")|$(q "SELECT COUNT(*) FROM creative_candidates WHERE job_id=$MJ")"
B=$(js '{"action":"RESOLVE_EXCEPTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"resolution":"AUTHORISE_ONE_MORE_ATTEMPT"}')
t "resolving an exception needs a note" 409 "$(cpost "$B")"
B=$(js '{"action":"RESOLVE_EXCEPTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"resolution":"AUTHORISE_ONE_MORE_ATTEMPT","note":"Fixture files were wrong; one more manual attempt."}')
t "a person authorises exactly one more attempt" "200|GENERATION_REQUIRED|4" "$(cpost "$B")|$(jstatus $MJ)|$(cget $MO >/dev/null; cj 'd["jobs"][0]["attempt_allowance"]["allowed"]')"
t "a shorter 180-second song passes technical QC, but what was sung misspells the name: FACT_FAIL" "FACT_FAIL|PASS|-15|INCORRECT_EXACT_FACT" "$(cfile $MO $MREF $MJ $FIX/audio-180s.flac -F 'transcript=Margret laughing on the deck we sailed away from Guernsey' >/dev/null; jget outcome)|$(jget technical.status)|$(jget technical.notes.deviation_from_target_seconds)|$(cj '",".join(sorted(set(c["id"] for c in d["fact"]["checks"] if c["result"]=="FAIL")))')"
cpost "$(js '{"action":"RESOLVE_EXCEPTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"resolution":"AUTHORISE_ONE_MORE_ATTEMPT","note":"Transcript error; retry."}')" >/dev/null
t "a claimed attempt number that does not match is refused as a stale registration" "TECHNICAL_FAIL|FAIL" "$(cfile $MO $MREF $MJ $FIX/audio-195s.flac -F attempt_number=2 >/dev/null; jget outcome)|$(jget technical.checks.ATTEMPT_MATCH)"
cpost "$(js '{"action":"RESOLVE_EXCEPTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"resolution":"AUTHORISE_ONE_MORE_ATTEMPT","note":"Stale form; retry."}')" >/dev/null
t "a candidate under another order's reference fails ORDER_MATCH" "TECHNICAL_FAIL|FAIL" "$(cfile $MO MCB-2026-999999 $MJ $FIX/audio-195s.flac >/dev/null; jget outcome)|$(jget technical.checks.ORDER_MATCH)"
cpost "$(js '{"action":"RESOLVE_EXCEPTION","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"resolution":"AUTHORISE_ONE_MORE_ATTEMPT","note":"Wrong reference; retry."}')" >/dev/null
t "a correct 195-second candidate passes technical and fact QC and needs Creative QC" "CREATIVE_QC_REQUIRED|PASS|PASS" "$(cfile $MO $MREF $MJ $FIX/audio-195s.flac >/dev/null; jget outcome)|$(jget technical.status)|$(jget fact.status)"
CID=$(q "SELECT MAX(id) FROM creative_candidates WHERE job_id=$MJ"); export CID
t "  → seven attempts on record; earlier outcomes unchanged" "7|TECHNICAL_FAIL|FACT_FAIL" "$(q "SELECT COUNT(*) FROM creative_generation_attempts WHERE job_id=$MJ")|$(q "SELECT status FROM creative_generation_attempts WHERE job_id=$MJ AND attempt_number=1")|$(q "SELECT status FROM creative_generation_attempts WHERE job_id=$MJ AND attempt_number=4")"
t "a master cannot be made before Creative QC" "409|master_requires_all_qc" "$(cpost "$(js '{"action":"PROMOTE_MASTER","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"])}')")|$(jget error)"
t "Creative QC must mark every criterion" "422|creative_qc_incomplete" "$(cpost "$(js '{"action":"CREATIVE_QC","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"]),"criteria":{"emotional_impact":"PASS"},"outcome":"PASS"}')")|$(jget error)"
export C="$CRITERIA"
t "  → a concern cannot pass" "422|creative_qc_concern" "$(cpost "$(js '{"action":"CREATIVE_QC","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"]),"criteria":dict(json.loads(E["C"]),pronunciation="CONCERN"),"outcome":"PASS"}')")|$(jget error)"
t "Creative QC passes (internal: the customer approves nothing)" "PASS|MASTER_REQUIRED" "$(cpost "$(js '{"action":"CREATIVE_QC","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"]),"criteria":json.loads(E["C"]),"outcome":"PASS"}')" >/dev/null; jget outcome)|$(jstatus $MJ)"
t "the production master: version 1, current, with QC evidence and the versions it came from" "200|MASTER_READY|1|1|4|CANDIDATE_FILE_UNCHANGED" "$(cpost "$(js '{"action":"PROMOTE_MASTER","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"])}')")|$(jstatus $MJ)|$(q "SELECT version FROM creative_masters WHERE job_id=$MJ AND kind='PRODUCTION_MASTER'")|$(q "SELECT is_current FROM creative_masters WHERE job_id=$MJ AND kind='PRODUCTION_MASTER'")|$(q "SELECT JSON_VALUE(qc_evidence,'$.versions.lyrics') FROM creative_masters WHERE job_id=$MJ")|$(q "SELECT JSON_VALUE(qc_evidence,'$.provenance') FROM creative_masters WHERE job_id=$MJ")"
t "  → promoting again never overwrites it" "409|1" "$(cpost "$(js '{"action":"PROMOTE_MASTER","order_id":int(E["OID"]),"staff":"Creative Tester","candidate_id":int(E["CID"])}')")|$(q "SELECT COUNT(*) FROM creative_masters WHERE job_id=$MJ")"
MID=$(q "SELECT id FROM creative_masters WHERE job_id=$MJ")
derive() { curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/creative-file" -H "Authorization: Bearer $CRMKEY" -F action=REGISTER_DERIVED_MASTER -F "order_id=$1" -F "reference=$2" -F "job_id=$3" -F "staff=Creative Tester" -F "kind=$4" -F "derived_from_master_id=$5" -F "conversion_note=$6" -F "audio=@$7"; }
t "a customer listening copy is registered with lineage (MCB transcodes nothing)" "200|CUSTOMER_LISTENING_COPY" "$(derive $MO $MREF $MJ CUSTOMER_LISTENING_COPY $MID 'Exported by the engineer from the production master' $FIX/audio-1s.wav)|$(jget kind)"
derive $MO $MREF $MJ CUSTOMER_LISTENING_COPY $MID 'Re-export with corrected fade' $FIX/audio-1s.wav >/dev/null
t "  → a second copy is version 2; version 1 is kept, not current" "1:0,2:1|$MID|false" "$(q "SELECT GROUP_CONCAT(CONCAT(version,':',is_current) ORDER BY version) FROM creative_masters WHERE job_id=$MJ AND kind='CUSTOMER_LISTENING_COPY'")|$(q "SELECT DISTINCT derived_from_master_id FROM creative_masters WHERE job_id=$MJ AND kind='CUSTOMER_LISTENING_COPY'")|$(q "SELECT JSON_EXTRACT(qc_evidence,'$.transcoded_by_mcb') FROM creative_masters WHERE job_id=$MJ AND kind='CUSTOMER_LISTENING_COPY' AND version=1")"
t "  → the production master is unchanged" "1|1|$(q "SELECT sha256 FROM creative_candidates WHERE id=$CID")" "$(q "SELECT COUNT(*) FROM creative_masters WHERE job_id=$MJ AND kind='PRODUCTION_MASTER'")|$(q "SELECT is_current FROM creative_masters WHERE id=$MID")|$(q "SELECT sha256 FROM creative_masters WHERE id=$MID")"
t "a derived file must name this song's production master" 404 "$(derive $MO $MREF $MJ PHYSICAL_MEDIA_MASTER 999999 'x' $FIX/audio-1s.wav)"
t "downloading a master needs a staff name and is audited" "422|200|1" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/creative-file?master_id=$MID" -H "Authorization: Bearer $CRMKEY")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/creative-file?master_id=$MID&$STAFFQ" -H "Authorization: Bearer $CRMKEY")|$(q "SELECT COUNT(*) FROM creative_access_log WHERE order_id=$MO AND action='DOWNLOAD_MASTER'")"
act $MO START_CREATIVE >/dev/null; act $MO SEND_TO_QUALITY_CHECK >/dev/null
t "MCB's existing quality check and reveal follow the master (no customer approval)" "200|COMPLETED|null" "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/cf"')|$(jget state)|$(jget warning)"
act $MO ISSUE_STATUS_LINK >/dev/null; PROG="{\"token\":\"$(link_token status)\"}"
tc "the customer's page shows none of the factory: no ledger, lyrics, QC, attempts or masters" "$(post_json order-progress "$PROG" >/dev/null; grep -qiE 'ledger|lyric|fact|attempt|master|candidate|qc|margret|creative_' /tmp/tx.json && echo 0 || echo 1)"
t "each Creative Factory milestone is recorded once per candidate or master (two candidates passed technical QC)" "2|1|1|1|1" "$(evcount $MO CREATIVE.TECHNICAL_QC_PASSED)|$(evcount $MO CREATIVE.FACT_QC_PASSED)|$(evcount $MO CREATIVE.CREATIVE_QC_REQUIRED)|$(evcount $MO CREATIVE.CREATIVE_QC_PASSED)|$(evcount $MO CREATIVE.MASTER_READY)"
tc "  → no lyric, story or name in any order event" "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND (detail LIKE '%Maggie%' OR detail LIKE '%Margaret%' OR detail LIKE '%Guernsey%' OR detail LIKE '%deck%')" | grep -q '^0$' && echo 1 || echo 0)"

# ===========================================================================
section "4. A FOUR-SONG KEEPSAKE: ALBUM FIRST, ALBUM QC, VINYL PROGRAMME QC"
reset_limits
paid_order '{"sku":"keepsake-12-picture-disc","email":"cf-keepsake@example.com","units":[{"memories":[{"story":"Our first dance at the Palm Court.","style":"Waltz"},{"story":"The storm over Lisbon harbour."},{"story":"Teaching Tom to swim in Crete."},{"story":"Forty years on the same old porch."}]}]}'
KO=$OID; KREF=$(ref_of $KO); KA=$(q "SELECT id FROM creative_albums WHERE order_id=$KO")
t "one album of four tracks with a 780-second target programme, and four jobs" "4|780|4|1,2,3,4" "$(q "SELECT track_count FROM creative_albums WHERE id=$KA")|$(q "SELECT target_programme_seconds FROM creative_albums WHERE id=$KA")|$(q "SELECT COUNT(*) FROM creative_jobs WHERE order_id=$KO")|$(q "SELECT GROUP_CONCAT(track_number ORDER BY track_number) FROM creative_jobs WHERE order_id=$KO")"
t "the album map is created before any song brief" "1" "$(q "SELECT (SELECT MIN(id) FROM creative_artifacts WHERE scope_key='album:$KA' AND kind='ALBUM_MAP') < (SELECT MIN(id) FROM creative_artifacts WHERE order_id=$KO AND kind='STORY_MAP')")"
cget $KO >/dev/null; cp /tmp/tx.json /tmp/cf-keepsake.json
tc "  → each track takes its own memory and only its own facts; roles opening … closing; 195 s each" "$(python3 -c 'import json;d=json.load(open("/tmp/cf-keepsake.json"));m=d["albums"][0]["album_map"]["body"]["tracks"];print(1 if [t["narrative_role"] for t in m]==["OPENING","CHAPTER","CHAPTER","CLOSING"] and all(all(f.startswith("M%d-"%t["track_number"]) for f in t["allocated_fact_ids"]) for t in m) and all(t["target_duration_seconds"]==195 for t in m) else 0)')"
t "capacity is PENDING, and the profile is UNVERIFIED with no figures" "PENDING|UNVERIFIED|None|2" "$(cj 'd["albums"][0]["capacity"]["status"]' /tmp/cf-keepsake.json)|$(cj 'd["albums"][0]["capacity"]["profile"]["status"]' /tmp/cf-keepsake.json)|$(cj 'str(d["albums"][0]["capacity"]["profile"]["verified_per_side_seconds"])' /tmp/cf-keepsake.json)|$(cj 'd["albums"][0]["capacity"]["profile"]["side_count"]' /tmp/cf-keepsake.json)"
t "a customer's Waltz style becomes waltz characteristics (3/4), not an artist" "waltz|3/4|DERIVED_FROM_CUSTOMER_STYLE" "$(cj 'd["jobs"][0]["music_direction"]["body"]["genre"]' /tmp/cf-keepsake.json)|$(cj 'd["jobs"][0]["music_direction"]["body"]["time_signature"]' /tmp/cf-keepsake.json)|$(cj 'd["jobs"][0]["music_direction"]["body"]["status"]' /tmp/cf-keepsake.json)"
IFS=, read -r K1 K2 K3 K4 <<< "$(jobs_of $KO)"
complete_song $KO $KREF $K1 1 "Palm Court lanterns glowing slow, your hand in mine" "Round and round the ballroom floor we go"
t "track 1 mastered" MASTER_READY "$(jstatus $K1)"
cpost "$(lyrics_body $KO $K2 2 "Palm Court lanterns glowing slow, your hand in mine" "Round and round the ballroom floor we go")" >/dev/null
t "track 2 lyrics duplicating track 1 are refused" "LYRICS_QC_FAILED|DUPLICATED_LYRICS" "$(jstatus $K2)|$(cj '",".join(c["id"] for c in d["lyric_qc"]["checks"] if c["result"]=="FAIL")')"
cpost "$(lyrics_body $KO $K3 3 "Tom was splashing Margaret in the Cretan sea" "Swim to me my brave little boy")" >/dev/null
t "track 3 lyrics carrying another customer's exact name are refused (contamination)" "LYRICS_QC_FAILED|WRONG_CUSTOMER_CONTAMINATION" "$(jstatus $K3)|$(cj '",".join(c["id"] for c in d["lyric_qc"]["checks"] if c["result"]=="FAIL")')"
complete_song $KO $KREF $K2 2 "Lisbon thunder rolling over the harbour wall tonight" "We held on through the storm"
complete_song $KO $KREF $K3 3 "Crete in August, little Tom kicking at the waves" "Swim to me my brave little boy"
t "three of four songs mastered: the album waits" "PENDING|WAITING_FOR_MASTERS" "$(q "SELECT album_qc_status FROM creative_albums WHERE id=$KA")|$(jget album.status)"
export OID=$KO ALBUM=$KA
t "  → album review and capacity check are refused with a track missing" "409|409" "$(cpost "$(js '{"action":"ALBUM_QC_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"criteria":{"narrative_progression":"PASS","musical_cohesion":"PASS","deliberate_variation":"PASS"},"outcome":"PASS"}')")|$(cpost "$(js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"])}')")"
with_config "\$c['creative']['enforcement']='REQUIRED';"
register_artwork $KO; act $KO START_CREATIVE >/dev/null; act $KO SEND_TO_QUALITY_CHECK >/dev/null
t "with enforcement REQUIRED, MCB's quality check refuses an unfinished album" "409|creative_not_ready" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
tc "  → naming the missing master, album QC and capacity" "$(body | grep -q 'track 4 not mastered' && body | grep -qi 'album qc' && echo 1 || echo 0)"
restore_config
complete_song $KO $KREF $K4 4 "Forty summers on the porch with sweet tea and the radio" "Still here, still you, still home" "audio-240s.flac"
t "all four mastered: objective album QC passes and awaits a person's review" "REVIEW_REQUIRED|PASS|4|825" "$(q "SELECT album_qc_status FROM creative_albums WHERE id=$KA")|$(q "SELECT JSON_VALUE(album_qc_result,'$.status') FROM creative_albums WHERE id=$KA")|$(q "SELECT JSON_VALUE(album_qc_result,'$.mastered_tracks') FROM creative_albums WHERE id=$KA")|$(q "SELECT JSON_VALUE(album_qc_result,'$.total_programme_seconds') FROM creative_albums WHERE id=$KA")"
t "  → ALBUM_QC_REQUIRED recorded" 1 "$(evcount $KO CREATIVE.ALBUM_QC_REQUIRED)"
t "album review needs every criterion" 422 "$(cpost "$(js '{"action":"ALBUM_QC_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"criteria":{"narrative_progression":"PASS"},"outcome":"PASS"}')")"
t "the album passes: ALBUM_READY, then the vinyl programme is checked — capacity UNVERIFIED, never estimated" "200|PASS|CAPACITY_UNVERIFIED|1" "$(cpost "$(js '{"action":"ALBUM_QC_REVIEW","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"]),"criteria":{"narrative_progression":"PASS","musical_cohesion":"PASS","deliberate_variation":"PASS"},"outcome":"PASS"}')")|$(q "SELECT album_qc_status FROM creative_albums WHERE id=$KA")|$(q "SELECT capacity_status FROM creative_albums WHERE id=$KA")|$(evcount $KO CREATIVE.ALBUM_READY)"
t "  → sides allocated in track order, balanced: A 1–2 (390 s), B 3–4 (435 s); total 825 s" "1,2:390|3,4:435|825" "$(q "SELECT capacity_result FROM creative_albums WHERE id=$KA" | python3 -c 'import json,sys;r=json.loads(sys.stdin.read());print("|".join(",".join(map(str,s["tracks"]))+":"+str(s["seconds"]) for s in r["sides"])+"|"+str(r["total_seconds"]))')"
t "  → AUDIO.CAPACITY_CHECK_REQUIRED, and no capacity pass or exception invented" "1|0|0" "$(evcount $KO AUDIO.CAPACITY_CHECK_REQUIRED)|$(evcount $KO AUDIO.CAPACITY_PASSED)|$(evcount $KO AUDIO.CAPACITY_EXCEPTION)"
with_config "\$c['creative']['enforcement']='REQUIRED';"
t "REQUIRED enforcement: unverified capacity keeps the record from manufacture" "409|creative_not_ready" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
restore_config
CAP=public/api/data/physical-capacity.json
trap 'restore_config; rm -f public/api/_test-config-base.php "$CAP"' EXIT
printf '%s' '{"profiles":[{"sku":"keepsake-12-picture-disc","verified_per_side_seconds":360,"version":1}]}' > "$CAP"
t "a capacity file without source and date is ignored: still UNVERIFIED" "CAPACITY_UNVERIFIED" "$(cpost "$(js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"])}')" >/dev/null; jget capacity.status)"
SHAS_BEFORE=$(q "SELECT GROUP_CONCAT(CONCAT(sha256,duration_ms) ORDER BY id) FROM creative_masters WHERE order_id=$KO")
printf '%s' '{"profiles":[{"sku":"keepsake-12-picture-disc","verified_per_side_seconds":360,"verified_total_capacity_seconds":720,"version":1,"source":"TEST FIXTURE ONLY - not a manufacturer figure","last_verified_date":"2026-09-15"}]}' > "$CAP"
t "against a VERIFIED 360 s per side, the 825 s programme is an AUDIO_CAPACITY_EXCEPTION" "AUDIO_CAPACITY_EXCEPTION|SIDE_A_EXCEEDS_VERIFIED_CAPACITY,SIDE_B_EXCEEDS_VERIFIED_CAPACITY,TOTAL_EXCEEDS_VERIFIED_CAPACITY|false" "$(cpost "$(js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"])}')" >/dev/null; jget capacity.status)|$(cj '",".join(d["capacity"]["problems"])')|$(jget capacity.audio_modified)"
t "  → recorded and the Founders told once" "1|1" "$(evcount $KO AUDIO.CAPACITY_EXCEPTION)|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$KO AND notification_type='AUDIO_CAPACITY_EXCEPTION'")"
t "  → nothing was shortened, sped up or compressed: masters unchanged" "$SHAS_BEFORE" "$(q "SELECT GROUP_CONCAT(CONCAT(sha256,duration_ms) ORDER BY id) FROM creative_masters WHERE order_id=$KO")"
t "  → even in ADVISORY mode MCB's quality check refuses a known overflow" "409|audio_capacity_exception" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
t "  → surfaced in the staff queue" 1 "$(queue_has "CREATIVE:$KO:EXCEPTION")"
printf '%s' '{"profiles":[{"sku":"keepsake-12-picture-disc","verified_per_side_seconds":450,"version":2,"source":"TEST FIXTURE ONLY - not a manufacturer figure","last_verified_date":"2026-09-15"}]}' > "$CAP"
t "against a VERIFIED 450 s per side the programme passes" "CAPACITY_PASSED|1" "$(cpost "$(js '{"action":"RUN_CAPACITY_CHECK","order_id":int(E["OID"]),"staff":"Creative Tester","album_id":int(E["ALBUM"])}')" >/dev/null; jget capacity.status)|$(evcount $KO AUDIO.CAPACITY_PASSED)"
with_config "\$c['creative']['enforcement']='REQUIRED';"
t "with every creative gate passed MCB's quality check passes; fulfilment then waits on the manufacturing package: album title to add, and the disc canvas the manufacturer has not supplied (REQUIRED mode)" "200|FULFILMENT.PENDING|NOT_READY|1|1" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget state)|$(q "SELECT status FROM manufacturing_packages WHERE order_id=$KO AND status<>'SUPERSEDED'")|$(q "SELECT blockers LIKE '%ALBUM_TITLE_MISSING%' FROM manufacturing_packages WHERE order_id=$KO AND status<>'SUPERSEDED'")|$(q "SELECT blockers LIKE '%MANUFACTURER_DATA:PICTURE_DISC_12:%' FROM manufacturing_packages WHERE order_id=$KO AND status<>'SUPERSEDED'")"
restore_config
rm -f "$CAP"
act $KO ISSUE_STATUS_LINK >/dev/null; KPROG="{\"token\":\"$(link_token status)\"}"
tc "the customer's page shows no capacity, album QC or master detail" "$(post_json order-progress "$KPROG" >/dev/null; grep -qiE 'capacity|album_qc|master|lyric|ledger|side_a' /tmp/tx.json && echo 0 || echo 1)"

# ===========================================================================
section "5. METRICS, PROVIDER ROUTE AND PRIVACY"
t "metrics" 200 "$(crm "crm/creative?view=metrics&$STAFFQ")"
tc "  → attempts, attempts per song, generation minutes, failure rate, regeneration reasons, per provider — cost null because none is reported" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print(1 if d["attempts"]>=11 and d["attempts_per_song"] and d["generation_minutes"]>0 and 0<d["failure_rate"]<1 and d["regeneration_reasons"] and "manual" in d["providers"] and d["provider_cost_minor"] is None and d["cost_per_passed_master_minor"] is None else 0)')"
with_config "\$c['creative']['providers']['primary']='candidate-eleven-music';"
t "configuring a PRIMARY provider before integration changes nothing" "FOUNDER_SELECTED|None|True" "$(crm 'crm/creative?view=providers' >/dev/null; jget route.decision)|$(cj 'str(d["route"]["primary"])')|$(cj 'str(d["route"]["ignored_configuration"])')"
restore_config
t "another order's job cannot be acted on through this order" "404|job_not_found" "$(cpost "$(OID=$KO JOB=$MJ js '{"action":"UPDATE_STORY_MAP","order_id":int(E["OID"]),"staff":"Creative Tester","job_id":int(E["JOB"]),"story_map":{"opening":"x"}}')")|$(jget error)"
t "  → nor its audio registered through this order" 404 "$(cfile $KO $KREF $MJ $FIX/audio-195s.flac)"
tc "no customer approval was reintroduced; no financial action exists in the factory" "$([ "$(act $KO REQUEST_APPROVAL >/dev/null; jget error)" = action_retired ] && ! grep -qiE 'stripe_request|refund|purchase|payout|subscription|approve_' public/api/lib/creative-*.php public/api/crm/creative*.php && echo 1 || echo 0)"
tc "no creative founder notification carries lyrics, story or a name" "$(q "SELECT payload FROM founder_notifications WHERE notification_type IN ('CREATIVE_EXCEPTION','AUDIO_CAPACITY_EXCEPTION')" | grep -qiwE 'palm|lisbon|crete|porch|margaret|maggie|tom|story' && echo 0 || echo 1)"
tc "automation events publish the creative milestones without private text" "$(crm 'crm/automation-events?limit=500' >/dev/null; python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["order_events"];n={e["event"] for e in d};need={"CREATIVE.JOB_READY","CREATIVE.FACT_LEDGER_READY","CREATIVE.STORY_MAP_READY","CREATIVE.LYRICS_REQUIRED","CREATIVE.LYRICS_READY","CREATIVE.PLAN_READY","CREATIVE.GENERATION_REQUIRED","CREATIVE.GENERATION_STARTED","CREATIVE.CANDIDATE_READY","CREATIVE.TECHNICAL_QC_PASSED","CREATIVE.FACT_QC_PASSED","CREATIVE.CREATIVE_QC_REQUIRED","CREATIVE.CREATIVE_QC_PASSED","CREATIVE.MASTER_READY","CREATIVE.ALBUM_QC_REQUIRED","CREATIVE.ALBUM_READY","CREATIVE.EXCEPTION","AUDIO.CAPACITY_CHECK_REQUIRED","AUDIO.CAPACITY_PASSED","AUDIO.CAPACITY_EXCEPTION"};t=json.dumps(d);print(1 if need<=n and not any(w in t for w in ("Palm","Lisbon","Margaret","Maggie","porch")) else 0)')"
tc "creative audio lives in private storage, never under the web root" "$(grep -q "upload_directory()" public/api/lib/creative-factory.php && [ ! -d public/api/storage/creative ] && echo 1 || echo 0)"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
