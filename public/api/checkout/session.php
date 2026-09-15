<?php
/**
 * POST /api/checkout/session — create a Stripe Checkout Session for a SAVED order.
 *
 * DORMANT BY DEFAULT. Returns 503 unless `stripe.checkout_sessions_enabled`
 * is true AND the configured key is a Stripe TEST key — or a LIVE key with
 * `stripe.live_checkout_approved` (lib/stripe.php). No browser flag can
 * enable it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * READINESS
 * ─────────────────────────────────────────────────────────────────────────
 * Only an order that can actually be made is offered for payment: its
 * per-memory personalisation saved and COMPLETE (every promised photo
 * received), and — for anything posted — delivery QUOTED by the server. An
 * order quoted from a TEST_ONLY delivery fixture is refused outside test mode.
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
require_once __DIR__ . '/../lib/video.php';

require_method('POST');
require_same_origin();

$config = mcb_config();
$stripe = $config['stripe'] ?? [];

$availability = stripe_checkout_availability();
if (!$availability['available']) {
    if ($availability['reason'] === 'disabled') {
        json_error(503, 'checkout_sessions_disabled', 'Online checkout is not available yet.');
    }
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}
$mode      = (string) $availability['mode'];
$secretKey = (string) ($stripe['secret_key'] ?? '');

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
$order = find_order_by_token(db(), $orderId, $token);
if ($order === null) {
    json_error(404, 'order_not_found', 'We could not find that order.');
}

// An order that is already paid must not get a second payable session.
if ($order['status'] !== 'PENDING') {
    json_error(409, 'order_not_payable', 'That order is not awaiting payment.');
}

// ---- Ready to be made? ----------------------------------------------------
$blocker = order_checkout_blocker($order, $mode);
if ($blocker !== null) {
    if ($blocker === 'delivery_test_only') {
        error_log("MCB checkout: order {$orderId} was quoted TEST_ONLY delivery; refusing a {$mode} session.");
    }
    [$status, $code, $message] = match ($blocker) {
        'awaiting_uploads'     => [409, 'awaiting_uploads', 'We are still waiting for a photo you chose to add. Please add it and try again.'],
        'delivery_unavailable' => [409, 'delivery_unavailable', "We need to confirm delivery for this order before you pay, so it can't be paid online yet. Please contact MCB and we'll help."],
        'delivery_test_only'   => [409, 'order_not_payable_online', 'This order cannot be paid online. Please contact MCB.'],
        default                => [409, 'order_not_ready', 'This order is missing the details we need to make your songs. Please place it again from the order page.'],
    };
    json_error($status, $code, $message);
}

// ---- The saved lines -----------------------------------------------------
$stmt = db()->prepare(
    'SELECT item_id, product_id, item_name, quantity, unit_minor, line_minor
       FROM order_items WHERE order_id = :id ORDER BY id'
);
$stmt->execute([':id' => $orderId]);
$lines = $stmt->fetchAll();

// New sales suspended since this order was created: no new payment is taken.
foreach ($lines as $line) {
    if (sales_suspended((string) $line['item_id'], $line['product_id'] === null ? null : (string) $line['product_id'])) {
        json_error(409, 'product_unavailable', $line['item_name'] . ' is currently unavailable, so this order cannot be paid. Please contact MCB.');
    }
}

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
 * The saved lines must add up to the saved subtotal, and subtotal plus the
 * saved delivery must be the saved payable total. An order from before the
 * canonical catalogue has no integer line amounts, and any disagreement means
 * the record cannot be trusted to charge from — both are refused rather than
 * re-priced from today's catalogue.
 */
$deliveryMinor = $order['delivery_minor'] === null ? 0 : (int) $order['delivery_minor'];
$goodsMinor    = $order['subtotal_minor'] === null ? (int) $order['total_minor'] : (int) $order['subtotal_minor'];
if ($lines === [] || $order['total_minor'] === null || $totalMinor !== $goodsMinor
    || $goodsMinor + $deliveryMinor !== (int) $order['total_minor']
    || $totalMinor <= 0 || $order['currency'] !== 'GBP') {
    error_log("MCB checkout: order {$orderId} has no consistent saved lines; refusing a session.");
    json_error(409, 'order_not_payable_online', 'This order cannot be paid online. Please contact MCB.');
}

/**
 * MCB Memory Music Video: a space is held for each chosen video before the
 * customer is sent to pay, under a lock on the capacity period. A full period
 * refuses the session, so no one pays for a video without a space. The hold
 * outlives the Stripe session; a repeated session extends the same hold.
 */
try {
    video_period_at(db());
    video_transaction(static fn (PDO $pdo): int => video_hold_for_checkout($pdo, $orderId));
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
}

// ---- Idempotency and expiry -----------------------------------------------
$payableMinor = (int) $order['total_minor'];

$fingerprint = hash('sha256', json_encode([
    'order'    => $orderId,
    'lines'    => array_map(static fn (array $l): array => [$l['item_id'], (int) $l['quantity'], (int) $l['unit_minor']], $lines),
    'delivery' => [$deliveryMinor, $order['delivery_rate_id']],
    'mode'     => $mode,
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
                 expected_amount_gbp, expected_minor, currency, livemode, attempt, ip_hash)
             VALUES (:o, :h, :p, NULL, :l, :amt, :minor, :cur, :live, :a, :ip)'
        )->execute([
            ':o'     => $orderId,
            ':h'     => $snapshotHash,
            ':p'     => $order['package'],
            ':l'     => json_encode($lines, JSON_UNESCAPED_SLASHES),
            ':amt'   => minor_to_decimal($payableMinor),
            ':minor' => $payableMinor,
            ':cur'   => 'GBP',
            ':live'  => $mode === 'live' ? 1 : 0,
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
    /**
     * GBP ONLY. Stripe's Adaptive Pricing otherwise offers the customer their
     * local currency (a visitor in India is shown rupees first), and a session
     * paid in another currency reports that currency and amount — which the
     * webhook rightly refuses to treat as payment of a GBP order, leaving it
     * under review. The site says payment is taken in GBP; this makes it so.
     * Found in the Stripe TEST-mode rehearsal, not by the stub.
     */
    'adaptive_pricing'    => ['enabled' => false],
    // {CHECKOUT_SESSION_ID} is substituted by Stripe; /thank-you needs it.
    'success_url'         => $origin . '/thank-you?session_id={CHECKOUT_SESSION_ID}',
    // Back to the order's Review step, which offers to resume payment for the
    // saved order. Nothing about the order is put in the URL.
    'cancel_url'          => $origin . '/create?step=review&checkout=cancelled',
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
 * Delivery, exactly as the server quoted and saved it, as a fixed shipping
 * amount — so Stripe shows it as delivery and `amount_total` is the saved
 * payable total. Never added when nothing is posted.
 */
if ($deliveryMinor > 0) {
    $params['shipping_options'] = [[
        'shipping_rate_data' => [
            'type'         => 'fixed_amount',
            'display_name' => (string) $order['delivery_label'],
            'fixed_amount' => ['amount' => $deliveryMinor, 'currency' => 'gbp'],
        ],
    ]];
}

/**
 * Automatic tax stays OFF: no tax treatment is approved, and with it off
 * `amount_total` equals the saved total exactly, which is what the webhook
 * requires before marking anything paid.
 */
$session = stripe_create_checkout_session($secretKey, $params, 'mcb_' . $fingerprint . '_' . $attempt);

// A session Stripe reports in the other mode is not one this server may use.
if (is_array($session) && array_key_exists('livemode', $session) && $session['livemode'] !== ($mode === 'live')) {
    error_log("MCB checkout: Stripe returned a session in the wrong mode for order {$orderId}; refusing it.");
    $session = null;
}

// Only Stripe's own Checkout host is ever handed to the browser.
if ($session === null || empty($session['url']) || empty($session['id'])
    || !str_starts_with((string) $session['url'], 'https://checkout.stripe.com/')) {
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

record_order_event_safely(db(), $orderId, 'CHECKOUT.SESSION_CREATED', [
    'attempt'        => $attempt,
    'expected_minor' => $payableMinor,
    'mode'           => $mode,
]);

json_response(200, [
    'id'  => (string) $session['id'],
    'url' => (string) $session['url'],
]);
