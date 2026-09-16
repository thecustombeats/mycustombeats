/**
 * MCB CANONICAL CATALOGUE — the single source of truth for what MCB sells.
 *
 * Authority: docs/COMMERCIAL-AUTHORITY-20260914.md.
 *
 * Every price the website shows, the server charges, structured data
 * publishes or analytics reports is read from here. The server copy
 * (`public/api/data/catalogue.json`) is generated from this file by
 * `scripts/generate-catalogue-json.mjs`; nothing else may define a price.
 *
 * Prices are integer pence. Supplier costs and margins never belong here.
 */

import { PLANNING_RECOMMENDATION } from "../legal/delivery";
import type { Money, Product, Variant, VinylSpec } from "./types";

const gbp = (minor: number): Money => ({ currency: "GBP", minor });

const MADE_TO_ORDER = { basis: "MADE_TO_ORDER", label: PLANNING_RECOMMENDATION } as const;

/**
 * SINGLE CREATIVE AUTHORITY (15 September 2026). A Moment is created, checked
 * by MCB and then revealed as quickly as the work and the quality check allow.
 * No number of minutes or hours is promised.
 */
export const MOMENT_REVEAL_TIMING = "Revealed to you as soon as it has passed our quality check";

const pictureDisc = (sizeInches: VinylSpec["sizeInches"], shape: VinylSpec["shape"] = "ROUND"): VinylSpec => ({
  pictureDisc: true,
  sizeInches,
  shape,
  discCount: 1,
  gatefold: false,
});

const songs = (count: number): string =>
  count === 1 ? "1 personalised song" : `${count} personalised songs`;

/** Defaults for a variant that contains no record, song or artwork. */
const plainVariant = {
  songCount: null,
  vinyl: null,
  artworkIncluded: false,
  masteringIncluded: false,
  dimensions: null,
  priorityReplacementEligible: false,
} as const;

/* ------------------------------------------------------------------ */
/* Song experiences                                                    */
/* ------------------------------------------------------------------ */

export const MOMENT: Product = {
  id: "moment",
  slug: "moment",
  name: "Moment",
  positioning: "A memory, made instantly.",
  shortDescription: "A simple, beautiful way to turn a memory into music.",
  commercialModel: "FIXED",
  category: "SONG_EXPERIENCE",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: true,
  route: "/moment",
  deliveryClass: null,
  turnaround: { basis: "DIGITAL_TURNAROUND", label: MOMENT_REVEAL_TIMING },
  schemaType: "Product",
  variesBy: null,
  analyticsCategory: "Song Experience",
  image: null,
  imageAlt: null,
  disclosures: [],
  cta: "Begin This Experience",
  storedValue: null,
  variants: [
    {
      sku: "moment",
      name: "Moment",
      label: "Moment",
      price: gbp(1500),
      songCount: 1,
      fulfilment: "DIGITAL",
      vinyl: null,
      artworkIncluded: false,
      masteringIncluded: false,
      dimensions: null,
      priorityReplacementEligible: false,
      features: [
        "1 personalised song",
        "Customised lyrics from your story",
        "Choose your mood and style, or let MCB choose",
        "A private reveal link to your finished song",
        "MP4 delivery",
      ],
    },
  ],
};

const keepsakeVariant = (
  sku: string,
  label: string,
  songCount: number,
  minor: number,
  vinyl: VinylSpec
): Variant => ({
  sku,
  name: `${label} Keepsake`,
  label,
  price: gbp(minor),
  songCount,
  fulfilment: "PHYSICAL",
  vinyl,
  artworkIncluded: true,
  masteringIncluded: false,
  dimensions: null,
  priorityReplacementEligible: true,
  features: [
    songs(songCount),
    `${vinyl.sizeInches}-inch ${vinyl.shape === "HEART" ? "heart-shaped " : ""}picture disc`,
    "Picture-disc artwork created by MCB from your photograph",
    PLANNING_RECOMMENDATION,
  ],
});

export const KEEPSAKE: Product = {
  id: "keepsake",
  slug: "keepsake",
  name: "Keepsake",
  positioning: "Turn the memory into something you can hold.",
  shortDescription:
    "Your personalised music on a picture disc. Choose one for every memory or every day of a journey.",
  commercialModel: "VARIANT_FIXED",
  category: "SONG_EXPERIENCE",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: true,
  route: "/keepsake",
  deliveryClass: "VINYL",
  turnaround: MADE_TO_ORDER,
  schemaType: "ProductGroup",
  variesBy: "size",
  analyticsCategory: "Song Experience",
  image: null,
  imageAlt: null,
  disclosures: [],
  cta: "Begin This Experience",
  storedValue: null,
  variants: [
    keepsakeVariant("keepsake-12-picture-disc", "12-inch Picture Disc", 4, 14999, pictureDisc(12)),
    keepsakeVariant("keepsake-10-picture-disc", "10-inch Picture Disc", 3, 13999, pictureDisc(10)),
    keepsakeVariant("keepsake-10-heart-picture-disc", "Heart-Shaped Picture Disc", 1, 12999, pictureDisc(10, "HEART")),
    keepsakeVariant("keepsake-7-picture-disc", "7-inch Picture Disc", 1, 9900, pictureDisc(7)),
  ],
};

/**
 * JOURNEY INCLUDES STANDARD VINYL AND NEVER A PICTURE DISC.
 * `vinyl.pictureDisc` is false on both variants and the tests hold it there.
 */
export const STANDARD_VINYL_NOT_PICTURE_DISC = "Standard vinyl — not a Picture Disc";

/** The customer-facing way of saying the same thing, warmly. */
export const JOURNEY_FORMAT_NOTE =
  "Pressed on classic black vinyl with your personalised sleeve artwork and mastering. Journey is not a Picture Disc.";

export const JOURNEY: Product = {
  id: "journey",
  slug: "journey",
  name: "Journey",
  positioning: "Every chapter of your story, on record.",
  shortDescription:
    "A personalised album on standard vinyl, with a different music style for every chapter if you wish.",
  commercialModel: "VARIANT_FIXED",
  category: "SONG_EXPERIENCE",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: true,
  route: "/journey",
  deliveryClass: "VINYL",
  turnaround: MADE_TO_ORDER,
  schemaType: "ProductGroup",
  variesBy: "songCount",
  analyticsCategory: "Song Experience",
  image: null,
  imageAlt: null,
  disclosures: [STANDARD_VINYL_NOT_PICTURE_DISC],
  cta: "Begin This Experience",
  storedValue: null,
  variants: [
    {
      sku: "journey-6",
      name: "Journey — 6 Songs",
      label: "6 Songs",
      price: gbp(19900),
      songCount: 6,
      fulfilment: "PHYSICAL",
      vinyl: { pictureDisc: false, sizeInches: 12, shape: "ROUND", discCount: 1, gatefold: false },
      artworkIncluded: true,
      masteringIncluded: true,
      dimensions: null,
      priorityReplacementEligible: false,
      features: [
        songs(6),
        "A different music style for each song if you wish",
        "Standard 12-inch vinyl record — not a Picture Disc",
        "Album artwork created by MCB from your photograph",
        "Mastering",
        PLANNING_RECOMMENDATION,
      ],
    },
    {
      sku: "journey-12",
      name: "Journey — 12 Songs",
      label: "12 Songs",
      price: gbp(34900),
      songCount: 12,
      fulfilment: "PHYSICAL",
      vinyl: { pictureDisc: false, sizeInches: 12, shape: "ROUND", discCount: 2, gatefold: true },
      artworkIncluded: true,
      masteringIncluded: true,
      dimensions: null,
      priorityReplacementEligible: false,
      features: [
        songs(12),
        "A different music style for each song if you wish",
        "Double 12-inch standard vinyl in a gatefold sleeve — not a Picture Disc",
        "Gatefold artwork created by MCB from your photograph",
        "Mastering",
        PLANNING_RECOMMENDATION,
      ],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Quoted                                                              */
/* ------------------------------------------------------------------ */

export const BESPOKE: Product = {
  id: "bespoke",
  slug: "bespoke",
  name: "Bespoke",
  positioning: "Curated entirely around one person.",
  shortDescription:
    "Every Bespoke commission is individually curated. We combine MCB's signature creations with carefully selected gifts and experiences chosen specifically for your recipient, story and occasion.",
  commercialModel: "QUOTED",
  category: "COMMISSION",
  active: true,
  public: true,
  onlineCheckout: false,
  requiresPersonalisation: true,
  route: "/bespoke",
  deliveryClass: null,
  turnaround: { basis: "AGREED_IN_PROPOSAL", label: "Timeline agreed with you during the consultation" },
  schemaType: "Service",
  variesBy: null,
  analyticsCategory: "Commission",
  image: null,
  imageAlt: null,
  disclosures: [
    "Individually quoted",
    "Scope, deliverables and price are agreed with you before payment. Once your commission enters personalised production, the creative decisions are entrusted to MCB.",
  ],
  cta: "Request a Quote",
  storedValue: null,
  variants: [],
};

export const MCB_LIVE: Product = {
  id: "mcb-live",
  slug: "mcb-live",
  name: "MCB LIVE",
  positioning: "We create the soundtrack to your memory — and, for selected events, we can be there to play it.",
  shortDescription: "DJ Rinaldi, Lady Lakh or both, for selected events. Every event is priced individually.",
  commercialModel: "QUOTED",
  category: "LIVE_PERFORMANCE",
  active: true,
  public: true,
  onlineCheckout: false,
  requiresPersonalisation: false,
  route: "/mcb-live",
  deliveryClass: null,
  turnaround: null,
  schemaType: "Service",
  variesBy: null,
  analyticsCategory: "Live Performance",
  image: null,
  imageAlt: null,
  disclosures: ["Individually quoted"],
  cta: "Request Availability",
  storedValue: null,
  variants: [],
};

/* ------------------------------------------------------------------ */
/* Personalised decor                                                  */
/* ------------------------------------------------------------------ */

export const PLAQUE_DOES_NOT_PLAY_MUSIC = "This plaque does not play music.";

export const PERSONALISED_MUSIC_PLAQUE: Product = {
  id: "personalised-music-plaque",
  slug: "personalised-music-plaque",
  name: "Personalised Music Plaque",
  positioning: "Your photograph and your favourite song, made to display.",
  shortDescription:
    "You provide a photograph and tell us your favourite song and artist. We design a display piece featuring your photo with that song's visual details.",
  commercialModel: "FIXED",
  category: "PERSONALISED_DECOR",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: true,
  route: null,
  deliveryClass: "PLAQUE",
  turnaround: MADE_TO_ORDER,
  schemaType: "Product",
  variesBy: null,
  analyticsCategory: "Personalised Decor",
  image: null,
  imageAlt: null,
  disclosures: [
    PLAQUE_DOES_NOT_PLAY_MUSIC,
    "The song and artist you choose are shown for display only. MCB does not supply, sell, stream or license that recording.",
  ],
  cta: "Add to Your Memory",
  storedValue: null,
  variants: [
    {
      ...plainVariant,
      sku: "personalised-music-plaque",
      name: "Personalised Music Plaque",
      label: "Personalised Music Plaque",
      price: gbp(4999),
      fulfilment: "PHYSICAL",
      artworkIncluded: true,
      dimensions: { widthInches: 8, heightInches: 12, approximate: true },
      features: [
        "Your photograph",
        "Your favourite song and artist, shown as a visual display",
        PLAQUE_DOES_NOT_PLAY_MUSIC,
      ],
    },
  ],
};

const lyricsFrame = (width: number, height: number, minor: number): Variant => ({
  ...plainVariant,
  sku: `lyrics-frame-${width}x${height}`,
  name: `Lyrics Frame — ${width} × ${height} inches`,
  label: `${width} × ${height} inches`,
  price: gbp(minor),
  fulfilment: "PHYSICAL",
  artworkIncluded: true,
  dimensions: { widthInches: width, heightInches: height, approximate: false },
  features: [`${width} × ${height} inches`, "Your lyrics, framed for the wall"],
});

export const LYRICS_FRAME: Product = {
  id: "lyrics-frame",
  slug: "lyrics-frame",
  name: "Lyrics Frames",
  positioning: "Your lyrics, set as typography and framed for the wall.",
  shortDescription: "Timeless typography designed to live on walls.",
  commercialModel: "VARIANT_FIXED",
  category: "PERSONALISED_DECOR",
  // WITHDRAWN FROM THE CUSTOMER-FACING LAUNCH (Founder decision, 16 Sept 2026).
  //
  // "Lyrics Frame / Lyrics Frames" is retired: it must not appear as a product,
  // an upsell, a checkout line, a catalogue item, structured data or a
  // navigation destination. Withdrawing it also takes its only photograph off
  // the site — a room mockup whose poster reads "Imagine Your Song Lyrics
  // Here", placeholder text baked into the pixels.
  //
  // The entry is NOT deleted. These five SKUs are the FRAME family in the
  // 33-SKU physical supplier registry, and deleting them would silently break
  // that count and their routes.
  //
  // `public: false` removes it from every customer surface: it is in no
  // publicProducts() list, so no page renders it, no structured data describes
  // it, Finishing Touches cannot offer it and nothing links to it. No customer
  // journey can add one.
  //
  // `onlineCheckout` stays TRUE so the add-on machinery it exercises — a
  // PERSONALISED_DECOR physical line, per-memory frame personalisation, the
  // FRAME delivery class and its supplier routes — remains under test for
  // whatever product occupies this slot once the Founders answer decision 96.
  // RESIDUAL, REPORTED: a request that names the SKU directly could still price
  // one. Closing that means retiring the SKU outright, which is decision 96.
  //
  // OPEN FOR THE FOUNDERS: the brief lists "5 vinyl frames / wall-art products"
  // among the current 33 AND lists Lyrics Frames as retired. They are the same
  // five SKUs. No product that frames a vinyl RECORD exists in the catalogue,
  // and none was invented.
  active: true,
  public: false,
  onlineCheckout: true,
  requiresPersonalisation: true,
  route: null,
  deliveryClass: "FRAME",
  turnaround: MADE_TO_ORDER,
  schemaType: "ProductGroup",
  variesBy: "size",
  analyticsCategory: "Personalised Decor",
  image: "/images/products/artwork.jpg",
  imageAlt: "Framed lyric artwork by My Custom Beats",
  disclosures: [],
  cta: "Add to Your Memory",
  storedValue: null,
  variants: [
    lyricsFrame(10, 15, 4999),
    lyricsFrame(12, 18, 6999),
    lyricsFrame(14, 21, 7999),
    lyricsFrame(16, 24, 8999),
    lyricsFrame(20, 30, 9999),
  ],
};

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

const player = (
  id: "vintage-smartphone-gramophone" | "antique-brass-gramophone" | "portable-suitcase-record-player",
  name: string,
  shortDescription: string,
  minor: number,
  image: string,
  imageAlt: string
): Product => ({
  id,
  slug: id,
  name,
  positioning: shortDescription,
  shortDescription,
  commercialModel: "FIXED",
  category: "PLAYER",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: "PLAYER",
  turnaround: null,
  schemaType: "Product",
  variesBy: null,
  analyticsCategory: "Player",
  image,
  imageAlt,
  disclosures: [],
  cta: "Add to Your Memory",
  storedValue: null,
  variants: [
    { ...plainVariant, sku: id, name, label: name, price: gbp(minor), fulfilment: "PHYSICAL", features: [] },
  ],
});

export const VINTAGE_SMARTPHONE_GRAMOPHONE = player(
  "vintage-smartphone-gramophone",
  "Vintage Smartphone Gramophone",
  "An acoustic gramophone built around a mobile phone.",
  10000,
  "/images/brand/phone-gramaphone.png",
  "A vintage-style acoustic gramophone built around a mobile phone"
);

export const ANTIQUE_BRASS_GRAMOPHONE = player(
  "antique-brass-gramophone",
  "Antique Brass Gramophone",
  "A classic horn gramophone with an ornate brass finish.",
  100000,
  "/images/brand/vintage-gramaphone.png",
  "A classic gramophone with a large decorated horn on an ornate case"
);

export const PORTABLE_SUITCASE_RECORD_PLAYER = player(
  "portable-suitcase-record-player",
  "Portable Suitcase Record Player",
  "A record player that travels with the memory.",
  20000,
  "/images/brand/portable-recordplayer.png",
  "A brass-cornered suitcase record player, open on a terrace above the sea"
);

/* ------------------------------------------------------------------ */
/* Pop-up cards                                                        */
/* ------------------------------------------------------------------ */

/**
 * The Founders' 18 musical pop-up cards (authoritative names and prices).
 * The product is known; which partner supplies each design, and whether a
 * listing and its delivery are verified, is server-only route data. Delivery
 * is confirmed by MCB before payment (delivery class CARD). No image is
 * assigned until an approved one exists.
 */
const popUpCard = (slug: string, name: string, minor: number): Variant => ({
  ...plainVariant,
  sku: `pop-up-card-${slug}`,
  name: `Pop-Up Card — ${name}`,
  label: name,
  price: gbp(minor),
  fulfilment: "PHYSICAL",
  features: [],
});

export const POP_UP_CARD: Product = {
  id: "pop-up-card",
  slug: "pop-up-card",
  name: "Pop-Up Cards",
  positioning: "A musical pop-up card to give alongside your song.",
  shortDescription: "Pop-up greeting cards for the moment you share your song.",
  commercialModel: "VARIANT_FIXED",
  category: "CARD",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: "CARD",
  turnaround: null,
  schemaType: "ProductGroup",
  variesBy: "design",
  analyticsCategory: "Pop-Up Card",
  // ONE approved example photograph stands for all eighteen designs. MCB does
  // not photograph every card because the card itself is part of the surprise;
  // the disclosure below tells the customer that plainly, and takes care not to
  // imply the designs are identical or to claim a size MCB has not verified.
  image: "pop-up-card",
  imageAlt: "An MCB pop-up card opened to reveal a paper bouquet",
  disclosures: [
    "The photograph is an example. Pop-up cards are part of the surprise, so we don't show every design — yours is chosen for the occasion you pick, and opens into something substantial and beautifully made.",
  ],
  cta: "Add to Your Memory",
  storedValue: null,
  variants: [
    popUpCard("anniversary-gold-white", "Anniversary — Gold and White", 4999),
    popUpCard("anniversary-large", "Anniversary — Large", 6999),
    popUpCard("birthday-candles-music", "Birthday — Candles / Music", 4999),
    popUpCard("birthday-auto-play-music", "Birthday — Auto-Play Music", 1999),
    popUpCard("wedding", "Wedding", 4999),
    popUpCard("mothers-day-flowers", "Mother's Day — Flowers", 4999),
    popUpCard("christmas-tree", "Christmas — Christmas Tree", 4999),
    popUpCard("birthday-tropical-bird-cage", "Birthday — Tropical Bird Cage", 4999),
    popUpCard("halloween-pumpkin-flowers", "Halloween — Pumpkin Flowers", 4999),
    popUpCard("thanksgiving-flowers", "Thanksgiving — Flowers", 4999),
    popUpCard("thank-you-flowers", "Thank You — Flowers", 4999),
    popUpCard("congratulations-flowers", "Congratulations — Flowers", 4999),
    popUpCard("valentines-love-tree-hearts", "Valentine's Day — Love Tree / Hearts", 4999),
    popUpCard("cruise-voyage-vessel", "Cruise / Voyage — Cruise Vessel", 4999),
    popUpCard("multi-flower-pack-4", "Multi Flower Pop-Up Card — Pack of 4", 7999),
    popUpCard("single-colour-flower-pack-4", "Single Colour Flower Pop-Up Card — Pack of 4", 7999),
    popUpCard("four-colour-flower-pack-4", "Four Colour Flower Pop-Up Card — Pack of 4", 7999),
    popUpCard("paper-flower-pack-8", "Paper Flower Pop-Up Cards — Pack of 8", 12999),
  ],
};

/* ------------------------------------------------------------------ */
/* Protection                                                          */
/* ------------------------------------------------------------------ */

export const PRIORITY_REPLACEMENT: Product = {
  id: "priority-replacement",
  slug: "priority-replacement",
  name: "MCB Priority Replacement™",
  positioning: "An optional priority service for eligible personalised keepsakes that arrive damaged or faulty.",
  shortDescription:
    "Optional priority handling and expedited replacement delivery where available for an eligible keepsake that arrived damaged or faulty.",
  commercialModel: "FIXED",
  category: "PROTECTION",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: false,
  route: "/priority-replacement",
  deliveryClass: null,
  turnaround: null,
  schemaType: "Service",
  variesBy: null,
  analyticsCategory: "Protection",
  image: null,
  imageAlt: null,
  disclosures: [
    "Your normal consumer rights are not affected. You do not need to buy MCB Priority Replacement to exercise any rights you already have for faulty, damaged or misdescribed goods.",
    "Optional and never pre-selected. Priced per eligible individual Keepsake.",
  ],
  cta: "Add Priority Replacement",
  storedValue: null,
  variants: [
    {
      ...plainVariant,
      sku: "priority-replacement",
      name: "MCB Priority Replacement™",
      label: "Per eligible Keepsake",
      price: gbp(1999),
      fulfilment: "SERVICE",
      features: [],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Artwork preparation                                                 */
/* ------------------------------------------------------------------ */

/** What an artwork-ready photograph is. Larger square photographs are welcome. */
export const ARTWORK_PHOTO_MIN_PX = 2500;

export const ARTWORK_PREPARATION: Product = {
  id: "artwork-preparation",
  slug: "artwork-preparation",
  name: "MCB Artwork Preparation Service",
  positioning: "For a photograph that isn't artwork-ready, MCB prepares it for your record's artwork.",
  shortDescription:
    "If your photograph isn't square or is smaller than 2500 × 2500 pixels, our team prepares it for your artwork — cropping, resizing and adjusting it as far as the original allows.",
  commercialModel: "FIXED",
  category: "ARTWORK_SERVICE",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: null,
  turnaround: null,
  schemaType: "Service",
  variesBy: null,
  analyticsCategory: "Artwork Service",
  image: null,
  imageAlt: null,
  disclosures: [
    "Optional, chosen by you before payment, once per order.",
    "Not every photograph can be prepared to print quality. If yours can't, we'll ask you for another photograph.",
  ],
  cta: "Add Artwork Preparation",
  storedValue: null,
  variants: [
    {
      ...plainVariant,
      sku: "artwork-preparation",
      name: "MCB Artwork Preparation Service",
      label: "Per order",
      price: gbp(1500),
      fulfilment: "SERVICE",
      features: [],
    },
  ],
};

/* ------------------------------------------------------------------ */
/* MCB Memory Music Video™ — optional enhancement                       */
/* ------------------------------------------------------------------ */

/**
 * One £49 purchase is ONE film for ONE selected song in the order. Never
 * included with a package, never pre-selected, and only sold while the
 * server's capacity ledger has a space (limited monthly availability).
 */
export const MEMORY_MUSIC_VIDEO: Product = {
  id: "memory-music-video",
  slug: "memory-music-video",
  name: "MCB Memory Music Video™",
  positioning: "Your memory. Your song. Your film.",
  shortDescription:
    "Turn your personalised MCB song into a beautiful memory film using the photographs and moments that made the story yours.",
  commercialModel: "FIXED",
  category: "VIDEO_ENHANCEMENT",
  active: true,
  public: true,
  onlineCheckout: true,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: null,
  turnaround: null,
  schemaType: "Service",
  variesBy: null,
  analyticsCategory: "Video Enhancement",
  image: null,
  imageAlt: null,
  disclosures: [
    "Optional enhancement, chosen by you before payment. Not included with any package.",
    "One Memory Music Video is made for one song you choose from your order.",
    "Limited monthly availability.",
  ],
  cta: "Add my Memory Music Video",
  storedValue: null,
  variants: [
    {
      ...plainVariant,
      sku: "memory-music-video",
      name: "MCB Memory Music Video™",
      label: "One film for one song",
      price: gbp(4900),
      fulfilment: "DIGITAL",
      features: [],
    },
  ],
};

/** Memory Music Videos one order may include at launch (one per song remains the architecture). */
export const MEMORY_MUSIC_VIDEO_MAX_PER_ORDER = 1;

/** Days after confirmed delivery within which a priority request must be made. */
export const PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS = 7;

/* ------------------------------------------------------------------ */
/* Education — catalogue knowledge only; no page or online checkout yet */
/* ------------------------------------------------------------------ */

const djBible = (level: string, label: string, minor: number): Variant => ({
  ...plainVariant,
  sku: `cruise-ship-dj-bible-${level}`,
  name: `Cruise Ship DJ Bible — ${label}`,
  label,
  price: gbp(minor),
  fulfilment: "UNCONFIRMED",
  features: [],
});

export const CRUISE_SHIP_DJ_BIBLE: Product = {
  id: "cruise-ship-dj-bible",
  slug: "cruise-ship-dj-bible",
  name: "Cruise Ship DJ Bible",
  positioning: "A guide for DJs working at sea.",
  shortDescription: "Three editions, for first-time, experienced and professional cruise ship DJs.",
  commercialModel: "VARIANT_FIXED",
  category: "EDUCATION",
  active: true,
  public: true,
  onlineCheckout: false,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: null,
  turnaround: null,
  schemaType: "ProductGroup",
  variesBy: "level",
  analyticsCategory: "Education",
  image: null,
  imageAlt: null,
  disclosures: [],
  cta: "Enquire",
  storedValue: null,
  variants: [
    djBible("beginner", "Beginner & First-Time DJs", 39999),
    djBible("experienced", "Experienced DJs", 50000),
    djBible("pro", "PRO DJ, Sound & Light Technician", 59999),
  ],
};

/* ------------------------------------------------------------------ */
/* Stored value — concept only; no ledger exists yet                   */
/* ------------------------------------------------------------------ */

export const GIFT_VOUCHER: Product = {
  id: "gift-voucher",
  slug: "gift-voucher",
  name: "MCB Gift Voucher & Account Credit",
  positioning: "Give an MCB memory, or keep credit for your own.",
  shortDescription:
    "A gift value from £10, or reloadable MCB Account Credit, spent on future MCB purchases.",
  commercialModel: "STORED_VALUE",
  category: "GIFT",
  // Not sellable until a server-side transactional ledger exists.
  active: false,
  public: false,
  onlineCheckout: false,
  requiresPersonalisation: false,
  route: null,
  deliveryClass: null,
  turnaround: null,
  schemaType: "Product",
  variesBy: null,
  analyticsCategory: "Gift",
  image: null,
  imageAlt: null,
  disclosures: ["No cash redemption."],
  cta: "Buy a Gift Voucher",
  variants: [],
  storedValue: {
    currency: "GBP",
    minimumMinor: 1000,
    partialRedemption: true,
    remainingBalance: true,
    reloadable: true,
    giftPurchase: true,
    referenceDigits: 10,
    cashRedemption: false,
  },
};

/** Display order across the site. */
export const PRODUCTS: readonly Product[] = [
  MOMENT,
  KEEPSAKE,
  JOURNEY,
  BESPOKE,
  MCB_LIVE,
  PERSONALISED_MUSIC_PLAQUE,
  LYRICS_FRAME,
  VINTAGE_SMARTPHONE_GRAMOPHONE,
  ANTIQUE_BRASS_GRAMOPHONE,
  PORTABLE_SUITCASE_RECORD_PLAYER,
  POP_UP_CARD,
  PRIORITY_REPLACEMENT,
  ARTWORK_PREPARATION,
  MEMORY_MUSIC_VIDEO,
  CRUISE_SHIP_DJ_BIBLE,
  GIFT_VOUCHER,
];

/**
 * Technical limits of one order request. Not commercial maximums: a customer
 * may buy as many Keepsakes as they like across as many orders as they need.
 */
export const ORDER_LIMITS = {
  maxLines: 20,
  maxQuantityPerLine: 50,
} as const;
