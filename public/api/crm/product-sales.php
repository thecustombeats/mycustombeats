<?php
/**
 * /api/crm/product-sales — suspend or resume NEW sales. CRM key required.
 *
 * GET                                            active and past suspensions
 * POST { action: "SUSPEND", subject, reason, staff }   subject: a SKU or product id
 * POST { action: "RESUME",  subject, staff }
 *
 * Suspending affects new sales only: the product shows as currently
 * unavailable, and quotes, new orders and new checkout sessions refuse it.
 * Existing paid orders are not cancelled, refunded or changed. The Founders
 * are notified (PRODUCT_SALES_SUSPENDED). Nothing is scraped or decided
 * automatically.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/founder-notifications.php';

require_crm_key();

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $rows = $pdo->query('SELECT id, subject, reason, suspended_by, suspended_at, resumed_by, resumed_at FROM product_sales_suspensions ORDER BY id DESC LIMIT 200')->fetchAll();
    json_response(200, ['active' => array_keys(suspended_sales_subjects()), 'suspensions' => $rows]);
}

require_method('POST');
$body    = read_json_body(4096);
$action  = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';
$staff   = operations_line($body['staff'] ?? null, 160);
$subject = sales_subject(is_string($body['subject'] ?? null) ? trim($body['subject']) : '');

if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}
if ($subject === null) {
    json_error(422, 'invalid_subject', 'Give a catalogue SKU or product id.');
}

if ($action === 'SUSPEND') {
    $reason = is_string($body['reason'] ?? null) ? strtoupper($body['reason']) : '';
    if (!in_array($reason, MCB_SUSPENSION_REASONS, true)) {
        json_error(422, 'invalid_reason', 'Reason: ' . implode(', ', MCB_SUSPENSION_REASONS) . '.');
    }
    $outcome = db_transaction(function (PDO $pdo) use ($subject, $reason, $staff): string {
        $active = $pdo->prepare('SELECT id FROM product_sales_suspensions WHERE subject = :s AND resumed_at IS NULL LIMIT 1 FOR UPDATE');
        $active->execute([':s' => $subject['subject']]);
        if ($active->fetchColumn() !== false) {
            return 'unchanged';
        }
        $pdo->prepare('INSERT INTO product_sales_suspensions (subject, reason, suspended_by, suspended_at) VALUES (:s, :r, :by, UTC_TIMESTAMP())')
            ->execute([':s' => $subject['subject'], ':r' => $reason, ':by' => $staff]);
        $id = (int) $pdo->lastInsertId();
        queue_founder_notification($pdo, 'PRODUCT_SALES_SUSPENDED', null, $subject['subject'], "sales-suspended:{$subject['subject']}:{$id}", [
            'product'         => $subject['name'],
            'state'           => 'CURRENTLY_UNAVAILABLE',
            'reason'          => $reason,
            'required_action' => founder_notification_types()['PRODUCT_SALES_SUSPENDED']['required_action'],
            'action_url'      => founder_action_url(null),
        ]);
        return 'suspended';
    });
    json_response(200, ['subject' => $subject['subject'], 'outcome' => $outcome, 'customer_state' => 'CURRENTLY_UNAVAILABLE']);
}

if ($action === 'RESUME') {
    $stmt = $pdo->prepare('UPDATE product_sales_suspensions SET resumed_by = :by, resumed_at = UTC_TIMESTAMP() WHERE subject = :s AND resumed_at IS NULL');
    $stmt->execute([':by' => $staff, ':s' => $subject['subject']]);
    json_response(200, ['subject' => $subject['subject'], 'outcome' => $stmt->rowCount() > 0 ? 'resumed' : 'unchanged']);
}

json_error(422, 'unknown_action', 'Use SUSPEND or RESUME.');
