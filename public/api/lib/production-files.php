<?php
/**
 * MCB Production File Factory — from approved creative work to a controlled,
 * manufacturer-ready package. Provider-independent.
 *
 *   MCB AUDIO MASTER(S) + CUSTOMER PHOTO(S) + PERSONALISATION
 *   → ARTWORK CREATIVE JOB → CREATIVE ART MASTER (MCB's composition)
 *   → MCB VISUAL QC → PRODUCTION RENDER JOB (art master × template version)
 *   → PRINT PRODUCTION MASTER → AUTOMATED FILE QC → AUDIO CAPACITY QC
 *   → MANUFACTURING PACKAGE → FULFILMENT READY → FOUNDER FINANCIAL APPROVAL
 *   → MANUAL SUPPLIER PURCHASE
 *
 * ART IS NOT MANUFACTURING. A Creative Art Master never depends on a
 * supplier template; a Print Production Master is rendered from it to one
 * template id and version, with lineage. A new template version is a new
 * render and a new print-master version; old files stay tied to their old
 * template and are never reinterpreted.
 *
 * NOTHING HERE GENERATES ARTWORK OR CALLS AN IMAGE SERVICE. The artwork
 * provider decision is DEFERRED; art masters and rendered files are made by
 * people (or a future adapter) and registered here, then checked. No customer
 * approval exists. No money is spent: a supplier order pack is PREPARED for a
 * person, and only Bella or Lewis can authorise the purchase.
 */

declare(strict_types=1);

require_once __DIR__ . '/payment-first.php';

require_once __DIR__ . '/operations.php';
require_once __DIR__ . '/artwork.php';
require_once __DIR__ . '/creative-factory.php';

/* ------------------------------------------------------------------ */
/* File roles and limits                                               */
/* ------------------------------------------------------------------ */

function production_ini_bytes(string $value): int
{
    $value = trim($value);
    if ($value === '' || $value === '-1') {
        return PHP_INT_MAX;
    }
    $n = (int) $value;
    return match (strtolower(substr($value, -1))) {
        'g' => $n * 1024 ** 3, 'm' => $n * 1024 ** 2, 'k' => $n * 1024, default => $n,
    };
}

/**
 * The limit for a file role: MCB's configured limit (uploads.role_limits.<ROLE>,
 * else the generated default) and what PHP on this server actually allows.
 * Production masters are never compressed to fit a limit.
 */
function production_role_limit(string $role): array
{
    $defaults = artwork_data()['file_role_limits'] ?? [];
    $configured = mcb_setting("uploads.role_limits.{$role}", null);
    $limit = is_int($configured) && $configured > 0 ? $configured : (int) ($defaults[$role] ?? 10 * 1024 * 1024);
    $php = min(production_ini_bytes((string) ini_get('upload_max_filesize')), production_ini_bytes((string) ini_get('post_max_size')));
    return ['role' => $role, 'configured_bytes' => $limit, 'php_limit_bytes' => $php === PHP_INT_MAX ? null : $php, 'effective_bytes' => min($limit, $php)];
}

/** Refuses a file larger than its role allows, saying which limit applied. */
function production_check_upload(?array $file, string $role): void
{
    if (!is_array($file)) {
        return;
    }
    if (in_array($file['error'] ?? null, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
        throw new OperationsException('upload_exceeds_server_limit', "The server's PHP upload limit is lower than the {$role} limit. Ask for the hosting upload limits to be raised; production files are never compressed to fit.", 413);
    }
    $limit = production_role_limit($role);
    if ((int) ($file['size'] ?? 0) > $limit['configured_bytes']) {
        throw new OperationsException('upload_too_large_for_role', "That file is larger than the configured {$role} limit.", 413);
    }
}

/** Private storage for production files: inside private upload storage, never the web root. */
function production_file_directory(string $kind): ?string
{
    $base = upload_directory();
    if ($base === null || preg_match('/^[a-z-]{3,20}$/', $kind) !== 1) {
        return null;
    }
    $dir = $base . '/production/' . $kind;
    if (!is_dir($dir) && !@mkdir($dir, 0700, true)) {
        return null;
    }
    return is_writable($dir) ? $dir : null;
}

/** Moves an uploaded file into private storage under a random name. */
function production_store_upload(string $tmp, string $kind): array
{
    $dir = production_file_directory($kind);
    if ($dir === null) {
        throw new OperationsException('storage_unavailable', 'Private storage is not available; nothing was saved.', 503);
    }
    $name = bin2hex(random_bytes(32));
    if (!move_uploaded_file($tmp, $dir . '/' . $name)) {
        throw new OperationsException('storage_unavailable', 'The file could not be saved.', 503);
    }
    @chmod($dir . '/' . $name, 0600);
    return ['stored_name' => $name, 'path' => $dir . '/' . $name, 'sha256' => hash_file('sha256', $dir . '/' . $name)];
}

function production_log_access(PDO $pdo, int $orderId, string $staff, string $action): void
{
    $pdo->prepare('INSERT INTO creative_access_log (order_id, staff, action, created_at) VALUES (:o, :s, :a, UTC_TIMESTAMP())')
        ->execute([':o' => $orderId, ':s' => $staff, ':a' => mb_substr($action, 0, 40)]);
}

/* ------------------------------------------------------------------ */
/* Artwork creative jobs and source preparation                        */
/* ------------------------------------------------------------------ */

/**
 * One Artwork Creative Job per record unit, and a preparation record per
 * customer source photograph. Idempotent.
 *
 * @return list<array> the order's artwork jobs
 */
function ensure_artwork_creative_jobs(PDO $pdo, int $orderId): array
{
    // Payment first. This used to be safe only because every caller happened
    // to check first, and because an unpaid order has no artwork rows yet.
    require_payment_before_work($pdo, $orderId, 'ARTWORK');
    $rows = plan_order_artwork($pdo, $orderId);
    if ($rows === []) {
        return [];
    }
    $unitSku = $pdo->prepare('SELECT sku FROM order_units WHERE id = :u');
    $photos = $pdo->prepare(
        'SELECT u.id, u.width, u.height FROM order_uploads u JOIN order_memories m ON m.id = u.memory_id WHERE u.order_id = :o AND m.unit_id = :unit'
    );
    foreach (array_unique(array_map('intval', array_column($rows, 'unit_id'))) as $unitId) {
        $unitSku->execute([':u' => $unitId]);
        $pdo->prepare('INSERT IGNORE INTO artwork_creative_jobs (order_id, unit_id, sku) VALUES (:o, :u, :s)')
            ->execute([':o' => $orderId, ':u' => $unitId, ':s' => (string) $unitSku->fetchColumn()]);
        $jobId = (int) $pdo->query('SELECT id FROM artwork_creative_jobs WHERE unit_id = ' . $unitId)->fetchColumn();
        record_order_event($pdo, $orderId, 'ARTWORK.CREATIVE_JOB_READY', ['artwork_job_id' => $jobId], "artwork-job:{$jobId}");

        $unitException = in_array('MULTIPLE_PREPARATION', array_column(array_filter($rows, static fn (array $r): bool => (int) $r['unit_id'] === $unitId), 'exception_reason'), true);
        $photos->execute([':o' => $orderId, ':unit' => $unitId]);
        foreach ($photos->fetchAll() as $photo) {
            $ready = artwork_source_is_ready($photo['width'] === null ? null : (int) $photo['width'], $photo['height'] === null ? null : (int) $photo['height']);
            $status = $ready ? 'SOURCE_READY' : ($unitException ? 'EXCEPTION' : 'PREPARATION_REQUIRED');
            $pdo->prepare('INSERT IGNORE INTO image_preparation_records (order_id, unit_id, upload_id, status) VALUES (:o, :u, :p, :s)')
                ->execute([':o' => $orderId, ':u' => $unitId, ':p' => (int) $photo['id'], ':s' => $status]);
            if ($status === 'EXCEPTION') {
                $pdo->prepare("UPDATE image_preparation_records SET status = 'EXCEPTION' WHERE upload_id = :p AND status IN ('PREPARATION_REQUIRED')")
                    ->execute([':p' => (int) $photo['id']]);
            }
        }
    }
    $stmt = $pdo->prepare('SELECT * FROM artwork_creative_jobs WHERE order_id = :o ORDER BY id');
    $stmt->execute([':o' => $orderId]);
    return $stmt->fetchAll();
}

/**
 * What an artwork creator (a person today, a provider later) receives: the
 * product, photo references, the exact facts, titles, visual direction, MCB
 * brand rules and the product's template context. Never an address, email,
 * phone, payment data, supplier cost, margin or credential — and not the
 * customer's story text.
 */
function artwork_job_input(PDO $pdo, array $job): array
{
    $orderId = (int) $job['order_id'];
    $unitId = (int) $job['unit_id'];
    $order = $pdo->prepare('SELECT mcb_reference FROM orders WHERE id = :o');
    $order->execute([':o' => $orderId]);
    $name = $pdo->prepare('SELECT i.item_name FROM order_units u JOIN order_items i ON i.id = u.order_item_id WHERE u.id = :u');
    $name->execute([':u' => $unitId]);
    $photos = $pdo->prepare(
        'SELECT u.id, u.width, u.height, r.status FROM order_uploads u
           JOIN order_memories m ON m.id = u.memory_id
           LEFT JOIN image_preparation_records r ON r.upload_id = u.id
          WHERE u.order_id = :o AND m.unit_id = :unit ORDER BY m.sequence'
    );
    $photos->execute([':o' => $orderId, ':unit' => $unitId]);
    $occasions = $pdo->prepare('SELECT DISTINCT occasion FROM order_memories WHERE unit_id = :u AND occasion IS NOT NULL');
    $occasions->execute([':u' => $unitId]);

    $album = $pdo->prepare('SELECT id FROM creative_albums WHERE unit_id = :u');
    $album->execute([':u' => $unitId]);
    $albumId = $album->fetchColumn();
    $facts = [];
    $ledgerVersion = null;
    $titles = [];
    $albumTitle = null;
    if ($albumId !== false) {
        $ledger = creative_artifact($pdo, "album:{$albumId}", 'FACT_LEDGER');
        $ledgerVersion = $ledger['version'] ?? null;
        foreach ($ledger['body']['facts'] ?? [] as $f) {
            if ($f['classification'] === 'EXACT' || in_array($f['type'], ['OCCASION', 'MILESTONE'], true)) {
                $facts[] = array_intersect_key($f, array_flip(['id', 'type', 'value', 'accepted_forms', 'classification', 'tracks']));
            }
        }
        $albumTitle = creative_artifact($pdo, "album:{$albumId}", 'ALBUM_MAP')['body']['album_title'] ?? null;
        foreach (creative_album_jobs($pdo, (int) $albumId) as $cj) {
            $pkg = $cj['lyric_version'] === null ? null : creative_artifact($pdo, "job:{$cj['id']}", 'LYRIC_PACKAGE', (int) $cj['lyric_version']);
            $titles[] = ['track' => (int) $cj['track_number'], 'title' => $pkg['body']['title'] ?? null];
        }
    }
    $components = array_map(static function (array $r): array {
        $t = artwork_template((string) $r['template_id']);
        return ['template_id' => $r['template_id'], 'template_version' => (int) $r['template_version'], 'label' => $t['label'] ?? null, 'status' => $t['status'] ?? null];
    }, array_values(array_filter(order_artwork_rows($pdo, $orderId), static fn (array $r): bool => (int) $r['unit_id'] === $unitId)));

    return [
        'schema' => 'mcb.artwork_job_input.v1',
        'reference' => $order->fetchColumn(),
        'product' => ['sku' => $job['sku'], 'name' => $name->fetchColumn() ?: null],
        'photos' => array_map(static fn (array $p): array => [
            'upload_id' => (int) $p['id'], 'width' => $p['width'] === null ? null : (int) $p['width'], 'height' => $p['height'] === null ? null : (int) $p['height'],
            'preparation' => $p['status'],
        ], $photos->fetchAll()),
        'occasions' => $occasions->fetchAll(PDO::FETCH_COLUMN),
        'facts' => $facts,
        'personalisation_version' => $ledgerVersion,
        'album_title' => $albumTitle,
        'track_titles' => $titles,
        'visual_direction' => $job['visual_direction'],
        'brand_rules' => artwork_data()['brand_rules'],
        'product_context' => $components,
        'provider_decision' => artwork_data()['artwork_provider_decision_status'],
    ];
}

/** A source photograph's preparation, recorded by a person. Nothing invents or replaces faces or details. */
function production_update_preparation(PDO $pdo, int $orderId, int $uploadId, string $status, ?string $notes, bool $identityPreserved, string $by): array
{
    $stmt = $pdo->prepare('SELECT * FROM image_preparation_records WHERE upload_id = :u FOR UPDATE');
    $stmt->execute([':u' => $uploadId]);
    $rec = $stmt->fetch();
    if ($rec === false || (int) $rec['order_id'] !== $orderId) {
        throw new OperationsException('photo_not_found', 'No such source photograph on this order.', 404);
    }
    $allowed = [
        'PREPARATION_IN_PROGRESS' => ['PREPARATION_REQUIRED', 'EXCEPTION'],
        'PREPARED' => ['PREPARATION_IN_PROGRESS'],
        'UNUSABLE' => ['PREPARATION_REQUIRED', 'PREPARATION_IN_PROGRESS', 'EXCEPTION', 'SOURCE_READY'],
    ];
    if (!isset($allowed[$status]) || !in_array($rec['status'], $allowed[$status], true)) {
        throw new OperationsException('invalid_transition', 'That preparation step does not follow from ' . strtolower(str_replace('_', ' ', $rec['status'])) . '.', 409);
    }
    if (in_array($status, ['PREPARED', 'UNUSABLE'], true) && $notes === null) {
        throw new OperationsException('notes_required', 'Record what was done (or why the photograph cannot be used).', 422);
    }
    if ($status === 'PREPARED' && !$identityPreserved) {
        throw new OperationsException('identity_confirmation_required', 'Confirm the preparation preserved the people and content of the photograph (no replaced faces or invented details).', 422);
    }
    $pdo->prepare('UPDATE image_preparation_records SET status = :s, preparation_notes = COALESCE(:n, preparation_notes), identity_preserved = :i, updated_by = :by WHERE id = :id')
        ->execute([':s' => $status, ':n' => $notes, ':i' => $status === 'PREPARED' ? 1 : null, ':by' => $by, ':id' => (int) $rec['id']]);
    record_order_event($pdo, $orderId, 'ARTWORK.SOURCE_PREPARATION', ['upload_id' => $uploadId, 'status' => $status, 'by' => $by]);
    if ($status === 'UNUSABLE') {
        notify_founders_about_order($pdo, 'ARTWORK_EXCEPTION', $orderId, "photo-unusable:{$orderId}:{$uploadId}", ['reason' => 'SOURCE_PHOTO_UNUSABLE']);
    }
    return ['upload_id' => $uploadId, 'status' => $status];
}

/* ------------------------------------------------------------------ */
/* Creative Art Masters and visual QC                                  */
/* ------------------------------------------------------------------ */

function production_artwork_job(PDO $pdo, int $orderId, int $jobId, bool $lock = false): array
{
    $stmt = $pdo->prepare('SELECT * FROM artwork_creative_jobs WHERE id = :id' . ($lock ? ' FOR UPDATE' : ''));
    $stmt->execute([':id' => $jobId]);
    $job = $stmt->fetch();
    if ($job === false || (int) $job['order_id'] !== $orderId) {
        throw new OperationsException('artwork_job_not_found', 'No such artwork job on this order.', 404);
    }
    return $job;
}

/**
 * Registers a new Creative Art Master version (never overwriting the last).
 * Source photographs must belong to this order and record, and be ready or
 * prepared. Earlier print files stay on record but stop counting as current.
 */
function production_register_art_master(PDO $pdo, array $order, array $job, array $stored, array $image, int $size, string $method, ?string $providerId, array $sourceIds, ?string $claimedReference, string $by): array
{
    $orderId = (int) $order['id'];
    if ($claimedReference !== $order['mcb_reference']) {
        throw new OperationsException('order_mismatch', 'The reference does not match this order.', 422);
    }
    if (!in_array($method, artwork_data()['art_creation_methods'], true)) {
        throw new OperationsException('invalid_method', 'Creation method: MANUAL_DESIGN or MCB_INTERNAL.', 422);
    }
    if (!in_array($method, artwork_data()['art_creation_methods_available'], true)) {
        throw new OperationsException('artwork_provider_deferred', 'No artwork provider is selected (DEFERRED). Register manually designed or MCB internal artwork.', 422);
    }
    if (!in_array($image['mime'], artwork_data()['output_mime_types'], true)) {
        throw new OperationsException('art_master_unreadable', 'The Creative Art Master must be a readable PNG, JPEG or TIFF image.', 422);
    }
    if ($sourceIds === []) {
        throw new OperationsException('sources_required', 'Name the customer photograph(s) the artwork uses.', 422);
    }
    $check = $pdo->prepare(
        'SELECT u.id, u.order_id, m.unit_id, r.status FROM order_uploads u
           LEFT JOIN order_memories m ON m.id = u.memory_id
           LEFT JOIN image_preparation_records r ON r.upload_id = u.id
          WHERE u.id = :id'
    );
    foreach ($sourceIds as $sid) {
        $check->execute([':id' => $sid]);
        $src = $check->fetch();
        if ($src === false || (int) $src['order_id'] !== $orderId || (int) $src['unit_id'] !== (int) $job['unit_id']) {
            throw new OperationsException('source_not_on_order', 'A named photograph does not belong to this order and record.', 422);
        }
        if (!in_array($src['status'], ['SOURCE_READY', 'PREPARED'], true)) {
            throw new OperationsException('source_not_ready', 'Photograph ' . $sid . ' is ' . strtolower(str_replace('_', ' ', (string) $src['status'])) . '; it must be ready or prepared first.', 409);
        }
    }
    $input = artwork_job_input($pdo, $job);
    $stmt = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM artwork_art_masters WHERE job_id = :j');
    $stmt->execute([':j' => (int) $job['id']]);
    $version = (int) $stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE artwork_art_masters SET is_current = 0 WHERE job_id = :j')->execute([':j' => (int) $job['id']]);
    $pdo->prepare(
        'INSERT INTO artwork_art_masters (job_id, order_id, unit_id, version, creation_method, provider_id, source_upload_ids, personalisation_version,
             input_sha256, stored_name, mime_type, width, height, byte_size, sha256, visual_qc_status, is_current, created_by, created_at)
         VALUES (:j, :o, :u, :v, :m, :p, :s, :pv, :ih, :n, :mime, :w, :h, :b, :sha, :q, 1, :by, UTC_TIMESTAMP())'
    )->execute([
        ':j' => (int) $job['id'], ':o' => $orderId, ':u' => (int) $job['unit_id'], ':v' => $version, ':m' => $method, ':p' => $providerId,
        ':s' => implode(',', $sourceIds), ':pv' => $input['personalisation_version'], ':ih' => hash('sha256', (string) json_encode($input)),
        ':n' => $stored['stored_name'], ':mime' => $image['mime'], ':w' => $image['width'], ':h' => $image['height'], ':b' => $size, ':sha' => $stored['sha256'],
        ':q' => 'PENDING', ':by' => $by,
    ]);
    $artId = (int) $pdo->lastInsertId();
    $pdo->prepare("UPDATE artwork_creative_jobs SET status = 'VISUAL_QC_REQUIRED', current_art_master_id = :a WHERE id = :j")->execute([':a' => $artId, ':j' => (int) $job['id']]);
    // Print files made from an earlier art master no longer count as the current production file.
    foreach (order_artwork_rows($pdo, $orderId) as $row) {
        if ((int) $row['unit_id'] === (int) $job['unit_id'] && $row['status'] === 'READY') {
            $template = artwork_template((string) $row['template_id']);
            $pdo->prepare('UPDATE order_artwork SET status = :s, print_master_id = NULL, art_master_id = NULL WHERE id = :id')
                ->execute([':s' => ($template['status'] ?? '') === 'TEMPLATE_REQUIRED' ? 'TEMPLATE_REQUIRED' : 'INPUT_VALIDATED', ':id' => (int) $row['id']]);
            $pdo->prepare('UPDATE print_production_masters SET is_current = 0 WHERE artwork_id = :a')->execute([':a' => (int) $row['id']]);
        }
    }
    record_order_event($pdo, $orderId, 'ARTWORK.CREATIVE_MASTER_READY', ['art_master_id' => $artId, 'version' => $version, 'method' => $method], "art-master:{$artId}");
    record_order_event($pdo, $orderId, 'ARTWORK.VISUAL_QC_REQUIRED', ['art_master_id' => $artId], "art-visual-qc-required:{$artId}");
    return ['art_master_id' => $artId, 'version' => $version, 'status' => 'VISUAL_QC_REQUIRED'];
}

/**
 * MCB's visual QC of an art master. PASS creates one render job per planned
 * component at the template's current version.
 */
function production_visual_qc(PDO $pdo, int $orderId, int $artId, array $criteria, string $outcome, ?string $note, string $by): array
{
    $stmt = $pdo->prepare('SELECT * FROM artwork_art_masters WHERE id = :id FOR UPDATE');
    $stmt->execute([':id' => $artId]);
    $art = $stmt->fetch();
    if ($art === false || (int) $art['order_id'] !== $orderId) {
        throw new OperationsException('art_master_not_found', 'No such Creative Art Master on this order.', 404);
    }
    if ($art['visual_qc_status'] !== 'PENDING' || (int) $art['is_current'] !== 1) {
        throw new OperationsException('invalid_transition', 'Only the current art master awaiting visual QC can be reviewed.', 409);
    }
    $names = artwork_data()['visual_qc_criteria'];
    $optional = ['facial_visibility', 'mcb_branding'];
    foreach ($names as $k) {
        $v = $criteria[$k] ?? null;
        if (!in_array($v, in_array($k, $optional, true) ? ['PASS', 'CONCERN', 'NOT_APPLICABLE'] : ['PASS', 'CONCERN'], true)) {
            throw new OperationsException('visual_qc_incomplete', 'Mark every visual QC criterion (facial visibility and branding may be not applicable).', 422);
        }
    }
    if (!in_array($outcome, artwork_data()['visual_qc_outcomes'], true)) {
        throw new OperationsException('invalid_outcome', 'Outcome: PASS, REWORK or ESCALATE.', 422);
    }
    if ($outcome === 'PASS' && in_array('CONCERN', $criteria, true)) {
        throw new OperationsException('visual_qc_concern', 'Artwork with a concern cannot pass: rework or escalate.', 422);
    }
    $record = ['by' => $by, 'outcome' => $outcome, 'criteria' => array_intersect_key($criteria, array_flip($names)), 'note' => $note];
    $pdo->prepare('UPDATE artwork_art_masters SET visual_qc_status = :s, visual_qc = :q WHERE id = :id')->execute([':s' => $outcome, ':q' => json_encode($record, JSON_UNESCAPED_UNICODE), ':id' => $artId]);
    $jobStatus = ['PASS' => 'ART_READY', 'REWORK' => 'REWORK_REQUIRED', 'ESCALATE' => 'EXCEPTION'][$outcome];
    $pdo->prepare('UPDATE artwork_creative_jobs SET status = :s WHERE id = :j')->execute([':s' => $jobStatus, ':j' => (int) $art['job_id']]);
    if ($outcome === 'ESCALATE') {
        notify_founders_about_order($pdo, 'ARTWORK_EXCEPTION', $orderId, "art-escalated:{$artId}", ['reason' => 'VISUAL_QC_ESCALATED']);
        return ['outcome' => $outcome];
    }
    if ($outcome === 'REWORK') {
        return ['outcome' => $outcome];
    }
    record_order_event($pdo, $orderId, 'ARTWORK.VISUAL_QC_PASSED', ['art_master_id' => $artId, 'by' => $by], "art-visual-qc-passed:{$artId}");
    $renders = [];
    foreach (order_artwork_rows($pdo, $orderId) as $row) {
        if ((int) $row['unit_id'] !== (int) $art['unit_id']) {
            continue;
        }
        $template = artwork_template((string) $row['template_id']);
        $spec = production_output_spec($template);
        $pdo->prepare(
            'INSERT IGNORE INTO production_render_jobs (order_id, unit_id, artwork_id, art_master_id, sku, template_id, template_version, output_spec, renderer)
             VALUES (:o, :u, :a, :am, (SELECT sku FROM order_units WHERE id = :u2), :t, :v, :spec, :r)'
        )->execute([':o' => $orderId, ':u' => (int) $row['unit_id'], ':a' => (int) $row['id'], ':am' => $artId, ':u2' => (int) $row['unit_id'],
            ':t' => $template['id'], ':v' => (int) $template['version'], ':spec' => json_encode($spec, JSON_UNESCAPED_SLASHES), ':r' => 'MANUAL_EXTERNAL']);
        $pdo->prepare('UPDATE order_artwork SET art_master_id = :am WHERE id = :id')->execute([':am' => $artId, ':id' => (int) $row['id']]);
        $rj = $pdo->prepare('SELECT id FROM production_render_jobs WHERE art_master_id = :am AND template_id = :t AND template_version = :v');
        $rj->execute([':am' => $artId, ':t' => $template['id'], ':v' => (int) $template['version']]);
        $renderId = (int) $rj->fetchColumn();
        $renders[] = $renderId;
        record_order_event($pdo, $orderId, 'PRODUCTION.RENDER_REQUIRED', ['render_job_id' => $renderId, 'template' => $template['id'], 'version' => (int) $template['version']], "render-required:{$renderId}");
    }
    return ['outcome' => $outcome, 'render_job_ids' => $renders];
}

/** The output specification a render must meet, snapshotted from the template (missing geometry stays missing). */
function production_output_spec(array $template): array
{
    return [
        'template_id' => $template['id'], 'template_version' => (int) $template['version'], 'status' => $template['status'],
        'orientation' => $template['orientation'], 'output_px' => $template['output_px'], 'diameter_mm' => $template['diameter_mm'],
        'bleed' => $template['bleed'], 'spine_allowance' => $template['spine_allowance'], 'centre_hole_mm' => $template['centre_hole_mm'],
        'centre_creative_exclusion' => $template['centre_creative_exclusion'], 'safe_inset_mm' => $template['safe_inset_mm'],
        'trim_px' => $template['trim_px'], 'safe_zone_status' => $template['safe_zone_status'] ?? 'UNVERIFIED',
        'missing' => $template['missing'], 'manufacturing_data_required' => $template['manufacturing_data_required'] ?? [],
    ];
}

/* ------------------------------------------------------------------ */
/* Print Production Masters                                            */
/* ------------------------------------------------------------------ */

/**
 * File QC for a print production master. Pure. Every check that cannot apply
 * (unknown geometry) says so; nothing is assumed.
 */
function production_print_file_qc(array $template, array $row, array $art, ?array $render, array $file, array $claim, bool $safeZoneReviewed): array
{
    $base = artwork_output_qc($template, [
        'order_id' => (int) $row['order_id'], 'reference' => $row['reference'], 'template_id' => (string) $row['template_id'],
        'template_version' => (int) $row['template_version'], 'source_upload_id' => $row['source_upload_id'] === null ? null : (int) $row['source_upload_id'],
        'source_order_id' => $row['source_order_id'] === null ? null : (int) $row['source_order_id'],
    ], $file, [
        'order_id' => $claim['order_id'], 'reference' => $claim['reference'], 'template_id' => $claim['template_id'],
        'template_version' => $claim['template_version'], 'manual_source' => $claim['manual_source'],
    ]);
    $checks = $base['checks'];
    $w = $file['width'];
    $h = $file['height'];
    $checks['ORIENTATION'] = match ($template['orientation']) {
        'PORTRAIT' => $w !== null && $h !== null && $h > $w ? 'PASS' : 'FAIL',
        'SQUARE' => $w !== null && $w === $h ? 'PASS' : 'FAIL',
        default => 'NOT_APPLICABLE',
    };
    $checks['TEMPLATE_ID'] = $claim['template_id'] === $template['id'] ? 'PASS' : 'FAIL';
    $checks['TEMPLATE_VERSION'] = ($checks['TEMPLATE_VERSION'] ?? 'PASS') === 'FAIL' || $claim['template_version'] !== (int) $template['version'] ? 'FAIL' : 'PASS';
    $spec = production_output_spec($template);
    $checks['TEMPLATE_METADATA'] = $render !== null && json_decode((string) $render['output_spec'], true) == $spec ? 'PASS' : 'FAIL';
    $checks['BLEED_METADATA'] = $template['status'] === 'TEMPLATE_REQUIRED' ? 'MISSING_FROM_MANUFACTURER' : ($template['bleed'] !== null ? 'PASS' : 'MISSING_FROM_MANUFACTURER');
    $checks['SPINE_METADATA'] = $template['kind'] === 'SLEEVE_FRONT' ? ($template['spine_allowance'] !== null ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE';
    $checks['CENTRE_EXCLUSION_METADATA'] = $template['kind'] === 'PICTURE_DISC' ? ($template['centre_creative_exclusion'] !== null ? 'PASS' : 'FAIL') : 'NOT_APPLICABLE';
    $checks['SAFE_ZONE'] = ($template['safe_zone_status'] ?? 'UNVERIFIED') === 'VERIFIED' ? 'PASS' : ($safeZoneReviewed ? 'MANUAL_REVIEW_PASSED' : 'FAIL');
    $checks['TRIM_METADATA'] = $template['trim_px'] !== null ? 'PASS' : 'MISSING_FROM_MANUFACTURER';
    $checks['SKU_ASSOCIATION'] = $claim['sku'] === $row['unit_sku'] ? 'PASS' : 'FAIL';
    $checks['ART_MASTER_ASSOCIATION'] = $claim['art_master_id'] === (int) $art['id'] && (int) $art['order_id'] === (int) $row['order_id']
        && (int) $art['unit_id'] === (int) $row['unit_id'] && (int) $art['is_current'] === 1 && $art['visual_qc_status'] === 'PASS' ? 'PASS' : 'FAIL';
    $checks['HASH'] = is_string($claim['sha256'] ?? null) && strlen($claim['sha256']) === 64 ? 'PASS' : 'FAIL';
    $failures = array_keys(array_filter($checks, static fn (string $v): bool => $v === 'FAIL'));
    return ['passed' => $failures === [], 'checks' => $checks, 'failures' => $failures];
}

/** Current art master for a record unit, or null. */
function production_current_art_master(PDO $pdo, int $unitId): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM artwork_art_masters WHERE unit_id = :u AND is_current = 1 ORDER BY version DESC LIMIT 1');
    $stmt->execute([':u' => $unitId]);
    $r = $stmt->fetch();
    return $r === false ? null : $r;
}

/* ------------------------------------------------------------------ */
/* Manufacturing package                                               */
/* ------------------------------------------------------------------ */

/** Blockers that mean the manufacturer (or MCB's verification) must still supply information. */
function production_blocker_is_data(string $blocker): bool
{
    return str_starts_with($blocker, 'MANUFACTURER_DATA:') || $blocker === 'CAPACITY_UNVERIFIED';
}

/**
 * Builds the canonical internal Manufacturing Package for a physical order.
 * A new version only when its content changes: repeated builds and repeated
 * events create nothing new. READY only when every gate passes; missing
 * manufacturer information makes it MANUFACTURING_DATA_REQUIRED, never READY.
 */
function build_manufacturing_package(PDO $pdo, int $orderId, string $by): ?array
{
    $order = operations_order_row($pdo, $orderId);
    if ($order === null || $order['status'] !== 'PAID' || order_workflow($order) !== 'PHYSICAL') {
        return null;
    }
    ensure_creative_jobs($pdo, $orderId);
    ensure_artwork_creative_jobs($pdo, $orderId);
    $blockers = [];
    $records = [];
    $artworkRows = order_artwork_rows($pdo, $orderId);
    $units = $pdo->prepare("SELECT u.id, u.sku, u.song_count, i.item_name FROM order_units u JOIN order_items i ON i.id = u.order_item_id WHERE u.order_id = :o AND u.kind = 'SONG' ORDER BY u.id");
    $units->execute([':o' => $orderId]);
    foreach ($units->fetchAll() as $unit) {
        $unitId = (int) $unit['id'];
        $components = array_values(array_filter($artworkRows, static fn (array $r): bool => (int) $r['unit_id'] === $unitId));
        $album = $pdo->prepare('SELECT * FROM creative_albums WHERE unit_id = :u');
        $album->execute([':u' => $unitId]);
        $albumRow = $album->fetch();
        $tracks = [];
        $albumTitle = null;
        if ($albumRow === false) {
            $blockers[] = "RECORD_{$unitId}:CREATIVE_JOBS_MISSING";
        } else {
            foreach (creative_album_jobs($pdo, (int) $albumRow['id']) as $cj) {
                $master = creative_current_master($pdo, (int) $cj['id']);
                $physicalMaster = creative_current_master($pdo, (int) $cj['id'], 'PHYSICAL_MEDIA_MASTER');
                $lyrics = $cj['lyric_version'] === null ? null : creative_artifact($pdo, "job:{$cj['id']}", 'LYRIC_PACKAGE', (int) $cj['lyric_version']);
                if ($master === null || $cj['status'] !== 'MASTER_READY') {
                    $blockers[] = "RECORD_{$unitId}:TRACK_{$cj['track_number']}:AUDIO_MASTER_MISSING";
                }
                $tracks[] = [
                    'track' => (int) $cj['track_number'], 'title' => $lyrics['body']['title'] ?? null,
                    'audio_master_id' => $master === null ? null : (int) $master['id'], 'audio_master_version' => $master === null ? null : (int) $master['version'],
                    'audio_sha256' => $master['sha256'] ?? null, 'container' => $master['container'] ?? null,
                    'duration_seconds' => $master === null || $master['duration_ms'] === null ? null : round(((int) $master['duration_ms']) / 1000, 3),
                    'physical_media_master_id' => $physicalMaster === null ? null : (int) $physicalMaster['id'],
                ];
            }
            if (count($tracks) !== (int) $albumRow['track_count']) {
                $blockers[] = "RECORD_{$unitId}:TRACK_COUNT";
            }
            $albumTitle = creative_artifact($pdo, "album:{$albumRow['id']}", 'ALBUM_MAP')['body']['album_title'] ?? ($tracks[0]['title'] ?? null);
            if ((int) $albumRow['track_count'] > 1 && $albumRow['album_qc_status'] !== 'PASS') {
                $blockers[] = "RECORD_{$unitId}:ALBUM_QC_NOT_PASSED";
            }
            if ((int) $albumRow['track_count'] > 1 && (creative_artifact($pdo, "album:{$albumRow['id']}", 'ALBUM_MAP')['body']['album_title'] ?? null) === null) {
                $blockers[] = "RECORD_{$unitId}:ALBUM_TITLE_MISSING";
            }
            $blockers = array_merge($blockers, match ($albumRow['capacity_status']) {
                'CAPACITY_PASSED' => [],
                'CAPACITY_UNVERIFIED' => ['CAPACITY_UNVERIFIED'],
                'AUDIO_CAPACITY_EXCEPTION' => ["RECORD_{$unitId}:AUDIO_CAPACITY_EXCEPTION"],
                default => ["RECORD_{$unitId}:CAPACITY_CHECK_PENDING"],
            });
        }
        $art = production_current_art_master($pdo, $unitId);
        if ($components !== [] && ($art === null || $art['visual_qc_status'] !== 'PASS')) {
            $blockers[] = "RECORD_{$unitId}:ARTWORK_VISUAL_QC_NOT_PASSED";
        }
        $files = [];
        foreach ($components as $c) {
            $template = artwork_template((string) $c['template_id']);
            $pm = null;
            if ($c['print_master_id'] !== null) {
                $s = $pdo->prepare('SELECT * FROM print_production_masters WHERE id = :id');
                $s->execute([':id' => (int) $c['print_master_id']]);
                $pm = $s->fetch() ?: null;
            }
            if ($c['status'] !== 'READY' || $pm === null || $pm['file_qc_status'] !== 'PASS' || (int) $pm['is_current'] !== 1 || ($art !== null && (int) $pm['art_master_id'] !== (int) $art['id'])) {
                $blockers[] = "RECORD_{$unitId}:PRODUCTION_FILE_NOT_READY:{$c['template_id']}";
            }
            foreach ($template['manufacturing_data_required'] ?? [] as $item) {
                $blockers[] = "MANUFACTURER_DATA:{$c['template_id']}:{$item}";
            }
            $files[] = [
                'component' => $c['template_id'], 'template_version' => (int) $c['template_version'],
                'print_master_id' => $pm === null ? null : (int) $pm['id'], 'print_master_version' => $pm === null ? null : (int) $pm['version'],
                'sha256' => $pm['sha256'] ?? null, 'width' => $pm === null ? null : (int) $pm['width'], 'height' => $pm === null ? null : (int) $pm['height'],
                'art_master_id' => $pm === null ? null : (int) $pm['art_master_id'], 'safe_zone_status' => $pm['safe_zone_status'] ?? null, 'manual' => $pm === null ? null : (int) $pm['manual'] === 1,
            ];
        }
        $records[] = [
            'unit_id' => $unitId, 'sku' => $unit['sku'], 'product' => $unit['item_name'], 'quantity' => 1, 'album_title' => $albumTitle,
            'tracks' => $tracks,
            'programme_seconds' => $tracks === [] || in_array(null, array_column($tracks, 'duration_seconds'), true) ? null : round(array_sum(array_column($tracks, 'duration_seconds')), 3),
            'sides' => $albumRow === false || $albumRow['capacity_result'] === null ? null : (json_decode((string) $albumRow['capacity_result'], true)['sides'] ?? null),
            'capacity' => $albumRow === false ? null : ['status' => $albumRow['capacity_status'], 'profile' => json_decode((string) $albumRow['capacity_result'], true)['profile'] ?? null],
            'album_qc' => $albumRow === false ? null : $albumRow['album_qc_status'],
            'artwork' => ['art_master_id' => $art === null ? null : (int) $art['id'], 'art_master_version' => $art === null ? null : (int) $art['version'], 'visual_qc' => $art['visual_qc_status'] ?? null, 'files' => $files],
            'audio_modified' => false,
        ];
    }
    // Other physical items and the personalisation they need to be made (plaque text, frame heading).
    $others = $pdo->prepare("SELECT u.sku, i.item_name, u.kind, u.plaque_song_title, u.plaque_artist, u.frame_heading FROM order_units u JOIN order_items i ON i.id = u.order_item_id WHERE u.order_id = :o AND u.kind <> 'SONG' ORDER BY u.id");
    $others->execute([':o' => $orderId]);
    $extras = array_map(static fn (array $r): array => array_filter(['sku' => $r['sku'], 'product' => $r['item_name'], 'kind' => $r['kind'], 'plaque_song_title' => $r['plaque_song_title'], 'plaque_artist' => $r['plaque_artist'], 'frame_heading' => $r['frame_heading']], static fn ($v): bool => $v !== null), $others->fetchAll());
    if ($order['qc_passed_at'] === null && !in_array($order['stage'], ['APPROVED', 'PRODUCTION_LOCKED', 'FULFILMENT', 'COMPLETED'], true)) {
        $blockers[] = 'FINAL_MCB_QC_NOT_PASSED';
    }
    $address = $pdo->prepare('SELECT COUNT(*) FROM delivery_addresses WHERE order_id = :o');
    $address->execute([':o' => $orderId]);
    if ((int) $address->fetchColumn() === 0) {
        $blockers[] = 'DELIVERY_ADDRESS_MISSING';
    }
    $blockers = array_values(array_unique($blockers));
    $status = array_filter($blockers, static fn (string $b): bool => !production_blocker_is_data($b)) !== [] ? 'NOT_READY'
        : ($blockers !== [] ? 'MANUFACTURING_DATA_REQUIRED' : 'READY');
    $body = [
        'schema' => 'mcb.manufacturing_package.v1',
        'order' => ['order_id' => $orderId, 'reference' => $order['mcb_reference'], 'reopen_count' => (int) $order['reopen_count']],
        'records' => $records, 'other_items' => $extras,
        'final_mcb_qc' => ['passed_at' => $order['qc_passed_at'], 'passed_by' => $order['qc_passed_by']],
        'delivery' => ['address_on_record' => !in_array('DELIVERY_ADDRESS_MISSING', $blockers, true)],
        'status' => $status, 'blockers' => $blockers,
    ];
    $sha = hash('sha256', (string) json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    record_order_event($pdo, $orderId, 'MANUFACTURING.PACKAGE_REQUIRED', ['reopen' => (int) $order['reopen_count']], "manufacturing-required:{$orderId}:{$order['reopen_count']}");
    $existing = $pdo->prepare('SELECT * FROM manufacturing_packages WHERE order_id = :o AND body_sha256 = :h');
    $existing->execute([':o' => $orderId, ':h' => $sha]);
    $row = $existing->fetch();
    if ($row === false) {
        $v = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM manufacturing_packages WHERE order_id = :o');
        $v->execute([':o' => $orderId]);
        $version = (int) $v->fetchColumn() + 1;
        $pdo->prepare("UPDATE manufacturing_packages SET status = 'SUPERSEDED' WHERE order_id = :o AND status <> 'SUPERSEDED'")->execute([':o' => $orderId]);
        $pdo->prepare('INSERT INTO manufacturing_packages (order_id, version, status, blockers, body, body_sha256, created_by, created_at) VALUES (:o, :v, :s, :b, :body, :h, :by, UTC_TIMESTAMP())')
            ->execute([':o' => $orderId, ':v' => $version, ':s' => $status, ':b' => json_encode($blockers), ':body' => json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ':h' => $sha, ':by' => $by]);
        $existing->execute([':o' => $orderId, ':h' => $sha]);
        $row = $existing->fetch();
    } elseif ($row['status'] === 'SUPERSEDED') {
        // The same content as an earlier version is current again: it is that version, not a copy.
        $pdo->prepare("UPDATE manufacturing_packages SET status = 'SUPERSEDED' WHERE order_id = :o AND status <> 'SUPERSEDED'")->execute([':o' => $orderId]);
        $pdo->prepare('UPDATE manufacturing_packages SET status = :s WHERE id = :id')->execute([':s' => $status, ':id' => (int) $row['id']]);
        $row['status'] = $status;
    }
    $packageId = (int) $row['id'];
    if ($status === 'READY') {
        record_order_event($pdo, $orderId, 'MANUFACTURING.PACKAGE_READY', ['package_id' => $packageId, 'version' => (int) $row['version']], "manufacturing-ready:{$packageId}");
        prepare_supplier_order_pack($pdo, $orderId, $row);
    } elseif ($status === 'MANUFACTURING_DATA_REQUIRED') {
        $key = substr(hash('sha256', implode('|', $blockers)), 0, 16);
        record_order_event($pdo, $orderId, 'MANUFACTURING.DATA_REQUIRED', ['package_id' => $packageId, 'blockers' => count($blockers)], "manufacturing-data:{$orderId}:{$key}");
        notify_founders_about_order($pdo, 'MANUFACTURING_DATA_REQUIRED', $orderId, "manufacturing-data:{$orderId}:{$key}", ['reason' => 'MANUFACTURING_DATA_REQUIRED', 'manufacturing_package' => 'MANUFACTURING_DATA_REQUIRED']);
    }
    return ['package_id' => $packageId, 'version' => (int) $row['version'], 'status' => $status, 'blockers' => $blockers, 'body' => $body];
}

function current_manufacturing_package(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare("SELECT * FROM manufacturing_packages WHERE order_id = :o AND status <> 'SUPERSEDED' ORDER BY version DESC LIMIT 1");
    $stmt->execute([':o' => $orderId]);
    $r = $stmt->fetch();
    return $r === false ? null : $r;
}

/* ------------------------------------------------------------------ */
/* Supplier order pack — STAFF ONLY                                    */
/* ------------------------------------------------------------------ */

/**
 * Internal supplier data, uploaded to the server only (api/data/supplier-orders.json,
 * never in the repository or any public response): per SKU a supplier,
 * product link, configuration, expected cost, shipping allowance and
 * destination limitations. Absent: the pack says the data is not on file.
 */
function supplier_order_data(string $sku): ?array
{
    $path = __DIR__ . '/../data/supplier-orders.json';
    $raw = is_readable($path) ? json_decode((string) file_get_contents($path), true) : null;
    $entry = is_array($raw) ? ($raw['skus'][$sku] ?? null) : null;
    if (!is_array($entry)) {
        return null;
    }
    return [
        'supplier' => is_string($entry['supplier'] ?? null) ? $entry['supplier'] : null,
        'product_url' => is_string($entry['product_url'] ?? null) && str_starts_with($entry['product_url'], 'https://') ? $entry['product_url'] : null,
        'configuration' => is_string($entry['configuration'] ?? null) ? $entry['configuration'] : null,
        'expected_cost_minor' => is_int($entry['expected_cost_minor'] ?? null) ? $entry['expected_cost_minor'] : null,
        'shipping_allowance_minor' => is_int($entry['shipping_allowance_minor'] ?? null) ? $entry['shipping_allowance_minor'] : null,
        'currency' => is_string($entry['currency'] ?? null) ? $entry['currency'] : null,
        'destination_limitations' => is_array($entry['destination_limitations'] ?? null) ? array_values(array_filter($entry['destination_limitations'], 'is_string')) : [],
        'order_notes' => is_string($entry['order_notes'] ?? null) ? $entry['order_notes'] : null,
    ];
}

/**
 * Prepares the pack a person uses to place the order by hand. PREPARED is
 * automatic; financial authorisation is never. A new version only when the
 * content changes.
 */
function prepare_supplier_order_pack(PDO $pdo, int $orderId, array $package): array
{
    $body = json_decode((string) $package['body'], true);
    $address = $pdo->prepare('SELECT recipient_name, address_line_1, address_line_2, city, state_region, postal_code, country, phone FROM delivery_addresses WHERE order_id = :o LIMIT 1');
    $address->execute([':o' => $orderId]);
    $lines = [];
    foreach ($body['records'] as $record) {
        $lines[] = ['sku' => $record['sku'], 'product' => $record['product'], 'quantity' => $record['quantity'], 'supplier_data' => supplier_order_data($record['sku'])];
    }
    foreach ($body['other_items'] as $item) {
        $lines[] = ['sku' => $item['sku'], 'product' => $item['product'], 'quantity' => 1, 'supplier_data' => supplier_order_data($item['sku'])];
    }
    $pack = [
        'schema' => 'mcb.supplier_order_pack.v1', 'package_id' => (int) $package['id'], 'package_version' => (int) $package['version'],
        'reference' => $body['order']['reference'],
        'lines' => array_map(static fn (array $l): array => $l + ['supplier_data_status' => $l['supplier_data'] === null ? 'NOT_ON_FILE' : 'ON_FILE'], $lines),
        'production_files' => array_merge(...array_map(static fn (array $r): array => array_map(static fn (array $f): array => ['component' => $f['component'], 'print_master_id' => $f['print_master_id'], 'template_version' => $f['template_version'], 'sha256' => $f['sha256']], $r['artwork']['files']), $body['records'] ?: [['artwork' => ['files' => []]]])),
        'audio' => array_merge(...array_map(static fn (array $r): array => array_map(static fn (array $t): array => ['track' => $t['track'], 'title' => $t['title'], 'audio_master_id' => $t['audio_master_id'], 'physical_media_master_id' => $t['physical_media_master_id'], 'duration_seconds' => $t['duration_seconds']], $r['tracks']), $body['records'] ?: [['tracks' => []]])),
        'sides' => array_map(static fn (array $r): mixed => $r['sides'], $body['records']),
        'delivery' => $address->fetch() ?: null,
        'financial_authority' => 'Only Bella or Lewis can authorise this purchase, on the order page. This pack authorises nothing.',
    ];
    $sha = hash('sha256', (string) json_encode($pack));
    $existing = $pdo->prepare('SELECT * FROM supplier_order_packs WHERE order_id = :o AND body_sha256 = :h');
    $existing->execute([':o' => $orderId, ':h' => $sha]);
    $row = $existing->fetch();
    if ($row === false) {
        $v = $pdo->prepare('SELECT COALESCE(MAX(version), 0) FROM supplier_order_packs WHERE order_id = :o');
        $v->execute([':o' => $orderId]);
        $version = (int) $v->fetchColumn() + 1;
        $pdo->prepare("UPDATE supplier_order_packs SET status = 'SUPERSEDED' WHERE order_id = :o AND status = 'PREPARED'")->execute([':o' => $orderId]);
        $pdo->prepare('INSERT INTO supplier_order_packs (order_id, package_id, version, status, body, body_sha256, created_at) VALUES (:o, :p, :v, :s, :b, :h, UTC_TIMESTAMP())')
            ->execute([':o' => $orderId, ':p' => (int) $package['id'], ':v' => $version, ':s' => 'PREPARED', ':b' => json_encode($pack, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), ':h' => $sha]);
        $existing->execute([':o' => $orderId, ':h' => $sha]);
        $row = $existing->fetch();
    }
    return $row;
}

function current_supplier_order_pack(PDO $pdo, int $orderId): ?array
{
    $stmt = $pdo->prepare("SELECT * FROM supplier_order_packs WHERE order_id = :o AND status <> 'SUPERSEDED' ORDER BY version DESC LIMIT 1");
    $stmt->execute([':o' => $orderId]);
    $r = $stmt->fetch();
    return $r === false ? null : $r;
}
