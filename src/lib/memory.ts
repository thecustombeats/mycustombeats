/**
 * YOUR MEMORY — the cart foundation.
 *
 * A "memory" is one purchase: a core experience, the format it arrives in,
 * and any physical enhancements chosen alongside it.
 *
 *   Core package + selected format + selected enhancements = YOUR MEMORY
 *
 * This module is pure. It takes a selection, resolves it against the package
 * and catalogue data, and returns the lines, totals and checkout destination
 * to render. It holds no state, touches no storage and initiates no payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A CONSTRAINT YOU MUST UNDERSTAND BEFORE EXTENDING THIS
 * ─────────────────────────────────────────────────────────────────────────
 * MCB checks out through Stripe PAYMENT LINKS. A Payment Link is a fixed
 * basket at a fixed price, created by hand in the Stripe Dashboard — one per
 * package/format pair (see `checkout` in data/packages.ts). It cannot be
 * given a variable total at click time.
 *
 * So a memory whose total varies with what the customer added CANNOT be
 * charged through the existing infrastructure. Charging a configured basket
 * needs a server-created Stripe Checkout Session (or a line-item-capable
 * equivalent), which is payment infrastructure and explicitly out of scope
 * for this sprint.
 *
 * Rather than pretend otherwise, the model splits every memory in two:
 *
 *   `chargeableTotal` — the approved package price, and the only figure the
 *                       existing Payment Link will actually take.
 *   `quotedLines`     — enhancements with no approved price, presented as
 *                       quoted separately and deliberately EXCLUDED from the
 *                       total. They are never silently folded into a number
 *                       Stripe is not going to charge.
 *
 * The consequence, stated plainly: enhancements can be selected, described
 * and summarised today, but cannot be paid for online until payment
 * infrastructure changes. `checkoutBlockers` reports exactly that, so the UI
 * refuses the sale rather than sending someone to a Payment Link that charges
 * the wrong amount.
 */

import {
  FORMATS,
  formatPrice,
  getCheckoutTarget,
  getPackage,
  isConcierge,
  isFormatAllowed,
  type AnyPackage,
  type CheckoutTarget,
  type FormatId,
} from "../data/packages";
import {
  getProduct,
  gbp,
  isPriced,
  TBD,
  type CatalogueProduct,
  type ProductPrice,
} from "../data/catalogue";
import { pressingOptionsForPackage, type PressingOption } from "../data/catalogue/vinyl";

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

export interface MemorySelection {
  packageId: string | null;
  formatId: string | null;
  /** Catalogue product ids chosen as enhancements. */
  enhancementIds?: readonly string[];
  /** Chosen pressing, where the format is vinyl. */
  pressingOptionId?: string | null;
}

export type MemoryLineKind = "PACKAGE" | "FORMAT" | "ENHANCEMENT";

export interface MemoryLine {
  id: string;
  kind: MemoryLineKind;
  label: string;
  /** Secondary line, e.g. delivery promise or record configuration. */
  detail?: string;
  price: ProductPrice;
  /**
   * Qualifier rendered before the amount, e.g. "From" for an open-ended
   * commission.
   *
   * It lives on the LINE, not on `ProductPrice`. A price is an approved
   * number; "from £799" is a statement about how that number is being
   * presented. Keeping it out of `ProductPrice` is what stops the catalogue
   * growing an optional field every product would have to consider.
   */
  pricePrefix?: string;
  /** True when the line is included at no extra cost rather than free. */
  includedInPackage: boolean;
}

/**
 * Why a memory cannot be checked out. Empty means it can.
 *
 * These are surfaced to the customer, so each one is a reason a person can
 * act on, not an error code.
 */
export type CheckoutBlocker =
  | { code: "NO_PACKAGE"; message: string }
  | { code: "NO_FORMAT"; message: string }
  | { code: "NO_PAYMENT_LINK"; message: string }
  /**
   * Not a fault, and not a missing configuration — a different commercial
   * model. Distinct from NO_PAYMENT_LINK because that one means "we intend to
   * sell this online and haven't finished wiring it up", which is a bug worth
   * chasing; this one means "this is never sold online", which is the design.
   * Conflating them would have put a concierge commission on a list of things
   * to fix in Stripe.
   */
  | { code: "CONCIERGE_ONLY"; message: string }
  | { code: "UNPRICED_ENHANCEMENTS"; message: string };

export interface MemorySummary {
  pkg: AnyPackage | undefined;
  format: FormatId | null;
  lines: readonly MemoryLine[];
  /** Enhancement lines with no approved price. Excluded from the total. */
  quotedLines: readonly MemoryLine[];
  /**
   * Sum of every approved price in the memory, in GBP.
   *
   * GBP only, because the catalogue is GBP only — see `ProductPrice`. A
   * second currency here would have to be either a stale hard-coded figure or
   * a conversion this module is in no position to make.
   */
  subtotal: number;
  /**
   * What the customer pays online today.
   *
   * Carries both approved package figures, because a PACKAGE has both and
   * they are business-approved rather than converted. This is the one place
   * the two-currency shape survives, and it is why `Money` lives here now
   * rather than in the catalogue.
   */
  chargeableTotal: Money;
  /** Where this memory checks out, if anywhere. */
  checkout: CheckoutTarget | undefined;
  blockers: readonly CheckoutBlocker[];
  /** Vinyl pressings valid for this package, where vinyl is selected. */
  pressingOptions: readonly PressingOption[];
  pressing: PressingOption | undefined;
  requiresShipping: boolean;
}

/**
 * A PACKAGE amount, in both approved currencies.
 *
 * Defined here rather than in the catalogue because it is now a
 * package-only shape. `data/packages.ts` carries a business-approved GBP and
 * USD figure for each experience; the physical catalogue carries GBP alone
 * (see `ProductPrice`), so nothing outside packages has a second currency to
 * describe.
 */
export interface Money {
  gbp: number;
  usd: number;
}

const ZERO_MONEY: Money = { gbp: 0, usd: 0 };

/** The approved GBP amount, or 0 where none is approved. */
const priceAsGbp = (price: ProductPrice): number =>
  isPriced(price) ? price.gbp : 0;

/** "£259" — a bare GBP total, matching catalogue price formatting. */
export const formatGbp = (amount: number): string =>
  `£${amount.toLocaleString("en-GB")}`;

/* ------------------------------------------------------------------ */
/* Build                                                               */
/* ------------------------------------------------------------------ */

const enhancementLine = (product: CatalogueProduct): MemoryLine => ({
  id: product.id,
  kind: "ENHANCEMENT",
  label: product.name,
  detail: product.leadTime?.label,
  price: product.price,
  includedInPackage: false,
});

/**
 * Resolves a selection into everything needed to render YOUR MEMORY.
 *
 * Always returns a summary, even for an empty or invalid selection — the
 * blockers explain what is missing rather than the function returning
 * `undefined` and pushing that decision to every caller.
 */
export const buildMemory = (selection: MemorySelection): MemorySummary => {
  const pkg = selection.packageId ? getPackage(selection.packageId) : undefined;

  const format =
    pkg && selection.formatId && isFormatAllowed(pkg, selection.formatId)
      ? (selection.formatId as FormatId)
      : null;

  const enhancements = (selection.enhancementIds ?? []).flatMap((id) => {
    const product = getProduct(id);
    return product ? [product] : [];
  });

  const pressingOptions =
    pkg && format === "vinyl" ? pressingOptionsForPackage(pkg) : [];

  const pressing =
    pressingOptions.find(
      (option) => option.id === selection.pressingOptionId
    ) ??
    pressingOptions.find((option) => option.recommended) ??
    pressingOptions[0];

  const lines: MemoryLine[] = [];

  if (pkg) {
    lines.push({
      id: `package-${pkg.id}`,
      kind: "PACKAGE",
      label: pkg.name,
      detail: pkg.delivery,
      /**
       * A concierge commission is priced in a proposal, so there is no figure
       * to put on this line. `TBD` is the summary's existing vocabulary for
       * "this is quoted individually" — it is what the made-to-order products
       * already use — so the line renders honestly rather than as £0 or as a
       * price borrowed from the retired Bespoke tier.
       */
      price: pkg.price ? gbp(pkg.price.gbp) : TBD,
      ...(pkg.price?.prefix ? { pricePrefix: pkg.price.prefix } : {}),
      includedInPackage: false,
    });

    if (format) {
      lines.push({
        id: `format-${format}`,
        kind: "FORMAT",
        label: FORMATS[format].name,
        // Pressing detail only where vinyl actually resolved to one.
        detail: format === "vinyl" ? pressing?.label : undefined,
        // Format never changes the price — it selects a fulfilment route.
        price: gbp(0),
        includedInPackage: true,
      });
    }
  }

  for (const product of enhancements) lines.push(enhancementLine(product));

  const quotedLines = lines.filter((line) => !isPriced(line.price));

  const subtotal = lines
    .filter((line) => !line.includedInPackage)
    .reduce((total, line) => total + priceAsGbp(line.price), 0);

  const checkout = pkg ? getCheckoutTarget(pkg, format) : undefined;

  // Only the package price can be charged by a fixed Payment Link, so that is
  // what the total claims — never the subtotal of a basket Stripe will not see.
  const chargeableTotal: Money = pkg?.price
    ? { gbp: pkg.price.gbp, usd: pkg.price.usd }
    : ZERO_MONEY;

  const blockers: CheckoutBlocker[] = [];

  if (!pkg) {
    blockers.push({
      code: "NO_PACKAGE",
      message: "Choose an experience to begin your memory.",
    });
  } else if (isConcierge(pkg)) {
    /**
     * Checked BEFORE format and payment link, because for a concierge
     * commission neither question is meaningful: it has no formats to choose
     * and no link to be missing. Asking them first would produce "choose how
     * your memory should arrive" for something whose delivery is agreed in a
     * consultation.
     */
    blockers.push({
      code: "CONCIERGE_ONLY",
      message: `${pkg.name} is arranged personally with you, not bought online.`,
    });
  } else if (pkg.formats.length > 1 && !format) {
    blockers.push({
      code: "NO_FORMAT",
      message: "Choose how you would like your memory to arrive.",
    });
  } else if (!checkout?.url) {
    blockers.push({
      code: "NO_PAYMENT_LINK",
      message: `${pkg.name}${
        format ? ` on ${FORMATS[format].name}` : ""
      } can't be checked out online just yet.`,
    });
  }

  if (quotedLines.length > 0) {
    blockers.push({
      code: "UNPRICED_ENHANCEMENTS",
      message:
        "Some pieces in this memory are made to order and quoted individually. We'll confirm those with you directly.",
    });
  }

  return {
    pkg,
    format,
    lines,
    quotedLines,
    subtotal,
    chargeableTotal,
    checkout,
    blockers,
    pressingOptions,
    pressing,
    requiresShipping: Boolean(checkout?.requiresShipping),
  };
};

/**
 * True when this memory can be taken to the existing Stripe Payment Link and
 * charge the right amount.
 *
 * `UNPRICED_ENHANCEMENTS` is informational, not fatal: the package still
 * checks out for its approved price and the quoted pieces are settled
 * separately. Every other blocker stops the sale.
 */
export const canCheckout = (memory: MemorySummary): boolean =>
  memory.blockers.every((blocker) => blocker.code === "UNPRICED_ENHANCEMENTS");

/**
 * The package price as displayed elsewhere on the site, e.g. "From £799".
 *
 * GBP only. Local-currency display belongs to `lib/currency.ts` and reads the
 * pound amount; a second currency argument here would be a second way to
 * produce the same estimate.
 */
export const memoryHeadlinePrice = (memory: MemorySummary): string | null =>
  memory.pkg ? formatPrice(memory.pkg) : null;
