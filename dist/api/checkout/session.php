<?php
/**
 * POST /api/checkout/session — create a Stripe Checkout Session.
 *
 * DORMANT BY DEFAULT. Returns 503 unless `stripe.checkout_sessions_enabled`
 * is true in config. The live payment path remains the Stripe Payment Links
 * resolved in the browser; nothing here is reachable until it is switched on
 * deliberately, after sandbox testing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRICING AUTHORITY — THE WHOLE POINT OF THIS FILE
 * ─────────────────────────────────────────────────────────────────────────
 *
 *   Browser  →  sends a SELECTION only: package id, format, order id.
 *   Server   →  maps that selection to the approved price and configuration.
 *   Stripe   →  receives a line item this server generated.
 *
 * The browser cannot submit an amount. There is no request field for one:
 * `read_json_body` gives an array, and the only keys read below are
 * `package`, `format` and `orderId`. A body carrying `price`, `amount`,
 * `unit_amount` or a Stripe price id is parsed and those keys are ignored —
 * they are never read, so they can never reach Stripe.
 *
 * The amount sent to Stripe comes from `package_price()`, which reads
 * api/data/packages.json, which is generated from src/data/packages.ts at
 * build time. A price can therefore only change by editing the source of
 * truth and rebuilding.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * Keepsakes. Not one physical product has an approved price, so a basket
 * cannot be totalled and none is accepted. The session is one line item: the
 * package. When keepsake pricing is approved, it is added to the generated
 * data and read here the same way — never accepted from the browser.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

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

// ---- Selection, and nothing else --------------------------------------
$body = read_json_body();
$v    = new Validator($body);

$package = $v->oneOf('package', valid_package_ids(), 'Package');

$formatRaw = $v->str('format', 16);
$format    = $formatRaw === '' ? null : $formatRaw;

// The combination must be one MCB actually sells, checked independently of
// whatever the browser believed.
if ($package !== '' && !package_allows_format($package, $format)) {
    $v->fail('format', 'That format is not available for this experience.');
}

$fulfilment = $package === '' ? null : derive_fulfilment_type($package, $format);
if ($package !== '' && $fulfilment === null) {
    $v->fail('format', 'That format is not available for this experience.');
}

// Optional join back to the MCB order record, exactly as the Payment Link
// path uses client_reference_id. Numeric only; anything else is dropped
// rather than forwarded.
$orderIdRaw = $body['orderId'] ?? null;
$orderId    = (is_int($orderIdRaw) || (is_string($orderIdRaw) && ctype_digit($orderIdRaw)))
    ? (string) (int) $orderIdRaw
    : null;

$v->stopIfInvalid();

// ---- Server-side pricing ----------------------------------------------
$def   = package_def($package);
$price = package_price($package);

// Sterling, matching the currency the packages are declared and displayed in.
$amountMinor = (int) round($price['gbp'] * 100);

if ($amountMinor <= 0) {
    error_log("MCB checkout: no positive price for package '{$package}'.");
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}

/**
 * Bespoke is displayed as "From £799" — a floor, not a fixed price.
 *
 * Its existing Payment Link charges exactly £799 for the base commission and
 * anything beyond that scope is quoted and invoiced separately. This session
 * charges the same £799, so the two paths are commercially identical. The
 * `price_prefix` in the generated data is a DISPLAY concern and is
 * deliberately not used to alter the amount: a session that tried to charge
 * an open-ended figure would have no figure to charge.
 */
$productName = 'MCB ' . (string) ($def['name'] ?? ucfirst($package));
if ($format !== null && $format !== '') {
    $productName .= ' — ' . strtoupper($format);
}

// ---- Build the session ------------------------------------------------
$origin  = rtrim((string) ($config['app']['site_origin'] ?? ''), '/');
$success = $origin . '/thank-you';
$cancel  = $origin . '/#order';

$params = [
    'mode'                 => 'payment',
    'success_url'          => $success,
    'cancel_url'           => $cancel,
    'line_items'           => [[
        'quantity'   => 1,
        'price_data' => [
            'currency'     => 'gbp',
            'unit_amount'  => $amountMinor,
            'product_data' => ['name' => $productName],
        ],
    ]],
    // Physical fulfilment needs an address; digital does not. Derived here,
    // never taken from the browser — the same rule the Payment Links encode
    // by having separate links per fulfilment type.
    'metadata' => [
        'mcb_package'    => $package,
        'mcb_format'     => (string) $format,
        'mcb_fulfilment' => (string) $fulfilment,
    ],
];

if ($orderId !== null) {
    $params['client_reference_id'] = $orderId;
    $params['metadata']['mcb_order_id'] = $orderId;
}

if ($fulfilment === 'PHYSICAL') {
    $params['shipping_address_collection'] = ['allowed_countries' => stripe_shipping_countries()];
}

$session = stripe_create_checkout_session($secretKey, $params);

if ($session === null || empty($session['url'])) {
    json_error(502, 'stripe_unavailable', 'We could not start checkout. Please try again.');
}

json_response(200, [
    'id'  => (string) ($session['id'] ?? ''),
    'url' => (string) $session['url'],
]);
