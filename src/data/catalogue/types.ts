/**
 * MCB CANONICAL CATALOGUE — types.
 *
 * Product → Variant → Money. Every price MCB publishes or charges is a
 * `Money` on a `Variant`, in integer pence. See `products.ts` for the data and
 * `validate.ts` for the rules the build enforces.
 */

import type { DeliveryBasis } from "../legal/delivery";

/** GBP is the only commercial currency. Other currencies are display estimates. */
export type Currency = "GBP";

/** An amount in integer minor units (pence). 1500 = £15.00. */
export interface Money {
  readonly currency: Currency;
  readonly minor: number;
}

/**
 * How a product is bought.
 *
 * FIXED          one variant, one published price
 * VARIANT_FIXED  two or more variants, each with its own published price
 * QUOTED         no public price; scoped and quoted individually
 * STORED_VALUE   a balance bought and spent later (gift voucher / account credit)
 */
export type CommercialModel = "FIXED" | "VARIANT_FIXED" | "QUOTED" | "STORED_VALUE";

export type Category =
  /** A personalised song product — the thing an order is built around. */
  | "SONG_EXPERIENCE"
  | "COMMISSION"
  | "LIVE_PERFORMANCE"
  | "PERSONALISED_DECOR"
  | "PLAYER"
  | "PROTECTION"
  | "EDUCATION"
  | "GIFT";

/**
 * How a variant reaches the customer.
 *
 * UNCONFIRMED is allowed only on products that cannot be ordered online; the
 * validator refuses it anywhere a server could be asked to fulfil it.
 */
export type Fulfilment = "DIGITAL" | "PHYSICAL" | "SERVICE" | "UNCONFIRMED";

/**
 * What kind of parcel a physical product travels as.
 *
 * Only the class is public knowledge. Which specialist partner makes it, how
 * its delivery is priced and whether availability must be confirmed first
 * live on the server (`api/lib/delivery.php`), never in this bundle.
 */
export type DeliveryClass = "VINYL" | "FRAME" | "PLAQUE" | "PLAYER" | "CARD";

export type SchemaType = "Product" | "ProductGroup" | "Service";

export type VinylSize = 7 | 10 | 12;
export type VinylShape = "ROUND" | "HEART";

export interface VinylSpec {
  /** True for a picture disc. Journey's standard records are `false`. */
  readonly pictureDisc: boolean;
  readonly sizeInches: VinylSize;
  readonly shape: VinylShape;
  /** Number of records. The 12-song Journey is a double album. */
  readonly discCount: 1 | 2;
  readonly gatefold: boolean;
}

export interface Dimensions {
  readonly widthInches: number;
  readonly heightInches: number;
  /** True where the size is an approximate public description. */
  readonly approximate: boolean;
}

export interface Variant {
  /** Globally unique. Stored on every order line and sent to analytics. */
  readonly sku: string;
  /** Full customer-facing name, e.g. "12-inch Picture Disc Keepsake". */
  readonly name: string;
  /** Name within its product, e.g. "12-inch Picture Disc". */
  readonly label: string;
  readonly price: Money;
  readonly songCount: number | null;
  readonly fulfilment: Fulfilment;
  /** `null` when the variant contains no record. */
  readonly vinyl: VinylSpec | null;
  readonly artworkIncluded: boolean;
  readonly masteringIncluded: boolean;
  readonly dimensions: Dimensions | null;
  /** What this variant includes, as approved customer-facing lines. */
  readonly features: readonly string[];
  /** Whether MCB Priority Replacement™ may be added for this variant. */
  readonly priorityReplacementEligible: boolean;
}

export type ProductId =
  | "moment"
  | "keepsake"
  | "journey"
  | "bespoke"
  | "mcb-live"
  | "personalised-music-plaque"
  | "lyrics-frame"
  | "vintage-smartphone-gramophone"
  | "antique-brass-gramophone"
  | "portable-suitcase-record-player"
  | "priority-replacement"
  | "cruise-ship-dj-bible"
  | "gift-voucher";

export interface StoredValueRules {
  readonly currency: Currency;
  readonly minimumMinor: number;
  readonly partialRedemption: boolean;
  readonly remainingBalance: boolean;
  readonly reloadable: boolean;
  readonly giftPurchase: boolean;
  readonly referenceDigits: number;
  readonly cashRedemption: boolean;
}

export interface Product {
  readonly id: ProductId;
  readonly slug: string;
  readonly name: string;
  /** The approved one-line proposition. */
  readonly positioning: string;
  readonly shortDescription: string;
  readonly commercialModel: CommercialModel;
  readonly category: Category;
  /** Commercially available now. */
  readonly active: boolean;
  /** May be presented on the public website. */
  readonly public: boolean;
  /** May be placed through MCB's own order and checkout path. */
  readonly onlineCheckout: boolean;
  readonly requiresPersonalisation: boolean;
  /** Canonical public path, or null when the product has no page of its own. */
  readonly route: string | null;
  /** Set on every product with a physical variant; null otherwise. */
  readonly deliveryClass: DeliveryClass | null;
  /** The customer-facing timing line, or null when none is approved. */
  readonly turnaround: { readonly basis: DeliveryBasis; readonly label: string } | null;
  readonly revisions: string | null;
  readonly schemaType: SchemaType;
  /** The variant property a ProductGroup varies by, for structured data. */
  readonly variesBy: "size" | "songCount" | "level" | null;
  readonly analyticsCategory: string;
  /** Public image path, or null until an approved image is assigned. */
  readonly image: string | null;
  readonly imageAlt: string | null;
  /** Statements that must accompany the product wherever it is sold. */
  readonly disclosures: readonly string[];
  readonly cta: string;
  /** Empty for QUOTED and STORED_VALUE. */
  readonly variants: readonly Variant[];
  readonly storedValue: StoredValueRules | null;
}
