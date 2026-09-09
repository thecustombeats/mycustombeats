/**
 * The display-currency selector.
 *
 * A native `<select>` of ISO codes. Deliberately plain: it is a preference
 * control on a luxury storefront, not a feature, and it should be findable
 * without ever competing with the work on the page.
 *
 * NO FLAGS. A flag is a country and a currency is not — the euro spans twenty
 * of them, and a Canadian dollar beside a maple leaf still reads as "$" to
 * everyone else. ISO codes say exactly what they mean, translate nowhere, and
 * are announced correctly by a screen reader. That is also why the accessible
 * name spells the currency out ("US dollar") while the visible option stays a
 * three-letter code.
 *
 * A native select is used rather than a custom menu because it brings its own
 * keyboard handling, its own focus behaviour and the platform's own picker on
 * a phone — all of which a hand-built dropdown would have to re-earn.
 */

import { useId } from "react";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "../lib/currency";
import { useCurrency } from "../lib/useCurrency";

interface CurrencySelectorProps {
  /** `light` for dark sections such as the footer. */
  tone?: "dark" | "light";
  className?: string;
}

const CurrencySelector = ({
  tone = "dark",
  className = "",
}: CurrencySelectorProps) => {
  const id = useId();
  const { currency, setCurrency } = useCurrency();

  const label = tone === "light" ? "text-ivory/70" : "text-espresso/60";
  const field =
    tone === "light"
      ? "border-ivory/25 bg-transparent text-ivory"
      : "border-espresso/15 bg-white text-espresso";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label
        htmlFor={id}
        className={`font-mono text-[10px] uppercase tracking-[0.14em] ${label}`}
      >
        Currency
      </label>

      <select
        id={id}
        value={currency}
        onChange={(event) => setCurrency(event.target.value as CurrencyCode)}
        className={`min-h-11 rounded-lg border px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-1 ${field}`}
      >
        {SUPPORTED_CURRENCIES.map(({ code, name }) => (
          /* The code is what is shown; the full name is what is read out and
             what a customer sees in a native picker on a phone. */
          <option key={code} value={code} label={code}>
            {code} — {name}
          </option>
        ))}
      </select>
    </div>
  );
};

export default CurrencySelector;
