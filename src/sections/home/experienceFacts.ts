/**
 * Plain-language, at-a-glance facts about the four primary experiences, for
 * the homepage and navigation. Every number here is derived from the
 * canonical catalogue; nothing commercial is typed in this file.
 */
import { BESPOKE, JOURNEY, KEEPSAKE, MOMENT, lowestPrice, priceSummary, type Product } from "../../data/catalogue";

/** The four primary experiences, in display order. */
export const PRIMARY_EXPERIENCES: readonly Product[] = [MOMENT, KEEPSAKE, JOURNEY, BESPOKE];

/** "1 song", "1–4 songs", "6 or 12 songs" — from the variants' song counts. */
export const songRange = (product: Product): string | null => {
  const counts = [...new Set(product.variants.flatMap((v) => (v.songCount === null ? [] : [v.songCount])))].sort(
    (a, b) => a - b
  );
  if (counts.length === 0) return null;
  const unit = counts[counts.length - 1] === 1 ? "song" : "songs";
  if (counts.length === 1) return `${counts[0]} ${unit}`;
  if (counts.length === 2) return `${counts[0]} or ${counts[1]} ${unit}`;
  return `${counts[0]}–${counts[counts.length - 1]} ${unit}`;
};

/** Record sizes offered, e.g. "7, 10 or 12-inch, or heart-shaped". */
export const pictureDiscSizes = (product: Product): string | null => {
  const discs = product.variants.flatMap((v) => (v.vinyl?.pictureDisc ? [v.vinyl] : []));
  if (discs.length === 0) return null;
  const round = [...new Set(discs.filter((d) => d.shape === "ROUND").map((d) => d.sizeInches))].sort((a, b) => a - b);
  const heart = discs.some((d) => d.shape === "HEART");
  const sizes =
    round.length > 1 ? `${round.slice(0, -1).join(", ")} or ${round[round.length - 1]}-inch` : round.length ? `${round[0]}-inch` : "";
  return [sizes, heart ? "heart-shaped" : ""].filter(Boolean).join(", or ");
};

/** Short price line from the catalogue: fixed, "From …" or "Individually quoted". */
export const priceLine = (product: Product): string => priceSummary(product);

/** The lowest price in pounds for <Price>, or null for quoted products. */
export const lowestPounds = (product: Product): number | null => {
  if (product.commercialModel === "QUOTED") return null;
  const low = lowestPrice(product);
  return low ? low.minor / 100 : null;
};

/** Where each experience's main homepage action leads. */
export const EXPERIENCE_HREF: Readonly<Record<string, string>> = {
  [MOMENT.id]: `/create?product=${MOMENT.id}`,
  [KEEPSAKE.id]: KEEPSAKE.route ?? "/keepsake",
  [JOURNEY.id]: JOURNEY.route ?? "/journey",
  [BESPOKE.id]: BESPOKE.route ?? "/bespoke",
};
