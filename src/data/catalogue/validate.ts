/**
 * Catalogue invariants. The generator refuses to write server data, and the
 * build fails, if any of these are broken.
 */

import type { Product } from "./types";

export const validateCatalogue = (products: readonly Product[]): string[] => {
  const errors: string[] = [];
  const productIds = new Set<string>();
  const slugs = new Set<string>();
  const routes = new Set<string>();
  const skus = new Set<string>();

  for (const product of products) {
    const at = `product '${product.id}'`;

    if (productIds.has(product.id)) errors.push(`duplicate product id '${product.id}'`);
    productIds.add(product.id);
    if (slugs.has(product.slug)) errors.push(`duplicate slug '${product.slug}'`);
    slugs.add(product.slug);
    if (product.route !== null) {
      if (routes.has(product.route)) errors.push(`duplicate route '${product.route}'`);
      routes.add(product.route);
    }

    for (const variant of product.variants) {
      const v = `${at} variant '${variant.sku}'`;
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(variant.sku)) errors.push(`${v}: invalid SKU`);
      if (skus.has(variant.sku)) errors.push(`duplicate SKU '${variant.sku}'`);
      skus.add(variant.sku);
      if (variant.price.currency !== "GBP") errors.push(`${v}: missing or unsupported currency`);
      if (!Number.isSafeInteger(variant.price.minor) || variant.price.minor <= 0) {
        errors.push(`${v}: invalid price ${String(variant.price.minor)}`);
      }
      if (variant.fulfilment === "UNCONFIRMED" && product.onlineCheckout) {
        errors.push(`${v}: online checkout requires a confirmed fulfilment`);
      }
      if (variant.priorityReplacementEligible && variant.fulfilment !== "PHYSICAL") {
        errors.push(`${v}: only physical variants can be Priority Replacement eligible`);
      }
      if (variant.priorityReplacementEligible && product.id !== "keepsake") {
        errors.push(`${v}: Priority Replacement eligibility is authorised for Keepsake only`);
      }
    }

    switch (product.commercialModel) {
      case "FIXED":
        if (product.variants.length !== 1) errors.push(`${at}: FIXED needs exactly one variant`);
        if (product.schemaType === "ProductGroup") errors.push(`${at}: FIXED cannot be a ProductGroup`);
        break;
      case "VARIANT_FIXED":
        if (product.variants.length < 2) errors.push(`${at}: VARIANT_FIXED needs two or more variants`);
        if (product.schemaType !== "ProductGroup") errors.push(`${at}: VARIANT_FIXED must be a ProductGroup`);
        if (product.variesBy === null) errors.push(`${at}: VARIANT_FIXED must state variesBy`);
        break;
      case "QUOTED":
        if (product.variants.length !== 0) errors.push(`${at}: QUOTED has fixed-price variants`);
        if (product.onlineCheckout) errors.push(`${at}: QUOTED cannot check out online`);
        if (product.schemaType !== "Service") errors.push(`${at}: QUOTED must be a Service`);
        break;
      case "STORED_VALUE":
        if (product.variants.length !== 0) errors.push(`${at}: STORED_VALUE has fixed-price variants`);
        if (product.storedValue === null) errors.push(`${at}: STORED_VALUE needs its rules`);
        if (product.onlineCheckout) errors.push(`${at}: stored value cannot check out before a ledger exists`);
        break;
    }
    if (product.commercialModel !== "STORED_VALUE" && product.storedValue !== null) {
      errors.push(`${at}: only STORED_VALUE products carry stored-value rules`);
    }
    if (product.onlineCheckout && !product.active) errors.push(`${at}: inactive product offered online`);
    const physical = product.variants.some((v) => v.fulfilment === "PHYSICAL");
    if (physical && product.deliveryClass === null) errors.push(`${at}: a physical product needs a delivery class`);
    if (!physical && product.deliveryClass !== null) errors.push(`${at}: only physical products carry a delivery class`);
  }

  const artwork = products.find((p) => p.id === "artwork-preparation");
  if (artwork && (artwork.variants.length !== 1 || artwork.variants[0].fulfilment !== "SERVICE" || artwork.category !== "ARTWORK_SERVICE")) {
    errors.push("artwork-preparation must be one SERVICE variant in ARTWORK_SERVICE");
  }
  const priority = products.find((p) => p.id === "priority-replacement");
  if (!priority) errors.push("unknown referenced product 'priority-replacement'");
  if (!products.some((p) => p.variants.some((v) => v.priorityReplacementEligible))) {
    errors.push("no variant is eligible for Priority Replacement");
  }

  return errors;
};
