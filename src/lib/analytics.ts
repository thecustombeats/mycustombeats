/**
 * Global analytics utility for Google Analytics 4 (GA4).
 *
 * E-COMMERCE DATA COMES FROM TWO PLACES ONLY
 *   • Browsing events (view_item, select_item, add_to_cart, begin_checkout)
 *     take a SKU and read id, name, price and category from the canonical
 *     catalogue. A caller cannot pass a price.
 *   • The purchase event takes the server's confirmed order — MCB reference,
 *     integer total and saved lines — and nothing from the browser.
 *
 * No story, email address, name, photograph or any other customer content is
 * ever sent.
 */

import { getProduct, getVariant, minorToDecimal } from "../data/catalogue";

const GA_MEASUREMENT_ID = "G-XQFNJC4HND";

type GtagType = (
  command: string,
  targetOrEventName: string,
  additionalConfig?: Record<string, unknown>
) => void;

// Safe helper to check if gtag is available
const getGtag = (): GtagType | null => {
  if (typeof window !== "undefined") {
    const win = window as unknown as { gtag?: GtagType };
    if (typeof win.gtag === "function") {
      return win.gtag;
    }
  }
  return null;
};

let lastTrackedPath: string | null = null;

/**
 * Pages that must never be measured: they carry a secret link in the URL
 * fragment, or staff data. public/analytics-init.js does not load GA on them;
 * this also covers arriving at one by in-app navigation.
 */
export const isPrivateAnalyticsPath = (path: string): boolean =>
  /^\/(your-order|approve|operations|command-centre)(\/|$)/.test(path);

/**
 * The URL analytics may see: origin + path, plus utm_ campaign parameters.
 * Never a fragment (private links), never ?session_id= (Stripe) or any other
 * query value.
 */
export const analyticsSafeLocation = (href: string): string => {
  try {
    const url = new URL(href);
    const kept = new URLSearchParams();
    url.searchParams.forEach((value, key) => {
      if (/^utm_[a-z_]+$/.test(key)) kept.set(key, value);
    });
    const query = kept.toString();
    return `${url.origin}${url.pathname}${query ? `?${query}` : ""}`;
  } catch {
    return "";
  }
};

/**
 * Track client-side page views in SPA context.
 *
 * WHY THIS SENDS AN EVENT RATHER THAN RE-RUNNING `config`
 * index.html's tag used to call `gtag('config', ID)`, which sends a page_view
 * on load by default, and then the router's first effect called this, which
 * re-ran `config` with a page_path — sending a second page_view for the same
 * landing. Every visit was counted twice on its first page.
 *
 * index.html now configures the tag with `send_page_view: false`, and this is
 * the single place a page_view is sent: once on the landing route, then once
 * per route change. Consecutive calls for the same path (React StrictMode's
 * double effect in development, or a re-render) are ignored.
 */
export const trackPageView = (path: string, force = false) => {
  if (path === lastTrackedPath && !force) return;
  const gtag = getGtag();
  if (!gtag) return;
  lastTrackedPath = path;
  // Keep every later hit (enhanced measurement included) on a safe URL.
  (gtag as unknown as (command: "set", fields: Record<string, unknown>) => void)("set", {
    page_location: analyticsSafeLocation(window.location.href),
  });
  if (isPrivateAnalyticsPath(path)) return;
  gtag("event", "page_view", {
    page_path: path,
    page_location: analyticsSafeLocation(window.location.href),
    // No page_title: the route's <title> is applied by Helmet after this
    // effect runs, so GA's own read at dispatch is no worse than ours.
    send_to: GA_MEASUREMENT_ID,
  });
};

/**
 * Generic event tracker
 */
export const trackEvent = (eventName: string, params?: Record<string, unknown>) => {
  const gtag = getGtag();
  if (gtag) {
    gtag("event", eventName, params);
  }
};

/**
 * Track WhatsApp click with page path and button location context
 */
export const trackWhatsAppClick = (location: string) => {
  trackEvent("whatsapp_click", {
    page_path: window.location.pathname,
    source_page: document.title,
    button_location: location,
  });
};

/**
 * Track form submissions (Lead Generation conversions)
 */
export const trackFormSubmit = (formName: string) => {
  trackEvent(`${formName}_submit`, {
    page_path: window.location.pathname,
    form_name: formName,
  });
};

/* ------------------------------------------------------------------ */
/* E-commerce                                                          */
/* ------------------------------------------------------------------ */

const isMinor = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 1;

/** Pounds as a number, via the exact decimal string — no float division. */
const pounds = (minor: number): number => Number(minorToDecimal(minor));

interface Ga4Item {
  item_id: string;
  item_name: string;
  item_category: string;
  item_variant: string;
  price: number;
  quantity: number;
}

/** One GA4 item for a catalogue SKU, or null when the SKU is not sellable. */
const catalogueItem = (sku: string, quantity: number): Ga4Item | null => {
  const ref = getVariant(sku);
  if (!ref || !ref.product.active || !ref.product.public || !isQuantity(quantity)) return null;
  return {
    item_id: ref.variant.sku,
    item_name: ref.variant.name,
    item_category: ref.product.analyticsCategory,
    item_variant: ref.variant.label,
    price: pounds(ref.variant.price.minor),
    quantity,
  };
};

const itemsValue = (items: readonly Ga4Item[]): number =>
  pounds(
    items.reduce(
      (total, item) => total + (getVariant(item.item_id)?.variant.price.minor ?? 0) * item.quantity,
      0
    )
  );

const sendItems = (eventName: string, items: readonly Ga4Item[], extra: Record<string, unknown> = {}) => {
  if (items.length === 0) return;
  trackEvent(eventName, {
    currency: "GBP",
    value: itemsValue(items),
    items,
    ...extra,
  });
};

/** A product page or variant was viewed. */
export const trackViewItem = (sku: string) => {
  const item = catalogueItem(sku, 1);
  if (item) sendItems("view_item", [item]);
};

/** A variant was chosen from a list (e.g. a size on the Keepsake page). */
export const trackSelectItem = (sku: string, listName?: string) => {
  const item = catalogueItem(sku, 1);
  if (!item) return;
  trackEvent("select_item", {
    ...(listName ? { item_list_name: listName } : {}),
    items: [listName ? { ...item, item_list_name: listName } : item],
  });
};

/** A variant was added to the order. */
export const trackAddToCart = (sku: string, quantity = 1) => {
  const item = catalogueItem(sku, quantity);
  if (item) sendItems("add_to_cart", [item]);
};

/** The customer left for payment with these lines. Unknown SKUs are dropped. */
export const trackBeginCheckout = (lines: readonly { sku: string; quantity: number }[]) => {
  const items = lines
    .map((line) => catalogueItem(line.sku, line.quantity))
    .filter((item): item is Ga4Item => item !== null);
  sendItems("begin_checkout", items);
};

/** One saved order line, as MCB's server confirmed it. */
export interface ConfirmedPurchaseItem {
  sku: string;
  productId: string;
  name: string;
  category: string;
  quantity: number;
  unitMinor: number;
}

/** A paid order, as MCB's server confirmed it. */
export interface ConfirmedPurchase {
  /** The MCB reference, e.g. MCB-2026-000123. */
  transactionId: string;
  valueMinor: number;
  currency: "GBP";
  items: readonly ConfirmedPurchaseItem[];
}

/**
 * Track a GA4 purchase from the server's confirmed order.
 *
 * Amounts are the server's integer pence. Names and categories prefer the
 * catalogue (so reports group by the canonical variant name and analytics
 * category) and fall back to the server's saved values for a SKU the
 * catalogue no longer holds. Returns whether an event was sent.
 */
export const trackPurchase = (purchase: ConfirmedPurchase): boolean => {
  if (
    typeof purchase.transactionId !== "string" ||
    purchase.transactionId === "" ||
    purchase.currency !== "GBP" ||
    !isMinor(purchase.valueMinor)
  ) {
    return false;
  }

  const items = purchase.items
    .filter((item) => isQuantity(item.quantity) && isMinor(item.unitMinor))
    .map((item) => ({
      item_id: item.sku,
      item_name: getVariant(item.sku)?.variant.name ?? item.name,
      item_category: getProduct(item.productId)?.analyticsCategory ?? item.category,
      price: pounds(item.unitMinor),
      quantity: item.quantity,
    }));

  const gtag = getGtag();
  if (!gtag) return false;

  gtag("event", "purchase", {
    transaction_id: purchase.transactionId,
    value: pounds(purchase.valueMinor),
    currency: purchase.currency,
    items,
  });
  return true;
};

/* ------------------------------------------------------------------ */
/* Pre-checkout funnel                                                 */
/* ------------------------------------------------------------------ */

/**
 * The customer journey before payment, as named GA4 events.
 *
 * Parameters are catalogue ids, step names and counts ONLY. The type admits
 * no free text: never a story, lyrics, a song title, a photo or its filename,
 * a name, an email or anything else a customer typed.
 */
export type FunnelEvent =
  | "package_view"
  | "package_select"
  | "variant_select"
  | "personalisation_start"
  | "personalisation_step_complete"
  | "concierge_start"
  | "concierge_recommendation"
  | "order_review"
  /** MCB's server saved the order with every memory and photo it needs. */
  | "personalisation_complete"
  /** MCB's server created a Stripe Checkout Session; the customer is leaving to pay. */
  | "checkout_begin";

export interface FunnelParams {
  product_id?: string;
  sku?: string;
  /** Where the event happened, e.g. "homepage", "product_page", "create". */
  location?: "homepage" | "product_page" | "products_page" | "create" | "concierge";
  step?: "choose" | "story" | "extras" | "details" | "review";
  quantity?: number;
  memories?: number;
}

export const trackFunnel = (event: FunnelEvent, params: FunnelParams = {}) => {
  trackEvent(event, { ...params });
};
