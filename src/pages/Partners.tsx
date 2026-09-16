import { useState, useRef, useId } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Check } from "lucide-react";
import { trackFormSubmit } from "../lib/analytics";
import SectionHeading from "../components/mcb/SectionHeading";
import { McbButton, McbButtonLink } from "../components/mcb/McbButton";
import { mcbButtonClass } from "../lib/buttonClass";
import ResponsiveImage from "../components/ResponsiveImage";
import { IMAGES } from "../data/imagery";

/**
 * PARTNERS & HOSPITALITY — the business-facing page.
 *
 * Rebuilt this sprint. The page it replaces carried its own 200-line
 * stylesheet, its own palette (#B8965A / #1a1208 / #faf8f4), its own Google
 * Fonts import (Jost) and 10–13px type. It failed 29 colour-contrast checks,
 * shipped four buttons and three selects with no accessible name, skipped a
 * heading level, and was the only public page on the site with serious axe
 * violations. It is footer-linked and in the sitemap, so a cruise line or
 * hotel group evaluating MCB saw the weakest page MCB owns.
 *
 * Rebuilt on the approved identity (Ivory / Midnight Ink / Heritage Gold, the
 * site's own type scale, the shared button and section primitives) with a real
 * <form>, a visible <label> on every control, an inline error summary in place
 * of alert(), and 16px-and-up body type.
 *
 * Two commercial claims were also removed rather than restyled:
 *   - "Real Moments. Real Impact." presented four hypothetical scenarios in
 *     the past tense, reading as case studies MCB cannot evidence.
 *   - "Join forward-thinking brands who create unforgettable moments with My
 *     Custom Beats" implied existing brand partners.
 * Both are now written as what MCB can create, which is true today.
 *
 * The enquiry contract is unchanged: the same field names, the same Formspree
 * endpoint and the same Calendly link, both already declared processors in
 * docs and in the privacy inventory. No new third party is introduced.
 */

const SECTORS = [
  {
    label: "Cruise lines",
    desc: "A personalised song for a guest's voyage — the ports, the people they met, the celebration they came aboard for.",
  },
  {
    label: "Luxury hotels & resorts",
    desc: "A honeymoon, an anniversary stay or a milestone birthday, given something the guest keeps long after checkout.",
  },
  {
    label: "Wedding planners",
    desc: "A song written around one couple's story, ready for the day itself or given to them afterwards.",
  },
  {
    label: "Travel agencies & tour operators",
    desc: "Turn a trip you arranged into something your client can hear again — and remember who arranged it.",
  },
  {
    label: "Yacht charters",
    desc: "A small, high-touch gesture for a small, high-expectation guest list.",
  },
  {
    label: "Event companies",
    desc: "Celebrations, recognition and brand moments, written individually rather than licensed from a library.",
  },
] as const;

const USE_CASES = [
  {
    title: "Cruise companies",
    items: [
      "Guest entertainment",
      "Welcome experiences",
      "Anniversary celebrations onboard",
      "Birthday surprises",
      "Proposal packages",
      "VIP guest engagement",
      "Loyalty experiences",
      "Pre-cruise campaigns",
      "Post-cruise memory retention",
    ],
  },
  {
    title: "Hospitality groups",
    items: ["Hotels and resorts", "Luxury stays", "Honeymoon packages", "Concierge services"],
  },
  {
    title: "Corporate & enterprise",
    items: ["Employee engagement", "Team recognition", "Client gifting", "Event experiences", "Brand activations"],
  },
  {
    title: "Travel & tourism",
    items: ["Tour operators", "Destination experiences", "Luxury travel agencies"],
  },
  {
    title: "Wedding & event companies",
    items: ["Personalised event music", "Guest celebrations", "High-end occasions"],
  },
] as const;

const STEPS = [
  {
    num: "01",
    title: "You tell us about the guest",
    desc: "The memory, the milestone, the people in it. A short form, or your team's own notes — whichever suits how you work.",
  },
  {
    num: "02",
    title: "MCB shapes the brief",
    desc: "We build the creative brief around that story, in the guest's own words, and choose the musical direction.",
  },
  {
    num: "03",
    title: "MCB writes and produces it",
    desc: "An original song, written for that one guest. Every song passes an MCB quality check before anyone hears it.",
  },
  {
    num: "04",
    title: "Delivered to your guest",
    desc: "Digitally by private link, or as a personalised keepsake posted to you to present however you choose.",
  },
] as const;

/* What MCB can create for a partner. Written as capability, not as a client
   list: MCB has no published partner references, and none is implied. */
const EXAMPLES = [
  {
    title: "A surprise anniversary song",
    desc: "A couple's years together, written as one song and revealed to them during the celebration you are already hosting.",
  },
  {
    title: "A honeymoon soundtrack",
    desc: "The place, the trip and the two people in it, turned into music they play long after they are home.",
  },
  {
    title: "A VIP welcome",
    desc: "A personalised arrival for a guest you particularly want to look after, prepared before they travel.",
  },
  {
    title: "Recognition that isn't a plaque",
    desc: "A song for a colleague's long service or a team's achievement, written around what they actually did.",
  },
] as const;

const SERVICE_FACTS = [
  "Every song written from one guest's own story",
  "Written and produced by My Custom Beats",
  "Delivered digitally, or as a keepsake posted to you",
  "One named point of contact for your team",
  "Scoped and priced with you before anything is agreed",
] as const;

const MODELS = [
  "Guest gifting",
  "Onboard and event experiences",
  "Milestone celebrations",
  "Brand activations",
  "Bespoke commissions",
  "Something else entirely",
] as const;

const INDUSTRIES = [
  "Cruise line",
  "Luxury hotel / resort",
  "Weddings & events",
  "Travel agency",
  "Yacht charter",
  "Corporate",
  "Other",
] as const;

const INTERESTS = [
  "Guest gifting",
  "Onboard or event experiences",
  "Milestone celebrations",
  "Brand activation",
  "Bespoke commission",
  "Other",
] as const;

const VOLUMES = ["Under 1,000", "1,000 – 10,000", "10,000 – 50,000", "50,000+"] as const;

const GOALS = [
  "Guest entertainment",
  "Hospitality experiences",
  "Event experiences",
  "Brand activations",
  "Guest gifting",
  "Something else",
] as const;

const CALENDLY = "https://calendly.com/thecustombeats/demo";

const FIELD_CLASS =
  "mt-2 block w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-base text-ink placeholder:text-espresso/45 focus:border-gold-deep focus:outline-none focus:ring-2 focus:ring-gold-deep/40";
const LABEL_CLASS = "block text-[0.9375rem] font-semibold text-ink";

const emptyForm = {
  fullName: "",
  companyName: "",
  jobTitle: "",
  businessEmail: "",
  phone: "",
  website: "",
  industryType: "",
  partnershipInterest: "",
  estimatedVolume: "",
  regions: "",
  goals: [] as string[],
  message: "",
};

const PartnersPage = () => {
  const formRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = useId();
  const fid = (name: string) => `${uid}-${name}`;

  const scrollToForm = () => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleGoalToggle = (goal: string) =>
    setFormData((prev) => ({
      ...prev,
      goals: prev.goals.includes(goal) ? prev.goals.filter((g) => g !== goal) : [...prev.goals, goal],
    }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData.fullName.trim() || !formData.businessEmail.trim()) {
      setError("Please add your name and a business email so we can reply.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const response = await fetch("https://formspree.io/f/mdajgzwp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          _subject: `New Partnership Inquiry from ${formData.fullName} (${formData.companyName})`,
        }),
      });
      if (response.ok) {
        trackFormSubmit("partner_application");
        setSubmitted(true);
      } else {
        setError("We couldn't send that just now. Please try again, or email hello@mycustombeats.com.");
      }
    } catch {
      setError(
        "We couldn't reach our server — please check your connection and try again, or email hello@mycustombeats.com."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Hospitality &amp; Cruise Partnerships | My Custom Beats</title>
        <meta
          name="description"
          content="Personalised songs as a guest experience for cruise lines, hotels, resorts, wedding planners and event partners. Written individually for each guest by My Custom Beats."
        />
      </Helmet>

      {/* ── HERO ───────────────────────────────────────────────────────── */}
      <section aria-labelledby="partners-heading" className="bg-ivory px-5 pb-16 pt-28 sm:px-8 lg:px-12 lg:pb-24 lg:pt-32">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          <div>
            <p className="label-uppercase mb-5 text-gold-deep">Partner with MCB™</p>
            <h1 id="partners-heading" className="text-ink" style={{ fontSize: "clamp(2.35rem, 4.8vw, 4rem)", lineHeight: 1.06 }}>
              Turn your guests&rsquo; moments into music they keep.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-espresso/80 sm:text-xl">
              MCB writes and produces a personalised song from one guest&rsquo;s own story — the voyage, the
              celebration, the anniversary, the people. A considered gesture for hospitality, travel and events,
              handled end to end by us.
            </p>

            <ul className="mt-8 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-3">
              {[
                ["Individually written", "never a template"],
                ["One point of contact", "for your team"],
                ["Digital or posted", "keepsake"],
              ].map(([title, sub]) => (
                <li key={title} className="rounded-xl border border-ink/10 bg-white px-4 py-3">
                  <p className="text-base font-semibold text-ink">{title}</p>
                  <p className="text-[0.9375rem] text-espresso/75">{sub}</p>
                </li>
              ))}
            </ul>

            <div className="mt-9 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
              <McbButton onClick={scrollToForm} className="min-h-14 px-8 text-lg">
                Become a partner
              </McbButton>
              <a
                href={CALENDLY}
                target="_blank"
                rel="noopener noreferrer"
                className={mcbButtonClass("secondary", "min-h-14 px-8 text-lg")}
              >
                Book a call
              </a>
            </div>

            <p className="mt-8 border-t border-ink/10 pt-5 text-base text-espresso/80">
              This page is for businesses buying a guest experience.{" "}
              <Link
                to="/create"
                className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-deep"
              >
                Creating a memory for yourself? Start here
              </Link>
              .
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-xl lg:max-w-none">
            <div className="aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-ink/5 shadow-[0_30px_80px_rgba(13,27,42,0.14)]">
              <ResponsiveImage
                image={IMAGES.cruiseDance}
                alt="Guests celebrating together on board at sea"
                sizes="(min-width: 1024px) 45vw, 92vw"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── WHO WE PARTNER WITH ────────────────────────────────────────── */}
      <section aria-labelledby="sectors-heading" className="bg-white px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            id="sectors-heading"
            eyebrow="Who we partner with"
            title="Built for the businesses that create the moments"
            intro={<p>If your guests are already having the experience, MCB gives them something to keep of it.</p>}
          />
          <ul className="mt-14 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {SECTORS.map((sector) => (
              <li
                key={sector.label}
                className="rounded-[1.25rem] border border-ink/10 bg-ivory p-6 shadow-[0_14px_40px_rgba(13,27,42,0.05)]"
              >
                <h3 className="text-ink" style={{ fontSize: "1.6rem" }}>
                  {sector.label}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-espresso/80">{sector.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── USE CASES ──────────────────────────────────────────────────── */}
      <section aria-labelledby="usecases-heading" className="bg-ivory px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            id="usecases-heading"
            eyebrow="Where it fits"
            title="Occasions your guests already care about"
          />
          <ul className="mt-14 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((group) => (
              <li key={group.title} className="rounded-[1.25rem] border border-ink/10 bg-white p-6">
                <h3 className="text-ink" style={{ fontSize: "1.5rem" }}>
                  {group.title}
                </h3>
                <ul className="mt-4 list-none space-y-2 p-0">
                  {group.items.map((item) => (
                    <li key={item} className="flex gap-2.5 text-base leading-snug text-espresso/85">
                      <Check size={18} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
      <section aria-labelledby="partner-process-heading" className="bg-ink px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            id="partner-process-heading"
            eyebrow="How it works"
            title="Four steps, and MCB carries the rest"
            onDark
            intro={<p>Your team collects the story. Everything after that is ours.</p>}
          />
          <ol className="mt-14 grid list-none grid-cols-1 gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.num} className="border-t border-gold/40 pt-6">
                <p className="font-serif text-4xl text-gold">{step.num}</p>
                <h3 className="mt-3 !text-ivory" style={{ fontSize: "1.45rem" }}>
                  {step.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-ivory/75">{step.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── THE SERVICE ────────────────────────────────────────────────── */}
      <section aria-labelledby="service-heading" className="bg-white px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div>
            <SectionHeading
              id="service-heading"
              align="left"
              eyebrow="The service"
              title="Personal at scale, without becoming a template"
              intro={
                <p>
                  MCB combines people who write music with a production process built to handle volume. The process
                  scales; the song never stops being about one guest.
                </p>
              }
            />
            <ul className="mt-8 list-none space-y-3 p-0">
              {SERVICE_FACTS.map((fact) => (
                <li key={fact} className="flex gap-3 text-base leading-relaxed text-ink">
                  <Check size={20} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
                  <span>{fact}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 rounded-xl bg-ivory px-4 py-3 text-[0.9375rem] leading-relaxed text-ink">
              Digital work is revealed as soon as it has passed MCB&rsquo;s quality check. For physical keepsakes,
              allow at least 15 working days for personalised production and delivery.
            </p>
          </div>
          <div className="overflow-hidden rounded-[1.75rem] bg-ink/5 shadow-[0_24px_70px_rgba(13,27,42,0.12)]">
            <div className="aspect-[4/3]">
              <ResponsiveImage
                image={IMAGES.keepsakeSleeveWall}
                alt="Personalised MCB record sleeves displayed together on a wall"
                sizes="(min-width: 1024px) 45vw, 92vw"
                className="h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── WHAT MCB CAN CREATE ────────────────────────────────────────── */}
      <section aria-labelledby="examples-heading" className="bg-ivory px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto max-w-[1400px]">
          <SectionHeading
            id="examples-heading"
            eyebrow="What MCB can create"
            title="Four ways partners use it"
            intro={<p>Illustrations of the work, not client references.</p>}
          />
          <ul className="mt-14 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {EXAMPLES.map((example) => (
              <li key={example.title} className="rounded-[1.25rem] border border-ink/10 bg-white p-6">
                <h3 className="text-ink" style={{ fontSize: "1.4rem" }}>
                  {example.title}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-espresso/80">{example.desc}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── ENQUIRY ────────────────────────────────────────────────────── */}
      <section aria-labelledby="enquiry-heading" className="bg-white px-5 py-20 sm:px-8 md:py-28">
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <div>
            <SectionHeading
              id="enquiry-heading"
              align="left"
              eyebrow="Partnership enquiry"
              title="Start the conversation"
              intro={
                <p>
                  Tell us roughly what you have in mind and we&rsquo;ll come back to you. Nothing is costed or
                  committed at this stage.
                </p>
              }
            />
            <h3 className="mt-10 text-ink" style={{ fontSize: "1.35rem" }}>
              Partnership models
            </h3>
            <ul className="mt-4 list-none space-y-2 p-0">
              {MODELS.map((model) => (
                <li key={model} className="flex gap-2.5 text-base text-espresso/85">
                  <Check size={18} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
                  <span>{model}</span>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-base leading-relaxed text-espresso/80">
              Prefer to talk first?{" "}
              <a
                href={CALENDLY}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-deep"
              >
                Book a partnership call
              </a>
              , or email{" "}
              <a
                href="mailto:hello@mycustombeats.com"
                className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-deep"
              >
                hello@mycustombeats.com
              </a>
              .
            </p>
          </div>

          <div ref={formRef} className="scroll-mt-28">
            {submitted ? (
              <div className="rounded-[1.5rem] border border-ink/10 bg-ivory p-8 text-center sm:p-12">
                <div
                  aria-hidden="true"
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-gold-deep"
                >
                  <Check size={32} />
                </div>
                <h3 className="mt-6 text-ink" style={{ fontSize: "2rem" }}>
                  Thank you
                </h3>
                <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-espresso/80">
                  We&rsquo;ve received your enquiry. We&rsquo;ll read it properly and come back to you by email to
                  talk through what MCB could create for your guests.
                </p>
                <a
                  href={CALENDLY}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={mcbButtonClass("primary", "mt-8")}
                >
                  Book a call as well
                </a>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="rounded-[1.5rem] border border-ink/10 bg-ivory p-6 shadow-[0_18px_50px_rgba(13,27,42,0.06)] sm:p-8"
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor={fid("fullName")} className={LABEL_CLASS}>
                      Full name <span className="text-gold-deep">*</span>
                    </label>
                    <input
                      id={fid("fullName")}
                      className={FIELD_CLASS}
                      name="fullName"
                      autoComplete="name"
                      value={formData.fullName}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("companyName")} className={LABEL_CLASS}>
                      Company name
                    </label>
                    <input
                      id={fid("companyName")}
                      className={FIELD_CLASS}
                      name="companyName"
                      autoComplete="organization"
                      value={formData.companyName}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("jobTitle")} className={LABEL_CLASS}>
                      Job title
                    </label>
                    <input
                      id={fid("jobTitle")}
                      className={FIELD_CLASS}
                      name="jobTitle"
                      autoComplete="organization-title"
                      value={formData.jobTitle}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("businessEmail")} className={LABEL_CLASS}>
                      Business email <span className="text-gold-deep">*</span>
                    </label>
                    <input
                      id={fid("businessEmail")}
                      className={FIELD_CLASS}
                      type="email"
                      name="businessEmail"
                      autoComplete="email"
                      value={formData.businessEmail}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("phone")} className={LABEL_CLASS}>
                      Phone number
                    </label>
                    <input
                      id={fid("phone")}
                      className={FIELD_CLASS}
                      type="tel"
                      name="phone"
                      autoComplete="tel"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("website")} className={LABEL_CLASS}>
                      Company website
                    </label>
                    <input
                      id={fid("website")}
                      className={FIELD_CLASS}
                      name="website"
                      autoComplete="url"
                      value={formData.website}
                      onChange={handleChange}
                    />
                  </div>
                  <div>
                    <label htmlFor={fid("industryType")} className={LABEL_CLASS}>
                      Industry
                    </label>
                    <select
                      id={fid("industryType")}
                      className={FIELD_CLASS}
                      name="industryType"
                      value={formData.industryType}
                      onChange={handleChange}
                    >
                      <option value="">Please choose</option>
                      {INDUSTRIES.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={fid("partnershipInterest")} className={LABEL_CLASS}>
                      Type of partnership
                    </label>
                    <select
                      id={fid("partnershipInterest")}
                      className={FIELD_CLASS}
                      name="partnershipInterest"
                      value={formData.partnershipInterest}
                      onChange={handleChange}
                    >
                      <option value="">Please choose</option>
                      {INTERESTS.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={fid("estimatedVolume")} className={LABEL_CLASS}>
                      Estimated guest volume
                    </label>
                    <select
                      id={fid("estimatedVolume")}
                      className={FIELD_CLASS}
                      name="estimatedVolume"
                      value={formData.estimatedVolume}
                      onChange={handleChange}
                    >
                      <option value="">Please choose</option>
                      {VOLUMES.map((option) => (
                        <option key={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={fid("regions")} className={LABEL_CLASS}>
                      Countries or regions served
                    </label>
                    <input
                      id={fid("regions")}
                      className={FIELD_CLASS}
                      name="regions"
                      value={formData.regions}
                      onChange={handleChange}
                      placeholder="For example: UK, Europe, North America"
                    />
                  </div>
                </div>

                <fieldset className="mt-7 border-0 p-0">
                  <legend className={`${LABEL_CLASS} p-0`}>What are you hoping to do? (optional)</legend>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {GOALS.map((goal) => (
                      <label
                        key={goal}
                        className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-base text-ink has-[:checked]:border-gold-deep has-[:checked]:bg-gold/10"
                      >
                        <input
                          type="checkbox"
                          className="h-5 w-5 accent-[#78601F]"
                          checked={formData.goals.includes(goal)}
                          onChange={() => handleGoalToggle(goal)}
                        />
                        <span>{goal}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div className="mt-7">
                  <label htmlFor={fid("message")} className={LABEL_CLASS}>
                    Tell us what you have in mind
                  </label>
                  <textarea
                    id={fid("message")}
                    className={`${FIELD_CLASS} min-h-32 resize-y`}
                    name="message"
                    rows={5}
                    value={formData.message}
                    onChange={handleChange}
                    placeholder="The guests, the occasion, roughly how many and when."
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="mt-6 rounded-xl border border-gold-dark/40 bg-gold/10 px-4 py-3 text-base font-medium text-ink"
                  >
                    {error}
                  </p>
                )}

                <McbButton type="submit" disabled={isSubmitting} className="mt-7 min-h-14 w-full text-lg">
                  {isSubmitting ? "Sending…" : "Send partnership enquiry"}
                </McbButton>

                <p className="mt-4 text-[0.9375rem] leading-relaxed text-espresso/75">
                  We use what you send here only to reply to this enquiry. See our{" "}
                  <Link
                    to="/legal/privacy"
                    className="font-medium text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep"
                  >
                    privacy policy
                  </Link>
                  .
                </p>
              </form>
            )}
          </div>
        </div>
      </section>

      {/* ── CLOSE ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="partners-close-heading" className="bg-ink px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 id="partners-close-heading" className="!text-ivory" style={{ fontSize: "clamp(2rem, 4vw, 3rem)" }}>
            Give your guests something they keep.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-ivory/80">
            Tell us about your guests and we&rsquo;ll tell you honestly what MCB can create for them.
          </p>
          <div className="mt-9 flex flex-col items-center gap-3 min-[420px]:flex-row min-[420px]:justify-center">
            <McbButton tone="gold" onClick={scrollToForm} className="min-h-14 px-8 text-lg">
              Send an enquiry
            </McbButton>
            <McbButtonLink to="/products" tone="ghostLight" className="min-h-14 px-8 text-lg">
              See what MCB makes
            </McbButtonLink>
          </div>
        </div>
      </section>
    </>
  );
};

export default PartnersPage;
