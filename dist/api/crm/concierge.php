<?php
/**
 * GET /api/crm/concierge — the governed read surface for Full Package
 * enquiries.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SEPARATE ENDPOINT
 * ─────────────────────────────────────────────────────────────────────────
 * The obvious alternative was a `type=CONCIERGE` filter on
 * `GET /api/crm/orders`. It was rejected: that response is shaped around a
 * sale — `amount.gbp`, `amount.usd`, `basket_total_gbp`, `status`, a
 * `stripe_session`, an `mcb_reference`. An enquiry has none of them, so every
 * one of those fields would have to be filled with a zero or a null, and
 * anything summing that endpoint's amounts — a revenue figure, a dashboard,
 * MCB OS later — would silently take enquiries into its totals as £0 sales.
 *
 * Two shapes, because they are two things.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO PAYMENT VOCABULARY APPEARS IN THIS RESPONSE
 * ─────────────────────────────────────────────────────────────────────────
 * There is no `amount`, no `total`, no `paid`, no `currency` of charge and no
 * status that could be read as one. `budget` is what the CUSTOMER said they
 * would like to spend — an input to a conversation, not a sum owed — and it is
 * returned in a shape that says so.
 *
 * Query: ?status=NEW&since=2026-01-01&limit=50&cursor=123
 *        ?reference=FP-2026-7QK4ZM   — pull up one enquiry by the code the
 *                                      customer was given
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$limit  = min(max((int) ($_GET['limit'] ?? 50), 1), 200);
$cursor = max((int) ($_GET['cursor'] ?? 0), 0);

$where  = ['e.id > :cursor'];
$params = [':cursor' => $cursor];

// Whitelisted, never interpolated from the request. Note what is absent from
// this list: there is no PAID and no PENDING to filter by.
$status = strtoupper(trim((string) ($_GET['status'] ?? '')));
if (in_array($status, ['NEW', 'IN_CONVERSATION', 'PROPOSAL_SENT', 'AGREED', 'CLOSED', 'DECLINED'], true)) {
    $where[] = 'e.status = :status';
    $params[':status'] = $status;
}

// Matched exactly against the UNIQUE column, never as a pattern.
$reference = strtoupper(trim((string) ($_GET['reference'] ?? '')));
if ($reference !== '' && preg_match('/^FP-\d{4}-[0-9A-Z]{6}$/', $reference)) {
    $where[] = 'e.reference = :reference';
    $params[':reference'] = $reference;
}

$since = trim((string) ($_GET['since'] ?? ''));
if ($since !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
    $where[] = 'e.created_at >= :since';
    $params[':since'] = $since . ' 00:00:00';
}

$sql = 'SELECT
            e.id, e.reference, e.status,
            e.name, e.email, e.phone, e.preferred_contact,
            e.occasion, e.needed_by, e.delivery_region,
            e.budget_mode, e.budget_amount_minor, e.budget_currency,
            e.story, e.internal_notes,
            e.source_type, e.referral_raw,
            e.created_at, e.updated_at,
            a.username AS affiliate_username,
            p.slug     AS partner_slug
        FROM concierge_enquiries e
        LEFT JOIN affiliates a ON a.id = e.affiliate_id
        LEFT JOIN partners   p ON p.id = e.partner_id
        WHERE ' . implode(' AND ', $where) . '
        ORDER BY e.id ASC
        LIMIT ' . $limit;   // integer, already clamped

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

$enquiries = array_map(static function (array $r): array {
    $mode = (string) $r['budget_mode'];

    /**
     * THE BUDGET, AS THE CUSTOMER STATED IT.
     *
     * `mode` is returned alongside the figure and always — it is not metadata
     * about the amount, it is the answer. A consumer that reads only `amount`
     * would see null for OPEN and for UNSURE alike and could not tell "there
     * is no fixed limit" from "they would rather discuss it", which are close
     * to opposite signals about how to handle the enquiry.
     *
     * `amount` is in MAJOR units for reading — 10000.00 — while the column
     * holds minor units, so the division happens once, here, rather than in
     * every consumer.
     *
     * `currency` is what the customer declared. It is NOT converted, and there
     * is deliberately no `amount_gbp` alongside it: a converted figure in this
     * response would be quoted back in a proposal as though the customer had
     * said it.
     */
    $budget = [
        'mode'     => $mode,
        'amount'   => $r['budget_amount_minor'] === null
            ? null
            : round(((int) $r['budget_amount_minor']) / 100, 2),
        'currency' => $r['budget_currency'],
        // Spelled out so an operator's screen never has to interpret the enum
        // and never has to render OPEN as a blank or a zero.
        'summary'  => match ($mode) {
            'AMOUNT' => 'Stated an amount',
            'OPEN'   => 'No fixed spending limit',
            'UNSURE' => 'Would rather discuss it',
            default  => 'Not stated',
        },
    ];

    return [
        // The reference leads, because it is what the customer was given and
        // what they will quote. FP-, never MCB- — this is not an order.
        'reference'         => $r['reference'],
        'enquiry_id'        => (int) $r['id'],
        'status'            => $r['status'],
        'enquirer'          => [
            'name'              => $r['name'],
            'email'             => $r['email'],
            'phone'             => $r['phone'],
            'preferred_contact' => $r['preferred_contact'],
        ],
        'occasion'          => $r['occasion'],
        'needed_by'         => $r['needed_by'],
        'delivery_region'   => $r['delivery_region'],
        'budget'            => $budget,
        /**
         * The story is returned here, unlike the creative brief on
         * `/api/crm/orders`, which withholds it.
         *
         * The difference is what the endpoint is for. That one answers "what
         * needs shipping?" and the brief is not needed to answer it. This one
         * exists so somebody can prepare for a consultation, and the story is
         * the entire substance of that preparation — an enquiry list without
         * it would send an operator to the database anyway.
         */
        'story'             => $r['story'],
        'internal_notes'    => $r['internal_notes'],
        'attribution'       => [
            'source_type'        => $r['source_type'],
            'affiliate_username' => $r['affiliate_username'],
            'partner_slug'       => $r['partner_slug'],
            'referral_raw'       => $r['referral_raw'],
        ],
        'created_at'        => $r['created_at'],
        'updated_at'        => $r['updated_at'],
    ];
}, $rows);

json_response(200, [
    'enquiries'   => $enquiries,
    'next_cursor' => $rows === [] ? null : (int) end($rows)['id'],
]);
