<?php
/**
 * MCB — lifecycle communications after the sale.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO THINGS MCB ASKS, AND WHEN
 * ─────────────────────────────────────────────────────────────────────────
 * When a commission is complete, MCB may ask what it meant, and whether there
 * is someone else whose story deserves preserving. Both are questions about
 * something the customer HAS. Neither is a question you can ask five minutes
 * after a card clears, which is why none of this hangs off payment.
 *
 * The trigger is `order_production.stage = COMPLETED`. PAID is not enough and
 * is not accepted here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE LEDGER RATHER THAN ANOTHER TIMESTAMP ON `orders`
 * ─────────────────────────────────────────────────────────────────────────
 * `orders.customer_notified_at` means one thing: the payment confirmation has
 * been sent. It stays exactly as it is — that path is live and carries real
 * customers' references. New message types are claimed in
 * `customer_communications` instead, so "what have we sent this person?" has
 * an answer that is not a growing row of booleans.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRANSACTIONAL, NOT MARKETING
 * ─────────────────────────────────────────────────────────────────────────
 * A review request about a purchase the customer just received is about that
 * purchase. It is not a newsletter, and it must not become one. MCB has
 * collected no marketing consent — a purchase is not an opt-in, and neither is
 * accepting terms — so nothing here sends `MARKETING`, and the enum value
 * exists only so that the distinction is written into the schema rather than
 * remembered.
 */

declare(strict_types=1);

/**
 * Claims the right to send one message, atomically.
 *
 * The UNIQUE key on (order_id, message_type) is the whole mechanism: two
 * concurrent senders both insert, one succeeds and one collides. The database
 * decides, not the order the requests happen to arrive in — the same pattern
 * `claim_customer_notification` uses for the payment confirmation.
 *
 * @return int|null the communication row id, or null if already claimed
 */
function claim_communication(
    PDO $pdo,
    int $orderId,
    int $customerId,
    string $messageType
): ?int {
    try {
        $pdo->prepare(
            'INSERT INTO customer_communications (order_id, customer_id, message_type, status)
             VALUES (:oid, :cid, :type, :status)'
        )->execute([
            ':oid'    => $orderId,
            ':cid'    => $customerId,
            ':type'   => $messageType,
            ':status' => 'CLAIMED',
        ]);
        return (int) $pdo->lastInsertId();
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) {
            // Already sent, or already being sent. Either way not ours.
            return null;
        }
        throw $e;
    }
}

/** Marks a claimed message as delivered. */
function mark_communication_sent(PDO $pdo, int $id, ?string $providerMessageId): void
{
    $pdo->prepare(
        "UPDATE customer_communications
            SET status = 'SENT', sent_at = UTC_TIMESTAMP(), provider_message_id = :pid
          WHERE id = :id"
    )->execute([':id' => $id, ':pid' => $providerMessageId]);
}

/**
 * Releases a claim whose delivery failed.
 *
 * DELETED rather than left as FAILED, so the UNIQUE key frees up and a retry
 * can claim it cleanly. A FAILED row that kept the key would mean one provider
 * outage permanently prevented a customer ever being asked — the failure mode
 * the release path on the payment confirmation already exists to avoid.
 *
 * The reason is logged rather than kept: a delivery bookkeeping table does not
 * need a history of provider error strings.
 */
function release_communication(PDO $pdo, int $id, string $failureCode): void
{
    try {
        $pdo->prepare('DELETE FROM customer_communications WHERE id = :id')
            ->execute([':id' => $id]);
        error_log("MCB lifecycle: communication {$id} released after {$failureCode}.");
    } catch (PDOException $e) {
        error_log('MCB lifecycle: could not release communication '
            . $id . ': ' . $e->getMessage());
    }
}

/**
 * Everything a lifecycle message needs, or null if this order is not eligible.
 *
 * ELIGIBILITY IS CHECKED HERE, NOT AT THE CALL SITE, so every future message
 * type inherits the same rule rather than each one re-deciding what
 * "completed" means:
 *
 *   • the order is PAID — Stripe said so;
 *   • its production stage is COMPLETED — a person said so;
 *   • there is an email address to write to.
 *
 * @return array{order_id:int,customer_id:int,email:string,name:string,
 *               reference:?string,package:string,referral_code:?string}|null
 */
function lifecycle_recipient(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare(
        'SELECT o.id, o.customer_id, o.mcb_reference, o.package, o.status,
                p.stage, p.completed_at,
                c.name AS customer_name, c.email AS customer_email,
                cr.code AS referral_code
           FROM orders o
           JOIN customers c ON c.id = o.customer_id
           LEFT JOIN order_production p ON p.order_id = o.id
           LEFT JOIN customer_referrals cr ON cr.customer_id = o.customer_id
                                          AND cr.revoked_at IS NULL
          WHERE o.id = :id
          LIMIT 1'
    );
    $stmt->execute([':id' => $orderId]);
    $row = $stmt->fetch();

    if ($row === false) {
        return null;
    }
    if (($row['status'] ?? '') !== 'PAID') {
        return null;
    }
    if (($row['stage'] ?? '') !== 'COMPLETED') {
        return null;
    }
    if (($row['customer_email'] ?? '') === '') {
        return null;
    }

    return [
        'order_id'      => (int) $row['id'],
        'customer_id'   => (int) $row['customer_id'],
        'email'         => (string) $row['customer_email'],
        'name'          => (string) $row['customer_name'],
        'reference'     => $row['mcb_reference'],
        'package'       => (string) $row['package'],
        'referral_code' => $row['referral_code'],
    ];
}

/* ------------------------------------------------------------------ */
/* The review request                                                  */
/* ------------------------------------------------------------------ */

/**
 * The review URL, from configuration.
 *
 * NOT hard-coded, and not invented. No Trustpilot URL exists anywhere in this
 * repository, and writing a plausible one would send customers to a page that
 * may not be MCB's. Absent configuration, the request is skipped and logged —
 * exactly how the Resend integration behaves when it is unconfigured.
 */
function review_url(): ?string
{
    $url = trim((string) mcb_setting('reviews.url', ''));
    if ($url === '') {
        return null;
    }
    // Only http(s), so a misconfiguration cannot become a javascript: or
    // data: link in a customer's inbox.
    if (!preg_match('#^https?://#i', $url)) {
        error_log('MCB lifecycle: reviews.url is not an http(s) URL; skipping.');
        return null;
    }
    return $url;
}

/**
 * The subject and body of the review request.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS COPY DELIBERATELY DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────
 * It does not ask for five stars, does not ask for a positive review, offers
 * nothing in exchange, and does not screen the customer first to decide who
 * gets the public link. Sending happy customers to a review site and unhappy
 * ones to a private form is review gating: it manufactures a rating rather
 * than collecting one, and MCB's testimonials are worth more than that.
 *
 * Every completed order gets the same message and the same link. If someone is
 * disappointed, MCB would rather hear it.
 */
function review_request_email(array $recipient, string $reviewUrl): array
{
    $name      = mcb_e($recipient['name']);
    $reference = $recipient['reference'] === null
        ? ''
        : '<p style="margin:0 0 16px;color:#0D1B2A;">Your reference: <strong>'
          . mcb_e((string) $recipient['reference']) . '</strong></p>';

    $text = implode("\n", array_filter([
        'Hi ' . $recipient['name'] . ',',
        '',
        'Your My Custom Beats memory is complete.',
        '',
        $recipient['reference'] === null
            ? null
            : 'Your reference: ' . $recipient['reference'],
        $recipient['reference'] === null ? null : '',
        'We would love to know what it meant to you — whatever that turns out '
        . 'to be. If something was not right, we would rather hear it from you '
        . 'than not hear it at all.',
        '',
        $reviewUrl,
        '',
        'Thank you for trusting us with your story.',
        '',
        'The My Custom Beats Team',
        'Memories Crafted Beautifully',
    ], static fn ($line) => $line !== null));

    $safeUrl = mcb_e($reviewUrl);

    $html = <<<HTML
<div style="margin:0;padding:24px;background:#F8F5F0;font-family:Helvetica,Arial,sans-serif;color:#0D1B2A;line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <p style="margin:0 0 16px;">Hi {$name},</p>
    <p style="margin:0 0 16px;">Your My Custom Beats memory is complete.</p>
    {$reference}
    <p style="margin:0 0 24px;">
      We would love to know what it meant to you &mdash; whatever that turns
      out to be. If something was not right, we would rather hear it from you
      than not hear it at all.
    </p>
    <p style="margin:0 0 24px;">
      <a href="{$safeUrl}" style="display:inline-block;padding:12px 24px;background:#0D1B2A;color:#F8F5F0;border-radius:999px;text-decoration:none;">Share your thoughts</a>
    </p>
    <p style="margin:24px 0 0;">Thank you for trusting us with your story.</p>
    <p style="margin:24px 0 0;"><strong>The My Custom Beats Team</strong></p>
    <p style="margin:4px 0 0;color:#C9A14A;font-size:13px;">Memories Crafted Beautifully&trade;</p>
  </div>
</div>
HTML;

    return [
        'subject' => 'Your My Custom Beats memory',
        'text'    => $text,
        'html'    => $html,
    ];
}

/**
 * Sends the review request for one completed order.
 *
 * NEVER THROWS, and a failure here changes nothing about the order. The work
 * is complete whether or not MCB managed to ask about it, and a provider
 * outage must not be able to reopen a finished commission.
 *
 * @return string one of: sent, already_sent, not_eligible, not_configured, failed
 */
function send_review_request(PDO $pdo, int $orderId): string
{
    $recipient = lifecycle_recipient($pdo, $orderId);
    if ($recipient === null) {
        return 'not_eligible';
    }

    $url = review_url();
    if ($url === null) {
        return 'not_configured';
    }

    $claimId = claim_communication(
        $pdo,
        $recipient['order_id'],
        $recipient['customer_id'],
        'REVIEW_REQUEST'
    );
    if ($claimId === null) {
        return 'already_sent';
    }

    $apiKey = trim((string) mcb_setting('resend.api_key', ''));
    $from   = trim((string) mcb_setting('resend.from', ''));

    if ($apiKey === '' || $from === '') {
        release_communication($pdo, $claimId, 'resend_unconfigured');
        return 'not_configured';
    }

    $message = review_request_email($recipient, $url);

    $payload = [
        'from'     => $from,
        // FROM THE ORDER, never from the request. A caller naming a recipient
        // could use MCB's mail reputation to send to anyone.
        'to'       => [$recipient['email']],
        'subject'  => $message['subject'],
        'html'     => $message['html'],
        'text'     => $message['text'],
        'reply_to' => 'support@mycustombeats.com',
    ];

    $endpoint = trim((string) mcb_setting('resend.api_url', '')) ?: MCB_RESEND_ENDPOINT;

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_HTTPHEADER     => [
            'Authorization: Bearer ' . $apiKey,
            'Content-Type: application/json',
            // Derived from the order and the message type, so a retry of the
            // same request cannot produce a second email at the provider even
            // if the claim were somehow released between attempts.
            'Idempotency-Key: mcb-review-' . $recipient['order_id'],
        ],
        CURLOPT_POSTFIELDS     => json_encode($payload, JSON_UNESCAPED_SLASHES),
    ]);

    $response = curl_exec($ch);
    $status   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($response === false || $status < 200 || $status >= 300) {
        // The key is never logged, echoed or returned — treated exactly like
        // the Stripe secret.
        error_log("MCB lifecycle: review request for order {$orderId} failed with HTTP {$status}.");
        release_communication($pdo, $claimId, 'http_' . $status);
        return 'failed';
    }

    $decoded   = json_decode((string) $response, true);
    $messageId = is_array($decoded) ? ($decoded['id'] ?? null) : null;

    mark_communication_sent(
        $pdo,
        $claimId,
        is_string($messageId) ? mb_substr($messageId, 0, 190) : null
    );

    return 'sent';
}
