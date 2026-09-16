<?php
/**
 * MCB™ Security, Resilience & Automation Readiness (17 September 2026).
 *
 * One honest view of whether MCB is working and ready:
 *
 *   FAILURES NEEDING ATTENTION  every consequential thing that is stuck, failed
 *                               or overdue, with its order reference, category,
 *                               time and how it may be recovered
 *   SYSTEM READINESS           required configuration, classified, never showing
 *                               a value (secrets stay secret)
 *   AUTOMATION READINESS       what really runs by itself, what is prepared but
 *                               waits for an external connection, what people do
 *                               by design and what only Bella or Lewis decide
 *   FOUNDER ACTIONS            what Bella and Lewis still have to do, generated
 *                               from the live state where possible
 *
 * No false "all good": anything unknown or missing is shown as such.
 *
 * RETRIES. Work that failed is classified:
 *   SAFE_TO_RETRY               repeating it cannot duplicate a consequence
 *   RETRY_WITH_IDEMPOTENCY_KEY  repeating is safe because a key/claim makes it once-only
 *   MANUAL_REVIEW_REQUIRED      it may already have happened (e.g. an email interrupted
 *                               mid-send); a person checks before anything is repeated
 *   DO_NOT_AUTO_RETRY           a financial or irreversible step. Money-out actions are
 *                               never executed by automation in the first place.
 * Only the first two have a recovery action here, and each is a person's click.
 * Nothing here spends, refunds, purchases, cancels or re-prices anything.
 */

declare(strict_types=1);

require_once __DIR__ . '/uploads.php';
require_once __DIR__ . '/security.php';

require_once __DIR__ . '/command-centre.php';
require_once __DIR__ . '/routing.php';
require_once __DIR__ . '/notify.php';
require_once __DIR__ . '/lifecycle-messages.php';

const MCB_RETRY_CLASSES = ['SAFE_TO_RETRY', 'RETRY_WITH_IDEMPOTENCY_KEY', 'MANUAL_REVIEW_REQUIRED', 'DO_NOT_AUTO_RETRY'];

/**
 * Every kind of recoverable work, and how it may be retried. Money-out work is
 * DO_NOT_AUTO_RETRY: it cannot execute automatically at all.
 */
const MCB_RECOVERABLE_WORK = [
    'ORDER_PROCESSING_EVENT' => ['label' => 'Paid order handed to processing', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'The event and founder notification carry fixed dedupe keys.'],
    'PAYMENT_CONFIRMATION_EMAIL' => ['label' => 'Payment confirmation email', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'A conditional claim (customer_notified_at) lets exactly one sender through.'],
    'LIFECYCLE_EMAIL' => ['label' => 'Customer update email (production, dispatch, parcel, delivery, video, support reply, follow-up)', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'Each message has an order + type + dedupe key; only a FAILED claim can be reclaimed.'],
    'INTERRUPTED_EMAIL' => ['label' => 'Email interrupted mid-send', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'The provider may already have accepted it; repeating could send it twice.'],
    'FOUNDER_NOTIFICATION' => ['label' => 'Founder notification', 'retry' => 'SAFE_TO_RETRY', 'why' => 'One outbox row per dedupe key; the staff queue shows the same item meanwhile.'],
    'LIFECYCLE_HOOKS' => ['label' => 'Follow-up hooks prepared at completion', 'retry' => 'SAFE_TO_RETRY', 'why' => 'Prepared with INSERT IGNORE; nothing is sent.'],
    'CREATIVE_JOBS' => ['label' => 'Creative jobs for a paid order', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'One job per memory (unique key).'],
    'VIDEO_ENTITLEMENT' => ['label' => 'Memory Music Video entitlement and capacity', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'One entitlement per order line and one job per entitlement (unique keys).'],
    'MANUFACTURING_PACKAGE' => ['label' => 'Manufacturing package', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'One package per content hash; a changed input makes a new version.'],
    'CREATIVE_GENERATION' => ['label' => 'Music generation / candidate', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'Generation is manual (no platform is integrated); a failed attempt never replaces the protected master.'],
    'QUALITY_CHECK' => ['label' => 'MCB internal quality check', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'A person decides; a repeated decision is refused by state guards.'],
    'SUPPLIER_ORDER_RECORD' => ['label' => 'Recording a partner order a person placed', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'Unique per order and partner reference; a person confirms what was placed.'],
    'SHIPMENT' => ['label' => 'Parcels and tracking', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'Adding a parcel is deliberate (split shipments); a person records what happened.'],
    'REVIEW_REQUEST' => ['label' => 'Review request', 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY', 'why' => 'One per order; held while a support case is open or cooling.'],
    'SUPPLIER_PURCHASE_AUTHORISATION' => ['label' => 'Supplier purchase authorisation', 'retry' => 'DO_NOT_AUTO_RETRY', 'why' => 'Bella or Lewis only, with their own code. Never automated.'],
    'SUPPLIER_PURCHASE' => ['label' => 'Supplier purchase (placing and paying)', 'retry' => 'DO_NOT_AUTO_RETRY', 'why' => 'A person places it by hand after founder authorisation. No automatic checkout exists.'],
    'REPLACEMENT_PURCHASE' => ['label' => 'Replacement or reproduction', 'retry' => 'DO_NOT_AUTO_RETRY', 'why' => 'Founder decision, then placed by a person.'],
    'SUPPORT_CASE' => ['label' => 'Customer support case', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'A person replies; a repeated reply is a new message the customer sees.'],
    'COMMERCIAL_DATA' => ['label' => 'Expected cost data', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'Route and cost evidence is added by a person.'],
    'CONFIGURATION' => ['label' => 'Server configuration', 'retry' => 'MANUAL_REVIEW_REQUIRED', 'why' => 'Set on the server by an authorised person.'],
    'REFUND' => ['label' => 'Refund or partial refund', 'retry' => 'DO_NOT_AUTO_RETRY', 'why' => 'Founder decision; made by a person in the payment dashboard, then recorded. No refund API exists.'],
];

function resilience_hours_ago(int $hours): string
{
    return gmdate('Y-m-d H:i:s', time() - $hours * 3600);
}

/**
 * FAILURES NEEDING ATTENTION. Each check: what is wrong, where, since when, and
 * how it may be recovered. Counts are exact; nothing is summarised away.
 */
function resilience_failures(PDO $pdo): array
{
    $rows = static function (string $sql, array $params = []) use ($pdo): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt->fetchAll();
    };
    $item = static fn (array $r, ?string $detail = null): array => [
        'order_id' => isset($r['order_id']) ? (int) $r['order_id'] : null, 'reference' => $r['mcb_reference'] ?? null,
        'since' => $r['since'] ?? null, 'subject_id' => isset($r['subject_id']) ? (int) $r['subject_id'] : null, 'detail' => $detail ?? ($r['detail'] ?? null),
    ];
    $checks = [];
    $add = static function (string $key, string $category, string $label, string $work, string $next, array $items, ?string $action = null) use (&$checks): void {
        $checks[] = ['key' => $key, 'category' => $category, 'label' => $label, 'retry' => MCB_RECOVERABLE_WORK[$work]['retry'], 'work' => $work,
            'next_action' => $next, 'recovery_action' => $action, 'count' => count($items), 'items' => array_slice($items, 0, 100)];
    };
    $fh = fulfilment_health($pdo);
    $fromHealth = static fn (string $check): array => array_values(array_map(static fn (array $f): array => ['order_id' => $f['order_id'], 'reference' => $f['reference'], 'since' => $f['since'], 'subject_id' => null, 'detail' => null],
        array_filter($fh, static fn (array $f): bool => $f['check'] === $check)));
    $care = care_health($pdo);
    $fromCare = static fn (string $check): array => array_values(array_map(static fn (array $f): array => ['order_id' => $f['order_id'], 'reference' => $f['reference'], 'since' => null, 'subject_id' => $f['case_id'], 'detail' => null],
        array_filter($care, static fn (array $f): bool => $f['check'] === $check)));

    // Payment and order
    $add('PAID_ORDER_NOT_PROCESSED', 'ORDER', 'Paid orders not handed to processing', 'ORDER_PROCESSING_EVENT',
        'Retry the hand-over: it records the processing event and tells the Founders once.', $fromHealth('PAID_ORDER_WITHOUT_PROCESSING_EVENT'), 'RECORD_PROCESSING_EVENT');
    $add('PAYMENT_CONFIRMATION_NOT_SENT', 'EMAIL', 'Paid orders whose payment confirmation has not been sent', 'PAYMENT_CONFIRMATION_EMAIL',
        'Retry the confirmation. It can only ever be sent once.',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, e.created_at AS since FROM orders o JOIN order_events e ON e.order_id = o.id AND e.dedupe_key = 'paid'
                                 WHERE o.status = 'PAID' AND o.customer_notified_at IS NULL AND e.created_at < :t ORDER BY o.id LIMIT 200", [':t' => gmdate('Y-m-d H:i:s', time() - 900)])), 'RETRY_PAYMENT_CONFIRMATION');
    $add('PAYMENT_CONFIRMATION_UNCERTAIN', 'EMAIL', 'Payment confirmations interrupted mid-send (may or may not have arrived)', 'INTERRUPTED_EMAIL',
        'Check with the customer or the email provider before sending anything again.',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, o.customer_notified_at AS since FROM orders o
                                 WHERE o.status = 'PAID' AND o.customer_notified_at IS NOT NULL AND o.customer_notified_at < :t
                                   AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.event_type = 'CUSTOMER.CONFIRMATION.SENT') ORDER BY o.id LIMIT 200", [':t' => gmdate('Y-m-d H:i:s', time() - 900)])));
    // Email and notifications
    $add('CUSTOMER_EMAIL_FAILED', 'EMAIL', 'Customer update emails that failed to send', 'LIFECYCLE_EMAIL',
        'Retry the email. The same message can only be delivered once.',
        array_map(static fn (array $r): array => $item($r, "{$r['message_type']} · {$r['failure_code']}"), $rows("SELECT c.id AS subject_id, c.order_id, o.mcb_reference, c.attempted_at AS since, c.message_type, IFNULL(c.failure_code, 'unknown') AS failure_code
                                 FROM customer_communications c JOIN orders o ON o.id = c.order_id WHERE c.status = 'FAILED' ORDER BY c.id LIMIT 200")), 'RETRY_CUSTOMER_EMAIL');
    $add('CUSTOMER_EMAIL_INTERRUPTED', 'EMAIL', 'Customer emails interrupted mid-send (may or may not have arrived)', 'INTERRUPTED_EMAIL',
        'Check before sending again: repeating could email the customer twice.',
        array_map(static fn (array $r): array => $item($r, (string) $r['message_type']), $rows("SELECT c.id AS subject_id, c.order_id, o.mcb_reference, c.attempted_at AS since, c.message_type
                                 FROM customer_communications c JOIN orders o ON o.id = c.order_id WHERE c.status = 'CLAIMED' AND c.attempted_at < :t ORDER BY c.id LIMIT 200", [':t' => gmdate('Y-m-d H:i:s', time() - 900)])));
    $add('FOUNDER_NOTIFICATION_UNDELIVERED', 'NOTIFICATION', 'Founder notifications that could not be delivered', 'FOUNDER_NOTIFICATION',
        'The same item is in the staff queue. Retry delivery once the bridge is working.',
        array_map(static fn (array $r): array => $item($r, "{$r['notification_type']} · {$r['status']}"), $rows("SELECT n.id AS subject_id, n.order_id, n.subject_reference AS mcb_reference, n.updated_at AS since, n.notification_type, n.status
                                 FROM founder_notifications n WHERE n.status IN ('FAILED','ABANDONED') ORDER BY n.id LIMIT 200")), 'RETRY_FOUNDER_NOTIFICATION');
    $add('LIFECYCLE_HOOKS_MISSING', 'ORDER', 'Completed orders without their follow-up hooks', 'LIFECYCLE_HOOKS',
        'Prepare the hooks again (nothing is sent).',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, p.completed_at AS since FROM orders o JOIN order_production p ON p.order_id = o.id
                                 WHERE o.status = 'PAID' AND p.stage = 'COMPLETED' AND NOT EXISTS (SELECT 1 FROM lifecycle_hooks h WHERE h.order_id = o.id) LIMIT 200")), 'PREPARE_LIFECYCLE_HOOKS');
    // Creative, quality, production, video
    $add('CREATIVE_STRANDED', 'CREATIVE', 'Songs with no progress for 3 days, or in exception', 'CREATIVE_GENERATION',
        'Open the order and continue the song; a failed attempt never replaces a protected master.',
        array_map(static fn (array $r): array => $item($r, (string) $r['status']), $rows("SELECT j.id AS subject_id, j.order_id, o.mcb_reference, j.updated_at AS since, j.status FROM creative_jobs j JOIN orders o ON o.id = j.order_id
                                 WHERE o.status = 'PAID' AND (j.status = 'EXCEPTION' OR (j.status <> 'MASTER_READY' AND j.updated_at < :t)) ORDER BY j.id LIMIT 200", [':t' => resilience_hours_ago(72)])));
    $add('QUALITY_CHECK_STRANDED', 'QUALITY', 'Orders waiting for MCB\'s quality check for over 2 days', 'QUALITY_CHECK',
        'Open the quality check and decide.',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, p.qc_submitted_at AS since FROM orders o JOIN order_production p ON p.order_id = o.id
                                 WHERE o.status = 'PAID' AND p.stage = 'QUALITY_CHECK' AND p.qc_submitted_at IS NOT NULL AND p.qc_submitted_at < :t LIMIT 200", [':t' => resilience_hours_ago(48)])));
    $add('PRODUCTION_PACKAGE_STRANDED', 'PRODUCTION', 'Quality-checked physical orders without a ready manufacturing package for 2 days', 'MANUFACTURING_PACKAGE',
        'Open production files: something is missing (a file, a template or manufacturer data). Nothing is made from an invalid package.',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, p.qc_passed_at AS since FROM orders o JOIN order_production p ON p.order_id = o.id
                                 WHERE o.status = 'PAID' AND o.fulfilment_type = 'PHYSICAL' AND p.stage IN ('QC_PASSED','APPROVED') AND p.qc_passed_at < :t
                                   AND (p.fulfilment_state IS NULL OR p.fulfilment_state IN ('PENDING','READY'))
                                   AND NOT EXISTS (SELECT 1 FROM manufacturing_packages m WHERE m.order_id = o.id AND m.status = 'READY') LIMIT 200", [':t' => resilience_hours_ago(48)])));
    $add('VIDEO_STRANDED', 'VIDEO', 'Memory Music Videos with no progress for 7 days, in exception, or paid without a production slot', 'VIDEO_ENTITLEMENT',
        'Open the video: rework, confirm inputs or resolve the capacity exception. The original song master is never changed.',
        array_merge(
            array_map(static fn (array $r): array => $item($r, (string) $r['status']), $rows("SELECT j.id AS subject_id, j.order_id, o.mcb_reference, j.updated_at AS since, j.status FROM video_jobs j JOIN orders o ON o.id = j.order_id
                                 WHERE o.status = 'PAID' AND (j.status = 'EXCEPTION' OR (j.status <> 'REVEALED' AND j.updated_at < :t)) ORDER BY j.id LIMIT 200", [':t' => resilience_hours_ago(168)])),
            array_map(static fn (array $r): array => $item($r, (string) $r['status']), $rows("SELECT v.id AS subject_id, v.order_id, o.mcb_reference, v.updated_at AS since, v.status FROM video_entitlements v JOIN orders o ON o.id = v.order_id
                                 WHERE o.status = 'PAID' AND (v.status = 'CAPACITY_EXCEPTION' OR (v.status = 'ENTITLED' AND NOT EXISTS (SELECT 1 FROM video_jobs j WHERE j.entitlement_id = v.id))) LIMIT 200"))
        ));
    // Suppliers and delivery
    $add('SUPPLIER_APPROVAL_STRANDED', 'SUPPLIER', 'Orders waiting over 2 days for Bella or Lewis to authorise the supplier purchase', 'SUPPLIER_PURCHASE_AUTHORISATION',
        'Bella or Lewis review the decision card and authorise with their own code (or record why not).',
        array_map($item, $rows("SELECT o.id AS order_id, o.mcb_reference, p.fulfilment_ready_at AS since FROM orders o JOIN order_production p ON p.order_id = o.id
                                 WHERE o.status = 'PAID' AND p.fulfilment_state = 'READY' AND p.supplier_purchase_authorised_at IS NULL AND p.fulfilment_ready_at < :t LIMIT 200", [':t' => resilience_hours_ago(48)])));
    $add('SUPPLIER_ORDER_NOT_PLACED', 'SUPPLIER', 'Authorised supplier purchases not placed after 2 days', 'SUPPLIER_PURCHASE',
        'A person places the order with the partner by hand and records its reference and actual cost.',
        array_values(array_filter($fromHealth('AUTHORISED_WITHOUT_SUPPLIER_ORDER'), static fn (array $i): bool => $i['since'] !== null && $i['since'] < resilience_hours_ago(48))));
    $add('SHIPMENT_OVERDUE', 'DELIVERY', 'Partner orders past dispatch without tracking, or parcels past their expected delivery', 'SHIPMENT',
        'Chase the partner or carrier and update the parcel; tell the customer if it is late.',
        array_merge($fromHealth('SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH'), $fromHealth('DISPATCHED_PARCEL_OVERDUE')));
    // Customer care and money decisions (decided by the Founders, carried out by people)
    $add('SUPPORT_CASE_ABANDONED', 'SUPPORT', 'Customers waiting on MCB beyond the target, or urgent cases not reviewed', 'SUPPORT_CASE',
        'Open Customer Care and reply or move the case on. No customer message is ever dropped.',
        array_merge($fromCare('CUSTOMER_MESSAGE_WITHOUT_RESPONSE'), $fromCare('URGENT_CASE_NOT_REVIEWED'), $fromCare('WAITING_ON_MCB_BEYOND_TARGET'), $fromCare('RESOLUTION_STALLED'), $fromCare('PRIVACY_REVIEW_UNRESOLVED')));
    $add('REFUND_AUTHORISED_NOT_RECORDED', 'MONEY', 'Refunds Bella or Lewis authorised that are not yet recorded as made', 'REFUND',
        'A person makes the refund in the payment dashboard, then records its reference. MCB never refunds automatically.', $fromCare('REFUND_AUTHORISED_NOT_RECORDED'));
    $add('REPLACEMENT_AUTHORISED_NOT_ACTIONED', 'MONEY', 'Authorised replacements not yet actioned', 'REPLACEMENT_PURCHASE',
        'Place the replacement through the fulfilment workflow (founder-authorised purchase, placed by a person).', $fromCare('REPLACEMENT_APPROVED_NOT_ACTIONED'));
    $add('COMMERCIAL_DATA_MISSING', 'COMMERCIAL', 'Paid orders whose expected costs cannot be calculated', 'COMMERCIAL_DATA',
        'Add the missing route or cost data. The customer\'s paid price is honoured.',
        array_map($item, $rows("SELECT f.order_id, o.mcb_reference, f.created_at AS since, f.id AS subject_id FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id
                                 WHERE f.status = 'OPEN' AND f.type = 'COMMERCIAL_DATA_REQUIRED' LIMIT 200")));
    $missingConfig = array_values(array_filter(resilience_configuration(), static fn (array $c): bool => $c['class'] === 'REQUIRED_FOR_LAUNCH' && $c['status'] !== 'OK'));
    $add('REQUIRED_CONFIGURATION_MISSING', 'CONFIGURATION', 'Launch configuration missing or unsafe', 'CONFIGURATION',
        'Set the named configuration on the server (values are never shown here).',
        array_map(static fn (array $c): array => ['order_id' => null, 'reference' => null, 'since' => null, 'subject_id' => null, 'detail' => $c['label'] . ' — ' . $c['status']], $missingConfig));

    $open = array_values(array_filter($checks, static fn (array $c): bool => $c['count'] > 0));
    return [
        'status' => $open === [] ? 'NO_FAILURES_FOUND' : 'ATTENTION_NEEDED',
        'label' => $open === [] ? 'No failures found by these checks' : count($open) . ' kind(s) of problem need attention',
        'checks' => $checks,
        'retry_classes' => MCB_RETRY_CLASSES,
        'retry_labels' => ['SAFE_TO_RETRY' => 'Safe to try again', 'RETRY_WITH_IDEMPOTENCY_KEY' => 'Can be tried again safely (sent once only)',
            'MANUAL_REVIEW_REQUIRED' => 'A person must check first', 'DO_NOT_AUTO_RETRY' => 'Never repeated automatically'],
        'note' => 'These checks cover the known ways work can stall or fail. "No failures found" is not a guarantee that nothing is wrong.',
    ];
}

/* ------------------------------------------------------------------ */
/* Recovery (a person's click, idempotent, never money)                */
/* ------------------------------------------------------------------ */

/**
 * Retries one recoverable piece of work. Only SAFE_TO_RETRY and
 * RETRY_WITH_IDEMPOTENCY_KEY work has an action; everything else is refused.
 */
function resilience_recover(PDO $pdo, array $in, string $staff): array
{
    $action = (string) ($in['action'] ?? '');
    $id = is_int($in['id'] ?? null) ? $in['id'] : 0;
    $event = static function (int $orderId, string $what, string $outcome) use ($pdo, $staff): void {
        record_order_event($pdo, $orderId, 'SYSTEM.RECOVERY_ATTEMPTED', ['action' => $what, 'outcome' => $outcome, 'by' => $staff]);
    };
    switch ($action) {
        case 'RECORD_PROCESSING_EVENT':
            $order = $pdo->prepare("SELECT id FROM orders WHERE id = :o AND status = 'PAID'");
            $order->execute([':o' => $id]);
            if ($order->fetchColumn() === false) {
                throw new OperationsException('order_not_found', 'No paid order was found.', 404);
            }
            $before = (int) $pdo->query("SELECT COUNT(*) FROM order_events WHERE order_id = {$id} AND dedupe_key = 'ready-for-processing'")->fetchColumn();
            record_order_event($pdo, $id, 'ORDER.READY_FOR_PROCESSING', [], 'ready-for-processing');
            notify_founders_about_order($pdo, 'NEW_ORDER_READY_FOR_PROCESSING', $id, "new-order:{$id}");
            $outcome = $before > 0 ? 'already_recorded' : 'recorded';
            $event($id, $action, $outcome);
            return ['outcome' => $outcome, 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY'];
        case 'RETRY_PAYMENT_CONFIRMATION':
            $outcome = notify_customer_of_payment($pdo, $id);
            if ($outcome === 'notified') {
                record_order_event_safely($pdo, $id, 'CUSTOMER.CONFIRMATION.SENT', [], 'confirmation-sent');
            }
            $event($id, $action, $outcome);
            return ['outcome' => $outcome, 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY'];
        case 'RETRY_CUSTOMER_EMAIL':
            $row = $pdo->prepare("SELECT order_id, message_type, dedupe_key, status FROM customer_communications WHERE id = :id");
            $row->execute([':id' => $id]);
            $c = $row->fetch();
            if ($c === false) {
                throw new OperationsException('not_found', 'No such email.', 404);
            }
            if ($c['status'] !== 'FAILED') {
                throw new OperationsException('not_retryable', $c['status'] === 'SENT' ? 'That email was already sent.' : 'That email may have been interrupted mid-send: check before sending again (manual review).', 409);
            }
            $outcome = send_lifecycle_message($pdo, (int) $c['order_id'], (string) $c['message_type'], (string) $c['dedupe_key']);
            $event((int) $c['order_id'], $action, $outcome);
            return ['outcome' => $outcome, 'retry' => 'RETRY_WITH_IDEMPOTENCY_KEY'];
        case 'RETRY_FOUNDER_NOTIFICATION':
            $stmt = $pdo->prepare("UPDATE founder_notifications SET status = 'PENDING', next_attempt_at = UTC_TIMESTAMP(), claimed_at = NULL, claimed_by = NULL WHERE id = :id AND status IN ('FAILED','ABANDONED')");
            $stmt->execute([':id' => $id]);
            if ($stmt->rowCount() !== 1) {
                throw new OperationsException('not_retryable', 'That notification is not waiting for a retry.', 409);
            }
            return ['outcome' => 'queued_again', 'retry' => 'SAFE_TO_RETRY'];
        case 'PREPARE_LIFECYCLE_HOOKS':
            prepare_lifecycle_hooks($pdo, $id);
            $event($id, $action, 'prepared');
            return ['outcome' => 'prepared', 'retry' => 'SAFE_TO_RETRY'];
        default:
            throw new OperationsException('no_automatic_recovery', 'That work has no automatic retry: a person reviews it (and anything involving money is decided by Bella or Lewis).', 422);
    }
}

/* ------------------------------------------------------------------ */
/* Configuration audit (never a value)                                 */
/* ------------------------------------------------------------------ */

function resilience_configuration(): array
{
    $s = static fn (string $path): string => is_scalar($v = mcb_setting($path, '')) ? (string) $v : '';
    $out = [];
    $add = static function (string $key, string $label, string $class, string $status, string $detail) use (&$out): void {
        $out[] = ['key' => $key, 'label' => $label, 'class' => $class, 'status' => $status, 'detail' => $detail];
    };
    $req = 'REQUIRED_FOR_LAUNCH';
    $ok = static fn (bool $b): string => $b ? 'OK' : 'MISSING';
    $add('database', 'Database connection', $req, $ok($s('db.host') !== '' && $s('db.name') !== '' && $s('db.user') !== ''), 'db.host, db.name, db.user, db.password.');
    $add('token_secret', 'Customer link secret', $req, $ok(strlen($s('token_secret')) >= 32), 'token_secret, 32+ random characters.');
    $add('ip_salt', 'Privacy salt for rate limits', $req, $ok(strlen($s('ip_salt')) >= 32), 'ip_salt, 32+ random characters.');
    $add('crm_api_key', 'Staff access key', $req, $ok(strlen($s('crm_api_key')) >= 32), 'crm_api_key, 32+ random characters.');
    $stripeKey = $s('stripe.secret_key');
    $add('stripe_secret_key', 'Live payment key', $req, str_starts_with($stripeKey, 'sk_live_') || str_starts_with($stripeKey, 'rk_live_') ? 'OK' : ($stripeKey === '' ? 'MISSING' : 'TEST_ONLY'), 'stripe.secret_key must be a live key at launch.');
    $add('stripe_webhook_secret', 'Payment webhook secret', $req, $ok(str_starts_with($s('stripe.webhook_secret'), 'whsec_')), 'stripe.webhook_secret from the live endpoint.');
    $add('email', 'Customer email sending', $req, $ok($s('resend.api_key') !== '' && $s('resend.from') !== ''), 'resend.api_key and resend.from.');
    $founders = array_values(array_filter(MCB_FOUNDERS, 'founder_authorisation_configured'));
    $add('founder_codes', 'Bella and Lewis authorisation codes', $req, count($founders) === count(MCB_FOUNDERS) ? 'OK' : 'MISSING', 'founders.BELLA / founders.LEWIS authorisation_hash.');
    $add('site_origin', 'Site address (https)', $req, $ok(str_starts_with($s('app.site_origin'), 'https://')), 'app.site_origin.');
    $add('supplier_routes', 'Private supplier route data', $req, $ok(is_readable(__DIR__ . '/../data/supplier-routes.json')), 'api/data/supplier-routes.json (uploaded privately). Under REQUIRED safety physical items cannot be paid online without it.');
    $add('delivery_rates', 'Authorised delivery rates', $req, $ok(delivery_rate_table() !== null), 'api/data/delivery-rates.json.');
    // Test settings that must be absent in production (never silently accepted).
    foreach ([['delivery.use_test_fixtures', 'Test delivery rates'], ['resend.test_mode_send_to_customer', 'Test email override'], ['resend.api_url', 'Email endpoint override'], ['stripe.api_base', 'Payment endpoint override'], ['app.debug', 'Debug mode']] as [$path, $label]) {
        $v = mcb_setting($path, null);
        $add('absent_' . str_replace('.', '_', $path), $label . ' (must be off in production)', $req, $v === null || $v === false || $v === '' ? 'OK' : 'UNSAFE', "{$path} must be absent in production.");
    }
    $opt = 'OPTIONAL';
    $add('notification_bridge', 'Founder notification bridge key', $opt, strlen($s('notifications.worker_key')) >= 32 ? 'OK' : 'NOT_SET', 'Without it notifications wait in the staff queue.');
    $add('operations_webhook', 'Operations payment webhook', $opt, $s('operations.order_paid_webhook_url') !== '' ? 'OK' : 'NOT_SET', 'Dormant unless set.');
    $add('reviews_url', 'Review page address', $opt, $s('reviews.url') !== '' ? 'OK' : 'NOT_SET', 'Needed only for review requests.');
    $add('support_address', 'Customer support address', $opt, 'OK', 'Replies go to ' . mcb_support_address() . ' (default hello@mycustombeats.com).');
    $add('route_freshness', 'Supplier route freshness', $opt, 'OK', 'Routes are re-verified every ' . (string) route_freshness_days([]) . ' days (founder decision unless configured).');
    $add('new_sale_safety', 'New-sale commercial safety', $opt, new_sale_safety_enforcement() === 'REQUIRED' ? 'OK' : 'RELAXED', new_sale_safety_enforcement() . ' (the Founders decided REQUIRED).');
    $ext = 'EXTERNAL_VERIFICATION';
    $live = (int) db()->query("SELECT COUNT(*) FROM orders WHERE status IN ('PAID','REFUNDED') AND stripe_livemode = 1")->fetchColumn();
    $add('live_payment', 'A real live payment end to end', $ext, $live > 0 ? 'OK' : 'NOT_VERIFIED', 'Verify with a small real payment once live checkout is approved.');
    $add('mailbox', 'hello@ receives customer email; support@ forwards', $ext, 'NOT_VERIFIED', 'A founder sends a test email to both addresses.');
    $bridge = cc_bridge_status(db());
    $add('telegram_delivery', 'Founder notifications delivered to Telegram', $ext, $bridge['telegram'] === 'CONNECTED' ? 'OK' : 'NOT_VERIFIED', $bridge['detail']);
    $platform = (string) creative_data()['selected_music_platform']['name'];
    $add('music_platform', "{$platform} connection", $ext, 'NOT_VERIFIED', 'FOUNDER SELECTED · ACCOUNT NOT OPENED · INTEGRATION PENDING · CAPABILITIES PENDING EXTERNAL VERIFICATION. The adapter contract is prepared; no call is made.');
    // The real state, read from the host, never an assumption in either direction.
    $scanner = upload_scanner_state();
    $add('malware_scanning', 'Malware scanning of uploads', $ext, match ($scanner['state']) {
        'SCANNING_ACTIVE' => 'OK',
        'SCANNER_CONNECTION_REQUIRED' => 'NOT_VERIFIED',
        default => 'NOT_PRESENT',
    }, $scanner['state'] . '. ' . $scanner['detail']);
    $staffAuth = staff_authentication_readiness();
    $add('staff_authentication', 'Individual staff accountability', $ext, $staffAuth['state'] === 'INDIVIDUAL_KEYS_CONFIGURED' ? 'OK' : 'NOT_VERIFIED', $staffAuth['state'] . '. ' . $staffAuth['attribution']);
    $hsts = mcb_setting('security.hsts_enabled', null) === true;
    $add('hsts', 'HTTPS strict transport (HSTS)', $ext, $hsts ? 'OK' : 'NOT_VERIFIED', $hsts
        ? 'Enabled in the host configuration.'
        : 'Prepared but deliberately off. Enable only after confirming every mycustombeats.com host MCB uses serves HTTPS.');
    $add('unknown_path_404', 'Unknown addresses answer 404', $ext, 'NOT_VERIFIED', 'The release candidate returns a real 404 for an unknown path and 200 for every app route (proved against Apache locally). Confirm on the production host, which may use LiteSpeed.');
    $def = 'DEFERRED';
    $add('commercial_thresholds', 'Commercial alert thresholds', $def, is_array(mcb_setting('business.thresholds', null)) ? 'OK' : 'DEFERRED', 'Deliberately not configured (founder decision).');
    $add('minimum_contribution', 'Minimum contribution rule', $def, mcb_setting('fulfilment.commercial_safety.min_contribution_minor', null) === null ? 'DEFERRED' : 'OK', 'Only a negative contribution is flagged until set.');
    return $out;
}

/* ------------------------------------------------------------------ */
/* Payment-first sequencing matrix                                     */
/* ------------------------------------------------------------------ */

/**
 * WHEN EACH WORKFLOW MAY HAPPEN, relative to payment.
 *
 * Read from the rule the code enforces, not from intention. Every row marked
 * AFTER_PAYMENT_ONLY has a guard that reads `orders.status` and refuses; the
 * release test (tests/payment-first.test.mjs and the acceptance suites) drives
 * an unpaid order at each one and requires a refusal.
 */
const MCB_PAYMENT_PHASES = ['BEFORE_PAYMENT', 'AFTER_PAYMENT_ONLY', 'AFTER_QUALITY_CONTROL', 'AFTER_FOUNDER_APPROVAL', 'EXCEPTION_ONLY'];

function resilience_payment_first_matrix(): array
{
    $row = static fn (string $workflow, string $phase, string $guard, string $note): array => compact('workflow', 'phase', 'guard', 'note');
    return [
        $row('Form validation, pricing, consent, eligibility', 'BEFORE_PAYMENT', 'None needed',
            'Checking is not producing. Nothing is written that MCB would have to undo.'),
        $row('Destination and commercial safety checks', 'BEFORE_PAYMENT', 'None needed',
            'A known impossibility stops the sale here. Incomplete verification does not — it stops the work later instead.'),
        $row('Checkout session', 'BEFORE_PAYMENT', 'None needed', 'Creates a Stripe session. Takes no money by itself.'),
        $row('Memory Music Video capacity HOLD', 'BEFORE_PAYMENT', 'Capacity period lock',
            'A hold only. It creates no video job, reserves nothing permanently and lapses on its own.'),
        $row('Creative jobs and song candidates', 'AFTER_PAYMENT_ONLY', "orders.status = 'PAID'",
            'creative_intake() refuses an unpaid order; the staff endpoint answers "no such paid order".'),
        $row('Artwork planning and art masters', 'AFTER_PAYMENT_ONLY', "orders.status = 'PAID'",
            'plan_order_artwork() and ensure_artwork_creative_jobs() both require payment.'),
        $row('Production (print) files', 'AFTER_PAYMENT_ONLY', "orders.status = 'PAID'", 'Registered only for a paid order, and only at the right stage.'),
        $row('Memory Music Video production', 'AFTER_PAYMENT_ONLY', "orders.status = 'PAID'",
            'A video job exists only after payment, and every production step re-checks the order.'),
        $row('Manufacturing package', 'AFTER_QUALITY_CONTROL', "orders.status = 'PAID' + QC passed",
            'Built only from a paid order whose song and artwork have passed their checks.'),
        $row('Supplier routing (recommendation)', 'AFTER_PAYMENT_ONLY', 'Read-only',
            'Recommends and explains. Authorises nothing and places nothing.'),
        $row('Supplier purchase', 'AFTER_FOUNDER_APPROVAL', "orders.status = 'PAID' + Bella or Lewis",
            'Money out. Explicit founder authorisation with their own code, every time, and never automatic.'),
        $row('Shipment and dispatch', 'AFTER_FOUNDER_APPROVAL', 'Fulfilment CONFIRMED', 'A parcel exists only after a supplier order was recorded.'),
        $row('Customer support', 'AFTER_PAYMENT_ONLY', 'Order access token', 'A case belongs to a paid order. Answering a customer is not production.'),
        $row('Replacement production', 'AFTER_FOUNDER_APPROVAL', "orders.status = 'PAID' + Bella or Lewis",
            'Starting a remedy now checks payment itself, as well as the founder authorisation it already required.'),
        $row('Refund', 'AFTER_FOUNDER_APPROVAL', 'Bella or Lewis, recorded only',
            'MCB has no refund API. A refund is decided by a founder and made outside MCB, then recorded.'),
        $row('Paid-order fulfilment exception', 'EXCEPTION_ONLY', 'Raised on a paid order',
            'Raised when MCB discovers after payment that it cannot fulfil, or has not finished verifying how. Never cancels, reprices, substitutes or refunds by itself.'),
    ];
}

/* ------------------------------------------------------------------ */
/* Automation readiness matrix                                         */
/* ------------------------------------------------------------------ */

const MCB_AUTOMATION_STATUSES = ['AUTOMATED_AND_TESTED', 'AUTOMATION_READY_CONNECTION_REQUIRED', 'HUMAN_OPERATED_BY_DESIGN', 'FOUNDER_APPROVAL_REQUIRED', 'EXTERNAL_VERIFICATION_REQUIRED', 'NOT_READY'];

/** What really runs by itself. A workflow is never "automated" just because code exists. */
function resilience_automation_matrix(PDO $pdo): array
{
    $config = array_column(resilience_configuration(), null, 'key');
    $liveStripe = $config['stripe_secret_key']['status'] === 'OK' && $config['live_payment']['status'] === 'OK';
    $emailLive = $config['email']['status'] === 'OK' && $config['absent_resend_api_url']['status'] === 'OK' && $config['absent_resend_test_mode_send_to_customer']['status'] === 'OK';
    $routes = supplier_routes() !== [];
    $blockingManufacturing = array_values(array_filter(manufacturing_data_items(), static fn (array $i): bool => $i['blocks_manufacture']));
    $telegram = $config['telegram_delivery']['status'] === 'OK';
    $row = static fn (string $workflow, string $status, string $trigger, string $automated, string $human, string $founder, string $external, string $recovery, string $tests): array
        => compact('workflow', 'status', 'trigger', 'automated', 'human', 'founder', 'external', 'recovery', 'tests');
    return [
        $row('Payment and order creation', $liveStripe ? 'AUTOMATED_AND_TESTED' : 'AUTOMATION_READY_CONNECTION_REQUIRED', 'Customer pays at checkout',
            'Server pricing, order record, checkout session, signed webhook, PAID + permanent reference, processing event', 'None', 'Approve going live', $liveStripe ? 'Stripe (live verified)' : 'Stripe live account and a verified live payment',
            'Idempotent webhook (event, session and order claims); stranded paid orders surface with a retry', 'transaction, checkout, security'),
        $row('Customer confirmation', $emailLive ? 'AUTOMATED_AND_TESTED' : 'AUTOMATION_READY_CONNECTION_REQUIRED', 'Payment recorded',
            'Confirmation email once per order', 'None', 'None', $emailLive ? 'Email provider (configured)' : 'Email provider credentials and mailbox verification',
            'Failed or unsent confirmations surface with an idempotent retry; interrupted sends need a check', 'api, transaction, security'),
        $row('Creative preparation', 'HUMAN_OPERATED_BY_DESIGN', 'Order paid', 'Creative jobs, fact ledger, story map and composition plan structure prepared', 'Lyrics, music direction', 'None', 'None',
            'One job per memory; stalled jobs surface', 'creative'),
        $row('Music generation', 'AUTOMATION_READY_CONNECTION_REQUIRED', 'Composition plan ready', 'Adapter contract, attempt records and candidate registration prepared', 'Songs generated manually and registered', 'None',
            creative_data()['selected_music_platform']['name'] . ': FOUNDER SELECTED, ACCOUNT NOT OPENED, INTEGRATION PENDING, CAPABILITIES PENDING EXTERNAL VERIFICATION', 'A failed attempt never replaces the protected master', 'creative'),
        $row('Creative quality check', 'HUMAN_OPERATED_BY_DESIGN', 'Candidate ready', 'Technical audio checks, fact and capacity checks', 'MCB internal quality check (no customer approval)', 'None', 'None', 'Repeated decisions refused by state guards', 'creative, command-centre'),
        $row('Artwork preparation', 'HUMAN_OPERATED_BY_DESIGN', 'Order paid', 'Photo inspection, artwork plan, template selection', 'Art master design and visual quality check', 'None', 'None', 'Unready photos flagged; nothing generated automatically', 'production'),
        $row('Production file generation', $blockingManufacturing === [] ? 'HUMAN_OPERATED_BY_DESIGN' : 'EXTERNAL_VERIFICATION_REQUIRED', 'Artwork and masters passed', 'Exact dimension, template, SKU, order and hash checks; package built when complete',
            'Print masters rendered and registered', 'None', $blockingManufacturing === [] ? 'None' : count($blockingManufacturing) . ' manufacturer specification(s) missing (e.g. disc pixel canvas, Heart dieline, Gatefold template)',
            'Never manufactured from an invalid package; stalled packages surface', 'production, full-package'),
        $row('Video production', 'HUMAN_OPERATED_BY_DESIGN', 'Video paid and inputs confirmed', 'Capacity hold/reserve, entitlement, job, duration eligibility', 'Video made manually and registered', 'None', 'Video platform capacity pending verification',
            'One entitlement per line; capacity released or excepted visibly; original audio master untouched', 'video'),
        $row('Video quality check', 'HUMAN_OPERATED_BY_DESIGN', 'Video candidate registered', 'File checks (type, duration, dimensions)', 'MCB video quality check, rework', 'None', 'None', 'Rework keeps the original capacity', 'video, command-centre'),
        $row('Supplier routing', $routes ? 'AUTOMATED_AND_TESTED' : 'EXTERNAL_VERIFICATION_REQUIRED', 'Order ready / new quote', 'Route grouping, recommendation for review, new-sale safety, research lists', 'Route review', 'None',
            $routes ? 'Route evidence re-verified every 30 days' : 'Private route data not uploaded', 'Stale routes surface; paid orders never disabled', 'supplier-routing'),
        $row('Supplier purchase', 'FOUNDER_APPROVAL_REQUIRED', 'Fulfilment ready', 'Decision card: economics, destination, route, evidence gates', 'Places the order by hand and records it', 'Bella or Lewis authorise with their own code', 'Partner websites (by hand)',
            'DO NOT AUTO RETRY. No automatic checkout exists', 'fulfilment, supplier-routing, security'),
        $row('Shipment and tracking', 'HUMAN_OPERATED_BY_DESIGN', 'Partner dispatches', 'Customer dispatch and parcel emails once per parcel; overdue detection', 'Records parcels and tracking', 'None', 'Carriers (no API)', 'Overdue parcels surface', 'fulfilment'),
        $row('Delivery', 'HUMAN_OPERATED_BY_DESIGN', 'Parcel delivered', 'Delivery email, completion when every parcel arrives, follow-up clock', 'Records delivery', 'None', 'None', 'Delivered-not-completed surfaces', 'fulfilment, lifecycle'),
        $row('Customer support', 'HUMAN_OPERATED_BY_DESIGN', 'Customer asks for help', 'Case, classification, privacy flag, response targets, reply email', 'Replies and resolves', 'Decides refunds and replacements', 'None', 'Waiting cases surface; no message dropped', 'customer-care'),
        $row('Replacement', 'FOUNDER_APPROVAL_REQUIRED', 'Genuine problem confirmed', 'Remedy record and exception link', 'Carries out the replacement', 'Bella or Lewis authorise', 'Partner (by hand)', 'DO NOT AUTO RETRY', 'customer-care, security'),
        $row('Refund', 'FOUNDER_APPROVAL_REQUIRED', 'Refund review requested', 'Refund review record, amounts checked', 'Makes the refund in the payment dashboard and records it', 'Bella or Lewis decide with their own code', 'Stripe dashboard (by hand; no refund API)', 'DO NOT AUTO RETRY', 'customer-care, security'),
        $row('Review request', 'HUMAN_OPERATED_BY_DESIGN', 'Delivered and followed up', 'Eligibility, recovery cooling after problems, once per order', 'Sends the request', 'None', 'Review page address', 'Held while a case is open', 'lifecycle, customer-care'),
        $row('Business Intelligence', 'AUTOMATED_AND_TESTED', 'Viewed', 'Deterministic figures; unknown costs never £0', 'Records actual fees and costs', 'Periodic review', 'None', 'Data-quality gaps listed', 'business'),
        $row('Founder notifications', $telegram ? 'AUTOMATED_AND_TESTED' : 'AUTOMATION_READY_CONNECTION_REQUIRED', 'Decision or exception', 'Outbox with dedupe keys; staff queue fallback', 'Bridge operator', 'Receive and act', $telegram ? 'Telegram (delivery verified)' : 'Telegram bridge delivery not yet verified',
            'Failed deliveries surface with a safe retry; the staff queue always holds the item', 'automation, command-centre'),
    ];
}

/* ------------------------------------------------------------------ */
/* Founder actions                                                     */
/* ------------------------------------------------------------------ */

function resilience_founder_actions(PDO $pdo): array
{
    $one = static fn (string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    $config = resilience_configuration();
    $blocking = array_values(array_filter(manufacturing_data_items(), static fn (array $i): bool => $i['blocks_manufacture']));
    $item = static fn (string $text, ?int $count = null, string $where = ''): array => ['text' => $text, 'count' => $count, 'where' => $where];
    $once = [];
    foreach ($config as $c) {
        if ($c['class'] === 'REQUIRED_FOR_LAUNCH' && $c['status'] !== 'OK') {
            $once[] = $item("Set up: {$c['label']} ({$c['detail']})", null, 'Server configuration');
        }
        if ($c['class'] === 'EXTERNAL_VERIFICATION' && $c['status'] !== 'OK') {
            $once[] = $item("Verify: {$c['label']}", null, $c['detail']);
        }
    }
    if ($blocking !== []) {
        $once[] = $item('Obtain manufacturer data: ' . implode(', ', array_unique(array_map(static fn (array $i): string => $i['label'] . ' (' . $i['template_label'] . ')', $blocking))) . '. Until then these products are confirmed by MCB before payment.', count($blocking), 'Suppliers → Data needed');
    }
    $once[] = $item('Confirm the five frame configurations match the partner routes (they stay unverified until there is evidence).', null, 'Suppliers');
    $once[] = $item('Approve going live only after the preflight passes (stripe.live_checkout_approved).', null, 'Deployment preflight');
    $once[] = $item('Professional legal review of terms, refund wording and retention.', null, 'Legal');
    $perOrder = [
        $item('Authorise supplier purchases with your own code', $one("SELECT COUNT(*) FROM order_production p JOIN orders o ON o.id = p.order_id WHERE o.status = 'PAID' AND p.fulfilment_state = 'READY' AND p.supplier_purchase_authorised_at IS NULL"), 'Approvals'),
        $item('Quality-check songs and artwork', $one("SELECT COUNT(*) FROM order_production p JOIN orders o ON o.id = p.order_id WHERE o.status = 'PAID' AND p.stage = 'QUALITY_CHECK'"), 'MCB Today'),
        $item('Quality-check Memory Music Videos', $one("SELECT COUNT(*) FROM video_jobs WHERE status = 'QUALITY_CHECK_REQUIRED'"), 'Videos'),
    ];
    $exceptions = [
        $item('Refund decisions', $one("SELECT COUNT(*) FROM refund_reviews WHERE status IN ('REFUND_REVIEW_REQUIRED','FOUNDER_DECISION_REQUIRED')"), 'Customer Care'),
        $item('Replacement and remedy decisions', $one("SELECT COUNT(*) FROM support_remedies WHERE status = 'FOUNDER_APPROVAL_REQUIRED'"), 'Customer Care'),
        $item('Commercial safety and substitution decisions', $one("SELECT COUNT(*) FROM fulfilment_exceptions WHERE status = 'OPEN' AND type IN ('COMMERCIAL_SAFETY_EXCEPTION','SUBSTITUTION_APPROVAL_REQUIRED','DESTINATION_PROBLEM')"), 'Approvals'),
        $item('Refunds authorised but not yet made and recorded', $one("SELECT COUNT(*) FROM refund_reviews WHERE status = 'AUTHORISED'"), 'Customer Care'),
    ];
    $stale = count(array_filter(supplier_routes(), static fn (array $r): bool => $r['verification_state'] === 'STALE'));
    $periodic = [
        $item('Review the Business figures and data gaps', null, 'Business'),
        $item('Re-verify stale supplier routes', $stale, 'Suppliers'),
        $item('Record actual payment fees (unknown until recorded)', $one("SELECT COUNT(*) FROM orders o WHERE o.status = 'PAID' AND o.stripe_livemode = 1 AND NOT EXISTS (SELECT 1 FROM direct_cost_entries e WHERE e.order_id = o.id AND e.category = 'PAYMENT_PROCESSING_FEE' AND e.basis = 'ACTUAL' AND e.status = 'CURRENT')"), 'Business → Data quality'),
        $item('Review failures needing attention', count(array_filter(resilience_failures($pdo)['checks'], static fn (array $c): bool => $c['count'] > 0)), 'System readiness'),
    ];
    return [
        ['category' => 'ONE_TIME_BEFORE_LAUNCH', 'label' => 'One-time, before launch', 'items' => $once],
        ['category' => 'PER_ORDER', 'label' => 'For each order', 'items' => $perOrder],
        ['category' => 'ONLY_WHEN_EXCEPTION', 'label' => 'Only when something goes wrong', 'items' => $exceptions],
        ['category' => 'PERIODIC_BUSINESS_REVIEW', 'label' => 'Regular business review', 'items' => $periodic],
    ];
}
