/**
 * THE TERMS & CONDITIONS, AS DATA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE WORDS LIVE HERE AND NOT IN THE PAGE
 * ─────────────────────────────────────────────────────────────────────────
 * The refund rule was previously written three times — in Terms, in the
 * Refunds page and in the FAQ — and all three said something slightly
 * different. That is how a business ends up unable to answer what its own
 * policy is.
 *
 * The clauses live here; the pages render them. The Refunds page states the
 * same rules in plainer language and cross-references the clause numbers, so
 * the two can be read side by side and disagree visibly if anyone ever makes
 * them disagree.
 *
 * Package entitlements are NOT restated here. `revisionsFor` reads them from
 * `data/packages.ts`, so the terms cannot promise two refinements while the
 * package card promises three.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS DRAFTING TRIES TO DO
 * ─────────────────────────────────────────────────────────────────────────
 * Be readable, be accurate about a genuinely made-to-order business, and not
 * reach for protections that would be unenforceable anyway. A term that tries
 * to exclude a right the customer cannot lose does not protect MCB — it
 * simply fails, and makes the rest of the document look like it was written
 * to catch people out.
 *
 * LEGAL REVIEW REQUIRED BEFORE FINAL PRODUCTION RELEASE. See `review.ts`.
 */

import { PACKAGES, isConcierge, type AnyPackage } from "../packages";
import {
  REFINEMENT_DEFINITION,
  REFINEMENT_EXCLUSIONS,
  SCOPE_CHANGE_TREATMENT,
} from "./production";
import { TERMS_CHANGE_POLICY } from "./versions";

/* ------------------------------------------------------------------ */
/* Package entitlements, read from the commercial source of truth      */
/* ------------------------------------------------------------------ */

export interface RevisionEntitlement {
  packageName: string;
  entitlement: string;
  concierge: boolean;
}

/**
 * What each experience actually includes, read from `packages.ts`.
 *
 * Derived rather than restated, so a repricing or a change of entitlement
 * updates the terms with no edit here — and so nobody can change a package
 * card without the contract following.
 */
export const revisionEntitlements = (
  packages: readonly AnyPackage[] = PACKAGES
): readonly RevisionEntitlement[] =>
  packages.map((pkg) => ({
    packageName: pkg.name,
    entitlement: pkg.revisions,
    concierge: isConcierge(pkg),
  }));

/* ------------------------------------------------------------------ */
/* Clauses                                                             */
/* ------------------------------------------------------------------ */

export interface Clause {
  /** Stable id, so the Refunds page and support can cite it. */
  id: string;
  heading: string;
  /** Paragraphs, in order. */
  body: readonly string[];
  /** Optional bulleted points beneath the body. */
  points?: readonly string[];
  /** A short closing line, e.g. a statutory-rights preservation. */
  footnote?: string;
}

export const TERMS_INTRO =
  "These terms apply when you order from My Custom Beats. We have tried to write them in plain English, because what you are buying is personal and often cannot be remade — so it matters that you can see, before you order, what you can change, when you can change it, and what happens if we get something wrong.";

export const TERMS_CLAUSES: readonly Clause[] = [
  {
    id: "what-we-make",
    heading: "1. What we make",
    body: [
      "Everything we sell is made for you. We write and produce personalised music from the story you give us, and — depending on what you choose — we press, print, frame or engrave physical items carrying that work.",
      "That has two consequences worth stating at the start. The work cannot be taken off a shelf, so we begin as soon as you order. And once something has been pressed or printed with your words on it, it cannot be sold to anybody else.",
    ],
  },
  {
    id: "your-order",
    heading: "2. Your order and our agreement",
    body: [
      "Your order is an offer to buy. Our agreement is formed when we confirm your order, which we do by email after your payment is taken.",
      "That confirmation names the version of these terms your order is governed by. We record that version against your order, so it stays identifiable even after we later update this page.",
    ],
  },
  {
    id: "payment",
    heading: "3. Payment",
    body: [
      "Prices are shown in pounds sterling and that is what we charge. Where the site shows an approximate figure in another currency it is an estimate for your convenience, converted at a live rate — your bank's rate on the day is what actually applies.",
      "Payment is taken before we begin, because we begin immediately and the work has no resale value if it is not completed.",
    ],
  },
  {
    id: "refinements",
    heading: "4. Refinements",
    body: [
      "Each experience includes refinements. How many depends on what you chose, and the number is shown on the experience itself.",
      REFINEMENT_DEFINITION,
      SCOPE_CHANGE_TREATMENT,
    ],
    points: REFINEMENT_EXCLUSIONS.map(
      (exclusion) => `A refinement is not ${exclusion}.`
    ),
  },
  {
    id: "approval",
    heading: "5. Approving your work",
    body: [
      "When your work is ready we send it to you. Nothing is manufactured until you tell us it is right.",
      "Approving your work is a separate step from agreeing to these terms at checkout. At checkout you accept the terms of the purchase, for something that does not exist yet. Approval comes later, once you have heard what we made.",
      "We record your approval — when it happened and how you gave it, whether by email, by message, or in a call.",
    ],
  },
  {
    id: "production-lock",
    heading: "6. When your order can no longer be changed",
    body: [
      "Once you have approved your work, and once we have begun anything irreversible — pressing a record, printing, engraving, framing — your order is locked and included refinements are closed.",
      "After that point, a change to the creative work is a new piece of work. We will tell you what it involves and what it costs, and you can decide. We will not make the change and then invoice you for it without asking.",
    ],
    footnote:
      "This is about changes of mind. It has nothing to do with mistakes: see clause 8.",
  },
  {
    id: "cancellation",
    heading: "7. Cancelling",
    body: [
      "If you are a consumer, you ordinarily have 14 days to cancel a distance purchase. Two things affect how that applies to us, and we ask you about both at checkout rather than burying them here.",
      "First, we start straight away, because you have asked us to. If you cancel within the 14 days after asking us to begin, you can do so, and we may charge you a fair amount for the work already done up to that point.",
      "Second, goods made or personalised specifically for you fall outside the ordinary right to change your mind, where the law allows that. This applies once your item has actually been personalised or made for you — it is not a blanket rule covering everything in our catalogue regardless of what stage it has reached.",
      "For digital music files, the right to cancel ends once we have sent them to you, where you have consented to that and acknowledged the consequence. That is the third checkbox at checkout.",
    ],
    footnote:
      "None of this affects your rights if what we supply is faulty, not as described, or otherwise does not conform to your order.",
  },
  {
    id: "if-we-get-it-wrong",
    heading: "8. If we get something wrong",
    body: [
      "If what arrives is faulty, damaged in a way we or our fulfilment partners are responsible for, not as described, or materially different from what you ordered, we will put it right — by repairing, replacing, remaking or refunding, as appropriate.",
      "This applies whether or not your order is locked, and whether or not the item was personalised. A production lock protects us from paying twice for a change of creative direction. It is not a way of avoiding responsibility for something we made incorrectly, and we will not use it as one.",
      "Please tell us as soon as you reasonably can, ideally within a few days of receiving your order, because it helps us establish what happened while carriers still hold their records. Telling us later does not remove your legal rights.",
    ],
    footnote:
      "Your statutory rights under the Consumer Rights Act 2015 apply in full and are not affected by anything in these terms.",
  },
  {
    id: "materials-you-give-us",
    heading: "9. The material you give us",
    body: [
      "To make your work we need what you send: your story, names, photographs, text, lyrics you have written, artwork, or audio you point us to.",
      "By sending it you confirm you are entitled to give it to us for this purpose. You keep ownership of it — we are not asking you to sign over your family photographs. You give us permission to use it only so far as we need to in order to create, produce and deliver your order, and to keep a record of the work we made.",
      "If we need to use something of yours more widely — in a sample on our website, for instance — we will ask you separately.",
    ],
  },
  {
    id: "third-party-rights",
    heading: "10. References to other people's work",
    body: [
      "You are welcome to tell us the artists, songs or styles you love, and we will use that to understand the feeling you are after.",
      "What we make is an original composition. We do not reproduce or imitate a specific recording or a particular artist's voice, and we may adapt or decline a request that would use someone else's protected work, name or likeness in a way we are not entitled to. If that affects what you asked for, we will tell you and suggest an alternative.",
    ],
  },
  {
    id: "rights-in-the-work",
    heading: "11. Rights in what we make",
    body: [
      "You receive your finished work for your own personal use — to keep, to play, to give to the person it was made for, and to share privately with family and friends.",
      "We keep the underlying rights in the composition, recording and production. Commercial use — broadcast, advertising, commercial release, or use in a business's own marketing — is not included in the standard experiences.",
      "If you need commercial or exclusive rights, tell us before we start. It is arrangeable, and it is a different agreement with a different price.",
    ],
    footnote:
      "The scope of rights granted with a Full Package commission is agreed in that commission's own written proposal.",
  },
  {
    id: "delivery",
    heading: "12. Timing and delivery",
    /**
     * These paragraphs have to agree with the delivery line on every package
     * card — "Delivered within 1 hour", "Delivered within 15 working days".
     * An earlier draft said transit was "added on top" of the quoted time,
     * which would have made the terms contradict the headline promise on the
     * product the customer just bought. The quoted window is end to end.
     */
    body: [
      "The times we quote — an hour for a Moment, fifteen working days for the others — are what we aim for end to end: writing, producing, and where relevant manufacturing and posting. They are targets we work to, not guarantees, and they depend in part on how quickly we hear back from you at the points where we need you.",
      "Once something is with a carrier, its progress is in their hands rather than ours. We do not guarantee an arrival date unless we have agreed one with you in writing — and if we have agreed one, we mean it.",
      "If you are ordering for a particular date, tell us the date. We would rather say no than miss it.",
    ],
  },
  {
    id: "how-we-fulfil",
    heading: "13. How we make and send things",
    body: [
      "We work with specialist manufacturers and fulfilment partners for pressing, printing and delivery. That is normal for work of this kind and it is how the quality is achieved.",
      "Your contract is with us. If something goes wrong at any point in that chain, it is ours to resolve with you — we will not point you at a supplier you never dealt with.",
    ],
  },
  {
    id: "content-we-can-decline",
    heading: "14. Content we will not produce",
    body: [
      "We may decline or ask you to change a submission that is abusive, harassing, hateful, defamatory, sexually explicit, or that we believe would harm someone.",
      "If we decline before starting work, you get your money back. If it only becomes apparent later, we will talk to you about it.",
    ],
  },
  {
    id: "liability",
    heading: "15. Our responsibility to you",
    body: [
      "We take our work seriously and we accept responsibility for it. Where we are at fault, we are responsible for losses that are a foreseeable result of our breach.",
      "We are not responsible for losses that were not foreseeable, or for business losses — these experiences are sold to you as a consumer, for personal use.",
      "There are things the law does not allow anyone to exclude, and we do not attempt to: liability for death or personal injury caused by negligence, for fraud, and for breaches of your statutory rights in goods, digital content and services.",
    ],
    footnote:
      "Music is subjective. A refinement is how we respond to that, and we would rather use one than argue about taste.",
  },
  {
    id: "your-information",
    heading: "16. Your information",
    body: [
      "We use your details to create and deliver your order, and to talk to you about it. We do not sell your personal information and we do not share it for anyone else's marketing.",
      "We do rely on a small number of service providers to operate — payment processing, email delivery, file hosting, our website host and our own records — and your information passes through them for those purposes only. Our Privacy Policy names what they do.",
    ],
  },
  {
    id: "changes",
    heading: "17. Changes to these terms",
    body: [TERMS_CHANGE_POLICY],
  },
  {
    id: "law",
    heading: "18. Law, and where you live",
    body: [
      "These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.",
      "We sell internationally. If you are a consumer somewhere else, nothing here takes away rights that the law of your own country gives you and does not allow to be signed away.",
    ],
  },
  {
    id: "contact",
    heading: "19. Talking to us",
    body: [
      "If something is not right, or you are unsure where you stand, write to us before assuming the answer. Most of what these terms describe never needs to be relied on, because it is settled in a conversation.",
    ],
  },
];
