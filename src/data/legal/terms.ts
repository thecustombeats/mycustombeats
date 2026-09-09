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
import {
  AGREED_DATE_EXCEPTION,
  RECOMMENDED_PLANNING_DAYS,
  TRAVEL_NOTICE,
} from "./delivery";

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
    body: [
      "The times we show are ESTIMATES. They are honest ones, based on how long this work actually takes, and they cover everything from writing your music to the parcel reaching your door — but they are not guaranteed arrival dates, and we would rather say so plainly than let you find out.",
      "The reason is the last stage. We control the writing, the production, the making and the sending. We do not control the carrier's van, a customs queue, a snowstorm or a missed delivery attempt, and no promise we made would change that.",
      AGREED_DATE_EXCEPTION,
      "So if a date matters, tell us the date before you order. We will tell you honestly whether we can meet it, and if we agree one in writing, we mean it.",
    ],
    footnote:
      "If we are late because of something we did, that is our responsibility and your statutory rights apply in the ordinary way. An estimate is not a disclaimer.",
  },
  {
    id: "planning-ahead",
    heading: "13. Ordering for a particular occasion",
    body: [
      "Much of what we make is for a wedding, an anniversary, a milestone birthday, a memorial, a cruise or a holiday — a day that does not move.",
      `Because of that, we strongly recommend placing your order at least ${RECOMMENDED_PLANNING_DAYS} working days before the date you need it. That is a planning recommendation, not a delivery promise: it is how long to allow, not a date we commit to.`,
      TRAVEL_NOTICE,
      "Please do not make non-refundable travel, accommodation or event arrangements on the strength of an estimated delivery date. If something depends on your order arriving by a particular day, ask us to agree that date in writing first.",
    ],
    footnote:
      "None of this applies to a date we have expressly agreed with you, and none of it affects your rights if we fail to do something we agreed to do.",
  },
  {
    id: "your-delivery-details",
    heading: "14. The delivery details you give us",
    body: [
      "We send your order to the details you give us, so please check them: the recipient's name, the address, the postcode or ZIP, and a contact number or email the carrier can use.",
      "Where a delay, a failed delivery or a return to us is genuinely caused by details that were incorrect or incomplete, we will do what we can to put it right — but remaking a personalised item, or posting it a second time, can involve a further charge. We will tell you what it is before doing anything.",
    ],
    footnote:
      "This does not apply where the problem was ours, and it does not affect your statutory rights.",
  },
  {
    id: "international-delivery",
    heading: "15. Deliveries outside the United Kingdom",
    body: [
      "We ship internationally. Orders crossing a border go through customs, import procedures and whatever checks the destination country applies, and how long that takes is decided by those authorities rather than by us or the carrier.",
      "Any import duties, taxes or customs charges that apply are payable by the recipient — unless we have expressly stated otherwise at checkout, or the law of the destination requires otherwise.",
      "We cannot predict or influence a customs inspection. If your order is going abroad for a particular occasion, please allow considerably more time.",
    ],
  },
  {
    id: "handling-physical-products",
    heading: "16. Looking after physical items",
    body: [
      "Some of what we make is a physical object: a pressed record, a framed print, a glazed frame, a presentation box, a printed booklet, a keepsake. These are made to be kept, not to be tested.",
      "Please handle them with reasonable care. Depending on the item, they can have edges, corners, glass or glazed panels, small parts, or materials that mark, chip or break if dropped or mishandled.",
      "Where appropriate for the item, please keep it away from young children, vulnerable people and animals unless it is expressly intended for them, and follow any care or safety information supplied with it.",
    ],
    footnote:
      "This is ordinary care for ordinary objects. It is not a suggestion that anything we sell is dangerous.",
  },
  {
    id: "damaged-products",
    heading: "17. If something arrives damaged",
    body: [
      "If an item reaches you cracked, chipped, shattered, broken or otherwise structurally damaged, please stop using it. A broken frame or a cracked record is not something to handle carefully — it is something to put down.",
      "Then tell us as soon as you reasonably can, and please send a photograph if you are able to. It usually settles the matter in one message, and carriers keep their records for a limited time, so getting in touch early genuinely helps.",
      "We will then repair, replace, remake or refund as appropriate.",
    ],
    footnote:
      "There is no deadline on this. Contacting us promptly helps us, but it is a request rather than a condition, and it does not affect your legal rights — see clause 8.",
  },
  {
    id: "misuse",
    heading: "18. Misuse and improper handling",
    body: [
      "We are not responsible for injury, loss or damage that is genuinely caused by an item being misused rather than by anything wrong with the item.",
      "By that we mean things like: using it for something it was plainly not made for, continuing to use it after visible damage, taking it apart, altering or repairing it without our agreement, ignoring safety information we supplied, or a failure to take reasonable care by you or someone else.",
      "The cause is what matters here. This clause is about what somebody did with the item; it has nothing to say about an item that was faulty, unsafe or not what you ordered when it reached you.",
    ],
    footnote:
      "Nothing in this clause limits our responsibility for death or personal injury caused by our negligence, for defective products, or for anything else the law does not allow us to exclude.",
  },
  {
    id: "how-we-fulfil",
    heading: "19. How we make and send things",
    body: [
      "We work with specialist manufacturers, fulfilment partners, postal operators and couriers for pressing, printing and delivery. That is normal for work of this kind and it is how the quality is achieved.",
      "Your contract is with us. If something goes wrong at any point in that chain, it is ours to resolve with you — we will not point you at a supplier you never dealt with. Using a subcontractor is not a way for us to stop being responsible.",
      "What we genuinely cannot answer for is an event outside our reasonable control that we did not cause: courier delays, customs or border processing, import inspections, severe weather, transport disruption, industrial action, public holidays, a local postal disruption, an unsuccessful delivery attempt, or a supply-chain failure of the same kind. Where one of those affects your order we will tell you, and we will do what we reasonably can to put it right.",
    ],
    footnote:
      "That is about events, not about parties. The fact that another company was involved does not by itself make something outside our control.",
  },
  {
    id: "content-we-can-decline",
    heading: "20. Content we will not produce",
    body: [
      "We may decline or ask you to change a submission that is abusive, harassing, hateful, defamatory, sexually explicit, or that we believe would harm someone.",
      "If we decline before starting work, you get your money back. If it only becomes apparent later, we will talk to you about it.",
    ],
  },
  {
    id: "liability",
    heading: "21. Our responsibility to you",
    body: [
      "We take our work seriously and we accept responsibility for it. Where we are at fault, we are responsible for the losses that are a foreseeable result of that — including, where it applies, putting right an order we got wrong.",
      "What we are not responsible for is loss that we did not cause. In practice that means: loss arising from an event outside our reasonable control that was not our doing; loss caused by an item being misused or mishandled rather than by anything wrong with it; loss caused by delivery details that were given to us incorrectly; and loss that was not a foreseeable consequence of anything we did.",
      "These experiences are sold to you as a consumer, for personal use, so we do not accept responsibility for business losses such as lost profit, lost revenue or lost business opportunity.",
      "There are things the law does not allow anyone to exclude, and we do not attempt to: liability for death or personal injury caused by negligence, for fraud, for defective products, and for your statutory rights in goods, digital content and services.",
    ],
    footnote:
      "Music is subjective. A refinement is how we respond to that, and we would rather use one than argue about taste.",
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
    body: [TERMS_CHANGE_POLICY],
  },
  {
    id: "law",
    heading: "24. Law, and where you live",
    body: [
      "These terms are governed by the law of England and Wales, and the courts of England and Wales have jurisdiction.",
      "We sell internationally. If you are a consumer somewhere else, nothing here takes away rights that the law of your own country gives you and does not allow to be signed away.",
    ],
  },
  {
    id: "acceptance",
    heading: "25. Accepting these terms",
    body: [
      "When you place an order you confirm that you have read and agree to these terms, and we record which version you accepted along with the date and time. Your confirmation email names that version, so you always have your own copy of what applied to your order.",
      "These terms include the parts that are easy to skip and matter most: that delivery times are estimates unless we agree a date in writing, that we recommend allowing fifteen working days for anything with a date attached, how international deliveries and customs work, how to look after and stop using a damaged physical item, and where our responsibility to you begins and ends.",
      "If we update these terms later, your order stays governed by the version you accepted — see clause 23.",
    ],
    footnote:
      "You are also asked separately, at checkout, to request that we begin work straight away and — where your order includes digital music — to acknowledge what that means for cancelling it. Those are their own decisions and are recorded separately.",
  },
  {
    id: "contact",
    heading: "26. Talking to us",
    body: [
      "If something is not right, or you are unsure where you stand, write to us before assuming the answer. Most of what these terms describe never needs to be relied on, because it is settled in a conversation.",
    ],
  },
];
