import { Link } from 'react-router-dom';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Helmet } from "react-helmet-async";
import { REFINEMENT_DEFINITION, RECOMMENDED_PLANNING_DAYS } from '../data/legal';
import {
  BESPOKE,
  JOURNEY,
  KEEPSAKE,
  LYRICS_FRAME,
  MOMENT,
  PERSONALISED_MUSIC_PLAQUE,
  PRIORITY_REPLACEMENT,
  PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  STANDARD_VINYL_NOT_PICTURE_DISC,
  formatMoney,
  publicProducts,
  songExperiences,
  type Product,
  type Variant,
} from '../data/catalogue';
import { faqPageStructuredData } from '../lib/seo';
import { refinementOrRemake } from '../lib/productDetail';

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

const withoutFullStop = (text: string) => text.replace(/\.$/, '');

/** "12-inch Picture Disc (4 songs, £149.99)"; "6 Songs (£199)" where the label already counts. */
const variantLine = (variant: Variant): string =>
  variant.songCount === null || /song/i.test(variant.label)
    ? `${variant.label} (${formatMoney(variant.price)})`
    : `${variant.label} (${songs(variant.songCount)}, ${formatMoney(variant.price)})`;

const variantList = (product: Product): string => listOf(product.variants.map(variantLine));

/** A variant's approved inclusions, without the timing and refinement lines stated elsewhere. */
const inclusions = (product: Product, variant: Variant): string =>
  variant.features
    .filter((f) => f !== product.turnaround?.label && f !== product.revisions)
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
const PRIORITY_VARIANT = PRIORITY_REPLACEMENT.variants[0];
const PLAYERS = publicProducts().filter((p) => p.category === 'PLAYER');
const PRICED_EXPERIENCES = songExperiences().filter((p) => p.revisions);

const [REFINEMENT_MEANING, REMAKE_MEANING, MCB_CHOOSES] = refinementOrRemake({ revisions: null });

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
      'You choose an experience, tell us about the moment or person it is for, and pick a mood and genre. You do not need to write lyrics. We shape your words into a song, send it to you, and refine it with the refinements included in your experience.',
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
    answer: `${MOMENT.name} is ${MOMENT_VARIANT ? formatMoney(MOMENT_VARIANT.price) : ''}. ${MOMENT.shortDescription} It includes ${MOMENT_VARIANT ? lower(inclusions(MOMENT, MOMENT_VARIANT)) : ''}, with ${MOMENT.revisions ?? ''}. ${turnaround(MOMENT)}.`,
  },
  {
    question: `What is ${KEEPSAKE.name}?`,
    answer: `${KEEPSAKE.shortDescription} There are ${KEEPSAKE.variants.length} options: ${variantList(KEEPSAKE)}. Each includes personalised picture-disc artwork. There is no limit on how many you order — choose a separate ${KEEPSAKE.name} for different memories, or for different days of a journey. Refinements: ${lower(KEEPSAKE.revisions ?? '')}. ${turnaround(KEEPSAKE)}.`,
  },
  {
    question: `What is ${JOURNEY.name}?`,
    answer: `${JOURNEY.shortDescription} ${JOURNEY.variants.map((v) => `${JOURNEY.name} — ${v.label} is ${formatMoney(v.price)}: ${lower(inclusions(JOURNEY, v))}.`).join(' ')} ${STANDARD_VINYL_NOT_PICTURE_DISC}. Refinements: ${lower(JOURNEY.revisions ?? '')}. ${turnaround(JOURNEY)}.`,
  },
  {
    question: `What is ${BESPOKE.name}?`,
    answer: `${BESPOKE.shortDescription} It begins with an enquiry and a private consultation. We then put forward a proposal setting out exactly what is included, and nothing proceeds until you have agreed both the scope and the price. ${BESPOKE.disclosures.join(' ')} — there is no published price because no two are the same.`,
  },
  {
    question: `What is the difference between ${MOMENT.name}, ${KEEPSAKE.name}, ${JOURNEY.name} and ${BESPOKE.name}?`,
    answer: `They differ in scale and in what you end up holding. ${MOMENT.name} is ${songs(MOMENT_VARIANT?.songCount ?? null)}, delivered digitally. ${KEEPSAKE.name} puts ${songRange(KEEPSAKE)} on a personalised picture disc. ${JOURNEY.name} is an album of ${songRange(JOURNEY)} on standard vinyl — not a picture disc. ${BESPOKE.name} is different in kind rather than in size: it is curated privately around one recipient, arranged through a consultation and individually quoted.`,
  },
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
    answer: `${MOMENT.name}: ${lower(turnaround(MOMENT))} — we write, produce and send it ourselves, with nothing to manufacture and no carrier involved. For ${KEEPSAKE.name} and ${JOURNEY.name}, allow at least ${RECOMMENDED_PLANNING_DAYS} working days: that covers writing, recording, production, your refinements, manufacturing and postage. It is a planning guide rather than a guaranteed arrival date, because the carrier's leg is not ours to control.`,
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
  {
    question: 'What else can I add to my song?',
    answer: `${PERSONALISED_MUSIC_PLAQUE.name}${PLAQUE_VARIANT ? `, ${formatMoney(PLAQUE_VARIANT.price)}` : ''}: ${lower(PERSONALISED_MUSIC_PLAQUE.shortDescription)} ${PERSONALISED_MUSIC_PLAQUE.disclosures.join(' ')} ${LYRICS_FRAME.name} — ${lower(withoutFullStop(LYRICS_FRAME.shortDescription))} — in ${LYRICS_FRAME.variants.length} sizes: ${variantList(LYRICS_FRAME)}. Players: ${listOf(PLAYERS.map((p) => `${p.name} (${p.variants[0] ? formatMoney(p.variants[0].price) : ''})`))}. Every personalised piece is made to order.`,
  },
  {
    question: `What is ${PRIORITY_REPLACEMENT.name}?`,
    answer: `${PRIORITY_REPLACEMENT.shortDescription} It is ${PRIORITY_VARIANT ? formatMoney(PRIORITY_VARIANT.price) : ''}, ${lower(PRIORITY_VARIANT?.label ?? '')}. ${PRIORITY_REPLACEMENT.disclosures.join(' ')} Requests must be made within ${PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days of confirmed delivery.`,
  },
  {
    question: 'Do I need to write lyrics?',
    answer:
      'No. Share thoughts, notes or memories and our producers shape them into music. You provide the story, we craft the song.',
  },
  {
    question: 'Can I request changes?',
    /** Entitlements READ FROM THE CATALOGUE (`product.revisions`), not restated. */
    answer: `Yes — every experience includes refinements. ${listOf(PRICED_EXPERIENCES.map((p) => `${p.name}: ${lower(p.revisions ?? '')}`))}. ${REFINEMENT_DEFINITION} If what you would like is genuinely a different piece of work, we will tell you and quote for it rather than absorbing it or refusing it quietly.`,
  },
  {
    question: 'Refinement or remake?',
    answer: `${REFINEMENT_MEANING} ${REMAKE_MEANING}`,
  },
  {
    question: 'What if I ask MCB to choose the style?',
    answer: `${MCB_CHOOSES} If you already have a style in mind, simply choose it when you create your memory — every song on your order can have its own.`,
  },
  {
    question: 'Is delivery included?',
    answer: `Delivery is calculated separately before payment, so you see it before you pay. That applies to physical items: ${KEEPSAKE.name}, ${JOURNEY.name}, frames, plaques and players. ${MOMENT.name} is delivered digitally, with nothing to post.`,
  },
  {
    question: 'When can I no longer change my order?',
    answer:
      'Once you have approved your work and we have started anything irreversible — pressing a record or printing — your order is locked and the included refinements are closed. That is about changes of mind. If something is wrong with what we made, that is ours to put right whether the order is locked or not.',
  },
  {
    question: 'Can I upload photos for album artwork?',
    answer:
      'Yes. Photo uploads are optional and used solely for artwork creation. We can create custom artwork inspired by your photos or based on your story.',
  },
  {
    question: 'Can I get a refund?',
    /**
     * Reduced to match the Founder's Terms, which state there is no
     * cancellation after payment and a no-refund policy. The previous answer
     * described a cancellation route the contract no longer offers.
     */
    answer:
      'Please read clause 7 of our Terms before you order: there is no cancellation of the product service after payment, and a no refund policy. If an item arrives damaged, clause 17 explains what to do and what we can offer.',
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

    <main id="faq" className="w-full bg-ivory px-5 pb-20 pt-28 sm:px-8 md:pb-28 md:pt-36">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="label-uppercase text-gold-deep">Help</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">Questions &amp; Answers</h1>
          <p className="mt-5 text-lg leading-relaxed text-espresso/80">
            Plain answers about how it works, what it costs and what to expect.
          </p>
        </div>

        <h2 className="sr-only">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="mt-12 space-y-3">
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq.question}
              value={`item-${index}`}
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
    </main>
  </>
);

export default FAQSection;
