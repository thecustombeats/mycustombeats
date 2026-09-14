<?php
/**
 * GET /api/crm/order-personalisation?order_id=123
 * GET /api/crm/order-personalisation?reference=MCB-2026-000004
 *
 * The production brief for one order: every song product and memory, plaques,
 * frames, the format sold, the delivery destination, the photos that belong to
 * each memory, and the audit trail. CRM key required.
 *
 * This is what MCB makes the order from, so unlike /api/crm/orders it DOES
 * carry the customer's words and address. It is never exposed to a browser,
 * and photos are referenced by opaque id, fetched through /api/crm/upload.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$pdo = db();

$reference = strtoupper(trim((string) ($_GET['reference'] ?? '')));
$orderIdRaw = (string) ($_GET['order_id'] ?? '');

if ($reference !== '' && preg_match('/^MCB-\d{4}-\d{6}$/', $reference) === 1) {
    $stmt = $pdo->prepare('SELECT id FROM orders WHERE mcb_reference = :r');
    $stmt->execute([':r' => $reference]);
} elseif (ctype_digit($orderIdRaw)) {
    $stmt = $pdo->prepare('SELECT id FROM orders WHERE id = :id');
    $stmt->execute([':id' => (int) $orderIdRaw]);
} else {
    json_error(422, 'invalid_request', 'Give an order_id or an MCB reference.');
}
$orderId = $stmt->fetchColumn();
if ($orderId === false) {
    json_error(404, 'order_not_found', 'No such order.');
}
$orderId = (int) $orderId;

$order = $pdo->prepare(
    'SELECT o.id, o.mcb_reference, o.status, o.package, o.fulfilment_type, o.subtotal_minor, o.delivery_minor,
            o.total_minor, o.currency, o.delivery_status, o.delivery_rate_source, o.delivery_rate_id, o.delivery_label,
            o.personalisation_status, o.stripe_livemode, o.created_at,
            c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
       FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = :id'
);
$order->execute([':id' => $orderId]);
$o = $order->fetch();

$address = $pdo->prepare(
    'SELECT recipient_name, address_line_1, address_line_2, city, state_region, postal_code, country, country_code, phone
       FROM delivery_addresses WHERE order_id = :id'
);
$address->execute([':id' => $orderId]);
$addressRow = $address->fetch();

$units = $pdo->prepare('SELECT * FROM order_units WHERE order_id = :id ORDER BY kind, sku, unit_index');
$units->execute([':id' => $orderId]);
$unitRows = $units->fetchAll();

$memories = $pdo->prepare(
    'SELECT m.*, up.public_id AS photo_id, up.mime_type AS photo_type
       FROM order_memories m LEFT JOIN order_uploads up ON up.memory_id = m.id
      WHERE m.order_id = :id ORDER BY m.unit_id, m.sequence'
);
$memories->execute([':id' => $orderId]);
$memoriesByUnit = [];
$memoryPosition = [];
foreach ($memories->fetchAll() as $m) {
    $memoriesByUnit[(int) $m['unit_id']][] = $m;
}

$plaquePhotos = $pdo->prepare('SELECT unit_id, public_id FROM order_uploads WHERE order_id = :id AND unit_id IS NOT NULL');
$plaquePhotos->execute([':id' => $orderId]);
$plaquePhotoByUnit = [];
foreach ($plaquePhotos->fetchAll() as $row) {
    $plaquePhotoByUnit[(int) $row['unit_id']] = $row['public_id'];
}

$songs = [];
$plaques = [];
$frames = [];
foreach ($unitRows as $u) {
    $id = (int) $u['id'];
    if ($u['kind'] === 'SONG') {
        foreach ($memoriesByUnit[$id] ?? [] as $m) {
            $memoryPosition[(int) $m['id']] = ['unit' => (int) $u['unit_index'], 'song' => (int) $m['sequence']];
        }
        $songs[] = [
            'sku'                  => $u['sku'],
            'product_id'           => $u['product_id'],
            'unit'                 => (int) $u['unit_index'],
            'song_count'           => $u['song_count'] === null ? null : (int) $u['song_count'],
            'format'               => $u['picture_disc'] === null ? null : [
                'picture_disc' => (bool) $u['picture_disc'],
                'size_inches'  => (int) $u['size_inches'],
                'shape'        => $u['shape'],
                'disc_count'   => (int) $u['disc_count'],
                'gatefold'     => (bool) $u['gatefold'],
            ],
            'priority_replacement' => (bool) $u['priority_replacement'],
            'memories'             => array_map(static fn (array $m): array => [
                'song'         => (int) $m['sequence'],
                'story'        => $m['story'],
                'about'        => $m['about'],
                'occasion'     => $m['occasion'],
                'style_choice' => $m['style_choice'],
                'style'        => $m['style_label'],
                'photo'        => $m['photo_requested'] ? ['requested' => true, 'id' => $m['photo_id'], 'type' => $m['photo_type']] : null,
            ], $memoriesByUnit[$id] ?? []),
        ];
    } elseif ($u['kind'] === 'PLAQUE') {
        $plaques[] = [
            'plaque'     => (int) $u['unit_index'],
            'song_title' => $u['plaque_song_title'],
            'artist'     => $u['plaque_artist'],
            'photo_id'   => $plaquePhotoByUnit[$id] ?? null,
        ];
    } else {
        $frames[] = [
            'sku'     => $u['sku'],
            'frame'   => (int) $u['unit_index'],
            'lyrics'  => $u['frame_memory_id'] === null ? null : ($memoryPosition[(int) $u['frame_memory_id']] ?? null),
            'heading' => $u['frame_heading'],
        ];
    }
}

$items = $pdo->prepare('SELECT item_id AS sku, item_name, category, fulfilment, quantity, unit_minor, line_minor FROM order_items WHERE order_id = :id ORDER BY id');
$items->execute([':id' => $orderId]);

$events = $pdo->prepare('SELECT event_type, detail, created_at FROM order_events WHERE order_id = :id ORDER BY id');
$events->execute([':id' => $orderId]);

json_response(200, [
    'order'    => [
        'order_id'               => (int) $o['id'],
        'reference'              => $o['mcb_reference'],
        'status'                 => $o['status'],
        'package'                => $o['package'],
        'fulfilment_type'        => $o['fulfilment_type'],
        'personalisation_status' => $o['personalisation_status'],
        'subtotal_minor'         => $o['subtotal_minor'] === null ? null : (int) $o['subtotal_minor'],
        'delivery'               => [
            'status'    => $o['delivery_status'],
            'minor'     => $o['delivery_minor'] === null ? null : (int) $o['delivery_minor'],
            'rate_id'   => $o['delivery_rate_id'],
            'label'     => $o['delivery_label'],
            'test_only' => $o['delivery_rate_source'] === 'TEST_ONLY_FIXTURE',
        ],
        'total_minor'            => $o['total_minor'] === null ? null : (int) $o['total_minor'],
        'currency'               => $o['currency'],
        'test_payment'           => $o['stripe_livemode'] === null ? null : (int) $o['stripe_livemode'] === 0,
        'created_at'             => $o['created_at'],
    ],
    'customer' => ['name' => $o['customer_name'], 'email' => $o['customer_email'], 'phone' => $o['customer_phone']],
    'delivery_address' => $addressRow === false ? null : $addressRow,
    'lines'    => array_map(static fn (array $l): array => [
        'sku' => $l['sku'], 'name' => $l['item_name'], 'category' => $l['category'], 'fulfilment' => $l['fulfilment'],
        'quantity' => (int) $l['quantity'], 'unit_minor' => $l['unit_minor'] === null ? null : (int) $l['unit_minor'],
        'line_minor' => $l['line_minor'] === null ? null : (int) $l['line_minor'],
    ], $items->fetchAll()),
    'songs'    => $songs,
    'plaques'  => $plaques,
    'frames'   => $frames,
    'events'   => array_map(static fn (array $e): array => [
        'type' => $e['event_type'], 'detail' => $e['detail'] === null ? null : json_decode((string) $e['detail'], true), 'at' => $e['created_at'],
    ], $events->fetchAll()),
]);
