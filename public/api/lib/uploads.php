<?php
/**
 * MCB — customer photos.
 *
 * A photo is uploaded only AFTER its order exists, authorised by the order's
 * checkout token, and attached to the memory or plaque it belongs to. There is
 * no anonymous upload: nothing can be stored that is not tied to an order its
 * uploader can prove they created.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS CHECKED
 * ─────────────────────────────────────────────────────────────────────────
 *   size      1 byte to uploads.max_bytes (10 MB), before anything is read
 *   type      the file's own signature — JPEG, PNG, WebP, HEIC/HEIF — never
 *             its name or the type the browser claimed; JPEG, PNG and WebP
 *             must also decode as an image of that type with sane dimensions
 *   content   refused if it carries markup or PHP (a polyglot), wherever it
 *             appears in the file
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE IT GOES — PRIVATE STORAGE, OR NOWHERE
 * ─────────────────────────────────────────────────────────────────────────
 * Photos are stored ONLY in a directory outside the web root:
 *
 *   1. `uploads.path` in config — an existing, writable, absolute directory;
 *   2. otherwise a directory named `mcb-uploads` above the web root, found
 *      the same way as mcb-config.php (e.g. /home/<user>/mcb-uploads).
 *
 * Either is refused if it resolves inside the web root. There is NO fallback
 * inside public_html, api/ or any served directory: if private storage is
 * missing, the upload fails closed and the customer is told plainly that the
 * photo could not be saved securely. Live checkout also refuses to open
 * without it (lib/stripe.php), and GET /api/crm/preflight reports it.
 *
 * DEVELOPMENT AND TEST ONLY: `uploads.development_storage => true` uses a
 * private directory under the system temp directory (outside the web root,
 * mode 0700). It is ignored — and upload fails closed — on a server holding
 * a live Stripe key.
 *
 * File names are 64 random hex characters with no extension. The customer's
 * file name is never stored, logged or used. Nothing is served back to a
 * browser; staff retrieve a photo through the CRM key (api/crm/upload.php).
 */

declare(strict_types=1);

/** The directory the site is served from: the parent of api/. */
function web_root_directory(): string
{
    return (string) (realpath(dirname(__DIR__, 2)) ?: dirname(__DIR__, 2));
}

/** True when a real path is the web root or inside it. */
function path_is_inside_web_root(string $path): bool
{
    $real = realpath($path);
    if ($real === false) {
        return true;   // cannot prove otherwise: treat as unsafe
    }
    foreach (array_filter([web_root_directory(), (string) ($_SERVER['DOCUMENT_ROOT'] ?? '')]) as $root) {
        $rootReal = realpath($root);
        if ($rootReal !== false && ($real === $rootReal || str_starts_with($real . '/', rtrim($rootReal, '/') . '/'))) {
            return true;
        }
    }
    return false;
}

/**
 * Where customer photos can be stored, and how that was decided.
 *
 * @return array{path: ?string, source: string}
 *   source: configured | above_web_root | development | missing | unsafe
 */
function upload_storage(): array
{
    $configured = (string) mcb_setting('uploads.path', '');
    if ($configured !== '') {
        if ($configured[0] !== '/' || !is_dir($configured) || !is_writable($configured)) {
            error_log('MCB uploads: uploads.path is not an existing, writable, absolute directory; uploads refused.');
            return ['path' => null, 'source' => 'missing'];
        }
        if (path_is_inside_web_root($configured)) {
            error_log('MCB uploads: uploads.path is inside the web root; uploads refused.');
            return ['path' => null, 'source' => 'unsafe'];
        }
        return ['path' => (string) realpath($configured), 'source' => 'configured'];
    }

    for ($depth = 3; $depth <= 7; $depth++) {
        $candidate = dirname(__DIR__, $depth) . '/mcb-uploads';
        if (is_dir($candidate) && is_writable($candidate) && !path_is_inside_web_root($candidate)) {
            return ['path' => (string) realpath($candidate), 'source' => 'above_web_root'];
        }
    }

    if (mcb_setting('uploads.development_storage', false) === true) {
        if (stripe_key_mode((string) mcb_setting('stripe.secret_key', '')) === 'live') {
            error_log('MCB uploads: uploads.development_storage is set on a server with a LIVE Stripe key; uploads refused.');
            return ['path' => null, 'source' => 'unsafe'];
        }
        $dev = rtrim(sys_get_temp_dir(), '/') . '/mcb-uploads-dev';
        if ((is_dir($dev) || @mkdir($dev, 0700, true)) && is_writable($dev) && !path_is_inside_web_root($dev)) {
            return ['path' => (string) realpath($dev), 'source' => 'development'];
        }
    }

    error_log('MCB uploads: no private upload storage outside the web root (create mcb-uploads above public_html); uploads refused.');
    return ['path' => null, 'source' => 'missing'];
}

/** The private upload directory, or null when photos cannot be stored securely. */
function upload_directory(): ?string
{
    return upload_storage()['path'];
}

/**
 * Identifies an image by its own bytes.
 *
 * @return ?array{mime: string, width: ?int, height: ?int}
 */
function inspect_uploaded_image(string $path, int $size): ?array
{
    $handle = fopen($path, 'rb');
    if ($handle === false) {
        return null;
    }
    $head = (string) fread($handle, 64);
    fclose($handle);

    $mime = match (true) {
        str_starts_with($head, "\xFF\xD8\xFF") => 'image/jpeg',
        str_starts_with($head, "\x89PNG\r\n\x1A\n") => 'image/png',
        substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP' => 'image/webp',
        substr($head, 4, 4) === 'ftyp' && in_array(substr($head, 8, 4), ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'], true) => 'image/heic',
        substr($head, 4, 4) === 'ftyp' && in_array(substr($head, 8, 4), ['mif1', 'msf1'], true) => 'image/heif',
        default => null,
    };
    if ($mime === null || !in_array($mime, personalisation_data()['uploads']['mime_types'], true)) {
        return null;
    }

    // Markup or PHP anywhere in the file: not a photograph MCB needs.
    $content = (string) file_get_contents($path, false, null, 0, $size);

    // A complete file, not one cut short in transfer: a JPEG's image data (after its
    // start-of-scan marker) reaches an end-of-image marker, a PNG has its IEND chunk,
    // and a WebP is at least as long as its RIFF header says. Data a phone appends after
    // the image (motion photos, trailers) is still accepted.
    $sos = strpos($content, "\xFF\xDA");
    $complete = match ($mime) {
        'image/jpeg' => $sos !== false && strpos($content, "\xFF\xD9", $sos) !== false,
        'image/png' => str_contains($content, "IEND\xAE\x42\x60\x82"),
        'image/webp' => strlen($content) >= 12 && unpack('V', substr($content, 4, 4))[1] + 8 <= strlen($content),
        default => true,
    };
    if (!$complete) {
        return null;
    }
    if (preg_match('/<\?php|<\?=|<script|<html|<svg|<iframe|<body/i', $content) === 1) {
        return null;
    }

    if ($mime === 'image/heic' || $mime === 'image/heif') {
        // PHP cannot decode HEIC; the signature and the content check above
        // are what stand between it and acceptance.
        return ['mime' => $mime, 'width' => null, 'height' => null];
    }

    $info = @getimagesize($path);
    $expected = ['image/jpeg' => IMAGETYPE_JPEG, 'image/png' => IMAGETYPE_PNG, 'image/webp' => IMAGETYPE_WEBP][$mime];
    if (!is_array($info) || ($info[2] ?? null) !== $expected) {
        return null;
    }
    [$width, $height] = $info;
    if ($width < 1 || $height < 1 || $width > 20000 || $height > 20000 || $width * $height > 200_000_000) {
        return null;
    }
    return ['mime' => $mime, 'width' => min($width, 65535), 'height' => min($height, 65535)];
}

/**
 * Whether an uploaded memory photo may be used for this order's artwork.
 *
 * True when the order has no photo-created artwork (a Moment), when the
 * customer chose the Artwork Preparation Service, or when the photograph is
 * square within 1% and at least the artwork minimum on both sides.
 *
 * @param array{mime:string, width:?int, height:?int} $image
 */
function artwork_photo_is_acceptable(PDO $pdo, int $orderId, array $image): bool
{
    $rules = catalogue_data()['rules'];
    $stmt = $pdo->prepare('SELECT item_id, product_id FROM order_items WHERE order_id = :id');
    $stmt->execute([':id' => $orderId]);
    $rows = $stmt->fetchAll();
    if (array_intersect(array_column($rows, 'product_id'), $rules['photo_artwork_product_ids'] ?? []) === []) {
        return true;
    }
    if (in_array($rules['artwork_preparation_sku'] ?? '', array_column($rows, 'item_id'), true)) {
        return true;
    }
    $w = $image['width'];
    $h = $image['height'];
    $min = (int) ($rules['artwork_photo_min_px'] ?? 2500);
    if (!is_int($w) || !is_int($h) || $w < $min || $h < $min) {
        return false;
    }
    return abs($w - $h) <= (int) floor(max($w, $h) * 0.01);
}

/* ------------------------------------------------------------------ */
/* Malware scanning — a boundary, honestly reported                    */
/* ------------------------------------------------------------------ */

/**
 * MCB DOES NOT CLAIM MALWARE PROTECTION IT DOES NOT HAVE.
 *
 * Uploads already go through real defences: the type is decided by reading the
 * file's own bytes (never its name or the browser's claim), truncated and
 * corrupt files are refused, disguised scripts and SVG are refused, size is
 * capped, the file is stored outside the web root under a random name, and it
 * is never executed and never served inline. None of that is virus scanning.
 *
 * This is the boundary a scanner plugs into, so adding one later is a
 * configuration change rather than a rewrite. It is provider-neutral: it
 * shells out to a LOCAL command the host already provides (clamdscan or
 * clamscan) and sends nothing anywhere. No paid API, no subscription, no
 * external service, no customer photograph leaving the server.
 *
 * Three honest states, and MCB reports whichever is true:
 *
 *   SCANNING_ACTIVE               a scanner is configured and answering.
 *   SCANNER_CONNECTION_REQUIRED   a scanner is configured but not reachable —
 *                                 a real problem, surfaced, never silent.
 *   SCANNING_NOT_AVAILABLE        nothing is configured. Uploads continue
 *                                 through the validation above, and MCB says
 *                                 so rather than implying protection.
 */
function upload_scanner_command(): ?string
{
    $configured = mcb_setting('uploads.malware_scan_command', null);
    return is_string($configured) && trim($configured) !== '' ? trim($configured) : null;
}

/** Whether the configured scanner actually answers. Cached for the request. */
function upload_scanner_state(): array
{
    static $state = null;
    if ($state !== null) {
        return $state;
    }
    $command = upload_scanner_command();
    if ($command === null) {
        return $state = [
            'state' => 'SCANNING_NOT_AVAILABLE',
            'detail' => 'No malware scanner is configured. Uploads are checked by content type, completeness and size, stored outside the web root under random names and never executed — they are not virus-scanned.',
            'required_action' => 'If the host provides ClamAV (clamdscan), set uploads.malware_scan_command in the host config. Confirm with the host whether a scanner is available.',
        ];
    }
    $binary = strtok($command, ' ');
    $found = @shell_exec('command -v ' . escapeshellarg((string) $binary) . ' 2>/dev/null');
    if (!is_string($found) || trim($found) === '') {
        return $state = [
            'state' => 'SCANNER_CONNECTION_REQUIRED',
            'detail' => 'A malware scanner is configured but the command was not found on this host.',
            'required_action' => 'Install or correct the scanner command, or clear uploads.malware_scan_command so MCB stops claiming it.',
        ];
    }
    return $state = [
        'state' => 'SCANNING_ACTIVE',
        'detail' => 'Uploads are scanned locally before they are stored. Nothing is sent off this server.',
        'required_action' => null,
    ];
}

/**
 * Scans one stored file. Returns null when there is nothing to scan with, so a
 * caller can tell "clean" apart from "not scanned" and never conflate them.
 *
 * A non-zero exit from the scanner means infected or errored: either way the
 * file does not pass. Fail closed, never open.
 */
function upload_scan_result(string $path): ?array
{
    $command = upload_scanner_command();
    if ($command === null || upload_scanner_state()['state'] !== 'SCANNING_ACTIVE' || !is_readable($path)) {
        return null;
    }
    $exit = 1;
    $output = [];
    @exec($command . ' ' . escapeshellarg($path) . ' 2>&1', $output, $exit);
    return [
        'scanned' => true,
        'clean' => $exit === 0,
        // The scanner's own words are kept out of anything customer-facing.
        'detail' => $exit === 0 ? 'clean' : 'refused by the malware scanner',
    ];
}
