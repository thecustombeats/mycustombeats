# MCB™ Business & Profit Intelligence

16 September 2026 · branch `mcb-release-candidate-20260914` · baseline `720c556a`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO REFUND. NO PURCHASE. NO PRICE CHANGE. NO MOZART CALL. NO PAID API. NO SECRETS.**

Management intelligence for Bella and Lewis, in Founder Command Centre → **Business**. It answers what MCB is selling, earning and spending, which products, enhancements and routes work, where margin and customer problems cost money, what needs attention — and **what data is still too incomplete to trust**.

It is not statutory accounting, tax reporting, bookkeeping, pricing automation, supplier switching or financial advice. Every figure is calculated deterministically from recorded MCB data by `public/api/lib/business.php`; no language model produces a figure.

**Decided prices:** Moment £15 · Memory Music Video £49 · Moment + one video £64.

## 1. Financial language (`business.json` definitions)

| Term | Meaning |
|---|---|
| Revenue | Money recorded as successfully paid — live payments only |
| Net paid revenue | Revenue minus recorded full and partial refunds |
| Expected fulfilment cost | Known or entered expected supplier and fulfilment costs, including route allowances |
| Actual fulfilment cost | Actual recorded supplier and fulfilment expenditure |
| Gross contribution | Net paid revenue minus the included known direct costs |

**Gross contribution** is never called net profit, profit after tax, EBITDA or accounting profit. Overheads, tax, creative time and marketing are not included.

## 2. Unknown ≠ £0, and the cost model

**Where each cost lives.** Each of the ten direct-cost categories has one home, so nothing is counted twice:

| Category | Expected | Actual |
|---|---|---|
| SUPPLIER_PRODUCT_COST, SUPPLIER_SHIPPING | latest EXPECTED economics snapshot | supplier orders |
| SUPPLIER_TAX_DUTY (16 Sept) | never assumed | supplier orders (tax or duty actually paid, where known) |
| SHIPPING_CONTINGENCY, MCB_FULFILMENT_HANDLING_ALLOWANCE | the snapshot (internal route allowances) | never — an allowance is not a cost |
| PAYMENT_PROCESSING_FEE | **actual-first** (founder decision): the recorded actual fee, else an expected entry, else UNKNOWN — there is no fee model | an entry |
| VIDEO_PRODUCTION_COST | an entry | the video job's recorded production cost |
| REPLACEMENT_COST | an entry against the remedy | an entry against the remedy |
| REFUND_VALUE | recorded refunds (Customer Care) | recorded refunds |
| OTHER_DIRECT_COST | an entry (with a note) | an entry (with a note) |

**Entries** (`direct_cost_entries`, staff, Business → Data quality):
- **Refused:** a category recorded elsewhere (`recorded_elsewhere`), a negative amount, the wrong currency, card-like notes, and a replacement cost without its authorised remedy.
- **Corrections:** a correction voids the previous entry, and the history is kept.
- **Unknown:** a cost nobody knows is left unrecorded, never entered as £0.

**Completeness per order and basis.** An order is complete when every required cost is known:
- **Physical order:** supplier product and shipping costs.
- **Video order:** the video production cost. The platform allowance is not free.
- **Every order:** the payment fee.
- **Authorised replacement:** its replacement cost.

Contribution is calculated only for complete orders, and always shows "based on X of Y paid orders" with what the rest are awaiting. Authorising a replacement is not spend until its actual cost is recorded.

**Internal allowances.** The £8 / £10 / £20-style estimates on routes are internal. They are not customer delivery charges, verified quotes or universal rates. They are never shown publicly and never changed here.

## 3. Views (Command Centre → Business)

| Section | Contents |
|---|---|
| **Overview** | MCB BUSINESS BRIEF; revenue today / week / month / all time (gross, refunds full and partial, net paid, orders, average order; TEST separate; other currencies unconverted); expected and actual gross contribution with completeness; what changed; commercial alerts; evidence to review |
| **Products** | Moment (orders, Moment-only vs with video, video attachment, revenue, average order, refunds, contribution where known); packages and enhancements; per-SKU performance |
| **Videos** | Offer views, selections, purchases, offer-to-purchase, attachment, revenue, average price, capacity (planned 45, **PENDING MOZART VERIFICATION**), utilisation, rework, quality-check failures, production time, refunds, support cases, known cost and contribution; the £49 launch price (no price test authorised) |
| **Customers** | Customers, first-time vs repeat, orders and net paid per customer, repeat purchase rate; cruise and voyage customers; occasions; countries; the sales funnel |
| **Suppliers** | Route readiness from the Suppliers view, transparent route evidence components, and per route (staff only): orders, actual purchase cost, purchase and shipping variance, days to dispatch and in transit, damage, wrong item, cancellations, tracking reliability, support cases, replacements, destinations |
| **Support & recovery** | Refunds (full, partial, rate, by case type and root cause); replacements (authorised, completed, known actual cost, awaiting cost, recovery cost per affected order); support burden; root causes |
| **Data quality** | Completeness; every gap; recording a direct cost; CSV exports |

**Per-SKU performance** covers orders, units, revenue, average price, refunds on orders, expected and actual contribution, support cases and replacement rate, each with its sample size. Costs are attributed to a product only for orders where it is the only item.

**Customers view details:**
- **Customer value:** historical, never predicted lifetime value.
- **Cruise:** identified only by the Cruise / Voyage occasion or the cruise companions field; stories are never read.
- **Occasions:** only the chosen structured slug.
- **Countries:** delivery country code only, never an address.
- **Sales funnel:** only stages MCB records. Product views and personalisation starts are **ANALYTICS COVERAGE INCOMPLETE**; no product-level conversion is shown without a recorded denominator.

**Supplier routes** are not ranked, and nothing is switched.

**Support burden** covers cases per order, repeat contacts, objective errors and preference contacts, damage, wrong item, delivery and video problems, recorded refunds and replacement rate. No labour cost is invented.

**Root causes** show count, share, products and routes affected, refund value and known replacement cost. They are evidence, not blame.

**Data quality gaps:**
- missing expected or actual supplier costs;
- missing actual shipping;
- missing payment fees;
- missing video costs;
- replacements without cost;
- products without routes;
- unverified capacities;
- unknown destinations;
- missing root causes;
- refunds without a provider reference;
- analytics coverage;
- thresholds not configured;
- foreign-currency orders.

**Sample sizes** are always shown. Below `business.early_data_below_orders` (default 30, a presentation convention and not statistical confidence) a figure is **EARLY DATA**. Nothing is ever the best or a winner.

## 4. Alerts, recommendations, comparisons

**Alerts.**
- **Always evaluated:**
  - `NEGATIVE_CONTRIBUTION` (known costs);
  - `VIDEO_CAPACITY_LOW` (the video policy's existing low-capacity figure).
- **Evaluated only when the Founders set `business.thresholds.*`; otherwise NOT CONFIGURED:**
  - `LOW_CONTRIBUTION`, `COST_VARIANCE_HIGH`, `REFUND_RATE_ELEVATED`;
  - `REPLACEMENT_RATE_ELEVATED`, `SUPPLIER_EXCEPTION_ELEVATED`, `DATA_COMPLETENESS_LOW`.
- **What they never do:** change a price, cancel or re-price a paid order, suspend sales or switch a supplier. The existing NEW-sales suspension remains a separate, deliberate action.

**Recommendations** are deterministic evidence cards: INSIGHT, COMPLETE_DATA, REVIEW_PRICING, REVIEW_PRODUCT_ECONOMICS, REVIEW_SUPPLIER_ROUTE. Examples: "Video attachment is 50% across 2 eligible orders (early data)." They never say raise price, drop supplier or stop product.

**What changed.** Yesterday, last week and last month are each compared with the period before, as a change amount and % and never called a trend. Today, this week and this month are shown as partial without a change figure.

## 5. Timezone, currency, exports, security

**Timezone.** Europe/London — the Founders' decision (16 September), never derived from where anyone is or from the server. `business.timezone` may set another valid IANA name; an invalid value falls back to Europe/London.

**Currency.** GBP management totals use live GBP orders. An order in another currency keeps its currency and amount, and no GBP equivalent is invented.

**Exports.** `GET /api/crm/business?export=` offers products, supplier routes, refunds, alerts, root causes, geography and data quality.
- **Content:** aggregates and order references only — no stories, lyrics, photos, messages, reasons, names, emails, addresses or payment details.
- **Safety:** formula-safe cells.
- **Audit:** every export is recorded in `business_audit_log`.

**Security.** Founders and staff only (CRM key and staff name); no-store and noindex; the Command Centre route is private with no analytics. There is no public financial API, no secret and no outbound call.

**Performance.** A fixed number of aggregated queries per view (orders, items, occasions, refunds, economics, supplier orders, video jobs, entries, remedies, cases, exceptions), never one per order.

## 6. Database — prepared, not run

`db/migrations/2026-09-16-business-intelligence.sql` is additive and idempotent. Applied to the previous schema it equals a fresh `db/schema.sql`. It adds `direct_cost_entries` and `business_audit_log`, and preflight checks `business_intelligence_migration_applied`.

## 7. Founder decisions

- ~~Business timezone~~ decided: Europe/London.
- ~~Payment fee model~~ decided: actual-first; record each order's actual fee (until then contribution cannot be complete).
- Commercial alert thresholds: deliberately not configured for now.
- Early-data line: keep 30 orders (a display safeguard, not statistical significance).
- Video price: £49 launch price authoritative; no £59 / £69 test.
- How production cost per video is worked out once the platform economics are verified (UNKNOWN until then).
