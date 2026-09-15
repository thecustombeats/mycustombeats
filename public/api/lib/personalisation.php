<?php
/**
 * MCB — what the customer personalised, validated and stored per memory.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE MODEL (mirrors src/lib/personalisation.ts)
 * ─────────────────────────────────────────────────────────────────────────
 *   units[]      one per song product: a Moment, EACH Keepsake, a Journey
 *     memories[] exactly the catalogue's song count for that SKU:
 *                7-inch and heart Keepsake 1, 10-inch 3, 12-inch 4,
 *                Journey 6 or 12
 *     priorityReplacement   this Keepsake only; eligible SKUs only
 *   plaques[]    one per Personalised Music Plaque: song title and artist
 *                (the photo is uploaded afterwards and is required)
 *   frames[]     one per Lyrics Frame: size SKU, which song, optional heading
 *
 * THE LINES ARE CHECKED AGAINST IT. The browser still sends `lines` (SKUs and
 * quantities), which lib/catalogue.php prices. This file then requires those
 * lines to be exactly what the personalisation implies — one song line whose
 * quantity is the number of units, a plaque line per plaque, a frame line per
 * frame size, a Priority Replacement line equal to the Keepsakes that chose
 * it — so a request cannot pay for one thing and describe another.
 *
 * NOTHING IS TRUNCATED. Over-long or missing text is refused with a field
 * error the customer can act on. A memory silently cut short is a different
 * memory, and the customer would not know until they heard the song.
 *
 * Limits, occasions, styles and countries come from
 * api/data/personalisation.json, GENERATED from src/data/ — one definition
 * for both sides.
 */

declare(strict_types=1);

function personalisation_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }

    $path = __DIR__ . '/../data/personalisation.json';
    $raw  = is_readable($path) ? file_get_contents($path) : false;
    $json = $raw === false ? null : json_decode($raw, true);

    if (!is_array($json) || !isset($json['limits'], $json['occasions'], $json['styles'], $json['countries'], $json['uploads'])) {
        error_log('MCB: api/data/personalisation.json missing or unreadable.');
        json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
    }

    $data = $json;
    return $data;
}

function personalisation_limit(string $name): int
{
    return (int) personalisation_data()['limits'][$name];
}

/** The ISO code for a submitted country: a code, or an exact country name. */
function country_code_for(mixed $code, mixed $name): ?string
{
    $countries = personalisation_data()['countries'];
    if (is_string($code) && preg_match('/^[A-Za-z]{2}$/', trim($code)) === 1) {
        $upper = strtoupper(trim($code));
        return isset($countries[$upper]) ? $upper : null;
    }
    if (is_string($name) && trim($name) !== '') {
        $wanted = mb_strtolower(trim($name));
        foreach ($countries as $iso => $label) {
            if (mb_strtolower((string) $label) === $wanted) {
                return (string) $iso;
            }
        }
    }
    return null;
}

function country_name_for(string $code): string
{
    return (string) (personalisation_data()['countries'][$code] ?? $code);
}

/**
 * The result of validating a personalisation block.
 *
 * `plan` (when ok) is what gets stored:
 *   song_sku, units[{ priority_replacement, memories[{ story, about, occasion,
 *   style_choice, style_label, photo_requested }] }],
 *   plaques[{ song_title, artist }], frames[{ sku, unit, memory, heading }]
 */
final class PersonalisationResult
{
    /** @param array<string,string> $errors */
    private function __construct(
        public readonly bool $ok,
        public readonly array $errors,
        public readonly ?string $errorCode,
        public readonly array $plan
    ) {
    }

    public static function valid(array $plan): self
    {
        return new self(true, [], null, $plan);
    }

    /** @param array<string,string> $errors */
    public static function invalid(string $code, array $errors): self
    {
        return new self(false, $errors, $code, []);
    }

    /** Photos the customer said they would add, plus every plaque photo. */
    public function awaitsUploads(): bool
    {
        if ($this->plan['plaques'] !== []) {
            return true;
        }
        foreach ($this->plan['units'] as $unit) {
            foreach ($unit['memories'] as $memory) {
                if ($memory['photo_requested']) {
                    return true;
                }
            }
        }
        return false;
    }
}

/** Free text: a string, no control characters other than line breaks and tabs. */
function personalisation_text(mixed $value): ?string
{
    if ($value === null) {
        return '';
    }
    if (!is_string($value) || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1) {
        return null;
    }
    return trim($value);
}

/**
 * Validates a personalisation block against the priced lines.
 *
 * @param mixed $raw the `personalisation` value from the request body
 */
function validate_personalisation(mixed $raw, OrderPricing $pricing): PersonalisationResult
{
    $data   = personalisation_data();
    $rules  = catalogue_data()['rules'];
    $errors = [];

    if (!is_array($raw) || array_is_list($raw) || !is_array($raw['units'] ?? null) || !array_is_list($raw['units'])) {
        return PersonalisationResult::invalid('invalid_personalisation', [
            'personalisation' => 'We could not read the details for your songs. Please reload the page and try again.',
        ]);
    }

    // ---- The lines this order is paying for, by SKU ------------------------
    $lineQuantity = [];
    $songLines = [];
    foreach ($pricing->lines as $line) {
        $lineQuantity[$line['sku']] = $line['quantity'];
        if ($line['category'] === $rules['primary_category']) {
            $songLines[] = $line;
        }
    }
    if (count($songLines) !== 1) {
        return PersonalisationResult::invalid('one_experience_per_order', [
            'lines' => 'Please order one Moment, Keepsake or Journey at a time.',
        ]);
    }

    $songLine = $songLines[0];
    $songSku  = $songLine['sku'];
    $item     = catalogue_sku($songSku);
    $songs    = (int) ($item['song_count'] ?? 0);
    $eligible = ($item['priority_replacement_eligible'] ?? false) === true;
    $multiUnit = in_array($songLine['product_id'], $data['multi_unit_product_ids'], true);

    $units = $raw['units'];
    if (!$multiUnit && count($units) !== 1) {
        $errors['personalisation.units'] = 'This experience is personalised as a single song product.';
    }
    if (count($units) !== $songLine['quantity']) {
        return PersonalisationResult::invalid('personalisation_mismatch', $errors + [
            'personalisation.units' => 'Your songs do not match your order. Please reload the page and try again.',
        ]);
    }

    $storyMax = personalisation_limit('story_max');
    $aboutMax = personalisation_limit('about_max');
    $styleMax = personalisation_limit('style_label_max');

    $plannedUnits = [];
    $priorityChosen = 0;
    $videosChosen = 0;

    foreach ($units as $u => $unit) {
        $unitNo = $u + 1;
        $label  = $multiUnit && count($units) > 1 ? " on Keepsake {$unitNo}" : '';
        $key    = "personalisation.units.{$u}";

        if (!is_array($unit) || ($unit['sku'] ?? null) !== $songSku || !is_array($unit['memories'] ?? null) || !array_is_list($unit['memories'])) {
            $errors[$key] = 'Your songs do not match your order. Please reload the page and try again.';
            continue;
        }

        $priority = $unit['priorityReplacement'] ?? false;
        if (!is_bool($priority)) {
            $errors["{$key}.priorityReplacement"] = 'That choice could not be read.';
            $priority = false;
        } elseif ($priority && !$eligible) {
            $errors["{$key}.priorityReplacement"] = 'MCB Priority Replacement is only available for Keepsakes.';
        }
        if ($priority) {
            $priorityChosen++;
        }

        if (count($unit['memories']) !== $songs) {
            $errors["{$key}.memories"] = $songs === 1
                ? 'This song needs exactly one memory.'
                : "This needs exactly {$songs} memories, one for each song.";
            continue;
        }

        $plannedMemories = [];
        foreach ($unit['memories'] as $m => $memory) {
            $memoryNo = $m + 1;
            $mKey = "{$key}.memories.{$m}";
            $name = $songLine['product_id'] === 'journey' ? "chapter {$memoryNo}" : ($songs > 1 ? "memory {$memoryNo}{$label}" : "your memory{$label}");

            if (!is_array($memory)) {
                $errors[$mKey] = "We could not read {$name}.";
                continue;
            }

            $story = personalisation_text($memory['story'] ?? null);
            if ($story === null) {
                $errors["{$mKey}.story"] = "Please check the text for {$name}.";
            } elseif ($story === '') {
                $errors["{$mKey}.story"] = 'Tell us about ' . $name . '.';
            } elseif (mb_strlen($story) > $storyMax) {
                $errors["{$mKey}.story"] = "Please keep {$name} to {$storyMax} characters.";
            }

            $about = personalisation_text($memory['about'] ?? '');
            if ($about === null || mb_strlen($about) > $aboutMax) {
                $errors["{$mKey}.about"] = "Please keep who {$name} is for to {$aboutMax} characters.";
            }

            $occasion = $memory['occasion'] ?? '';
            if (!is_string($occasion) || ($occasion !== '' && !in_array($occasion, $data['occasions'], true))) {
                $errors["{$mKey}.occasion"] = "Please choose an occasion from the list for {$name}.";
                $occasion = '';
            }

            $style = $memory['style'] ?? null;
            $choice = is_array($style) ? ($style['choice'] ?? null) : null;
            $styleLabel = null;
            if ($choice === 'MCB_CHOICE') {
                $styleLabel = null;
            } elseif ($choice === 'STYLE') {
                $styleLabel = is_string($style['label'] ?? null) ? $style['label'] : '';
                if (!in_array($styleLabel, $data['styles'], true)) {
                    $errors["{$mKey}.style"] = "Please choose a music style for {$name}.";
                }
            } elseif ($choice === 'CUSTOM') {
                $styleLabel = personalisation_text($style['label'] ?? null);
                if ($styleLabel === null || $styleLabel === '') {
                    $errors["{$mKey}.style"] = "Tell us the style you have in mind for {$name}.";
                } elseif (mb_strlen($styleLabel) > $styleMax) {
                    $errors["{$mKey}.style"] = "Please keep the style for {$name} to {$styleMax} characters.";
                }
            } else {
                $errors["{$mKey}.style"] = "Choose a music style for {$name}, or let MCB choose.";
            }

            $photo = $memory['photo'] ?? false;
            if (!is_bool($photo)) {
                $errors["{$mKey}.photo"] = 'That photo choice could not be read.';
                $photo = false;
            }

            // MCB Memory Music Video: the customer's explicit choice of this song. Never assumed.
            $video = $memory['video'] ?? false;
            if (!is_bool($video)) {
                $errors["{$mKey}.video"] = 'That choice could not be read.';
                $video = false;
            }
            if ($video) {
                $videosChosen++;
            }

            $plannedMemories[] = [
                'video'           => $video === true,
                'story'           => (string) $story,
                'about'           => $about === '' || $about === null ? null : $about,
                'occasion'        => $occasion === '' ? null : $occasion,
                'style_choice'    => (string) $choice,
                'style_label'     => $styleLabel,
                'photo_requested' => $photo,
            ];
        }

        // Single Creative Authority: a record's artwork is created by MCB from
        // the customer's photograph, so each Keepsake and Journey needs one.
        if (in_array($songLine['product_id'], $rules['photo_artwork_product_ids'] ?? [], true)
            && $plannedMemories !== [] && !in_array(true, array_column($plannedMemories, 'photo_requested'), true)) {
            $what = $songLine['product_id'] === 'journey' ? 'your Journey' : ($multiUnit && count($units) > 1 ? "Keepsake {$unitNo}" : 'your Keepsake');
            $errors["{$key}.photo"] = "Please add a photograph for the artwork of {$what}.";
        }

        $plannedUnits[] = ['priority_replacement' => $priority === true, 'memories' => $plannedMemories];
    }

    // ---- Priority Replacement: one line unit per Keepsake that chose it ------
    $prSku = (string) $rules['priority_replacement_sku'];
    if (($lineQuantity[$prSku] ?? 0) !== $priorityChosen) {
        $errors['personalisation.priorityReplacement'] =
            'MCB Priority Replacement must be chosen for each Keepsake it covers. Please review your finishing touches.';
    }

    // ---- Memory Music Video: one line unit per chosen song ----------------------
    $videoSku = (string) ($rules['memory_video_sku'] ?? '');
    if ($videoSku !== '' && ($lineQuantity[$videoSku] ?? 0) !== $videosChosen) {
        $errors['personalisation.memoryVideo'] =
            'Your Memory Music Video must be chosen for one song. Please review your finishing touches.';
    }

    // ---- Plaques -------------------------------------------------------------
    $plaques = $raw['plaques'] ?? [];
    $plannedPlaques = [];
    $plaqueSku = null;
    foreach ($pricing->lines as $line) {
        if ($line['product_id'] === 'personalised-music-plaque') {
            $plaqueSku = $line['sku'];
        }
    }
    if (!is_array($plaques) || !array_is_list($plaques)) {
        $errors['personalisation.plaques'] = 'Your plaque details could not be read.';
        $plaques = [];
    }
    if (count($plaques) !== ($plaqueSku === null ? 0 : $lineQuantity[$plaqueSku])) {
        $errors['personalisation.plaques'] = 'Your plaques do not match your order. Please review your finishing touches.';
    }
    $titleMax = personalisation_limit('song_title_max');
    $artistMax = personalisation_limit('artist_max');
    foreach ($plaques as $p => $plaque) {
        $n = $p + 1;
        $title = is_array($plaque) ? personalisation_text($plaque['songTitle'] ?? null) : null;
        $artist = is_array($plaque) ? personalisation_text($plaque['artist'] ?? null) : null;
        if ($title === null || $title === '') {
            $errors["personalisation.plaques.{$p}.songTitle"] = "Tell us the song title for plaque {$n}.";
        } elseif (mb_strlen($title) > $titleMax) {
            $errors["personalisation.plaques.{$p}.songTitle"] = "Please keep the song title for plaque {$n} to {$titleMax} characters.";
        }
        if ($artist === null || $artist === '') {
            $errors["personalisation.plaques.{$p}.artist"] = "Tell us the artist for plaque {$n}.";
        } elseif (mb_strlen($artist) > $artistMax) {
            $errors["personalisation.plaques.{$p}.artist"] = "Please keep the artist for plaque {$n} to {$artistMax} characters.";
        }
        $plannedPlaques[] = ['song_title' => (string) $title, 'artist' => (string) $artist];
    }

    // ---- Frames --------------------------------------------------------------
    $frames = $raw['frames'] ?? [];
    $plannedFrames = [];
    $frameCounts = [];
    if (!is_array($frames) || !array_is_list($frames)) {
        $errors['personalisation.frames'] = 'Your lyrics frame details could not be read.';
        $frames = [];
    }
    $headingMax = personalisation_limit('frame_heading_max');
    foreach ($frames as $f => $frame) {
        $n = $f + 1;
        $sku = is_array($frame) ? ($frame['sku'] ?? null) : null;
        $frameItem = is_string($sku) ? catalogue_sku($sku) : null;
        if ($frameItem === null || ($frameItem['product_id'] ?? '') !== 'lyrics-frame') {
            $errors["personalisation.frames.{$f}.sku"] = "Please choose a size for frame {$n}.";
            continue;
        }
        $frameCounts[$sku] = ($frameCounts[$sku] ?? 0) + 1;
        $unitNo = $frame['unit'] ?? null;
        $memoryNo = $frame['memory'] ?? null;
        if (!is_int($unitNo) || !is_int($memoryNo) || $unitNo < 1 || $unitNo > count($units) || $memoryNo < 1 || $memoryNo > $songs) {
            $errors["personalisation.frames.{$f}.memory"] = "Choose which song's lyrics to frame for frame {$n}.";
        }
        $heading = personalisation_text($frame['heading'] ?? '');
        if ($heading === null || mb_strlen($heading) > $headingMax) {
            $errors["personalisation.frames.{$f}.heading"] = "Please keep the heading for frame {$n} to {$headingMax} characters.";
        }
        $plannedFrames[] = ['sku' => $sku, 'unit' => (int) $unitNo, 'memory' => (int) $memoryNo, 'heading' => $heading === '' || $heading === null ? null : $heading];
    }

    // ---- Every line is accounted for ----------------------------------------
    foreach ($pricing->lines as $line) {
        $sku = $line['sku'];
        $accounted = match (true) {
            $sku === $songSku, $sku === $prSku, $sku === $plaqueSku => true,
            $sku === ($rules['artwork_preparation_sku'] ?? null) => true,
            $sku === ($rules['memory_video_sku'] ?? null) => true,
            $line['product_id'] === 'lyrics-frame' => ($frameCounts[$sku] ?? 0) === $line['quantity'],
            $line['category'] === 'PLAYER' => true,
            default => false,
        };
        if (!$accounted) {
            $errors['lines'] = 'Your order does not match the details you gave. Please review your finishing touches.';
        }
    }
    foreach ($frameCounts as $sku => $count) {
        if (($lineQuantity[$sku] ?? 0) !== $count) {
            $errors['lines'] = 'Your order does not match the details you gave. Please review your finishing touches.';
        }
    }

    if ($errors !== []) {
        return PersonalisationResult::invalid('personalisation_invalid', $errors);
    }

    return PersonalisationResult::valid([
        'song_sku' => $songSku,
        'units'    => $plannedUnits,
        'plaques'  => $plannedPlaques,
        'frames'   => $plannedFrames,
    ]);
}

/**
 * Stores a validated personalisation plan inside the order transaction.
 *
 * @param array<string,int> $itemIds order_items.id by SKU
 */
function persist_personalisation(PDO $pdo, int $orderId, PersonalisationResult $result, array $itemIds): void
{
    $plan = $result->plan;
    $sku  = $plan['song_sku'];
    $item = catalogue_sku($sku);
    $vinyl = $item['vinyl'] ?? null;

    $unitStmt = $pdo->prepare(
        'INSERT INTO order_units
            (order_id, order_item_id, sku, product_id, kind, unit_index, song_count,
             picture_disc, size_inches, shape, disc_count, gatefold, priority_replacement,
             plaque_song_title, plaque_artist, frame_memory_id, frame_heading)
         VALUES (:oid, :iid, :sku, :pid, :kind, :idx, :songs, :pd, :size, :shape, :discs, :gatefold, :pr,
                 :title, :artist, :fmem, :heading)'
    );
    $memoryStmt = $pdo->prepare(
        'INSERT INTO order_memories
            (order_id, unit_id, sequence, story, about, occasion, style_choice, style_label, photo_requested)
         VALUES (:oid, :uid, :seq, :story, :about, :occasion, :choice, :label, :photo)'
    );

    $memoryIds = [];
    foreach ($plan['units'] as $u => $unit) {
        $unitStmt->execute([
            ':oid'      => $orderId,
            ':iid'      => $itemIds[$sku],
            ':sku'      => $sku,
            ':pid'      => (string) $item['product_id'],
            ':kind'     => 'SONG',
            ':idx'      => $u + 1,
            ':songs'    => (int) $item['song_count'],
            ':pd'       => is_array($vinyl) ? (int) $vinyl['picture_disc'] : null,
            ':size'     => is_array($vinyl) ? (int) $vinyl['size_inches'] : null,
            ':shape'    => is_array($vinyl) ? (string) $vinyl['shape'] : null,
            ':discs'    => is_array($vinyl) ? (int) $vinyl['disc_count'] : null,
            ':gatefold' => is_array($vinyl) ? (int) $vinyl['gatefold'] : null,
            ':pr'       => $unit['priority_replacement'] ? 1 : 0,
            ':title'    => null,
            ':artist'   => null,
            ':fmem'     => null,
            ':heading'  => null,
        ]);
        $unitId = (int) $pdo->lastInsertId();

        foreach ($unit['memories'] as $m => $memory) {
            $memoryStmt->execute([
                ':oid'      => $orderId,
                ':uid'      => $unitId,
                ':seq'      => $m + 1,
                ':story'    => $memory['story'],
                ':about'    => $memory['about'],
                ':occasion' => $memory['occasion'],
                ':choice'   => $memory['style_choice'],
                ':label'    => $memory['style_label'],
                ':photo'    => $memory['photo_requested'] ? 1 : 0,
            ]);
            $memoryIds[$u + 1][$m + 1] = (int) $pdo->lastInsertId();
            if (($memory['video'] ?? false) === true) {
                // Awaiting payment: capacity is held at checkout and reserved when payment is confirmed.
                $videoSku = (string) catalogue_data()['rules']['memory_video_sku'];
                $pdo->prepare('INSERT INTO video_entitlements (order_id, order_item_id, unit_id, memory_id, price_minor, currency, status) VALUES (:o, :i, :u, :m, :p, :c, :s)')
                    ->execute([':o' => $orderId, ':i' => $itemIds[$videoSku], ':u' => $unitId, ':m' => $memoryIds[$u + 1][$m + 1],
                        ':p' => (int) catalogue_sku($videoSku)['price_minor'], ':c' => 'GBP', ':s' => 'AWAITING_PAYMENT']);
            }
        }
    }

    foreach ($plan['plaques'] as $p => $plaque) {
        $plaqueSku = 'personalised-music-plaque';
        $unitStmt->execute([
            ':oid' => $orderId, ':iid' => $itemIds[$plaqueSku], ':sku' => $plaqueSku,
            ':pid' => 'personalised-music-plaque', ':kind' => 'PLAQUE', ':idx' => $p + 1, ':songs' => null,
            ':pd' => null, ':size' => null, ':shape' => null, ':discs' => null, ':gatefold' => null, ':pr' => 0,
            ':title' => $plaque['song_title'], ':artist' => $plaque['artist'], ':fmem' => null, ':heading' => null,
        ]);
    }

    $frameIndex = [];
    foreach ($plan['frames'] as $frame) {
        $frameIndex[$frame['sku']] = ($frameIndex[$frame['sku']] ?? 0) + 1;
        $unitStmt->execute([
            ':oid' => $orderId, ':iid' => $itemIds[$frame['sku']], ':sku' => $frame['sku'],
            ':pid' => 'lyrics-frame', ':kind' => 'FRAME', ':idx' => $frameIndex[$frame['sku']], ':songs' => null,
            ':pd' => null, ':size' => null, ':shape' => null, ':discs' => null, ':gatefold' => null, ':pr' => 0,
            ':title' => null, ':artist' => null,
            ':fmem' => $memoryIds[$frame['unit']][$frame['memory']],
            ':heading' => $frame['heading'],
        ]);
    }
}

/**
 * The photos this order still needs, as upload slots.
 *
 * "memory:<unit>:<song>" for a memory photo the customer said they would add;
 * "plaque:<n>" for every plaque (a plaque cannot be made without its photo).
 *
 * @return array{expected: string[], missing: string[]}
 */
function order_upload_slots(PDO $pdo, int $orderId): array
{
    $stmt = $pdo->prepare(
        "SELECT CONCAT('memory:', u.unit_index, ':', m.sequence) AS slot, up.id AS upload_id
           FROM order_memories m
           JOIN order_units u ON u.id = m.unit_id
           LEFT JOIN order_uploads up ON up.memory_id = m.id
          WHERE m.order_id = :oid AND m.photo_requested = 1
         UNION ALL
         SELECT CONCAT('plaque:', u.unit_index) AS slot, up.id AS upload_id
           FROM order_units u
           LEFT JOIN order_uploads up ON up.unit_id = u.id
          WHERE u.order_id = :oid2 AND u.kind = 'PLAQUE'"
    );
    $stmt->execute([':oid' => $orderId, ':oid2' => $orderId]);

    $expected = [];
    $missing = [];
    foreach ($stmt->fetchAll() as $row) {
        $expected[] = (string) $row['slot'];
        if ($row['upload_id'] === null) {
            $missing[] = (string) $row['slot'];
        }
    }
    sort($expected);
    sort($missing);
    return ['expected' => $expected, 'missing' => $missing];
}
