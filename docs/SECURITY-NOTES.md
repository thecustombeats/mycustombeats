# Security notes — release candidate (Sprint 6)

14–15 September 2026 · Not deployed.

## 1. Endpoint protection matrix

| Endpoint | Method | Protection |
|---|---|---|
| `order`, `order-quote`, `order-status`, `order-upload`, `checkout/session` | POST | same-origin; rate-limited; checkout token for existing orders |
| `order-approval` (retired: answers identically, writes nothing), `order-progress`, `order-support`, `order-evidence` | POST | same-origin; rate-limited; 256-bit HMAC link token (hashed, expiring, revocable, purpose-scoped) |
| `concierge/enquiry`, `live/enquiry`, `affiliate/click`, `affiliate/register` | POST | same-origin; rate-limited; server-side validation |
| `order-reference` | GET | Stripe session-id shape check; rate-limited |
| `affiliate/dashboard` | GET | signed dashboard token; rate-limited (Sprint 6) |
| `referral/check`, `checkout/status`, `fx/rates` | GET | public, no personal data; referral check rate-limited |
| `stripe/webhook` | POST | Stripe signature with tolerance; event idempotency; exact amount/currency/mode matching |
| `crm/creative`, `crm/creative-file` | GET/POST | CRM key; a staff name on every read (creative_access_log); objects checked against the order named (another order's ids → 404); audio in private storage only |
| `crm/production-files`, `crm/artwork` | GET/POST | CRM key; staff name on every read and download (logged); cross-order ids refused; production files in private storage; supplier data, links and costs only in these staff responses — never public, never in notifications |
| `crm/fulfilment` | GET | CRM key; INTERNAL economics, routes, scorecards and health — never public, never in notifications; evidence downloads need a staff name and are audited |
| `crm/command-centre` | GET/POST | CRM key and staff name; no-store, noindex; read model only, plus the two quality decisions (audited: FOUNDER.QUALITY_REVIEWED); search text never recorded; list views carry safe names (first name + initial) and no story, photo, address or email |
| `crm/*` (all 21 endpoints) | GET/POST | CRM key (Bearer, constant-time compare); no browser cookie |
| `crm/notifications` | GET/POST | CRM key **or** the separate `notifications.worker_key`, which can do nothing else; claim tokens are one-time (stored as SHA-256) |
| `product-availability` | GET | public; catalogue identifiers only |
| `AUTHORISE_SUPPLIER_PURCHASE` (via `crm/order-action`) | POST | CRM key **and** the founder's own code (`password_verify` against a config hash); 5 refusals per order per 15 min → 429; refusals audited without the code. A notification deep link carries only `#order=…&action=…` and authorises nothing |

Proven by `tests/release-acceptance.sh`: every public write endpoint refuses GET (405) and a foreign `Origin` (403); every CRM endpoint refuses a missing or wrong key (401); private links cannot be opened by MCB reference or order number; wrong-token and unknown-order answers are identical; error bodies carry no stack trace, path or SQL.

## 2. Findings fixed in Sprint 6

| Finding | Risk | Fix |
|---|---|---|
| `page_view` sent `window.location.href` to Google Analytics | The private `#token` on `/approve` and `/your-order`, and `?session_id=` on `/thank-you`, would reach Google | GA bootstrap moved to `/analytics-init.js`: no GA at all on `/approve`, `/your-order`, `/operations`; every page_location and page_referrer reduced to origin + path (+ `utm_` only). Verified in Chrome: 0 Google requests on private pages; the Stripe session id never sent |
| No security headers on pages | Clickjacking, MIME sniffing, no script policy | CSP (no inline script), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP; API: `default-src 'none'; frame-ancestors 'none'`, `X-Frame-Options: DENY` |
| Private routes relied on page `<meta>` only | A crawler not running JavaScript saw no noindex | `X-Robots-Tag: noindex, nofollow` from Apache for private, transactional and API paths |
| Checkout redirect accepted any https URL | Defence in depth against a tampered response (open redirect) | Browser and server both accept only `https://checkout.stripe.com/` |
| Affiliate dashboard check unthrottled | Token guessing is infeasible, but unbounded load | 60 per 10 minutes per source |
| Inline GA script | Required `'unsafe-inline'` in CSP | Removed |

## 3. Content-Security-Policy

Enforced (not report-only) because every origin was inventoried from the code and the policy was exercised on all main pages in Chrome with zero violations other than Google Signals' regional `ga-audiences` pixel, which is blocked deliberately (advertising features have no consent basis).

Allowed third parties and why:

| Origin | Directive | Used by |
|---|---|---|
| `www.googletagmanager.com` | script, img, connect | GA4 gtag.js |
| `*.google-analytics.com`, `analytics.google.com`, `*.analytics.google.com`, `www.google.com`, `stats.g.doubleclick.net` | connect/img | GA4 collection endpoints |
| `fonts.googleapis.com`, `fonts.gstatic.com` | style, font, connect | Typography |
| `formspree.io` | connect | `/partners` enquiry form |
| `script.google.com`, `script.googleusercontent.com` | connect | `/affiliate` sign-up (Google Apps Script) |
| `new-form-project-54e58b.zapier.app` | connect | `/artists/apply` |
| `api.qrserver.com` | img | affiliate QR code image |
| `www.google.com/recaptcha/`, `www.gstatic.com/recaptcha/`, `recaptcha.google.com/recaptcha/` | script, frame | reCAPTCHA on `/artists/apply` |

`style-src` keeps `'unsafe-inline'` (UI libraries set inline styles; styles cannot execute code). `/luxury/` (an unlinked hospitality showcase using `images.unsplash.com`) has its own policy and is noindex.

## 4. HSTS

Prepared in `public/.htaccess`, **commented out**. Hostinger terminates TLS at a proxy and other mycustombeats.com hosts have not been verified. Enable `max-age=31536000` only after confirming HTTPS on every host; do not add `preload` without a deliberate decision.

## 5. Third-party and tracker inventory

| Service | Purpose | Data sent | Private pages |
|---|---|---|---|
| Google Analytics 4 | Page views and catalogue-derived commerce events — only after consent | Sanitised URL, catalogue SKUs/prices, MCB reference on purchase (from the server), device/IP as Google collects | Not loaded on `/approve`, `/your-order`, `/operations` |
| Google Fonts | Typography | IP address, user agent | Loaded (no customer data) |
| Stripe Checkout | Payment (redirect) | Order lines and amount; email entered at Stripe | Not on MCB pages |
| Formspree / Apps Script / Zapier | Partner, affiliate, artist forms | What those forms collect (not customer orders) | No |
| Calendly | Partner demo booking (new window) | Nothing until opened | No |
| api.qrserver.com | Affiliate QR image | The affiliate's own referral link | No |
| Resend (server) | Customer emails | Recipient, message; no story text | — |
| Make.com (server, optional) | Order-paid notice | Reference, lines, total | — |

**Apollo and LiveIntent are absent** (tests in `tests/order.test.mjs` and `tests/operations.test.mjs`). No analytics event carries story text, names, email, phone, address, feedback, tokens, Stripe session ids or photo data (`tests/release.test.mjs`).

Consent (Sprint 7): Google Analytics is not loaded, and sends nothing, until the visitor chooses "Accept analytics cookies"; rejecting is equally prominent and the choice can be changed from "Cookie settings" in the footer. reCAPTCHA loads only on `/artists/apply` (anti-abuse for that form); Google Fonts load for every visitor (no cookies; IP address visible to Google). Whether any of these need consent under current UK law is recorded as a legal question in `docs/FOUNDER-DECISIONS-PACK.md`.

## 6. Unchanged guarantees (re-verified)

Uploads fail closed and live outside the web root; webhook signature/idempotency/amount matching; Adaptive Pricing off; live checkout off (`checkout_sessions_enabled` and `live_checkout_approved` false in `config.example.php`); secrets only in server config; fail-closed token secret.

## Fulfilment Controller (15 September 2026)

- **No spending path.** Nothing buys, pays, refunds, books a courier or checks out. Supplier orders are placed by a person after Bella or Lewis authorises with their own code; a notification link only opens the page.
- **No payment credentials.** Supplier order references, confirmation references, notes and exception detail are refused if they contain a Luhn-valid card number or a security-code phrase. No column holds card data.
- **Server-only commercial data.** Supplier routes, expected costs and internal allowances live in `api/data/supplier-routes.json` on the server (403 over HTTP, never committed). Economics appear only in CRM responses.
- **Support evidence.** `order-evidence` is same-origin, rate-limited (20/hour), token-scoped to the order's own non-question report, images identified by their bytes (polyglots refused), stored outside the web root with random names (0600). Videos are never uploaded, only described.
- **Founder-only resolutions** (partial delivery, substitution, refund handled by a founder, proceed at the paid price) use the same founder code check, refusal audit and lockout as purchase authorisation.

## Founder Command Centre (15 September 2026)

- `/command-centre` is a standalone staff page (no site layout, so no consent banner or analytics loader); it is in the analytics private-path rule, robots.txt `Disallow`, and the `X-Robots-Tag: noindex` and `Referrer-Policy: no-referrer` header rules.
- The CRM key lives in the tab's memory only. Deep links (`#view=…&order=MCB-…&open=…`) choose what to show and are validated; they never carry a credential or perform an action.
- Private files (song, artwork, source photographs) are fetched with the key into memory (blob URLs); their existing endpoints audit the access.
- No money moves from the Command Centre: supplier authorisation and founder-only resolutions go through `crm/order-action` with the founder's own code, as before.

