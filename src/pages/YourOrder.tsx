import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { DAMAGE_GUIDANCE, DAMAGE_GUIDANCE_NOT_A_CONDITION, SEPARATE_PARCELS_NOTE } from "../data/legal/delivery";
import { CUSTOMER_STAGES } from "../data/operations";
import VideoSection from "./order/VideoSection";
import SupportSection from "./order/SupportSection";
import {
  LinkError,
  fetchProgress,
  formatDay,
  safeExternalUrl,
  tokenFromHash,
  type OrderProgress,
} from "../lib/customerOrder";

/**
 * /your-order#<link> — the customer's private order page.
 *
 * Plain English, the stages that apply to what they bought, tracking MCB has
 * recorded, and a way to tell MCB if something is wrong. Nothing here asks the
 * customer to understand a status code, and a Moment never mentions making or
 * posting anything.
 */

const card = "rounded-3xl border border-ink/10 bg-white p-6 md:p-8";
const button =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";

const YourOrder = () => {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [progress, setProgress] = useState<OrderProgress | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This link is incomplete. Please open the link from our email again.");

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchProgress(token)
      .then((result) => !cancelled && setProgress(result))
      .catch((e) => !cancelled && setError(e instanceof LinkError ? e.message : "We couldn't load your order just now. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [token]);

  /** After the customer writes to MCB, the page shows the conversation as it now stands. */
  const reload = useCallback(() => {
    if (!token) return;
    fetchProgress(token).then(setProgress).catch(() => undefined);
  }, [token]);

  const definitions = progress ? CUSTOMER_STAGES[progress.workflow] : [];
  const tracking = safeExternalUrl(progress?.delivery?.tracking_url ?? null);

  return (
    <div className="min-h-screen bg-ivory px-5 pb-20 pt-28 text-espresso sm:px-8 md:pt-36">
      <Helmet>
        <title>Your order | My Custom Beats</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <p className="label-uppercase text-gold-deep">Your order</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-ink md:text-5xl">
            {progress ? "Here is where your order has got to." : "Your order"}
          </h1>
          {progress && (
            <p className="mt-4 text-lg">
              Reference: <span className="font-mono font-semibold text-ink">{progress.reference}</span>
            </p>
          )}
        </header>

        {error && (
          <div role="alert" className={card}>
            <p className="text-lg leading-relaxed">{error}</p>
            <p className="mt-4 text-base">
              You can also email <a className="font-semibold text-ink underline" href="mailto:hello@mycustombeats.com">hello@mycustombeats.com</a>.
            </p>
          </div>
        )}

        {!progress && !error && <p className="text-lg" role="status">Loading your order…</p>}

        {progress && (
          <>
            <section className={card} aria-labelledby="order-items">
              <h2 id="order-items" className="font-serif text-2xl text-ink">What you ordered</h2>
              <ul className="m-0 mt-4 list-none space-y-2 p-0 text-lg">
                {progress.lines.map((line) => (
                  <li key={line.name}>{line.quantity > 1 ? `${line.quantity} × ` : ""}{line.name}</li>
                ))}
              </ul>
            </section>

            {progress.reveal && safeExternalUrl(progress.reveal.url) && (
              <section className="rounded-3xl border-2 border-gold-dark bg-ink p-6 text-ivory md:p-8" aria-labelledby="order-reveal">
                <p className="label-uppercase !text-gold">The reveal</p>
                <h2 id="order-reveal" className="mt-2 font-serif text-3xl !text-ivory">Your MCB creation is ready</h2>
                <p className="mt-3 text-lg leading-relaxed text-ivory/90">You gave us the memories. We created the surprise. Find a quiet moment, and press play.</p>
                <a href={safeExternalUrl(progress.reveal.url) ?? undefined} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-8 py-3 text-base font-semibold text-ink hover:bg-[#d8b35e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
                  Experience your creation<span className="sr-only"> (opens in a new window)</span>
                </a>
              </section>
            )}

            <VideoSection token={token as string} progress={progress} />

            <section className={card} aria-labelledby="order-progress">
              <h2 id="order-progress" className="font-serif text-2xl text-ink">Progress</h2>
              <ol className="m-0 mt-6 list-none space-y-5 p-0">
                {progress.stages.map((stage) => {
                  const definition = definitions.find((d) => d.id === stage.id);
                  if (!definition) return null;
                  return (
                    <li key={stage.id} className="flex gap-4" aria-current={stage.status === "current" ? "step" : undefined}>
                      <span
                        aria-hidden="true"
                        className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                          stage.status === "done" ? "border-ink bg-ink text-ivory" : stage.status === "current" ? "border-gold-dark bg-gold/20" : "border-ink/20"
                        }`}
                      >
                        {stage.status === "done" && <Check size={18} />}
                      </span>
                      <div>
                        <p className={`text-lg ${stage.status === "upcoming" ? "text-espresso/75" : "font-semibold text-ink"}`}>
                          {definition.title}
                          <span className="sr-only">{stage.status === "done" ? " — done" : stage.status === "current" ? " — happening now" : " — still to come"}</span>
                        </p>
                        {stage.status === "current" && <p className="mt-1 text-base leading-relaxed">{definition.description}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            {progress.parcels && progress.parcels.length > 1 && (
              <section className={card} aria-labelledby="order-parcels-list">
                <h2 id="order-parcels-list" className="font-serif text-2xl text-ink">Your parcels</h2>
                <p className="mt-3 text-base leading-relaxed">Your order is arriving in more than one parcel. That's expected — we're coordinating each one for you.</p>
                <ul className="m-0 mt-4 list-none space-y-4 p-0">
                  {progress.parcels.map((parcel) => {
                    const link = safeExternalUrl(parcel.tracking_url);
                    return (
                      <li key={parcel.number} className="rounded-2xl border border-ink/10 p-4">
                        <p className="text-lg font-semibold text-ink">Parcel {parcel.number}: {parcel.status === "DELIVERED" ? "Delivered" : parcel.status === "ON_THE_WAY" ? "On its way" : "Being made"}</p>
                        <p className="mt-1 text-base">
                          {[parcel.carrier, parcel.tracking_reference ? `tracking ${parcel.tracking_reference}` : null, parcel.dispatched_on ? `sent ${formatDay(parcel.dispatched_on)}` : null, parcel.delivered_on ? `delivered ${formatDay(parcel.delivered_on)}` : null].filter(Boolean).join(" · ")}
                        </p>
                        {link && parcel.status !== "DELIVERED" && (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-ink underline">
                            Track parcel {parcel.number}<span className="sr-only"> (opens in a new window)</span>
                          </a>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {progress.delivery && !(progress.parcels && progress.parcels.length > 1) && (
              <section className={card} aria-labelledby="order-delivery">
                <h2 id="order-delivery" className="font-serif text-2xl text-ink">Delivery</h2>
                <dl className="m-0 mt-4 space-y-3 text-lg">
                  {progress.delivery.carrier && <div><dt className="inline font-semibold">Carrier: </dt><dd className="inline m-0">{progress.delivery.carrier}</dd></div>}
                  {progress.delivery.tracking_reference && <div><dt className="inline font-semibold">Tracking reference: </dt><dd className="inline m-0 font-mono">{progress.delivery.tracking_reference}</dd></div>}
                  {progress.delivery.dispatched_on && <div><dt className="inline font-semibold">Sent: </dt><dd className="inline m-0">{formatDay(progress.delivery.dispatched_on)}</dd></div>}
                  {progress.delivery.delivered_on && <div><dt className="inline font-semibold">Delivered: </dt><dd className="inline m-0">{formatDay(progress.delivery.delivered_on)}</dd></div>}
                </dl>
                {tracking && (
                  <a href={tracking} target="_blank" rel="noopener noreferrer" className={`${button} mt-6`}>
                    Track your delivery<span className="sr-only"> (opens in a new window)</span>
                  </a>
                )}
              </section>
            )}

            {progress.workflow === "PHYSICAL" && (
              <section className={card} aria-labelledby="order-parcels">
                <h2 id="order-parcels" className="font-serif text-2xl text-ink">When your parcel arrives</h2>
                <p className="mt-3 text-lg leading-relaxed">{DAMAGE_GUIDANCE}</p>
                <p className="mt-3 text-base leading-relaxed text-espresso/80">{DAMAGE_GUIDANCE_NOT_A_CONDITION}</p>
                <p className="mt-3 text-base leading-relaxed text-espresso/80">{SEPARATE_PARCELS_NOTE}</p>
              </section>
            )}

            <SupportSection token={token as string} progress={progress} onChanged={reload} />

            <p className="text-base text-espresso/80">
              Need anything else? Email <a className="font-semibold text-ink underline" href="mailto:hello@mycustombeats.com">hello@mycustombeats.com</a> or see our <Link className="font-semibold text-ink underline" to="/faq">FAQ</Link>.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default YourOrder;
