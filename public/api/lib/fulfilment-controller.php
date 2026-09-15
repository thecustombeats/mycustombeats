<?php
/**
 * MCB Fulfilment Controller — from a manufacturing-ready order to delivery
 * and beyond. MCB IS THE MIDDLEMAN: specialist partners make and ship; MCB
 * owns the customer experience.
 *
 *   FULFILMENT.READY (founder approval required) → Bella OR Lewis authorises
 *   → SUPPLIER ORDER REQUIRED → placed BY A PERSON → SUPPLIER ORDER RECORDED
 *   → shipments (one order, many parcels) → DELIVERED when every required
 *   parcel is delivered and nothing blocking is open → ORDER.COMPLETED →
 *   follow-up and review on their own clocks.
 *
 * Automation prepares, calculates, validates, queues and notifies. It never
 * purchases, pays, refunds, subscribes, books a courier or asks a paid
 * customer for more money. The existing lifecycle (lib/operations.php)
 * remains the one state machine; this file adds the records around it.
 *
 * Commercial data (routes, expected costs, internal allowances) is read only
 * from the server's api/data/supplier-routes.json. Missing is
 * COMMERCIAL_DATA_REQUIRED, never estimated. Internal allowances are never a
 * customer delivery charge.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/production-files.php';

function fulfilment_data(): array
{
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/fulfilment.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new OperationsException('fulfilment_policy_unavailable', 'The fulfilment policy is unavailable.', 503);
        }
    }
    return $data;
}

/* ------------------------------------------------------------------ */
/* Supplier routes (server-only commercial data)                       */
/* ------------------------------------------------------------------ */

/**
 * Supplier routes from api/data/supplier-routes.json (or the older
 * supplier-orders.json, read as routes with everything else unknown).
 * Values are taken as given; nothing missing is filled in.
 */
function supplier_routes(): array
{
    static $routes = null;
    if ($routes !== null) {
        return $routes;
    }
    $routes = [];
    $dir = __DIR__ . '/../data/';
    $raw = is_readable($dir . 'supplier-routes.json') ? json_decode((string) file_get_contents($dir . 'supplier-routes.json'), true) : null;
    $int = static fn ($v): ?int => is_int($v) && $v >= 0 ? $v : null;
    $str = static fn ($v, int $max = 500): ?string => is_string($v) && trim($v) !== '' ? mb_substr(trim($v), 0, $max) : null;
    foreach (is_array($raw) ? ($raw['routes'] ?? []) : [] as $r) {
        if (!is_array($r) || $str($r['route_id'] ?? null, 60) === null || !is_array($r['skus'] ?? null)) {
            continue;
        }
        $allowance = is_array($r['internal_allowance'] ?? null) ? $r['internal_allowance'] : [];
        $destinations = is_array($r['destinations'] ?? null) ? $r['destinations'] : null;
        $routes[] = [
            'route_id' => $str($r['route_id'], 60),
            'skus' => array_values(array_filter($r['skus'], 'is_string')),
            'supplier' => $str($r['supplier'] ?? null, 120),
            'product_url' => is_string($r['product_url'] ?? null) && str_starts_with($r['product_url'], 'https://') ? mb_substr($r['product_url'], 0, 500) : null,
            'configuration' => $str($r['configuration'] ?? null),
            'destinations' => $destinations === null ? null : [
                'supported' => array_values(array_filter($destinations['supported'] ?? [], 'is_string')),
                'check_required' => array_values(array_filter($destinations['check_required'] ?? [], 'is_string')),
                'unsupported' => array_values(array_filter($destinations['unsupported'] ?? [], 'is_string')),
            ],
            'shipping_model' => in_array($r['shipping_model'] ?? null, fulfilment_data()['delivery_routing_states'], true) ? $r['shipping_model'] : null,
            'currency' => $str($r['currency'] ?? null, 3),
            'expected_purchase_cost_minor' => $int($r['expected_purchase_cost_minor'] ?? null),
            'internal_allowance' => [
                'expected_supplier_shipping_minor' => $int($allowance['expected_supplier_shipping_minor'] ?? null),
                'shipping_contingency_minor' => $int($allowance['shipping_contingency_minor'] ?? null),
                'mcb_fulfilment_handling_allowance_minor' => $int($allowance['mcb_fulfilment_handling_allowance_minor'] ?? null),
            ],
            'checkout_shipping_required' => is_bool($r['checkout_shipping_required'] ?? null) ? $r['checkout_shipping_required'] : null,
            'production_estimate' => $str($r['production_estimate'] ?? null, 120),
            'delivery_estimate' => $str($r['delivery_estimate'] ?? null, 120),
            'tracking_capability' => in_array($r['tracking_capability'] ?? null, ['FULL', 'PARTIAL', 'NONE'], true) ? $r['tracking_capability'] : 'UNKNOWN',
            'customs_position' => $str($r['customs_position'] ?? null),
            'order_instructions' => $str($r['order_instructions'] ?? null, 1000),
            'cancellation_cutoff' => $str($r['cancellation_cutoff'] ?? null, 200),
            'damage_reporting' => $str($r['damage_reporting'] ?? null),
            'replacement_route' => $str($r['replacement_route'] ?? null),
            'fallback_route_id' => ($r['fallback_authorised'] ?? false) === true ? $str($r['fallback_route_id'] ?? null, 60) : null,
            'limitations' => array_values(array_filter($r['limitations'] ?? [], 'is_string')),
            'verification_status' => ($r['verification_status'] ?? null) === 'VERIFIED' && $str($r['source'] ?? null) !== null && $str($r['last_verified_date'] ?? null, 10) !== null ? 'VERIFIED' : 'UNVERIFIED',
            'source' => $str($r['source'] ?? null),
            'last_verified_date' => $str($r['last_verified_date'] ?? null, 10),
        ];
    }
    // Older supplier order data: supplier, link and costs only; everything else unknown.
    foreach (['skus' => supplier_order_data_all()] as $legacy) {
        foreach ($legacy as $sku => $entry) {
            if (supplier_route_for_sku_in($routes, $sku) !== null) {
                continue;
            }
            $routes[] = [
                'route_id' => 'legacy-' . $sku, 'skus' => [$sku], 'supplier' => $entry['supplier'], 'product_url' => $entry['product_url'],
                'configuration' => $entry['configuration'], 'destinations' => null, 'shipping_model' => null, 'currency' => $entry['currency'],
                'expected_purchase_cost_minor' => $entry['expected_cost_minor'],
                'internal_allowance' => ['expected_supplier_shipping_minor' => $entry['shipping_allowance_minor'], 'shipping_contingency_minor' => null, 'mcb_fulfilment_handling_allowance_minor' => null],
                'checkout_shipping_required' => null, 'production_estimate' => null, 'delivery_estimate' => null, 'tracking_capability' => 'UNKNOWN',
                'customs_position' => null, 'order_instructions' => $entry['order_notes'], 'cancellation_cutoff' => null, 'damage_reporting' => null,
                'replacement_route' => null, 'fallback_route_id' => null, 'limitations' => $entry['destination_limitations'],
                'verification_status' => 'UNVERIFIED', 'source' => null, 'last_verified_date' => null,
            ];
        }
    }
    return $routes;
}

function supplier_order_data_all(): array
{
    $path = __DIR__ . '/../data/supplier-orders.json';
    $raw = is_readable($path) ? json_decode((string) file_get_contents($path), true) : null;
    $out = [];
    foreach (is_array($raw) ? ($raw['skus'] ?? []) : [] as $sku => $_) {
        if (is_string($sku) && ($d = supplier_order_data($sku)) !== null) {
            $out[$sku] = $d;
        }
    }
    return $out;
}

function supplier_route_for_sku_in(array $routes, string $sku): ?array
{
    foreach ($routes as $r) {
        if (in_array($sku, $r['skus'], true)) {
            return $r;
        }
    }
    return null;
}

function supplier_route_for_sku(string $sku): ?array
{
    return supplier_route_for_sku_in(supplier_routes(), $sku);
}

/* ------------------------------------------------------------------ */
/* Order facts                                                         */
/* ------------------------------------------------------------------ */

/** Physical lines of an order (catalogue snapshot). */
function fulfilment_lines(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare("SELECT item_id, product_id, item_name, quantity FROM order_items WHERE order_id = :o AND fulfilment = 'PHYSICAL' ORDER BY id");
    $stmt->execute([':o' => $orderId]);
    return array_map(static fn (array $l): array => [
        'sku' => $l['item_id'], 'product_id' => $l['product_id'], 'name' => $l['item_name'], 'quantity' => (int) $l['quantity'],
        'delivery_class' => catalogue_sku((string) $l['item_id'])['delivery_class'] ?? null,
    ], $stmt->fetchAll());
}

/** A safe destination summary: country and town only. Never a name, street, postcode or phone. */
function fulfilment_destination(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare('SELECT city, country, country_code FROM delivery_addresses WHERE order_id = :o LIMIT 1');
    $stmt->execute([':o' => $orderId]);
    $a = $stmt->fetch();
    if ($a === false) {
        return null;
    }
    $code = $a['country_code'] !== null ? strtoupper((string) $a['country_code']) : null;
    return ['country_code' => $code, 'country' => $a['country'], 'city' => $a['city'], 'summary' => trim($a['city'] . ', ' . $a['country'])];
}

/**
 * Whether a route can deliver to a country, as far as verified data says.
 * UNKNOWN is never SUPPORTED; a marketplace listing needs a manual checkout check.
 */
function destination_check(?array $route, ?string $countryCode): array
{
    if ($route === null || $countryCode === null) {
        return ['status' => 'DESTINATION_UNKNOWN', 'reason' => $route === null ? 'NO_SUPPLIER_ROUTE' : 'NO_DESTINATION'];
    }
    $d = $route['destinations'];
    if ($d !== null && in_array($countryCode, $d['unsupported'], true)) {
        return ['status' => 'DESTINATION_UNSUPPORTED', 'reason' => 'ROUTE_EXCLUDES_DESTINATION'];
    }
    if ($route['shipping_model'] === 'MARKETPLACE_LISTING_DEPENDENT' || $route['shipping_model'] === 'MANUAL_FULFILMENT_REVIEW') {
        return ['status' => 'DESTINATION_CHECK_REQUIRED', 'reason' => 'VERIFY_AT_SUPPLIER_CHECKOUT'];
    }
    if ($d === null) {
        return ['status' => 'DESTINATION_UNKNOWN', 'reason' => 'ROUTE_DESTINATIONS_NOT_RECORDED'];
    }
    if (in_array($countryCode, $d['check_required'], true)) {
        return ['status' => 'DESTINATION_CHECK_REQUIRED', 'reason' => 'ROUTE_REQUIRES_CHECK'];
    }
    if (in_array($countryCode, $d['supported'], true)) {
        return ['status' => $route['verification_status'] === 'VERIFIED' ? 'DESTINATION_SUPPORTED' : 'DESTINATION_CHECK_REQUIRED', 'reason' => $route['verification_status'] === 'VERIFIED' ? 'VERIFIED_ROUTE' : 'ROUTE_NOT_VERIFIED'];
    }
    return ['status' => 'DESTINATION_UNKNOWN', 'reason' => 'DESTINATION_NOT_LISTED'];
}

/** The worst destination result across an order's lines. */
function order_destination_check(PDO $pdo, int $orderId): array
{
    $destination = fulfilment_destination($pdo, $orderId);
    $rank = ['DESTINATION_SUPPORTED' => 0, 'DESTINATION_CHECK_REQUIRED' => 1, 'DESTINATION_UNKNOWN' => 2, 'DESTINATION_UNSUPPORTED' => 3];
    $worst = 'DESTINATION_SUPPORTED';
    $lines = [];
    foreach (fulfilment_lines($pdo, $orderId) as $line) {
        $check = destination_check(supplier_route_for_sku($line['sku']), $destination['country_code'] ?? null);
        $lines[] = ['sku' => $line['sku']] + $check;
        if ($rank[$check['status']] > $rank[$worst]) {
            $worst = $check['status'];
        }
    }
    return ['status' => $lines === [] ? 'DESTINATION_UNKNOWN' : $worst, 'destination' => $destination === null ? null : ['country_code' => $destination['country_code'], 'summary' => $destination['summary']], 'lines' => $lines];
}

/* ------------------------------------------------------------------ */
/* Economics                                                           */
/* ------------------------------------------------------------------ */

/**
 * Expected internal economics for a paid order. STAFF ONLY. Revenue is what
 * the customer paid (orders.total_minor). Costs come only from supplier
 * routes; any missing required input makes the result
 * COMMERCIAL_DATA_REQUIRED with the gaps named.
 */
function fulfilment_expected_economics(PDO $pdo, int $orderId): array
{
    $o = $pdo->prepare('SELECT total_minor, currency FROM orders WHERE id = :o');
    $o->execute([':o' => $orderId]);
    $order = $o->fetch();
    $currency = (string) ($order['currency'] ?? 'GBP');
    $revenue = (int) ($order['total_minor'] ?? 0);
    $missing = [];
    $purchase = 0;
    $shipping = 0;
    $contingency = 0;
    $handling = 0;
    $routesUsed = [];
    foreach (fulfilment_lines($pdo, $orderId) as $line) {
        $route = supplier_route_for_sku($line['sku']);
        if ($route === null) {
            $missing[] = "SUPPLIER_ROUTE:{$line['sku']}";
            continue;
        }
        if ($route['currency'] !== null && $route['currency'] !== $currency) {
            $missing[] = "CURRENCY_CONVERSION:{$route['route_id']}";
            continue;
        }
        if ($route['expected_purchase_cost_minor'] === null) {
            $missing[] = "EXPECTED_PURCHASE_COST:{$line['sku']}";
        } else {
            $purchase += $route['expected_purchase_cost_minor'] * $line['quantity'];
        }
        if (!isset($routesUsed[$route['route_id']])) {
            $routesUsed[$route['route_id']] = true;
            $a = $route['internal_allowance'];
            if ($a['expected_supplier_shipping_minor'] === null) {
                $missing[] = "EXPECTED_SUPPLIER_SHIPPING:{$route['route_id']}";
            } else {
                $shipping += $a['expected_supplier_shipping_minor'];
            }
            // Contingency and handling are optional approved allowances: absent means none approved.
            $contingency += $a['shipping_contingency_minor'] ?? 0;
            $handling += $a['mcb_fulfilment_handling_allowance_minor'] ?? 0;
        }
    }
    $body = [
        'currency' => $currency, 'revenue_minor' => $revenue, 'routes' => array_keys($routesUsed), 'missing' => $missing,
        'excludes' => fulfilment_data()['economics_exclusions'],
    ];
    if ($missing !== []) {
        return $body + ['status' => 'COMMERCIAL_DATA_REQUIRED', 'purchase_cost_minor' => null, 'shipping_cost_minor' => null, 'contingency_minor' => null, 'handling_minor' => null, 'total_cost_minor' => null, 'contribution_minor' => null, 'margin_basis_points' => null, 'safety' => null];
    }
    $total = $purchase + $shipping + $contingency + $handling;
    $contribution = $revenue - $total;
    $margin = $revenue > 0 ? intdiv($contribution * 10000, $revenue) : null;
    $minContribution = mcb_setting('fulfilment.commercial_safety.min_contribution_minor', 0);
    $minMargin = mcb_setting('fulfilment.commercial_safety.min_margin_basis_points', null);
    $violations = [];
    if (is_int($minContribution) && $contribution < $minContribution) {
        $violations[] = 'CONTRIBUTION_BELOW_MINIMUM';
    }
    if (is_int($minMargin) && ($margin === null || $margin < $minMargin)) {
        $violations[] = 'MARGIN_BELOW_MINIMUM';
    }
    return $body + [
        'status' => $violations === [] ? 'CALCULATED' : 'COMMERCIAL_SAFETY_EXCEPTION',
        'purchase_cost_minor' => $purchase, 'shipping_cost_minor' => $shipping, 'contingency_minor' => $contingency, 'handling_minor' => $handling,
        'total_cost_minor' => $total, 'contribution_minor' => $contribution, 'margin_basis_points' => $margin,
        'safety' => ['violations' => $violations, 'min_contribution_minor' => is_int($minContribution) ? $minContribution : null, 'min_margin_basis_points' => is_int($minMargin) ? $minMargin : null],
    ];
}

/** Stores an economics snapshot once per content. */
function fulfilment_store_economics(PDO $pdo, int $orderId, string $kind, array $e): int
{
    $json = json_encode($e, JSON_UNESCAPED_SLASHES);
    $sha = hash('sha256', (string) $json);
    $pdo->prepare(
        'INSERT IGNORE INTO order_economics (order_id, kind, status, currency, revenue_minor, purchase_cost_minor, shipping_cost_minor, contingency_minor,
             handling_minor, total_cost_minor, contribution_minor, margin_basis_points, body, body_sha256, created_at)
         VALUES (:o, :k, :s, :c, :r, :p, :sh, :co, :h, :t, :cb, :m, :b, :sha, UTC_TIMESTAMP())'
    )->execute([':o' => $orderId, ':k' => $kind, ':s' => $e['status'], ':c' => $e['currency'], ':r' => $e['revenue_minor'], ':p' => $e['purchase_cost_minor'],
        ':sh' => $e['shipping_cost_minor'], ':co' => $e['contingency_minor'], ':h' => $e['handling_minor'], ':t' => $e['total_cost_minor'],
        ':cb' => $e['contribution_minor'], ':m' => $e['margin_basis_points'], ':b' => $json, ':sha' => $sha]);
    $id = $pdo->prepare('SELECT id FROM order_economics WHERE order_id = :o AND kind = :k AND body_sha256 = :sha');
    $id->execute([':o' => $orderId, ':k' => $kind, ':sha' => $sha]);
    return (int) $id->fetchColumn();
}

/**
 * Records the expected economics and raises what they need: data required,
 * or a commercial safety exception (founders notified). The paid order is
 * never cancelled or changed; for NEW sales the product may be suspended
 * when fulfilment.commercial_safety.suspend_new_sales is on.
 */
function fulfilment_check_commercials(PDO $pdo, int $orderId, string $by): array
{
    $e = fulfilment_expected_economics($pdo, $orderId);
    $snapshot = fulfilment_store_economics($pdo, $orderId, 'EXPECTED', $e);
    record_order_event($pdo, $orderId, 'COMMERCIAL.ECONOMICS_CALCULATED', ['kind' => 'EXPECTED', 'status' => $e['status'], 'snapshot' => $snapshot], "economics-expected:{$snapshot}");
    if ($e['status'] === 'COMMERCIAL_SAFETY_EXCEPTION') {
        $created = raise_fulfilment_exception($pdo, $orderId, 'COMMERCIAL_SAFETY_EXCEPTION', ['blocking' => false, 'detail' => implode(', ', $e['safety']['violations']), 'next_action' => 'A founder decides: normally proceed at the paid price (the customer is never asked for more), or resolve otherwise.'], $by, "commercial-safety:{$snapshot}", false);
        if ($created !== null) {
            notify_founders_about_order($pdo, 'COMMERCIAL_SAFETY_EXCEPTION', $orderId, "commercial-safety:{$orderId}:{$snapshot}", ['reason' => implode(',', $e['safety']['violations'])]);
            if (mcb_setting('fulfilment.commercial_safety.suspend_new_sales', false) === true) {
                foreach (fulfilment_lines($pdo, $orderId) as $line) {
                    $active = $pdo->prepare('SELECT COUNT(*) FROM product_sales_suspensions WHERE subject = :s AND resumed_at IS NULL');
                    $active->execute([':s' => $line['sku']]);
                    if ((int) $active->fetchColumn() === 0) {
                        $pdo->prepare("INSERT INTO product_sales_suspensions (subject, reason, suspended_by, suspended_at) VALUES (:s, 'SUPPLIER_PRICE_CHANGE', 'SYSTEM: commercial safety rule', UTC_TIMESTAMP())")->execute([':s' => $line['sku']]);
                        queue_founder_notification($pdo, 'PRODUCT_SALES_SUSPENDED', null, $line['sku'], "sales-suspended-safety:{$line['sku']}:{$snapshot}", [
                            'product' => $line['name'], 'state' => 'CURRENTLY_UNAVAILABLE', 'reason' => 'COMMERCIAL_SAFETY_RULE',
                            'required_action' => founder_notification_types()['PRODUCT_SALES_SUSPENDED']['required_action'], 'action_url' => founder_action_url(null),
                        ]);
                    }
                }
            }
        }
    }
    return $e + ['snapshot_id' => $snapshot];
}

/* ------------------------------------------------------------------ */
/* Exceptions                                                          */
/* ------------------------------------------------------------------ */

/**
 * Opens a fulfilment exception (once per dedupe key). Notifies the Founders
 * (DELIVERY_EXCEPTION for delivery types, else FULFILMENT_EXCEPTION) unless
 * the caller already notified. Returns the new id, or null if it already existed.
 */
function raise_fulfilment_exception(PDO $pdo, int $orderId, string $type, array $fields, string $by, ?string $dedupe = null, bool $notify = true): ?int
{
    if (!in_array($type, fulfilment_data()['fulfilment_exception_types'], true)) {
        throw new OperationsException('invalid_exception_type', 'That exception type is not recognised.', 422);
    }
    $stmt = $pdo->prepare(
        'INSERT IGNORE INTO fulfilment_exceptions (order_id, type, shipment_id, supplier_order_id, service_request_id, blocking, next_action, detail, opened_by, dedupe_key, created_at)
         VALUES (:o, :t, :sh, :so, :sr, :b, :n, :d, :by, :k, UTC_TIMESTAMP())'
    );
    $stmt->execute([':o' => $orderId, ':t' => $type, ':sh' => $fields['shipment_id'] ?? null, ':so' => $fields['supplier_order_id'] ?? null,
        ':sr' => $fields['service_request_id'] ?? null, ':b' => ($fields['blocking'] ?? true) ? 1 : 0, ':n' => $fields['next_action'] ?? null,
        ':d' => isset($fields['detail']) ? mb_substr((string) $fields['detail'], 0, 1000) : null, ':by' => $by, ':k' => $dedupe]);
    if ($stmt->rowCount() !== 1) {
        return null;
    }
    $id = (int) $pdo->lastInsertId();
    record_order_event($pdo, $orderId, 'FULFILMENT.EXCEPTION_OPENED', ['exception_id' => $id, 'type' => $type, 'blocking' => (bool) ($fields['blocking'] ?? true)], "fulfilment-exception:{$id}");
    if ($notify) {
        $delivery = in_array($type, fulfilment_data()['delivery_exception_types'], true);
        notify_founders_about_order($pdo, $delivery ? 'DELIVERY_EXCEPTION' : 'FULFILMENT_EXCEPTION', $orderId, "fulfilment-exception:{$id}", ['reason' => $type]);
    }
    return $id;
}

function open_blocking_exceptions(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare("SELECT id, type FROM fulfilment_exceptions WHERE order_id = :o AND status = 'OPEN' AND blocking = 1 ORDER BY id");
    $stmt->execute([':o' => $orderId]);
    return $stmt->fetchAll();
}

/* ------------------------------------------------------------------ */
/* Supplier orders                                                     */
/* ------------------------------------------------------------------ */

/** True when text contains something shaped like a payment card number (Luhn-valid 13–19 digits). */
function looks_like_card_number(?string $text): bool
{
    if ($text === null) {
        return false;
    }
    preg_match_all('/(?:\d[ -]?){13,19}/', $text, $m);
    foreach ($m[0] as $candidate) {
        $digits = preg_replace('/\D/', '', $candidate);
        $sum = 0;
        $alt = false;
        for ($i = strlen($digits) - 1; $i >= 0; $i--) {
            $n = (int) $digits[$i];
            if ($alt) {
                $n *= 2;
                if ($n > 9) {
                    $n -= 9;
                }
            }
            $sum += $n;
            $alt = !$alt;
        }
        if (strlen($digits) >= 13 && $sum % 10 === 0) {
            return true;
        }
    }
    return preg_match('/\b(cvv|cvc|security code|card number)\b/i', $text) === 1;
}

/**
 * Records a supplier order a person placed by hand, after a founder
 * authorised it. Returns the supplier order id and the actual economics.
 */
function record_supplier_order(PDO $pdo, array $row, array $in, string $staff): array
{
    $orderId = (int) $row['id'];
    if ($row['supplier_purchase_authorised_at'] === null || $row['supplier_purchase_authorised_by'] === null) {
        throw new OperationsException('founder_authorisation_required', 'Bella or Lewis must authorise the supplier purchase first (AUTHORISE_SUPPLIER_PURCHASE).', 409);
    }
    $reference = operations_line($in['supplier_order_reference'] ?? ($in['fulfilment_reference'] ?? null), 120);
    if ($reference === null) {
        throw new OperationsException('supplier_order_reference_required', 'Add the supplier\'s order reference.', 422);
    }
    $notes = operations_text($in['notes'] ?? null, 1000);
    $confirmation = operations_line($in['confirmation_reference'] ?? null, 200);
    foreach ([$reference, $notes, $confirmation] as $text) {
        if (looks_like_card_number($text)) {
            throw new OperationsException('payment_credentials_refused', 'Never record card or payment details here. Remove them and try again.', 422);
        }
    }
    $lines = fulfilment_lines($pdo, $orderId);
    $orderedSkus = array_column($lines, 'sku');
    $skus = is_array($in['skus'] ?? null) ? array_values(array_filter($in['skus'], 'is_string')) : $orderedSkus;
    if (array_diff($skus, $orderedSkus) !== []) {
        throw new OperationsException('invalid_skus', 'A supplier order can only cover this order\'s physical items.', 422);
    }
    // No silent substitution of a materially different product (checked, and the exception raised, by check_substitution_request first).
    $substitute = is_string($in['substitute_sku'] ?? null) && $in['substitute_sku'] !== '' ? $in['substitute_sku'] : null;
    if ($substitute !== null) {
        $original = is_string($in['substitute_for_sku'] ?? null) ? $in['substitute_for_sku'] : ($skus[0] ?? '');
        if (substitution_is_approved_card_alternative($original)) {
            $note = operations_text($in['substitution_note'] ?? null, 500);
            if ($note === null) {
                throw new OperationsException('alternative_note_required', 'Record why the alternative card was needed and that it matches the occasion and style (never materially different).', 422);
            }
            raise_fulfilment_exception($pdo, $orderId, 'AUTHORISED_CARD_ALTERNATIVE', ['blocking' => false, 'detail' => "{$original} -> {$substitute}: {$note}"], $staff, "card-alternative:{$reference}", false);
        } elseif (!substitution_approved($pdo, $orderId)) {
            throw new OperationsException('substitution_approval_required', 'A different product cannot be ordered without a founder\'s decision.', 409);
        }
    }
    $route = isset($in['route_id']) && is_string($in['route_id']) ? (array_values(array_filter(supplier_routes(), static fn (array $r): bool => $r['route_id'] === $in['route_id']))[0] ?? null) : supplier_route_for_sku($skus[0] ?? '');
    $int = static fn ($v): ?int => is_int($v) && $v >= 0 ? $v : null;
    $actualPurchase = $int($in['actual_purchase_cost_minor'] ?? null);
    $actualShipping = $int($in['actual_shipping_cost_minor'] ?? null);
    $currency = is_string($in['currency'] ?? null) && preg_match('/^[A-Z]{3}$/', $in['currency']) === 1 ? $in['currency'] : 'GBP';
    $expectedPurchase = null;
    $expectedShipping = null;
    if ($route !== null && $route['expected_purchase_cost_minor'] !== null) {
        $expectedPurchase = 0;
        foreach ($lines as $l) {
            if (in_array($l['sku'], $skus, true)) {
                $expectedPurchase += $route['expected_purchase_cost_minor'] * $l['quantity'];
            }
        }
        $expectedShipping = $route['internal_allowance']['expected_supplier_shipping_minor'];
    }
    $expectedTotal = $expectedPurchase === null || $expectedShipping === null ? null : $expectedPurchase + $expectedShipping;
    $actualTotal = $actualPurchase === null ? null : $actualPurchase + ($actualShipping ?? 0);
    $variance = $expectedTotal === null || $actualTotal === null ? null : $actualTotal - $expectedTotal;
    $reason = $in['variance_reason'] ?? null;
    if ($variance !== null && $variance !== 0 && !in_array($reason, fulfilment_data()['variance_reasons'], true)) {
        throw new OperationsException('variance_reason_required', 'Actual cost differs from expected: choose a variance reason.', 422);
    }
    $date = static fn ($v): ?string => is_string($v) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v) === 1 ? $v : null;
    try {
        $pdo->prepare(
            'INSERT INTO supplier_orders (order_id, route_id, supplier_order_reference, skus, purchased_at, operator, financial_authoriser, currency,
                 expected_purchase_cost_minor, expected_shipping_cost_minor, expected_total_cost_minor, actual_purchase_cost_minor, actual_shipping_cost_minor,
                 actual_total_cost_minor, variance_minor, variance_reason, expected_dispatch_date, expected_delivery_date, tracking_pending, confirmation_reference, notes, created_at)
             VALUES (:o, :r, :ref, :skus, UTC_TIMESTAMP(), :op, :auth, :cur, :ep, :es, :et, :ap, :as, :at, :v, :vr, :ed, :edd, :tp, :cr, :n, UTC_TIMESTAMP())'
        )->execute([':o' => $orderId, ':r' => $route['route_id'] ?? null, ':ref' => $reference, ':skus' => implode(',', $skus), ':op' => $staff,
            ':auth' => $row['supplier_purchase_authorised_by'], ':cur' => $currency, ':ep' => $expectedPurchase, ':es' => $expectedShipping, ':et' => $expectedTotal,
            ':ap' => $actualPurchase, ':as' => $actualShipping, ':at' => $actualTotal, ':v' => $variance, ':vr' => $variance === null || $variance === 0 ? null : $reason,
            ':ed' => $date($in['expected_dispatch_date'] ?? null), ':edd' => $date($in['expected_delivery_date'] ?? null),
            ':tp' => ($in['tracking_pending'] ?? true) === false ? 0 : 1, ':cr' => $confirmation, ':n' => $notes]);
    } catch (PDOException $e) {
        if (is_duplicate_error($e)) {
            throw new OperationsException('duplicate_supplier_order', 'That supplier order reference is already recorded on this order.', 409);
        }
        throw $e;
    }
    $supplierOrderId = (int) $pdo->lastInsertId();
    record_order_event($pdo, $orderId, 'FULFILMENT.PARTNER_ORDER_RECORDED', ['supplier_order_id' => $supplierOrderId, 'route' => $route['route_id'] ?? null, 'by' => $staff, 'authorised_by' => $row['supplier_purchase_authorised_by']], "supplier-order:{$supplierOrderId}");
    $actual = fulfilment_actual_economics($pdo, $orderId);
    return ['supplier_order_id' => $supplierOrderId, 'variance_minor' => $variance, 'actual_economics' => $actual];
}

function substitution_is_approved_card_alternative(string $originalSku): bool
{
    return in_array(catalogue_sku($originalSku)['delivery_class'] ?? null, fulfilment_data()['authorised_alternative_delivery_classes'], true);
}

function substitution_approved(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id = :o AND type = 'SUBSTITUTION_APPROVAL_REQUIRED' AND status = 'RESOLVED' AND resolution = 'SUBSTITUTION_APPROVED'");
    $stmt->execute([':o' => $orderId]);
    return (int) $stmt->fetchColumn() > 0;
}

/**
 * Before the locked transaction: an ordinary product substituted without a
 * founder's decision is refused, and the SUBSTITUTION_APPROVAL_REQUIRED
 * exception it raises is kept (committed) so a founder sees it.
 */
function check_substitution_request(int $orderId, array $in, string $staff): void
{
    $substitute = is_string($in['substitute_sku'] ?? null) && $in['substitute_sku'] !== '' ? $in['substitute_sku'] : null;
    if ($substitute === null) {
        return;
    }
    $original = is_string($in['substitute_for_sku'] ?? null) ? $in['substitute_for_sku'] : (string) ((is_array($in['skus'] ?? null) ? $in['skus'][0] ?? '' : '') ?: (fulfilment_lines(db(), $orderId)[0]['sku'] ?? ''));
    if ($substitute === $original || substitution_is_approved_card_alternative($original) || substitution_approved(db(), $orderId)) {
        return;
    }
    $pdo = db();
    raise_fulfilment_exception($pdo, $orderId, 'SUBSTITUTION_APPROVAL_REQUIRED', ['blocking' => true, 'detail' => "{$original} -> " . mb_substr($substitute, 0, 64),
        'next_action' => 'A founder decides whether a substitution is acceptable (and how the customer is told); nothing is substituted silently.'], $staff, 'substitution:' . substr(hash('sha256', $original . '|' . $substitute), 0, 24));
    throw new OperationsException('substitution_approval_required', 'That product is different from what the customer ordered. It cannot be substituted silently: a founder must decide first (a SUBSTITUTION_APPROVAL_REQUIRED exception has been raised).', 409);
}

/** Actual economics from recorded supplier orders, beside the latest expected snapshot. */
function fulfilment_actual_economics(PDO $pdo, int $orderId): ?array
{
    $o = $pdo->prepare('SELECT total_minor, currency FROM orders WHERE id = :o');
    $o->execute([':o' => $orderId]);
    $order = $o->fetch();
    $s = $pdo->prepare("SELECT actual_purchase_cost_minor, actual_shipping_cost_minor, actual_total_cost_minor, currency FROM supplier_orders WHERE order_id = :o AND status = 'RECORDED'");
    $s->execute([':o' => $orderId]);
    $rows = $s->fetchAll();
    if ($rows === []) {
        return null;
    }
    $missing = array_filter($rows, static fn (array $r): bool => $r['actual_total_cost_minor'] === null || $r['currency'] !== $order['currency']);
    $expected = $pdo->prepare("SELECT total_cost_minor, contribution_minor FROM order_economics WHERE order_id = :o AND kind = 'EXPECTED' ORDER BY id DESC LIMIT 1");
    $expected->execute([':o' => $orderId]);
    $exp = $expected->fetch() ?: ['total_cost_minor' => null, 'contribution_minor' => null];
    $revenue = (int) $order['total_minor'];
    $total = $missing === [] ? array_sum(array_map(static fn (array $r): int => (int) $r['actual_total_cost_minor'], $rows)) : null;
    $e = [
        'currency' => (string) $order['currency'], 'revenue_minor' => $revenue,
        'purchase_cost_minor' => $missing === [] ? array_sum(array_map(static fn (array $r): int => (int) $r['actual_purchase_cost_minor'], $rows)) : null,
        'shipping_cost_minor' => $missing === [] ? array_sum(array_map(static fn (array $r): int => (int) $r['actual_shipping_cost_minor'], $rows)) : null,
        'contingency_minor' => null, 'handling_minor' => null, 'total_cost_minor' => $total,
        'contribution_minor' => $total === null ? null : $revenue - $total,
        'margin_basis_points' => $total === null || $revenue <= 0 ? null : intdiv(($revenue - $total) * 10000, $revenue),
        'supplier_orders' => count($rows),
        'expected_total_cost_minor' => $exp['total_cost_minor'] === null ? null : (int) $exp['total_cost_minor'],
        'expected_contribution_minor' => $exp['contribution_minor'] === null ? null : (int) $exp['contribution_minor'],
    ];
    $e['cost_variance_minor'] = $total === null || $e['expected_total_cost_minor'] === null ? null : $total - $e['expected_total_cost_minor'];
    $e['contribution_variance_minor'] = $e['contribution_minor'] === null || $e['expected_contribution_minor'] === null ? null : $e['contribution_minor'] - $e['expected_contribution_minor'];
    $e['status'] = $total === null ? 'COMMERCIAL_DATA_REQUIRED' : ($e['contribution_minor'] < 0 ? 'COMMERCIAL_SAFETY_EXCEPTION' : 'CALCULATED');
    $id = fulfilment_store_economics($pdo, $orderId, 'ACTUAL', $e);
    if ($e['status'] === 'COMMERCIAL_SAFETY_EXCEPTION') {
        // The paid price is honoured; this is a record for the Founders, not a customer charge.
        if (raise_fulfilment_exception($pdo, $orderId, 'COMMERCIAL_SAFETY_EXCEPTION', ['blocking' => false, 'detail' => 'Actual fulfilment cost exceeds revenue.', 'next_action' => 'Review the variance; the customer\'s paid price is honoured.'], 'SYSTEM', "commercial-actual:{$id}", false) !== null) {
            notify_founders_about_order($pdo, 'COMMERCIAL_SAFETY_EXCEPTION', $orderId, "commercial-actual:{$orderId}:{$id}", ['reason' => 'ACTUAL_CONTRIBUTION_NEGATIVE']);
        }
    }
    return $e + ['snapshot_id' => $id];
}

/* ------------------------------------------------------------------ */
/* Shipments                                                           */
/* ------------------------------------------------------------------ */

function order_shipments(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare('SELECT * FROM shipments WHERE order_id = :o ORDER BY sequence');
    $stmt->execute([':o' => $orderId]);
    return $stmt->fetchAll();
}

function shipment_for_order(PDO $pdo, int $orderId, mixed $id): array
{
    $stmt = $pdo->prepare('SELECT * FROM shipments WHERE id = :id FOR UPDATE');
    $stmt->execute([':id' => is_int($id) ? $id : 0]);
    $s = $stmt->fetch();
    if ($s === false || (int) $s['order_id'] !== $orderId) {
        throw new OperationsException('shipment_not_found', 'No such parcel on this order.', 404);
    }
    return $s;
}

function add_shipment(PDO $pdo, int $orderId, array $in, string $staff): int
{
    $seq = $pdo->prepare('SELECT COALESCE(MAX(sequence), 0) + 1 FROM shipments WHERE order_id = :o');
    $seq->execute([':o' => $orderId]);
    $supplierOrder = is_int($in['supplier_order_id'] ?? null) ? $in['supplier_order_id'] : null;
    if ($supplierOrder !== null) {
        $chk = $pdo->prepare('SELECT COUNT(*) FROM supplier_orders WHERE id = :id AND order_id = :o');
        $chk->execute([':id' => $supplierOrder, ':o' => $orderId]);
        if ((int) $chk->fetchColumn() === 0) {
            throw new OperationsException('supplier_order_not_found', 'No such supplier order on this order.', 404);
        }
    }
    $skus = is_array($in['skus'] ?? null) ? implode(',', array_filter($in['skus'], 'is_string')) : null;
    $pdo->prepare('INSERT INTO shipments (order_id, supplier_order_id, sequence, skus, required, state, created_by, created_at) VALUES (:o, :so, :seq, :skus, :req, :st, :by, UTC_TIMESTAMP())')
        ->execute([':o' => $orderId, ':so' => $supplierOrder, ':seq' => (int) $seq->fetchColumn(), ':skus' => $skus, ':req' => ($in['required'] ?? true) === false ? 0 : 1, ':st' => 'AWAITING_DISPATCH', ':by' => $staff]);
    return (int) $pdo->lastInsertId();
}

/**
 * Whether commercial delivery is complete: at least one parcel, every
 * required parcel delivered, and no blocking exception open.
 */
function order_delivery_position(PDO $pdo, int $orderId): array
{
    $shipments = order_shipments($pdo, $orderId);
    $required = array_values(array_filter($shipments, static fn (array $s): bool => (int) $s['required'] === 1));
    $undelivered = array_values(array_filter($required, static fn (array $s): bool => $s['state'] !== 'DELIVERED'));
    $blocking = open_blocking_exceptions($pdo, $orderId);
    return [
        'parcels' => count($shipments), 'required' => count($required),
        'delivered' => count($required) - count($undelivered),
        'undelivered_sequences' => array_map(static fn (array $s): int => (int) $s['sequence'], $undelivered),
        'blocking_exceptions' => array_column($blocking, 'type'),
        'complete' => $required !== [] && $undelivered === [] && $blocking === [],
    ];
}

function commercial_safety_proceed_approved(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id = :o AND type = 'COMMERCIAL_SAFETY_EXCEPTION' AND status = 'RESOLVED' AND resolution_authorised_by IS NOT NULL");
    $stmt->execute([':o' => $orderId]);
    return (int) $stmt->fetchColumn() > 0;
}

/* ------------------------------------------------------------------ */
/* Founder approval summary                                            */
/* ------------------------------------------------------------------ */

/**
 * The decision card data (STAFF ONLY): what the founder needs before
 * authorising, including what would block if enforcement were REQUIRED.
 */
function fulfilment_approval_summary(PDO $pdo, array $row): array
{
    $orderId = (int) $row['id'];
    $economics = fulfilment_expected_economics($pdo, $orderId);
    $destination = order_destination_check($pdo, $orderId);
    $package = current_manufacturing_package($pdo, $orderId);
    $lines = array_map(static function (array $l) use ($destination): array {
        $route = supplier_route_for_sku($l['sku']);
        $check = array_values(array_filter($destination['lines'], static fn (array $d): bool => $d['sku'] === $l['sku']))[0] ?? null;
        return [
            'sku' => $l['sku'], 'product' => $l['name'], 'quantity' => $l['quantity'],
            'route' => $route === null ? null : [
                'route_id' => $route['route_id'], 'supplier' => $route['supplier'], 'product_url' => $route['product_url'], 'configuration' => $route['configuration'],
                'shipping_model' => $route['shipping_model'], 'expected_purchase_cost_minor' => $route['expected_purchase_cost_minor'],
                'expected_supplier_shipping_minor' => $route['internal_allowance']['expected_supplier_shipping_minor'],
                'tracking_capability' => $route['tracking_capability'], 'customs_position' => $route['customs_position'],
                'production_estimate' => $route['production_estimate'], 'delivery_estimate' => $route['delivery_estimate'],
                'limitations' => $route['limitations'], 'verification_status' => $route['verification_status'], 'cancellation_cutoff' => $route['cancellation_cutoff'],
            ],
            'destination' => $check,
        ];
    }, fulfilment_lines($pdo, $orderId));
    $safetyOpen = $pdo->prepare("SELECT COUNT(*) FROM fulfilment_exceptions WHERE order_id = :o AND type = 'COMMERCIAL_SAFETY_EXCEPTION' AND status = 'OPEN'");
    $safetyOpen->execute([':o' => $orderId]);
    $wouldBlock = [];
    if (($package['status'] ?? null) !== 'READY') $wouldBlock[] = 'MANUFACTURING_PACKAGE_' . ($package['status'] ?? 'NOT_BUILT');
    if ($economics['status'] === 'COMMERCIAL_DATA_REQUIRED') $wouldBlock[] = 'COMMERCIAL_DATA_REQUIRED';
    if ((int) $safetyOpen->fetchColumn() > 0 || ($economics['status'] === 'COMMERCIAL_SAFETY_EXCEPTION' && !commercial_safety_proceed_approved($pdo, $orderId))) $wouldBlock[] = 'COMMERCIAL_SAFETY_EXCEPTION_UNRESOLVED';
    if (in_array($destination['status'], ['DESTINATION_UNKNOWN', 'DESTINATION_UNSUPPORTED'], true)) $wouldBlock[] = $destination['status'];
    return [
        'destination' => $destination['destination'],
        'destination_status' => $destination['status'],
        'lines' => $lines,
        'economics' => $economics,
        'enforcement' => creative_enforcement(),
        'would_block_if_required' => $wouldBlock,
        'action_required' => 'Bella or Lewis reviews this decision and, if right, authorises the supplier purchase with their own code.',
    ];
}

/* ------------------------------------------------------------------ */
/* Support evidence, permissions, lifecycle hooks                      */
/* ------------------------------------------------------------------ */

function prepare_lifecycle_hooks(PDO $pdo, int $orderId): void
{
    $stmt = $pdo->prepare('SELECT DISTINCT product_id FROM order_items WHERE order_id = :o');
    $stmt->execute([':o' => $orderId]);
    $products = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $hooks = ['ANOTHER_MEMORY', 'ANNIVERSARY_FOLLOW_UP'];
    if (in_array('journey', $products, true)) {
        $hooks[] = 'JOURNEY_CHAPTER';
    }
    if (array_intersect($products, ['moment', 'keepsake']) !== []) {
        $hooks[] = 'RELATED_KEEPSAKE';
    }
    foreach ($hooks as $hook) {
        // Prepared only: no date is invented, nothing is sent, and any marketing use needs consent.
        $pdo->prepare('INSERT IGNORE INTO lifecycle_hooks (order_id, hook, status, requires_marketing_consent) VALUES (:o, :h, :s, 1)')
            ->execute([':o' => $orderId, ':h' => $hook, ':s' => 'PREPARED']);
    }
}

/* ------------------------------------------------------------------ */
/* Health, metrics, scorecards, command centre                         */
/* ------------------------------------------------------------------ */

/** Orders that could be stranded. Reports every case with its age; nothing is changed. */
function fulfilment_health(PDO $pdo): array
{
    $q = static fn (string $sql): array => $pdo->query($sql)->fetchAll();
    $findings = [];
    $add = static function (string $check, array $rows) use (&$findings): void {
        foreach ($rows as $r) {
            $findings[] = ['check' => $check, 'order_id' => (int) $r['order_id'], 'reference' => $r['mcb_reference'] ?? null, 'since' => $r['since'] ?? null];
        }
    };
    $add('PAID_ORDER_WITHOUT_PROCESSING_EVENT', $q("SELECT o.id AS order_id, o.mcb_reference, o.updated_at AS since FROM orders o WHERE o.status = 'PAID' AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = o.id AND e.dedupe_key = 'ready-for-processing') LIMIT 200"));
    $add('READY_PACKAGE_WITHOUT_FOUNDER_NOTIFICATION', $q("SELECT m.order_id, o.mcb_reference, m.created_at AS since FROM manufacturing_packages m JOIN orders o ON o.id = m.order_id LEFT JOIN order_production p ON p.order_id = o.id WHERE m.status = 'READY' AND p.fulfilment_state = 'READY' AND NOT EXISTS (SELECT 1 FROM founder_notifications n WHERE n.order_id = m.order_id AND n.notification_type = 'FULFILMENT_APPROVAL_REQUIRED') LIMIT 200"));
    $add('AUTHORISED_WITHOUT_SUPPLIER_ORDER', $q("SELECT p.order_id, o.mcb_reference, p.supplier_purchase_authorised_at AS since FROM order_production p JOIN orders o ON o.id = p.order_id WHERE p.supplier_purchase_authorised_at IS NOT NULL AND p.fulfilment_confirmed_at IS NULL AND NOT EXISTS (SELECT 1 FROM supplier_orders s WHERE s.order_id = p.order_id) LIMIT 200"));
    $add('SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH', $q("SELECT s.order_id, o.mcb_reference, s.expected_dispatch_date AS since FROM supplier_orders s JOIN orders o ON o.id = s.order_id WHERE s.status = 'RECORDED' AND s.expected_dispatch_date IS NOT NULL AND s.expected_dispatch_date < UTC_DATE() AND NOT EXISTS (SELECT 1 FROM shipments sh WHERE sh.order_id = s.order_id AND sh.dispatched_on IS NOT NULL) LIMIT 200"));
    $add('DISPATCHED_PARCEL_OVERDUE', $q("SELECT sh.order_id, o.mcb_reference, sh.estimated_delivery_date AS since FROM shipments sh JOIN orders o ON o.id = sh.order_id WHERE sh.state IN ('DISPATCHED','IN_TRANSIT','DELAYED') AND sh.estimated_delivery_date IS NOT NULL AND sh.estimated_delivery_date < UTC_DATE() LIMIT 200"));
    $add('DELIVERED_NOT_COMPLETED', $q("SELECT p.order_id, o.mcb_reference, p.delivered_on AS since FROM order_production p JOIN orders o ON o.id = p.order_id WHERE p.fulfilment_state = 'DELIVERED' AND p.stage <> 'COMPLETED' LIMIT 200"));
    $add('COMPLETED_WITHOUT_FOLLOW_UP', $q("SELECT p.order_id, o.mcb_reference, p.completed_at AS since FROM order_production p JOIN orders o ON o.id = p.order_id WHERE p.stage = 'COMPLETED' AND p.follow_up_due_at IS NULL LIMIT 200"));
    $add('ABANDONED_NOTIFICATION', $q("SELECT n.order_id, n.subject_reference AS mcb_reference, n.updated_at AS since FROM founder_notifications n WHERE n.status = 'ABANDONED' AND n.order_id IS NOT NULL LIMIT 200"));
    $add('UNRESOLVED_FULFILMENT_EXCEPTION', $q("SELECT f.order_id, o.mcb_reference, f.created_at AS since FROM fulfilment_exceptions f JOIN orders o ON o.id = f.order_id WHERE f.status = 'OPEN' LIMIT 200"));
    return $findings;
}

function fulfilment_metrics(PDO $pdo): array
{
    $one = static fn (string $sql): mixed => $pdo->query($sql)->fetchColumn();
    $avgHours = static fn (string $from, string $to, string $join = ''): ?float => ($v = $pdo->query("SELECT AVG(TIMESTAMPDIFF(MINUTE, {$from}, {$to})) / 60 FROM order_production p JOIN orders o ON o.id = p.order_id {$join} WHERE {$to} IS NOT NULL AND {$from} IS NOT NULL")->fetchColumn()) === null || $v === false ? null : round((float) $v, 1);
    $physical = (int) $one("SELECT COUNT(*) FROM orders WHERE status = 'PAID' AND fulfilment_type = 'PHYSICAL'");
    $withException = static fn (string $types): int => (int) $pdo->query("SELECT COUNT(DISTINCT order_id) FROM fulfilment_exceptions WHERE type IN ({$types})")->fetchColumn();
    return [
        'supplier_orders' => (int) $one("SELECT COUNT(*) FROM supplier_orders WHERE status = 'RECORDED'"),
        'supplier_spend_minor' => (int) $one("SELECT COALESCE(SUM(actual_total_cost_minor), 0) FROM supplier_orders WHERE status = 'RECORDED'"),
        'expected_cost_minor' => (int) $one("SELECT COALESCE(SUM(expected_total_cost_minor), 0) FROM supplier_orders WHERE status = 'RECORDED' AND actual_total_cost_minor IS NOT NULL"),
        'cost_variance_minor' => (int) $one("SELECT COALESCE(SUM(variance_minor), 0) FROM supplier_orders WHERE status = 'RECORDED'"),
        'hours_payment_to_qc' => $avgHours('o.created_at', 'p.qc_passed_at'),
        'hours_qc_to_founder_authorisation' => $avgHours('p.qc_passed_at', 'p.supplier_purchase_authorised_at'),
        'hours_authorisation_to_supplier_order' => $avgHours('p.supplier_purchase_authorised_at', 'p.fulfilment_confirmed_at'),
        'days_supplier_order_to_dispatch' => ($v = $one("SELECT AVG(DATEDIFF(p.dispatched_on, DATE(p.fulfilment_confirmed_at))) FROM order_production p WHERE p.dispatched_on IS NOT NULL AND p.fulfilment_confirmed_at IS NOT NULL")) === null ? null : round((float) $v, 1),
        'days_dispatch_to_delivery' => ($v = $one("SELECT AVG(DATEDIFF(delivered_on, dispatched_on)) FROM shipments WHERE delivered_on IS NOT NULL AND dispatched_on IS NOT NULL")) === null ? null : round((float) $v, 1),
        'days_payment_to_delivery' => ($v = $one("SELECT AVG(DATEDIFF(p.delivered_on, DATE(o.created_at))) FROM order_production p JOIN orders o ON o.id = p.order_id WHERE p.delivered_on IS NOT NULL")) === null ? null : round((float) $v, 1),
        'physical_orders' => $physical,
        'delayed_order_rate' => $physical > 0 ? round($withException("'SUPPLIER_DELAY','PRODUCTION_DELAY','PARCEL_DELAYED','TRACKING_STALLED'") / $physical, 3) : null,
        'damaged_order_rate' => $physical > 0 ? round($withException("'PARCEL_DAMAGED','MANUFACTURING_DEFECT'") / $physical, 3) : null,
        'replacement_rate' => $physical > 0 ? round((int) $one("SELECT COUNT(DISTINCT order_id) FROM fulfilment_exceptions WHERE resolution = 'REPLACEMENT_ARRANGED'") / $physical, 3) : null,
        'supplier_exception_rate' => $physical > 0 ? round($withException("'SUPPLIER_DELAY','SUPPLIER_CANCELLED','WRONG_ITEM','MANUFACTURING_DEFECT'") / $physical, 3) : null,
        'destination_exception_rate' => $physical > 0 ? round($withException("'DESTINATION_PROBLEM','CUSTOMS_EXCEPTION'") / $physical, 3) : null,
        'gross_contribution_per_order_minor' => ($v = $one("SELECT AVG(e.contribution_minor) FROM order_economics e JOIN (SELECT order_id, MAX(id) AS id FROM order_economics WHERE kind = 'ACTUAL' AND status <> 'COMMERCIAL_DATA_REQUIRED' GROUP BY order_id) l ON l.id = e.id")) === null ? null : (int) round((float) $v),
        'note' => 'Internal only. No financial decision is taken automatically from these figures.',
    ];
}

/** Per supplier route: evidence for founder decisions. Nothing replaces a supplier automatically. */
function supplier_scorecards(PDO $pdo): array
{
    $rows = $pdo->query(
        "SELECT s.route_id,
                COUNT(DISTINCT s.id) AS fulfilments,
                AVG(s.actual_purchase_cost_minor - s.expected_purchase_cost_minor) AS avg_purchase_variance_minor,
                AVG(s.actual_shipping_cost_minor - s.expected_shipping_cost_minor) AS avg_shipping_variance_minor,
                AVG(DATEDIFF(sh.dispatched_on, DATE(s.purchased_at))) AS avg_days_to_dispatch,
                AVG(DATEDIFF(sh.delivered_on, sh.dispatched_on)) AS avg_days_in_transit,
                SUM(sh.tracking_reference IS NOT NULL) / NULLIF(COUNT(sh.id), 0) AS tracking_reliability,
                SUM(s.status = 'CANCELLED_BY_SUPPLIER') AS cancellations
           FROM supplier_orders s LEFT JOIN shipments sh ON sh.supplier_order_id = s.id
          GROUP BY s.route_id"
    )->fetchAll();
    $exc = $pdo->prepare("SELECT type, COUNT(*) AS n FROM fulfilment_exceptions f JOIN supplier_orders s ON s.order_id = f.order_id WHERE s.route_id <=> :r GROUP BY type");
    $dest = $pdo->prepare("SELECT d.country_code, COUNT(*) AS n FROM supplier_orders s JOIN delivery_addresses d ON d.order_id = s.order_id WHERE s.route_id <=> :r GROUP BY d.country_code");
    return array_map(static function (array $r) use ($exc, $dest): array {
        $exc->execute([':r' => $r['route_id']]);
        $types = array_column($exc->fetchAll(), 'n', 'type');
        $dest->execute([':r' => $r['route_id']]);
        $n = max(1, (int) $r['fulfilments']);
        return [
            'route_id' => $r['route_id'], 'fulfilments' => (int) $r['fulfilments'],
            'avg_purchase_variance_minor' => $r['avg_purchase_variance_minor'] === null ? null : (int) round((float) $r['avg_purchase_variance_minor']),
            'avg_shipping_variance_minor' => $r['avg_shipping_variance_minor'] === null ? null : (int) round((float) $r['avg_shipping_variance_minor']),
            'avg_days_to_dispatch' => $r['avg_days_to_dispatch'] === null ? null : round((float) $r['avg_days_to_dispatch'], 1),
            'avg_days_in_transit' => $r['avg_days_in_transit'] === null ? null : round((float) $r['avg_days_in_transit'], 1),
            'tracking_reliability' => $r['tracking_reliability'] === null ? null : round((float) $r['tracking_reliability'], 3),
            'damage_rate' => round(((int) ($types['PARCEL_DAMAGED'] ?? 0) + (int) ($types['MANUFACTURING_DEFECT'] ?? 0)) / $n, 3),
            'wrong_item_rate' => round((int) ($types['WRONG_ITEM'] ?? 0) / $n, 3),
            'cancellation_rate' => round((int) $r['cancellations'] / $n, 3),
            'exceptions' => array_map('intval', $types),
            'destinations' => array_map('intval', array_column($dest->fetchAll(), 'n', 'country_code')),
        ];
    }, $rows);
}

/** Today at a glance, for the next sprint's founder command centre. */
function fulfilment_command_centre(PDO $pdo): array
{
    $one = static fn (string $sql): int => (int) $pdo->query($sql)->fetchColumn();
    $states = [];
    foreach ($pdo->query('SELECT ' . MCB_OPERATIONS_COLUMNS . " FROM orders o LEFT JOIN order_production p ON p.order_id = o.id WHERE o.status = 'PAID' AND (p.stage IS NULL OR p.stage <> 'COMPLETED') LIMIT 2000")->fetchAll() as $row) {
        $s = operational_state($row);
        $states[$s] = ($states[$s] ?? 0) + 1;
    }
    $latest = static fn (string $kind): ?int => ($v = $pdo->query("SELECT SUM(e.contribution_minor) FROM order_economics e JOIN (SELECT order_id, MAX(id) AS id FROM order_economics WHERE kind = '{$kind}' GROUP BY order_id) l ON l.id = e.id JOIN orders o ON o.id = e.order_id WHERE e.contribution_minor IS NOT NULL AND DATE(o.created_at) = UTC_DATE()")->fetchColumn()) === null || $v === false ? null : (int) $v;
    return [
        'date' => gmdate('Y-m-d'),
        'new_paid_orders' => $one("SELECT COUNT(*) FROM orders o JOIN order_events e ON e.order_id = o.id AND e.dedupe_key = 'paid' WHERE DATE(e.created_at) = UTC_DATE()"),
        'revenue_minor' => $one("SELECT COALESCE(SUM(o.total_minor), 0) FROM orders o JOIN order_events e ON e.order_id = o.id AND e.dedupe_key = 'paid' WHERE DATE(e.created_at) = UTC_DATE()"),
        'orders_creating' => ($states['CREATIVE.PENDING'] ?? 0) + ($states['CREATIVE.IN_PROGRESS'] ?? 0) + ($states['ORDER.PAID'] ?? 0),
        'qc_required' => $states['QUALITY_CHECK'] ?? 0,
        'founder_approvals_required' => $states['FULFILMENT.READY'] ?? 0,
        'supplier_orders_required' => $states['FULFILMENT.AUTHORISED'] ?? 0,
        'dispatched' => $states['DISPATCHED'] ?? 0,
        'delivered_today' => $one("SELECT COUNT(*) FROM order_production WHERE delivered_on = UTC_DATE()"),
        'open_exceptions' => $one("SELECT COUNT(*) FROM fulfilment_exceptions WHERE status = 'OPEN'"),
        'estimated_gross_contribution_minor' => $latest('EXPECTED'),
        'actual_gross_contribution_minor' => $latest('ACTUAL'),
    ];
}

/** One order's controller record for staff (the workspace and the decision card). */
function fulfilment_order_record(PDO $pdo, array $row): ?array
{
    if (order_workflow($row) !== 'PHYSICAL') {
        return null;
    }
    $orderId = (int) $row['id'];
    $all = static function (string $sql) use ($pdo, $orderId): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':o' => $orderId]);
        return $stmt->fetchAll();
    };
    $int = static fn ($v): ?int => $v === null ? null : (int) $v;
    return [
        'decision' => fulfilment_approval_summary($pdo, $row),
        'workspace' => $row['supplier_purchase_authorised_at'] === null ? null : [
            'authorised_by' => $row['supplier_purchase_authorised_by'],
            'authorised_at' => $row['supplier_purchase_authorised_at'],
            'instructions' => array_map(static function (array $l): array {
                $route = supplier_route_for_sku($l['sku']);
                return ['sku' => $l['sku'], 'product' => $l['name'], 'quantity' => $l['quantity'], 'route_id' => $route['route_id'] ?? null,
                    'supplier' => $route['supplier'] ?? null, 'product_url' => $route['product_url'] ?? null, 'configuration' => $route['configuration'] ?? null,
                    'order_instructions' => $route['order_instructions'] ?? null, 'cancellation_cutoff' => $route['cancellation_cutoff'] ?? null,
                    'checkout_destination_check' => in_array($route['shipping_model'] ?? null, ['MARKETPLACE_LISTING_DEPENDENT', 'MANUAL_FULFILMENT_REVIEW'], true) || ($route['verification_status'] ?? 'UNVERIFIED') !== 'VERIFIED'];
            }, fulfilment_lines($pdo, $orderId)),
            'note' => 'Place each order by hand at the supplier. Nothing here checks out or pays. Never record card or payment details.',
        ],
        'supplier_orders' => array_map(static fn (array $s): array => [
            'id' => (int) $s['id'], 'route_id' => $s['route_id'], 'reference' => $s['supplier_order_reference'], 'skus' => $s['skus'] === null ? [] : explode(',', $s['skus']),
            'purchased_at' => $s['purchased_at'], 'operator' => $s['operator'], 'financial_authoriser' => $s['financial_authoriser'], 'currency' => $s['currency'],
            'expected_total_cost_minor' => $int($s['expected_total_cost_minor']), 'actual_purchase_cost_minor' => $int($s['actual_purchase_cost_minor']),
            'actual_shipping_cost_minor' => $int($s['actual_shipping_cost_minor']), 'actual_total_cost_minor' => $int($s['actual_total_cost_minor']),
            'variance_minor' => $int($s['variance_minor']), 'variance_reason' => $s['variance_reason'], 'expected_dispatch_date' => $s['expected_dispatch_date'],
            'expected_delivery_date' => $s['expected_delivery_date'], 'tracking_pending' => (int) $s['tracking_pending'] === 1, 'status' => $s['status'],
        ], $all('SELECT * FROM supplier_orders WHERE order_id = :o ORDER BY id')),
        'shipments' => array_map(static fn (array $s): array => [
            'id' => (int) $s['id'], 'sequence' => (int) $s['sequence'], 'supplier_order_id' => $int($s['supplier_order_id']), 'required' => (int) $s['required'] === 1,
            'state' => $s['state'], 'carrier' => $s['carrier'], 'tracking_reference' => $s['tracking_reference'], 'tracking_url' => $s['tracking_url'],
            'dispatched_on' => $s['dispatched_on'], 'estimated_delivery_date' => $s['estimated_delivery_date'], 'delivered_on' => $s['delivered_on'],
        ], order_shipments($pdo, $orderId)),
        'delivery_position' => order_delivery_position($pdo, $orderId),
        'exceptions' => array_map(static fn (array $e): array => [
            'id' => (int) $e['id'], 'type' => $e['type'], 'status' => $e['status'], 'blocking' => (int) $e['blocking'] === 1, 'shipment_id' => $int($e['shipment_id']),
            'service_request_id' => $int($e['service_request_id']), 'next_action' => $e['next_action'], 'detail' => $e['detail'], 'resolution' => $e['resolution'],
            'resolution_authorised_by' => $e['resolution_authorised_by'], 'opened_by' => $e['opened_by'], 'created_at' => $e['created_at'], 'resolved_at' => $e['resolved_at'],
        ], $all('SELECT * FROM fulfilment_exceptions WHERE order_id = :o ORDER BY id')),
        'actual_economics' => ($a = $all("SELECT body FROM order_economics WHERE order_id = :o AND kind = 'ACTUAL' ORDER BY id DESC LIMIT 1")) === [] ? null : json_decode((string) $a[0]['body'], true),
        'evidence' => array_map(static fn (array $e): array => ['id' => (int) $e['id'], 'service_request_id' => (int) $e['service_request_id'], 'kind' => $e['kind'],
            'has_file' => $e['stored_name'] !== null, 'mime_type' => $e['mime_type'], 'byte_size' => $int($e['byte_size']), 'reference' => $e['reference_text'], 'created_at' => $e['created_at']],
            $all('SELECT id, service_request_id, kind, stored_name, mime_type, byte_size, reference_text, created_at FROM support_evidence WHERE order_id = :o ORDER BY id')),
        'content_permissions' => $all('SELECT scope, status, granted_via, evidence_reference, recorded_by, granted_at, withdrawn_at FROM customer_content_permissions WHERE order_id = :o ORDER BY scope'),
        'lifecycle_hooks' => $all('SELECT hook, status, due_on, requires_marketing_consent FROM lifecycle_hooks WHERE order_id = :o ORDER BY hook'),
        'review_requested' => (bool) ($all("SELECT COUNT(*) AS n FROM order_events WHERE order_id = :o AND event_type = 'REVIEW.REQUESTED'")[0]['n'] ?? 0),
    ];
}
