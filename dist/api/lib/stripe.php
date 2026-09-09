<?php
/**
 * MCB — Stripe REST helpers.
 *
 * Only what the Checkout Session endpoint needs. The Stripe PHP SDK is not
 * installed and is not added for this: one authenticated form POST does not
 * justify a dependency on shared hosting, and the SDK would have to be
 * vendored into the deployed tree.
 *
 * The secret key is passed in by the caller, which reads it from config. It
 * is never logged, never returned, and never reaches the browser.
 */

declare(strict_types=1);

const MCB_STRIPE_API_BASE = 'https://api.stripe.com/v1';
const MCB_STRIPE_TIMEOUT_SECONDS = 20;

/**
 * Where Stripe's API lives.
 *
 * Overridable through `stripe.api_base` for the acceptance suite ONLY, which
 * points it at a local stub so the tests never reach Stripe, never need a
 * secret key and can never create a real session. Production leaves the key
 * unset and gets the constant — exactly the arrangement `resend.api_url`
 * already uses for the customer email.
 */
function stripe_api_base(): string
{
    $configured = (string) mcb_setting('stripe.api_base', '');
    return $configured !== '' ? rtrim($configured, '/') : MCB_STRIPE_API_BASE;
}

/**
 * Countries Stripe may collect a shipping address for.
 *
 * NOT a shipping-rate or delivery claim, and it charges nothing: no shipping
 * rate is approved, so no `shipping_options` are sent and Stripe adds no
 * delivery cost. This only governs which addresses the form will accept.
 *
 * Deliberately the two markets the site already prices in — sterling and
 * dollars — rather than a list invented here. Widening it is a business
 * decision that belongs with the shipping rates.
 */
/**
 * UNUSED. Retained deliberately.
 *
 * `checkout/session.php` no longer asks Stripe to collect a shipping address:
 * MCB's own form is authoritative, and a second address that nothing
 * reconciles is a liability rather than evidence. See the note there.
 *
 * This list is left in place because `['GB', 'US']` is exactly the sort of
 * restriction that gets reintroduced by accident — MCB sells internationally,
 * and an allowlist of two countries would stop everyone else at the payment
 * step. If shipping collection is ever reinstated, start from that problem
 * rather than from this list.
 */
function stripe_shipping_countries(): array
{
    return ['GB', 'US'];
}

/**
 * Encodes a nested array as Stripe's bracketed form syntax.
 *
 * Stripe's API takes application/x-www-form-urlencoded, not JSON, so
 * ['line_items' => [['quantity' => 1]]] has to become
 * line_items[0][quantity]=1. http_build_query does exactly this, but emits
 * booleans as "1"/"" — Stripe wants "true"/"false" — so they are normalised
 * first.
 */
function stripe_form_encode(array $params): string
{
    $normalise = static function ($value) use (&$normalise) {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }
        if (is_array($value)) {
            return array_map($normalise, $value);
        }
        return $value;
    };

    return http_build_query(array_map($normalise, $params), '', '&', PHP_QUERY_RFC3986);
}

/**
 * Creates a Checkout Session.
 *
 * Returns the decoded session on success, or null — callers must treat null
 * as a refusal, not as a reason to fall back to an unpriced charge.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE IDEMPOTENCY KEY MUST BE DETERMINISTIC
 * ─────────────────────────────────────────────────────────────────────────
 * This previously sent `bin2hex(random_bytes(16))` — a fresh key on every
 * request. That is an idempotency key in name only: two requests could never
 * share one, so it protected against nothing. A double-click created two
 * payable sessions for the same basket.
 *
 * The caller now supplies a key derived from the basket fingerprint, so the
 * same checkout retried is the same key and Stripe returns the original
 * session rather than creating another.
 *
 * The key is SERVER-GENERATED. It is never taken from the request: a caller
 * choosing the key could deliberately collide with someone else's checkout,
 * or defeat its own protection by varying it.
 *
 * @param string $idempotencyKey Stable, server-derived. Required.
 */
function stripe_create_checkout_session(
    string $secretKey,
    array $params,
    string $idempotencyKey
): ?array {
    if (!function_exists('curl_init')) {
        error_log('MCB checkout: cURL unavailable; cannot reach Stripe.');
        return null;
    }

    if ($idempotencyKey === '') {
        error_log('MCB checkout: refusing to create a session without an idempotency key.');
        return null;
    }

    $ch = curl_init(stripe_api_base() . '/checkout/sessions');
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => stripe_form_encode($params),
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $secretKey,
            'Content-Type: application/x-www-form-urlencoded',
            // Stripe caps this at 255 characters.
            'Idempotency-Key: ' . substr($idempotencyKey, 0, 255),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => MCB_STRIPE_TIMEOUT_SECONDS,
        CURLOPT_CONNECTTIMEOUT => MCB_STRIPE_TIMEOUT_SECONDS,
    ]);

    $raw    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error  = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        // The key is in the request, never in the log line.
        error_log('MCB checkout: Stripe request failed: ' . $error);
        return null;
    }

    $decoded = json_decode((string) $raw, true);

    if ($status < 200 || $status >= 300 || !is_array($decoded)) {
        $message = is_array($decoded) ? ($decoded['error']['message'] ?? '') : '';
        error_log("MCB checkout: Stripe returned {$status}: {$message}");
        return null;
    }

    return $decoded;
}
