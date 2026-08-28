import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Music } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const TrustStripSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        section.querySelector('.trust-content'),
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        section.querySelector('.trust-line'),
        { scaleX: 0 },
        {
          scaleX: 1,
          duration: 0.6,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={sectionRef}
      className="relative w-full bg-ivory py-16 overflow-hidden"
    >
      <div className="trust-content flex flex-col items-center justify-center px-[7vw]">
        <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mb-6">
          <Music size={24} className="text-gold" />
        </div>

        <h3 className="font-serif text-2xl text-espresso mb-3">
          Crafted by Real Musicians
        </h3>

        <p className="text-espresso/70 max-w-xl mx-auto text-center leading-relaxed">
          Each Custom Beat is crafted by our founders alongside a curated global collective of 200+ professional musicians.
        </p>

        <div className="trust-line w-24 h-px bg-gold mt-8" style={{ transformOrigin: 'center' }} />
      </div>
    </div>
  );
};

export default TrustStripSection;
