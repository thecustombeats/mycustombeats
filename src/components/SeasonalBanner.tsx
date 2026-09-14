import { Link } from "react-router-dom";
import { activeSeasonalEditions, editionProduct } from "../data/seasonal";
import { hasPublicPrice, lowestPrice } from "../data/catalogue";
import Price from "./Price";

/**
 * Seasonal editions, presented only when the business has switched one on.
 *
 * Sprint 01 built the data — an edition stores a catalogue product id and
 * inherits its price, so "Christmas Moment" cannot drift from Moment's
 * catalogue price.
 * This is the other half: the thing that renders one. Launching a campaign is
 * now `active: true` on the edition and nothing else.
 *
 * It renders NOTHING today, and that is correct. Christmas Moment is defined
 * but inactive, and `activeSeasonalEditions` also requires today to fall
 * inside the edition's window — so a campaign left switched on past its dates
 * stops showing on its own rather than offering Christmas gifting in March.
 */
const SeasonalBanner = () => {
  const editions = activeSeasonalEditions();
  if (editions.length === 0) return null;

  return (
    <section
      aria-labelledby="seasonal-heading"
      className="relative w-full bg-ink text-ivory py-14"
    >
      <div className="px-[7vw] max-w-[1400px] mx-auto">
        <h2 id="seasonal-heading" className="sr-only">
          Seasonal experiences
        </h2>

        <ul className="grid gap-6 md:grid-cols-2 list-none p-0 m-0">
          {editions.map((edition) => {
            const product = editionProduct(edition);
            /**
             * A seasonal edition inherits its product's price, so an edition
             * pointing at a quoted commission has no price to inherit. It
             * is skipped rather than rendered without one: this banner's whole
             * shape is a price and a buy button, and a concierge commission
             * belongs on its own page with its own sequence, not in a
             * campaign strip.
             */
            if (!product || !hasPublicPrice(product)) return null;
            const low = lowestPrice(product);
            if (!low) return null;

            return (
              <li
                key={edition.id}
                className="rounded-2xl border border-gold/30 p-7 flex flex-col sm:flex-row sm:items-center gap-6"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold mb-2">
                    {edition.positioning}
                  </p>
                  <h3 className="font-serif text-2xl text-ivory mb-2">
                    {edition.name}
                  </h3>
                  <p className="text-sm text-ivory/70 leading-relaxed">
                    {edition.description}
                  </p>
                  {product.turnaround && (
                    <p className="mt-2 font-mono text-[10px] tracking-[0.14em] uppercase text-ivory/50">
                      {product.turnaround.label}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-left sm:text-right">
                  {/* Inherited from the catalogue. Never restated by the edition. */}
                  <div className="mb-4">
                    <Price
                      gbp={low.minor / 100}
                      prefix={product.commercialModel === "VARIANT_FIXED" ? "From" : undefined}
                      size="lg"
                      tone="light"
                    />
                  </div>
                  <Link
                    to={`/?product=${encodeURIComponent(product.id)}#order`}
                    className="inline-flex px-6 py-3 rounded-full bg-gold text-ink
                               text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 hover:bg-gold-light"
                  >
                    {product.cta}
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};

export default SeasonalBanner;
