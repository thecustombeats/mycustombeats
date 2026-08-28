import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Mail, MessageCircle, Instagram, ArrowRight } from 'lucide-react';
import { trackWhatsAppClick, trackEvent } from '../lib/analytics';

gsap.registerPlugin(ScrollTrigger);

const ContactSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.contact-content',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 75%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        '.contact-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.45,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 70%',
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
    <div ref={sectionRef} id="contact" className="relative w-full bg-ocean py-24 overflow-hidden">
      <div className="px-[7vw]">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-20 max-w-5xl mx-auto">
          {/* Content */}
          <div className="contact-content flex-1 text-center lg:text-left">
            <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
              Get In Touch
            </span>
            <h2 className="font-serif text-ivory mb-6">
              Ready to soundtrack your story?
            </h2>
            <p className="text-lg text-ivory/70 mb-8 leading-relaxed">
              Tell us where you are headed. We will handle the music.
            </p>
            <button
              onClick={scrollToOrder}
              className="group px-8 py-4 bg-gold text-espresso rounded-full font-medium transition-all duration-fast hover:bg-ivory hover:scale-[1.02] flex items-center gap-3 mx-auto lg:mx-0"
            >
              Start Your Custom Beat
              <ArrowRight size={18} className="transition-transform duration-fast group-hover:translate-x-1" />
            </button>
          </div>

          {/* Contact Card */}
          <div className="contact-card w-full max-w-md bg-ivory/5 backdrop-blur-sm rounded-3xl border border-ivory/10 p-8">
            <h3 className="font-serif text-xl text-ivory mb-8">Contact Us</h3>

            <div className="space-y-6">
              <a 
                href="mailto:hello@mycustombeats.com" 
                onClick={() => trackEvent("contact_email_click", { location: "contact_section" })}
                className="flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center transition-colors duration-fast group-hover:bg-gold">
                  <Mail size={20} className="text-gold group-hover:text-espresso transition-colors duration-fast" />
                </div>
                <div>
                  <p className="text-xs text-ivory/50 uppercase tracking-wider mb-1">Email us</p>
                  <p className="text-ivory group-hover:text-gold transition-colors duration-fast">hello@mycustombeats.com</p>
                </div>
              </a>

              <a 
                href="https://wa.me/447340742009?text=Hi%20MyCustomBeats%2C%20I%27m%20writing%20from%20the%20contact%20section%20on%20your%20website%20and%20would%20like%20to%20get%20in%20touch." 
                onClick={() => trackWhatsAppClick("contact_section")}
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center transition-colors duration-fast group-hover:bg-gold">
                  <MessageCircle size={20} className="text-gold group-hover:text-espresso transition-colors duration-fast" />
                </div>
                <div>
                  <p className="text-xs text-ivory/50 uppercase tracking-wider mb-1">WhatsApp</p>
                  <p className="text-ivory group-hover:text-gold transition-colors duration-fast">+44 7340 742009</p>
                </div>
              </a>

              <a 
                href="https://instagram.com/djrinaldiofficial?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=contact_section" 
                onClick={() => trackEvent("outbound_social_click", { platform: "instagram", location: "contact_section" })}
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-4 group"
              >
                <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center transition-colors duration-fast group-hover:bg-gold">
                  <Instagram size={20} className="text-gold group-hover:text-espresso transition-colors duration-fast" />
                </div>
                <div>
                  <p className="text-xs text-ivory/50 uppercase tracking-wider mb-1">Instagram</p>
                  <p className="text-ivory group-hover:text-gold transition-colors duration-fast">@djrinaldiofficial</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactSection;
