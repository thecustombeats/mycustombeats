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
 * Fixed-window rate limit for endpoints that otherwise write nothing.
 *
 * Reading a progress page or answering an approval link leaves no row to
 * count, so each attempt is recorded in `rate_limit_hits` first and then
 * counted. `$scope` is a literal from calling code. Rows older than a day are
 * pruned occasionally; they exist only to be counted.
 */
function enforce_scoped_rate_limit(string $scope, int $max, int $windowSeconds): void
{
    $ipHash = hash_ip(client_ip());
    $pdo    = db();

    try {
        $pdo->prepare('INSERT INTO rate_limit_hits (scope, ip_hash, created_at) VALUES (:s, :h, UTC_TIMESTAMP())')
            ->execute([':s' => $scope, ':h' => $ipHash]);

        if (random_int(1, 100) === 1) {
            $pdo->exec('DELETE FROM rate_limit_hits WHERE created_at < (UTC_TIMESTAMP() - INTERVAL 1 DAY)');
        }

        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM rate_limit_hits
              WHERE scope = :s AND ip_hash = :h
                AND created_at > (UTC_TIMESTAMP() - INTERVAL :secs SECOND)'
        );
        $stmt->bindValue(':s', $scope);
        $stmt->bindValue(':h', $ipHash);
        $stmt->bindValue(':secs', $windowSeconds, PDO::PARAM_INT);
        $stmt->execute();
        $count = (int) $stmt->fetchColumn();
    } catch (PDOException $e) {
        // A database without the Sprint 5 migration must not take checkout
        // down with it. Preflight reports the missing table.
        error_log('MCB: rate limit unavailable for ' . $scope . ': ' . $e->getMessage());
        return;
    }

    if ($count > $max) {
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
/**
 * Failed staff-key attempts are counted per (hashed) address: after 100 in ten
 * minutes the address is refused with 429 until the window passes. The key is
 * long and random, so this only slows automated guessing and noise.
 */
function crm_key_failure_throttle(): void
{
    try {
        $pdo = db();
        $ipHash = hash_ip(client_ip());
        $pdo->prepare("INSERT INTO rate_limit_hits (scope, ip_hash, created_at) VALUES ('crm-auth-failure', :h, UTC_TIMESTAMP())")->execute([':h' => $ipHash]);
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM rate_limit_hits WHERE scope = 'crm-auth-failure' AND ip_hash = :h AND created_at > (UTC_TIMESTAMP() - INTERVAL 600 SECOND)");
        $stmt->execute([':h' => $ipHash]);
        if ((int) $stmt->fetchColumn() > 100) {
            header('Retry-After: 600');
            json_error(429, 'rate_limited', 'Too many attempts. Please wait and try again.');
        }
    } catch (PDOException $e) {
        error_log('MCB security: could not record a failed staff key attempt: ' . $e->getMessage());
    }
}

/**
 * INDIVIDUAL STAFF ACCOUNTABILITY.
 *
 * Every staff endpoint records who did the thing — but until this sprint that
 * "who" was a free-text field the caller typed. One shared key opened every
 * door, so anyone holding it could sign an action with any name, including a
 * colleague's. The trail reliably recorded WHAT happened and that THE KEY was
 * used; it could not honestly say WHICH PERSON did it.
 *
 * A per-staff key closes that without a login page, a session table or a new
 * public attack surface. Each person gets their own long random key, stored on
 * the host as a bcrypt hash exactly like the founders' authorisation codes, and
 * the name attached to every action comes from the key that opened the door
 * rather than from the request body.
 *
 * Configure in the host config file, never in this repository:
 *
 *   'staff_keys' => [
 *       'bella' => ['name' => 'Bella',  'key_hash' => '$2y$...'],
 *       'lewis' => ['name' => 'Lewis',  'key_hash' => '$2y$...'],
 *   ],
 *
 * The shared `crm_api_key` still works, so nothing breaks the day this ships
 * and a host can migrate one person at a time. While it is the only thing
 * configured, readiness reports SHARED_KEY_ONLY and says the trail cannot
 * attribute an action to a person.
 *
 * FOUNDER FINANCIAL AUTHORITY IS UNCHANGED AND STILL SEPARATE. A staff key —
 * shared or individual — authorises no spending. Money still needs Bella's or
 * Lewis's own code (lib/operations.php), which is a different secret checked a
 * different way.
 */
function staff_key_identity(string $given): ?array
{
    $configured = mcb_setting('staff_keys', null);
    if (!is_array($configured)) {
        return null;
    }
    foreach ($configured as $id => $entry) {
        $hash = is_array($entry) ? (string) ($entry['key_hash'] ?? '') : '';
        if ($hash === '' || !password_verify($given, $hash)) {
            continue;
        }
        $name = is_array($entry) ? trim((string) ($entry['name'] ?? '')) : '';
        return ['id' => (string) $id, 'name' => $name !== '' ? $name : (string) $id];
    }
    return null;
}

/** The staff member this request authenticated as, or null on the shared key. */
function crm_staff_identity(): ?array
{
    static $identity = null;
    if ($identity === null) {
        $identity = $GLOBALS['mcb_staff_identity'] ?? false;
    }
    return is_array($identity) ? $identity : null;
}

/**
 * The name to record for this action.
 *
 * An authenticated individual key wins over anything the request says, so a
 * signed-in person cannot file an action under someone else's name. On the
 * shared key the declared name is all MCB has, and is used as before.
 */
function crm_staff_name(?string $declared): ?string
{
    $identity = crm_staff_identity();
    return $identity !== null ? $identity['name'] : $declared;
}

/** How staff access is configured, for the readiness views. Never a key or a hash. */
function staff_authentication_readiness(): array
{
    $configured = mcb_setting('staff_keys', null);
    $individual = [];
    if (is_array($configured)) {
        foreach ($configured as $id => $entry) {
            if (is_array($entry) && is_string($entry['key_hash'] ?? null) && $entry['key_hash'] !== '') {
                $individual[] = (string) $id;
            }
        }
    }
    $shared = ((string) mcb_setting('crm_api_key', '')) !== '';
    if ($individual !== []) {
        return [
            'state' => 'INDIVIDUAL_KEYS_CONFIGURED',
            'individual_accounts' => count($individual),
            'shared_key_still_accepted' => $shared,
            'attribution' => 'An action records the person whose key opened it.',
            'required_action' => $shared
                ? 'Retire the shared staff key once every person has their own, so an action can always be attributed.'
                : null,
        ];
    }
    return [
        'state' => $shared ? 'SHARED_KEY_ONLY' : 'NOT_CONFIGURED',
        'individual_accounts' => 0,
        'shared_key_still_accepted' => $shared,
        'attribution' => 'One shared key. The trail records the name a person typed, which MCB cannot verify.',
        'required_action' => 'Give each person their own staff key (staff_keys in the host config), or put host authentication in front of the Command Centre. Rotate the shared key on any staff change.',
    ];
}

function require_crm_key(): void
{
    $expected = (string) mcb_setting('crm_api_key', '');
    $given    = bearer_token() ?? '';

    $identity = $given === '' ? null : staff_key_identity($given);
    $sharedOk = $expected !== '' && $given !== '' && hash_equals($expected, $given);

    if ($identity === null && !$sharedOk) {
        crm_key_failure_throttle();
        header('WWW-Authenticate: Bearer');
        json_error(401, 'unauthorized', 'Authentication required.');
    }
    $GLOBALS['mcb_staff_identity'] = $identity ?? false;
    mcb_event_source('STAFF');
}
