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
 *   stage QC_PASSED, fulfilment READY     → FULFILMENT.READY
 *   stage PRODUCTION_LOCKED (CONFIRMED)   → FULFILMENT.CONFIRMED
 *   stage FULFILMENT, DISPATCHED          → DISPATCHED
 *   stage FULFILMENT, DELIVERED           → DELIVERED, then FOLLOW_UP.DUE
 *   stage COMPLETED                       → COMPLETED
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
  { state: "FULFILMENT.READY", workflows: ["PHYSICAL"], staff: "Quality check passed and ready for the physical order to be placed.", nextAction: "Bella or Lewis authorises the partner purchase; place it by hand, then confirm it here." },
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
    { id: "making", title: "Being made", description: "Your keepsake is being made.", states: ["FULFILMENT.PENDING", "FULFILMENT.READY", "FULFILMENT.CONFIRMED"] },
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
  "QUALITY_CHECK.READY",
  "QUALITY_CHECK.PASSED",
  "QUALITY_CHECK.FAILED",
  "REVEALED",
  "FULFILMENT.READY",
  "DISPATCHED",
  "DELIVERED",
  "FOLLOW_UP.DUE",
  "MCB_LIVE.ENQUIRY_RECEIVED",
  "BESPOKE.ENQUIRY_RECEIVED",
];

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
  | "SUPPLIER_ACTION"
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
  FULFILMENT_READY: { label: "Ready to order from supplier", priority: 2 },
  SUPPLIER_ACTION: { label: "Waiting to dispatch", priority: 2 },
  SUPPORT: { label: "Customer question", priority: 2 },
  MESSAGE_FAILED: { label: "Email not sent", priority: 2 },
  BESPOKE_ENQUIRY: { label: "Bespoke enquiry", priority: 2 },
  MCB_LIVE_ENQUIRY: { label: "MCB LIVE enquiry", priority: 2 },
  FOLLOW_UP_DUE: { label: "Follow-up due", priority: 3 },
};
