<?php
/**
 * POST /api/checkout/session — create a Stripe Checkout Session.
 *
 * DORMANT BY DEFAULT. Returns 503 unless `stripe.checkout_sessions_enabled`
 * is true in config. The live payment path remains the Stripe Payment Links
 * resolved in the browser; nothing here is reachable until it is switched on
 * deliberately, after end-to-end testing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRICING AUTHORITY — THE WHOLE POINT OF THIS FILE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Browser  →  sends a SELECTION: package, format, order id, and a list of
 *               item ids with integer quantities.
 *   Server   →  looks every one of those up, prices them, and totals them.
 *   Stripe   →  receives line items this server generated.
 *
 * The browser cannot submit an amount. There is no request field for one:
 * the only keys read below are `package`, `format`, `orderId` and
 * `enhancements[].id` / `enhancements[].quantity`. A body carrying `price`,
 * `amount`, `unit_amount`, `total`, `currency` or a Stripe price id is parsed
 * and those keys are ignored — they are never read, so they can never reach
 * Stripe. `lib/basket.php` has no parameter through which one could arrive.
 *
 * Amounts come from `api/data/packages.json` and `api/data/catalogue.json`,
 * both generated from the TypeScript sources at build time. A price can only
 * change by editing the source of truth and rebuilding.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS ENDPOINT REFUSES TO DO
 * ─────────────────────────────────────────────────────────────────────────
 * It never marks an order paid. Creating a session is an intention to pay,
 * not a payment; only the signed Stripe webhook moves PENDING → PAID.
 *
 * It never charges in anything but GBP. The customer's display currency
 * (Sprint 3) is presentation and is not accepted, read or transmitted here.
 *
 * It never takes a redirect target from the caller. Success and cancel URLs
 * are built from trusted config, so no request can point a paying customer
 * at somewhere else afterwards.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/basket.php';

require_method('POST');
require_same_origin();

$config = mcb_config();
$stripe = $config['stripe'] ?? [];

// ---- Feature flag -----------------------------------------------------
// Off unless explicitly enabled. A missing key means off.
if (empty($stripe['checkout_sessions_enabled'])) {
    json_error(
        503,
        'checkout_sessions_disabled',
        'Checkout sessions are not enabled. Use the configured payment link.'
    );
}

$secretKey = (string) ($stripe['secret_key'] ?? '');
if ($secretKey === '') {
    error_log('MCB checkout: stripe.secret_key is empty; refusing to create a session.');
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}

/**
 * Rate limit before any work.
 *
 * Creating a Checkout Session is an authenticated call to a third party with
 * a cost and a quota. A script that could invoke it in a loop would burn both
 * and fill the table, so the limit is enforced on the salted IP hash MCB
 * already uses everywhere else — the raw address is never stored.
 */
$ipHash = hash_ip(client_ip());
enforce_rate_limit('checkout_sessions', 'ip_hash', $ipHash, 20, 3600);

// ---- Selection, and nothing else --------------------------------------
$body = read_json_body(16384);
$v    = new Validator($body);

$package = $v->oneOf('package', valid_package_ids(), 'Package');

$formatRaw = $v->str('format', 16);
$format    = $formatRaw === '' ? null : $formatRaw;

/**
 * The order id is REQUIRED for a dynamic session, unlike the Payment Link
 * path where it is a best-effort join.
 *
 * A dynamic basket has no meaning without the order it belongs to: the
 * snapshot is keyed on it, the webhook reconciles through it, and a payment
 * that arrives with no order is money nobody can fulfil. The Payment Link
 * path can survive without one because its amount is fixed in Stripe; this
 * one cannot.
 *
 * Numeric only. Anything else is refused rather than coerced — the Sprint 0
 * fix that stopped a visitor-controlled referral string being cast into
 * someone else's order id.
 */
$orderIdRaw = $body['orderId'] ?? null;
$orderId = (is_int($orderIdRaw) || (is_string($orderIdRaw) && ctype_digit($orderIdRaw)))
    ? (int) $orderIdRaw
    : 0;

if ($orderId <= 0) {
    $v->fail('orderId', 'A valid order reference is required.');
}

// The basket beyond the package. Absent means a base-package checkout.
$itemsRaw = $body['enhancements'] ?? [];
if (!is_array($itemsRaw)) {
    $v->fail('enhancements', 'That basket could not be read.');
    $itemsRaw = [];
}
if (count($itemsRaw) > 20) {
    // A ceiling on the request itself, before anything is looked up.
    $v->fail('enhancements', 'That basket has too many items.');
    $itemsRaw = [];
}

$v->stopIfInvalid();

// ---- The order this checkout belongs to -------------------------------
$stmt = db()->prepare(
    'SELECT o.id, o.status, c.email
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
      WHERE o.id = :id
      LIMIT 1'
);
$stmt->execute([':id' => $orderId]);
$order = $stmt->fetch();

if ($order === false) {
    json_error(404, 'order_not_found', 'We could not find that order.');
}

/**
 * An order that is already paid must not get a second payable session.
 *
 * Nothing else in the system would stop a customer being charged twice for
 * one order, so it is stopped here.
 */
if ($order['status'] !== 'PENDING') {
    json_error(409, 'order_not_payable', 'That order is not awaiting payment.');
}

// ---- Server-side pricing ----------------------------------------------
/**
 * The package charged is the one in THIS request, not the one stored on the
 * order.
 *
 * That is deliberate and is what lets a customer change their mind — a
 * Moment upgraded to a Keepsake before paying (Sprint 5) must be charged as
 * a Keepsake. The request is still validated against the catalogue from
 * scratch, so "different from the order" never means "unpriced" or "not
 * sold"; it only means the customer chose again.
 */
$basket = price_basket($package, $format, $itemsRaw);

if (!$basket->ok) {
    json_error(422, (string) $basket->errorCode, (string) $basket->errorMessage);
}

$expectedMinor = $basket->totalMinor;
$fulfilment    = derive_fulfilment_type($package, $format);

/**
 * Physical fulfilment is derived from the package, the format AND the basket.
 *
 * A digital Moment with a framed lyric print in the basket still has to be
 * posted. Asking only the package would have missed that the moment
 * enhancements existed.
 */
$needsShipping = $fulfilment === 'PHYSICAL';
foreach ($basket->lines as $line) {
    $item = catalogue_item($line['id']);
    if ($item !== null && ($item['fulfilment'] ?? '') === 'PHYSICAL') {
        $needsShipping = true;
    }
}

// ---- Idempotency ------------------------------------------------------
/**
 * A repeated click must not create a second payable session.
 *
 * The basket is fingerprinted and stored against the order under a UNIQUE
 * key, so the second attempt finds the first attempt's row and returns the
 * session it already created. Nothing is charged twice, and Stripe is not
 * called again.
 *
 * The fingerprint also seeds Stripe's own Idempotency-Key. The previous
 * implementation generated that key with `random_bytes`, which is a fresh
 * key on every request — technically an idempotency key, practically no
 * protection at all, because no two requests could ever share one.
 */
$fingerprint = basket_fingerprint($orderId, $package, $format, $basket->lines);

$stmt = db()->prepare(
    'SELECT stripe_session_id, stripe_session_url, status
       FROM checkout_sessions
      WHERE order_id = :o AND basket_hash = :h
      LIMIT 1'
);
$stmt->execute([':o' => $orderId, ':h' => $fingerprint]);
$existing = $stmt->fetch();

if ($existing !== false && !empty($existing['stripe_session_url'])) {
    json_response(200, [
        'id'       => (string) $existing['stripe_session_id'],
        'url'      => (string) $existing['stripe_session_url'],
        'reused'   => true,
    ]);
}

// Record the intention BEFORE calling Stripe, so the expected amount is
// committed even if the network call is later lost mid-flight.
if ($existing === false) {
    try {
        $stmt = db()->prepare(
            'INSERT INTO checkout_sessions
                (order_id, basket_hash, package, format, basket_lines,
                 expected_amount_gbp, currency, ip_hash)
             VALUES (:o, :h, :p, :f, :l, :amt, :cur, :ip)'
        );
        $stmt->execute([
            ':o'   => $orderId,
            ':h'   => $fingerprint,
            ':p'   => $package,
            ':f'   => $format,
            ':l'   => json_encode($basket->lines, JSON_UNESCAPED_SLASHES),
            ':amt' => number_format($expectedMinor / 100, 2, '.', ''),
            ':cur' => 'GBP',
            ':ip'  => $ipHash,
        ]);
    } catch (PDOException $e) {
        if (!is_duplicate_error($e)) {
            error_log('MCB checkout: could not record checkout session: ' . $e->getMessage());
            json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
        }
        // A concurrent identical request won the insert. Fall through and let
        // Stripe's own idempotency key return the same session to both.
    }
}

// ---- Build the session ------------------------------------------------
/**
 * Redirect targets come from TRUSTED CONFIG, never from the request.
 *
 * A caller-supplied success URL would let anyone send a paying customer
 * somewhere else the instant they finished paying.
 *
 * `{CHECKOUT_SESSION_ID}` is a Stripe placeholder it substitutes on redirect,
 * and it is load-bearing: /thank-you uses the session id to look up the MCB
 * reference and to fire the purchase event. Without it the customer reaches a
 * page that cannot tell them their reference and records no conversion —
 * exactly the defect Sprint 0 found on the Moment Payment Link, and the
 * reason it is fixed here from the beginning.
 */
$origin  = rtrim((string) ($config['app']['site_origin'] ?? ''), '/');
if ($origin === '') {
    error_log('MCB checkout: app.site_origin is not configured.');
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}
$success = $origin . '/thank-you?session_id={CHECKOUT_SESSION_ID}';
$cancel  = $origin . '/#order';

$lineItems = [];
foreach ($basket->lines as $line) {
    /**
     * One truthful line per item, priced by the server.
     *
     * A single aggregated amount would be easier and worse: the customer's
     * Stripe receipt would say only "£449", and reconciling a dispute or a
     * partial refund later would mean reconstructing the basket by hand.
     *
     * The NAME comes from the generated catalogue, never from the request —
     * a caller-supplied name would put arbitrary text on a Stripe receipt
     * and in MCB's payment records.
     */
    $lineItems[] = [
        'quantity'   => $line['quantity'],
        'price_data' => [
            'currency'     => 'gbp',
            'unit_amount'  => $line['unit_minor'],
            'product_data' => ['name' => $line['name']],
        ],
    ];
}

$params = [
    'mode'                => 'payment',
    'success_url'         => $success,
    'cancel_url'          => $cancel,
    'line_items'          => $lineItems,
    'client_reference_id' => (string) $orderId,
    /**
     * Machine identifiers only.
     *
     * No story, no personal touches, no phone number, no address, no artwork
     * URL, no recipient details. Stripe is a payment processor, not a second
     * copy of the customer's brief — and the order id already leads to all of
     * it in MCB's own database, which is where it belongs.
     */
    'metadata' => [
        'mcb_order_id'    => (string) $orderId,
        'mcb_package'     => $package,
        'mcb_format'      => (string) $format,
        'mcb_fulfilment'  => (string) $fulfilment,
        'mcb_basket_hash' => $fingerprint,
        'mcb_checkout'    => 'dynamic-v1',
    ],
];

/**
 * The customer's email comes from the ORDER, not the request.
 *
 * It prefills Stripe and makes the receipt match MCB's record. Taking it from
 * the request instead would let a caller attach someone else's order to their
 * own email address.
 */
if (!empty($order['email'])) {
    $params['customer_email'] = (string) $order['email'];
}

/**
 * AUTOMATIC TAX IS DELIBERATELY NOT ENABLED.
 *
 * No tax treatment is approved anywhere in MCB's commercial sources, and
 * turning it on would change what a customer pays relative to the advertised
 * price — a commercial and legal decision, not a technical one. It also
 * requires a Stripe Tax registration and an origin address that cannot be
 * verified from this repository.
 *
 * Leaving it off has a second, load-bearing consequence: `amount_total` then
 * equals the server's expected basket EXACTLY, which is what lets the webhook
 * reconcile strictly. Enabling tax later means revisiting that comparison so
 * a legitimate tax component is not read as a mismatch.
 */

if ($needsShipping) {
    /**
     * Belt and braces. MCB validates and stores its own delivery address in
     * `delivery_addresses` before the customer ever reaches Stripe, and that
     * record remains authoritative for fulfilment. Stripe's copy exists for
     * payment-dispute evidence.
     *
     * Derived from the package, format and basket — never toggled by the
     * request. Note for activation: this asks the customer for their address
     * a second time, which is worth a UX decision before the flag is turned on.
     */
    $params['shipping_address_collection'] = ['allowed_countries' => stripe_shipping_countries()];
}

// Deterministic: the same basket retried produces the same key, so Stripe
// returns the original session instead of creating another payable one.
$session = stripe_create_checkout_session($secretKey, $params, 'mcb_' . $fingerprint);

if ($session === null || empty($session['url']) || empty($session['id'])) {
    // Mark the attempt failed but keep the snapshot: it records what MCB
    // intended to charge, which is exactly what an operator needs if a
    // payment somehow arrives for it anyway.
    try {
        db()->prepare(
            "UPDATE checkout_sessions SET status = 'FAILED'
              WHERE order_id = :o AND basket_hash = :h AND stripe_session_id IS NULL"
        )->execute([':o' => $orderId, ':h' => $fingerprint]);
    } catch (PDOException $e) {
        error_log('MCB checkout: could not mark session failed: ' . $e->getMessage());
    }

    // The Stripe error is logged inside stripe_create_checkout_session and is
    // deliberately not echoed: a raw provider message can carry account and
    // configuration detail a customer must never see.
    json_error(502, 'stripe_unavailable', 'We could not start checkout. Please try again.');
}

// Attach the created session to its snapshot, so the webhook can find the
// expected amount from the id Stripe will send back.
try {
    db()->prepare(
        'UPDATE checkout_sessions
            SET stripe_session_id = :sid, stripe_session_url = :url
          WHERE order_id = :o AND basket_hash = :h'
    )->execute([
        ':sid' => (string) $session['id'],
        ':url' => (string) $session['url'],
        ':o'   => $orderId,
        ':h'   => $fingerprint,
    ]);
} catch (PDOException $e) {
    error_log('MCB checkout: could not attach Stripe session to snapshot: ' . $e->getMessage());
}

// Only what the browser needs to redirect. No Stripe internals, no config,
// no key.
json_response(200, [
    'id'  => (string) $session['id'],
    'url' => (string) $session['url'],
]);
