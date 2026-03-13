import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Check, Music } from 'lucide-react';
import { Sparkles } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

/* Packages */
const packages = [
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
  },
  {
    id: 'bespoke',
    name: 'Bespoke',
    price: { gbp: '£799', usd: '$999' },
    description:
      'A fully commissioned luxury experience for VIP gifting, memorial tributes, and exclusive milestone projects.',
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
        { y: 60, opacity: 0 },
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
    <div
      ref={sectionRef}
      id="packages"
      className="relative w-full bg-ivory py-16"
    >
      <div className="px-[7vw] max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-14 h-14 rounded-xl bg-gold/10 flex items-center justify-center mx-auto mb-6">
            <Music size={24} className="text-gold" />
          </div>

          <h2 className="font-serif text-espresso text-3xl mb-4">
            Choose your experience
          </h2>

          <p className="text-espresso/70 max-w-xl mx-auto">
            Crafted by real musicians. Designed for meaningful moments.
          </p>
        </div>
        

<div className="flex flex-col lg:flex-row gap-6 justify-center items-stretch">
            {packages.map((pkg) => {
            const isExpanded = expandedPackages.includes(pkg.id);
            const visibleFeatures = pkg.features.slice(0, 4);
            const hiddenFeatures = pkg.features.slice(4);

            return (

 <div className="flex-1 flex">

  <div
  key={pkg.id}
    onClick={() => handleSelect(pkg.id)}
    className={`package-card relative group cursor-pointer bg-white rounded-t-xl border p-7 transition-all duration-300 flex flex-col w-full hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(0,0,0,0.08)] ${
      pkg.popular ? 'lg:scale-105 z-10' : ''
    } ${
      selectedPackage === pkg.id
        ? 'border-gold shadow-[0_25px_60px_rgba(212,175,55,0.25)] -mt-3 scale-[1.03] z-10'
        : pkg.popular
        ? 'border-gold shadow-[0_25px_50px_rgba(0,0,0,0.12)]'
        : 'border-espresso/10 hover:border-espresso/30'
    }`}
  >

{pkg.popular && (
  <div className="absolute top-3 right-3 text-gold">
    <Sparkles size={18} />
  </div>
)}

    <h3 className="font-serif text-xl text-espresso mb-3 text-center transition-transform duration-300 group-hover:scale-[1.02]">
      {pkg.name}
    </h3>

<div className="mb-5">
  <div className="flex items-end justify-center gap-2">
    <span className="text-3xl font-serif text-gold">
      {pkg.price.gbp}
    </span>
    <span className="text-sm text-espresso/50 mb-1">
      {pkg.price.usd}
    </span>
  </div>

  {pkg.popular && (
    <p className="text-xs text-gold text-center mt-1 tracking-wide">
      Our Signature Experience
    </p>
  )}
</div>

                <p className="text-sm text-espresso/70 mb-4 transition-colors duration-300 group-hover:text-espresso">
                  {pkg.description}
                </p>

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

                {hiddenFeatures.length > 0 && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      toggleExpand(pkg.id);
    }}
    className="text-sm text-gold mb-6 hover:underline transition"
  >
    {isExpanded ? 'Show Less' : 'View Full Experience'}
  </button>
)}

         <div className="flex justify-center mt-auto pt-6">
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleSelect(pkg.id);
    }}
    className="px-6 py-2 text-xs tracking-widest uppercase text-espresso border border-espresso/40 rounded-full transition-all duration-300 hover:bg-espresso hover:text-ivory hover:border-espresso"
  >
    Begin This Experience
  </button>
 </div>

 </div> 
  </div> 
              );
        })}
      </div>
    </div>
  </div>
);
};

export default PackagesSection;