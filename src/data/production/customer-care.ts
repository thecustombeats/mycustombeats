/**
 * MCB™ Customer Care & Recovery — the policy data (16 September 2026).
 *
 * THE CUSTOMER BOUGHT FROM MCB. MCB OWNS THE EXPERIENCE.
 *
 * Customers never need to understand suppliers, production partners,
 * automation, providers, internal quality checks, founder approvals or supplier
 * economics to get help. They choose what is wrong in plain words; MCB does the
 * rest.
 *
 * Generated to public/api/data/customer-care.json (INTERNAL, 403 over HTTP) by
 * scripts/generate-catalogue-json.mjs. The customer-facing words live here too,
 * so the page and the server say the same thing.
 *
 * SINGLE CREATIVE AUTHORITY. A support case is never a revision round: a
 * subjective creative preference does not reopen production, and nothing here
 * asks a customer to approve anything. Statutory rights are never affected.
 *
 * MONEY. No refund, discount, credit, free product, replacement purchase or
 * supplier purchase happens automatically. Anything that costs MCB money waits
 * for Bella or Lewis, with the existing founder authorisation.
 */

/** One address for MCB customer care. MCB LIVE WhatsApp is separate and never ordinary order support. */
export const SUPPORT_EMAIL = "hello@mycustombeats.com";

/** What the customer can choose, in their words. `physical` kinds need something posted; `video` needs a video in the order. */
export const SUPPORT_CASE_TYPES = [
  { kind: "QUESTION", label: "I have a question", applies: "ANY", priority: "NORMAL" },
  { kind: "DELIVERY_PROBLEM", label: "Delivery problem", applies: "PHYSICAL", priority: "IMPORTANT" },
  { kind: "DAMAGED_OR_FAULTY", label: "Damaged item", applies: "PHYSICAL", priority: "URGENT" },
  { kind: "WRONG_ITEM", label: "Wrong item", applies: "PHYSICAL", priority: "URGENT" },
  { kind: "MANUFACTURING_DEFECT", label: "Manufacturing problem", applies: "PHYSICAL", priority: "IMPORTANT" },
  { kind: "INCORRECT_DETAIL", label: "Something is incorrect", applies: "ANY", priority: "IMPORTANT" },
  { kind: "VIDEO_PROBLEM", label: "Video problem", applies: "VIDEO", priority: "IMPORTANT" },
  { kind: "DIGITAL_DELIVERY_PROBLEM", label: "Digital delivery problem", applies: "ANY", priority: "IMPORTANT" },
  { kind: "OTHER", label: "Other", applies: "ANY", priority: "NORMAL" },
] as const;

/** For digital and video problems: what is happening (optional). */
export const SUPPORT_DIGITAL_ISSUES = [
  { issue: "ACCESS", label: "I can't open my song or film" },
  { issue: "PLAYBACK", label: "It won't play properly" },
  { issue: "DOWNLOAD", label: "The download doesn't work" },
  { issue: "EXPIRED_LINK", label: "My link has stopped working" },
  { issue: "WRONG_FILE", label: "It isn't my song or film" },
  { issue: "CORRUPT_FILE", label: "The file seems damaged" },
] as const;

export const SUPPORT_CASE_STATUSES = ["NEW", "REVIEWING", "WAITING_FOR_MCB", "WAITING_FOR_CUSTOMER", "RESOLUTION_IN_PROGRESS", "RESOLVED", "CLOSED"] as const;

/** Statuses in which MCB owes the next action (the service target applies). */
export const SUPPORT_AWAITING_MCB = ["NEW", "REVIEWING", "WAITING_FOR_MCB"] as const;
export const SUPPORT_OPEN_STATUSES = ["NEW", "REVIEWING", "WAITING_FOR_MCB", "WAITING_FOR_CUSTOMER", "RESOLUTION_IN_PROGRESS"] as const;

/** What the customer sees for each status. Never the internal name. */
export const SUPPORT_CUSTOMER_STATUS = {
  NEW: { label: "We're looking into this", next: "We aim to reply within one working day." },
  REVIEWING: { label: "We're looking into this", next: "We aim to reply within one working day." },
  WAITING_FOR_MCB: { label: "We're looking into this", next: "We have your message and aim to reply within one working day." },
  WAITING_FOR_CUSTOMER: { label: "We need a little more from you", next: "Please read our reply below and let us know." },
  RESOLUTION_IN_PROGRESS: { label: "We're putting this right", next: "There's nothing you need to do. We'll keep you updated." },
  RESOLVED: { label: "Resolved", next: "If anything still isn't right, just reply below." },
  CLOSED: { label: "Closed", next: "If you need anything else, just tell us below." },
} as const;

export const SUPPORT_SERVICE_TARGET = {
  customerWording: "We aim to reply within one working day.",
  /** Internal target, in working days (Monday to Friday, UTC). Not a contractual guarantee. */
  firstResponseWorkingDays: 1,
  /** An URGENT case not reviewed within this many hours is flagged. */
  urgentReviewHours: 4,
  /** RESOLUTION_IN_PROGRESS with no MCB activity for this many working days is flagged. */
  resolutionStallWorkingDays: 5,
  /** An authorised replacement not completed after this many working days is flagged. */
  replacementActionWorkingDays: 2,
  /** An authorised refund not recorded after this many working days is flagged. */
  refundRecordWorkingDays: 3,
} as const;

export const SUPPORT_PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"] as const;

export const SUPPORT_CLASSIFICATIONS = ["UNCLASSIFIED", "OBJECTIVE_MCB_ERROR", "SUBJECTIVE_CREATIVE_PREFERENCE", "NOT_APPLICABLE"] as const;

export const SUPPORT_CLASSIFICATION_GUIDANCE = {
  OBJECTIVE_MCB_ERROR: "MCB got something wrong that the customer supplied correctly, or made it wrongly: a materially wrong name or date, another customer's artwork, the wrong song, a production or manufacturing fault. Eligible for a remedy.",
  SUBJECTIVE_CREATIVE_PREFERENCE: "A different personal preference: another colour, arrangement, crop or lyric. The customer entrusted the creative choices to MCB, so this does not reopen production. Respond warmly; normal consumer rights are not affected.",
} as const;

export const SUPPORT_PRIVACY_REVIEW = ["NOT_REQUIRED", "PRIVACY_REVIEW_REQUIRED", "PRIVACY_REVIEW_COMPLETED"] as const;

export const SUPPORT_SENTIMENTS = ["HAPPY", "NEUTRAL", "UNHAPPY", "UNKNOWN"] as const;

export const SUPPORT_ROOT_CAUSES = [
  "CREATIVE_ERROR", "ARTWORK_ERROR", "PRODUCTION_ERROR", "SUPPLIER_ERROR", "DELIVERY_ERROR",
  "CUSTOMER_INPUT_ERROR", "DIGITAL_DELIVERY_ERROR", "VIDEO_ERROR", "SYSTEM_ERROR", "UNKNOWN",
] as const;

export const SUPPORT_RECOVERY_OUTCOMES = ["RESOLVED", "REPLACED", "CORRECTED", "REDELIVERED", "REFUNDED", "PARTIALLY_REFUNDED", "OTHER"] as const;

/**
 * Remedies. `founder`: the decision is Bella's or Lewis's (with the founder
 * authorisation code). `costsMcb`: the default answer to "does this cost MCB
 * money?" — YES means founder authorisation; UNKNOWN is treated as YES.
 * `objectiveOnly`: refused on a subjective creative preference.
 */
export const SUPPORT_REMEDIES = [
  { type: "INFORMATION_PROVIDED", founder: false, costsMcb: "NO", objectiveOnly: false },
  { type: "TRACKING_UPDATE", founder: false, costsMcb: "NO", objectiveOnly: false },
  { type: "INTERNAL_CORRECTION", founder: false, costsMcb: "NO", objectiveOnly: true },
  { type: "REPRODUCTION_REQUIRED", founder: false, costsMcb: "UNKNOWN", objectiveOnly: true },
  { type: "REPLACEMENT_REQUIRED", founder: false, costsMcb: "YES", objectiveOnly: false },
  { type: "DIGITAL_REDELIVERY", founder: false, costsMcb: "NO", objectiveOnly: false },
  { type: "VIDEO_REDELIVERY", founder: false, costsMcb: "NO", objectiveOnly: false },
  { type: "PARTIAL_DELIVERY_RESOLUTION", founder: true, costsMcb: "UNKNOWN", objectiveOnly: false },
  { type: "CANCELLATION_REVIEW_REQUIRED", founder: true, costsMcb: "UNKNOWN", objectiveOnly: false },
  { type: "REFUND_REVIEW_REQUIRED", founder: true, costsMcb: "YES", objectiveOnly: false },
  { type: "OTHER_FOUNDER_RESOLUTION", founder: true, costsMcb: "UNKNOWN", objectiveOnly: false },
] as const;

export const SUPPORT_REMEDY_STATUSES = ["PROPOSED", "FOUNDER_APPROVAL_REQUIRED", "AUTHORISED", "IN_PROGRESS", "COMPLETED", "DECLINED", "CANCELLED"] as const;

/** A video remedy is never charged to another customer's production space. Platform allowance use is not accounted until verified. */
export const SUPPORT_VIDEO_CAPACITY_BASES = ["ORIGINAL_VIDEO_CAPACITY", "REWORK_ATTEMPT", "REPLACEMENT_VIDEO"] as const;

export const REFUND_REVIEW_STATUSES = ["REFUND_REVIEW_REQUIRED", "FOUNDER_DECISION_REQUIRED", "AUTHORISED", "DECLINED", "RECORDED"] as const;
export const REFUND_TYPES = ["FULL", "PARTIAL"] as const;

/** No review request to a customer whose problem was just resolved, for this many days. Configurable later (support.review_cooling_days). */
export const SUPPORT_RECOVERY_COOLING_DAYS = 30;

export const SUPPORT_SATISFACTION_QUESTION = "Did we resolve this for you?";

/** Until a retention policy is set, nothing here is deleted automatically. */
export const SUPPORT_RETENTION = {
  support_communications: "LEGAL_REVIEW_REQUIRED",
  support_evidence: "LEGAL_REVIEW_REQUIRED",
  refund_records: "LEGAL_REVIEW_REQUIRED",
  privacy_incidents: "LEGAL_REVIEW_REQUIRED",
  customer_content_records: "LEGAL_REVIEW_REQUIRED",
} as const;

/** Customer page wording. */
export const SUPPORT_COPY = {
  heading: "Need help with your order?",
  intro: "Tell us what's happened and we'll take care of it.",
  caseHeading: "We're helping with your order",
  serviceTarget: "We aim to reply within one working day.",
  incorrectDetailHelp: "For example a name, date, place or photograph different from what you gave us. Because you entrusted the creative choices to MCB, a different personal preference isn't treated as an error — but please tell us about anything that is genuinely wrong.",
  otherCustomerDetails: "It shows someone else's name, photographs or details",
  evidenceOptional: "A photo helps us put things right quickly. It is not needed for us to help you.",
  received: "Thank you. We have your message and we're looking into it. We aim to reply within one working day.",
  receivedRights: "Your normal consumer rights are not affected.",
} as const;

/**
 * Staff response templates: warm, human, brief, MCB-owned. Staff edit before
 * sending. No supplier policy presented as MCB policy, no legal promises, no
 * automatic compensation. {firstName} and {reference} are filled in.
 */
export const SUPPORT_TEMPLATES = [
  {
    key: "ACKNOWLEDGE",
    title: "We're on it",
    body: "Hello {firstName},\n\nThank you for letting us know. We're looking into your order {reference} now and will come back to you as soon as we can.\n\nWarm wishes,\nMCB",
  },
  {
    key: "ANSWER_QUESTION",
    title: "Answer a question",
    body: "Hello {firstName},\n\nThank you for your question about {reference}. \n\nIf there's anything else you'd like to know, just reply here.\n\nWarm wishes,\nMCB",
  },
  {
    key: "DELIVERY_DELAY",
    title: "Delivery taking longer",
    body: "Hello {firstName},\n\nI'm sorry your delivery is taking longer than expected. We're following it up for you now and will update you as soon as we know more. There's nothing you need to arrange yourself.\n\nWarm wishes,\nMCB",
  },
  {
    key: "DAMAGED_ITEM",
    title: "Damaged item",
    body: "Hello {firstName},\n\nI'm so sorry your order arrived damaged — that isn't the experience we want for you. We'll handle this for you. If you're able to add a photo of the parcel or the item on your order page it helps us move quickly, but it isn't needed for us to help.\n\nWarm wishes,\nMCB",
  },
  {
    key: "WRONG_ITEM",
    title: "Wrong item",
    body: "Hello {firstName},\n\nI'm very sorry — thank you for telling us straight away. We're looking into this as a priority and will be in touch shortly with what happens next. Please keep the item safe for now; there's no need to send it anywhere.\n\nWarm wishes,\nMCB",
  },
  {
    key: "INCORRECT_DETAIL_CORRECTING",
    title: "We made a mistake — correcting it",
    body: "Hello {firstName},\n\nThank you for pointing this out, and I'm sorry — we got this detail wrong. We're putting it right for you now and will let you know as soon as it's ready.\n\nWarm wishes,\nMCB",
  },
  {
    key: "CREATIVE_PREFERENCE",
    title: "A creative preference",
    body: "Hello {firstName},\n\nThank you for sharing how you feel — it really matters to us. Your creation was made by our team from the story and details you gave us, and we've checked it carefully against them. We're sorry it isn't quite what you imagined. If anything is factually wrong — a name, a date or a photograph — please tell us and we'll look at it straight away. Your normal consumer rights are not affected.\n\nWarm wishes,\nMCB",
  },
  {
    key: "DIGITAL_ACCESS",
    title: "Song or link access",
    body: "Hello {firstName},\n\nI'm sorry you've had trouble opening your creation. We've sent you a fresh private link to your order page, where you can listen again. If it still doesn't work, just reply and tell us which device you're using.\n\nWarm wishes,\nMCB",
  },
  {
    key: "VIDEO_PLAYBACK",
    title: "Video playback",
    body: "Hello {firstName},\n\nI'm sorry your Memory Music Video isn't playing as it should. Please open your order page again and press play — the film opens with a fresh private link each time. If it still won't play, tell us your device and browser and we'll sort it out.\n\nWarm wishes,\nMCB",
  },
  {
    key: "NEED_MORE_INFORMATION",
    title: "Ask for a little more",
    body: "Hello {firstName},\n\nThank you — so we can help as quickly as possible, could you tell us a little more? \n\nJust reply here on your order page.\n\nWarm wishes,\nMCB",
  },
  {
    key: "RESOLVED",
    title: "All sorted",
    body: "Hello {firstName},\n\nThis is now sorted for your order {reference}. Thank you for your patience. If anything still isn't right, just reply here.\n\nWarm wishes,\nMCB",
  },
] as const;
