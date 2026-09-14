/**
 * MCB canonical catalogue — lookups, formatting and the order preview.
 *
 * The preview here is for display only. The server prices every order again
 * from its generated copy of this catalogue and never accepts a total.
 */

import { ORDER_LIMITS, PRODUCTS } from "./products";
import type { Money, Product, ProductId, Variant } from "./types";

export * from "./types";
export * from "./products";
export { validateCatalogue } from "./validate";

export const getProduct = (id: string): Product | undefined =>
  PRODUCTS.find((product) => product.id === id);

export interface VariantRef {
  product: Product;
  variant: Variant;
}

const BY_SKU: ReadonlyMap<string, VariantRef> = new Map(
  PRODUCTS.flatMap((product) => product.variants.map((variant) => [variant.sku, { product, variant }] as const))
);

export const getVariant = (sku: string): VariantRef | undefined => BY_SKU.get(sku);

export const requireProduct = (id: ProductId): Product => {
  const product = getProduct(id);
  if (!product) throw new Error(`Unknown catalogue product '${id}'`);
  return product;
};

/** Products that may be shown on the public website. */
export const publicProducts = (): readonly Product[] =>
  PRODUCTS.filter((product) => product.active && product.public);

/** The song experiences an order is built around. */
export const songExperiences = (): readonly Product[] =>
  publicProducts().filter((product) => product.category === "SONG_EXPERIENCE");

/** Products that may be added alongside a song experience in the order form. */
export const addOnProducts = (): readonly Product[] =>
  publicProducts().filter(
    (product) =>
      product.onlineCheckout &&
      product.category !== "SONG_EXPERIENCE" &&
      product.category !== "PROTECTION"
  );

export const isQuoted = (product: Pick<Product, "commercialModel">): boolean =>
  product.commercialModel === "QUOTED";

export const hasPublicPrice = (product: Product): boolean =>
  (product.commercialModel === "FIXED" || product.commercialModel === "VARIANT_FIXED") &&
  product.variants.length > 0;

/* ------------------------------------------------------------------ */
/* Money                                                               */
/* ------------------------------------------------------------------ */

/** "£15", "£149.99", "£1,000". Whole pounds drop their pence. */
export const formatMinor = (minor: number): string => {
  const pounds = Math.trunc(minor / 100);
  const pence = minor % 100;
  const whole = pounds.toLocaleString("en-GB");
  return pence === 0 ? `£${whole}` : `£${whole}.${String(pence).padStart(2, "0")}`;
};

export const formatMoney = (money: Money): string => formatMinor(money.minor);

/** Pounds as a JSON-LD decimal string, e.g. "149.99". Exact, never float-derived. */
export const minorToDecimal = (minor: number): string =>
  `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, "0")}`;

/** Lowest variant price, for products presented as a family. */
export const lowestPrice = (product: Product): Money | null =>
  product.variants.length === 0
    ? null
    : product.variants.reduce((low, v) => (v.price.minor < low.minor ? v.price : low), product.variants[0].price);

/**
 * How a product's price is described in one line.
 * FIXED "£15"; VARIANT_FIXED "From £99"; QUOTED "Individually quoted".
 */
export const priceSummary = (product: Product): string => {
  if (product.commercialModel === "QUOTED") return "Individually quoted";
  const low = lowestPrice(product);
  if (!low) return "";
  return product.commercialModel === "VARIANT_FIXED" ? `From ${formatMoney(low)}` : formatMoney(low);
};

/* ------------------------------------------------------------------ */
/* Order lines — preview                                               */
/* ------------------------------------------------------------------ */

export interface OrderLineRequest {
  sku: string;
  quantity: number;
}

export interface PricedLine {
  sku: string;
  productId: ProductId;
  name: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
  fulfilment: Variant["fulfilment"];
  physical: boolean;
}

export type OrderPreview =
  | { ok: true; lines: readonly PricedLine[]; totalMinor: number; requiresShipping: boolean }
  | { ok: false; reason: string };

export const PRIORITY_REPLACEMENT_SKU = "priority-replacement";

/**
 * Prices lines using the same rules the server enforces
 * (`public/api/lib/catalogue.php`). Integer pence throughout.
 */
export const previewOrder = (requests: readonly OrderLineRequest[]): OrderPreview => {
  if (requests.length === 0) return { ok: false, reason: "empty" };
  if (requests.length > ORDER_LIMITS.maxLines) return { ok: false, reason: "too_many_lines" };

  const seen = new Set<string>();
  const lines: PricedLine[] = [];
  let eligibleUnits = 0;
  let priorityUnits = 0;
  let hasSongExperience = false;

  for (const request of requests) {
    if (seen.has(request.sku)) return { ok: false, reason: "duplicate_sku" };
    seen.add(request.sku);
    const ref = getVariant(request.sku);
    if (!ref || !ref.product.active || !ref.product.onlineCheckout) return { ok: false, reason: "unknown_sku" };
    if (!Number.isSafeInteger(request.quantity) || request.quantity < 1 || request.quantity > ORDER_LIMITS.maxQuantityPerLine) {
      return { ok: false, reason: "invalid_quantity" };
    }
    if (ref.product.category === "SONG_EXPERIENCE") hasSongExperience = true;
    if (ref.variant.priorityReplacementEligible) eligibleUnits += request.quantity;
    if (ref.variant.sku === PRIORITY_REPLACEMENT_SKU) priorityUnits += request.quantity;
    lines.push({
      sku: ref.variant.sku,
      productId: ref.product.id,
      name: ref.variant.name,
      quantity: request.quantity,
      unitMinor: ref.variant.price.minor,
      lineMinor: ref.variant.price.minor * request.quantity,
      fulfilment: ref.variant.fulfilment,
      physical: ref.variant.fulfilment === "PHYSICAL",
    });
  }

  if (!hasSongExperience) return { ok: false, reason: "no_song_experience" };
  if (priorityUnits > eligibleUnits) return { ok: false, reason: "priority_replacement_ineligible" };

  return {
    ok: true,
    lines,
    totalMinor: lines.reduce((total, line) => total + line.lineMinor, 0),
    requiresShipping: lines.some((line) => line.physical),
  };
};
