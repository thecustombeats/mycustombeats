/**
 * MCB MEMORY CONCIERGE — rules-based guidance, not AI.
 *
 * A pure function of three answers: what the customer wants to create, how
 * many songs or memories it holds, and an optional budget. No personal story
 * is read, nothing is sent anywhere, and no remote model is involved.
 *
 * EVERY NUMBER COMES FROM THE CANONICAL CATALOGUE. Song capacities, prices
 * and variant names are read from `data/catalogue`, so a price or capacity
 * change there changes the guidance with no edit here.
 *
 * THE RULES
 *   bespoke intent                         → Bespoke
 *   more songs than the largest Journey    → Bespoke
 *   quick song                             → Moment
 *   keepsake, fits one Keepsake            → the smallest Keepsake that holds
 *                                            the songs (cheapest on a tie)
 *   keepsake, too many for one Keepsake    → the smallest Journey that fits
 *   journey                                → the smallest Journey that fits
 *
 * It never steers upward unnecessarily: the smallest fitting option is chosen,
 * and when something cheaper would also hold the same songs it is shown
 * alongside. A budget never silently reduces the number of songs requested.
 */

import {
  BESPOKE,
  JOURNEY,
  KEEPSAKE,
  MOMENT,
  type Product,
  type ProductId,
  type Variant,
} from "../data/catalogue";

export type MemoryIntent = "quick-song" | "keepsake" | "journey" | "bespoke";

export interface ConciergeAnswers {
  intent: MemoryIntent;
  /** Songs or memories the customer wants to preserve. At least 1. */
  songs: number;
  /** Budget in pence, or null when the customer prefers not to say. */
  budgetMinor: number | null;
}

export interface ConciergeOption {
  productId: ProductId;
  productName: string;
  sku: string;
  /** Full variant name, e.g. "7-inch Picture Disc Keepsake". */
  name: string;
  songCount: number;
  priceMinor: number;
}

export interface ConciergeRecommendation {
  productId: ProductId;
  productName: string;
  /** Null for Bespoke, which has no variant and no price. */
  option: ConciergeOption | null;
  reason: string;
  /** Null when no budget was given or the recommendation is quoted. */
  withinBudget: boolean | null;
  /** Other variants of the same product holding the same number of songs. */
  sameCapacity: readonly ConciergeOption[];
  /** The cheapest option that also holds the songs, when cheaper than the recommendation. */
  lowerPricedAlternative: ConciergeOption | null;
}

const optionOf = (product: Product, variant: Variant): ConciergeOption | null =>
  variant.songCount === null
    ? null
    : {
        productId: product.id,
        productName: product.name,
        sku: variant.sku,
        name: variant.name,
        songCount: variant.songCount,
        priceMinor: variant.price.minor,
      };

const optionsFor = (product: Product): ConciergeOption[] =>
  product.variants.flatMap((variant) => {
    const option = optionOf(product, variant);
    return option ? [option] : [];
  });

/** Smallest capacity that holds `songs`, cheapest on a tie. */
const smallestFitting = (options: readonly ConciergeOption[], songs: number) =>
  options
    .filter((option) => option.songCount >= songs)
    .sort((a, b) => a.songCount - b.songCount || a.priceMinor - b.priceMinor)[0] ?? null;

const maxSongs = (options: readonly ConciergeOption[]) =>
  options.reduce((max, option) => Math.max(max, option.songCount), 0);

const songsLabel = (count: number) => (count === 1 ? "1 song" : `${count} songs`);

/** Every song-experience option, for budget choices and comparisons. */
export const allSongOptions = (): ConciergeOption[] =>
  [MOMENT, KEEPSAKE, JOURNEY].flatMap(optionsFor);

/** The largest number of songs a fixed-price experience holds. */
export const largestFixedSongCount = (): number => maxSongs(allSongOptions());

/** Distinct song-experience prices, ascending — the budget choices. */
export const budgetChoicesMinor = (): number[] =>
  [...new Set(allSongOptions().map((option) => option.priceMinor))].sort((a, b) => a - b);

export function recommendMemory(answers: ConciergeAnswers): ConciergeRecommendation {
  const songs = Math.max(1, Math.floor(answers.songs));
  const moment = optionsFor(MOMENT);
  const keepsakes = optionsFor(KEEPSAKE);
  const journeys = optionsFor(JOURNEY);
  const everything = [...moment, ...keepsakes, ...journeys];

  const bespoke = (reason: string): ConciergeRecommendation => ({
    productId: BESPOKE.id,
    productName: BESPOKE.name,
    option: null,
    reason,
    withinBudget: null,
    sameCapacity: [],
    lowerPricedAlternative: null,
  });

  if (answers.intent === "bespoke") {
    return bespoke(
      `Your idea needs a personal conversation. ${BESPOKE.name} is individually quoted, with the scope and price agreed with you before anything begins.`
    );
  }

  const journeyMax = maxSongs(journeys);
  if (songs > journeyMax) {
    return bespoke(
      `The largest ${JOURNEY.name} holds ${songsLabel(journeyMax)}. For ${songsLabel(songs)}, ${BESPOKE.name} lets us shape something around the whole story, individually quoted.`
    );
  }

  let option: ConciergeOption | null;
  let reason: string;

  if (answers.intent === "quick-song" && songs <= maxSongs(moment)) {
    option = smallestFitting(moment, songs);
    const timing = MOMENT.turnaround ? ` ${MOMENT.turnaround.label}.` : "";
    reason = `${MOMENT.name} is the quickest way to turn one memory into music, delivered digitally.${timing}`;
  } else if (answers.intent !== "journey" && songs <= maxSongs(keepsakes)) {
    option = smallestFitting(keepsakes, songs);
    reason = option
      ? `The ${option.name} holds ${songsLabel(option.songCount)} on a personalised picture disc — the smallest ${KEEPSAKE.name} with room for your ${songsLabel(songs)}. You can choose a separate ${KEEPSAKE.name} for every memory or every day, too.`
      : "";
  } else {
    option = smallestFitting(journeys, songs);
    const tooManyForKeepsake =
      answers.intent !== "journey"
        ? `A single ${KEEPSAKE.name} holds up to ${songsLabel(maxSongs(keepsakes))}. `
        : "";
    const moreKeepsakes =
      answers.intent !== "journey"
        ? ` Or choose more than one ${KEEPSAKE.name} — one for each memory.`
        : "";
    reason = option
      ? `${tooManyForKeepsake}The ${option.name} is a personalised album of ${songsLabel(option.songCount)} on standard vinyl — the smallest ${JOURNEY.name} with room for your ${songsLabel(songs)} — with a different music style for each song if you wish.${moreKeepsakes}`
      : "";
  }

  if (!option) {
    return bespoke(`${BESPOKE.name} can shape something around your story, individually quoted.`);
  }

  const chosen = option;
  const sameCapacity = everything.filter(
    (candidate) =>
      candidate.productId === chosen.productId &&
      candidate.sku !== chosen.sku &&
      candidate.songCount === chosen.songCount
  );
  const cheapest = everything
    .filter((candidate) => candidate.songCount >= songs && candidate.priceMinor < chosen.priceMinor)
    .sort((a, b) => a.priceMinor - b.priceMinor)[0];

  return {
    productId: chosen.productId,
    productName: chosen.productName,
    option: chosen,
    reason,
    withinBudget: answers.budgetMinor === null ? null : chosen.priceMinor <= answers.budgetMinor,
    sameCapacity,
    lowerPricedAlternative: cheapest ?? null,
  };
}
