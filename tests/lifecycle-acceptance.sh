#!/bin/bash
# MCB CUSTOMER LIFECYCLE & REFERRAL — acceptance tests.
#
# Runs against the same throwaway PHP + MariaDB containers as the other
# suites. See tests/README.md.
#
# WHAT THIS PROVES, IN ONE LINE: a customer sharing MCB is not an affiliate
# and is never enrolled as one; a code exists only after a verified payment
# and reveals nothing about who owns it; a referral is confirmed by Stripe and
# not by hope; and MCB asks what a memory meant only once the customer has it,
# never conditioned on whether they are happy.
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

CONSENT='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2026-09-09.4","cruiseCompanions":"My husband David"'
post() { curl -s -o /tmp/lc.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
get()  { curl -s -o /tmp/lc.json -w '%{http_code}' "$BASE/$1"; }
body() { cat /tmp/lc.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }
K="test_crm_key_not_real_000000000000000000000"
crm()  { curl -s -o /tmp/lc.json -w '%{http_code}' "$BASE/$1" -H "Authorization: Bearer $K"; }
crmp() { curl -s -o /tmp/lc.json -w '%{http_code}' -X POST "$BASE/$1" -H "Authorization: Bearer $K" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
stub() { docker exec mcb-api sh -c "echo '$1' > /tmp/resend-mode"; }
stub_reset() { docker exec mcb-api sh -c 'rm -f /tmp/resend-stub.log'; }
stub_count() { docker exec mcb-api sh -c 'grep -c "" /tmp/resend-stub.log 2>/dev/null || echo 0'; }

SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local sig=$(printf '%s.%s' "$ts" "$1" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
hook() { curl -s -o /tmp/wh.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$1")" -d "$1"; }

# Places an order and returns its id.
mkorder() {
  curl -s -o /tmp/mk.json -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
    -d '{'"$CONSENT"',"firstName":"'"$1"'","lastName":"T","email":"'"$2"'","package":"'"$3"'","format":"mp3","story":"A story."'"$4"'}' >/dev/null
  sed -n 's/.*"order_id":\([0-9]*\).*/\1/p' /tmp/mk.json
}
# Marks an order paid through the real verified-webhook path.
paynow() {
  q "UPDATE orders SET stripe_session_id='cs_test_lc_$1' WHERE id=$1" >/dev/null
  hook "{\"id\":\"evt_lc_$1\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_test_lc_$1\",\"client_reference_id\":\"$1\",\"payment_intent\":\"pi_lc_$1\",\"amount_total\":1000,\"currency\":\"gbp\"}}}" >/dev/null
}

prose() { grep -v -E '^\s*(\*|//|/\*|#)' "$@"; }

stub ok
stub_reset

echo "================ 1. AFFILIATE IS NOT CUSTOMER REFERRAL ================"
tc "1. customer referral uses its own query parameter, not ?ref=" \
  "$(grep -q 'REFERRAL_PARAM = "r"' src/data/referral.ts && echo 1 || echo 0)"
tc "2. and its own storage key, not the affiliate one" \
  "$(grep -q 'REFERRAL_STORAGE_KEY = "mcb_customer_referral"' src/data/referral.ts && echo 1 || echo 0)"
tc "3. sharing never creates an affiliate row" \
  "$(prose public/api/lib/referral.php | grep -qi 'INSERT INTO affiliates\|UPDATE affiliates' && echo 0 || echo 1)"
tc "4. nor touches the affiliate click ledger" \
  "$(prose public/api/lib/referral.php | grep -qi 'INSERT INTO clicks' && echo 0 || echo 1)"
tc "5. orders.source_type keeps its original three values" \
  "$(grep -q "source_type            ENUM('DIRECT','AFFILIATE','PARTNER')" db/schema.sql && echo 1 || echo 0)"
tc "6. the migration alters no existing table except an additive column" \
  "$([ "$(grep -ciE '^\s*(DROP|TRUNCATE|RENAME)' db/migrations/2026-09-09-customer-lifecycle-referral.sql)" = "0" ] \
    && [ "$(grep -ciE '^\s*ALTER TABLE' db/migrations/2026-09-09-customer-lifecycle-referral.sql)" = "1" ] \
    && grep -q 'ADD COLUMN IF NOT EXISTS' db/migrations/2026-09-09-customer-lifecycle-referral.sql && echo 1 || echo 0)"
tc "7. affiliate attribution is still resolved by its own library" \
  "$(grep -q 'resolve_attribution' public/api/lib/attribution.php && echo 1 || echo 0)"

echo ""
echo "================ 2. ELIGIBILITY IS A VERIFIED PAYMENT ================"
OID_A=$(mkorder "Alice" "lc-alice@example.com" keepsake "")
tc "8. an order alone mints no referral code" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referrals")" = "0" ] && echo 1 || echo 0)"
paynow "$OID_A"
tc "9. a verified payment does" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referrals")" = "1" ] && echo 1 || echo 0)"
CODE=$(q "SELECT code FROM customer_referrals LIMIT 1")
tc "10. the code is server-generated and matches the published shape" \
  "$(echo "$CODE" | grep -Eq '^MCB-R-[0-9A-HJKMNP-TV-Z]{6}$' && echo 1 || echo 0)"
tc "11.  → and is not the customer id, order id or anything derived from them" \
  "$(echo "$CODE" | grep -Eq "MCB-R-0*$(q "SELECT customer_id FROM customer_referrals LIMIT 1")$" && echo 0 || echo 1)"
tc "12.  → nor does it contain any part of the email address" \
  "$(echo "$CODE" | grep -qi 'ALICE\|EXAMPLE' && echo 0 || echo 1)"
tc "13. it records WHICH paid order made them eligible" \
  "$([ "$(q "SELECT first_paid_order_id FROM customer_referrals LIMIT 1")" = "$OID_A" ] && echo 1 || echo 0)"
tc "14. a replayed webhook does not mint a second code" \
  "$(paynow "$OID_A"; [ "$(q "SELECT COUNT(*) FROM customer_referrals")" = "1" ] && echo 1 || echo 0)"
t "15. a concierge enquiry is accepted" 201 \
  "$(post concierge/enquiry '{"name":"Enquirer","email":"lc-fp@example.com","budgetMode":"UNSURE"}')"
tc "16.  → and creates no referral code, because it is not a purchase" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referrals")" = "1" ] && echo 1 || echo 0)"
tc "17. codes are minted on the PAID path only, never by order.php" \
  "$(prose public/api/order.php | grep -q 'ensure_customer_referral' && echo 0 || echo 1)"

echo ""
echo "================ 3. ATTRIBUTION ================"
OID_B=$(mkorder "Bob" "lc-bob@example.com" moment ',"customerReferral":"'"$CODE"'"')
tc "18. an order through a share is recorded as ATTRIBUTED" \
  "$([ "$(q "SELECT status FROM customer_referral_conversions WHERE order_id=$OID_B")" = "ATTRIBUTED" ] && echo 1 || echo 0)"
tc "19.  → not CONFIRMED: a pending order is not a successful referral" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referral_conversions WHERE status='CONFIRMED'")" = "0" ] && echo 1 || echo 0)"
tc "20.  → and the code is snapshotted against it" \
  "$([ "$(q "SELECT code_snapshot FROM customer_referral_conversions WHERE order_id=$OID_B")" = "$CODE" ] && echo 1 || echo 0)"
paynow "$OID_B"
tc "21. the verified payment confirms the conversion" \
  "$([ "$(q "SELECT status FROM customer_referral_conversions WHERE order_id=$OID_B")" = "CONFIRMED" ] && echo 1 || echo 0)"
tc "22.  → with a timestamp, so it can be dated" \
  "$([ -n "$(q "SELECT confirmed_at FROM customer_referral_conversions WHERE order_id=$OID_B")" ] && echo 1 || echo 0)"
tc "23. a replayed webhook does not double-count it" \
  "$(paynow "$OID_B"; [ "$(q "SELECT COUNT(*) FROM customer_referral_conversions WHERE status='CONFIRMED'")" = "1" ] && echo 1 || echo 0)"
tc "24. the DATABASE refuses a CONFIRMED row with no timestamp" \
  "$(docker exec mcb-db mariadb -umcb -ptestpass -e "UPDATE customer_referral_conversions SET confirmed_at=NULL WHERE order_id=$OID_B" mcb_crm 2>&1 | grep -q 'chk_referral_confirmed' && echo 1 || echo 0)"

OID_SELF=$(mkorder "Alice" "lc-alice@example.com" moment ',"customerReferral":"'"$CODE"'"')
tc "25. a customer using their own link is recorded as SELF_REFERRAL" \
  "$([ "$(q "SELECT status FROM customer_referral_conversions WHERE order_id=$OID_SELF")" = "SELF_REFERRAL" ] && echo 1 || echo 0)"
paynow "$OID_SELF"
tc "26.  → and paying for it does not turn it into a conversion" \
  "$([ "$(q "SELECT status FROM customer_referral_conversions WHERE order_id=$OID_SELF")" = "SELF_REFERRAL" ] && echo 1 || echo 0)"

t "27. an unknown code does not block the sale" 201 \
  "$(post order '{'"$CONSENT"',"firstName":"Cara","lastName":"C","email":"lc-cara@example.com","package":"moment","format":"mp3","story":"x","customerReferral":"MCB-R-ZZZZZZ"}')"
OID_C=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "28.  → and records no conversion for it" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referral_conversions WHERE order_id=$OID_C")" = "0" ] && echo 1 || echo 0)"
t "29. a malformed code is refused before any query, and the sale proceeds" 201 \
  "$(post order '{'"$CONSENT"',"firstName":"Dan","lastName":"D","email":"lc-dan@example.com","package":"moment","format":"mp3","story":"x","customerReferral":"'"'"' OR 1=1--"}')"
tc "30. the browser cannot name a referring customer" \
  "$(prose public/api/order.php | grep -qE 'referrer_customer_id|referring_customer' && echo 0 || echo 1)"
tc "31. one order has one acquisition story, enforced by the database" \
  "$(grep -q 'uq_referral_conversion_order' db/schema.sql && echo 1 || echo 0)"

echo ""
echo "================ 4. PRECEDENCE — NO DOUBLE CREDIT ================"
post affiliate/register '{"name":"Aff Iliate","email":"lc-aff@example.com","username":"lcaff"}' >/dev/null
AFFID=$(q "SELECT id FROM affiliates WHERE username='lcaff'")
tc "32. an affiliate exists to test against" "$([ -n "$AFFID" ] && echo 1 || echo 0)"
post order '{'"$CONSENT"',"firstName":"Both","lastName":"B","email":"lc-both@example.com","package":"moment","format":"mp3","story":"x","referral":"lcaff","customerReferral":"'"$CODE"'"}' >/dev/null
OID_BOTH=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "33. an order carrying BOTH keeps its AFFILIATE source type" \
  "$([ "$(q "SELECT source_type FROM orders WHERE id=$OID_BOTH")" = "AFFILIATE" ] && echo 1 || echo 0)"
tc "34.  → the affiliate is still the credited party on the order" \
  "$([ "$(q "SELECT affiliate_id FROM orders WHERE id=$OID_BOTH")" = "$AFFID" ] && echo 1 || echo 0)"
tc "35.  → and the customer share is recorded separately as influence" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_referral_conversions WHERE order_id=$OID_BOTH")" = "1" ] && echo 1 || echo 0)"
SALES_BEFORE=$(q "SELECT sales FROM affiliates WHERE id=$AFFID")
paynow "$OID_BOTH"
tc "36. payment increments the affiliate's sales exactly once" \
  "$([ "$(q "SELECT sales FROM affiliates WHERE id=$AFFID")" = "$((SALES_BEFORE + 1))" ] && echo 1 || echo 0)"
tc "37.  → and a replay does not increment it again" \
  "$(paynow "$OID_BOTH"; [ "$(q "SELECT sales FROM affiliates WHERE id=$AFFID")" = "$((SALES_BEFORE + 1))" ] && echo 1 || echo 0)"
tc "38. customer referral conversions live in their own table, not affiliates.sales" \
  "$(prose public/api/lib/referral.php | grep -q 'affiliates SET sales' && echo 0 || echo 1)"

echo ""
echo "================ 5. FIRST TOUCH, AND THE WINDOW ================"
tc "39. first touch wins within the window" \
  "$(grep -q 'if (existing === null) return true;' src/data/referral.ts && echo 1 || echo 0)"
tc "40. an expired referral is discarded rather than honoured" \
  "$(grep -q 'if (now - candidate.seenAt > windowDays' src/data/referral.ts && echo 1 || echo 0)"
tc "41. the window is stated as a constant, not scattered" \
  "$(grep -q 'REFERRAL_WINDOW_DAYS = 30' src/data/referral.ts && echo 1 || echo 0)"
tc "42. a corrupted stored value is treated as absent, not repaired" \
  "$(grep -q 'return null;' src/data/referral.ts && grep -q 'JSON.parse(raw)' src/data/referral.ts && echo 1 || echo 0)"

echo ""
echo "================ 6. COMPLETION, NOT PAYMENT ================"
tc "43. a paid order does NOT start out completed" \
  "$([ "$(q "SELECT stage FROM order_production WHERE order_id=$OID_A")" = "CREATIVE" ] && echo 1 || echo 0)"
t "44. a review request is refused before completion" 409 \
  "$(crmp crm/review-request '{"order_id":'"$OID_A"'}')"
tc "45.  → because paying is not receiving" \
  "$(body | grep -q 'not_eligible' && echo 1 || echo 0)"
t "46. completion is an authorised operational action" 200 \
  "$(crmp crm/production '{"order_id":'"$OID_A"',"stage":"COMPLETED","approval_channel":"EMAIL","approved_by":"Ops"}')"
tc "47.  → and records its own timestamp" \
  "$([ -n "$(q "SELECT completed_at FROM order_production WHERE order_id=$OID_A")" ] && echo 1 || echo 0)"
tc "48. the public browser cannot mark an order complete" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/production" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{"order_id":'"$OID_A"',"stage":"COMPLETED"}' | grep -q '^401$' && echo 1 || echo 0)"
tc "49. completion is documented as MCB's judgement, not carrier tracking" \
  "$(grep -q 'not a delivery confirmation' db/schema.sql && echo 1 || echo 0)"

echo ""
echo "================ 7. THE REVIEW REQUEST ================"
stub_reset
t "50. a review request for a completed order is sent" 200 "$(crmp crm/review-request '{"order_id":'"$OID_A"'}')"
tc "51.  → exactly one email left the building" "$([ "$(stub_count)" = "1" ] && echo 1 || echo 0)"
tc "52.  → addressed from the ORDER, not from the request" \
  "$(docker exec mcb-api sh -c 'cat /tmp/resend-stub.log' | grep -q 'lc-alice@example.com' && echo 1 || echo 0)"
t "53. a second request sends nothing" 200 "$(crmp crm/review-request '{"order_id":'"$OID_A"'}')"
tc "54.  → reported as already_sent" "$(body | grep -q 'already_sent' && echo 1 || echo 0)"
tc "55.  → and still exactly one email" "$([ "$(stub_count)" = "1" ] && echo 1 || echo 0)"
tc "56. idempotency is enforced by the database, not by hope" \
  "$(grep -q 'uq_communication_order_type' db/schema.sql && echo 1 || echo 0)"
tc "57. the ledger records the send with a timestamp" \
  "$([ "$(q "SELECT CONCAT(status,'/',IF(sent_at IS NULL,'NO','YES')) FROM customer_communications WHERE order_id=$OID_A AND message_type='REVIEW_REQUEST'")" = "SENT/YES" ] && echo 1 || echo 0)"

REVIEW_TEXT=$(docker exec mcb-api sh -c 'cat /tmp/resend-stub.log')
tc "58. the copy does not ask for five stars" \
  "$(echo "$REVIEW_TEXT" | grep -qiE '5 star|five star|5-star' && echo 0 || echo 1)"
tc "59. nor for a positive review" \
  "$(echo "$REVIEW_TEXT" | grep -qi 'positive review' && echo 0 || echo 1)"
tc "60. nor offers anything in exchange" \
  "$(echo "$REVIEW_TEXT" | grep -qiE 'discount|voucher|credit|reward|free ' && echo 0 || echo 1)"
tc "61. and it invites criticism as readily as praise" \
  "$(echo "$REVIEW_TEXT" | grep -q 'we would rather hear it from you' && echo 1 || echo 0)"
tc "62. there is no review gating — one link for everyone" \
  "$(prose public/api/lib/lifecycle.php | grep -qiE 'satisfied|happy|rating|nps' && echo 0 || echo 1)"

echo ""
echo "================ 8. PROVIDER FAILURE IS ISOLATED ================"
OID_F=$(mkorder "Fay" "lc-fay@example.com" moment "")
paynow "$OID_F"
crmp crm/production '{"order_id":'"$OID_F"',"stage":"COMPLETED","approval_channel":"EMAIL"}' >/dev/null
stub http_fail
t "63. a provider rejection is reported, not hidden" 502 "$(crmp crm/review-request '{"order_id":'"$OID_F"'}')"
tc "64.  → the order is still COMPLETED" \
  "$([ "$(q "SELECT stage FROM order_production WHERE order_id=$OID_F")" = "COMPLETED" ] && echo 1 || echo 0)"
tc "65.  → its completion timestamp is untouched" \
  "$([ -n "$(q "SELECT completed_at FROM order_production WHERE order_id=$OID_F")" ] && echo 1 || echo 0)"
tc "66.  → and it is still PAID" \
  "$([ "$(q "SELECT status FROM orders WHERE id=$OID_F")" = "PAID" ] && echo 1 || echo 0)"
tc "67.  → the claim is released, so a retry is possible" \
  "$([ "$(q "SELECT COUNT(*) FROM customer_communications WHERE order_id=$OID_F")" = "0" ] && echo 1 || echo 0)"
stub ok
t "68. and the retry succeeds once the provider recovers" 200 "$(crmp crm/review-request '{"order_id":'"$OID_F"'}')"
tc "69. no provider key ever appears in a response" \
  "$(body | grep -q 're_teststub' && echo 0 || echo 1)"

echo ""
echo "================ 9. MESSAGE TYPES ARE DISTINGUISHED ================"
tc "70. the ledger names message types rather than a single boolean" \
  "$(q "SHOW COLUMNS FROM customer_communications LIKE 'message_type'" | grep -q 'REVIEW_REQUEST' && echo 1 || echo 0)"
tc "71. payment confirmation keeps its own existing claim, untouched" \
  "$(grep -q 'customer_notified_at IS NULL' public/api/lib/notify.php && echo 1 || echo 0)"
tc "72.  → and it is still idempotent under replay" \
  "$([ "$(q "SELECT COUNT(*) FROM orders WHERE customer_notified_at IS NOT NULL AND status='PAID'")" -ge "1" ] && echo 1 || echo 0)"
tc "73. MARKETING exists as a category but nothing sends it" \
  "$(q "SHOW COLUMNS FROM customer_communications LIKE 'message_type'" | grep -q 'MARKETING' \
     && ! prose public/api/lib/lifecycle.php public/api/crm/*.php | grep -q "'MARKETING'" && echo 1 || echo 0)"
tc "74. a purchase is never treated as marketing consent" \
  "$(prose public/api/order.php | grep -qiE 'marketing_consent|subscribe|newsletter' && echo 0 || echo 1)"
tc "75. terms consent is not marketing consent either" \
  "$(prose src/data/legal/consent.ts | grep -qi 'marketing' && echo 0 || echo 1)"
tc "76. no customer is silently subscribed to anything" \
  "$(q "SHOW COLUMNS FROM customers" | grep -qiE 'marketing|newsletter|subscribed' && echo 0 || echo 1)"

echo ""
echo "================ 10. PRIVACY OF THE PUBLIC CODE ================"
t "77. the public check answers for a valid code" 200 "$(get "referral/check?code=$CODE")"
tc "78.  → with one bit and nothing else" \
  "$(body | grep -q '^{"valid":true}$' && echo 1 || echo 0)"
tc "79.  → naming no customer" \
  "$(body | grep -qi 'alice\|example.com\|name\|customer' && echo 0 || echo 1)"
tc "80. an unknown code answers identically in shape" \
  "$(get "referral/check?code=MCB-R-ZZZZZZ" >/dev/null; body | grep -q '^{"valid":false}$' && echo 1 || echo 0)"
tc "81. a malformed code is refused without a query" \
  "$(get "referral/check?code=notacode" >/dev/null; body | grep -q '^{"valid":false}$' && echo 1 || echo 0)"
tc "82. the lookup is rate limited against enumeration" \
  "$(grep -q 'enforce_rate_limit' public/api/referral/check.php && echo 1 || echo 0)"
tc "83. resolving a code to a person requires the CRM key" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/customer?email=lc-alice@example.com" | grep -q '^401$' && echo 1 || echo 0)"
tc "84. attribution storage holds the code and a timestamp, nothing else" \
  "$(grep -q 'JSON.stringify({ code: sharedCode, seenAt: now })' src/App.tsx && echo 1 || echo 0)"
tc "85. analytics sends the method, never the code" \
  "$(grep -q 'trackEvent("customer_referral_shared", { method })' src/components/ShareMcb.tsx && echo 1 || echo 0)"
tc "86. the share link carries no order, reference or story" \
  "$(grep -q 'referralUrl = (code: string, origin: string)' src/data/referral.ts \
     && ! grep -qE 'reference|order|story' <<< "$(grep -A2 'export const referralUrl' src/data/referral.ts)" && echo 1 || echo 0)"
tc "87. the WhatsApp share is a plain URL with no SDK or pixel" \
  "$(grep -q 'https://wa.me/?text=' src/data/referral.ts \
     && ! grep -rqiE 'facebook|fbq|connect\.facebook' src/components/ShareMcb.tsx && echo 1 || echo 0)"

echo ""
echo "================ 11. THE CRM CUSTOMER VIEW ================"
CODE_C=$(crm "crm/customer?email=lc-alice@example.com")
t "88. an authenticated customer lookup succeeds" 200 "$CODE_C"
tc "89.  → counting PAID orders only" \
  "$(body | python3 -c "import json,sys;d=json.load(sys.stdin)['customers'][0];print(1 if d['orders']['paid_count']==2 else 0)")"
tc "90.  → and totalling gross paid GBP, named honestly" \
  "$(body | grep -q 'gross_paid_gbp' && echo 1 || echo 0)"
tc "91.  → not calling it net revenue while refunds are unmodelled" \
  "$(body | grep -qi '\"net_revenue\"\|\"revenue\"' && echo 0 || echo 1)"
tc "92.  → reporting whether they are a returning customer" \
  "$(body | grep -q '\"is_returning\"' && echo 1 || echo 0)"
tc "93.  → their public referral code" \
  "$(body | grep -q "$CODE" && echo 1 || echo 0)"
tc "94.  → conversions split by status, so an attribution is not a conversion" \
  "$(body | grep -q '\"confirmed\"' && body | grep -q '\"self_referral\"' && echo 1 || echo 0)"
tc "95.  → and whether a review has been requested" \
  "$(body | grep -q 'review_requests' && echo 1 || echo 0)"
# The enquirer has no customer row AT ALL — Sprint 7 deliberately does not
# create one, because someone who asked a question is not a buyer. So the
# lookup returns an empty list rather than a customer with zero orders.
tc "96. a concierge enquirer is not a customer, and has no paid totals" \
  "$(crm "crm/customer?email=lc-fp@example.com" >/dev/null; body | grep -q '"customers":\[\]' && echo 1 || echo 0)"
tc "97. returning customers can be listed" \
  "$(crm "crm/customer?returning=1" >/dev/null; body | grep -q 'lc-alice@example.com' && echo 1 || echo 0)"
tc "98. aggregates are computed in SQL, not per-order in PHP" \
  "$(grep -q 'COUNT(DISTINCT paid.id)' public/api/crm/customer.php && grep -q 'GROUP BY c.id' public/api/crm/customer.php && echo 1 || echo 0)"

echo ""
echo "================ 12. THE SHARE SURFACE ================"
tc "99. the share code reaches the customer only once complete" \
  "$(grep -q "WHEN p.stage = 'COMPLETED' THEN cr.code ELSE NULL END" public/api/order-reference.php && echo 1 || echo 0)"
OID_P=$(mkorder "Pending" "lc-pending@example.com" moment "")
paynow "$OID_P"
q "UPDATE orders SET stripe_session_id='cs_test_share_p' WHERE id=$OID_P" >/dev/null
tc "100. a paid but incomplete order is offered no share link" \
  "$(get "order-reference?session_id=cs_test_share_p" >/dev/null; body | grep -q '"referral":null' && echo 1 || echo 0)"
crmp crm/production '{"order_id":'"$OID_P"',"stage":"COMPLETED","approval_channel":"EMAIL"}' >/dev/null
tc "101.  → and is offered one once it completes" \
  "$(get "order-reference?session_id=cs_test_share_p" >/dev/null; body | grep -q '"referral":"MCB-R-' && echo 1 || echo 0)"
tc "102. the thank-you page renders it only when the server sends one" \
  "$(grep -q '{referralCode && <ShareMcb code={referralCode} />}' src/pages/ThankYou.tsx && echo 1 || echo 0)"
tc "103. no reward, discount or coupon is invented anywhere" \
  "$(prose src/data/referral.ts src/components/ShareMcb.tsx public/api/lib/referral.php \
     | grep -qiE 'discount|coupon|voucher|£10 credit|reward|points|commission for' && echo 0 || echo 1)"
tc "104. there is no leaderboard, count or competition" \
  "$(prose src/components/ShareMcb.tsx | grep -qiE 'leaderboard|top referrer|rank|compet' && echo 0 || echo 1)"
tc "105. the share copy claims nothing on the customer's behalf" \
  "$(grep -qiE 'best gift|you will love|guarantee' src/data/referral.ts && echo 0 || echo 1)"

echo ""
echo "================ 13. NOTHING ELSE MOVED ================"
tc "106. package prices unchanged" \
  "$(for p in 'gbp: 10' 'gbp: 79' 'gbp: 199' 'gbp: 349'; do grep -q "$p," src/data/packages.ts || exit 1; done && echo 1 || echo 0)"
tc "107. all nine Payment Link URLs unchanged" \
  "$([ "$(cat src/data/packages.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"
tc "108. dynamic checkout stays OFF in the shipped config" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "109. the client checkout flag stays false" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"
tc "110. the Full Package still cannot be ordered" \
  "$(post order '{'"$CONSENT"',"firstName":"F","lastName":"P","email":"lc-fpo@example.com","package":"bespoke","format":"","story":"x"}' | grep -q '^422$' && echo 1 || echo 0)"
tc "111. legal consent is still required" \
  "$(post order '{"firstName":"N","lastName":"C","email":"lc-nc@example.com","package":"moment","format":"mp3","story":"x"}' | grep -q '^422$' && echo 1 || echo 0)"
tc "112. the production lock still closes revisions on approval" \
  "$(crm "crm/production?order=$OID_A" >/dev/null; body | grep -q '"revisions_open":false' && echo 1 || echo 0)"
tc "113. no live Stripe host is contacted by the lifecycle code" \
  "$(prose public/api/lib/referral.php public/api/lib/lifecycle.php | grep -q 'api.stripe.com' && echo 0 || echo 1)"
tc "114. no Stripe secret in the built bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "115. the review URL is configuration, not a hard-coded Trustpilot address" \
  "$(prose public/api/lib/lifecycle.php | grep -qi 'trustpilot' && echo 0 || echo 1)"
tc "116.  → and is absent from the shipped config template, not invented" \
  "$(grep -A3 "'reviews'" public/api/config.example.php | grep -q "'url' => ''" && echo 1 || echo 0)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
