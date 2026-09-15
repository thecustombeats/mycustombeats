# MCB™ Security, Resilience & Automation Readiness

17 September 2026 · branch `mcb-release-candidate-20260914` · baseline `d352dbe3`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO SUPPLIER PURCHASE. NO REPLACEMENT PURCHASE. NO REFUND. NO SUBSCRIPTION. NO PAID API. NO MOZART CALL. NO SECRETS.**

This is a hardening sprint: the release candidate was attacked, verified and strengthened. **It is not a security certification.** Nothing here replaces an independent penetration test on the production host.

## 1. Founder decisions applied

| Decision | Applied |
|---|---|
| Business timezone | Europe/London |
| Moment / video prices | Moment £15; Memory Music Video £49; together £64; no video price test |
| Payment fees | Actual-first; UNKNOWN until recorded |
| Alert thresholds | Not configured |
| **Supplier route freshness** | **30 days** (`suppliers.json`); a server setting may change it. A verified route older than 30 days is STALE and needs reverifying; paid orders are never disabled |
| **New-sale safety** | **REQUIRED** by default (`suppliers.json`); only an explicit `fulfilment.new_sale_safety = ADVISORY` relaxes it. See §5 |
| **£1,000 gramophone** | Authorisation needs a person-recorded delivered cost, currency, availability confirmation, destination-support confirmation and supporting evidence (`route_authorisation_requirements`, migration 2026-09-17) |

## 2. Pop-up card correction

The previous release left the 18 cards as "founder data required". That was wrong: **the product data was already decided.**

All 18 are now catalogued as product `pop-up-card`:
- delivery class CARD;
- variants by design;
- no image until an approved one exists.

| # | Card | Price |
|---|---|---|
| 1 | Anniversary — Gold and White | £49.99 |
| 2 | Anniversary — Large | £69.99 |
| 3 | Birthday — Candles / Music | £49.99 |
| 4 | Birthday — Auto-Play Music | £19.99 |
| 5 | Wedding | £49.99 |
| 6 | Mother's Day — Flowers | £49.99 |
| 7 | Christmas — Christmas Tree | £49.99 |
| 8 | Birthday — Tropical Bird Cage | £49.99 |
| 9 | Halloween — Pumpkin Flowers | £49.99 |
| 10 | Thanksgiving — Flowers | £49.99 |
| 11 | Thank You — Flowers | £49.99 |
| 12 | Congratulations — Flowers | £49.99 |
| 13 | Valentine's Day — Love Tree / Hearts | £49.99 |
| 14 | Cruise / Voyage — Cruise Vessel | £49.99 |
| 15 | Multi Flower Pop-Up Card — Pack of 4 | £79.99 |
| 16 | Single Colour Flower Pop-Up Card — Pack of 4 | £79.99 |
| 17 | Four Colour Flower Pop-Up Card — Pack of 4 | £79.99 |
| 18 | Paper Flower Pop-Up Cards — Pack of 8 | £129.99 |

**Where cards appear:**
- the products page;
- "Everything here is optional" in the order form (added alongside a song experience);
- the public feed;
- the supplier registry.

**Product versus route:** PRODUCT data is known. ROUTE verification is separate and stays VERIFICATION_REQUIRED until evidenced. MCB confirms card delivery before payment (delivery class CARD). Only an appropriate alternative card may be substituted, recorded in full. The physical catalogue is 33 (6 vinyl, 5 frames, 18 cards, 3 gramophones, 1 plaque).

**Frames:** the five frame configurations stay VERIFICATION_REQUIRED; no partner match is invented.

## 3. Threat review

Each surface lists the threat, the control, the test that proves it (`security` = `tests/security-acceptance.sh`), the risk that remains, and the recommendation.

**Customer order links**
- **Threat:** guessing, swapping, replaying or leaking a link.
- **Control:** 43-character HMAC tokens in the URL fragment (never logged or sent as a referrer). They are hashed at rest, bound to one order and purpose, expire, can be revoked, and are rate limited (60 per 10 minutes).
- **Tests:** security §2 (changed, random, empty, expired, revoked and rate-limited tokens); operations, customer-care.
- **Remaining risk:** anyone holding a forwarded email link can see that order.
- **Recommendation:** keep link expiry. Offer "send me a new link" (already supported by staff reissue).

**Checkout tokens**
- **Threat:** using order A's token on order B.
- **Control:** HMAC of order id and idempotency hash, compared in constant time.
- **Tests:** security §2 (status, session, upload across orders).
- **Remaining risk:** none known.

**Staff CRM authentication**
- **Threat:** stolen or guessed key; no individual accounts.
- **Control:** a single 32+ character bearer key compared in constant time. **New:** failed attempts are throttled per address (429 after 100 in 10 minutes). The staff name is recorded on every action.
- **Tests:** security §1 (every staff endpoint refuses without the key on GET and POST; throttle; a real key still works).
- **Remaining risk:** a shared key, and a self-declared staff name, so there is no per-person revocation.
- **Recommendation:** before scaling the team, move to individual staff accounts (or put the Command Centre behind the host's authentication), keep the key out of browsers left unattended, and rotate it on any staff change.

**Founder financial authority**
- **Threat:** staff or automation authorising spend; forged founder; brute force.
- **Control:** Bella's and Lewis's own password-hashed codes with an explicit confirmation. Refusals are audited and limited to 5 per order per 15 minutes. **New:** a 15-per-15-minute limit across all orders. The founder recorded is the one the check returns.
- **Tests:** security §3, §8 and §11; no-money-automation 3a, 3b and 7.
- **Remaining risk:** a founder code typed on a compromised device.
- **Recommendation:** rotate the codes periodically; never share them in chat.

**Deep links**
- **Threat:** a link that performs an action.
- **Control:** links only choose what is shown. Actions are explicit POSTs with the key (and a code for money).
- **Tests:** security §3; command-centre and supplier-routing node tests.

**File uploads**
- **Threat:** scripts disguised as images, SVG/HTML, path traversal, oversize, corrupt files, cross-order uploads.
- **Control:**
  - **Content checks:** content signature (JPEG, PNG, WebP, HEIC); markup or PHP anywhere refused; `getimagesize` type match; dimension limits.
  - **Complete files (new):** a JPEG must reach its end-of-image marker after its scan; a PNG must have IEND; a WebP must match its RIFF length. Phone trailers are tolerated.
  - **Size:** 10 MB.
  - **Storage:** random 64-hex names outside the web root.
  - **Scope:** one current photo per memory; order token scope; refused once the order is paid.
- **Tests:** security §4.
- **Remaining risk:** **no malware scanning** (shown as NOT_PRESENT in readiness). HEIC is not decoded.
- **Recommendation:** add host-level antivirus scanning of the private upload directory, or a scanning service, before accepting high volume. Staff download photos as attachments only.

**Private media (songs, photos, artwork, production files, videos, evidence)**
- **Threat:** public URLs, indexing, caching, cross-order access.
- **Control:**
  - **Storage:** staff files are served only through keyed endpoints, as attachments with nosniff, a sandboxed CSP, no-store and no-referrer.
  - **Customer video:** 10-minute HMAC-signed URLs bound to order, master, expiry and disposition. Access is logged.
  - **Customer song:** delivered through the staff-set reveal URL.
  - **Web server:** `/api/lib`, `/api/data` and `/api/storage` are denied.
- **Tests:** security §2 (signed link manipulation) and §4 (download headers); video.
- **Remaining risk:** the reveal URL points wherever staff host the finished song.
- **Recommendation:** host songs privately (signed or unguessable) and never on a public listing.

**Stripe webhooks**
- **Threat:** forged, replayed, duplicate, reordered, late or underpaid events.
- **Control:** HMAC signature with a 300-second tolerance. Event, session and order claims are idempotent. Amount and currency are reconciled (underpayment goes to PAYMENT_REVIEW). Expired events never unpay an order.
- **Tests:** security §5; transaction; checkout; video (a late payment becomes a capacity exception).
- **Remaining risk:** live Stripe is not yet verified.
- **Recommendation:** make a small live payment once live checkout is approved.

**Emails**
- **Threat:** duplicates, silent failure, a false "sent".
- **Control:**
  - **Payment confirmation:** a conditional claim, released on failure.
  - **Lifecycle messages:** an order + type + dedupe key; FAILED rows are reclaimable.
  - **New:** unsent, failed and interrupted emails are surfaced, with idempotent retries for failures only.
- **Tests:** security §6.
- **Remaining risk:** an email interrupted after the provider accepted it may be re-sent if staff retry it manually, so it is marked "a person must check first".

**Founder notifications**
- **Threat:** a lost decision when the bridge or Telegram is down.
- **Control:** an outbox with dedupe keys, a staff queue fallback, and a safe retry. Telegram is shown as connected only after a confirmed delivery.
- **Tests:** security §6; automation.
- **Remaining risk:** Telegram delivery is not verified.
- **Recommendation:** run the bridge and confirm a delivery.

**Analytics**
- **Threat:** private content reaching Google Analytics.
- **Control:** no GA on private paths (`your-order`, `approve`, `operations`, `command-centre`). Safe URLs only (no fragment, no session id). Events carry no free text. **New:** the private-route CSP allows no analytics origin at all.
- **Tests:** customer-care, command-centre and security-resilience node tests.
- **Remaining risk:** consent is required for public-page analytics (existing banner).

**Customer support**
- **Threat:** cross-customer messages, spam, lost messages.
- **Control:** token-scoped cases, same-origin rule, rate limits (8 cases per hour, 20 messages per hour), every message kept, privacy flag.
- **Tests:** security §2 and §7; customer-care.

**Creative files, production files, video**
- **Threat:** a wrong order, template, SKU or hash; a corrupted master.
- **Control:** exact dimension, template, SKU, order and hash checks. Masters are protected (a failed attempt never replaces one). Packages are hashed. Rework keeps the original capacity.
- **Tests:** creative, production, full-package and video suites.

**Supplier commercial data**
- **Threat:** exposure of partners, costs or margins.
- **Control:** server-only route file (never committed). Staff-only views. Quotes carry product names only.
- **Tests:** supplier-routing; security §9.

**Command Centre, Business Intelligence, CSV exports**
- **Threat:** data exposure, formula injection, framing.
- **Control:** staff key, no-store, noindex. Formula-safe, audited CSV exports. **New:** private routes cannot be framed (`frame-ancestors 'none'`, `X-Frame-Options: DENY`).
- **Tests:** business; security-resilience.

**Database writes**
- **Threat:** SQL injection, orphans, races.
- **Control:** prepared statements throughout; foreign keys cascading from orders; unique keys (partner order reference, one upload per memory, one job per memory or entitlement, dedupe keys); locked transactions for state changes.
- **Tests:** security §7 (four-way founder authorisation, triple partner order, route decision, dispatch, QC and last-video-slot races) and §12 (integrity).

**Automation entry points**
- **Threat:** automation reaching money.
- **Control:** the permanent guard — the endpoint register, reviewed money actions, and recovery limited to idempotent work.
- **Tests:** no-money-automation (11 tests).

## 4. Authentication layers

| Layer | Holds | Can | Cannot |
|---|---|---|---|
| PUBLIC | nothing | browse, quote, place an order, see availability | read any order |
| CUSTOMER | one checkout token or one order link | their own order, uploads (before payment), support case, evidence, video | another order, any staff action |
| STAFF | the CRM key and a named person | operate, record, route, retry recoverable work | authorise a supplier purchase, decide a refund or remedy |
| FOUNDER FINANCIAL AUTHORITY | Bella's or Lewis's own code, as well as staff access | authorise supplier purchases, decide refunds and remedies | execute money: purchases are placed by a person; refunds are made in the Stripe dashboard |

Proven in security §1–§3 and §8, and no-money-automation 6–7.

## 5. REQUIRED new-sale safety

For each physical item of a NEW sale, the server checks the recorded evidence:

| Flag | Meaning |
|---|---|
| MISSING_ROUTE | No route recorded |
| DESTINATION_UNSUPPORTED | Proven by the routes |
| NEGATIVE_CONTRIBUTION | Price below the known expected direct cost |
| UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE | The recommended route is an unverified marketplace |
| ROUTE_NOT_VERIFIED | The recommended route is in the unverified group (new) |
| COMMERCIAL_DATA_MISSING | Expected cost unknown (new) |
| MANUFACTURING_DATA_MISSING | A blocking manufacturer specification is missing |

**Under REQUIRED:** any flag, or no route data at all, turns the delivery quote into "we confirm delivery before you pay". The customer is told the product names only.

**Always:**
- a route-proven unsupported destination is held, whatever the mode;
- digital products (Moment, Memory Music Video) are never affected;
- paid orders are never cancelled or re-priced.

**Rehearsed in security §9:**
- a verified Journey to GB proceeds;
- US is held;
- the Heart (dieline missing) is held;
- an unverified marketplace frame is held;
- Moment and Moment + video are unaffected;
- with no route data, physical is held and digital sells.

**Commercial impact (founder attention):** every picture-disc Keepsake currently lacks the manufacturer's disc pixel canvas, and the Heart and Gatefold lack their templates. Under REQUIRED, those products are confirmed by MCB before payment until the data is supplied. Journey 6 (complete sleeve templates) sells online once its route is verified.

## 6. Payments and orders

Proven in security §5, and in the transaction, checkout and video suites:
- **Duplicates:**
  - double submit with the same idempotency key returns the same order;
  - refreshing checkout creates no second order;
  - the same event twice gives one payment, one reference, one video space and one confirmation;
  - a different event for the same session changes nothing.
- **Bad events:**
  - a late "expired" event never unpays;
  - forged or replayed webhooks are refused;
  - an underpayment goes to payment review.
- **Recovery:**
  - a paid order whose hand-over was interrupted is surfaced and retried idempotently;
  - a payment after its video hold lapsed never oversells and is surfaced as a capacity exception.

The customer sees PAID once payment is recorded.

## 7. Failures, recovery and retries

**Failures needing attention** (`crm/system?view=failures`, Command Centre → System readiness). Every check shows the order reference, category, time, retry class and next action:
- **Order and payment:** paid order not handed to processing; payment confirmation not sent; payment confirmation uncertain.
- **Email and notifications:** customer email failed; customer email interrupted; founder notification undelivered; follow-up hooks missing.
- **Production:** creative stranded; quality check stranded; production package stranded; video stranded or capacity exception.
- **Suppliers and delivery:** supplier approval stranded; supplier order not placed; shipment overdue.
- **Care and money:** support case abandoned; refund authorised but not recorded; replacement authorised but not actioned.
- **Data and configuration:** commercial data missing; required configuration missing.

**Retry classes:**
- **SAFE_TO_RETRY:** founder notification, follow-up hooks.
- **RETRY_WITH_IDEMPOTENCY_KEY:** processing hand-over, payment confirmation, lifecycle email, creative jobs, video entitlement, manufacturing package, review request.
- **MANUAL_REVIEW_REQUIRED:** interrupted email, generation, quality check, partner order record, shipment, support case, commercial data, configuration.
- **DO_NOT_AUTO_RETRY:** supplier purchase authorisation, supplier purchase, replacement, refund.

**Recovery actions.** Only five exist, each a person's click, all idempotent and none financial (`resilience_recover`): RECORD_PROCESSING_EVENT, RETRY_PAYMENT_CONFIRMATION, RETRY_CUSTOMER_EMAIL (FAILED only), RETRY_FOUNDER_NOTIFICATION, PREPARE_LIFECYCLE_HOOKS. Each leaves a `SYSTEM.RECOVERY_ATTEMPTED` audit event recording who, what and the outcome — never a body or secret.

**Unavoidable duplicate communication.** If an email was accepted by the provider but the server stopped before recording it, a manual re-send would repeat it. The system therefore marks it "a person must check first" and offers no retry.

## 8. Migration chain and database

- **Order:** `db/migrations/MANIFEST` is the authoritative order. **Filename order is not safe:** business-intelligence depends on customer-care, and several same-date migrations depend on each other.
- **Full chain:** from the original CRM base schema (before `2026-08-31-mcb-reference.sql`), the full chain in MANIFEST order equals a fresh `db/schema.sql`. Re-applying the whole chain is harmless.
- **Upgrade:** from the previous accepted schema (d352dbe3), `2026-09-17-resilience.sql` applies twice and equals fresh.
- **No destruction:** no migration drops, truncates or deletes data.
- **Preflight:** `schema_complete` compares every table and column against the generated `schema-manifest.json` and names the migration that adds anything missing. It is proven to catch a dropped column.

## 9. Configuration audit

`crm/system?view=readiness` classifies configuration. It never shows a value:

| Class | Items |
|---|---|
| REQUIRED_FOR_LAUNCH | Database; customer link secret; privacy salt; staff key; live payment key (TEST_ONLY is not enough); webhook secret; email; both founder codes; https site origin; private route data; delivery rates. Test overrides must be absent: fixtures, email override, endpoint overrides, debug |
| OPTIONAL | Notification bridge key, operations webhook, reviews URL, support address, route freshness, new-sale safety |
| EXTERNAL_VERIFICATION | A live payment, the hello@ / support@ mailbox, Telegram delivery, the music platform connection, **malware scanning (NOT PRESENT)** |
| DEFERRED | Commercial thresholds, minimum contribution |

Missing required configuration appears in failures and founder actions. Nothing dangerous is substituted silently.

## 10. Automation readiness (summary)

| Workflow | Status on the TEST stack |
|---|---|
| Payment and order creation | Prepared — external connection required (live Stripe); automated and tested once live is verified |
| Customer confirmation | Prepared — external connection required (live email and mailbox) |
| Creative preparation | Done by people, by design (jobs, ledger and plans prepared automatically) |
| Music generation | **Prepared — external connection required.** Mozart AI: FOUNDER SELECTED · ACCOUNT NOT OPENED · INTEGRATION PENDING · CAPABILITIES PENDING EXTERNAL VERIFICATION. The adapter contract (`MusicProviderAdapter`) exists; no call, credential or purchase |
| Creative quality check, artwork preparation, video production, video quality check, shipment and tracking, delivery, customer support, review request | Done by people, by design |
| Production file generation | Waiting on outside verification (missing manufacturer specifications) |
| Supplier routing | Automated and tested (with route data); otherwise waiting on outside verification |
| Supplier purchase, replacement, refund | Bella or Lewis decide |
| Business Intelligence | Automated and tested |
| Founder notifications | Prepared — external connection required (Telegram delivery unverified) |

The live matrix is generated from real state (`resilience_automation_matrix`).

## 11. Founder actions

`crm/system?view=founder-actions` is generated from live state. It groups actions under four headings:
- **One-time, before launch:** missing configuration, external verifications, manufacturer data, frame confirmation, go-live approval, legal review.
- **For each order:** supplier authorisations, song, artwork and video quality checks (with counts).
- **Only when something goes wrong:** refund and remedy decisions, commercial and substitution exceptions, refunds authorised but not made.
- **Regular business review:** Business figures, stale routes, recording payment fees, failures.

## 12. Headers, dependencies, secrets

**Headers.**
- **Site-wide (unchanged):** CSP (self plus the analytics, fonts and forms origins actually used), nosniff, strict-origin-when-cross-origin, SAMEORIGIN, Permissions-Policy, COOP.
- **New for private customer and staff routes:** a strict CSP with no analytics, form or captcha origins; `frame-ancestors 'none'`; `X-Frame-Options: DENY`; `Cache-Control: no-store`; `media-src 'self' blob:` (playback kept).
- **JSON API:** CSP none, DENY, noindex, no-store.
- **HSTS:** prepared but commented. Enable on the production host once every mycustombeats.com host serves HTTPS.

**Dependencies (npm audit, 16 Sept):** production has `react-router` 7.13.1 (high advisories) and `ws` (high).
- **React Router:** the advisories concern framework, RSC and turbo-stream server modes; MCB uses the declarative `BrowserRouter` SPA only, so they are low risk here. **Still recommended:** upgrade to ≥ 7.18.2 in a controlled dependency update.
- **ws and build tools:** `ws` is extraneous development tooling; the other findings are build-time only (vite, postcss, babel, brace-expansion and similar).
- **Why not fixed here:** `node_modules` is shared with the main checkout, which this sprint must not touch.

**Secrets.** No secret was found in tracked files or git history: live Stripe, webhook, AWS, private key, Telegram bot, Google, GitHub, Slack and Resend patterns were all checked. The only match is a deliberately fake live-key string in a refusal test. No private supplier data (partner names) exists outside the permitted test regexes. No config, `.env` or route file is tracked.

## 13. Remaining risks (honest)

1. A shared staff key with self-declared names (no per-person accounts).
2. No malware scanning of uploads.
3. React Router needs a patch upgrade; build-tool advisories remain.
4. Live Stripe, email delivery, the hello@ mailbox and Telegram are unverified.
5. HSTS is not enabled until the host is confirmed.
6. Manufacturer data is missing, so most vinyl is confirmed before payment under REQUIRED.
7. Supplier route evidence is not uploaded.
8. No independent penetration test.
