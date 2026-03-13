import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Instagram, Youtube, Facebook, MessageCircle, Music } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const AboutSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.about-trust',
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
        '.founder-card',
        { y: 60, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.founders-grid',
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        '.video-embed',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.08,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.videos-grid',
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={sectionRef} id="about" className="relative w-full bg-ivory py-24 overflow-hidden">
      {/* Trust Strip */}
      <div className="about-trust text-center mb-20 px-[7vw]">
        <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mx-auto mb-6">
          <Music size={24} className="text-gold" />
        </div>
        <h3 className="font-serif text-2xl text-espresso mb-3">
          Crafted by Real Musicians
        </h3>
        <p className="text-espresso/70 max-w-xl mx-auto leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
          Each Custom Beat is crafted by our founders alongside a curated global collective of 200+ professional musicians.
        </p>
        <div className="w-16 h-px bg-gold mx-auto mt-8" />
      </div>

      {/* Heading */}
      <div className="text-center mb-16 px-[7vw]">
        <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
          The Team
        </span>
        <h2 className="font-serif text-espresso">
          Meet the founders
        </h2>
      </div>

      {/* Founders Grid */}
      <div className="founders-grid flex flex-col lg:flex-row items-stretch justify-center gap-8 px-[7vw] mb-20">
        {/* Rinaldi */}
        <div className="founder-card flex-1 max-w-lg bg-white rounded-2xl shadow-luxury overflow-hidden transition-all duration-fast hover:-translate-y-1 hover:shadow-luxury-hover">
          <div className="aspect-[16/10] overflow-hidden">
            <img src="/images/founder1-rinaldi.jpg" alt="Rinaldi - Founder & Lead Producer" className="w-full h-full object-cover" />
          </div>
          <div className="p-8">
            <h3 className="font-serif text-2xl text-espresso mb-1">Rinaldi</h3>
            <p className="text-gold text-sm uppercase tracking-wider mb-4">Founder & Lead Producer</p>
            <p className="text-espresso/70 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Arimo, sans-serif' }}>
              BBC Radio–featured professional DJ, producer, and songwriter with over a decade of international experience across global stages, luxury cruise ships, private events, and high-profile productions.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://wa.me/447340742009" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast" aria-label="WhatsApp">
                <MessageCircle size={18} />
              </a>
              <a href="https://instagram.com/djrinaldiofficial" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast" aria-label="Instagram">
                <Instagram size={18} />
              </a>
              <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast" aria-label="Facebook">
                <Facebook size={18} />
              </a>
              <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast" aria-label="YouTube">
                <Youtube size={18} />
              </a>
            </div>
          </div>
        </div>

        {/* Lady Lakh */}
        <div className="founder-card flex-1 max-w-lg bg-white rounded-2xl shadow-luxury overflow-hidden transition-all duration-fast hover:-translate-y-1 hover:shadow-luxury-hover">
          <div className="aspect-[16/10] overflow-hidden">
            <img src="/images/founder2-lakh.jpg" alt="DJ Lady Lakh - Co-Founder & Producer" className="w-full h-full object-cover" />
          </div>
          <div className="p-8">
            <h3 className="font-serif text-2xl text-espresso mb-1"> Lady Lakh</h3>
            <p className="text-gold text-sm uppercase tracking-wider mb-4">Co-Founder & Producer</p>
            <p className="text-espresso/70 text-sm leading-relaxed mb-6" style={{ fontFamily: 'Arimo, sans-serif' }}>
              Internationally experienced DJ and producer known for her dynamic musical range and intuitive crowd connection. Specialist in mood, flow, and celebration across luxury events worldwide.
            </p>
            <div className="flex items-center gap-4">
              <a href="https://instagram.com/djladylakh" target="_blank" rel="noopener noreferrer" className="w-10 h-10 rounded-full bg-misty-stone flex items-center justify-center text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast" aria-label="Instagram">
                <Instagram size={18} />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Global Collective */}
      <div className="text-center mb-20 px-[7vw]">
        <h3 className="font-serif text-xl text-espresso mb-4">Our Global Creative Collective</h3>
        <p className="text-espresso/70 max-w-3xl mx-auto leading-relaxed" style={{ fontFamily: 'Arimo, sans-serif' }}>
          Behind Custom Beats are two internationally experienced artists whose combined expertise spans global stages, luxury events, and professional music production. Supporting them is a curated global collective of over 200 professional musicians — including pianists, violinists, drummers, guitarists, saxophonists, flautists, vocalists, DJs, and specialist instrumentalists.
        </p>
      </div>

      {/* What Makes Us Different */}
      <div className="bg-misty-stone py-16 px-[7vw] mb-20">
        <h3 className="font-serif text-xl text-espresso text-center mb-8">What Makes Custom Beats Different</h3>
        <div className="flex flex-wrap justify-center gap-4 max-w-4xl mx-auto">
          {[
            'Fully personalised, made-to-order music',
            'Professionally curated by experienced producers',
            'Emotion-led storytelling, not automated templates',
            'Luxury guest experience from start to delivery',
            'Trusted by private clients and cruise guests worldwide',
          ].map((item, index) => (
            <div key={index} className="flex items-center gap-3 bg-white px-6 py-3 rounded-full">
              <span className="w-2 h-2 rounded-full bg-gold" />
              <span className="text-sm text-espresso" style={{ fontFamily: 'Arimo, sans-serif' }}>{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Video Testimonials - Embedded Players */}
      <div className="px-[7vw]">
        <h3 className="font-serif text-xl text-espresso text-center mb-8">Video Testimonials</h3>
        <div className="videos-grid grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          <div className="video-embed aspect-video rounded-2xl overflow-hidden shadow-luxury bg-espresso/5">
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/8xGQcHcmsIA?rel=0&modestbranding=1"
              title="Testimonial 1"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          <div className="video-embed aspect-video rounded-2xl overflow-hidden shadow-luxury bg-espresso/5">
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/ZD6MDvLxBio?rel=0&modestbranding=1"
              title="Testimonial 2"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
          <div className="video-embed aspect-video rounded-2xl overflow-hidden shadow-luxury bg-espresso/5">
            <iframe
              width="100%"
              height="100%"
              src="https://www.youtube.com/embed/a9W2eG1vK5s?rel=0&modestbranding=1"
              title="Testimonial 3"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutSection;
