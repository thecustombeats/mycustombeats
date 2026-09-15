<?php
/**
 * MCB — lifecycle emails after payment.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE SAME LEDGER, THE SAME CLAIM
 * ─────────────────────────────────────────────────────────────────────────
 * Every message is claimed in `customer_communications` before it is sent,
 * keyed on (order, type, dedupe key). A replayed request, a double click and
 * a retry all collide on that key and only one email goes. A failed send is
 * kept as FAILED — visible to staff in the queue — and a retry may reclaim it.
 *
 * WHICH TEMPLATES SEND THEMSELVES is data (operations.json
 * lifecycle_templates). APPROVAL_REQUIRED, CHANGES_RECEIVED,
 * APPROVAL_CONFIRMED and DISPATCHED go with the action that raises them.
 * FOLLOW_UP only when staff ask. The review request keeps its own rules in
 * lifecycle.php.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT NEVER GOES IN AN EMAIL
 * ─────────────────────────────────────────────────────────────────────────
 * The customer's story, their change requests, staff notes, the delivery
 * address, amounts or anything about suppliers. A message says what has
 * happened and links to the private page; the page shows the rest.
 *
 * TEST MODE: an order paid with a Stripe TEST key is emailed to
 * `resend.test_recipient` with [TEST] in the subject, or not at all — exactly
 * as the payment confirmation behaves. Only the local acceptance harness,
 * whose Resend endpoint is a stub, sets `resend.test_mode_send_to_customer`.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/lifecycle.php';

const MCB_LIFECYCLE_TYPES = ['APPROVAL_REQUIRED', 'CHANGES_RECEIVED', 'APPROVAL_CONFIRMED', 'DISPATCHED', 'FOLLOW_UP'];

/** First name only, as a greeting. Control characters cannot reach a header or body. */
function lifecycle_first_name(string $name): string
{
    $clean = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $name) ?? '');
    $first = preg_split('/\s+/u', $clean)[0] ?? '';
    return $first === '' ? 'there' : mb_substr($first, 0, 60);
}

/**
 * Subject, text and HTML for one message.
 *
 * @param array{first_name:string, reference:string, workflow:string, status_link:?string,
 *              approval_link:?string, carrier:?string, tracking_reference:?string,
 *              tracking_url:?string, test_mode:bool} $c
 * @return array{subject:string, text:string, html:string}
 */
function lifecycle_message_content(string $type, array $c): array
{
    $physical = $c['workflow'] === 'PHYSICAL';
    $ref      = $c['reference'];
    $copy     = legal_data()['customer_copy'] ?? [];
    $music    = $physical ? 'your music' : 'your song';

    [$subject, $paragraphs, $button] = match ($type) {
        'APPROVAL_REQUIRED' => [
            "Your " . ($physical ? 'music is' : 'song is') . " ready to listen to — {$ref}",
            [
                "Your " . ($physical ? 'music is' : 'song is') . " ready for you to listen to.",
                "Use the button below to listen. You can approve it, or tell us what you would like changed.",
                $physical
                    ? "Once you approve, we begin making your keepsake, and after that the music can no longer be changed."
                    : "Take your time — we won't treat it as approved until you tell us.",
            ],
            ['Listen and approve', $c['approval_link']],
        ],
        'CHANGES_RECEIVED' => [
            "We've received your changes — {$ref}",
            [
                "Thank you — we've received the changes you asked for.",
                "We'll work on {$music} and let you know when it is ready to listen to again. If we need to check anything with you, we'll be in touch.",
            ],
            ['See your order', $c['status_link']],
        ],
        'APPROVAL_CONFIRMED' => [
            "Thank you for approving " . ($physical ? 'your music' : 'your song') . " — {$ref}",
            $physical
                ? array_values(array_filter([
                    "Thank you — you have approved your music.",
                    "We'll now place your keepsake into production and email you when it has been sent.",
                    $copy['separate_parcels'] ?? null,
                ]))
                : [
                    "Thank you — you have approved your song.",
                    "We hope it brings back every bit of that memory. If anything is not right, just reply to this email.",
                ],
            ['See your order', $c['status_link']],
        ],
        'DISPATCHED' => [
            "Your order is on its way — {$ref}",
            array_values(array_filter([
                "Good news — your order has been sent.",
                $c['carrier'] !== null ? 'Carrier: ' . $c['carrier'] : null,
                $c['tracking_reference'] !== null ? 'Tracking reference: ' . $c['tracking_reference'] : null,
                $copy['separate_parcels'] ?? null,
                $copy['damage_guidance'] ?? null,
                "You can reply to this email or use your order page. " . ($copy['damage_guidance_not_a_condition'] ?? 'Your normal consumer rights are not affected.'),
            ])),
            $c['tracking_url'] !== null ? ['Track your delivery', $c['tracking_url']] : ['See your order', $c['status_link']],
        ],
        'FOLLOW_UP' => [
            "How is everything? — {$ref}",
            [
                "We wanted to check that everything with your order is just as you hoped.",
                "If anything isn't right, reply to this email or use your order page and we'll help.",
            ],
            ['See your order', $c['status_link']],
        ],
    };

    if ($c['test_mode']) {
        $subject = '[TEST] ' . $subject;
    }

    $text = array_merge(['Hi ' . $c['first_name'] . ',', ''], ...array_map(static fn (string $p): array => [$p, ''], $paragraphs));
    if ($button[1] !== null) {
        $text[] = $button[0] . ': ' . $button[1];
        $text[] = '';
    }
    if ($type === 'DISPATCHED' && $c['tracking_url'] !== null && $c['status_link'] !== null) {
        $text[] = 'Your order page: ' . $c['status_link'];
        $text[] = '';
    }
    $text[] = 'Your reference: ' . $ref;
    $text[] = '';
    $text[] = 'Warm regards,';
    $text[] = 'The My Custom Beats Team';

    $html = '<div style="font-family:Georgia,serif;background:#F8F5F0;padding:24px;color:#0D1B2A;font-size:17px;line-height:1.6;">'
        . '<p style="margin:0 0 16px;">Hi ' . mcb_e($c['first_name']) . ',</p>';
    foreach ($paragraphs as $p) {
        $html .= '<p style="margin:0 0 16px;">' . mcb_e($p) . '</p>';
    }
    if ($button[1] !== null) {
        $html .= '<p style="margin:24px 0;"><a href="' . mcb_e($button[1]) . '" style="display:inline-block;background:#C9A14A;color:#0D1B2A;'
            . 'padding:14px 28px;border-radius:999px;text-decoration:none;font-weight:bold;font-family:Arial,sans-serif;">'
            . mcb_e($button[0]) . '</a></p>';
    }
    if ($type === 'DISPATCHED' && $c['tracking_url'] !== null && $c['status_link'] !== null) {
        $html .= '<p style="margin:0 0 16px;"><a href="' . mcb_e($c['status_link']) . '" style="color:#0D1B2A;">See your order</a></p>';
    }
    $html .= '<p style="margin:0 0 16px;">Your reference: <strong>' . mcb_e($ref) . '</strong></p>'
        . '<p style="margin:0;">Warm regards,<br>The My Custom Beats Team</p></div>';

    return ['subject' => $subject, 'text' => implode("\n", $text), 'html' => $html];
}

/**
 * Sends through Resend. Never throws, never logs the key.
 *
 * @return array{ok:bool, id:?string, code:string}
 */
function resend_send(array $message, string $idempotencyKey): array
{
    $apiKey   = trim((string) mcb_setting('resend.api_key', ''));
    $endpoint = trim((string) mcb_setting('resend.api_url', '')) ?: MCB_RESEND_ENDPOINT;
    if (!function_exists('curl_init')) {
        return ['ok' => false, 'id' => null, 'code' => 'transport_unavailable'];
    }
    $body = json_encode($message, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    if ($body === false) {
        return ['ok' => false, 'id' => null, 'code' => 'encode_failed'];
    }
    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => MCB_NOTIFY_TIMEOUT_SECONDS,
        CURLOPT_CONNECTTIMEOUT => MCB_NOTIFY_TIMEOUT_SECONDS,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            'Idempotency-Key: ' . $idempotencyKey,
        ],
        CURLOPT_POSTFIELDS     => $body,
    ]);
    $response = curl_exec($ch);
    $status   = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($response === false) {
        return ['ok' => false, 'id' => null, 'code' => 'transport'];
    }
    if ($status < 200 || $status >= 300) {
        return ['ok' => false, 'id' => null, 'code' => 'http_' . $status];
    }
    $decoded = json_decode((string) $response, true);
    if (!is_array($decoded) || !is_string($decoded['id'] ?? null) || $decoded['id'] === '') {
        return ['ok' => false, 'id' => null, 'code' => 'no_message_id'];
    }
    return ['ok' => true, 'id' => mb_substr($decoded['id'], 0, 190), 'code' => 'sent'];
}

/**
 * Claims (order, type, key). Returns the row id, or null if it is already
 * sent or being sent. A FAILED row is reclaimed, so a retry can succeed.
 */
function claim_lifecycle_message(PDO $pdo, int $orderId, int $customerId, string $type, string $dedupeKey): ?int
{
    try {
        $pdo->prepare(
            "INSERT INTO customer_communications (order_id, customer_id, message_type, dedupe_key, status, attempted_at)
             VALUES (:oid, :cid, :type, :key, 'CLAIMED', UTC_TIMESTAMP())"
        )->execute([':oid' => $orderId, ':cid' => $customerId, ':type' => $type, ':key' => $dedupeKey]);
        return (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if (!is_duplicate_error($e)) {
            throw $e;
        }
    }
    $stmt = $pdo->prepare(
        "UPDATE customer_communications SET status = 'CLAIMED', attempted_at = UTC_TIMESTAMP(), failure_code = NULL
          WHERE order_id = :oid AND message_type = :type AND dedupe_key = :key AND status = 'FAILED'"
    );
    $stmt->execute([':oid' => $orderId, ':type' => $type, ':key' => $dedupeKey]);
    if ($stmt->rowCount() !== 1) {
        return null;
    }
    $id = $pdo->prepare('SELECT id FROM customer_communications WHERE order_id = :oid AND message_type = :type AND dedupe_key = :key');
    $id->execute([':oid' => $orderId, ':type' => $type, ':key' => $dedupeKey]);
    return (int) $id->fetchColumn();
}

/**
 * Sends one lifecycle message for an order, at most once per dedupe key.
 *
 * @return string sent | already_sent | not_configured | skipped_test_mode | not_eligible | failed
 */
function send_lifecycle_message(PDO $pdo, int $orderId, string $type, string $dedupeKey): string
{
    if (!in_array($type, MCB_LIFECYCLE_TYPES, true) || preg_match('/^[A-Za-z0-9._-]{1,40}$/', $dedupeKey) !== 1) {
        return 'not_eligible';
    }

    try {
        $stmt = $pdo->prepare(
            'SELECT o.id, o.customer_id, o.status, o.fulfilment_type, o.mcb_reference, c.name, c.email,
                    p.carrier, p.tracking_reference, p.tracking_url
               FROM orders o
               JOIN customers c ON c.id = o.customer_id
               LEFT JOIN order_production p ON p.order_id = o.id
              WHERE o.id = :id LIMIT 1'
        );
        $stmt->execute([':id' => $orderId]);
        $order = $stmt->fetch();
        if ($order === false || $order['status'] !== 'PAID' || $order['mcb_reference'] === null
            || filter_var((string) $order['email'], FILTER_VALIDATE_EMAIL) === false) {
            return 'not_eligible';
        }
        $workflow = order_workflow($order);
        if (!in_array($workflow, operations_data()['lifecycle_templates'][$type]['workflows'] ?? [], true)) {
            return 'not_eligible';
        }

        $from = trim((string) mcb_setting('resend.from', ''));
        if (trim((string) mcb_setting('resend.api_key', '')) === '' || $from === '') {
            record_order_event_safely($pdo, $orderId, 'CUSTOMER.MESSAGE.NOT_CONFIGURED', ['type' => $type]);
            return 'not_configured';
        }

        $recipient = (string) $order['email'];
        $testMode  = order_paid_in_test_mode($pdo, $orderId);
        if ($testMode && mcb_setting('resend.test_mode_send_to_customer', false) !== true) {
            $configured = (string) mcb_setting('resend.test_recipient', '');
            if (filter_var($configured, FILTER_VALIDATE_EMAIL) === false) {
                record_order_event_safely($pdo, $orderId, 'CUSTOMER.MESSAGE.SKIPPED_TEST_MODE', ['type' => $type]);
                return 'skipped_test_mode';
            }
            $recipient = $configured;
        }

        $claim = claim_lifecycle_message($pdo, $orderId, (int) $order['customer_id'], $type, $dedupeKey);
        if ($claim === null) {
            return 'already_sent';
        }

        $approvalLink = null;
        if ($type === 'APPROVAL_REQUIRED') {
            $token = active_access_token($pdo, $orderId, 'APPROVAL');
            if ($token === null) {
                $pdo->prepare("UPDATE customer_communications SET status = 'FAILED', failure_code = 'no_approval_link' WHERE id = :id")
                    ->execute([':id' => $claim]);
                record_order_event_safely($pdo, $orderId, 'CUSTOMER.MESSAGE.FAILED', ['type' => $type, 'code' => 'no_approval_link']);
                return 'failed';
            }
            $approvalLink = access_link('APPROVAL', $token);
        }
        $statusLink = access_link('STATUS', ensure_status_token($pdo, $orderId, 'lifecycle-email'));

        $content = lifecycle_message_content($type, [
            'first_name'         => lifecycle_first_name((string) $order['name']),
            'reference'          => (string) $order['mcb_reference'],
            'workflow'           => $workflow,
            'status_link'        => $statusLink,
            'approval_link'      => $approvalLink,
            'carrier'            => $order['carrier'],
            'tracking_reference' => $order['tracking_reference'],
            'tracking_url'       => $order['tracking_url'],
            'test_mode'          => $testMode,
        ]);

        $sent = resend_send([
            'from'     => $from,
            'to'       => [$recipient],
            'subject'  => $content['subject'],
            'html'     => $content['html'],
            'text'     => $content['text'],
            'reply_to' => 'support@mycustombeats.com',
        ], 'mcb-' . ($testMode ? 'test-' : '') . strtolower($type) . '-' . $orderId . '-' . $dedupeKey);

        if (!$sent['ok']) {
            $pdo->prepare("UPDATE customer_communications SET status = 'FAILED', failure_code = :code WHERE id = :id")
                ->execute([':code' => $sent['code'], ':id' => $claim]);
            record_order_event_safely($pdo, $orderId, 'CUSTOMER.MESSAGE.FAILED', ['type' => $type, 'code' => $sent['code']]);
            error_log("MCB lifecycle: {$type} for order {$orderId} not sent ({$sent['code']}).");
            return 'failed';
        }

        mark_communication_sent($pdo, $claim, $sent['id']);
        record_order_event_safely($pdo, $orderId, 'CUSTOMER.MESSAGE.SENT', ['type' => $type, 'test_mode' => $testMode]);
        return 'sent';
    } catch (Throwable $e) {
        error_log("MCB lifecycle: {$type} for order {$orderId} failed: " . $e->getMessage());
        return 'failed';
    }
}

/** Sends the messages an action returned, after its transaction committed. */
function send_lifecycle_messages(PDO $pdo, int $orderId, array $messages): array
{
    $outcomes = [];
    foreach ($messages as [$type, $key]) {
        $outcomes[$type] = send_lifecycle_message($pdo, $orderId, $type, $key);
    }
    return $outcomes;
}
