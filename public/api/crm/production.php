<?php
/**
 * /api/crm/production — the creative lifecycle, for operators.
 *
 * GET   ?order=123          the production record for one order
 * GET   ?stage=CREATIVE     a page of orders at a stage
 * POST                      RETIRED (410)
 *
 * ─────────────────────────────────────────────────────────────────────────
 * READ-ONLY SINCE SINGLE CREATIVE AUTHORITY (15 September 2026)
 * ─────────────────────────────────────────────────────────────────────────
 * This endpoint used to record a customer's approval, given by email or
 * WhatsApp, and move the stage by hand. Customer approval is retired: every
 * move now goes through /api/crm/order-action (quality check, reveal,
 * fulfilment), which checks each transition. Writing a stage here would
 * bypass MCB's quality check, so POST is refused. Historical approval
 * evidence is still returned for the records that have it.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/legal.php';

require_crm_key();

/* ------------------------------------------------------------------ */
/* Shared shape                                                        */
/* ------------------------------------------------------------------ */

/**
 * One production record as the CRM reads it.
 *
 * `quality_checked` is DERIVED from the stage table rather than stored.
 */
function production_row(array $r): array
{
    $stage = (string) $r['stage'];

    return [
        'order_id'       => (int) $r['order_id'],
        'stage'          => $stage,
        'quality_checked' => stage_quality_checked($stage),
        'quality_check'  => [
            'passed_at' => $r['qc_passed_at'] ?? null,
            'passed_by' => $r['qc_passed_by'] ?? null,
            'failed_count' => (int) ($r['qc_failed_count'] ?? 0),
        ],
        'revealed_at'    => $r['revealed_at'] ?? null,
        // Legacy evidence from the retired approval model, where it exists.
        'legacy_approval' => [
            'approved_at' => $r['approved_at'],
            'channel'     => $r['approval_channel'],
            'reference'   => $r['approval_reference'],
            'item'        => $r['approved_item'],
            'recorded_by' => $r['approved_by'],
        ],
        'production_locked_at' => $r['production_locked_at'],
        'production_note'      => $r['production_note'],
        /**
         * When MCB regarded the commission as fulfilled.
         *
         * NOT a delivery confirmation — there is no carrier integration, and
         * pretending a dispatch date is an arrival date would be inventing
         * one. FULFILMENT means made and sent; this means done.
         *
         * The lifecycle messages hang off it: asking someone what their
         * memory meant is a question about something they have.
         */
        'completed_at'         => $r['completed_at'],
        'terms_version'        => $r['terms_version'],
        /**
         * Who the customer is travelling with, in their own words.
         *
         * HERE rather than on `/api/crm/orders`, which deliberately
         * withholds the creative brief because a fulfilment list does not
         * need it. This endpoint is the production workflow — it exists so
         * somebody can prepare to make the work — and knowing who will be
         * listening is part of that preparation. Same reasoning as the
         * concierge surface returning the enquiry's story.
         */
        'cruise_companions'    => $r['brief_cruise_companions'] ?? null,
        // Payment state, returned ALONGSIDE and never as a substitute. An
        // operator can see both and the difference between them at a glance.
        'payment_status'       => $r['payment_status'] ?? null,
        'updated_at'           => $r['updated_at'],
    ];
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $where  = [];
    $params = [];

    $orderId = (int) ($_GET['order'] ?? 0);
    if ($orderId > 0) {
        $where[] = 'p.order_id = :oid';
        $params[':oid'] = $orderId;
    }

    // Whitelisted against the generated stage list, never interpolated.
    $stage = strtoupper(trim((string) ($_GET['stage'] ?? '')));
    $validStages = array_column(legal_data()['production']['stages'] ?? [], 'stage');
    if ($stage !== '' && in_array($stage, $validStages, true)) {
        $where[] = 'p.stage = :stage';
        $params[':stage'] = $stage;
    }

    $limit = min(max((int) ($_GET['limit'] ?? 50), 1), 200);

    $sql = 'SELECT p.*, o.status AS payment_status,
                   o.brief_cruise_companions
              FROM order_production p
              JOIN orders o ON o.id = p.order_id'
         . ($where === [] ? '' : ' WHERE ' . implode(' AND ', $where))
         . ' ORDER BY p.order_id ASC LIMIT ' . $limit;   // integer, clamped

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    json_response(200, [
        'production' => array_map('production_row', $stmt->fetchAll()),
    ]);
}

/* ------------------------------------------------------------------ */
/* Write — retired                                                     */
/* ------------------------------------------------------------------ */

require_method('POST');
json_error(410, 'endpoint_retired', 'Recording customer approval has been retired. Use /api/crm/order-action for the quality check, reveal and fulfilment.');
