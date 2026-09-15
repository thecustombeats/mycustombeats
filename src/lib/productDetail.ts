/**
 * PRODUCT DETAIL — plain-language copy derived from the canonical catalogue.
 *
 * Shared by the product pages (/moment, /keepsake, /journey), /products and
 * the FAQ, so the way MCB explains personalisation, creative authority and delivery
 * reads the same everywhere. No price, song count or size is typed here: each
 * is read from `data/catalogue`.
 */

import {
  PRIORITY_REPLACEMENT,
  formatMoney,
  type Product,
  type Variant,
} from "../data/catalogue";
import { CREATIVE_AUTHORITY_SUMMARY, CREATIVE_PROMISE, PREFERENCE_VS_PROBLEM } from "../data/legal";
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
  const photo = "Square and at least 2500 × 2500 pixels is best. If yours isn't artwork-ready, choose another or add MCB Artwork Preparation before you pay.";

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
        title: "Upload your photograph",
        detail: `MCB creates your sleeve artwork from your photograph, so your Journey needs at least one. ${photo}`,
      },
      {
        title: "Trust MCB, then experience the reveal",
        detail: "We write, record, master, check and press your songs to classic black vinyl. Your Journey arrives as the reveal.",
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
        title: "Upload your photograph",
        detail: `MCB creates your picture-disc artwork from your photograph, so each Keepsake needs at least one. ${photo}`,
      },
      {
        title: "Trust MCB, then experience the reveal",
        detail: `We write and produce ${songs === 1 ? "your song" : "your songs"}, design the picture disc and check every detail. Your Keepsake arrives as the reveal.`,
      },
    ];
  }

  // Moment — one memory, delivered digitally.
  return [
    { title: "Share one memory", detail: story },
    { title: "Choose the mood and style", detail: style },
    {
      title: "Experience the reveal",
      detail: `We create and check your song, then reveal it with a private link. ${product.turnaround ? `${product.turnaround.label}.` : ""}`.trim(),
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

/** How MCB creates: positive first, then what the customer is agreeing to. */
export const howMcbCreates = (): string[] => [
  `${CREATIVE_PROMISE} ${CREATIVE_AUTHORITY_SUMMARY}`,
  "There are no drafts to approve and no revision rounds: our team checks every detail against what you gave us before your creation is revealed or made.",
  PREFERENCE_VS_PROBLEM.specification,
  "If we get something objectively wrong — a name, a date or a photograph different from what you supplied — tell us and we'll put it right.",
];

/** Priority Replacement, phrased quietly, with its price from the catalogue. */
export const priorityReplacementLine = (): string | null => {
  const variant = PRIORITY_REPLACEMENT.variants[0];
  if (!PRIORITY_REPLACEMENT.active || !PRIORITY_REPLACEMENT.public || !variant) return null;
  return `Optional, never pre-selected: ${PRIORITY_REPLACEMENT.name} can be added for ${formatMoney(variant.price)} per eligible Keepsake.`;
};
