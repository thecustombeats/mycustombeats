/**
 * REFUNDS & CANCELLATIONS — the plain-language half.
 *
 * The Terms are the contract. This is the same rules said the way a customer
 * would ask about them, with the clause each answer comes from. Two documents,
 * one set of rules; if they ever disagree, the disagreement is visible because
 * every section names its clause.
 *
 * The old page said "No refunds once songwriting or production has started"
 * and "Issues must be reported within 48 hours". The first was a blanket
 * statement with no carve-out for MCB's own mistakes. The second read as a
 * two-day expiry on rights that do not expire in two days. Neither survives.
 */

export interface RefundSection {
  heading: string;
  /** The question a customer would actually ask. */
  question: string;
  body: readonly string[];
  points?: readonly string[];
  /** The Terms clause this restates, for cross-checking. */
  clause: string;
}

export const REFUNDS_INTRO =
  "Everything we make is made for one person, and we start as soon as you order. That changes how refunds work compared with buying something off a shelf, so here is exactly where you stand — including the parts that are in your favour.";

export const REFUND_SECTIONS: readonly RefundSection[] = [
  {
    heading: "Changing your mind before we have started",
    question: "I have just ordered and changed my mind.",
    body: [
      "Tell us straight away. If we genuinely have not started, we will refund you in full.",
      "Because we begin quickly — a Moment is written within the hour — 'straight away' can mean a very short window. It is worth a message rather than an email.",
    ],
    clause: "cancellation",
  },
  {
    heading: "Changing your mind after we have started",
    question: "You have already begun. Can I still cancel?",
    body: [
      "Yes, within the 14-day cancellation period, and we may charge a fair amount for the work already done. You asked us to start early at checkout, and this is what that meant.",
      "How much depends on how far we had got. If we had written and produced your song, that is most of the work. If we had barely begun, it is not.",
    ],
    clause: "cancellation",
  },
  {
    heading: "Music files we have already sent you",
    question: "You have sent me the audio. Can I cancel that?",
    body: [
      "Once we have sent your finished music files, the right to cancel that digital content has ended — you confirmed you understood this at checkout, on its own checkbox.",
      "Anything physical in the same order is treated separately, and your rights if the files are faulty or not what you ordered are untouched.",
    ],
    clause: "cancellation",
  },
  {
    heading: "Personalised and made-to-order items",
    question: "Can I return the record, frame or engraved piece?",
    body: [
      "Where an item has genuinely been personalised or made specifically for you, the ordinary right to change your mind does not apply once that personalisation or manufacture has begun. It carries someone's name and story; we cannot sell it to anybody else.",
      "This depends on the actual item and the actual stage. It is not a blanket rule that everything we sell is unreturnable the moment you click pay.",
    ],
    clause: "cancellation",
  },
  {
    heading: "After you have approved your work",
    question: "I approved it, and now I want it different.",
    body: [
      "Once you have approved your work and we have begun manufacturing, your included refinements are closed and the order is locked.",
      "We can still make the change — as new work, quoted first. We will tell you what it costs before doing anything.",
    ],
    clause: "production-lock",
  },
  {
    heading: "If something is wrong with what we sent",
    question: "It arrived damaged, or it is not what I ordered.",
    body: [
      "Then it is ours to put right, and none of the above applies. We will repair, replace, remake or refund as appropriate.",
      "This is true whether or not your order was locked, and whether or not the item was personalised. The lock exists so we are not asked to press a second record because you changed your mind. It does not exist to avoid fixing a record we pressed wrong.",
      "Please tell us as soon as you reasonably can — a photograph usually settles it in one message, and carriers keep their records for a limited time. Getting in touch later does not remove your legal rights.",
    ],
    clause: "if-we-get-it-wrong",
  },
  {
    heading: "It has not arrived when I expected",
    question: "The date you showed me has passed.",
    body: [
      "The timings on the site are estimates, not guaranteed arrival dates — the carrier's leg is not ours to control. If we agreed a specific date with you in writing, that is different, and that date applies.",
      "Either way, tell us. If it is late because of something we did, that is ours to put right and your legal rights apply in the ordinary way. If it is stuck in a customs queue or with a courier, we will chase it with you.",
    ],
    clause: "delivery",
  },
  {
    heading: "It arrived broken",
    question: "The frame is cracked / the record is chipped.",
    body: [
      "Stop using it — a cracked frame is something to put down rather than handle carefully — and send us a photograph when you can.",
      "We will repair, replace, remake or refund as appropriate. There is no deadline on this: getting in touch early helps us establish what happened while carriers still hold their records, but it is a request rather than a condition and it does not affect your legal rights.",
    ],
    clause: "damaged-products",
  },
  {
    heading: "How refunds are paid",
    question: "How do I get the money back?",
    body: [
      "To the card or account you paid from, normally within a few working days of us agreeing the refund. We cannot refund to a different account.",
    ],
    clause: "payment",
  },
  {
    heading: "The Full Package",
    question: "What about a concierge commission?",
    body: [
      "A Full Package enquiry is not a purchase, so there is nothing to cancel and nothing has been charged.",
      "Once a proposal is agreed, that commission's own written terms — including its cancellation and payment terms — are what apply.",
    ],
    clause: "cancellation",
  },
  {
    heading: "Where you live",
    question: "I am not in the UK.",
    body: [
      "We use UK law as our baseline, and nothing in our policy removes consumer rights that your own country's law gives you and does not allow to be waived.",
    ],
    clause: "law",
  },
];

/**
 * The line the whole page exists to make unmissable.
 *
 * Rendered prominently rather than as a footnote, because the single most
 * likely misreading of a made-to-order refund policy is that it also covers
 * MCB's own mistakes.
 */
export const STATUTORY_RIGHTS_NOTICE =
  "Nothing on this page affects your legal rights if what we supply is faulty, not as described, or does not match what you ordered.";
