<?php
/**
 * POST /api/crm/review-request — ask a customer what their memory meant.
 *
 * { "order_id": 123 }
 *
 * ─────────────────────────────────────────────────────────────────────────
 * OPERATOR-TRIGGERED, ON PURPOSE
 * ─────────────────────────────────────────────────────────────────────────
 * It would be easy to fire this automatically when an order reaches
 * COMPLETED. It is not, because "completed" is currently a person's judgement
 * rather than a delivery confirmation — MCB has no carrier tracking — and an
 * automatic send would mean a mis-clicked stage change emails a customer
 * about a record still in the post.
 *
 * When completion becomes something the system can verify, this endpoint is
 * what a job would call, and nothing about it would need to change.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT REFUSES
 * ─────────────────────────────────────────────────────────────────────────
 * An order that is not PAID and COMPLETED. Paying is not receiving, and
 * asking someone what their memory meant while it is still being made is
 * asking about something they do not have.
 *
 * It is also idempotent: the second call returns `already_sent` rather than a
 * second email, because the UNIQUE key on (order_id, message_type) decides
 * rather than the order the requests arrive in.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/notify.php';
require_once __DIR__ . '/../lib/lifecycle.php';

require_method('POST');
require_crm_key();

$body    = read_json_body();
$orderId = (int) ($body['order_id'] ?? 0);

if ($orderId <= 0) {
    json_error(422, 'invalid_order', 'An order id is required.');
}

/**
 * NEVER THROWS, and the outcome is reported rather than raised.
 *
 * A provider outage is not a reason to tell an operator the order is broken,
 * and it must not be able to change anything about the order — the commission
 * is complete whether or not MCB managed to ask about it.
 */
$outcome = send_review_request(db(), $orderId);

$status = match ($outcome) {
    'sent', 'already_sent' => 200,
    // The order is fine; the request is not applicable or not possible yet.
    'not_eligible'         => 409,
    'not_configured'       => 503,
    default                => 502,
};

json_response($status, [
    'outcome'  => $outcome,
    'order_id' => $orderId,
]);
