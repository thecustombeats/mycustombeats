/**
 * MCB LEGAL DOCUMENT VERSIONS — the single source of truth.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A VERSION AND NOT A DATE
 * ─────────────────────────────────────────────────────────────────────────
 * Every legal page previously rendered `Last updated: {new Date().getFullYear()}`.
 * That number changed by itself every January while the document said exactly
 * what it said the December before, so it was not a fact about the terms — it
 * was a fact about the clock, presented as though it were about the contract.
 * Worse, it made the document look maintained when nobody had read it in a
 * year.
 *
 * A version is a deliberate act. It changes when somebody changes the words,
 * and at no other time.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY IT MATTERS OPERATIONALLY
 * ─────────────────────────────────────────────────────────────────────────
 * A customer's contract is with the version that existed when they ordered.
 * `order_consents.terms_version` records which one that was, so an order
 * placed today remains readable against today's words even after the terms
 * are revised. Without a version there is nothing to record, and the honest
 * answer to "what did this customer agree to?" would be "whatever the page
 * says now" — which is not an answer.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW TO CHANGE A DOCUMENT
 * ─────────────────────────────────────────────────────────────────────────
 *   1. edit the clauses;
 *   2. bump the version here to the date of the change;
 *   3. add the superseded version to `SUPERSEDED_VERSIONS` below, so an old
 *      order's recorded version still resolves to something identifiable;
 *   4. leave existing orders alone. See `TERMS_CHANGE_POLICY`.
 */

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

/**
 * Dated versions, not semantic ones.
 *
 * `2026-09-09` tells a customer and an operator the same thing without either
 * needing a convention explained to them, and it sorts correctly. A semantic
 * version would additionally invite an argument about whether a clause change
 * was "major", which is not a question anyone here needs to answer.
 */
/**
 * `2026-09-09.2`, not `2026-09-10`.
 *
 * The delivery, special-occasion, product-handling and liability clauses were
 * added on the same calendar day the first versioned edition took effect. A
 * plain date would therefore have collided with it, and the two editions say
 * materially different things about what MCB promises — so a customer who
 * accepted the first must remain distinguishable from one who accepted the
 * second.
 *
 * The `.N` suffix is a same-day revision counter and nothing more. It sorts
 * correctly, it reads unambiguously, and it does not require anyone to learn
 * a versioning convention to understand which came first.
 */
export const TERMS_VERSION = "2026-09-15";

/**
 * MOVED to `2026-09-14`, separately from the Terms.
 *
 * It moved with the Terms at `2026-09-09.4` because it cross-referenced the
 * new damaged-goods wording. It moves again on its own now because its wording
 * changed in Sprint 2 of the release-candidate programme ("Full Package"
 * became "Bespoke") while the Terms did not change — so the Terms stay at
 * `2026-09-09.4`.
 *
 * FOUNDER AND LEGAL REVIEW OF THIS WORDING IS REQUIRED BEFORE PRODUCTION
 * DEPLOYMENT. See the internal register (`review.ts`).
 */
/**
 * MOVED to `2026-09-15` with the Terms (launch closure): its damage and
 * cancelling sections restate the corrected clauses 7, 8 and 17.
 */
export const REFUND_POLICY_VERSION = "2026-09-15";

/**
 * MOVED to `2026-09-14`, because the Privacy Policy content changed again.
 *
 * `2026-09-09.3` was the edition that named every processor MCB actually sends
 * personal data to. Sprint 2 of the release-candidate programme changed the
 * wording (the Make.com data flow, and "Full Package" became "Bespoke"), so
 * the version moves — and it moves independently of the Terms, which did not
 * change.
 *
 * THIS IS NOT A COMPLETED UK GDPR REVIEW, and the 2026-09-14 wording requires
 * founder and legal review BEFORE production deployment. See the internal
 * register (`review.ts`).
 */
export const PRIVACY_POLICY_VERSION = "2026-09-14";

/**
 * When this version takes effect for NEW orders.
 *
 * Deliberately a plain string and not a `Date`. A Date would be constructed in
 * the customer's timezone and could render as the previous day west of
 * Greenwich, which is a silly way to be wrong about a contractual date.
 */
export const TERMS_EFFECTIVE_DATE = "2026-09-15";

/** Human-readable form of the effective date, for the page furniture. */
export const TERMS_EFFECTIVE_DATE_DISPLAY = "15 September 2026";

/**
 * The Privacy Policy and the Refunds page carry their own effective dates.
 *
 * They previously displayed the Terms' date, which was true only while all
 * three documents moved together. From `2026-09-14` they do not, and a page
 * showing "in effect from 9 September" above wording that changed on the 14th
 * would misstate its own history. Plain strings, for the same timezone reason
 * as `TERMS_EFFECTIVE_DATE`.
 */
export const PRIVACY_EFFECTIVE_DATE = "2026-09-14";
export const PRIVACY_EFFECTIVE_DATE_DISPLAY = "14 September 2026";
export const REFUND_EFFECTIVE_DATE = "2026-09-15";
export const REFUND_EFFECTIVE_DATE_DISPLAY = "15 September 2026";

/**
 * Superseded Privacy Policy and Refunds editions, for identifying the version
 * recorded against an older order (`order_consents.privacy_policy_version` /
 * `refund_policy_version`). Terms history stays in `SUPERSEDED_VERSIONS`.
 */
export const SUPERSEDED_POLICY_VERSIONS: readonly {
  document: "PRIVACY" | "REFUND";
  version: string;
  superseded: string;
  summary: string;
}[] = [
  {
    document: "PRIVACY",
    version: "2026-09-09.3",
    superseded: "2026-09-14",
    summary:
      "The edition written from the verified data-flow inventory. Superseded by 2026-09-14, whose wording changed in release-candidate Sprint 2. Orders placed under this version recorded it.",
  },
  {
    document: "REFUND",
    version: "2026-09-14",
    superseded: "2026-09-15",
    summary:
      "The edition that renamed Full Package to Bespoke. Superseded by 2026-09-15, which follows the launch-closure Terms: no 24-hour damage condition, no 'matter for the courier', a change-of-mind carve-out pointer and the Founder-approved delivery wording. Orders placed under this version recorded it.",
  },
  {
    document: "REFUND",
    version: "2026-09-09.4",
    superseded: "2026-09-14",
    summary:
      "The edition that moved with the Founder-replaced Terms. Superseded by 2026-09-14, whose wording changed in release-candidate Sprint 2. Orders placed under this version recorded it.",
  },
];

/**
 * Versions that have been superseded.
 *
 * Empty today because this is the first versioned edition — every earlier
 * revision of these pages was undated and unversioned, which is precisely the
 * problem this file exists to end. It is not backfilled with invented
 * versions: claiming a "2025-01-01" edition existed would be inventing a
 * historical record, and an order placed before versioning simply has no
 * consent row, which reads correctly as "placed before this was recorded".
 */
export const SUPERSEDED_VERSIONS: readonly {
  version: string;
  effective: string;
  superseded: string;
  summary: string;
}[] = [
  {
    version: "2026-09-09.4",
    effective: "2026-09-09",
    superseded: "2026-09-15",
    summary:
      "The Founder-replaced clause set. Superseded by 2026-09-15 (launch closure), which corrected internal contradictions only: refinements close at approval (clause 4), a damaged/faulty/misdescribed carve-out (clause 7), the courier-damage disclaimer replaced by the Founder-approved fulfilment and damage wording (clause 8), the 24-hour condition removed (clause 17) and changes made prospective (clause 23). Orders accepted under this version remain governed by it.",
  },
  {
    version: "2026-09-09.2",
    effective: "2026-09-09",
    superseded: "2026-09-09",
    summary:
      "The delivery, special-occasion, product-handling and liability edition. Superseded the same day by 2026-09-09.4, in which the Founder replaced the clause set wholesale: refinement entitlements reduced to one per song, cancellation and refunds removed, courier damage disclaimed, and the liability and statutory-rights wording rewritten. Orders accepted under this version remain governed by it.",
  },
  {
    version: "2026-09-09",
    effective: "2026-09-09",
    superseded: "2026-09-09",
    summary:
      "The first versioned edition. Superseded the same day by 2026-09-09.2, which added delivery estimates and agreed dates, special-occasion planning, customer-supplied delivery details, international delivery, safe handling of physical products, damaged products, misuse, and a reworked limitation of liability. Orders accepted under this version remain governed by it.",
  },
];

/**
 * Every version this codebase can identify, for validating a recorded value.
 *
 * An order carrying a version not in this list is not corrupt — it may simply
 * predate a checkout of this repository. Callers should treat an unknown
 * version as "recorded but not resolvable here", never as invalid.
 */
export const KNOWN_TERMS_VERSIONS: readonly string[] = [
  TERMS_VERSION,
  ...SUPERSEDED_VERSIONS.map((v) => v.version),
];

/* ------------------------------------------------------------------ */
/* How changes apply                                                   */
/* ------------------------------------------------------------------ */

/**
 * PROSPECTIVE ONLY. This is a commitment, not a formality.
 *
 * An earlier draft of the business rules proposed that MCB could change the
 * terms at any time "for previous customers and new customers". That is not
 * implemented and should not be: a contract is formed when the customer
 * places their order, and a party cannot rewrite a concluded contract by
 * editing a web page afterwards. A term claiming that power would also be a
 * strong candidate for being unfair and therefore unenforceable, so it would
 * not even achieve what it was reaching for.
 *
 * What MCB genuinely can do is change the terms for future orders, which is
 * what this says.
 */
export const TERMS_CHANGE_POLICY =
  "We may update these terms from time to time. Any change applies to orders placed after the new version takes effect. It does not change the terms of an order you have already placed — that order stays governed by the version you accepted, which we record against it and name in your confirmation email.";
