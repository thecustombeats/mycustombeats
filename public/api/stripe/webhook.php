<?php
/**
 * POST /api/stripe/webhook — payment confirmation and affiliate credit.
 *
 * STATUS: complete but INACTIVE.
 *
 * The signature verification, order lookup, idempotency and sale increment
 * are all implemented. The endpoint refuses every request until
 * `stripe.webhook_secret` is set in configuration, because processing an
 * unverified webhook would let anyone mark orders paid and award affiliate
 * commission by POSTing JSON.
 *
 * TO ACTIVATE
 *   1. Stripe Dashboard → Developers → Webhooks → Add endpoint
 *        URL:    https://www.mycustombeats.com/api/stripe/webhook
 *        Events: checkout.session.completed, checkout.session.async_payment_succeeded
 *   2. Copy the signing secret (whsec_…) into config `stripe.webhook_secret`.
 *   3. Send a test event from the Dashboard and confirm a 200.
 *
 * Signature verification is implemented directly rather than via the Stripe
 * PHP SDK: the scheme is a documented HMAC, and shared hosting without
 * Composer makes vendoring a dependency more fragile than the ten lines it
 * replaces.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/referral.php';

require_method('POST');

$secret = (string) mcb_setting('stripe.webhook_secret', '');
if ($secret === '') {
    // Fail closed. An unconfigured payment webhook must never accept traffic.
    error_log('MCB CRM: Stripe webhook called but no signing secret is configured.');
    json_error(503, 'webhook_not_configured', 'Webhook is not configured.');
}

$payload   = file_get_contents('php://input') ?: '';
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

/**
 * Verifies Stripe's `t=…,v1=…` signature header.
 *
 * The tolerance window blocks replay of a captured request; hash_equals
 * avoids leaking the comparison through timing.
 */
function stripe_signature_valid(string $payload, string $header, string $secret, int $tolerance = 300): bool
{
    $timestamp = null;
    $signatures = [];

    foreach (explode(',', $header) as $part) {
        $pair = explode('=', trim($part), 2);
        if (count($pair) !== 2) {
            continue;
        }
        if ($pair[0] === 't') {
            $timestamp = (int) $pair[1];
        } elseif ($pair[0] === 'v1') {
            $signatures[] = $pair[1];
        }
    }

    if ($timestamp === null || $signatures === []) {
        return false;
    }
    if (abs(time() - $timestamp) > $tolerance) {
        return false;
    }

    $expected = hash_hmac('sha256', $timestamp . '.' . $payload, $secret);
    foreach ($signatures as $candidate) {
        if (hash_equals($expected, $candidate)) {
            return true;
        }
    }
    return false;
}

if (!stripe_signature_valid($payload, $sigHeader, $secret)) {
    error_log('MCB CRM: rejected Stripe webhook with an invalid signature.');
    json_error(400, 'invalid_signature', 'Signature verification failed.');
}

$event = json_decode($payload, true);
if (!is_array($event) || !isset($event['id'], $event['type'])) {
    json_error(400, 'invalid_payload', 'Malformed event.');
}

/**
 * The events that can mean "paid". A Checkout Session completed with a
 * delayed payment method arrives as `completed` with payment_status "unpaid",
 * and the money follows later as `async_payment_succeeded`.
 */
const PAYMENT_EVENTS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];

// Acknowledge anything we do not act on, so Stripe stops retrying it.
if (!in_array($event['type'], PAYMENT_EVENTS, true)) {
    json_response(200, ['received' => true, 'ignored' => $event['type']]);
}

$session   = is_array($event['data']['object'] ?? null) ? $event['data']['object'] : [];
$orderId   = (int) ($session['client_reference_id'] ?? 0);
$sessionId = (string) ($session['id'] ?? '');
$intent    = (string) ($session['payment_intent'] ?? '');

// No money has moved yet. The async success event will follow if it does.
if (($session['payment_status'] ?? null) !== 'paid') {
    json_response(200, ['received' => true, 'outcome' => 'awaiting_payment']);
}

/**
 * ---- The right Stripe mode ----------------------------------------------
 *
 * A server holding a test key rehearses; one holding a live key takes real
 * money. A payment from the other mode is never allowed to mark an order paid
 * — test money is not money, and live money must not vanish into a rehearsal
 * database. It is filed for a person instead. Genuine events always carry
 * `livemode`; one without it is treated as the wrong mode.
 */
$expectedLivemode = stripe_expected_livemode();
if ($expectedLivemode !== null) {
    $eventLivemode = $event['livemode'] ?? ($session['livemode'] ?? null);
    if ($eventLivemode !== $expectedLivemode) {
        error_log('MCB CRM: Stripe event ' . (string) $event['id'] . ' is not in this server\'s mode; filed, not processed.');
        capture_unreconciled_payment(db(), $event, $session, 'MODE_MISMATCH');
        json_response(200, ['received' => true, 'matched' => false, 'reason' => 'mode_mismatch']);
    }
}

if ($orderId <= 0 || $sessionId === '') {
    // Money has arrived and no order claims it. Filed, not just logged.
    error_log('MCB CRM: paid checkout session without a usable client_reference_id.');
    $captured = capture_unreconciled_payment(db(), $event, $session, 'NO_ORDER_REFERENCE');
    json_response(200, ['received' => true, 'matched' => false, 'captured' => $captured]);
}

$refuse = static function (string $reason, string $log, ?int $reviewOrderId = null) use ($event, $session, $sessionId): never {
    error_log('MCB CRM: ' . $log);
    capture_unreconciled_payment(db(), $event, $session, $reason);

    /**
     * Money arrived for THIS order, but not the amount or currency expected.
     * The order moves to PAYMENT_REVIEW so it cannot be paid a second time
     * while a person decides, and the thank-you page never calls it paid.
     * Only a PENDING order moves; a replay changes nothing.
     */
    if ($reviewOrderId !== null) {
        try {
            db_transaction(function (PDO $pdo) use ($reviewOrderId, $reason, $sessionId, $session): void {
                $moved = $pdo->prepare("UPDATE orders SET status = 'PAYMENT_REVIEW' WHERE id = :id AND status = 'PENDING'");
                $moved->execute([':id' => $reviewOrderId]);
                if ($moved->rowCount() === 1) {
                    record_order_event($pdo, $reviewOrderId, 'PAYMENT.RECEIVED', [
                        'amount_minor' => is_int($session['amount_total'] ?? null) ? $session['amount_total'] : null,
                        'currency'     => is_string($session['currency'] ?? null) ? strtoupper(substr($session['currency'], 0, 3)) : null,
                    ], 'received:' . substr($sessionId, 0, 100));
                    record_order_event($pdo, $reviewOrderId, 'PAYMENT.REVIEW', ['reason' => $reason], 'review:' . substr($sessionId, 0, 100));
                }
            });
        } catch (PDOException $e) {
            error_log('MCB CRM: could not move order ' . $reviewOrderId . ' to review: ' . $e->getMessage());
        }
    }

    json_response(200, ['received' => true, 'matched' => false, 'reason' => strtolower($reason)]);
};

/**
 * ─────────────────────────────────────────────────────────────────────────
 * PAYMENT MATCHING — exact order, exact currency, exact amount
 * ─────────────────────────────────────────────────────────────────────────
 * A signed event naming a real order is not, on its own, proof that the right
 * money arrived for it. An order is marked PAID automatically only when:
 *
 *   - the order identifiers agree (client_reference_id, metadata, snapshot)
 *   - the currency is the order's currency
 *   - amount_total equals the expected amount EXACTLY
 *
 * Anything else — underpayment, overpayment, a missing amount, the wrong
 * currency, disagreeing identifiers — is filed in `unreconciled_payments` for
 * a human and the order stays PENDING. Stripe still receives a 200: the money
 * is real, and retrying the event will not change what it says.
 *
 * THE EXPECTED AMOUNT. For a session MCB created, the snapshot recorded when
 * it was created (never re-priced from today's catalogue). Otherwise the
 * order's saved total. Orders from before the canonical catalogue carry no
 * integer total, so theirs is summed exactly from their DECIMAL columns.
 */
$metadataOrder = $session['metadata']['mcb_order_id'] ?? null;
if ($metadataOrder !== null && (string) $metadataOrder !== (string) $orderId) {
    $refuse('ORDER_MISMATCH', "order identifiers disagree on {$sessionId}.");
}

$expectedMinor = null;
$expectedCurrency = null;
$snapshot = false;
// The order the amount is being compared for, when it is known to exist.
$reviewOrderId = null;

$stmt = db()->prepare(
    'SELECT order_id, expected_amount_gbp, expected_minor, currency
       FROM checkout_sessions WHERE stripe_session_id = :sid LIMIT 1'
);
$stmt->execute([':sid' => $sessionId]);
$snapshot = $stmt->fetch();

if ($snapshot !== false) {
    if ((int) $snapshot['order_id'] !== $orderId) {
        $refuse('ORDER_MISMATCH', "session {$sessionId} belongs to another order.");
    }
    $expectedMinor = $snapshot['expected_minor'] !== null
        ? (int) $snapshot['expected_minor']
        : decimal_to_minor((string) $snapshot['expected_amount_gbp']);
    $expectedCurrency = (string) $snapshot['currency'];
    $reviewOrderId = $orderId;
} else {
    $stmt = db()->prepare(
        'SELECT o.total_minor, o.amount_gbp, o.currency,
                (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
           FROM orders o WHERE o.id = :id LIMIT 1'
    );
    $stmt->execute([':id' => $orderId]);
    $matched = $stmt->fetch();

    if ($matched !== false) {
        $reviewOrderId = $orderId;
        $expectedCurrency = (string) $matched['currency'];
        if ($matched['total_minor'] !== null) {
            $expectedMinor = (int) $matched['total_minor'];
        } else {
            // Legacy order: the package amount plus any add-on lines.
            $expectedMinor = decimal_to_minor((string) $matched['amount_gbp']);
            $items = db()->prepare('SELECT line_gbp FROM order_items WHERE order_id = :id');
            $items->execute([':id' => $orderId]);
            foreach ($items->fetchAll() as $item) {
                $lineMinor = decimal_to_minor((string) $item['line_gbp']);
                $expectedMinor = ($expectedMinor === null || $lineMinor === null) ? null : $expectedMinor + $lineMinor;
            }
        }
    }
    // An unknown order is filed as ORDER_NOT_FOUND inside the transaction.
}

if ($expectedCurrency !== null) {
    $paidCurrency = strtoupper((string) ($session['currency'] ?? ''));
    if ($paidCurrency !== strtoupper($expectedCurrency)) {
        $refuse('CURRENCY_MISMATCH', "currency mismatch on {$sessionId}: got '{$paidCurrency}'.", $reviewOrderId);
    }
    $paidMinor = $session['amount_total'] ?? null;
    if (!is_int($paidMinor) || $expectedMinor === null || $paidMinor !== $expectedMinor) {
        $got = is_int($paidMinor) ? (string) $paidMinor : 'none';
        $refuse('AMOUNT_MISMATCH', "amount mismatch on {$sessionId}: got {$got}, expected " . ($expectedMinor ?? 'unknown') . '.', $reviewOrderId);
    }
}

try {
    $outcome = db_transaction(function (PDO $pdo) use ($event, $session, $orderId, $sessionId, $intent, $expectedLivemode): string {
        // Idempotency gate. UNIQUE(event_id) means a duplicate delivery loses
        // the insert race and returns here without touching the order or the
        // affiliate's sales — the same event can never be counted twice.
        try {
            $pdo->prepare('INSERT INTO stripe_events (event_id, event_type, order_id) VALUES (:e, :t, :o)')
                ->execute([':e' => $event['id'], ':t' => $event['type'], ':o' => $orderId]);
        } catch (PDOException $e) {
            if (is_duplicate_error($e)) {
                return 'duplicate';
            }
            throw $e;
        }

        $stmt = $pdo->prepare(
            'SELECT id, status, affiliate_id, customer_id, mcb_reference, stripe_session_id FROM orders WHERE id = :id FOR UPDATE'
        );
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();

        if ($order === false) {
            // A reference was carried but names no order. Same outcome for
            // the customer as carrying none at all, so it is filed the same
            // way rather than acknowledged into silence.
            capture_unreconciled_payment($pdo, $event, $session, 'ORDER_NOT_FOUND');
            return 'unknown_order';
        }
        if ($order['status'] === 'PAID') {
            /**
             * The same session reporting again (another event type for one
             * payment) is not new money. A DIFFERENT session paying an order
             * that is already paid is a second payment: filed for a refund
             * decision, never silently absorbed.
             */
            if ((string) $order['stripe_session_id'] !== $sessionId) {
                capture_unreconciled_payment($pdo, $event, $session, 'DUPLICATE_PAYMENT');
                return 'duplicate_payment';
            }
            // Make sure it holds a reference, but never issue a second one.
            assign_mcb_reference($pdo, $orderId, $order['mcb_reference']);
            return 'already_paid';
        }

        /**
         * Only an order awaiting payment can become PAID automatically. One
         * under review, cancelled or refunded that receives an exact payment
         * is filed for a person, and left as it is.
         */
        if ($order['status'] !== 'PENDING') {
            capture_unreconciled_payment($pdo, $event, $session, 'ORDER_NOT_PAYABLE');
            return 'order_not_payable';
        }

        $livemode = $event['livemode'] ?? ($session['livemode'] ?? $expectedLivemode);
        $pdo->prepare(
            'UPDATE orders
                SET status = :s, stripe_session_id = :sid, stripe_payment_intent = :pi, stripe_livemode = :live
              WHERE id = :id'
        )->execute([
            ':s'    => 'PAID',
            ':sid'  => $sessionId,
            ':pi'   => $intent !== '' ? $intent : null,
            ':live' => is_bool($livemode) ? (int) $livemode : null,
            ':id'   => $orderId,
        ]);

        // The customer-facing reference is issued HERE and nowhere else: this
        // is the first moment MCB knows the money is real. Inside the same
        // transaction as the PAID transition, so an order can never be paid
        // without a reference, or hold a reference without being paid.
        $reference = assign_mcb_reference($pdo, $orderId, $order['mcb_reference']);

        // The audit trail, in the same transaction: exactly once per order.
        record_order_event($pdo, $orderId, 'PAYMENT.RECEIVED', [
            'amount_minor' => is_int($session['amount_total'] ?? null) ? $session['amount_total'] : null,
            'currency'     => 'GBP',
            'livemode'     => is_bool($livemode) ? $livemode : null,
        ], 'received:' . substr($sessionId, 0, 100));
        record_order_event($pdo, $orderId, 'ORDER.PAID', ['reference' => $reference], 'paid');
        // Single Creative Authority: verified payment is the order commitment.
        // Personalised production may begin now; no approval is awaited.
        record_order_event($pdo, $orderId, 'ORDER.READY_FOR_PROCESSING', [], 'ready-for-processing');
        record_order_event($pdo, $orderId, 'CUSTOMER.CONFIRMATION.DUE', [], 'confirmation-due');

        // The only place affiliate sales are ever incremented. Stripe is the
        // payment authority; a browser claiming success proves nothing.
        if ($order['affiliate_id'] !== null) {
            $pdo->prepare('UPDATE affiliates SET sales = sales + 1 WHERE id = :id')
                ->execute([':id' => (int) $order['affiliate_id']]);
        }

        /**
         * ---- Customer referral, confirmed --------------------------------
         *
         * SEPARATE FROM THE AFFILIATE CREDIT ABOVE, and it does not touch it.
         * `affiliates.sales` is a commission counter; this is a record that a
         * friend's recommendation led to a purchase. An order can have both,
         * and when it does the affiliate is still paid exactly once.
         *
         * Conditional on the conversion currently being ATTRIBUTED, so a
         * replayed event matches no rows and confirms nothing twice. A
         * SELF_REFERRAL stays a self-referral: paying for it does not change
         * what it was.
         */
        confirm_referral_conversion($pdo, $orderId);

        /**
         * ---- Referral eligibility ----------------------------------------
         *
         * A customer becomes able to share MCB at the moment their payment is
         * verified, and not before. `order.php` deliberately does not do this:
         * an order that has merely been created may never be paid, and minting
         * codes for abandoned checkouts would hand share links to people who
         * are not customers.
         *
         * Idempotent — a second delivery returns the existing code — so this
         * is safe on the replay path that reaches here.
         */
        $customerIdForReferral = (int) ($order['customer_id'] ?? 0);
        if ($customerIdForReferral > 0) {
            ensure_customer_referral($pdo, $customerIdForReferral, $orderId);
        }

        return 'recorded';
    });
} catch (PDOException $e) {
    // 500 asks Stripe to retry, which is correct for a transient failure.
    error_log('MCB CRM: Stripe webhook processing failed: ' . $e->getMessage());
    json_error(500, 'processing_failed', 'Could not process the event.');
}

// ---------------------------------------------------------------------
// POST-PAYMENT CUSTOMER EMAIL — outside the transaction, on purpose.
//
// The transaction has committed: the order is PAID and its MCB reference is
// permanent. Only now is the customer told, so nothing can ever email a
// reference that a rollback then took away.
//
// Deliberately NOT inside db_transaction(): holding a row lock open across a
// third-party HTTP call would let an email provider slowdown block the money path.
//
// notify_customer_of_payment() never throws and never affects the response
// code. Stripe gets its 200 whether or not the email provider answered — a non-2xx
// would make Stripe retry a payment MCB has already banked. The outcome is
// reported in the body so it is visible in Stripe's own event log.
//
// Attempted on every outcome that implies the order is paid — including
// 'duplicate'.
//
// 'duplicate' matters operationally: it is what Stripe's own "Resend" button
// produces, since a resend carries the SAME event id. Without it, an order
// that was paid before the email existed — or whose email failed while
// the email provider was down — could never be sent its reference at all, because
// every route to it would return here first. Including it makes Resend the
// recovery mechanism.
//
// Safe on all three paths because the claim inside is conditional: it
// requires status = PAID and customer_notified_at IS NULL, so an unpaid or
// already-emailed order is silently skipped no matter who asks.
// ---------------------------------------------------------------------
$notified = null;
if ($outcome === 'recorded' || $outcome === 'already_paid' || $outcome === 'duplicate') {
    $notified = notify_customer_of_payment(db(), $orderId);
    if ($notified === 'notified') {
        record_order_event_safely(db(), $orderId, 'CUSTOMER.CONFIRMATION.SENT', [], 'confirmation-sent');
    }
}

// The operations workflow hears about a new payment once, server-side, with
// no customer contact details or story. Dormant unless configured.
if ($outcome === 'recorded') {
    notify_operations_of_payment(db(), $orderId);
}

// Close the snapshot, for operators reading the checkout history. Purely a
// record: the order's own status is what the rest of the system reads, and it
// was already set inside the transaction above.
if ($snapshot !== false && $outcome === 'recorded') {
    try {
        db()->prepare(
            "UPDATE checkout_sessions SET status = 'COMPLETED' WHERE stripe_session_id = :sid"
        )->execute([':sid' => $sessionId]);
    } catch (PDOException $e) {
        error_log('MCB CRM: could not close checkout snapshot: ' . $e->getMessage());
    }
}

json_response(200, ['received' => true, 'outcome' => $outcome, 'customer_email' => $notified]);
