/**
 * MCB PRODUCT CATALOGUE — TYPE MODEL
 * ----------------------------------
 * `data/packages.ts` owns the five experiences MCB sells and where each one
 * checks out. This module owns everything a memory can *become*: the records,
 * frames, boxes, cards and players that surround those experiences.
 *
 * The two are deliberately separate. A package has an approved price and a
 * Stripe Payment Link; a physical product, today, has neither. Modelling them
 * as one thing would force us either to invent prices or to weaken the type
 * that currently guarantees every sellable package/format pair has somewhere
 * to check out.
 *
 * THREE RULES THIS FILE ENFORCES
 * -----------------------------
 * 1. A price is either APPROVED (a real number, from the business) or TBD.
 *    There is no third state, and TBD carries no number to accidentally
 *    render — see `ProductPrice`.
 * 2. Whether a product physically carries the song is stated, never assumed.
 *    A vinyl record inside a memory box is not automatically a playable copy
 *    of the customer's song — see `SongInclusion`.
 * 3. Song capacity is a property of the physical format, so the set of valid
 *    pressings for an album is derived from capacity rather than hand-listed
 *    per package — see `catalogue/vinyl.ts`.
 */

import type { PackageId } from "../packages";

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

export interface Money {
  gbp: number;
  usd: number;
}

/**
 * A catalogue price.
 *
 * `TBD` is not "£0" and not "price unknown, guess something" — it is a
 * positive statement that the business has not approved a customer-facing
 * figure. It deliberately has no numeric field, so there is nothing for a
 * component to read and render by mistake. Every physical product in the
 * catalogue is TBD today; none of the prices below were invented.
 */
export type ProductPrice =
  | { status: "APPROVED"; gbp: number; usd: number; prefix?: string }
  | { status: "TBD" };

export const TBD: ProductPrice = { status: "TBD" };

export const isPriced = (
  price: ProductPrice
): price is Extract<ProductPrice, { status: "APPROVED" }> =>
  price.status === "APPROVED";

/**
 * Renders a catalogue price, or `null` when there is no approved figure.
 *
 * Callers must handle `null` with their own copy rather than being handed a
 * placeholder like "—" that reads as a price of nothing.
 */
export const formatProductPrice = (
  price: ProductPrice,
  currency: "gbp" | "usd" = "gbp"
): string | null => {
  if (!isPriced(price)) return null;
  const amount =
    currency === "gbp" ? `£${price.gbp}` : `$${price.usd}`;
  return price.prefix ? `${price.prefix} ${amount}` : amount;
};

/* ------------------------------------------------------------------ */
/* Availability and fulfilment                                         */
/* ------------------------------------------------------------------ */

export type Availability =
  /** Held or produced to a known process; orderable now. */
  | "AVAILABLE"
  /** Produced individually against a brief; quoted per commission. */
  | "MADE_TO_ORDER"
  /** Approved as a product line, not yet released for sale. */
  | "COMING_SOON";

export type Fulfilment = "DIGITAL" | "PHYSICAL";

/**
 * Lead time is OPTIONAL and omitted wherever the business has not stated one.
 * An absent lead time renders as nothing at all; it never falls back to a
 * plausible-sounding default.
 */
export interface LeadTime {
  /** Customer-facing phrase, e.g. "Delivered within 15 working days". */
  label: string;
  /** Machine-readable equivalent for structured data, where meaningful. */
  workingDays?: number;
}

/* ------------------------------------------------------------------ */
/* Song inclusion and capacity                                         */
/* ------------------------------------------------------------------ */

/**
 * Whether this product physically carries the customer's song.
 *
 * `CONFIGURABLE` exists because pairing a record with a frame or a box does
 * not, by itself, mean the record is a playable pressing of the song — a
 * display piece is a legitimate and different product. The business has not
 * approved a blanket rule either way, so combinations resolve to
 * `CONFIGURABLE` and are settled during configuration, not guessed here.
 */
export type SongInclusion = "CARRIES_SONG" | "KEEPSAKE_ONLY" | "CONFIGURABLE";

/**
 * How many songs one unit of a physical format holds.
 *
 * `max` is the fitting constraint used to derive valid pressings. `min` is
 * presentational only — a 12-inch is described as holding "5–6 songs", but a
 * four-song album still presses onto one perfectly well.
 */
export interface SongCapacity {
  min: number;
  max: number;
}

/** "1 song", "2 songs", "5–6 songs". */
export const capacityLabel = ({ min, max }: SongCapacity): string =>
  min === max
    ? `${max} ${max === 1 ? "song" : "songs"}`
    : `${min}–${max} songs`;

/* ------------------------------------------------------------------ */
/* Occasions                                                           */
/* ------------------------------------------------------------------ */

/**
 * Occasions drive two separate things: Gift Pop-Up Card designs, and seasonal
 * editions of the core experiences. They share one vocabulary so a Christmas
 * card and a Christmas Moment cannot end up filed under different spellings
 * of the same word.
 *
 * Adding an occasion means adding one entry to `OCCASIONS` and, if it needs a
 * card, one entry to the card catalogue. Nothing else in the system changes.
 */
export type OccasionId =
  | "anniversary"
  | "birthday"
  | "wedding"
  | "mothers-day"
  | "christmas"
  | "easter"
  | "thank-you"
  | "congratulations"
  | "valentines-day"
  | "cruise"
  | "new-year"
  | "fourth-of-july";

export interface Occasion {
  id: OccasionId;
  /** Title case, for chips, selectors and headings. */
  label: string;
  /**
   * The same occasion inside a sentence.
   *
   * A label is not a phrase: "A pop-up card for Cruise / Voyage" and "for
   * Thank You" read like form fields, while "for a cruise or voyage" and
   * "for saying thank you" read like English. Generated copy uses this, so
   * adding an occasion means writing its phrase once, here.
   */
  prose: string;
  /**
   * True when the occasion falls in a fixed part of the calendar and can
   * therefore anchor a seasonal campaign. "Thank you" is an occasion but not
   * a season; Christmas is both.
   */
  seasonal: boolean;
}

export const OCCASIONS: Readonly<Record<OccasionId, Occasion>> = {
  anniversary: {
    id: "anniversary",
    label: "Anniversary",
    prose: "an anniversary",
    seasonal: false,
  },
  birthday: {
    id: "birthday",
    label: "Birthday",
    prose: "a birthday",
    seasonal: false,
  },
  wedding: {
    id: "wedding",
    label: "Wedding",
    prose: "a wedding",
    seasonal: false,
  },
  "mothers-day": {
    id: "mothers-day",
    label: "Mother's Day",
    prose: "Mother's Day",
    seasonal: true,
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    prose: "Christmas",
    seasonal: true,
  },
  easter: { id: "easter", label: "Easter", prose: "Easter", seasonal: true },
  "thank-you": {
    id: "thank-you",
    label: "Thank You",
    prose: "saying thank you",
    seasonal: false,
  },
  congratulations: {
    id: "congratulations",
    label: "Congratulations",
    prose: "saying congratulations",
    seasonal: false,
  },
  "valentines-day": {
    id: "valentines-day",
    label: "Valentine's Day",
    prose: "Valentine's Day",
    seasonal: true,
  },
  cruise: {
    id: "cruise",
    label: "Cruise / Voyage",
    prose: "a cruise or voyage",
    seasonal: false,
  },
  "new-year": {
    id: "new-year",
    label: "New Year",
    prose: "New Year",
    seasonal: true,
  },
  "fourth-of-july": {
    id: "fourth-of-july",
    label: "Fourth of July",
    prose: "the Fourth of July",
    seasonal: true,
  },
};

/* ------------------------------------------------------------------ */
/* Families and products                                               */
/* ------------------------------------------------------------------ */

export type ProductFamilyId =
  | "vinyl"
  | "cd"
  | "lyrics-frame"
  | "frame"
  | "memory-box"
  | "gift-pop-up-card"
  | "plaque"
  | "digital-player"
  | "portable-gramophone"
  | "phone-gramophone";

/* ------------------------------------------------------------------ */
/* Option dimensions                                                   */
/* ------------------------------------------------------------------ */

/**
 * A choice a customer makes about a product, separate from which product it is.
 *
 * This is the extension point for vinyl colour. Colour is NOT offered at
 * launch and no placeholder variants exist — but because size is a product and
 * colour would be an option, adding it later means appending one
 * `ProductOption` to the vinyl products. It does not multiply the catalogue,
 * it does not touch the pressing rules, and it does not change any type that
 * the checkout or cart depends on.
 *
 * Sleeve artwork is modelled the same way, which is what keeps custom artwork
 * a first-class presentation choice rather than a sentence in a description.
 */
export interface ProductOptionValue {
  id: string;
  label: string;
  /**
   * Priced separately, where a price has been approved. Absent means the value
   * carries no separate charge decision yet — it is NOT a claim of "free".
   */
  price?: ProductPrice;
  /** False keeps an approved-but-unreleased value out of the UI. */
  available: boolean;
}

export interface ProductOption {
  id: string;
  /** Customer-facing question, e.g. "Sleeve". */
  label: string;
  values: readonly ProductOptionValue[];
}

/** Option values a customer can actually pick today. */
export const availableOptionValues = (
  option: ProductOption
): readonly ProductOptionValue[] =>
  option.values.filter((value) => value.available);

/** Options with at least one selectable value. */
export const selectableOptions = (
  product: Pick<CatalogueProduct, "options">
): readonly ProductOption[] =>
  (product.options ?? []).filter(
    (option) => availableOptionValues(option).length > 0
  );

export interface CatalogueProduct {
  id: string;
  familyId: ProductFamilyId;
  name: string;
  description: string;
  /** Public path to a photograph. Omitted where no approved image exists. */
  image?: string;
  /** Overrides the default alt text (the name) where more detail helps. */
  alt?: string;
  price: ProductPrice;
  availability: Availability;
  leadTime?: LeadTime;
  fulfilment: Fulfilment;
  songInclusion: SongInclusion;
  /** Present only on formats that physically hold audio. */
  songCapacity?: SongCapacity;
  /** Set on occasion-led variants such as Gift Pop-Up Card designs. */
  occasion?: OccasionId;
  /**
   * Dimensions, materials and the like — ONLY where supplied by the business.
   * An empty or absent list means "not specified", never "none".
   */
  specs?: readonly { label: string; value: string }[];
  /**
   * Experiences this product can be configured against. Absent means the
   * business has stated no restriction, not that it works with everything.
   */
  compatiblePackages?: readonly PackageId[];
  /** Enhancements this product can be combined with, by product id. */
  compatibleProducts?: readonly string[];
  /**
   * Choices within this product — sleeve, and in future colour. Absent means
   * the product has nothing to configure.
   */
  options?: readonly ProductOption[];
}

/**
 * A product family groups variants that differ by size, occasion or finish.
 *
 * A family may legitimately have NO products yet: Digital Players are an
 * approved part of the vinyl ecosystem, but no model, price or photograph has
 * been supplied. The family exists so the relationship can be expressed and
 * so adding the first product later is a data edit, not an architecture
 * change. UI must handle an empty family by describing it, not by inventing
 * a product to fill the space.
 */
export interface ProductFamily {
  id: ProductFamilyId;
  name: string;
  /** One line describing the family. Used wherever a family is shown alone. */
  description: string;
  /** Representative image for the family, where one exists. */
  image?: string;
  alt?: string;
  /** True where the family is also selectable as a delivery format. */
  isCheckoutFormat: boolean;
  products: readonly CatalogueProduct[];
}
