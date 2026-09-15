<?php
/**
 * MCB — the server's reader of the canonical catalogue, and order pricing.
 *
 * Reads api/data/catalogue.json, GENERATED from src/data/catalogue/ by
 * scripts/generate-catalogue-json.mjs. There is no second price table: every
 * amount below comes from that file, in integer pence.
 *
 * THE INVARIANT. The browser chooses WHAT — SKUs and integer quantities. This
 * file decides what that costs. No function here accepts a price, a total or
 * a currency, so no request field can supply one.
 *
 * Fails closed: a missing, unreadable or wrong-version file refuses service.
 */

declare(strict_types=1);

const CATALOGUE_SCHEMA_VERSION = 2;

function catalogue_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }

    $path = __DIR__ . '/../data/catalogue.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $json = $raw === false ? null : json_decode($raw, true);

    if (!is_array($json)
        || ($json['schema_version'] ?? null) !== CATALOGUE_SCHEMA_VERSION
        || ($json['currency'] ?? null) !== 'GBP'
        || !isset($json['skus'], $json['products'], $json['rules'])
        || !is_array($json['skus'])) {
        error_log('MCB: api/data/catalogue.json missing, unreadable or the wrong version.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    $data = $json;
    return $data;
}

function catalogue_sku(string $sku): ?array
{
    return catalogue_data()['skus'][$sku] ?? null;
}

function catalogue_product(string $productId): ?array
{
    return catalogue_data()['products'][$productId] ?? null;
}

/**
 * The result of pricing an order's lines.
 *
 * `lines` are in request order, each:
 *   sku, product_id, name, category, fulfilment, delivery_class, quantity, unit_minor, line_minor
 */
final class OrderPricing
{
    private function __construct(
        public readonly bool $ok,
        public readonly array $lines,
        public readonly int $totalMinor,
        public readonly ?string $errorCode,
        public readonly ?string $errorMessage
    ) {
    }

    public static function priced(array $lines, int $totalMinor): self
    {
        return new self(true, $lines, $totalMinor, null, null);
    }

    public static function refused(string $code, string $message): self
    {
        return new self(false, [], 0, $code, $message);
    }

    /** PHYSICAL when anything must be posted, otherwise DIGITAL. */
    public function fulfilmentType(): string
    {
        foreach ($this->lines as $line) {
            if ($line['fulfilment'] === 'PHYSICAL') {
                return 'PHYSICAL';
            }
        }
        return 'DIGITAL';
    }

    public function hasDigitalDelivery(): bool
    {
        foreach ($this->lines as $line) {
            if ($line['fulfilment'] === 'DIGITAL') {
                return true;
            }
        }
        return false;
    }

    /** The product id of the first song experience, for CRM filtering. */
    public function primaryProductId(): string
    {
        $primary = (string) catalogue_data()['rules']['primary_category'];
        foreach ($this->lines as $line) {
            if ($line['category'] === $primary) {
                return $line['product_id'];
            }
        }
        return $this->lines[0]['product_id'] ?? '';
    }
}

/**
 * Prices requested order lines from the catalogue.
 *
 * Refuses, at the first failure: an empty or oversized request; a malformed
 * line; a duplicate SKU; a SKU that is unknown, inactive or not sold online;
 * a quantity that is not a genuine integer within the technical limit; an
 * order with no song experience; and Priority Replacement beyond the number
 * of eligible Keepsakes in the order.
 *
 * @param mixed $requested the raw `lines` value from the request body
 */
function price_order_lines(mixed $requested): OrderPricing
{
    $rules = catalogue_data()['rules'];

    if (!is_array($requested) || $requested === [] || !array_is_list($requested)) {
        return OrderPricing::refused('invalid_lines', 'Please choose what you would like to order.');
    }
    if (count($requested) > (int) $rules['max_lines']) {
        return OrderPricing::refused('too_many_lines', 'That order has too many lines.');
    }

    $lines = [];
    $seen = [];
    $total = 0;
    $eligibleUnits = 0;
    $priorityUnits = 0;
    $hasPrimary = false;

    foreach ($requested as $entry) {
        if (!is_array($entry) || !is_string($entry['sku'] ?? null) || $entry['sku'] === '') {
            return OrderPricing::refused('invalid_lines', 'That order could not be read.');
        }
        $sku = $entry['sku'];

        if (isset($seen[$sku])) {
            return OrderPricing::refused('duplicate_sku', 'That item appears more than once.');
        }
        $seen[$sku] = true;

        $item = catalogue_sku($sku);
        if ($item === null || ($item['orderable'] ?? false) !== true) {
            return OrderPricing::refused('unknown_sku', 'One of those items is not available to order online.');
        }

        // A genuine integer only: "2", 2.0 and true are refused, not coerced.
        $quantity = $entry['quantity'] ?? null;
        if (!is_int($quantity) || $quantity < 1 || $quantity > (int) $rules['max_quantity_per_line']) {
            return OrderPricing::refused('invalid_quantity', 'That quantity is not valid.');
        }

        $unit = $item['price_minor'] ?? null;
        if (!is_int($unit) || $unit <= 0 || ($item['currency'] ?? null) !== 'GBP') {
            error_log("MCB: catalogue SKU '{$sku}' has no valid GBP price.");
            return OrderPricing::refused('unknown_sku', 'One of those items is not available to order online.');
        }

        if ($item['category'] === $rules['primary_category']) {
            $hasPrimary = true;
        }
        if (($item['priority_replacement_eligible'] ?? false) === true) {
            $eligibleUnits += $quantity;
        }
        if ($sku === $rules['priority_replacement_sku']) {
            $priorityUnits += $quantity;
        }

        $line = $unit * $quantity;
        $total += $line;
        $lines[] = [
            'sku'        => $sku,
            'product_id' => (string) $item['product_id'],
            'name'       => (string) $item['name'],
            'category'   => (string) $item['category'],
            'fulfilment' => (string) $item['fulfilment'],
            'delivery_class' => isset($item['delivery_class']) ? (string) $item['delivery_class'] : null,
            'quantity'   => $quantity,
            'unit_minor' => $unit,
            'line_minor' => $line,
        ];
    }

    if (!$hasPrimary) {
        return OrderPricing::refused('no_song_experience', 'Please choose a Moment, Keepsake or Journey.');
    }
    // The Artwork Preparation Service: once per order, and only where MCB
    // creates artwork from a photograph (Keepsake, Journey).
    $artworkSku = $rules['artwork_preparation_sku'] ?? null;
    foreach ($lines as $l) {
        if ($l['sku'] === $artworkSku
            && ($l['quantity'] !== 1 || array_intersect(array_column($lines, 'product_id'), $rules['photo_artwork_product_ids'] ?? []) === [])) {
            return OrderPricing::refused('artwork_preparation_ineligible', 'MCB Artwork Preparation can be added once to a Keepsake or Journey order.');
        }
    }
    if ($priorityUnits > $eligibleUnits) {
        return OrderPricing::refused(
            'priority_replacement_ineligible',
            'MCB Priority Replacement can be added once for each eligible Keepsake in your order.'
        );
    }

    return OrderPricing::priced($lines, $total);
}

/** Integer pence as a DECIMAL(10,2) string. Exact; never float-derived. */
function minor_to_decimal(int $minor): string
{
    $sign = $minor < 0 ? '-' : '';
    $minor = abs($minor);
    return $sign . intdiv($minor, 100) . '.' . str_pad((string) ($minor % 100), 2, '0', STR_PAD_LEFT);
}

/** A DECIMAL string such as "149.99" as integer pence, or null if malformed. */
function decimal_to_minor(mixed $decimal): ?int
{
    if (is_int($decimal)) {
        return $decimal * 100;
    }
    if (!is_string($decimal) || !preg_match('/^(\d{1,8})(?:\.(\d{1,2}))?$/', $decimal, $m)) {
        return null;
    }
    return (int) $m[1] * 100 + (int) str_pad($m[2] ?? '0', 2, '0');
}

/** "£149.99", "£15". */
function format_minor_gbp(int $minor): string
{
    $pounds = number_format(intdiv($minor, 100));
    $pence  = $minor % 100;
    return $pence === 0 ? "£{$pounds}" : '£' . $pounds . '.' . str_pad((string) $pence, 2, '0', STR_PAD_LEFT);
}
