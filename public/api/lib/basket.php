<?php
/**
 * MCB — basket pricing. The server's answer to "what does this cost?"
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE INVARIANT
 * ─────────────────────────────────────────────────────────────────────────
 * The browser chooses WHAT the customer wants. This file decides what that
 * costs. Those two responsibilities never swap.
 *
 * Every function below takes identifiers and integer quantities and returns
 * amounts read from `api/data/catalogue.json` and `api/data/packages.json`,
 * both GENERATED from the TypeScript commercial sources at build time. There
 * is no parameter anywhere in this file through which a caller can supply a
 * price, a total or a currency, so no request can carry one — a body holding
 * `price`, `unit_amount`, `total` or `currency` is simply never read.
 *
 * A price can therefore only change by editing `src/data/packages.ts` or the
 * catalogue and rebuilding.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY MINOR UNITS EVERYWHERE
 * ─────────────────────────────────────────────────────────────────────────
 * Totals are summed in integer pence and only ever converted to pounds for
 * display or storage. £79 + £200 + £50 + (2 × £60) is exact arithmetic in
 * pence and a rounding argument in floats, and the number this produces is
 * the number Stripe charges and the number the webhook reconciles against.
 */

declare(strict_types=1);

/** Every chargeable line MCB can put in a basket, generated from source. */
function catalogue_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }

    $path = __DIR__ . '/../data/catalogue.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $json = $raw === false ? null : json_decode($raw, true);

    if (!is_array($json) || !isset($json['items']) || !is_array($json['items'])) {
        error_log('MCB checkout: api/data/catalogue.json missing or unreadable.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    $data = $json;
    return $data;
}

/**
 * One chargeable item, or null.
 *
 * Null for an id that does not exist AND for one whose price is not
 * approved — the generator omits unpriced products entirely, so both cases
 * arrive here identically and must be refused identically.
 */
function catalogue_item(string $id): ?array
{
    return catalogue_data()['items'][$id] ?? null;
}

/**
 * The result of pricing a basket.
 *
 * Either a priced basket or a refusal with a reason. Deliberately not an
 * exception: a bad basket is an ordinary customer-facing outcome, and the
 * caller needs the reason to map it to a stable error code.
 */
final class BasketResult
{
    /** @param array<int,array{id:string,name:string,quantity:int,unit_minor:int,line_minor:int}> $lines */
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
}

/**
 * Converts an approved pound figure to integer pence.
 *
 * Rounded once, here, so every downstream comparison is between integers
 * that were produced the same way.
 */
function gbp_to_minor(float $pounds): int
{
    return (int) round($pounds * 100);
}

/**
 * Prices a package plus any additional lines.
 *
 * WHAT IT VALIDATES, IN ORDER, REFUSING AT THE FIRST FAILURE:
 *   - the package exists and is one MCB sells
 *   - the requested format belongs to that package
 *   - the package has a positive approved price
 *   - every additional id exists in the generated catalogue
 *   - no id appears twice (which would otherwise silently double a line)
 *   - every quantity is a positive integer within that item's approved max
 *   - every item is eligible for this package, where the business restricted it
 *
 * @param array<int,array{id:mixed,quantity:mixed}> $requestedItems
 */
function price_basket(string $packageId, ?string $format, array $requestedItems): BasketResult
{
    // ---- The package -------------------------------------------------
    $def = package_def($packageId);
    if ($def === null) {
        return BasketResult::refused('invalid_package', 'That experience is not available.');
    }
    if (!package_allows_format($packageId, $format)) {
        return BasketResult::refused('invalid_format', 'That format is not available for this experience.');
    }

    $packageMinor = gbp_to_minor(package_price($packageId)['gbp']);
    if ($packageMinor <= 0) {
        error_log("MCB checkout: no positive price for package '{$packageId}'.");
        return BasketResult::refused('unpriced_package', 'That experience cannot be purchased online.');
    }

    $name = 'MCB ' . (string) ($def['name'] ?? ucfirst($packageId));
    if ($format !== null && $format !== '') {
        $name .= ' — ' . strtoupper($format);
    }

    $lines = [[
        'id'         => $packageId,
        'name'       => $name,
        'quantity'   => 1,
        'unit_minor' => $packageMinor,
        'line_minor' => $packageMinor,
    ]];
    $totalMinor = $packageMinor;

    // ---- Additional lines --------------------------------------------
    $seen = [];

    foreach ($requestedItems as $entry) {
        if (!is_array($entry)) {
            return BasketResult::refused('invalid_item', 'That basket could not be read.');
        }

        $id = $entry['id'] ?? null;
        if (!is_string($id) || $id === '') {
            return BasketResult::refused('invalid_item', 'That basket could not be read.');
        }

        if (isset($seen[$id])) {
            // Two entries for one id would total correctly but present as two
            // identical Stripe lines, and would let a max-quantity ceiling be
            // stepped around by repeating the item.
            return BasketResult::refused('duplicate_item', 'That item appears more than once.');
        }
        $seen[$id] = true;

        $item = catalogue_item($id);
        if ($item === null) {
            // Unknown id, or one the business has not priced. Both are refusals.
            return BasketResult::refused('unknown_item', 'One of those items is not available.');
        }

        // Quantity: a genuine integer only. "2", 2.0 and true are all rejected
        // rather than coerced, because a basket is not a place to guess.
        $quantityRaw = $entry['quantity'] ?? 1;
        if (!is_int($quantityRaw)) {
            return BasketResult::refused('invalid_quantity', 'That quantity is not valid.');
        }
        $max = (int) ($item['max_quantity'] ?? 1);
        if ($quantityRaw < 1 || $quantityRaw > $max) {
            return BasketResult::refused('invalid_quantity', 'That quantity is not available.');
        }

        // Eligibility. `null` means the business stated no restriction; an
        // explicit list means exactly that list.
        $eligible = $item['eligible_packages'] ?? null;
        if (is_array($eligible) && !in_array($packageId, $eligible, true)) {
            return BasketResult::refused('ineligible_item', 'That item cannot be added to this experience.');
        }

        $unitMinor = gbp_to_minor((float) ($item['price_gbp'] ?? 0));
        if ($unitMinor <= 0) {
            error_log("MCB checkout: catalogue item '{$id}' has no positive price.");
            return BasketResult::refused('unknown_item', 'One of those items is not available.');
        }

        $lineMinor = $unitMinor * $quantityRaw;

        $lines[] = [
            'id'         => $id,
            'name'       => (string) $item['name'],
            'quantity'   => $quantityRaw,
            'unit_minor' => $unitMinor,
            'line_minor' => $lineMinor,
        ];
        $totalMinor += $lineMinor;
    }

    return BasketResult::priced($lines, $totalMinor);
}

/**
 * A stable fingerprint of a priced basket.
 *
 * Two identical checkout attempts produce the same hash, which is what makes
 * session creation idempotent — see `checkout/session.php`. It covers the
 * AMOUNTS as well as the ids, so a basket priced before a catalogue change
 * and the same basket priced after it are correctly treated as different
 * checkouts rather than silently sharing a session.
 *
 * Lines are hashed in their canonical order, which `price_basket` fixes: the
 * package first, then items in the order requested. Reordering the request
 * therefore yields a different hash — which is safe (a new session) rather
 * than wrong (a shared one).
 */
function basket_fingerprint(int $orderId, string $packageId, ?string $format, array $lines): string
{
    $canonical = [
        'order'   => $orderId,
        'package' => $packageId,
        'format'  => (string) $format,
        'lines'   => array_map(
            static fn (array $l): array => [
                $l['id'], $l['quantity'], $l['unit_minor'],
            ],
            $lines
        ),
    ];

    return hash('sha256', json_encode($canonical, JSON_UNESCAPED_SLASHES));
}
