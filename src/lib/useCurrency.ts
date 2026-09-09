/**
 * The display-currency context and its hook.
 *
 * Split from `currencyContext.tsx` — which exports the provider component —
 * because a module that exports both a component and a hook breaks React fast
 * refresh, and the tooling is right to say so. Keeping the non-component
 * exports here means the provider file exports exactly one component.
 */

import { createContext, useContext } from "react";
import { BASE_CURRENCY, type CurrencyCode, type RateSet } from "./currency";

export interface CurrencyContextValue {
  /** What to display prices in. Always a supported currency. */
  currency: CurrencyCode;
  /** Replaces the currency and remembers the choice. */
  setCurrency: (code: CurrencyCode) => void;
  /** Rates for converting GBP, or null when none are available. */
  rates: RateSet | null;
  /** True once the customer has made an explicit choice. */
  chosen: boolean;
}

/**
 * GBP with no rates is the default for anything rendered outside the
 * provider — every price falls back to its real GBP figure rather than
 * throwing or rendering blank.
 */
export const CurrencyContext = createContext<CurrencyContextValue>({
  currency: BASE_CURRENCY,
  setCurrency: () => {},
  rates: null,
  chosen: false,
});

export const useCurrency = (): CurrencyContextValue =>
  useContext(CurrencyContext);
