/**
 * GIFT POP-UP CARD — one product, many occasions.
 *
 * Renamed from "Music Card". Occasions are data: the ten below are the launch
 * catalogue, and adding an eleventh means adding one line to `CARD_OCCASIONS`.
 * No component anywhere enumerates occasions itself.
 *
 * Every card is priced TBD. No card price exists in the business's approved
 * pricing, and none has been invented here. Artwork is likewise absent — the
 * `image` field is omitted rather than pointed at a borrowed photograph, and
 * the UI falls back to a typographic panel.
 */

import {
  OCCASIONS,
  TBD,
  type CatalogueProduct,
  type OccasionId,
  type ProductFamily,
} from "./types";

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
  price: TBD,
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  // The card presents the song; it does not physically contain the recording.
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["memory-box-luxury"],
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
