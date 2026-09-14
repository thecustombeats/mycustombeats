import ResponsiveImage from "../../components/ResponsiveImage";
import { McbButtonLink } from "../../components/mcb/McbButton";
import { KEEPSAKE } from "../../data/catalogue";
import { IMAGES } from "../../data/imagery";
import { trackFunnel } from "../../lib/analytics";

/**
 * "One journey. As many memories as you want."
 *
 * A Keepsake for every day that mattered. The days are inspiration, not
 * categories a customer must use. The founder-approved picture-disc wall shows
 * several separate Keepsakes together; it is aspirational — an order is for
 * the Keepsakes the customer chooses, and wall mounting is not included.
 */
const EXAMPLE_DAYS = [
  { day: "Day 1", moment: "Sailaway" },
  { day: "Day 3", moment: "First port" },
  { day: "Day 5", moment: "Formal night" },
  { day: "Day 8", moment: "Sunset at sea" },
];

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

      <figure className="m-0">
        <div className="overflow-hidden rounded-[1.5rem] border border-ivory/15 bg-ivory/[0.04]">
          <ResponsiveImage
            image={IMAGES.pictureDiscWall}
            sizes="(min-width: 1024px) 52vw, 92vw"
            className="aspect-[4/3] h-full w-full object-cover"
          />
        </div>
        <figcaption>
          <ol aria-label="Example days" className="mt-5 flex list-none flex-wrap justify-center gap-2 p-0">
            {EXAMPLE_DAYS.map((example) => (
              <li key={example.day} className="rounded-full border border-ivory/20 px-4 py-2 text-base !text-ivory">
                <span className="font-mono text-sm uppercase tracking-[0.12em] !text-gold">{example.day}</span>{" "}
                <span className="font-serif text-lg">{example.moment}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-center text-base !text-ivory/70">
            Examples only — choose the days that mean the most to you. Display shown for inspiration; wall mounting isn't included.
          </p>
        </figcaption>
      </figure>
    </div>
  </section>
);

export default EveryMemoryKeepsakes;
