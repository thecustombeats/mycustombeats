# MCB™ Automation Foundation + Production Artwork Specification

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `60209ec9`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION RUN. NO LIVE STRIPE. NO SUPPLIER PURCHASE. NO EXTERNAL NOTIFICATION, AI OR SUPPLIER CALL.**

This is the smallest foundation future automation needs. It is event-driven, idempotent, auditable and independent of any provider. It does not change the Single Creative Authority journey, and no customer approval is reintroduced.

---

## 1. Customer input is not production output

| | What it is | Rule | Where |
|---|---|---|---|
| **Source photograph** | What the customer uploads | Square (within 1%) and **≥ 2500 × 2500 px**. Larger squares pass. If the photo is not ready, the customer can choose the **£15 MCB Artwork Preparation Service**, charged once per order and priced by the server. | `lib/uploads.php`, catalogue rules (unchanged) |
| **Production output** | What MCB composes to the manufacturer's template | Exact template geometry (below) | `src/data/production/artwork.ts` → `api/data/artwork.json` (server only, HTTP 403) |

If an order has more unready photographs than the standard service covers (more than one), it becomes **ARTWORK_EXCEPTION** for internal review. No extra charge is made automatically.

## 2. Artwork template architecture

Every template has these fields: `id`, `version`, `kind`, `label`, `status`, `orientation`, `output_px`, `diameter_mm`, `bleed {min,max}{mm,px}`, `spine_allowance {top,bottom}`, `centre_hole_mm`, `centre_creative_exclusion`, `safe_inset_mm`, `trim_px`, `applies_to_skus`, `supplier_route` (always null, and never public), `qc` (the automated checks), `missing` (what the manufacturer has not supplied yet) and `notes`.

Statuses:
- **ACTIVE**: the supplied geometry is complete enough to check exact dimensions.
- **GEOMETRY_ONLY**: the physical size was supplied but the pixel canvas was not, so only the square shape is checked.
- **TEMPLATE_REQUIRED**: there is no manufacturer template, so the artwork is prepared by hand and never generated.

The generator refuses:
- a template for an unknown SKU;
- an ACTIVE template without an output size;
- a TEMPLATE_REQUIRED template that carries invented geometry;
- a photo-artwork SKU with no template.

### 12-inch sleeve (exactly as supplied)

| Template | Output | Bleed | Spine allowance | SKUs |
|---|---|---|---|---|
| `SLEEVE_12_FRONT` v1 (ACTIVE, portrait) | **3756 × 3827 px** | 3 mm ≈ 35 px | top 3 mm ≈ 35 px, bottom 3 mm ≈ 35 px | `journey-6` |
| `SLEEVE_12_BACK` v1 (ACTIVE, square) | **3756 × 3756 px** | 3 mm ≈ 35 px | — | `journey-6` |

Safe-area inset and trim size were not supplied; they stay `null` and are listed under `missing`.

### Picture discs

| Template | Diameter | Centre hole | Bleed | Creative centre exclusion | Pixel canvas |
|---|---|---|---|---|---|
| `PICTURE_DISC_12` v1 | **302 mm** | **≈ 7.23 mm** | 2–3 mm | ~1.5 in (38.1 mm) | not supplied |
| `PICTURE_DISC_10` v1 | **250 mm** | not supplied | 2–3 mm | ~1.5 in | not supplied |
| `PICTURE_DISC_7` v1 | **174 mm** | not supplied | 2–3 mm | ~1.5 in | not supplied |

Guidance recorded on each disc:
- extend the background 2–3 mm past the cut line where the template requires it;
- keep important content inside the safe zone and away from the outer edge;
- keep text and faces out of the central ~1.5-inch **creative exclusion zone**.

That zone is a separate field from the physical hole (`centre_hole_mm`); the two are never confused.

### Heart picture disc and double gatefold

`PICTURE_DISC_HEART` and `GATEFOLD_12_DOUBLE` (`journey-12`) are **MANUAL / TEMPLATE REQUIRED**. They carry no dieline, size, diameter or bleed. The order is routed to `ARTWORK.TEMPLATE_REQUIRED` and an `ARTWORK_EXCEPTION` founder notification, and appears in the staff queue.

Staff register hand-prepared artwork with the explicit confirmation `manual_template_confirmed=true` ("prepared to the manufacturer's own dieline"), and it is recorded as `manual`.

## 3. Artwork planning and technical QC

`order_artwork` holds one row per unit and component (a Journey has a front and a back). It is planned after payment, and refreshed idempotently when staff open the order, open the artwork panel or pass QC.

| Status | Meaning | Event |
|---|---|---|
| AWAITING_INPUT | no usable source photograph yet | — |
| INPUT_VALIDATED | artwork-ready source associated | `ARTWORK.INPUT_VALIDATED` |
| PREPARATION_REQUIRED | the source needs the £15 service | `ARTWORK.PREPARATION_REQUIRED` |
| TEMPLATE_REQUIRED | no manufacturer template | `ARTWORK.TEMPLATE_REQUIRED` + `ARTWORK_EXCEPTION` notification |
| EXCEPTION | internal review (e.g. `MULTIPLE_PREPARATION`) | `ARTWORK.EXCEPTION` + `ARTWORK_EXCEPTION` notification |
| READY | output registered and passed technical QC | `ARTWORK.READY` |

`POST /api/crm/artwork` (multipart, CRM key) registers an output. Automated technical QC checks:

| Check | Rule |
|---|---|
| `OUTPUT_PRESENT` | a file was uploaded |
| `FILE_TYPE` | PNG, JPEG or TIFF, identified by its own bytes |
| `EXACT_DIMENSIONS` | ACTIVE templates: width and height exactly as the template |
| `SQUARE_ASPECT` | GEOMETRY_ONLY discs: width = height |
| `ORDER_ASSOCIATION` | the order id, its MCB reference and the component all agree (no cross-order mismatch; another order's component is a 404) |
| `SOURCE_ASSOCIATION` | the source photograph belongs to the same order, or `manual_source` for a legacy order |
| `TEMPLATE_VERSION` | the template id and version declared match the plan |

- **On failure:** 422 `artwork_qc_failed` with each check result. Nothing is stored, and `ARTWORK.QC_FAILED` is audited.
- **On pass:** the file goes to private storage (`mcb-uploads/artwork/`, random name, 0600) with its SHA-256.

**QC gates fulfilment.** `PASS_QUALITY_CHECK` on a physical order is refused (`artwork_not_ready`) until every planned component is READY. No artwork is generated, no AI service is called, and creative judgement stays with MCB's quality check.

## 4. Event architecture

Every event goes to `order_events`:
- `INSERT IGNORE` on `(order_id, dedupe_key)`;
- a new `source` column: `STRIPE_WEBHOOK`, `STAFF`, `CUSTOMER`, `NOTIFICATION_WORKER` or `SYSTEM`;
- scalar detail only.

`GET /api/crm/automation-events` publishes the automation set, now with `source`. Where an existing event already meant the same thing, it is reused (`EVENT_MODEL` in `src/data/operations.ts`):

| Founders' model | Recorded event |
|---|---|
| ORDER.PAID | ORDER.PAID |
| ORDER.READY_FOR_PROCESSING / CREATIVE.PENDING | ORDER.READY_FOR_PROCESSING |
| CREATIVE.IN_PROGRESS | CREATIVE.IN_PROGRESS |
| CREATIVE.READY / QC.REQUIRED | QUALITY_CHECK.READY |
| ARTWORK.INPUT_VALIDATED / PREPARATION_REQUIRED / TEMPLATE_REQUIRED / READY | same names (new) |
| QC.PASSED / REVEAL.READY | QUALITY_CHECK.PASSED |
| QC.FAILED | QUALITY_CHECK.FAILED |
| FULFILMENT.READY / FULFILMENT.APPROVAL_REQUIRED | FULFILMENT.READY |
| FULFILMENT.AUTHORISED / SUPPLIER.ORDER_REQUIRED | FULFILMENT.AUTHORISED (new) |
| SUPPLIER.ORDER_RECORDED | FULFILMENT.CONFIRMED |
| SHIPMENT.DISPATCHED / SHIPMENT.DELIVERED | DISPATCHED / DELIVERED |
| REVEAL.SENT | REVEALED |
| FOLLOW_UP.DUE | FOLLOW_UP.DUE |
| FOLLOW_UP.SENT | FOLLOW_UP.SENT (new: only when the email actually went) |
| REVIEW.REQUESTED | REVIEW.REQUESTED (new: only when the request was sent) |
| (completion) | ORDER.COMPLETED |

A repeated delivery creates nothing new. That covers a replayed Stripe event, a different event id for the same payment, a repeated staff action and a refreshed artwork plan: no second order, email, fulfilment task, founder notification, supplier task or follow-up.

## 5. Founder notification outbox

**Table:** `founder_notifications`. One row per business occurrence, with a UNIQUE `dedupe_key`:
- `new-order:41`
- `fulfilment-approval:41:0`
- `qc-failed:41:0:2`
- `artwork-template-required:41`
- `artwork-exception:41:MULTIPLE_PREPARATION`
- `delivery-delayed:41:0`
- `fulfilment-blocked:41:0:DELIVERY_ADDRESS`
- `support:41:7`
- `sales-suspended:<sku>:<id>`

Each row is written in the same transaction as its cause. `NEW_ORDER_READY_FOR_PROCESSING` is written inside the PAID transaction, so a paid order can never lack its notification.

| Type | Raised when |
|---|---|
| NEW_ORDER_READY_FOR_PROCESSING | payment verified (webhook) |
| FULFILMENT_APPROVAL_REQUIRED | a physical order becomes FULFILMENT.READY |
| QC_EXCEPTION | FAIL_QUALITY_CHECK |
| ARTWORK_EXCEPTION | template required; several unready photos; unready source without the service |
| FULFILMENT_EXCEPTION | QC passed but fulfilment blocked; delivery delayed |
| CUSTOMER_SUPPORT_EXCEPTION | damaged/faulty, delivery problem or incorrect-detail report (a plain question stays in the queue) |
| PRODUCT_SALES_SUSPENDED | staff suspend new sales |

**Safe payload (allow-list):** `notification`, `title`, `reference`, `product` (catalogue names), `amount`, `payment` (VERIFIED / NOT_VERIFIED), `input` (COMPLETE / INCOMPLETE), `qc`, `supplier_order`, `state`, `reason` (a machine code), `required_action`, `action_url`, `test_payment`. Everything else is dropped. The payload **never** contains a story, photo, customer name, email, phone, address, payment credential, supplier credential or API secret.

### What a notification bridge consumes and acknowledges (Telegram / TaskNotify / email)

No Telegram or TaskNotify integration exists in this repository, and none was invented. A separately authorised worker holds its own provider credentials (bot token, chat ids, email credentials); MCB config never does.

1. **Authenticate** with `Authorization: Bearer <notifications.worker_key>`. This key (32+ characters) can only use `/api/crm/notifications`: it cannot act on orders or read the console.
2. **Claim:** `POST /api/crm/notifications {"action":"CLAIM","worker":"telegram-bridge","limit":10}` returns `notifications: [{id, claim_token, idempotency_key, type, payload, attempt, created_at}]`.
   - Due rows are PENDING, FAILED past their retry time, or DELIVERING with a claim older than 10 minutes (a worker that died).
3. **Deliver** `payload` over the channel. Use `idempotency_key` as the provider-side dedupe key, so a retried send is one message.
4. **Acknowledge:** `POST {"action":"ACK","id":…,"claim_token":"…","result":"DELIVERED","channel":"TELEGRAM"|"EMAIL"|"OTHER"}` or `"result":"FAILED","error_code":"telegram_timeout"`.
   - A FAILED result is retried with backoff (1, 2, 4 … 60 minutes).
   - After 8 attempts the row is **ABANDONED**. It then appears in the staff queue (`NOTIFICATION_FAILED`) and the health view, and staff can `REQUEUE` it (CRM key only).
   - A stale or wrong claim token gets 409. A repeated DELIVERED acknowledgement returns `already_delivered`.
5. **Email fallback** is the same contract with `channel: "EMAIL"`: an email worker can claim the same rows, or take over when a Telegram delivery is ABANDONED.

The existing dormant signed `order.paid` ops webhook stays as it was.

Suggested Telegram rendering (the bridge's job):

```
FULFILMENT APPROVAL REQUIRED
Order: MCB-2026-000123
Product: Keepsake — 12-inch Picture Disc
Customer payment: VERIFIED
MCB QC: PASSED
Supplier order: READY
[OPEN ORDER & APPROVE]  → action_url
```

## 6. Founder financial approval deep link

`action_url` = `https://www.mycustombeats.com/operations#order=MCB-2026-000123&action=AUTHORISE_SUPPLIER_PURCHASE`.
- The **fragment** holds only the reference and an action name. It never reaches a server log or Referer, and it carries no key, token, code or amount.
- `/operations` asks for the CRM sign-in first, then opens that order with the action preselected.
- The page shows the approval card: Order / Product / Customer payment VERIFIED / MCB QC PASSED / Supplier order READY.
- **The link authorises nothing.** Opening it changes no state.

## 7. Financial controls

- **Automation may** detect, prepare, validate, calculate, queue, notify, create file records and prepare an order for purchase.
- **It must not** purchase, transfer funds, refund, subscribe or commit money. No such call exists in the new code, and tests assert it.
- **Supplier spend needs Bella OR Lewis** to perform `AUTHORISE_SUPPLIER_PURCHASE` on the signed-in page, with:
  - `founder` BELLA or LEWIS;
  - `founder_code`: that founder's own code, verified with `password_verify` against `founders.<NAME>.authorisation_hash` in server config (the hash only, never the code);
  - `confirm: true`.
- **What is recorded:**
  - `supplier_purchase_authorised_by` and `supplier_purchase_authorised_at`;
  - `FULFILMENT.AUTHORISED` with founder, staff operator, method `FOUNDER_CODE`, IP hash and source `STAFF`.
  - Refusals are audited (`FULFILMENT.AUTHORISATION_REFUSED`, never with the code). Five refusals in 15 minutes lock the order's authorisation for 15 minutes (429).
- `CONFIRM_FULFILMENT` (the supplier order recorded as placed **by hand**) is refused until authorised (`founder_authorisation_required`).
- If no founder code is configured, authorisation answers 503 and preflight warns.

## 8. Completion, follow-up and review

- A digital order is **COMPLETED at the reveal**, and a physical order **at recorded delivery** (`ORDER.COMPLETED` with trigger REVEALED/DELIVERED).
- Follow-up and review run afterwards on their own clocks: COMPLETED → FOLLOW_UP.DUE → FOLLOW_UP.SENT → REVIEW.REQUESTED.
- A failed follow-up email leaves the order COMPLETED. It shows as `MESSAGE_FAILED` in the queue and can be retried; `FOLLOW_UP.SENT` is recorded only when an email is actually sent.
- `MARK_COMPLETED` stays available for legacy records; on a completed order it returns `unchanged`.
- The staff view has `operations.lifecycle` (completed, follow-up due/done/sent, review requested).
- Asking for a review grants no marketing use of photos or stories; that still needs separate permission.

## 9. Suspending new sales

`POST /api/crm/product-sales {"action":"SUSPEND","subject":"<sku or product id>","reason":"SUPPLIER_UNAVAILABLE|SUPPLIER_PRICE_CHANGE|QUALITY|OTHER","staff":"…"}`, and `RESUME` to lift it.
- **Refused while suspended:** quotes, new orders and new checkout sessions (for unpaid orders created earlier) get `product_unavailable` ("… is currently unavailable").
- **Shown to the public:** `GET /api/product-availability` lists identifiers only, and product pages show **Currently unavailable** instead of the call to action.
- **Never touched:** existing paid orders are not cancelled, refunded or changed.
- The Founders are notified. Nothing is scraped or suspended automatically.

## 10. Observability

| Where | Fields |
|---|---|
| **Events** (`order_events`) | id, reference (via order), type, source, timestamp, dedupe (idempotency) key, detail |
| **Outbox** (`founder_notifications`) | type, reference, dedupe key, status (processing state), attempts, next retry, last error (failure reason), delivered at/channel, human action required (ABANDONED) |
| **`GET /api/crm/notifications?view=health`** | counts by status, oldest undelivered, `human_action_required`, and **paid orders missing their ready event or notification** (no silent loss) |

All of these are CRM or worker key only.

## 11. Database — prepared, not run

`db/migrations/2026-09-15-automation-foundation.sql` is additive and idempotent. Verified by test: applied twice to the previous schema, it equals a fresh `db/schema.sql`. It adds:
- `order_production.supplier_purchase_authorised_at`;
- `order_events.source`;
- tables `order_artwork`, `founder_notifications` and `product_sales_suspensions`.

Preflight check: `automation_foundation_migration_applied` (FAIL until applied). It must run after the Single Creative Authority migration, and before code that writes the outbox serves the webhook.

## 12. Configuration (server only)

```php
'founders' => ['BELLA' => ['authorisation_hash' => ''], 'LEWIS' => ['authorisation_hash' => '']],
'notifications' => ['worker_key' => ''],
'artwork' => ['max_output_bytes' => 10485760],   // PHP upload limits must allow it
```

## 13. Remaining external integrations (not built, by instruction)

- **Telegram/TaskNotify bridge:** the worker, its credentials and the chat ids.
- **Email fallback worker.**
- **Supplier ordering:** always by hand.
- **Real artwork production:** people or tools outside this system.
- **Still to come from the manufacturers:**
  - the Heart and gatefold dielines;
  - disc pixel canvases;
  - 10-inch and 7-inch hole diameters;
  - sleeve safe/trim values.
- **Output file size:** real production files may exceed the 10 MB PHP upload limit, so raise the limits or use JPEG.
