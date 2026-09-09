<?php
/**
 * MCB — customer referral. A customer sharing MCB, which is not an affiliate.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BOUNDARY THIS FILE EXISTS TO HOLD
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/attribution.php` resolves AFFILIATE and PARTNER attribution: a
 * commercial arrangement that increments `affiliates.sales` and will one day
 * pay somebody. This file resolves a customer's personal share, which pays
 * nobody and enrols nobody in anything.
 *
 * Nothing here writes to `affiliates`, `clicks`, or `orders.source_type`. An
 * order introduced by an affiliate keeps its affiliate credit untouched even
 * when a customer share also touched the journey — the share is recorded as
 * influence in `customer_referral_conversions` and the commission is paid
 * once, to the party who is owed it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BROWSER NEVER NAMES A REFERRER
 * ─────────────────────────────────────────────────────────────────────────
 * A request carries a public code and nothing else. The referring customer's
 * id is resolved here, from the database. There is no field through which a
 * caller can assert who referred them, so a crafted request cannot attribute
 * a sale to an arbitrary customer.
 */

declare(strict_types=1);

/**
 * The public code alphabet: Crockford's, minus I, L, O and U.
 *
 * Those four are the characters people misread when a code is spoken aloud or
 * written on paper — which is exactly how a personal recommendation travels.
 */
const MCB_REFERRAL_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** `MCB-R-XXXXXX`. Must match REFERRAL_CODE_PATTERN in src/data/referral.ts. */
const MCB_REFERRAL_PATTERN = '/^MCB-R-[0-9A-HJKMNP-TV-Z]{6}$/';

/**
 * Whether a string is even shaped like a referral code.
 *
 * Checked before any query. An unvalidated code reaching the database would
 * turn the lookup into an enumeration surface and a place to try injection;
 * refusing on shape means only well-formed codes are ever looked up.
 */
function referral_code_is_wellformed(string $code): bool
{
    return preg_match(MCB_REFERRAL_PATTERN, $code) === 1;
}

/**
 * Draws a new code.
 *
 * `random_int` rather than `rand`: this is a public identifier, and a
 * predictable one would let anyone generate codes that belong to other
 * customers. 32^6 is about a billion, so collisions are theoretical — the
 * caller retries against the UNIQUE key anyway, because the alternative to
 * retrying is a customer whose payment succeeded and whose code did not.
 */
function generate_referral_code(): string
{
    $tail = '';
    for ($i = 0; $i < 6; $i++) {
        $tail .= MCB_REFERRAL_ALPHABET[random_int(0, strlen(MCB_REFERRAL_ALPHABET) - 1)];
    }
    return 'MCB-R-' . $tail;
}

/**
 * Ensures this customer has an active referral code, and returns it.
 *
 * CALLED ONLY FROM THE PAID PATH. Eligibility is one verified payment, so
 * this is invoked by the Stripe webhook and never by `order.php` — an order
 * that has merely been created may never be paid, and a visitor who abandoned
 * a checkout is not a customer with something to recommend.
 *
 * Idempotent: a second call returns the existing code rather than minting a
 * second one, which is what makes it safe on a webhook replay.
 *
 * @return string|null the code, or null if it could not be allocated
 */
function ensure_customer_referral(PDO $pdo, int $customerId, ?int $paidOrderId): ?string
{
    $stmt = $pdo->prepare(
        'SELECT code FROM customer_referrals WHERE customer_id = :cid LIMIT 1'
    );
    $stmt->execute([':cid' => $customerId]);
    $existing = $stmt->fetchColumn();
    if ($existing !== false) {
        return (string) $existing;
    }

    // Retried against the UNIQUE key. Effectively never runs twice, but a
    // customer who paid must not be denied a code by a coin flip.
    for ($attempt = 0; $attempt < 5; $attempt++) {
        $code = generate_referral_code();
        try {
            $pdo->prepare(
                'INSERT INTO customer_referrals (customer_id, code, first_paid_order_id)
                 VALUES (:cid, :code, :oid)'
            )->execute([
                ':cid'  => $customerId,
                ':code' => $code,
                ':oid'  => $paidOrderId,
            ]);
            return $code;
        } catch (PDOException $e) {
            if (!is_duplicate_error($e)) {
                throw $e;
            }
            // Either the code collided, or a concurrent webhook delivery just
            // created this customer's row. Re-read: if it was the customer
            // key that collided, their code now exists and is the right one.
            $stmt->execute([':cid' => $customerId]);
            $now = $stmt->fetchColumn();
            if ($now !== false) {
                return (string) $now;
            }
        }
    }

    error_log("MCB referral: could not allocate a code for customer {$customerId}.");
    return null;
}

/**
 * Resolves a public code to the referral record behind it.
 *
 * Returns null for anything malformed, unknown or revoked — all three
 * identically, and deliberately. A response that distinguished "no such code"
 * from "that code is revoked" would confirm which codes exist, turning the
 * lookup into an oracle for anyone walking the space.
 *
 * @return array{id:int,customer_id:int,code:string}|null
 */
function resolve_referral_code(PDO $pdo, string $code): ?array
{
    if (!referral_code_is_wellformed($code)) {
        return null;
    }

    $stmt = $pdo->prepare(
        'SELECT id, customer_id, code
           FROM customer_referrals
          WHERE code = :code AND revoked_at IS NULL
          LIMIT 1'
    );
    $stmt->execute([':code' => $code]);
    $row = $stmt->fetch();

    return $row === false ? null : [
        'id'          => (int) $row['id'],
        'customer_id' => (int) $row['customer_id'],
        'code'        => (string) $row['code'],
    ];
}

/**
 * Whether this referral belongs to the person placing the order.
 *
 * Identity is the customer row, resolved from the order's email — the same
 * normalisation `order.php` already uses to deduplicate customers. So a
 * customer who uses their own link is recognised whatever browser or device
 * they are on, without any fingerprinting.
 *
 * It is not perfect: a determined person can use a second email address. It is
 * not meant to be. No reward exists to be gamed, and the invariant is
 * established now so that if one is ever approved, the obvious abuse is
 * already closed rather than being retrofitted onto live attribution.
 */
function referral_is_self(int $referrerCustomerId, int $buyerCustomerId): bool
{
    return $referrerCustomerId === $buyerCustomerId;
}

/**
 * Records the acquisition story of an order that arrived through a share.
 *
 * ATTRIBUTED, never CONFIRMED. Confirmation belongs to the Stripe webhook,
 * which is the only thing in this system that knows a payment happened. An
 * order recorded as a successful referral before payment would count every
 * abandoned checkout as a friend's recommendation working.
 *
 * A self-referral is recorded as SELF_REFERRAL rather than dropped: the honest
 * description of what happened, and something to look at if it recurs.
 */
function record_referral_attribution(
    PDO $pdo,
    array $referral,
    int $orderId,
    int $buyerCustomerId
): void {
    $status = referral_is_self((int) $referral['customer_id'], $buyerCustomerId)
        ? 'SELF_REFERRAL'
        : 'ATTRIBUTED';

    try {
        $pdo->prepare(
            'INSERT INTO customer_referral_conversions
                (referral_id, order_id, code_snapshot, status)
             VALUES (:rid, :oid, :code, :status)'
        )->execute([
            ':rid'    => $referral['id'],
            ':oid'    => $orderId,
            ':code'   => $referral['code'],
            ':status' => $status,
        ]);
    } catch (PDOException $e) {
        if (!is_duplicate_error($e)) {
            throw $e;
        }
        // One order, one acquisition story. A duplicate means this order has
        // already been attributed, and the first answer stands.
    }
}

/**
 * Confirms a referral once Stripe has verified the payment.
 *
 * Conditional on the current status being ATTRIBUTED, which is what makes it
 * idempotent under webhook replay: the second delivery matches no rows and
 * changes nothing, so a conversion is counted exactly once. A SELF_REFERRAL is
 * deliberately left alone — a payment does not make it not a self-referral.
 */
function confirm_referral_conversion(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare(
        "UPDATE customer_referral_conversions
            SET status = 'CONFIRMED', confirmed_at = UTC_TIMESTAMP()
          WHERE order_id = :oid AND status = 'ATTRIBUTED'"
    );
    $stmt->execute([':oid' => $orderId]);

    return $stmt->rowCount() === 1;
}
