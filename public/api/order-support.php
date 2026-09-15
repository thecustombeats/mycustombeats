<?php
/**
 * POST /api/order-support — tell MCB something is wrong, or ask a question,
 * from the private order page.
 *
 * REQUEST  { token, kind: "DAMAGED_OR_FAULTY" | "WRONG_ITEM" | "MANUFACTURING_DEFECT" | "DELIVERY_PROBLEM" | "INCORRECT_DETAIL" | "QUESTION",
 *            item?: "item-1", priorityReplacement?: bool, description }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * MCB PRIORITY REPLACEMENT IS A SERVICE, NOT A WARRANTY
 * ─────────────────────────────────────────────────────────────────────────
 * It is an optional priority handling service for an eligible Keepsake,
 * requested within the catalogue's window after delivery. The server works
 * out eligibility for staff; it does not approve anything, order stock or
 * promise a replacement, and nothing it says to the customer suggests their
 * normal rights depend on having bought it. Anyone can report a damaged or
 * faulty item, with or without the service.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/customer-progress.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('support', 8, 3600);

$body  = read_json_body(16384);
$pdo   = db();
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Reply to any of our emails, or contact us, and we will send you a new one.');
}
$orderId = (int) $token['order_id'];
$row     = operations_order_row($pdo, $orderId);
$physical = order_workflow($row) === 'PHYSICAL';

$errors = [];
$kind = is_string($body['kind'] ?? null) ? $body['kind'] : '';
// INCORRECT_DETAIL: a genuine error (a name, date or photograph different from
// what the customer supplied). It is a support request for staff to check; it
// never reopens production by itself.
if (!in_array($kind, ['DAMAGED_OR_FAULTY', 'WRONG_ITEM', 'MANUFACTURING_DEFECT', 'DELIVERY_PROBLEM', 'INCORRECT_DETAIL', 'QUESTION'], true)
    || (!$physical && !in_array($kind, ['QUESTION', 'INCORRECT_DETAIL'], true))) {
    $errors['kind'] = 'Please choose what this is about.';
}
$description = operations_text($body['description'] ?? null, 2000);
if ($description === null || mb_strlen($description) < 10) {
    $errors['description'] = 'Please tell us a little more (at least 10 characters).';
}

$unitId = null;
$purchased = false;
$itemKey = $body['item'] ?? null;
if ($itemKey !== null && $itemKey !== '') {
    foreach (customer_order_items($pdo, $orderId) as $item) {
        if ($item['key'] === $itemKey) {
            $unitId = $item['unit_id'];
            $purchased = $item['priority_replacement'];
        }
    }
    if ($unitId === null) {
        $errors['item'] = 'Please choose the item.';
    }
}

$wantsPriority = ($body['priorityReplacement'] ?? false) === true;
if ($wantsPriority && ($kind !== 'DAMAGED_OR_FAULTY' || $unitId === null)) {
    $errors['item'] = 'Please choose the damaged or faulty item.';
}

if ($errors !== []) {
    json_error(422, 'validation_failed', 'Please check the highlighted fields.', ['fields' => $errors]);
}

$eligibility = $wantsPriority
    ? priority_replacement_eligibility($purchased, $row['delivered_on'])
    : 'NOT_APPLICABLE';

try {
    $requestId = db_transaction(function (PDO $pdo) use ($orderId, $unitId, $kind, $wantsPriority, $eligibility, $description, $physical): int {
        $pdo->prepare(
            'INSERT INTO order_service_requests
                (order_id, unit_id, kind, priority_replacement_requested, eligibility, description, ip_hash, created_at)
             VALUES (:oid, :unit, :kind, :pr, :elig, :descr, :ip, UTC_TIMESTAMP())'
        )->execute([
            ':oid' => $orderId, ':unit' => $unitId, ':kind' => $kind, ':pr' => $wantsPriority ? 1 : 0,
            ':elig' => $eligibility, ':descr' => $description, ':ip' => hash_ip(client_ip()),
        ]);
        $requestId = (int) $pdo->lastInsertId();
        record_order_event($pdo, $orderId, 'SERVICE_REQUEST.RECEIVED', [
            'kind' => $kind, 'priority_replacement' => $wantsPriority, 'eligibility' => $eligibility,
        ]);
        // A genuine report interrupts the Founders; a plain question waits in the queue.
        if ($kind !== 'QUESTION') {
            notify_founders_about_order($pdo, 'CUSTOMER_SUPPORT_EXCEPTION', $orderId, "support:{$orderId}:{$requestId}", ['reason' => $kind]);
        }
        // A structured case for the fulfilment controller. Evidence helps but is never required;
        // the customer deals only with MCB, never with the production partner.
        $exceptionType = $physical ? match ($kind) {
            'DAMAGED_OR_FAULTY' => 'PARCEL_DAMAGED', 'WRONG_ITEM' => 'WRONG_ITEM', 'MANUFACTURING_DEFECT' => 'MANUFACTURING_DEFECT',
            'DELIVERY_PROBLEM' => 'PARCEL_DELAYED', 'INCORRECT_DETAIL' => 'OTHER_FULFILMENT_EXCEPTION', default => null,
        } : null;
        if ($exceptionType !== null) {
            raise_fulfilment_exception($pdo, $orderId, $exceptionType, ['service_request_id' => $requestId, 'blocking' => false,
                'next_action' => 'Contact the customer, review any evidence they add, and arrange the remedy with the production partner.'], 'CUSTOMER', "support-case:{$requestId}", false);
        }
        return $requestId;
    });
} catch (Throwable $e) {
    error_log('MCB support request failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not send that just now. Please try again, or reply to any of our emails.');
}

$message = match (true) {
    $eligibility === 'ELIGIBLE' =>
        'Thank you. We have your report and will look at it under MCB Priority Replacement. We will reply by email.',
    $wantsPriority =>
        'Thank you. We have your report and will reply by email. Your normal consumer rights are not affected.',
    $kind === 'QUESTION' =>
        'Thank you. We have your message and will reply by email.',
    default =>
        'Thank you. We have your report and will reply by email. Your normal consumer rights are not affected.',
};

json_response(201, ['received' => true, 'message' => $message, 'request_id' => $requestId,
    'evidence' => $physical && $kind !== 'QUESTION' ? ['accepted' => fulfilment_data()['support_evidence_kinds'], 'required' => false] : null]);
