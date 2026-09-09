<?php
/**
 * /api/crm/production — the creative lifecycle, for operators.
 *
 * GET   ?order=123          the production record for one order
 * GET   ?stage=CREATIVE     a page of orders at a stage
 * POST  { order_id, stage, ... }  advance an order
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS RATHER THAN AN APPROVAL SCREEN ON THE WEBSITE
 * ─────────────────────────────────────────────────────────────────────────
 * MCB approves work with customers over email and WhatsApp. Building a
 * customer-facing approval page nobody uses would be worse than useless: the
 * approvals would still happen in a WhatsApp thread, and the database would
 * hold an empty table implying they had not.
 *
 * So the site records the approval that genuinely happened, with the channel
 * it happened on. `WEBSITE` is in the channel list so that when an approval
 * screen is eventually built, the record shape does not change and today's
 * rows stay meaningful.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS MUST NEVER BE CONFUSED WITH
 * ─────────────────────────────────────────────────────────────────────────
 * Checkout consent. At checkout the customer accepted the terms of a purchase
 * for something that did not exist yet; nothing here can be written by a
 * checkout event, and `order.php` opens every record at CREATIVE.
 *
 * And payment. `orders.status` says whether MCB has been paid. This says
 * whether the work can still be changed. **PAID IS NOT PRODUCTION_LOCKED.**
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/legal.php';

require_crm_key();

/* ------------------------------------------------------------------ */
/* Shared shape                                                        */
/* ------------------------------------------------------------------ */

/**
 * One production record as the CRM reads it.
 *
 * `revisions_open` is DERIVED from the stage rather than stored, so the
 * answer to the only question this table exists to answer cannot drift from
 * the stage table it is defined by.
 */
function production_row(array $r): array
{
    $stage = (string) $r['stage'];

    return [
        'order_id'       => (int) $r['order_id'],
        'stage'          => $stage,
        // The whole point of the table, in one boolean.
        'revisions_open' => revisions_remain_open($stage),
        'revisions_used' => (int) $r['revisions_used'],
        'approval'       => [
            'approved_at' => $r['approved_at'],
            'channel'     => $r['approval_channel'],
            'reference'   => $r['approval_reference'],
            'item'        => $r['approved_item'],
            'recorded_by' => $r['approved_by'],
        ],
        'production_locked_at' => $r['production_locked_at'],
        'production_note'      => $r['production_note'],
        'terms_version'        => $r['terms_version'],
        // Payment state, returned ALONGSIDE and never as a substitute. An
        // operator can see both and the difference between them at a glance.
        'payment_status'       => $r['payment_status'] ?? null,
        'updated_at'           => $r['updated_at'],
    ];
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $where  = [];
    $params = [];

    $orderId = (int) ($_GET['order'] ?? 0);
    if ($orderId > 0) {
        $where[] = 'p.order_id = :oid';
        $params[':oid'] = $orderId;
    }

    // Whitelisted against the generated stage list, never interpolated.
    $stage = strtoupper(trim((string) ($_GET['stage'] ?? '')));
    $validStages = array_column(legal_data()['production']['stages'] ?? [], 'stage');
    if ($stage !== '' && in_array($stage, $validStages, true)) {
        $where[] = 'p.stage = :stage';
        $params[':stage'] = $stage;
    }

    $limit = min(max((int) ($_GET['limit'] ?? 50), 1), 200);

    $sql = 'SELECT p.*, o.status AS payment_status
              FROM order_production p
              JOIN orders o ON o.id = p.order_id'
         . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
         . ' ORDER BY p.order_id ASC LIMIT ' . $limit;   // integer, clamped

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    json_response(200, [
        'production' => array_map('production_row', $stmt->fetchAll()),
    ]);
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

require_method('POST');

$body = read_json_body();

$orderId = (int) ($body['order_id'] ?? 0);
if ($orderId <= 0) {
    json_error(422, 'invalid_order', 'An order id is required.');
}

$stage = strtoupper(trim((string) ($body['stage'] ?? '')));
$validStages = array_column(legal_data()['production']['stages'] ?? [], 'stage');
if (!in_array($stage, $validStages, true)) {
    json_error(422, 'invalid_stage', 'That is not a production stage.');
}

$channel   = strtoupper(trim((string) ($body['approval_channel'] ?? '')));
$reference = trim((string) ($body['approval_reference'] ?? ''));
$item      = trim((string) ($body['approved_item'] ?? ''));
$recordedBy = trim((string) ($body['approved_by'] ?? ''));
$note      = trim((string) ($body['production_note'] ?? ''));

/**
 * AN APPROVAL MUST SAY HOW IT WAS GIVEN.
 *
 * A stage of APPROVED with no channel asserts that a customer approved
 * something, while being unable to say where that happened. That is worse
 * than an unapproved record, because it reads as evidence. The database
 * enforces the same rule with a CHECK constraint.
 */
$needsApproval = !in_array($stage, ['CREATIVE', 'AWAITING_APPROVAL'], true);

if ($needsApproval && !in_array($channel, approval_channels(), true)) {
    json_error(
        422,
        'approval_channel_required',
        'Record how the customer approved this — email, message, call or in person.'
    );
}

try {
    $result = db_transaction(function (PDO $pdo) use (
        $orderId, $stage, $channel, $reference, $item, $recordedBy, $note, $needsApproval
    ): array {
        // The order must exist. A production record for an order that does
        // not is not a lifecycle, it is a typo.
        $stmt = $pdo->prepare('SELECT id FROM orders WHERE id = :oid LIMIT 1');
        $stmt->execute([':oid' => $orderId]);
        if ($stmt->fetchColumn() === false) {
            return ['ok' => false, 'code' => 'unknown_order'];
        }

        /**
         * Timestamps are set ONCE and never overwritten.
         *
         * `approved_at` is when the customer approved, not when somebody last
         * touched the row. COALESCE keeps the original: re-recording a
         * channel or adding a note must not silently move the date an
         * approval is evidenced by.
         */
        $stmt = $pdo->prepare(
            'INSERT INTO order_production (
                order_id, stage, approved_at, approval_channel, approval_reference,
                approved_item, approved_by, production_locked_at, production_note
             ) VALUES (
                :oid, :stage,
                CASE WHEN :needs1 = 1 THEN UTC_TIMESTAMP() ELSE NULL END,
                :chan, :ref, :item, :by,
                CASE WHEN :stage2 = \'PRODUCTION_LOCKED\' THEN UTC_TIMESTAMP() ELSE NULL END,
                :note
             )
             ON DUPLICATE KEY UPDATE
                stage = VALUES(stage),
                approved_at = CASE
                    WHEN :needs2 = 1 THEN COALESCE(approved_at, UTC_TIMESTAMP())
                    ELSE approved_at END,
                approval_channel   = COALESCE(VALUES(approval_channel), approval_channel),
                approval_reference = COALESCE(VALUES(approval_reference), approval_reference),
                approved_item      = COALESCE(VALUES(approved_item), approved_item),
                approved_by        = COALESCE(VALUES(approved_by), approved_by),
                production_locked_at = CASE
                    WHEN :stage3 = \'PRODUCTION_LOCKED\'
                    THEN COALESCE(production_locked_at, UTC_TIMESTAMP())
                    ELSE production_locked_at END,
                production_note = COALESCE(VALUES(production_note), production_note)'
        );

        $stmt->execute([
            ':oid'    => $orderId,
            ':stage'  => $stage,
            ':stage2' => $stage,
            ':stage3' => $stage,
            ':needs1' => $needsApproval ? 1 : 0,
            ':needs2' => $needsApproval ? 1 : 0,
            ':chan'   => $channel === '' ? null : $channel,
            ':ref'    => $reference === '' ? null : mb_substr($reference, 0, 255),
            ':item'   => $item === '' ? null : mb_substr($item, 0, 160),
            ':by'     => $recordedBy === '' ? null : mb_substr($recordedBy, 0, 160),
            ':note'   => $note === '' ? null : mb_substr($note, 0, 255),
        ]);

        $read = $pdo->prepare(
            'SELECT p.*, o.status AS payment_status
               FROM order_production p
               JOIN orders o ON o.id = p.order_id
              WHERE p.order_id = :oid LIMIT 1'
        );
        $read->execute([':oid' => $orderId]);

        return ['ok' => true, 'row' => $read->fetch()];
    });
} catch (Throwable $e) {
    error_log('MCB production update failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be recorded.');
}

if (!$result['ok']) {
    json_error(404, 'unknown_order', 'No such order.');
}

json_response(200, ['production' => production_row($result['row'])]);
