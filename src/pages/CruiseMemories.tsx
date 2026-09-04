import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Ship, PenLine, Music, Package as PackageIcon } from "lucide-react";
import { MOMENT, JOURNEY, KEEPSAKE, formatPrice } from "../data/packages";
import { stockedFamilies } from "../data/catalogue";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import CruiseMarquee from "../components/CruiseMarquee";
import { canonical, cruisePageStructuredData } from "../lib/seo";

/**
 * The cruise guest funnel.
 *
 * A guest journey, not a partnership pitch — the enterprise proposition is a
 * separate audience with a separate page.
 *
 * EVERYTHING HERE IS ALREADY TRUE. Prices, song counts and delivery promises
 * are read from `data/packages`; the keepsakes come from the catalogue; the
 * two songs named below are real recordings the homepage plays. No cruise
 * line is named as a partner, nothing is claimed about buying on board, and
 * no operational promise is made that MCB has not already made elsewhere on
 * the site.
 */

/** The two samples that are actually about a voyage. Named, not invented. */
const VOYAGE_SAMPLE_IDS = ["2", "7"];

const journeySteps = [
  {
    icon: Ship,
    title: "While you're travelling",
    body: "Collect the moments as they happen — the port you did not expect, the dinner that ran late, the morning nobody else was awake for.",
  },
  {
    icon: PenLine,
    title: "Tell us the story",
    body: "Share it in your own words. No lyrics required, and nothing to write in verse — the producers shape what you send into a song.",
  },
  {
    icon: Music,
    title: "We compose and produce",
    body: `Written, recorded and produced by professional musicians. ${MOMENT.name} comes back ${MOMENT.delivery.toLowerCase()}; the larger experiences are ${JOURNEY.delivery.toLowerCase()}.`,
  },
  {
    icon: PackageIcon,
    title: "Receive your memory",
    body: "Delivered digitally, or pressed to vinyl or CD and posted to you. Where you choose something physical, we ask for a delivery address at checkout.",
  },
];

const CruiseMemories = () => {
  const voyageSamples = SAMPLE_SONGS.filter((s) =>
    VOYAGE_SAMPLE_IDS.includes(s.id)
  );
  const keepsakes = stockedFamilies();

  return (
    <>
      <Helmet>
        <title>Cruise & Voyage Songs — Turn Your Trip Into Music | My Custom Beats</title>
        <meta
          name="description"
          content="Turn a cruise or voyage into a personalised song written from your own story. Delivered digitally or pressed to vinyl or CD."
        />
        <meta property="og:url" content={canonical("/cruise")} />
        <script type="application/ld+json">
          {JSON.stringify(cruisePageStructuredData())}
        </script>
      </Helmet>

      <div className="bg-ivory text-espresso">
        {/* HERO */}
        <section className="relative min-h-[70vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0">
            <img
              src="/images/hero-cruise.jpg"
              alt="A voyage at sea"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/60 to-ink/40" />
          </div>

          <div className="relative z-10 text-center px-6 py-24 max-w-3xl mx-auto">
            <p className="label-uppercase text-gold mb-6 tracking-[0.2em]">
              Cruise &amp; voyage memories
            </p>
            <h1
              className="font-serif text-ivory mb-6 leading-[1.05]"
              style={{ fontSize: "clamp(2.2rem, 5.5vw, 3.8rem)" }}
            >
              The voyage ends. The song doesn&rsquo;t.
            </h1>
            <p className="text-lg text-ivory/85 leading-relaxed max-w-xl mx-auto mb-10">
              A personalised song written from your own trip — the places, the
              people and the moments you want to keep.
            </p>
            <a
              href="/#order"
              className="inline-flex items-center gap-3 px-8 py-4 bg-gold text-ink rounded-full
                         text-[11px] tracking-[0.2em] uppercase font-medium
                         transition-all duration-300 hover:bg-gold-light"
            >
              Create your voyage song
            </a>
          </div>
        </section>

        {/* THE GUEST JOURNEY */}
        <section className="py-20 md:py-24 px-[7vw]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <p className="label-uppercase text-gold-deep mb-4">How it works at sea</p>
              <h2 className="text-espresso mb-4 leading-tight">
                From the deck to something you can play
              </h2>
            </div>

            <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 list-none p-0 m-0">
              {journeySteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title}>
                    <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center mb-5">
                      <Icon size={20} className="text-gold-deep" aria-hidden="true" />
                    </div>
                    <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-gold-deep mb-2">
                      Step {index + 1}
                    </p>
                    <h3 className="font-serif text-xl text-espresso mb-2">{step.title}</h3>
                    <p className="text-sm text-espresso/65 leading-relaxed">{step.body}</p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* WHICH EXPERIENCE — real packages, real prices */}
        <section className="py-20 md:py-24 px-[7vw] bg-white">
          <div className="max-w-5xl mx-auto">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <p className="label-uppercase text-gold-deep mb-4">Choosing one</p>
              <h2 className="text-espresso mb-4 leading-tight">
                Which experience suits a voyage
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
              {[JOURNEY, KEEPSAKE, MOMENT].map((pkg) => (
                <div
                  key={pkg.id}
                  className="rounded-2xl border border-espresso/10 bg-ivory p-7 flex flex-col"
                >
                  <h3 className="font-serif text-2xl text-espresso mb-1">{pkg.name}</h3>
                  <p className="text-[11px] tracking-[0.14em] uppercase text-espresso/45 mb-4 leading-[1.5] min-h-[3.4em]">
                    {pkg.positioning}
                  </p>
                  <div className="flex items-baseline gap-2 mb-4">
                    <span className="font-serif text-3xl text-espresso">
                      {formatPrice(pkg)}
                    </span>
                    <span className="font-mono text-xs text-espresso/45">
                      {formatPrice(pkg, "usd")}
                    </span>
                  </div>
                  <p className="text-sm text-espresso/65 leading-relaxed mb-5 flex-1">
                    {pkg.description}
                  </p>
                  <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-espresso/45 pt-4 border-t border-espresso/10">
                    {pkg.delivery}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-center text-sm text-espresso/55 mt-10">
              <a href="/#packages" className="text-gold-deep hover:underline">
                Compare all five experiences
              </a>
            </p>
          </div>
        </section>

        {/* REAL SAMPLES */}
        <section className="py-20 md:py-24 px-[7vw]">
          <div className="max-w-3xl mx-auto text-center">
            <p className="label-uppercase text-gold-deep mb-4">Hear one</p>
            <h2 className="text-espresso mb-6 leading-tight">
              Songs written from real journeys
            </h2>
            <ul className="list-none p-0 m-0 space-y-4 mb-10 text-left">
              {voyageSamples.map((song) => (
                <li
                  key={song.id}
                  className="rounded-2xl border border-espresso/10 bg-white p-6"
                >
                  <p className="font-mono text-[10px] tracking-[0.14em] uppercase text-gold-deep mb-2">
                    {song.tag}
                  </p>
                  <h3 className="font-serif text-xl text-espresso mb-2">{song.title}</h3>
                  <p className="text-sm text-espresso/65 leading-relaxed">{song.story}</p>
                </li>
              ))}
            </ul>
            <a href="/#samples" className="text-gold-deep hover:underline text-sm">
              Listen to these and six more
            </a>
          </div>
        </section>

        {/* KEEPSAKES — catalogue truth, no prices */}
        <section className="py-20 md:py-24 px-[7vw] bg-white">
          <div className="max-w-5xl mx-auto text-center">
            <p className="label-uppercase text-gold-deep mb-4">Take it home</p>
            <h2 className="text-espresso mb-4 leading-tight">
              Something to keep the voyage in
            </h2>
            <p className="text-espresso/65 leading-relaxed max-w-xl mx-auto mb-10">
              Your song can stay digital, or become something you can hold.
            </p>
            <ul className="flex flex-wrap justify-center gap-3 list-none p-0 m-0 mb-10">
              {keepsakes.map((family) => (
                <li
                  key={family.id}
                  className="px-4 py-2 rounded-full border border-espresso/15 text-sm text-espresso/75"
                >
                  {family.name}
                </li>
              ))}
            </ul>
            <Link to="/products" className="text-gold-deep hover:underline text-sm">
              See the keepsakes
            </Link>
          </div>
        </section>

        {/* Approved marquee — "Used by guests on board". Not a partnership claim. */}
        <CruiseMarquee />

        {/* CTA */}
        <section className="text-center py-24 px-6 border-t border-espresso/10">
          <h2 className="text-espresso mb-5 leading-tight">Create your voyage song</h2>
          <p className="text-espresso/60 max-w-xl mx-auto mb-10">
            Tell us where you went and who you were with. We&rsquo;ll do the rest.
          </p>
          <a
            href="/#order"
            className="inline-flex items-center gap-3 px-8 py-4 bg-ink text-ivory rounded-full
                       text-[11px] tracking-[0.2em] uppercase transition-all duration-300 hover:bg-gold hover:text-ink"
          >
            Begin your memory
          </a>
        </section>
      </div>
    </>
  );
};

export default CruiseMemories;
