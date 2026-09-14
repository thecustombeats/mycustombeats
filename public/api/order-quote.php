<?php
/**
 * POST /api/order-quote — what an order WOULD cost, before it is saved.
 *
 * REQUEST  { lines: [{ sku, quantity }], shippingCountryCode }
 * RESPONSE { subtotal_minor, delivery: { status, minor, label, test_only },
 *            total_minor, payable, currency, lines }
 *
 * The Review step shows these figures rather than the browser's own
 * arithmetic. Nothing is written. The saved order is priced again, the same
 * way, when it is placed, and that saved total is what checkout charges.
 *
 * `payable` is false when delivery is UNAVAILABLE: the customer is told
 * before they enter anything more that this destination cannot be paid for
 * online yet.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('POST');
require_same_origin();

$body = read_json_body(16384);

$pricing = price_order_lines($body['lines'] ?? null);
if (!$pricing->ok) {
    json_error(422, (string) $pricing->errorCode, (string) $pricing->errorMessage);
}

$countryCode = null;
if ($pricing->fulfilmentType() === 'PHYSICAL') {
    $countryCode = country_code_for($body['shippingCountryCode'] ?? null, null);
    if ($countryCode === null) {
        json_error(422, 'country_required', 'Please choose the country for delivery.');
    }
}

$delivery = quote_delivery($pricing, $countryCode);

json_response(200, [
    'subtotal_minor' => $pricing->totalMinor,
    'delivery'       => $delivery->publicView(),
    'total_minor'    => $pricing->totalMinor + $delivery->minor,
    'payable'        => $delivery->status !== 'UNAVAILABLE',
    'currency'       => 'GBP',
    'lines'          => array_map(static fn (array $l): array => [
        'sku'        => $l['sku'],
        'name'       => $l['name'],
        'quantity'   => $l['quantity'],
        'unit_minor' => $l['unit_minor'],
        'line_minor' => $l['line_minor'],
    ], $pricing->lines),
]);
