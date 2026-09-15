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
 * locks, what happens if something arrives damaged, and that a Bespoke commission
 * enquiry is not a purchase. Each still names the clause it comes from.
 */

import { DAMAGE_GUIDANCE, DAMAGE_GUIDANCE_NOT_A_CONDITION, FULFILMENT_POSITION, SEPARATE_PARCELS_NOTE } from "./delivery";
import { PREFERENCE_VS_PROBLEM } from "./production";

/*
 * LAUNCH CLOSURE EDITION 2026-09-15: the damage section follows the Terms'
 * corrected clauses 8 and 17 (no 24-hour condition, no "matter for the
 * courier"), cancelling points to the clause 7 carve-out, and the
 * Founder-approved delivery wording is added. No new remedy is promised.
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
  "Everything we make is made for one person, and personalised production begins as soon as your payment is confirmed. Our Terms set out what that means for cancelling — please read clauses 4 to 7 before you buy.";

export const REFUND_SECTIONS: readonly RefundSection[] = [
  {
    heading: "Cancelling",
    question: "Can I cancel after paying?",
    body: [
      "Personalised production begins when your payment is confirmed, so there is no cancellation of the product service after payment and a no refund policy for a change of mind. Once personalised production begins, cancellation and refund rights may be limited as permitted by applicable law. This is set out in clause 7 of our Terms.",
      "That does not affect your rights if something is genuinely wrong with what we supplied — see below.",
      "Because of that, please check your details, story and photographs, and the timing, before you pay. If you are unsure about anything, ask us first.",
    ],
    clause: "cancellation",
  },
  {
    heading: "If you would have chosen differently",
    question: "It isn't quite how I imagined it.",
    body: [PREFERENCE_VS_PROBLEM.preference, PREFERENCE_VS_PROBLEM.specification],
    clause: "preference-and-problems",
  },
  {
    heading: "If we got something wrong",
    question: "You used the wrong name / the wrong photograph.",
    body: [
      PREFERENCE_VS_PROBLEM.problem,
      "Tell us from your private order page or by email as soon as you can, and we'll look into it straight away.",
      PREFERENCE_VS_PROBLEM.statutory,
    ],
    clause: "preference-and-problems",
  },
  {
    heading: "If it arrives damaged",
    question: "The frame is cracked / the record is chipped.",
    body: [
      "Stop using it — a cracked frame is something to put down rather than handle carefully — and send us a photograph.",
      DAMAGE_GUIDANCE,
      "Tell us as soon as you reasonably can. We will then repair, replace, remake or refund as appropriate. Our production partners and carriers have their own time limits for claims; those are ours to manage for you, not a deadline on your rights.",
      DAMAGE_GUIDANCE_NOT_A_CONDITION,
    ],
    clause: "damaged-products",
  },
  {
    heading: "Delivery and separate parcels",
    question: "Who do I contact if something goes wrong with delivery?",
    body: [...FULFILMENT_POSITION, SEPARATE_PARCELS_NOTE],
    clause: "if-we-get-it-wrong",
  },
  {
    heading: "Bespoke",
    question: "What about a concierge commission?",
    body: [
      "A Bespoke enquiry is not a purchase, so there is nothing to cancel and nothing has been charged.",
      "Scope, deliverables and price are agreed with you before payment. Once your commission enters personalised production, the creative decisions are entrusted to MCB, as with every MCB order.",
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
