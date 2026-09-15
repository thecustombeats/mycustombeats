#!/bin/bash
# MCB SPRINT 5 — OPERATIONS AFTER PAYMENT, CUSTOMER APPROVAL, ENQUIRIES.
#
# Same throwaway PHP + MariaDB stack and TEST config as the other suites
# (tests/README.md). Orders are paid with locally signed TEST webhooks; Resend
# is the local stub. NO REQUEST REACHES STRIPE, RESEND OR ANY SUPPLIER.
#
# Covers: the operational state model on top of order_production; the digital
# Moment and physical Keepsake workflows; secure approval and progress links;
# revision tracking; staff actions and their audit; the derived action queue
# and acknowledgements; lifecycle email idempotency, failure and test-mode
# safety; tracking; follow-up; MCB Priority Replacement requests; MCB LIVE and
# Bespoke enquiries; automation events; rate limits; and the migration.

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

stub_reset
reset_limits

# ===========================================================================
section "0. GENERATED DATA, MIGRATION AND PREFLIGHT"
tc "operations.json is generated and names the automation events" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"));print(1 if set(["ORDER.PAID","ORDER.READY_FOR_PROCESSING","QUALITY_CHECK.READY","QUALITY_CHECK.PASSED","QUALITY_CHECK.FAILED","REVEALED","FULFILMENT.READY","DISPATCHED","DELIVERED","FOLLOW_UP.DUE","MCB_LIVE.ENQUIRY_RECEIVED","BESPOKE.ENQUIRY_RECEIVED"])<=set(d["automation_events"]) else 0)')"
tc "no included revisions anywhere; reopen reasons exclude a customer request; the QC checklist is generated" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"));print(1 if "included_revisions" not in d and d["reopen_reasons"]==["MCB_CORRECTION","REPLACEMENT","OTHER"] and len(d["qc_checklist"])==13 and "APPROVAL_REQUIRED" not in d["lifecycle_templates"] else 0)')"
tc "the Priority Replacement window comes from the catalogue (7 days)" "$([ "$(python3 -c 'import json;print(json.load(open("public/api/data/operations.json"))["priority_replacement_claim_window_days"])')" = "7" ] && echo 1 || echo 0)"
tc "the digital customer journey never mentions making or posting" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"))["customer_stages"]["DIGITAL"];ids=[s["id"] for s in d];st=sum([s["states"] for s in d],[]);print(1 if "making" not in ids and "on-its-way" not in ids and not any(x.startswith(("FULFILMENT","DISPATCHED","DELIVERED")) for x in st) else 0)')"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS s5a; DROP DATABASE IF EXISTS s5b; CREATE DATABASE s5a; CREATE DATABASE s5b;' 2>/dev/null
ROOTQ s5a < db/schema.sql 2>/dev/null
git show 3ad6520c:db/schema.sql | ROOTQ s5b 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-14-sprint5-operations.sql 2>/dev/null; M1=$?
ROOTQ s5b < db/migrations/2026-09-14-sprint5-operations.sql 2>/dev/null; M2=$?
ROOTQ s5b < db/migrations/2026-09-15-single-creative-authority.sql 2>/dev/null; M3=$?
ROOTQ s5b < db/migrations/2026-09-15-single-creative-authority.sql 2>/dev/null; M4=$?
ROOTQ s5b < db/migrations/2026-09-15-automation-foundation.sql 2>/dev/null; M5=$?
ROOTQ s5b < db/migrations/2026-09-15-automation-foundation.sql 2>/dev/null; M6=$?
ROOTQ s5b < db/migrations/2026-09-15-creative-factory.sql 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-15-production-file-factory.sql 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-15-fulfilment-controller.sql 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-15-memory-music-video.sql 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-16-customer-care.sql 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-16-business-intelligence.sql 2>/dev/null
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the Sprint 5, Single Creative Authority and Automation Foundation migrations apply to the Sprint 4 schema, and again (idempotent)" "$([ "$M1" = 0 ] && [ "$M2" = 0 ] && [ "$M3" = 0 ] && [ "$M4" = 0 ] && [ "$M5" = 0 ] && [ "$M6" = 0 ] && echo 1 || echo 0)"
tc "a migrated database is identical to a fresh db/schema.sql" "$([ "$(dumpdb s5a | shasum)" = "$(dumpdb s5b | shasum)" ] && [ "$(dumpdb s5a | grep -c .)" -gt 25 ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE s5a; DROP DATABASE s5b;' 2>/dev/null
tc "the migrations only add: no DROP TABLE, DROP COLUMN, DELETE, TRUNCATE or RENAME" "$(grep -qiE '^\s*(DROP TABLE|DELETE|TRUNCATE|RENAME)|DROP COLUMN' db/migrations/2026-09-14-sprint5-operations.sql db/migrations/2026-09-15-single-creative-authority.sql db/migrations/2026-09-15-automation-foundation.sql && echo 0 || echo 1)"
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
tc "preflight reports both migrations, operations data and link secret" "$([ "$(pf sprint5_migration_applied)" = PASS ] && [ "$(pf creative_authority_migration_applied)" = PASS ] && [ "$(pf data_operations)" = PASS ] && [ "$(pf customer_links_secret)" = PASS ] && echo 1 || echo 0)"

# ===========================================================================
section "1. A PAID MOMENT: NEW ORDER READY FOR PROCESSING, CREATION, INTERNAL QUALITY CHECK, REVEAL"
QC_DIGITAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true}'
QC_PHYSICAL='"checklist":{"correct_order":true,"names":true,"details":true,"no_other_customer":true,"song_version":true,"spelling":true,"sku":true,"no_output_defect":true,"quality_standard":true,"photographs":true,"artwork_dimensions":true,"production_files":true,"delivery_information":true}'
STORY="The evening Grandad danced with Nan under the lanterns on deck nine."
paid_order "{\"sku\":\"moment\",\"email\":\"ops-moment@example.com\",\"units\":[{\"memories\":[{\"story\":\"$STORY\"}]}]}"
MO=$OID
t "the Moment is paid" "PAID" "$(q "SELECT status FROM orders WHERE id=$MO")"
MREF=$(q "SELECT mcb_reference FROM orders WHERE id=$MO")
t "operations see a new order ready for processing (CREATIVE.PENDING)" "CREATIVE.PENDING" "$(state_of $MO)"
tc "  → payment status is reported separately, as PAID" "$([ "$(jget payment_status)" = PAID ] && echo 1 || echo 0)"
tc "  → digital workflow: fulfilment NOT_REQUIRED; no revision allowance anywhere; nine internal checks" "$([ "$(jget workflow)" = DIGITAL ] && [ "$(jget operations.fulfilment.state)" = NOT_REQUIRED ] && [ "$(jget operations.revisions)" = null ] && [ "$(python3 -c 'import json;print(len(json.load(open("/tmp/tx.json"))["operations"]["quality_check"]["items"]))')" = 9 ] && echo 1 || echo 0)"
tc "  → next action and available actions are given" "$([ "$(jget operations.next_action)" = "Check the brief and start the creative work." ] && jget operations.available_actions | grep -q START_CREATIVE && ! jget operations.available_actions | grep -qE 'APPROVAL|CHANGES' && echo 1 || echo 0)"
tc "  → the staff view carries no supplier or cost data" "$(grep -qiE 'supplier_cost|cost_minor|margin|wholesale' /tmp/tx.json && echo 0 || echo 1)"
tc "the queue shows it as a new order ready for processing" "$(queue_has "ORDER:$MO:NEW_ORDER")"
t "  → ORDER.READY_FOR_PROCESSING was recorded once, at payment" 1 "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND event_type='ORDER.READY_FOR_PROCESSING'")"
J1="{\"order_id\":$MO,\"action\":\"START_CREATIVE\",\"staff\":\"X\"}"
t "order actions require the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/order-action" -H 'Content-Type: application/json' -d "$J1")"
t "the operations view requires the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/operations?view=queue")"
J2="{\"order_id\":$MO,\"action\":\"START_CREATIVE\"}"
t "an action without a staff name is refused" 422 "$(crmpost crm/order-action "$J2")"
t "an unknown action is refused" 422 "$(act $MO DELETE_EVERYTHING)"
for RETIRED in REQUEST_APPROVAL RECORD_APPROVAL RECORD_CHANGES_REQUEST REISSUE_APPROVAL_LINK MARK_CREATIVE_READY; do
  t "the retired customer-approval action $RETIRED is refused" "410|action_retired" "$(act $MO $RETIRED '"preview_url":"https://listen.example.test/a","channel":"EMAIL"')|$(jget error)"
done
t "passing the quality check before anything is created is refused" 409 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/a"')"
t "START_CREATIVE" 200 "$(act $MO START_CREATIVE)"
t "  → CREATIVE.IN_PROGRESS" "CREATIVE.IN_PROGRESS" "$(jget state)"
t "START_CREATIVE again changes nothing" "unchanged" "$(act $MO START_CREATIVE >/dev/null; jget outcome)"
t "SEND_TO_QUALITY_CHECK" 200 "$(act $MO SEND_TO_QUALITY_CHECK)"
t "  → QUALITY_CHECK" "QUALITY_CHECK" "$(jget state)"
t "  → a quality-check task in the queue" 1 "$(queue_has "ORDER:$MO:QUALITY_CHECK")"
act $MO ISSUE_STATUS_LINK >/dev/null; S1=$(link_token status)
J3="{\"token\":\"$S1\"}"
t "the customer's progress page during the quality check" 200 "$(post_json order-progress "$J3")"
tc "  → stage 'quality'; no reveal yet; no checklist, notes or internal detail" "$([ "$(jget stage)" = quality ] && [ "$(jget reveal)" = null ] && ! grep -qiE 'checklist|qc_|note|passed_by|approv' /tmp/tx.json && echo 1 || echo 0)"
t "a quality check with an incomplete checklist is refused" 422 "$(act $MO PASS_QUALITY_CHECK '"checklist":{"names":true},"reveal_url":"https://listen.example.test/a"')"
tc "  → and says what is still to check" "$(body | grep -q 'qc_checklist_incomplete' && body | grep -q 'spelling' && echo 1 || echo 0)"
t "a digital pass needs the private link to the checked song" 422 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL")"
t "an http (not https) reveal link is refused" 422 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"http://listen.example.test/a"')"
t "a javascript: reveal link is refused" 422 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"javascript:alert(1)"')"
stub_reset
t "failing the quality check needs a reason from the list" 422 "$(act $MO FAIL_QUALITY_CHECK '"reason":"DISLIKE"')"
t "the quality check fails internally (a name spelt wrongly)" 200 "$(act $MO FAIL_QUALITY_CHECK '"reason":"NAMES","note":"Nan is spelt Nann in verse two; correct it."')"
tc "  → back to creation for an internal correction; failure counted; the customer is not involved" "$([ "$(jget state)" = CREATIVE.IN_PROGRESS ] && [ "$(q "SELECT qc_failed_count FROM order_production WHERE order_id=$MO")" = 1 ] && [ "$(mail_count)" = 0 ] && echo 1 || echo 0)"
tc "  → the note is kept internally and the audit event holds no note text" "$([ "$(q "SELECT COUNT(*) FROM order_staff_notes WHERE order_id=$MO AND note LIKE 'Quality check failed:%'")" = 1 ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND detail LIKE '%Nann%'")" = 0 ] && echo 1 || echo 0)"
tc "  → the customer's page just says we are still creating" "$(post_json order-progress "$J3" >/dev/null; [ "$(jget stage)" = creating ] && ! grep -qiE 'fail|Nann|quality check fail' /tmp/tx.json && echo 1 || echo 0)"
t "  → the correction is queued as creative work" 1 "$(queue_has "ORDER:$MO:CREATIVE_WORK:0:1")"
act $MO SEND_TO_QUALITY_CHECK >/dev/null
stub_reset
t "PASS_QUALITY_CHECK with every check and the private link" 200 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/moment-v1"')"
tc "  → revealed at once and so COMPLETED (follow-up separate); CREATION_READY email sent; status link returned" "$([ "$(jget state)" = COMPLETED ] && [ "$(jget emails.CREATION_READY)" = sent ] && jget links.status | grep -qE '^http://localhost:8080/your-order#[A-Za-z0-9_-]{43}$' && echo 1 || echo 0)"
tc "  → evidence is MCB's quality check, not a customer approval" "$([ "$(q "SELECT CONCAT(stage,'|',qc_passed_by,'|',IF(qc_passed_at IS NULL,'no','yes'),'|',IFNULL(approved_at,'none'),'|',IFNULL(approval_channel,'none'),'|',IF(revealed_at IS NULL,'no','yes')) FROM order_production WHERE order_id=$MO")" = "COMPLETED|Ops Tester|yes|none|none|yes" ] && echo 1 || echo 0)"
t "  → no approval link was ever issued" 0 "$(q "SELECT COUNT(*) FROM order_access_tokens WHERE order_id=$MO AND purpose='APPROVAL'")"
MAIL=$(mail_log)
tc "  → the reveal email: 'Your MCB creation is ready', the private order-page link and the reference" "$(echo "$MAIL" | grep -q 'Your MCB creation is ready' && echo "$MAIL" | grep -qF "your-order#$S1" && echo "$MAIL" | grep -qF "$MREF" && echo 1 || echo 0)"
tc "  → one-way: no approve, change or remake buttons, and never the story or the song link itself" "$(echo "$MAIL" | grep -qiE 'approve|request changes|remake|revision|refine|lanterns|Grandad|listen.example.test' && echo 0 || echo 1)"
t "  → one CREATION_READY email on record" 1 "$(sent_count $MO CREATION_READY)"
t "passing it again is refused" 409 "$(act $MO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/moment-v2"')"
t "revealing again is refused" 409 "$(act $MO SEND_REVEAL)"

section "2. THE REVEAL PAGE, AND OLD APPROVAL LINKS THAT NO LONGER DO ANYTHING"
t "progress with the status link" 200 "$(post_json order-progress "$J3")"
tc "  → reference, DIGITAL, stage 'ready', the private reveal link" "$([ "$(jget reference)" = "$MREF" ] && [ "$(jget workflow)" = DIGITAL ] && [ "$(jget stage)" = ready ] && [ "$(jget reveal.url)" = "https://listen.example.test/moment-v1" ] && echo 1 || echo 0)"
tc "  → Moment stages only: received, creating, quality, ready" "$([ "$(python3 -c 'import json;print(",".join(s["id"] for s in json.load(open("/tmp/tx.json"))["stages"]))')" = "received,creating,quality,ready" ] && echo 1 || echo 0)"
tc "  → no delivery, no items, no personal data, no approval flag" "$([ "$(jget delivery)" = null ] && [ "$(jget items)" = "[]" ] && ! grep -qiE 'ops-moment|lanterns|order_id|email|awaiting_your_approval|Nann' /tmp/tx.json && echo 1 || echo 0)"
J17="{\"token\":\"$MREF\",\"reference\":\"$MREF\"}"
t "progress cannot be looked up by reference" 404 "$(post_json order-progress "$J17")"
# A legacy approval link issued under the retired model (historical/test orders):
# rebuilt exactly as the server built them — HMAC under the test token secret.
LNONCE=$(openssl rand -hex 16)
LTOK=$(python3 -c 'import hmac,hashlib,base64,sys;print(base64.urlsafe_b64encode(hmac.new(b"test_token_secret_not_real_00000000000000000000000",("mcb-access|APPROVAL|%s|%s"%(sys.argv[1],sys.argv[2])).encode(),hashlib.sha256).digest()).decode().rstrip("="))' "$MO" "$LNONCE")
q "INSERT INTO order_access_tokens (order_id,purpose,nonce,token_hash,approval_round,expires_at,created_by,created_at) VALUES ($MO,'APPROVAL','$LNONCE',SHA2('$LTOK',256),1,UTC_TIMESTAMP()+INTERVAL 30 DAY,'legacy',UTC_TIMESTAMP())"
BEFORE="$(q "SELECT CONCAT(stage,'|',IFNULL(approved_at,'none')) FROM order_production WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM order_change_requests WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")"
stub_reset
for LACT in view approve request_changes; do
  LBODY=$(python3 -c 'import json,sys;print(json.dumps({"token":sys.argv[1],"action":sys.argv[2],"feedback":"Make the chorus slower please."}))' "$LTOK" "$LACT")
  echo "$LBODY" > /tmp/legacy-body-$LACT.json
  t "an old approval link ($LACT) gets the polite retired answer" 200 "$(post_json order-approval "$LBODY")"
  tc "  → retired, with nothing about the order" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));print(1 if d.get("retired") is True and set(d)=={"retired","message"} else 0)')"
done
t "  → and changed nothing: stage, events, change requests, emails" "$BEFORE" "$(q "SELECT CONCAT(stage,'|',IFNULL(approved_at,'none')) FROM order_production WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM order_change_requests WHERE order_id=$MO")|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$MO")"
t "  → an unknown token gets exactly the same answer" "$(post_json order-approval "{\"token\":\"$LTOK\",\"action\":\"view\"}" >/dev/null; body)" "$(post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","action":"approve"}' >/dev/null; body)"
t "a cross-origin request to the retired endpoint is refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/order-approval" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "{\"token\":\"$LTOK\",\"action\":\"approve\"}")"
t "an approval link cannot open the progress page" 404 "$(post_json order-progress "{\"token\":\"$LTOK\"}")"
J18="{\"token\":\"$S1\",\"kind\":\"DAMAGED_OR_FAULTY\",\"description\":\"The file arrived broken somehow\"}"
t "a digital order cannot report a damaged item" 422 "$(post_json order-support "$J18")"
J18B="{\"token\":\"$S1\",\"kind\":\"INCORRECT_DETAIL\",\"description\":\"You sang Nancy but my grandmother is called Nan.\"}"
t "a Moment customer reports an incorrect detail" 201 "$(post_json order-support "$J18B")"
tc "  → queued for staff as an incorrect-detail report" "$(crm 'crm/operations?view=queue' >/dev/null; python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["items"];print(1 if any(i["kind"]=="INCORRECT_DETAIL" and "creative preference is not a revision" in i["detail"] for i in d) else 0)')"
tc "  → and it does NOT reopen production by itself" "$([ "$(state_of $MO)" = COMPLETED ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND event_type='PRODUCTION.REOPENED'")" = 0 ] && echo 1 || echo 0)"
J19="{\"token\":\"$S1\",\"kind\":\"QUESTION\",\"description\":\"Can I have the song as an MP3 as well please?\"}"
t "a question from a Moment customer" 201 "$(post_json order-support "$J19")"
t "  → in the queue as a customer question" 1 "$(queue_has "SERVICE:")"
t "follow-up recorded, with the check-in email" 200 "$(act $MO RECORD_FOLLOW_UP '"send_email":true')"
t "  → one FOLLOW_UP email" 1 "$(sent_count $MO FOLLOW_UP)"
t "  → follow-up again is refused" 409 "$(act $MO RECORD_FOLLOW_UP)"
t "MARK_COMPLETED" "COMPLETED" "$(act $MO MARK_COMPLETED >/dev/null; jget state)"
J20="{\"token\":\"$S1\"}"
tc "  → the customer's page keeps the reveal, every stage done" "$(post_json order-progress "$J20" >/dev/null; [ "$(jget stage)" = ready ] && [ "$(jget reveal.url)" = "https://listen.example.test/moment-v1" ] && python3 -c 'import json,sys;sys.exit(0 if all(s["status"]=="done" for s in json.load(open("/tmp/tx.json"))["stages"]) else 1)' && echo 1 || echo 0)"
J21="{\"order_id\":$MO}"
t "no review request while the customer has an open support case (recovery cooling)" "409|recovery_cooling" "$(crmpost crm/review-request "$J21")|$(jget outcome)"
q "UPDATE order_service_requests SET status='CLOSED', review_request_hold_until = UTC_TIMESTAMP() - INTERVAL 1 DAY WHERE order_id=$MO" >/dev/null
t "the review request works for the completed order (review URL from config)" 200 "$(crmpost crm/review-request "$J21")"
tc "the Moment's audit trail tells the story in order, with no customer text and no customer approval" "$(E=$(events_of $MO); echo "$E" | grep -q 'ORDER.PAID.*ORDER.READY_FOR_PROCESSING.*CREATIVE.IN_PROGRESS.*QUALITY_CHECK.READY.*QUALITY_CHECK.FAILED.*QUALITY_CHECK.READY.*QUALITY_CHECK.PASSED.*REVEALED.*ORDER.COMPLETED.*FOLLOW_UP.DUE.*FOLLOW_UP.DONE' && ! echo "$E" | grep -q 'CUSTOMER.APPROVAL\|CUSTOMER.CHANGES' && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND (detail LIKE '%lanterns%' OR detail LIKE '%@%' OR detail LIKE '%MP3%' OR detail LIKE '%Nancy%')")" = 0 ] && echo 1 || echo 0)"

# ===========================================================================
section "4. A KEEPSAKE: QUALITY CHECK GATES FULFILMENT; NO CUSTOMER APPROVAL"
reset_limits
paid_order '{"sku":"keepsake-7-picture-disc","email":"ops-keepsake@example.com","units":[{"pr":true},{"pr":false}]}'
KO=$OID; KREF=$(q "SELECT mcb_reference FROM orders WHERE id=$KO")
t "the two-Keepsake order is paid (each with its artwork photograph)" "PAID|2" "$(q "SELECT status FROM orders WHERE id=$KO")|$(q "SELECT COUNT(*) FROM order_uploads WHERE order_id=$KO")"
crm "crm/operations?order=$KO" >/dev/null
tc "  → PHYSICAL; fulfilment PENDING; thirteen internal checks; no revision allowance" "$([ "$(jget workflow)" = PHYSICAL ] && [ "$(jget operations.fulfilment.state)" = PENDING ] && [ "$(python3 -c 'import json;print(len(json.load(open("/tmp/tx.json"))["operations"]["quality_check"]["items"]))')" = 13 ] && [ "$(jget operations.revisions)" = null ] && echo 1 || echo 0)"
stub_reset
act $KO START_CREATIVE >/dev/null; act $KO SEND_TO_QUALITY_CHECK >/dev/null
t "the Keepsake cannot be placed with a partner before the quality check" 409 "$(act $KO CONFIRM_FULFILMENT '"purchase_authorised_by":"BELLA"')"
t "a physical quality check needs the physical items too" 422 "$(act $KO PASS_QUALITY_CHECK "$QC_DIGITAL")"
tc "  → including photographs, artwork dimensions, production files and delivery information" "$(body | grep -q 'photographs' && body | grep -q 'delivery information' && echo 1 || echo 0)"
t "the physical pass is refused until the production artwork is registered and checked" "409|artwork_not_ready" "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")|$(jget error)"
register_artwork $KO
STRIPE_BEFORE=$(stub_count)
t "PASS_QUALITY_CHECK (physical)" 200 "$(act $KO PASS_QUALITY_CHECK "$QC_PHYSICAL")"
t "  → FULFILMENT.READY (address and personalisation present) — no approval gate" "FULFILMENT.READY" "$(jget state)"
tc "  → no reveal and no email before the keepsake arrives" "$([ "$(q "SELECT IF(revealed_at IS NULL,'none','revealed') FROM order_production WHERE order_id=$KO")" = none ] && [ "$(mail_count)" = 0 ] && echo 1 || echo 0)"
t "  → a FULFILMENT.READY task in the queue" 1 "$(queue_has "ORDER:$KO:FULFILMENT_READY")"
tc "  → which says nothing is ordered automatically and Bella or Lewis authorises the purchase" "$(grep -q 'Nothing is ordered automatically' /tmp/tx.json && grep -q 'Bella or Lewis authorises the supplier purchase' /tmp/tx.json && echo 1 || echo 0)"
tc "  → and no request went to Stripe or anywhere else" "$([ "$(stub_count)" = "$STRIPE_BEFORE" ] && echo 1 || echo 0)"
J23="\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\""
t "dispatch before the physical order is confirmed is refused" 409 "$(act $KO MARK_DISPATCHED "$J23")"
t "the supplier order cannot be recorded before Bella or Lewis authorises the purchase" "409|founder_authorisation_required" "$(act $KO CONFIRM_FULFILMENT '"fulfilment_reference":"PO-778","purchase_authorised_by":"LEWIS"')|$(jget error)"
t "  → saying who authorised it is not an authorisation" "FULFILMENT.READY" "$(state_of $KO)"
t "Lewis authorises the supplier purchase with his own code" "200|FULFILMENT.AUTHORISED" "$(founder_authorise $KO LEWIS "$FOUNDER_CODE_LEWIS")|$(jget state /tmp/fa.json)"
t "CONFIRM_FULFILMENT (placed by hand, authorised by Lewis)" "FULFILMENT.CONFIRMED" "$(act $KO CONFIRM_FULFILMENT '"fulfilment_reference":"PO-778"' >/dev/null; jget state)"
t "  → the production lock and the authorisation are recorded" "PRODUCTION_LOCKED|yes|LEWIS" "$(q "SELECT CONCAT(stage,'|',IF(production_locked_at IS NULL,'no','yes'),'|',supplier_purchase_authorised_by) FROM order_production WHERE order_id=$KO")"
tc "  → one one-way 'being made' email, with nothing to approve" "$([ "$(sent_count $KO IN_PRODUCTION)" = 1 ] && mail_log | grep -q 'Your keepsake is being made' && ! mail_log | grep -qiE 'approve|request changes|remake' && echo 1 || echo 0)"
J24="\"dispatched_on\":\"$TODAY\""
t "dispatch needs a carrier" 422 "$(act $KO MARK_DISPATCHED "$J24")"
t "dispatch cannot be in the future" 422 "$(act $KO MARK_DISPATCHED '"carrier":"Royal Mail","dispatched_on":"2099-01-01"')"
J25="\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\",\"tracking_url\":\"javascript:alert(1)\""
t "a tracking link must be https" 422 "$(act $KO MARK_DISPATCHED "$J25")"
stub_reset
J26="\"carrier\":\"Royal Mail\",\"tracking_reference\":\"RM123456789GB\",\"tracking_url\":\"https://track.example.test/RM123456789GB\",\"dispatched_on\":\"$TODAY\""
t "MARK_DISPATCHED with tracking" "DISPATCHED" "$(act $KO MARK_DISPATCHED "$J26" >/dev/null; jget state)"
tc "  → one 'on the way' email, with the carrier and tracking MCB entered" "$([ "$(sent_count $KO DISPATCHED)" = 1 ] && mail_log | grep -q 'RM123456789GB' && mail_log | grep -q 'Royal Mail' && mail_log | grep -q 'Your order is on the way' && echo 1 || echo 0)"
tc "  → not marked delivered automatically" "$([ "$(q "SELECT IFNULL(delivered_on,'none') FROM order_production WHERE order_id=$KO")" = none ] && echo 1 || echo 0)"
act $KO ISSUE_STATUS_LINK >/dev/null; KS=$(link_token status)
J27="{\"token\":\"$KS\"}"
t "progress (physical)" 200 "$(post_json order-progress "$J27")"
tc "  → on its way, with carrier and tracking; six physical stages; no reveal link" "$([ "$(jget stage)" = on-its-way ] && [ "$(jget delivery.carrier)" = "Royal Mail" ] && [ "$(jget delivery.tracking_url)" = "https://track.example.test/RM123456789GB" ] && [ "$(python3 -c 'import json;print(",".join(s["id"] for s in json.load(open("/tmp/tx.json"))["stages"]))')" = "received,creating,quality,making,on-its-way,delivered" ] && [ "$(jget reveal)" = null ] && echo 1 || echo 0)"
tc "  → two items by position, only item-1 has Priority Replacement, no window before delivery" "$([ "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["items"];print(",".join(i["key"]+":"+("PR" if i["priority_replacement"] else "-") for i in d))')" = "item-1:PR,item-2:-" ] && [ "$(jget items.0.priority_replacement.request_by)" = null ] && echo 1 || echo 0)"
tc "  → no address, email, supplier reference, authorisation or amounts" "$(grep -qiE 'Harbour|Southampton|ops-keepsake|PO-778|LEWIS|minor' /tmp/tx.json && echo 0 || echo 1)"
J28="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-1\",\"priorityReplacement\":true,\"description\":\"Arrived early at a neighbour, sleeve is torn.\"}"
t "Priority Replacement before delivery is recorded" 201 "$(post_json order-support "$J28")"
t "  → eligibility DELIVERY_NOT_CONFIRMED for staff" "DELIVERY_NOT_CONFIRMED" "$(q "SELECT eligibility FROM order_service_requests WHERE order_id=$KO ORDER BY id DESC LIMIT 1")"
tc "  → the customer is told their normal rights are not affected; no promise, no warranty" "$(grep -q 'normal consumer rights are not affected' /tmp/tx.json && ! grep -qiE 'warranty|guarantee|insurance|will replace' /tmp/tx.json && echo 1 || echo 0)"
t "MARK_DELIVERY_DELAYED" 200 "$(act $KO MARK_DELIVERY_DELAYED)"
t "  → a delivery delay in the queue" 1 "$(queue_has "ORDER:$KO:DELIVERY_DELAY")"
J29="{\"action\":\"ACKNOWLEDGE\",\"item_key\":\"ORDER:$KO:DELIVERY_DELAY:0\",\"staff\":\"Ops Tester\",\"note\":\"Chased Royal Mail\"}"
t "acknowledging a queue item" 200 "$(crmpost crm/operations "$J29")"
tc "  → shown as acknowledged, by whom, and audited" "$(crm 'crm/operations?view=queue' >/dev/null; python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));i=[x for x in d["items"] if x["key"]==sys.argv[1]];print(1 if i and i[0]["acknowledged"] and i[0]["acknowledged"]["staff"]=="Ops Tester" else 0)' "ORDER:$KO:DELIVERY_DELAY:0")$([ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$KO AND event_type='QUEUE.ACKNOWLEDGED'")" = 1 ] && echo '' || echo X)"
t "acknowledging an item that is not in the queue is refused" 404 "$(crmpost crm/operations '{"action":"ACKNOWLEDGE","item_key":"ORDER:999999:OVERDUE:0","staff":"Ops Tester"}')"
t "delivery before dispatch date is refused" 422 "$(act $KO MARK_DELIVERED '"delivered_on":"2020-01-01"')"
J30="\"delivered_on\":\"$TODAY\""
t "MARK_DELIVERED (a person confirms it: the reveal) completes the order" "COMPLETED" "$(act $KO MARK_DELIVERED "$J30" >/dev/null; jget state)"
t "  → the delay item has gone" 0 "$(queue_has "ORDER:$KO:DELIVERY_DELAY")"
post_json order-progress "{\"token\":\"$KS\"}" >/dev/null
tc "  → progress shows delivered, and item-1's request-by date is 7 days after delivery" "$([ "$(jget stage)" = delivered ] && [ "$(jget items.0.priority_replacement.request_by)" = "$(date -u -v+7d +%Y-%m-%d 2>/dev/null || date -u -d '+7 days' +%Y-%m-%d)" ] && echo 1 || echo 0)"
reset_limits
J31="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-1\",\"priorityReplacement\":true,\"description\":\"The disc is cracked across the label.\"}"
t "Priority Replacement within the window" 201 "$(post_json order-support "$J31")"
tc "  → ELIGIBLE, told it will be looked at under the service — not that it will be replaced" "$([ "$(q "SELECT eligibility FROM order_service_requests WHERE order_id=$KO ORDER BY id DESC LIMIT 1")" = ELIGIBLE ] && grep -q 'under MCB Priority Replacement' /tmp/tx.json && ! grep -qiE 'warranty|guarantee|insurance|will replace|replacement is on' /tmp/tx.json && echo 1 || echo 0)"
J32="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-2\",\"priorityReplacement\":true,\"description\":\"This one is warped slightly at the edge.\"}"
t "Priority Replacement for the item that did not have it" 201 "$(post_json order-support "$J32")"
t "  → NOT_PURCHASED, still recorded for staff" "NOT_PURCHASED" "$(q "SELECT eligibility FROM order_service_requests WHERE order_id=$KO ORDER BY id DESC LIMIT 1")"
J32B="{\"token\":\"$KS\",\"kind\":\"INCORRECT_DETAIL\",\"description\":\"The artwork uses our neighbour's photograph, not ours.\"}"
t "an incorrect-detail report on a physical order" 201 "$(post_json order-support "$J32B")"
tc "  → queued; production is not reopened by the report" "$(queue_has "SERVICE:" >/dev/null; [ "$(q "SELECT COUNT(*) FROM order_service_requests WHERE order_id=$KO AND kind='INCORRECT_DETAIL'")" = 1 ] && [ "$(state_of $KO)" = COMPLETED ] && echo 1 || echo 0)"
q "UPDATE order_production SET delivered_on = UTC_DATE() - INTERVAL 10 DAY, dispatched_on = UTC_DATE() - INTERVAL 11 DAY WHERE order_id=$KO"
J33="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-1\",\"priorityReplacement\":true,\"description\":\"Found another scratch today on side A.\"}"
t "Priority Replacement after the window" "OUTSIDE_WINDOW" "$(post_json order-support "$J33" >/dev/null; q "SELECT eligibility FROM order_service_requests WHERE order_id=$KO ORDER BY id DESC LIMIT 1")"
J34="{\"token\":\"$KS\",\"kind\":\"DAMAGED_OR_FAULTY\",\"item\":\"item-9\",\"description\":\"Something else went wrong here.\"}"
reset_limits
t "an unknown item is refused" 422 "$(post_json order-support "$J34")"
tc "damaged-item reports are in the queue; the eligible one is flagged" "$(crm 'crm/operations?view=queue' >/dev/null; python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["items"];r=[i for i in d if i["kind"]=="REPLACEMENT_REQUEST"];print(1 if len(r)>=4 and any("PRIORITY_REPLACEMENT_ELIGIBLE" in i["flags"] for i in r) else 0)')"
SR=$(q "SELECT id FROM order_service_requests WHERE order_id=$KO AND eligibility='ELIGIBLE' LIMIT 1")
J35="\"request_id\":$SR,\"status\":\"RESOLVED\""
t "resolving needs a resolution" 422 "$(act $KO UPDATE_SERVICE_REQUEST "$J35")"
J36="\"request_id\":$SR,\"status\":\"RESOLVED\",\"resolution\":\"REPLACEMENT_ARRANGED\""
t "resolving a request" 200 "$(act $KO UPDATE_SERVICE_REQUEST "$J36")"
t "  → it leaves the queue" 0 "$(queue_has "SERVICE:$SR:")"
J37="\"request_id\":$SR,\"status\":\"RESOLVED\",\"resolution\":\"OTHER\""
t "a request id from another order is not found" 404 "$(act $MO UPDATE_SERVICE_REQUEST "$J37")"
t "staff note" 200 "$(act $KO ADD_NOTE '"note":"Customer prefers WhatsApp. Supplier cost £12 — internal."')"
J38="{\"token\":\"$KS\"}"
tc "  → stored, audited without its text, never on the customer page" "$([ "$(q "SELECT COUNT(*) FROM order_staff_notes WHERE order_id=$KO")" = 1 ] && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$KO AND detail LIKE '%WhatsApp.%'")" = 0 ] && post_json order-progress "$J38" >/dev/null && ! grep -qi 'prefers' /tmp/tx.json && echo 1 || echo 0)"
t "a customer-request reopen no longer exists" 422 "$(act $KO REOPEN '"reason":"CUSTOMER_REQUEST"')"
t "reopening after delivery for an MCB correction" 200 "$(act $KO REOPEN '"reason":"MCB_CORRECTION"')"
tc "  → back to creation (in progress), quality check cleared, with a warning that nothing changes with a supplier" "$([ "$(jget state)" = CREATIVE.IN_PROGRESS ] && jget warning | grep -q 'does not cancel or change anything with a supplier' && [ "$(q "SELECT CONCAT(IFNULL(qc_passed_at,'none'),'|',IFNULL(supplier_purchase_authorised_by,'none'))  FROM order_production WHERE order_id=$KO")" = "none|none" ] && echo 1 || echo 0)"
tc "  → history kept in the audit trail" "$(events_of $KO | grep -q 'QUALITY_CHECK.PASSED.*FULFILMENT.READY.*FULFILMENT.AUTHORISED.*FULFILMENT.CONFIRMED.*DISPATCHED.*DELIVERY.DELAYED.*DELIVERED.*ORDER.COMPLETED.*PRODUCTION.REOPENED' && echo 1 || echo 0)"
t "an invalid reopen reason is refused" 422 "$(act $MO REOPEN '"reason":"BECAUSE"')"

# ===========================================================================
section "5. JOURNEY, MISSING INFORMATION, PAYMENT STATE, LEGACY RECORDS"
reset_limits
paid_order '{"sku":"journey-6","email":"ops-journey@example.com"}'
JO=$OID
t "a Journey carries no revision allowance" null "$(crm "crm/operations?order=$JO" >/dev/null; jget operations.revisions)"
q "DELETE FROM delivery_addresses WHERE order_id=$JO"
t "a physical order with no address is missing information" 1 "$(queue_has "ORDER:$JO:MISSING_INFORMATION:address")"
act $JO SEND_TO_QUALITY_CHECK >/dev/null
register_artwork $JO
t "a passed quality check without an address holds fulfilment PENDING" "FULFILMENT.PENDING" "$(act $JO PASS_QUALITY_CHECK "$QC_PHYSICAL" >/dev/null; jget state)"
t "  → with the reason" "DELIVERY_ADDRESS" "$(q "SELECT fulfilment_pending_reason FROM order_production WHERE order_id=$JO")"
t "  → it cannot be marked ready until resolved" 409 "$(act $JO SET_FULFILMENT_READY)"
reset_limits
order '{"sku":"moment","email":"ops-unpaid@example.com"}'
UO=$OID
t "an unpaid order cannot move through operations" 409 "$(act $UO START_CREATIVE)"
t "  → and says it is a payment matter" "order_not_paid" "$(jget error)"
t "  → nor issue a customer link" 409 "$(act $UO ISSUE_STATUS_LINK)"
q "UPDATE orders SET status='PAYMENT_REVIEW' WHERE id=$UO"
t "PAYMENT_REVIEW orders are in the queue" 1 "$(queue_has "PAYMENT:order:$UO")"
J39="{\"order_id\":$JO,\"stage\":\"COMPLETED\",\"approval_channel\":\"EMAIL\"}"
t "the legacy stage endpoint is retired" 410 "$(crmpost crm/production "$J39")"
t "  → and changed nothing" "FULFILMENT.PENDING" "$(state_of $JO)"
reset_limits
paid_order '{"sku":"moment","email":"ops-legacy@example.com"}'
LG=$OID
q "UPDATE order_production SET stage='AWAITING_APPROVAL', approval_round=1, creative_started_at=UTC_TIMESTAMP() WHERE order_id=$LG"
t "a historical order left awaiting customer approval reads as awaiting the quality check" "QUALITY_CHECK" "$(state_of $LG)"
t "  → and MCB's quality check completes it without the customer" "COMPLETED" "$(act $LG PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/legacy","send_email":false' >/dev/null; jget state)"
paid_order '{"sku":"moment","email":"ops-legacy2@example.com"}'
LG2=$OID
q "UPDATE order_production SET stage='APPROVED', approved_at=UTC_TIMESTAMP(), approval_channel='EMAIL', approval_round=1 WHERE order_id=$LG2"
t "a historical approved Moment keeps its evidence and reads as revealed" "REVEALED|EMAIL" "$(state_of $LG2)|$(q "SELECT approval_channel FROM order_production WHERE order_id=$LG2")"
t "  → and can be completed" "COMPLETED" "$(act $LG2 MARK_COMPLETED >/dev/null; jget state)"

# ===========================================================================
section "6. OVERDUE, FOLLOW-UP AND FAILED EMAIL"
reset_limits
paid_order '{"sku":"moment","email":"ops-late@example.com"}'
LO=$OID
t "a new Moment is not overdue" 0 "$(queue_has "ORDER:$LO:OVERDUE")"
q "UPDATE order_events SET created_at = UTC_TIMESTAMP() - INTERVAL 2 HOUR WHERE order_id=$LO AND dedupe_key='paid'"
t "two hours is within MCB's internal objective — no customer promise of an hour" 0 "$(queue_has "ORDER:$LO:OVERDUE")"
q "UPDATE order_events SET created_at = UTC_TIMESTAMP() - INTERVAL 25 HOUR WHERE order_id=$LO AND dedupe_key='paid'"
t "a Moment paid 25 hours ago and not yet revealed is overdue (internal 24-hour objective)" 1 "$(queue_has "ORDER:$LO:OVERDUE")"
act $LO SEND_TO_QUALITY_CHECK >/dev/null
docker exec mcb-api sh -c 'echo http_fail > /tmp/resend-mode'
t "the reveal while email is failing" "failed" "$(act $LO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/late"' >/dev/null; jget emails.CREATION_READY)"
tc "  → the state still moved and staff still have the order-page link to share" "$([ "$(jget state)" = COMPLETED ] && jget links.status | grep -q '/your-order#' && echo 1 || echo 0)"
t "  → the failure is kept (FAILED) and audited" "FAILED|1" "$(q "SELECT status FROM customer_communications WHERE order_id=$LO AND message_type='CREATION_READY'")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$LO AND event_type='CUSTOMER.MESSAGE.FAILED'")"
t "  → and surfaced in the queue" 1 "$(queue_has "MESSAGE:")"
docker exec mcb-api sh -c 'echo ok > /tmp/resend-mode'
KEY=$(q "SELECT dedupe_key FROM customer_communications WHERE order_id=$LO AND message_type='CREATION_READY'")
J40="\"type\":\"CREATION_READY\",\"dedupe_key\":\"$KEY\""
t "retrying the failed email" "sent" "$(act $LO RETRY_MESSAGE "$J40" >/dev/null; jget emails.CREATION_READY)"
t "  → now SENT, still one row" "SENT|1" "$(q "SELECT status FROM customer_communications WHERE order_id=$LO AND message_type='CREATION_READY'")|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$LO AND message_type='CREATION_READY'")"
t "  → retrying a sent email is refused" 409 "$(act $LO RETRY_MESSAGE "$J40")"
t "  → a retired approval email type cannot be retried" 409 "$(act $LO RETRY_MESSAGE '"type":"APPROVAL_REQUIRED","dedupe_key":"round-0-1"')"

section "7. TEST-MODE EMAIL NEVER REACHES A CUSTOMER BY ACCIDENT"
reset_limits
paid_order '{"sku":"moment","email":"real-customer@example.com"}'
TO=$OID
act $TO SEND_TO_QUALITY_CHECK >/dev/null
with_config "unset(\$c['resend']['test_mode_send_to_customer']);"
stub_reset
t "TEST payment, no test recipient: the reveal email is skipped" "skipped_test_mode" "$(act $TO PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/t"' >/dev/null; jget emails.CREATION_READY)"
tc "  → nothing sent, nothing claimed" "$([ "$(mail_count)" = 0 ] && [ "$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$TO")" = 0 ] && echo 1 || echo 0)"
restore_config
paid_order '{"sku":"moment","email":"real-customer-2@example.com"}'
TO2=$OID
act $TO2 SEND_TO_QUALITY_CHECK >/dev/null
with_config "unset(\$c['resend']['test_mode_send_to_customer']); \$c['resend']['test_recipient'] = 'rehearsal-inbox@example.test';"
stub_reset
t "with a test recipient configured" "sent" "$(act $TO2 PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/t2"' >/dev/null; jget emails.CREATION_READY)"
tc "  → sent to the rehearsal inbox with [TEST], never to the customer" "$(mail_log | grep -q 'rehearsal-inbox@example.test' && mail_log | grep -q '\[TEST\]' && ! mail_log | grep -q 'real-customer-2@example.com' && echo 1 || echo 0)"
restore_config
paid_order '{"sku":"moment","email":"weak-secret@example.com"}'
TO3=$OID
act $TO3 SEND_TO_QUALITY_CHECK >/dev/null
with_config "\$c['token_secret'] = 'short';"
t "a weak token secret refuses to reveal (no safe link can be issued)" 503 "$(act $TO3 PASS_QUALITY_CHECK "$QC_DIGITAL"',"reveal_url":"https://listen.example.test/t3"')"
t "  → and nothing changed" "QUALITY_CHECK|none" "$(q "SELECT CONCAT(stage,'|',IFNULL(revealed_at,'none')) FROM order_production WHERE order_id=$TO3")"
restore_config

# ===========================================================================
section "8. LINK LIFETIME, REVOCATION AND RATE LIMITS"
reset_limits
J42="{\"token\":\"$S1\"}"
t "an expired status link" 404 "$(q "UPDATE order_access_tokens SET expires_at = UTC_TIMESTAMP() - INTERVAL 1 MINUTE WHERE order_id=$MO AND purpose='STATUS'"; post_json order-progress "$J42")"
t "a fresh status link for the customer" 200 "$(act $MO ISSUE_STATUS_LINK)"
S3=$(link_token status)
J43="{\"token\":\"$S3\"}"
t "  → works" 200 "$(post_json order-progress "$J43")"
t "REVOKE_LINKS" 200 "$(act $MO REVOKE_LINKS '"purpose":"STATUS"')"
J44="{\"token\":\"$S3\"}"
t "  → the link stops working" 404 "$(post_json order-progress "$J44")"
reset_limits
for i in $(seq 1 60); do post_json order-progress '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' >/dev/null; done
t "the 61st progress lookup in 10 minutes is rate limited" 429 "$(post_json order-progress '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')"
reset_limits
for i in $(seq 1 30); do post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' >/dev/null; done
t "the retired approval endpoint is still rate limited (31st request)" 429 "$(post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')"
reset_limits
for i in $(seq 1 60); do post_json order-quote '{"lines":[{"sku":"moment","quantity":1}]}' >/dev/null; done
t "the 61st quote in 10 minutes is rate limited" 429 "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1}]}')"
reset_limits
for i in $(seq 1 120); do post_json order-status '{"orderId":1,"checkoutToken":"x"}' >/dev/null; done
t "the 121st order-status lookup is rate limited" 429 "$(post_json order-status '{"orderId":1,"checkoutToken":"x"}')"
reset_limits
t "  → and a normal quote works again once the window clears" 200 "$(post_json order-quote '{"lines":[{"sku":"moment","quantity":1}]}')"

# ===========================================================================
section "9. MCB LIVE ENQUIRY"
reset_limits
LIVE_OK='{"requestType":"AVAILABILITY_AND_QUOTE","name":"Ada Event","email":"Ada.Event@Example.com","phone":"+447700900123","eventType":"Wedding on a yacht","eventDate":"2099-06-20","location":"Mallorca, Spain","performer":"TOGETHER","duration":"3_HOURS","approximateBudget":"€8,000","songReveal":"YES","details":"<script>alert(1)</script> We would love the Song Reveal at the first dance."}'
t "a complete MCB LIVE enquiry" 201 "$(post_json live/enquiry "$LIVE_OK")"
LREF=$(jget reference)
tc "  → LIVE-YYYY-XXXXXX reference, status RECEIVED" "$(echo "$LREF" | grep -qE '^LIVE-[0-9]{4}-[0-9A-HJKMNP-TV-Z]{6}$' && [ "$(jget status)" = RECEIVED ] && echo 1 || echo 0)"
tc "  → the response promises nothing: no price, quote, deposit, availability or booking" "$(grep -qiE 'price|amount|quote_|deposit|available|booked|confirm' /tmp/tx.json && echo 0 || echo 1)"
tc "  → stored as given: email lower-cased, budget as typed, TOGETHER, reveal YES" "$([ "$(q "SELECT CONCAT_WS('|',email,approximate_budget,performer,song_reveal,duration,event_date,status) FROM live_enquiries WHERE reference='$LREF'")" = "ada.event@example.com|€8,000|TOGETHER|YES|3_HOURS|2099-06-20|NEW" ] && echo 1 || echo 0)"
tc "  → MCB_LIVE.ENQUIRY_RECEIVED recorded without what they wrote" "$([ "$(q "SELECT COUNT(*) FROM operations_events WHERE subject_reference='$LREF' AND event_type='MCB_LIVE.ENQUIRY_RECEIVED'")" = 1 ] && [ "$(q "SELECT COUNT(*) FROM operations_events WHERE detail LIKE '%Song Reveal%' OR detail LIKE '%Ada%' OR detail LIKE '%8,000%'")" = 0 ] && echo 1 || echo 0)"
t "  → in the staff queue" 1 "$(queue_has "LIVE:$LREF:NEW")"
t "  → findable by reference" "$LREF" "$(crm "crm/operations?q=$LREF" >/dev/null; jget enquiries.0.reference)"
t "  → and by email" "$LREF" "$(crm "crm/operations?q=ada.event@example.com" >/dev/null; jget enquiries.0.reference)"
t "every missing field is reported at once" 422 "$(post_json live/enquiry '{"name":"","email":"nope"}')"
tc "  → name, email, event type, location, performer, duration, Song Reveal" "$(python3 -c 'import json;f=json.load(open("/tmp/tx.json"))["fields"];print(1 if {"name","email","eventType","location","performer","duration","songReveal","requestType"}<=set(f) else 0)')"
t "an unknown performer is refused" 422 "$(post_json live/enquiry "$(echo "$LIVE_OK" | sed 's/"TOGETHER"/"SOMEONE_ELSE"/')")"
t "a date in the past is refused" 422 "$(post_json live/enquiry "$(echo "$LIVE_OK" | sed 's/2099-06-20/2020-06-20/')")"
t "an impossible date is refused" 422 "$(post_json live/enquiry "$(echo "$LIVE_OK" | sed 's/2099-06-20/2099-02-30/')")"
t "a line break in the name (header injection) is refused" 422 "$(post_json live/enquiry "$(echo "$LIVE_OK" | sed 's/"Ada Event"/"Ada\\r\\nBcc: x@evil.example"/')")"
t "a cross-origin enquiry is refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/live/enquiry" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "$LIVE_OK")"
reset_limits
for i in 1 2 3 4 5; do post_json live/enquiry "$LIVE_OK" >/dev/null; done
t "the 6th enquiry from one source in an hour is rate limited" 429 "$(post_json live/enquiry "$LIVE_OK")"
reset_limits
J45="{\"action\":\"ENQUIRY_STATUS\",\"reference\":\"$LREF\",\"status\":\"BOOKED\",\"staff\":\"Ops Tester\"}"
t "staff cannot set a booking-like status" 422 "$(crmpost crm/operations "$J45")"
J46="{\"action\":\"ENQUIRY_STATUS\",\"reference\":\"$LREF\",\"status\":\"QUOTE_SENT\",\"staff\":\"Ops Tester\"}"
t "staff move it to QUOTE_SENT" 200 "$(crmpost crm/operations "$J46")"
tc "  → audited, and out of the new-enquiry queue" "$([ "$(q "SELECT COUNT(*) FROM operations_events WHERE subject_reference='$LREF' AND event_type='ENQUIRY.STATUS_CHANGED'")" = 1 ] && [ "$(queue_has "LIVE:$LREF:NEW")" = 0 ] && echo 1 || echo 0)"
t "the enquiry detail for staff" 200 "$(crm "crm/operations?enquiry=$LREF")"
tc "  → returns the details as JSON data (no HTML rendering on the server)" "$(grep -q 'Song Reveal at the first dance' /tmp/tx.json && grep -q 'application/json' <(curl -s -D - -o /dev/null "$BASE/crm/operations?enquiry=$LREF" -H "Authorization: Bearer $CRMKEY") && echo 1 || echo 0)"
t "the MCB LIVE enquiries list" 200 "$(crm 'crm/operations?view=live-enquiries&status=QUOTE_SENT')"

section "10. BESPOKE ENQUIRY"
reset_limits
NEAR=$(date -u -v+5d +%Y-%m-%d 2>/dev/null || date -u -d '+5 days' +%Y-%m-%d)
J47="{\"name\":\"Bea Spoke\",\"email\":\"bea@example.com\",\"occasion\":\"Ruby anniversary\",\"createRequest\":\"A song, a framed lyric print and a surprise reveal.\",\"neededBy\":\"$NEAR\",\"budgetMode\":\"OPEN\",\"story\":\"Forty years since we met on the Canberra.\"}"
t "a Bespoke enquiry with what they would like created" 201 "$(post_json concierge/enquiry "$J47")"
BREF=$(jget reference)
tc "  → FP- reference; what to create stored; no price in the response" "$(echo "$BREF" | grep -qE '^FP-' && [ "$(q "SELECT create_request FROM concierge_enquiries WHERE reference='$BREF'")" = "A song, a framed lyric print and a surprise reveal." ] && ! grep -qiE 'price|amount|total' /tmp/tx.json && echo 1 || echo 0)"
t "  → BESPOKE.ENQUIRY_RECEIVED, without the story" "1|0" "$(q "SELECT COUNT(*) FROM operations_events WHERE subject_reference='$BREF' AND event_type='BESPOKE.ENQUIRY_RECEIVED'")|$(q "SELECT COUNT(*) FROM operations_events WHERE detail LIKE '%Canberra%'")"
tc "  → queued and flagged: near deadline, no fixed spending limit" "$(crm 'crm/operations?view=queue' >/dev/null; python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"))["items"];i=[x for x in d if x["key"]==sys.argv[1]];print(1 if i and set(i[0]["flags"])=={"DEADLINE_WITHIN_14_DAYS","NO_FIXED_SPENDING_LIMIT"} else 0)' "BESPOKE:$BREF:NEW")"
t "  → the CRM concierge view includes what to create" "A song, a framed lyric print and a surprise reveal." "$(crm "crm/concierge?reference=$BREF" >/dev/null; jget enquiries.0.create_request)"
t "a Bespoke enquiry without it still works (optional)" 201 "$(post_json concierge/enquiry '{"name":"Cy","email":"cy@example.com","budgetMode":"UNSURE","story":"A surprise for my sister."}')"

# ===========================================================================
section "11. SEARCH, AUTOMATION EVENTS, AUDIT HYGIENE"
t "find an order by MCB reference" "$KO" "$(crm "crm/operations?q=$KREF" >/dev/null; jget orders.0.order_id)"
t "find orders by email" "$MO" "$(crm "crm/operations?q=ops-moment@example.com" >/dev/null; jget orders.0.order_id)"
t "find an order by number" "$KO" "$(crm "crm/operations?q=$KO" >/dev/null; jget orders.0.order_id)"
t "free text is not a search (no pattern matching on customer data)" 422 "$(crm "crm/operations?q=%25")"
t "automation events need the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/automation-events")"
t "automation events" 200 "$(crm 'crm/automation-events?limit=500')"
tc "  → every named event occurred and is listed" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));names={e["event"] for e in d["order_events"]+d["enquiry_events"]};need={"ORDER.PAID","ORDER.READY_FOR_PROCESSING","QUALITY_CHECK.READY","QUALITY_CHECK.PASSED","QUALITY_CHECK.FAILED","REVEALED","FULFILMENT.READY","DISPATCHED","DELIVERED","FOLLOW_UP.DUE","MCB_LIVE.ENQUIRY_RECEIVED","BESPOKE.ENQUIRY_RECEIVED"};print(1 if need<=names else 0)')"
tc "  → only those events, and no personal data" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));allowed=set(json.load(open("public/api/data/operations.json"))["automation_events"]);print(1 if all(e["event"] in allowed for e in d["order_events"]+d["enquiry_events"]) else 0)')$(grep -qiE '@example|lanterns|Canberra|Harbour' /tmp/tx.json && echo X || echo '')"
tc "no audit event anywhere holds an email address, story, feedback or note text" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%@%' OR detail LIKE '%lanterns%' OR detail LIKE '%chorus%' OR detail LIKE '%prefers%' OR detail LIKE '%cracked%' OR detail LIKE '%Nann%' OR detail LIKE '%neighbour%'")" = 0 ] && echo 1 || echo 0)"
tc "no supplier ordering or payment code path exists in operations" "$(grep -nE 'stripe_|curl_init|refund' public/api/lib/operations.php public/api/lib/operations-queue.php public/api/crm/order-action.php public/api/order-approval.php public/api/order-support.php public/api/live/enquiry.php | grep -v 'stripe_livemode' | grep -vE '^[^:]+:[0-9]+:\s*(\*|//|/\*\*)' | grep -q . && echo 0 || echo 1)"

# ===========================================================================
section "12. LAUNCH CLOSURE — DELIVERY CLASSES, MCB CONFIRMS, HUMAN FULFILMENT REVIEW"
RATES=public/api/data/delivery-rates.json
trap 'restore_config; rm -f public/api/_test-config-base.php "$RATES"' EXIT
quote() { release_limits; post_json order-quote "{\"lines\":$1${2:+,\"shippingCountryCode\":\"$2\"}}" >/dev/null; }
# Fixtures (no rate table): plaques and players are confirmed by MCB, never estimated.
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"personalised-music-plaque","quantity":1},{"sku":"antique-brass-gramophone","quantity":1}]' GB
tc "a plaque or player is not priced: UNAVAILABLE, MCB_CONFIRMS_DELIVERY, not payable, £0 delivery" "$([ "$(jget delivery.status)" = UNAVAILABLE ] && [ "$(jget delivery.reason)" = MCB_CONFIRMS_DELIVERY ] && [ "$(jget payable)" = false ] && [ "$(jget delivery.minor)" = 0 ] && echo 1 || echo 0)"
tc "  → the customer is told which items, by product name only" "$([ "$(jget delivery.review_items)" = '["Personalised Music Plaque","Antique Brass Gramophone"]' ] && echo 1 || echo 0)"
tc "  → the response carries no pricing state, class, partner or rate internals" "$(grep -qE 'LISTING_DEPENDENT|MANUAL_REVIEW|DESTINATION_CALCULATED|PLAYER|PLAQUE|classes|first_item' /tmp/tx.json && echo 0 || echo 1)"
quote '[{"sku":"moment","quantity":1}]'
tc "a Moment needs no delivery, no country, and stays payable" "$([ "$(jget delivery.status)" = NOT_REQUIRED ] && [ "$(jget payable)" = true ] && [ "$(jget total_minor)" = "$(price moment)" ] && echo 1 || echo 0)"
quote '[{"sku":"keepsake-7-picture-disc","quantity":2},{"sku":"lyrics-frame-10x15","quantity":1}]' GB
tc "vinyl and frames are charged separately and added (split partners), from TEST rates" "$([ "$(jget delivery.status)" = QUOTED ] && [ "$(jget delivery.minor)" = $((495 + 105 + 695)) ] && [ "$(jget delivery.test_only)" = true ] && echo 1 || echo 0)"

# A Founder rate table that promotes players, with a general (vinyl) rate only.
printf '%s' '{"currency":"GBP","pricing":{"PLAYER":"DESTINATION_CALCULATED","PLAQUE":"NOT_A_STATE"},"rates":[{"id":"T_UK","label":"UK delivery (test table)","countries":["GB"],"first_item_minor":400,"additional_item_minor":100}]}' > "$RATES"; settle
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"vintage-smartphone-gramophone","quantity":1}]' GB
tc "a general rate never prices a gramophone, even when players are promoted" "$([ "$(jget delivery.status)" = UNAVAILABLE ] && [ "$(jget delivery.reason)" = NO_DELIVERY_RATE ] && [ "$(jget delivery.review_items)" = '["Vintage Smartphone Gramophone"]' ] && echo 1 || echo 0)"
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"personalised-music-plaque","quantity":1}]' GB
tc "an unknown pricing value is ignored: the plaque is still confirmed by MCB" "$([ "$(jget delivery.reason)" = MCB_CONFIRMS_DELIVERY ] && echo 1 || echo 0)"
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"lyrics-frame-10x15","quantity":1}]' GB
tc "a frame needs a rate naming FRAME; with a table present, TEST fixtures are not used" "$([ "$(jget delivery.status)" = UNAVAILABLE ] && [ "$(jget delivery.test_only)" = false ] && echo 1 || echo 0)"

printf '%s' '{"currency":"GBP","pricing":{"PLAYER":"DESTINATION_CALCULATED"},"rates":[{"id":"T_UK","label":"UK delivery (test table)","countries":["GB"],"first_item_minor":400,"additional_item_minor":100},{"id":"T_UK_PLAYER","label":"Player delivery (test table)","countries":["GB"],"classes":["PLAYER"],"first_item_minor":1200,"additional_item_minor":900}]}' > "$RATES"; settle
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"vintage-smartphone-gramophone","quantity":1}]' GB
tc "with a rate naming PLAYER for the destination, the order is quoted from the table" "$([ "$(jget delivery.status)" = QUOTED ] && [ "$(jget delivery.minor)" = 1600 ] && [ "$(jget delivery.test_only)" = false ] && [ "$(jget payable)" = true ] && echo 1 || echo 0)"
quote '[{"sku":"keepsake-7-picture-disc","quantity":1},{"sku":"vintage-smartphone-gramophone","quantity":1}]' US
tc "  → a destination the table does not cover is refused, never estimated" "$([ "$(jget delivery.status)" = UNAVAILABLE ] && [ "$(jget payable)" = false ] && echo 1 || echo 0)"

stub_reset
paid_order '{"sku":"keepsake-7-picture-disc","email":"ops-player@example.com","players":[["vintage-smartphone-gramophone",1]]}'
PO=$OID
tc "the order is paid and records both rates and the table source" "$([ "$(q "SELECT CONCAT_WS('|',status,delivery_rate_source,delivery_rate_id,delivery_minor) FROM orders WHERE id=$PO")" = "PAID|RATE_TABLE|T_UK+T_UK_PLAYER|1600" ] && echo 1 || echo 0)"
crm "crm/operations?order=$PO" >/dev/null
tc "  → staff see that availability and delivery must be confirmed, and the action is offered" "$([ "$(jget operations.fulfilment.review_required)" = true ] && [ "$(jget operations.fulfilment.review_confirmed)" = false ] && jget operations.available_actions | grep -q CONFIRM_FULFILMENT_REVIEW && echo 1 || echo 0)"
act $PO START_CREATIVE >/dev/null; act $PO SEND_TO_QUALITY_CHECK >/dev/null; register_artwork $PO; act $PO PASS_QUALITY_CHECK "$QC_PHYSICAL" >/dev/null
t "  → after MCB's quality check it waits, instead of becoming fulfilment-ready" "FULFILMENT.PENDING" "$(state_of $PO)"
tc "  → the queue says what it is waiting on" "$(crm 'crm/operations?view=queue' >/dev/null; python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"))["items"];i=[x for x in d if x["key"].startswith("ORDER:%s:MISSING_INFORMATION:fulfilment" % sys.argv[1])];print(1 if i and "availability" in i[0]["detail"] else 0)' "$PO")"
t "  → it cannot be marked ready" 409 "$(act $PO SET_FULFILMENT_READY)"
t "  → confirming needs the explicit tick" 422 "$(act $PO CONFIRM_FULFILMENT_REVIEW '"note":"Partner confirmed stock and UK delivery cost"')"
t "  → and a note of what was confirmed" 422 "$(act $PO CONFIRM_FULFILMENT_REVIEW '"confirmed":true')"
t "  → confirmed by a person" 200 "$(act $PO CONFIRM_FULFILMENT_REVIEW '"confirmed":true,"note":"Partner confirmed stock and UK delivery cost"')"
t "  → which moves it to fulfilment-ready by itself" "FULFILMENT.READY" "$(state_of $PO)"
tc "  → recorded as an event without the note text, and the note kept internally" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$PO AND event_type='FULFILMENT.REVIEW_CONFIRMED' AND detail NOT LIKE '%stock%'")" = 1 ] && [ "$(q "SELECT COUNT(*) FROM order_staff_notes WHERE order_id=$PO AND note LIKE 'Availability and delivery confirmed:%'")" = 1 ] && echo 1 || echo 0)"
t "  → a second confirmation changes nothing" "unchanged" "$(act $PO CONFIRM_FULFILMENT_REVIEW '"confirmed":true,"note":"again"' >/dev/null; jget outcome)"
t "  → Bella authorises the purchase" 200 "$(founder_authorise $PO BELLA "$FOUNDER_CODE_BELLA")"
t "  → the partner order is then confirmed by hand" 200 "$(act $PO CONFIRM_FULFILMENT '"fulfilment_reference":"HAND-PLACED-1"')"
t "  → dispatched with two parcels' tracking" 200 "$(act $PO MARK_DISPATCHED "\"carrier\":\"Royal Mail\",\"tracking_reference\":\"RM1GB, DPD22\",\"dispatched_on\":\"$TODAY\",\"send_email\":true")"
tc "  → the dispatch email explains separate parcels and the approved damage guidance" "$(mail_log | grep -q 'RM1GB, DPD22' && mail_log | grep -q 'arrive in separate parcels' && mail_log | grep -q 'recording the opening' && mail_log | grep -q 'not a condition of getting help' && echo 1 || echo 0)"
tc "  → and never names a partner or tells the customer to contact the courier" "$(mail_log | grep -qiE 'courier service|contact the (courier|supplier)|HAND-PLACED' && echo 0 || echo 1)"
rm -f "$RATES"; settle
paid_order '{"sku":"keepsake-7-picture-disc","email":"ops-vinyl-only@example.com"}'
crm "crm/operations?order=$OID" >/dev/null
tc "a vinyl-only order needs no availability review" "$([ "$(jget operations.fulfilment.review_required)" = false ] && ! jget operations.available_actions | grep -q CONFIRM_FULFILMENT_REVIEW && echo 1 || echo 0)"
t "  → and the review action is refused for it" 409 "$(act $OID CONFIRM_FULFILMENT_REVIEW '"confirmed":true,"note":"n/a"')"
tc "no automatic supplier purchase path was added" "$(grep -nE 'curl_init|file_get_contents\(.https?:' public/api/lib/delivery.php public/api/lib/operations.php | grep -q . && echo 0 || echo 1)"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
