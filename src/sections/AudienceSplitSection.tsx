import { Link } from "react-router-dom";
import { Music, Ship, ArrowRight } from "lucide-react";

/**
 * WHO ARE YOU? — the two commercial paths, stated once, high on the page.
 *
 * MCB sells to two audiences that want completely different things: a person
 * making one memory, and a cruise line or hotel buying a guest experience.
 * Before this section the homepage addressed only the first, and the
 * enterprise path appeared once, far below the order form — so a commercial
 * buyer had to scroll past an entire consumer funnel to find anything aimed
 * at them.
 *
 * Each path leads somewhere that already exists: the consumer to the
 * packages they can buy today, the enterprise buyer to the partnerships page.
 * Neither proposition is built out here — those are their own sprints.
 */
const AudienceSplitSection = () => (
  <section
    id="who-are-you"
    aria-labelledby="who-are-you-heading"
    className="relative w-full bg-ivory py-20 md:py-24"
  >
    <div className="px-[7vw] max-w-[1400px] mx-auto">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <p className="label-uppercase text-gold-deep mb-4">Who are you?</p>
        <h2 id="who-are-you-heading" className="text-espresso mb-4 leading-tight">
          Two ways to turn a memory into music
        </h2>
        <p className="text-espresso/65 leading-relaxed">
          Tell us which one you are and we&rsquo;ll take you straight there.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6 lg:gap-8 items-stretch">
        {/* ---- Consumer ---- */}
        <a
          href="#packages"
          className="group flex flex-col rounded-2xl bg-white border border-espresso/10 p-8 lg:p-10
                     transition-all duration-300 hover:border-gold/50 hover:shadow-[0_20px_50px_rgba(13,27,42,0.08)]
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center mb-6">
            <Music size={22} className="text-gold-deep" aria-hidden="true" />
          </div>

          <h3 className="font-serif text-2xl lg:text-3xl text-espresso mb-3">
            I&rsquo;m creating a memory
          </h3>

          <p className="text-espresso/65 leading-relaxed mb-8 flex-1">
            A personalised song written from your own story — for an
            anniversary, a proposal, a birthday or a journey — and, if you
            want it, something physical to keep it in.
          </p>

          <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-espresso group-hover:text-gold-deep transition-colors duration-300">
            See the experiences
            <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </a>

        {/* ---- Enterprise ---- */}
        <Link
          to="/partners"
          className="group flex flex-col rounded-2xl bg-ink border border-ink p-8 lg:p-10
                     transition-all duration-300 hover:shadow-[0_20px_50px_rgba(13,27,42,0.25)]
                     focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
        >
          <div className="w-12 h-12 rounded-xl bg-gold/15 flex items-center justify-center mb-6">
            <Ship size={22} className="text-gold" aria-hidden="true" />
          </div>

          <h3 className="font-serif text-2xl lg:text-3xl text-ivory mb-3">
            I&rsquo;m a cruise line or hospitality company
          </h3>

          <p className="text-ivory/70 leading-relaxed mb-8 flex-1">
            Personalised music as a guest experience — for cruise lines,
            hotels, resorts and event partners who want to give guests
            something they cannot buy anywhere else.
          </p>

          <span className="inline-flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-gold transition-colors duration-300">
            Explore partnerships
            <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </div>
  </section>
);

export default AudienceSplitSection;
