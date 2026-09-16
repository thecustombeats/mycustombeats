/**
 * THE 39 QUESTIONS, GROUPED BY TOPIC.
 *
 * They were one flat accordion: thirty-nine collapsed rows, no headings, no
 * visible answer anywhere on the page until something was tapped. A customer
 * looking for "when does it arrive" had to read the whole list, and a reader
 * who had opened one question closed it again by opening the next, because the
 * accordion allowed only one open at a time.
 *
 * The grouping is presentation only. `faqs` above stays the single source of
 * both the page and the FAQPage structured data, in its original order, so the
 * markup still cannot answer a question the page does not ask. Anything a
 * topic does not claim falls into the last group rather than disappearing —
 * `assertEveryQuestionGrouped` fails the tests if that ever silently happens.
 */
const TOPICS: readonly { id: string; title: string; match: RegExp }[] = [
  { id: "basics", title: "The basics", match: /^(What is My Custom Beats|How does a personalised song work|How much does a personalised song cost|What is (Moment|Keepsake|Journey|Bespoke)|What is the difference)/i },
  { id: "formats", title: "Records, discs and digital", match: /(Picture Disc|songs fit|on vinyl|digitally instead)/i },
  { id: "timing", title: "Timing", match: /(How quickly|specific date|production begin)/i },
  { id: "occasions", title: "Cruises, trips and occasions", match: /(each day of my trip|cruise or a holiday|album from a holiday)/i },
  { id: "additions", title: "Adding to your song", match: /(Memory Music Video|card to give|What else can I add|Priority Replacement|Plaque play music)/i },
  { id: "creating", title: "How MCB creates it", match: /(after I order|How does MCB create|receive a draft|reveal work|objective detail|chosen something differently|photograph should I upload|write lyrics|choose the style|photos for album artwork)/i },
  { id: "delivery", title: "Delivery, damage and refunds", match: /(delivery included|makes and delivers|arrives damaged|get a refund)/i },
  { id: "privacy", title: "Your information", match: /(kept private)/i },
];

export interface Faq {
  question: string;
  answer: string;
}

export interface FaqGroup {
  id: string;
  title: string;
  items: Faq[];
}

export const groupedFaqs = (faqs: readonly Faq[]): FaqGroup[] => {
  const groups: FaqGroup[] = TOPICS.map((topic) => ({ id: topic.id, title: topic.title, items: [] }));
  const other: FaqGroup = { id: "other", title: "Anything else", items: [] };
  for (const faq of faqs) {
    const topic = TOPICS.findIndex((t) => t.match.test(faq.question));
    (topic === -1 ? other : groups[topic]).items.push(faq);
  }
  return [...groups, other].filter((group) => group.items.length > 0);
};

/** Used by the tests: every question is shown exactly once, under a heading. */
export const groupingProblems = (faqs: readonly Faq[]): string[] => {
  const groups = groupedFaqs(faqs);
  const shown = groups.flatMap((g) => g.items.map((i) => i.question));
  const problems: string[] = [];
  if (shown.length !== faqs.length) problems.push(`${faqs.length} questions but ${shown.length} shown`);
  for (const faq of faqs) if (!shown.includes(faq.question)) problems.push(`not shown: ${faq.question}`);
  const other = groups.find((g) => g.id === "other");
  if (other) problems.push(`ungrouped: ${other.items.map((i) => i.question).join("; ")}`);
  return problems;
};
