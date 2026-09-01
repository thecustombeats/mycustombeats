<?php
/**
 * POST /api/stripe/webhook-test — SANDBOX-ONLY payment confirmation.
 *
 * TEMPORARY. This file exists to prove the checkout.session.completed
 * contract end to end — signature, event routing, PENDING → PAID, affiliate
 * credit and idempotency — without a live payment. DELETE IT once that
 * verification is signed off.
 *
 * It is a deliberate near-copy of webhook.php rather than a shared
 * abstraction. Refactoring the live handler to serve both would mean editing
 * the one file that is currently verified in production, which is exactly
 * what this exercise is meant to avoid. The duplication is the point: the
 * live path stays byte-for-byte unchanged.
 *
 * FOUR THINGS DIFFER FROM THE LIVE HANDLER
 *   1. It reads `stripe.webhook_secret_test`, never `stripe.webhook_secret`.
 *   2. It requires `livemode === false` — strictly, before any database work.
 *   3. It refuses to mutate an order whose customer is not a labelled test
 *      record, so a mistyped client_reference_id cannot touch real data.
 *   4. It never awards commission on an order it has refused.
 *
 * Everything else — the HMAC scheme, the tolerance window, the idempotency
 * gate, the row lock, the status transition — is identical, because a test
 * that exercises different code proves nothing about the code that ships.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

/**
 * Only orders belonging to a customer at this domain may be modified here.
 *
 * RFC 2606 reserves `.invalid`, so no real customer can ever hold an address
 * ending this way. This is the structural guarantee behind requirement 5: a
 * sandbox event carrying the wrong client_reference_id cannot mark a real
 * order paid, because the endpoint will not write to one.
 */
const MCB_TEST_CUSTOMER_SUFFIX = '@crm-verify.invalid';

require_method('POST');

// ---- Gate 1: the SANDBOX secret, never the live one -------------------
$secret = (string) mcb_setting('stripe.webhook_secret_test', '');
if ($secret === '') {
    error_log('MCB CRM: sandbox webhook called but stripe.webhook_secret_test is not configured.');
    json_error(503, 'webhook_not_configured', 'Webhook is not configured.');
}

// ---- Gate 2: raw body, read before anything parses it -----------------
// Stripe signs the exact bytes it sent. Decoding first and re-encoding would
// change them, so the payload is captured untouched and verified as-is.
$payload   = file_get_contents('php://input') ?: '';
$sigHeader = $_SERVER['HTTP_STRIPE_SIGNATURE'] ?? '';

/**
 * Verifies Stripe's `t=…,v1=…` signature header.
 *
 * Character-for-character the live implementation. Any divergence here would
 * mean the sandbox run validates a scheme production does not use.
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

// ---- Gate 3: signature ------------------------------------------------
// A live event reaching this URL fails here: it is signed with the live
// destination's secret, which this endpoint does not hold.
if (!stripe_signature_valid($payload, $sigHeader, $secret)) {
    error_log('MCB CRM: rejected sandbox webhook with an invalid signature.');
    json_error(400, 'invalid_signature', 'Signature verification failed.');
}

// ---- Gate 4: decode, only now that the bytes are trusted --------------
$event = json_decode($payload, true);
if (!is_array($event) || !isset($event['id'], $event['type'])) {
    json_error(400, 'invalid_payload', 'Malformed event.');
}

// ---- Gate 5: event type ----------------------------------------------
if ($event['type'] !== 'checkout.session.completed') {
    json_response(200, ['received' => true, 'ignored' => $event['type']]);
}

// ---- Gate 6: livemode must be present AND false ----------------------
// Written as `!== false` rather than `=== true` on purpose. An absent
// livemode field would satisfy "not true" and slip through; it must not
// satisfy "is false". A payload that cannot prove it is sandbox traffic is
// refused. Nothing below this line has touched the database.
if (($event['livemode'] ?? null) !== false) {
    error_log('MCB CRM: sandbox webhook refused a non-sandbox event: ' . $event['id']);
    json_error(403, 'live_event_refused', 'This endpoint accepts sandbox events only.');
}

$session   = $event['data']['object'] ?? [];
$orderId   = (int) ($session['client_reference_id'] ?? 0);
$sessionId = (string) ($session['id'] ?? '');
$intent    = (string) ($session['payment_intent'] ?? '');

if ($orderId <= 0 || $sessionId === '') {
    // Filed, exactly as the live handler files it. A rehearsal that skipped
    // this would not rehearse the path that matters most.
    error_log('MCB CRM: sandbox checkout.session.completed without a usable client_reference_id.');
    $captured = capture_unreconciled_payment(db(), $event, $session, 'NO_ORDER_REFERENCE');
    json_response(200, ['received' => true, 'matched' => false, 'captured' => $captured]);
}

try {
    $outcome = db_transaction(function (PDO $pdo) use ($event, $session, $orderId, $sessionId, $intent): string {
        // Idempotency gate, in the same position as the live handler. Moving
        // it would change the lock ordering and stop this being a faithful
        // rehearsal of the code that actually ships.
        try {
            $pdo->prepare('INSERT INTO stripe_events (event_id, event_type, order_id) VALUES (:e, :t, :o)')
                ->execute([':e' => $event['id'], ':t' => $event['type'], ':o' => $orderId]);
        } catch (PDOException $e) {
            if (is_duplicate_error($e)) {
                return 'duplicate';
            }
            throw $e;
        }

        // The customer's email is joined in solely to prove this order is a
        // test record. The live handler has no need of it and does not read it.
        $stmt = $pdo->prepare(
            'SELECT o.id, o.status, o.affiliate_id, o.mcb_reference, c.email
               FROM orders o
               JOIN customers c ON c.id = o.customer_id
              WHERE o.id = :id
              FOR UPDATE'
        );
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();

        if ($order === false) {
            capture_unreconciled_payment($pdo, $event, $session, 'ORDER_NOT_FOUND');
            return 'unknown_order';
        }

        // The structural guarantee. A sandbox event pointed at a real order —
        // by typo or otherwise — stops here, before any write, and no
        // commission is awarded.
        if (!str_ends_with((string) $order['email'], MCB_TEST_CUSTOMER_SUFFIX)) {
            error_log('MCB CRM: sandbox webhook refused to modify non-test order ' . $orderId);
            return 'not_a_test_order';
        }

        if ($order['status'] === 'PAID') {
            assign_mcb_reference($pdo, $orderId, $order['mcb_reference']);
            return 'already_paid';
        }

        $pdo->prepare(
            'UPDATE orders
                SET status = :s, stripe_session_id = :sid, stripe_payment_intent = :pi
              WHERE id = :id'
        )->execute([
            ':s'   => 'PAID',
            ':sid' => $sessionId,
            ':pi'  => $intent !== '' ? $intent : null,
            ':id'  => $orderId,
        ]);

        // Reference issue, in the same position as the live handler. It draws
        // from the SAME counter, so a sandbox rehearsal consumes a number out
        // of the real series — expected while verifying, and the reason this
        // endpoint is deleted once sign-off is done.
        assign_mcb_reference($pdo, $orderId, $order['mcb_reference']);

        if ($order['affiliate_id'] !== null) {
            $pdo->prepare('UPDATE affiliates SET sales = sales + 1 WHERE id = :id')
                ->execute([':id' => (int) $order['affiliate_id']]);
        }

        return 'recorded';
    });
} catch (PDOException $e) {
    error_log('MCB CRM: sandbox webhook processing failed: ' . $e->getMessage());
    json_error(500, 'processing_failed', 'Could not process the event.');
}

// DELIBERATELY does not call notify_customer_of_payment(). This is the one
// place the sandbox diverges from the live handler on purpose: a rehearsal
// must never send mail. Test orders belong to @crm-verify.invalid addresses
// which could not receive it anyway, but the guarantee should not rest on
// that — it rests on this call not existing.
json_response(200, ['received' => true, 'outcome' => $outcome, 'sandbox' => true]);
