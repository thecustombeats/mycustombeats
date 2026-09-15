<?php
/**
 * MCB — delivery, quoted by the server.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO DELIVERY PRICE IS INVENTED HERE
 * ─────────────────────────────────────────────────────────────────────────
 * This file ships with NO production rates. A physical order is quoted
 * UNAVAILABLE and cannot be paid online until MCB supplies an authorised rate
 * for that kind of item and that destination. Delivery is never assumed to
 * be free, and MCB's internal shipping allowances (planning figures, not
 * prices) never belong in this file, the rate table or anything a customer
 * sees.
 *
 * Three outcomes:
 *   NOT_REQUIRED  nothing to post (a Moment)                       £0
 *   QUOTED        an authorised rate covers every physical item    from rates
 *   UNAVAILABLE   something physical has no authorised rate        refuse checkout
 *
 * An UNAVAILABLE quote says why, so the customer is told the truth:
 *   MCB_CONFIRMS_DELIVERY  delivery for an item in the order is confirmed by
 *                          MCB with the customer before any payment
 *                          (listing-dependent or manual-review items)
 *   NO_DELIVERY_RATE       no authorised rate for this destination yet
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DELIVERY CLASSES AND HOW EACH IS PRICED
 * ─────────────────────────────────────────────────────────────────────────
 * Each physical product has a delivery class in the catalogue (VINYL, FRAME,
 * PLAQUE, PLAYER, CARD). The class profile below decides how its delivery may
 * be priced. The profiles are internal and never sent to a customer:
 *
 *   DESTINATION_CALCULATED  priced from an authorised rate for the
 *                           destination (a rate of 0 is verified free
 *                           delivery; one rate for every destination is a
 *                           verified fixed rate)
 *   LISTING_DEPENDENT       availability or delivery must be verified at
 *                           order time with the partner, so MCB confirms it
 *                           with the customer before payment
 *   MANUAL_REVIEW           no safe way yet to price delivery; MCB confirms
 *                           it with the customer before payment
 *
 * The rate table may promote a class to DESTINATION_CALCULATED (`pricing`),
 * but only a rate that names that class can then price it — a general rate
 * never silently prices a gramophone or a plaque.
 *
 * `confirm_availability` marks classes whose availability, destination and
 * actual delivery cost staff must confirm with the partner before the order
 * is treated as fulfilment-ready (see fulfilment_blocker()). Supplier
 * purchase is always a human action; nothing here buys anything.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE A RATE CAN COME FROM
 * ─────────────────────────────────────────────────────────────────────────
 *   RATE_TABLE          api/data/delivery-rates.json — the production source
 *                       once MCB supplies it. Not present in this repository.
 *   TEST_ONLY_FIXTURE   the constants below, for Stripe TEST-mode rehearsal
 *                       only. Used only when BOTH the configured Stripe key is
 *                       a test key AND `delivery.use_test_fixtures` is true.
 *                       A live key refuses them even with the flag set. Their
 *                       labels say TEST ONLY, and orders record the source, so
 *                       checkout can refuse a fixture-quoted order in live mode.
 *
 * Rate table shape (all amounts integer pence, GBP):
 *   {
 *     "currency": "GBP",
 *     "pricing": { "PLAQUE": "DESTINATION_CALCULATED" },        optional
 *     "rates": [
 *       { "id": "UK_VINYL", "label": "UK tracked delivery", "countries": ["GB"],
 *         "classes": ["VINYL"], "first_item_minor": 0, "additional_item_minor": 0 }
 *     ]
 *   }
 * `countries` is a list of ISO codes or "*" for everywhere else. A rate with
 * no `classes` covers only classes whose profile allows a general rate.
 * Different classes are charged separately and added together, because they
 * may come from different partners and travel as separate parcels.
 */

declare(strict_types=1);

const DELIVERY_PRICING_STATES = ['DESTINATION_CALCULATED', 'LISTING_DEPENDENT', 'MANUAL_REVIEW'];

/**
 * INTERNAL. Defaults are the safest reading of what MCB has verified:
 * vinyl and frames can be priced once rates exist; plaques (route verified
 * for few destinations), players and pop-up cards (availability-sensitive)
 * are confirmed by MCB before payment until the rate table says otherwise.
 */
const DELIVERY_CLASS_PROFILES = [
    'VINYL'  => ['pricing' => 'DESTINATION_CALCULATED', 'general_rate' => true,  'confirm_availability' => false, 'made_to_order' => true],
    'FRAME'  => ['pricing' => 'DESTINATION_CALCULATED', 'general_rate' => false, 'confirm_availability' => false, 'made_to_order' => true],
    'PLAQUE' => ['pricing' => 'MANUAL_REVIEW',          'general_rate' => false, 'confirm_availability' => true,  'made_to_order' => true],
    'PLAYER' => ['pricing' => 'LISTING_DEPENDENT',      'general_rate' => false, 'confirm_availability' => true,  'made_to_order' => false],
    'CARD'   => ['pricing' => 'LISTING_DEPENDENT',      'general_rate' => false, 'confirm_availability' => true,  'made_to_order' => false],
];

/**
 * TEST ONLY. Deliberately unlike any real price, clearly labelled, and
 * unreachable with a live Stripe key. Frames have their own test rate so the
 * class-scoped path is rehearsed; plaques and players keep their default
 * "MCB confirms" profile in test too.
 */
const TEST_ONLY_DELIVERY_RATES = [
    [
        'id'                    => 'TEST_ONLY_UK',
        'label'                 => 'TEST ONLY — UK delivery (not a real rate)',
        'countries'             => ['GB'],
        'first_item_minor'      => 495,
        'additional_item_minor' => 105,
    ],
    [
        'id'                    => 'TEST_ONLY_INTERNATIONAL',
        'label'                 => 'TEST ONLY — international delivery (not a real rate)',
        'countries'             => '*',
        'first_item_minor'      => 1495,
        'additional_item_minor' => 305,
    ],
    [
        'id'                    => 'TEST_ONLY_FRAME',
        'label'                 => 'TEST ONLY — frame delivery (not a real rate)',
        'countries'             => '*',
        'classes'               => ['FRAME'],
        'first_item_minor'      => 695,
        'additional_item_minor' => 205,
    ],
];

final class DeliveryQuote
{
    /** @param list<string> $reviewItems product names MCB must confirm delivery for */
    private function __construct(
        public readonly string $status,
        public readonly int $minor,
        public readonly ?string $source,
        public readonly ?string $rateId,
        public readonly ?string $label,
        public readonly ?string $reason = null,
        public readonly array $reviewItems = []
    ) {
    }

    public static function notRequired(): self
    {
        return new self('NOT_REQUIRED', 0, null, null, null);
    }

    /** @param list<string> $reviewItems */
    public static function unavailable(string $reason = 'NO_DELIVERY_RATE', array $reviewItems = []): self
    {
        return new self('UNAVAILABLE', 0, null, null, null, $reason, $reviewItems);
    }

    public static function quoted(int $minor, string $source, string $rateId, string $label): self
    {
        return new self('QUOTED', $minor, $source, $rateId, $label);
    }

    public function isTestOnly(): bool
    {
        return $this->source === 'TEST_ONLY_FIXTURE';
    }

    /** What the browser may be told. No profiles, rate table internals or partners. */
    public function publicView(): array
    {
        return [
            'status'       => $this->status,
            'minor'        => $this->minor,
            'label'        => $this->label,
            'test_only'    => $this->isTestOnly(),
            'reason'       => $this->reason,
            'review_items' => $this->reviewItems,
        ];
    }
}

/** The production rate table, when MCB has supplied one. Null today. */
function delivery_rate_file(): ?array
{
    static $loaded = false;
    static $file = null;
    if ($loaded) {
        return $file;
    }
    $loaded = true;
    $path = __DIR__ . '/../data/delivery-rates.json';
    if (!is_readable($path)) {
        return null;
    }
    $json = json_decode((string) file_get_contents($path), true);
    if (!is_array($json) || ($json['currency'] ?? null) !== 'GBP' || !is_array($json['rates'] ?? null)) {
        // A present but unreadable table refuses delivery rather than guessing.
        error_log('MCB delivery: data/delivery-rates.json is present but invalid; no rates offered.');
        $file = ['currency' => 'GBP', 'rates' => []];
        return $file;
    }
    $file = $json;
    return $file;
}

/** The production rates, or null when no table exists. */
function delivery_rate_table(): ?array
{
    $file = delivery_rate_file();
    return $file === null ? null : $file['rates'];
}

/**
 * The internal profile for a delivery class, with any pricing promotion the
 * rate table makes. An unknown class is confirmed by MCB, never priced.
 */
function delivery_class_profile(?string $class): array
{
    $profile = DELIVERY_CLASS_PROFILES[$class ?? ''] ?? ['pricing' => 'MANUAL_REVIEW', 'general_rate' => false, 'confirm_availability' => true, 'made_to_order' => true];
    $file = delivery_rate_file();
    $override = is_array($file['pricing'] ?? null) ? ($file['pricing'][$class ?? ''] ?? null) : null;
    if (is_string($override) && in_array($override, DELIVERY_PRICING_STATES, true)) {
        $profile['pricing'] = $override;
    }
    return $profile;
}

/** Whether TEST_ONLY fixtures may be used by this server, right now. */
function delivery_test_fixtures_allowed(): bool
{
    if (mcb_setting('delivery.use_test_fixtures', false) !== true) {
        return false;
    }
    $mode = stripe_key_mode((string) mcb_setting('stripe.secret_key', ''));
    if ($mode !== 'test') {
        if ($mode === 'live') {
            error_log('MCB delivery: delivery.use_test_fixtures is set on a server with a LIVE Stripe key; ignored.');
        }
        return false;
    }
    return true;
}

/**
 * Evaluates one rate list for a destination and a number of items.
 *
 * `$class` null selects general rates (no `classes`); a class selects only
 * rates naming it. A country match beats the "*" fallback.
 */
function delivery_rate_for(array $rates, string $countryCode, int $items, ?string $class = null): ?array
{
    $fallback = null;
    foreach ($rates as $rate) {
        if (!is_array($rate) || !is_int($rate['first_item_minor'] ?? null) || !is_int($rate['additional_item_minor'] ?? null)
            || $rate['first_item_minor'] < 0 || $rate['additional_item_minor'] < 0
            || !is_string($rate['id'] ?? null) || !is_string($rate['label'] ?? null)) {
            continue;
        }
        $classes = $rate['classes'] ?? null;
        if ($class === null ? $classes !== null : (!is_array($classes) || !in_array($class, $classes, true))) {
            continue;
        }
        $countries = $rate['countries'] ?? null;
        $found = ['rate' => $rate, 'minor' => $rate['first_item_minor'] + max(0, $items - 1) * $rate['additional_item_minor']];
        if (is_array($countries) && in_array($countryCode, $countries, true)) {
            return $found;
        }
        if ($countries === '*' && $fallback === null) {
            $fallback = $found;
        }
    }
    return $fallback;
}

/**
 * Quotes delivery for priced lines to a destination.
 *
 * @param ?string $countryCode ISO 3166-1 alpha-2, already validated
 */
function quote_delivery(OrderPricing $pricing, ?string $countryCode): DeliveryQuote
{
    if ($pricing->fulfilmentType() !== 'PHYSICAL') {
        return DeliveryQuote::notRequired();
    }

    // Physical items grouped by delivery class, in order of first appearance.
    $byClass = [];
    $namesByClass = [];
    foreach ($pricing->lines as $line) {
        if ($line['fulfilment'] !== 'PHYSICAL') {
            continue;
        }
        $class = (string) ($line['delivery_class'] ?? '');
        $byClass[$class] = ($byClass[$class] ?? 0) + $line['quantity'];
        $namesByClass[$class][] = (string) (catalogue_product((string) $line['product_id'])['name'] ?? $line['name']);
    }

    // Anything MCB must confirm first: say which items, before asking where.
    $review = [];
    foreach ($byClass as $class => $_) {
        if (delivery_class_profile($class)['pricing'] !== 'DESTINATION_CALCULATED') {
            array_push($review, ...$namesByClass[$class]);
        }
    }
    if ($review !== []) {
        return DeliveryQuote::unavailable('MCB_CONFIRMS_DELIVERY', array_values(array_unique($review)));
    }
    if ($countryCode === null) {
        return DeliveryQuote::unavailable();
    }

    $table = delivery_rate_table();
    if ($table !== null) {
        $source = 'RATE_TABLE';
        $rates  = $table;
    } elseif (delivery_test_fixtures_allowed()) {
        $source = 'TEST_ONLY_FIXTURE';
        $rates  = TEST_ONLY_DELIVERY_RATES;
    } else {
        return DeliveryQuote::unavailable();
    }

    $general = 0;
    $used = [];
    $minor = 0;
    $unrated = [];
    foreach ($byClass as $class => $items) {
        $found = delivery_rate_for($rates, $countryCode, $items, $class);
        if ($found !== null) {
            $used[] = $found['rate'];
            $minor += $found['minor'];
        } elseif (delivery_class_profile($class)['general_rate']) {
            $general += $items;
        } else {
            array_push($unrated, ...$namesByClass[$class]);
        }
    }
    if ($general > 0) {
        $found = delivery_rate_for($rates, $countryCode, $general);
        if ($found === null) {
            return DeliveryQuote::unavailable();
        }
        array_unshift($used, $found['rate']);
        $minor += $found['minor'];
    }
    if ($unrated !== []) {
        return DeliveryQuote::unavailable('NO_DELIVERY_RATE', array_values(array_unique($unrated)));
    }

    $ids    = implode('+', array_map(static fn (array $r): string => (string) $r['id'], $used));
    $labels = implode(' + ', array_map(static fn (array $r): string => (string) $r['label'], $used));
    return DeliveryQuote::quoted(
        $minor,
        $source,
        mb_substr($ids, 0, 64),
        mb_substr($labels, 0, 120)
    );
}

/**
 * Whether a paid order holds an item whose availability, destination and
 * actual delivery cost staff must confirm before it is fulfilment-ready.
 */
function order_requires_fulfilment_review(PDO $pdo, int $orderId): bool
{
    $stmt = $pdo->prepare("SELECT DISTINCT item_id FROM order_items WHERE order_id = :id AND fulfilment = 'PHYSICAL'");
    $stmt->execute([':id' => $orderId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $sku) {
        $class = catalogue_sku((string) $sku)['delivery_class'] ?? null;
        if (delivery_class_profile(is_string($class) ? $class : null)['confirm_availability']) {
            return true;
        }
    }
    return false;
}
