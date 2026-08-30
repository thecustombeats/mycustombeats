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
`?cursor=120`

Returns order, attribution, customer name/email, and delivery address for
physical orders. **The creative brief and the customer's story are never
returned** — no downstream system needs them, so they do not leave the database.

Cursor pagination, stable under concurrent inserts.

---

## POST /api/stripe/webhook

Stripe only. Verifies the `Stripe-Signature` HMAC with a 5-minute tolerance,
then on `checkout.session.completed`: marks the order `PAID`, stores the session
and payment intent, and increments the affiliate's `sales`.

**The only place sales are ever incremented.** Idempotent via `UNIQUE` on
`stripe_events.event_id` — a replayed event returns 200 with
`{"outcome":"duplicate"}` and does not double-count.

`503` while `stripe.webhook_secret` is unset: an unverified payment webhook
would let anyone mark orders paid and award commission.

---

## Attribution

```
/?ref=USERNAME  or  /?partner=SLUG
  → captured once into localStorage          (single source of truth)
  → POST /api/affiliate/click                (affiliate only)
  → POST /api/order  { referral, partner }   → resolved server-side
  → Stripe client_reference_id = order_id
  → webhook → order → affiliate credited
```

Partner attribution takes precedence over affiliate: a partner relationship is
a commercial contract, a referral link is not. One attribution per order.

An unrecognised referral is kept in `referral_raw` for provenance but credits
nobody — the order stays `DIRECT`.

Onboarding a partner is one row in `partners`. No code or schema change.
