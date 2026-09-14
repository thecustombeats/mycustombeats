<?php
/**
 * MCB — what a customer may be told about their own saved order, and whether
 * it is ready to pay.
 *
 * Returned only to a caller holding the order's checkout token. Deliberately
 * NO story, name, email, address or upload identifier: the browser already
 * has what the customer typed, and a leaked token should leak nothing else.
 */

declare(strict_types=1);

/**
 * The order's authorisation and state, or null when the id and token do not
 * match an order. Wrong token and unknown order are indistinguishable.
 */
function find_order_by_token(PDO $pdo, mixed $orderIdRaw, mixed $token): ?array
{
    $orderId = (is_int($orderIdRaw) || (is_string($orderIdRaw) && ctype_digit($orderIdRaw))) ? (int) $orderIdRaw : 0;
    if ($orderId <= 0 || !is_string($token) || preg_match('/^[a-f0-9]{64}$/', $token) !== 1) {
        return null;
    }
    $order = find_order_row($pdo, $orderId);
    if ($order === null || !is_string($order['checkout_token_hash'])
        || !hash_equals($order['checkout_token_hash'], hash('sha256', $token))) {
        return null;
    }
    return $order;
}

/** An order's state, for callers that have already authorised it. */
function find_order_row(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT o.id, o.status, o.package, o.fulfilment_type, o.subtotal_minor, o.delivery_minor, o.total_minor,
                o.currency, o.delivery_status, o.delivery_rate_source, o.delivery_rate_id, o.delivery_label,
                o.personalisation_status, o.checkout_token_hash, c.email
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
          WHERE o.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $orderId]);
    $order = $stmt->fetch();
    return $order === false ? null : $order;
}

/** The summary fields added to an order-creation response. */
function order_summary_extras(array $summary): array
{
    return array_intersect_key($summary, array_flip([
        'subtotal_minor', 'delivery', 'personalisation_status', 'upload_slots', 'missing_uploads', 'checkout_blocker',
    ]));
}

/**
 * Why an order cannot start checkout, or null when it can.
 *
 *   not_payable              already paid, under review, cancelled …
 *   personalisation_missing  no per-memory personalisation was saved
 *   awaiting_uploads         a promised photo has not arrived
 *   delivery_unavailable     physical, and no authorised delivery rate
 *   delivery_test_only       quoted from a TEST_ONLY fixture, but this server
 *                            is not in test mode
 */
function order_checkout_blocker(array $order, ?string $mode): ?string
{
    if ($order['status'] !== 'PENDING') {
        return 'not_payable';
    }
    if ($order['personalisation_status'] === 'AWAITING_UPLOADS') {
        return 'awaiting_uploads';
    }
    if ($order['personalisation_status'] !== 'COMPLETE') {
        return 'personalisation_missing';
    }
    if ($order['fulfilment_type'] === 'PHYSICAL' && $order['delivery_status'] !== 'QUOTED') {
        return 'delivery_unavailable';
    }
    if ($order['delivery_rate_source'] === 'TEST_ONLY_FIXTURE' && $mode !== 'test') {
        return 'delivery_test_only';
    }
    return null;
}

/** The customer-safe summary of a saved order. */
function order_public_summary(PDO $pdo, array $order): array
{
    $items = $pdo->prepare(
        'SELECT item_id AS sku, item_name, quantity, unit_minor, line_minor FROM order_items WHERE order_id = :id ORDER BY id'
    );
    $items->execute([':id' => (int) $order['id']]);
    $slots = order_upload_slots($pdo, (int) $order['id']);
    $availability = stripe_checkout_availability();

    return [
        'order_id'               => (int) $order['id'],
        'status'                 => $order['status'],
        'fulfilment_type'        => $order['fulfilment_type'],
        'currency'               => $order['currency'],
        'subtotal_minor'         => $order['subtotal_minor'] === null ? null : (int) $order['subtotal_minor'],
        'delivery'               => [
            'status'    => $order['delivery_status'],
            'minor'     => $order['delivery_minor'] === null ? null : (int) $order['delivery_minor'],
            'label'     => $order['delivery_label'],
            'test_only' => $order['delivery_rate_source'] === 'TEST_ONLY_FIXTURE',
        ],
        'total_minor'            => $order['total_minor'] === null ? null : (int) $order['total_minor'],
        'lines'                  => array_map(static fn (array $l): array => [
            'sku'        => $l['sku'],
            'name'       => $l['item_name'],
            'quantity'   => (int) $l['quantity'],
            'unit_minor' => $l['unit_minor'] === null ? null : (int) $l['unit_minor'],
            'line_minor' => $l['line_minor'] === null ? null : (int) $l['line_minor'],
        ], $items->fetchAll()),
        'personalisation_status' => $order['personalisation_status'],
        'upload_slots'           => $slots['expected'],
        'missing_uploads'        => $slots['missing'],
        'checkout_blocker'       => $availability['available'] ? order_checkout_blocker($order, $availability['mode']) : 'checkout_unavailable',
    ];
}
