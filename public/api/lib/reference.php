<?php
/**
 * MCB CRM — the customer-facing reference number.
 *
 * ONE identifier, issued ONCE, only to a paid order: MCB-YYYY-NNNNNN.
 *
 * This is the only number a customer is ever given and the only one MCB
 * asks them to quote. It is deliberately none of the following:
 *
 *   orders.id              internal, sequential, and counts abandoned
 *                          checkouts — it would tell a customer how many
 *                          orders MCB has taken and leak the gap between
 *                          submissions and sales.
 *   customers.id           identifies a person, not a purchase. One customer
 *                          legitimately holds several orders.
 *   Stripe session /       Stripe's technical identifiers. Unreadable over
 *   payment intent / cus_  the phone, and meaningless once a payment is
 *                          refunded and re-taken.
 *
 * WHY AFTER PAYMENT, NOT BEFORE
 * The order row is written at form submission so an abandoned checkout still
 * leaves MCB the customer and the brief. But a customer-facing number handed
 * out before payment would be quoted back by people who never paid, and would
 * burn a slot in the series for every abandoned basket. So the row exists from
 * submission; the reference is issued only when Stripe confirms the money.
 */

declare(strict_types=1);

/**
 * Issues the reference for an order that has just been confirmed paid.
 *
 * IDEMPOTENT AND CALLER-LOCKED. The caller must already hold the order row
 * with SELECT ... FOR UPDATE inside an open transaction, and must pass that
 * row's current mcb_reference as $existing. A non-null $existing is returned
 * untouched, so a replayed webhook, a re-confirmed session or a manual replay
 * can never issue a second number for the same order — and never consumes a
 * number from the series to find that out.
 *
 * @param ?string $existing The order's current mcb_reference, read under lock.
 */
function assign_mcb_reference(PDO $pdo, int $orderId, ?string $existing): string
{
    if ($existing !== null && $existing !== '') {
        return $existing;
    }

    $year = (int) gmdate('Y');

    // Create this year's counter if it is the first sale of the year. INSERT
    // IGNORE rather than a read-then-write, so two simultaneous first-sales
    // cannot both decide the row is missing.
    $pdo->prepare('INSERT IGNORE INTO reference_sequence (year, last_value) VALUES (:y, 0)')
        ->execute([':y' => $year]);

    // FOR UPDATE holds the counter row until this transaction commits, so
    // concurrent payments allocate strictly one after another. The lock is
    // taken AFTER the order row lock in every caller, which is what keeps the
    // ordering consistent and rules out a deadlock cycle between webhooks.
    $stmt = $pdo->prepare('SELECT last_value FROM reference_sequence WHERE year = :y FOR UPDATE');
    $stmt->execute([':y' => $year]);
    $last = $stmt->fetchColumn();

    if ($last === false) {
        // The INSERT IGNORE above guarantees the row exists. Reaching here
        // means something is wrong with the schema, not with this payment.
        throw new RuntimeException('reference_sequence row missing for year ' . $year);
    }

    $next = (int) $last + 1;

    $pdo->prepare('UPDATE reference_sequence SET last_value = :v WHERE year = :y')
        ->execute([':v' => $next, ':y' => $year]);

    // Six digits carries a million sales a year. The format is fixed-width so
    // references sort and read consistently in every export and inbox.
    $reference = sprintf('MCB-%04d-%06d', $year, $next);

    // UNIQUE(mcb_reference) is the backstop: if the counter were ever wound
    // back by a restore, this write fails loudly and rolls the payment
    // transaction back rather than quietly issuing a duplicate to a customer.
    $pdo->prepare('UPDATE orders SET mcb_reference = :r WHERE id = :id')
        ->execute([':r' => $reference, ':id' => $orderId]);

    return $reference;
}
