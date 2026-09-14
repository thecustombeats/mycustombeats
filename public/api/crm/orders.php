<?php
/**
 * GET /api/crm/orders — governed read surface.
 *
 * This is the boundary MCB OS will eventually consume. It exists so that
 * intelligence layers read governed CRM data over an authenticated API,
 * rather than scraping the website, reading browser storage, or holding
 * database credentials.
 *
 * NOT YET CONSUMED. Nothing reads this endpoint today. It is built now so
 * the boundary is established before anything depends on it.
 *
 * Query: ?status=PAID&fulfilment=PHYSICAL&since=2026-01-01&limit=50&cursor=123
 *        ?reference=MCB-2026-000004   — retrieve one order by what the
 *                                       customer quoted
 *
 * Answers the operational questions the CRM exists for — "which paid orders
 * need shipping?", "which affiliate earned this?" — without exposing the
 * customer's creative brief or story, which no downstream system needs.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$limit  = min(max((int) ($_GET['limit'] ?? 50), 1), 200);
$cursor = max((int) ($_GET['cursor'] ?? 0), 0);

$where  = ['o.id > :cursor'];
$params = [':cursor' => $cursor];

// Whitelisted, never interpolated from the request.
$status = strtoupper(trim((string) ($_GET['status'] ?? '')));
if (in_array($status, ['PENDING', 'PAID', 'ABANDONED', 'REFUNDED'], true)) {
    $where[] = 'o.status = :status';
    $params[':status'] = $status;
}

$fulfilment = strtoupper(trim((string) ($_GET['fulfilment'] ?? '')));
if (in_array($fulfilment, ['DIGITAL', 'PHYSICAL'], true)) {
    $where[] = 'o.fulfilment_type = :ful';
    $params[':ful'] = $fulfilment;
}

// "A customer just quoted MCB-2026-000004 — pull up their order." Matched
// exactly against the UNIQUE column, never as a pattern.
$reference = strtoupper(trim((string) ($_GET['reference'] ?? '')));
if ($reference !== '' && preg_match('/^MCB-\d{4}-\d{6}$/', $reference)) {
    $where[] = 'o.mcb_reference = :reference';
    $params[':reference'] = $reference;
}

$since = trim((string) ($_GET['since'] ?? ''));
if ($since !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
    $where[] = 'o.created_at >= :since';
    $params[':since'] = $since . ' 00:00:00';
}

$sql = 'SELECT
            o.id, o.mcb_reference, o.status, o.package, o.format, o.fulfilment_type,
            o.amount_gbp, o.total_minor, o.currency,
            o.source_type, o.referral_raw,
            o.stripe_session_id, o.customer_notified_at, o.created_at, o.updated_at,
            c.name  AS customer_name,
            c.email AS customer_email,
            a.username AS affiliate_username,
            p.slug     AS partner_slug,
            d.recipient_name, d.address_line_1, d.address_line_2,
            d.city, d.state_region, d.postal_code, d.country
        FROM orders o
        JOIN customers c ON c.id = o.customer_id
        LEFT JOIN affiliates a ON a.id = o.affiliate_id
        LEFT JOIN partners   p ON p.id = o.partner_id
        LEFT JOIN delivery_addresses d ON d.order_id = o.id
        WHERE ' . implode(' AND ', $where) . '
        ORDER BY o.id ASC
        LIMIT ' . $limit;   // integer, already clamped

$stmt = db()->prepare($sql);
$stmt->execute($params);
$rows = $stmt->fetchAll();

/**
 * The Complete Your Memory items, for every order in this page of results.
 *
 * ONE query rather than one per order — a fulfilment list that got slower the
 * more orders you asked for would stop being used.
 *
 * Fetched separately rather than joined into the query above because a join
 * would multiply each order row by its item count and quietly break every
 * existing consumer's expectation of one row per order.
 */
$itemsByOrder = [];
if ($rows !== []) {
    $ids = array_map(static fn (array $r): int => (int) $r['id'], $rows);
    $in  = implode(',', array_fill(0, count($ids), '?'));
    $itemStmt = db()->prepare(
        "SELECT order_id, item_id, product_id, item_name, category, fulfilment,
                quantity, unit_gbp, line_gbp, unit_minor, line_minor
           FROM order_items WHERE order_id IN ($in) ORDER BY id ASC"
    );
    try {
        $itemStmt->execute($ids);
        foreach ($itemStmt->fetchAll() as $item) {
            $itemsByOrder[(int) $item['order_id']][] = [
                'sku'        => $item['item_id'],
                'product_id' => $item['product_id'],
                'name'       => $item['item_name'],
                'category'   => $item['category'],
                'fulfilment' => $item['fulfilment'],
                'quantity'   => (int) $item['quantity'],
                // Integer pence on catalogue orders; derived exactly from the
                // DECIMAL column on legacy rows.
                'unit_minor' => $item['unit_minor'] !== null ? (int) $item['unit_minor'] : decimal_to_minor((string) $item['unit_gbp']),
                'line_minor' => $item['line_minor'] !== null ? (int) $item['line_minor'] : decimal_to_minor((string) $item['line_gbp']),
            ];
        }
    } catch (PDOException $e) {
        // A database that has not run the migration yet must still be able to
        // answer "what orders are there?" — the items simply come back empty.
        error_log('MCB CRM: order_items unavailable: ' . $e->getMessage());
    }
}

$orders = array_map(static function (array $r) use ($itemsByOrder): array {
    $items = $itemsByOrder[(int) $r['id']] ?? [];
    $order = [
        // The reference leads, because it is what a customer will quote when
        // they get in touch. NULL on anything not yet paid, by design.
        'mcb_reference'   => $r['mcb_reference'],
        'order_id'        => (int) $r['id'],
        'status'          => $r['status'],
        'package'         => $r['package'],
        'format'          => $r['format'],
        'fulfilment_type' => $r['fulfilment_type'],
        'currency'        => $r['currency'],
        /**
         * Every line of the order and its total, in integer pence.
         *
         * Catalogue orders hold every line, including the song experience, and
         * an authoritative `total_minor`. Orders from before the catalogue
         * hold the package amount on the order and only add-ons as lines, so
         * their total is that amount plus the lines. The legacy USD figure is
         * no longer reported.
         */
        'lines'           => $items,
        'total'           => [
            'minor'    => $r['total_minor'] !== null
                ? (int) $r['total_minor']
                : (int) decimal_to_minor((string) $r['amount_gbp']) + array_sum(array_column($items, 'line_minor')),
            'currency' => $r['currency'],
        ],
        'attribution'     => [
            'source_type'        => $r['source_type'],
            'affiliate_username' => $r['affiliate_username'],
            'partner_slug'       => $r['partner_slug'],
            'referral_raw'       => $r['referral_raw'],
        ],
        'customer'        => ['name' => $r['customer_name'], 'email' => $r['customer_email']],
        'stripe_session'  => $r['stripe_session_id'],
        // NULL on a PAID order means that customer has not yet been sent
        // their reference — the operational question this column answers.
        'customer_notified_at' => $r['customer_notified_at'],
        'created_at'      => $r['created_at'],
        'updated_at'      => $r['updated_at'],
    ];

    // Delivery detail only where a physical order actually has one.
    if ($r['fulfilment_type'] === 'PHYSICAL' && $r['recipient_name'] !== null) {
        $order['delivery'] = [
            'recipient_name' => $r['recipient_name'],
            'address_line_1' => $r['address_line_1'],
            'address_line_2' => $r['address_line_2'],
            'city'           => $r['city'],
            'state_region'   => $r['state_region'],
            'postal_code'    => $r['postal_code'],
            'country'        => $r['country'],
        ];
    }

    return $order;
}, $rows);

json_response(200, [
    'orders'      => $orders,
    'count'       => count($orders),
    // Cursor pagination: stable under inserts, unlike OFFSET.
    'next_cursor' => $orders === [] ? null : end($orders)['order_id'],
]);
