import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Instagram, MessageCircle } from "lucide-react";
import { trackEvent, trackWhatsAppClick } from "../lib/analytics";
import { aboutPageStructuredData } from "../lib/seo";
import SectionHeading from "../components/mcb/SectionHeading";
import { McbButtonLink } from "../components/mcb/McbButton";
import ResponsiveImage from "../components/ResponsiveImage";
import { IMAGES } from "../data/imagery";

/**
 * ABOUT — who MCB is, told plainly.
 *
 * No figures, no scale, no endorsements. The founder note reuses the approved
 * homepage founder-note wording. The one photograph is the founder-approved
 * portrait of Rinaldi with an MCB vinyl (Sprint 3.2); the homepage founder note
 * stays typographic.
 */

/** From the approved founder note (src/sections/home/FounderNote.tsx). Keep verbatim. */
const FOUNDER_NOTE = [
  "For years, we’ve watched people make extraordinary memories — celebrations, journeys, friendships, families and moments at sea that seem to pass far too quickly.",
  "MCB was created because we wanted those moments to have somewhere to live after the day itself was over.",
  "Thank you for allowing us to help turn your memories into something you can keep, hear and relive.",
];

const FOUNDERS: readonly { name: string; role: string; initials: string; about: string }[] = [
  {
    name: "Rinaldi",
    role: "Founder & Executive Producer",
    initials: "R",
    about: "Leads the musical direction of My Custom Beats and the production of every song, from the first idea to the final mix.",
  },
  {
    name: "Shobha (Bella) Menezes",
    role: "Creative Director & Co-Founder",
    initials: "SM",
    about: "Leads the artistic direction and looks after each project from your first message to final delivery, so your story is kept at the centre.",
  },
];

const PRINCIPLES: readonly { title: string; detail: string }[] = [
  { title: "Made from your story", detail: "Every song begins with your words and your memories. No lyrics or rhymes needed." },
  { title: "Made to order", detail: "Nothing is pulled from a shelf. Each song and each piece is created for one order." },
  { title: "Clear before you pay", detail: "The price, what is included and the timing are shown before payment." },
  { title: "Room to refine", detail: "Refinements are included, so the finished song feels right." },
];

const iconLink =
  "flex h-12 w-12 items-center justify-center rounded-full border border-ink/15 text-ink transition-colors hover:border-gold hover:bg-gold/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

const About = () => (
  <>
    <Helmet>
      <title>Our Story — The People Behind My Custom Beats</title>
      <meta
        name="description"
        content="Meet the founders of My Custom Beats and the musicians who turn your memories into personalised songs and keepsakes."
      />
      {/* The About page is where the organisation is actually described, so it
          is where the AboutPage + Organization graph belongs. */}
      <script type="application/ld+json">{JSON.stringify(aboutPageStructuredData())}</script>
    </Helmet>

    <main id="about" className="bg-ivory text-espresso">
      {/* ---- Opening ------------------------------------------------------ */}
      <section className="px-5 pb-16 pt-28 sm:px-8 md:pb-24 md:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <p className="label-uppercase text-gold-deep">Our story</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">
            We make music from the moments you want to keep.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-espresso/80 md:text-xl">
            My Custom Beats is a memory company with music at its heart. You bring the story — a day, a person, a place — and we turn it into a song you can relive, hold and give.
          </p>
        </div>
      </section>

      {/* ---- Founder note ------------------------------------------------- */}
      {/* Approved founder-note wording (as on the homepage), shortened. Typography only. */}
      <section aria-labelledby="founder-note" className="bg-ink px-5 py-20 sm:px-8 md:py-28">
        <figure className="mx-auto m-0 max-w-3xl">
          <h2 id="founder-note" className="text-center font-serif text-3xl leading-tight !text-ivory md:text-4xl">
            Why MCB exists
          </h2>
          <div aria-hidden="true" className="mx-auto mb-10 mt-6 h-px w-16 bg-gold" />
          <blockquote className="m-0 space-y-6">
            {FOUNDER_NOTE.map((paragraph) => (
              <p key={paragraph} className="font-serif text-2xl leading-relaxed !text-ivory/90">
                {paragraph}
              </p>
            ))}
          </blockquote>
          <figcaption className="mt-10 border-t border-ivory/15 pt-6 text-center">
            <span className="block font-serif text-3xl italic text-gold">Bella &amp; Lewis</span>
            <span className="mt-2 block text-base text-ivory/75">Founders, MCB™ — My Custom Beats</span>
          </figcaption>
        </figure>
      </section>

      {/* ---- Founders ----------------------------------------------------- */}
      <section aria-labelledby="founders" className="px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="founders" eyebrow="The founders" title="The people behind every song" />
          <div className="mt-12 grid items-center gap-8 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-10">
          <div className="mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-3xl bg-ink/5 md:max-w-none">
            <ResponsiveImage
              image={IMAGES.rinaldiPortrait}
              sizes="(min-width: 1024px) 26rem, (min-width: 768px) 40vw, 92vw"
              className="h-full w-full object-cover object-[50%_35%]"
            />
          </div>
          <ul className="m-0 grid list-none gap-6 p-0">
            {FOUNDERS.map((founder) => (
              <li key={founder.name} className="flex flex-col rounded-3xl border border-ink/10 bg-white p-6 md:p-8">
                <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-ink font-serif text-xl text-gold">
                  {founder.initials}
                </span>
                <h3 className="mt-5 font-serif text-3xl leading-tight text-ink">{founder.name}</h3>
                <p className="mt-1 text-base font-semibold text-gold-deep">{founder.role}</p>
                <p className="mt-4 text-base leading-relaxed text-espresso/80 md:text-lg">{founder.about}</p>
              </li>
            ))}
          </ul>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <p className="text-base text-espresso/80">Say hello</p>
            <div className="flex items-center gap-3">
              <a
                href="https://wa.me/447340742009?text=Hi%20Rinaldi%2C%20I%27m%20writing%20from%20the%20About%20page%20on%20your%20website%20and%20would%20like%20to%20chat."
                onClick={() => trackWhatsAppClick("about_founders")}
                target="_blank"
                rel="noopener noreferrer"
                className={iconLink}
                aria-label="Message us on WhatsApp (opens in a new window)"
              >
                <MessageCircle size={20} aria-hidden="true" />
              </a>
              <a
                href="https://instagram.com/djrinaldiofficial?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=about_founders"
                onClick={() => trackEvent("outbound_social_click", { platform: "instagram", location: "about_founders" })}
                target="_blank"
                rel="noopener noreferrer"
                className={iconLink}
                aria-label="Instagram (opens in a new window)"
              >
                <Instagram size={20} aria-hidden="true" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---- How we work -------------------------------------------------- */}
      <section aria-labelledby="how-we-work" className="bg-[#F1ECE3] px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">
          <SectionHeading id="how-we-work" eyebrow="How we work" title="Care in the details" />
          <ul className="m-0 mt-12 grid list-none gap-5 p-0 sm:grid-cols-2">
            {PRINCIPLES.map((item) => (
              <li key={item.title} className="rounded-2xl bg-white p-6">
                <h3 className="font-serif text-2xl leading-snug text-ink">{item.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-espresso/80">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Closing ------------------------------------------------------ */}
      <section className="px-5 py-20 text-center sm:px-8 md:py-24">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-serif text-4xl leading-tight text-ink md:text-5xl">Have a memory in mind?</h2>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <McbButtonLink to="/create">Create Your Memory</McbButtonLink>
            <Link
              to="/products"
              className="inline-flex min-h-12 items-center justify-center px-2 text-base font-semibold text-ink underline underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
            >
              See the experiences
            </Link>
          </div>
        </div>
      </section>
    </main>
  </>
);

export default About;
