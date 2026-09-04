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

export interface CheckoutSelection {
  packageId: string;
  /** Empty string for packages with no format choice. */
  formatId: string;
  /** MCB order id, when the CRM recorded one. */
  orderId?: number | null;
}

export type CheckoutSessionResult =
  | { ok: true; url: string; id: string }
  | { ok: false; reason: "disabled" | "refused" | "unreachable" };

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
  if (!CHECKOUT_SESSIONS_ENABLED) return { ok: false, reason: "disabled" };

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
      }),
      signal: controller.signal,
    });

    if (!response.ok) return { ok: false, reason: "refused" };

    const data = await response.json();
    return typeof data?.url === "string" && data.url.length > 0
      ? { ok: true, url: data.url, id: String(data.id ?? "") }
      : { ok: false, reason: "refused" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
};
