<?php
/**
 * MCB — operations after payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE RECORD OF WHERE AN ORDER HAS GOT TO
 * ─────────────────────────────────────────────────────────────────────────
 * Payment: `orders.status`. The work: `order_production.stage`, whose rules
 * about when refinements close live in legal.json. The physical side:
 * `order_production.fulfilment_state`. The operational state an operator or a
 * customer sees is DERIVED from those columns here (and mirrored in
 * src/data/operations.ts); it is never stored, so it cannot disagree with them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTOMATE THE NORMAL, SURFACE THE EXCEPTIONS
 * ─────────────────────────────────────────────────────────────────────────
 * Every move is an explicit staff action or customer response, checked
 * against the current state inside a locked transaction, audited in
 * `order_events` and, where the template says so, followed by one idempotent
 * email. Nothing here orders from a supplier, refunds, charges or promises a
 * replacement: FULFILMENT.READY is a task for a person, not a purchase.
 *
 * Audit events carry identifiers, states and machine reasons only — never a
 * story, feedback, a note, an address or a contact detail.
 */

declare(strict_types=1);

require_once __DIR__ . '/legal.php';

final class OperationsException extends RuntimeException
{
    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $httpStatus = 409
    ) {
        parent::__construct($message);
    }
}

/** The generated operations data (src/data/operations.ts). */
function operations_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $path = __DIR__ . '/../data/operations.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $decoded = $raw === false ? null : json_decode($raw, true);
    if (!is_array($decoded)) {
        error_log('MCB operations: api/data/operations.json is missing or unreadable.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }
    $data = $decoded;
    return $data;
}

/* ------------------------------------------------------------------ */
/* Reading an order's operational position                             */
/* ------------------------------------------------------------------ */

const MCB_OPERATIONS_COLUMNS = 'o.id, o.customer_id, o.status, o.fulfilment_type, o.mcb_reference,
        o.personalisation_status, o.stripe_livemode, o.created_at,
        p.id AS production_id, p.stage, p.revisions_used, p.approved_at, p.approval_channel,
        p.production_locked_at, p.completed_at, p.creative_started_at, p.creative_ready_at,
        p.approval_round, p.approval_requested_at, p.approval_preview_url, p.changes_requested_at,
        p.fulfilment_state, p.fulfilment_pending_reason, p.fulfilment_ready_at, p.fulfilment_confirmed_at,
        p.fulfilment_reference, p.carrier, p.tracking_reference, p.tracking_url, p.dispatched_on,
        p.delivery_delayed_at, p.delivered_on, p.follow_up_due_at, p.follow_up_done_at,
        p.reopened_at, p.reopen_count';

/** The order joined to its production record, optionally locked for update. */
function operations_order_row(PDO $pdo, int $orderId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT ' . MCB_OPERATIONS_COLUMNS . '
           FROM orders o
           LEFT JOIN order_production p ON p.order_id = o.id
          WHERE o.id = :id
          LIMIT 1' . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([':id' => $orderId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function order_workflow(array $row): string
{
    return ($row['fulfilment_type'] ?? '') === 'PHYSICAL' ? 'PHYSICAL' : 'DIGITAL';
}

/**
 * The fulfilment state, with NULL ("never set") read for what it means:
 * nothing to make for a digital order; for a physical one, not yet ready —
 * or, for a record moved on by the older stage-only endpoint, already placed.
 */
function effective_fulfilment_state(array $row): string
{
    if (order_workflow($row) === 'DIGITAL') {
        return 'NOT_REQUIRED';
    }
    $stored = $row['fulfilment_state'] ?? null;
    if ($stored !== null && $stored !== 'NOT_REQUIRED') {
        return (string) $stored;
    }
    return in_array($row['stage'] ?? '', ['PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true)
        ? 'CONFIRMED'
        : 'PENDING';
}

function follow_up_is_due(array $row, ?int $now = null): bool
{
    if (($row['follow_up_due_at'] ?? null) === null || ($row['follow_up_done_at'] ?? null) !== null) {
        return false;
    }
    return strtotime($row['follow_up_due_at'] . ' UTC') <= ($now ?? time());
}

/**
 * The operational state, or null for an order that is not paid (payment state
 * is `orders.status` and is reported separately).
 */
function operational_state(array $row, ?int $now = null): ?string
{
    if (($row['status'] ?? '') !== 'PAID') {
        return null;
    }
    $stage = $row['stage'] ?? null;
    if ($stage === null) {
        return 'ORDER.PAID';
    }

    switch ($stage) {
        case 'CREATIVE':
            return ($row['creative_started_at'] ?? null) === null ? 'CREATIVE.PENDING' : 'CREATIVE.IN_PROGRESS';
        case 'SONG_READY':
            return 'CREATIVE.READY';
        case 'AWAITING_APPROVAL':
            return 'CUSTOMER_APPROVAL.REQUIRED';
        case 'REVISION_REQUESTED':
            return 'CUSTOMER_APPROVAL.CHANGES_REQUESTED';
        case 'COMPLETED':
            return 'COMPLETED';
    }

    // APPROVED, PRODUCTION_LOCKED, FULFILMENT
    if (order_workflow($row) === 'DIGITAL') {
        return follow_up_is_due($row, $now) ? 'FOLLOW_UP.DUE' : 'CUSTOMER_APPROVAL.APPROVED';
    }

    return match (effective_fulfilment_state($row)) {
        'READY'      => 'FULFILMENT.READY',
        'CONFIRMED'  => 'FULFILMENT.CONFIRMED',
        'DISPATCHED' => 'DISPATCHED',
        'DELIVERED'  => follow_up_is_due($row, $now) ? 'FOLLOW_UP.DUE' : 'DELIVERED',
        default      => 'FULFILMENT.PENDING',
    };
}

/** The customer-facing stage id for a state (operations.json customer_stages). */
function customer_stage_for(string $workflow, ?string $state): ?string
{
    foreach (operations_data()['customer_stages'][$workflow] ?? [] as $stage) {
        if (in_array($state, $stage['states'], true)) {
            return (string) $stage['id'];
        }
    }
    return null;
}

/** The next action for staff, from the generated state table. */
function next_action_for(?string $state): ?string
{
    foreach (operations_data()['states'] as $definition) {
        if ($definition['state'] === $state) {
            return $definition['next_action'];
        }
    }
    return null;
}

/**
 * Included revisions for the whole order, or null when it cannot be stated.
 *
 * Summed over the order's song units from the numeric allowances generated
 * from the catalogue wording ("1 revision", "1 refinement per song"). Any
 * song unit without one — or an order with no units at all, from before
 * per-memory persistence — makes the answer UNKNOWN rather than a guess.
 */
function included_revision_allowance(PDO $pdo, int $orderId): ?int
{
    $stmt = $pdo->prepare("SELECT product_id, song_count FROM order_units WHERE order_id = :id AND kind = 'SONG'");
    $stmt->execute([':id' => $orderId]);
    $units = $stmt->fetchAll();
    if ($units === []) {
        return null;
    }
    $rules = operations_data()['included_revisions'] ?? [];
    $total = 0;
    foreach ($units as $unit) {
        $rule = $rules[$unit['product_id']] ?? null;
        if ($rule === null) {
            return null;
        }
        if ($rule['per'] === 'SONG') {
            if ($unit['song_count'] === null) {
                return null;
            }
            $total += (int) $rule['count'] * (int) $unit['song_count'];
        } else {
            $total += (int) $rule['count'];
        }
    }
    return $total;
}

/* ------------------------------------------------------------------ */
/* Secure customer links                                               */
/* ------------------------------------------------------------------ */

const MCB_ACCESS_TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/';

/** The HMAC key for customer links, or null when it is too weak to use. */
function access_token_secret(): ?string
{
    $secret = (string) mcb_setting('token_secret', '');
    return strlen($secret) >= 32 ? $secret : null;
}

/** 256-bit link token for (purpose, order, nonce), URL-safe, 43 characters. */
function access_token_value(string $purpose, int $orderId, string $nonce): ?string
{
    $secret = access_token_secret();
    if ($secret === null) {
        return null;
    }
    $mac = hash_hmac('sha256', "mcb-access|{$purpose}|{$orderId}|{$nonce}", $secret, true);
    return rtrim(strtr(base64_encode($mac), '+/', '-_'), '=');
}

function access_token_ttl_days(string $purpose): int
{
    $key     = $purpose === 'APPROVAL' ? 'operations.approval_link_ttl_days' : 'operations.status_link_ttl_days';
    $default = $purpose === 'APPROVAL' ? 30 : 180;
    $days    = (int) mcb_setting($key, $default);
    return max(1, min($days, 730));
}

/**
 * Issues a link, revoking any earlier active link with the same purpose.
 * Returns the token, or throws when links cannot be issued safely.
 */
function issue_access_token(PDO $pdo, int $orderId, string $purpose, ?int $approvalRound, ?string $createdBy): string
{
    $nonce = bin2hex(random_bytes(16));
    $token = access_token_value($purpose, $orderId, $nonce);
    if ($token === null) {
        error_log('MCB operations: token_secret is missing or shorter than 32 characters; customer links refused.');
        throw new OperationsException('links_unavailable', 'Customer links cannot be issued until the server token secret is configured.', 503);
    }

    revoke_access_tokens($pdo, $orderId, $purpose);

    $pdo->prepare(
        'INSERT INTO order_access_tokens
            (order_id, purpose, nonce, token_hash, approval_round, expires_at, created_by, created_at)
         VALUES (:oid, :purpose, :nonce, :hash, :round, UTC_TIMESTAMP() + INTERVAL :days DAY, :by, UTC_TIMESTAMP())'
    )->execute([
        ':oid'     => $orderId,
        ':purpose' => $purpose,
        ':nonce'   => $nonce,
        ':hash'    => hash('sha256', $token),
        ':round'   => $approvalRound,
        ':days'    => access_token_ttl_days($purpose),
        ':by'      => $createdBy,
    ]);

    return $token;
}

function revoke_access_tokens(PDO $pdo, int $orderId, ?string $purpose = null): int
{
    $sql = 'UPDATE order_access_tokens SET revoked_at = UTC_TIMESTAMP()
             WHERE order_id = :oid AND revoked_at IS NULL';
    $params = [':oid' => $orderId];
    if ($purpose !== null) {
        $sql .= ' AND purpose = :purpose';
        $params[':purpose'] = $purpose;
    }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    return $stmt->rowCount();
}

/** The current active link token for an order, rebuilt from its nonce. */
function active_access_token(PDO $pdo, int $orderId, string $purpose): ?string
{
    $stmt = $pdo->prepare(
        'SELECT nonce FROM order_access_tokens
          WHERE order_id = :oid AND purpose = :purpose AND revoked_at IS NULL
            AND expires_at > UTC_TIMESTAMP()
          ORDER BY id DESC LIMIT 1'
    );
    $stmt->execute([':oid' => $orderId, ':purpose' => $purpose]);
    $nonce = $stmt->fetchColumn();
    return $nonce === false ? null : access_token_value($purpose, $orderId, (string) $nonce);
}

/** An active status link for the order, issuing one when there is none. */
function ensure_status_token(PDO $pdo, int $orderId, ?string $createdBy): string
{
    return active_access_token($pdo, $orderId, 'STATUS')
        ?? issue_access_token($pdo, $orderId, 'STATUS', null, $createdBy);
}

/**
 * The token row for a presented link, or null. Unknown, malformed, expired
 * and revoked links are indistinguishable to the caller on purpose.
 */
function find_access_token(PDO $pdo, mixed $token, string $purpose): ?array
{
    if (!is_string($token) || preg_match(MCB_ACCESS_TOKEN_PATTERN, $token) !== 1) {
        return null;
    }
    $stmt = $pdo->prepare(
        'SELECT t.id, t.order_id, t.nonce, t.approval_round
           FROM order_access_tokens t
           JOIN orders o ON o.id = t.order_id
          WHERE t.token_hash = :hash AND t.purpose = :purpose
            AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()
            AND o.status = :paid
          LIMIT 1'
    );
    $stmt->execute([':hash' => hash('sha256', $token), ':purpose' => $purpose, ':paid' => 'PAID']);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }
    // Defence in depth: the token must also be the HMAC of its own row.
    $expected = access_token_value($purpose, (int) $row['order_id'], (string) $row['nonce']);
    if ($expected === null || !hash_equals($expected, $token)) {
        return null;
    }
    $pdo->prepare('UPDATE order_access_tokens SET last_used_at = UTC_TIMESTAMP() WHERE id = :id')
        ->execute([':id' => (int) $row['id']]);
    return $row;
}

/** The customer-facing URL. The token travels in the fragment, never to a server log or Referer. */
function access_link(string $purpose, string $token): string
{
    $origin = rtrim((string) mcb_setting('app.site_origin', 'https://www.mycustombeats.com'), '/');
    return $origin . ($purpose === 'APPROVAL' ? '/approve#' : '/your-order#') . $token;
}

/* ------------------------------------------------------------------ */
/* Input helpers                                                       */
/* ------------------------------------------------------------------ */

/** Single-line text: control characters removed, trimmed, bounded. */
function operations_line(mixed $value, int $max): ?string
{
    if (!is_scalar($value)) {
        return null;
    }
    $clean = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $value) ?? '');
    return $clean === '' ? null : mb_substr($clean, 0, $max);
}

/** Multi-line text: keeps newlines and tabs, removes other control characters. */
function operations_text(mixed $value, int $max): ?string
{
    if (!is_scalar($value)) {
        return null;
    }
    $clean = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', (string) $value) ?? '');
    return $clean === '' ? null : mb_substr($clean, 0, $max);
}

/** An https URL MCB can safely put in front of a customer, or null. */
function operations_https_url(mixed $value): ?string
{
    $url = operations_line($value, 500);
    if ($url === null || !preg_match('#^https://[^\s<>"\']+$#i', $url) || filter_var($url, FILTER_VALIDATE_URL) === false) {
        return null;
    }
    return $url;
}

/** A calendar date YYYY-MM-DD no later than tomorrow (time zones), or null. */
function operations_past_date(mixed $value): ?string
{
    $raw = is_string($value) ? trim($value) : '';
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $raw, $m) !== 1 || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        return null;
    }
    return $raw <= gmdate('Y-m-d', time() + 86400) ? $raw : null;
}

/* ------------------------------------------------------------------ */
/* Transitions shared by staff actions and customer responses          */
/* ------------------------------------------------------------------ */

/** Days after delivery (or digital approval) before the follow-up is due. */
function follow_up_delay_days(): int
{
    return max(0, min((int) mcb_setting('operations.follow_up_delay_days', 0), 90));
}

/** Why a physical order cannot yet be made, or null when nothing is missing. */
function fulfilment_blocker(PDO $pdo, array $row): ?string
{
    if (($row['personalisation_status'] ?? '') !== 'COMPLETE') {
        return 'PERSONALISATION';
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM delivery_addresses WHERE order_id = :id');
    $stmt->execute([':id' => (int) $row['id']]);
    return (int) $stmt->fetchColumn() === 0 ? 'DELIVERY_ADDRESS' : null;
}

/**
 * The customer (or staff on their behalf) approves the current version.
 * Returns the lifecycle messages to send once the transaction commits.
 *
 * @return list<array{0:string,1:string}>
 */
function approve_work(PDO $pdo, array $row, string $channel, string $approvedBy, ?string $reference): array
{
    $orderId = (int) $row['id'];
    $round   = (int) $row['approval_round'];
    $item    = $round > 0 ? 'Approval round ' . $round : 'Approved before an approval link was sent';

    $pdo->prepare(
        "UPDATE order_production
            SET stage = 'APPROVED', approved_at = UTC_TIMESTAMP(), approval_channel = :channel,
                approval_reference = :ref, approved_item = :item, approved_by = :by
          WHERE order_id = :oid"
    )->execute([':channel' => $channel, ':ref' => $reference, ':item' => $item, ':by' => $approvedBy, ':oid' => $orderId]);

    $reopen = (int) $row['reopen_count'];
    record_order_event($pdo, $orderId, 'CUSTOMER.APPROVAL.APPROVED', ['round' => $round, 'channel' => $channel], "approved:{$reopen}:{$round}");

    if (order_workflow($row) === 'DIGITAL') {
        $pdo->prepare(
            "UPDATE order_production
                SET fulfilment_state = 'NOT_REQUIRED',
                    follow_up_due_at = UTC_TIMESTAMP() + INTERVAL :days DAY, follow_up_done_at = NULL
              WHERE order_id = :oid"
        )->execute([':days' => follow_up_delay_days(), ':oid' => $orderId]);
        record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
    } else {
        $blocker = fulfilment_blocker($pdo, $row);
        if ($blocker === null) {
            $pdo->prepare(
                "UPDATE order_production
                    SET fulfilment_state = 'READY', fulfilment_pending_reason = NULL, fulfilment_ready_at = UTC_TIMESTAMP()
                  WHERE order_id = :oid"
            )->execute([':oid' => $orderId]);
            record_order_event($pdo, $orderId, 'FULFILMENT.READY', [], "fulfilment-ready:{$reopen}");
        } else {
            $pdo->prepare(
                "UPDATE order_production SET fulfilment_state = 'PENDING', fulfilment_pending_reason = :reason WHERE order_id = :oid"
            )->execute([':reason' => $blocker, ':oid' => $orderId]);
            record_order_event($pdo, $orderId, 'FULFILMENT.PENDING', ['reason' => $blocker]);
        }
    }

    return [['APPROVAL_CONFIRMED', "round-{$reopen}-{$round}"]];
}

/**
 * Records a change request for the current round. Returns null when this
 * round already has one (a repeated submission), otherwise the messages.
 *
 * @return list<array{0:string,1:string}>|null
 */
function record_changes(PDO $pdo, array $row, string $channel, ?string $feedback, ?string $recordedBy): ?array
{
    $orderId   = (int) $row['id'];
    $round     = (int) $row['approval_round'];
    $allowance = included_revision_allowance($pdo, $orderId);
    $used      = (int) $row['revisions_used'] + 1;
    $within    = $allowance === null ? 'UNKNOWN' : ($used <= $allowance ? 'YES' : 'NO');

    try {
        $pdo->prepare(
            'INSERT INTO order_change_requests (order_id, approval_round, channel, feedback, within_allowance, recorded_by, created_at)
             VALUES (:oid, :round, :channel, :feedback, :within, :by, UTC_TIMESTAMP())'
        )->execute([
            ':oid' => $orderId, ':round' => $round, ':channel' => $channel,
            ':feedback' => $feedback, ':within' => $within, ':by' => $recordedBy,
        ]);
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) {
            return null;
        }
        throw $e;
    }

    $pdo->prepare(
        "UPDATE order_production
            SET stage = 'REVISION_REQUESTED', revisions_used = :used, changes_requested_at = UTC_TIMESTAMP()
          WHERE order_id = :oid"
    )->execute([':used' => $used, ':oid' => $orderId]);

    // The link is NOT revoked: a second press of the same form must say
    // "already received", not "link expired". It can no longer approve
    // anything, because the stage has moved on; the next version gets a new
    // link, which revokes this one.
    record_order_event($pdo, $orderId, 'CUSTOMER.CHANGES.REQUESTED', [
        'round' => $round, 'channel' => $channel, 'revisions_used' => $used,
        'included' => $allowance, 'within_allowance' => $within,
    ], "changes:{$row['reopen_count']}:{$round}");

    return [['CHANGES_RECEIVED', "round-{$row['reopen_count']}-{$round}"]];
}

/* ------------------------------------------------------------------ */
/* Staff actions                                                       */
/* ------------------------------------------------------------------ */

const MCB_STAFF_ACTIONS = [
    'START_CREATIVE', 'MARK_CREATIVE_READY', 'REQUEST_APPROVAL', 'REISSUE_APPROVAL_LINK',
    'RECORD_APPROVAL', 'RECORD_CHANGES_REQUEST', 'SET_FULFILMENT_READY', 'CONFIRM_FULFILMENT',
    'MARK_DISPATCHED', 'UPDATE_TRACKING', 'MARK_DELIVERY_DELAYED', 'MARK_DELIVERED',
    'RECORD_FOLLOW_UP', 'MARK_COMPLETED', 'REOPEN', 'ISSUE_STATUS_LINK', 'REVOKE_LINKS',
    'ADD_NOTE', 'UPDATE_SERVICE_REQUEST',
];

/**
 * Performs one staff action inside a locked transaction.
 *
 * @return array{outcome:string, state:?string, links:array<string,string>, messages:list<array{0:string,1:string}>, warning:?string}
 */
function perform_staff_action(int $orderId, string $action, array $in, string $staff): array
{
    if (!in_array($action, MCB_STAFF_ACTIONS, true)) {
        throw new OperationsException('unknown_action', 'That action is not recognised.', 422);
    }

    return db_transaction(function (PDO $pdo) use ($orderId, $action, $in, $staff): array {
        $row = operations_order_row($pdo, $orderId, true);
        if ($row === null) {
            throw new OperationsException('order_not_found', 'No order was found.', 404);
        }
        if ($action !== 'ADD_NOTE' && $row['status'] !== 'PAID') {
            throw new OperationsException('order_not_paid', 'Only a paid order can move through operations. Payment status: ' . $row['status'] . '.');
        }

        // A paid order from before the production table gets its record now,
        // in the stage every paid order starts in.
        if ($row['production_id'] === null && $action !== 'ADD_NOTE') {
            $pdo->prepare('INSERT INTO order_production (order_id, stage) VALUES (:oid, :stage)')
                ->execute([':oid' => $orderId, ':stage' => initial_production_stage()]);
            $row = operations_order_row($pdo, $orderId, true);
        }

        $result = ['outcome' => 'done', 'links' => [], 'messages' => [], 'warning' => null];
        $stage  = (string) ($row['stage'] ?? '');
        $state  = operational_state($row);
        $physical = order_workflow($row) === 'PHYSICAL';
        $fulfil = effective_fulfilment_state($row);
        $reopen = (int) $row['reopen_count'];
        $refuse = static function (string $message): never {
            throw new OperationsException('invalid_transition', $message);
        };
        $update = static function (string $set, array $params = []) use ($pdo, $orderId): void {
            $pdo->prepare("UPDATE order_production SET {$set} WHERE order_id = :oid")
                ->execute($params + [':oid' => $orderId]);
        };

        switch ($action) {
            case 'START_CREATIVE':
                if ($stage !== 'CREATIVE') {
                    $refuse('Creative work can only be started on an order waiting for it.');
                }
                if ($row['creative_started_at'] !== null) {
                    $result['outcome'] = 'unchanged';
                    break;
                }
                $update('creative_started_at = UTC_TIMESTAMP()');
                record_order_event($pdo, $orderId, 'CREATIVE.IN_PROGRESS', ['by' => $staff], "creative-started:{$reopen}");
                break;

            case 'MARK_CREATIVE_READY':
                if (!in_array($stage, ['CREATIVE', 'REVISION_REQUESTED'], true)) {
                    $refuse('Only work in progress, or work with requested changes, can be marked ready.');
                }
                $update("stage = 'SONG_READY', creative_ready_at = UTC_TIMESTAMP(), creative_started_at = COALESCE(creative_started_at, UTC_TIMESTAMP())");
                $next = (int) $row['approval_round'] + 1;
                record_order_event($pdo, $orderId, 'CREATIVE.READY', ['by' => $staff, 'for_round' => $next], "creative-ready:{$reopen}:{$next}");
                break;

            case 'REQUEST_APPROVAL':
                if ($stage !== 'SONG_READY') {
                    $refuse('Mark the music ready before sending it for approval.');
                }
                $preview = operations_https_url($in['preview_url'] ?? null);
                if ($preview === null) {
                    throw new OperationsException('invalid_preview_url', 'Add the private https link where the customer can listen.', 422);
                }
                $round = (int) $row['approval_round'] + 1;
                $update(
                    "stage = 'AWAITING_APPROVAL', approval_round = :round, approval_requested_at = UTC_TIMESTAMP(), approval_preview_url = :url",
                    [':round' => $round, ':url' => $preview]
                );
                $token = issue_access_token($pdo, $orderId, 'APPROVAL', $round, $staff);
                $result['links']['approval'] = access_link('APPROVAL', $token);
                $result['links']['status']   = access_link('STATUS', ensure_status_token($pdo, $orderId, $staff));
                record_order_event($pdo, $orderId, 'CUSTOMER.APPROVAL.REQUIRED', ['round' => $round, 'by' => $staff], "approval-required:{$reopen}:{$round}");
                if (($in['send_email'] ?? true) !== false) {
                    $result['messages'][] = ['APPROVAL_REQUIRED', "round-{$reopen}-{$round}"];
                }
                break;

            case 'REISSUE_APPROVAL_LINK':
                if ($stage !== 'AWAITING_APPROVAL') {
                    $refuse('There is no approval waiting for the customer.');
                }
                $token = issue_access_token($pdo, $orderId, 'APPROVAL', (int) $row['approval_round'], $staff);
                $result['links']['approval'] = access_link('APPROVAL', $token);
                record_order_event($pdo, $orderId, 'ACCESS.APPROVAL_LINK_REISSUED', ['round' => (int) $row['approval_round'], 'by' => $staff]);
                break;

            case 'RECORD_APPROVAL':
                if (!in_array($stage, ['SONG_READY', 'AWAITING_APPROVAL'], true)) {
                    $refuse('An approval can only be recorded for finished work that has not been approved.');
                }
                $channel = (string) ($in['channel'] ?? '');
                if (!in_array($channel, ['EMAIL', 'WHATSAPP', 'PHONE', 'IN_PERSON'], true)) {
                    throw new OperationsException('invalid_channel', 'Say how the customer approved: EMAIL, WHATSAPP, PHONE or IN_PERSON.', 422);
                }
                $result['messages'] = approve_work($pdo, $row, $channel, $staff, operations_line($in['reference'] ?? null, 255));
                break;

            case 'RECORD_CHANGES_REQUEST':
                if (!in_array($stage, ['SONG_READY', 'AWAITING_APPROVAL'], true)) {
                    $refuse('Changes can only be recorded for finished work that has not been approved.');
                }
                $channel = (string) ($in['channel'] ?? '');
                if (!in_array($channel, ['EMAIL', 'WHATSAPP', 'PHONE', 'IN_PERSON'], true)) {
                    throw new OperationsException('invalid_channel', 'Say how the customer asked: EMAIL, WHATSAPP, PHONE or IN_PERSON.', 422);
                }
                $messages = record_changes($pdo, $row, $channel, operations_text($in['summary'] ?? null, 2000), $staff);
                if ($messages === null) {
                    $result['outcome'] = 'unchanged';
                } else {
                    $result['messages'] = $messages;
                }
                break;

            case 'SET_FULFILMENT_READY':
                if (!$physical || $stage !== 'APPROVED' || $fulfil !== 'PENDING') {
                    $refuse('Only an approved physical order that is waiting on something can be marked ready.');
                }
                $blocker = fulfilment_blocker($pdo, $row);
                if ($blocker !== null) {
                    $update('fulfilment_pending_reason = :r', [':r' => $blocker]);
                    throw new OperationsException('fulfilment_blocked', 'Still missing: ' . strtolower(str_replace('_', ' ', $blocker)) . '.');
                }
                $update("fulfilment_state = 'READY', fulfilment_pending_reason = NULL, fulfilment_ready_at = UTC_TIMESTAMP()");
                record_order_event($pdo, $orderId, 'FULFILMENT.READY', ['by' => $staff], "fulfilment-ready:{$reopen}");
                break;

            case 'CONFIRM_FULFILMENT':
                if (!$physical || $stage !== 'APPROVED' || $fulfil !== 'READY') {
                    $refuse('Confirm the physical order only once the music is approved and fulfilment is ready.');
                }
                $update(
                    "stage = 'PRODUCTION_LOCKED', production_locked_at = COALESCE(production_locked_at, UTC_TIMESTAMP()),
                     fulfilment_state = 'CONFIRMED', fulfilment_confirmed_at = UTC_TIMESTAMP(), fulfilment_reference = :ref",
                    [':ref' => operations_line($in['fulfilment_reference'] ?? null, 120)]
                );
                record_order_event($pdo, $orderId, 'FULFILMENT.CONFIRMED', ['by' => $staff], "fulfilment-confirmed:{$reopen}");
                break;

            case 'MARK_DISPATCHED':
            case 'UPDATE_TRACKING':
                $expected = $action === 'MARK_DISPATCHED' ? 'CONFIRMED' : 'DISPATCHED';
                if (!$physical || $fulfil !== $expected) {
                    $refuse($action === 'MARK_DISPATCHED'
                        ? 'Dispatch can only be recorded for a confirmed physical order.'
                        : 'Tracking can only be changed on a dispatched order.');
                }
                $carrier = operations_line($in['carrier'] ?? null, 80);
                $date    = operations_past_date($in['dispatched_on'] ?? null);
                $trackingUrlRaw = $in['tracking_url'] ?? null;
                $trackingUrl    = operations_https_url($trackingUrlRaw);
                if ($carrier === null || $date === null) {
                    throw new OperationsException('invalid_dispatch', 'Add the carrier and the dispatch date (not in the future).', 422);
                }
                if ($trackingUrlRaw !== null && $trackingUrlRaw !== '' && $trackingUrl === null) {
                    throw new OperationsException('invalid_tracking_url', 'The tracking link must be an https address.', 422);
                }
                $update(
                    "stage = 'FULFILMENT', fulfilment_state = 'DISPATCHED', carrier = :carrier,
                     tracking_reference = :tref, tracking_url = :turl, dispatched_on = :date",
                    [':carrier' => $carrier, ':tref' => operations_line($in['tracking_reference'] ?? null, 120), ':turl' => $trackingUrl, ':date' => $date]
                );
                if ($action === 'MARK_DISPATCHED') {
                    record_order_event($pdo, $orderId, 'DISPATCHED', ['by' => $staff, 'has_tracking' => $trackingUrl !== null || !empty($in['tracking_reference'])], "dispatched:{$reopen}");
                    if (($in['send_email'] ?? true) !== false) {
                        $result['messages'][] = ['DISPATCHED', "dispatch-{$reopen}"];
                    }
                } else {
                    record_order_event($pdo, $orderId, 'TRACKING.UPDATED', ['by' => $staff]);
                }
                break;

            case 'MARK_DELIVERY_DELAYED':
                if (!$physical || $fulfil !== 'DISPATCHED') {
                    $refuse('Only a dispatched order can be marked delayed.');
                }
                if ($row['delivery_delayed_at'] !== null) {
                    $result['outcome'] = 'unchanged';
                    break;
                }
                $update('delivery_delayed_at = UTC_TIMESTAMP()');
                record_order_event($pdo, $orderId, 'DELIVERY.DELAYED', ['by' => $staff], "delayed:{$reopen}");
                break;

            case 'MARK_DELIVERED':
                if (!$physical || $fulfil !== 'DISPATCHED') {
                    $refuse('Only a dispatched order can be marked delivered.');
                }
                $date = operations_past_date($in['delivered_on'] ?? null);
                if ($date === null || ($row['dispatched_on'] !== null && $date < $row['dispatched_on'])) {
                    throw new OperationsException('invalid_delivery_date', 'Add the delivery date: on or after dispatch, and not in the future.', 422);
                }
                $update(
                    "fulfilment_state = 'DELIVERED', delivered_on = :date,
                     follow_up_due_at = UTC_TIMESTAMP() + INTERVAL :days DAY, follow_up_done_at = NULL",
                    [':date' => $date, ':days' => follow_up_delay_days()]
                );
                record_order_event($pdo, $orderId, 'DELIVERED', ['by' => $staff], "delivered:{$reopen}");
                record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
                break;

            case 'RECORD_FOLLOW_UP':
                if ($row['follow_up_due_at'] === null || $row['follow_up_done_at'] !== null) {
                    $refuse('No follow-up is due for this order.');
                }
                $update('follow_up_done_at = UTC_TIMESTAMP()');
                record_order_event($pdo, $orderId, 'FOLLOW_UP.DONE', ['by' => $staff, 'emailed' => ($in['send_email'] ?? false) === true], "follow-up-done:{$reopen}");
                if (($in['send_email'] ?? false) === true) {
                    $result['messages'][] = ['FOLLOW_UP', "follow-up-{$reopen}"];
                }
                break;

            case 'MARK_COMPLETED':
                $ok = $physical
                    ? $fulfil === 'DELIVERED'
                    : in_array($stage, ['APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT'], true) && $row['approved_at'] !== null;
                if (!$ok) {
                    $refuse($physical ? 'A physical order is completed after delivery is recorded.' : 'A digital order is completed after the customer has approved it.');
                }
                $update("stage = 'COMPLETED', completed_at = UTC_TIMESTAMP()");
                record_order_event($pdo, $orderId, 'ORDER.COMPLETED', ['by' => $staff, 'follow_up_done' => $row['follow_up_done_at'] !== null], "completed:{$reopen}");
                break;

            case 'REOPEN':
                if (!in_array($stage, ['APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true)) {
                    $refuse('Only approved, locked, dispatched or completed work can be reopened.');
                }
                $reason = (string) ($in['reason'] ?? '');
                if (!in_array($reason, ['CUSTOMER_REQUEST', 'MCB_CORRECTION', 'REPLACEMENT', 'OTHER'], true)) {
                    throw new OperationsException('invalid_reason', 'Give a reason: CUSTOMER_REQUEST, MCB_CORRECTION, REPLACEMENT or OTHER.', 422);
                }
                if (in_array($fulfil, ['CONFIRMED', 'DISPATCHED', 'DELIVERED'], true)) {
                    $result['warning'] = 'The physical order was already placed. Reopening does not cancel or change anything with a supplier.';
                }
                $update(
                    "stage = 'SONG_READY', fulfilment_state = NULL, fulfilment_pending_reason = NULL,
                     fulfilment_ready_at = NULL, fulfilment_confirmed_at = NULL, fulfilment_reference = NULL,
                     carrier = NULL, tracking_reference = NULL, tracking_url = NULL, dispatched_on = NULL,
                     delivery_delayed_at = NULL, delivered_on = NULL, follow_up_due_at = NULL,
                     follow_up_done_at = NULL, completed_at = NULL,
                     reopened_at = UTC_TIMESTAMP(), reopen_count = reopen_count + 1"
                );
                revoke_access_tokens($pdo, $orderId, 'APPROVAL');
                record_order_event($pdo, $orderId, 'PRODUCTION.REOPENED', ['by' => $staff, 'reason' => $reason, 'from' => $state]);
                break;

            case 'ISSUE_STATUS_LINK':
                $token = issue_access_token($pdo, $orderId, 'STATUS', null, $staff);
                $result['links']['status'] = access_link('STATUS', $token);
                record_order_event($pdo, $orderId, 'ACCESS.STATUS_LINK_ISSUED', ['by' => $staff]);
                break;

            case 'REVOKE_LINKS':
                $purpose = $in['purpose'] ?? null;
                if ($purpose !== null && !in_array($purpose, ['STATUS', 'APPROVAL'], true)) {
                    throw new OperationsException('invalid_purpose', 'Purpose must be STATUS or APPROVAL.', 422);
                }
                $count = revoke_access_tokens($pdo, $orderId, $purpose);
                record_order_event($pdo, $orderId, 'ACCESS.LINKS_REVOKED', ['by' => $staff, 'purpose' => $purpose, 'count' => $count]);
                break;

            case 'ADD_NOTE':
                $note = operations_text($in['note'] ?? null, 2000);
                if ($note === null) {
                    throw new OperationsException('invalid_note', 'Write the note.', 422);
                }
                $pdo->prepare('INSERT INTO order_staff_notes (order_id, note, staff, created_at) VALUES (:oid, :note, :staff, UTC_TIMESTAMP())')
                    ->execute([':oid' => $orderId, ':note' => $note, ':staff' => $staff]);
                record_order_event($pdo, $orderId, 'NOTE.ADDED', ['by' => $staff]);
                break;

            case 'UPDATE_SERVICE_REQUEST':
                $requestId = (int) ($in['request_id'] ?? 0);
                $status    = (string) ($in['status'] ?? '');
                $resolution = $in['resolution'] ?? null;
                if (!in_array($status, ['IN_REVIEW', 'RESOLVED', 'DECLINED'], true)) {
                    throw new OperationsException('invalid_status', 'Status must be IN_REVIEW, RESOLVED or DECLINED.', 422);
                }
                if ($resolution !== null && !in_array($resolution, ['REPLACEMENT_ARRANGED', 'RESENT_OR_REPAIRED', 'ANSWERED', 'NO_ACTION_NEEDED', 'OTHER'], true)) {
                    throw new OperationsException('invalid_resolution', 'That resolution is not recognised.', 422);
                }
                if ($status !== 'IN_REVIEW' && $resolution === null) {
                    throw new OperationsException('invalid_resolution', 'Say how the request was resolved.', 422);
                }
                $stmt = $pdo->prepare(
                    "UPDATE order_service_requests
                        SET status = :status, resolution = :resolution,
                            resolved_by = IF(:closed1 = 1, :staff, NULL),
                            resolved_at = IF(:closed2 = 1, UTC_TIMESTAMP(), NULL)
                      WHERE id = :id AND order_id = :oid"
                );
                $closed = $status === 'IN_REVIEW' ? 0 : 1;
                $stmt->execute([
                    ':status' => $status, ':resolution' => $resolution, ':closed1' => $closed, ':closed2' => $closed,
                    ':staff' => $staff, ':id' => $requestId, ':oid' => $orderId,
                ]);
                if ($stmt->rowCount() === 0) {
                    $exists = $pdo->prepare('SELECT COUNT(*) FROM order_service_requests WHERE id = :id AND order_id = :oid');
                    $exists->execute([':id' => $requestId, ':oid' => $orderId]);
                    if ((int) $exists->fetchColumn() === 0) {
                        throw new OperationsException('request_not_found', 'No such request on this order.', 404);
                    }
                    $result['outcome'] = 'unchanged';
                }
                record_order_event($pdo, $orderId, 'SERVICE_REQUEST.UPDATED', ['by' => $staff, 'status' => $status, 'resolution' => $resolution]);
                break;
        }

        $after = operations_order_row($pdo, $orderId);
        $result['state'] = $after === null ? null : operational_state($after);
        return $result;
    });
}

/* ------------------------------------------------------------------ */
/* Events whose subject is not an order                                */
/* ------------------------------------------------------------------ */

/**
 * Records an enquiry event (MCB_LIVE.ENQUIRY_RECEIVED, BESPOKE.ENQUIRY_RECEIVED,
 * ENQUIRY.STATUS_CHANGED, QUEUE.ACKNOWLEDGED). Same rule as order_events:
 * identifiers and machine values only, never what the enquirer wrote.
 */
function record_operations_event(PDO $pdo, string $subjectType, string $reference, string $type, array $detail = [], ?string $dedupeKey = null): void
{
    $clean = [];
    foreach ($detail as $key => $value) {
        if (is_int($value) || is_bool($value) || $value === null || (is_string($value) && strlen($value) <= 120)) {
            $clean[(string) $key] = $value;
        }
    }
    $pdo->prepare(
        'INSERT IGNORE INTO operations_events (subject_type, subject_reference, event_type, detail, dedupe_key, created_at)
         VALUES (:st, :ref, :type, :detail, :dedupe, UTC_TIMESTAMP())'
    )->execute([
        ':st' => $subjectType, ':ref' => $reference, ':type' => $type,
        ':detail' => $clean === [] ? null : json_encode($clean, JSON_UNESCAPED_SLASHES),
        ':dedupe' => $dedupeKey,
    ]);
}

/** A random enquiry reference: PREFIX-YYYY-XXXXXX, unambiguous when read aloud. */
function enquiry_reference(string $prefix): string
{
    $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    $tail = '';
    for ($i = 0; $i < 6; $i++) {
        $tail .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return $prefix . '-' . gmdate('Y') . '-' . $tail;
}
