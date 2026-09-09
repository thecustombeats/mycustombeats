/**
 * ENHANCEMENTS — extra copies and additions bought ALONGSIDE an order.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT A PRODUCT FAMILY
 * ─────────────────────────────────────────────────────────────────────────
 * An enhancement is not a thing MCB sells on its own. It is a thing MCB sells
 * *in addition to* an order that already exists. "Additional Vinyl Copy, £60"
 * only means anything in the presence of a first record: it is a second
 * pressing of the customer's own song, not a record anyone can buy.
 *
 * That distinction is the entire reason this file exists rather than the £60
 * simply being written onto `VINYL_12`.
 *
 * The vinyl a Keepsake, Journey or Heirloom customer receives is INCLUDED in
 * the package price they already paid — it is not a £60 line item. Had the
 * £60 been attached to the vinyl product, every surface that reads a product
 * price would have started announcing that MCB's personalised vinyl costs
 * £60: the products page, the JSON-LD Offer, the memory summary, and any
 * future basket. That is a materially false commercial claim about the
 * headline product, and it would have been introduced by a one-line edit that
 * looked entirely reasonable.
 *
 * So enhancements are deliberately kept OUT of `CATALOGUE` and out of
 * `ALL_PRODUCTS`. Nothing that walks the product catalogue can reach them,
 * and `getProduct("additional-vinyl-copy")` returns undefined by design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────
 * It does not check out. There is no quantity control, no basket line and no
 * Stripe path here, because MCB charges through fixed Payment Links and a
 * Payment Link cannot take a variable total (see `lib/memory.ts`). The shape
 * below anticipates quantity — unit price, a maximum, eligible packages — so
 * that Complete Your Memory is a consumer of this data rather than a rewrite
 * of it. Selling it needs payment infrastructure that does not exist yet.
 */

import { PACKAGES, type AnyPackage, type PackageId } from "../packages";
import { gbp, type Availability, type Fulfilment, type ProductPrice } from "./types";

/**
 * Something bought in addition to an order.
 *
 * `unitPrice` is per unit, always. There is no "price for two" field: a
 * quantity price that is not a multiple of the unit price is a discount, and
 * no discount has been approved.
 */
export interface CatalogueEnhancement {
  id: string;
  /** Stable commercial identifier, for Stripe and for fulfilment. */
  sku: string;
  name: string;
  /** How the enhancement is offered to the customer, in one sentence. */
  description: string;
  /** What one of them costs. */
  unitPrice: ProductPrice;
  /** Names the thing being counted, e.g. "copy". */
  unitLabel: string;
  /**
   * Most that can be added to one order.
   *
   * A ceiling the business has approved, not a technical limit. Beyond it the
   * customer is talking about a print run, which is a conversation rather
   * than a checkbox.
   */
  maxQuantity: number;
  /**
   * The catalogue product this is an additional copy OF.
   *
   * Kept as an id rather than a price: the enhancement carries its own
   * approved price and must never inherit one from the product, nor lend
   * its own price back to it.
   */
  duplicatesProductId: string;
  availability: Availability;
  fulfilment: Fulfilment;
  /**
   * Packages an order must be for before this can be added.
   *
   * DERIVED, never hand-listed — see `packagesOfferingVinyl`. A hand-written
   * list is a second source of truth about which experiences include a
   * record, and it would silently stop matching the moment a package changed
   * its formats.
   */
  eligiblePackages: readonly PackageId[];
}

/**
 * Packages that actually ship a record.
 *
 * Read off the package format rules, so a package that gains or loses vinyl
 * gains or loses the ability to order another copy with no edit here.
 */
const packagesOfferingVinyl = (
  packages: readonly AnyPackage[]
): readonly PackageId[] =>
  packages
    .filter((pkg) => pkg.formats.includes("vinyl"))
    .map((pkg) => pkg.id);

/**
 * ADDITIONAL VINYL COPY — £60.
 *
 * "Send a copy to friends and family." A second, third or fourth pressing of
 * the record the customer has already commissioned, produced in the same run
 * from the same master and artwork.
 *
 * NOT the price of MCB's vinyl. See the header of this file.
 */
export const ADDITIONAL_VINYL_COPY: CatalogueEnhancement = {
  id: "additional-vinyl-copy",
  sku: "MCB-ENH-VINYL-COPY",
  name: "Additional Vinyl Copy",
  description:
    "Another pressing of your record, from the same master and artwork — send a copy to friends and family.",
  unitPrice: gbp(60),
  unitLabel: "copy",
  // Four extra copies is a family; more than that is a print run, which is a
  // conversation rather than a quantity field.
  maxQuantity: 4,
  duplicatesProductId: "vinyl-12",
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  eligiblePackages: packagesOfferingVinyl(PACKAGES),
};

/** Every enhancement, in display order. */
export const ENHANCEMENTS: readonly CatalogueEnhancement[] = [
  ADDITIONAL_VINYL_COPY,
];

export const getEnhancement = (
  id: string
): CatalogueEnhancement | undefined =>
  ENHANCEMENTS.find((enhancement) => enhancement.id === id);

/** Enhancements offerable against a given package. */
export const enhancementsForPackage = (
  packageId: string
): readonly CatalogueEnhancement[] =>
  ENHANCEMENTS.filter((enhancement) =>
    (enhancement.eligiblePackages as readonly string[]).includes(packageId)
  );

/**
 * What `quantity` of an enhancement costs, or `null` when it has no approved
 * price or the quantity is outside what has been approved.
 *
 * Returns `null` rather than 0 for an invalid quantity: 0 is a legitimate
 * total that a caller could render, and "not a thing we sell" is not £0.
 */
export const enhancementLineTotal = (
  enhancement: CatalogueEnhancement,
  quantity: number
): number | null => {
  if (!Number.isInteger(quantity)) return null;
  if (quantity < 1 || quantity > enhancement.maxQuantity) return null;
  if (enhancement.unitPrice.status !== "FIXED_GBP") return null;
  return enhancement.unitPrice.gbp * quantity;
};
