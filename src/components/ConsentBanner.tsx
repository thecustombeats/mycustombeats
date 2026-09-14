import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { isPrivateAnalyticsPath, trackPageView } from "../lib/analytics";

/**
 * Analytics cookie choice.
 *
 * Google Analytics is not needed for the site to work, so it stays off until
 * the visitor accepts (public/analytics-init.js). Both choices are equally
 * easy; the banner does not block the page; the decision can be changed from
 * "Cookie settings" in the footer. Nothing is shown on private pages, which
 * never load analytics.
 */

export const CONSENT_KEY = "mcb_analytics_consent";
export const OPEN_COOKIE_SETTINGS = "mcb:open-cookie-settings";

type Choice = "granted" | "denied";

const readChoice = (): Choice | null => {
  try {
    const value = window.localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
};

const clearGoogleAnalyticsCookies = () => {
  const host = window.location.hostname.replace(/^www\./, "");
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
    if (name === "_ga" || name.startsWith("_ga_")) {
      for (const domain of ["", `; domain=.${host}`, `; domain=${window.location.hostname}`]) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domain}`;
      }
    }
  }
};

const ConsentBanner = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(() => readChoice() === null);

  useEffect(() => {
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS, reopen);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS, reopen);
  }, []);

  if (!open || isPrivateAnalyticsPath(pathname)) return null;

  const choose = (choice: Choice) => {
    try {
      window.localStorage.setItem(CONSENT_KEY, choice);
    } catch {
      /* private browsing: the choice lasts for this page only */
    }
    const w = window as unknown as { mcbAnalytics?: { enable: () => boolean } };
    if (choice === "granted") {
      if (w.mcbAnalytics?.enable()) trackPageView(pathname, true);
    } else {
      clearGoogleAnalyticsCookies();
    }
    setOpen(false);
  };

  return (
    <section
      role="region"
      aria-label="Cookie choice"
      className="fixed inset-x-0 bottom-0 z-[10000] border-t border-ink/15 bg-ivory px-5 py-5 shadow-[0_-10px_30px_rgba(13,27,42,0.12)] sm:px-8"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <p className="text-base leading-relaxed text-espresso">
          May we use analytics cookies to understand how the site is used? They help us improve it and are only set if
          you agree. <Link to="/legal/privacy" className="font-semibold text-ink underline underline-offset-4">Privacy policy</Link>
        </p>
        <div className="flex shrink-0 flex-col gap-3 min-[420px]:flex-row">
          <button
            type="button"
            onClick={() => choose("granted")}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
          >
            Accept analytics cookies
          </button>
          <button
            type="button"
            onClick={() => choose("denied")}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-6 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
          >
            Reject analytics cookies
          </button>
        </div>
      </div>
    </section>
  );
};

export default ConsentBanner;
