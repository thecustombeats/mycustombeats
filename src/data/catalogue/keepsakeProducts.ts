/**
 * The remaining physical families: discs, frames, boxes, plaques and the
 * vinyl-playback ecosystem.
 *
 * PRICING. Approved prices are stated in GBP and nothing else — see
 * `ProductPrice`. Products the business has not priced remain `TBD`, which
 * carries no number, so an unpriced product cannot render a figure by
 * accident. Every price below traces to an approved figure; none was
 * interpolated from another product, and none carries a converted currency.
 *
 * SPECIFICATIONS ARE STILL ABSENT, DELIBERATELY. A price is not a
 * specification. None of these products states dimensions, materials, finish,
 * capacity, power, manufacturing origin or provenance, because none of that
 * has been supplied — and a priced product with invented specifications is a
 * worse lie than an unpriced one. `specs` stays omitted until the business
 * fills it in.
 *
 * NO USB. The Memory Box contains no USB component, enhancement, related
 * product or included item, and no USB product exists anywhere in this
 * catalogue.
 */

import {
  TBD,
  gbp,
  type CatalogueProduct,
  type ProductFamily,
} from "./types";

/* ------------------------------------------------------------------ */
/* CD                                                                  */
/* ------------------------------------------------------------------ */

export const CD_PRODUCT: CatalogueProduct = {
  id: "cd",
  familyId: "cd",
  name: "CD",
  description: "Your music on disc, presented with your custom cover artwork.",
  image: "/images/brand/CD.png",
  alt: "MCB CD — personalised music keepsake",
  price: TBD,
  availability: "AVAILABLE",
  fulfilment: "PHYSICAL",
  songInclusion: "CARRIES_SONG",
  compatibleProducts: ["memory-box-luxury"],
};

export const CD_FAMILY: ProductFamily = {
  id: "cd",
  name: "CD",
  description: "Your music on disc, presented with your custom cover artwork.",
  image: "/images/brand/CD.png",
  alt: "MCB CD — personalised music keepsake",
  isCheckoutFormat: true,
  products: [CD_PRODUCT],
};

/* ------------------------------------------------------------------ */
/* Lyrics frames and frames                                            */
/* ------------------------------------------------------------------ */

/**
 * "Framed Lyrics" in conversation; `Framed Lyric Artwork` on the site.
 *
 * The shorthand and the catalogue name describe the same object, so this
 * stays ONE product. Adding a second entry for the shorthand would give MCB
 * two framed-lyric products at £100 each and no way to tell a customer which
 * one they were looking at.
 */
export const LYRICS_FRAME: CatalogueProduct = {
  id: "lyrics-frame",
  familyId: "lyrics-frame",
  name: "Framed Lyric Artwork",
  description: "Timeless typography designed to live on walls.",
  image: "/images/products/artwork.jpg",
  price: gbp(100),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["memory-box-luxury", "vinyl-12"],
};

export const LYRICS_FRAME_FAMILY: ProductFamily = {
  id: "lyrics-frame",
  name: "Lyrics Frames",
  description: "Your lyrics, set as typography and framed for the wall.",
  image: "/images/products/artwork.jpg",
  isCheckoutFormat: false,
  products: [LYRICS_FRAME],
};

/**
 * VINYL FRAME — the record as a display piece.
 *
 * NO PHOTOGRAPH EXISTS for this product, so `image` is omitted and the page
 * falls back to a typographic panel. It is deliberately not pointed at
 * `products/vinyl.jpg`: that is a photograph of a record, not of a framed
 * record, and borrowing it would show the customer something other than what
 * they are buying.
 *
 * No frame dimensions, material, moulding, glazing or origin are stated. None
 * has been approved, and a £200 product that describes glass it has never
 * been told about is inventing a specification.
 */
export const VINYL_FRAME: CatalogueProduct = {
  id: "vinyl-frame",
  familyId: "frame",
  name: "Vinyl Frame",
  description:
    "Your record, framed for the wall — the song you commissioned, presented as a piece to live with rather than a record to file away.",
  price: gbp(200),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  /**
   * A framed record may hold the customer's own pressing or a display copy,
   * and the business has approved no blanket rule — the same reasoning that
   * makes the Memory Box `CONFIGURABLE`. Settled during configuration.
   */
  songInclusion: "CONFIGURABLE",
  compatibleProducts: ["vinyl-12", "memory-box-luxury"],
};

/**
 * Frames beyond lyric artwork — display framing for a record.
 *
 * The family carried no products until the Vinyl Frame was approved. It now
 * holds one, which is exactly the data edit the empty family existed to make
 * possible.
 */
export const FRAME_FAMILY: ProductFamily = {
  id: "frame",
  name: "Frames",
  description: "Display framing for the pieces that make up a memory.",
  isCheckoutFormat: false,
  products: [VINYL_FRAME],
};

/* ------------------------------------------------------------------ */
/* Memory box                                                          */
/* ------------------------------------------------------------------ */

/**
 * `CONFIGURABLE` song inclusion is the important field here. A memory box may
 * hold a playable pressing of the song, or it may hold a display piece and
 * present the song another way. The business has not approved a blanket rule,
 * so the model refuses to assume one — see `pairedSongInclusion`.
 */
export const MEMORY_BOX: CatalogueProduct = {
  id: "memory-box-luxury",
  familyId: "memory-box",
  name: "Luxury Memory Box",
  description: "Lyrics, photos, and your song in one complete experience.",
  // Approved photograph. The discontinued USB concept does not appear in it.
  image: "/images/brand/Luxury-Memory-Box.png",
  alt: "The MCB Luxury Memory Box, gold-foiled and tied with ribbon",
  price: TBD,
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "CONFIGURABLE",
  compatibleProducts: [
    "vinyl-12",
    "cd",
    "lyrics-frame",
  ],
};

export const MEMORY_BOX_FAMILY: ProductFamily = {
  id: "memory-box",
  name: "Luxury Memory Boxes",
  description: "Lyrics, photos, and your song in one complete experience.",
  image: "/images/brand/Luxury-Memory-Box.png",
  alt: "The MCB Luxury Memory Box, gold-foiled and tied with ribbon",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: [MEMORY_BOX],
};

/* ------------------------------------------------------------------ */
/* Plaques                                                             */
/* ------------------------------------------------------------------ */

export const PLAQUE: CatalogueProduct = {
  id: "plaque",
  familyId: "plaque",
  name: "Engraved Music Plaque",
  description: "Crystal or wood with a scannable code to your song.",
  image: "/images/products/plaque.jpg",
  price: gbp(100),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["memory-box-luxury"],
};

export const PLAQUE_FAMILY: ProductFamily = {
  id: "plaque",
  name: "Engraved Music Plaques",
  description: "Crystal or wood with a scannable code to your song.",
  image: "/images/products/plaque.jpg",
  isCheckoutFormat: false,
  products: [PLAQUE],
};

/* ------------------------------------------------------------------ */
/* Vinyl playback ecosystem — separate families, not vinyl variants     */
/* ------------------------------------------------------------------ */

/**
 * THE PLAYBACK COLLECTION
 *
 * Four families with approved artwork, each now holding one approved,
 * GBP-priced product.
 *
 * WHAT IS STATED, AND WHAT IS NOT. Each product carries a name, a price, an
 * availability and the description that already accompanies its artwork.
 * None carries a model number, materials, dimensions, power source, speed,
 * cartridge, battery life, output, age or provenance — the Vintage Collection
 * especially, where "antique" or a date would be a claim about an object
 * nobody has described to this repository. The photographs show what they
 * show; the data says only what has been approved.
 *
 * FAMILY vs PRODUCT. Each family still holds exactly one product, so the
 * family reads as the collection and the product as the piece within it. A
 * second model is one object literal away and needs no change here.
 */
export const DIGITAL_PLAYER: CatalogueProduct = {
  id: "digital-player",
  familyId: "digital-player",
  name: "Digital Player",
  // The approved family line, singular. No finish, material or specification
  // is added — the photograph shows the piece; the data does not describe it.
  description: "A player for listening to your music at home.",
  image: "/images/brand/digital-player.png",
  alt: "The MCB Digital Player, a cased turntable with a record on the platter",
  price: gbp(250),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  // A player plays the song; it is not itself a copy of it.
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["vinyl-12"],
};

export const DIGITAL_PLAYER_FAMILY: ProductFamily = {
  id: "digital-player",
  name: "Digital Players",
  description: "Players for listening to your music at home.",
  image: "/images/brand/digital-player.png",
  alt: "Digital Players — players for listening to your music at home",
  imageFit: "contain",
  imageAspect: "landscape",
  isCheckoutFormat: false,
  products: [DIGITAL_PLAYER],
};

/**
 * No age, origin, maker or period is stated.
 *
 * "Vintage Collection" is the approved name of the range and the word printed
 * on its artwork. It is not a claim that any individual piece is an antique,
 * and nothing here should be extended into one without approved provenance.
 */
export const VINTAGE_GRAMOPHONE: CatalogueProduct = {
  id: "vintage-gramophone",
  familyId: "vintage-collection",
  name: "Vintage Collection Gramophone",
  // "In the classic style" describes the design, and deliberately stops short
  // of calling the piece an antique or dating it.
  description: "A horn gramophone in the classic style, for the true music lover.",
  image: "/images/brand/vintage-gramaphone.png",
  alt: "The MCB Vintage Collection gramophone, with a large decorated horn on an ornate case",
  price: gbp(1000),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["vinyl-12"],
};

export const VINTAGE_COLLECTION_FAMILY: ProductFamily = {
  id: "vintage-collection",
  name: "Vintage Collection",
  description: "Timeless classics for the true music lover.",
  image: "/images/brand/vintage-gramaphone.png",
  alt: "Vintage Collection — timeless classics for the true music lover",
  imageFit: "contain",
  imageAspect: "landscape",
  isCheckoutFormat: false,
  products: [VINTAGE_GRAMOPHONE],
};

/**
 * PORTABLE RECORD PLAYER SUITCASE — renamed from "Portable Gramophone".
 *
 * The photograph shows a cased suitcase turntable, so the new name describes
 * the object more accurately than "gramophone" did.
 *
 * The family ID stays `portable-gramophone`. It is an internal key, not
 * customer-facing copy: it appears in `ProductFamilyId`, in the relationship
 * map and in every `@id` already published in the products page's structured
 * data. Renaming it would churn all of that to change a string no customer
 * reads.
 *
 * ⚠ THE ARTWORK STILL READS "Portable Gramophones". The title is printed
 * inside `portable-recordplayer.png`, which is an approved asset this sprint
 * cannot regenerate. The heading beside it is authoritative and now says
 * Portable Record Player Suitcase, so the two disagree until the image is
 * re-rendered. Flagged for the business rather than papered over by keeping
 * the old name.
 */
export const PORTABLE_RECORD_PLAYER_SUITCASE: CatalogueProduct = {
  id: "portable-record-player-suitcase",
  familyId: "portable-gramophone",
  name: "Portable Record Player Suitcase",
  description:
    "A record player that travels with the memory — take their song somewhere unforgettable, on a surprise picnic, a romantic getaway or a special celebration.",
  image: "/images/brand/portable-recordplayer.png",
  alt: "The MCB portable record player, a brass-cornered suitcase turntable open on a terrace above the sea",
  price: gbp(200),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["vinyl-12"],
};

export const PORTABLE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "portable-gramophone",
  name: "Portable Record Player Suitcases",
  description: "A record player that travels with the memory.",
  image: "/images/brand/portable-recordplayer.png",
  // Describes the photograph rather than repeating the title printed in it,
  // which no longer matches the product name.
  alt: "A brass-cornered suitcase record player, open on a terrace above the sea",
  imageFit: "contain",
  imageAspect: "landscape",
  isCheckoutFormat: false,
  products: [PORTABLE_RECORD_PLAYER_SUITCASE],
};

/**
 * The product behind the future Moment offer, "Play your new song in style".
 *
 * That offer is NOT implemented: nothing here references Moment, and no
 * upsell, bundle or combined price exists. The product simply has to be real
 * before anything can point at it.
 */
export const PHONE_GRAMOPHONE: CatalogueProduct = {
  id: "phone-gramophone",
  familyId: "phone-gramophone",
  name: "Mobile Phone Gramophone",
  // The approved family line, verbatim. "Acoustic" is the only claim made
  // about how it works, because it is the only one that was supplied.
  description: "An acoustic gramophone built around a mobile phone.",
  image: "/images/brand/phone-gramaphone.png",
  alt: "The MCB Mobile Phone Gramophone, a brass horn on a wooden base cradling a phone",
  price: gbp(100),
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
};

export const PHONE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "phone-gramophone",
  name: "Mobile-phone Gramophone",
  description: "An acoustic gramophone built around a mobile phone.",
  image: "/images/brand/phone-gramaphone.png",
  alt: "Mobile-phone Gramophone — an acoustic gramophone built around a mobile phone",
  imageFit: "contain",
  imageAspect: "landscape",
  isCheckoutFormat: false,
  products: [PHONE_GRAMOPHONE],
};
