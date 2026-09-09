/**
 * THE CREATIVE LIFECYCLE — where revision entitlement opens and closes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE COMMERCIAL PROBLEM THIS SOLVES
 * ─────────────────────────────────────────────────────────────────────────
 * MCB presses records. A pressing cannot be un-pressed, and a customer who
 * changes their creative mind after approving the master is asking for a
 * second record, not a correction of the first. MCB should not pay for that
 * twice.
 *
 * But the same lock must never be used to avoid fixing something MCB got
 * wrong. Those are two different questions and the whole architecture below
 * exists to keep them apart:
 *
 *   "I've changed my mind"          → after the lock, this is a new order.
 *   "You made it wrong"             → the lock is irrelevant. Always.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY "ONCE PRODUCTION STARTS" WAS NOT GOOD ENOUGH
 * ─────────────────────────────────────────────────────────────────────────
 * The previous terms said refunds end "once production has started". In a
 * business that writes, records, mixes, masters, presses, prints and packs,
 * "production" names at least six different moments, and the customer and MCB
 * would reasonably pick different ones. A term that vague is both unusable
 * operationally and a poor candidate for enforceability.
 *
 * So the lock has an explicit trigger, and it is an EVENT MCB CAN EVIDENCE:
 * the customer's approval, or the start of irreversible manufacture —
 * whichever the product actually requires.
 */

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/**
 * Where an order sits in the creative process.
 *
 * DELIBERATELY SEPARATE FROM `orders.status`. That column tracks the money:
 * PENDING, PAID, ABANDONED, REFUNDED. This tracks the work. They answer
 * different questions and they move independently — a PAID order can sit in
 * CREATIVE for two weeks, and an order can be PRODUCTION_LOCKED and later
 * REFUNDED if MCB got something wrong.
 *
 * The invariant this exists to serve: MCB must be able to answer "does this
 * customer still have revisions open?" without inferring it from whether they
 * paid. **PAID IS NOT PRODUCTION_LOCKED**, and treating it as such is how a
 * customer gets told their revisions are gone the moment their card cleared.
 */
export type ProductionStage =
  | "CREATIVE"
  | "AWAITING_APPROVAL"
  | "APPROVED"
  | "PRODUCTION_LOCKED"
  | "FULFILMENT"
  | "COMPLETED";

export interface StageDefinition {
  stage: ProductionStage;
  /** What is happening, for an operator. */
  internal: string;
  /** What the customer would be told, if asked. */
  customer: string;
  /** Whether the package's included refinements can still be used here. */
  revisionsOpen: boolean;
}

export const PRODUCTION_STAGES: readonly StageDefinition[] = [
  {
    stage: "CREATIVE",
    internal:
      "The work is being written, recorded and produced. Included refinements are used here.",
    customer:
      "We are creating your work. This is when your included refinements are used.",
    revisionsOpen: true,
  },
  {
    stage: "AWAITING_APPROVAL",
    internal:
      "The draft is with the customer. Still open — a customer looking at a draft has not spent their refinements by looking.",
    customer:
      "Your work is with you to review. Tell us what you would like adjusted.",
    revisionsOpen: true,
  },
  {
    stage: "APPROVED",
    internal:
      "The customer has approved the work for finalisation. Recorded in `order_production` with a timestamp and channel.",
    customer:
      "You have approved your work. We are preparing it for production.",
    // Closed on approval, not on manufacture. Approval is the customer's own
    // act and the point from which MCB commits materials and machine time.
    revisionsOpen: false,
  },
  {
    stage: "PRODUCTION_LOCKED",
    internal:
      "Irreversible manufacture has begun — pressing, printing, engraving, assembly.",
    customer:
      "Your order is in production. It can no longer be changed, but if anything is wrong with what arrives, that is ours to put right.",
    revisionsOpen: false,
  },
  {
    stage: "FULFILMENT",
    internal: "Made, and being packed or dispatched.",
    customer: "Your order is being prepared for dispatch.",
    revisionsOpen: false,
  },
  {
    stage: "COMPLETED",
    internal: "Delivered. Statutory rights continue to apply.",
    customer: "Delivered.",
    revisionsOpen: false,
  },
];

export const getStage = (
  stage: ProductionStage
): StageDefinition | undefined =>
  PRODUCTION_STAGES.find((definition) => definition.stage === stage);

/**
 * The one question the rest of the business asks this module.
 *
 * A function rather than a set literal so callers read the intent rather than
 * a list of enum values they would then have to keep in step.
 */
export const revisionsRemainOpen = (stage: ProductionStage): boolean =>
  getStage(stage)?.revisionsOpen ?? false;

/**
 * The stage a paid order starts in.
 *
 * CREATIVE, not APPROVED and not locked. Stated as a named constant because
 * the alternative — a default buried in a migration — is how "PAID means
 * locked" quietly becomes true again.
 */
export const INITIAL_STAGE: ProductionStage = "CREATIVE";

/* ------------------------------------------------------------------ */
/* How approval is captured                                            */
/* ------------------------------------------------------------------ */

/**
 * Where a customer's approval actually came from.
 *
 * MCB approves work over email and WhatsApp today. The website has no
 * post-creation approval screen, and inventing one that nobody uses would be
 * worse than recording the truth: an operator files the approval that
 * genuinely happened, with the channel it happened on.
 *
 * `WEBSITE` exists so that when an approval screen is built, the record shape
 * does not have to change and old rows stay meaningful.
 */
export type ApprovalChannel =
  | "WEBSITE"
  | "EMAIL"
  | "WHATSAPP"
  | "PHONE"
  | "IN_PERSON";

export const APPROVAL_CHANNELS: readonly ApprovalChannel[] = [
  "WEBSITE",
  "EMAIL",
  "WHATSAPP",
  "PHONE",
  "IN_PERSON",
];

/**
 * CHECKOUT ACCEPTANCE IS NOT CREATIVE APPROVAL.
 *
 * They are separate acts, minutes or weeks apart, about different things:
 *
 *   at checkout    the customer accepts the terms of purchase, for a song
 *                  that does not exist yet;
 *   later          the customer approves the finished work for manufacture.
 *
 * Nothing may treat the first as the second. A customer cannot approve a
 * record they have not heard, and a system that pretended otherwise would be
 * evidencing an approval that never happened — which is worse than having no
 * record at all, because it looks like one.
 */
export const APPROVAL_IS_NOT_CHECKOUT =
  "Agreeing to our terms at checkout is not the same as approving your finished work. You approve the work later, once you have heard it.";

/* ------------------------------------------------------------------ */
/* Refinements                                                         */
/* ------------------------------------------------------------------ */

/**
 * What a refinement is — one definition, used everywhere.
 *
 * Written to be generous enough that the promised refinements mean something.
 * A definition narrow enough to refuse every request would make "2 refinement
 * revisions" a decorative feature bullet, which is both unfair and a poor
 * commercial signal.
 */
export const REFINEMENT_DEFINITION =
  "A refinement is a reasonable adjustment to the work we have already made for you — the wording of a line, the feel of a section, the mix, the pace, a detail in the artwork.";

/**
 * What it is not.
 *
 * Each of these is a different commission rather than a smaller version of
 * the same one: a new recipient means a new story, and a new story means the
 * work starts again. Saying so plainly is fairer than discovering it in a
 * disagreement.
 */
export const REFINEMENT_EXCLUSIONS: readonly string[] = [
  "an entirely new composition",
  "a different recipient",
  "a different occasion",
  "a rewrite from a new brief",
  "an open-ended series of alternative concepts",
];

export const SCOPE_CHANGE_TREATMENT =
  "If what you would like is genuinely a different piece of work rather than an adjustment to this one, we will say so, and we will quote for it as a new order rather than quietly absorbing it or quietly refusing it.";
