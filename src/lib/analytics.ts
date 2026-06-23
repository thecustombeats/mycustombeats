/**
 * Global analytics utility for Google Analytics 4 (GA4).
 */

// Safe helper to check if gtag is available
const getGtag = () => {
  if (typeof window !== "undefined" && (window as any).gtag) {
    return (window as any).gtag;
  }
  return null;
};

/**
 * Track client-side page views in SPA context
 */
export const trackPageView = (path: string) => {
  const gtag = getGtag();
  if (gtag) {
    gtag("config", "G-XQFNJC4HND", {
      page_path: path,
    });
  }
};

/**
 * Generic event tracker
 */
export const trackEvent = (eventName: string, params?: Record<string, any>) => {
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

/**
 * Track standard GA4 E-commerce Purchase events
 */
export const trackPurchase = (transactionId: string, value: number, currency: string, packageName: string) => {
  trackEvent("purchase", {
    transaction_id: transactionId,
    value: value,
    currency: currency,
    items: [
      {
        item_id: packageName.toLowerCase().replace(/\s+/g, "_"),
        item_name: packageName,
        item_category: "Custom Music Package",
        price: value,
        quantity: 1,
      },
    ],
  });
};
