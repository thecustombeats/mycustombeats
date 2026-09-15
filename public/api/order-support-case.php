<?php
/**
 * POST /api/order-support-case — the customer's side of an MCB support case,
 * from the private order page.
 *
 * REQUEST  { token, case_id, action: "message", message }
 *          { token, case_id, action: "satisfaction", answer: "YES" | "NO" }
 *
 * The case must belong to the order the link opens: any other case number is
 * simply "not found". The customer's words go into the private thread only —
 * never into an email, an order event, a founder notification or analytics.
 * "Did we resolve this for you?" is optional, asked once, never incentivised
 * and never published.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/customer-care.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('support-case', 20, 3600);

$body  = read_json_body(16384);
$pdo   = db();
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Email ' . mcb_support_address() . ' and we will send you a new one.');
}
$orderId = (int) $token['order_id'];
$action  = $body['action'] ?? null;

try {
    if ($action === 'message') {
        $message = operations_text($body['message'] ?? null, 2000);
        if ($message === null || mb_strlen($message) < 2) {
            json_error(422, 'validation_failed', 'Please write your message.', ['fields' => ['message' => 'Please write your message.']]);
        }
        if (looks_like_card_number($message)) {
            json_error(422, 'validation_failed', 'Please do not send card or payment details.', ['fields' => ['message' => 'Please do not send card or payment details.']]);
        }
        db_transaction(function (PDO $pdo) use ($orderId, $body, $message): void {
            care_customer_message($pdo, $orderId, $body['case_id'] ?? null, $message, hash_ip(client_ip()));
        });
        json_response(201, ['received' => true, 'message' => 'Thank you — we have your message. ' . care_data()['service_target']['customer_wording']]);
    }
    if ($action === 'satisfaction') {
        db_transaction(function (PDO $pdo) use ($orderId, $body): void {
            care_customer_satisfaction($pdo, $orderId, $body['case_id'] ?? null, $body['answer'] ?? null);
        });
        json_response(201, ['received' => true, 'message' => 'Thank you for letting us know.']);
    }
    json_error(422, 'validation_failed', 'Unknown request.');
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB support case update failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not send that just now. Please try again, or email ' . mcb_support_address() . '.');
}
