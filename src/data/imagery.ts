/**
 * MCB imagery — approved photographs with responsive derivatives.
 *
 * Derivatives live in public/images/responsive/ and are produced by
 * scripts/optimise-images.sh. Every image carries its intrinsic size so the
 * browser reserves space before it loads, and a srcset so a phone never
 * downloads a desktop photograph.
 *
 * FOUNDER-APPROVED MCB MARKETING ASSETS (Sprint 3.1): the sleeve-artwork wall
 * is Keepsake's primary visual; the picture-disc wall illustrates "one
 * journey, as many memories as you want". Both are aspirational displays —
 * wall mounting and the room are not part of any product, and nobody pictured
 * is presented as an MCB customer. Masters: assets/originals/.
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
  keepsakeSleeveWall: image(
    "keepsake-sleeve-wall",
    1448,
    1086,
    "Personalised record sleeves, each with its own photograph and message, with vinyl records behind them"
  ),
  pictureDiscWall: image(
    "picture-disc-wall",
    1448,
    1086,
    "Several personalised picture discs, each carrying a different photograph and message, displayed together"
  ),
  anniversaryExamplePoster: image(
    "anniversary-example-poster",
    1024,
    1536,
    "Artwork for the 25th Anniversary MCB Example"
  ),
  // Founder-approved photographs of Rinaldi (Sprint 3.2). No cruise line is
  // visible or named. Masters: assets/originals/.
  rinaldiAtSea: image(
    "rinaldi-at-sea",
    941,
    1672,
    "DJ Rinaldi holding an MCB vinyl record while looking out to sea from a ship's deck at sunset"
  ),
  rinaldiPortrait: image(
    "rinaldi-portrait",
    941,
    1672,
    "DJ Rinaldi holding an MCB vinyl record on a ship's deck at sunset"
  ),
  lyricsFrame: image("lyrics-frame", 1024, 1024, "A framed lyrics print on a sideboard"),
  phoneGramophone: image("phone-gramophone", 752, 520, "A vintage-style acoustic gramophone built around a mobile phone"),
  brassGramophone: image("brass-gramophone", 768, 522, "A classic gramophone with a large decorated horn on an ornate case"),
  suitcasePlayer: image("suitcase-player", 767, 491, "A brass-cornered suitcase record player open on a terrace above the sea"),
} satisfies Record<string, McbImage>;

export type ImageKey = keyof typeof IMAGES;

/** Every derivative exists as JPEG (fallback, share images) and WebP. */
export type ImageFormat = "jpg" | "webp";

export const imageSrc = (img: McbImage, width: (typeof WIDTHS)[number] = 960, format: ImageFormat = "jpg"): string =>
  `/images/responsive/${img.name}-${width}.${format}`;

export const imageSrcSet = (img: McbImage, format: ImageFormat = "jpg"): string =>
  WIDTHS.map((w) => `${imageSrc(img, w, format)} ${Math.min(w, img.width)}w`).join(", ");

/** The visual identity of each primary experience. */
export const PACKAGE_IMAGERY = {
  moment: IMAGES.seaToast,
  keepsake: IMAGES.keepsakeSleeveWall,
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
