import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, Music, Package as PackageIcon, PenLine, Ship } from "lucide-react";
import {
  BESPOKE,
  JOURNEY,
  KEEPSAKE,
  MOMENT,
  hasPublicPrice,
  lowestPrice,
} from "../data/catalogue";
import { IMAGES, PACKAGE_IMAGERY } from "../data/imagery";
import Price from "../components/Price";
import ResponsiveImage from "../components/ResponsiveImage";
import SectionHeading from "../components/mcb/SectionHeading";
import { McbButtonLink } from "../components/mcb/McbButton";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { DELIVERY_NOTE } from "../lib/productDetail";
import { CRUISE_DESCRIPTION, cruisePageStructuredData } from "../lib/seo";

/**
 * The cruise guest page.
 *
 * A guest journey, not a partnership pitch. EVERYTHING HERE IS ALREADY TRUE:
 * prices, song counts and timing are read from the canonical catalogue, and
 * the two songs named below are real recordings the homepage plays. No cruise
 * line is named as a partner, nothing is claimed about buying on board, and no
 * operational promise is made that MCB has not already made elsewhere.
 */

/** The two samples that are actually about a voyage. Named, not invented. */
const VOYAGE_SAMPLE_IDS = ["2", "7"];

/** Inspiration only — never required categories. */
const DAY_EXAMPLES = ["Day 1 — Sailaway", "Day 3 — First Port", "Sea day — Nowhere to be"];

const journeySteps = [
  {
    icon: Ship,
    title: "While you’re travelling",
    body: "Collect the moments as they happen — the port you did not expect, the dinner that ran late, the morning nobody else was awake for.",
  },
  {
    icon: PenLine,
    title: "Tell us the story",
    body: "Share it in your own words. No lyrics required, and nothing to write in verse.",
  },
  {
    icon: Music,
    title: "We create the music",
    body: `${MOMENT.name}: ${(MOMENT.turnaround?.label ?? "").toLowerCase()}. ${KEEPSAKE.name} and ${JOURNEY.name}: ${(JOURNEY.turnaround?.label ?? "").toLowerCase()}.`,
  },
  {
    icon: PackageIcon,
    title: "Keep it",
    body: `${MOMENT.name} arrives digitally. ${KEEPSAKE.name} is a personalised picture disc and ${JOURNEY.name} is classic black vinyl, posted to you. ${DELIVERY_NOTE}`,
  },
];

const PriceFrom = ({ product }: { product: typeof KEEPSAKE }) => {
  const low = hasPublicPrice(product) ? lowestPrice(product) : null;
  return low ? (
    <Price gbp={low.minor / 100} prefix={product.commercialModel === "VARIANT_FIXED" ? "From" : undefined} size="md" />
  ) : null;
};

const linkClass =
  "inline-flex min-h-12 items-center gap-2 text-base font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

const CruiseMemories = () => {
  const voyageSamples = SAMPLE_SONGS.filter((s) => VOYAGE_SAMPLE_IDS.includes(s.id));

  return (
    <>
      <Helmet>
        <title>Cruise & Voyage Songs — Turn Your Trip Into Music | My Custom Beats</title>
        <meta name="description" content={CRUISE_DESCRIPTION} />
        <script type="application/ld+json">{JSON.stringify(cruisePageStructuredData())}</script>
      </Helmet>

      <div className="bg-ivory text-espresso">
        {/* ---- Hero --------------------------------------------------------- */}
        <section className="relative flex min-h-[78vh] items-end overflow-hidden bg-ink">
          <ResponsiveImage image={IMAGES.soloDeck} sizes="100vw" priority alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
          <div className="relative z-10 mx-auto w-full max-w-5xl px-5 pb-16 pt-32 sm:px-8 md:pb-24">
            <p className="label-uppercase text-gold">Cruise &amp; voyage memories</p>
            <h1 className="mt-5 max-w-3xl font-serif text-5xl leading-[1.05] !text-ivory md:text-7xl">The voyage ends. The song doesn’t.</h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ivory/90 md:text-xl">
              A personalised song written from your own trip — the places, the people and the moments you want to keep.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <McbButtonLink to="/create" tone="gold">Create Your Memory</McbButtonLink>
              <a
                href="#two-ways"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-ivory/50 px-7 py-3 text-base font-semibold text-ivory transition-colors hover:border-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                Ways to keep a voyage
              </a>
            </div>
          </div>
        </section>

        {/* ---- How it works at sea ------------------------------------------ */}
        <section className="px-5 py-20 sm:px-8 md:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading eyebrow="How it works at sea" title="From the deck to something you can play" />
            <ol className="m-0 mt-12 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {journeySteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="rounded-2xl border border-ink/10 bg-white p-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink text-gold">
                        <Icon size={20} aria-hidden="true" />
                      </span>
                      <span className="font-mono text-base text-espresso/75">{`Step ${index + 1}`}</span>
                    </div>
                    <h3 className="mt-4 font-serif text-2xl leading-snug text-ink">{step.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-espresso/80">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* ---- Two ways to keep a voyage ------------------------------------ */}
        <section id="two-ways" aria-labelledby="two-ways-title" className="bg-[#F1ECE3] px-5 py-20 sm:px-8 md:py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHeading id="two-ways-title" eyebrow="Choosing" title="Two ways to keep a voyage" />

            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <article className="flex flex-col overflow-hidden rounded-3xl bg-white">
                <ResponsiveImage image={PACKAGE_IMAGERY.keepsake} sizes="(min-width: 1024px) 45vw, 100vw" alt="Personalised MCB record sleeves displayed together, each with its own photograph" className="aspect-[16/10] w-full object-cover" />
                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <p className="label-uppercase text-gold-deep">{`A ${KEEPSAKE.name} for each day`}</p>
                  <h3 className="mt-3 font-serif text-3xl leading-tight text-ink">One journey. As many memories as you want.</h3>
                  <p className="mt-3 text-base leading-relaxed text-espresso/80 md:text-lg">
                    {`Each ${KEEPSAKE.name} is individually personalised — its own songs, its own picture-disc artwork. Choose one for every day that mattered. There is no MCB maximum.`}
                  </p>
                  <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0">
                    {DAY_EXAMPLES.map((example) => (
                      <li key={example} className="rounded-full border border-ink/15 px-4 py-2 text-base text-ink">
                        {example}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-sm text-espresso/75">Ideas only — name each memory however you like.</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-6">
                    <PriceFrom product={KEEPSAKE} />
                    <Link to="/keepsake" className={linkClass}>
                      {`Explore ${KEEPSAKE.name}`}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>

              <article className="flex flex-col overflow-hidden rounded-3xl bg-white">
                <ResponsiveImage image={PACKAGE_IMAGERY.journey} sizes="(min-width: 1024px) 45vw, 100vw" alt="A vinyl album beside its personalised printed sleeve" className="aspect-[16/10] w-full object-cover" />
                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <p className="label-uppercase text-gold-deep">The whole voyage</p>
                  <h3 className="mt-3 font-serif text-3xl leading-tight text-ink">{JOURNEY.positioning}</h3>
                  <p className="mt-3 text-base leading-relaxed text-espresso/80 md:text-lg">
                    {`${JOURNEY.name} tells the trip as an album — every chapter its own song and, if you wish, its own genre. Classic black vinyl with personalised artwork and mastering included.`}
                  </p>
                  <p className="mt-4 border-l-2 border-gold pl-3 text-base font-medium text-ink">{JOURNEY.disclosures.join(" ")}</p>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pt-6">
                    <PriceFrom product={JOURNEY} />
                    <Link to="/journey" className={linkClass}>
                      {`Explore ${JOURNEY.name}`}
                      <ArrowRight size={18} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            </div>

            <p className="mt-10 text-center text-base leading-relaxed text-espresso/80">
              {`Just one moment from the trip? `}
              <Link to="/moment" className="font-semibold text-ink underline underline-offset-4 hover:text-gold-deep">
                {`${MOMENT.name} arrives digitally`}
              </Link>
              {`. Something larger? `}
              <Link to="/bespoke" className="font-semibold text-ink underline underline-offset-4 hover:text-gold-deep">
                {`${BESPOKE.name} is ${BESPOKE.disclosures.join(" ").toLowerCase()}`}
              </Link>
              .
            </p>
          </div>
        </section>

        {/* ---- Real samples ------------------------------------------------- */}
        {voyageSamples.length > 0 && (
          <section className="px-5 py-20 sm:px-8 md:py-24">
            <div className="mx-auto max-w-3xl">
              <SectionHeading eyebrow="Hear one" title="Songs written from journeys" />
              <ul className="m-0 mt-10 list-none space-y-4 p-0">
                {voyageSamples.map((song) => (
                  <li key={song.id} className="rounded-2xl border border-ink/10 bg-white p-6">
                    <p className="text-sm font-semibold text-gold-deep">{song.tag}</p>
                    <h3 className="mt-2 font-serif text-2xl text-ink">{song.title}</h3>
                    <p className="mt-2 text-base leading-relaxed text-espresso/80">{song.story}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-8 text-center">
                <a href="/#samples" className={linkClass}>
                  Listen on the homepage
                  <ArrowRight size={18} aria-hidden="true" />
                </a>
              </p>
            </div>
          </section>
        )}

        {/* ---- Closing ------------------------------------------------------ */}
        <section className="bg-ink px-5 py-20 text-center sm:px-8 md:py-24">
          <div className="mx-auto max-w-2xl">
            <h2 className="font-serif text-4xl leading-tight !text-ivory md:text-5xl">Create your voyage song</h2>
            <p className="mt-4 text-lg leading-relaxed text-ivory/85">Tell us where you went and who you were with. We’ll do the rest.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <McbButtonLink to="/create" tone="gold">Create Your Memory</McbButtonLink>
              <McbButtonLink to="/products" tone="ghostLight">See the collection</McbButtonLink>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default CruiseMemories;
