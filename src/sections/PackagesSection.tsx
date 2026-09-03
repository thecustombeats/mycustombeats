import { useEffect, useRef, useState } from 'react';
import { Check, Music } from 'lucide-react';
import { Sparkles } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { revealOnScroll } from '../lib/scrollReveal';
import { PACKAGES, FORMATS, formatPrice } from '../data/packages';
import { packagesStructuredData } from '../lib/seo';

/**
 * The four fixed experiences sit in the comparison grid. Bespoke is an
 * open-ended commission with no fixed format or song count, so it gets its
 * own band below rather than a fifth column that would never compare fairly.
 */
const CORE_PACKAGES = PACKAGES.filter((pkg) => pkg.id !== 'bespoke');
const BESPOKE_PACKAGE = PACKAGES.find((pkg) => pkg.id === 'bespoke');

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

    // Reveal is guaranteed to end visible — the price list must never be
    // hidden by an animation that failed to fire. See lib/scrollReveal.
    return revealOnScroll(section, '.package-card');
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
    {/* Product + Offer data for every experience, generated from the same
        source as the visible cards so markup and page can never disagree. */}
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(packagesStructuredData())}
      </script>
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
        

<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 xl:gap-10 items-stretch">
    {CORE_PACKAGES.map((pkg) => {
    const isExpanded = expandedPackages.includes(pkg.id);
    const visibleFeatures = pkg.features.slice(0, 4);
    const hiddenFeatures = pkg.features.slice(4);
    const isSelected = selectedPackage === pkg.id;

    return (
      <div className="flex" key={pkg.id}>
        <div
          onClick={() => handleSelect(pkg.id)}
          className={`package-card relative group cursor-pointer bg-white rounded-2xl border p-8 flex flex-col w-full transition-all duration-300
          ${pkg.popular ? 'border-gold shadow-[0_20px_50px_rgba(13,27,42,0.10)]' : 'border-espresso/10 hover:border-gold/40'}
          ${isSelected ? 'border-gold ring-1 ring-gold/40' : ''}`}
        >
          {pkg.popular && (
            <div className="absolute top-5 right-5 text-gold" aria-hidden="true">
              <Sparkles size={16} />
            </div>
          )}

          {/* TITLE */}
          <h3 className="font-serif text-2xl text-espresso mb-1 text-center">
            {pkg.name}
          </h3>

          {/* Fixed height so the approved positioning lines cannot push their
              price out of alignment with the other cards. 4.5em is three lines
              at this size and leading — what the longest approved line
              ("Turn the memory into something you can hold.") needs in a
              four-column card. Shrink this and Keepsake's price drops 7px
              below the rest. */}
          <p className="text-[11px] tracking-[0.16em] uppercase text-espresso/45 text-center mb-5 min-h-[4.5em] flex items-center justify-center leading-[1.5]">
            {pkg.positioning}
          </p>

          {/* PRICE */}
          <div className="mb-5 text-center">
            <div className="flex items-baseline justify-center gap-2">
              <span className="text-4xl font-serif text-espresso">
                {formatPrice(pkg)}
              </span>
              <span className="font-mono text-sm text-espresso/45">
                {formatPrice(pkg, 'usd')}
              </span>
            </div>

            {pkg.popular && (
              <p className="text-xs text-gold-deep mt-2 tracking-wide">
                Most chosen by customers
              </p>
            )}
          </div>

          <div className="h-px w-10 bg-gold/50 mx-auto mb-5" aria-hidden="true" />

          {/* DESCRIPTION */}
          <p className="text-sm text-espresso/70 mb-5 leading-relaxed">
            {pkg.description}
          </p>

          {/* FEATURES */}
          <ul className="space-y-2.5 mb-4">
            {visibleFeatures.map((feature, index) => (
              <li key={index} className="flex gap-2.5">
                <Check size={16} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                <span className="text-sm text-espresso/80 leading-snug">{feature}</span>
              </li>
            ))}

            {isExpanded &&
              hiddenFeatures.map((feature, index) => (
                <li key={index + 4} className="flex gap-2.5">
                  <Check size={16} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                  <span className="text-sm text-espresso/80 leading-snug">{feature}</span>
                </li>
              ))}
          </ul>

          {/* EXPAND */}
          {hiddenFeatures.length > 0 && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(pkg.id);
              }}
              className="text-sm text-gold-deep mb-5 hover:underline self-start"
            >
              {isExpanded ? 'Show less' : 'View full experience'}
            </button>
          )}

          {/* FORMAT — names come through as-is now that no size or colour
              is baked into them. See FORMATS in data/packages.ts. */}
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-espresso/45 mt-auto pt-5 border-t border-espresso/10">
            {pkg.formats.map((f) => FORMATS[f].name).join(' · ')}
          </p>

          {/* CTA */}
          <div className="flex justify-center pt-5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(pkg.id);
              }}
              className={`px-6 py-2.5 text-[11px] tracking-[0.2em] uppercase rounded-full transition-all duration-300 ${
                pkg.popular
                  ? 'bg-gold text-ink hover:bg-gold-dark hover:text-white'
                  : 'text-espresso border border-espresso/25 hover:bg-ink hover:text-ivory hover:border-ink'
              }`}
            >
              {pkg.cta}
            </button>
          </div>
        </div>
      </div>
    );
  })}
      </div>

      {/* ---- Bespoke: a commission, not a package. Presented as its own
           editorial band so it reads as deliberate rather than a fifth
           card left over at the end of a four-column grid. ---- */}
      {BESPOKE_PACKAGE && (
        <div className="package-card mt-8 xl:mt-10 rounded-2xl bg-ink text-ivory p-8 md:p-12 grid md:grid-cols-[1fr_auto] gap-8 md:gap-12 items-center">
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
              {BESPOKE_PACKAGE.positioning}
            </p>
            <h3 className="font-serif text-3xl md:text-4xl text-ivory mb-3">
              {BESPOKE_PACKAGE.name}
            </h3>
            <p className="text-ivory/70 max-w-xl leading-relaxed mb-6">
              {BESPOKE_PACKAGE.description}
            </p>

            {/* Every inclusion, not the first six. Bespoke is the most
                expensive experience on the site and was the only one hiding
                what it contains — five of its eleven inclusions were
                unreachable, with no way to expand them. */}
            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-2xl">
              {BESPOKE_PACKAGE.features.map((feature, index) => (
                <li key={index} className="flex gap-2.5">
                  <Check size={15} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                  <span className="text-sm text-ivory/75 leading-snug">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Delivery, which every other card states and this band did not. */}
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-ivory/50 mt-6 pt-5 border-t border-ivory/15">
              {BESPOKE_PACKAGE.delivery}
            </p>
          </div>

          <div className="text-left md:text-right shrink-0">
            <div className="font-serif text-4xl text-ivory mb-1">
              {formatPrice(BESPOKE_PACKAGE)}
            </div>
            <div className="font-mono text-sm text-ivory/50 mb-6">
              {formatPrice(BESPOKE_PACKAGE, 'usd')}
            </div>
            <button
              type="button"
              onClick={() => handleSelect(BESPOKE_PACKAGE.id)}
              className="px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full bg-gold text-ink hover:bg-gold-light transition-all duration-300"
            >
              {BESPOKE_PACKAGE.cta}
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
  </>
);
};

export default PackagesSection;