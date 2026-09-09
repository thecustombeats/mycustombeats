<?php
/**
 * GET /api/fx/rates — GBP-based exchange rates for DISPLAY ONLY.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * Not a pricing endpoint. Nothing here decides what anyone pays. MCB's
 * commercial prices are GBP and live in `src/data/packages.ts` and the
 * catalogue; Stripe charges GBP through fixed Payment Links. These rates let
 * the browser show a customer roughly what a GBP price means in their own
 * money, and that is the whole of it. No amount produced from this response
 * is ever sent back to a server or used to build a charge.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY MCB PROXIES INSTEAD OF LETTING THE BROWSER CALL THE PROVIDER
 * ─────────────────────────────────────────────────────────────────────────
 * PRIVACY. Any HTTP request the browser makes hands the visitor's IP address
 * to whoever receives it. Fetching rates directly would give a third party an
 * address for every visitor to the site, for a number that is identical for
 * all of them. Proxying means the provider sees ONE server, a few times a
 * day, and never a customer.
 *
 * COST AND STABILITY. One upstream call per cache window serves every
 * visitor, instead of one per browser.
 *
 * PROVIDER: Frankfurter (https://frankfurter.dev) — free, no API key, no
 * registration, HTTPS, and published from European Central Bank reference
 * rates. It is chosen precisely because it needs no credential: a keyed
 * provider would either put a secret in the browser bundle or require secret
 * management for a number that is not secret. ECB rates update once per
 * working day, which is exactly the right resolution for an estimate, and the
 * absence of a key means there is no quota to exhaust and nothing to leak.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * FAILURE IS NORMAL AND SAFE
 * ─────────────────────────────────────────────────────────────────────────
 * Every failure path returns 503 with no rates. The site then shows GBP,
 * which is the real price — so an outage here degrades the page to the
 * *correct* prices rather than to wrong ones. Nothing about ordering,
 * checkout, the CRM or fulfilment touches this endpoint.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');

/** Currencies the site presents. Mirrors SUPPORTED_CURRENCIES in currency.ts. */
const MCB_FX_CURRENCIES = ['USD', 'EUR', 'INR', 'AUD', 'CAD'];

/** ECB publishes once per working day; refreshing more often buys nothing. */
const MCB_FX_CACHE_SECONDS = 6 * 3600;

/**
 * How long a cached set may still be served after it goes stale.
 *
 * If the provider is down, week-old rates are still a far better estimate
 * than no estimate — and vastly better than a hard-coded one, which is what
 * "just put a fallback rate in the code" really means. Beyond this the cache
 * is abandoned and the site falls back to GBP.
 */
const MCB_FX_STALE_GRACE_SECONDS = 7 * 86400;

const MCB_FX_TIMEOUT_SECONDS = 4;

/** Where the cached set lives. Deliberately outside the web root's reach. */
function fx_cache_path(): string
{
    return rtrim(sys_get_temp_dir(), '/') . '/mcb-fx-rates.json';
}

function fx_read_cache(): ?array
{
    $path = fx_cache_path();
    if (!is_readable($path)) {
        return null;
    }
    $raw = @file_get_contents($path);
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) && isset($data['rates'], $data['fetchedAt']) ? $data : null;
}

function fx_write_cache(array $payload): void
{
    // Written via a temporary file and renamed, so a reader can never observe
    // a half-written JSON document.
    $path = fx_cache_path();
    $tmp  = $path . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmp, json_encode($payload)) !== false) {
        @rename($tmp, $path);
    }
}

/**
 * Fetches a fresh set from the provider, or null.
 *
 * Only the currencies MCB actually shows are requested, and only rates that
 * are finite and positive are kept — a zero or a null from upstream would
 * render "£79 ≈ $0" on a product page, which is worse than showing nothing.
 */
function fx_fetch_upstream(): ?array
{
    $url = 'https://api.frankfurter.dev/v1/latest?base=GBP&symbols='
        . implode(',', MCB_FX_CURRENCIES);

    $raw = null;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => MCB_FX_TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => MCB_FX_TIMEOUT_SECONDS,
            CURLOPT_USERAGENT      => 'MCB-FX/1.0 (+https://www.mycustombeats.com)',
        ]);
        $response = curl_exec($ch);
        $status   = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        if (is_string($response) && $status >= 200 && $status < 300) {
            $raw = $response;
        }
    }

    if ($raw === null) {
        $context = stream_context_create(['http' => [
            'timeout' => MCB_FX_TIMEOUT_SECONDS,
            'header'  => "User-Agent: MCB-FX/1.0\r\n",
        ]]);
        $response = @file_get_contents($url, false, $context);
        if (is_string($response)) {
            $raw = $response;
        }
    }

    if ($raw === null) {
        return null;
    }

    $data = json_decode($raw, true);
    if (!is_array($data) || ($data['base'] ?? null) !== 'GBP' || !is_array($data['rates'] ?? null)) {
        return null;
    }

    $rates = [];
    foreach (MCB_FX_CURRENCIES as $code) {
        $value = $data['rates'][$code] ?? null;
        if (is_numeric($value) && (float) $value > 0) {
            $rates[$code] = (float) $value;
        }
    }

    if ($rates === []) {
        return null;
    }

    return [
        'base'      => 'GBP',
        'rates'     => $rates,
        'date'      => is_string($data['date'] ?? null) ? $data['date'] : '',
        'fetchedAt' => time() * 1000,
    ];
}

// ---------------------------------------------------------------------
// Serve
// ---------------------------------------------------------------------

$cached = fx_read_cache();
$ageSeconds = $cached !== null
    ? max(0, time() - (int) round(((int) $cached['fetchedAt']) / 1000))
    : PHP_INT_MAX;

if ($cached !== null && $ageSeconds < MCB_FX_CACHE_SECONDS) {
    header('Cache-Control: public, max-age=' . MCB_FX_CACHE_SECONDS);
    json_response(200, $cached + ['cache' => 'hit']);
}

$fresh = fx_fetch_upstream();

if ($fresh !== null) {
    fx_write_cache($fresh);
    header('Cache-Control: public, max-age=' . MCB_FX_CACHE_SECONDS);
    json_response(200, $fresh + ['cache' => 'miss']);
}

// Upstream failed. Serve a stale set if one is recent enough to still mean
// something; otherwise say so plainly and let the site show GBP.
if ($cached !== null && $ageSeconds < MCB_FX_STALE_GRACE_SECONDS) {
    error_log('MCB FX: provider unavailable, serving cached rates ' . $ageSeconds . 's old.');
    header('Cache-Control: public, max-age=600');
    json_response(200, $cached + ['cache' => 'stale']);
}

error_log('MCB FX: provider unavailable and no usable cache; the site will show GBP.');
json_error(503, 'rates_unavailable', 'Exchange rates are not available.');
