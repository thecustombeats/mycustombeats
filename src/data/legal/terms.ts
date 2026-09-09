/**
 * THE TERMS & CONDITIONS, AS DATA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE WORDING IS THE FOUNDER'S
 * ─────────────────────────────────────────────────────────────────────────
 * The clause set below was supplied by the Founder and replaced the previous
 * one wholesale. It is reproduced as given: nothing was restored, softened,
 * re-expanded or rewritten back toward the earlier drafting, and no paragraph
 * was added that the Founder did not write.
 *
 * The clauses live here rather than in the page for the same reason they
 * always did — the Refunds page and the FAQ have to agree with them, and
 * three hand-written copies of a rule is how a business ends up unable to say
 * what its own policy is.
 *
 * Package entitlements are still DERIVED from `data/packages.ts` rather than
 * typed out, so the contract and the product card cannot disagree about how
 * many refinements a customer has.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOT LEGALLY REVIEWED
 * ─────────────────────────────────────────────────────────────────────────
 * LEGAL REVIEW REQUIRED BEFORE FINAL PRODUCTION RELEASE. Several of these
 * clauses attempt exclusions that consumer law does not permit a trader to
 * make; each is recorded specifically in `review.ts`. That is the Founder's
 * decision to take, and it is written down there rather than argued with
 * here.
 */

/**
 * Only the package entitlements are imported now.
 *
 * The previous clause set drew on a refinement definition, a scope-change
 * rule, an agreed-date exception, a travel notice and a change policy. The
 * Founder's wording uses none of them, so they are no longer imported here.
 * Those constants still exist and are still used elsewhere — deleting them
 * would be editing the Founder's decision into other pages, which it is not.
 */
import { PACKAGES, isConcierge, type AnyPackage } from "../packages";

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
  "These terms apply when you order from My Custom Beats.";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * FOUNDER-SUPPLIED WORDING. REPLACED WHOLESALE, NOT EDITED.
 * ─────────────────────────────────────────────────────────────────────────
 * The Founder rejected the previous clause set and supplied this one. It is
 * reproduced as given. Clauses were not restored, softened, re-expanded or
 * rewritten back toward the earlier drafting, and no paragraph has been
 * added that the Founder did not write.
 *
 * The numbering intentionally skips 13, 16, 19, 21 and 24. Those gaps are
 * the Founder's, and inventing clauses to fill them would be adding terms
 * nobody approved.
 *
 * ONLY UNAMBIGUOUS TYPOGRAPHICAL FIXES WERE MADE, each listed in the
 * implementation report. Where a sentence had more than one possible reading
 * it was left exactly as supplied rather than guessed at.
 *
 * THIS WORDING HAS NOT BEEN REVIEWED BY A SOLICITOR, and several clauses are
 * recorded in `review.ts` as attempting exclusions that consumer law does not
 * permit a trader to make. That is the Founder's decision to take; it is
 * written down rather than argued about here.
 */
export const TERMS_CLAUSES: readonly Clause[] = [
  {
    id: "what-we-make",
    heading: "1. What we make",
    body: [
      "We write and produce personalised music from the story you give us, and — depending on what you choose — we press, print, frame or engrave physical items carrying that work.",
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
      "Payment is taken before we begin and order.",
    ],
  },
  {
    id: "refinements",
    heading: "4. Refinements",
    body: [
      "As soon as a song goes to Vinyl pressing, no refinements can be made.",
    ],
  },
  {
    id: "approval",
    heading: "5. Approving your work",
    body: [
      "When your work is ready we send it to you. Nothing is manufactured until payment is received.",
      "At checkout you accept the terms of the purchase.",
    ],
  },
  {
    id: "production-lock",
    heading: "6. When your order can no longer be changed",
    body: [
      "Once you have approved your work, and once we have begun anything irreversible — pressing a record, printing, engraving, framing — your order is locked and included refinements are closed.",
      "After that point, a change to the creative work is a new piece of work.",
    ],
  },
  {
    id: "cancellation",
    heading: "7. Cancelling",
    body: [
      "There is no cancellation of the product service after payment.",
      "There is a no refund policy.",
    ],
  },
  {
    id: "if-we-get-it-wrong",
    heading: "8. What if my item arrives faulty or damaged",
    body: [
      "We at MCB do not take any responsibility for courier damages. If your products arrive damaged you will need to take this up with the courier service. For the guest in these circumstances you may send us photos and we can arrange a reasonable customer service price for your items to be resent to you.",
    ],
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
      "What we make is an original composition. We do not reproduce or imitate a specific recording or a particular artist's voice, and we may adapt or decline a request that would use someone else's protected work, name or likeness in a way we are not entitled to.",
    ],
  },
  {
    id: "rights-in-the-work",
    heading: "11. Rights in what we make",
    body: [
      "You receive your finished work for your own personal use — to keep, to play, to give to the person it was made for, and to share privately with family and friends.",
      "We keep the underlying rights in the composition, recording and production. Commercial use — broadcast, advertising, commercial release, or use in a business's own marketing — is not included in the standard experiences.",
      "No commercial or exclusive rights. It is arrangeable, and it is a different agreement with a different price.",
    ],
  },
  {
    id: "delivery",
    heading: "12. Timing and delivery",
    body: [
      "The times we show are ESTIMATES only. They are honest ones, based on how long this work actually takes, and they cover everything from writing your music to the parcel reaching your door — but they are not guaranteed arrival dates, and we would rather say so plainly than let you find out.",
      "If a date matters, please make sure it falls within the time of delivery.",
      "An estimate is not a disclaimer.",
    ],
  },
  {
    id: "your-delivery-details",
    heading: "14. The delivery details you give us",
    body: [
      "We send your order to the details you give us, so please check them: the recipient's name, the address, the postcode or ZIP, and a contact number or email the carrier can use.",
    ],
  },
  {
    id: "international-delivery",
    heading: "15. Deliveries",
    body: [
      "We ship internationally. Orders crossing a border go through customs, import procedures and whatever checks the destination country applies, and how long that takes is decided by those authorities rather than by us or the carrier.",
      "Any import duties, taxes or customs charges that apply are payable by the recipient — unless we have expressly stated otherwise at checkout, or the law of the destination requires otherwise.",
      "We cannot predict or influence a customs inspection. If your order is going abroad for a particular occasion, please allow considerably more time.",
    ],
  },
  {
    id: "damaged-products",
    heading: "17. If something arrives damaged",
    body: [
      "If an item reaches you cracked, chipped, shattered, broken or otherwise structurally damaged, please stop using it. A broken frame or a cracked record is not something to handle carefully — it is something to put down.",
      "Then tell us as soon as you reasonably can, and please send a photograph if you are able to. It usually settles the matter in one message, and carriers keep their records for a limited time, so getting in touch early genuinely helps.",
      "We will then repair, replace, remake or refund as appropriate as a reasonable discount price if done within 24 hours of delivery date. You must keep a copy of delivery date with your claim.",
    ],
  },
  {
    id: "misuse",
    heading: "18. Misuse and improper handling",
    body: [
      "We are not responsible for injury, loss or damage that is genuinely caused by an item being misused rather than by anything wrong with the item.",
      "By that we mean things like: using it for something it was plainly not made for, continuing to use it after visible damage, taking it apart, altering or repairing it without our agreement, ignoring safety information we supplied, or a failure to take reasonable care by you or someone else.",
      "This clause is about what somebody did with the item; it has nothing to say about an item that was faulty, unsafe or not what you ordered when it reached you.",
      "MCB has no responsibility for death or personal injury caused by neglect or defective products.",
    ],
  },
  {
    id: "content-we-can-decline",
    heading: "20. Content we will not produce",
    body: [
      "We may decline or ask you to change a submission that is abusive, harassing, hateful, defamatory, sexually explicit, or that we believe would harm someone.",
      "If we decline before starting work, you get your money back. If it only becomes apparent later, we will talk to you about it.",
      "If MCB does take on your work, it becomes your full responsibility if anything happens regarding a legal case.",
    ],
  },
  {
    id: "your-information",
    heading: "22. Your information",
    body: [
      "We use your details to create and deliver your order, and to talk to you about it. We do not sell your personal information and we do not share it for anyone else's marketing.",
      "We do rely on a small number of service providers to operate — payment processing, email delivery, file hosting, our website host and our own records — and your information passes through them for those purposes only. Our Privacy Policy names what they do.",
    ],
  },
  {
    id: "changes",
    heading: "23. Changes to these terms",
    body: [
      "We may update these terms from time to time. Any change applies to orders placed before and after the new versions take effect.",
    ],
  },
  {
    id: "acceptance",
    heading: "25. Accepting these terms",
    body: [
      "When you place an order you confirm that you have read and agree to these terms, and we record which version you accepted along with the date and time. Your confirmation email names that version, so you always have your own copy of what applied to your order.",
      "You are also asked separately, at checkout, to request that we begin work straight away and — where your order includes digital music — to acknowledge what that means for cancelling it. Those are their own decisions and are recorded separately.",
    ],
  },
];
