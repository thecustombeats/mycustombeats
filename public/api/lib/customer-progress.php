<?php
/**
 * MCB — what a customer's private order page may know.
 *
 * Built only from an order already resolved from a valid STATUS link. Plain
 * facts the customer already has: their reference, what they bought, where it
 * has got to, and tracking MCB has recorded. Never a name, email, address,
 * story, quality-check detail, note, amount or supplier detail. The only
 * numbers are a video job and a support case number, which work only
 * together with this order's own link.
 *
 * Support cases (lib/customer-care.php) show the customer's own messages and
 * MCB's replies, a plain status and the next step — never internal notes,
 * priority, classification, remedies, staff names or anything about suppliers.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/customer-care.php';

/**
 * The order's physical items as the customer can refer to them — "item-1",
 * "item-2" — never by database id.
 *
 * @return list<array{key:string, unit_id:int, name:string, priority_replacement:bool}>
 */
function customer_order_items(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        "SELECT u.id, u.unit_index, u.kind, u.priority_replacement, u.picture_disc, i.item_name, i.quantity
           FROM order_units u
           JOIN order_items i ON i.id = u.order_item_id
          WHERE u.order_id = :id
          ORDER BY u.id"
    );
    $stmt->execute([':id' => $orderId]);
    $items = [];
    $n = 0;
    foreach ($stmt->fetchAll() as $u) {
        // Digital song units (a Moment) have nothing that can arrive damaged.
        if ($u['kind'] === 'SONG' && $u['picture_disc'] === null) {
            continue;
        }
        $n++;
        $name = (string) $u['item_name'];
        if ((int) $u['quantity'] > 1) {
            $name .= ' ' . (int) $u['unit_index'];
        }
        $items[] = [
            'key'                  => 'item-' . $n,
            'unit_id'              => (int) $u['id'],
            'name'                 => $name,
            'priority_replacement' => (int) $u['priority_replacement'] === 1,
        ];
    }
    return $items;
}

/** The last day a Priority Replacement request may be made, or null if delivery is not recorded. */
function priority_replacement_window_end(?string $deliveredOn): ?string
{
    if ($deliveredOn === null) {
        return null;
    }
    $days = (int) (operations_data()['priority_replacement_claim_window_days'] ?? 7);
    return gmdate('Y-m-d', strtotime($deliveredOn . ' 00:00:00 UTC') + $days * 86400);
}

/** ELIGIBLE | NOT_PURCHASED | OUTSIDE_WINDOW | DELIVERY_NOT_CONFIRMED, for one item. */
function priority_replacement_eligibility(bool $purchased, ?string $deliveredOn, ?string $today = null): string
{
    if (!$purchased) {
        return 'NOT_PURCHASED';
    }
    $end = priority_replacement_window_end($deliveredOn);
    if ($end === null) {
        return 'DELIVERY_NOT_CONFIRMED';
    }
    return ($today ?? gmdate('Y-m-d')) <= $end ? 'ELIGIBLE' : 'OUTSIDE_WINDOW';
}

/** The customer's view of each parcel: simple states, no supplier, no internal exception detail. */
function customer_parcels(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare("SELECT sequence, state, carrier, tracking_reference, tracking_url, dispatched_on, delivered_on FROM shipments WHERE order_id = :o AND state NOT IN ('LOST','CANCELLED') ORDER BY sequence");
    $stmt->execute([':o' => $orderId]);
    $parcels = [];
    foreach ($stmt->fetchAll() as $i => $s) {
        $parcels[] = [
            'number'             => $i + 1,
            'status'             => match ($s['state']) { 'AWAITING_DISPATCH' => 'BEING_MADE', 'DELIVERED' => 'DELIVERED', default => 'ON_THE_WAY' },
            'carrier'            => $s['carrier'],
            'tracking_reference' => $s['tracking_reference'],
            'tracking_url'       => $s['tracking_url'],
            'dispatched_on'      => $s['dispatched_on'],
            'delivered_on'       => $s['state'] === 'DELIVERED' ? $s['delivered_on'] : null,
        ];
    }
    return $parcels;
}

function customer_progress(PDO $pdo, int $orderId): array
{
    $row      = operations_order_row($pdo, $orderId);
    $workflow = order_workflow($row);
    $state    = operational_state($row);
    $current  = customer_stage_for($workflow, $state);

    $stages = [];
    $seenCurrent = false;
    foreach (operations_data()['customer_stages'][$workflow] as $stage) {
        $status = $seenCurrent ? 'upcoming' : ($stage['id'] === $current ? 'current' : 'done');
        if ($stage['id'] === $current) {
            $seenCurrent = true;
        }
        $stages[] = ['id' => $stage['id'], 'status' => $status];
    }
    // COMPLETED is the last stage: everything before it is done and it is too.
    if ($state === 'COMPLETED') {
        $stages = array_map(static fn (array $s): array => ['id' => $s['id'], 'status' => 'done'], $stages);
    }

    $lines = $pdo->prepare("SELECT item_name, quantity FROM order_items WHERE order_id = :id ORDER BY id");
    $lines->execute([':id' => $orderId]);

    $fulfil  = effective_fulfilment_state($row);
    $shipped = $workflow === 'PHYSICAL' && in_array($fulfil, ['DISPATCHED', 'DELIVERED'], true);

    $items = [];
    if ($workflow === 'PHYSICAL') {
        foreach (customer_order_items($pdo, $orderId) as $item) {
            $items[] = [
                'key'  => $item['key'],
                'name' => $item['name'],
                'priority_replacement' => $item['priority_replacement']
                    ? ['request_by' => priority_replacement_window_end($row['delivered_on'])]
                    : null,
            ];
        }
    }

    $open = $pdo->prepare("SELECT COUNT(*) FROM order_service_requests WHERE order_id = :id AND status IN ('NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS')");
    $open->execute([':id' => $orderId]);

    return [
        'reference' => $row['mcb_reference'],
        'workflow'  => $workflow,
        'lines'     => array_map(static fn (array $l): array => ['name' => $l['item_name'], 'quantity' => (int) $l['quantity']], $lines->fetchAll()),
        'stage'     => $current,
        'stages'    => $stages,
        // The reveal: a digital creation's private listening link, only once
        // MCB has checked and revealed it. Never a draft; never before.
        'reveal'    => $workflow === 'DIGITAL' && ($row['revealed_at'] ?? null) !== null && ($row['reveal_url'] ?? null) !== null
            ? ['url' => $row['reveal_url'], 'revealed_on' => substr((string) $row['revealed_at'], 0, 10)]
            : null,
        'delivery'  => $shipped ? [
            'carrier'            => $row['carrier'],
            'tracking_reference' => $row['tracking_reference'],
            'tracking_url'       => $row['tracking_url'],
            'dispatched_on'      => $row['dispatched_on'],
            'delivered_on'       => $fulfil === 'DELIVERED' ? $row['delivered_on'] : null,
        ] : null,
        // One order, possibly several parcels. Carrier and tracking only: never who made or sent it.
        'parcels'       => $shipped ? customer_parcels($pdo, $orderId) : [],
        // MCB Memory Music Video: plain states; the film itself only once revealed.
        'videos'        => video_customer_view($pdo, $orderId),
        'support'       => care_customer_cases($pdo, $orderId),
        'support_kinds' => care_customer_kinds($pdo, $orderId),
        'items'         => $items,
        'open_requests' => (int) $open->fetchColumn(),
    ];
}
