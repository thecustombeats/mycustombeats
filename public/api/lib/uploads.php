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
