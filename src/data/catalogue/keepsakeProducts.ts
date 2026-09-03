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
  image: "/images/products/memory-box.jpg",
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
  image: "/images/products/memory-box.jpg",
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

export const DIGITAL_PLAYER_FAMILY: ProductFamily = {
  id: "digital-player",
  name: "Digital Players",
  description: "Players for listening to your music at home.",
  isCheckoutFormat: false,
  products: [],
};

export const PORTABLE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "portable-gramophone",
  name: "Portable Gramophones",
  description: "A record player that travels with the memory.",
  isCheckoutFormat: false,
  products: [],
};

export const PHONE_GRAMOPHONE_FAMILY: ProductFamily = {
  id: "phone-gramophone",
  name: "Mobile-phone Gramophone",
  description: "An acoustic gramophone built around a mobile phone.",
  isCheckoutFormat: false,
  products: [],
};
