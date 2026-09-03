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
  isFormatAllowed,
  type AnyPackage,
  type CheckoutTarget,
  type FormatId,
} from "../data/packages";
import {
  getProduct,
  isPriced,
  type CatalogueProduct,
  type Money,
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
  | { code: "UNPRICED_ENHANCEMENTS"; message: string };

export interface MemorySummary {
  pkg: AnyPackage | undefined;
  format: FormatId | null;
  lines: readonly MemoryLine[];
  /** Enhancement lines with no approved price. Excluded from the total. */
  quotedLines: readonly MemoryLine[];
  /** Sum of every approved price in the memory. */
  subtotal: Money;
  /** What the customer pays online today. */
  chargeableTotal: Money;
  /** Where this memory checks out, if anywhere. */
  checkout: CheckoutTarget | undefined;
  blockers: readonly CheckoutBlocker[];
  /** Vinyl pressings valid for this package, where vinyl is selected. */
  pressingOptions: readonly PressingOption[];
  pressing: PressingOption | undefined;
  requiresShipping: boolean;
}

const ZERO: Money = { gbp: 0, usd: 0 };

const addMoney = (a: Money, b: Money): Money => ({
  gbp: a.gbp + b.gbp,
  usd: a.usd + b.usd,
});

const priceAsMoney = (price: ProductPrice): Money =>
  isPriced(price) ? { gbp: price.gbp, usd: price.usd } : ZERO;

/** "£199" / "$249". Kept here so every memory renders money identically. */
export const formatMoney = (
  money: Money,
  currency: "gbp" | "usd" = "gbp"
): string => (currency === "gbp" ? `£${money.gbp}` : `$${money.usd}`);

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
      price: {
        status: "APPROVED",
        gbp: pkg.price.gbp,
        usd: pkg.price.usd,
        ...(pkg.price.prefix ? { prefix: pkg.price.prefix } : {}),
      },
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
        price: { status: "APPROVED", gbp: 0, usd: 0 },
        includedInPackage: true,
      });
    }
  }

  for (const product of enhancements) lines.push(enhancementLine(product));

  const quotedLines = lines.filter((line) => !isPriced(line.price));

  const subtotal = lines
    .filter((line) => !line.includedInPackage)
    .reduce((total, line) => addMoney(total, priceAsMoney(line.price)), ZERO);

  const checkout = pkg ? getCheckoutTarget(pkg, format) : undefined;

  // Only the package price can be charged by a fixed Payment Link, so that is
  // what the total claims — never the subtotal of a basket Stripe will not see.
  const chargeableTotal = pkg
    ? { gbp: pkg.price.gbp, usd: pkg.price.usd }
    : ZERO;

  const blockers: CheckoutBlocker[] = [];

  if (!pkg) {
    blockers.push({
      code: "NO_PACKAGE",
      message: "Choose an experience to begin your memory.",
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

/** The package price as displayed elsewhere on the site, e.g. "From £799". */
export const memoryHeadlinePrice = (
  memory: MemorySummary,
  currency: "gbp" | "usd" = "gbp"
): string | null => (memory.pkg ? formatPrice(memory.pkg, currency) : null);
