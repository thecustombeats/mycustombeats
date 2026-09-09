<?php
/**
 * TEST FIXTURE — a stand-in for https://api.stripe.com/v1/checkout/sessions.
 *
 * Copied into the API directory by the acceptance-test setup only. It is not
 * part of public/ and never ships: production reads the real API base from
 * MCB_STRIPE_API_BASE, and nothing in the application references this file.
 *
 * WHY A STUB AND NOT STRIPE TEST MODE. The suite must be runnable by anyone,
 * offline, with no credential — and it must be impossible for a test run to
 * create anything in a real Stripe account, test mode included. A stub also
 * lets the tests assert what was SENT, which is the actual subject: the line
 * items, the quantities, the currency, the redirect URLs and the idempotency
 * key are all things the server must get right, and none of them are visible
 * from a successful response.
 *
 * Records each request to a log the tests read back. The Authorization header
 * is recorded as PRESENT/ABSENT only — never its value — so a secret can
 * never reach a log file, a terminal or CI output.
 *
 * /tmp/stripe-mode selects the behaviour being rehearsed:
 *
 *   ok         200 with a synthetic cs_test_… session
 *   http_fail  402 with a Stripe-shaped error object
 *   malformed  200 but no id or url
 *   timeout    sleeps past the client timeout
 */

declare(strict_types=1);

$mode = trim((string) @file_get_contents('/tmp/stripe-mode')) ?: 'ok';

$raw = file_get_contents('php://input') ?: '';
parse_str($raw, $params);

$headers = function_exists('getallheaders') ? getallheaders() : [];
$auth = 'ABSENT';
$idempotency = '';
foreach ($headers as $name => $value) {
    if (strcasecmp($name, 'Authorization') === 0) {
        // Presence only. The key itself is never written down.
        $auth = str_starts_with(trim((string) $value), 'Bearer ') ? 'PRESENT' : 'MALFORMED';
    }
    if (strcasecmp($name, 'Idempotency-Key') === 0) {
        $idempotency = (string) $value;
    }
}

/**
 * The same idempotency key returns the same session id.
 *
 * This is what makes the stub able to prove MCB's idempotency actually works:
 * a real Stripe replays the original session for a repeated key, so the stub
 * does too, deterministically derived from the key itself.
 */
$sessionId = 'cs_test_' . substr(hash('sha256', $idempotency !== '' ? $idempotency : $raw), 0, 24);

@file_put_contents('/tmp/stripe-stub.log', json_encode([
    'authorization'   => $auth,
    'idempotency_key' => $idempotency,
    'session_id'      => $sessionId,
    'params'          => $params,
]) . "\n", FILE_APPEND);

header('Content-Type: application/json');

if ($mode === 'timeout') {
    sleep(25);
}

if ($mode === 'http_fail') {
    http_response_code(402);
    echo json_encode(['error' => [
        'type'    => 'card_error',
        'code'    => 'card_declined',
        // Deliberately something a customer must never see verbatim; the
        // tests assert MCB does not echo it.
        'message' => 'INTERNAL STRIPE DETAIL acct_1234 should never be shown',
    ]]);
    return;
}

if ($mode === 'malformed') {
    echo json_encode(['object' => 'checkout.session']);
    return;
}

echo json_encode([
    'id'           => $sessionId,
    'object'       => 'checkout.session',
    'url'          => 'https://checkout.stripe.com/c/pay/' . $sessionId,
    'currency'     => $params['currency'] ?? 'gbp',
    'amount_total' => null,
    'status'       => 'open',
]);
