/**
 * MCB imagery — approved photographs with responsive derivatives.
 *
 * Derivatives live in public/images/responsive/ and are produced by
 * scripts/optimise-images.sh. Every image carries its intrinsic size so the
 * browser reserves space before it loads, and a srcset so a phone never
 * downloads a desktop photograph.
 *
 * NO PICTURE-DISC PHOTOGRAPH EXISTS YET. Keepsake is represented by a gift
 * image and by <FormatVisual>, a drawn format representation, never by the
 * black-vinyl photograph (that is a Journey record, not a picture disc).
 */

export interface McbImage {
  /** Name of the derivative set in public/images/responsive. */
  name: string;
  alt: string;
  /** Intrinsic width and height of the largest derivative. */
  width: number;
  height: number;
}

const WIDTHS = [480, 960, 1600] as const;

const image = (name: string, width: number, height: number, alt: string): McbImage => ({ name, width, height, alt });

export const IMAGES = {
  cruiseCouple: image("cruise-couple", 864, 1184, "A couple sharing a quiet moment on a ship's deck at sunset"),
  cruiseDance: image("cruise-dance", 832, 1248, "A couple dancing on deck as the sun sets over the sea"),
  seaToast: image("sea-toast", 832, 1248, "A glass raised against the sea at sunset, a ship on the horizon"),
  giftAtSea: image("gift-at-sea", 864, 1184, "Hands passing a wrapped gift at golden hour by the sea"),
  travelJournal: image("travel-journal", 1344, 768, "An open travel journal and map on a table overlooking the sea"),
  vinylSleeve: image("vinyl-sleeve", 1536, 1024, "A black vinyl record beside its personalised sleeve"),
  familyTerrace: image("family-terrace", 1344, 768, "Three generations of a family celebrating together on a terrace"),
  honeymoonDeck: image("honeymoon-deck", 1344, 768, "Newlyweds embracing on a terrace above the sea"),
  soloDeck: image("solo-deck", 1344, 768, "A woman looking out to sea from the deck of a ship"),
  proposalDeck: image("proposal-deck", 1344, 768, "A proposal at sunset beside the sea"),
  weddingDeck: image("wedding-deck", 832, 1248, "A bride and groom dancing on deck at sunset"),
  anniversary: image("anniversary", 832, 1248, "A couple celebrating an anniversary together"),
  celebrationDeck: image("celebration-deck", 832, 1248, "Guests celebrating on deck at sunset"),
  friendsToast: image("friends-toast", 832, 1248, "Friends raising a toast together at golden hour"),
  lyricsFrame: image("lyrics-frame", 1024, 1024, "A framed lyrics print on a sideboard"),
  phoneGramophone: image("phone-gramophone", 752, 520, "A vintage-style acoustic gramophone built around a mobile phone"),
  brassGramophone: image("brass-gramophone", 768, 522, "A classic gramophone with a large decorated horn on an ornate case"),
  suitcasePlayer: image("suitcase-player", 767, 491, "A brass-cornered suitcase record player open on a terrace above the sea"),
} satisfies Record<string, McbImage>;

export type ImageKey = keyof typeof IMAGES;

export const imageSrc = (img: McbImage, width: (typeof WIDTHS)[number] = 960): string =>
  `/images/responsive/${img.name}-${width}.jpg`;

export const imageSrcSet = (img: McbImage): string =>
  WIDTHS.map((w) => `${imageSrc(img, w)} ${Math.min(w, img.width)}w`).join(", ");

/** The visual identity of each primary experience. */
export const PACKAGE_IMAGERY = {
  moment: IMAGES.seaToast,
  keepsake: IMAGES.giftAtSea,
  journey: IMAGES.vinylSleeve,
  bespoke: IMAGES.travelJournal,
} as const;

/** Catalogue product id → photograph, for products that have one. */
export const PRODUCT_IMAGERY: Readonly<Record<string, McbImage>> = {
  ...PACKAGE_IMAGERY,
  "lyrics-frame": IMAGES.lyricsFrame,
  "vintage-smartphone-gramophone": IMAGES.phoneGramophone,
  "antique-brass-gramophone": IMAGES.brassGramophone,
  "portable-suitcase-record-player": IMAGES.suitcasePlayer,
};
