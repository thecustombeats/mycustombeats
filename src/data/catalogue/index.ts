/**
 * The MCB product catalogue, assembled.
 *
 * `CATALOGUE` is the display order for every physical family. Import from
 * here rather than from the individual modules unless you need a specific
 * product by name.
 */

import { VINYL_FAMILY } from "./vinyl";
import { GIFT_POP_UP_CARD_FAMILY } from "./giftCards";
import { relatedFamilyIds } from "./relationships";
import {
  CD_FAMILY,
  DIGITAL_PLAYER_FAMILY,
  FRAME_FAMILY,
  LYRICS_FRAME_FAMILY,
  MEMORY_BOX_FAMILY,
  PHONE_GRAMOPHONE_FAMILY,
  PLAQUE_FAMILY,
  PORTABLE_GRAMOPHONE_FAMILY,
  VINTAGE_COLLECTION_FAMILY,
} from "./keepsakeProducts";
import type {
  CatalogueProduct,
  ProductFamily,
  ProductFamilyId,
} from "./types";

export * from "./types";
export * from "./vinyl";
export * from "./giftCards";
export * from "./keepsakeProducts";
export * from "./relationships";
export * from "./commercial";

/** Every family, in the order the site presents them. */
export const CATALOGUE: readonly ProductFamily[] = [
  VINYL_FAMILY,
  CD_FAMILY,
  LYRICS_FRAME_FAMILY,
  FRAME_FAMILY,
  PLAQUE_FAMILY,
  MEMORY_BOX_FAMILY,
  GIFT_POP_UP_CARD_FAMILY,
  DIGITAL_PLAYER_FAMILY,
  PORTABLE_GRAMOPHONE_FAMILY,
  PHONE_GRAMOPHONE_FAMILY,
  VINTAGE_COLLECTION_FAMILY,
];

export const getFamily = (
  id: ProductFamilyId
): ProductFamily | undefined => CATALOGUE.find((family) => family.id === id);

/** Families with at least one approved product. */
export const stockedFamilies = (): readonly ProductFamily[] =>
  CATALOGUE.filter((family) => family.products.length > 0);

export const ALL_PRODUCTS: readonly CatalogueProduct[] = CATALOGUE.flatMap(
  (family) => family.products
);

export const getProduct = (id: string): CatalogueProduct | undefined =>
  ALL_PRODUCTS.find((product) => product.id === id);

/**
 * Resolves a family's declared relations to the families themselves.
 *
 * Related families are returned even when they hold no products — Digital
 * Players are a real part of the vinyl ecosystem with nothing catalogued yet,
 * and naming them is honest where inventing a product to link to would not be.
 */
export const relatedFamilies = (
  familyId: ProductFamilyId
): readonly ProductFamily[] =>
  relatedFamilyIds(familyId).flatMap((id) => {
    const family = getFamily(id);
    return family ? [family] : [];
  });

/** Resolves a product's `compatibleProducts` ids to products. */
export const compatibleProducts = (
  product: CatalogueProduct
): readonly CatalogueProduct[] =>
  (product.compatibleProducts ?? []).flatMap((id) => {
    const match = getProduct(id);
    return match ? [match] : [];
  });
