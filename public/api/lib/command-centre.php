<?php
/**
 * MCB Founder Command Centre — the read model behind /command-centre.
 *
 * Answers, in founder language: what is happening, what needs attention, what
 * needs a founder's decision, how the business is performing, and whether any
 * customer or order is in trouble.
 *
 * READ ONLY. Nothing here moves an order, spends, refunds, sends or calls a
 * provider. Actions from the Command Centre go through the same audited
 * endpoints as the staff console (crm/order-action, and the quality checks in
 * crm/command-centre POST), and a founder's financial decision still needs
 * that founder's own code.
 *
 * AGGREGATED. Each view is a handful of set queries over all active orders —
 * never one query per order.
 *
 * TIME. Days, weeks and months are the MCB BUSINESS day — Europe/London by
 * Founder decision — computed in lib/business-time.php, which Business uses
 * too. Timestamps are still stored in UTC; only the boundaries are local.
 * Until this sprint this file cut the day at midnight UTC while Business cut
 * it at midnight London, so through British Summer Time the same founder saw
 * two different "todays" on one screen, and an order paid at 00:30 BST was
 * today in one tile and yesterday in another.
 */

declare(strict_types=1);

require_once __DIR__ . '/business-time.php';
require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/operations-queue.php';
require_once __DIR__ . '/customer-care.php';

/** Engineering operational state → the founder's word for it. The engineering state stays underneath. */
const CC_FOUNDER_STAGES = [
    'ORDER.PAID' => 'NEW', 'CREATIVE.PENDING' => 'NEW',
    'CREATIVE.IN_PROGRESS' => 'CREATING',
    'QUALITY_CHECK' => 'QUALITY_CHECK',
    'REVEAL.READY' => 'READY_FOR_FULFILMENT', 'FULFILMENT.PENDING' => 'READY_FOR_FULFILMENT',
    'FULFILMENT.READY' => 'READY_FOR_FULFILMENT', 'FULFILMENT.AUTHORISED' => 'READY_FOR_FULFILMENT',
    'FULFILMENT.CONFIRMED' => 'BEING_MADE',
    'DISPATCHED' => 'ON_THE_WAY',
    'DELIVERED' => 'DELIVERED', 'REVEALED' => 'DELIVERED', 'FOLLOW_UP.DUE' => 'DELIVERED', 'COMPLETED' => 'DELIVERED',
];

const CC_PIPELINE = ['NEW', 'CREATING', 'QUALITY_CHECK', 'READY_FOR_FULFILMENT', 'BEING_MADE', 'ON_THE_WAY', 'DELIVERED'];

const CC_STAGE_LABELS = [
    'NEW' => 'New', 'CREATING' => 'Creating', 'QUALITY_CHECK' => 'Quality check', 'READY_FOR_FULFILMENT' => 'Ready for fulfilment',
    'BEING_MADE' => 'Being made', 'ON_THE_WAY' => 'On the way', 'DELIVERED' => 'Delivered',
];

/** Exception types that are a founder's decision (Approvals), not a staff task. */
const CC_DECISION_EXCEPTIONS = [
    'COMMERCIAL_SAFETY_EXCEPTION' => 'Commercial safety decision',
    'SUBSTITUTION_APPROVAL_REQUIRED' => 'Product substitution decision',
    'PAID_ORDER_FULFILMENT_EXCEPTION' => 'Paid-order exception decision',
    'PARCEL_LOST' => 'Lost parcel: replacement or partial delivery',
    'PARTIAL_DELIVERY' => 'Partial-delivery decision',
    'SUPPLIER_CANCELLED' => 'Supplier cancelled: founder decision',
];

/**
 * The period a view covers, in the MCB business timezone.
 *
 * Carries an `end` as well as a `start`. It used to return a start only, so
 * "today" meant "from midnight onwards" and anything dated in the future was
 * counted as today.
 */
function cc_period(string $key, ?int $now = null): array
{
    $periods = mcb_business_periods($now);
    $of = static fn (string $k, string $label): array => [
        'key' => $k === 'today' ? 'today' : $k,
        'label' => $label,
        'start' => $periods[$k]['start'],
        'end' => $periods[$k]['end'],
        // The LOCAL calendar date the period opens on. The start above is a UTC
        // timestamp, so through BST its date part is the previous day — reading
        // that as "the day" is exactly the confusion this sprint removed.
        'local_date' => $periods[$k]['local_date'],
        'timezone' => $periods['timezone'],
    ];
    return match ($key) {
        'week' => $of('week', 'This week'),
        'all' => ['key' => 'all', 'label' => 'All active', 'start' => null, 'end' => null, 'local_date' => null, 'timezone' => $periods['timezone']],
        default => $of('today', 'Today'),
    };
}

/** "Jane S." — enough to recognise an order in a list; the full name only on the order card. */
function cc_safe_name(?string $name): string
{
    $parts = preg_split('/\s+/u', trim((string) preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $name))) ?: [];
    $parts = array_values(array_filter($parts, static fn (string $p): bool => $p !== ''));
    if ($parts === []) {
        return 'Customer';
    }
    $first = mb_substr($parts[0], 0, 40);
    return count($parts) > 1 ? $first . ' ' . mb_strtoupper(mb_substr($parts[count($parts) - 1], 0, 1)) . '.' : $first;
}

/** When the order entered its current state, from the columns that recorded it. */
function cc_stage_since(array $r): ?string
{
    return match ($r['state']) {
        'ORDER.PAID', 'CREATIVE.PENDING' => $r['paid_at'] ?? $r['created_at'],
        'CREATIVE.IN_PROGRESS' => $r['creative_started_at'] ?? $r['paid_at'],
        'QUALITY_CHECK' => $r['qc_submitted_at'] ?? $r['creative_ready_at'],
        'REVEAL.READY', 'FULFILMENT.PENDING' => $r['qc_passed_at'],
        'FULFILMENT.READY' => $r['fulfilment_ready_at'],
        'FULFILMENT.AUTHORISED' => $r['supplier_purchase_authorised_at'],
        'FULFILMENT.CONFIRMED' => $r['fulfilment_confirmed_at'],
        'DISPATCHED' => $r['dispatched_on'] === null ? null : $r['dispatched_on'] . ' 00:00:00',
        'DELIVERED', 'FOLLOW_UP.DUE' => $r['delivered_on'] === null ? ($r['revealed_at'] ?? null) : $r['delivered_on'] . ' 00:00:00',
        'REVEALED' => $r['revealed_at'],
        'COMPLETED' => $r['completed_at'],
        default => null,
    };
}

/**
 * Every paid order with what the lists need, in one query. Customer names are
 * reduced to a safe list name; no story, photo, address or contact detail.
 */
function cc_paid_orders(PDO $pdo): array
{
    $rows = $pdo->query(
        'SELECT ' . MCB_OPERATIONS_COLUMNS . ", o.total_minor, o.currency, c.name AS customer_name, pe.created_at AS paid_at,
                (SELECT GROUP_CONCAT(CONCAT(i.quantity, ' × ', i.item_name) ORDER BY i.id SEPARATOR ', ') FROM order_items i WHERE i.order_id = o.id) AS product,
                (SELECT COUNT(*) FROM order_memories m WHERE m.order_id = o.id) AS memories
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
           LEFT JOIN order_production p ON p.order_id = o.id
           LEFT JOIN order_events pe ON pe.order_id = o.id AND pe.dedupe_key = 'paid'
          WHERE o.status = 'PAID'
          ORDER BY o.id DESC
          LIMIT 5000"
    )->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $r['state'] = operational_state($r);
        $r['stage'] = CC_FOUNDER_STAGES[$r['state']] ?? 'NEW';
        $r['stage_since'] = cc_stage_since($r);
        $out[(int) $r['id']] = $r;
    }
    return $out;
}

function cc_order_summary(array $r): array
{
    return [
        'order_id' => (int) $r['id'],
        'reference' => $r['mcb_reference'],
        'customer' => cc_safe_name($r['customer_name']),
        'product' => $r['product'],
        'workflow' => order_workflow($r),
        'stage' => $r['stage'],
        'stage_label' => CC_STAGE_LABELS[$r['stage']],
        'stage_since' => $r['stage_since'],
        'state' => $r['state'],
        'paid_minor' => (int) $r['total_minor'],
        'currency' => $r['currency'],
        'test_payment' => (int) ($r['stripe_livemode'] ?? 0) !== 1,
    ];
}

/** Latest EXPECTED and ACTUAL economics snapshot per order, in one query each. */
function cc_latest_economics(PDO $pdo): array
{
    $out = [];
    foreach (['EXPECTED', 'ACTUAL'] as $kind) {
        $rows = $pdo->query(
            "SELECT e.order_id, e.status, e.revenue_minor, e.total_cost_minor, e.contribution_minor, e.currency
               FROM order_economics e
               JOIN (SELECT order_id, MAX(id) AS id FROM order_economics WHERE kind = '{$kind}' GROUP BY order_id) l ON l.id = e.id"
        )->fetchAll();
        foreach ($rows as $row) {
            $out[(int) $row['order_id']][$kind] = $row;
        }
    }
    return $out;
}

/** Items that need quality review now, as three set queries. */
function cc_quality_items(PDO $pdo, array $orders): array
{
    $items = [];
    $songs = $pdo->query(
        "SELECT c.id AS candidate_id, c.job_id, c.order_id, c.created_at, j.track_number
           FROM creative_candidates c JOIN creative_jobs j ON j.id = c.job_id
          WHERE j.status = 'CREATIVE_QC_REQUIRED' AND c.technical_status = 'PASS' AND c.fact_status = 'PASS' AND c.creative_status = 'PENDING'"
    )->fetchAll();
    foreach ($songs as $s) {
        if (isset($orders[(int) $s['order_id']])) {
            $items[] = ['kind' => 'SONG', 'order_id' => (int) $s['order_id'], 'since' => $s['created_at'], 'detail' => 'Song ' . (int) $s['track_number'], 'candidate_id' => (int) $s['candidate_id']];
        }
    }
    $arts = $pdo->query("SELECT id, order_id, version, created_at FROM artwork_art_masters WHERE visual_qc_status = 'PENDING' AND is_current = 1")->fetchAll();
    foreach ($arts as $a) {
        if (isset($orders[(int) $a['order_id']])) {
            $items[] = ['kind' => 'ARTWORK', 'order_id' => (int) $a['order_id'], 'since' => $a['created_at'], 'detail' => 'Artwork version ' . (int) $a['version'], 'art_master_id' => (int) $a['id']];
        }
    }
    foreach ($pdo->query("SELECT j.order_id, c.id AS candidate_id, c.created_at, m.sequence FROM video_jobs j JOIN video_candidates c ON c.video_job_id = j.id AND c.qc_status = 'PENDING' JOIN video_entitlements e ON e.id = j.entitlement_id JOIN order_memories m ON m.id = e.memory_id WHERE j.status = 'QUALITY_CHECK_REQUIRED'")->fetchAll() as $v) {
        if (isset($orders[(int) $v['order_id']])) {
            $items[] = ['kind' => 'VIDEO', 'order_id' => (int) $v['order_id'], 'since' => $v['created_at'], 'detail' => 'Memory Music Video for song ' . (int) $v['sequence'], 'candidate_id' => (int) $v['candidate_id']];
        }
    }
    foreach ($orders as $id => $r) {
        if ($r['state'] === 'QUALITY_CHECK') {
            $items[] = ['kind' => 'FINAL', 'order_id' => $id, 'since' => $r['stage_since'], 'detail' => 'Final MCB check before ' . (order_workflow($r) === 'PHYSICAL' ? 'making' : 'the reveal')];
        }
    }
    return $items;
}

/** Decisions only Bella or Lewis can make: pending, and recently made (who and when). */
function cc_approvals(PDO $pdo, array $orders, array $economics): array
{
    $pending = [];
    $addresses = cc_destinations($pdo);
    foreach ($orders as $id => $r) {
        if ($r['state'] !== 'FULFILMENT.READY') {
            continue;
        }
        $e = $economics[$id]['EXPECTED'] ?? null;
        $known = $e !== null && $e['total_cost_minor'] !== null;
        $pending[] = [
            'kind' => 'SUPPLIER_PURCHASE', 'title' => 'Supplier purchase approval', 'order' => cc_order_summary($r), 'since' => $r['stage_since'],
            'facts' => [
                'customer_paid_minor' => (int) $r['total_minor'],
                'expected_fulfilment_minor' => $known ? (int) $e['total_cost_minor'] : null,
                'estimated_contribution_minor' => $known ? (int) $e['contribution_minor'] : null,
                'economics' => $e['status'] ?? 'NOT_CALCULATED',
                'destination_country' => $addresses[$id] ?? null,
                'payment' => 'VERIFIED',
                'mcb_checks' => 'PASSED',
            ],
            'action' => ['label' => 'Review & authorise', 'open' => 'approve'],
        ];
    }
    $types = "'" . implode("','", array_keys(CC_DECISION_EXCEPTIONS)) . "'";
    foreach ($pdo->query("SELECT id, order_id, type, created_at FROM fulfilment_exceptions WHERE status = 'OPEN' AND type IN ({$types}) ORDER BY id")->fetchAll() as $x) {
        if (!isset($orders[(int) $x['order_id']])) {
            continue;
        }
        $pending[] = [
            'kind' => 'EXCEPTION_DECISION', 'title' => CC_DECISION_EXCEPTIONS[$x['type']], 'order' => cc_order_summary($orders[(int) $x['order_id']]), 'since' => $x['created_at'],
            'facts' => ['exception_id' => (int) $x['id'], 'type' => $x['type']],
            'action' => ['label' => 'Review & decide', 'open' => 'decide'],
        ];
    }
    // Customer care decisions only Bella or Lewis make: money-bearing remedies and refunds.
    foreach (care_founder_decisions($pdo) as $d) {
        if (!isset($orders[$d['order_id']])) {
            continue;
        }
        $pending[] = ['kind' => $d['kind'], 'title' => $d['title'], 'order' => cc_order_summary($orders[$d['order_id']]), 'since' => $d['since'],
            'facts' => $d['facts'], 'action' => ['label' => 'Review & decide', 'open' => 'care', 'case_id' => $d['case_id']]];
    }
    $done = [];
    foreach ($pdo->query(
        "SELECT e.order_id, o.mcb_reference, JSON_VALUE(e.detail, '$.founder') AS founder, e.created_at
           FROM order_events e JOIN orders o ON o.id = e.order_id
          WHERE e.event_type = 'FULFILMENT.AUTHORISED' ORDER BY e.id DESC LIMIT 30"
    )->fetchAll() as $a) {
        $done[] = ['kind' => 'SUPPLIER_PURCHASE', 'title' => 'Supplier purchase authorised', 'reference' => $a['mcb_reference'], 'order_id' => (int) $a['order_id'], 'decided_by' => $a['founder'], 'decided_at' => $a['created_at']];
    }
    foreach ($pdo->query(
        "SELECT f.order_id, o.mcb_reference, f.type, f.resolution, f.resolution_authorised_by, f.resolved_at
           FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id
          WHERE f.resolution_authorised_by IS NOT NULL ORDER BY f.resolved_at DESC LIMIT 30"
    )->fetchAll() as $a) {
        $done[] = ['kind' => 'EXCEPTION_DECISION', 'title' => ucfirst(strtolower(str_replace('_', ' ', (string) $a['resolution']))), 'reference' => $a['mcb_reference'], 'order_id' => (int) $a['order_id'], 'decided_by' => $a['resolution_authorised_by'], 'decided_at' => $a['resolved_at']];
    }
    $done = array_merge($done, care_founder_decided($pdo));
    usort($done, static fn (array $a, array $b): int => strcmp((string) $b['decided_at'], (string) $a['decided_at']));
    return ['pending' => $pending, 'decided' => array_slice($done, 0, 30)];
}

/** Destination country per order (country name only). */
function cc_destinations(PDO $pdo): array
{
    return array_map('strval', array_column($pdo->query('SELECT order_id, country FROM delivery_addresses')->fetchAll(), 'country', 'order_id'));
}

/**
 * The attention centre: genuine actions and problems only. A healthy order in
 * a routine stage creates no card.
 */
function cc_attention(PDO $pdo, array $orders, array $economics, array $quality, array $approvals, array $health): array
{
    $cards = [];
    $card = static function (string $kind, string $title, int $priority, array $order, ?string $since, string $action, string $open, array $facts = []) use (&$cards): void {
        $cards[] = ['kind' => $kind, 'title' => $title, 'priority' => $priority, 'order' => $order, 'since' => $since, 'facts' => $facts, 'action' => ['label' => $action, 'open' => $open]];
    };
    foreach ($approvals['pending'] as $a) {
        $cards[] = ['kind' => $a['kind'] === 'SUPPLIER_PURCHASE' ? 'PURCHASE_APPROVAL' : 'FOUNDER_DECISION', 'title' => $a['kind'] === 'SUPPLIER_PURCHASE' ? 'Purchase approval required' : $a['title'],
            'priority' => 1, 'order' => $a['order'], 'since' => $a['since'], 'facts' => $a['facts'], 'action' => $a['action']];
    }
    foreach ($quality as $q) {
        $title = ['SONG' => 'Song quality check required', 'ARTWORK' => 'Artwork quality check required', 'VIDEO' => 'Video quality check required', 'FINAL' => 'Final quality check required'][$q['kind']];
        $card('QUALITY_CHECK', $title, 2, cc_order_summary($orders[$q['order_id']]), $q['since'], 'Review quality', $q['kind'] === 'FINAL' ? 'final' : 'quality', ['item' => $q['detail']]);
    }
    foreach ($orders as $id => $r) {
        if ($r['state'] === 'FULFILMENT.AUTHORISED') {
            $card('SUPPLIER_ORDER', 'Place the supplier order', 3, cc_order_summary($r), $r['stage_since'], 'Open order', 'card', ['authorised_by' => $r['supplier_purchase_authorised_by']]);
        }
    }
    $delivery = fulfilment_data()['delivery_exception_types'];
    $active = static fn (int $id): bool => isset($orders[$id]);
    foreach ($pdo->query("SELECT id, order_id, type, blocking, service_request_id, created_at FROM fulfilment_exceptions WHERE status = 'OPEN' ORDER BY id")->fetchAll() as $x) {
        $oid = (int) $x['order_id'];
        if (!$active($oid) || isset(CC_DECISION_EXCEPTIONS[$x['type']]) || $x['service_request_id'] !== null || $x['type'] === 'COMMERCIAL_DATA_REQUIRED') {
            continue;
        }
        $isDelivery = in_array($x['type'], $delivery, true);
        $card($isDelivery ? 'DELIVERY_EXCEPTION' : 'FULFILMENT_EXCEPTION', $isDelivery ? 'Delivery exception' : 'Fulfilment exception', (int) $x['blocking'] === 1 ? 2 : 3,
            cc_order_summary($orders[$oid]), $x['created_at'], 'Open order', 'card', ['problem' => $x['type'], 'blocking' => (int) $x['blocking'] === 1]);
    }
    foreach ($pdo->query("SELECT m.order_id, m.created_at FROM manufacturing_packages m JOIN (SELECT order_id, MAX(version) AS v FROM manufacturing_packages WHERE status <> 'SUPERSEDED' GROUP BY order_id) l ON l.order_id = m.order_id AND l.v = m.version WHERE m.status = 'MANUFACTURING_DATA_REQUIRED'")->fetchAll() as $m) {
        $oid = (int) $m['order_id'];
        if ($active($oid) && !in_array($orders[$oid]['stage'], ['BEING_MADE', 'ON_THE_WAY', 'DELIVERED'], true)) {
            $card('MANUFACTURING_DATA', 'Manufacturing information required', 3, cc_order_summary($orders[$oid]), $m['created_at'], 'Open order', 'card');
        }
    }
    foreach ($pdo->query(
        "SELECT order_id, MIN(updated_at) AS since, COUNT(*) AS n FROM (
            SELECT order_id, updated_at FROM order_artwork WHERE status IN ('EXCEPTION','TEMPLATE_REQUIRED')
            UNION ALL SELECT order_id, updated_at FROM image_preparation_records WHERE status IN ('UNUSABLE','EXCEPTION')
            UNION ALL SELECT order_id, updated_at FROM artwork_creative_jobs WHERE status = 'EXCEPTION') x GROUP BY order_id"
    )->fetchAll() as $a) {
        $oid = (int) $a['order_id'];
        if ($active($oid) && in_array($orders[$oid]['stage'], ['NEW', 'CREATING', 'QUALITY_CHECK', 'READY_FOR_FULFILMENT'], true)) {
            $card('ARTWORK_EXCEPTION', 'Artwork exception', 2, cc_order_summary($orders[$oid]), $a['since'], 'Open order', 'card', ['items' => (int) $a['n']]);
        }
    }
    foreach ($pdo->query(
        "SELECT order_id, MIN(since) AS since FROM (
            SELECT order_id, updated_at AS since FROM creative_jobs WHERE status = 'EXCEPTION'
            UNION ALL SELECT order_id, updated_at FROM creative_albums WHERE capacity_status = 'AUDIO_CAPACITY_EXCEPTION') x GROUP BY order_id"
    )->fetchAll() as $c) {
        $oid = (int) $c['order_id'];
        if ($active($oid) && in_array($orders[$oid]['stage'], ['NEW', 'CREATING', 'QUALITY_CHECK', 'READY_FOR_FULFILMENT'], true)) {
            $card('CREATIVE_EXCEPTION', 'Creative exception', 2, cc_order_summary($orders[$oid]), $c['since'], 'Open order', 'card');
        }
    }
    // MCB Memory Music Video: genuine actions only.
    foreach ($pdo->query(
        "SELECT j.id, j.order_id, j.status, j.waiting_on, j.exception_reason, j.updated_at, j.created_at, m.sequence
           FROM video_jobs j JOIN video_entitlements e ON e.id = j.entitlement_id JOIN order_memories m ON m.id = e.memory_id
          WHERE j.status IN ('INPUT_REQUIRED','READY','PRODUCTION_REQUIRED','REWORK_REQUIRED','EXCEPTION')"
    )->fetchAll() as $v) {
        $oid = (int) $v['order_id'];
        if (!$active($oid)) {
            continue;
        }
        $facts = ['item' => 'Memory Music Video for song ' . (int) $v['sequence']];
        if ($v['status'] === 'INPUT_REQUIRED' && strtotime($v['created_at'] . ' UTC') < time() - 48 * 3600) {
            $card('VIDEO_INPUT_REQUIRED', 'Video input required', 3, cc_order_summary($orders[$oid]), $v['created_at'], 'Open order', 'card', $facts + ['problem' => 'CUSTOMER_PHOTOGRAPHS_NOT_RECEIVED']);
        } elseif ($v['status'] === 'READY' && $v['waiting_on'] === 'PROVIDER_VERIFICATION') {
            $card('VIDEO_EXCEPTION', 'Video length needs platform verification', 2, cc_order_summary($orders[$oid]), $v['updated_at'], 'Open order', 'card', $facts + ['problem' => 'VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED']);
        } elseif (in_array($v['status'], ['PRODUCTION_REQUIRED', 'REWORK_REQUIRED'], true)) {
            $card('VIDEO_PRODUCTION_REQUIRED', 'Video production required', 2, cc_order_summary($orders[$oid]), $v['updated_at'], 'Open order', 'card', $facts);
        } elseif ($v['status'] === 'EXCEPTION' && $v['exception_reason'] !== 'CANCELLED_BEFORE_PRODUCTION') {
            $card('VIDEO_EXCEPTION', 'Video exception', 1, cc_order_summary($orders[$oid]), $v['updated_at'], 'Open order', 'card', $facts + ['problem' => $v['exception_reason']]);
        }
    }
    foreach ($pdo->query("SELECT order_id, updated_at FROM video_entitlements WHERE status = 'CAPACITY_EXCEPTION'")->fetchAll() as $x) {
        if ($active((int) $x['order_id'])) {
            $card('VIDEO_EXCEPTION', 'Video paid without a production space', 1, cc_order_summary($orders[(int) $x['order_id']]), $x['updated_at'], 'Open order', 'card', ['problem' => 'PAID_WITHOUT_CAPACITY']);
        }
    }
    $videoCapacity = video_capacity_readonly($pdo);
    if ($videoCapacity['state'] !== 'AVAILABLE') {
        $cards[] = ['kind' => $videoCapacity['state'] === 'FULL' ? 'VIDEO_CAPACITY_FULL' : 'VIDEO_CAPACITY_LOW', 'title' => $videoCapacity['state'] === 'FULL' ? 'Video capacity full' : 'Video capacity low',
            'priority' => $videoCapacity['state'] === 'FULL' ? 1 : 3, 'order' => null, 'since' => null,
            'facts' => ['remaining' => $videoCapacity['remaining'], 'planned' => $videoCapacity['planned'], 'period' => $videoCapacity['period_key'], 'label' => $videoCapacity['label']],
            'action' => ['label' => 'Open videos', 'open' => 'videos']];
    }
    // Ordinary support work is attention, never approval. Only cases where MCB owes the next step.
    foreach (cc_customer_problems($pdo, $orders) as $p) {
        if ($p['case_id'] === null || !$p['needs_mcb']) {
            continue;
        }
        $title = $p['privacy_review'] ? 'Privacy review required' : ($p['overdue'] ? 'Overdue reply: ' : 'Customer needs help: ') . ($p['privacy_review'] ? '' : strtolower($p['label']));
        $cards[] = ['kind' => $p['privacy_review'] ? 'PRIVACY_REVIEW' : 'CUSTOMER_SUPPORT', 'title' => $title,
            'priority' => $p['privacy_review'] || $p['priority'] === 'URGENT' || $p['overdue'] ? 1 : ($p['priority'] === 'IMPORTANT' ? 2 : 3),
            'order' => $p['order'], 'since' => $p['since'], 'facts' => ['problem' => $p['kind'], 'case_id' => $p['case_id']],
            'action' => ['label' => 'Open case', 'open' => 'care', 'case_id' => $p['case_id']]];
    }
    foreach (care_health($pdo) as $f) {
        if (in_array($f['check'], ['REPLACEMENT_APPROVED_NOT_ACTIONED', 'REFUND_AUTHORISED_NOT_RECORDED', 'RESOLVED_WITH_BLOCKING_EXCEPTION'], true) && isset($orders[$f['order_id']])) {
            $cards[] = ['kind' => 'CUSTOMER_SUPPORT', 'title' => CARE_HEALTH_LABELS[$f['check']], 'priority' => 2, 'order' => cc_order_summary($orders[$f['order_id']]), 'since' => null,
                'facts' => ['problem' => $f['check'], 'case_id' => $f['case_id']], 'action' => ['label' => 'Open case', 'open' => 'care', 'case_id' => $f['case_id']]];
        }
    }
    foreach ($health['stranded'] as $s) {
        if (isset($orders[$s['order_id']])) {
            $card('STRANDED_ORDER', 'Stranded order', 1, cc_order_summary($orders[$s['order_id']]), $s['since'], 'Open order', 'card', ['problem' => $s['check']]);
        }
    }
    usort($cards, static fn (array $a, array $b): int => [$a['priority'], (string) $a['since']] <=> [$b['priority'], (string) $b['since']]);
    return $cards;
}

/**
 * Customers who need help. An unresolved case stays here whatever stage the
 * order has reached — a completed order is not a resolved complaint.
 */
function cc_customer_problems(PDO $pdo, array $orders): array
{
    $types = care_case_types();
    $rank = ['URGENT' => 1, 'IMPORTANT' => 2, 'NORMAL' => 3];
    $out = [];
    $open = "'" . implode("','", care_data()['open_statuses']) . "'";
    foreach ($pdo->query("SELECT * FROM order_service_requests WHERE status IN ({$open}) ORDER BY created_at")->fetchAll() as $s) {
        if (!isset($orders[(int) $s['order_id']])) {
            continue;
        }
        $due = care_due($s);
        $privacy = $s['privacy_review'] === 'PRIVACY_REVIEW_REQUIRED';
        $out[] = ['case_id' => (int) $s['id'], 'kind' => $s['kind'], 'label' => $types[$s['kind']]['label'] ?? 'Support request',
            'rank' => $privacy ? 0 : ($rank[$s['priority']] ?? 3), 'priority' => $s['priority'], 'status' => $s['status'],
            'status_label' => ucfirst(strtolower(str_replace('_', ' ', $s['status']))), 'needs_mcb' => $s['status'] !== 'WAITING_FOR_CUSTOMER',
            'overdue' => $due['overdue'] ?? false, 'privacy_review' => $privacy, 'since' => $s['status_since'] ?? $s['created_at'], 'order' => cc_order_summary($orders[(int) $s['order_id']])];
    }
    // Open delivery exceptions with no case behind them (e.g. a lost parcel the customer has not reported).
    $delivery = "'" . implode("','", fulfilment_data()['delivery_exception_types']) . "'";
    foreach ($pdo->query("SELECT id, order_id, type, created_at FROM fulfilment_exceptions WHERE status = 'OPEN' AND service_request_id IS NULL AND type IN ({$delivery}) ORDER BY created_at")->fetchAll() as $x) {
        if (isset($orders[(int) $x['order_id']])) {
            $out[] = ['case_id' => null, 'exception_id' => (int) $x['id'], 'kind' => 'DELIVERY_EXCEPTION', 'label' => 'Delivery issue', 'rank' => 2, 'priority' => 'IMPORTANT', 'status' => 'OPEN',
                'status_label' => 'No case yet', 'needs_mcb' => true, 'overdue' => false, 'privacy_review' => false, 'since' => $x['created_at'], 'order' => cc_order_summary($orders[(int) $x['order_id']])];
        }
    }
    usort($out, static fn (array $a, array $b): int => [$a['rank'], (string) $a['since']] <=> [$b['rank'], (string) $b['since']]);
    return $out;
}

/** Paid revenue (from the payment record, not checkout value), live and TEST separately, with recorded refunds. */
function cc_revenue(PDO $pdo, ?int $now = null): array
{
    $out = [];
    $now = $now ?? time();
    $starts = [
        'today' => cc_period('today', $now)['start'],
        'week' => cc_period('week', $now)['start'],
        'month' => mcb_business_periods($now)['month']['start'],
    ];
    $stmt = $pdo->prepare(
        "SELECT o.currency,
                SUM(IF(o.stripe_livemode = 1, o.total_minor, 0)) AS live_minor,
                SUM(IF(o.stripe_livemode = 1, 0, o.total_minor)) AS test_minor,
                SUM(IF(o.stripe_livemode = 1, 1, 0)) AS live_orders,
                SUM(IF(o.stripe_livemode = 1, 0, 1)) AS test_orders,
                SUM(IF(o.status = 'REFUNDED' AND o.stripe_livemode = 1 AND NOT EXISTS (SELECT 1 FROM refund_reviews rr WHERE rr.order_id = o.id AND rr.status = 'RECORDED'), o.total_minor, 0)) AS legacy_refunded_minor,
                SUM(IF(o.status = 'REFUNDED' AND NOT EXISTS (SELECT 1 FROM refund_reviews rr WHERE rr.order_id = o.id AND rr.status = 'RECORDED'), 1, 0)) AS legacy_refunded_orders
           FROM order_events e JOIN orders o ON o.id = e.order_id
          WHERE e.dedupe_key = 'paid' AND e.created_at >= :start
          GROUP BY o.currency"
    );
    // Refunds MCB has recorded (made outside its system), in the period they were recorded, live payments only.
    // A partial refund reduces net paid by its amount and never counts the order as refunded.
    $refundStmt = $pdo->prepare(
        "SELECT rr.order_id, o.total_minor,
                SUM(IF(rr.recorded_at >= :start, rr.amount_minor, 0)) AS in_period,
                SUM(IF(rr.recorded_at >= :start2 AND rr.refund_type = 'PARTIAL', rr.amount_minor, 0)) AS partial_in_period,
                SUM(rr.amount_minor) AS all_time
           FROM refund_reviews rr JOIN orders o ON o.id = rr.order_id
          WHERE rr.status = 'RECORDED' AND rr.currency = 'GBP' AND o.stripe_livemode = 1
          GROUP BY rr.order_id, o.total_minor"
    );
    foreach ($starts as $key => $start) {
        $stmt->execute([':start' => $start]);
        $rows = $stmt->fetchAll();
        $gbp = array_values(array_filter($rows, static fn (array $r): bool => $r['currency'] === 'GBP'))[0] ?? null;
        $gross = (int) ($gbp['live_minor'] ?? 0);
        $refundStmt->execute([':start' => $start, ':start2' => $start]);
        $recorded = array_filter($refundStmt->fetchAll(), static fn (array $r): bool => (int) $r['in_period'] > 0);
        $recordedMinor = array_sum(array_map(static fn (array $r): int => (int) $r['in_period'], $recorded));
        $partialMinor = array_sum(array_map(static fn (array $r): int => (int) $r['partial_in_period'], $recorded));
        $fullyRefunded = count(array_filter($recorded, static fn (array $r): bool => (int) $r['all_time'] >= (int) $r['total_minor']));
        $refunds = $recordedMinor + (int) ($gbp['legacy_refunded_minor'] ?? 0);
        $out[$key] = [
            'currency' => 'GBP',
            'gross_paid_minor' => $gross,
            'refunds_minor' => $refunds,
            'full_refunds_minor' => $refunds - $partialMinor,
            'partial_refunds_minor' => $partialMinor,
            'net_paid_minor' => $gross - $refunds,
            'paid_orders' => (int) ($gbp['live_orders'] ?? 0),
            'refunded_orders' => $fullyRefunded + (int) ($gbp['legacy_refunded_orders'] ?? 0),
            'partially_refunded_orders' => count($recorded) - $fullyRefunded,
            'test_paid_minor' => (int) ($gbp['test_minor'] ?? 0),
            'test_orders' => (int) ($gbp['test_orders'] ?? 0),
            'other_currencies' => array_values(array_map(static fn (array $r): array => ['currency' => $r['currency'], 'gross_paid_minor' => (int) $r['live_minor']], array_filter($rows, static fn (array $r): bool => $r['currency'] !== 'GBP'))),
        ];
    }
    return $out + ['refunds_note' => 'Refunds are those MCB has recorded in the period, full and partial (each refund is decided by Bella or Lewis and made outside MCB\'s system). A partial refund reduces net paid by its amount and never counts the whole order as refunded. TEST payments are rehearsals, never revenue.', 'timezone' => mcb_business_timezone()['timezone']];
}

/**
 * Gross contribution after fulfilment cost, ESTIMATED and ACTUAL kept apart.
 * Orders without cost data are counted, never treated as zero cost. This is
 * not net profit: VAT, payment fees, creative time and marketing are excluded.
 */
function cc_profit(array $orders, array $economics, array $period): array
{
    $est = ['orders' => 0, 'revenue_minor' => 0, 'cost_minor' => 0, 'contribution_minor' => 0];
    $act = ['orders' => 0, 'revenue_minor' => 0, 'cost_minor' => 0, 'contribution_minor' => 0];
    $awaiting = 0;
    $digital = 0;
    foreach ($orders as $id => $r) {
        if (!cc_in_period($r, $period)) {
            continue;
        }
        if (order_workflow($r) !== 'PHYSICAL') {
            $digital++;
            continue;
        }
        $e = $economics[$id]['EXPECTED'] ?? null;
        if ($e === null || $e['total_cost_minor'] === null) {
            $awaiting++;
        } else {
            $est['orders']++;
            $est['revenue_minor'] += (int) $e['revenue_minor'];
            $est['cost_minor'] += (int) $e['total_cost_minor'];
            $est['contribution_minor'] += (int) $e['contribution_minor'];
        }
        $a = $economics[$id]['ACTUAL'] ?? null;
        if ($a !== null && $a['total_cost_minor'] !== null) {
            $act['orders']++;
            $act['revenue_minor'] += (int) $a['revenue_minor'];
            $act['cost_minor'] += (int) $a['total_cost_minor'];
            $act['contribution_minor'] += (int) $a['contribution_minor'];
        }
    }
    $pct = static fn (array $x): ?float => $x['orders'] > 0 && $x['revenue_minor'] > 0 ? round($x['contribution_minor'] * 100 / $x['revenue_minor'], 1) : null;
    $shape = static fn (array $x): array => $x['orders'] === 0
        ? ['orders' => 0, 'revenue_minor' => null, 'cost_minor' => null, 'contribution_minor' => null, 'contribution_percent' => null]
        : $x + ['contribution_percent' => $pct($x)];
    return [
        'period' => $period['key'],
        'estimated' => ['label' => 'ESTIMATED'] + $shape($est),
        'actual' => ['label' => 'ACTUAL'] + $shape($act),
        'orders_awaiting_cost_data' => $awaiting,
        'digital_orders_not_costed' => $digital,
        'excludes' => fulfilment_data()['economics_exclusions'],
        'note' => 'Gross contribution after fulfilment cost — not net profit. Orders without cost data are counted separately, never as zero cost.',
    ];
}

/** Whether an order belongs to the period: paid in it, or (all) still active. */
function cc_in_period(array $r, array $period): bool
{
    if ($period['start'] === null) {
        return $r['state'] !== 'COMPLETED';
    }
    return mcb_business_in($r['paid_at'], $period);
}

/** The founder's health view: ALL GOOD or ACTION NEEDED, in plain words. */
function cc_health(PDO $pdo): array
{
    $findings = fulfilment_health($pdo);
    $by = static fn (array $checks): array => array_values(array_filter($findings, static fn (array $f): bool => in_array($f['check'], $checks, true)));
    $old = static fn (array $list, int $hours): array => array_values(array_filter($list, static fn (array $f): bool => $f['since'] !== null && strtotime($f['since'] . ' UTC') < time() - $hours * 3600));
    $stranded = array_merge($by(['PAID_ORDER_WITHOUT_PROCESSING_EVENT', 'READY_PACKAGE_WITHOUT_FOUNDER_NOTIFICATION', 'DELIVERED_NOT_COMPLETED']), $old($by(['AUTHORISED_WITHOUT_SUPPLIER_ORDER']), 48));
    $one = static fn (string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    $missing = [];
    if (strlen((string) mcb_setting('token_secret', '')) < 32) $missing[] = 'Customer link secret';
    if (array_filter(MCB_FOUNDERS, 'founder_authorisation_configured') === []) $missing[] = 'Founder authorisation codes';
    if (strlen((string) mcb_setting('notifications.worker_key', '')) < 32) $missing[] = 'Notification bridge key';
    if (trim((string) mcb_setting('resend.api_key', '')) === '' || trim((string) mcb_setting('resend.from', '')) === '') $missing[] = 'Customer email sending';
    $items = [
        ['key' => 'stranded_orders', 'label' => 'Stranded paid orders', 'count' => count($stranded)],
        ['key' => 'notification_failures', 'label' => 'Founder notifications not delivered', 'count' => $one("SELECT COUNT(*) FROM founder_notifications WHERE status IN ('FAILED','ABANDONED')")],
        ['key' => 'overdue_supplier_action', 'label' => 'Supplier orders not placed 48 hours after authorisation', 'count' => count($old($by(['AUTHORISED_WITHOUT_SUPPLIER_ORDER']), 48))],
        ['key' => 'overdue_tracking', 'label' => 'Supplier orders past their dispatch date with no tracking', 'count' => count($by(['SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH']))],
        ['key' => 'overdue_delivery', 'label' => 'Parcels past their expected delivery', 'count' => count($by(['DISPATCHED_PARCEL_OVERDUE']))],
        ['key' => 'unresolved_exceptions', 'label' => 'Unresolved exceptions', 'count' => $one("SELECT COUNT(*) FROM fulfilment_exceptions WHERE status = 'OPEN'") + $one("SELECT COUNT(*) FROM creative_jobs WHERE status = 'EXCEPTION'")],
        ['key' => 'failed_automation', 'label' => 'Customer emails that failed to send', 'count' => $one("SELECT COUNT(*) FROM customer_communications WHERE status = 'FAILED'")],
        ['key' => 'configuration_missing', 'label' => 'Configuration missing', 'count' => count($missing), 'detail' => $missing],
    ];
    // No customer abandoned.
    $care = care_health($pdo);
    foreach (CARE_HEALTH_LABELS as $check => $label) {
        $found = array_values(array_filter($care, static fn (array $f): bool => $f['check'] === $check));
        $items[] = ['key' => 'support_' . strtolower($check), 'label' => $label, 'count' => count($found), 'detail' => array_values(array_unique(array_map(static fn (array $f): string => (string) $f['reference'], $found)))];
    }
    // Every other failure check (System readiness), except launch configuration, which readiness reports.
    require_once __DIR__ . '/resilience.php';
    $known = ['PAID_ORDER_NOT_PROCESSED', 'FOUNDER_NOTIFICATION_UNDELIVERED', 'SUPPLIER_ORDER_NOT_PLACED', 'SHIPMENT_OVERDUE', 'CUSTOMER_EMAIL_FAILED', 'SUPPORT_CASE_ABANDONED', 'REFUND_AUTHORISED_NOT_RECORDED', 'REPLACEMENT_AUTHORISED_NOT_ACTIONED', 'REQUIRED_CONFIGURATION_MISSING'];
    $other = array_values(array_filter(resilience_failures($pdo)['checks'], static fn (array $c): bool => $c['count'] > 0 && !in_array($c['key'], $known, true)));
    $items[] = ['key' => 'other_failures', 'label' => 'Other failures needing attention (see System readiness)', 'count' => array_sum(array_column($other, 'count')), 'detail' => array_column($other, 'label')];
    $needed = array_values(array_filter($items, static fn (array $i): bool => $i['count'] > 0));
    // Never "all good": these checks cover known failure modes, not everything.
    return [
        'status' => $needed === [] ? 'NO_PROBLEMS_FOUND' : 'ACTION_NEEDED',
        'label' => $needed === [] ? 'No problems found by these checks' : 'Action needed',
        'items' => $items,
        'stranded' => array_map(static fn (array $f): array => ['order_id' => $f['order_id'], 'reference' => $f['reference'], 'check' => $f['check'], 'since' => $f['since']], $stranded),
    ];
}

/**
 * Launch readiness, truthfully: READY only where the server can see the thing
 * is in place and verified — never because the code for it exists.
 */
function cc_readiness(PDO $pdo): array
{
    $item = static fn (string $key, string $label, string $status, string $detail): array => ['key' => $key, 'label' => $label, 'status' => $status, 'detail' => $detail];
    $out = [];

    $routes = supplier_routes();
    $physical = array_keys(array_filter(catalogue_data()['skus'] ?? [], static fn (array $s): bool => ($s['fulfilment'] ?? '') === 'PHYSICAL' && ($s['orderable'] ?? true)));
    $covered = array_filter($physical, static fn (string $sku): bool => ($r = supplier_route_for_sku($sku)) !== null && $r['verification_status'] === 'VERIFIED');
    $out[] = $item('supplier_routes', 'Supplier routes',
        $routes === [] ? 'NEEDS_FOUNDER_ACTION' : (count($covered) === count($physical) ? 'READY' : 'PARTIAL'),
        $routes === [] ? 'No supplier routes on the server yet.' : count($covered) . ' of ' . count($physical) . ' physical products have a verified route.');

    $templates = artwork_data()['templates'];
    $dataRequired = array_filter($templates, static fn (array $t): bool => ($t['status'] ?? '') === 'TEMPLATE_REQUIRED' || ($t['manufacturing_data_required'] ?? []) !== []);
    $out[] = $item('manufacturer_templates', 'Manufacturer templates', $dataRequired === [] ? 'READY' : 'NEEDS_EXTERNAL_VERIFICATION',
        count($templates) - count($dataRequired) . ' of ' . count($templates) . ' templates complete; the rest need manufacturer data.');

    $profiles = creative_data()['capacity_profiles'];
    $verified = array_filter($profiles, static fn (array $p): bool => (creative_capacity_profile((string) $p['sku'])['status'] ?? null) === 'VERIFIED');
    $out[] = $item('vinyl_capacities', 'Vinyl capacities', count($verified) === count($profiles) ? 'READY' : ($verified === [] ? 'NEEDS_EXTERNAL_VERIFICATION' : 'PARTIAL'),
        count($verified) . ' of ' . count($profiles) . ' record formats have manufacturer-verified capacity.');

    $rule = mcb_config()['fulfilment']['commercial_safety'] ?? null;
    $out[] = $item('commercial_safety_rule', 'Commercial safety rule', is_array($rule) && array_key_exists('min_contribution_minor', $rule) ? 'READY' : 'NEEDS_FOUNDER_ACTION',
        is_array($rule) && array_key_exists('min_contribution_minor', $rule) ? 'A minimum contribution is configured.' : 'Not configured: only a negative expected contribution is flagged.');

    $founders = array_values(array_filter(MCB_FOUNDERS, 'founder_authorisation_configured'));
    $out[] = $item('founder_authorisation', 'Founder authorisation', count($founders) === count(MCB_FOUNDERS) ? 'READY' : ($founders === [] ? 'NOT_READY' : 'PARTIAL'),
        $founders === [] ? 'No founder authorisation code is configured.' : 'Configured for ' . implode(' and ', array_map(static fn (string $f): string => ucfirst(strtolower($f)), $founders)) . '.');

    $bridge = cc_bridge_status($pdo);
    $out[] = $item('notification_bridge', 'Notification bridge', $bridge['status'], $bridge['detail']);

    $music = creative_data()['selected_music_platform'];
    $out[] = $item('music_platform', 'Music platform', $music['integration'] === 'INTEGRATED' && $music['capabilities_verified'] ? 'READY' : 'NEEDS_FOUNDER_ACTION',
        $music['name'] . ': founder selected; account not yet opened; integration pending. Songs are produced manually meanwhile.');

    $videoLimits = video_data()['planning_limits'];
    $out[] = $item('video_capacity', 'Memory Music Video capacity', 'NEEDS_EXTERNAL_VERIFICATION',
        "Planning figures from the Founders ({$videoLimits['capacity_per_period']} videos per period, up to " . (int) round($videoLimits['max_video_seconds'] / 60) . ' minutes) are pending verification with the platform; videos are produced manually meanwhile.');

    $out[] = $item('artwork_production', 'Artwork production', 'DEFERRED', 'No artwork provider is selected; artwork is designed by people and checked by MCB.');

    $limits = array_map('production_role_limit', ['CREATIVE_ART_MASTER', 'PRINT_PRODUCTION_MASTER', 'AUDIO_PRODUCTION_MASTER', 'CUSTOMER_LISTENING_COPY']);
    $low = array_filter($limits, static fn (array $r): bool => $r['php_limit_bytes'] !== null && $r['php_limit_bytes'] < $r['configured_bytes']);
    $out[] = $item('hosting_upload_limits', 'Hosting upload limits', $low === [] ? 'NEEDS_EXTERNAL_VERIFICATION' : 'NOT_READY',
        $low === [] ? 'This server allows the configured file sizes; confirm on the live host.' : 'This server allows smaller files than MCB production needs.');

    $out[] = $item('legal_review', 'Legal review', 'NEEDS_EXTERNAL_VERIFICATION', 'Retention periods, consent wording and terms still need professional legal review.');

    $out[] = $item('customer_care_mailbox', 'Customer care mailbox', 'NEEDS_FOUNDER_ACTION',
        'Replies to MCB emails go to ' . mcb_support_address() . '. Confirm it receives mail, and keep support@mycustombeats.com forwarding to it for replies to earlier emails.');
    require_once __DIR__ . '/business.php';
    $tz = biz_timezone();
    $out[] = $item('business_timezone', 'Business timezone', 'READY', "Business days, weeks and months use {$tz['timezone']} (" . ($tz['source'] === 'FOUNDER_DECISION' ? 'founder decision' : 'server configuration') . ').');
    $out[] = $item('payment_fees', 'Payment fees', 'READY',
        'Actual-first (founder decision): each order uses its recorded payment fee. Until one is recorded the fee is UNKNOWN and that order\'s contribution is incomplete.');
    $thresholds = mcb_setting('business.thresholds', null);
    $out[] = $item('commercial_thresholds', 'Commercial alert thresholds', is_array($thresholds) && $thresholds !== [] ? 'PARTIAL' : 'DEFERRED',
        is_array($thresholds) && $thresholds !== [] ? 'Some commercial alert thresholds are configured; the rest are not evaluated.' : 'Deliberately not configured yet (founder decision); those alerts show NOT CONFIGURED. Negative-contribution and commercial safety protection still apply.');
    $out[] = $item('support_retention', 'Support records retention', 'NEEDS_EXTERNAL_VERIFICATION',
        'Support messages, evidence, refund records and privacy reviews are kept until a retention policy is set (legal review required).');

    $live = (int) $pdo->query("SELECT COUNT(*) FROM orders WHERE status IN ('PAID','REFUNDED') AND stripe_livemode = 1")->fetchColumn();
    $out[] = $item('live_payment', 'Live payment verification', $live > 0 ? 'READY' : 'NEEDS_EXTERNAL_VERIFICATION',
        $live > 0 ? 'A live payment has been recorded.' : 'No live payment has been recorded yet.');
    return $out;
}

/** The notification bridge as it really is. Telegram is "connected" only once a notification was delivered by it. */
function cc_bridge_status(PDO $pdo): array
{
    $key = strlen((string) mcb_setting('notifications.worker_key', '')) >= 32;
    $channels = array_column($pdo->query("SELECT delivered_channel, MAX(delivered_at) AS last FROM founder_notifications WHERE status = 'DELIVERED' AND delivered_channel IS NOT NULL GROUP BY delivered_channel")->fetchAll(), 'last', 'delivered_channel');
    $telegram = isset($channels['TELEGRAM']);
    return [
        'status' => !$key ? 'NOT_READY' : ($telegram ? 'READY' : 'NEEDS_EXTERNAL_VERIFICATION'),
        'detail' => !$key ? 'No notification bridge is configured; notifications wait in the staff queue.'
            : ($telegram ? 'Telegram delivery confirmed (last ' . $channels['TELEGRAM'] . ' UTC).' : 'A bridge key is configured, but no notification has been delivered by Telegram yet.'),
        'telegram' => $telegram ? 'CONNECTED' : 'NOT_CONNECTED',
        'last_delivery' => $channels,
    ];
}

/** The founder notification centre, from the existing outbox. Titles and references only. */
function cc_notifications(PDO $pdo, string $filter): array
{
    $where = match ($filter) {
        'delivered' => "status = 'DELIVERED'",
        'failed' => "status IN ('FAILED','ABANDONED')",
        'all' => '1=1',
        default => "(status IN ('FAILED','ABANDONED') OR (status IN ('PENDING','DELIVERING') AND created_at < UTC_TIMESTAMP() - INTERVAL 1 HOUR))",
    };
    $types = array_column(founder_notification_types_list(), 'title', 'type');
    $channel = static fn (?string $c): string => match ($c) {
        'TELEGRAM' => 'Telegram', 'EMAIL_FALLBACK', 'EMAIL' => 'Email fallback', 'STAFF_QUEUE' => 'Staff queue', null => 'Not delivered yet', default => 'Other',
    };
    $rows = $pdo->query("SELECT id, notification_type, order_id, subject_reference, status, attempts, delivered_channel, delivered_at, created_at FROM founder_notifications WHERE {$where} ORDER BY id DESC LIMIT 100")->fetchAll();
    return [
        'filter' => in_array($filter, ['delivered', 'failed', 'all'], true) ? $filter : 'needs_action',
        'bridge' => cc_bridge_status($pdo),
        'notifications' => array_map(static fn (array $n): array => [
            'id' => (int) $n['id'], 'title' => $types[$n['notification_type']] ?? ucfirst(strtolower(str_replace('_', ' ', $n['notification_type']))),
            'reference' => $n['subject_reference'], 'order_id' => $n['order_id'] === null ? null : (int) $n['order_id'],
            'status' => match ($n['status']) { 'DELIVERED' => 'Delivered', 'FAILED' => 'Failed — will try again', 'ABANDONED' => 'Failed — needs a person', default => 'Waiting to be delivered' },
            'needs_action' => in_array($n['status'], ['FAILED', 'ABANDONED'], true),
            'channel' => $channel($n['delivered_channel']), 'delivered_at' => $n['delivered_at'], 'created_at' => $n['created_at'], 'attempts' => (int) $n['attempts'],
        ], $rows),
    ];
}

function founder_notification_types_list(): array
{
    return operations_data()['founder_notifications'] ?? [];
}

/** MCB Today: tiles, pipeline, attention, customers, revenue, profit, approvals, health — one response. */
function cc_overview(PDO $pdo, string $periodKey, ?int $now = null): array
{
    $period = cc_period($periodKey, $now);
    $orders = cc_paid_orders($pdo);
    $economics = cc_latest_economics($pdo);
    $quality = cc_quality_items($pdo, $orders);
    $approvals = cc_approvals($pdo, $orders, $economics);
    $health = cc_health($pdo);
    $attention = cc_attention($pdo, $orders, $economics, $quality, $approvals, $health);
    $customers = cc_customer_problems($pdo, $orders);

    $pipeline = array_fill_keys(CC_PIPELINE, 0);
    foreach ($orders as $r) {
        if ($r['stage'] === 'DELIVERED' && $r['state'] === 'COMPLETED' && !cc_in_period($r, $period) && !cc_delivered_in($r, $period)) {
            continue;
        }
        $pipeline[$r['stage']]++;
    }
    $inPeriod = array_filter($orders, static fn (array $r): bool => cc_in_period($r, $period));
    $count = static fn (callable $f): int => count(array_filter($orders, $f));
    $problemKinds = ['DELIVERY_EXCEPTION', 'FULFILMENT_EXCEPTION', 'MANUFACTURING_DATA', 'ARTWORK_EXCEPTION', 'CREATIVE_EXCEPTION', 'CUSTOMER_SUPPORT', 'PRIVACY_REVIEW', 'STRANDED_ORDER', 'FOUNDER_DECISION', 'VIDEO_EXCEPTION'];
    $revenue = cc_revenue($pdo, $now);
    $profit = cc_profit($orders, $economics, $period);

    return [
        'period' => $period,
        'generated_at' => gmdate('Y-m-d H:i:s', $now ?? time()),
        'today' => [
            'paid' => count($inPeriod),
            'new_memories' => array_sum(array_map(static fn (array $r): int => (int) $r['memories'], $inPeriod)),
            'creating' => $count(static fn (array $r): bool => in_array($r['stage'], ['NEW', 'CREATING'], true)),
            'needs_quality_check' => count(array_unique(array_column($quality, 'order_id'))),
            'needs_your_approval' => count($approvals['pending']),
            'being_made' => $count(static fn (array $r): bool => $r['stage'] === 'BEING_MADE'),
            'on_the_way' => $count(static fn (array $r): bool => $r['stage'] === 'ON_THE_WAY'),
            'delivered' => $count(static fn (array $r): bool => cc_delivered_in($r, $period)),
            'needs_attention' => count(array_unique(array_map(static fn (array $c): int => $c['order']['order_id'], array_filter($attention, static fn (array $c): bool => $c['order'] !== null && in_array($c['kind'], $problemKinds, true))))),
            'revenue' => $period['key'] === 'week' ? $revenue['week'] : ($period['key'] === 'all' ? null : $revenue['today']),
            'estimated_gross_contribution_minor' => $profit['estimated']['contribution_minor'],
            'actual_gross_contribution_minor' => $profit['actual']['contribution_minor'],
        ],
        'pipeline' => array_map(static fn (string $s): array => ['stage' => $s, 'label' => CC_STAGE_LABELS[$s], 'count' => $pipeline[$s]], CC_PIPELINE),
        'attention' => $attention,
        'customers' => $customers,
        'customer_care' => care_command_summary($pdo),
        'revenue' => $revenue,
        'profit' => $profit,
        'approvals' => ['pending' => count($approvals['pending'])],
        'health' => ['status' => $health['status'], 'label' => $health['label'], 'items' => $health['items']],
        'music_platform' => creative_data()['selected_music_platform'],
        'videos' => video_command_summary($pdo, $period),
    ];
}

/** Delivered (or revealed) within the period; for "all active", delivered but not yet completed. */
function cc_delivered_in(array $r, array $period): bool
{
    if ($r['stage'] !== 'DELIVERED') {
        return false;
    }
    if ($period['start'] === null) {
        return $r['state'] !== 'COMPLETED';
    }
    $at = $r['delivered_on'] !== null ? $r['delivered_on'] . ' 00:00:00' : $r['revealed_at'];
    return mcb_business_in($at, $period);
}

/** Orders in a pipeline stage (a click on the pipeline), safe list fields only. */
function cc_orders(PDO $pdo, ?string $stage, string $periodKey): array
{
    $period = cc_period($periodKey);
    $out = [];
    foreach (cc_paid_orders($pdo) as $r) {
        if ($stage !== null && $r['stage'] !== $stage) {
            continue;
        }
        if ($r['state'] === 'COMPLETED' && !cc_in_period($r, $period) && !cc_delivered_in($r, $period)) {
            continue;
        }
        $out[] = cc_order_summary($r);
        if (count($out) >= 200) {
            break;
        }
    }
    return $out;
}

/** Search by reference, customer name, email or product. Nothing about the query is logged. */
function cc_search(PDO $pdo, string $q): array
{
    $q = trim($q);
    if (mb_strlen($q) < 2) {
        return [];
    }
    $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], mb_substr($q, 0, 80)) . '%';
    $stmt = $pdo->prepare(
        "SELECT DISTINCT o.id FROM orders o JOIN customers c ON c.id = o.customer_id
          WHERE o.status = 'PAID' AND (o.mcb_reference LIKE :a OR c.name LIKE :b OR c.email LIKE :c
             OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.item_name LIKE :d))
          ORDER BY o.id DESC LIMIT 25"
    );
    $stmt->execute([':a' => $like, ':b' => $like, ':c' => $like, ':d' => $like]);
    $ids = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
    $orders = cc_paid_orders($pdo);
    return array_values(array_map(static fn (int $id): array => cc_order_summary($orders[$id]), array_filter($ids, static fn (int $id): bool => isset($orders[$id]))));
}

/**
 * One order's command card: summary first, then the expandable sections.
 * Opening it changes nothing.
 */
function cc_order_card(PDO $pdo, int $orderId): ?array
{
    $row = operations_order_row($pdo, $orderId);
    if ($row === null || $row['status'] !== 'PAID') {
        return null;
    }
    $all = static function (string $sql, array $params = []) use ($pdo): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    };
    $meta = $all("SELECT o.total_minor, o.currency, c.name, c.email, pe.created_at AS paid_at,
                         (SELECT GROUP_CONCAT(CONCAT(i.quantity, ' × ', i.item_name) ORDER BY i.id SEPARATOR ', ') FROM order_items i WHERE i.order_id = o.id) AS product
                    FROM orders o JOIN customers c ON c.id = o.customer_id LEFT JOIN order_events pe ON pe.order_id = o.id AND pe.dedupe_key = 'paid' WHERE o.id = :o", [':o' => $orderId])[0];
    $r = $row + ['paid_at' => $meta['paid_at']];
    $r['state'] = operational_state($r);
    $r['stage'] = CC_FOUNDER_STAGES[$r['state']] ?? 'NEW';
    $physical = order_workflow($row) === 'PHYSICAL';
    $controller = $physical ? fulfilment_order_record($pdo, $row) : null;
    $economics = cc_latest_economics($pdo)[$orderId] ?? [];
    $problems = $all("SELECT id, kind, status, priority, created_at FROM order_service_requests WHERE order_id = :o AND status IN ('NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS')", [':o' => $orderId]);
    $openExceptions = $controller === null ? [] : array_values(array_filter($controller['exceptions'], static fn (array $x): bool => $x['status'] === 'OPEN'));
    $jobs = $all('SELECT id, track_number, status, lyric_version, current_master_id FROM creative_jobs WHERE order_id = :o ORDER BY track_number', [':o' => $orderId]);
    $titles = [];
    foreach ($jobs as $j) {
        $pkg = $j['lyric_version'] === null ? null : creative_artifact($pdo, "job:{$j['id']}", 'LYRIC_PACKAGE', (int) $j['lyric_version']);
        $titles[(int) $j['id']] = $pkg['body']['title'] ?? null;
    }
    $package = $physical ? current_manufacturing_package($pdo, $orderId) : null;

    return [
        'summary' => [
            'order_id' => $orderId,
            'reference' => $row['mcb_reference'],
            'customer' => $meta['name'],
            'product' => $meta['product'],
            'paid_minor' => (int) $meta['total_minor'],
            'currency' => $meta['currency'],
            'test_payment' => (int) ($row['stripe_livemode'] ?? 0) !== 1,
            'stage' => $r['stage'],
            'stage_label' => CC_STAGE_LABELS[$r['stage']],
            'next_step' => next_action_for($r['state']),
            'stage_since' => cc_stage_since($r),
            'expected_contribution_minor' => isset($economics['EXPECTED']) && $economics['EXPECTED']['contribution_minor'] !== null ? (int) $economics['EXPECTED']['contribution_minor'] : null,
            'delivery' => $physical ? ($controller['delivery_position'] ?? null) : null,
            'problems' => $problems !== [] || $openExceptions !== [],
        ],
        'creative' => array_map(static fn (array $j): array => ['song' => (int) $j['track_number'], 'title' => $titles[(int) $j['id']], 'status' => ucfirst(strtolower(str_replace('_', ' ', (string) $j['status']))), 'finished' => $j['current_master_id'] !== null], $jobs),
        'artwork' => $physical ? array_map(static fn (array $a): array => ['version' => (int) $a['version'], 'quality' => $a['visual_qc_status'], 'current' => (int) $a['is_current'] === 1],
            $all('SELECT version, visual_qc_status, is_current FROM artwork_art_masters WHERE order_id = :o ORDER BY id', [':o' => $orderId])) : null,
        'production' => $physical ? ['package' => $package === null ? null : ['status' => $package['status'], 'version' => (int) $package['version'], 'blockers' => json_decode((string) $package['blockers'], true)]] : null,
        'fulfilment' => $controller,
        'customer' => [
            'name' => $meta['name'],
            'email' => $meta['email'],
            'open_problems' => array_map(static fn (array $p): array => ['case_id' => (int) $p['id'], 'kind' => $p['kind'], 'status' => $p['status'], 'priority' => $p['priority'], 'since' => $p['created_at']], $problems),
            'money' => care_money_facts($pdo, $orderId),
            'emails' => $all('SELECT message_type, status, sent_at FROM customer_communications WHERE order_id = :o ORDER BY id', [':o' => $orderId]),
        ],
        'financial' => [
            'paid_minor' => (int) $meta['total_minor'],
            'currency' => $meta['currency'],
            'estimated' => isset($economics['EXPECTED']) ? ['label' => 'ESTIMATED', 'status' => $economics['EXPECTED']['status'], 'cost_minor' => $economics['EXPECTED']['total_cost_minor'] === null ? null : (int) $economics['EXPECTED']['total_cost_minor'], 'contribution_minor' => $economics['EXPECTED']['contribution_minor'] === null ? null : (int) $economics['EXPECTED']['contribution_minor']] : null,
            'actual' => isset($economics['ACTUAL']) ? ['label' => 'ACTUAL', 'status' => $economics['ACTUAL']['status'], 'cost_minor' => $economics['ACTUAL']['total_cost_minor'] === null ? null : (int) $economics['ACTUAL']['total_cost_minor'], 'contribution_minor' => $economics['ACTUAL']['contribution_minor'] === null ? null : (int) $economics['ACTUAL']['contribution_minor']] : null,
            'note' => 'Gross contribution after fulfilment cost — not net profit.',
        ],
        'history' => array_map(static fn (array $e): array => ['at' => $e['created_at'], 'what' => ucfirst(strtolower(str_replace(['.', '_'], ' ', (string) $e['event_type'])))],
            $all('SELECT event_type, created_at FROM order_events WHERE order_id = :o ORDER BY id DESC LIMIT 60', [':o' => $orderId])),
        'available_actions' => available_staff_actions($row),
        'decision' => $controller['decision'] ?? null,
    ];
}

/** ADVANCED / TECHNICAL: the engineering record, for troubleshooting only. */
function cc_advanced(PDO $pdo, int $orderId): ?array
{
    $row = operations_order_row($pdo, $orderId);
    if ($row === null) {
        return null;
    }
    $all = static function (string $sql) use ($pdo, $orderId): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':o' => $orderId]);
        return $stmt->fetchAll();
    };
    return [
        'lifecycle' => ['state' => operational_state($row), 'stage' => $row['stage'], 'fulfilment_state' => effective_fulfilment_state($row), 'reopen_count' => (int) $row['reopen_count']],
        'events' => $all('SELECT event_type, detail, source, created_at FROM order_events WHERE order_id = :o ORDER BY id'),
        'notifications' => $all('SELECT notification_type, status, attempts, last_error, delivered_channel, created_at, delivered_at FROM founder_notifications WHERE order_id = :o ORDER BY id'),
        'documents' => $all('SELECT scope_key, kind, version, created_by, created_at FROM creative_artifacts WHERE order_id = :o ORDER BY id'),
        'quality_records' => [
            'songs' => $all('SELECT c.id, c.job_id, c.technical_status, c.fact_status, c.creative_status, c.creative_qc, c.created_at FROM creative_candidates c WHERE c.order_id = :o ORDER BY c.id'),
            'artwork' => $all('SELECT id, version, visual_qc_status, visual_qc, created_at FROM artwork_art_masters WHERE order_id = :o ORDER BY id'),
        ],
        'packages' => $all('SELECT version, status, blockers, created_at FROM manufacturing_packages WHERE order_id = :o ORDER BY version'),
    ];
}

/* ------------------------------------------------------------------ */
/* Quality checks in founder language                                   */
/* ------------------------------------------------------------------ */

/** Founder question → the Creative QC criteria it answers. Every criterion is covered exactly once. */
const CC_SONG_QUESTIONS = [
    'story' => ['label' => 'Story correct?', 'criteria' => ['story_fit']],
    'names' => ['label' => 'Names and details correct?', 'criteria' => ['lyric_quality']],
    'professional' => ['label' => 'Song sounds professional?', 'criteria' => ['production_quality']],
    'vocals' => ['label' => 'Vocals good?', 'criteria' => ['vocal_quality']],
    'emotion' => ['label' => 'Emotion right?', 'criteria' => ['emotional_impact']],
    'style' => ['label' => 'Music and style right?', 'criteria' => ['musical_quality', 'genre_fit']],
    'pronunciation' => ['label' => 'Pronunciation right?', 'criteria' => ['pronunciation']],
    'standard' => ['label' => 'Good enough for MCB?', 'criteria' => ['premium_standard', 'memorability']],
];

/** Founder question → the visual QC criteria. The last two allow "not applicable". */
const CC_ARTWORK_QUESTIONS = [
    'customer' => ['label' => 'Correct customer?', 'criteria' => ['no_other_customer_material']],
    'photo' => ['label' => 'Correct photo?', 'criteria' => ['correct_photographs']],
    'names_dates' => ['label' => 'Names and dates correct?', 'criteria' => ['correct_names', 'correct_dates', 'correct_occasion']],
    'spelling' => ['label' => 'Spelling and title correct?', 'criteria' => ['spelling', 'correct_title']],
    'composition' => ['label' => 'Composition good?', 'criteria' => ['crop_composition', 'visual_balance', 'image_quality']],
    'content_safe' => ['label' => 'Important content safe and readable?', 'criteria' => ['text_legibility']],
    'premium' => ['label' => 'Premium MCB standard?', 'criteria' => ['premium_standard']],
    'faces' => ['label' => 'Faces clearly visible?', 'criteria' => ['facial_visibility'], 'not_applicable' => 'No faces in this artwork'],
    'branding' => ['label' => 'MCB branding right?', 'criteria' => ['mcb_branding'], 'not_applicable' => 'No MCB branding used'],
];

/** Founder question → video QC criterion (one each). Branding may honestly be not applicable. */
const CC_VIDEO_QUESTIONS = [
    'customer' => ['label' => 'Correct customer?', 'criteria' => ['correct_customer']],
    'song' => ['label' => 'Correct song?', 'criteria' => ['correct_song']],
    'whole_song' => ['label' => 'Does the film run for the whole song?', 'criteria' => ['complete_song']],
    'photographs' => ['label' => 'Correct photographs?', 'criteria' => ['correct_photographs']],
    'names' => ['label' => 'Names and details correct?', 'criteria' => ['correct_names_details']],
    'timing' => ['label' => 'Photographs timed well?', 'criteria' => ['image_timing']],
    'transitions' => ['label' => 'Transitions right?', 'criteria' => ['transitions']],
    'defects' => ['label' => 'Free of visual defects?', 'criteria' => ['no_visual_defects']],
    'other_customer' => ['label' => 'Nothing from another customer?', 'criteria' => ['no_wrong_customer_media']],
    'sync' => ['label' => 'Picture and sound in sync?', 'criteria' => ['audio_video_sync']],
    'quality' => ['label' => 'Looks sharp and clear?', 'criteria' => ['visual_quality']],
    'emotion' => ['label' => 'Emotion right?', 'criteria' => ['emotional_impact']],
    'standard' => ['label' => 'Premium MCB standard?', 'criteria' => ['premium_standard']],
    'branding' => ['label' => 'MCB branding right?', 'criteria' => ['branding'], 'not_applicable' => 'No MCB branding used'],
];

/** answers: question → 'YES' | 'NO' | 'NOT_APPLICABLE' (only where allowed). */
function cc_answers_to_criteria(array $questions, mixed $answers): array
{
    if (!is_array($answers)) {
        throw new OperationsException('quality_answers_required', 'Answer every question.', 422);
    }
    $criteria = [];
    foreach ($questions as $key => $q) {
        $a = $answers[$key] ?? null;
        $allowed = isset($q['not_applicable']) ? ['YES', 'NO', 'NOT_APPLICABLE'] : ['YES', 'NO'];
        if (!in_array($a, $allowed, true)) {
            throw new OperationsException('quality_answers_required', 'Answer every question: ' . $q['label'], 422);
        }
        foreach ($q['criteria'] as $c) {
            $criteria[$c] = ['YES' => 'PASS', 'NO' => 'CONCERN', 'NOT_APPLICABLE' => 'NOT_APPLICABLE'][$a];
        }
    }
    return $criteria;
}

/** What a founder needs to check this order's songs and artwork. Opening it is audited as a view; it changes nothing. */
function cc_quality_view(PDO $pdo, int $orderId, string $staff): ?array
{
    $row = operations_order_row($pdo, $orderId);
    if ($row === null || $row['status'] !== 'PAID') {
        return null;
    }
    $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')
        ->execute([':o' => $orderId, ':s' => $staff, ':a' => 'COMMAND_CENTRE_QUALITY_VIEW']);
    $songs = [];
    $stmt = $pdo->prepare(
        "SELECT c.id AS candidate_id, c.job_id, c.container, c.duration_ms, c.created_at, j.track_number, j.album_id, j.lyric_version, j.direction_version, j.plan_version
           FROM creative_candidates c JOIN creative_jobs j ON j.id = c.job_id
          WHERE c.order_id = :o AND j.status = 'CREATIVE_QC_REQUIRED' AND c.technical_status = 'PASS' AND c.fact_status = 'PASS' AND c.creative_status = 'PENDING'
          ORDER BY j.track_number"
    );
    $stmt->execute([':o' => $orderId]);
    foreach ($stmt->fetchAll() as $c) {
        $job = (int) $c['job_id'];
        $lyrics = creative_artifact($pdo, "job:{$job}", 'LYRIC_PACKAGE');
        $direction = creative_artifact($pdo, "job:{$job}", 'MUSIC_DIRECTION')['body'] ?? [];
        $plan = creative_artifact($pdo, "job:{$job}", 'COMPOSITION_PLAN')['body'] ?? [];
        $ledger = creative_artifact($pdo, "album:{$c['album_id']}", 'FACT_LEDGER')['body']['facts'] ?? [];
        $track = (int) $c['track_number'];
        $relevant = array_values(array_filter($ledger, static fn (array $f): bool => ($f['tracks'] ?? null) === 'ALL' || (is_array($f['tracks'] ?? null) && in_array($track, $f['tracks'], true))));
        $songs[] = [
            'candidate_id' => (int) $c['candidate_id'],
            'song' => $track,
            'title' => $lyrics['body']['title'] ?? null,
            'target_duration_seconds' => $plan['target_duration_seconds'] ?? ($direction['target_duration_seconds'] ?? null),
            'actual_duration_seconds' => $c['duration_ms'] === null ? null : (int) round((int) $c['duration_ms'] / 1000),
            'format' => $c['container'],
            'facts' => array_map(static fn (array $f): array => ['type' => $f['type'], 'value' => $f['value'] ?? null, 'exact' => ($f['classification'] ?? '') === 'EXACT'],
                array_values(array_filter($relevant, static fn (array $f): bool => !in_array($f['type'], ['MUSIC_DIRECTION', 'MOOD', 'EXCLUSION'], true)))),
            'protected_names' => array_values(array_map(static fn (array $f): string => (string) $f['value'], array_filter($relevant, static fn (array $f): bool => $f['type'] === 'NAME'))),
            'pronunciation_notes' => array_values(array_filter(array_map(static fn (array $f): ?string => is_string($f['pronunciation'] ?? null) ? $f['value'] . ': ' . $f['pronunciation'] : null, $relevant))),
            'requested_style' => array_values(array_map(static fn (array $f): string => (string) ($f['value'] ?? ''), array_filter($relevant, static fn (array $f): bool => $f['type'] === 'MUSIC_DIRECTION'))),
            'emotional_direction' => array_values(array_filter([
                is_string($direction['mood'] ?? null) ? $direction['mood'] : (is_array($direction['mood'] ?? null) ? implode(', ', $direction['mood']) : null),
                is_string($direction['energy'] ?? null) ? 'Energy: ' . $direction['energy'] : null,
                is_array($direction['positive_directions'] ?? null) ? implode('; ', $direction['positive_directions']) : null,
            ])),
            'lyrics' => $lyrics['body']['sections'] ?? [],
            'listen' => ['candidate_id' => (int) $c['candidate_id']],
        ];
    }
    $artwork = [];
    $arts = $pdo->prepare("SELECT a.id, a.job_id, a.version, a.width, a.height, a.source_upload_ids, j.sku, j.unit_id FROM artwork_art_masters a JOIN artwork_creative_jobs j ON j.id = a.job_id WHERE a.order_id = :o AND a.visual_qc_status = 'PENDING' AND a.is_current = 1");
    $arts->execute([':o' => $orderId]);
    foreach ($arts->fetchAll() as $a) {
        $jobRow = $pdo->prepare('SELECT * FROM artwork_creative_jobs WHERE id = :id');
        $jobRow->execute([':id' => (int) $a['job_id']]);
        $input = artwork_job_input($pdo, $jobRow->fetch());
        $sources = array_values(array_filter(array_map('intval', explode(',', (string) $a['source_upload_ids']))));
        $photoIds = [];
        if ($sources !== []) {
            $in = implode(',', array_fill(0, count($sources), '?'));
            $p = $pdo->prepare("SELECT public_id FROM order_uploads WHERE order_id = ? AND id IN ({$in})");
            $p->execute(array_merge([$orderId], $sources));
            $photoIds = $p->fetchAll(PDO::FETCH_COLUMN);
        }
        $prints = $pdo->prepare('SELECT id, template_id, version FROM print_production_masters WHERE art_master_id = :a AND is_current = 1');
        $prints->execute([':a' => (int) $a['id']]);
        $artwork[] = [
            'art_master_id' => (int) $a['id'], 'version' => (int) $a['version'], 'size' => (int) $a['width'] . ' × ' . (int) $a['height'] . ' px',
            'product' => $input['product']['name'] ?? $a['sku'],
            'album_title' => $input['album_title'], 'track_titles' => $input['track_titles'], 'occasions' => $input['occasions'],
            'names' => array_values(array_map(static fn (array $f): string => (string) $f['value'], array_filter($input['facts'], static fn (array $f): bool => $f['type'] === 'NAME'))),
            'dates' => array_values(array_map(static fn (array $f): string => (string) $f['value'], array_filter($input['facts'], static fn (array $f): bool => in_array($f['type'], ['DATE', 'YEAR', 'MILESTONE'], true)))),
            'source_photo_ids' => $photoIds,
            'print_previews' => array_map(static fn (array $p): array => ['print_master_id' => (int) $p['id'], 'template' => $p['template_id'], 'version' => (int) $p['version']], $prints->fetchAll()),
        ];
    }
    $videos = [];
    $v = $pdo->prepare("SELECT j.id AS video_job_id, j.audio_duration_ms, j.rework_count, c.id AS candidate_id, c.version, c.container, c.duration_ms, c.width, c.height, c.technical_checks, m.sequence
                          FROM video_jobs j JOIN video_candidates c ON c.video_job_id = j.id AND c.qc_status = 'PENDING' JOIN video_entitlements e ON e.id = j.entitlement_id JOIN order_memories m ON m.id = e.memory_id
                         WHERE j.order_id = :o AND j.status = 'QUALITY_CHECK_REQUIRED' ORDER BY j.id");
    $v->execute([':o' => $orderId]);
    foreach ($v->fetchAll() as $x) {
        $inputs = video_production_inputs($pdo, (int) $x['video_job_id']);
        $videos[] = [
            'video_job_id' => (int) $x['video_job_id'], 'candidate_id' => (int) $x['candidate_id'], 'version' => (int) $x['version'], 'song' => (int) $x['sequence'],
            'song_title' => $inputs['song_title'], 'container' => $x['container'],
            'song_seconds' => $x['audio_duration_ms'] === null ? null : (int) round((int) $x['audio_duration_ms'] / 1000),
            'video_seconds' => $x['duration_ms'] === null ? null : (int) round((int) $x['duration_ms'] / 1000),
            'picture' => $x['width'] === null ? null : (int) $x['width'] . ' × ' . (int) $x['height'],
            'checks' => json_decode((string) $x['technical_checks'], true), 'rework_count' => (int) $x['rework_count'],
            'facts' => $inputs['facts'], 'photographs' => count($inputs['photographs']),
        ];
    }
    return [
        'order_id' => $orderId,
        'reference' => $row['mcb_reference'],
        'songs' => $songs,
        'artwork' => $artwork,
        'videos' => $videos,
        'video_questions' => array_map(static fn (string $k, array $q): array => ['key' => $k, 'label' => $q['label'], 'not_applicable' => $q['not_applicable'] ?? null], array_keys(CC_VIDEO_QUESTIONS), CC_VIDEO_QUESTIONS),
        'song_questions' => array_map(static fn (string $k, array $q): array => ['key' => $k, 'label' => $q['label']], array_keys(CC_SONG_QUESTIONS), CC_SONG_QUESTIONS),
        'artwork_questions' => array_map(static fn (string $k, array $q): array => ['key' => $k, 'label' => $q['label'], 'not_applicable' => $q['not_applicable'] ?? null], array_keys(CC_ARTWORK_QUESTIONS), CC_ARTWORK_QUESTIONS),
        'note' => 'Internal quality review. The customer is not asked to approve anything and is not contacted by these decisions.',
    ];
}

/** A founder's song quality decision: PASS (and the song becomes the master), REWORK (internal) or ESCALATE. */
function cc_song_quality_check(PDO $pdo, int $orderId, int $candidateId, mixed $answers, mixed $decision, ?string $note, string $staff): array
{
    $outcome = ['PASS' => 'PASS', 'REWORK' => 'REGENERATE', 'ESCALATE' => 'ESCALATE'][is_string($decision) ? $decision : ''] ?? null;
    if ($outcome === null) {
        throw new OperationsException('invalid_decision', 'Choose: pass, send back for internal rework, or escalate.', 422);
    }
    $criteria = cc_answers_to_criteria(CC_SONG_QUESTIONS, $answers);
    $load = static function () use ($pdo, $candidateId, $orderId): array {
        $stmt = $pdo->prepare('SELECT c.*, a.status AS attempt_status, a.attempt_number FROM creative_candidates c JOIN creative_generation_attempts a ON a.id = c.attempt_id WHERE c.id = :id FOR UPDATE');
        $stmt->execute([':id' => $candidateId]);
        $c = $stmt->fetch();
        if ($c === false || (int) $c['order_id'] !== $orderId) {
            throw new OperationsException('candidate_not_found', 'No such song on this order.', 404);
        }
        return $c;
    };
    $result = creative_record_creative_qc($pdo, $orderId, $load(), $criteria, $outcome, $staff);
    if ($outcome === 'PASS') {
        $result['master'] = creative_promote_master($pdo, $orderId, $load(), $staff);
    }
    record_order_event($pdo, $orderId, 'FOUNDER.QUALITY_REVIEWED', ['kind' => 'SONG', 'candidate_id' => $candidateId, 'decision' => $decision, 'by' => $staff, 'with_note' => $note !== null]);
    if ($note !== null) {
        $pdo->prepare('INSERT INTO order_staff_notes (order_id, note, staff, created_at) VALUES (:o, :n, :s, UTC_TIMESTAMP())')->execute([':o' => $orderId, ':n' => 'Song quality check (' . strtolower((string) $decision) . '): ' . $note, ':s' => $staff]);
    }
    return $result + ['decision' => $decision];
}

/** A founder's artwork quality decision: PASS, REWORK (internal) or ESCALATE. */
function cc_artwork_quality_check(PDO $pdo, int $orderId, int $artMasterId, mixed $answers, mixed $decision, ?string $note, string $staff): array
{
    if (!in_array($decision, ['PASS', 'REWORK', 'ESCALATE'], true)) {
        throw new OperationsException('invalid_decision', 'Choose: pass, send back for internal rework, or escalate.', 422);
    }
    $criteria = cc_answers_to_criteria(CC_ARTWORK_QUESTIONS, $answers);
    $result = production_visual_qc($pdo, $orderId, $artMasterId, $criteria, $decision, $note, $staff);
    record_order_event($pdo, $orderId, 'FOUNDER.QUALITY_REVIEWED', ['kind' => 'ARTWORK', 'art_master_id' => $artMasterId, 'decision' => $decision, 'by' => $staff, 'with_note' => $note !== null]);
    return $result + ['decision' => $decision];
}

/** A founder's video quality decision: PASS (a new immutable Video Master), REWORK (internal) or ESCALATE. */
function cc_video_quality_check(PDO $pdo, int $orderId, int $candidateId, mixed $answers, mixed $decision, ?string $note, string $staff): array
{
    if (!in_array($decision, ['PASS', 'REWORK', 'ESCALATE'], true)) {
        throw new OperationsException('invalid_decision', 'Choose: pass, send back for internal rework, or escalate.', 422);
    }
    $criteria = cc_answers_to_criteria(CC_VIDEO_QUESTIONS, $answers);
    $stmt = $pdo->prepare('SELECT video_job_id FROM video_candidates WHERE id = :c AND order_id = :o');
    $stmt->execute([':c' => $candidateId, ':o' => $orderId]);
    $jobId = $stmt->fetchColumn();
    $job = $jobId === false ? null : video_job_row($pdo, (int) $jobId, true);
    if ($job === null) {
        throw new OperationsException('candidate_not_found', 'No such video on this order.', 404);
    }
    return video_quality_check($pdo, $job, $candidateId, $criteria, $decision, $note, $staff) + ['decision' => $decision];
}

/** The Videos view: summary, capacity (clearly pending verification), jobs in progress and metrics. */
function cc_videos_view(PDO $pdo, array $period): array
{
    $orders = cc_paid_orders($pdo);
    $jobs = [];
    foreach ($pdo->query("SELECT j.id, j.order_id, j.status, j.waiting_on, j.updated_at, m.sequence FROM video_jobs j JOIN video_entitlements e ON e.id = j.entitlement_id JOIN order_memories m ON m.id = e.memory_id WHERE j.status <> 'REVEALED' ORDER BY j.updated_at")->fetchAll() as $j) {
        if (isset($orders[(int) $j['order_id']])) {
            $jobs[] = ['video_job_id' => (int) $j['id'], 'song' => (int) $j['sequence'], 'status' => $j['status'], 'waiting_on' => $j['waiting_on'], 'since' => $j['updated_at'], 'order' => cc_order_summary($orders[(int) $j['order_id']])];
        }
    }
    return ['summary' => video_command_summary($pdo, $period), 'jobs' => $jobs, 'metrics' => video_metrics($pdo), 'platform' => video_data()['platform'], 'planning_limits' => video_data()['planning_limits']];
}

