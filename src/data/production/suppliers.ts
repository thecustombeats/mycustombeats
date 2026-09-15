/**
 * MCB™ Supplier Intelligence & Commercial Routing — policy as data (16 September 2026).
 *
 * DECISION SUPPORT, NOT PROCUREMENT. The routing engine (public/api/lib/routing.php)
 * observes, calculates, recommends for review, prepares, validates and notifies.
 * It never purchases, pays, refunds, subscribes or commits MCB to spend: every
 * supplier purchase is authorised by Bella or Lewis with their own code, then
 * placed by a person.
 *
 * NOTHING HERE NAMES A PARTNER, A URL, A COST OR AN ALLOWANCE. Routes, partner
 * identities, expected costs and internal allowances live only in the server's
 * api/data/supplier-routes.json (uploaded, never committed). This file is the
 * non-sensitive registry: which physical SKUs exist, how each family is routed,
 * and the vocabulary of verification, research and manufacturing data.
 *
 * Generated to public/api/data/suppliers.json (INTERNAL, 403 over HTTP) by
 * scripts/generate-catalogue-json.mjs, which checks it against the catalogue.
 */

import { POP_UP_CARD } from "../catalogue/products";

/** The Founders' current supplier-linked physical catalogue: 33 SKUs/configurations. */
export const PHYSICAL_FAMILIES = [
  { family: "VINYL", label: "Vinyl", expected: 6 },
  { family: "FRAME", label: "Vinyl frames / wall art", expected: 5 },
  { family: "CARD", label: "Pop-up cards", expected: 18 },
  { family: "GRAMOPHONE", label: "Gramophones / record players", expected: 3 },
  { family: "PLAQUE", label: "Plaque", expected: 1 },
] as const;
export const EXPECTED_PHYSICAL_SKUS = 33;

/**
 * How a family is routed.
 *   STANDARD                      routes are grouped by verification and destination evidence
 *   MANUAL_AVAILABILITY_CONFIRMED always a person confirms availability, destination and the delivered cost
 *   MANUAL_WHEN_UNVERIFIED        a verified, supported destination may route normally; anything
 *                                 unsupported or unverified goes to a person (never "not available here")
 */
export const ROUTING_MODES = ["STANDARD", "MANUAL_AVAILABILITY_CONFIRMED", "MANUAL_WHEN_UNVERIFIED"] as const;
export type RoutingMode = (typeof ROUTING_MODES)[number];

export interface PhysicalRegistryEntry {
  readonly sku: string;
  readonly family: (typeof PHYSICAL_FAMILIES)[number]["family"];
  /** Customer-facing selling name (public data). */
  readonly label: string;
  /** Songs the customer's product holds (NOT manufacturer programme duration). */
  readonly songs: number | null;
  /** Authoritative public price, in pence (checked against the catalogue). */
  readonly priceMinor: number;
  readonly routingMode: RoutingMode;
  /** Non-identifying grouping of SKUs expected to share a production partner. */
  readonly partnerGroup: string | null;
  /** Artwork templates and capacity the manufacturing data needs (ids from artwork.ts / creative.ts). */
  readonly manufacturing: { readonly artwork: readonly string[]; readonly capacity: boolean };
  /** The actual delivered cost must be confirmed and recorded before a purchase can be authorised. */
  readonly deliveredCostConfirmationRequired: boolean;
  readonly notes: readonly string[];
}

export const PHYSICAL_REGISTRY: readonly PhysicalRegistryEntry[] = [
  { sku: "journey-12", family: "VINYL", label: "Journey Double 12\" Gatefold", songs: 12, priceMinor: 34900, routingMode: "STANDARD", partnerGroup: "VINYL_BLACK", manufacturing: { artwork: ["GATEFOLD_12_DOUBLE"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  { sku: "journey-6", family: "VINYL", label: "Journey 12\" Vinyl", songs: 6, priceMinor: 19900, routingMode: "STANDARD", partnerGroup: "VINYL_BLACK", manufacturing: { artwork: ["SLEEVE_12_FRONT", "SLEEVE_12_BACK"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  { sku: "keepsake-12-picture-disc", family: "VINYL", label: "Keepsake 12\" Picture Disc", songs: 4, priceMinor: 14999, routingMode: "STANDARD", partnerGroup: "VINYL_PICTURE", manufacturing: { artwork: ["PICTURE_DISC_12"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  { sku: "keepsake-10-picture-disc", family: "VINYL", label: "Keepsake 10\" Picture Disc", songs: 3, priceMinor: 13999, routingMode: "STANDARD", partnerGroup: "VINYL_PICTURE", manufacturing: { artwork: ["PICTURE_DISC_10"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  { sku: "keepsake-10-heart-picture-disc", family: "VINYL", label: "Keepsake Heart Picture Disc", songs: 1, priceMinor: 12999, routingMode: "STANDARD", partnerGroup: "VINYL_PICTURE", manufacturing: { artwork: ["PICTURE_DISC_HEART"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  { sku: "keepsake-7-picture-disc", family: "VINYL", label: "Keepsake 7\" Picture Disc", songs: 1, priceMinor: 9900, routingMode: "STANDARD", partnerGroup: "VINYL_PICTURE", manufacturing: { artwork: ["PICTURE_DISC_7"], capacity: true }, deliveredCostConfirmationRequired: false, notes: [] },
  ...(["10x15", "12x18", "14x21", "16x24", "20x30"] as const).map((size): PhysicalRegistryEntry => ({
    sku: `lyrics-frame-${size}`, family: "FRAME", label: `Lyrics Frame ${size.replace("x", " × ")}`, songs: null,
    priceMinor: { "10x15": 4999, "12x18": 6999, "14x21": 7999, "16x24": 8999, "20x30": 9999 }[size],
    routingMode: "STANDARD", partnerGroup: "FRAME", manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: false,
    notes: ["A direct partner supplying the same premium product to a supported destination is reviewed first.", "Founders to confirm these five configurations are the frames the partner routes supply."],
  })),
  { sku: "vintage-smartphone-gramophone", family: "GRAMOPHONE", label: "Vintage Smartphone Gramophone", songs: null, priceMinor: 10000, routingMode: "MANUAL_AVAILABILITY_CONFIRMED", partnerGroup: null, manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: false, notes: ["Marketplace availability, destination and shipping vary: a person confirms them before purchase."] },
  { sku: "portable-suitcase-record-player", family: "GRAMOPHONE", label: "Portable Suitcase Record Player", songs: null, priceMinor: 20000, routingMode: "MANUAL_AVAILABILITY_CONFIRMED", partnerGroup: null, manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: false, notes: ["Marketplace availability, destination and shipping vary: a person confirms them before purchase."] },
  { sku: "antique-brass-gramophone", family: "GRAMOPHONE", label: "Antique Brass Gramophone", songs: null, priceMinor: 100000, routingMode: "MANUAL_AVAILABILITY_CONFIRMED", partnerGroup: null, manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: true, notes: ["High value: the actual delivered cost to the customer's destination must be confirmed and recorded before purchase.", "International shipping from a marketplace is never assumed."] },
  // The 18 pop-up cards: product data is the Founders' (catalogue); routes stay VERIFICATION_REQUIRED until evidenced.
  ...POP_UP_CARD.variants.map((v): PhysicalRegistryEntry => ({
    sku: v.sku, family: "CARD", label: v.label, songs: null, priceMinor: v.price.minor,
    routingMode: "MANUAL_AVAILABILITY_CONFIRMED", partnerGroup: "CARD", manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: false,
    notes: ["Marketplace availability and delivery vary: a person confirms them before purchase.", "Only an appropriate alternative card may be substituted, recorded in full."],
  })),
  { sku: "personalised-music-plaque", family: "PLAQUE", label: "Personalised Music Plaque (8 × 12)", songs: 1, priceMinor: 4999, routingMode: "MANUAL_WHEN_UNVERIFIED", partnerGroup: null, manufacturing: { artwork: [], capacity: false }, deliveredCostConfirmationRequired: false, notes: ["8 × 12, associated with one song. It does not play music.", "Destinations without verified evidence go to manual fulfilment review; customers are never told a country-only restriction."] },
];

/**
 * Pop-up cards: the Founders' 18 listings are catalogued (src/data/catalogue,
 * product "pop-up-card"). These are the only authorised price points; no
 * shipping or bundle discount is invented. PRODUCT data is known; ROUTE
 * verification is separate and stays VERIFICATION_REQUIRED until evidenced.
 */
export const CARD_PRICE_POINTS = [
  { tier: "SINGLE", label: "Most single cards", priceMinor: 4999 },
  { tier: "LARGE_ANNIVERSARY", label: "Large Anniversary", priceMinor: 6999 },
  { tier: "BIRTHDAY_AUTO_PLAY", label: "Birthday Auto-Play", priceMinor: 1999 },
  { tier: "FOUR_PACK", label: "4-packs", priceMinor: 7999 },
  { tier: "EIGHT_PACK", label: "8-pack", priceMinor: 12999 },
] as const;

/** The only substitution rule: an appropriate alternative card, recorded in full. Never other products. */
export const CARD_ALTERNATIVE_RECORD = ["ORIGINAL_SKU", "ALTERNATIVE", "REASON", "AUTHORITY", "CUSTOMER_IMPACT"] as const;
export const CARD_ALTERNATIVE_IMPACTS = ["NO_MATERIAL_DIFFERENCE", "CUSTOMER_TOLD", "CUSTOMER_AGREED"] as const;

/**
 * Founder decisions (16 September 2026).
 *   Route freshness: 30 days. A verified route older than this is STALE
 *   (REVERIFY ROUTE); fulfilment.route_freshness_days may set another period.
 *   New-sale safety: REQUIRED. A NEW payment is held for MCB to confirm
 *   delivery where the recorded evidence is not enough to fulfil safely.
 *   Paid orders are never cancelled or repriced.
 */
export const ROUTE_FRESHNESS_DAYS = 30;
export const NEW_SALE_SAFETY = "REQUIRED" as const;

/** Route verification. VERIFIED needs a source and a verification date; STALE is calculated. */
export const VERIFICATION_STATES = ["VERIFIED", "PARTIALLY_VERIFIED", "VERIFICATION_REQUIRED", "STALE", "UNSUPPORTED", "SUSPENDED"] as const;

export const ROUTE_TYPES = ["DIRECT_MANUFACTURER", "DIRECT_RETAILER", "MARKETPLACE", "MANUAL"] as const;

/** Availability as last checked. UNKNOWN is never AVAILABLE. */
export const AVAILABILITY_STATES = ["AVAILABLE", "UNAVAILABLE", "UNKNOWN"] as const;

/**
 * Known issues recorded on a route. The first three hold a route at
 * VERIFICATION_REQUIRED until someone re-verifies it.
 */
export const ROUTE_ISSUES = [
  { code: "GEOGRAPHIC_INCONSISTENCY", holdsVerification: true, label: "Where it ships from or to has been inconsistent" },
  { code: "LISTING_CHANGED", holdsVerification: true, label: "The listing changed" },
  { code: "TERMS_CHANGED", holdsVerification: true, label: "The partner's terms changed" },
  { code: "PRICE_STALE", holdsVerification: false, label: "The price needs checking again" },
  { code: "SHIPPING_QUOTE_MISSING", holdsVerification: false, label: "No shipping quote has been recorded" },
] as const;

/** SUPPLIER DATA NEEDS REVIEW — a research list, not procurement. */
export const RESEARCH_ITEM_KINDS = [
  { kind: "SHIPPING_QUOTE_MISSING", label: "Shipping quote missing" },
  { kind: "DESTINATION_UNVERIFIED", label: "Destination unverified" },
  { kind: "PRICE_STALE", label: "Price stale" },
  { kind: "PRODUCT_UNAVAILABLE", label: "Product unavailable" },
  { kind: "TEMPLATE_MISSING", label: "Template missing" },
  { kind: "CAPACITY_MISSING", label: "Capacity missing" },
  { kind: "TERMS_CHANGED", label: "Terms changed" },
  { kind: "LISTING_CHANGED", label: "Marketplace listing changed" },
  { kind: "FALLBACK_ABSENT", label: "No fallback route" },
  { kind: "REVERIFY_ROUTE", label: "Reverify route" },
  { kind: "VERIFICATION_REQUIRED", label: "Route needs verification" },
  { kind: "NO_ROUTE", label: "No route recorded" },
  { kind: "COST_MISSING", label: "Expected cost missing" },
  { kind: "FOUNDER_DATA_REQUIRED", label: "Founder data required" },
] as const;

/** MANUFACTURING DATA REQUIRED — production specifications, kept apart from partner verification. */
export const MANUFACTURING_ITEM_KINDS = [
  { kind: "PROGRAMME_DURATION", label: "Vinyl programme duration" },
  { kind: "SAFE_AREA", label: "Safe areas" },
  { kind: "TRIM", label: "Trim" },
  { kind: "DISC_PIXEL_CANVAS", label: "Disc pixel canvas" },
  { kind: "CENTRE_HOLE", label: "Centre hole" },
  { kind: "HEART_DIELINE", label: "Heart dieline" },
  { kind: "GATEFOLD_TEMPLATE", label: "Gatefold template" },
  { kind: "OTHER_SPECIFICATION", label: "Other production specification" },
] as const;

/** Transparent scorecard components. There is no combined score. */
export const SCORECARD_COMPONENTS = [
  { component: "VERIFICATION_QUALITY", label: "Verification quality" },
  { component: "COST_COMPLETENESS", label: "Cost completeness" },
  { component: "DESTINATION_CERTAINTY", label: "Destination certainty" },
  { component: "TRACKING_EVIDENCE", label: "Tracking evidence" },
  { component: "FULFILMENT_RELIABILITY", label: "Fulfilment reliability" },
  { component: "CUSTOMER_PROBLEM_RATE", label: "Customer-problem rate" },
  { component: "SAMPLE_SIZE", label: "Sample size" },
] as const;

/** Below this many recorded partner orders a route's evidence is INSUFFICIENT DATA (a display safeguard, not statistics). */
export const ROUTE_INSUFFICIENT_DATA_BELOW = 1;

export const RECOMMENDATION_LABEL = "RECOMMENDED FOR REVIEW";
export const RECOMMENDATION_NOTE = "A recommendation is not an authorisation. Nothing is purchased: Bella or Lewis authorises, then a person places the order.";
export const FORBIDDEN_RECOMMENDATION_PHRASES = ["auto selected", "auto-selected", "automatically selected", "selected automatically"] as const;

/** Never promised to a customer unless verified for that route and destination (and not in this release at all). */
export const FORBIDDEN_DELIVERY_PROMISES = ["duties included", "tax included", "worldwide delivery", "ships worldwide", "india only"] as const;

/** The approved customer meaning. */
export const CUSTOMER_PROMISE = "MCB manages your order from memory to delivery.";

/** Founder-friendly Command Centre tiles (Suppliers). */
export const SUPPLIER_OVERVIEW_TILES = [
  { key: "routes_ready", label: "Routes ready" },
  { key: "routes_needing_verification", label: "Routes needing verification" },
  { key: "products_without_safe_route", label: "Products with no safe route" },
  { key: "commercial_exceptions", label: "Commercial exceptions" },
  { key: "manufacturing_data_missing", label: "Manufacturing data missing" },
  { key: "awaiting_founder_authorisation", label: "Supplier orders awaiting founder approval" },
  { key: "authorised_not_placed", label: "Authorised but not placed" },
  { key: "being_made", label: "Orders being made" },
  { key: "supplier_delivery_problems", label: "Supplier / delivery problems" },
] as const;

/** Why a staff member chose a route other than the one recommended for review. */
export const ROUTE_DEVIATION_REASONS = ["DESTINATION_EVIDENCE", "AVAILABILITY", "DELIVERY_TIME", "QUALITY", "CUSTOMER_REQUIREMENT", "COST_CONFIRMED", "OTHER"] as const;
