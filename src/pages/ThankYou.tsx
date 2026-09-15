import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Clock, HelpCircle } from "lucide-react";
import { getVariant } from "../data/catalogue";
import { trackFunnel, trackPurchase, type ConfirmedPurchase } from "../lib/analytics";
import { Helmet } from "react-helmet-async";
import ShareMcb from "../components/ShareMcb";
import { SAVED_ORDER_KEY } from "../lib/orderApi";
import { DRAFT_STORAGE_KEY } from "../lib/personalisation";

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
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS PAGE MAY AND MAY NOT ASSERT
 * ─────────────────────────────────────────────────────────────────────────
 * This page told every visitor "Payment confirmed", and filled an "Order" and
 * an "Amount paid" row from `localStorage`. Production verification proved the
 * consequence: a fabricated `session_id` produced a page reading "Payment
 * confirmed" with an order name and an amount paid. Nothing had been paid.
 *
 * Two separate faults produced that. Both are closed here.
 *
 *   1. Browser-remembered order values say what this DEVICE last built in the
 *      order form — not what anyone paid for, not that anyone paid at all.
 *      This page no longer reads them for anything. Even the analytics
 *      purchase event now takes its value and lines from MCB's server.
 *
 *   2. When the reference lookup gave up, the page asserted success anyway.
 *      Every outcome now maps to one of four states, and only ONE of them may
 *      use the word confirmed.
 *
 * `VERIFIED` is reached solely by MCB's own server returning a reference for
 * the session id in the address bar. A reference is minted only inside the
 * paid transaction of a signature-verified Stripe webhook, so its presence is
 * itself the proof of payment — and it is the only proof this page accepts.
 *
 * The server cannot distinguish a fabricated session id from a real payment
 * whose webhook is three seconds late: it learns of a session only when the
 * webhook arrives, and asking Stripe directly would create a second source of
 * payment truth. So the honest distinction is time, not certainty — PENDING
 * while the retries run, UNVERIFIED once they are spent. Neither claims
 * payment, which is what makes guessing unnecessary.
 */
type Verification = "NO_SESSION" | "PENDING" | "VERIFIED" | "UNVERIFIED";

/** Web storage throws in some privacy modes. Nothing here is essential. */
const readLocal = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * The confirmed purchase from `/api/order-reference`, or null.
 *
 * The server sends it only for a PAID order with integer line amounts (null
 * for unpaid and legacy orders). Anything that does not have exactly that
 * shape is treated as absent, so a malformed response reports no revenue
 * rather than a wrong figure.
 */
const parsePurchase = (raw: unknown, reference: string): ConfirmedPurchase | null => {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const currency = typeof data.currency === "string" ? data.currency.toUpperCase() : "";
  if (currency !== "GBP" || !Number.isSafeInteger(data.value_minor) || !Array.isArray(data.items)) {
    return null;
  }
  const items: ConfirmedPurchase["items"][number][] = [];
  for (const entry of data.items as unknown[]) {
    if (!entry || typeof entry !== "object") return null;
    const line = entry as Record<string, unknown>;
    if (
      typeof line.sku !== "string" ||
      typeof line.product_id !== "string" ||
      !Number.isSafeInteger(line.quantity) ||
      !Number.isSafeInteger(line.unit_minor)
    ) {
      return null;
    }
    items.push({
      sku: line.sku,
      productId: line.product_id,
      name: typeof line.name === "string" ? line.name : line.sku,
      category: typeof line.category === "string" ? line.category : "",
      quantity: line.quantity as number,
      unitMinor: line.unit_minor as number,
    });
  }
  return { transactionId: reference, valueMinor: data.value_minor as number, currency: "GBP", items };
};

/**
 * What happens next, for what was actually paid for.
 *
 * Chosen from the SERVER's confirmed purchase, never from anything this device
 * remembers. A Moment keeps the fast promise the catalogue already makes for
 * it (revealed once quality-checked). A Keepsake or Journey is made
 * to order, so this page gives no timeline for it: MCB keeps the customer
 * updated instead. Until the purchase is confirmed, the wording is general.
 */
const nextSteps = (purchase: ConfirmedPurchase | null): string[] => {
  const products = new Set(purchase?.items.map((item) => item.productId) ?? []);
  const help = "There's nothing more you need to do — we'll only be in touch if something we need is missing.";
  if (products.has("journey")) {
    return ["Personalised production has begun. We'll create your Journey, check every detail, and your record will arrive as the reveal.", help];
  }
  if (products.has("keepsake")) {
    return ["Personalised production has begun. We'll create your music and artwork, check every detail, and your Keepsake will arrive as the reveal.", help];
  }
  if (products.has("moment")) {
    return [
      "We've received your story, and we're now creating your Moment.",
      "Once it has passed our quality check, we'll email you a private link to experience the reveal.",
      help,
    ];
  }
  return ["Personalised production has begun. We'll keep you updated as it progresses.", help];
};

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
  /**
   * The customer's own share code, and only once their commission is
   * COMPLETE.
   *
   * The server decides: `/api/order-reference` returns it only for an order
   * whose production stage is COMPLETED, so this page cannot show a share
   * invitation early even if someone changed the condition below. Immediately
   * after payment there is nothing to render, which is the point — see
   * `ShareMcb`.
   */
  const [referralCode, setReferralCode] = useState<string | null>(null);
  /** Order status as MCB's own record reports it — not as Stripe's URL implies. */
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  /**
   * Whether the lookup has stopped asking — retries spent, or the server
   * rejected the session id outright. Never means "unpaid"; it means this
   * page has no verified answer and must not invent one.
   */
  const [lookupFinished, setLookupFinished] = useState(false);

  /**
   * Shown only to a visitor arriving WITHOUT a session id — someone returning
   * to the page later. When a session id is present the server is the only
   * acceptable answer, because a remembered number could belong to a
   * different order than the one just paid for.
   */
  const [storedReference] = useState<string | null>(() =>
    sessionId ? null : readLocal(STORED_REFERENCE_KEY)
  );

  /**
   * The server's confirmed purchase — MCB reference, integer total and saved
   * lines — used for the analytics event alone and never rendered. Null until
   * the server reports a PAID order with line amounts.
   */
  const [purchase, setPurchase] = useState<ConfirmedPurchase | null>(null);
  /** In-memory guard, so a re-render or StrictMode re-run cannot send twice. */
  const purchaseSent = useRef(false);

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

        /**
         * 400 is the server refusing the SHAPE of the id — see the regex in
         * `api/order-reference.php`. A malformed id cannot become valid by
         * being asked again, so stop here rather than spending twelve seconds
         * implying something is on its way.
         */
        if (response.status === 400) {
          if (!cancelled) setLookupFinished(true);
          return;
        }

        if (response.ok) {
          const data = await response.json();
          if (cancelled) return;
          if (typeof data?.status === "string") {
            setOrderStatus(data.status);
          }
          // Present only for a completed commission. Set before the early
          // return below so it is captured on the same response that carries
          // the reference — a returning customer gets both in one poll.
          if (typeof data?.referral === "string" && data.referral !== "") {
            setReferralCode(data.referral);
          }
          if (typeof data?.reference === "string" && data.reference !== "") {
            if (data.status === "PAID") {
              setPurchase(parsePurchase(data.purchase, data.reference));
            }
            setReference(data.reference);
            setLookupFinished(true);
            try {
              localStorage.setItem(STORED_REFERENCE_KEY, data.reference);
              if (data.status === "PAID") {
                // Paid and on MCB's record: the words saved on this device
                // while ordering, and the saved-order note, are no longer
                // needed here and are removed.
                localStorage.removeItem(DRAFT_STORAGE_KEY);
                sessionStorage.removeItem(SAVED_ORDER_KEY);
              }
            } catch {
              // Private browsing or blocked storage. Nothing here is essential.
            }
            return;
          }
        }
      } catch {
        // A network failure is not a payment failure — and it is not a
        // payment success either. Retry; when the attempts are spent the page
        // says it could not verify, rather than deciding for the server.
      }

      if (cancelled) return;
      if (attempt >= REFERENCE_POLL_ATTEMPTS) {
        setLookupFinished(true);
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
   * The page's single source of truth about what it is allowed to say.
   *
   * `VERIFIED` requires a reference the SERVER returned. No browser value,
   * no inference from the presence of a session id in the URL, and no
   * fallback on timeout can reach it.
   */
  const verification: Verification = !sessionId
    ? "NO_SESSION"
    : reference
      ? "VERIFIED"
      : lookupFinished
        ? "UNVERIFIED"
        : "PENDING";

  // Analytics fires for a VERIFIED, PAID order with a server-confirmed
  // purchase only, using the MCB reference as the transaction id. No browser
  // value can reach it: an unpaid, legacy or fabricated session reports no
  // revenue at all.
  useEffect(() => {
    if (verification !== "VERIFIED" || orderStatus !== "PAID" || !sessionId || !purchase) return;
    if (purchaseSent.current) return;

    // Prevent duplicate purchase tracking per session/refresh.
    const trackedKey = `mcb_tracked_${sessionId}`;
    try {
      if (sessionStorage.getItem(trackedKey)) return;
    } catch {
      // Storage blocked: the in-memory guard still prevents repeats here.
    }

    if (!trackPurchase(purchase)) return;
    purchaseSent.current = true;
    // Memory Music Video purchased (server-confirmed): the SKU only, never customer content.
    const video = purchase.items.find((item) => item.sku === "memory-music-video");
    if (video) trackFunnel("video_purchase", { sku: video.sku, quantity: video.quantity });
    try {
      sessionStorage.setItem(trackedKey, "true");
    } catch {
      // Private browsing or blocked storage. Nothing here is essential.
    }
  }, [verification, orderStatus, sessionId, purchase]);

  /** The reference this visit may legitimately display, if any. */
  const shownReference = reference ?? storedReference;
  const isRemembered = !reference && !!storedReference;

  return (
   <>
     <Helmet>
       <title>Order received | My Custom Beats</title>
       <meta name="description" content="Your My Custom Beats order status and reference." />
       <meta name="robots" content="noindex, nofollow" />
     </Helmet>

    {/* MVIS Midnight Ink, never bg-black. */}
    <div className="min-h-screen bg-ink">
      <div className="mx-auto w-full max-w-2xl px-5 py-14 sm:px-6 sm:py-20">

        {/*
          1 — The status badge and the headline.

          The tick and the word "confirmed" belong to VERIFIED and to nothing
          else. Each other state gets its own icon, so the difference is
          carried by shape as well as by wording.
        */}
        <div className="text-center">
          {verification === "VERIFIED" && (
            <p className={`inline-flex items-center gap-2 rounded-full border border-gold bg-gold/15 px-4 py-1.5 text-sm font-bold tracking-wide ${TEXT_ACCENT}`}>
              <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
              Payment confirmed
            </p>
          )}

          {verification === "PENDING" && (
            <p className={`inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/[0.08] px-4 py-1.5 text-sm font-bold tracking-wide ${TEXT_PRIMARY}`}>
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Verifying your order
            </p>
          )}

          {verification === "UNVERIFIED" && (
            <p className={`inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/[0.08] px-4 py-1.5 text-sm font-bold tracking-wide ${TEXT_PRIMARY}`}>
              <HelpCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Not verified
            </p>
          )}

          <h1 className={`mt-6 text-4xl font-light leading-tight tracking-wide sm:text-5xl ${TEXT_PRIMARY}`}>
            {verification === "VERIFIED"
              ? // Plural wherever the order carries more than one song (Keepsake 3/4, Journey, several Moments).
                (purchase?.items.reduce((n, item) => n + (getVariant(item.sku)?.variant.songCount ?? 0) * item.quantity, 0) ?? 1) > 1
                ? "Your Songs Are Now In Motion"
                : "Your Song Is Now In Motion"
              : verification === "PENDING"
                ? "Your order is being verified"
                : verification === "UNVERIFIED"
                  ? "We couldn't verify this payment reference"
                  : "Your MCB order"}
          </h1>
        </div>

        {/*
          2 — The MCB reference.

          The gold-bordered card is the celebratory one, so it appears only
          where there is a real reference in it. The unverified state gets a
          plain border: nothing about that outcome should look like a
          confirmation.
        */}
        <section
          aria-labelledby="mcb-reference-label"
          className={`mt-10 rounded-2xl p-5 text-center sm:p-8 ${
            shownReference
              ? "border-2 border-gold bg-white/[0.06]"
              : "border border-white/25"
          }`}
        >
          <h2
            id="mcb-reference-label"
            className={`font-mono text-sm font-semibold uppercase tracking-[0.2em] ${TEXT_ACCENT}`}
          >
            {shownReference ? "Your MCB reference" : "Reference"}
          </h2>

          {shownReference ? (
            <>
              {/*
                Sized to fit MCB-YYYY-NNNNNN on the narrowest phone. Inside
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
          ) : verification === "PENDING" ? (
            <p className={`mt-4 text-lg ${TEXT_PRIMARY}`} role="status" aria-live="polite">
              Confirming your payment and issuing your reference…
            </p>
          ) : verification === "UNVERIFIED" ? (
            <p className={`mx-auto mt-4 max-w-md text-base leading-relaxed ${TEXT_PRIMARY}`} role="status">
              We could not match this link to a payment on our records, so we
              are not able to confirm one here. Nothing is lost, and there is
              nothing for you to pay again.
            </p>
          ) : (
            <p className={`mx-auto mt-4 max-w-md text-base leading-relaxed ${TEXT_PRIMARY}`}>
              Open the link in your confirmation to see the reference for a
              particular order, or contact us and we will look it up for you.
            </p>
          )}
        </section>

        {/*
          3 — Payment status, and ONLY as MCB's own record reports it.

          The "Order" and "Amount paid" rows that used to sit here read
          `localStorage`, so they described whatever this device last built in
          the order form rather than anything that was bought. They are gone.
          `/api/order-reference` now returns the confirmed purchase, but only
          for analytics; the customer's Stripe receipt carries the figure that
          was charged, and this page does not restate it.
        */}
        {verification === "VERIFIED" && orderStatus === "PAID" && (
          <dl className="mt-8 divide-y divide-white/20 overflow-hidden rounded-2xl border border-white/25">
            <DetailRow label="Payment" value="Paid" />
          </dl>
        )}

        {/* 4 — What happens next */}
        {verification === "UNVERIFIED" ? (
          <section className="mt-8 rounded-2xl border border-white/25 p-6 sm:p-8">
            <h2 className={`text-xl font-semibold tracking-wide ${TEXT_ACCENT}`}>
              What to do next
            </h2>

            <ul className={`mt-5 space-y-3 text-base leading-relaxed ${TEXT_PRIMARY}`}>
              <li>
                If you have just paid, your confirmation may still be arriving.
                Reload this page in a moment.
              </li>
              <li>
                If you opened an old or edited link, that alone does not affect
                any order you have placed.
              </li>
              <li>
                Either way, email us and we will confirm your order by hand —
                the fastest thing to quote is the email address you ordered
                with.
              </li>
            </ul>
          </section>
        ) : (
          <section className="mt-8 rounded-2xl border border-white/25 p-6 sm:p-8">
            <h2 className={`text-xl font-semibold tracking-wide ${TEXT_ACCENT}`}>
              What happens next
            </h2>

            {/*
              No universal timeline. The old "begins within 24 hours" line was
              shown for every product, including records made to order; each
              product's wording now comes from nextSteps() and the server's
              confirmed purchase.
            */}
            <ul className={`mt-5 space-y-3 text-base leading-relaxed ${TEXT_PRIMARY}`}>
              {nextSteps(verification === "VERIFIED" && orderStatus === "PAID" ? purchase : null).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        )}

        {/* Support */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className={`rounded-lg border border-white/50 px-8 py-3 text-center font-semibold transition hover:bg-white/10 ${TEXT_PRIMARY}`}
          >
            Return Home
          </Link>

          <a
            href="mailto:hello@mycustombeats.com"
            className={`rounded-lg border border-white/50 px-8 py-3 text-center font-semibold transition hover:bg-white/10 ${TEXT_PRIMARY}`}
          >
            Contact Support
          </a>
        </div>

        {/* Upload — only where there is a reference to quote. */}
        {shownReference && (
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
        )}

        {/*
          ---- The share invitation, and only once the work is done ---------

          ABSENT ON THE PAGE A CUSTOMER SEES AFTER PAYING. This surface's job
          in that first minute is to confirm the payment and hand over the
          reference; adding "now tell your friends" to it would turn a
          confirmation into a request, and would be asking someone to
          recommend a record that has not been pressed.

          The thank-you link is durable — the same URL minutes after payment
          and weeks after delivery — so the page simply means something
          different by then. The server decides when: `/api/order-reference`
          returns the code only for an order whose production stage is
          COMPLETED, so this cannot appear early even if the condition here
          were loosened.
        */}
        {referralCode && <ShareMcb code={referralCode} />}

        <p className={`mt-12 text-center text-sm ${TEXT_PRIMARY}`}>
          MyCustomBeats • Turning memories into music
        </p>

      </div>
    </div>
   </>
  );
}
