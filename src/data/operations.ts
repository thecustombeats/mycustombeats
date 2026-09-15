/**
 * MCB OPERATIONS — what happens after payment, as data.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SINGLE CREATIVE AUTHORITY (15 September 2026)
 * ─────────────────────────────────────────────────────────────────────────
 * CUSTOMER INPUT → CREATIVE-AUTHORITY CONSENT → PAYMENT → NEW ORDER READY FOR
 * PROCESSING → MCB CREATION → INTERNAL QUALITY CHECK → QC PASSED →
 * (physical) MANUFACTURING / FULFILMENT → CUSTOMER REVEAL → FOLLOW-UP.
 *
 * There is no customer approval loop. Payment stays in `orders.status`; the
 * work is `order_production.stage`; the physical side is
 * `order_production.fulfilment_state`; the reveal is `revealed_at`. The
 * operational state below is DERIVED from those columns and never stored.
 *
 *   no production row                     → ORDER.PAID
 *   stage CREATIVE (not started)          → CREATIVE.PENDING   (new order ready for processing)
 *   stage CREATIVE (started)              → CREATIVE.IN_PROGRESS
 *   stage QUALITY_CHECK                   → QUALITY_CHECK
 *   stage QC_PASSED, digital, not revealed → REVEAL.READY
 *   stage QC_PASSED, digital, revealed    → REVEALED, then FOLLOW_UP.DUE
 *   stage QC_PASSED, fulfilment PENDING   → FULFILMENT.PENDING
 *   stage QC_PASSED, fulfilment READY     → FULFILMENT.READY   (founder approval required)
 *   … and authorised by Bella or Lewis    → FULFILMENT.AUTHORISED (supplier order required)
 *   stage PRODUCTION_LOCKED (CONFIRMED)   → FULFILMENT.CONFIRMED (supplier order recorded)
 *   stage FULFILMENT, DISPATCHED          → DISPATCHED
 *   stage COMPLETED                       → COMPLETED
 *
 * COMPLETION IS INDEPENDENT OF FOLLOW-UP (15 September 2026): the reveal of a
 * digital order and the delivery of a physical one complete it at once. The
 * follow-up and review request follow on their own clocks. REVEALED,
 * DELIVERED and FOLLOW_UP.DUE remain only for records completed by hand
 * before that change.
 *
 * Legacy stages from the retired approval model (historical and test records
 * only): SONG_READY, AWAITING_APPROVAL and REVISION_REQUESTED read as
 * QUALITY_CHECK; APPROVED reads as QC_PASSED (a digital one as REVEALED).
 *
 * The PHP twin is public/api/lib/operations.php; tests/operations.test.mjs and
 * tests/operations-acceptance.sh hold the two to the same table.
 */

import { PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS } from "./catalogue/products";

export type Workflow = "DIGITAL" | "PHYSICAL";

export type OperationalState =
  | "ORDER.PAID"
  | "CREATIVE.PENDING"
  | "CREATIVE.IN_PROGRESS"
  | "QUALITY_CHECK"
  | "REVEAL.READY"
  | "REVEALED"
  | "FULFILMENT.NOT_REQUIRED"
  | "FULFILMENT.PENDING"
  | "FULFILMENT.READY"
  | "FULFILMENT.AUTHORISED"
  | "FULFILMENT.CONFIRMED"
  | "DISPATCHED"
  | "DELIVERED"
  | "FOLLOW_UP.DUE"
  | "COMPLETED";

export type FulfilmentState = "NOT_REQUIRED" | "PENDING" | "READY" | "CONFIRMED" | "DISPATCHED" | "DELIVERED";

export interface StateDefinition {
  readonly state: OperationalState;
  /** Which workflows can be in this state. */
  readonly workflows: readonly Workflow[];
  /** Plain description for staff. */
  readonly staff: string;
  /** The next thing a person should do, or null when nothing is owed. */
  readonly nextAction: string | null;
}

export const OPERATIONAL_STATES: readonly StateDefinition[] = [
  { state: "ORDER.PAID", workflows: ["DIGITAL", "PHYSICAL"], staff: "New order ready for processing (no production record yet).", nextAction: "Check the brief and start the creative work." },
  { state: "CREATIVE.PENDING", workflows: ["DIGITAL", "PHYSICAL"], staff: "New order ready for processing.", nextAction: "Check the brief and start the creative work." },
  { state: "CREATIVE.IN_PROGRESS", workflows: ["DIGITAL", "PHYSICAL"], staff: "MCB is creating the song and artwork.", nextAction: "Finish the work and send it to the quality check." },
  { state: "QUALITY_CHECK", workflows: ["DIGITAL", "PHYSICAL"], staff: "Created, and waiting for MCB's internal quality check.", nextAction: "Run the quality checklist: pass it, or fail it back for an internal correction." },
  { state: "REVEAL.READY", workflows: ["DIGITAL"], staff: "Quality check passed. The reveal has not been sent.", nextAction: "Send the reveal to the customer." },
  { state: "REVEALED", workflows: ["DIGITAL"], staff: "Revealed to the customer.", nextAction: "Follow up when it is due, then complete." },
  { state: "FULFILMENT.NOT_REQUIRED", workflows: ["DIGITAL"], staff: "Digital: nothing physical to make.", nextAction: null },
  { state: "FULFILMENT.PENDING", workflows: ["PHYSICAL"], staff: "Quality check passed, but something is missing before the keepsake can be made.", nextAction: "Resolve what is missing, then mark fulfilment ready." },
  { state: "FULFILMENT.READY", workflows: ["PHYSICAL"], staff: "Fulfilment approval required: payment verified, quality check passed, supplier order ready to place.", nextAction: "Bella or Lewis opens the order and explicitly authorises the supplier purchase." },
  { state: "FULFILMENT.AUTHORISED", workflows: ["PHYSICAL"], staff: "Supplier purchase authorised by Bella or Lewis. The supplier order is required.", nextAction: "Place the supplier order by hand, then record it here." },
  { state: "FULFILMENT.CONFIRMED", workflows: ["PHYSICAL"], staff: "The physical order is placed. It can no longer be changed.", nextAction: "When it is sent, record the dispatch and tracking." },
  { state: "DISPATCHED", workflows: ["PHYSICAL"], staff: "Sent to the customer.", nextAction: "When delivery is confirmed, mark it delivered." },
  { state: "DELIVERED", workflows: ["PHYSICAL"], staff: "Delivered: the reveal.", nextAction: "Follow up, then complete." },
  { state: "FOLLOW_UP.DUE", workflows: ["DIGITAL", "PHYSICAL"], staff: "Revealed or delivered, and a follow-up is due.", nextAction: "Check in with the customer, record the follow-up, then complete." },
  { state: "COMPLETED", workflows: ["DIGITAL", "PHYSICAL"], staff: "MCB regards the commission as complete.", nextAction: null },
];

/* ------------------------------------------------------------------ */
/* What the customer sees                                              */
/* ------------------------------------------------------------------ */

export interface CustomerStage {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** Operational states in which this stage is the CURRENT one. */
  readonly states: readonly OperationalState[];
}

/**
 * The customer's progress page. Plain English, only the stages that apply to
 * what they bought — a Moment never mentions making or posting anything.
 */
export const CUSTOMER_STAGES: Readonly<Record<Workflow, readonly CustomerStage[]>> = {
  DIGITAL: [
    { id: "received", title: "Order received", description: "We have your order, your story and your preferences.", states: ["ORDER.PAID", "CREATIVE.PENDING"] },
    { id: "creating", title: "Creating your memory", description: "Our creative team is turning your story into your song.", states: ["CREATIVE.IN_PROGRESS"] },
    { id: "quality", title: "Quality check", description: "We're checking every detail before your reveal.", states: ["QUALITY_CHECK", "REVEAL.READY"] },
    { id: "ready", title: "Your creation is ready", description: "Your finished MCB creation is waiting for you.", states: ["REVEALED", "FOLLOW_UP.DUE", "COMPLETED"] },
  ],
  PHYSICAL: [
    { id: "received", title: "Order received", description: "We have your order, your story, your preferences and your photographs.", states: ["ORDER.PAID", "CREATIVE.PENDING"] },
    { id: "creating", title: "Creating your memory", description: "Our creative team is creating your music and artwork.", states: ["CREATIVE.IN_PROGRESS"] },
    { id: "quality", title: "Quality check", description: "We're checking every detail before your keepsake is made.", states: ["QUALITY_CHECK"] },
    { id: "making", title: "Being made", description: "Your keepsake is being made.", states: ["FULFILMENT.PENDING", "FULFILMENT.READY", "FULFILMENT.AUTHORISED", "FULFILMENT.CONFIRMED"] },
    { id: "on-its-way", title: "On its way", description: "Your order has been sent. If it includes more than one item, they may arrive in separate parcels.", states: ["DISPATCHED"] },
    { id: "delivered", title: "Delivered", description: "Your keepsake has arrived — we hope you love the reveal.", states: ["DELIVERED", "FOLLOW_UP.DUE", "COMPLETED"] },
  ],
};

/* ------------------------------------------------------------------ */
/* Internal quality control                                            */
/* ------------------------------------------------------------------ */

/**
 * The checklist a person at MCB completes before anything is revealed or
 * made. INTERNAL: never shown to a customer. `appliesTo` PHYSICAL items are
 * required only for orders with something physical.
 */
export const QC_CHECKLIST: readonly { readonly id: string; readonly label: string; readonly appliesTo: "ALL" | "PHYSICAL" }[] = [
  { id: "correct_order", label: "Correct customer and order", appliesTo: "ALL" },
  { id: "names", label: "Names represented exactly as supplied", appliesTo: "ALL" },
  { id: "details", label: "Dates, places and details match what was supplied", appliesTo: "ALL" },
  { id: "no_other_customer", label: "Nothing from another customer's order", appliesTo: "ALL" },
  { id: "song_version", label: "Correct song file and version", appliesTo: "ALL" },
  { id: "spelling", label: "Spelling checked", appliesTo: "ALL" },
  { id: "sku", label: "Correct product and SKU", appliesTo: "ALL" },
  { id: "no_output_defect", label: "No obvious defect in the output", appliesTo: "ALL" },
  { id: "quality_standard", label: "Meets MCB's quality standard", appliesTo: "ALL" },
  { id: "photographs", label: "The customer's own photograph(s) used", appliesTo: "PHYSICAL" },
  { id: "artwork_dimensions", label: "Artwork dimensions correct for the production partner", appliesTo: "PHYSICAL" },
  { id: "production_files", label: "Production files correct", appliesTo: "PHYSICAL" },
  { id: "delivery_information", label: "Delivery information correct", appliesTo: "PHYSICAL" },
];

/** Why a quality check failed. The work returns to creation for an internal correction. */
export const QC_FAIL_REASONS: readonly string[] = [
  "NAMES", "DETAILS", "OTHER_CUSTOMER_MATERIAL", "AUDIO", "ARTWORK", "SPELLING", "PRODUCTION_FILES", "SKU", "DELIVERY_INFORMATION", "QUALITY", "OTHER",
];

/**
 * Why staff reopen finished work. There is no customer-request reopen: a
 * customer's creative preference does not reopen production.
 */
export const REOPEN_REASONS: readonly string[] = ["MCB_CORRECTION", "REPLACEMENT", "OTHER"];

/* ------------------------------------------------------------------ */
/* Overdue                                                             */
/* ------------------------------------------------------------------ */

/**
 * INTERNAL operational objectives, in hours after payment, used only to flag
 * an order as overdue in the staff queue. Not a customer promise: the site
 * promises no number of minutes or hours. A Moment is revealed as quickly as
 * creation and the quality check allow; other personalised work aims to be
 * ready for the quality check within about a day, subject to workload.
 */
export const CREATIVE_TARGET_HOURS: Readonly<Record<string, number>> = {
  moment: 24,
  keepsake: 24,
  journey: 24,
};

export { PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS };

/* ------------------------------------------------------------------ */
/* Lifecycle email                                                     */
/* ------------------------------------------------------------------ */

export type LifecycleMessageType =
  | "CREATION_READY"
  | "IN_PRODUCTION"
  | "DISPATCHED"
  | "ADDITIONAL_PARCEL_DISPATCHED"
  | "DELIVERY_UPDATE"
  | "DELIVERED"
  | "FOLLOW_UP"
  | "REVIEW_REQUEST";

export interface LifecycleTemplate {
  readonly type: LifecycleMessageType;
  /** The automation event that makes this message relevant. */
  readonly trigger: string;
  /**
   * Sent by the server as part of the staff action that raises the trigger.
   * False: only ever sent when a person asks for it.
   */
  readonly autoSend: boolean;
  readonly workflows: readonly Workflow[];
  readonly purpose: string;
}

/**
 * Every customer message is ONE-WAY: nothing asks the customer to approve,
 * reply or choose before MCB continues. The retired APPROVAL_REQUIRED,
 * CHANGES_RECEIVED and APPROVAL_CONFIRMED messages are no longer sent.
 */
export const LIFECYCLE_TEMPLATES: readonly LifecycleTemplate[] = [
  { type: "CREATION_READY", trigger: "REVEALED", autoSend: true, workflows: ["DIGITAL"], purpose: "The reveal: your MCB creation is ready, with a private link to your order page where it plays." },
  { type: "IN_PRODUCTION", trigger: "FULFILMENT.CONFIRMED", autoSend: true, workflows: ["PHYSICAL"], purpose: "A one-way note that the keepsake is being made." },
  { type: "DISPATCHED", trigger: "DISPATCHED", autoSend: true, workflows: ["PHYSICAL"], purpose: "Your order is on the way, with tracking where MCB has it." },
  { type: "ADDITIONAL_PARCEL_DISPATCHED", trigger: "SHIPMENT.PARCEL_DISPATCHED", autoSend: true, workflows: ["PHYSICAL"], purpose: "Another part of your order is on the way, with its tracking." },
  { type: "DELIVERY_UPDATE", trigger: "FULFILMENT.EXCEPTION_OPENED", autoSend: false, workflows: ["PHYSICAL"], purpose: "A calm update when a delivery is delayed; sent only when staff choose." },
  { type: "DELIVERED", trigger: "DELIVERED", autoSend: false, workflows: ["PHYSICAL"], purpose: "Your order has arrived, with the damage guidance; sent when staff choose." },
  { type: "FOLLOW_UP", trigger: "FOLLOW_UP.DUE", autoSend: false, workflows: ["DIGITAL", "PHYSICAL"], purpose: "A personal check-in, sent when staff choose." },
  { type: "REVIEW_REQUEST", trigger: "ORDER.COMPLETED", autoSend: false, workflows: ["DIGITAL", "PHYSICAL"], purpose: "Asks for a review, only for a completed order and only when a review URL is configured." },
];

/* ------------------------------------------------------------------ */
/* Automation-ready events                                             */
/* ------------------------------------------------------------------ */

/**
 * Stable event names an automation may subscribe to. Recording them triggers
 * nothing: no supplier order, refund, payment or charge follows from any of
 * them automatically.
 */
export const AUTOMATION_EVENTS: readonly string[] = [
  "ORDER.PAID",
  "ORDER.READY_FOR_PROCESSING",
  "CREATIVE.IN_PROGRESS",
  "ARTWORK.INPUT_VALIDATED",
  "ARTWORK.PREPARATION_REQUIRED",
  "ARTWORK.TEMPLATE_REQUIRED",
  "ARTWORK.EXCEPTION",
  "ARTWORK.READY",
  "QUALITY_CHECK.READY",
  "QUALITY_CHECK.PASSED",
  "QUALITY_CHECK.FAILED",
  "REVEALED",
  "FULFILMENT.READY",
  "FULFILMENT.AUTHORISED",
  "FULFILMENT.CONFIRMED",
  "DISPATCHED",
  "DELIVERED",
  "ORDER.COMPLETED",
  "FOLLOW_UP.DUE",
  "FOLLOW_UP.SENT",
  "REVIEW.REQUESTED",
  "MCB_LIVE.ENQUIRY_RECEIVED",
  "BESPOKE.ENQUIRY_RECEIVED",
  // Creative Factory (provider-independent)
  "CREATIVE.JOB_READY",
  "CREATIVE.FACT_LEDGER_READY",
  "CREATIVE.STORY_MAP_READY",
  "CREATIVE.LYRICS_REQUIRED",
  "CREATIVE.LYRICS_READY",
  "CREATIVE.PLAN_READY",
  "CREATIVE.GENERATION_REQUIRED",
  "CREATIVE.GENERATION_STARTED",
  "CREATIVE.CANDIDATE_READY",
  "CREATIVE.TECHNICAL_QC_PASSED",
  "CREATIVE.FACT_QC_PASSED",
  "CREATIVE.CREATIVE_QC_REQUIRED",
  "CREATIVE.CREATIVE_QC_PASSED",
  "CREATIVE.MASTER_READY",
  "CREATIVE.ALBUM_QC_REQUIRED",
  "CREATIVE.ALBUM_READY",
  "CREATIVE.EXCEPTION",
  "AUDIO.CAPACITY_CHECK_REQUIRED",
  "AUDIO.CAPACITY_PASSED",
  "AUDIO.CAPACITY_EXCEPTION",
  // Production File Factory
  "ARTWORK.CREATIVE_JOB_READY",
  "ARTWORK.CREATIVE_MASTER_READY",
  "ARTWORK.VISUAL_QC_REQUIRED",
  "ARTWORK.VISUAL_QC_PASSED",
  "PRODUCTION.RENDER_REQUIRED",
  "PRODUCTION.MASTER_READY",
  "PRODUCTION.FILE_QC_PASSED",
  "MANUFACTURING.PACKAGE_REQUIRED",
  "MANUFACTURING.PACKAGE_READY",
  "MANUFACTURING.DATA_REQUIRED",
  // Fulfilment Controller (each partner order a person placed and recorded; the first also confirms fulfilment)
  "FULFILMENT.PARTNER_ORDER_RECORDED",
  "SHIPMENT.PARCEL_DISPATCHED",
  "SHIPMENT.IN_TRANSIT",
  "SHIPMENT.PARCEL_DELIVERED",
  "FULFILMENT.EXCEPTION_OPENED",
  "FULFILMENT.EXCEPTION_RESOLVED",
  "COMMERCIAL.ECONOMICS_CALCULATED",
];

/**
 * The Founders' automation event model, mapped to the event MCB already
 * records for the same moment. One name per meaning: where the model's name
 * and an existing event mean the same thing, the existing event is used and
 * no second event is written.
 */
export const EVENT_MODEL: Readonly<Record<string, string>> = {
  "ORDER.PAID": "ORDER.PAID",
  "ORDER.READY_FOR_PROCESSING": "ORDER.READY_FOR_PROCESSING",
  "CREATIVE.PENDING": "ORDER.READY_FOR_PROCESSING",
  "CREATIVE.IN_PROGRESS": "CREATIVE.IN_PROGRESS",
  "CREATIVE.READY": "QUALITY_CHECK.READY",
  "ARTWORK.INPUT_VALIDATED": "ARTWORK.INPUT_VALIDATED",
  "ARTWORK.PREPARATION_REQUIRED": "ARTWORK.PREPARATION_REQUIRED",
  "ARTWORK.TEMPLATE_REQUIRED": "ARTWORK.TEMPLATE_REQUIRED",
  "ARTWORK.READY": "ARTWORK.READY",
  "QC.REQUIRED": "QUALITY_CHECK.READY",
  "QC.PASSED": "QUALITY_CHECK.PASSED",
  "QC.FAILED": "QUALITY_CHECK.FAILED",
  "FULFILMENT.READY": "FULFILMENT.READY",
  "FULFILMENT.APPROVAL_REQUIRED": "FULFILMENT.READY",
  "FULFILMENT.AUTHORISED": "FULFILMENT.AUTHORISED",
  "SUPPLIER.ORDER_REQUIRED": "FULFILMENT.AUTHORISED",
  // The first supplier order moves the order to FULFILMENT.CONFIRMED; every partner
  // order of a split order is also recorded as FULFILMENT.PARTNER_ORDER_RECORDED.
  "SUPPLIER.ORDER_RECORDED": "FULFILMENT.CONFIRMED",
  "SHIPMENT.DISPATCHED": "DISPATCHED",
  "SHIPMENT.DELIVERED": "DELIVERED",
  "REVEAL.READY": "QUALITY_CHECK.PASSED",
  "REVEAL.SENT": "REVEALED",
  "FOLLOW_UP.DUE": "FOLLOW_UP.DUE",
  "FOLLOW_UP.SENT": "FOLLOW_UP.SENT",
  "REVIEW.REQUESTED": "REVIEW.REQUESTED",
  // Creative Factory: CREATIVE.READY stays the existing QUALITY_CHECK.READY; the
  // factory's own milestones are new names with no earlier equivalent.
  "CREATIVE.JOB_READY": "CREATIVE.JOB_READY",
  "CREATIVE.FACT_LEDGER_READY": "CREATIVE.FACT_LEDGER_READY",
  "CREATIVE.STORY_MAP_READY": "CREATIVE.STORY_MAP_READY",
  "CREATIVE.LYRICS_REQUIRED": "CREATIVE.LYRICS_REQUIRED",
  "CREATIVE.LYRICS_READY": "CREATIVE.LYRICS_READY",
  "CREATIVE.PLAN_READY": "CREATIVE.PLAN_READY",
  "CREATIVE.GENERATION_REQUIRED": "CREATIVE.GENERATION_REQUIRED",
  "CREATIVE.GENERATION_STARTED": "CREATIVE.GENERATION_STARTED",
  "CREATIVE.CANDIDATE_READY": "CREATIVE.CANDIDATE_READY",
  "CREATIVE.TECHNICAL_QC_PASSED": "CREATIVE.TECHNICAL_QC_PASSED",
  "CREATIVE.FACT_QC_PASSED": "CREATIVE.FACT_QC_PASSED",
  "CREATIVE.CREATIVE_QC_REQUIRED": "CREATIVE.CREATIVE_QC_REQUIRED",
  "CREATIVE.CREATIVE_QC_PASSED": "CREATIVE.CREATIVE_QC_PASSED",
  "CREATIVE.MASTER_READY": "CREATIVE.MASTER_READY",
  "CREATIVE.ALBUM_QC_REQUIRED": "CREATIVE.ALBUM_QC_REQUIRED",
  "CREATIVE.ALBUM_READY": "CREATIVE.ALBUM_READY",
  "CREATIVE.EXCEPTION": "CREATIVE.EXCEPTION",
  "AUDIO.CAPACITY_CHECK_REQUIRED": "AUDIO.CAPACITY_CHECK_REQUIRED",
  "AUDIO.CAPACITY_PASSED": "AUDIO.CAPACITY_PASSED",
  "AUDIO.CAPACITY_EXCEPTION": "AUDIO.CAPACITY_EXCEPTION",
  // Production File Factory. FULFILMENT.APPROVAL_REQUIRED stays FULFILMENT.READY (above).
  "ARTWORK.CREATIVE_JOB_READY": "ARTWORK.CREATIVE_JOB_READY",
  "ARTWORK.CREATIVE_MASTER_READY": "ARTWORK.CREATIVE_MASTER_READY",
  "ARTWORK.VISUAL_QC_REQUIRED": "ARTWORK.VISUAL_QC_REQUIRED",
  "ARTWORK.VISUAL_QC_PASSED": "ARTWORK.VISUAL_QC_PASSED",
  "PRODUCTION.RENDER_REQUIRED": "PRODUCTION.RENDER_REQUIRED",
  "PRODUCTION.MASTER_READY": "PRODUCTION.MASTER_READY",
  "PRODUCTION.FILE_QC_PASSED": "PRODUCTION.FILE_QC_PASSED",
  "MANUFACTURING.PACKAGE_REQUIRED": "MANUFACTURING.PACKAGE_REQUIRED",
  "MANUFACTURING.PACKAGE_READY": "MANUFACTURING.PACKAGE_READY",
  "MANUFACTURING.DATA_REQUIRED": "MANUFACTURING.DATA_REQUIRED",
};

/* ------------------------------------------------------------------ */
/* Founder notifications                                               */
/* ------------------------------------------------------------------ */

export type FounderNotificationType =
  | "NEW_ORDER_READY_FOR_PROCESSING"
  | "FULFILMENT_APPROVAL_REQUIRED"
  | "QC_EXCEPTION"
  | "ARTWORK_EXCEPTION"
  | "FULFILMENT_EXCEPTION"
  | "CUSTOMER_SUPPORT_EXCEPTION"
  | "PRODUCT_SALES_SUSPENDED"
  | "CREATIVE_EXCEPTION"
  | "AUDIO_CAPACITY_EXCEPTION"
  | "COMMERCIAL_SAFETY_EXCEPTION"
  | "MANUFACTURING_DATA_REQUIRED"
  | "DELIVERY_EXCEPTION";

/**
 * What interrupts the Founders. Exceptions and decisions only — plus every
 * new paid order. Written to the outbox (lib/founder-notifications.php) and
 * delivered by a separately authorised worker; nothing here calls a provider.
 */
export const FOUNDER_NOTIFICATIONS: readonly { readonly type: FounderNotificationType; readonly title: string; readonly requiredAction: string }[] = [
  { type: "NEW_ORDER_READY_FOR_PROCESSING", title: "New order ready for processing", requiredAction: "Open the order and start the creative work." },
  { type: "FULFILMENT_APPROVAL_REQUIRED", title: "Fulfilment approval required", requiredAction: "Open the order and approve the supplier purchase (Bella or Lewis)." },
  { type: "QC_EXCEPTION", title: "Quality check failed", requiredAction: "Open the order: the work is back in creation for an internal correction." },
  { type: "ARTWORK_EXCEPTION", title: "Artwork needs attention", requiredAction: "Open the order and review the production artwork." },
  { type: "FULFILMENT_EXCEPTION", title: "Fulfilment exception", requiredAction: "Open the order and resolve what is holding fulfilment or delivery." },
  { type: "CUSTOMER_SUPPORT_EXCEPTION", title: "Customer support report", requiredAction: "Open the order and review the customer's report." },
  { type: "CREATIVE_EXCEPTION", title: "Creative production exception", requiredAction: "Open the order's Creative Factory panel: a song needs a person (retry limit reached or escalated)." },
  { type: "AUDIO_CAPACITY_EXCEPTION", title: "Audio capacity exception", requiredAction: "Open the order: the finished programme does not fit the verified record capacity. Nothing is shortened automatically." },
  { type: "COMMERCIAL_SAFETY_EXCEPTION", title: "Commercial safety exception", requiredAction: "Open the order: expected fulfilment economics break MCB's commercial safety rule. The paid order is not cancelled." },
  { type: "MANUFACTURING_DATA_REQUIRED", title: "Manufacturing data required", requiredAction: "Open the order: the manufacturer has not supplied information this product needs." },
  { type: "DELIVERY_EXCEPTION", title: "Delivery exception", requiredAction: "Open the order and resolve the delivery exception." },
  { type: "PRODUCT_SALES_SUSPENDED", title: "New sales suspended", requiredAction: "Review the product's availability. Existing paid orders are unaffected." },
];

/** Who may authorise money leaving MCB. Either one is enough; automation is neither. */
export const FINANCIAL_AUTHORISERS = ["BELLA", "LEWIS"] as const;

/* ------------------------------------------------------------------ */
/* The action and exception queue                                      */
/* ------------------------------------------------------------------ */

export type QueueKind =
  | "MISSING_INFORMATION"
  | "NEW_ORDER"
  | "CREATIVE_WORK"
  | "QUALITY_CHECK"
  | "REVEAL_READY"
  | "INCORRECT_DETAIL"
  | "PAYMENT_REVIEW"
  | "FULFILMENT_READY"
  | "SUPPLIER_ORDER_REQUIRED"
  | "SUPPLIER_ACTION"
  | "ARTWORK_EXCEPTION"
  | "NOTIFICATION_FAILED"
  | "CREATIVE_EXCEPTION"
  | "CREATIVE_ACTION"
  | "PRODUCTION_EXCEPTION"
  | "PRODUCTION_ACTION"
  | "FULFILMENT_EXCEPTION"
  | "FULFILMENT_HEALTH"
  | "DELIVERY_DELAY"
  | "REPLACEMENT_REQUEST"
  | "SUPPORT"
  | "BESPOKE_ENQUIRY"
  | "MCB_LIVE_ENQUIRY"
  | "OVERDUE"
  | "FOLLOW_UP_DUE"
  | "MESSAGE_FAILED";

export const QUEUE_KINDS: Readonly<Record<QueueKind, { readonly label: string; readonly priority: 1 | 2 | 3 }>> = {
  PAYMENT_REVIEW: { label: "Payment needs review", priority: 1 },
  REPLACEMENT_REQUEST: { label: "Damaged or faulty item reported", priority: 1 },
  OVERDUE: { label: "Overdue", priority: 1 },
  DELIVERY_DELAY: { label: "Delivery delayed", priority: 1 },
  MISSING_INFORMATION: { label: "Missing information", priority: 1 },
  INCORRECT_DETAIL: { label: "Incorrect detail reported", priority: 1 },
  NEW_ORDER: { label: "New order ready for processing", priority: 2 },
  CREATIVE_WORK: { label: "Creative work", priority: 2 },
  QUALITY_CHECK: { label: "Quality check due", priority: 2 },
  REVEAL_READY: { label: "Ready to reveal", priority: 2 },
  ARTWORK_EXCEPTION: { label: "Artwork needs attention", priority: 1 },
  NOTIFICATION_FAILED: { label: "Founder notification not delivered", priority: 1 },
  CREATIVE_EXCEPTION: { label: "Creative production exception", priority: 1 },
  CREATIVE_ACTION: { label: "Creative Factory step waiting", priority: 2 },
  PRODUCTION_EXCEPTION: { label: "Production file or manufacturing exception", priority: 1 },
  PRODUCTION_ACTION: { label: "Production File Factory step waiting", priority: 2 },
  FULFILMENT_EXCEPTION: { label: "Fulfilment exception open", priority: 1 },
  FULFILMENT_HEALTH: { label: "Order may be stranded", priority: 1 },
  FULFILMENT_READY: { label: "Fulfilment approval required", priority: 2 },
  SUPPLIER_ORDER_REQUIRED: { label: "Authorised: place supplier order", priority: 2 },
  SUPPLIER_ACTION: { label: "Waiting to dispatch", priority: 2 },
  SUPPORT: { label: "Customer question", priority: 2 },
  MESSAGE_FAILED: { label: "Email not sent", priority: 2 },
  BESPOKE_ENQUIRY: { label: "Bespoke enquiry", priority: 2 },
  MCB_LIVE_ENQUIRY: { label: "MCB LIVE enquiry", priority: 2 },
  FOLLOW_UP_DUE: { label: "Follow-up due", priority: 3 },
};
