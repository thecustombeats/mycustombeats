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


gsap.registerPlugin(ScrollTrigger);

const faqs = [
  {
    question: 'What exactly is Custom Beats?',
    answer: 'Custom Beats transforms your memories, emotions, and experiences into a personalised song or music collection. Each track is uniquely crafted by professional musicians based on your story.',
  },
  {
    question: 'Do I need to write lyrics?',
    answer: 'You can simply share thoughts, notes, or memories. Our producers shape them into music. You provide the story, we craft the song.',
  },
  {
    question: 'How long does it take?',
    answer: 'Delivery depends on the experience selected. You will be updated along the way.',
  },
  {
    question: 'Can I request changes?',
    answer: 'Yes. Two revisions are included with every order. Additional revisions can be arranged for a small fee.',
  },
  {
    question: 'Can I upload photos for album artwork?',
    answer: 'Yes. Photo uploads are optional and used solely for artwork creation. We can create custom artwork inspired by your photos or based on your story.',
  },
  {
    question: 'Can I get a refund?',
    answer: 'Because this is a personalised digital product, refunds are not available once production begins. We ensure you are happy with the direction before we start production.',
  },
  {
    question: 'Is my information kept private?',
    answer: 'Absolutely. Your data is used only to create and deliver your Custom Beat. We never share your personal information or story with third parties.',
  },
  {
    question: 'Can I order more than once?',
    answer: 'Yes. Each order is treated separately and assigned a unique reference number. Many of our clients come back for new journeys and celebrations.',
  },
  {
    question: 'How will you contact me?',
    answer: 'Via your selected contact method (Email, WhatsApp, or Phone). We will reach out within 24 hours of receiving your order.',
  },
  {
    question: 'Can I gift a Custom Beat?',
    answer: 'Absolutely! Custom Beats make perfect gifts for anniversaries, birthdays, weddings, and special celebrations. You can provide the recipient story or give them a gift certificate to create their own.',
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
  <title>FAQs | Custom Songs, Pricing & Process</title>
  <meta
    name="description"
    content="Find answers about custom songs, delivery time, pricing, revisions and how My Custom Beats works."
  />
  <script type="application/ld+json">
{JSON.stringify({
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Can I create a personalized song for a cruise anniversary?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, MyCustomBeats specializes in creating bespoke songs for luxury experiences including cruise anniversaries, private yacht charters, and milestone celebrations. We transform your cruise memories into a professionally produced musical keepsake."
      }
    },
    {
      "@type": "Question",
      "name": "How do I commission a bespoke song for a luxury gift?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "To commission a bespoke song, simply select a package on our website and share your story, memories, and desired mood. Our team of BBC-featured artists and world-class composers will then craft a unique, hand-crafted musical gift for your special occasion."
      }
    },
    {
      "@type": "Question",
      "name": "What are the benefits of working with world-class composers for a personalized music experience?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Working with world-class composers ensures your song is of the highest artistic quality, with emotion-led storytelling and professional production that AI-generated music cannot replicate. Every MyCustomBeats commission is overseen by artists featured on the BBC."
      }
    },
    {
      "@type": "Question",
      "name": "How much does a customized song cost for a special occasion?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "MyCustomBeats offers a range of packages starting from £29 for a 'Moment' up to £799+ for a fully bespoke 'Heirloom' luxury commission, ensuring a high-quality personalized music experience for every budget."
      }
    },
    {
      "@type": "Question",
      "name": "How long does it take to create a custom song?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Typically 3–7 days depending on the package selected. Each song is carefully refined by real musicians to ensure the highest quality before delivery."
      }
    },
    {
      "@type": "Question",
      "name": "Can I request revisions?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes, two revisions are included with every order to ensure the final composition perfectly captures your story and meets your expectations."
      }
    }
  ]
})}
</script>
</Helmet>


    <div ref={sectionRef} id="faq" className="relative w-full bg-misty-stone py-24 overflow-hidden">
      <div className="px-[7vw]">
        {/* Heading */}
        <div className="faq-heading text-center mb-12">
          <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
            Support
          </span>
          <h2 className="font-serif text-espresso">
            Questions & Answers
          </h2>
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
                <AccordionTrigger className="px-6 py-5 text-left font-serif text-lg text-espresso hover:no-underline hover:text-gold transition-colors duration-fast [&[data-state=open]]:text-gold">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-5 text-espresso/70 leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
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
