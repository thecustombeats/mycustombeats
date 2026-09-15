<?php
/**
 * GET /api/crm/fulfilment — the Fulfilment Controller's read models. CRM key.
 * INTERNAL ONLY: economics, supplier routes and scorecards never reach a
 * public page. Nothing here decides anything: no purchase, no supplier
 * change, no refund — figures for people to act on.
 *
 *   ?view=today                  the founder command centre read model
 *   ?view=metrics                operational and commercial metrics
 *   ?view=scorecards             per supplier route
 *   ?view=health                 stranded-order checks
 *   ?view=order&order_id=N       one order's controller record
 *   ?evidence_id=N&staff=Name    a support evidence file (download, audited)
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/operations.php';

require_method('GET');
require_crm_key();

$pdo = db();

if (ctype_digit((string) ($_GET['evidence_id'] ?? ''))) {
    $staff = operations_line($_GET['staff'] ?? null, 160);
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is downloading, so access is audited.');
    }
    $stmt = $pdo->prepare('SELECT order_id, stored_name, mime_type FROM support_evidence WHERE id = :id');
    $stmt->execute([':id' => (int) $_GET['evidence_id']]);
    $row  = $stmt->fetch();
    $base = upload_directory();
    $path = $row === false || $base === null || preg_match('/^[a-f0-9]{64}$/', (string) $row['stored_name']) !== 1 ? null : $base . '/support/' . $row['stored_name'];
    if ($path === null || !is_file($path)) {
        json_error(404, 'not_found', 'No such evidence file.');
    }
    record_order_event_safely($pdo, (int) $row['order_id'], 'SUPPORT.EVIDENCE_DOWNLOADED', ['evidence_id' => (int) $_GET['evidence_id'], 'by' => $staff]);
    http_response_code(200);
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . (string) filesize($path));
    header('Content-Disposition: attachment; filename="mcb-evidence-' . (int) $_GET['evidence_id'] . '"');
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: no-store');
    readfile($path);
    exit;
}

$view = (string) ($_GET['view'] ?? '');
try {
    switch ($view) {
        case 'today':
            json_response(200, ['today' => fulfilment_command_centre($pdo), 'internal' => true]);
        case 'metrics':
            json_response(200, ['metrics' => fulfilment_metrics($pdo), 'internal' => true]);
        case 'scorecards':
            json_response(200, ['scorecards' => supplier_scorecards($pdo), 'internal' => true, 'note' => 'Evidence for founder decisions. No supplier is replaced automatically.']);
        case 'health':
            $findings = fulfilment_health($pdo);
            json_response(200, ['status' => $findings === [] ? 'OK' : 'ATTENTION', 'findings' => $findings]);
        case 'order':
            $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
            $row = operations_order_row($pdo, $orderId);
            if ($row === null) {
                json_error(404, 'order_not_found', 'No order was found.');
            }
            json_response(200, ['order_id' => $orderId, 'controller' => fulfilment_order_record($pdo, $row)]);
        default:
            json_error(422, 'invalid_view', 'view: today, metrics, scorecards, health or order.');
    }
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
}
