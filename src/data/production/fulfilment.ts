/**
 * MCB FULFILMENT CONTROLLER — policy as data. INTERNAL.
 *
 * MCB is the middleman: specialist partners make and ship; MCB owns the
 * customer experience. Generated into the server-only api/data/fulfilment.json.
 *
 * NOTHING HERE IS A PRICE, A COST OR A SUPPLIER. Supplier routes, expected
 * costs and internal allowances live only in the server's
 * api/data/supplier-routes.json (uploaded, never committed). Where they are
 * missing, economics are COMMERCIAL_DATA_REQUIRED — never estimated here.
 *
 * INTERNAL ALLOWANCES ARE NOT DELIVERY PRICES. The Founders' £8/£10/£20-style
 * values are financial contingency estimates. They are not supplier quotes,
 * not universal shipping rates and never a customer delivery charge; customer
 * delivery is quoted only from the authorised rate table (lib/delivery.php).
 */

/*
 * How a supplier route delivers (delivery routing states) is defined only in
 * scripts/generate-catalogue-json.mjs, beside the server's delivery pricing
 * states: internal delivery-state names never appear in browser-loaded source.
 */

/** The parts of an internal fulfilment allowance, kept separate. */
export const INTERNAL_ALLOWANCE_COMPONENTS = ["EXPECTED_SUPPLIER_SHIPPING", "SHIPPING_CONTINGENCY", "MCB_FULFILMENT_HANDLING_ALLOWANCE", "TOTAL_INTERNAL_FULFILMENT_ALLOWANCE"] as const;

export const DESTINATION_STATUSES = ["DESTINATION_SUPPORTED", "DESTINATION_CHECK_REQUIRED", "DESTINATION_UNSUPPORTED", "DESTINATION_UNKNOWN"] as const;

export const COMMERCIAL_STATUSES = ["CALCULATED", "COMMERCIAL_DATA_REQUIRED", "COMMERCIAL_SAFETY_EXCEPTION"] as const;

/** What the economics do NOT include (stated, not estimated). */
export const ECONOMICS_EXCLUSIONS = ["VAT", "payment processing fees", "creative production time", "marketing costs"] as const;

export const VARIANCE_REASONS = ["SUPPLIER_PRICE_CHANGE", "SHIPPING_VARIANCE", "CURRENCY_VARIANCE", "MARKETPLACE_VARIANCE", "MANUAL_ADJUSTMENT", "OTHER"] as const;

export const SHIPMENT_STATES = ["AWAITING_DISPATCH", "DISPATCHED", "IN_TRANSIT", "DELAYED", "DELIVERED", "LOST", "CANCELLED"] as const;

/** Fulfilment exception types. Delivery-type exceptions notify as DELIVERY_EXCEPTION. */
export const FULFILMENT_EXCEPTION_TYPES = [
  "SUPPLIER_DELAY", "PRODUCTION_DELAY", "TRACKING_NOT_RECEIVED", "TRACKING_STALLED", "PARCEL_DELAYED", "PARCEL_LOST",
  "PARCEL_DAMAGED", "WRONG_ITEM", "MANUFACTURING_DEFECT", "PARTIAL_DELIVERY", "DESTINATION_PROBLEM", "CUSTOMS_EXCEPTION",
  "SUPPLIER_CANCELLED", "OTHER_FULFILMENT_EXCEPTION",
  "COMMERCIAL_DATA_REQUIRED", "COMMERCIAL_SAFETY_EXCEPTION", "PAID_ORDER_FULFILMENT_EXCEPTION",
  // The customer has paid and MCB has not finished verifying how it will
  // fulfil — a route awaiting refreshed evidence, a marketplace to check, costs
  // or manufacturer data not yet recorded. Uncertainty no longer stops a
  // customer paying (only a KNOWN impossibility does), so it has to stop the
  // WORK instead, until a person has verified it.
  "POST_PAYMENT_VERIFICATION_REQUIRED",
  "SUBSTITUTION_APPROVAL_REQUIRED", "AUTHORISED_CARD_ALTERNATIVE",
] as const;

export const DELIVERY_EXCEPTION_TYPES = ["TRACKING_NOT_RECEIVED", "TRACKING_STALLED", "PARCEL_DELAYED", "PARCEL_LOST", "PARCEL_DAMAGED", "PARTIAL_DELIVERY", "DESTINATION_PROBLEM", "CUSTOMS_EXCEPTION"] as const;

/**
 * How an exception is resolved. Resolutions RECORD decisions people made; none
 * refunds, charges or cancels anything by itself. The two marked founder-only
 * need BELLA or LEWIS named.
 */
export const EXCEPTION_RESOLUTIONS = [
  "RESOLVED_DELIVERED", "REPLACEMENT_ARRANGED", "CUSTOMER_CONTACTED", "SUPPLIER_RESOLVED",
  "PARTIAL_DELIVERY_ACCEPTED", "SUBSTITUTION_APPROVED", "REFUND_TO_BE_HANDLED_BY_FOUNDER", "PROCEED_AT_PAID_PRICE",
  "NO_ACTION_NEEDED", "OTHER",
] as const;
export const FOUNDER_ONLY_RESOLUTIONS = ["PARTIAL_DELIVERY_ACCEPTED", "SUBSTITUTION_APPROVED", "REFUND_TO_BE_HANDLED_BY_FOUNDER", "PROCEED_AT_PAID_PRICE"] as const;

/**
 * Substitution: an ordinary physical product is never silently replaced by a
 * materially different one. Pop-up cards (delivery class CARD) follow the
 * separately approved rule: an appropriate alternative design where
 * operationally necessary, recorded, and never materially misleading.
 */
export const AUTHORISED_ALTERNATIVE_DELIVERY_CLASSES = ["CARD"] as const;

export const SUPPORT_EVIDENCE_KINDS = ["PARCEL_PHOTO", "PRODUCT_PHOTO", "UNBOXING_VIDEO_REFERENCE", "OTHER"] as const;

/** Marketing content permission is separate from asking for a review. */
export const CONTENT_PERMISSION_SCOPES = ["REVIEW_QUOTE", "PHOTOGRAPHS", "SONG", "LYRICS", "STORY", "VIDEO", "MESSAGES"] as const;

/** Prepared re-engagement hooks. Nothing is sent automatically; marketing needs consent. */
export const LIFECYCLE_HOOKS = ["ANOTHER_MEMORY", "ANNIVERSARY_FOLLOW_UP", "JOURNEY_CHAPTER", "RELATED_KEEPSAKE"] as const;

/** Notification channels a bridge may acknowledge. */
export const NOTIFICATION_CHANNELS = ["TELEGRAM", "EMAIL_FALLBACK", "STAFF_QUEUE", "EMAIL", "OTHER"] as const;
