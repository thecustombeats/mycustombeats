# MCB CRM — deployment

Everything the API needs ships inside `dist/`, because `public/api/` is copied
there by the build. There is no second upload path and no separate release.

Order matters: **database first, then configuration, then the site.** Deploy the
site before the database exists and the order endpoint will refuse writes —
harmless, but pointless.

---

## 1. Confirm PHP (two minutes, once)

Upload a file containing:

```php
<?php echo json_encode(['php' => PHP_VERSION, 'pdo_mysql' => extension_loaded('pdo_mysql')]);
```

Open it. You need **PHP 8.0+** and `pdo_mysql: true`. Delete the file afterwards.

If `pdo_mysql` is false, enable the MySQL extension in hPanel → Advanced → PHP
Configuration → PHP extensions.

## 2. Create the database

hPanel → Databases → MySQL Databases. Create a database and a user, and grant
that user all privileges on it. Note the four values — Hostinger prefixes both
names with your account id, e.g. `u123456789_mcb_crm`.

Then hPanel → phpMyAdmin → your database → **SQL**, and paste the whole of
`db/schema.sql`. It creates nine tables and is safe to run twice.

Confirm afterwards: `affiliates`, `clicks`, `customers`, `delivery_addresses`,
`orders`, `partners`, `reference_sequence`, `stripe_events`,
`unreconciled_payments`.

### If the database already exists

A database created before the customer reference number was added has none of
`orders.mcb_reference`, `reference_sequence` or `unreconciled_payments`. Paste
`db/migrations/2026-08-31-mcb-reference.sql` in the same place. It adds all
three, modifies no existing row, and is safe to run twice.

Without it the Stripe webhook cannot issue references and every payment fails
to record — run it **before** step 6.

Confirm afterwards:

```sql
SHOW COLUMNS FROM orders LIKE 'mcb_reference';        -- varchar(20), YES, UNI
SHOW TABLES LIKE 'reference_sequence';                -- one row
SHOW TABLES LIKE 'unreconciled_payments';             -- one row
```

## 3. Write the configuration

Copy `api/config.example.php` and fill it in. Generate each secret separately:

```
php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
```

**Preferred location** — one level above `public_html`, so a redeploy cannot
touch it:

```
/home/<your-user>/mcb-config.php
```

**Fallback** — `public_html/api/config.php`, which `.htaccess` denies over HTTP.
If you use the fallback, you must recreate it after any deploy that clears the
directory, and you must verify the denial:

```
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/config.php
```

**403 is required.** Anything else means the file is being served and the
credentials are public — stop and fix that before going further.

## 4. Deploy the site

Build, then upload the whole of `dist/` as one set, exactly as before:

```
npm run build
```

The build regenerates `api/data/packages.json` from `src/data/packages.ts`, so
prices and format rules on the server always match the website.

## 5. Verify

```
# refuses GET, which proves routing and PHP both work
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/order          # 405

# authentication is required
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/crm/orders      # 401

# internals are not reachable
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/config.example.php # 403
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/lib/db.php      # 403
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/data/packages.json  # 403

# expected to be ABSENT when configuration lives above the web root
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/config.php      # 404
```

`config.example.php` is the file that proves the deny rule, because it is
actually deployed. `config.php` returning **404** is the correct result on the
preferred layout — the file does not exist inside the web root at all, because
configuration lives at `~/mcb-config.php` above it. Expect **403** there only if
you chose the fallback location in step 3.

```
# the customer reference lookup — 400 proves the endpoint is deployed and
# refuses anything that is not a Stripe session id
curl -o /dev/null -w '%{http_code}\n' https://www.mycustombeats.com/api/order-reference  # 400
```

Then place one real order through the website and check `orders` in phpMyAdmin.
A digital order must have no `delivery_addresses` row; a Vinyl or CD order must
have exactly one. `mcb_reference` stays `NULL` until step 6 is done and a
payment actually completes — that is correct, not a fault.

## 6. Stripe conversions (last, and only when ready)

**This is the step that makes MCB live.** Until it is done, orders stay
`PENDING`, affiliate sales stay at zero, and no customer is ever issued a
reference number — a paying customer would see the thank-you page with no
reference on it. Everything else works.

1. Stripe → Developers → Webhooks → **Add endpoint**
   - URL: `https://www.mycustombeats.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
2. Copy the signing secret (`whsec_…`) into config `stripe.webhook_secret`.
3. Send a test event from the Dashboard. Expect **200**.
4. After the first real payment, confirm in phpMyAdmin:

   ```sql
   SELECT id, customer_id, status, mcb_reference, stripe_payment_intent
     FROM orders WHERE status = 'PAID';
   ```

   Every `PAID` row must carry an `MCB-YYYY-NNNNNN` reference. A `PAID` row with
   a `NULL` reference means the migration above was not run.

---

## 7. Watch the unreconciled ledger

```bash
curl -H "Authorization: Bearer <crm_api_key>" \
     https://www.mycustombeats.com/api/crm/unreconciled
```

`{"open":0}` is the healthy answer and should stay that way.

A non-zero `open` means a customer paid and no order received it — almost
always because `/api/order` was failing at the time. The row holds the buyer's
email, name and amount from Stripe. Find or recreate their order, then:

```bash
curl -X POST -H "Authorization: Bearer <crm_api_key>" \
     -H 'Content-Type: application/json' \
     -d '{"session_id":"cs_live_…","order_id":42}' \
     https://www.mycustombeats.com/api/crm/reconcile
```

That marks the order paid and issues its MCB reference through the same path
the webhook uses. **Do not fix these by editing `orders` in phpMyAdmin** — a
hand-written UPDATE leaves the customer paid with no reference.

Worth checking weekly, and after any period when the site or database was
unwell.

---

## 8. The post-payment customer email

The email carrying the MCB reference is sent by **Resend**, called directly
from the Stripe webhook after the paid transaction commits. There is no
automation platform in this path.

### 8a. Verify a sending domain (do this FIRST)

Resend refuses to send from an unverified domain, so this gates everything
else. Resend recommends a **subdomain** rather than the root domain, so that
transactional mail builds its own sending reputation and a marketing mistake
can never poison order confirmations:

    send.mycustombeats.com        (recommended)

1. Resend -> Domains -> **Add Domain**, enter the subdomain, pick the region
   closest to your customers (EU/Ireland for a UK business).
2. Resend generates records **specific to your account**. They cannot be
   written down in advance — copy them from that screen. Expect:

   | Type | Purpose |
   |---|---|
   | `TXT` (or `CNAME` on newer accounts) | **DKIM** — signs each message. Case-sensitive; must match exactly |
   | `TXT` | **SPF** — lists who may send for the domain |
   | `MX` | routes bounce and complaint feedback back to Resend |

3. Add them in **Hostinger -> Domains -> DNS Zone**. When adding a record for
   `send.mycustombeats.com`, Hostinger usually wants the host as `send`, not
   the full name — check the field's hint or the record will land at
   `send.mycustombeats.com.mycustombeats.com`.
4. Wait for Resend to show **Verified** — usually under 15 minutes, though DNS
   can take up to 72 hours.
5. Optionally add a DMARC record once DKIM and SPF pass.

The `from` address must be on that verified domain, e.g.
`My Custom Beats <orders@send.mycustombeats.com>`. The mailbox does not need
to exist to *send*, but `reply_to` is set to `support@mycustombeats.com`, and
that one **must** be able to receive.

### 8b. Configure

1. Resend -> **API Keys** -> create one with **Sending access** only.
2. Put it in `~/mcb-config.php`:

   ```php
   'resend' => [
       'api_key' => 're_…',
       'from'    => 'My Custom Beats <orders@send.mycustombeats.com>',
   ],
   ```

   Treat the key exactly like the Stripe secret: never commit it, never expose
   it to the browser. It is only ever sent to `api.resend.com` over HTTPS and
   is never written to a log or an HTTP response.

While either value is empty the email is skipped and logged, no claim is
taken, and payments/references/CRM are entirely unaffected. Set them later and
replay the Stripe event to deliver the outstanding mail.

3. In the **existing** pre-payment order-form automation, switch OFF any
   customer email. That one fires before payment, so it cannot carry the
   reference and currently mails people who never pay. Keep its other work —
   the payload carries `stage: "SUBMITTED"` to route on.

### 8c. Sending the reference for an order that predates this

```sql
SELECT id, mcb_reference FROM orders
 WHERE status = 'PAID' AND customer_notified_at IS NULL;
```

For each, open the payment in Stripe -> Developers -> Events -> **Resend**.
The webhook returns `outcome: "duplicate"` and still delivers the email once.
Re-sending again will not email twice.

---

## Rollback

The API is additive. The order form treats it as best-effort: if `/api/order`
is missing or failing, checkout proceeds exactly as it did before the CRM
existed, and Stripe falls back to carrying the referral string.

To disable the API without a rebuild, rename `api/` on the server. The website
is unaffected.

## What survives a redeploy

| Item | Survives? |
|---|---|
| `mcb-config.php` above the web root | yes |
| `api/config.php` inside the web root | only if you upload additively |
| Database contents | yes — schema changes never drop tables |
| Issued `mcb_reference` values | yes — never regenerated, never reused |
