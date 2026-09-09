#!/bin/bash
# MCB FULL PACKAGE / PRIVATE CONCIERGE — acceptance tests.
#
# Runs against the same throwaway PHP + MariaDB containers as
# api-acceptance.sh and checkout-acceptance.sh. See tests/README.md.
#
# NO REQUEST EVER REACHES STRIPE, and nothing here creates a payment of any
# kind — which is most of the point. The Full Package has no price and no
# checkout, and these assertions exist to prove that is structurally true
# rather than merely currently true.
#
# WHAT IS BEING PROVED, IN ONE LINE: an enquiry is not an order, £799 is gone
# from every customer-facing surface, the retired Payment Link is still in
# source but unreachable, and the budget the customer stated is stored exactly
# as they stated it.

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

# ---- Sprint 8: orders now require consent evidence ---------------------
#
# `POST /api/order` refuses an order that does not carry the acknowledgements
# it requires. Every assertion below that creates an order in order to test
# something else — attribution, references, baskets, webhooks — would otherwise
# fail on a consent field it was never written to exercise.
#
# So `post order` splices a full consent block into any body that does not
# already carry one. `post_raw` sends exactly what it is given, for the tests
# that ARE about consent.
CONSENT_BLOCK='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2026-09-09"'

with_consent() {
  case "$1" in
    *'"consents"'*) printf '%s' "$1" ;;
    '{"'*)          printf '{%s,%s' "$CONSENT_BLOCK" "${1#\{}" ;;
    *)              printf '%s' "$1" ;;
  esac
}

post_raw() { curl -s -o /tmp/fp.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
post() {
  local ep="$1" data="$2"
  [ "$ep" = "order" ] && data="$(with_consent "$data")"
  post_raw "$ep" "$data"
}
body() { cat /tmp/fp.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }
qerr() { docker exec mcb-db mariadb -umcb -ptestpass -e "$1" mcb_crm 2>&1; }
CRMKEY="test_crm_key_not_real_000000000000000000000"

# The endpoint allows five enquiries an hour from one source, which is right
# for a person and far too few for a suite that submits a dozen. Sections that
# are not testing the limiter release the consumed budget first, so a later
# 429 means the limiter fired — not that the test ran out of allowance.
# The rows themselves are untouched; only their rate-limit attribution is.
release_limit() { q "UPDATE concierge_enquiries SET ip_hash = NULL" >/dev/null; }

# The retired Bespoke Payment Link, written out here so a change to it fails
# a test rather than passing quietly. §32: it must remain byte-identical.
LEGACY_LINK="https://buy.stripe.com/5kQ8wO9vKcLR3KO3eabsc09"

echo "================ 1. THE COMMERCIAL MODEL ================"
tc "1. bespoke declares commercialModel CONCIERGE" \
  "$(grep -q 'commercialModel: "CONCIERGE"' src/data/packages.ts && echo 1 || echo 0)"
tc "2. the four sold experiences declare FIXED_PRICE" \
  "$([ "$(grep -c 'commercialModel: \"FIXED_PRICE\",' src/data/packages.ts)" = "4" ] && echo 1 || echo 0)"
tc "3. the Full Package is named, not called Bespoke, to customers" \
  "$(grep -q 'name: "The Full Package"' src/data/packages.ts && echo 1 || echo 0)"
tc "4. it keeps the internal id 'bespoke' for compatibility" \
  "$(grep -A2 'export const FULL_PACKAGE' src/data/packages.ts | grep -q 'id: "bespoke"' && echo 1 || echo 0)"
tc "5. it carries the Private Concierge label" \
  "$(grep -q 'conciergeLabel: "Private Concierge"' src/data/packages.ts && echo 1 || echo 0)"
tc "6. the approved concierge copy is present verbatim" \
  "$(grep -q 'Every Full Package is individually curated. We combine MCB' src/data/packages.ts && echo 1 || echo 0)"
tc "7. the commercial sequence ends at payment, not begins with it" \
  "$(grep -q 'CONCIERGE_SEQUENCE' src/data/packages.ts && grep -q 'Payment arranged' src/data/packages.ts && echo 1 || echo 0)"

echo ""
echo "================ 2. NO PRICE ANYWHERE CUSTOMER-FACING ================"
tc "8. FULL_PACKAGE declares no live price object" \
  "$(awk '/export const FULL_PACKAGE/,/^};/' src/data/packages.ts | grep -q '^  price:' && echo 0 || echo 1)"
tc "9. the retired figures live in a module nothing in src/ imports" \
  "$(grep -q 'gbp: 799' src/data/legacy/retiredBespoke.ts \
     && [ "$(grep -rl 'legacy/retiredBespoke' src/ | wc -l | tr -d ' ')" = "1" ] && echo 1 || echo 0)"
tc "10. generated packages.json carries commercial_model CONCIERGE" \
  "$(grep -q '"commercial_model": "CONCIERGE"' public/api/data/packages.json && echo 1 || echo 0)"
tc "11. generated packages.json gives bespoke a NULL price" \
  "$(grep -A3 '"bespoke"' public/api/data/packages.json | grep -q '"price_gbp": null' && echo 1 || echo 0)"
tc "12. the figure 799 appears nowhere in the generated server data" \
  "$(grep -q '799' public/api/data/packages.json && echo 0 || echo 1)"
tc "13. the built browser bundle never says 'From £799'" \
  "$(grep -rq 'From £799' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "14. and the retired Payment Link never reaches the browser bundle" \
  "$(grep -rqF "$LEGACY_LINK" dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "15. formatPrice returns null rather than inventing a figure" \
  "$(grep -q 'if (!pkg.price) return null;' src/data/packages.ts && echo 1 || echo 0)"
tc "16. structured data emits NO offers node for a concierge package" \
  "$(grep -q 'offer !== null && {' src/lib/seo.ts && echo 1 || echo 0)"
tc "17. hasFixedPrice is false when there is no price at all" \
  "$(grep -q 'pkg.price !== undefined && !pkg.price.prefix' src/lib/seo.ts && echo 1 || echo 0)"
tc "18. the FAQ renders no price for the Full Package" \
  "$(grep -v '^\s*\*' src/pages/FAQ.tsx | grep -q '799' && echo 0 || echo 1)"

echo ""
echo "================ 3. THE LEGACY PAYMENT LINK ================"
tc "19. the retired Bespoke Payment Link is still in source, byte-identical" \
  "$(grep -qF "$LEGACY_LINK" src/data/legacy/retiredBespoke.ts && echo 1 || echo 0)"
tc "20. the Full Package declares no fallbackCheckout to be found by" \
  "$(awk '/export const FULL_PACKAGE/,/^};/' src/data/packages.ts | grep -q '^  fallbackCheckout' && echo 0 || echo 1)"
tc "21. all nine Payment Link URLs remain present in source" \
  "$([ "$(cat src/data/packages.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"
tc "22. getCheckoutTarget refuses a concierge package before any other branch" \
  "$(grep -q 'if (isConcierge(pkg)) return undefined;' src/data/packages.ts && echo 1 || echo 0)"
tc "23. the eight SELLABLE links do still reach the bundle (23 is not vacuous)" \
  "$([ "$(grep -roh 'https://buy.stripe.com/[A-Za-z0-9]*' dist/assets/ | sort -u | wc -l | tr -d ' ')" = "8" ] && echo 1 || echo 0)"

echo ""
echo "================ 4. THE PAID PATHS REFUSE IT ================"
ORD='{"firstName":"Con","lastName":"Cierge","email":"fp-order@example.com","package":"bespoke","format":"","story":"x"}'
t "24. POST /api/order refuses the Full Package" 422 "$(post order "$ORD")"
tc "25.  → refused on the package field, with a human explanation" \
  "$(body | grep -q '"package":"That experience is arranged personally' && echo 1 || echo 0)"
tc "26.  → and no order row was written for it" \
  "$([ "$(q "SELECT COUNT(*) FROM orders WHERE package='bespoke'")" = "0" ] && echo 1 || echo 0)"
OIDK=$(curl -s -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
  -d '{'"$CONSENT_BLOCK"',"firstName":"Con","lastName":"Trol","email":"fp-control@example.com","package":"keepsake","format":"mp3","story":"x"}' \
  | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "27. the control order (keepsake) was accepted, so 24 is not a blanket failure" \
  "$([ -n "$OIDK" ] && echo 1 || echo 0)"
t "28. POST /api/checkout/session refuses the Full Package" 422 "$(post checkout/session '{"package":"bespoke","orderId":'"$OIDK"'}')"
tc "29.  → with the concierge code, not 'unpriced_package'" \
  "$(body | grep -q 'concierge_package' && echo 1 || echo 0)"
tc "30.  → and no checkout session row exists for it" \
  "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE package='bespoke'")" = "0" ] && echo 1 || echo 0)"
tc "31. the refusal lives in price_basket, so every future basket inherits it" \
  "$(grep -q "package_is_concierge(\$packageId)" public/api/lib/basket.php && echo 1 || echo 0)"
tc "32. package_is_concierge fails CLOSED for an unknown id" \
  "$(grep -A4 'function package_is_concierge' public/api/lib/packages.php | grep -q 'return true;' && echo 1 || echo 0)"

echo ""
echo "================ 5. COMPLETE YOUR MEMORY EXCLUSION ================"
tc "33. offersFor returns nothing for a concierge package" \
  "$(grep -q 'if (isConcierge(pkg)) return \[\];' src/lib/completeMemory.ts && echo 1 || echo 0)"
tc "34. the exclusion is by commercial model, not by the id 'bespoke'" \
  "$(grep -q 'packageId === "bespoke"' src/lib/completeMemory.ts && echo 0 || echo 1)"

echo ""
echo "================ 6. THE ENQUIRY IS RECORDED, NOT CHARGED ================"
t "35. a minimal enquiry is accepted" 201 \
  "$(post concierge/enquiry '{"name":"Ada L","email":"fp1@example.com","budgetMode":"UNSURE","story":"For my mother."}')"
REF1=$(body | sed -n 's/.*"reference":"\([^"]*\)".*/\1/p')
tc "36.  → an FP- reference is issued, never an MCB- order reference" \
  "$(echo "$REF1" | grep -Eq '^FP-[0-9]{4}-[0-9A-Z]{6}$' && echo 1 || echo 0)"
tc "37.  → the response says RECEIVED, not CONFIRMED or PAID" \
  "$(body | grep -q '"status":"RECEIVED"' && echo 1 || echo 0)"
tc "38.  → the response carries no amount, total or currency of charge" \
  "$(body | grep -Eqi '"(amount|total|price|currency|paid)"' && echo 0 || echo 1)"
tc "39.  → the enquiry's status is NEW, never PENDING" \
  "$([ "$(q "SELECT status FROM concierge_enquiries WHERE reference='$REF1'")" = "NEW" ] && echo 1 || echo 0)"
tc "40.  → it created no order" \
  "$([ "$(q "SELECT COUNT(*) FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE email='fp1@example.com')")" = "0" ] && echo 1 || echo 0)"
tc "41.  → it created no checkout session" \
  "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions")" = "0" ] && echo 1 || echo 0)"
tc "42.  → and it did NOT create a customers row (an enquirer is not a buyer)" \
  "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='fp1@example.com'")" = "0" ] && echo 1 || echo 0)"
tc "43. the enquiries table has no amount or payment column at all" \
  "$(q "SHOW COLUMNS FROM concierge_enquiries" | grep -Eqi '^(amount|amount_gbp|amount_usd|paid|payment)' && echo 0 || echo 1)"
tc "44. and no status value that could read as a payment state" \
  "$(q "SHOW COLUMNS FROM concierge_enquiries LIKE 'status'" | grep -Eqi "'PAID'|'PENDING'" && echo 0 || echo 1)"

echo ""
echo "================ 7. THE BUDGET IS STORED AS STATED ================"
release_limit
post concierge/enquiry '{"name":"Open P","email":"fp-open@example.com","budgetMode":"OPEN"}' >/dev/null
REFO=$(body | sed -n 's/.*"reference":"\([^"]*\)".*/\1/p')
tc "45. 'no fixed limit' is stored as budget_mode = OPEN" \
  "$([ "$(q "SELECT budget_mode FROM concierge_enquiries WHERE reference='$REFO'")" = "OPEN" ] && echo 1 || echo 0)"
tc "46.  → with a NULL amount, never 0 and never a sentinel" \
  "$([ "$(q "SELECT IFNULL(budget_amount_minor,'NULL') FROM concierge_enquiries WHERE reference='$REFO'")" = "NULL" ] && echo 1 || echo 0)"
tc "47.  → and a NULL currency, since there is no figure to denominate" \
  "$([ "$(q "SELECT IFNULL(budget_currency,'NULL') FROM concierge_enquiries WHERE reference='$REFO'")" = "NULL" ] && echo 1 || echo 0)"
post concierge/enquiry '{"name":"Amt P","email":"fp-amt@example.com","budgetMode":"AMOUNT","budgetAmount":"10,000","budgetCurrency":"USD"}' >/dev/null
REFA=$(body | sed -n 's/.*"reference":"\([^"]*\)".*/\1/p')
tc "48. an EXACT amount is stored exactly, in minor units" \
  "$([ "$(q "SELECT budget_amount_minor FROM concierge_enquiries WHERE reference='$REFA'")" = "1000000" ] && echo 1 || echo 0)"
tc "49.  → in the currency the customer DECLARED, not converted to GBP" \
  "$([ "$(q "SELECT budget_currency FROM concierge_enquiries WHERE reference='$REFA'")" = "USD" ] && echo 1 || echo 0)"
post concierge/enquiry '{"name":"Dec P","email":"fp-dec@example.com","budgetMode":"AMOUNT","budgetAmount":"79.99","budgetCurrency":"EUR"}' >/dev/null
REFD=$(body | sed -n 's/.*"reference":"\([^"]*\)".*/\1/p')
tc "50. a decimal amount survives exactly (79.99 is 7999, not 7998)" \
  "$([ "$(q "SELECT budget_amount_minor FROM concierge_enquiries WHERE reference='$REFD'")" = "7999" ] && echo 1 || echo 0)"
t "51. an amount of zero is refused, not stored as 'no limit'" 422 \
  "$(post concierge/enquiry '{"name":"Z","email":"fp-zero@example.com","budgetMode":"AMOUNT","budgetAmount":"0","budgetCurrency":"GBP"}')"
t "52. an AMOUNT with no currency is refused" 422 \
  "$(post concierge/enquiry '{"name":"Z","email":"fp-nocur@example.com","budgetMode":"AMOUNT","budgetAmount":"500"}')"
t "53. an implausible amount is refused rather than recorded" 422 \
  "$(post concierge/enquiry '{"name":"Z","email":"fp-huge@example.com","budgetMode":"AMOUNT","budgetAmount":"999999999999","budgetCurrency":"GBP"}')"
tc "54. the DATABASE refuses OPEN carrying an amount, not just the endpoint" \
  "$(qerr "INSERT INTO concierge_enquiries (reference,name,email,budget_mode,budget_amount_minor,budget_currency) VALUES ('FP-2099-AAAAAA','X','x@e.com','OPEN',50000,'GBP')" | grep -q 'chk_concierge_budget' && echo 1 || echo 0)"
tc "55. the DATABASE refuses AMOUNT with no figure" \
  "$(qerr "INSERT INTO concierge_enquiries (reference,name,email,budget_mode) VALUES ('FP-2099-BBBBBB','X','x@e.com','AMOUNT')" | grep -q 'chk_concierge_budget' && echo 1 || echo 0)"
tc "56. the DATABASE refuses AMOUNT of zero" \
  "$(qerr "INSERT INTO concierge_enquiries (reference,name,email,budget_mode,budget_amount_minor,budget_currency) VALUES ('FP-2099-CCCCCC','X','x@e.com','AMOUNT',0,'GBP')" | grep -q 'chk_concierge_budget' && echo 1 || echo 0)"
tc "57.  → and none of those three rows exists" \
  "$([ "$(q "SELECT COUNT(*) FROM concierge_enquiries WHERE reference LIKE 'FP-2099-%'")" = "0" ] && echo 1 || echo 0)"

echo ""
echo "================ 8. INTAKE VALIDATION ================"
release_limit
t "58. an impossible date is refused, not silently rolled forward" 422 \
  "$(post concierge/enquiry '{"name":"D","email":"fp-date@example.com","budgetMode":"OPEN","neededBy":"2026-02-30"}')"
t "59. a real date is accepted" 201 \
  "$(post concierge/enquiry '{"name":"D","email":"fp-date2@example.com","budgetMode":"OPEN","neededBy":"2026-12-01"}')"
tc "60.  → and stored as given" \
  "$([ "$(q "SELECT needed_by FROM concierge_enquiries WHERE email='fp-date2@example.com'")" = "2026-12-01" ] && echo 1 || echo 0)"
t "61. a phone preference with no number is refused as unreachable" 422 \
  "$(post concierge/enquiry '{"name":"P","email":"fp-ph@example.com","budgetMode":"OPEN","preferredContact":"PHONE"}')"
t "62. a missing name is refused" 422 \
  "$(post concierge/enquiry '{"name":"","email":"fp-nn@example.com","budgetMode":"OPEN"}')"
t "63. a malformed email is refused" 422 \
  "$(post concierge/enquiry '{"name":"E","email":"not-an-email","budgetMode":"OPEN"}')"
t "64. an unknown budget mode is refused" 422 \
  "$(post concierge/enquiry '{"name":"E","email":"fp-bm@example.com","budgetMode":"FREE"}')"
t "65. a cross-origin enquiry is rejected" 403 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/concierge/enquiry" -H "Content-Type: application/json" -H "Origin: https://evil.example" -d '{"name":"X","email":"x@e.com","budgetMode":"OPEN"}')"
t "66. GET is rejected — an enquiry is a write" 405 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/concierge/enquiry")"
t "67. malformed JSON is rejected" 400 \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/concierge/enquiry" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"name":')"
tc "68. the intake asks nothing about the recipient's age or gender" \
  "$(grep -v '^\s*\*' src/lib/concierge.ts | grep -Eqi '\b(age|gender|ethnicity)\b' && echo 0 || echo 1)"
tc "68b. no budget mode is preselected for the customer" \
  "$(grep -q 'budget: null,' src/lib/concierge.ts && echo 1 || echo 0)"
tc "68c. and an unanswered budget is refused rather than defaulted" \
  "$(grep -q 'if (enquiry.budget === null)' src/lib/concierge.ts && echo 1 || echo 0)"
tc "68d. there is no 'unanswered' budget mode in the stored vocabulary" \
  "$(q "SHOW COLUMNS FROM concierge_enquiries LIKE 'budget_mode'" | grep -qi "'UNANSWERED'\|'NONE'" && echo 0 || echo 1)"
tc "69. and stores no such column" \
  "$(q "SHOW COLUMNS FROM concierge_enquiries" | grep -Eqi '^(age|gender|recipient_age|recipient_gender)' && echo 0 || echo 1)"

echo ""
echo "================ 9. RATE LIMITING ================"
release_limit
tc "70. a burst of enquiries from one source is throttled" "$(
  LAST=200
  for i in 1 2 3 4 5 6 7 8; do
    LAST=$(post concierge/enquiry '{"name":"Burst","email":"fp-burst'"$i"'@example.com","budgetMode":"OPEN"}')
  done
  [ "$LAST" = "429" ] && echo 1 || echo 0)"
# Clear the consumed budget so nothing after this section is throttled.
q "DELETE FROM concierge_enquiries WHERE email LIKE 'fp-burst%'" >/dev/null

echo ""
echo "================ 10. THE CRM SURFACE ================"
release_limit
t "71. the concierge surface requires a key" 401 \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/concierge")"
CODE=$(curl -s -o /tmp/fp.json -w '%{http_code}' "$BASE/crm/concierge?reference=$REFA" -H "Authorization: Bearer $CRMKEY")
t "72. an authenticated read succeeds" 200 "$CODE"
tc "73.  → and returns the enquiry by its FP reference" \
  "$(body | grep -q "$REFA" && echo 1 || echo 0)"
tc "74.  → reporting the budget MODE alongside the figure" \
  "$(body | grep -q '"mode":"AMOUNT"' && echo 1 || echo 0)"
tc "75.  → in the declared currency, unconverted" \
  "$(body | grep -q '"currency":"USD"' && echo 1 || echo 0)"
tc "76.  → and never as an amount_gbp" \
  "$(body | grep -q 'amount_gbp' && echo 0 || echo 1)"
CODE=$(curl -s -o /tmp/fp.json -w '%{http_code}' "$BASE/crm/concierge?reference=$REFO" -H "Authorization: Bearer $CRMKEY")
tc "77. an OPEN budget reads as 'No fixed spending limit', not as zero" \
  "$(body | grep -q 'No fixed spending limit' && echo 1 || echo 0)"
tc "78.  → with a null amount rather than 0" \
  "$(body | grep -q '"amount":null' && echo 1 || echo 0)"
tc "79. the concierge response uses no payment vocabulary" \
  "$(body | grep -Eqi '"(paid|pending|amount_gbp|total|stripe_session)"' && echo 0 || echo 1)"
tc "80. enquiries do NOT appear on the orders surface" \
  "$(curl -s "$BASE/crm/orders" -H "Authorization: Bearer $CRMKEY" | grep -q 'FP-' && echo 0 || echo 1)"

echo ""
echo "================ 11. NOTHING WAS SWITCHED ON ================"
tc "81. the shipped config template still keeps checkout sessions OFF" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "82. the client checkout flag is still false" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"
tc "83. no Stripe secret in the built browser bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "84. the concierge endpoint contains no Stripe call of any kind" \
  "$(grep -v '^\s*\*' public/api/concierge/enquiry.php | grep -Eqi 'stripe|checkout|payment_intent|curl_' && echo 0 || echo 1)"
tc "85. and the client enquiry module contains none either" \
  "$(grep -v '^\s*\*' src/lib/concierge.ts | grep -Eqi 'stripe|checkout' && echo 0 || echo 1)"
tc "86. the migration is additive — it alters and drops nothing" \
  "$(grep -Eqi '^\s*(ALTER|DROP|DELETE|TRUNCATE)' db/migrations/2026-09-09-concierge-enquiries.sql && echo 0 || echo 1)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
