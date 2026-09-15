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
 * ─────────────────────────────────────────────────────────────────────────
 * FINANCIAL AUTHORITY (Automation Foundation, 15 September 2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Automation may detect, prepare, validate, queue and notify. Spending money
 * with a supplier needs Bella OR Lewis to act explicitly:
 * AUTHORISE_SUPPLIER_PURCHASE, on the authenticated staff page, with that
 * founder's own authorisation code (stored only as a password hash in
 * server configuration). A notification link opens that page; it never
 * authorises anything. CONFIRM_FULFILMENT (the supplier order recorded as
 * placed by hand) is refused until that authorisation exists.
 *
 * Audit events carry identifiers, states and machine reasons only — never a
 * story, feedback, a note, an address or a contact detail.
 */

declare(strict_types=1);

require_once __DIR__ . '/legal.php';
require_once __DIR__ . '/founder-notifications.php';
require_once __DIR__ . '/artwork.php';
require_once __DIR__ . '/creative-factory.php';
require_once __DIR__ . '/production-files.php';
require_once __DIR__ . '/fulfilment-controller.php';
require_once __DIR__ . '/video.php';

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
        p.reveal_url, p.revealed_at, p.supplier_purchase_authorised_by, p.supplier_purchase_authorised_at,
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
        'READY'      => ($row['supplier_purchase_authorised_at'] ?? null) !== null ? 'FULFILMENT.AUTHORISED' : 'FULFILMENT.READY',
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
    if (fulfilment_review_pending($pdo, (int) $row['id'])) {
        return 'FULFILMENT_REVIEW';
    }
    // The Manufacturing Package (Production File Factory). Built every time it is
    // checked (a new version only when its content changes). In REQUIRED mode a
    // physical order cannot be fulfilment-ready until the package is READY.
    $package = build_manufacturing_package($pdo, (int) $row['id'], 'SYSTEM');
    if ($package !== null && $package['status'] !== 'READY' && creative_enforcement() === 'REQUIRED') {
        return 'MANUFACTURING_PACKAGE';
    }
    return null;
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
    return match ($blocker) {
        'FULFILMENT_REVIEW' => 'availability, destination and actual delivery cost confirmed with the partner',
        'MANUFACTURING_PACKAGE' => 'a READY manufacturing package (masters, album QC, artwork, production files, verified capacity)',
        default => strtolower(str_replace('_', ' ', $blocker)),
    };
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
 * A physical order is ready for the supplier order: records FULFILMENT.READY
 * and asks the Founders for the purchase authorisation (once per round).
 */
function mark_fulfilment_ready(PDO $pdo, array $row, ?string $staff): void
{
    $orderId = (int) $row['id'];
    $reopen  = (int) $row['reopen_count'];
    $pdo->prepare(
        "UPDATE order_production
            SET fulfilment_state = 'READY', fulfilment_pending_reason = NULL, fulfilment_ready_at = UTC_TIMESTAMP()
          WHERE order_id = :oid"
    )->execute([':oid' => $orderId]);
    record_order_event($pdo, $orderId, 'FULFILMENT.READY', $staff === null ? [] : ['by' => $staff], "fulfilment-ready:{$reopen}");
    // Expected economics before the founder decides (server-only; data required is flagged, never estimated).
    fulfilment_check_commercials($pdo, $orderId, $staff ?? 'SYSTEM');
    $package = current_manufacturing_package($pdo, $orderId);
    notify_founders_about_order($pdo, 'FULFILMENT_APPROVAL_REQUIRED', $orderId, "fulfilment-approval:{$orderId}:{$reopen}",
        ['qc' => 'PASSED', 'supplier_order' => 'READY', 'manufacturing_package' => $package['status'] ?? 'NOT_BUILT'], 'AUTHORISE_SUPPLIER_PURCHASE');
}

/* ------------------------------------------------------------------ */
/* Founder authorisation                                               */
/* ------------------------------------------------------------------ */

const MCB_FOUNDERS = ['BELLA', 'LEWIS'];

/** Refused authorisation attempts allowed per order in 15 minutes. */
const MCB_FOUNDER_AUTHORISATION_ATTEMPTS = 5;

/** Whether a founder has an authorisation code configured (as a password hash). */
function founder_authorisation_configured(string $founder): bool
{
    $hash = (string) mcb_setting("founders.{$founder}.authorisation_hash", '');
    return in_array($founder, MCB_FOUNDERS, true) && str_starts_with($hash, '$') && strlen($hash) >= 50;
}

/** Verifies a founder's own authorisation code. The code itself is never stored or logged. */
function verify_founder_authorisation(string $founder, mixed $code): bool
{
    if (!founder_authorisation_configured($founder) || !is_string($code) || strlen($code) < 12 || strlen($code) > 200) {
        return false;
    }
    return password_verify($code, (string) mcb_setting("founders.{$founder}.authorisation_hash", ''));
}

/**
 * The checks that happen BEFORE the locked transaction for a supplier
 * purchase authorisation, so a refused attempt is audited even though
 * nothing else is written.
 */
function check_founder_authorisation_request(int $orderId, array $in, string $staff, string $what = 'a supplier purchase', string $confirmWhat = 'the supplier purchase for this order'): string
{
    $founder = strtoupper(is_string($in['founder'] ?? null) ? $in['founder'] : '');
    if (!in_array($founder, MCB_FOUNDERS, true)) {
        throw new OperationsException('founder_required', "Only Bella or Lewis can authorise {$what}. Choose who is authorising.", 422);
    }
    if (($in['confirm'] ?? null) !== true) {
        throw new OperationsException('authorisation_confirmation_required', "Tick to confirm you authorise {$confirmWhat}.", 422);
    }
    if (!founder_authorisation_configured($founder)) {
        error_log("MCB operations: no authorisation code is configured for founder {$founder}; authorisation refused.");
        throw new OperationsException('founder_authorisation_unavailable', 'Founder authorisation is not configured on this server.', 503);
    }
    $pdo = db();
    $recent = $pdo->prepare(
        "SELECT COUNT(*) FROM order_events
          WHERE order_id = :oid AND event_type = 'FULFILMENT.AUTHORISATION_REFUSED'
            AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE"
    );
    $recent->execute([':oid' => $orderId]);
    if ((int) $recent->fetchColumn() >= MCB_FOUNDER_AUTHORISATION_ATTEMPTS) {
        throw new OperationsException('too_many_attempts', 'Too many refused authorisation attempts for this order. Wait 15 minutes.', 429);
    }
    if (!verify_founder_authorisation($founder, $in['founder_code'] ?? null)) {
        record_order_event_safely($pdo, $orderId, 'FULFILMENT.AUTHORISATION_REFUSED', ['founder' => $founder, 'by' => $staff]);
        throw new OperationsException('founder_authorisation_failed', 'That authorisation code is not correct for ' . ucfirst(strtolower($founder)) . '. Nothing was authorised.', 403);
    }
    return $founder;
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
        mark_fulfilment_ready($pdo, $row, null);
    } else {
        $pdo->prepare(
            "UPDATE order_production SET fulfilment_state = 'PENDING', fulfilment_pending_reason = :reason WHERE order_id = :oid"
        )->execute([':reason' => fulfilment_pending_column($blocker), ':oid' => $orderId]);
        record_order_event($pdo, $orderId, 'FULFILMENT.PENDING', ['reason' => $blocker]);
        notify_founders_about_order($pdo, 'FULFILMENT_EXCEPTION', $orderId, "fulfilment-blocked:{$orderId}:{$reopen}:{$blocker}",
            ['qc' => 'PASSED', 'supplier_order' => 'BLOCKED', 'reason' => $blocker]);
    }
}

/**
 * Completion is independent of follow-up and review: a revealed digital order
 * or a delivered physical order is COMPLETED at once. The follow-up and the
 * review request run after it on their own clocks, and a follow-up email
 * that fails does not make a fulfilled order look incomplete.
 */
function complete_order(PDO $pdo, array $row, string $trigger, string $staff): void
{
    $orderId = (int) $row['id'];
    $reopen  = (int) $row['reopen_count'];
    $pdo->prepare("UPDATE order_production SET stage = 'COMPLETED', completed_at = COALESCE(completed_at, UTC_TIMESTAMP()) WHERE order_id = :oid")
        ->execute([':oid' => $orderId]);
    record_order_event($pdo, $orderId, 'ORDER.COMPLETED', ['by' => $staff, 'trigger' => $trigger], "completed:{$reopen}");
}

/**
 * The digital reveal: one-way. Records it, completes the order, starts the
 * follow-up clock and returns the CREATION_READY message to send after commit.
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
    complete_order($pdo, $row, 'REVEALED', $staff);
    record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
    return $sendEmail ? [['CREATION_READY', "reveal-{$reopen}"]] : [];
}

/**
 * Delivered and complete only when every required parcel has arrived and no
 * blocking exception is open. Returns whether the order was completed now.
 */
function complete_if_all_delivered(PDO $pdo, array $row, string $staff, string $deliveredOn): bool
{
    $orderId = (int) $row['id'];
    $reopen  = (int) $row['reopen_count'];
    if (!order_delivery_position($pdo, $orderId)['complete']) {
        return false;
    }
    $pdo->prepare(
        "UPDATE order_production
            SET fulfilment_state = 'DELIVERED', delivered_on = :date,
                follow_up_due_at = UTC_TIMESTAMP() + INTERVAL :days DAY, follow_up_done_at = NULL
          WHERE order_id = :oid"
    )->execute([':date' => $deliveredOn, ':days' => follow_up_delay_days(), ':oid' => $orderId]);
    record_order_event($pdo, $orderId, 'DELIVERED', ['by' => $staff, 'parcels' => count(order_shipments($pdo, $orderId))], "delivered:{$reopen}");
    complete_order($pdo, $row, 'DELIVERED', $staff);
    record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
    prepare_lifecycle_hooks($pdo, $orderId);
    return true;
}

/* ------------------------------------------------------------------ */
/* Staff actions                                                       */
/* ------------------------------------------------------------------ */

const MCB_STAFF_ACTIONS = [
    'START_CREATIVE', 'SEND_TO_QUALITY_CHECK', 'PASS_QUALITY_CHECK', 'FAIL_QUALITY_CHECK', 'SEND_REVEAL',
    'SET_FULFILMENT_READY', 'CONFIRM_FULFILMENT_REVIEW', 'AUTHORISE_SUPPLIER_PURCHASE', 'CONFIRM_FULFILMENT',
    'MARK_DISPATCHED', 'UPDATE_TRACKING', 'MARK_DELIVERY_DELAYED', 'MARK_DELIVERED',
    'RECORD_FOLLOW_UP', 'MARK_COMPLETED', 'REOPEN', 'ISSUE_STATUS_LINK', 'REVOKE_LINKS',
    'ADD_NOTE', 'UPDATE_SERVICE_REQUEST',
    // Fulfilment Controller (lib/fulfilment-controller.php).
    'RECORD_SUPPLIER_ORDER', 'ADD_SHIPMENT', 'MARK_SHIPMENT_DISPATCHED', 'UPDATE_SHIPMENT', 'MARK_SHIPMENT_DELIVERED',
    'MARK_SHIPMENT_LOST', 'RAISE_FULFILMENT_EXCEPTION', 'RESOLVE_FULFILMENT_EXCEPTION', 'RECORD_REVIEW_REQUEST',
    'RECORD_CONTENT_PERMISSION',
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

    // A founder's code is checked, and a refusal audited, before anything is locked.
    $founder = $action === 'AUTHORISE_SUPPLIER_PURCHASE' ? check_founder_authorisation_request($orderId, $in, $staff) : null;
    // Resolutions with financial or customer consequences are the Founders' alone, with the same code.
    if ($action === 'RESOLVE_FULFILMENT_EXCEPTION' && in_array($in['resolution'] ?? null, fulfilment_data()['founder_only_resolutions'], true)) {
        $founder = check_founder_authorisation_request($orderId, $in, $staff);
    }
    // An ordinary product is never substituted silently; the exception it raises is kept.
    if (in_array($action, ['CONFIRM_FULFILMENT', 'RECORD_SUPPLIER_ORDER'], true)) {
        check_substitution_request($orderId, $in, $staff);
    }

    return db_transaction(function (PDO $pdo) use ($orderId, $action, $in, $staff, $founder): array {
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
                if ($physical) {
                    // Production artwork must be registered and technically checked first.
                    $blocking = artwork_blocking_rows(plan_order_artwork($pdo, $orderId));
                    if ($blocking !== []) {
                        throw new OperationsException('artwork_not_ready', 'Production artwork is not ready: ' . implode('; ', array_map(
                            static fn (array $r): string => strtolower(str_replace('_', ' ', $r['template_id'] . ' ' . $r['status'])),
                            $blocking
                        )) . '. Register each output on the artwork panel first.');
                    }
                }
                // The Creative Factory: masters, album QC and (for a record) verified capacity.
                $creative = creative_fulfilment_gate($pdo, $row);
                if ($creative['blocked']) {
                    throw new OperationsException($creative['capacity_exception'] ? 'audio_capacity_exception' : 'creative_not_ready',
                        ($creative['capacity_exception']
                            ? 'The finished programme exceeds the verified record capacity. Nothing is shortened or compressed automatically; resolve it first.'
                            : 'The Creative Factory is not complete: ') . ' (' . strtolower(str_replace('_', ' ', implode(', ', $creative['reasons']))) . ').');
                }
                if ($creative['reasons'] !== []) {
                    $result['warning'] = 'Creative Factory (advisory): ' . strtolower(str_replace('_', ' ', implode(', ', $creative['reasons']))) . '.';
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
                $attempt = (int) $row['qc_failed_count'] + 1;
                record_order_event($pdo, $orderId, 'QUALITY_CHECK.FAILED', ['by' => $staff, 'reason' => $reason, 'attempt' => $attempt]);
                notify_founders_about_order($pdo, 'QC_EXCEPTION', $orderId, "qc-failed:{$orderId}:{$reopen}:{$attempt}",
                    ['qc' => 'FAILED', 'reason' => $reason]);
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
                mark_fulfilment_ready($pdo, $row, $staff);
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
                    mark_fulfilment_ready($pdo, $row, $staff);
                }
                break;

            case 'AUTHORISE_SUPPLIER_PURCHASE':
                if (!$physical || !in_array($stage, MCB_QC_PASSED_STAGES, true) || $fulfil !== 'READY') {
                    $refuse('A supplier purchase can be authorised only for a physical order that has passed the quality check and is ready for fulfilment.');
                }
                if (fulfilment_review_pending($pdo, $orderId)) {
                    $refuse('Confirm availability, the destination and the actual delivery cost with the partner before authorising the purchase.');
                }
                if (creative_enforcement() === 'REQUIRED' && (current_manufacturing_package($pdo, $orderId)['status'] ?? null) !== 'READY') {
                    throw new OperationsException('manufacturing_package_not_ready', 'The manufacturing package is not READY, so there is nothing ready to purchase.');
                }
                if (creative_fulfilment_gate($pdo, $row)['capacity_exception']) {
                    throw new OperationsException('audio_capacity_exception', 'The finished programme exceeds the verified record capacity. It cannot be purchased for manufacture until that is resolved.');
                }
                if ($row['supplier_purchase_authorised_at'] !== null) {
                    $result['outcome'] = 'unchanged';
                    break;
                }
                // Destination and commercial checks. The founder sees both on the decision card;
                // anything not verified needs their explicit acknowledgement (ADVISORY) or blocks (REQUIRED).
                $requiredMode = creative_enforcement() === 'REQUIRED';
                $destination = order_destination_check($pdo, $orderId);
                if ($destination['status'] === 'DESTINATION_UNSUPPORTED') {
                    throw new OperationsException('destination_unsupported', 'The supplier route does not deliver to this destination. Nothing can be authorised: raise a DESTINATION_PROBLEM exception for a founder decision (the paid order is not cancelled).');
                }
                if ($destination['status'] === 'DESTINATION_UNKNOWN' && $requiredMode) {
                    throw new OperationsException('destination_unknown', 'Whether the supplier route delivers to this destination is not known. Record the route\'s destinations first.');
                }
                if ($destination['status'] !== 'DESTINATION_SUPPORTED' && ($in['destination_acknowledged'] ?? null) !== true) {
                    throw new OperationsException('destination_acknowledgement_required', 'The destination is ' . strtolower(str_replace(['DESTINATION_', '_'], ['', ' '], $destination['status'])) . ': tick to confirm it will be verified at the supplier checkout before the order is placed.', 422);
                }
                $economics = fulfilment_check_commercials($pdo, $orderId, $staff);
                $safetyOpen = $pdo->prepare("SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id = :o AND type = 'COMMERCIAL_SAFETY_EXCEPTION' AND status = 'OPEN'");
                $safetyOpen->execute([':o' => $orderId]);
                $commercialConcern = $economics['status'] === 'COMMERCIAL_DATA_REQUIRED' || (int) $safetyOpen->fetchColumn() > 0
                    || ($economics['status'] === 'COMMERCIAL_SAFETY_EXCEPTION' && !commercial_safety_proceed_approved($pdo, $orderId));
                if ($commercialConcern && $requiredMode) {
                    throw new OperationsException('commercial_check_required', 'The expected economics are ' . strtolower(str_replace('_', ' ', $economics['status'])) . '. Complete the route data or resolve the commercial safety exception first.');
                }
                if ($commercialConcern && ($in['commercial_acknowledged'] ?? null) !== true) {
                    throw new OperationsException('commercial_acknowledgement_required', 'The expected economics are ' . strtolower(str_replace('_', ' ', $economics['status'])) . ' (or a commercial safety exception is open): tick to confirm you have reviewed them. The customer\'s paid price is honoured either way.', 422);
                }
                $update('supplier_purchase_authorised_by = :founder, supplier_purchase_authorised_at = UTC_TIMESTAMP()', [':founder' => $founder]);
                record_order_event($pdo, $orderId, 'FULFILMENT.AUTHORISED', [
                    'founder' => $founder, 'by' => $staff, 'method' => 'FOUNDER_CODE', 'ip_hash' => hash_ip(client_ip()),
                    'destination' => $destination['status'], 'economics' => $economics['status'], 'economics_snapshot' => $economics['snapshot_id'],
                    'destination_acknowledged' => ($in['destination_acknowledged'] ?? null) === true, 'commercial_acknowledged' => ($in['commercial_acknowledged'] ?? null) === true,
                ], "fulfilment-authorised:{$reopen}");
                break;

            case 'CONFIRM_FULFILMENT':
            case 'RECORD_SUPPLIER_ORDER':
                // A further supplier order for a split order, once the first is placed.
                if ($action === 'RECORD_SUPPLIER_ORDER' && $physical && in_array($fulfil, ['CONFIRMED', 'DISPATCHED'], true)) {
                    $recorded = record_supplier_order($pdo, $row, $in, $staff);
                    $result['supplier_order'] = $recorded;
                    break;
                }
                if (!$physical || !in_array($stage, MCB_QC_PASSED_STAGES, true) || $fulfil !== 'READY') {
                    $refuse('Confirm the physical order only once the work has passed the quality check and fulfilment is ready.');
                }
                if (fulfilment_review_pending($pdo, $orderId)) {
                    $refuse('Confirm availability, the destination and the actual delivery cost with the partner before placing this order.');
                }
                // Supplier expenditure is authorised by Bella or Lewis, explicitly, first.
                if ($row['supplier_purchase_authorised_at'] === null || $row['supplier_purchase_authorised_by'] === null) {
                    throw new OperationsException('founder_authorisation_required', 'Bella or Lewis must authorise the supplier purchase first (AUTHORISE_SUPPLIER_PURCHASE).', 409);
                }
                $authorisedBy = (string) $row['supplier_purchase_authorised_by'];
                if (creative_enforcement() === 'REQUIRED' && (current_manufacturing_package($pdo, $orderId)['status'] ?? null) !== 'READY') {
                    throw new OperationsException('manufacturing_package_not_ready', 'The manufacturing package is not READY.');
                }
                $reference = operations_line($in['supplier_order_reference'] ?? ($in['fulfilment_reference'] ?? null), 120);
                if ($action === 'RECORD_SUPPLIER_ORDER' && $reference === null) {
                    throw new OperationsException('supplier_order_reference_required', 'Add the supplier\'s order reference.', 422);
                }
                // The supplier order record: what was placed, by whom, at what actual cost.
                if ($reference !== null) {
                    $result['supplier_order'] = record_supplier_order($pdo, $row, $in, $staff);
                }
                // The supplier order pack records that the order was placed, by whom.
                $pdo->prepare("UPDATE supplier_order_packs SET status = 'ORDER_PLACED', placed_by = :by, placed_at = UTC_TIMESTAMP() WHERE order_id = :oid AND status = 'PREPARED'")
                    ->execute([':by' => $staff, ':oid' => $orderId]);
                $update(
                    "stage = 'PRODUCTION_LOCKED', production_locked_at = COALESCE(production_locked_at, UTC_TIMESTAMP()),
                     fulfilment_state = 'CONFIRMED', fulfilment_confirmed_at = UTC_TIMESTAMP(), fulfilment_reference = :ref",
                    [':ref' => $reference]
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
                // The single-parcel path keeps parcel 1 in step, so the customer page and completion agree.
                $parcels = order_shipments($pdo, $orderId);
                if ($action === 'MARK_DISPATCHED' && $parcels === []) {
                    $parcelId = add_shipment($pdo, $orderId, [], $staff);
                    $parcels = order_shipments($pdo, $orderId);
                }
                if (count($parcels) === 1) {
                    $pdo->prepare("UPDATE shipments SET state = IF(state = 'AWAITING_DISPATCH', 'DISPATCHED', state), carrier = :c, tracking_reference = :r, tracking_url = :u, dispatched_on = :d WHERE id = :id")
                        ->execute([':c' => $carrier, ':r' => operations_line($in['tracking_reference'] ?? null, 120), ':u' => $trackingUrl, ':d' => $date, ':id' => (int) $parcels[0]['id']]);
                }
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
                notify_founders_about_order($pdo, 'FULFILMENT_EXCEPTION', $orderId, "delivery-delayed:{$orderId}:{$reopen}",
                    ['supplier_order' => 'DISPATCHED', 'reason' => 'DELIVERY_DELAYED']);
                break;

            case 'MARK_DELIVERED':
                if (!$physical || $fulfil !== 'DISPATCHED') {
                    $refuse('Only a dispatched order can be marked delivered.');
                }
                $date = operations_past_date($in['delivered_on'] ?? null);
                if ($date === null || ($row['dispatched_on'] !== null && $date < $row['dispatched_on'])) {
                    throw new OperationsException('invalid_delivery_date', 'Add the delivery date: on or after dispatch, and not in the future.', 422);
                }
                $parcels = order_shipments($pdo, $orderId);
                if (count($parcels) > 1) {
                    throw new OperationsException('parcels_recorded_separately', 'This order has more than one parcel. Record each parcel\'s delivery (MARK_SHIPMENT_DELIVERED); the order completes when every required parcel has arrived.');
                }
                if (open_blocking_exceptions($pdo, $orderId) !== []) {
                    throw new OperationsException('blocking_exception_open', 'A blocking fulfilment exception is open on this order. Resolve it before recording delivery.');
                }
                if (count($parcels) === 1) {
                    $pdo->prepare("UPDATE shipments SET state = 'DELIVERED', delivered_on = :d WHERE id = :id")->execute([':d' => $date, ':id' => (int) $parcels[0]['id']]);
                }
                $update(
                    "fulfilment_state = 'DELIVERED', delivered_on = :date,
                     follow_up_due_at = UTC_TIMESTAMP() + INTERVAL :days DAY, follow_up_done_at = NULL",
                    [':date' => $date, ':days' => follow_up_delay_days()]
                );
                record_order_event($pdo, $orderId, 'DELIVERED', ['by' => $staff], "delivered:{$reopen}");
                complete_order($pdo, $row, 'DELIVERED', $staff);
                record_order_event($pdo, $orderId, 'FOLLOW_UP.DUE', ['after_days' => follow_up_delay_days()], "follow-up-due:{$reopen}");
                prepare_lifecycle_hooks($pdo, $orderId);
                if (($in['send_email'] ?? false) === true) {
                    $result['messages'][] = ['DELIVERED', "delivered-{$reopen}"];
                }
                break;

            case 'ADD_SHIPMENT':
                if (!$physical || !in_array($fulfil, ['CONFIRMED', 'DISPATCHED'], true)) {
                    $refuse('Parcels are added once the supplier order has been placed.');
                }
                $result['shipment_id'] = add_shipment($pdo, $orderId, $in, $staff);
                break;

            case 'MARK_SHIPMENT_DISPATCHED':
                if (!$physical || !in_array($fulfil, ['CONFIRMED', 'DISPATCHED'], true)) {
                    $refuse('A parcel can be dispatched only once the supplier order has been placed.');
                }
                $parcel = shipment_for_order($pdo, $orderId, $in['shipment_id'] ?? null);
                if ($parcel['state'] !== 'AWAITING_DISPATCH') {
                    $refuse('That parcel has already been dispatched.');
                }
                $carrier = operations_line($in['carrier'] ?? null, 80);
                $date    = operations_past_date($in['dispatched_on'] ?? null);
                $trackingUrlRaw = $in['tracking_url'] ?? null;
                $trackingUrl    = operations_https_url($trackingUrlRaw);
                $trackingRef    = operations_line($in['tracking_reference'] ?? null, 120);
                if ($carrier === null || $date === null) {
                    throw new OperationsException('invalid_dispatch', 'Add the carrier and the dispatch date (not in the future).', 422);
                }
                if ($trackingUrlRaw !== null && $trackingUrlRaw !== '' && $trackingUrl === null) {
                    throw new OperationsException('invalid_tracking_url', 'The tracking link must be an https address.', 422);
                }
                $estimate = is_string($in['estimated_delivery_date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['estimated_delivery_date']) === 1 ? $in['estimated_delivery_date'] : null;
                $pdo->prepare("UPDATE shipments SET state = 'DISPATCHED', carrier = :c, tracking_reference = :r, tracking_url = :u, dispatched_on = :d, estimated_delivery_date = :e WHERE id = :id")
                    ->execute([':c' => $carrier, ':r' => $trackingRef, ':u' => $trackingUrl, ':d' => $date, ':e' => $estimate, ':id' => (int) $parcel['id']]);
                record_order_event($pdo, $orderId, 'SHIPMENT.PARCEL_DISPATCHED', ['shipment_id' => (int) $parcel['id'], 'sequence' => (int) $parcel['sequence'], 'by' => $staff, 'has_tracking' => $trackingUrl !== null || $trackingRef !== null], "parcel-dispatched:{$parcel['id']}");
                $sendEmail = ($in['send_email'] ?? true) !== false;
                if ($fulfil === 'CONFIRMED') {
                    // The first parcel moves the order to DISPATCHED (the order row mirrors it).
                    $update(
                        "stage = 'FULFILMENT', fulfilment_state = 'DISPATCHED', carrier = :carrier, tracking_reference = :tref, tracking_url = :turl, dispatched_on = :date",
                        [':carrier' => $carrier, ':tref' => $trackingRef, ':turl' => $trackingUrl, ':date' => $date]
                    );
                    record_order_event($pdo, $orderId, 'DISPATCHED', ['by' => $staff, 'has_tracking' => $trackingUrl !== null || $trackingRef !== null], "dispatched:{$reopen}");
                    if ($sendEmail) {
                        $result['messages'][] = ['DISPATCHED', "parcel-{$parcel['id']}"];
                    }
                } elseif ($sendEmail) {
                    $result['messages'][] = ['ADDITIONAL_PARCEL_DISPATCHED', "parcel-{$parcel['id']}"];
                }
                break;

            case 'UPDATE_SHIPMENT':
                if (!$physical) {
                    $refuse('Only a physical order has parcels.');
                }
                $parcel = shipment_for_order($pdo, $orderId, $in['shipment_id'] ?? null);
                $newState = $in['state'] ?? null;
                if (!in_array($newState, ['IN_TRANSIT', 'DELAYED'], true) || !in_array($parcel['state'], ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'], true)) {
                    $refuse('A dispatched parcel can be updated to IN_TRANSIT or DELAYED.');
                }
                $trackingUrlRaw = $in['tracking_url'] ?? null;
                $trackingUrl    = operations_https_url($trackingUrlRaw);
                if ($trackingUrlRaw !== null && $trackingUrlRaw !== '' && $trackingUrl === null) {
                    throw new OperationsException('invalid_tracking_url', 'The tracking link must be an https address.', 422);
                }
                $estimate = is_string($in['estimated_delivery_date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $in['estimated_delivery_date']) === 1 ? $in['estimated_delivery_date'] : null;
                $pdo->prepare('UPDATE shipments SET state = :s, tracking_reference = COALESCE(:r, tracking_reference), tracking_url = COALESCE(:u, tracking_url), estimated_delivery_date = COALESCE(:e, estimated_delivery_date) WHERE id = :id')
                    ->execute([':s' => $newState, ':r' => operations_line($in['tracking_reference'] ?? null, 120), ':u' => $trackingUrl, ':e' => $estimate, ':id' => (int) $parcel['id']]);
                if ($newState === 'IN_TRANSIT') {
                    record_order_event($pdo, $orderId, 'SHIPMENT.IN_TRANSIT', ['shipment_id' => (int) $parcel['id'], 'by' => $staff], "parcel-in-transit:{$parcel['id']}");
                } else {
                    $type = in_array($in['exception_type'] ?? null, ['PARCEL_DELAYED', 'TRACKING_STALLED', 'CUSTOMS_EXCEPTION', 'SUPPLIER_DELAY'], true) ? $in['exception_type'] : 'PARCEL_DELAYED';
                    // A delay is surfaced, not blocking: the parcel still completes the order when it arrives.
                    raise_fulfilment_exception($pdo, $orderId, $type, ['shipment_id' => (int) $parcel['id'], 'blocking' => false,
                        'next_action' => 'Chase the production partner and keep the customer informed.'], $staff, "parcel-delayed:{$parcel['id']}:{$type}");
                    $update('delivery_delayed_at = COALESCE(delivery_delayed_at, UTC_TIMESTAMP())');
                    record_order_event($pdo, $orderId, 'DELIVERY.DELAYED', ['by' => $staff, 'shipment_id' => (int) $parcel['id']], "delayed-parcel:{$parcel['id']}");
                    if (($in['notify_customer'] ?? false) === true) {
                        $result['messages'][] = ['DELIVERY_UPDATE', "delay-{$parcel['id']}"];
                    }
                }
                break;

            case 'MARK_SHIPMENT_DELIVERED':
                if (!$physical || !in_array($fulfil, ['DISPATCHED', 'DELIVERED'], true)) {
                    $refuse('A parcel can be marked delivered only on a dispatched order.');
                }
                $parcel = shipment_for_order($pdo, $orderId, $in['shipment_id'] ?? null);
                if (!in_array($parcel['state'], ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'], true)) {
                    $refuse('Only a dispatched parcel can be marked delivered.');
                }
                $date = operations_past_date($in['delivered_on'] ?? null);
                if ($date === null || ($parcel['dispatched_on'] !== null && $date < $parcel['dispatched_on'])) {
                    throw new OperationsException('invalid_delivery_date', 'Add the delivery date: on or after dispatch, and not in the future.', 422);
                }
                $pdo->prepare("UPDATE shipments SET state = 'DELIVERED', delivered_on = :d WHERE id = :id")->execute([':d' => $date, ':id' => (int) $parcel['id']]);
                record_order_event($pdo, $orderId, 'SHIPMENT.PARCEL_DELIVERED', ['shipment_id' => (int) $parcel['id'], 'sequence' => (int) $parcel['sequence'], 'by' => $staff], "parcel-delivered:{$parcel['id']}");
                $completed = complete_if_all_delivered($pdo, $row, $staff, $date);
                $result['delivery'] = order_delivery_position($pdo, $orderId);
                if (!$completed) {
                    $result['outcome'] = 'partial';
                    $result['warning'] = 'Parcel recorded. The order is not delivered until every required parcel has arrived and no blocking exception is open.';
                } elseif (($in['send_email'] ?? false) === true) {
                    $result['messages'][] = ['DELIVERED', "delivered-{$reopen}"];
                }
                break;

            case 'MARK_SHIPMENT_LOST':
                if (!$physical) {
                    $refuse('Only a physical order has parcels.');
                }
                $parcel = shipment_for_order($pdo, $orderId, $in['shipment_id'] ?? null);
                if (!in_array($parcel['state'], ['DISPATCHED', 'IN_TRANSIT', 'DELAYED'], true)) {
                    $refuse('Only a parcel on its way can be recorded as lost.');
                }
                $pdo->prepare("UPDATE shipments SET state = 'LOST' WHERE id = :id")->execute([':id' => (int) $parcel['id']]);
                raise_fulfilment_exception($pdo, $orderId, 'PARCEL_LOST', ['shipment_id' => (int) $parcel['id'], 'blocking' => true,
                    'next_action' => 'Arrange a replacement with the production partner (a new parcel), or a founder decides otherwise. The customer does not deal with the partner.'], $staff, "parcel-lost:{$parcel['id']}");
                break;

            case 'RAISE_FULFILMENT_EXCEPTION':
                $type = (string) ($in['type'] ?? '');
                $manual = array_values(array_diff(fulfilment_data()['fulfilment_exception_types'], ['COMMERCIAL_DATA_REQUIRED', 'AUTHORISED_CARD_ALTERNATIVE']));
                if (!in_array($type, $manual, true)) {
                    throw new OperationsException('invalid_exception_type', 'Choose the exception type.', 422);
                }
                $shipmentId = null;
                if (($in['shipment_id'] ?? null) !== null) {
                    $shipmentId = (int) shipment_for_order($pdo, $orderId, $in['shipment_id'])['id'];
                }
                $detail = operations_text($in['detail'] ?? null, 1000);
                if (looks_like_card_number($detail)) {
                    throw new OperationsException('payment_credentials_refused', 'Never record card or payment details here.', 422);
                }
                $result['exception_id'] = raise_fulfilment_exception($pdo, $orderId, $type, [
                    'shipment_id' => $shipmentId, 'blocking' => ($in['blocking'] ?? true) !== false, 'detail' => $detail,
                    'next_action' => operations_line($in['next_action'] ?? null, 255),
                    'service_request_id' => is_int($in['service_request_id'] ?? null) ? $in['service_request_id'] : null,
                ], $staff);
                if (($in['notify_customer'] ?? false) === true && in_array($type, fulfilment_data()['delivery_exception_types'], true)) {
                    $result['messages'][] = ['DELIVERY_UPDATE', "exception-{$result['exception_id']}"];
                }
                break;

            case 'RESOLVE_FULFILMENT_EXCEPTION':
                $stmt = $pdo->prepare('SELECT * FROM fulfilment_exceptions WHERE id = :id AND order_id = :o FOR UPDATE');
                $stmt->execute([':id' => is_int($in['exception_id'] ?? null) ? $in['exception_id'] : 0, ':o' => $orderId]);
                $exception = $stmt->fetch();
                if ($exception === false) {
                    throw new OperationsException('exception_not_found', 'No such exception on this order.', 404);
                }
                if ($exception['status'] !== 'OPEN') {
                    $result['outcome'] = 'unchanged';
                    break;
                }
                $resolution = (string) ($in['resolution'] ?? '');
                if (!in_array($resolution, fulfilment_data()['exception_resolutions'], true)) {
                    throw new OperationsException('invalid_resolution', 'Choose how the exception was resolved.', 422);
                }
                if ($resolution === 'SUBSTITUTION_APPROVED' && $exception['type'] !== 'SUBSTITUTION_APPROVAL_REQUIRED') {
                    throw new OperationsException('invalid_resolution', 'A substitution can only be approved on a substitution exception.', 422);
                }
                if ($resolution === 'PARTIAL_DELIVERY_ACCEPTED' && !in_array($exception['type'], ['PARTIAL_DELIVERY', 'PARCEL_LOST', 'SUPPLIER_CANCELLED', 'PAID_ORDER_FULFILMENT_EXCEPTION'], true)) {
                    throw new OperationsException('invalid_resolution', 'Partial delivery can only be accepted on a partial delivery, lost parcel, supplier cancellation or paid-order exception.', 422);
                }
                $note = operations_text($in['note'] ?? null, 1000);
                if ($note === null) {
                    throw new OperationsException('invalid_note', 'Note what was decided and done.', 422);
                }
                // A lost parcel stops being awaited only once its replacement parcel exists (or a founder accepts partial delivery).
                $replacesLost = $resolution === 'REPLACEMENT_ARRANGED' && $exception['type'] === 'PARCEL_LOST' && $exception['shipment_id'] !== null;
                if ($replacesLost) {
                    $replacement = $pdo->prepare('SELECT COUNT(*) FROM shipments s JOIN shipments l ON l.id = :lost WHERE s.order_id = :o AND s.sequence > l.sequence AND s.required = 1');
                    $replacement->execute([':lost' => (int) $exception['shipment_id'], ':o' => $orderId]);
                    if ((int) $replacement->fetchColumn() === 0) {
                        throw new OperationsException('replacement_parcel_required', 'Add the replacement parcel (ADD_SHIPMENT) before resolving the lost parcel as replaced.', 422);
                    }
                    $pdo->prepare('UPDATE shipments SET required = 0 WHERE id = :id')->execute([':id' => (int) $exception['shipment_id']]);
                }
                $pdo->prepare("UPDATE fulfilment_exceptions SET status = 'RESOLVED', resolution = :r, resolution_note = :n, resolution_authorised_by = :f, resolved_by = :by, resolved_at = UTC_TIMESTAMP() WHERE id = :id")
                    ->execute([':r' => $resolution, ':n' => $note, ':f' => $founder, ':by' => $staff, ':id' => (int) $exception['id']]);
                if ($resolution === 'PARTIAL_DELIVERY_ACCEPTED') {
                    // The founder's decision releases the parcels still outstanding from what completion waits for.
                    $pdo->prepare("UPDATE shipments SET required = 0 WHERE order_id = :o AND state <> 'DELIVERED'")->execute([':o' => $orderId]);
                }
                record_order_event($pdo, $orderId, 'FULFILMENT.EXCEPTION_RESOLVED', ['exception_id' => (int) $exception['id'], 'type' => $exception['type'], 'resolution' => $resolution, 'by' => $staff, 'founder' => $founder], "fulfilment-exception-resolved:{$exception['id']}");
                if ($fulfil === 'DISPATCHED') {
                    $delivered = $pdo->prepare("SELECT MAX(delivered_on) FROM shipments WHERE order_id = :o AND state = 'DELIVERED'");
                    $delivered->execute([':o' => $orderId]);
                    $on = $delivered->fetchColumn();
                    if (is_string($on) && complete_if_all_delivered($pdo, $row, $staff, $on)) {
                        $result['warning'] = 'Every required parcel has arrived: the order is now delivered and complete.';
                    }
                }
                break;

            case 'RECORD_REVIEW_REQUEST':
                if ($stage !== 'COMPLETED') {
                    $refuse('A review is only requested for a completed order.');
                }
                $channel = $in['channel'] ?? null;
                if (!in_array($channel, ['EMAIL', 'WHATSAPP', 'PHONE', 'IN_PERSON', 'OTHER'], true)) {
                    throw new OperationsException('invalid_channel', 'Say how the review was requested.', 422);
                }
                // A review request never offers an incentive for a positive review, and nothing is published automatically.
                if (($in['incentive_offered'] ?? false) !== false) {
                    throw new OperationsException('incentive_refused', 'A review is never requested in exchange for an incentive.', 422);
                }
                require_once __DIR__ . '/lifecycle.php';
                if (($hold = review_request_recovery_hold($pdo, $orderId)) !== null) {
                    throw new OperationsException('recovery_cooling', $hold, 409);
                }
                record_order_event($pdo, $orderId, 'REVIEW.REQUESTED', ['by' => $staff, 'channel' => $channel], 'review-requested');
                break;

            case 'RECORD_CONTENT_PERMISSION':
                $scope = (string) ($in['scope'] ?? '');
                $status = (string) ($in['status'] ?? '');
                if (!in_array($scope, fulfilment_data()['content_permission_scopes'], true) || !in_array($status, ['GRANTED', 'WITHDRAWN'], true)) {
                    throw new OperationsException('invalid_permission', 'Choose what the permission covers and whether it is granted or withdrawn.', 422);
                }
                if ($status === 'WITHDRAWN') {
                    $stmt = $pdo->prepare("UPDATE customer_content_permissions SET status = 'WITHDRAWN', withdrawn_at = UTC_TIMESTAMP(), recorded_by = :by WHERE order_id = :o AND scope = :sc AND status = 'GRANTED'");
                    $stmt->execute([':by' => $staff, ':o' => $orderId, ':sc' => $scope]);
                    if ($stmt->rowCount() === 0) {
                        $result['outcome'] = 'unchanged';
                        break;
                    }
                } else {
                    $via = $in['granted_via'] ?? null;
                    $evidence = operations_line($in['evidence_reference'] ?? null, 300);
                    if (!in_array($via, ['WRITTEN_CONSENT', 'EMAIL', 'OTHER'], true) || $evidence === null) {
                        throw new OperationsException('permission_evidence_required', 'Record how the customer gave permission (written consent, email or other) and where that is kept. A review is not permission.', 422);
                    }
                    $pdo->prepare(
                        "INSERT INTO customer_content_permissions (order_id, scope, status, granted_via, evidence_reference, recorded_by, granted_at, withdrawn_at)
                         VALUES (:o, :sc, 'GRANTED', :via, :ev, :by, UTC_TIMESTAMP(), NULL)
                         ON DUPLICATE KEY UPDATE status = 'GRANTED', granted_via = VALUES(granted_via), evidence_reference = VALUES(evidence_reference),
                            recorded_by = VALUES(recorded_by), granted_at = UTC_TIMESTAMP(), withdrawn_at = NULL"
                    )->execute([':o' => $orderId, ':sc' => $scope, ':via' => $via, ':ev' => $evidence, ':by' => $staff]);
                }
                record_order_event($pdo, $orderId, 'CONTENT_PERMISSION.' . $status, ['scope' => $scope, 'by' => $staff]);
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
                if ($stage === 'COMPLETED') {
                    $result['outcome'] = 'unchanged';
                    break;
                }
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
                     supplier_purchase_authorised_by = NULL, supplier_purchase_authorised_at = NULL, fulfilment_state = NULL, fulfilment_pending_reason = NULL,
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
                // The older staff-console action, kept for compatibility. Support cases live in
                // lib/customer-care.php: IN_REVIEW is REVIEWING, DECLINED closes the case.
                require_once __DIR__ . '/customer-care.php';
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
                $case = care_case_row($pdo, $requestId, true);
                if ($case === null || (int) $case['order_id'] !== $orderId) {
                    throw new OperationsException('request_not_found', 'No such request on this order.', 404);
                }
                $target = ['IN_REVIEW' => 'REVIEWING', 'RESOLVED' => 'RESOLVED', 'DECLINED' => 'CLOSED'][$status];
                if ($case['status'] === $target && $case['resolution'] === $resolution) {
                    $result['outcome'] = 'unchanged';
                } else {
                    $pdo->prepare('UPDATE order_service_requests SET resolution = :r, recovery_outcome = COALESCE(recovery_outcome, :o) WHERE id = :id')
                        ->execute([':r' => $resolution, ':o' => $status === 'RESOLVED' ? match ($resolution) { 'REPLACEMENT_ARRANGED' => 'REPLACED', 'RESENT_OR_REPAIRED' => 'CORRECTED', 'ANSWERED', 'NO_ACTION_NEEDED' => 'RESOLVED', default => 'OTHER' } : null, ':id' => $requestId]);
                    care_set_status($pdo, care_case_row($pdo, $requestId), $target, $staff);
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
