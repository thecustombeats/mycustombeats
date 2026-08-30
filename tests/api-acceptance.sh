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
