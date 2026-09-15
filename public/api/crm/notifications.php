<?php
/**
 * /api/crm/notifications — the founder notification outbox, for an
 * authorised delivery worker (e.g. a Telegram bridge) and for staff.
 *
 * AUTH: Bearer `notifications.worker_key` (a separate key, at least 32
 * characters, that can do nothing else) or the CRM key.
 *
 * GET  ?status=PENDING&limit=50         list (observability; no claim)
 * GET  ?view=health                     outbox counts, oldest undelivered,
 *                                       and paid orders missing their
 *                                       ready-for-processing event or notification
 * POST { action: "CLAIM", worker, limit≤25 }
 *        → { notifications: [{ id, claim_token, idempotency_key, type, payload, attempt, created_at }] }
 * POST { action: "ACK", id, claim_token, result: "DELIVERED"|"FAILED", channel?, error_code? }
 *        → { outcome: delivered | retry_scheduled | abandoned | already_delivered }
 * POST { action: "REQUEUE", id, staff }  CRM key only: an ABANDONED row back to PENDING
 *
 * MCB never calls a provider from here. The worker owns delivery and its own
 * credentials; it must use `idempotency_key` so a retried send is one message.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/founder-notifications.php';

$given     = bearer_token() ?? '';
$workerKey = (string) mcb_setting('notifications.worker_key', '');
$crmKey    = (string) mcb_setting('crm_api_key', '');
$isWorker  = strlen($workerKey) >= 32 && $given !== '' && hash_equals($workerKey, $given);
$isStaff   = $crmKey !== '' && $given !== '' && hash_equals($crmKey, $given);
if (!$isWorker && !$isStaff) {
    header('WWW-Authenticate: Bearer');
    json_error(401, 'unauthorized', 'Authentication required.');
}
mcb_event_source($isStaff ? 'STAFF' : 'NOTIFICATION_WORKER');

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (($_GET['view'] ?? '') === 'health') {
        $counts = [];
        foreach ($pdo->query('SELECT status, COUNT(*) AS n FROM founder_notifications GROUP BY status')->fetchAll() as $r) {
            $counts[$r['status']] = (int) $r['n'];
        }
        $oldest = $pdo->query("SELECT MIN(created_at) FROM founder_notifications WHERE status IN ('PENDING','DELIVERING','FAILED')")->fetchColumn();
        // No silent loss: every paid order has its ready event and its notification.
        $missing = $pdo->query(
            "SELECT o.id, o.mcb_reference,
                    (SELECT COUNT(*) FROM order_events e WHERE e.order_id = o.id AND e.dedupe_key = 'ready-for-processing') AS has_event,
                    (SELECT COUNT(*) FROM founder_notifications n WHERE n.dedupe_key = CONCAT('new-order:', o.id)) AS has_notification
               FROM orders o
              WHERE o.status = 'PAID'
             HAVING has_event = 0 OR has_notification = 0
              ORDER BY o.id DESC LIMIT 100"
        )->fetchAll();
        json_response(200, [
            'counts'                => (object) $counts,
            'oldest_undelivered_at' => $oldest === false ? null : $oldest,
            'human_action_required' => ($counts['ABANDONED'] ?? 0) > 0,
            'paid_orders_missing_ready_signal' => array_map(static fn (array $r): array => [
                'order_id' => (int) $r['id'], 'reference' => $r['mcb_reference'],
                'ready_event' => (int) $r['has_event'] > 0, 'notification' => (int) $r['has_notification'] > 0,
            ], $missing),
        ]);
    }
    $status = strtoupper((string) ($_GET['status'] ?? ''));
    $limit  = min(max((int) ($_GET['limit'] ?? 50), 1), 200);
    $where  = in_array($status, ['PENDING', 'DELIVERING', 'DELIVERED', 'FAILED', 'ABANDONED'], true) ? 'WHERE status = :s' : '';
    $stmt = $pdo->prepare(
        "SELECT id, notification_type AS type, subject_reference AS reference, dedupe_key, payload, status, attempts,
                next_attempt_at, last_error, claimed_by, delivered_at, delivered_channel, created_at, updated_at
           FROM founder_notifications {$where} ORDER BY id DESC LIMIT {$limit}"
    );
    $stmt->execute($where === '' ? [] : [':s' => $status]);
    json_response(200, ['notifications' => array_map(static function (array $r): array {
        $r['id'] = (int) $r['id'];
        $r['attempts'] = (int) $r['attempts'];
        $r['payload'] = json_decode((string) $r['payload'], true);
        $r['human_action_required'] = $r['status'] === 'ABANDONED';
        return $r;
    }, $stmt->fetchAll())]);
}

require_method('POST');
$body   = read_json_body(4096);
$action = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';

try {
    if ($action === 'CLAIM') {
        $worker = is_string($body['worker'] ?? null) && preg_match('/^[A-Za-z0-9._-]{1,60}$/', $body['worker']) === 1 ? $body['worker'] : null;
        if ($worker === null) {
            json_error(422, 'worker_required', 'Name the worker (letters, digits, dot, dash, underscore).');
        }
        $limit = is_int($body['limit'] ?? null) ? min(max($body['limit'], 1), 25) : 10;
        json_response(200, ['notifications' => claim_founder_notifications($pdo, $limit, $worker)]);
    }

    if ($action === 'ACK') {
        $id     = is_int($body['id'] ?? null) ? $body['id'] : 0;
        $token  = is_string($body['claim_token'] ?? null) && preg_match('/^[a-f0-9]{48}$/', $body['claim_token']) === 1 ? $body['claim_token'] : '';
        $result = is_string($body['result'] ?? null) ? strtoupper($body['result']) : '';
        $channel = is_string($body['channel'] ?? null) ? strtoupper($body['channel']) : null;
        $error  = is_string($body['error_code'] ?? null) && preg_match('/^[A-Za-z0-9._-]{1,60}$/', $body['error_code']) === 1 ? $body['error_code'] : null;
        if ($id <= 0 || $token === '' || !in_array($result, ['DELIVERED', 'FAILED'], true)) {
            json_error(422, 'invalid_ack', 'Give id, claim_token and result DELIVERED or FAILED.');
        }
        if ($channel !== null && !in_array($channel, ['TELEGRAM', 'EMAIL', 'OTHER'], true)) {
            json_error(422, 'invalid_channel', 'Channel: TELEGRAM, EMAIL or OTHER.');
        }
        json_response(200, ['id' => $id, 'outcome' => acknowledge_founder_notification($pdo, $id, $token, $result, $channel, $error ?? ($result === 'FAILED' ? 'unspecified' : null))]);
    }

    if ($action === 'REQUEUE') {
        if (!$isStaff) {
            json_error(403, 'forbidden', 'Only staff can requeue a notification.');
        }
        $staff = operations_line($body['staff'] ?? null, 160);
        $id    = is_int($body['id'] ?? null) ? $body['id'] : 0;
        if ($staff === null || $id <= 0) {
            json_error(422, 'invalid_request', 'Give id and staff.');
        }
        $stmt = $pdo->prepare("UPDATE founder_notifications SET status = 'PENDING', attempts = 0, next_attempt_at = NULL, last_error = NULL WHERE id = :id AND status = 'ABANDONED'");
        $stmt->execute([':id' => $id]);
        json_response(200, ['id' => $id, 'outcome' => $stmt->rowCount() > 0 ? 'requeued' : 'unchanged']);
    }
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
}

json_error(422, 'unknown_action', 'Use CLAIM, ACK or REQUEUE.');
