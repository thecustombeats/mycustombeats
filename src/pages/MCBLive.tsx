import { FormEvent, useState } from "react";
import { Helmet } from "react-helmet-async";

const WHATSAPP_NUMBER = "447340742009";

const MCBLive = () => {
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

  return <>
    <Helmet>
      <title>MCB LIVE | DJ Rinaldi & Lady Lakh</title>
      <meta name="description" content="Request DJ Rinaldi, Lady Lakh or both for selected weddings, private events, yachts, cruises and destination celebrations worldwide, including the MCB Song Reveal Experience." />
    </Helmet>
    <main className="bg-ivory text-espresso">
      <section className="min-h-[82vh] flex items-center justify-center px-6 bg-gradient-to-b from-[#1a1412] to-black text-ivory text-center">
        <div className="max-w-5xl mx-auto py-28">
          <p className="label-uppercase text-gold mb-5">MCB™ LIVE</p>
          <h1 className="font-serif text-5xl md:text-7xl leading-tight mb-6">DJ RINALDI · LADY LAKH · TOGETHER</h1>
          <p className="text-xl md:text-2xl text-ivory/75 max-w-3xl mx-auto mb-10">We create the soundtrack to your memory — and, for selected events, we can be there to play it.</p>
          <div className="space-y-1 text-gold tracking-[0.18em] text-sm md:text-base font-medium"><p>CREATE THE MEMORY.</p><p>CREATE THE SONG.</p><p>BRING IT TO LIFE.</p></div>
          <a href="#enquire" className="inline-flex mt-12 px-8 py-3 bg-gold text-espresso rounded-full font-medium hover:bg-ivory transition">Request Availability</a>
        </div>
      </section>

      <section className="py-24 px-6"><div className="max-w-6xl mx-auto"><div className="text-center max-w-3xl mx-auto mb-14"><p className="label-uppercase text-gold mb-4">Choose Your Experience</p><h2 className="font-serif text-4xl md:text-5xl mb-5">Multi-genre DJs. Selected events worldwide.</h2><p className="text-espresso/65">Available individually or together for personal celebrations and professional venue, yacht, cruise and entertainment enquiries. Availability is always confirmed before a booking is accepted.</p></div><div className="grid md:grid-cols-3 gap-7">{[
        ["DJ RINALDI","Solo multi-genre DJ performance, with international cruise-ship DJ/Producer experience."],
        ["LADY LAKH","Solo multi-genre DJ performance for celebrations, private events and selected professional bookings."],
        ["DJ RINALDI × LADY LAKH","A joint MCB LIVE duo performance for selected private, destination, yacht, cruise and professional events."]
      ].map(([title,copy])=><article key={title} className="bg-white rounded-2xl border border-espresso/10 p-8 shadow-sm"><h3 className="font-serif text-2xl mb-4">{title}</h3><p className="text-espresso/65 leading-relaxed">{copy}</p><a href="#enquire" className="inline-block mt-7 text-gold font-medium">Request availability →</a></article>)}</div></div></section>

      <section className="py-24 px-6 bg-espresso text-ivory"><div className="max-w-4xl mx-auto text-center"><p className="label-uppercase text-gold mb-4">The Signature MCB Experience</p><h2 className="font-serif text-4xl md:text-5xl mb-7">The MCB Song Reveal Experience</h2><p className="text-ivory/75 text-lg leading-relaxed">Commission your personalised MCB song, then enquire about having DJ Rinaldi, Lady Lakh or both introduce and reveal it at your celebration before continuing into a live DJ performance. Designed for weddings, anniversaries, birthdays, vow renewals, family celebrations, cruises, destination events and other meaningful moments.</p></div></section>

      <section className="py-24 px-6"><div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12"><div><p className="label-uppercase text-gold mb-4">Worldwide Enquiries</p><h2 className="font-serif text-4xl mb-6">From private celebrations to yachts and cruises.</h2><p className="text-espresso/65 leading-relaxed mb-5">MCB LIVE welcomes enquiries from individuals, wedding and event clients, private yachts, cruise operators, hotels, resorts, venues and professional entertainment buyers worldwide.</p><p className="text-espresso/65 leading-relaxed">International availability depends on the DJs' current location, existing commitments, travel feasibility and logistics. Flights, accommodation, transfers, work permissions and other necessary travel costs are assessed before a quotation is confirmed.</p></div><div className="rounded-2xl bg-white border border-espresso/10 p-8"><h3 className="font-serif text-2xl mb-5">How booking works</h3><ol className="space-y-3 text-espresso/65"><li>1. Request availability</li><li>2. We review date, location, duration, budget and logistics</li><li>3. MCB confirms availability and prepares a quotation</li><li>4. Agreement and rider are issued</li><li>5. Deposit secures the confirmed booking</li><li>6. Balance and final event details are completed before the event</li></ol></div></div></section>

      <section id="enquire" className="py-24 px-6 bg-[#FBF9F6]"><div className="max-w-3xl mx-auto"><div className="text-center mb-10"><p className="label-uppercase text-gold mb-4">Request Availability</p><h2 className="font-serif text-4xl mb-5">Tell us about your event.</h2><p className="text-espresso/60">No payment is taken at this stage. Your enquiry opens WhatsApp with the details below ready to send directly to DJ Rinaldi.</p></div><form onSubmit={sendWhatsApp} className="bg-white rounded-3xl border border-espresso/10 shadow-sm p-7 md:p-10 space-y-6">
        <label className="block"><span className="text-sm">Who would you like?</span><select value={dj} onChange={e=>setDj(e.target.value)} className="mt-2 w-full border rounded-xl p-3"><option>DJ Rinaldi</option><option>Lady Lakh</option><option>DJ Rinaldi × Lady Lakh</option><option>Help me choose</option></select></label>
        <div className="grid md:grid-cols-2 gap-5"><label><span className="text-sm">Event type</span><input value={eventType} onChange={e=>setEventType(e.target.value)} placeholder="Wedding, yacht, cruise, private event…" className="mt-2 w-full border rounded-xl p-3" /></label><label><span className="text-sm">Event date</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="mt-2 w-full border rounded-xl p-3" /></label></div>
        <label className="block"><span className="text-sm">Venue / city / country</span><input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Where is the event?" className="mt-2 w-full border rounded-xl p-3" /></label>
        <div className="grid md:grid-cols-2 gap-5"><label><span className="text-sm">Performance duration</span><select value={duration} onChange={e=>setDuration(e.target.value)} className="mt-2 w-full border rounded-xl p-3"><option>1 hour</option><option>2 hours</option><option>3 hours</option><option>Extended event</option><option>Custom / to be discussed</option></select></label><label><span className="text-sm">Your approximate budget</span><input value={budget} onChange={e=>setBudget(e.target.value)} placeholder="e.g. £2,000 or USD 3,000" className="mt-2 w-full border rounded-xl p-3" /></label></div>
        <label className="block"><span className="text-sm">Would you like an MCB personalised song revealed at your event?</span><select value={reveal} onChange={e=>setReveal(e.target.value)} className="mt-2 w-full border rounded-xl p-3"><option>Yes</option><option>No</option><option>I already have an MCB song</option></select></label>
        <label className="block"><span className="text-sm">Anything else you would like us to know?</span><textarea value={details} onChange={e=>setDetails(e.target.value)} rows={5} placeholder="Event details, music, audience, special requests…" className="mt-2 w-full border rounded-xl p-3" /></label>
        <button type="submit" className="w-full px-8 py-4 bg-gold text-espresso rounded-full font-medium hover:bg-espresso hover:text-ivory transition">Message DJ Rinaldi on WhatsApp</button>
        <p className="text-xs text-espresso/50 text-center">An enquiry is not a confirmed booking. Availability, travel, logistics, quotation, agreement and deposit must be completed before confirmation.</p>
      </form></div></section>
    </main>
  </>;
};

export default MCBLive;
