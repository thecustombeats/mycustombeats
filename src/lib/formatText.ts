/**
 * Plain-language descriptions of catalogue variants, shared by the visual
 * selectors, product pages and the personalisation flow. Approximate sizes
 * are not published until they are verified.
 */
import type { Product, Variant } from "../data/catalogue";

export const songsLabel = (count: number | null): string | null =>
  count === null ? null : count === 1 ? "1 song" : `${count} songs`;

/** The short physical description shown under a variant's name. */
export const formatLine = (variant: Variant): string | null => {
  const v = variant.vinyl;
  if (v?.pictureDisc) return `${v.sizeInches}-inch ${v.shape === "HEART" ? "heart-shaped " : ""}picture disc`;
  if (v) return v.discCount === 2 ? `Double ${v.sizeInches}-inch classic black vinyl, gatefold` : `${v.sizeInches}-inch classic black vinyl`;
  if (variant.dimensions && !variant.dimensions.approximate) return `${variant.dimensions.widthInches} × ${variant.dimensions.heightInches} inches`;
  if (variant.fulfilment === "DIGITAL") return "Delivered digitally";
  return null;
};

export const describeVariant = (product: Pick<Product, "name">, variant: Variant): string => {
  const songs = variant.songCount === null ? "" : `, ${variant.songCount === 1 ? "1 song" : `${variant.songCount} songs`}`;
  if (variant.vinyl) {
    const v = variant.vinyl;
    const kind = v.pictureDisc
      ? `${v.sizeInches}-inch ${v.shape === "HEART" ? "heart-shaped" : "round"} picture disc`
      : `${v.discCount === 2 ? "two" : "one"} classic black ${v.sizeInches}-inch vinyl record${v.discCount === 2 ? "s" : ""}${v.gatefold ? " in a gatefold sleeve" : " with a personalised sleeve"}`;
    return `Illustration: ${kind}${songs}`;
  }
  // Approximate sizes are not published until verified.
  if (variant.dimensions && !variant.dimensions.approximate) {
    return `Illustration: ${product.name}, ${variant.dimensions.widthInches} × ${variant.dimensions.heightInches} inches`;
  }
  return `Illustration: ${product.name}${songs}`;
};

