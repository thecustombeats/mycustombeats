# Sprint 4 — secure order persistence and Stripe TEST-mode checkout
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. LIVE CHECKOUT OFF.**
The shipped `config.example.php` keeps `checkout_sessions_enabled => false`, `live_checkout_approved => false` and `use_test_fixtures => false`.

## The transaction

```
/create  choose → personalise each memory → finishing touches → details → Review
Review   POST /api/order-quote          server prices the lines and quotes delivery
Pay      POST /api/order                server saves order, units, memories, consents, address (idempotent)
         POST /api/order-upload ×n      each photo, attached to its memory or plaque
         POST /api/order-status         server confirms the order is ready
         POST /api/checkout/session     TEST Checkout Session built from the SAVED order
Stripe   signed webhook                 exact order + currency + amount + mode → PAID + one MCB reference
/thank-you GET /api/order-reference     verified only by the server's reference
```

## What existed and was kept

Canonical catalogue and server pricing (`lib/catalogue.php`); hashed 256-bit checkout token; idempotent order creation; session built from saved lines with deterministic Stripe idempotency keys, reuse and expiry replacement; signature-verified webhook with snapshot amount matching, `stripe_events` idempotency, `unreconciled_payments`; reference minted once inside the PAID transaction; post-commit Resend confirmation with a conditional claim; consent evidence; hardened thank-you page; CRM read surface and reconciliation.

## What changed

| Area | Change |
|---|---|
| Personalisation | `lib/personalisation.php`: per song product (`order_units`) and per memory (`order_memories`); Keepsake memory counts 1/1/3/4, Journey 6/12; one experience per order; several units only for Keepsakes; 300-character story and every other limit refused, never truncated; styles, occasions and countries validated against `data/personalisation.json` (generated from `src/data/`); `lines` must be exactly what the personalisation implies; plaque (title, artist, photo required), frame (size, which song, heading), players |
| Formats | Each unit snapshots the catalogue format: Keepsake picture disc size/shape; Journey `picture_disc = 0`, 1 disc (6) or 2-disc gatefold (12) |
| Priority Replacement | Chosen per Keepsake (`order_units.priority_replacement`), never preselected; line quantity must equal the Keepsakes that chose it |
| States | `orders.status` adds `PAYMENT_REVIEW`, `CANCELLED`. `PENDING` + `personalisation_status` + open session express draft / ready / payment-pending |
| Audit | `order_events`: ORDER.CREATED, PERSONALISATION.COMPLETE, UPLOAD.ATTACHED, CHECKOUT.SESSION_CREATED, PAYMENT.RECEIVED, ORDER.PAID, PAYMENT.REVIEW, CUSTOMER.CONFIRMATION.DUE/SENT — identifiers and amounts only |
| Delivery | `lib/delivery.php`: NOT_REQUIRED / QUOTED / UNAVAILABLE. **No production rates exist.** Rate-table shape defined (`data/delivery-rates.json`, absent). `TEST_ONLY_DELIVERY_RATES` used only with a test key AND `delivery.use_test_fixtures`; refused with a live key; fixture-quoted orders refused in live checkout; labels say TEST ONLY. `total_minor` is now subtotal + delivery; Stripe receives delivery as a fixed shipping amount |
| Uploads | After the order exists, token-authorised; JPEG/PNG/WebP/HEIC by signature (+ decode for JPEG/PNG/WebP), polyglot markup refused, 10 MB, 60/hour per source; random 64-hex names, no extension, outside the web root when `mcb-uploads` / `uploads.path` exists, else `api/storage/uploads` (denied); staff retrieval via CRM key as a sandboxed download; replacement deletes the old file |
| Stripe mode | `stripe_checkout_availability()`: test key → test; live key only with `live_checkout_approved === true`; anything else refused. `GET /api/checkout/status` is the site's only switch. Webhook requires `livemode` to match the key's mode, else MODE_MISMATCH; missing `livemode` is a mismatch |
| Webhook | Amount/currency mismatch on a known order → PAYMENT_REVIEW (never payable again online); exact payment for a non-PENDING order → ORDER_NOT_PAYABLE; mode recorded on the order |
| Email | A TEST-mode payment's confirmation goes only to `resend.test_recipient` with [TEST] in the subject, or is skipped unclaimed; separate Resend idempotency prefix. `test_mode_send_to_customer` is for the stub harness only |
| Staff | `GET /api/crm/order-personalisation` (production brief), `GET /api/crm/upload` |
| Browser | Checkout availability from the server (client flag removed); Review amounts from the server quote, sidebar included; pay flow with saving/uploading/opening states and plain-English errors; cancel returns to a "Your order is saved" resume panel (tab-only storage of order id + token); ISO country picker and region field; Priority Replacement per Keepsake; draft cleared after verified payment; `personalisation_complete` and `checkout_begin` analytics only after the server state is real |
| Apollo | Removed from `index.html`. Its tracker sent full page URLs on every view and click (including `/thank-you?session_id=…`), kept a persistent anonymous id, and loaded LiveIntent identity resolution (hashed email) — without consent and absent from the privacy inventory. No repository code or document depended on it. Reinstating it is a founder decision that needs consent, a privacy-policy entry and URL scrubbing |

## Migration

`db/migrations/2026-09-14-sprint4-order-persistence.sql` — additive plus two ENUM widenings; idempotent (applied twice to the Sprint 3.3 schema in MariaDB 11); the migrated schema is byte-identical to the new `db/schema.sql`. Rollback notes are in the file. **Not applied to production.**

## Verification (local, Docker, Stripe STUB)

- Node: 87/87 · TypeScript and build pass · lint 5 errors, all pre-existing in `src/components/ui/`.
- Backend acceptance: 1,176/1,176 — the seven existing suites (986, adapted only where behaviour intentionally changed) and `transaction-acceptance.sh` (190).
- Browser rehearsal through the real `/create` UI against the built site and API: Moment → PAID `MCB-2026-000001` → thank-you verified; mobile 7-inch Keepsake with photo, Priority Replacement and TEST_ONLY delivery (£118.99 + £4.95 = £123.94) → PAID `MCB-2026-000002`; cancel → resume reuses the same order and session; checkout closed on the server → no order created. No console errors. The Stripe redirect was intercepted in the browser; no request reached Stripe.

## Not done in this sprint

- **A real Stripe TEST-mode payment.** No Stripe test credentials are configured on this machine. See ACTION REQUIRED in the Sprint 4 report.
- Production delivery rates (supplier data required).
- Photo retention period; privacy inventory update (Cloudinary → MCB hosting) — BLOCKING in `src/data/legal/review.ts`.
- Bespoke, MCB LIVE, DJ Bible and gift vouchers: unchanged and not purchasable.
