<?php
/**
 * POST /api/order-support — "Need help with your order?" from the private
 * order page. Opens one MCB support case (lib/customer-care.php).
 *
 * REQUEST  { token, kind: "QUESTION" | "DELIVERY_PROBLEM" | "DAMAGED_OR_FAULTY" | "WRONG_ITEM" | "MANUFACTURING_DEFECT"
 *                       | "INCORRECT_DETAIL" | "VIDEO_PROBLEM" | "DIGITAL_DELIVERY_PROBLEM" | "OTHER",
 *            item?: "item-1", issue?: "PLAYBACK" | …, otherCustomerDetails?: bool, priorityReplacement?: bool, description }
 *
 * The customer deals only with MCB: no supplier, partner, provider or internal
 * step is named. Delivery, damage, wrong-item and manufacturing kinds apply to
 * something posted; a video problem to an order with a video.
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
require_once __DIR__ . '/lib/customer-care.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('support', 8, 3600);

$body  = read_json_body(16384);
$pdo   = db();
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Email ' . mcb_support_address() . ' and we will send you a new one.');
}
$orderId = (int) $token['order_id'];
$shape   = care_order_shape($pdo, $orderId);
$row     = $shape['row'];

$errors = [];
$kind = is_string($body['kind'] ?? null) ? $body['kind'] : '';
$type = care_case_types()[$kind] ?? null;
// INCORRECT_DETAIL: a genuine error (a name, date or photograph different from
// what the customer supplied). It is a support case for staff to check; it
// never reopens production by itself.
if ($type === null || !care_kind_applies($type, $shape)) {
    $errors['kind'] = 'Please choose what this is about.';
}
$description = operations_text($body['description'] ?? null, 2000);
if ($description === null || mb_strlen($description) < 10) {
    $errors['description'] = 'Please tell us a little more (at least 10 characters).';
}
if ($description !== null && looks_like_card_number($description)) {
    $errors['description'] = 'Please do not send card or payment details.';
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
$issue = $body['issue'] ?? null;
if ($issue !== null && ($kind === '' || !in_array($kind, ['VIDEO_PROBLEM', 'DIGITAL_DELIVERY_PROBLEM'], true) || !in_array($issue, array_column(care_data()['digital_issues'], 'issue'), true))) {
    $errors['issue'] = 'Please choose what is happening.';
}
// Someone else's details on what the customer received: urgent, privacy review, never a legal conclusion.
$otherCustomer = ($body['otherCustomerDetails'] ?? false) === true && in_array($kind, ['WRONG_ITEM', 'VIDEO_PROBLEM', 'DIGITAL_DELIVERY_PROBLEM', 'INCORRECT_DETAIL'], true);

if ($errors !== []) {
    json_error(422, 'validation_failed', 'Please check the highlighted fields.', ['fields' => $errors]);
}

$eligibility = $wantsPriority
    ? priority_replacement_eligibility($purchased, $row['delivered_on'])
    : 'NOT_APPLICABLE';

try {
    $caseId = db_transaction(fn (PDO $pdo): int => care_open_case($pdo, $orderId, $kind, $description, [
        'unit_id' => $unitId, 'issue' => $issue, 'priority_replacement' => $wantsPriority, 'eligibility' => $eligibility,
        'other_customer_details' => $otherCustomer, 'ip_hash' => hash_ip(client_ip()),
    ]));
} catch (Throwable $e) {
    error_log('MCB support request failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not send that just now. Please try again, or email ' . mcb_support_address() . '.');
}

$copy = care_data()['copy'];
$message = match (true) {
    $eligibility === 'ELIGIBLE' =>
        'Thank you. We have your report and will look at it under MCB Priority Replacement. ' . $copy['serviceTarget'],
    $kind === 'QUESTION' || $kind === 'OTHER' =>
        $copy['received'],
    default =>
        $copy['received'] . ' ' . $copy['receivedRights'],
};

json_response(201, ['received' => true, 'message' => $message, 'request_id' => $caseId, 'case_id' => $caseId,
    'evidence' => $kind !== 'QUESTION' ? ['accepted' => fulfilment_data()['support_evidence_kinds'], 'required' => false] : null]);
