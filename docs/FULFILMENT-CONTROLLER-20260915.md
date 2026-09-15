# MCB™ Fulfilment Controller & Customer Delivery Automation

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `cf92949f`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO SUPPLIER PURCHASE. NO REFUND. NO PAID API. NO SECRETS. ENFORCEMENT STAYS ADVISORY.**

MCB is the middleman. Specialist partners make and ship; MCB owns the customer experience. There is no warehouse, courier account, shipping label, inventory or autonomous purchase. Automation prepares, calculates, validates, queues and notifies. People decide and spend.

## 1. One lifecycle, with records around it

```
PAYMENT VERIFIED → CREATIVE READY → PRODUCTION READY → MANUFACTURING PACKAGE READY
→ FULFILMENT.READY (= founder financial approval required; expected economics recorded)
→ Bella OR Lewis authorises (own code)          FULFILMENT.AUTHORISED (= supplier order required)
→ supplier order placed BY A PERSON → recorded  FULFILMENT.CONFIRMED (+ FULFILMENT.PARTNER_ORDER_RECORDED per partner order)
→ parcels: AWAITING_DISPATCH → DISPATCHED → IN_TRANSIT / DELAYED → DELIVERED (or LOST)
→ every required parcel delivered, nothing blocking open → DELIVERED → ORDER.COMPLETED
→ FOLLOW_UP.DUE → FOLLOW_UP.SENT → REVIEW.REQUESTED   (their own clocks)
```

- **One state machine.** The existing lifecycle (`lib/operations.php`) is unchanged: states are still derived from `order_production`.
- **Supporting records.** The controller (`lib/fulfilment-controller.php`) adds supplier orders, shipments, exceptions, economics snapshots, evidence, permissions and hooks. No second state machine can disagree with it.
- **Events.** FULFILMENT.PARTNER_ORDER_RECORDED, SHIPMENT.PARCEL_DISPATCHED, SHIPMENT.IN_TRANSIT, SHIPMENT.PARCEL_DELIVERED, FULFILMENT.EXCEPTION_OPENED, FULFILMENT.EXCEPTION_RESOLVED, COMMERCIAL.ECONOMICS_CALCULATED. The model's SUPPLIER.ORDER_RECORDED still maps to FULFILMENT.CONFIRMED.

## 2. Financial authority

- **Who.** Only Bella or Lewis, with their own code (`AUTHORISE_SUPPLIER_PURCHASE`). Refusals are audited and locked out after 5 in 15 minutes.
- **Links.** A notification link opens the protected page only. It authorises nothing.
- **Acknowledgements.** Where the decision card needs them, the founder also ticks:
  - `destination_acknowledged`: the destination is not verified and will be checked at the partner checkout.
  - `commercial_acknowledged`: the expected economics are incomplete or a safety exception is open.
  - Both are recorded on the FULFILMENT.AUTHORISED event with the destination status, economics status and snapshot id.
- **Founder-only resolutions.** These need the same code check:
  - PARTIAL_DELIVERY_ACCEPTED
  - SUBSTITUTION_APPROVED
  - REFUND_TO_BE_HANDLED_BY_FOUNDER (a record of a founder's decision; no refund is issued by code)
  - PROCEED_AT_PAID_PRICE

## 3. Founder decision card

The protected order page shows:
- order, product, payment VERIFIED, MCB QC, manufacturing package status and blockers;
- delivery destination (**town and country only**);
- each supplier route: partner, shipping model, verification, estimates and limitations;
- expected purchase, expected delivery provision (plus contingency and handling where approved), total expected internal cost;
- customer revenue, estimated gross contribution and %;
- commercial check status and missing data;
- enforcement mode and **what would block under REQUIRED**;
- the action: Bella or Lewis authorises.

It never shows a story, photograph, street address, contact detail or secret.

## 4. Profitability safety

- **Revenue.** What the customer paid (`orders.total_minor`).
- **Costs.** Per physical line: the route's expected purchase cost × quantity. Per route (once): expected supplier shipping, plus any approved contingency and handling.
- **Output.** Total, contribution and margin (basis points).
- **Excluded:** VAT, payment processing fees, creative production time and marketing costs.
- **Statuses:**
  - **COMMERCIAL_DATA_REQUIRED:** no route, no expected purchase cost, no expected supplier shipping, or a different currency. The missing items are named, and nothing is estimated.
  - **COMMERCIAL_SAFETY_EXCEPTION:** contribution below `fulfilment.commercial_safety.min_contribution_minor` (default 0, so negative only), or below the optional `min_margin_basis_points`. This opens a non-blocking exception and sends COMMERCIAL_SAFETY_EXCEPTION to the Founders, once.
- **New sales.** With `suspend_new_sales` (default off), the SKU is also suspended for new sales (CURRENTLY UNAVAILABLE) and the Founders are told.
- **Paid orders.** A paid order is never cancelled, changed, refunded or re-priced. A founder resolves the exception, normally PROCEED_AT_PAID_PRICE.
- **Actual economics.** Recorded supplier orders give actual cost, contribution and the variance against expected. A negative actual contribution is recorded for the Founders, never charged to the customer.
- **Snapshots.** Stored in `order_economics` by content hash, so checking twice stores once.

## 5. Supplier routes (server-only)

`api/data/supplier-routes.json` is uploaded to the server only (403 over HTTP, never committed). Per route:
- route id, SKUs, supplier, product URL (https), configuration;
- destinations (`supported`, `check_required`, `unsupported`), shipping model, currency;
- expected purchase cost;
- `internal_allowance` (expected supplier shipping, shipping contingency, MCB handling allowance);
- checkout shipping required;
- production and delivery estimates, tracking capability (FULL / PARTIAL / NONE / UNKNOWN), customs position;
- order instructions, cancellation cut-off, damage reporting, replacement route;
- authorised fallback route (only if `fallback_authorised`);
- limitations;
- verification status, source and last verified date.

**VERIFIED** requires a source and a date. Nothing missing is filled in. The older `supplier-orders.json` is read as unverified routes with unknown destinations.

## 6. Delivery routing and allowances

- **Routing states** (server-only names): VERIFIED_FIXED_OR_FREE, DESTINATION_CALCULATED, MARKETPLACE_LISTING_DEPENDENT, MANUAL_FULFILMENT_REVIEW.
- **Allowance parts** are kept separate: EXPECTED_SUPPLIER_SHIPPING, SHIPPING_CONTINGENCY, MCB_FULFILMENT_HANDLING_ALLOWANCE, TOTAL_INTERNAL_FULFILMENT_ALLOWANCE. No value is set in code.
- **Internal allowances are never a customer charge.** The customer is quoted only from the authorised rate table (`lib/delivery.php`, unchanged). The acceptance suite proves the quote is byte-identical with and without supplier routes on the server.

## 7. Destination validation

| Result | When |
|---|---|
| DESTINATION_SUPPORTED | a VERIFIED route lists the country |
| DESTINATION_CHECK_REQUIRED | marketplace listing or manual review model; the route lists the country as check-required; or the route is unverified |
| DESTINATION_UNSUPPORTED | the route excludes the country: authorisation is refused (raise DESTINATION_PROBLEM for a founder) |
| DESTINATION_UNKNOWN | no route, no address, destinations not recorded, or the country is not listed. **Never treated as supported.** |

- **ADVISORY:** CHECK_REQUIRED and UNKNOWN need `destination_acknowledged`.
- **REQUIRED:** UNKNOWN blocks.

## 8. Supplier order workspace and recording

- **Workspace.** Appears only after authorisation, and is STAFF ONLY. It lists each line's partner, product link (opens in a new window; no credential in any URL), configuration, instructions, cancellation cut-off, and whether to verify the destination at the partner checkout.
- **Production materials.** Production files, audio and delivery details stay in the supplier order pack (Production File Factory). Nothing checks out or pays.
- **Recording.** `RECORD_SUPPLIER_ORDER` (or `CONFIRM_FULFILMENT` with a reference) records:
  - reference, route, SKUs, purchase time, operator, founder authoriser;
  - expected and actual purchase, shipping and total cost;
  - currency, expected dispatch and delivery dates, tracking pending;
  - confirmation reference and notes.
- **Rules:**
  - Refused before authorisation.
  - Refused if any text contains a card number (Luhn) or security-code phrase.
  - A variance needs a reason (SUPPLIER_PRICE_CHANGE, SHIPPING_VARIANCE, CURRENCY_VARIANCE, MARKETPLACE_VARIANCE, MANUAL_ADJUSTMENT, OTHER).
  - Duplicate references are refused.
  - A split order records one supplier order per partner.

## 9. Parcels, tracking, split delivery, completion

- **Shipments.** An order can have many parcels (`shipments`), each linked to a supplier order, with carrier, tracking reference, https tracking link, dispatch date, estimated and actual delivery date, state, and whether it is required.
- **Dispatch.** The first parcel dispatched moves the order to DISPATCHED and sends DISPATCHED. Each later parcel sends ADDITIONAL_PARCEL_DISPATCHED, with its own tracking.
- **Delays.** A DELAYED parcel opens a non-blocking PARCEL_DELAYED (or TRACKING_STALLED / CUSTOMS / SUPPLIER_DELAY) exception, notifies DELIVERY_EXCEPTION once, and optionally sends DELIVERY_UPDATE.
- **Delivery.** Delivered and completed only when **every required parcel is delivered and no blocking exception is open**. A parcel delivered early says `partial`.
  - The old whole-order MARK_DELIVERED refuses when there is more than one parcel.
  - The single-parcel path keeps parcel 1 in step.
- **Lost parcels.** A LOST parcel opens a blocking PARCEL_LOST exception. Resolving it as REPLACEMENT_ARRANGED requires a later replacement parcel, which releases the lost one. PARTIAL_DELIVERY_ACCEPTED (founder) releases outstanding parcels.
- **Completion** is independent of follow-up, review, marketing and testimonial. At completion, lifecycle hooks are prepared.

## 10. Customer page and messages

- **Customer page.** Progress stays ORDER RECEIVED / CREATING YOUR MEMORY / QUALITY CHECK / BEING MADE / ON THE WAY / DELIVERED. With more than one parcel it lists each parcel as *Being made*, *On its way* or *Delivered*, with carrier and tracking. It never shows a partner, route, cost, founder, QC detail or exception. Lost or cancelled parcels are not shown.
- **Messages.** All one-way; replies go to support@mycustombeats.com, never WhatsApp.
  - IN_PRODUCTION
  - DISPATCHED
  - ADDITIONAL_PARCEL_DISPATCHED (auto)
  - DELIVERY_UPDATE (staff choose): "we're dealing with it for you … nothing you need to arrange with anyone else"
  - DELIVERED (staff choose)
  - FOLLOW_UP
  - They never tell the customer to contact a partner and never mention economics.
- **Approved wording.** The fulfilment position and damage guidance are used verbatim from `src/data/legal/delivery.ts`. The guidance is always accompanied by "not a condition of getting help".

## 11. Support, evidence, substitution

- **Case kinds.** DAMAGED_OR_FAULTY, **WRONG_ITEM**, **MANUFACTURING_DEFECT**, DELIVERY_PROBLEM, INCORRECT_DETAIL. A physical report opens a linked, non-blocking fulfilment exception and sends CUSTOMER_SUPPORT_EXCEPTION to the Founders.
- **Evidence** (`POST /api/order-evidence`):
  - parcel photo, product photo, unboxing video reference (text only), other;
  - images identified by their bytes, 10 MB, private random-named files, audited staff download;
  - **optional**: a case is never refused or delayed for want of evidence.
- **Substitution:**
  - An ordinary product different from what was ordered raises a blocking SUBSTITUTION_APPROVAL_REQUIRED exception and is refused until a founder resolves it with SUBSTITUTION_APPROVED.
  - Staff closing it otherwise is not an approval.
  - Pop-Up Cards (delivery class CARD) keep their approved alternative rule: a required note that the alternative matches the occasion and style, recorded as AUTHORISED_CARD_ALTERNATIVE. No card SKU is currently in the catalogue.

## 12. Follow-up, review, permission, hooks

- **Follow-up and review** follow the existing clocks.
- **`RECORD_REVIEW_REQUEST`** (for a completed order) records a request made by WhatsApp, phone or email. It records nothing twice, refuses incentives, and publishes nothing.
- **Marketing content permission** (`RECORD_CONTENT_PERMISSION`) is separate from reviews:
  - scopes: REVIEW_QUOTE, PHOTOGRAPHS, SONG, LYRICS, STORY, VIDEO, MESSAGES;
  - granted only with how it was given and where the consent is kept;
  - withdrawal is recorded.
- **Hooks** (ANOTHER_MEMORY, ANNIVERSARY_FOLLOW_UP, JOURNEY_CHAPTER, RELATED_KEEPSAKE) are prepared at completion. No date is invented, nothing is sent, and marketing consent is required.

## 13. Metrics, scorecards, health, command centre (`GET /api/crm/fulfilment`)

- **metrics:**
  - supplier orders, spend, expected cost, variance;
  - payment→QC, QC→authorisation, authorisation→supplier order (hours);
  - supplier order→dispatch, dispatch→delivery, payment→delivery (days);
  - delayed, damaged, replacement, supplier-exception and destination-exception rates;
  - contribution per order.
- **scorecards (per route):**
  - fulfilments, purchase and shipping variance;
  - days to dispatch, days in transit, tracking reliability;
  - damage, wrong-item and cancellation rates;
  - exceptions and destinations.
  - No supplier is replaced automatically.
- **health (read-only):** paid order with no processing event; READY package with no founder notification; authorised with no supplier order; supplier order past expected dispatch with no parcel sent; parcel past estimated delivery; delivered not completed; completed with no follow-up; abandoned notification; unresolved exception. Findings also reach the queue.
- **today:** new paid orders and revenue, creating, QC required, founder approvals required, supplier orders required, dispatched, delivered today, open exceptions, estimated and actual contribution.

## 14. Notifications and the bridge

- **New founder types:** COMMERCIAL_SAFETY_EXCEPTION, MANUFACTURING_DATA_REQUIRED (was sent as FULFILMENT_EXCEPTION) and DELIVERY_EXCEPTION.
- **Existing types kept:** NEW_ORDER_READY_FOR_PROCESSING, FULFILMENT_APPROVAL_REQUIRED, FULFILMENT_EXCEPTION, CUSTOMER_SUPPORT_EXCEPTION.
- **Payloads** keep the safe allow-list.
- **Bridge.** It acknowledges with channel TELEGRAM, EMAIL_FALLBACK, STAFF_QUEUE (or EMAIL/OTHER). No TaskNotify or Telegram credential exists, and nothing blocks on Telegram: undelivered notifications stay in the outbox and the staff queue.

## 15. ADVISORY and REQUIRED

**Enforcement stays ADVISORY.** Under REQUIRED, authorisation would additionally be blocked by:
- a non-READY manufacturing package (existing);
- DESTINATION_UNKNOWN;
- COMMERCIAL_DATA_REQUIRED;
- an unresolved COMMERCIAL_SAFETY_EXCEPTION.

DESTINATION_UNSUPPORTED blocks in both modes. The decision card lists these today.

## 16. Database — prepared, not run

`db/migrations/2026-09-15-fulfilment-controller.sql` is additive and idempotent. Applied to the previous schema it equals a fresh `db/schema.sql` (tested).
- **Tables:** order_economics, supplier_orders, shipments, fulfilment_exceptions, support_evidence, customer_content_permissions, lifecycle_hooks.
- **ENUM additions:** support kinds WRONG_ITEM and MANUFACTURING_DEFECT; message types ADDITIONAL_PARCEL_DISPATCHED, DELIVERY_UPDATE, DELIVERED.
- **Preflight checks:** `fulfilment_controller_migration_applied` and `supplier_routes`.
