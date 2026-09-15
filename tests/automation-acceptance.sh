#!/bin/bash
# MCB AUTOMATION FOUNDATION + PRODUCTION ARTWORK SPECIFICATION (15 September 2026).
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites
# (tests/README.md), including the TEST founder authorisation hashes and the
# TEST notification worker key. Orders are paid with locally signed TEST
# webhooks; Resend is the local stub. NO REQUEST REACHES STRIPE, RESEND,
# TELEGRAM, ANY AI SERVICE OR ANY SUPPLIER. Artwork outputs are synthetic
# single-colour PNGs (tests/fixtures/artwork-*.png).
#
# Covers: the production artwork specification (sleeve front/back, picture
# discs, Heart and gatefold TEMPLATE_REQUIRED); artwork planning, technical QC
# and exceptions; QC gating fulfilment; the idempotent founder notification
# outbox and its worker contract; the deep link that opens, never approves;
# explicit Bella/Lewis supplier-purchase authorisation; completion separate
# from follow-up and review; product sales suspension; observability; no
# sensitive data in notifications; the migration.

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

stub_reset
reset_limits

# ===========================================================================
section "0. THE PRODUCTION ARTWORK SPECIFICATION (INTERNAL DATA)"
t "12-inch sleeve FRONT output is exactly 3756 × 3827 px" "3756x3827" "$(spec "'%dx%d'%(t['SLEEVE_12_FRONT']['output_px']['width'],t['SLEEVE_12_FRONT']['output_px']['height'])")"
t "  → bleed 3 mm (~35 px); top/bottom spine allowance 3 mm (~35 px)" "3|35|3|35|3|35" "$(spec "'|'.join(str(v) for v in [t['SLEEVE_12_FRONT']['bleed']['min']['mm'],t['SLEEVE_12_FRONT']['bleed']['min']['px'],t['SLEEVE_12_FRONT']['spine_allowance']['top']['mm'],t['SLEEVE_12_FRONT']['spine_allowance']['top']['px'],t['SLEEVE_12_FRONT']['spine_allowance']['bottom']['mm'],t['SLEEVE_12_FRONT']['spine_allowance']['bottom']['px']])")"
t "12-inch sleeve BACK output is exactly 3756 × 3756 px, bleed 3 mm (~35 px), no spine allowance" "3756x3756|3|35|None" "$(spec "'%dx%d|%s|%s|%s'%(t['SLEEVE_12_BACK']['output_px']['width'],t['SLEEVE_12_BACK']['output_px']['height'],t['SLEEVE_12_BACK']['bleed']['max']['mm'],t['SLEEVE_12_BACK']['bleed']['max']['px'],t['SLEEVE_12_BACK']['spine_allowance'])")"
t "both sleeve templates carry id, version, status, orientation and QC checks" "ACTIVE|1|PORTRAIT|ACTIVE|1|SQUARE|True" "$(spec "'|'.join(str(v) for v in [t['SLEEVE_12_FRONT']['status'],t['SLEEVE_12_FRONT']['version'],t['SLEEVE_12_FRONT']['orientation'],t['SLEEVE_12_BACK']['status'],t['SLEEVE_12_BACK']['version'],t['SLEEVE_12_BACK']['orientation'],'EXACT_DIMENSIONS' in t['SLEEVE_12_FRONT']['qc']])")"
t "12-inch picture disc: 302 mm, centre hole 7.23 mm, bleed 2–3 mm" "302|7.23|2|3" "$(spec "'|'.join(str(v) for v in [t['PICTURE_DISC_12']['diameter_mm'],t['PICTURE_DISC_12']['centre_hole_mm'],t['PICTURE_DISC_12']['bleed']['min']['mm'],t['PICTURE_DISC_12']['bleed']['max']['mm']])")"
t "10-inch picture disc: 250 mm; 7-inch: 174 mm (holes not supplied, so not assumed)" "250|None|174|None" "$(spec "'|'.join(str(v) for v in [t['PICTURE_DISC_10']['diameter_mm'],t['PICTURE_DISC_10']['centre_hole_mm'],t['PICTURE_DISC_7']['diameter_mm'],t['PICTURE_DISC_7']['centre_hole_mm']])")"
tc "the ~1.5-inch centre CREATIVE exclusion is a separate field from the 7.23 mm physical hole" "$([ "$(spec "'%s|%s|%s'%(t['PICTURE_DISC_12']['centre_creative_exclusion']['diameter_inches'],t['PICTURE_DISC_12']['centre_creative_exclusion']['diameter_mm'],t['PICTURE_DISC_12']['centre_hole_mm'])")" = "1.5|38.1|7.23" ] && echo 1 || echo 0)"
tc "disc pixel resolution is not invented: GEOMETRY_ONLY, no output size, shape checked" "$([ "$(spec "'%s|%s|%s'%(t['PICTURE_DISC_12']['status'],t['PICTURE_DISC_12']['output_px'],'SQUARE_ASPECT' in t['PICTURE_DISC_12']['qc'])")" = "GEOMETRY_ONLY|None|True" ] && echo 1 || echo 0)"
t "Heart: MANUAL / TEMPLATE REQUIRED — no invented dieline, size or bleed" "TEMPLATE_REQUIRED|None|None|None|True" "$(spec "'|'.join(str(v) for v in [t['PICTURE_DISC_HEART']['status'],t['PICTURE_DISC_HEART']['output_px'],t['PICTURE_DISC_HEART']['bleed'],t['PICTURE_DISC_HEART']['diameter_mm'],any('dieline' in m for m in t['PICTURE_DISC_HEART']['missing'])])")"
t "the double 12-inch gatefold is TEMPLATE_REQUIRED too (not assumed from the single sleeve)" "TEMPLATE_REQUIRED|['journey-12']" "$(spec "'%s|%s'%(t['GATEFOLD_12_DOUBLE']['status'],t['GATEFOLD_12_DOUBLE']['applies_to_skus'])")"
t "template selection for the known formats" "['PICTURE_DISC_12']|['PICTURE_DISC_10']|['PICTURE_DISC_7']|['PICTURE_DISC_HEART']|['SLEEVE_12_FRONT', 'SLEEVE_12_BACK']|['GATEFOLD_12_DOUBLE']" "$(spec "'|'.join(str(d['components_by_sku'][s]) for s in ['keepsake-12-picture-disc','keepsake-10-picture-disc','keepsake-7-picture-disc','keepsake-10-heart-picture-disc','journey-6','journey-12'])")"
t "the SOURCE photograph rule stays 2500 px; production output sizes do not replace it" "2500" "$(spec "d['source_min_px']")"
tc "no template names a supplier" "$(spec "all(x['supplier_route'] is None for x in d['templates'])" | grep -q True && echo 1 || echo 0)"
t "the internal specification is not served over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/data/artwork.json")"
tc "the public catalogue exposes no production, template or supplier data" "$(grep -qiE '3756|3827|SLEEVE_12|PICTURE_DISC_|dieline|supplier_route|bleed|7\.23|artwork\.json|founder' public/catalogue.json && echo 0 || echo 1)"
tc "no customer page imports the artwork specification" "$(grep -rl 'production/artwork' src | grep -q . && echo 0 || echo 1)"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS afa; DROP DATABASE IF EXISTS afb; CREATE DATABASE afa; CREATE DATABASE afb;' 2>/dev/null
ROOTQ afa < db/schema.sql 2>/dev/null
git show 60209ec9:db/schema.sql | ROOTQ afb 2>/dev/null
ROOTQ afb < db/migrations/2026-09-15-automation-foundation.sql 2>/dev/null; A1=$?
ROOTQ afb < db/migrations/2026-09-15-automation-foundation.sql 2>/dev/null; A2=$?
ROOTQ afb < db/migrations/2026-09-15-creative-factory.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the Automation Foundation migration applies to the previous schema, and again (idempotent)" "$([ "$A1" = 0 ] && [ "$A2" = 0 ] && echo 1 || echo 0)"
tc "  → the migrated database is identical to a fresh db/schema.sql" "$([ "$(dumpdb afa | shasum)" = "$(dumpdb afb | shasum)" ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE afa; DROP DATABASE afb;' 2>/dev/null
tc "  → it only adds" "$(grep -qE '^[[:space:]]*(DROP|DELETE|TRUNCATE|RENAME|UPDATE) ' db/migrations/2026-09-15-automation-foundation.sql && echo 0 || echo 1)"
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
t "preflight: migration applied, founder authorisation configured, worker key, artwork data" "PASS|PASS|PASS|PASS" "$(pf automation_foundation_migration_applied)|$(pf founder_authorisation_configured)|$(pf notification_worker_key)|$(pf data_artwork)"
tc "  → and discloses no hash or key" "$(grep -qE '\$2y\$|test_notification_worker|not-real' /tmp/tx.json && echo 0 || echo 1)"

# ===========================================================================
section "1. PAID ORDER → READY FOR PROCESSING → FOUNDER NOTIFICATION (IDEMPOTENT)"
STORY="Grandad's whistle on the ferry to Guernsey, every summer."
order "{\"sku\":\"moment\",\"email\":\"af-moment@example.com\",\"units\":[{\"memories\":[{\"story\":\"$STORY\"}]}]}"
MO=$OID; MTOK=$TOK
session "$MO" "$MTOK" >/dev/null
MSID=$(session_id_for $MO); MTOTAL=$(q "SELECT total_minor FROM orders WHERE id=$MO")
EVT1="evt_af_$(openssl rand -hex 6)"
t "verified payment" 200 "$(hook "$(pay_event "$EVT1" "$MSID" "$MO" "$MTOTAL" gbp)")"
MREF=$(ref_of $MO)
t "  → ORDER.READY_FOR_PROCESSING recorded once" 1 "$(evcount $MO ORDER.READY_FOR_PROCESSING)"
t "  → one NEW_ORDER_READY_FOR_PROCESSING founder notification, PENDING" "1|PENDING" "$(notes $MO NEW_ORDER_READY_FOR_PROCESSING)|$(q "SELECT status FROM founder_notifications WHERE order_id=$MO")"
payload_of $MO NEW_ORDER_READY_FOR_PROCESSING
tc "  → payload: reference, product, amount, PAYMENT VERIFIED, input complete, next action, deep link" "$(python3 -c 'import json,sys;p=json.load(open("/tmp/np.json"));r=sys.argv[1]
ok=p["reference"]==r and "Moment" in p["product"] and p["amount"].startswith("£") and p["payment"]=="VERIFIED" and p["input"]=="COMPLETE" and p["required_action"] and p["action_url"]=="http://localhost:8080/operations#order="+r and p["title"]=="New order ready for processing"
print(1 if ok else 0)' "$MREF")"
tc "  → nothing else: no story, name, email, address, photo, credential or secret" "$(python3 -c 'import json;p=json.load(open("/tmp/np.json"));allowed={"notification","title","reference","product","amount","payment","input","qc","supplier_order","state","reason","required_action","action_url","test_payment"};print(1 if set(p)<=allowed else 0)')$(grep -qiE 'Guernsey|whistle|af-moment|@|Tx Customer|Harbour|whsec|sk_test|crm_key|photo' /tmp/np.json && echo X || echo '')"
t "  → recorded by the webhook (event source)" "STRIPE_WEBHOOK" "$(q "SELECT source FROM order_events WHERE order_id=$MO AND event_type='ORDER.PAID'")"
t "the same Stripe event delivered again" 200 "$(hook "$(pay_event "$EVT1" "$MSID" "$MO" "$MTOTAL" gbp)")"
t "  → no second ready event, notification or confirmation" "1|1|1" "$(evcount $MO ORDER.READY_FOR_PROCESSING)|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$MO")|$(evcount $MO CUSTOMER.CONFIRMATION.SENT)"
t "a different event id for the same payment" 200 "$(hook "$(pay_event "evt_af_$(openssl rand -hex 6)" "$MSID" "$MO" "$MTOTAL" gbp)")"
t "  → still one order, one notification, one ORDER.PAID" "1|1|1" "$(q "SELECT COUNT(*) FROM orders WHERE id=$MO AND status='PAID'")|$(q "SELECT COUNT(*) FROM founder_notifications WHERE order_id=$MO")|$(evcount $MO ORDER.PAID)"
tc "the operations queue still shows the new order" "$(queue_has "ORDER:$MO:NEW_ORDER")"

section "2. DIGITAL COMPLETION IS INDEPENDENT OF FOLLOW-UP AND REVIEW"
act $MO START_CREATIVE >/dev/null; act $MO SEND_TO_QUALITY_CHECK >/dev/null
t "a failed quality check" 200 "$(act $MO FAIL_QUALITY_CHECK '"reason":"SPELLING","note":"Guernsey spelt wrong in the bridge."')"
t "  → one QC_EXCEPTION notification with the machine reason only" "1|SPELLING|FAILED" "$(notes $MO QC_EXCEPTION)|$(payload_of $MO QC_EXCEPTION; jget reason /tmp/np.json)|$(jget qc /tmp/np.json)"
tc "  → the internal note never reaches the notification" "$(grep -qiE 'bridge|spelt' /tmp/np.json && echo 0 || echo 1)"
act $MO SEND_TO_QUALITY_CHECK >/dev/null; act $MO FAIL_QUALITY_CHECK '"reason":"AUDIO"' >/dev/null
t "  → a second failure is a second occurrence (attempt 2), not a duplicate" 2 "$(notes $MO QC_EXCEPTION)"
act $MO SEND_TO_QUALITY_CHECK >/dev/null
stub_reset
t "the quality check passes and the Moment is revealed" 200 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/af-moment"')"
t "  → the order is COMPLETED at the reveal" "COMPLETED|sent" "$(jget state)|$(jget emails.CREATION_READY)"
t "  → ORDER.COMPLETED once, triggered by the reveal; follow-up due separately" "1|REVEALED|yes" "$(evcount $MO ORDER.COMPLETED)|$(q "SELECT JSON_VALUE(detail,'$.trigger') FROM order_events WHERE order_id=$MO AND event_type='ORDER.COMPLETED'")|$(q "SELECT IF(follow_up_due_at IS NULL,'no','yes') FROM order_production WHERE order_id=$MO")"
crm "crm/operations?order=$MO" >/dev/null
tc "  → staff see completion, follow-up and review as separate facts" "$([ "$(jget operations.lifecycle.completed)" = true ] && [ "$(jget operations.lifecycle.follow_up_sent_at)" = null ] && [ "$(jget operations.lifecycle.review_requested_at)" = null ] && echo 1 || echo 0)"
t "MARK_COMPLETED on a completed order changes nothing" "unchanged|1" "$(act $MO MARK_COMPLETED >/dev/null; jget outcome)|$(evcount $MO ORDER.COMPLETED)"
t "the follow-up is still due for staff" 1 "$(queue_has "ORDER:$MO:FOLLOW_UP_DUE")"
docker exec mcb-api sh -c 'echo http_fail > /tmp/resend-mode'
t "the follow-up email FAILS" "failed" "$(act $MO RECORD_FOLLOW_UP '"send_email":true' >/dev/null; jget emails.FOLLOW_UP)"
act $MO ISSUE_STATUS_LINK >/dev/null; MS="{\"token\":\"$(link_token status)\"}"
tc "  → the order still reads COMPLETED, no FOLLOW_UP.SENT, and the customer still sees it ready" "$([ "$(state_of $MO)" = COMPLETED ] && [ "$(evcount $MO FOLLOW_UP.SENT)" = 0 ] && post_json order-progress "$MS" >/dev/null && [ "$(jget stage)" = ready ] && echo 1 || echo 0)"
docker exec mcb-api sh -c 'echo ok > /tmp/resend-mode'
FKEY=$(q "SELECT dedupe_key FROM customer_communications WHERE order_id=$MO AND message_type='FOLLOW_UP'")
RM="\"type\":\"FOLLOW_UP\",\"dedupe_key\":\"$FKEY\""
t "the follow-up email retried" "sent" "$(act $MO RETRY_MESSAGE "$RM" >/dev/null; jget emails.FOLLOW_UP)"
t "  → FOLLOW_UP.SENT once" 1 "$(evcount $MO FOLLOW_UP.SENT)"
RR="{\"order_id\":$MO}"
t "the review request" "sent" "$(crmpost crm/review-request "$RR" >/dev/null; jget outcome)"
crmpost crm/review-request "{\"order_id\":$MO}" >/dev/null
t "  → REVIEW.REQUESTED once, however often it is asked" 1 "$(evcount $MO REVIEW.REQUESTED)"
tc "  → lifecycle order: COMPLETED → FOLLOW_UP.DUE → FOLLOW_UP.SENT → REVIEW.REQUESTED" "$(events_of $MO | grep -q 'ORDER.COMPLETED.*FOLLOW_UP.DUE.*FOLLOW_UP.SENT.*REVIEW.REQUESTED' && echo 1 || echo 0)"

# ===========================================================================
section "3. KEEPSAKE: ARTWORK PLAN, TECHNICAL QC, QC GATES FULFILMENT"
reset_limits
paid_order '{"sku":"keepsake-12-picture-disc","email":"af-keepsake@example.com"}'
KO=$OID; KREF=$(ref_of $KO); KAID=$(aid_of $KO PICTURE_DISC_12)
t "the paid 12-inch picture disc has one artwork component from its artwork-ready photograph" "PICTURE_DISC_12|1|INPUT_VALIDATED|1" "$(q "SELECT CONCAT_WS('|',template_id,template_version,status,source_artwork_ready) FROM order_artwork WHERE order_id=$KO")"
t "  → ARTWORK.INPUT_VALIDATED once" 1 "$(evcount $KO ARTWORK.INPUT_VALIDATED)"
t "  → the source photograph belongs to this order" 1 "$(q "SELECT COUNT(*) FROM order_artwork a JOIN order_uploads u ON u.id=a.source_upload_id WHERE a.order_id=$KO AND u.order_id=$KO")"
crm "crm/artwork?order_id=$KO" >/dev/null
t "the staff artwork view keeps the template metadata" "302|7.23|1.5|38.1|2|3|1" "$(jget components.0.template.diameter_mm)|$(jget components.0.template.centre_hole_mm)|$(jget components.0.template.centre_creative_exclusion.diameter_inches)|$(jget components.0.template.centre_creative_exclusion.diameter_mm)|$(jget components.0.template.bleed.min.mm)|$(jget components.0.template.bleed.max.mm)|$(jget blocking)"
crm "crm/artwork?order_id=$KO" >/dev/null
t "  → refreshing the plan duplicates nothing" "1|1" "$(q "SELECT COUNT(*) FROM order_artwork WHERE order_id=$KO")|$(evcount $KO ARTWORK.INPUT_VALIDATED)"
t "the artwork endpoint needs the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/artwork?order_id=$KO")"
act $KO START_CREATIVE >/dev/null; act $KO SEND_TO_QUALITY_CHECK >/dev/null
t "the physical quality check cannot pass without production artwork" "409|artwork_not_ready" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
t "a non-square disc output is refused by technical QC" "422|artwork_qc_failed|FAIL" "$(aw $KO $KAID "$KREF" PICTURE_DISC_12 1 $FIX/artwork-3600x3500.png)|$(jget error)|$(jget checks.SQUARE_ASPECT)"
t "  → nothing stored; still not ready; the failure audited" "INPUT_VALIDATED|NULL|1" "$(q "SELECT CONCAT_WS('|',status,IFNULL(output_stored_name,'NULL')) FROM order_artwork WHERE id=$KAID")|$(evcount $KO ARTWORK.QC_FAILED)"
t "an output registered under another order's reference is refused (no cross-order mismatch)" "422|FAIL" "$(aw $KO $KAID "$MREF" PICTURE_DISC_12 1 $FIX/artwork-3600x3600.png)|$(jget checks.ORDER_ASSOCIATION)"
t "the wrong template version is refused" "422|FAIL" "$(aw $KO $KAID "$KREF" PICTURE_DISC_12 2 $FIX/artwork-3600x3600.png)|$(jget checks.TEMPLATE_VERSION)"
t "the wrong template is refused" "422|FAIL" "$(aw $KO $KAID "$KREF" SLEEVE_12_FRONT 1 $FIX/artwork-3600x3600.png)|$(jget checks.TEMPLATE_VERSION)"
t "a file that is not an image is refused" "422|FAIL" "$(aw $KO $KAID "$KREF" PICTURE_DISC_12 1 tests/README.md)|$(jget checks.FILE_TYPE)"
t "a missing output is refused" "422|FAIL" "$(curl -s -o /tmp/tx.json -w '%{http_code}' -X POST "$BASE/crm/artwork" -H "Authorization: Bearer $CRMKEY" -F "order_id=$KO" -F "artwork_id=$KAID" -F "reference=$KREF" -F "template_id=PICTURE_DISC_12" -F "template_version=1" -F "staff=A")|$(jget checks.OUTPUT_PRESENT)"
t "a square output of the right order, template and version passes" "200|READY" "$(aw $KO $KAID "$KREF" PICTURE_DISC_12 1 $FIX/artwork-3600x3600.png)|$(jget status)"
tc "  → every check PASS, recorded with the file facts and ARTWORK.READY" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print(1 if all(v=="PASS" for v in d["checks"].values()) and len(d["checks"])==6 else 0)')$([ "$(q "SELECT CONCAT_WS('|',status,output_mime,output_width,output_height,LENGTH(output_sha256),manual) FROM order_artwork WHERE id=$KAID")|$(evcount $KO ARTWORK.READY)" = "READY|image/png|3600|3600|64|0|1" ] && echo '' || echo X)"
t "  → the output is retrievable only with the CRM key" "401|200" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/artwork?artwork_id=$KAID&download=1")|$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/artwork?artwork_id=$KAID&download=1" -H "Authorization: Bearer $CRMKEY")"
STRIPE_BEFORE=$(stub_count)
t "now the quality check passes" "200|FULFILMENT.READY" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget state)"

section "4. FULFILMENT APPROVAL: THE LINK OPENS, A FOUNDER AUTHORISES"
t "one FULFILMENT_APPROVAL_REQUIRED notification" 1 "$(notes $KO FULFILMENT_APPROVAL_REQUIRED)"
payload_of $KO FULFILMENT_APPROVAL_REQUIRED
tc "  → VERIFIED payment, QC PASSED, supplier order READY, and the deep link to this order's approval" "$(python3 -c 'import json,sys;p=json.load(open("/tmp/np.json"));r=sys.argv[1];print(1 if p["payment"]=="VERIFIED" and p["qc"]=="PASSED" and p["supplier_order"]=="READY" and p["reference"]==r and p["action_url"]=="http://localhost:8080/operations#order=%s&action=AUTHORISE_SUPPLIER_PURCHASE"%r else 0)' "$KREF")"
tc "  → the link carries no key, token, code or amount — only the reference and the action name" "$(python3 -c 'import json,re;u=json.load(open("/tmp/np.json"))["action_url"];print(1 if re.fullmatch(r"http://localhost:8080/operations#order=MCB-\d{4}-\d{6}&action=AUTHORISE_SUPPLIER_PURCHASE",u) else 0)')"
crm "crm/operations?order=$KO" >/dev/null
t "the staff order page shows the approval summary" "true|VERIFIED|PASSED|READY" "$(jget operations.fulfilment.approval.required)|$(jget operations.fulfilment.approval.customer_payment)|$(jget operations.fulfilment.approval.mcb_qc)|$(jget operations.fulfilment.approval.supplier_order)"
tc "  → offering AUTHORISE_SUPPLIER_PURCHASE, never CONFIRM_FULFILMENT before it" "$(jget operations.available_actions | grep -q AUTHORISE_SUPPLIER_PURCHASE && ! jget operations.available_actions | grep -q '"CONFIRM_FULFILMENT"' && echo 1 || echo 0)"
t "opening the link's page without signing in shows nothing" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/operations?order=$KO")"
NOAUTH="{\"order_id\":$KO,\"action\":\"AUTHORISE_SUPPLIER_PURCHASE\",\"staff\":\"x\",\"founder\":\"BELLA\",\"founder_code\":\"$FOUNDER_CODE_BELLA\",\"confirm\":true}"
t "an authorisation without the CRM sign-in is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/order-action" -H 'Content-Type: application/json' -d "$NOAUTH")"
t "the supplier order cannot be recorded before a founder authorises it" "409|founder_authorisation_required" "$(act $KO CONFIRM_FULFILMENT '"purchase_authorised_by":"BELLA"')|$(jget error)"
t "staff without a founder code cannot authorise" "422|founder_required" "$(act $KO AUTHORISE_SUPPLIER_PURCHASE '"confirm":true')|$(jget error)"
t "only Bella or Lewis" "422|founder_required" "$(act $KO AUTHORISE_SUPPLIER_PURCHASE '"founder":"AUTOMATION","founder_code":"x","confirm":true')|$(jget error)"
NOCONF="\"founder\":\"BELLA\",\"founder_code\":\"$FOUNDER_CODE_BELLA\""
t "the explicit confirmation is required" "422|authorisation_confirmation_required" "$(act $KO AUTHORISE_SUPPLIER_PURCHASE "$NOCONF")|$(jget error)"
t "a wrong code is refused" "403|founder_authorisation_failed" "$(founder_authorise $KO BELLA wrong-code-123456)|$(jget error /tmp/fa.json)"
t "Lewis's code does not authorise as Bella" 403 "$(founder_authorise $KO BELLA "$FOUNDER_CODE_LEWIS")"
tc "  → both refusals audited, no code stored anywhere, nothing authorised" "$([ "$(evcount $KO FULFILMENT.AUTHORISATION_REFUSED)" = 2 ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%not-real%' OR detail LIKE '%wrong-code%'")" = 0 ] && [ "$(q "SELECT COUNT(*) FROM founder_notifications WHERE payload LIKE '%not-real%'")" = 0 ] && [ "$(state_of $KO)" = FULFILMENT.READY ] && echo 1 || echo 0)"
t "Bella explicitly authorises the supplier purchase" "200|FULFILMENT.AUTHORISED" "$(founder_authorise $KO BELLA "$FOUNDER_CODE_BELLA")|$(jget state /tmp/fa.json)"
t "  → founder, time and audit evidence recorded" "BELLA|yes|BELLA|Founder Test|FOUNDER_CODE|64" "$(q "SELECT CONCAT_WS('|',supplier_purchase_authorised_by,IF(supplier_purchase_authorised_at IS NULL,'no','yes')) FROM order_production WHERE order_id=$KO")|$(q "SELECT CONCAT_WS('|',JSON_VALUE(detail,'$.founder'),JSON_VALUE(detail,'$.by'),JSON_VALUE(detail,'$.method'),LENGTH(JSON_VALUE(detail,'$.ip_hash'))) FROM order_events WHERE order_id=$KO AND event_type='FULFILMENT.AUTHORISED'")"
t "  → by a signed-in staff request (event source)" "STAFF" "$(q "SELECT source FROM order_events WHERE order_id=$KO AND event_type='FULFILMENT.AUTHORISED'")"
t "authorising again changes nothing" "unchanged|1" "$(founder_authorise $KO LEWIS "$FOUNDER_CODE_LEWIS" >/dev/null; jget outcome /tmp/fa.json)|$(evcount $KO FULFILMENT.AUTHORISED)"
t "  → the queue now asks for the supplier order to be placed by hand" 1 "$(queue_has "ORDER:$KO:SUPPLIER_ORDER_REQUIRED")"
tc "  → no request went to Stripe, a supplier or anywhere else" "$([ "$(stub_count)" = "$STRIPE_BEFORE" ] && echo 1 || echo 0)"
t "the supplier order recorded (placed by hand)" "FULFILMENT.CONFIRMED|BELLA" "$(act $KO CONFIRM_FULFILMENT '"fulfilment_reference":"HAND-1","send_email":false' >/dev/null; jget state)|$(q "SELECT JSON_VALUE(detail,'$.authorised_by') FROM order_events WHERE order_id=$KO AND event_type='FULFILMENT.CONFIRMED'")"
act $KO ISSUE_STATUS_LINK >/dev/null; KS=$(link_token status)
KSB="{\"token\":\"$KS\"}"
tc "the customer's page never shows authorisation or approval" "$(post_json order-progress "$KSB" >/dev/null; [ "$(jget stage)" = making ] || echo X; grep -qiE 'BELLA|LEWIS|authoris|approv|HAND-1' /tmp/tx.json && echo 0 || echo 1)"
act $KO MARK_DISPATCHED "\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\",\"send_email\":false" >/dev/null
t "a delivery delay notifies the Founders once" "1|DELIVERY_DELAYED" "$(act $KO MARK_DELIVERY_DELAYED >/dev/null; act $KO MARK_DELIVERY_DELAYED >/dev/null; notes $KO FULFILMENT_EXCEPTION)|$(payload_of $KO FULFILMENT_EXCEPTION; jget reason /tmp/np.json)"
DLV="\"delivered_on\":\"$TODAY\""
t "delivery completes the physical order" "COMPLETED|1|DELIVERED" "$(act $KO MARK_DELIVERED "$DLV" >/dev/null; jget state)|$(evcount $KO ORDER.COMPLETED)|$(q "SELECT JSON_VALUE(detail,'$.trigger') FROM order_events WHERE order_id=$KO AND event_type='ORDER.COMPLETED'")"
reset_limits
D1="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-1\",\"description\":\"The disc arrived cracked across the label.\"}"
t "a damaged-item report" 201 "$(post_json order-support "$D1")"
t "  → one CUSTOMER_SUPPORT_EXCEPTION, reason only" "1|DAMAGED_OR_FAULTY" "$(notes $KO CUSTOMER_SUPPORT_EXCEPTION)|$(payload_of $KO CUSTOMER_SUPPORT_EXCEPTION; jget reason /tmp/np.json)"
tc "  → without the customer's words" "$(grep -qi 'cracked' /tmp/np.json && echo 0 || echo 1)"
post_json order-support "{\"token\":\"$KS\",\"kind\":\"QUESTION\",\"description\":\"Can I buy a second copy of the record?\"}" >/dev/null
t "  → a plain question does not interrupt the Founders" 1 "$(notes $KO CUSTOMER_SUPPORT_EXCEPTION)"

# ===========================================================================
section "5. JOURNEY SLEEVE: FRONT 3756 × 3827, BACK 3756 × 3756"
reset_limits
paid_order '{"sku":"journey-6","email":"af-journey@example.com"}'
JO=$OID; JREF=$(ref_of $JO); FA=$(aid_of $JO SLEEVE_12_FRONT); BA=$(aid_of $JO SLEEVE_12_BACK)
t "a Journey needs a sleeve front and back, both from its photograph" "SLEEVE_12_BACK:INPUT_VALIDATED,SLEEVE_12_FRONT:INPUT_VALIDATED" "$(q "SELECT GROUP_CONCAT(CONCAT(template_id,':',status) ORDER BY template_id) FROM order_artwork WHERE order_id=$JO")"
crm "crm/artwork?order_id=$JO" >/dev/null
tc "  → the view preserves front size, bleed and spine, and back size and bleed" "$(python3 -c 'import json;c={x["template"]["id"]:x["template"] for x in json.load(open("/tmp/tx.json"))["components"]};f=c["SLEEVE_12_FRONT"];b=c["SLEEVE_12_BACK"]
print(1 if f["output_px"]=={"width":3756,"height":3827} and f["bleed"]["min"]=={"mm":3,"px":35} and f["spine_allowance"]["top"]=={"mm":3,"px":35} and f["spine_allowance"]["bottom"]=={"mm":3,"px":35} and b["output_px"]=={"width":3756,"height":3756} and b["bleed"]["max"]=={"mm":3,"px":35} and b["spine_allowance"] is None else 0)')"
act $JO SEND_TO_QUALITY_CHECK >/dev/null
t "a front at 3827 × 3756 (rotated) is refused" "422|FAIL" "$(aw $JO $FA "$JREF" SLEEVE_12_FRONT 1 $FIX/artwork-3827x3756.png)|$(jget checks.EXACT_DIMENSIONS)"
t "a front at the back's 3756 × 3756 is refused" "422|FAIL" "$(aw $JO $FA "$JREF" SLEEVE_12_FRONT 1 $FIX/artwork-3756x3756.png)|$(jget checks.EXACT_DIMENSIONS)"
t "a back at the front's 3756 × 3827 is refused" "422|FAIL" "$(aw $JO $BA "$JREF" SLEEVE_12_BACK 1 $FIX/artwork-3756x3827.png)|$(jget checks.EXACT_DIMENSIONS)"
t "another order's artwork component cannot be registered on this order" 404 "$(aw $JO $KAID "$JREF" PICTURE_DISC_12 1 $FIX/artwork-3600x3600.png)"
t "the front at exactly 3756 × 3827 passes" "200|PASS" "$(aw $JO $FA "$JREF" SLEEVE_12_FRONT 1 $FIX/artwork-3756x3827.png)|$(jget checks.EXACT_DIMENSIONS)"
t "the quality check still waits for the back" "409|artwork_not_ready" "$(act $JO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
t "the back at exactly 3756 × 3756 passes" "200|PASS" "$(aw $JO $BA "$JREF" SLEEVE_12_BACK 1 $FIX/artwork-3756x3756.png)|$(jget checks.EXACT_DIMENSIONS)"
t "then the quality check passes" "FULFILMENT.READY" "$(act $JO PASS_QUALITY_CHECK "$QC_PHYSICAL" >/dev/null; jget state)"
for i in 1 2 3 4 5; do founder_authorise $JO LEWIS "wrong-code-attempt-$i" >/dev/null; done
t "after five refused codes, further attempts on the order wait" "429|too_many_attempts" "$(founder_authorise $JO LEWIS "$FOUNDER_CODE_LEWIS")|$(jget error /tmp/fa.json)"
t "  → and nothing was authorised" "FULFILMENT.READY|NULL" "$(state_of $JO)|$(q "SELECT IFNULL(supplier_purchase_authorised_by,'NULL') FROM order_production WHERE order_id=$JO")"

# ===========================================================================
section "6. HEART PICTURE DISC: TEMPLATE REQUIRED, NEVER INVENTED"
reset_limits
paid_order '{"sku":"keepsake-10-heart-picture-disc","email":"af-heart@example.com"}'
HO=$OID; HREF=$(ref_of $HO); HA=$(aid_of $HO PICTURE_DISC_HEART)
t "the Heart component is TEMPLATE_REQUIRED" "TEMPLATE_REQUIRED" "$(q "SELECT status FROM order_artwork WHERE id=$HA")"
t "  → ARTWORK.TEMPLATE_REQUIRED and one ARTWORK_EXCEPTION for the Founders" "1|1|ARTWORK_TEMPLATE_REQUIRED" "$(evcount $HO ARTWORK.TEMPLATE_REQUIRED)|$(notes $HO ARTWORK_EXCEPTION)|$(payload_of $HO ARTWORK_EXCEPTION; jget reason /tmp/np.json)"
crm "crm/artwork?order_id=$HO" >/dev/null; crm "crm/artwork?order_id=$HO" >/dev/null
t "  → looking again adds nothing" "1|1" "$(evcount $HO ARTWORK.TEMPLATE_REQUIRED)|$(notes $HO ARTWORK_EXCEPTION)"
t "  → no size, bleed or dieline is offered" "null|null|null" "$(jget components.0.template.output_px)|$(jget components.0.template.bleed)|$(jget components.0.template.diameter_mm)"
t "  → surfaced in the staff queue" 1 "$(queue_has "ARTWORK:$HA:TEMPLATE_REQUIRED")"
act $HO SEND_TO_QUALITY_CHECK >/dev/null
t "registering Heart artwork needs confirmation it was prepared by hand to the manufacturer's dieline" "422|manual_template_confirmation_required" "$(aw $HO $HA "$HREF" PICTURE_DISC_HEART 1 $FIX/artwork-3600x3600.png)|$(jget error)"
t "with that confirmation it is recorded as MANUAL" "200|READY|1" "$(aw $HO $HA "$HREF" PICTURE_DISC_HEART 1 $FIX/artwork-3600x3500.png -F manual_template_confirmed=true)|$(jget status)|$(q "SELECT manual FROM order_artwork WHERE id=$HA")"
tc "  → only presence, type and order association are checked — no invented shape rule" "$(python3 -c 'import json;print(1 if sorted(json.load(open("/tmp/tx.json"))["checks"])==["FILE_TYPE","ORDER_ASSOCIATION","OUTPUT_PRESENT"] else 0)')"
t "  → the queue item has gone" 0 "$(queue_has "ARTWORK:$HA:")"
HSTATE_BEFORE=$(state_of $HO)

# ===========================================================================
section "7. SOURCE PHOTO RULE, £15 SERVICE AND ARTWORK EXCEPTIONS"
reset_limits
order '{"sku":"keepsake-12-picture-disc","email":"af-source@example.com","manual_photos":true}'
SO=$OID; STOK=$TOK; SLOT=$(python3 -c 'import json;print([s for s in json.load(open("/tmp/order.json"))["missing_uploads"] if s.startswith("memory:")][0])')
t "without the service, a 3000 × 2000 photograph is refused" "422|photo_not_artwork_ready" "$(upload $SO $STOK $SLOT $FIX/photo-3000x2000.jpg)|$(jget error)"
t "a larger square photograph (3000 × 3000) passes the ≥ 2500 rule" 201 "$(upload $SO $STOK $SLOT $FIX/photo-3000.jpg)"
KP=$(price keepsake-12-picture-disc)
t "the £15 service is priced by the server, whatever the browser sends" "$((KP + 1500))" "$(post_json order-quote '{"lines":[{"sku":"keepsake-12-picture-disc","quantity":1},{"sku":"artwork-preparation","quantity":1,"unit_minor":1,"price":0}],"shippingCountryCode":"GB"}' >/dev/null; jget subtotal_minor)"
t "  → once per order" "422|artwork_preparation_ineligible" "$(post_json order-quote '{"lines":[{"sku":"keepsake-12-picture-disc","quantity":2},{"sku":"artwork-preparation","quantity":2}],"shippingCountryCode":"GB"}')|$(jget error)"
t "  → only with a Keepsake or Journey" "422|artwork_preparation_ineligible" "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1},{"sku":"artwork-preparation","quantity":1}]}')|$(jget error)"
order '{"sku":"keepsake-12-picture-disc","email":"af-prep1@example.com","manual_photos":true,"lines_override":[{"sku":"keepsake-12-picture-disc","quantity":1},{"sku":"artwork-preparation","quantity":1}]}'
P1=$OID; P1TOK=$TOK
for slot in $(python3 -c 'import json;print(" ".join(s for s in json.load(open("/tmp/order.json"))["missing_uploads"] if s.startswith("memory:")))'); do upload $P1 $P1TOK $slot $FIX/photo-3000x2000.jpg >/dev/null; done
session $P1 $P1TOK >/dev/null; hook "$(pay_event "evt_af_$(openssl rand -hex 6)" "$(session_id_for $P1)" "$P1" "$(q "SELECT total_minor FROM orders WHERE id=$P1")" gbp)" >/dev/null
t "one unready photograph with the service → PREPARATION_REQUIRED, no exception" "PREPARATION_REQUIRED|1|0" "$(q "SELECT status FROM order_artwork WHERE order_id=$P1")|$(evcount $P1 ARTWORK.PREPARATION_REQUIRED)|$(notes $P1 ARTWORK_EXCEPTION)"
reset_limits
order '{"sku":"keepsake-12-picture-disc","email":"af-prep2@example.com","count":2,"manual_photos":true,"lines_override":[{"sku":"keepsake-12-picture-disc","quantity":2},{"sku":"artwork-preparation","quantity":1}]}'
P2=$OID; P2TOK=$TOK
for slot in $(python3 -c 'import json;print(" ".join(s for s in json.load(open("/tmp/order.json"))["missing_uploads"] if s.startswith("memory:")))'); do upload $P2 $P2TOK $slot $FIX/photo-3000x2000.jpg >/dev/null; done
P2SUB=$(q "SELECT subtotal_minor FROM orders WHERE id=$P2")
t "two Keepsakes with the service charge it once" "$((KP * 2 + 1500))|1" "$P2SUB|$(q "SELECT quantity FROM order_items WHERE order_id=$P2 AND item_id='artwork-preparation'")"
session $P2 $P2TOK >/dev/null; hook "$(pay_event "evt_af_$(openssl rand -hex 6)" "$(session_id_for $P2)" "$P2" "$(q "SELECT total_minor FROM orders WHERE id=$P2")" gbp)" >/dev/null
STRIPE_AFTER_PAY=$(stub_count)
t "several unready photographs → ARTWORK_EXCEPTION for internal review" "EXCEPTION:MULTIPLE_PREPARATION,EXCEPTION:MULTIPLE_PREPARATION|1|MULTIPLE_PREPARATION" "$(q "SELECT GROUP_CONCAT(CONCAT(status,':',exception_reason)) FROM order_artwork WHERE order_id=$P2")|$(notes $P2 ARTWORK_EXCEPTION)|$(payload_of $P2 ARTWORK_EXCEPTION; jget reason /tmp/np.json)"
crm "crm/artwork?order_id=$P2" >/dev/null
tc "  → no automatic extra charge: the paid total and lines are unchanged and no new payment is started" "$([ "$(q "SELECT subtotal_minor FROM orders WHERE id=$P2")" = "$P2SUB" ] && [ "$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$P2")" = 2 ] && [ "$(stub_count)" = "$STRIPE_AFTER_PAY" ] && [ "$(notes $P2 ARTWORK_EXCEPTION)" = 1 ] && echo 1 || echo 0)"
act $P2 SEND_TO_QUALITY_CHECK >/dev/null
P2A=$(q "SELECT id FROM order_artwork WHERE order_id=$P2 ORDER BY id LIMIT 1")
t "  → an exception output needs the internal review confirmed" "422|artwork_exception_unreviewed" "$(aw $P2 $P2A "$(ref_of $P2)" PICTURE_DISC_12 1 $FIX/artwork-3600x3600.png)|$(jget error)"
t "  → and then passes technical QC" 200 "$(aw $P2 $P2A "$(ref_of $P2)" PICTURE_DISC_12 1 $FIX/artwork-3600x3600.png -F exception_reviewed=true)"

# ===========================================================================
section "8. THE NOTIFICATION OUTBOX WORKER CONTRACT"
t "the outbox needs a key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/notifications")"
t "a wrong key is refused" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/notifications" -H 'Authorization: Bearer not_the_worker_key_000000000000000000000')"
t "the worker key lists notifications" 200 "$(wkget "")"
WNOTE="{\"order_id\":$KO,\"action\":\"ADD_NOTE\",\"staff\":\"w\",\"note\":\"x\"}"
t "the worker key cannot act on orders" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/order-action" -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY" -H 'Content-Type: application/json' -d "$WNOTE")"
t "  → nor read the operations console" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/operations?view=queue" -H "Authorization: Bearer $NOTIFICATION_WORKER_KEY")"
t "a claim names its worker" 422 "$(wk '{"action":"CLAIM"}')"
t "claim two" 200 "$(wk '{"action":"CLAIM","worker":"telegram-bridge-test","limit":2}')"
cp /tmp/tx.json /tmp/claim1.json
tc "  → each with a one-time claim token, an idempotency key, the type and the safe payload" "$(python3 -c 'import json,re;n=json.load(open("/tmp/claim1.json"))["notifications"];print(1 if len(n)==2 and all(re.fullmatch("[a-f0-9]{48}",x["claim_token"]) and x["idempotency_key"].startswith("mcb-founder-") and x["attempt"]==1 and isinstance(x["payload"],dict) for x in n) else 0)')"
N1=$(jget notifications.0.id /tmp/claim1.json); T1=$(jget notifications.0.claim_token /tmp/claim1.json)
N2=$(jget notifications.1.id /tmp/claim1.json); T2=$(jget notifications.1.claim_token /tmp/claim1.json)
wk '{"action":"CLAIM","worker":"telegram-bridge-test","limit":2}' >/dev/null
tc "  → a second claim gets different notifications" "$(python3 -c 'import json,sys;n=[x["id"] for x in json.load(open("/tmp/tx.json"))["notifications"]];print(1 if n and not set(n)&{int(sys.argv[1]),int(sys.argv[2])} else 0)' "$N1" "$N2")"
t "an acknowledgement with the wrong token is refused" "409|claim_not_current" "$(ack "$N1" "$(openssl rand -hex 24)" DELIVERED)|$(jget error)"
t "an unknown channel is refused" 422 "$(ack "$N1" "$T1" DELIVERED CARRIER_PIGEON)"
t "delivered over Telegram" "delivered" "$(ack "$N1" "$T1" DELIVERED TELEGRAM >/dev/null; jget outcome)"
t "  → the same acknowledgement again is harmless" "already_delivered|DELIVERED|TELEGRAM" "$(ack "$N1" "$T1" DELIVERED >/dev/null; jget outcome)|$(q "SELECT CONCAT_WS('|',status,delivered_channel) FROM founder_notifications WHERE id=$N1")"
t "a failed delivery schedules a retry" "retry_scheduled|FAILED|1|telegram_timeout|yes" "$(ack "$N2" "$T2" FAILED "" telegram_timeout >/dev/null; jget outcome)|$(q "SELECT CONCAT_WS('|',status,attempts,last_error,IF(next_attempt_at>UTC_TIMESTAMP(),'yes','no')) FROM founder_notifications WHERE id=$N2")"
wk '{"action":"CLAIM","worker":"telegram-bridge-test","limit":25}' >/dev/null
tc "  → not claimed again before its retry time" "$(python3 -c 'import json,sys;print(0 if int(sys.argv[1]) in [x["id"] for x in json.load(open("/tmp/tx.json"))["notifications"]] else 1)' "$N2")"
q "UPDATE founder_notifications SET next_attempt_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE id=$N2"
wk '{"action":"CLAIM","worker":"telegram-bridge-test","limit":25}' >/dev/null
T2B=$(python3 -c 'import json,sys;print([x["claim_token"] for x in json.load(open("/tmp/tx.json"))["notifications"] if x["id"]==int(sys.argv[1])][0])' "$N2" 2>/dev/null)
t "  → claimed again when due, as attempt 2" "2" "$(python3 -c 'import json,sys;print([x["attempt"] for x in json.load(open("/tmp/tx.json"))["notifications"] if x["id"]==int(sys.argv[1])][0])' "$N2" 2>/dev/null)"
t "the old claim token no longer acknowledges it" 409 "$(ack "$N2" "$T2" DELIVERED)"
q "UPDATE founder_notifications SET attempts = 8 WHERE id=$N2"
t "after the last attempt a failure is ABANDONED, needing a person" "abandoned|ABANDONED" "$(ack "$N2" "$T2B" FAILED "" telegram_down >/dev/null; jget outcome)|$(q "SELECT status FROM founder_notifications WHERE id=$N2")"
t "  → surfaced in the staff queue" 1 "$(queue_has "NOTIFICATION:$N2:ABANDONED")"
wkget "?view=health" >/dev/null
t "  → and in the health view" "true|1" "$(jget human_action_required)|$(jget counts.ABANDONED)"
RQ="{\"action\":\"REQUEUE\",\"id\":$N2,\"staff\":\"Ops\"}"
t "the worker cannot requeue it" 403 "$(wk "$RQ")"
t "staff requeue it once the bridge is fixed" "requeued|PENDING|0" "$(crmpost crm/notifications "$RQ" >/dev/null; jget outcome)|$(q "SELECT CONCAT_WS('|',status,attempts) FROM founder_notifications WHERE id=$N2")"
q "UPDATE founder_notifications SET claimed_at = UTC_TIMESTAMP() - INTERVAL 20 MINUTE WHERE status='DELIVERING'"
STALE=$(q "SELECT COUNT(*) FROM founder_notifications WHERE status='DELIVERING'")
wk '{"action":"CLAIM","worker":"telegram-bridge-test","limit":25}' >/dev/null
tc "a claim abandoned mid-send (worker died) is claimed again after ten minutes" "$([ "$STALE" -gt 0 ] && python3 -c 'import json;n=json.load(open("/tmp/tx.json"))["notifications"];print(1 if any(x["attempt"]>=2 for x in n) else 0)' | grep -q 1 && echo 1 || echo 0)"
wkget "?view=health" >/dev/null
t "no paid order is missing its ready event or founder notification" "[]" "$(jget paid_orders_missing_ready_signal)"
q "SELECT payload FROM founder_notifications" > /tmp/all-payloads.txt
tc "every notification payload is allow-listed and free of customer or secret data" "$(python3 -c 'import json
allowed={"notification","title","reference","product","amount","payment","input","qc","supplier_order","state","reason","required_action","action_url","test_payment"}
rows=[json.loads(l) for l in open("/tmp/all-payloads.txt") if l.strip()]
print(1 if rows and all(set(r)<=allowed for r in rows) else 0)')$(grep -qiE '@|Harbour|Southampton|Rec Ipient|Tx Customer|\+44|Guernsey|whistle|cracked|whsec_|sk_test|crm_key|worker_key|not-real|stored_name|upload|story' /tmp/all-payloads.txt && echo X || echo '')"
tc "no Telegram, TaskNotify or AI provider is called, and no bot credential exists in the code" "$(grep -rniE 'api\.telegram\.org|sendMessage\?chat_id|bot[0-9]{6,}:|api\.openai\.com|replicate\.com|stability\.ai' public/api src 2>/dev/null | grep -v '^public/api/_test' | grep -q . && echo 0 || echo 1)"

# ===========================================================================
section "9. SUSPENDING NEW SALES"
reset_limits
order '{"sku":"keepsake-10-heart-picture-disc","email":"af-pending-heart@example.com"}'
PH=$OID; PHTOK=$TOK
t "availability is public and starts empty" "200|[]" "$(get product-availability)|$(jget unavailable)"
t "suspension needs the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/product-sales" -H 'Content-Type: application/json' -d '{"action":"SUSPEND","subject":"keepsake-10-heart-picture-disc","reason":"SUPPLIER_UNAVAILABLE","staff":"x"}')"
t "an unknown product is refused" 422 "$(crmpost crm/product-sales '{"action":"SUSPEND","subject":"not-a-product","reason":"OTHER","staff":"Ops"}')"
t "a reason is required" 422 "$(crmpost crm/product-sales '{"action":"SUSPEND","subject":"keepsake-10-heart-picture-disc","reason":"BORED","staff":"Ops"}')"
t "new sales of the Heart are suspended" "suspended|CURRENTLY_UNAVAILABLE" "$(crmpost crm/product-sales '{"action":"SUSPEND","subject":"keepsake-10-heart-picture-disc","reason":"SUPPLIER_UNAVAILABLE","staff":"Ops"}' >/dev/null; jget outcome)|$(jget customer_state)"
t "  → suspending again changes nothing" "unchanged" "$(crmpost crm/product-sales '{"action":"SUSPEND","subject":"keepsake-10-heart-picture-disc","reason":"SUPPLIER_UNAVAILABLE","staff":"Ops"}' >/dev/null; jget outcome)"
t "  → the Founders are notified once" "1|CURRENTLY_UNAVAILABLE" "$(q "SELECT COUNT(*) FROM founder_notifications WHERE notification_type='PRODUCT_SALES_SUSPENDED' AND subject_reference='keepsake-10-heart-picture-disc'")|$(q "SELECT JSON_VALUE(payload,'$.state') FROM founder_notifications WHERE notification_type='PRODUCT_SALES_SUSPENDED' LIMIT 1")"
t "  → the public list shows only the identifier" '["keepsake-10-heart-picture-disc"]' "$(get product-availability >/dev/null; jget unavailable)"
tc "  → with no reason, staff name or supplier detail" "$(grep -qiE 'SUPPLIER|Ops|reason' /tmp/tx.json && echo 0 || echo 1)"
t "a new quote for it is refused as currently unavailable" "422|product_unavailable" "$(post_json order-quote '{"lines":[{"sku":"keepsake-10-heart-picture-disc","quantity":1}],"shippingCountryCode":"GB"}')|$(jget error)"
tc "  → in plain words" "$(jget message | grep -q 'currently unavailable' && echo 1 || echo 0)"
t "a new order for it is refused" "422|product_unavailable" "$(post_json order "$(build_order '{"sku":"keepsake-10-heart-picture-disc","email":"af-new-heart@example.com"}')")|$(jget error)"
STRIPE_BEFORE=$(stub_count)
t "an unpaid order from before the suspension cannot start a payment" "409|product_unavailable" "$(session $PH $PHTOK)|$(jget error)"
tc "  → and Stripe was not called" "$([ "$(stub_count)" = "$STRIPE_BEFORE" ] && echo 1 || echo 0)"
t "the existing PAID Heart order is untouched and still worked on" "PAID|$HSTATE_BEFORE|200" "$(q "SELECT status FROM orders WHERE id=$HO")|$(state_of $HO)|$(act $HO ADD_NOTE '"note":"Supplier paused new heart discs; this order continues."')"
t "other products still sell" 200 "$(post_json order-quote '{"lines":[{"sku":"keepsake-12-picture-disc","quantity":1}],"shippingCountryCode":"GB"}')"
crmpost crm/product-sales '{"action":"SUSPEND","subject":"keepsake","reason":"QUALITY","staff":"Ops"}' >/dev/null
t "suspending a whole product covers each of its SKUs" "422|product_unavailable" "$(post_json order-quote '{"lines":[{"sku":"keepsake-12-picture-disc","quantity":1}],"shippingCountryCode":"GB"}')|$(jget error)"
crmpost crm/product-sales '{"action":"RESUME","subject":"keepsake","staff":"Ops"}' >/dev/null
t "resuming sales" "resumed" "$(crmpost crm/product-sales '{"action":"RESUME","subject":"keepsake-10-heart-picture-disc","staff":"Ops"}' >/dev/null; jget outcome)"
t "  → it can be quoted again" 200 "$(post_json order-quote '{"lines":[{"sku":"keepsake-10-heart-picture-disc","quantity":1}],"shippingCountryCode":"GB"}')"

# ===========================================================================
section "10. EVENTS, OBSERVABILITY AND THE SINGLE CREATIVE AUTHORITY"
crm "crm/automation-events?limit=500" >/dev/null
tc "the new automation events are published, each with its source" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["order_events"];names={e["event"] for e in d}
need={"ARTWORK.INPUT_VALIDATED","ARTWORK.PREPARATION_REQUIRED","ARTWORK.TEMPLATE_REQUIRED","ARTWORK.EXCEPTION","ARTWORK.READY","FULFILMENT.AUTHORISED","FULFILMENT.CONFIRMED","ORDER.COMPLETED","FOLLOW_UP.SENT","REVIEW.REQUESTED","ORDER.READY_FOR_PROCESSING"}
print(1 if need<=names and all(e["source"] for e in d if e["event"] in need) else 0)')"
tc "  → payment events come from the webhook, founder authorisation from a signed-in staff request" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["order_events"];s={(e["event"],e["source"]) for e in d};print(1 if ("ORDER.PAID","STRIPE_WEBHOOK") in s and ("FULFILMENT.AUTHORISED","STAFF") in s else 0)')"
tc "  → refused authorisation attempts are audited but not published to automation" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["order_events"];print(0 if any(e["event"]=="FULFILMENT.AUTHORISATION_REFUSED" for e in d) else 1)')"
tc "every name in the Founders' event model maps to one recorded automation event" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"));m=d["event_model"]
need=["ORDER.PAID","ORDER.READY_FOR_PROCESSING","CREATIVE.PENDING","CREATIVE.IN_PROGRESS","CREATIVE.READY","ARTWORK.INPUT_VALIDATED","ARTWORK.PREPARATION_REQUIRED","ARTWORK.TEMPLATE_REQUIRED","ARTWORK.READY","QC.REQUIRED","QC.PASSED","QC.FAILED","FULFILMENT.READY","FULFILMENT.APPROVAL_REQUIRED","FULFILMENT.AUTHORISED","SUPPLIER.ORDER_REQUIRED","SUPPLIER.ORDER_RECORDED","SHIPMENT.DISPATCHED","SHIPMENT.DELIVERED","REVEAL.READY","REVEAL.SENT","FOLLOW_UP.DUE","FOLLOW_UP.SENT","REVIEW.REQUESTED"]
print(1 if all(n in m and m[n] in d["automation_events"] for n in need) else 0)')"
t "every founder notification type is defined" "ARTWORK_EXCEPTION,AUDIO_CAPACITY_EXCEPTION,CREATIVE_EXCEPTION,CUSTOMER_SUPPORT_EXCEPTION,FULFILMENT_APPROVAL_REQUIRED,FULFILMENT_EXCEPTION,NEW_ORDER_READY_FOR_PROCESSING,PRODUCT_SALES_SUSPENDED,QC_EXCEPTION" "$(python3 -c 'import json;print(",".join(sorted(n["type"] for n in json.load(open("public/api/data/operations.json"))["founder_notifications"])))')"
t "financial authority belongs to Bella or Lewis only" '["BELLA","LEWIS"]' "$(python3 -c 'import json;print(json.dumps(json.load(open("public/api/data/operations.json"))["financial_authorisers"],separators=(",",":")))')"
tc "no customer approval was reintroduced: retired actions still refused, approval endpoint still retired" "$([ "$(act $KO REQUEST_APPROVAL >/dev/null; jget error)" = action_retired ] && [ "$(post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","action":"approve"}' >/dev/null; jget retired)" = true ] && echo 1 || echo 0)"
tc "no purchase, transfer, refund or subscription path exists in the new code" "$(grep -niE 'curl_init|stripe_request\(|/v1/refunds|/v1/transfers|/v1/payouts|/v1/subscriptions' public/api/lib/artwork.php public/api/lib/founder-notifications.php public/api/lib/sales-suspension.php public/api/crm/artwork.php public/api/crm/notifications.php public/api/crm/product-sales.php public/api/product-availability.php | grep -q . && echo 0 || echo 1)"
tc "no live Stripe key, bot token or real founder code in the repository" "$(git grep -nE 'sk_live_[A-Za-z0-9]{8,}|rk_live_[A-Za-z0-9]{8,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}' -- . ':!tests' | grep -q . && echo 0 || echo 1)"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
