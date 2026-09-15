<?php
/**
 * /api/crm/command-centre — the Founder Command Centre. CRM key and a staff
 * name on every request (the audit trail). STAFF / FOUNDER ONLY.
 *
 * GET ?view=overview&period=today|week|all   MCB Today in one response
 * GET ?view=orders&stage=&period=            orders in a pipeline stage (safe list fields)
 * GET ?view=order&order_id=                  the order command card (opening changes nothing)
 * GET ?view=quality&order_id=                songs and artwork awaiting quality review (access audited)
 * GET ?view=approvals                        decisions only Bella or Lewis make, pending and made
 * GET ?view=customers                        customers needing help
 * GET ?view=health                           system health in plain words
 * GET ?view=readiness                        launch readiness and the music platform
 * GET ?view=notifications&filter=needs_action|delivered|failed|all
 * GET ?view=search&q=                        reference, customer name, email or product (never logged)
 * GET ?view=advanced&order_id=               ADVANCED / TECHNICAL record
 *
 * POST { action: SONG_QUALITY_CHECK, order_id, candidate_id, answers, decision, note? }
 * POST { action: ARTWORK_QUALITY_CHECK, order_id, art_master_id, answers, decision, note? }
 * POST { action: VIDEO_QUALITY_CHECK, order_id, candidate_id, answers, decision, note? }
 * GET ?view=videos                          Memory Music Video summary, capacity, jobs and metrics
 *
 * Financial decisions are not here: they go through crm/order-action with the
 * founder's own code. Nothing here purchases, refunds, sends to a customer or
 * calls a music provider.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/command-centre.php';

require_crm_key();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$pdo = db();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $staff = operations_line($_GET['staff'] ?? null, 160);
        if ($staff === null) {
            json_error(422, 'staff_required', 'Say who is looking, so the audit trail can.');
        }
        $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
        $period = in_array($_GET['period'] ?? '', ['today', 'week', 'all'], true) ? (string) $_GET['period'] : 'today';
        switch ((string) ($_GET['view'] ?? 'overview')) {
            case 'overview':
                json_response(200, cc_overview($pdo, $period));
            case 'orders':
                $stage = in_array($_GET['stage'] ?? '', CC_PIPELINE, true) ? (string) $_GET['stage'] : null;
                json_response(200, ['stage' => $stage, 'period' => cc_period($period), 'orders' => cc_orders($pdo, $stage, $period)]);
            case 'order':
                $card = cc_order_card($pdo, $orderId);
                $card === null ? json_error(404, 'order_not_found', 'No paid order was found.') : json_response(200, $card);
            case 'quality':
                $view = cc_quality_view($pdo, $orderId, $staff);
                $view === null ? json_error(404, 'order_not_found', 'No paid order was found.') : json_response(200, $view);
            case 'approvals':
                $orders = cc_paid_orders($pdo);
                json_response(200, cc_approvals($pdo, $orders, cc_latest_economics($pdo)));
            case 'customers':
                json_response(200, ['customers' => cc_customer_problems($pdo, cc_paid_orders($pdo))]);
            case 'health':
                json_response(200, cc_health($pdo));
            case 'readiness':
                json_response(200, ['readiness' => cc_readiness($pdo), 'music_platform' => creative_data()['selected_music_platform']]);
            case 'notifications':
                json_response(200, cc_notifications($pdo, (string) ($_GET['filter'] ?? 'needs_action')));
            case 'search':
                json_response(200, ['results' => cc_search($pdo, (string) ($_GET['q'] ?? ''))]);
            case 'videos':
                json_response(200, cc_videos_view($pdo, cc_period($period)));
            case 'advanced':
                $adv = cc_advanced($pdo, $orderId);
                $adv === null ? json_error(404, 'order_not_found', 'No order was found.') : json_response(200, $adv);
            default:
                json_error(422, 'invalid_view', 'Unknown view.');
        }
    }

    require_method('POST');
    $body = read_json_body(16384);
    $staff = operations_line($body['staff'] ?? null, 160);
    $orderId = is_int($body['order_id'] ?? null) ? $body['order_id'] : 0;
    if ($staff === null || $orderId <= 0) {
        json_error(422, 'invalid_request', 'Give the order and say who is deciding.');
    }
    $note = operations_text($body['note'] ?? null, 1000);
    $action = (string) ($body['action'] ?? '');
    $result = db_transaction(function (PDO $pdo) use ($action, $body, $orderId, $note, $staff): array {
        $row = operations_order_row($pdo, $orderId, true);
        if ($row === null || $row['status'] !== 'PAID') {
            throw new OperationsException('order_not_found', 'No paid order was found.', 404);
        }
        return match ($action) {
            'SONG_QUALITY_CHECK' => cc_song_quality_check($pdo, $orderId, is_int($body['candidate_id'] ?? null) ? $body['candidate_id'] : 0, $body['answers'] ?? null, $body['decision'] ?? null, $note, $staff),
            'VIDEO_QUALITY_CHECK' => cc_video_quality_check($pdo, $orderId, is_int($body['candidate_id'] ?? null) ? $body['candidate_id'] : 0, $body['answers'] ?? null, $body['decision'] ?? null, $note, $staff),
            'ARTWORK_QUALITY_CHECK' => cc_artwork_quality_check($pdo, $orderId, is_int($body['art_master_id'] ?? null) ? $body['art_master_id'] : 0, $body['answers'] ?? null, $body['decision'] ?? null, $note, $staff),
            default => throw new OperationsException('unknown_action', 'Unknown action.', 422),
        };
    });
    json_response(200, ['order_id' => $orderId, 'action' => $action] + $result);
} catch (CreativeValidationException $e) {
    json_error(422, 'validation_failed', $e->getMessage());
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB command centre failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be completed. Nothing was changed.');
}
