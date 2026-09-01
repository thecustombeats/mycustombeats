<?php
/**
 * MCB CRM — the post-payment customer notification.
 *
 * WHY THIS EXISTS
 * The MCB customer email used to be fired from the browser, from the order
 * form, at submission. That is before Stripe, which had two consequences:
 * the email could not carry the MCB reference (it does not exist until the
 * payment is confirmed), and it was sent to everyone who submitted the form
 * — including people who then abandoned checkout and never paid a penny.
 *
 * The trigger now lives here, on the server, downstream of the money.
 *
 * THREE RULES THIS FILE OBEYS
 *
 *   1. It runs only AFTER the paid transaction has committed. The order is
 *      already PAID and already holds its reference before anyone is told.
 *
 *   2. It can never fail a payment. Every path returns; nothing throws.
 *      Stripe must get its 200 whether or not Make.com is reachable, because
 *      a non-2xx makes Stripe retry a payment MCB has already banked.
 *
 *   3. It sends at most once per order, enforced by a conditional UPDATE
 *      rather than by hoping Stripe delivers each event once.
 */

declare(strict_types=1);

/** Abandon a slow Make.com rather than hold up Stripe's acknowledgement. */
const MCB_NOTIFY_TIMEOUT_SECONDS = 5;

/**
 * Claims the right to notify this order, atomically.
 *
 * The UPDATE only matches while customer_notified_at IS NULL, so if Stripe
 * delivers the same event twice — or delivers two different events for one
 * order — exactly one caller sees rowCount() === 1 and the other sees 0.
 * The database decides, not the order the requests happen to arrive in.
 *
 * Also requires status = PAID: an order that is not paid is never emailed a
 * reference, whatever the caller believes.
 */
function claim_customer_notification(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare(
        'UPDATE orders
            SET customer_notified_at = NOW()
          WHERE id = :id
            AND status = :paid
            AND customer_notified_at IS NULL'
    );
    $stmt->execute([':id' => $orderId, ':paid' => 'PAID']);

    return $stmt->rowCount() === 1;
}

/**
 * Releases a claim whose delivery failed, so the customer is not silently
 * left without their reference.
 *
 * The row returns to "owed an email", which a later Stripe delivery or an
 * operator can act on, and which GET /api/crm/orders reports.
 */
function release_customer_notification(PDO $pdo, int $orderId): void
{
    try {
        $pdo->prepare('UPDATE orders SET customer_notified_at = NULL WHERE id = :id')
            ->execute([':id' => $orderId]);
    } catch (PDOException $e) {
        error_log('MCB CRM: could not release notification claim for order ' . $orderId
            . ': ' . $e->getMessage());
    }
}

/**
 * Assembles exactly what Make.com needs to write the email, and nothing else.
 *
 * Deliberately excluded: the creative brief and the customer's story (no
 * email needs them), every Stripe identifier, and anything from
 * configuration. A webhook URL is a shared secret held by a third party;
 * it should never carry credentials or material a leak could exploit.
 */
function post_payment_notification_payload(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT o.id, o.mcb_reference, o.package, o.format, o.fulfilment_type,
                o.amount_gbp, o.currency,
                c.name AS customer_name, c.email AS customer_email
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
          WHERE o.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $orderId]);
    $row = $stmt->fetch();

    if ($row === false || ($row['mcb_reference'] ?? null) === null) {
        // No reference means there is nothing worth emailing about yet.
        return null;
    }

    $amount = (float) $row['amount_gbp'];
    // Literal UTF-8, not "\u{a3}" escapes: PHP only interprets those inside
    // DOUBLE-quoted strings, so a single-quoted escape ships to the customer
    // as the characters \u{a3} instead of a pound sign.
    $symbols = ['GBP' => '£', 'USD' => '$', 'EUR' => '€'];
    $symbol  = $symbols[$row['currency']] ?? '';

    // FLAT on purpose. Zapier's Catch Hook exposes nested JSON as
    // `customer__email` / `amount__value` in the Zap editor, which is easy to
    // mis-map when someone builds the email template by hand. Flat keys map
    // one-to-one onto template fields.
    return [
        'event'           => 'order.paid',

        // The one identifier the customer is asked to quote.
        'mcb_reference'   => $row['mcb_reference'],

        'customer_name'   => $row['customer_name'],
        'customer_email'  => $row['customer_email'],

        'package'         => $row['package'],
        'format'          => $row['format'],
        'fulfilment_type' => $row['fulfilment_type'],

        'amount_value'    => $amount,
        'amount_currency' => $row['currency'],
        // Pre-formatted so the Zap never has to do currency maths, and the
        // customer always sees "£10.00" rather than "10".
        'amount_display'  => $symbol . number_format($amount, 2),

        // INTERNAL ONLY — for staff lookup and Zap filtering.
        // MUST NOT be rendered in the customer's email.
        'order_id'        => (int) $row['id'],
    ];
}

/**
 * POSTs the payload to the automation platform. Returns true only on a 2xx.
 *
 * Zapier's Catch Hook answers 200 with {"status":"success",…}, so the existing
 * 2xx check needs no special case. Transport-agnostic on purpose: the
 * platform is a URL in configuration, never a decision baked into code.
 *
 * Never throws. A transport failure here is an email problem, not a payment
 * problem, and must not propagate into the webhook's response to Stripe.
 */
function deliver_post_payment_notification(string $url, array $payload): bool
{
    $body = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        error_log('MCB CRM: post-payment payload could not be encoded.');
        return false;
    }

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => MCB_NOTIFY_TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => MCB_NOTIFY_TIMEOUT_SECONDS,
        ]);
        $response = curl_exec($ch);
        $status   = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error    = curl_error($ch);
        curl_close($ch);

        if ($response === false || $status < 200 || $status >= 300) {
            error_log('MCB CRM: post-payment notification failed (HTTP ' . $status . ') ' . $error);
            return false;
        }
        return true;
    }

    // Fallback for a host without cURL. `ignore_errors` keeps a non-2xx from
    // being swallowed as a warning so the status line can still be read.
    $context = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => "Content-Type: application/json\r\n",
            'content'       => $body,
            'timeout'       => MCB_NOTIFY_TIMEOUT_SECONDS,
            'ignore_errors' => true,
        ],
    ]);

    $result = @file_get_contents($url, false, $context);
    $ok = $result !== false
        && isset($http_response_header[0])
        && (bool) preg_match('#\s(2\d\d)\s#', $http_response_header[0]);

    if (!$ok) {
        error_log('MCB CRM: post-payment notification failed (stream transport).');
    }
    return $ok;
}

/**
 * The whole post-payment notification, safe to call unconditionally.
 *
 * Returns a short status token for the webhook's response body, which makes
 * the outcome visible in the Stripe Dashboard's event log without anyone
 * needing to open a server log.
 */
function notify_customer_of_payment(PDO $pdo, int $orderId): string
{
    $url = (string) mcb_setting('zapier.post_payment_webhook', '');
    if ($url === '') {
        // Not configured. Deliberately does NOT claim the order, so the email
        // still goes out once the webhook URL is set and an event replayed.
        error_log('MCB CRM: post-payment notification skipped for order ' . $orderId
            . ' — zapier.post_payment_webhook is not configured.');
        return 'not_configured';
    }

    try {
        if (!claim_customer_notification($pdo, $orderId)) {
            // Either already notified, or the order is not PAID. Both mean
            // "do not send", and neither is an error.
            return 'already_notified';
        }
    } catch (PDOException $e) {
        error_log('MCB CRM: notification claim failed for order ' . $orderId
            . ': ' . $e->getMessage());
        return 'claim_failed';
    }

    try {
        $payload = post_payment_notification_payload($pdo, $orderId);
    } catch (PDOException $e) {
        error_log('MCB CRM: notification payload failed for order ' . $orderId
            . ': ' . $e->getMessage());
        release_customer_notification($pdo, $orderId);
        return 'payload_failed';
    }

    if ($payload === null) {
        release_customer_notification($pdo, $orderId);
        return 'no_reference';
    }

    if (!deliver_post_payment_notification($url, $payload)) {
        // Hand the order back so it shows as still owed an email rather than
        // being recorded as notified when nothing was sent.
        release_customer_notification($pdo, $orderId);
        return 'delivery_failed';
    }

    return 'notified';
}
