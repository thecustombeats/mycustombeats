<?php
/**
 * MCB Creative Factory — orchestration.
 *
 * ORDER.READY_FOR_PROCESSING → CREATIVE JOB (one per song) → MEMORY INGESTION
 * → FACT LEDGER → (album map, for several songs) → STORY MAP → LYRIC PACKAGE
 * → LYRIC FACT QC → MUSIC DIRECTION → MCB COMPOSITION PLAN → GENERATION
 * REQUIRED → provider adapter (DEFERRED: awaiting provider / manual) →
 * CANDIDATE → TECHNICAL QC → FACT/CONTENT QC → CREATIVE QC → MCB MASTER →
 * ALBUM QC → PHYSICAL CAPACITY QC → ready for MCB's existing quality check.
 *
 * Automation goes as far as it safely can on its own (jobs, ledger, album and
 * story skeletons, Music Direction from the customer's style, the plan from
 * lyrics, every objective check) and stops, visibly, where a person or a
 * future provider is needed. No customer approval exists anywhere here.
 *
 * Every document is an immutable version; every attempt is a row that is
 * never overwritten; every event is deduplicated; private creative material
 * is served only to staff and every read is logged.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/founder-notifications.php';
require_once __DIR__ . '/creative-qc.php';
require_once __DIR__ . '/creative-providers.php';

/* ------------------------------------------------------------------ */
/* Intake — only what creating the work needs                          */
/* ------------------------------------------------------------------ */

/**
 * The creative intake for an order. Selected column by column: no email,
 * phone, address, payment or Stripe identifier, amount, supplier cost or
 * margin can reach the factory.
 */
function creative_intake(PDO $pdo, int $orderId): ?array
{
    $o = $pdo->prepare(
        'SELECT id, status, mcb_reference, fulfilment_type, brief_mood, brief_genre, brief_personal_touches, brief_cruise_companions
           FROM orders WHERE id = :id'
    );
    $o->execute([':id' => $orderId]);
    $order = $o->fetch();
    if ($order === false) {
        return null;
    }
    $u = $pdo->prepare(
        "SELECT id, sku, product_id, unit_index, song_count, picture_disc, size_inches, shape, disc_count, gatefold
           FROM order_units WHERE order_id = :id AND kind = 'SONG' ORDER BY order_item_id, unit_index"
    );
    $u->execute([':id' => $orderId]);
    $m = $pdo->prepare('SELECT id, sequence, story, about, occasion, style_choice, style_label FROM order_memories WHERE unit_id = :u ORDER BY sequence');
    $units = [];
    foreach ($u->fetchAll() as $unit) {
        $m->execute([':u' => (int) $unit['id']]);
        $units[] = [
            'unit_id' => (int) $unit['id'], 'sku' => $unit['sku'], 'product_id' => $unit['product_id'],
            'song_count' => $unit['song_count'] === null ? null : (int) $unit['song_count'],
            'physical' => $unit['size_inches'] !== null,
            'memories' => array_map(static fn (array $r): array => [
                'memory_id' => (int) $r['id'], 'sequence' => (int) $r['sequence'], 'story' => $r['story'], 'about' => $r['about'],
                'occasion' => $r['occasion'], 'style_choice' => $r['style_choice'], 'style_label' => $r['style_label'],
            ], $m->fetchAll()),
        ];
    }
    return [
        'order' => [
            'order_id' => (int) $order['id'], 'status' => $order['status'], 'reference' => $order['mcb_reference'],
            'workflow' => $order['fulfilment_type'] === 'PHYSICAL' ? 'PHYSICAL' : 'DIGITAL',
            'brief' => array_filter([
                'mood' => $order['brief_mood'], 'genre' => $order['brief_genre'],
                'personal_touches' => $order['brief_personal_touches'], 'companions' => $order['brief_cruise_companions'],
            ], static fn ($v): bool => $v !== null && $v !== ''),
        ],
        'units' => $units,
    ];
}

/** The first Fact Ledger: exactly what the customer supplied, classified. Nothing extracted or invented. */
function creative_initial_ledger(array $order, array $unit): array
{
    $facts = [];
    foreach ($unit['memories'] as $mem) {
        $seq = $mem['sequence'];
        $src = "CUSTOMER:memory:{$seq}";
        $facts[] = ['id' => "M{$seq}-STORY", 'type' => 'MEMORY', 'value' => $mem['story'], 'classification' => 'SEMANTIC', 'importance' => 'CRITICAL', 'tracks' => [$seq], 'source' => $src, 'verification' => 'CUSTOMER_SUPPLIED', 'accepted_forms' => [], 'pronunciation' => null];
        if (($mem['about'] ?? '') !== '') {
            $facts[] = ['id' => "M{$seq}-ABOUT", 'type' => 'RELATIONSHIP', 'value' => $mem['about'], 'classification' => 'SEMANTIC', 'importance' => 'HIGH', 'tracks' => [$seq], 'source' => $src, 'verification' => 'CUSTOMER_SUPPLIED', 'accepted_forms' => [], 'pronunciation' => null];
        }
        if (($mem['occasion'] ?? '') !== '') {
            $facts[] = ['id' => "M{$seq}-OCCASION", 'type' => 'OCCASION', 'value' => $mem['occasion'], 'classification' => 'SEMANTIC', 'importance' => 'HIGH', 'tracks' => [$seq], 'source' => $src, 'verification' => 'CUSTOMER_SUPPLIED', 'accepted_forms' => [], 'pronunciation' => null];
        }
        $style = match ($mem['style_choice']) {
            'STYLE'  => ['value' => (string) $mem['style_label'], 'classification' => 'SEMANTIC', 'importance' => 'HIGH'],
            'CUSTOM' => ['value' => (string) $mem['style_label'], 'classification' => 'SEMANTIC', 'importance' => 'HIGH'],
            default  => ['value' => 'MCB_CHOICE', 'classification' => 'CREATIVE_GUIDANCE', 'importance' => 'NORMAL'],
        };
        $facts[] = ['id' => "M{$seq}-STYLE", 'type' => 'MUSIC_DIRECTION', 'tracks' => [$seq], 'source' => $src, 'verification' => 'CUSTOMER_SUPPLIED', 'accepted_forms' => [], 'pronunciation' => null] + $style;
    }
    $legacy = ['mood' => ['MOOD', 'CREATIVE_GUIDANCE'], 'genre' => ['MUSIC_DIRECTION', 'SEMANTIC'], 'personal_touches' => ['REQUESTED_PHRASE', 'SEMANTIC'], 'companions' => ['RELATIONSHIP', 'SEMANTIC']];
    foreach ($order['brief'] as $key => $value) {
        [$type, $class] = $legacy[$key];
        $facts[] = ['id' => 'O-' . strtoupper(str_replace('_', '-', $key)), 'type' => $type, 'value' => mb_substr((string) $value, 0, 1000), 'classification' => $class, 'importance' => 'HIGH', 'tracks' => 'ALL', 'source' => "CUSTOMER:brief:{$key}", 'verification' => 'CUSTOMER_SUPPLIED', 'accepted_forms' => [], 'pronunciation' => null];
    }
    return [
        'schema' => 'mcb.fact_ledger.v1',
        'sku' => $unit['sku'],
        'track_count' => count($unit['memories']),
        'facts' => $facts,
        'exclusions' => [],
        'extraction' => 'PENDING: exact names, dates and places are added as EXACT facts by a person (or a future AI extraction job) in a new version. None are inferred here.',
    ];
}

/* ------------------------------------------------------------------ */
/* Versioned documents                                                 */
/* ------------------------------------------------------------------ */

function creative_artifact(PDO $pdo, string $scope, string $kind, ?int $version = null): ?array
{
    $sql = 'SELECT version, body, body_sha256, created_by, created_at FROM creative_artifacts WHERE scope_key = :s AND kind = :k';
    $params = [':s' => $scope, ':k' => $kind];
    if ($version !== null) {
        $sql .= ' AND version = :v';
        $params[':v'] = $version;
    }
    $stmt = $pdo->prepare($sql . ' ORDER BY version DESC LIMIT 1');
    $stmt->execute($params);
    $row = $stmt->fetch();
    if ($row === false) {
        return null;
    }
    return ['version' => (int) $row['version'], 'body' => json_decode((string) $row['body'], true), 'sha256' => $row['body_sha256'], 'created_by' => $row['created_by'], 'created_at' => $row['created_at']];
}

/** Stores a NEW version. Earlier versions are never changed. */
function creative_store_artifact(PDO $pdo, int $orderId, string $scope, string $kind, array $body, string $by): int
{
    $latest = creative_artifact($pdo, $scope, $kind);
    $version = ($latest['version'] ?? 0) + 1;
    $body['version'] = $version;
    $json = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $pdo->prepare(
        'INSERT INTO creative_artifacts (order_id, scope_key, kind, version, body, body_sha256, created_by, created_at)
         VALUES (:o, :s, :k, :v, :b, :h, :by, UTC_TIMESTAMP())'
    )->execute([':o' => $orderId, ':s' => $scope, ':k' => $kind, ':v' => $version, ':b' => $json, ':h' => hash('sha256', (string) $json), ':by' => $by]);
    return $version;
}

function creative_job_row(PDO $pdo, int $jobId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT j.*, a.track_count, a.sku, a.target_programme_seconds, o.mcb_reference, o.fulfilment_type, o.status AS order_status
           FROM creative_jobs j JOIN creative_albums a ON a.id = j.album_id JOIN orders o ON o.id = j.order_id
          WHERE j.id = :id' . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([':id' => $jobId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function creative_album_row(PDO $pdo, int $albumId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare('SELECT a.*, o.mcb_reference, o.fulfilment_type FROM creative_albums a JOIN orders o ON o.id = a.order_id WHERE a.id = :id' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([':id' => $albumId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function creative_album_jobs(PDO $pdo, int $albumId): array
{
    $stmt = $pdo->prepare('SELECT * FROM creative_jobs WHERE album_id = :a ORDER BY track_number');
    $stmt->execute([':a' => $albumId]);
    return $stmt->fetchAll();
}

function creative_set_job(PDO $pdo, int $jobId, array $fields): void
{
    $sets = [];
    $params = [':id' => $jobId];
    foreach ($fields as $col => $value) {
        $sets[] = "{$col} = :{$col}";
        $params[":{$col}"] = $value;
    }
    $pdo->prepare('UPDATE creative_jobs SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Creates the order's albums and exactly one job per song, then moves each
 * job as far as automation safely can. Idempotent: a replayed payment, a
 * refreshed console or a repeated call creates nothing twice.
 *
 * @return list<array> the order's jobs
 */
function ensure_creative_jobs(PDO $pdo, int $orderId): array
{
    $intake = creative_intake($pdo, $orderId);
    if ($intake === null || $intake['order']['status'] !== 'PAID') {
        return [];
    }
    $policy = creative_data()['duration'];
    foreach ($intake['units'] as $unit) {
        if ($unit['memories'] === []) {
            continue;
        }
        $trackCount = count($unit['memories']);
        $physical = $intake['order']['workflow'] === 'PHYSICAL' && $unit['physical'];
        $pdo->prepare(
            'INSERT IGNORE INTO creative_albums (order_id, unit_id, sku, track_count, target_programme_seconds, album_qc_status, capacity_status)
             VALUES (:o, :u, :sku, :n, :t, :aq, :cq)'
        )->execute([
            ':o' => $orderId, ':u' => $unit['unit_id'], ':sku' => $unit['sku'], ':n' => $trackCount,
            ':t' => $trackCount * (int) $policy['target_seconds'],
            ':aq' => $trackCount > 1 ? 'PENDING' : 'NOT_APPLICABLE', ':cq' => $physical ? 'PENDING' : 'NOT_APPLICABLE',
        ]);
        $a = $pdo->prepare('SELECT id FROM creative_albums WHERE unit_id = :u');
        $a->execute([':u' => $unit['unit_id']]);
        $albumId = (int) $a->fetchColumn();
        $scope = "album:{$albumId}";

        // 1. Fact Ledger (album scope).
        if (creative_artifact($pdo, $scope, 'FACT_LEDGER') === null) {
            creative_store_artifact($pdo, $orderId, $scope, 'FACT_LEDGER', creative_initial_ledger($intake['order'], $unit), 'SYSTEM');
        }
        $ledger = creative_artifact($pdo, $scope, 'FACT_LEDGER');
        record_order_event($pdo, $orderId, 'CREATIVE.FACT_LEDGER_READY', ['album_id' => $albumId, 'version' => $ledger['version']], "creative-ledger:{$albumId}:{$ledger['version']}");

        // 2. For several songs, the album map comes FIRST: it allocates each memory to a track.
        if ($trackCount > 1 && creative_artifact($pdo, $scope, 'ALBUM_MAP') === null) {
            $tracks = [];
            foreach ($unit['memories'] as $i => $mem) {
                $n = $i + 1;
                $tracks[] = [
                    'track_number' => $n, 'working_title' => null, 'memory_id' => $mem['memory_id'],
                    'narrative_role' => $n === 1 ? 'OPENING' : ($n === $trackCount ? 'CLOSING' : 'CHAPTER'),
                    'allocated_fact_ids' => array_column(creative_facts_for_track($ledger['body'], $mem['sequence']), 'id'),
                    'emotional_role' => null, 'target_duration_seconds' => (int) $policy['target_seconds'], 'target_energy' => null,
                    'relationship_to_neighbours' => null, 'deliberate_variation' => null,
                ];
            }
            creative_store_artifact($pdo, $orderId, $scope, 'ALBUM_MAP', [
                'schema' => 'mcb.album_map.v1', 'status' => 'SKELETON', 'track_count' => $trackCount,
                'target_programme_seconds' => $trackCount * (int) $policy['target_seconds'],
                'fact_ledger_version' => $ledger['version'], 'tracks' => $tracks,
                'duplication_controls' => ['distinct_titles' => true, 'max_lyric_similarity' => (float) creative_data()['lyric_duplication_threshold'], 'distinct_chorus_hooks' => true],
                'authoring' => 'Narrative and emotional roles are authored by MCB (a person or a future AI job) in a new version.',
            ], 'SYSTEM');
        }

        foreach ($unit['memories'] as $mem) {
            $pdo->prepare(
                'INSERT IGNORE INTO creative_jobs (order_id, album_id, unit_id, memory_id, track_number, status, fact_ledger_version)
                 VALUES (:o, :a, :u, :m, :n, :s, :v)'
            )->execute([':o' => $orderId, ':a' => $albumId, ':u' => $unit['unit_id'], ':m' => $mem['memory_id'], ':n' => $mem['sequence'], ':s' => 'JOB_READY', ':v' => $ledger['version']]);
        }
        foreach (creative_album_jobs($pdo, $albumId) as $job) {
            creative_advance_new_job($pdo, $job, $ledger, $unit);
        }
    }
    $stmt = $pdo->prepare('SELECT * FROM creative_jobs WHERE order_id = :o ORDER BY album_id, track_number');
    $stmt->execute([':o' => $orderId]);
    return $stmt->fetchAll();
}

/** A new job: its story skeleton and Music Direction, then it waits for lyrics. */
function creative_advance_new_job(PDO $pdo, array $job, array $ledger, array $unit): void
{
    $jobId = (int) $job['id'];
    $orderId = (int) $job['order_id'];
    $scope = "job:{$jobId}";
    $track = (int) $job['track_number'];
    record_order_event($pdo, $orderId, 'CREATIVE.JOB_READY', ['job_id' => $jobId, 'track' => $track], "creative-job:{$jobId}");
    if ($job['status'] !== 'JOB_READY') {
        return;
    }
    $allocated = array_column(creative_facts_for_track($ledger['body'], $track), 'id');
    if (creative_artifact($pdo, $scope, 'STORY_MAP') === null) {
        creative_store_artifact($pdo, $orderId, $scope, 'STORY_MAP', [
            'schema' => 'mcb.story_map.v1', 'status' => 'SKELETON', 'track_number' => $track,
            'opening' => null, 'narrative_progression' => null, 'important_memories' => array_values(array_filter($allocated, static fn (string $id): bool => str_ends_with($id, '-STORY'))),
            'emotional_build' => null, 'central_statement' => null, 'climax' => null, 'resolution' => null,
            'allocated_fact_ids' => $allocated, 'intended_musical_movement' => null,
            'authoring' => 'Songs need not share one structure. Authored by MCB in a new version.',
        ], 'SYSTEM');
    }
    if (creative_artifact($pdo, $scope, 'MUSIC_DIRECTION') === null) {
        $memory = array_values(array_filter($unit['memories'], static fn (array $m): bool => $m['memory_id'] === (int) $job['memory_id']))[0] ?? null;
        creative_store_artifact($pdo, $orderId, $scope, 'MUSIC_DIRECTION', creative_initial_direction($memory), 'SYSTEM');
    }
    $story = creative_artifact($pdo, $scope, 'STORY_MAP');
    $direction = creative_artifact($pdo, $scope, 'MUSIC_DIRECTION');
    creative_set_job($pdo, $jobId, [
        'status' => 'LYRICS_REQUIRED', 'waiting_on' => 'LYRIC_AUTHOR',
        'fact_ledger_version' => $ledger['version'], 'story_map_version' => $story['version'], 'direction_version' => $direction['version'],
    ]);
    record_order_event($pdo, $orderId, 'CREATIVE.STORY_MAP_READY', ['job_id' => $jobId, 'version' => $story['version']], "creative-story:{$jobId}:{$story['version']}");
    record_order_event($pdo, $orderId, 'CREATIVE.LYRICS_REQUIRED', ['job_id' => $jobId], "creative-lyrics-required:{$jobId}:0");
}

/** Music Direction from the customer's choice: a catalogued style maps to characteristics; the rest is MCB's to decide. */
function creative_initial_direction(?array $memory): array
{
    $policy = creative_data()['duration'];
    $map = creative_data()['style_to_direction'];
    $genre = null;
    $era = null;
    $status = 'MCB_TO_DECIDE';
    if (($memory['style_choice'] ?? null) === 'STYLE' && isset($map[$memory['style_label']])) {
        $genre = $map[$memory['style_label']]['genre'];
        $era = $map[$memory['style_label']]['era'] ?? null;
        $status = 'DERIVED_FROM_CUSTOMER_STYLE';
    } elseif (($memory['style_choice'] ?? null) === 'CUSTOM') {
        $status = 'CUSTOMER_REQUEST_TO_TRANSLATE';
    }
    return [
        'schema' => 'mcb.music_direction.v1', 'status' => $status,
        'genre' => $genre, 'subgenre' => null, 'era_influence' => $era, 'bpm_min' => null, 'bpm_max' => null, 'key' => null, 'mode' => null,
        'time_signature' => $genre === 'waltz' ? '3/4' : null, 'instrumentation' => [], 'vocal_presentation' => null, 'vocal_intensity' => null,
        'mood' => null, 'energy' => null, 'production_character' => null, 'language' => 'English',
        'positive_directions' => [], 'negative_directions' => [],
        'target_duration_seconds' => (int) $policy['target_seconds'], 'max_duration_seconds' => (int) $policy['max_seconds'],
    ];
}

/* ------------------------------------------------------------------ */
/* Lyrics, plan, generation                                            */
/* ------------------------------------------------------------------ */

/** Lyric text of a package, section by section. */
function creative_lyric_text(array $lyrics): string
{
    return implode("\n", array_map(static fn (array $s): string => (string) ($s['text'] ?? ''), $lyrics['sections'] ?? []));
}

/** Everything the objective fact QC compares against, for a job. */
function creative_qc_context(PDO $pdo, array $job, array $lyrics, bool $semanticAttested): array
{
    $others = [];
    foreach (creative_album_jobs($pdo, (int) $job['album_id']) as $other) {
        if ((int) $other['id'] === (int) $job['id'] || $other['lyric_version'] === null) {
            continue;
        }
        $pkg = creative_artifact($pdo, "job:{$other['id']}", 'LYRIC_PACKAGE', (int) $other['lyric_version']);
        if ($pkg !== null) {
            $others[(int) $other['track_number']] = creative_lyric_text($pkg['body']);
        }
    }
    // Other customers' EXACT names and places (recent ledgers), for contamination.
    $foreign = [];
    $stmt = $pdo->prepare(
        "SELECT body FROM creative_artifacts
          WHERE kind = 'FACT_LEDGER' AND order_id <> :o AND created_at > UTC_TIMESTAMP() - INTERVAL 400 DAY
          ORDER BY id DESC LIMIT 500"
    );
    $stmt->execute([':o' => (int) $job['order_id']]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $body) {
        foreach (json_decode((string) $body, true)['facts'] ?? [] as $f) {
            if (($f['classification'] ?? '') === 'EXACT' && in_array($f['type'] ?? '', ['NAME', 'PLACE'], true)) {
                $foreign[] = (string) $f['value'];
            }
        }
    }
    $refs = [];
    foreach ($lyrics['sections'] ?? [] as $s) {
        $refs = array_merge($refs, $s['fact_refs'] ?? []);
    }
    $prohibited = mcb_setting('creative.prohibited_phrases', []);
    return [
        'other_texts' => $others,
        'foreign_values' => array_values(array_unique($foreign)),
        'prohibited' => array_merge(is_array($prohibited) ? $prohibited : [], $lyrics['exclusions'] ?? []),
        'fact_refs' => array_values(array_unique($refs)),
        'semantic_attested' => $semanticAttested,
    ];
}

function creative_ledger_for_job(PDO $pdo, array $job): array
{
    $ledger = creative_artifact($pdo, "album:{$job['album_id']}", 'FACT_LEDGER');
    return $ledger ?? ['version' => 0, 'body' => ['facts' => []]];
}

/** Runs lyric fact QC on the job's current package and moves the job. */
function creative_run_lyric_qc(PDO $pdo, array $job, bool $semanticAttested, string $by): array
{
    $jobId = (int) $job['id'];
    $lyrics = creative_artifact($pdo, "job:{$jobId}", 'LYRIC_PACKAGE', (int) $job['lyric_version']);
    $ledger = creative_ledger_for_job($pdo, $job);
    $qc = creative_fact_qc($ledger['body'], (int) $job['track_number'], creative_lyric_text($lyrics['body']), creative_qc_context($pdo, $job, $lyrics['body'], $semanticAttested));
    $qc['ledger_version'] = $ledger['version'];
    $qc['lyric_version'] = (int) $job['lyric_version'];
    $qc['text_source'] = 'LYRIC_PACKAGE';
    $status = match ($qc['status']) { 'FAIL' => 'LYRICS_QC_FAILED', 'REVIEW_REQUIRED' => 'LYRICS_REVIEW_REQUIRED', default => 'PLAN_REQUIRED' };
    creative_set_job($pdo, $jobId, ['lyric_qc_status' => $qc['status'], 'lyric_qc_result' => json_encode($qc, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), 'status' => $status,
        'waiting_on' => $status === 'LYRICS_REVIEW_REQUIRED' ? 'LYRIC_SEMANTIC_REVIEW' : ($status === 'LYRICS_QC_FAILED' ? 'LYRIC_AUTHOR' : null), 'fact_ledger_version' => $ledger['version']]);
    if ($qc['status'] === 'PASS') {
        record_order_event($pdo, (int) $job['order_id'], 'CREATIVE.LYRICS_READY', ['job_id' => $jobId, 'version' => (int) $job['lyric_version']], "creative-lyrics-ready:{$jobId}:{$job['lyric_version']}");
        creative_build_and_route_plan($pdo, creative_job_row($pdo, $jobId), null, $by);
    }
    return $qc;
}

/** Plan (derived or supplied) → validation → PLAN_READY → GENERATION_REQUIRED (awaiting provider). */
function creative_build_and_route_plan(PDO $pdo, array $job, ?array $supplied, string $by): array
{
    $jobId = (int) $job['id'];
    $orderId = (int) $job['order_id'];
    $lyrics = creative_artifact($pdo, "job:{$jobId}", 'LYRIC_PACKAGE', (int) $job['lyric_version']);
    $direction = creative_artifact($pdo, "job:{$jobId}", 'MUSIC_DIRECTION', (int) $job['direction_version']);
    $allocated = array_column(creative_facts_for_track(creative_ledger_for_job($pdo, $job)['body'], (int) $job['track_number']), 'id');
    $plan = $supplied === null
        ? creative_build_plan($lyrics['body'], $direction['body'], $lyrics['version'], $direction['version'])
        : ['schema' => 'mcb.composition_plan.v1', 'status' => 'AUTHORED', 'lyric_version' => $lyrics['version'], 'direction_version' => $direction['version']] + $supplied;
    creative_validate_plan($plan, $lyrics['body'], $allocated);
    $version = creative_store_artifact($pdo, $orderId, "job:{$jobId}", 'COMPOSITION_PLAN', $plan, $by);
    $route = creative_generation_route();
    creative_set_job($pdo, $jobId, ['plan_version' => $version, 'status' => 'GENERATION_REQUIRED', 'waiting_on' => $route['route']]);
    record_order_event($pdo, $orderId, 'CREATIVE.PLAN_READY', ['job_id' => $jobId, 'version' => $version], "creative-plan:{$jobId}:{$version}");
    record_order_event($pdo, $orderId, 'CREATIVE.GENERATION_REQUIRED', ['job_id' => $jobId, 'provider_decision' => $route['decision'], 'route' => $route['route']], "creative-generation-required:{$jobId}:{$version}");
    return $plan;
}

/** Attempts used and allowed for a job. */
function creative_attempt_allowance(PDO $pdo, array $job): array
{
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM creative_generation_attempts WHERE job_id = :j');
    $stmt->execute([':j' => (int) $job['id']]);
    return ['used' => (int) $stmt->fetchColumn(), 'allowed' => creative_max_attempts() + (int) $job['attempt_allowance_extra']];
}

/** Closes an open attempt exactly once; a closed attempt is never rewritten. */
function creative_close_attempt(PDO $pdo, int $attemptId, string $status, ?string $reason): void
{
    $stmt = $pdo->prepare(
        "UPDATE creative_generation_attempts SET status = :s, failure_reason = :r, completed_at = UTC_TIMESTAMP()
          WHERE id = :id AND status IN ('IN_PROGRESS','CANDIDATE_READY')"
    );
    $stmt->execute([':s' => $status, ':r' => $reason, ':id' => $attemptId]);
    if ($stmt->rowCount() !== 1) {
        throw new OperationsException('attempt_closed', 'That attempt already has an outcome; a new attempt is a new row.', 409);
    }
}

/** After a failed attempt: back to generation, or — at the limit — an exception for a person. */
function creative_after_failure(PDO $pdo, int $jobId, string $outcome): void
{
    $job = creative_job_row($pdo, $jobId);
    $allowance = creative_attempt_allowance($pdo, $job);
    if ($allowance['used'] >= $allowance['allowed']) {
        creative_raise_exception($pdo, $job, 'RETRY_LIMIT_REACHED', $outcome);
        return;
    }
    creative_set_job($pdo, $jobId, ['status' => 'GENERATION_REQUIRED', 'waiting_on' => creative_generation_route()['route']]);
}

function creative_raise_exception(PDO $pdo, array $job, string $reason, ?string $detail = null): void
{
    $jobId = (int) $job['id'];
    $orderId = (int) $job['order_id'];
    creative_set_job($pdo, $jobId, ['status' => 'EXCEPTION', 'exception_reason' => $reason, 'waiting_on' => 'STAFF']);
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM creative_generation_attempts WHERE job_id = :j');
    $stmt->execute([':j' => $jobId]);
    $n = (int) $stmt->fetchColumn();
    record_order_event($pdo, $orderId, 'CREATIVE.EXCEPTION', ['job_id' => $jobId, 'reason' => $reason, 'last_outcome' => $detail, 'attempts' => $n], "creative-exception:{$jobId}:{$reason}:{$n}");
    notify_founders_about_order($pdo, 'CREATIVE_EXCEPTION', $orderId, "creative-exception:{$jobId}:{$reason}:{$n}", ['reason' => $reason]);
}

/**
 * Opens a generation attempt for a job (manual now; an adapter later).
 * Refused once the attempt limit is reached: no unlimited generation loop.
 */
function creative_open_attempt(PDO $pdo, array $job, string $providerId, array $meta, string $by): array
{
    $jobId = (int) $job['id'];
    if ($job['status'] === 'EXCEPTION' && $job['exception_reason'] === 'RETRY_LIMIT_REACHED') {
        return ['refused' => 'retry_limit_reached', 'allowed' => creative_attempt_allowance($pdo, $job)['allowed']];
    }
    if ($job['status'] !== 'GENERATION_REQUIRED') {
        throw new OperationsException('generation_not_required', 'This song is not waiting for generation (' . strtolower(str_replace('_', ' ', $job['status'])) . ').', 409);
    }
    $adapter = creative_provider_adapter($providerId);
    if ($adapter === null) {
        throw new OperationsException('provider_not_available', 'No adapter exists for that provider. No music platform is integrated yet (founder selected, integration pending); use manual generation.', 422);
    }
    $allowance = creative_attempt_allowance($pdo, $job);
    if ($allowance['used'] >= $allowance['allowed']) {
        // Recorded (not rolled back): the caller commits, then refuses the request.
        creative_raise_exception($pdo, $job, 'RETRY_LIMIT_REACHED', null);
        return ['refused' => 'retry_limit_reached', 'allowed' => $allowance['allowed']];
    }
    $plan = creative_artifact($pdo, "job:{$jobId}", 'COMPOSITION_PLAN', (int) $job['plan_version']);
    $normal = $adapter->normaliseMetadata($meta);
    $number = $allowance['used'] + 1;
    $pdo->prepare(
        'INSERT INTO creative_generation_attempts
            (job_id, order_id, attempt_number, fact_ledger_version, story_map_version, lyric_version, direction_version, plan_version,
             provider_id, provider_model, provider_generation_id, requested_duration_seconds, requested_output, created_by, started_at)
         VALUES (:j, :o, :n, :fl, :sm, :ly, :md, :pl, :p, :pm, :pg, :rd, :ro, :by, UTC_TIMESTAMP())'
    )->execute([
        ':j' => $jobId, ':o' => (int) $job['order_id'], ':n' => $number,
        ':fl' => (int) $job['fact_ledger_version'], ':sm' => (int) $job['story_map_version'], ':ly' => (int) $job['lyric_version'],
        ':md' => (int) $job['direction_version'], ':pl' => (int) $job['plan_version'],
        ':p' => $adapter->id(), ':pm' => $normal['provider_model'], ':pg' => $normal['provider_generation_id'],
        ':rd' => (int) $plan['body']['target_duration_seconds'], ':ro' => 'LOSSLESS_PREFERRED', ':by' => $by,
    ]);
    $attemptId = (int) $pdo->lastInsertId();
    creative_set_job($pdo, $jobId, ['status' => 'CANDIDATE_QC', 'waiting_on' => null]);
    record_order_event($pdo, (int) $job['order_id'], 'CREATIVE.GENERATION_STARTED', ['job_id' => $jobId, 'attempt' => $number, 'provider' => $adapter->id()], "creative-generation-started:{$jobId}:{$number}");
    return ['attempt_id' => $attemptId, 'attempt_number' => $number];
}

/** Private storage for creative audio, inside the private upload storage. */
function creative_audio_directory(): ?string
{
    $base = upload_directory();
    if ($base === null) {
        return null;
    }
    $dir = $base . '/creative';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return null;
    }
    return is_writable($dir) ? $dir : null;
}

/**
 * Registers a candidate and runs technical QC, then objective fact QC. Each
 * failure closes the attempt with its outcome; the file and results stay.
 */
function creative_register_candidate(PDO $pdo, array $job, array $attempt, string $storedName, int $size, string $sha, array $audio, ?string $transcript, array $claimed): array
{
    $jobId = (int) $job['id'];
    $orderId = (int) $job['order_id'];
    $technical = creative_technical_qc($audio, $size, $sha, [
        'order_id' => $orderId, 'reference' => $job['mcb_reference'], 'job_id' => $jobId, 'attempt_number' => $attempt['attempt_number'],
    ], $claimed);
    $pdo->prepare(
        'INSERT INTO creative_candidates
            (attempt_id, job_id, order_id, stored_name, container, byte_size, sha256, duration_ms, sample_rate_hz, channels, bits_per_sample,
             transcript, technical_status, technical_qc, created_at)
         VALUES (:a, :j, :o, :n, :c, :s, :h, :d, :r, :ch, :b, :t, :ts, :tq, UTC_TIMESTAMP())'
    )->execute([
        ':a' => $attempt['attempt_id'], ':j' => $jobId, ':o' => $orderId, ':n' => $storedName, ':c' => $audio['container'], ':s' => $size, ':h' => $sha,
        ':d' => $audio['duration_ms'], ':r' => $audio['sample_rate_hz'], ':ch' => $audio['channels'], ':b' => $audio['bits_per_sample'],
        ':t' => $transcript, ':ts' => $technical['status'], ':tq' => json_encode($technical, JSON_UNESCAPED_SLASHES),
    ]);
    $candidateId = (int) $pdo->lastInsertId();
    $pdo->prepare('UPDATE creative_generation_attempts SET actual_duration_ms = :d WHERE id = :id')->execute([':d' => $audio['duration_ms'], ':id' => $attempt['attempt_id']]);

    if ($technical['status'] === 'FAIL') {
        creative_close_attempt($pdo, $attempt['attempt_id'], 'TECHNICAL_FAIL', implode(',', array_keys(array_filter($technical['checks'], static fn ($v): bool => $v === 'FAIL'))));
        creative_after_failure($pdo, $jobId, 'TECHNICAL_FAIL');
        return ['candidate_id' => $candidateId, 'outcome' => 'TECHNICAL_FAIL', 'technical' => $technical];
    }
    $pdo->prepare("UPDATE creative_generation_attempts SET status = 'CANDIDATE_READY' WHERE id = :id AND status = 'IN_PROGRESS'")->execute([':id' => $attempt['attempt_id']]);
    record_order_event($pdo, $orderId, 'CREATIVE.CANDIDATE_READY', ['job_id' => $jobId, 'candidate_id' => $candidateId, 'attempt' => $attempt['attempt_number']], "creative-candidate:{$candidateId}");
    record_order_event($pdo, $orderId, 'CREATIVE.TECHNICAL_QC_PASSED', ['job_id' => $jobId, 'candidate_id' => $candidateId], "creative-technical:{$candidateId}");

    // Fact / content QC: against what was sung if supplied, else the lyric package already reviewed.
    $lyrics = creative_artifact($pdo, "job:{$jobId}", 'LYRIC_PACKAGE', (int) $job['lyric_version']);
    $ledger = creative_ledger_for_job($pdo, $job);
    $text = $transcript !== null && trim($transcript) !== '' ? $transcript : creative_lyric_text($lyrics['body']);
    $context = creative_qc_context($pdo, $job, $lyrics['body'], $transcript === null && $job['lyric_qc_status'] === 'PASS');
    $fact = creative_fact_qc($ledger['body'], (int) $job['track_number'], $text, $context);
    $fact['text_source'] = $transcript !== null && trim($transcript) !== '' ? 'TRANSCRIPT' : 'LYRIC_PACKAGE';
    $fact['ledger_version'] = $ledger['version'];
    return creative_apply_fact_qc($pdo, creative_job_row($pdo, $jobId), $attempt['attempt_id'], $candidateId, $fact) + ['technical' => $technical];
}

function creative_apply_fact_qc(PDO $pdo, array $job, int $attemptId, int $candidateId, array $fact): array
{
    $jobId = (int) $job['id'];
    $pdo->prepare('UPDATE creative_candidates SET fact_status = :s, fact_qc = :q WHERE id = :id')
        ->execute([':s' => $fact['status'], ':q' => json_encode($fact, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ':id' => $candidateId]);
    if ($fact['status'] === 'FAIL') {
        creative_close_attempt($pdo, $attemptId, 'FACT_FAIL', implode(',', array_unique(array_column(array_filter($fact['checks'], static fn ($c): bool => $c['result'] === 'FAIL'), 'id'))));
        creative_after_failure($pdo, $jobId, 'FACT_FAIL');
        return ['candidate_id' => $candidateId, 'outcome' => 'FACT_FAIL', 'fact' => $fact];
    }
    if ($fact['status'] === 'REVIEW_REQUIRED') {
        creative_set_job($pdo, $jobId, ['status' => 'FACT_REVIEW_REQUIRED', 'waiting_on' => 'FACT_SEMANTIC_REVIEW']);
        return ['candidate_id' => $candidateId, 'outcome' => 'FACT_REVIEW_REQUIRED', 'fact' => $fact];
    }
    creative_set_job($pdo, $jobId, ['status' => 'CREATIVE_QC_REQUIRED', 'waiting_on' => 'CREATIVE_QC']);
    record_order_event($pdo, (int) $job['order_id'], 'CREATIVE.FACT_QC_PASSED', ['job_id' => $jobId, 'candidate_id' => $candidateId], "creative-fact:{$candidateId}");
    record_order_event($pdo, (int) $job['order_id'], 'CREATIVE.CREATIVE_QC_REQUIRED', ['job_id' => $jobId, 'candidate_id' => $candidateId], "creative-qc-required:{$candidateId}");
    return ['candidate_id' => $candidateId, 'outcome' => 'CREATIVE_QC_REQUIRED', 'fact' => $fact];
}

/* ------------------------------------------------------------------ */
/* Masters, album, capacity                                            */
/* ------------------------------------------------------------------ */

function creative_current_master(PDO $pdo, int $jobId, string $kind = 'PRODUCTION_MASTER'): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM creative_masters WHERE job_id = :j AND kind = :k AND is_current = 1 ORDER BY version DESC LIMIT 1');
    $stmt->execute([':j' => $jobId, ':k' => $kind]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** Stores a new master version; the previous one stays, marked not current. */
function creative_store_master(PDO $pdo, array $job, string $kind, array $file, ?int $candidateId, ?int $derivedFrom, ?string $note, array $evidence, string $by): int
{
    $jobId = (int) $job['id'];
    $stmt = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM creative_masters WHERE job_id = :j AND kind = :k');
    $stmt->execute([':j' => $jobId, ':k' => $kind]);
    $version = (int) $stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE creative_masters SET is_current = 0 WHERE job_id = :j AND kind = :k')->execute([':j' => $jobId, ':k' => $kind]);
    $pdo->prepare(
        'INSERT INTO creative_masters (job_id, order_id, track_number, kind, version, candidate_id, derived_from_master_id, conversion_note,
             stored_name, container, sha256, byte_size, duration_ms, sample_rate_hz, channels, qc_evidence, is_current, created_by, created_at)
         VALUES (:j, :o, :t, :k, :v, :c, :d, :n, :sn, :ct, :h, :bs, :du, :sr, :ch, :e, 1, :by, UTC_TIMESTAMP())'
    )->execute([
        ':j' => $jobId, ':o' => (int) $job['order_id'], ':t' => (int) $job['track_number'], ':k' => $kind, ':v' => $version,
        ':c' => $candidateId, ':d' => $derivedFrom, ':n' => $note, ':sn' => $file['stored_name'], ':ct' => $file['container'], ':h' => $file['sha256'],
        ':bs' => $file['byte_size'], ':du' => $file['duration_ms'], ':sr' => $file['sample_rate_hz'], ':ch' => $file['channels'],
        ':e' => json_encode($evidence, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ':by' => $by,
    ]);
    return (int) $pdo->lastInsertId();
}

/** After a master: album QC for several songs, capacity QC for a record. */
function creative_evaluate_album(PDO $pdo, int $albumId, string $by): array
{
    $album = creative_album_row($pdo, $albumId, true);
    $jobs = creative_album_jobs($pdo, $albumId);
    $orderId = (int) $album['order_id'];
    $mastered = array_filter($jobs, static fn (array $j): bool => $j['status'] === 'MASTER_READY');
    if (count($jobs) !== (int) $album['track_count'] || count($mastered) !== (int) $album['track_count']) {
        return ['status' => 'WAITING_FOR_MASTERS', 'mastered' => count($mastered), 'expected' => (int) $album['track_count']];
    }
    if ((int) $album['track_count'] > 1 && $album['album_qc_status'] !== 'PASS') {
        record_order_event($pdo, $orderId, 'CREATIVE.ALBUM_QC_REQUIRED', ['album_id' => $albumId], "creative-album-qc-required:{$albumId}:" . creative_album_fingerprint($pdo, $jobs));
        $qc = creative_album_objective_qc($pdo, $album, $jobs);
        $pdo->prepare('UPDATE creative_albums SET album_qc_status = :s, album_qc_result = :r WHERE id = :id')
            ->execute([':s' => $qc['status'] === 'PASS' ? 'REVIEW_REQUIRED' : 'FAIL', ':r' => json_encode($qc, JSON_UNESCAPED_SLASHES), ':id' => $albumId]);
        return $qc;
    }
    return creative_run_capacity_qc($pdo, $albumId);
}

function creative_album_fingerprint(PDO $pdo, array $jobs): string
{
    return substr(hash('sha256', implode(',', array_map(static fn (array $j): string => (string) $j['current_master_id'], $jobs))), 0, 16);
}

/** Objective album checks; narrative, cohesion and variation are a person's review. */
function creative_album_objective_qc(PDO $pdo, array $album, array $jobs): array
{
    $problems = [];
    $trackCount = (int) $album['track_count'];
    $numbers = array_map('intval', array_column($jobs, 'track_number'));
    if ($numbers !== range(1, $trackCount)) $problems[] = 'SEQUENCE_INCOMPLETE';
    $masters = [];
    foreach ($jobs as $j) {
        $m = creative_current_master($pdo, (int) $j['id']);
        if ($m === null) {
            $problems[] = "TRACK_{$j['track_number']}_MISSING_MASTER";
            continue;
        }
        $masters[(int) $j['track_number']] = $m;
        $c = $pdo->prepare('SELECT fact_status, technical_status, creative_status FROM creative_candidates WHERE id = :id');
        $c->execute([':id' => (int) $m['candidate_id']]);
        $cand = $c->fetch();
        if ($cand === false || $cand['fact_status'] !== 'PASS' || $cand['technical_status'] !== 'PASS' || $cand['creative_status'] !== 'PASS') $problems[] = "TRACK_{$j['track_number']}_QC_INCOMPLETE";
    }
    if (count($masters) !== $trackCount) $problems[] = 'EXPECTED_MASTER_COUNT';
    $map = creative_artifact($pdo, "album:{$album['id']}", 'ALBUM_MAP');
    $memories = $pdo->prepare('SELECT id FROM order_memories WHERE unit_id = :u');
    $memories->execute([':u' => (int) $album['unit_id']]);
    $unitMemories = array_map('intval', $memories->fetchAll(PDO::FETCH_COLUMN));
    foreach ($jobs as $j) {
        $entry = array_values(array_filter($map['body']['tracks'] ?? [], static fn ($t): bool => ($t['track_number'] ?? 0) === (int) $j['track_number']))[0] ?? null;
        if ($entry === null || (int) $entry['memory_id'] !== (int) $j['memory_id']) $problems[] = "TRACK_{$j['track_number']}_CHAPTER_ALLOCATION";
    }
    if (array_diff($unitMemories, array_map('intval', array_column($jobs, 'memory_id'))) !== []) $problems[] = 'MISSING_MEMORIES';
    $titles = [];
    $texts = [];
    foreach ($jobs as $j) {
        $pkg = $j['lyric_version'] === null ? null : creative_artifact($pdo, "job:{$j['id']}", 'LYRIC_PACKAGE', (int) $j['lyric_version']);
        $titles[(int) $j['track_number']] = strtolower(trim((string) ($pkg['body']['title'] ?? '')));
        $texts[(int) $j['track_number']] = $pkg === null ? '' : creative_lyric_text($pkg['body']);
    }
    if (count(array_unique($titles)) !== count($titles)) $problems[] = 'DUPLICATED_TITLES';
    $threshold = (float) creative_data()['lyric_duplication_threshold'];
    foreach ($texts as $a => $ta) {
        foreach ($texts as $b => $tb) {
            if ($a < $b && creative_similarity($ta, $tb) >= $threshold) $problems[] = "DUPLICATED_LYRICS_{$a}_{$b}";
        }
    }
    $total = (int) round(array_sum(array_map(static fn (array $m): int => (int) $m['duration_ms'], $masters)) / 1000);
    return [
        'status' => $problems === [] ? 'PASS' : 'FAIL',
        'problems' => $problems,
        'expected_tracks' => $trackCount,
        'mastered_tracks' => count($masters),
        'total_programme_seconds' => $total,
        'target_programme_seconds' => (int) $album['target_programme_seconds'],
        'review_required' => creative_data()['album_review_criteria'],
    ];
}

function creative_run_capacity_qc(PDO $pdo, int $albumId): array
{
    $album = creative_album_row($pdo, $albumId);
    if ($album['capacity_status'] === 'NOT_APPLICABLE') {
        return ['status' => 'NOT_APPLICABLE'];
    }
    $orderId = (int) $album['order_id'];
    $seconds = [];
    foreach (creative_album_jobs($pdo, $albumId) as $j) {
        $m = creative_current_master($pdo, (int) $j['id'], 'PHYSICAL_MEDIA_MASTER') ?? creative_current_master($pdo, (int) $j['id']);
        if ($m === null) {
            return ['status' => 'WAITING_FOR_MASTERS'];
        }
        $seconds[] = (int) ceil(((int) $m['duration_ms']) / 1000);
    }
    $profile = creative_capacity_profile((string) $album['sku']);
    record_order_event($pdo, $orderId, 'AUDIO.CAPACITY_CHECK_REQUIRED', ['album_id' => $albumId], "audio-capacity-check:{$albumId}:" . substr(hash('sha256', implode(',', $seconds) . '|' . ($profile['version'] ?? 0) . '|' . ($profile['status'] ?? '')), 0, 16));
    $qc = creative_capacity_qc($profile, $seconds);
    $pdo->prepare('UPDATE creative_albums SET capacity_status = :s, capacity_result = :r WHERE id = :id')
        ->execute([':s' => $qc['status'], ':r' => json_encode($qc, JSON_UNESCAPED_SLASHES), ':id' => $albumId]);
    $key = substr(hash('sha256', json_encode($qc)), 0, 16);
    if ($qc['status'] === 'CAPACITY_PASSED') {
        record_order_event($pdo, $orderId, 'AUDIO.CAPACITY_PASSED', ['album_id' => $albumId, 'total_seconds' => $qc['total_seconds']], "audio-capacity-passed:{$albumId}:{$key}");
    } elseif ($qc['status'] === 'AUDIO_CAPACITY_EXCEPTION') {
        record_order_event($pdo, $orderId, 'AUDIO.CAPACITY_EXCEPTION', ['album_id' => $albumId, 'total_seconds' => $qc['total_seconds'], 'problems' => implode(',', $qc['problems'])], "audio-capacity-exception:{$albumId}:{$key}");
        notify_founders_about_order($pdo, 'AUDIO_CAPACITY_EXCEPTION', $orderId, "audio-capacity:{$albumId}:{$key}", ['reason' => 'VERIFIED_CAPACITY_EXCEEDED', 'supplier_order' => 'BLOCKED']);
    }
    return $qc;
}

/**
 * The Creative Factory's position for MCB's existing quality check.
 *
 * REQUIRED: every song mastered, album QC passed where applicable and, for a
 * record, capacity PASSED — otherwise blocked. ADVISORY (default until the
 * Founders switch it on): reported as a warning. A VERIFIED capacity that is
 * exceeded blocks in BOTH modes: a known overflow is never manufactured.
 *
 * @return array{blocked:bool, reasons:list<string>, enforcement:string, capacity_exception:bool}
 */
function creative_fulfilment_gate(PDO $pdo, array $orderRow): array
{
    $orderId = (int) $orderRow['id'];
    ensure_creative_jobs($pdo, $orderId);
    $reasons = [];
    $capacityException = false;
    $albums = $pdo->prepare('SELECT * FROM creative_albums WHERE order_id = :o ORDER BY id');
    $albums->execute([':o' => $orderId]);
    foreach ($albums->fetchAll() as $album) {
        foreach (creative_album_jobs($pdo, (int) $album['id']) as $j) {
            if ($j['status'] !== 'MASTER_READY') {
                $reasons[] = "TRACK_{$j['track_number']}_NOT_MASTERED";
            }
        }
        if ((int) $album['track_count'] > 1 && $album['album_qc_status'] !== 'PASS') {
            $reasons[] = 'ALBUM_QC_' . $album['album_qc_status'];
        }
        if ($album['capacity_status'] === 'AUDIO_CAPACITY_EXCEPTION') {
            $capacityException = true;
            $reasons[] = 'AUDIO_CAPACITY_EXCEPTION';
        } elseif (!in_array($album['capacity_status'], ['NOT_APPLICABLE', 'CAPACITY_PASSED'], true)) {
            $reasons[] = $album['capacity_status'] === 'PENDING' ? 'CAPACITY_CHECK_PENDING' : $album['capacity_status'];
        }
    }
    $enforcement = creative_enforcement();
    return [
        'blocked' => $capacityException || ($enforcement === 'REQUIRED' && $reasons !== []),
        'reasons' => array_values(array_unique($reasons)),
        'enforcement' => $enforcement,
        'capacity_exception' => $capacityException,
    ];
}


/**
 * Creative QC of a candidate by a person: PASS, REGENERATE (internal rework) or
 * ESCALATE. Shared by the engineering console and the Founder Command Centre.
 * Nothing here contacts the customer.
 */
function creative_record_creative_qc(PDO $pdo, int $orderId, array $c, array $criteria, mixed $outcome, string $staff): array
{
    $j = creative_job_row($pdo, (int) $c['job_id'], true);
    if ($j['status'] !== 'CREATIVE_QC_REQUIRED' || $c['technical_status'] !== 'PASS' || $c['fact_status'] !== 'PASS') {
        throw new OperationsException('invalid_transition', 'Creative QC follows technical and fact QC.', 409);
    }
    $missing = array_values(array_filter(creative_data()['creative_qc_criteria'], static fn (string $k): bool => !in_array($criteria[$k] ?? null, ['PASS', 'CONCERN'], true)));
    if ($missing !== [] || !in_array($outcome, creative_data()['creative_qc_outcomes'], true)) {
        throw new OperationsException('creative_qc_incomplete', 'Mark every criterion PASS or CONCERN and choose PASS, REGENERATE or ESCALATE.', 422);
    }
    if ($outcome === 'PASS' && in_array('CONCERN', $criteria, true)) {
        throw new OperationsException('creative_qc_concern', 'A candidate with a concern cannot pass: regenerate or escalate.', 422);
    }
    $record = ['by' => $staff, 'outcome' => $outcome, 'criteria' => array_intersect_key($criteria, array_flip(creative_data()['creative_qc_criteria']))];
    $pdo->prepare('UPDATE creative_candidates SET creative_status = :s, creative_qc = :q WHERE id = :id')->execute([':s' => $outcome, ':q' => json_encode($record), ':id' => (int) $c['id']]);
    if ($outcome === 'PASS') {
        creative_close_attempt($pdo, (int) $c['attempt_id'], 'PASS', null);
        creative_set_job($pdo, (int) $j['id'], ['status' => 'MASTER_REQUIRED', 'waiting_on' => 'MASTER']);
        record_order_event($pdo, $orderId, 'CREATIVE.CREATIVE_QC_PASSED', ['job_id' => (int) $j['id'], 'candidate_id' => (int) $c['id']], "creative-creative-qc:{$c['id']}");
    } elseif ($outcome === 'REGENERATE') {
        creative_close_attempt($pdo, (int) $c['attempt_id'], 'CREATIVE_FAIL', 'REGENERATE');
        creative_after_failure($pdo, (int) $j['id'], 'CREATIVE_FAIL');
    } else {
        creative_close_attempt($pdo, (int) $c['attempt_id'], 'CREATIVE_FAIL', 'ESCALATED');
        creative_raise_exception($pdo, $j, 'ESCALATED', 'CREATIVE_QC');
    }
    return ['outcome' => $outcome, 'job_status' => creative_job_row($pdo, (int) $j['id'])['status']];
}

/** Promotes a candidate that passed every QC to the production master (the file is unchanged). */
function creative_promote_master(PDO $pdo, int $orderId, array $c, string $staff): array
{
    $j = creative_job_row($pdo, (int) $c['job_id'], true);
    if ($c['technical_status'] !== 'PASS' || $c['fact_status'] !== 'PASS' || $c['creative_status'] !== 'PASS' || $c['attempt_status'] !== 'PASS') {
        throw new OperationsException('master_requires_all_qc', 'A master needs technical, fact/content and creative QC all passed.', 409);
    }
    if ($j['status'] !== 'MASTER_REQUIRED') {
        throw new OperationsException('invalid_transition', 'This song is not waiting for a master.', 409);
    }
    $masterId = creative_store_master($pdo, $j, 'PRODUCTION_MASTER', [
        'stored_name' => $c['stored_name'], 'container' => $c['container'], 'sha256' => $c['sha256'], 'byte_size' => (int) $c['byte_size'],
        'duration_ms' => $c['duration_ms'] === null ? null : (int) $c['duration_ms'], 'sample_rate_hz' => $c['sample_rate_hz'] === null ? null : (int) $c['sample_rate_hz'], 'channels' => $c['channels'] === null ? null : (int) $c['channels'],
    ], (int) $c['id'], null, null, [
        'attempt' => (int) $c['attempt_number'], 'technical' => json_decode((string) $c['technical_qc'], true)['status'] ?? null,
        'fact' => 'PASS', 'creative' => json_decode((string) $c['creative_qc'], true),
        'versions' => ['fact_ledger' => (int) $j['fact_ledger_version'], 'lyrics' => (int) $j['lyric_version'], 'music_direction' => (int) $j['direction_version'], 'plan' => (int) $j['plan_version']],
        'provenance' => 'CANDIDATE_FILE_UNCHANGED',
    ], $staff);
    creative_set_job($pdo, (int) $j['id'], ['status' => 'MASTER_READY', 'waiting_on' => null, 'current_master_id' => $masterId]);
    record_order_event($pdo, $orderId, 'CREATIVE.MASTER_READY', ['job_id' => (int) $j['id'], 'master_id' => $masterId], "creative-master:{$masterId}");
    // A Memory Music Video for this song can now be prepared from the (unchanged) master.
    if (function_exists('video_refresh_order')) {
        video_refresh_order($pdo, $orderId);
    }
    return ['master_id' => $masterId, 'album' => creative_evaluate_album($pdo, (int) $j['album_id'], $staff)];
}
