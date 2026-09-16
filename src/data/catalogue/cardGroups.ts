import { POP_UP_CARD } from "./products";
import type { Variant } from "./types";

/**
 * THE 18 POP-UP CARDS, GROUPED BY OCCASION.
 *
 * All eighteen are real, Founder-decided products at Founder-decided prices,
 * and none is hidden here. What changed is the presentation: both the products
 * page and the order form showed a flat list of eighteen near-identical rows,
 * so a customer looking for a birthday card had to read the whole wall, and
 * four flower packs distinguished only by a word and a price sat among them.
 *
 * The grouping is derived from the SKUs the catalogue already declares — it
 * invents no product, no name, no price and no image. Adding a card to
 * `POP_UP_CARD.variants` without listing it here is a build-time failure
 * (`validateCardGroups`), so the two can never drift apart.
 */
export interface CardGroup {
  readonly id: string;
  readonly label: string;
  /** One line of customer-facing help, so a group is more than a bucket. */
  readonly hint: string;
  readonly skus: readonly string[];
}

const sku = (slug: string) => `pop-up-card-${slug}`;

export const CARD_GROUPS: readonly CardGroup[] = [
  {
    id: "birthdays",
    label: "Birthdays & congratulations",
    hint: "For the day itself, or the news worth marking.",
    skus: [
      sku("birthday-candles-music"),
      sku("birthday-auto-play-music"),
      sku("birthday-tropical-bird-cage"),
      sku("congratulations-flowers"),
    ],
  },
  {
    id: "love",
    label: "Anniversaries, weddings & Valentine's",
    hint: "The years together, the day itself, and the one in February.",
    skus: [
      sku("anniversary-gold-white"),
      sku("anniversary-large"),
      sku("wedding"),
      sku("valentines-love-tree-hearts"),
    ],
  },
  {
    id: "thank-you",
    label: "Thank you & Mother's Day",
    hint: "When the card is the whole point.",
    skus: [sku("thank-you-flowers"), sku("mothers-day-flowers")],
  },
  {
    id: "seasonal",
    label: "Christmas & seasonal",
    hint: "Christmas, Halloween and Thanksgiving.",
    skus: [sku("christmas-tree"), sku("halloween-pumpkin-flowers"), sku("thanksgiving-flowers")],
  },
  {
    id: "voyage",
    label: "Cruise & voyage",
    hint: "For a memory made at sea.",
    skus: [sku("cruise-voyage-vessel")],
  },
  {
    id: "packs",
    label: "Flower card packs",
    hint: "Several cards in one pack, for a table or a group of guests.",
    skus: [
      sku("multi-flower-pack-4"),
      sku("single-colour-flower-pack-4"),
      sku("four-colour-flower-pack-4"),
      sku("paper-flower-pack-8"),
    ],
  },
];

export interface GroupedCards {
  readonly group: CardGroup;
  readonly variants: readonly Variant[];
}

/** The 18 cards in occasion order, every variant read from the catalogue. */
export const groupedCards = (): readonly GroupedCards[] => {
  const bySku = new Map(POP_UP_CARD.variants.map((variant) => [variant.sku, variant]));
  return CARD_GROUPS.map((group) => ({
    group,
    variants: group.skus.map((s) => {
      const variant = bySku.get(s);
      if (!variant) throw new Error(`card group "${group.id}" names an unknown SKU: ${s}`);
      return variant;
    }),
  }));
};

/**
 * Every catalogue card appears in exactly one group, and no group names a card
 * that does not exist. Called by the catalogue validator and by the tests.
 */
export const validateCardGroups = (): string[] => {
  const errors: string[] = [];
  const listed = CARD_GROUPS.flatMap((group) => group.skus);
  const seen = new Set<string>();
  for (const s of listed) {
    if (seen.has(s)) errors.push(`pop-up card listed in more than one group: ${s}`);
    seen.add(s);
  }
  for (const variant of POP_UP_CARD.variants) {
    if (!seen.has(variant.sku)) errors.push(`pop-up card is in no occasion group: ${variant.sku}`);
  }
  const catalogue = new Set(POP_UP_CARD.variants.map((v) => v.sku));
  for (const s of listed) {
    if (!catalogue.has(s)) errors.push(`card group names a SKU that is not in the catalogue: ${s}`);
  }
  return errors;
};
