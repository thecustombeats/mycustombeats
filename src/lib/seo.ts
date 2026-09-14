/**
 * MCB STRUCTURED DATA — one entity graph, one source of truth.
 *
 * Every JSON-LD block on the site is built here. Pages compose a graph from
 * these builders rather than hand-writing markup, so a price, a song count or
 * a product name can never be asserted to a crawler in a form the page itself
 * does not display.
 *
 * THE RULES THIS FILE EXISTS TO ENFORCE
 * -------------------------------------
 * Schema describes what is on the page. Not what we wish were on the page.
 *
 *   • Every commercial fact — name, price, SKU, song count, record format,
 *     dimensions — is read from the canonical catalogue
 *     (`data/catalogue/products.ts`). Nothing here restates a price.
 *
 *   • The node TYPE follows the catalogue's commercial semantics
 *     (`schemaType` and `commercialModel`), never the mere presence of a
 *     number:
 *
 *       FIXED + Product        → Product with one Offer
 *       FIXED + Service        → Service with one Offer
 *       VARIANT_FIXED          → ProductGroup; each variant a Product with its
 *                                own SKU and Offer
 *       QUOTED                 → Service with NO offers, price or
 *                                priceSpecification. Quoted work has no figure
 *                                that is true before the consultation, and a
 *                                floor or a guess published to a crawler is a
 *                                price claim the customer never sees.
 *       STORED_VALUE, inactive,
 *       or non-public          → not emitted at all
 *
 *   • Only products the site actually shows are emitted: those with a page of
 *     their own, and the add-ons listed on /products.
 *
 *   • Prices are exact decimal strings from integer pence ("149.99"), never
 *     float arithmetic.
 *
 *   • No GTIN, review, aggregateRating, inventory level or shipping claim is
 *     emitted anywhere, because none exists.
 *
 * ENTITY IDENTITY
 * ---------------
 * One business, one `@id`. The organisation is a single node that every other
 * entity references — not an `Organization` and a separate `OnlineStore`
 * describing the same company.
 */

import {
  PRODUCTS,
  addOnProducts,
  getProduct,
  minorToDecimal,
  type Product,
  type Variant,
} from "../data/catalogue";
import { SAMPLE_SONGS, sampleAudioPath } from "../data/sampleSongs";

/**
 * One canonical host for the whole site. `www` is what the site actually
 * serves and what Open Graph advertises.
 */
export const SITE_URL = "https://www.mycustombeats.com";

export const canonical = (path = "/") =>
  `${SITE_URL}${path === "/" ? "" : path}`;

/* ------------------------------------------------------------------ */
/* Social / discovery images                                           */
/* ------------------------------------------------------------------ */

/**
 * The share image for each route.
 *
 * Only images that already exist and genuinely describe the page are listed.
 * A route with no obviously right photograph falls back to the site default
 * rather than being given a borrowed one — Keepsake in particular is absent,
 * because the only record photograph on the site is a standard black vinyl,
 * and Keepsake is a picture disc.
 *
 * `og:title` and `og:description` are deliberately not duplicated here;
 * crawlers fall back to each page's own <title> and meta description.
 */
const SHARE_IMAGES: Readonly<Record<string, { path: string; alt: string }>> = {
  "/products": {
    path: "/images/products/artwork.jpg",
    alt: "Framed lyric artwork by My Custom Beats",
  },
  "/journey": {
    path: "/images/products/vinyl.jpg",
    alt: "A personalised album on standard vinyl with its printed sleeve",
  },
  "/bespoke": {
    path: "/images/gift-box-hands.jpg",
    alt: "A gift box tied with a gold ribbon, held at sunset by the sea",
  },
  "/cruise": {
    path: "/images/hero-cruise.jpg",
    alt: "A voyage at sea",
  },
  "/partners": {
    path: "/images/hero-cruise-couple.jpg",
    alt: "Guests aboard a luxury cruise",
  },
  "/occasions": {
    path: "/images/occasions/travel.jpg",
    alt: "A personalised song for a journey",
  },
  "/about": {
    path: "/images/responsive/family-terrace-1600.jpg",
    alt: "A family celebrating together — the moments My Custom Beats turns into music",
  },
  "/anniversary-song": {
    path: "/images/sample-anniversary.jpg",
    alt: "A personalised anniversary song",
  },
};

/** Site-wide default, matching the static tag in index.html. */
const DEFAULT_SHARE_IMAGE = {
  path: "/images/hero-1.jpg",
  alt: "My Custom Beats — personalised songs and keepsakes",
};

export const shareImageFor = (path: string) => {
  const image = SHARE_IMAGES[path] ?? DEFAULT_SHARE_IMAGE;
  return { url: `${SITE_URL}${image.path}`, alt: image.alt };
};

/* ------------------------------------------------------------------ */
/* Stable entity ids                                                   */
/* ------------------------------------------------------------------ */

/**
 * Fragment ids are stable across deployments and pages, so `@id` references
 * resolve to the same node wherever it is emitted.
 */
export const ENTITY = {
  organization: `${SITE_URL}/#organization`,
  website: `${SITE_URL}/#website`,
  service: `${SITE_URL}/#service`,
  experienceList: `${SITE_URL}/#packages`,
  sampleList: `${SITE_URL}/#song-samples`,
  productList: `${canonical("/products")}#products`,
} as const;

/** The page a product is shown on: its own route, or /products for add-ons. */
const productPagePath = (product: Product): string => product.route ?? "/products";

/**
 * A routed product is THE subject of its page, so it is `…/keepsake#product`.
 * Add-ons share /products, so their fragment carries the product id.
 */
const productEntityId = (product: Product): string =>
  product.route
    ? `${canonical(product.route)}#product`
    : `${canonical("/products")}#product-${product.id}`;

const variantEntityId = (product: Product, variant: Variant): string =>
  `${canonical(productPagePath(product))}#variant-${variant.sku}`;

const recordingEntityId = (id: string) => `${SITE_URL}/#song-${id}`;
const audioEntityId = (id: string) => `${SITE_URL}/#audio-${id}`;
const pageEntityId = (path: string) => `${canonical(path)}#webpage`;

type Node = Record<string, unknown>;
const ref = (id: string) => ({ "@id": id });

/* ------------------------------------------------------------------ */
/* Organisation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Publicly displayed contact details, and only those. No postal address is
 * emitted: the site states none.
 */
const CONTACT_EMAIL = "hello@mycustombeats.com";
const CONTACT_PHONE = "+447340742009";

/**
 * `sameAs` asserts "this URL is the same entity". Only the YouTube channel is
 * unambiguously My Custom Beats; a founder's personal Instagram is not the
 * organisation and is deliberately absent.
 */
const SAME_AS = ["https://www.youtube.com/@MyCustomBeats"];

/**
 * MUST STAY IDENTICAL to the static Organization JSON-LD in index.html.
 * Format-neutral on purpose: Moment is delivered digitally, Keepsake is a
 * picture disc, Journey is standard vinyl — "digitally or on vinyl" is true of
 * all of them and names no retired format.
 */
const ORGANIZATION_DESCRIPTION =
  "My Custom Beats turns a memory into a personalised song, written and produced to order and delivered digitally or on vinyl, alongside personalised keepsakes made to hold it.";

/**
 * The single business entity. Typed `OnlineStore` — a subtype of
 * Organization — because MCB both is the organisation and sells directly
 * online. One node, so `provider`, `brand` and `seller` all resolve to it.
 */
export const organizationEntity = (): Node => ({
  "@type": "OnlineStore",
  "@id": ENTITY.organization,
  name: "My Custom Beats",
  alternateName: "MCB",
  url: canonical("/"),
  description: ORGANIZATION_DESCRIPTION,
  logo: {
    "@type": "ImageObject",
    "@id": `${SITE_URL}/#logo`,
    url: `${SITE_URL}/images/brand/MCB-Logo-Final.png`,
    caption: "My Custom Beats",
  },
  image: ref(`${SITE_URL}/#logo`),
  email: CONTACT_EMAIL,
  telephone: CONTACT_PHONE,
  sameAs: SAME_AS,
  // Both founders are named on the About page. Names pending founder confirmation.
  founder: [
    { "@type": "Person", name: "Rinaldi" },
    { "@type": "Person", name: "Shobha (Bella) Menezes" },
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: CONTACT_EMAIL,
    telephone: CONTACT_PHONE,
    url: canonical("/#contact"),
  },
});

/* ------------------------------------------------------------------ */
/* Website and pages                                                   */
/* ------------------------------------------------------------------ */

/**
 * The one WebSite node. No `SearchAction`: the site has no search.
 */
export const websiteEntity = (): Node => ({
  "@type": "WebSite",
  "@id": ENTITY.website,
  url: canonical("/"),
  name: "My Custom Beats",
  description: ORGANIZATION_DESCRIPTION,
  publisher: ref(ENTITY.organization),
  inLanguage: "en-GB",
});

interface PageOptions {
  path: string;
  name: string;
  description: string;
  /** WebPage subtype, where the page genuinely is one. */
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "FAQPage" | "ItemPage";
  /** The thing the page is primarily about. */
  mainEntity?: string;
  breadcrumb?: string;
}

export const webPageEntity = ({
  path,
  name,
  description,
  type = "WebPage",
  mainEntity,
  breadcrumb,
}: PageOptions): Node => ({
  "@type": type,
  "@id": pageEntityId(path),
  url: canonical(path),
  name,
  description,
  isPartOf: ref(ENTITY.website),
  about: ref(mainEntity ?? ENTITY.organization),
  inLanguage: "en-GB",
  ...(mainEntity ? { mainEntity: ref(mainEntity) } : {}),
  ...(breadcrumb ? { breadcrumb: ref(breadcrumb) } : {}),
});

/** Breadcrumbs for a sub-page. */
export const breadcrumbStructuredData = (
  trail: { name: string; path: string }[]
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [{ name: "Home", path: "/" }, ...trail].map(
    (crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: canonical(crumb.path),
    })
  ),
});

const breadcrumbEntity = (
  path: string,
  trail: { name: string; path: string }[]
): Node => {
  // A node inside @graph carries no @context of its own.
  const list: Node = { ...breadcrumbStructuredData(trail) };
  delete list["@context"];
  return { ...list, "@id": `${canonical(path)}#breadcrumb` };
};

/* ------------------------------------------------------------------ */
/* Page copy shared with <meta> tags                                   */
/* ------------------------------------------------------------------ */

/**
 * The homepage title and description, exported so the homepage <Helmet>, the
 * static fallback in index.html and the WebPage node state the same thing.
 * Price-free by design: the prices live on the product cards and in the
 * product nodes, read from the catalogue.
 */
export const HOMEPAGE_TITLE = "Personalised Songs & Vinyl Keepsakes | My Custom Beats";
export const HOMEPAGE_DESCRIPTION =
  "Turn a memory into a personalised song, written from your own story and delivered digitally or on vinyl. Made for cruises, weddings, anniversaries and celebrations.";

export const CRUISE_DESCRIPTION =
  "Turn a cruise or voyage into a personalised song written from your own story. Delivered digitally or on vinyl.";

const listOf = (names: readonly string[]): string =>
  names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/**
 * The one description of the /products collection, derived from the add-ons
 * the catalogue says may be shown and sold there. A product added to or
 * withdrawn from the catalogue changes this sentence with it.
 */
export const PRODUCTS_DESCRIPTION = `Pieces to keep alongside your personalised song: ${listOf(
  addOnProducts().map((product) => product.name)
)}.`;

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * What MCB actually does, as distinct from what it sells. No `areaServed`:
 * the site states no territory.
 */
export const serviceEntity = (): Node => ({
  "@type": "Service",
  "@id": ENTITY.service,
  name: "Personalised song creation",
  serviceType: "Personalised song writing, production and delivery",
  description:
    "A song written and produced from a customer's own story, delivered digitally or on vinyl.",
  provider: ref(ENTITY.organization),
  url: canonical("/#packages"),
  hasOfferCatalog: ref(ENTITY.experienceList),
});

/* ------------------------------------------------------------------ */
/* Catalogue → structured data                                         */
/* ------------------------------------------------------------------ */

/**
 * Whether a product may appear in structured data at all.
 *
 * Active and public, not stored value, and actually shown on the site: either
 * it has a page of its own, or it is one of the add-ons /products lists. The
 * Cruise Ship DJ Bible is active and public in the catalogue but has no page
 * and cannot be ordered, so it is not described to crawlers.
 */
export const isEmittedProduct = (product: Product): boolean =>
  product.active &&
  product.public &&
  product.commercialModel !== "STORED_VALUE" &&
  (product.route !== null || addOnProducts().some((addOn) => addOn.id === product.id));

/** Every product that structured data describes, in catalogue display order. */
export const emittedProducts = (): readonly Product[] => PRODUCTS.filter(isEmittedProduct);

/** Sentences end in one full stop, whatever the catalogue line ends in. */
const sentence = (text: string): string => {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
};

/**
 * Positioning, description and the disclosures that must accompany the
 * product wherever it is sold — so "not a Picture Disc" and "does not play
 * music" travel with the product into search, not just onto its page.
 */
const productDescription = (product: Product): string =>
  [
    ...new Set([product.positioning, product.shortDescription, ...product.disclosures].map(sentence)),
  ].join(" ");

/**
 * Made-to-order products are declared `MadeToOrder`, a real ItemAvailability
 * member that Google supports. Declaring `InStock` for a record pressed after
 * the order is placed would imply stock that does not exist. Digital work and
 * finished goods with no made-to-order basis are `InStock`.
 */
const availabilityFor = (product: Product): string =>
  product.turnaround?.basis === "MADE_TO_ORDER"
    ? "https://schema.org/MadeToOrder"
    : "https://schema.org/InStock";

/** One GBP Offer for one variant, at its exact catalogue price. */
const offerFor = (product: Product, variant: Variant): Node => ({
  "@type": "Offer",
  price: minorToDecimal(variant.price.minor),
  priceCurrency: variant.price.currency,
  availability: availabilityFor(product),
  url: canonical(productPagePath(product)),
  seller: ref(ENTITY.organization),
});

const property = (name: string, value: string | number | boolean, unitCode?: string): Node => ({
  "@type": "PropertyValue",
  name,
  value,
  ...(unitCode ? { unitCode } : {}),
});

/** UN/CEFACT code for inch. */
const INCH = "INH";

const inches = (value: number): Node => ({
  "@type": "QuantitativeValue",
  value,
  unitCode: INCH,
});

/**
 * The truthful, variant-level facts.
 *
 * Every value is a field on the catalogue variant. Booleans are emitted as
 * booleans in both directions where the distinction matters to a buyer —
 * Journey states `Picture disc: false` explicitly, because it is the fact most
 * likely to be assumed wrongly.
 */
const variantProperties = (product: Product, variant: Variant): Node[] => {
  const props: Node[] = [];

  if (variant.songCount !== null) {
    props.push(property("Personalised songs included", variant.songCount));
  }

  if (variant.vinyl) {
    const { vinyl } = variant;
    props.push(
      property("Record type", vinyl.pictureDisc ? "Picture disc" : "Standard vinyl"),
      property("Picture disc", vinyl.pictureDisc),
      property("Record size", vinyl.sizeInches, INCH),
      property("Record shape", vinyl.shape === "HEART" ? "Heart" : "Round"),
      property("Number of records", vinyl.discCount),
      property("Gatefold sleeve", vinyl.gatefold)
    );
  }

  if (variant.songCount !== null) {
    // Stated only where included; the absence of a claim is not a claim.
    if (variant.artworkIncluded) props.push(property("Personalised artwork included", true));
    if (variant.masteringIncluded) props.push(property("Mastering included", true));
    if (product.revisions) props.push(property("Revisions", product.revisions));
  }

  // Approximate sizes are not published until they are verified.

  return props;
};

/**
 * Physical size, where the catalogue states an exact one. Approximate sizes
 * are described in `additionalProperty` instead, because `width`/`height` as
 * QuantitativeValues read as measurements.
 */
const variantDimensions = (variant: Variant): Node =>
  variant.dimensions && !variant.dimensions.approximate
    ? {
        width: inches(variant.dimensions.widthInches),
        height: inches(variant.dimensions.heightInches),
      }
    : {};

/**
 * The `size` text for a variant of a ProductGroup that varies by size.
 *
 * For a record it is the diameter, plus the shape where the shape is part of
 * the size a customer chooses (the heart-shaped 10-inch disc is a different
 * size option from the round 10-inch). For a frame it is its dimensions.
 */
const variantSize = (variant: Variant): string | null => {
  if (variant.vinyl) {
    return `${variant.vinyl.sizeInches}-inch${variant.vinyl.shape === "HEART" ? " heart-shaped" : ""}`;
  }
  if (variant.dimensions) {
    return `${variant.dimensions.widthInches} × ${variant.dimensions.heightInches} inches`;
  }
  return null;
};

const imageFor = (product: Product): Node =>
  product.image ? { image: `${SITE_URL}${product.image}` } : {};

/** The fields every product node shares. */
const baseProductFields = (product: Product): Node => ({
  name: product.name,
  description: productDescription(product),
  url: canonical(productPagePath(product)),
  category: product.analyticsCategory,
  ...imageFor(product),
});

/** One variant as a Product with its own SKU and Offer. */
const variantEntity = (product: Product, variant: Variant, inGroup: boolean): Node => {
  const props = variantProperties(product, variant);
  const size = inGroup && product.variesBy === "size" ? variantSize(variant) : null;
  return {
    "@type": "Product",
    "@id": variantEntityId(product, variant),
    sku: variant.sku,
    name: variant.name,
    description: [product.shortDescription, ...variant.features].map(sentence).join(" "),
    url: canonical(productPagePath(product)),
    brand: ref(ENTITY.organization),
    category: product.analyticsCategory,
    ...imageFor(product),
    ...(inGroup ? { inProductGroupWithID: product.id } : {}),
    ...(size ? { size } : {}),
    ...variantDimensions(variant),
    ...(props.length > 0 ? { additionalProperty: props } : {}),
    offers: offerFor(product, variant),
  };
};

/**
 * `variesBy` as schema.org can honestly express it.
 *
 * Keepsake and Lyrics Frames vary by physical size → `https://schema.org/size`,
 * and each variant carries a `size`.
 *
 * Journey varies by song count, and there is no schema.org property for "how
 * many songs". Declaring `size` would be false (both are 12-inch records) and
 * Google accepts only colour, size, age, gender, material and pattern. So
 * `variesBy` is OMITTED, and the difference is stated truthfully on each
 * variant in `additionalProperty` ("Personalised songs included", "Number of
 * records", "Gatefold sleeve") and in the variant name.
 */
const variesByFor = (product: Product): Node =>
  product.variesBy === "size" ? { variesBy: ["https://schema.org/size"] } : {};

/** `serviceType` for the catalogue categories that are sold as a Service. */
const SERVICE_TYPE: Partial<Record<Product["category"], string>> = {
  COMMISSION: "Personalised music commission",
  LIVE_PERFORMANCE: "Live DJ performance",
  PROTECTION: "Priority replacement for eligible damaged or faulty keepsakes",
};

/**
 * One catalogue product as its structured-data node, or `null` when the
 * product must not be described (see `isEmittedProduct`).
 *
 * The switch is on commercial semantics — `commercialModel` and `schemaType`
 * — so a quoted service can never acquire an Offer by accident, and a fixed
 * service keeps its genuine one.
 */
export const productEntity = (product: Product): Node | null => {
  if (!isEmittedProduct(product)) return null;

  const id = productEntityId(product);

  switch (product.commercialModel) {
    case "QUOTED":
      /**
       * NO `offers`, `price` or `priceSpecification` — not an Offer with the
       * price omitted and not a floor. There is no figure that is true before
       * the consultation has happened.
       */
      return {
        "@type": "Service",
        "@id": id,
        ...baseProductFields(product),
        serviceType: SERVICE_TYPE[product.category] ?? product.analyticsCategory,
        provider: ref(ENTITY.organization),
        brand: ref(ENTITY.organization),
      };

    case "FIXED": {
      const variant = product.variants[0];
      if (!variant) return null;
      if (product.schemaType === "Service") {
        return {
          "@type": "Service",
          "@id": id,
          ...baseProductFields(product),
          serviceType: SERVICE_TYPE[product.category] ?? product.analyticsCategory,
          provider: ref(ENTITY.organization),
          brand: ref(ENTITY.organization),
          offers: offerFor(product, variant),
        };
      }
      const props = variantProperties(product, variant);
      return {
        "@type": "Product",
        "@id": id,
        ...baseProductFields(product),
        sku: variant.sku,
        brand: ref(ENTITY.organization),
        ...variantDimensions(variant),
        ...(props.length > 0 ? { additionalProperty: props } : {}),
        offers: offerFor(product, variant),
      };
    }

    case "VARIANT_FIXED":
      if (product.variants.length === 0) return null;
      return {
        "@type": "ProductGroup",
        "@id": id,
        ...baseProductFields(product),
        productGroupID: product.id,
        brand: ref(ENTITY.organization),
        ...variesByFor(product),
        hasVariant: product.variants.map((variant) => variantEntity(product, variant, true)),
      };

    case "STORED_VALUE":
    default:
      return null;
  }
};

const productNodes = (products: readonly Product[]): Node[] =>
  products.map(productEntity).filter((node): node is Node => node !== null);

/** The experiences a visitor chooses between on the homepage. */
const experienceProducts = (): readonly Product[] =>
  emittedProducts().filter(
    (product) => product.category === "SONG_EXPERIENCE" || product.category === "COMMISSION"
  );

/** The add-ons listed on /products. */
const listedAddOns = (): readonly Product[] =>
  emittedProducts().filter((product) => product.route === null);

const itemList = (products: readonly Product[]) => ({
  numberOfItems: products.length,
  itemListElement: products.map((product, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: ref(productEntityId(product)),
  })),
});

/**
 * The experience cards, as a catalogue the Service points at with
 * `hasOfferCatalog`. The count and order are the catalogue's.
 */
export const experienceListEntity = (): Node => {
  const products = experienceProducts();
  return {
    "@type": "OfferCatalog",
    "@id": ENTITY.experienceList,
    name: "MCB experiences",
    description: `The My Custom Beats experiences: ${listOf(products.map((p) => p.name))}.`,
    url: canonical("/#packages"),
    ...itemList(products),
  };
};

/** The /products collection. */
export const productListEntity = (): Node => {
  const products = listedAddOns();
  return {
    "@type": "ItemList",
    "@id": ENTITY.productList,
    name: "MCB personalised pieces and players",
    description: PRODUCTS_DESCRIPTION,
    url: canonical("/products"),
    ...itemList(products),
  };
};

/* ------------------------------------------------------------------ */
/* Song samples                                                        */
/* ------------------------------------------------------------------ */

/**
 * The samples the homepage plays: genuine MusicRecordings with a real,
 * reachable MP3. No `byArtist`, `duration`, `inAlbum` or ISRC is emitted —
 * the site publishes none of them.
 */
export const sampleRecordingEntities = (): Node[] =>
  SAMPLE_SONGS.flatMap((song) => [
    {
      "@type": "MusicRecording",
      "@id": recordingEntityId(song.id),
      name: song.title,
      description: song.story,
      url: canonical("/#samples"),
      image: `${SITE_URL}${song.image}`,
      genre: song.tag,
      publisher: ref(ENTITY.organization),
      audio: ref(audioEntityId(song.id)),
    },
    {
      "@type": "AudioObject",
      "@id": audioEntityId(song.id),
      name: song.title,
      description: song.story,
      contentUrl: `${SITE_URL}${sampleAudioPath(song)}`,
      encodingFormat: "audio/mpeg",
      publisher: ref(ENTITY.organization),
    },
  ]);

export const sampleListEntity = (): Node => ({
  "@type": "ItemList",
  "@id": ENTITY.sampleList,
  name: "Personalised song samples",
  description:
    "Examples of personalised songs written for anniversaries, honeymoons, family reunions, proposals, birthdays and personal milestones.",
  url: canonical("/#samples"),
  numberOfItems: SAMPLE_SONGS.length,
  itemListElement: SAMPLE_SONGS.map((song, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: ref(recordingEntityId(song.id)),
  })),
});

/* ------------------------------------------------------------------ */
/* Page graphs                                                         */
/* ------------------------------------------------------------------ */

const graph = (nodes: Node[]) => ({
  "@context": "https://schema.org",
  "@graph": nodes,
});

/**
 * Organisation and website are repeated on every page graph rather than left
 * as bare `@id` references. Same `@id`, same content, so they merge to one
 * node — but each page stands on its own if it is the only one fetched.
 */
const identity = (): Node[] => [organizationEntity(), websiteEntity()];

/**
 * The homepage: who MCB is, what it does, the experiences it offers, and what
 * its music sounds like.
 */
export const homepageStructuredData = () =>
  graph([
    ...identity(),
    webPageEntity({
      path: "/",
      name: HOMEPAGE_TITLE,
      description: HOMEPAGE_DESCRIPTION,
      mainEntity: ENTITY.service,
    }),
    serviceEntity(),
    experienceListEntity(),
    ...productNodes(experienceProducts()),
    sampleListEntity(),
    ...sampleRecordingEntities(),
  ]);

/**
 * The page for one routed product: /moment, /keepsake, /journey, /bespoke,
 * /mcb-live, /priority-replacement.
 *
 * A product that must not be emitted, or has no route of its own, yields the
 * page identity alone — never a guessed product node.
 */
export const productPageStructuredData = (productId: string) => {
  const product = getProduct(productId);
  if (!product || !product.route || !isEmittedProduct(product)) {
    return graph(identity());
  }

  const path = product.route;
  const node = productEntity(product);
  const mainEntity = node ? productEntityId(product) : undefined;

  return graph([
    ...identity(),
    webPageEntity({
      path,
      name: `${product.name} | My Custom Beats`,
      description: product.shortDescription,
      type: node && node["@type"] !== "Service" ? "ItemPage" : "WebPage",
      mainEntity,
      breadcrumb: `${canonical(path)}#breadcrumb`,
    }),
    breadcrumbEntity(path, [{ name: product.name, path }]),
    ...(node ? [node] : []),
  ]);
};

/** The /products collection: a genuine CollectionPage listing the add-ons. */
export const productsPageStructuredData = () =>
  graph([
    ...identity(),
    webPageEntity({
      path: "/products",
      name: "Personalised Pieces & Players | My Custom Beats",
      description: PRODUCTS_DESCRIPTION,
      type: "CollectionPage",
      mainEntity: ENTITY.productList,
      breadcrumb: `${canonical("/products")}#breadcrumb`,
    }),
    breadcrumbEntity("/products", [{ name: "Products", path: "/products" }]),
    productListEntity(),
    ...productNodes(listedAddOns()),
  ]);

/**
 * The cruise guest funnel. A WebPage about the service; the experiences it
 * names are defined on their own pages and referenced from the homepage.
 */
export const cruisePageStructuredData = () =>
  graph([
    ...identity(),
    webPageEntity({
      path: "/cruise",
      name: "Cruise & Voyage Songs | My Custom Beats",
      description: CRUISE_DESCRIPTION,
      mainEntity: ENTITY.service,
      breadcrumb: `${canonical("/cruise")}#breadcrumb`,
    }),
    breadcrumbEntity("/cruise", [{ name: "Cruise & Voyage", path: "/cruise" }]),
    serviceEntity(),
  ]);

/** The About page, which is where the organisation is actually described. */
export const aboutPageStructuredData = () =>
  graph([
    ...identity(),
    webPageEntity({
      path: "/about",
      name: "About My Custom Beats",
      description:
        "Meet the founders and the musicians who turn your memories into personalised songs and keepsakes.",
      type: "AboutPage",
      mainEntity: ENTITY.organization,
      breadcrumb: `${canonical("/about")}#breadcrumb`,
    }),
    breadcrumbEntity("/about", [{ name: "About", path: "/about" }]),
  ]);

/**
 * The FAQ. `mainEntity` is supplied by the page from its visible accordion,
 * so the markup cannot answer a question the page does not ask.
 */
export const faqPageStructuredData = (
  faqs: readonly { question: string; answer: string }[]
) =>
  graph([
    ...identity(),
    {
      ...webPageEntity({
        path: "/faq",
        name: "Frequently Asked Questions | My Custom Beats",
        description:
          "How personalised songs work, what each experience includes, how your music is delivered and how long it takes.",
        type: "FAQPage",
        breadcrumb: `${canonical("/faq")}#breadcrumb`,
      }),
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    breadcrumbEntity("/faq", [{ name: "FAQ", path: "/faq" }]),
  ]);

/**
 * Retained for pages that only need identity, not a full graph.
 * @deprecated Prefer a page-specific graph builder above.
 */
export const siteStructuredData = () => graph(identity());

/** The experience catalogue and its product nodes, for any page that needs them alone. */
export const packagesStructuredData = () =>
  graph([experienceListEntity(), ...productNodes(experienceProducts())]);
