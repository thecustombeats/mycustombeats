# MCB launch runbook — deployment, rollback, first live order, first 24 hours

Release candidate `mcb-release-candidate-20260914` · Sprint 7 · **Nothing here has been performed.** Every step is for the authorised deployment, after the Founder release decision.

The emergency control throughout is **`stripe.live_checkout_approved => false`** (or `checkout_sessions_enabled => false`) in the server's `mcb-config.php`. With either off, no checkout session can be created; browsing, enquiries and existing orders keep working.

## 1. Deployment sequence (rehearsed on paper; order matters)

| # | Step | Detail | Checkout state |
|---|---|---|---|
| 1 | **Final backup** | Hostinger: full file backup of `public_html` and a database export. Keep both off the server. | OFF (new site) |
| 2 | **Production configuration** | Create/update `mcb-config.php` beside `public_html` from `public/api/config.example.php`: DB credentials, `ip_salt`, `token_secret` (32+ random chars), `crm_api_key`, `app.site_origin = https://www.mycustombeats.com`, `app.debug = false`. **Stripe:** live `secret_key`, `checkout_sessions_enabled => false` for now, `live_checkout_approved => false`. **Resend:** `api_key`, `from`; no `api_url`, no `test_mode_send_to_customer`. `reviews.url` empty (review requests stay off). `delivery.use_test_fixtures` absent. **Founder authority:** `founders.BELLA.authorisation_hash` / `founders.LEWIS.authorisation_hash` — each founder runs `password_hash` on their own code and supplies only the hash. **Notifications:** `notifications.worker_key` (32+ random chars) only when an authorised bridge exists; never a Telegram token here. | OFF |
| 3 | **Private uploads** | Create `mcb-uploads/` beside `public_html` (never inside), permissions 0700/0750, owned by the PHP user. | OFF |
| 4 | **Database migrations** | In date order, only migrations not yet applied: `2026-09-14-canonical-catalogue.sql` (if absent), `2026-09-14-sprint4-order-persistence.sql`, `2026-09-14-sprint5-operations.sql`, `2026-09-15-single-creative-authority.sql`, `2026-09-15-automation-foundation.sql`, `2026-09-15-creative-factory.sql`, `2026-09-15-production-file-factory.sql`, `2026-09-15-fulfilment-controller.sql`, `2026-09-15-memory-music-video.sql`. Each is idempotent and additive. `api/data/supplier-routes.json` (supplier routes, costs and internal allowances) is uploaded to the server only, never committed; confirm preflight `fulfilment_controller_migration_applied` PASS. Upload `api/crm/.user.ini` and `api/crm/.htaccess` (staff production uploads up to 260 MB) and confirm preflight `production_upload_limits` PASS; `api/data/supplier-orders.json` (internal supplier data) is uploaded to the server only, never committed. The last must be applied before the new code serves the webhook (a payment records its founder notification in the same transaction). | OFF |
| 5 | **Clean build** | On a clean checkout of the approved commit: `npm ci && npm test && npm run build`. Confirm `dist/api/data/*.json`, `dist/catalogue.json`, `dist/analytics-init.js`, `dist/.htaccess`, `dist/api/.htaccess` exist. | OFF |
| 6 | **Remove obsolete files** | On the server: `api/stripe/webhook-test.php` must not exist; remove any `api/config.php` left inside the web root once `mcb-config.php` is in place; remove stale `assets/` chunks after upload. Keep `/luxury/` (non-indexed, unlinked) per Founder decision. | OFF |
| 7 | **Upload** | Upload `dist/` contents to `public_html` (replace). Do not upload `tests/`, `docs/`, `db/`, `src/` or any `_test-*` stub. | OFF |
| 8 | **Stripe live webhook** | Stripe Dashboard (live): endpoint `https://www.mycustombeats.com/api/stripe/webhook`, events `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Put its signing secret in `stripe.webhook_secret`. | OFF |
| 9 | **Delivery rates** | Physical products only: upload `api/data/delivery-rates.json` built from the Founder's approved table (`docs/FOUNDER-DECISIONS-PACK.md` §2). Without it, physical orders are quoted "unavailable" and cannot be paid; a Moment can. Rates carry `classes`; a rate without classes prices vinyl only. Plaques, players and pop-up cards stay "MCB confirms delivery before payment" unless the table's `pricing` promotes them. Never enter internal shipping allowances (£8/£10/£20) as rates. | OFF |
| 10 | **Resend** | Verify the sending domain in Resend; send a test to a staff inbox via a TEST-mode rehearsal (never a customer). | OFF |
| 11 | **Preflight** | `curl -s https://www.mycustombeats.com/api/crm/preflight -H "Authorization: Bearer <crm key>"`. Every check PASS except `checkout_sessions_enabled`/`live_checkout_approved` (WARN until step 16) and `delivery_rate_table` (WARN if no table). | OFF |
| 12 | **Browser console check** | With DevTools open: `/`, `/keepsake`, `/create` to Review, `/blog`, `/partners`, `/affiliate`, `/artists/apply`, `/luxury/`. No Content-Security-Policy errors except Google's regional `ga-audiences` pixel (blocked by design). Accept analytics once and confirm GA collect requests succeed. | OFF |
| 13 | **HTTPS host verification** | `curl -sI http://mycustombeats.com/` → 301 to `https://www.`; `https://www.mycustombeats.com/your-order` shows `X-Robots-Tag: noindex`; `/api/checkout/status` shows `Content-Security-Policy: default-src 'none'`. Check every subdomain in DNS serves HTTPS. | OFF |
| 14 | **HSTS decision** | Only if step 13 confirms HTTPS on every host: uncomment `Strict-Transport-Security: max-age=31536000` in `.htaccess` (no `includeSubDomains`/`preload` yet). Otherwise leave off and record why. | OFF |
| 15 | **Smoke test (no payment)** | Homepage, product pages, `/create` through Review for a Moment (server total £15, no delivery), a Bespoke and an MCB LIVE enquiry (then mark them CLOSED in `/operations`), `/operations` sign-in and queue, 404 page, `/catalogue.json`. | OFF |
| 16 | **Live checkout approval — LAST** | With Founder approval: `checkout_sessions_enabled => true` and `live_checkout_approved => true`. Re-run preflight: `ready_for_live_checkout: true`. Proceed to §3. | **ON** |

## 2. Rollback plan

| Situation | Action | Notes |
|---|---|---|
| Any payment concern | **Set `live_checkout_approved => false`** (seconds; no deploy) | Customers see "Online payment isn't open yet"; nothing else changes. Existing paid orders stay intact and operable. |
| Frontend defect | Re-upload the previous `dist/` (or restore the step-1 file backup of `public_html`) | Hashed assets: clear old `assets/` only after the restore is confirmed. `mcb-config.php` and `mcb-uploads/` are outside `public_html` and unaffected. |
| Backend (API) defect | Restore previous `public_html/api/` from backup, then turn checkout off | The API reads `mcb-config.php`, which is not part of the restore. |
| Database | **Do not roll back migrations on a database holding real orders.** The Sprint 4/5 migrations are additive; older code ignores the new tables/columns. If a restore is unavoidable, export `orders`, `order_*`, `customers`, `customer_communications`, `checkout_sessions`, `stripe_events`, `unreconciled_payments` first and reconcile by MCB reference. | Never delete paid-order data. |
| Stripe webhook | Leave the endpoint registered. If the API is down, Stripe retries for up to three days; paid events are idempotent and will be applied when it returns. If the endpoint must be disabled, re-enable it and use Stripe "Resend" for missed events. | `unreconciled_payments` captures anything that cannot be matched. |
| Uploads | Keep `mcb-uploads/`; files are referenced by the database. | Include in backups. |
| Orders already created | They remain in `/operations`; PENDING orders never paid simply expire. | |
| Customer communications | If a wrong email went out: note the MCB reference(s) from `customer_communications`, contact those customers personally. Do not re-send automatically. | Emails are idempotent per order/type/round. |

## 3. First live order plan (after explicit Founder launch approval)

Lowest risk: **one Moment, £15**, paid by a founder with a real card, to a founder's email.

1. Preflight `ready_for_live_checkout: true`; `/operations` queue empty or understood.
2. Private browser window; accept analytics. `/moment` → Create → one memory, "Let MCB choose" → details (founder email) → Review shows **£15, delivery not needed** → consents → "Continue to secure payment".
3. Stripe Checkout shows **My Custom Beats**, **£15.00 GBP**, no currency conversion offer. Pay.
4. Thank-you page shows "Payment confirmed" and an `MCB-2026-…` reference within ~15 seconds.
5. Stripe Dashboard: payment succeeded; webhook delivery 200.
6. `/operations` → search the reference: payment PAID, state `CREATIVE.PENDING`, creative brief shows the memory; queue shows "Creative work".
7. Inbox: confirmation email with the reference, correct item and £15.00; no `[TEST]` prefix.
8. Staff: Start creative → Send to quality check → Pass quality check (every item + the private link) → the "Your MCB creation is ready" email arrives → open `/your-order#…` on a phone and experience the reveal. There is nothing for the customer to approve.
9. GA4 Realtime (DebugView if enabled): one `purchase` with transaction id = MCB reference, value 15, GBP. Check the page_location contains no `session_id` and no `#`.
10. Confirm nothing sensitive leaked: Stripe payment metadata holds only `mcb_order_id`, `mcb_basket_hash`, `mcb_checkout`; server error log has no story/email text.
11. Decide whether to refund the founder test via the Stripe Dashboard (a manual Founder action; the site has no refund automation).

Physical products: only after `delivery-rates.json` is in place, repeat with a 7-inch Keepsake to a founder address, then run Send to quality check → Pass quality check → Confirm fulfilment (authorised by Bella or Lewis) → Dispatched → Delivered in `/operations`. Any partner purchase is placed and paid by hand by an authorised Founder; nothing is ordered automatically. For a plaque or player (if promoted to online pricing), staff record **Confirm availability and delivery** before the partner order can be confirmed; if the partner cannot supply, contact the customer and decide any refund manually in Stripe (Founder financial decision).

## 4. First 24 hours — concise checklist

Not continuous monitoring: check at opening, midday, end of day, and whenever an alert arrives.

- [ ] Preflight still `ready_for_live_checkout: true` (morning).
- [ ] Stripe Dashboard → Payments and Webhooks: failed deliveries = 0; any failure → "Resend" after fixing.
- [ ] `/operations` queue: **Payment needs review** (amount/currency mismatch), **Email not sent** (retry from the order), **Missing information**, **Damaged or faulty item reported**, new **Bespoke** / **MCB LIVE** enquiries.
- [ ] Hostinger error log: search `MCB` — watch for `rate limit unavailable` (migration missing), `uploads` (storage), `Resend rejected`, `webhook`.
- [ ] A customer says a photo would not upload → check `mcb-uploads/` exists and is writable; preflight `private_upload_storage`.
- [ ] GA4 Realtime shows traffic from consenting visitors only; no purchase without a matching Stripe payment.
- [ ] Inbox replies to confirmation emails (support@).

**Emergency off:** edit `mcb-config.php` → `'live_checkout_approved' => false`. PHP may cache the file briefly; verify `GET /api/checkout/status` shows `"online_checkout": false`.
