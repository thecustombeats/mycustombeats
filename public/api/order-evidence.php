<?php
/**
 * POST /api/order-evidence — add evidence to a support case from the private
 * order page (multipart).
 *
 *   token, request_id, kind (PARCEL_PHOTO | PRODUCT_PHOTO | UNBOXING_VIDEO_REFERENCE | OTHER),
 *   photo (image, up to 10 MB) or reference (text, for a video the customer keeps)
 *
 * Evidence HELPS MCB put things right quickly. It is never a condition of
 * getting help: a case without evidence is handled exactly the same, and
 * nothing here refuses or delays a case because evidence is missing.
 * Files are stored privately (random names, outside the web root) and are
 * only ever downloaded by staff, audited. Videos are not uploaded here: the
 * customer tells us where the recording is, and we ask for it if needed.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/customer-progress.php';

require_method('POST');
require_same_origin();

const MCB_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MCB_EVIDENCE_MAX_BYTES + 65536) {
    json_error(413, 'photo_too_large', 'Please choose a photo under 10 MB. If you cannot, just tell us in your message — your case is not affected.');
}
enforce_scoped_rate_limit('support-evidence', 20, 3600);

$pdo   = db();
$token = find_access_token($pdo, $_POST['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Reply to any of our emails and we will send you a new one.');
}
$orderId   = (int) $token['order_id'];
$requestId = ctype_digit((string) ($_POST['request_id'] ?? '')) ? (int) $_POST['request_id'] : 0;
$stmt = $pdo->prepare("SELECT id FROM order_service_requests WHERE id = :id AND order_id = :o AND kind <> 'QUESTION'");
$stmt->execute([':id' => $requestId, ':o' => $orderId]);
if ($stmt->fetchColumn() === false) {
    json_error(404, 'case_not_found', 'We could not find that report on your order.');
}
$kind = (string) ($_POST['kind'] ?? '');
if (!in_array($kind, fulfilment_data()['support_evidence_kinds'], true)) {
    json_error(422, 'validation_failed', 'Please choose what this is.', ['fields' => ['kind' => 'Please choose what this is.']]);
}

$storedName = null;
$mime = null;
$size = null;
$sha = null;
$reference = operations_text($_POST['reference'] ?? null, 500);
$file = $_FILES['photo'] ?? null;
$hasFile = is_array($file) && !is_array($file['error'] ?? null) && ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

if ($kind === 'UNBOXING_VIDEO_REFERENCE' || !$hasFile) {
    if ($reference === null) {
        json_error(422, 'validation_failed', 'Add a photo, or tell us briefly where the recording or photo is.', ['fields' => ['reference' => 'Tell us briefly where it is.']]);
    }
} else {
    if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        json_error(413, 'photo_too_large', 'Please choose a photo under 10 MB.');
    }
    if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
        json_error(422, 'photo_required', 'Please choose a photo.');
    }
    $tmp  = (string) $file['tmp_name'];
    $size = (int) filesize($tmp);
    if ($size < 1 || $size > MCB_EVIDENCE_MAX_BYTES) {
        json_error(413, 'photo_too_large', 'Please choose a photo under 10 MB.');
    }
    // Malware scan, when the host provides a scanner (lib/uploads.php). When none
    // is configured this is a no-op and MCB says so in readiness rather than
    // implying a protection it does not have. A scanner that refuses the file
    // fails closed.
    $scan = upload_scan_result($tmp);
    if ($scan !== null && !$scan['clean']) {
        json_error(415, 'photo_type_not_accepted', "We couldn't accept that file. Please choose a different photo.");
    }
    $image = inspect_uploaded_image($tmp, $size);
    if ($image === null) {
        json_error(415, 'photo_type_not_accepted', 'Please choose a JPEG, PNG, WebP or HEIC photo.');
    }
    $base = upload_directory();
    $dir  = $base === null ? null : $base . '/support';
    if ($dir === null || (!is_dir($dir) && !@mkdir($dir, 0700, true))) {
        json_error(503, 'storage_unavailable', "We couldn't save your photo just now. Your report is safe with us — please try again later or reply to our email.");
    }
    $storedName = bin2hex(random_bytes(32));
    if (!move_uploaded_file($tmp, $dir . '/' . $storedName)) {
        json_error(503, 'storage_unavailable', "We couldn't save your photo just now. Your report is safe with us — please try again later or reply to our email.");
    }
    @chmod($dir . '/' . $storedName, 0600);
    $sha  = hash_file('sha256', $dir . '/' . $storedName);
    $mime = $image['mime'];
}

$pdo->prepare(
    'INSERT INTO support_evidence (order_id, service_request_id, kind, stored_name, mime_type, byte_size, sha256, reference_text, ip_hash, created_at)
     VALUES (:o, :r, :k, :n, :m, :s, :sha, :ref, :ip, UTC_TIMESTAMP())'
)->execute([':o' => $orderId, ':r' => $requestId, ':k' => $kind, ':n' => $storedName, ':m' => $mime, ':s' => $size, ':sha' => $sha, ':ref' => $reference, ':ip' => hash_ip(client_ip())]);
record_order_event_safely($pdo, $orderId, 'SUPPORT.EVIDENCE_ADDED', ['request_id' => $requestId, 'kind' => $kind, 'file' => $storedName !== null]);

json_response(201, ['received' => true, 'message' => 'Thank you — that has been added to your report. We will be in touch.']);
