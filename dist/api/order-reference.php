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
 * this session is recorded as paid, its reference, where the work has got to,
 * and — once the commission is complete — the caller's OWN referral code,
 * which is a public string meant to be shared and says nothing about them.
 * A leaked session id therefore leaks a reference and a share link, and
 * nothing else.
 *
 * WHY THE LIFECYCLE STAGE IS HERE
 * The thank-you page is the only surface a customer holds a durable link to,
 * and it is the same link minutes after payment and weeks after delivery. It
 * should not say the same thing at both moments. Returning the stage lets the
 * page confirm a payment on the first visit and, once the work is genuinely
 * complete, invite the customer to share — rather than asking someone to
 * recommend a record that is still being pressed.
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

/**
 * The referral code is joined in only for a COMPLETED order.
 *
 * Done in SQL rather than filtered in PHP afterwards, so an incomplete order
 * never has the code in memory to be leaked by a later change to this file.
 * A customer whose work is still in production simply has no `referral` field
 * in the response, and the page has nothing to render.
 */
$stmt = db()->prepare(
    "SELECT o.status, o.mcb_reference, p.stage, p.completed_at,
            CASE WHEN p.stage = 'COMPLETED' THEN cr.code ELSE NULL END AS referral_code
       FROM orders o
       LEFT JOIN order_production p ON p.order_id = o.id
       LEFT JOIN customer_referrals cr ON cr.customer_id = o.customer_id
                                      AND cr.revoked_at IS NULL
      WHERE o.stripe_session_id = :sid
      LIMIT 1"
);
$stmt->execute([':sid' => $sessionId]);
$order = $stmt->fetch();

// Not found is the normal answer in the first seconds after payment: the
// webhook has not landed yet. 200 with reference:null, so the page can retry
// without treating an expected race as an error.
if ($order === false) {
    json_response(200, [
        'status'    => null,
        'reference' => null,
        'stage'     => null,
        'referral'  => null,
    ]);
}

json_response(200, [
    'status'    => $order['status'],
    'reference' => $order['mcb_reference'],
    // NULL until an operator records the commission as complete. The page
    // uses this to decide whether it is confirming a payment or celebrating a
    // finished piece of work.
    'stage'     => $order['stage'],
    // The caller's own public share code, and only once the work is done.
    'referral'  => $order['referral_code'],
]);
