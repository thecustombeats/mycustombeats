<?php
/**
 * /api/crm/operations — the staff operations surface. CRM key required.
 *
 * GET  ?view=queue                     the action and exception queue
 * GET  ?q=MCB-2026-000004 | email | 41 | LIVE-… | FP-…   find orders/enquiries
 * GET  ?order=41                       one order: state, next action, timeline
 * GET  ?enquiry=LIVE-2026-7QK4ZM       one MCB LIVE or Bespoke enquiry
 * GET  ?view=live-enquiries&status=NEW  MCB LIVE enquiries, newest first
 * POST { action: "ACKNOWLEDGE", item_key, staff, note? }
 * POST { action: "ENQUIRY_STATUS", reference, status, staff }
 *
 * The creative brief (every memory, photo and the delivery address) is served
 * by /api/crm/order-personalisation, and is not repeated here. Nothing here
 * holds supplier costs: MCB records none.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/operations-queue.php';
require_once __DIR__ . '/../lib/customer-progress.php';

require_crm_key();

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') {
    $body   = read_json_body(8192);
    $action = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';
    $staff  = crm_staff_name(operations_line($body['staff'] ?? null, 160));
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
    }

    if ($action === 'ACKNOWLEDGE') {
        $key = is_string($body['item_key'] ?? null) ? $body['item_key'] : '';
        $current = array_column(operations_queue($pdo), null, 'key');
        if (!isset($current[$key])) {
            json_error(404, 'item_not_found', 'That item is no longer in the queue.');
        }
        $note = operations_line($body['note'] ?? null, 500);
        $pdo->prepare(
            'INSERT INTO operations_acknowledgements (item_key, staff, note, created_at)
             VALUES (:k, :s, :n, UTC_TIMESTAMP())
             ON DUPLICATE KEY UPDATE staff = VALUES(staff), note = VALUES(note), created_at = VALUES(created_at)'
        )->execute([':k' => $key, ':s' => $staff, ':n' => $note]);

        $subject = $current[$key]['subject'];
        if (isset($subject['order_id'])) {
            record_order_event_safely($pdo, (int) $subject['order_id'], 'QUEUE.ACKNOWLEDGED', ['kind' => $current[$key]['kind'], 'by' => $staff]);
        } elseif (in_array($subject['type'], ['MCB_LIVE_ENQUIRY', 'BESPOKE_ENQUIRY'], true)) {
            record_operations_event($pdo, $subject['type'], $subject['reference'], 'QUEUE.ACKNOWLEDGED', ['kind' => $current[$key]['kind'], 'by' => $staff]);
        }
        json_response(200, ['acknowledged' => $key]);
    }

    if ($action === 'ENQUIRY_STATUS') {
        $reference = strtoupper(trim((string) ($body['reference'] ?? '')));
        $status    = strtoupper(trim((string) ($body['status'] ?? '')));
        if (preg_match('/^LIVE-\d{4}-[0-9A-Z]{6}$/', $reference) === 1) {
            [$table, $type, $allowed] = ['live_enquiries', 'MCB_LIVE_ENQUIRY', ['NEW', 'IN_CONVERSATION', 'QUOTE_SENT', 'CLOSED', 'DECLINED']];
        } elseif (preg_match('/^FP-\d{4}-[0-9A-Z]{6}$/', $reference) === 1) {
            [$table, $type, $allowed] = ['concierge_enquiries', 'BESPOKE_ENQUIRY', ['NEW', 'IN_CONVERSATION', 'PROPOSAL_SENT', 'AGREED', 'CLOSED', 'DECLINED']];
        } else {
            json_error(422, 'invalid_reference', 'Give a LIVE- or FP- enquiry reference.');
        }
        if (!in_array($status, $allowed, true)) {
            json_error(422, 'invalid_status', 'That status is not used for this kind of enquiry.');
        }
        $from = $pdo->prepare("SELECT status FROM {$table} WHERE reference = :r");
        $from->execute([':r' => $reference]);
        $previous = $from->fetchColumn();
        if ($previous === false) {
            json_error(404, 'enquiry_not_found', 'No such enquiry.');
        }
        $pdo->prepare("UPDATE {$table} SET status = :s WHERE reference = :r")->execute([':s' => $status, ':r' => $reference]);
        record_operations_event($pdo, $type, $reference, 'ENQUIRY.STATUS_CHANGED', ['from' => $previous, 'to' => $status, 'by' => $staff]);
        json_response(200, ['reference' => $reference, 'status' => $status]);
    }

    json_error(422, 'unknown_action', 'That action is not recognised.');
}

require_method('GET');

/* ---- Queue ------------------------------------------------------------------ */
if (($_GET['view'] ?? '') === 'queue') {
    $items = operations_queue($pdo);
    $counts = [];
    foreach ($items as $item) {
        $counts[$item['kind']] = ($counts[$item['kind']] ?? 0) + 1;
    }
    json_response(200, ['generated_at' => gmdate('Y-m-d H:i:s'), 'counts' => (object) $counts, 'items' => $items]);
}

/* ---- MCB LIVE enquiries ------------------------------------------------------ */
if (($_GET['view'] ?? '') === 'live-enquiries') {
    $status = strtoupper(trim((string) ($_GET['status'] ?? '')));
    $where  = in_array($status, ['NEW', 'IN_CONVERSATION', 'QUOTE_SENT', 'CLOSED', 'DECLINED'], true) ? 'WHERE status = :s' : '';
    $stmt = $pdo->prepare(
        "SELECT reference, request_type, status, name, email, phone, event_type, event_date, location, performer,
                duration, approximate_budget, song_reveal, details, created_at, updated_at
           FROM live_enquiries {$where} ORDER BY id DESC LIMIT 200"
    );
    $stmt->execute($where === '' ? [] : [':s' => $status]);
    json_response(200, ['enquiries' => $stmt->fetchAll()]);
}

/* ---- Search ----------------------------------------------------------------- */
if (isset($_GET['q'])) {
    $q = trim((string) $_GET['q']);
    $orders = [];
    $enquiries = [];
    $select = 'SELECT ' . MCB_OPERATIONS_COLUMNS . ', c.name AS customer_name, c.email AS customer_email
                 FROM orders o JOIN customers c ON c.id = o.customer_id
                 LEFT JOIN order_production p ON p.order_id = o.id ';

    if (preg_match('/^MCB-\d{4}-\d{6}$/i', $q) === 1) {
        $stmt = $pdo->prepare($select . 'WHERE o.mcb_reference = :v');
        $stmt->execute([':v' => strtoupper($q)]);
        $orders = $stmt->fetchAll();
    } elseif (filter_var($q, FILTER_VALIDATE_EMAIL) !== false) {
        $stmt = $pdo->prepare($select . 'WHERE c.email = :v ORDER BY o.id DESC LIMIT 50');
        $stmt->execute([':v' => mb_strtolower($q)]);
        $orders = $stmt->fetchAll();
        foreach (['live_enquiries' => 'MCB_LIVE_ENQUIRY', 'concierge_enquiries' => 'BESPOKE_ENQUIRY'] as $table => $type) {
            $e = $pdo->prepare("SELECT reference, status, created_at FROM {$table} WHERE email = :v ORDER BY id DESC LIMIT 20");
            $e->execute([':v' => mb_strtolower($q)]);
            foreach ($e->fetchAll() as $row) {
                $enquiries[] = ['type' => $type] + $row;
            }
        }
    } elseif (ctype_digit($q) && strlen($q) <= 10) {
        $stmt = $pdo->prepare($select . 'WHERE o.id = :v');
        $stmt->execute([':v' => (int) $q]);
        $orders = $stmt->fetchAll();
    } elseif (preg_match('/^(LIVE|FP)-\d{4}-[0-9A-Z]{6}$/i', $q, $m) === 1) {
        $table = strtoupper($m[1]) === 'LIVE' ? 'live_enquiries' : 'concierge_enquiries';
        $e = $pdo->prepare("SELECT reference, status, created_at FROM {$table} WHERE reference = :v");
        $e->execute([':v' => strtoupper($q)]);
        foreach ($e->fetchAll() as $row) {
            $enquiries[] = ['type' => $table === 'live_enquiries' ? 'MCB_LIVE_ENQUIRY' : 'BESPOKE_ENQUIRY'] + $row;
        }
    } else {
        json_error(422, 'invalid_search', 'Search by MCB reference, email address, order number, or LIVE-/FP- enquiry reference.');
    }

    json_response(200, [
        'orders' => array_map(static fn (array $r): array => [
            'order_id'       => (int) $r['id'],
            'reference'      => $r['mcb_reference'],
            'payment_status' => $r['status'],
            'workflow'       => order_workflow($r),
            'state'          => operational_state($r),
            'customer'       => ['name' => $r['customer_name'], 'email' => $r['customer_email']],
            'created_at'     => $r['created_at'],
        ], $orders),
        'enquiries' => $enquiries,
    ]);
}

/* ---- One enquiry -------------------------------------------------------------- */
if (isset($_GET['enquiry'])) {
    $reference = strtoupper(trim((string) $_GET['enquiry']));
    if (preg_match('/^LIVE-\d{4}-[0-9A-Z]{6}$/', $reference) === 1) {
        $stmt = $pdo->prepare(
            'SELECT reference, request_type, status, name, email, phone, event_type, event_date, location, performer,
                    duration, approximate_budget, song_reveal, details, created_at, updated_at
               FROM live_enquiries WHERE reference = :r'
        );
        $type = 'MCB_LIVE_ENQUIRY';
    } elseif (preg_match('/^FP-\d{4}-[0-9A-Z]{6}$/', $reference) === 1) {
        $stmt = $pdo->prepare(
            'SELECT reference, status, name, email, phone, preferred_contact, occasion, create_request, needed_by,
                    delivery_region, budget_mode, budget_amount_minor, budget_currency, story, created_at, updated_at
               FROM concierge_enquiries WHERE reference = :r'
        );
        $type = 'BESPOKE_ENQUIRY';
    } else {
        json_error(422, 'invalid_reference', 'Give a LIVE- or FP- enquiry reference.');
    }
    $stmt->execute([':r' => $reference]);
    $enquiry = $stmt->fetch();
    if ($enquiry === false) {
        json_error(404, 'enquiry_not_found', 'No such enquiry.');
    }
    $events = $pdo->prepare('SELECT event_type, detail, created_at FROM operations_events WHERE subject_type = :t AND subject_reference = :r ORDER BY id');
    $events->execute([':t' => $type, ':r' => $reference]);
    json_response(200, ['type' => $type, 'enquiry' => $enquiry, 'timeline' => $events->fetchAll()]);
}

/* ---- One order ------------------------------------------------------------------ */
$orderId = ctype_digit((string) ($_GET['order'] ?? '')) ? (int) $_GET['order'] : 0;
if ($orderId <= 0) {
    json_error(422, 'invalid_request', 'Use view=queue, q=, order= or enquiry=.');
}

$row = operations_order_row($pdo, $orderId);
if ($row === null) {
    json_error(404, 'order_not_found', 'No such order.');
}

$customer = $pdo->prepare('SELECT c.name, c.email, c.phone FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.id = :id');
$customer->execute([':id' => $orderId]);

$money = $pdo->prepare('SELECT total_minor, currency, subtotal_minor, delivery_minor, delivery_label, stripe_livemode FROM orders WHERE id = :id');
$money->execute([':id' => $orderId]);
$moneyRow = $money->fetch();

$lines = $pdo->prepare('SELECT item_id AS sku, item_name AS name, category, quantity, unit_minor FROM order_items WHERE order_id = :id ORDER BY id');
$lines->execute([':id' => $orderId]);


$service = $pdo->prepare(
    'SELECT s.id, s.kind, s.priority_replacement_requested, s.eligibility, s.description, s.status, s.resolution,
            s.resolved_by, s.resolved_at, s.created_at, s.unit_id
       FROM order_service_requests s WHERE s.order_id = :id ORDER BY s.id'
);
$service->execute([':id' => $orderId]);
$unitNames = array_column(customer_order_items($pdo, $orderId), 'name', 'unit_id');
$serviceRows = array_map(static function (array $s) use ($unitNames): array {
    $s['item'] = $s['unit_id'] === null ? null : ($unitNames[(int) $s['unit_id']] ?? null);
    unset($s['unit_id']);
    $s['id'] = (int) $s['id'];
    return $s;
}, $service->fetchAll());

$notes = $pdo->prepare('SELECT note, staff, created_at FROM order_staff_notes WHERE order_id = :id ORDER BY id');
$notes->execute([':id' => $orderId]);

$comms = $pdo->prepare('SELECT message_type, dedupe_key, status, attempted_at, sent_at, failure_code FROM customer_communications WHERE order_id = :id ORDER BY id');
$comms->execute([':id' => $orderId]);

$links = $pdo->prepare(
    "SELECT purpose, approval_round, expires_at, last_used_at, created_by, created_at
       FROM order_access_tokens
      WHERE order_id = :id AND revoked_at IS NULL AND expires_at > UTC_TIMESTAMP()
      ORDER BY id"
);
$links->execute([':id' => $orderId]);

$timeline = $pdo->prepare('SELECT event_type, detail, created_at FROM order_events WHERE order_id = :id ORDER BY id');
$timeline->execute([':id' => $orderId]);

$referral = $pdo->prepare('SELECT status, code_snapshot, attributed_at, confirmed_at FROM customer_referral_conversions WHERE order_id = :id');
$referral->execute([':id' => $orderId]);
$referralRow = $referral->fetch();

$units = customer_order_items($pdo, $orderId);

// The production artwork plan, refreshed (idempotent) so staff always see the current position.
try {
    $artworkRows = db_transaction(fn (PDO $pdo): array => plan_order_artwork($pdo, $orderId));
} catch (Throwable $e) {
    error_log('MCB artwork: could not refresh the plan for order ' . $orderId . ': ' . $e->getMessage());
    $artworkRows = order_artwork_rows($pdo, $orderId);
}
$row = operations_order_row($pdo, $orderId) ?? $row;

$founderNotes = $pdo->prepare(
    'SELECT id, notification_type AS type, status, attempts, last_error, delivered_at, delivered_channel, created_at
       FROM founder_notifications WHERE order_id = :id ORDER BY id'
);
$founderNotes->execute([':id' => $orderId]);

$lifecycleEvents = $pdo->prepare(
    "SELECT event_type, MIN(created_at) AS at FROM order_events
      WHERE order_id = :id AND event_type IN ('ORDER.COMPLETED','FOLLOW_UP.DUE','FOLLOW_UP.DONE','FOLLOW_UP.SENT','REVIEW.REQUESTED')
      GROUP BY event_type"
);
$lifecycleEvents->execute([':id' => $orderId]);
$lifecycleAt = array_column($lifecycleEvents->fetchAll(), 'at', 'event_type');

$state = operational_state($row);
$actions = available_staff_actions($row);
$reviewRequired = order_workflow($row) === 'PHYSICAL' && order_requires_fulfilment_review($pdo, $orderId);
$reviewConfirmed = $reviewRequired && fulfilment_review_confirmed($pdo, $orderId);
if ($reviewRequired && !$reviewConfirmed && ($row['status'] ?? '') === 'PAID'
    && !in_array(effective_fulfilment_state($row), ['CONFIRMED', 'DISPATCHED', 'DELIVERED'], true)) {
    array_unshift($actions, 'CONFIRM_FULFILMENT_REVIEW');
}

json_response(200, [
    'order_id'       => $orderId,
    'reference'      => $row['mcb_reference'],
    'payment_status' => $row['status'],
    'test_payment'   => $moneyRow['stripe_livemode'] === null ? null : (int) $moneyRow['stripe_livemode'] === 0,
    'workflow'       => order_workflow($row),
    'created_at'     => $row['created_at'],
    'customer'       => $customer->fetch() ?: null,
    'amount'         => [
        'total_minor'    => $moneyRow['total_minor'] === null ? null : (int) $moneyRow['total_minor'],
        'subtotal_minor' => $moneyRow['subtotal_minor'] === null ? null : (int) $moneyRow['subtotal_minor'],
        'delivery_minor' => $moneyRow['delivery_minor'] === null ? null : (int) $moneyRow['delivery_minor'],
        'delivery_label' => $moneyRow['delivery_label'],
        'currency'       => $moneyRow['currency'],
    ],
    'lines'          => $lines->fetchAll(),
    'operations'     => [
        'state'             => $state,
        'next_action'       => next_action_for($state),
        'available_actions' => $actions,
        'stage'             => $row['stage'],
        'personalisation'   => $row['personalisation_status'],
        'creative'          => ['started_at' => $row['creative_started_at'], 'ready_at' => $row['creative_ready_at']],
        'quality_check'     => [
            'submitted_at' => $row['qc_submitted_at'],
            'passed_at'    => $row['qc_passed_at'],
            'passed_by'    => $row['qc_passed_by'],
            'checklist'    => $row['qc_checklist'] === null ? null : json_decode((string) $row['qc_checklist'], true),
            'failed_count' => (int) ($row['qc_failed_count'] ?? 0),
            'items'        => array_map(static fn (string $id): string => $id, required_qc_items(order_workflow($row))),
        ],
        'reveal'            => order_workflow($row) === 'DIGITAL' ? [
            'url'         => $row['reveal_url'],
            'revealed_at' => $row['revealed_at'],
        ] : null,
        // Evidence from the retired customer-approval model, kept for historical records only.
        'legacy_approval'   => $row['approved_at'] !== null || (int) ($row['approval_round'] ?? 0) > 0 ? [
            'approved_at' => $row['approved_at'],
            'channel'     => $row['approval_channel'],
            'rounds'      => (int) ($row['approval_round'] ?? 0),
        ] : null,
        'fulfilment'        => [
            'state'          => effective_fulfilment_state($row),
            'pending_reason' => $row['fulfilment_pending_reason'],
            'ready_at'       => $row['fulfilment_ready_at'],
            'confirmed_at'   => $row['fulfilment_confirmed_at'],
            'reference'      => $row['fulfilment_reference'],
            'purchase_authorised_by' => $row['supplier_purchase_authorised_by'],
            'purchase_authorised_at' => $row['supplier_purchase_authorised_at'],
            // What Bella or Lewis sees before explicitly authorising. The link that
            // brought them here authorised nothing.
            'approval'       => order_workflow($row) === 'PHYSICAL' ? [
                'required'         => $state === 'FULFILMENT.READY',
                'customer_payment' => $row['status'] === 'PAID' ? 'VERIFIED' : 'NOT_VERIFIED',
                'mcb_qc'           => in_array($row['stage'], MCB_QC_PASSED_STAGES, true) || in_array($row['stage'], ['PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true) ? 'PASSED' : 'NOT_PASSED',
                'supplier_order'   => match ($state) {
                    'FULFILMENT.READY' => 'READY', 'FULFILMENT.AUTHORISED' => 'AUTHORISED',
                    'FULFILMENT.CONFIRMED', 'DISPATCHED', 'DELIVERED', 'COMPLETED' => 'RECORDED',
                    default => 'NOT_READY',
                },
                'authorisers'        => MCB_FOUNDERS,
                'authorisation_configured' => array_values(array_filter(MCB_FOUNDERS, 'founder_authorisation_configured')),
                'action_url'         => founder_action_url($row['mcb_reference'], 'AUTHORISE_SUPPLIER_PURCHASE'),
                // Everything the founder needs before authorising, on this protected page only.
                'manufacturing_package' => ($pkg = current_manufacturing_package($pdo, $orderId)) === null ? null : [
                    'package_id' => (int) $pkg['id'], 'version' => (int) $pkg['version'], 'status' => $pkg['status'], 'blockers' => json_decode((string) $pkg['blockers'], true),
                ],
                'supplier_order_pack' => ($pack = current_supplier_order_pack($pdo, $orderId)) === null ? null : [
                    'pack_id' => (int) $pack['id'], 'version' => (int) $pack['version'], 'status' => $pack['status'],
                    'lines' => array_map(static fn (array $l): array => [
                        'sku' => $l['sku'], 'product' => $l['product'], 'quantity' => $l['quantity'], 'supplier_data_status' => $l['supplier_data_status'],
                        'supplier' => $l['supplier_data']['supplier'] ?? null, 'product_url' => $l['supplier_data']['product_url'] ?? null,
                        'configuration' => $l['supplier_data']['configuration'] ?? null, 'expected_cost_minor' => $l['supplier_data']['expected_cost_minor'] ?? null,
                        'shipping_allowance_minor' => $l['supplier_data']['shipping_allowance_minor'] ?? null, 'currency' => $l['supplier_data']['currency'] ?? null,
                        'destination_limitations' => $l['supplier_data']['destination_limitations'] ?? [], 'order_notes' => $l['supplier_data']['order_notes'] ?? null,
                    ], json_decode((string) $pack['body'], true)['lines'] ?? []),
                    'placed_by' => $pack['placed_by'], 'placed_at' => $pack['placed_at'],
                ],
                'enforcement'        => creative_enforcement(),
            ] : null,
            // The Fulfilment Controller: decision card data, workspace, supplier orders, parcels, exceptions (STAFF ONLY).
            'controller'     => fulfilment_order_record($pdo, $row),
            // Availability, destination and delivery cost confirmed with the partner.
            'review_required'  => $reviewRequired,
            'review_confirmed' => $reviewConfirmed,
        ],
        'delivery'          => [
            'carrier'            => $row['carrier'],
            'tracking_reference' => $row['tracking_reference'],
            'tracking_url'       => $row['tracking_url'],
            'dispatched_on'      => $row['dispatched_on'],
            'delayed_at'         => $row['delivery_delayed_at'],
            'delivered_on'       => $row['delivered_on'],
        ],
        'follow_up'         => ['due_at' => $row['follow_up_due_at'], 'done_at' => $row['follow_up_done_at']],
        'completed_at'      => $row['completed_at'],
        // Completion, follow-up and review are separate facts.
        'lifecycle'         => [
            'completed'         => $row['stage'] === 'COMPLETED',
            'completed_at'      => $row['completed_at'],
            'follow_up_due_at'  => $row['follow_up_due_at'],
            'follow_up_done_at' => $row['follow_up_done_at'],
            'follow_up_sent_at' => $lifecycleAt['FOLLOW_UP.SENT'] ?? null,
            'review_requested_at' => $lifecycleAt['REVIEW.REQUESTED'] ?? null,
        ],
        'reopen_count'      => (int) ($row['reopen_count'] ?? 0),
    ],
    'items'            => array_map(static fn (array $u): array => [
        'name' => $u['name'],
        'priority_replacement' => $u['priority_replacement'],
        'priority_replacement_request_by' => $u['priority_replacement'] ? priority_replacement_window_end($row['delivered_on']) : null,
    ], $units),
    'artwork'          => ['components' => artwork_view($artworkRows), 'blocking' => count(artwork_blocking_rows($artworkRows))],
    'founder_notifications' => $founderNotes->fetchAll(),
    'service_requests' => $serviceRows,
    'notes'            => $notes->fetchAll(),
    'communications'   => $comms->fetchAll(),
    'active_links'     => $links->fetchAll(),
    'referral'         => $referralRow === false ? null : $referralRow,
    'timeline'         => $timeline->fetchAll(),
    'brief'            => '/api/crm/order-personalisation?order_id=' . $orderId,
]);
