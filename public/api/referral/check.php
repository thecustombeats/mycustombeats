<?php
/**
 * GET /api/referral/check?code=MCB-R-XXXXXX — is this code usable?
 *
 * Responds `{ "valid": true }` or `{ "valid": false }`. Nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS DELIBERATELY DOES NOT RETURN
 * ─────────────────────────────────────────────────────────────────────────
 * The referrer's name, email, customer id, order history, or how many people
 * they have referred. A referral link is shared with friends, forwarded, and
 * occasionally posted somewhere public — and everyone who holds it can call
 * this. If it answered "valid, referred by Ada Lovelace" then every share
 * would be a disclosure about the sender.
 *
 * A friendly "you were invited by Ada" would be a nice touch on the landing
 * page. It is not worth turning a URL into a lookup for someone's name.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AND WHY IT DOES NOT DISTINGUISH ITS FAILURES
 * ─────────────────────────────────────────────────────────────────────────
 * Malformed, unknown and revoked all answer `valid: false`. Separating them
 * would confirm which codes exist, which is exactly what someone enumerating
 * the space needs. `resolve_referral_code` collapses the three for the same
 * reason.
 *
 * The endpoint is not required for attribution — the browser stores the code
 * and `order.php` resolves it authoritatively at the point of sale. This
 * exists so a landing page can quietly ignore a code that will never work,
 * rather than showing a customer a referral state that is not real.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/referral.php';

require_method('GET');

$code = strtoupper(trim((string) ($_GET['code'] ?? '')));

/**
 * Shape-checked BEFORE the rate limiter and before any query.
 *
 * A malformed code cannot be a real one, so refusing it here costs nothing
 * and means garbage never reaches the database or consumes anyone's budget.
 */
if (!referral_code_is_wellformed($code)) {
    json_response(200, ['valid' => false]);
}

/**
 * Rate limited on the CLICK ledger's own ip_hash column.
 *
 * A lookup that answers yes or no about a guessed identifier is an
 * enumeration surface, and 32^6 codes are only out of reach if you cannot try
 * them quickly. Sixty an hour is far more than a person following a link will
 * ever need and far less than a script requires to be productive.
 *
 * Counted against `clicks` because it already carries a salted ip_hash and a
 * created_at, and giving this endpoint its own table would mean a new table
 * whose only purpose is to be counted.
 */
enforce_rate_limit('clicks', 'ip_hash', hash_ip(client_ip()), 60, 3600);

$referral = resolve_referral_code(db(), $code);

// One bit, and only one bit.
json_response(200, ['valid' => $referral !== null]);
