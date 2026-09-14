/**
 * PRODUCT DETAIL — plain-language copy derived from the canonical catalogue.
 *
 * Shared by the product pages (/moment, /keepsake, /journey), /products and
 * the FAQ, so the way MCB explains personalisation, refinements and delivery
 * reads the same everywhere. No price, song count or size is typed here: each
 * is read from `data/catalogue`.
 */

import {
  PRIORITY_REPLACEMENT,
  formatMoney,
  type Product,
  type Variant,
} from "../data/catalogue";
import { REFINEMENT_DEFINITION } from "../data/legal";
import { STORY_MAX } from "./personalisation";

/** Said wherever a physical item is sold. No shipping price is invented. */
export const DELIVERY_NOTE = "Delivery calculated separately before payment.";

/** The guided order flow, with a variant preselected. */
export const createHref = (sku: string): string => `/create?sku=${encodeURIComponent(sku)}`;

/** The guided order flow, with a product preselected. */
export const createProductHref = (productId: string): string =>
  `/create?product=${encodeURIComponent(productId)}`;

/** The variant to show first: a valid `?sku=` for this product, else the first. */
export const initialVariantSku = (product: Product, requested: string | null): string => {
  const match = requested ? product.variants.find((variant) => variant.sku === requested) : undefined;
  return (match ?? product.variants[0])?.sku ?? "";
};

export const isPhysical = (variant: Variant): boolean => variant.fulfilment === "PHYSICAL";

/** The primary action on a product page. */
export const productCtaLabel = (product: Pick<Product, "id" | "name">): string =>
  product.id === "moment" ? "Create Your Memory" : `Start your ${product.name}`;

const count = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export interface PersonalisationStep {
  title: string;
  detail: string;
}

/**
 * How personalisation works for one variant, in the order the customer
 * experiences it. Capacity comes from `variant.songCount`.
 */
export const personalisationSteps = (product: Product, variant: Variant): PersonalisationStep[] => {
  const songs = variant.songCount ?? 1;
  const story = `In your own words, up to ${STORY_MAX} characters. No lyrics or rhymes needed.`;
  const style = "Pick a music style, or choose “Let MCB choose” and trust our creative judgement.";

  if (product.id === "journey") {
    return [
      {
        title: `Tell us ${count(songs, "chapter", "chapters")}`,
        detail: `Each of the ${songs} songs is its own chapter: a day, a place, a person or a turning point. ${story}`,
      },
      {
        title: "Give every chapter its own sound",
        detail: `Each chapter can have a different music style. ${style}`,
      },
      {
        title: "Add photographs if you like",
        detail: "An optional photograph for any chapter. Your approved photograph can feature in the sleeve artwork.",
      },
      {
        title: "We write, record, master and press",
        detail: `Your songs are mastered and pressed to classic black vinyl. ${product.revisions ? `Includes ${product.revisions.toLowerCase()}.` : ""}`.trim(),
      },
    ];
  }

  if (product.id === "keepsake") {
    return [
      {
        title: songs === 1 ? "Share one memory" : `Share ${songs} memories`,
        detail:
          songs === 1
            ? `This record holds one song, made from one memory. ${story}`
            : `This record holds ${songs} songs. Each memory gets its own story. ${story}`,
      },
      {
        title: songs === 1 ? "Choose its style" : "Choose a style for each",
        detail: `${songs === 1 ? "" : "Every memory can sound different. "}${style}`,
      },
      {
        title: "Add a photograph if you like",
        detail: `An optional photograph ${songs === 1 ? "for your memory" : "for each memory"}, which can inspire the picture-disc artwork.`,
      },
      {
        title: "We create your record",
        detail: `We write and produce ${songs === 1 ? "your song" : "your songs"} and design the picture disc. ${product.revisions ? `Includes ${product.revisions.toLowerCase()}.` : ""}`.trim(),
      },
    ];
  }

  // Moment — one memory, delivered digitally.
  return [
    { title: "Share one memory", detail: story },
    { title: "Choose the mood and style", detail: style },
    {
      title: "Receive your song",
      detail: `${product.turnaround ? `${product.turnaround.label}. ` : ""}${product.revisions ? `Includes ${product.revisions.toLowerCase()}.` : ""}`.trim(),
    },
  ];
};

/**
 * What a standard-vinyl variant includes, from its vinyl spec:
 * "Included: one 12-inch classic black vinyl record, personalised sleeve artwork and mastering."
 */
export const vinylIncludedLine = (variant: Variant): string => {
  const v = variant.vinyl;
  if (!v || v.pictureDisc) return "";
  const records =
    v.discCount === 2
      ? `two ${v.sizeInches}-inch classic black vinyl records${v.gatefold ? " in a gatefold sleeve" : ""}`
      : `one ${v.sizeInches}-inch classic black vinyl record`;
  const extras = [
    variant.artworkIncluded ? (v.gatefold ? "personalised gatefold artwork" : "personalised sleeve artwork") : null,
    variant.masteringIncluded ? "mastering" : null,
  ].filter(Boolean);
  return `Included: ${records}${extras.length ? `, ${extras.join(" and ")}` : ""}.`;
};

/** "Refinement or remake?" — gentle, and consistent with the legal definition. */
export const refinementOrRemake = (product: Pick<Product, "revisions">): string[] => [
  `${REFINEMENT_DEFINITION}${product.revisions ? ` Your order includes ${product.revisions.toLowerCase()}.` : ""}`,
  "Refinements work within the creative direction you gave us. Changing a finished song to an entirely different genre or direction after production is a remake — a new piece of work, which we will happily quote for rather than count as a refinement.",
  "If you ask MCB to choose the style, you are trusting our creative judgement. Your included refinements still apply to what we made, but a later request for an entirely different genre after production counts as a remake.",
];

/** Priority Replacement, phrased quietly, with its price from the catalogue. */
export const priorityReplacementLine = (): string | null => {
  const variant = PRIORITY_REPLACEMENT.variants[0];
  if (!PRIORITY_REPLACEMENT.active || !PRIORITY_REPLACEMENT.public || !variant) return null;
  return `Optional, never pre-selected: ${PRIORITY_REPLACEMENT.name} can be added for ${formatMoney(variant.price)} per eligible Keepsake.`;
};
