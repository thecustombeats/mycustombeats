<?php
/**
 * MCB MEMORY MUSIC VIDEO™ — capacity, production and delivery.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE FILM FOR ONE SONG, ONLY WHILE THERE IS A SPACE
 * ─────────────────────────────────────────────────────────────────────────
 * A customer chooses the enhancement for one song before payment
 * (video_entitlements, AWAITING_PAYMENT). Capacity is a server-side ledger of
 * stored periods:
 *
 *   checkout session → HELD (locked period row; refused when full; the hold
 *                      outlives the Stripe session, so a paid session always
 *                      has its space)
 *   payment webhook  → RESERVED (duplicate events change nothing)
 *   video master     → COMPLETED
 *   abandoned        → EXPIRED when the hold lapses; RELEASED only by a person,
 *                      with a reason, before production has started
 *
 * The planning capacity and the 4-minute maximum were supplied by the
 * Founders and are PENDING EXTERNAL VERIFICATION with the platform.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NO PLATFORM IS CALLED; THE AUDIO MASTER IS NEVER TOUCHED
 * ─────────────────────────────────────────────────────────────────────────
 * Production is MANUAL: a person makes the film on the chosen platform and
 * registers it. The MCB Production Master is referenced by id, version and
 * SHA-256; nothing here trims, re-encodes, shortens or overwrites it. A song
 * longer than the planning maximum goes to a person for a decision.
 */

declare(strict_types=1);

require_once __DIR__ . '/operations.php';

function video_data(): array
{
    static $data = null;
    if ($data === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/video.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        if (!is_array($data)) {
            throw new OperationsException('video_policy_unavailable', 'The video policy is unavailable.', 503);
        }
    }
    return $data;
}

/** Planning capacity per period: server configuration, defaulting to the Founders' planning figure. */
function video_planning_capacity(): int
{
    $configured = mcb_setting('video.capacity_per_period', null);
    return is_int($configured) && $configured >= 0 ? $configured : (int) video_data()['planning_limits']['capacity_per_period'];
}

function video_max_seconds(): int
{
    return (int) video_data()['planning_limits']['max_video_seconds'];
}

/* ------------------------------------------------------------------ */
/* Capacity periods and the ledger                                     */
/* ------------------------------------------------------------------ */

/**
 * The capacity period covering a moment. A stored period (including one the
 * Founders defined) wins; otherwise the planning model's calendar month is
 * created. Stored rows never move, so changing future boundaries cannot
 * corrupt an existing reservation.
 */
function video_period_at(PDO $pdo, ?int $now = null): array
{
    $at = gmdate('Y-m-d H:i:s', $now ?? time());
    $find = $pdo->prepare('SELECT * FROM video_capacity_periods WHERE starts_at <= :a AND ends_at > :b ORDER BY starts_at DESC LIMIT 1');
    $find->execute([':a' => $at, ':b' => $at]);
    $row = $find->fetch();
    if ($row !== false) {
        return $row;
    }
    $start = gmdate('Y-m-01 00:00:00', $now ?? time());
    $end = gmdate('Y-m-01 00:00:00', strtotime($start . ' UTC +1 month'));
    $pdo->prepare('INSERT IGNORE INTO video_capacity_periods (period_key, starts_at, ends_at, capacity, model, basis, source, created_by) VALUES (:k, :s, :e, :c, :m, :b, :src, :by)')
        ->execute([':k' => substr($start, 0, 7), ':s' => $start, ':e' => $end, ':c' => video_planning_capacity(), ':m' => 'CALENDAR_MONTH',
            ':b' => video_data()['capacity_basis'], ':src' => (string) video_data()['planning_limits']['source'], ':by' => 'SYSTEM']);
    $find->execute([':a' => $at, ':b' => $at]);
    return $find->fetch();
}

/** Spaces in use: live holds, reservations and completed videos. */
function video_period_used(PDO $pdo, int $periodId): int
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM video_capacity_reservations
          WHERE period_id = :p AND (status IN ('RESERVED','COMPLETED') OR (status = 'HELD' AND held_until > UTC_TIMESTAMP()))"
    );
    $stmt->execute([':p' => $periodId]);
    return (int) $stmt->fetchColumn();
}

/** The ledger position for staff: planned, held, reserved, completed, remaining. */
function video_capacity(PDO $pdo, ?int $now = null): array
{
    $period = video_period_at($pdo, $now);
    $counts = $pdo->prepare(
        "SELECT SUM(status = 'HELD' AND held_until > UTC_TIMESTAMP()) AS held, SUM(status = 'RESERVED') AS reserved,
                SUM(status = 'COMPLETED') AS completed, SUM(status = 'RELEASED') AS released, SUM(status = 'EXPIRED' OR (status = 'HELD' AND held_until <= UTC_TIMESTAMP())) AS expired
           FROM video_capacity_reservations WHERE period_id = :p"
    );
    $counts->execute([':p' => (int) $period['id']]);
    $c = array_map('intval', $counts->fetch() ?: []);
    $used = ($c['held'] ?? 0) + ($c['reserved'] ?? 0) + ($c['completed'] ?? 0);
    $capacity = (int) $period['capacity'];
    $remaining = max(0, $capacity - $used);
    return [
        'period_key' => $period['period_key'], 'starts_at' => $period['starts_at'], 'ends_at' => $period['ends_at'],
        'capacity' => $capacity, 'held' => $c['held'] ?? 0, 'reserved' => $c['reserved'] ?? 0, 'completed' => $c['completed'] ?? 0,
        'released' => $c['released'] ?? 0, 'expired' => $c['expired'] ?? 0, 'remaining' => $remaining,
        'state' => $remaining === 0 ? 'FULL' : ($remaining <= (int) video_data()['capacity_low_threshold'] ? 'LOW' : 'AVAILABLE'),
        'basis' => $period['basis'], 'verification' => $period['basis'] === 'VERIFIED' ? 'VERIFIED' : 'PENDING_EXTERNAL_VERIFICATION',
        'model' => $period['model'], 'source' => $period['source'],
    ];
}

/**
 * What a customer may be told. Truthful only: "limited monthly availability"
 * always; the number of spaces only when it is small enough to matter; fully
 * booked when it is. Never a fabricated count.
 */
function video_customer_availability(PDO $pdo): array
{
    $c = video_capacity($pdo);
    $showCount = $c['remaining'] > 0 && $c['remaining'] <= 10;
    return [
        'sku' => video_data()['sku'],
        'price_minor' => (int) video_data()['price_minor'],
        'available' => $c['remaining'] > 0,
        'message' => $c['remaining'] === 0
            ? 'Memory Music Video is fully booked for this production month.'
            : ($showCount ? $c['remaining'] . ' video ' . ($c['remaining'] === 1 ? 'space' : 'spaces') . ' remaining this month.' : 'Limited monthly availability.'),
        'remaining' => $showCount ? $c['remaining'] : null,
        'period' => $c['period_key'],
    ];
}

/** Locks the current period row (it must exist: call video_period_at() first, outside the transaction). */
function video_lock_current_period(PDO $pdo): array
{
    $at = gmdate('Y-m-d H:i:s');
    $stmt = $pdo->prepare('SELECT * FROM video_capacity_periods WHERE starts_at <= :a AND ends_at > :b ORDER BY starts_at DESC LIMIT 1 FOR UPDATE');
    $stmt->execute([':a' => $at, ':b' => $at]);
    $period = $stmt->fetch();
    if ($period === false) {
        throw new OperationsException('video_period_unavailable', 'Memory Music Video availability could not be checked just now. Please try again.', 503);
    }
    return $period;
}

/**
 * Runs capacity work in a transaction, retrying a few times when concurrent
 * checkouts collide (deadlock, lock wait, or a snapshot that changed). The
 * work is idempotent, so a retry never double-counts.
 */
function video_transaction(callable $work): mixed
{
    for ($attempt = 1; ; $attempt++) {
        try {
            return db_transaction($work);
        } catch (PDOException $e) {
            $code = (int) ($e->errorInfo[1] ?? 0);
            if ($attempt < 5 && in_array($code, [1020, 1205, 1213], true)) {
                usleep(random_int(20000, 120000));
                continue;
            }
            throw $e;
        }
    }
}

/**
 * Holds a space for each video in an order, inside the caller's transaction,
 * before a checkout session is created. Refuses when the period is full, so a
 * customer is never taken to payment for a video without a space.
 */
function video_hold_for_checkout(PDO $pdo, int $orderId): int
{
    // The period row is locked FIRST, before any plain read, so concurrent
    // checkouts queue here and each counts what the one before committed.
    $period = video_lock_current_period($pdo);
    $stmt = $pdo->prepare("SELECT * FROM video_entitlements WHERE order_id = :o AND status = 'AWAITING_PAYMENT' ORDER BY id FOR UPDATE");
    $stmt->execute([':o' => $orderId]);
    $entitlements = $stmt->fetchAll();
    if ($entitlements === []) {
        return 0;
    }
    $pdo->prepare("UPDATE video_capacity_reservations SET status = 'EXPIRED' WHERE period_id = :p AND status = 'HELD' AND held_until <= UTC_TIMESTAMP()")
        ->execute([':p' => (int) $period['id']]);
    $minutes = (int) video_data()['hold_minutes'];
    $held = 0;
    foreach ($entitlements as $e) {
        $r = $pdo->prepare('SELECT * FROM video_capacity_reservations WHERE entitlement_id = :e FOR UPDATE');
        $r->execute([':e' => (int) $e['id']]);
        $existing = $r->fetch();
        if ($existing !== false && in_array($existing['status'], ['HELD', 'RESERVED', 'COMPLETED'], true)) {
            if ($existing['status'] === 'HELD') {
                $pdo->prepare('UPDATE video_capacity_reservations SET held_until = GREATEST(held_until, UTC_TIMESTAMP() + INTERVAL :m MINUTE) WHERE id = :id')
                    ->execute([':m' => $minutes, ':id' => (int) $existing['id']]);
            }
            $held++;
            continue;
        }
        if (video_period_used($pdo, (int) $period['id']) >= (int) $period['capacity']) {
            throw new OperationsException('video_capacity_full', 'Memory Music Video is fully booked for this production month. Please remove it to continue.', 409);
        }
        if ($existing !== false) {
            $pdo->prepare("UPDATE video_capacity_reservations SET period_id = :p, status = 'HELD', held_until = UTC_TIMESTAMP() + INTERVAL :m MINUTE, reserved_at = NULL, released_at = NULL WHERE id = :id")
                ->execute([':p' => (int) $period['id'], ':m' => $minutes, ':id' => (int) $existing['id']]);
        } else {
            $pdo->prepare("INSERT INTO video_capacity_reservations (period_id, entitlement_id, order_id, status, held_until) VALUES (:p, :e, :o, 'HELD', UTC_TIMESTAMP() + INTERVAL :m MINUTE)")
                ->execute([':p' => (int) $period['id'], ':e' => (int) $e['id'], ':o' => $orderId, ':m' => $minutes]);
        }
        $held++;
    }
    return $held;
}

/**
 * On confirmed payment (the webhook, after the PAID transaction commits): the hold
 * becomes a reservation and the video job is created. If, exceptionally, no
 * space exists any more (a hold that lapsed and was taken), the video is not
 * oversold: the entitlement becomes a CAPACITY_EXCEPTION for the Founders to
 * resolve with the customer. Nothing is refunded automatically.
 */
function video_confirm_on_payment(PDO $pdo, int $orderId): array
{
    $out = ['reserved' => 0, 'exceptions' => 0];
    // Locking reads only until every lock is held (no stale snapshot under concurrency).
    $pending = $pdo->prepare("SELECT e.id FROM video_entitlements e JOIN orders o ON o.id = e.order_id AND o.status = 'PAID' WHERE e.order_id = :o AND e.status = 'AWAITING_PAYMENT' FOR UPDATE");
    $pending->execute([':o' => $orderId]);
    if ($pending->fetchAll() === []) {
        return $out;
    }
    // Locks first (period, then this order's entitlements and reservations), then counts.
    $period = video_lock_current_period($pdo);
    $stmt = $pdo->prepare("SELECT * FROM video_entitlements WHERE order_id = :o AND status = 'AWAITING_PAYMENT' ORDER BY id FOR UPDATE");
    $stmt->execute([':o' => $orderId]);
    foreach ($stmt->fetchAll() as $e) {
        $r = $pdo->prepare('SELECT * FROM video_capacity_reservations WHERE entitlement_id = :e FOR UPDATE');
        $r->execute([':e' => (int) $e['id']]);
        $existing = $r->fetch();
        $reserved = false;
        if ($existing !== false && $existing['status'] === 'HELD') {
            // The space held at checkout (Stripe sessions end before the hold does).
            $pdo->prepare("UPDATE video_capacity_reservations SET status = 'RESERVED', reserved_at = UTC_TIMESTAMP(), held_until = NULL WHERE id = :id")->execute([':id' => (int) $existing['id']]);
            $reserved = true;
        } elseif ($existing !== false && in_array($existing['status'], ['RESERVED', 'COMPLETED'], true)) {
            $reserved = true;
        } elseif (video_period_used($pdo, (int) $period['id']) < (int) $period['capacity']) {
            if ($existing !== false) {
                $pdo->prepare("UPDATE video_capacity_reservations SET period_id = :p, status = 'RESERVED', reserved_at = UTC_TIMESTAMP(), held_until = NULL WHERE id = :id")
                    ->execute([':p' => (int) $period['id'], ':id' => (int) $existing['id']]);
            } else {
                $pdo->prepare("INSERT INTO video_capacity_reservations (period_id, entitlement_id, order_id, status, reserved_at) VALUES (:p, :e, :o, 'RESERVED', UTC_TIMESTAMP())")
                    ->execute([':p' => (int) $period['id'], ':e' => (int) $e['id'], ':o' => $orderId]);
            }
            $reserved = true;
        }
        if ($reserved) {
            $pdo->prepare("UPDATE video_entitlements SET status = 'ENTITLED' WHERE id = :id")->execute([':id' => (int) $e['id']]);
            $pdo->prepare("INSERT IGNORE INTO video_jobs (order_id, entitlement_id, status, waiting_on) VALUES (:o, :e, 'INPUT_REQUIRED', 'CUSTOMER_PHOTOGRAPHS')")
                ->execute([':o' => $orderId, ':e' => (int) $e['id']]);
            record_order_event($pdo, $orderId, 'VIDEO.ENTITLED', ['entitlement_id' => (int) $e['id']], "video-entitled:{$e['id']}");
            $out['reserved']++;
        } else {
            $pdo->prepare("UPDATE video_entitlements SET status = 'CAPACITY_EXCEPTION' WHERE id = :id")->execute([':id' => (int) $e['id']]);
            record_order_event($pdo, $orderId, 'VIDEO.CAPACITY_EXCEPTION', ['entitlement_id' => (int) $e['id']], "video-capacity-exception:{$e['id']}");
            notify_founders_about_order($pdo, 'VIDEO_EXCEPTION', $orderId, "video-capacity-exception:{$e['id']}", ['reason' => 'PAID_WITHOUT_CAPACITY']);
            $out['exceptions']++;
        }
    }
    if ($out['reserved'] > 0) {
        video_capacity_alerts($pdo);
    }
    return $out;
}

/** Tells the Founders once per period when capacity runs low or is full. */
function video_capacity_alerts(PDO $pdo): void
{
    $c = video_capacity($pdo);
    if ($c['state'] === 'AVAILABLE') {
        return;
    }
    queue_founder_notification($pdo, 'VIDEO_CAPACITY_ALERT', null, 'video-' . $c['period_key'], "video-capacity:{$c['period_key']}:{$c['state']}", [
        'state' => $c['state'], 'reason' => $c['state'] === 'FULL' ? 'VIDEO_CAPACITY_FULL' : 'VIDEO_CAPACITY_LOW',
        'required_action' => founder_notification_types()['VIDEO_CAPACITY_ALERT']['required_action'] ?? null,
        'action_url' => rtrim((string) mcb_setting('app.site_origin', 'https://www.mycustombeats.com'), '/') . '/command-centre#view=videos',
    ]);
}

/* ------------------------------------------------------------------ */
/* Jobs                                                                */
/* ------------------------------------------------------------------ */

function video_job_row(PDO $pdo, int $jobId, bool $lock = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT j.*, e.memory_id, e.unit_id, e.price_minor, e.status AS entitlement_status, m.sequence AS song, o.mcb_reference
           FROM video_jobs j JOIN video_entitlements e ON e.id = j.entitlement_id JOIN order_memories m ON m.id = e.memory_id JOIN orders o ON o.id = j.order_id
          WHERE j.id = :id' . ($lock ? ' FOR UPDATE' : '')
    );
    $stmt->execute([':id' => $jobId]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

/** The current MCB Production Master for the job's song, or null while the song is being made. */
function video_audio_master(PDO $pdo, array $job): ?array
{
    $stmt = $pdo->prepare("SELECT m.* FROM creative_jobs cj JOIN creative_masters m ON m.job_id = cj.id AND m.kind = 'PRODUCTION_MASTER' AND m.is_current = 1 WHERE cj.memory_id = :mem ORDER BY m.version DESC LIMIT 1");
    $stmt->execute([':mem' => (int) $job['memory_id']]);
    $row = $stmt->fetch();
    return $row === false ? null : $row;
}

function video_set_job(PDO $pdo, int $jobId, array $fields): void
{
    $sets = implode(', ', array_map(static fn (string $k): string => "{$k} = :{$k}", array_keys($fields)));
    $pdo->prepare("UPDATE video_jobs SET {$sets} WHERE id = :id")->execute(array_combine(array_map(static fn (string $k): string => ":{$k}", array_keys($fields)), array_values($fields)) + [':id' => $jobId]);
}

/**
 * Moves a job forward where the facts allow: inputs confirmed → READY; audio
 * master present and within the planning maximum → PRODUCTION_REQUIRED with
 * the master's lineage recorded. Longer songs wait for platform verification.
 */
function video_refresh_job(PDO $pdo, int $jobId): array
{
    $job = video_job_row($pdo, $jobId, true);
    if ($job === null) {
        throw new OperationsException('video_job_not_found', 'No such video job.', 404);
    }
    if ($job['status'] === 'INPUT_REQUIRED' && $job['inputs_confirmed_at'] !== null) {
        video_set_job($pdo, $jobId, ['status' => 'READY', 'waiting_on' => 'AUDIO_MASTER']);
        record_order_event($pdo, (int) $job['order_id'], 'VIDEO.INPUT_RECEIVED', ['video_job_id' => $jobId], "video-input:{$jobId}");
        $job = video_job_row($pdo, $jobId, true);
    }
    if ($job['status'] !== 'READY') {
        return $job;
    }
    $master = video_audio_master($pdo, $job);
    if ($master === null) {
        return $job;
    }
    $seconds = $master['duration_ms'] === null ? null : (int) $master['duration_ms'] / 1000;
    // Longer than the planning maximum: no film is promised or started for it until the
    // platform's real limit is verified. Staff can only escalate; the song is never edited.
    $eligible = $seconds !== null && $seconds <= video_max_seconds();
    if (!$eligible) {
        if ($job['duration_status'] !== 'VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED') {
            video_set_job($pdo, $jobId, ['duration_status' => 'VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED', 'waiting_on' => 'PROVIDER_VERIFICATION', 'audio_duration_ms' => $master['duration_ms']]);
            record_order_event($pdo, (int) $job['order_id'], 'VIDEO.DURATION_PROVIDER_VERIFICATION_REQUIRED', ['video_job_id' => $jobId, 'seconds' => $seconds === null ? null : (int) round($seconds), 'planning_maximum_seconds' => video_max_seconds(), 'verification' => video_data()['planning_limits']['verification']], "video-duration-review:{$jobId}:{$master['id']}");
        }
        return video_job_row($pdo, $jobId);
    }
    video_set_job($pdo, $jobId, [
        'status' => 'PRODUCTION_REQUIRED', 'waiting_on' => 'PRODUCTION',
        'duration_status' => 'VIDEO_DURATION_ELIGIBLE',
        'audio_master_id' => (int) $master['id'], 'audio_master_version' => (int) $master['version'],
        'audio_master_sha256' => $master['sha256'], 'audio_duration_ms' => $master['duration_ms'],
    ]);
    record_order_event($pdo, (int) $job['order_id'], 'VIDEO.PRODUCTION_REQUIRED', ['video_job_id' => $jobId, 'audio_master_id' => (int) $master['id']], "video-production-required:{$jobId}:{$master['id']}");
    return video_job_row($pdo, $jobId);
}

function video_refresh_order(PDO $pdo, int $orderId): void
{
    $stmt = $pdo->prepare("SELECT id FROM video_jobs WHERE order_id = :o AND status IN ('INPUT_REQUIRED','READY')");
    $stmt->execute([':o' => $orderId]);
    foreach ($stmt->fetchAll(PDO::FETCH_COLUMN) as $id) {
        video_refresh_job($pdo, (int) $id);
    }
}

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

function video_storage(string $kind): ?string
{
    $base = upload_directory();
    if ($base === null) {
        return null;
    }
    $dir = $base . '/video/' . $kind;
    return is_dir($dir) || @mkdir($dir, 0700, true) ? $dir : null;
}

/**
 * Identifies an MP4 or QuickTime file by its own boxes and reads its duration
 * and picture size from the movie and track headers. Header reading only:
 * nothing is decoded or re-encoded.
 *
 * @return array{container:?string, duration_ms:?int, width:?int, height:?int}
 */
function video_inspect_file(string $path): array
{
    $out = ['container' => null, 'duration_ms' => null, 'width' => null, 'height' => null];
    $h = @fopen($path, 'rb');
    if ($h === false) {
        return $out;
    }
    $size = (int) filesize($path);
    $readBoxes = static function (int $start, int $end, callable $visit) use ($h, $size): void {
        $pos = $start;
        $guard = 0;
        while ($pos + 8 <= $end && $guard++ < 10000) {
            fseek($h, $pos);
            $head = fread($h, 8);
            if ($head === false || strlen($head) < 8) {
                return;
            }
            $len = unpack('N', substr($head, 0, 4))[1];
            $type = substr($head, 4, 4);
            $headerLen = 8;
            if ($len === 1) {
                $big = fread($h, 8);
                if ($big === false || strlen($big) < 8) {
                    return;
                }
                $parts = unpack('N2', $big);
                $len = ($parts[1] << 32) | $parts[2];
                $headerLen = 16;
            } elseif ($len === 0) {
                $len = $end - $pos;
            }
            if ($len < $headerLen || $pos + $len > $end) {
                return;
            }
            $visit($type, $pos + $headerLen, $pos + $len);
            $pos += $len;
        }
    };
    $readBoxes(0, $size, static function (string $type, int $body, int $end) use (&$out, $h, $readBoxes): void {
        if ($type === 'ftyp') {
            fseek($h, $body);
            $brand = (string) fread($h, 4);
            $out['container'] = $brand === 'qt  ' ? 'MOV' : (in_array($brand, ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'M4V ', 'dash'], true) ? 'MP4' : null);
        }
        if ($type !== 'moov') {
            return;
        }
        $readBoxes($body, $end, static function (string $t, int $b, int $e) use (&$out, $h, $readBoxes): void {
            if ($t === 'mvhd') {
                fseek($h, $b);
                $version = ord((string) fread($h, 1));
                fread($h, 3);
                if ($version === 1) {
                    fread($h, 16);
                    $scale = unpack('N', (string) fread($h, 4))[1];
                    $d = unpack('N2', (string) fread($h, 8));
                    $duration = ($d[1] << 32) | $d[2];
                } else {
                    fread($h, 8);
                    $scale = unpack('N', (string) fread($h, 4))[1];
                    $duration = unpack('N', (string) fread($h, 4))[1];
                }
                if ($scale > 0) {
                    $out['duration_ms'] = (int) round($duration * 1000 / $scale);
                }
            }
            if ($t === 'trak') {
                $readBoxes($b, $e, static function (string $tt, int $bb, int $ee) use (&$out, $h): void {
                    if ($tt !== 'tkhd') {
                        return;
                    }
                    fseek($h, $bb);
                    $version = ord((string) fread($h, 1));
                    fseek($h, $bb + ($version === 1 ? 88 : 76));
                    $dims = fread($h, 8);
                    if ($dims !== false && strlen($dims) === 8) {
                        $wh = unpack('N2', $dims);
                        $w = (int) ($wh[1] >> 16);
                        $hgt = (int) ($wh[2] >> 16);
                        if ($w > 0 && $hgt > 0 && ($out['width'] === null || $w > $out['width'])) {
                            $out['width'] = $w;
                            $out['height'] = $hgt;
                        }
                    }
                });
            }
        });
    });
    fclose($h);
    return $out;
}

/**
 * Registers a video a person produced. The file is stored privately and
 * checked; its lineage records the audio master it was made from, which must
 * still be the song's current, unchanged master.
 */
function video_register_candidate(PDO $pdo, array $job, string $storedName, int $bytes, string $sha, array $inspect, ?string $externalReference, string $staff): array
{
    $jobId = (int) $job['id'];
    if (!in_array($job['status'], ['PRODUCTION_IN_PROGRESS'], true)) {
        throw new OperationsException('invalid_transition', 'A video can be registered once production has started (START_PRODUCTION).', 409);
    }
    $master = video_audio_master($pdo, $job);
    if ($master === null || (int) $master['id'] !== (int) $job['audio_master_id'] || $master['sha256'] !== $job['audio_master_sha256']) {
        throw new OperationsException('audio_master_changed', 'The song\'s Production Master is not the one this video job was prepared from. Refresh the job before registering a video.', 409);
    }
    if ($inspect['container'] === null) {
        throw new OperationsException('video_unreadable', 'That file is not a readable MP4 or MOV video.', 422);
    }
    $audioMs = (int) $job['audio_duration_ms'];
    $checks = [
        'FILE_TYPE' => 'PASS',
        'DURATION_READABLE' => $inspect['duration_ms'] === null ? 'NOT_AVAILABLE' : 'PASS',
        'PICTURE_SIZE_READABLE' => $inspect['width'] === null ? 'NOT_AVAILABLE' : 'PASS',
        // The whole song: the film should run for the song's length (±3 s). A person confirms in QC.
        'COVERS_WHOLE_SONG' => $inspect['duration_ms'] === null ? 'NOT_AVAILABLE' : (abs($inspect['duration_ms'] - $audioMs) <= 3000 ? 'PASS' : 'CONCERN'),
        'AUDIO_MASTER_LINEAGE' => 'PASS',
        'HASH_RECORDED' => strlen($sha) === 64 ? 'PASS' : 'FAIL',
    ];
    $version = (int) $pdo->query('SELECT COALESCE(MAX(version), 0) + 1 FROM video_candidates WHERE video_job_id = ' . $jobId)->fetchColumn();
    $pdo->prepare(
        'INSERT INTO video_candidates (video_job_id, order_id, version, stored_name, container, byte_size, sha256, duration_ms, width, height, audio_master_id, audio_master_sha256, production_method, external_reference, technical_checks, created_by)
         VALUES (:j, :o, :v, :n, :c, :b, :sha, :d, :w, :h, :am, :ash, :pm, :ext, :tc, :by)'
    )->execute([':j' => $jobId, ':o' => (int) $job['order_id'], ':v' => $version, ':n' => $storedName, ':c' => $inspect['container'], ':b' => $bytes, ':sha' => $sha,
        ':d' => $inspect['duration_ms'], ':w' => $inspect['width'], ':h' => $inspect['height'], ':am' => (int) $job['audio_master_id'], ':ash' => (string) $job['audio_master_sha256'],
        ':pm' => 'MANUAL', ':ext' => $externalReference, ':tc' => json_encode($checks), ':by' => $staff]);
    $candidateId = (int) $pdo->lastInsertId();
    video_set_job($pdo, $jobId, ['status' => 'CANDIDATE_READY', 'waiting_on' => null]);
    record_order_event($pdo, (int) $job['order_id'], 'VIDEO.CANDIDATE_READY', ['video_job_id' => $jobId, 'candidate_id' => $candidateId, 'version' => $version], "video-candidate:{$candidateId}");
    video_set_job($pdo, $jobId, ['status' => 'QUALITY_CHECK_REQUIRED', 'waiting_on' => 'QUALITY_CHECK']);
    record_order_event($pdo, (int) $job['order_id'], 'VIDEO.QUALITY_CHECK_REQUIRED', ['video_job_id' => $jobId, 'candidate_id' => $candidateId], "video-qc-required:{$candidateId}");
    return ['candidate_id' => $candidateId, 'version' => $version, 'checks' => $checks, 'job_status' => 'QUALITY_CHECK_REQUIRED'];
}

/**
 * MCB's video quality check: PASS (the candidate becomes a new, immutable
 * Video Master version), REWORK (internal; the customer is not contacted) or
 * ESCALATE (the Founders are told).
 */
function video_quality_check(PDO $pdo, array $job, int $candidateId, mixed $criteria, mixed $outcome, ?string $note, string $staff): array
{
    $jobId = (int) $job['id'];
    if ($job['status'] !== 'QUALITY_CHECK_REQUIRED') {
        throw new OperationsException('invalid_transition', 'This video is not waiting for a quality check.', 409);
    }
    $stmt = $pdo->prepare('SELECT * FROM video_candidates WHERE id = :id FOR UPDATE');
    $stmt->execute([':id' => $candidateId]);
    $c = $stmt->fetch();
    if ($c === false || (int) $c['video_job_id'] !== $jobId || (int) $c['order_id'] !== (int) $job['order_id']) {
        throw new OperationsException('candidate_not_found', 'No such video on this job.', 404);
    }
    if ($c['qc_status'] !== 'PENDING') {
        throw new OperationsException('invalid_transition', 'This video has already been checked.', 409);
    }
    $names = video_data()['qc_criteria'];
    $optional = video_data()['qc_optional'];
    $criteria = is_array($criteria) ? $criteria : [];
    foreach ($names as $k) {
        if (!in_array($criteria[$k] ?? null, in_array($k, $optional, true) ? ['PASS', 'CONCERN', 'NOT_APPLICABLE'] : ['PASS', 'CONCERN'], true)) {
            throw new OperationsException('video_qc_incomplete', 'Mark every video quality criterion (branding may be not applicable).', 422);
        }
    }
    if (!in_array($outcome, video_data()['qc_outcomes'], true)) {
        throw new OperationsException('invalid_outcome', 'Outcome: PASS, REWORK or ESCALATE.', 422);
    }
    if ($outcome === 'PASS' && in_array('CONCERN', $criteria, true)) {
        throw new OperationsException('video_qc_concern', 'A video with a concern cannot pass: send it back for internal rework or escalate.', 422);
    }
    $record = ['by' => $staff, 'outcome' => $outcome, 'criteria' => array_intersect_key($criteria, array_flip($names)), 'note' => $note, 'at' => gmdate('Y-m-d H:i:s')];
    $pdo->prepare('UPDATE video_candidates SET qc_status = :s, qc = :q WHERE id = :id')->execute([':s' => $outcome, ':q' => json_encode($record, JSON_UNESCAPED_UNICODE), ':id' => $candidateId]);
    $orderId = (int) $job['order_id'];
    $result = ['outcome' => $outcome];
    if ($outcome === 'PASS') {
        // The Video Master is a byte-for-byte copy of the checked candidate, verified by hash, kept apart and never overwritten.
        $from = video_storage('candidates');
        $to = video_storage('masters');
        if ($from === null || $to === null || !is_file($from . '/' . $c['stored_name'])) {
            throw new OperationsException('storage_unavailable', 'The checked video file is not available; nothing was changed.', 503);
        }
        if (!is_file($to . '/' . $c['stored_name']) && !copy($from . '/' . $c['stored_name'], $to . '/' . $c['stored_name'])) {
            throw new OperationsException('storage_unavailable', 'The Video Master could not be stored; nothing was changed.', 503);
        }
        @chmod($to . '/' . $c['stored_name'], 0600);
        if (hash_file('sha256', $to . '/' . $c['stored_name']) !== $c['sha256']) {
            throw new OperationsException('video_integrity', 'The stored Video Master does not match the checked video; nothing was changed.', 500);
        }
        $version = (int) $pdo->query('SELECT COALESCE(MAX(version), 0) + 1 FROM video_masters WHERE video_job_id = ' . $jobId)->fetchColumn();
        $pdo->prepare('UPDATE video_masters SET is_current = 0 WHERE video_job_id = :j')->execute([':j' => $jobId]);
        $pdo->prepare(
            'INSERT INTO video_masters (video_job_id, order_id, version, candidate_id, audio_master_id, audio_master_version, audio_master_sha256, stored_name, container, byte_size, sha256, duration_ms, width, height, qc_evidence, is_current, created_by)
             VALUES (:j, :o, :v, :c, :am, :amv, :ash, :n, :ct, :b, :sha, :d, :w, :h, :qc, 1, :by)'
        )->execute([':j' => $jobId, ':o' => $orderId, ':v' => $version, ':c' => $candidateId, ':am' => (int) $c['audio_master_id'], ':amv' => (int) $job['audio_master_version'],
            ':ash' => $c['audio_master_sha256'], ':n' => $c['stored_name'], ':ct' => $c['container'], ':b' => (int) $c['byte_size'], ':sha' => $c['sha256'],
            ':d' => $c['duration_ms'], ':w' => $c['width'], ':h' => $c['height'], ':qc' => json_encode(['qc' => $record, 'technical' => json_decode((string) $c['technical_checks'], true), 'provenance' => 'CANDIDATE_FILE_UNCHANGED']), ':by' => $staff]);
        $masterId = (int) $pdo->lastInsertId();
        video_set_job($pdo, $jobId, ['status' => 'READY_FOR_REVEAL', 'waiting_on' => 'REVEAL', 'current_video_master_id' => $masterId]);
        $pdo->prepare("UPDATE video_capacity_reservations SET status = 'COMPLETED', completed_at = UTC_TIMESTAMP() WHERE entitlement_id = :e AND status = 'RESERVED'")->execute([':e' => (int) $job['entitlement_id']]);
        record_order_event($pdo, $orderId, 'VIDEO.MASTER_READY', ['video_job_id' => $jobId, 'video_master_id' => $masterId, 'version' => $version], "video-master:{$masterId}");
        $result += ['video_master_id' => $masterId, 'version' => $version];
    } elseif ($outcome === 'REWORK') {
        video_set_job($pdo, $jobId, ['status' => 'REWORK_REQUIRED', 'waiting_on' => 'PRODUCTION', 'rework_count' => (int) $job['rework_count'] + 1]);
        record_order_event($pdo, $orderId, 'VIDEO.REWORK_REQUIRED', ['video_job_id' => $jobId, 'candidate_id' => $candidateId], "video-rework:{$candidateId}");
    } else {
        video_set_job($pdo, $jobId, ['status' => 'EXCEPTION', 'waiting_on' => 'FOUNDERS', 'exception_reason' => 'QC_ESCALATED']);
        record_order_event($pdo, $orderId, 'VIDEO.EXCEPTION', ['video_job_id' => $jobId, 'reason' => 'QC_ESCALATED'], "video-exception:{$candidateId}");
        notify_founders_about_order($pdo, 'VIDEO_EXCEPTION', $orderId, "video-escalated:{$candidateId}", ['reason' => 'VIDEO_QC_ESCALATED']);
    }
    record_order_event($pdo, $orderId, 'FOUNDER.QUALITY_REVIEWED', ['kind' => 'VIDEO', 'candidate_id' => $candidateId, 'decision' => $outcome, 'by' => $staff, 'with_note' => $note !== null]);
    return $result + ['job_status' => video_job_row($pdo, $jobId)['status']];
}

/**
 * Staff actions on a video job (production workflow). Inside the caller's
 * transaction. Returns what happened and any customer message to send.
 */
function video_staff_action(PDO $pdo, int $orderId, int $jobId, string $action, array $in, string $staff): array
{
    $job = video_job_row($pdo, $jobId, true);
    if ($job === null || (int) $job['order_id'] !== $orderId) {
        throw new OperationsException('video_job_not_found', 'No such video job on this order.', 404);
    }
    $result = ['messages' => []];
    switch ($action) {
        case 'CONFIRM_INPUTS':
            if ($job['status'] !== 'INPUT_REQUIRED') {
                throw new OperationsException('invalid_transition', 'The inputs for this video are already confirmed.', 409);
            }
            video_set_job($pdo, $jobId, ['inputs_confirmed_at' => gmdate('Y-m-d H:i:s'), 'inputs_confirmed_by' => $staff]);
            break;
        case 'SET_VISUAL_DIRECTION':
            $direction = operations_text($in['visual_direction'] ?? null, 1000);
            if ($direction === null) {
                throw new OperationsException('invalid_direction', 'Write the visual direction.', 422);
            }
            video_set_job($pdo, $jobId, ['visual_direction' => $direction]);
            break;
        case 'DURATION_REVIEW':
            if ($job['duration_status'] !== 'VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED' || $job['status'] !== 'READY') {
                throw new OperationsException('invalid_transition', 'This song does not need a duration review.', 409);
            }
            $decision = $in['decision'] ?? null;
            if ($decision === 'PROCEED_FULL_SONG') {
                // Not offered until the platform's maximum length is verified: MCB does not promise a longer film.
                throw new OperationsException('provider_verification_required', 'A film longer than ' . intdiv(video_max_seconds(), 60) . ' minutes cannot be promised until the platform\'s maximum length is verified. Escalate to the Founders; the song is never shortened.', 409);
            }
            if (!in_array($decision, video_data()['duration_decisions'], true)) {
                throw new OperationsException('invalid_decision', 'Escalate to the Founders. The song itself is never shortened.', 422);
            }
            video_set_job($pdo, $jobId, ['duration_decision' => $decision, 'status' => 'EXCEPTION', 'waiting_on' => 'FOUNDERS', 'exception_reason' => 'SONG_LONGER_THAN_PLANNING_MAXIMUM']);
            record_order_event($pdo, $orderId, 'VIDEO.EXCEPTION', ['video_job_id' => $jobId, 'reason' => 'DURATION_PROVIDER_VERIFICATION_REQUIRED'], "video-exception-duration:{$jobId}");
            notify_founders_about_order($pdo, 'VIDEO_EXCEPTION', $orderId, "video-duration:{$jobId}", ['reason' => 'SONG_LONGER_THAN_PLANNING_MAXIMUM']);
            break;
        case 'START_PRODUCTION':
            if (!in_array($job['status'], ['PRODUCTION_REQUIRED', 'REWORK_REQUIRED'], true)) {
                throw new OperationsException('invalid_transition', 'This video is not ready to be made.', 409);
            }
            video_set_job($pdo, $jobId, ['status' => 'PRODUCTION_IN_PROGRESS', 'waiting_on' => 'CANDIDATE', 'production_method' => 'MANUAL',
                'production_started_at' => $job['production_started_at'] ?? gmdate('Y-m-d H:i:s')]);
            record_order_event($pdo, $orderId, 'VIDEO.PRODUCTION_STARTED', ['video_job_id' => $jobId, 'by' => $staff, 'method' => 'MANUAL']);
            break;
        case 'VIDEO_QC':
            $result += video_quality_check($pdo, $job, is_int($in['candidate_id'] ?? null) ? $in['candidate_id'] : 0, $in['criteria'] ?? null, $in['outcome'] ?? null, operations_text($in['note'] ?? null, 1000), $staff);
            break;
        case 'REVEAL_VIDEO':
            if ($job['status'] !== 'READY_FOR_REVEAL' || $job['current_video_master_id'] === null) {
                throw new OperationsException('invalid_transition', 'Only a video that passed its quality check can be revealed.', 409);
            }
            video_set_job($pdo, $jobId, ['status' => 'REVEALED', 'waiting_on' => null, 'revealed_at' => gmdate('Y-m-d H:i:s')]);
            record_order_event($pdo, $orderId, 'VIDEO.REVEALED', ['video_job_id' => $jobId, 'video_master_id' => (int) $job['current_video_master_id']], "video-revealed:{$jobId}:{$job['current_video_master_id']}");
            ensure_status_token($pdo, $orderId, $staff);
            if (($in['send_email'] ?? true) !== false) {
                $result['messages'][] = ['VIDEO_READY', "video-{$jobId}-{$job['current_video_master_id']}"];
            }
            break;
        case 'RELEASE_CAPACITY':
            $note = operations_text($in['note'] ?? null, 500);
            $candidates = (int) $pdo->query('SELECT COUNT(*) FROM video_candidates WHERE video_job_id = ' . $jobId)->fetchColumn();
            if (!in_array($job['status'], ['INPUT_REQUIRED', 'READY', 'PRODUCTION_REQUIRED'], true) || $candidates > 0 || $job['production_started_at'] !== null) {
                throw new OperationsException('capacity_consumed', 'Production has started on this video, so its space cannot be released.', 409);
            }
            if ($note === null) {
                throw new OperationsException('release_reason_required', 'Record why the video is cancelled (for example, the customer cancelled before production). No refund is made here.', 422);
            }
            $pdo->prepare("UPDATE video_capacity_reservations SET status = 'RELEASED', released_at = UTC_TIMESTAMP(), released_by = :by, release_note = :n WHERE entitlement_id = :e AND status IN ('HELD','RESERVED')")
                ->execute([':by' => $staff, ':n' => $note, ':e' => (int) $job['entitlement_id']]);
            $pdo->prepare("UPDATE video_entitlements SET status = 'CANCELLED' WHERE id = :e")->execute([':e' => (int) $job['entitlement_id']]);
            video_set_job($pdo, $jobId, ['status' => 'EXCEPTION', 'waiting_on' => null, 'exception_reason' => 'CANCELLED_BEFORE_PRODUCTION']);
            record_order_event($pdo, $orderId, 'VIDEO.CAPACITY_RELEASED', ['video_job_id' => $jobId, 'by' => $staff], "video-released:{$jobId}");
            break;
        case 'RECORD_PRODUCTION_COST':
            $cost = $in['cost_minor'] ?? null;
            if (!is_int($cost) || $cost < 0) {
                throw new OperationsException('invalid_cost', 'Give the production cost in pence (0 or more), with a note on how it was worked out.', 422);
            }
            video_set_job($pdo, $jobId, ['production_cost_minor' => $cost, 'production_cost_note' => operations_line($in['note'] ?? null, 255)]);
            break;
        default:
            throw new OperationsException('unknown_action', 'Unknown video action.', 422);
    }
    if (in_array($action, ['CONFIRM_INPUTS', 'DURATION_REVIEW'], true)) {
        video_refresh_job($pdo, $jobId);
    }
    $result['job'] = video_job_summary($pdo, $jobId);
    return $result;
}

function video_job_summary(PDO $pdo, int $jobId): array
{
    $j = video_job_row($pdo, $jobId);
    return [
        'video_job_id' => (int) $j['id'], 'order_id' => (int) $j['order_id'], 'song' => (int) $j['song'], 'status' => $j['status'], 'waiting_on' => $j['waiting_on'],
        'duration_status' => $j['duration_status'], 'duration_decision' => $j['duration_decision'], 'exception_reason' => $j['exception_reason'],
        'audio_master' => $j['audio_master_id'] === null ? null : ['id' => (int) $j['audio_master_id'], 'version' => (int) $j['audio_master_version'], 'sha256' => $j['audio_master_sha256'], 'duration_ms' => $j['audio_duration_ms'] === null ? null : (int) $j['audio_duration_ms']],
        'rework_count' => (int) $j['rework_count'], 'current_video_master_id' => $j['current_video_master_id'] === null ? null : (int) $j['current_video_master_id'],
        'visual_direction' => $j['visual_direction'], 'production_method' => $j['production_method'],
    ];
}

/* ------------------------------------------------------------------ */
/* Customer access                                                      */
/* ------------------------------------------------------------------ */

/** A short-lived signed address for one video master (10 minutes). Never a permanent public URL. */
function video_signed_path(int $orderId, int $masterId, bool $download, ?int $now = null): string
{
    $exp = ($now ?? time()) + 600;
    $d = $download ? 1 : 0;
    $sig = hash_hmac('sha256', "mcb-video|{$orderId}|{$masterId}|{$exp}|{$d}", (string) mcb_setting('token_secret', ''));
    return "/api/order-video?o={$orderId}&m={$masterId}&e={$exp}&d={$d}&s={$sig}";
}

function video_signature_valid(int $orderId, int $masterId, int $exp, int $d, string $sig): bool
{
    if ($exp < time() || $exp > time() + 900 || strlen((string) mcb_setting('token_secret', '')) < 32) {
        return false;
    }
    return hash_equals(hash_hmac('sha256', "mcb-video|{$orderId}|{$masterId}|{$exp}|{$d}", (string) mcb_setting('token_secret', '')), $sig);
}

/** The customer's view of their videos: plain states, and the film only once revealed. */
function video_customer_view(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        'SELECT j.id, j.status, j.waiting_on, j.current_video_master_id, j.revealed_at, m.sequence AS song, e.status AS entitlement_status,
                (SELECT COUNT(*) FROM video_media vm WHERE vm.video_job_id = j.id) AS photographs
           FROM video_entitlements e LEFT JOIN video_jobs j ON j.entitlement_id = e.id JOIN order_memories m ON m.id = e.memory_id
          WHERE e.order_id = :o AND e.status <> :cancelled ORDER BY e.id'
    );
    $stmt->execute([':o' => $orderId, ':cancelled' => 'CANCELLED']);
    return array_map(static fn (array $v): array => [
        'video_job_id' => $v['id'] === null ? null : (int) $v['id'],
        'song' => (int) $v['song'],
        'status' => match (true) {
            $v['entitlement_status'] === 'CAPACITY_EXCEPTION', $v['status'] === 'EXCEPTION', $v['waiting_on'] === 'PROVIDER_VERIFICATION' => 'BEING_ARRANGED',
            $v['status'] === 'INPUT_REQUIRED' => 'PHOTOGRAPHS_WANTED',
            $v['status'] === 'REVEALED' => 'READY',
            default => 'BEING_MADE',
        },
        'photographs' => (int) $v['photographs'],
        'max_photographs' => (int) video_data()['media_policy']['max_files'],
        'rights_statement' => video_data()['media_rights_statement'],
        'orientation_guidance' => video_data()['media_policy']['orientation_guidance'],
        'revealed_on' => $v['status'] === 'REVEALED' ? substr((string) $v['revealed_at'], 0, 10) : null,
    ], $stmt->fetchAll());
}

/* ------------------------------------------------------------------ */
/* Metrics and the Command Centre                                       */
/* ------------------------------------------------------------------ */

/** Internal product metrics. Counts and money only; no customer content. Decides nothing (no automatic price change). */
function video_metrics(PDO $pdo): array
{
    $one = static fn (string $sql): mixed => $pdo->query($sql)->fetchColumn();
    $offers = array_column($pdo->query('SELECT event, SUM(count) AS n FROM video_offer_counters GROUP BY event')->fetchAll(), 'n', 'event');
    $views = (int) ($offers['OFFER_VIEWED'] ?? 0);
    $paid = $pdo->query("SELECT COUNT(*) AS n, COALESCE(SUM(e.price_minor), 0) AS revenue, COUNT(DISTINCT e.order_id) AS orders FROM video_entitlements e JOIN orders o ON o.id = e.order_id WHERE o.status = 'PAID' AND e.status IN ('ENTITLED','CAPACITY_EXCEPTION')")->fetch();
    $reviewed = (int) $one("SELECT COUNT(*) FROM video_candidates WHERE qc_status <> 'PENDING'");
    $failed = (int) $one("SELECT COUNT(*) FROM video_candidates WHERE qc_status IN ('REWORK','ESCALATE')");
    $mastered = (int) $one('SELECT COUNT(DISTINCT video_job_id) FROM video_masters');
    $reworked = (int) $one('SELECT COUNT(*) FROM video_jobs j WHERE j.rework_count > 0 AND EXISTS (SELECT 1 FROM video_masters m WHERE m.video_job_id = j.id)');
    $avgHours = $one('SELECT AVG(TIMESTAMPDIFF(MINUTE, j.production_started_at, m.created_at)) / 60 FROM video_jobs j JOIN video_masters m ON m.video_job_id = j.id AND m.version = 1 WHERE j.production_started_at IS NOT NULL');
    $costed = $pdo->query("SELECT COUNT(*) AS n, COALESCE(SUM(e.price_minor), 0) AS revenue, COALESCE(SUM(j.production_cost_minor), 0) AS cost FROM video_jobs j JOIN video_entitlements e ON e.id = j.entitlement_id WHERE j.production_cost_minor IS NOT NULL")->fetch();
    $capacity = video_capacity($pdo);
    return [
        'offer_impressions' => $views,
        'selections' => (int) ($offers['SELECTED'] ?? 0),
        'deselections' => (int) ($offers['DESELECTED'] ?? 0),
        'selection_rate' => $views > 0 ? round((int) ($offers['SELECTED'] ?? 0) / $views, 3) : null,
        'videos_purchased' => (int) $paid['n'],
        'purchase_rate' => $views > 0 ? round((int) $paid['orders'] / $views, 3) : null,
        'video_revenue_minor' => (int) $paid['revenue'],
        'average_selling_price_minor' => (int) $paid['n'] > 0 ? (int) round((int) $paid['revenue'] / (int) $paid['n']) : null,
        'capacity_utilisation' => $capacity['capacity'] > 0 ? round(($capacity['capacity'] - $capacity['remaining']) / $capacity['capacity'], 3) : null,
        'average_production_hours' => $avgHours === null || $avgHours === false ? null : round((float) $avgHours, 1),
        'rework_rate' => $mastered > 0 ? round($reworked / $mastered, 3) : null,
        'qc_failure_rate' => $reviewed > 0 ? round($failed / $reviewed, 3) : null,
        'contribution_minor_where_cost_known' => (int) $costed['n'] > 0 ? (int) $costed['revenue'] - (int) $costed['cost'] : null,
        'videos_with_known_cost' => (int) $costed['n'],
        'note' => 'Internal only. Production cost is unknown unless recorded: a platform allowance is not treated as free. No price changes automatically.',
    ];
}

/** The Command Centre's video panel and attention items. Read only. */
function video_command_summary(PDO $pdo, array $period): array
{
    $counts = array_column($pdo->query("SELECT j.status, COUNT(*) AS n FROM video_jobs j JOIN orders o ON o.id = j.order_id WHERE o.status = 'PAID' GROUP BY j.status")->fetchAll(), 'n', 'status');
    $n = static fn (array $statuses): int => array_sum(array_map(static fn (string $s): int => (int) ($counts[$s] ?? 0), $statuses));
    $ordered = $period['start'] === null
        ? (int) $pdo->query("SELECT COUNT(*) FROM video_entitlements e JOIN orders o ON o.id = e.order_id WHERE o.status = 'PAID' AND e.status IN ('ENTITLED','CAPACITY_EXCEPTION')")->fetchColumn()
        : (function () use ($pdo, $period): int {
            $stmt = $pdo->prepare("SELECT COUNT(*) FROM video_entitlements e JOIN order_events pe ON pe.order_id = e.order_id AND pe.dedupe_key = 'paid' WHERE e.status IN ('ENTITLED','CAPACITY_EXCEPTION') AND pe.created_at >= :s");
            $stmt->execute([':s' => $period['start']]);
            return (int) $stmt->fetchColumn();
        })();
    return [
        'video_orders' => $ordered,
        'awaiting_input' => $n(['INPUT_REQUIRED']),
        'ready_to_make' => $n(['PRODUCTION_REQUIRED', 'REWORK_REQUIRED']),
        'being_made' => $n(['PRODUCTION_IN_PROGRESS', 'CANDIDATE_READY']),
        'needs_quality_check' => $n(['QUALITY_CHECK_REQUIRED']),
        'ready' => $n(['READY_FOR_REVEAL']),
        'revealed' => $n(['REVEALED']),
        'exceptions' => $n(['EXCEPTION']) + (int) $pdo->query("SELECT COUNT(*) FROM video_entitlements WHERE status = 'CAPACITY_EXCEPTION'")->fetchColumn(),
        'capacity' => video_capacity_readonly($pdo),
    ];
}

/** Capacity for read models: never creates a period row (the current period may not exist yet). */
function video_capacity_readonly(PDO $pdo): array
{
    $at = gmdate('Y-m-d H:i:s');
    $find = $pdo->prepare('SELECT * FROM video_capacity_periods WHERE starts_at <= :a AND ends_at > :b ORDER BY starts_at DESC LIMIT 1');
    $find->execute([':a' => $at, ':b' => $at]);
    $period = $find->fetch();
    $capacity = $period === false ? video_planning_capacity() : (int) $period['capacity'];
    $c = ['held' => 0, 'reserved' => 0, 'completed' => 0];
    if ($period !== false) {
        $stmt = $pdo->prepare("SELECT SUM(status = 'HELD' AND held_until > UTC_TIMESTAMP()) AS held, SUM(status = 'RESERVED') AS reserved, SUM(status = 'COMPLETED') AS completed FROM video_capacity_reservations WHERE period_id = :p");
        $stmt->execute([':p' => (int) $period['id']]);
        $c = array_map('intval', $stmt->fetch() ?: $c);
    }
    $remaining = max(0, $capacity - $c['held'] - $c['reserved'] - $c['completed']);
    return [
        'period_key' => $period === false ? gmdate('Y-m') : $period['period_key'],
        'planned' => $capacity, 'held' => $c['held'], 'reserved' => $c['reserved'], 'completed' => $c['completed'], 'remaining' => $remaining,
        'state' => $remaining === 0 ? 'FULL' : ($remaining <= (int) video_data()['capacity_low_threshold'] ? 'LOW' : 'AVAILABLE'),
        'verification' => $period !== false && $period['basis'] === 'VERIFIED' ? 'VERIFIED' : 'PENDING_EXTERNAL_VERIFICATION',
        'label' => $period !== false && $period['basis'] === 'VERIFIED' ? 'Verified capacity' : 'PENDING ' . strtoupper((string) preg_replace('/\s+AI$/i', '', (string) video_data()['platform']['name'])) . ' VERIFICATION',
    ];
}

/**
 * Everything a person needs to make the film — and nothing more. This is also
 * the most a future platform integration could ever be given: no address,
 * phone, email, payment, supplier economics or credentials.
 */
function video_production_inputs(PDO $pdo, int $jobId): array
{
    $job = video_job_row($pdo, $jobId);
    $memory = $pdo->prepare('SELECT m.story, m.about, m.occasion, u.sku, u.product_id, cj.id AS creative_job_id, cj.album_id, cj.lyric_version
                               FROM order_memories m JOIN order_units u ON u.id = m.unit_id LEFT JOIN creative_jobs cj ON cj.memory_id = m.id WHERE m.id = :m');
    $memory->execute([':m' => (int) $job['memory_id']]);
    $m = $memory->fetch();
    $title = null;
    $facts = [];
    if ($m !== false && $m['creative_job_id'] !== null) {
        $title = creative_artifact($pdo, "job:{$m['creative_job_id']}", 'LYRIC_PACKAGE')['body']['title'] ?? null;
        foreach (creative_artifact($pdo, "album:{$m['album_id']}", 'FACT_LEDGER')['body']['facts'] ?? [] as $f) {
            $tracks = $f['tracks'] ?? null;
            if (in_array($f['type'] ?? '', ['NAME', 'DATE', 'YEAR', 'PLACE', 'OCCASION', 'MILESTONE', 'RELATIONSHIP'], true) && ($tracks === 'ALL' || (is_array($tracks) && in_array((int) $job['song'], $tracks, true)))) {
                $facts[] = ['type' => $f['type'], 'value' => $f['value'] ?? null];
            }
        }
    }
    $media = $pdo->prepare('SELECT id, public_id, mime_type, width, height, created_at FROM video_media WHERE video_job_id = :j ORDER BY id');
    $media->execute([':j' => $jobId]);
    $memoryPhoto = $pdo->prepare('SELECT public_id, width, height FROM order_uploads WHERE memory_id = :m');
    $memoryPhoto->execute([':m' => (int) $job['memory_id']]);
    $art = $pdo->prepare('SELECT id, version FROM artwork_art_masters WHERE unit_id = :u AND is_current = 1 AND visual_qc_status = :s');
    $art->execute([':u' => (int) $job['unit_id'], ':s' => 'PASS']);
    return [
        'reference' => $job['mcb_reference'],
        'product' => $m['product_id'] ?? null,
        'song' => (int) $job['song'],
        'song_title' => $title,
        'audio_master' => $job['audio_master_id'] === null ? null : ['id' => (int) $job['audio_master_id'], 'version' => (int) $job['audio_master_version'], 'sha256' => $job['audio_master_sha256'], 'duration_seconds' => $job['audio_duration_ms'] === null ? null : round((int) $job['audio_duration_ms'] / 1000, 1), 'access' => 'READ_ONLY_REFERENCE'],
        'memory' => ['story' => $m['story'] ?? null, 'about' => $m['about'] ?? null, 'occasion' => $m['occasion'] ?? null],
        'facts' => $facts,
        'photographs' => array_map(static fn (array $p): array => ['media_id' => (int) $p['id'], 'width' => $p['width'] === null ? null : (int) $p['width'], 'height' => $p['height'] === null ? null : (int) $p['height'], 'source' => 'CUSTOMER_VIDEO_PHOTOGRAPH'], $media->fetchAll()),
        'memory_photograph' => ($p = $memoryPhoto->fetch()) === false ? null : ['public_id' => $p['public_id']],
        'artwork' => ($a = $art->fetch()) === false ? null : ['art_master_id' => (int) $a['id'], 'version' => (int) $a['version']],
        'visual_direction' => $job['visual_direction'],
        'branding_direction' => artwork_data()['brand_rules'] ?? null,
        'planning_limits' => ['max_video_seconds' => video_max_seconds(), 'verification' => video_data()['planning_limits']['verification']],
        'excluded' => ['address', 'phone', 'email', 'payment', 'supplier_economics', 'credentials'],
    ];
}

function video_files(PDO $pdo, string $table, int $jobId): array
{
    if (!in_array($table, ['video_candidates', 'video_masters'], true)) {
        return [];
    }
    $extra = $table === 'video_candidates' ? 'technical_checks, qc_status, qc, external_reference' : 'candidate_id, audio_master_version, qc_evidence, is_current';
    $stmt = $pdo->prepare("SELECT id, version, container, byte_size, sha256, duration_ms, width, height, audio_master_id, audio_master_sha256, {$extra}, created_by, created_at FROM {$table} WHERE video_job_id = :j ORDER BY version");
    $stmt->execute([':j' => $jobId]);
    return array_map(static function (array $r): array {
        foreach (['technical_checks', 'qc', 'qc_evidence'] as $k) {
            if (array_key_exists($k, $r)) {
                $r[$k] = $r[$k] === null ? null : json_decode((string) $r[$k], true);
            }
        }
        return $r;
    }, $stmt->fetchAll());
}
