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
import { MOMENT, KEEPSAKE, JOURNEY, HEIRLOOM, BESPOKE, formatPrice } from '../data/packages';
import { canonical, breadcrumbStructuredData } from '../lib/seo';


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
    answer: `Personalised songs start at ${formatPrice(MOMENT)} for ${MOMENT.name}. ${KEEPSAKE.name} is ${formatPrice(KEEPSAKE)}, ${JOURNEY.name} is ${formatPrice(JOURNEY)} and ${HEIRLOOM.name} is ${formatPrice(HEIRLOOM)}. Bespoke commissions start ${formatPrice(BESPOKE).toLowerCase()}. The format you choose does not change the price.`,
  },
  {
    question: `What is ${MOMENT.name}?`,
    answer: `${MOMENT.name} is ${formatPrice(MOMENT)} and is our fastest experience: one personalised song with customised lyrics from your story, your choice of mood, one revision, delivered as an MP3 within one hour. It suits last-minute gifts and single special moments.`,
  },
  {
    question: `What is ${KEEPSAKE.name}?`,
    answer: `${KEEPSAKE.name} is ${formatPrice(KEEPSAKE)} and is our most popular gift: one fully personalised song of three to four minutes, story-driven lyrics, two refinement revisions and elegant cover artwork. You choose vinyl, CD or MP3, and it is delivered within 15 working days.`,
  },
  {
    question: `What is ${JOURNEY.name}?`,
    answer: `${JOURNEY.name} is ${formatPrice(JOURNEY)} and is built for a trip or a celebration rather than a single moment: four personalised songs sharing one musical theme, arranged as a beginning, middle and finale, with two refinements per song, custom album artwork and a printable lyric booklet. You choose vinyl or CD, delivered within 15 working days.`,
  },
  {
    question: `What is ${HEIRLOOM.name}?`,
    answer: `${HEIRLOOM.name} is ${formatPrice(HEIRLOOM)} and preserves a whole life story as an album: six cohesive songs with a narrative arc, a custom intro and closing theme, producer-guided creative review, premium album artwork, a multi-page lyric and story booklet and a private streaming link. You choose vinyl or CD, delivered within 15 working days.`,
  },
  {
    question: 'What is Bespoke?',
    answer: `Bespoke is a fully commissioned project starting ${formatPrice(BESPOKE).toLowerCase()}. It includes a private one-to-one creative consultation, a dedicated seven-day production window, unlimited refinements during that window, exclusive arrangement usage rights and deluxe artwork.`,
  },
  {
    question: 'What is the difference between Moment, Keepsake, Journey and Heirloom?',
    answer: `They differ in scale and in what you end up holding. ${MOMENT.name} is one song delivered digitally within the hour. ${KEEPSAKE.name} is one carefully crafted song you can have pressed to vinyl or CD. ${JOURNEY.name} is four songs written as a single connected experience. ${HEIRLOOM.name} is a six-song album telling a complete life story. Bespoke is an open commission shaped entirely around you.`,
  },
  {
    question: 'Can I get my personalised song on vinyl?',
    answer: `Yes. A vinyl pressing is included at no extra cost with ${KEEPSAKE.name}, ${JOURNEY.name} and ${HEIRLOOM.name}. The record is sized to your music: a 7-inch holds one song, a 10-inch holds two, and a 12-inch holds five to six — so a four-song ${JOURNEY.name} presses to a single 12-inch or a pair of 10-inch records, and a six-song ${HEIRLOOM.name} to one 12-inch. Choose vinyl when you place your order and we will ask for a delivery address.`,
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
    answer: `${MOMENT.name} is delivered within one hour. ${KEEPSAKE.name}, ${JOURNEY.name} and ${HEIRLOOM.name} are delivered within 15 working days, which covers writing, recording, production, your revisions and — where you have chosen vinyl or CD — manufacturing and postage.`,
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
      'Beyond vinyl and CD, we make lyrics frames — your words set as typography and framed for the wall — engraved crystal or wood music plaques with a scannable code to your song, luxury memory boxes holding lyrics and photos alongside your music, and gift pop-up cards that open to reveal your song, with designs for anniversaries, birthdays, weddings, Christmas and more. These are made to order — contact us for pricing.',
  },
  {
    question: 'Do I need to write lyrics?',
    answer:
      'No. Share thoughts, notes or memories and our producers shape them into music. You provide the story, we craft the song.',
  },
  {
    question: 'Can I request changes?',
    answer:
      'Yes. Every experience includes revisions — one with Moment, two with Keepsake, and two per song with Journey and Heirloom. Additional revisions can be arranged for a small fee.',
  },
  {
    question: 'Can I upload photos for album artwork?',
    answer:
      'Yes. Photo uploads are optional and used solely for artwork creation. We can create custom artwork inspired by your photos or based on your story.',
  },
  {
    question: 'Can I get a refund?',
    answer:
      'Because this is a personalised made-to-order product, refunds are not available once production begins. We make sure you are happy with the direction before we start. If a physical item arrives damaged or defective we will replace it.',
  },
  {
    question: 'Is my information kept private?',
    answer:
      'Yes. Your data is used only to create and deliver your order. We never share your personal information or your story with third parties.',
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
  <meta property="og:url" content={canonical("/faq")} />
  <script type="application/ld+json">
    {JSON.stringify(breadcrumbStructuredData([{ name: "FAQ", path: "/faq" }]))}
  </script>
  <script type="application/ld+json">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
})}
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
