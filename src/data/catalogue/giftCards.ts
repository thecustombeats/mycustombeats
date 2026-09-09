/**
 * GIFT POP-UP CARD — one product, many occasions.
 *
 * Renamed from "Music Card". Occasions are data: the ten below are the launch
 * catalogue, and adding an eleventh means adding one line to `CARD_OCCASIONS`.
 * No component anywhere enumerates occasions itself.
 *
 * PRICING. Every card is £50, the approved price for the premium music card.
 * It is stated ONCE, in `CARD_PRICE_GBP`, and every occasion reads it — so
 * the ten designs cannot drift to ten different prices, and repricing the
 * range is one edit.
 *
 * ONE FAMILY, NOT TWO. "Premium Music Card" is the commercial shorthand for
 * this product; "Gift Pop-Up Card" is what the site, the artwork and the
 * occasion vocabulary already call it. They are the same object, so the
 * shorthand did not become a second family — that would have produced two
 * £50 card ranges with no way to tell a customer which was which.
 *
 * Per-occasion artwork is absent — the product-level `image` field is omitted
 * rather than pointed at a borrowed photograph, and the family carries the
 * one approved card photograph for all ten.
 */

import {
  OCCASIONS,
  gbp,
  type CatalogueProduct,
  type OccasionId,
  type ProductFamily,
  type ProductPrice,
} from "./types";

/**
 * The approved price of one Gift Pop-Up Card, whatever the occasion.
 *
 * Occasion changes the artwork, not the price. Declaring it here rather than
 * on each card is what guarantees that stays true.
 */
export const CARD_PRICE: ProductPrice = gbp(50);

/** Occasions with a card design in the launch catalogue, in display order. */
export const CARD_OCCASIONS: readonly OccasionId[] = [
  "anniversary",
  "birthday",
  "wedding",
  "mothers-day",
  "christmas",
  "easter",
  "thank-you",
  "congratulations",
  "valentines-day",
  "cruise",
];

const cardFor = (occasion: OccasionId): CatalogueProduct => ({
  id: `gift-pop-up-card-${occasion}`,
  familyId: "gift-pop-up-card",
  name: `${OCCASIONS[occasion].label} Gift Pop-Up Card`,
  description: `A pop-up card for ${OCCASIONS[occasion].prose}, opening to reveal your personalised song.`,
  occasion,
  price: CARD_PRICE,
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  // The card presents the song; it does not physically contain the recording.
  songInclusion: "KEEPSAKE_ONLY",
});

export const GIFT_POP_UP_CARDS: readonly CatalogueProduct[] =
  CARD_OCCASIONS.map(cardFor);

export const GIFT_POP_UP_CARD_FAMILY: ProductFamily = {
  id: "gift-pop-up-card",
  name: "Gift Pop-Up Cards",
  description: "A card that opens to reveal your song.",
  // Approved photograph of the current product: a card that opens to a paper
  // bouquet. The discontinued NFC tap-card does not appear in it.
  image: "/images/brand/Pop-Up-Card.png",
  alt: "An MCB Gift Pop-Up Card opening to a paper bouquet",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: GIFT_POP_UP_CARDS,
};

/** The card design for an occasion, or `undefined` if none exists yet. */
export const cardForOccasion = (
  occasion: OccasionId
): CatalogueProduct | undefined =>
  GIFT_POP_UP_CARDS.find((card) => card.occasion === occasion);
