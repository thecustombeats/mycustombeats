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
 * (ORDER:41:QUALITY_CHECK:0:1). Acknowledging stores who saw it and when,
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
        'ORDER.PAID'                          => ['START_CREATIVE', 'SEND_TO_QUALITY_CHECK'],
        'CREATIVE.PENDING'                    => ['START_CREATIVE', 'SEND_TO_QUALITY_CHECK'],
        'CREATIVE.IN_PROGRESS'                => ['SEND_TO_QUALITY_CHECK'],
        'QUALITY_CHECK'                       => ['PASS_QUALITY_CHECK', 'FAIL_QUALITY_CHECK'],
        'REVEAL.READY'                        => ['SEND_REVEAL', 'REOPEN'],
        'REVEALED'                            => ['MARK_COMPLETED', 'REOPEN'],
        'FULFILMENT.PENDING'                  => ['SET_FULFILMENT_READY', 'REOPEN'],
        'FULFILMENT.READY'                    => ['AUTHORISE_SUPPLIER_PURCHASE', 'REOPEN'],
        'FULFILMENT.AUTHORISED'               => ['RECORD_SUPPLIER_ORDER', 'CONFIRM_FULFILMENT', 'REOPEN'],
        'FULFILMENT.CONFIRMED'                => ['RECORD_SUPPLIER_ORDER', 'ADD_SHIPMENT', 'MARK_SHIPMENT_DISPATCHED', 'MARK_DISPATCHED', 'REOPEN'],
        'DISPATCHED'                          => ['RECORD_SUPPLIER_ORDER', 'ADD_SHIPMENT', 'MARK_SHIPMENT_DISPATCHED', 'UPDATE_SHIPMENT', 'MARK_SHIPMENT_DELIVERED', 'MARK_SHIPMENT_LOST', 'UPDATE_TRACKING', 'MARK_DELIVERY_DELAYED', 'MARK_DELIVERED'],
        'DELIVERED'                           => ['MARK_COMPLETED', 'REOPEN'],
        'FOLLOW_UP.DUE'                       => ['RECORD_FOLLOW_UP', 'MARK_COMPLETED', 'REOPEN'],
        'COMPLETED'                           => ['RECORD_REVIEW_REQUEST', 'RECORD_CONTENT_PERMISSION', 'REOPEN'],
    ];
    $actions = $byState[$state] ?? [];
    // Exceptions can be raised and resolved on any paid physical order; permissions are recorded whenever given.
    if (order_workflow($row) === 'PHYSICAL' && !in_array($state, ['ORDER.PAID', 'CREATIVE.PENDING'], true)) {
        $actions[] = 'RAISE_FULFILMENT_EXCEPTION';
        $actions[] = 'RESOLVE_FULFILMENT_EXCEPTION';
    }
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
                $items[] = queue_item("ORDER:{$id}:NEW_ORDER:{$reopen}", 'NEW_ORDER', $subject, $r['paid_at'],
                    'New order ready for processing. ' . (next_action_for($state) ?? ''));
                break;
            case 'CREATIVE.IN_PROGRESS':
                $items[] = queue_item("ORDER:{$id}:CREATIVE_WORK:{$reopen}:{$r['qc_failed_count']}", 'CREATIVE_WORK', $subject,
                    $r['creative_started_at'] ?? $r['paid_at'],
                    (int) $r['qc_failed_count'] > 0 ? 'Correcting after a failed quality check, then back to the check.' : (next_action_for($state) ?? ''));
                break;
            case 'QUALITY_CHECK':
                $items[] = queue_item("ORDER:{$id}:QUALITY_CHECK:{$reopen}:{$r['qc_failed_count']}", 'QUALITY_CHECK', $subject,
                    $r['qc_submitted_at'] ?? $r['creative_ready_at'] ?? $r['paid_at'], next_action_for($state) ?? '');
                break;
            case 'REVEAL.READY':
                $items[] = queue_item("ORDER:{$id}:REVEAL_READY:{$reopen}", 'REVEAL_READY', $subject, $r['qc_passed_at'],
                    'Quality check passed. Send the reveal.');
                break;
            case 'FULFILMENT.PENDING':
                $items[] = queue_item("ORDER:{$id}:MISSING_INFORMATION:fulfilment:{$reopen}", 'MISSING_INFORMATION', $subject, $r['qc_passed_at'] ?? $r['approved_at'],
                    'Quality check passed, but fulfilment is waiting on: ' . (fulfilment_review_pending($pdo, $id)
                        ? fulfilment_blocker_text('FULFILMENT_REVIEW')
                        : strtolower(str_replace('_', ' ', (string) ($r['fulfilment_pending_reason'] ?? 'something')))) . '.');
                break;
            case 'FULFILMENT.READY':
                $items[] = queue_item("ORDER:{$id}:FULFILMENT_READY:{$reopen}", 'FULFILMENT_READY', $subject, $r['fulfilment_ready_at'],
                    'Fulfilment approval required: customer payment verified, MCB quality check passed. Bella or Lewis authorises the supplier purchase on this order. Nothing is ordered automatically.');
                break;
            case 'FULFILMENT.AUTHORISED':
                $items[] = queue_item("ORDER:{$id}:SUPPLIER_ORDER_REQUIRED:{$reopen}", 'SUPPLIER_ORDER_REQUIRED', $subject, $r['supplier_purchase_authorised_at'],
                    'Authorised by ' . ucfirst(strtolower((string) $r['supplier_purchase_authorised_by'])) . '. Place the supplier order by hand, then record it here. Items may come from different partners and be sent separately.');
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

        // Overdue: still being created or checked, first time through, past
        // MCB's internal objective (never a customer promise) or the
        // configured made-to-order threshold.
        if (in_array($state, ['ORDER.PAID', 'CREATIVE.PENDING', 'CREATIVE.IN_PROGRESS', 'QUALITY_CHECK', 'REVEAL.READY'], true)
            && $reopen === 0) {
            $paidAt = strtotime($r['paid_at'] . ' UTC');
            $hours  = $data['creative_target_hours'][$r['package']] ?? null;
            $limit  = $hours !== null ? (int) $hours * 3600 : ($overdueDays > 0 ? $overdueDays * 86400 : null);
            if ($limit !== null && $paidAt + $limit < $now) {
                $items[] = queue_item("ORDER:{$id}:OVERDUE:0", 'OVERDUE', $subject, $r['paid_at'],
                    $hours !== null ? "Past MCB's internal {$hours}-hour objective." : "Paid more than {$overdueDays} days ago and not yet through the quality check.");
            }
        }
    }

    // ---- Artwork that needs a person ----------------------------------------
    foreach ($pdo->query(
        "SELECT a.id, a.order_id, a.template_id, a.status, a.exception_reason, a.updated_at, o.mcb_reference, o.fulfilment_type
           FROM order_artwork a JOIN orders o ON o.id = a.order_id
           LEFT JOIN order_production p ON p.order_id = o.id
          WHERE a.status IN ('TEMPLATE_REQUIRED','EXCEPTION') AND o.status = 'PAID'
            AND (p.stage IS NULL OR p.stage IN ('CREATIVE','QUALITY_CHECK','SONG_READY','AWAITING_APPROVAL','REVISION_REQUESTED'))
          ORDER BY a.id LIMIT 500"
    )->fetchAll() as $r) {
        $items[] = queue_item("ARTWORK:{$r['id']}:{$r['status']}", 'ARTWORK_EXCEPTION',
            ['type' => 'ORDER', 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'], 'workflow' => $r['fulfilment_type'], 'artwork_id' => (int) $r['id']],
            $r['updated_at'], $r['status'] === 'TEMPLATE_REQUIRED'
                ? 'No manufacturer template is on record for ' . strtolower(str_replace('_', ' ', (string) $r['template_id'])) . '. Prepare it by hand to the manufacturer\'s dieline; nothing is generated.'
                : 'Artwork exception (' . strtolower(str_replace('_', ' ', (string) $r['exception_reason'])) . '): review internally. No extra charge is made automatically.');
    }

    // ---- Creative Factory ----------------------------------------------------------
    foreach ($pdo->query(
        "SELECT j.order_id, o.mcb_reference, o.fulfilment_type,
                SUM(j.status = 'EXCEPTION') AS exceptions,
                SUM(j.status IN ('LYRICS_REQUIRED','LYRICS_QC_FAILED','LYRICS_REVIEW_REQUIRED','PLAN_REQUIRED','GENERATION_REQUIRED','FACT_REVIEW_REQUIRED','CREATIVE_QC_REQUIRED','MASTER_REQUIRED')) AS waiting,
                GROUP_CONCAT(DISTINCT j.status ORDER BY j.status) AS statuses, MAX(j.updated_at) AS since,
                (SELECT GROUP_CONCAT(DISTINCT CONCAT(a.album_qc_status, '/', a.capacity_status)) FROM creative_albums a WHERE a.order_id = j.order_id) AS albums
           FROM creative_jobs j JOIN orders o ON o.id = j.order_id
           LEFT JOIN order_production p ON p.order_id = o.id
          WHERE o.status = 'PAID' AND (p.stage IS NULL OR p.stage IN ('CREATIVE','QUALITY_CHECK'))
          GROUP BY j.order_id, o.mcb_reference, o.fulfilment_type
          LIMIT 500"
    )->fetchAll() as $r) {
        $subject = ['type' => 'ORDER', 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'], 'workflow' => $r['fulfilment_type']];
        $capacityException = str_contains((string) $r['albums'], 'AUDIO_CAPACITY_EXCEPTION');
        if ((int) $r['exceptions'] > 0 || $capacityException) {
            $items[] = queue_item("CREATIVE:{$r['order_id']}:EXCEPTION:" . substr(md5((string) $r['statuses'] . $r['albums']), 0, 8), 'CREATIVE_EXCEPTION', $subject, $r['since'],
                $capacityException ? 'The finished programme exceeds the verified record capacity. Nothing is shortened automatically.' : 'A song needs a person: retry limit reached or escalated in Creative QC.');
        } elseif ((int) $r['waiting'] > 0 || str_contains((string) $r['albums'], 'REVIEW_REQUIRED')) {
            $items[] = queue_item("CREATIVE:{$r['order_id']}:ACTION:" . substr(md5((string) $r['statuses'] . $r['albums']), 0, 8), 'CREATIVE_ACTION', $subject, $r['since'],
                'Creative Factory: ' . strtolower(str_replace('_', ' ', (string) $r['statuses'])) . '. Generation provider: deferred (manual generation available).');
        }
    }

    // ---- Production File Factory ------------------------------------------------------
    foreach ($pdo->query(
        "SELECT o.id, o.mcb_reference, o.fulfilment_type,
                (SELECT GROUP_CONCAT(DISTINCT j.status) FROM artwork_creative_jobs j WHERE j.order_id = o.id) AS art_jobs,
                (SELECT COUNT(*) FROM image_preparation_records r WHERE r.order_id = o.id AND r.status IN ('PREPARATION_REQUIRED','PREPARATION_IN_PROGRESS')) AS preparing,
                (SELECT COUNT(*) FROM image_preparation_records r WHERE r.order_id = o.id AND r.status IN ('UNUSABLE','EXCEPTION')) AS photo_exceptions,
                (SELECT COUNT(*) FROM production_render_jobs rj WHERE rj.order_id = o.id AND rj.status = 'FILE_QC_FAILED') AS file_failures,
                (SELECT COUNT(*) FROM production_render_jobs rj WHERE rj.order_id = o.id AND rj.status = 'RENDER_REQUIRED') AS renders,
                (SELECT m.status FROM manufacturing_packages m WHERE m.order_id = o.id AND m.status <> 'SUPERSEDED' ORDER BY m.version DESC LIMIT 1) AS package,
                (SELECT MAX(j.updated_at) FROM artwork_creative_jobs j WHERE j.order_id = o.id) AS since
           FROM orders o LEFT JOIN order_production p ON p.order_id = o.id
          WHERE o.status = 'PAID' AND o.fulfilment_type = 'PHYSICAL'
            AND (p.stage IS NULL OR p.stage IN ('CREATIVE','QUALITY_CHECK','QC_PASSED'))
            AND EXISTS (SELECT 1 FROM artwork_creative_jobs j WHERE j.order_id = o.id)
          LIMIT 500"
    )->fetchAll() as $r) {
        $subject = ['type' => 'ORDER', 'order_id' => (int) $r['id'], 'reference' => $r['mcb_reference'], 'workflow' => $r['fulfilment_type']];
        $fingerprint = substr(md5(json_encode($r)), 0, 8);
        $exception = str_contains((string) $r['art_jobs'], 'EXCEPTION') || (int) $r['photo_exceptions'] > 0 || (int) $r['file_failures'] > 0 || $r['package'] === 'MANUFACTURING_DATA_REQUIRED';
        if ($exception) {
            $what = [];
            if (str_contains((string) $r['art_jobs'], 'EXCEPTION') || (int) $r['photo_exceptions'] > 0) $what[] = 'artwork exception';
            if ((int) $r['file_failures'] > 0) $what[] = 'production file failed its checks';
            if ($r['package'] === 'MANUFACTURING_DATA_REQUIRED') $what[] = 'manufacturing data required from the manufacturer';
            $items[] = queue_item("PRODUCTION:{$r['id']}:EXCEPTION:{$fingerprint}", 'PRODUCTION_EXCEPTION', $subject, $r['since'], 'Production: ' . implode('; ', $what) . '.');
        } elseif ((int) $r['preparing'] > 0 || (int) $r['renders'] > 0 || preg_match('/AWAITING_ART_MASTER|VISUAL_QC_REQUIRED|REWORK_REQUIRED/', (string) $r['art_jobs']) === 1) {
            $items[] = queue_item("PRODUCTION:{$r['id']}:ACTION:{$fingerprint}", 'PRODUCTION_ACTION', $subject, $r['since'],
                'Production File Factory: ' . strtolower(str_replace('_', ' ', (string) $r['art_jobs'])) . ((int) $r['renders'] > 0 ? "; {$r['renders']} print file(s) to render" : '') . ((int) $r['preparing'] > 0 ? "; {$r['preparing']} photo(s) to prepare" : '') . '. Artwork provider: deferred (manual design).');
        }
    }

    // ---- Founder notifications that could not be delivered ---------------------
    foreach ($pdo->query(
        "SELECT id, notification_type, subject_reference, order_id, attempts, last_error, updated_at
           FROM founder_notifications WHERE status = 'ABANDONED' ORDER BY id LIMIT 200"
    )->fetchAll() as $r) {
        $items[] = queue_item("NOTIFICATION:{$r['id']}:ABANDONED", 'NOTIFICATION_FAILED',
            ['type' => 'NOTIFICATION', 'notification_id' => (int) $r['id'], 'order_id' => $r['order_id'] === null ? null : (int) $r['order_id'], 'reference' => $r['subject_reference']],
            $r['updated_at'], 'The ' . strtolower(str_replace('_', ' ', (string) $r['notification_type'])) . " founder notification was not delivered after {$r['attempts']} attempts. Check the notification bridge; requeue it once fixed.");
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
          WHERE s.status IN ('NEW','REVIEWING','WAITING_FOR_MCB','RESOLUTION_IN_PROGRESS') ORDER BY s.id LIMIT 500"
    )->fetchAll() as $r) {
        $kind = match ($r['kind']) {
            'DAMAGED_OR_FAULTY' => 'REPLACEMENT_REQUEST',
            'INCORRECT_DETAIL'  => 'INCORRECT_DETAIL',
            default             => 'SUPPORT',
        };
        $detail = match ($r['kind']) {
            'DAMAGED_OR_FAULTY' => (int) $r['priority_replacement_requested'] === 1
                ? 'Damaged or faulty item, Priority Replacement requested: ' . strtolower(str_replace('_', ' ', (string) $r['eligibility'])) . '.'
                : 'Damaged or faulty item reported.',
            'DELIVERY_PROBLEM' => 'Delivery problem reported.',
            'WRONG_ITEM' => 'Wrong item reported.',
            'MANUFACTURING_DEFECT' => 'Manufacturing problem reported.',
            'VIDEO_PROBLEM' => 'Video problem reported.',
            'DIGITAL_DELIVERY_PROBLEM' => 'Digital delivery problem reported.',
            'INCORRECT_DETAIL' => 'The customer reports something incorrect in their song or artwork. Check it against what they supplied: an MCB error is corrected (reopen: MCB_CORRECTION); a creative preference is not a revision.',
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

    // ---- Fulfilment Controller: open exceptions and stranded orders ------------------
    foreach ($pdo->query(
        "SELECT f.id, f.order_id, f.type, f.blocking, f.next_action, f.created_at, o.mcb_reference, o.fulfilment_type
           FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id
          WHERE f.status = 'OPEN' ORDER BY f.id LIMIT 500"
    )->fetchAll() as $r) {
        $items[] = queue_item("FULFILMENT_EXCEPTION:{$r['id']}", 'FULFILMENT_EXCEPTION',
            ['type' => 'ORDER', 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'], 'workflow' => $r['fulfilment_type'], 'exception_id' => (int) $r['id']],
            $r['created_at'], strtolower(str_replace('_', ' ', (string) $r['type'])) . ((int) $r['blocking'] === 1 ? ' (blocking)' : '') . '. ' . ($r['next_action'] ?? 'Open the order and decide the next step.'));
    }
    $healthText = [
        'READY_PACKAGE_WITHOUT_FOUNDER_NOTIFICATION' => 'A READY manufacturing package has no founder approval notification on record.',
        'SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH' => 'The supplier\'s expected dispatch date has passed with no parcel dispatched. Chase the partner.',
        'DISPATCHED_PARCEL_OVERDUE' => 'A parcel is past its estimated delivery date. Check tracking and keep the customer informed.',
        'DELIVERED_NOT_COMPLETED' => 'Delivered but not completed. Check for an open exception.',
    ];
    foreach (fulfilment_health($pdo) as $f) {
        if (isset($healthText[$f['check']])) {
            $items[] = queue_item("FULFILMENT_HEALTH:{$f['order_id']}:{$f['check']}", 'FULFILMENT_HEALTH',
                ['type' => 'ORDER', 'order_id' => $f['order_id'], 'reference' => $f['reference']], $f['since'], $healthText[$f['check']]);
        }
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
