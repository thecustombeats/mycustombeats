<?php
/**
 * MCB CRM — shared bootstrap.
 *
 * Every endpoint starts with `require_once __DIR__ . '/../lib/bootstrap.php';`
 * and gets configuration, the database handle, JSON I/O, validation and the
 * security helpers from here. Nothing below emits output on its own.
 */

declare(strict_types=1);

// Errors are logged, never printed: a stack trace in a JSON response leaks
// file paths and query fragments to anyone who can trigger an exception.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
error_reporting(E_ALL);

date_default_timezone_set('UTC');

require_once __DIR__ . '/http.php';
require_once __DIR__ . '/validate.php';
require_once __DIR__ . '/security.php';
require_once __DIR__ . '/packages.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/reference.php';
require_once __DIR__ . '/reconciliation.php';
require_once __DIR__ . '/notify.php';
require_once __DIR__ . '/stripe.php';

/**
 * Loads configuration, preferring a location outside the web root.
 *
 * Shared hosting varies: some accounts allow writing above public_html,
 * some do not. Rather than force one layout, look above the web root first
 * and fall back to the api directory, which .htaccess denies over HTTP.
 */
function mcb_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }

    // Hostinger uses more than one directory layout — some accounts serve
    // from ~/public_html, others from ~/domains/<site>/public_html — so a
    // fixed depth cannot find the file on both. Walk up from api/lib looking
    // for a specifically named file instead, which is layout-independent.
    //
    // Bounded to six levels: enough to clear any shared-hosting web root,
    // short of wandering into the filesystem root.
    $candidates = [];
    for ($depth = 2; $depth <= 6; $depth++) {
        $candidates[] = dirname(__DIR__, $depth) . '/mcb-config.php';
    }
    // Last resort: inside the web root, denied over HTTP by .htaccess.
    // Works everywhere, but must be recreated after a deploy that clears api/.
    $candidates[] = __DIR__ . '/../config.php';

    foreach ($candidates as $path) {
        if (is_readable($path)) {
            /** @var array $loaded */
            $loaded = require $path;
            if (is_array($loaded)) {
                $config = $loaded;
                return $config;
            }
        }
    }

    // Configuration missing is an operator error, not a client error, and
    // the client must not be told where the file was looked for.
    error_log('MCB CRM: no readable config found. Copy api/config.example.php.');
    json_error(503, 'service_unavailable', 'The service is not configured yet.');
}

/** Convenience accessor: mcb_setting('app.debug', false) */
function mcb_setting(string $path, mixed $default = null): mixed
{
    $value = mcb_config();
    foreach (explode('.', $path) as $key) {
        if (!is_array($value) || !array_key_exists($key, $value)) {
            return $default;
        }
        $value = $value[$key];
    }
    return $value;
}
