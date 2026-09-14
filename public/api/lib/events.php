<?php
/**
 * MCB — the order audit trail.
 *
 * One row per thing that happened to an order: created, personalisation
 * complete, a checkout session, a payment, a review, the confirmation email.
 * Operators read it to answer "what happened to this order, and when?".
 *
 * WHAT IT MAY HOLD: identifiers, amounts, modes, counts and machine reasons.
 * WHAT IT MUST NEVER HOLD: a story, a name, an email, an address, a photo
 * name — anything a customer typed. `detail` is built only from scalar values
 * the caller passes, and the callers pass none of those.
 *
 * `dedupe_key` makes once-only events idempotent: a replayed webhook records
 * ORDER.PAID once, however many times it is delivered.
 */

declare(strict_types=1);

/** Records an event. Throws, so a failure inside a transaction rolls it back. */
function record_order_event(PDO $pdo, int $orderId, string $type, array $detail = [], ?string $dedupeKey = null): void
{
    $clean = [];
    foreach ($detail as $key => $value) {
        if (is_int($value) || is_bool($value) || $value === null || (is_string($value) && strlen($value) <= 120)) {
            $clean[(string) $key] = $value;
        }
    }

    $pdo->prepare(
        'INSERT IGNORE INTO order_events (order_id, event_type, detail, dedupe_key)
         VALUES (:oid, :type, :detail, :dedupe)'
    )->execute([
        ':oid'    => $orderId,
        ':type'   => $type,
        ':detail' => $clean === [] ? null : json_encode($clean, JSON_UNESCAPED_SLASHES),
        ':dedupe' => $dedupeKey,
    ]);
}

/** Records an event outside a transaction, where a failure must not escape. */
function record_order_event_safely(PDO $pdo, int $orderId, string $type, array $detail = [], ?string $dedupeKey = null): void
{
    try {
        record_order_event($pdo, $orderId, $type, $detail, $dedupeKey);
    } catch (PDOException $e) {
        error_log("MCB: could not record {$type} for order {$orderId}: " . $e->getMessage());
    }
}
