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
    /**
     * No colour, and no size, in the name.
     *
     * Colour is not offered at launch, so naming one here would advertise a
     * choice the customer does not have. Size is not fixed either: record
     * capacity now determines the pressing, so a one-song Keepsake and a
     * six-song Heirloom are not the same object. `catalogue/vinyl.ts` derives
     * which records an experience presses to.
     */
    name: "Vinyl",
    summary:
      "Pressed and posted to you, with your custom sleeve artwork. Record size is matched to the number of songs.",
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
 * Re-exported so a consumer reading a package's timing does not have to know
 * that the vocabulary lives with the legal documents. It lives there because
 * the Terms and the product card have to agree about it, and putting the
 * definition beside only one of them is how they came to disagree.
 */
export type { DeliveryBasis } from "./legal/delivery";

/**
 * How an experience is bought.
 *
 * `FIXED_PRICE` — a published GBP price, an online checkout, a basket. The
 * four standard experiences.
 *
 * `CONCIERGE` — no published price and no checkout. The Full Package is
 * scoped in a private consultation and priced per commission, so a website
 * that quoted a figure for it would be inventing one. This is the single
 * discriminator every other rule reads: the package card, the checkout
 * resolver, the enhancement basket, the structured data and the server all
 * branch on it rather than on the literal id `bespoke`, so the boundary is
 * one decision rather than five places that must agree.
 */
export type CommercialModel = "FIXED_PRICE" | "CONCIERGE";


/**
 * `F` is the exact set of formats a package offers. Because `checkout` is
 * keyed by `F`, a package cannot declare a format without also declaring
 * where that format checks out, and cannot declare a checkout for a format
 * it does not offer. Both are compile-time errors.
 */
export interface McbPackage<F extends FormatId = FormatId> {
  id: PackageId;
  name: string;
  /**
   * The approved positioning line — what this experience *is*, in one
   * sentence, e.g. "Four chapters. One unforgettable story." Rendered above
   * the price on every card. It is marketing copy signed off by the business:
   * do not paraphrase it in a component.
   */
  positioning: string;
  description: string;
  /**
   * Whether this is bought online or commissioned privately. Defaults are
   * never assumed — every package states it.
   */
  commercialModel: CommercialModel;
  /**
   * Secondary label for a concierge experience, e.g. "Private Concierge".
   * Absent on the fixed-price packages, which need no qualifier.
   */
  conciergeLabel?: string;
  /**
   * The published price — ABSENT on a concierge experience.
   *
   * Optional is the whole mechanism. A concierge commission has no figure to
   * publish, and the cheap way to express that would have been `gbp: 0` or
   * keeping the old £799 and "just not rendering it". Both leave a number
   * sitting in the field every price component reads, one `<Price gbp={...}>`
   * away from being quoted at a customer.
   *
   * Removing the field instead makes the compiler the enforcement: every one
   * of the dozen call sites that renders, sums, converts or submits a package
   * price now has to say what it does when there is no price. There is no
   * route from a concierge package to a displayed amount, because there is no
   * amount.
   */
  price?: {
    /**
     * THE COMMERCIAL PRICE. The only figure MCB charges, the only one Stripe
     * takes, and the basis of every local-currency estimate on the site.
     */
    gbp: number;
    /**
     * LEGACY. A RECORD, NOT A RATE — and never a display value.
     *
     * A hand-approved dollar figure that predates local-currency display. It
     * is kept because it is operationally live: the build compiles it into
     * `api/data/packages.json`, `order.php` writes it to `orders.amount_usd`
     * on every order, and `GET /api/crm/orders` reads it back out. Removing
     * it would change a database column, a CRM response shape and the
     * fulfilment webhook's `priceUSD` field — three live integrations — to
     * delete a number nothing customer-facing uses.
     *
     * It is NOT an exchange rate and must never be shown to a customer or
     * used to convert anything. It is a fixed figure that drifts from the
     * real rate the moment the market moves, and the site now has exactly one
     * way to answer "what is this in dollars?" — GBP times a live rate, in
     * `lib/currency.ts`. `formatPrice` was deliberately stripped of the
     * argument that could render this, so there is no route from here to a
     * price a customer reads.
     */
    usd: number;
    /** Rendered as "From £799" for open-ended commissions. */
    prefix?: string;
  };
  songCount: number | null;
  songDuration?: string;
  revisions: string;
  features: readonly string[];
  /**
   * The customer-facing timing line.
   *
   * THIS IS AN ESTIMATE, AND IT NOW SAYS SO. Three of these read "Delivered
   * within 15 working days" while the Terms said those times were "targets we
   * work to, not guarantees" — two statements about the same product, on the
   * same site, that could not both be true. MCB does not control a customs
   * queue or a courier's third delivery attempt, so the card was the one
   * making a promise nobody could keep.
   */
  delivery: string;
  /**
   * Which kind of timing `delivery` is.
   *
   * A Moment written and sent by MCB within the hour and a record pressed and
   * posted over a fortnight are not the same claim, and the fifteen-working-day
   * planning recommendation is about the stages only the second one has.
   */
  deliveryBasis: DeliveryBasis;
  /** Formats the customer chooses between. Empty = no format choice. */
  formats: readonly F[];
  checkout: Readonly<Record<F, CheckoutTarget>>;
  /** Used when `formats` is empty. */
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
/**
 * A package that genuinely has a published price.
 *
 * `price` is optional on `McbPackage` because concierge experiences have none.
 * That optionality is correct for the general case and wrong for the four
 * fixed-price experiences, where the price is not merely usually present — it
 * is the product. Typing them as this means `KEEPSAKE.price.gbp` stays a plain
 * expression rather than acquiring a `?.` and a fallback that could never run,
 * and it makes a fixed-price package defined without a price a compile error.
 */
export type FixedPricePackage<F extends FormatId = FormatId> =
  McbPackage<F> & {
    commercialModel: "FIXED_PRICE";
    price: NonNullable<McbPackage<F>["price"]>;
  };

export type AnyPackage = Omit<McbPackage<FormatId>, "formats" | "checkout"> & {
  formats: readonly FormatId[];
  checkout: Partial<Readonly<Record<FormatId, CheckoutTarget>>>;
};

import {
  PLANNING_RECOMMENDATION,
  type DeliveryBasis,
} from "./legal/delivery";

const gbp = (value: number) => `£${value}`;
/**
 * Formats a package price for display, e.g. "£199" or "From £799".
 *
 * GBP ONLY, AND THAT IS DELIBERATE.
 *
 * This used to take a `currency` argument and could render `price.usd` — a
 * fixed, hand-approved dollar figure. Local-currency display is now derived
 * live from the pound amount (see `lib/currency.ts` and `components/Price`),
 * so keeping that argument would leave TWO different answers to "what is this
 * in dollars?": a hard-coded $99 and a converted ~$101. Which one a customer
 * saw would depend on which component happened to render it, and one of them
 * would always be wrong.
 *
 * Removing the parameter is what makes that impossible rather than merely
 * discouraged. `price.usd` still exists — see the note on `usd` in the price
 * type — but nothing customer-facing can reach it through here.
 */
/**
 * Overloaded so a package KNOWN to have a price still types as `string`.
 *
 * Without this, adding the concierge case would have made every existing call
 * site nullable and forced a `?? ""` onto four FAQ answers and a package card
 * that can never actually see null. The overload keeps the null exactly where
 * it is real — on a package whose type admits no price — so the compiler
 * flags the concierge callers and leaves the other twenty alone.
 */
export function formatPrice(pkg: Pick<AnyFixedPricePackage, "price">): string;
export function formatPrice(pkg: Pick<AnyPackage, "price">): string | null;
export function formatPrice(pkg: Pick<AnyPackage, "price">): string | null {
  // A concierge commission has no published price, and the honest answer to
  // "format this package's price" is that there isn't one to format. Returning
  // null makes each caller decide what to say instead; returning "" or "POA"
  // here would quietly put this function's wording on five different pages.
  if (!pkg.price) return null;
  const amount = gbp(pkg.price.gbp);
  return pkg.price.prefix ? `${pkg.price.prefix} ${amount}` : amount;
}

export const MOMENT: FixedPricePackage<"mp3"> = {
  id: "moment",
  commercialModel: "FIXED_PRICE",
  name: "Moment",
  positioning: "A memory, made instantly.",
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
  /**
   * UNCHANGED, deliberately. This is MCB writing, producing and sending a
   * file — no manufacturing, no carrier, nothing outside MCB's hands. The
   * fifteen-working-day planning recommendation exists because of the stages
   * a physical order goes through, and applying it here would misdescribe
   * MCB's fastest product as its slowest.
   */
  delivery: "Delivered within 1 hour",
  deliveryBasis: "DIGITAL_TURNAROUND",
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

export const KEEPSAKE: FixedPricePackage<"vinyl" | "cd" | "mp3"> = {
  id: "keepsake",
  commercialModel: "FIXED_PRICE",
  name: "Keepsake",
  positioning: "Turn the memory into something you can hold.",
  description:
    "Perfect for a heartfelt gift, proposal, or meaningful personal moment.",
  price: { gbp: 99, usd: 99 },
  songCount: 1,
  songDuration: "3–4 minutes",
  revisions: "1 refinement revision",
  features: [
    "1 fully personalised song (3–4 minutes)",
    "Story-driven lyrics crafted from your memories",
    "1 refinement revision",
    "Elegant cover artwork",
    "Your choice of vinyl, CD or MP3",
    PLANNING_RECOMMENDATION,
  ],
  delivery: PLANNING_RECOMMENDATION,
  deliveryBasis: "MADE_TO_ORDER",
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

export const JOURNEY: FixedPricePackage<"vinyl" | "cd"> = {
  id: "journey",
  commercialModel: "FIXED_PRICE",
  name: "Journey",
  positioning: "Four chapters. One unforgettable story.",
  description:
    "Ideal for cruises, anniversaries, romantic escapes, and milestone celebrations.",
  price: { gbp: 199, usd: 249 },
  songCount: 4,
  revisions: "1 refinement per song",
  features: [
    "4 personalised songs",
    "Choose a different music style for every memory",
    "Structured emotional journey (beginning → middle → finale)",
    "1 refinement per song",
    "Priority production handling",
    "Custom album artwork",
    "1-page lyric printable booklet (PDF)",
    "Deluxe digital delivery package",
    "Your choice of vinyl or CD",
    PLANNING_RECOMMENDATION,
  ],
  delivery: PLANNING_RECOMMENDATION,
  deliveryBasis: "MADE_TO_ORDER",
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

export const HEIRLOOM: FixedPricePackage<"vinyl" | "cd"> = {
  id: "heirloom",
  commercialModel: "FIXED_PRICE",
  name: "Heirloom",
  positioning: "Six memories. One family story.",
  description:
    "Designed for weddings, family milestones, and once-in-a-lifetime celebrations.",
  price: { gbp: 349, usd: 449 },
  songCount: 6,
  revisions: "1 refinement per song",
  features: [
    "6-song cohesive storytelling album",
    "Narrative-driven emotional arc",
    "Custom intro and closing theme",
    "1 refinement per song",
    "Producer-guided creative review",
    "Premium custom album artwork",
    "Multi-page lyric & story booklet (PDF)",
    "Private streaming link for sharing",
    "Your choice of vinyl or CD",
    "Priority handling",
    PLANNING_RECOMMENDATION,
  ],
  delivery: PLANNING_RECOMMENDATION,
  deliveryBasis: "MADE_TO_ORDER",
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
 * THE FULL PACKAGE — MCB's private concierge commission.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT HAS NO PRICE
 * ─────────────────────────────────────────────────────────────────────────
 * This was "Bespoke — From £799". That figure described a music commission
 * with a fixed set of deliverables. The Full Package is not that: it combines
 * MCB's own creations with gifts and experiences selected for one recipient,
 * so two Full Packages are not the same object and no single number describes
 * both. A published figure would either understate the work or invent a
 * ceiling nobody agreed to, and "From £799" would do both at once by
 * anchoring an unbounded commission to the cheapest one imaginable.
 *
 * So the price is not hidden here — it does not exist here. It is established
 * in the consultation, written into a proposal, and agreed before any payment
 * is arranged. See `CONCIERGE_SEQUENCE`.
 *
 * The old figures and the old Payment Link are retired but intact, in
 * `data/legacy/retiredBespoke.ts` — kept because historical orders and a live
 * Stripe object still reference them, and deliberately in a module NOTHING in
 * `src/` imports, so neither the £799 nor the retired link ships to a
 * browser. Unreachable from the journey, and absent from the bundle.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE INTERNAL ID STAYS `bespoke`
 * ─────────────────────────────────────────────────────────────────────────
 * Renaming it would rewrite `orders.package`, the generated packages JSON, the
 * CRM's filters and every historical row, to change a string no customer sees.
 * The id is an internal key; the customer-facing identity is `name`. They were
 * never required to match.
 */
export const FULL_PACKAGE: AnyPackage = {
  id: "bespoke",
  commercialModel: "CONCIERGE",
  name: "Bespoke",
  conciergeLabel: "Private Concierge",
  positioning: "Curated entirely around one person.",
  /**
   * The approved concierge description, verbatim. It is the sentence that
   * explains why there is no price on this card, so it must not be paraphrased
   * in a component or trimmed to fit a layout.
   */
  description:
    "Every Full Package is individually curated. We combine MCB's signature creations with carefully selected gifts and experiences chosen specifically for your recipient, story and occasion.",
  songCount: null,
  revisions: "Refinement continues until the agreed scope is met",
  /**
   * What a Full Package MAY include — not a fixed inclusion list, because the
   * scope is what the consultation decides. Worded so that no line reads as a
   * promise made before anyone has spoken to the customer.
   */
  features: [
    "A private consultation, one to one",
    "MCB signature creations, chosen for the story",
    "Carefully selected gifts and experiences",
    "Presentation and packaging designed for the occasion",
    "Scope, timeline and price agreed in writing before anything begins",
    "A single point of contact throughout",
    "White-glove delivery",
  ],
  delivery: "Timeline agreed with you during the consultation",
  deliveryBasis: "AGREED_IN_PROPOSAL",
  formats: [],
  /**
   * No checkout, and no `fallbackCheckout`.
   *
   * This is the boundary itself. `getCheckoutTarget` reads `fallbackCheckout`
   * when a package has no formats, so leaving the old link there would have
   * kept the Full Package silently checking out at the retired price — the
   * exact outcome this change exists to prevent. The link now lives in
   * `data/legacy/retiredBespoke.ts`, which nothing in the app imports.
   */
  checkout: {},
  popular: false,
  cta: "Begin a private consultation",
};

/**
 * BESPOKE — the previous export name.
 *
 * Kept as an alias so existing imports keep resolving to the same object
 * rather than every consumer being edited in the same commit that changes what
 * the object means. New code should import `FULL_PACKAGE`.
 *
 * @deprecated Use `FULL_PACKAGE`.
 */
export const BESPOKE = FULL_PACKAGE;

/**
 * THE COMMERCIAL SEQUENCE for a concierge commission.
 *
 * Stated as data because it is a commercial commitment, not decoration: it is
 * the customer's assurance that nothing is charged before a scope and a price
 * are agreed. Rendering it is what makes "there is no price on this page" read
 * as deliberate rather than as an omission.
 *
 * Note where payment sits — last, and after agreement. An enquiry is not an
 * order and creates no obligation on either side.
 */
export const CONCIERGE_SEQUENCE: readonly {
  title: string;
  detail: string;
}[] = [
  {
    title: "Your enquiry",
    detail:
      "Tell us who this is for, the occasion, and what you have in mind. Nothing is committed and nothing is charged.",
  },
  {
    title: "A private consultation",
    detail:
      "We speak properly — about the recipient, the story, the moment you are creating and what you would like to spend.",
  },
  {
    title: "Your proposal",
    detail:
      "We put forward a curation designed for this person, with everything it includes set out in writing.",
  },
  {
    title: "Agreed scope and price",
    detail:
      "You refine it until it is right. Nothing proceeds until you have agreed both what is included and what it costs.",
  },
  {
    title: "Payment arranged",
    detail:
      "Only then, and on the terms agreed with you.",
  },
];

/** Display order across the whole site. */
export const PACKAGES: readonly AnyPackage[] = [
  MOMENT,
  KEEPSAKE,
  JOURNEY,
  HEIRLOOM,
  FULL_PACKAGE,
];

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const getPackage = (id: string): AnyPackage | undefined =>
  PACKAGES.find((pkg) => pkg.id === id);

/**
 * A published-price package with its exact format set widened away.
 *
 * The collection-level counterpart to `FixedPricePackage`, standing to it as
 * `AnyPackage` stands to `McbPackage`. Lists that are only ever the buyable
 * experiences — a cruise comparison, a seasonal edition — annotate with this,
 * and get `price` as a required field rather than an optional one they would
 * otherwise have to defend against for a case they have excluded by
 * construction.
 */
export type AnyFixedPricePackage = Omit<AnyPackage, "price"> & {
  commercialModel: "FIXED_PRICE";
  price: NonNullable<AnyPackage["price"]>;
};

/**
 * Narrows a package to one that has a price.
 *
 * For the places that receive an arbitrary package and can only render a
 * priced one. Using this rather than a non-null assertion means the concierge
 * case is handled — by the caller, visibly — instead of being asserted away.
 */
export const isFixedPrice = (pkg: AnyPackage): pkg is AnyFixedPricePackage =>
  pkg.commercialModel === "FIXED_PRICE" && pkg.price !== undefined;

/**
 * True when this experience is commissioned privately rather than bought.
 *
 * THE ONE PREDICATE. The package card, the order form, the enhancement
 * basket, the structured data, the FAQ and the server all ask this rather than
 * comparing against the string `"bespoke"`. If MCB ever adds a second
 * concierge experience, or moves this one back to a fixed price, that is one
 * edit in `packages.ts` and not a search for every place someone hard-coded an
 * id.
 */
export const isConcierge = (
  pkg: Pick<AnyPackage, "commercialModel">
): boolean => pkg.commercialModel === "CONCIERGE";

/** True when `id` names a concierge experience. Guards untrusted input. */
export const isConciergePackageId = (id: string): boolean => {
  const pkg = getPackage(id);
  return pkg !== undefined && isConcierge(pkg);
};

/**
 * The published GBP price, or `null` when there is not one.
 *
 * The single accessor for "what does this cost?", so a concierge package
 * answers "there is no price" everywhere rather than answering it correctly in
 * the places someone remembered to check.
 */
export const publishedPriceGbp = (
  pkg: Pick<AnyPackage, "price">
): number | null => pkg.price?.gbp ?? null;

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
  /**
   * A concierge commission does not check out, at any price, in any format.
   *
   * First and unconditional, ahead of every other branch, because this is the
   * function every payment path in the site funnels through: the package card,
   * the order form's submit, the Payment Link fallback and the dynamic session
   * builder all ask it where to send the customer. One refusal here closes all
   * of them, and closes any added later without their author having to know.
   */
  if (isConcierge(pkg)) return undefined;
  if (pkg.formats.length === 0) return pkg.fallbackCheckout;
  if (!format || !isFormatAllowed(pkg, format)) return undefined;
  return pkg.checkout[format];
};

/** Whether choosing this package + format needs a delivery address. */
export const requiresShippingAddress = (
  pkg: AnyPackage,
  format: string | null
): boolean => Boolean(getCheckoutTarget(pkg, format)?.requiresShipping);

