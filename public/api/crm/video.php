<?php
/**
 * /api/crm/video — MCB Memory Music Video production for staff. CRM key and a
 * staff name on every request (audited).
 *
 * GET  ?order_id=N                       the order's video jobs: inputs (the protected
 *                                        audio master reference, song title and duration,
 *                                        photographs, memory facts, visual direction),
 *                                        candidates, masters, capacity
 * GET  ?view=capacity                    the ledger for the current period
 * GET  ?view=metrics                     internal product metrics
 * GET  ?download=media|candidate|master|audio&id=N   a private file (audited)
 * POST { action, order_id, video_job_id, … }  CONFIRM_INPUTS, SET_VISUAL_DIRECTION,
 *                                        DURATION_REVIEW, START_PRODUCTION, VIDEO_QC,
 *                                        REVEAL_VIDEO, RELEASE_CAPACITY, RECORD_PRODUCTION_COST
 * POST multipart action=REGISTER_CANDIDATE: order_id, reference, video_job_id,
 *                                        external_reference?, video (the file a person made)
 * POST { action: SET_PERIOD_CAPACITY, period_key, capacity }     never below spaces in use
 * POST { action: DEFINE_PERIOD, period_key, starts_at, ends_at, capacity }  future only, no overlap
 * POST { action: ALLOCATE_CAPACITY, order_id, entitlement_id, customer_agreed: true }
 *                                        a paid video without a space, placed in the current
 *                                        period only if a space exists and the customer agreed
 *
 * NO PLATFORM IS CALLED. Production is manual: a person makes the film on the
 * chosen platform and registers it here. Nothing edits the audio master.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/video.php';
require_once __DIR__ . '/../lib/lifecycle-messages.php';

require_crm_key();
header('Cache-Control: no-store');

$pdo = db();
$log = static function (int $orderId, string $staff, string $action, ?int $subject = null, ?int $version = null) use ($pdo): void {
    $pdo->prepare('INSERT INTO video_access_log (order_id, actor, staff, action, subject_id, version) VALUES (:o, :a, :s, :act, :sub, :v)')
        ->execute([':o' => $orderId, ':a' => 'STAFF', ':s' => $staff, ':act' => $action, ':sub' => $subject, ':v' => $version]);
};

try {
    if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
        $staff = crm_staff_name(operations_line($_GET['staff'] ?? null, 160));
        if ($staff === null) {
            json_error(422, 'staff_required', 'Say who is looking, so access to private video material is audited.');
        }
        $view = (string) ($_GET['view'] ?? '');
        if ($view === 'capacity') {
            json_response(200, ['capacity' => video_capacity($pdo), 'planning_limits' => video_data()['planning_limits'], 'platform' => video_data()['platform']]);
        }
        if ($view === 'metrics') {
            json_response(200, ['metrics' => video_metrics($pdo)]);
        }
        if (isset($_GET['download'])) {
            $kind = (string) $_GET['download'];
            $id = ctype_digit((string) ($_GET['id'] ?? '')) ? (int) $_GET['id'] : 0;
            [$sql, $dir, $action] = match ($kind) {
                'media' => ['SELECT order_id, stored_name, mime_type AS type, NULL AS version FROM video_media WHERE id = :id', video_storage('media'), 'DOWNLOAD_MEDIA'],
                'candidate' => ['SELECT order_id, stored_name, container AS type, version FROM video_candidates WHERE id = :id', video_storage('candidates'), 'DOWNLOAD_CANDIDATE'],
                'master' => ['SELECT order_id, stored_name, container AS type, version FROM video_masters WHERE id = :id', video_storage('masters'), 'DOWNLOAD_MASTER'],
                'audio' => ["SELECT order_id, stored_name, container AS type, version FROM creative_masters WHERE id = :id AND kind = 'PRODUCTION_MASTER'", creative_audio_directory(), 'DOWNLOAD_AUDIO_MASTER_REFERENCE'],
                default => [null, null, null],
            };
            if ($sql === null) {
                json_error(422, 'invalid_download', 'Unknown file kind.');
            }
            $stmt = $pdo->prepare($sql);
            $stmt->execute([':id' => $id]);
            $row = $stmt->fetch();
            $path = $row === false || $dir === null || preg_match('/^[a-f0-9]{64}$/', (string) $row['stored_name']) !== 1 ? null : $dir . '/' . $row['stored_name'];
            if ($path === null || !is_file($path)) {
                json_error(404, 'not_found', 'No such file.');
            }
            $log((int) $row['order_id'], $staff, $action, $id, $row['version'] === null ? null : (int) $row['version']);
            if ($kind === 'audio') {
                // A read-only copy for production: the stored master is never opened for writing.
                $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')->execute([':o' => (int) $row['order_id'], ':s' => $staff, ':a' => 'VIDEO_PRODUCTION_REFERENCE']);
            }
            http_response_code(200);
            header('Content-Type: application/octet-stream');
            header('Content-Length: ' . (string) filesize($path));
            header('Content-Disposition: attachment; filename="mcb-video-' . $kind . '-' . $id . '"');
            header('X-Content-Type-Options: nosniff');
            header("Content-Security-Policy: default-src 'none'; sandbox");
            readfile($path);
            exit;
        }

        $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
        $row = operations_order_row($pdo, $orderId);
        if ($row === null) {
            json_error(404, 'order_not_found', 'No such order.');
        }
        if ($row['status'] === 'PAID') {
            db_transaction(static fn (PDO $pdo) => video_refresh_order($pdo, $orderId));
        }
        $jobs = $pdo->prepare('SELECT id FROM video_jobs WHERE order_id = :o ORDER BY id');
        $jobs->execute([':o' => $orderId]);
        $out = [];
        foreach ($jobs->fetchAll(PDO::FETCH_COLUMN) as $jobId) {
            $out[] = video_job_summary($pdo, (int) $jobId) + ['inputs' => video_production_inputs($pdo, (int) $jobId), 'candidates' => video_files($pdo, 'video_candidates', (int) $jobId), 'masters' => video_files($pdo, 'video_masters', (int) $jobId)];
        }
        $log($orderId, $staff, 'VIEW_VIDEO_JOBS');
        $ent = $pdo->prepare('SELECT id, memory_id, status, price_minor FROM video_entitlements WHERE order_id = :o ORDER BY id');
        $ent->execute([':o' => $orderId]);
        json_response(200, [
            'order_id' => $orderId, 'reference' => $row['mcb_reference'], 'entitlements' => $ent->fetchAll(), 'jobs' => $out,
            'capacity' => video_capacity($pdo), 'platform' => video_data()['platform'], 'qc_criteria' => video_data()['qc_criteria'], 'qc_optional' => video_data()['qc_optional'],
            'note' => 'Manual production: make the film on the chosen platform from these inputs and register it. No platform is connected; the audio master is a read-only reference.',
        ]);
    }

    require_method('POST');
    $multipart = str_starts_with((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data');
    $body = $multipart ? $_POST : read_json_body(16384);
    $staff = crm_staff_name(operations_line($body['staff'] ?? null, 160));
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
    }
    $action = strtoupper((string) ($body['action'] ?? ''));
    $int = static fn (string $k): int => is_int($body[$k] ?? null) ? $body[$k] : (ctype_digit((string) ($body[$k] ?? '')) ? (int) $body[$k] : 0);

    if ($action === 'SET_PERIOD_CAPACITY' || $action === 'DEFINE_PERIOD') {
        $result = db_transaction(static function (PDO $pdo) use ($action, $body, $staff): array {
            $capacity = $body['capacity'] ?? null;
            if (!is_int($capacity) || $capacity < 0 || $capacity > 10000) {
                throw new OperationsException('invalid_capacity', 'Give the capacity as a whole number.', 422);
            }
            $key = is_string($body['period_key'] ?? null) && preg_match('/^[A-Za-z0-9-]{4,32}$/', $body['period_key']) === 1 ? $body['period_key'] : null;
            if ($key === null) {
                throw new OperationsException('invalid_period', 'Give a period key (letters, digits, dashes).', 422);
            }
            if ($action === 'SET_PERIOD_CAPACITY') {
                $p = $pdo->prepare('SELECT * FROM video_capacity_periods WHERE period_key = :k FOR UPDATE');
                $p->execute([':k' => $key]);
                $period = $p->fetch();
                if ($period === false) {
                    throw new OperationsException('period_not_found', 'No such capacity period.', 404);
                }
                $used = video_period_used($pdo, (int) $period['id']);
                if ($capacity < $used) {
                    throw new OperationsException('capacity_below_use', "{$used} spaces are already held or used in this period; capacity cannot go below that.", 409);
                }
                $pdo->prepare('UPDATE video_capacity_periods SET capacity = :c WHERE id = :id')->execute([':c' => $capacity, ':id' => (int) $period['id']]);
                return ['period_key' => $key, 'capacity' => $capacity, 'in_use' => $used, 'by' => $staff];
            }
            $starts = is_string($body['starts_at'] ?? null) ? strtotime($body['starts_at'] . ' UTC') : false;
            $ends = is_string($body['ends_at'] ?? null) ? strtotime($body['ends_at'] . ' UTC') : false;
            if ($starts === false || $ends === false || $ends <= $starts || $starts <= time()) {
                throw new OperationsException('invalid_period', 'A new period must start in the future and end after it starts. Existing periods and their reservations never move.', 422);
            }
            $overlap = $pdo->prepare('SELECT COUNT(*) FROM video_capacity_periods WHERE starts_at < :e AND ends_at > :s');
            $overlap->execute([':e' => gmdate('Y-m-d H:i:s', $ends), ':s' => gmdate('Y-m-d H:i:s', $starts)]);
            if ((int) $overlap->fetchColumn() > 0) {
                throw new OperationsException('period_overlap', 'That period overlaps an existing one.', 409);
            }
            $pdo->prepare('INSERT INTO video_capacity_periods (period_key, starts_at, ends_at, capacity, model, basis, source, created_by) VALUES (:k, :s, :e, :c, :m, :b, :src, :by)')
                ->execute([':k' => $key, ':s' => gmdate('Y-m-d H:i:s', $starts), ':e' => gmdate('Y-m-d H:i:s', $ends), ':c' => $capacity, ':m' => 'DEFINED', ':b' => 'PENDING_VERIFICATION', ':src' => 'FOUNDER_DEFINED', ':by' => $staff]);
            return ['period_key' => $key, 'capacity' => $capacity];
        });
        json_response(200, ['action' => $action] + $result);
    }

    $orderId = $int('order_id');
    if ($orderId <= 0) {
        json_error(422, 'invalid_request', 'order_id is required.');
    }

    if ($action === 'REGISTER_CANDIDATE') {
        $file = $_FILES['video'] ?? null;
        $tmp = is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_OK && is_uploaded_file((string) $file['tmp_name']) ? (string) $file['tmp_name'] : null;
        if ($tmp === null) {
            json_error(422, 'video_required', 'Attach the video file you made.');
        }
        $bytes = (int) filesize($tmp);
        if ($bytes > (int) video_data()['candidate_max_bytes']) {
            json_error(413, 'video_too_large', 'That video is larger than MCB accepts.');
        }
        $dir = video_storage('candidates');
        if ($dir === null) {
            json_error(503, 'storage_unavailable', 'Private storage is not available; nothing was saved.');
        }
        $inspect = video_inspect_file($tmp);
        $stored = bin2hex(random_bytes(32));
        $result = db_transaction(static function (PDO $pdo) use ($orderId, $int, $body, $staff, $tmp, $dir, $stored, $bytes, $inspect, $log): array {
            $job = video_job_row($pdo, $int('video_job_id'), true);
            if ($job === null || (int) $job['order_id'] !== $orderId || ($body['reference'] ?? null) !== $job['mcb_reference']) {
                throw new OperationsException('video_job_not_found', 'That video job is not on this order.', 404);
            }
            if ($inspect['container'] === null) {
                throw new OperationsException('video_unreadable', 'That file is not a readable MP4 or MOV video.', 422);
            }
            if (!move_uploaded_file($tmp, $dir . '/' . $stored)) {
                throw new OperationsException('storage_unavailable', 'The video could not be saved.', 503);
            }
            @chmod($dir . '/' . $stored, 0600);
            $log($orderId, $staff, 'REGISTER_CANDIDATE', (int) $job['id']);
            return video_register_candidate($pdo, $job, $stored, $bytes, (string) hash_file('sha256', $dir . '/' . $stored), $inspect, operations_line($body['external_reference'] ?? null, 120), $staff);
        });
        json_response(200, ['order_id' => $orderId, 'action' => $action] + $result);
    }

    if ($action === 'ALLOCATE_CAPACITY') {
        $result = db_transaction(static function (PDO $pdo) use ($orderId, $int, $body, $staff): array {
            if (($body['customer_agreed'] ?? null) !== true) {
                throw new OperationsException('customer_agreement_required', 'Record that the customer agreed to their video being made in the period that has a space. Nothing is charged here.', 422);
            }
            $e = $pdo->prepare("SELECT * FROM video_entitlements WHERE id = :id AND order_id = :o AND status = 'CAPACITY_EXCEPTION' FOR UPDATE");
            $e->execute([':id' => $int('entitlement_id'), ':o' => $orderId]);
            if ($e->fetch() === false) {
                throw new OperationsException('entitlement_not_found', 'No paid video waiting for a space on this order.', 404);
            }
            $pdo->prepare("UPDATE video_entitlements SET status = 'AWAITING_PAYMENT' WHERE id = :id")->execute([':id' => $int('entitlement_id')]);
            $out = video_confirm_on_payment($pdo, $orderId);
            if ($out['reserved'] === 0) {
                throw new OperationsException('video_capacity_full', 'There is still no space this period. Nothing changed.', 409);
            }
            record_order_event($pdo, $orderId, 'VIDEO.CAPACITY_ALLOCATED', ['entitlement_id' => $int('entitlement_id'), 'by' => $staff, 'customer_agreed' => true]);
            return $out;
        });
        json_response(200, ['order_id' => $orderId, 'action' => $action] + $result);
    }

    $result = db_transaction(static fn (PDO $pdo): array => video_staff_action($pdo, $orderId, $int('video_job_id'), $action, $body, $staff));
    $emails = send_lifecycle_messages($pdo, $orderId, $result['messages']);
    unset($result['messages']);
    json_response(200, ['order_id' => $orderId, 'action' => $action, 'emails' => (object) $emails] + $result);
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB video endpoint failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be completed. Nothing was changed.');
}
