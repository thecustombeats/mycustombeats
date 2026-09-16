<?php
/**
 * /api/crm/business — MCB Business & Profit Intelligence (founders and staff).
 * CRM key and a staff name on every request. INTERNAL: never a public
 * financial API, never indexed, never cached.
 *
 * GET  ?section=overview|products|videos|customers|suppliers|support|data   the Business views
 * GET  ?export=products|supplier_routes|refunds|alerts|root_causes|geography|data_quality
 *                                  privacy-safe CSV (aggregates and references only; audited)
 * GET  ?cost_target=MCB-2026-000123 the order's currency, replacement remedies and cost entries
 * POST { action: RECORD_DIRECT_COST, order_reference, category, basis, amount_minor, currency?, remedy_id?, note? }
 * POST { action: VOID_DIRECT_COST, entry_id, reason }
 *
 * Calculated deterministically from recorded MCB data. Nothing here spends,
 * refunds, purchases, cancels an order or changes a price.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/business.php';

require_crm_key();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$pdo = db();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $staff = crm_staff_name(operations_line($_GET['staff'] ?? null, 160));
        if ($staff === null) {
            json_error(422, 'staff_required', 'Say who is looking, so access to business figures is audited.');
        }
        if (isset($_GET['export'])) {
            $dataset = (string) $_GET['export'];
            if (!in_array($dataset, biz_data()['export_datasets'], true)) {
                json_error(422, 'invalid_dataset', 'Unknown export.');
            }
            $rows = biz_export_rows($pdo, $dataset);
            biz_audit($pdo, $staff, 'EXPORT', $dataset, count($rows));
            http_response_code(200);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="mcb-' . str_replace('_', '-', $dataset) . '-' . gmdate('Y-m-d') . '.csv"');
            header('X-Content-Type-Options: nosniff');
            echo biz_csv($rows);
            exit;
        }
        if (isset($_GET['cost_target'])) {
            $target = biz_cost_target($pdo, (string) $_GET['cost_target']);
            $target === null ? json_error(404, 'order_not_found', 'No order with that reference.') : json_response(200, ['target' => $target, 'cost_categories' => biz_data()['cost_categories']]);
        }
        json_response(200, biz_view($pdo, (string) ($_GET['section'] ?? 'overview')));
    }

    require_method('POST');
    $in = read_json_body(16384);
    $staff = crm_staff_name(operations_line($in['staff'] ?? null, 160));
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is recording this, for the audit trail.');
    }
    match ((string) ($in['action'] ?? '')) {
        'RECORD_DIRECT_COST' => json_response(200, biz_record_cost($in, $staff)),
        'VOID_DIRECT_COST' => json_response(200, biz_void_cost($in, $staff)),
        default => json_error(422, 'unknown_action', 'That action is not recognised.'),
    };
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB business intelligence failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'The business figures could not be prepared. Nothing was changed.');
}
