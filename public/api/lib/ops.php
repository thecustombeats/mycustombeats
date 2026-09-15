<?php
/**
 * MCB — the operations notification sent when an order is paid.
 *
 * REPLACES the order form's browser POST to a Make.com webhook, which shipped
 * the automation URL in the public bundle and sent every submitter's contact
 * details and story to it before anyone had paid.
 *
 * Now: server-side only, after the PAID transaction has committed, once per
 * order, and carrying no customer contact details, address or story. The
 * workflow receives the MCB reference and what was bought; staff read the rest
 * from the CRM by reference.
 *
 * DORMANT unless both `operations.order_paid_webhook_url` and
 * `operations.order_paid_webhook_secret` are configured. The body is signed
 * (HMAC-SHA256 over "<timestamp>.<body>", header `X-MCB-Signature: t=…,v1=…`)
 * so the receiver can reject anything MCB did not send.
 *
 * Never throws and never affects the Stripe response.
 */

declare(strict_types=1);

const MCB_OPS_TIMEOUT_SECONDS = 5;

/** @return array<string,mixed>|null */
function operations_payment_payload(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT id, mcb_reference, fulfilment_type, total_minor, currency, updated_at
           FROM orders WHERE id = :id AND status = :paid LIMIT 1'
    );
    $stmt->execute([':id' => $orderId, ':paid' => 'PAID']);
    $order = $stmt->fetch();
    if ($order === false || $order['mcb_reference'] === null) {
        return null;
    }

    $items = $pdo->prepare(
        'SELECT item_id, product_id, item_name, quantity FROM order_items WHERE order_id = :id ORDER BY id'
    );
    $items->execute([':id' => $orderId]);

    return [
        'event'           => 'order.paid',
        // The internal notification the next automation programme listens for.
        'notification'    => 'NEW_ORDER_READY_FOR_PROCESSING',
        'mcb_reference'   => $order['mcb_reference'],
        'order_id'        => (int) $order['id'],
        'paid_at'         => $order['updated_at'],
        'fulfilment_type' => $order['fulfilment_type'],
        'total_minor'     => $order['total_minor'] !== null ? (int) $order['total_minor'] : null,
        'currency'        => $order['currency'],
        'lines'           => array_map(static fn (array $i): array => [
            'sku'        => $i['item_id'],
            'product_id' => $i['product_id'],
            'name'       => $i['item_name'],
            'quantity'   => (int) $i['quantity'],
        ], $items->fetchAll()),
    ];
}

/** Returns 'sent', 'skipped' or 'failed'. */
function notify_operations_of_payment(PDO $pdo, int $orderId): string
{
    $url    = (string) mcb_setting('operations.order_paid_webhook_url', '');
    $secret = (string) mcb_setting('operations.order_paid_webhook_secret', '');
    if ($url === '' || $secret === '') {
        return 'skipped';
    }
    if (!str_starts_with($url, 'https://')) {
        error_log('MCB ops: order_paid_webhook_url must be https; not sent.');
        return 'failed';
    }

    try {
        $payload = operations_payment_payload($pdo, $orderId);
    } catch (PDOException $e) {
        error_log('MCB ops: could not build payload: ' . $e->getMessage());
        return 'failed';
    }
    if ($payload === null) {
        return 'skipped';
    }

    $body      = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $timestamp = time();
    $signature = hash_hmac('sha256', $timestamp . '.' . $body, $secret);

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $body,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => MCB_OPS_TIMEOUT_SECONDS,
        CURLOPT_CONNECTTIMEOUT => MCB_OPS_TIMEOUT_SECONDS,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            "X-MCB-Signature: t={$timestamp},v1={$signature}",
            'Idempotency-Key: mcb-ops-' . $payload['mcb_reference'],
        ],
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error  = curl_error($ch);
    curl_close($ch);

    if ($status < 200 || $status >= 300) {
        // The URL is a credential; it is never logged.
        error_log("MCB ops: order.paid notification for order {$orderId} failed (HTTP {$status}) {$error}");
        return 'failed';
    }
    return 'sent';
}
