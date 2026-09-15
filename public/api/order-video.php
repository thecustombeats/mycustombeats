<?php
/**
 * The customer's Memory Music Video, privately.
 *
 * POST /api/order-video { token, videoJobId, download? }
 *   → { url } a signed address valid for 10 minutes, only for this order's
 *     revealed video. The link token never appears in a URL.
 * GET  /api/order-video?o=&m=&e=&d=&s=
 *   → the file (inline for playing, or as a download), with Range support.
 *     Every access is recorded.
 *
 * No permanent or public file URL exists, and another order's link cannot
 * reach this video.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/video.php';

$pdo = db();

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') {
    $o = ctype_digit((string) ($_GET['o'] ?? '')) ? (int) $_GET['o'] : 0;
    $m = ctype_digit((string) ($_GET['m'] ?? '')) ? (int) $_GET['m'] : 0;
    $e = ctype_digit((string) ($_GET['e'] ?? '')) ? (int) $_GET['e'] : 0;
    $d = ($_GET['d'] ?? '') === '1' ? 1 : 0;
    $s = is_string($_GET['s'] ?? null) && preg_match('/^[a-f0-9]{64}$/', $_GET['s']) === 1 ? $_GET['s'] : '';
    if ($o <= 0 || $m <= 0 || !video_signature_valid($o, $m, $e, $d, $s)) {
        json_error(403, 'link_expired', 'This video link has expired. Open your order page again to watch your video.');
    }
    $stmt = $pdo->prepare("SELECT vm.* FROM video_masters vm JOIN video_jobs j ON j.id = vm.video_job_id JOIN orders o ON o.id = vm.order_id
                            WHERE vm.id = :m AND vm.order_id = :o AND vm.is_current = 1 AND j.status = 'REVEALED' AND o.status = 'PAID'");
    $stmt->execute([':m' => $m, ':o' => $o]);
    $master = $stmt->fetch();
    $dir = video_storage('masters');
    $path = $master === false || $dir === null || preg_match('/^[a-f0-9]{64}$/', (string) $master['stored_name']) !== 1 ? null : $dir . '/' . $master['stored_name'];
    if ($path === null || !is_file($path)) {
        json_error(404, 'not_found', 'This video is not available.');
    }
    $size = (int) filesize($path);
    $start = 0;
    $end = $size - 1;
    $range = (string) ($_SERVER['HTTP_RANGE'] ?? '');
    if (preg_match('/^bytes=(\d*)-(\d*)$/', $range, $r) === 1 && ($r[1] !== '' || $r[2] !== '')) {
        if ($r[1] === '') {
            $start = max(0, $size - (int) $r[2]);
        } else {
            $start = (int) $r[1];
            $end = $r[2] === '' ? $size - 1 : min((int) $r[2], $size - 1);
        }
        if ($start > $end || $start >= $size) {
            header('Content-Range: bytes */' . $size);
            http_response_code(416);
            exit;
        }
        http_response_code(206);
        header("Content-Range: bytes {$start}-{$end}/{$size}");
    } else {
        http_response_code(200);
    }
    if ($start === 0) {
        $pdo->prepare('INSERT INTO video_access_log (order_id, actor, action, subject_id, version, ip_hash) VALUES (:o, :a, :act, :s, :v, :ip)')
            ->execute([':o' => $o, ':a' => 'CUSTOMER', ':act' => $d === 1 ? 'DOWNLOAD' : 'VIEW', ':s' => $m, ':v' => (int) $master['version'], ':ip' => hash_ip(client_ip())]);
    }
    header('Content-Type: ' . ($master['container'] === 'MOV' ? 'video/quicktime' : 'video/mp4'));
    header('Accept-Ranges: bytes');
    header('Content-Length: ' . ($end - $start + 1));
    header('Content-Disposition: ' . ($d === 1 ? 'attachment' : 'inline') . '; filename="mcb-memory-music-video-v' . (int) $master['version'] . ($master['container'] === 'MOV' ? '.mov' : '.mp4') . '"');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: private, no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    $h = fopen($path, 'rb');
    fseek($h, $start);
    $left = $end - $start + 1;
    while ($left > 0 && !feof($h)) {
        $chunk = fread($h, (int) min(65536, $left));
        if ($chunk === false) {
            break;
        }
        echo $chunk;
        $left -= strlen($chunk);
    }
    fclose($h);
    exit;
}

require_method('POST');
require_same_origin();
enforce_scoped_rate_limit('order-video', 60, 3600);
$body = read_json_body(4096);
$token = find_access_token($pdo, $body['token'] ?? null, 'STATUS');
if ($token === null) {
    json_error(404, 'link_invalid', 'This link is no longer active. Reply to any of our emails and we will send you a new one.');
}
$orderId = (int) $token['order_id'];
$jobId = is_int($body['videoJobId'] ?? null) ? $body['videoJobId'] : 0;
$stmt = $pdo->prepare("SELECT current_video_master_id FROM video_jobs WHERE id = :j AND order_id = :o AND status = 'REVEALED'");
$stmt->execute([':j' => $jobId, ':o' => $orderId]);
$masterId = $stmt->fetchColumn();
if ($masterId === false || $masterId === null) {
    json_error(404, 'video_not_ready', 'Your Memory Music Video is not ready yet.');
}
json_response(200, ['url' => video_signed_path($orderId, (int) $masterId, ($body['download'] ?? false) === true), 'expires_in' => 600]);
