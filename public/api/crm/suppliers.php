<?php
/**
 * /api/crm/suppliers — MCB Supplier Intelligence & Commercial Routing (founders and staff).
 * CRM key and a staff name on every request. INTERNAL: partner identities,
 * expected costs and routes are shown only here, never cached or indexed.
 *
 * GET  ?view=overview                         the Suppliers overview, research and manufacturing data
 * GET  ?view=orders                           order lines awaiting a route review or authorisation
 * GET  ?view=scorecards                       per-route evidence (transparent components, sample sizes)
 * GET  ?view=lookup&sku=…&country=GB          the routing engine for a product and a customer destination
 * POST { action: RECORD_ROUTE_DECISION, order_reference, sku, route_id, deviation_reason?, note?,
 *        confirmed_delivered_cost_minor?, confirmed_delivered_currency?, delivered_cost_evidence? }
 *
 * DECISION SUPPORT ONLY. Nothing here purchases, pays, refunds, contacts a
 * partner or authorises spend: Bella or Lewis authorises every purchase with
 * their own code, then a person places the order.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/routing.php';

require_crm_key();
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex, nofollow');

$pdo = db();

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        if (operations_line($_GET['staff'] ?? null, 160) === null) {
            json_error(422, 'staff_required', 'Say who is looking.');
        }
        $view = (string) ($_GET['view'] ?? 'overview');
        match ($view) {
            'overview' => json_response(200, ['view' => 'overview'] + suppliers_overview($pdo)),
            'orders' => json_response(200, ['view' => 'orders', 'orders' => suppliers_orders_to_route($pdo), 'deviation_reasons' => suppliers_data()['route_deviation_reasons']]),
            'scorecards' => json_response(200, ['view' => 'scorecards', 'scorecards' => route_scorecards($pdo), 'components' => suppliers_data()['scorecard_components']]),
            'lookup' => json_response(200, ['view' => 'lookup', 'products' => array_map(static fn (array $e): array => ['sku' => $e['sku'], 'label' => $e['label']], suppliers_data()['registry'])]
                + (isset($_GET['sku']) && registry_entry((string) $_GET['sku']) !== null ? ['result' => route_options((string) $_GET['sku'], isset($_GET['country']) ? (string) $_GET['country'] : null)] : ['result' => null])),
            default => json_error(422, 'invalid_view', 'Unknown view.'),
        };
    }

    require_method('POST');
    $in = read_json_body(8192);
    $staff = operations_line($in['staff'] ?? null, 160);
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is recording this, for the audit trail.');
    }
    if (($in['action'] ?? null) !== 'RECORD_ROUTE_DECISION') {
        json_error(422, 'unknown_action', 'That action is not recognised.');
    }
    $ref = operations_line($in['order_reference'] ?? null, 40);
    $find = $pdo->prepare("SELECT id FROM orders WHERE mcb_reference = :r AND status = 'PAID' AND fulfilment_type = 'PHYSICAL'");
    $find->execute([':r' => $ref]);
    $orderId = $find->fetchColumn();
    if ($orderId === false) {
        json_error(404, 'order_not_found', 'No paid physical order with that reference.');
    }
    json_response(200, db_transaction(static fn (PDO $pdo): array => record_route_decision($pdo, (int) $orderId, $in, $staff)));
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB supplier routing failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'The supplier routing view could not be prepared. Nothing was changed.');
}
