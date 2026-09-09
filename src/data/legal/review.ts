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
    topic: "FOUNDER-REPLACED TERMS — clauses that consumer law does not permit",
    positionTaken:
      "The Founder replaced the entire clause set at version 2026-09-09.4 and accepted solicitor review as non-blocking for release. The wording is implemented exactly as supplied and has NOT been softened.",
    question:
      "Six clauses attempt exclusions a trader cannot make against a consumer, and a term that is void does not merely fail — it can invite a complaint that the rest of the document would not have. (1) Clause 18: 'MCB has no responsibility for death or personal injury caused by neglect or defective products' — liability for death or personal injury from negligence cannot lawfully be excluded, and this is the single most serious item here. (2) Clause 7: 'There is a no refund policy' with no carve-out for faulty or misdescribed goods. (3) Clause 8: courier damage disclaimed — under the Consumer Rights Act goods remain the trader's risk until they reach the consumer, so this is likely unenforceable. (4) Clause 17: remedy conditioned on claiming 'within 24 hours of delivery date' — statutory rights do not expire in 24 hours. (5) Clause 23: 'Any change applies to orders placed before and after' — purports to vary concluded contracts retrospectively. (6) Clause 20: 'it becomes your full responsibility if anything happens regarding a legal case' — attempts to transfer the trader's own liability to the consumer. Each should be reviewed before the terms are relied on in a dispute.",
    severity: "BLOCKING",
  },

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
    topic: "HISTORICAL (superseded) — delivery estimates and agreed dates",
    positionTaken:
      "Displayed timings are estimates; an expressly agreed written date takes precedence and is stated to do so (clause 12). Package cards were changed from 'Delivered within 15 working days' to 'Allow at least 15 working days…' so the site and the contract agree.",
    question:
      "Is the estimate/agreed-date split correctly drawn, and does clause 12 adequately preserve the consumer's remedies where MCB itself causes a delay or where a delivery time was of the essence?",
    severity: "BLOCKING",
  },
  {
    topic: "HISTORICAL (superseded) — special-occasion and non-refundable wording",
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
    topic: "HISTORICAL (superseded) — product handling, misuse and personal injury",
    positionTaken:
      "Clauses 16–18 ask for reasonable care, instruct customers to stop using visibly damaged items, and exclude responsibility for loss GENUINELY CAUSED by misuse — with an express footnote that nothing limits liability for death or personal injury caused by negligence, for defective products, or for anything else that cannot lawfully be excluded. No 48-hour reporting cutoff was reintroduced.",
    question:
      "Is the causal framing of the misuse clause tight enough to be enforceable, and is the product-safety carve-out sufficient given MCB supplies glazed frames and pressed records?",
    severity: "BLOCKING",
  },
  {
    topic: "HISTORICAL (superseded) — limitation of liability, 'consequential loss' replaced",
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
    topic: "Privacy — UK GDPR review of the completed policy",
    positionTaken:
      "The policy is now written from a verified data-flow inventory (`privacy.ts`): thirteen processors, each with what it receives and the source file that proves it; the browser storage list; and the order-record fields including the salted IP hash and user agent. Two sections state openly that exact retention periods and the cookie-consent position are still being settled rather than asserting them.",
    question:
      "The inventory removes the excuse that nobody knew the data flows. It does NOT constitute the review. Still required: lawful basis for each purpose, exact retention periods, international transfer mechanisms for processors outside the UK, the cookie/analytics consent position, a data processing agreement with each named processor, and whether a ROPA and any DPIA are needed. Note that the inventory is wider than previously assumed — Formspree, Calendly, Zapier, Google Apps Script, QR Server, YouTube and Google Fonts are all live paths.",
    severity: "BLOCKING",
  },
  {
    topic: "Founder Terms comparison",
    positionTaken:
      "RESOLVED. The Founder's complete nine-section source was compared against the implementation by the supervising certification process: PASS, commercial intent preserved across clauses 12-18, 21 and 25.",
    question:
      "No longer a release blocker. The liability clause's causation-based formulation was deliberately retained in preference to the draft's generic wording and must NOT be reverted for textual similarity — its review sits under its own entry above.",
    severity: "CONFIRMATORY",
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

/* ------------------------------------------------------------------ */
/* Non-legal items recorded for release                                */
/* ------------------------------------------------------------------ */

/**
 * Known defects that are NOT release blockers, recorded so they are not lost.
 *
 * Kept here rather than in a ticket because this file is the one thing a
 * release reviewer is guaranteed to open, and an item nobody reads is an item
 * nobody fixes.
 */
export const RECORDED_NON_BLOCKERS: readonly {
  item: string;
  detail: string;
  action: string;
}[] = [
  {
    item: "Portable Record Player Suitcase artwork",
    detail:
      "`/images/brand/portable-recordplayer.png` carries baked-in text reading 'Portable Gramophones'. The product's authoritative name is 'Portable Record Player Suitcase', the surrounding page copy and the alt text are both correct, and MCB separately sells two actual gramophones — so the artwork misnames this product and collides with two others. Customer-visible on /products.",
    action:
      "Replace the image. Do NOT rename the product to match the artwork; the name is the approved commercial truth and the picture is the thing that is wrong.",
  },
  {
    item: "Brand accent contrast",
    detail:
      "`text-gold-deep` measures 4.18:1 on ivory, marginally under the 4.5:1 AA threshold for normal-size text. It is used site-wide as a section label.",
    action:
      "A brand-colour decision, not a code fix. Darkening the token slightly would clear AA everywhere it is used.",
  },
  {
    item: "api/stripe/webhook-test.php",
    detail:
      "A sandbox-only near-copy of the live webhook, marked TEMPORARY in its own header. It fails closed on production (503) because it reads `stripe.webhook_secret_test`, which the shipped config template does not define.",
    action:
      "Delete it at deployment. It is safe if it ships, but it widens the surface for no benefit now that the contract it existed to prove has been verified.",
  },
  {
    item: "Duplicate <title> elements",
    detail:
      "Every page carries the static title from index.html plus the one react-helmet-async adds. The effective title resolves correctly on every route. Site-wide and pre-existing.",
    action:
      "Remove the static <title> from index.html when a sprint is touching that file anyway.",
  },
];
