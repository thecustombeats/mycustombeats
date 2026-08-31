<?php
/**
 * GET /api/crm/unreconciled — payments no order claims.
 *
 * The operational alarm. An empty list is the expected steady state; a row
 * here means a customer's money arrived and MCB has no order for it.
 *
 * Each row carries what Stripe collected at checkout — email, name, phone,
 * amount — which is what staff need to find the buyer and finish the order
 * by hand. That is more customer data than /api/crm/orders returns, so this
 * endpoint sits behind the same CRM key and is never exposed to a browser.
 *
 * Query: ?include_resolved=1   also return rows already closed (audit trail)
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$includeResolved = ($_GET['include_resolved'] ?? '') === '1';

$sql = 'SELECT u.id, u.stripe_session_id, u.stripe_payment_intent, u.event_id,
               u.reason, u.customer_email, u.customer_name, u.customer_phone,
               u.amount_total, u.currency,
               u.resolved_order_id, u.resolved_at, u.created_at,
               o.mcb_reference
          FROM unreconciled_payments u
          LEFT JOIN orders o ON o.id = u.resolved_order_id'
     . ($includeResolved ? '' : ' WHERE u.resolved_at IS NULL')
     . ' ORDER BY u.created_at DESC LIMIT 200';

$rows = db()->query($sql)->fetchAll();

$payments = array_map(static function (array $r): array {
    return [
        'id'             => (int) $r['id'],
        'reason'         => $r['reason'],
        'stripe'         => [
            'session_id'     => $r['stripe_session_id'],
            'payment_intent' => $r['stripe_payment_intent'],
            'event_id'       => $r['event_id'],
        ],
        // Stripe's own record of the buyer — the only identity MCB holds
        // for this payment until it is reconciled.
        'customer'       => [
            'email' => $r['customer_email'],
            'name'  => $r['customer_name'],
            'phone' => $r['customer_phone'],
        ],
        'amount_total'   => $r['amount_total'] === null ? null : (float) $r['amount_total'],
        'currency'       => $r['currency'],
        'resolved'       => $r['resolved_at'] !== null,
        'resolved_order' => $r['resolved_order_id'] === null ? null : [
            'order_id'      => (int) $r['resolved_order_id'],
            'mcb_reference' => $r['mcb_reference'],
        ],
        'resolved_at'    => $r['resolved_at'],
        'created_at'     => $r['created_at'],
    ];
}, $rows);

$open = count(array_filter($payments, static fn (array $p): bool => !$p['resolved']));

json_response(200, [
    'payments' => $payments,
    'count'    => count($payments),
    // The number that matters operationally: money still unaccounted for.
    'open'     => $open,
]);
