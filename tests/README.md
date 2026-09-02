# CRM API acceptance tests

155 assertions against a live PHP + MariaDB stack. Everything runs in throwaway
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
# the post-payment email needs a stand-in for api.resend.com
cp tests/resend-stub.php public/api/_test-resend-stub.php   # removed afterwards

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
| MCB reference | never issued to a PENDING order; issued on payment as `MCB-YYYY-NNNNNN`; **a replayed event neither reissues it nor consumes a sequence number**; the series counts paid orders, not rows; unique across all orders; one customer holds several orders with different references |
| Post-payment email (Resend) | fired only AFTER the paid transaction commits; the email carries the MCB reference, the customer's name, the package and format by DISPLAY name, the server-formatted amount, the correspondence instruction, "what happens next" and the MCB sign-off; sent as both html and text; authenticated with a Bearer key and an Idempotency-Key derived from the reference; **the API key never appears in a webhook response or the error log**; the internal order_id is never rendered; a replay sends no second email |
| Resend failure modes | HTTP 422 rejection, a 2xx with no message id, a 2xx with an empty body, and a provider timeout each leave the payment successful (webhook still 200), the order PAID, the reference issued, and the claim RELEASED so the email can be retried |
| Post-payment email | fired only AFTER the paid transaction commits; payload carries the MCB reference, customer and amount; **carries no Stripe or config secret**; a webhook replay does not send a second email; a second event for an already-paid order does not either; a Make.com outage releases the claim so the customer still shows as owed their reference, and never fails the payment; an unconfigured webhook skips without consuming the claim |
| Reconciliation | a paid session no order claims is **persisted, not just logged**; buyer identity and amount retained from Stripe; minor units converted; no order invented and no reference issued for it; webhook retry does not duplicate the alarm; a `client_reference_id` naming nothing is filed too; staff list it, attach it to the real order, and the reference is issued **through the same single path**; double reconciliation, moving a payment onto an already-paid order, unknown payment/order and malformed input all refused |
| Reference lookup | customer retrieves their own by Stripe session id; returns the reference and nothing else; unknown session answers `reference: null` rather than erroring on the webhook race; malformed and injected session ids rejected before the query; staff retrieve the whole order by the quoted reference |
| Security | config, lib and data denied over HTTP; cross-origin writes rejected; malformed JSON rejected; SQL injection stored literally, tables intact |

## A bug these tests caught

`Authorization` was invisible to PHP under Apache — present via
`getallheaders()` but absent from `$_SERVER['HTTP_AUTHORIZATION']`. Both
authenticated endpoints returned 401 for valid credentials, and would have done
the same on Hostinger. Fixed in `lib/security.php` and `api/.htaccess`.
