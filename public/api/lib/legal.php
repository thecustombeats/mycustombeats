<?php
/**
 * MCB — the legal rules the server must enforce itself.
 *
 * Reads api/data/legal.json, GENERATED from src/data/legal/ at build time.
 * One authoritative definition of the document versions and the consent
 * rules; this file is a reader, never a second copy.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE SERVER HAS TO DECIDE THIS
 * ─────────────────────────────────────────────────────────────────────────
 * The browser knows which boxes it displayed. That is not the same as knowing
 * which consents the order required, and a request that never went near the
 * form can claim anything at all. Before this, `POST /api/order` accepted an
 * order that asserted no consent whatsoever — the consent boolean went only
 * to the fulfilment webhook, so MCB's own database held no evidence anyone
 * had agreed to anything.
 *
 * So the server derives the required set from the order it is actually being
 * asked to create, and refuses the order if any of them is missing. A crafted
 * request cannot opt out by omitting a field.
 */

declare(strict_types=1);

function legal_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }

    $path = __DIR__ . '/../data/legal.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $json = $raw === false ? null : json_decode($raw, true);

    if (!is_array($json) || empty($json['versions']) || empty($json['consents'])) {
        // Fails CLOSED. A server that cannot state which terms are in force
        // must not record a customer as having accepted them.
        error_log('MCB legal: api/data/legal.json missing or unreadable.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    $data = $json;
    return $data;
}

/** The document versions currently in force. */
function legal_versions(): array
{
    return legal_data()['versions'];
}

/**
 * Whether a claimed terms version is one MCB actually published.
 *
 * A version this build does not recognise is refused rather than stored.
 * Recording an order against "2019-01-01" because a request said so would
 * put a fabricated contractual reference into the evidence trail — worse
 * than no version, because it looks like one.
 */
function legal_version_is_known(string $version): bool
{
    $known = legal_versions()['known_terms_versions'] ?? [];
    return is_array($known) && in_array($version, $known, true);
}

/**
 * Which consents THIS order requires.
 *
 * Derived from the order's own shape, using the same rule as
 * `requiredConsents` in src/data/legal/consent.ts — the applies_to field is
 * compiled from that file rather than restated here.
 *
 * @return string[] consent ids
 */
function required_consents(bool $hasDigitalDelivery): array
{
    $required = [];

    foreach (legal_data()['consents'] as $id => $rule) {
        $appliesTo = $rule['applies_to'] ?? 'ALWAYS';
        if ($appliesTo === 'ALWAYS'
            || ($appliesTo === 'DIGITAL_DELIVERY' && $hasDigitalDelivery)) {
            $required[] = (string) $id;
        }
    }

    return $required;
}

/**
 * Whether this package/format combination delivers digitally.
 *
 * SERVER-DERIVED from the generated fulfilment data, never taken from the
 * request. If the browser could declare this it could declare `false` for an
 * MP3 order and skip the digital-content acknowledgement entirely — which is
 * the one consent whose absence has a direct legal consequence.
 */
function order_has_digital_delivery(string $packageId, ?string $format): bool
{
    return derive_fulfilment_type($packageId, $format) === 'DIGITAL';
}

/** The stage a newly created order's production record starts in. */
function initial_production_stage(): string
{
    return (string) (legal_data()['production']['initial_stage'] ?? 'CREATIVE');
}

/**
 * Whether revision entitlement is still open at a given stage.
 *
 * Read from the generated stage table so PHP never reimplements the rule.
 * Note what is NOT consulted here: `orders.status`. PAID IS NOT
 * PRODUCTION_LOCKED, and a customer whose card cleared five minutes ago still
 * has every refinement their package includes.
 */
function revisions_remain_open(string $stage): bool
{
    foreach (legal_data()['production']['stages'] ?? [] as $definition) {
        if (($definition['stage'] ?? null) === $stage) {
            return (bool) ($definition['revisions_open'] ?? false);
        }
    }
    return false;
}

/** Channels an approval may legitimately have arrived through. */
function approval_channels(): array
{
    return legal_data()['production']['approval_channels'] ?? [];
}
