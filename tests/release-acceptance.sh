#!/bin/bash
# MCB SPRINT 6 — SERVED SECURITY, INDEXING AND ENDPOINT PROTECTION.
#
# Same throwaway PHP + MariaDB stack as the other suites. The site's real
# public/.htaccess, public/robots.txt, public/catalogue.json and
# public/analytics-init.js are COPIED into the container's web root for the
# duration of this suite (with a placeholder index.html shell) so Apache
# serves them exactly as production would, then removed again.
#
# Proves: security headers on pages and API; X-Robots-Tag on private routes;
# trailing-slash, legacy-route and apex-host redirects; every public POST
# endpoint refuses other methods and foreign origins; every CRM endpoint
# refuses a missing or wrong key; private links cannot be looked up by
# reference; the affiliate dashboard check is rate limited; uploads stay
# private; the public catalogue carries public data only.

BASE=http://localhost:8080
ORIGIN=http://localhost:8080
CRMKEY="test_crm_key_not_real_000000000000000000000"
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
hdr() { curl -s -o /dev/null -D - "$@" | tr -d '\r'; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

WEB=/var/www/html
cleanup() { docker exec mcb-api sh -c "rm -f $WEB/.htaccess $WEB/index.html $WEB/robots.txt $WEB/catalogue.json $WEB/analytics-init.js"; }
trap cleanup EXIT
docker cp public/.htaccess mcb-api:$WEB/.htaccess
docker cp public/robots.txt mcb-api:$WEB/robots.txt
docker cp public/catalogue.json mcb-api:$WEB/catalogue.json
docker cp public/analytics-init.js mcb-api:$WEB/analytics-init.js
docker exec mcb-api sh -c "printf '<!doctype html><title>MCB</title><div id=root></div>' > $WEB/index.html"
sleep 1

# ===========================================================================
section "1. SECURITY HEADERS ON PAGES"
H=$(hdr "$BASE/")
tc "the homepage is served by the SPA shell" "$([ "$(code "$BASE/")" = 200 ] && echo 1 || echo 0)"
CSP=$(echo "$H" | grep -i '^Content-Security-Policy:' | head -1)
tc "Content-Security-Policy is sent" "$([ -n "$CSP" ] && echo 1 || echo 0)"
tc "  → scripts only from self and Google Analytics (no inline script allowed)" "$(echo "$CSP" | grep -q "script-src 'self' https://www.googletagmanager.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/;" && ! echo "$CSP" | grep -qE "script-src[^;]*unsafe-(inline|eval)" && echo 1 || echo 0)"
tc "  → no plugins, no base-tag hijack, framing only by itself" "$(echo "$CSP" | grep -q "object-src 'none'" && echo "$CSP" | grep -q "base-uri 'self'" && echo "$CSP" | grep -q "frame-ancestors 'self'" && echo 1 || echo 0)"
tc "X-Content-Type-Options nosniff" "$(echo "$H" | grep -qi '^X-Content-Type-Options: nosniff' && echo 1 || echo 0)"
tc "Referrer-Policy strict-origin-when-cross-origin" "$(echo "$H" | grep -qi '^Referrer-Policy: strict-origin-when-cross-origin' && echo 1 || echo 0)"
tc "X-Frame-Options SAMEORIGIN" "$(echo "$H" | grep -qi '^X-Frame-Options: SAMEORIGIN' && echo 1 || echo 0)"
tc "Permissions-Policy denies camera, microphone, geolocation, payment" "$(echo "$H" | grep -i '^Permissions-Policy:' | grep -q 'camera=(), microphone=(), geolocation=(), payment=()' && echo 1 || echo 0)"
tc "HSTS is NOT sent (prepared, awaiting production host verification)" "$(echo "$H" | grep -qi '^Strict-Transport-Security' && echo 0 || echo 1)"
tc "public pages are indexable (no X-Robots-Tag)" "$(for p in / /bespoke /keepsake /blog /blog/picture-disc-keepsakes-music-and-memories-you-can-hold /faq; do hdr "$BASE$p" | grep -qi '^X-Robots-Tag' && echo bad; done | grep -q bad && echo 0 || echo 1)"

section "2. PRIVATE ROUTES ARE NEVER INDEXED"
for p in /your-order /approve /operations /thank-you /dashboard /create /artist-thank-you; do
  tc "$p → X-Robots-Tag noindex, nofollow" "$(hdr "$BASE$p" | grep -qi '^X-Robots-Tag: noindex, nofollow' && echo 1 || echo 0)"
done
tc "/approve and /your-order send no Referer anywhere" "$(hdr "$BASE/approve" | grep -qi '^Referrer-Policy: no-referrer' && hdr "$BASE/your-order" | grep -qi '^Referrer-Policy: no-referrer' && echo 1 || echo 0)"
tc "robots.txt disallows private routes and the API" "$(curl -s "$BASE/robots.txt" | grep -q '^Disallow: /operations' && curl -s "$BASE/robots.txt" | grep -q '^Disallow: /api/' && curl -s "$BASE/robots.txt" | grep -q '^Disallow: /approve' && echo 1 || echo 0)"
tc "/luxury/ showcase is kept out of search" "$(hdr "$BASE/luxury/" | grep -qi '^X-Robots-Tag: noindex' && echo 1 || echo 0)"

section "3. ONE URL PER PAGE"
t "/bespoke/ → 301" 301 "$(code "$BASE/bespoke/")"
t "  → to /bespoke" "$BASE/bespoke" "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/bespoke/")"
t "/full-package → 301 /bespoke, attribution query kept" "$BASE/bespoke?ref=abc" "$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE/full-package?ref=abc")"
t "apex host → 301 to https://www." "https://www.mycustombeats.com/keepsake" "$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: mycustombeats.com' "$BASE/keepsake")"
t "a missing build asset is a real 404, not the HTML shell" 404 "$(code "$BASE/assets/does-not-exist.js")"

section "4. API RESPONSES"
AH=$(hdr -X POST "$BASE/api/order-status" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{}')
tc "API: Content-Security-Policy default-src 'none'; frame-ancestors 'none'" "$(echo "$AH" | grep -i '^Content-Security-Policy:' | tail -1 | grep -q "default-src 'none'; frame-ancestors 'none'" && echo 1 || echo 0)"
tc "API: X-Frame-Options DENY, X-Robots-Tag noindex, no-store, nosniff" "$(echo "$AH" | grep -qi '^X-Frame-Options: DENY' && echo "$AH" | grep -qi '^X-Robots-Tag: noindex' && echo "$AH" | grep -qi '^Cache-Control: no-store' && echo "$AH" | grep -qi '^X-Content-Type-Options: nosniff' && echo 1 || echo 0)"
tc "API: no CORS grant to any origin" "$(hdr "$BASE/api/checkout/status" -H 'Origin: https://evil.example' | grep -qi '^Access-Control-Allow-Origin' && echo 0 || echo 1)"
t "library files are not served" 403 "$(code "$BASE/api/lib/operations.php")"
t "generated server data is not served" 403 "$(code "$BASE/api/data/catalogue.json")"
t "config is not served" 403 "$(code "$BASE/api/config.php")"
t "the retired sandbox webhook does not exist" 404 "$(code "$BASE/api/stripe/webhook-test.php")"

section "5. PUBLIC WRITE ENDPOINTS: METHOD AND ORIGIN"
for ep in order order-quote order-status order-upload order-approval order-progress order-support checkout/session concierge/enquiry live/enquiry affiliate/click affiliate/register; do
  t "GET /api/$ep is refused" 405 "$(code "$BASE/api/$ep")"
  t "POST /api/$ep from a foreign origin is refused" 403 "$(code -X POST "$BASE/api/$ep" -H 'Content-Type: application/json' -H 'Origin: https://evil.example' -d '{}')"
done
t "the Stripe webhook refuses an unsigned event" 400 "$(code -X POST "$BASE/api/stripe/webhook" -H 'Content-Type: application/json' -d '{"id":"evt_x","type":"checkout.session.completed"}')"
t "the Stripe webhook refuses GET" 405 "$(code "$BASE/api/stripe/webhook")"

section "6. STAFF ENDPOINTS: CRM KEY"
for ep in "crm/operations?view=queue" "crm/automation-events" crm/orders crm/concierge crm/customer crm/preflight crm/unreconciled "crm/order-personalisation?order_id=1" "crm/upload?id=00000000000000000000000000000000"; do
  t "GET /api/$ep without a key" 401 "$(code "$BASE/api/$ep")"
  t "GET /api/$ep with a wrong key" 401 "$(code "$BASE/api/$ep" -H 'Authorization: Bearer wrong_key_000000000000000000000000000')"
done
for ep in crm/order-action crm/production crm/reconcile crm/review-request crm/operations; do
  t "POST /api/$ep without a key" 401 "$(code -X POST "$BASE/api/$ep" -H 'Content-Type: application/json' -d '{"order_id":1,"action":"ADD_NOTE","staff":"x","note":"x"}')"
done
t "a correct key opens the queue" 200 "$(code "$BASE/api/crm/operations?view=queue" -H "Authorization: Bearer $CRMKEY")"
t "automation events are read-only (POST refused)" 405 "$(code -X POST "$BASE/api/crm/automation-events" -H "Authorization: Bearer $CRMKEY")"

section "7. PRIVATE LINKS AND ENUMERATION"
t "order progress cannot be opened by MCB reference" 404 "$(code -X POST "$BASE/api/order-progress" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{"reference":"MCB-2026-000001","token":"MCB-2026-000001"}')"
t "approval cannot be opened by order number" 404 "$(code -X POST "$BASE/api/order-approval" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{"order_id":1,"token":"1"}')"
t "order status with a wrong checkout token is the same 404 as no order" "404|404" "$(code -X POST "$BASE/api/order-status" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{"orderId":1,"checkoutToken":"x"}')|$(code -X POST "$BASE/api/order-status" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{"orderId":999999,"checkoutToken":"x"}')"
t "order reference lookups require a real session id shape" 400 "$(code "$BASE/api/order-reference?session_id=1%27%20OR%201%3D1")"
q "DELETE FROM rate_limit_hits"
for i in $(seq 1 60); do code "$BASE/api/affiliate/dashboard" -H 'Authorization: Bearer 1.1.x' >/dev/null; done
t "the 61st affiliate dashboard check in 10 minutes is rate limited" 429 "$(code "$BASE/api/affiliate/dashboard" -H 'Authorization: Bearer 1.1.x')"
q "DELETE FROM rate_limit_hits"
tc "error responses carry no stack trace, path or SQL" "$(curl -s -X POST "$BASE/api/order" -H 'Content-Type: application/json' -H "Origin: $ORIGIN" -d '{not json' | grep -qiE 'stack|/var/www|SQLSTATE|PDO|\.php' && echo 0 || echo 1)"

section "8. UPLOADS STAY PRIVATE"
tc "no photo directory is reachable in the web root" "$([ "$(code "$BASE/api/storage/")" = 403 ] && [ "$(code "$BASE/api/storage/uploads/x")" = 403 ] && echo 1 || echo 0)"
tc "the upload endpoint refuses a request without an order token" "$(c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/order-upload" -H "Origin: $ORIGIN" -F orderId=1 -F checkoutToken=x -F slot=x); [ "$c" = 404 ] || [ "$c" = 422 ] && echo 1 || echo 0)"

section "9. PUBLIC CATALOGUE FEED"
t "/catalogue.json is served" 200 "$(code "$BASE/catalogue.json")"
FEED=$(curl -s "$BASE/catalogue.json")
tc "  → it is public commerce data only" "$(echo "$FEED" | python3 -c 'import json,sys;d=json.load(sys.stdin);s=json.dumps(d).replace("through Stripe Checkout","").lower();print(1 if d["ordering_rules"]["automated_ordering"] is False and not any(w in s for w in ["supplier","margin","wholesale","webhook","sk_test","sk_live","whsec","crm_api","database"]) else 0)')"
tc "  → prices match the server catalogue exactly" "$(echo "$FEED" | python3 -c 'import json,sys;f=json.load(sys.stdin);c=json.load(open("public/api/data/catalogue.json"))["skus"];print(1 if all(v["price"]["minor_units"]==c[v["sku"]]["price_minor"] for p in f["products"] for v in p["variants"]) else 0)')"
tc "  → Bespoke and MCB LIVE are quote-only with no price" "$(echo "$FEED" | python3 -c 'import json,sys;f={p["id"]:p for p in json.load(sys.stdin)["products"]};print(1 if all(f[i]["availability"]=="QUOTE_ONLY_BY_ENQUIRY" and f[i]["variants"]==[] for i in ("bespoke","mcb-live")) else 0)')"
tc "the analytics bootstrap is served and loads nothing on private pages" "$(curl -s "$BASE/analytics-init.js" | grep -q 'your-order|approve|operations' && echo 1 || echo 0)"

echo ""
echo "======================================================================"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "======================================================================"
if [ "$FAIL" -gt 0 ]; then printf '  - %s\n' "${FAILED[@]}"; exit 1; fi
