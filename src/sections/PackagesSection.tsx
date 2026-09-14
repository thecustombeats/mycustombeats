import { useEffect, useRef, useState } from 'react';
import { Check, Music } from 'lucide-react';
import { revealOnScroll } from '../lib/scrollReveal';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  BESPOKE,
  formatMoney,
  hasPublicPrice,
  lowestPrice,
  songExperiences,
} from '../data/catalogue';
import { BESPOKE_MAY_INCLUDE, CONCIERGE_SEQUENCE } from '../lib/concierge';
import Price from '../components/Price';
import MemoryConcierge from '../components/MemoryConcierge';
import { scrollToSection } from '../utils/scrollToSection';

/**
 * The comparison grid holds the song experiences that carry a published
 * price — Moment, Keepsake and Journey today — read from the canonical
 * catalogue. Selected by commercial model (`hasPublicPrice`) rather than by
 * id, so a quoted experience lands in the band below without an edit here.
 */
const CORE_PRODUCTS = songExperiences().filter(hasPublicPrice);

interface PackagesSectionProps {
  selectedPackage: string | null;
  setSelectedPackage: (pkg: string) => void;
}

const songsLabel = (count: number | null) =>
  count === null ? null : count === 1 ? '1 song' : `${count} songs`;

const PackagesSection = ({ selectedPackage, setSelectedPackage }: PackagesSectionProps) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<string[]>([]);
  const navigate = useNavigate();
  const location = useLocation();

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
   * Selecting an experience takes the customer to the order form with it
   * chosen. The choice is also written to the URL as `?product=&sku=` — the
   * same contract the product pages use — so the order form has one way to
   * read a preselection. The order form is lazy-loaded, so the scroll waits
   * for the section to exist.
   */
  const handleSelect = (productId: string, sku?: string) => {
    setSelectedPackage(productId);
    const params = new URLSearchParams(location.search);
    params.set('product', productId);
    if (sku) params.set('sku', sku);
    else params.delete('sku');
    navigate({ pathname: location.pathname, search: `?${params.toString()}`, hash: '#order' }, { replace: true });
    scrollToSection('order');
  };

  return (
    <>
    {/* Product + Offer data is emitted once, by the homepage graph in
        App.tsx. See lib/seo.ts. */}
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
        

<MemoryConcierge onChoose={handleSelect} />
<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 xl:gap-10 items-stretch">
    {CORE_PRODUCTS.map((product) => {
    const isExpanded = expandedPackages.includes(product.id);
    const isVariantFamily = product.commercialModel === 'VARIANT_FIXED';
    // A single-variant product lists what it includes; a family lists its
    // variants, so every published price is visible on the card.
    const features = isVariantFamily ? [] : product.variants[0]?.features ?? [];
    const visibleFeatures = features.slice(0, 4);
    const hiddenFeatures = features.slice(4);
    const isSelected = selectedPackage === product.id;
    const low = lowestPrice(product);

    return (
      <div className="flex" key={product.id}>
        <div
          onClick={() => handleSelect(product.id)}
          className={`package-card relative group cursor-pointer bg-white rounded-2xl border p-8 flex flex-col w-full transition-all duration-300
          border-espresso/10 hover:border-gold/40
          ${isSelected ? 'border-gold ring-1 ring-gold/40' : ''}`}
        >
          {/* TITLE */}
          <h3 className="font-serif text-2xl text-espresso mb-1 text-center">
            {product.name}
          </h3>

          {/* Fixed height so the approved positioning lines cannot push their
              price out of alignment with the other cards. */}
          <p className="text-[11px] tracking-[0.16em] uppercase text-espresso/45 text-center mb-5 min-h-[4.5em] flex items-center justify-center leading-[1.5]">
            {product.positioning}
          </p>

          {/* PRICE — the lowest published variant price, from the catalogue.
              <Price> owns the display-currency estimate and always derives
              it from GBP. */}
          {low && (
            <div className="mb-5 text-center">
              <div className="flex flex-col items-center">
                <Price
                  gbp={low.minor / 100}
                  prefix={isVariantFamily ? 'From' : undefined}
                  size="lg"
                />
              </div>
            </div>
          )}

          <div className="h-px w-10 bg-gold/50 mx-auto mb-5" aria-hidden="true" />

          {/* DESCRIPTION */}
          <p className="text-sm text-espresso/70 mb-5 leading-relaxed">
            {product.shortDescription}
          </p>

          {/* VARIANTS — label, songs and price for each, compactly. */}
          {isVariantFamily && (
            <ul className="mb-5 divide-y divide-espresso/10 border-y border-espresso/10 list-none p-0 m-0">
              {product.variants.map((variant) => (
                <li key={variant.sku}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(product.id, variant.sku);
                    }}
                    className="w-full flex items-baseline justify-between gap-3 py-2.5 text-left hover:text-gold-deep transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm text-espresso leading-snug">{variant.label}</span>
                      {songsLabel(variant.songCount) && (
                        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-espresso/45">
                          {songsLabel(variant.songCount)}
                        </span>
                      )}
                    </span>
                    <span className="text-sm text-espresso shrink-0">{formatMoney(variant.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* FEATURES */}
          {features.length > 0 && (
            <ul className="space-y-2.5 mb-4">
              {visibleFeatures.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <Check size={16} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                  <span className="text-sm text-espresso/80 leading-snug">{feature}</span>
                </li>
              ))}

              {isExpanded &&
                hiddenFeatures.map((feature) => (
                  <li key={feature} className="flex gap-2.5">
                    <Check size={16} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                    <span className="text-sm text-espresso/80 leading-snug">{feature}</span>
                  </li>
                ))}
            </ul>
          )}

          {/* EXPAND */}
          {hiddenFeatures.length > 0 && (
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(product.id);
              }}
              className="text-sm text-gold-deep mb-5 hover:underline self-start"
            >
              {isExpanded ? 'Show less' : 'View full experience'}
            </button>
          )}

          {/* DISCLOSURES — must accompany the product wherever it is sold. */}
          {product.disclosures.map((disclosure) => (
            <p key={disclosure} className="text-xs font-medium text-espresso/70 mb-2">
              {disclosure}
            </p>
          ))}

          {/* TIMING, on the card rather than behind the expander. Read from
              the catalogue, the same line the product page shows. */}
          {product.turnaround && (
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-espresso/45 mt-auto pt-5 border-t border-espresso/10">
              {product.turnaround.label}
            </p>
          )}

          {/* CTA */}
          <div className="flex flex-col items-center gap-3 pt-5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(product.id);
              }}
              className="px-6 py-2.5 text-[11px] tracking-[0.2em] uppercase rounded-full transition-all duration-300 text-espresso border border-espresso/25 hover:bg-ink hover:text-ivory hover:border-ink"
            >
              {product.cta}
            </button>
            {product.route && (
              <Link
                to={product.route}
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-gold-deep underline underline-offset-4 hover:text-espresso"
              >
                {`About ${product.name}`}
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  })}
      </div>

      {/* ---- BESPOKE -----------------------------------------------------
           Its own band, and deliberately not a column. The cards above
           compare on price and song count; Bespoke has neither — it is
           individually quoted — and putting it in the grid would invite a
           comparison on axes it does not have.

           So the band carries no price. What sits where the price would sit
           is the commercial sequence: what happens, in what order, and where
           payment falls in it.
           ---------------------------------------------------------------- */}
      <div className="package-card mt-8 xl:mt-10 rounded-2xl bg-ink text-ivory p-8 md:p-12">
        <div className="grid lg:grid-cols-[1fr_auto] gap-8 lg:gap-14 items-start">
          <div className="min-w-0">
            <p className="text-[11px] tracking-[0.2em] uppercase text-gold mb-3">
              {BESPOKE.positioning}
            </p>
            <h3 className="font-serif text-3xl md:text-4xl text-ivory mb-3">
              {BESPOKE.name}
            </h3>
            {/* The approved copy, rendered from the catalogue rather than
                retyped here. */}
            <p className="text-ivory/70 max-w-xl leading-relaxed mb-6">
              {BESPOKE.shortDescription}
            </p>

            <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-2 max-w-2xl list-none p-0 m-0">
              {BESPOKE_MAY_INCLUDE.map((feature) => (
                <li key={feature} className="flex gap-2.5">
                  <Check size={15} className="text-gold mt-1 shrink-0" aria-hidden="true" />
                  <span className="text-sm text-ivory/75 leading-snug">{feature}</span>
                </li>
              ))}
            </ul>

            {BESPOKE.turnaround && (
              <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-ivory/50 mt-6 pt-5 border-t border-ivory/15">
                {BESPOKE.turnaround.label}
              </p>
            )}
          </div>

          <div className="lg:w-[19rem] shrink-0">
            <p className="font-serif text-2xl text-ivory leading-snug">
              {BESPOKE.disclosures.join(' · ')}
            </p>
            <p className="text-sm text-ivory/60 leading-relaxed mt-2">
              There is no set price, because no two are the same. Your price
              is agreed with you in writing before anything begins.
            </p>

            <Link
              to="/bespoke"
              className="mt-6 inline-flex min-h-11 items-center px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full bg-gold text-ink transition-colors duration-300 hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
            >
              {BESPOKE.cta}
            </Link>

            <p className="text-xs text-ivory/45 leading-relaxed mt-3">
              An enquiry, not an order. Nothing is charged.
            </p>
          </div>
        </div>

        {/* ---- The commercial sequence -------------------------------- */}
        <ol className="mt-10 pt-8 border-t border-ivory/15 grid gap-6 sm:grid-cols-2 lg:grid-cols-5 list-none p-0">
          {CONCIERGE_SEQUENCE.map((step, index) => (
            <li key={step.title}>
              <p className="font-mono text-[10px] tracking-[0.16em] text-gold mb-2">
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
    </div>
  </div>
  </>
);
};

export default PackagesSection;
