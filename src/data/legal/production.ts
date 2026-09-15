/**
 * THE CREATIVE LIFECYCLE — Single Creative Authority (15 September 2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE CUSTOMER PROVIDES THE MEMORIES. MCB CREATES THE MAGIC.
 * ─────────────────────────────────────────────────────────────────────────
 * At checkout the customer gives MCB their story, preferences and photographs
 * and grants MCB creative authority (the CREATIVE_AUTHORITY consent). Verified
 * payment is the order commitment, and personalised production may begin
 * straight away. There is NO customer creative-approval stage, no drafts sent
 * for sign-off and no included revision round.
 *
 * What protects the customer instead is MCB's own INTERNAL QUALITY CONTROL:
 * nothing is revealed or manufactured until a person at MCB has checked it.
 * The customer is never part of that loop.
 *
 *   CREATIVE        paid; MCB is creating (pending, then in progress)
 *   QUALITY_CHECK   finished internally; MCB is checking it
 *   QC_PASSED       checked; a Moment can be revealed, a record can be made
 *   PRODUCTION_LOCKED / FULFILMENT   the physical order is placed, then sent
 *   COMPLETED       revealed or delivered, and followed up
 *
 * A failed check returns the work to CREATIVE for an internal correction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LEGACY STAGES
 * ─────────────────────────────────────────────────────────────────────────
 * SONG_READY, AWAITING_APPROVAL, REVISION_REQUESTED and APPROVED belong to the
 * retired approval model. They remain valid database values so historical and
 * test records keep their original audit evidence; no new order enters them.
 * An older record in one of the first three is treated as awaiting the
 * quality check; APPROVED is treated as having passed it.
 *
 * Objective problems (MCB used the wrong name, wrong photograph, a defect,
 * damage, non-fulfilment) are handled as support and, where needed, an
 * internal MCB_CORRECTION or REPLACEMENT — never as a creative revision.
 */

export type ProductionStage =
  | "CREATIVE"
  | "QUALITY_CHECK"
  | "QC_PASSED"
  | "PRODUCTION_LOCKED"
  | "FULFILMENT"
  | "COMPLETED"
  /** Legacy (retired approval model): kept only for historical records. */
  | "SONG_READY"
  | "AWAITING_APPROVAL"
  | "REVISION_REQUESTED"
  | "APPROVED";

export interface StageDefinition {
  stage: ProductionStage;
  /** What is happening, for an operator. */
  internal: string;
  /** Whether new orders can enter this stage. False for the retired approval stages. */
  current: boolean;
  /** Whether MCB's internal quality check has been passed at this stage. */
  qualityChecked: boolean;
}

export const PRODUCTION_STAGES: readonly StageDefinition[] = [
  { stage: "CREATIVE", internal: "Paid. MCB is creating the song and artwork from what the customer supplied.", current: true, qualityChecked: false },
  { stage: "QUALITY_CHECK", internal: "Created. MCB is checking it internally before anything is revealed or made.", current: true, qualityChecked: false },
  { stage: "QC_PASSED", internal: "MCB's quality check is passed. A Moment can be revealed; a physical order can be placed.", current: true, qualityChecked: true },
  { stage: "PRODUCTION_LOCKED", internal: "The physical order is placed with the production partner.", current: true, qualityChecked: true },
  { stage: "FULFILMENT", internal: "Sent to the customer.", current: true, qualityChecked: true },
  { stage: "COMPLETED", internal: "Revealed or delivered, and complete. Statutory rights continue to apply.", current: true, qualityChecked: true },
  { stage: "SONG_READY", internal: "Legacy: finished before the approval model was retired. Treated as awaiting the quality check.", current: false, qualityChecked: false },
  { stage: "AWAITING_APPROVAL", internal: "Legacy: sent for customer approval under the retired model. Treated as awaiting the quality check.", current: false, qualityChecked: false },
  { stage: "REVISION_REQUESTED", internal: "Legacy: changes requested under the retired model. Treated as awaiting the quality check.", current: false, qualityChecked: false },
  { stage: "APPROVED", internal: "Legacy: approved by the customer under the retired model. Treated as quality-checked.", current: false, qualityChecked: true },
];

export const getStage = (stage: ProductionStage): StageDefinition | undefined =>
  PRODUCTION_STAGES.find((definition) => definition.stage === stage);

/** The stage a paid order starts in: MCB begins creating at payment. */
export const INITIAL_STAGE: ProductionStage = "CREATIVE";

/**
 * Said wherever the creative model is explained. Positive first; the
 * commercial position follows before payment, never after.
 */
export const CREATIVE_PROMISE = "You provide the memories. We create the surprise.";

export const CREATIVE_AUTHORITY_SUMMARY =
  "MCB creates the finished personalised work using the information and preferences you supply. The creative interpretation and final production decisions are entrusted to MCB.";

/** The five-step journey, as approved. */
export const CREATIVE_JOURNEY: readonly { title: string; detail: string }[] = [
  { title: "Tell us your story", detail: "Share the memories, people, places and moments that matter." },
  { title: "Choose your sound", detail: "Give us your musical preferences, or let MCB choose, and anything else you want us to know." },
  { title: "Upload your photograph", detail: "Supply the photographs your personalised artwork needs." },
  { title: "Trust MCB with the creativity", detail: "Our creative team transforms everything you provide into your personalised song and artwork, and checks it carefully." },
  { title: "Experience the reveal", detail: "Your finished MCB creation is the surprise — not another draft waiting for approval." },
];

/** Before payment: the customer checks what they have given MCB. */
export const CHECK_YOUR_DETAILS =
  "MCB creates from exactly what you give us, so please check names, spellings, dates, places, relationships, your story, your music choices and your photographs before you pay.";

/**
 * Creative preference versus a genuine problem — one explanation, used by the
 * Terms, Refunds, FAQ and the customer's order page.
 */
export const PREFERENCE_VS_PROBLEM = {
  preference:
    "Because you have entrusted the creative decisions to MCB, a different personal preference — another colour, crop, arrangement, lyrical structure, instrumentation or typography, or simply imagining the finished work differently — does not by itself give a right to a revision, remake or refund, subject always to applicable law.",
  problem:
    "A genuine problem is different, and we will put it right in the way the law and your order require: if we used information different from what you gave us (for example a name or place), used the wrong photograph, sent the wrong product, if an item is defective, damaged or not delivered, or if something else is wrong with what we supplied.",
  specification:
    "A music style you specifically chose is part of what you asked for. Choosing \"Let MCB choose\" leaves the style to our judgement.",
  statutory: "Nothing in these terms affects any statutory rights that cannot legally be excluded or limited.",
} as const;
