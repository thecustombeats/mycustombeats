<?php
/**
 * MCB CRM — package and format rules.
 *
 * Reads api/data/packages.json, which is GENERATED from src/data/packages.ts
 * by scripts/generate-packages-json.mjs during the build. There is one
 * authoritative definition of prices, formats and fulfilment; this file is a
 * reader, never a second copy.
 *
 * If the generated file is missing, every write endpoint fails closed. A
 * server that cannot state the rules must not accept orders against them.
 */

declare(strict_types=1);

function packages_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }

    $path = __DIR__ . '/../data/packages.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $json = $raw === false ? null : json_decode($raw, true);

    if (!is_array($json) || empty($json['packages'])) {
        error_log('MCB CRM: api/data/packages.json missing or unreadable.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    $data = $json;
    return $data;
}

/** @return string[] every valid package id */
function valid_package_ids(): array
{
    return array_keys(packages_data()['packages']);
}

function package_def(string $id): ?array
{
    return packages_data()['packages'][$id] ?? null;
}

/** True when this package sells this format. */
function package_allows_format(string $packageId, ?string $format): bool
{
    $pkg = package_def($packageId);
    if ($pkg === null) {
        return false;
    }
    // Packages with no selectable format (Bespoke) accept only "no format".
    if ($pkg['formats'] === []) {
        return $format === null || $format === '';
    }
    return $format !== null && in_array($format, $pkg['formats'], true);
}

/**
 * Server-derived fulfilment type. The browser never supplies this.
 *
 * Returns DIGITAL or PHYSICAL, or null if the combination is not sold —
 * which callers must treat as a rejection, not a default.
 */
function derive_fulfilment_type(string $packageId, ?string $format): ?string
{
    $pkg = package_def($packageId);
    if ($pkg === null) {
        return null;
    }
    if ($pkg['formats'] === []) {
        return $pkg['default_fulfilment'] ?? 'DIGITAL';
    }
    if ($format === null || !isset($pkg['fulfilment'][$format])) {
        return null;
    }
    return $pkg['fulfilment'][$format];
}

/** Authoritative prices, so a browser cannot understate what was ordered. */
function package_price(string $packageId): array
{
    $pkg = package_def($packageId);
    return [
        'gbp' => (float) ($pkg['price_gbp'] ?? 0),
        'usd' => (float) ($pkg['price_usd'] ?? 0),
    ];
}
