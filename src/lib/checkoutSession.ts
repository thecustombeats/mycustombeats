/**
 * Server-created Stripe Checkout Sessions.
 *
 * DORMANT. `CHECKOUT_SESSIONS_ENABLED` is false, so nothing here runs and the
 * order form continues to use the Stripe Payment Links, which remain the live
 * payment path. The flag exists on both sides deliberately: turning this on
 * needs the client flag AND `stripe.checkout_sessions_enabled` in the server
 * config, so a stray client build cannot start charging through an untested
 * route on its own.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS SENDS, AND WHAT IT CANNOT SEND
 * ─────────────────────────────────────────────────────────────────────────
 * A selection. The package, the format, and the MCB order id if one was
 * recorded. There is no price field in `CheckoutSelection` and no way to add
 * one from a component — the type is the guarantee. The server maps the
 * selection to the approved price and builds the Stripe line item; the
 * browser never states, suggests or influences an amount.
 *
 * Keepsakes are absent for the same reason they are absent server-side: no
 * physical product has an approved price, so there is nothing a basket could
 * legitimately total.
 */

/**
 * Master switch for the client half. Flip only after the server flag is on
 * and sandbox testing has passed end to end.
 */
export const CHECKOUT_SESSIONS_ENABLED = false;

/** One extra basket line: an id and how many. Never a price. */
export interface CheckoutItem {
  id: string;
  quantity: number;
}

export interface CheckoutSelection {
  packageId: string;
  /** Empty string for packages with no format choice. */
  formatId: string;
  /** MCB order id, when the CRM recorded one. */
  orderId?: number | null;
  /**
   * Extra basket lines, by id and quantity.
   *
   * DORMANT — no UI populates this yet. It exists now so the fallback rule
   * below can be written and tested before anything can reach it, rather than
   * being remembered later by whoever builds the basket screen.
   *
   * Ids and integer quantities only. There is deliberately no price field:
   * the server looks every id up in the generated catalogue and totals the
   * basket itself.
   */
  items?: readonly CheckoutItem[];
}

export type CheckoutSessionResult =
  | { ok: true; url: string; id: string }
  /**
   * `fallbackAllowed` answers the only question the caller actually has:
   * may this customer be sent to the fixed Payment Link instead?
   *
   * It is false whenever the basket contains anything beyond the base
   * package — see `mayFallBackToPaymentLink`.
   */
  | {
      ok: false;
      reason: "disabled" | "refused" | "unreachable";
      fallbackAllowed: boolean;
    };

/**
 * WHETHER A FAILED SESSION MAY FALL BACK TO A FIXED PAYMENT LINK.
 *
 * This is the most dangerous decision in the checkout, and it is why the
 * function exists rather than the rule living inline at a call site.
 *
 * A Payment Link charges ONE fixed amount. A customer whose basket is a £79
 * Keepsake plus a £200 frame, a £50 card and two £60 records owes £449 — and
 * the Keepsake Payment Link would take £79 and report success. MCB would ship
 * £449 of goods against a £79 payment, and every part of the system would
 * look healthy: the order is PAID, the reference is issued, the confirmation
 * email goes out.
 *
 * So the rule is by BASKET SHAPE, not by error type:
 *
 *   base package only  →  the link charges exactly the same thing, so falling
 *                         back is commercially identical and stays allowed.
 *   anything more      →  NEVER. Fail closed, keep the customer on MCB, and
 *                         let them retry or make contact.
 */
export const mayFallBackToPaymentLink = (
  selection: Pick<CheckoutSelection, "items">
): boolean => (selection.items?.length ?? 0) === 0;

const REQUEST_TIMEOUT_MS = 15000;

/**
 * Asks the server for a Checkout Session URL.
 *
 * Never throws. A failure returns `ok: false` so the caller can keep the
 * customer on the existing payment path rather than stranding them — a
 * checkout that cannot start must not look like a checkout that failed.
 */
export const createCheckoutSession = async (
  selection: CheckoutSelection
): Promise<CheckoutSessionResult> => {
  const fallbackAllowed = mayFallBackToPaymentLink(selection);

  if (!CHECKOUT_SESSIONS_ENABLED) {
    return { ok: false, reason: "disabled", fallbackAllowed };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Selection only. Deliberately constructed field by field rather than
      // spreading an object, so nothing extra can ride along.
      body: JSON.stringify({
        package: selection.packageId,
        format: selection.formatId,
        ...(typeof selection.orderId === "number"
          ? { orderId: selection.orderId }
          : {}),
        // Ids and integer quantities. Rebuilt field by field so a caller
        // cannot smuggle a price, a name or a total alongside them.
        ...(selection.items && selection.items.length > 0
          ? {
              enhancements: selection.items.map((item) => ({
                id: item.id,
                quantity: item.quantity,
              })),
            }
          : {}),
      }),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, reason: "refused", fallbackAllowed };

    const data = await response.json();
    return typeof data?.url === "string" && data.url.length > 0
      ? { ok: true, url: data.url, id: String(data.id ?? "") }
      : { ok: false, reason: "refused", fallbackAllowed };
  } catch {
    return { ok: false, reason: "unreachable", fallbackAllowed };
  } finally {
    clearTimeout(timer);
  }
};
