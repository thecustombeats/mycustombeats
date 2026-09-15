# MCB™ Supplier Intelligence & Commercial Routing

16 September 2026 · branch `mcb-release-candidate-20260914` · baseline `4e2395c1`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO SUPPLIER PURCHASE. NO REPLACEMENT PURCHASE. NO REFUND. NO SUBSCRIPTION. NO PAID API. NO MOZART CALL. NO SECRETS.**

## Executive authority

**Money never leaves MCB automatically.** Every outgoing financial action needs explicit approval from **Bella or Lewis**. This covers:
- a supplier or replacement purchase;
- a full or partial refund;
- a subscription or paid API;
- compensation or monetary credit;
- a transfer or any other financial commitment.

Automation may observe, calculate, recommend, prepare, queue, validate and notify. It never executes outgoing money. No threshold, recommendation, workflow state or customer-care resolution overrides this.

The permanent release-safety test `tests/no-money-automation.test.mjs` proves it:
- **Outbound calls:** every outbound call is in a reviewed set, and none moves money out.
  - The payment provider is only asked to take a customer's payment (Checkout Sessions).
  - Email goes through the configured email service.
  - MCB's own operations webhook and free exchange-rate data are the only other calls.
- **Unimplemented actions have no code path:**
  - payment-provider refunds, payouts, transfers, subscriptions and credits;
  - partner checkouts;
  - model, music-platform, marketplace or courier APIs.
- **Founder boundary:** a supplier purchase is authorised in exactly one place, after `check_founder_authorisation_request` (a hashed personal code). Replacement remedies and refund decisions are founder-coded and never executed (`purchased: false`, `refund_executed: false`). Founder-only fulfilment resolutions need the code.
- **Automation entry points** never reach a financial decision: the webhook, routing, business, lifecycle, notifications, suspension, delivery, the Command Centre and video.
- **Only a person with a code spends:** a route recommendation, a deep link or an alert authorises nothing.

## What the layer answers

For a product and the **customer's delivery destination**, it answers:
- who can make it, and where they deliver;
- what it should cost, and what it actually cost;
- whether the route is verified and commercially safe;
- whether MCB must confirm delivery before payment;
- which route staff should review first;
- what data is missing.

It is decision support, not procurement.

## 1. The physical catalogue (33)

`src/data/production/suppliers.ts` → `public/api/data/suppliers.json` (INTERNAL, 403 over HTTP) is the non-sensitive registry. The generator checks it against the catalogue.

| Family | Expected | Mapped | Notes |
|---|---|---|---|
| Vinyl | 6 | 6 | Gatefold 12 songs £349 · 12" 6 songs £199 · 12" picture 4 songs £149.99 · 10" picture 3 songs £139.99 · Heart 1 song £129.99 · 7" 1 song £99 |
| Frames / wall art | 5 | 5 | The catalogue's Lyrics Frames. **Founders to confirm** these are the frames the partner routes supply |
| Pop-up cards | 18 | 18 | **Corrected 17 Sept:** the Founders' 18 cards are catalogued (see SECURITY-RESILIENCE-20260917.md). Routes stay VERIFICATION_REQUIRED until evidenced |
| Gramophones | 3 | 3 | Manual / availability-confirmed. The £1,000 gramophone needs its delivered cost confirmed before purchase |
| Plaque | 1 | 1 | 8 × 12, associated with one song, does not play music. Unverified destinations go to manual review |

**Registry rules:**
- No Prodigi, no Kunaki, no stale products.
- The generator refuses a registry that disagrees with the catalogue's physical SKUs, prices or vinyl song counts.
- Stale values are never restored: 12" £129.99, 10" £119.99, Heart 2 songs, 7" £79.99.

## 2. Partner data stays on the server

- **Where the data lives:** partner names, private links, product references, costs and internal allowances (the £8 / £10 / £20-style estimates) live only in the uploaded `api/data/supplier-routes.json`. It is never committed, never public, and never shown to customers.
- **What the repository holds:** the registry and synthetic test fixtures only.
- **What the Founders provided:** vinyl routes (12" Gatefold and 12" single with one partner; 12", 10", Heart and 7" picture discs with another), internal purchase and shipping-estimate values, and the frame, gramophone and plaque routes.
- **What those values are:** a private draft for the server file only.
- **Verification:** without a verification source and date, every route there is VERIFICATION_REQUIRED.

## 3. Route record (model v2)

`supplier_routes()` validates each route. Anything invalid is absent (unknown), never filled in.

| Area | Fields |
|---|---|
| Identity | `route_id`, `skus`, partner, private `product_url`, `supplier_product_reference`, `route_type` (DIRECT_MANUFACTURER / DIRECT_RETAILER / MARKETPLACE / MANUAL) |
| Destinations and delivery | `destinations` {supported, check_required, unsupported}; `destination_evidence` per country {shipping rule, tracking, customs/duties, delivery estimate, restrictions, source, checked date}; `shipping_model` (VERIFIED FIXED/FREE, DESTINATION-CALCULATED, MARKETPLACE/LISTING-DEPENDENT, MANUAL FULFILMENT REVIEW) |
| Costs | `currency`, `expected_purchase_cost_minor`, `internal_allowance` {expected supplier shipping, shipping contingency, MCB handling}, each counted once |
| Operations | production and delivery estimates, tracking, customs position, cancellation cutoff, damage process, authorised fallback route |
| State | `risk_notes`, `known_issues`, `availability` (AVAILABLE / UNAVAILABLE / UNKNOWN) with checked date, `active`, `last_reviewed_date`, `freshness_days` |
| Verification | `verification_state`, `source`, `last_verified_date` |

## 4. Verification and staleness

`route_verification()` calculates the state. Entering "VERIFIED" is not enough.

| State | When |
|---|---|
| VERIFIED | Claimed VERIFIED, with a source and a past verification date, no issue holding it, and not past its freshness period |
| PARTIALLY_VERIFIED | Claimed, with a source |
| VERIFICATION_REQUIRED | No source or date, a future date, not claimed, or an issue holds verification (GEOGRAPHIC_INCONSISTENCY, LISTING_CHANGED, TERMS_CHANGED) |
| STALE | Verified, but older than the freshness period → **REVERIFY ROUTE** |
| UNSUPPORTED | Claimed with evidence (without evidence → VERIFICATION_REQUIRED) |
| SUSPENDED | `active: false` or claimed SUSPENDED |

**Freshness:**
- It is configurable (`fulfilment.route_freshness_days`, or per route).
- Unset means NOT CONFIGURED: no universal period is assumed, and nothing becomes stale automatically.
- A stale route never disables a paid order.

**A route with a historic geographic inconsistency** (such as one of the marketplace frame routes) stays VERIFICATION_REQUIRED even when entered as verified.

## 5. The routing engine (`lib/routing.php`)

`route_options(sku, country)` is deterministic and places nothing.

**Groups:**

| Group | Meaning |
|---|---|
| SUPPORTED | Verified route, verified destination |
| UNVERIFIED | Anything short of that, for a standard product |
| MANUAL_REVIEW | Gramophones (always); the plaque and other manual modes where the destination is unsupported or unverified; manual-fulfilment routes |
| UNSUPPORTED | Suspended, unsupported, unavailable, or (standard products) a destination the route excludes |

**Each route shows internally:**
- expected direct cost by component (product, internal shipping estimate, contingency, handling, total allowance counted once, total), or the missing inputs;
- shipping certainty;
- destination certainty;
- verification and freshness;
- availability;
- international evidence for that country;
- risks (notes, issues, limitations, marketplace risk, stale);
- the fallback and whether it is usable there.

**Recommended for review.** The label is "RECOMMENDED FOR REVIEW", never "auto selected". Ranking is transparent. Routes are compared by, in order:
1. group;
2. verification;
3. destination certainty;
4. route type (direct first);
5. availability;
6. known issues;
7. lower known expected cost;
8. most recent verification;
9. route id.

The explanation says why. For example: *"Direct manufacturer route; destination verified; route verified; verified more recently; better destination evidence than the alternatives."*

Every recommendation carries `authorises_purchase: false` and `places_order: false`.

**Destination basis.** Routing uses only the customer's delivery country: `basis: CUSTOMER_DELIVERY_DESTINATION`. It never uses the Founders' location, the server's location or its timezone.

## 6. The approval flow

1. **Recommended for review.** Suppliers → Orders to route, and the founder decision card.
2. **Staff or founder review.** They record the route choice (`RECORD_ROUTE_DECISION`). A route other than the recommended one needs a reason and a note, and an unsupported route is refused. The choice supersedes earlier ones and keeps history. It is **never an authorisation**.
3. **Fulfilment ready.**
4. **Bella or Lewis authorise** with their own code (`AUTHORISE_SUPPLIER_PURCHASE`).
   - **Delivered-cost gate:** a product that needs its delivered cost confirmed (the £1,000 gramophone) cannot be authorised until that cost, its currency and where it was confirmed are recorded on the route choice. This applies in every mode.
   - **Route review:** where a product has more than one route (a real choice), an unreviewed route blocks only under REQUIRED enforcement; the decision card shows `ROUTE_NOT_REVIEWED` otherwise.
5. **A person places the partner order by hand.**
6. **Reference and actual cost recorded.** Record product, shipping and tax/duty (where known), currency, reference, date and route (`RECORD_SUPPLIER_ORDER`, `actual_tax_duty_minor`). The actual economics add known tax/duty. Business Intelligence carries it as SUPPLIER_TAX_DUTY.

**Other rules:**
- Expectations use the route chosen, else the recommendation, else the first route.
- Opening a deep link does nothing financially.

## 7. New-sale commercial safety and route suspension

`new_sale_route_flags()` works from recorded data only; incomplete data is never treated as safe. It flags:
- MISSING_ROUTE;
- DESTINATION_UNSUPPORTED;
- NEGATIVE_CONTRIBUTION (price minus a known expected direct cost);
- UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE;
- MANUFACTURING_DATA_MISSING.

**Customer quote.**
- A destination the routes prove unsupported always becomes "we confirm delivery before you pay" (`MCB_CONFIRMS_DELIVERY` with product names only).
- **ADVISORY (default):** the other flags show in Suppliers → Commercial exceptions.
- **REQUIRED** (`fulfilment.new_sale_safety`): flagged items also go to MCB before payment.

**What customers see and what never happens.**
- Customers see no partner, route, cost or margin.
- A paid order is never cancelled or re-priced.

**Suspension (unchanged).**
- New sales show CURRENTLY UNAVAILABLE and the Founders are notified.
- Nothing is refunded, cancelled, replaced or purchased.

## 8. Card alternatives

- **The rule:** the only substitution rule is an appropriate alternative card.
- **What is recorded:** `card_alternatives` holds the original SKU, the alternative, the reason, the authority (staff, or founder named), and the customer-impact assessment (NO_MATERIAL_DIFFERENCE / CUSTOMER_TOLD / CUSTOMER_AGREED) with a note.
- **Never broadened:** any other substitution still needs a founder's SUBSTITUTION_APPROVED.

## 9. Data needed

**SUPPLIER DATA NEEDS REVIEW** (research, not purchasing):
- **Route verification:** route needs verification, reverify route, destination unverified, no route.
- **Costs and shipping:** shipping quote missing (the internal estimate is not a quote), expected cost missing, price stale.
- **Listings and terms:** product unavailable, terms changed, marketplace listing changed, fallback absent.
- **Asks to partners:** template missing, capacity missing.
- **Founder data:** founder data required (the 18 cards).

**MANUFACTURING DATA REQUIRED** (kept apart). It lists, with known values shown and unknown values never filled in:
- vinyl programme duration (six formats; the song count is not a duration);
- safe areas, trim and disc pixel canvas;
- 10" and 7" centre holes (the 12" hole of 7.23 mm is known);
- the Heart dieline and the Gatefold template (both block manufacture).

## 10. Supplier intelligence and scorecards

`route_scorecards()` gives per-route transparent components:

| Component | Contents |
|---|---|
| Verification quality | State, reasons, freshness |
| Cost completeness | Orders with actual product, shipping and tax/duty recorded; expected vs actual product, shipping and total, with variances |
| Destination certainty | Supported, check-required and unsupported destinations; evidence countries; destinations delivered |
| Tracking evidence | Capability, share of parcels tracked |
| Fulfilment reliability | Days to dispatch, days in transit, cancellations, exceptions |
| Customer-problem rate | Problems, damage, wrong item, support cases, replacements |
| Sample size | INSUFFICIENT DATA below 1 order, EARLY DATA below 30 |

- **No combined score:** `combined_score` is null.
- **Variance:** evidence, never "good" or "bad".
- **No automatic switching.**

## 11. Command Centre → Suppliers

**Overview tiles** (each opens its items):
- routes ready;
- routes needing verification;
- products with no safe route;
- commercial exceptions (paid orders, and new-sale flags);
- manufacturing data missing;
- supplier orders awaiting founder approval;
- authorised but not placed;
- orders being made;
- supplier / delivery problems.

The overview also shows the physical catalogue (33, the cards gap) and the enforcement and freshness settings.

**Other sections:**
- **Orders to route:** recommendation, all routes, and the one form that records a route choice.
- **Route finder:** product and customer country.
- **Data needed:** the research and manufacturing lists.
- **Route evidence:** the scorecards.

The API is `GET /api/crm/suppliers?view=overview|orders|lookup|scorecards` and `POST RECORD_ROUTE_DECISION`. It needs the CRM key and a staff name, and is no-store and noindex.

## 12. Business tab

**Business → Suppliers** now shows:
- route readiness tiles and the catalogue gap;
- route evidence by component with sample sizes;
- tax or duty recorded per route.

Unknown is never zero, nothing is ranked or switched, and no price changes.

## 13. Founder decisions applied

| Decision | Applied |
|---|---|
| Business timezone | **Europe/London**. It is the business reporting timezone, never derived from anyone's location; readiness shows READY |
| Payment fees | **ACTUAL-FIRST.** The recorded actual fee is used on both bases; an expected entry applies only before an actual exists; otherwise UNKNOWN. The fee-model code and configuration were removed |
| Early data | Keeps 30 orders, a display safeguard only |
| Video production cost | UNKNOWN until the platform economics are verified |
| Video price | £49 launch price authoritative; no price test (`NOT_AUTHORISED`; the £59 / £69 evidence was removed) |
| Alert thresholds | Deliberately NOT CONFIGURED (readiness DEFERRED); negative-contribution and commercial safety protection unchanged |

**Memory Music Video (Mozart)** is untouched: FOUNDER SELECTED · ACCOUNT NOT OPENED · INTEGRATION PENDING · CAPABILITIES PENDING VERIFICATION.

## 14. Database — prepared, not run

`db/migrations/2026-09-16-supplier-routing.sql` is additive and idempotent. Applied to the previous schema, it equals a fresh `db/schema.sql`. It adds:
- `order_route_decisions`;
- `card_alternatives`;
- `supplier_orders.actual_tax_duty_minor`.

## 15. Deferred to the final launch SITREP

Founder or manual verification:
- `hello@mycustombeats.com` receives customer email;
- `support@` forwards to `hello@` where configured;
- the public ordinary-order support identity is `hello@`;
- MCB LIVE WhatsApp stays separate.
