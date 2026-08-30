<?php
/**
 * GET /api/affiliate/dashboard — an affiliate's own statistics.
 *
 * Authenticated by a signed, expiring token in the Authorization header.
 *
 * The endpoint does not accept an email address, by design. The previous
 * implementation looked up whatever email sat in localStorage, so anyone who
 * knew an affiliate's address could read their record.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');

$token = bearer_token();
if ($token === null) {
    header('WWW-Authenticate: Bearer');
    json_error(401, 'unauthorized', 'Sign in from the link we emailed you.');
}

$affiliateId = verify_dashboard_token($token);
if ($affiliateId === null) {
    json_error(401, 'invalid_token', 'That link has expired. Please request a new one.');
}

// The signature proves the token was issued by us; comparing the stored hash
// proves it is still the current one, so a superseded token stops working.
$stmt = db()->prepare(
    'SELECT id, name, email, username, referral_link, clicks, sales, dashboard_token_hash, created_at
       FROM affiliates WHERE id = :id LIMIT 1'
);
$stmt->execute([':id' => $affiliateId]);
$affiliate = $stmt->fetch();

if ($affiliate === false || !hash_equals((string) $affiliate['dashboard_token_hash'], hash('sha256', $token))) {
    json_error(401, 'invalid_token', 'That link is no longer valid. Please request a new one.');
}

// Returns this affiliate's own record only. No customer PII, no order detail,
// no other affiliate is reachable from here.
json_response(200, [
    'name'          => $affiliate['name'],
    'email'         => $affiliate['email'],
    'username'      => $affiliate['username'],
    'referral_link' => $affiliate['referral_link'],
    'clicks'        => (int) $affiliate['clicks'],
    'sales'         => (int) $affiliate['sales'],
    'member_since'  => $affiliate['created_at'],
]);
