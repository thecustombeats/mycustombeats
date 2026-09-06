/**
 * The remaining physical families: discs, frames, boxes, plaques and the
 * vinyl-playback ecosystem.
 *
 * PRICING: every entry is TBD. The repository contains no approved price for
 * any physical product, so none is stated. `ProductPrice` has no numeric field
 * in its TBD form precisely so this stays true by construction.
 *
 * EMPTY FAMILIES: Digital Players, Portable Gramophones and the Mobile-phone
 * Gramophone are declared with no products. They are real, approved parts of
 * the vinyl ecosystem, but no model, specification, photograph or price has
 * been supplied. Declaring the family lets the relationship be expressed today
 * and makes the first product a data edit tomorrow. Nothing was invented to
 * fill them.
 *
 * NO USB. The Memory Box contains no USB component, enhancement, related
 * product or included item, and no USB product exists anywhere in this
 * catalogue.
 */

import {
  TBD,
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

export const LYRICS_FRAME: CatalogueProduct = {
  id: "lyrics-frame",
  familyId: "lyrics-frame",
  name: "Framed Lyric Artwork",
  description: "Timeless typography designed to live on walls.",
  image: "/images/products/artwork.jpg",
  price: TBD,
  availability: "MADE_TO_ORDER",
  fulfilment: "PHYSICAL",
  songInclusion: "KEEPSAKE_ONLY",
  compatibleProducts: ["memory-box-luxury", "vinyl-7", "vinyl-10", "vinyl-12"],
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
 * Frames beyond lyric artwork — a display frame for a record or a photograph.
 *
 * No frame type, size, material or price has been approved, so the family
 * carries no products. Its shape is identical to every other family, so the
 * first approved frame is one object literal away.
 */
export const FRAME_FAMILY: ProductFamily = {
  id: "frame",
  name: "Frames",
  description: "Display framing for the pieces that make up a memory.",
  isCheckoutFormat: false,
  products: [],
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
    "vinyl-7",
    "vinyl-10",
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
  price: TBD,
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
 * Four families with approved artwork and no approved product yet. Each image
 * carries its own title and description inside the artwork — and those match
 * the `name` and `description` below exactly, which is why the cards render
 * the image alone rather than repeating the same words underneath it.
 *
 * They still hold no products: no model, specification, price or availability
 * has been supplied for any individual player. The families exist so the
 * first approved product is a data edit.
 */
export const DIGITAL_PLAYER_FAMILY: ProductFamily = {
  id: "digital-player",
  name: "Digital Players",
  description: "Players for listening to your music at home.",
  image: "/images/brand/digital-player.png",
  alt: "Digital Players — players for listening to your music at home",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: [],
};

export const VINTAGE_COLLECTION_FAMILY: ProductFamily = {
  id: "vintage-collection",
  name: "Vintage Collection",
  description: "Timeless classics for the true music lover.",
  image: "/images/brand/vintage-gramaphone.png",
  alt: "Vintage Collection — timeless classics for the true music lover",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: [],
};

export const PORTABLE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "portable-gramophone",
  name: "Portable Gramophones",
  description: "A record player that travels with the memory.",
  image: "/images/brand/portable-recordplayer.png",
  alt: "Portable Gramophones — a record player that travels with the memory",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: [],
};

export const PHONE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "phone-gramophone",
  name: "Mobile-phone Gramophone",
  description: "An acoustic gramophone built around a mobile phone.",
  image: "/images/brand/phone-gramaphone.png",
  alt: "Mobile-phone Gramophone — an acoustic gramophone built around a mobile phone",
  imageFit: "contain",
  isCheckoutFormat: false,
  products: [],
};
