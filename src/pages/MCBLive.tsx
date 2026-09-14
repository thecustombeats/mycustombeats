import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { MCB_LIVE } from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";
import {
  EMPTY_LIVE_ENQUIRY,
  LIVE_DURATIONS,
  LIVE_PERFORMERS,
  LIVE_REQUEST_TYPES,
  LIVE_SONG_REVEAL,
  LinkError,
  submitLiveEnquiry,
  validateLiveEnquiry,
  type LiveEnquiry,
} from "../lib/customerOrder";

/**
 * MCB LIVE — DJ Rinaldi, Lady Lakh, or both, for selected events.
 *
 * A separate, quieter world from the song experiences: no prices (every event
 * is quoted individually), no named events, no testimonials. The enquiry is
 * stored on MCB's own server with a LIVE- reference and reaches the MCB team's
 * queue; nothing is booked, quoted or charged here. WhatsApp remains as a
 * second way to get in touch, on MCB's existing published number.
 */

const WHATSAPP_NUMBER = "447340742009";

type RequestType = LiveEnquiry["requestType"];

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
  const [enquiry, setEnquiry] = useState<LiveEnquiry>(EMPTY_LIVE_ENQUIRY);
  const [errors, setErrors] = useState<Partial<Record<keyof LiveEnquiry, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const acknowledgementRef = useRef<HTMLDivElement | null>(null);

  const setRequest = (requestType: RequestType) => setEnquiry((previous) => ({ ...previous, requestType }));
  const update = <K extends keyof LiveEnquiry>(key: K, value: LiveEnquiry[K]) =>
    setEnquiry((previous) => ({ ...previous, [key]: value }));

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const found = validateLiveEnquiry(enquiry);
    setErrors(found);
    setSubmitError(null);
    if (Object.keys(found).length > 0) {
      document.querySelector<HTMLElement>("[data-field-error]")?.focus();
      return;
    }
    setSending(true);
    try {
      const receipt = await submitLiveEnquiry(enquiry);
      setReference(receipt.reference);
    } catch (error) {
      if (error instanceof LinkError) {
        setErrors(error.fields as Partial<Record<keyof LiveEnquiry, string>>);
        setSubmitError(error.message);
      } else {
        setSubmitError("We couldn't send that just now. Please try again in a moment.");
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (reference) acknowledgementRef.current?.focus();
  }, [reference]);

  const id = (name: string) => `${ids}-${name}`;
  const invalid = (name: keyof LiveEnquiry) =>
    errors[name]
      ? { "aria-invalid": true, "aria-describedby": id(`${name}-error`), "data-field-error": true }
      : {};
  const fieldError = (name: keyof LiveEnquiry) =>
    errors[name] ? <p id={id(`${name}-error`)} className="mt-2 text-base font-semibold text-[#9B2C2C]">{errors[name]}</p> : null;

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
            <a href="#enquire" onClick={() => setRequest("AVAILABILITY")} className={goldButton}>Request Availability</a>
            <a href="#enquire" onClick={() => setRequest("QUOTE")} className={ghostButton}>Request a Quote</a>
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
                <a href="#enquire" onClick={() => setRequest("AVAILABILITY")} className="mt-auto inline-flex min-h-12 items-center pt-4 text-base font-semibold text-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
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
            <p className="mt-4 text-lg leading-relaxed text-espresso/80">No payment is taken at this stage. Your enquiry comes straight to the MCB team, and we reply by email.</p>
          </div>

          {reference ? (
            <div ref={acknowledgementRef} tabIndex={-1} role="status" className="rounded-3xl border border-ink/10 bg-white p-8 text-center focus:outline-none md:p-10">
              <h3 className="font-serif text-3xl text-ink">Thank you — we have your enquiry.</h3>
              <p className="mt-4 text-lg leading-relaxed text-espresso/85">Your reference is</p>
              <p className="mt-2 font-mono text-2xl font-semibold tracking-wider text-ink">{reference}</p>
              <p className="mt-6 text-base leading-relaxed text-espresso/80">We will reply by email. An enquiry is not a booking: availability, travel and logistics, a quotation, a written agreement and a deposit all come before a booking is confirmed.</p>
            </div>
          ) : (
          <form onSubmit={send} noValidate className="space-y-6 rounded-3xl border border-ink/10 bg-white p-6 md:p-10">
            <fieldset>
              <legend className={label}>What would you like?</legend>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {LIVE_REQUEST_TYPES.map((type) => (
                  <label key={type.value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-base text-ink ${enquiry.requestType === type.value ? "border-gold-dark bg-gold/10" : "border-ink/15"}`}>
                    <input type="radio" name={id("request")} value={type.value} checked={enquiry.requestType === type.value} onChange={() => setRequest(type.value)} className="h-5 w-5 accent-[#856823]" />
                    {type.label}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid gap-6 md:grid-cols-2">
              <div><label htmlFor={id("name")} className={label}>Your name</label><input id={id("name")} autoComplete="name" value={enquiry.name} onChange={e => update("name", e.target.value)} className={field} {...invalid("name")} />{fieldError("name")}</div>
              <div><label htmlFor={id("email")} className={label}>Email</label><input id={id("email")} type="email" autoComplete="email" value={enquiry.email} onChange={e => update("email", e.target.value)} className={field} {...invalid("email")} />{fieldError("email")}</div>
            </div>
            <div><label htmlFor={id("phone")} className={label}>Phone <span className="font-normal text-espresso/75">(optional)</span></label><input id={id("phone")} type="tel" autoComplete="tel" value={enquiry.phone} onChange={e => update("phone", e.target.value)} className={field} /></div>
            <div>
              <label htmlFor={id("dj")} className={label}>Who would you like?</label>
              <select id={id("dj")} value={enquiry.performer} onChange={e => update("performer", e.target.value as LiveEnquiry["performer"])} className={field}>
                {LIVE_PERFORMERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div><label htmlFor={id("event")} className={label}>Event type</label><input id={id("event")} value={enquiry.eventType} onChange={e => update("eventType", e.target.value)} placeholder="Wedding, yacht, cruise, private event…" className={field} {...invalid("eventType")} />{fieldError("eventType")}</div>
              <div><label htmlFor={id("date")} className={label}>Event date <span className="font-normal text-espresso/75">(optional)</span></label><input id={id("date")} type="date" value={enquiry.eventDate} onChange={e => update("eventDate", e.target.value)} className={field} {...invalid("eventDate")} />{fieldError("eventDate")}</div>
            </div>
            <div><label htmlFor={id("location")} className={label}>Venue, city or country</label><input id={id("location")} value={enquiry.location} onChange={e => update("location", e.target.value)} placeholder="Where is the event?" className={field} {...invalid("location")} />{fieldError("location")}</div>
            <div className="grid gap-6 md:grid-cols-2">
              <div><label htmlFor={id("duration")} className={label}>Performance duration</label><select id={id("duration")} value={enquiry.duration} onChange={e => update("duration", e.target.value as LiveEnquiry["duration"])} className={field}>{LIVE_DURATIONS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}</select></div>
              <div><label htmlFor={id("budget")} className={label}>Approximate budget <span className="font-normal text-espresso/75">(optional)</span></label><input id={id("budget")} value={enquiry.approximateBudget} onChange={e => update("approximateBudget", e.target.value)} maxLength={120} placeholder="Your budget and currency, if known" className={field} /></div>
            </div>
            <div><label htmlFor={id("reveal")} className={label}>Would you like an MCB personalised song revealed at your event?</label><select id={id("reveal")} value={enquiry.songReveal} onChange={e => update("songReveal", e.target.value as LiveEnquiry["songReveal"])} className={field}>{LIVE_SONG_REVEAL.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div><label htmlFor={id("details")} className={label}>Anything else you would like us to know? <span className="font-normal text-espresso/75">(optional)</span></label><textarea id={id("details")} value={enquiry.details} onChange={e => update("details", e.target.value)} rows={5} maxLength={4000} placeholder="Event details, music, audience, special requests…" className={field} /></div>
            {submitError && <p role="alert" className="rounded-xl bg-[#FDECEC] px-4 py-3 text-base font-semibold text-[#9B2C2C]">{submitError}</p>}
            <button type="submit" disabled={sending} className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-8 py-4 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70">{sending ? "Sending…" : "Send enquiry"}</button>
            <p className="text-center text-sm leading-relaxed text-espresso/75">An enquiry is not a confirmed booking. Availability, travel, logistics, quotation, agreement and deposit must be completed before confirmation.</p>
          </form>
          )}

          <p className="mt-8 text-center text-base leading-relaxed text-espresso/80">
            Prefer WhatsApp?{" "}
            <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent("Hello DJ Rinaldi, I would like to enquire about MCB LIVE.")}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
              Message us on WhatsApp<span className="sr-only"> (opens in a new window)</span>
            </a>
          </p>
        </div>
      </section>
    </main>
  </>;
};

export default MCBLive;
