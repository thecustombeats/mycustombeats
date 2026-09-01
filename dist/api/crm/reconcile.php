<?php
/**
 * POST /api/crm/reconcile — attach an orphaned payment to its real order.
 *
 * Closes the loop opened by unreconciled_payments. Staff identify which
 * order the money belongs to — recreating it from the Make.com capture or
 * the customer's own account of what they bought — then name the pair here.
 *
 * WHY AN ENDPOINT AND NOT phpMyAdmin
 * The obvious alternative is editing `orders` by hand. It is also how a
 * customer ends up paid but referenceless: a human UPDATE sets status and
 * session id and forgets mcb_reference, or invents one, and the guarantee
 * that every paid order carries exactly one issued reference quietly dies.
 *
 * This runs the SAME transition as the Stripe webhook, calling the SAME
 * assign_mcb_reference(). There remains exactly one place a reference is
 * ever issued. Reconciliation is a different door into it, not a second
 * mechanism.
 *
 * Body: { "session_id": "cs_live_…", "order_id": 42 }
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('POST');
require_crm_key();

$body      = read_json_body();
$sessionId = trim((string) ($body['session_id'] ?? ''));
$orderId   = (int) ($body['order_id'] ?? 0);

if ($sessionId === '' || !preg_match('/^cs_[A-Za-z0-9_]{8,250}$/', $sessionId)) {
    json_error(422, 'invalid_session', 'A Stripe checkout session id is required.');
}
if ($orderId <= 0) {
    json_error(422, 'invalid_order', 'An order id is required.');
}

try {
    $result = db_transaction(function (PDO $pdo) use ($sessionId, $orderId): array {
        // The ledger row is the authority for what was actually paid. Locked
        // first so two staff reconciling at once cannot both claim it.
        $stmt = $pdo->prepare(
            'SELECT id, stripe_payment_intent, resolved_order_id
               FROM unreconciled_payments
              WHERE stripe_session_id = :sid
              FOR UPDATE'
        );
        $stmt->execute([':sid' => $sessionId]);
        $payment = $stmt->fetch();

        if ($payment === false) {
            return ['error' => 'unknown_payment'];
        }
        if ($payment['resolved_order_id'] !== null) {
            // Already closed. Report where it went rather than moving it.
            return ['error' => 'already_reconciled', 'order_id' => (int) $payment['resolved_order_id']];
        }

        // Order row lock taken AFTER the ledger lock, and the webhook never
        // touches this table at all, so no cycle exists between the two.
        $stmt = $pdo->prepare(
            'SELECT id, status, affiliate_id, mcb_reference, stripe_session_id
               FROM orders WHERE id = :id FOR UPDATE'
        );
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();

        if ($order === false) {
            return ['error' => 'unknown_order'];
        }

        // Refuse to move a payment onto an order that already has a different
        // one. Two payments cannot share an order, and overwriting the first
        // would erase the only link back to that money.
        $existingSession = (string) ($order['stripe_session_id'] ?? '');
        if ($existingSession !== '' && $existingSession !== $sessionId) {
            return ['error' => 'order_already_paid'];
        }

        $pdo->prepare(
            'UPDATE orders
                SET status = :s, stripe_session_id = :sid, stripe_payment_intent = :pi
              WHERE id = :id'
        )->execute([
            ':s'   => 'PAID',
            ':sid' => $sessionId,
            ':pi'  => $payment['stripe_payment_intent'],
            ':id'  => $orderId,
        ]);

        // The one and only issuing path, shared with the webhook. Idempotent:
        // an order that somehow already holds a reference keeps it.
        $reference = assign_mcb_reference($pdo, $orderId, $order['mcb_reference']);

        // Affiliate credit, on the same terms as the webhook: awarded once,
        // and only when this reconciliation is what made the order PAID.
        if ($order['status'] !== 'PAID' && $order['affiliate_id'] !== null) {
            $pdo->prepare('UPDATE affiliates SET sales = sales + 1 WHERE id = :id')
                ->execute([':id' => (int) $order['affiliate_id']]);
        }

        $pdo->prepare(
            'UPDATE unreconciled_payments
                SET resolved_order_id = :oid, resolved_at = NOW()
              WHERE id = :id'
        )->execute([':oid' => $orderId, ':id' => (int) $payment['id']]);

        return ['reference' => $reference];
    });
} catch (PDOException $e) {
    error_log('MCB CRM: reconciliation failed for ' . $sessionId . ': ' . $e->getMessage());
    json_error(500, 'reconcile_failed', 'Could not reconcile that payment.');
}

if (isset($result['error'])) {
    $messages = [
        'unknown_payment'    => ['status' => 404, 'text' => 'No unreconciled payment with that session id.'],
        'unknown_order'      => ['status' => 404, 'text' => 'No such order.'],
        'already_reconciled' => ['status' => 409, 'text' => 'That payment has already been reconciled.'],
        'order_already_paid' => ['status' => 409, 'text' => 'That order is already paid by a different Stripe session.'],
    ];
    $m = $messages[$result['error']];
    json_error($m['status'], $result['error'], $m['text'],
        isset($result['order_id']) ? ['order_id' => $result['order_id']] : []);
}

// Same post-commit notification as the Stripe webhook. An order rescued by
// hand is owed its reference exactly as much as one Stripe matched itself,
// and the conditional claim means this cannot double up with the webhook.
$notified = notify_customer_of_payment(db(), $orderId);

json_response(200, [
    'reconciled'     => true,
    'order_id'       => $orderId,
    'mcb_reference'  => $result['reference'],
    'customer_email' => $notified,
]);
