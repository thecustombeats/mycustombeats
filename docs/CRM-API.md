# MCB CRM — API

Base: `https://www.mycustombeats.com/api`

All responses are JSON. Errors carry a stable `error` token to branch on and a
`message` safe to show a customer.

```json
{ "error": "validation_failed", "message": "Please check the highlighted fields.",
  "fields": { "shippingCity": "Town or city is required." } }
```

Clean URLs (`/api/order`) and explicit ones (`/api/order.php`) both work.

---

## POST /api/order

Creates the authoritative order record. Called at form submission, **before**
Stripe, so an abandoned checkout still leaves MCB holding the customer, brief,
attribution and delivery address.

```json
{
  "firstName": "Ada", "lastName": "Lovelace",
  "email": "ada@example.com", "whatsapp": "+447700900000",
  "package": "keepsake", "format": "vinyl",
  "shippingName": "Ada Lovelace", "shippingAddress": "1 Analytical Street",
  "shippingAddress2": "Flat 2", "shippingCity": "London",
  "shippingState": "Greater London", "shippingPostcode": "E1 6AN",
  "shippingCountry": "United Kingdom",
  "mood": "Romantic", "genre": "Acoustic",
  "personalTouches": "Names and the date",
  "story": "How we met…", "artworkUrl": "https://…",
  "referral": "rey123", "partner": ""
}
```

`201` → `{ "order_id": 42, "fulfilment_type": "PHYSICAL", "source_type": "AFFILIATE" }`

`order_id` becomes Stripe's `client_reference_id`.

### Server-owned — sending these changes nothing

`fulfilment_type` · `source_type` · `affiliate_id` · `partner_id` ·
`amount_gbp` · `amount_usd` · `status`

A browser can report the referral string it saw. It cannot name an affiliate,
claim a partner, set a price or mark an order paid. Verified by test.

### Rules enforced here

| Package | Formats | Address |
|---|---|---|
| moment | mp3 | not required |
| keepsake | vinyl, cd, mp3 | required for vinyl/cd |
| journey | vinyl, cd | required |
| heirloom | vinyl, cd | required |
| bespoke | — | not required |

Read from `api/data/packages.json`, generated from `src/data/packages.ts`.

`422` — validation failed, unknown package/format, unsold combination, or a
physical order missing address fields. `403` — cross-origin. `503` — not
configured.

---

## POST /api/affiliate/register

```json
{ "name": "Rey Skywalker", "email": "rey@example.com", "username": "rey123" }
```

`201` → `{ "affiliate_id": 7, "username": "rey123", "referral_link": "…/?ref=rey123", "dashboard_token": "7.1790000000.a1b2…" }`

`409` — email or username already taken. Which one is deliberately not
disclosed: naming it would turn this into a way to test whether a given person
is an MCB affiliate.

The check and the insert are one transaction against `UNIQUE` constraints. Only
the SHA-256 of the token is stored, so the database cannot be replayed as a
login. **The token is shown once** — store it and email it.

---

## POST /api/affiliate/click

```json
{ "ref": "rey123" }
```

`204` always, including for an unknown ref — a 404 here would let anyone
enumerate usernames. Resolves, records and increments in one transaction. IPs
are stored as salted SHA-256, never raw. Rate limited to 30/hour per IP.

---

## GET /api/affiliate/dashboard

`Authorization: Bearer <dashboard_token>`

`200` → name, email, username, referral_link, clicks, sales, member_since.

**Does not accept an email parameter.** The previous implementation looked up
whatever email sat in `localStorage`, so anyone who knew an affiliate's address
could read their record. `401` for missing, forged, expired or superseded
tokens — including one edited to point at a different affiliate id.

---

## GET /api/crm/orders

`Authorization: Bearer <crm_api_key>`

The governed read surface for MCB OS and internal tooling. **Nothing consumes
it yet** — it exists so the boundary is established before anything depends on
it.

`?status=PAID` · `?fulfilment=PHYSICAL` · `?since=2026-01-01` · `?limit=50` ·
`?cursor=120` · `?reference=MCB-2026-000004`

`?reference=` is the staff lookup: a customer quotes their number, this returns
that one order. Matched exactly against the `UNIQUE` column, never as a pattern.

Returns order, attribution, customer name/email, and delivery address for
physical orders. **The creative brief and the customer's story are never
returned** — no downstream system needs them, so they do not leave the database.

Cursor pagination, stable under concurrent inserts.

---

## POST /api/stripe/webhook

Stripe only. Verifies the `Stripe-Signature` HMAC with a 5-minute tolerance,
then on `checkout.session.completed`: marks the order `PAID`, stores the session
and payment intent, **issues the customer's MCB reference**, and increments the
affiliate's `sales` — all in one transaction.

**The only place sales are ever incremented, and the only place a customer
reference is ever issued.** Idempotent via `UNIQUE` on `stripe_events.event_id`
— a replayed event returns 200 with `{"outcome":"duplicate"}`, does not
double-count, and does not issue a second reference.

`503` while `stripe.webhook_secret` is unset: an unverified payment webhook
would let anyone mark orders paid and award commission.

---

## GET /api/order-reference?session_id=cs_…

The customer's own reference, and nothing else.

`200` → `{ "status": "PAID", "reference": "MCB-2026-000004" }`

`200` → `{ "status": null, "reference": null }` while the webhook is still in
flight. The thank-you page polls for ~12s rather than treating that race as an
error. `400` for a session id that is not shaped like Stripe's.

Keyed on the Stripe session id because it is unguessable and known only to
Stripe, MCB and the person who completed that checkout. Keying on `order_id`
would let anyone walk the book. No name, email, address, brief, amount or
Stripe identifier is ever returned, so a leaked session id leaks a reference
and nothing more.

Not `/api/order/reference`: a directory at `api/order/` would make `/api/order`
a real directory, and the clean-URL rewrite skips real directories — which
would silently break order submission.

---

## GET /api/crm/unreconciled

Payments no order claims. **An empty list is the expected steady state; a row
here is money MCB has taken and cannot yet account for.**

`?include_resolved=1` also returns closed rows, as an audit trail.

Returns Stripe's own record of the buyer — email, name, phone, amount — which
is what staff need to find them and finish the order by hand. That is more
customer data than `/api/crm/orders` returns, so it sits behind the same CRM
key and is never exposed to a browser.

---

## POST /api/crm/reconcile

Attaches an orphaned payment to its real order and closes the ledger row.

```json
{ "session_id": "cs_live_…", "order_id": 42 }
```

`200` → `{ "reconciled": true, "order_id": 42, "mcb_reference": "MCB-2026-000007" }`

`404` unknown payment or order · `409` already reconciled, or that order is
already paid by a different session · `422` malformed input.

Runs the **same** transition as the Stripe webhook and calls the **same**
`assign_mcb_reference()`. There is still exactly one place a reference is ever
issued; this is a second door into it, not a second mechanism.

Use this rather than editing `orders` in phpMyAdmin. A hand-written `UPDATE`
is how an order ends up paid but referenceless — someone sets the status and
session id and forgets `mcb_reference`, or invents one.

---

## Reconciliation — a payment can never be silently lost

`/api/order` is best-effort so a CRM outage cannot stop someone paying. The
cost is a narrow window where money arrives and no order exists to receive it.

```
payment succeeds, no client_reference_id (or one naming nothing)
  → webhook files it in `unreconciled_payments`   (UNIQUE on session id)
  → GET  /api/crm/unreconciled     staff see it
  → POST /api/crm/reconcile        attach it to the real order
  → order PAID → MCB reference issued → CRM complete
```

The webhook never invents an order and never issues a reference to a payment
that has none — package, format and the creative brief are not in the Stripe
payload and cannot be guessed. It records the problem; a human completes it.

Before this table existed such a payment produced one `error_log` line on
shared hosting and nothing else, so a real sale could rotate out of an unread
log while Stripe showed it as collected.

---

## The post-payment customer email

The customer's confirmation email — the one carrying the MCB reference — is
triggered **server-side by the Stripe webhook, after the paid transaction
commits**.

```
webhook: PENDING -> PAID, reference issued, COMMIT
  -> claim: UPDATE orders SET customer_notified_at = NOW()
            WHERE id = ? AND status = 'PAID' AND customer_notified_at IS NULL
  -> POST config `make.post_payment_webhook`   { event: "order.paid", … }
  -> Make.com sends the email
```

It was previously fired from the **browser at form submission**, before
Stripe. That could not carry the reference — which does not exist until
payment is confirmed — and also emailed everyone who abandoned checkout.
The order-form webhook still fires for order capture and now carries
`stage: "SUBMITTED"` so the receiving scenario can route on it.

**Duplicate protection** is the conditional UPDATE above, not a hope that
Stripe delivers once. Exactly one caller can see `rowCount() === 1`.

**It can never fail a payment.** The call sits outside the transaction, never
throws, and the webhook returns 200 regardless — a non-2xx would make Stripe
retry a payment MCB has already banked. A delivery failure *releases* the
claim, so the order shows as still owed its email rather than being recorded
as sent.

**Recovery:** Stripe's **Resend** button re-delivers the same event id, which
returns `outcome: "duplicate"` — and notification is attempted on that path
too. That is the route to an order paid before this existed, or one whose
email failed during an outage.

While `make.post_payment_webhook` is empty the notification is skipped and
logged, and the claim is deliberately **not** taken, so configuring the URL
later and hitting Resend still delivers.

`GET /api/crm/orders` returns `customer_notified_at`; `null` on a PAID order
means that customer has not yet been sent their reference.

### Payload

Only what the email needs. No Stripe identifier, no secret, no creative brief.

```json
{ "event": "order.paid", "mcb_reference": "MCB-2026-000006", "order_id": 12,
  "customer": { "name": "…", "email": "…" },
  "order": { "package": "keepsake", "format": "vinyl", "fulfilment_type": "PHYSICAL" },
  "amount": { "value": 79, "currency": "GBP" } }
```

---

## Identity — four identifiers, one for the customer

| Identifier | Who it is for | When it exists |
|---|---|---|
| `orders.id` | internal only | form submission |
| `customers.id` | internal only | first order by that email |
| `stripe_session_id` / `stripe_payment_intent` | reconciling with Stripe | payment confirmed |
| **`orders.mcb_reference`** | **the customer** | **payment confirmed** |

`MCB-YYYY-NNNNNN`. `UNIQUE`, `NULL` until paid, immutable once issued.

**One customer may hold many orders, so `customers.id` is never `orders.id`.**
Order 3 and order 4 both belonging to customer 3 is normal and correct; they
carry two different references.

The running number is allocated from `reference_sequence`, one row per year,
under `SELECT … FOR UPDATE` inside the webhook's transaction. It counts **paid
orders**, not rows — so `MCB-2026-000002` really is the second sale of 2026, and
an abandoned checkout never consumes a number.

Issued after payment on purpose: a number handed out at form submission would
be quoted by people who never paid.

---

## Attribution

```
/?ref=USERNAME  or  /?partner=SLUG
  → captured once into localStorage          (single source of truth)
  → POST /api/affiliate/click                (affiliate only)
  → POST /api/order  { referral, partner }   → resolved server-side
  → Stripe client_reference_id = order_id
  → webhook → order PAID → MCB reference issued → affiliate credited
```

Partner attribution takes precedence over affiliate: a partner relationship is
a commercial contract, a referral link is not. One attribution per order.

An unrecognised referral is kept in `referral_raw` for provenance but credits
nobody — the order stays `DIRECT`.

Onboarding a partner is one row in `partners`. No code or schema change.
