/**
 * COMMERCIAL TERMS — the structure, and an honest record of what is missing.
 *
 * A product page can only sell what the business has approved. MCB has
 * approved five package prices and nothing else: no physical product price,
 * no shipping rate, no return, exchange or damage policy. Those are commercial
 * decisions, and inventing any of them would put a claim on the site that
 * nobody has agreed to honour.
 *
 * So this file does two things and refuses to do a third:
 *
 *   1. It defines the shape those terms will take, so the moment one is
 *      approved it is a data edit and nothing else changes.
 *   2. It records exactly which decisions are outstanding, in `PENDING_DECISIONS`,
 *      so the gap is visible rather than discovered at checkout.
 *   3. It does NOT contain a single invented figure, rate or policy.
 *
 * Every term is `PENDING` until someone approves it. `isApproved` is the only
 * way to read a value, so a component cannot accidentally render a term that
 * does not exist — there is no value on a pending term to render.
 */

import type { ProductFamilyId } from "./types";

/* ------------------------------------------------------------------ */
/* The approval gate                                                   */
/* ------------------------------------------------------------------ */

/**
 * A commercial term is either APPROVED with a statement the business stands
 * behind, or PENDING with nothing at all. Deliberately mirrors `ProductPrice`:
 * a PENDING term carries no text, so there is nothing to render by mistake.
 */
export type CommercialTerm =
  | { status: "APPROVED"; statement: string }
  | { status: "PENDING" };

export const PENDING: CommercialTerm = { status: "PENDING" };

export const isApproved = (
  term: CommercialTerm
): term is Extract<CommercialTerm, { status: "APPROVED" }> =>
  term.status === "APPROVED";

/** The approved statement, or `null`. Callers must handle `null` themselves. */
export const termStatement = (term: CommercialTerm): string | null =>
  isApproved(term) ? term.statement : null;

/* ------------------------------------------------------------------ */
/* Terms                                                               */
/* ------------------------------------------------------------------ */

export interface CommercialTerms {
  /** How the item ships, and what that costs. */
  shipping: CommercialTerm;
  /** What the customer is told about timing beyond the production lead time. */
  delivery: CommercialTerm;
  /** Whether and how a made-to-order item can be returned. */
  returns: CommercialTerm;
  /** Whether an item can be exchanged. */
  exchange: CommercialTerm;
  /** What happens if a physical item arrives damaged. */
  damage: CommercialTerm;
}

/** Nothing approved. The honest default for every physical product today. */
export const NO_APPROVED_TERMS: CommercialTerms = {
  shipping: PENDING,
  delivery: PENDING,
  returns: PENDING,
  exchange: PENDING,
  damage: PENDING,
};

/**
 * Terms per family.
 *
 * Every family currently resolves to `NO_APPROVED_TERMS`. The map exists so a
 * family can be given its own terms the moment they are approved, without a
 * component or a type changing.
 */
export const FAMILY_TERMS: Readonly<
  Partial<Record<ProductFamilyId, CommercialTerms>>
> = {};

export const termsFor = (familyId: ProductFamilyId): CommercialTerms =>
  FAMILY_TERMS[familyId] ?? NO_APPROVED_TERMS;

/** True when a family has at least one approved commercial term. */
export const hasApprovedTerms = (familyId: ProductFamilyId): boolean =>
  Object.values(termsFor(familyId)).some(isApproved);

/* ------------------------------------------------------------------ */
/* What the business still has to decide                               */
/* ------------------------------------------------------------------ */

export interface PendingDecision {
  id: string;
  /** What is missing, in the business's terms. */
  question: string;
  /** What cannot happen until it is answered. */
  blocks: string;
}

/**
 * The commercial decisions standing between the catalogue and selling from it.
 *
 * This is not a wish list. Each entry blocks something concrete, and the first
 * three block a configurable basket entirely: a checkout cannot total a
 * package plus a keepsake when no keepsake has a price.
 */
export const PENDING_DECISIONS: readonly PendingDecision[] = [
  {
    id: "keepsake-pricing",
    question:
      "What does each physical product cost? Vinyl by size, CD, lyrics frames, plaques, memory boxes, and each of the ten Gift Pop-Up Card occasions.",
    blocks:
      "Selling any keepsake. A basket cannot be totalled and no Offer can be published.",
  },
  {
    id: "shipping-rates",
    question:
      "What is charged for delivery, and to which territories? A single rate, per-item, or by destination?",
    blocks:
      "Charging accurately for anything physical, and stating a shipping cost before payment.",
  },
  {
    id: "returns-policy",
    question:
      "Can a made-to-order personalised item be returned, and under what conditions?",
    blocks:
      "Publishing a return policy, and merchant eligibility on search surfaces.",
  },
  {
    id: "exchange-policy",
    question: "Can a keepsake be exchanged for a different format or product?",
    blocks: "Telling a customer what happens if they change their mind.",
  },
  {
    id: "damage-policy",
    question:
      "What happens when a vinyl record, frame or box arrives damaged — replacement, refund, or reprint?",
    blocks:
      "Answering the most common pre-purchase question about a fragile physical product.",
  },
  {
    id: "package-keepsake-combinations",
    question:
      "Which package and keepsake combinations are commercially valid, and does a keepsake price change when bought alongside a package?",
    blocks:
      "Offering keepsakes as enhancements during checkout rather than as a separate enquiry.",
  },
];
