/**
 * REFUNDS & CANCELLATIONS — the plain-language half.
 *
 * The Terms are the contract. This is the same rules said the way a customer
 * would ask about them, with the clause each answer comes from. Two documents,
 * one set of rules; if they ever disagree, the disagreement is visible because
 * every section names its clause.
 *
 * The old page said "No refunds once songwriting or production has started"
 * and "Issues must be reported within 48 hours". The first was a blanket
 * statement with no carve-out for MCB's own mistakes. The second read as a
 * two-day expiry on rights that do not expire in two days. Neither survives.
 */

/**
 * REFUNDS & CANCELLATIONS — reduced to match the Founder's Terms.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT WAS REMOVED, AND WHY
 * ─────────────────────────────────────────────────────────────────────────
 * This page previously explained cancelling before work started, cancelling
 * after it started, digital-content cancellation, the personalised-goods
 * exception, how refunds are paid, late delivery, and mandatory overseas
 * consumer rights.
 *
 * The Founder's Terms (version 2026-09-09.4) say there is no cancellation
 * after payment and no refund policy. Every one of those sections therefore
 * described rights the Terms no longer offer, and a page promising a refund
 * route beside a contract denying one is worse than either on its own — the
 * customer cannot tell which is true.
 *
 * So they are REMOVED rather than rewritten. Per the amendment: where a page
 * contradicts the Founder's Terms, take the contradiction out; do not invent
 * replacement legal wording to paper over the gap.
 *
 * What remains is only what the Founder's own clauses say: when an order
 * locks, what happens if something arrives damaged, and that a Full Package
 * enquiry is not a purchase. Each still names the clause it comes from.
 */

export interface RefundSection {
  heading: string;
  /** The question a customer would actually ask. */
  question: string;
  body: readonly string[];
  points?: readonly string[];
  /** The Terms clause this restates, for cross-checking. */
  clause: string;
}

export const REFUNDS_INTRO =
  "Everything we make is made for one person, and we start as soon as you order. Our Terms set out what that means for changing or cancelling an order — please read clause 7 before you buy.";

export const REFUND_SECTIONS: readonly RefundSection[] = [
  {
    heading: "Cancelling",
    question: "Can I cancel after paying?",
    body: [
      "No. There is no cancellation of the product service after payment, and there is a no refund policy. This is set out in clause 7 of our Terms.",
      "Because of that, please make sure you are happy with what you are ordering — and with the timing — before you pay. If you are unsure about anything, ask us first.",
    ],
    clause: "cancellation",
  },
  {
    heading: "After you have approved your work",
    question: "I approved it, and now I want it different.",
    body: [
      "Once you have approved your work and we have begun manufacturing, your included refinements are closed and the order is locked.",
      "After that point, a change to the creative work is a new piece of work.",
    ],
    clause: "production-lock",
  },
  {
    heading: "If it arrives damaged",
    question: "The frame is cracked / the record is chipped.",
    body: [
      "Stop using it — a cracked frame is something to put down rather than handle carefully — and send us a photograph.",
      "Tell us as soon as you reasonably can. We will then repair, replace, remake or refund as appropriate at a reasonable discount price if done within 24 hours of the delivery date, and you will need to keep a copy of the delivery date with your claim.",
      "Damage caused in transit is a matter for the courier: clause 8 of our Terms explains that we do not take responsibility for courier damage, and what we can do to help.",
    ],
    clause: "damaged-products",
  },
  {
    heading: "The Full Package",
    question: "What about a concierge commission?",
    body: [
      "A Full Package enquiry is not a purchase, so there is nothing to cancel and nothing has been charged.",
      "Once a proposal is agreed, that commission's own written terms are what apply.",
    ],
    clause: "cancellation",
  },
];

/**
 * The prominent statutory-rights notice that used to head this page has been
 * REMOVED, not relocated.
 *
 * It read: "Nothing on this page affects your legal rights if what we supply
 * is faulty, not as described, or does not match what you ordered." The
 * Founder's Terms no longer make that undertaking, so leaving it here would
 * have the page promise something the contract does not — which is the exact
 * contradiction this amendment exists to remove.
 *
 * Its absence is recorded in `review.ts` rather than quietly filled in.
 */
export const STATUTORY_RIGHTS_NOTICE = "";
