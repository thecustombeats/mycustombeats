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
            "style": style(m.get("style", "MCB")), "photo": m.get("photo", False)}.items()}
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
    "consents": {"TERMS": True, "SERVICE_START": True, "DIGITAL_CONTENT": True}, "termsVersion": "2026-09-09.4",
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
tc "operations.json is generated and names the automation events" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"));print(1 if set(["ORDER.PAID","CREATIVE.READY","CUSTOMER.APPROVAL.REQUIRED","CUSTOMER.APPROVAL.APPROVED","FULFILMENT.READY","DISPATCHED","DELIVERED","FOLLOW_UP.DUE","MCB_LIVE.ENQUIRY_RECEIVED","BESPOKE.ENQUIRY_RECEIVED"])==set(d["automation_events"]) else 0)')"
tc "included revisions: Moment 1 per unit, Keepsake and Journey 1 per song, nothing invented for Bespoke" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"))["included_revisions"];print(1 if d=={"moment":{"count":1,"per":"UNIT"},"keepsake":{"count":1,"per":"SONG"},"journey":{"count":1,"per":"SONG"}} else 0)')"
tc "the Priority Replacement window comes from the catalogue (7 days)" "$([ "$(python3 -c 'import json;print(json.load(open("public/api/data/operations.json"))["priority_replacement_claim_window_days"])')" = "7" ] && echo 1 || echo 0)"
tc "the digital customer journey never mentions making or posting" "$(python3 -c 'import json;d=json.load(open("public/api/data/operations.json"))["customer_stages"]["DIGITAL"];ids=[s["id"] for s in d];st=sum([s["states"] for s in d],[]);print(1 if "making" not in ids and "on-its-way" not in ids and not any(x.startswith(("FULFILMENT","DISPATCHED","DELIVERED")) for x in st) else 0)')"
ROOTQ() { docker exec -i mcb-db mariadb -uroot -ptestroot "$@"; }
ROOTQ -e 'DROP DATABASE IF EXISTS s5a; DROP DATABASE IF EXISTS s5b; CREATE DATABASE s5a; CREATE DATABASE s5b;' 2>/dev/null
ROOTQ s5a < db/schema.sql 2>/dev/null
git show 3ad6520c:db/schema.sql | ROOTQ s5b 2>/dev/null
ROOTQ s5b < db/migrations/2026-09-14-sprint5-operations.sql 2>/dev/null; M1=$?
ROOTQ s5b < db/migrations/2026-09-14-sprint5-operations.sql 2>/dev/null; M2=$?
dumpdb() { for tb in $(ROOTQ -N -e "SHOW TABLES" "$1"); do ROOTQ -N -e "SHOW CREATE TABLE \`$tb\`" "$1" | sed 's/AUTO_INCREMENT=[0-9]* //'; done; }
tc "the migration applies to the Sprint 4 schema, and again (idempotent)" "$([ "$M1" = 0 ] && [ "$M2" = 0 ] && echo 1 || echo 0)"
tc "a migrated database is identical to a fresh db/schema.sql" "$([ "$(dumpdb s5a | shasum)" = "$(dumpdb s5b | shasum)" ] && [ "$(dumpdb s5a | grep -c .)" -gt 25 ] && echo 1 || echo 0)"
ROOTQ -e 'DROP DATABASE s5a; DROP DATABASE s5b;' 2>/dev/null
tc "the migration only adds: no DROP TABLE, DELETE, TRUNCATE or RENAME" "$(grep -qiE '^\s*(DROP TABLE|DELETE|TRUNCATE|RENAME)' db/migrations/2026-09-14-sprint5-operations.sql && echo 0 || echo 1)"
crm crm/preflight >/dev/null
pf() { python3 -c 'import json,sys;d=json.load(open("/tmp/tx.json"));print({c["id"]:c["status"] for c in d["checks"]}.get(sys.argv[1],"MISSING"))' "$1"; }
tc "preflight reports the Sprint 5 migration, operations data and link secret" "$([ "$(pf sprint5_migration_applied)" = PASS ] && [ "$(pf data_operations)" = PASS ] && [ "$(pf customer_links_secret)" = PASS ] && echo 1 || echo 0)"

# ===========================================================================
section "1. A PAID MOMENT ENTERS OPERATIONS"
STORY="The evening Grandad danced with Nan under the lanterns on deck nine."
paid_order "{\"sku\":\"moment\",\"email\":\"ops-moment@example.com\",\"units\":[{\"memories\":[{\"story\":\"$STORY\"}]}]}"
MO=$OID
t "the Moment is paid" "PAID" "$(q "SELECT status FROM orders WHERE id=$MO")"
MREF=$(q "SELECT mcb_reference FROM orders WHERE id=$MO")
t "operations see it as CREATIVE.PENDING" "CREATIVE.PENDING" "$(state_of $MO)"
tc "  → payment status is reported separately, as PAID" "$([ "$(jget payment_status)" = PAID ] && echo 1 || echo 0)"
tc "  → digital workflow: fulfilment NOT_REQUIRED, one included revision" "$([ "$(jget workflow)" = DIGITAL ] && [ "$(jget operations.fulfilment.state)" = NOT_REQUIRED ] && [ "$(jget operations.revisions.included)" = 1 ] && echo 1 || echo 0)"
tc "  → next action and available actions are given" "$([ "$(jget operations.next_action)" = "Start the creative work." ] && jget operations.available_actions | grep -q START_CREATIVE && echo 1 || echo 0)"
tc "  → the staff view carries no supplier or cost data" "$(grep -qiE 'supplier_cost|cost_minor|margin|wholesale' /tmp/tx.json && echo 0 || echo 1)"
tc "the queue shows creative work for it" "$(queue_has "ORDER:$MO:CREATIVE_WORK")"
J1="{\"order_id\":$MO,\"action\":\"START_CREATIVE\",\"staff\":\"X\"}"
t "order actions require the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/order-action" -H 'Content-Type: application/json' -d "$J1")"
t "the operations view requires the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/operations?view=queue")"
J2="{\"order_id\":$MO,\"action\":\"START_CREATIVE\"}"
t "an action without a staff name is refused" 422 "$(crmpost crm/order-action "$J2")"
t "an unknown action is refused" 422 "$(act $MO DELETE_EVERYTHING)"
t "sending for approval before the music is ready is refused" 409 "$(act $MO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/a"')"
t "START_CREATIVE" 200 "$(act $MO START_CREATIVE)"
t "  → CREATIVE.IN_PROGRESS" "CREATIVE.IN_PROGRESS" "$(jget state)"
t "START_CREATIVE again changes nothing" "unchanged" "$(act $MO START_CREATIVE >/dev/null; jget outcome)"
t "MARK_CREATIVE_READY" 200 "$(act $MO MARK_CREATIVE_READY)"
t "  → CREATIVE.READY" "CREATIVE.READY" "$(jget state)"
t "a listening link is required" 422 "$(act $MO REQUEST_APPROVAL)"
t "an http (not https) listening link is refused" 422 "$(act $MO REQUEST_APPROVAL '"preview_url":"http://listen.example.test/a"')"
t "a javascript: listening link is refused" 422 "$(act $MO REQUEST_APPROVAL '"preview_url":"javascript:alert(1)"')"
stub_reset
t "REQUEST_APPROVAL with a private https link" 200 "$(act $MO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/moment-v1"')"
A1=$(link_token approval); S1=$(link_token status)
tc "  → CUSTOMER_APPROVAL.REQUIRED, approval email sent" "$([ "$(jget state)" = CUSTOMER_APPROVAL.REQUIRED ] && [ "$(jget emails.APPROVAL_REQUIRED)" = sent ] && echo 1 || echo 0)"
tc "  → links are /approve# and /your-order# with 43-character tokens" "$(jget links.approval | grep -qE '^http://localhost:8080/approve#[A-Za-z0-9_-]{43}$' && jget links.status | grep -qE '^http://localhost:8080/your-order#[A-Za-z0-9_-]{43}$' && echo 1 || echo 0)"
tc "  → approval and status tokens differ" "$([ "$A1" != "$S1" ] && echo 1 || echo 0)"
tc "  → only SHA-256 hashes are stored; the raw token is nowhere in the database" "$([ "$(q "SELECT COUNT(*) FROM order_access_tokens WHERE token_hash=SHA2('$A1',256) AND purpose='APPROVAL' AND approval_round=1")" = 1 ] && [ -z "$(docker exec mcb-db mariadb-dump -umcb -ptestpass mcb_crm 2>/dev/null | grep -F "$A1")" ] && echo 1 || echo 0)"
MAIL=$(mail_log)
tc "  → the email carries the approval link and the reference" "$(echo "$MAIL" | grep -qF "approve#$A1" && echo "$MAIL" | grep -qF "$MREF" && echo 1 || echo 0)"
tc "  → and never the story" "$(echo "$MAIL" | grep -qiE 'lanterns|Grandad|deck nine' && echo 0 || echo 1)"
tc "  → Moment wording: a song, nothing about making a keepsake" "$(echo "$MAIL" | grep -q 'song is ready' && ! echo "$MAIL" | grep -qi keepsake && echo 1 || echo 0)"
t "  → one APPROVAL_REQUIRED email on record" 1 "$(sent_count $MO APPROVAL_REQUIRED)"

section "2. THE CUSTOMER APPROVAL PAGE"
J3="{\"token\":\"$A1\",\"action\":\"view\"}"
t "view with the approval link" 200 "$(post_json order-approval "$J3")"
tc "  → awaiting response, listening link, reference, 1 included / 0 used" "$([ "$(jget position)" = AWAITING_RESPONSE ] && [ "$(jget preview_url)" = "https://listen.example.test/moment-v1" ] && [ "$(jget reference)" = "$MREF" ] && [ "$(jget revisions.included)" = 1 ] && [ "$(jget revisions.used)" = 0 ] && echo 1 || echo 0)"
tc "  → no name, email, story, notes or database ids" "$(grep -qiE 'ops-moment|lanterns|Customer\"|order_id|\"id\"|note|supplier' /tmp/tx.json && echo 0 || echo 1)"
t "an unknown link" 404 "$(post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","action":"view"}')"
t "a malformed link" 404 "$(post_json order-approval '{"token":"x'"'"' OR 1=1 --","action":"view"}')"
J4="{\"token\":\"$S1\",\"action\":\"view\"}"
t "the status link cannot open the approval page" 404 "$(post_json order-approval "$J4")"
J5="{\"token\":\"$A1\"}"
t "the approval link cannot open the progress page" 404 "$(post_json order-progress "$J5")"
J6="{\"token\":\"$A1\",\"action\":\"approve\"}"
t "a cross-origin approval is refused" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/order-approval" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d "$J6")"
J7="{\"token\":\"$A1\",\"action\":\"request_changes\",\"feedback\":\"  \"}"
t "asking for changes needs words" 422 "$(post_json order-approval "$J7")"
FEEDBACK="Please make the chorus slower and mention the lanterns twice."
stub_reset
J8="{\"token\":\"$A1\",\"action\":\"request_changes\",\"feedback\":\"$FEEDBACK\"}"
t "asking for changes" 200 "$(post_json order-approval "$J8")"
tc "  → changes received; position CHANGES_REQUESTED; 1 used" "$([ "$(jget outcome)" = changes_received ] && [ "$(jget position)" = CHANGES_REQUESTED ] && [ "$(jget revisions.used)" = 1 ] && echo 1 || echo 0)"
tc "  → recorded for round 1, in the customer's words, within the allowance" "$([ "$(q "SELECT CONCAT(approval_round,'|',channel,'|',within_allowance) FROM order_change_requests WHERE order_id=$MO")" = "1|WEBSITE|YES" ] && [ "$(q "SELECT feedback FROM order_change_requests WHERE order_id=$MO")" = "$FEEDBACK" ] && echo 1 || echo 0)"
tc "  → stage REVISION_REQUESTED, revisions_used 1" "$([ "$(q "SELECT CONCAT(stage,'|',revisions_used) FROM order_production WHERE order_id=$MO")" = "REVISION_REQUESTED|1" ] && echo 1 || echo 0)"
tc "  → the feedback is not in the audit trail or the email" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%chorus%'")" = 0 ] && ! mail_log | grep -q chorus && echo 1 || echo 0)"
t "  → one CHANGES_RECEIVED email" 1 "$(sent_count $MO CHANGES_RECEIVED)"
J9="{\"token\":\"$A1\",\"action\":\"request_changes\",\"feedback\":\"$FEEDBACK\"}"
t "pressing the button again is one request" "already_received" "$(post_json order-approval "$J9" >/dev/null; jget outcome)"
t "  → still one request, one email" "1|1" "$(q "SELECT COUNT(*) FROM order_change_requests WHERE order_id=$MO")|$(sent_count $MO CHANGES_RECEIVED)"
J10="{\"token\":\"$A1\",\"action\":\"approve\"}"
t "the old version cannot now be approved" 409 "$(post_json order-approval "$J10")"
t "the changed-requests queue item exists" 1 "$(queue_has "ORDER:$MO:CHANGES_REQUESTED:0:1")"
act $MO MARK_CREATIVE_READY >/dev/null
t "round 2 sent for approval" 200 "$(act $MO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/moment-v2"')"
A2=$(link_token approval)
J11="{\"token\":\"$A1\",\"action\":\"view\"}"
t "  → the round 1 link is revoked" 404 "$(post_json order-approval "$J11")"
J12="{\"token\":\"$A2\",\"action\":\"view\"}"
t "  → the round 2 link shows version 2" "https://listen.example.test/moment-v2" "$(post_json order-approval "$J12" >/dev/null; jget preview_url)"
t "  → a second approval email for round 2" 2 "$(sent_count $MO APPROVAL_REQUIRED)"
stub_reset
J13="{\"token\":\"$A2\",\"action\":\"approve\"}"
t "the customer approves" 200 "$(post_json order-approval "$J13")"
tc "  → approved; approval evidence WEBSITE, round 2" "$([ "$(jget outcome)" = approved ] && [ "$(jget position)" = APPROVED ] && [ "$(q "SELECT CONCAT(stage,'|',approval_channel,'|',approved_item,'|',IF(approved_at IS NULL,'no','yes')) FROM order_production WHERE order_id=$MO")" = "APPROVED|WEBSITE|Approval round 2|yes" ] && echo 1 || echo 0)"
t "  → digital: no fulfilment, follow-up due" "FOLLOW_UP.DUE" "$(state_of $MO)"
J14="{\"token\":\"$A2\",\"action\":\"approve\"}"
t "approving again is harmless" "already_approved" "$(post_json order-approval "$J14" >/dev/null; jget outcome)"
t "  → one approval event, one confirmation email" "1|1" "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND event_type='CUSTOMER.APPROVAL.APPROVED'")|$(sent_count $MO APPROVAL_CONFIRMED)"
J15="{\"token\":\"$A2\",\"action\":\"request_changes\",\"feedback\":\"one more change\"}"
t "asking for changes after approving is refused" 409 "$(post_json order-approval "$J15")"

section "3. THE CUSTOMER PROGRESS PAGE (MOMENT)"
J16="{\"token\":\"$S1\"}"
t "progress with the status link" 200 "$(post_json order-progress "$J16")"
tc "  → reference, DIGITAL, current stage 'approved'" "$([ "$(jget reference)" = "$MREF" ] && [ "$(jget workflow)" = DIGITAL ] && [ "$(jget stage)" = approved ] && echo 1 || echo 0)"
tc "  → Moment stages only: received, creating, listen, approved, complete" "$([ "$(python3 -c 'import json;print(",".join(s["id"] for s in json.load(open("/tmp/tx.json"))["stages"]))')" = "received,creating,listen,approved,complete" ] && echo 1 || echo 0)"
tc "  → no delivery, no items to report, no personal data" "$([ "$(jget delivery)" = null ] && [ "$(jget items)" = "[]" ] && ! grep -qiE 'ops-moment|lanterns|chorus|order_id|email' /tmp/tx.json && echo 1 || echo 0)"
J17="{\"token\":\"$MREF\",\"reference\":\"$MREF\"}"
t "progress cannot be looked up by reference" 404 "$(post_json order-progress "$J17")"
J18="{\"token\":\"$S1\",\"kind\":\"DAMAGED_OR_FAULTY\",\"description\":\"The file arrived broken somehow\"}"
t "a digital order cannot report a damaged item" 422 "$(post_json order-support "$J18")"
J19="{\"token\":\"$S1\",\"kind\":\"QUESTION\",\"description\":\"Can I have the song as an MP3 as well please?\"}"
t "a question from a Moment customer" 201 "$(post_json order-support "$J19")"
t "  → in the queue as a customer question" 1 "$(queue_has "SERVICE:")"
t "follow-up recorded, with the check-in email" 200 "$(act $MO RECORD_FOLLOW_UP '"send_email":true')"
t "  → one FOLLOW_UP email" 1 "$(sent_count $MO FOLLOW_UP)"
t "  → follow-up again is refused" 409 "$(act $MO RECORD_FOLLOW_UP)"
t "MARK_COMPLETED" "COMPLETED" "$(act $MO MARK_COMPLETED >/dev/null; jget state)"
J20="{\"token\":\"$S1\"}"
t "  → the customer sees it complete" "complete" "$(post_json order-progress "$J20" >/dev/null; jget stage)"
J21="{\"order_id\":$MO}"
t "the review request works for the completed order (review URL from config)" 200 "$(crmpost crm/review-request "$J21")"
tc "the Moment's audit trail tells the story in order, with no customer text" "$(E=$(events_of $MO); echo "$E" | grep -q 'ORDER.PAID.*CREATIVE.IN_PROGRESS.*CREATIVE.READY.*CUSTOMER.APPROVAL.REQUIRED.*CUSTOMER.CHANGES.REQUESTED.*CREATIVE.READY.*CUSTOMER.APPROVAL.REQUIRED.*CUSTOMER.APPROVAL.APPROVED.*FOLLOW_UP.DUE.*FOLLOW_UP.DONE.*ORDER.COMPLETED' && [ "$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$MO AND (detail LIKE '%lanterns%' OR detail LIKE '%@%' OR detail LIKE '%MP3%')")" = 0 ] && echo 1 || echo 0)"

# ===========================================================================
section "4. A KEEPSAKE: CREATIVE AND PHYSICAL STATES, SEPARATELY"
reset_limits
paid_order '{"sku":"keepsake-7-picture-disc","email":"ops-keepsake@example.com","units":[{"pr":true},{"pr":false}]}'
KO=$OID; KREF=$(q "SELECT mcb_reference FROM orders WHERE id=$KO")
t "the two-Keepsake order is paid" "PAID" "$(q "SELECT status FROM orders WHERE id=$KO")"
crm "crm/operations?order=$KO" >/dev/null
tc "  → PHYSICAL; fulfilment PENDING; 2 included revisions (1 per song, 2 songs)" "$([ "$(jget workflow)" = PHYSICAL ] && [ "$(jget operations.fulfilment.state)" = PENDING ] && [ "$(jget operations.revisions.included)" = 2 ] && echo 1 || echo 0)"
act $KO START_CREATIVE >/dev/null; act $KO MARK_CREATIVE_READY >/dev/null
act $KO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/keepsake-v1"' >/dev/null
KA=$(link_token approval); KS=$(link_token status)
tc "the physical approval email warns the music cannot change after approval" "$(mail_log | grep -q 'can no longer be changed' && echo 1 || echo 0)"
STRIPE_BEFORE=$(stub_count)
t "staff record an approval the customer gave on WhatsApp" 200 "$(act $KO RECORD_APPROVAL '"channel":"WHATSAPP","reference":"WhatsApp 14:02"')"
t "  → FULFILMENT.READY (address and personalisation present)" "FULFILMENT.READY" "$(jget state)"
tc "  → evidence: WHATSAPP, staff name, reference" "$([ "$(q "SELECT CONCAT(approval_channel,'|',approved_by,'|',approval_reference) FROM order_production WHERE order_id=$KO")" = "WHATSAPP|Ops Tester|WhatsApp 14:02" ] && echo 1 || echo 0)"
t "  → a FULFILMENT.READY task in the queue" 1 "$(queue_has "ORDER:$KO:FULFILMENT_READY")"
tc "  → which says nothing is ordered automatically" "$(grep -q 'Nothing is ordered automatically' /tmp/tx.json && echo 1 || echo 0)"
tc "  → and no request went to Stripe or anywhere else" "$([ "$(stub_count)" = "$STRIPE_BEFORE" ] && echo 1 || echo 0)"
J22="{\"token\":\"$KA\",\"action\":\"request_changes\",\"feedback\":\"change it please\"}"
t "the customer's link can no longer change it" 409 "$(post_json order-approval "$J22")"
J23="\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\""
t "dispatch before the physical order is confirmed is refused" 409 "$(act $KO MARK_DISPATCHED "$J23")"
t "CONFIRM_FULFILMENT (placed by hand)" "FULFILMENT.CONFIRMED" "$(act $KO CONFIRM_FULFILMENT '"fulfilment_reference":"PO-778"' >/dev/null; jget state)"
t "  → the production lock is recorded" "PRODUCTION_LOCKED|yes" "$(q "SELECT CONCAT(stage,'|',IF(production_locked_at IS NULL,'no','yes')) FROM order_production WHERE order_id=$KO")"
J24="\"dispatched_on\":\"$TODAY\""
t "dispatch needs a carrier" 422 "$(act $KO MARK_DISPATCHED "$J24")"
t "dispatch cannot be in the future" 422 "$(act $KO MARK_DISPATCHED '"carrier":"Royal Mail","dispatched_on":"2099-01-01"')"
J25="\"carrier\":\"Royal Mail\",\"dispatched_on\":\"$TODAY\",\"tracking_url\":\"javascript:alert(1)\""
t "a tracking link must be https" 422 "$(act $KO MARK_DISPATCHED "$J25")"
stub_reset
J26="\"carrier\":\"Royal Mail\",\"tracking_reference\":\"RM123456789GB\",\"tracking_url\":\"https://track.example.test/RM123456789GB\",\"dispatched_on\":\"$TODAY\""
t "MARK_DISPATCHED with tracking" "DISPATCHED" "$(act $KO MARK_DISPATCHED "$J26" >/dev/null; jget state)"
tc "  → one dispatch email, with the carrier and tracking MCB entered" "$([ "$(sent_count $KO DISPATCHED)" = 1 ] && mail_log | grep -q 'RM123456789GB' && mail_log | grep -q 'Royal Mail' && echo 1 || echo 0)"
tc "  → not marked delivered automatically" "$([ "$(q "SELECT IFNULL(delivered_on,'none') FROM order_production WHERE order_id=$KO")" = none ] && echo 1 || echo 0)"
J27="{\"token\":\"$KS\"}"
t "progress (physical)" 200 "$(post_json order-progress "$J27")"
tc "  → on its way, with carrier and tracking; seven physical stages" "$([ "$(jget stage)" = on-its-way ] && [ "$(jget delivery.carrier)" = "Royal Mail" ] && [ "$(jget delivery.tracking_url)" = "https://track.example.test/RM123456789GB" ] && [ "$(python3 -c 'import json;print(len(json.load(open("/tmp/tx.json"))["stages"]))')" = 7 ] && echo 1 || echo 0)"
tc "  → two items by position, only item-1 has Priority Replacement, no window before delivery" "$([ "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"))["items"];print(",".join(i["key"]+":"+("PR" if i["priority_replacement"] else "-") for i in d))')" = "item-1:PR,item-2:-" ] && [ "$(jget items.0.priority_replacement.request_by)" = null ] && echo 1 || echo 0)"
tc "  → no address, email, supplier reference or amounts" "$(grep -qiE 'Harbour|Southampton|ops-keepsake|PO-778|minor' /tmp/tx.json && echo 0 || echo 1)"
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
t "MARK_DELIVERED (a person confirms it)" "FOLLOW_UP.DUE" "$(act $KO MARK_DELIVERED "$J30" >/dev/null; jget state)"
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
t "reopening after delivery" 200 "$(act $KO REOPEN '"reason":"REPLACEMENT"')"
tc "  → back to CREATIVE.READY, with a warning that nothing changes with a supplier" "$([ "$(jget state)" = CREATIVE.READY ] && jget warning | grep -q 'does not cancel or change anything with a supplier' && echo 1 || echo 0)"
tc "  → history kept in the audit trail" "$(events_of $KO | grep -q 'FULFILMENT.READY.*FULFILMENT.CONFIRMED.*DISPATCHED.*DELIVERY.DELAYED.*DELIVERED.*PRODUCTION.REOPENED' && echo 1 || echo 0)"
t "an invalid reopen reason is refused" 422 "$(act $MO REOPEN '"reason":"BECAUSE"')"

# ===========================================================================
section "5. JOURNEY ALLOWANCE, MISSING INFORMATION, PAYMENT STATE"
reset_limits
paid_order '{"sku":"journey-6","email":"ops-journey@example.com"}'
JO=$OID
t "a 6-song Journey includes 6 refinements (1 per song)" 6 "$(crm "crm/operations?order=$JO" >/dev/null; jget operations.revisions.included)"
q "DELETE FROM delivery_addresses WHERE order_id=$JO"
t "a physical order with no address is missing information" 1 "$(queue_has "ORDER:$JO:MISSING_INFORMATION:address")"
act $JO MARK_CREATIVE_READY >/dev/null
t "approval without an address holds fulfilment PENDING" "FULFILMENT.PENDING" "$(act $JO RECORD_APPROVAL '"channel":"EMAIL"' >/dev/null; jget state)"
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
t "the legacy stage endpoint still works alongside" 200 "$(crmpost crm/production "$J39")"
t "  → and operations read it as COMPLETED" "COMPLETED" "$(state_of $JO)"

# ===========================================================================
section "6. OVERDUE, FOLLOW-UP AND FAILED EMAIL"
reset_limits
paid_order '{"sku":"moment","email":"ops-late@example.com"}'
LO=$OID
t "a new Moment is not overdue" 0 "$(queue_has "ORDER:$LO:OVERDUE")"
q "UPDATE order_events SET created_at = UTC_TIMESTAMP() - INTERVAL 2 HOUR WHERE order_id=$LO AND dedupe_key='paid'"
t "a Moment paid 2 hours ago and not sent is overdue (1-hour target)" 1 "$(queue_has "ORDER:$LO:OVERDUE")"
act $LO MARK_CREATIVE_READY >/dev/null
docker exec mcb-api sh -c 'echo http_fail > /tmp/resend-mode'
t "approval requested while email is failing" "failed" "$(act $LO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/late"' >/dev/null; jget emails.APPROVAL_REQUIRED)"
tc "  → the state still moved and staff still have the link to share" "$([ "$(jget state)" = CUSTOMER_APPROVAL.REQUIRED ] && jget links.approval | grep -q '/approve#' && echo 1 || echo 0)"
t "  → the failure is kept (FAILED) and audited" "FAILED|1" "$(q "SELECT status FROM customer_communications WHERE order_id=$LO AND message_type='APPROVAL_REQUIRED'")|$(q "SELECT COUNT(*) FROM order_events WHERE order_id=$LO AND event_type='CUSTOMER.MESSAGE.FAILED'")"
t "  → and surfaced in the queue" 1 "$(queue_has "MESSAGE:")"
docker exec mcb-api sh -c 'echo ok > /tmp/resend-mode'
KEY=$(q "SELECT dedupe_key FROM customer_communications WHERE order_id=$LO AND message_type='APPROVAL_REQUIRED'")
J40="\"type\":\"APPROVAL_REQUIRED\",\"dedupe_key\":\"$KEY\""
t "retrying the failed email" "sent" "$(act $LO RETRY_MESSAGE "$J40" >/dev/null; jget emails.APPROVAL_REQUIRED)"
t "  → now SENT, still one row" "SENT|1" "$(q "SELECT status FROM customer_communications WHERE order_id=$LO AND message_type='APPROVAL_REQUIRED'")|$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$LO AND message_type='APPROVAL_REQUIRED'")"
J41="\"type\":\"APPROVAL_REQUIRED\",\"dedupe_key\":\"$KEY\""
t "  → retrying a sent email is refused" 409 "$(act $LO RETRY_MESSAGE "$J41")"

section "7. TEST-MODE EMAIL NEVER REACHES A CUSTOMER BY ACCIDENT"
reset_limits
paid_order '{"sku":"moment","email":"real-customer@example.com"}'
TO=$OID
act $TO MARK_CREATIVE_READY >/dev/null
with_config "unset(\$c['resend']['test_mode_send_to_customer']);"
stub_reset
t "TEST payment, no test recipient: the email is skipped" "skipped_test_mode" "$(act $TO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/t"' >/dev/null; jget emails.APPROVAL_REQUIRED)"
tc "  → nothing sent, nothing claimed" "$([ "$(mail_count)" = 0 ] && [ "$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$TO")" = 0 ] && echo 1 || echo 0)"
with_config "unset(\$c['resend']['test_mode_send_to_customer']); \$c['resend']['test_recipient'] = 'rehearsal-inbox@example.test';"
act $TO MARK_CREATIVE_READY >/dev/null 2>&1
q "UPDATE order_production SET stage='SONG_READY' WHERE order_id=$TO"
stub_reset
t "with a test recipient configured" "sent" "$(act $TO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/t2"' >/dev/null; jget emails.APPROVAL_REQUIRED)"
tc "  → sent to the rehearsal inbox with [TEST], never to the customer" "$(mail_log | grep -q 'rehearsal-inbox@example.test' && mail_log | grep -q '\[TEST\]' && ! mail_log | grep -q 'real-customer@example.com' && echo 1 || echo 0)"
with_config "\$c['token_secret'] = 'short';"
act $TO MARK_CREATIVE_READY >/dev/null 2>&1
q "UPDATE order_production SET stage='SONG_READY' WHERE order_id=$TO"
ROUND_BEFORE=$(q "SELECT approval_round FROM order_production WHERE order_id=$TO")
t "a weak token secret refuses to issue links" 503 "$(act $TO REQUEST_APPROVAL '"preview_url":"https://listen.example.test/t3"')"
t "  → and nothing changed" "SONG_READY|$ROUND_BEFORE" "$(q "SELECT CONCAT(stage,'|',approval_round) FROM order_production WHERE order_id=$TO")"
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
t "the 31st approval attempt is rate limited" 429 "$(post_json order-approval '{"token":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}')"
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
tc "  → every named event occurred and is listed" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));names={e["event"] for e in d["order_events"]+d["enquiry_events"]};need={"ORDER.PAID","CREATIVE.READY","CUSTOMER.APPROVAL.REQUIRED","CUSTOMER.APPROVAL.APPROVED","FULFILMENT.READY","DISPATCHED","DELIVERED","FOLLOW_UP.DUE","MCB_LIVE.ENQUIRY_RECEIVED","BESPOKE.ENQUIRY_RECEIVED"};print(1 if need<=names else 0)')"
tc "  → only those events, and no personal data" "$(python3 -c 'import json;d=json.load(open("/tmp/tx.json"));allowed=set(json.load(open("public/api/data/operations.json"))["automation_events"]);print(1 if all(e["event"] in allowed for e in d["order_events"]+d["enquiry_events"]) else 0)')$(grep -qiE '@example|lanterns|Canberra|Harbour' /tmp/tx.json && echo X || echo '')"
tc "no audit event anywhere holds an email address, story, feedback or note text" "$([ "$(q "SELECT COUNT(*) FROM order_events WHERE detail LIKE '%@%' OR detail LIKE '%lanterns%' OR detail LIKE '%chorus%' OR detail LIKE '%prefers%' OR detail LIKE '%cracked%'")" = 0 ] && echo 1 || echo 0)"
tc "no supplier ordering or payment code path exists in operations" "$(grep -nE 'stripe_|curl_init|refund' public/api/lib/operations.php public/api/lib/operations-queue.php public/api/crm/order-action.php public/api/order-approval.php public/api/order-support.php public/api/live/enquiry.php | grep -v 'stripe_livemode' | grep -vE '^[^:]+:[0-9]+:\s*(\*|//|/\*\*)' | grep -q . && echo 0 || echo 1)"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
