/**
 * What the customer has chosen in the order form, as catalogue SKUs and
 * integer quantities — and nothing else.
 *
 * There is no price in this state. Every amount shown is read from the
 * catalogue by `previewOrder`, and the server prices the same lines again when
 * the order is saved.
 */

import {
  ORDER_LIMITS,
  PRIORITY_REPLACEMENT_SKU,
  addOnProducts,
  getProduct,
  getVariant,
  previewOrder,
  type OrderLineRequest,
  type OrderPreview,
  type Product,
} from "../data/catalogue";

export interface AddOnSelection {
  productId: string;
  sku: string;
  quantity: number;
}

export interface OrderSelection {
  productId: string;
  /** Empty until a variant is chosen. */
  sku: string;
  quantity: number;
  addOns: readonly AddOnSelection[];
  priorityReplacementQuantity: number;
}

export const EMPTY_SELECTION: OrderSelection = {
  productId: "",
  sku: "",
  quantity: 1,
  addOns: [],
  priorityReplacementQuantity: 0,
};

/**
 * Products a customer may order more than one of in a single order, from this
 * form. Keepsakes are bought one per memory or per day of a journey, with no
 * MCB maximum; the per-line limit is a technical request limit only.
 */
export const MULTI_UNIT_PRODUCT_IDS: ReadonlySet<string> = new Set(["keepsake"]);

export const MAX_UNITS_PER_LINE = ORDER_LIMITS.maxQuantityPerLine;

/** The variant to preselect: the only one for a single-variant product. */
export const defaultSkuFor = (productId: string): string => {
  const product = getProduct(productId);
  return product && product.variants.length === 1 ? product.variants[0].sku : "";
};

/** Starts a selection for a product, keeping add-ons that still apply. */
export const chooseProduct = (
  current: OrderSelection,
  productId: string,
  sku: string = defaultSkuFor(productId)
): OrderSelection => {
  const variant = getVariant(sku);
  const validSku = variant && variant.product.id === productId ? sku : defaultSkuFor(productId);
  return {
    ...current,
    productId,
    sku: validSku,
    quantity: MULTI_UNIT_PRODUCT_IDS.has(productId) ? current.quantity : 1,
    priorityReplacementQuantity: 0,
  };
};

/** How many Priority Replacements this selection may carry. */
export const priorityReplacementLimit = (selection: OrderSelection): number => {
  const variant = selection.sku ? getVariant(selection.sku) : undefined;
  return variant?.variant.priorityReplacementEligible ? selection.quantity : 0;
};

/** The request lines for `/api/order`. */
export const selectionLines = (selection: OrderSelection): OrderLineRequest[] => {
  if (!selection.sku) return [];
  const lines: OrderLineRequest[] = [{ sku: selection.sku, quantity: selection.quantity }];
  for (const addOn of selection.addOns) lines.push({ sku: addOn.sku, quantity: addOn.quantity });
  const priority = Math.min(selection.priorityReplacementQuantity, priorityReplacementLimit(selection));
  if (priority > 0) lines.push({ sku: PRIORITY_REPLACEMENT_SKU, quantity: priority });
  return lines;
};

export const previewSelection = (selection: OrderSelection): OrderPreview =>
  previewOrder(selectionLines(selection));

/** Add-ons that may be offered in the order form. */
export const orderAddOns = (): readonly Product[] => addOnProducts();
