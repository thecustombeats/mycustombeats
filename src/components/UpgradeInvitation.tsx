/**
 * MOMENT → KEEPSAKE — the pre-payment upgrade invitation.
 *
 * Offered once, after the customer has told their story and chosen a mood and
 * a musical direction: the moment the song stops being a form and starts being
 * a thing they can imagine holding. Before that it is an interruption; after
 * payment it would be an upsell. Here it is the next question in the same
 * conversation.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS A PACKAGE CHANGE, NOT AN ADD-ON
 * ─────────────────────────────────────────────────────────────────────────
 * Accepting does not add a Keepsake to a Moment. It replaces the product: the
 * order becomes a Keepsake, the customer chooses which one, and every figure
 * is re-derived from that selection by the catalogue. There is no hidden
 * Moment underneath and no second line item.
 *
 * That is why it holds no price of its own. It reads `KEEPSAKE.price.gbp` and
 * renders it through `<Price>`, the same component every other price on the
 * site goes through, so the local-currency estimate and the "charged in GBP"
 * line are identical here to everywhere else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────
 * No countdown, no crossed-out price, no "limited time", no scarcity, no
 * "best seller", and no suggestion that declining loses the memory. The
 * customer chose Moment deliberately and may keep it with one obvious click
 * that is not a small grey text link.
 *
 * It also does not choose a format. Keepsake sells three, and picking one for
 * the customer would either assume a physical object they did not ask for or
 * quietly keep them digital. The format selector they already passed is
 * repopulated with Keepsake's options and focus is moved to it.
 */

import { useEffect, useRef } from "react";
import { Check, Sparkles } from "lucide-react";
import { KEEPSAKE, MOMENT, formatMinor, formatMoney, lowestPrice, type Product } from "../data/catalogue";
import { isUpgradeEligible, type UpgradeDecision } from "../lib/upgrade";

interface UpgradeInvitationProps {
  /** The package the order is currently for — the canonical value. */
  currentPackage: string;
  decision: UpgradeDecision;
  onAccept: () => void;
  onDecline: () => void;
  onRevert: () => void;
  /**
   * True once the customer has said enough for the question to mean anything:
   * a story, a mood and a musical direction.
   */
  briefReady: boolean;
}

/** The two or three inclusions worth naming, taken from the package data. */
/** One line per Keepsake, e.g. "7-inch Picture Disc — 1 song — £99". */
const keepsakeHighlights = (product: Product): readonly string[] =>
  product.variants.map(
    (variant) =>
      `${variant.label} — ${variant.songCount === 1 ? "1 song" : `${variant.songCount} songs`} — ${formatMoney(variant.price)}`
  );

const KEEPSAKE_FROM = `From ${formatMinor(lowestPrice(KEEPSAKE)?.minor ?? 0)}`;
const MOMENT_PRICE = formatMoney(MOMENT.variants[0].price);

const UpgradeInvitation = ({
  currentPackage,
  decision,
  onAccept,
  onDecline,
  onRevert,
  briefReady,
}: UpgradeInvitationProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const accepted = decision === "accepted";

  /**
   * Move focus to the panel when it first appears.
   *
   * It arrives mid-form after the customer finishes writing, so someone using
   * a screen reader would otherwise have no idea a new decision had been added
   * between them and the submit button. `tabIndex={-1}` makes the heading a
   * focus target without putting it in the tab order.
   */
  const declined = decision === "declined";
  const shown = briefReady && (isUpgradeEligible(currentPackage) || accepted);
  const wasShown = useRef(false);

  useEffect(() => {
    if (shown && !wasShown.current) {
      wasShown.current = true;
      headingRef.current?.focus();
    }
  }, [shown]);

  if (!shown) return null;

  /* ---------------------------------------------------------------- */
  /* Declined — a quiet way back, not the card again                   */
  /* ---------------------------------------------------------------- */
  /*
    Re-showing the full invitation after someone has said no is nagging, and
    the customer is entitled to have their answer respected. Removing it
    entirely is the opposite mistake: they can still change their mind right
    up to payment, and hiding the only route to that would make "no" feel
    more permanent than it is.

    So it collapses to one line. Present, easy to act on, impossible to
    mistake for pressure.
  */
  if (declined && isUpgradeEligible(currentPackage)) {
    return (
      <p className="order-form-field text-sm text-espresso/60">
        Changed your mind?{" "}
        <button
          type="button"
          onClick={onAccept}
          className="rounded font-medium text-gold-deep underline underline-offset-2 transition-colors hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          Upgrade to MCB {KEEPSAKE.name} — {KEEPSAKE_FROM}
        </button>
      </p>
    );
  }

  /* ---------------------------------------------------------------- */
  /* Upgraded                                                          */
  /* ---------------------------------------------------------------- */
  if (accepted) {
    return (
      <section
        aria-labelledby="upgrade-heading"
        className="order-form-field rounded-2xl border border-gold-dark bg-gold/10 p-5 sm:p-7"
      >
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gold-deep">
          <Check aria-hidden="true" strokeWidth={3} className="h-3.5 w-3.5" />
          Upgraded
        </p>

        <h3
          id="upgrade-heading"
          ref={headingRef}
          tabIndex={-1}
          className="mt-3 font-serif text-2xl leading-snug text-espresso focus:outline-none sm:text-[1.75rem]"
        >
          {/* Phrased without an article on purpose: "an {name}" would be
              wrong for some product names and right for others, and hard-coding
              either makes the sentence a hostage to the package name. */}
          Your order is now MCB {KEEPSAKE.name}
        </h3>

        <p className="mt-3 text-sm leading-relaxed text-espresso/70">
          Choose which Keepsake you would like in the section above — that is
          the last thing we need.
        </p>

        <p className="mt-5 text-xl font-light text-espresso">{KEEPSAKE_FROM}</p>

        {/*
          The way back. Before payment the customer must be able to change
          their mind — one click up is not a commitment, and a decision that
          cannot be undone is a trap rather than an invitation.
        */}
        <button
          type="button"
          onClick={onRevert}
          className="mt-5 min-h-11 rounded-full border border-espresso/20 bg-white px-5 py-2.5 text-sm text-espresso/80 transition-colors hover:border-espresso/40 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          Go back to {MOMENT.name} — {MOMENT_PRICE}
        </button>
      </section>
    );
  }

  /* ---------------------------------------------------------------- */
  /* The invitation                                                    */
  /* ---------------------------------------------------------------- */
  return (
    <section
      aria-labelledby="upgrade-heading"
      className="order-form-field rounded-2xl border border-gold/40 bg-ivory p-5 sm:p-7"
    >
      <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-gold-deep">
        <Sparkles aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5" />
        Before you continue
      </p>

      <h3
        id="upgrade-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-3 font-serif text-2xl leading-snug text-espresso focus:outline-none sm:text-[1.75rem]"
      >
        Why not turn it into something you can hold forever?
      </h3>

      <p className="mt-3 max-w-xl text-sm leading-relaxed text-espresso/70">
        Your personalised song can become more than a digital memory. Turn it
        into a picture disc made to hold onto.
      </p>

      {/*
        The Keepsakes and their prices come from the catalogue, so this cannot
        advertise a record MCB does not make or a price it does not charge.
      */}
      <ul className="mt-5 space-y-2 text-sm text-espresso/75">
        {keepsakeHighlights(KEEPSAKE).map((feature) => (
          <li key={feature} className="flex gap-2.5">
            <Check
              aria-hidden="true"
              strokeWidth={2.5}
              className="mt-0.5 h-4 w-4 shrink-0 text-gold-deep"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-3xl font-light text-espresso">{KEEPSAKE_FROM}</p>

      {/*
        Both actions are real buttons of comparable size and a comparable
        touch target. The upgrade keeps the visual emphasis, but declining is
        never a small grey link someone has to hunt for — and it names the
        price so the customer can see exactly what they are keeping.
      */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={onAccept}
          className="min-h-12 flex-1 rounded-full bg-gold px-6 py-3 font-semibold text-espresso transition-colors hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          Upgrade to MCB {KEEPSAKE.name}
        </button>

        <button
          type="button"
          onClick={onDecline}
          className="min-h-12 flex-1 rounded-full border border-espresso/20 bg-white px-6 py-3 text-espresso/80 transition-colors hover:border-espresso/40 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          Continue with MCB {MOMENT.name} — {MOMENT_PRICE}
        </button>
      </div>
    </section>
  );
};

export default UpgradeInvitation;
