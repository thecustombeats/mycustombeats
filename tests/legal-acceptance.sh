#!/bin/bash
# MCB TERMS, REFUNDS & PRODUCTION LOCK — acceptance tests.
#
# Runs against the same throwaway PHP + MariaDB containers as the other
# suites. See tests/README.md.
#
# WHAT THIS PROVES, IN ONE LINE: the customer's consent is evidence rather
# than a checkbox that stayed in the browser; the terms have a version that a
# calendar cannot change; a production lock closes revisions without closing
# MCB's responsibility for its own mistakes; and no document claims a right
# nobody has.
#
# NOTHING HERE TOUCHES STRIPE and nothing is deployed.

BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then printf "  PASS  %-64s [%s]\n" "$name" "$got"; PASS=$((PASS+1));
  else printf "  FAIL  %-64s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
tc() { local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-64s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-64s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }

post_raw() { curl -s -o /tmp/lg.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
post() {
  [ "$1" = "order" ] && release_order_limit
  post_raw "$1" "$2"
}
body() { cat /tmp/lg.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }

# ---- The order endpoint is rate limited -------------------------------
#
# `POST /api/order` gained a limit of ten orders an hour per source in the
# final release hardening — it was the only unauthenticated write surface in
# the API without one. It counts rows in `order_consents`, keyed on the salted
# IP hash, because that table already carries the hash and gets exactly one row
# per successful order.
#
# These suites place far more than ten orders from a single address, so the
# attribution is released before each one — the same device already used for
# the concierge limiter. The rows themselves are untouched; only their
# rate-limit attribution is, and no assertion anywhere reads that column.
#
# That the limiter still fires is proved deliberately, once, in
# tests/hardening-acceptance.sh.
release_order_limit() { q "UPDATE order_consents SET ip_hash = NULL" >/dev/null 2>&1; }
qerr() { docker exec mcb-db mariadb -umcb -ptestpass -e "$1" mcb_crm 2>&1; }
CRMKEY="test_crm_key_not_real_000000000000000000000"
# Authenticated CRM helpers, matching the lifecycle suite's.
crm()  { curl -s -o /tmp/lg.json -w '%{http_code}' "$BASE/$1" -H "Authorization: Bearer $CRMKEY"; }
crmp() { curl -s -o /tmp/lg.json -w '%{http_code}' -X POST "$BASE/$1" -H "Authorization: Bearer $CRMKEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
# The version currently in force. Sprint 9.5 added the delivery,
# special-occasion, product-handling and liability clauses, so this moved from
# 2026-09-09 to 2026-09-09.2 — a same-day revision, hence the suffix rather
# than a new date. Assertions 1 and 5 pin the CURRENT version; the superseded
# one must still be recognised, which is asserted below and covered in depth by
# tests/delivery-acceptance.sh.
VER="2026-09-09.4"
SUPERSEDED_VER="2026-09-09"
# Orders now also require the cruise-companion field, so every payload that
# is not specifically testing it carries one.
CRUISE='"cruiseCompanions":"My husband David"'
FULL='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"'"$VER"'",'"$CRUISE"

# Customer-facing prose only. Every legal file explains WHY a phrase was
# removed, and those explanations necessarily quote the phrase — so the
# assertions below read the rendered strings, not the comments that discuss
# them. Comment lines are stripped before matching.
prose() { grep -v -E '^\s*(\*|//|/\*)' "$@"; }

echo "================ 1. VERSIONING ================"
tc "1. an explicit terms version exists" \
  "$(grep -q "TERMS_VERSION = \"$VER\"" src/data/legal/versions.ts && echo 1 || echo 0)"
tc "2. the effective date is static, not generated from the clock" \
  "$(prose src/pages/legal/Terms.tsx src/pages/legal/Refund.tsx src/pages/legal/Privacy.tsx | grep -q 'new Date()' && echo 0 || echo 1)"
tc "3. a refund policy version exists" \
  "$(grep -q 'REFUND_POLICY_VERSION' src/data/legal/versions.ts && echo 1 || echo 0)"
tc "4. a privacy policy version exists" \
  "$(grep -q 'PRIVACY_POLICY_VERSION' src/data/legal/versions.ts && echo 1 || echo 0)"
tc "5. the version reaches the server as generated data" \
  "$(grep -q "\"terms\": \"$VER\"" public/api/data/legal.json && echo 1 || echo 0)"
tc "6. superseded versions stay identifiable" \
  "$(grep -q 'SUPERSEDED_VERSIONS' src/data/legal/versions.ts && grep -q 'KNOWN_TERMS_VERSIONS' src/data/legal/versions.ts && echo 1 || echo 0)"
tc "6b.  → and the previous edition is still recognised by the server" \
  "$(grep -q "\"$SUPERSEDED_VER\"" public/api/data/legal.json && echo 1 || echo 0)"
tc "6c.  → so an order accepted under it keeps that version, not this one" \
  "$(grep -A14 'export const SUPERSEDED_VERSIONS' src/data/legal/versions.ts | grep -q 'remain governed by it' && echo 1 || echo 0)"
tc "7. changes are prospective only" \
  "$(grep -q 'It does not change the terms of an order you have already placed' src/data/legal/versions.ts && echo 1 || echo 0)"
tc "8. no clause claims power to rewrite concluded contracts" \
  "$(prose src/data/legal/*.ts | grep -qiE 'change (these )?terms at any time (for|and apply).*(previous|existing) customers' && echo 0 || echo 1)"

echo ""
echo "================ 2. CONSENT IS EVIDENCE ================"
t "9. an order carrying NO consent is refused" 422 \
  "$(post order '{"firstName":"No","lastName":"Consent","email":"lg-none@example.com","package":"keepsake","format":"mp3","story":"x","termsVersion":"'"$VER"'"}')"
tc "10.  → refused on the consent field, not on something else" \
  "$(body | grep -q '"consents"' && echo 1 || echo 0)"
t "11. a crafted request cannot skip the digital acknowledgement" 422 \
  "$(post order '{"firstName":"Part","lastName":"Consent","email":"lg-part@example.com","package":"keepsake","format":"mp3","story":"x","consents":{"TERMS":true,"SERVICE_START":true},"termsVersion":"'"$VER"'"}')"
t "12. a truthy-but-not-true consent value is refused, not coerced" 422 \
  "$(post order '{"firstName":"Truthy","lastName":"X","email":"lg-truthy@example.com","package":"keepsake","format":"mp3","story":"x","consents":{"TERMS":"true","SERVICE_START":1,"DIGITAL_CONTENT":"on"},"termsVersion":"'"$VER"'"}')"
t "13. a terms version MCB never published is refused" 422 \
  "$(post order '{"firstName":"Bad","lastName":"Ver","email":"lg-ver@example.com","package":"keepsake","format":"mp3","story":"x","consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2019-01-01"}')"
tc "14.  → and named the version field" \
  "$(body | grep -q 'termsVersion' && echo 1 || echo 0)"
t "15. a fully consented order is accepted" 201 \
  "$(post order '{'"$FULL"',"firstName":"Good","lastName":"Order","email":"lg-ok@example.com","package":"keepsake","format":"mp3","story":"x"}')"
OID=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "16. the accepted terms version is persisted against the order" \
  "$([ "$(q "SELECT terms_version FROM order_consents WHERE order_id=$OID")" = "$VER" ] && echo 1 || echo 0)"
tc "17. an acceptance timestamp is persisted" \
  "$([ -n "$(q "SELECT terms_accepted_at FROM order_consents WHERE order_id=$OID")" ] && echo 1 || echo 0)"
tc "18. the refund and privacy versions are persisted too" \
  "$([ "$(q "SELECT CONCAT(refund_policy_version,'/',privacy_policy_version) FROM order_consents WHERE order_id=$OID")" = "$VER/$VER" ] && echo 1 || echo 0)"
tc "19. the early-service request is recorded as its own flag" \
  "$([ "$(q "SELECT service_start_requested FROM order_consents WHERE order_id=$OID")" = "1" ] && echo 1 || echo 0)"
tc "20. the digital acknowledgement is recorded for a digital order" \
  "$([ "$(q "SELECT digital_content_ack FROM order_consents WHERE order_id=$OID")" = "1" ] && echo 1 || echo 0)"
tc "21. consent evidence is booleans and timestamps, not a blob of text" \
  "$(q "SHOW COLUMNS FROM order_consents" | grep -q 'terms_accepted_at' && q "SHOW COLUMNS FROM order_consents" | grep -q 'digital_content_ack' && echo 1 || echo 0)"

t "22. a physical order is not asked to acknowledge digital supply" 201 \
  "$(post order '{"consents":{"TERMS":true,"SERVICE_START":true},"termsVersion":"'"$VER"'",'"$CRUISE"',"firstName":"Vin","lastName":"Yl","email":"lg-vinyl@example.com","package":"keepsake","format":"vinyl","story":"x","shippingName":"V Y","shippingAddress":"1 St","shippingCity":"London","shippingPostcode":"E1 1AA","shippingCountry":"United Kingdom"}')"
OIDV=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "23.  → and its acknowledgement is NULL, not 0 (never asked ≠ declined)" \
  "$([ "$(q "SELECT IFNULL(digital_content_ack,'NULL') FROM order_consents WHERE order_id=$OIDV")" = "NULL" ] && echo 1 || echo 0)"
# Attempted against a FRESH order id with no consent row, so the UNIQUE key
# cannot fire first and mask the constraint being tested.
post order '{"consents":{"TERMS":true,"SERVICE_START":true},"termsVersion":"'"$VER"'",'"$CRUISE"',"firstName":"Chk","lastName":"Row","email":"lg-chk@example.com","package":"keepsake","format":"vinyl","story":"x","shippingName":"C R","shippingAddress":"1 St","shippingCity":"London","shippingPostcode":"E1 1AA","shippingCountry":"United Kingdom"}' >/dev/null
OIDC=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
q "DELETE FROM order_consents WHERE order_id=$OIDC" >/dev/null
tc "24. the DATABASE refuses a required-but-missing digital acknowledgement" \
  "$(qerr "INSERT INTO order_consents (order_id,terms_version,refund_policy_version,privacy_policy_version,terms_accepted_at,digital_content_required,digital_content_ack) VALUES ($OIDC,'$VER','$VER','$VER',UTC_TIMESTAMP(),1,NULL)" | grep -q 'chk_consent_digital' && echo 1 || echo 0)"
tc "25. no consent box is pre-ticked" \
  "$(grep -A4 'INITIAL_CONSENT_STATE' src/data/legal/consent.ts | grep -q 'true' && echo 0 || echo 1)"
tc "26. the three acts are modelled separately, not as one boolean" \
  "$([ "$(grep -c '  id: "' src/data/legal/consent.ts)" = "3" ] && echo 1 || echo 0)"
tc "27. the old single agreeTerms boolean is gone from the form" \
  "$(prose src/sections/OrderFormSection.tsx | grep -q 'agreeTerms' && echo 0 || echo 1)"

echo ""
echo "================ 3. PRODUCTION LOCK ================"
tc "28. a new order opens at CREATIVE, not locked" \
  "$([ "$(q "SELECT stage FROM order_production WHERE order_id=$OID")" = "CREATIVE" ] && echo 1 || echo 0)"
tc "29. PAID IS NOT PRODUCTION_LOCKED — they are different columns entirely" \
  "$(q "SHOW COLUMNS FROM order_production" | grep -qi "^status" && echo 0 || echo 1)"
tc "30. a fresh order still has its revisions open" \
  "$(curl -s "$BASE/crm/production?order=$OID" -H "Authorization: Bearer $CRMKEY" | grep -q '"revisions_open":true' && echo 1 || echo 0)"
tc "31. the payment status is reported alongside, never as a substitute" \
  "$(curl -s "$BASE/crm/production?order=$OID" -H "Authorization: Bearer $CRMKEY" | grep -q '"payment_status":"PENDING"' && echo 1 || echo 0)"
t "32. recording an approval with no channel is refused" 422 \
  "$(curl -s -o /tmp/lg.json -w '%{http_code}' -X POST "$BASE/crm/production" -H "Authorization: Bearer $CRMKEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"order_id":'"$OID"',"stage":"APPROVED"}')"
t "33. an approval recorded through a real channel is accepted" 200 \
  "$(curl -s -o /tmp/lg.json -w '%{http_code}' -X POST "$BASE/crm/production" -H "Authorization: Bearer $CRMKEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"order_id":'"$OID"',"stage":"APPROVED","approval_channel":"WHATSAPP","approval_reference":"thread 1","approved_by":"Ops"}')"
tc "34.  → and closes the revision entitlement" \
  "$(body | grep -q '"revisions_open":false' && echo 1 || echo 0)"
tc "35.  → while the order is still only PENDING payment (lock ≠ paid)" \
  "$(body | grep -q '"payment_status":"PENDING"' && echo 1 || echo 0)"
tc "36. the approval channel and timestamp are both persisted" \
  "$([ "$(q "SELECT CONCAT(approval_channel,'|',IF(approved_at IS NULL,'NO','YES')) FROM order_production WHERE order_id=$OID")" = "WHATSAPP|YES" ] && echo 1 || echo 0)"
tc "37. the DATABASE refuses an APPROVED row that cannot evidence approval" \
  "$(qerr "INSERT INTO order_production (order_id,stage) VALUES ($OIDV,'APPROVED')" | grep -q 'chk_production_approval' && echo 1 || echo 0)"
tc "38. approval is recorded off-website, honestly — email/WhatsApp/phone are channels" \
  "$(grep -q "'WEBSITE','EMAIL','WHATSAPP','PHONE','IN_PERSON'" db/schema.sql && echo 1 || echo 0)"
tc "39. checkout acceptance is stated to be a different act from approval" \
  "$(grep -q 'APPROVAL_IS_NOT_CHECKOUT' src/data/legal/production.ts && echo 1 || echo 0)"
tc "40. the production record holds no creative content" \
  "$(q "SHOW COLUMNS FROM order_production" | grep -qiE '^(story|brief|lyrics)' && echo 0 || echo 1)"
tc "41. locking is recorded with its own timestamp, separate from approval" \
  "$(q "SHOW COLUMNS FROM order_production" | grep -q 'production_locked_at' && echo 1 || echo 0)"
tc "42. a locked order's timestamp is set when it locks" \
  "$(curl -s -X POST "$BASE/crm/production" -H "Authorization: Bearer $CRMKEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"order_id":'"$OID"',"stage":"PRODUCTION_LOCKED","approval_channel":"WHATSAPP"}' >/dev/null; [ -n "$(q "SELECT production_locked_at FROM order_production WHERE order_id=$OID")" ] && echo 1 || echo 0)"
tc "43. re-recording does not move the original approval date" \
  "$(A1=$(q "SELECT approved_at FROM order_production WHERE order_id=$OID"); curl -s -X POST "$BASE/crm/production" -H "Authorization: Bearer $CRMKEY" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"order_id":'"$OID"',"stage":"FULFILMENT","approval_channel":"EMAIL"}' >/dev/null; [ "$A1" = "$(q "SELECT approved_at FROM order_production WHERE order_id=$OID")" ] && echo 1 || echo 0)"

echo ""
echo "================ 4. WHAT THE DOCUMENTS MAY NOT SAY ================"
# Customer-facing documents ONLY. `data/legal/review.ts` deliberately holds
# the banned phrases so a reviewer can see what was removed and why; scanning
# it would find them there and fail for the opposite of the right reason. It is
# internal, unexported and never rendered — assertions 101 and 102 prove that.
LEGAL_PROSE="src/data/legal/terms.ts src/data/legal/refunds.ts src/data/legal/consent.ts src/pages/legal/Terms.tsx src/pages/legal/Refund.tsx src/pages/legal/Privacy.tsx src/pages/FAQ.tsx"
tc "44. no 'no refunds under any circumstances'" \
  "$(prose $LEGAL_PROSE | grep -qi 'no refunds under any circumstances' && echo 0 || echo 1)"
tc "45. no blanket 'refunds are not available once production has started'" \
  "$(prose $LEGAL_PROSE | grep -qi 'refunds are not available once production' && echo 0 || echo 1)"
tc "46. no blanket 'no refunds or returns for personalised items'" \
  "$(prose $LEGAL_PROSE | grep -qi 'no refunds or returns for personalised' && echo 0 || echo 1)"
tc "47. no 48-hour deadline presented as extinguishing rights" \
  "$(prose $LEGAL_PROSE | grep -qi 'within 48 hours' && echo 0 || echo 1)"
tc "48. no 24-hour cancellation window contradicting one-hour delivery" \
  "$(prose $LEGAL_PROSE | grep -qi 'cancelled within 24 hours' && echo 0 || echo 1)"
tc "49. the false 'never sold or shared' absolute is gone" \
  "$(prose $LEGAL_PROSE | grep -qi 'never sold or shared' && echo 0 || echo 1)"
tc "50. the Privacy page no longer claims data is never shared" \
  "$(prose src/pages/legal/Privacy.tsx | grep -qi 'We do not sell or share your data' && echo 0 || echo 1)"
# Strengthened: the page no longer merely mentions that processors exist, it
# renders a table of every one, from a verified inventory. Assert the
# inventory AND that the named processors reach the built bundle.
tc "51.  → and names the processors it actually relies on" \
  "$([ "$(grep -c 'name: \"' src/data/legal/privacy.ts)" -ge "10" ] \
     && grep -q 'PROCESSORS' src/pages/legal/Privacy.tsx \
     && grep -rq 'Cloudinary' dist/assets/ 2>/dev/null && echo 1 || echo 0)"
tc "51b.  → each processor entry cites the source file that proves it" \
  "$([ "$(grep -c '^    evidence: ' src/data/legal/privacy.ts)" = "$(grep -c '^    name: \"' src/data/legal/privacy.ts)" ] && echo 1 || echo 0)"
tc "52. the liability cap at 'the amount paid' is gone" \
  "$(prose $LEGAL_PROSE | grep -qi 'liability is limited to the amount paid' && echo 0 || echo 1)"
# The strongest form of the same assertion: not in the source, and not in the
# JavaScript a customer's browser downloads either.
tc "52b. and none of the banned phrases reaches the built bundle" "$(
  python3 - <<'PYEOF'
import re, pathlib, sys
src = pathlib.Path("src/data/legal/review.ts").read_text()
phrases = re.findall(r'phrase: "([^"]+)"', src)
bundle = "\n".join(p.read_text(errors="ignore") for p in pathlib.Path("dist/assets").glob("*.js"))
hits = [p for p in phrases if p.lower() in bundle.lower()]
print(0 if hits else 1)
PYEOF
)"

echo ""
echo "================ 5. WHAT THEY MUST SAY ================"
# ─────────────────────────────────────────────────────────────────────
# FOUNDER DECISION, RECORDED RATHER THAN SILENTLY DROPPED
#
# Assertions 53-57, 60 and 67-70 previously required the Terms to preserve
# faulty-goods rights, not-as-described rights, a conditional
# personalised-goods exception, an express statement that the production
# lock does not cover MCB's own errors, quoted-first post-lock changes,
# third-party fulfilment responsibility, non-excludable liability and
# mandatory overseas consumer rights.
#
# The Founder replaced the entire clause set at version 2026-09-09.4 and
# none of that wording survives. These assertions therefore encoded
# business decisions that have been superseded, and they are updated
# rather than deleted: what the suite now guards is that the removal is
# RECORDED in the internal review register, so the fact that these
# protections were taken out cannot quietly disappear from the repository.
# ─────────────────────────────────────────────────────────────────────
tc "53. the Founder's clause set is what is published" \
  "$(grep -q 'FOUNDER-SUPPLIED WORDING. REPLACED WHOLESALE, NOT EDITED.' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "54.  → and the register records exactly which protections went" \
  "$(grep -q 'clauses that consumer law does not permit' src/data/legal/review.ts && echo 1 || echo 0)"
tc "55.  → naming the death/personal-injury exclusion as the most serious" \
  "$(grep -q 'the single most serious item here' src/data/legal/review.ts && echo 1 || echo 0)"
tc "56.  → the no-refund clause with no carve-out for faulty goods" \
  "$(grep -q "no carve-out for faulty or misdescribed goods" src/data/legal/review.ts && echo 1 || echo 0)"
tc "57.  → the courier-damage disclaimer" \
  "$(grep -q 'goods remain the trader' src/data/legal/review.ts && echo 1 || echo 0)"
tc "60.  → the 24-hour claim window" \
  "$(grep -q 'statutory rights do not expire in 24 hours' src/data/legal/review.ts && echo 1 || echo 0)"
tc "67.  → the retrospective terms-change clause" \
  "$(grep -q 'purports to vary concluded contracts retrospectively' src/data/legal/review.ts && echo 1 || echo 0)"
tc "68.  → and the transfer of legal liability to the customer" \
  "$(grep -q "transfer the trader's own liability to the consumer" src/data/legal/review.ts && echo 1 || echo 0)"
tc "69. the entry is BLOCKING, not downgraded to make a release green" \
  "$(grep -A6 'clauses that consumer law does not permit' src/data/legal/review.ts | grep -q 'BLOCKING' && echo 1 || echo 0)"
tc "70. and the repository does not claim the wording was legally approved" \
  "$(grep -q 'has NOT been reviewed by a solicitor\|NOT LEGALLY REVIEWED' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "58. a refinement is defined" \
  "$(grep -q 'REFINEMENT_DEFINITION' src/data/legal/production.ts && echo 1 || echo 0)"
tc "59.  → and its limits are stated without making it meaningless" \
  "$([ "$(grep -c '^  \"' src/data/legal/production.ts)" -ge 5 ] && grep -q 'REFINEMENT_EXCLUSIONS' src/data/legal/production.ts && echo 1 || echo 0)"
# The Founder's clause 4 states the refinement position in its own words and
# does not use SCOPE_CHANGE_TREATMENT. The constant still exists and is still
# correct; it is simply no longer quoted in the Terms.
tc "60b. the refinement clause is the Founder's own wording" \
  "$(grep -q 'As soon as a song goes to Vinyl pressing, no refinements can be made' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "61. customer-supplied material is covered" \
  "$(grep -q 'materials-you-give-us' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "62.  → the customer keeps ownership of it" \
  "$(grep -q 'You keep ownership of it' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "63.  → and the licence is limited to fulfilling the order" \
  "$(grep -q 'only so far as we need to in order to create, produce and deliver your order' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "64.  → and they confirm they are entitled to supply it" \
  "$(grep -q 'you confirm you are entitled to give it to us' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "65. third-party rights and artist imitation are addressed" \
  "$(grep -q 'third-party-rights' src/data/legal/terms.ts && grep -q 'do not reproduce or imitate a specific recording' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "66. rights in MCB's work are stated once, without contradiction" \
  "$(grep -q 'rights-in-the-work' src/data/legal/terms.ts && prose $LEGAL_PROSE | grep -qi 'exclusive ownership' && echo 0 || echo 1)"
# 67-70 asserted protections the Founder's clause set removes. Their removal
# is guarded above (53-70), in the register, rather than here.
tc "67b. the courier-damage position is the Founder's own wording" \
  "$(grep -q 'do not take any responsibility for courier damages' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "68b. the consent checkbox no longer describes a cancellation route the Terms deny" \
  "$(grep -q 'we can charge you for the work already done' src/data/legal/consent.ts && echo 0 || echo 1)"
tc "69b.  → but the early-start ACT is still asked and still recorded separately" \
  "$(grep -q 'Please start work on my order straight away' src/data/legal/consent.ts \
     && [ "$(grep -c '^    id: \"' src/data/legal/consent.ts)" = "3" ] && echo 1 || echo 0)"
tc "70b. the Refunds page no longer promises a route the Terms deny" \
  "$(grep -q 'There is no cancellation of the product service after payment' src/data/legal/refunds.ts && echo 1 || echo 0)"
tc "71. the digital-supply consequence is stated beside its checkbox" \
  "$(grep -q 'I lose the right to cancel that digital content' src/data/legal/consent.ts && echo 1 || echo 0)"

echo ""
echo "================ 6. ENTITLEMENTS MATCH THE PACKAGES ================"
tc "72. the Terms derive entitlements rather than restating them" \
  "$(grep -q 'revisionEntitlements' src/data/legal/terms.ts && grep -q 'pkg.revisions' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "73. Moment still includes 1 revision" \
  "$(grep -q 'revisions: "1 revision included"' src/data/packages.ts && echo 1 || echo 0)"
tc "74. Keepsake includes 1 refinement revision (Founder revision)" \
  "$(grep -q 'revisions: "1 refinement revision"' src/data/packages.ts && echo 1 || echo 0)"
tc "75. Journey and Heirloom include 1 refinement per song (Founder revision)" \
  "$([ "$(grep -c 'revisions: \"1 refinement per song\"' src/data/packages.ts)" = "2" ] && echo 1 || echo 0)"
tc "76. the Full Package did NOT inherit 'unlimited refinements'" \
  "$(awk '/export const FULL_PACKAGE/,/^};/' src/data/packages.ts | grep -qi 'unlimited' && echo 0 || echo 1)"
tc "77. no surface anywhere still promises unlimited refinements" \
  "$(prose src/data/packages.ts src/pages/FAQ.tsx src/data/legal/*.ts | grep -qi 'unlimited refinement' && echo 0 || echo 1)"
tc "78. the FAQ derives its revision answer from the packages" \
  "$(grep -q 'MOMENT.revisions.toLowerCase()' src/pages/FAQ.tsx && echo 1 || echo 0)"

echo ""
echo "================ 7. THE FULL PACKAGE IS NOT A PURCHASE ================"
tc "79. an enquiry is described as committing neither side" \
  "$(grep -q 'A Full Package enquiry is not a purchase' src/data/legal/refunds.ts && echo 1 || echo 0)"
tc "80. the concierge contract is formed by the written proposal" \
  "$(grep -q "that commission's own written terms" src/data/legal/refunds.ts && echo 1 || echo 0)"
# Counted before and after, rather than against the order count: assertion 24
# deliberately deletes a consent row to test the CHECK constraint, so the two
# tables are legitimately out of step by then.
CONSENTS_BEFORE=$(q "SELECT COUNT(*) FROM order_consents")
t "81. a concierge enquiry needs no purchase consent and takes no payment" 201 \
  "$(post concierge/enquiry '{"name":"Legal Test","email":"lg-fp@example.com","budgetMode":"UNSURE"}')"
tc "82.  → and created no order" \
  "$([ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='lg-fp@example.com'")" = "0" ] && echo 1 || echo 0)"
tc "83.  → and no consent row, because there is no contract to consent to" \
  "$([ "$(q "SELECT COUNT(*) FROM order_consents")" = "$CONSENTS_BEFORE" ] && echo 1 || echo 0)"
t "84. the Full Package still cannot be ordered" 422 \
  "$(post order '{'"$FULL"',"firstName":"F","lastName":"P","email":"lg-fpo@example.com","package":"bespoke","format":"","story":"x"}')"

echo ""
echo "================ 8. DURABLE CONFIRMATION ================"
tc "85. the confirmation email names the accepted terms version" \
  "$(grep -q 'terms_version' public/api/lib/notify.php && grep -q 'This order is governed by version' public/api/lib/notify.php && echo 1 || echo 0)"
tc "86.  → read from the ORDER's record, not from today's page" \
  "$(grep -q 'LEFT JOIN order_consents oc' public/api/lib/notify.php && echo 1 || echo 0)"
tc "87.  → in both the text and HTML parts" \
  "$([ "$(grep -c 'This order is governed by version' public/api/lib/notify.php)" = "2" ] && echo 1 || echo 0)"
tc "88. and it tells the customer a later change will not affect them" \
  "$(grep -q 'your order stays governed by the version named here' public/api/lib/notify.php && echo 1 || echo 0)"

echo ""
echo "================ 9. NOTHING ELSE MOVED ================"
tc "89. package prices unchanged (10/79/199/349)" \
  "$(for p in 'gbp: 10' 'gbp: 79' 'gbp: 199' 'gbp: 349'; do grep -q "$p," src/data/packages.ts || exit 1; done && echo 1 || echo 0)"
tc "90. the Full Package still publishes no price" \
  "$(grep -A3 '"bespoke"' public/api/data/packages.json | grep -q '"price_gbp": null' && echo 1 || echo 0)"
tc "91. all nine Payment Link URLs unchanged" \
  "$([ "$(cat src/data/packages.ts src/data/legal/*.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"
tc "92. dynamic checkout stays OFF in the shipped config template" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "93. the client checkout flag stays false" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"
tc "94. no Stripe secret in the built bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "95. the legal modules make no Stripe call" \
  "$(prose src/data/legal/*.ts public/api/lib/legal.php | grep -qiE 'api\.stripe\.com|fetch\(|curl_|stripe_create|sk_(live|test)_' && echo 0 || echo 1)"
tc "96. optional enhancements are still opt-in with nothing preselected" \
  "$(grep -q 'Nothing here is required and nothing is preselected' src/components/CompleteYourMemory.tsx && echo 1 || echo 0)"
tc "97. the order review still shows a total before payment" \
  "$(grep -q 'totalGbp' src/lib/completeMemory.ts && grep -q 'YourMemorySummary' src/sections/OrderFormSection.tsx && echo 1 || echo 0)"
tc "98. the migration is additive — it alters and drops nothing" \
  "$(grep -qiE '^\s*(ALTER|DROP|DELETE|TRUNCATE)' db/migrations/2026-09-09-legal-consent-production.sql && echo 0 || echo 1)"

echo ""
echo "================ 9b. LEGAL-PAGE SEO ================"
tc "98b. legal pages emit no Product or Offer schema" \
  "$(grep -rq '"@type": "Product"' dist/assets/*.js 2>/dev/null && prose src/pages/legal/*.tsx | grep -qi 'application/ld+json' && echo 0 || echo 1)"
tc "98c. and add no second canonical over App.tsx's" \
  "$(grep -q 'rel="canonical"' src/pages/legal/Terms.tsx src/pages/legal/Refund.tsx src/pages/legal/Privacy.tsx && echo 0 || echo 1)"
tc "98d. each legal page states its own title and description" \
  "$(for f in Terms Refund Privacy; do grep -q '<title>' src/pages/legal/$f.tsx && grep -q 'name="description"' src/pages/legal/$f.tsx || exit 1; done && echo 1 || echo 0)"

echo ""
echo "================ 9c. CRUISE COMPANION FIELD ================"
t "A1. an order without the cruise field is refused" 422 \
  "$(post order '{"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"'"$VER"'","firstName":"NoCruise","lastName":"X","email":"lg-nc2@example.com","package":"keepsake","format":"mp3","story":"x"}')"
tc "A2.  → named on its own field, so the customer knows which one" \
  "$(body | grep -q 'cruiseCompanions' && echo 1 || echo 0)"
t "A3. an order with it is accepted" 201 \
  "$(post order '{'"$FULL"',"firstName":"Cruise","lastName":"Y","email":"lg-cruise@example.com","package":"keepsake","format":"mp3","story":"x"}')"
OIDCR=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "A4.  → and persists exactly as the customer wrote it" \
  "$([ "$(q "SELECT brief_cruise_companions FROM orders WHERE id=$OIDCR")" = "My husband David" ] && echo 1 || echo 0)"
tc "A5. it is visible on the production workflow surface" \
  "$(crm "crm/production?order=$OIDCR" >/dev/null; body | grep -q 'My husband David' && echo 1 || echo 0)"
tc "A6. it is NOT withheld behind the orders surface's brief exclusion" \
  "$(grep -q 'brief_cruise_companions' public/api/crm/production.php && echo 1 || echo 0)"
tc "A7. it never reaches analytics" \
  "$(grep -rqi 'cruise' src/lib/analytics.ts 2>/dev/null && echo 0 || echo 1)"
tc "A8. it never reaches Stripe metadata" \
  "$(grep -rqi 'cruise' public/api/checkout/session.php public/api/lib/stripe.php 2>/dev/null && echo 0 || echo 1)"
tc "A9. it asks for a sentence, not a profile — no age/gender/relationship field" \
  "$(q \"SHOW COLUMNS FROM orders\" | grep -qiE '^(age|gender|relationship|companion_age)' && echo 0 || echo 1)"
tc "A10. the column is nullable, so pre-existing orders read as 'not asked'" \
  "$([ "$(q "SHOW COLUMNS FROM orders LIKE 'brief_cruise_companions'" | awk '{print $3}')" = "YES" ] && echo 1 || echo 0)"

echo ""
echo "================ 9d. REVIEW-STATE MODEL ================"
tc "F1. SONG_READY exists" \
  "$(q "SHOW COLUMNS FROM order_production LIKE 'stage'" | grep -q 'SONG_READY' && echo 1 || echo 0)"
tc "F2. REVISION_REQUESTED exists" \
  "$(q "SHOW COLUMNS FROM order_production LIKE 'stage'" | grep -q 'REVISION_REQUESTED' && echo 1 || echo 0)"
tc "F3. a revision request keeps refinements OPEN" \
  "$(crmp crm/production '{"order_id":'"$OIDCR"',"stage":"REVISION_REQUESTED"}' >/dev/null; body | grep -q '"revisions_open":true' && echo 1 || echo 0)"
tc "F4.  → and needs no approval evidence, because none has happened" \
  "$(body | grep -q '"approved_at":null' && echo 1 || echo 0)"
tc "F5. approval still requires a channel" \
  "$(crmp crm/production '{"order_id":'"$OIDCR"',"stage":"APPROVED"}' | grep -q '^422$' && echo 1 || echo 0)"
tc "F6. the pre-approval set is derived, not a hard-coded list" \
  "$(grep -q 'revisions_remain_open(\$stage)' public/api/crm/production.php && echo 1 || echo 0)"
tc "F7. payment still does not equal creative approval" \
  "$([ "$(q "SELECT stage FROM order_production WHERE order_id=$OIDCR")" != "APPROVED" ] && echo 1 || echo 0)"

echo ""
echo "================ 10. INTERNAL GOVERNANCE ================"
tc "99. a solicitor-review register exists" \
  "$(grep -q 'LEGAL REVIEW REQUIRED BEFORE FINAL PRODUCTION RELEASE' src/data/legal/review.ts && echo 1 || echo 0)"
tc "100.  → naming cancellation, liability, IP, jurisdiction and privacy" \
  "$(for topic in 'Cancellation classification' 'Liability' 'IP and licence' 'Governing law' 'UK GDPR review'; do grep -q "$topic" src/data/legal/review.ts || exit 1; done && echo 1 || echo 0)"
tc "101.  → and no page, section or component imports it" \
  "$(grep -rqE 'from ["'"'"'].*legal/review' src/pages src/sections src/components 2>/dev/null && echo 0 || echo 1)"
tc "102.  → nor is it re-exported from the legal barrel" \
  "$(grep -qE '^export \* from "\./review"' src/data/legal/index.ts && echo 0 || echo 1)"
tc "103.  → so it never reaches the built bundle" \
  "$(grep -rq 'LEGAL REVIEW REQUIRED' dist/assets/ 2>/dev/null && echo 0 || echo 1)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
