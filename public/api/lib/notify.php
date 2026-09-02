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

/** Abandon a slow provider rather than hold up Stripe's acknowledgement. */
const MCB_NOTIFY_TIMEOUT_SECONDS = 5;

/**
 * Resend's send endpoint.
 *
 * Overridable through `resend.api_url` for the acceptance suite ONLY, which
 * points it at a local stub so the tests never send real mail or need a live
 * API key. Production leaves it unset and gets this constant.
 */
const MCB_RESEND_ENDPOINT = 'https://api.resend.com/emails';

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

    $packageDef = package_def((string) $row['package']);
    $formatDef  = $row['format'] === null
        ? null
        : (packages_data()['formats'][$row['format']] ?? null);

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

        // Human-readable equivalents, resolved from the SAME authoritative
        // packages.json the order endpoint validates against. The customer
        // should read "Moment" and "MP3", not the internal ids "moment" and
        // "mp3". Same data model, presentation-ready.
        'package_display' => $packageDef['name'] ?? $row['package'],
        'format_display'  => $formatDef['name'] ?? $row['format'],
        'delivery'        => $packageDef['delivery'] ?? null,

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

/** Escapes a value for safe interpolation into the HTML email body. */
function mcb_e(?string $value): string
{
    // The customer's own name reaches this template straight from the order
    // form, so it is untrusted text. Unescaped, a name containing markup
    // would be rendered as HTML in every inbox that opens the message.
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** Subject line. Leads with the reference so it is findable by search. */
function post_payment_email_subject(array $payload): string
{
    return 'Your My Custom Beats order — ' . $payload['mcb_reference'];
}

/**
 * The plain-text part.
 *
 * Sent alongside the HTML rather than left for Resend to auto-generate:
 * text-only clients and many spam filters read this part, and a hand-written
 * version keeps the reference legible in both.
 */
function post_payment_email_text(array $payload): string
{
    $lines = [
        'Hi ' . $payload['customer_name'] . ',',
        '',
        'Thank you for your order with My Custom Beats.',
        '',
        'Your order has been successfully received and is now in motion.',
        '',
        'MCB Reference: ' . $payload['mcb_reference'],
        '',
        'Order details:',
        'Package: ' . $payload['package_display'],
    ];

    // Bespoke commissions have no format, so the line is omitted rather than
    // printed empty.
    if (($payload['format_display'] ?? null) !== null && $payload['format_display'] !== '') {
        $lines[] = 'Format: ' . $payload['format_display'];
    }

    $lines[] = 'Amount paid: ' . $payload['amount_display'];
    $lines[] = '';
    $lines[] = 'Please keep this reference for all future correspondence with My Custom Beats.';
    $lines[] = '';
    $lines[] = 'What happens next';
    $lines[] = '';
    $lines[] = 'Our team will now begin processing your custom music experience. '
             . 'We will be in touch if we need anything further from you.';

    if (($payload['delivery'] ?? null) !== null && $payload['delivery'] !== '') {
        $lines[] = '';
        $lines[] = $payload['delivery'] . '.';
    }

    $lines[] = '';
    $lines[] = 'Thank you for choosing My Custom Beats.';
    $lines[] = '';
    $lines[] = 'Warm regards,';
    $lines[] = '';
    $lines[] = 'The My Custom Beats Team';
    $lines[] = 'Memories Crafted Beautifully';

    return implode("\n", $lines);
}

/**
 * The HTML part.
 *
 * Deliberately plain: table-free, inline styles, no web fonts and no external
 * images. Email clients strip <style> blocks, block remote assets by default
 * and disagree about flexbox, so anything more elaborate degrades unevenly.
 *
 * Colours are the MVIS palette used on the thank-you page, so the reference
 * looks the same in the inbox as it does on the site — Midnight Ink #0D1B2A,
 * Ivory #F8F5F0 and Heritage Gold #C9A14A.
 */
function post_payment_email_html(array $payload): string
{
    $reference = mcb_e($payload['mcb_reference']);
    $name      = mcb_e($payload['customer_name']);
    $package   = mcb_e($payload['package_display']);
    $amount    = mcb_e($payload['amount_display']);

    $formatRow = '';
    if (($payload['format_display'] ?? null) !== null && $payload['format_display'] !== '') {
        $formatRow = '<p style="margin:0 0 4px;">Format: <strong>'
            . mcb_e($payload['format_display']) . '</strong></p>';
    }

    $deliveryLine = '';
    if (($payload['delivery'] ?? null) !== null && $payload['delivery'] !== '') {
        $deliveryLine = '<p style="margin:12px 0 0;color:#0D1B2A;">'
            . mcb_e($payload['delivery']) . '.</p>';
    }

    return <<<HTML
<div style="margin:0;padding:24px;background:#F8F5F0;font-family:Helvetica,Arial,sans-serif;color:#0D1B2A;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">

    <p style="margin:0 0 16px;">Hi {$name},</p>

    <p style="margin:0 0 16px;">Thank you for your order with My Custom Beats.</p>

    <p style="margin:0 0 24px;">Your order has been successfully received and is now in motion.</p>

    <div style="background:#0D1B2A;border-radius:10px;padding:24px;text-align:center;margin:0 0 24px;">
      <p style="margin:0 0 8px;color:#F8F5F0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Your MCB Reference</p>
      <p style="margin:0;color:#C9A14A;font-size:28px;font-weight:bold;letter-spacing:1px;">{$reference}</p>
    </div>

    <p style="margin:0 0 8px;font-weight:bold;">Order details</p>
    <p style="margin:0 0 4px;">Package: <strong>{$package}</strong></p>
    {$formatRow}
    <p style="margin:0 0 24px;">Amount paid: <strong>{$amount}</strong></p>

    <p style="margin:0 0 24px;">Please keep this reference for all future correspondence with My Custom Beats.</p>

    <p style="margin:0 0 8px;font-weight:bold;">What happens next</p>
    <p style="margin:0;">Our team will now begin processing your custom music experience. We will be in touch if we need anything further from you.</p>
    {$deliveryLine}

    <p style="margin:24px 0 0;">Thank you for choosing My Custom Beats.</p>

    <p style="margin:24px 0 0;">Warm regards,</p>
    <p style="margin:0;"><strong>The My Custom Beats Team</strong></p>
    <p style="margin:4px 0 0;color:#C9A14A;font-size:13px;">Memories Crafted Beautifully&trade;</p>

  </div>
</div>
HTML;
}

/**
 * Sends the confirmation through Resend. Returns true only on a confirmed send.
 *
 * Never throws. A failure here is an email problem, not a payment problem, and
 * must not propagate into the webhook's response to Stripe.
 *
 * The API key is passed in rather than read here, and is never logged, never
 * echoed and never placed in an error message — treated exactly like the
 * Stripe secret.
 */
function deliver_via_resend(array $payload, string $apiKey, string $from, string $endpoint): bool
{
    $body = json_encode([
        'from'     => $from,
        'to'       => [$payload['customer_email']],
        'subject'  => post_payment_email_subject($payload),
        'html'     => post_payment_email_html($payload),
        'text'     => post_payment_email_text($payload),
        'reply_to' => 'support@mycustombeats.com',
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($body === false) {
        error_log('MCB CRM: post-payment email could not be encoded.');
        return false;
    }

    $headers = [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $apiKey,
        // Provider-side safety net, distinct from the database claim.
        //
        // If Resend accepts the send but the response is lost — a timeout on
        // an otherwise successful call — this function reports failure, the
        // claim is released, and a later Stripe Resend tries again. Without
        // this header that second attempt would deliver a SECOND email.
        // Keyed on the reference, which is unique per paid order and stable
        // forever, so the retry returns the original result instead.
        //
        // Resend expires these after 24 hours; the database claim remains the
        // durable guarantee.
        'Idempotency-Key: mcb-' . $payload['mcb_reference'],
    ];

    $raw    = null;
    $status = 0;

    if (function_exists('curl_init')) {
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => MCB_NOTIFY_TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => MCB_NOTIFY_TIMEOUT_SECONDS,
        ]);
        $result = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error  = curl_error($ch);
        curl_close($ch);

        if ($result === false) {
            // Transport-level failure: DNS, connection refused, or the
            // timeout above. curl_error never contains the request headers,
            // so the key cannot reach the log through here.
            error_log('MCB CRM: Resend request failed (transport): ' . $error);
            return false;
        }
        $raw = (string) $result;
    } else {
        $context = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => implode("\r\n", $headers) . "\r\n",
                'content'       => $body,
                'timeout'       => MCB_NOTIFY_TIMEOUT_SECONDS,
                'ignore_errors' => true,
            ],
        ]);
        $result = @file_get_contents($endpoint, false, $context);
        if ($result === false) {
            error_log('MCB CRM: Resend request failed (stream transport).');
            return false;
        }
        $raw = (string) $result;
        if (isset($http_response_header[0])
            && preg_match('#\s(\d{3})\s#', $http_response_header[0], $m) === 1) {
            $status = (int) $m[1];
        }
    }

    if ($status < 200 || $status >= 300) {
        // Resend's error bodies describe the problem and never echo the key,
        // but the body is bounded anyway rather than logged wholesale.
        error_log('MCB CRM: Resend rejected the send (HTTP ' . $status . '): '
            . mb_substr($raw, 0, 200));
        return false;
    }

    // A 2xx alone is not proof of acceptance. Resend answers a successful
    // send with {"id":"…"}; a 2xx carrying anything else — an error shape, an
    // empty body, a proxy's HTML — means the message was not queued, and
    // treating it as sent would mark the customer notified with nothing sent.
    $decoded = json_decode($raw, true);
    if (!is_array($decoded) || !isset($decoded['id']) || !is_string($decoded['id']) || $decoded['id'] === '') {
        error_log('MCB CRM: Resend returned HTTP ' . $status
            . ' without a message id; treating as undelivered.');
        return false;
    }

    return true;
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
    $apiKey   = (string) mcb_setting('resend.api_key', '');
    $from     = (string) mcb_setting('resend.from', '');
    $endpoint = (string) mcb_setting('resend.api_url', MCB_RESEND_ENDPOINT);

    if ($apiKey === '' || $from === '') {
        // Not configured. Deliberately does NOT claim the order, so the email
        // still goes out once the credentials are set and an event replayed.
        //
        // Names the missing setting, never its value.
        error_log('MCB CRM: post-payment notification skipped for order ' . $orderId
            . ' — resend.api_key and/or resend.from is not configured.');
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

    if (!deliver_via_resend($payload, $apiKey, $from, $endpoint)) {
        // Hand the order back so it shows as still owed an email rather than
        // being recorded as notified when nothing was sent.
        release_customer_notification($pdo, $orderId);
        return 'delivery_failed';
    }

    return 'notified';
}
