<?php
/**
 * POST /api/order-progress — the customer's private order page.
 *
 * REQUEST  { token }   the STATUS link token, from the page's URL fragment.
 *
 * There is no lookup by MCB reference, email or order number: a reference is
 * printed on emails and packaging and is not a secret, so it cannot be what
 * unlocks an order. Unknown, expired and revoked links get the same 404.
 * See lib/customer-progress.php for what the response may contain.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/customer-progress.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('progress', 60, 600);

$body  = read_json_body(4096);
$pdo   = db();
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Reply to any of our emails, or contact us, and we will send you a new one.');
}

json_response(200, customer_progress($pdo, (int) $token['order_id']));
