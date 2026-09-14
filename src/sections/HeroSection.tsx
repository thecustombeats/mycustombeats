import { Link } from "react-router-dom";
import ResponsiveImage from "../components/ResponsiveImage";
import { McbButtonLink } from "../components/mcb/McbButton";
import { IMAGES } from "../data/imagery";

/**
 * Homepage hero.
 *
 * One idea, one primary action. A responsive photograph composition replaces
 * the old background video (7.9 MB with a 5 MB poster), so a phone downloads a
 * few tens of kilobytes rather than megabytes, and nothing moves.
 *
 * Imagery: three generations together (family, milestones — not only
 * couples, not only cruises) with a couple at sunset at sea as the smaller
 * companion, which quietly signals the cruise specialism.
 */
const OCCASIONS = ["Anniversaries", "Weddings", "Birthdays", "Families", "Milestones", "Journeys"];

const HeroSection = () => (
  <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-ivory pt-20">
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1fr_1fr] lg:gap-16 lg:px-12 lg:pb-24 lg:pt-16">
      <div className="max-w-2xl">
        <p className="label-uppercase mb-5 !text-[0.8125rem] text-gold-deep">MCB™ — My Custom Beats</p>

        <h1
          id="hero-heading"
          className="text-ink"
          style={{ fontSize: "clamp(2.5rem, 5.4vw, 4.4rem)", lineHeight: 1.04 }}
        >
          Your most important moments, turned into music you can keep.
        </h1>

        <p className="mt-6 max-w-xl text-lg leading-relaxed text-espresso/80 sm:text-xl">
          Tell us the story — a wedding, an anniversary, a birthday, a family celebration or a journey at sea — and
          we&rsquo;ll turn it into a personalised song you can hear, give and relive.
        </p>

        <div className="mt-9 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
          <McbButtonLink to="/create" className="min-h-14 px-9 text-lg">
            Create Your Memory
          </McbButtonLink>
          <Link
            to={{ hash: "#help-me-choose" }}
            className="inline-flex min-h-14 items-center justify-center rounded-full px-6 text-lg font-semibold text-ink underline decoration-gold decoration-2 underline-offset-[6px] transition-colors hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-ivory"
          >
            Help me choose
          </Link>
        </div>

        <p className="mt-10 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink/10 pt-6 text-base text-espresso/80">
          <span className="sr-only">Created for </span>
          {OCCASIONS.map((occasion, index) => (
            <span key={occasion} className="inline-flex items-center gap-3">
              {index > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold" />}
              {occasion}
            </span>
          ))}
        </p>
      </div>

      {/* Composition: reserved aspect ratios, so nothing shifts as it loads. */}
      <div className="relative mx-auto w-full max-w-xl pb-10 lg:max-w-none lg:pb-14">
        <div className="aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-ink/5 shadow-[0_30px_80px_rgba(13,27,42,0.14)]">
          <ResponsiveImage
            image={IMAGES.familyTerrace}
            alt="Three generations of a family laughing together on a terrace above the sea"
            sizes="(min-width: 1024px) 46vw, 92vw"
            priority
            className="h-full w-full object-cover"
          />
        </div>
        <div className="absolute bottom-0 left-4 w-[36%] max-w-[15rem] overflow-hidden rounded-2xl border-[5px] border-ivory bg-ink/5 shadow-[0_20px_50px_rgba(13,27,42,0.2)] sm:left-8">
          <div className="aspect-[3/4]">
            <ResponsiveImage
              image={IMAGES.cruiseCouple}
              sizes="(min-width: 1024px) 15rem, 36vw"
              priority
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default HeroSection;
