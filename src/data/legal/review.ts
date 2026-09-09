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
    topic: "Delivery estimates and expressly agreed dates",
    positionTaken:
      "Displayed timings are estimates; an expressly agreed written date takes precedence and is stated to do so (clause 12). Package cards were changed from 'Delivered within 15 working days' to 'Allow at least 15 working days…' so the site and the contract agree.",
    question:
      "Is the estimate/agreed-date split correctly drawn, and does clause 12 adequately preserve the consumer's remedies where MCB itself causes a delay or where a delivery time was of the essence?",
    severity: "BLOCKING",
  },
  {
    topic: "Special-occasion and non-refundable arrangement wording",
    positionTaken:
      "Customers are advised not to make non-refundable travel, accommodation or event arrangements on the strength of an estimate (clause 13), with a fifteen-working-day planning recommendation. It is written as advice plus a foreseeability boundary in clause 21, NOT as a blanket waiver of consequential loss.",
    question:
      "Does this achieve the intended commercial protection without operating as an unfair exclusion of losses caused by MCB's own breach?",
    severity: "BLOCKING",
  },
  {
    topic: "Events outside reasonable control",
    positionTaken:
      "Clause 19 lists courier delay, customs, weather, industrial action and similar, and expressly states that the involvement of a subcontractor does not by itself make something outside MCB's control. Third-party fulfilment does not reduce MCB's responsibility.",
    question:
      "Is the force-majeure formulation adequate, and is the express refusal to treat subcontracting as immunity correctly drafted?",
    severity: "IMPORTANT",
  },
  {
    topic: "International duties and taxes",
    positionTaken:
      "Import duties and taxes are payable by the recipient 'unless we have expressly stated otherwise at checkout, or the law of the destination requires otherwise' (clause 15).",
    question:
      "Is the qualification sufficient for MCB's actual selling territories, and does any territory require the total including duties to be disclosed before purchase?",
    severity: "IMPORTANT",
  },
  {
    topic: "Product handling, misuse and personal injury",
    positionTaken:
      "Clauses 16–18 ask for reasonable care, instruct customers to stop using visibly damaged items, and exclude responsibility for loss GENUINELY CAUSED by misuse — with an express footnote that nothing limits liability for death or personal injury caused by negligence, for defective products, or for anything else that cannot lawfully be excluded. No 48-hour reporting cutoff was reintroduced.",
    question:
      "Is the causal framing of the misuse clause tight enough to be enforceable, and is the product-safety carve-out sufficient given MCB supplies glazed frames and pressed records?",
    severity: "BLOCKING",
  },
  {
    topic: "Limitation of liability — 'consequential loss' replaced",
    positionTaken:
      "The Founder draft's generic 'indirect or consequential losses' and reliance on 'to the fullest extent permitted by applicable law' were NOT adopted as the operative wording. Clause 21 instead ties exclusions to causation: loss not caused by MCB, loss from events outside its reasonable control, loss from misuse, loss from incorrect delivery details, and loss that was not foreseeable — plus an express business-loss exclusion for a consumer sale and an express list of what is never excluded.",
    question:
      "Does the causation-based formulation preserve the Founder's intended commercial protection while remaining fair under the unfair-terms regime? This is the single most important item in this register.",
    severity: "BLOCKING",
  },
  {
    topic: "Allocation of fulfilment and carrier responsibility",
    positionTaken:
      "The customer's contract is with MCB throughout; manufacturers, fulfilment partners and carriers are named as MCB's suppliers rather than as a boundary of MCB's responsibility.",
    question:
      "Is that allocation correctly expressed, and does it need supporting wording about MCB's rights of recourse against those suppliers?",
    severity: "CONFIRMATORY",
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
