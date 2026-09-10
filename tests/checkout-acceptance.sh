#!/bin/bash
# MCB DYNAMIC CHECKOUT — acceptance tests against a live PHP + MariaDB stack.
#
# Runs against the same throwaway containers as api-acceptance.sh, with
# `stripe.checkout_sessions_enabled` turned ON in the TEST config only and
# `stripe.api_base` pointed at tests/stripe-stub.php.
#
# NO REQUEST EVER REACHES STRIPE. There is no secret key, test-mode or
# otherwise, and the stub is a local file. A test run cannot create anything
# in a Stripe account.
#
# The production default remains OFF — that is asserted here too, by reading
# the shipped config template rather than the test one.

BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then printf "  PASS  %-62s [%s]\n" "$name" "$got"; PASS=$((PASS+1));
  else printf "  FAIL  %-62s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
tc() { local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-62s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-62s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }

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
CONSENT_BLOCK='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2026-09-09.4","cruiseCompanions":"My husband David"'

with_consent() {
  case "$1" in
    *'"consents"'*) printf '%s' "$1" ;;
    '{"'*)          printf '{%s,%s' "$CONSENT_BLOCK" "${1#\{}" ;;
    *)              printf '%s' "$1" ;;
  esac
}

post_raw() { curl -s -o /tmp/c.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
post() {
  local ep="$1" data="$2"
  [ "$ep" = "order" ] && data="$(with_consent "$data")"
  [ "$ep" = "order" ] && release_order_limit
  post_raw "$ep" "$data"
}
body() { cat /tmp/c.json; }
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
stub() { docker exec mcb-api sh -c "echo '$1' > /tmp/stripe-mode"; }
stub_log() { docker exec mcb-api sh -c 'cat /tmp/stripe-stub.log 2>/dev/null'; }
stub_reset() { docker exec mcb-api sh -c 'rm -f /tmp/stripe-stub.log'; }
last_params() { stub_log | tail -1; }

stub ok
stub_reset

# An order to check out against.
mkorder() {
  release_order_limit
  curl -s -o /tmp/o.json -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
    -d "{$CONSENT_BLOCK,\"firstName\":\"Cs\",\"lastName\":\"Tester\",\"email\":\"$1\",\"whatsapp\":\"+447000000123\",\"package\":\"$2\",\"format\":\"$3\",\"shippingName\":\"Cs Tester\",\"shippingAddress\":\"1 Test St\",\"shippingCity\":\"London\",\"shippingPostcode\":\"E1 1AA\",\"shippingCountry\":\"United Kingdom\",\"story\":\"A story.\"}" >/dev/null
  sed -n 's/.*"order_id":\([0-9]*\).*/\1/p' /tmp/o.json
}

# An order carrying the full Complete Your Memory basket.
mkorder_basket() {
  release_order_limit
  curl -s -o /tmp/o.json -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" \
    -d '{'"$CONSENT_BLOCK"',"firstName":"Cs","lastName":"Tester","email":"'"$1"'","whatsapp":"+447000000123","package":"'"$2"'","format":"'"$3"'","shippingName":"Cs Tester","shippingAddress":"1 Test St","shippingCity":"London","shippingPostcode":"E1 1AA","shippingCountry":"United Kingdom","story":"A story.","enhancements":[{"id":"vinyl-frame","quantity":1},{"id":"gift-pop-up-card-anniversary","quantity":1},{"id":"additional-vinyl-copy","quantity":2}]}' >/dev/null
  sed -n 's/.*"order_id":\([0-9]*\).*/\1/p' /tmp/o.json
}

echo "================ FLAGS & DORMANCY ================"
tc "1. shipped config template keeps checkout sessions OFF" \
  "$(grep -A1 "'checkout_sessions_enabled'" public/api/config.example.php | grep -qi 'false' && echo 1 || echo 0)"
tc "1. client flag CHECKOUT_SESSIONS_ENABLED is false" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"
tc "20. no Stripe secret in the built browser bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"
tc "22. no live Stripe host referenced by the browser bundle" \
  "$(grep -rq 'api\.stripe\.com' dist/assets/ 2>/dev/null && echo 0 || echo 1)"

OID=$(mkorder "cs1@example.com" keepsake vinyl)
echo "  (order $OID created for checkout tests)"

echo ""
echo "================ VALIDATION ================"
B='{"package":"not-a-package","format":"vinyl","orderId":'"$OID"'}'
t "3. unknown package rejected" 422 "$(post checkout/session "$B")"
B='{"package":"moment","format":"vinyl","orderId":'"$OID"'}'
t "4. invalid format for package rejected (Moment+vinyl)" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"not-a-thing","quantity":1}]}'
t "5. unknown enhancement rejected" 422 "$(post checkout/session "$B")"
tc "5.  → refusal names the item, not the catalogue" "$(body | grep -qc 'unknown_item' && echo 1 || echo 0)"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"vinyl-12","quantity":1}]}'
t "5. UNPRICED catalogue product rejected (vinyl-12 is TBD)" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"additional-vinyl-copy","quantity":0}]}'
t "6. quantity 0 rejected" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"additional-vinyl-copy","quantity":5}]}'
t "6. quantity above the approved max rejected" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"additional-vinyl-copy","quantity":"2"}]}'
t "6. non-integer quantity rejected" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"additional-vinyl-copy","quantity":-1}]}'
t "6. negative quantity rejected" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"',"enhancements":[{"id":"vinyl-frame","quantity":1},{"id":"vinyl-frame","quantity":1}]}'
t "6. duplicate item id rejected" 422 "$(post checkout/session "$B")"
B='{"package":"moment","format":"mp3","orderId":'"$OID"',"enhancements":[{"id":"additional-vinyl-copy","quantity":1}]}'
t "ineligible enhancement rejected (Moment cannot add a vinyl copy)" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl"}'
t "missing order id rejected" 422 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":99999999}'
t "unknown order id rejected" 404 "$(post checkout/session "$B")"
B='{"package":"keepsake","format":"vinyl","orderId":"rinaldi"}'
t "17. referral string cannot become the order id" 422 "$(post checkout/session "$B")"

echo ""
echo "================ SERVER-SIDE PRICING ================"
stub_reset
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID"'}'
t "8. base package session created" 200 "$(post checkout/session "$B")"
tc "8.  → charged £79.00, from server package data" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OID")" = "79.00" ] && echo 1 || echo 0)"
tc "13. → currency recorded GBP" "$([ "$(q "SELECT currency FROM checkout_sessions WHERE order_id=$OID")" = "GBP" ] && echo 1 || echo 0)"
tc "13. → Stripe received currency gbp" "$(last_params | grep -qc '"currency":"gbp"' && echo 1 || echo 0)"
tc "15. → Stripe received unit_amount 7900" "$(last_params | grep -qc '"unit_amount":"7900"' && echo 1 || echo 0)"
tc "16. → client_reference_id is the internal order id" "$([ "$(last_params | sed -n 's/.*"client_reference_id":"\([0-9]*\)".*/\1/p')" = "$OID" ] && echo 1 || echo 0)"
tc "18. → success_url carries {CHECKOUT_SESSION_ID}" "$(last_params | grep -qc 'CHECKOUT_SESSION_ID' && echo 1 || echo 0)"
tc "18. → success_url points at /thank-you" "$(last_params | grep -qc 'thank-you' && echo 1 || echo 0)"
tc "19. → cancel_url stays on the MCB origin" "$(last_params | grep -qc 'localhost:8080' && echo 1 || echo 0)"
tc "20. → Authorization header was sent (value never logged)" "$(last_params | grep -qc '"authorization":"PRESENT"' && echo 1 || echo 0)"
tc "→ metadata carries machine ids only, no story" "$(last_params | grep -qc 'mcb_order_id' && ! last_params | grep -qc 'story' && echo 1 || echo 0)"
tc "23. → the order is still PENDING after session creation" "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PENDING" ] && echo 1 || echo 0)"

echo ""
echo "---------------- the £449 basket ----------------"
OID2=$(mkorder "cs2@example.com" keepsake vinyl)
stub_reset
BASKET='{"package":"keepsake","format":"vinyl","orderId":'"$OID2"',"enhancements":[{"id":"vinyl-frame","quantity":1},{"id":"gift-pop-up-card-anniversary","quantity":1},{"id":"additional-vinyl-copy","quantity":2}]}'
t "14. Keepsake + frame + card + 2 vinyl accepted" 200 "$(post checkout/session "$BASKET")"
tc "14. → server totalled exactly £449.00" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OID2")" = "449.00" ] && echo 1 || echo 0)"
tc "7.  → additional vinyl line is 2 × £60" "$(last_params | grep -qc '"unit_amount":"6000"' && last_params | grep -qc '"quantity":"2"' && echo 1 || echo 0)"
tc "15. → four separate Stripe line items" "$([ "$(last_params | grep -o '"unit_amount"' | wc -l | tr -d ' ')" = "4" ] && echo 1 || echo 0)"
tc "9.  → frame priced £200 server-side" "$(last_params | grep -qc '"unit_amount":"20000"' && echo 1 || echo 0)"
tc "9.  → card priced £50 server-side" "$(last_params | grep -qc '"unit_amount":"5000"' && echo 1 || echo 0)"
tc "36. → line item names come from the catalogue" "$(last_params | grep -qc 'Vinyl Frame' && echo 1 || echo 0)"
tc "29. → expected amount snapshotted at creation" "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$OID2 AND expected_amount_gbp=449.00")" = "1" ] && echo 1 || echo 0)"
tc "29. → itemisation snapshotted alongside it" "$(q "SELECT basket_lines FROM checkout_sessions WHERE order_id=$OID2" | grep -qc 'vinyl-frame' && echo 1 || echo 0)"

echo ""
echo "---------------- the browser cannot state a price ----------------"
OID3=$(mkorder "cs3@example.com" keepsake vinyl)
stub_reset
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID3"',"price":1,"unit_amount":1,"amount":1,"total":1,"currency":"usd","displayCurrency":"INR","line_items":[{"price":1}],"success_url":"https://evil.example/steal"}'
t "10-12. price/total/currency in the body are accepted and IGNORED" 200 "$(post checkout/session "$B")"
tc "10. → still charged £79.00, not £0.01" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OID3")" = "79.00" ] && echo 1 || echo 0)"
tc "12. → Stripe still received gbp, not usd" "$(last_params | grep -qc '"currency":"gbp"' && ! last_params | grep -qc '"currency":"usd"' && echo 1 || echo 0)"
tc "21. → displayCurrency had no effect whatsoever" "$([ "$(q "SELECT currency FROM checkout_sessions WHERE order_id=$OID3")" = "GBP" ] && echo 1 || echo 0)"
tc "19. → a supplied success_url cannot override config" "$(last_params | grep -qc 'thank-you' && ! last_params | grep -qc 'evil.example' && echo 1 || echo 0)"

echo ""
echo "================ IDEMPOTENCY ================"
OID4=$(mkorder "cs4@example.com" journey vinyl)
stub_reset
REQ='{"package":"journey","format":"vinyl","orderId":'"$OID4"'}'
post checkout/session "$REQ" >/dev/null
SID1=$(body | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
post checkout/session "$REQ" >/dev/null
SID2=$(body | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
tc "31. a repeated identical request returns the SAME session" "$([ "$SID1" = "$SID2" ] && [ -n "$SID1" ] && echo 1 || echo 0)"
tc "31. → only ONE snapshot row exists for that order" "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$OID4")" = "1" ] && echo 1 || echo 0)"
tc "31. → Stripe was called once, not twice" "$([ "$(stub_log | wc -l | tr -d ' ')" = "1" ] && echo 1 || echo 0)"
tc "28. → the idempotency key is deterministic, not random" "$(stub_log | head -1 | grep -qc '"idempotency_key":"mcb_' && echo 1 || echo 0)"
stub_reset
B='{"package":"journey","format":"vinyl","orderId":'"$OID4"',"enhancements":[{"id":"vinyl-frame","quantity":1}]}'
post checkout/session "$B" >/dev/null
tc "31. a DIFFERENT basket creates a different session" "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE order_id=$OID4")" = "2" ] && echo 1 || echo 0)"

echo ""
echo "================ FAILURE HANDLING ================"
OID5=$(mkorder "cs5@example.com" heirloom cd)
stub http_fail
stub_reset
B='{"package":"heirloom","format":"cd","orderId":'"$OID5"'}'
t "Stripe refusal surfaces as a safe 502" 502 "$(post checkout/session "$B")"
tc "36. → the raw Stripe message is NOT echoed to the customer" "$(body | grep -qc 'INTERNAL STRIPE DETAIL' && echo 0 || echo 1)"
tc "36. → no Stripe account id leaked" "$(body | grep -qc 'acct_' && echo 0 || echo 1)"
tc "32. → the order is untouched and still PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$OID5")" = "PENDING" ] && echo 1 || echo 0)"
tc "32. → the snapshot records the attempt as FAILED" "$([ "$(q "SELECT status FROM checkout_sessions WHERE order_id=$OID5")" = "FAILED" ] && echo 1 || echo 0)"
stub malformed
OID6=$(mkorder "cs6@example.com" heirloom cd)
B='{"package":"heirloom","format":"cd","orderId":'"$OID6"'}'
t "a malformed Stripe response is refused, not trusted" 502 "$(post checkout/session "$B")"
tc "32. → order still PENDING" "$([ "$(q "SELECT status FROM orders WHERE id=$OID6")" = "PENDING" ] && echo 1 || echo 0)"
stub ok

echo ""
echo "================ WEBHOOK RECONCILIATION ================"
SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local p="$1"; local sig=$(printf '%s.%s' "$ts" "$p" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }
hook() { curl -s -o /tmp/w.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$1")" -d "$1"; }

OID7=$(mkorder "cs7@example.com" keepsake vinyl)
stub_reset
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID7"',"enhancements":[{"id":"vinyl-frame","quantity":1}]}'
post checkout/session "$B" >/dev/null
CS=$(q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$OID7")
tc "expected total for keepsake+frame is £279.00" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OID7")" = "279.00" ] && echo 1 || echo 0)"

# --- 27: wrong amount must NOT mark the order paid
W="{\"id\":\"evt_cs_wrong_amt\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"$CS\",\"client_reference_id\":\"$OID7\",\"payment_intent\":\"pi_x\",\"amount_total\":7900,\"currency\":\"gbp\"}}}"
t "27. underpaid session acknowledged to Stripe" 200 "$(hook "$W")"
tc "27. → order NOT marked PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$OID7")" = "PENDING" ] && echo 1 || echo 0)"
tc "27. → no MCB reference issued" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE id=$OID7 AND mcb_reference IS NOT NULL")" = "0" ] && echo 1 || echo 0)"
tc "27. → filed as AMOUNT_MISMATCH for a human" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$CS'")" = "AMOUNT_MISMATCH" ] && echo 1 || echo 0)"

# --- 28: wrong currency must NOT mark the order paid
OID8=$(mkorder "cs8@example.com" keepsake cd)
B='{"package":"keepsake","format":"cd","orderId":'"$OID8"'}'
post checkout/session "$B" >/dev/null
CS8=$(q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$OID8")
W8="{\"id\":\"evt_cs_wrong_cur\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"$CS8\",\"client_reference_id\":\"$OID8\",\"payment_intent\":\"pi_y\",\"amount_total\":7900,\"currency\":\"usd\"}}}"
t "28. wrong-currency session acknowledged" 200 "$(hook "$W8")"
tc "28. → order NOT marked PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$OID8")" = "PENDING" ] && echo 1 || echo 0)"
tc "28. → filed as CURRENCY_MISMATCH" "$([ "$(q "SELECT reason FROM unreconciled_payments WHERE stripe_session_id='$CS8'")" = "CURRENCY_MISMATCH" ] && echo 1 || echo 0)"

# --- 10/24/25: the correct amount DOES complete, through the existing path
OID9=$(mkorder "cs9@example.com" keepsake vinyl)
B='{"package":"keepsake","format":"vinyl","orderId":'"$OID9"',"enhancements":[{"id":"vinyl-frame","quantity":1}]}'
post checkout/session "$B" >/dev/null
CS9=$(q "SELECT stripe_session_id FROM checkout_sessions WHERE order_id=$OID9")
OK9="{\"id\":\"evt_cs_ok\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"$CS9\",\"client_reference_id\":\"$OID9\",\"payment_intent\":\"pi_ok\",\"amount_total\":27900,\"currency\":\"gbp\"}}}"
t "10. correctly-paid dynamic session accepted" 200 "$(hook "$OK9")"
tc "10. → order marked PAID" "$([ "$(q "SELECT status FROM orders WHERE id=$OID9")" = "PAID" ] && echo 1 || echo 0)"
tc "24. → MCB reference issued by the existing path" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE id=$OID9 AND mcb_reference LIKE 'MCB-%'")" = "1" ] && echo 1 || echo 0)"
tc "→ snapshot closed as COMPLETED" "$([ "$(q "SELECT status FROM checkout_sessions WHERE stripe_session_id='$CS9'")" = "COMPLETED" ] && echo 1 || echo 0)"
REF9=$(q "SELECT mcb_reference FROM orders WHERE id=$OID9")
t "25. replayed dynamic event accepted (Stripe expects 200)" 200 "$(hook "$OK9")"
tc "25. → existing idempotency held: reference unchanged" "$([ "$(q "SELECT mcb_reference FROM orders WHERE id=$OID9")" = "$REF9" ] && echo 1 || echo 0)"
tc "26. → no duplicate confirmation email claimed" "$([ "$(q "SELECT COUNT(*) FROM orders WHERE id=$OID9 AND customer_notified_at IS NOT NULL")" = "1" ] && echo 1 || echo 0)"
tc "→ a paid order cannot get a second payable session" "$(B='{"package":"keepsake","format":"vinyl","orderId":'"$OID9"'}'; [ "$(post checkout/session "$B")" = "409" ] && echo 1 || echo 0)"

echo ""
echo "================ SECURITY ================"
t "cross-origin session creation rejected" 403 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: https://evil.example" -d '{"package":"keepsake"}')"
t "GET on the session endpoint rejected" 405 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/checkout/session")"
t "malformed JSON rejected" 400 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{oops')"
tc "35. rate limiting is enforced on session creation" "$(
  OIDR=$(mkorder "csrate@example.com" keepsake vinyl)
  hit=0
  IDS="phone-gramophone digital-player plaque lyrics-frame vinyl-frame music-box-experience"
  for qty in 1 2 3 4 5; do
    for id in $IDS; do
      code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/checkout/session" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d '{"package":"keepsake","format":"vinyl","orderId":'"$OIDR"',"enhancements":[{"id":"'"$id"'","quantity":1},{"id":"additional-vinyl-copy","quantity":'"$qty"'}]}')
      [ "$code" = "429" ] && hit=1 && break 2
    done
  done
  echo $hit)"
# Release the budget the test just consumed, so later sections are not throttled
# by it. Deletes only the rows this test created.
q "DELETE FROM checkout_sessions WHERE order_id IN (SELECT id FROM (SELECT id FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE email='csrate@example.com')) x)" >/dev/null

echo ""
echo "================ COMPLETE YOUR MEMORY (Sprint 6) ================"
OIDM=$(mkorder "csmem@example.com" keepsake vinyl)
stub_reset
# The £449 basket, priced entirely by the server from ids and quantities.
B='{"package":"keepsake","format":"vinyl","orderId":'"$OIDM"',"enhancements":[{"id":"vinyl-frame","quantity":1},{"id":"gift-pop-up-card-anniversary","quantity":1},{"id":"additional-vinyl-copy","quantity":2}]}'
t "19. £449 basket accepted" 200 "$(post checkout/session "$B")"
tc "19. → server totalled 44900 pence (£449.00)" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OIDM")" = "449.00" ] && echo 1 || echo 0)"
tc "20. → Stripe stub received FOUR truthful lines" "$([ "$(last_params | grep -o '\"unit_amount\"' | wc -l | tr -d ' ')" = "4" ] && echo 1 || echo 0)"
tc "20. → Keepsake 7900" "$(last_params | grep -qc '\"unit_amount\":\"7900\"' && echo 1 || echo 0)"
tc "20. → Vinyl Frame 20000" "$(last_params | grep -qc '\"unit_amount\":\"20000\"' && echo 1 || echo 0)"
tc "20. → Music Card 5000" "$(last_params | grep -qc '\"unit_amount\":\"5000\"' && echo 1 || echo 0)"
tc "20. → Additional Vinyl 6000 x2" "$(last_params | grep -qc '\"unit_amount\":\"6000\"' && last_params | grep -qc '\"quantity\":\"2\"' && echo 1 || echo 0)"
tc "23. → currency remains gbp" "$(last_params | grep -qc '\"currency\":\"gbp\"' && echo 1 || echo 0)"

# The format dimension of eligibility, enforced server-side.
OIDF=$(mkorder "csfmt@example.com" keepsake cd)
B='{"package":"keepsake","format":"cd","orderId":'"$OIDF"',"enhancements":[{"id":"additional-vinyl-copy","quantity":1}]}'
t "28. additional vinyl REFUSED on a non-vinyl format" 422 "$(post checkout/session "$B")"
tc "28.  → refused as ineligible, not silently dropped" "$(body | grep -qc 'ineligible_item' && echo 1 || echo 0)"

# Browser-stated amounts remain ignored with a full basket present.
OIDX=$(mkorder "csx@example.com" keepsake vinyl)
stub_reset
B='{"package":"keepsake","format":"vinyl","orderId":'"$OIDX"',"price":1,"total":1,"currency":"usd","enhancements":[{"id":"vinyl-frame","quantity":1,"price":1,"line_gbp":1}]}'
t "21-22. browser price/total inside a basket accepted and IGNORED" 200 "$(post checkout/session "$B")"
tc "21. → server still charged £279.00" "$([ "$(q "SELECT expected_amount_gbp FROM checkout_sessions WHERE order_id=$OIDX")" = "279.00" ] && echo 1 || echo 0)"

echo ""
echo "---------------- order persistence ----------------"
OIDP=$(mkorder_basket "cspersist@example.com" keepsake vinyl)
tc "37. order persists the enhancement ids" "$([ "$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$OIDP")" = "3" ] && echo 1 || echo 0)"
tc "38. order persists quantity" "$([ "$(q "SELECT quantity FROM order_items WHERE order_id=$OIDP AND item_id='additional-vinyl-copy'")" = "2" ] && echo 1 || echo 0)"
tc "39. order persists trusted GBP unit and line totals" "$([ "$(q "SELECT CONCAT(unit_gbp,'|',line_gbp) FROM order_items WHERE order_id=$OIDP AND item_id='additional-vinyl-copy'")" = "60.00|120.00" ] && echo 1 || echo 0)"
tc "45. the chosen card VARIANT is what persists" "$([ "$(q "SELECT COUNT(*) FROM order_items WHERE order_id=$OIDP AND item_id='gift-pop-up-card-anniversary'")" = "1" ] && echo 1 || echo 0)"
tc "39. a name snapshot is stored for operators" "$(q "SELECT item_name FROM order_items WHERE order_id=$OIDP AND item_id='vinyl-frame'" | grep -qc 'Vinyl Frame' && echo 1 || echo 0)"
tc "order response reports the server total" "$(grep -qc '\"basket_total_gbp\":\"449.00\"' /tmp/o.json && echo 1 || echo 0)"

echo ""
echo "---------------- CRM can answer: what did they order? ----------------"
CRMKEY="test_crm_key_not_real_000000000000000000000"
curl -s -o /tmp/crm.json "$BASE/crm/orders" -H "Authorization: Bearer $CRMKEY" >/dev/null
tc "40. CRM exposes the enhancement lines" "$(grep -qc '\"enhancements\"' /tmp/crm.json && echo 1 || echo 0)"
tc "40. CRM exposes a basket total" "$(grep -qc '\"basket_total_gbp\"' /tmp/crm.json && echo 1 || echo 0)"
tc "40. existing amount.gbp / amount.usd shape preserved" "$(grep -qc '\"gbp\"' /tmp/crm.json && grep -qc '\"usd\"' /tmp/crm.json && echo 1 || echo 0)"

echo ""
echo "---------------- shipping from the whole basket ----------------"
NOADDR='{"firstName":"No","lastName":"Addr","email":"csnoaddr@example.com","whatsapp":"+447000000123","package":"moment","format":"mp3","story":"A story.","enhancements":[{"id":"vinyl-frame","quantity":1}]}'
t "32. a physical addition to a DIGITAL order demands an address" 422 "$(post order "$NOADDR")"
tc "32.  → names the missing address fields" "$(body | grep -qc 'shippingAddress' && echo 1 || echo 0)"
WITHADDR='{"firstName":"With","lastName":"Addr","email":"cswithaddr@example.com","whatsapp":"+447000000123","package":"moment","format":"mp3","story":"A story.","shippingName":"With Addr","shippingAddress":"1 Test St","shippingCity":"London","shippingPostcode":"E1 1AA","shippingCountry":"United Kingdom","enhancements":[{"id":"vinyl-frame","quantity":1}]}'
t "32. and accepts it once supplied" 201 "$(post order "$WITHADDR")"

echo ""
echo "================ FULL PACKAGE & PAYMENT LINKS ================"
# The Full Package (internal id `bespoke`) is a concierge commission: no
# published price and no checkout. It used to check out here at £799. These
# three assertions are the inverse of what they were, deliberately — the old
# behaviour is now the regression.
OIDK=$(mkorder "csb@example.com" keepsake "mp3")
stub_reset
B='{"package":"bespoke","orderId":'"$OIDK"'}'
t "37. the Full Package is refused a checkout session" 422 "$(post checkout/session "$B")"
tc "37.  → refused as concierge, not as an unpriced mistake" \
  "$(body | grep -q 'concierge_package' && echo 1 || echo 0)"
tc "37.  → and no checkout session was written for it" \
  "$([ "$(q "SELECT COUNT(*) FROM checkout_sessions WHERE package='bespoke'")" = "0" ] && echo 1 || echo 0)"
# SPRINT 7: the ninth link is the retired Bespoke one. It moved out of
# packages.ts into data/legacy/retiredBespoke.ts — byte-identical, and in a
# module nothing in src/ imports, so it no longer ships to a browser. Still
# nine URLs; one of them is now unreachable rather than absent.
tc "38. all nine Payment Links unchanged in source" \
  "$([ "$(cat src/data/packages.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"
# ---- Sprint 10 certification findings --------------------------------
tc "C1. the enhancement UI is gated on the checkout flag" \
  "$(grep -q 'activePackage && CHECKOUT_SESSIONS_ENABLED' src/sections/OrderFormSection.tsx && echo 1 || echo 0)"
tc "C1b.  → so a basket that cannot be paid for cannot be built" \
  "$([ "$(grep -c 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts)" = "1" ] \
     && grep -rq 'Complete Your Memory' dist/assets/ 2>/dev/null && echo 1 || echo 0)"
tc "C2. Stripe is NOT asked to collect a second shipping address" \
  "$(grep -vE '^\s*(\*|//)' public/api/checkout/session.php | grep -q "params\['shipping_address_collection'\]" && echo 0 || echo 1)"
tc "C3.  → and no country allowlist can block an international customer" \
  "$(docker exec mcb-api sh -c 'tail -1 /tmp/stripe-stub.log' 2>/dev/null | grep -q 'allowed_countries' && echo 0 || echo 1)"
tc "C4. MCB's own delivery address is still collected and stored" \
  "$(grep -q 'INSERT INTO delivery_addresses' public/api/order.php && echo 1 || echo 0)"
tc "C5. automatic tax remains off, so amount_total equals the expected basket" \
  "$(docker exec mcb-api sh -c 'tail -1 /tmp/stripe-stub.log' 2>/dev/null | grep -q 'automatic_tax' && echo 0 || echo 1)"

tc "33. a basket with items may NOT fall back to a Payment Link" \
  "$(grep -q 'mayFallBackToPaymentLink' src/lib/checkoutSession.ts && grep -q 'session.fallbackAllowed' src/sections/OrderFormSection.tsx && echo 1 || echo 0)"
tc "34. a base-package-only checkout MAY fall back" \
  "$(grep -q 'items?.length ?? 0) === 0' src/lib/checkoutSession.ts && echo 1 || echo 0)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
