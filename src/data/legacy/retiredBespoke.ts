/**
 * RETIRED COMMERCIAL DATA — the Bespoke tier, as it was sold until 2026-09.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────
 * "Bespoke — From £799" was replaced by the Full Package, a concierge
 * commission scoped in a consultation and priced in a written proposal. The
 * figure and the Payment Link behind it did not stop existing when that
 * happened:
 *
 *   • orders were placed against them, and `orders.amount_gbp` /
 *     `amount_usd` still hold those amounts;
 *   • the CRM reads those rows back;
 *   • the Payment Link is a LIVE object in a Stripe account this repository
 *     must not modify — a customer holding an old link or an old email still
 *     resolves it.
 *
 * Deleting them would break real integrations in order to remove a number the
 * customer journey no longer reaches anyway. So they are kept, exactly as they
 * were, and recorded here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT IS ITS OWN MODULE, AND NOT A FIELD ON THE PACKAGE
 * ─────────────────────────────────────────────────────────────────────────
 * It began as a `legacy` field on `FULL_PACKAGE`. That read well — the retired
 * data sitting beside the thing it was retired from — and it was wrong for one
 * concrete reason: `packages.ts` is imported by the browser bundle, so `799`
 * and the retired Payment Link shipped to every visitor. Nothing in the
 * browser needs either, and a figure that is present in the shipped JavaScript
 * is one edit away from being rendered.
 *
 * NOTHING IN `src/` IMPORTS THIS FILE. That is the point, and it is what
 * "unreachable" means here: not merely absent from the journey, but absent
 * from the code the customer's browser downloads. It is documentation and a
 * historical record, addressed to whoever needs to know what an old order row
 * or an old Stripe link refers to.
 *
 * If you find yourself importing it into a component, the answer is almost
 * certainly no.
 */

/* ------------------------------------------------------------------ */

export interface RetiredCommercialRecord {
  /** The package id these figures belonged to, and still belong to in `orders`. */
  packageId: "bespoke";
  /** What it was called when it was sold at this price. */
  formerName: string;
  /** When it stopped being sold this way. */
  retired: string;
  /** Why, in one line, for whoever finds this next. */
  reason: string;
  /**
   * The last published figures. A RECORD, NOT A PRICE.
   *
   * Never rendered, never converted and never compared against anything the
   * customer sees. The Full Package has no published price; this is what a
   * different product used to cost.
   */
  price: { gbp: number; usd: number; prefix: string };
  /**
   * The Stripe Payment Link that used to sell it.
   *
   * BYTE-IDENTICAL to what was live, deliberately. It is not this
   * repository's to change, and an old link that still works is better for a
   * customer holding one than a dead URL. It is simply no longer reachable
   * from this site: `getCheckoutTarget` refuses a concierge package before it
   * looks at any checkout data, and nothing here is wired into that path.
   */
  paymentLink: {
    url: string;
    requiresShipping: boolean;
    stripeProductName: string;
  };
}

export const RETIRED_BESPOKE: RetiredCommercialRecord = {
  packageId: "bespoke",
  formerName: "Bespoke",
  retired: "2026-09",
  reason:
    "Replaced by the Full Package, a private concierge commission curated per recipient. A single published figure could not describe it honestly, and a 'from' price anchored an unbounded curation to the cheapest music-only commission.",
  price: { gbp: 799, usd: 999, prefix: "From" },
  paymentLink: {
    url: "https://buy.stripe.com/5kQ8wO9vKcLR3KO3eabsc09",
    requiresShipping: false,
    stripeProductName: "MCB Bespoke",
  },
};
