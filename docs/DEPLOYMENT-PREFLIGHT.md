# Deployment preflight — before live checkout

This is the checklist for the server that will take real payments. Nothing here has been done to the production server; it is carried out at deployment, by the Founder or whoever deploys, **before** `stripe.live_checkout_approved` is set.

The server checks itself: `GET /api/crm/preflight` with the CRM key returns every check below as PASS, WARN or FAIL, and `ready_for_live_checkout: true` only when nothing FAILs. It never shows a secret or a path.

```bash
curl -s https://www.mycustombeats.com/api/crm/preflight -H "Authorization: Bearer <crm_api_key>"
```

## 1. Private photo storage — REQUIRED

Customer photos are stored only outside the web root. There is no fallback inside `public_html`, `api/` or any served directory: without private storage, photo uploads are refused ("We couldn't securely save your photo. Please try again shortly.") and **live checkout will not open** (`reason: private_storage_missing`).

Create the directory **next to** `public_html`, not inside it. On Hostinger (hPanel → File Manager, or SSH):

```
/home/<user>/                        ← account home (not served)
├── mcb-config.php                   ← server config (already outside the web root)
├── mcb-uploads/                     ← CREATE THIS
└── public_html/                     ← the website (served)
```

For accounts laid out as `~/domains/<site>/public_html`, place it beside that `public_html`, e.g. `~/domains/<site>/mcb-uploads`. The server looks for a directory named exactly `mcb-uploads` in the directories above the web root. Alternatively set `uploads.path` to its absolute path.

| Requirement | How |
|---|---|
| Outside the web root | Beside `public_html`, never inside it. The server refuses a path that resolves inside the web root, including through a symlink. |
| Writable by the application | Owned by the account user that PHP runs as (on Hostinger, the hosting user). |
| Private | Permissions `0700` (or `0750` if the host requires group access). Photos are written `0640`. |
| Not web-accessible | Being outside the web root is what guarantees this; there is no URL for it. Do not symlink it into `public_html`. |
| No directory listing | Nothing is served from it; no index file or `Options` rule is needed or appropriate. |
| Opaque names | Files are named with 64 random hex characters and no extension. The customer's file name is never used, stored or logged. |
| Access | Staff retrieve a photo only through `GET /api/crm/upload?id=…` with the CRM key, as a download. |
| Backups | Include `mcb-uploads/` in the account backup alongside the database; the database refers to files by name. |

Retention and deletion of photos are **not yet decided** (see the privacy item in `src/data/legal/review.ts`). Do not set up automatic deletion until that policy is approved.

## 2. The rest of the configuration

| Setting | Production value | Preflight check |
|---|---|---|
| `uploads.development_storage` | absent or `false` | `development_storage_off` |
| `stripe.secret_key` | `sk_live_…` | `stripe_key_mode` |
| `stripe.webhook_secret` | the **live** endpoint's `whsec_…` | `stripe_webhook_secret` |
| `stripe.api_base` | absent | `stripe_api_base_default` |
| `stripe.checkout_sessions_enabled` | `true` at launch | `checkout_sessions_enabled` (WARN until then) |
| `stripe.live_checkout_approved` | `true` **only with Founder launch approval** | `live_checkout_approved` (WARN until then) |
| `delivery.use_test_fixtures` | absent or `false` | `delivery_test_fixtures_off` |
| `resend.api_key`, `resend.from` | set | `resend_configured` |
| `resend.api_url`, `resend.test_mode_send_to_customer` | absent | `resend_test_overrides_off` |
| `app.site_origin` | `https://www.mycustombeats.com` | `site_origin_https` |
| `app.debug` | `false` | `debug_off` |
| `token_secret` | 32+ random characters (customer approval and order links are HMACs under it; changing it invalidates every link already sent) | `token_secret_strong`, `customer_links_secret` |
| `operations.*` | see `docs/OPERATIONS-RUNBOOK.md` §10; defaults are safe | — |

## 3. Database

Back up, then apply `db/migrations/2026-09-14-sprint4-order-persistence.sql` and `db/migrations/2026-09-14-sprint5-operations.sql` (and any earlier migration not yet applied), in date order. Checks: `sprint4_migration_applied`, `sprint5_migration_applied`.

## 4. Deployed files

- Deploy a fresh `npm run build` of the approved commit. `api/data/catalogue.json`, `legal.json`, `personalisation.json` and `operations.json` must be present (`data_*` checks).
- `api/stripe/webhook-test.php` must not exist (`legacy_webhook_copy_absent`); it was removed from the repository in Sprint 4.2.

## 5. Stripe Dashboard (manual)

- Register the live webhook endpoint `https://www.mycustombeats.com/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`; copy its signing secret into `stripe.webhook_secret`.
- Settings → Public details: the customer-facing name should read **My Custom Beats**.
- Review which payment methods Checkout offers.

## 6. Delivery

No production delivery rates are authorised. Until `api/data/delivery-rates.json` exists, preflight WARNs `delivery_rate_table` and physical orders cannot be paid online; a digital Moment can. TEST_ONLY rates are refused with a live key.

## 7. Then

Only when `ready_for_live_checkout` is `true`, and with the Founder's launch approval: set `stripe.live_checkout_approved => true` and run preflight again. Whether to make a live smoke-test purchase, and how to handle it afterwards, is the Founder's decision at launch.
