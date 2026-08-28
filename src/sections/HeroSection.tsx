import { useEffect, useRef, useState } from 'react';
import PersonalizationModal from '../components/PersonalizationModal';
import { gsap } from 'gsap';

const HeroSection = () => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const subheadlineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLButtonElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  // ✅ STATE
  const [showModal, setShowModal] = useState(false);
  const [userType, setUserType] = useState<string | null>(null);

  // ✅ Load saved user type
  useEffect(() => {
    const savedType = localStorage.getItem("userType");
    if (savedType) {
      setUserType(savedType);
    }
  }, []);

  // ✅ Modal timing logic
  useEffect(() => {
    const seen = localStorage.getItem("personalizationSeen");

    if (!seen) {
      const timer = setTimeout(() => {
        setShowModal(true);
      }, 4500);

      return () => clearTimeout(timer);
    }
  }, []);

  // ✅ GSAP Animations
  useEffect(() => {
    const headline = headlineRef.current;
    const subheadline = subheadlineRef.current;
    const cta = ctaRef.current;
    const images = imagesRef.current;

    if (!headline || !subheadline || !cta || !images) return;

    const tl = gsap.timeline({ delay: 0.2 });

    tl.fromTo(
      headline,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' }
    );

    tl.fromTo(
      subheadline,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
      '-=0.3'
    );

    tl.fromTo(
      cta,
      { y: 15, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, ease: 'power2.out' },
      '-=0.2'
    );
  }, []);

  // ✅ Dynamic Headline
  const getHeadline = () => {
    switch (userType) {
      case "partner":
        return "Turn your love story into a song you'll keep forever";
      case "gift":
        return "Create the most unforgettable gift they'll ever receive";
      case "family":
        return "Preserve your family memories in a song";
      case "friends":
        return "Turn your best moments into a song";
      case "solo":
        return "Tell your story through music";
      default:
        return "Turn your story into a song you'll keep forever";
    }
  };

  // ✅ Dynamic Subheadline
  const getSubheadline = () => {
    switch (userType) {
      case "partner":
        return "A deeply personal song crafted from your love story.";
      case "gift":
        return "A one-of-a-kind gift they'll never forget.";
      case "family":
        return "Celebrate the moments that matter most.";
      case "friends":
        return "Capture the fun, laughter, and memories.";
      case "solo":
        return "A song that reflects your journey.";
      default:
        return "A personalised, professionally produced song crafted from your memories.";
    }
  };

  const getCTA = () => {
  switch (userType) {
    case "partner":
      return "Create My Love Song";
    case "gift":
      return "Create My Gift";
    case "family":
      return "Create My Family Song";
    case "friends":
      return "Create My Memory Song";
    case "solo":
      return "Create My Story Song";
    default:
      return "Create My Custom Song";
  }
};

const getSecondaryCTA = () => {
  return "Begin Your Composition";
};

const scrollToOrder = () => {
  if (window.location.pathname !== "/") {
    window.location.href = "/#order";
    return;
  }

  const el = document.querySelector("#order");
  if (el) el.scrollIntoView({ behavior: "smooth" });
};


  return (
    <>

      <div
        ref={sectionRef}
        className="relative w-full min-h-screen bg-ivory overflow-hidden"
      >
        {/* Background Video */}
        <div ref={imagesRef} className="absolute inset-0 overflow-hidden">
          <video
            className="w-full h-full object-cover scale-[1.05] animate-heroZoom"
            autoPlay
            loop
            muted
            playsInline
            preload="none"
            poster="/images/hero-poster.jpg"
          >
            <source src="/videos/hero-luxury.mp4" type="video/mp4" />
          </video>
        </div>

        {/* Overlays */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(0,0,0,0.45)_100%)]"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-espresso/50 to-espresso/30 backdrop-blur-[2px]" />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 text-center">

          <span className="label-uppercase text-ivory/60 mb-6 tracking-[0.2em]">
            Featured on BBC Radio • Trusted by global clients
          </span>

          <h1
            ref={headlineRef}
            className="font-serif text-ivory mb-10 max-w-4xl leading-[1.05]"
            style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
          >
            {getHeadline()}
          </h1>

          <p
            ref={subheadlineRef}
            className="text-xl text-ivory/85 mb-10 max-w-2xl"
          >
            {getSubheadline()}
          </p>

          <div className="flex flex-col items-center gap-4">

  {/* Primary CTA */}
  <button
    ref={ctaRef}
    onClick={() => window.location.href = "/anniversary-song"}
    className="px-10 py-4 bg-gold text-espresso rounded-full text-lg hover:bg-ivory transition"
  >
    {getCTA()}
  </button>

  {/* Secondary CTA (Luxury subtle style) */}
  <button
    onClick={scrollToOrder}
    className="text-ivory/80 text-sm tracking-wide underline underline-offset-4 hover:text-ivory transition"
  >
    {getSecondaryCTA()}
  </button>

</div>

        </div>
      </div>

      {/* ✅ Modal */}
      <PersonalizationModal
        isOpen={showModal}
        onClose={() => {
          localStorage.setItem("personalizationSeen", "true");
          setShowModal(false);
        }}
        onSelect={(type) => {
          localStorage.setItem("userType", type);
          localStorage.setItem("personalizationSeen", "true");
          setUserType(type);
          setShowModal(false);
        }}
      />
    </>
  );
};

export default HeroSection;