<?php
/**
 * POST /api/affiliate/click — record a referral arrival.
 *
 * Replaces three browser round-trips (resolve username, insert click,
 * increment counter) with one server-side operation. The browser sends only
 * the ref string it saw; the server resolves it, and an unknown ref is a
 * silent no-op rather than an error — a mistyped link is not worth telling a
 * visitor about, and a 404 here would let anyone enumerate usernames.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('POST');
require_same_origin();

$body = read_json_body(4096);

$raw      = trim((string) ($body['ref'] ?? ''));
$username = mb_substr(preg_replace('/[^a-z0-9]/', '', mb_strtolower($raw)) ?? '', 0, 64);

if ($username === '') {
    json_response(204, []);
}

$ipHash = hash_ip(client_ip());

// A referral link shared on social media legitimately produces bursts, so the
// window is generous — this stops counter inflation, not real traffic.
enforce_rate_limit('clicks', 'ip_hash', $ipHash, 30, 3600);

try {
    db_transaction(function (PDO $pdo) use ($username, $ipHash): void {
        $stmt = $pdo->prepare('SELECT id FROM affiliates WHERE username = :u LIMIT 1');
        $stmt->execute([':u' => $username]);
        $affiliateId = $stmt->fetchColumn();

        if ($affiliateId === false) {
            return;   // unknown ref — recorded nowhere, reported as success
        }
        $affiliateId = (int) $affiliateId;

        $pdo->prepare(
            'INSERT INTO clicks (affiliate_id, username, user_agent, ip_hash)
             VALUES (:aid, :u, :ua, :ip)'
        )->execute([
            ':aid' => $affiliateId,
            ':u'   => $username,
            ':ua'  => client_user_agent(),
            ':ip'  => $ipHash,
        ]);

        // Incremented in SQL rather than read-modify-write, so concurrent
        // clicks cannot lose count.
        $pdo->prepare('UPDATE affiliates SET clicks = clicks + 1 WHERE id = :id')
            ->execute([':id' => $affiliateId]);
    });
} catch (PDOException $e) {
    // A click that fails to record must never interrupt the visitor.
    error_log('MCB CRM click failed: ' . $e->getMessage());
}

json_response(204, []);
