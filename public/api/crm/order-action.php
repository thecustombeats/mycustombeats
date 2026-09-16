<?php
/**
 * POST /api/crm/order-action — move a paid order through operations.
 *
 * { "order_id": 41, "action": "MARK_CREATIVE_READY", "staff": "Bella", ... }
 *
 * CRM key required. Every action is checked against the order's current
 * state inside a locked transaction (lib/operations.php) and audited with the
 * staff name given. Emails the action raises are sent after it commits, once
 * each, and their outcome is reported here.
 *
 * Links in the response (approval, status) are shown to staff so they can be
 * shared another way — WhatsApp, say — when email is not the right channel.
 * The CRM key is what makes that safe; they are never logged.
 *
 * Nothing here orders from a supplier, refunds, or charges anyone.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/lifecycle-messages.php';

require_method('POST');
require_crm_key();

$body    = read_json_body(16384);
$orderId = is_int($body['order_id'] ?? null) ? $body['order_id'] : (ctype_digit((string) ($body['order_id'] ?? '')) ? (int) $body['order_id'] : 0);
$action  = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';
$staff   = crm_staff_name(operations_line($body['staff'] ?? null, 160));

if ($orderId <= 0) {
    json_error(422, 'invalid_order', 'An order id is required.');
}
if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}

/**
 * RETRY_MESSAGE { type, dedupe_key } — try a FAILED lifecycle email again.
 * Only a message already on record as FAILED can be retried; the claim makes
 * a retry that races a success harmless.
 */
if ($action === 'RETRY_MESSAGE') {
    $type = is_string($body['type'] ?? null) ? $body['type'] : '';
    $key  = is_string($body['dedupe_key'] ?? null) ? $body['dedupe_key'] : '';
    $stmt = db()->prepare("SELECT COUNT(*) FROM customer_communications WHERE order_id = :oid AND message_type = :t AND dedupe_key = :k AND status = 'FAILED'");
    $stmt->execute([':oid' => $orderId, ':t' => $type, ':k' => $key]);
    if ((int) $stmt->fetchColumn() === 0) {
        json_error(409, 'nothing_to_retry', 'There is no failed email of that kind on this order.');
    }
    record_order_event_safely(db(), $orderId, 'CUSTOMER.MESSAGE.RETRIED', ['type' => $type, 'by' => $staff]);
    json_response(200, ['order_id' => $orderId, 'action' => $action, 'emails' => [$type => send_lifecycle_message(db(), $orderId, $type, $key)]]);
}

try {
    $result = perform_staff_action($orderId, $action, $body, $staff);
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB order action ' . $action . ' on order ' . $orderId . ' failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
}

$emails = send_lifecycle_messages(db(), $orderId, $result['messages']);

json_response(200, [
    'order_id' => $orderId,
    'action'   => $action,
    'outcome'  => $result['outcome'],
    'state'    => $result['state'],
    'next_action' => next_action_for($result['state']),
    'links'    => (object) $result['links'],
    'emails'   => (object) $emails,
    'warning'  => $result['warning'],
] + array_intersect_key($result, array_flip(['supplier_order', 'shipment_id', 'exception_id', 'delivery'])));
