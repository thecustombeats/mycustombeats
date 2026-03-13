import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ArrowRight } from 'lucide-react';

const HeroSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const headline = headlineRef.current;
    const subheadline = subheadlineRef.current;
    const cta = ctaRef.current;
    const images = imagesRef.current;

    if (!headline || !subheadline || !cta || !images) return;

    // Fast load animation
    const tl = gsap.timeline({ delay: 0.2 });

    // Images fade in
    const imageElements = images.querySelectorAll('.hero-image');
    tl.fromTo(
      imageElements,
      { opacity: 0, scale: 1.05 },
      { opacity: 1, scale: 1, duration: 0.5, stagger: 0.08, ease: 'power2.out' }
    );

    // Headline words
    const words = headline.querySelectorAll('.word');
    tl.fromTo(
      words,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, stagger: 0.04, ease: 'power2.out' },
      '-=0.3'
    );

    // Subheadline
    tl.fromTo(
      subheadline,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: 'power2.out' },
      '-=0.2'
    );

    // CTA
    tl.fromTo(
      cta,
      { y: 15, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
      '-=0.15'
    );
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
      className="relative w-full min-h-screen bg-ivory overflow-hidden"
    >
      {/* Background Image Collage - Luxury Travel Focus */}
      <div 
        ref={imagesRef}
        className="absolute inset-0 grid grid-cols-4 gap-2 p-2"
      >
        <div className="hero-image relative overflow-hidden rounded-2xl">
          <img
            src="/images/hero-flight.jpg"
            alt="Luxury charter flight celebration"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/30 to-transparent" />
        </div>
        <div className="hero-image relative overflow-hidden rounded-2xl">
          <img
            src="/images/hero-yacht.jpg"
            alt="Friends celebrating on luxury yacht"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/30 to-transparent" />
        </div>
        <div className="hero-image relative overflow-hidden rounded-2xl">
          <img
            src="/images/hero-cruise.jpg"
            alt="Couple dancing on cruise ship deck"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/30 to-transparent" />
        </div>
        <div className="hero-image relative overflow-hidden rounded-2xl">
          <img
            src="/images/hero-champagne.jpg"
            alt="Champagne toast on private jet"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/30 to-transparent" />
        </div>
      </div>

      {/* Dark Overlay for text readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-espresso/70 via-espresso/40 to-espresso/20" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">
        {/* Label */}
        <span className="label-uppercase text-ivory/60 mb-6 tracking-[0.2em]">
          BBC Radio Featured Musicians
        </span>

        {/* Headline */}
        <h1
          ref={headlineRef}
          className="font-serif text-ivory mb-10 max-w-4xl leading-[1.05]"
          style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
        >
          <span className="word inline-block">Turn</span>{' '}
          <span className="word inline-block">your</span>{' '}
          <span className="word inline-block">journey</span>{' '}
          <span className="word inline-block">into</span>{' '}
          <span className="word inline-block">a</span>{' '}
          <span className="word inline-block">song.</span>
        </h1>

        {/* Subheadline */}
        <p
          ref={subheadlineRef}
          className="text-xl lg:text-2xl text-ivory/85 mb-10 max-w-2xl leading-relaxed"
          style={{ fontFamily: 'Arimo, sans-serif' }}
        >
          Tell us your story. We will craft it into a personalised track you can keep forever.
        </p>

        {/* CTA Button */}
        <button
          ref={ctaRef}
          onClick={scrollToOrder}
          className="group px-10 py-4 bg-gold text-espresso rounded-full font-medium text-lg transition-all duration-fast hover:bg-ivory hover:scale-[1.02] flex items-center gap-3"
          style={{ fontFamily: 'Arimo, sans-serif' }}
        >
          Start Your Custom Beat
          <ArrowRight size={20} className="transition-transform duration-fast group-hover:translate-x-1" />
        </button>

        {/* Micro note */}
        <p className="mt-6 text-sm text-ivory/60" style={{ fontFamily: 'Arimo, sans-serif' }}>
          Crafted by real musicians. Delivered in days.
        </p>
      </div>
    </div>
  );
};

export default HeroSection;
