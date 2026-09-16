<?php
/**
 * /api/crm/support — MCB customer care for staff. CRM key and a staff name on
 * every request (case access is audited).
 *
 * GET  ?view=list&filter=new|needs_mcb|waiting_customer|urgent|resolved|all   case cards
 * GET  ?case_id=N                  one case: thread (all kinds), links to protected
 *                                  records, evidence list, remedies, refund reviews,
 *                                  editable response templates (audited)
 * GET  ?view=metrics               internal support metrics (no message content)
 * GET  ?view=health                customers waiting on MCB (no customer abandoned)
 * GET  ?view=templates             the response templates
 * POST { action, case_id, … }      RESPOND, ADD_INTERNAL_NOTE, SET_STATUS, SET_PRIORITY,
 *                                  ASSIGN, SET_SENTIMENT, SET_CUSTOMER_SUMMARY, CLASSIFY,
 *                                  FLAG_PRIVACY_REVIEW, COMPLETE_PRIVACY_REVIEW, RESOLVE, CLOSE,
 *                                  REISSUE_ORDER_LINK, PROPOSE_REMEDY, DECIDE_REMEDY (founder code),
 *                                  START_REMEDY, COMPLETE_REMEDY, CANCEL_REMEDY,
 *                                  REQUEST_REFUND_REVIEW, SUBMIT_REFUND_FOR_DECISION,
 *                                  DECIDE_REFUND (founder code), RECORD_REFUND
 * POST { action: OPEN_CASE_FROM_EXCEPTION, exception_id, note? }
 *
 * NOTHING HERE MOVES MONEY OR BUYS ANYTHING. A refund is decided by Bella or
 * Lewis, made outside MCB's system, and recorded here. A replacement is
 * prepared, authorised by a founder when it costs MCB money, and placed
 * through the normal fulfilment workflow. No payment or supplier API is called.
 * Evidence files are downloaded through crm/fulfilment (audited).
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/customer-care.php';

require_crm_key();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$pdo = db();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $staff = crm_staff_name(operations_line($_GET['staff'] ?? null, 160));
        if ($staff === null) {
            json_error(422, 'staff_required', 'Say who is looking, so access to customer conversations is audited.');
        }
        if (ctype_digit((string) ($_GET['case_id'] ?? ''))) {
            $case = care_staff_case($pdo, (int) $_GET['case_id'], $staff);
            $case === null ? json_error(404, 'case_not_found', 'No such case.') : json_response(200, $case);
        }
        switch ((string) ($_GET['view'] ?? 'list')) {
            case 'list':
                json_response(200, care_list($pdo, (string) ($_GET['filter'] ?? 'needs_mcb')));
            case 'metrics':
                json_response(200, ['metrics' => care_metrics($pdo), 'internal' => true]);
            case 'health':
                $findings = care_health($pdo);
                json_response(200, ['findings' => $findings, 'labels' => CARE_HEALTH_LABELS]);
            case 'templates':
                json_response(200, ['templates' => care_data()['templates']]);
            default:
                json_error(422, 'invalid_view', 'Unknown view.');
        }
    }

    require_method('POST');
    $in = read_json_body(32768);
    $staff = crm_staff_name(operations_line($in['staff'] ?? null, 160));
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is doing this, for the audit trail.');
    }
    $action = (string) ($in['action'] ?? '');
    json_response(200, care_staff_action($action, $in, $staff));
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB customer care failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be completed. Nothing was sent or changed.');
}
