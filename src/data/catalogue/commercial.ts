/**
 * COMMERCIAL TERMS — the structure, and an honest record of what is missing.
 *
 * A product page can only sell what the business has approved. MCB has
 * approved five package prices and, now, a GBP price for most of the physical
 * catalogue — but still no shipping rate, and no return, exchange or damage
 * policy. Those are commercial decisions, and inventing any of them would put
 * a claim on the site that nobody has agreed to honour.
 *
 * A PRICE IS NOT A POLICY. Pricing a frame at £200 says what it costs; it
 * says nothing about what happens when it arrives broken. The terms below
 * stayed PENDING through that pricing round, deliberately, because approving
 * one did not approve the other.
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
    id: "remaining-keepsake-pricing",
    question:
      "What do the personalised vinyl record and the CD cost on their own? Every other family is now priced; these two are not.",
    blocks:
      "Totalling a basket that contains them, and publishing an Offer for the vinyl and CD families. Note the £60 Additional Vinyl Copy is the price of a DUPLICATE pressing, not of the record itself — see catalogue/enhancements.ts.",
  },
  /**
   * RESOLVED, and kept as the record of what was decided.
   *
   * The business confirmed the Luxury Memory Box and the £600 Music Box
   * Experience are DIFFERENT products. The Memory Box was retired from the
   * catalogue rather than repriced, and the Music Box Experience created as a
   * separate family and product. Left here because the next person to read
   * `git log` for "why is there no memory box" deserves the answer in the
   * data, not only in a commit message.
   */
  {
    id: "music-box-composition",
    question:
      "Is a standard composition ever published for the MCB Music Box Experience, or is it always confirmed with the customer? If it is ever fixed, what does it contain, and does that change the £600?",
    blocks:
      "Stating what the experience contains anywhere on the site, and offering it as a configurable basket line rather than a curated conversation. The £600 price IS approved and published; only the composition is open. Nothing in the catalogue asserts contents, dimensions, materials, mechanism, colours, origin, shipping or third-party gifts, and nothing should until this is answered.",
  },
  {
    id: "portable-suitcase-artwork",
    question:
      "When can /images/brand/portable-recordplayer.png be re-rendered with the approved product name printed in it?",
    blocks:
      "Nothing commercially — the product name, price and page are correct and live. But the artwork still reads 'Portable Gramophones' inside the image while the heading beside it reads 'Portable Record Player Suitcase', so the two visibly disagree. Known stale visual asset; the name is authoritative and must NOT be reverted to match the picture.",
  },
  {
    id: "checkout-tax-treatment",
    question:
      "Should Stripe apply automatic tax to MCB's checkout, and on what basis? If so, is the advertised price tax-inclusive or does tax get added at the till?",
    blocks:
      "Enabling Stripe automatic tax on dynamic Checkout Sessions. It is deliberately OFF today: turning it on would change what a customer pays relative to the advertised GBP price, which is a commercial and legal decision rather than a technical one, and it needs a Stripe Tax registration and origin address nobody has supplied. Leaving it off also keeps amount_total exactly equal to the server's expected basket, which is what lets the webhook reconcile strictly — enabling tax later means revisiting that comparison so a legitimate tax component is not read as a mismatch.",
  },
  {
    id: "checkout-shipping-double-entry",
    question:
      "When dynamic checkout is switched on, should Stripe collect a delivery address as well as MCB's own form, or should MCB's validated address be the only one the customer types?",
    blocks:
      "Nothing today — the path is dormant. But the customer would currently enter their address twice: once in MCB's form, where it is validated and stored as the authoritative fulfilment record, and again in Stripe, where it exists for payment-dispute evidence. That is a real friction cost at the last step of a purchase and should be a deliberate choice before activation, not a default nobody looked at.",
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
