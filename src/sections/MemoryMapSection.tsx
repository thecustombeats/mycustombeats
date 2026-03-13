import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Ship, Heart, PenTool, Music2, Gift, ChevronRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const steps = [
  {
    id: 'cruise',
    icon: Ship,
    title: 'Cruise Details',
    description: 'Share your voyage, ports, and special moments',
    color: 'ocean',
  },
  {
    id: 'memories',
    icon: Heart,
    title: 'Memories',
    description: 'Tell us the stories that made your trip unforgettable',
    color: 'sunset',
  },
  {
    id: 'lyrics',
    icon: PenTool,
    title: 'Lyrics',
    description: 'We weave your words into poetic verses',
    color: 'gold',
  },
  {
    id: 'production',
    icon: Music2,
    title: 'Production',
    description: 'Real musicians craft your unique soundtrack',
    color: 'ocean',
  },
  {
    id: 'keepsake',
    icon: Gift,
    title: 'Keepsake Delivery',
    description: 'Receive your song, artwork, and lyrics',
    color: 'gold',
  },
];

const MemoryMapSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.memory-heading',
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
        '.memory-step',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.memory-steps',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const getColorClass = (color: string) => {
    switch (color) {
      case 'ocean':
        return 'bg-ocean text-ivory';
      case 'sunset':
        return 'bg-sunset text-espresso';
      case 'gold':
        return 'bg-gold text-espresso';
      default:
        return 'bg-gold text-espresso';
    }
  };

  return (
    <div
      ref={sectionRef}
      className="relative w-full bg-ivory py-24 overflow-hidden"
    >
      <div className="px-[7vw]">
        {/* Heading */}
        <div className="memory-heading text-center mb-16">
          <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
            Our Process
          </span>
          <h2 className="font-serif text-espresso mb-4">
            Memory Map
          </h2>
          <p className="text-lg text-espresso/60 max-w-xl mx-auto" style={{ fontFamily: 'Arimo, sans-serif' }}>
            How we turn cruise memories into music
          </p>
        </div>

        {/* Steps */}
        <div className="memory-steps flex flex-col lg:flex-row items-stretch justify-center gap-4 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = activeStep === index;
            
            return (
              <div
                key={step.id}
                className="memory-step flex-1 relative"
                onMouseEnter={() => setActiveStep(index)}
              >
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-10 left-full w-full h-px z-0">
                    <div className="w-full h-full bg-gradient-to-r from-gold/40 to-gold/20" />
                    <ChevronRight 
                      size={16} 
                      className="absolute right-0 top-1/2 -translate-y-1/2 text-gold/40" 
                    />
                  </div>
                )}

                <div 
                  className={`relative z-10 bg-white rounded-2xl p-6 transition-all duration-fast cursor-pointer h-full ${
                    isActive ? 'shadow-luxury-hover -translate-y-1' : 'shadow-luxury hover:shadow-luxury-hover hover:-translate-y-0.5'
                  }`}
                >
                  {/* Step number */}
                  <span className="absolute top-4 right-4 text-xs font-medium text-espresso/30">
                    0{index + 1}
                  </span>

                  {/* Icon */}
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${getColorClass(step.color)}`}>
                    <Icon size={22} />
                  </div>

                  {/* Content */}
                  <h3 className="font-serif text-lg text-espresso mb-2">
                    {step.title}
                  </h3>
                  <p className="text-sm text-espresso/60 leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom note */}
        <p className="text-center text-espresso/50 mt-12 text-sm" style={{ fontFamily: 'Arimo, sans-serif' }}>
          Hover over each step to preview the process
        </p>
      </div>
    </div>
  );
};

export default MemoryMapSection;
