<?php
/**
 * POST /api/order-approval — the customer listens, then approves or asks for
 * changes.
 *
 * REQUEST  { token, action: "view" | "approve" | "request_changes", feedback? }
 *
 * The token is the private link MCB emailed (or sent by WhatsApp) for ONE
 * approval round. It arrives in the page's URL fragment and is posted here in
 * the body, so it never reaches an access log or a Referer header.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RULES
 * ─────────────────────────────────────────────────────────────────────────
 *  • Unknown, malformed, expired and revoked links get the same answer.
 *  • A link answers only its own round. After a change request the next
 *    version gets a new link, and the old one cannot approve it.
 *  • Approving twice is one approval: the second call says so and changes
 *    nothing.
 *  • Nothing can be approved or changed once staff have moved the work past
 *    approval (confirmed with a supplier, dispatched, completed) — only staff
 *    can reopen it.
 *  • The response carries the reference, what was bought, the listening link
 *    and the revision position. No names, contact details, story, notes,
 *    database ids or supplier information.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/lifecycle-messages.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('approval', 30, 600);

$body   = read_json_body(8192);
$action = is_string($body['action'] ?? null) ? $body['action'] : 'view';
if (!in_array($action, ['view', 'approve', 'request_changes'], true)) {
    json_error(422, 'invalid_action', 'That request could not be understood.');
}

const MCB_LINK_INVALID = 'This link is no longer active. If you need a new one, reply to our email or contact us and we will send it.';

$pdo   = db();
$token = find_access_token($pdo, $body['token'] ?? null, 'APPROVAL');
if ($token === null) {
    json_error(404, 'link_invalid', MCB_LINK_INVALID);
}
$orderId = (int) $token['order_id'];
$round   = (int) $token['approval_round'];

/** What the page shows, for the current state of this round. */
function approval_view(PDO $pdo, int $orderId, int $round): array
{
    $row = operations_order_row($pdo, $orderId);
    $stage = (string) ($row['stage'] ?? '');
    $current = (int) ($row['approval_round'] ?? 0) === $round;

    $position = match (true) {
        $current && $stage === 'AWAITING_APPROVAL'  => 'AWAITING_RESPONSE',
        $current && $stage === 'REVISION_REQUESTED' => 'CHANGES_REQUESTED',
        $current && $row['approved_at'] !== null && in_array($stage, ['APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true) => 'APPROVED',
        default => 'CLOSED',
    };

    $items = $pdo->prepare("SELECT item_name, quantity FROM order_items WHERE order_id = :id AND category <> 'PROTECTION' ORDER BY id");
    $items->execute([':id' => $orderId]);

    return [
        'reference'   => $row['mcb_reference'],
        'workflow'    => order_workflow($row),
        'items'       => array_map(static fn (array $i): array => ['name' => $i['item_name'], 'quantity' => (int) $i['quantity']], $items->fetchAll()),
        'position'    => $position,
        // Only while this round is the one waiting, so an old link never
        // plays an old version as though it were current.
        'preview_url' => $position === 'AWAITING_RESPONSE' ? $row['approval_preview_url'] : null,
        'approved_on' => $position === 'APPROVED' ? substr((string) $row['approved_at'], 0, 10) : null,
        'revisions'   => [
            'included' => included_revision_allowance($pdo, $orderId),
            'used'     => (int) ($row['revisions_used'] ?? 0),
        ],
    ];
}

if ($action === 'view') {
    json_response(200, approval_view($pdo, $orderId, $round));
}

$feedback = null;
if ($action === 'request_changes') {
    $feedback = operations_text($body['feedback'] ?? null, 2000);
    if ($feedback === null || mb_strlen($feedback) < 3) {
        json_error(422, 'validation_failed', 'Please tell us what you would like changed.', [
            'fields' => ['feedback' => 'Please tell us what you would like changed.'],
        ]);
    }
}

try {
    [$outcome, $messages] = db_transaction(function (PDO $pdo) use ($orderId, $round, $action, $feedback): array {
        $row   = operations_order_row($pdo, $orderId, true);
        $stage = (string) ($row['stage'] ?? '');
        $current = (int) $row['approval_round'] === $round;

        if ($action === 'approve') {
            if ($current && $stage === 'AWAITING_APPROVAL') {
                return ['approved', approve_work($pdo, $row, 'WEBSITE', 'Customer (approval link)', 'Approval link, round ' . $round)];
            }
            if ($current && $row['approved_at'] !== null
                && in_array($stage, ['APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true)) {
                return ['already_approved', []];
            }
            return ['closed', []];
        }

        if ($current && $stage === 'AWAITING_APPROVAL') {
            $messages = record_changes($pdo, $row, 'WEBSITE', $feedback, null);
            return $messages === null ? ['already_received', []] : ['changes_received', $messages];
        }
        if ($current && $stage === 'REVISION_REQUESTED') {
            return ['already_received', []];
        }
        return ['closed', []];
    });
} catch (Throwable $e) {
    error_log('MCB approval: order ' . $orderId . ' failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not save that just now. Please try again in a moment.');
}

if ($outcome === 'closed') {
    json_error(409, 'approval_closed', 'This version can no longer be approved or changed here. If you need anything, reply to our email and we will help.');
}

send_lifecycle_messages($pdo, $orderId, $messages);

json_response(200, ['outcome' => $outcome] + approval_view($pdo, $orderId, $round));
