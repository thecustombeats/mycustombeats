/**
 * The homepage keepsake band — a derived view, not a second catalogue.
 *
 * This file used to hold its own list of physical products, which meant the
 * homepage, the Products page and the checkout formats could each describe the
 * ecosystem differently. It now projects `data/catalogue` down to the flat
 * shape the homepage band renders, so there is exactly one place a product
 * name, description or photograph is written.
 *
 * Families with no approved product yet (Digital Players, Portable
 * Gramophones, the Mobile-phone Gramophone, Frames) are excluded: a showcase
 * tile for something with no photograph, price or specification would be an
 * empty promise. They are still part of the catalogue and still appear as
 * related products wherever a relationship is declared.
 */

import { CATALOGUE } from "./catalogue";
import type { ProductFamilyId } from "./catalogue";

export interface Keepsake {
  id: ProductFamilyId;
  title: string;
  description: string;
  /** Public path to the product photograph. Omitted when none exists yet. */
  image?: string;
  /** Overrides the default alt text (the title) where more detail helps. */
  alt?: string;
  /** True when the item is also selectable as a delivery format at checkout. */
  isCheckoutFormat: boolean;
}

/**
 * Homepage order, which is not catalogue order: the two formats a customer can
 * actually check out with lead, then the pieces built around them.
 */
const SHOWCASE_ORDER: readonly ProductFamilyId[] = [
  "vinyl",
  "cd",
  "lyrics-frame",
  "plaque",
  "memory-box",
  "gift-pop-up-card",
];

export const KEEPSAKES: readonly Keepsake[] = SHOWCASE_ORDER.flatMap((id) => {
  const family = CATALOGUE.find((candidate) => candidate.id === id);
  if (!family || family.products.length === 0) return [];

  return [
    {
      id: family.id,
      title: family.name,
      description: family.description,
      ...(family.image ? { image: family.image } : {}),
      ...(family.alt ? { alt: family.alt } : {}),
      isCheckoutFormat: family.isCheckoutFormat,
    },
  ];
});
