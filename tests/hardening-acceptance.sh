#!/bin/bash
# MCB FINAL RELEASE HARDENING — acceptance tests.
#
# Runs against the same throwaway PHP + MariaDB containers as the other
# suites. See tests/README.md.
#
# WHAT IS BEING PROVED, IN ONE LINE: the thank-you page cannot claim a payment
# the server has not confirmed, the concierge page has a title, it is
# discoverable, and the order endpoint can no longer be flooded.
#
# NOTHING HERE REACHES STRIPE. The one paid order below is created by posting a
# locally signed webhook to MCB's own endpoint, exactly as the other suites do.

BASE=http://localhost:8080/api
ORIGIN=http://localhost:8080
PASS=0; FAIL=0
declare -a FAILED

t() { local name="$1" exp="$2" got="$3"
  if [ "$exp" = "$got" ]; then printf "  PASS  %-66s [%s]\n" "$name" "$got"; PASS=$((PASS+1));
  else printf "  FAIL  %-66s [expected %s, got %s]\n" "$name" "$exp" "$got"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }
tc() { local name="$1" ok="$2"
  if [ "$ok" = "1" ]; then printf "  PASS  %-66s\n" "$name"; PASS=$((PASS+1));
  else printf "  FAIL  %-66s\n" "$name"; FAIL=$((FAIL+1)); FAILED+=("$name"); fi }

CONSENT='"consents":{"TERMS":true,"SERVICE_START":true,"DIGITAL_CONTENT":true},"termsVersion":"2026-09-09.4","cruiseCompanions":"My husband David"'

post_raw() { curl -s -o /tmp/hd.json -w '%{http_code}' -X POST "$BASE/$1" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$2"; }
get()  { curl -s -o /tmp/hd.json -w '%{http_code}' "$BASE/$1"; }
body() { cat /tmp/hd.json; }
q() { docker exec mcb-db mariadb -umcb -ptestpass -N -B -e "$1" mcb_crm 2>/dev/null; }
release_order_limit() { q "UPDATE order_consents SET ip_hash = NULL" >/dev/null 2>&1; }
post() { [ "$1" = "order" ] && release_order_limit; post_raw "$1" "$2"; }

SECRET=whsec_test_secret_for_local_verification
sign() { local ts=$(date +%s); local sig=$(printf '%s.%s' "$ts" "$1" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/.*= *//'); echo "t=$ts,v1=$sig"; }

# `prose` strips comment lines, so an assertion about what a FILE SAYS is not
# satisfied by a comment explaining what it used to say. Borrowed from
# delivery-acceptance.sh, and needed here for exactly that reason: this closure
# documents the old wording in comments while removing it from the page.
# POSIX character classes, not \s: BSD grep does not honour \s in a basic
# regular expression, so the sibling suites' `\s` form silently keeps every
# comment line on macOS. It matters here because this file's own comments quote
# the wording being asserted absent.
prose() { grep -hv '^[[:space:]]*\*' "$@" | grep -v '^[[:space:]]*//' | grep -v '^[[:space:]]*/\*'; }

TY=src/pages/ThankYou.tsx

echo "================ 1. THANK YOU — A PAYMENT MAY ONLY BE CLAIMED BY THE SERVER ================"

tc "1. the page has an explicit four-state verification type" \
  "$(grep -q 'type Verification = "NO_SESSION" | "PENDING" | "VERIFIED" | "UNVERIFIED"' $TY && echo 1 || echo 0)"

tc "2. VERIFIED is reachable only through a reference the server returned" \
  "$(grep -A6 'const verification: Verification' $TY | grep -q '? "VERIFIED"' \
     && grep -A6 'const verification: Verification' $TY | grep -q ': reference' && echo 1 || echo 0)"

tc "3. a fabricated session cannot reach VERIFIED — no timeout fallback to success" \
  "$(grep -A8 'const verification: Verification' $TY | grep -q 'lookupFinished' \
     && grep -A8 'const verification: Verification' $TY | grep -q '"UNVERIFIED"' && echo 1 || echo 0)"

tc "4. 'Payment confirmed' is rendered inside a VERIFIED guard and nowhere else" \
  "$([ "$(prose $TY | grep -c 'Payment confirmed')" = "1" ] \
     && grep -B4 'Payment confirmed' $TY | grep -q 'verification === "VERIFIED" &&' && echo 1 || echo 0)"

tc "5. the false-success sentence is gone from the source" \
  "$(prose $TY | grep -q 'Your payment is complete and' && echo 0 || echo 1)"

# The chunks index.html actually references — a stale file left in dist/assets
# by an earlier build is not shipped and must not answer for what is.
LIVE_CHUNKS=$(grep -oE '/assets/[A-Za-z0-9._-]+\.(js|css)' dist/index.html | sed 's|^/|dist/|' | sort -u)
ENTRY=$(printf '%s\n' $LIVE_CHUNKS | grep -E 'index-.*\.js$' | head -1)

tc "6. the false-success sentence is gone from the shipped entry chunk" \
  "$(grep -q 'Your payment is complete and nothing is outstanding' "$ENTRY" && echo 0 || echo 1)"

ROWS=$(grep -c '<DetailRow' $TY)
AMOUNT_ROW=$(grep -cE '<DetailRow label="[^"]*[Aa]mount' $TY)
tc "7. no amount row is rendered, and the one remaining row is the payment status" \
  "$([ "$AMOUNT_ROW" = "0" ] && [ "$ROWS" = "1" ] \
     && grep -q '<DetailRow label="Payment" value="Paid" />' $TY && echo 1 || echo 0)"

tc "8. the amountPaid derivation is gone" \
  "$(grep -q 'amountPaid' $TY && echo 0 || echo 1)"

tc "9. no amount is claimed anywhere in the shipped entry chunk" \
  "$(grep -q 'Amount paid' "$ENTRY" && echo 0 || echo 1)"

tc "10. the page never reads last_order_format" \
  "$(prose $TY | grep -q 'last_order_format' && echo 0 || echo 1)"

tc "11. last_order_package survives for analytics only, and is never rendered" \
  "$([ "$(prose $TY | grep -c 'last_order_package')" = "1" ] \
     && grep -q 'const analyticsPackage = getPackage(readLocal("last_order_package")' $TY && echo 1 || echo 0)"

tc "12. no package name, format or delivery line is rendered from the browser" \
  "$(grep -qE 'orderedPackage|orderedFormat|formatName' $TY && echo 0 || echo 1)"

tc "13. FORMATS is no longer imported — nothing maps a stored format to a name" \
  "$(grep -q 'FORMATS' $TY && echo 0 || echo 1)"

tc "14. the analytics purchase event fires only for a VERIFIED payment" \
  "$(grep -A2 'useEffect(() => {' $TY | grep -q 'verification !== "VERIFIED"' && echo 1 || echo 0)"

tc "15. the payment row, where shown, is the server's own status" \
  "$(grep -B2 'DetailRow label="Payment"' $TY | grep -q 'orderStatus === "PAID"' && echo 1 || echo 0)"

tc "16. a 400 from the lookup stops retrying instead of implying delivery" \
  "$(grep -A2 'response.status === 400' $TY | grep -q 'setLookupFinished(true)' && echo 1 || echo 0)"

tc "17. the pending state says verifying, not confirmed" \
  "$(grep -q 'Your order is being verified' $TY \
     && grep -q 'Confirming your payment and issuing your reference' $TY && echo 1 || echo 0)"

tc "18. the unverified state says so plainly" \
  "$(grep -q "We couldn't verify this payment reference" $TY && echo 1 || echo 0)"

tc "19. the unverified state stays non-alarming and keeps the customer moving" \
  "$(grep -q 'there is\s*$' $TY && grep -q 'nothing for you to pay again' $TY \
     && grep -q 'confirm your order by hand' $TY && echo 1 || echo 0)"

tc "20. a remembered reference is still labelled as device-local" \
  "$(grep -q 'This is the most recent reference issued on this device' $TY && echo 1 || echo 0)"

tc "21. a remembered reference is refused whenever a session id is present" \
  "$(grep -q 'sessionId ? null : readLocal(STORED_REFERENCE_KEY)' $TY && echo 1 || echo 0)"

tc "22. localStorage access cannot throw the page down" \
  "$(grep -q 'const readLocal = (key: string): string | null' $TY && echo 1 || echo 0)"

echo ""
echo "---------------- the server contract the page now depends on ----------------"

# A well-formed but fabricated session id. This is the exact shape Stripe
# issues, so it passes the endpoint's regex and reaches the query — which is
# what made the old page claim a payment for it.
FAKE=cs_live_fabricated0000000000000000000000
S=$(get "order-reference?session_id=$FAKE")
t  "23. a fabricated but well-formed session id is answered, not errored" 200 "$S"
tc "24.   → and carries NO reference, so VERIFIED is unreachable" \
  "$(body | grep -q '"reference":null' && echo 1 || echo 0)"
tc "25.   → and carries no status" \
  "$(body | grep -q '"status":null' && echo 1 || echo 0)"
tc "26.   → and no amount, package or format is disclosed at all" \
  "$(body | grep -qiE '"amount|"package|"format|"gbp' && echo 0 || echo 1)"

S=$(get "order-reference?session_id=not_a_session")
t  "27. a malformed session id is refused outright" 400 "$S"
tc "28.   → with the code the page uses to stop retrying" \
  "$(body | grep -q '"error":"invalid_session"' && echo 1 || echo 0)"

# ---- and the VERIFIED path must still be reachable for a real payment ----
OID=$(post order "{$CONSENT,\"firstName\":\"Hard\",\"lastName\":\"Ening\",\"email\":\"hd-verified@example.com\",\"package\":\"moment\",\"format\":\"mp3\",\"story\":\"A song for the closure test.\"}" >/dev/null; body | sed -n 's/.*"order_id":\([0-9]*\).*/\1/p')
tc "29. an order is created for the verified-path check" "$([ -n "$OID" ] && echo 1 || echo 0)"

SID="cs_live_hardening$OID"
q "UPDATE orders SET stripe_session_id='$SID' WHERE id=$OID" >/dev/null
W="{\"id\":\"evt_hd_$OID\",\"type\":\"checkout.session.completed\",\"data\":{\"object\":{\"id\":\"$SID\",\"client_reference_id\":\"$OID\",\"payment_intent\":\"pi_hd_$OID\",\"amount_total\":1000,\"currency\":\"gbp\"}}}"
SW=$(curl -s -o /tmp/hd.json -w '%{http_code}' -X POST "$BASE/stripe/webhook" -H "Content-Type: application/json" -H "Stripe-Signature: $(sign "$W")" -d "$W")
t  "30. the signed webhook is accepted" 200 "$SW"
tc "31.   → the order is PAID on MCB's own record" \
  "$([ "$(q "SELECT status FROM orders WHERE id=$OID")" = "PAID" ] && echo 1 || echo 0)"

S=$(get "order-reference?session_id=$SID")
t  "32. the verified path returns 200 for a genuinely paid session" 200 "$S"
tc "33.   → and DOES carry the server-issued reference" \
  "$(body | grep -qE '"reference":"MCB-[0-9]{4}-[0-9]{6}"' && echo 1 || echo 0)"
tc "34.   → and reports the status as PAID" \
  "$(body | grep -q '"status":"PAID"' && echo 1 || echo 0)"
tc "35.   → so VERIFIED is reachable by a real payment and only by one" \
  "$(body | grep -q '"reference":null' && echo 0 || echo 1)"
tc "36.   → and even a paid order discloses no amount to the browser" \
  "$(body | grep -qiE '"amount|"gbp' && echo 0 || echo 1)"

echo ""
echo "================ 2. FULL PACKAGE — THE PAGE HAS A TITLE ================"

FP=src/pages/FullPackage.tsx

tc "37. the title is a SINGLE string child, not an interpolated array" \
  "$(grep -q '<title>{`${name} | A Private Concierge Commission | My Custom Beats`}</title>' $FP && echo 1 || echo 0)"

tc "38. the old multi-child form is gone" \
  "$(grep -q '<title>{name} |' $FP && echo 0 || echo 1)"

tc "39. the package name still comes from the commercial data" \
  "$(grep -q 'const name = CONCIERGE_PACKAGE?.name ?? "The Full Package"' $FP && echo 1 || echo 0)"

tc "40. the composed title ships in the built chunk" \
  "$(grep -rq 'A Private Concierge Commission | My Custom Beats' dist/assets/ 2>/dev/null && echo 1 || echo 0)"

tc "41. the title fix introduced no price" \
  "$(prose $FP | grep -q '799' && echo 0 || echo 1)"

tc "42. the page is still a concierge commission, not a priced product" \
  "$(grep -q 'commercialModel: "CONCIERGE"' src/data/packages.ts && echo 1 || echo 0)"

tc "43. no Offer is emitted for it" \
  "$(grep -q 'if (!pkg.price) return null;' src/data/packages.ts && echo 1 || echo 0)"

echo ""
echo "================ 3. SITEMAP — THE CONCIERGE PAGE IS DISCOVERABLE ================"

SM=public/sitemap.xml

tc "44. /full-package is in the sitemap" \
  "$(grep -q '<loc>https://www.mycustombeats.com/full-package</loc>' $SM && echo 1 || echo 0)"

tc "45.   → exactly once" \
  "$([ "$(grep -c '<loc>https://www.mycustombeats.com/full-package</loc>' $SM)" = "1" ] && echo 1 || echo 0)"

tc "46. it is a real route, not a URL that would 404 client-side" \
  "$(grep -q 'path="/full-package"' src/App.tsx && echo 1 || echo 0)"

tc "47. its canonical host matches every other entry" \
  "$([ "$(grep -c '<loc>https://www.mycustombeats.com/' $SM)" = "$(grep -c '<loc>' $SM)" ] && echo 1 || echo 0)"

LOCS_ALL=$(grep -o '<loc>[^<]*</loc>' $SM | wc -l | tr -d ' ')
LOCS_UNIQ=$(grep -o '<loc>[^<]*</loc>' $SM | sort -u | wc -l | tr -d ' ')
tc "48. every sitemap location is unique" \
  "$([ "$LOCS_ALL" = "$LOCS_UNIQ" ] && echo 1 || echo 0)"

XMLOK=$(python3 -c 'import xml.dom.minidom,sys; xml.dom.minidom.parse(sys.argv[1]); print(1)' $SM 2>/dev/null || echo 0)
tc "49. the sitemap is still well-formed XML" "$XMLOK"

tc "50. no retired Bespoke URL was introduced" \
  "$(grep -qi 'bespoke' $SM && echo 0 || echo 1)"

tc "51. customer-specific pages are still excluded" \
  "$(grep -q 'thank-you' $SM && echo 0 || echo 1)"

tc "52. robots.txt still disallows them" \
  "$(grep -q 'Disallow: /thank-you' public/robots.txt && echo 1 || echo 0)"

DIST_FP=$(grep -c 'mycustombeats.com/full-package' dist/sitemap.xml)
tc "53. the deployable copy carries the same entry" \
  "$([ "$DIST_FP" = "1" ] && echo 1 || echo 0)"

echo ""
echo "================ 4. ORDER ENDPOINT — RATE LIMITED ================"

LIMIT_CALL=$(grep -c "enforce_rate_limit('order_consents', 'ip_hash', hash_ip(client_ip()), 10, 3600);" public/api/order.php)
tc "54. the order endpoint uses the SHARED limiter, at ten an hour" \
  "$([ "$LIMIT_CALL" = "1" ] && echo 1 || echo 0)"

LIMIT_DEFS=$(grep -rl 'function enforce_rate_limit' public/api/ | wc -l | tr -d ' ')
tc "55. there is still exactly one limiter implementation in the codebase" \
  "$([ "$LIMIT_DEFS" = "1" ] && echo 1 || echo 0)"

LIMIT_LINE=$(grep -n 'enforce_rate_limit' public/api/order.php | tail -1 | cut -d: -f1)
BODY_LINE=$(grep -n 'read_json_body' public/api/order.php | head -1 | cut -d: -f1)
tc "56. the limit is checked before any request data is read" \
  "$([ "$LIMIT_LINE" -lt "$BODY_LINE" ] && echo 1 || echo 0)"

MIGRATIONS=$(ls db/migrations/ | wc -l | tr -d ' ')
tc "57. no migration was needed to support it — order_consents already had the hash" \
  "$([ "$MIGRATIONS" = "7" ] && grep -q 'ip_hash' db/schema.sql && echo 1 || echo 0)"

# ---- the limiter actually fires -------------------------------------------
# `post_raw` deliberately does NOT release the attribution, so this burst is
# counted the way a real flood would be.
BURST_BODY="{$CONSENT,\"firstName\":\"Burst\",\"lastName\":\"Test\",\"email\":\"hd-retry@example.com\",\"package\":\"moment\",\"format\":\"mp3\",\"story\":\"Retry header check for the limiter.\"}"
GENUINE_BODY="{$CONSENT,\"firstName\":\"Genuine\",\"lastName\":\"Customer\",\"email\":\"hd-genuine@example.com\",\"package\":\"moment\",\"format\":\"mp3\",\"story\":\"An ordinary order after the burst.\"}"

release_order_limit
LAST=""; ACCEPTED=0
for i in $(seq 1 14); do
  CODE=$(post_raw order "{$CONSENT,\"firstName\":\"Burst\",\"lastName\":\"Test\",\"email\":\"hd-burst$i@example.com\",\"package\":\"moment\",\"format\":\"mp3\",\"story\":\"Flood attempt number $i for the limiter.\"}")
  LAST="$CODE"
  [ "$CODE" = "201" ] && ACCEPTED=$((ACCEPTED+1))
  [ "$CODE" = "429" ] && break
done
tc "58. an unthrottled burst is eventually refused" "$([ "$LAST" = "429" ] && echo 1 || echo 0)"
tc "59.   → and the refusal came only after the approved allowance of ten" \
  "$([ "$ACCEPTED" = "10" ] && echo 1 || echo 0)"
tc "60.   → with the shared, non-specific rate-limit body" \
  "$(body | grep -q 'rate_limited' && echo 1 || echo 0)"
tc "61.   → and no infrastructure detail in the message" \
  "$(body | grep -qiE 'order_consents|ip_hash|mariadb|localhost|column|table' && echo 0 || echo 1)"

RETRY_HDR=$(curl -s -D - -o /dev/null -X POST "$BASE/order" -H "Content-Type: application/json" -H "Origin: $ORIGIN" -d "$BURST_BODY" | grep -ci '^Retry-After:' | tr -d ' ')
tc "62.   → and Retry-After is advertised" "$([ "$RETRY_HDR" -ge "1" ] && echo 1 || echo 0)"

FLOODED=$(q "SELECT COUNT(*) FROM customers WHERE email LIKE 'hd-burst%'")
tc "63.   → and the refused requests wrote nothing beyond the allowance" \
  "$([ "$FLOODED" = "10" ] && echo 1 || echo 0)"

release_order_limit
GENUINE=$(post_raw order "$GENUINE_BODY")
tc "64. genuine traffic is unaffected once the window has moved on" \
  "$([ "$GENUINE" = "201" ] && echo 1 || echo 0)"

echo ""
echo "================ 5. NOTHING ELSE MOVED ================"

tc "65. all nine Payment Link URLs are byte-identical and still nine" \
  "$([ "$(cat src/data/packages.ts src/data/legacy/retiredBespoke.ts | grep -c 'https://buy.stripe.com/')" = "9" ] && echo 1 || echo 0)"

tc "66. the retired Bespoke link is still unreachable from the bundle" \
  "$(grep -rq '5kQ8wO9vKcLR3KO3eabsc09' dist/assets/ 2>/dev/null && echo 0 || echo 1)"

tc "67. dynamic checkout is still OFF in the client" \
  "$(grep -q 'export const CHECKOUT_SESSIONS_ENABLED = false' src/lib/checkoutSession.ts && echo 1 || echo 0)"

tc "68. dynamic checkout is still OFF in the config template" \
  "$(grep -q "'checkout_sessions_enabled' => false" public/api/config.example.php && echo 1 || echo 0)"

tc "69. the Terms version is untouched" \
  "$(grep -q 'TERMS_VERSION = "2026-09-09.4"' src/data/legal/versions.ts && echo 1 || echo 0)"

tc "70. the Refund and Privacy versions are untouched" \
  "$(grep -q 'REFUND_POLICY_VERSION = "2026-09-09.4"' src/data/legal/versions.ts \
     && grep -q 'PRIVACY_POLICY_VERSION = "2026-09-09.3"' src/data/legal/versions.ts && echo 1 || echo 0)"

tc "71. the production stage lock is unchanged" \
  "$(grep -q "'CREATIVE','SONG_READY','AWAITING_APPROVAL'" db/schema.sql \
     && grep -q "'PRODUCTION_LOCKED','FULFILMENT','COMPLETED'" db/schema.sql && echo 1 || echo 0)"

tc "72. the webhook still refuses an unsigned event" \
  "$([ "$(post_raw stripe/webhook '{"type":"checkout.session.completed"}')" = "400" ] && echo 1 || echo 0)"

tc "73. the referral architecture is unchanged" \
  "$(grep -q 'REFERRAL_PARAM = "r"' src/data/referral.ts && grep -q 'MCB-R-' public/api/lib/referral.php && echo 1 || echo 0)"

tc "74. a referral code is still minted from the webhook alone" \
  "$([ "$(grep -rl 'ensure_customer_referral(' public/api/ | grep -v 'lib/referral.php' | wc -l | tr -d ' ')" = "1" ] \
     && grep -q 'ensure_customer_referral(' public/api/stripe/webhook.php && echo 1 || echo 0)"

tc "75. Resend behaviour is unchanged — the closure sends no mail" \
  "$(grep -rq 'resend\|notify_' src/pages/ThankYou.tsx && echo 0 || echo 1)"

tc "76. the review URL is still configuration and still empty" \
  "$(grep -A3 "'reviews'" public/api/config.example.php | grep -q "'url' => ''" && echo 1 || echo 0)"

tc "77. the seven pre-existing migrations are untouched" \
  "$([ "$(ls db/migrations/*.sql | wc -l | tr -d ' ')" = "7" ] \
     && [ -z "$(ls db/migrations/ | grep '2026-09-10')" ] && echo 1 || echo 0)"

tc "78. no Stripe secret in the built bundle" \
  "$(grep -rq 'sk_live_\|sk_test_' dist/assets/ 2>/dev/null && echo 0 || echo 1)"

tc "79. the cruise-companion field is still required server-side" \
  "$([ "$(grep -c "required('cruiseCompanions'" public/api/order.php)" -ge "1" ] && echo 1 || echo 0)"

echo ""
echo "=================================================="
echo "  PASSED: $PASS    FAILED: $FAIL"
if [ ${#FAILED[@]} -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; fi
echo "=================================================="
[ "$FAIL" = "0" ]
