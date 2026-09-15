<?php
/**
 * MCB — production artwork: planning, technical QC and exceptions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SOURCE PHOTOGRAPH ≠ PRODUCTION OUTPUT
 * ─────────────────────────────────────────────────────────────────────────
 * The customer's photograph is the SOURCE (artwork-ready = square within 1%,
 * at least 2500 × 2500 px, checked at upload by lib/uploads.php). The
 * PRODUCTION OUTPUT is what MCB composes to a manufacturer template
 * (api/data/artwork.json, generated from src/data/production/artwork.ts):
 * e.g. a 12-inch sleeve front of exactly 3756 × 3827 px.
 *
 * This file creates NO artwork, calls NO AI or image service and invents NO
 * template. It records, per unit and component, what must be produced and
 * from which photograph, and runs automated TECHNICAL checks on the output a
 * person registers. Creative judgement stays with MCB's quality check.
 *
 *   AWAITING_INPUT        no usable source photograph on record yet
 *   INPUT_VALIDATED       artwork-ready source photograph associated
 *   PREPARATION_REQUIRED  source needs the £15 Artwork Preparation Service
 *   TEMPLATE_REQUIRED     no manufacturer template (Heart, gatefold): manual
 *   EXCEPTION             needs internal review (e.g. several unready photos)
 *   READY                 output registered and technical QC passed
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/founder-notifications.php';

/** The generated artwork specification (internal, server only). */
function artwork_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $path = __DIR__ . '/../data/artwork.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $decoded = $raw === false ? null : json_decode($raw, true);
    if (!is_array($decoded)) {
        error_log('MCB artwork: api/data/artwork.json is missing or unreadable.');
        throw new OperationsException('artwork_spec_unavailable', 'The artwork specification is unavailable.', 503);
    }
    $data = $decoded;
    return $data;
}

function artwork_template(string $id): ?array
{
    foreach (artwork_data()['templates'] as $template) {
        if ($template['id'] === $id) {
            return $template;
        }
    }
    return null;
}

/** The template ids a SKU needs, or [] when it has no production artwork. */
function artwork_components_for_sku(string $sku): array
{
    return artwork_data()['components_by_sku'][$sku] ?? [];
}

/** Whether a source photograph meets the artwork-ready rule (square within 1%, ≥ minimum). */
function artwork_source_is_ready(?int $width, ?int $height): bool
{
    $min = (int) (artwork_data()['source_min_px'] ?? 2500);
    if ($width === null || $height === null || $width < $min || $height < $min) {
        return false;
    }
    return abs($width - $height) <= (int) floor(max($width, $height) * 0.01);
}

/**
 * Creates or refreshes the order's artwork plan. Idempotent: rows are unique
 * per (unit, template), READY rows are never downgraded, and every event and
 * notification carries a dedupe key.
 *
 * @return list<array> the order's artwork rows after planning
 */
function plan_order_artwork(PDO $pdo, int $orderId): array
{
    $order = $pdo->prepare("SELECT id, mcb_reference, status FROM orders WHERE id = :id");
    $order->execute([':id' => $orderId]);
    $orderRow = $order->fetch();
    if ($orderRow === false || $orderRow['status'] !== 'PAID') {
        return order_artwork_rows($pdo, $orderId);
    }

    $rules = catalogue_data()['rules'];
    $items = $pdo->prepare('SELECT item_id FROM order_items WHERE order_id = :id');
    $items->execute([':id' => $orderId]);
    $hasPreparation = in_array($rules['artwork_preparation_sku'] ?? '', $items->fetchAll(PDO::FETCH_COLUMN), true);

    $units = $pdo->prepare("SELECT id, sku FROM order_units WHERE order_id = :id AND kind = 'SONG' ORDER BY id");
    $units->execute([':id' => $orderId]);

    $photos = $pdo->prepare(
        'SELECT u.id, u.width, u.height
           FROM order_uploads u JOIN order_memories m ON m.id = u.memory_id
          WHERE u.order_id = :oid AND m.unit_id = :unit
          ORDER BY m.sequence, u.id'
    );
    $existing = $pdo->prepare('SELECT id, status FROM order_artwork WHERE unit_id = :unit AND template_id = :tpl');

    foreach ($units->fetchAll() as $unit) {
        $components = artwork_components_for_sku((string) $unit['sku']);
        if ($components === []) {
            continue;
        }
        // The source: the first artwork-ready photograph on this unit, else the first photograph.
        $photos->execute([':oid' => $orderId, ':unit' => (int) $unit['id']]);
        $source = null;
        foreach ($photos->fetchAll() as $photo) {
            $ready = artwork_source_is_ready($photo['width'] === null ? null : (int) $photo['width'], $photo['height'] === null ? null : (int) $photo['height']);
            if ($source === null || ($ready && !$source['ready'])) {
                $source = $photo + ['ready' => $ready];
            }
        }

        foreach ($components as $templateId) {
            $template = artwork_template($templateId);
            if ($template === null) {
                continue;
            }
            $status = match (true) {
                $template['status'] === 'TEMPLATE_REQUIRED' => 'TEMPLATE_REQUIRED',
                $source === null                            => 'AWAITING_INPUT',
                $source['ready']                            => 'INPUT_VALIDATED',
                $hasPreparation                             => 'PREPARATION_REQUIRED',
                default                                     => 'EXCEPTION',
            };
            $reason = $status === 'EXCEPTION' ? 'SOURCE_NOT_ARTWORK_READY' : null;

            $existing->execute([':unit' => (int) $unit['id'], ':tpl' => $templateId]);
            $current = $existing->fetch();
            $params = [
                ':oid' => $orderId, ':unit' => (int) $unit['id'], ':tpl' => $templateId, ':ver' => (int) $template['version'],
                ':status' => $status, ':reason' => $reason,
                ':src' => $source === null ? null : (int) $source['id'],
                ':w' => $source['width'] ?? null, ':h' => $source['height'] ?? null,
                ':ready' => $source === null ? null : ($source['ready'] ? 1 : 0),
            ];
            if ($current === false) {
                $pdo->prepare(
                    'INSERT IGNORE INTO order_artwork
                        (order_id, unit_id, template_id, template_version, status, exception_reason,
                         source_upload_id, source_width, source_height, source_artwork_ready)
                     VALUES (:oid, :unit, :tpl, :ver, :status, :reason, :src, :w, :h, :ready)'
                )->execute($params);
            } elseif (!in_array($current['status'], ['READY', 'EXCEPTION'], true)) {
                unset($params[':oid'], $params[':ver']);
                $pdo->prepare(
                    'UPDATE order_artwork
                        SET status = :status, exception_reason = :reason, source_upload_id = :src,
                            source_width = :w, source_height = :h, source_artwork_ready = :ready
                      WHERE unit_id = :unit AND template_id = :tpl'
                )->execute($params);
            }
        }
    }

    $rows = order_artwork_rows($pdo, $orderId);

    // More unready source photographs than the standard service covers → one
    // internal review. Nothing extra is charged automatically.
    $unready = array_unique(array_column(array_filter($rows, static fn (array $r): bool => $r['status'] === 'PREPARATION_REQUIRED'), 'unit_id'));
    if (count($unready) > (int) (artwork_data()['preparation_standard_max_unready_photos'] ?? 1)) {
        $pdo->prepare(
            "UPDATE order_artwork SET status = 'EXCEPTION', exception_reason = 'MULTIPLE_PREPARATION'
              WHERE order_id = :oid AND status = 'PREPARATION_REQUIRED'"
        )->execute([':oid' => $orderId]);
        $rows = order_artwork_rows($pdo, $orderId);
    }

    foreach ($rows as $row) {
        $id = (int) $row['id'];
        $detail = ['artwork_id' => $id, 'template' => $row['template_id'], 'version' => (int) $row['template_version']];
        switch ($row['status']) {
            case 'INPUT_VALIDATED':
                record_order_event($pdo, $orderId, 'ARTWORK.INPUT_VALIDATED', $detail, "artwork-input:{$id}:{$row['source_upload_id']}");
                break;
            case 'PREPARATION_REQUIRED':
                record_order_event($pdo, $orderId, 'ARTWORK.PREPARATION_REQUIRED', $detail, "artwork-preparation:{$id}");
                break;
            case 'TEMPLATE_REQUIRED':
                record_order_event($pdo, $orderId, 'ARTWORK.TEMPLATE_REQUIRED', $detail, "artwork-template:{$id}");
                notify_founders_about_order($pdo, 'ARTWORK_EXCEPTION', $orderId, "artwork-template-required:{$orderId}",
                    ['reason' => 'ARTWORK_TEMPLATE_REQUIRED']);
                break;
            case 'EXCEPTION':
                record_order_event($pdo, $orderId, 'ARTWORK.EXCEPTION', $detail + ['reason' => $row['exception_reason']], "artwork-exception:{$id}:{$row['exception_reason']}");
                notify_founders_about_order($pdo, 'ARTWORK_EXCEPTION', $orderId, "artwork-exception:{$orderId}:{$row['exception_reason']}",
                    ['reason' => (string) $row['exception_reason']]);
                break;
        }
    }
    return $rows;
}

/** @return list<array> */
function order_artwork_rows(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        'SELECT id, order_id, unit_id, template_id, template_version, status, exception_reason,
                source_upload_id, source_width, source_height, source_artwork_ready,
                output_stored_name, output_mime, output_width, output_height, output_byte_size, output_sha256,
                manual, qc_result, ready_at, ready_by, updated_at, art_master_id, print_master_id
           FROM order_artwork WHERE order_id = :oid ORDER BY unit_id, id'
    );
    $stmt->execute([':oid' => $orderId]);
    return $stmt->fetchAll();
}

/** Staff view of the plan: each component with the template it must meet. No file paths. */
function artwork_view(array $rows): array
{
    return array_map(static function (array $r): array {
        $template = artwork_template((string) $r['template_id']);
        return [
            'artwork_id'       => (int) $r['id'],
            'unit_id'          => (int) $r['unit_id'],
            'status'           => $r['status'],
            'exception_reason' => $r['exception_reason'],
            'template'         => $template === null ? null : [
                'id' => $template['id'], 'version' => (int) $template['version'], 'label' => $template['label'],
                'status' => $template['status'], 'output_px' => $template['output_px'], 'diameter_mm' => $template['diameter_mm'],
                'bleed' => $template['bleed'], 'spine_allowance' => $template['spine_allowance'],
                'centre_hole_mm' => $template['centre_hole_mm'], 'centre_creative_exclusion' => $template['centre_creative_exclusion'],
                'safe_inset_mm' => $template['safe_inset_mm'], 'trim_px' => $template['trim_px'],
                'qc' => $template['qc'], 'missing' => $template['missing'], 'notes' => $template['notes'],
            ],
            'template_version_planned' => (int) $r['template_version'],
            'source'           => $r['source_upload_id'] === null ? null : [
                'upload_id' => (int) $r['source_upload_id'],
                'width' => $r['source_width'] === null ? null : (int) $r['source_width'],
                'height' => $r['source_height'] === null ? null : (int) $r['source_height'],
                'artwork_ready' => $r['source_artwork_ready'] === null ? null : (int) $r['source_artwork_ready'] === 1,
            ],
            'output'           => $r['output_stored_name'] === null ? null : [
                'mime' => $r['output_mime'], 'width' => (int) $r['output_width'], 'height' => (int) $r['output_height'],
                'bytes' => (int) $r['output_byte_size'], 'sha256' => $r['output_sha256'],
            ],
            'manual'           => (int) $r['manual'] === 1,
            'qc'               => $r['qc_result'] === null ? null : json_decode((string) $r['qc_result'], true),
            'ready_at'         => $r['ready_at'],
            'ready_by'         => $r['ready_by'],
        ];
    }, $rows);
}

/** Components still keeping a physical order from passing the quality check. */
function artwork_blocking_rows(array $rows): array
{
    return array_values(array_filter($rows, static fn (array $r): bool => $r['status'] !== 'READY'));
}

/**
 * Automated TECHNICAL QC for a production output. Pure: no database, no
 * filesystem beyond the facts passed in.
 *
 * @param array{order_id:int, reference:?string, template_id:string, template_version:int, source_upload_id:?int, source_order_id:?int} $row
 * @param array{present:bool, mime:?string, width:?int, height:?int}                                                                    $file
 * @param array{order_id:int, reference:?string, template_id:?string, template_version:?int, manual_source:bool}                        $claim what the person registering it says it is
 * @return array{passed:bool, checks:array<string,string>, failures:list<string>}
 */
function artwork_output_qc(array $template, array $row, array $file, array $claim): array
{
    $checks = [];
    $mimeTypes = artwork_data()['output_mime_types'] ?? ['image/png', 'image/jpeg', 'image/tiff'];
    $w = $file['width'];
    $h = $file['height'];

    foreach ($template['qc'] as $check) {
        $checks[$check] = match ($check) {
            'OUTPUT_PRESENT'     => $file['present'] ? 'PASS' : 'FAIL',
            'FILE_TYPE'          => in_array($file['mime'], $mimeTypes, true) ? 'PASS' : 'FAIL',
            'EXACT_DIMENSIONS'   => $template['output_px'] !== null && $w === (int) $template['output_px']['width'] && $h === (int) $template['output_px']['height'] ? 'PASS' : 'FAIL',
            'SQUARE_ASPECT'      => $w !== null && $h !== null && $w === $h ? 'PASS' : 'FAIL',
            // No cross-order mismatch: the order, its reference and the component must all agree.
            'ORDER_ASSOCIATION'  => $claim['order_id'] === $row['order_id'] && $claim['reference'] !== null && $claim['reference'] === $row['reference'] ? 'PASS' : 'FAIL',
            'SOURCE_ASSOCIATION' => $row['source_upload_id'] !== null && $row['source_order_id'] === $row['order_id']
                ? 'PASS'
                : ($claim['manual_source'] ? 'MANUAL' : 'FAIL'),
            'TEMPLATE_VERSION'   => $claim['template_id'] === $template['id'] && $claim['template_version'] === (int) $template['version']
                && (int) $template['version'] === $row['template_version'] ? 'PASS' : 'FAIL',
            default              => 'FAIL',
        };
    }
    // A manually prepared template still has to be the right order and a readable file.
    $failures = array_keys(array_filter($checks, static fn (string $v): bool => $v === 'FAIL'));
    return ['passed' => $failures === [], 'checks' => $checks, 'failures' => $failures];
}

/** Private directory for production outputs, inside private upload storage. */
function artwork_output_directory(): ?string
{
    $base = upload_directory();
    if ($base === null) {
        return null;
    }
    $dir = $base . '/artwork';
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return null;
    }
    return is_writable($dir) ? $dir : null;
}

/**
 * Identifies an output file by its bytes.
 *
 * @return array{present:bool, mime:?string, width:?int, height:?int}
 */
function inspect_artwork_output(?string $path, int $size): array
{
    if ($path === null || $size <= 0 || !is_file($path)) {
        return ['present' => false, 'mime' => null, 'width' => null, 'height' => null];
    }
    $info = @getimagesize($path);
    if (!is_array($info)) {
        return ['present' => true, 'mime' => null, 'width' => null, 'height' => null];
    }
    $mime = match ($info[2] ?? null) {
        IMAGETYPE_PNG => 'image/png',
        IMAGETYPE_JPEG => 'image/jpeg',
        IMAGETYPE_TIFF_II, IMAGETYPE_TIFF_MM => 'image/tiff',
        default => null,
    };
    return ['present' => true, 'mime' => $mime, 'width' => (int) $info[0], 'height' => (int) $info[1]];
}
