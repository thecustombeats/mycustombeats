<?php
/**
 * /api/crm/system — MCB system readiness, automation readiness, failures
 * needing attention and founder actions (founders and staff). CRM key and a
 * staff name on every request. Configuration is described, never shown.
 *
 * GET  ?view=failures | readiness | automation | founder-actions | retry-policy
 * POST { action: RECORD_PROCESSING_EVENT | RETRY_PAYMENT_CONFIRMATION | RETRY_CUSTOMER_EMAIL
 *        | RETRY_FOUNDER_NOTIFICATION | PREPARE_LIFECYCLE_HOOKS, id, staff }
 *
 * Recovery actions exist only for work that is safe or idempotent to repeat.
 * Nothing here purchases, pays, refunds, cancels or re-prices anything.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/resilience.php';

require_crm_key();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$pdo = db();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        if (operations_line($_GET['staff'] ?? null, 160) === null) {
            json_error(422, 'staff_required', 'Say who is looking.');
        }
        $view = (string) ($_GET['view'] ?? 'failures');
        match ($view) {
            'failures' => json_response(200, ['view' => $view] + resilience_failures($pdo)),
            'readiness' => json_response(200, ['view' => $view, 'configuration' => resilience_configuration(), 'launch' => cc_readiness($pdo)]),
            'automation' => json_response(200, ['view' => $view, 'workflows' => resilience_automation_matrix($pdo), 'statuses' => MCB_AUTOMATION_STATUSES]),
            'founder-actions' => json_response(200, ['view' => $view, 'categories' => resilience_founder_actions($pdo)]),
            'retry-policy' => json_response(200, ['view' => $view, 'classes' => MCB_RETRY_CLASSES, 'work' => MCB_RECOVERABLE_WORK]),
            default => json_error(422, 'invalid_view', 'Unknown view.'),
        };
    }

    require_method('POST');
    $in = read_json_body(4096);
    $staff = operations_line($in['staff'] ?? null, 160);
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is recovering this, for the audit trail.');
    }
    json_response(200, resilience_recover($pdo, $in, $staff));
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB system readiness failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'The system view could not be prepared. Nothing was changed.');
}
