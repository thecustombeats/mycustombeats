import { useEffect, useRef, useState } from 'react';
import { Check, Music } from 'lucide-react';
import { Sparkles } from "lucide-react";
import { revealOnScroll } from '../lib/scrollReveal';
import { Link } from 'react-router-dom';
import {
  PACKAGES,
  FORMATS,
  CONCIERGE_SEQUENCE,
  isConcierge,
  isFixedPrice,
} from '../data/packages';
import Price from '../components/Price';
import { scrollToSection } from '../utils/scrollToSection';

/**
 * The comparison grid holds the experiences that can actually be compared:
 * four fixed prices, four format choices, four delivery promises.
 *
 * Selected by COMMERCIAL MODEL rather than by excluding the id 'bespoke'.
 * The old filter said "everything except this one package", which happened to
 * be right and explained nothing; this one says why, and a second concierge
 * experience would land in the right place without an edit here.
 */
const CORE_PACKAGES = PACKAGES.filter(isFixedPrice);
const CONCIERGE_PACKAGE = PACKAGES.find(isConcierge);

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

  /**
   * Selecting a package takes the customer to the order form with it chosen.
   *
   * This used to read `document.querySelector('#order')` and scroll only if
   * it found something. The order form is lazy-loaded, so on a first visit it
   * usually found nothing: the card highlighted and the page did not move,
   * which is what "it only highlights and doesn't navigate" was. Waiting for
   * the section fixes every card, Bespoke included.
   */
  const handleSelect = (packageId: string) => {
    setSelectedPackage(packageId);
    scrollToSection('order');
  };

  return (
    <>
    {/* Package Product + Offer data is emitted once, by the homepage graph in
        App.tsx. This section previously emitted its own block, which put two
        competing JSON-LD scripts describing the same five products on one
        page. See lib/seo.ts. */}
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

          {/* PRICE
              The legacy hard-coded USD that used to sit beside the pound
              figure is gone. It was a fixed number from the package data, so
              it disagreed with the live conversion the moment rates moved —
              two different answers to "what is this in dollars?". <Price>
              owns that question now, and always derives it from GBP. */}
          <div className="mb-5 text-center">
            <div className="flex flex-col items-center">
              <Price gbp={pkg.price.gbp} prefix={pkg.price.prefix} size="lg" />
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

      {/* ---- THE FULL PACKAGE ------------------------------------------
           Its own band, and deliberately not a fifth column. The four cards
           above compare on price, format and song count; this one has none of
           those, and putting it in the grid would invite the reader to
           compare it on axes it does not have — which is how it ended up
           labelled "From £799", a figure that described the old music-only
           commission and undersold a curated package.

           So the band carries no price and no Price component. What sits
           where the price used to sit is the commercial sequence: what
           happens, in what order, and where payment falls in it. That is the
           reassurance a customer actually needs from an unpriced offer.
           ---------------------------------------------------------------- */}
      {CONCIERGE_PACKAGE && (
        <div className="package-card mt-8 xl:mt-10 rounded-2xl bg-ink text-ivory p-8 md:p-12">
          <div className="grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-14 items-start">
            <div className="min-w-0">
              <p className="text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
                {CONCIERGE_PACKAGE.conciergeLabel ?? CONCIERGE_PACKAGE.positioning}
              </p>
              <h3 className="font-serif text-3xl md:text-4xl text-ivory mb-3">
                {CONCIERGE_PACKAGE.name}
              </h3>
              {/* The approved concierge copy, rendered from the package data
                  rather than retyped here, so the card and the structured
                  data cannot describe this differently. */}
              <p className="text-ivory/70 max-w-xl leading-relaxed mb-6">
                {CONCIERGE_PACKAGE.description}
              </p>

              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-2xl list-none p-0 m-0">
                {CONCIERGE_PACKAGE.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check size={15} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                    <span className="text-sm text-ivory/75 leading-snug">{feature}</span>
                  </li>
                ))}
              </ul>

              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-ivory/50 mt-6 pt-5 border-t border-ivory/15">
                {CONCIERGE_PACKAGE.delivery}
              </p>
            </div>

            <div className="lg:w-[19rem] shrink-0">
              {/*
                WHERE THE PRICE WOULD HAVE BEEN.

                Stated plainly rather than left blank. A missing price reads
                as an oversight or as something being withheld; saying that it
                is set in a written proposal, and that nothing proceeds until
                it is agreed, turns the absence into the offer.
              */}
              <p className="font-serif text-2xl text-ivory leading-snug">
                Priced individually
              </p>
              <p className="text-sm text-ivory/60 leading-relaxed mt-2">
                There is no set price, because no two are the same. Your price
                is agreed with you in writing before anything begins.
              </p>

              <Link
                to="/full-package"
                className="mt-6 inline-flex min-h-11 items-center px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full bg-gold text-ink transition-colors duration-300 hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                {CONCIERGE_PACKAGE.cta}
              </Link>

              {/*
                Said next to the button, not after it. This is the moment a
                customer decides whether clicking commits them to anything.
              */}
              <p className="text-xs text-ivory/45 leading-relaxed mt-3">
                An enquiry, not an order. Nothing is charged.
              </p>
            </div>
          </div>

          {/* ---- The commercial sequence --------------------------------
               Rendered as an ordered list because it IS ordered: the price
               comes after the proposal, and payment comes after agreement.
               That ordering is the commitment being made.
               ------------------------------------------------------------ */}
          <ol className="mt-10 pt-8 border-t border-ivory/15 grid gap-6 sm:grid-cols-2 lg:grid-cols-5 list-none p-0">
            {CONCIERGE_SEQUENCE.map((step, index) => (
              <li key={step.title}>
                <p className="font-mono text-[10px] tracking-[0.16em] text-gold mb-2">
                  {/* Numbered visibly: the order is the point. */}
                  {String(index + 1).padStart(2, '0')}
                </p>
                <p className="text-sm text-ivory mb-1.5 leading-snug">
                  {step.title}
                </p>
                <p className="text-xs text-ivory/55 leading-relaxed">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  </div>
  </>
);
};

export default PackagesSection;