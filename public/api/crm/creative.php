<?php
/**
 * /api/crm/creative — the Creative Factory for staff. CRM key required.
 *
 * GET  ?order_id=41&staff=Name          the order's jobs, versioned documents,
 *                                       attempts, candidates, QC, masters,
 *                                       album and capacity QC, provider status
 * GET  ?view=metrics&staff=Name         generation and QC metrics (cost where known)
 * GET  ?view=providers                  provider decision and capability registry
 * POST { action, order_id, staff, … }   see the actions below
 *
 * Every read of private creative material is written to creative_access_log.
 * Nothing here calls a music provider, spends money, contacts the customer or
 * asks the customer to approve anything.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/creative-factory.php';

require_crm_key();

$pdo = db();

$log = static function (int $orderId, string $staff, string $action) use ($pdo): void {
    $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')
        ->execute([':o' => $orderId, ':s' => $staff, ':a' => $action]);
};
$decode = static fn (?string $json): mixed => $json === null ? null : json_decode($json, true);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (($_GET['view'] ?? '') === 'providers') {
        json_response(200, ['route' => creative_generation_route()] + creative_provider_registry());
    }
    $staff = operations_line($_GET['staff'] ?? null, 160);
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is looking, so access to private creative material is audited.');
    }

    if (($_GET['view'] ?? '') === 'metrics') {
        $attempts = $pdo->query(
            "SELECT provider_id, status, COUNT(*) AS n, SUM(COALESCE(actual_duration_ms,0)) AS ms,
                    SUM(cost_actual_minor) AS cost, SUM(cost_actual_minor IS NOT NULL) AS costed
               FROM creative_generation_attempts GROUP BY provider_id, status"
        )->fetchAll();
        $jobs = (int) $pdo->query('SELECT COUNT(DISTINCT job_id) FROM creative_generation_attempts')->fetchColumn();
        $masters = (int) $pdo->query("SELECT COUNT(*) FROM creative_masters WHERE kind = 'PRODUCTION_MASTER'")->fetchColumn();
        $candidates = (int) $pdo->query('SELECT COUNT(*) FROM creative_candidates')->fetchColumn();
        $reasons = $pdo->query("SELECT status AS outcome, failure_reason, COUNT(*) AS n FROM creative_generation_attempts WHERE status LIKE '%FAIL' GROUP BY status, failure_reason")->fetchAll();
        $avgTime = $pdo->query(
            "SELECT AVG(TIMESTAMPDIFF(SECOND, j.created_at, m.created_at)) FROM creative_masters m JOIN creative_jobs j ON j.id = m.job_id
              WHERE m.kind = 'PRODUCTION_MASTER' AND m.version = 1"
        )->fetchColumn();
        $total = array_sum(array_map('intval', array_column($attempts, 'n')));
        $failed = array_sum(array_map(static fn (array $r): int => str_ends_with($r['status'], 'FAIL') ? (int) $r['n'] : 0, $attempts));
        $cost = array_sum(array_map(static fn (array $r): int => (int) $r['cost'], $attempts));
        $costed = array_sum(array_map('intval', array_column($attempts, 'costed')));
        $providers = [];
        foreach ($attempts as $r) {
            $p = &$providers[$r['provider_id']];
            $p['attempts'] = ($p['attempts'] ?? 0) + (int) $r['n'];
            $p['by_status'][$r['status']] = (int) $r['n'];
            unset($p);
        }
        json_response(200, [
            'attempts' => $total,
            'songs_attempted' => $jobs,
            'attempts_per_song' => $jobs > 0 ? round($total / $jobs, 2) : null,
            'generation_minutes' => round(array_sum(array_map('intval', array_column($attempts, 'ms'))) / 60000, 2),
            'provider_cost_minor' => $costed > 0 ? $cost : null,
            'cost_per_candidate_minor' => $costed > 0 && $candidates > 0 ? (int) round($cost / $candidates) : null,
            'cost_per_passed_master_minor' => $costed > 0 && $masters > 0 ? (int) round($cost / $masters) : null,
            'failure_rate' => $total > 0 ? round($failed / $total, 3) : null,
            'regeneration_reasons' => $reasons,
            'average_attempts_per_master' => $masters > 0 ? round($total / $masters, 2) : null,
            'average_production_seconds' => $avgTime === null || $avgTime === false ? null : (int) $avgTime,
            'providers' => $providers,
            'note' => 'Internal only. Costs appear only where a provider reports them; MCB takes no spending decision from these figures.',
        ]);
    }

    $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
    $row = $orderId > 0 ? operations_order_row($pdo, $orderId) : null;
    if ($row === null) {
        json_error(404, 'order_not_found', 'No such order.');
    }
    $jobs = db_transaction(fn (PDO $pdo): array => ensure_creative_jobs($pdo, $orderId));
    $log($orderId, $staff, 'VIEW_ORDER');

    $albums = $pdo->prepare('SELECT * FROM creative_albums WHERE order_id = :o ORDER BY id');
    $albums->execute([':o' => $orderId]);
    $attemptsStmt = $pdo->prepare('SELECT * FROM creative_generation_attempts WHERE job_id = :j ORDER BY attempt_number');
    $candStmt = $pdo->prepare('SELECT id, attempt_id, container, byte_size, sha256, duration_ms, sample_rate_hz, channels, bits_per_sample, technical_status, technical_qc, fact_status, fact_qc, creative_status, creative_qc, created_at FROM creative_candidates WHERE attempt_id = :a');
    $mastersStmt = $pdo->prepare('SELECT id, kind, version, candidate_id, derived_from_master_id, conversion_note, container, sha256, byte_size, duration_ms, sample_rate_hz, channels, qc_evidence, is_current, created_by, created_at FROM creative_masters WHERE job_id = :j ORDER BY kind, version');
    $albumOut = [];
    foreach ($albums->fetchAll() as $a) {
        $scope = "album:{$a['id']}";
        $albumOut[] = [
            'album_id' => (int) $a['id'], 'sku' => $a['sku'], 'track_count' => (int) $a['track_count'],
            'target_programme_seconds' => (int) $a['target_programme_seconds'],
            'fact_ledger' => creative_artifact($pdo, $scope, 'FACT_LEDGER'),
            'album_map' => creative_artifact($pdo, $scope, 'ALBUM_MAP'),
            'album_qc' => ['status' => $a['album_qc_status'], 'result' => $decode($a['album_qc_result'])],
            'capacity' => ['status' => $a['capacity_status'], 'result' => $decode($a['capacity_result']), 'profile' => creative_capacity_profile((string) $a['sku'])],
        ];
    }
    $jobOut = [];
    foreach ($jobs as $j) {
        $scope = "job:{$j['id']}";
        $attemptsStmt->execute([':j' => (int) $j['id']]);
        $attempts = [];
        foreach ($attemptsStmt->fetchAll() as $at) {
            $candStmt->execute([':a' => (int) $at['id']]);
            $c = $candStmt->fetch();
            if ($c !== false) {
                foreach (['technical_qc', 'fact_qc', 'creative_qc'] as $k) {
                    $c[$k] = $decode($c[$k]);
                }
            }
            $attempts[] = $at + ['candidate' => $c === false ? null : $c];
        }
        $mastersStmt->execute([':j' => (int) $j['id']]);
        $jobOut[] = [
            'job_id' => (int) $j['id'], 'album_id' => (int) $j['album_id'], 'track_number' => (int) $j['track_number'],
            'status' => $j['status'], 'waiting_on' => $j['waiting_on'], 'exception_reason' => $j['exception_reason'],
            'versions' => ['fact_ledger' => $j['fact_ledger_version'], 'story_map' => $j['story_map_version'], 'lyrics' => $j['lyric_version'], 'music_direction' => $j['direction_version'], 'plan' => $j['plan_version']],
            'attempt_allowance' => creative_attempt_allowance($pdo, $j),
            'story_map' => creative_artifact($pdo, $scope, 'STORY_MAP'),
            'lyric_package' => creative_artifact($pdo, $scope, 'LYRIC_PACKAGE'),
            'lyric_qc' => ['status' => $j['lyric_qc_status'], 'result' => $decode($j['lyric_qc_result'])],
            'music_direction' => creative_artifact($pdo, $scope, 'MUSIC_DIRECTION'),
            'composition_plan' => creative_artifact($pdo, $scope, 'COMPOSITION_PLAN'),
            'attempts' => $attempts,
            'masters' => array_map(static function (array $m) use ($decode): array { $m['qc_evidence'] = $decode($m['qc_evidence']); return $m; }, $mastersStmt->fetchAll()),
        ];
    }
    json_response(200, [
        'order_id' => $orderId,
        'reference' => $row['mcb_reference'],
        'workflow' => order_workflow($row),
        'duration_policy' => creative_duration_policy(),
        'provider' => creative_generation_route(),
        'max_generation_attempts' => creative_max_attempts(),
        'enforcement' => creative_enforcement(),
        'gate' => $row['status'] === 'PAID' ? creative_fulfilment_gate($pdo, $row) : null,
        'albums' => $albumOut,
        'jobs' => $jobOut,
    ]);
}

require_method('POST');
$body = read_json_body(262144);
$action = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';
$staff = operations_line($body['staff'] ?? null, 160);
$orderId = is_int($body['order_id'] ?? null) ? $body['order_id'] : 0;
if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}
if ($orderId <= 0) {
    json_error(422, 'invalid_order', 'An order id is required.');
}

try {
    $result = db_transaction(function (PDO $pdo) use ($action, $body, $staff, $orderId, $log): array {
        $order = operations_order_row($pdo, $orderId, true);
        if ($order === null || $order['status'] !== 'PAID') {
            throw new OperationsException('order_not_found', 'No such paid order.', 404);
        }
        ensure_creative_jobs($pdo, $orderId);
        // Every object named must belong to this order: another order's id is simply not found.
        $job = static function (string $key) use ($pdo, $body, $orderId): array {
            $id = is_int($body[$key] ?? null) ? $body[$key] : 0;
            $j = $id > 0 ? creative_job_row($pdo, $id, true) : null;
            if ($j === null || (int) $j['order_id'] !== $orderId) {
                throw new OperationsException('job_not_found', 'No such creative job on this order.', 404);
            }
            return $j;
        };
        $album = static function () use ($pdo, $body, $orderId): array {
            $id = is_int($body['album_id'] ?? null) ? $body['album_id'] : 0;
            $a = $id > 0 ? creative_album_row($pdo, $id, true) : null;
            if ($a === null || (int) $a['order_id'] !== $orderId) {
                throw new OperationsException('album_not_found', 'No such album on this order.', 404);
            }
            return $a;
        };
        $candidate = static function () use ($pdo, $body, $orderId): array {
            $id = is_int($body['candidate_id'] ?? null) ? $body['candidate_id'] : 0;
            $stmt = $pdo->prepare('SELECT c.*, a.status AS attempt_status, a.attempt_number FROM creative_candidates c JOIN creative_generation_attempts a ON a.id = c.attempt_id WHERE c.id = :id FOR UPDATE');
            $stmt->execute([':id' => $id]);
            $c = $stmt->fetch();
            if ($c === false || (int) $c['order_id'] !== $orderId) {
                throw new OperationsException('candidate_not_found', 'No such candidate on this order.', 404);
            }
            return $c;
        };
        $doc = static function (string $key) use ($body): array {
            if (!is_array($body[$key] ?? null)) {
                throw new OperationsException('document_required', "Send the {$key} document.", 422);
            }
            return $body[$key];
        };
        $log($orderId, $staff, 'ACTION_' . substr($action, 0, 32));

        switch ($action) {
            case 'UPDATE_FACT_LEDGER':
                $a = $album();
                $prev = creative_artifact($pdo, "album:{$a['id']}", 'FACT_LEDGER');
                $new = $doc('fact_ledger');
                creative_validate_fact_ledger($new, (int) $a['track_count'], $prev['body']);
                $version = creative_store_artifact($pdo, $orderId, "album:{$a['id']}", 'FACT_LEDGER', ['schema' => 'mcb.fact_ledger.v1', 'sku' => $a['sku'], 'track_count' => (int) $a['track_count'], 'facts' => $new['facts'], 'exclusions' => $new['exclusions'] ?? [], 'extraction' => 'REVISED_BY_STAFF'], $staff);
                record_order_event($pdo, $orderId, 'CREATIVE.FACT_LEDGER_READY', ['album_id' => (int) $a['id'], 'version' => $version, 'by' => $staff], "creative-ledger:{$a['id']}:{$version}");
                // Lyrics already written are checked again against the revised ledger.
                foreach (creative_album_jobs($pdo, (int) $a['id']) as $j) {
                    creative_set_job($pdo, (int) $j['id'], ['fact_ledger_version' => $version]);
                    if ($j['lyric_version'] !== null && in_array($j['status'], ['LYRICS_QC_FAILED', 'LYRICS_REVIEW_REQUIRED', 'PLAN_REQUIRED', 'GENERATION_REQUIRED'], true)) {
                        creative_run_lyric_qc($pdo, creative_job_row($pdo, (int) $j['id']), false, $staff);
                    }
                }
                return ['version' => $version];

            case 'UPDATE_ALBUM_MAP':
                $a = $album();
                if ((int) $a['track_count'] < 2) {
                    throw new OperationsException('not_an_album', 'A single song has no album map.', 409);
                }
                $map = $doc('album_map');
                $ledger = creative_artifact($pdo, "album:{$a['id']}", 'FACT_LEDGER');
                creative_validate_album_map($map, creative_album_jobs($pdo, (int) $a['id']), $ledger['body']);
                $version = creative_store_artifact($pdo, $orderId, "album:{$a['id']}", 'ALBUM_MAP', ['schema' => 'mcb.album_map.v1', 'status' => 'AUTHORED', 'track_count' => (int) $a['track_count'], 'target_programme_seconds' => (int) $a['target_programme_seconds'], 'fact_ledger_version' => $ledger['version'], 'album_title' => $map['album_title'] ?? null, 'tracks' => $map['tracks'], 'duplication_controls' => $map['duplication_controls'] ?? null], $staff);
                return ['version' => $version];

            case 'UPDATE_STORY_MAP':
                $j = $job('job_id');
                $story = $doc('story_map');
                $allocated = array_column(creative_facts_for_track(creative_ledger_for_job($pdo, $j)['body'], (int) $j['track_number']), 'id');
                creative_validate_story_map($story, $allocated);
                $version = creative_store_artifact($pdo, $orderId, "job:{$j['id']}", 'STORY_MAP', ['schema' => 'mcb.story_map.v1', 'status' => 'AUTHORED', 'track_number' => (int) $j['track_number']] + array_intersect_key($story, array_flip(['opening', 'narrative_progression', 'important_memories', 'emotional_build', 'central_statement', 'climax', 'resolution', 'allocated_fact_ids', 'intended_musical_movement'])), $staff);
                creative_set_job($pdo, (int) $j['id'], ['story_map_version' => $version]);
                record_order_event($pdo, $orderId, 'CREATIVE.STORY_MAP_READY', ['job_id' => (int) $j['id'], 'version' => $version], "creative-story:{$j['id']}:{$version}");
                return ['version' => $version];

            case 'UPDATE_MUSIC_DIRECTION':
                $j = $job('job_id');
                $dir = $doc('music_direction');
                creative_validate_music_direction($dir);
                $version = creative_store_artifact($pdo, $orderId, "job:{$j['id']}", 'MUSIC_DIRECTION', ['schema' => 'mcb.music_direction.v1', 'status' => 'AUTHORED'] + array_intersect_key($dir, array_flip(creative_data()['music_direction_fields'])), $staff);
                creative_set_job($pdo, (int) $j['id'], ['direction_version' => $version]);
                return ['version' => $version];

            case 'SUBMIT_LYRICS':
                $j = $job('job_id');
                if (!in_array($j['status'], ['LYRICS_REQUIRED', 'LYRICS_QC_FAILED', 'LYRICS_REVIEW_REQUIRED', 'PLAN_REQUIRED', 'GENERATION_REQUIRED'], true)) {
                    throw new OperationsException('invalid_transition', 'Lyrics can be replaced only before a candidate is being checked.', 409);
                }
                $lyrics = $doc('lyric_package');
                $allocated = array_column(creative_facts_for_track(creative_ledger_for_job($pdo, $j)['body'], (int) $j['track_number']), 'id');
                creative_validate_lyrics($lyrics, $allocated);
                $version = creative_store_artifact($pdo, $orderId, "job:{$j['id']}", 'LYRIC_PACKAGE', ['schema' => 'mcb.lyric_package.v1', 'author' => 'STAFF'] + array_intersect_key($lyrics, array_flip(['title', 'sections', 'pronunciation_notes', 'exclusions', 'emotional_intention'])), $staff);
                creative_set_job($pdo, (int) $j['id'], ['lyric_version' => $version, 'lyric_qc_status' => 'PENDING', 'plan_version' => null]);
                return ['version' => $version, 'lyric_qc' => creative_run_lyric_qc($pdo, creative_job_row($pdo, (int) $j['id']), false, $staff)];

            case 'LYRICS_REVIEW':
                $j = $job('job_id');
                if ($j['status'] !== 'LYRICS_REVIEW_REQUIRED') {
                    throw new OperationsException('invalid_transition', 'These lyrics are not waiting for a review.', 409);
                }
                $outcome = $body['outcome'] ?? null;
                if (!in_array($outcome, ['PASS', 'FAIL'], true)) {
                    throw new OperationsException('invalid_outcome', 'Outcome: PASS or FAIL.', 422);
                }
                if ($outcome === 'FAIL') {
                    creative_set_job($pdo, (int) $j['id'], ['lyric_qc_status' => 'FAIL', 'status' => 'LYRICS_QC_FAILED', 'waiting_on' => 'LYRIC_AUTHOR']);
                    return ['status' => 'LYRICS_QC_FAILED'];
                }
                $qc = json_decode((string) $j['lyric_qc_result'], true);
                if (in_array('FAIL', array_column($qc['checks'] ?? [], 'result'), true)) {
                    throw new OperationsException('objective_failures', 'Objective failures cannot be reviewed away; correct the lyrics.', 409);
                }
                return ['lyric_qc' => creative_run_lyric_qc($pdo, $j, true, $staff)];

            case 'SUBMIT_PLAN':
                $j = $job('job_id');
                if (!in_array($j['status'], ['PLAN_REQUIRED', 'GENERATION_REQUIRED'], true) || $j['lyric_qc_status'] !== 'PASS') {
                    throw new OperationsException('invalid_transition', 'A plan follows lyrics that passed their fact QC.', 409);
                }
                return ['plan' => creative_build_and_route_plan($pdo, $j, $doc('composition_plan'), $staff)];

            case 'RECORD_PROVIDER_FAILURE':
                $j = $job('job_id');
                $opened = creative_open_attempt($pdo, $j, 'manual', $body, $staff);
                if (isset($opened['refused'])) {
                    return $opened;
                }
                $handled = creative_provider_adapter('manual')->handleError(['reason' => $body['reason'] ?? null]);
                creative_close_attempt($pdo, $opened['attempt_id'], 'PROVIDER_FAIL', $handled['reason']);
                creative_after_failure($pdo, (int) $j['id'], 'PROVIDER_FAIL');
                return ['attempt' => $opened['attempt_number'], 'outcome' => 'PROVIDER_FAIL', 'job_status' => creative_job_row($pdo, (int) $j['id'])['status']];

            case 'FACT_REVIEW':
                $c = $candidate();
                $j = creative_job_row($pdo, (int) $c['job_id'], true);
                if ($j['status'] !== 'FACT_REVIEW_REQUIRED' || $c['fact_status'] !== 'REVIEW_REQUIRED') {
                    throw new OperationsException('invalid_transition', 'This candidate is not waiting for a fact review.', 409);
                }
                $outcome = $body['outcome'] ?? null;
                if (!in_array($outcome, ['PASS', 'FAIL'], true)) {
                    throw new OperationsException('invalid_outcome', 'Outcome: PASS or FAIL.', 422);
                }
                $fact = json_decode((string) $c['fact_qc'], true);
                $fact['review'] = ['by' => $staff, 'outcome' => $outcome];
                $fact['status'] = $outcome;
                return creative_apply_fact_qc($pdo, $j, (int) $c['attempt_id'], (int) $c['id'], $fact);

            case 'CREATIVE_QC':
                return creative_record_creative_qc($pdo, $orderId, $candidate(), is_array($body['criteria'] ?? null) ? $body['criteria'] : [], $body['outcome'] ?? null, $staff);

            case 'PROMOTE_MASTER':
                return creative_promote_master($pdo, $orderId, $candidate(), $staff);

            case 'ALBUM_QC_REVIEW':
                $a = $album();
                if ($a['album_qc_status'] !== 'REVIEW_REQUIRED') {
                    throw new OperationsException('invalid_transition', 'This album is not waiting for its review (objective checks must pass first).', 409);
                }
                $criteria = is_array($body['criteria'] ?? null) ? $body['criteria'] : [];
                $outcome = $body['outcome'] ?? null;
                $missing = array_values(array_filter(creative_data()['album_review_criteria'], static fn (string $k): bool => !in_array($criteria[$k] ?? null, ['PASS', 'CONCERN'], true)));
                if ($missing !== [] || !in_array($outcome, ['PASS', 'FAIL'], true) || ($outcome === 'PASS' && in_array('CONCERN', $criteria, true))) {
                    throw new OperationsException('album_review_incomplete', 'Mark narrative progression, musical cohesion and deliberate variation, then PASS (no concerns) or FAIL.', 422);
                }
                $result = json_decode((string) $a['album_qc_result'], true);
                $result['review'] = ['by' => $staff, 'outcome' => $outcome, 'criteria' => $criteria];
                $pdo->prepare('UPDATE creative_albums SET album_qc_status = :s, album_qc_result = :r WHERE id = :id')->execute([':s' => $outcome, ':r' => json_encode($result), ':id' => (int) $a['id']]);
                if ($outcome === 'FAIL') {
                    return ['album_qc' => 'FAIL'];
                }
                record_order_event($pdo, $orderId, 'CREATIVE.ALBUM_READY', ['album_id' => (int) $a['id']], "creative-album-ready:{$a['id']}:" . creative_album_fingerprint($pdo, creative_album_jobs($pdo, (int) $a['id'])));
                return ['album_qc' => 'PASS', 'capacity' => creative_run_capacity_qc($pdo, (int) $a['id'])];

            case 'RUN_CAPACITY_CHECK':
                $a = $album();
                if ((int) $a['track_count'] > 1 && $a['album_qc_status'] !== 'PASS') {
                    throw new OperationsException('album_not_ready', 'The album must pass its QC before the capacity check.', 409);
                }
                return ['capacity' => creative_run_capacity_qc($pdo, (int) $a['id'])];

            case 'RESOLVE_EXCEPTION':
                $j = $job('job_id');
                $note = operations_text($body['note'] ?? null, 1000);
                if ($j['status'] !== 'EXCEPTION' || $note === null) {
                    throw new OperationsException('invalid_transition', 'Only a song in exception can be resolved, with a note of why.', 409);
                }
                if (($body['resolution'] ?? null) !== 'AUTHORISE_ONE_MORE_ATTEMPT') {
                    throw new OperationsException('invalid_resolution', 'Resolution: AUTHORISE_ONE_MORE_ATTEMPT.', 422);
                }
                $pdo->prepare('INSERT INTO order_staff_notes (order_id, note, staff, created_at) VALUES (:o, :n, :s, UTC_TIMESTAMP())')->execute([':o' => $orderId, ':n' => 'Creative exception resolved: ' . $note, ':s' => $staff]);
                creative_set_job($pdo, (int) $j['id'], ['attempt_allowance_extra' => (int) $j['attempt_allowance_extra'] + 1, 'status' => 'GENERATION_REQUIRED', 'waiting_on' => creative_generation_route()['route'], 'exception_reason' => null]);
                record_order_event($pdo, $orderId, 'CREATIVE.EXCEPTION_RESOLVED', ['job_id' => (int) $j['id'], 'by' => $staff, 'resolution' => 'AUTHORISE_ONE_MORE_ATTEMPT']);
                return ['job_status' => 'GENERATION_REQUIRED'];
        }
        throw new OperationsException('unknown_action', 'That action is not recognised.', 422);
    });
} catch (CreativeValidationException $e) {
    json_error(422, 'invalid_document', 'The document did not pass validation.', ['problems' => $e->problems]);
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB creative action ' . $action . ' failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
}

if (isset($result['refused'])) {
    json_error(409, 'retry_limit_reached', "This song has used its {$result['allowed']} generation attempts. It is now a creative exception for a person to review.");
}
json_response(200, ['order_id' => $orderId, 'action' => $action] + $result);
