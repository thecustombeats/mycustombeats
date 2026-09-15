<?php
/**
 * MCB — operations after payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE RECORD OF WHERE AN ORDER HAS GOT TO
 * ─────────────────────────────────────────────────────────────────────────
 * Payment: `orders.status`. The work: `order_production.stage` — creation,
 * MCB's internal quality check and, for a digital order, the reveal
 * (`revealed_at`). There is no customer approval stage (Single Creative
 * Authority, 15 September 2026). The physical side:
 * `order_production.fulfilment_state`. The operational state an operator or a
 * customer sees is DERIVED from those columns here (and mirrored in
 * src/data/operations.ts); it is never stored, so it cannot disagree with them.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTOMATE THE NORMAL, SURFACE THE EXCEPTIONS
 * ─────────────────────────────────────────────────────────────────────────
 * Every move is an explicit staff action, checked
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
        p.id AS production_id, p.stage, p.approved_at, p.approval_channel, p.approval_round,
        p.production_locked_at, p.completed_at, p.creative_started_at, p.creative_ready_at,
        p.qc_submitted_at, p.qc_passed_at, p.qc_passed_by, p.qc_checklist, p.qc_failed_count,
        p.reveal_url, p.revealed_at, p.supplier_purchase_authorised_by,
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

/** Stages awaiting MCB's quality check, including legacy approval-model stages. */
const MCB_QC_PENDING_STAGES = ['QUALITY_CHECK', 'SONG_READY', 'AWAITING_APPROVAL', 'REVISION_REQUESTED'];

/** Stages whose work has passed the quality check (APPROVED is the legacy equivalent). */
const MCB_QC_PASSED_STAGES = ['QC_PASSED', 'APPROVED'];

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
    if ($stage === 'CREATIVE') {
        return ($row['creative_started_at'] ?? null) === null ? 'CREATIVE.PENDING' : 'CREATIVE.IN_PROGRESS';
    }
    if (in_array($stage, MCB_QC_PENDING_STAGES, true)) {
        return 'QUALITY_CHECK';
    }
    if ($stage === 'COMPLETED') {
        return 'COMPLETED';
    }

    // QC_PASSED (or legacy APPROVED), PRODUCTION_LOCKED, FULFILMENT
    if (order_workflow($row) === 'DIGITAL') {
        // A legacy digital approval was heard by the customer: treat it as revealed.
        $revealed = ($row['revealed_at'] ?? null) !== null || $stage === 'APPROVED';
        if (!$revealed) {
            return 'REVEAL.READY';
        }
        return follow_up_is_due($row, $now) ? 'FOLLOW_UP.DUE' : 'REVEALED';
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

/** Days after delivery (or a digital reveal) before the follow-up is due. */
function follow_up_delay_days(): int
{
    return max(0, min((int) mcb_setting('operations.follow_up_delay_days', 0), 90));
}

/**
 * Why a physical order cannot yet be made, or null when nothing is missing.
 *
 * FULFILMENT_REVIEW: the order holds an item (a player, a plaque, a pop-up
 * card) whose availability, destination and actual delivery cost staff must
 * confirm with the partner first. It is stored in the existing column as
 * OTHER — see fulfilment_pending_column() — so no schema change is needed.
 */
function fulfilment_blocker(PDO $pdo, array $row): ?string
{
    if (($row['personalisation_status'] ?? '') !== 'COMPLETE') {
        return 'PERSONALISATION';
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM delivery_addresses WHERE order_id = :id');
    $stmt->execute([':id' => (int) $row['id']]);
    if ((int) $stmt->fetchColumn() === 0) {
        return 'DELIVERY_ADDRESS';
    }
    return fulfilment_review_pending($pdo, (int) $row['id']) ? 'FULFILMENT_REVIEW' : null;
}

/** Whether staff still owe the partner availability/delivery confirmation. */
function fulfilment_review_pending(PDO $pdo, int $orderId): bool
{
    return order_requires_fulfilment_review($pdo, $orderId) && !fulfilment_review_confirmed($pdo, $orderId);
}

function fulfilment_review_confirmed(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM order_events WHERE order_id = :id AND event_type = 'FULFILMENT.REVIEW_CONFIRMED'");
    $stmt->execute([':id' => $orderId]);
    return (int) $stmt->fetchColumn() > 0;
}

/** Staff wording for a blocker. */
function fulfilment_blocker_text(string $blocker): string
{
    return $blocker === 'FULFILMENT_REVIEW'
        ? 'availability, destination and actual delivery cost confirmed with the partner'
        : strtolower(str_replace('_', ' ', $blocker));
}

/** The value a blocker is stored as in `order_production.fulfilment_pending_reason`. */
function fulfilment_pending_column(string $blocker): string
{
    return in_array($blocker, ['DELIVERY_ADDRESS', 'PERSONALISATION', 'CUSTOMER_CONTACT'], true) ? $blocker : 'OTHER';
}

/** The quality-check items required for an order of this workflow (operations.json). */
function required_qc_items(string $workflow): array
{
    $items = [];
    foreach (operations_data()['qc_checklist'] ?? [] as $item) {
        if ($item['applies_to'] === 'ALL' || ($item['applies_to'] === 'PHYSICAL' && $workflow === 'PHYSICAL')) {
            $items[] = (string) $item['id'];
        }
    }
    return $items;
}

/**
 * After a passed quality check: a physical order becomes ready for the
 * partner order (or waits on what is missing); a digital one needs nothing
 * made. Customer approval plays no part.
 */
function after_quality_check_passed(PDO $pdo, array $row): void
{
    $orderId = (int) $row['id'];
    $reopen  = (int) $row['reopen_count'];
    if (order_workflow($row) === 'DIGITAL') {
        $pdo->prepare("UPDATE order_production SET fulfilment_state = 'NOT_REQUIRED' WHERE order_id = :oid")
            ->execute([':oid' => $orderId]);
        return;
    }
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
        )->execute([':reason' => fulfilment_pending_column($blocker), ':oid' => $orderId]);
        record_order_event($pdo, $orderId, 'FULFILMENT.PENDING', ['reason' => $blocker]);
    }
}

/**
 * The digital reveal: one-way. Records it, starts the follow-up clock and
 * returns the CREATION_READY message to send after commit.
 *
 * @return list<array{0:string,1:string}>
 */
function reveal_creation(PDO $pdo, array $row, string $staff, bool $sendEmail): array
{
    $orderId = (int) $row['id'];
    $reopen  = (int) $row['reopen_count'];
    ensure_status_token($pdo, $orderId, $staff);
    $pdo->prepare(
        "UPDATE order_production
            SET revealed_at = UTC_TIMESTAMP(),
                follow_up_due_at = UTC_TIMESTAMP() + INTERVAL :days DAY, follow_up_done_at = NULL
          WHERE order_id = :oid"
    )->execute([':days' => follow_up_delay_days(), ':oid' => $orderId]);
    record_order_event($pdo, $orderId, 'REVEALED', ['by' => $staff, 'emailed' => $sendEmail], "revealed:{$reopen}");
    record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
    return $sendEmail ? [['CREATION_READY', "reveal-{$reopen}"]] : [];
}

/* ------------------------------------------------------------------ */
/* Staff actions                                                       */
/* ------------------------------------------------------------------ */

const MCB_STAFF_ACTIONS = [
    'START_CREATIVE', 'SEND_TO_QUALITY_CHECK', 'PASS_QUALITY_CHECK', 'FAIL_QUALITY_CHECK', 'SEND_REVEAL',
    'SET_FULFILMENT_READY', 'CONFIRM_FULFILMENT_REVIEW', 'CONFIRM_FULFILMENT',
    'MARK_DISPATCHED', 'UPDATE_TRACKING', 'MARK_DELIVERY_DELAYED', 'MARK_DELIVERED',
    'RECORD_FOLLOW_UP', 'MARK_COMPLETED', 'REOPEN', 'ISSUE_STATUS_LINK', 'REVOKE_LINKS',
    'ADD_NOTE', 'UPDATE_SERVICE_REQUEST',
];

/** Actions of the retired customer-approval model. Refused with an explanation. */
const MCB_RETIRED_STAFF_ACTIONS = ['MARK_CREATIVE_READY', 'REQUEST_APPROVAL', 'REISSUE_APPROVAL_LINK', 'RECORD_APPROVAL', 'RECORD_CHANGES_REQUEST'];

/**
 * Performs one staff action inside a locked transaction.
 *
 * @return array{outcome:string, state:?string, links:array<string,string>, messages:list<array{0:string,1:string}>, warning:?string}
 */
function perform_staff_action(int $orderId, string $action, array $in, string $staff): array
{
    if (in_array($action, MCB_RETIRED_STAFF_ACTIONS, true)) {
        throw new OperationsException('action_retired', 'Customer approval has been retired. Send the work to MCB\'s quality check instead.', 410);
    }
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

            case 'SEND_TO_QUALITY_CHECK':
                if ($stage !== 'CREATIVE') {
                    $refuse('Only work being created can be sent to the quality check.');
                }
                $update("stage = 'QUALITY_CHECK', creative_ready_at = UTC_TIMESTAMP(), qc_submitted_at = UTC_TIMESTAMP(),
                         creative_started_at = COALESCE(creative_started_at, UTC_TIMESTAMP())");
                $attempt = (int) $row['qc_failed_count'];
                record_order_event($pdo, $orderId, 'QUALITY_CHECK.READY', ['by' => $staff, 'attempt' => $attempt + 1], "qc-ready:{$reopen}:{$attempt}");
                break;

            case 'PASS_QUALITY_CHECK':
                if (!in_array($stage, MCB_QC_PENDING_STAGES, true)) {
                    $refuse('Only work waiting for the quality check can pass it.');
                }
                $checklist = $in['checklist'] ?? null;
                $required  = required_qc_items(order_workflow($row));
                $missing   = array_values(array_filter($required, static fn (string $id): bool => !is_array($checklist) || ($checklist[$id] ?? null) !== true));
                if ($missing !== []) {
                    throw new OperationsException('qc_checklist_incomplete', 'Tick every quality check before passing it. Still to check: ' . strtolower(str_replace('_', ' ', implode(', ', $missing))) . '.', 422);
                }
                $revealUrl = null;
                if (!$physical) {
                    $revealUrl = operations_https_url($in['reveal_url'] ?? null);
                    if ($revealUrl === null) {
                        throw new OperationsException('invalid_reveal_url', 'Add the private https link to the finished song you checked.', 422);
                    }
                }
                $update(
                    "stage = 'QC_PASSED', qc_passed_at = UTC_TIMESTAMP(), qc_passed_by = :by, qc_checklist = :list, reveal_url = :url",
                    [':by' => $staff, ':list' => json_encode(['checked' => $required], JSON_UNESCAPED_SLASHES), ':url' => $revealUrl]
                );
                revoke_access_tokens($pdo, $orderId, 'APPROVAL');
                record_order_event($pdo, $orderId, 'QUALITY_CHECK.PASSED', ['by' => $staff], "qc-passed:{$reopen}");
                after_quality_check_passed($pdo, $row);
                if (!$physical && ($in['reveal_now'] ?? true) !== false) {
                    $result['messages'] = reveal_creation($pdo, $row, $staff, ($in['send_email'] ?? true) !== false);
                    $result['links']['status'] = access_link('STATUS', ensure_status_token($pdo, $orderId, $staff));
                }
                break;

            case 'FAIL_QUALITY_CHECK':
                if (!in_array($stage, MCB_QC_PENDING_STAGES, true)) {
                    $refuse('Only work waiting for the quality check can fail it.');
                }
                $reason = (string) ($in['reason'] ?? '');
                if (!in_array($reason, operations_data()['qc_fail_reasons'] ?? [], true)) {
                    throw new OperationsException('invalid_reason', 'Choose why the quality check failed.', 422);
                }
                $note = operations_text($in['note'] ?? null, 2000);
                if ($note !== null) {
                    $pdo->prepare('INSERT INTO order_staff_notes (order_id, note, staff, created_at) VALUES (:oid, :note, :staff, UTC_TIMESTAMP())')
                        ->execute([':oid' => $orderId, ':note' => 'Quality check failed: ' . $note, ':staff' => $staff]);
                }
                $update("stage = 'CREATIVE', qc_submitted_at = NULL, qc_failed_count = qc_failed_count + 1,
                         creative_started_at = COALESCE(creative_started_at, UTC_TIMESTAMP())");
                record_order_event($pdo, $orderId, 'QUALITY_CHECK.FAILED', ['by' => $staff, 'reason' => $reason, 'attempt' => (int) $row['qc_failed_count'] + 1]);
                break;

            case 'SEND_REVEAL':
                if ($physical) {
                    $refuse('A physical order is revealed when it is delivered.');
                }
                if (!in_array($stage, MCB_QC_PASSED_STAGES, true) || $row['revealed_at'] !== null) {
                    $refuse('Only work that has passed the quality check and has not been revealed can be revealed.');
                }
                if ($stage === 'APPROVED') {
                    $refuse('This order was completed under the retired approval model and has already been heard by the customer.');
                }
                $url = $row['reveal_url'] ?? null;
                if (($in['reveal_url'] ?? null) !== null) {
                    $url = operations_https_url($in['reveal_url']);
                    if ($url === null) {
                        throw new OperationsException('invalid_reveal_url', 'The reveal link must be an https address.', 422);
                    }
                    $update('reveal_url = :url', [':url' => $url]);
                }
                if ($url === null) {
                    throw new OperationsException('invalid_reveal_url', 'Add the private https link to the finished song.', 422);
                }
                $result['messages'] = reveal_creation($pdo, $row, $staff, ($in['send_email'] ?? true) !== false);
                $result['links']['status'] = access_link('STATUS', ensure_status_token($pdo, $orderId, $staff));
                break;

            case 'SET_FULFILMENT_READY':
                if (!$physical || !in_array($stage, MCB_QC_PASSED_STAGES, true) || $fulfil !== 'PENDING') {
                    $refuse('Only a physical order that has passed the quality check and is waiting on something can be marked ready.');
                }
                $blocker = fulfilment_blocker($pdo, $row);
                if ($blocker !== null) {
                    $update('fulfilment_pending_reason = :r', [':r' => fulfilment_pending_column($blocker)]);
                    throw new OperationsException('fulfilment_blocked', 'Still missing: ' . fulfilment_blocker_text($blocker) . '.');
                }
                $update("fulfilment_state = 'READY', fulfilment_pending_reason = NULL, fulfilment_ready_at = UTC_TIMESTAMP()");
                record_order_event($pdo, $orderId, 'FULFILMENT.READY', ['by' => $staff], "fulfilment-ready:{$reopen}");
                break;

            case 'CONFIRM_FULFILMENT_REVIEW':
                if (!$physical || in_array($fulfil, ['CONFIRMED', 'DISPATCHED', 'DELIVERED'], true)) {
                    $refuse('Availability and delivery can only be confirmed on a physical order that has not been placed with the partner.');
                }
                if (!order_requires_fulfilment_review($pdo, $orderId)) {
                    $refuse('Nothing in this order needs availability or delivery confirming with a partner.');
                }
                if (($in['confirmed'] ?? null) !== true) {
                    throw new OperationsException('confirmation_required', 'Tick to confirm you have checked availability, the destination and the actual delivery cost with the partner.', 422);
                }
                $summary = operations_text($in['note'] ?? null, 2000);
                if ($summary === null) {
                    throw new OperationsException('invalid_note', 'Note what was confirmed (availability, destination, delivery cost), without any card or account details.', 422);
                }
                if (fulfilment_review_confirmed($pdo, $orderId)) {
                    $result['outcome'] = 'unchanged';
                    break;
                }
                $pdo->prepare('INSERT INTO order_staff_notes (order_id, note, staff, created_at) VALUES (:oid, :note, :staff, UTC_TIMESTAMP())')
                    ->execute([':oid' => $orderId, ':note' => 'Availability and delivery confirmed: ' . $summary, ':staff' => $staff]);
                record_order_event($pdo, $orderId, 'FULFILMENT.REVIEW_CONFIRMED', ['by' => $staff], "fulfilment-review:{$reopen}");
                // A quality-checked order waiting only on this moves on by itself.
                if (in_array($stage, MCB_QC_PASSED_STAGES, true) && $fulfil === 'PENDING' && fulfilment_blocker($pdo, $row) === null) {
                    $update("fulfilment_state = 'READY', fulfilment_pending_reason = NULL, fulfilment_ready_at = UTC_TIMESTAMP()");
                    record_order_event($pdo, $orderId, 'FULFILMENT.READY', ['by' => $staff], "fulfilment-ready:{$reopen}");
                }
                break;

            case 'CONFIRM_FULFILMENT':
                if (!$physical || !in_array($stage, MCB_QC_PASSED_STAGES, true) || $fulfil !== 'READY') {
                    $refuse('Confirm the physical order only once the work has passed the quality check and fulfilment is ready.');
                }
                if (fulfilment_review_pending($pdo, $orderId)) {
                    $refuse('Confirm availability, the destination and the actual delivery cost with the partner before placing this order.');
                }
                // Supplier expenditure is human-authorised: Bella or Lewis.
                $authorisedBy = (string) ($in['purchase_authorised_by'] ?? '');
                if (!in_array($authorisedBy, ['BELLA', 'LEWIS'], true)) {
                    throw new OperationsException('purchase_authorisation_required', 'Say who authorised the partner purchase: BELLA or LEWIS.', 422);
                }
                $update(
                    "stage = 'PRODUCTION_LOCKED', production_locked_at = COALESCE(production_locked_at, UTC_TIMESTAMP()),
                     fulfilment_state = 'CONFIRMED', fulfilment_confirmed_at = UTC_TIMESTAMP(), fulfilment_reference = :ref,
                     supplier_purchase_authorised_by = :auth",
                    [':ref' => operations_line($in['fulfilment_reference'] ?? null, 120), ':auth' => $authorisedBy]
                );
                record_order_event($pdo, $orderId, 'FULFILMENT.CONFIRMED', ['by' => $staff, 'authorised_by' => $authorisedBy], "fulfilment-confirmed:{$reopen}");
                if (($in['send_email'] ?? true) !== false) {
                    $result['messages'][] = ['IN_PRODUCTION', "in-production-{$reopen}"];
                }
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
                    : ($stage === 'QC_PASSED' && $row['revealed_at'] !== null) || ($stage === 'APPROVED' && $row['approved_at'] !== null);
                if (!$ok) {
                    $refuse($physical ? 'A physical order is completed after delivery is recorded.' : 'A digital order is completed after it has been revealed.');
                }
                $update("stage = 'COMPLETED', completed_at = UTC_TIMESTAMP()");
                record_order_event($pdo, $orderId, 'ORDER.COMPLETED', ['by' => $staff, 'follow_up_done' => $row['follow_up_done_at'] !== null], "completed:{$reopen}");
                break;

            case 'REOPEN':
                if (!in_array($stage, ['QC_PASSED', 'APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true)) {
                    $refuse('Only quality-checked, placed, dispatched or completed work can be reopened.');
                }
                // No customer-request reopen: a creative preference does not reopen production.
                $reason = (string) ($in['reason'] ?? '');
                $reasons = operations_data()['reopen_reasons'] ?? [];
                if (!in_array($reason, $reasons, true)) {
                    throw new OperationsException('invalid_reason', 'Give a reason: ' . implode(', ', $reasons) . '.', 422);
                }
                if (in_array($fulfil, ['CONFIRMED', 'DISPATCHED', 'DELIVERED'], true)) {
                    $result['warning'] = 'The physical order was already placed. Reopening does not cancel or change anything with a supplier.';
                }
                $update(
                    "stage = 'CREATIVE', creative_started_at = UTC_TIMESTAMP(), qc_submitted_at = NULL, qc_passed_at = NULL,
                     qc_passed_by = NULL, qc_checklist = NULL, reveal_url = NULL, revealed_at = NULL,
                     supplier_purchase_authorised_by = NULL, fulfilment_state = NULL, fulfilment_pending_reason = NULL,
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
