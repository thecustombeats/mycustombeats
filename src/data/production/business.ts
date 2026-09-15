/**
 * MCB™ Business & Profit Intelligence — the policy data (16 September 2026).
 *
 * MANAGEMENT INTELLIGENCE for Bella and Lewis, calculated deterministically
 * from recorded MCB data. It is not statutory accounting, tax reporting,
 * bookkeeping, pricing automation, supplier switching or financial advice.
 * Nothing here spends, refunds, purchases or changes a price.
 *
 * Generated to public/api/data/business.json (INTERNAL, 403 over HTTP) by
 * scripts/generate-catalogue-json.mjs.
 *
 * UNKNOWN ≠ £0. A cost that has not been recorded is UNKNOWN / AWAITING DATA.
 * Contribution is only calculated for orders whose required costs are all
 * known, and is always shown with how many orders it is based on.
 */

/** The words the Business screens use, and what they mean. */
export const FINANCIAL_DEFINITIONS = [
  { term: "Revenue", meaning: "Money recorded as successfully paid (live payments only; TEST payments are rehearsals and never revenue)." },
  { term: "Net paid revenue", meaning: "Paid revenue minus the full and partial refunds MCB has recorded." },
  { term: "Expected fulfilment cost", meaning: "Known or entered expected supplier and fulfilment costs, including the internal allowances set on the supplier route." },
  { term: "Actual fulfilment cost", meaning: "Actual recorded supplier and fulfilment expenditure." },
  { term: "Gross contribution", meaning: "Net paid revenue minus the included known direct costs. It is not net profit, profit after tax, EBITDA or accounting profit: overheads, tax, creative time and marketing are not included." },
] as const;

/** Words never used for gross contribution. */
export const FORBIDDEN_PROFIT_TERMS = ["net profit", "profit after tax", "ebitda", "accounting profit"] as const;

/**
 * The canonical direct-cost categories, and where each one is recorded. A
 * category has exactly one home, so nothing is counted twice.
 *   expected / actual: the record that holds it, or null (it has no such value).
 *   entry: which bases staff may record in direct_cost_entries (others must be
 *   recorded where they live).
 */
export const COST_CATEGORIES = [
  { category: "SUPPLIER_PRODUCT_COST", expected: "ORDER_ECONOMICS_EXPECTED", actual: "SUPPLIER_ORDER", entry: [], recordAt: "Record the supplier order (actual purchase cost) in the staff console." },
  { category: "SUPPLIER_SHIPPING", expected: "ORDER_ECONOMICS_EXPECTED", actual: "SUPPLIER_ORDER", entry: [], recordAt: "Record the supplier order (actual shipping cost) in the staff console." },
  { category: "SUPPLIER_TAX_DUTY", expected: null, actual: "SUPPLIER_ORDER", entry: [], recordAt: "Record tax or duty actually paid, where known, on the supplier order. It is never assumed." },
  { category: "SHIPPING_CONTINGENCY", expected: "ORDER_ECONOMICS_EXPECTED", actual: null, entry: [], recordAt: "An internal allowance on the supplier route; it is never an actual cost." },
  { category: "MCB_FULFILMENT_HANDLING_ALLOWANCE", expected: "ORDER_ECONOMICS_EXPECTED", actual: null, entry: [], recordAt: "An internal allowance on the supplier route; it is never an actual cost." },
  { category: "PAYMENT_PROCESSING_FEE", expected: "ACTUAL_FIRST_OR_ENTRY", actual: "ENTRY", entry: ["EXPECTED", "ACTUAL"], recordAt: "Record the payment provider's actual fee for the order. Until it is recorded the fee is UNKNOWN." },
  { category: "VIDEO_PRODUCTION_COST", expected: "ENTRY", actual: "VIDEO_JOB", entry: ["EXPECTED"], recordAt: "Record the actual cost on the video job (Memory Music Video panel)." },
  { category: "REPLACEMENT_COST", expected: "ENTRY", actual: "ENTRY", entry: ["EXPECTED", "ACTUAL"], recordAt: "Record against the authorised replacement or reproduction remedy." },
  { category: "REFUND_VALUE", expected: "REFUND_REVIEW", actual: "REFUND_REVIEW", entry: [], recordAt: "Refunds are recorded in Customer Care (refund review)." },
  { category: "OTHER_DIRECT_COST", expected: "ENTRY", actual: "ENTRY", entry: ["EXPECTED", "ACTUAL"], recordAt: "Record with a note saying what it is." },
] as const;

/** Internal allowances (the £8 / £10 / £20-style estimates on routes) are never customer charges, verified quotes or universal rates. */
export const INTERNAL_ALLOWANCE_NOTE =
  "Shipping contingency and handling allowances are internal planning estimates from the supplier route. They are not customer delivery charges, verified supplier quotes or universal shipping rates, and they are never shown publicly.";

/**
 * Commercial alerts. Thresholds are the Founders' to set in server
 * configuration (business.thresholds.<key>); unset means NOT CONFIGURED and
 * the alert is not evaluated. Nothing changes a price, cancels an order or
 * switches a supplier.
 */
export const COMMERCIAL_ALERTS = [
  { type: "NEGATIVE_CONTRIBUTION", thresholdKey: null, meaning: "An order's known expected or actual gross contribution is below zero." },
  { type: "LOW_CONTRIBUTION", thresholdKey: "low_contribution_percent", meaning: "Gross contribution % below the Founders' threshold." },
  { type: "COST_VARIANCE_HIGH", thresholdKey: "cost_variance_percent", meaning: "An actual partner purchase and shipping cost differs from expected by more than the threshold." },
  { type: "REFUND_RATE_ELEVATED", thresholdKey: "refund_rate_percent", meaning: "A product's refund rate is above the threshold." },
  { type: "REPLACEMENT_RATE_ELEVATED", thresholdKey: "replacement_rate_percent", meaning: "A product's replacement rate is above the threshold." },
  { type: "SUPPLIER_EXCEPTION_ELEVATED", thresholdKey: "supplier_exception_rate_percent", meaning: "A supplier route's exception rate is above the threshold." },
  { type: "VIDEO_CAPACITY_LOW", thresholdKey: "VIDEO_POLICY", meaning: "Memory Music Video capacity is low or full (the video policy's low-capacity figure; planning capacity pending verification)." },
  { type: "DATA_COMPLETENESS_LOW", thresholdKey: "data_completeness_percent", meaning: "The share of paid orders with complete actual cost data is below the threshold." },
] as const;

/**
 * Sample-size wording. Below this many orders a figure is EARLY DATA, and no
 * product, supplier or market is ever called best or a winner. This is a
 * presentation convention (business.early_data_below_orders), not a statistical
 * confidence level.
 */
export const EARLY_DATA_BELOW_ORDERS = 30;

/** Recommendation cards only ever ask for a review, with the evidence. */
export const RECOMMENDATION_KINDS = ["INSIGHT", "COMPLETE_DATA", "REVIEW_PRICING", "REVIEW_PRODUCT_ECONOMICS", "REVIEW_SUPPLIER_ROUTE"] as const;
export const FORBIDDEN_RECOMMENDATION_WORDS = ["raise price", "lower price", "drop supplier", "switch supplier", "stop product", "best product", "best supplier", "winner"] as const;

/**
 * Founder decisions (16 September 2026).
 *   Business timezone: Europe/London, the business reporting timezone. It is
 *   not derived from where Bella or Lewis happen to be.
 *   Payment fees: ACTUAL_FIRST. A recorded actual fee is used; until one exists
 *   the fee is UNKNOWN / AWAITING DATA, never £0. There is no fee model.
 *   Memory Music Video: the £49 launch price is authoritative; no price test is
 *   authorised. Production cost stays UNKNOWN until the platform economics are
 *   verified.
 *   Commercial alert thresholds: deliberately NOT CONFIGURED.
 */
export const BUSINESS_TIMEZONE = "Europe/London";
export const PAYMENT_FEE_POLICY = "ACTUAL_FIRST" as const;
export const VIDEO_LAUNCH_PRICE_MINOR = 4900;
export const VIDEO_PRICE_TEST = "NOT_AUTHORISED" as const;
export const VIDEO_PRODUCTION_COST_POLICY = "UNKNOWN_UNTIL_PLATFORM_ECONOMICS_VERIFIED" as const;
export const COMMERCIAL_THRESHOLDS_POLICY = "NOT_CONFIGURED_BY_FOUNDER_DECISION" as const;

/**
 * Funnel stages. Only stages MCB's own database records are counted; the rest
 * live in Google Analytics (consented visitors only) and are reported as
 * ANALYTICS COVERAGE INCOMPLETE rather than estimated.
 */
export const FUNNEL_STAGES = [
  { stage: "PRODUCT_VIEWED", source: "ANALYTICS_ONLY" },
  { stage: "PERSONALISATION_STARTED", source: "ANALYTICS_ONLY" },
  { stage: "ORDER_CREATED", source: "DATABASE" },
  { stage: "ENHANCEMENT_VIEWED", source: "DATABASE_VIDEO_OFFER_ONLY" },
  { stage: "ENHANCEMENT_SELECTED", source: "DATABASE_VIDEO_OFFER_ONLY" },
  { stage: "CHECKOUT_STARTED", source: "DATABASE" },
  { stage: "PAYMENT_COMPLETED", source: "DATABASE" },
] as const;

/** Privacy-safe CSV exports. Aggregates and references only: never stories, lyrics, photos, messages, names, emails, addresses or payment credentials. */
export const EXPORT_DATASETS = ["products", "supplier_routes", "refunds", "alerts", "root_causes", "geography", "data_quality"] as const;
