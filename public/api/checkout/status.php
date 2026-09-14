<?php
/**
 * GET /api/checkout/status — can this site take payment, and in which mode?
 *
 * RESPONSE { online_checkout: bool, mode: "test" | "live" | null }
 *
 * THE BROWSER'S ONLY SOURCE FOR THIS. There is no client-side switch that can
 * turn payment on: the /create page asks here and shows what the server says.
 * `mode: "test"` lets the page say plainly that no real money will be taken.
 * Nothing about keys or configuration is disclosed.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');

$availability = stripe_checkout_availability();

json_response(200, [
    'online_checkout' => $availability['available'],
    'mode'            => $availability['mode'],
]);
