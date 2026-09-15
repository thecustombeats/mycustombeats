<?php
/**
 * MCB — the founder notification OUTBOX.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * RECORD HERE, DELIVER ELSEWHERE
 * ─────────────────────────────────────────────────────────────────────────
 * When something needs Bella or Lewis — a new paid order, a supplier purchase
 * to authorise, a failed quality check, an artwork or fulfilment exception, a
 * genuine support report, a product whose new sales were suspended — one row
 * is written to `founder_notifications`, in the same transaction as the change
 * that caused it where there is one.
 *
 * NOTHING HERE CALLS TELEGRAM, TASKNOTIFY, EMAIL OR ANY OTHER PROVIDER, and no
 * provider credential exists in this code base. A separately authorised
 * worker claims due rows through /api/crm/notifications, delivers them over
 * whatever channel the Founders choose (Telegram, email as a fallback) and
 * acknowledges each one. See docs/AUTOMATION-FOUNDATION-20260915.md.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IDEMPOTENT
 * ─────────────────────────────────────────────────────────────────────────
 * Every notification has a business dedupe key (new-order:41,
 * fulfilment-approval:41:0 …) under a UNIQUE index, inserted with INSERT
 * IGNORE: a replayed Stripe webhook or a repeated staff action creates
 * nothing new. The worker uses the same key as its own idempotency key.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SAFE PAYLOAD ONLY
 * ─────────────────────────────────────────────────────────────────────────
 * The payload is built from an ALLOW-LIST of fields: reference, product
 * names, amount, payment verified, state, QC/supplier position, the required
 * action, a machine reason and the internal action URL. Anything else a
 * caller passes is dropped. Never: a story, a photograph, a customer name,
 * email, phone or address, a payment credential, a supplier credential or an
 * API secret. The action URL carries only the MCB reference and the action
 * name in its fragment — it authenticates nothing and approves nothing.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';

/** The notification types, in operations.json (src/data/operations.ts). */
function founder_notification_types(): array
{
    return array_column(operations_data()['founder_notifications'] ?? [], null, 'type');
}

/** The only payload keys a notification may carry. */
const MCB_NOTIFICATION_PAYLOAD_KEYS = [
    'notification', 'title', 'reference', 'product', 'amount', 'payment', 'input', 'qc',
    'supplier_order', 'state', 'reason', 'required_action', 'action_url', 'test_payment',
];

/** Worker retry policy. */
const MCB_NOTIFICATION_MAX_ATTEMPTS = 8;
const MCB_NOTIFICATION_CLAIM_SECONDS = 600;

/**
 * The authenticated staff page for an order, with the action to open.
 *
 * The fragment never reaches a server log or a Referer. It holds the MCB
 * reference and an action name only: opening it needs the CRM sign-in, and
 * authorising spend needs a founder's own explicit action on that page.
 */
function founder_action_url(?string $reference, ?string $action = null): string
{
    $origin = rtrim((string) mcb_setting('app.site_origin', 'https://www.mycustombeats.com'), '/');
    $parts = [];
    if ($reference !== null && preg_match('/^MCB-\d{4}-\d{6}$/', $reference) === 1) {
        $parts[] = 'order=' . $reference;
    }
    if ($action !== null && preg_match('/^[A-Z_]{3,40}$/', $action) === 1) {
        $parts[] = 'action=' . $action;
    }
    return $origin . '/operations' . ($parts === [] ? '' : '#' . implode('&', $parts));
}

/** Keeps allow-listed keys with short scalar values; drops everything else. */
function founder_notification_payload(array $fields): array
{
    $clean = [];
    foreach (MCB_NOTIFICATION_PAYLOAD_KEYS as $key) {
        $value = $fields[$key] ?? null;
        if (is_bool($value) || is_int($value)) {
            $clean[$key] = $value;
        } elseif (is_string($value) && $value !== '') {
            $clean[$key] = mb_substr(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $value) ?? '', 0, $key === 'action_url' ? 300 : 200);
        }
    }
    return $clean;
}

/**
 * Queues a notification once per dedupe key. Throws on a database failure,
 * so inside a transaction it rolls back with the change that caused it.
 *
 * @return bool true when a new row was written
 */
function queue_founder_notification(PDO $pdo, string $type, ?int $orderId, string $subject, string $dedupeKey, array $fields): bool
{
    $types = founder_notification_types();
    if (!isset($types[$type])) {
        throw new InvalidArgumentException("Unknown founder notification type {$type}.");
    }
    $payload = founder_notification_payload(['notification' => $type, 'title' => $types[$type]['title']] + $fields);
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO founder_notifications
            (notification_type, order_id, subject_reference, dedupe_key, payload, status, created_at)
         VALUES (:type, :oid, :subject, :dedupe, :payload, :status, UTC_TIMESTAMP())'
    );
    $stmt->execute([
        ':type'    => $type,
        ':oid'     => $orderId,
        ':subject' => mb_substr($subject, 0, 64),
        ':dedupe'  => mb_substr($dedupeKey, 0, 120),
        ':payload' => json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        ':status'  => 'PENDING',
    ]);
    return $stmt->rowCount() === 1;
}

/**
 * The safe summary of an order for a notification: reference, product names
 * (catalogue snapshot, never customer text), amount, payment position, input
 * completeness and state.
 */
function founder_order_fields(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT o.id, o.status, o.mcb_reference, o.total_minor, o.currency, o.fulfilment_type,
                o.personalisation_status, o.stripe_livemode, o.created_at, o.customer_id,
                p.stage, p.creative_started_at, p.revealed_at, p.fulfilment_state, p.follow_up_due_at, p.follow_up_done_at,
                p.approved_at, p.supplier_purchase_authorised_at, p.id AS production_id
           FROM orders o LEFT JOIN order_production p ON p.order_id = o.id
          WHERE o.id = :id LIMIT 1'
    );
    $stmt->execute([':id' => $orderId]);
    $order = $stmt->fetch();
    if ($order === false) {
        return null;
    }
    $items = $pdo->prepare('SELECT item_name, quantity, category FROM order_items WHERE order_id = :id ORDER BY id');
    $items->execute([':id' => $orderId]);
    $names = [];
    foreach ($items->fetchAll() as $item) {
        $names[] = ((int) $item['quantity'] > 1 ? $item['quantity'] . ' × ' : '') . $item['item_name'];
    }
    $amount = $order['total_minor'] === null ? null
        : ($order['currency'] === 'GBP' || $order['currency'] === null ? format_minor_gbp((int) $order['total_minor']) : null);

    return [
        'reference'    => $order['mcb_reference'],
        'product'      => implode(', ', $names),
        'amount'       => $amount,
        'payment'      => $order['status'] === 'PAID' ? 'VERIFIED' : 'NOT_VERIFIED',
        'input'        => $order['personalisation_status'] === 'COMPLETE' ? 'COMPLETE' : 'INCOMPLETE',
        'state'        => operational_state($order),
        'test_payment' => $order['stripe_livemode'] === null ? null : (int) $order['stripe_livemode'] === 0,
    ];
}

/** Queues an order notification with the order's safe summary. */
function notify_founders_about_order(PDO $pdo, string $type, int $orderId, string $dedupeKey, array $fields = [], ?string $action = null): bool
{
    $order = founder_order_fields($pdo, $orderId);
    if ($order === null) {
        return false;
    }
    $types = founder_notification_types();
    return queue_founder_notification($pdo, $type, $orderId, (string) ($order['reference'] ?? ('order-' . $orderId)), $dedupeKey, $fields + $order + [
        'required_action' => $types[$type]['required_action'] ?? null,
        'action_url'      => founder_action_url($order['reference'], $action),
    ]);
}

/* ------------------------------------------------------------------ */
/* The worker contract: claim, deliver elsewhere, acknowledge          */
/* ------------------------------------------------------------------ */

/**
 * Claims up to $limit due notifications for delivery.
 *
 * Due: PENDING; FAILED whose retry time has come; DELIVERING whose claim is
 * older than MCB_NOTIFICATION_CLAIM_SECONDS (a worker that died mid-send).
 * Each claim carries a one-time token the acknowledgement must present.
 *
 * @return list<array{id:int, claim_token:string, idempotency_key:string, type:string, payload:array, attempt:int, created_at:string}>
 */
function claim_founder_notifications(PDO $pdo, int $limit, string $worker): array
{
    return db_transaction(function (PDO $pdo) use ($limit, $worker): array {
        $stmt = $pdo->prepare(
            "SELECT id, notification_type, dedupe_key, payload, attempts, created_at
               FROM founder_notifications
              WHERE (status = 'PENDING')
                 OR (status = 'FAILED' AND (next_attempt_at IS NULL OR next_attempt_at <= UTC_TIMESTAMP()))
                 OR (status = 'DELIVERING' AND claimed_at < UTC_TIMESTAMP() - INTERVAL :stale SECOND)
              ORDER BY id
              LIMIT {$limit}
              FOR UPDATE"
        );
        $stmt->execute([':stale' => MCB_NOTIFICATION_CLAIM_SECONDS]);
        $claimed = [];
        foreach ($stmt->fetchAll() as $row) {
            $token = bin2hex(random_bytes(24));
            $pdo->prepare(
                "UPDATE founder_notifications
                    SET status = 'DELIVERING', attempts = attempts + 1, claimed_at = UTC_TIMESTAMP(),
                        claimed_by = :worker, claim_token_hash = :hash, next_attempt_at = NULL
                  WHERE id = :id"
            )->execute([':worker' => $worker, ':hash' => hash('sha256', $token), ':id' => (int) $row['id']]);
            $claimed[] = [
                'id'              => (int) $row['id'],
                'claim_token'     => $token,
                'idempotency_key' => 'mcb-founder-' . $row['dedupe_key'],
                'type'            => $row['notification_type'],
                'payload'         => json_decode((string) $row['payload'], true),
                'attempt'         => (int) $row['attempts'] + 1,
                'created_at'      => $row['created_at'],
            ];
        }
        return $claimed;
    });
}

/**
 * Records a worker's delivery outcome.
 *
 * @return string delivered | retry_scheduled | abandoned | already_delivered
 * @throws OperationsException on an unknown notification or a stale claim
 */
function acknowledge_founder_notification(PDO $pdo, int $id, string $token, string $result, ?string $channel, ?string $errorCode): string
{
    return db_transaction(function (PDO $pdo) use ($id, $token, $result, $channel, $errorCode): string {
        $stmt = $pdo->prepare('SELECT id, status, attempts, claim_token_hash FROM founder_notifications WHERE id = :id FOR UPDATE');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if ($row === false) {
            throw new OperationsException('notification_not_found', 'No such notification.', 404);
        }
        if ($row['status'] === 'DELIVERED') {
            return 'already_delivered';
        }
        if ($row['status'] !== 'DELIVERING' || $row['claim_token_hash'] === null || !hash_equals((string) $row['claim_token_hash'], hash('sha256', $token))) {
            throw new OperationsException('claim_not_current', 'This claim is no longer current. Claim the notification again.', 409);
        }
        if ($result === 'DELIVERED') {
            $pdo->prepare(
                "UPDATE founder_notifications
                    SET status = 'DELIVERED', delivered_at = UTC_TIMESTAMP(), delivered_channel = :channel,
                        claim_token_hash = NULL, last_error = NULL
                  WHERE id = :id"
            )->execute([':channel' => $channel, ':id' => $id]);
            return 'delivered';
        }
        $attempts = (int) $row['attempts'];
        if ($attempts >= MCB_NOTIFICATION_MAX_ATTEMPTS) {
            $pdo->prepare(
                "UPDATE founder_notifications SET status = 'ABANDONED', claim_token_hash = NULL, last_error = :err WHERE id = :id"
            )->execute([':err' => $errorCode, ':id' => $id]);
            return 'abandoned';
        }
        $delay = min(60 * (2 ** max(0, $attempts - 1)), 3600);
        $pdo->prepare(
            "UPDATE founder_notifications
                SET status = 'FAILED', claim_token_hash = NULL, last_error = :err,
                    next_attempt_at = UTC_TIMESTAMP() + INTERVAL :delay SECOND
              WHERE id = :id"
        )->execute([':err' => $errorCode, ':delay' => $delay, ':id' => $id]);
        return 'retry_scheduled';
    });
}
