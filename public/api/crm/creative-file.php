<?php
/**
 * /api/crm/creative-file — creative audio for staff. CRM key required.
 *
 * POST multipart action=REGISTER_CANDIDATE
 *   order_id, reference (MCB-…), job_id, staff, audio (file);
 *   optional: attempt_number (the attempt the file is for), provider_model,
 *   provider_generation_id, transcript (what was actually sung)
 *   → opens a MANUAL generation attempt (the provider decision is DEFERRED),
 *     runs technical QC and objective fact QC.
 *
 * POST multipart action=REGISTER_DERIVED_MASTER
 *   order_id, reference, job_id, staff, kind (CUSTOMER_LISTENING_COPY |
 *   PHYSICAL_MEDIA_MASTER), derived_from_master_id, conversion_note, audio
 *   → a new version with its lineage. MCB never transcodes automatically.
 *
 * GET ?candidate_id=|master_id=&staff=Name  the file (download, audited)
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/creative-factory.php';

require_crm_key();

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $staff = operations_line($_GET['staff'] ?? null, 160);
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is downloading, so access is audited.');
    }
    $isMaster = ctype_digit((string) ($_GET['master_id'] ?? ''));
    $id = (int) ($isMaster ? $_GET['master_id'] : ($_GET['candidate_id'] ?? 0));
    $stmt = $pdo->prepare('SELECT order_id, stored_name, container FROM ' . ($isMaster ? 'creative_masters' : 'creative_candidates') . ' WHERE id = :id');
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    $dir = creative_audio_directory();
    $path = $row === false || $dir === null || preg_match('/^[a-f0-9]{64}$/', (string) $row['stored_name']) !== 1 ? null : $dir . '/' . $row['stored_name'];
    if ($path === null || !is_file($path)) {
        json_error(404, 'not_found', 'No such audio.');
    }
    $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')
        ->execute([':o' => (int) $row['order_id'], ':s' => $staff, ':a' => $isMaster ? 'DOWNLOAD_MASTER' : 'DOWNLOAD_CANDIDATE']);
    $ext = ['WAV' => 'wav', 'FLAC' => 'flac', 'AIFF' => 'aiff', 'MP3' => 'mp3'][$row['container']] ?? 'bin';
    http_response_code(200);
    header('Content-Type: application/octet-stream');
    header('Content-Length: ' . (string) filesize($path));
    header('Content-Disposition: attachment; filename="mcb-' . ($isMaster ? 'master' : 'candidate') . "-{$id}.{$ext}\"");
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; sandbox");
    header('Cache-Control: no-store');
    readfile($path);
    exit;
}

require_method('POST');

$field = static fn (string $name): ?string => is_string($_POST[$name] ?? null) && trim($_POST[$name]) !== '' ? trim($_POST[$name]) : null;
$action = strtoupper((string) $field('action'));
$orderId = ctype_digit((string) $field('order_id')) ? (int) $field('order_id') : 0;
$jobId = ctype_digit((string) $field('job_id')) ? (int) $field('job_id') : 0;
$staff = operations_line($field('staff'), 160);
$reference = $field('reference');
if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}
if ($orderId <= 0 || $jobId <= 0) {
    json_error(422, 'invalid_request', 'order_id and job_id are required.');
}

$file = $_FILES['audio'] ?? null;
$tmp = is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_OK && is_uploaded_file((string) $file['tmp_name']) ? (string) $file['tmp_name'] : null;
$size = $tmp === null ? 0 : (int) $file['size'];
$dir = creative_audio_directory();
if ($dir === null) {
    json_error(503, 'storage_unavailable', 'Private storage is not available; nothing was saved.');
}

try {
    $result = db_transaction(function (PDO $pdo) use ($action, $orderId, $jobId, $staff, $reference, $field, $tmp, $size, $dir): array {
        $job = creative_job_row($pdo, $jobId, true);
        if ($job === null || (int) $job['order_id'] !== $orderId) {
            throw new OperationsException('job_not_found', 'No such creative job on this order.', 404);
        }
        // Store the bytes privately first (random name); the database row records provenance.
        $stored = null;
        $sha = null;
        $audio = creative_inspect_audio(null, 0);
        if ($tmp !== null) {
            $stored = bin2hex(random_bytes(32));
            if (!move_uploaded_file($tmp, $dir . '/' . $stored)) {
                throw new OperationsException('storage_unavailable', 'The audio could not be saved.', 503);
            }
            @chmod($dir . '/' . $stored, 0600);
            $sha = hash_file('sha256', $dir . '/' . $stored);
            $audio = creative_inspect_audio($dir . '/' . $stored, $size);
        }
        $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')
            ->execute([':o' => $orderId, ':s' => $staff, ':a' => $action === 'REGISTER_CANDIDATE' ? 'REGISTER_CANDIDATE' : 'REGISTER_DERIVED_MASTER']);

        if ($action === 'REGISTER_CANDIDATE') {
            $opened = creative_open_attempt($pdo, $job, 'manual', ['provider_model' => $field('provider_model'), 'provider_generation_id' => $field('provider_generation_id')], $staff);
            if (isset($opened['refused'])) {
                if ($stored !== null) {
                    @unlink($dir . '/' . $stored);
                }
                return $opened;
            }
            $claimedAttempt = ctype_digit((string) $field('attempt_number')) ? (int) $field('attempt_number') : null;
            $transcript = $field('transcript');
            return creative_register_candidate($pdo, creative_job_row($pdo, $jobId), $opened, $stored ?? str_repeat('0', 64), $size, $sha ?? '', $audio,
                $transcript === null ? null : mb_substr($transcript, 0, 20000),
                ['order_id' => $orderId, 'reference' => $reference, 'job_id' => $jobId, 'attempt_number' => $claimedAttempt ?? $opened['attempt_number']]
            ) + ['attempt_number' => $opened['attempt_number']];
        }

        if ($action === 'REGISTER_DERIVED_MASTER') {
            $kind = $field('kind');
            $from = ctype_digit((string) $field('derived_from_master_id')) ? (int) $field('derived_from_master_id') : 0;
            $note = operations_line($field('conversion_note'), 255);
            if (!in_array($kind, ['CUSTOMER_LISTENING_COPY', 'PHYSICAL_MEDIA_MASTER'], true) || $note === null) {
                throw new OperationsException('invalid_request', 'Give the kind (customer listening copy or physical media master) and a conversion note.', 422);
            }
            $stmt = $pdo->prepare("SELECT * FROM creative_masters WHERE id = :id AND job_id = :j AND kind = 'PRODUCTION_MASTER'");
            $stmt->execute([':id' => $from, ':j' => $jobId]);
            $parent = $stmt->fetch();
            if ($parent === false) {
                throw new OperationsException('master_not_found', 'A derived file must name this song\'s production master.', 404);
            }
            if ($stored === null) {
                throw new OperationsException('audio_required', 'Attach the derived audio file.', 422);
            }
            $technical = creative_technical_qc($audio, $size, $sha, ['order_id' => $orderId, 'reference' => $job['mcb_reference'], 'job_id' => $jobId, 'attempt_number' => 0],
                ['order_id' => $orderId, 'reference' => $reference, 'job_id' => $jobId, 'attempt_number' => 0]);
            // A listening copy may be lossy and shorter-header formats (MP3) have no readable duration: only identity, readability and ceiling apply.
            $required = $kind === 'PHYSICAL_MEDIA_MASTER'
                ? array_keys($technical['checks'])
                : ['FILE_EXISTS', 'FILE_READABLE', 'SUPPORTED_TYPE', 'FILE_SIZE', 'HASH_RECORDED', 'ORDER_MATCH', 'JOB_MATCH'];
            $failed = array_values(array_filter($required, static fn (string $k): bool => $technical['checks'][$k] !== 'PASS'));
            if ($failed !== []) {
                @unlink($dir . '/' . $stored);
                throw new OperationsException('derived_master_qc_failed', 'The derived file failed technical checks: ' . strtolower(str_replace('_', ' ', implode(', ', $failed))) . '.', 422);
            }
            $id = creative_store_master($pdo, $job, $kind, [
                'stored_name' => $stored, 'container' => $audio['container'], 'sha256' => $sha, 'byte_size' => $size,
                'duration_ms' => $audio['duration_ms'], 'sample_rate_hz' => $audio['sample_rate_hz'], 'channels' => $audio['channels'],
            ], null, (int) $parent['id'], $note, ['technical' => $technical, 'derived_from' => ['master_id' => (int) $parent['id'], 'version' => (int) $parent['version'], 'sha256' => $parent['sha256']], 'transcoded_by_mcb' => false], $staff);
            if ($kind === 'PHYSICAL_MEDIA_MASTER' && creative_album_row($pdo, (int) $job['album_id'])['capacity_status'] !== 'NOT_APPLICABLE') {
                creative_evaluate_album($pdo, (int) $job['album_id'], $staff);
            }
            return ['master_id' => $id, 'kind' => $kind, 'checks' => $technical['checks']];
        }
        throw new OperationsException('unknown_action', 'Use REGISTER_CANDIDATE or REGISTER_DERIVED_MASTER.', 422);
    });
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB creative file ' . $action . ' failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
}

if (isset($result['refused'])) {
    json_error(409, 'retry_limit_reached', "This song has used its {$result['allowed']} generation attempts. It is now a creative exception for a person to review.");
}
json_response(200, ['order_id' => $orderId, 'job_id' => $jobId] + $result);
