import { useEffect } from "react";
import { Link } from "react-router-dom";
import { trackPurchase } from "../lib/analytics";
import { getPackage, FORMATS, type FormatId } from "../data/packages";

export default function ThankYou() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get("session_id");

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
    if (!orderId) return;

    // Prevent duplicate purchase tracking per session/refresh
    const trackedKey = `mcb_tracked_${orderId}`;
    if (sessionStorage.getItem(trackedKey)) return;

    // Price comes from the central package data so the analytics value can
    // never drift from the amount actually charged.
    if (!orderedPackage) return;

    trackPurchase(
      orderId,
      orderedPackage.price.gbp,
      "GBP",
      orderedPackage.name
    );
    sessionStorage.setItem(trackedKey, "true");
  }, [orderId, orderedPackage]);

  return (

   <div className="min-h-screen bg-black text-white flex items-center justify-center px-6">
  <div className="max-w-2xl text-center">

    {/* Title */}
    <h1 className="text-5xl font-light tracking-wide">
      Your Song Is Now In Motion
    </h1>

    {/* Order Section */}
    <div className="mt-8 space-y-2">

      {orderId && (
        <p className="text-gold text-lg">
          Order Number: MCB-{orderId.slice(-6).toUpperCase()}
        </p>
      )}

      <p className="text-white/60 text-sm">
        Please save your order number for future communication.
      </p>

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
  );
}