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
`db/schema.sql`. It creates seven tables and is safe to run twice.

Confirm afterwards: `affiliates`, `clicks`, `customers`, `delivery_addresses`,
`orders`, `partners`, `stripe_events`.

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

Then place one real order through the website and check `orders` in phpMyAdmin.
A digital order must have no `delivery_addresses` row; a Vinyl or CD order must
have exactly one.

## 6. Stripe conversions (last, and only when ready)

Until this is done, orders stay `PENDING` and affiliate sales stay at zero.
Everything else works.

1. Stripe → Developers → Webhooks → **Add endpoint**
   - URL: `https://www.mycustombeats.com/api/stripe/webhook`
   - Event: `checkout.session.completed`
2. Copy the signing secret (`whsec_…`) into config `stripe.webhook_secret`.
3. Send a test event from the Dashboard. Expect **200**.

While the secret is empty the endpoint returns 503 and processes nothing —
deliberately. An unverified payment webhook would let anyone mark orders paid.

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
