<?php
/**
 * MCB CRM — request and response helpers.
 *
 * Responses are JSON, minimal by design. An endpoint returns what the caller
 * legitimately needs and nothing more; PII is never echoed back "for
 * convenience".
 */

declare(strict_types=1);

/** Sends a JSON response and stops. */
function json_response(int $status, array $payload): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    // These endpoints are data, never a page; nothing should frame or sniff them.
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Sends a structured error and stops.
 *
 * `code` is a stable machine token the client can branch on; `message` is
 * safe to show a customer. Never put internal detail in either.
 */
function json_error(int $status, string $code, string $message, array $extra = []): never
{
    json_response($status, ['error' => $code, 'message' => $message] + $extra);
}

/** Rejects anything that is not the expected HTTP method. */
function require_method(string $method): void
{
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        header('Allow: ' . $method);
        json_error(405, 'method_not_allowed', 'Unsupported request method.');
    }
}

/**
 * Reads and decodes a JSON request body.
 *
 * Bounded before parsing: an unbounded body is a trivial memory exhaustion
 * vector on shared hosting.
 */
function read_json_body(int $maxBytes = 262144): array
{
    $length = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($length > $maxBytes) {
        json_error(413, 'payload_too_large', 'That submission is too large.');
    }

    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || $raw === '') {
        json_error(400, 'empty_body', 'No data was received.');
    }
    if (strlen($raw) > $maxBytes) {
        json_error(413, 'payload_too_large', 'That submission is too large.');
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        json_error(400, 'invalid_json', 'The request could not be read.');
    }
    return $data;
}

/**
 * Same-origin guard for state-changing requests.
 *
 * Browsers always send Origin on cross-origin POSTs, so a mismatch is a
 * reliable rejection signal. A missing Origin is allowed: same-origin form
 * posts and server-to-server callers legitimately omit it, and the endpoints
 * that genuinely need stronger proof carry a token as well.
 */
function require_same_origin(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin === '') {
        return;
    }
    $allowed = (string) mcb_setting('app.site_origin', '');
    if ($allowed !== '' && rtrim($origin, '/') !== rtrim($allowed, '/')) {
        json_error(403, 'forbidden_origin', 'This request was rejected.');
    }
}

/** Client IP, honouring the proxy header LiteSpeed sets when present. */
function client_ip(): string
{
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_FORWARDED_FOR', 'REMOTE_ADDR'] as $key) {
        $value = $_SERVER[$key] ?? '';
        if ($value !== '') {
            // X-Forwarded-For may be a chain; the client is the first entry.
            $first = trim(explode(',', $value)[0]);
            if (filter_var($first, FILTER_VALIDATE_IP)) {
                return $first;
            }
        }
    }
    return '0.0.0.0';
}

/** Truncated user agent, safe for a VARCHAR(255) column. */
function client_user_agent(): ?string
{
    $ua = trim((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''));
    return $ua === '' ? null : mb_substr($ua, 0, 255);
}
