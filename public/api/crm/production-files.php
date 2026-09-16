<?php
/**
 * /api/crm/production-files — the Production File Factory for staff. CRM key required.
 *
 * GET  ?order_id=41&staff=Name              artwork jobs (with their minimal input),
 *                                           source-photo preparation, art masters,
 *                                           render jobs, print masters, the
 *                                           manufacturing package and the staff-only
 *                                           supplier order pack; access audited
 * GET  ?art_master_id=|print_master_id=&download=1&staff=Name   a file (audited)
 * GET  ?view=limits                         file-role upload limits and PHP limits
 * POST multipart action=REGISTER_ART_MASTER order_id, reference, artwork_job_id,
 *                                           creation_method, source_upload_ids (comma),
 *                                           staff, art (file)
 * POST JSON { action, order_id, staff, … }  VISUAL_QC, IMAGE_PREPARATION,
 *                                           SET_VISUAL_DIRECTION, BUILD_MANUFACTURING_PACKAGE
 *
 * Nothing here generates artwork, calls an image or music service, contacts a
 * supplier, spends money or asks the customer to approve anything.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/production-files.php';

require_crm_key();

$pdo = db();
$decode = static fn (?string $json): mixed => $json === null ? null : json_decode($json, true);

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    if (($_GET['view'] ?? '') === 'limits') {
        json_response(200, ['roles' => array_map('production_role_limit', array_keys(artwork_data()['file_role_limits']))]);
    }
    $staff = crm_staff_name(operations_line($_GET['staff'] ?? null, 160));
    if ($staff === null) {
        json_error(422, 'staff_required', 'Say who is looking, so access to production files is audited.');
    }
    if (($_GET['download'] ?? '') === '1') {
        $isArt = ctype_digit((string) ($_GET['art_master_id'] ?? ''));
        $id = (int) ($isArt ? $_GET['art_master_id'] : ($_GET['print_master_id'] ?? 0));
        $stmt = $pdo->prepare('SELECT order_id, stored_name, mime_type FROM ' . ($isArt ? 'artwork_art_masters' : 'print_production_masters') . ' WHERE id = :id');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        $dir = production_file_directory($isArt ? 'art' : 'print');
        $path = $row === false || $dir === null || preg_match('/^[a-f0-9]{64}$/', (string) $row['stored_name']) !== 1 ? null : $dir . '/' . $row['stored_name'];
        if ($path === null || !is_file($path)) {
            json_error(404, 'not_found', 'No such production file.');
        }
        production_log_access($pdo, (int) $row['order_id'], $staff, $isArt ? 'DOWNLOAD_ART_MASTER' : 'DOWNLOAD_PRINT_MASTER');
        http_response_code(200);
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . (string) filesize($path));
        header('Content-Disposition: attachment; filename="mcb-' . ($isArt ? 'art' : 'print') . "-{$id}\"");
        header('X-Content-Type-Options: nosniff');
        header("Content-Security-Policy: default-src 'none'; sandbox");
        header('Cache-Control: no-store');
        readfile($path);
        exit;
    }

    $orderId = ctype_digit((string) ($_GET['order_id'] ?? '')) ? (int) $_GET['order_id'] : 0;
    $order = $orderId > 0 ? operations_order_row($pdo, $orderId) : null;
    if ($order === null) {
        json_error(404, 'order_not_found', 'No such order.');
    }
    $jobs = $order['status'] === 'PAID' ? db_transaction(fn (PDO $pdo): array => ensure_artwork_creative_jobs($pdo, $orderId)) : [];
    production_log_access($pdo, $orderId, $staff, 'VIEW_PRODUCTION_FILES');
    $q = static function (string $sql) use ($pdo, $orderId): array {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':o' => $orderId]);
        return $stmt->fetchAll();
    };
    $package = current_manufacturing_package($pdo, $orderId);
    $pack = current_supplier_order_pack($pdo, $orderId);
    json_response(200, [
        'order_id' => $orderId,
        'reference' => $order['mcb_reference'],
        'artwork_provider_decision' => artwork_data()['artwork_provider_decision_status'],
        'creation_methods_available' => artwork_data()['art_creation_methods_available'],
        'renderers_available' => artwork_data()['renderers_available'],
        'visual_qc_criteria' => artwork_data()['visual_qc_criteria'],
        'jobs' => array_map(static fn (array $j): array => $j + ['input' => artwork_job_input($pdo, $j)], $jobs),
        'image_preparation' => $q('SELECT id, unit_id, upload_id, status, preparation_notes, identity_preserved, updated_by, updated_at FROM image_preparation_records WHERE order_id = :o ORDER BY id'),
        'art_masters' => array_map(static function (array $a) use ($decode): array { $a['visual_qc'] = $decode($a['visual_qc']); unset($a['stored_name']); return $a; },
            $q('SELECT * FROM artwork_art_masters WHERE order_id = :o ORDER BY job_id, version')),
        'render_jobs' => array_map(static function (array $r) use ($decode): array { $r['output_spec'] = $decode($r['output_spec']); return $r; },
            $q('SELECT * FROM production_render_jobs WHERE order_id = :o ORDER BY id')),
        'print_masters' => array_map(static function (array $p) use ($decode): array { $p['file_qc'] = $decode($p['file_qc']); unset($p['stored_name']); return $p; },
            $q('SELECT * FROM print_production_masters WHERE order_id = :o ORDER BY artwork_id, version')),
        'components' => artwork_view(order_artwork_rows($pdo, $orderId)),
        'manufacturing_package' => $package === null ? null : ['package_id' => (int) $package['id'], 'version' => (int) $package['version'], 'status' => $package['status'], 'blockers' => $decode($package['blockers']), 'body' => $decode($package['body']), 'created_at' => $package['created_at']],
        'manufacturing_package_versions' => $q('SELECT id, version, status, created_at FROM manufacturing_packages WHERE order_id = :o ORDER BY version'),
        // STAFF ONLY: supplier, product link, costs and delivery details.
        'supplier_order_pack' => $pack === null ? null : ['pack_id' => (int) $pack['id'], 'version' => (int) $pack['version'], 'status' => $pack['status'], 'body' => $decode($pack['body']),
            'founder_authorisation' => ['authorised_by' => $order['supplier_purchase_authorised_by'], 'authorised_at' => $order['supplier_purchase_authorised_at']],
            'placed_by' => $pack['placed_by'], 'placed_at' => $pack['placed_at']],
    ]);
}

require_method('POST');

// ---- Multipart: register a Creative Art Master ---------------------------------------
if (str_starts_with((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data')) {
    $field = static fn (string $n): ?string => is_string($_POST[$n] ?? null) && trim($_POST[$n]) !== '' ? trim($_POST[$n]) : null;
    $orderId = ctype_digit((string) $field('order_id')) ? (int) $field('order_id') : 0;
    $jobId = ctype_digit((string) $field('artwork_job_id')) ? (int) $field('artwork_job_id') : 0;
    $staff = crm_staff_name(operations_line($field('staff'), 160));
    if ($field('action') !== 'REGISTER_ART_MASTER' || $orderId <= 0 || $jobId <= 0 || $staff === null) {
        json_error(422, 'invalid_request', 'action REGISTER_ART_MASTER, order_id, artwork_job_id and staff are required.');
    }
    $file = $_FILES['art'] ?? null;
    try {
        production_check_upload(is_array($file) ? $file : null, 'CREATIVE_ART_MASTER');
        $tmp = is_array($file) && ($file['error'] ?? null) === UPLOAD_ERR_OK && is_uploaded_file((string) $file['tmp_name']) ? (string) $file['tmp_name'] : null;
        if ($tmp === null) {
            throw new OperationsException('art_required', 'Attach the Creative Art Master file.', 422);
        }
        $sources = array_values(array_unique(array_map('intval', array_filter(explode(',', (string) $field('source_upload_ids')), 'ctype_digit'))));
        $result = db_transaction(function (PDO $pdo) use ($orderId, $jobId, $staff, $field, $tmp, $file, $sources): array {
            $order = operations_order_row($pdo, $orderId, true);
            if ($order === null || $order['status'] !== 'PAID') {
                throw new OperationsException('order_not_found', 'No such paid order.', 404);
            }
            ensure_artwork_creative_jobs($pdo, $orderId);
            $job = production_artwork_job($pdo, $orderId, $jobId, true);
            $image = inspect_artwork_output($tmp, (int) $file['size']);
            $stored = in_array($image['mime'], artwork_data()['output_mime_types'], true) ? production_store_upload($tmp, 'art') : ['stored_name' => '', 'sha256' => ''];
            try {
                $out = production_register_art_master($pdo, $order, $job, $stored, $image, (int) $file['size'], (string) $field('creation_method'), $field('provider_id'), $sources, $field('reference'), $staff);
            } catch (OperationsException $e) {
                if ($stored['stored_name'] !== '') {
                    @unlink(production_file_directory('art') . '/' . $stored['stored_name']);
                }
                throw $e;
            }
            production_log_access($pdo, $orderId, $staff, 'REGISTER_ART_MASTER');
            return $out;
        });
    } catch (OperationsException $e) {
        json_error($e->httpStatus, $e->errorCode, $e->getMessage());
    } catch (Throwable $e) {
        error_log('MCB art master registration failed for order ' . $orderId . ': ' . $e->getMessage());
        json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
    }
    json_response(200, ['order_id' => $orderId] + $result);
}

// ---- JSON actions -------------------------------------------------------------------
$body = read_json_body(65536);
$action = is_string($body['action'] ?? null) ? strtoupper($body['action']) : '';
$staff = crm_staff_name(operations_line($body['staff'] ?? null, 160));
$orderId = is_int($body['order_id'] ?? null) ? $body['order_id'] : 0;
if ($staff === null || $orderId <= 0) {
    json_error(422, 'invalid_request', 'order_id and staff are required.');
}
try {
    $result = db_transaction(function (PDO $pdo) use ($action, $body, $staff, $orderId): array {
        $order = operations_order_row($pdo, $orderId, true);
        if ($order === null || $order['status'] !== 'PAID') {
            throw new OperationsException('order_not_found', 'No such paid order.', 404);
        }
        ensure_artwork_creative_jobs($pdo, $orderId);
        production_log_access($pdo, $orderId, $staff, 'ACTION_' . substr($action, 0, 32));
        switch ($action) {
            case 'VISUAL_QC':
                return production_visual_qc($pdo, $orderId, is_int($body['art_master_id'] ?? null) ? $body['art_master_id'] : 0,
                    is_array($body['criteria'] ?? null) ? $body['criteria'] : [], (string) ($body['outcome'] ?? ''), operations_text($body['note'] ?? null, 1000), $staff);
            case 'IMAGE_PREPARATION':
                return production_update_preparation($pdo, $orderId, is_int($body['upload_id'] ?? null) ? $body['upload_id'] : 0, (string) ($body['status'] ?? ''),
                    operations_text($body['notes'] ?? null, 1000), ($body['identity_preserved'] ?? null) === true, $staff);
            case 'SET_VISUAL_DIRECTION':
                $job = production_artwork_job($pdo, $orderId, is_int($body['artwork_job_id'] ?? null) ? $body['artwork_job_id'] : 0, true);
                $direction = operations_text($body['visual_direction'] ?? null, 1000);
                $pdo->prepare('UPDATE artwork_creative_jobs SET visual_direction = :d WHERE id = :id')->execute([':d' => $direction, ':id' => (int) $job['id']]);
                return ['artwork_job_id' => (int) $job['id'], 'visual_direction' => $direction];
            case 'BUILD_MANUFACTURING_PACKAGE':
                $package = build_manufacturing_package($pdo, $orderId, $staff);
                if ($package === null) {
                    throw new OperationsException('not_physical', 'Only a paid physical order has a manufacturing package.', 409);
                }
                return ['package_id' => $package['package_id'], 'version' => $package['version'], 'status' => $package['status'], 'blockers' => $package['blockers']];
        }
        throw new OperationsException('unknown_action', 'That action is not recognised.', 422);
    });
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, $e->getMessage());
} catch (Throwable $e) {
    error_log('MCB production action ' . $action . ' failed for order ' . $orderId . ': ' . $e->getMessage());
    json_error(500, 'server_error', 'That could not be saved. Nothing was changed.');
}
json_response(200, ['order_id' => $orderId, 'action' => $action] + $result);
