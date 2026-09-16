import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Helmet } from "react-helmet-async";
import { DELIVERY_ARRANGED_BY_MCB_NOTE, RECOMMENDED_PLANNING_DAYS } from '../data/legal';
import {
  BESPOKE,
  JOURNEY,
  KEEPSAKE,
  MEMORY_MUSIC_VIDEO,
  MOMENT,
  POP_UP_CARD,
  PERSONALISED_MUSIC_PLAQUE,
  PRIORITY_REPLACEMENT,
  PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  STANDARD_VINYL_NOT_PICTURE_DISC,
  formatMoney,
  publicProducts,
  type Product,
  type Variant,
  groupedCards,
} from '../data/catalogue';
import { faqPageStructuredData } from '../lib/seo';
import { groupedFaqs } from '../lib/faqTopics';
import { VIDEO_COPY } from '../data/production/video';
import { AFTER_YOU_ORDER, HOW_MCB_CREATES, IF_IT_ARRIVES_DAMAGED, IF_MCB_GETS_A_DETAIL_WRONG, IF_I_WOULD_HAVE_CHOSEN_DIFFERENTLY, THE_REVEAL, WHAT_PHOTOGRAPH, WILL_I_RECEIVE_A_DRAFT, JOURNEY_NOT_PICTURE_DISC, KEEPSAKE_SONG_CAPACITY, PLAQUE_PLAYS_MUSIC, WHAT_IS_A_PICTURE_DISC_KEEPSAKE, WHO_MAKES_AND_DELIVERS } from '../lib/productAnswers';

/* ------------------------------------------------------------------ */
/* Catalogue phrasing                                                  */
/* ------------------------------------------------------------------ */
/*
 * Every price, song count, size and inclusion in the answers below is read
 * from the canonical catalogue through these helpers. The answers are also
 * emitted as FAQPage structured data, so a figure typed here would be a
 * figure published to search results — none is.
 */

const listOf = (items: readonly string[]): string =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

const songs = (count: number | null) =>
  count === null ? '' : count === 1 ? '1 song' : `${count} songs`;

const songRange = (product: Product): string => {
  const counts = product.variants.flatMap((v) => (v.songCount === null ? [] : [v.songCount]));
  if (counts.length === 0) return '';
  const low = Math.min(...counts);
  const high = Math.max(...counts);
  return low === high ? songs(low) : `${low} to ${high} songs`;
};

/** Lower-cases a sentence's first letter, leaving "MP4"-style words alone. */
const lower = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;

/** "12-inch Picture Disc (4 songs, £149.99)"; "6 Songs (£199)" where the label already counts. */
const variantLine = (variant: Variant): string =>
  variant.songCount === null || /song/i.test(variant.label)
    ? `${variant.label} (${formatMoney(variant.price)})`
    : `${variant.label} (${songs(variant.songCount)}, ${formatMoney(variant.price)})`;

const variantList = (product: Product): string => listOf(product.variants.map(variantLine));

/** A variant's inclusions, without the timing line stated elsewhere. */
const inclusions = (product: Product, variant: Variant): string =>
  variant.features
    .filter((f) => f !== product.turnaround?.label)
    .map((f, i) => (i === 0 ? f : lower(f)))
    .join('; ');

/** "double 12-inch standard vinyl in a gatefold sleeve", from the vinyl spec. */
const recordDescription = (variant: Variant): string => {
  const v = variant.vinyl;
  if (!v) return '';
  const size = `${v.sizeInches}-inch`;
  const shape = v.shape === 'HEART' ? 'heart-shaped ' : '';
  const kind = v.pictureDisc ? 'picture disc' : 'standard vinyl';
  return `${v.discCount === 2 ? 'double ' : ''}${size} ${shape}${kind}${v.gatefold ? ' in a gatefold sleeve' : ''}`;
};

const turnaround = (product: Product) => product.turnaround?.label ?? '';

const MOMENT_VARIANT = MOMENT.variants[0];
const PLAQUE_VARIANT = PERSONALISED_MUSIC_PLAQUE.variants[0];
const VIDEO_VARIANT = MEMORY_MUSIC_VIDEO.variants[0];
const PRIORITY_VARIANT = PRIORITY_REPLACEMENT.variants[0];
const PLAYERS = publicProducts().filter((p) => p.category === 'PLAYER');

/**
 * Visible FAQ content. The FAQPage structured data below is generated from
 * this exact array, so markup and page can never disagree.
 */
const faqs: { question: string; answer: string }[] = [
  {
    question: 'What is My Custom Beats?',
    answer: `My Custom Beats turns your memories into personalised music and physical keepsakes. You share the story; we write, record and produce a song from it. ${MOMENT.name} is delivered digitally, ${KEEPSAKE.name} puts your music on a personalised picture disc, and ${JOURNEY.name} is a personalised album on standard vinyl.`,
  },
  {
    question: 'How does a personalised song work?',
    answer:
      'You choose an experience, tell us about the moment or person it is for, pick a style or let us choose, and upload your photograph where your artwork needs one. You do not need to write lyrics. You trust us with the creativity: we shape your words into a finished song, check every detail, and reveal it to you.',
  },
  {
    question: 'How much does a personalised song cost?',
    /**
     * BESPOKE IS DESCRIBED HERE WITHOUT A NUMBER, DELIBERATELY. It is
     * individually quoted, and any figure here would be published to search
     * results through the FAQPage structured data.
     */
    answer: `${MOMENT.name} is ${MOMENT_VARIANT ? formatMoney(MOMENT_VARIANT.price) : ''} for ${songs(MOMENT_VARIANT?.songCount ?? null)}. ${KEEPSAKE.name} comes in ${KEEPSAKE.variants.length} picture-disc options: ${variantList(KEEPSAKE)}. ${JOURNEY.name} comes as ${variantList(JOURNEY)}. ${BESPOKE.name} is individually quoted, so it is priced in a written proposal after a private consultation rather than published as a figure. Optional add-ons are priced separately.`,
  },
  {
    question: `What is ${MOMENT.name}?`,
    answer: `${MOMENT.name} is ${MOMENT_VARIANT ? formatMoney(MOMENT_VARIANT.price) : ''}. ${MOMENT.shortDescription} It includes ${MOMENT_VARIANT ? lower(inclusions(MOMENT, MOMENT_VARIANT)) : ''}. ${turnaround(MOMENT)}.`,
  },
  {
    question: `What is ${KEEPSAKE.name}?`,
    answer: `${KEEPSAKE.shortDescription} There are ${KEEPSAKE.variants.length} options: ${variantList(KEEPSAKE)}. Each includes personalised picture-disc artwork. There is no limit on how many you order — choose a separate ${KEEPSAKE.name} for different memories, or for different days of a journey. MCB creates the artwork from your photograph. ${turnaround(KEEPSAKE)}.`,
  },
  {
    question: `What is ${JOURNEY.name}?`,
    answer: `${JOURNEY.shortDescription} ${JOURNEY.variants.map((v) => `${JOURNEY.name} — ${v.label} is ${formatMoney(v.price)}: ${lower(inclusions(JOURNEY, v))}.`).join(' ')} ${STANDARD_VINYL_NOT_PICTURE_DISC}. MCB creates the artwork from your photograph. ${turnaround(JOURNEY)}.`,
  },
  {
    question: `What is ${BESPOKE.name}?`,
    answer: `${BESPOKE.shortDescription} It begins with an enquiry and a private consultation. We then put forward a proposal setting out exactly what is included, and nothing proceeds until you have agreed both the scope and the price. ${BESPOKE.disclosures.join(' ')} — there is no published price because no two are the same.`,
  },
  {
    question: `What is the difference between ${MOMENT.name}, ${KEEPSAKE.name}, ${JOURNEY.name} and ${BESPOKE.name}?`,
    answer: `They differ in scale and in what you end up holding. ${MOMENT.name} is ${songs(MOMENT_VARIANT?.songCount ?? null)}, delivered digitally. ${KEEPSAKE.name} puts ${songRange(KEEPSAKE)} on a personalised picture disc. ${JOURNEY.name} is an album of ${songRange(JOURNEY)} on standard vinyl — not a picture disc. ${BESPOKE.name} is different in kind rather than in size: it is curated privately around one recipient, arranged through a consultation and individually quoted.`,
  },
  WHAT_IS_A_PICTURE_DISC_KEEPSAKE,
  KEEPSAKE_SONG_CAPACITY,
  JOURNEY_NOT_PICTURE_DISC,
  {
    question: 'Can I get my personalised song on vinyl?',
    /**
     * Record sizes, shapes and disc types are READ FROM THE CATALOGUE vinyl
     * spec, so adding or withdrawing a record updates this answer and its
     * structured data together.
     */
    answer: `Yes. Every ${KEEPSAKE.name} is a picture disc: ${listOf(KEEPSAKE.variants.map((v) => `${recordDescription(v)} (${songs(v.songCount)})`))}. Every ${JOURNEY.name} is standard vinyl, not a picture disc: ${listOf(JOURNEY.variants.map((v) => `${recordDescription(v)} (${songs(v.songCount)})`))}. ${MOMENT.name} is delivered digitally.`,
  },
  {
    question: 'Can I receive my song digitally instead of something physical?',
    answer: `Yes. ${MOMENT.name} is our digital experience: ${MOMENT_VARIANT ? lower(inclusions(MOMENT, MOMENT_VARIANT)) : ''}. ${KEEPSAKE.name} and ${JOURNEY.name} are physical records, made to order.`,
  },
  {
    question: 'How quickly can you create a song?',
    /**
     * Fifteen working days is how long to ALLOW, and the answer says which
     * parts of that MCB controls and which it does not.
     */
    answer: `${MOMENT.name}: ${lower(turnaround(MOMENT))} — we write, produce, check and reveal it ourselves, with nothing to manufacture and no carrier involved. For ${KEEPSAKE.name} and ${JOURNEY.name}, allow at least ${RECOMMENDED_PLANNING_DAYS} working days: that covers writing, recording, production, our quality check, manufacturing and postage. It is a planning guide rather than a guaranteed arrival date, because the carrier's leg is not ours to control.`,
  },
  {
    question: 'I need it for a specific date. Can you guarantee it?',
    answer: `Tell us the date before you order and we will tell you honestly whether we can meet it. If we agree a date in writing, that agreed date applies and we mean it. Otherwise the timings we show are estimates — so for a wedding, a sailing date or a memorial, please allow at least ${RECOMMENDED_PLANNING_DAYS} working days and do not book anything non-refundable around an estimate.`,
  },
  {
    question: `Can I order a ${KEEPSAKE.name} for each day of my trip?`,
    answer: `Yes. Each ${KEEPSAKE.name} is individually personalised with its own songs and artwork, and there is no MCB maximum — one for Day 1's sailaway, another for the first port, and so on. Name each memory however you like. If you would rather tell the whole trip on one album, ${JOURNEY.name} holds ${songRange(JOURNEY)}.`,
  },
  {
    question: 'Can you create music for a cruise or a holiday?',
    answer: `Yes, and it is one of the most common reasons people come to us. ${JOURNEY.name} suits a trip well: an album of ${songRange(JOURNEY)}, with a different music style for each chapter if you wish. You can also choose a separate ${KEEPSAKE.name} for each day of the voyage.`,
  },
  {
    question: 'Can you make an album from a holiday?',
    answer: `Yes. ${JOURNEY.name} is a personalised album on standard vinyl: ${variantList(JOURNEY)}. For something larger or shaped around more than a trip, ${BESPOKE.name} is individually quoted.`,
  },
  /**
   * THE MEMORY MUSIC VIDEO AND THE POP-UP CARDS WERE INVISIBLE TO THE PUBLIC
   * SITE. Both are real, sold products. The video was described only inside
   * /create — which is noindex — and on the token-gated order page, so no
   * customer browsing the site and no answer engine could find out what it is
   * or that it costs £49. The cards appeared as a price list and nowhere else.
   * Both answers are built from the catalogue and the approved video copy;
   * neither invents a capability. "AI", the platform name, credits and
   * generation allowances stay out of customer language.
   */
  {
    question: `What is an ${MEMORY_MUSIC_VIDEO.name}?`,
    answer: `${VIDEO_COPY.headline.join(' ')} ${VIDEO_COPY.body} ${VIDEO_COPY.ideal} It is an optional enhancement at ${VIDEO_VARIANT ? formatMoney(VIDEO_VARIANT.price) : ''}, added when you create your memory — so a ${MOMENT.name} with a Memory Music Video is ${MOMENT_VARIANT && VIDEO_VARIANT ? formatMoney({ ...VIDEO_VARIANT.price, minor: MOMENT_VARIANT.price.minor + VIDEO_VARIANT.price.minor }) : ''} in total. Availability is limited each production month, and the order form tells you honestly whether a space is open before you pay.`,
  },
  {
    question: `Can I add a card to give with my song?`,
    answer: `Yes. ${POP_UP_CARD.shortDescription} There are ${POP_UP_CARD.variants.length} designs grouped by occasion — ${listOf(groupedCards().map((g) => lower(g.group.label)))} — from ${formatMoney(POP_UP_CARD.variants.reduce((low, v) => (v.price.minor < low.price.minor ? v : low)).price)}. You add them when you create your memory. ${DELIVERY_ARRANGED_BY_MCB_NOTE}`,
  },
  {
    question: 'What else can I add to my song?',
    answer: `${PERSONALISED_MUSIC_PLAQUE.name}${PLAQUE_VARIANT ? `, ${formatMoney(PLAQUE_VARIANT.price)}` : ''}: ${lower(PERSONALISED_MUSIC_PLAQUE.shortDescription)} ${PERSONALISED_MUSIC_PLAQUE.disclosures.join(' ')} Pop-up cards to give alongside your song. Players: ${listOf(PLAYERS.map((p) => `${p.name} (${p.variants[0] ? formatMoney(p.variants[0].price) : ''})`))}. Every personalised piece is made to order.`,
  },
  {
    question: `What is ${PRIORITY_REPLACEMENT.name}?`,
    answer: `${PRIORITY_REPLACEMENT.shortDescription} It is ${PRIORITY_VARIANT ? formatMoney(PRIORITY_VARIANT.price) : ''}, ${lower(PRIORITY_VARIANT?.label ?? '')}. ${PRIORITY_REPLACEMENT.disclosures.join(' ')} Requests must be made within ${PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days of confirmed delivery.`,
  },
  PLAQUE_PLAYS_MUSIC,
  AFTER_YOU_ORDER,
  HOW_MCB_CREATES,
  WILL_I_RECEIVE_A_DRAFT,
  THE_REVEAL,
  IF_MCB_GETS_A_DETAIL_WRONG,
  IF_I_WOULD_HAVE_CHOSEN_DIFFERENTLY,
  WHAT_PHOTOGRAPH,
  {
    question: 'Do I need to write lyrics?',
    answer:
      'No. Share thoughts, notes or memories and our producers shape them into music. You provide the story, we craft the song.',
  },
  {
    question: 'What if I ask MCB to choose the style?',
    answer: `You are trusting our creative judgement: the musical direction becomes ours to choose and part of the reveal. If you already have a style in mind, simply choose it when you create your memory — a style you choose is part of what you ask for, and every song on your order can have its own.`,
  },
  {
    question: 'Is delivery included?',
    answer: `Delivery is shown separately on your review page, so you see the full total before you pay. That applies to physical items: ${KEEPSAKE.name} and ${JOURNEY.name} records, frames, plaques, players and cards. ${DELIVERY_ARRANGED_BY_MCB_NOTE} ${MOMENT.name} is delivered digitally, with nothing to post.`,
  },
  WHO_MAKES_AND_DELIVERS,
  IF_IT_ARRIVES_DAMAGED,
  {
    question: 'When does personalised production begin?',
    answer:
      "As soon as your payment is confirmed. Because we create from exactly what you give us, please check names, spellings, dates and photographs before you pay. If something is objectively wrong with what we supplied — or damaged, faulty or not as described — contact MCB and we'll deal with it for you; your normal consumer rights are not affected.",
  },
  {
    question: 'Can I upload photos for album artwork?',
    answer:
      'Yes — for a Keepsake or Journey it is required, because MCB creates your artwork from your photograph. Photographs are used only to create your order. For a Moment a photo is optional.',
  },
  {
    question: 'Can I get a refund?',
    /**
     * Reduced to match the Founder's Terms, which state there is no
     * cancellation after payment and a no-refund policy. The previous answer
     * described a cancellation route the contract no longer offers.
     */
    answer:
      'Please read clauses 6 and 7 of our Terms before you order. Personalised production begins when your payment is confirmed, so there is no cancellation for a change of mind or a different creative preference, as permitted by applicable law. That does not affect your rights if something is genuinely wrong, or an item arrives damaged, faulty or not as described — clauses 6, 8 and 17 explain what to do, and we\'ll handle it for you.',
  },

  {
    question: 'Is my information kept private?',
    answer:
      'Your story is yours. We use it to create and deliver your order and we do not sell your information or share it for anyone else\'s marketing. Running an online shop does mean some details pass through the services we use to operate — taking payment, sending your confirmation, hosting the site — and only for those purposes. Our Privacy Policy explains it.',
  },
];

const FAQSection = () => (
  <>
    <Helmet>
      <title>Personalised Song FAQs — Pricing, Vinyl & Delivery | My Custom Beats</title>
      <meta
        name="description"
        content={`How personalised songs work, what ${MOMENT.name}, ${KEEPSAKE.name}, ${JOURNEY.name} and ${BESPOKE.name} include, picture discs and standard vinyl, and how quickly your music arrives.`}
      />
      {/* FAQPage, breadcrumb and page identity in one graph. `mainEntity` is
          built from the same `faqs` array the accordion renders below, so the
          markup cannot answer a question the page does not ask. */}
      <script type="application/ld+json">
        {JSON.stringify(faqPageStructuredData(faqs))}
      </script>
    </Helmet>

    <div id="faq" className="w-full bg-ivory px-5 pb-20 pt-28 sm:px-8 md:pb-28 md:pt-36">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="label-uppercase text-gold-deep">Help</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">Questions &amp; Answers</h1>
          <p className="mt-5 text-lg leading-relaxed text-espresso/80">
            Plain answers about how it works, what it costs and what to expect.
          </p>
        </div>

        {/* Jump list: thirty-nine rows is a long scroll on a phone. */}
        <nav aria-label="Question topics" className="mt-12 rounded-2xl border border-ink/10 bg-white p-5 sm:p-6">
          <h2 className="font-serif text-2xl leading-tight text-ink">What would you like to know?</h2>
          <ul className="m-0 mt-4 grid list-none gap-x-6 p-0 sm:grid-cols-2">
            {groupedFaqs(faqs).map((group) => (
              <li key={group.id}>
                <a
                  href={`#faq-${group.id}`}
                  className="flex min-h-11 items-center text-base text-ink underline decoration-gold decoration-1 underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
                >
                  {group.title}
                  <span className="ml-2 text-espresso/65">({group.items.length})</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {groupedFaqs(faqs).map((group) => (
          <section key={group.id} id={`faq-${group.id}`} aria-labelledby={`faq-${group.id}-title`} className="mt-12 scroll-mt-28">
            <h2 id={`faq-${group.id}-title`} className="font-serif text-3xl leading-tight text-ink">
              {group.title}
            </h2>
            {/* "multiple", so opening one answer no longer closes the last. */}
            <Accordion type="multiple" className="mt-5 space-y-3">
              {group.items.map((faq) => (
                <AccordionItem
                  key={faq.question}
                  value={faq.question}
                  className="overflow-hidden rounded-2xl border border-ink/10 bg-white"
                >
                  <AccordionTrigger className="min-h-12 px-5 py-5 text-left font-serif text-xl leading-snug text-ink hover:no-underline focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 md:px-6 [&[data-state=open]]:text-gold-deep">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="px-5 pb-6 text-base leading-relaxed text-espresso/85 md:px-6 md:text-lg">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))}

        {/* Where to get a person, on the page itself rather than only in the
            footer. hello@ is MCB's support identity; the MCB LIVE WhatsApp
            line is deliberately not offered here. */}
        <aside className="mt-14 rounded-2xl border border-ink/10 bg-white p-6 text-center sm:p-8">
          <h2 className="font-serif text-2xl leading-tight text-ink">Still need a person?</h2>
          <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-espresso/80">
            Email us and a real person will read it. If you already have an order, your own order page has a
            message box that keeps everything in one place.
          </p>
          <a
            href="mailto:hello@mycustombeats.com"
            className="mt-6 inline-flex min-h-12 items-center rounded-full bg-ink px-7 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
          >
            hello@mycustombeats.com
          </a>
        </aside>

        <p className="mt-12 text-center text-base leading-relaxed text-espresso/80">
          Still deciding?{' '}
          <Link to="/products" className="font-semibold text-ink underline underline-offset-4 hover:text-gold-deep">
            Compare the experiences
          </Link>{' '}
          or{' '}
          <Link to="/#contact" className="font-semibold text-ink underline underline-offset-4 hover:text-gold-deep">
            ask us directly
          </Link>
          .
        </p>
      </div>
    </div>
  </>
);

export default FAQSection;
