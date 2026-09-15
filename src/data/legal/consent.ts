/**
 * CONSENT AT CHECKOUT — four separate acts, kept separate.
 *
 * The fourth, CREATIVE_AUTHORITY, was added for the Single Creative Authority
 * customer journey (15 September 2026): the customer gives MCB the creative
 * decisions, and there is no draft or approval stage after payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NOT ONE CHECKBOX
 * ─────────────────────────────────────────────────────────────────────────
 * The form had one box: "I confirm that I have read and agree to the Terms,
 * Privacy Policy and Refund Policy". That is a fine way to accept terms and a
 * poor way to do the other two things that are happening at the same moment.
 *
 * Under UK distance-selling rules a consumer ordinarily has a 14-day
 * cancellation period. Two of the things MCB does routinely interact with it:
 *
 *   • MCB starts personalised production as soon as payment is confirmed. Beginning a service inside the cancellation period is
 *     something the customer has to ask for.
 *   • MCB supplies digital content inside that period, and the customer's
 *     right to cancel digital content ends when supply begins WITH their
 *     consent and their acknowledgement of that consequence.
 *
 * Rolling those into "I agree to the terms" would mean the customer's most
 * consequential decision — losing a cancellation right — is inferred from a
 * box mostly about something else. So they are separate, separately worded,
 * separately recorded, and none is pre-ticked.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A NOTE ON "REQUIRED"
 * ─────────────────────────────────────────────────────────────────────────
 * The service-start acknowledgement is required to place an order, because
 * MCB begins personalised production at payment and cannot also wait fourteen
 * days to begin. That is honest, but it is only honest if the customer can
 * see exactly what they are agreeing to before they agree — which is why the
 * wording below states the consequence in the same sentence as the request,
 * rather than in a policy behind a link.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS DRAFTING, NOT ADVICE
 * ─────────────────────────────────────────────────────────────────────────
 * The classification below — service element, digital-content element, and
 * how the two interact for each package — is a commercial reading that needs
 * professional legal confirmation. See `legal/review.ts`.
 */

/* ------------------------------------------------------------------ */
/* The acts                                                            */
/* ------------------------------------------------------------------ */

export type ConsentId =
  /** Acceptance of the contract: Terms, Refunds & Cancellations, Privacy. */
  | "TERMS"
  /** An express request that MCB begin the personalised work straight away. */
  | "SERVICE_START"
  /**
   * Acknowledgement that digital content supplied within the cancellation
   * period ends the right to cancel it. Only asked where the order actually
   * includes digital delivery.
   */
  | "DIGITAL_CONTENT"
  /**
   * SINGLE CREATIVE AUTHORITY (15 September 2026): the customer authorises
   * MCB to make the creative and production decisions, understanding there
   * are no drafts for approval and no subjective revisions. Asked of every
   * order. NEEDS PROFESSIONAL LEGAL REVIEW — see `review.ts`.
   */
  | "CREATIVE_AUTHORITY";

export interface ConsentDefinition {
  id: ConsentId;
  /** A short heading shown above the sentence, where one is approved. */
  heading?: string;
  /** The sentence beside the checkbox. Plain, and complete on its own. */
  label: string;
  /** The consequence, said in full rather than linked to. */
  detail: string;
  /** Shown when the customer tries to submit without it. */
  error: string;
  /**
   * Whether this consent is asked of every order, or only of some.
   *
   * `ALWAYS` — every order.
   * `DIGITAL_DELIVERY` — only where something is delivered digitally.
   */
  appliesTo: "ALWAYS" | "DIGITAL_DELIVERY";
}

export const CONSENTS: readonly ConsentDefinition[] = [
  {
    id: "TERMS",
    label:
      "I have read and agree to the Terms & Conditions, the Refunds & Cancellations policy, and the Privacy Policy.",
    /**
     * Widened to name the delivery and handling provisions, NOT split into a
     * second checkbox.
     *
     * The Founder draft included an "Acceptance of These Terms" section, which
     * would naturally have become another box. It did not, because there is
     * already exactly one act of accepting the contract and adding a second
     * box for a subset of the same contract would suggest the first one did
     * not cover it. The Terms themselves say what accepting includes — see
     * clause 25 — and this sentence names the parts a customer is most likely
     * to be caught out by.
     */
    detail:
      "These explain what is included, how MCB's creative authority works, when personalised production begins, that delivery times are estimates, and our position on cancelling and refunds — please read clauses 4 to 7.",
    error:
      "Please confirm you have read and agree to our terms before placing your order.",
    appliesTo: "ALWAYS",
  },
  {
    id: "SERVICE_START",
    /**
     * REWORDED, not removed.
     *
     * This previously said "rather than waiting for the 14-day cancellation
     * period to pass" and explained what cancelling within it would cost.
     * The Founder's Terms (2026-09-09.4) state there is no cancellation
     * after payment, so those sentences described a route the contract no
     * longer offers — and a checkbox promising one beside a clause denying
     * it is worse than either alone.
     *
     * The ACT is unchanged and still recorded separately: the customer is
     * asking MCB to begin immediately. Only the description of what
     * cancelling would involve has been taken out.
     */
    label:
      "Please start work on my order straight away.",
    detail:
      "Personalised production begins as soon as your payment is confirmed, so we can create and reveal your work quickly. Clause 7 of our Terms explains what that means for cancelling, and we would rather you read it before you buy than afterwards.",
    error:
      "We need you to ask us to begin before we can start your order. Without this we cannot start work for 14 days.",
    appliesTo: "ALWAYS",
  },
  {
    id: "DIGITAL_CONTENT",
    label:
      "I understand that once you send me my finished music, I lose the right to cancel that digital content.",
    detail:
      "This applies to the audio files themselves, once we have sent them. It does not affect anything physical you have ordered.",
    error:
      "Please confirm you understand this before we send you digital music files.",
    appliesTo: "DIGITAL_DELIVERY",
  },
  {
    id: "CREATIVE_AUTHORITY",
    heading: "Creative Authority & Personalised Production",
    /** Founder-approved wording (15 September 2026). NEEDS PROFESSIONAL LEGAL REVIEW. */
    label:
      "I understand that MCB™ will use the information, preferences and photographs I provide to independently create my personalised song and custom artwork. I authorise MCB™ to make the creative and production decisions required to complete my order. I understand that I will not receive song or artwork drafts for creative approval and that subjective creative revisions are not included in my order. Once personalised production begins, cancellation/refund rights may be limited as permitted by applicable law. This does not affect any statutory rights that cannot legally be excluded.",
    detail:
      "Please check the names, spellings, dates, places, story, music choices and photographs you have given us before you pay — MCB creates from exactly what you provide.",
    error: "Please confirm the Creative Authority & Personalised Production statement before placing your order.",
    appliesTo: "ALWAYS",
  },
];

export const getConsent = (id: ConsentId): ConsentDefinition | undefined =>
  CONSENTS.find((consent) => consent.id === id);

/**
 * Which consents an order actually needs.
 *
 * Derived from the order, not hard-coded per package: an MP3 Keepsake needs
 * the digital acknowledgement and a vinyl one does not, and that follows from
 * the format rather than from anyone remembering to list Moment.
 *
 * The server derives the same answer from the same rule, so a browser cannot
 * decide it needs fewer consents than it does.
 */
export const requiredConsents = (options: {
  hasDigitalDelivery: boolean;
}): readonly ConsentId[] =>
  CONSENTS.filter(
    (consent) =>
      consent.appliesTo === "ALWAYS" ||
      (consent.appliesTo === "DIGITAL_DELIVERY" && options.hasDigitalDelivery)
  ).map((consent) => consent.id);

/**
 * NONE OF THESE IS PRE-TICKED, and this is the reason written down.
 *
 * A pre-ticked box is not consent — the customer has not done anything. It is
 * also specifically ineffective for the digital-content acknowledgement,
 * where the whole legal effect depends on the customer having actively said
 * it. So the initial state is an explicit constant rather than an omission
 * somebody could later "tidy up".
 */
export const INITIAL_CONSENT_STATE: Readonly<Record<ConsentId, boolean>> = {
  TERMS: false,
  SERVICE_START: false,
  DIGITAL_CONTENT: false,
  CREATIVE_AUTHORITY: false,
};
