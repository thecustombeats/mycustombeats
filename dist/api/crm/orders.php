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

$since = trim((string) ($_GET['since'] ?? ''));
if ($since !== '' && preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
    $where[] = 'o.created_at >= :since';
    $params[':since'] = $since . ' 00:00:00';
}

$sql = 'SELECT
            o.id, o.status, o.package, o.format, o.fulfilment_type,
            o.amount_gbp, o.amount_usd, o.currency,
            o.source_type, o.referral_raw,
            o.stripe_session_id, o.created_at, o.updated_at,
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

$orders = array_map(static function (array $r): array {
    $order = [
        'order_id'        => (int) $r['id'],
        'status'          => $r['status'],
        'package'         => $r['package'],
        'format'          => $r['format'],
        'fulfilment_type' => $r['fulfilment_type'],
        'amount'          => ['gbp' => (float) $r['amount_gbp'], 'usd' => (float) $r['amount_usd']],
        'currency'        => $r['currency'],
        'attribution'     => [
            'source_type'        => $r['source_type'],
            'affiliate_username' => $r['affiliate_username'],
            'partner_slug'       => $r['partner_slug'],
            'referral_raw'       => $r['referral_raw'],
        ],
        'customer'        => ['name' => $r['customer_name'], 'email' => $r['customer_email']],
        'stripe_session'  => $r['stripe_session_id'],
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
