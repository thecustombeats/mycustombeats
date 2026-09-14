import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MCB_LIVE } from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";

/**
 * MCB LIVE — DJ Rinaldi, Lady Lakh, or both, for selected events.
 *
 * A separate, quieter world from the song experiences: no prices (every event
 * is quoted individually), no named events, no testimonials. The enquiry opens
 * WhatsApp with the details pre-written; nothing is booked or charged here.
 */

const WHATSAPP_NUMBER = "447340742009";

const REQUEST_TYPES = ["Availability", "A quote", "Availability and a quote"] as const;
type RequestType = (typeof REQUEST_TYPES)[number];

const PERFORMERS: readonly [string, string][] = [
  ["DJ RINALDI", "Multi-genre DJ performance, shaped to the room and the moment."],
  ["LADY LAKH", "Solo multi-genre DJ performance for celebrations and private events."],
  ["DJ RINALDI × LADY LAKH", "The MCB LIVE duo, together, for selected private, destination and professional events."],
];

const BOOKING_STEPS: readonly [string, string][] = [
  ["Enquire", "Tell us about your event."],
  ["Availability", "We check the performers, dates and travel."],
  ["Quote", "Your event is priced individually."],
  ["Agreement", "Scope and terms agreed in writing."],
  ["Deposit", "On the terms in your agreement."],
  ["Confirmation", "Your booking is confirmed."],
];

const field = "mt-2 w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink placeholder:text-espresso/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";
const label = "block text-base font-semibold text-ink";
const goldButton =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-8 py-3 text-base font-semibold text-ink transition-colors hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink";
const ghostButton =
  "inline-flex min-h-12 items-center justify-center rounded-full border border-ivory/50 px-8 py-3 text-base font-semibold text-ivory transition-colors hover:border-ivory hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

const MCBLive = () => {
  const ids = useId();
  const [request, setRequest] = useState<RequestType>("Availability");
  const [dj, setDj] = useState("Help me choose");
  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [duration, setDuration] = useState("Custom / to be discussed");
  const [budget, setBudget] = useState("");
  const [reveal, setReveal] = useState("No");
  const [details, setDetails] = useState("");

  const sendWhatsApp = (event: FormEvent) => {
    event.preventDefault();
    const message = [
      "Hello DJ Rinaldi, I would like to enquire about MCB LIVE.",
      `Request: ${request}`,
      `DJ: ${dj}`,
      `Event: ${eventType || "To be discussed"}`,
      `Date: ${date || "Flexible / to be discussed"}`,
      `Location: ${location || "To be confirmed"}`,
      `Performance duration: ${duration}`,
      `Budget: ${budget || "To be discussed"}`,
      `MCB Song Reveal: ${reveal}`,
      details ? `Additional details: ${details}` : "",
      "Please let me know if you are available and whether this event may be suitable for MCB LIVE."
    ].filter(Boolean).join("\n");
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  const id = (name: string) => `${ids}-${name}`;

  return <>
    <Helmet>
      <title>MCB LIVE | DJ Rinaldi & Lady Lakh</title>
      <meta name="description" content="Request DJ Rinaldi, Lady Lakh or both for selected weddings, private events, yachts, cruises and destination celebrations worldwide, including the MCB Song Reveal Experience." />
      <script type="application/ld+json">
        {JSON.stringify(productPageStructuredData(MCB_LIVE.id))}
      </script>
    </Helmet>

    <main className="bg-ink text-ivory">
      {/* ---- Identity ---------------------------------------------------- */}
      <section className="relative overflow-hidden px-5 pb-20 pt-32 text-center sm:px-8 md:pb-28 md:pt-40">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-full bg-[radial-gradient(ellipse_at_top,rgba(201,161,74,0.18),transparent_60%)]" />
        <div className="relative mx-auto max-w-5xl">
          <p className="label-uppercase text-gold">MCB™ LIVE</p>
          <h1 className="mt-6 font-serif text-4xl leading-[1.08] tracking-wide !text-ivory sm:text-5xl md:text-7xl">
            DJ RINALDI <span className="text-gold" aria-hidden="true">·</span> LADY LAKH <span className="text-gold" aria-hidden="true">·</span> TOGETHER
          </h1>
          <div className="mx-auto mt-10 h-px w-16 bg-gold" aria-hidden="true" />
          <p className="mt-10 font-serif text-2xl leading-snug tracking-[0.12em] text-gold md:text-3xl">
            <span className="block">CREATE THE MEMORY.</span>
            <span className="block">CREATE THE SONG.</span>
            <span className="block">BRING IT TO LIFE.</span>
          </p>
          <p className="mx-auto mt-10 max-w-2xl text-lg leading-relaxed text-ivory/85 md:text-xl">{MCB_LIVE.positioning}</p>
          <p className="mt-6 text-sm font-semibold tracking-[0.2em] text-ivory/80">AVAILABLE FOR SELECT EVENTS WORLDWIDE</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="#enquire" onClick={() => setRequest("Availability")} className={goldButton}>Request Availability</a>
            <a href="#enquire" onClick={() => setRequest("A quote")} className={ghostButton}>Request a Quote</a>
          </div>
        </div>
      </section>

      {/* ---- Performers ---------------------------------------------------- */}
      <section aria-labelledby="live-performers" className="border-t border-ivory/10 px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-uppercase text-gold">Choose your experience</p>
            <h2 id="live-performers" className="mt-4 font-serif text-4xl leading-tight !text-ivory md:text-5xl">Individually, or together.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ivory/80">For personal celebrations and professional venue, yacht, cruise and entertainment enquiries. Availability is always confirmed before a booking is accepted.</p>
          </div>
          <ul className="m-0 mt-12 grid list-none gap-5 p-0 md:grid-cols-3">
            {PERFORMERS.map(([title, copy]) => (
              <li key={title} className="flex flex-col rounded-3xl border border-ivory/15 bg-white/[0.03] p-7">
                <h3 className="font-serif text-2xl tracking-wide !text-ivory">{title}</h3>
                <p className="mt-3 text-base leading-relaxed text-ivory/80">{copy}</p>
                <a href="#enquire" onClick={() => setRequest("Availability")} className="mt-auto inline-flex min-h-12 items-center pt-4 text-base font-semibold text-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
                  Request availability<span className="sr-only">{` for ${title}`}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- Song Reveal --------------------------------------------------- */}
      <section aria-labelledby="live-reveal" className="bg-[#13243A] px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="label-uppercase text-gold">The signature MCB experience</p>
          <h2 id="live-reveal" className="mt-4 font-serif text-4xl leading-tight !text-ivory md:text-5xl">The MCB Song Reveal Experience</h2>
          <p className="mt-6 text-lg leading-relaxed text-ivory/85">Commission your personalised MCB song, then enquire about having DJ Rinaldi, Lady Lakh or both introduce and reveal it at your celebration before continuing into a live DJ performance.</p>
          <p className="mt-4 text-base leading-relaxed text-ivory/75">
            Your song is created first, through{" "}
            <Link to="/create" className="font-semibold text-gold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Create Your Memory</Link>
            {" "}or a{" "}
            <Link to="/bespoke" className="font-semibold text-gold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">Bespoke</Link>
            {" "}commission.
          </p>
        </div>
      </section>

      {/* ---- How booking works --------------------------------------------- */}
      <section aria-labelledby="live-booking" className="px-5 py-20 sm:px-8 md:py-24">
        <div className="mx-auto grid max-w-6xl gap-12 md:grid-cols-2">
          <div>
            <p className="label-uppercase text-gold">Selected events</p>
            <h2 id="live-booking" className="mt-4 font-serif text-4xl leading-tight !text-ivory">From private celebrations to yachts and cruises.</h2>
            <p className="mt-5 text-lg leading-relaxed text-ivory/80">MCB LIVE welcomes enquiries from individuals, wedding and event clients, private yachts, cruise operators, hotels, resorts and venues.</p>
            <p className="mt-4 text-base leading-relaxed text-ivory/75">International availability depends on the DJs’ current location, existing commitments, travel feasibility and logistics. Flights, accommodation, transfers, work permissions and other necessary travel costs are assessed before a quotation is confirmed. {MCB_LIVE.disclosures.join(" ")}.</p>
          </div>
          <div className="rounded-3xl border border-ivory/15 p-7 md:p-8">
            <h3 className="font-serif text-2xl !text-ivory">How booking works</h3>
            <ol className="m-0 mt-5 list-none space-y-4 p-0">
              {BOOKING_STEPS.map(([title, copy], index) => (
                <li key={title} className="flex gap-4">
                  <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/60 font-mono text-base text-gold">{index + 1}</span>
                  <p className="text-base leading-relaxed text-ivory/85"><span className="font-semibold text-ivory">{title}</span> — {copy}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ---- Enquiry ----------------------------------------------------- */}
      <section id="enquire" aria-labelledby="live-enquire" className="bg-ivory px-5 py-20 text-espresso sm:px-8 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <p className="label-uppercase text-gold-deep">Request availability or a quote</p>
            <h2 id="live-enquire" className="mt-4 font-serif text-4xl leading-tight text-ink">Tell us about your event.</h2>
            <p className="mt-4 text-lg leading-relaxed text-espresso/80">No payment is taken at this stage. Your enquiry opens WhatsApp with the details below ready to send directly to DJ Rinaldi.</p>
          </div>
          <form onSubmit={sendWhatsApp} className="space-y-6 rounded-3xl border border-ink/10 bg-white p-6 md:p-10">
            <fieldset>
              <legend className={label}>What would you like?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {REQUEST_TYPES.map((type) => (
                  <label key={type} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-base text-ink ${request === type ? "border-gold-dark bg-gold/10" : "border-ink/15"}`}>
                    <input type="radio" name={id("request")} value={type} checked={request === type} onChange={() => setRequest(type)} className="h-5 w-5 accent-[#856823]" />
                    {type}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label htmlFor={id("dj")} className={label}>Who would you like?</label>
              <select id={id("dj")} value={dj} onChange={e => setDj(e.target.value)} className={field}><option>DJ Rinaldi</option><option>Lady Lakh</option><option>DJ Rinaldi × Lady Lakh</option><option>Help me choose</option></select>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div><label htmlFor={id("event")} className={label}>Event type</label><input id={id("event")} value={eventType} onChange={e => setEventType(e.target.value)} placeholder="Wedding, yacht, cruise, private event…" className={field} /></div>
              <div><label htmlFor={id("date")} className={label}>Event date</label><input id={id("date")} type="date" value={date} onChange={e => setDate(e.target.value)} className={field} /></div>
            </div>
            <div><label htmlFor={id("location")} className={label}>Venue, city or country</label><input id={id("location")} value={location} onChange={e => setLocation(e.target.value)} placeholder="Where is the event?" className={field} /></div>
            <div className="grid gap-6 md:grid-cols-2">
              <div><label htmlFor={id("duration")} className={label}>Performance duration</label><select id={id("duration")} value={duration} onChange={e => setDuration(e.target.value)} className={field}><option>1 hour</option><option>2 hours</option><option>3 hours</option><option>Extended event</option><option>Custom / to be discussed</option></select></div>
              <div><label htmlFor={id("budget")} className={label}>Approximate budget <span className="font-normal text-espresso/75">(optional)</span></label><input id={id("budget")} value={budget} onChange={e => setBudget(e.target.value)} placeholder="Your budget and currency, if known" className={field} /></div>
            </div>
            <div><label htmlFor={id("reveal")} className={label}>Would you like an MCB personalised song revealed at your event?</label><select id={id("reveal")} value={reveal} onChange={e => setReveal(e.target.value)} className={field}><option>Yes</option><option>No</option><option>I already have an MCB song</option></select></div>
            <div><label htmlFor={id("details")} className={label}>Anything else you would like us to know? <span className="font-normal text-espresso/75">(optional)</span></label><textarea id={id("details")} value={details} onChange={e => setDetails(e.target.value)} rows={5} placeholder="Event details, music, audience, special requests…" className={field} /></div>
            <button type="submit" className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-8 py-4 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2">Message DJ Rinaldi on WhatsApp</button>
            <p className="text-center text-sm leading-relaxed text-espresso/75">Opens WhatsApp in a new window. An enquiry is not a confirmed booking. Availability, travel, logistics, quotation, agreement and deposit must be completed before confirmation.</p>
          </form>
        </div>
      </section>
    </main>
  </>;
};

export default MCBLive;
