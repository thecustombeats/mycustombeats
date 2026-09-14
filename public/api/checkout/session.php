<?php
/**
 * POST /api/checkout/session — create a Stripe Checkout Session for a SAVED order.
 *
 * DORMANT BY DEFAULT. Returns 503 unless `stripe.checkout_sessions_enabled`
 * is true in config.
 *
 * REQUEST  { orderId, checkoutToken }   — and nothing else is read.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRICING AUTHORITY
 * ─────────────────────────────────────────────────────────────────────────
 * The session is built from the order's saved lines in `order_items`, priced
 * by the server when the order was created. The request names no product, no
 * SKU, no quantity and no amount, so it cannot change what is charged. To
 * change what they are buying, a customer creates a new order.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTHORISATION
 * ─────────────────────────────────────────────────────────────────────────
 * Order ids are sequential. The checkout token is a 256-bit secret returned
 * only to the browser that created the order and stored as a hash, and it is
 * required here. A wrong token and an unknown order get the same 404, so the
 * endpoint confirms nothing about which orders exist — and nobody can open
 * a payment page pre-filled with another customer's email.
 *
 * It never marks an order paid, never charges anything but GBP, and never
 * takes a redirect target from the caller.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('POST');
require_same_origin();

$config = mcb_config();
$stripe = $config['stripe'] ?? [];

if (empty($stripe['checkout_sessions_enabled'])) {
    json_error(503, 'checkout_sessions_disabled', 'Online checkout is not available yet.');
}

$secretKey = (string) ($stripe['secret_key'] ?? '');
if ($secretKey === '') {
    error_log('MCB checkout: stripe.secret_key is empty; refusing to create a session.');
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}

$ipHash = hash_ip(client_ip());
enforce_rate_limit('checkout_sessions', 'ip_hash', $ipHash, 20, 3600);

$body = read_json_body(4096);

$orderIdRaw = $body['orderId'] ?? null;
$orderId = (is_int($orderIdRaw) || (is_string($orderIdRaw) && ctype_digit($orderIdRaw)))
    ? (int) $orderIdRaw
    : 0;
$token = $body['checkoutToken'] ?? null;

if ($orderId <= 0 || !is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
    json_error(422, 'invalid_request', 'A valid order and checkout token are required.');
}

// ---- The order, authorised by its token --------------------------------
$stmt = db()->prepare(
    'SELECT o.id, o.status, o.package, o.fulfilment_type, o.total_minor, o.currency,
            o.checkout_token_hash, c.email
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE o.id = :id
      LIMIT 1'
);
$stmt->execute([':id' => $orderId]);
$order = $stmt->fetch();

if ($order === false
    || !is_string($order['checkout_token_hash'])
    || !hash_equals($order['checkout_token_hash'], hash('sha256', $token))) {
    json_error(404, 'order_not_found', 'We could not find that order.');
}

// An order that is already paid must not get a second payable session.
if ($order['status'] !== 'PENDING') {
    json_error(409, 'order_not_payable', 'That order is not awaiting payment.');
}

// ---- The saved lines -----------------------------------------------------
$stmt = db()->prepare(
    'SELECT item_id, item_name, quantity, unit_minor, line_minor
       FROM order_items WHERE order_id = :id ORDER BY id'
);
$stmt->execute([':id' => $orderId]);
$lines = $stmt->fetchAll();

$totalMinor = 0;
foreach ($lines as $line) {
    if ($line['unit_minor'] === null || $line['line_minor'] === null
        || (int) $line['line_minor'] !== (int) $line['unit_minor'] * (int) $line['quantity']) {
        $lines = [];
        break;
    }
    $totalMinor += (int) $line['line_minor'];
}

/**
 * The saved lines must add up to the saved total. An order from before the
 * canonical catalogue has no integer line amounts, and any disagreement means
 * the record cannot be trusted to charge from — both are refused rather than
 * re-priced from today's catalogue.
 */
if ($lines === [] || $order['total_minor'] === null || $totalMinor !== (int) $order['total_minor']
    || $totalMinor <= 0 || $order['currency'] !== 'GBP') {
    error_log("MCB checkout: order {$orderId} has no consistent saved lines; refusing a session.");
    json_error(409, 'order_not_payable_online', 'This order cannot be paid online. Please contact MCB.');
}

// ---- Idempotency and expiry -----------------------------------------------
$fingerprint = hash('sha256', json_encode([
    'order' => $orderId,
    'lines' => array_map(static fn (array $l): array => [$l['item_id'], (int) $l['quantity'], (int) $l['unit_minor']], $lines),
], JSON_UNESCAPED_SLASHES));

/**
 * One snapshot row per attempt. A saved order's lines never change, so every
 * attempt for it shares the same fingerprint; the latest attempt is the one
 * that may be reused.
 */
$stmt = db()->prepare(
    'SELECT basket_hash, stripe_session_id, stripe_session_url, stripe_expires_at, status, attempt
       FROM checkout_sessions WHERE order_id = :o ORDER BY attempt DESC LIMIT 1'
);
$stmt->execute([':o' => $orderId]);
$existing = $stmt->fetch();

/**
 * A live session is reused, so a repeated click never creates a second
 * payable session. One that has expired, or will within a minute, is replaced:
 * Stripe cannot complete an expired session, and handing it back would leave
 * the customer with no way to pay.
 */
if ($existing !== false && !empty($existing['stripe_session_url']) && $existing['status'] === 'CREATED'
    && $existing['stripe_expires_at'] !== null
    && strtotime((string) $existing['stripe_expires_at'] . ' UTC') > time() + 60) {
    json_response(200, [
        'id'     => (string) $existing['stripe_session_id'],
        'url'    => (string) $existing['stripe_session_url'],
        'reused' => true,
    ]);
}

/**
 * A replaced session keeps its row, marked EXPIRED, with its Stripe session id
 * and expected amount intact — so a payment that still arrives for it is
 * matched against its own snapshot, not just the order total. A failed attempt
 * that never produced a session is retried on the same row.
 */
$attempt = 0;
$snapshotHash = $fingerprint;
$insert = true;

if ($existing !== false) {
    if ($existing['stripe_session_id'] === null) {
        // Same row, new attempt number: Stripe may have cached the failed
        // request against the previous idempotency key.
        $attempt = (int) $existing['attempt'] + 1;
        $snapshotHash = (string) $existing['basket_hash'];
        $insert = false;
    } else {
        $attempt = (int) $existing['attempt'] + 1;
        $snapshotHash = hash('sha256', $fingerprint . '#' . $attempt);
    }
}

try {
    if ($existing !== false && $existing['stripe_session_id'] !== null) {
        db()->prepare(
            "UPDATE checkout_sessions SET status = 'EXPIRED'
              WHERE order_id = :o AND basket_hash = :h AND status = 'CREATED'"
        )->execute([':o' => $orderId, ':h' => $existing['basket_hash']]);
    }
    if ($insert) {
        db()->prepare(
            'INSERT INTO checkout_sessions
                (order_id, basket_hash, package, format, basket_lines,
                 expected_amount_gbp, expected_minor, currency, attempt, ip_hash)
             VALUES (:o, :h, :p, NULL, :l, :amt, :minor, :cur, :a, :ip)'
        )->execute([
            ':o'     => $orderId,
            ':h'     => $snapshotHash,
            ':p'     => $order['package'],
            ':l'     => json_encode($lines, JSON_UNESCAPED_SLASHES),
            ':amt'   => minor_to_decimal($totalMinor),
            ':minor' => $totalMinor,
            ':cur'   => 'GBP',
            ':a'     => $attempt,
            ':ip'    => $ipHash,
        ]);
    } else {
        db()->prepare("UPDATE checkout_sessions SET status = 'CREATED', attempt = :a WHERE order_id = :o AND basket_hash = :h")
            ->execute([':a' => $attempt, ':o' => $orderId, ':h' => $snapshotHash]);
    }
} catch (PDOException $e) {
    if (!is_duplicate_error($e)) {
        error_log('MCB checkout: could not record checkout session: ' . $e->getMessage());
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }
    // A concurrent identical request won the insert; Stripe's idempotency key
    // returns the same session to both.
}

// ---- Build the session ------------------------------------------------------
$origin = rtrim((string) ($config['app']['site_origin'] ?? ''), '/');
if ($origin === '') {
    error_log('MCB checkout: app.site_origin is not configured.');
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}

$lineItems = array_map(static fn (array $line): array => [
    'quantity'   => (int) $line['quantity'],
    'price_data' => [
        'currency'     => 'gbp',
        'unit_amount'  => (int) $line['unit_minor'],
        'product_data' => ['name' => 'MCB ' . (string) $line['item_name']],
    ],
], $lines);

$params = [
    'mode'                => 'payment',
    // {CHECKOUT_SESSION_ID} is substituted by Stripe; /thank-you needs it.
    'success_url'         => $origin . '/thank-you?session_id={CHECKOUT_SESSION_ID}',
    'cancel_url'          => $origin . '/#order',
    'line_items'          => $lineItems,
    'client_reference_id' => (string) $orderId,
    // Machine identifiers only — no story, contact details or address.
    'metadata' => [
        'mcb_order_id'    => (string) $orderId,
        'mcb_basket_hash' => $fingerprint,
        'mcb_checkout'    => 'saved-order-v2',
    ],
    // From the order, which the token has just authorised.
    'customer_email' => (string) $order['email'],
];

/**
 * Automatic tax stays OFF: no tax treatment is approved, and with it off
 * `amount_total` equals the saved total exactly, which is what the webhook
 * requires before marking anything paid.
 */
$session = stripe_create_checkout_session($secretKey, $params, 'mcb_' . $fingerprint . '_' . $attempt);

if ($session === null || empty($session['url']) || empty($session['id'])) {
    try {
        db()->prepare(
            "UPDATE checkout_sessions SET status = 'FAILED'
              WHERE order_id = :o AND basket_hash = :h AND stripe_session_id IS NULL"
        )->execute([':o' => $orderId, ':h' => $snapshotHash]);
    } catch (PDOException $e) {
        error_log('MCB checkout: could not mark session failed: ' . $e->getMessage());
    }
    json_error(502, 'stripe_unavailable', 'We could not start checkout. Please try again.');
}

$expiresAt = is_int($session['expires_at'] ?? null)
    ? gmdate('Y-m-d H:i:s', $session['expires_at'])
    : gmdate('Y-m-d H:i:s', time() + 23 * 3600);

try {
    db()->prepare(
        'UPDATE checkout_sessions
            SET stripe_session_id = :sid, stripe_session_url = :url, stripe_expires_at = :exp
          WHERE order_id = :o AND basket_hash = :h'
    )->execute([
        ':sid' => (string) $session['id'],
        ':url' => (string) $session['url'],
        ':exp' => $expiresAt,
        ':o'   => $orderId,
        ':h'   => $snapshotHash,
    ]);
} catch (PDOException $e) {
    error_log('MCB checkout: could not attach Stripe session to snapshot: ' . $e->getMessage());
}

json_response(200, [
    'id'  => (string) $session['id'],
    'url' => (string) $session['url'],
]);
