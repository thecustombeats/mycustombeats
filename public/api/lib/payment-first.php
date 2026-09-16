<?php

/**
 * PAYMENT FIRST — MCB begins no creative or fulfilment work until payment.
 *
 * The canonical order of events:
 *
 *   customer input → required consents → payment → payment verified
 *   → ORDER.READY_FOR_PROCESSING → MCB work begins
 *
 * Allowed BEFORE payment: form validation, security checks, price calculation,
 * consent capture, technical eligibility, destination restrictions, checkout
 * itself, a video capacity HOLD, and commercial warnings. None of those is
 * production.
 *
 * Not allowed before payment: writing or generating the song, artwork
 * production, production-file generation, a manufacturing package, video
 * production, placing a supplier order, creating a shipment, or starting a
 * replacement.
 *
 * WHY THIS FILE EXISTS. Every one of those workflows was already gated on
 * `orders.status = 'PAID'`, but three entry points were safe only because of
 * where they happened to be called from rather than because they checked:
 * `ensure_artwork_creative_jobs()`, `video_staff_action()` and
 * `care_staff_action()`. A future caller that skipped the pre-check would have
 * inherited no protection at all. They now ask here, so the rule is enforced at
 * the work itself and not merely upstream of it.
 *
 * PAID is written in exactly two places, both of which verify a real Stripe
 * payment: the signed webhook (api/stripe/webhook.php) and staff reconciliation
 * of a captured payment (api/crm/reconcile.php). Nothing else may set it.
 */

declare(strict_types=1);

/** Production workflows, for the guard's message and for the release test. */
const MCB_PAYMENT_FIRST_WORKFLOWS = [
    'CREATIVE_JOB' => 'writing or producing the song',
    'SONG_CANDIDATE' => 'registering a song candidate',
    'ARTWORK' => 'producing artwork',
    'PRODUCTION_FILE' => 'generating a production file',
    'MANUFACTURING_PACKAGE' => 'building a manufacturing package',
    'VIDEO' => 'producing the Memory Music Video',
    'SUPPLIER_ORDER' => 'placing a supplier order',
    'SHIPMENT' => 'creating or dispatching a shipment',
    'REPLACEMENT' => 'producing a replacement',
];

/**
 * True only when the order exists and its payment is verified.
 *
 * REFUNDED is deliberately NOT paid for the purpose of starting NEW work: a
 * refunded order's remaining work is a founder decision, never an automatic
 * continuation. Existing work already under way is unaffected — this function
 * gates starting, not finishing.
 */
function order_payment_verified(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare('SELECT status FROM orders WHERE id = :o');
    $stmt->execute([':o' => $orderId]);
    $status = $stmt->fetchColumn();
    return $status !== false && $status === 'PAID';
}

/**
 * Refuse to begin a production workflow for an order that has not paid.
 *
 * Throws rather than returning a flag, so a caller cannot forget to check the
 * result. The message names the workflow in plain words; it never reveals
 * whether the order id exists, so this cannot be used to probe for orders.
 */
function require_payment_before_work(PDO $pdo, int $orderId, string $workflow): void
{
    if (order_payment_verified($pdo, $orderId)) {
        return;
    }
    $what = MCB_PAYMENT_FIRST_WORKFLOWS[$workflow] ?? 'this work';
    throw new OperationsException(
        'order_not_paid',
        'MCB starts work only once payment is confirmed, so ' . $what . ' cannot begin for this order.',
        409
    );
}
