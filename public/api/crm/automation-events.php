<?php
/**
 * GET /api/crm/automation-events?after_order_event=0&after_enquiry_event=0
 *
 * The automation-ready events (src/data/operations.ts AUTOMATION_EVENTS), for
 * a future workflow tool to poll with the CRM key. Two cursors, because order
 * events and enquiry events are kept in their own audit tables.
 *
 * Identifiers and machine values only: the MCB reference or enquiry
 * reference, the event name, when, and the event's own non-personal detail.
 * No story, name, email, address or amount. Reading this triggers nothing —
 * no supplier order, refund or charge follows from any event automatically.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/operations.php';

require_method('GET');
require_crm_key();

$names   = operations_data()['automation_events'];
$afterO  = max(0, (int) ($_GET['after_order_event'] ?? 0));
$afterE  = max(0, (int) ($_GET['after_enquiry_event'] ?? 0));
$limit   = min(max((int) ($_GET['limit'] ?? 100), 1), 500);
$in      = implode(',', array_fill(0, count($names), '?'));
$pdo     = db();

$stmt = $pdo->prepare(
    "SELECT e.id, e.event_type, e.detail, e.source, e.created_at, o.mcb_reference
       FROM order_events e JOIN orders o ON o.id = e.order_id
      WHERE e.id > ? AND e.event_type IN ($in)
      ORDER BY e.id LIMIT {$limit}"
);
$stmt->execute(array_merge([$afterO], $names));
$orderEvents = array_map(static fn (array $r): array => [
    'id'        => (int) $r['id'],
    'event'     => $r['event_type'],
    'reference' => $r['mcb_reference'],
    'detail'    => $r['detail'] === null ? null : json_decode($r['detail'], true),
    'source'    => $r['source'],
    'at'        => $r['created_at'],
], $stmt->fetchAll());

$stmt = $pdo->prepare(
    "SELECT id, event_type, subject_reference, detail, created_at
       FROM operations_events
      WHERE id > ? AND event_type IN ($in)
      ORDER BY id LIMIT {$limit}"
);
$stmt->execute(array_merge([$afterE], $names));
$enquiryEvents = array_map(static fn (array $r): array => [
    'id'        => (int) $r['id'],
    'event'     => $r['event_type'],
    'reference' => $r['subject_reference'],
    'detail'    => $r['detail'] === null ? null : json_decode($r['detail'], true),
    'at'        => $r['created_at'],
], $stmt->fetchAll());

json_response(200, [
    'order_events'   => $orderEvents,
    'enquiry_events' => $enquiryEvents,
    'next'           => [
        'after_order_event'   => $orderEvents === [] ? $afterO : end($orderEvents)['id'],
        'after_enquiry_event' => $enquiryEvents === [] ? $afterE : end($enquiryEvents)['id'],
    ],
]);
