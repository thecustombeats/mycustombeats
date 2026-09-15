<?php
/**
 * MCB™ Supplier Intelligence & Commercial Routing (16 September 2026).
 *
 * DECISION SUPPORT, NOT PROCUREMENT. For a product and the CUSTOMER'S delivery
 * destination this answers: who can make it, where they deliver, what we expect
 * it to cost, what it actually cost, whether the route is verified and
 * commercially safe, whether a person must confirm delivery, which route staff
 * should review first, and what data is missing.
 *
 * MONEY NEVER LEAVES MCB AUTOMATICALLY. Nothing here purchases, pays, refunds,
 * subscribes, calls a partner or commits MCB to spend. A route RECOMMENDED FOR
 * REVIEW is never an authorisation: Bella or Lewis authorises with their own
 * code (AUTHORISE_SUPPLIER_PURCHASE), then a person places the partner order
 * and records its reference and actual cost.
 *
 * - Routes, partners and expected costs come only from the server-only
 *   api/data/supplier-routes.json. Missing is UNKNOWN, never zero or safe.
 * - VERIFIED needs a source and a verification date. A verified route past its
 *   configured freshness period is STALE (REVERIFY ROUTE). No universal
 *   freshness period is assumed: unset means freshness is NOT CONFIGURED.
 * - Routing uses the customer's delivery destination only — never where the
 *   Founders are, or where the server is.
 * - Internal allowances are planning values, never customer delivery charges
 *   or verified quotes.
 * - No partner is ever switched, suspended or punished automatically.
 */

declare(strict_types=1);

require_once __DIR__ . '/fulfilment-controller.php';

function suppliers_data(): array
{
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/suppliers.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new OperationsException('supplier_policy_unavailable', 'The supplier routing policy is unavailable.', 503);
        }
    }
    return $data;
}

/** The registry entry for a physical SKU (non-sensitive), or null. */
function registry_entry(string $sku): ?array
{
    foreach (suppliers_data()['registry'] as $e) {
        if ($e['sku'] === $sku) {
            return $e;
        }
    }
    return null;
}

/* ------------------------------------------------------------------ */
/* Route record (model v2) and verification                            */
/* ------------------------------------------------------------------ */

function route_valid_date(mixed $v, ?int $now = null): ?string
{
    if (!is_string($v) || preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) !== 1 || !checkdate((int) substr($v, 5, 2), (int) substr($v, 8, 2), (int) substr($v, 0, 4))) {
        return null;
    }
    // A verification cannot be dated in the future.
    return $v <= gmdate('Y-m-d', $now ?? time()) ? $v : null;
}

/** The v2 fields of a route, validated. Anything invalid is simply absent (unknown). */
function route_record_fields(array $r): array
{
    $policy = suppliers_data();
    $str = static fn ($v, int $max = 500): ?string => is_string($v) && trim($v) !== '' ? mb_substr(trim($v), 0, $max) : null;
    $strings = static fn ($v): array => is_array($v) ? array_values(array_map(static fn (string $s): string => mb_substr($s, 0, 300), array_filter($v, static fn ($s): bool => is_string($s) && trim($s) !== ''))) : [];
    $issueCodes = array_column($policy['route_issues'], 'code');
    $evidence = [];
    foreach (is_array($r['destination_evidence'] ?? null) ? $r['destination_evidence'] : [] as $cc => $e) {
        if (!is_string($cc) || preg_match('/^[A-Z]{2}$/', $cc) !== 1 || !is_array($e)) {
            continue;
        }
        $evidence[$cc] = [
            'shipping_rule' => $str($e['shipping_rule'] ?? null, 300),
            'tracking' => $str($e['tracking'] ?? null, 200),
            'customs_duties' => $str($e['customs_duties'] ?? null, 300),
            'delivery_estimate' => $str($e['delivery_estimate'] ?? null, 120),
            'restrictions' => $str($e['restrictions'] ?? null, 300),
            'source' => $str($e['source'] ?? null, 300),
            'checked_date' => route_valid_date($e['checked_date'] ?? null),
        ];
    }
    $freshness = $r['freshness_days'] ?? null;
    return [
        'route_type' => in_array($r['route_type'] ?? null, $policy['route_types'], true) ? $r['route_type'] : null,
        'supplier_product_reference' => $str($r['supplier_product_reference'] ?? null, 120),
        'claimed_verification_state' => is_string($r['verification_state'] ?? null) ? $r['verification_state'] : (is_string($r['verification_status'] ?? null) ? $r['verification_status'] : null),
        'availability' => in_array($r['availability'] ?? null, $policy['availability_states'], true) ? $r['availability'] : 'UNKNOWN',
        'availability_checked_date' => route_valid_date($r['availability_checked_date'] ?? null),
        'active' => ($r['active'] ?? true) !== false,
        'risk_notes' => $strings($r['risk_notes'] ?? []),
        'known_issues' => array_values(array_intersect(is_array($r['known_issues'] ?? null) ? $r['known_issues'] : [], $issueCodes)),
        'last_reviewed_date' => route_valid_date($r['last_reviewed_date'] ?? null),
        'freshness_days' => is_int($freshness) && $freshness > 0 ? $freshness : null,
        'destination_evidence' => $evidence,
    ];
}

/** The freshness period for a route: its own, else the configured one, else NOT CONFIGURED. */
function route_freshness_days(array $route): ?int
{
    if (($route['freshness_days'] ?? null) !== null) {
        return $route['freshness_days'];
    }
    $v = mcb_setting('fulfilment.route_freshness_days', null);
    return is_int($v) && $v > 0 ? $v : null;
}

/**
 * The calculated verification state. Entering "VERIFIED" is not enough: it
 * needs a source and a (past) verification date, and no issue that holds
 * verification. A verified route past its freshness period is STALE.
 */
function route_verification(array $route, ?int $now = null): array
{
    $now ??= time();
    $claimed = $route['claimed_verification_state'] ?? null;
    $date = route_valid_date($route['last_verified_date'] ?? null, $now);
    $source = $route['source'] ?? null;
    $holding = array_column(array_filter(suppliers_data()['route_issues'], static fn (array $i): bool => $i['holds_verification'] && in_array($i['code'], $route['known_issues'] ?? [], true)), 'code');
    $reasons = [];
    $days = route_freshness_days($route);
    $age = $date === null ? null : (int) floor(($now - strtotime($date . ' 00:00:00 UTC')) / 86400);
    $freshness = ['verified_date' => $date, 'age_days' => $age, 'freshness_days' => $days,
        'status' => $date === null ? 'NEVER_VERIFIED' : ($days === null ? 'NOT_CONFIGURED' : ($age > $days ? 'STALE' : 'FRESH'))];

    if (($route['active'] ?? true) === false || $claimed === 'SUSPENDED') {
        $state = 'SUSPENDED';
        $reasons[] = 'ROUTE_SUSPENDED';
    } elseif ($claimed === 'UNSUPPORTED') {
        // "Unsupported" is itself a finding that needs evidence.
        $state = $source !== null ? 'UNSUPPORTED' : 'VERIFICATION_REQUIRED';
        $reasons[] = $source !== null ? 'UNSUPPORTED_WITH_EVIDENCE' : 'UNSUPPORTED_WITHOUT_EVIDENCE';
    } elseif ($claimed === 'VERIFIED' || $claimed === 'PARTIALLY_VERIFIED') {
        if ($source === null || ($claimed === 'VERIFIED' && $date === null)) {
            $state = 'VERIFICATION_REQUIRED';
            $reasons[] = $source === null ? 'NO_VERIFICATION_SOURCE' : 'NO_VERIFICATION_DATE';
        } elseif ($holding !== []) {
            $state = 'VERIFICATION_REQUIRED';
            array_push($reasons, ...$holding);
        } elseif ($freshness['status'] === 'STALE') {
            $state = 'STALE';
            $reasons[] = 'VERIFICATION_OLDER_THAN_FRESHNESS_PERIOD';
        } else {
            $state = $claimed;
        }
    } else {
        $state = 'VERIFICATION_REQUIRED';
        $reasons[] = 'NOT_VERIFIED';
        array_push($reasons, ...$holding);
    }
    return ['state' => $state, 'claimed' => $claimed, 'reasons' => array_values(array_unique($reasons)), 'freshness' => $freshness, 'reverify' => $state === 'STALE'];
}

/** Adds the calculated verification to a route; only a fresh VERIFIED route is VERIFIED for older callers. */
function route_with_verification(array $route): array
{
    $v = route_verification($route);
    $route['verification'] = $v;
    $route['verification_state'] = $v['state'];
    $route['verification_status'] = $v['state'] === 'VERIFIED' ? 'VERIFIED' : 'UNVERIFIED';
    return $route;
}

function route_by_id(string $routeId): ?array
{
    foreach (supplier_routes() as $r) {
        if ($r['route_id'] === $routeId) {
            return $r;
        }
    }
    return null;
}

/** Every route for a SKU, in file order. */
function routes_for_sku(string $sku): array
{
    return array_values(array_filter(supplier_routes(), static fn (array $r): bool => in_array($sku, $r['skus'], true)));
}

/* ------------------------------------------------------------------ */
/* The routing engine                                                  */
/* ------------------------------------------------------------------ */

function routing_country(?string $countryCode): ?string
{
    return is_string($countryCode) && preg_match('/^[A-Za-z]{2}$/', $countryCode) === 1 ? strtoupper($countryCode) : null;
}

/** Expected direct fulfilment cost for one unit on a route, by component. Unknown stays null. */
function route_expected_cost(array $route, int $quantity = 1): array
{
    $a = $route['internal_allowance'];
    $missing = [];
    if ($route['expected_purchase_cost_minor'] === null) {
        $missing[] = 'EXPECTED_PURCHASE_COST';
    }
    if ($a['expected_supplier_shipping_minor'] === null) {
        $missing[] = 'EXPECTED_SUPPLIER_SHIPPING';
    }
    $allowance = $missing === [] ? $a['expected_supplier_shipping_minor'] + ($a['shipping_contingency_minor'] ?? 0) + ($a['mcb_fulfilment_handling_allowance_minor'] ?? 0) : null;
    return [
        'currency' => $route['currency'],
        'product_minor' => $route['expected_purchase_cost_minor'] === null ? null : $route['expected_purchase_cost_minor'] * $quantity,
        'expected_supplier_shipping_minor' => $a['expected_supplier_shipping_minor'],
        'shipping_contingency_minor' => $a['shipping_contingency_minor'],
        'mcb_fulfilment_handling_allowance_minor' => $a['mcb_fulfilment_handling_allowance_minor'],
        // The shipping, contingency and handling components together, counted once.
        'total_internal_fulfilment_allowance_minor' => $allowance,
        'total_minor' => $missing === [] ? $route['expected_purchase_cost_minor'] * $quantity + $allowance : null,
        'complete' => $missing === [],
        'missing' => $missing,
        'note' => 'Internal planning values from the route: the shipping figure is an internal estimate, not a verified partner quote and never a customer delivery charge.',
    ];
}

/** How certain the partner's shipping is for this destination (never a promise to a customer). */
function route_shipping_certainty(array $route, ?string $cc): string
{
    $evidence = $cc === null ? null : ($route['destination_evidence'][$cc] ?? null);
    $recorded = $evidence !== null && $evidence['shipping_rule'] !== null && $evidence['source'] !== null && $evidence['checked_date'] !== null;
    return match ($route['shipping_model']) {
        'VERIFIED_FIXED_OR_FREE' => $route['verification_state'] === 'VERIFIED' ? 'FIXED_OR_FREE_VERIFIED' : 'FIXED_OR_FREE_UNVERIFIED',
        'DESTINATION_CALCULATED' => $recorded ? 'DESTINATION_RULE_RECORDED' : 'QUOTE_REQUIRED',
        'MARKETPLACE_LISTING_DEPENDENT' => 'CONFIRM_ON_LISTING',
        'MANUAL_FULFILMENT_REVIEW' => 'MANUAL_CONFIRMATION',
        default => 'UNKNOWN',
    };
}

/**
 * One route for one SKU and destination: its group and everything staff need
 * to review it. INTERNAL (partner identity, costs and risks).
 */
function route_option(array $route, string $sku, ?string $cc, string $mode): array
{
    $v = $route['verification'];
    $dest = destination_check($route, $cc);
    $reasons = [];
    if ($v['state'] === 'SUSPENDED') {
        $group = 'UNSUPPORTED';
        $reasons[] = 'ROUTE_SUSPENDED';
    } elseif ($v['state'] === 'UNSUPPORTED') {
        $group = 'UNSUPPORTED';
        $reasons[] = 'ROUTE_UNSUPPORTED';
    } elseif ($route['availability'] === 'UNAVAILABLE') {
        $group = 'UNSUPPORTED';
        $reasons[] = 'PRODUCT_UNAVAILABLE';
    } elseif ($dest['status'] === 'DESTINATION_UNSUPPORTED') {
        // Standard products: evidence proves this route does not deliver there.
        // Manual products: a person looks for a way, and the customer is never told a country-only restriction.
        $group = $mode === 'STANDARD' ? 'UNSUPPORTED' : 'MANUAL_REVIEW';
        $reasons[] = 'DESTINATION_UNSUPPORTED_BY_ROUTE';
    } elseif ($mode === 'MANUAL_AVAILABILITY_CONFIRMED' || $route['shipping_model'] === 'MANUAL_FULFILMENT_REVIEW' || $route['route_type'] === 'MANUAL') {
        $group = 'MANUAL_REVIEW';
        $reasons[] = $mode === 'MANUAL_AVAILABILITY_CONFIRMED' ? 'AVAILABILITY_CONFIRMED_BY_A_PERSON' : 'MANUAL_FULFILMENT_ROUTE';
    } elseif ($dest['status'] === 'DESTINATION_SUPPORTED' && $v['state'] === 'VERIFIED') {
        $group = 'SUPPORTED';
        $reasons[] = 'VERIFIED_ROUTE_AND_DESTINATION';
    } elseif ($mode === 'MANUAL_WHEN_UNVERIFIED') {
        $group = 'MANUAL_REVIEW';
        $reasons[] = 'UNVERIFIED_DESTINATION_GOES_TO_A_PERSON';
    } else {
        $group = 'UNVERIFIED';
        $reasons[] = $v['state'] !== 'VERIFIED' ? 'ROUTE_' . $v['state'] : $dest['status'];
    }
    $issueLabels = array_column(suppliers_data()['route_issues'], 'label', 'code');
    $risks = array_merge(
        $route['risk_notes'],
        array_map(static fn (string $c): string => $issueLabels[$c] ?? $c, $route['known_issues']),
        $route['limitations'],
        $route['route_type'] === 'MARKETPLACE' ? ['Marketplace route: the listing, seller, availability and delivery can change.'] : [],
        $v['state'] === 'STALE' ? ['REVERIFY ROUTE: the verification is older than the freshness period.'] : [],
        $route['availability'] === 'UNKNOWN' ? ['Availability has not been checked.'] : [],
    );
    $evidence = $cc === null ? null : ($route['destination_evidence'][$cc] ?? null);
    return [
        'route_id' => $route['route_id'],
        'group' => $group,
        'reasons' => $reasons,
        'supplier' => $route['supplier'],
        'route_type' => $route['route_type'],
        'supplier_product_reference' => $route['supplier_product_reference'],
        'product_url' => $route['product_url'],
        'verification' => $v,
        'destination' => $dest + ['certainty' => match ($dest['status']) {
            'DESTINATION_SUPPORTED' => 'VERIFIED', 'DESTINATION_CHECK_REQUIRED' => 'CHECK_REQUIRED', 'DESTINATION_UNSUPPORTED' => 'UNSUPPORTED', default => 'UNKNOWN',
        }],
        'shipping_certainty' => route_shipping_certainty($route, $cc),
        'expected_cost' => route_expected_cost($route),
        'availability' => ['status' => $route['availability'], 'checked_date' => $route['availability_checked_date']],
        'international_evidence' => $evidence,
        'tracking_capability' => $route['tracking_capability'],
        'customs_position' => $route['customs_position'],
        'production_estimate' => $route['production_estimate'],
        'delivery_estimate' => $route['delivery_estimate'],
        'cancellation_cutoff' => $route['cancellation_cutoff'],
        'damage_reporting' => $route['damage_reporting'],
        'risks' => array_values(array_unique($risks)),
        'high_risk_marketplace' => $route['route_type'] === 'MARKETPLACE' && $v['state'] !== 'VERIFIED',
        'fallback' => ['route_id' => $route['fallback_route_id'], 'available' => false],
        'last_reviewed_date' => $route['last_reviewed_date'],
    ];
}

/** A deterministic ranking key: lower sorts first. Every factor is shown in the explanation. */
function route_rank_key(array $o): array
{
    $cost = $o['expected_cost']['complete'] && $o['expected_cost']['currency'] === 'GBP' ? $o['expected_cost']['total_minor'] : PHP_INT_MAX;
    $verified = $o['verification']['freshness']['verified_date'];
    return [
        ['SUPPORTED' => 0, 'UNVERIFIED' => 1, 'MANUAL_REVIEW' => 2][$o['group']] ?? 3,
        ['VERIFIED' => 0, 'PARTIALLY_VERIFIED' => 1, 'STALE' => 2, 'VERIFICATION_REQUIRED' => 3][$o['verification']['state']] ?? 4,
        // "Check at the partner's checkout" (a marketplace or manual route) is no more certain than unknown.
        $o['destination']['certainty'] === 'VERIFIED' ? 0 : ($o['destination']['certainty'] === 'CHECK_REQUIRED' && ($o['destination']['reason'] ?? null) !== 'VERIFY_AT_SUPPLIER_CHECKOUT' ? 1 : ($o['destination']['certainty'] === 'UNSUPPORTED' ? 3 : 2)),
        ['DIRECT_MANUFACTURER' => 0, 'DIRECT_RETAILER' => 1, 'MANUAL' => 2, 'MARKETPLACE' => 3][$o['route_type'] ?? ''] ?? 4,
        ['AVAILABLE' => 0, 'UNKNOWN' => 1][$o['availability']['status']] ?? 2,
        count(array_filter($o['reasons'], static fn (string $r): bool => in_array($r, array_column(suppliers_data()['route_issues'], 'code'), true))) + count($o['verification']['reasons']),
        $cost,
        $verified === null ? PHP_INT_MAX : -strtotime($verified),
        $o['route_id'],
    ];
}

/** Why this route is recommended for review, in plain words, compared with the next one. */
function route_explanation(array $best, ?array $next): array
{
    $factors = [];
    $factors[] = match ($best['route_type']) {
        'DIRECT_MANUFACTURER' => 'Direct manufacturer route', 'DIRECT_RETAILER' => 'Direct retailer route',
        'MARKETPLACE' => 'Marketplace route', 'MANUAL' => 'Manual route', default => 'Route type not recorded',
    };
    $factors[] = match ($best['destination']['certainty']) {
        'VERIFIED' => 'destination verified', 'CHECK_REQUIRED' => 'destination must be checked with the partner', default => 'destination not yet evidenced',
    };
    $factors[] = match ($best['verification']['state']) {
        'VERIFIED' => 'route verified', 'PARTIALLY_VERIFIED' => 'route partially verified', 'STALE' => 'verification is stale (reverify route)', default => 'route needs verification',
    };
    if ($best['group'] === 'MANUAL_REVIEW') {
        $factors[] = 'a person must confirm availability, destination and the delivered cost';
    }
    if ($next === null) {
        $factors[] = 'the only route recorded for this product and destination';
    } else {
        $bc = $best['expected_cost'];
        $nc = $next['expected_cost'];
        if ($bc['complete'] && $nc['complete'] && $bc['currency'] === $nc['currency'] && $bc['total_minor'] < $nc['total_minor']) {
            $factors[] = 'lower known expected cost';
        } elseif ($bc['complete'] && !$nc['complete']) {
            $factors[] = 'expected cost known (the alternative\'s is not)';
        }
        $bd = $best['verification']['freshness']['verified_date'];
        $nd = $next['verification']['freshness']['verified_date'];
        if ($bd !== null && ($nd === null || $bd > $nd)) {
            $factors[] = 'verified more recently';
        }
        if ($best['group'] !== $next['group'] && $best['group'] === 'SUPPORTED') {
            $factors[] = 'better destination evidence than the alternatives';
        }
    }
    $text = ucfirst(implode('; ', $factors)) . '.';
    return ['factors' => $factors, 'text' => $text];
}

/**
 * The routing engine: for a product and the customer's delivery country,
 * SUPPORTED, UNVERIFIED, UNSUPPORTED and MANUAL_REVIEW routes, and the one
 * RECOMMENDED FOR REVIEW with its reasons. Deterministic; places nothing.
 */
function route_options(string $sku, ?string $countryCode): array
{
    $cc = routing_country($countryCode);
    $entry = registry_entry($sku);
    $mode = $entry['routing_mode'] ?? 'STANDARD';
    $groups = array_fill_keys(suppliers_data()['route_groups'], []);
    $options = [];
    foreach (routes_for_sku($sku) as $route) {
        $o = route_option($route, $sku, $cc, $mode);
        $options[$o['route_id']] = $o;
    }
    // A fallback is available only when the fallback route exists for this SKU and is not unsupported here.
    foreach ($options as $id => $o) {
        $fb = $o['fallback']['route_id'];
        $options[$id]['fallback']['available'] = $fb !== null && isset($options[$fb]) && $options[$fb]['group'] !== 'UNSUPPORTED';
    }
    $viable = array_values(array_filter($options, static fn (array $o): bool => $o['group'] !== 'UNSUPPORTED'));
    usort($viable, static fn (array $a, array $b): int => route_rank_key($a) <=> route_rank_key($b));
    foreach ($options as $o) {
        $groups[$o['group']][] = $o;
    }
    foreach ($groups as $g => $list) {
        usort($list, static fn (array $a, array $b): int => route_rank_key($a) <=> route_rank_key($b));
        $groups[$g] = $list;
    }
    $recommendation = null;
    if ($viable !== []) {
        $explanation = route_explanation($viable[0], $viable[1] ?? null);
        $recommendation = [
            'label' => suppliers_data()['recommendation_label'],
            'route_id' => $viable[0]['route_id'],
            'group' => $viable[0]['group'],
            'explanation' => $explanation['text'],
            'factors' => $explanation['factors'],
            'alternatives' => count($viable) - 1,
            // A recommendation never authorises spend and never places an order.
            'authorises_purchase' => false,
            'places_order' => false,
            'note' => suppliers_data()['recommendation_note'],
        ];
    }
    return [
        'sku' => $sku,
        'product' => $entry['label'] ?? (catalogue_sku($sku)['name'] ?? $sku),
        'family' => $entry['family'] ?? null,
        'routing_mode' => $mode,
        // The customer's delivery destination is the only location routing uses.
        'destination' => ['country_code' => $cc, 'basis' => 'CUSTOMER_DELIVERY_DESTINATION'],
        'status' => $options === [] ? 'NO_ROUTE' : ($viable === [] ? 'NO_SAFE_ROUTE' : 'ROUTE_FOR_REVIEW'),
        'groups' => $groups,
        'group_labels' => ['SUPPORTED' => 'Supported routes', 'UNVERIFIED' => 'Unverified routes', 'UNSUPPORTED' => 'Unsupported routes', 'MANUAL_REVIEW' => 'Manual review routes'],
        'recommendation' => $recommendation,
    ];
}

/* ------------------------------------------------------------------ */
/* Orders: the route a person chose                                    */
/* ------------------------------------------------------------------ */

/** The current route decision for an order line, or null (also before the migration). */
function current_route_decision(PDO $pdo, int $orderId, string $sku): ?array
{
    try {
        $stmt = $pdo->prepare("SELECT * FROM order_route_decisions WHERE order_id = :o AND sku = :s AND status = 'CURRENT' ORDER BY id DESC LIMIT 1");
        $stmt->execute([':o' => $orderId, ':s' => $sku]);
        $row = $stmt->fetch();
    } catch (PDOException $e) {
        return null;
    }
    if ($row === false) {
        return null;
    }
    return [
        'id' => (int) $row['id'], 'sku' => $row['sku'], 'route_id' => $row['route_id'], 'recommended_route_id' => $row['recommended_route_id'],
        'route_group' => $row['route_group'], 'deviation_reason' => $row['deviation_reason'], 'note' => $row['note'], 'country_code' => $row['country_code'],
        'confirmed_delivered_cost_minor' => $row['confirmed_delivered_cost_minor'] === null ? null : (int) $row['confirmed_delivered_cost_minor'],
        'confirmed_delivered_currency' => $row['confirmed_delivered_currency'], 'delivered_cost_evidence' => $row['delivered_cost_evidence'],
        'decided_by' => $row['decided_by'], 'created_at' => $row['created_at'],
    ];
}

/**
 * The route an order line uses for expectations: the route a person chose,
 * else the one recommended for review for the customer's destination, else the
 * first route recorded for the SKU (so its destination findings still show).
 */
function order_route_for_sku(PDO $pdo, int $orderId, string $sku): ?array
{
    $decision = current_route_decision($pdo, $orderId, $sku);
    if ($decision !== null && ($route = route_by_id($decision['route_id'])) !== null && in_array($sku, $route['skus'], true)) {
        return $route;
    }
    if (count(routes_for_sku($sku)) > 1) {
        $cc = fulfilment_destination($pdo, $orderId)['country_code'] ?? null;
        $rec = route_options($sku, $cc)['recommendation'];
        if ($rec !== null && ($route = route_by_id($rec['route_id'])) !== null) {
            return $route;
        }
    }
    return supplier_route_for_sku($sku);
}

/**
 * Records the route a person chose for an order line after reviewing the
 * options. A different route from the recommendation needs a reason. It never
 * authorises spend and never places anything.
 */
function record_route_decision(PDO $pdo, int $orderId, array $in, string $staff): array
{
    $sku = is_string($in['sku'] ?? null) ? $in['sku'] : '';
    if (!in_array($sku, array_column(fulfilment_lines($pdo, $orderId), 'sku'), true)) {
        throw new OperationsException('invalid_sku', 'Choose one of this order\'s physical items.', 422);
    }
    $cc = fulfilment_destination($pdo, $orderId)['country_code'] ?? null;
    $options = route_options($sku, $cc);
    $routeId = is_string($in['route_id'] ?? null) ? $in['route_id'] : '';
    $chosen = null;
    foreach ($options['groups'] as $list) {
        foreach ($list as $o) {
            if ($o['route_id'] === $routeId) {
                $chosen = $o;
            }
        }
    }
    if ($chosen === null) {
        throw new OperationsException('invalid_route', 'That route is not recorded for this product.', 422);
    }
    if ($chosen['group'] === 'UNSUPPORTED') {
        throw new OperationsException('route_unsupported', 'That route cannot be used for this order (' . strtolower(str_replace('_', ' ', $chosen['reasons'][0] ?? 'unsupported')) . '). Choose another route or raise a fulfilment exception for a founder decision.', 409);
    }
    $recommended = $options['recommendation']['route_id'] ?? null;
    $reason = $in['deviation_reason'] ?? null;
    $note = operations_text($in['note'] ?? null, 500);
    if ($routeId !== $recommended) {
        if (!in_array($reason, suppliers_data()['route_deviation_reasons'], true) || $note === null) {
            throw new OperationsException('deviation_reason_required', 'This is not the route recommended for review: choose a reason and note why.', 422);
        }
    } else {
        $reason = null;
    }
    if (looks_like_card_number($note) || looks_like_card_number(is_string($in['delivered_cost_evidence'] ?? null) ? $in['delivered_cost_evidence'] : null)) {
        throw new OperationsException('card_number_in_note', 'Never record card or account details.', 422);
    }
    $cost = $in['confirmed_delivered_cost_minor'] ?? null;
    if ($cost !== null && (!is_int($cost) || $cost < 1)) {
        throw new OperationsException('invalid_delivered_cost', 'The confirmed delivered cost must be a positive amount in minor units.', 422);
    }
    $currency = is_string($in['confirmed_delivered_currency'] ?? null) && preg_match('/^[A-Z]{3}$/', $in['confirmed_delivered_currency']) === 1 ? $in['confirmed_delivered_currency'] : null;
    $evidence = operations_text($in['delivered_cost_evidence'] ?? null, 300);
    if ($cost !== null && ($currency === null || $evidence === null)) {
        throw new OperationsException('delivered_cost_evidence_required', 'Give the currency and where the delivered cost was confirmed (never card details).', 422);
    }
    $pdo->prepare("UPDATE order_route_decisions SET status = 'SUPERSEDED', superseded_at = UTC_TIMESTAMP() WHERE order_id = :o AND sku = :s AND status = 'CURRENT'")
        ->execute([':o' => $orderId, ':s' => $sku]);
    $pdo->prepare(
        'INSERT INTO order_route_decisions (order_id, sku, route_id, recommended_route_id, route_group, deviation_reason, note, country_code,
             confirmed_delivered_cost_minor, confirmed_delivered_currency, delivered_cost_evidence, decided_by, created_at)
         VALUES (:o, :s, :r, :rec, :g, :dr, :n, :cc, :c, :cur, :ev, :by, UTC_TIMESTAMP())'
    )->execute([':o' => $orderId, ':s' => $sku, ':r' => $routeId, ':rec' => $recommended, ':g' => $chosen['group'], ':dr' => $reason, ':n' => $note,
        ':cc' => $cc, ':c' => $cost, ':cur' => $cost === null ? null : $currency, ':ev' => $cost === null ? null : $evidence, ':by' => $staff]);
    $id = (int) $pdo->lastInsertId();
    record_order_event($pdo, $orderId, 'ROUTING.DECISION_RECORDED', ['decision_id' => $id, 'sku' => $sku, 'route' => $routeId, 'recommended' => $recommended,
        'followed_recommendation' => $routeId === $recommended, 'delivered_cost_confirmed' => $cost !== null, 'by' => $staff], "route-decision:{$id}");
    return [
        'decision' => current_route_decision($pdo, $orderId, $sku),
        'followed_recommendation' => $routeId === $recommended,
        // Choosing a route is not a financial authorisation.
        'authorises_purchase' => false,
        'next' => 'Bella or Lewis authorises the purchase with their own code; then a person places the order and records its reference and actual cost.',
    ];
}

/**
 * What must be true of the route decisions before Bella or Lewis can authorise
 * a purchase: a product that needs its delivered cost confirmed has one.
 * Returns the unmet requirements (never authorises anything).
 */
function route_authorisation_requirements(PDO $pdo, int $orderId): array
{
    $unmet = [];
    $unreviewed = [];
    foreach (fulfilment_lines($pdo, $orderId) as $line) {
        $decision = current_route_decision($pdo, $orderId, $line['sku']);
        if ((registry_entry($line['sku'])['delivered_cost_confirmation_required'] ?? false) === true && ($decision['confirmed_delivered_cost_minor'] ?? null) === null) {
            $unmet[] = ['sku' => $line['sku'], 'product' => $line['name'], 'requirement' => 'CONFIRMED_DELIVERED_COST'];
        }
        // A route review is needed where there is a real choice (more than one route recorded).
        if ($decision === null && count(routes_for_sku($line['sku'])) > 1) {
            $unreviewed[] = ['sku' => $line['sku'], 'product' => $line['name']];
        }
    }
    return ['unmet' => $unmet, 'routes_not_reviewed' => $unreviewed];
}

/* ------------------------------------------------------------------ */
/* New sales: commercial safety before a sale is accepted              */
/* ------------------------------------------------------------------ */

function new_sale_safety_enforcement(): string
{
    return mcb_setting('fulfilment.new_sale_safety', 'ADVISORY') === 'REQUIRED' ? 'REQUIRED' : 'ADVISORY';
}

/**
 * Flags for a NEW physical sale of a SKU to a destination, from recorded data
 * only. Incomplete data is never treated as safe. Paid orders are never read
 * or changed here.
 */
function new_sale_route_flags(string $sku, ?string $countryCode): array
{
    $options = route_options($sku, $countryCode);
    $flags = [];
    if ($options['status'] === 'NO_ROUTE') {
        $flags[] = 'MISSING_ROUTE';
    }
    $cc = $options['destination']['country_code'];
    $allRoutes = array_merge(...array_values($options['groups']));
    if ($cc !== null && $allRoutes !== [] && $options['status'] === 'NO_SAFE_ROUTE'
        && array_filter($allRoutes, static fn (array $o): bool => in_array('DESTINATION_UNSUPPORTED_BY_ROUTE', $o['reasons'], true)) !== []) {
        $flags[] = 'DESTINATION_UNSUPPORTED';
    }
    $rec = $options['recommendation'];
    $best = null;
    foreach ($allRoutes as $o) {
        if ($rec !== null && $o['route_id'] === $rec['route_id']) {
            $best = $o;
        }
    }
    $price = (int) (catalogue_sku($sku)['price_minor'] ?? 0);
    if ($best !== null && $best['expected_cost']['complete'] && $best['expected_cost']['currency'] === 'GBP' && $price - $best['expected_cost']['total_minor'] < 0) {
        $flags[] = 'NEGATIVE_CONTRIBUTION';
    }
    if ($best !== null && $best['high_risk_marketplace']) {
        $flags[] = 'UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE';
    }
    if (array_filter(manufacturing_data_items(), static fn (array $i): bool => in_array($sku, $i['skus'], true) && $i['blocks_manufacture']) !== []) {
        $flags[] = 'MANUFACTURING_DATA_MISSING';
    }
    return ['sku' => $sku, 'destination' => $cc, 'status' => $options['status'], 'flags' => $flags, 'enforcement' => new_sale_safety_enforcement()];
}

/**
 * Which items of a new sale must go to MCB to confirm delivery before payment.
 * A destination the routes prove unsupported is never sold as supported (always);
 * other flags do so only when new-sale safety is REQUIRED.
 *
 * @return list<string> the SKUs
 */
function new_sale_items_needing_confirmation(array $skus, ?string $countryCode): array
{
    $out = [];
    foreach (array_unique($skus) as $sku) {
        $f = new_sale_route_flags($sku, $countryCode);
        if (in_array('DESTINATION_UNSUPPORTED', $f['flags'], true) || ($f['enforcement'] === 'REQUIRED' && $f['flags'] !== [])) {
            $out[] = $sku;
        }
    }
    return $out;
}

/* ------------------------------------------------------------------ */
/* Research and manufacturing data                                     */
/* ------------------------------------------------------------------ */

/** SUPPLIER DATA NEEDS REVIEW: what partner data is missing, stale or changed. A research list, not procurement. */
function supplier_research_items(): array
{
    $labels = array_column(suppliers_data()['research_item_kinds'], 'label', 'kind');
    $items = [];
    $add = static function (string $kind, ?string $sku, ?string $routeId, string $detail) use (&$items, $labels): void {
        $items[] = ['kind' => $kind, 'label' => $labels[$kind] ?? $kind, 'sku' => $sku, 'product' => $sku === null ? null : (registry_entry($sku)['label'] ?? $sku), 'route_id' => $routeId, 'detail' => $detail];
    };
    $seenRoutes = [];
    foreach (suppliers_data()['registry'] as $e) {
        $routes = routes_for_sku($e['sku']);
        if ($routes === []) {
            $add('NO_ROUTE', $e['sku'], null, 'No partner route is recorded for this product.');
            continue;
        }
        $usable = array_filter($routes, static fn (array $r): bool => !in_array($r['verification_state'], ['SUSPENDED', 'UNSUPPORTED'], true) && $r['availability'] !== 'UNAVAILABLE');
        if (count($usable) < 2 && array_filter($routes, static fn (array $r): bool => $r['fallback_route_id'] !== null) === []) {
            $add('FALLBACK_ABSENT', $e['sku'], null, 'Only one usable route and no authorised fallback.');
        }
        foreach ($routes as $r) {
            $key = $r['route_id'] . '|' . $e['sku'];
            if (isset($seenRoutes[$key])) {
                continue;
            }
            $seenRoutes[$key] = true;
            $v = $r['verification'];
            if ($v['state'] === 'STALE') {
                $add('REVERIFY_ROUTE', $e['sku'], $r['route_id'], "Verified {$v['freshness']['verified_date']}, older than the {$v['freshness']['freshness_days']}-day freshness period.");
            } elseif ($v['state'] === 'VERIFICATION_REQUIRED') {
                $add('VERIFICATION_REQUIRED', $e['sku'], $r['route_id'], 'Needs verification: ' . strtolower(str_replace('_', ' ', implode(', ', $v['reasons']))) . '.');
            }
            if ($r['availability'] === 'UNAVAILABLE') {
                $add('PRODUCT_UNAVAILABLE', $e['sku'], $r['route_id'], 'Recorded as unavailable' . ($r['availability_checked_date'] ? " ({$r['availability_checked_date']})" : '') . '.');
            }
            foreach (['TERMS_CHANGED', 'LISTING_CHANGED', 'PRICE_STALE'] as $issue) {
                if (in_array($issue, $r['known_issues'], true)) {
                    $add($issue, $e['sku'], $r['route_id'], 'Recorded on the route.');
                }
            }
            if ($r['expected_purchase_cost_minor'] === null) {
                $add('COST_MISSING', $e['sku'], $r['route_id'], 'No expected product cost on the route.');
            }
            $quoted = array_filter($r['destination_evidence'], static fn (array $d): bool => $d['shipping_rule'] !== null && $d['source'] !== null && $d['checked_date'] !== null) !== [];
            if (in_array('SHIPPING_QUOTE_MISSING', $r['known_issues'], true) || (!$quoted && !($r['shipping_model'] === 'VERIFIED_FIXED_OR_FREE' && $r['verification_state'] === 'VERIFIED'))) {
                $add('SHIPPING_QUOTE_MISSING', $e['sku'], $r['route_id'], 'No verified shipping rule or quote is recorded; the internal shipping estimate is not a quote.');
            }
            $d = $r['destinations'];
            if ($d === null || ($d['supported'] === [] && $d['check_required'] === [])) {
                $add('DESTINATION_UNVERIFIED', $e['sku'], $r['route_id'], 'No destinations are recorded for this route.');
            }
        }
        foreach ($e['manufacturing']['artwork'] as $templateId) {
            $t = artwork_template_by_id($templateId);
            if (($t['status'] ?? null) === 'TEMPLATE_REQUIRED') {
                $add('TEMPLATE_MISSING', $e['sku'], null, 'Ask the production partner for the ' . strtolower((string) $t['label']) . ' template (see MANUFACTURING DATA REQUIRED).');
            }
        }
        if ($e['manufacturing']['capacity'] && (creative_capacity_profile($e['sku'])['status'] ?? 'UNVERIFIED') !== 'VERIFIED') {
            $add('CAPACITY_MISSING', $e['sku'], null, 'Ask the production partner for the verified programme duration (see MANUFACTURING DATA REQUIRED).');
        }
    }
    $cards = array_values(array_filter(suppliers_data()['families'], static fn (array $f): bool => $f['family'] === 'CARD'))[0];
    if ($cards['mapped'] < $cards['expected']) {
        $add('FOUNDER_DATA_REQUIRED', null, null, ($cards['expected'] - $cards['mapped']) . " of {$cards['expected']} pop-up card listings need their name, price point, image and personalisation from Bella or Lewis.");
    }
    return $items;
}

function artwork_template_by_id(string $id): ?array
{
    static $templates = null;
    if ($templates === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/artwork.json');
        $templates = array_column((array) (json_decode((string) $raw, true)['templates'] ?? []), null, 'id');
    }
    return $templates[$id] ?? null;
}

/**
 * MANUFACTURING DATA REQUIRED: production specifications still missing, kept
 * apart from partner verification. Known values are shown; unknown values are
 * never filled in.
 */
function manufacturing_data_items(): array
{
    static $items = null;
    if ($items !== null) {
        return $items;
    }
    $labels = array_column(suppliers_data()['manufacturing_item_kinds'], 'label', 'kind');
    $items = [];
    $skusByTemplate = [];
    foreach (suppliers_data()['registry'] as $e) {
        foreach ($e['manufacturing']['artwork'] as $t) {
            $skusByTemplate[$t][] = $e['sku'];
        }
    }
    foreach ($skusByTemplate as $templateId => $skus) {
        $t = artwork_template_by_id($templateId);
        if ($t === null) {
            continue;
        }
        $required = $t['manufacturing_data_required'] ?? [];
        foreach ($t['missing'] as $missing) {
            $kind = match (true) {
                $templateId === 'PICTURE_DISC_HEART' => 'HEART_DIELINE',
                $templateId === 'GATEFOLD_12_DOUBLE' => 'GATEFOLD_TEMPLATE',
                stripos($missing, 'safe') !== false => 'SAFE_AREA',
                stripos($missing, 'trim') !== false => 'TRIM',
                stripos($missing, 'pixel canvas') !== false => 'DISC_PIXEL_CANVAS',
                stripos($missing, 'centre-hole') !== false || stripos($missing, 'centre hole') !== false => 'CENTRE_HOLE',
                default => 'OTHER_SPECIFICATION',
            };
            $known = array_values(array_filter([
                $t['output_px'] !== null ? "Output {$t['output_px']['width']} × {$t['output_px']['height']} px" : null,
                $t['diameter_mm'] !== null ? "Diameter {$t['diameter_mm']} mm" : null,
                $t['centre_hole_mm'] !== null ? "Centre hole {$t['centre_hole_mm']} mm" : null,
                $t['bleed'] !== null ? "Bleed {$t['bleed']['min']['mm']}–{$t['bleed']['max']['mm']} mm" : null,
            ]));
            $items[] = ['kind' => $kind, 'label' => $labels[$kind], 'template' => $templateId, 'template_label' => $t['label'], 'template_status' => $t['status'],
                'skus' => $skus, 'missing' => $missing, 'known' => $known, 'blocks_manufacture' => in_array($missing, $required, true)];
        }
    }
    foreach (suppliers_data()['registry'] as $e) {
        if ($e['manufacturing']['capacity'] && ($p = creative_capacity_profile($e['sku'])) !== null && $p['status'] !== 'VERIFIED') {
            $items[] = ['kind' => 'PROGRAMME_DURATION', 'label' => $labels['PROGRAMME_DURATION'], 'template' => null, 'template_label' => $p['format'], 'template_status' => 'CAPACITY_UNVERIFIED',
                'skus' => [$e['sku']], 'missing' => 'Verified programme duration (total and per side) from the manufacturer',
                'known' => ["{$p['song_count']} songs (the product's song count, not a manufacturer duration)", "{$p['disc_count']} disc(s), {$p['side_count']} sides"],
                // Unverified capacity blocks manufacture only through the existing audio capacity gate.
                'blocks_manufacture' => false];
        }
    }
    return $items;
}

/* ------------------------------------------------------------------ */
/* Route intelligence and scorecards                                   */
/* ------------------------------------------------------------------ */

function route_sample(int $n): array
{
    $early = mcb_setting('business.early_data_below_orders', null);
    $early = is_int($early) && $early > 0 ? $early : 30;
    $insufficient = (int) suppliers_data()['route_insufficient_data_below'];
    return ['sample_size' => $n, 'label' => $n < $insufficient ? 'INSUFFICIENT DATA' : ($n < $early ? 'EARLY DATA' : 'SAMPLE ' . $n)];
}

/**
 * Per route: what the evidence says, as separate transparent components.
 * There is no combined score, and nothing switches a partner.
 */
function route_scorecards(PDO $pdo): array
{
    $stats = array_column(supplier_scorecards($pdo), null, 'route_id');
    $orders = [];
    foreach ($pdo->query(
        "SELECT s.route_id, COUNT(*) AS n, SUM(s.actual_purchase_cost_minor IS NOT NULL) AS with_actual_product, SUM(s.actual_shipping_cost_minor IS NOT NULL) AS with_actual_shipping,
                SUM(s.actual_tax_duty_minor IS NOT NULL) AS with_tax_duty, SUM(s.expected_total_cost_minor IS NOT NULL) AS with_expected,
                SUM(s.expected_purchase_cost_minor) AS expected_product, SUM(s.actual_purchase_cost_minor) AS actual_product,
                SUM(s.expected_shipping_cost_minor) AS expected_shipping, SUM(s.actual_shipping_cost_minor) AS actual_shipping,
                SUM(s.expected_total_cost_minor) AS expected_total, SUM(s.actual_total_cost_minor) AS actual_total, SUM(s.actual_tax_duty_minor) AS tax_duty,
                COUNT(DISTINCT s.order_id) AS orders
           FROM supplier_orders s WHERE s.status IN ('RECORDED','CANCELLED_BY_SUPPLIER') GROUP BY s.route_id"
    )->fetchAll() as $r) {
        $orders[(string) $r['route_id']] = $r;
    }
    $cases = [];
    foreach ($pdo->query(
        "SELECT s.route_id, COUNT(DISTINCT c.id) AS cases, COUNT(DISTINCT CASE WHEN m.type IN ('REPLACEMENT_REQUIRED','REPRODUCTION_REQUIRED') AND m.status IN ('AUTHORISED','IN_PROGRESS','COMPLETED') THEN m.id END) AS replacements
           FROM supplier_orders s JOIN order_service_requests c ON c.order_id = s.order_id
           LEFT JOIN support_remedies m ON m.case_id = c.id
          GROUP BY s.route_id"
    )->fetchAll() as $r) {
        $cases[(string) $r['route_id']] = $r;
    }
    $ids = array_values(array_unique(array_merge(array_column(supplier_routes(), 'route_id'), array_map('strval', array_keys($orders)))));
    $out = [];
    foreach ($ids as $id) {
        $route = route_by_id($id);
        $o = $orders[$id] ?? null;
        $s = $stats[$id] ?? null;
        $n = (int) ($o['n'] ?? 0);
        $int = static fn ($v): ?int => $v === null ? null : (int) $v;
        $variance = static fn ($exp, $act): ?int => $exp === null || $act === null ? null : (int) $act - (int) $exp;
        $d = $route['destinations'] ?? null;
        $problems = $s === null ? null : array_sum(array_intersect_key($s['exceptions'], array_flip(['PARCEL_DAMAGED', 'MANUFACTURING_DEFECT', 'WRONG_ITEM', 'PARCEL_LOST', 'PARCEL_DELAYED', 'TRACKING_STALLED', 'CUSTOMS_EXCEPTION', 'DESTINATION_PROBLEM', 'PARTIAL_DELIVERY', 'SUPPLIER_DELAY', 'SUPPLIER_CANCELLED'])));
        $out[] = [
            'route_id' => $id,
            'supplier' => $route['supplier'] ?? null,
            'route_type' => $route['route_type'] ?? null,
            'skus' => $route['skus'] ?? [],
            'in_route_data' => $route !== null,
            'components' => [
                'VERIFICATION_QUALITY' => $route === null ? ['state' => 'NOT_IN_ROUTE_DATA'] : ['state' => $route['verification_state'], 'reasons' => $route['verification']['reasons'], 'freshness' => $route['verification']['freshness']],
                'COST_COMPLETENESS' => [
                    'expected_on_route' => $route === null ? null : route_expected_cost($route)['complete'],
                    'orders_with_actual_product_cost' => (int) ($o['with_actual_product'] ?? 0), 'orders_with_actual_shipping' => (int) ($o['with_actual_shipping'] ?? 0),
                    'orders_with_tax_duty_recorded' => (int) ($o['with_tax_duty'] ?? 0), 'of' => $n,
                    'expected_product_minor' => $int($o['expected_product'] ?? null), 'actual_product_minor' => $int($o['actual_product'] ?? null),
                    'product_variance_minor' => $variance($o['expected_product'] ?? null, $o['actual_product'] ?? null),
                    'expected_shipping_minor' => $int($o['expected_shipping'] ?? null), 'actual_shipping_minor' => $int($o['actual_shipping'] ?? null),
                    'shipping_variance_minor' => $variance($o['expected_shipping'] ?? null, $o['actual_shipping'] ?? null),
                    'expected_total_minor' => $int($o['expected_total'] ?? null), 'actual_total_minor' => $int($o['actual_total'] ?? null),
                    'total_variance_minor' => $variance($o['expected_total'] ?? null, $o['actual_total'] ?? null),
                    'actual_tax_duty_minor' => $int($o['tax_duty'] ?? null),
                    'note' => 'Variance is actual minus expected. It is evidence, not a verdict on the partner.',
                ],
                'DESTINATION_CERTAINTY' => ['supported' => $d['supported'] ?? [], 'check_required' => $d['check_required'] ?? [], 'unsupported' => $d['unsupported'] ?? [],
                    'evidence_countries' => $route === null ? [] : array_keys(array_filter($route['destination_evidence'], static fn (array $e): bool => $e['source'] !== null)),
                    'destinations_delivered' => $s['destinations'] ?? []],
                'TRACKING_EVIDENCE' => ['capability' => $route['tracking_capability'] ?? 'UNKNOWN', 'parcels_with_tracking_share' => $s['tracking_reliability'] ?? null],
                'FULFILMENT_RELIABILITY' => ['avg_days_to_dispatch' => $s['avg_days_to_dispatch'] ?? null, 'avg_days_in_transit' => $s['avg_days_in_transit'] ?? null,
                    'cancellation_rate' => $s['cancellation_rate'] ?? null, 'exceptions' => $s['exceptions'] ?? []],
                'CUSTOMER_PROBLEM_RATE' => ['problems' => $problems, 'problem_rate' => $n > 0 && $problems !== null ? round($problems / $n, 3) : null,
                    'damage_rate' => $s['damage_rate'] ?? null, 'wrong_item_rate' => $s['wrong_item_rate'] ?? null,
                    'support_cases' => (int) ($cases[$id]['cases'] ?? 0), 'replacements' => (int) ($cases[$id]['replacements'] ?? 0)],
                'SAMPLE_SIZE' => route_sample($n),
            ],
            'combined_score' => null,
            'note' => 'Transparent components only: there is no combined score, and no partner is switched automatically.',
        ];
    }
    return $out;
}

/* ------------------------------------------------------------------ */
/* Command Centre: SUPPLIERS                                           */
/* ------------------------------------------------------------------ */

/** Founder-friendly counts, each with the items behind it. Reads only. */
function suppliers_overview(PDO $pdo): array
{
    $routes = supplier_routes();
    $ready = array_values(array_filter($routes, static fn (array $r): bool => $r['verification_state'] === 'VERIFIED' && $r['availability'] !== 'UNAVAILABLE'));
    $needing = array_values(array_filter($routes, static fn (array $r): bool => in_array($r['verification_state'], ['VERIFICATION_REQUIRED', 'PARTIALLY_VERIFIED', 'STALE'], true)));
    $routeItem = static fn (array $r): array => ['route_id' => $r['route_id'], 'supplier' => $r['supplier'], 'state' => $r['verification_state'],
        'products' => array_map(static fn (string $s): string => registry_entry($s)['label'] ?? $s, $r['skus']), 'reverify' => $r['verification']['reverify'], 'reasons' => $r['verification']['reasons']];

    $noSafe = [];
    foreach (suppliers_data()['registry'] as $e) {
        $safe = array_filter(routes_for_sku($e['sku']), static fn (array $r): bool => $r['verification_state'] === 'VERIFIED' && $r['availability'] !== 'UNAVAILABLE');
        if ($safe === []) {
            $noSafe[] = ['sku' => $e['sku'], 'product' => $e['label'], 'why' => routes_for_sku($e['sku']) === [] ? 'No route recorded' : 'No verified route', 'routing_mode' => $e['routing_mode']];
        }
    }
    $cards = array_values(array_filter(suppliers_data()['families'], static fn (array $f): bool => $f['family'] === 'CARD'))[0];

    $commercial = [];
    foreach ($pdo->query("SELECT f.id, f.type, f.order_id, o.mcb_reference, f.detail, f.created_at FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id
                           WHERE f.status = 'OPEN' AND f.type IN ('COMMERCIAL_SAFETY_EXCEPTION','COMMERCIAL_DATA_REQUIRED') ORDER BY f.id LIMIT 200")->fetchAll() as $x) {
        $commercial[] = ['kind' => 'PAID_ORDER', 'type' => $x['type'], 'order_id' => (int) $x['order_id'], 'reference' => $x['mcb_reference'], 'since' => $x['created_at'],
            'note' => 'The paid order is honoured at the price paid: never cancelled or re-priced automatically.'];
    }
    foreach (suppliers_data()['registry'] as $e) {
        $flags = array_values(array_diff(new_sale_route_flags($e['sku'], null)['flags'], ['MISSING_ROUTE', 'MANUFACTURING_DATA_MISSING']));
        if ($flags !== []) {
            $commercial[] = ['kind' => 'NEW_SALES', 'type' => implode(',', $flags), 'sku' => $e['sku'], 'product' => $e['label'],
                'note' => 'New sales only (' . strtolower(new_sale_safety_enforcement()) . '). Suspending new sales is a separate, deliberate action.'];
        }
    }

    $byState = ['FULFILMENT.READY' => [], 'FULFILMENT.AUTHORISED' => [], 'FULFILMENT.CONFIRMED' => []];
    foreach ($pdo->query('SELECT ' . MCB_OPERATIONS_COLUMNS . " FROM orders o LEFT JOIN order_production p ON p.order_id = o.id
                           WHERE o.status = 'PAID' AND o.fulfilment_type = 'PHYSICAL' AND (p.stage IS NULL OR p.stage <> 'COMPLETED') ORDER BY o.id LIMIT 2000")->fetchAll() as $row) {
        $state = operational_state($row);
        if (isset($byState[$state])) {
            $byState[$state][] = ['order_id' => (int) $row['id'], 'reference' => $row['mcb_reference'], 'since' => $row['fulfilment_ready_at'] ?? $row['supplier_purchase_authorised_at'] ?? null,
                'authorised_by' => $row['supplier_purchase_authorised_by'] ?? null];
        }
    }
    $problems = [];
    foreach ($pdo->query("SELECT f.id, f.type, f.order_id, o.mcb_reference, f.blocking, f.created_at FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id
                           WHERE f.status = 'OPEN' AND f.type IN ('SUPPLIER_DELAY','PRODUCTION_DELAY','SUPPLIER_CANCELLED','WRONG_ITEM','MANUFACTURING_DEFECT','TRACKING_NOT_RECEIVED','TRACKING_STALLED',
                                                                   'PARCEL_DELAYED','PARCEL_LOST','PARCEL_DAMAGED','PARTIAL_DELIVERY','DESTINATION_PROBLEM','CUSTOMS_EXCEPTION','OTHER_FULFILMENT_EXCEPTION')
                           ORDER BY f.id LIMIT 200")->fetchAll() as $x) {
        $problems[] = ['exception_id' => (int) $x['id'], 'type' => $x['type'], 'order_id' => (int) $x['order_id'], 'reference' => $x['mcb_reference'], 'blocking' => (bool) $x['blocking'], 'since' => $x['created_at']];
    }
    $manufacturing = manufacturing_data_items();
    $tiles = [
        'routes_ready' => array_map($routeItem, $ready),
        'routes_needing_verification' => array_map($routeItem, $needing),
        'products_without_safe_route' => $noSafe,
        'commercial_exceptions' => $commercial,
        'manufacturing_data_missing' => $manufacturing,
        'awaiting_founder_authorisation' => $byState['FULFILMENT.READY'],
        'authorised_not_placed' => $byState['FULFILMENT.AUTHORISED'],
        'being_made' => $byState['FULFILMENT.CONFIRMED'],
        'supplier_delivery_problems' => $problems,
    ];
    return [
        'tiles' => array_map(static fn (array $t): array => ['key' => $t['key'], 'label' => $t['label'], 'count' => count($tiles[$t['key']]), 'items' => $tiles[$t['key']]], suppliers_data()['overview_tiles']),
        'catalogue' => [
            'expected_physical_skus' => suppliers_data()['expected_physical_skus'],
            'mapped_physical_skus' => array_sum(array_column(suppliers_data()['families'], 'mapped')),
            'families' => suppliers_data()['families'],
            'cards' => ['expected' => $cards['expected'], 'mapped' => $cards['mapped'], 'status' => $cards['mapped'] === $cards['expected'] ? 'MAPPED' : 'FOUNDER_DATA_REQUIRED',
                'price_points' => suppliers_data()['card_price_points']],
        ],
        'research' => supplier_research_items(),
        'enforcement' => ['new_sale_safety' => new_sale_safety_enforcement(), 'route_freshness_days' => (($f = mcb_setting('fulfilment.route_freshness_days', null)) !== null && is_int($f) && $f > 0) ? $f : null],
        'route_data_present' => $routes !== [],
        'no_money_moves' => 'Nothing on this page purchases, pays, refunds or places an order. Bella or Lewis authorises every purchase with their own code.',
    ];
}

/** The order lines awaiting a route review or authorisation, with the recommendation and any decision. STAFF ONLY. */
function suppliers_orders_to_route(PDO $pdo): array
{
    $out = [];
    foreach ($pdo->query('SELECT ' . MCB_OPERATIONS_COLUMNS . " FROM orders o LEFT JOIN order_production p ON p.order_id = o.id
                           WHERE o.status = 'PAID' AND o.fulfilment_type = 'PHYSICAL' AND (p.stage IS NULL OR p.stage <> 'COMPLETED') ORDER BY o.id LIMIT 500")->fetchAll() as $row) {
        $state = operational_state($row);
        if (!in_array($state, ['FULFILMENT.PENDING', 'FULFILMENT.READY', 'FULFILMENT.AUTHORISED', 'QUALITY_CHECK', 'CREATIVE.PENDING', 'CREATIVE.IN_PROGRESS', 'ORDER.PAID'], true)) {
            continue;
        }
        $orderId = (int) $row['id'];
        $destination = fulfilment_destination($pdo, $orderId);
        $req = route_authorisation_requirements($pdo, $orderId);
        $lines = [];
        foreach (fulfilment_lines($pdo, $orderId) as $l) {
            $options = route_options($l['sku'], $destination['country_code'] ?? null);
            $lines[] = ['sku' => $l['sku'], 'product' => $l['name'], 'quantity' => $l['quantity'], 'status' => $options['status'], 'recommendation' => $options['recommendation'],
                'options' => array_merge(...array_values($options['groups'])), 'decision' => current_route_decision($pdo, $orderId, $l['sku']),
                'delivered_cost_confirmation_required' => (registry_entry($l['sku'])['delivered_cost_confirmation_required'] ?? false) === true];
        }
        $out[] = ['order_id' => $orderId, 'reference' => $row['mcb_reference'], 'state' => $state, 'country_code' => $destination['country_code'] ?? null,
            'lines' => $lines, 'unmet_before_authorisation' => $req['unmet'], 'routes_not_reviewed' => $req['routes_not_reviewed']];
    }
    return $out;
}
