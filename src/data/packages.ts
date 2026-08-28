/**
 * MCB COMMERCIAL SOURCE OF TRUTH
 * ------------------------------
 * Every price, inclusion, delivery promise, format rule and checkout
 * destination on the site derives from this file.
 *
 * Prices previously lived in five places that had already drifted apart
 * (package cards, the order form's display list, the order form's webhook
 * payload, the thank-you page's analytics value, and FAQ structured data).
 * Adding a sixth consumer is fine; adding a second definition is not.
 */

/* ------------------------------------------------------------------ */
/* Formats                                                             */
/* ------------------------------------------------------------------ */

export type FormatId = "vinyl" | "cd" | "mp3";

export interface FormatDefinition {
  id: FormatId;
  /** Customer-facing name. */
  name: string;
  /** One line explaining what arrives. */
  summary: string;
  /** Physical formats must collect a delivery address. */
  isPhysical: boolean;
}

export const FORMATS: Readonly<Record<FormatId, FormatDefinition>> = {
  vinyl: {
    id: "vinyl",
    name: 'High-quality 12" Black Vinyl',
    summary: "Pressed and posted to you, with your custom cover artwork.",
    isPhysical: true,
  },
  cd: {
    id: "cd",
    name: "CD",
    summary: "Your music on disc, with your custom cover artwork.",
    isPhysical: true,
  },
  mp3: {
    id: "mp3",
    name: "MP3",
    summary: "Delivered digitally — nothing to wait for in the post.",
    isPhysical: false,
  },
};

export const isPhysicalFormat = (format: FormatId): boolean =>
  FORMATS[format].isPhysical;

/* ------------------------------------------------------------------ */
/* Checkout targets                                                    */
/* ------------------------------------------------------------------ */

/**
 * Stripe applies shipping-address collection per Payment Link, not per line
 * item, so a digital and a physical variant of the same package cannot share
 * one link. Format never changes the price — these variants exist purely to
 * get the fulfilment configuration right.
 */
export interface CheckoutTarget {
  /**
   * `null` means the Payment Link has not been created in the Stripe
   * Dashboard yet. The UI must refuse the sale rather than send a customer
   * to a dead page — see `getCheckoutTarget`.
   */
  url: string | null;
  requiresShipping: boolean;
  /** Recommended Stripe Dashboard product name, for configuration parity. */
  stripeProductName: string;
}

/* ------------------------------------------------------------------ */
/* Packages                                                            */
/* ------------------------------------------------------------------ */

export type PackageId = "moment" | "keepsake" | "journey" | "heirloom" | "bespoke";

/**
 * `F` is the exact set of formats a package offers. Because `checkout` is
 * keyed by `F`, a package cannot declare a format without also declaring
 * where that format checks out, and cannot declare a checkout for a format
 * it does not offer. Both are compile-time errors.
 */
export interface McbPackage<F extends FormatId = FormatId> {
  id: PackageId;
  name: string;
  /** Short line under the price, e.g. "Most popular gift". */
  positioning: string;
  description: string;
  price: {
    gbp: number;
    usd: number;
    /** Rendered as "From £799" for open-ended commissions. */
    prefix?: string;
  };
  songCount: number | null;
  songDuration?: string;
  revisions: string;
  features: readonly string[];
  delivery: string;
  /** Formats the customer chooses between. Empty = no format choice. */
  formats: readonly F[];
  checkout: Readonly<Record<F, CheckoutTarget>>;
  /** Used when `formats` is empty (Bespoke). */
  fallbackCheckout?: CheckoutTarget;
  /** Visually emphasised as the recommended experience. */
  popular: boolean;
  cta: string;
}

/**
 * A package with its exact format set widened away.
 *
 * The strict `McbPackage<F>` above is what enforces the invariant at the point
 * of definition: a package cannot declare a format without a checkout target,
 * or a checkout target for a format it does not sell. That strictness makes
 * `McbPackage<"mp3">` and `McbPackage<"vinyl" | "cd">` mutually incompatible
 * though (`checkout` is invariant), so collections and general-purpose helpers
 * work against this widened view instead of casting.
 */
export type AnyPackage = Omit<McbPackage<FormatId>, "formats" | "checkout"> & {
  formats: readonly FormatId[];
  checkout: Partial<Readonly<Record<FormatId, CheckoutTarget>>>;
};

const gbp = (value: number) => `£${value}`;
const usd = (value: number) => `$${value}`;

/** Formats a package price for display, e.g. "£199" or "From £799". */
export const formatPrice = (
  pkg: Pick<AnyPackage, "price">,
  currency: "gbp" | "usd" = "gbp"
): string => {
  const amount = currency === "gbp" ? gbp(pkg.price.gbp) : usd(pkg.price.usd);
  return pkg.price.prefix ? `${pkg.price.prefix} ${amount}` : amount;
};

export const MOMENT: McbPackage<"mp3"> = {
  id: "moment",
  name: "Moment",
  positioning: "Perfect for special moments",
  description:
    "A simple, beautiful way to turn a memory into music. Perfect for last minute requirements and quick, meaningful gifts.",
  price: { gbp: 10, usd: 14 },
  songCount: 1,
  revisions: "1 revision included",
  features: [
    "1 personalised song",
    "Customised lyrics from your story",
    "Choose your mood/style",
    "1 revision included",
    "MP3 delivery",
    "Delivered within 1 hour",
  ],
  delivery: "Delivered within 1 hour",
  formats: ["mp3"],
  checkout: {
    mp3: {
      url: "https://buy.stripe.com/7sYaEWcHWbHN8147uqbsc0b",
      requiresShipping: false,
      stripeProductName: "MCB Moment — MP3",
    },
  },
  popular: false,
  cta: "Begin This Experience",
};

export const KEEPSAKE: McbPackage<"vinyl" | "cd" | "mp3"> = {
  id: "keepsake",
  name: "Keepsake",
  positioning: "Most popular gift",
  description:
    "Perfect for a heartfelt gift, proposal, or meaningful personal moment.",
  price: { gbp: 79, usd: 99 },
  songCount: 1,
  songDuration: "3–4 minutes",
  revisions: "2 refinement revisions",
  features: [
    "1 fully personalised song (3–4 minutes)",
    "Story-driven lyrics crafted from your memories",
    "2 refinement revisions",
    "Elegant cover artwork",
    'Your choice of 12" Black Vinyl, CD or MP3',
    "Delivered within 15 working days",
  ],
  delivery: "Delivered within 15 working days",
  formats: ["vinyl", "cd", "mp3"],
  checkout: {
    // The existing Keepsake link collects no shipping address, so it is
    // correct for the digital variant only.
    mp3: {
      url: "https://buy.stripe.com/7sY00i8rG5jpa9caGCbsc06",
      requiresShipping: false,
      stripeProductName: "MCB Keepsake — MP3",
    },
    vinyl: {
      url: "https://buy.stripe.com/dRmfZg4bq6nta9c3eabsc0c",
      requiresShipping: true,
      stripeProductName: "MCB Keepsake — Vinyl",
    },
    cd: {
      url: "https://buy.stripe.com/9B66oG37m4fl6X001Ybsc0d",
      requiresShipping: true,
      stripeProductName: "MCB Keepsake — CD",
    },
  },
  popular: false,
  cta: "Begin This Experience",
};

export const JOURNEY: McbPackage<"vinyl" | "cd"> = {
  id: "journey",
  name: "Journey",
  positioning: "Best overall experience",
  description:
    "Ideal for cruises, anniversaries, romantic escapes, and milestone celebrations.",
  price: { gbp: 199, usd: 249 },
  songCount: 4,
  revisions: "2 refinements per song",
  features: [
    "4 personalised songs",
    "Unified musical theme across all tracks",
    "Structured emotional journey (beginning → middle → finale)",
    "2 refinements per song",
    "Priority production handling",
    "Custom album artwork",
    "1-page lyric printable booklet (PDF)",
    "Deluxe digital delivery package",
    'Your choice of 12" Black Vinyl or CD',
    "Delivered within 15 working days",
  ],
  delivery: "Delivered within 15 working days",
  formats: ["vinyl", "cd"],
  checkout: {
    vinyl: {
      url: "https://buy.stripe.com/14A9AS23ibHNftwcOKbsc07",
      requiresShipping: true,
      stripeProductName: "MCB Journey — Vinyl",
    },
    cd: {
      url: "https://buy.stripe.com/00w3cueQ4bHNa9c162bsc0e",
      requiresShipping: true,
      stripeProductName: "MCB Journey — CD",
    },
  },
  popular: true,
  cta: "Choose Best Value",
};

export const HEIRLOOM: McbPackage<"vinyl" | "cd"> = {
  id: "heirloom",
  name: "Heirloom",
  positioning: "For major life events",
  description:
    "Designed for weddings, family milestones, and once-in-a-lifetime celebrations.",
  price: { gbp: 349, usd: 449 },
  songCount: 7,
  revisions: "2 refinements per song",
  features: [
    "7-song cohesive storytelling album",
    "Narrative-driven emotional arc",
    "Custom intro and closing theme",
    "2 refinements per song",
    "Producer-guided creative review",
    "Premium custom album artwork",
    "Multi-page lyric & story booklet (PDF)",
    "Private streaming link for sharing",
    'Your choice of 12" Black Vinyl or CD',
    "Priority handling",
    "Delivered within 15 working days",
  ],
  delivery: "Delivered within 15 working days",
  formats: ["vinyl", "cd"],
  checkout: {
    vinyl: {
      url: "https://buy.stripe.com/6oUaEWbDSfY39586qmbsc08",
      requiresShipping: true,
      stripeProductName: "MCB Heirloom — Vinyl",
    },
    cd: {
      url: "https://buy.stripe.com/14AcN47nC3bhftwaGCbsc0f",
      requiresShipping: true,
      stripeProductName: "MCB Heirloom — CD",
    },
  },
  popular: false,
  cta: "Begin This Experience",
};

/**
 * Bespoke is unchanged by directive. Its inclusions are all digital
 * deliverables (artwork files, instrumental versions, story booklet), and its
 * existing Payment Link collects no shipping address, so no shipping change
 * is applied here.
 */
export const BESPOKE: AnyPackage = {
  id: "bespoke",
  name: "Bespoke",
  positioning: "Full luxury production",
  description: "A fully commissioned luxury experience.",
  price: { gbp: 799, usd: 999, prefix: "From" },
  songCount: null,
  revisions: "Unlimited refinements during production window",
  features: [
    "Fully commissioned custom project",
    "Private 1:1 creative consultation",
    "Dedicated 7-day production window",
    "Unlimited refinements during production window",
    "Exclusive arrangement usage rights",
    "Custom instrumentation & arrangement requests",
    "Deluxe album artwork (multiple concepts)",
    "5–10 page premium story & lyric booklet",
    "Instrumental versions included",
    "High-resolution artwork files",
    "White-glove delivery experience",
  ],
  delivery: "Dedicated 7-day production window",
  formats: [],
  checkout: {},
  fallbackCheckout: {
    url: "https://buy.stripe.com/5kQ8wO9vKcLR3KO3eabsc09",
    requiresShipping: false,
    stripeProductName: "MCB Bespoke",
  },
  popular: false,
  cta: "Begin This Experience",
};

/** Display order across the whole site. */
export const PACKAGES: readonly AnyPackage[] = [
  MOMENT,
  KEEPSAKE,
  JOURNEY,
  HEIRLOOM,
  BESPOKE,
];

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const getPackage = (id: string): AnyPackage | undefined =>
  PACKAGES.find((pkg) => pkg.id === id);

/** True when `format` is offered by `pkg`. Guards runtime input. */
export const isFormatAllowed = (
  pkg: Pick<AnyPackage, "formats">,
  format: string
): format is FormatId =>
  (pkg.formats as readonly string[]).includes(format);

/**
 * Resolves a package + format to its checkout target.
 * Returns `undefined` for combinations that are not sold, so callers must
 * handle the invalid case explicitly rather than silently proceeding.
 */
export const getCheckoutTarget = (
  pkg: AnyPackage,
  format: string | null
): CheckoutTarget | undefined => {
  if (pkg.formats.length === 0) return pkg.fallbackCheckout;
  if (!format || !isFormatAllowed(pkg, format)) return undefined;
  return pkg.checkout[format];
};

/** Whether choosing this package + format needs a delivery address. */
export const requiresShippingAddress = (
  pkg: AnyPackage,
  format: string | null
): boolean => Boolean(getCheckoutTarget(pkg, format)?.requiresShipping);
