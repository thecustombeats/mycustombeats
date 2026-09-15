<?php
/**
 * /api/crm/artwork — production artwork for one order. CRM key required.
 *
 * GET  ?order_id=41                     the plan (refreshed): each component, its
 *                                       template (size, bleed, spine, centre
 *                                       hole and creative exclusion), its source
 *                                       photograph and any registered output
 * GET  ?artwork_id=7&download=1         the registered output file
 * POST multipart/form-data              register a production output:
 *        order_id, artwork_id, reference (MCB-…), template_id, template_version,
 *        staff, output (file);
 *        manual_template_confirmed=true  required for a TEMPLATE_REQUIRED component
 *        exception_reviewed=true         required for a component in EXCEPTION
 *        manual_source=true              no customer photograph on record (legacy)
 *
 * The output is checked automatically for presence, type, exact dimensions or
 * square shape (per template), order/reference association, source
 * association and template version. A failure is refused with the checks and
 * nothing is stored. A pass marks the component READY (ARTWORK.READY).
 *
 * Nothing here generates, edits or sends artwork anywhere, and nothing is
 * ordered from a supplier.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/artwork.php';

require_crm_key();

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $artworkId = ctype_digit((string) ($_GET['artwork_id'] ?? '')) ? (int) $_GET['artwork_id'] : 0;
    if ($artworkId > 0 && ($_GET['download'] ?? '') === '1') {
        $stmt = $pdo->prepare('SELECT output_stored_name, output_mime FROM order_artwork WHERE id = :id');
        $stmt->execute([':id' => $artworkId]);
        $row = $stmt->fetch();
        $dir = artwork_output_directory();
        $name = $row === false ? '' : (string) $row['output_stored_name'];
        $path = $dir === null || preg_match('/^[a-f0-9]{64}$/', $name) !== 1 ? null : $dir . '/' . $name;
        if ($path === null || !is_file($path)) {
            json_error(404, 'not_found', 'No output is registered for that artwork.');
        }
        $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/tiff' => 'tif'][$row['output_mime']] ?? 'bin';
        http_response_code(200);
        header('Content-Type: ' . $row['output_mime']);
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: attachment; filename="mcb-artwork-' . $artworkId . '.' . $ext . '"');
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        header('Cache-Control: no-store');
        readfile($path);
        exit;
    }

    $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
    if ($orderId <= 0) {
        json_error(422, 'invalid_request', 'An order id is required.');
    }
    try {
        $rows = db_transaction(fn (PDO $pdo): array => plan_order_artwork($pdo, $orderId));
    } catch (OperationsException $e) {
        json_error($e->httpStatus, $e->errorCode, $e->getMessage());
    }
    json_response(200, [
        'order_id'      => $orderId,
        'source_rule'   => ['min_px' => (int) artwork_data()['source_min_px'], 'square_tolerance' => 0.01],
        'components'    => artwork_view($rows),
        'blocking'      => count(artwork_blocking_rows($rows)),
    ]);
}

require_method('POST');

$field = static fn (string $name): string => is_string($_POST[$name] ?? null) ? trim($_POST[$name]) : '';
$orderId   = ctype_digit($field('order_id')) ? (int) $field('order_id') : 0;
$artworkId = ctype_digit($field('artwork_id')) ? (int) $field('artwork_id') : 0;
$staff     = operations_line($field('staff'), 160);
$reference = preg_match('/^MCB-\d{4}-\d{6}$/', $field('reference')) === 1 ? $field('reference') : null;
$claimTpl  = preg_match('/^[A-Z0-9_]{3,40}$/', $field('template_id')) === 1 ? $field('template_id') : null;
$claimVer  = ctype_digit($field('template_version')) ? (int) $field('template_version') : null;

if ($orderId <= 0 || $artworkId <= 0) {
    json_error(422, 'invalid_request', 'order_id and artwork_id are required.');
}
if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}

$file = $_FILES['output'] ?? null;
$tmp  = is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_OK && is_uploaded_file((string) $file['tmp_name']) ? (string) $file['tmp_name'] : null;
$size = is_array($file) ? (int) ($file['size'] ?? 0) : 0;
$maxBytes = (int) mcb_setting('artwork.max_output_bytes', 10 * 1024 * 1024);
if ($tmp !== null && $size > $maxBytes) {
    json_error(413, 'output_too_large', 'That output file is larger than the configured limit.');
}

try {
    $result = db_transaction(function (PDO $pdo) use ($orderId, $artworkId, $staff, $reference, $claimTpl, $claimVer, $tmp, $size): array {
        $order = operations_order_row($pdo, $orderId, true);
        if ($order === null) {
            throw new OperationsException('order_not_found', 'No such order.', 404);
        }
        if ($order['status'] !== 'PAID') {
            throw new OperationsException('order_not_paid', 'Artwork is registered only for a paid order.');
        }
        $stage = (string) ($order['stage'] ?? 'CREATIVE');
        if ($stage !== 'CREATIVE' && !in_array($stage, MCB_QC_PENDING_STAGES, true)) {
            throw new OperationsException('invalid_transition', 'Artwork can be registered while the order is being created or checked. Reopen it first to replace artwork after the quality check.');
        }
        plan_order_artwork($pdo, $orderId);

        $stmt = $pdo->prepare(
            'SELECT a.*, u.order_id AS source_order_id
               FROM order_artwork a LEFT JOIN order_uploads u ON u.id = a.source_upload_id
              WHERE a.id = :id FOR UPDATE'
        );
        $stmt->execute([':id' => $artworkId]);
        $row = $stmt->fetch();
        // Another order's artwork id is refused exactly like an unknown one.
        if ($row === false || (int) $row['order_id'] !== $orderId) {
            throw new OperationsException('artwork_not_found', 'No such artwork component on this order.', 404);
        }
        $template = artwork_template((string) $row['template_id']);
        if ($template === null) {
            throw new OperationsException('template_unknown', 'This component\'s template is no longer in the specification.', 409);
        }
        $manualTemplate = $row['status'] === 'TEMPLATE_REQUIRED';
        if ($manualTemplate && ($_POST['manual_template_confirmed'] ?? '') !== 'true') {
            throw new OperationsException('manual_template_confirmation_required',
                'No manufacturer template is on record for this format. Confirm the artwork was prepared by hand to the manufacturer\'s own dieline.', 422);
        }
        if ($row['status'] === 'EXCEPTION' && ($_POST['exception_reviewed'] ?? '') !== 'true') {
            throw new OperationsException('artwork_exception_unreviewed', 'This component is an artwork exception. Review it internally, then confirm the review when registering the output.', 422);
        }
        $manualSource = ($_POST['manual_source'] ?? '') === 'true';
        if ($row['status'] === 'AWAITING_INPUT' && !$manualSource) {
            throw new OperationsException('artwork_source_missing', 'No customer photograph is on record for this component.', 422);
        }

        $inspected = inspect_artwork_output($tmp, $size);
        $qc = artwork_output_qc(
            $template,
            ['order_id' => $orderId, 'reference' => $order['mcb_reference'], 'template_id' => (string) $row['template_id'],
             'template_version' => (int) $row['template_version'],
             'source_upload_id' => $row['source_upload_id'] === null ? null : (int) $row['source_upload_id'],
             'source_order_id' => $row['source_order_id'] === null ? null : (int) $row['source_order_id']],
            $inspected,
            ['order_id' => $orderId, 'reference' => $reference, 'template_id' => $claimTpl, 'template_version' => $claimVer, 'manual_source' => $manualSource]
        );
        if (!$qc['passed']) {
            return ['passed' => false, 'qc' => $qc, 'row' => $row];
        }

        $dir = artwork_output_directory();
        if ($dir === null) {
            throw new OperationsException('storage_unavailable', 'Private storage is not available; the output was not saved.', 503);
        }
        $name = bin2hex(random_bytes(32));
        if (!move_uploaded_file((string) $tmp, $dir . '/' . $name)) {
            throw new OperationsException('storage_unavailable', 'The output could not be saved.', 503);
        }
        @chmod($dir . '/' . $name, 0600);
        $previous = $row['output_stored_name'];

        $pdo->prepare(
            "UPDATE order_artwork
                SET status = 'READY', output_stored_name = :name, output_mime = :mime, output_width = :w, output_height = :h,
                    output_byte_size = :size, output_sha256 = :sha, manual = :manual, qc_result = :qc,
                    ready_at = UTC_TIMESTAMP(), ready_by = :by
              WHERE id = :id"
        )->execute([
            ':name' => $name, ':mime' => $inspected['mime'], ':w' => $inspected['width'], ':h' => $inspected['height'],
            ':size' => $size, ':sha' => hash_file('sha256', $dir . '/' . $name), ':manual' => ($manualTemplate || $manualSource) ? 1 : 0,
            ':qc' => json_encode($qc['checks'], JSON_UNESCAPED_SLASHES), ':by' => $staff, ':id' => $artworkId,
        ]);
        record_order_event($pdo, $orderId, 'ARTWORK.READY', [
            'artwork_id' => $artworkId, 'template' => $row['template_id'], 'version' => (int) $row['template_version'],
            'manual' => $manualTemplate || $manualSource, 'by' => $staff,
        ], "artwork-ready:{$artworkId}:" . substr(hash_file('sha256', $dir . '/' . $name), 0, 16));

        if (is_string($previous) && preg_match('/^[a-f0-9]{64}$/', $previous) === 1) {
            @unlink($dir . '/' . $previous);
        }
        return ['passed' => true, 'qc' => $qc, 'row' => $row];
    });
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB artwork registration failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
}

if (!$result['passed']) {
    record_order_event_safely($pdo, $orderId, 'ARTWORK.QC_FAILED', [
        'artwork_id' => $artworkId, 'template' => $result['row']['template_id'], 'failures' => implode(',', $result['qc']['failures']), 'by' => $staff,
    ]);
    json_error(422, 'artwork_qc_failed', 'The output did not pass the automated artwork checks: '
        . strtolower(str_replace('_', ' ', implode(', ', $result['qc']['failures']))) . '. Nothing was stored.', ['checks' => $result['qc']['checks']]);
}

json_response(200, [
    'order_id'   => $orderId,
    'artwork_id' => $artworkId,
    'status'     => 'READY',
    'checks'     => $result['qc']['checks'],
    'components' => artwork_view(order_artwork_rows($pdo, $orderId)),
]);
