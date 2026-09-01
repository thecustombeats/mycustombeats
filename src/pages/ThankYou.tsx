import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { trackPurchase } from "../lib/analytics";
import { getPackage, FORMATS, type FormatId } from "../data/packages";
import { Helmet } from "react-helmet-async";

/**
 * How long to wait for the MCB reference to appear.
 *
 * The reference is issued by MCB's server when Stripe's webhook confirms the
 * payment. That call and this redirect race, and the redirect normally wins,
 * so the number is usually a second or two behind the page.
 */
const REFERENCE_POLL_INTERVAL_MS = 1500;
const REFERENCE_POLL_ATTEMPTS = 8;   // ~12 seconds

/**
 * The last reference this browser was shown.
 *
 * Stripe's receipt email carries Stripe's own receipt number, not MCB's
 * reference, so a customer who closes this tab has no other way back to their
 * number today. Remembering it here is not a substitute for sending it — it
 * is device-local and disappears if they clear their browser — but it means
 * returning to /thank-you on the same device still answers the question.
 */
const STORED_REFERENCE_KEY = "mcb_last_reference";

/**
 * COLOUR CONTRACT FOR THIS PAGE
 *
 * index.css sets base element rules for the ivory canvas the rest of the site
 * uses — `h1..h6 { color: rgba(46,38,35,.9) }` and `p { color:
 * rgba(46,38,35,.65) }`. An element rule beats a colour inherited from a
 * wrapper, so on this dark page ANY heading or paragraph left unpainted
 * renders dark espresso on Midnight Ink and is effectively invisible. That is
 * exactly what production showed.
 *
 * So every heading and every <p> below carries an explicit colour. Hierarchy
 * is built from size, weight and letter-spacing rather than opacity: no
 * essential copy on this page is a faded white.
 */
const TEXT_PRIMARY = "text-ivory";        // 15.99:1 on Midnight Ink
const TEXT_ACCENT = "text-gold";          //  7.19:1 — Heritage Gold, accent only

/** One summary row. Stacks on narrow screens so long values never squeeze. */
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
    <dt className={`text-sm font-semibold uppercase tracking-[0.14em] ${TEXT_PRIMARY}`}>
      {label}
    </dt>
    <dd className="text-lg font-semibold text-white sm:text-right">{value}</dd>
  </div>
);

export default function ThankYou() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  /**
   * The customer-facing MCB reference — MCB-YYYY-NNNNNN.
   *
   * Read from the server, never derived here. It is not Stripe's receipt
   * number, not the Stripe session id, and not an internal database id.
   */
  const [reference, setReference] = useState<string | null>(null);
  const [referencePending, setReferencePending] = useState<boolean>(!!sessionId);
  /** Order status as MCB's own record reports it — not as Stripe's URL implies. */
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

  /**
   * Shown only to a visitor arriving WITHOUT a session id — someone returning
   * to the page later. When a session id is present the server is the only
   * acceptable answer, because a remembered number could belong to a
   * different order than the one just paid for.
   */
  const [storedReference] = useState<string | null>(() => {
    if (sessionId) return null;
    try {
      return localStorage.getItem(STORED_REFERENCE_KEY);
    } catch {
      return null;
    }
  });

  // What the customer just bought, carried over from the order form.
  const orderedPackage = getPackage(
    localStorage.getItem("last_order_package") || ""
  );
  const orderedFormat = localStorage.getItem("last_order_format") || "";
  const formatName =
    orderedFormat && orderedFormat in FORMATS
      ? FORMATS[orderedFormat as FormatId].name
      : null;

  /**
   * What the customer paid, from the same authoritative package data the
   * checkout price and the analytics value come from.
   *
   * Open-ended commissions price as "From £799", which is a starting point
   * and not a sum anyone was charged, so those show the agreed-price wording
   * instead of asserting a figure the customer would not recognise on their
   * statement.
   */
  const amountPaid = orderedPackage
    ? orderedPackage.price.prefix
      ? "As agreed for your commission"
      : `£${orderedPackage.price.gbp.toFixed(2)}`
    : null;

  useEffect(() => {
    if (!sessionId) return;

    // Prevent duplicate purchase tracking per session/refresh
    const trackedKey = `mcb_tracked_${sessionId}`;
    if (sessionStorage.getItem(trackedKey)) return;

    // Price comes from the central package data so the analytics value can
    // never drift from the amount actually charged.
    if (!orderedPackage) return;

    trackPurchase(sessionId, orderedPackage.price.gbp, "GBP", orderedPackage.name);
    sessionStorage.setItem(trackedKey, "true");
  }, [sessionId, orderedPackage]);

  // Ask MCB's own record for the reference belonging to this checkout
  // session, retrying while the payment webhook lands. Aborts on unmount so a
  // customer who navigates away leaves no timer running.
  useEffect(() => {
    if (!sessionId) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async (attempt: number): Promise<void> => {
      try {
        const response = await fetch(
          `/api/order-reference?session_id=${encodeURIComponent(sessionId)}`
        );
        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          if (typeof data?.status === "string") {
            setOrderStatus(data.status);
          }
          if (typeof data?.reference === "string" && data.reference !== "") {
            setReference(data.reference);
            setReferencePending(false);
            try {
              localStorage.setItem(STORED_REFERENCE_KEY, data.reference);
            } catch {
              // Private browsing or blocked storage. Nothing here is essential.
            }
            return;
          }
        }
      } catch {
        // A lookup failure is not a payment failure. Fall through and retry;
        // giving up simply shows the fallback message below.
      }

      if (cancelled) return;
      if (attempt >= REFERENCE_POLL_ATTEMPTS) {
        setReferencePending(false);
        return;
      }
      timer = setTimeout(() => void poll(attempt + 1), REFERENCE_POLL_INTERVAL_MS);
    };

    void poll(1);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sessionId]);

  /**
   * A reference is only ever issued to an order Stripe has confirmed paid, so
   * its presence is itself proof of payment. The server's own status is
   * preferred where it answered, rather than inferring from the URL.
   */
  const paymentStatus =
    orderStatus === "PAID" || reference ? "Paid" : orderStatus ? "Processing" : null;

  const shownReference = reference ?? storedReference;
  const isRemembered = !reference && !!storedReference;

  return (
   <>
     <Helmet>
       <title>Order received | My Custom Beats</title>
       <meta name="description" content="Your order is confirmed and our composers are reviewing your story." />
     </Helmet>

    {/* MVIS Midnight Ink, never bg-black. */}
    <div className="min-h-screen bg-ink">
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-6 sm:py-20">

        {/* 1 — Payment confirmed */}
        <div className="text-center">
          <p className={`inline-flex items-center gap-2 rounded-full border border-gold bg-gold/15 px-4 py-1.5 text-sm font-bold tracking-wide ${TEXT_ACCENT}`}>
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            Payment confirmed
          </p>

          <h1 className={`mt-6 text-4xl font-light leading-tight tracking-wide sm:text-5xl ${TEXT_PRIMARY}`}>
            Your Song Is Now In Motion
          </h1>
        </div>

        {/* 2 — The MCB reference. The dominant element on this page. */}
        <section
          aria-labelledby="mcb-reference-label"
          className="mt-10 rounded-2xl border-2 border-gold bg-white/[0.06] p-5 text-center sm:p-8"
        >
          <h2
            id="mcb-reference-label"
            className={`text-xs font-bold uppercase tracking-[0.22em] sm:text-sm ${TEXT_PRIMARY}`}
          >
            Your MCB Reference
          </h2>

          {shownReference ? (
            <>
              {/*
                Set in Manrope with tabular figures, not the display serif:
                this is a code to be read aloud and copied down, so character
                shapes matter more than elegance. `select-all` makes one tap
                or click select the whole reference on a phone.

                The floor and the tracking are measured, not guessed. Inside
                this card a 320px screen leaves 232px of line; the reference
                at 28px with 0.04em tracking wants 272px, so it broke across
                two lines on the narrowest phones. At 24px with 0.02em it
                measures ~230px. The card drops to 20px padding below `sm`
                purely to widen that margin from 2px to 10px, so font loading
                or subpixel rounding cannot tip it onto a second line.
              */}
              <p className={`mt-3 select-all font-sans font-bold tabular-nums tracking-[0.02em] ${TEXT_ACCENT} [font-size:clamp(1.5rem,7.5vw,3rem)]`}>
                {shownReference}
              </p>

              <p className={`mx-auto mt-5 max-w-md text-base font-medium leading-relaxed ${TEXT_PRIMARY}`}>
                Please keep this reference for all future correspondence with
                My Custom Beats.
              </p>

              {isRemembered && (
                <p className={`mt-3 text-sm ${TEXT_PRIMARY}`}>
                  This is the most recent reference issued on this device.
                </p>
              )}
            </>
          ) : referencePending ? (
            <p className={`mt-4 text-lg ${TEXT_PRIMARY}`} role="status" aria-live="polite">
              Confirming your payment and issuing your reference…
            </p>
          ) : (
            <p className={`mx-auto mt-4 max-w-md text-base leading-relaxed ${TEXT_PRIMARY}`} role="status">
              Your reference is on its way. Your payment is complete and
              nothing is outstanding — contact us and we will confirm it.
            </p>
          )}
        </section>

        {/* 3, 4, 5 — Order, amount paid, payment status */}
        {(orderedPackage || paymentStatus) && (
          <dl className="mt-8 divide-y divide-white/20 overflow-hidden rounded-2xl border border-white/25">
            {orderedPackage && (
              <DetailRow
                label="Order"
                value={`${orderedPackage.name}${formatName ? ` — ${formatName}` : ""}`}
              />
            )}
            {amountPaid && <DetailRow label="Amount paid" value={amountPaid} />}
            {paymentStatus && <DetailRow label="Payment" value={paymentStatus} />}
          </dl>
        )}

        {/* 6 — What happens next */}
        <section className="mt-8 rounded-2xl border border-white/25 p-6 sm:p-8">
          <h2 className={`text-xl font-semibold tracking-wide ${TEXT_ACCENT}`}>
            What happens next
          </h2>

          <ul className={`mt-5 space-y-3 text-base leading-relaxed ${TEXT_PRIMARY}`}>
            <li>Our creative team reviews your story and inspiration.</li>
            <li>Your custom composition begins within 24 hours.</li>
            <li>We may reach out if we need a few more details.</li>
            <li>
              {orderedPackage
                ? `${orderedPackage.delivery}.`
                : "Your finished song is delivered on your package timeline."}
            </li>
          </ul>
        </section>

        {/* Support */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className={`rounded-lg border border-white/50 px-8 py-3 text-center font-semibold transition hover:bg-white/10 ${TEXT_PRIMARY}`}
          >
            Return Home
          </Link>

          <a
            href="mailto:support@mycustombeats.com"
            className={`rounded-lg border border-white/50 px-8 py-3 text-center font-semibold transition hover:bg-white/10 ${TEXT_PRIMARY}`}
          >
            Contact Support
          </a>
        </div>

        {/* Upload */}
        <div className="mt-10 space-y-4 text-center">
          <p className={`text-base ${TEXT_PRIMARY}`}>
            If you forgot to include photos, artwork, or voice notes, you can
            securely send them to us here — quote your MCB reference.
          </p>

          {/* `/submit-memories` was never a registered route, so this button
              used to lead nowhere. Point it at the contact section until an
              upload page exists. */}
          <a
            href="/#contact"
            className="inline-block rounded-md bg-gold px-8 py-3 font-bold text-ink transition hover:bg-gold-light"
          >
            Send Photos, Memories or Voice Notes
          </a>
        </div>

        <p className={`mt-12 text-center text-sm ${TEXT_PRIMARY}`}>
          MyCustomBeats • Turning memories into music
        </p>

      </div>
    </div>
   </>
  );
}
