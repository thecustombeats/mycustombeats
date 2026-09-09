/**
 * COMPLETE YOUR MEMORY — the enhancement basket, client side.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS FOR, AND WHAT IT IS NOT FOR
 * ─────────────────────────────────────────────────────────────────────────
 * This resolves ids and quantities into names, prices and a total so the page
 * can SHOW the customer what they are choosing. It is a preview.
 *
 * It is not the charge. `api/lib/basket.php` prices the same basket again
 * from `api/data/catalogue.json`, and that result is what Stripe receives.
 * The two agree because both read the same commercial source — the PHP
 * catalogue is generated from this TypeScript at build time — but if they
 * ever disagreed, the server would win and the customer would be charged the
 * server's answer.
 *
 * That is why the basket state is ids and integers. There is no field in
 * `BasketItem` for a price, and nothing here writes one back into state, so
 * there is no browser-held amount that could be submitted as authoritative.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE INVENTORY, DERIVED
 * ─────────────────────────────────────────────────────────────────────────
 * The selectable list is built from `ALL_PRODUCTS` and `ENHANCEMENTS`. No
 * component holds an array of product names or prices, so a repricing or a
 * retirement in the catalogue changes this stage without anyone editing it —
 * and an unpriced product cannot appear at all, because `isPriced` gates it.
 */

import {
  ALL_PRODUCTS,
  ENHANCEMENTS,
  isEnhancementEligible,
  isPriced,
  type CatalogueEnhancement,
  type CatalogueProduct,
} from "../data/catalogue";
import { getPackage, type AnyPackage } from "../data/packages";

/* ------------------------------------------------------------------ */
/* Basket state                                                        */
/* ------------------------------------------------------------------ */

/**
 * One chosen line. Ids and integers only — deliberately no price, no name
 * and no currency.
 */
export interface BasketItem {
  id: string;
  quantity: number;
  /**
   * The chosen variant, where the offer has one — a Gift Pop-Up Card occasion.
   *
   * Held as the VARIANT'S OWN catalogue id, so it resolves to a real product
   * with its own name and price rather than a loose string the server would
   * have to interpret.
   */
  variantId?: string;
}

/* ------------------------------------------------------------------ */
/* What can be offered                                                 */
/* ------------------------------------------------------------------ */

/**
 * One thing the customer may add, however the catalogue happens to model it.
 *
 * Products and enhancements are different shapes in the data for good
 * commercial reasons (see `enhancements.ts`), but they are the same kind of
 * decision to a customer. Flattening them here means the UI has one list to
 * render rather than two, without merging the underlying models.
 */
export interface Offer {
  id: string;
  name: string;
  description: string;
  /** The approved GBP unit price. Read for display; never stored in state. */
  unitGbp: number;
  /** 1 for a product; the approved ceiling for a quantity-bearing offer. */
  maxQuantity: number;
  /** Names the counted thing, e.g. "copy". Absent when quantity is fixed at 1. */
  unitLabel?: string;
  /** True when adding this obliges MCB to post something. */
  physical: boolean;
  /** Occasion-style variants the customer picks between, where they exist. */
  variants?: readonly { id: string; label: string }[];
  image?: string;
  alt?: string;
}

/**
 * Gift Pop-Up Cards are ten occasion designs at ONE price.
 *
 * Presented as a single offer with a variant choice rather than ten separate
 * cards: they are one product decision followed by one occasion decision, and
 * ten £50 tiles in a row would read as ten different things to buy. The
 * chosen variant is still a real catalogue product id, so fulfilment gets an
 * exact design rather than a free-text occasion.
 */
const CARD_FAMILY_PREFIX = "gift-pop-up-card-";

const productOffer = (product: CatalogueProduct): Offer | null => {
  if (!isPriced(product.price)) return null;
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    unitGbp: product.price.gbp,
    // Nothing in the catalogue approves buying two of a commissioned piece.
    maxQuantity: 1,
    physical: product.fulfilment === "PHYSICAL",
    ...(product.image ? { image: product.image } : {}),
    ...(product.alt ? { alt: product.alt } : {}),
  };
};

const enhancementOffer = (enhancement: CatalogueEnhancement): Offer | null => {
  if (!isPriced(enhancement.unitPrice)) return null;
  return {
    id: enhancement.id,
    name: enhancement.name,
    description: enhancement.description,
    unitGbp: enhancement.unitPrice.gbp,
    maxQuantity: enhancement.maxQuantity,
    unitLabel: enhancement.unitLabel,
    physical: enhancement.fulfilment === "PHYSICAL",
  };
};

/**
 * Everything MCB can offer alongside a given package and format.
 *
 * ELIGIBILITY IS DERIVED FROM THE COMMERCIAL DATA, not from rules invented
 * here:
 *
 *   • an enhancement declares its own eligible packages AND formats, so the
 *     Additional Vinyl Copy appears only when the order actually contains a
 *     record to make another copy of;
 *   • a product declares `compatiblePackages` when the business has
 *     restricted it, and none currently does — so the gifting pieces are
 *     offered with every experience, which is what the data says.
 *
 * The server enforces exactly the same two rules from the generated
 * catalogue, so nothing selectable here can be rejected there.
 */
export const offersFor = (
  packageId: string,
  format: string | null
): readonly Offer[] => {
  const pkg = getPackage(packageId);
  if (!pkg) return [];

  const products = ALL_PRODUCTS.flatMap((product) => {
    // Card variants are folded into one offer below.
    if (product.id.startsWith(CARD_FAMILY_PREFIX)) return [];

    const restricted = product.compatiblePackages;
    if (restricted && !(restricted as readonly string[]).includes(packageId)) {
      return [];
    }
    const offer = productOffer(product);
    return offer ? [offer] : [];
  });

  const cards = ALL_PRODUCTS.filter((p) =>
    p.id.startsWith(CARD_FAMILY_PREFIX)
  ).filter((p) => isPriced(p.price));

  const cardOffer: readonly Offer[] =
    cards.length > 0 && isPriced(cards[0].price)
      ? [
          {
            id: cards[0].id,
            name: "Premium Music Card",
            description:
              "A gift pop-up card that opens to reveal your personalised song.",
            unitGbp: cards[0].price.gbp,
            maxQuantity: 1,
            physical: cards[0].fulfilment === "PHYSICAL",
            variants: cards.map((card) => ({
              id: card.id,
              // "Anniversary Gift Pop-Up Card" → "Anniversary": the occasion is
              // what the customer is choosing between here.
              label: card.name.replace(/ Gift Pop-Up Card$/, ""),
            })),
          },
        ]
      : [];

  const enhancements = ENHANCEMENTS.flatMap((enhancement) => {
    if (!isEnhancementEligible(enhancement, packageId, format)) return [];
    const offer = enhancementOffer(enhancement);
    return offer ? [offer] : [];
  });

  return [...enhancements, ...cardOffer, ...products];
};

/* ------------------------------------------------------------------ */
/* Pricing the preview                                                 */
/* ------------------------------------------------------------------ */

export interface BasketLine {
  id: string;
  name: string;
  quantity: number;
  unitGbp: number;
  lineGbp: number;
  physical: boolean;
}

export interface BasketPreview {
  lines: readonly BasketLine[];
  /** Enhancement lines only, in pounds. The package is added separately. */
  enhancementsGbp: number;
  /** Package + enhancements. What the server is expected to charge. */
  totalGbp: number;
  /** True when anything in the basket must be posted. */
  requiresShipping: boolean;
}

/**
 * Resolves a basket against the CURRENT package and format.
 *
 * Anything no longer offerable is dropped rather than priced, so a basket
 * cannot outlive the selection it was built for — see `revalidate`, which is
 * what tells the customer it happened.
 */
export const priceBasket = (
  pkg: AnyPackage,
  format: string | null,
  items: readonly BasketItem[]
): BasketPreview => {
  const offers = offersFor(pkg.id, format);
  const byId = new Map(offers.map((offer) => [offer.id, offer]));

  const lines: BasketLine[] = [];

  for (const item of items) {
    const offer = byId.get(item.id);
    if (!offer) continue;

    const quantity = Math.min(
      Math.max(Math.trunc(item.quantity), 1),
      offer.maxQuantity
    );

    // A chosen variant carries its own name, so the review says "Anniversary"
    // rather than leaving fulfilment to guess which of ten designs was meant.
    const variant = offer.variants?.find((v) => v.id === item.variantId);

    lines.push({
      id: item.variantId ?? offer.id,
      name: variant ? `${offer.name} — ${variant.label}` : offer.name,
      quantity,
      unitGbp: offer.unitGbp,
      lineGbp: offer.unitGbp * quantity,
      physical: offer.physical,
    });
  }

  const enhancementsGbp = lines.reduce((total, line) => total + line.lineGbp, 0);

  return {
    lines,
    enhancementsGbp,
    totalGbp: pkg.price.gbp + enhancementsGbp,
    requiresShipping: lines.some((line) => line.physical),
  };
};

/* ------------------------------------------------------------------ */
/* Revalidation                                                        */
/* ------------------------------------------------------------------ */

export interface RevalidationResult {
  items: readonly BasketItem[];
  /** Names of the things that had to be removed, for telling the customer. */
  removed: readonly string[];
}

/**
 * Re-checks a basket after the package or format changed.
 *
 * A customer can choose a vinyl Keepsake, add a second record, then change
 * their mind and pick MP3. The second record is now an additional copy of
 * something that does not exist, and quietly charging for it would be worse
 * than either refusing the change or dropping it silently.
 *
 * So it is dropped AND reported: `removed` carries the names, which the UI
 * announces. Anything still eligible is preserved untouched — changing format
 * is not a reason to make someone rebuild a basket.
 */
export const revalidate = (
  packageId: string,
  format: string | null,
  items: readonly BasketItem[]
): RevalidationResult => {
  const offers = offersFor(packageId, format);
  const byId = new Map(offers.map((offer) => [offer.id, offer]));

  const kept: BasketItem[] = [];
  const removed: string[] = [];

  for (const item of items) {
    const offer = byId.get(item.id);
    if (offer) {
      kept.push({
        ...item,
        quantity: Math.min(Math.max(item.quantity, 1), offer.maxQuantity),
      });
    } else {
      // Resolve the name from the full inventory so the notice can say what
      // went, even though it is no longer offerable here.
      const anywhere =
        ENHANCEMENTS.find((e) => e.id === item.id)?.name ??
        ALL_PRODUCTS.find((p) => p.id === item.id)?.name ??
        item.id;
      removed.push(anywhere);
    }
  }

  return { items: kept, removed };
};

/* ------------------------------------------------------------------ */
/* The checkout payload                                                */
/* ------------------------------------------------------------------ */

/**
 * The basket as the server wants it: ids and integer quantities.
 *
 * A selected variant REPLACES the parent id, because the variant is the thing
 * being bought and is what the generated catalogue prices. Nothing about a
 * name, a price or a total is included — the server has all three.
 */
export const toCheckoutItems = (
  items: readonly BasketItem[]
): readonly { id: string; quantity: number }[] =>
  items.map((item) => ({
    id: item.variantId ?? item.id,
    quantity: Math.trunc(item.quantity),
  }));
