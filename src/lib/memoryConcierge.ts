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

/* ------------------------------------------------------------------ */
/* Guided questions                                                    */
/* ------------------------------------------------------------------ */
/*
 * The questions the concierge asks, one at a time, in plain words. They map
 * onto `recommendMemory` above, so the same capacity and "smallest fitting"
 * rules apply. No answer is ever sent anywhere.
 *
 *   occasion     trip | celebration | gift | remembrance | other   (optional)
 *   memories     how many songs or memories                        (required)
 *   keep         digital | physical | unsure | bespoke             (required)
 *   arrangement  together | separate  — asked only for several memories
 *                kept physically                                   (optional)
 *   budgetMinor  an approximate ceiling in pence                   (optional)
 *
 * GUIDED RULES
 *   keep bespoke, or more memories than the largest Journey  → Bespoke
 *   keep digital, 1 memory      → Moment
 *   keep digital, several       → Moment (one per memory), Journey offered
 *                                 as a way to keep them together
 *   keep unsure, 1 memory       → Moment — the lowest-priced start — with
 *                                 the smallest Keepsake as "something to hold"
 *   keep physical, 1 memory     → the smallest Keepsake
 *   several, separate           → one smallest single-song Keepsake per
 *                                 memory; a Journey is shown when it holds
 *                                 them all for less
 *   several, together / unsure  → the smallest Keepsake that holds them,
 *                                 else the smallest Journey
 */

export type ConciergeOccasion = "trip" | "celebration" | "gift" | "remembrance" | "other";
export type KeepPreference = "digital" | "physical" | "unsure" | "bespoke";
export type Arrangement = "together" | "separate";

export interface GuidedAnswers {
  occasion: ConciergeOccasion | null;
  memories: number;
  keep: KeepPreference;
  arrangement: Arrangement | null;
  budgetMinor: number | null;
}

export interface GuidedRecommendation extends ConciergeRecommendation {
  /** How many of the recommended option, e.g. one Keepsake per memory. */
  quantity: number;
  /** Price × quantity in pence, or null for Bespoke. */
  totalMinor: number | null;
  /** A different kind of option worth knowing about (not necessarily cheaper). */
  alsoConsider: ConciergeOption | null;
  /** Why `alsoConsider` is shown, in one sentence. */
  alsoConsiderReason: string | null;
}

/** Memory-count choices derived from catalogue capacities: 1, 2–3, 4, 5–6, 7–12, More than 12. */
export const memoryChoices = (): { value: number; label: string }[] => {
  const counts = [...new Set(allSongOptions().map((o) => o.songCount))].sort((a, b) => a - b);
  const choices = counts.map((count, i) => {
    const from = i === 0 ? 1 : counts[i - 1] + 1;
    return { value: count, label: from === count ? String(count) : `${from}–${count}` };
  });
  const max = counts[counts.length - 1] ?? 1;
  return [...choices, { value: max + 1, label: `More than ${max}` }];
};

/** Whether "together or separate?" is worth asking for these answers. */
export const asksArrangement = (answers: Pick<GuidedAnswers, "memories" | "keep">): boolean =>
  answers.memories > 1 && answers.memories <= largestFixedSongCount() && answers.keep === "physical";

const withGuided = (
  base: ConciergeRecommendation,
  extra: Partial<Pick<GuidedRecommendation, "quantity" | "alsoConsider" | "alsoConsiderReason">> = {}
): GuidedRecommendation => {
  const quantity = extra.quantity ?? 1;
  return {
    ...base,
    quantity,
    totalMinor: base.option ? base.option.priceMinor * quantity : null,
    alsoConsider: extra.alsoConsider ?? null,
    alsoConsiderReason: extra.alsoConsiderReason ?? null,
  };
};

const budgetCheck = (totalMinor: number | null, budgetMinor: number | null): boolean | null =>
  totalMinor === null || budgetMinor === null ? null : totalMinor <= budgetMinor;

export function recommendGuided(answers: GuidedAnswers): GuidedRecommendation {
  const memories = Math.max(1, Math.floor(answers.memories));
  const budgetMinor = answers.budgetMinor;
  const trip = answers.occasion === "trip";
  const moment = optionsFor(MOMENT)[0] ?? null;
  const keepsakes = optionsFor(KEEPSAKE);
  const journeys = optionsFor(JOURNEY);

  if (answers.keep === "bespoke") {
    return withGuided(recommendMemory({ intent: "bespoke", songs: memories, budgetMinor }));
  }
  if (memories > largestFixedSongCount()) {
    return withGuided(recommendMemory({ intent: "journey", songs: memories, budgetMinor }));
  }

  // Digital.
  if (answers.keep === "digital" && moment) {
    const base = recommendMemory({ intent: "quick-song", songs: 1, budgetMinor });
    if (memories === 1) return withGuided(base);
    const journey = smallestFitting(journeys, memories);
    const total = moment.priceMinor * memories;
    return withGuided(
      {
        ...base,
        reason: `A ${MOMENT.name} is one song made from one memory, delivered digitally. For ${memories === 2 ? "two" : "several"} memories, you can create a ${MOMENT.name} for each.`,
        withinBudget: budgetCheck(total, budgetMinor),
        lowerPricedAlternative: null,
      },
      {
        quantity: memories,
        alsoConsider: journey,
        alsoConsiderReason: journey
          ? `If you would like them kept together, ${JOURNEY.name} holds up to ${songsLabel(journey.songCount)} on classic black vinyl — something to hold as well as hear.`
          : null,
      }
    );
  }

  // Not sure, one memory: start with the lowest-priced option, never push up.
  if (answers.keep === "unsure" && memories === 1 && moment) {
    const base = recommendMemory({ intent: "quick-song", songs: 1, budgetMinor });
    const keepsake = smallestFitting(keepsakes, 1);
    return withGuided(
      { ...base, reason: `${base.reason} It is a gentle place to start, and you can always add something to hold later.` },
      {
        alsoConsider: keepsake,
        alsoConsiderReason: keepsake
          ? `If you would like something to hold, the ${keepsake.name} puts your song on a personalised picture disc.`
          : null,
      }
    );
  }

  // Several memories, each on its own Keepsake.
  if (memories > 1 && answers.arrangement === "separate") {
    const single = smallestFitting(keepsakes, 1);
    if (single) {
      const total = single.priceMinor * memories;
      const together = [...keepsakes, ...journeys]
        .filter((o) => o.songCount >= memories && o.priceMinor < total)
        .sort((a, b) => a.priceMinor - b.priceMinor)[0] ?? null;
      const sameCapacity = keepsakes.filter((o) => o.sku !== single.sku && o.songCount === single.songCount);
      return withGuided(
        {
          productId: KEEPSAKE.id,
          productName: KEEPSAKE.name,
          option: single,
          reason: `A separate ${KEEPSAKE.name} for each memory: ${memories} records, each individually personalised with its own song and artwork.${trip ? " One for each day of the trip, if you like — there is no MCB maximum." : " There is no MCB maximum."}`,
          withinBudget: budgetCheck(total, budgetMinor),
          sameCapacity,
          lowerPricedAlternative: together,
        },
        { quantity: memories }
      );
    }
  }

  // Physical (or unsure) — together on one record where one holds them. The
  // base reason already mentions choosing a separate Keepsake per memory.
  const base = recommendMemory({ intent: "keepsake", songs: memories, budgetMinor });
  return withGuided(
    base,
    answers.keep === "unsure" && moment
      ? {
          alsoConsider: moment,
          alsoConsiderReason: `If digital is enough, a ${MOMENT.name} turns one memory into a song, delivered digitally.`,
        }
      : {}
  );
}
