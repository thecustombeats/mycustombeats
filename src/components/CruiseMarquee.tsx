import { CRUISE_BRANDS } from "../data/cruiseBrands";

/**
 * "Used by guests on board" — the cruise and luxury-travel band that closes
 * the footer.
 *
 * Motion follows MVIS: slow (a full pass takes 90s), linear, continuous, with
 * no bounce or easing. The track is rendered twice and translated by exactly
 * -50%, so the loop point lands on an identical frame and never jumps.
 * Hover and keyboard focus pause it; `prefers-reduced-motion` stops it
 * entirely and lets the names wrap as a static list (see index.css).
 *
 * Brands render as type until licensed logo artwork is supplied — see
 * data/cruiseBrands.ts. Nothing here claims a partnership or endorsement.
 */
const CruiseMarquee = () => {
  // Two passes of the same list; the second is hidden from assistive tech so
  // screen readers hear each brand once.
  const passes = [
    { key: "lead", hidden: false },
    { key: "loop", hidden: true },
  ];

  return (
    <section
      aria-labelledby="cruise-marquee-heading"
      className="mcb-marquee border-t border-ivory/10 pt-10 pb-2"
    >
      {/* `.label-uppercase` is inline-block, so the heading needs to fill the
          row for `text-center` to centre the label itself. */}
      <h2
        id="cruise-marquee-heading"
        className="label-uppercase block w-full text-ivory/40 text-center mb-8 font-sans"
      >
        Used by guests on board
      </h2>

      <div className="mcb-marquee-mask overflow-hidden">
        <div className="mcb-marquee-track">
          {passes.map((pass) => (
            <ul
              key={pass.key}
              aria-hidden={pass.hidden || undefined}
              className="flex shrink-0 items-center gap-x-14 sm:gap-x-20 pr-14 sm:pr-20 m-0 list-none"
            >
              {CRUISE_BRANDS.map((brand) => (
                <li key={`${pass.key}-${brand.name}`} className="shrink-0">
                  {brand.logo ? (
                    <img
                      src={brand.logo}
                      alt={brand.name}
                      loading="lazy"
                      decoding="async"
                      className="h-7 w-auto object-contain opacity-50"
                    />
                  ) : (
                    <span className="block whitespace-nowrap font-serif text-lg sm:text-xl text-ivory/45">
                      {brand.name}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  );
};

export default CruiseMarquee;
