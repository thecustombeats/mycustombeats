/**
 * The /create page's conversation with MCB's server.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SERVER DECIDES
 * ─────────────────────────────────────────────────────────────────────────
 *   whether payment is open   GET /api/checkout/status — there is no switch
 *                             in this file or anywhere else in the browser
 *   what it costs             every amount shown at Review comes from
 *                             /api/order-quote or the saved order, never from
 *                             arithmetic done here
 *   what is paid              the Stripe session is built from the SAVED
 *                             order; this file sends an id and a token
 *
 * The browser sends SKUs, quantities, the personalisation, contact details
 * and consents. It never sends a price, a total, a delivery charge or a
 * currency, and nothing here could make the server accept one.
 *
 * Payment Links are retired: they charged a fixed amount chosen in the Stripe
 * Dashboard and were matched to orders by an editable URL parameter.
 */

export type CheckoutMode = "test" | "live";

export interface CheckoutStatus {
  onlineCheckout: boolean;
  mode: CheckoutMode | null;
}

export interface DeliveryView {
  status: "NOT_REQUIRED" | "QUOTED" | "UNAVAILABLE";
  minor: number;
  label: string | null;
  testOnly: boolean;
}

export interface ServerLine {
  sku: string;
  name: string;
  quantity: number;
  unitMinor: number;
  lineMinor: number;
}

export interface Quote {
  subtotalMinor: number;
  delivery: DeliveryView;
  totalMinor: number;
  payable: boolean;
  lines: ServerLine[];
}

export interface SavedOrder {
  orderId: number;
  checkoutToken: string;
}

export interface OrderState extends SavedOrder {
  status: string;
  subtotalMinor: number | null;
  delivery: DeliveryView | null;
  totalMinor: number | null;
  personalisationStatus: string;
  missingUploads: string[];
  checkoutBlocker: string | null;
}

export type ApiFailure =
  | { ok: false; kind: "invalid"; fields: Record<string, string>; message: string }
  | { ok: false; kind: "refused"; code: string; message: string }
  | { ok: false; kind: "unreachable" };

export type ApiResult<T> = ({ ok: true } & T) | ApiFailure;

const REQUEST_TIMEOUT_MS = 20000;
const UPLOAD_TIMEOUT_MS = 90000;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
const isMinor = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

const call = async (path: string, init: RequestInit, timeoutMs = REQUEST_TIMEOUT_MS): Promise<{ status: number; data: unknown } | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, { ...init, signal: controller.signal, credentials: "same-origin" });
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { status: response.status, data };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/** A refusal, in words fit for a customer: the server's own message, which never carries internal detail. */
const failure = (result: { status: number; data: unknown } | null): ApiFailure => {
  if (!result) return { ok: false, kind: "unreachable" };
  const data = isObject(result.data) ? result.data : {};
  const message = typeof data.message === "string" ? data.message : "Something went wrong. Please try again.";
  if (result.status === 422 && isObject(data.fields)) {
    const fields: Record<string, string> = {};
    for (const [key, value] of Object.entries(data.fields)) if (typeof value === "string") fields[key] = value;
    return { ok: false, kind: "invalid", fields, message };
  }
  return { ok: false, kind: "refused", code: typeof data.error === "string" ? data.error : `http_${result.status}`, message };
};

const parseDelivery = (raw: unknown): DeliveryView | null => {
  if (!isObject(raw)) return null;
  const status = raw.status;
  if (status !== "NOT_REQUIRED" && status !== "QUOTED" && status !== "UNAVAILABLE") return null;
  return {
    status,
    minor: isMinor(raw.minor) ? raw.minor : 0,
    label: typeof raw.label === "string" ? raw.label : null,
    testOnly: raw.test_only === true,
  };
};

const parseLines = (raw: unknown): ServerLine[] | null => {
  if (!Array.isArray(raw)) return null;
  const lines: ServerLine[] = [];
  for (const line of raw) {
    if (!isObject(line) || typeof line.sku !== "string" || !isMinor(line.quantity) || !isMinor(line.unit_minor) || !isMinor(line.line_minor)) return null;
    lines.push({ sku: line.sku, name: typeof line.name === "string" ? line.name : line.sku, quantity: line.quantity, unitMinor: line.unit_minor, lineMinor: line.line_minor });
  }
  return lines;
};

/* ------------------------------------------------------------------ */

export const fetchCheckoutStatus = async (): Promise<CheckoutStatus> => {
  const result = await call("/api/checkout/status", { method: "GET" });
  const data = result && result.status === 200 && isObject(result.data) ? result.data : null;
  // Anything unexpected means closed: the page never assumes payment is open.
  if (!data || data.online_checkout !== true) return { onlineCheckout: false, mode: null };
  return { onlineCheckout: true, mode: data.mode === "live" ? "live" : data.mode === "test" ? "test" : null };
};

export const requestQuote = async (lines: readonly { sku: string; quantity: number }[], countryCode: string): Promise<ApiResult<{ quote: Quote }>> => {
  const result = await call("/api/order-quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines, ...(countryCode ? { shippingCountryCode: countryCode } : {}) }),
  });
  if (!result || result.status !== 200 || !isObject(result.data)) return failure(result);
  const d = result.data;
  const delivery = parseDelivery(d.delivery);
  const parsedLines = parseLines(d.lines);
  if (!delivery || !parsedLines || !isMinor(d.subtotal_minor) || !isMinor(d.total_minor) || d.currency !== "GBP") return failure(null);
  return { ok: true, quote: { subtotalMinor: d.subtotal_minor, delivery, totalMinor: d.total_minor, payable: d.payable === true, lines: parsedLines } };
};

const parseOrderState = (d: Record<string, unknown>, saved: SavedOrder): OrderState | null => {
  if (typeof d.status !== "string" && d.status !== undefined) return null;
  return {
    ...saved,
    status: typeof d.status === "string" ? d.status : "PENDING",
    subtotalMinor: isMinor(d.subtotal_minor) ? d.subtotal_minor : null,
    delivery: parseDelivery(d.delivery),
    totalMinor: isMinor(d.total_minor) ? d.total_minor : null,
    personalisationStatus: typeof d.personalisation_status === "string" ? d.personalisation_status : "NOT_PROVIDED",
    missingUploads: Array.isArray(d.missing_uploads) ? d.missing_uploads.filter((s): s is string => typeof s === "string") : [],
    checkoutBlocker: typeof d.checkout_blocker === "string" ? d.checkout_blocker : null,
  };
};

/**
 * Saves the order. The same `idempotencyKey` with the same body returns the
 * same order (a double click, a lost response); change the body and use a new
 * key, or the server refuses the mismatch.
 */
export const submitOrder = async (body: Record<string, unknown>, idempotencyKey: string): Promise<ApiResult<{ order: OrderState }>> => {
  const result = await call("/api/order", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  });
  if (!result || (result.status !== 201 && result.status !== 200) || !isObject(result.data)) return failure(result);
  const d = result.data;
  if (!Number.isSafeInteger(d.order_id) || typeof d.checkout_token !== "string" || !/^[a-f0-9]{64}$/.test(d.checkout_token)) return failure(null);
  const order = parseOrderState(d, { orderId: d.order_id as number, checkoutToken: d.checkout_token });
  return order ? { ok: true, order } : failure(null);
};

export const uploadPhoto = async (order: SavedOrder, slot: string, file: Blob): Promise<ApiResult<{ missingUploads: string[]; checkoutBlocker: string | null }>> => {
  const form = new FormData();
  form.append("orderId", String(order.orderId));
  form.append("checkoutToken", order.checkoutToken);
  form.append("slot", slot);
  // A neutral name: the customer's own file name is not MCB's business.
  form.append("photo", file, "photo");
  const result = await call("/api/order-upload", { method: "POST", body: form }, UPLOAD_TIMEOUT_MS);
  if (!result || result.status !== 201 || !isObject(result.data)) return failure(result);
  const d = result.data;
  return {
    ok: true,
    missingUploads: Array.isArray(d.missing_uploads) ? d.missing_uploads.filter((s): s is string => typeof s === "string") : [],
    checkoutBlocker: typeof d.checkout_blocker === "string" ? d.checkout_blocker : null,
  };
};

export const fetchOrderState = async (order: SavedOrder): Promise<ApiResult<{ order: OrderState }>> => {
  const result = await call("/api/order-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.orderId, checkoutToken: order.checkoutToken }),
  });
  if (!result || result.status !== 200 || !isObject(result.data)) return failure(result);
  const state = parseOrderState(result.data, order);
  return state ? { ok: true, order: state } : failure(null);
};

/** Starts Stripe Checkout for a saved order. Only the id and token are sent. */
export const createCheckoutSession = async (order: SavedOrder): Promise<ApiResult<{ url: string; id: string }>> => {
  const result = await call("/api/checkout/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId: order.orderId, checkoutToken: order.checkoutToken }),
  });
  if (!result || result.status !== 200 || !isObject(result.data)) return failure(result);
  const { url, id } = result.data;
  if (typeof url !== "string" || !url.startsWith("https://") || typeof id !== "string") return failure(null);
  return { ok: true, url, id };
};

/* ------------------------------------------------------------------ */
/* A saved order, remembered for this tab only                         */
/* ------------------------------------------------------------------ */

/**
 * So a customer who backs out of Stripe can pay for the order they already
 * saved. sessionStorage (this tab, cleared when it closes) and ONLY the order
 * id and its checkout token — no story, name, email, address or photo.
 */
export const SAVED_ORDER_KEY = "mcb_saved_order_v1";

export const rememberSavedOrder = (order: SavedOrder): void => {
  try {
    sessionStorage.setItem(SAVED_ORDER_KEY, JSON.stringify({ orderId: order.orderId, checkoutToken: order.checkoutToken }));
  } catch {
    /* storage unavailable: resuming simply isn't offered */
  }
};

export const recallSavedOrder = (): SavedOrder | null => {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(SAVED_ORDER_KEY) ?? "null") as unknown;
    if (isObject(parsed) && Number.isSafeInteger(parsed.orderId) && typeof parsed.checkoutToken === "string" && /^[a-f0-9]{64}$/.test(parsed.checkoutToken)) {
      return { orderId: parsed.orderId as number, checkoutToken: parsed.checkoutToken };
    }
  } catch {
    /* unreadable: nothing to resume */
  }
  return null;
};

export const forgetSavedOrder = (): void => {
  try {
    sessionStorage.removeItem(SAVED_ORDER_KEY);
  } catch {
    /* storage unavailable */
  }
};

/** A random Idempotency-Key for one submission attempt of one exact order. */
export const newIdempotencyKey = (): string => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return "mcb-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

/** Plain-English words for why a saved order can't be paid yet. */
export const blockerMessage = (blocker: string | null): string | null => {
  switch (blocker) {
    case null:
      return null;
    case "awaiting_uploads":
      return "We're still waiting for a photo you chose to add. Please add it again and try once more.";
    case "delivery_unavailable":
      return "We can't take payment online for delivery to this address yet. Please contact MCB and we'll help you complete your order.";
    case "not_payable":
      return "This order isn't waiting for payment any more.";
    case "checkout_unavailable":
      return "Online payment isn't open yet.";
    default:
      return "This order can't be paid online. Please contact MCB and we'll help.";
  }
};
