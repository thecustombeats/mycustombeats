# CRM API acceptance tests

83 assertions against a live PHP + MariaDB stack. Everything runs in throwaway
containers — no local PHP or MySQL install, nothing left behind.

## Run

```bash
docker run -d --name mcb-db \
  -e MARIADB_ROOT_PASSWORD=testroot -e MARIADB_DATABASE=mcb_crm \
  -e MARIADB_USER=mcb -e MARIADB_PASSWORD=testpass mariadb:11

# wait for readiness, then load the real schema
docker exec -i mcb-db mariadb -umcb -ptestpass mcb_crm < db/schema.sql

# api/ needs a test config; see the header of this file's git history for the
# exact block, or copy config.example.php and point db.host at mcb-db
docker run -d --name mcb-api --link mcb-db \
  -v "$PWD/public/api":/var/www/html/api \
  -v "$PWD/tests/apache-override.conf":/etc/apache2/conf-enabled/zz-override.conf \
  -p 8080:80 php:8.2-apache \
  sh -c "docker-php-ext-install pdo_mysql; a2enmod rewrite; apache2-foreground"

bash tests/api-acceptance.sh
docker rm -f mcb-db mcb-api
```

Apache is used rather than PHP's built-in server on purpose: the built-in
server ignores `.htaccess`, so it cannot verify clean-URL routing, the denial
of `lib/`, `data/` and `config.php`, or the Authorization forwarding — all of
which are part of what these tests prove.

## Coverage

| Area | What is asserted |
|---|---|
| Order API | digital accepted without address; physical rejected without one and accepted with; invalid package, format and combination rejected; amount and fulfilment derived server-side; customer deduplicated; multiple orders and differing addresses |
| Affiliate | registration; duplicate email and username both 409 without disclosing which; token issued and only its hash stored; clicks recorded and counted; IP hashed; unknown ref a silent no-op |
| Attribution | referral resolved server-side to AFFILIATE; partner resolved by slug; unknown referral credits nobody but is retained; **browser-supplied affiliate_id, partner_id, status and amount all ignored** |
| Dashboard | valid token works; missing, forged, expired and id-swapped tokens rejected; an email address is not accepted as authentication |
| CRM read | key required; brief and story never exposed; shipping filter works |
| Stripe | unsigned and badly signed rejected; signed accepted; order marked PAID; sales incremented; **replay does not double-count**; stale timestamp rejected |
| Security | config, lib and data denied over HTTP; cross-origin writes rejected; malformed JSON rejected; SQL injection stored literally, tables intact |

## A bug these tests caught

`Authorization` was invisible to PHP under Apache — present via
`getallheaders()` but absent from `$_SERVER['HTTP_AUTHORIZATION']`. Both
authenticated endpoints returned 401 for valid credentials, and would have done
the same on Hostinger. Fixed in `lib/security.php` and `api/.htaccess`.
