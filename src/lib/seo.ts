import { PACKAGES, FORMATS, type AnyPackage } from "../data/packages";

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

/** Machine-readable delivery time, e.g. "Delivered within 15 working days". */
const deliveryDays = (pkg: AnyPackage): number | null => {
  const match = pkg.delivery.match(/(\d+)\s*(working\s*)?day/i);
  if (match) return Number(match[1]);
  if (/hour/i.test(pkg.delivery)) return 1;
  return null;
};

/**
 * Product + Offer for each experience. Prices, availability and delivery all
 * come from the central package data, so structured data cannot drift away
 * from what the customer can see on the page.
 */
export const packagesStructuredData = () => ({
  "@context": "https://schema.org",
  "@graph": PACKAGES.map((pkg) => {
    const days = deliveryDays(pkg);
    return {
      "@type": "Product",
      "@id": `${SITE_URL}/#package-${pkg.id}`,
      name: `MCB ${pkg.name}`,
      description: pkg.description,
      brand: { "@type": "Brand", name: "My Custom Beats" },
      category: "Personalised music",
      ...(pkg.formats.length > 0 && {
        additionalProperty: pkg.formats.map((format) => ({
          "@type": "PropertyValue",
          name: "Available format",
          value: FORMATS[format].name,
        })),
      }),
      offers: {
        "@type": "Offer",
        url: canonical("/#packages"),
        price: pkg.price.gbp,
        priceCurrency: "GBP",
        availability: "https://schema.org/InStock",
        ...(days !== null && {
          deliveryLeadTime: {
            "@type": "QuantitativeValue",
            value: days,
            unitCode: /hour/i.test(pkg.delivery) ? "HUR" : "DAY",
          },
        }),
      },
    };
  }),
});

/** Site-level identity. Emitted once, from the homepage. */
export const siteStructuredData = () => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      url: SITE_URL,
      name: "My Custom Beats",
      description:
        "Personalised songs and luxury keepsakes crafted from your memories.",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "WebPage",
      "@id": `${SITE_URL}/#webpage`,
      url: SITE_URL,
      name: "My Custom Beats",
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
  ],
});

/** Breadcrumbs for a sub-page. */
export const breadcrumbStructuredData = (
  trail: { name: string; path: string }[]
) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { name: "Home", path: "/" },
    ...trail,
  ].map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: canonical(crumb.path),
  })),
});
