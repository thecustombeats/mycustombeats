<?php
/**
 * GET /api/order-reference?session_id=cs_… — the customer's own reference.
 *
 * The one endpoint that hands a reference number to a browser, and it can
 * only hand over the reference belonging to the checkout session in the
 * caller's own address bar.
 *
 * WHY THIS EXISTS
 * The reference is issued by the Stripe webhook, server to server. The
 * customer meanwhile is redirected straight to /thank-you. Those two arrivals
 * race, and the redirect usually wins. So the thank-you page asks for the
 * reference by the session id Stripe put in its own success URL, and retries
 * for a few seconds while the webhook lands.
 *
 * WHY THE SESSION ID IS THE KEY
 * It is issued by Stripe, unguessable, and known only to Stripe, MCB and the
 * person who just completed that checkout. Keying on orders.id instead would
 * be an enumeration hole: /api/order-reference?order_id=41 would walk the
 * whole book. `cs_live_…` carries far too much entropy to walk.
 *
 * WHAT IT WILL NEVER RETURN
 * No name, email, address, brief, amount or Stripe identifier. Only whether
 * this session is recorded as paid, and if so, its reference. A leaked
 * session id therefore leaks a reference and nothing else.
 *
 * Deliberately NOT named /api/order/reference: a directory at api/order/
 * would make `/api/order` a real directory, and the clean-URL rewrite skips
 * real directories — which would silently break order submission.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('GET');

$sessionId = trim((string) ($_GET['session_id'] ?? ''));

// Shape-checked before it reaches the database. Stripe session ids are
// `cs_` followed by live/test alphanumerics; anything else is not a question
// worth asking of the orders table.
if ($sessionId === '' || !preg_match('/^cs_[A-Za-z0-9_]{8,250}$/', $sessionId)) {
    json_error(400, 'invalid_session', 'That order reference could not be looked up.');
}

$stmt = db()->prepare(
    'SELECT status, mcb_reference FROM orders WHERE stripe_session_id = :sid LIMIT 1'
);
$stmt->execute([':sid' => $sessionId]);
$order = $stmt->fetch();

// Not found is the normal answer in the first seconds after payment: the
// webhook has not landed yet. 200 with reference:null, so the page can retry
// without treating an expected race as an error.
if ($order === false) {
    json_response(200, ['status' => null, 'reference' => null]);
}

json_response(200, [
    'status'    => $order['status'],
    'reference' => $order['mcb_reference'],
]);
