# Sprint 2 — canonical catalogue and commerce foundation
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. NOT APPROVED FOR PRODUCTION.** Online checkout remains switched off (client flag and server config).

## Source of truth

`src/data/catalogue/products.ts` (types in `types.ts`, rules in `validate.ts`, helpers in `index.ts`). Product → Variant → `Money { currency: "GBP", minor }`. `scripts/generate-catalogue-json.mjs` validates it and writes `public/api/data/catalogue.json`, which is the only price data PHP reads. The generator deletes its outputs before compiling, so an invalid catalogue fails the build and leaves no stale server data; `--check` (run by `npm test`) fails on drift.

## Commerce flow

1. Browser sends SKUs and integer quantities with an `Idempotency-Key`.
2. `POST /api/order` prices every line from `catalogue.json`, stores all lines with integer pence and `orders.total_minor`, and returns a checkout token (HMAC of order id + idempotency key; stored only as a hash).
3. `POST /api/checkout/session` takes `{ orderId, checkoutToken }` only and builds the Stripe session from the saved lines. Wrong token = unknown order = 404. Expired sessions are replaced; their snapshots are kept as `EXPIRED`.
4. Webhook marks PAID only on exact order, currency and amount. Under/over/missing amount, wrong currency, disagreeing identifiers and second payments are filed in `unreconciled_payments` for review.
5. After PAID: Resend confirmation (existing) and an optional signed `order.paid` operations notice without contact details, address or story (`lib/ops.php`, dormant until configured).

Payment Links and the browser Make.com webhook are removed from the application.

## Decisions recorded

- `dist/` is no longer tracked. The documented deployment builds and uploads `dist/`; the committed copy was stale (old prices, pre-fix webhook). Deploy only a fresh build of the approved commit.
- Order-form submission is refused client-side while checkout is closed, so no unpayable orders are created.
- Keepsake quantity is unlimited commercially; one request line is capped at 50 units and an order at 20 lines as technical limits only.
- Keepsake revisions follow the founder terms' "1 refinement per song".
- Structured data: made-to-order variants use `MadeToOrder` availability; Journey has no `variesBy` (both records are 12-inch); Bespoke and MCB LIVE are `Service` with no Offer.
- Privacy and refund text changed (Make.com data flow; "Full Package" → "Bespoke") without a policy version bump — that is a founder/legal decision before release.

## Requires founder confirmation

- Journey positioning line "Every chapter of your story, on record." and the plaque/player short descriptions are working copy.
- Plaque size "approx. 8 × 12 inches" is shown as approximate; not independently verified.
- Cruise Ship DJ Bible fulfilment is unconfirmed, so it is priced but not orderable and has no page.
- Priority Replacement claim window (7 days) is carried from the founder branch.
- Privacy/refund policy version and effective date for the changed wording.
- Stripe: enable Checkout Sessions (test mode first), subscribe the webhook to `checkout.session.completed` and `checkout.session.async_payment_succeeded`, apply `db/migrations/2026-09-14-canonical-catalogue.sql`, and retire the old Payment Links in the Stripe Dashboard.
