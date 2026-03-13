import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, Gift } from 'lucide-react';
import { scrollToSection } from "../utils/scrollToSection";

gsap.registerPlugin(ScrollTrigger);

const GiftExperienceSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    const content = contentRef.current;
    const image = imageRef.current;

    if (!section || !content || !image) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        content.children,
        { x: -40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.06,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        image,
        { x: 40, opacity: 0 },
        {
          x: 0,
          opacity: 1,
          duration: 0.45,
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

  const scrollToHowItWorks = () => {
    const element = document.querySelector('#how-it-works');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const scrollToOrder = () => {
  scrollToSection("order");
};

  return (
    <div
      ref={sectionRef}
      className="relative w-full bg-ivory py-24 overflow-hidden"
    >
      <div className="px-[7vw]">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-6xl mx-auto">
          {/* Content */}
          <div ref={contentRef} className="flex-1">
            <span className="label-uppercase text-gold mb-4 flex items-center gap-2 tracking-[0.15em]">
              <Gift size={14} />
              Gift Experience
            </span>

            <h2 className="font-serif text-espresso mb-6">
              A gift they'll listen to for the rest of their lives.
            </h2>

            <p className="text-lg text-espresso/70 mb-8 leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
              Delivered as a beautiful digital keepsake—lyrics, artwork, and a song built from real memories.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={scrollToHowItWorks}
                className="text-espresso font-medium flex items-center gap-2 hover:text-gold transition-colors duration-fast group"
                style={{ fontFamily: 'Arimo, sans-serif' }}
              >
                See how it works
                <ArrowRight size={16} className="transition-transform duration-fast group-hover:translate-x-1" />
              </button>
              <button
                onClick={scrollToOrder}
                className="px-6 py-3 border border-espresso text-espresso rounded-full font-medium transition-all duration-fast hover:bg-espresso hover:text-ivory"
                style={{ fontFamily: 'Arimo, sans-serif' }}
              >
                Order as a Gift
              </button>
              <p className="text-sm text-espresso/50 mt-6">
             Loved by couples, travellers, and families worldwide
             </p>
            </div>
          </div>

          {/* Image */}
          <div ref={imageRef} className="flex-1 w-full">
            <div className="relative rounded-3xl overflow-hidden shadow-luxury hover:shadow-luxury-hover transition-shadow duration-fast">
              <img
                src="/images/gift-box-hands.jpg"
                alt="Luxury gift box on cruise deck"
                className="w-full aspect-[4/5] object-cover transition-transform duration-700 hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/20 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GiftExperienceSection;
