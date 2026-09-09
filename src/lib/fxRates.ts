/**
 * Retrieving the display rate set.
 *
 * ONE FETCH FOR THE WHOLE SITE. A rate set covers every currency and every
 * price, so it is fetched once, cached, and reused by every package card,
 * product and summary line. Nothing here runs per price.
 *
 * NEVER THROWS, NEVER BLOCKS. Every path resolves — to a rate set or to
 * `null` — because the only consequence of failure is that prices display in
 * GBP, which is what they actually cost. No render, order, checkout or
 * payment waits on this or is affected by it.
 */

import { parseRateSet, type RateSet } from "./currency";

/** MCB's own proxy. See `public/api/fx/rates.php` for why it is not direct. */
const RATES_ENDPOINT = "/api/fx/rates";

/**
 * How long the browser reuses a set before asking again.
 *
 * Shorter than the server's cache on purpose: the server decides when to go
 * upstream, and this only decides when to ask the server. Both are far longer
 * than an estimate needs — the underlying ECB reference rates move once a
 * working day.
 */
const CLIENT_CACHE_MS = 6 * 60 * 60 * 1000;

/** Abandon a slow request rather than leave prices unresolved. */
const REQUEST_TIMEOUT_MS = 6000;

const STORAGE_KEY = "mcb_fx_rates";

/**
 * In-memory cache, so several components mounting at once share one request.
 *
 * The in-flight promise is held too: without it, a page with a packages
 * section and a products grid would fire two identical requests on first
 * paint.
 */
let memoryCache: RateSet | null = null;
let inFlight: Promise<RateSet | null> | null = null;

const isFresh = (rates: RateSet): boolean =>
  Date.now() - rates.fetchedAt < CLIENT_CACHE_MS;

/**
 * Reads the last set this browser stored.
 *
 * Wrapped because storage throws outright in some privacy modes, and a
 * currency estimate is never worth breaking a page for. A stored set that
 * fails validation is discarded rather than repaired.
 */
const readStored = (): RateSet | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return parseRateSet(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeStored = (rates: RateSet): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rates));
  } catch {
    // Private browsing, blocked storage, quota. Nothing here is essential.
  }
};

/**
 * The current rate set, or `null` when none can be had.
 *
 * Order of preference: memory, then this browser's stored set, then the
 * server. A stale stored set is still returned if the network fails — old
 * rates make a better estimate than no estimate, and far better than a
 * hard-coded one.
 */
export const getRates = async (): Promise<RateSet | null> => {
  if (memoryCache && isFresh(memoryCache)) return memoryCache;

  if (!memoryCache) {
    const stored = readStored();
    if (stored) {
      memoryCache = stored;
      if (isFresh(stored)) return stored;
    }
  }

  if (inFlight) return inFlight;

  inFlight = (async (): Promise<RateSet | null> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(RATES_ENDPOINT, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      // A 503 from the endpoint is its documented "no rates" answer, not an
      // error to report. So is a 404 before the endpoint is deployed.
      if (!response.ok) return memoryCache;

      const parsed = parseRateSet(await response.json());
      if (!parsed) return memoryCache;

      memoryCache = parsed;
      writeStored(parsed);
      return parsed;
    } catch {
      // Offline, timeout, blocked, malformed. Keep whatever we already had.
      return memoryCache;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
};

/** Test seam: forget everything cached in this tab. */
export const resetRatesCache = (): void => {
  memoryCache = null;
  inFlight = null;
};
