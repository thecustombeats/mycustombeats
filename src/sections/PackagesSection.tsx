import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, Music } from 'lucide-react';
import { Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";


gsap.registerPlugin(ScrollTrigger);

/* Packages */
const packages = [
  { 
    id: 'moment',
    name: 'Moment',
    price: { gbp: '£29', usd: '$39' },
    description:
      'A simple, beautiful way to turn a memory into music. Perfect for first-time buyers and quick, meaningful gifts.',
    features: [
      '1 personalised mini song (60–90 seconds)',
      'Lightly customised lyrics from your story',
      'Choose your mood/style',
      '1 revision included',
      'MP3 delivery',
      'Delivered within 3–5 days'
    ],
    popular: false,
    tag: 'starter'
  },

  { 
    id: 'keepsake',
    name: 'Keepsake',
    price: { gbp: '£79', usd: '$99' },
    description:
      'Perfect for a heartfelt gift, proposal, or meaningful personal moment.',
    features: [
      '1 fully personalised song (3–4 minutes)',
      'Story-driven lyrics crafted from your memories',
      '2 refinement revisions',
      'Elegant digital cover artwork',
      'High-quality MP3 + WAV delivery',
      'Delivered within 14 days'
    ],
    popular: false,
    tag: null
  },

  {
    id: 'journey',
    name: 'Journey',
    price: { gbp: '£199', usd: '$249' },
    description:
      'Ideal for cruises, anniversaries, romantic escapes, and milestone celebrations.',
    features: [
      '3 personalised songs',
      'Unified musical theme across all tracks',
      'Structured emotional journey (beginning → middle → finale)',
      '3 refinements per song',
      'Priority production handling',
      'Custom album artwork',
      '1-page lyric booklet (PDF)',
      'Deluxe digital delivery package',
      'Delivered within 10–14 days'
    ],
    popular: true,
    tag: 'bestValue'
  },

  {
    id: 'heirloom',
    name: 'Heirloom',
    price: { gbp: '£349', usd: '$449' },
    description:
      'Designed for weddings, family milestones, and once-in-a-lifetime celebrations.',
    features: [
      '6-song cohesive storytelling album',
      'Narrative-driven emotional arc',
      'Custom intro and closing theme',
      '4 refinements per song',
      'Producer-guided creative review',
      'Premium custom album artwork',
      'Multi-page lyric & story booklet (PDF)',
      'Private streaming link for sharing',
      'Priority handling',
      'Delivered within 14 days'
    ],
    popular: false,
    tag: null
  },

  {
    id: 'bespoke',
    name: 'Bespoke',
    price: { gbp: '£799', usd: '$999' },
    pricePrefix: 'From',
    description:
      'A fully commissioned luxury experience.',
    features: [
      'Fully commissioned custom project', 
      'Private 1:1 creative consultation', 
      'Dedicated 7-day production window', 
      'Unlimited refinements during production window', 
      'Exclusive arrangement usage rights', 
      'Custom instrumentation & arrangement requests', 
      'Deluxe album artwork (multiple concepts)', 
      '5–10 page premium story & lyric booklet', 
      'Instrumental versions included', 
      'High-resolution artwork files', 
      'White-glove delivery experience'
    ],
    popular: false,
    tag: null
  },
];

interface PackagesSectionProps {
  selectedPackage: string | null;
  setSelectedPackage: (pkg: string) => void;
}

const PackagesSection = ({ selectedPackage, setSelectedPackage }: PackagesSectionProps) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<string[]>([]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.package-card',
        { y: 40, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
          },
        }
      );
    }, section);


    return () => ctx.revert();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedPackages((prev) =>
      prev.includes(id)
        ? prev.filter((pkgId) => pkgId !== id)
        : [...prev, id]
    );
  };

  const handleSelect = (packageId: string) => {
  setSelectedPackage(packageId);

  const orderForm = document.querySelector('#order');
  if (orderForm) {
    orderForm.scrollIntoView({ behavior: 'smooth' });
  }
};

  return (
    <>
    
    <Helmet>
  <title>Custom Song Packages & Pricing | My Custom Beats</title>
  <meta
    name="description"
    content="Explore our custom song packages designed for every occasion. Premium music production tailored to your story and budget."
  />
</Helmet>


    <div
      ref={sectionRef}
      id="packages"
      className="relative w-full bg-ivory py-16"
    >
      <div className="px-[7vw] max-w-[1400px] mx-auto">
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mx-auto mb-6">
            <Music size={24} className="text-gold" />
          </div>

          <h2 className="text-espresso mb-4 leading-tight tracking-tight">
            Choose your experience
          </h2>

          <p className="text-espresso/70 max-w-xl mx-auto">
            Crafted by real musicians. Designed for meaningful moments.
          </p>
        </div>
        

<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 xl:gap-12">
    {packages.map((pkg) => {
    const isExpanded = expandedPackages.includes(pkg.id);
    const visibleFeatures = pkg.features.slice(0, 4);
    const hiddenFeatures = pkg.features.slice(4);

    return (
      <div className="flex" key={pkg.id}>
        <div
          onClick={() => handleSelect(pkg.id)}
          className={`package-card relative group cursor-pointer bg-white rounded-t-xl border p-8 lg:p-9 flex flex-col w-full transition-all duration-300

          ${pkg.popular ? 'lg:scale-105 z-10 border-gold shadow-[0_25px_50px_rgba(0,0,0,0.12)]' : 'border-espresso/10'}

          ${selectedPackage === pkg.id ? 'border-gold shadow-[0_25px_60px_rgba(212,175,55,0.25)] scale-[1.03]' : ''}

          ${pkg.id === 'moment' ? 'opacity-80 scale-[0.95]' : ''}
          `}
        >

          {/* Starter Badge */}
{pkg.tag === 'starter' && (
  <div 
  className="absolute top-4 left-4 text-[10px] tracking-[0.18em] uppercase text-espresso/50">
   For First-Time Buyers
  </div>
)}

{/* Best Value Badge */}
{pkg.tag === 'bestValue' && (
  <div className="absolute top-4 left-4 text-[10px] tracking-widest uppercase text-gold border border-gold/30 px-2 py-1 rounded-full bg-gold/5 backdrop-blur-sm">
    Best Value
  </div>
)}

          {pkg.popular && (
            <div className="absolute top-3 right-3 text-gold">
              <Sparkles size={18} />
            </div>
          )}

          {/* TITLE */}
          <h3 className="font-serif text-xl text-espresso mb-3 text-center">
            {pkg.name}
          </h3>

          {/* PRICE */}
          <div className="mb-5">
            <div className="flex items-end justify-center gap-2">
              {pkg.pricePrefix && (
                <span className="text-sm text-espresso/60 mb-1">
                  {pkg.pricePrefix}
                </span>
              )}

              <span className="text-3xl font-serif text-gold">
                {pkg.price.gbp}
              </span>

              <span className="text-sm text-espresso/50 mb-1">
                {pkg.price.usd}
              </span>
            </div>

<p className="text-[11px] text-espresso/50 text-center mt-1">
  {pkg.id === 'moment' && 'Perfect for first-time buyers'}
  {pkg.id === 'keepsake' && 'Most popular gift'}
  {pkg.id === 'journey' && 'Best overall experience'}
  {pkg.id === 'heirloom' && 'For major life events'}
  {pkg.id === 'bespoke' && 'Full luxury production'}
</p>

            {pkg.popular && (
              <p className="text-xs text-gold text-center mt-1 tracking-wide">
                Most chosen by customers
              </p>
            )}
          </div>

          {/* DESCRIPTION */}
          <p className="text-sm text-espresso/70 mb-4">
            {pkg.description}
          </p>

          {/* FEATURES */}
          <ul className="space-y-2 mb-5">
            {visibleFeatures.map((feature, index) => (
              <li key={index} className="flex gap-3">
                <Check size={18} className="text-gold mt-1" />
                <span className="text-sm">{feature}</span>
              </li>
            ))}

            {isExpanded &&
              hiddenFeatures.map((feature, index) => (
                <li key={index + 4} className="flex gap-3">
                  <Check size={18} className="text-gold mt-1" />
                  <span className="text-sm">{feature}</span>
                </li>
              ))}
          </ul>

          {/* EXPAND */}
          {hiddenFeatures.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(pkg.id);
              }}
              className="text-sm text-gold mb-6 hover:underline"
            >
              {isExpanded ? 'Show Less' : 'View Full Experience'}
            </button>
          )}

          {/* CTA */}
          <div className="flex justify-center mt-auto pt-6">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(pkg.id);
              }}
className="px-6 py-2 text-[11px] tracking-[0.2em] uppercase text-espresso border border-espresso/30 rounded-full transition-all duration-300 hover:bg-espresso hover:text-ivory hover:border-espresso"            >
              {pkg.id === 'moment'
                ? 'Try It Now'
                : pkg.id === 'journey'
                ? 'Choose Best Value'
                : 'Begin This Experience'}
            </button>
          </div>

        </div>
      </div>
    );
  })}
      </div>
    </div>
  </div>
  </>
);
};

export default PackagesSection;