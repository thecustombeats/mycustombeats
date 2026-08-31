import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

  // What the customer just bought, carried over from the order form.
  const orderedPackage = getPackage(
    localStorage.getItem("last_order_package") || ""
  );
  const orderedFormat = localStorage.getItem("last_order_format") || "";
  const formatName =
    orderedFormat && orderedFormat in FORMATS
      ? FORMATS[orderedFormat as FormatId].name
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

  return (
   <>
     <Helmet>
       <title>Order received | My Custom Beats</title>
       <meta name="description" content="Your order is confirmed and our composers are reviewing your story." />
     </Helmet>

   <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
  <div className="max-w-2xl text-center">

    {/* Title */}
    <h1 className="text-5xl font-light tracking-wide">
      Your Song Is Now In Motion
    </h1>

    {/* Order Section */}
    <div className="mt-8 space-y-2">

      {reference && (
        <p className="text-gold text-lg">
          Order Reference: {reference}
        </p>
      )}

      {!reference && referencePending && (
        <p className="text-white/60 text-lg">
          Confirming your payment and issuing your order reference…
        </p>
      )}

      {reference ? (
        <p className="text-white/60 text-sm">
          Please save this reference and quote it in any correspondence with us.
        </p>
      ) : (
        <p className="text-white/60 text-sm">
          Your order reference is on its way — it will be in your confirmation
          email. Your payment is complete and nothing is outstanding.
        </p>
      )}

      {orderedPackage && (
        <p className="text-white/80 pt-4">
          {orderedPackage.name}
          {formatName && <> — {formatName}</>}
          <span className="block text-white/50 text-sm mt-1">
            {orderedPackage.delivery}
          </span>
        </p>
      )}

    </div>

    {/* Thank You Text */}
    <p className="text-lg text-white/80 mt-8 mb-14">
      Thank you for trusting us with your story. Your order has been
      received and our composers will begin reviewing your submission.
    </p>

    {/* What Happens Next */}
    <div className="bg-white/5 border border-white/10 rounded-xl p-8 mb-12">

      <h2 className="text-xl mb-6 text-gold tracking-wide">
        What Happens Next
      </h2>

      <div className="space-y-4 text-white/70">

        <p>✨ Our creative team reviews your story and inspiration.</p>

        <p>🎼 Your custom composition begins within 24 hours.</p>

        <p>📩 We may reach out if we need a few more details.</p>

        <p>
          🎧 Your finished song will be delivered according to your
          selected package timeline.
        </p>

      </div>

    </div>

    {/* Support Buttons */}
    <div className="flex justify-center gap-4 flex-wrap mb-12">

      <Link
        to="/"
        className="border border-white/20 px-8 py-3 rounded-lg hover:bg-white/10 transition"
      >
        Return Home
      </Link>

      <a
        href="mailto:support@mycustombeats.com"
        className="border border-white/20 px-8 py-3 rounded-lg hover:bg-white/10 transition"
      >
        Contact Support
      </a>

    </div>

    {/* Upload Section */}
    <div className="space-y-4">

      <p className="text-white/70 text-sm">
        If you forgot to include photos, artwork, or voice notes,
you can securely upload them here using your order session.
      </p>

      {/* `/submit-memories` was never a registered route, so this button
          used to lead nowhere. Point it at the contact section until an
          upload page exists. */}
      <a
        href="/#contact"
        className="inline-block bg-gold text-ink px-8 py-3 rounded-md font-medium hover:opacity-90 transition"
      >
        Send Photos, Memories or Voice Notes
      </a>

    </div>

    {/* Footer */}
    <p className="text-xs text-white/40 mt-12">
      MyCustomBeats • Turning memories into music
    </p>

  </div>
</div>
   </>
  );
}