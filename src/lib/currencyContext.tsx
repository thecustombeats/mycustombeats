/**
 * The customer's chosen display currency, shared across the site.
 *
 * Holds three things and nothing else: which currency to show, the rate set to
 * show it with, and a way to change it. No price lives here — prices are GBP
 * and come from the package and catalogue data, exactly as before.
 *
 * PRECEDENCE
 *   1. what the customer chose, if they ever chose
 *   2. otherwise, a guess from the browser's own time zone
 *   3. otherwise GBP
 *
 * The guess is a DEFAULT, never a decision. One click replaces it, and the
 * choice is remembered so the site does not keep switching back underneath
 * someone who has already told it what they want.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BASE_CURRENCY,
  detectDefaultCurrency,
  isSupportedCurrency,
  type CurrencyCode,
  type RateSet,
} from "./currency";
import { CurrencyContext } from "./useCurrency";
import { getRates } from "./fxRates";
import { trackEvent } from "./analytics";

const STORAGE_KEY = "mcb_display_currency";

/** The remembered choice, or null. Storage can throw; that is not fatal. */
const readStoredCurrency = (): CurrencyCode | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isSupportedCurrency(value) ? value : null;
  } catch {
    return null;
  }
};

/**
 * The browser's time zone, or null.
 *
 * No network request, no permission prompt, no IP address handed to anyone —
 * see `countryFromTimeZone`. Guarded because `Intl` can be absent or disabled.
 */
const browserTimeZone = (): string | null => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  /**
   * Resolved once, during the initial state computation, so the first paint
   * already shows the right currency instead of rendering GBP and visibly
   * swapping a moment later.
   */
  const [{ currency, chosen }, setState] = useState<{
    currency: CurrencyCode;
    chosen: boolean;
  }>(() => {
    const stored = readStoredCurrency();
    if (stored) return { currency: stored, chosen: true };

    const languages =
      typeof navigator !== "undefined"
        ? (navigator.languages ?? [navigator.language]).filter(Boolean)
        : [];

    return {
      currency: detectDefaultCurrency(browserTimeZone(), languages),
      chosen: false,
    };
  });

  const [rates, setRates] = useState<RateSet | null>(null);

  /**
   * Fetch rates once per mount, and never for GBP-only visitors who have not
   * asked for anything else — there is nothing to convert, so there is
   * nothing to fetch.
   */
  useEffect(() => {
    if (currency === BASE_CURRENCY) return;

    let cancelled = false;
    void getRates().then((result) => {
      if (!cancelled) setRates(result);
    });
    return () => {
      cancelled = true;
    };
  }, [currency]);

  const setCurrency = useCallback((code: CurrencyCode) => {
    if (!isSupportedCurrency(code)) return;

    setState({ currency: code, chosen: true });
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      // The selection still applies for this visit.
    }

    // Only the ISO code. No location, no IP, no order data — and only on a
    // deliberate change, never on the automatic default, which would fire on
    // every page load and say nothing about what anyone chose.
    trackEvent("currency_changed", { currency: code });
  }, []);

  const value = useMemo(
    () => ({ currency, setCurrency, rates, chosen }),
    [currency, setCurrency, rates, chosen]
  );

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
};
