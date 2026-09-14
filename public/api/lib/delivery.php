<?php
/**
 * MCB — delivery, quoted by the server.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO DELIVERY PRICE HAS BEEN AUTHORISED
 * ─────────────────────────────────────────────────────────────────────────
 * MCB does not yet have an approved shipping-rate matrix (destination,
 * product, quantity, supplier routing, service level). So this file ships
 * with NO production rates, and invents none. A physical order is quoted
 * UNAVAILABLE and cannot be paid online until a real rate table exists.
 * Delivery is never assumed to be free.
 *
 * Three outcomes:
 *   NOT_REQUIRED  nothing to post (a Moment)                       £0
 *   QUOTED        a rate applies to this destination               from a rate
 *   UNAVAILABLE   physical, and no authorised rate for it          refuse checkout
 *
 * WHERE A RATE CAN COME FROM
 *   RATE_TABLE          api/data/delivery-rates.json — the production source
 *                       once MCB supplies it. Not present in this repository.
 *   TEST_ONLY_FIXTURE   the constants below, for Stripe TEST-mode rehearsal
 *                       only. Used only when BOTH the configured Stripe key is
 *                       a test key AND `delivery.use_test_fixtures` is true.
 *                       A live key refuses them even with the flag set. Their
 *                       labels say TEST ONLY, and orders record the source, so
 *                       checkout can refuse a fixture-quoted order in live mode.
 *
 * A rate table has the same shape as the fixtures: a list of rates, each with
 * an id, a label, the ISO countries it covers ('*' for everywhere else), the
 * charge for the first physical item and for each additional one, in pence.
 * Supplier routing and service levels are for the real table to add; nothing
 * here guesses at them.
 */

declare(strict_types=1);

/**
 * TEST ONLY. Deliberately unlike any real price, clearly labelled, and
 * unreachable with a live Stripe key.
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
];

final class DeliveryQuote
{
    private function __construct(
        public readonly string $status,
        public readonly int $minor,
        public readonly ?string $source,
        public readonly ?string $rateId,
        public readonly ?string $label
    ) {
    }

    public static function notRequired(): self
    {
        return new self('NOT_REQUIRED', 0, null, null, null);
    }

    public static function unavailable(): self
    {
        return new self('UNAVAILABLE', 0, null, null, null);
    }

    public static function quoted(int $minor, string $source, string $rateId, string $label): self
    {
        return new self('QUOTED', $minor, $source, $rateId, $label);
    }

    public function isTestOnly(): bool
    {
        return $this->source === 'TEST_ONLY_FIXTURE';
    }

    /** What the browser may be told. No rate table internals. */
    public function publicView(): array
    {
        return [
            'status'    => $this->status,
            'minor'     => $this->minor,
            'label'     => $this->label,
            'test_only' => $this->isTestOnly(),
        ];
    }
}

/** The production rate table, when MCB has supplied one. Null today. */
function delivery_rate_table(): ?array
{
    $path = __DIR__ . '/../data/delivery-rates.json';
    if (!is_readable($path)) {
        return null;
    }
    $json = json_decode((string) file_get_contents($path), true);
    if (!is_array($json) || ($json['currency'] ?? null) !== 'GBP' || !is_array($json['rates'] ?? null)) {
        // A present but unreadable table refuses delivery rather than guessing.
        error_log('MCB delivery: data/delivery-rates.json is present but invalid; no rates offered.');
        return [];
    }
    return $json['rates'];
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

/** Evaluates one rate list for a destination and a number of physical items. */
function delivery_rate_for(array $rates, string $countryCode, int $items): ?array
{
    $fallback = null;
    foreach ($rates as $rate) {
        if (!is_array($rate) || !is_int($rate['first_item_minor'] ?? null) || !is_int($rate['additional_item_minor'] ?? null)
            || $rate['first_item_minor'] < 0 || $rate['additional_item_minor'] < 0) {
            continue;
        }
        $countries = $rate['countries'] ?? null;
        if (is_array($countries) && in_array($countryCode, $countries, true)) {
            return ['rate' => $rate, 'minor' => $rate['first_item_minor'] + max(0, $items - 1) * $rate['additional_item_minor']];
        }
        if ($countries === '*' && $fallback === null) {
            $fallback = ['rate' => $rate, 'minor' => $rate['first_item_minor'] + max(0, $items - 1) * $rate['additional_item_minor']];
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
    if ($countryCode === null) {
        return DeliveryQuote::unavailable();
    }

    $items = 0;
    foreach ($pricing->lines as $line) {
        if ($line['fulfilment'] === 'PHYSICAL') {
            $items += $line['quantity'];
        }
    }

    $table = delivery_rate_table();
    if ($table !== null) {
        $found = delivery_rate_for($table, $countryCode, $items);
        return $found === null
            ? DeliveryQuote::unavailable()
            : DeliveryQuote::quoted($found['minor'], 'RATE_TABLE', (string) $found['rate']['id'], (string) $found['rate']['label']);
    }

    if (delivery_test_fixtures_allowed()) {
        $found = delivery_rate_for(TEST_ONLY_DELIVERY_RATES, $countryCode, $items);
        if ($found !== null) {
            return DeliveryQuote::quoted($found['minor'], 'TEST_ONLY_FIXTURE', (string) $found['rate']['id'], (string) $found['rate']['label']);
        }
    }

    return DeliveryQuote::unavailable();
}
