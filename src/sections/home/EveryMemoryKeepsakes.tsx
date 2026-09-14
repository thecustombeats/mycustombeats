import FormatVisual from "../../components/FormatVisual";
import { McbButtonLink } from "../../components/mcb/McbButton";
import { KEEPSAKE, type Variant } from "../../data/catalogue";
import { trackFunnel } from "../../lib/analytics";

/**
 * "One journey. As many memories as you want."
 *
 * A Keepsake for every day that mattered. The days are inspiration, not
 * categories a customer must use. The drawn discs cycle through the real
 * Keepsake variants so the illustration never shows a format MCB does not
 * make; there is no picture-disc photograph.
 */
const EXAMPLE_DAYS = [
  { day: "Day 1", moment: "Sailaway" },
  { day: "Day 3", moment: "First port" },
  { day: "Day 5", moment: "Formal night" },
  { day: "Day 8", moment: "Sunset at sea" },
];

const variantFor = (index: number): Variant | undefined => KEEPSAKE.variants[index % KEEPSAKE.variants.length];

const EveryMemoryKeepsakes = () => (
  <section aria-labelledby="every-memory-heading" className="bg-ink px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
      <div>
        <p className="label-uppercase !text-[0.8125rem] mb-4 text-gold">{KEEPSAKE.name}</p>
        <h2 id="every-memory-heading" className="!text-ivory">
          One journey. As many memories as you want.
        </h2>
        <p className="mt-6 text-lg leading-relaxed !text-ivory/85">
          A trip is never just one moment. Create a {KEEPSAKE.name} for every day that meant something — each one
          personalised individually, with its own music and its own artwork.
        </p>
        <p className="mt-4 text-lg leading-relaxed !text-ivory/85">
          There is no MCB maximum. Choose one day, or every day. It works just as beautifully for a honeymoon, a family
          holiday or a year of milestones.
        </p>
        <div className="mt-9">
          <McbButtonLink
            to={KEEPSAKE.route ?? "/keepsake"}
            tone="gold"
            onClick={() => trackFunnel("package_select", { product_id: KEEPSAKE.id, location: "homepage" })}
          >
            Explore {KEEPSAKE.name}
          </McbButtonLink>
        </div>
      </div>

      <div>
        <ol className="grid list-none grid-cols-2 gap-4 p-0 sm:gap-5">
          {EXAMPLE_DAYS.map((example, index) => {
            const variant = variantFor(index);
            return (
              <li key={example.day} className="rounded-2xl border border-ivory/15 bg-ivory/[0.04] p-4 text-center sm:p-6">
                {variant && (
                  <div aria-hidden="true" className="mx-auto aspect-square w-full max-w-[9rem] rounded-full bg-ivory p-2">
                    <FormatVisual product={KEEPSAKE} variant={variant} className="h-full w-full" />
                  </div>
                )}
                <p className="mt-4 font-mono text-sm uppercase tracking-[0.14em] !text-gold">{example.day}</p>
                <p className="mt-1 font-serif text-2xl font-semibold leading-tight !text-ivory">{example.moment}</p>
              </li>
            );
          })}
        </ol>
        <p className="mt-5 text-center text-base !text-ivory/70">
          Examples only — choose the days that mean the most to you.
        </p>
      </div>
    </div>
  </section>
);

export default EveryMemoryKeepsakes;
