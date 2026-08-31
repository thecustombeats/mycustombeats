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
 * so the number is usually a second or two behind the page. Polling covers
 * that gap; the delivered order confirmation carries the same number for
 * anyone who closes the tab first, so this is a convenience, not the only
 * way a customer ever learns their reference.
 */
const REFERENCE_POLL_INTERVAL_MS = 1500;
const REFERENCE_POLL_ATTEMPTS = 8;   // ~12 seconds

/** One summary row. Stacks on narrow screens so long values never squeeze. */
const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
    <dt className="text-sm uppercase tracking-[0.12em] text-ivory/80">{label}</dt>
    <dd className="text-lg font-medium text-ivory sm:text-right">{value}</dd>
  </div>
);

export default function ThankYou() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  /**
   * The customer-facing MCB reference — MCB-YYYY-NNNNNN.
   *
   * Read from the server, never derived here. It used to be built in the
   * browser as `MCB-` plus the last six characters of the Stripe session id,
   * which looked like a reference but was not one: nothing stored it, so a
   * customer who quoted it could not be found, and uppercasing a
   * case-sensitive id made two different sessions capable of showing the
   * same number.
   */
  const [reference, setReference] = useState<string | null>(null);
  const [referencePending, setReferencePending] = useState<boolean>(!!sessionId);
  /** Order status as MCB's own record reports it — not as Stripe's URL implies. */
  const [orderStatus, setOrderStatus] = useState<string | null>(null);

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
   * instead. Stating a figure the customer might not recognise on their bank
   * statement would be worse than stating none.
   */
  const amountPaid = orderedPackage
    ? orderedPackage.price.prefix
      ? "As agreed for your commission"
      : `£${orderedPackage.price.gbp}`
    : null;

  useEffect(() => {
    if (!sessionId) return;

    // Prevent duplicate purchase tracking per session/refresh
    const trackedKey = `mcb_tracked_${sessionId}`;
    if (sessionStorage.getItem(trackedKey)) return;

    // Price comes from the central package data so the analytics value can
    // never drift from the amount actually charged.
    if (!orderedPackage) return;

    trackPurchase(
      sessionId,
      orderedPackage.price.gbp,
      "GBP",
      orderedPackage.name
    );
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

  return (
   <>
     <Helmet>
       <title>Order received | My Custom Beats</title>
       <meta name="description" content="Your order is confirmed and our composers are reviewing your story." />
     </Helmet>

    {/*
      MVIS Midnight Ink, not pure black. `bg-black` was off-palette and, with
      body copy set in white at 40–60% opacity, read as uniformly dim. Every
      text colour below is a solid MVIS tone measured against this field:
      ivory 15.99:1, ivory/80 10.50:1, ivory/70 8.36:1, Heritage Gold 7.19:1,
      gold-light 9.17:1 — all comfortably past WCAG AA, most past AAA.
    */}
    <div className="min-h-screen bg-ink text-ivory">
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-6 sm:py-20">

        {/* 1 — Payment confirmed */}
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-sm font-semibold tracking-wide text-gold-light">
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            Payment successful
          </p>

          {/*
            text-ivory is explicit and load-bearing. index.css sets a base
            `h1..h6 { color: rgba(46,38,35,.9) }` — dark espresso for the ivory
            canvas — and an element rule beats a colour inherited from the
            wrapper, so an unpainted heading renders dark brown on this dark
            field. That is what made the old page's headline near-invisible.
          */}
          <h1 className="mt-6 text-ivory text-4xl font-light leading-tight tracking-wide sm:text-5xl">
            Your Song Is Now In Motion
          </h1>
        </div>

        {/* 2 + 3 — The reference. The primary information on this page. */}
        <section
          aria-labelledby="mcb-reference-label"
          className="mt-10 rounded-2xl border border-gold/30 bg-ivory/[0.07] p-6 text-center sm:p-8"
        >
          <h2
            id="mcb-reference-label"
            className="text-xs font-semibold uppercase tracking-[0.22em] text-ivory/80 sm:text-sm"
          >
            Your MCB Reference
          </h2>

          {reference ? (
            <>
              {/*
                Set in Manrope with tabular figures, not the display serif:
                this is a code to be read aloud and copied down, so character
                shapes matter more than elegance.

                The floor and the tracking are measured, not guessed. Inside
                this card a 320px screen leaves 232px of line; "MCB-2026-000001"
                at 28px with 0.04em tracking wants 272px, so it broke across
                two lines on the narrowest phones. At 24px with 0.02em it
                measures ~226px and holds one line from 320px upward.
              */}
              <p className="mt-3 font-sans font-semibold tabular-nums tracking-[0.02em] text-gold-light [font-size:clamp(1.5rem,7.5vw,3rem)]">
                {reference}
              </p>
              <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-ivory">
                Please keep this reference for all future correspondence with
                My Custom Beats.
              </p>
            </>
          ) : referencePending ? (
            <p className="mt-4 text-lg text-ivory/80" role="status" aria-live="polite">
              Confirming your payment and issuing your reference…
            </p>
          ) : (
            <p className="mx-auto mt-4 max-w-md text-base leading-relaxed text-ivory/80" role="status">
              Your reference is on its way and will be in your confirmation
              email. Your payment is complete and nothing is outstanding.
            </p>
          )}
        </section>

        {/* 4, 5, 6 — Order, amount, payment status */}
        {(orderedPackage || paymentStatus) && (
          <dl className="mt-8 divide-y divide-ivory/15 overflow-hidden rounded-2xl border border-ivory/20">
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

        {/* 7 — What happens next */}
        <section className="mt-8 rounded-2xl border border-ivory/20 p-6 sm:p-8">
          <h2 className="text-xl tracking-wide text-gold-light">
            What Happens Next
          </h2>

          <ul className="mt-5 space-y-3 text-ivory/90">
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
            className="rounded-lg border border-ivory/40 px-8 py-3 text-center font-medium transition hover:bg-ivory/10"
          >
            Return Home
          </Link>

          <a
            href="mailto:support@mycustombeats.com"
            className="rounded-lg border border-ivory/40 px-8 py-3 text-center font-medium transition hover:bg-ivory/10"
          >
            Contact Support
          </a>
        </div>

        {/* Upload */}
        <div className="mt-10 space-y-4 text-center">
          <p className="text-base text-ivory/80">
            If you forgot to include photos, artwork, or voice notes, you can
            securely send them to us here.
          </p>

          {/* `/submit-memories` was never a registered route, so this button
              used to lead nowhere. Point it at the contact section until an
              upload page exists. */}
          <a
            href="/#contact"
            className="inline-block rounded-md bg-gold px-8 py-3 font-semibold text-ink transition hover:bg-gold-light"
          >
            Send Photos, Memories or Voice Notes
          </a>
        </div>

        <p className="mt-12 text-center text-sm text-ivory/70">
          MyCustomBeats • Turning memories into music
        </p>

      </div>
    </div>
   </>
  );
}
