/**
 * The one place a price is rendered.
 *
 * Every price on the site goes through here, so the relationship between the
 * commercial GBP figure and the local estimate is stated identically
 * everywhere and cannot drift between a package card and a product block.
 *
 * WHAT IT RENDERS
 *   GBP selected            £79
 *   another currency        Approx. $101
 *                           £79 · charged in GBP
 *   rates unavailable       £79
 *
 * GBP IS NEVER HIDDEN. Whatever the customer is browsing in, the pound figure
 * stays on screen, because that is the price and that is what Stripe will
 * charge. The estimate is explicitly an estimate, and the charging currency
 * is named next to it rather than buried in a footnote.
 */

import {
  BASE_CURRENCY,
  approximateLabel,
  formatGbpAmount,
} from "../lib/currency";
import { useCurrency } from "../lib/useCurrency";

interface PriceProps {
  /** The commercial price, in pounds. The only amount this component trusts. */
  gbp: number;
  /** Qualifier for an open-ended commission, e.g. "From". */
  prefix?: string;
  /** Visual size of the GBP figure. */
  size?: "sm" | "md" | "lg";
  /** Dark sections need lighter type than the ivory canvas. */
  tone?: "dark" | "light";
  className?: string;
}

const GBP_SIZE: Record<NonNullable<PriceProps["size"]>, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
};

const Price = ({
  gbp,
  prefix,
  size = "md",
  tone = "dark",
  className = "",
}: PriceProps) => {
  const { currency, rates } = useCurrency();

  const approx = approximateLabel(gbp, currency, rates);
  const gbpText = formatGbpAmount(gbp);
  const qualifier = prefix ? `${prefix} ` : "";

  const strong = tone === "light" ? "text-ivory" : "text-espresso";
  const quiet = tone === "light" ? "text-ivory/70" : "text-espresso/60";

  /**
   * GBP selected, or no rates to convert with. One figure, stated plainly —
   * no "approximately", because there is nothing approximate about it.
   */
  if (approx === null) {
    return (
      <p className={`${GBP_SIZE[size]} font-light ${strong} ${className}`}>
        {qualifier}
        {gbpText}
      </p>
    );
  }

  return (
    <div className={className}>
      {/*
        The estimate leads, because it is the number the customer came to
        this page able to read. The pound figure sits directly beneath it,
        never removed, with the charging currency named.
      */}
      <p className={`${GBP_SIZE[size]} font-light ${strong}`}>
        {qualifier}
        {approx}
      </p>
      <p className={`mt-0.5 text-xs ${quiet}`}>
        {qualifier}
        {gbpText} · charged in {BASE_CURRENCY}
      </p>
    </div>
  );
};

export default Price;
