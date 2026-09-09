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
export const TERMS_VERSION = "2026-09-09.2";

/**
 * Refunds moves with the Terms; Privacy does not.
 *
 * The refunds page cross-references the new damaged-goods wording, so it
 * changed. The Privacy Policy did not change at all in this revision, and
 * bumping it would tell customers a document had been revised when it had
 * not — which is exactly the noise dated-on-every-deploy versioning creates.
 */
export const REFUND_POLICY_VERSION = "2026-09-09.2";
export const PRIVACY_POLICY_VERSION = "2026-09-09";

/**
 * When this version takes effect for NEW orders.
 *
 * Deliberately a plain string and not a `Date`. A Date would be constructed in
 * the customer's timezone and could render as the previous day west of
 * Greenwich, which is a silly way to be wrong about a contractual date.
 */
export const TERMS_EFFECTIVE_DATE = "2026-09-09";

/** Human-readable form of the effective date, for the page furniture. */
export const TERMS_EFFECTIVE_DATE_DISPLAY = "9 September 2026";

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
