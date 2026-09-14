/**
 * Starts checkout for an order MCB has already saved.
 *
 * THE ONLY ONLINE PAYMENT PATH. Payment Links are retired: they charged a
 * fixed amount chosen in the Stripe Dashboard and were matched to orders by an
 * editable URL parameter.
 *
 * The browser sends the order id and the checkout token `/api/order` returned
 * for it — nothing about products, quantities or amounts. The server builds
 * the Stripe session from the saved order.
 *
 * Two independent switches must both be on before anyone can pay: this flag,
 * and `stripe.checkout_sessions_enabled` in the server config. Both stay off
 * until Bella and Lewis approve going live.
 */
export const CHECKOUT_SESSIONS_ENABLED = false;

export interface SavedOrder {
  orderId: number;
  checkoutToken: string;
}

export type CheckoutSessionResult =
  | { ok: true; url: string; id: string }
  | { ok: false; reason: "disabled" | "refused" | "unreachable" };

const REQUEST_TIMEOUT_MS = 15000;

export const createCheckoutSession = async (order: SavedOrder): Promise<CheckoutSessionResult> => {
  if (!CHECKOUT_SESSIONS_ENABLED) return { ok: false, reason: "disabled" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: order.orderId, checkoutToken: order.checkoutToken }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, reason: "refused" };
    const data = await response.json();
    return typeof data?.url === "string" && data.url.startsWith("https://")
      ? { ok: true, url: data.url, id: String(data.id ?? "") }
      : { ok: false, reason: "refused" };
  } catch {
    return { ok: false, reason: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
};
