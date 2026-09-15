<?php
/**
 * MCB Creative Factory — the music-generation provider boundary.
 *
 * PROVIDER DECISION: DEFERRED. No provider is selected, connected, keyed or
 * paid. This file defines the contract a future adapter implements and the
 * one adapter that exists: MANUAL (a person registers audio made elsewhere).
 *
 * The business representation is MCB's own (Fact Ledger, lyric package,
 * Music Direction, composition plan). An adapter translates MCB's sanitised
 * request into its provider's format at the edge and normalises what comes
 * back; no provider format is stored as MCB's canonical document.
 */

declare(strict_types=1);

interface MusicProviderAdapter
{
    /** Provider id in the capability registry. */
    public function id(): string;

    /** Build the provider request from MCB's sanitised payload. */
    public function prepare(array $payload): array;

    /** Whether the provider can do what the request needs (duration, lyrics, format…). Unknown is not yes. */
    public function validateCapability(array $prepared): array;

    /** Start generation. Returns ['status' => …, 'generation_id' => ?string]. */
    public function generate(array $prepared): array;

    public function status(string $generationId): array;

    /** Fetch finished audio to a local private path. */
    public function retrieve(string $generationId): array;

    /** Provider metadata → MCB fields (duration, format, sample rate, model, cost). */
    public function normaliseMetadata(array $raw): array;

    /** Register retrieved audio as a candidate for an attempt (MCB does the QC). */
    public function registerCandidate(array $attempt, array $retrieved): array;

    /** Provider error → MCB outcome (PROVIDER_FAIL with a machine reason). */
    public function handleError(array $error): array;
}

/**
 * MANUAL: audio generated outside MCB's systems (for testing the factory now,
 * or by hand) is uploaded by staff. It never calls anything.
 */
final class ManualProviderAdapter implements MusicProviderAdapter
{
    public function id(): string { return 'manual'; }
    public function prepare(array $payload): array { return ['provider' => 'manual', 'payload' => $payload]; }
    public function validateCapability(array $prepared): array { return ['status' => 'NOT_APPLICABLE', 'unknown' => []]; }
    public function generate(array $prepared): array { return ['status' => 'AWAITING_MANUAL_UPLOAD', 'generation_id' => null]; }
    public function status(string $generationId): array { return ['status' => 'AWAITING_MANUAL_UPLOAD']; }
    public function retrieve(string $generationId): array { return ['status' => 'NOT_APPLICABLE']; }
    public function normaliseMetadata(array $raw): array
    {
        return [
            'provider_model' => isset($raw['provider_model']) && is_string($raw['provider_model']) ? mb_substr($raw['provider_model'], 0, 80) : null,
            'provider_generation_id' => isset($raw['provider_generation_id']) && is_string($raw['provider_generation_id']) ? mb_substr($raw['provider_generation_id'], 0, 120) : null,
            'cost_actual_minor' => null,
        ];
    }
    public function registerCandidate(array $attempt, array $retrieved): array { return ['status' => 'REGISTERED_BY_STAFF']; }
    public function handleError(array $error): array
    {
        $reason = is_string($error['reason'] ?? null) && preg_match('/^[A-Z0-9_]{3,60}$/', $error['reason']) === 1 ? $error['reason'] : 'PROVIDER_ERROR';
        return ['outcome' => 'PROVIDER_FAIL', 'reason' => $reason];
    }
}

/** The capability registry (generated). Unknown stays UNKNOWN. */
function creative_provider_registry(): array
{
    return [
        'decision' => creative_data()['provider_decision_status'],
        'providers' => creative_data()['providers'],
    ];
}

/**
 * Where generation goes now. While the decision is DEFERRED there is no
 * PRIMARY or FALLBACK, whatever the server config says: the job waits for a
 * provider, and staff may generate manually.
 */
function creative_generation_route(): array
{
    $decision = creative_data()['provider_decision_status'];
    $configuredPrimary = mcb_setting('creative.providers.primary', null);
    return [
        'decision' => $decision,
        'primary' => null,
        'fallback' => null,
        'manual' => 'manual',
        'route' => 'AWAITING_PROVIDER',
        'actions' => ['MANUAL_GENERATION'],
        'ignored_configuration' => $decision === 'DEFERRED' && $configuredPrimary !== null,
    ];
}

/** Adapters that exist. Only MANUAL. */
function creative_provider_adapter(string $providerId): ?MusicProviderAdapter
{
    return $providerId === 'manual' ? new ManualProviderAdapter() : null;
}

/**
 * The SMALLEST payload a future provider may receive: the words to sing, the
 * musical direction and the timing. No order reference, customer name,
 * contact, story, Fact Ledger, photographs, notes, prices or ids beyond an
 * opaque request id.
 */
function creative_provider_payload(int $jobId, int $attemptNumber, array $plan, array $lyrics, array $direction): array
{
    $secret = (string) mcb_setting('token_secret', 'mcb');
    return [
        'request_id' => substr(hash_hmac('sha256', "creative-request|{$jobId}|{$attemptNumber}", $secret), 0, 32),
        'duration' => ['target_seconds' => (int) $plan['target_duration_seconds'], 'max_seconds' => (int) $plan['max_duration_seconds']],
        'music' => array_intersect_key($direction, array_flip(creative_data()['music_direction_fields'])),
        'sections' => array_map(static function (array $s) use ($lyrics): array {
            $lyric = $s['lyric_section_index'] !== null ? ($lyrics['sections'][$s['lyric_section_index'] - 1] ?? []) : [];
            return [
                'type' => $s['type'],
                'seconds' => $s['target_seconds'],
                'lyrics' => (string) ($lyric['text'] ?? ''),
                'positive' => $s['positive_directions'] ?? [],
                'negative' => $s['negative_directions'] ?? [],
                'instrumentation' => $s['instrumentation'] ?? [],
            ];
        }, $plan['sections']),
        'title' => (string) ($lyrics['title'] ?? ''),
    ];
}
