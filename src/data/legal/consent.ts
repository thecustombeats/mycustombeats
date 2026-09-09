/**
 * CONSENT AT CHECKOUT — three separate acts, kept separate.
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
 *   • MCB starts the creative work immediately — a Moment is delivered inside
 *     an hour. Beginning a service inside the cancellation period is
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
 * MCB genuinely cannot deliver a one-hour Moment while also waiting fourteen
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
  | "DIGITAL_CONTENT";

export interface ConsentDefinition {
  id: ConsentId;
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
    detail:
      "These explain what is included, how refinements work, when your order can no longer be changed, and what happens if something is wrong with what we send you.",
    error:
      "Please confirm you have read and agree to our terms before placing your order.",
    appliesTo: "ALWAYS",
  },
  {
    id: "SERVICE_START",
    label:
      "Please start work on my order straight away, rather than waiting for the 14-day cancellation period to pass.",
    detail:
      "We begin as soon as you order — that is how a Moment arrives within the hour. Because you have asked us to start early, if you later cancel within the 14 days we can charge you for the work already done. Your rights if something is faulty or not as described are not affected.",
    error:
      "We need you to ask us to begin before we can start your order. Without this we cannot start work for 14 days.",
    appliesTo: "ALWAYS",
  },
  {
    id: "DIGITAL_CONTENT",
    label:
      "I understand that once you send me my finished music, I lose the right to cancel that digital content.",
    detail:
      "This applies to the audio files themselves, once we have sent them. It does not affect anything physical you have ordered, and it does not affect your rights if the files are faulty or not what you ordered.",
    error:
      "Please confirm you understand this before we send you digital music files.",
    appliesTo: "DIGITAL_DELIVERY",
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
};
