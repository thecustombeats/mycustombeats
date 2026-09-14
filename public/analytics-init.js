/*
 * MCB — Google Analytics 4 bootstrap (src/lib/analytics.ts sends the events).
 *
 * An external file rather than an inline <script>, so the Content-Security-
 * Policy in public/.htaccess can forbid inline scripts entirely.
 *
 * PRIVACY RULES ENFORCED HERE
 *  • Private pages load no analytics at all: /your-order, /approve and
 *    /operations carry secret links or staff data, and nothing about them is
 *    useful to marketing measurement.
 *  • Every page_location and page_referrer is reduced to origin + path (+ utm_
 *    parameters only). A URL fragment never reaches Google, and neither does
 *    ?session_id= on /thank-you or a Stripe Checkout URL in the referrer.
 *  • No customer content is ever sent (see analytics.ts).
 */
(function () {
  var MEASUREMENT_ID = "G-XQFNJC4HND";
  var PRIVATE = /^\/(your-order|approve|operations)(\/|$)/;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };

  if (PRIVATE.test(window.location.pathname)) {
    // gtag stays a harmless queue that is never sent anywhere.
    window.__mcbAnalyticsDisabled = true;
    return;
  }

  var safe = function (href, sameOriginOnly) {
    try {
      var url = new URL(href);
      if (url.origin !== window.location.origin) return sameOriginOnly ? undefined : url.origin + "/";
      var kept = new URLSearchParams();
      url.searchParams.forEach(function (value, key) { if (/^utm_[a-z_]+$/.test(key)) kept.set(key, value); });
      var query = kept.toString();
      return url.origin + url.pathname + (query ? "?" + query : "");
    } catch (e) {
      return undefined;
    }
  };

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
})();
