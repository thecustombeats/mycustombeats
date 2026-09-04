/**
 * MCB STRUCTURED DATA — one entity graph, one source of truth.
 *
 * Every JSON-LD block on the site is built here. Pages compose a graph from
 * these builders rather than hand-writing markup, so a price, a song count or
 * a product name can never be asserted to a crawler in a form the page itself
 * does not display.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE
 * ------------------------------------
 * Schema describes what is on the page. Not what we wish were on the page.
 * Concretely, that means:
 *
 *   • Prices come from `data/packages.ts`. Catalogue products have no approved
 *     price, so they get NO `offers` — an unpriced Product is honest, an
 *     invented Offer is not.
 *   • Song counts, positioning lines and delivery promises are read from the
 *     same objects the cards render, so "Six memories. One family story."
 *     cannot become seven in the markup.
 *   • Audio and recordings describe the eight samples the homepage actually
 *     plays. No AudioObject points at a page that is not an audio file.
 *   • No SKU, GTIN, review, rating, inventory or shipping claim is emitted
 *     anywhere, because none exists.
 *
 * ENTITY IDENTITY
 * ---------------
 * One business, one `@id`. The organisation is a single node that every other
 * entity references — not an `Organization` and a separate `OnlineStore`
 * describing the same company, which would ask a crawler to reconcile two
 * identities for one business.
 */

import { PACKAGES, FORMATS, type AnyPackage } from "../data/packages";
import {
  CATALOGUE,
  capacityLabel,
  isPriced,
  relatedFamilyIds,
  stockedFamilies,
  type CatalogueProduct,
  type ProductFamily,
} from "../data/catalogue";
import { VINYL_SIZES } from "../data/catalogue/vinyl";
import { SAMPLE_SONGS, sampleAudioPath } from "../data/sampleSongs";

/**
 * One canonical host for the whole site.
 *
 * The sitemap previously used the apex domain while Open Graph used `www`,
 * and no page emitted a canonical tag at all. `www` is what the site actually
 * serves and what Open Graph already advertised, so it wins.
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
 * Every page previously inherited one `og:image` from index.html, so a pin,
 * a shared link or a social card for the keepsakes page, the cruise funnel
 * or the partnerships page all showed the homepage hero. That is the single
 * thing standing between these pages and being pinnable.
 *
 * Kept as a route map rather than per-page tags for the same reason the
 * canonical is: a page cannot be missed, and it cannot emit two. Only images
 * that already exist and already describe the page are listed — a route with
 * no obviously right photograph is absent and falls back to the site default
 * rather than being given a borrowed one.
 *
 * `og:title` and `og:description` are deliberately not duplicated here.
 * Crawlers fall back to the page's own <title> and meta description, which
 * every page already sets, so restating them would create a second copy to
 * drift.
 */
const SHARE_IMAGES: Readonly<Record<string, { path: string; alt: string }>> = {
  "/products": {
    path: "/images/products/vinyl.jpg",
    alt: "A personalised vinyl record pressed by My Custom Beats",
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
    path: "/images/founder1-rinaldi.jpg",
    alt: "Rinaldi, founder and executive producer at My Custom Beats",
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
 * resolve to the same node wherever it is emitted. Anything referenced from
 * more than one page is defined once here.
 */
export const ENTITY = {
  organization: `${SITE_URL}/#organization`,
  website: `${SITE_URL}/#website`,
  service: `${SITE_URL}/#service`,
  packageList: `${SITE_URL}/#packages`,
  sampleList: `${SITE_URL}/#song-samples`,
  keepsakeList: `${canonical("/products")}#keepsakes`,
} as const;

const packageEntityId = (id: string) => `${SITE_URL}/#package-${id}`;
const familyEntityId = (id: string) => `${canonical("/products")}#family-${id}`;
const productEntityId = (id: string) =>
  `${canonical("/products")}#product-${id}`;
const recordingEntityId = (id: string) => `${SITE_URL}/#song-${id}`;
const audioEntityId = (id: string) => `${SITE_URL}/#audio-${id}`;
const pageEntityId = (path: string) => `${canonical(path)}#webpage`;

type Node = Record<string, unknown>;
const ref = (id: string) => ({ "@id": id });

/* ------------------------------------------------------------------ */
/* Organisation                                                        */
/* ------------------------------------------------------------------ */

/**
 * Publicly displayed contact details, and only those.
 *
 * The email and WhatsApp number below are the ones the contact section shows
 * on the page. No postal address is emitted: the site states none, and a
 * guessed address is exactly the kind of unverifiable claim that makes an
 * entity untrustworthy.
 */
const CONTACT_EMAIL = "hello@mycustombeats.com";
const CONTACT_PHONE = "+447340742009";

/**
 * `sameAs` asserts "this URL is the same entity". Only the YouTube channel is
 * unambiguously My Custom Beats. The Instagram account linked in the footer
 * belongs to a founder as an individual, so claiming it *is* the organisation
 * would merge a person and a company into one node. It is deliberately absent.
 */
const SAME_AS = ["https://www.youtube.com/@MyCustomBeats"];

const ORGANIZATION_DESCRIPTION =
  "My Custom Beats turns a memory into a personalised song, written and produced to order and delivered as vinyl, CD or MP3, alongside physical keepsakes made to hold it.";

/**
 * The single business entity.
 *
 * Typed `OnlineStore` — a subtype of Organization — because MCB both is the
 * organisation and sells directly online. One node, so `provider`, `brand`,
 * `publisher` and `seller` all resolve to the same company.
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
  // Both founders are named and pictured on the About page.
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
 * The one WebSite node. No `SearchAction` is declared: the site has no search,
 * and advertising a search endpoint that does not exist is a broken promise to
 * a crawler.
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
  type?: "WebPage" | "CollectionPage" | "AboutPage" | "FAQPage";
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
  about: ref(ENTITY.organization),
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
): Node => ({
  ...breadcrumbStructuredData(trail),
  "@context": undefined,
  "@id": `${canonical(path)}#breadcrumb`,
});

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

/**
 * What MCB actually does, as distinct from what it sells.
 *
 * No `areaServed`. The site states no territory, and the supplied reference
 * schema's `Place` named "Online" is not a place — it would assert a
 * geography that does not exist. Omitting it says nothing false.
 */
export const serviceEntity = (): Node => ({
  "@type": "Service",
  "@id": ENTITY.service,
  name: "Personalised song creation",
  serviceType: "Personalised song writing, production and delivery",
  description:
    "A song written and produced from a customer's own story, delivered digitally or pressed to vinyl or CD, with optional physical keepsakes.",
  provider: ref(ENTITY.organization),
  url: canonical("/#packages"),
  hasOfferCatalog: ref(ENTITY.packageList),
});

/* ------------------------------------------------------------------ */
/* Packages                                                            */
/* ------------------------------------------------------------------ */

/** Machine-readable delivery time, e.g. "Delivered within 15 working days". */
const deliveryDays = (pkg: AnyPackage): number | null => {
  const match = pkg.delivery.match(/(\d+)\s*(working\s*)?day/i);
  if (match) return Number(match[1]);
  if (/hour/i.test(pkg.delivery)) return 1;
  return null;
};

/**
 * The offer for one package.
 *
 * GBP only. Both currencies are displayed on the site, but a single purchase
 * is charged in one of them, and emitting two `priceCurrency` values for the
 * same offer invites a crawler to pick one arbitrarily. Sterling leads
 * everywhere on the site, so sterling is what is declared.
 *
 * Bespoke is quoted "From £799" — a floor, not a price. That is expressed as
 * one Offer whose `priceSpecification` carries `minPrice`, which is precisely
 * what schema.org defines minPrice for: "the lowest price if the price is a
 * range".
 *
 * It is deliberately NOT an AggregateOffer. AggregateOffer means "this product
 * has several offers, and here are their bounds" — it aggregates over multiple
 * offers, which is why it carries `offerCount`. Bespoke is a single commission
 * from a single seller; an aggregate of one is not an aggregate, and it would
 * describe the floor price as the cheapest of several competing offers that do
 * not exist.
 */
const packageOffer = (pkg: AnyPackage): Node => {
  const base = {
    "@type": "Offer",
    priceCurrency: "GBP",
    availability: "https://schema.org/InStock",
    url: canonical("/#packages"),
    seller: ref(ENTITY.organization),
  };

  return pkg.price.prefix
    ? {
        ...base,
        priceSpecification: {
          "@type": "PriceSpecification",
          minPrice: pkg.price.gbp,
          priceCurrency: "GBP",
        },
      }
    : { ...base, price: pkg.price.gbp };
};

/**
 * A package as a Product.
 *
 * Product rather than Service: each is a fixed, priced, purchasable thing that
 * results in a deliverable the customer keeps. The creative work behind them is
 * modelled once, as the Service above, and every package sits in its catalogue.
 */
export const packageEntity = (pkg: AnyPackage): Node => {
  const days = deliveryDays(pkg);

  return {
    "@type": "Product",
    "@id": packageEntityId(pkg.id),
    name: `MCB ${pkg.name}`,
    description: `${pkg.positioning} ${pkg.description}`,
    brand: ref(ENTITY.organization),
    category: "Personalised music",
    url: canonical("/#packages"),
    /**
     * Formats are how the package arrives, not separate products, and the song
     * count is a characteristic of it — so both are `additionalProperty`.
     *
     * The song count was previously `numberOfItems`, which schema.org defines
     * only on ItemList. A Product is not a list, so that placement was invalid
     * even though the property name itself is real vocabulary.
     */
    ...((pkg.formats.length > 0 || pkg.songCount !== null) && {
      additionalProperty: [
        ...pkg.formats.map((format) => ({
          "@type": "PropertyValue",
          name: "Available format",
          value: FORMATS[format].name,
        })),
        ...(pkg.songCount !== null
          ? [
              {
                "@type": "PropertyValue",
                name: "Songs included",
                value: pkg.songCount,
              },
            ]
          : []),
      ],
    }),
    offers: {
      ...packageOffer(pkg),
      ...(days !== null && {
        deliveryLeadTime: {
          "@type": "QuantitativeValue",
          value: days,
          unitCode: /hour/i.test(pkg.delivery) ? "HUR" : "DAY",
        },
      }),
    },
    isRelatedTo: ref(ENTITY.service),
  };
};

/**
 * The visible package comparison grid, as a catalogue.
 *
 * `OfferCatalog` is an ItemList subtype, which lets the Service point at it
 * with `hasOfferCatalog` while it still describes the real, ordered list of
 * five cards a visitor scrolls through.
 */
export const packageListEntity = (): Node => ({
  "@type": "OfferCatalog",
  "@id": ENTITY.packageList,
  name: "MCB experiences",
  description:
    "The five My Custom Beats experiences, from a one-hour Moment to a fully commissioned Bespoke project.",
  url: canonical("/#packages"),
  numberOfItems: PACKAGES.length,
  itemListElement: PACKAGES.map((pkg, index) => ({
    "@type": "ListItem",
    position: index + 1,
    item: ref(packageEntityId(pkg.id)),
  })),
});

/* ------------------------------------------------------------------ */
/* Song samples                                                        */
/* ------------------------------------------------------------------ */

/**
 * The eight samples the homepage plays.
 *
 * These are the only genuine MusicRecording entities MCB can claim: each has a
 * title, a description and a real, reachable MP3. No `byArtist`, `duration`,
 * `inAlbum` or ISRC is emitted — the site publishes none of them, and a
 * recording entity padded with invented credits is worse than a sparse one.
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
/* Catalogue: keepsakes                                                */
/* ------------------------------------------------------------------ */

/**
 * A catalogue product, with NO offer.
 *
 * Not one physical product in the MCB catalogue has an approved customer-facing
 * price — every one is quoted per commission. `isPriced` gates the offer, so
 * the moment a real price is approved this emits one, and until then it emits
 * nothing rather than a placeholder.
 */
const catalogueProductEntity = (product: CatalogueProduct): Node => ({
  "@type": "Product",
  "@id": productEntityId(product.id),
  name: product.name,
  description: product.description,
  brand: ref(ENTITY.organization),
  url: canonical("/products"),
  ...(product.image ? { image: `${SITE_URL}${product.image}` } : {}),
  ...(product.songCapacity && {
    additionalProperty: [
      {
        "@type": "PropertyValue",
        name: "Song capacity",
        value: capacityLabel(product.songCapacity),
      },
    ],
  }),
  ...(isPriced(product.price)
    ? {
        offers: {
          "@type": "Offer",
          price: product.price.gbp,
          priceCurrency: "GBP",
          seller: ref(ENTITY.organization),
        },
      }
    : {}),
});

/**
 * Vinyl is the one family with a true variant axis: the same record in three
 * diameters, differing by size and song capacity.
 *
 * `variesBy` is therefore `size` — NOT `material`. All three are vinyl; the
 * material is identical and it is the dimension that changes. Declaring
 * material would describe a difference that does not exist.
 */
const vinylProductGroupEntity = (family: ProductFamily): Node => ({
  "@type": "ProductGroup",
  "@id": familyEntityId(family.id),
  name: family.name,
  description: family.description,
  brand: ref(ENTITY.organization),
  url: canonical("/products"),
  ...(family.image ? { image: `${SITE_URL}${family.image}` } : {}),
  variesBy: ["https://schema.org/size"],
  hasVariant: VINYL_SIZES.map((product) => ({
    ...catalogueProductEntity(product),
    ...(product.songCapacity && {
      size: product.name.replace(/ Vinyl$/, ""),
    }),
  })),
});

/**
 * A family with a single product is that product, not a group of one. A group
 * wrapper around one item asserts variation that the catalogue does not have.
 */
const familyEntity = (family: ProductFamily): Node =>
  family.id === "vinyl"
    ? vinylProductGroupEntity(family)
    : {
        /**
         * A family that emits `hasVariant` must be a ProductGroup: schema.org
         * defines `hasVariant` on ProductGroup alone, so a plain Product
         * carrying variants is an invalid placement. Gift Pop-Up Cards is the
         * one family this applies to today, with ten occasion designs.
         */
        "@type": family.products.length > 1 ? "ProductGroup" : "Product",
        "@id": familyEntityId(family.id),
        name: family.name,
        description: family.description,
        brand: ref(ENTITY.organization),
        url: canonical("/products"),
        ...(family.image ? { image: `${SITE_URL}${family.image}` } : {}),
        ...(family.products.length > 1 && {
          hasVariant: family.products.map(catalogueProductEntity),
        }),
        // Declared relationships, resolved to the families they name.
        ...(relatedFamilyIds(family.id).length > 0 && {
          isRelatedTo: relatedFamilyIds(family.id)
            .filter((id) =>
              CATALOGUE.some(
                (candidate) =>
                  candidate.id === id && candidate.products.length > 0
              )
            )
            .map((id) => ref(familyEntityId(id))),
        }),
      };

/**
 * Only families with an approved product are described.
 *
 * Digital Players, Portable Gramophones, the Mobile-phone Gramophone and
 * Frames are named on the page as part of the collection, but have no product,
 * price, photograph or specification — so they are not exposed as Product
 * entities. Naming a product to a crawler that a customer cannot see or buy is
 * precisely the fabrication this file exists to prevent.
 */
export const keepsakeEntities = (): Node[] =>
  stockedFamilies().map(familyEntity);

export const keepsakeListEntity = (): Node => {
  const families = stockedFamilies();
  return {
    "@type": "ItemList",
    "@id": ENTITY.keepsakeList,
    name: "MCB memory keepsakes",
    description:
      "Physical pieces a personalised song can become: vinyl records, CDs, lyrics frames, engraved plaques, luxury memory boxes and gift pop-up cards.",
    url: canonical("/products"),
    numberOfItems: families.length,
    itemListElement: families.map((family, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: ref(familyEntityId(family.id)),
    })),
  };
};

/* ------------------------------------------------------------------ */
/* Page graphs                                                         */
/* ------------------------------------------------------------------ */

const graph = (nodes: Node[]) => ({
  "@context": "https://schema.org",
  "@graph": nodes,
});

/**
 * The homepage: who MCB is, what it does, what it sells, and what its music
 * sounds like — all in one connected graph, emitted once.
 */
export const homepageStructuredData = () =>
  graph([
    organizationEntity(),
    websiteEntity(),
    webPageEntity({
      path: "/",
      name: "Personalised Songs on Vinyl, CD & MP3 | My Custom Beats",
      description:
        "Turn a memory into a personalised song, from £10. Choose vinyl, CD or MP3. Made for cruises, weddings, anniversaries and celebrations.",
      mainEntity: ENTITY.service,
    }),
    serviceEntity(),
    packageListEntity(),
    ...PACKAGES.map(packageEntity),
    sampleListEntity(),
    ...sampleRecordingEntities(),
  ]);

/**
 * The keepsake collection. A genuine CollectionPage: it lists the catalogue.
 *
 * Organisation and website are repeated on every page graph rather than left
 * as bare `@id` references pointing at the homepage. Same `@id`, same content,
 * so they merge to one node — but each page then stands on its own if it is
 * the first or only page a crawler fetches.
 */
export const productsPageStructuredData = () =>
  graph([
    organizationEntity(),
    websiteEntity(),
    webPageEntity({
      path: "/products",
      name: "Music Keepsakes | My Custom Beats",
      description:
        "Turn your personalised song into something you can hold: vinyl in 7, 10 and 12-inch, CD, lyrics frames, engraved plaques, luxury memory boxes and gift pop-up cards.",
      type: "CollectionPage",
      mainEntity: ENTITY.keepsakeList,
      breadcrumb: `${canonical("/products")}#breadcrumb`,
    }),
    breadcrumbEntity("/products", [{ name: "Keepsakes", path: "/products" }]),
    keepsakeListEntity(),
    ...keepsakeEntities(),
  ]);

/**
 * The cruise guest funnel. A WebPage about the service, not a collection —
 * it presents one journey, and the packages it names are already defined on
 * the homepage graph, so they are referenced rather than redefined.
 */
export const cruisePageStructuredData = () =>
  graph([
    organizationEntity(),
    websiteEntity(),
    webPageEntity({
      path: "/cruise",
      name: "Cruise & Voyage Songs | My Custom Beats",
      description:
        "Turn a cruise or voyage into a personalised song written from your own story. Delivered digitally or pressed to vinyl or CD.",
      mainEntity: ENTITY.service,
      breadcrumb: `${canonical("/cruise")}#breadcrumb`,
    }),
    breadcrumbEntity("/cruise", [{ name: "Cruise & Voyage", path: "/cruise" }]),
    serviceEntity(),
  ]);

/** The About page, which is where the organisation is actually described. */
export const aboutPageStructuredData = () =>
  graph([
    organizationEntity(),
    websiteEntity(),
    webPageEntity({
      path: "/about",
      name: "About My Custom Beats",
      description:
        "Meet the founders and the global collective of professional musicians who turn your memories into personalised songs and keepsakes.",
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
    organizationEntity(),
    websiteEntity(),
    {
      ...webPageEntity({
        path: "/faq",
        name: "Frequently Asked Questions | My Custom Beats",
        description:
          "How personalised songs work, what each experience includes, available formats and delivery times.",
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
export const siteStructuredData = () =>
  graph([organizationEntity(), websiteEntity()]);

/** Product + Offer for each experience, for any page that needs them alone. */
export const packagesStructuredData = () =>
  graph([packageListEntity(), ...PACKAGES.map(packageEntity)]);
