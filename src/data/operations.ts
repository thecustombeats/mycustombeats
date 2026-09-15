/**
 * MCB OPERATIONS — what happens after payment, as data.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE STATE MODEL, BUILT ON THE ONE THAT ALREADY EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * Payment stays in `orders.status` (PENDING, PAID, PAYMENT_REVIEW …). The work
 * stays in `order_production.stage` (legal/production.ts), which already
 * decides when included refinements close. Sprint 5 adds the physical side —
 * `order_production.fulfilment_state` — and a few timestamps, and derives the
 * operational state below from those columns. Nothing stores the operational
 * state a second time, so it cannot disagree with the columns it describes.
 *
 *   stage CREATIVE (not started)          → CREATIVE.PENDING
 *   stage CREATIVE (started)              → CREATIVE.IN_PROGRESS
 *   stage SONG_READY                      → CREATIVE.READY
 *   stage AWAITING_APPROVAL               → CUSTOMER_APPROVAL.REQUIRED
 *   stage REVISION_REQUESTED              → CUSTOMER_APPROVAL.CHANGES_REQUESTED
 *   stage APPROVED, digital               → CUSTOMER_APPROVAL.APPROVED, then FOLLOW_UP.DUE
 *   stage APPROVED, fulfilment PENDING    → FULFILMENT.PENDING
 *   stage APPROVED, fulfilment READY      → FULFILMENT.READY
 *   stage PRODUCTION_LOCKED (CONFIRMED)   → FULFILMENT.CONFIRMED
 *   stage FULFILMENT, DISPATCHED          → DISPATCHED
 *   stage FULFILMENT, DELIVERED           → DELIVERED, then FOLLOW_UP.DUE
 *   stage COMPLETED                       → COMPLETED
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
  | "CREATIVE.READY"
  | "CUSTOMER_APPROVAL.REQUIRED"
  | "CUSTOMER_APPROVAL.CHANGES_REQUESTED"
  | "CUSTOMER_APPROVAL.APPROVED"
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
  { state: "ORDER.PAID", workflows: ["DIGITAL", "PHYSICAL"], staff: "Paid. No production record yet (an order from before the production table).", nextAction: "Check the order and start the creative work." },
  { state: "CREATIVE.PENDING", workflows: ["DIGITAL", "PHYSICAL"], staff: "Paid and waiting for the creative work to start.", nextAction: "Start the creative work." },
  { state: "CREATIVE.IN_PROGRESS", workflows: ["DIGITAL", "PHYSICAL"], staff: "The music is being written and produced.", nextAction: "Finish the music and mark it ready." },
  { state: "CREATIVE.READY", workflows: ["DIGITAL", "PHYSICAL"], staff: "Finished internally and not yet with the customer.", nextAction: "Send it to the customer for approval." },
  { state: "CUSTOMER_APPROVAL.REQUIRED", workflows: ["DIGITAL", "PHYSICAL"], staff: "With the customer to listen to and approve.", nextAction: "Wait for the customer, or record an approval they gave another way." },
  { state: "CUSTOMER_APPROVAL.CHANGES_REQUESTED", workflows: ["DIGITAL", "PHYSICAL"], staff: "The customer has asked for changes.", nextAction: "Read the requested changes, make them and mark the music ready again." },
  { state: "CUSTOMER_APPROVAL.APPROVED", workflows: ["DIGITAL"], staff: "The customer has approved their song.", nextAction: "Nothing to make or send. Follow up, then complete." },
  { state: "FULFILMENT.NOT_REQUIRED", workflows: ["DIGITAL"], staff: "Digital: nothing physical to make.", nextAction: null },
  { state: "FULFILMENT.PENDING", workflows: ["PHYSICAL"], staff: "Approved, but something is missing before the Keepsake can be made.", nextAction: "Resolve what is missing, then mark fulfilment ready." },
  { state: "FULFILMENT.READY", workflows: ["PHYSICAL"], staff: "Approved and ready for the physical order to be placed.", nextAction: "Place the supplier order by hand, then confirm it here." },
  { state: "FULFILMENT.CONFIRMED", workflows: ["PHYSICAL"], staff: "The physical order is placed. It can no longer be changed.", nextAction: "When it is sent, record the dispatch and tracking." },
  { state: "DISPATCHED", workflows: ["PHYSICAL"], staff: "Sent to the customer.", nextAction: "When delivery is confirmed, mark it delivered." },
  { state: "DELIVERED", workflows: ["PHYSICAL"], staff: "Delivery confirmed by a person.", nextAction: "Follow up, then complete." },
  { state: "FOLLOW_UP.DUE", workflows: ["DIGITAL", "PHYSICAL"], staff: "Delivered or approved, and a follow-up is due.", nextAction: "Check in with the customer, record the follow-up, then complete." },
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
    { id: "received", title: "Order received", description: "We have your order and your story.", states: ["ORDER.PAID", "CREATIVE.PENDING"] },
    { id: "creating", title: "Creating your song", description: "We are writing and producing your song.", states: ["CREATIVE.IN_PROGRESS", "CREATIVE.READY", "CUSTOMER_APPROVAL.CHANGES_REQUESTED"] },
    { id: "listen", title: "Ready for you to listen", description: "We have sent you a link to listen and tell us what you think.", states: ["CUSTOMER_APPROVAL.REQUIRED"] },
    { id: "approved", title: "Approved", description: "You have approved your song.", states: ["CUSTOMER_APPROVAL.APPROVED", "FOLLOW_UP.DUE"] },
    { id: "complete", title: "Complete", description: "Your Moment is complete.", states: ["COMPLETED"] },
  ],
  PHYSICAL: [
    { id: "received", title: "Order received", description: "We have your order and your story.", states: ["ORDER.PAID", "CREATIVE.PENDING"] },
    { id: "creating", title: "Creating your music", description: "We are writing and producing your music.", states: ["CREATIVE.IN_PROGRESS", "CREATIVE.READY", "CUSTOMER_APPROVAL.CHANGES_REQUESTED"] },
    { id: "listen", title: "Ready for you to listen", description: "We have sent you a link to listen and approve your music.", states: ["CUSTOMER_APPROVAL.REQUIRED"] },
    { id: "making", title: "Making your keepsake", description: "Your music is approved and we're coordinating the making of your keepsake.", states: ["FULFILMENT.PENDING", "FULFILMENT.READY", "FULFILMENT.CONFIRMED"] },
    { id: "on-its-way", title: "On its way", description: "Your order has been sent. If it includes more than one item, they may arrive in separate parcels.", states: ["DISPATCHED"] },
    { id: "delivered", title: "Delivered", description: "Your order has been delivered.", states: ["DELIVERED", "FOLLOW_UP.DUE"] },
    { id: "complete", title: "Complete", description: "Your order is complete.", states: ["COMPLETED"] },
  ],
};

/* ------------------------------------------------------------------ */
/* Included revisions                                                  */
/* ------------------------------------------------------------------ */

/**
 * The allowance, as numbers, for the products whose approved catalogue wording
 * states one: "1 revision" (Moment) and "1 refinement per song" (Keepsake,
 * Journey). tests/operations.test.mjs checks each entry against that wording.
 *
 * Nothing else has a number. Bespoke refinement "continues until the agreed
 * scope is met", which is a proposal term rather than a count, so it is
 * surfaced to staff as UNKNOWN rather than given an invented figure.
 */
export const INCLUDED_REVISIONS: Readonly<Record<string, { readonly count: number; readonly per: "UNIT" | "SONG" }>> = {
  moment: { count: 1, per: "UNIT" },
  keepsake: { count: 1, per: "SONG" },
  journey: { count: 1, per: "SONG" },
};

/* ------------------------------------------------------------------ */
/* Overdue                                                             */
/* ------------------------------------------------------------------ */

/**
 * Hours after payment by which the music should be with the customer, for the
 * products that have an approved numeric target. The Moment's catalogue line
 * is "Target delivery within 1 hour". Made-to-order products have no approved
 * number; their threshold is a server setting (`operations.overdue_after_days`)
 * and is inactive until someone sets it.
 */
export const CREATIVE_TARGET_HOURS: Readonly<Record<string, number>> = {
  moment: 1,
};

export { PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS };

/* ------------------------------------------------------------------ */
/* Lifecycle email                                                     */
/* ------------------------------------------------------------------ */

export type LifecycleMessageType =
  | "APPROVAL_REQUIRED"
  | "CHANGES_RECEIVED"
  | "APPROVAL_CONFIRMED"
  | "DISPATCHED"
  | "FOLLOW_UP"
  | "REVIEW_REQUEST";

export interface LifecycleTemplate {
  readonly type: LifecycleMessageType;
  /** The automation event that makes this message relevant. */
  readonly trigger: string;
  /**
   * Sent by the server as part of the staff action or customer response that
   * raises the trigger. False: only ever sent when a person asks for it.
   */
  readonly autoSend: boolean;
  readonly workflows: readonly Workflow[];
  readonly purpose: string;
}

export const LIFECYCLE_TEMPLATES: readonly LifecycleTemplate[] = [
  { type: "APPROVAL_REQUIRED", trigger: "CUSTOMER.APPROVAL.REQUIRED", autoSend: true, workflows: ["DIGITAL", "PHYSICAL"], purpose: "The private link to listen and approve or ask for changes." },
  { type: "CHANGES_RECEIVED", trigger: "CUSTOMER.CHANGES.REQUESTED", autoSend: true, workflows: ["DIGITAL", "PHYSICAL"], purpose: "Confirms the change request arrived." },
  { type: "APPROVAL_CONFIRMED", trigger: "CUSTOMER.APPROVAL.APPROVED", autoSend: true, workflows: ["DIGITAL", "PHYSICAL"], purpose: "Confirms the approval and says what happens next." },
  { type: "DISPATCHED", trigger: "DISPATCHED", autoSend: true, workflows: ["PHYSICAL"], purpose: "Says the order has been sent, with tracking where MCB has it." },
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
  "CREATIVE.READY",
  "CUSTOMER.APPROVAL.REQUIRED",
  "CUSTOMER.APPROVAL.APPROVED",
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
  | "CREATIVE_WORK"
  | "APPROVAL_REQUIRED"
  | "CHANGES_REQUESTED"
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
  CHANGES_REQUESTED: { label: "Changes requested", priority: 2 },
  CREATIVE_WORK: { label: "Creative work", priority: 2 },
  FULFILMENT_READY: { label: "Ready to order from supplier", priority: 2 },
  SUPPLIER_ACTION: { label: "Waiting to dispatch", priority: 2 },
  SUPPORT: { label: "Customer question", priority: 2 },
  MESSAGE_FAILED: { label: "Email not sent", priority: 2 },
  BESPOKE_ENQUIRY: { label: "Bespoke enquiry", priority: 2 },
  MCB_LIVE_ENQUIRY: { label: "MCB LIVE enquiry", priority: 2 },
  APPROVAL_REQUIRED: { label: "Waiting for customer approval", priority: 3 },
  FOLLOW_UP_DUE: { label: "Follow-up due", priority: 3 },
};
