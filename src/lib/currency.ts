/**
 * LOCAL CURRENCY PRESENTATION — display only.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE RULE
 * ─────────────────────────────────────────────────────────────────────────
 * GBP is the commercial truth. Everything in this module is a way of helping
 * a customer *understand* a GBP price; none of it is a price.
 *
 * A converted figure is an estimate that changes with the market. The GBP
 * amount does not change, the Stripe charge is GBP, and no amount computed
 * here is ever sent to a server, written to an order, or used to decide what
 * anyone pays. See `lib/memory.ts` and `sections/OrderFormSection.tsx`: the
 * checkout total and the Payment Link are both resolved from package data,
 * and neither has any access to a rate.
 *
 * That is why this file exports no "price" type and nothing that looks like
 * one. It converts numbers and formats strings.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY NOT THE HARD-CODED PACKAGE USD FIGURES
 * ─────────────────────────────────────────────────────────────────────────
 * `data/packages.ts` carries a legacy `price.usd` per package. It is NOT used
 * here, ever. Those figures are a business-approved historical amount written
 * to `orders.amount_usd` and read back by the CRM — a record, not a rate — and
 * using them for display would give MCB two different answers to "what is this
 * in dollars?": a fixed $99 and a live ~$101. One of them would always be
 * wrong, and which one a customer saw would depend on which component rendered
 * it. Display USD comes from GBP and a live rate, and from nowhere else.
 */

/* ------------------------------------------------------------------ */
/* Supported currencies                                                */
/* ------------------------------------------------------------------ */

export type CurrencyCode = "GBP" | "USD" | "EUR" | "INR" | "AUD" | "CAD";

export interface CurrencyDefinition {
  code: CurrencyCode;
  /** Spoken name, for the selector's accessible label. */
  name: string;
  /**
   * Locale used for formatting — chosen for the SYMBOL it produces, not
   * because it is the currency's home.
   *
   * A currency's own locale formats it the way locals write it, which is
   * exactly wrong on an international storefront: `en-AU` renders AUD as a
   * bare "$155" and `en-CA` renders CAD as "$139", because inside those
   * countries there is nothing to disambiguate. On a British site sitting
   * beside a pound price, "$155" reads as US dollars to almost everyone.
   *
   * `en-GB` renders them "A$155" and "CA$139" — the distinction the customer
   * actually needs. USD keeps `en-US` so the world's default dollar stays the
   * plain "$101" people expect rather than the pointedly foreign "US$101"
   * `en-GB` would give it.
   */
  locale: string;
}

/**
 * The six currencies MCB presents today, GBP first because it is the real one.
 *
 * Extending this list is one entry plus one rate from the provider; nothing
 * else in the system enumerates currencies.
 */
export const SUPPORTED_CURRENCIES: readonly CurrencyDefinition[] = [
  { code: "GBP", name: "British pound", locale: "en-GB" },   // £79
  { code: "USD", name: "US dollar", locale: "en-US" },       // $101
  // en-GB, not de-DE: the euro's own locale puts the symbol after the number
  // ("93 €"), which sits oddly in a column of symbol-first prices.
  { code: "EUR", name: "Euro", locale: "en-GB" },            // €93
  { code: "INR", name: "Indian rupee", locale: "en-IN" },    // ₹8,900
  { code: "AUD", name: "Australian dollar", locale: "en-GB" }, // A$155
  { code: "CAD", name: "Canadian dollar", locale: "en-GB" },  // CA$139
];

/** The commercial currency. Never converted, never estimated. */
export const BASE_CURRENCY: CurrencyCode = "GBP";

export const isSupportedCurrency = (value: unknown): value is CurrencyCode =>
  typeof value === "string" &&
  SUPPORTED_CURRENCIES.some((currency) => currency.code === value);

export const getCurrency = (
  code: CurrencyCode
): CurrencyDefinition | undefined =>
  SUPPORTED_CURRENCIES.find((currency) => currency.code === code);

/* ------------------------------------------------------------------ */
/* Rates                                                               */
/* ------------------------------------------------------------------ */

/**
 * A set of rates quoted against GBP: `rates.USD` is how many dollars one
 * pound buys.
 *
 * `base` is part of the shape rather than assumed, so a response that is not
 * GBP-based can be rejected outright instead of silently converting the wrong
 * way round — an error that would look plausible and be wildly wrong.
 */
export interface RateSet {
  base: "GBP";
  rates: Readonly<Partial<Record<CurrencyCode, number>>>;
  /** The provider's own date for these rates, for display and debugging. */
  date: string;
  /** When MCB retrieved them, epoch ms. */
  fetchedAt: number;
}

/**
 * Validates anything claiming to be a rate set.
 *
 * A rate is only accepted if it is a finite number greater than zero. Zero,
 * negatives, NaN and Infinity are exactly the values that would render "£79 =
 * $0" or "$NaN" on a luxury storefront, so they are rejected at the boundary
 * rather than defended against at every call site.
 */
export const parseRateSet = (input: unknown): RateSet | null => {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;

  if (raw.base !== "GBP") return null;
  if (typeof raw.rates !== "object" || raw.rates === null) return null;

  const source = raw.rates as Record<string, unknown>;
  const rates: Partial<Record<CurrencyCode, number>> = {};

  for (const { code } of SUPPORTED_CURRENCIES) {
    if (code === BASE_CURRENCY) continue;
    const value = source[code];
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code] = value;
    }
  }

  if (Object.keys(rates).length === 0) return null;

  return {
    base: "GBP",
    rates,
    date: typeof raw.date === "string" ? raw.date : "",
    fetchedAt:
      typeof raw.fetchedAt === "number" && Number.isFinite(raw.fetchedAt)
        ? raw.fetchedAt
        : Date.now(),
  };
};

/* ------------------------------------------------------------------ */
/* Conversion                                                          */
/* ------------------------------------------------------------------ */

/**
 * Converts a GBP amount for display, or returns `null`.
 *
 * `null` is the honest answer whenever a conversion cannot be made — no rate
 * set, no rate for that currency, a rate that failed validation, or a
 * nonsensical input. Callers must then show the GBP price, which is always
 * correct because it is the price.
 *
 * GBP returns `null` too, deliberately: there is nothing to estimate about
 * the currency the customer is actually charged in, and a caller that renders
 * "Approx. £79" beside "£79" would be absurd.
 */
export const convertFromGbp = (
  amountGbp: number,
  code: CurrencyCode,
  rates: RateSet | null
): number | null => {
  if (!Number.isFinite(amountGbp)) return null;
  if (code === BASE_CURRENCY) return null;
  if (!rates) return null;

  const rate = rates.rates[code];
  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  const converted = amountGbp * rate;
  return Number.isFinite(converted) ? converted : null;
};

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Formats a converted amount as whole units.
 *
 * WHOLE UNITS, ON PURPOSE. This is an estimate, and "$101.47" claims a
 * precision the number does not have — the customer's own bank will apply its
 * own rate and fees anyway. Rounding to the unit reads as the approximation it
 * is, and matches how the GBP prices are already written (£79, not £79.00).
 *
 * The GBP amount it derives from is never rounded; only this display string
 * is. And no `.99` is ever manufactured — the figure is whatever the rate
 * produces.
 */
export const formatConverted = (
  amount: number,
  code: CurrencyCode
): string | null => {
  if (!Number.isFinite(amount)) return null;
  const definition = getCurrency(code);
  if (!definition) return null;

  try {
    return new Intl.NumberFormat(definition.locale, {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(amount));
  } catch {
    // Intl can throw on an unknown currency in older engines. A price is not
    // worth a crash; the caller falls back to GBP.
    return null;
  }
};

/**
 * Formats a GBP amount — the commercial price.
 *
 * Separate from `formatConverted` because it is a different KIND of number:
 * exact, contractual and never an estimate. Keeping them apart means no
 * caller can accidentally pass a converted figure to the formatter that
 * renders prices as fact.
 */
export const formatGbpAmount = (amountGbp: number): string => {
  if (!Number.isFinite(amountGbp)) return "";
  return `£${Math.round(amountGbp).toLocaleString("en-GB")}`;
};

/**
 * The full customer-facing estimate, e.g. "Approx. $101".
 *
 * Returns `null` for GBP and for any failure, so a component can simply ask
 * for the estimate and render nothing when there isn't one.
 */
export const approximateLabel = (
  amountGbp: number,
  code: CurrencyCode,
  rates: RateSet | null
): string | null => {
  const converted = convertFromGbp(amountGbp, code, rates);
  if (converted === null) return null;
  const formatted = formatConverted(converted, code);
  return formatted === null ? null : `Approx. ${formatted}`;
};

/* ------------------------------------------------------------------ */
/* Country → currency                                                  */
/* ------------------------------------------------------------------ */

/**
 * Countries whose visitors are offered a non-GBP currency by default.
 *
 * Deliberately short. Everywhere else falls back to GBP, which is never wrong
 * — it is the actual price — whereas guessing at a currency MCB does not
 * support would be.
 *
 * The euro entry lists the euro-area countries the site is likely to see
 * rather than every ISO member, because the point is a sensible default, not
 * a geopolitical reference table.
 */
const COUNTRY_CURRENCY: Readonly<Record<string, CurrencyCode>> = {
  GB: "GBP",
  US: "USD",
  IN: "INR",
  AU: "AUD",
  CA: "CAD",
  // Euro area
  AT: "EUR", BE: "EUR", CY: "EUR", DE: "EUR", EE: "EUR", ES: "EUR",
  FI: "EUR", FR: "EUR", GR: "EUR", HR: "EUR", IE: "EUR", IT: "EUR",
  LT: "EUR", LU: "EUR", LV: "EUR", MT: "EUR", NL: "EUR", PT: "EUR",
  SI: "EUR", SK: "EUR",
};

/**
 * The display currency for a two-letter country code, or GBP.
 *
 * Case-insensitive, and returns GBP for anything unrecognised — including
 * `undefined` — so callers never have to handle a missing country themselves.
 */
export const currencyForCountry = (
  country: string | null | undefined
): CurrencyCode => {
  if (typeof country !== "string") return BASE_CURRENCY;
  return COUNTRY_CURRENCY[country.trim().toUpperCase()] ?? BASE_CURRENCY;
};

/**
 * IANA time-zone → country, for the zones the supported currencies need.
 *
 * WHY A TIME ZONE AND NOT AN IP LOOKUP
 * The browser already knows its time zone. Reading it costs no network
 * request, sends no data anywhere, needs no permission prompt, and hands no
 * third party the visitor's IP address — which every geo-IP service requires
 * by construction. For choosing a DEFAULT that the customer can override with
 * one click, that trade is obviously right: a wrong guess costs a click, and
 * the fallback is the real price in the real currency.
 *
 * It is also all it is used for. Nothing here profiles anyone, and the value
 * is never stored, transmitted or attached to an order.
 */
const TIMEZONE_COUNTRY_PREFIX: readonly (readonly [string, string])[] = [
  ["Europe/London", "GB"],
  ["Europe/Belfast", "GB"],
  ["America/", "US"],       // refined below
  ["Asia/Kolkata", "IN"],
  ["Asia/Calcutta", "IN"],
  ["Australia/", "AU"],
];

/** Canadian zones, which sit under `America/` alongside the US ones. */
const CANADIAN_ZONES = new Set([
  "America/Toronto", "America/Vancouver", "America/Edmonton",
  "America/Winnipeg", "America/Halifax", "America/St_Johns",
  "America/Regina", "America/Montreal", "America/Moncton",
  "America/Whitehorse", "America/Yellowknife", "America/Iqaluit",
]);

/** Euro-area zones, by their capital city zone. */
const EURO_ZONES = new Set([
  "Europe/Dublin", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
  "Europe/Rome", "Europe/Amsterdam", "Europe/Brussels", "Europe/Vienna",
  "Europe/Lisbon", "Europe/Athens", "Europe/Helsinki", "Europe/Tallinn",
  "Europe/Riga", "Europe/Vilnius", "Europe/Bratislava", "Europe/Ljubljana",
  "Europe/Luxembourg", "Europe/Malta", "Europe/Nicosia", "Europe/Zagreb",
  "Atlantic/Canary", "Atlantic/Azores",
]);

/**
 * Best-effort country from an IANA time zone. `null` when unknown.
 *
 * Never throws: a browser without `Intl` support, or with the API disabled by
 * a privacy setting, simply yields `null` and the caller uses GBP.
 */
export const countryFromTimeZone = (timeZone: string | null): string | null => {
  if (!timeZone) return null;

  if (CANADIAN_ZONES.has(timeZone)) return "CA";
  if (EURO_ZONES.has(timeZone)) return "EUR_AREA";

  for (const [prefix, country] of TIMEZONE_COUNTRY_PREFIX) {
    if (timeZone === prefix || timeZone.startsWith(prefix)) return country;
  }
  return null;
};

/**
 * The currency to show a visitor before they have chosen one.
 *
 * Time zone first, because it identifies a place. Language is only consulted
 * when the zone says nothing, and only its region subtag ("en-CA" → CA) — a
 * language is not a country, and someone reading English in Berlin should not
 * be quoted dollars.
 *
 * Always returns a supported currency; GBP whenever it cannot tell.
 */
export const detectDefaultCurrency = (
  timeZone: string | null,
  languages: readonly string[] = []
): CurrencyCode => {
  const fromZone = countryFromTimeZone(timeZone);
  if (fromZone === "EUR_AREA") return "EUR";
  if (fromZone) return currencyForCountry(fromZone);

  for (const tag of languages) {
    const region = tag.split("-")[1];
    if (!region) continue;
    const currency = currencyForCountry(region);
    if (currency !== BASE_CURRENCY) return currency;
  }

  return BASE_CURRENCY;
};
