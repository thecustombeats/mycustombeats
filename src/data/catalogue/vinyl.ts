/**
 * VINYL — a configurable family, sized by song count.
 *
 * Three record sizes, each with a fixed song capacity. Which pressing an
 * experience can use is DERIVED from that capacity and the package's song
 * count, not hand-listed per package — so changing Heirloom from seven songs
 * to six re-derived its pressing options with no edit here, and adding a
 * future size needs one entry below and nothing else.
 *
 * Colour is deliberately absent. No colour is offered at launch, and no
 * placeholder variants exist. When colour is approved it becomes an option
 * dimension on these products; the pressing logic is unaffected.
 */

import type { AnyPackage } from "../packages";
import {
  TBD,
  capacityLabel,
  type CatalogueProduct,
  type ProductFamily,
  type ProductOption,
  type SongCapacity,
} from "./types";

export type VinylSizeId = "vinyl-7" | "vinyl-10" | "vinyl-12";

/**
 * Sleeve presentation.
 *
 * Custom artwork is what MCB already offers on every pressing, so it is the
 * one available value. Modelling it as an option rather than a phrase in a
 * description is what keeps it a real configuration choice — and is the same
 * mechanism a future colour option uses.
 *
 * NO COLOUR OPTION EXISTS HERE, deliberately. Colour is not offered at launch
 * and placeholder variants would advertise a choice the customer does not
 * have. Adding it later is one more entry in this array.
 */
const SLEEVE_OPTION: ProductOption = {
  id: "sleeve",
  label: "Sleeve",
  values: [
    {
      id: "custom-artwork",
      label: "Custom sleeve artwork",
      available: true,
    },
  ],
};

/**
 * The most records MCB will present as one configuration.
 *
 * Without a ceiling, capacity arithmetic happily suggests six 7-inch singles
 * for a six-song album — technically true, commercially absurd, and not a
 * configuration the business has approved.
 */
const MAX_RECORDS_PER_CONFIGURATION = 2;

const vinylProduct = (
  id: VinylSizeId,
  size: string,
  capacity: SongCapacity,
  image?: string
): CatalogueProduct => ({
  id,
  familyId: "vinyl",
  name: `${size} Vinyl`,
  description: `Pressed to ${size.toLowerCase()} vinyl and posted to you, with your custom sleeve artwork. Holds ${capacityLabel(capacity)}.`,
  ...(image ? { image } : {}),
  price: TBD,
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "CARRIES_SONG",
  songCapacity: capacity,
  compatibleProducts: ["lyrics-frame", "memory-box-luxury"],
  options: [SLEEVE_OPTION],
});

export const VINYL_7: CatalogueProduct = vinylProduct(
  "vinyl-7",
  "7-inch",
  { min: 1, max: 1 },
  "/images/products/vinyl.jpg"
);

export const VINYL_10: CatalogueProduct = vinylProduct(
  "vinyl-10",
  "10-inch",
  { min: 2, max: 2 }
);

export const VINYL_12: CatalogueProduct = vinylProduct(
  "vinyl-12",
  "12-inch",
  { min: 5, max: 6 }
);

/** Smallest first, so derived options come back in a sensible order. */
export const VINYL_SIZES: readonly CatalogueProduct[] = [
  VINYL_7,
  VINYL_10,
  VINYL_12,
];

export const VINYL_FAMILY: ProductFamily = {
  id: "vinyl",
  name: "Personalised Vinyl Records",
  description:
    "Your song, pressed onto premium vinyl with bespoke sleeve artwork.",
  image: "/images/products/vinyl.jpg",
  isCheckoutFormat: true,
  products: VINYL_SIZES,
};

/* ------------------------------------------------------------------ */
/* Derived pressing configurations                                     */
/* ------------------------------------------------------------------ */

export interface PressingOption {
  /** Stable id, e.g. "2x-vinyl-10". */
  id: string;
  product: CatalogueProduct;
  records: number;
  /** "1 × 12-inch vinyl", "2 × 10-inch vinyl". */
  label: string;
  /** Songs this configuration must carry. */
  songCount: number;
  /**
   * Fewest records and least wasted capacity. Presentational only — every
   * option returned is valid.
   */
  recommended: boolean;
}

/**
 * Every pressing that can carry `songCount` songs within the record limit.
 *
 * Returns an empty array for song counts nothing can hold, and for open-ended
 * commissions (Bespoke) where the song count is not fixed — callers must
 * handle that rather than being handed a default configuration.
 */
export const pressingOptionsFor = (
  songCount: number | null
): readonly PressingOption[] => {
  if (songCount === null || songCount < 1) return [];

  const options = VINYL_SIZES.flatMap<PressingOption>((product) => {
    const capacity = product.songCapacity;
    if (!capacity) return [];

    const records = Math.ceil(songCount / capacity.max);
    if (records > MAX_RECORDS_PER_CONFIGURATION) return [];

    /**
     * An EXACT capacity (7-inch holds one song, 10-inch holds two) is a
     * specification, so it must be met: a 10-inch pressed with a single song
     * wastes a side and is not a configuration the business described.
     *
     * A RANGED capacity (12-inch, 5–6 songs) describes how much a record
     * holds, not how little. One song on a 12-inch is exactly what Keepsake
     * ships today, and a four-song Journey on a single 12-inch is explicitly
     * approved — so a range only has to fit, not fill.
     */
    const isExactCapacity = capacity.min === capacity.max;
    if (isExactCapacity && songCount < capacity.min) return [];

    return [
      {
        id: `${records}x-${product.id}`,
        product,
        records,
        label: `${records} × ${product.name.toLowerCase()}`,
        songCount,
        recommended: false,
      },
    ];
  });

  if (options.length === 0) return [];

  // Fewest records wins; ties break towards the least unused capacity, so a
  // single song is recommended on a 7-inch rather than rattling around a 12.
  const unused = (option: PressingOption) =>
    option.records * (option.product.songCapacity?.max ?? 0) - songCount;

  const best = options.reduce((a, b) =>
    a.records !== b.records
      ? a.records < b.records
        ? a
        : b
      : unused(a) <= unused(b)
        ? a
        : b
  );

  return options.map((option) => ({
    ...option,
    recommended: option.id === best.id,
  }));
};

/** Pressing options for a package, from its song count. */
export const pressingOptionsForPackage = (
  pkg: Pick<AnyPackage, "songCount">
): readonly PressingOption[] => pressingOptionsFor(pkg.songCount);

/**
 * Experiences a given record size can physically carry.
 *
 * CAPACITY ONLY. A 7-inch can carry a one-song Moment, which is why the
 * business lists Moment as compatible with it — but Moment does not sell on
 * vinyl today, so this is a statement about the record, not about what a
 * customer can order. Use `packagesOrderableOnVinylSize` for anything a
 * customer reads.
 */
export const packagesForVinylSize = (
  sizeId: VinylSizeId,
  packages: readonly AnyPackage[]
): readonly AnyPackage[] =>
  packages.filter((pkg) =>
    pressingOptionsForPackage(pkg).some(
      (option) => option.product.id === sizeId
    )
  );

/**
 * Experiences a customer can actually order on a given record size.
 *
 * Capacity compatibility is necessary but not sufficient: the package must
 * also sell vinyl. Moment fits a 7-inch and is listed as compatible with one,
 * yet checks out as an MP3 only — so telling a customer a 7-inch "fits
 * Moment" would advertise something they cannot buy. Anything customer-facing
 * goes through here.
 */
export const packagesOrderableOnVinylSize = (
  sizeId: VinylSizeId,
  packages: readonly AnyPackage[]
): readonly AnyPackage[] =>
  packagesForVinylSize(sizeId, packages).filter((pkg) =>
    pkg.formats.includes("vinyl")
  );
