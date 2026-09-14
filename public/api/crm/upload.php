<?php
/**
 * GET /api/crm/upload?id=<32 hex> — one customer photo, for staff.
 *
 * CRM key required. The id is the opaque public id from
 * /api/crm/order-personalisation; the storage name never leaves the server.
 *
 * Served as a download with no-sniff and a sandboxing CSP, so even a file that
 * slipped past inspection cannot run as a page.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';

require_method('GET');
require_crm_key();

$id = (string) ($_GET['id'] ?? '');
if (preg_match('/^[a-f0-9]{32}$/', $id) !== 1) {
    json_error(422, 'invalid_request', 'A valid photo id is required.');
}

$stmt = db()->prepare('SELECT stored_name, mime_type, byte_size FROM order_uploads WHERE public_id = :id');
$stmt->execute([':id' => $id]);
$upload = $stmt->fetch();
if ($upload === false || preg_match('/^[a-f0-9]{64}$/', (string) $upload['stored_name']) !== 1) {
    json_error(404, 'not_found', 'No such photo.');
}

$directory = upload_directory();
$path = $directory === null ? null : $directory . '/' . $upload['stored_name'];
if ($path === null || !is_file($path)) {
    error_log('MCB uploads: a recorded photo is missing from storage.');
    json_error(404, 'not_found', 'No such photo.');
}

$extension = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/heic' => 'heic', 'image/heif' => 'heif'][$upload['mime_type']] ?? 'bin';

http_response_code(200);
header('Content-Type: ' . $upload['mime_type']);
header('Content-Length: ' . (string) filesize($path));
header('Content-Disposition: attachment; filename="mcb-photo-' . $id . '.' . $extension . '"');
header('X-Content-Type-Options: nosniff');
header("Content-Security-Policy: default-src 'none'; sandbox");
header('Cache-Control: no-store');
header('Referrer-Policy: no-referrer');
readfile($path);
