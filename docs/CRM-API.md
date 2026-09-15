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

Header `Idempotency-Key: <16–128 chars of A-Z a-z 0-9 _ ->` is required.

```json
{
  "firstName": "Ada", "lastName": "Lovelace",
  "email": "ada@example.com", "whatsapp": "+447700900000",
  "lines": [
    { "sku": "keepsake-7-picture-disc", "quantity": 2 },
    { "sku": "priority-replacement", "quantity": 2 }
  ],
  "shippingName": "Ada Lovelace", "shippingAddress": "1 Analytical Street",
  "shippingAddress2": "Flat 2", "shippingCity": "London",
  "shippingState": "Greater London", "shippingPostcode": "E1 6AN",
  "shippingCountry": "United Kingdom",
  "mood": "Romantic", "genre": "Acoustic",
  "personalTouches": "Names and the date",
  "cruiseCompanions": "My husband", "story": "How we met…", "artworkUrl": "https://…",
  "consents": { "TERMS": true, "SERVICE_START": true },
  "termsVersion": "2026-09-09.4",
  "referral": "rey123", "partner": ""
}
```

`201` → `{ "order_id": 42, "checkout_token": "<64 hex>", "fulfilment_type": "PHYSICAL", "source_type": "AFFILIATE", "total_minor": 23798, "currency": "GBP", "lines": [ … ] }`

The same key with the same body returns `200` with the same `order_id`, `"replayed": true` and a fresh `checkout_token`. The same key with a different body is `409 idempotency_conflict`.

`checkout_token` is returned once and stored only as a hash. `POST /api/checkout/session` requires `{ orderId, checkoutToken }` and builds the Stripe session from the saved order lines.

### Server-owned — sending these changes nothing

Every price and total · `fulfilment_type` · `source_type` · `affiliate_id` · `partner_id` · `status`

A browser can report the referral string it saw. It cannot name an affiliate,
claim a partner, set a price or mark an order paid. Verified by test.

### Rules enforced here

Read from `api/data/catalogue.json`, generated from `src/data/catalogue/`.

- `lines` is 1–20 entries of `{ sku, quantity }`; quantity is an integer 1–50 (a technical request limit, not a commercial maximum); no SKU twice.
- Only SKUs sold online are accepted. Bespoke and MCB LIVE are quoted and are not orderable.
- At least one song experience (Moment, a Keepsake or a Journey).
- `priority-replacement` quantity may not exceed the number of Keepsakes in the order.
- A delivery address is required when any line is physical.

`422` — validation failed or a line rule broken (`unknown_sku`, `invalid_quantity`, `duplicate_sku`, `no_song_experience`, `priority_replacement_ineligible`). `400` — missing Idempotency-Key. `403` — cross-origin. `503` — not configured.

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
  -> POST https://api.resend.com/emails  (Bearer resend.api_key)
  -> Resend delivers the email
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

While `resend.api_key` or `resend.from` is empty the notification is skipped
and logged, and the claim is deliberately **not** taken, so configuring them
later and replaying the Stripe event still delivers.

`GET /api/crm/orders` returns `customer_notified_at`; `null` on a PAID order
means that customer has not yet been sent their reference.

### The email

Built server-side from the same payload, so there is one data model. It
contains the customer's name, the **MCB reference**, the package and format by
their display names, the amount paid (server-formatted, e.g. `£10.00`), the
delivery promise, "what happens next", and the MCB sign-off.

Sent as both `html` and `text`. The HTML uses the MVIS palette so the
reference looks the same in the inbox as on the thank-you page, with inline
styles and no remote images — email clients strip `<style>` blocks and block
remote assets by default.

Every interpolated value is HTML-escaped: the customer's name is free text
from the order form, and unescaped it would render as markup in the inbox.

**Never in the email:** the internal `order_id`, the customer id, any Stripe
identifier, and the creative brief or story. The MCB reference is the only
number a customer is given.

An `Idempotency-Key` derived from the reference is sent with each request.
That is a provider-side safety net for the narrow case where Resend accepts a
send but the response is lost: the claim is released, a replay retries, and
Resend returns the original result rather than delivering twice. Resend
expires these after 24 hours; the database claim remains the durable
guarantee.

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

---

## Operations after payment (Sprint 5)

Full runbook: `docs/OPERATIONS-RUNBOOK.md`. All CRM endpoints need `Authorization: Bearer <crm_api_key>`.

| Endpoint | Purpose |
|---|---|
| `GET /api/crm/operations?view=queue` | Derived action and exception queue |
| `GET /api/crm/operations?q=…` | Find by MCB reference, email, order number, `LIVE-`/`FP-` reference |
| `GET /api/crm/operations?order=41` | State, next action, available actions, quality check, reveal, fulfilment, tracking, requests, notes, emails, active links (no tokens), timeline |
| `GET /api/crm/operations?enquiry=LIVE-…` / `?view=live-enquiries` | MCB LIVE and Bespoke enquiries |
| `POST /api/crm/operations` | `ACKNOWLEDGE` a queue item; `ENQUIRY_STATUS` |
| `POST /api/crm/order-action` | Staff actions (state-checked, audited, idempotent emails) |
| `GET /api/crm/automation-events` | Automation-ready events, two cursors (order events now carry `source`) |
| `GET /api/crm/artwork?order_id=41` · `POST` (multipart) · `GET ?artwork_id=&download=1` | Production artwork plan with template metadata; register an output (automated technical QC); download it |
| `GET/POST /api/crm/notifications` | Founder notification outbox: list, `?view=health`, `CLAIM`, `ACK`, `REQUEUE` (worker key or CRM key; `REQUEUE` CRM only) |
| `GET/POST /api/crm/product-sales` | Suspend / resume NEW sales of a SKU or product |
| `GET/POST /api/crm/creative` | Creative Factory: jobs, versioned documents, QC actions, masters, album and capacity QC, `?view=metrics`, `?view=providers` (`staff` required on reads; access logged) |
| `GET/POST /api/crm/production-files` | Production File Factory: artwork jobs (minimal input), photo preparation, Creative Art Masters, visual QC, render jobs, print masters, manufacturing package, staff-only supplier order pack, `?view=limits`, audited downloads |
| `POST /api/crm/artwork` (multipart) | Register a versioned Print Production Master rendered from a visually-passed art master (file QC; safe-zone review) |
| `GET/POST /api/crm/creative-file` | Register a manual candidate or a derived master (multipart); download audio (audited) |
| `GET/POST /api/crm/video` | Memory Music Video production (staff name required, audited): `?order_id=` jobs with inputs, candidates, masters and capacity; `?view=capacity`, `?view=metrics`; `?download=media\|candidate\|master\|audio&id=`. POST `CONFIRM_INPUTS`, `SET_VISUAL_DIRECTION`, `DURATION_REVIEW` {decision}, `START_PRODUCTION`, `VIDEO_QC` {candidate_id, criteria, outcome}, `REVEAL_VIDEO` {send_email}, `RELEASE_CAPACITY` {note}, `RECORD_PRODUCTION_COST` {cost_minor, note}; multipart `REGISTER_CANDIDATE` (order_id, reference, video_job_id, video); `SET_PERIOD_CAPACITY`, `DEFINE_PERIOD`, `ALLOCATE_CAPACITY` {entitlement_id, customer_agreed} |
| `GET/POST /api/crm/command-centre` | Founder Command Centre (staff/founder; staff name required): `?view=overview&period=today\|week\|all`, `orders&stage=`, `order&order_id=`, `quality&order_id=` (access audited), `approvals`, `customers`, `health`, `readiness`, `notifications&filter=needs_action\|delivered\|failed\|all`, `search&q=` (never recorded), `advanced&order_id=`. POST `SONG_QUALITY_CHECK` {order_id, candidate_id, answers, decision PASS\|REWORK\|ESCALATE, note?} and `ARTWORK_QUALITY_CHECK` {order_id, art_master_id, answers, decision, note?}. Financial decisions stay on `crm/order-action` with a founder code |
| `GET /api/crm/fulfilment` | Fulfilment Controller read models (INTERNAL): `?view=today` (founder command centre), `metrics`, `scorecards` (per supplier route), `health` (stranded orders), `order&order_id=`; `?evidence_id=&staff=` downloads support evidence (audited) |
| `POST /api/crm/order-action` — Fulfilment Controller actions | `RECORD_SUPPLIER_ORDER` {supplier_order_reference, skus?, actual_purchase_cost_minor?, actual_shipping_cost_minor?, variance_reason?, expected_dispatch_date?, expected_delivery_date?, confirmation_reference?, notes?, substitute_sku?}; `ADD_SHIPMENT` {supplier_order_id?, skus?, required?}; `MARK_SHIPMENT_DISPATCHED` {shipment_id, carrier, dispatched_on, tracking_reference?, tracking_url?, estimated_delivery_date?}; `UPDATE_SHIPMENT` {shipment_id, state IN_TRANSIT/DELAYED, notify_customer?}; `MARK_SHIPMENT_DELIVERED` {shipment_id, delivered_on}; `MARK_SHIPMENT_LOST` {shipment_id}; `RAISE_FULFILMENT_EXCEPTION` {type, detail?, blocking?, shipment_id?, next_action?, notify_customer?}; `RESOLVE_FULFILMENT_EXCEPTION` {exception_id, resolution, note, founder+founder_code+confirm for founder-only resolutions}; `RECORD_REVIEW_REQUEST` {channel}; `RECORD_CONTENT_PERMISSION` {scope, status, granted_via, evidence_reference}. `AUTHORISE_SUPPLIER_PURCHASE` now also takes `destination_acknowledged` and `commercial_acknowledged` where the decision card needs them. |

Public (same-origin, rate-limited, token in body):

| Endpoint | Purpose |
|---|---|
| `POST /api/order-progress` `{token}` | Customer progress page |
| `POST /api/order-approval` `{token}` | **Retired** (Single Creative Authority): always `{retired: true, message}`, records nothing |
| `POST /api/order-support` `{token, kind, item?, priorityReplacement?, description}` | Report a problem or ask a question. Kinds add `WRONG_ITEM` and `MANUFACTURING_DEFECT`; the reply carries `request_id` and `evidence: {accepted, required: false}` |
| `POST /api/order-evidence` (multipart) `token, request_id, kind, photo? \| reference?` | Optional evidence for a report (photo ≤ 10 MB, or where a recording is kept). Never required for help |
| `GET /api/video-availability` | Memory Music Video availability from the capacity ledger: `{available, message, remaining (only when ≤ 10), price_minor, period}` |
| `POST /api/video-offer-event` `{event, productId}` | Offer counters (OFFER_VIEWED, SELECTED, DESELECTED) — no personal data |
| `POST /api/order-video` `{token, videoJobId, download?}` | A ten-minute signed link to the customer's revealed video; `GET /api/order-video?o=&m=&e=&d=&s=` streams it (Range) |
| `POST /api/order-video-media` | Multipart `token, videoJobId, rightsConfirmed=yes, photo` adds a video photograph; JSON `{token, videoJobId, action: "PHOTOGRAPHS_DONE"}` |
| `POST /api/live/enquiry` | MCB LIVE enquiry → `LIVE-YYYY-XXXXXX` |
| `GET /api/product-availability` | Public: SKUs/products currently unavailable for new orders (identifiers only) |
