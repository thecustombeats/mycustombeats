/**
 * DELIVERY — five different things, which were being called one thing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CONTRADICTION THIS RESOLVES
 * ─────────────────────────────────────────────────────────────────────────
 * Three package cards said "Delivered within 15 working days". The Terms said
 * those times "are targets we work to, not guarantees". Both statements were
 * on the same website, about the same product, at the same time.
 *
 * One of them had to change, and it is not the Terms: MCB does not control
 * customs queues, snowstorms, postal strikes or a courier's third delivery
 * attempt, and a business that prints a guarantee it cannot keep has not
 * protected the customer — it has simply moved the disappointment to a worse
 * moment.
 *
 * So the cards now say what is true. Fifteen working days is how long to
 * ALLOW, not a date MCB commits to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FIVE STAGES, NOT ONE WORD
 * ─────────────────────────────────────────────────────────────────────────
 * "Delivery" was doing the work of all five of these, which is why a fifteen
 * working day figure could be read as a courier promise:
 *
 *   creative turnaround   how long MCB takes to write and produce the work;
 *   production            how long a physical object takes to make;
 *   dispatch              when it leaves the fulfilment partner;
 *   transit               the carrier's journey, which MCB does not drive;
 *   occasion date         the day the customer actually needs it.
 *
 * The last is the only one the customer cares about, and it is the only one
 * MCB cannot promise. Hence the recommendation rather than the guarantee.
 */

/* ------------------------------------------------------------------ */
/* The stages                                                          */
/* ------------------------------------------------------------------ */

export type DeliveryStage =
  | "CREATIVE_TURNAROUND"
  | "PRODUCTION"
  | "DISPATCH"
  | "TRANSIT"
  | "OCCASION_DATE";

export interface DeliveryStageDefinition {
  stage: DeliveryStage;
  label: string;
  /** What it means, said the way a customer would ask about it. */
  meaning: string;
  /** Whether MCB controls this stage. The whole point of the distinction. */
  withinMcbControl: boolean;
}

export const DELIVERY_STAGES: readonly DeliveryStageDefinition[] = [
  {
    stage: "CREATIVE_TURNAROUND",
    label: "Creating your work",
    meaning:
      "Writing, recording and producing your personalised music, including the refinements you ask for.",
    withinMcbControl: true,
  },
  {
    stage: "PRODUCTION",
    label: "Making it",
    meaning:
      "Pressing, printing, framing or engraving, once you have approved the work.",
    // MCB chooses and instructs the manufacturer, so this is its
    // responsibility even though another company does the pressing.
    withinMcbControl: true,
  },
  {
    stage: "DISPATCH",
    label: "Sending it",
    meaning: "When your order leaves us and is handed to a carrier.",
    withinMcbControl: true,
  },
  {
    stage: "TRANSIT",
    label: "On its way",
    meaning:
      "The carrier's journey to you, including any customs processing on an international order.",
    // The one stage MCB genuinely cannot drive — and the reason a date cannot
    // be guaranteed without agreeing one specifically.
    withinMcbControl: false,
  },
  {
    stage: "OCCASION_DATE",
    label: "The day you need it",
    meaning:
      "The wedding, the anniversary, the sailing date — what you are actually planning around.",
    withinMcbControl: false,
  },
];

/* ------------------------------------------------------------------ */
/* The planning recommendation                                         */
/* ------------------------------------------------------------------ */

/**
 * FIFTEEN WORKING DAYS — a recommendation, not a promise.
 *
 * It is how long to allow between ordering and needing something, covering
 * creation, production, dispatch and transit together. It is deliberately not
 * expressed as "we deliver in 15 days", because that sentence is a commitment
 * about the one stage MCB does not control.
 *
 * The number is not new and is not invented: it is the figure the site has
 * always quoted. What changes is what it is claimed to be.
 */
export const RECOMMENDED_PLANNING_DAYS = 15;

/** The single phrase every physical experience shows. One place, one wording. */
export const PLANNING_RECOMMENDATION =
  "Allow at least 15 working days for personalised production and delivery";

/**
 * Said wherever a customer is choosing around a date.
 *
 * Written so the reason is visible. "Not guaranteed" on its own reads as a
 * business protecting itself; saying which stage is outside MCB's hands and
 * inviting the customer to tell us their date reads as what it is — an
 * attempt to get it right.
 */
export const ESTIMATE_NOTICE =
  "Timings we show are estimates rather than guaranteed arrival dates, because the carrier's journey is not ours to control. If you need something for a particular day, tell us the date before you order and we will tell you honestly whether we can meet it.";

/**
 * The exception that keeps the general rule fair.
 *
 * A term saying every date is only ever an estimate would try to override an
 * agreement MCB had actually made, which is both unfair and unenforceable. If
 * MCB has put a date in writing, that date is a term of the contract and this
 * says so.
 */
export const AGREED_DATE_EXCEPTION =
  "Where we have expressly agreed a specific delivery date with you in writing, that agreed date applies and takes precedence over any general estimate.";

/**
 * Travel-linked orders, which is a large part of MCB's customer base.
 *
 * A cruise guest is not at an address on a date — they are on a ship that
 * sails whether or not a record arrives. Promising delivery to a moving
 * itinerary would be promising something nobody can do.
 */
export const TRAVEL_NOTICE =
  "If your order is tied to travel — a sailing date, a hotel, a trip abroad — please allow more time than you think you need, and let us send it to a fixed address you will be at rather than to a ship or a hotel you are about to leave.";

/* ------------------------------------------------------------------ */
/* How each experience is fulfilled                                    */
/* ------------------------------------------------------------------ */

/**
 * Whether an experience is delivered digitally or made and posted.
 *
 * The distinction decides which delivery language applies. A Moment is
 * written, produced and sent by MCB within the hour with no carrier involved
 * at all, so the fifteen-working-day planning recommendation is simply not
 * about it — applying that recommendation to Moment would misdescribe MCB's
 * fastest product as its slowest.
 */
export type DeliveryBasis = "DIGITAL_TURNAROUND" | "MADE_TO_ORDER" | "AGREED_IN_PROPOSAL";

export const DELIVERY_BASIS_NOTE: Readonly<Record<DeliveryBasis, string>> = {
  DIGITAL_TURNAROUND:
    "Delivered digitally by us, with no manufacturing or carrier involved.",
  MADE_TO_ORDER:
    "Made for you and posted, so the timing covers creation, production and the carrier's journey.",
  AGREED_IN_PROPOSAL:
    "Timing is agreed with you in the written proposal for your commission.",
};
