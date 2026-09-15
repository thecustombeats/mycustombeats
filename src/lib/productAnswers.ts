/**
 * Short, visible answers to the questions customers (and search or answer
 * engines) ask most — built from the canonical catalogue, so an answer can
 * never disagree with the price, format or song count the site sells.
 *
 * Used on the product pages and the FAQ. No figure, promise or format appears
 * here that the catalogue does not state.
 */

import {
  ARTWORK_PHOTO_MIN_PX,
  ARTWORK_PREPARATION,
  JOURNEY,
  KEEPSAKE,
  MOMENT,
  PERSONALISED_MUSIC_PLAQUE,
  STANDARD_VINYL_NOT_PICTURE_DISC,
  formatMoney,
  type Variant,
} from "../data/catalogue";
import { DAMAGE_GUIDANCE, DAMAGE_GUIDANCE_NOT_A_CONDITION, FULFILMENT_POSITION, MADE_TO_ORDER_NOTE, SEPARATE_PARCELS_NOTE } from "../data/legal/delivery";
import { CREATIVE_AUTHORITY_SUMMARY, CREATIVE_PROMISE, PREFERENCE_VS_PROBLEM } from "../data/legal/production";

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

/** What happens after an order is paid — the Single Creative Authority journey, in plain English. */
export const AFTER_YOU_ORDER: Answer = {
  question: "What happens after I order?",
  answer:
    "You receive an email with your MCB reference, and personalised production begins. We create your music and artwork from the story, preferences and photographs you gave us, and our team checks every detail. Then comes the reveal: a digital song is revealed by a private link; a record is made for you, posted, and arrives as the surprise, with tracking where the carrier provides it. The emails we send include a private link to your order page, where you can follow each stage.",
};

export const HOW_MCB_CREATES: Answer = {
  question: "How does MCB create my song?",
  answer: `${CREATIVE_PROMISE} You tell us your story, choose your sound and upload your photograph; then you trust us with the creativity. ${CREATIVE_AUTHORITY_SUMMARY}`,
};

export const WILL_I_RECEIVE_A_DRAFT: Answer = {
  question: "Will I receive a draft?",
  answer:
    "No — and that's deliberate. We don't send drafts for approval or run revision rounds. Instead, our team checks your song and artwork carefully against what you gave us before anything is revealed or made, so your finished creation can be a genuine surprise.",
};

export const THE_REVEAL: Answer = {
  question: "How does the reveal work?",
  answer: `For a ${MOMENT.name}, we email you when your finished song is ready and it plays on your private order page. For a ${KEEPSAKE.name} or ${JOURNEY.name}, your record is made once it has passed our quality check and arrives as the reveal — we don't send the song beforehand.`,
};

export const IF_MCB_GETS_A_DETAIL_WRONG: Answer = {
  question: "What if MCB gets an objective detail wrong?",
  answer: `${PREFERENCE_VS_PROBLEM.problem} Tell us from your private order page ("Something in my song or artwork is incorrect") or reply to any of our emails. ${PREFERENCE_VS_PROBLEM.statutory}`,
};

export const IF_I_WOULD_HAVE_CHOSEN_DIFFERENTLY: Answer = {
  question: "What if I would personally have chosen something differently?",
  answer: `${PREFERENCE_VS_PROBLEM.preference} ${PREFERENCE_VS_PROBLEM.specification}`,
};

export const WHAT_PHOTOGRAPH: Answer = {
  question: "What photograph should I upload?",
  answer: `For a ${KEEPSAKE.name} or ${JOURNEY.name}, MCB creates your artwork from your photograph, so at least one is needed for each record. A clear, well-lit square photo of at least ${ARTWORK_PHOTO_MIN_PX} × ${ARTWORK_PHOTO_MIN_PX} pixels works best — larger is welcome. If yours isn't artwork-ready, choose another, or add the optional ${ARTWORK_PREPARATION.name} for ${ARTWORK_PREPARATION.variants[0] ? formatMoney(ARTWORK_PREPARATION.variants[0].price) : ""} before you pay. Not every photograph can be prepared to print quality. For a ${MOMENT.name}, a photo is optional.`,
};

/** Founder-approved: MCB is the seller and the only contact. */
export const WHO_MAKES_AND_DELIVERS: Answer = {
  question: "Who makes and delivers my keepsake?",
  answer: `${FULFILMENT_POSITION.join(" ")} ${MADE_TO_ORDER_NOTE} ${SEPARATE_PARCELS_NOTE}`,
};

export const IF_IT_ARRIVES_DAMAGED: Answer = {
  question: "What if my keepsake arrives damaged?",
  answer: `${DAMAGE_GUIDANCE} ${DAMAGE_GUIDANCE_NOT_A_CONDITION}`,
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
  answer: `Digitally, with nothing to post: ${(MOMENT.variants[0]?.features ?? []).filter((f) => /delivery/i.test(f)).join(", ").toLowerCase()}. It is revealed to you with a private link once it has passed our quality check.`,
};

/** Quick answers and the most relevant article for each product page. */
export const PRODUCT_PAGE_ANSWERS: Readonly<Record<"moment" | "keepsake" | "journey", { answers: readonly Answer[]; article: { slug: string; title: string } }>> = {
  moment: {
    answers: [MOMENT_DELIVERY, HOW_MCB_CREATES, THE_REVEAL, IF_I_WOULD_HAVE_CHOSEN_DIFFERENTLY],
    article: { slug: "turn-a-special-memory-into-a-personalised-song", title: "How to turn a special memory into a personalised song" },
  },
  keepsake: {
    answers: [WHAT_IS_A_PICTURE_DISC_KEEPSAKE, KEEPSAKE_SONG_CAPACITY, KEEPSAKE_VS_JOURNEY, WILL_I_RECEIVE_A_DRAFT, WHAT_PHOTOGRAPH, WHO_MAKES_AND_DELIVERS, IF_IT_ARRIVES_DAMAGED],
    article: { slug: "picture-disc-keepsakes-music-and-memories-you-can-hold", title: "Picture disc keepsakes: music and memories you can hold" },
  },
  journey: {
    answers: [JOURNEY_NOT_PICTURE_DISC, KEEPSAKE_VS_JOURNEY, AFTER_YOU_ORDER, WHAT_PHOTOGRAPH, WHO_MAKES_AND_DELIVERS, IF_IT_ARRIVES_DAMAGED],
    article: { slug: "preserve-cruise-memories-after-you-return-home", title: "How to preserve the memories of a cruise long after you return home" },
  },
};
