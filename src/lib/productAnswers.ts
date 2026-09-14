/**
 * Short, visible answers to the questions customers (and search or answer
 * engines) ask most — built from the canonical catalogue, so an answer can
 * never disagree with the price, format or song count the site sells.
 *
 * Used on the product pages and the FAQ. No figure, promise or format appears
 * here that the catalogue does not state.
 */

import {
  JOURNEY,
  KEEPSAKE,
  MOMENT,
  PERSONALISED_MUSIC_PLAQUE,
  STANDARD_VINYL_NOT_PICTURE_DISC,
  type Variant,
} from "../data/catalogue";

export interface Answer {
  question: string;
  answer: string;
}

const listOf = (items: readonly string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

const songCount = (n: number | null) => (n === 1 ? "1 song" : `${n} songs`);

const recordLine = (v: Variant): string => {
  if (!v.vinyl) return v.label;
  const records = v.vinyl.discCount === 1 ? "one" : v.vinyl.discCount === 2 ? "two" : String(v.vinyl.discCount);
  const kind = v.vinyl.pictureDisc ? "picture disc" : "standard vinyl record";
  const plural = v.vinyl.discCount === 1 ? "" : "s";
  return `${records} ${v.vinyl.sizeInches}-inch ${kind}${v.vinyl.pictureDisc ? "" : plural}${v.vinyl.gatefold ? " in a gatefold sleeve" : ""}`;
};

/** What happens after an order is paid — the Sprint 5 workflow, in plain English. */
export const AFTER_YOU_ORDER: Answer = {
  question: "What happens after I order?",
  answer:
    "You receive an email with your MCB reference. We write and produce your music from the story you shared, then send you a private link to listen. You approve it or tell us what you would like changed. A digital song is then yours to keep; a record is made for you and posted, with tracking where the carrier provides it. You can follow each stage on your private order page.",
};

export const HOW_APPROVAL_WORKS: Answer = {
  question: "How does approval work?",
  answer:
    "When your music is ready we email you a private link. On that page you listen, then choose \"I'm happy — approve it\" or \"I'd like some changes\" and tell us what to adjust. Nothing is treated as approved until you say so. For a record, approval is the point after which we begin making it, so the music can no longer be changed — but if anything arrives wrong, that is ours to put right.",
};

export const KEEPSAKE_SONG_CAPACITY: Answer = {
  question: `How many songs fit on each ${KEEPSAKE.name}?`,
  answer: `${listOf(KEEPSAKE.variants.map((v) => `${v.label}: ${songCount(v.songCount)}`))}. Each song is written from its own memory.`,
};

export const WHAT_IS_A_PICTURE_DISC_KEEPSAKE: Answer = {
  question: `What is a Picture Disc ${KEEPSAKE.name}?`,
  answer: `A vinyl record with personalised artwork set into the disc itself, carrying your personalised music. It can be played and displayed. You can order several, each personalised with a different memory. Photographs of records displayed together on our site are examples; wall mounting is not included.`,
};

export const JOURNEY_NOT_PICTURE_DISC: Answer = {
  question: `Does ${JOURNEY.name} include a Picture Disc?`,
  answer: `No. ${STANDARD_VINYL_NOT_PICTURE_DISC}. ${listOf(JOURNEY.variants.map((v) => `${JOURNEY.name} — ${v.label} is ${recordLine(v)}`))}.`,
};

export const KEEPSAKE_VS_JOURNEY: Answer = {
  question: `What is the difference between ${KEEPSAKE.name} and ${JOURNEY.name}?`,
  answer: `${KEEPSAKE.name} puts ${listOf([...new Set(KEEPSAKE.variants.map((v) => songCount(v.songCount)))])} on a personalised picture disc — ideal for a single memory, or one record for each day of a trip. ${JOURNEY.name} is a personalised album of ${listOf(JOURNEY.variants.map((v) => songCount(v.songCount)))} on standard vinyl, telling a longer story chapter by chapter.`,
};

export const PLAQUE_PLAYS_MUSIC: Answer = {
  question: `Does the ${PERSONALISED_MUSIC_PLAQUE.name} play music?`,
  answer: `No. ${PERSONALISED_MUSIC_PLAQUE.disclosures.join(" ")}`,
};

export const MOMENT_DELIVERY: Answer = {
  question: `How is a ${MOMENT.name} delivered?`,
  answer: `Digitally, with nothing to post: ${(MOMENT.variants[0]?.features ?? []).filter((f) => /delivery/i.test(f)).join(", ").toLowerCase()}. It includes ${(MOMENT.revisions ?? "").toLowerCase()}.`,
};

/** Quick answers and the most relevant article for each product page. */
export const PRODUCT_PAGE_ANSWERS: Readonly<Record<"moment" | "keepsake" | "journey", { answers: readonly Answer[]; article: { slug: string; title: string } }>> = {
  moment: {
    answers: [MOMENT_DELIVERY, AFTER_YOU_ORDER, HOW_APPROVAL_WORKS],
    article: { slug: "turn-a-special-memory-into-a-personalised-song", title: "How to turn a special memory into a personalised song" },
  },
  keepsake: {
    answers: [WHAT_IS_A_PICTURE_DISC_KEEPSAKE, KEEPSAKE_SONG_CAPACITY, KEEPSAKE_VS_JOURNEY, HOW_APPROVAL_WORKS],
    article: { slug: "picture-disc-keepsakes-music-and-memories-you-can-hold", title: "Picture disc keepsakes: music and memories you can hold" },
  },
  journey: {
    answers: [JOURNEY_NOT_PICTURE_DISC, KEEPSAKE_VS_JOURNEY, AFTER_YOU_ORDER],
    article: { slug: "preserve-cruise-memories-after-you-return-home", title: "How to preserve the memories of a cruise long after you return home" },
  },
};
