import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Helmet } from "react-helmet-async";
import { MOMENT, KEEPSAKE, JOURNEY, HEIRLOOM, FULL_PACKAGE, formatPrice } from '../data/packages';
import { REFINEMENT_DEFINITION, RECOMMENDED_PLANNING_DAYS } from '../data/legal';
import { VINYL_12 } from '../data/catalogue/vinyl';
import {
  GIFT_POP_UP_CARDS,
  LYRICS_FRAME,
  MUSIC_BOX_EXPERIENCE,
  PLAQUE,
  VINYL_FRAME,
  capacityLabel,
  formatProductPrice,
} from '../data/catalogue';
import { faqPageStructuredData } from '../lib/seo';

/**
 * The record MCB presses to, described from catalogue data.
 *
 * `songCapacity` is optional on a product because most products do not hold
 * audio, so it is read defensively rather than asserted. If it were ever
 * absent the sentence simply drops the capacity clause instead of rendering
 * "undefined" into an FAQ answer and into FAQPage structured data.
 */
const VINYL_CAPACITY = VINYL_12.songCapacity
  ? capacityLabel(VINYL_12.songCapacity)
  : null;


gsap.registerPlugin(ScrollTrigger);

/**
 * Visible FAQ content. The FAQPage structured data below is generated from
 * this exact array, so markup and page can never disagree — the previous
 * implementation hand-wrote a separate JSON-LD block that claimed prices and
 * delivery times the page never showed.
 *
 * Prices and delivery come from the central package data, so they cannot go
 * stale independently of the pricing cards.
 */
const faqs: { question: string; answer: string }[] = [
  {
    question: 'What is My Custom Beats?',
    answer:
      'My Custom Beats turns your memories into personalised music and physical keepsakes. You share the story; professional musicians write, record and produce a song from it. The finished music can arrive as a 12-inch vinyl record, a CD or an MP3.',
  },
  {
    question: 'How does a personalised song work?',
    answer:
      'You choose an experience, tell us about the moment or person it is for, and pick a mood and genre. You do not need to write lyrics. Our producers shape your words into a song, send it to you, and refine it with the revisions included in your package.',
  },
  {
    question: 'How much does a personalised song cost?',
    /**
     * FULL_PACKAGE IS DESCRIBED HERE WITHOUT A NUMBER, DELIBERATELY.
     *
     * These answers are also emitted as FAQPage structured data, so a price
     * written here is a price published to search results. The Full Package
     * has none until a proposal is agreed, and "from £799" would anchor an
     * unbounded curation to the retired music-only commission.
     */
    answer: `Personalised songs start at ${formatPrice(MOMENT)} for ${MOMENT.name}. ${KEEPSAKE.name} is ${formatPrice(KEEPSAKE)}, ${JOURNEY.name} is ${formatPrice(JOURNEY)} and ${HEIRLOOM.name} is ${formatPrice(HEIRLOOM)}. ${FULL_PACKAGE.name} is curated individually, so it is priced in a written proposal after a private consultation rather than published as a figure. The format you choose does not change the price.`,
  },
  {
    question: `What is ${MOMENT.name}?`,
    answer: `${MOMENT.name} is ${formatPrice(MOMENT)} and is our fastest experience: one personalised song with customised lyrics from your story, your choice of mood, one revision, delivered as an MP3 within one hour. It suits last-minute gifts and single special moments.`,
  },
  {
    question: `What is ${KEEPSAKE.name}?`,
    answer: `${KEEPSAKE.name} is ${formatPrice(KEEPSAKE)} and is our most popular gift: one fully personalised song of three to four minutes, story-driven lyrics, two refinement revisions and elegant cover artwork. You choose vinyl, CD or MP3. ${KEEPSAKE.delivery}.`,
  },
  {
    question: `What is ${JOURNEY.name}?`,
    answer: `${JOURNEY.name} is ${formatPrice(JOURNEY)} and is built for a trip or a celebration rather than a single moment: four personalised songs sharing one musical theme, arranged as a beginning, middle and finale, with two refinements per song, custom album artwork and a printable lyric booklet. You choose vinyl or CD. ${JOURNEY.delivery}.`,
  },
  {
    question: `What is ${HEIRLOOM.name}?`,
    answer: `${HEIRLOOM.name} is ${formatPrice(HEIRLOOM)} and preserves a whole life story as an album: six cohesive songs with a narrative arc, a custom intro and closing theme, producer-guided creative review, premium album artwork, a multi-page lyric and story booklet and a private streaming link. You choose vinyl or CD. ${HEIRLOOM.delivery}.`,
  },
  {
    question: `What is ${FULL_PACKAGE.name}?`,
    answer: `${FULL_PACKAGE.description} It begins with an enquiry and a private consultation. We then put forward a proposal setting out exactly what is included, and nothing proceeds until you have agreed both the scope and the price. There is no published price because no two are the same.`,
  },
  {
    question: 'What is the difference between Moment, Keepsake, Journey and Heirloom?',
    answer: `They differ in scale and in what you end up holding. ${MOMENT.name} is one song delivered digitally within the hour. ${KEEPSAKE.name} is one carefully crafted song you can have pressed to vinyl or CD. ${JOURNEY.name} is four songs written as a single connected experience. ${HEIRLOOM.name} is a six-song album telling a complete life story. ${FULL_PACKAGE.name} is different in kind rather than in size: it is curated privately around one recipient and arranged through a consultation, not chosen from this list.`,
  },
  {
    question: 'Can I get my personalised song on vinyl?',
    /**
     * The record size is READ FROM THE CATALOGUE, not written out here.
     *
     * This answer previously described 7-inch and 10-inch records by hand.
     * Both sizes were withdrawn from `catalogue/vinyl.ts`, and because the
     * sentence was prose rather than data it kept describing them — to
     * customers, and inside this page's FAQPage structured data. Deriving the
     * name and capacity means withdrawing or adding a size updates the answer
     * and the schema together, with no edit here.
     */
    answer: `Yes. A vinyl pressing is included at no extra cost with ${KEEPSAKE.name}, ${JOURNEY.name} and ${HEIRLOOM.name}. Every record is a ${VINYL_12.name.toLowerCase()}${VINYL_CAPACITY ? `, which holds ${VINYL_CAPACITY}` : ""} — so a one-song ${KEEPSAKE.name}, a four-song ${JOURNEY.name} and a six-song ${HEIRLOOM.name} each press to a single record. Choose vinyl when you place your order and we will ask for a delivery address.`,
  },
  {
    question: 'Can I get a CD?',
    answer: `Yes. A CD with your custom cover artwork is included at no extra cost with ${KEEPSAKE.name}, ${JOURNEY.name} and ${HEIRLOOM.name}, as an alternative to vinyl. You select it during the order process.`,
  },
  {
    question: 'Can I receive an MP3 instead of something physical?',
    answer: `Yes. ${MOMENT.name} is delivered as an MP3, and ${KEEPSAKE.name} can be delivered as an MP3 if you would rather not wait for post. ${JOURNEY.name} and ${HEIRLOOM.name} are physical experiences and come as vinyl or CD, each with a digital delivery package included.`,
  },
  {
    question: 'How quickly can you create a song?',
    /**
     * This said the three larger experiences "are delivered within 15 working
     * days", which read as a commitment while the Terms called the same figure
     * a target. Fifteen working days is how long to ALLOW, and the answer now
     * says which parts of that MCB controls and which it does not.
     */
    answer: `${MOMENT.name} is delivered within one hour — we write, produce and send it ourselves, with nothing to manufacture and no carrier involved. For ${KEEPSAKE.name}, ${JOURNEY.name} and ${HEIRLOOM.name}, allow at least ${RECOMMENDED_PLANNING_DAYS} working days: that covers writing, recording, production, your refinements and — where you have chosen vinyl or CD — manufacturing and postage. It is a planning guide rather than a guaranteed arrival date, because the carrier's leg is not ours to control.`,
  },
  {
    question: 'I need it for a specific date. Can you guarantee it?',
    answer: `Tell us the date before you order and we will tell you honestly whether we can meet it. If we agree a date in writing, that agreed date applies and we mean it. Otherwise the timings we show are estimates — so for a wedding, a sailing date or a memorial, please allow at least ${RECOMMENDED_PLANNING_DAYS} working days and do not book anything non-refundable around an estimate.`,
  },
  {
    question: 'Can you create music for a cruise or a holiday?',
    answer: `Yes, and it is one of the most common reasons people come to us. ${JOURNEY.name} was designed for exactly this: four songs that follow the shape of a trip from departure to the final evening. Guests sailing with cruise lines around the world use it to turn a holiday into something they can play again.`,
  },
  {
    question: 'Can you make an album from a holiday?',
    answer: `Yes. ${JOURNEY.name} gives you a four-song album with unified artwork and a lyric booklet. For a longer story — a milestone anniversary trip, or a journey spanning years — ${HEIRLOOM.name} gives you a six-song album with a full narrative arc.`,
  },
  {
    question: 'What physical keepsakes do you offer?',
    answer:
      /**
       * Every price here is read from the catalogue, so a repricing or a
       * retirement updates this answer and its FAQPage structured data
       * together. The Luxury Memory Box was named here until it was retired;
       * the Music Box Experience that replaced it in this list is a different
       * product with its own approved price, described in the approved
       * language and WITHOUT a contents list.
       */
      `Beyond vinyl and CD, we make framed lyric artwork — your words set as typography and framed for the wall, ${formatProductPrice(LYRICS_FRAME.price)} — engraved crystal or wood music plaques with a scannable code to your song, ${formatProductPrice(PLAQUE.price)}, a vinyl frame that turns your record into a display piece, ${formatProductPrice(VINYL_FRAME.price)}, and gift pop-up cards that open to reveal your song, ${formatProductPrice(GIFT_POP_UP_CARDS[0].price)}, with designs for anniversaries, birthdays, weddings, Christmas and more. There is also the ${MUSIC_BOX_EXPERIENCE.name}, ${formatProductPrice(MUSIC_BOX_EXPERIENCE.price)} — an elevated gifting experience bringing together multiple personalised keepsakes in one beautifully curated presentation, shaped around the story, recipient and occasion. Everything is made to order.`,
  },
  {
    question: 'Do I need to write lyrics?',
    answer:
      'No. Share thoughts, notes or memories and our producers shape them into music. You provide the story, we craft the song.',
  },
  {
    question: 'Can I request changes?',
    /**
     * Entitlements READ FROM THE PACKAGES, not restated.
     *
     * This answer used to hard-code "one with Moment, two with Keepsake" and
     * would have gone stale the first time an allowance changed, leaving the
     * FAQ contradicting both the package card and the Terms.
     */
    answer: `Yes — every experience includes refinements. ${MOMENT.name} includes ${MOMENT.revisions.toLowerCase()}, ${KEEPSAKE.name} ${KEEPSAKE.revisions.toLowerCase()}, and ${JOURNEY.name} and ${HEIRLOOM.name} ${JOURNEY.revisions.toLowerCase()}. ${REFINEMENT_DEFINITION} If what you would like is genuinely a different piece of work, we will tell you and quote for it rather than absorbing it or refusing it quietly.`,
  },
  {
    question: 'When can I no longer change my order?',
    answer:
      'Once you have approved your work and we have started anything irreversible — pressing a record, printing, engraving — your order is locked and the included refinements are closed. That is about changes of mind. If something is wrong with what we made, that is ours to put right whether the order is locked or not.',
  },
  {
    question: 'Can I upload photos for album artwork?',
    answer:
      'Yes. Photo uploads are optional and used solely for artwork creation. We can create custom artwork inspired by your photos or based on your story.',
  },
  {
    question: 'Can I get a refund?',
    /**
     * This said "refunds are not available once production begins" — blanket,
     * with an undefined trigger and no carve-out for MCB's own mistakes. It
     * also disagreed with both the Terms and the Refunds page, which is how
     * a business ends up unable to say what its own policy is.
     */
    answer:
      'It depends where your order has got to, and the Refunds & Cancellations page sets it out properly. In short: if we genuinely have not started, we refund you in full. If we have started, you can still cancel within the 14-day period and we may charge fairly for the work already done. Once an item has been personalised or made for you, the ordinary right to change your mind no longer applies to it. And separately from all of that — if what arrives is faulty, damaged or not what you ordered, we put it right.',
  },
  {
    question: 'Is my information kept private?',
    answer:
      'Your story is yours. We use it to create and deliver your order and we do not sell your information or share it for anyone else\'s marketing. Running an online shop does mean some details pass through the services we use to operate — taking payment, sending your confirmation, hosting the site — and only for those purposes. Our Privacy Policy explains it.',
  },
];

const FAQSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.faq-heading',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        '.faq-item',
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.3,
          stagger: 0.04,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.faq-list',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    

    return () => ctx.revert();
  }, []);

  return (
<>

<Helmet>
  <title>Personalised Song FAQs — Pricing, Vinyl, CD & Delivery | My Custom Beats</title>
  <meta
    name="description"
    content="How personalised songs work, what Moment, Keepsake, Journey and Heirloom include, whether you can get vinyl, CD or MP3, and how quickly your music arrives."
  />
  {/* FAQPage, breadcrumb and page identity in one graph. `mainEntity` is
      built from the same `faqs` array the accordion renders below, so the
      markup cannot answer a question the page does not ask. */}
  <script type="application/ld+json">
    {JSON.stringify(faqPageStructuredData(faqs))}
  </script>
</Helmet>


    <div ref={sectionRef} id="faq" className="relative w-full bg-misty-stone py-24 overflow-hidden">
      <div className="px-[7vw]">
        {/* Heading */}
        <div className="faq-heading text-center mb-12">
          <span className="label-uppercase text-gold-deep mb-4 block tracking-[0.15em]">
            Support
          </span>
          <h1 className="font-serif text-espresso">
            Questions &amp; Answers
          </h1>
        </div>

        {/* Accordion */}
        <div className="faq-list max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((faq, index) => (
              <AccordionItem
                key={index}
                value={`item-${index}`}
                className="faq-item bg-white rounded-xl shadow-sm border-none overflow-hidden"
              >
                <AccordionTrigger className="px-6 py-5 text-left font-serif text-lg text-espresso hover:no-underline hover:text-gold-deep transition-colors duration-fast [&[data-state=open]]:text-gold-deep">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-5 text-espresso/70 leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </div>
    </>
  );
};

export default FAQSection;
