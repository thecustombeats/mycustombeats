/**
 * THE FULL PACKAGE — the concierge enquiry, client side.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AN ENQUIRY IS NOT AN ORDER
 * ─────────────────────────────────────────────────────────────────────────
 * Nothing in this file computes a price, resolves a checkout target, builds a
 * basket or talks to Stripe. There is no total, because nothing has been
 * scoped; there is no payment, because nothing has been agreed. It collects
 * what a person needs in order to have a useful first conversation, and posts
 * it to `/api/concierge/enquiry`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT ASKS, AND WHAT IT REFUSES TO ASK
 * ─────────────────────────────────────────────────────────────────────────
 * Who it is for, the occasion, when it is needed, roughly where it is going,
 * what they would like to spend, and the story.
 *
 * It does not ask the recipient's age, gender, personality or taste, and
 * nothing here profiles a recipient. A curator who has read a paragraph
 * someone wrote about their mother knows more than any set of tick boxes
 * would tell them, and the tick boxes would additionally be building a
 * demographic profile of a person who never agreed to one.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BUDGET IS AN ANSWER, IN THREE SHAPES
 * ─────────────────────────────────────────────────────────────────────────
 * `AMOUNT` is a figure the customer typed, in a currency they chose. `OPEN`
 * means they told us there is no fixed limit. `UNSURE` means they would
 * rather discuss it.
 *
 * These are three different answers and the model keeps them distinct.
 * Collapsing `OPEN` into 0, or into an empty amount, would record the exact
 * opposite of what was said about MCB's most valuable enquiries.
 */

import { type CurrencyCode } from "./currency";

/* ------------------------------------------------------------------ */
/* Budget                                                              */
/* ------------------------------------------------------------------ */

/**
 * How the customer answered the budget question.
 *
 * A discriminated union rather than a mode plus two optional fields, so
 * "OPEN with an amount" and "AMOUNT with no amount" are not states this can
 * be in. The server enforces the same pairing with a CHECK constraint.
 */
export type Budget =
  | { mode: "AMOUNT"; amount: string; currency: CurrencyCode }
  | { mode: "OPEN" }
  | { mode: "UNSURE" };

export type BudgetMode = Budget["mode"];

/**
 * How each option is put to the customer.
 *
 * Worded so that no option reads as the wrong answer. "I'd rather discuss it"
 * is not an evasion and "there's no fixed limit" is not a boast — someone
 * commissioning a gift for a person they love should not feel graded by a
 * form.
 */
export const BUDGET_OPTIONS: readonly {
  mode: BudgetMode;
  label: string;
  hint: string;
}[] = [
  {
    mode: "AMOUNT",
    label: "I have an amount in mind",
    hint: "Tell us the figure and we will design to it.",
  },
  {
    mode: "OPEN",
    label: "There's no fixed limit",
    hint: "We will propose what best serves the occasion.",
  },
  {
    mode: "UNSURE",
    label: "I'd rather discuss it",
    hint: "Entirely fine — we can work it out together.",
  },
];

/**
 * The typed amount as an exact number of major units, or null.
 *
 * Parsed from TEXT, deliberately. A `<input type="number">` would reject
 * "10,000" as the customer typed it, and reading a float would turn 79.99
 * into 79.98999 before it ever left the browser. This is a preview only: the
 * server parses the same string again and its answer is the one stored.
 */
export const parseBudgetAmount = (raw: string): number | null => {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "" || (cleaned.match(/\./g)?.length ?? 0) > 1) return null;

  const [major, minor = ""] = cleaned.split(".");
  const minorPadded = minor.padEnd(2, "0").slice(0, 2);
  const total = Number(major || "0") * 100 + Number(minorPadded);

  if (!Number.isFinite(total) || total <= 0) return null;
  return total / 100;
};

/* ------------------------------------------------------------------ */
/* The enquiry                                                         */
/* ------------------------------------------------------------------ */

export type ContactMethod = "EMAIL" | "PHONE" | "WHATSAPP";

export interface ConciergeEnquiry {
  name: string;
  email: string;
  phone: string;
  preferredContact: ContactMethod;
  occasion: string;
  /** ISO `YYYY-MM-DD`, or empty. Empty is a real answer: "not fixed yet". */
  neededBy: string;
  /** A country or city. Never a full delivery address — see the endpoint. */
  deliveryRegion: string;
  /**
   * `null` until the customer answers.
   *
   * There is no fourth "unanswered" mode, because an unanswered budget is not
   * a kind of budget — it is the absence of one, and modelling it as a mode
   * would put it in the database beside three real answers. The form requires
   * a choice instead; "I'd rather discuss it" is there for anyone who does not
   * want to name a figure.
   */
  budget: Budget | null;
  story: string;
}

export const EMPTY_ENQUIRY: ConciergeEnquiry = {
  name: "",
  email: "",
  phone: "",
  preferredContact: "EMAIL",
  occasion: "",
  neededBy: "",
  deliveryRegion: "",
  // Nothing is preselected. A default here would put an answer in the
  // customer's mouth and store it as though they had given it — and
  // "there's no fixed limit" selected by default would be a particularly
  // self-serving thing for MCB to assume on their behalf.
  budget: null,
  story: "",
};

/**
 * Occasions offered as suggestions, not as a closed list.
 *
 * The field is free text and these are `<datalist>` options: someone
 * commissioning for a reason MCB has not thought of must not be told their
 * occasion does not exist.
 */
export const OCCASION_SUGGESTIONS: readonly string[] = [
  "Anniversary",
  "Wedding",
  "Engagement or proposal",
  "Milestone birthday",
  "Retirement",
  "In memory of someone",
  "New baby",
  "Corporate or client gift",
  "Just because",
];

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type EnquiryErrors = Partial<
  Record<keyof ConciergeEnquiry | "budgetAmount", string>
>;

/**
 * Matches the server's rules, and is deliberately no stricter.
 *
 * A field the server accepts must not be refused here, or a customer would be
 * blocked by the browser from sending something MCB would happily have taken.
 * The server validates all of this again, and its answer is the one that
 * decides whether anything is stored.
 *
 * NOTE WHAT IS OPTIONAL: the occasion, the date, the region and the story are
 * all optional. Someone who wants to write "call me" and nothing else should
 * be able to. Only a name, an email and a budget answer are required, and the
 * budget answer can be "I'd rather discuss it".
 */
export const validateEnquiry = (enquiry: ConciergeEnquiry): EnquiryErrors => {
  const errors: EnquiryErrors = {};

  if (enquiry.name.trim() === "") {
    errors.name = "Please tell us your name.";
  }

  // Intentionally permissive: a shape check, not an attempt to decide which
  // addresses are real. Anything stricter rejects valid addresses.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email.trim())) {
    errors.email = "Please give an email address we can reply to.";
  }

  if (
    enquiry.preferredContact !== "EMAIL" &&
    enquiry.phone.trim() === ""
  ) {
    errors.phone = "Please add a number so we can reach you that way.";
  }

  if (enquiry.budget === null) {
    errors.budget = "Please choose one of these — any of them is a fine answer.";
  } else if (enquiry.budget.mode === "AMOUNT") {
    if (parseBudgetAmount(enquiry.budget.amount) === null) {
      errors.budgetAmount = "Please give that as a number, for example 5000.";
    }
  }

  if (enquiry.neededBy !== "" && Number.isNaN(Date.parse(enquiry.neededBy))) {
    errors.neededBy = "Please give that as a date.";
  }

  return errors;
};

/* ------------------------------------------------------------------ */
/* Submission                                                          */
/* ------------------------------------------------------------------ */

export interface EnquiryReceipt {
  /** `FP-YYYY-XXXXXX`. An acknowledgement code, never an order reference. */
  reference: string;
}

/**
 * The request body.
 *
 * The budget is flattened into the three fields the endpoint expects, and
 * `budgetAmount`/`budgetCurrency` are omitted entirely unless the mode is
 * AMOUNT — so an OPEN enquiry cannot carry a stray figure that the server
 * would then have to decide what to do with.
 */
const enquiryPayload = (
  enquiry: ConciergeEnquiry,
  attribution: { referral?: string; partner?: string }
): Record<string, unknown> => ({
  name: enquiry.name.trim(),
  email: enquiry.email.trim(),
  phone: enquiry.phone.trim(),
  preferredContact: enquiry.preferredContact,
  occasion: enquiry.occasion.trim(),
  neededBy: enquiry.neededBy,
  deliveryRegion: enquiry.deliveryRegion.trim(),
  // Validation has already refused a null budget, so this is a real mode.
  budgetMode: enquiry.budget?.mode,
  ...(enquiry.budget?.mode === "AMOUNT"
    ? {
        budgetAmount: enquiry.budget.amount,
        budgetCurrency: enquiry.budget.currency,
      }
    : {}),
  story: enquiry.story.trim(),
  ...(attribution.referral ? { referral: attribution.referral } : {}),
  ...(attribution.partner ? { partner: attribution.partner } : {}),
});

export class EnquiryError extends Error {
  /** Field-level messages from the server, where it gave them. */
  readonly fields: EnquiryErrors;

  constructor(message: string, fields: EnquiryErrors = {}) {
    super(message);
    this.name = "EnquiryError";
    this.fields = fields;
  }
}

/** Maps the endpoint's field names back onto the form's. */
const FIELD_ALIASES: Record<string, keyof EnquiryErrors> = {
  name: "name",
  email: "email",
  phone: "phone",
  occasion: "occasion",
  neededBy: "neededBy",
  deliveryRegion: "deliveryRegion",
  budgetAmount: "budgetAmount",
  budgetCurrency: "budgetAmount",
  budgetMode: "budget",
  story: "story",
};

export const submitEnquiry = async (
  enquiry: ConciergeEnquiry,
  attribution: { referral?: string; partner?: string } = {}
): Promise<EnquiryReceipt> => {
  let response: Response;

  try {
    response = await fetch("/api/concierge/enquiry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enquiryPayload(enquiry, attribution)),
    });
  } catch {
    // A network failure, not a rejection. Said as such, because "something
    // went wrong" leaves the customer unsure whether MCB has their enquiry.
    throw new EnquiryError(
      "We couldn't reach us just then. Please check your connection and try again."
    );
  }

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const body = (payload ?? {}) as {
      message?: string;
      errors?: Record<string, string>;
    };

    const fields: EnquiryErrors = {};
    for (const [field, message] of Object.entries(body.errors ?? {})) {
      const mapped = FIELD_ALIASES[field];
      if (mapped) fields[mapped] = message;
    }

    throw new EnquiryError(
      body.message ??
        "We couldn't send that just now. Please try again, or email us directly.",
      fields
    );
  }

  const receipt = payload as { reference?: unknown };
  if (typeof receipt?.reference !== "string") {
    // The row was almost certainly written; what failed is the confirmation.
    // Said honestly rather than reported as a failure that lost their words.
    throw new EnquiryError(
      "Your enquiry was sent, but we couldn't show you the reference. We will still be in touch."
    );
  }

  return { reference: receipt.reference };
};
