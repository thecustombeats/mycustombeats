import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MessageSquare, Heart, Music, Package, ArrowRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    icon: MessageSquare,
    title: 'Share your story',
    description: 'Cruise, celebration, or milestone.',
  },
  {
    icon: Heart,
    title: 'Choose the mood',
    description: 'Romantic, nostalgic, upbeat, calm.',
  },
  {
    icon: Music,
    title: 'We compose & produce',
    description: 'Real musicians. Real instruments.',
  },
  {
    icon: Package,
    title: 'Receive your keepsake',
    description: 'Song + artwork + lyrics.',
  },
];

const HowItWorksSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.hiw-heading',
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
        '.hiw-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.07,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.hiw-cards',
            start: 'top 85%',
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
      id="how-it-works"
      className="relative w-full bg-misty-stone py-24 overflow-hidden"
    >
      <div className="px-[7vw]">
        {/* Heading */}
        <div className="hiw-heading text-center mb-16">
          <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
            The Process
          </span>
          <h2 className="font-serif text-espresso">
            How we turn your journey into music
          </h2>
        </div>

        {/* Cards */}
        <div className="hiw-cards flex flex-col lg:flex-row items-stretch justify-center gap-6 max-w-5xl mx-auto mb-12">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div
                key={index}
                className="hiw-card flex-1 bg-white rounded-2xl shadow-luxury p-8 flex flex-col items-center text-center transition-all duration-fast hover:-translate-y-1 hover:shadow-luxury-hover"
              >
                <span className="label-uppercase text-gold mb-6">
                  Step {index + 1}
                </span>

                <div className="w-16 h-16 rounded-xl bg-gold/10 flex items-center justify-center mb-6">
                  <Icon size={28} className="text-gold" />
                </div>

                <h3 className="font-serif text-xl text-espresso mb-3">
                  {step.title}
                </h3>

                <p className="text-espresso/60 leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={scrollToOrder}
            className="group px-8 py-4 bg-espresso text-ivory rounded-full font-medium transition-all duration-fast hover:bg-gold hover:text-espresso flex items-center gap-3 mx-auto"
            style={{ fontFamily: 'Arimo, sans-serif' }}
          >
            Start Your Story
            <ArrowRight size={18} className="transition-transform duration-fast group-hover:translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default HowItWorksSection;
