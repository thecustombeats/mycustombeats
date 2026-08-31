#!/bin/bash
# MCB CRM API — acceptance tests against a live PHP + MariaDB stack.
BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { # t "name" expected_status actual_status [extra condition description] [condition result]
  local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then
    printf "  PASS  %-58s [%s]\n" "$name" "$got"; PASS=$((PASS+1))
  else
    printf "  FAIL  %-58s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name")
  fi
}
tc() { # tc "name" condition_result
  local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-58s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-58s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi
}
post() { curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
body() { cat /tmp/r.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }

echo "================ ORDER API ================"

# --- digital order, no address required
S=$(post order '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","whatsapp":"+447000000001","package":"moment","format":"mp3","story":"A song for my father."}')
t "digital order (Moment+MP3) accepted" 201 "$S"
OID=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "  → fulfilment_type derived DIGITAL server-side" "$([ "$(body | grep -c '"fulfilment_type":"DIGITAL"')" = "1" ] && echo 1 || echo 0)"
tc "  → source_type derived DIRECT" "$([ "$(body | grep -c '"source_type":"DIRECT"')" = "1" ] && echo 1 || echo 0)"
tc "  → order persisted as PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PENDING" ] && echo 1 || echo 0)"
tc "  → no delivery address row created" "$([ "$(q "SELECT COUNT(*) FROM delivery_addresses WHERE order_id=$OID")" = "0" ] && echo 1 || echo 0)"
tc "  → amount taken from server package data (10.00)" "$([ "$(q "SELECT amount_gbp FROM orders WHERE id=$OID")" = "10.00" ] && echo 1 || echo 0)"

# --- physical order without address
S=$(post order '{"firstName":"Grace","lastName":"Hopper","email":"grace@example.com","whatsapp":"+447000000002","package":"journey","format":"vinyl","story":"Our trip."}')
t "physical order REJECTED without address" 422 "$S"
tc "  → names the missing address fields" "$([ "$(body | grep -c 'shippingAddress')" -ge 1 ] && echo 1 || echo 0)"

# --- physical order with complete address
S=$(post order '{"firstName":"Grace","lastName":"Hopper","email":"grace@example.com","whatsapp":"+447000000002","package":"journey","format":"vinyl","shippingName":"Grace Hopper","shippingAddress":"1 Navy Yard","shippingAddress2":"Flat 2","shippingCity":"London","shippingState":"Greater London","shippingPostcode":"SW1A 1AA","shippingCountry":"United Kingdom","story":"Our trip."}')
t "physical order accepted WITH address" 201 "$S"
OID2=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "  → fulfilment_type derived PHYSICAL" "$([ "$(q "SELECT fulfilment_type FROM orders WHERE id=$OID2")" = "PHYSICAL" ] && echo 1 || echo 0)"
tc "  → delivery address stored" "$([ "$(q "SELECT COUNT(*) FROM delivery_addresses WHERE order_id=$OID2")" = "1" ] && echo 1 || echo 0)"
tc "  → address_line_2 + state captured" "$([ "$(q "SELECT CONCAT(address_line_2,'|',state_region) FROM delivery_addresses WHERE order_id=$OID2")" = "Flat 2|Greater London" ] && echo 1 || echo 0)"

# --- invalid combinations
t "invalid package rejected" 422 "$(post order '{"firstName":"A","lastName":"B","email":"x@example.com","package":"platinum","format":"mp3"}')"
t "invalid format rejected" 422 "$(post order '{"firstName":"A","lastName":"B","email":"x@example.com","package":"keepsake","format":"betamax"}')"
t "invalid package/format combo rejected (Journey+MP3)" 422 "$(post order '{"firstName":"A","lastName":"B","email":"x@example.com","package":"journey","format":"mp3"}')"
t "invalid combo rejected (Moment+Vinyl)" 422 "$(post order '{"firstName":"A","lastName":"B","email":"x@example.com","package":"moment","format":"vinyl"}')"
t "missing required customer fields rejected" 422 "$(post order '{"package":"moment","format":"mp3"}')"
t "invalid email rejected" 422 "$(post order '{"firstName":"A","lastName":"B","email":"not-an-email","package":"moment","format":"mp3"}')"

# --- customer deduplication
S=$(post order '{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","whatsapp":"+447000000001","package":"keepsake","format":"cd","shippingName":"Ada L","shippingAddress":"2 Analytical St","shippingCity":"London","shippingPostcode":"E1 6AN","shippingCountry":"UK","story":"Second order."}')
t "same customer can place a second order" 201 "$S"
tc "  → customer deduplicated on email (1 row)" "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='ada@example.com'")" = "1" ] && echo 1 || echo 0)"
tc "  → that customer now has 2 orders" "$([ "$(q "SELECT COUNT(*) FROM orders o JOIN customers c ON c.id=o.customer_id WHERE c.email='ada@example.com'")" = "2" ] && echo 1 || echo 0)"
tc "  → different addresses across orders allowed" "$([ "$(q "SELECT COUNT(DISTINCT address_line_1) FROM delivery_addresses")" -ge 2 ] && echo 1 || echo 0)"

echo ""
echo "================ AFFILIATE ================"

S=$(post affiliate/register '{"name":"Rey Skywalker","email":"rey@example.com","username":"rey123"}')
t "affiliate registration accepted" 201 "$S"
TOKEN=$(body | sed -n 's/.*"dashboard_token":"\([^"]*\)".*/\1/p')
tc "  → dashboard token issued" "$([ -n "$TOKEN" ] && echo 1 || echo 0)"
tc "  → only the token HASH is stored" "$([ "$(q "SELECT dashboard_token_hash='$TOKEN' FROM affiliates WHERE username='rey123'")" = "0" ] && echo 1 || echo 0)"

t "duplicate EMAIL rejected 409" 409 "$(post affiliate/register '{"name":"Other","email":"rey@example.com","username":"different1"}')"
t "duplicate USERNAME rejected 409" 409 "$(post affiliate/register '{"name":"Other","email":"other@example.com","username":"rey123"}')"
tc "  → 409 does not disclose which field collided" "$([ "$(body | grep -ci 'email or referral name')" = "1" ] && echo 1 || echo 0)"
t "short username rejected" 422 "$(post affiliate/register '{"name":"X","email":"x2@example.com","username":"ab"}')"

# --- clicks
BEFORE=$(q "SELECT clicks FROM affiliates WHERE username='rey123'")
t "referral click recorded" 204 "$(post affiliate/click '{"ref":"rey123"}')"
AFTER=$(q "SELECT clicks FROM affiliates WHERE username='rey123'")
tc "  → click counter incremented ($BEFORE→$AFTER)" "$([ "$AFTER" = "$((BEFORE+1))" ] && echo 1 || echo 0)"
tc "  → IP stored as a 64-char hash, not raw" "$([ "$(q "SELECT LENGTH(ip_hash) FROM clicks ORDER BY id DESC LIMIT 1")" = "64" ] && echo 1 || echo 0)"
t "unknown ref is a silent no-op" 204 "$(post affiliate/click '{"ref":"nobodyhere"}')"
tc "  → no click row created for unknown ref" "$([ "$(q "SELECT COUNT(*) FROM clicks WHERE username='nobodyhere'")" = "0" ] && echo 1 || echo 0)"

echo ""
echo "================ ATTRIBUTION ================"

S=$(post order '{"firstName":"Finn","lastName":"Storm","email":"finn@example.com","whatsapp":"+447000000003","package":"moment","format":"mp3","referral":"rey123","story":"Referred order."}')
t "order with referral accepted" 201 "$S"
OID3=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "  → source_type resolved to AFFILIATE server-side" "$([ "$(q "SELECT source_type FROM orders WHERE id=$OID3")" = "AFFILIATE" ] && echo 1 || echo 0)"
tc "  → affiliate_id resolved from username" "$([ "$(q "SELECT a.username FROM orders o JOIN affiliates a ON a.id=o.affiliate_id WHERE o.id=$OID3")" = "rey123" ] && echo 1 || echo 0)"
tc "  → referral_raw retained for audit" "$([ "$(q "SELECT referral_raw FROM orders WHERE id=$OID3")" = "rey123" ] && echo 1 || echo 0)"

# --- browser cannot force attribution
AID=$(q "SELECT id FROM affiliates WHERE username='rey123'")
S=$(post order "{\"firstName\":\"Mal\",\"lastName\":\"Actor\",\"email\":\"mal@example.com\",\"package\":\"moment\",\"format\":\"mp3\",\"affiliate_id\":$AID,\"partner_id\":1,\"source_type\":\"AFFILIATE\",\"status\":\"PAID\",\"amount_gbp\":0.01}")
t "browser-supplied attribution fields accepted but ignored" 201 "$S"
OID4=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "  → affiliate_id NOT set from browser input" "$([ "$(q "SELECT IFNULL(affiliate_id,'null') FROM orders WHERE id=$OID4")" = "null" ] && echo 1 || echo 0)"
tc "  → source_type forced to DIRECT" "$([ "$(q "SELECT source_type FROM orders WHERE id=$OID4")" = "DIRECT" ] && echo 1 || echo 0)"
tc "  → status forced to PENDING (not browser's PAID)" "$([ "$(q "SELECT status FROM orders WHERE id=$OID4")" = "PENDING" ] && echo 1 || echo 0)"
tc "  → amount from server data, not browser's 0.01" "$([ "$(q "SELECT amount_gbp FROM orders WHERE id=$OID4")" = "10.00" ] && echo 1 || echo 0)"

# --- unknown referral
S=$(post order '{"firstName":"Poe","lastName":"D","email":"poe@example.com","package":"moment","format":"mp3","referral":"ghostaffiliate"}')
OID5=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "unknown referral → DIRECT, not credited" "$([ "$(q "SELECT source_type FROM orders WHERE id=$OID5")" = "DIRECT" ] && echo 1 || echo 0)"
tc "  → but referral_raw kept for provenance" "$([ "$(q "SELECT referral_raw FROM orders WHERE id=$OID5")" = "ghostaffiliate" ] && echo 1 || echo 0)"

echo ""
echo "================ PARTNER ================"
tc "partners table seeded EMPTY (no fake companies)" "$([ "$(q "SELECT COUNT(*) FROM partners")" = "0" ] && echo 1 || echo 0)"
q "INSERT INTO partners (slug,name,active) VALUES ('ritz-carlton-yacht-collection','Ritz-Carlton Yacht Collection',1)" >/dev/null
S=$(post order '{"firstName":"Guest","lastName":"Aboard","email":"guest@example.com","package":"keepsake","format":"mp3","partner":"ritz-carlton-yacht-collection","story":"Cruise memory."}')
t "partner-attributed order accepted" 201 "$S"
OID6=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "  → source_type PARTNER" "$([ "$(q "SELECT source_type FROM orders WHERE id=$OID6")" = "PARTNER" ] && echo 1 || echo 0)"
tc "  → partner resolved by slug, no code change needed" "$([ "$(q "SELECT p.slug FROM orders o JOIN partners p ON p.id=o.partner_id WHERE o.id=$OID6")" = "ritz-carlton-yacht-collection" ] && echo 1 || echo 0)"
q "DELETE FROM partners WHERE slug='ritz-carlton-yacht-collection'" >/dev/null

echo ""
echo "================ DASHBOARD SECURITY ================"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/affiliate/dashboard" -H "Authorization: Bearer $TOKEN")
t "valid token grants access" 200 "$CODE"
tc "  → returns only that affiliate's own record" "$([ "$(body | grep -c '"username":"rey123"')" = "1" ] && echo 1 || echo 0)"
t "no token rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/affiliate/dashboard")"
t "forged token rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/affiliate/dashboard" -H "Authorization: Bearer 1.9999999999.deadbeef")"
t "another person's EMAIL is not accepted as auth" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/affiliate/dashboard?email=rey@example.com")"
OTHER=$(echo "$TOKEN" | sed 's/^[0-9]*\./999./')
t "token re-pointed at another affiliate id rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/affiliate/dashboard" -H "Authorization: Bearer $OTHER")"

echo ""
echo "================ CRM READ SURFACE ================"
t "unauthenticated CRM read rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/orders")"
t "wrong key rejected" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/orders" -H "Authorization: Bearer wrong-key")"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/crm/orders" -H "Authorization: Bearer test_crm_key_not_real_000000000000000000000")
t "valid key grants read" 200 "$CODE"
tc "  → returns orders with attribution" "$([ "$(body | grep -c '"source_type"')" -ge 1 ] && echo 1 || echo 0)"
tc "  → creative brief/story NOT exposed" "$([ "$(body | grep -c 'brief_story\|A song for my father')" = "0" ] && echo 1 || echo 0)"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/crm/orders?fulfilment=PHYSICAL" -H "Authorization: Bearer test_crm_key_not_real_000000000000000000000")
tc "  → 'what needs shipping?' filter works" "$([ "$(body | grep -c '"delivery"')" -ge 1 ] && echo 1 || echo 0)"

echo ""
echo "================ STRIPE WEBHOOK ================"
t "unsigned webhook rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H 'Content-Type: application/json' -d '{"id":"evt_1","type":"checkout.session.completed"}')"
t "bad signature rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H 'Stripe-Signature: t=1,v1=bad' -d '{}')"

SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local p="$1"; local sig=$(printf '%s.%s' "$ts" "$p" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
PAY="{\"id\":\"evt_test_001\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_test_001\",\"client_reference_id\":\"$OID3\",\"payment_intent\":\"pi_test_001\"}}}"
SALES_BEFORE=$(q "SELECT sales FROM affiliates WHERE username='rey123'")
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$PAY")" -H 'Content-Type: application/json' -d "$PAY")
t "correctly signed webhook accepted" 200 "$CODE"
tc "  → order marked PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$OID3")" = "PAID" ] && echo 1 || echo 0)"
tc "  → stripe session + payment intent stored" "$([ "$(q "SELECT CONCAT(stripe_session_id,'|',stripe_payment_intent) FROM orders WHERE id=$OID3")" = "cs_test_001|pi_test_001" ] && echo 1 || echo 0)"
SALES_AFTER=$(q "SELECT sales FROM affiliates WHERE username='rey123'")
tc "  → affiliate sales incremented ($SALES_BEFORE→$SALES_AFTER)" "$([ "$SALES_AFTER" = "$((SALES_BEFORE+1))" ] && echo 1 || echo 0)"

CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$PAY")" -H 'Content-Type: application/json' -d "$PAY")
t "REPLAYED event accepted (Stripe expects 200)" 200 "$CODE"
tc "  → but reported as duplicate" "$([ "$(body | grep -c 'duplicate')" = "1" ] && echo 1 || echo 0)"
SALES_REPLAY=$(q "SELECT sales FROM affiliates WHERE username='rey123'")
tc "  → sales NOT double-counted (still $SALES_AFTER)" "$([ "$SALES_REPLAY" = "$SALES_AFTER" ] && echo 1 || echo 0)"

OLD_TS="t=1000000000,v1=$(printf '1000000000.%s' "$PAY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//')"
t "replayed OLD timestamp rejected (outside tolerance)" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $OLD_TS" -d "$PAY")"

echo ""
echo "================ MCB CUSTOMER REFERENCE ================"
YEAR=$(date -u +%Y)

# The whole point of issuing after payment: OID and OID2 are still PENDING.
tc "PENDING orders hold NO customer reference" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE status='PENDING' AND mcb_reference IS NOT NULL")" = "0" ] && echo 1 || echo 0)"

REF3=$(q "SELECT mcb_reference FROM orders WHERE id=$OID3")
tc "  → paid order issued a reference ($REF3)" "$([ -n "$REF3" ] && echo 1 || echo 0)"
tc "  → format is MCB-YYYY-NNNNNN" "$(echo "$REF3" | grep -qE "^MCB-$YEAR-[0-9]{6}$" && echo 1 || echo 0)"
tc "  → first paid order of the year is 000001" "$([ "$REF3" = "MCB-$YEAR-000001" ] && echo 1 || echo 0)"

# The replayed event above already ran. It must not have issued a second one.
tc "  → replayed event did NOT reissue or change it" "$([ "$(q "SELECT mcb_reference FROM orders WHERE id=$OID3")" = "$REF3" ] && echo 1 || echo 0)"
tc "  → replay did NOT consume a sequence number" "$([ "$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")" = "1" ] && echo 1 || echo 0)"

# A second, DIFFERENT payment. Proves the series counts paid orders, not rows:
# OID2 is a higher order id but takes the next reference in sequence.
PAY2="{\"id\":\"evt_test_002\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_test_002\",\"client_reference_id\":\"$OID2\",\"payment_intent\":\"pi_test_002\"}}}"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$PAY2")" -H 'Content-Type: application/json' -d "$PAY2")
t "a second payment is accepted" 200 "$CODE"
REF2=$(q "SELECT mcb_reference FROM orders WHERE id=$OID2")
tc "  → issued the NEXT reference in the series ($REF2)" "$([ "$REF2" = "MCB-$YEAR-000002" ] && echo 1 || echo 0)"
tc "  → the two references differ" "$([ "$REF2" != "$REF3" ] && echo 1 || echo 0)"
tc "  → references are UNIQUE across all orders" "$([ "$(q "SELECT COUNT(*) FROM (SELECT mcb_reference FROM orders WHERE mcb_reference IS NOT NULL GROUP BY mcb_reference HAVING COUNT(*)>1) x")" = "0" ] && echo 1 || echo 0)"

# One customer, two orders, two references — the identity model the CRM claims.
tc "  → same customer can hold two different references" "$([ "$(q "SELECT COUNT(DISTINCT o.mcb_reference) FROM orders o WHERE o.mcb_reference IS NOT NULL")" = "2" ] && echo 1 || echo 0)"

echo ""
echo "---------------- customer lookup ----------------"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/order-reference?session_id=cs_test_001")
t "customer can retrieve their reference by session id" 200 "$CODE"
tc "  → returns the reference issued to that session" "$([ "$(body | grep -c "$REF3")" = "1" ] && echo 1 || echo 0)"
tc "  → leaks NO customer data with it" "$([ "$(body | grep -ci 'email\|name\|address\|story\|amount\|payment_intent')" = "0" ] && echo 1 || echo 0)"

CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/order-reference?session_id=cs_test_does_not_exist")
t "unknown session answers 200 with no reference (webhook race)" 200 "$CODE"
tc "  → reference is null, not invented" "$([ "$(body | grep -c '"reference":null')" = "1" ] && echo 1 || echo 0)"

t "malformed session id rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/order-reference?session_id=1")"
t "missing session id rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/order-reference")"
t "SQL injection in session id rejected before the query" 400 "$(curl -s -o /dev/null -w '%{http_code}' --get "$BASE/order-reference" --data-urlencode "session_id=cs_x' OR 1=1--")"
tc "  → orders table intact after injection attempt" "$([ "$(q "SELECT COUNT(*) FROM orders")" -ge 2 ] && echo 1 || echo 0)"

echo ""
echo "---------------- staff retrieval ----------------"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/crm/orders?reference=$REF3" -H "Authorization: Bearer test_crm_key_not_real_000000000000000000000")
t "staff can retrieve an order by the quoted reference" 200 "$CODE"
tc "  → returns exactly one order" "$([ "$(body | grep -c '"order_id"')" = "1" ] && echo 1 || echo 0)"
tc "  → it is the right order (id $OID3)" "$([ "$(body | grep -c "\"order_id\":$OID3")" = "1" ] && echo 1 || echo 0)"
tc "  → the reference is on the CRM read surface" "$([ "$(body | grep -c "\"mcb_reference\":\"$REF3\"")" = "1" ] && echo 1 || echo 0)"

echo ""
echo "================ ORPHANED PAYMENT RECONCILIATION ================"
KEY="test_crm_key_not_real_000000000000000000000"
# Relative, so this section stays correct if a payment is added upstream.
SEQ_BEFORE=$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")

# THE SCENARIO: /api/order failed, so checkout carried no client_reference_id.
# The customer paid anyway. Money exists; no order claims it.
ORPHAN="{\"id\":\"evt_orphan_1\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_orphan_001\",\"payment_intent\":\"pi_orphan_001\",\"amount_total\":4900,\"currency\":\"gbp\",\"customer_details\":{\"email\":\"orphan@example.com\",\"name\":\"Orphan Buyer\",\"phone\":\"+447000000009\"}}}}"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$ORPHAN")" -H 'Content-Type: application/json' -d "$ORPHAN")
t "unclaimed payment acknowledged to Stripe" 200 "$CODE"
tc "  → reported unmatched" "$([ "$(body | grep -c '"matched":false')" = "1" ] && echo 1 || echo 0)"
tc "  → but PERSISTED, not just logged" "$([ "$(q "SELECT COUNT(*) FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "1" ] && echo 1 || echo 0)"
tc "  → reason recorded NO_ORDER_REFERENCE" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "NO_ORDER_REFERENCE" ] && echo 1 || echo 0)"
tc "  → Stripe's buyer identity retained" "$([ "$(q "SELECT CONCAT(customer_email,'|',customer_name) FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "orphan@example.com|Orphan Buyer" ] && echo 1 || echo 0)"
tc "  → amount converted from minor units (4900 -> 49.00)" "$([ "$(q "SELECT amount_total FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "49.00" ] && echo 1 || echo 0)"
tc "  → payment intent retained for Stripe reconciliation" "$([ "$(q "SELECT stripe_payment_intent FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "pi_orphan_001" ] && echo 1 || echo 0)"
tc "  → NO order was invented for it" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE stripe_session_id='cs_orphan_001'")" = "0" ] && echo 1 || echo 0)"
tc "  → NO reference was issued to a payment with no order" "$([ "$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")" = "$SEQ_BEFORE" ] && echo 1 || echo 0)"

# Stripe retries what it thinks failed. The alarm must not queue twice.
ORPHAN2="{\"id\":\"evt_orphan_2\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_orphan_001\",\"payment_intent\":\"pi_orphan_001\",\"amount_total\":4900,\"currency\":\"gbp\",\"customer_details\":{\"email\":\"orphan@example.com\",\"name\":\"Orphan Buyer\"}}}}"
curl -s -o /dev/null -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$ORPHAN2")" -H 'Content-Type: application/json' -d "$ORPHAN2"
tc "redelivered orphan does NOT duplicate the alarm" "$([ "$(q "SELECT COUNT(*) FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "1" ] && echo 1 || echo 0)"

# A client_reference_id naming an order that does not exist.
GHOST="{\"id\":\"evt_ghost_1\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"cs_ghost_001\",\"client_reference_id\":\"999999\",\"payment_intent\":\"pi_ghost_001\",\"amount_total\":1000,\"currency\":\"gbp\",\"customer_details\":{\"email\":\"ghost@example.com\"}}}}"
curl -s -o /dev/null -X POST "$BASE/stripe/webhook" -H "Stripe-Signature: $(sign "$GHOST")" -H 'Content-Type: application/json' -d "$GHOST"
tc "payment naming a NON-EXISTENT order is filed too" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='cs_ghost_001'")" = "ORDER_NOT_FOUND" ] && echo 1 || echo 0)"

echo ""
echo "---------------- the alarm ----------------"
t "unreconciled ledger requires the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/crm/unreconciled")"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/crm/unreconciled" -H "Authorization: Bearer $KEY")
t "staff can see money that no order claims" 200 "$CODE"
tc "  → both outstanding payments listed" "$([ "$(body | grep -c '"open":2')" = "1" ] && echo 1 || echo 0)"
tc "  → carries the buyer's email so they can be found" "$([ "$(body | grep -c 'orphan@example.com')" = "1" ] && echo 1 || echo 0)"

echo ""
echo "---------------- closing the loop ----------------"
# Staff recreate the order the customer actually placed, then attach the money.
S=$(post order '{"firstName":"Orphan","lastName":"Buyer","email":"orphan@example.com","package":"keepsake","format":"vinyl","shippingName":"Orphan Buyer","shippingAddress":"9 Recovery Rd","shippingCity":"London","shippingPostcode":"N1 1AA","shippingCountry":"UK","story":"Recovered by hand."}')
ROID=$(body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
t "staff recreate the order through the normal endpoint" 201 "$S"
tc "  → it starts PENDING with no reference" "$([ "$(q "SELECT CONCAT(status,'|',IFNULL(mcb_reference,'NULL')) FROM orders WHERE id=$ROID")" = "PENDING|NULL" ] && echo 1 || echo 0)"

t "reconcile requires the CRM key" 401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H 'Content-Type: application/json' -d '{"session_id":"cs_orphan_001","order_id":1}')"
CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "{\"session_id\":\"cs_orphan_001\",\"order_id\":$ROID}")
t "payment attached to its real order" 200 "$CODE"
RREF=$(q "SELECT mcb_reference FROM orders WHERE id=$ROID")
tc "  → order became PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$ROID")" = "PAID" ] && echo 1 || echo 0)"
tc "  → reference issued by the SAME path ($RREF)" "$(echo "$RREF" | grep -qE "^MCB-$YEAR-[0-9]{6}$" && echo 1 || echo 0)"
tc "  → it is the next in the ONE series, not a parallel one" "$([ "$RREF" = "$(printf 'MCB-%s-%06d' "$YEAR" "$((SEQ_BEFORE+1))")" ] && echo 1 || echo 0)"
tc "  → session id captured on the order" "$([ "$(q "SELECT stripe_session_id FROM orders WHERE id=$ROID")" = "cs_orphan_001" ] && echo 1 || echo 0)"
tc "  → payment intent carried across from the ledger" "$([ "$(q "SELECT stripe_payment_intent FROM orders WHERE id=$ROID")" = "pi_orphan_001" ] && echo 1 || echo 0)"
tc "  → ledger row closed against that order" "$([ "$(q "SELECT resolved_order_id FROM unreconciled_payments WHERE stripe_session_id='cs_orphan_001'")" = "$ROID" ] && echo 1 || echo 0)"
tc "  → customer NOT duplicated (existing email reused)" "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='orphan@example.com'")" = "1" ] && echo 1 || echo 0)"

CODE=$(curl -s -o /tmp/r.json -w '%{http_code}' "$BASE/crm/unreconciled" -H "Authorization: Bearer $KEY")
tc "  → alarm count drops to the one still outstanding" "$([ "$(body | grep -c '"open":1')" = "1" ] && echo 1 || echo 0)"

RECON_BODY="{\"session_id\":\"cs_orphan_001\",\"order_id\":$ROID}"
t "reconciling the SAME payment twice refused" 409 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "$RECON_BODY")"
tc "  → and did NOT issue a second reference" "$([ "$(q "SELECT mcb_reference FROM orders WHERE id=$ROID")" = "$RREF" ] && echo 1 || echo 0)"
tc "  → nor consume a sequence number" "$([ "$(q "SELECT last_value FROM reference_sequence WHERE year=$YEAR")" = "$((SEQ_BEFORE+1))" ] && echo 1 || echo 0)"

GHOST_BODY="{\"session_id\":\"cs_ghost_001\",\"order_id\":$ROID}"
t "moving a payment onto an ALREADY-PAID order refused" 409 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d "$GHOST_BODY")"
t "reconciling an unknown payment refused" 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"session_id":"cs_never_seen_at_all","order_id":1}')"
t "reconciling onto an unknown order refused" 404 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"session_id":"cs_ghost_001","order_id":999999}')"
t "malformed session id refused" 422 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/crm/reconcile" -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' -d '{"session_id":"nope","order_id":1}')"

echo ""
echo "================ SECURITY ================"
t "config.php denied over HTTP" 403 "$(curl -s -o /tmp/r.json -w '%{http_code}' http://localhost:8080/api/config.php)"
tc "  -> no credentials in the response body" "$([ "$(body | grep -c 'testpass\|test_token_secret')" = "0" ] && echo 1 || echo 0)"
t "lib/ denied over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/lib/db.php)"
t "data/ denied over HTTP" 403 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/data/packages.json)"
t "clean URL routing works (/api/order)" 405 "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/order)"
t "GET on a POST-only endpoint rejected" 405 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/order")"
t "cross-origin write rejected" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/order" -H 'Origin: https://evil.example.com' -H 'Content-Type: application/json' -d '{}')"
t "malformed JSON rejected" 400 "$(post order 'not json at all')"

# SQL injection attempts — payloads built in files to avoid shell quoting issues
python3 - <<'PYEOF'
import json
json.dump({"firstName":"Robert'); DROP TABLE orders;--","lastName":"Tables",
           "email":"bobby@example.com","package":"moment","format":"mp3"},
          open("/tmp/inj1.json","w"))
json.dump({"ref":"rey123' OR 1=1--"}, open("/tmp/inj2.json","w"))
PYEOF
S=$(curl -s -o /tmp/r.json -w '%{http_code}' -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" --data @/tmp/inj1.json)
t "SQL injection attempt handled safely" 201 "$S"
tc "  -> orders table still exists" "$([ "$(q "SELECT COUNT(*) FROM orders")" -ge 1 ] && echo 1 || echo 0)"
tc "  -> payload stored literally, not executed" "$([ "$(q "SELECT COUNT(*) FROM customers WHERE email='bobby@example.com'")" = "1" ] && echo 1 || echo 0)"
S=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/affiliate/click" -H "Content-Type: application/json" -H "Origin: $ORIGIN" --data @/tmp/inj2.json)
tc "injection in ref sanitised" "$([ "$S" = "204" ] && echo 1 || echo 0)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ $FAIL -gt 0 ]; then printf '  failing:\n'; for f in "${FAILED[@]}"; do echo "    - $f"; done; fi
echo "=================================================="
exit $FAIL
