import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, MapPin, Calendar, Sparkles } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const TripToLyricsSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const image = imageRef.current;

    if (!section || !content || !image) return;

    const ctx = gsap.context(() => {
      // Content reveal
      gsap.fromTo(
        content.children,
        { x: -40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      // Image reveal
      gsap.fromTo(
        image,
        { x: 40, opacity: 0, scale: 0.98 },
        {
          x: 0,
          opacity: 1,
          scale: 1,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const scrollToOrder = () => {
    const element = document.querySelector('#order');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div
      ref={sectionRef}
      className="relative w-full bg-misty-stone py-24 overflow-hidden"
    >
      <div className="px-[7vw]">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-6xl mx-auto">
          {/* Content */}
          <div ref={contentRef} className="flex-1">
            <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
              Your Story, Your Song
            </span>
            
            <h2 className="font-serif text-espresso mb-6">
              Turn Your Trip Into Lyrics
            </h2>
            
            <p className="text-lg text-espresso/70 mb-8 leading-relaxed">
              Share your ports, dates, and highlights. We'll weave them into a song that feels like your own soundtrack.
            </p>

            {/* Feature points */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                  <MapPin size={18} className="text-gold" />
                </div>
                <div>
                  <h4 className="font-medium text-espresso mb-1">
                    Every Port Tells a Story
                  </h4>
                  <p className="text-sm text-espresso/60">
                    From Santorini sunsets to Caribbean shores
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                  <Calendar size={18} className="text-gold" />
                </div>
                <div>
                  <h4 className="font-medium text-espresso mb-1">
                    Dates That Matter
                  </h4>
                  <p className="text-sm text-espresso/60">
                    Anniversaries, birthdays, milestones remembered
                  </p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles size={18} className="text-gold" />
                </div>
                <div>
                  <h4 className="font-medium text-espresso mb-1">
                    Magical Moments
                  </h4>
                  <p className="text-sm text-espresso/60">
                    The laughs, the tears, the unforgettable times
                  </p>
                </div>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={scrollToOrder}
              className="group px-8 py-4 bg-espresso text-ivory rounded-full font-medium transition-all duration-fast hover:bg-gold hover:text-espresso flex items-center gap-3"
            >
              Start Your Story
              <ArrowRight size={18} className="transition-transform duration-fast group-hover:translate-x-1" />
            </button>
          </div>

          {/* Image */}
          <div ref={imageRef} className="flex-1 w-full">
            <div className="relative rounded-3xl overflow-hidden shadow-luxury">
              <img
                src="/images/lyrics-section.jpg"
                alt="Travel journal with memories"
                className="w-full aspect-[16/10] object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/20 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TripToLyricsSection;
