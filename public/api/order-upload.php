<?php
/**
 * POST /api/order-upload — attach a customer photo to a saved order.
 *
 * multipart/form-data:
 *   orderId, checkoutToken   the order this belongs to, authorised as for checkout
 *   slot                     "memory:<unit>:<song>" or "plaque:<n>", as listed
 *                            in the order response's upload_slots
 *   photo                    the image
 *
 * Only a PENDING order accepts photos, and only for a slot the order expects:
 * a memory whose customer said they would add one, or a plaque. Sending a new
 * photo for a slot replaces the previous one.
 *
 * RESPONSE 201 { slot, personalisation_status, missing_uploads, checkout_blocker }
 * — no file name, path or storage identifier.
 *
 * Deliberately named order-upload rather than order/upload: a directory at
 * api/order/ would stop the clean-URL rewrite finding api/order.php.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('POST');
require_same_origin();

$maxBytes = (int) personalisation_data()['uploads']['max_bytes'];

// The whole request is bounded before PHP's own limits are relied on.
if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > $maxBytes + 65536) {
    json_error(413, 'photo_too_large', 'Please choose a photo under 10 MB.');
}

$ipHash = hash_ip(client_ip());
// Sixty photos an hour from one source: a 12-chapter Journey with a photo on
// every chapter, re-chosen several times, stays well inside it.
enforce_rate_limit('order_uploads', 'ip_hash', $ipHash, 60, 3600);

$order = find_order_by_token(db(), $_POST['orderId'] ?? null, $_POST['checkoutToken'] ?? null);
if ($order === null) {
    json_error(404, 'order_not_found', 'We could not find that order.');
}
if ($order['status'] !== 'PENDING') {
    json_error(409, 'order_not_editable', 'Photos can no longer be added to this order.');
}

/**
 * Private storage outside the web root, or no upload at all. Checked once the
 * order is authorised and before any file is read or written, so a server
 * without it stores nothing, and the customer is told so without a path or a
 * technical detail.
 */
const MCB_STORAGE_UNAVAILABLE = "We couldn't securely save your photo. Please try again shortly.";
$directory = upload_directory();
if ($directory === null) {
    json_error(503, 'photo_storage_unavailable', MCB_STORAGE_UNAVAILABLE);
}

$slot = (string) ($_POST['slot'] ?? '');
$target = null;
if (preg_match('/^memory:([1-9]\d{0,1}):([1-9]\d{0,1})$/', $slot, $m) === 1) {
    $stmt = db()->prepare(
        "SELECT m.id FROM order_memories m JOIN order_units u ON u.id = m.unit_id
          WHERE m.order_id = :oid AND u.kind = 'SONG' AND u.unit_index = :u AND m.sequence = :s AND m.photo_requested = 1"
    );
    $stmt->execute([':oid' => (int) $order['id'], ':u' => (int) $m[1], ':s' => (int) $m[2]]);
    $id = $stmt->fetchColumn();
    $target = $id === false ? null : ['column' => 'memory_id', 'id' => (int) $id];
} elseif (preg_match('/^plaque:([1-9]\d{0,1})$/', $slot, $m) === 1) {
    $stmt = db()->prepare("SELECT id FROM order_units WHERE order_id = :oid AND kind = 'PLAQUE' AND unit_index = :u");
    $stmt->execute([':oid' => (int) $order['id'], ':u' => (int) $m[1]]);
    $id = $stmt->fetchColumn();
    $target = $id === false ? null : ['column' => 'unit_id', 'id' => (int) $id];
}
if ($target === null) {
    json_error(422, 'unexpected_photo', 'That photo does not belong to anything in this order.');
}

$file = $_FILES['photo'] ?? null;
if (!is_array($file) || is_array($file['error'] ?? null)) {
    json_error(422, 'photo_required', 'Please choose a photo.');
}
if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
    json_error(413, 'photo_too_large', 'Please choose a photo under 10 MB.');
}
if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file((string) $file['tmp_name'])) {
    json_error(422, 'photo_required', 'Please choose a photo.');
}

$tmp  = (string) $file['tmp_name'];
$size = (int) filesize($tmp);
if ($size < 1) {
    json_error(422, 'photo_required', 'Please choose a photo.');
}
if ($size > $maxBytes) {
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

/**
 * ARTWORK-READY PHOTOGRAPHS (Single Creative Authority). Keepsake and Journey
 * artwork is created by MCB from the customer's photograph, so a memory photo
 * on those orders must be square (within 1%) and at least 2500 × 2500 pixels —
 * larger is welcome — unless the order already includes the MCB Artwork
 * Preparation Service, chosen by the customer before payment. A photo whose
 * size cannot be read (HEIC) cannot be confirmed as artwork-ready.
 */
if ($target['column'] === 'memory_id' && !artwork_photo_is_acceptable(db(), (int) $order['id'], $image)) {
    json_error(422, 'photo_not_artwork_ready', 'This photograph is not artwork-ready: please choose a square photo of at least 2500 × 2500 pixels, or add the MCB Artwork Preparation Service before you pay.');
}


$storedName = bin2hex(random_bytes(32));
$destination = $directory . '/' . $storedName;
if (!move_uploaded_file($tmp, $destination)) {
    error_log('MCB uploads: could not move an uploaded photo into storage.');
    json_error(503, 'photo_storage_unavailable', MCB_STORAGE_UNAVAILABLE);
}
@chmod($destination, 0640);

$orderId = (int) $order['id'];
$replaced = null;

try {
    $status = db_transaction(function (PDO $pdo) use ($orderId, $target, $storedName, $image, $size, $destination, $ipHash, &$replaced): string {
        // Serialise uploads for one order, so completeness is decided once.
        $pdo->prepare('SELECT id FROM orders WHERE id = :id FOR UPDATE')->execute([':id' => $orderId]);

        $column = $target['column'];   // 'memory_id' or 'unit_id', chosen above, never from the request
        $old = $pdo->prepare("SELECT id, stored_name FROM order_uploads WHERE {$column} = :tid");
        $old->execute([':tid' => $target['id']]);
        $previous = $old->fetch();
        if ($previous !== false) {
            $pdo->prepare('DELETE FROM order_uploads WHERE id = :id')->execute([':id' => (int) $previous['id']]);
            $replaced = (string) $previous['stored_name'];
        }

        $pdo->prepare(
            "INSERT INTO order_uploads
                (public_id, order_id, {$column}, stored_name, mime_type, byte_size, width, height, sha256, ip_hash)
             VALUES (:pub, :oid, :tid, :name, :mime, :bytes, :w, :h, :sha, :ip)"
        )->execute([
            ':pub'   => bin2hex(random_bytes(16)),
            ':oid'   => $orderId,
            ':tid'   => $target['id'],
            ':name'  => $storedName,
            ':mime'  => $image['mime'],
            ':bytes' => $size,
            ':w'     => $image['width'],
            ':h'     => $image['height'],
            ':sha'   => hash_file('sha256', $destination),
            ':ip'    => $ipHash,
        ]);

        record_order_event($pdo, $orderId, 'UPLOAD.ATTACHED', ['kind' => $column === 'memory_id' ? 'memory' : 'plaque', 'bytes' => $size]);

        $slots = order_upload_slots($pdo, $orderId);
        $current = $pdo->prepare('SELECT personalisation_status FROM orders WHERE id = :id');
        $current->execute([':id' => $orderId]);
        $status = (string) $current->fetchColumn();

        if ($slots['missing'] === [] && $status === 'AWAITING_UPLOADS') {
            $pdo->prepare("UPDATE orders SET personalisation_status = 'COMPLETE' WHERE id = :id")->execute([':id' => $orderId]);
            record_order_event($pdo, $orderId, 'PERSONALISATION.COMPLETE', [], 'personalisation-complete');
            $status = 'COMPLETE';
        }
        return $status;
    });
} catch (Throwable $e) {
    @unlink($destination);
    error_log('MCB uploads: could not record an uploaded photo: ' . $e->getMessage());
    json_error(503, 'service_unavailable', 'We could not save your photo just now. Please try again.');
}

if ($replaced !== null) {
    @unlink($directory . '/' . $replaced);
}

$summary = order_public_summary(db(), (array) find_order_row(db(), $orderId));

json_response(201, [
    'slot'                   => $slot,
    'personalisation_status' => $status,
    'missing_uploads'        => $summary['missing_uploads'],
    'checkout_blocker'       => $summary['checkout_blocker'],
]);
