<?php
/**
 * MCB — the action and exception queue.
 *
 * DERIVED, NEVER STORED. Every item is computed from persisted state at the
 * moment staff look: a paid order waiting for creative work, a change request,
 * a physical order ready to be placed, a delay, a damaged-item report, a
 * failed email, a payment that did not match, a new enquiry. When the state
 * moves on, the item disappears by itself; there is no second list to keep in
 * step.
 *
 * Each item has a key that encodes the state it came from
 * (ORDER:41:CHANGES_REQUESTED:0:2). Acknowledging stores who saw it and when,
 * against that key — so if the same order raises a new problem later, its
 * new key is not hidden by an old acknowledgement.
 *
 * Items describe WHAT needs attention, never what a customer wrote.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';

/** Staff actions that make sense from a state; checked again when performed. */
function available_staff_actions(array $row): array
{
    if (($row['status'] ?? '') !== 'PAID') {
        return ['ADD_NOTE'];
    }
    $state = operational_state($row);
    $byState = [
        'ORDER.PAID'                          => ['START_CREATIVE', 'MARK_CREATIVE_READY'],
        'CREATIVE.PENDING'                    => ['START_CREATIVE', 'MARK_CREATIVE_READY'],
        'CREATIVE.IN_PROGRESS'                => ['MARK_CREATIVE_READY'],
        'CREATIVE.READY'                      => ['REQUEST_APPROVAL', 'RECORD_APPROVAL', 'RECORD_CHANGES_REQUEST'],
        'CUSTOMER_APPROVAL.REQUIRED'          => ['RECORD_APPROVAL', 'RECORD_CHANGES_REQUEST', 'REISSUE_APPROVAL_LINK'],
        'CUSTOMER_APPROVAL.CHANGES_REQUESTED' => ['MARK_CREATIVE_READY'],
        'CUSTOMER_APPROVAL.APPROVED'          => ['MARK_COMPLETED', 'REOPEN'],
        'FULFILMENT.PENDING'                  => ['SET_FULFILMENT_READY', 'REOPEN'],
        'FULFILMENT.READY'                    => ['CONFIRM_FULFILMENT', 'REOPEN'],
        'FULFILMENT.CONFIRMED'                => ['MARK_DISPATCHED', 'REOPEN'],
        'DISPATCHED'                          => ['UPDATE_TRACKING', 'MARK_DELIVERY_DELAYED', 'MARK_DELIVERED'],
        'DELIVERED'                           => ['MARK_COMPLETED', 'REOPEN'],
        'FOLLOW_UP.DUE'                       => ['RECORD_FOLLOW_UP', 'MARK_COMPLETED', 'REOPEN'],
        'COMPLETED'                           => ['REOPEN'],
    ];
    $actions = $byState[$state] ?? [];
    if ($state !== 'FOLLOW_UP.DUE' && ($row['follow_up_due_at'] ?? null) !== null && ($row['follow_up_done_at'] ?? null) === null) {
        $actions[] = 'RECORD_FOLLOW_UP';
    }
    return array_values(array_unique(array_merge($actions, ['ISSUE_STATUS_LINK', 'REVOKE_LINKS', 'ADD_NOTE'])));
}

function queue_item(string $key, string $kind, array $subject, ?string $since, string $detail, array $flags = []): array
{
    $meta = operations_data()['queue_kinds'][$kind];
    return [
        'key'      => $key,
        'kind'     => $kind,
        'label'    => $meta['label'],
        'priority' => (int) $meta['priority'],
        'subject'  => $subject,
        'since'    => $since,
        'detail'   => $detail,
        'flags'    => $flags,
    ];
}

/** @return list<array> the current queue, most urgent first */
function operations_queue(PDO $pdo, ?int $now = null): array
{
    $now   = $now ?? time();
    $items = [];
    $data  = operations_data();

    // ---- Paid orders still being worked on ---------------------------------
    $orders = $pdo->query(
        "SELECT " . MCB_OPERATIONS_COLUMNS . ", o.package,
                COALESCE(paid.created_at, o.updated_at) AS paid_at,
                (SELECT COUNT(*) FROM delivery_addresses d WHERE d.order_id = o.id) AS has_address,
                (SELECT cr.within_allowance FROM order_change_requests cr
                  WHERE cr.order_id = o.id ORDER BY cr.id DESC LIMIT 1) AS last_within_allowance
           FROM orders o
           LEFT JOIN order_production p ON p.order_id = o.id
           LEFT JOIN order_events paid ON paid.order_id = o.id AND paid.dedupe_key = 'paid'
          WHERE o.status = 'PAID'
            AND (p.stage IS NULL OR p.stage <> 'COMPLETED'
                 OR (p.follow_up_due_at IS NOT NULL AND p.follow_up_done_at IS NULL))
          ORDER BY o.id
          LIMIT 1000"
    )->fetchAll();

    $overdueDays  = (int) mcb_setting('operations.overdue_after_days', 0);
    $delayDays    = (int) mcb_setting('operations.delivery_delay_days', 0);

    foreach ($orders as $r) {
        $id      = (int) $r['id'];
        $reopen  = (int) $r['reopen_count'];
        $state   = operational_state($r, $now);
        $subject = ['type' => 'ORDER', 'order_id' => $id, 'reference' => $r['mcb_reference'], 'workflow' => order_workflow($r)];
        $physical = order_workflow($r) === 'PHYSICAL';

        if ($r['personalisation_status'] !== 'COMPLETE') {
            $items[] = queue_item("ORDER:{$id}:MISSING_INFORMATION:personalisation", 'MISSING_INFORMATION', $subject, $r['paid_at'],
                'The personalisation is not recorded as complete. Check the brief before starting.');
        }
        if ($physical && (int) $r['has_address'] === 0) {
            $items[] = queue_item("ORDER:{$id}:MISSING_INFORMATION:address", 'MISSING_INFORMATION', $subject, $r['paid_at'],
                'A physical order with no delivery address.');
        }

        switch ($state) {
            case 'ORDER.PAID':
            case 'CREATIVE.PENDING':
            case 'CREATIVE.IN_PROGRESS':
            case 'CREATIVE.READY':
                $items[] = queue_item("ORDER:{$id}:CREATIVE_WORK:{$reopen}:{$state}", 'CREATIVE_WORK', $subject,
                    $r['creative_ready_at'] ?? $r['creative_started_at'] ?? $r['paid_at'], next_action_for($state) ?? '');
                break;
            case 'CUSTOMER_APPROVAL.REQUIRED':
                $items[] = queue_item("ORDER:{$id}:APPROVAL_REQUIRED:{$reopen}:{$r['approval_round']}", 'APPROVAL_REQUIRED', $subject,
                    $r['approval_requested_at'], 'Sent for approval (round ' . (int) $r['approval_round'] . ').');
                break;
            case 'CUSTOMER_APPROVAL.CHANGES_REQUESTED':
                $within = $r['last_within_allowance'];
                $items[] = queue_item("ORDER:{$id}:CHANGES_REQUESTED:{$reopen}:{$r['approval_round']}", 'CHANGES_REQUESTED', $subject,
                    $r['changes_requested_at'],
                    match ($within) {
                        'YES' => 'Within the included revisions.',
                        'NO'  => 'Beyond the included revisions — decide how to handle it before starting.',
                        default => 'This product has no numeric revision allowance — decide how to handle it.',
                    },
                    $within === 'YES' ? [] : ['REVISION_ALLOWANCE']);
                break;
            case 'FULFILMENT.PENDING':
                $items[] = queue_item("ORDER:{$id}:MISSING_INFORMATION:fulfilment:{$reopen}", 'MISSING_INFORMATION', $subject, $r['approved_at'],
                    'Approved, but fulfilment is waiting on: ' . strtolower(str_replace('_', ' ', (string) ($r['fulfilment_pending_reason'] ?? 'something'))) . '.');
                break;
            case 'FULFILMENT.READY':
                $items[] = queue_item("ORDER:{$id}:FULFILMENT_READY:{$reopen}", 'FULFILMENT_READY', $subject, $r['fulfilment_ready_at'],
                    'Place the supplier order by hand, then confirm it here. Nothing is ordered automatically.');
                break;
            case 'FULFILMENT.CONFIRMED':
                $items[] = queue_item("ORDER:{$id}:SUPPLIER_ACTION:{$reopen}", 'SUPPLIER_ACTION', $subject, $r['fulfilment_confirmed_at'],
                    'Placed. Record dispatch and tracking when it is sent.');
                break;
            case 'DISPATCHED':
                $late = $delayDays > 0 && $r['dispatched_on'] !== null
                    && strtotime($r['dispatched_on'] . ' 00:00:00 UTC') + $delayDays * 86400 < $now;
                if ($r['delivery_delayed_at'] !== null || $late) {
                    $items[] = queue_item("ORDER:{$id}:DELIVERY_DELAY:{$reopen}", 'DELIVERY_DELAY', $subject,
                        $r['delivery_delayed_at'] ?? $r['dispatched_on'],
                        $r['delivery_delayed_at'] !== null ? 'Marked as delayed.' : "No delivery recorded {$delayDays} days after dispatch.");
                }
                break;
        }

        if (follow_up_is_due($r, $now)) {
            $items[] = queue_item("ORDER:{$id}:FOLLOW_UP_DUE:{$reopen}", 'FOLLOW_UP_DUE', $subject, $r['follow_up_due_at'],
                'Check in with the customer, then record the follow-up.');
        }

        // Overdue: before the first approval request only, against an approved
        // numeric target (Moment) or the configured made-to-order threshold.
        if (in_array($state, ['ORDER.PAID', 'CREATIVE.PENDING', 'CREATIVE.IN_PROGRESS', 'CREATIVE.READY'], true)
            && (int) $r['approval_round'] === 0 && $reopen === 0) {
            $paidAt = strtotime($r['paid_at'] . ' UTC');
            $hours  = $data['creative_target_hours'][$r['package']] ?? null;
            $limit  = $hours !== null ? (int) $hours * 3600 : ($overdueDays > 0 ? $overdueDays * 86400 : null);
            if ($limit !== null && $paidAt + $limit < $now) {
                $items[] = queue_item("ORDER:{$id}:OVERDUE:0", 'OVERDUE', $subject, $r['paid_at'],
                    $hours !== null ? "Past the {$hours}-hour delivery target." : "Paid more than {$overdueDays} days ago and not yet sent for approval.");
            }
        }
    }

    // ---- Payments that need a person ---------------------------------------
    foreach ($pdo->query("SELECT id, mcb_reference, updated_at FROM orders WHERE status = 'PAYMENT_REVIEW' ORDER BY id LIMIT 200")->fetchAll() as $r) {
        $items[] = queue_item("PAYMENT:order:{$r['id']}", 'PAYMENT_REVIEW', ['type' => 'ORDER', 'order_id' => (int) $r['id'], 'reference' => $r['mcb_reference']],
            $r['updated_at'], 'Money arrived for this order that did not match what was expected.');
    }
    foreach ($pdo->query('SELECT id, reason, created_at FROM unreconciled_payments WHERE resolved_at IS NULL ORDER BY id LIMIT 200')->fetchAll() as $r) {
        $items[] = queue_item("PAYMENT:unreconciled:{$r['id']}", 'PAYMENT_REVIEW', ['type' => 'PAYMENT', 'unreconciled_id' => (int) $r['id']],
            $r['created_at'], 'Unreconciled payment: ' . strtolower(str_replace('_', ' ', (string) $r['reason'])) . '.');
    }

    // ---- Customer reports and questions ------------------------------------
    foreach ($pdo->query(
        "SELECT s.id, s.order_id, s.kind, s.status, s.eligibility, s.priority_replacement_requested, s.created_at, o.mcb_reference, o.fulfilment_type
           FROM order_service_requests s JOIN orders o ON o.id = s.order_id
          WHERE s.status IN ('OPEN','IN_REVIEW') ORDER BY s.id LIMIT 500"
    )->fetchAll() as $r) {
        $kind = $r['kind'] === 'DAMAGED_OR_FAULTY' ? 'REPLACEMENT_REQUEST' : 'SUPPORT';
        $detail = match ($r['kind']) {
            'DAMAGED_OR_FAULTY' => (int) $r['priority_replacement_requested'] === 1
                ? 'Damaged or faulty item, Priority Replacement requested: ' . strtolower(str_replace('_', ' ', (string) $r['eligibility'])) . '.'
                : 'Damaged or faulty item reported.',
            'DELIVERY_PROBLEM' => 'Delivery problem reported.',
            default => 'Question from the customer.',
        };
        $items[] = queue_item("SERVICE:{$r['id']}:{$r['status']}", $kind,
            ['type' => 'ORDER', 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'], 'workflow' => $r['fulfilment_type'], 'service_request_id' => (int) $r['id']],
            $r['created_at'], $detail, $r['eligibility'] === 'ELIGIBLE' ? ['PRIORITY_REPLACEMENT_ELIGIBLE'] : []);
    }

    // ---- Emails that did not go ------------------------------------------------
    foreach ($pdo->query(
        "SELECT c.id, c.order_id, c.message_type, c.dedupe_key, c.failure_code, c.attempted_at, o.mcb_reference
           FROM customer_communications c JOIN orders o ON o.id = c.order_id
          WHERE c.status = 'FAILED' ORDER BY c.id LIMIT 200"
    )->fetchAll() as $r) {
        $items[] = queue_item("MESSAGE:{$r['id']}", 'MESSAGE_FAILED',
            ['type' => 'ORDER', 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'], 'message_type' => $r['message_type'], 'dedupe_key' => $r['dedupe_key']],
            $r['attempted_at'], 'The ' . strtolower(str_replace('_', ' ', (string) $r['message_type'])) . ' email was not sent (' . $r['failure_code'] . '). Retry it, or contact the customer another way.');
    }

    // ---- Enquiries --------------------------------------------------------------
    foreach ($pdo->query("SELECT reference, needed_by, budget_mode, created_at FROM concierge_enquiries WHERE status = 'NEW' ORDER BY id LIMIT 500")->fetchAll() as $r) {
        $flags = [];
        if ($r['needed_by'] !== null && strtotime($r['needed_by'] . ' UTC') < $now + 14 * 86400) {
            $flags[] = 'DEADLINE_WITHIN_14_DAYS';
        }
        if ($r['budget_mode'] === 'OPEN') {
            $flags[] = 'NO_FIXED_SPENDING_LIMIT';
        }
        $items[] = queue_item("BESPOKE:{$r['reference']}:NEW", 'BESPOKE_ENQUIRY', ['type' => 'BESPOKE_ENQUIRY', 'reference' => $r['reference']],
            $r['created_at'], $flags === [] ? 'New Bespoke enquiry.' : 'New Bespoke enquiry that needs early attention.', $flags);
    }
    foreach ($pdo->query("SELECT reference, event_date, performer, created_at FROM live_enquiries WHERE status = 'NEW' ORDER BY id LIMIT 500")->fetchAll() as $r) {
        $flags = [];
        if ($r['event_date'] !== null && strtotime($r['event_date'] . ' UTC') < $now + 30 * 86400) {
            $flags[] = 'EVENT_WITHIN_30_DAYS';
        }
        $items[] = queue_item("LIVE:{$r['reference']}:NEW", 'MCB_LIVE_ENQUIRY', ['type' => 'MCB_LIVE_ENQUIRY', 'reference' => $r['reference']],
            $r['created_at'], 'New MCB LIVE enquiry (' . strtolower(str_replace('_', ' ', (string) $r['performer'])) . ').', $flags);
    }

    // ---- Acknowledgements --------------------------------------------------------
    if ($items !== []) {
        $keys = array_column($items, 'key');
        $in   = implode(',', array_fill(0, count($keys), '?'));
        $acks = $pdo->prepare("SELECT item_key, staff, note, created_at FROM operations_acknowledgements WHERE item_key IN ($in)");
        $acks->execute($keys);
        $byKey = [];
        foreach ($acks->fetchAll() as $a) {
            $byKey[$a['item_key']] = ['staff' => $a['staff'], 'note' => $a['note'], 'at' => $a['created_at']];
        }
        foreach ($items as &$item) {
            $item['acknowledged'] = $byKey[$item['key']] ?? null;
        }
        unset($item);
    }

    usort($items, static function (array $a, array $b): int {
        return [$a['priority'], $a['acknowledged'] !== null, (string) $a['since']]
            <=> [$b['priority'], $b['acknowledged'] !== null, (string) $b['since']];
    });

    return $items;
}
