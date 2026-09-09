<?php
/**
 * GET /api/crm/customer — who this person is, and what they have bought.
 *
 * ?email=...            look someone up by the address they ordered with
 * ?customer=123         or by internal id
 * ?returning=1          list customers with more than one paid order
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS ANSWERS
 * ─────────────────────────────────────────────────────────────────────────
 * "Have we made something for this person before?" — which MCB currently has
 * no way to ask without reading the orders table by hand, and which matters
 * because someone commissioning their third memory should not be spoken to as
 * though they arrived this morning.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO N+1
 * ─────────────────────────────────────────────────────────────────────────
 * Totals, order counts and referral conversions are aggregated in SQL, not by
 * fetching every order and summing in PHP. A customer view that got slower the
 * more someone had bought would be worst exactly for MCB's best customers.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS AUTHENTICATED, AND NOT PUBLIC
 * ─────────────────────────────────────────────────────────────────────────
 * This is the only surface that maps a referral code to a person, and it is
 * behind the CRM key. `/api/referral/check` — the public one — answers only
 * whether a code is usable and never says whose it is.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$where  = [];
$params = [];

$email = trim((string) ($_GET['email'] ?? ''));
if ($email !== '') {
    // Lower-cased to match how `order.php` stores it. Without this, an
    // operator searching "Ada@Example.com" for a customer stored as
    // "ada@example.com" is told there is no such person.
    $where[] = 'c.email = :email';
    $params[':email'] = mb_strtolower($email);
}

$customerId = (int) ($_GET['customer'] ?? 0);
if ($customerId > 0) {
    $where[] = 'c.id = :cid';
    $params[':cid'] = $customerId;
}

$returningOnly = ($_GET['returning'] ?? '') === '1';
$limit = min(max((int) ($_GET['limit'] ?? 50), 1), 200);

/**
 * PAID ORDERS ONLY, in the aggregates.
 *
 * The JOIN is filtered rather than the WHERE clause, so a customer with no
 * paid orders still appears — with zeroes — rather than vanishing from a
 * lookup by email. "This person exists and has bought nothing" is a real and
 * useful answer; "no such person" would be wrong.
 *
 * PENDING and ABANDONED orders are excluded from every figure. A checkout
 * somebody started and did not finish is not value, and counting it would
 * make the totals a measure of intent rather than of money.
 */
$sql = 'SELECT
            c.id, c.name, c.email, c.created_at,
            c.first_source_type,
            COUNT(DISTINCT paid.id)                       AS paid_orders,
            COALESCE(SUM(paid.amount_gbp), 0)             AS paid_gbp,
            MAX(paid.created_at)                          AS last_paid_at,
            MIN(paid.created_at)                          AS first_paid_at,
            cr.code                                       AS referral_code,
            cr.revoked_at                                 AS referral_revoked_at
        FROM customers c
        LEFT JOIN orders paid
               ON paid.customer_id = c.id AND paid.status = \'PAID\'
        LEFT JOIN customer_referrals cr
               ON cr.customer_id = c.id'
     . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
     . ' GROUP BY c.id'
     . ($returningOnly ? ' HAVING paid_orders > 1' : '')
     . ' ORDER BY c.id ASC LIMIT ' . $limit;   // integer, already clamped

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

/**
 * Referral conversions for this page of customers, in ONE query.
 *
 * Counted by status rather than as a single number, because "three people
 * clicked their link and ordered" and "three orders were confirmed paid" are
 * different facts and only the second is a conversion.
 */
$conversions = [];
if ($rows !== []) {
    $ids = array_map(static fn (array $r): int => (int) $r['id'], $rows);
    $in  = implode(',', array_fill(0, count($ids), '?'));

    $convStmt = db()->prepare(
        "SELECT cr.customer_id, conv.status, COUNT(*) AS n
           FROM customer_referrals cr
           JOIN customer_referral_conversions conv ON conv.referral_id = cr.id
          WHERE cr.customer_id IN ($in)
          GROUP BY cr.customer_id, conv.status"
    );
    try {
        $convStmt->execute($ids);
        foreach ($convStmt->fetchAll() as $row) {
            $conversions[(int) $row['customer_id']][(string) $row['status']] =
                (int) $row['n'];
        }
    } catch (PDOException $e) {
        // A database that has not run the migration must still be able to
        // answer "who is this customer?" — referrals simply come back empty.
        error_log('MCB CRM: referral conversions unavailable: ' . $e->getMessage());
    }
}

/**
 * Whether each customer has been asked for a review, in ONE query.
 */
$reviewed = [];
if ($rows !== []) {
    $ids = array_map(static fn (array $r): int => (int) $r['id'], $rows);
    $in  = implode(',', array_fill(0, count($ids), '?'));
    try {
        $revStmt = db()->prepare(
            "SELECT customer_id, order_id, status, sent_at
               FROM customer_communications
              WHERE message_type = 'REVIEW_REQUEST' AND customer_id IN ($in)"
        );
        $revStmt->execute($ids);
        foreach ($revStmt->fetchAll() as $row) {
            $reviewed[(int) $row['customer_id']][] = [
                'order_id' => (int) $row['order_id'],
                'status'   => $row['status'],
                'sent_at'  => $row['sent_at'],
            ];
        }
    } catch (PDOException $e) {
        error_log('MCB CRM: communications unavailable: ' . $e->getMessage());
    }
}

$customers = array_map(static function (array $r) use ($conversions, $reviewed): array {
    $id     = (int) $r['id'];
    $byStat = $conversions[$id] ?? [];
    $paid   = (int) $r['paid_orders'];

    return [
        'customer_id' => $id,
        'name'        => $r['name'],
        'email'       => $r['email'],
        'since'       => $r['created_at'],
        'first_source_type' => $r['first_source_type'],

        'orders' => [
            'paid_count'    => $paid,
            // NAMED FOR WHAT IT IS. This is the sum of PAID order amounts in
            // GBP — not net revenue, because MCB does not model refunds yet
            // and calling it revenue would overstate it the first time one
            // happens. When refunds are modelled, a net figure can sit
            // alongside this one rather than quietly replacing it.
            'gross_paid_gbp' => round((float) $r['paid_gbp'], 2),
            'first_paid_at'  => $r['first_paid_at'],
            'last_paid_at'   => $r['last_paid_at'],
            // The question an operator actually asks before replying to
            // someone: have we made something for them before?
            'is_returning'   => $paid > 1,
        ],

        'referral' => [
            'code'    => $r['referral_code'],
            'active'  => $r['referral_code'] !== null && $r['referral_revoked_at'] === null,
            // Split by status: an attributed order is not yet a conversion,
            // and a self-referral is not one at all.
            'attributed'    => $byStat['ATTRIBUTED'] ?? 0,
            'confirmed'     => $byStat['CONFIRMED'] ?? 0,
            'self_referral' => $byStat['SELF_REFERRAL'] ?? 0,
            'reversed'      => $byStat['REVERSED'] ?? 0,
        ],

        'review_requests' => $reviewed[$id] ?? [],
    ];
}, $rows);

json_response(200, ['customers' => $customers]);
