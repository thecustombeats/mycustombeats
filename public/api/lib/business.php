<?php
/**
 * MCB™ Business & Profit Intelligence — the read model behind the Command
 * Centre's BUSINESS view.
 *
 * MANAGEMENT INTELLIGENCE, calculated deterministically from recorded MCB data
 * (no model or estimate invents a figure). Not statutory accounting, tax,
 * bookkeeping, pricing automation or financial advice.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE RULES
 * ─────────────────────────────────────────────────────────────────────────
 * - UNKNOWN ≠ £0. A cost nobody has recorded is UNKNOWN. Contribution is only
 *   calculated for orders whose required costs are all known, and always says
 *   how many orders it is based on.
 * - Gross contribution is never called net profit.
 * - Live payments only; TEST payments are counted separately and never added in.
 * - GBP management totals use GBP orders only. An order paid in another currency
 *   keeps its own currency and amount; nothing is converted.
 * - Each cost has one home (business.json cost_categories), so nothing is
 *   counted twice. Authorising a replacement is not spend until its actual cost
 *   is recorded. The platform's video allowance is not free: video cost is
 *   UNKNOWN until recorded.
 * - Small samples are EARLY DATA; nothing is ever the best or a winner.
 * - Thresholds are the Founders' (business.thresholds.*); unset = NOT CONFIGURED.
 * - Business time is Europe/London (founder decision); business.timezone may
 *   override it with another valid IANA name.
 * - Payment fees are ACTUAL-FIRST: a recorded fee, else UNKNOWN. No fee model.
 * - Nothing here spends, refunds, purchases, cancels an order or changes a price.
 * - Aggregated: a fixed number of set queries, never one per order.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/customer-care.php';
require_once __DIR__ . '/command-centre.php';
require_once __DIR__ . '/routing.php';

function biz_data(): array
{
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/business.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new OperationsException('business_policy_unavailable', 'The business policy is unavailable.', 503);
        }
    }
    return $data;
}

/* ------------------------------------------------------------------ */
/* Configuration: timezone, thresholds, payment fee model              */
/* ------------------------------------------------------------------ */

/**
 * The business reporting timezone. The Founders decided Europe/London; server
 * configuration (business.timezone) may set another valid IANA name. It is
 * never derived from where anyone is, or from the server.
 */
function biz_timezone(): array
{
    $decided = (string) (biz_data()['founder_decisions']['business_timezone'] ?? 'Europe/London');
    $configured = mcb_setting('business.timezone', null);
    if (is_string($configured) && $configured !== '' && in_array($configured, DateTimeZone::listIdentifiers(), true)) {
        return ['timezone' => $configured, 'configured' => true, 'status' => 'CONFIGURED', 'source' => $configured === $decided ? 'FOUNDER_DECISION' : 'SERVER_CONFIGURATION'];
    }
    return ['timezone' => $decided, 'configured' => true, 'status' => 'CONFIGURED', 'source' => 'FOUNDER_DECISION',
        'note' => "Business days, weeks and months use {$decided} (founder decision)."];
}

/** A founder threshold, or null when NOT CONFIGURED. Never a default. */
function biz_threshold(string $key): int|float|null
{
    $v = mcb_setting("business.thresholds.{$key}", null);
    return is_int($v) || is_float($v) ? $v : null;
}

function biz_early_below(): int
{
    $v = mcb_setting('business.early_data_below_orders', null);
    return is_int($v) && $v > 0 ? $v : (int) biz_data()['early_data_below_orders'];
}

function biz_sample(int $n): array
{
    return ['sample_size' => $n, 'early_data' => $n < biz_early_below(), 'label' => $n === 0 ? 'NO DATA' : ($n < biz_early_below() ? 'EARLY DATA' : 'SAMPLE ' . $n)];
}

/** Payment fee policy: ACTUAL-FIRST (founder decision). There is no fee model; an unrecorded fee is UNKNOWN. */
function biz_payment_fee_policy(): string
{
    return (string) (biz_data()['founder_decisions']['payment_fee_policy'] ?? 'ACTUAL_FIRST');
}

/** Period boundaries in the business timezone, as UTC timestamps for the database. */
function biz_periods(?int $now = null): array
{
    $tz = new DateTimeZone(biz_timezone()['timezone']);
    $utc = new DateTimeZone('UTC');
    $at = (new DateTimeImmutable('@' . ($now ?? time())))->setTimezone($tz);
    $day = $at->setTime(0, 0);
    $week = $day->modify('monday this week');
    if ($week > $day) {
        $week = $week->modify('-7 days');
    }
    $month = $day->modify('first day of this month');
    $f = static fn (DateTimeImmutable $d): string => $d->setTimezone($utc)->format('Y-m-d H:i:s');
    return [
        'timezone' => $tz->getName(),
        'now' => $f($at),
        'today' => ['label' => 'Today', 'start' => $f($day), 'end' => $f($day->modify('+1 day')), 'partial' => true],
        'yesterday' => ['label' => 'Yesterday', 'start' => $f($day->modify('-1 day')), 'end' => $f($day), 'partial' => false],
        'day_before' => ['label' => 'The day before', 'start' => $f($day->modify('-2 days')), 'end' => $f($day->modify('-1 day')), 'partial' => false],
        'week' => ['label' => 'This week', 'start' => $f($week), 'end' => $f($week->modify('+7 days')), 'partial' => true],
        'last_week' => ['label' => 'Last week', 'start' => $f($week->modify('-7 days')), 'end' => $f($week), 'partial' => false],
        'week_before' => ['label' => 'The week before', 'start' => $f($week->modify('-14 days')), 'end' => $f($week->modify('-7 days')), 'partial' => false],
        'month' => ['label' => 'This month', 'start' => $f($month), 'end' => $f($month->modify('+1 month')), 'partial' => true],
        'last_month' => ['label' => 'Last month', 'start' => $f($month->modify('-1 month')), 'end' => $f($month), 'partial' => false],
        'month_before' => ['label' => 'The month before', 'start' => $f($month->modify('-2 months')), 'end' => $f($month->modify('-1 month')), 'partial' => false],
        'all' => ['label' => 'All time', 'start' => null, 'end' => null, 'partial' => false],
    ];
}

function biz_in(?string $at, array $period): bool
{
    return $at !== null && ($period['start'] === null || ($at >= $period['start'] && $at < $period['end']));
}

/* ------------------------------------------------------------------ */
/* The dataset: every paid order, in a fixed number of queries         */
/* ------------------------------------------------------------------ */

/**
 * Every paid (or since refunded) order with what the read model needs. A fixed
 * number of queries regardless of order count. No story, photo, lyric, name,
 * email, address line or message is selected.
 */
function biz_dataset(PDO $pdo): array
{
    static $cache = [];
    $key = spl_object_id($pdo);
    if (isset($cache[$key])) {
        return $cache[$key];
    }
    $orders = [];
    foreach ($pdo->query(
        "SELECT o.id, o.mcb_reference, o.customer_id, o.currency, o.total_minor, o.delivery_minor, o.stripe_livemode, o.fulfilment_type, o.status,
                o.brief_cruise_companions IS NOT NULL AND o.brief_cruise_companions <> '' AS cruise_companions,
                COALESCE(pe.created_at, o.updated_at) AS paid_at, d.country_code
           FROM orders o
           LEFT JOIN order_events pe ON pe.order_id = o.id AND pe.dedupe_key = 'paid'
           LEFT JOIN delivery_addresses d ON d.order_id = o.id
          WHERE o.status IN ('PAID','REFUNDED') AND o.total_minor IS NOT NULL"
    )->fetchAll() as $r) {
        $orders[(int) $r['id']] = [
            'id' => (int) $r['id'], 'reference' => $r['mcb_reference'], 'customer_id' => (int) $r['customer_id'], 'currency' => $r['currency'],
            'total_minor' => (int) $r['total_minor'], 'delivery_minor' => (int) ($r['delivery_minor'] ?? 0), 'live' => (int) $r['stripe_livemode'] === 1,
            'physical' => $r['fulfilment_type'] === 'PHYSICAL', 'status' => $r['status'], 'legacy_refunded' => $r['status'] === 'REFUNDED',
            'paid_at' => $r['paid_at'], 'country_code' => $r['country_code'], 'cruise_companions' => (int) $r['cruise_companions'] === 1,
            'items' => [], 'occasions' => [], 'refunds' => [], 'expected_economics' => null, 'supplier_orders' => [], 'video_jobs' => [],
            'entries' => [], 'remedies' => [], 'cases' => [], 'exceptions' => [],
        ];
    }
    $each = static function (string $sql, callable $add) use ($pdo, &$orders): void {
        foreach ($pdo->query($sql)->fetchAll() as $r) {
            if (isset($orders[(int) $r['order_id']])) {
                $add($orders[(int) $r['order_id']], $r);
            }
        }
    };
    $each('SELECT order_id, item_id, product_id, category, fulfilment, quantity, line_minor FROM order_items', static function (array &$o, array $r): void {
        $o['items'][] = ['sku' => $r['item_id'], 'product_id' => $r['product_id'], 'category' => $r['category'], 'fulfilment' => $r['fulfilment'], 'quantity' => (int) $r['quantity'], 'line_minor' => (int) ($r['line_minor'] ?? 0)];
    });
    // Structured occasion only (a chosen slug), never the story text.
    $each("SELECT DISTINCT order_id, occasion FROM order_memories WHERE occasion IS NOT NULL AND occasion <> ''", static function (array &$o, array $r): void {
        $o['occasions'][] = $r['occasion'];
    });
    $each("SELECT order_id, id, case_id, refund_type, amount_minor, currency, recorded_at, external_reference FROM refund_reviews WHERE status = 'RECORDED'", static function (array &$o, array $r): void {
        $o['refunds'][] = ['id' => (int) $r['id'], 'case_id' => $r['case_id'] === null ? null : (int) $r['case_id'], 'type' => $r['refund_type'], 'amount_minor' => (int) $r['amount_minor'], 'currency' => $r['currency'], 'recorded_at' => $r['recorded_at'], 'has_reference' => $r['external_reference'] !== null];
    });
    $each("SELECT e.order_id, e.status, e.currency, e.purchase_cost_minor, e.shipping_cost_minor, e.contingency_minor, e.handling_minor, e.total_cost_minor
             FROM order_economics e JOIN (SELECT order_id, MAX(id) AS id FROM order_economics WHERE kind = 'EXPECTED' GROUP BY order_id) l ON l.id = e.id", static function (array &$o, array $r): void {
        $o['expected_economics'] = $r;
    });
    $each('SELECT order_id, id, route_id, status, currency, expected_purchase_cost_minor, expected_shipping_cost_minor, actual_purchase_cost_minor, actual_shipping_cost_minor, actual_tax_duty_minor, purchased_at FROM supplier_orders', static function (array &$o, array $r): void {
        $o['supplier_orders'][] = $r;
    });
    $each('SELECT order_id, id, status, production_cost_minor, production_started_at, rework_count FROM video_jobs', static function (array &$o, array $r): void {
        $o['video_jobs'][] = $r;
    });
    $each("SELECT order_id, id, category, basis, amount_minor, currency, remedy_id FROM direct_cost_entries WHERE status = 'CURRENT'", static function (array &$o, array $r): void {
        $o['entries'][] = $r;
    });
    $each("SELECT order_id, id, case_id, type, status FROM support_remedies WHERE type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED')", static function (array &$o, array $r): void {
        $o['remedies'][] = $r;
    });
    $each('SELECT order_id, id, kind, status, classification, root_cause, repeat_contacts FROM order_service_requests', static function (array &$o, array $r): void {
        $o['cases'][] = $r;
    });
    $each('SELECT order_id, id, type, status, supplier_order_id FROM fulfilment_exceptions', static function (array &$o, array $r): void {
        $o['exceptions'][] = $r;
    });
    foreach ($orders as &$o) {
        $o['costs'] = biz_order_costs($o);
    }
    unset($o);
    return $cache[$key] = $orders;
}

/* ------------------------------------------------------------------ */
/* One order's direct costs: EXPECTED and ACTUAL, UNKNOWN never zero    */
/* ------------------------------------------------------------------ */

function biz_order_has_video(array $o): bool
{
    foreach ($o['items'] as $i) {
        if ($i['category'] === 'VIDEO_ENHANCEMENT') {
            return true;
        }
    }
    return false;
}

/**
 * The order's costs on one basis. Each required category is either a known
 * amount or listed in `missing`; the total and contribution exist only when
 * nothing required is missing.
 */
function biz_order_costs(array $o): array
{
    $refunds = array_sum(array_map(static fn (array $r): int => $r['amount_minor'], array_filter($o['refunds'], static fn (array $r): bool => $r['currency'] === $o['currency'])));
    if ($o['legacy_refunded'] && $o['refunds'] === []) {
        $refunds = $o['total_minor'];
    }
    $net = $o['total_minor'] - $refunds;
    $entries = static fn (string $cat, string $basis): array => array_values(array_filter($o['entries'], static fn (array $e): bool => $e['category'] === $cat && $e['basis'] === $basis && $e['currency'] === $o['currency']));
    $sum = static fn (array $rows): int => array_sum(array_map(static fn (array $e): int => (int) $e['amount_minor'], $rows));
    $replacements = array_values(array_filter($o['remedies'], static fn (array $r): bool => in_array($r['status'], ['AUTHORISED', 'IN_PROGRESS', 'COMPLETED'], true)));
    $out = [];
    foreach (['EXPECTED', 'ACTUAL'] as $basis) {
        $costs = [];
        $missing = [];
        if ($o['physical']) {
            if ($basis === 'EXPECTED') {
                $e = $o['expected_economics'];
                if ($e !== null && $e['total_cost_minor'] !== null && $e['currency'] === $o['currency']) {
                    $costs['SUPPLIER_PRODUCT_COST'] = (int) $e['purchase_cost_minor'];
                    $costs['SUPPLIER_SHIPPING'] = (int) $e['shipping_cost_minor'];
                    // Internal allowances as approved on the route; they are part of the expected total, counted once.
                    $costs['SHIPPING_CONTINGENCY'] = (int) ($e['contingency_minor'] ?? 0);
                    $costs['MCB_FULFILMENT_HANDLING_ALLOWANCE'] = (int) ($e['handling_minor'] ?? 0);
                } else {
                    $missing[] = 'SUPPLIER_PRODUCT_COST';
                    $missing[] = 'SUPPLIER_SHIPPING';
                }
            } else {
                $recorded = array_values(array_filter($o['supplier_orders'], static fn (array $s): bool => $s['status'] === 'RECORDED'));
                $purchaseKnown = $recorded !== [] && array_filter($recorded, static fn (array $s): bool => $s['actual_purchase_cost_minor'] === null || $s['currency'] !== $o['currency']) === [];
                $shippingKnown = $recorded !== [] && array_filter($recorded, static fn (array $s): bool => $s['actual_shipping_cost_minor'] === null || $s['currency'] !== $o['currency']) === [];
                if ($purchaseKnown) {
                    $costs['SUPPLIER_PRODUCT_COST'] = array_sum(array_map(static fn (array $s): int => (int) $s['actual_purchase_cost_minor'], $recorded));
                } else {
                    $missing[] = 'SUPPLIER_PRODUCT_COST';
                }
                if ($shippingKnown) {
                    $costs['SUPPLIER_SHIPPING'] = array_sum(array_map(static fn (array $s): int => (int) $s['actual_shipping_cost_minor'], $recorded));
                } else {
                    $missing[] = 'SUPPLIER_SHIPPING';
                }
                // Tax or duty where known (never assumed; absence adds nothing and is not recorded as £0).
                $taxed = array_filter($recorded, static fn (array $s): bool => $s['actual_tax_duty_minor'] !== null && $s['currency'] === $o['currency']);
                if ($taxed !== []) {
                    $costs['SUPPLIER_TAX_DUTY'] = array_sum(array_map(static fn (array $s): int => (int) $s['actual_tax_duty_minor'], $taxed));
                }
            }
        }
        if (biz_order_has_video($o)) {
            if ($basis === 'EXPECTED') {
                $rows = $entries('VIDEO_PRODUCTION_COST', 'EXPECTED');
                if ($rows === []) {
                    $missing[] = 'VIDEO_PRODUCTION_COST';
                } else {
                    $costs['VIDEO_PRODUCTION_COST'] = $sum($rows);
                }
            } else {
                $jobs = $o['video_jobs'];
                // The platform allowance is not free: a video with no recorded cost is UNKNOWN.
                if ($jobs === [] || array_filter($jobs, static fn (array $j): bool => $j['production_cost_minor'] === null) !== []) {
                    $missing[] = 'VIDEO_PRODUCTION_COST';
                } else {
                    $costs['VIDEO_PRODUCTION_COST'] = array_sum(array_map(static fn (array $j): int => (int) $j['production_cost_minor'], $jobs));
                }
            }
        }
        // ACTUAL-FIRST: a recorded actual fee is the fee on both bases; an expected
        // entry is used only before the actual exists; otherwise UNKNOWN, never £0.
        $fees = $entries('PAYMENT_PROCESSING_FEE', 'ACTUAL');
        if ($fees === [] && $basis === 'EXPECTED') {
            $fees = $entries('PAYMENT_PROCESSING_FEE', 'EXPECTED');
        }
        if ($fees !== []) {
            $costs['PAYMENT_PROCESSING_FEE'] = $sum($fees);
        } else {
            $missing[] = 'PAYMENT_PROCESSING_FEE';
        }
        if ($replacements !== []) {
            $rows = $entries('REPLACEMENT_COST', $basis);
            $covered = array_unique(array_map(static fn (array $e): int => (int) $e['remedy_id'], $rows));
            if (count(array_filter($replacements, static fn (array $r): bool => !in_array((int) $r['id'], $covered, true))) > 0) {
                $missing[] = 'REPLACEMENT_COST';
            }
            if ($rows !== []) {
                $costs['REPLACEMENT_COST'] = $sum($rows);
            }
        }
        if (($other = $entries('OTHER_DIRECT_COST', $basis)) !== []) {
            $costs['OTHER_DIRECT_COST'] = $sum($other);
        }
        $complete = $missing === [];
        $total = $complete ? array_sum($costs) : null;
        $contribution = $complete ? $net - $total : null;
        $out[strtolower($basis)] = [
            'costs' => $costs, 'missing' => array_values(array_unique($missing)), 'complete' => $complete,
            'known_cost_minor' => array_sum($costs), 'total_cost_minor' => $total, 'contribution_minor' => $contribution,
            'contribution_percent' => $complete && $net > 0 ? round($contribution * 100 / $net, 1) : null,
        ];
    }
    return $out + ['gross_minor' => $o['total_minor'], 'refunds_minor' => $refunds, 'net_minor' => $net];
}

/* ------------------------------------------------------------------ */
/* Revenue and contribution                                             */
/* ------------------------------------------------------------------ */

/** Orders MCB counts in GBP management totals: live, GBP. */
function biz_live_gbp(array $orders): array
{
    return array_filter($orders, static fn (array $o): bool => $o['live'] && $o['currency'] === 'GBP');
}

function biz_revenue(array $orders, array $period): array
{
    $live = biz_live_gbp($orders);
    $inPeriod = array_filter($live, static fn (array $o): bool => biz_in($o['paid_at'], $period));
    $gross = array_sum(array_column($inPeriod, 'total_minor'));
    // Refunds in the period they were recorded (a legacy REFUNDED order without a record: at its payment).
    $refunds = 0;
    $full = 0;
    $partial = 0;
    foreach ($live as $o) {
        foreach ($o['refunds'] as $r) {
            if ($r['currency'] === 'GBP' && biz_in($r['recorded_at'], $period)) {
                $refunds += $r['amount_minor'];
                if ($r['type'] === 'PARTIAL') {
                    $partial += $r['amount_minor'];
                } else {
                    $full += $r['amount_minor'];
                }
            }
        }
        if ($o['legacy_refunded'] && $o['refunds'] === [] && biz_in($o['paid_at'], $period)) {
            $refunds += $o['total_minor'];
            $full += $o['total_minor'];
        }
    }
    $test = array_filter($orders, static fn (array $o): bool => !$o['live'] && biz_in($o['paid_at'], $period));
    $other = [];
    foreach (array_filter($orders, static fn (array $o): bool => $o['live'] && $o['currency'] !== 'GBP' && biz_in($o['paid_at'], $period)) as $o) {
        $other[$o['currency']] = ['currency' => $o['currency'], 'orders' => ($other[$o['currency']]['orders'] ?? 0) + 1, 'gross_paid_minor' => ($other[$o['currency']]['gross_paid_minor'] ?? 0) + $o['total_minor']];
    }
    return [
        'label' => $period['label'], 'partial' => $period['partial'], 'currency' => 'GBP',
        'gross_paid_minor' => $gross, 'refunds_minor' => $refunds, 'full_refunds_minor' => $full, 'partial_refunds_minor' => $partial,
        'net_paid_minor' => $gross - $refunds, 'orders' => count($inPeriod),
        'average_order_minor' => count($inPeriod) > 0 ? intdiv($gross, count($inPeriod)) : null,
        'test' => ['orders' => count($test), 'gross_paid_minor' => array_sum(array_column($test, 'total_minor')), 'note' => 'TEST payments are rehearsals and never revenue.'],
        'other_currencies' => array_values($other),
    ];
}

/** Expected and actual gross contribution for the orders paid in a period, only from complete orders. */
function biz_contribution(array $orders, array $period): array
{
    $in = array_filter(biz_live_gbp($orders), static fn (array $o): bool => biz_in($o['paid_at'], $period));
    $out = ['label' => $period['label'], 'partial' => $period['partial'], 'paid_orders' => count($in),
        'note' => 'Gross contribution: net paid revenue minus known direct costs, only for orders with every required cost recorded. Not net profit — overheads, tax, creative time and marketing are not included.'];
    foreach (['expected', 'actual'] as $basis) {
        $complete = array_filter($in, static fn (array $o): bool => $o['costs'][$basis]['complete']);
        $net = array_sum(array_map(static fn (array $o): int => $o['costs']['net_minor'], $complete));
        $contribution = array_sum(array_map(static fn (array $o): int => (int) $o['costs'][$basis]['contribution_minor'], $complete));
        $missing = [];
        foreach ($in as $o) {
            foreach ($o['costs'][$basis]['missing'] as $m) {
                $missing[$m] = ($missing[$m] ?? 0) + 1;
            }
        }
        $out[$basis] = [
            'label' => strtoupper($basis),
            'complete_orders' => count($complete),
            'incomplete_orders' => count($in) - count($complete),
            'contribution_minor' => $complete === [] ? null : $contribution,
            'net_paid_minor_of_complete' => $complete === [] ? null : $net,
            'contribution_percent' => $complete !== [] && $net > 0 ? round($contribution * 100 / $net, 1) : null,
            'based_on' => count($complete) . ' of ' . count($in) . ' paid orders',
            'awaiting' => $missing,
            'whole_business' => count($in) > 0 && count($complete) === count($in),
        ];
    }
    return $out;
}

/* ------------------------------------------------------------------ */
/* Products, Moment, video, enhancements                                */
/* ------------------------------------------------------------------ */

function biz_catalogue(): array
{
    return catalogue_data();
}

/** Per canonical SKU. Order-level costs are attributed only where the SKU is the order's only line (exact attribution). */
function biz_products(array $orders): array
{
    $live = biz_live_gbp($orders);
    $skus = biz_catalogue()['skus'] ?? [];
    $rows = [];
    foreach ($skus as $sku => $s) {
        if (($s['orderable'] ?? true) === true) {
            $rows[$sku] = ['sku' => $sku, 'name' => $s['name'], 'product_id' => $s['product_id'], 'category' => $s['category'], 'price_minor' => $s['price_minor'], 'retired' => false];
        }
    }
    $acc = [];
    foreach ($live as $o) {
        foreach ($o['items'] as $i) {
            $sku = $i['sku'];
            if (!isset($rows[$sku])) {
                $rows[$sku] = ['sku' => $sku, 'name' => $skus[$sku]['name'] ?? $sku, 'product_id' => $i['product_id'], 'category' => $i['category'], 'price_minor' => null, 'retired' => true];
            }
            $a = &$acc[$sku];
            $a['orders'][$o['id']] = true;
            $a['units'] = ($a['units'] ?? 0) + $i['quantity'];
            $a['revenue'] = ($a['revenue'] ?? 0) + $i['line_minor'];
            unset($a);
        }
    }
    $out = [];
    foreach ($rows as $sku => $r) {
        $ids = array_keys($acc[$sku]['orders'] ?? []);
        $n = count($ids);
        $units = (int) ($acc[$sku]['units'] ?? 0);
        $revenue = (int) ($acc[$sku]['revenue'] ?? 0);
        $withOrders = array_map(static fn (int $id): array => $live[$id], $ids);
        $refundValue = array_sum(array_map(static fn (array $o): int => $o['costs']['refunds_minor'], $withOrders));
        $refunded = count(array_filter($withOrders, static fn (array $o): bool => $o['costs']['refunds_minor'] > 0));
        $replaced = count(array_filter($withOrders, static fn (array $o): bool => array_filter($o['remedies'], static fn (array $m): bool => in_array($m['status'], ['AUTHORISED', 'IN_PROGRESS', 'COMPLETED'], true)) !== []));
        $cases = array_sum(array_map(static fn (array $o): int => count($o['cases']), $withOrders));
        $single = array_filter($withOrders, static fn (array $o): bool => count($o['items']) === 1);
        $basisView = [];
        foreach (['expected', 'actual'] as $basis) {
            $complete = array_filter($single, static fn (array $o): bool => $o['costs'][$basis]['complete']);
            $net = array_sum(array_map(static fn (array $o): int => $o['costs']['net_minor'], $complete));
            $cost = array_sum(array_map(static fn (array $o): int => (int) $o['costs'][$basis]['total_cost_minor'], $complete));
            $basisView[$basis] = [
                'attributable_orders' => count($single), 'complete_orders' => count($complete),
                'direct_cost_minor' => $complete === [] ? null : $cost,
                'contribution_minor' => $complete === [] ? null : $net - $cost,
                'contribution_percent' => $complete !== [] && $net > 0 ? round(($net - $cost) * 100 / $net, 1) : null,
            ];
        }
        $out[] = $r + [
            'orders' => $n, 'units' => $units, 'paid_revenue_minor' => $revenue,
            'average_selling_price_minor' => $units > 0 ? intdiv($revenue, $units) : null,
            'refund_value_on_orders_minor' => $refundValue,
            'refund_rate' => $n > 0 ? round($refunded / $n, 4) : null,
            'replacement_rate' => $n > 0 ? round($replaced / $n, 4) : null,
            'support_cases' => $cases,
            'expected' => $basisView['expected'], 'actual' => $basisView['actual'],
        ] + biz_sample($n);
    }
    usort($out, static fn (array $a, array $b): int => [$b['paid_revenue_minor'], $a['sku']] <=> [$a['paid_revenue_minor'], $b['sku']]);
    return ['products' => $out, 'note' => 'Costs are attributed to a product only for orders where it is the only item. Refunds and support cases are those on orders containing the product.'];
}

function biz_has_sku(array $o, string $sku): bool
{
    foreach ($o['items'] as $i) {
        if ($i['sku'] === $sku) {
            return true;
        }
    }
    return false;
}

function biz_has_category(array $o, string $category): bool
{
    foreach ($o['items'] as $i) {
        if ($i['category'] === $category) {
            return true;
        }
    }
    return false;
}

function biz_moment(array $orders): array
{
    $video = catalogue_data()['rules']['memory_video_sku'] ?? 'memory-music-video';
    $moment = array_filter(biz_live_gbp($orders), static fn (array $o): bool => biz_has_sku($o, 'moment'));
    $withVideo = array_filter($moment, static fn (array $o): bool => biz_has_sku($o, $video));
    $only = array_filter($moment, static fn (array $o): bool => count($o['items']) === 1);
    $n = count($moment);
    $revenue = 0;
    foreach ($moment as $o) {
        foreach ($o['items'] as $i) {
            $revenue += $i['sku'] === 'moment' ? $i['line_minor'] : 0;
        }
    }
    $complete = array_filter($moment, static fn (array $o): bool => $o['costs']['actual']['complete']);
    return [
        'price_minor' => (int) catalogue_data()['skus']['moment']['price_minor'],
        'with_video_price_minor' => (int) catalogue_data()['skus']['moment']['price_minor'] + (int) catalogue_data()['skus'][$video]['price_minor'],
        'orders' => $n, 'moment_revenue_minor' => $revenue,
        'order_revenue_minor' => array_sum(array_column($moment, 'total_minor')),
        'moment_only_orders' => count($only), 'moment_with_video_orders' => count($withVideo),
        'video_attachment_rate' => $n > 0 ? round(count($withVideo) / $n, 4) : null,
        'average_order_minor' => $n > 0 ? intdiv(array_sum(array_column($moment, 'total_minor')), $n) : null,
        'refunds_minor' => array_sum(array_map(static fn (array $o): int => $o['costs']['refunds_minor'], $moment)),
        'actual_contribution_minor' => $complete === [] ? null : array_sum(array_map(static fn (array $o): int => (int) $o['costs']['actual']['contribution_minor'], $complete)),
        'actual_contribution_based_on' => count($complete) . ' of ' . $n . ' Moment orders',
    ] + biz_sample($n);
}

function biz_video(PDO $pdo, array $orders): array
{
    $sku = catalogue_data()['rules']['memory_video_sku'] ?? 'memory-music-video';
    $live = biz_live_gbp($orders);
    $eligible = array_filter($live, static fn (array $o): bool => biz_has_category($o, 'SONG_EXPERIENCE'));
    $withVideo = array_filter($live, static fn (array $o): bool => biz_has_sku($o, $sku));
    $metrics = video_metrics($pdo);
    $capacity = video_capacity_readonly($pdo);
    $jobs = array_merge(...array_values(array_map(static fn (array $o): array => $o['video_jobs'], $withVideo)) ?: [[]]);
    $costed = array_filter($jobs, static fn (array $j): bool => $j['production_cost_minor'] !== null);
    $revenue = 0;
    foreach ($withVideo as $o) {
        foreach ($o['items'] as $i) {
            $revenue += $i['sku'] === $sku ? $i['line_minor'] : 0;
        }
    }
    $costedRevenue = 0;
    foreach ($withVideo as $o) {
        if ($o['video_jobs'] !== [] && array_filter($o['video_jobs'], static fn (array $j): bool => $j['production_cost_minor'] === null) === []) {
            foreach ($o['items'] as $i) {
                $costedRevenue += $i['sku'] === $sku ? $i['line_minor'] : 0;
            }
        }
    }
    $purchased = count($withVideo);
    return [
        'price_minor' => (int) catalogue_data()['skus'][$sku]['price_minor'],
        'offer_impressions' => $metrics['offer_impressions'], 'selections' => $metrics['selections'], 'purchases' => $purchased,
        'offer_to_purchase_rate' => $metrics['offer_impressions'] > 0 ? round($purchased / $metrics['offer_impressions'], 4) : null,
        'offer_counts_note' => 'Offer views and selections are counted for all site visitors, including TEST rehearsals; purchases are live paid orders only.',
        'eligible_orders' => count($eligible), 'attachment_rate' => count($eligible) > 0 ? round($purchased / count($eligible), 4) : null,
        'video_revenue_minor' => $revenue, 'average_selling_price_minor' => $purchased > 0 ? intdiv($revenue, $purchased) : null,
        'capacity' => ['planned' => $capacity['planned'], 'reserved' => $capacity['reserved'] + $capacity['held'], 'completed' => $capacity['completed'], 'remaining' => $capacity['remaining'],
            'utilisation' => $capacity['planned'] > 0 ? round(($capacity['reserved'] + $capacity['held'] + $capacity['completed']) / $capacity['planned'], 4) : null,
            'label' => $capacity['label'], 'verification' => $capacity['verification'], 'period' => $capacity['period_key'], 'state' => $capacity['state']],
        'rework_rate' => $metrics['rework_rate'], 'qc_failure_rate' => $metrics['qc_failure_rate'], 'average_production_hours' => $metrics['average_production_hours'],
        'refund_value_on_orders_minor' => array_sum(array_map(static fn (array $o): int => $o['costs']['refunds_minor'], $withVideo)),
        'support_cases' => array_sum(array_map(static fn (array $o): int => count(array_filter($o['cases'], static fn (array $c): bool => $c['kind'] === 'VIDEO_PROBLEM')), $withVideo)),
        'production_cost' => ['videos' => count($jobs), 'with_recorded_cost' => count($costed), 'known_cost_minor' => $costed === [] ? null : array_sum(array_map(static fn (array $j): int => (int) $j['production_cost_minor'], $costed)),
            'note' => 'The platform allowance is not free. A video without a recorded production cost is UNKNOWN, not £0.'],
        'known_contribution_minor' => $costed === [] ? null : $costedRevenue - array_sum(array_map(static fn (array $j): int => (int) $j['production_cost_minor'], $costed)),
        'known_contribution_based_on' => count($costed) . ' of ' . count($jobs) . ' videos with a recorded cost (before payment fees and refunds)',
        'pricing_evidence' => [
            'current_price_minor' => (int) catalogue_data()['skus'][$sku]['price_minor'],
            'launch_price_authoritative' => true,
            'price_test' => biz_data()['founder_decisions']['video_price_test'],
            'note' => 'The £49 launch price is authoritative (founder decision). No price test is authorised and no price changes automatically.',
        ],
    ] + biz_sample($purchased);
}

function biz_enhancements(array $orders): array
{
    $live = biz_live_gbp($orders);
    $base = 0;
    $enh = 0;
    $lines = 0;
    $with = [];
    $without = [];
    foreach ($live as $o) {
        $count = 0;
        foreach ($o['items'] as $i) {
            if ($i['category'] === 'SONG_EXPERIENCE') {
                $base += $i['line_minor'];
            } else {
                $enh += $i['line_minor'];
                $count++;
            }
        }
        $lines += $count;
        if ($count > 0) {
            $with[] = $o['total_minor'];
        } else {
            $without[] = $o['total_minor'];
        }
    }
    $n = count($live);
    return [
        'base_product_revenue_minor' => $base, 'enhancement_revenue_minor' => $enh,
        'delivery_charged_minor' => array_sum(array_column($live, 'delivery_minor')),
        'enhancement_attachment_rate' => $n > 0 ? round(count($with) / $n, 4) : null,
        'average_enhancements_per_order' => $n > 0 ? round($lines / $n, 2) : null,
        'average_order_with_enhancement_minor' => $with === [] ? null : intdiv(array_sum($with), count($with)),
        'average_order_without_enhancement_minor' => $without === [] ? null : intdiv(array_sum($without), count($without)),
        'orders_with_enhancement' => count($with), 'orders_without_enhancement' => count($without),
        'note' => 'A difference in average order value is a correlation, not proof that an enhancement caused it.',
    ] + biz_sample($n);
}

/* ------------------------------------------------------------------ */
/* Refunds, replacements, support, root causes                          */
/* ------------------------------------------------------------------ */

function biz_refunds(array $orders): array
{
    $live = biz_live_gbp($orders);
    $cases = [];
    foreach ($live as $o) {
        foreach ($o['cases'] as $c) {
            $cases[(int) $c['id']] = $c;
        }
    }
    $full = ['count' => 0, 'minor' => 0];
    $partial = ['count' => 0, 'minor' => 0];
    $byKind = [];
    $byRoot = [];
    $byProduct = [];
    $refundedOrders = 0;
    foreach ($live as $o) {
        if ($o['refunds'] !== []) {
            $refundedOrders++;
        }
        foreach ($o['refunds'] as $r) {
            if ($r['type'] === 'FULL') {
                $full['count']++;
                $full['minor'] += $r['amount_minor'];
            } else {
                $partial['count']++;
                $partial['minor'] += $r['amount_minor'];
            }
            $case = $r['case_id'] !== null ? ($cases[$r['case_id']] ?? null) : null;
            $kind = $case['kind'] ?? 'NO_CASE';
            $root = $case['root_cause'] ?? 'NOT_RECORDED';
            $byKind[$kind] = ['count' => ($byKind[$kind]['count'] ?? 0) + 1, 'minor' => ($byKind[$kind]['minor'] ?? 0) + $r['amount_minor']];
            $byRoot[$root] = ['count' => ($byRoot[$root]['count'] ?? 0) + 1, 'minor' => ($byRoot[$root]['minor'] ?? 0) + $r['amount_minor']];
            foreach (array_unique(array_column($o['items'], 'sku')) as $sku) {
                $byProduct[$sku] = ['count' => ($byProduct[$sku]['count'] ?? 0) + 1, 'minor' => ($byProduct[$sku]['minor'] ?? 0) + $r['amount_minor']];
            }
        }
    }
    return [
        'full_refunds' => $full, 'partial_refunds' => $partial, 'refund_value_minor' => $full['minor'] + $partial['minor'],
        'refund_rate' => count($live) > 0 ? round($refundedOrders / count($live), 4) : null, 'refunded_orders' => $refundedOrders,
        'by_reason' => $byKind, 'by_root_cause' => $byRoot, 'by_product_on_orders' => $byProduct,
        'note' => 'Refunds MCB has recorded (decided by a founder and made outside MCB\'s system). Reasons are the case type; staff notes and customer messages are not shown.',
    ] + biz_sample(count($live));
}

function biz_replacements(array $orders): array
{
    $live = biz_live_gbp($orders);
    $status = [];
    $actualKnown = 0;
    $actualMinor = 0;
    $authorisedNoCost = 0;
    $ordersWithRecovery = [];
    $byProduct = [];
    foreach ($live as $o) {
        foreach ($o['remedies'] as $m) {
            $status[$m['status']] = ($status[$m['status']] ?? 0) + 1;
            if (!in_array($m['status'], ['AUTHORISED', 'IN_PROGRESS', 'COMPLETED'], true)) {
                continue;
            }
            $costRows = array_filter($o['entries'], static fn (array $e): bool => $e['category'] === 'REPLACEMENT_COST' && $e['basis'] === 'ACTUAL' && (int) $e['remedy_id'] === (int) $m['id']);
            if ($costRows === []) {
                // Authorisation is not spend until the actual cost is recorded.
                $authorisedNoCost++;
                continue;
            }
            $amount = array_sum(array_map(static fn (array $e): int => (int) $e['amount_minor'], $costRows));
            $actualKnown++;
            $actualMinor += $amount;
            $ordersWithRecovery[$o['id']] = ($ordersWithRecovery[$o['id']] ?? 0) + $amount;
            foreach (array_unique(array_column($o['items'], 'sku')) as $sku) {
                $byProduct[$sku] = ($byProduct[$sku] ?? 0) + $amount;
            }
        }
    }
    return [
        'required' => array_sum($status), 'by_status' => $status,
        'authorised_or_later' => ($status['AUTHORISED'] ?? 0) + ($status['IN_PROGRESS'] ?? 0) + ($status['COMPLETED'] ?? 0),
        'completed' => $status['COMPLETED'] ?? 0,
        'with_actual_cost' => $actualKnown, 'known_actual_cost_minor' => $actualKnown === 0 ? null : $actualMinor,
        'authorised_without_actual_cost' => $authorisedNoCost,
        'recovery_cost_per_affected_order_minor' => $ordersWithRecovery === [] ? null : intdiv(array_sum($ordersWithRecovery), count($ordersWithRecovery)),
        'known_recovery_cost_by_product_minor' => $byProduct,
        'note' => 'A replacement counts as spend only when its actual cost is recorded. Authorised replacements without a recorded cost are UNKNOWN.',
    ];
}

function biz_support(array $orders): array
{
    $live = biz_live_gbp($orders);
    $cases = array_merge(...array_values(array_map(static fn (array $o): array => $o['cases'], $live)) ?: [[]]);
    $kinds = array_count_values(array_column($cases, 'kind'));
    $classes = array_count_values(array_column($cases, 'classification'));
    $replaced = count(array_filter($live, static fn (array $o): bool => array_filter($o['remedies'], static fn (array $m): bool => in_array($m['status'], ['AUTHORISED', 'IN_PROGRESS', 'COMPLETED'], true)) !== []));
    $byProduct = [];
    foreach ($live as $o) {
        foreach (array_unique(array_column($o['items'], 'sku')) as $sku) {
            $byProduct[$sku]['orders'] = ($byProduct[$sku]['orders'] ?? 0) + 1;
            $byProduct[$sku]['cases'] = ($byProduct[$sku]['cases'] ?? 0) + count($o['cases']);
        }
    }
    foreach ($byProduct as $sku => $p) {
        $byProduct[$sku]['cases_per_order'] = round($p['cases'] / $p['orders'], 3);
    }
    $refundReviews = 0;
    foreach ($live as $o) {
        $refundReviews += count($o['refunds']);
    }
    $n = count($live);
    return [
        'cases' => count($cases), 'cases_per_order' => $n > 0 ? round(count($cases) / $n, 3) : null,
        'repeat_contacts' => array_sum(array_map(static fn (array $c): int => (int) $c['repeat_contacts'], $cases)),
        'objective_mcb_errors' => $classes['OBJECTIVE_MCB_ERROR'] ?? 0, 'subjective_preference_contacts' => $classes['SUBJECTIVE_CREATIVE_PREFERENCE'] ?? 0,
        'damage' => $kinds['DAMAGED_OR_FAULTY'] ?? 0, 'wrong_item' => $kinds['WRONG_ITEM'] ?? 0, 'delivery_problem' => $kinds['DELIVERY_PROBLEM'] ?? 0,
        'video_problem' => $kinds['VIDEO_PROBLEM'] ?? 0, 'by_kind' => $kinds,
        'recorded_refunds' => $refundReviews, 'replacement_rate' => $n > 0 ? round($replaced / $n, 4) : null,
        'by_product' => $byProduct,
        'note' => 'Operational burden only. No labour cost is assigned: MCB has not recorded one.',
    ] + biz_sample($n);
}

function biz_root_causes(array $orders): array
{
    $live = biz_live_gbp($orders);
    $withCause = 0;
    $out = [];
    foreach (care_data()['root_causes'] as $cause) {
        $out[$cause] = ['root_cause' => $cause, 'count' => 0, 'products' => [], 'routes' => [], 'refund_value_minor' => 0, 'known_replacement_cost_minor' => 0];
    }
    foreach ($live as $o) {
        foreach ($o['cases'] as $c) {
            if ($c['root_cause'] === null) {
                continue;
            }
            $withCause++;
            $row = &$out[$c['root_cause']];
            $row['count']++;
            foreach ($o['items'] as $i) {
                $row['products'][$i['sku']] = true;
            }
            foreach ($o['supplier_orders'] as $s) {
                if ($s['route_id'] !== null) {
                    $row['routes'][$s['route_id']] = true;
                }
            }
            foreach ($o['refunds'] as $r) {
                if ($r['case_id'] === (int) $c['id']) {
                    $row['refund_value_minor'] += $r['amount_minor'];
                }
            }
            foreach ($o['remedies'] as $m) {
                if ((int) $m['case_id'] !== (int) $c['id']) {
                    continue;
                }
                foreach ($o['entries'] as $e) {
                    if ($e['category'] === 'REPLACEMENT_COST' && $e['basis'] === 'ACTUAL' && (int) $e['remedy_id'] === (int) $m['id']) {
                        $row['known_replacement_cost_minor'] += (int) $e['amount_minor'];
                    }
                }
            }
            unset($row);
        }
    }
    return [
        'cases_with_root_cause' => $withCause,
        'root_causes' => array_values(array_map(static fn (array $r): array => [
            'root_cause' => $r['root_cause'], 'count' => $r['count'], 'rate' => $withCause > 0 ? round($r['count'] / $withCause, 4) : null,
            'products_affected' => array_keys($r['products']), 'routes_affected' => array_keys($r['routes']),
            'refund_value_minor' => $r['refund_value_minor'], 'known_replacement_cost_minor' => $r['known_replacement_cost_minor'],
        ], $out)),
        'note' => 'Evidence, not blame. Rates are shares of resolved cases that recorded a root cause.',
    ] + biz_sample($withCause);
}

/* ------------------------------------------------------------------ */
/* Supplier routes (staff only)                                          */
/* ------------------------------------------------------------------ */

function biz_supplier_routes(array $orders): array
{
    $routes = [];
    foreach (supplier_routes() as $r) {
        $routes[$r['route_id']] = ['route_id' => $r['route_id'], 'supplier' => $r['supplier'] ?? null, 'verification_status' => $r['verification_status'] ?? null, 'verification_state' => $r['verification_state'] ?? null];
    }
    $acc = [];
    foreach ($orders as $o) {
        if (!$o['live']) {
            continue;
        }
        foreach ($o['supplier_orders'] as $s) {
            $id = $s['route_id'] ?? 'NO_ROUTE_RECORDED';
            $a = &$acc[$id];
            $a['orders'][$o['id']] = true;
            $a['supplier_orders'] = ($a['supplier_orders'] ?? 0) + 1;
            $a['cancelled'] = ($a['cancelled'] ?? 0) + ($s['status'] === 'CANCELLED_BY_SUPPLIER' ? 1 : 0);
            if ($s['actual_purchase_cost_minor'] !== null) {
                $a['actual_purchase_minor'] = ($a['actual_purchase_minor'] ?? 0) + (int) $s['actual_purchase_cost_minor'];
                $a['actual_purchase_known'] = ($a['actual_purchase_known'] ?? 0) + 1;
            }
            if ($s['actual_purchase_cost_minor'] !== null && $s['expected_purchase_cost_minor'] !== null) {
                $a['purchase_variance_minor'] = ($a['purchase_variance_minor'] ?? 0) + (int) $s['actual_purchase_cost_minor'] - (int) $s['expected_purchase_cost_minor'];
                $a['purchase_expected_minor'] = ($a['purchase_expected_minor'] ?? 0) + (int) $s['expected_purchase_cost_minor'];
                $a['purchase_compared'] = ($a['purchase_compared'] ?? 0) + 1;
            }
            if ($s['actual_tax_duty_minor'] !== null) {
                $a['actual_tax_duty_minor'] = ($a['actual_tax_duty_minor'] ?? 0) + (int) $s['actual_tax_duty_minor'];
            }
            if ($s['actual_shipping_cost_minor'] !== null && $s['expected_shipping_cost_minor'] !== null) {
                $a['shipping_variance_minor'] = ($a['shipping_variance_minor'] ?? 0) + (int) $s['actual_shipping_cost_minor'] - (int) $s['expected_shipping_cost_minor'];
                $a['shipping_compared'] = ($a['shipping_compared'] ?? 0) + 1;
            }
            if ($o['country_code'] !== null) {
                $a['destinations'][$o['country_code']] = ($a['destinations'][$o['country_code']] ?? 0) + 1;
            }
            unset($a);
        }
    }
    $out = [];
    foreach ($acc as $id => $a) {
        $ids = array_keys($a['orders']);
        $n = count($ids);
        $routeOrders = array_map(static fn (int $oid): array => $orders[$oid], $ids);
        $kinds = [];
        $exceptions = 0;
        foreach ($routeOrders as $o) {
            foreach ($o['cases'] as $c) {
                $kinds[$c['kind']] = ($kinds[$c['kind']] ?? 0) + 1;
            }
            $supplierExceptions = array_filter($o['exceptions'], static fn (array $x): bool => in_array($x['type'], ['SUPPLIER_DELAY', 'SUPPLIER_CANCELLED', 'WRONG_ITEM', 'MANUFACTURING_DEFECT', 'PARCEL_DAMAGED', 'PARCEL_LOST', 'TRACKING_STALLED'], true));
            $exceptions += $supplierExceptions === [] ? 0 : 1;
        }
        $replaced = count(array_filter($routeOrders, static fn (array $o): bool => array_filter($o['remedies'], static fn (array $m): bool => in_array($m['status'], ['AUTHORISED', 'IN_PROGRESS', 'COMPLETED'], true)) !== []));
        $out[$id] = ($routes[$id] ?? ['route_id' => $id, 'supplier' => null, 'verification_status' => null]) + [
            'orders' => $n, 'supplier_orders' => $a['supplier_orders'],
            'actual_purchase_cost_minor' => isset($a['actual_purchase_minor']) ? $a['actual_purchase_minor'] : null,
            'actual_purchase_known' => $a['actual_purchase_known'] ?? 0,
            'purchase_variance_minor' => $a['purchase_variance_minor'] ?? null,
            'purchase_variance_percent' => isset($a['purchase_expected_minor']) && $a['purchase_expected_minor'] > 0 ? round($a['purchase_variance_minor'] * 100 / $a['purchase_expected_minor'], 1) : null,
            'shipping_variance_minor' => $a['shipping_variance_minor'] ?? null,
            'actual_tax_duty_minor' => $a['actual_tax_duty_minor'] ?? null,
            'cancellation_rate' => round($a['cancelled'] / max(1, $a['supplier_orders']), 4),
            'damage_rate' => round(($kinds['DAMAGED_OR_FAULTY'] ?? 0) / $n, 4),
            'wrong_item_rate' => round(($kinds['WRONG_ITEM'] ?? 0) / $n, 4),
            'exception_rate' => round($exceptions / $n, 4),
            'support_cases' => array_sum($kinds), 'replacement_rate' => round($replaced / $n, 4),
            'destinations' => $a['destinations'] ?? [],
        ] + biz_sample($n);
    }
    // Times from the existing scorecards (aggregated per route, staff only).
    foreach (supplier_scorecards(db()) as $s) {
        $id = $s['route_id'] ?? 'NO_ROUTE_RECORDED';
        if (isset($out[$id])) {
            $out[$id] += ['average_days_to_dispatch' => $s['avg_days_to_dispatch'], 'average_days_in_transit' => $s['avg_days_in_transit'], 'tracking_reliability' => $s['tracking_reliability']];
        }
    }
    foreach ($routes as $id => $r) {
        $out[$id] ??= $r + ['orders' => 0, 'supplier_orders' => 0] + biz_sample(0);
    }
    return ['routes' => array_values($out), 'internal' => true,
        'note' => 'Staff only. Evidence for founder decisions; routes are not ranked and no supplier is changed automatically. Production and dispatch times come from supplier order and parcel dates.'];
}

/** Route readiness for the Business tab: counts from the Suppliers overview (reads only). */
function biz_routing_summary(PDO $pdo): array
{
    $overview = suppliers_overview($pdo);
    return [
        'tiles' => array_map(static fn (array $t): array => ['key' => $t['key'], 'label' => $t['label'], 'count' => $t['count']], $overview['tiles']),
        'catalogue' => $overview['catalogue'],
        'research_items' => count($overview['research']),
        'note' => 'No partner is switched and no price is changed automatically. Unknown costs are shown as unknown, never £0.',
    ];
}

/* ------------------------------------------------------------------ */
/* Funnel, customers, occasions, cruise, geography                      */
/* ------------------------------------------------------------------ */

function biz_funnel(PDO $pdo, array $orders, array $period): array
{
    $where = $period['start'] === null ? '1=1' : 'created_at >= :s AND created_at < :e';
    $params = $period['start'] === null ? [] : [':s' => $period['start'], ':e' => $period['end']];
    $one = static function (string $sql) use ($pdo, $params): int {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    };
    $created = $one("SELECT COUNT(*) FROM orders WHERE {$where}");
    $checkoutLive = $one("SELECT COUNT(DISTINCT order_id) FROM checkout_sessions WHERE livemode = 1 AND {$where}");
    $paidLive = count(array_filter($orders, static fn (array $o): bool => $o['live'] && biz_in($o['paid_at'], $period)));
    $day = $period['start'] === null ? '1=1' : 'day >= DATE(:s) AND day < DATE(:e)';
    $counter = static function (string $event) use ($pdo, $day, $params): int {
        $stmt = $pdo->prepare("SELECT COALESCE(SUM(count), 0) FROM video_offer_counters WHERE event = '{$event}' AND {$day}");
        $stmt->execute($params);
        return (int) $stmt->fetchColumn();
    };
    return [
        'label' => $period['label'],
        'stages' => [
            ['stage' => 'PRODUCT_VIEWED', 'count' => null, 'coverage' => 'ANALYTICS_COVERAGE_INCOMPLETE', 'note' => 'Recorded in Google Analytics for consenting visitors only, not in MCB\'s database.'],
            ['stage' => 'PERSONALISATION_STARTED', 'count' => null, 'coverage' => 'ANALYTICS_COVERAGE_INCOMPLETE', 'note' => 'Recorded in Google Analytics for consenting visitors only, not in MCB\'s database.'],
            ['stage' => 'ORDER_CREATED', 'count' => $created, 'coverage' => 'DATABASE', 'note' => 'Orders saved before checkout. Includes TEST rehearsals: an order\'s mode is only known once checkout starts.'],
            ['stage' => 'ENHANCEMENT_VIEWED', 'count' => $counter('OFFER_VIEWED'), 'coverage' => 'VIDEO_OFFER_ONLY', 'note' => 'Memory Music Video offer only; other enhancements are not counted before purchase.'],
            ['stage' => 'ENHANCEMENT_SELECTED', 'count' => $counter('SELECTED'), 'coverage' => 'VIDEO_OFFER_ONLY', 'note' => 'Memory Music Video offer only.'],
            ['stage' => 'CHECKOUT_STARTED', 'count' => $checkoutLive, 'coverage' => 'DATABASE', 'note' => 'Orders with a live checkout session.'],
            ['stage' => 'PAYMENT_COMPLETED', 'count' => $paidLive, 'coverage' => 'DATABASE', 'note' => 'Live paid orders.'],
        ],
        'conversions' => [
            ['from' => 'CHECKOUT_STARTED', 'to' => 'PAYMENT_COMPLETED', 'rate' => $checkoutLive > 0 ? round(min($paidLive, $checkoutLive) / $checkoutLive, 4) : null],
            ['from' => 'ENHANCEMENT_VIEWED', 'to' => 'ENHANCEMENT_SELECTED', 'rate' => ($v = $counter('OFFER_VIEWED')) > 0 ? round($counter('SELECTED') / $v, 4) : null],
        ],
        'coverage' => 'ANALYTICS_COVERAGE_INCOMPLETE',
        'note' => 'Only stages MCB records are counted. Product views and personalisation starts are not estimated; product-level conversion is not shown because its denominator is not recorded.',
    ];
}

function biz_customers(array $orders): array
{
    $live = biz_live_gbp($orders);
    $by = [];
    foreach ($live as $o) {
        $by[$o['customer_id']][] = $o;
    }
    $n = count($by);
    $repeat = count(array_filter($by, static fn (array $list): bool => count($list) > 1));
    $net = array_sum(array_map(static fn (array $o): int => $o['costs']['net_minor'], $live));
    return [
        'customers' => $n, 'first_time_customers' => $n - $repeat, 'repeat_customers' => $repeat,
        'orders_per_customer' => $n > 0 ? round(count($live) / $n, 2) : null,
        'net_paid_per_customer_minor' => $n > 0 ? intdiv($net, $n) : null,
        'average_order_minor' => count($live) > 0 ? intdiv(array_sum(array_column($live, 'total_minor')), count($live)) : null,
        'repeat_purchase_rate' => $n > 0 ? round($repeat / $n, 4) : null,
        'identity' => 'One customer record per email address, from live paid orders.',
        'note' => 'Historical figures, not predicted lifetime value.',
    ] + biz_sample($n);
}

function biz_occasions(array $orders): array
{
    $labels = biz_data()['occasions'];
    $rows = [];
    foreach (biz_live_gbp($orders) as $o) {
        $keys = $o['occasions'] === [] ? ['NOT_SPECIFIED'] : array_unique($o['occasions']);
        foreach ($keys as $k) {
            $rows[$k]['orders'] = ($rows[$k]['orders'] ?? 0) + 1;
            $rows[$k]['revenue'] = ($rows[$k]['revenue'] ?? 0) + $o['total_minor'];
        }
    }
    $out = [];
    foreach ($rows as $k => $r) {
        $out[] = ['occasion' => $k, 'label' => $labels[$k] ?? ($k === 'NOT_SPECIFIED' ? 'Not specified' : 'Other'), 'orders' => $r['orders'], 'paid_revenue_minor' => $r['revenue'],
            'average_order_minor' => intdiv($r['revenue'], $r['orders'])] + biz_sample($r['orders']);
    }
    usort($out, static fn (array $a, array $b): int => $b['orders'] <=> $a['orders']);
    return ['occasions' => $out, 'note' => 'From the occasion the customer chose (a structured choice). Stories are never read for this. An order with several occasions counts under each.'];
}

function biz_cruise(array $orders): array
{
    $video = catalogue_data()['rules']['memory_video_sku'] ?? 'memory-music-video';
    $live = biz_live_gbp($orders);
    // Structured data only: the Cruise / Voyage occasion, or the cruise companions field. Never the story text.
    $cruise = array_filter($live, static fn (array $o): bool => in_array('cruise', $o['occasions'], true) || $o['cruise_companions']);
    $n = count($cruise);
    $products = [];
    foreach ($cruise as $o) {
        foreach ($o['items'] as $i) {
            $products[$i['sku']] = ($products[$i['sku']] ?? 0) + $i['quantity'];
        }
    }
    $customers = [];
    foreach ($live as $o) {
        $customers[$o['customer_id']][] = $o;
    }
    $cruiseCustomers = array_unique(array_column($cruise, 'customer_id'));
    $repeat = count(array_filter($cruiseCustomers, static fn (int $c): bool => count($customers[$c]) > 1));
    return [
        'orders' => $n, 'paid_revenue_minor' => array_sum(array_column($cruise, 'total_minor')),
        'average_order_minor' => $n > 0 ? intdiv(array_sum(array_column($cruise, 'total_minor')), $n) : null,
        'products' => $products,
        'video_attachment_rate' => $n > 0 ? round(count(array_filter($cruise, static fn (array $o): bool => biz_has_sku($o, $video))) / $n, 4) : null,
        'physical_keepsake_attachment_rate' => $n > 0 ? round(count(array_filter($cruise, static fn (array $o): bool => $o['physical'])) / $n, 4) : null,
        'repeat_purchase_rate' => count($cruiseCustomers) > 0 ? round($repeat / count($cruiseCustomers), 4) : null,
        'support_cases_per_order' => $n > 0 ? round(array_sum(array_map(static fn (array $o): int => count($o['cases']), $cruise)) / $n, 3) : null,
        'refund_rate' => $n > 0 ? round(count(array_filter($cruise, static fn (array $o): bool => $o['costs']['refunds_minor'] > 0)) / $n, 4) : null,
        'identified_by' => 'The Cruise / Voyage occasion or the cruise companions field. Private stories are never read.',
    ] + biz_sample($n);
}

function biz_geography(array $orders): array
{
    $rows = [];
    foreach (biz_live_gbp($orders) as $o) {
        $k = $o['country_code'] ?? ($o['physical'] ? 'UNKNOWN' : 'DIGITAL');
        $r = &$rows[$k];
        $r['orders'] = ($r['orders'] ?? 0) + 1;
        $r['revenue'] = ($r['revenue'] ?? 0) + $o['total_minor'];
        if ($o['physical'] && !in_array('SUPPLIER_PRODUCT_COST', $o['costs']['actual']['missing'], true) && !in_array('SUPPLIER_SHIPPING', $o['costs']['actual']['missing'], true)) {
            $r['fulfilment_known'] = ($r['fulfilment_known'] ?? 0) + 1;
            $r['fulfilment_minor'] = ($r['fulfilment_minor'] ?? 0) + ($o['costs']['actual']['costs']['SUPPLIER_PRODUCT_COST'] ?? 0) + ($o['costs']['actual']['costs']['SUPPLIER_SHIPPING'] ?? 0);
        }
        if ($o['costs']['actual']['complete']) {
            $r['complete'] = ($r['complete'] ?? 0) + 1;
            $r['contribution'] = ($r['contribution'] ?? 0) + (int) $o['costs']['actual']['contribution_minor'];
        }
        $r['delivery_exceptions'] = ($r['delivery_exceptions'] ?? 0) + count(array_filter($o['exceptions'], static fn (array $x): bool => in_array($x['type'], fulfilment_data()['delivery_exception_types'], true)));
        unset($r);
    }
    $out = [];
    foreach ($rows as $k => $r) {
        $out[] = ['country' => $k, 'orders' => $r['orders'], 'paid_revenue_minor' => $r['revenue'], 'average_order_minor' => intdiv($r['revenue'], $r['orders']),
            'actual_fulfilment_cost_minor' => $r['fulfilment_minor'] ?? null, 'actual_fulfilment_cost_based_on' => ($r['fulfilment_known'] ?? 0) . ' of ' . $r['orders'],
            'actual_contribution_minor' => isset($r['complete']) ? $r['contribution'] : null, 'actual_contribution_based_on' => ($r['complete'] ?? 0) . ' of ' . $r['orders'],
            'delivery_exceptions' => $r['delivery_exceptions']] + biz_sample($r['orders']);
    }
    usort($out, static fn (array $a, array $b): int => $b['orders'] <=> $a['orders']);
    return ['countries' => $out, 'note' => 'Delivery country only (ISO code); no address is used. DIGITAL orders have no delivery country. Small samples say nothing about a market.'];
}

/* ------------------------------------------------------------------ */
/* Alerts, data quality, recommendations, comparisons, brief            */
/* ------------------------------------------------------------------ */

function biz_alerts(PDO $pdo, array $orders): array
{
    $live = biz_live_gbp($orders);
    $out = [];
    $alert = static function (string $type, string $status, array $findings = [], array $extra = []) use (&$out): void {
        $out[] = ['type' => $type, 'status' => $status, 'findings' => $findings] + $extra;
    };
    $negative = [];
    foreach ($live as $o) {
        foreach (['expected', 'actual'] as $b) {
            if ($o['costs'][$b]['complete'] && $o['costs'][$b]['contribution_minor'] < 0) {
                $negative[] = ['reference' => $o['reference'], 'basis' => strtoupper($b), 'contribution_minor' => $o['costs'][$b]['contribution_minor']];
            }
        }
    }
    $alert('NEGATIVE_CONTRIBUTION', $negative === [] ? 'CLEAR' : 'TRIGGERED', $negative);

    $low = biz_threshold('low_contribution_percent');
    if ($low === null) {
        $alert('LOW_CONTRIBUTION', 'NOT_CONFIGURED');
    } else {
        $f = [];
        foreach ($live as $o) {
            $p = $o['costs']['actual']['contribution_percent'] ?? $o['costs']['expected']['contribution_percent'];
            if ($p !== null && $p >= 0 && $p < $low) {
                $f[] = ['reference' => $o['reference'], 'contribution_percent' => $p];
            }
        }
        $alert('LOW_CONTRIBUTION', $f === [] ? 'CLEAR' : 'TRIGGERED', $f, ['threshold' => $low]);
    }

    $variance = biz_threshold('cost_variance_percent');
    if ($variance === null) {
        $alert('COST_VARIANCE_HIGH', 'NOT_CONFIGURED');
    } else {
        $f = [];
        foreach ($live as $o) {
            foreach ($o['supplier_orders'] as $s) {
                $expected = (int) ($s['expected_purchase_cost_minor'] ?? 0) + (int) ($s['expected_shipping_cost_minor'] ?? 0);
                if ($s['actual_purchase_cost_minor'] === null || $expected <= 0) {
                    continue;
                }
                $actual = (int) $s['actual_purchase_cost_minor'] + (int) ($s['actual_shipping_cost_minor'] ?? 0);
                $pct = round(abs($actual - $expected) * 100 / $expected, 1);
                if ($pct > $variance) {
                    $f[] = ['reference' => $o['reference'], 'route_id' => $s['route_id'], 'variance_percent' => $pct];
                }
            }
        }
        $alert('COST_VARIANCE_HIGH', $f === [] ? 'CLEAR' : 'TRIGGERED', $f, ['threshold' => $variance]);
    }

    $products = biz_products($orders)['products'];
    foreach ([['REFUND_RATE_ELEVATED', 'refund_rate_percent', 'refund_rate'], ['REPLACEMENT_RATE_ELEVATED', 'replacement_rate_percent', 'replacement_rate']] as [$type, $key, $field]) {
        $t = biz_threshold($key);
        if ($t === null) {
            $alert($type, 'NOT_CONFIGURED');
            continue;
        }
        $f = array_values(array_map(static fn (array $p): array => ['sku' => $p['sku'], 'rate' => $p[$field], 'sample_size' => $p['sample_size'], 'early_data' => $p['early_data']],
            array_filter($products, static fn (array $p): bool => $p[$field] !== null && $p[$field] * 100 > $t)));
        $alert($type, $f === [] ? 'CLEAR' : 'TRIGGERED', $f, ['threshold' => $t]);
    }

    $supplier = biz_threshold('supplier_exception_rate_percent');
    if ($supplier === null) {
        $alert('SUPPLIER_EXCEPTION_ELEVATED', 'NOT_CONFIGURED');
    } else {
        $f = array_values(array_map(static fn (array $r): array => ['route_id' => $r['route_id'], 'exception_rate' => $r['exception_rate'], 'sample_size' => $r['sample_size'], 'early_data' => $r['early_data']],
            array_filter(biz_supplier_routes($orders)['routes'], static fn (array $r): bool => ($r['exception_rate'] ?? null) !== null && $r['exception_rate'] * 100 > $supplier)));
        $alert('SUPPLIER_EXCEPTION_ELEVATED', $f === [] ? 'CLEAR' : 'TRIGGERED', $f, ['threshold' => $supplier]);
    }

    $capacity = video_capacity_readonly($pdo);
    $alert('VIDEO_CAPACITY_LOW', $capacity['state'] === 'AVAILABLE' ? 'CLEAR' : 'TRIGGERED', $capacity['state'] === 'AVAILABLE' ? [] : [['state' => $capacity['state'], 'remaining' => $capacity['remaining'], 'planned' => $capacity['planned'], 'label' => $capacity['label']]],
        ['threshold' => 'video policy low-capacity figure']);

    $completeness = biz_threshold('data_completeness_percent');
    if ($completeness === null) {
        $alert('DATA_COMPLETENESS_LOW', 'NOT_CONFIGURED');
    } else {
        $complete = count(array_filter($live, static fn (array $o): bool => $o['costs']['actual']['complete']));
        $pct = count($live) > 0 ? round($complete * 100 / count($live), 1) : null;
        $alert('DATA_COMPLETENESS_LOW', $pct !== null && $pct < $completeness ? 'TRIGGERED' : 'CLEAR', $pct !== null && $pct < $completeness ? [['complete_percent' => $pct, 'complete_orders' => $complete, 'paid_orders' => count($live)]] : [], ['threshold' => $completeness]);
    }
    $meanings = array_column(biz_data()['alerts'], 'meaning', 'type');
    foreach ($out as &$a) {
        $a['meaning'] = $meanings[$a['type']];
    }
    unset($a);
    return ['alerts' => $out, 'note' => 'Alerts inform a founder decision. Nothing changes a price, cancels a paid order or switches a supplier. Unset thresholds are NOT CONFIGURED.'];
}

function biz_data_quality(PDO $pdo, array $orders): array
{
    $live = biz_live_gbp($orders);
    $physical = array_filter($live, static fn (array $o): bool => $o['physical']);
    $count = static fn (array $list, callable $f): int => count(array_filter($list, $f));
    $missing = static fn (array $o, string $basis, string $cat): bool => in_array($cat, $o['costs'][$basis]['missing'], true);
    $physicalSkus = array_keys(array_filter(catalogue_data()['skus'] ?? [], static fn (array $s): bool => ($s['fulfilment'] ?? '') === 'PHYSICAL' && ($s['orderable'] ?? true)));
    $routeless = array_values(array_filter($physicalSkus, static fn (string $sku): bool => supplier_route_for_sku($sku) === null));
    $profiles = creative_data()['capacity_profiles'];
    $unverified = count(array_filter($profiles, static fn (array $p): bool => (creative_capacity_profile((string) $p['sku'])['status'] ?? null) !== 'VERIFIED'));
    $allCases = array_merge(...array_values(array_map(static fn (array $o): array => $o['cases'], $live)) ?: [[]]);
    $refunds = array_merge(...array_values(array_map(static fn (array $o): array => $o['refunds'], $live)) ?: [[]]);
    $thresholds = array_values(array_filter(array_map(static fn (array $a): ?string => $a['threshold_key'], biz_data()['alerts']), static fn (?string $k): bool => $k !== null && $k !== 'VIDEO_POLICY' && biz_threshold($k) === null));
    $gaps = [
        ['key' => 'missing_expected_supplier_cost', 'label' => 'Physical orders without an expected supplier cost', 'count' => $count($physical, static fn (array $o): bool => $missing($o, 'expected', 'SUPPLIER_PRODUCT_COST')), 'of' => count($physical)],
        ['key' => 'missing_actual_supplier_cost', 'label' => 'Physical orders without an actual supplier cost', 'count' => $count($physical, static fn (array $o): bool => $missing($o, 'actual', 'SUPPLIER_PRODUCT_COST')), 'of' => count($physical)],
        ['key' => 'missing_actual_shipping', 'label' => 'Physical orders without actual shipping cost', 'count' => $count($physical, static fn (array $o): bool => $missing($o, 'actual', 'SUPPLIER_SHIPPING')), 'of' => count($physical)],
        ['key' => 'missing_payment_fees', 'label' => 'Paid orders without a recorded payment fee', 'count' => $count($live, static fn (array $o): bool => $missing($o, 'actual', 'PAYMENT_PROCESSING_FEE')), 'of' => count($live)],
        ['key' => 'missing_video_cost', 'label' => 'Video orders without a recorded production cost', 'count' => $count($live, static fn (array $o): bool => biz_order_has_video($o) && $missing($o, 'actual', 'VIDEO_PRODUCTION_COST')), 'of' => $count($live, 'biz_order_has_video')],
        ['key' => 'missing_replacement_cost', 'label' => 'Authorised replacements without an actual cost', 'count' => biz_replacements($orders)['authorised_without_actual_cost'], 'of' => biz_replacements($orders)['authorised_or_later']],
        ['key' => 'missing_supplier_routes', 'label' => 'Orderable physical products without a supplier route', 'count' => count($routeless), 'of' => count($physicalSkus), 'detail' => $routeless],
        ['key' => 'unverified_capacities', 'label' => 'Record formats without verified capacity, plus video capacity pending verification', 'count' => $unverified + (video_capacity_readonly($pdo)['verification'] === 'VERIFIED' ? 0 : 1), 'of' => count($profiles) + 1],
        ['key' => 'unknown_destinations', 'label' => 'Physical orders without a delivery country code', 'count' => $count($physical, static fn (array $o): bool => $o['country_code'] === null), 'of' => count($physical)],
        ['key' => 'missing_root_cause', 'label' => 'Resolved operational cases without a root cause', 'count' => count(array_filter($allCases, static fn (array $c): bool => in_array($c['status'], ['RESOLVED', 'CLOSED'], true) && !in_array($c['kind'], ['QUESTION', 'OTHER'], true) && $c['root_cause'] === null)), 'of' => count(array_filter($allCases, static fn (array $c): bool => in_array($c['status'], ['RESOLVED', 'CLOSED'], true)))],
        ['key' => 'missing_refund_references', 'label' => 'Recorded refunds without a payment provider reference', 'count' => count(array_filter($refunds, static fn (array $r): bool => !$r['has_reference'])), 'of' => count($refunds)],
        ['key' => 'analytics_coverage', 'label' => 'Funnel stages recorded only in Google Analytics (product views, personalisation starts)', 'count' => 2, 'of' => 7, 'status' => 'ANALYTICS_COVERAGE_INCOMPLETE'],
        ['key' => 'thresholds_not_configured', 'label' => 'Commercial alert thresholds not configured', 'count' => count($thresholds), 'of' => count($thresholds) + count(array_filter(biz_data()['alerts'], static fn (array $a): bool => $a['threshold_key'] !== null && $a['threshold_key'] !== 'VIDEO_POLICY' && biz_threshold($a['threshold_key']) !== null)), 'detail' => $thresholds],
        ['key' => 'foreign_currency_orders', 'label' => 'Live orders in another currency (kept in their own currency, not converted)', 'count' => count(array_filter($orders, static fn (array $o): bool => $o['live'] && $o['currency'] !== 'GBP')), 'of' => count(array_filter($orders, static fn (array $o): bool => $o['live']))],
    ];
    $complete = $count($live, static fn (array $o): bool => $o['costs']['actual']['complete']);
    return [
        'gaps' => $gaps,
        'completeness' => ['actual_complete_orders' => $complete, 'expected_complete_orders' => $count($live, static fn (array $o): bool => $o['costs']['expected']['complete']), 'paid_orders' => count($live),
            'actual_complete_percent' => count($live) > 0 ? round($complete * 100 / count($live), 1) : null],
        'cost_categories' => biz_data()['cost_categories'],
        'internal_allowance_note' => biz_data()['internal_allowance_note'],
        'note' => 'What is still too incomplete to trust. Unknown costs are never counted as £0.',
    ];
}

/** Deterministic cards from recorded data. They only ever ask for a review, with the evidence. */
function biz_recommendations(PDO $pdo, array $orders): array
{
    $cards = [];
    $card = static function (string $kind, string $text, array $evidence) use (&$cards): void {
        $cards[] = ['kind' => $kind, 'text' => $text, 'evidence' => $evidence];
    };
    $pct = static fn (float $r): string => rtrim(rtrim(number_format($r * 100, 1), '0'), '.') . '%';
    $video = biz_video($pdo, $orders);
    if ($video['eligible_orders'] > 0) {
        $card('INSIGHT', 'Video attachment is ' . $pct((float) $video['attachment_rate']) . ' across ' . $video['eligible_orders'] . ' eligible orders' . ($video['eligible_orders'] < biz_early_below() ? ' (early data).' : '.'),
            ['purchases' => $video['purchases'], 'eligible_orders' => $video['eligible_orders']]);
    }
    if ($video['production_cost']['videos'] > 0 && $video['production_cost']['with_recorded_cost'] < $video['production_cost']['videos']) {
        $card('COMPLETE_DATA', ($video['production_cost']['videos'] - $video['production_cost']['with_recorded_cost']) . ' of ' . $video['production_cost']['videos'] . ' videos have no recorded production cost. Review pricing only once video costs are known.',
            ['videos' => $video['production_cost']['videos'], 'with_recorded_cost' => $video['production_cost']['with_recorded_cost']]);
    }
    $quality = biz_data_quality($pdo, $orders);
    foreach ($quality['gaps'] as $g) {
        if (in_array($g['key'], ['missing_actual_supplier_cost', 'missing_payment_fees'], true) && $g['count'] > 0) {
            $card('COMPLETE_DATA', $g['count'] . ' of ' . $g['of'] . ' ' . strtolower(str_replace(['Physical orders without', 'Paid orders without'], ['physical orders are missing', 'paid orders are missing'], $g['label'])) . '.', ['count' => $g['count'], 'of' => $g['of']]);
        }
    }
    $support = biz_support($orders);
    if ($support['cases'] > 0 && $support['delivery_problem'] > 0) {
        $card('INSIGHT', 'Delivery problems account for ' . $support['delivery_problem'] . ' of ' . $support['cases'] . ' support cases.', ['delivery_problem' => $support['delivery_problem'], 'cases' => $support['cases']]);
    }
    foreach (biz_alerts($pdo, $orders)['alerts'] as $a) {
        if ($a['status'] !== 'TRIGGERED') {
            continue;
        }
        match ($a['type']) {
            'NEGATIVE_CONTRIBUTION' => $card('REVIEW_PRODUCT_ECONOMICS', count($a['findings']) . ' order contribution(s) are below zero on known costs. Review product economics.', ['orders' => array_column($a['findings'], 'reference')]),
            'SUPPLIER_EXCEPTION_ELEVATED', 'COST_VARIANCE_HIGH' => $card('REVIEW_SUPPLIER_ROUTE', 'Review supplier route: ' . strtolower(str_replace('_', ' ', $a['type'])) . ' above the configured threshold.', ['findings' => $a['findings']]),
            'REFUND_RATE_ELEVATED', 'REPLACEMENT_RATE_ELEVATED', 'LOW_CONTRIBUTION' => $card('REVIEW_PRODUCT_ECONOMICS', 'Review product economics: ' . strtolower(str_replace('_', ' ', $a['type'])) . ' above the configured threshold.', ['findings' => $a['findings']]),
            'VIDEO_CAPACITY_LOW' => $card('REVIEW_PRICING', 'Video capacity is ' . strtolower($a['findings'][0]['state']) . ' (' . $a['findings'][0]['remaining'] . ' of ' . $a['findings'][0]['planned'] . ' planned spaces left, pending verification). Review video pricing and capacity.', $a['findings'][0]),
            default => null,
        };
    }
    return ['cards' => $cards, 'note' => 'Calculated from recorded MCB data. These are prompts for a founder review, never instructions: nothing changes a price, a supplier or a product automatically.'];
}

/** Last complete period vs the one before; the current period is shown as partial, without a change figure. */
function biz_comparisons(array $orders, array $periods): array
{
    $compare = static function (array $current, array $previous, string $label) use ($orders): array {
        $a = biz_revenue($orders, $current);
        $b = biz_revenue($orders, $previous);
        $change = static fn (int|null $x, int|null $y): array => ['change_minor' => $x === null || $y === null ? null : $x - $y, 'change_percent' => $x === null || $y === null || $y === 0 ? null : round(($x - $y) * 100 / $y, 1)];
        return ['label' => $label, 'current' => ['label' => $current['label'], 'net_paid_minor' => $a['net_paid_minor'], 'orders' => $a['orders'], 'average_order_minor' => $a['average_order_minor']],
            'previous' => ['label' => $previous['label'], 'net_paid_minor' => $b['net_paid_minor'], 'orders' => $b['orders'], 'average_order_minor' => $b['average_order_minor']],
            'net_paid' => $change($a['net_paid_minor'], $b['net_paid_minor']), 'orders' => $change($a['orders'], $b['orders']),
            'early_data' => $a['orders'] + $b['orders'] < biz_early_below(),
            'wording' => 'A change between two periods, not a trend.'];
    };
    return [
        'complete' => [
            $compare($periods['yesterday'], $periods['day_before'], 'Yesterday vs the day before'),
            $compare($periods['last_week'], $periods['week_before'], 'Last week vs the week before'),
            $compare($periods['last_month'], $periods['month_before'], 'Last month vs the month before'),
        ],
        'partial' => array_map(static fn (string $k): array => ['label' => $periods[$k]['label'] . ' so far (partial)'] + array_intersect_key(biz_revenue($orders, $periods[$k]), array_flip(['net_paid_minor', 'orders', 'average_order_minor'])), ['today', 'week', 'month']),
        'note' => 'Only complete periods are compared. Today, this week and this month are still in progress, so they are shown without a change figure.',
    ];
}

/** MCB BUSINESS BRIEF: executive, plain, no celebration. */
function biz_brief(PDO $pdo, array $orders, array $periods): array
{
    $today = biz_revenue($orders, $periods['today']);
    $contribution = biz_contribution($orders, $periods['today']);
    $units = [];
    foreach (array_filter(biz_live_gbp($orders), static fn (array $o): bool => biz_in($o['paid_at'], $periods['today'])) as $o) {
        foreach ($o['items'] as $i) {
            $units[$i['sku']] = ($units[$i['sku']] ?? 0) + $i['quantity'];
        }
    }
    arsort($units);
    $top = $units === [] ? null : array_key_first($units);
    $tie = $top !== null && count(array_filter($units, static fn (int $n): bool => $n === $units[$top])) > 1;
    $capacity = video_capacity_readonly($pdo);
    $care = care_command_summary($pdo);
    $alerts = array_values(array_filter(biz_alerts($pdo, $orders)['alerts'], static fn (array $a): bool => $a['status'] === 'TRIGGERED'));
    $gaps = array_values(array_filter(biz_data_quality($pdo, $orders)['gaps'], static fn (array $g): bool => $g['count'] > 0));
    return [
        'title' => 'MCB BUSINESS BRIEF',
        'period' => $periods['today']['label'] . ' (' . $periods['timezone'] . ', in progress)',
        'revenue' => ['net_paid_minor' => $today['net_paid_minor'], 'gross_paid_minor' => $today['gross_paid_minor'], 'orders' => $today['orders'], 'average_order_minor' => $today['average_order_minor'], 'test_orders' => $today['test']['orders']],
        'contribution' => ['actual_minor' => $contribution['actual']['contribution_minor'], 'based_on' => $contribution['actual']['based_on']],
        'most_units_today' => $top === null ? null : ['sku' => $top, 'name' => catalogue_data()['skus'][$top]['name'] ?? $top, 'units' => $units[$top], 'tied' => $tie],
        'video' => ['used' => $capacity['reserved'] + $capacity['held'] + $capacity['completed'], 'planned' => $capacity['planned'], 'label' => $capacity['label']],
        'customer_care' => ['open' => $care['open_cases'], 'urgent' => $care['urgent']],
        'needs_attention' => array_map(static fn (array $a): string => $a['type'], $alerts),
        'data_missing' => array_map(static fn (array $g): string => $g['label'] . ': ' . $g['count'] . ($g['of'] ? ' of ' . $g['of'] : ''), array_slice($gaps, 0, 6)),
    ];
}

/* ------------------------------------------------------------------ */
/* Views, exports and cost entries                                      */
/* ------------------------------------------------------------------ */

function biz_view(PDO $pdo, string $section): array
{
    $orders = biz_dataset($pdo);
    $periods = biz_periods();
    $common = ['section' => $section, 'timezone' => biz_timezone(), 'definitions' => biz_data()['definitions'], 'generated_at' => gmdate('Y-m-d H:i:s'),
        'disclaimer' => 'Management intelligence from recorded MCB data. Not statutory accounts, tax reporting, bookkeeping or financial advice. Gross contribution is not net profit.'];
    return $common + match ($section) {
        'overview' => [
            'brief' => biz_brief($pdo, $orders, $periods),
            'revenue' => array_map(static fn (string $k): array => biz_revenue($orders, $periods[$k]), ['today' => 'today', 'week' => 'week', 'month' => 'month', 'all' => 'all']),
            'contribution' => ['month' => biz_contribution($orders, $periods['month']), 'all' => biz_contribution($orders, $periods['all'])],
            'comparisons' => biz_comparisons($orders, $periods),
            'alerts' => biz_alerts($pdo, $orders),
            'recommendations' => biz_recommendations($pdo, $orders),
        ],
        'products' => ['products' => biz_products($orders), 'moment' => biz_moment($orders), 'enhancements' => biz_enhancements($orders)],
        'videos' => ['video' => biz_video($pdo, $orders)],
        'customers' => ['customers' => biz_customers($orders), 'occasions' => biz_occasions($orders), 'cruise' => biz_cruise($orders), 'geography' => biz_geography($orders), 'funnel' => biz_funnel($pdo, $orders, $periods['month'])],
        'suppliers' => ['supplier_routes' => biz_supplier_routes($orders), 'route_scorecards' => route_scorecards($pdo), 'scorecard_components' => suppliers_data()['scorecard_components'],
            'routing' => biz_routing_summary($pdo)],
        'support' => ['refunds' => biz_refunds($orders), 'replacements' => biz_replacements($orders), 'support' => biz_support($orders), 'root_causes' => biz_root_causes($orders)],
        'data' => ['data_quality' => biz_data_quality($pdo, $orders)],
        default => throw new OperationsException('invalid_section', 'Unknown business section.', 422),
    };
}

/** A CSV cell that no spreadsheet will run as a formula. */
function biz_csv_cell(mixed $v): string
{
    if ($v === null) {
        return '';
    }
    if (is_bool($v)) {
        return $v ? 'yes' : 'no';
    }
    if (is_array($v)) {
        $v = implode('; ', array_map(static fn ($k, $x): string => is_int($k) ? (string) $x : "{$k}={$x}", array_keys($v), $v));
    }
    $s = (string) $v;
    if (!is_int($v) && !is_float($v) && preg_match('/^[=+\-@\t\r]/', $s) === 1) {
        $s = "'" . $s;
    }
    return '"' . str_replace('"', '""', $s) . '"';
}

/** Rows for a privacy-safe export: aggregates and references only. */
function biz_export_rows(PDO $pdo, string $dataset): array
{
    $orders = biz_dataset($pdo);
    return match ($dataset) {
        'products' => array_map(static fn (array $p): array => ['sku' => $p['sku'], 'name' => $p['name'], 'category' => $p['category'], 'orders' => $p['orders'], 'units' => $p['units'], 'paid_revenue_minor' => $p['paid_revenue_minor'],
            'average_selling_price_minor' => $p['average_selling_price_minor'], 'refund_value_on_orders_minor' => $p['refund_value_on_orders_minor'], 'refund_rate' => $p['refund_rate'], 'replacement_rate' => $p['replacement_rate'],
            'support_cases' => $p['support_cases'], 'expected_contribution_minor' => $p['expected']['contribution_minor'], 'expected_complete_orders' => $p['expected']['complete_orders'],
            'actual_contribution_minor' => $p['actual']['contribution_minor'], 'actual_complete_orders' => $p['actual']['complete_orders'], 'attributable_orders' => $p['actual']['attributable_orders'], 'sample' => $p['label']], biz_products($orders)['products']),
        'supplier_routes' => array_map(static fn (array $r): array => ['route_id' => $r['route_id'], 'orders' => $r['orders'], 'supplier_orders' => $r['supplier_orders'], 'actual_purchase_cost_minor' => $r['actual_purchase_cost_minor'] ?? null,
            'purchase_variance_minor' => $r['purchase_variance_minor'] ?? null, 'purchase_variance_percent' => $r['purchase_variance_percent'] ?? null, 'shipping_variance_minor' => $r['shipping_variance_minor'] ?? null,
            'cancellation_rate' => $r['cancellation_rate'] ?? null, 'damage_rate' => $r['damage_rate'] ?? null, 'wrong_item_rate' => $r['wrong_item_rate'] ?? null, 'exception_rate' => $r['exception_rate'] ?? null,
            'replacement_rate' => $r['replacement_rate'] ?? null, 'average_days_to_dispatch' => $r['average_days_to_dispatch'] ?? null, 'average_days_in_transit' => $r['average_days_in_transit'] ?? null,
            'tracking_reliability' => $r['tracking_reliability'] ?? null, 'sample' => $r['label']], biz_supplier_routes($orders)['routes']),
        'refunds' => (static function () use ($orders): array {
            $rows = [];
            foreach ($orders as $o) {
                if (!$o['live']) {
                    continue;
                }
                $kinds = array_column($o['cases'], null, 'id');
                foreach ($o['refunds'] as $r) {
                    $case = $r['case_id'] !== null ? ($kinds[$r['case_id']] ?? null) : null;
                    $rows[] = ['order_reference' => $o['reference'], 'recorded_at' => $r['recorded_at'], 'refund_type' => $r['type'], 'amount_minor' => $r['amount_minor'], 'currency' => $r['currency'],
                        'case_type' => $case['kind'] ?? null, 'root_cause' => $case['root_cause'] ?? null, 'skus' => implode(' ', array_unique(array_column($o['items'], 'sku'))), 'has_provider_reference' => $r['has_reference']];
                }
            }
            return $rows;
        })(),
        'alerts' => array_merge(...array_map(static fn (array $a): array => $a['findings'] === [] ? [['type' => $a['type'], 'status' => $a['status'], 'threshold' => $a['threshold'] ?? null, 'finding' => null]]
            : array_map(static fn (array $f): array => ['type' => $a['type'], 'status' => $a['status'], 'threshold' => $a['threshold'] ?? null, 'finding' => $f], $a['findings']), biz_alerts($pdo, $orders)['alerts'])),
        'root_causes' => array_map(static fn (array $r): array => ['root_cause' => $r['root_cause'], 'count' => $r['count'], 'rate' => $r['rate'], 'products_affected' => implode(' ', $r['products_affected']), 'routes_affected' => implode(' ', $r['routes_affected']),
            'refund_value_minor' => $r['refund_value_minor'], 'known_replacement_cost_minor' => $r['known_replacement_cost_minor']], biz_root_causes($orders)['root_causes']),
        'geography' => array_map(static fn (array $c): array => ['country' => $c['country'], 'orders' => $c['orders'], 'paid_revenue_minor' => $c['paid_revenue_minor'], 'average_order_minor' => $c['average_order_minor'],
            'actual_fulfilment_cost_minor' => $c['actual_fulfilment_cost_minor'], 'actual_contribution_minor' => $c['actual_contribution_minor'], 'actual_contribution_based_on' => $c['actual_contribution_based_on'], 'delivery_exceptions' => $c['delivery_exceptions'], 'sample' => $c['label']], biz_geography($orders)['countries']),
        'data_quality' => array_map(static fn (array $g): array => ['gap' => $g['key'], 'label' => $g['label'], 'count' => $g['count'], 'of' => $g['of']], biz_data_quality($pdo, $orders)['gaps']),
        default => throw new OperationsException('invalid_dataset', 'Unknown export.', 422),
    };
}

function biz_csv(array $rows): string
{
    if ($rows === []) {
        return "no_rows\n";
    }
    $columns = [];
    foreach ($rows as $r) {
        foreach (array_keys($r) as $k) {
            $columns[$k] = true;
        }
    }
    $columns = array_keys($columns);
    $lines = [implode(',', array_map('biz_csv_cell', $columns))];
    foreach ($rows as $r) {
        $lines[] = implode(',', array_map(static fn (string $c): string => biz_csv_cell($r[$c] ?? null), $columns));
    }
    return implode("\n", $lines) . "\n";
}

function biz_audit(PDO $pdo, string $staff, string $action, ?string $dataset = null, ?int $rows = null, ?int $subject = null): void
{
    $pdo->prepare('INSERT INTO business_audit_log (staff, action, dataset, rows_exported, subject_id) VALUES (:s, :a, :d, :r, :x)')
        ->execute([':s' => $staff, ':a' => $action, ':d' => $dataset, ':r' => $rows, ':x' => $subject]);
}

/** Order lookup for cost entry: a reference, its currency, whether it has video, and its replacement remedies. */
function biz_cost_target(PDO $pdo, string $reference): ?array
{
    $o = $pdo->prepare("SELECT id, mcb_reference, currency, status FROM orders WHERE mcb_reference = :r");
    $o->execute([':r' => $reference]);
    $order = $o->fetch();
    if ($order === false) {
        return null;
    }
    $all = static function (string $sql) use ($pdo, $order): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':o' => (int) $order['id']]);
        return $stmt->fetchAll();
    };
    return [
        'order_id' => (int) $order['id'], 'reference' => $order['mcb_reference'], 'currency' => $order['currency'], 'status' => $order['status'],
        'has_video' => (int) $all("SELECT COUNT(*) AS n FROM order_items WHERE order_id = :o AND category = 'VIDEO_ENHANCEMENT'")[0]['n'] > 0,
        'replacement_remedies' => array_map(static fn (array $r): array => ['remedy_id' => (int) $r['id'], 'type' => $r['type'], 'status' => $r['status']],
            $all("SELECT id, type, status FROM support_remedies WHERE order_id = :o AND type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED') AND status IN ('AUTHORISED','IN_PROGRESS','COMPLETED')")),
        'entries' => array_map(static fn (array $e): array => ['entry_id' => (int) $e['id'], 'category' => $e['category'], 'basis' => $e['basis'], 'amount_minor' => (int) $e['amount_minor'], 'currency' => $e['currency'], 'remedy_id' => $e['remedy_id'] === null ? null : (int) $e['remedy_id'], 'status' => $e['status'], 'recorded_by' => $e['recorded_by'], 'created_at' => $e['created_at']],
            $all('SELECT * FROM direct_cost_entries WHERE order_id = :o ORDER BY id')),
    ];
}

/**
 * Records a direct cost that has no other home. Refuses categories recorded
 * elsewhere (no double counting). A new entry for the same order, category,
 * basis and remedy voids the previous one (history kept). Spends nothing.
 */
function biz_record_cost(array $in, string $staff): array
{
    return db_transaction(function (PDO $pdo) use ($in, $staff): array {
        $category = (string) ($in['category'] ?? '');
        $basis = (string) ($in['basis'] ?? '');
        $policy = array_column(biz_data()['cost_categories'], null, 'category')[$category] ?? null;
        if ($policy === null) {
            throw new OperationsException('invalid_category', 'Choose a cost category.', 422);
        }
        if (!in_array($basis, ['EXPECTED', 'ACTUAL'], true)) {
            throw new OperationsException('invalid_basis', 'Choose EXPECTED or ACTUAL.', 422);
        }
        if (!in_array($basis, $policy['entry'], true)) {
            throw new OperationsException('recorded_elsewhere', "{$category} ({$basis}) is not entered here: " . $policy['record_at'], 422);
        }
        $order = biz_cost_target($pdo, (string) ($in['order_reference'] ?? ''));
        if ($order === null) {
            throw new OperationsException('order_not_found', 'No order with that reference.', 404);
        }
        if (!in_array($order['status'], ['PAID', 'REFUNDED'], true)) {
            throw new OperationsException('order_not_paid', 'Costs are recorded against paid orders.', 409);
        }
        $amount = $in['amount_minor'] ?? null;
        if (!is_int($amount) || $amount < 0 || $amount > 100000000) {
            throw new OperationsException('invalid_amount', 'Give the amount in pence (a whole number, 0 or more). An unknown cost is left unrecorded, never entered as 0.', 422);
        }
        $currency = strtoupper((string) ($in['currency'] ?? $order['currency']));
        if ($currency !== $order['currency']) {
            throw new OperationsException('currency_mismatch', 'Record the cost in the order\'s own currency (' . $order['currency'] . '). Nothing is converted.', 422);
        }
        $note = operations_text($in['note'] ?? null, 500);
        if ($note !== null && looks_like_card_number($note)) {
            throw new OperationsException('payment_credentials_refused', 'Never record card or payment details.', 422);
        }
        if ($category === 'OTHER_DIRECT_COST' && $note === null) {
            throw new OperationsException('invalid_note', 'Say what this cost is.', 422);
        }
        if ($category === 'VIDEO_PRODUCTION_COST' && !$order['has_video']) {
            throw new OperationsException('no_video', 'This order has no Memory Music Video.', 422);
        }
        $remedy = null;
        if ($category === 'REPLACEMENT_COST') {
            $remedy = is_int($in['remedy_id'] ?? null) ? $in['remedy_id'] : 0;
            if (!in_array($remedy, array_column($order['replacement_remedies'], 'remedy_id'), true)) {
                throw new OperationsException('remedy_required', 'A replacement cost belongs to an authorised replacement or reproduction on this order.', 422);
            }
        }
        $pdo->prepare("UPDATE direct_cost_entries SET status = 'VOIDED', voided_by = :s, voided_at = UTC_TIMESTAMP(), void_reason = 'SUPERSEDED'
                        WHERE order_id = :o AND category = :c AND basis = :b AND remedy_id <=> :r AND status = 'CURRENT'")
            ->execute([':s' => $staff, ':o' => $order['order_id'], ':c' => $category, ':b' => $basis, ':r' => $remedy]);
        $pdo->prepare('INSERT INTO direct_cost_entries (order_id, category, basis, amount_minor, currency, remedy_id, note, recorded_by, created_at) VALUES (:o, :c, :b, :a, :cur, :r, :n, :s, UTC_TIMESTAMP())')
            ->execute([':o' => $order['order_id'], ':c' => $category, ':b' => $basis, ':a' => $amount, ':cur' => $currency, ':r' => $remedy, ':n' => $note, ':s' => $staff]);
        $id = (int) $pdo->lastInsertId();
        biz_audit($pdo, $staff, 'COST_RECORDED', $category, null, $id);
        record_order_event($pdo, $order['order_id'], 'COST.RECORDED', ['entry_id' => $id, 'category' => $category, 'basis' => $basis, 'by' => $staff]);
        return ['entry_id' => $id, 'spent' => false];
    });
}

function biz_void_cost(array $in, string $staff): array
{
    return db_transaction(function (PDO $pdo) use ($in, $staff): array {
        $reason = operations_line($in['reason'] ?? null, 300);
        if ($reason === null) {
            throw new OperationsException('invalid_reason', 'Say why this entry is being voided.', 422);
        }
        $stmt = $pdo->prepare("UPDATE direct_cost_entries SET status = 'VOIDED', voided_by = :s, voided_at = UTC_TIMESTAMP(), void_reason = :r WHERE id = :id AND status = 'CURRENT'");
        $stmt->execute([':s' => $staff, ':r' => $reason, ':id' => is_int($in['entry_id'] ?? null) ? $in['entry_id'] : 0]);
        if ($stmt->rowCount() !== 1) {
            throw new OperationsException('entry_not_found', 'No current cost entry with that id.', 404);
        }
        biz_audit($pdo, $staff, 'COST_VOIDED', null, null, (int) $in['entry_id']);
        return ['voided' => true];
    });
}
