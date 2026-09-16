import { CRUISE_BRANDS } from "../../data/cruiseBrands";
import { publishedTestimonials } from "../../data/testimonials";

/**
 * TRUST, AT THE BOTTOM OF THE PAGE.
 *
 * Two things, in the order the founders asked for: the customers' own words,
 * then the ships their guests sailed on. Then the founder note and the call to
 * action, which follow this section.
 *
 * TESTIMONIALS render only when one has its public-use permission recorded
 * (see data/testimonials.ts). None has, so today this half is simply absent.
 * Nothing is invented to fill it, and no review count, rating or customer
 * number is implied.
 *
 * "USED BY GUESTS ON BOARD" is the approved heading, and the distinction it
 * draws is the whole point. It says GUESTS aboard those lines' ships have used
 * MCB. It does NOT say the lines endorse, partner with, sponsor or recommend
 * MCB, or that they are MCB's customers — and a disclaimer says so in words,
 * visibly, rather than only in a source comment as before.
 *
 * NAMES ARE SET AS TYPE, NEVER AS LOGOS. Every one is a registered trademark;
 * MCB has no licensed artwork and will not redraw, generate or scrape any.
 * `cruiseBrands.ts` carries the `logo` field for the day licensed files exist.
 *
 * Motion: a slow, linear, continuous pass. Hover and keyboard focus pause it,
 * and `prefers-reduced-motion` stops it entirely and lets the names wrap as a
 * static list (index.css). Nothing here is ever the only way to read a name.
 */
const TrustEvidence = () => {
  const testimonials = publishedTestimonials();

  return (
    <section aria-labelledby="trust-heading" className="bg-ink px-5 py-20 sm:px-8 md:py-24">
      <div className="mx-auto max-w-[1400px]">
        <h2 id="trust-heading" className="sr-only">
          What people say, and where MCB has travelled
        </h2>

        {testimonials.length > 0 && (
          <ul className="m-0 grid list-none grid-cols-1 gap-6 p-0 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <li key={testimonial.quote} className="rounded-2xl border border-ivory/15 p-6">
                <blockquote className="m-0">
                  <p className="font-serif text-xl leading-snug !text-ivory">&ldquo;{testimonial.quote}&rdquo;</p>
                  <footer className="mt-4 text-base !text-ivory/70">
                    {testimonial.attribution}
                    {testimonial.context ? ` · ${testimonial.context}` : ""}
                  </footer>
                </blockquote>
              </li>
            ))}
          </ul>
        )}

        {/* ---- Used by guests on board ---------------------------------- */}
        <div className={`mcb-marquee ${testimonials.length > 0 ? "mt-16 border-t border-ivory/10 pt-12" : ""}`}>
          <h3 className="label-uppercase block w-full text-center !text-ivory/80">Used by guests on board</h3>

          <div className="mcb-marquee-mask mt-8 overflow-hidden">
            <div className="mcb-marquee-track">
              {/* Two passes of the same list, so the loop lands on an identical
                  frame. The second is hidden from assistive technology, which
                  therefore hears each line exactly once. */}
              {[
                { key: "lead", hidden: false },
                { key: "loop", hidden: true },
              ].map((pass) => (
                <ul
                  key={pass.key}
                  aria-hidden={pass.hidden || undefined}
                  className="m-0 flex shrink-0 list-none items-center gap-x-14 p-0 pr-14 sm:gap-x-20 sm:pr-20"
                >
                  {CRUISE_BRANDS.map((brand) => (
                    <li key={`${pass.key}-${brand.name}`} className="shrink-0">
                      <span className="block whitespace-nowrap font-serif text-lg !text-ivory/75 sm:text-xl">{brand.name}</span>
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>

          <p className="mx-auto mt-8 max-w-2xl text-center text-sm leading-relaxed !text-ivory/75">
            Guests sailing with these lines have had MCB create their memories. MCB is an independent service and is not
            affiliated with, endorsed by or a partner of the cruise lines shown.
          </p>
        </div>
      </div>
    </section>
  );
};

export default TrustEvidence;
