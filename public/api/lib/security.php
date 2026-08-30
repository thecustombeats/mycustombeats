<?php
/**
 * MCB CRM — security helpers.
 *
 * Deliberately small. Shared hosting rewards code an operator can read in
 * one sitting over a framework nobody audits.
 */

declare(strict_types=1);

/**
 * Salted hash of a visitor IP.
 *
 * Raw addresses are never stored. The salt lives in configuration, so the
 * hashes are useless outside this deployment.
 */
function hash_ip(string $ip): string
{
    return hash_hmac('sha256', $ip, (string) mcb_setting('ip_salt', ''));
}

/**
 * Fixed-window rate limit, counted in the database.
 *
 * No APCu or Redis on shared hosting, and a file-based counter races across
 * PHP workers. Counting rows we already write is both accurate and free.
 *
 * @param string $table  table holding the events
 * @param string $column column storing the ip hash
 */
function enforce_rate_limit(string $table, string $column, string $ipHash, int $max, int $windowSeconds): void
{
    // $table and $column are literals from calling code, never request data.
    $sql = "SELECT COUNT(*) FROM `$table`
             WHERE `$column` = :h
               AND created_at > (UTC_TIMESTAMP() - INTERVAL :secs SECOND)";
    $stmt = db()->prepare($sql);
    $stmt->bindValue(':h', $ipHash);
    $stmt->bindValue(':secs', $windowSeconds, PDO::PARAM_INT);
    $stmt->execute();

    if ((int) $stmt->fetchColumn() >= $max) {
        header('Retry-After: ' . $windowSeconds);
        json_error(429, 'rate_limited', 'Too many requests. Please try again shortly.');
    }
}

/**
 * Issues an affiliate dashboard token.
 *
 * Format: <affiliate_id>.<expiry>.<hmac>
 *
 * Self-describing and stateless to verify, but only the SHA-256 of the whole
 * token is stored — so a database leak yields nothing replayable. Replaces
 * the previous scheme, where possession of someone's email address was
 * treated as proof of identity.
 *
 * @return array{token:string,hash:string}
 */
function issue_dashboard_token(int $affiliateId): array
{
    $ttlDays = (int) mcb_setting('app.token_ttl_days', 90);
    $expires = time() + ($ttlDays * 86400);
    $payload = $affiliateId . '.' . $expires;
    $sig     = hash_hmac('sha256', $payload, (string) mcb_setting('token_secret', ''));
    $token   = $payload . '.' . $sig;

    return ['token' => $token, 'hash' => hash('sha256', $token)];
}

/**
 * Verifies a dashboard token and returns the affiliate id, or null.
 *
 * Checks the signature before the expiry so a tampered token is rejected on
 * its own merits, and compares with hash_equals to avoid leaking through
 * timing.
 */
function verify_dashboard_token(string $token): ?int
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }
    [$id, $expires, $sig] = $parts;

    if (!ctype_digit($id) || !ctype_digit($expires)) {
        return null;
    }

    $expected = hash_hmac('sha256', $id . '.' . $expires, (string) mcb_setting('token_secret', ''));
    if (!hash_equals($expected, $sig)) {
        return null;
    }
    if ((int) $expires < time()) {
        return null;
    }
    return (int) $id;
}

/**
 * Reads a bearer token from the Authorization header.
 *
 * Apache does not place this header in $_SERVER by default — verified: under
 * mod_php it is absent from HTTP_AUTHORIZATION and only visible through
 * getallheaders(). CGI and FastCGI setups instead expose it as
 * REDIRECT_HTTP_AUTHORIZATION, and only when .htaccess forwards it.
 *
 * All three are checked, because which one is populated depends on how the
 * host runs PHP, and that is not something MCB controls.
 */
function bearer_token(): ?string
{
    $candidates = [
        $_SERVER['HTTP_AUTHORIZATION'] ?? '',
        $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '',
    ];

    if (function_exists('getallheaders')) {
        foreach (getallheaders() as $name => $value) {
            if (strcasecmp($name, 'Authorization') === 0) {
                $candidates[] = $value;
            }
        }
    }

    foreach ($candidates as $header) {
        if (preg_match('/^Bearer\s+(.+)$/i', trim((string) $header), $m)) {
            return trim($m[1]);
        }
    }
    return null;
}

/**
 * Guards the CRM read surface with a shared key.
 *
 * For a server-to-server endpoint with a single consumer, a long random key
 * compared in constant time is the right weight of solution. If MCB OS later
 * needs per-consumer access, this becomes a keys table without changing the
 * calling convention.
 */
function require_crm_key(): void
{
    $expected = (string) mcb_setting('crm_api_key', '');
    $given    = bearer_token() ?? '';

    if ($expected === '' || $given === '' || !hash_equals($expected, $given)) {
        header('WWW-Authenticate: Bearer');
        json_error(401, 'unauthorized', 'Authentication required.');
    }
}
