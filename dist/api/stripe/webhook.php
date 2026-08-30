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
 *        Events: checkout.session.completed
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

// Acknowledge anything we do not act on, so Stripe stops retrying it.
if ($event['type'] !== 'checkout.session.completed') {
    json_response(200, ['received' => true, 'ignored' => $event['type']]);
}

$session   = $event['data']['object'] ?? [];
$orderId   = (int) ($session['client_reference_id'] ?? 0);
$sessionId = (string) ($session['id'] ?? '');
$intent    = (string) ($session['payment_intent'] ?? '');

if ($orderId <= 0 || $sessionId === '') {
    // A completed checkout with no order reference is a real anomaly worth
    // logging, but retrying will not fix it — acknowledge and move on.
    error_log('MCB CRM: checkout.session.completed without a usable client_reference_id.');
    json_response(200, ['received' => true, 'matched' => false]);
}

try {
    $outcome = db_transaction(function (PDO $pdo) use ($event, $orderId, $sessionId, $intent): string {
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

        $stmt = $pdo->prepare('SELECT id, status, affiliate_id FROM orders WHERE id = :id FOR UPDATE');
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();

        if ($order === false) {
            return 'unknown_order';
        }
        if ($order['status'] === 'PAID') {
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

        // The only place affiliate sales are ever incremented. Stripe is the
        // payment authority; a browser claiming success proves nothing.
        if ($order['affiliate_id'] !== null) {
            $pdo->prepare('UPDATE affiliates SET sales = sales + 1 WHERE id = :id')
                ->execute([':id' => (int) $order['affiliate_id']]);
        }

        return 'recorded';
    });
} catch (PDOException $e) {
    // 500 asks Stripe to retry, which is correct for a transient failure.
    error_log('MCB CRM: Stripe webhook processing failed: ' . $e->getMessage());
    json_error(500, 'processing_failed', 'Could not process the event.');
}

json_response(200, ['received' => true, 'outcome' => $outcome]);
