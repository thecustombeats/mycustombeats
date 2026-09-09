/**
 * SHARE MCB — a customer passing MCB on, once their own memory exists.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHEN THIS APPEARS, AND WHY IT MATTERS
 * ─────────────────────────────────────────────────────────────────────────
 * Only when the commission is COMPLETE. It is deliberately absent from the
 * page a customer sees in the minute after paying: asking someone to
 * recommend a record that is still being pressed is asking them to vouch for
 * something they have not heard, and it turns a confirmation into a request.
 *
 * The thank-you link is durable — the same URL minutes after payment and
 * weeks after delivery — so the page simply means something different by
 * then. `/api/order-reference` returns the stage and, once complete, the
 * customer's own code.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO REWARD IS OFFERED, BECAUSE NONE HAS BEEN APPROVED
 * ─────────────────────────────────────────────────────────────────────────
 * No credit, no discount, no free vinyl, no points. Naming one would be a
 * commercial promise this repository has no authority to make and MCB would
 * then have to honour. The ask stands on its own: if the work was good, a
 * customer will pass it on, and if it was not, no voucher should persuade
 * them to.
 *
 * There is no leaderboard, no count of how many people they have referred,
 * and no competition. The relationship is personal.
 */

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import {
  REFERRAL_INVITATION,
  referralUrl,
  shareMessage,
  whatsappShareUrl,
} from "../data/referral";
import { trackEvent } from "../lib/analytics";

interface ShareMcbProps {
  /** The customer's own public code. Nothing renders without one. */
  code: string;
}

/**
 * Whether the browser can hand off to the platform share sheet.
 *
 * Feature-detected rather than sniffed, and read once per mount: on a phone
 * this is the natural way to share, and on a desktop it usually does not
 * exist, so the button is simply absent rather than present and broken.
 */
const canNativeShare = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

const ShareMcb = ({ code }: ShareMcbProps) => {
  const headingId = useId();
  const [copied, setCopied] = useState(false);
  /**
   * Feature-detected once, in a lazy initialiser rather than an effect.
   *
   * This is derived state, not a subscription: `navigator.share` either
   * exists when the component mounts or it does not, and it will not start
   * existing later. Setting it from an effect meant a render with the button
   * absent followed immediately by one with it present — a flash of the wrong
   * UI, and a cascading render for a value that was knowable the whole time.
   */
  const [nativeShare] = useState(canNativeShare);
  const copyTimer = useRef<number | null>(null);

  const url = referralUrl(
    code,
    typeof window === "undefined" ? "https://www.mycustombeats.com" : window.location.origin
  );
  const message = shareMessage(url);

  // The one genuine effect: reporting that the invitation was seen.
  useEffect(() => {
    trackEvent("customer_referral_link_viewed");
  }, []);

  // Clears the pending "Copied" reset if the component unmounts first, so the
  // timer cannot fire against a gone component.
  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    []
  );

  /**
   * Analytics carries the EVENT and the METHOD, never the code.
   *
   * The code is a public string, but it identifies one customer across every
   * share they make — which is precisely the kind of stable per-person key
   * that has no business being sent to a third-party analytics vendor by a
   * page about someone's late mother.
   */
  const announceShare = (method: "copy" | "native" | "whatsapp") => {
    trackEvent("customer_referral_shared", { method });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard permission refused, or an insecure context. The link is
      // rendered in full below precisely so this is never a dead end — the
      // customer can select it by hand.
      return;
    }
    setCopied(true);
    announceShare("copy");
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2600);
  };

  const share = async () => {
    try {
      await navigator.share({ text: message, url });
      announceShare("native");
    } catch {
      // Includes the customer simply cancelling the sheet, which is not a
      // failure and must not show them an error.
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="mt-10 rounded-2xl border border-espresso/12 bg-white p-6 text-left md:p-8"
    >
      <h2
        id={headingId}
        className="font-serif text-2xl leading-snug text-espresso"
      >
        {REFERRAL_INVITATION}
      </h2>
      <p className="mt-3 max-w-xl leading-relaxed text-espresso/70">
        If your memory meant something, the person you send this to might have
        one of their own waiting to be made.
      </p>

      {/*
        The link, shown in full.

        `break-all` because a URL has no spaces to wrap at, and at 320px an
        unbroken one pushes the whole card sideways. Rendered as text rather
        than only living behind a Copy button, so a customer whose clipboard
        permission is refused can still select it.
      */}
      <p className="mt-5 break-all rounded-xl bg-ivory px-4 py-3 font-mono text-sm text-espresso/80">
        {url}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-espresso px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-ivory transition-colors hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          {copied ? (
            <Check aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Copy aria-hidden="true" className="h-4 w-4" />
          )}
          {copied ? "Copied" : "Copy link"}
        </button>

        {nativeShare && (
          <button
            type="button"
            onClick={share}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-espresso/20 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-espresso transition-colors hover:border-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
          >
            <Share2 aria-hidden="true" className="h-4 w-4" />
            Share
          </button>
        )}

        {/*
          WhatsApp as a plain link — no SDK, no pixel, no embedded tracker.
          The message carries the referral URL and nothing else: no reference,
          no order id, none of the story.
        */}
        <a
          href={whatsappShareUrl(message)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => announceShare("whatsapp")}
          className="inline-flex min-h-11 items-center rounded-full border border-espresso/20 px-6 py-3 text-[11px] uppercase tracking-[0.16em] text-espresso transition-colors hover:border-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          WhatsApp
        </a>
      </div>

      {/*
        Announced, not just shown. A tick that only changes colour tells a
        screen-reader user nothing about whether the copy worked.
      */}
      <p aria-live="polite" className="mt-3 min-h-5 text-xs text-espresso/60">
        {copied ? "Link copied to your clipboard." : ""}
      </p>
    </section>
  );
};

export default ShareMcb;
