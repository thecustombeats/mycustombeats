import { useEffect, useId, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { Check } from "lucide-react";
import { DAMAGE_GUIDANCE, DAMAGE_GUIDANCE_NOT_A_CONDITION, SEPARATE_PARCELS_NOTE } from "../data/legal/delivery";
import { CUSTOMER_STAGES } from "../data/operations";
import {
  LinkError,
  fetchProgress,
  formatDay,
  safeExternalUrl,
  sendSupportRequest,
  tokenFromHash,
  type OrderProgress,
  type SupportKind,
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
const label = "block text-base font-semibold text-ink";
const field =
  "mt-2 w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";
const button =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";

const ReportProblem = ({ token, progress }: { token: string; progress: OrderProgress }) => {
  const ids = useId();
  const physical = progress.workflow === "PHYSICAL";
  const [kind, setKind] = useState<SupportKind>(physical ? "DAMAGED_OR_FAULTY" : "QUESTION");
  const [item, setItem] = useState(progress.items[0]?.key ?? "");
  const [priority, setPriority] = useState(false);
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const chosen = progress.items.find((i) => i.key === item);
  const offersPriority = physical && kind === "DAMAGED_OR_FAULTY" && chosen?.priority_replacement;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (description.trim().length < 10) {
      setError("Please tell us a little more (at least 10 characters).");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await sendSupportRequest(token, {
        kind,
        ...(physical && kind !== "QUESTION" && item ? { item } : {}),
        ...(offersPriority ? { priorityReplacement: priority } : {}),
        description: description.trim(),
      });
      setDone(result.message);
    } catch (e) {
      setError(e instanceof LinkError ? Object.values(e.fields)[0] ?? e.message : "We couldn't send that just now. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div role="status" className={card}>
        <h2 className="font-serif text-2xl text-ink">Thank you</h2>
        <p className="mt-3 text-lg leading-relaxed">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-6`} aria-labelledby={`${ids}-heading`}>
      <h2 id={`${ids}-heading`} className="font-serif text-2xl text-ink">
        {physical ? "Something wrong, or a question?" : "Have a question?"}
      </h2>
      {physical && (
        <fieldset>
          <legend className={label}>What is it about?</legend>
          <div className="mt-3 grid gap-3">
            {([
              ["DAMAGED_OR_FAULTY", "Something arrived damaged or faulty"],
              ["DELIVERY_PROBLEM", "A problem with delivery"],
              ["QUESTION", "A question"],
            ] as const).map(([value, text]) => (
              <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-base text-ink ${kind === value ? "border-gold-dark bg-gold/10" : "border-ink/15"}`}>
                <input type="radio" name={`${ids}-kind`} value={value} checked={kind === value} onChange={() => setKind(value)} className="h-5 w-5 accent-[#856823]" />
                {text}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {physical && kind !== "QUESTION" && progress.items.length > 0 && (
        <div>
          <label htmlFor={`${ids}-item`} className={label}>Which item?</label>
          <select id={`${ids}-item`} value={item} onChange={(e) => setItem(e.target.value)} className={field}>
            {progress.items.map((i) => (
              <option key={i.key} value={i.key}>{i.name}</option>
            ))}
          </select>
        </div>
      )}
      {offersPriority && (
        <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-ink/15 px-4 py-3 text-base text-ink">
          <input type="checkbox" checked={priority} onChange={(e) => setPriority(e.target.checked)} className="mt-1 h-5 w-5 accent-[#856823]" />
          <span>
            Request MCB Priority Replacement for this item
            {chosen?.priority_replacement?.request_by && (
              <span className="block text-espresso/75">Requests for this service can be made until {formatDay(chosen.priority_replacement.request_by)}.</span>
            )}
          </span>
        </label>
      )}
      <div>
        <label htmlFor={`${ids}-description`} className={label}>Tell us what happened</label>
        <textarea id={`${ids}-description`} rows={5} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={field} aria-describedby={`${ids}-help`} />
        <p id={`${ids}-help`} className="mt-2 text-base text-espresso/75">
          {physical ? "If something is damaged, we may ask you for a photo by email. " : ""}We will reply by email.
        </p>
      </div>
      {physical && (
        <p className="text-base leading-relaxed text-espresso/80">Your normal consumer rights are not affected, whether or not you chose MCB Priority Replacement.</p>
      )}
      {error && <p role="alert" className="rounded-xl bg-[#FDECEC] px-4 py-3 text-base font-semibold text-[#9B2C2C]">{error}</p>}
      <button type="submit" disabled={sending} className={button}>{sending ? "Sending…" : "Send"}</button>
    </form>
  );
};

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

            {progress.awaiting_your_approval && (
              <section className="rounded-3xl border-2 border-gold-dark bg-gold/10 p-6 md:p-8" aria-labelledby="order-approval">
                <h2 id="order-approval" className="font-serif text-2xl text-ink">Your music is ready for you</h2>
                <p className="mt-3 text-lg leading-relaxed">We have emailed you a private link to listen and tell us what you think. If you can't find it, reply to any of our emails and we'll send it again.</p>
              </section>
            )}

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

            {progress.delivery && (
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

            {progress.open_requests > 0 && (
              <p className="text-lg" role="status">We have your message and will reply by email.</p>
            )}

            <ReportProblem token={token as string} progress={progress} />

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
