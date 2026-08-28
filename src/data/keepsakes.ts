/**
 * MCB physical keepsakes — the objects a song can become.
 *
 * Shared by the Products page and the homepage "Make the memory physical"
 * band so the two can never describe the ecosystem differently.
 *
 * ASSETS
 * ------
 * `image` is omitted where no photograph exists, and components fall back to
 * an illustrative mark rather than a broken or borrowed image. Every entry
 * currently has approved artwork. Nothing here describes manufacturing,
 * materials or specifications that have not been provided.
 */

export interface Keepsake {
  id: string;
  title: string;
  description: string;
  /** Public path to the product photograph. Omitted when none exists yet. */
  image?: string;
  /** Overrides the default alt text (the title) where more detail helps. */
  alt?: string;
  /** True when the item is also selectable as a delivery format at checkout. */
  isCheckoutFormat: boolean;
}

export const KEEPSAKES: readonly Keepsake[] = [
  {
    id: "vinyl",
    title: "Personalised Vinyl Records",
    description: "Your song, pressed onto premium vinyl with bespoke artwork.",
    image: "/images/products/vinyl.jpg",
    isCheckoutFormat: true,
  },
  {
    id: "cd",
    title: "CD",
    description:
      "Your music on disc, presented with your custom cover artwork.",
    image: "/images/brand/CD.png",
    alt: "MCB CD — personalised music keepsake",
    isCheckoutFormat: true,
  },
  {
    id: "artwork",
    title: "Framed Lyric Artwork",
    description: "Timeless typography designed to live on walls.",
    image: "/images/products/artwork.jpg",
    isCheckoutFormat: false,
  },
  {
    id: "plaque",
    title: "Engraved Music Plaques",
    description: "Crystal or wood with a scannable code to your song.",
    image: "/images/products/plaque.jpg",
    isCheckoutFormat: false,
  },
  {
    id: "memory-box",
    title: "Luxury Memory Boxes",
    description: "Lyrics, photos, and your song in one complete experience.",
    image: "/images/products/memory-box.jpg",
    isCheckoutFormat: false,
  },
  {
    id: "cards",
    title: "Premium Music Cards",
    description: "A minimal card that reveals your song with a single tap.",
    image: "/images/products/cards.jpg",
    isCheckoutFormat: false,
  },
];
