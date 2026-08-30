<?php
/**
 * POST /api/affiliate/register — create an affiliate.
 *
 * The duplicate check and the insert are ONE statement against UNIQUE
 * constraints. There is deliberately no /check endpoint: the old design read
 * the table from the browser, decided in JavaScript, then inserted — so two
 * people submitting the same username seconds apart both passed and both
 * inserted. Here the database is the only arbiter, and a collision surfaces
 * as a 409.
 *
 * Returns a dashboard token. Only its SHA-256 is stored, so the database
 * cannot be used to impersonate an affiliate.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('POST');
require_same_origin();

$body = read_json_body();
$v    = new Validator($body);

$name     = $v->required('name', 'Your name', 160);
$email    = $v->email('email');
$username = $v->username('username');

$v->stopIfInvalid();

// Registration is cheap to attempt and expensive to abuse; cap it per IP.
$ipHash = hash_ip(client_ip());
enforce_rate_limit('clicks', 'ip_hash', $ipHash, 60, 3600);

$siteOrigin   = rtrim((string) mcb_setting('app.site_origin', ''), '/');
$referralLink = $siteOrigin . '/?ref=' . $username;
$expiresAt    = (new DateTimeImmutable('+30 days'))->format('Y-m-d H:i:s');

try {
    $result = db_transaction(function (PDO $pdo) use ($name, $email, $username, $referralLink, $expiresAt): array {
        $stmt = $pdo->prepare(
            'INSERT INTO affiliates (name, email, username, referral_link, clicks, sales, expires_at)
             VALUES (:name, :email, :username, :link, 0, 0, :expires)'
        );
        $stmt->execute([
            ':name'     => $name,
            ':email'    => $email,
            ':username' => $username,
            ':link'     => $referralLink,
            ':expires'  => $expiresAt,
        ]);

        $affiliateId = (int) $pdo->lastInsertId();

        // Issue the token inside the transaction so an affiliate can never
        // exist without a way to reach their dashboard.
        $token = issue_dashboard_token($affiliateId);
        $pdo->prepare('UPDATE affiliates SET dashboard_token_hash = :h WHERE id = :id')
            ->execute([':h' => $token['hash'], ':id' => $affiliateId]);

        return ['id' => $affiliateId, 'token' => $token['token']];
    });
} catch (PDOException $e) {
    if (is_duplicate_error($e)) {
        // Which field collided is not disclosed: telling an anonymous caller
        // "that email is registered" turns the endpoint into a way to test
        // whether someone is an MCB affiliate.
        json_error(409, 'already_registered',
            'That email or referral name is already registered. Please try another.');
    }
    error_log('MCB CRM affiliate register failed: ' . $e->getMessage());
    json_error(500, 'register_failed', 'We could not complete your registration. Please try again.');
}

json_response(201, [
    'affiliate_id'   => $result['id'],
    'username'       => $username,
    'referral_link'  => $referralLink,
    // The caller emails this to the affiliate and stores it locally. It is
    // the only credential; it is not recoverable from the database.
    'dashboard_token' => $result['token'],
]);
