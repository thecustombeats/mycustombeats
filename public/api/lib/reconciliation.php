<?php
/**
 * MCB CRM — the safety net under a best-effort order write.
 *
 * /api/order is called BEFORE Stripe and is deliberately non-blocking: a CRM
 * outage must never stop a customer paying. The cost of that choice is a
 * narrow window in which money arrives and no order exists to receive it —
 * either because the order write failed (no client_reference_id was carried
 * to Stripe at all) or because the id it carried names nothing.
 *
 * Before this, such a payment produced one error_log line on shared hosting
 * and nothing else. Logs rotate and nobody reads them, so a real sale could
 * vanish while Stripe showed it as collected.
 *
 * Capturing it here makes the reconciliation path deterministic:
 *
 *   Stripe payment → session id → unreconciled_payments
 *     → staff attach it (POST /api/crm/reconcile)
 *     → order marked PAID → MCB reference issued → CRM complete
 *
 * This file only ever RECORDS the problem. It never invents an order, and
 * never issues a reference — a reference is issued in exactly one place, by
 * assign_mcb_reference(), against a real order.
 */

declare(strict_types=1);

/**
 * Records a paid Stripe session that no MCB order claims.
 *
 * Idempotent on UNIQUE(stripe_session_id): Stripe retries a webhook it
 * believes failed, and the same orphan must not queue twice for staff.
 * INSERT IGNORE keeps the FIRST capture, which holds the earliest and most
 * trustworthy account of what happened.
 *
 * Never throws. This runs on the money path while acknowledging a real
 * payment, and a failure to file the alarm must not turn into a 500 that
 * makes Stripe retry an event MCB has already banked.
 *
 * @param array $session The event's data.object.
 * @param string $reason NO_ORDER_REFERENCE | ORDER_NOT_FOUND
 */
function capture_unreconciled_payment(PDO $pdo, array $event, array $session, string $reason): bool
{
    $sessionId = (string) ($session['id'] ?? '');
    if ($sessionId === '') {
        // Nothing to key the row on, so nothing can later be matched to it.
        return false;
    }

    $details = is_array($session['customer_details'] ?? null) ? $session['customer_details'] : [];

    // Stripe reports money in the minor unit. Storing 4900 as GBP 4900.00
    // would misreport a £49 sale by two orders of magnitude.
    $amount = isset($session['amount_total']) && is_numeric($session['amount_total'])
        ? (float) $session['amount_total'] / 100
        : null;

    $currency = isset($session['currency']) && is_string($session['currency'])
        ? strtoupper(mb_substr($session['currency'], 0, 3))
        : null;

    try {
        $pdo->prepare(
            'INSERT IGNORE INTO unreconciled_payments (
                stripe_session_id, stripe_payment_intent, event_id, reason,
                customer_email, customer_name, customer_phone,
                amount_total, currency
             ) VALUES (:sid, :pi, :eid, :reason, :email, :name, :phone, :amount, :currency)'
        )->execute([
            ':sid'      => mb_substr($sessionId, 0, 255),
            ':pi'       => ($session['payment_intent'] ?? '') !== ''
                             ? mb_substr((string) $session['payment_intent'], 0, 255) : null,
            ':eid'      => mb_substr((string) ($event['id'] ?? ''), 0, 255),
            ':reason'   => $reason,
            ':email'    => isset($details['email']) ? mb_substr((string) $details['email'], 0, 190) : null,
            ':name'     => isset($details['name'])  ? mb_substr((string) $details['name'], 0, 160) : null,
            ':phone'    => isset($details['phone']) ? mb_substr((string) $details['phone'], 0, 40) : null,
            ':amount'   => $amount,
            ':currency' => $currency,
        ]);
        return true;
    } catch (PDOException $e) {
        // Last resort only. The payment is still acknowledged to Stripe.
        error_log('MCB CRM: FAILED to file unreconciled payment ' . $sessionId . ': ' . $e->getMessage());
        return false;
    }
}
