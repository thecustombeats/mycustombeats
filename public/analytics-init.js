/*
 * MCB — Google Analytics 4 bootstrap (src/lib/analytics.ts sends the events).
 *
 * An external file rather than an inline <script>, so the Content-Security-
 * Policy in public/.htaccess can forbid inline scripts entirely.
 *
 * CONSENT FIRST (Sprint 7). Google Analytics sets cookies that are not needed
 * for the site to work, so nothing is loaded and nothing is sent until the
 * visitor chooses "Accept analytics cookies" (src/components/ConsentBanner.tsx).
 * The choice is kept on this device under `mcb_analytics_consent`
 * ("granted" | "denied") and can be changed from "Cookie settings" in the
 * footer. Before a choice, and after "denied", window.gtag is a no-op.
 *
 * PRIVACY RULES ENFORCED HERE
 *  • Private pages never load analytics: /your-order, /approve and
 *    /operations carry secret links or staff data.
 *  • Every page_location and page_referrer is reduced to origin + path (+ utm_
 *    parameters only). A URL fragment never reaches Google, and neither does
 *    ?session_id= on /thank-you or a Stripe Checkout URL in the referrer.
 *  • No customer content is ever sent (see analytics.ts).
 */
(function () {
  var MEASUREMENT_ID = "G-XQFNJC4HND";
  var CONSENT_KEY = "mcb_analytics_consent";
  var PRIVATE = /^\/(your-order|approve|operations)(\/|$)/;
  var loaded = false;

  var noop = function () {};
  window.gtag = noop;

  var safe = function (href) {
    try {
      var url = new URL(href);
      if (url.origin !== window.location.origin) return url.origin + "/";
      var kept = new URLSearchParams();
      url.searchParams.forEach(function (value, key) { if (/^utm_[a-z_]+$/.test(key)) kept.set(key, value); });
      var query = kept.toString();
      return url.origin + url.pathname + (query ? "?" + query : "");
    } catch (e) {
      return undefined;
    }
  };

  var readConsent = function () {
    try { return window.localStorage.getItem(CONSENT_KEY); } catch (e) { return null; }
  };

  var load = function () {
    if (loaded || PRIVATE.test(window.location.pathname)) return false;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    // send_page_view: false — the app sends exactly one page_view per route.
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      page_location: safe(window.location.href),
      page_referrer: document.referrer ? safe(document.referrer) : ""
    });
    var script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + MEASUREMENT_ID;
    document.head.appendChild(script);
    return true;
  };

  // Called by the consent banner. Returns true if analytics started now.
  window.mcbAnalytics = {
    consentKey: CONSENT_KEY,
    enable: load,
    isPrivatePath: function (path) { return PRIVATE.test(path); }
  };

  if (readConsent() === "granted") load();
})();
