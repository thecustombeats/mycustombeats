<?php
/**
 * POST /api/order-status — the customer's own saved order, and whether it can
 * be paid.
 *
 * REQUEST  { orderId, checkoutToken }   (POST, so the token stays out of URLs
 *                                        and access logs)
 *
 * Used by /create after saving and uploading, and when a customer returns from
 * a cancelled Stripe checkout. A wrong token and an unknown order both get the
 * same 404, and the response carries no story, contact detail, address or
 * upload identifier — see lib/order-summary.php.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('POST');
require_same_origin();

$body = read_json_body(4096);
$order = find_order_by_token(db(), $body['orderId'] ?? null, $body['checkoutToken'] ?? null);
if ($order === null) {
    json_error(404, 'order_not_found', 'We could not find that order.');
}

json_response(200, order_public_summary(db(), $order));
