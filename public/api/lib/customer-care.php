<?php
/**
 * MCB™ Customer Care & Recovery Controller.
 *
 * THE CUSTOMER BOUGHT FROM MCB. MCB OWNS THE EXPERIENCE.
 *
 * One canonical support case (order_service_requests), a private thread
 * (support_case_messages), prepared remedies (support_remedies) and refund
 * review records (refund_reviews). Policy data: api/data/customer-care.json.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS NEVER DOES
 * ─────────────────────────────────────────────────────────────────────────
 * - No refund is executed and no payment API is called. A founder decides; the
 *   refund is made outside MCB's system; staff record what was done.
 * - No replacement or supplier product is purchased. A replacement remedy that
 *   costs MCB money waits for Bella or Lewis (founder authorisation code).
 * - No discount, credit, free product or upgrade is offered automatically.
 * - No creative rework starts from a subjective preference, and nothing asks a
 *   customer to approve anything (Single Creative Authority).
 * - The customer never sees internal notes, system events, priority,
 *   classification, privacy review, sentiment, root cause, remedies, staff
 *   names, suppliers or economics.
 * - Message and evidence content never reach analytics, emails or order events.
 */

declare(strict_types=1);

require_once __DIR__ . '/payment-first.php';

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/lifecycle-messages.php';
require_once __DIR__ . '/command-centre.php';

function care_data(): array
{
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/customer-care.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new OperationsException('customer_care_policy_unavailable', 'The customer care policy is unavailable.', 503);
        }
    }
    return $data;
}

function care_case_types(): array
{
    return array_column(care_data()['case_types'], null, 'kind');
}

function care_remedy_policy(string $type): ?array
{
    return array_column(care_data()['remedies'], null, 'type')[$type] ?? null;
}

/** What the order contains, for which kinds a customer may choose. */
function care_order_shape(PDO $pdo, int $orderId): array
{
    $row = operations_order_row($pdo, $orderId);
    $videos = $pdo->prepare("SELECT COUNT(*) FROM video_entitlements WHERE order_id = :o AND status <> 'CANCELLED'");
    $videos->execute([':o' => $orderId]);
    return ['row' => $row, 'physical' => $row !== null && order_workflow($row) === 'PHYSICAL', 'video' => (int) $videos->fetchColumn() > 0];
}

function care_kind_applies(array $type, array $shape): bool
{
    return match ($type['applies']) {
        'PHYSICAL' => $shape['physical'],
        'VIDEO' => $shape['video'],
        default => true,
    };
}

/** Unix time N working days (Monday–Friday, UTC) after a UTC timestamp. */
function care_working_days_after(string $utc, int $days): int
{
    $t = strtotime($utc . ' UTC');
    $added = 0;
    while ($added < $days) {
        $t += 86400;
        if ((int) gmdate('N', $t) <= 5) {
            $added++;
        }
    }
    // A case opened at the weekend is due by the end of the next working day's equivalent time.
    while ((int) gmdate('N', $t) > 5) {
        $t += 86400;
    }
    return $t;
}

function care_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

function care_case_row(PDO $pdo, int $caseId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM order_service_requests WHERE id = :id' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([':id' => $caseId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** Whether MCB owes the next action on this case, and by when. */
function care_due(array $case): ?array
{
    if (!in_array($case['status'], care_data()['awaiting_mcb'], true)) {
        return null;
    }
    $since = (string) ($case['status_since'] ?? $case['created_at']);
    $due = care_working_days_after($since, (int) care_data()['service_target']['first_response_working_days']);
    return ['due_at' => gmdate('Y-m-d H:i:s', $due), 'overdue' => time() > $due];
}

/** An internal line in the thread. Never shown to the customer. */
function care_system_event(PDO $pdo, array $case, string $text): void
{
    $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, created_at) VALUES (:c, :o, 'SYSTEM_EVENT', :b, UTC_TIMESTAMP())")
        ->execute([':c' => (int) $case['id'], ':o' => (int) $case['order_id'], ':b' => mb_substr($text, 0, 1000)]);
}

/** Moves a case to a status, keeping the waiting-time accounting honest. */
function care_set_status(PDO $pdo, array $case, string $status, string $by): array
{
    if (!in_array($status, care_data()['statuses'], true)) {
        throw new OperationsException('invalid_status', 'That status is not recognised.', 422);
    }
    if ($case['status'] === $status) {
        return $case;
    }
    $elapsed = max(0, time() - (int) strtotime(((string) ($case['status_since'] ?? $case['created_at'])) . ' UTC'));
    $mcb = in_array($case['status'], care_data()['awaiting_mcb'], true) || $case['status'] === 'RESOLUTION_IN_PROGRESS' ? $elapsed : 0;
    $customer = $case['status'] === 'WAITING_FOR_CUSTOMER' ? $elapsed : 0;
    $cooling = (int) (mcb_setting('support.review_cooling_days', null) ?? care_data()['recovery_cooling_days']);
    $closing = in_array($status, ['RESOLVED', 'CLOSED'], true);
    $pdo->prepare(
        'UPDATE order_service_requests
            SET status = :s, status_since = UTC_TIMESTAMP(),
                waiting_mcb_seconds = waiting_mcb_seconds + :m, waiting_customer_seconds = waiting_customer_seconds + :c,
                resolved_at = IF(:resolved = 1, UTC_TIMESTAMP(), resolved_at), resolved_by = IF(:resolved2 = 1, :by, resolved_by),
                closed_at = IF(:closed = 1, UTC_TIMESTAMP(), closed_at),
                review_request_hold_until = IF(:hold = 1 AND kind <> \'QUESTION\', UTC_TIMESTAMP() + INTERVAL :days DAY, review_request_hold_until),
                last_activity_at = UTC_TIMESTAMP()
          WHERE id = :id'
    )->execute([':s' => $status, ':m' => $mcb, ':c' => $customer, ':resolved' => $status === 'RESOLVED' ? 1 : 0, ':resolved2' => $status === 'RESOLVED' ? 1 : 0,
        ':by' => $by, ':closed' => $status === 'CLOSED' ? 1 : 0, ':hold' => $closing ? 1 : 0, ':days' => max(0, $cooling), ':id' => (int) $case['id']]);
    care_system_event($pdo, $case, "Status {$case['status']} → {$status} ({$by})");
    if ($status === 'RESOLVED') {
        record_order_event($pdo, (int) $case['order_id'], 'SUPPORT.CASE_RESOLVED', ['case_id' => (int) $case['id'], 'by' => $by]);
    }
    return care_case_row($pdo, (int) $case['id']);
}

/**
 * Opens a support case. Fields: unit_id, issue, priority_replacement,
 * eligibility, other_customer_details, origin, shipment_id, opened_by, ip_hash.
 * The customer's words stay in the case (description); nothing is copied into
 * events, emails or notifications.
 */
function care_open_case(PDO $pdo, int $orderId, string $kind, string $description, array $fields = []): int
{
    $type = care_case_types()[$kind] ?? null;
    if ($type === null) {
        throw new OperationsException('invalid_kind', 'Please choose what this is about.', 422);
    }
    $shape = care_order_shape($pdo, $orderId);
    $privacy = ($fields['other_customer_details'] ?? false) === true;
    $priority = $privacy ? 'URGENT' : $type['priority'];
    $videoJob = null;
    if ($kind === 'VIDEO_PROBLEM') {
        $v = $pdo->prepare('SELECT id FROM video_jobs WHERE order_id = :o ORDER BY id LIMIT 1');
        $v->execute([':o' => $orderId]);
        $videoJob = ($id = $v->fetchColumn()) === false ? null : (int) $id;
    }
    $issue = in_array($fields['issue'] ?? null, array_column(care_data()['digital_issues'], 'issue'), true) ? $fields['issue'] : null;
    $origin = ($fields['origin'] ?? 'CUSTOMER') === 'MCB' ? 'MCB' : 'CUSTOMER';
    $pdo->prepare(
        'INSERT INTO order_service_requests
            (order_id, unit_id, video_job_id, shipment_id, kind, origin, priority, issue, privacy_review, priority_replacement_requested, eligibility,
             description, status, status_since, last_customer_activity_at, last_activity_at, ip_hash, created_at)
         VALUES (:o, :unit, :vj, :sh, :kind, :origin, :prio, :issue, :privacy, :pr, :elig, :descr, \'NEW\', UTC_TIMESTAMP(), :lca, UTC_TIMESTAMP(), :ip, UTC_TIMESTAMP())'
    )->execute([
        ':o' => $orderId, ':unit' => $fields['unit_id'] ?? null, ':vj' => $videoJob, ':sh' => $fields['shipment_id'] ?? null, ':kind' => $kind, ':origin' => $origin,
        ':prio' => $priority, ':issue' => $issue, ':privacy' => $privacy ? 'PRIVACY_REVIEW_REQUIRED' : 'NOT_REQUIRED',
        ':pr' => ($fields['priority_replacement'] ?? false) ? 1 : 0, ':elig' => $fields['eligibility'] ?? 'NOT_APPLICABLE', ':descr' => $description,
        ':lca' => $origin === 'CUSTOMER' ? care_now() : null, ':ip' => $fields['ip_hash'] ?? null,
    ]);
    $caseId = (int) $pdo->lastInsertId();
    $case = care_case_row($pdo, $caseId);
    record_order_event($pdo, $orderId, 'SUPPORT.CASE_OPENED', ['case_id' => $caseId, 'kind' => $kind, 'origin' => $origin, 'priority' => $priority]);
    // Kept for existing consumers of the service-request event.
    record_order_event($pdo, $orderId, 'SERVICE_REQUEST.RECEIVED', ['kind' => $kind, 'priority_replacement' => (bool) ($fields['priority_replacement'] ?? false), 'eligibility' => $fields['eligibility'] ?? 'NOT_APPLICABLE']);
    $plain = static fn (string $code): string => strtolower(str_replace('_', ' ', $code));
    care_system_event($pdo, $case, 'Case opened by ' . ($origin === 'CUSTOMER' ? 'the customer' : $plain($origin)) . ': ' . $plain($kind) . ', ' . $plain($priority) . ' priority');

    if ($privacy) {
        care_flag_privacy($pdo, $case, 'CUSTOMER');
    } elseif ($kind !== 'QUESTION' && $kind !== 'OTHER' && $origin === 'CUSTOMER') {
        // A genuine report interrupts the Founders; a plain question waits in the queue.
        notify_founders_about_order($pdo, 'CUSTOMER_SUPPORT_EXCEPTION', $orderId, "support:{$orderId}:{$caseId}", ['reason' => $kind]);
    }

    // A physical problem is also a structured fulfilment case. One occurrence, one exception: an
    // open exception of the same type with no case behind it is linked rather than duplicated.
    $exceptionType = $shape['physical'] ? match ($kind) {
        'DAMAGED_OR_FAULTY' => 'PARCEL_DAMAGED', 'WRONG_ITEM' => 'WRONG_ITEM', 'MANUFACTURING_DEFECT' => 'MANUFACTURING_DEFECT',
        'DELIVERY_PROBLEM' => 'PARCEL_DELAYED', 'INCORRECT_DETAIL' => 'OTHER_FULFILMENT_EXCEPTION', default => null,
    } : null;
    if ($exceptionType !== null) {
        care_link_or_raise_exception($pdo, $orderId, $caseId, $exceptionType, $origin);
    }
    return $caseId;
}

/** Links an existing open exception of the same kind (with no case yet), or raises one for this case. */
function care_link_or_raise_exception(PDO $pdo, int $orderId, int $caseId, string $type, string $by): ?int
{
    $related = match ($type) {
        'PARCEL_DELAYED' => ['PARCEL_DELAYED', 'TRACKING_STALLED', 'CUSTOMS_EXCEPTION', 'PARCEL_LOST', 'PARTIAL_DELIVERY', 'SUPPLIER_CANCELLED'],
        default => [$type],
    };
    $in = "'" . implode("','", $related) . "'";
    $existing = $pdo->prepare("SELECT id FROM fulfilment_exceptions WHERE order_id = :o AND status = 'OPEN' AND service_request_id IS NULL AND type IN ({$in}) ORDER BY id LIMIT 1 FOR UPDATE");
    $existing->execute([':o' => $orderId]);
    if (($id = $existing->fetchColumn()) !== false) {
        $pdo->prepare('UPDATE fulfilment_exceptions SET service_request_id = :c WHERE id = :id')->execute([':c' => $caseId, ':id' => (int) $id]);
        care_system_event($pdo, care_case_row($pdo, $caseId), "Linked to open fulfilment exception #{$id}");
        return (int) $id;
    }
    return raise_fulfilment_exception($pdo, $orderId, $type, ['service_request_id' => $caseId, 'blocking' => false,
        'next_action' => 'Contact the customer, review any evidence they add, and arrange the remedy with the production partner.'], $by === 'MCB' ? 'STAFF' : 'CUSTOMER', "support-case:{$caseId}", false);
}

/** Possible cross-customer incident: urgent, founders told, no legal conclusion drawn. */
function care_flag_privacy(PDO $pdo, array $case, string $by): void
{
    $pdo->prepare("UPDATE order_service_requests SET privacy_review = 'PRIVACY_REVIEW_REQUIRED', priority = 'URGENT', privacy_reviewed_by = NULL, privacy_reviewed_at = NULL WHERE id = :id")
        ->execute([':id' => (int) $case['id']]);
    care_system_event($pdo, $case, "Privacy review required ({$by})");
    record_order_event($pdo, (int) $case['order_id'], 'SUPPORT.PRIVACY_REVIEW_REQUIRED', ['case_id' => (int) $case['id']], "support-privacy:{$case['id']}:" . gmdate('YmdHis'));
    notify_founders_about_order($pdo, 'CUSTOMER_SUPPORT_EXCEPTION', (int) $case['order_id'], "support-privacy:{$case['id']}", ['reason' => 'PRIVACY_REVIEW_REQUIRED']);
}

/* ------------------------------------------------------------------ */
/* The customer's side                                                 */
/* ------------------------------------------------------------------ */

/** Everything the customer may see about their cases. Nothing internal. Cases stay visible after the order is complete. */
function care_customer_cases(PDO $pdo, int $orderId): array
{
    $cases = $pdo->prepare('SELECT id, kind, status, description, customer_summary, satisfaction, created_at FROM order_service_requests WHERE order_id = :o ORDER BY id DESC');
    $cases->execute([':o' => $orderId]);
    $messages = $pdo->prepare("SELECT case_id, kind, body, created_at FROM support_case_messages WHERE order_id = :o AND kind IN ('CUSTOMER_MESSAGE','MCB_RESPONSE') ORDER BY id");
    $messages->execute([':o' => $orderId]);
    $thread = [];
    foreach ($messages->fetchAll() as $m) {
        $thread[(int) $m['case_id']][] = ['from' => $m['kind'] === 'MCB_RESPONSE' ? 'MCB' : 'YOU', 'body' => $m['body'], 'at' => $m['created_at']];
    }
    $types = care_case_types();
    $words = care_data()['customer_status'];
    return array_map(static function (array $c) use ($thread, $types, $words): array {
        $items = array_merge([['from' => 'YOU', 'body' => $c['description'], 'at' => $c['created_at']]], $thread[(int) $c['id']] ?? []);
        $latest = null;
        foreach (array_reverse($items) as $i) {
            if ($i['from'] === 'MCB') {
                $latest = $i;
                break;
            }
        }
        return [
            'case_id' => (int) $c['id'],
            'type' => $types[$c['kind']]['label'] ?? 'Your message',
            'opened_on' => substr((string) $c['created_at'], 0, 10),
            'status_label' => $words[$c['status']]['label'],
            'next_step' => $words[$c['status']]['next'],
            'needs_you' => $c['status'] === 'WAITING_FOR_CUSTOMER',
            'summary' => $c['customer_summary'],
            'latest_response' => $latest,
            'thread' => $items,
            'can_add_evidence' => $c['kind'] !== 'QUESTION',
            'satisfaction' => [
                'question' => care_data()['satisfaction_question'],
                'asked' => $c['status'] === 'RESOLVED' && $c['satisfaction'] === null,
                'answer' => $c['satisfaction'],
            ],
        ];
    }, $cases->fetchAll());
}

/** The kinds this order's customer may choose, in their words. */
function care_customer_kinds(PDO $pdo, int $orderId): array
{
    $shape = care_order_shape($pdo, $orderId);
    return array_values(array_map(static fn (array $t): array => ['kind' => $t['kind'], 'label' => $t['label']],
        array_filter(care_data()['case_types'], static fn (array $t): bool => care_kind_applies($t, $shape))));
}

function care_customer_case(PDO $pdo, int $orderId, mixed $caseId, bool $lock = false): array
{
    $case = is_int($caseId) || (is_string($caseId) && ctype_digit($caseId)) ? care_case_row($pdo, (int) $caseId, $lock) : null;
    // Another order's case is simply not found: no hint that it exists.
    if ($case === null || (int) $case['order_id'] !== $orderId) {
        throw new OperationsException('case_not_found', 'We could not find that conversation on your order.', 404);
    }
    return $case;
}

/** The customer writes on a case. A resolved or closed case reopens for MCB (a repeat contact). */
function care_customer_message(PDO $pdo, int $orderId, mixed $caseId, string $body, ?string $ipHash): void
{
    $case = care_customer_case($pdo, $orderId, $caseId, true);
    $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, ip_hash, created_at) VALUES (:c, :o, 'CUSTOMER_MESSAGE', :b, :ip, UTC_TIMESTAMP())")
        ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => $body, ':ip' => $ipHash]);
    $repeat = in_array($case['status'], ['RESOLVED', 'CLOSED'], true) ? 1 : 0;
    $pdo->prepare('UPDATE order_service_requests SET last_customer_activity_at = UTC_TIMESTAMP(), last_activity_at = UTC_TIMESTAMP(), repeat_contacts = repeat_contacts + :r WHERE id = :id')
        ->execute([':r' => $repeat, ':id' => (int) $case['id']]);
    if (!in_array($case['status'], ['NEW', 'REVIEWING', 'WAITING_FOR_MCB'], true)) {
        care_set_status($pdo, care_case_row($pdo, (int) $case['id']), 'WAITING_FOR_MCB', 'CUSTOMER');
    }
    record_order_event($pdo, $orderId, 'SUPPORT.CUSTOMER_MESSAGE', ['case_id' => (int) $case['id'], 'repeat_contact' => $repeat === 1]);
}

/** "Did we resolve this for you?" Once, optional, on a resolved case. Never incentivised or published. */
function care_customer_satisfaction(PDO $pdo, int $orderId, mixed $caseId, mixed $answer): void
{
    $case = care_customer_case($pdo, $orderId, $caseId, true);
    if (!in_array($answer, ['YES', 'NO'], true)) {
        throw new OperationsException('validation_failed', 'Please choose yes or no.', 422);
    }
    if ($case['status'] !== 'RESOLVED' || $case['satisfaction'] !== null) {
        throw new OperationsException('not_asked', 'Thank you — we already have your answer.', 409);
    }
    $pdo->prepare('UPDATE order_service_requests SET satisfaction = :a, satisfaction_at = UTC_TIMESTAMP() WHERE id = :id')->execute([':a' => $answer, ':id' => (int) $case['id']]);
    care_system_event($pdo, $case, "Customer answered: resolved? {$answer}");
    record_order_event($pdo, $orderId, 'SUPPORT.SATISFACTION_RECORDED', ['case_id' => (int) $case['id'], 'answer' => $answer]);
}

/* ------------------------------------------------------------------ */
/* The staff console                                                    */
/* ------------------------------------------------------------------ */

const CARE_FILTERS = ['new', 'needs_mcb', 'waiting_customer', 'urgent', 'resolved', 'all'];

/** Open remedies and refund decisions per case, for next actions. */
function care_pending_decisions(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT case_id, type, status FROM support_remedies WHERE status IN ('PROPOSED','FOUNDER_APPROVAL_REQUIRED','AUTHORISED','IN_PROGRESS')")->fetchAll() as $r) {
        $out[(int) $r['case_id']][] = $r['status'];
    }
    return $out;
}

function care_next_action(array $c, array $remedyStatuses): string
{
    if ($c['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED') {
        return 'Complete the privacy review';
    }
    return match ($c['status']) {
        'NEW' => 'Review and reply',
        'REVIEWING' => 'Finish reviewing and reply',
        'WAITING_FOR_MCB' => 'Reply to the customer',
        'WAITING_FOR_CUSTOMER' => 'Waiting for the customer',
        'RESOLUTION_IN_PROGRESS' => in_array('FOUNDER_APPROVAL_REQUIRED', $remedyStatuses, true) ? 'Waiting for a founder decision'
            : (in_array('AUTHORISED', $remedyStatuses, true) ? 'Carry out the authorised remedy' : 'Complete the resolution'),
        default => 'No action needed',
    };
}

/** Case cards for the console. Safe names only; no message text. */
function care_list(PDO $pdo, string $filter): array
{
    $open = "'" . implode("','", care_data()['open_statuses']) . "'";
    $where = match ($filter) {
        'new' => "s.status = 'NEW'",
        'needs_mcb' => "s.status IN ('NEW','REVIEWING','WAITING_FOR_MCB','RESOLUTION_IN_PROGRESS')",
        'waiting_customer' => "s.status = 'WAITING_FOR_CUSTOMER'",
        'urgent' => "s.status IN ({$open}) AND (s.priority = 'URGENT' OR s.privacy_review = 'PRIVACY_REVIEW_REQUIRED')",
        'resolved' => "s.status IN ('RESOLVED','CLOSED')",
        default => '1=1',
    };
    $rows = $pdo->query(
        "SELECT s.*, o.mcb_reference, c.name AS customer_name,
                (SELECT GROUP_CONCAT(CONCAT(i.quantity, ' × ', i.item_name) ORDER BY i.id SEPARATOR ', ') FROM order_items i WHERE i.order_id = o.id) AS product
           FROM order_service_requests s JOIN orders o ON o.id = s.order_id JOIN customers c ON c.id = o.customer_id
          WHERE {$where}
          ORDER BY FIELD(s.priority, 'URGENT', 'IMPORTANT', 'NORMAL'), s.status_since, s.id LIMIT 500"
    )->fetchAll();
    $pending = care_pending_decisions($pdo);
    $types = care_case_types();
    $counts = [];
    foreach (CARE_FILTERS as $f) {
        $counts[$f] = 0;
    }
    foreach ($pdo->query("SELECT status, priority, privacy_review FROM order_service_requests")->fetchAll() as $r) {
        $isOpen = in_array($r['status'], care_data()['open_statuses'], true);
        $counts['all']++;
        $counts['new'] += $r['status'] === 'NEW' ? 1 : 0;
        $counts['needs_mcb'] += in_array($r['status'], ['NEW', 'REVIEWING', 'WAITING_FOR_MCB', 'RESOLUTION_IN_PROGRESS'], true) ? 1 : 0;
        $counts['waiting_customer'] += $r['status'] === 'WAITING_FOR_CUSTOMER' ? 1 : 0;
        $counts['urgent'] += $isOpen && ($r['priority'] === 'URGENT' || $r['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED') ? 1 : 0;
        $counts['resolved'] += in_array($r['status'], ['RESOLVED', 'CLOSED'], true) ? 1 : 0;
    }
    return [
        'filter' => in_array($filter, CARE_FILTERS, true) ? $filter : 'all',
        'counts' => $counts,
        'cases' => array_map(static fn (array $c): array => [
            'case_id' => (int) $c['id'],
            'order_id' => (int) $c['order_id'],
            'reference' => $c['mcb_reference'],
            'customer' => cc_safe_name($c['customer_name']),
            'product' => $c['product'],
            'type' => $types[$c['kind']]['label'] ?? $c['kind'],
            'kind' => $c['kind'],
            'status' => $c['status'],
            'priority' => $c['priority'],
            'privacy_review' => $c['privacy_review'],
            'opened_at' => $c['created_at'],
            'status_since' => $c['status_since'],
            'overdue' => (care_due($c)['overdue'] ?? false),
            'next_action' => care_next_action($c, $pending[(int) $c['id']] ?? []),
        ], $rows),
    ];
}

function care_money_facts(PDO $pdo, int $orderId): array
{
    $o = $pdo->prepare('SELECT total_minor, currency, status, stripe_livemode FROM orders WHERE id = :o');
    $o->execute([':o' => $orderId]);
    $order = $o->fetch();
    $r = $pdo->prepare("SELECT COALESCE(SUM(IF(status = 'RECORDED', amount_minor, 0)), 0) AS recorded,
                               COALESCE(SUM(IF(status IN ('REFUND_REVIEW_REQUIRED','FOUNDER_DECISION_REQUIRED','AUTHORISED'), amount_minor, 0)), 0) AS pending
                          FROM refund_reviews WHERE order_id = :o");
    $r->execute([':o' => $orderId]);
    $sums = $r->fetch();
    $gross = (int) $order['total_minor'];
    return ['gross_paid_minor' => $gross, 'currency' => $order['currency'], 'refunds_recorded_minor' => (int) $sums['recorded'],
        'refunds_pending_minor' => (int) $sums['pending'], 'net_paid_minor' => $gross - (int) $sums['recorded'],
        'fully_refunded' => $gross > 0 && (int) $sums['recorded'] >= $gross, 'test_payment' => (int) $order['stripe_livemode'] !== 1, 'payment_status' => $order['status']];
}

/** One case for staff: what they need to resolve it, with links to protected records rather than copies. Access is audited. */
function care_staff_case(PDO $pdo, int $caseId, string $staff): ?array
{
    $case = care_case_row($pdo, $caseId);
    if ($case === null) {
        return null;
    }
    $orderId = (int) $case['order_id'];
    $all = static function (string $sql, array $params) use ($pdo): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    };
    $meta = $all("SELECT o.mcb_reference, o.fulfilment_type, c.name, c.email,
                         (SELECT GROUP_CONCAT(CONCAT(i.quantity, ' × ', i.item_name) ORDER BY i.id SEPARATOR ', ') FROM order_items i WHERE i.order_id = o.id) AS product
                    FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = :o", [':o' => $orderId])[0];
    $row = operations_order_row($pdo, $orderId);
    record_order_event($pdo, $orderId, 'SUPPORT.CASE_VIEWED', ['case_id' => $caseId, 'by' => $staff]);
    $types = care_case_types();
    $state = $row === null ? null : operational_state($row);
    $messages = $all('SELECT id, kind, body, author, template_key, email_outcome, created_at FROM support_case_messages WHERE case_id = :c ORDER BY id', [':c' => $caseId]);
    $country = $all('SELECT country FROM delivery_addresses WHERE order_id = :o', [':o' => $orderId])[0]['country'] ?? null;

    return [
        'case' => [
            'case_id' => $caseId, 'kind' => $case['kind'], 'type' => $types[$case['kind']]['label'] ?? $case['kind'], 'origin' => $case['origin'],
            'status' => $case['status'], 'priority' => $case['priority'], 'issue' => $case['issue'], 'classification' => $case['classification'],
            'privacy_review' => $case['privacy_review'], 'privacy_reviewed_by' => $case['privacy_reviewed_by'], 'assigned_staff' => $case['assigned_staff'],
            'sentiment' => $case['sentiment'], 'root_cause' => $case['root_cause'], 'recovery_outcome' => $case['recovery_outcome'], 'resolution_note' => $case['resolution_note'],
            'customer_summary' => $case['customer_summary'], 'satisfaction' => $case['satisfaction'], 'repeat_contacts' => (int) $case['repeat_contacts'],
            'priority_replacement' => ['requested' => (int) $case['priority_replacement_requested'] === 1, 'eligibility' => $case['eligibility']],
            'opened_at' => $case['created_at'], 'status_since' => $case['status_since'], 'first_response_at' => $case['first_response_at'],
            'resolved_at' => $case['resolved_at'], 'due' => care_due($case),
            'timings' => ['waiting_mcb_seconds' => (int) $case['waiting_mcb_seconds'], 'waiting_customer_seconds' => (int) $case['waiting_customer_seconds']],
        ],
        'order' => [
            'order_id' => $orderId, 'reference' => $meta['mcb_reference'], 'product' => $meta['product'], 'workflow' => $row === null ? null : order_workflow($row),
            'stage' => $state === null ? null : (CC_STAGE_LABELS[CC_FOUNDER_STAGES[$state] ?? 'NEW'] ?? null),
            'destination_country' => $country,
        ],
        // Enough to reply and recognise the customer; no address, story, photograph or song copied into the case.
        'customer' => ['name' => $meta['name'], 'email' => $meta['email']],
        'thread' => array_merge(
            [['id' => 0, 'kind' => $case['origin'] === 'CUSTOMER' ? 'CUSTOMER_MESSAGE' : 'INTERNAL_NOTE', 'body' => $case['description'], 'author' => $case['origin'] === 'CUSTOMER' ? null : 'MCB', 'template_key' => null, 'email_outcome' => null, 'created_at' => $case['created_at']]],
            array_map(static fn (array $m): array => ['id' => (int) $m['id']] + $m, $messages)
        ),
        'linked' => [
            'creative' => array_map(static fn (array $j): array => ['job_id' => (int) $j['id'], 'song' => (int) $j['track_number'], 'status' => $j['status'], 'finished' => $j['current_master_id'] !== null],
                $all('SELECT id, track_number, status, current_master_id FROM creative_jobs WHERE order_id = :o ORDER BY track_number', [':o' => $orderId])),
            'videos' => array_map(static fn (array $v): array => ['video_job_id' => (int) $v['id'], 'status' => $v['status'], 'rework_count' => (int) $v['rework_count'], 'reservation' => $v['reservation']],
                $all('SELECT j.id, j.status, j.rework_count, r.status AS reservation FROM video_jobs j LEFT JOIN video_capacity_reservations r ON r.entitlement_id = j.entitlement_id WHERE j.order_id = :o ORDER BY j.id', [':o' => $orderId])),
            'shipments' => array_map(static fn (array $s): array => ['shipment_id' => (int) $s['id'], 'sequence' => (int) $s['sequence'], 'state' => $s['state'], 'carrier' => $s['carrier'], 'tracking_reference' => $s['tracking_reference']],
                $all('SELECT id, sequence, state, carrier, tracking_reference FROM shipments WHERE order_id = :o ORDER BY sequence', [':o' => $orderId])),
            'exceptions' => array_map(static fn (array $x): array => ['exception_id' => (int) $x['id'], 'type' => $x['type'], 'status' => $x['status'], 'blocking' => (int) $x['blocking'] === 1, 'linked_to_this_case' => (int) ($x['service_request_id'] ?? 0) === $caseId],
                $all('SELECT id, type, status, blocking, service_request_id FROM fulfilment_exceptions WHERE order_id = :o ORDER BY id', [':o' => $orderId])),
            'other_cases' => array_map(static fn (array $o): array => ['case_id' => (int) $o['id'], 'type' => $types[$o['kind']]['label'] ?? $o['kind'], 'status' => $o['status']],
                $all('SELECT id, kind, status FROM order_service_requests WHERE order_id = :o AND id <> :c ORDER BY id', [':o' => $orderId, ':c' => $caseId])),
        ],
        'evidence' => array_map(static fn (array $e): array => ['evidence_id' => (int) $e['id'], 'kind' => $e['kind'], 'has_file' => $e['stored_name'] !== null, 'mime_type' => $e['mime_type'], 'bytes' => $e['byte_size'] === null ? null : (int) $e['byte_size'], 'reference' => $e['reference_text'], 'created_at' => $e['created_at']],
            $all('SELECT id, kind, stored_name, mime_type, byte_size, reference_text, created_at FROM support_evidence WHERE service_request_id = :c ORDER BY id', [':c' => $caseId])),
        'remedies' => array_map('care_remedy_view', $all('SELECT * FROM support_remedies WHERE case_id = :c ORDER BY id', [':c' => $caseId])),
        'refunds' => array_map('care_refund_view', $all('SELECT * FROM refund_reviews WHERE order_id = :o ORDER BY id', [':o' => $orderId])),
        'money' => care_money_facts($pdo, $orderId),
        'templates' => care_templates_for($meta['name'], (string) $meta['mcb_reference']),
        'policy' => [
            'classification_guidance' => care_data()['classification_guidance'],
            'remedies' => care_data()['remedies'],
            'root_causes' => care_data()['root_causes'],
            'recovery_outcomes' => care_data()['recovery_outcomes'],
            'statuses' => care_data()['statuses'],
            'sentiments' => care_data()['sentiments'],
            'video_capacity_bases' => care_data()['video_capacity_bases'],
            'video_capacity_note' => 'A remake or replacement film never takes another customer\'s production space. How much of the platform allowance it uses is not accounted: PENDING_EXTERNAL_VERIFICATION.',
        ],
    ];
}

function care_remedy_view(array $r): array
{
    return ['remedy_id' => (int) $r['id'], 'type' => $r['type'], 'status' => $r['status'], 'costs_mcb' => $r['costs_mcb'], 'capacity_basis' => $r['capacity_basis'],
        'video_job_id' => $r['video_job_id'] === null ? null : (int) $r['video_job_id'], 'supplier_order_pack_id' => $r['supplier_order_pack_id'] === null ? null : (int) $r['supplier_order_pack_id'],
        'refund_review_id' => $r['refund_review_id'] === null ? null : (int) $r['refund_review_id'], 'note' => $r['note'], 'proposed_by' => $r['proposed_by'],
        'authorised_by' => $r['authorised_by'], 'decided_at' => $r['decided_at'], 'decision_note' => $r['decision_note'], 'completed_by' => $r['completed_by'], 'completed_at' => $r['completed_at'], 'created_at' => $r['created_at']];
}

function care_refund_view(array $r): array
{
    return ['refund_id' => (int) $r['id'], 'case_id' => $r['case_id'] === null ? null : (int) $r['case_id'], 'status' => $r['status'], 'refund_type' => $r['refund_type'],
        'currency' => $r['currency'], 'gross_paid_minor' => (int) $r['gross_paid_minor'], 'amount_minor' => (int) $r['amount_minor'], 'reason' => $r['reason'],
        'requested_by' => $r['requested_by'], 'founder' => $r['founder'], 'decided_at' => $r['decided_at'], 'decision_note' => $r['decision_note'],
        'recorded_by' => $r['recorded_by'], 'recorded_at' => $r['recorded_at'], 'refunded_on' => $r['refunded_on'], 'external_reference' => $r['external_reference'], 'created_at' => $r['created_at']];
}

function care_templates_for(string $name, string $reference): array
{
    $first = lifecycle_first_name($name);
    return array_map(static fn (array $t): array => ['key' => $t['key'], 'title' => $t['title'], 'body' => str_replace(['{firstName}', '{reference}'], [$first, $reference], $t['body'])], care_data()['templates']);
}

/* ------------------------------------------------------------------ */
/* Staff actions                                                        */
/* ------------------------------------------------------------------ */

const CARE_ACTIONS = [
    'RESPOND', 'ADD_INTERNAL_NOTE', 'SET_STATUS', 'SET_PRIORITY', 'ASSIGN', 'SET_SENTIMENT', 'SET_CUSTOMER_SUMMARY', 'CLASSIFY',
    'FLAG_PRIVACY_REVIEW', 'COMPLETE_PRIVACY_REVIEW', 'RESOLVE', 'CLOSE', 'REISSUE_ORDER_LINK',
    'PROPOSE_REMEDY', 'DECIDE_REMEDY', 'START_REMEDY', 'COMPLETE_REMEDY', 'CANCEL_REMEDY',
    'REQUEST_REFUND_REVIEW', 'SUBMIT_REFUND_FOR_DECISION', 'DECIDE_REFUND', 'RECORD_REFUND',
    'OPEN_CASE_FROM_EXCEPTION',
];

/**
 * One staff action, in a locked transaction. Founder codes are checked (and a
 * refusal audited) before anything is locked, with the same authorisation as
 * a supplier purchase.
 */
function care_staff_action(string $action, array $in, string $staff): array
{
    if (!in_array($action, CARE_ACTIONS, true)) {
        throw new OperationsException('unknown_action', 'That action is not recognised.', 422);
    }
    $pdo = db();
    $caseId = is_int($in['case_id'] ?? null) ? $in['case_id'] : 0;
    $orderForCode = null;
    if (in_array($action, ['DECIDE_REMEDY', 'DECIDE_REFUND'], true)) {
        [$table, $key] = $action === 'DECIDE_REMEDY' ? ['support_remedies', 'remedy_id'] : ['refund_reviews', 'refund_id'];
        $stmt = $pdo->prepare("SELECT order_id FROM {$table} WHERE id = :id");
        $stmt->execute([':id' => is_int($in[$key] ?? null) ? $in[$key] : 0]);
        $orderForCode = ($o = $stmt->fetchColumn()) === false ? null : (int) $o;
        if ($orderForCode === null) {
            throw new OperationsException('not_found', 'No such decision is waiting.', 404);
        }
    }
    $founder = $orderForCode === null ? null : check_founder_authorisation_request($orderForCode, $in, $staff,
        $action === 'DECIDE_REFUND' ? 'a refund decision' : 'this remedy', $action === 'DECIDE_REFUND' ? 'this refund decision' : 'this remedy decision');

    $result = ['outcome' => 'done', 'messages' => [], 'link' => null, 'warning' => null];
    $out = db_transaction(function (PDO $pdo) use ($action, $in, $staff, $caseId, $founder, &$result): array {
        if ($action === 'OPEN_CASE_FROM_EXCEPTION') {
            return care_open_from_exception($pdo, $in, $staff) + $result;
        }
        $case = care_case_row($pdo, $caseId, true);
        if ($case === null) {
            throw new OperationsException('case_not_found', 'No such case.', 404);
        }
        $orderId = (int) $case['order_id'];
        $text = static fn (string $field, int $max, string $message): string => operations_text($in[$field] ?? null, $max) ?? throw new OperationsException('invalid_' . $field, $message, 422);
        $touch = static function () use ($pdo, $case): void {
            $pdo->prepare('UPDATE order_service_requests SET last_mcb_activity_at = UTC_TIMESTAMP(), last_activity_at = UTC_TIMESTAMP() WHERE id = :id')->execute([':id' => (int) $case['id']]);
        };

        switch ($action) {
            case 'RESPOND':
                $body = $text('body', 5000, 'Write the reply to the customer.');
                if (looks_like_card_number($body)) {
                    throw new OperationsException('payment_credentials_refused', 'Never send card or payment details.', 422);
                }
                $template = operations_line($in['template_key'] ?? null, 60);
                if ($template !== null && !in_array($template, array_column(care_data()['templates'], 'key'), true)) {
                    throw new OperationsException('invalid_template', 'That template is not recognised.', 422);
                }
                $next = (string) ($in['next_status'] ?? 'WAITING_FOR_CUSTOMER');
                if (!in_array($next, ['REVIEWING', 'WAITING_FOR_CUSTOMER', 'RESOLUTION_IN_PROGRESS', 'RESOLVED'], true)) {
                    throw new OperationsException('invalid_status', 'After replying, the case is waiting for the customer, being resolved, resolved, or still being reviewed.', 422);
                }
                if ($next === 'RESOLVED') {
                    care_require_resolution($in, $case);
                }
                $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, author, template_key, created_at) VALUES (:c, :o, 'MCB_RESPONSE', :b, :a, :t, UTC_TIMESTAMP())")
                    ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => $body, ':a' => $staff, ':t' => $template]);
                $messageId = (int) $pdo->lastInsertId();
                $pdo->prepare('UPDATE order_service_requests SET first_response_at = COALESCE(first_response_at, UTC_TIMESTAMP()), last_mcb_activity_at = UTC_TIMESTAMP(), last_activity_at = UTC_TIMESTAMP() WHERE id = :id')
                    ->execute([':id' => (int) $case['id']]);
                $case = care_case_row($pdo, (int) $case['id']);
                if ($next === 'RESOLVED') {
                    care_apply_resolution($pdo, $case, $in, $staff);
                } else {
                    care_set_status($pdo, $case, $next, $staff);
                }
                record_order_event($pdo, $orderId, 'SUPPORT.RESPONSE_SENT', ['case_id' => (int) $case['id'], 'by' => $staff, 'template' => $template]);
                if (($in['send_email'] ?? true) !== false) {
                    $result['messages'][] = ['SUPPORT_RESPONSE', 'support-' . $messageId, $messageId];
                }
                $result['message_id'] = $messageId;
                break;

            case 'ADD_INTERNAL_NOTE':
                $body = $text('body', 5000, 'Write the note.');
                $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, author, created_at) VALUES (:c, :o, 'INTERNAL_NOTE', :b, :a, UTC_TIMESTAMP())")
                    ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => $body, ':a' => $staff]);
                $touch();
                break;

            case 'SET_STATUS':
                $status = (string) ($in['status'] ?? '');
                if (in_array($status, ['RESOLVED'], true)) {
                    throw new OperationsException('use_resolve', 'Use Resolve, with the outcome and root cause.', 422);
                }
                care_set_status($pdo, $case, $status, $staff);
                $touch();
                break;

            case 'SET_PRIORITY':
                $priority = (string) ($in['priority'] ?? '');
                if (!in_array($priority, care_data()['priorities'], true)) {
                    throw new OperationsException('invalid_priority', 'Priority is NORMAL, IMPORTANT or URGENT.', 422);
                }
                if ($case['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED' && $priority !== 'URGENT') {
                    throw new OperationsException('privacy_review_open', 'A case with an open privacy review stays urgent.', 409);
                }
                $pdo->prepare('UPDATE order_service_requests SET priority = :p WHERE id = :id')->execute([':p' => $priority, ':id' => (int) $case['id']]);
                care_system_event($pdo, $case, "Priority {$case['priority']} → {$priority} ({$staff})");
                break;

            case 'ASSIGN':
                $to = operations_line($in['assigned_staff'] ?? null, 160);
                $pdo->prepare('UPDATE order_service_requests SET assigned_staff = :s WHERE id = :id')->execute([':s' => $to, ':id' => (int) $case['id']]);
                care_system_event($pdo, $case, 'Assigned to ' . ($to ?? 'nobody') . " ({$staff})");
                break;

            case 'SET_SENTIMENT':
                // A person's observation of how the customer seems, to prioritise recovery. Not a diagnosis; nothing is inferred.
                $sentiment = (string) ($in['sentiment'] ?? '');
                if (!in_array($sentiment, care_data()['sentiments'], true)) {
                    throw new OperationsException('invalid_sentiment', 'Sentiment is HAPPY, NEUTRAL, UNHAPPY or UNKNOWN.', 422);
                }
                $pdo->prepare('UPDATE order_service_requests SET sentiment = :s WHERE id = :id')->execute([':s' => $sentiment, ':id' => (int) $case['id']]);
                care_system_event($pdo, $case, "Sentiment recorded: {$sentiment} ({$staff})");
                break;

            case 'SET_CUSTOMER_SUMMARY':
                $summary = operations_line($in['customer_summary'] ?? null, 300);
                $pdo->prepare('UPDATE order_service_requests SET customer_summary = :s WHERE id = :id')->execute([':s' => $summary, ':id' => (int) $case['id']]);
                care_system_event($pdo, $case, "Customer summary updated ({$staff})");
                break;

            case 'CLASSIFY':
                $classification = (string) ($in['classification'] ?? '');
                if (!in_array($classification, care_data()['classifications'], true) || $classification === 'UNCLASSIFIED') {
                    throw new OperationsException('invalid_classification', 'Choose: an objective MCB error, a subjective creative preference, or not applicable.', 422);
                }
                $note = $text('note', 1000, 'Note why (what was checked against what the customer supplied).');
                $pdo->prepare('UPDATE order_service_requests SET classification = :c WHERE id = :id')->execute([':c' => $classification, ':id' => (int) $case['id']]);
                $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, author, created_at) VALUES (:c, :o, 'INTERNAL_NOTE', :b, :a, UTC_TIMESTAMP())")
                    ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => "Classified {$classification}: {$note}", ':a' => $staff]);
                record_order_event($pdo, $orderId, 'SUPPORT.CLASSIFIED', ['case_id' => (int) $case['id'], 'classification' => $classification, 'by' => $staff]);
                // A subjective preference is recorded and answered — it never starts creative rework.
                $result['creative_rework_started'] = false;
                break;

            case 'FLAG_PRIVACY_REVIEW':
                $text('note', 1000, 'Note what suggests another customer\'s details may be involved.');
                care_flag_privacy($pdo, $case, $staff);
                $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, author, created_at) VALUES (:c, :o, 'INTERNAL_NOTE', :b, :a, UTC_TIMESTAMP())")
                    ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => 'Privacy review flagged: ' . operations_text($in['note'], 1000), ':a' => $staff]);
                break;

            case 'COMPLETE_PRIVACY_REVIEW':
                if ($case['privacy_review'] !== 'PRIVACY_REVIEW_REQUIRED') {
                    throw new OperationsException('no_privacy_review', 'This case has no open privacy review.', 409);
                }
                // A record of what was checked and done. It draws no legal conclusion; that stays with a professional.
                $note = $text('note', 1000, 'Record what was checked and what was done.');
                $pdo->prepare("UPDATE order_service_requests SET privacy_review = 'PRIVACY_REVIEW_COMPLETED', privacy_reviewed_by = :s, privacy_reviewed_at = UTC_TIMESTAMP() WHERE id = :id")
                    ->execute([':s' => $staff, ':id' => (int) $case['id']]);
                $pdo->prepare("INSERT INTO support_case_messages (case_id, order_id, kind, body, author, created_at) VALUES (:c, :o, 'INTERNAL_NOTE', :b, :a, UTC_TIMESTAMP())")
                    ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':b' => 'Privacy review completed: ' . $note, ':a' => $staff]);
                record_order_event($pdo, $orderId, 'SUPPORT.PRIVACY_REVIEW_COMPLETED', ['case_id' => (int) $case['id'], 'by' => $staff]);
                break;

            case 'RESOLVE':
                care_require_resolution($in, $case);
                care_apply_resolution($pdo, $case, $in, $staff);
                $touch();
                $blocking = $pdo->prepare("SELECT COUNT(*) FROM fulfilment_exceptions WHERE service_request_id = :c AND status = 'OPEN' AND blocking = 1");
                $blocking->execute([':c' => (int) $case['id']]);
                if ((int) $blocking->fetchColumn() > 0) {
                    $result['warning'] = 'A blocking fulfilment exception linked to this case is still open. It stays in health checks until it is resolved.';
                }
                break;

            case 'CLOSE':
                care_set_status($pdo, $case, 'CLOSED', $staff);
                $touch();
                break;

            case 'REISSUE_ORDER_LINK':
                // A fresh private link; issuing it replaces the customer's previous link. Never a creative revision.
                $token = issue_access_token($pdo, $orderId, 'STATUS', null, $staff);
                $result['link'] = access_link('STATUS', $token);
                record_order_event($pdo, $orderId, 'SUPPORT.ACCESS_REISSUED', ['case_id' => (int) $case['id'], 'by' => $staff]);
                care_system_event($pdo, $case, "Fresh private order link issued ({$staff})");
                $touch();
                break;

            case 'PROPOSE_REMEDY':
                $result += care_propose_remedy($pdo, $case, $in, $staff);
                $touch();
                break;

            case 'DECIDE_REMEDY':
            case 'START_REMEDY':
            case 'COMPLETE_REMEDY':
            case 'CANCEL_REMEDY':
                $result += care_move_remedy($pdo, $case, $action, $in, $staff, $founder);
                $touch();
                break;

            case 'REQUEST_REFUND_REVIEW':
            case 'SUBMIT_REFUND_FOR_DECISION':
            case 'DECIDE_REFUND':
            case 'RECORD_REFUND':
                $result += care_refund_action($pdo, $case, $action, $in, $staff, $founder);
                $touch();
                break;
        }
        return $result;
    });

    // Emails go after the commit, through the lifecycle ledger (at most once per message).
    foreach ($out['messages'] as [$type, $key, $messageId]) {
        $case = care_case_row($pdo, $caseId);
        $outcome = send_lifecycle_message($pdo, (int) $case['order_id'], $type, $key);
        $pdo->prepare('UPDATE support_case_messages SET email_outcome = :e WHERE id = :id')->execute([':e' => $outcome, ':id' => $messageId]);
        $out['email'] = $outcome;
    }
    unset($out['messages']);
    return $out;
}

function care_require_resolution(array $in, array $case): void
{
    if (!in_array($in['recovery_outcome'] ?? null, care_data()['recovery_outcomes'], true)) {
        throw new OperationsException('invalid_recovery_outcome', 'Say how it ended: resolved, replaced, corrected, redelivered, refunded, partially refunded or other.', 422);
    }
    $operational = !in_array($case['kind'], ['QUESTION', 'OTHER'], true);
    if ($operational && !in_array($in['root_cause'] ?? null, care_data()['root_causes'], true)) {
        throw new OperationsException('invalid_root_cause', 'Record the root cause (UNKNOWN is fine). It is not blame.', 422);
    }
    if (($in['root_cause'] ?? null) !== null && !in_array($in['root_cause'], care_data()['root_causes'], true)) {
        throw new OperationsException('invalid_root_cause', 'That root cause is not recognised.', 422);
    }
}

function care_apply_resolution(PDO $pdo, array $case, array $in, string $staff): void
{
    $pdo->prepare('UPDATE order_service_requests SET recovery_outcome = :r, root_cause = :c, resolution_note = :n,
                          resolution = COALESCE(resolution, :legacy) WHERE id = :id')
        ->execute([':r' => $in['recovery_outcome'], ':c' => $in['root_cause'] ?? null, ':n' => operations_text($in['resolution_note'] ?? null, 1000),
            ':legacy' => match ($in['recovery_outcome']) { 'REPLACED' => 'REPLACEMENT_ARRANGED', 'CORRECTED', 'REDELIVERED' => 'RESENT_OR_REPAIRED', 'RESOLVED' => 'ANSWERED', default => 'OTHER' },
            ':id' => (int) $case['id']]);
    care_set_status($pdo, care_case_row($pdo, (int) $case['id']), 'RESOLVED', $staff);
}

/** Staff open a case for a customer-impacting fulfilment exception (one per exception). */
function care_open_from_exception(PDO $pdo, array $in, string $staff): array
{
    $stmt = $pdo->prepare('SELECT * FROM fulfilment_exceptions WHERE id = :id FOR UPDATE');
    $stmt->execute([':id' => is_int($in['exception_id'] ?? null) ? $in['exception_id'] : 0]);
    $x = $stmt->fetch();
    if ($x === false || $x['status'] !== 'OPEN') {
        throw new OperationsException('exception_not_found', 'No open exception was found.', 404);
    }
    if ($x['service_request_id'] !== null) {
        return ['case_id' => (int) $x['service_request_id'], 'outcome' => 'already_linked'];
    }
    $delivery = in_array($x['type'], fulfilment_data()['delivery_exception_types'], true);
    $kind = $delivery ? 'DELIVERY_PROBLEM' : match ($x['type']) { 'WRONG_ITEM' => 'WRONG_ITEM', 'PARCEL_DAMAGED' => 'DAMAGED_OR_FAULTY', 'MANUFACTURING_DEFECT' => 'MANUFACTURING_DEFECT', default => 'OTHER' };
    $summary = operations_text($in['note'] ?? null, 1000) ?? 'Opened by MCB for a ' . strtolower(str_replace('_', ' ', (string) $x['type'])) . '.';
    $caseId = care_open_case($pdo, (int) $x['order_id'], $kind, $summary, ['origin' => 'MCB', 'shipment_id' => $x['shipment_id'] === null ? null : (int) $x['shipment_id']]);
    // care_open_case may have linked or raised its own exception; this one is the occurrence.
    $pdo->prepare('UPDATE fulfilment_exceptions SET service_request_id = :c WHERE id = :id AND service_request_id IS NULL')->execute([':c' => $caseId, ':id' => (int) $x['id']]);
    return ['case_id' => $caseId];
}

/* ------------------------------------------------------------------ */
/* Remedies                                                             */
/* ------------------------------------------------------------------ */

function care_remedy_row(PDO $pdo, array $case, mixed $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM support_remedies WHERE id = :id AND case_id = :c FOR UPDATE');
    $stmt->execute([':id' => is_int($id) ? $id : 0, ':c' => (int) $case['id']]);
    $r = $stmt->fetch();
    if ($r === false) {
        throw new OperationsException('remedy_not_found', 'No such remedy on this case.', 404);
    }
    return $r;
}

function care_propose_remedy(PDO $pdo, array $case, array $in, string $staff): array
{
    $type = (string) ($in['type'] ?? '');
    $policy = care_remedy_policy($type);
    if ($policy === null) {
        throw new OperationsException('invalid_remedy', 'Choose a remedy.', 422);
    }
    if ($type === 'REFUND_REVIEW_REQUIRED') {
        throw new OperationsException('use_refund_review', 'Request a refund review instead: it records the amount and goes to Bella or Lewis.', 422);
    }
    // Single Creative Authority: a subjective preference never becomes a revision.
    if ($policy['objective_only'] && $case['classification'] !== 'OBJECTIVE_MCB_ERROR') {
        throw new OperationsException($case['classification'] === 'SUBJECTIVE_CREATIVE_PREFERENCE' ? 'subjective_preference_not_a_revision' : 'classification_required',
            $case['classification'] === 'SUBJECTIVE_CREATIVE_PREFERENCE'
                ? 'A creative preference is not a revision: correction and reproduction are for an objective MCB error only.'
                : 'Classify the case first: a correction or reproduction is for an objective MCB error only.', 409);
    }
    $open = $pdo->prepare("SELECT COUNT(*) FROM support_remedies WHERE case_id = :c AND type = :t AND status IN ('PROPOSED','FOUNDER_APPROVAL_REQUIRED','AUTHORISED','IN_PROGRESS')");
    $open->execute([':c' => (int) $case['id'], ':t' => $type]);
    if ((int) $open->fetchColumn() > 0) {
        throw new OperationsException('remedy_open', 'This remedy is already in progress on this case.', 409);
    }
    $note = operations_text($in['note'] ?? null, 1000);
    $costs = in_array($in['costs_mcb'] ?? null, ['YES', 'NO', 'UNKNOWN'], true) ? $in['costs_mcb'] : $policy['costs_mcb'];
    if ($costs === 'NO' && $policy['costs_mcb'] !== 'NO' && $note === null) {
        throw new OperationsException('invalid_note', 'Note why this costs MCB nothing.', 422);
    }
    // Money-bearing (or possibly money-bearing) remedies and founder resolutions wait for Bella or Lewis.
    $status = $policy['founder'] || $costs !== 'NO' ? 'FOUNDER_APPROVAL_REQUIRED' : 'PROPOSED';

    $shape = care_order_shape($pdo, (int) $case['order_id']);
    $videoJob = null;
    $basis = 'NOT_APPLICABLE';
    $pack = null;
    if ($type === 'VIDEO_REDELIVERY') {
        $basis = (string) ($in['capacity_basis'] ?? 'ORIGINAL_VIDEO_CAPACITY');
        if (!in_array($basis, care_data()['video_capacity_bases'], true)) {
            throw new OperationsException('invalid_capacity_basis', 'Say whether this is the original film, a rework attempt or a replacement film.', 422);
        }
        $job = $pdo->prepare('SELECT id, status FROM video_jobs WHERE order_id = :o AND id = :j FOR UPDATE');
        $job->execute([':o' => (int) $case['order_id'], ':j' => is_int($in['video_job_id'] ?? null) ? $in['video_job_id'] : (int) ($case['video_job_id'] ?? 0)]);
        $j = $job->fetch();
        if ($j === false) {
            throw new OperationsException('video_job_not_found', 'Choose this order\'s video.', 404);
        }
        $videoJob = (int) $j['id'];
        if ($basis !== 'ORIGINAL_VIDEO_CAPACITY' && $case['classification'] !== 'OBJECTIVE_MCB_ERROR') {
            throw new OperationsException('classification_required', 'A remade film is for an objective MCB error (a wrong or damaged film). A preference is not a revision.', 409);
        }
        // Re-sending the same film needs nothing; a remake is MCB's own time and platform use (not accounted until verified).
        $status = 'PROPOSED';
        $costs = $basis === 'ORIGINAL_VIDEO_CAPACITY' ? 'NO' : 'UNKNOWN';
    }
    if (in_array($type, ['REPLACEMENT_REQUIRED', 'REPRODUCTION_REQUIRED'], true) && $shape['physical']) {
        // The replacement uses the order's own prepared supplier-order pack. Nothing is purchased.
        $p = $pdo->prepare("SELECT id FROM supplier_order_packs WHERE order_id = :o AND status <> 'SUPERSEDED' ORDER BY version DESC LIMIT 1");
        $p->execute([':o' => (int) $case['order_id']]);
        $pack = ($id = $p->fetchColumn()) === false ? null : (int) $id;
    }
    if ($type === 'VIDEO_REDELIVERY' && $costs !== 'NO') {
        $status = 'PROPOSED';
    }

    $pdo->prepare('INSERT INTO support_remedies (case_id, order_id, type, status, costs_mcb, capacity_basis, video_job_id, supplier_order_pack_id, note, proposed_by, created_at)
                   VALUES (:c, :o, :t, :s, :cost, :basis, :vj, :pack, :n, :by, UTC_TIMESTAMP())')
        ->execute([':c' => (int) $case['id'], ':o' => (int) $case['order_id'], ':t' => $type, ':s' => $status, ':cost' => $costs, ':basis' => $basis,
            ':vj' => $videoJob, ':pack' => $pack, ':n' => $note, ':by' => $staff]);
    $remedyId = (int) $pdo->lastInsertId();
    care_system_event($pdo, $case, "Remedy proposed: {$type} ({$status}) by {$staff}");
    record_order_event($pdo, (int) $case['order_id'], 'SUPPORT.REMEDY_PROPOSED', ['case_id' => (int) $case['id'], 'remedy_id' => $remedyId, 'type' => $type, 'status' => $status]);
    if (!in_array($case['status'], ['RESOLUTION_IN_PROGRESS', 'RESOLVED', 'CLOSED'], true)) {
        care_set_status($pdo, care_case_row($pdo, (int) $case['id']), 'RESOLUTION_IN_PROGRESS', $staff);
    }
    if ($status === 'FOUNDER_APPROVAL_REQUIRED') {
        notify_founders_about_order($pdo, 'CUSTOMER_SUPPORT_EXCEPTION', (int) $case['order_id'], "support-remedy:{$remedyId}", ['reason' => 'FOUNDER_DECISION_REQUIRED']);
    }
    $out = ['remedy_id' => $remedyId, 'remedy_status' => $status, 'purchased' => false];
    if ($type === 'VIDEO_REDELIVERY') {
        $out['capacity_note'] = 'No customer production space is used or released. Platform allowance use is PENDING_EXTERNAL_VERIFICATION.';
    }
    return $out;
}

function care_move_remedy(PDO $pdo, array $case, string $action, array $in, string $staff, ?string $founder): array
{
    $r = care_remedy_row($pdo, $case, $in['remedy_id'] ?? null);
    $note = operations_text($in['note'] ?? null, 1000);
    $set = static function (array $fields) use ($pdo, $r): void {
        $sets = implode(', ', array_map(static fn (string $k): string => "{$k} = :{$k}", array_keys($fields)));
        $pdo->prepare("UPDATE support_remedies SET {$sets} WHERE id = :id")->execute(array_combine(array_map(static fn (string $k): string => ":{$k}", array_keys($fields)), array_values($fields)) + [':id' => (int) $r['id']]);
    };
    switch ($action) {
        case 'DECIDE_REMEDY':
            if ($r['status'] !== 'FOUNDER_APPROVAL_REQUIRED') {
                throw new OperationsException('invalid_transition', 'This remedy is not waiting for a founder decision.', 409);
            }
            $decision = $in['decision'] ?? null;
            if (!in_array($decision, ['AUTHORISE', 'DECLINE'], true) || $note === null) {
                throw new OperationsException('invalid_decision', 'Authorise or decline, with a note.', 422);
            }
            $set(['status' => $decision === 'AUTHORISE' ? 'AUTHORISED' : 'DECLINED', 'authorised_by' => $founder, 'decided_at' => care_now(), 'decision_note' => $note]);
            record_order_event($pdo, (int) $case['order_id'], 'SUPPORT.REMEDY_DECIDED', ['remedy_id' => (int) $r['id'], 'type' => $r['type'], 'decision' => $decision, 'founder' => $founder, 'by' => $staff]);
            care_system_event($pdo, $case, "Remedy {$r['type']} " . strtolower($decision) . "d by " . ucfirst(strtolower((string) $founder)));
            return ['remedy_status' => $decision === 'AUTHORISE' ? 'AUTHORISED' : 'DECLINED', 'purchased' => false,
                'next' => $decision === 'AUTHORISE' && $r['type'] === 'REPLACEMENT_REQUIRED' ? 'Place the replacement through the fulfilment workflow. Nothing has been purchased.' : null];

        case 'START_REMEDY':
            // Payment first. Starting a remedy is the one care action that
            // begins production (a replacement, or a video rework). It was
            // protected only by where it is reachable from, never by a check.
            require_payment_before_work($pdo, (int) $case['order_id'], $r['type'] === 'VIDEO_REDELIVERY' ? 'VIDEO' : 'REPLACEMENT');
            if (!in_array($r['status'], ['PROPOSED', 'AUTHORISED'], true)) {
                throw new OperationsException('invalid_transition', $r['status'] === 'FOUNDER_APPROVAL_REQUIRED' ? 'This remedy needs Bella or Lewis first.' : 'This remedy cannot be started.', 409);
            }
            $set(['status' => 'IN_PROGRESS']);
            $out = ['remedy_status' => 'IN_PROGRESS'];
            if ($r['type'] === 'VIDEO_REDELIVERY' && in_array($r['capacity_basis'], ['REWORK_ATTEMPT', 'REPLACEMENT_VIDEO'], true)) {
                $out += care_start_video_rework($pdo, $case, $r, $staff);
            }
            care_system_event($pdo, $case, "Remedy {$r['type']} started ({$staff})");
            return $out;

        case 'COMPLETE_REMEDY':
            if (!in_array($r['status'], ['PROPOSED', 'AUTHORISED', 'IN_PROGRESS'], true)) {
                throw new OperationsException('invalid_transition', $r['status'] === 'FOUNDER_APPROVAL_REQUIRED' ? 'This remedy needs Bella or Lewis first.' : 'This remedy cannot be completed.', 409);
            }
            if ($note === null) {
                throw new OperationsException('invalid_note', 'Note what was done.', 422);
            }
            $set(['status' => 'COMPLETED', 'completed_by' => $staff, 'completed_at' => care_now(), 'decision_note' => $r['decision_note'] ?? $note]);
            record_order_event($pdo, (int) $case['order_id'], 'SUPPORT.REMEDY_COMPLETED', ['remedy_id' => (int) $r['id'], 'type' => $r['type'], 'by' => $staff]);
            care_system_event($pdo, $case, "Remedy {$r['type']} completed ({$staff}): {$note}");
            return ['remedy_status' => 'COMPLETED'];

        default:
            if (in_array($r['status'], ['COMPLETED', 'DECLINED', 'CANCELLED'], true)) {
                throw new OperationsException('invalid_transition', 'This remedy is already finished.', 409);
            }
            $set(['status' => 'CANCELLED', 'decision_note' => $note]);
            care_system_event($pdo, $case, "Remedy {$r['type']} cancelled ({$staff})");
            return ['remedy_status' => 'CANCELLED'];
    }
}

/**
 * A remade film for an objective error: the same job goes back to rework. Its
 * original capacity reservation is untouched (no second space is taken, none is
 * released); the Video Master history is kept.
 */
function care_start_video_rework(PDO $pdo, array $case, array $remedy, string $staff): array
{
    $job = video_job_row($pdo, (int) $remedy['video_job_id'], true);
    if ($job === null || !in_array($job['status'], ['READY_FOR_REVEAL', 'REVEALED', 'QUALITY_CHECK_REQUIRED'], true)) {
        throw new OperationsException('invalid_transition', 'Only a finished (or checked) film can be remade from a support case.', 409);
    }
    video_set_job($pdo, (int) $job['id'], ['status' => 'REWORK_REQUIRED', 'waiting_on' => 'PRODUCTION', 'rework_count' => (int) $job['rework_count'] + 1]);
    record_order_event($pdo, (int) $case['order_id'], 'VIDEO.REWORK_REQUIRED', ['video_job_id' => (int) $job['id'], 'source' => 'SUPPORT_CASE', 'case_id' => (int) $case['id'], 'capacity_basis' => $remedy['capacity_basis']]);
    return ['video_job_status' => 'REWORK_REQUIRED', 'capacity_note' => 'The original reservation is unchanged. Platform allowance use is PENDING_EXTERNAL_VERIFICATION.'];
}

/* ------------------------------------------------------------------ */
/* Refund review and record — no refund is ever executed here          */
/* ------------------------------------------------------------------ */

function care_refund_action(PDO $pdo, array $case, string $action, array $in, string $staff, ?string $founder): array
{
    $orderId = (int) $case['order_id'];
    if ($action === 'REQUEST_REFUND_REVIEW') {
        $money = care_money_facts($pdo, $orderId);
        if ($money['payment_status'] !== 'PAID') {
            throw new OperationsException('order_not_paid', 'Only a paid order can have a refund review.', 409);
        }
        $open = $pdo->prepare("SELECT COUNT(*) FROM refund_reviews WHERE order_id = :o AND status IN ('REFUND_REVIEW_REQUIRED','FOUNDER_DECISION_REQUIRED','AUTHORISED')");
        $open->execute([':o' => $orderId]);
        if ((int) $open->fetchColumn() > 0) {
            throw new OperationsException('refund_review_open', 'This order already has a refund review in progress.', 409);
        }
        $remaining = $money['gross_paid_minor'] - $money['refunds_recorded_minor'];
        $type = $in['refund_type'] ?? null;
        if (!in_array($type, care_data()['refund_types'], true)) {
            throw new OperationsException('invalid_refund_type', 'Choose FULL or PARTIAL.', 422);
        }
        $amount = $type === 'FULL' ? $remaining : (is_int($in['amount_minor'] ?? null) ? $in['amount_minor'] : 0);
        if ($remaining <= 0) {
            throw new OperationsException('nothing_to_refund', 'Everything paid for this order is already recorded as refunded.', 409);
        }
        if ($type === 'PARTIAL' && ($amount < 1 || $amount >= $remaining)) {
            throw new OperationsException('invalid_amount', 'A partial refund is more than zero and less than the ' . number_format($remaining / 100, 2) . ' still paid.', 422);
        }
        $reason = operations_text($in['reason'] ?? null, 500) ?? throw new OperationsException('invalid_reason', 'Give the reason for the refund review.', 422);
        $pdo->prepare('INSERT INTO refund_reviews (order_id, case_id, status, refund_type, currency, gross_paid_minor, amount_minor, reason, requested_by, created_at)
                       VALUES (:o, :c, \'REFUND_REVIEW_REQUIRED\', :t, :cur, :g, :a, :r, :by, UTC_TIMESTAMP())')
            ->execute([':o' => $orderId, ':c' => (int) $case['id'], ':t' => $type, ':cur' => $money['currency'], ':g' => $money['gross_paid_minor'], ':a' => $amount, ':r' => $reason, ':by' => $staff]);
        $refundId = (int) $pdo->lastInsertId();
        $pdo->prepare("INSERT INTO support_remedies (case_id, order_id, type, status, costs_mcb, refund_review_id, note, proposed_by, created_at) VALUES (:c, :o, 'REFUND_REVIEW_REQUIRED', 'PROPOSED', 'YES', :rr, :n, :by, UTC_TIMESTAMP())")
            ->execute([':c' => (int) $case['id'], ':o' => $orderId, ':rr' => $refundId, ':n' => $reason, ':by' => $staff]);
        record_order_event($pdo, $orderId, 'FINANCE.REFUND_REVIEW_REQUESTED', ['refund_id' => $refundId, 'type' => $type, 'amount_minor' => $amount, 'by' => $staff]);
        care_system_event($pdo, $case, "Refund review requested: {$type} " . number_format($amount / 100, 2) . " ({$staff})");
        if (!in_array($case['status'], ['RESOLUTION_IN_PROGRESS', 'RESOLVED', 'CLOSED'], true)) {
            care_set_status($pdo, care_case_row($pdo, (int) $case['id']), 'RESOLUTION_IN_PROGRESS', $staff);
        }
        return ['refund_id' => $refundId, 'refund_status' => 'REFUND_REVIEW_REQUIRED', 'amount_minor' => $amount, 'refund_executed' => false];
    }

    $stmt = $pdo->prepare('SELECT * FROM refund_reviews WHERE id = :id AND order_id = :o FOR UPDATE');
    $stmt->execute([':id' => is_int($in['refund_id'] ?? null) ? $in['refund_id'] : 0, ':o' => $orderId]);
    $refund = $stmt->fetch();
    if ($refund === false) {
        throw new OperationsException('refund_not_found', 'No such refund review on this order.', 404);
    }
    $remedy = static function (string $status, array $extra = []) use ($pdo, $refund): void {
        $pdo->prepare('UPDATE support_remedies SET status = :s, authorised_by = COALESCE(:f, authorised_by), decided_at = IF(:d = 1, UTC_TIMESTAMP(), decided_at),
                              completed_by = COALESCE(:cb, completed_by), completed_at = IF(:c = 1, UTC_TIMESTAMP(), completed_at) WHERE refund_review_id = :id')
            ->execute([':s' => $status, ':f' => $extra['founder'] ?? null, ':d' => isset($extra['founder']) ? 1 : 0, ':cb' => $extra['completed_by'] ?? null, ':c' => isset($extra['completed_by']) ? 1 : 0, ':id' => (int) $refund['id']]);
    };
    $note = operations_text($in['note'] ?? null, 1000);
    switch ($action) {
        case 'SUBMIT_REFUND_FOR_DECISION':
            if ($refund['status'] !== 'REFUND_REVIEW_REQUIRED') {
                throw new OperationsException('invalid_transition', 'This refund review is not waiting for staff review.', 409);
            }
            $pdo->prepare("UPDATE refund_reviews SET status = 'FOUNDER_DECISION_REQUIRED' WHERE id = :id")->execute([':id' => (int) $refund['id']]);
            $remedy('FOUNDER_APPROVAL_REQUIRED');
            record_order_event($pdo, $orderId, 'FINANCE.REFUND_DECISION_REQUIRED', ['refund_id' => (int) $refund['id'], 'by' => $staff]);
            notify_founders_about_order($pdo, 'CUSTOMER_SUPPORT_EXCEPTION', $orderId, "refund-decision:{$refund['id']}", ['reason' => 'REFUND_DECISION_REQUIRED']);
            care_system_event($pdo, $case, "Refund review #{$refund['id']} sent to Bella or Lewis ({$staff})");
            return ['refund_status' => 'FOUNDER_DECISION_REQUIRED', 'refund_executed' => false];

        case 'DECIDE_REFUND':
            if ($refund['status'] !== 'FOUNDER_DECISION_REQUIRED') {
                throw new OperationsException('invalid_transition', 'This refund review is not waiting for a founder decision.', 409);
            }
            $decision = $in['decision'] ?? null;
            if (!in_array($decision, ['AUTHORISE', 'DECLINE'], true) || $note === null) {
                throw new OperationsException('invalid_decision', 'Authorise or decline, with a note.', 422);
            }
            $status = $decision === 'AUTHORISE' ? 'AUTHORISED' : 'DECLINED';
            $pdo->prepare('UPDATE refund_reviews SET status = :s, founder = :f, decided_at = UTC_TIMESTAMP(), decision_note = :n WHERE id = :id')
                ->execute([':s' => $status, ':f' => $founder, ':n' => $note, ':id' => (int) $refund['id']]);
            $remedy($status, ['founder' => $founder]);
            record_order_event($pdo, $orderId, 'FINANCE.REFUND_DECIDED', ['refund_id' => (int) $refund['id'], 'decision' => $decision, 'founder' => $founder, 'by' => $staff]);
            care_system_event($pdo, $case, "Refund review #{$refund['id']} " . strtolower($status) . ' by ' . ucfirst(strtolower((string) $founder)));
            return ['refund_status' => $status, 'refund_executed' => false,
                'next' => $status === 'AUTHORISED' ? 'Make the refund in the payment provider\'s dashboard, then record it here. MCB\'s system has not refunded anything.' : null];

        default: // RECORD_REFUND
            if ($refund['status'] !== 'AUTHORISED') {
                throw new OperationsException('invalid_transition', 'Only an authorised refund can be recorded.', 409);
            }
            $reference = operations_line($in['external_reference'] ?? null, 120);
            if ($reference !== null && (preg_match('/^[A-Za-z0-9_\-]{3,120}$/', $reference) !== 1 || preg_match('/^(sk|rk|pk)_/i', $reference) === 1 || looks_like_card_number($reference))) {
                throw new OperationsException('invalid_reference', 'Give the refund reference only (letters, numbers, - and _). Never a key or card details.', 422);
            }
            $on = (string) ($in['refunded_on'] ?? '');
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $on) !== 1 || strtotime($on . ' 00:00:00 UTC') === false || $on > gmdate('Y-m-d')) {
                throw new OperationsException('invalid_date', 'Give the date the refund was made (not in the future).', 422);
            }
            $pdo->prepare("UPDATE refund_reviews SET status = 'RECORDED', recorded_by = :by, recorded_at = UTC_TIMESTAMP(), refunded_on = :on, external_reference = :ref WHERE id = :id")
                ->execute([':by' => $staff, ':on' => $on, ':ref' => $reference, ':id' => (int) $refund['id']]);
            $remedy('COMPLETED', ['completed_by' => $staff]);
            // A partial refund never marks the order refunded; the payment status is left as the payment record says.
            $money = care_money_facts($pdo, $orderId);
            record_order_event($pdo, $orderId, 'FINANCE.REFUND_RECORDED', ['refund_id' => (int) $refund['id'], 'type' => $refund['refund_type'], 'amount_minor' => (int) $refund['amount_minor'], 'by' => $staff]);
            care_system_event($pdo, $case, "Refund #{$refund['id']} recorded ({$staff})");
            return ['refund_status' => 'RECORDED', 'refund_executed' => false, 'money' => $money,
                'suggested_recovery_outcome' => $money['fully_refunded'] ? 'REFUNDED' : 'PARTIALLY_REFUNDED'];
    }
}

/* ------------------------------------------------------------------ */
/* Recovery cooling: no review request straight after a difficult case */
/* ------------------------------------------------------------------ */

/** Why a review request should wait, or null (lib/lifecycle.php). */
function care_review_hold(PDO $pdo, int $orderId): ?string
{
    return review_request_recovery_hold($pdo, $orderId);
}

/* ------------------------------------------------------------------ */
/* Metrics, health and the Command Centre                              */
/* ------------------------------------------------------------------ */

/** Internal support metrics. Counts, times and money only — never message or evidence content. Nobody is penalised automatically. */
function care_metrics(PDO $pdo): array
{
    $one = static fn (string $sql): mixed => $pdo->query($sql)->fetchColumn();
    $open = "'" . implode("','", care_data()['open_statuses']) . "'";
    $rate = static fn (int|float $n, int|float $d): ?float => $d > 0 ? round($n / $d, 4) : null;
    $paid = (int) $one("SELECT COUNT(*) FROM orders WHERE status IN ('PAID','REFUNDED')");
    $physical = (int) $one("SELECT COUNT(*) FROM orders WHERE status IN ('PAID','REFUNDED') AND fulfilment_type = 'PHYSICAL'");
    $cases = $pdo->query('SELECT * FROM order_service_requests')->fetchAll();
    $overdue = count(array_filter($cases, static fn (array $c): bool => (care_due($c)['overdue'] ?? false)));
    $first = array_filter(array_map(static fn (array $c): ?int => $c['first_response_at'] === null ? null : strtotime($c['first_response_at'] . ' UTC') - strtotime($c['created_at'] . ' UTC'), $cases), static fn (?int $s): bool => $s !== null);
    $resolution = array_filter(array_map(static fn (array $c): ?int => $c['resolved_at'] === null ? null : strtotime($c['resolved_at'] . ' UTC') - strtotime($c['created_at'] . ' UTC'), $cases), static fn (?int $s): bool => $s !== null);
    $byReason = [];
    foreach ($cases as $c) {
        $byReason[$c['kind']] = ($byReason[$c['kind']] ?? 0) + 1;
    }
    $count = static fn (callable $f): int => count(array_filter($cases, $f));
    $refunds = $pdo->query("SELECT r.refund_type, COUNT(*) AS n, SUM(r.amount_minor) AS amount, COUNT(DISTINCT r.order_id) AS orders FROM refund_reviews r WHERE r.status = 'RECORDED' GROUP BY r.refund_type")->fetchAll();
    $refund = array_column($refunds, null, 'refund_type');
    $refundOrders = (int) $one("SELECT COUNT(DISTINCT order_id) FROM refund_reviews WHERE status = 'RECORDED'");
    $replacements = (int) $one("SELECT COUNT(DISTINCT order_id) FROM support_remedies WHERE type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED') AND status IN ('AUTHORISED','IN_PROGRESS','COMPLETED')");
    $resolved = $count(static fn (array $c): bool => in_array($c['status'], ['RESOLVED', 'CLOSED'], true));
    $answered = $count(static fn (array $c): bool => $c['satisfaction'] !== null);
    $yes = $count(static fn (array $c): bool => $c['satisfaction'] === 'YES');
    $ordersWithCases = count(array_unique(array_column($cases, 'order_id')));
    $counts = array_count_values(array_column($cases, 'order_id'));
    $repeat = count(array_filter($counts, static fn (int $n): bool => $n > 1)) + $count(static fn (array $c): bool => (int) $c['repeat_contacts'] > 0 && ($counts[$c['order_id']] ?? 0) === 1);
    return [
        'open_cases' => $count(static fn (array $c): bool => in_array($c['status'], care_data()['open_statuses'], true)),
        'new_cases' => $count(static fn (array $c): bool => $c['status'] === 'NEW'),
        'urgent_cases' => $count(static fn (array $c): bool => in_array($c['status'], care_data()['open_statuses'], true) && $c['priority'] === 'URGENT'),
        'overdue_mcb_cases' => $overdue,
        'average_first_response_hours' => $first === [] ? null : round(array_sum($first) / count($first) / 3600, 1),
        'average_resolution_hours' => $resolution === [] ? null : round(array_sum($resolution) / count($resolution) / 3600, 1),
        'cases_by_reason' => $byReason,
        'damage_rate' => $rate($byReason['DAMAGED_OR_FAULTY'] ?? 0, $physical),
        'wrong_item_rate' => $rate($byReason['WRONG_ITEM'] ?? 0, $physical),
        'objective_mcb_error_rate' => $rate($count(static fn (array $c): bool => $c['classification'] === 'OBJECTIVE_MCB_ERROR'), $paid),
        'subjective_preference_contact_rate' => $rate($count(static fn (array $c): bool => $c['classification'] === 'SUBJECTIVE_CREATIVE_PREFERENCE'), $paid),
        'replacement_rate' => $rate($replacements, $physical),
        'refund_rate' => $rate($refundOrders, $paid),
        'partial_refund_value_minor' => (int) ($refund['PARTIAL']['amount'] ?? 0),
        'full_refund_value_minor' => (int) ($refund['FULL']['amount'] ?? 0),
        'recovery_success_rate' => $rate($yes, $answered),
        'resolved_cases' => $resolved,
        'satisfaction_answers' => $answered,
        'repeat_contact_rate' => $rate($repeat, $ordersWithCases),
        'privacy_reviews_open' => $count(static fn (array $c): bool => $c['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED'),
        'note' => 'Internal. Counts and times only, never message or evidence content. Rates are for learning; nothing penalises staff or suppliers automatically. Recovery success is the share of customers who answered "yes" to "Did we resolve this for you?".',
        'currency' => 'GBP',
    ];
}

/** No customer abandoned: every check that means a customer is waiting on MCB. */
function care_health(PDO $pdo): array
{
    $target = care_data()['service_target'];
    $open = "'" . implode("','", care_data()['open_statuses']) . "'";
    $cases = $pdo->query("SELECT s.*, o.mcb_reference FROM order_service_requests s JOIN orders o ON o.id = s.order_id")->fetchAll();
    $finding = static fn (string $check, array $c): array => ['check' => $check, 'case_id' => (int) $c['id'], 'order_id' => (int) $c['order_id'], 'reference' => $c['mcb_reference']];
    $out = [];
    foreach ($cases as $c) {
        $due = care_due($c);
        if ($due !== null && $due['overdue'] && $c['first_response_at'] === null) {
            $out[] = $finding('CUSTOMER_MESSAGE_WITHOUT_RESPONSE', $c);
        } elseif ($due !== null && $due['overdue']) {
            $out[] = $finding('WAITING_ON_MCB_BEYOND_TARGET', $c);
        }
        if (in_array($c['status'], care_data()['open_statuses'], true) && $c['priority'] === 'URGENT' && $c['status'] === 'NEW'
            && strtotime($c['created_at'] . ' UTC') < time() - (int) $target['urgent_review_hours'] * 3600) {
            $out[] = $finding('URGENT_CASE_NOT_REVIEWED', $c);
        }
        if ($c['status'] === 'RESOLUTION_IN_PROGRESS' && care_working_days_after((string) ($c['last_mcb_activity_at'] ?? $c['status_since']), (int) $target['resolution_stall_working_days']) < time()) {
            $out[] = $finding('RESOLUTION_STALLED', $c);
        }
        if ($c['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED') {
            $out[] = $finding('PRIVACY_REVIEW_UNRESOLVED', $c);
        }
    }
    foreach ($pdo->query("SELECT r.id, r.case_id, r.order_id, r.type, r.decided_at, o.mcb_reference FROM support_remedies r JOIN orders o ON o.id = r.order_id WHERE r.status = 'AUTHORISED' AND r.type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED')")->fetchAll() as $r) {
        if ($r['decided_at'] !== null && care_working_days_after($r['decided_at'], (int) $target['replacement_action_working_days']) < time()) {
            $out[] = ['check' => 'REPLACEMENT_APPROVED_NOT_ACTIONED', 'case_id' => (int) $r['case_id'], 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference']];
        }
    }
    foreach ($pdo->query("SELECT f.id, f.case_id, f.order_id, f.decided_at, o.mcb_reference FROM refund_reviews f JOIN orders o ON o.id = f.order_id WHERE f.status = 'AUTHORISED'")->fetchAll() as $f) {
        if ($f['decided_at'] !== null && care_working_days_after($f['decided_at'], (int) $target['refund_record_working_days']) < time()) {
            $out[] = ['check' => 'REFUND_AUTHORISED_NOT_RECORDED', 'case_id' => $f['case_id'] === null ? null : (int) $f['case_id'], 'order_id' => (int) $f['order_id'], 'reference' => $f['mcb_reference']];
        }
    }
    foreach ($pdo->query("SELECT DISTINCT s.id, s.order_id, o.mcb_reference FROM order_service_requests s JOIN orders o ON o.id = s.order_id JOIN fulfilment_exceptions x ON x.service_request_id = s.id AND x.status = 'OPEN' AND x.blocking = 1 WHERE s.status IN ('RESOLVED','CLOSED')")->fetchAll() as $c) {
        $out[] = $finding('RESOLVED_WITH_BLOCKING_EXCEPTION', $c);
    }
    return $out;
}

const CARE_HEALTH_LABELS = [
    'CUSTOMER_MESSAGE_WITHOUT_RESPONSE' => 'Customers with no reply from MCB beyond one working day',
    'URGENT_CASE_NOT_REVIEWED' => 'Urgent customer cases not yet reviewed',
    'WAITING_ON_MCB_BEYOND_TARGET' => 'Customer cases waiting on MCB beyond one working day',
    'RESOLUTION_STALLED' => 'Customer resolutions with no progress',
    'REPLACEMENT_APPROVED_NOT_ACTIONED' => 'Approved replacements not yet actioned',
    'REFUND_AUTHORISED_NOT_RECORDED' => 'Authorised refunds not yet recorded',
    'RESOLVED_WITH_BLOCKING_EXCEPTION' => 'Resolved cases with a blocking fulfilment exception still open',
    'PRIVACY_REVIEW_UNRESOLVED' => 'Privacy reviews not yet completed',
];

/** The founder decisions from customer care: remedies needing Bella or Lewis, and refund decisions. */
function care_founder_decisions(PDO $pdo): array
{
    $titles = [
        'REPLACEMENT_REQUIRED' => 'Replacement approval required', 'REPRODUCTION_REQUIRED' => 'Reproduction approval required',
        'PARTIAL_DELIVERY_RESOLUTION' => 'Partial-delivery decision', 'CANCELLATION_REVIEW_REQUIRED' => 'Cancellation decision required',
        'OTHER_FOUNDER_RESOLUTION' => 'Founder resolution required', 'INTERNAL_CORRECTION' => 'Correction approval required',
        'TRACKING_UPDATE' => 'Remedy approval required', 'INFORMATION_PROVIDED' => 'Remedy approval required',
        'DIGITAL_REDELIVERY' => 'Remedy approval required', 'VIDEO_REDELIVERY' => 'Remedy approval required',
    ];
    $out = [];
    foreach ($pdo->query("SELECT id, case_id, order_id, type, costs_mcb, updated_at FROM support_remedies WHERE status = 'FOUNDER_APPROVAL_REQUIRED' AND type <> 'REFUND_REVIEW_REQUIRED' ORDER BY id")->fetchAll() as $r) {
        $out[] = ['kind' => 'SUPPORT_REMEDY', 'title' => $titles[$r['type']] ?? 'Founder decision required', 'order_id' => (int) $r['order_id'], 'case_id' => (int) $r['case_id'],
            'since' => $r['updated_at'], 'facts' => ['remedy_id' => (int) $r['id'], 'remedy' => $r['type'], 'costs_mcb' => $r['costs_mcb'], 'case_id' => (int) $r['case_id']]];
    }
    foreach ($pdo->query("SELECT id, case_id, order_id, refund_type, amount_minor, gross_paid_minor, currency, updated_at FROM refund_reviews WHERE status = 'FOUNDER_DECISION_REQUIRED' ORDER BY id")->fetchAll() as $f) {
        $out[] = ['kind' => 'REFUND_DECISION', 'title' => 'Refund decision required', 'order_id' => (int) $f['order_id'], 'case_id' => $f['case_id'] === null ? null : (int) $f['case_id'],
            'since' => $f['updated_at'], 'facts' => ['refund_id' => (int) $f['id'], 'refund_type' => $f['refund_type'], 'amount_minor' => (int) $f['amount_minor'], 'customer_paid_minor' => (int) $f['gross_paid_minor'], 'case_id' => $f['case_id'] === null ? null : (int) $f['case_id']]];
    }
    return $out;
}

function care_founder_decided(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query("SELECT r.order_id, o.mcb_reference, r.type, r.status, r.authorised_by, r.decided_at FROM support_remedies r JOIN orders o ON o.id = r.order_id WHERE r.authorised_by IS NOT NULL AND r.type <> 'REFUND_REVIEW_REQUIRED' ORDER BY r.decided_at DESC LIMIT 30")->fetchAll() as $r) {
        $out[] = ['kind' => 'SUPPORT_REMEDY', 'title' => ucfirst(strtolower(str_replace('_', ' ', $r['type']))) . ' — ' . strtolower($r['status'] === 'DECLINED' ? 'declined' : 'authorised'), 'reference' => $r['mcb_reference'], 'order_id' => (int) $r['order_id'], 'decided_by' => $r['authorised_by'], 'decided_at' => $r['decided_at']];
    }
    foreach ($pdo->query("SELECT f.order_id, o.mcb_reference, f.refund_type, f.status, f.founder, f.decided_at FROM refund_reviews f JOIN orders o ON o.id = f.order_id WHERE f.founder IS NOT NULL ORDER BY f.decided_at DESC LIMIT 30")->fetchAll() as $f) {
        $out[] = ['kind' => 'REFUND_DECISION', 'title' => ucfirst(strtolower($f['refund_type'])) . ' refund — ' . ($f['status'] === 'DECLINED' ? 'declined' : 'authorised'), 'reference' => $f['mcb_reference'], 'order_id' => (int) $f['order_id'], 'decided_by' => $f['founder'], 'decided_at' => $f['decided_at']];
    }
    return $out;
}

/** "Customers needing help" counts for the Command Centre. */
function care_command_summary(PDO $pdo): array
{
    $open = "'" . implode("','", care_data()['open_statuses']) . "'";
    $one = static fn (string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    $cases = $pdo->query("SELECT * FROM order_service_requests WHERE status IN ({$open})")->fetchAll();
    $delivery = "'" . implode("','", fulfilment_data()['delivery_exception_types']) . "'";
    return [
        'new_cases' => count(array_filter($cases, static fn (array $c): bool => $c['status'] === 'NEW')),
        'urgent' => count(array_filter($cases, static fn (array $c): bool => $c['priority'] === 'URGENT')),
        'overdue_mcb_response' => count(array_filter($cases, static fn (array $c): bool => (care_due($c)['overdue'] ?? false))),
        'replacement_approval_required' => $one("SELECT COUNT(*) FROM support_remedies WHERE status = 'FOUNDER_APPROVAL_REQUIRED' AND type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED')"),
        'refund_decision_required' => $one("SELECT COUNT(*) FROM refund_reviews WHERE status = 'FOUNDER_DECISION_REQUIRED'"),
        'privacy_review_required' => count(array_filter($cases, static fn (array $c): bool => $c['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED')),
        'unresolved_delivery_issue' => $one("SELECT COUNT(DISTINCT order_id) FROM fulfilment_exceptions WHERE status = 'OPEN' AND type IN ({$delivery})"),
        'open_cases' => count($cases),
    ];
}
