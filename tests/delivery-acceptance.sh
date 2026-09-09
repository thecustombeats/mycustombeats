#!/bin/bash
# MCB DELIVERY, SPECIAL OCCASIONS & PRODUCT SAFETY — acceptance tests.
#
# Runs against the same throwaway PHP + MariaDB containers as the other
# suites. See tests/README.md.
#
# WHAT THIS PROVES, IN ONE LINE: the site and the contract now say the same
# thing about delivery; fifteen working days is a recommendation everywhere or
# nowhere; and the new handling, misuse and liability clauses protect MCB
# against what customers do rather than against MCB's own breach.
#
# NOTHING HERE REACHES STRIPE OR RESEND. Both are local stubs.

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

NEW="2026-09-09.2"
OLD="2026-09-09"
CN='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"'"$NEW"'"'
CO='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"'"$OLD"'"'
post() { curl -s -o /tmp/dl.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
body() { cat /tmp/dl.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }
SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local sig=$(printf '%s.%s' "$ts" "$1" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
pay() { q "UPDATE orders SET stripe_session_id='cs_dl_$1' WHERE id=$1" >/dev/null
  W="{\"id\":\"evt_dl_$1\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_dl_$1\",\"client_reference_id\":\"$1\",\"payment_intent\":\"pi_dl_$1\",\"amount_total\":7900,\"currency\":\"gbp\"}}}"
  curl -s -o /dev/null -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$W")" -d "$W"; }
stub_reset() { docker exec mcb-api sh -c 'rm -f /tmp/resend-stub.log'; }
mail_log() { docker exec mcb-api sh -c 'cat /tmp/resend-stub.log 2>/dev/null'; }

# Customer-facing prose only. Every legal file explains WHY a phrase was
# removed, and those explanations necessarily quote the phrase.
prose() { grep -v -E '^\s*(\*|//|/\*|#|--)' "$@"; }

# The documents a customer actually reads.
DOCS="src/data/legal/terms.ts src/data/legal/refunds.ts src/data/legal/delivery.ts src/data/legal/consent.ts src/pages/legal/Terms.tsx src/pages/legal/Refund.tsx src/pages/FAQ.tsx src/data/packages.ts"

echo "================ 1. VERSIONING ================"
tc "1. the new terms version differs from the Sprint 8 version" \
  "$(grep -q "TERMS_VERSION = \"$NEW\"" src/data/legal/versions.ts && echo 1 || echo 0)"
tc "2. the Sprint 8 version remains identifiable as superseded" \
  "$(grep -A8 'export const SUPERSEDED_VERSIONS' src/data/legal/versions.ts | grep -q "version: \"$OLD\"" && echo 1 || echo 0)"
tc "3.  → with a summary of what changed" \
  "$(grep -q 'Orders accepted under this version remain governed by it' src/data/legal/versions.ts && echo 1 || echo 0)"
tc "4. both versions are known to the server" \
  "$(docker exec mcb-api sh -c 'cat /var/www/html/api/data/legal.json' | grep -q "\"$OLD\"" \
     && docker exec mcb-api sh -c 'cat /var/www/html/api/data/legal.json' | grep -q "\"$NEW\"" && echo 1 || echo 0)"
tc "5. the privacy version did NOT move, because privacy did not change" \
  "$(grep -q "PRIVACY_POLICY_VERSION = \"$OLD\"" src/data/legal/versions.ts && echo 1 || echo 0)"

t "6. a new order snapshots the new version" 201 \
  "$(post order '{'"$CN"',"firstName":"New","lastName":"N","email":"dl-new@example.com","package":"keepsake","format":"mp3","story":"x"}')"
OID_NEW=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "7.  → recorded exactly as accepted" \
  "$([ "$(q "SELECT terms_version FROM order_consents WHERE order_id=$OID_NEW")" = "$NEW" ] && echo 1 || echo 0)"
t "8. a stale page sending the superseded version is still accepted" 201 \
  "$(post order '{'"$CO"',"firstName":"Old","lastName":"O","email":"dl-old@example.com","package":"keepsake","format":"mp3","story":"x"}')"
OID_OLD=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "9.  → and records the version that customer actually saw" \
  "$([ "$(q "SELECT terms_version FROM order_consents WHERE order_id=$OID_OLD")" = "$OLD" ] && echo 1 || echo 0)"
tc "10. NO historical order is retroactively moved to the new version" \
  "$([ "$(q "SELECT terms_version FROM order_consents WHERE order_id=$OID_OLD")" = "$OLD" ] \
    && [ "$(q "SELECT COUNT(*) FROM order_consents WHERE terms_version='$OLD'")" -ge "1" ] && echo 1 || echo 0)"
t "11. a version MCB never published is still refused" 422 \
  "$(post order '{"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2027-01-01","firstName":"B","lastName":"B","email":"dl-bad@example.com","package":"keepsake","format":"mp3","story":"x"}')"

stub_reset
pay "$OID_NEW"; pay "$OID_OLD"
tc "12. each confirmation email names the version that customer accepted" \
  "$(mail_log | grep -q "governed by version <strong>$NEW</strong>" \
     && mail_log | grep -q "governed by version <strong>$OLD</strong>" && echo 1 || echo 0)"
tc "13.  → read from the order's own record, not from today's page" \
  "$(grep -q 'LEFT JOIN order_consents oc' public/api/lib/notify.php && echo 1 || echo 0)"

echo ""
echo "================ 2. THE 15-DAY CONTRADICTION IS GONE ================"
tc "14. no package card claims 'Delivered within 15 working days'" \
  "$(prose src/data/packages.ts | grep -q 'Delivered within 15 working days' && echo 0 || echo 1)"
tc "15. nor does the generated server data" \
  "$(grep -q 'Delivered within 15 working days' public/api/data/packages.json && echo 0 || echo 1)"
tc "16. nor the built browser bundle" \
  "$(grep -rq 'Delivered within 15 working days' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "17. nor the FAQ" \
  "$(prose src/pages/FAQ.tsx | grep -q 'delivered within 15 working days' && echo 0 || echo 1)"
tc "17b. and no surface anywhere still promises a 15-day delivery" \
  "$(prose $DOCS src/pages/Partners.tsx | grep -qiE 'deliver(ed|y) within 15 working days' && echo 0 || echo 1)"
tc "18. the three physical experiences share ONE wording, from one constant" \
  "$([ "$(grep -c 'delivery: PLANNING_RECOMMENDATION,' src/data/packages.ts)" = "3" ] && echo 1 || echo 0)"
tc "19.  → which says 'allow at least', not 'delivered within'" \
  "$(grep -q 'PLANNING_RECOMMENDATION =' src/data/legal/delivery.ts \
     && grep -q 'Allow at least 15 working days for personalised production and delivery' src/data/legal/delivery.ts && echo 1 || echo 0)"
tc "20. and the generated data carries the same wording" \
  "$(grep -q 'Allow at least 15 working days' public/api/data/packages.json && echo 1 || echo 0)"
tc "20b. the timing line is ON the card, not behind the 'view full experience' expander" \
  "$(grep -q '{pkg.delivery}' src/sections/PackagesSection.tsx && echo 1 || echo 0)"
tc "20c.  → and it reaches the built bundle" \
  "$(grep -rq 'Allow at least 15 working days' dist/assets/ 2>/dev/null && echo 1 || echo 0)"
tc "21. the recommendation is a named constant, not a scattered number" \
  "$(grep -q 'RECOMMENDED_PLANNING_DAYS = 15' src/data/legal/delivery.ts && echo 1 || echo 0)"
tc "22. the Terms call it a recommendation and not a promise" \
  "$(grep -q 'That is a planning recommendation, not a delivery promise' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "23. Moment's one-hour digital turnaround is untouched" \
  "$(grep -q 'delivery: "Delivered within 1 hour"' src/data/packages.ts && echo 1 || echo 0)"
tc "24.  → and is modelled as a different KIND of timing" \
  "$(grep -q 'deliveryBasis: "DIGITAL_TURNAROUND"' src/data/packages.ts && echo 1 || echo 0)"
tc "25. the three physical experiences are MADE_TO_ORDER" \
  "$([ "$(grep -c 'deliveryBasis: "MADE_TO_ORDER"' src/data/packages.ts)" = "3" ] && echo 1 || echo 0)"
tc "26. the Full Package's timing stays proposal-specific" \
  "$(grep -q 'deliveryBasis: "AGREED_IN_PROPOSAL"' src/data/packages.ts && echo 1 || echo 0)"
tc "27. the five delivery stages are distinguished, not treated as synonyms" \
  "$([ "$(grep -c 'stage: "' src/data/legal/delivery.ts)" = "5" ] && echo 1 || echo 0)"
tc "28.  → naming which stages MCB actually controls" \
  "$(grep -q 'withinMcbControl: false' src/data/legal/delivery.ts && echo 1 || echo 0)"
tc "29. the partner-facing summary agrees too" \
  "$(prose src/pages/Partners.tsx | grep -q '"From one hour to fifteen working days"' && echo 0 || echo 1)"

echo ""
echo "================ 3. ESTIMATES, AGREED DATES, OCCASIONS ================"
tc "30. the Terms state that displayed times are estimates" \
  "$(grep -q 'The times we show are ESTIMATES' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "31. an expressly agreed written date takes precedence" \
  "$(grep -q 'that agreed date applies and takes precedence over any general estimate' src/data/legal/delivery.ts && echo 1 || echo 0)"
tc "32.  → and that exception is IN the delivery clause, not buried" \
  "$(grep -q 'AGREED_DATE_EXCEPTION' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "33. an estimate is explicitly NOT a disclaimer for MCB's own delay" \
  "$(grep -q 'An estimate is not a disclaimer' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "34. special occasions are named, cruises included" \
  "$(grep -q 'a cruise or a holiday' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "35. travel-linked orders get their own warning" \
  "$(grep -q 'TRAVEL_NOTICE' src/data/legal/terms.ts && grep -q 'a ship or a hotel you are about to leave' src/data/legal/delivery.ts && echo 1 || echo 0)"
tc "36. customers are told not to build non-refundable plans on an estimate" \
  "$(grep -q 'Please do not make non-refundable travel, accommodation or event arrangements' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "37.  → without that becoming a waiver of MCB's own breach" \
  "$(grep -q 'none of it affects your rights if we fail to do something we agreed to do' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "38. the FAQ answers the 'I need it by a date' question truthfully" \
  "$(grep -q 'If we agree a date in writing, that agreed date applies' src/pages/FAQ.tsx && echo 1 || echo 0)"

echo ""
echo "================ 4. CUSTOMER DETAILS & INTERNATIONAL ================"
tc "39. customer-supplied delivery details are covered" \
  "$(grep -q 'id: "your-delivery-details"' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "40.  → reshipping charges are qualified and quoted first" \
  "$(grep -q 'We will tell you what it is before doing anything' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "41.  → and do not apply where the problem was MCB's" \
  "$(grep -q 'This does not apply where the problem was ours' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "42. no new address-validation vendor was introduced" \
  "$(grep -rqiE 'loqate|addressy|getaddress|smartystreets|postcodeanywhere' src public/api 2>/dev/null && echo 0 || echo 1)"
tc "43. checkout already collects the full address" \
  "$(grep -q 'shippingPostcode' src/sections/OrderFormSection.tsx && grep -q 'shippingCountry' src/sections/OrderFormSection.tsx && echo 1 || echo 0)"
tc "44. international delivery, customs and border processing are covered" \
  "$(grep -q 'id: "international-delivery"' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "45. duties and taxes are qualified, not stated absolutely" \
  "$(grep -q 'unless we have expressly stated otherwise at checkout, or the law of the destination requires otherwise' src/data/legal/terms.ts && echo 1 || echo 0)"

echo ""
echo "================ 5. THIRD PARTIES ARE NOT A SHIELD ================"
tc "46. events outside reasonable control are listed" \
  "$(grep -q 'courier delays, customs or border processing, import inspections' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "47. the customer's contract remains with MCB throughout" \
  "$(grep -q 'we will not point you at a supplier you never dealt with' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "48. subcontracting is expressly NOT immunity" \
  "$(grep -q 'Using a subcontractor is not a way for us to stop being responsible' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "49.  → the test is the EVENT, not who was involved" \
  "$(grep -q 'The fact that another company was involved does not by itself make something outside our control' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "50. no clause says MCB stops being responsible once a third party has it" \
  "$(prose $DOCS | grep -qiE 'MCB is not responsible once|no responsibility once the (supplier|carrier)' && echo 0 || echo 1)"

echo ""
echo "================ 6. HANDLING, DAMAGE, MISUSE ================"
tc "51. safe handling of physical items is covered" \
  "$(grep -q 'id: "handling-physical-products"' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "52.  → generally and proportionately, not calling products hazardous" \
  "$(grep -q 'It is not a suggestion that anything we sell is dangerous' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "53.  → children, vulnerable people and animals are qualified by 'where appropriate'" \
  "$(grep -q 'Where appropriate for the item, please keep it away from young children' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "54.  → and no age rating is invented" \
  "$(prose $DOCS | grep -qiE 'age [0-9]+\+|not suitable for children under|3\+|18\+' && echo 0 || echo 1)"
tc "55. damaged products: stop using it, then tell us" \
  "$(grep -q 'id: "damaged-products"' src/data/legal/terms.ts \
     && grep -q 'please stop using it' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "56.  → photographs are requested, not required as a condition" \
  "$(grep -q 'please send a photograph if you are able to' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "57.  → and NO deadline extinguishes statutory rights" \
  "$(grep -q 'There is no deadline on this' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "58. the removed 48-hour cutoff is NOT reintroduced" \
  "$(prose $DOCS | grep -qiE 'within 48 hours|48-hour' && echo 0 || echo 1)"
tc "59. misuse is covered" "$(grep -q 'id: "misuse"' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "60.  → and requires the loss to be CAUSED by the misuse" \
  "$(grep -q 'genuinely caused by an item being misused rather than by anything wrong with the item' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "61.  → it says nothing about a faulty or unsafe item" \
  "$(grep -q 'it has nothing to say about an item that was faulty, unsafe or not what you ordered' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "62. no blanket 'MCB accepts no responsibility for injury'" \
  "$(prose $DOCS | grep -qiE 'no responsibility for (any )?injury|not (be )?liable for (any )?injury' && echo 0 || echo 1)"
tc "63. death and personal injury remain non-excludable, in the misuse clause itself" \
  "$(grep -q 'Nothing in this clause limits our responsibility for death or personal injury caused by our negligence, for defective products' src/data/legal/terms.ts && echo 1 || echo 0)"

echo ""
echo "================ 7. LIABILITY ================"
tc "64. liability is tied to CAUSATION, not to a catch-all phrase" \
  "$(grep -q 'What we are not responsible for is loss that we did not cause' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "65. 'to the fullest extent permitted' is not used as the safeguard" \
  "$(prose $DOCS | grep -qi 'to the fullest extent permitted' && echo 0 || echo 1)"
tc "66. generic 'indirect or consequential loss' wording is not used" \
  "$(prose $DOCS | grep -qi 'indirect or consequential' && echo 0 || echo 1)"
tc "67. the exclusions name the four causes they actually cover" \
  "$(grep -q 'outside our reasonable control that was not our doing' src/data/legal/terms.ts \
     && grep -q 'caused by an item being misused or mishandled' src/data/legal/terms.ts \
     && grep -q 'caused by delivery details that were given to us incorrectly' src/data/legal/terms.ts \
     && grep -q 'was not a foreseeable consequence' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "68. the Sprint 8 non-excludable list survives, and gains defective products" \
  "$(grep -q 'There are things the law does not allow anyone to exclude, and we do not attempt to' src/data/legal/terms.ts \
     && grep -q 'for defective products, and for your statutory rights' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "69. the old blanket cap at 'the amount paid' has not returned" \
  "$(prose $DOCS | grep -qi 'liability is limited to the amount paid' && echo 0 || echo 1)"
tc "70. no 'no refunds under any circumstances' has crept back" \
  "$(prose $DOCS | grep -qi 'no refunds under any circumstances' && echo 0 || echo 1)"
tc "71. faulty goods rights still expressly preserved" \
  "$(grep -q 'Consumer Rights Act 2015' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "72. not-as-described rights still expressly preserved" \
  "$(grep -q 'not as described' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "73. mandatory overseas consumer rights still preserved" \
  "$(grep -q 'nothing here takes away rights that the law of your own country gives you' src/data/legal/terms.ts && echo 1 || echo 0)"

echo ""
echo "================ 8. ACCEPTANCE — ONE ARCHITECTURE ================"
tc "74. an acceptance clause exists in the Terms" \
  "$(grep -q 'id: "acceptance"' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "75.  → naming what accepting now includes" \
  "$(grep -q 'that delivery times are estimates unless we agree a date in writing' src/data/legal/terms.ts && echo 1 || echo 0)"
tc "76. NO second consent checkbox was added — still exactly three" \
  "$([ "$(grep -c '^    id: "' src/data/legal/consent.ts)" = "3" ] && echo 1 || echo 0)"
tc "77. the terms consent now names the delivery and handling provisions" \
  "$(grep -q 'that delivery times are estimates unless we agree a date in writing, how to look after a physical item' src/data/legal/consent.ts && echo 1 || echo 0)"
tc "78. nothing is pre-ticked" \
  "$(grep -A4 'INITIAL_CONSENT_STATE' src/data/legal/consent.ts | grep -q 'true' && echo 0 || echo 1)"
t "79. consent is still required server-side" 422 \
  "$(post order '{"firstName":"N","lastName":"C","email":"dl-nc@example.com","package":"moment","format":"mp3","story":"x"}')"

echo ""
echo "================ 9. THE REVIEW REGISTER ================"
tc "80. the solicitor-review blocker remains" \
  "$(grep -q 'LEGAL REVIEW REQUIRED BEFORE FINAL PRODUCTION RELEASE' src/data/legal/review.ts && echo 1 || echo 0)"
tc "81. delivery obligations and agreed dates are registered" \
  "$(grep -q 'Delivery estimates and expressly agreed dates' src/data/legal/review.ts && echo 1 || echo 0)"
tc "82. special-occasion loss wording is registered" \
  "$(grep -q 'Special-occasion and non-refundable arrangement wording' src/data/legal/review.ts && echo 1 || echo 0)"
tc "83. events outside reasonable control are registered" \
  "$(grep -q 'Events outside reasonable control' src/data/legal/review.ts && echo 1 || echo 0)"
tc "84. international duties and taxes are registered" \
  "$(grep -q 'International duties and taxes' src/data/legal/review.ts && echo 1 || echo 0)"
tc "85. product handling and personal injury are registered" \
  "$(grep -q 'Product handling, misuse and personal injury' src/data/legal/review.ts && echo 1 || echo 0)"
tc "86. the consequential-loss decision is registered with its reasoning" \
  "$(grep -q "consequential loss' replaced" src/data/legal/review.ts && echo 1 || echo 0)"
tc "87. carrier and fulfilment allocation is registered" \
  "$(grep -q 'Allocation of fulfilment and carrier responsibility' src/data/legal/review.ts && echo 1 || echo 0)"
tc "88. the UK GDPR blocker is carried forward, not closed" \
  "$(grep -A8 'topic: "Privacy policy"' src/data/legal/review.ts | grep -q 'BLOCKING' && echo 1 || echo 0)"
tc "89. the register is still not imported by any page" \
  "$(grep -rqE 'from ["'"'"'].*legal/review' src/pages src/sections src/components 2>/dev/null && echo 0 || echo 1)"
tc "90.  → nor re-exported from the legal barrel" \
  "$(grep -qE '^export \* from "\./review"' src/data/legal/index.ts && echo 0 || echo 1)"
tc "91.  → so it never reaches the built bundle" \
  "$(grep -rq 'LEGAL REVIEW REQUIRED' dist/assets/ 2>/dev/null && echo 0 || echo 1)"

echo ""
echo "================ 10. NOTHING ELSE MOVED ================"
tc "92. package prices unchanged" \
  "$(for p in 'gbp: 10' 'gbp: 79' 'gbp: 199' 'gbp: 349'; do grep -q "$p," src/data/packages.ts || exit 1; done && echo 1 || echo 0)"
tc "93. enhancement price unchanged" \
  "$(grep -q 'unitPrice: gbp(60)' src/data/catalogue/enhancements.ts && echo 1 || echo 0)"
tc "94. all nine Payment Link URLs unchanged" \
  "$([ "$(cat src/data/packages.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"
tc "95. dynamic checkout stays OFF in the shipped config" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "96. the client checkout flag stays false" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"
tc "97. the Full Package still cannot be ordered" \
  "$(post order '{'"$CN"',"firstName":"F","lastName":"P","email":"dl-fp@example.com","package":"bespoke","format":"","story":"x"}' | grep -q '^422$' && echo 1 || echo 0)"
tc "98. the production lock is unchanged" \
  "$(grep -q "'CREATIVE','AWAITING_APPROVAL','APPROVED'" db/schema.sql && echo 1 || echo 0)"
tc "99. the referral system is unchanged" \
  "$(grep -q 'REFERRAL_PARAM = "r"' src/data/referral.ts && grep -q 'MCB-R-' public/api/lib/referral.php && echo 1 || echo 0)"
tc "100. the affiliate system is unchanged" \
  "$(grep -q 'affiliates SET sales = sales + 1' public/api/stripe/webhook.php && echo 1 || echo 0)"
tc "101. no Stripe secret in the built bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "102. the legal modules make no Stripe call" \
  "$(prose src/data/legal/*.ts | grep -qi 'stripe' && echo 0 || echo 1)"
tc "103. the review URL is still configuration and still empty" \
  "$(grep -A3 "'reviews'" public/api/config.example.php | grep -q "'url' => ''" && echo 1 || echo 0)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
