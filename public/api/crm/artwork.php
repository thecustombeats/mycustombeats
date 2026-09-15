<?php
/**
 * /api/crm/artwork — production artwork components for one order. CRM key required.
 *
 * GET  ?order_id=41                     the plan (refreshed): each component, its
 *                                       template (size, bleed, spine, centre
 *                                       hole and creative exclusion), its source
 *                                       photograph and its current print file
 * GET  ?artwork_id=7&download=1&staff=  the component's current PRINT PRODUCTION
 *                                       MASTER (download audited)
 * POST multipart/form-data              register a PRINT PRODUCTION MASTER:
 *        order_id, artwork_id, art_master_id, reference (MCB-…), sku,
 *        template_id, template_version, staff, output (file);
 *        safe_zone_reviewed=true         MCB's manual safe-zone review, required
 *                                        while the manufacturer's safe zone is UNVERIFIED
 *        manual_template_confirmed=true  required for a TEMPLATE_REQUIRED component
 *        exception_reviewed=true         required for a component in EXCEPTION
 *        manual_source=true              no customer photograph on record (legacy)
 *
 * A print production master is RENDERED FROM a Creative Art Master that
 * passed MCB's visual QC, TO one template id and version (see
 * lib/production-files.php). Each registration is a new version: nothing is
 * overwritten or deleted. File QC checks presence, type, exact dimensions or
 * shape, orientation, template id/version and metadata, bleed/spine/centre
 * exclusion metadata, safe-zone review, order/reference, SKU, art master and
 * source association, and the hash. A failure stores nothing.
 *
 * Nothing here generates, edits or sends artwork anywhere, and nothing is
 * ordered from a supplier.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/production-files.php';

require_crm_key();

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $artworkId = ctype_digit((string) ($_GET['artwork_id'] ?? '')) ? (int) $_GET['artwork_id'] : 0;
    if ($artworkId > 0 && ($_GET['download'] ?? '') === '1') {
        $staff = operations_line($_GET['staff'] ?? null, 160);
        if ($staff === null) {
            json_error(422, 'staff_required', 'Say who is downloading, so access to production files is audited.');
        }
        $stmt = $pdo->prepare('SELECT p.* FROM order_artwork a JOIN print_production_masters p ON p.id = a.print_master_id WHERE a.id = :id');
        $stmt->execute([':id' => $artworkId]);
        $row = $stmt->fetch();
        $dir = production_file_directory('print');
        $name = $row === false ? '' : (string) $row['stored_name'];
        $path = $dir === null || preg_match('/^[a-f0-9]{64}$/', $name) !== 1 ? null : $dir . '/' . $name;
        if ($path === null || !is_file($path)) {
            json_error(404, 'not_found', 'No print production master is registered for that artwork.');
        }
        production_log_access($pdo, (int) $row['order_id'], $staff, 'DOWNLOAD_PRINT_MASTER');
        $ext = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/tiff' => 'tif'][$row['mime_type']] ?? 'bin';
        http_response_code(200);
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: attachment; filename="mcb-print-' . $row['template_id'] . '-v' . $row['version'] . '.' . $ext . '"');
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
$artMasterClaim = ctype_digit($field('art_master_id')) ? (int) $field('art_master_id') : null;
$staff     = operations_line($field('staff'), 160);
$reference = preg_match('/^MCB-\d{4}-\d{6}$/', $field('reference')) === 1 ? $field('reference') : null;
$claimTpl  = preg_match('/^[A-Z0-9_]{3,40}$/', $field('template_id')) === 1 ? $field('template_id') : null;
$claimVer  = ctype_digit($field('template_version')) ? (int) $field('template_version') : null;
$claimSku  = $field('sku') === '' ? null : $field('sku');

if ($orderId <= 0 || $artworkId <= 0) {
    json_error(422, 'invalid_request', 'order_id and artwork_id are required.');
}
if ($staff === null) {
    json_error(422, 'staff_required', 'Say who is doing this, so the audit trail can.');
}

$file = $_FILES['output'] ?? null;
try {
    production_check_upload(is_array($file) ? $file : null, 'PRINT_PRODUCTION_MASTER');
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
}
$tmp  = is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_OK && is_uploaded_file((string) $file['tmp_name']) ? (string) $file['tmp_name'] : null;
$size = is_array($file) ? (int) ($file['size'] ?? 0) : 0;

try {
    $result = db_transaction(function (PDO $pdo) use ($orderId, $artworkId, $artMasterClaim, $staff, $reference, $claimTpl, $claimVer, $claimSku, $tmp, $size): array {
        $order = operations_order_row($pdo, $orderId, true);
        if ($order === null) {
            throw new OperationsException('order_not_found', 'No such order.', 404);
        }
        if ($order['status'] !== 'PAID') {
            throw new OperationsException('order_not_paid', 'Artwork is registered only for a paid order.');
        }
        $stage = (string) ($order['stage'] ?? 'CREATIVE');
        if ($stage !== 'CREATIVE' && !in_array($stage, MCB_QC_PENDING_STAGES, true)) {
            throw new OperationsException('invalid_transition', 'Production files can be registered while the order is being created or checked. Reopen it first to replace them after the quality check.');
        }
        ensure_artwork_creative_jobs($pdo, $orderId);

        $stmt = $pdo->prepare(
            'SELECT a.*, u.order_id AS source_order_id, ou.sku AS unit_sku, o.mcb_reference AS reference
               FROM order_artwork a LEFT JOIN order_uploads u ON u.id = a.source_upload_id
               JOIN order_units ou ON ou.id = a.unit_id JOIN orders o ON o.id = a.order_id
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
        $art = production_current_art_master($pdo, (int) $row['unit_id']);
        if ($art === null) {
            throw new OperationsException('art_master_required', 'Register the Creative Art Master for this record, and pass MCB\'s visual QC, before its production files.', 409);
        }
        if ($art['visual_qc_status'] !== 'PASS') {
            throw new OperationsException('art_master_not_passed', 'The current Creative Art Master has not passed MCB\'s visual QC.', 409);
        }
        // The render job for this art master at the template's CURRENT version.
        $pdo->prepare(
            'INSERT IGNORE INTO production_render_jobs (order_id, unit_id, artwork_id, art_master_id, sku, template_id, template_version, output_spec, renderer)
             VALUES (:o, :u, :a, :am, :sku, :t, :v, :spec, :r)'
        )->execute([':o' => $orderId, ':u' => (int) $row['unit_id'], ':a' => $artworkId, ':am' => (int) $art['id'], ':sku' => $row['unit_sku'],
            ':t' => $template['id'], ':v' => (int) $template['version'], ':spec' => json_encode(production_output_spec($template), JSON_UNESCAPED_SLASHES), ':r' => 'MANUAL_EXTERNAL']);
        $rj = $pdo->prepare('SELECT * FROM production_render_jobs WHERE art_master_id = :am AND template_id = :t AND template_version = :v');
        $rj->execute([':am' => (int) $art['id'], ':t' => $template['id'], ':v' => (int) $template['version']]);
        $render = $rj->fetch() ?: null;

        $inspected = inspect_artwork_output($tmp, $size);
        $sha = $tmp === null ? null : hash_file('sha256', $tmp);
        $qc = production_print_file_qc($template, $row, $art, $render, $inspected, [
            'order_id' => $orderId, 'reference' => $reference, 'template_id' => $claimTpl, 'template_version' => $claimVer,
            'manual_source' => $manualSource, 'sku' => $claimSku, 'art_master_id' => $artMasterClaim, 'sha256' => $sha,
        ], ($_POST['safe_zone_reviewed'] ?? '') === 'true');
        if (!$qc['passed']) {
            if ($render !== null) {
                $pdo->prepare("UPDATE production_render_jobs SET status = 'FILE_QC_FAILED' WHERE id = :id AND status <> 'RENDERED'")->execute([':id' => (int) $render['id']]);
            }
            return ['passed' => false, 'qc' => $qc, 'row' => $row];
        }

        $stored = production_store_upload((string) $tmp, 'print');
        $v = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM print_production_masters WHERE artwork_id = :a');
        $v->execute([':a' => $artworkId]);
        $version = (int) $v->fetchColumn() + 1;
        $pdo->prepare('UPDATE print_production_masters SET is_current = 0 WHERE artwork_id = :a')->execute([':a' => $artworkId]);
        $pdo->prepare(
            'INSERT INTO print_production_masters (render_job_id, order_id, unit_id, artwork_id, art_master_id, sku, template_id, template_version, version,
                 stored_name, mime_type, width, height, byte_size, sha256, file_qc_status, file_qc, safe_zone_status, manual, is_current, created_by, created_at)
             VALUES (:r, :o, :u, :a, :am, :sku, :t, :tv, :v, :n, :m, :w, :h, :b, :sha, :fs, :fq, :sz, :man, 1, :by, UTC_TIMESTAMP())'
        )->execute([
            ':r' => (int) $render['id'], ':o' => $orderId, ':u' => (int) $row['unit_id'], ':a' => $artworkId, ':am' => (int) $art['id'], ':sku' => $row['unit_sku'],
            ':t' => $template['id'], ':tv' => (int) $template['version'], ':v' => $version, ':n' => $stored['stored_name'], ':m' => $inspected['mime'],
            ':w' => $inspected['width'], ':h' => $inspected['height'], ':b' => $size, ':sha' => $stored['sha256'], ':fs' => 'PASS',
            ':fq' => json_encode($qc['checks'], JSON_UNESCAPED_SLASHES), ':sz' => $qc['checks']['SAFE_ZONE'] === 'PASS' ? 'VERIFIED' : 'MANUAL_REVIEW_PASSED',
            ':man' => ($manualTemplate || $manualSource) ? 1 : 0, ':by' => $staff,
        ]);
        $printId = (int) $pdo->lastInsertId();
        $pdo->prepare("UPDATE production_render_jobs SET status = 'RENDERED' WHERE id = :id")->execute([':id' => (int) $render['id']]);
        $pdo->prepare(
            "UPDATE order_artwork
                SET status = 'READY', output_stored_name = :name, output_mime = :mime, output_width = :w, output_height = :h,
                    output_byte_size = :size, output_sha256 = :sha, manual = :manual, qc_result = :qc,
                    ready_at = UTC_TIMESTAMP(), ready_by = :by, art_master_id = :am, print_master_id = :pm
              WHERE id = :id"
        )->execute([
            ':name' => $stored['stored_name'], ':mime' => $inspected['mime'], ':w' => $inspected['width'], ':h' => $inspected['height'],
            ':size' => $size, ':sha' => $stored['sha256'], ':manual' => ($manualTemplate || $manualSource) ? 1 : 0,
            ':qc' => json_encode($qc['checks'], JSON_UNESCAPED_SLASHES), ':by' => $staff, ':am' => (int) $art['id'], ':pm' => $printId, ':id' => $artworkId,
        ]);
        record_order_event($pdo, $orderId, 'ARTWORK.READY', [
            'artwork_id' => $artworkId, 'template' => $row['template_id'], 'version' => (int) $row['template_version'],
            'manual' => $manualTemplate || $manualSource, 'by' => $staff,
        ], "artwork-ready:{$artworkId}:" . substr($stored['sha256'], 0, 16));
        record_order_event($pdo, $orderId, 'PRODUCTION.FILE_QC_PASSED', ['print_master_id' => $printId], "print-file-qc:{$printId}");
        record_order_event($pdo, $orderId, 'PRODUCTION.MASTER_READY', ['print_master_id' => $printId, 'art_master_id' => (int) $art['id'], 'template' => $template['id'], 'template_version' => (int) $template['version'], 'version' => $version], "print-master:{$printId}");
        return ['passed' => true, 'qc' => $qc, 'row' => $row, 'print_master_id' => $printId, 'version' => $version];
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
    json_error(422, 'artwork_qc_failed', 'The output did not pass the automated production-file checks: '
        . strtolower(str_replace('_', ' ', implode(', ', $result['qc']['failures']))) . '. Nothing was stored.', ['checks' => $result['qc']['checks']]);
}

json_response(200, [
    'order_id'        => $orderId,
    'artwork_id'      => $artworkId,
    'status'          => 'READY',
    'print_master_id' => $result['print_master_id'],
    'version'         => $result['version'],
    'checks'          => $result['qc']['checks'],
    'components'      => artwork_view(order_artwork_rows($pdo, $orderId)),
]);
