/**
 * PRIVACY — the actual data flows, and the policy rendered from them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────
 * The Privacy Policy said "We do not sell or share your data". Sprint 8
 * removed that sentence because it was false — a customer's order passes
 * through a payment processor, an email service, a media host and MCB's own
 * database before it can exist at all. But removing a false statement is not
 * the same as making a true one, and what replaced it was still a thin page
 * that named no processor and described no retention.
 *
 * `PROCESSORS` below is the inventory: every third party this codebase
 * actually sends personal data to, with what it receives and why. Each entry
 * was read out of the source, not assumed — the `evidence` field names the
 * file, so a reviewer can check any line in a minute rather than taking it on
 * trust.
 *
 * The customer-facing page renders from this list. One source, so the policy
 * cannot quietly fall behind the code the way it did before.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS NOT A COMPLETED UK GDPR REVIEW, and publishing it does not make MCB
 * compliant. Lawful bases, retention periods, international transfer
 * mechanisms, the cookie consent position and the DPA chain with each
 * processor all need a qualified opinion. That remains BLOCKING in
 * `review.ts`.
 *
 * What this does is remove the excuse that nobody knew what the data flows
 * were. They are written down now, accurately, so the review can actually
 * happen.
 */

/* ------------------------------------------------------------------ */
/* The inventory                                                       */
/* ------------------------------------------------------------------ */

export interface Processor {
  name: string;
  /** What MCB uses them for, in one line a customer would understand. */
  purpose: string;
  /** What personal data actually reaches them. Read from the code. */
  receives: string;
  /** The file that proves it, so a reviewer can check rather than trust. */
  evidence: string;
  /**
   * Whether this is on the ordinary customer path, or only on a side
   * journey. A customer buying a song does not touch the partner form.
   */
  scope: "EVERY_ORDER" | "SOME_ORDERS" | "SIDE_JOURNEY" | "EVERY_VISITOR";
}

export const PROCESSORS: readonly Processor[] = [
  {
    name: "Stripe",
    purpose: "Takes your payment.",
    receives:
      "Your name, email address and the amount. Your card details go straight to Stripe — they never reach MCB's servers at all.",
    evidence: "data/packages.ts (Payment Links), api/lib/stripe.php",
    scope: "EVERY_ORDER",
  },
  {
    name: "Resend",
    purpose: "Sends your order confirmation, and later a request for feedback.",
    receives:
      "Your name, email address, MCB reference, what you ordered and the amount paid.",
    evidence: "api/lib/notify.php, api/lib/lifecycle.php",
    scope: "EVERY_ORDER",
  },
  {
    name: "Hostinger",
    purpose: "Hosts the website and MCB's database.",
    receives:
      "Everything you send us, because it is where the site and the records live.",
    evidence: "deployment target for public_html and the MariaDB database",
    scope: "EVERY_VISITOR",
  },
  {
    name: "Make.com",
    purpose: "Passes your order to MCB's production workflow.",
    receives:
      "Your order details including your contact information and the story you wrote for us.",
    evidence: "sections/OrderFormSection.tsx",
    scope: "EVERY_ORDER",
  },
  {
    name: "Cloudinary",
    purpose: "Stores artwork and photographs you choose to upload.",
    receives: "The image files you send us, and nothing else.",
    evidence: "sections/OrderFormSection.tsx",
    scope: "SOME_ORDERS",
  },
  {
    name: "Google Analytics",
    purpose: "Tells us how people use the site so we can improve it.",
    receives:
      "Pages viewed, actions taken, and an identifier your browser is given. We do not send it your name, your email or anything you wrote to us.",
    evidence: "lib/analytics.ts",
    scope: "EVERY_VISITOR",
  },
  {
    name: "Google Fonts",
    purpose: "Serves the typefaces the site is set in.",
    receives:
      "Your IP address, as a consequence of your browser fetching the font files.",
    evidence: "index.html",
    scope: "EVERY_VISITOR",
  },
  {
    name: "YouTube",
    purpose: "Plays the sample videos embedded on some pages.",
    receives:
      "Your IP address, and cookies YouTube sets, if a video is present on a page you visit.",
    evidence: "index.html, sections/Footer.tsx, pages/About.tsx",
    scope: "EVERY_VISITOR",
  },
  {
    name: "Formspree",
    purpose: "Receives partner and business enquiries.",
    receives: "What you type into the partner enquiry form.",
    evidence: "pages/Partners.tsx",
    scope: "SIDE_JOURNEY",
  },
  {
    name: "Calendly",
    purpose: "Books partner calls.",
    receives: "The booking details you give it.",
    evidence: "pages/Partners.tsx",
    scope: "SIDE_JOURNEY",
  },
  {
    name: "Zapier",
    purpose: "Receives artist applications.",
    receives: "What you type into the artist application form.",
    evidence: "pages/ArtistApply.tsx",
    scope: "SIDE_JOURNEY",
  },
  {
    name: "Google Apps Script",
    purpose: "Handles part of the affiliate sign-up.",
    receives: "The affiliate details submitted on that page.",
    evidence: "pages/Affiliate.tsx",
    scope: "SIDE_JOURNEY",
  },
  {
    name: "QR Server",
    purpose: "Generates the QR code image for an affiliate's own link.",
    receives:
      "The affiliate's referral URL, so it can draw the code. No customer data.",
    evidence: "pages/Affiliate.tsx",
    scope: "SIDE_JOURNEY",
  },
];

/**
 * Deliberately NOT in the list above: the exchange-rate provider.
 *
 * Local-currency estimates are fetched by MCB's own server from
 * `api/fx/rates.php`, which asks the rate provider for a table of numbers.
 * The customer's browser never contacts it and no personal data is involved —
 * so listing it would suggest a data flow that does not exist.
 */
export const FX_NOTE =
  "Currency estimates are fetched by our own server, so your browser never contacts the exchange-rate provider and no information about you is involved.";

/* ------------------------------------------------------------------ */
/* What is stored in the browser                                       */
/* ------------------------------------------------------------------ */

export interface StoredValue {
  key: string;
  purpose: string;
  /** Why it is not more sensitive than it looks. */
  note?: string;
}

export const BROWSER_STORAGE: readonly StoredValue[] = [
  {
    key: "referral / partner",
    purpose: "Remembers which affiliate or partner link brought you here.",
    note: "The public link code only. It says nothing about you.",
  },
  {
    key: "mcb_customer_referral",
    purpose:
      "Remembers that a friend's share link brought you here, for 30 days.",
    note: "A public code and a timestamp. Not their name, and not yours.",
  },
  {
    key: "mcb_last_reference",
    purpose:
      "Lets your thank-you page still show your MCB reference if you return to it.",
  },
  {
    key: "userType / personalizationSeen / modalShown",
    purpose: "Remembers your choices about what the site shows you.",
  },
  {
    key: "last_order_package / last_order_format",
    purpose: "Remembers what you were looking at, so a form is less repetitive.",
  },
  {
    key: "affiliate_token / affiliate_email",
    purpose: "Keeps an affiliate signed in to their own dashboard.",
    note: "Only ever set if you register as an affiliate.",
  },
];

/* ------------------------------------------------------------------ */
/* The customer-facing policy                                          */
/* ------------------------------------------------------------------ */

export interface PrivacySection {
  heading: string;
  body: readonly string[];
}

export const PRIVACY_INTRO =
  "This explains what we collect, what we do with it, and who else necessarily handles it so that your order can happen at all. We have tried to be specific rather than reassuring — a privacy policy that names nobody is not telling you anything.";

export const PRIVACY_SECTIONS: readonly PrivacySection[] = [
  {
    heading: "What we collect",
    body: [
      "When you order: your name, email address, a phone number if you give one, a delivery address for anything physical, and the story and details you send us so we can create your work. If you upload photographs or artwork, those too.",
      "When you enquire about a Full Package: your contact details, the occasion, what you would like to spend, and what you tell us about the person it is for.",
      "When you simply visit: the pages you look at, and technical information your browser sends, including your IP address.",
    ],
  },
  {
    heading: "What we use it for",
    body: [
      "Creating and delivering your order, and talking to you about it. Taking payment. Keeping the business and accounting records we are required to keep. Understanding how the site is used so we can make it better.",
      "We do not sell your personal information, and we do not share it with anyone so that they can market to you.",
    ],
  },
  {
    heading: "Your story, and what you upload",
    body: [
      "What you write to us is used to make your work, and to keep a record of what we made. We do not publish it, and we do not use it as an example on the site, unless we ask you separately and you agree.",
      "You keep ownership of the material you send us — see clause 9 of our Terms.",
    ],
  },
  {
    heading: "Records we keep about your order",
    body: [
      "Alongside the order itself we record which version of our terms you accepted and when, so that both of us can establish later what was agreed. That record includes a one-way scrambled form of your IP address and your browser's description of itself.",
      "We use the same scrambled form of an IP address to stop the site being flooded with automated submissions. It cannot be turned back into an address.",
      "We also record where your commission has got to, and when we sent you an email about it.",
    ],
  },
  {
    heading: "How long we keep it",
    body: [
      "Order and payment records are kept for as long as accounting and tax rules require. Everything else we keep for as long as it is useful for the purpose we collected it for, and then remove it.",
      "We are formalising exact retention periods for each kind of record, and this section will state them precisely when that work is finished.",
    ],
  },
  {
    heading: "Where your information goes",
    body: [
      "Some of it necessarily passes through the services we use to operate. They handle it to provide those services to us, and not for their own purposes. Some of them operate outside the UK.",
      "The table below is the complete list of who they are and what each one receives.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "You can ask us what we hold about you, ask us to correct it, ask us to delete it, ask us to limit what we do with it, and object to some uses. You can also ask for a copy in a portable form.",
      "Some records — an order and its payment — we have to keep for a period for accounting and legal reasons, and we will tell you if that applies to something you have asked us to delete.",
      "If you are not happy with how we have handled your information you can complain to the Information Commissioner's Office.",
    ],
  },
  {
    heading: "Cookies and similar technology",
    body: [
      "The site stores a small number of values in your browser, listed below. Most simply remember what you chose.",
      "Analytics and embedded video also set their own cookies. We are reviewing how consent for those is obtained, and this section will be updated when that review is complete.",
    ],
  },
  {
    heading: "Talking to us about this",
    body: [
      "Write to us if you have a question about any of it, or want to exercise any of the rights above.",
    ],
  },
];
