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
 * WHERE IT GOES
 * ─────────────────────────────────────────────────────────────────────────
 * Preferred: a directory named `mcb-uploads` above the web root, found the
 * same way as mcb-config.php, or `uploads.path` in config. It survives a
 * redeploy and is unreachable over HTTP by construction.
 *
 * Fallback: api/storage/uploads, denied over HTTP by api/.htaccess and its
 * own .htaccess. A deploy that replaces api/ would remove it, so the fallback
 * is logged every time it is used.
 *
 * File names are 64 random hex characters with no extension. The customer's
 * file name is never stored, logged or used. Nothing is served back to a
 * browser; staff retrieve a photo through the CRM key (api/crm/upload.php).
 */

declare(strict_types=1);

/** The private upload directory, created if needed, or null if unusable. */
function upload_directory(): ?string
{
    $candidates = [];
    $configured = (string) mcb_setting('uploads.path', '');
    if ($configured !== '') {
        $candidates[] = rtrim($configured, '/');
    }
    for ($depth = 3; $depth <= 7; $depth++) {
        $candidates[] = dirname(__DIR__, $depth) . '/mcb-uploads';
    }

    foreach ($candidates as $dir) {
        if (is_dir($dir) && is_writable($dir)) {
            return $dir;
        }
    }

    $fallback = __DIR__ . '/../storage/uploads';
    if (!is_dir($fallback) && !@mkdir($fallback, 0750, true)) {
        error_log('MCB uploads: no writable upload directory (create mcb-uploads above the web root).');
        return null;
    }
    if (!is_writable($fallback)) {
        error_log('MCB uploads: api/storage/uploads is not writable.');
        return null;
    }
    error_log('MCB uploads: using api/storage/uploads inside the web root; create mcb-uploads above it so photos survive a redeploy.');
    return $fallback;
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
