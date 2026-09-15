# CRM API acceptance tests

Seventeen suites, over 2,350 assertions, against a live PHP + MariaDB stack. Everything
runs in throwaway containers — no local PHP or MySQL install, nothing left
behind. Each suite expects a FRESH database loaded from `db/schema.sql`.

## Run

```bash
docker run -d --name mcb-db \
  -e MARIADB_ROOT_PASSWORD=testroot -e MARIADB_DATABASE=mcb_crm \
  -e MARIADB_USER=mcb -e MARIADB_PASSWORD=testpass mariadb:11

# wait for readiness, then load the real schema
docker exec -i mcb-db mariadb -umcb -ptestpass mcb_crm < db/schema.sql

# api/ needs a test config, written OUTSIDE the repo and copied in (gitignored):
# db.host mcb-db; stripe.webhook_secret whsec_test_secret_for_local_verification;
# crm_api_key test_crm_key_not_real_000000000000000000000;
# stripe.checkout_sessions_enabled true, stripe.api_base
# http://localhost/api/_test-stripe-stub.php and a random sk_test_stub_ key (a
# TEST-mode key shape: the server refuses anything else);
# resend.api_url http://localhost/api/_test-resend-stub.php, a random
# re_teststub_ key, a from address and resend.test_mode_send_to_customer true
# (safe ONLY because Resend is the stub); delivery.use_test_fixtures true;
# uploads.development_storage true (photos go to /tmp inside the container);
# reviews.url; app.site_origin http://localhost:8080. Leave `operations` unset
# (the ops notice stays dormant). Founder authority and the outbox worker use
# FAKE test values (tests/automation-helpers.sh):
#   founders.BELLA.authorisation_hash = password_hash('test-founder-bella-not-real')
#     e.g. '$2y$10$DGUsGMFKZMerXqqbkHqGAe3401n9XgFxP/gVTdPuZo0hP/1GCHGia'
#   founders.LEWIS.authorisation_hash = password_hash('test-founder-lewis-not-real')
#     e.g. '$2y$10$P9H3wmc9cgyeXPzYrBTftub5XDcarfqrn8etTiAkB2QBbzdi6E6UO'
#   notifications.worker_key = 'test_notification_worker_key_not_real_0000' 
cp /path/outside/repo/config.php public/api/config.php
# Stand-ins for api.stripe.com and api.resend.com — removed afterwards
cp tests/stripe-stub.php public/api/_test-stripe-stub.php
cp tests/resend-stub.php public/api/_test-resend-stub.php

docker run -d --name mcb-api --link mcb-db \
  -v "$PWD/public/api":/var/www/html/api \
  -v "$PWD/tests/apache-override.conf":/etc/apache2/conf-enabled/zz-override.conf \
  -p 8080:80 php:8.2-apache \
  sh -c "docker-php-ext-install pdo_mysql; a2enmod rewrite; apache2-foreground"

for s in api automation checkout command-centre creative delivery fulfilment full-package hardening legal lifecycle operations production release transaction video customer-care; do
  # reset: DROP/CREATE mcb_crm, reload db/schema.sql, clear /tmp/*-stub.log
  bash tests/$s-acceptance.sh
done
docker rm -f mcb-db mcb-api
rm -f public/api/config.php public/api/_test-*.php
```

The PHP image runs OPcache, which rechecks a changed PHP file every 2 seconds.
`transaction-acceptance.sh` and `operations-acceptance.sh` swap the config for a
few scenarios (a live key, fixtures off, test-mode email, a weak token secret)
and wait for that; they always restore it. `operations-acceptance.sh` also
needs the MariaDB root password (`testroot`) to prove the Sprint 5 migration
against a scratch database. `release-acceptance.sh` copies the real
`public/.htaccess`, `robots.txt`, `catalogue.json` and `analytics-init.js` (with a
placeholder `index.html`) into the Apache web root to test served headers,
redirects and endpoint protection, and removes them afterwards.

Apache is used rather than PHP's built-in server on purpose: the built-in
server ignores `.htaccess`, so it cannot verify clean-URL routing, the denial
of `lib/`, `data/` and `config.php`, or the Authorization forwarding — all of
which are part of what these tests prove.

## Coverage

No suite reads `dist/`. Every expected amount is read from
`public/api/data/catalogue.json`; only checkout-acceptance pins that file to
the authorised price table, once. Every order POST sends a fresh
`Idempotency-Key`; every webhook fixture is `payment_status: "paid"`, GBP, with
`amount_total` taken from the order's saved `total_minor`.

| Suite | What is asserted |
|---|---|
| api | Order API on `lines` (digital/physical, address, unknown SKU, legacy package/format body refused, missing key 400, `total_minor`/token/order_items saved); affiliates; attribution with browser price/status/affiliate fields ignored; dashboard tokens; CRM read; signed webhook, replay, stale timestamp; MCB references; orphan/ghost reconciliation; Resend email (order summary, `£` from `total_minor`, no format line) and its failure modes; payment without a snapshot must be EXACT (under, over, missing, string, wrong currency all filed); security |
| checkout | Authorised catalogue price table; every song experience priced from the catalogue; multi-line totals; browser price/total/unit_amount/currency ignored at order and session; retired/unsold SKUs (`heirloom`, `cd`, `plaque`, `bespoke`, `mcb-live`, DJ Bible…) `unknown_sku`; quantity 0/51/"2"/2.5 refused, 50 accepted; duplicate SKU; >20 lines; no song experience; Priority Replacement eligibility; address follows physical lines; order idempotency (replay, conflict, concurrent double submit); session token auth (wrong token = unknown order 404, no Stripe call, no email leak); session built from saved lines; reuse, expiry replacement, attempt counter; legacy/inconsistent orders 409; Stripe failure; webhook exact match, ORDER_MISMATCH (metadata and foreign snapshot), unpaid → async success, DUPLICATE_PAYMENT, replay; CRM `lines`/`total.minor` and no `usd`; order-reference `purchase`; ops notice dormant; session rate limit |
| delivery | Terms versions and per-order snapshot; planning recommendation from one constant in the canonical catalogue; delivery/handling/liability clause register; Bespoke not orderable; prices only from the generated catalogue; no Payment Links or Stripe secrets in `src/` |
| full-package | Bespoke (formerly The Full Package) and MCB LIVE are QUOTED with no SKU and cannot be ordered; no `£799`/Payment Link in source; checkout builds from the saved order whatever the request names; concierge enquiry intake, budget storage, validation, rate limit and CRM surface |
| hardening | Thank-you page claims payment only from the server; `purchase` disclosed only for a PAID order; Bespoke page title and `/bespoke` sitemap entry (`/full-package` 301 rule asserted statically — the test Apache serves `public/api` only); order limiter ordering (replay → limit → validation), burst refused after ten, retry of an accepted order still answered while limited |
| legal | Consent as evidence, versions, production lock, banned phrases absent from all `src/`, no revision entitlements, Creative Authority consent, Bespoke enquiry is not a purchase, cruise field, review states, register not imported |
| transaction | Sprint 4, end to end: server says whether checkout is open and in which mode; the £15 Moment golden path (server quote, per-memory persistence, TEST session with minimal metadata and no customer text, double-click reuse, bad signature, signed payment → PAID, one reference, audit trail, one confirmation without story text, duplicate webhook harmless); under/over/wrong-currency → PAYMENT_REVIEW; live-mode or mode-less events filed MODE_MISMATCH; Keepsake 7"/heart/10"/12" memory counts and format snapshots; two Keepsakes independent; Priority Replacement per Keepsake only; delivery quoted by the server (TEST_ONLY fixture, UNAVAILABLE without rates, refused with a live key); physical Keepsake with photo, Priority Replacement, delivery and payment; staff production brief; Journey 6/12 chapters on standard vinyl with per-chapter styles; plaque/frame/player personalisation; 300-character and other limits refused, never truncated; uploads (types, polyglot, SVG, size, near-limit, traversal, private storage, CRM retrieval, replacement, wrong token); forged prices/variants/add-ons; stale and foreign tokens; live payment cannot switch itself on; test-mode email never reaches a customer; retired products |
| automation | Automation Foundation: the production artwork specification (sleeve front 3756 × 3827 / back 3756 × 3756 with bleed and spine; discs 302/250/174 mm, 12-inch hole 7.23 mm vs the 1.5-inch creative exclusion; Heart and gatefold TEMPLATE_REQUIRED); migration equivalence; paid order → ready event + founder notification, idempotent under webhook replay; completion independent of follow-up and review; artwork planning and technical QC (dimensions, shape, type, order/source association, template version, cross-order refusal); QC gates fulfilment; deep link opens and never approves; explicit Bella/Lewis authorisation (codes, refusals, lockout, audit); exceptions and their notifications; the outbox worker contract (claim, ack, retry, abandon, requeue, stale claims, health); safe payloads; sales suspension; event model and sources; no provider, purchase or refund path |
| creative | Creative Factory core: duration (195 s target, 300 s ceiling, 4 × 195 = 780 s) and UNVERIFIED capacity policies; DEFERRED provider route with no provider code; migration equivalence; one job per song under payment replay; data minimisation; versioned Fact Ledger (customer facts protected, EXACT/SEMANTIC/GUIDANCE); lyric fact QC (misspelt exact name, unreferenced memory, exclusion, unallocated fact, contamination, duplication); semantic review; provider-neutral plan (ceiling, tolerance); artist imitation refused; manual candidates with technical QC (non-audio, 301 s, sample rate, stale attempt, wrong reference), shorter song accepted, transcript fact failure; immutable attempts, retry cap, exception and one-more authorisation; Creative QC; masters, versions, lineage; album map first, album QC with a missing track, review; side allocation and CAPACITY_UNVERIFIED; VERIFIED capacity exceeded → AUDIO_CAPACITY_EXCEPTION without touching audio; gates in ADVISORY and REQUIRED; metrics; privacy and cross-order isolation |
| command-centre | Founder Command Centre: staff-only access, no-store/noindex; an empty healthy day; UTC periods; Mozart AI founder selected, integration pending, manual route, no call; truthful readiness; a Moment through creating → song quality check (card, deep link target, opening changes nothing, audited view, listening, answers required, 'no' cannot pass, internal rework without contacting the customer, pass → master); artwork quality check (rework, pass, not-applicable answers); founder approval with unknown economics (never zero), approvals exclude staff tasks, Bella/Lewis code still required, decided list; being made / on the way / delivered counts; damaged item after completion stays visible; delivery exception as a customer problem; paid revenue vs unpaid checkout, live vs TEST, recorded refunds; stranded order health; notification channels and Telegram connected only after a Telegram delivery; search; advanced view; pipeline filter; no financial action |
| video | Memory Music Video: £49 optional DIGITAL enhancement, never preselected, one film for one song (Moment and Journey chapter 3), server pricing and personalisation refusals, migration equivalence; truthful availability; checkout hold → payment reservation → job; webhook replay; video photographs with rights confirmation (not marketing permission); 195 s and 240 s eligible, 300 s → duration review, audio master row and file hash unchanged; manual production, cross-order and non-video refusals, whole-song and picture checks; Command Centre video QC (a 'no' cannot pass, rework never contacts the customer, pass → hash-verified Video Master with audio lineage, capacity completed); reveal and one VIDEO_READY email; private signed playback/download with Range, tampered/expired links and other customers refused; capacity release before production only; slot 45 accepted, three-way race for the last space (one winner), fully booked shown and enforced, expired hold re-offered, late payment → capacity exception without oversell or refund; period capacity rules; metrics and readiness; no platform call or AI wording |
| customer-care | Customer Care & Recovery: executive corrections (Moment £15, Moment + video £64, over-240 s video waits for platform verification) and migration equivalence with existing rows mapped; kinds offered by order type; ordinary question (normal priority, service target, no founder interruption); thread (template reply, one "MCB has replied" email without the reply, internal notes/staff names/economics never shown, customer reply, cross-order and unknown links refused, no content in events or notifications, audited staff view, noindex/no-store); damage without evidence (urgent, one linked exception), private audited evidence, one case per occurrence; wrong item with another customer's details (urgent privacy review, founders told, Command Centre card and health, priority locked, completion needs a record); subjective preference never a correction or reproduction, no creative change, approval still retired; objective error correction; replacement waits for a founder (Approvals, wrong code refused and audited, Bella authorises, nothing purchased, health when not actioned); refund review → founder decision → record with no refund request, key/future refused, partial keeps order PAID, revenue net of partial, full remainder counted once, metrics; link reissue; video rework without touching capacity; attention vs approvals, counts, filters, overdue and urgent health, resolution rules, blocking-exception warning, satisfaction once, cooling hold, repeat contact, metrics without content; MCB case from an exception (once); no purchase, secret, WhatsApp or supplier wording |
| fulfilment | Fulfilment Controller: policy data, migration equivalence, no credential columns; destination checks (unknown never supported, marketplace check, unsupported); decision card (economics, destination summary, would-block list) and explicit acknowledgements; deep link authorises nothing; workspace after authorisation; card numbers refused; substitution blocked without a founder; supplier orders with actual costs and variance reasons; allowances never change the customer quote; two partners, two parcels, split dispatch emails, delay exception and update, completion only when every required parcel is delivered; hooks prepared; lost parcel and replacement; founder-accepted partial delivery; commercial safety exception, sales suspension, proceed at paid price, no Stripe call; support cases and private evidence (optional, polyglot refused, audited download); review request vs content permission; health, metrics, scorecards, command centre; TELEGRAM / EMAIL_FALLBACK / STAFF_QUEUE acknowledgements; ADVISORY |
| production | Production File Factory: template specification exact (sleeves, discs, Heart and gatefold TEMPLATE_REQUIRED), no invented safe zone, provider DEFERRED, role limits, MP3 capability, migration equivalence; artwork job input minimal; art master rules (AI deferred, cross-order photo, unreadable, wrong reference), visual QC incomplete/concern/rework/pass and versions; render jobs with output spec; print file QC (dimensions, orientation, template, version, order, SKU, superseded art master, safe-zone review, cross-order component), versions and lineage, audited downloads, role limit; manufacturing package gates (missing tracks, album QC, capacity unverified/overflow/pass, artwork QC), idempotent builds, READY contents; founder notification and protected deep link with the staff-only supplier pack; nothing public; explicit Lewis authorisation before recording the hand-placed order; Heart MANUFACTURING_DATA_REQUIRED; source-photo preparation; MP3 listening copy vs candidate; no approval, spending or provider |
| lifecycle | Customer referral vs affiliate, eligibility on verified payment, attribution/confirmation, precedence, completion and review request, provider failure isolation, public code privacy, CRM customer view (gross paid equals saved totals) |

## A bug these tests caught

`Authorization` was invisible to PHP under Apache — present via
`getallheaders()` but absent from `$_SERVER['HTTP_AUTHORIZATION']`. Both
authenticated endpoints returned 401 for valid credentials, and would have done
the same on Hostinger. Fixed in `lib/security.php` and `api/.htaccess`.
