<?php
/**
 * Photographs for a customer's Memory Music Video, from the private order page.
 *
 * POST multipart: token, videoJobId, rightsConfirmed=yes, photo
 *   → stores one photograph privately (random name, outside the web root).
 * POST JSON { token, videoJobId, action: "PHOTOGRAPHS_DONE" }
 *   → the customer has added what they want; MCB can prepare the film.
 *
 * Separate from the square print-artwork rule: landscape and portrait
 * photographs are welcome. The customer confirms they have the right to
 * provide them for MCB's private use — which is NOT permission for public or
 * marketing use (that is recorded separately, if ever given).
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/video.php';

require_method('POST');
require_same_origin();

$policy = video_data()['media_policy'];
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > (int) $policy['max_bytes_per_file'] + 65536) {
    json_error(413, 'photo_too_large', 'Please choose a photo under ' . (int) ((int) $policy['max_bytes_per_file'] / 1048576) . ' MB.');
}
enforce_scoped_rate_limit('video-media', 120, 3600);

$pdo = db();
$isJson = str_starts_with((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json');
$body = $isJson ? read_json_body(2048) : $_POST;
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Reply to any of our emails and we will send you a new one.');
}
$orderId = (int) $token['order_id'];
$jobId = is_int($body['videoJobId'] ?? null) ? $body['videoJobId'] : (ctype_digit((string) ($body['videoJobId'] ?? '')) ? (int) $body['videoJobId'] : 0);
$job = video_job_row($pdo, $jobId);
if ($job === null || (int) $job['order_id'] !== $orderId) {
    json_error(404, 'video_not_found', 'We could not find that video on your order.');
}
if ($job['status'] !== 'INPUT_REQUIRED') {
    json_error(409, 'photographs_closed', 'Thank you — we already have what we need to make your video.');
}

if ($isJson) {
    if (($body['action'] ?? null) !== 'PHOTOGRAPHS_DONE') {
        json_error(422, 'invalid_action', 'That action is not recognised.');
    }
    db_transaction(static function (PDO $pdo) use ($jobId): void {
        video_set_job($pdo, $jobId, ['inputs_confirmed_at' => gmdate('Y-m-d H:i:s'), 'inputs_confirmed_by' => 'CUSTOMER']);
        video_refresh_job($pdo, $jobId);
    });
    json_response(200, ['received' => true, 'message' => 'Thank you. We have your photographs and will make your Memory Music Video.']);
}

if (($body['rightsConfirmed'] ?? null) !== 'yes') {
    json_error(422, 'validation_failed', 'Please confirm you have the right to provide these photographs.', ['fields' => ['rightsConfirmed' => 'Please confirm you have the right to provide these photographs.']]);
}
$count = $pdo->prepare('SELECT COUNT(*) FROM video_media WHERE video_job_id = :j');
$count->execute([':j' => $jobId]);
if ((int) $count->fetchColumn() >= (int) $policy['max_files']) {
    json_error(422, 'too_many_photographs', 'You have added the most photographs we can use for one video (' . (int) $policy['max_files'] . ').');
}
$file = $_FILES['photo'] ?? null;
if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
    json_error(422, 'photo_required', 'Please choose a photo.');
}
$tmp = (string) $file['tmp_name'];
$size = (int) filesize($tmp);
if ($size < 1 || $size > (int) $policy['max_bytes_per_file']) {
    json_error(413, 'photo_too_large', 'Please choose a smaller photo.');
}
$image = inspect_uploaded_image($tmp, $size);
if ($image === null || !in_array($image['mime'], $policy['accepted_types'], true)) {
    json_error(415, 'photo_type_not_accepted', 'Please choose a JPEG, PNG, WebP or HEIC photo.');
}
if ($image['width'] !== null && min($image['width'], $image['height']) < (int) $policy['min_short_edge_px']) {
    json_error(422, 'photo_too_small', 'This photo is too small to look good in a film. Please choose one at least ' . (int) $policy['min_short_edge_px'] . ' pixels on its shorter side.');
}
$dir = video_storage('media');
if ($dir === null) {
    json_error(503, 'storage_unavailable', "We couldn't save your photo just now. Please try again shortly.");
}
$stored = bin2hex(random_bytes(32));
if (!move_uploaded_file($tmp, $dir . '/' . $stored)) {
    json_error(503, 'storage_unavailable', "We couldn't save your photo just now. Please try again shortly.");
}
@chmod($dir . '/' . $stored, 0600);
$publicId = bin2hex(random_bytes(16));
$pdo->prepare('INSERT INTO video_media (public_id, order_id, video_job_id, stored_name, mime_type, byte_size, width, height, sha256, rights_confirmed_at, rights_statement_sha256, ip_hash)
               VALUES (:p, :o, :j, :n, :m, :b, :w, :h, :sha, UTC_TIMESTAMP(), :rs, :ip)')
    ->execute([':p' => $publicId, ':o' => $orderId, ':j' => $jobId, ':n' => $stored, ':m' => $image['mime'], ':b' => $size, ':w' => $image['width'], ':h' => $image['height'],
        ':sha' => hash_file('sha256', $dir . '/' . $stored), ':rs' => hash('sha256', (string) video_data()['media_rights_statement']), ':ip' => hash_ip(client_ip())]);
record_order_event_safely($pdo, $orderId, 'VIDEO.MEDIA_ADDED', ['video_job_id' => $jobId]);
$count->execute([':j' => $jobId]);
json_response(201, ['received' => true, 'photographs' => (int) $count->fetchColumn()]);
