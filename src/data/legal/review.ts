/**
 * LEGAL REVIEW REQUIRED BEFORE FINAL PRODUCTION RELEASE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS
 * ─────────────────────────────────────────────────────────────────────────
 * INTERNAL GOVERNANCE. It is not imported by any page and no customer sees
 * it — a website that tells its own customers "this may not be legally sound"
 * has achieved nothing except alarming them.
 *
 * The documents in this directory were drafted against current UK consumer-law
 * principles and are, in the author's judgement, a substantial improvement on
 * what they replace. They are not solicitor-reviewed, and the items below are
 * the specific points where a qualified opinion changes the drafting rather
 * than merely confirming it.
 *
 * Sprint 10 (release certification) must not certify without this closed.
 */

export interface ReviewItem {
  topic: string;
  /** What has been implemented, so a reviewer starts from the position taken. */
  positionTaken: string;
  /** The specific question a solicitor needs to answer. */
  question: string;
  severity: "BLOCKING" | "IMPORTANT" | "CONFIRMATORY";
}

export const LEGAL_REVIEW_REQUIRED: readonly ReviewItem[] = [
  {
    topic: "Cancellation classification of the core product",
    positionTaken:
      "Each order is treated as a personalised creative SERVICE that produces digital content, and — where a physical format is chosen — goods made to the consumer's specification. Three consents are captured accordingly.",
    question:
      "Is the service / digital-content / made-to-specification split the correct characterisation, and does it hold for every package, including a Moment delivered within an hour?",
    severity: "BLOCKING",
  },
  {
    topic: "Interaction of early service performance with digital supply",
    positionTaken:
      "SERVICE_START and DIGITAL_CONTENT are captured as separate affirmative acknowledgements, neither pre-ticked, both required where applicable.",
    question:
      "Is the wording of each sufficient to engage the relevant exception, and is requiring the service-start acknowledgement in order to place an order defensible given MCB cannot operate a 14-day delay?",
    severity: "BLOCKING",
  },
  {
    topic: "Proportionate charge on cancellation after early start",
    positionTaken:
      "Terms say MCB 'may charge you a fair amount for the work already done', with no formula.",
    question:
      "Should the basis of that charge be stated more precisely, and is an unquantified 'fair amount' acceptable or does it need a stated method?",
    severity: "IMPORTANT",
  },
  {
    topic: "Liability",
    positionTaken:
      "The blanket cap at 'the amount paid' has been removed. Foreseeable loss accepted; business loss excluded; death/personal injury, fraud and statutory rights expressly not excluded.",
    question:
      "Is the remaining formulation both adequate for MCB and compliant with the unfair-terms regime?",
    severity: "IMPORTANT",
  },
  {
    topic: "IP and licence scope",
    positionTaken:
      "Customer receives a personal-use licence; MCB retains underlying rights; commercial use is excluded from standard experiences and available by separate agreement. Customer keeps ownership of material they supply and grants a fulfilment-purpose licence only.",
    question:
      "Is 'personal use' defined adequately, and does the Full Package's proposal-based rights position need standard-form wording rather than being left entirely to each proposal?",
    severity: "IMPORTANT",
  },
  {
    topic: "Governing law and international consumers",
    positionTaken:
      "England and Wales, with an express preservation of mandatory local consumer rights.",
    question:
      "Is the preservation wording sufficient for MCB's actual selling territories, and does any territory require additional disclosure at the point of sale?",
    severity: "IMPORTANT",
  },
  {
    topic: "Distance-selling pre-contract information",
    positionTaken:
      "Key contractual information plus the accepted terms version is included in the post-payment confirmation email.",
    question:
      "Does the confirmation satisfy the durable-medium requirement in full, and is a model cancellation form required?",
    severity: "BLOCKING",
  },
  {
    topic: "Privacy policy",
    positionTaken:
      "The false 'we do not sell or share your data' absolute has been corrected to name processor categories. The policy has not otherwise been rewritten.",
    question:
      "A full UK GDPR review — lawful bases, retention, international transfers, data-subject rights, cookies — is outstanding and out of this sprint's scope.",
    severity: "BLOCKING",
  },
];

/** Items that must be closed before a production release is certified. */
export const BLOCKING_REVIEW_ITEMS = LEGAL_REVIEW_REQUIRED.filter(
  (item) => item.severity === "BLOCKING"
);

/* ------------------------------------------------------------------ */
/* Wording that must never return                                      */
/* ------------------------------------------------------------------ */

/**
 * Phrases that were in the old documents, or were proposed, and are banned.
 *
 * INTERNAL, and deliberately in this file rather than in `terms.ts`. They were
 * there first, and it meant the banned wording was exported from a module the
 * pages import — so every one of these sentences shipped to the browser in the
 * production bundle, and the acceptance test looking for them found them in
 * the very file that exists to forbid them.
 *
 * Nothing imports this. The legal suite reads it from source to assert that
 * none of these strings appears in any customer-facing document.
 */
export const PROHIBITED_PHRASES: readonly { phrase: string; because: string }[] =
  [
    {
      phrase: "no refunds under any circumstances",
      because:
        "Untrue, and unenforceable against faulty or non-conforming goods.",
    },
    {
      phrase: "refunds are not available once production has started",
      because:
        "Blanket, undefined trigger, and no carve-out for MCB's own errors.",
    },
    {
      phrase: "No refunds or returns for personalised items",
      because:
        "States the personalised-goods exception as absolute. It does not cover faults.",
    },
    {
      phrase: "must be reported within 48 hours",
      because:
        "Reads as extinguishing statutory rights after two days. A prompt-reporting request is fine; a deadline on legal rights is not.",
    },
    {
      phrase: "never sold or shared",
      because:
        "False. Payment, email, hosting and file storage providers all process customer data.",
    },
    {
      phrase: "We do not sell or share your data",
      because: "Same absolute, on the Privacy page.",
    },
    {
      phrase: "liability is limited to the amount paid",
      because:
        "A blanket cap that would purport to limit non-excludable liability.",
    },
  ];
