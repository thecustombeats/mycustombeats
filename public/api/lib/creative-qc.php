<?php
/**
 * MCB Creative Factory — pure checks. No database, no network, no provider.
 *
 * Validation of the MCB-owned documents (Fact Ledger, album map, story map,
 * lyric package, Music Direction, composition plan), the objective lyric
 * fact checks, audio header inspection, technical audio QC, album objective
 * QC and vinyl side allocation against VERIFIED capacity only.
 *
 * Everything here reports; nothing here changes audio, shortens a song or
 * decides creative quality. Semantic judgement is either a person's or a
 * future AI reviewer's (creative_semantic_reviewer(), currently DEFERRED).
 */

declare(strict_types=1);

/** The generated Creative Factory policy (src/data/production/creative.ts). */
function creative_data(): array
{
    static $data = null;
    if ($data !== null) {
        return $data;
    }
    $path = __DIR__ . '/../data/creative.json';
    $raw = is_readable($path) ? file_get_contents($path) : false;
    $decoded = $raw === false ? null : json_decode($raw, true);
    if (!is_array($decoded)) {
        error_log('MCB creative: api/data/creative.json is missing or unreadable.');
        throw new RuntimeException('creative_policy_unavailable');
    }
    $data = $decoded;
    return $data;
}

/** Duration policy with the server's optional preferred window. */
function creative_duration_policy(): array
{
    $p = creative_data()['duration'];
    $min = mcb_setting('creative.duration.preferred_min_seconds', null);
    $max = mcb_setting('creative.duration.preferred_max_seconds', null);
    $p['preferred_min_seconds'] = is_int($min) && $min > 0 && $min <= $p['max_seconds'] ? $min : null;
    $p['preferred_max_seconds'] = is_int($max) && $max > 0 && $max <= $p['max_seconds'] ? $max : null;
    return $p;
}

function creative_max_attempts(): int
{
    $configured = mcb_setting('creative.max_generation_attempts', null);
    $default = (int) creative_data()['default_max_generation_attempts'];
    return is_int($configured) ? max(1, min($configured, 10)) : $default;
}

/** ADVISORY (default): gates are evaluated and reported; REQUIRED: they block. */
function creative_enforcement(): string
{
    return mcb_setting('creative.enforcement', 'ADVISORY') === 'REQUIRED' ? 'REQUIRED' : 'ADVISORY';
}

/* ------------------------------------------------------------------ */
/* Text normalisation                                                  */
/* ------------------------------------------------------------------ */

/** Lower-case ASCII word tokens: "Zoë's 12th" → ["zoes", "12th"]. */
function creative_tokens(string $text): array
{
    $ascii = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $text);
    $ascii = strtolower($ascii === false ? $text : $ascii);
    $ascii = str_replace(["'", '`', '"', '^', '~'], '', $ascii);
    $parts = preg_split('/[^a-z0-9]+/', $ascii) ?: [];
    return array_values(array_filter($parts, static fn (string $t): bool => $t !== ''));
}

/** Whether a phrase occurs as a whole-word token sequence (never a raw substring). */
function creative_phrase_index(array $haystack, array $needle): ?int
{
    $n = count($needle);
    if ($n === 0) {
        return null;
    }
    for ($i = 0; $i + $n <= count($haystack); $i++) {
        if (array_slice($haystack, $i, $n) === $needle) {
            return $i;
        }
    }
    return null;
}

/** Word 3-shingle Jaccard similarity of two texts, 0..1. */
function creative_similarity(string $a, string $b): float
{
    $shingles = static function (string $t): array {
        $tok = creative_tokens($t);
        $set = [];
        for ($i = 0; $i + 3 <= count($tok); $i++) {
            $set[implode(' ', array_slice($tok, $i, 3))] = true;
        }
        return $set;
    };
    $x = $shingles($a);
    $y = $shingles($b);
    if ($x === [] || $y === []) {
        return 0.0;
    }
    $inter = count(array_intersect_key($x, $y));
    return $inter / (count($x) + count($y) - $inter);
}

/* ------------------------------------------------------------------ */
/* Document validation                                                 */
/* ------------------------------------------------------------------ */

final class CreativeValidationException extends RuntimeException
{
    public function __construct(public readonly array $problems)
    {
        parent::__construct('invalid_creative_document');
    }
}

function creative_str(mixed $v, int $max, bool $required = false): bool
{
    if ($v === null || $v === '') {
        return !$required;
    }
    return is_string($v) && mb_strlen($v) <= $max;
}

function creative_str_list(mixed $v, int $maxItems, int $maxLen): bool
{
    if ($v === null) {
        return true;
    }
    if (!is_array($v) || !array_is_list($v) || count($v) > $maxItems) {
        return false;
    }
    foreach ($v as $item) {
        if (!is_string($item) || $item === '' || mb_strlen($item) > $maxLen) {
            return false;
        }
    }
    return true;
}

/** Facts allocated to a track (their tracks list contains it, or ALL). */
function creative_facts_for_track(array $ledger, int $track): array
{
    return array_values(array_filter($ledger['facts'] ?? [], static fn (array $f): bool =>
        ($f['tracks'] ?? null) === 'ALL' || (is_array($f['tracks'] ?? null) && in_array($track, $f['tracks'], true))));
}

/**
 * Validates a Fact Ledger revision. Customer-supplied facts from the previous
 * version cannot silently disappear or change value.
 */
function creative_validate_fact_ledger(array $ledger, int $trackCount, ?array $previous): void
{
    $d = creative_data();
    $problems = [];
    $facts = $ledger['facts'] ?? null;
    if (!is_array($facts) || !array_is_list($facts) || count($facts) > 400) {
        throw new CreativeValidationException(['facts' => 'A list of facts is required.']);
    }
    $ids = [];
    foreach ($facts as $i => $f) {
        $where = "facts.{$i}";
        if (!is_array($f) || !is_string($f['id'] ?? null) || preg_match('/^[A-Z0-9][A-Z0-9_-]{0,39}$/', $f['id']) !== 1) {
            $problems[$where] = 'Each fact needs an id (A-Z, 0-9, _ or -).';
            continue;
        }
        if (isset($ids[$f['id']])) {
            $problems[$where] = 'Fact ids must be unique.';
        }
        $ids[$f['id']] = true;
        if (!in_array($f['type'] ?? null, $d['fact_types'], true)) $problems["{$where}.type"] = 'Unknown fact type.';
        if (!in_array($f['classification'] ?? null, $d['fact_classifications'], true)) $problems["{$where}.classification"] = 'EXACT, SEMANTIC or CREATIVE_GUIDANCE.';
        if (!in_array($f['importance'] ?? null, $d['fact_importance'], true)) $problems["{$where}.importance"] = 'CRITICAL, HIGH or NORMAL.';
        if (!in_array($f['verification'] ?? null, $d['fact_verification'], true)) $problems["{$where}.verification"] = 'Unknown verification status.';
        if (!creative_str($f['value'] ?? null, 1000, true)) $problems["{$where}.value"] = 'A value (up to 1000 characters) is required.';
        if (!creative_str($f['source'] ?? null, 80, true)) $problems["{$where}.source"] = 'Where the fact came from is required.';
        if (!creative_str_list($f['accepted_forms'] ?? null, 10, 120)) $problems["{$where}.accepted_forms"] = 'Accepted forms: up to 10 short strings.';
        if (!creative_str($f['pronunciation'] ?? null, 200)) $problems["{$where}.pronunciation"] = 'Pronunciation: up to 200 characters.';
        $tracks = $f['tracks'] ?? null;
        $tracksOk = $tracks === 'ALL' || (is_array($tracks) && array_is_list($tracks) && $tracks !== []
            && array_filter($tracks, static fn ($t): bool => !is_int($t) || $t < 1 || $t > $trackCount) === []);
        if (!$tracksOk) $problems["{$where}.tracks"] = "Tracks: \"ALL\" or track numbers 1–{$trackCount}.";
    }
    if (!creative_str_list($ledger['exclusions'] ?? null, 50, 200)) {
        $problems['exclusions'] = 'Exclusions: up to 50 phrases.';
    }
    foreach ($previous['facts'] ?? [] as $old) {
        if (($old['verification'] ?? '') !== 'CUSTOMER_SUPPLIED') {
            continue;
        }
        $kept = array_values(array_filter($facts, static fn ($f): bool => is_array($f) && ($f['id'] ?? null) === $old['id']));
        if ($kept === [] || ($kept[0]['value'] ?? null) !== $old['value']) {
            $problems["customer_fact.{$old['id']}"] = 'A customer-supplied fact cannot be removed or reworded.';
        }
    }
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

function creative_validate_album_map(array $map, array $jobsByTrack, array $ledger): void
{
    $d = creative_data();
    $problems = [];
    $tracks = $map['tracks'] ?? null;
    if (!is_array($tracks) || count($tracks) !== count($jobsByTrack)) {
        throw new CreativeValidationException(['tracks' => 'The album map needs exactly one entry per track (' . count($jobsByTrack) . ').']);
    }
    $factIds = array_column($ledger['facts'] ?? [], null, 'id');
    if (!creative_str($map['album_title'] ?? null, 120)) {
        $problems['album_title'] = 'Up to 120 characters.';
    }
    $seenMemories = [];
    foreach ($tracks as $i => $t) {
        $n = $i + 1;
        if (($t['track_number'] ?? null) !== $n) $problems["tracks.{$i}.track_number"] = "Tracks must run 1–" . count($jobsByTrack) . ' in order.';
        $memory = $t['memory_id'] ?? null;
        if (!is_int($memory) || !in_array($memory, array_column($jobsByTrack, 'memory_id'), true) || isset($seenMemories[$memory])) {
            $problems["tracks.{$i}.memory_id"] = 'Each track takes one of this album\'s memories, once.';
        }
        $seenMemories[$memory] = true;
        foreach (['working_title' => 120, 'emotional_role' => 300, 'relationship_to_neighbours' => 300, 'deliberate_variation' => 300] as $field => $max) {
            if (!creative_str($t[$field] ?? null, $max)) $problems["tracks.{$i}.{$field}"] = "Up to {$max} characters.";
        }
        if (($t['narrative_role'] ?? null) !== null && !in_array($t['narrative_role'], $d['album_narrative_roles'], true)) $problems["tracks.{$i}.narrative_role"] = 'Unknown narrative role.';
        $energy = $t['target_energy'] ?? null;
        if ($energy !== null && (!is_int($energy) || $energy < 1 || $energy > 10)) $problems["tracks.{$i}.target_energy"] = 'Energy 1–10.';
        $dur = $t['target_duration_seconds'] ?? null;
        if (!is_int($dur) || $dur < 1 || $dur > (int) $d['duration']['max_seconds']) $problems["tracks.{$i}.target_duration_seconds"] = 'A target up to the 300-second ceiling.';
        foreach ($t['allocated_fact_ids'] ?? [] as $fid) {
            if (!isset($factIds[$fid])) $problems["tracks.{$i}.allocated_fact_ids"] = "Unknown fact {$fid}.";
        }
    }
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

function creative_validate_story_map(array $story, array $allocatedIds): void
{
    $problems = [];
    foreach (['opening', 'narrative_progression', 'emotional_build', 'central_statement', 'climax', 'resolution', 'intended_musical_movement'] as $field) {
        if (!creative_str($story[$field] ?? null, 1000)) $problems[$field] = 'Up to 1000 characters.';
    }
    foreach (array_merge($story['important_memories'] ?? [], $story['allocated_fact_ids'] ?? []) as $fid) {
        if (!in_array($fid, $allocatedIds, true)) $problems['facts'] = "Fact {$fid} is not allocated to this track.";
    }
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

function creative_validate_lyrics(array $lyrics, array $allocatedIds): void
{
    $d = creative_data();
    $problems = [];
    if (!creative_str($lyrics['title'] ?? null, 120, true)) $problems['title'] = 'A working title is required.';
    $sections = $lyrics['sections'] ?? null;
    if (!is_array($sections) || !array_is_list($sections) || $sections === [] || count($sections) > 30) {
        throw new CreativeValidationException($problems + ['sections' => 'Between 1 and 30 sections are required.']);
    }
    $vocal = false;
    foreach ($sections as $i => $s) {
        if (!in_array($s['type'] ?? null, $d['lyric_section_types'], true)) $problems["sections.{$i}.type"] = 'Unknown section type.';
        if (!creative_str($s['text'] ?? null, 2000)) $problems["sections.{$i}.text"] = 'Up to 2000 characters.';
        if (!creative_str($s['direction'] ?? null, 300)) $problems["sections.{$i}.direction"] = 'Up to 300 characters.';
        if (!creative_str($s['emotional_intention'] ?? null, 300)) $problems["sections.{$i}.emotional_intention"] = 'Up to 300 characters.';
        if (!in_array($s['type'] ?? null, ['INSTRUMENTAL'], true) && is_string($s['text'] ?? null) && trim($s['text']) !== '') {
            $vocal = true;
        }
        foreach ($s['fact_refs'] ?? [] as $fid) {
            if (!in_array($fid, $allocatedIds, true)) $problems["sections.{$i}.fact_refs"] = "Fact {$fid} is not allocated to this track.";
        }
    }
    if (!$vocal) $problems['sections'] = 'At least one section needs lyrics.';
    foreach ($lyrics['pronunciation_notes'] ?? [] as $i => $note) {
        if (!in_array($note['fact_id'] ?? null, $allocatedIds, true) || !creative_str($note['note'] ?? null, 200, true)) $problems["pronunciation_notes.{$i}"] = 'A note for an allocated fact.';
    }
    if (!creative_str_list($lyrics['exclusions'] ?? null, 30, 200)) $problems['exclusions'] = 'Up to 30 phrases.';
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

/** Artist-imitation phrasing is translated into musical characteristics, never stored as a direction. */
const MCB_IMITATION_PATTERN = '/\b(in the style of|sounds? like|sound-alike|imitat\w*|voice of|as sung by|cover of)\b/i';

function creative_validate_music_direction(array $dir): void
{
    $max = (int) creative_data()['duration']['max_seconds'];
    $problems = [];
    foreach (['genre' => 60, 'subgenre' => 60, 'era_influence' => 40, 'key' => 12, 'mode' => 20, 'vocal_presentation' => 120, 'mood' => 120, 'production_character' => 200, 'language' => 40] as $f => $len) {
        if (!creative_str($dir[$f] ?? null, $len)) $problems[$f] = "Up to {$len} characters.";
    }
    if (($dir['time_signature'] ?? null) !== null && preg_match('#^\d{1,2}/\d{1,2}$#', (string) $dir['time_signature']) !== 1) $problems['time_signature'] = 'e.g. 3/4.';
    $bpmMin = $dir['bpm_min'] ?? null;
    $bpmMax = $dir['bpm_max'] ?? null;
    foreach (['bpm_min' => $bpmMin, 'bpm_max' => $bpmMax] as $f => $v) {
        if ($v !== null && (!is_int($v) || $v < 30 || $v > 250)) $problems[$f] = 'BPM 30–250.';
    }
    if (is_int($bpmMin) && is_int($bpmMax) && $bpmMin > $bpmMax) $problems['bpm_min'] = 'Minimum above maximum.';
    foreach (['energy', 'vocal_intensity'] as $f) {
        $v = $dir[$f] ?? null;
        if ($v !== null && (!is_int($v) || $v < 1 || $v > 10)) $problems[$f] = '1–10.';
    }
    foreach (['instrumentation', 'positive_directions', 'negative_directions'] as $f) {
        if (!creative_str_list($dir[$f] ?? null, 20, 160)) $problems[$f] = 'Up to 20 short phrases.';
    }
    $all = implode(' ', array_merge((array) ($dir['positive_directions'] ?? []), [(string) ($dir['production_character'] ?? ''), (string) ($dir['vocal_presentation'] ?? '')]));
    if (preg_match(MCB_IMITATION_PATTERN, $all) === 1) {
        $problems['positive_directions'] = 'Describe musical characteristics (tempo, instruments, vocal tone, era) rather than imitating an artist.';
    }
    $target = $dir['target_duration_seconds'] ?? null;
    $ceiling = $dir['max_duration_seconds'] ?? null;
    if (!is_int($target) || $target < 1 || $target > $max) $problems['target_duration_seconds'] = "A target up to {$max} seconds.";
    if (!is_int($ceiling) || $ceiling > $max || (is_int($target) && $ceiling < $target)) $problems['max_duration_seconds'] = "A maximum no higher than {$max} seconds and not below the target.";
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

/**
 * The MCB composition plan derived from a lyric package: one plan section per
 * lyric section, the target shared by weight (sung lines; an instrumental or
 * spoken section counts as one). Provider-neutral.
 */
function creative_build_plan(array $lyrics, array $direction, int $lyricVersion, int $directionVersion): array
{
    $target = (int) $direction['target_duration_seconds'];
    $weights = array_map(static function (array $s): int {
        $lines = count(array_filter(preg_split('/\R/', (string) ($s['text'] ?? '')) ?: [], static fn ($l): bool => trim($l) !== ''));
        return max(1, $lines);
    }, $lyrics['sections']);
    $total = array_sum($weights);
    $sections = [];
    $assigned = 0;
    foreach ($lyrics['sections'] as $i => $s) {
        $seconds = $i === count($weights) - 1 ? $target - $assigned : max(1, (int) round($target * $weights[$i] / $total));
        $assigned += $seconds;
        $sections[] = [
            'index' => $i + 1,
            'type' => $s['type'],
            'target_seconds' => $seconds,
            'lyric_section_index' => $i + 1,
            'instrumentation' => $direction['instrumentation'] ?? [],
            'positive_directions' => array_values(array_filter([$s['direction'] ?? null])),
            'negative_directions' => [],
            'emotional_role' => $s['emotional_intention'] ?? null,
            'adherence' => ($s['fact_refs'] ?? []) !== [] ? 'STRICT' : ($s['type'] === 'CHORUS' ? 'HIGH' : 'FLEXIBLE'),
            'fact_refs' => $s['fact_refs'] ?? [],
        ];
    }
    return [
        'schema' => 'mcb.composition_plan.v1',
        'status' => 'DERIVED_FROM_LYRICS',
        'lyric_version' => $lyricVersion,
        'direction_version' => $directionVersion,
        'target_duration_seconds' => $target,
        'max_duration_seconds' => (int) $direction['max_duration_seconds'],
        'sections' => $sections,
    ];
}

/** Total ≈ target (within the planning tolerance) and never above the ceiling. */
function creative_validate_plan(array $plan, array $lyrics, array $allocatedIds): void
{
    $d = creative_data();
    $max = (int) $d['duration']['max_seconds'];
    $problems = [];
    $sections = $plan['sections'] ?? null;
    if (!is_array($sections) || $sections === [] || count($sections) > 40) {
        throw new CreativeValidationException(['sections' => 'Between 1 and 40 sections are required.']);
    }
    $total = 0;
    foreach ($sections as $i => $s) {
        if (!in_array($s['type'] ?? null, $d['composition_section_types'], true)) $problems["sections.{$i}.type"] = 'Unknown section type.';
        $sec = $s['target_seconds'] ?? null;
        if (!is_int($sec) || $sec < 1) $problems["sections.{$i}.target_seconds"] = 'Whole seconds, at least 1.';
        $total += is_int($sec) ? $sec : 0;
        $ref = $s['lyric_section_index'] ?? null;
        if ($ref !== null && (!is_int($ref) || $ref < 1 || $ref > count($lyrics['sections']))) $problems["sections.{$i}.lyric_section_index"] = 'Not a section of the lyric package.';
        if (!in_array($s['adherence'] ?? null, $d['adherence_importance'], true)) $problems["sections.{$i}.adherence"] = 'STRICT, HIGH or FLEXIBLE.';
        foreach (['instrumentation', 'positive_directions', 'negative_directions'] as $f) {
            if (!creative_str_list($s[$f] ?? null, 20, 160)) $problems["sections.{$i}.{$f}"] = 'Up to 20 short phrases.';
        }
        foreach ($s['fact_refs'] ?? [] as $fid) {
            if (!in_array($fid, $allocatedIds, true)) $problems["sections.{$i}.fact_refs"] = "Fact {$fid} is not allocated to this track.";
        }
    }
    $target = $plan['target_duration_seconds'] ?? null;
    if (!is_int($target) || $target < 1 || $target > $max) {
        $problems['target_duration_seconds'] = "A target up to {$max} seconds.";
    } else {
        $tolerance = $target * ((int) $d['duration']['plan_tolerance_percent']) / 100;
        if (abs($total - $target) > $tolerance) $problems['total'] = "Sections total {$total} s; the target is {$target} s (±{$d['duration']['plan_tolerance_percent']}%).";
    }
    if ($total > $max) $problems['total_ceiling'] = "Sections total {$total} s, above the {$max}-second ceiling.";
    if ($problems !== []) {
        throw new CreativeValidationException($problems);
    }
}

/* ------------------------------------------------------------------ */
/* Lyric / content fact QC                                             */
/* ------------------------------------------------------------------ */

/** A future AI-assisted semantic reviewer. None is connected: DEFERRED. */
function creative_semantic_reviewer(): array
{
    return ['status' => 'DEFERRED', 'reviewer' => null];
}

function creative_levenshtein_close(string $a, string $b): bool
{
    if ($a === $b || strlen($a) < 3 || strlen($b) < 3) {
        return false;
    }
    $limit = max(1, intdiv(max(strlen($a), strlen($b)), 5));
    return levenshtein($a, $b) <= $limit;
}

/**
 * Objective fact checks of lyrics (a lyric package or what was sung) against
 * the Fact Ledger and the track's allocation.
 *
 * @param array $context other_texts: other tracks' lyrics in this album;
 *                       foreign_values: EXACT values from other customers' ledgers;
 *                       prohibited: phrases never to appear;
 *                       fact_refs: fact ids the package claims to use;
 *                       semantic_attested: a person already confirmed the semantic items
 * @return array{status:string, checks:list<array>, semantic:array}
 */
function creative_fact_qc(array $ledger, int $track, string $text, array $context): array
{
    $tokens = creative_tokens($text);
    $checks = [];
    $allocated = creative_facts_for_track($ledger, $track);
    $allocatedIds = array_column($allocated, 'id');
    $refs = $context['fact_refs'] ?? [];
    $ownForms = [];
    foreach ($ledger['facts'] ?? [] as $f) {
        foreach (array_merge([(string) $f['value']], $f['accepted_forms'] ?? []) as $form) {
            $ownForms[] = creative_tokens((string) $form);
        }
    }

    foreach ($refs as $fid) {
        if (!in_array($fid, $allocatedIds, true)) {
            $checks[] = ['id' => 'UNALLOCATED_FACT_REFERENCE', 'result' => 'FAIL', 'fact_id' => $fid];
        }
    }

    foreach ($allocated as $f) {
        if ($f['classification'] !== 'EXACT') {
            continue;
        }
        $required = $f['importance'] === 'CRITICAL' || in_array($f['id'], $refs, true);
        $forms = array_map('creative_tokens', array_merge([(string) $f['value']], $f['accepted_forms'] ?? []));
        $found = false;
        foreach ($forms as $form) {
            if (creative_phrase_index($tokens, $form) !== null) {
                $found = true;
                break;
            }
        }
        if ($found) {
            $checks[] = ['id' => 'EXACT_FACT_PRESENT', 'result' => 'PASS', 'fact_id' => $f['id']];
            continue;
        }
        // A near miss ("Margret" for "Margaret") is an incorrect exact fact, not a creative choice.
        $near = null;
        foreach ($forms as $form) {
            foreach ($form as $want) {
                foreach ($tokens as $got) {
                    if (creative_levenshtein_close($want, $got)) {
                        $near = $got;
                        break 3;
                    }
                }
            }
        }
        if ($near !== null) {
            $checks[] = ['id' => 'INCORRECT_EXACT_FACT', 'result' => 'FAIL', 'fact_id' => $f['id'], 'found' => $near];
        } elseif ($required) {
            $checks[] = ['id' => 'MISSING_REQUIRED_EXACT_FACT', 'result' => 'FAIL', 'fact_id' => $f['id']];
        }
    }

    // Every memory allocated to the track must be referenced by the package.
    foreach ($allocated as $f) {
        if (in_array($f['type'], ['MEMORY', 'TRAVEL_MEMORY'], true) && ($context['fact_refs_required'] ?? true) && !in_array($f['id'], $refs, true)) {
            $checks[] = ['id' => 'ALLOCATED_MEMORY_NOT_REFERENCED', 'result' => 'FAIL', 'fact_id' => $f['id']];
        }
    }

    // Wrong-customer contamination: another customer's exact name or place.
    foreach ($context['foreign_values'] ?? [] as $value) {
        $form = creative_tokens((string) $value);
        if ($form === [] || strlen(implode('', $form)) < 3) {
            continue;
        }
        $isOwn = false;
        foreach ($ownForms as $own) {
            if ($own === $form) {
                $isOwn = true;
                break;
            }
        }
        if (!$isOwn && creative_phrase_index($tokens, $form) !== null) {
            $checks[] = ['id' => 'WRONG_CUSTOMER_CONTAMINATION', 'result' => 'FAIL'];
            break;
        }
    }

    // Prohibited phrases: the ledger's exclusions and MCB's own list.
    foreach (array_merge($ledger['exclusions'] ?? [], $context['prohibited'] ?? []) as $phrase) {
        if (creative_phrase_index($tokens, creative_tokens((string) $phrase)) !== null) {
            $checks[] = ['id' => 'PROHIBITED_PHRASE', 'result' => 'FAIL'];
        }
    }

    // A year nobody supplied may be an invented fact: a person looks.
    $knownYears = [];
    foreach ($ownForms as $form) {
        foreach ($form as $t) {
            if (preg_match('/^(19|20)\d\d$/', $t) === 1) {
                $knownYears[$t] = true;
            }
        }
    }
    foreach ($tokens as $t) {
        if (preg_match('/^(19|20)\d\d$/', $t) === 1 && !isset($knownYears[$t])) {
            $checks[] = ['id' => 'UNSUPPLIED_YEAR', 'result' => 'REVIEW', 'found' => $t];
        }
    }

    // Duplication against the album's other tracks.
    $threshold = (float) creative_data()['lyric_duplication_threshold'];
    foreach ($context['other_texts'] ?? [] as $otherTrack => $other) {
        if (creative_similarity($text, (string) $other) >= $threshold) {
            $checks[] = ['id' => 'DUPLICATED_LYRICS', 'result' => 'FAIL', 'other_track' => $otherTrack];
        }
    }

    $semanticItems = array_values(array_map(static fn (array $f): string => $f['id'], array_filter($allocated, static fn (array $f): bool => $f['classification'] === 'SEMANTIC')));
    $reviewer = creative_semantic_reviewer();
    $semanticPending = $semanticItems !== [] && $reviewer['status'] !== 'AVAILABLE' && !($context['semantic_attested'] ?? false);

    // A person's attestation covers the semantic items and anything flagged for review — never a FAIL.
    $attested = (bool) ($context['semantic_attested'] ?? false);
    $results = array_column($checks, 'result');
    $status = in_array('FAIL', $results, true) ? 'FAIL'
        : ((in_array('REVIEW', $results, true) && !$attested) || $semanticPending ? 'REVIEW_REQUIRED' : 'PASS');

    return [
        'status' => $status,
        'checks' => $checks,
        'semantic' => ['reviewer' => $reviewer['status'], 'items' => $semanticItems, 'attested' => (bool) ($context['semantic_attested'] ?? false)],
    ];
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

/**
 * Reads an audio file's header. Decoding is not attempted (shared hosting has
 * no audio toolchain); duration comes from the container's own header.
 *
 * @return array{container:?string, readable:bool, duration_ms:?int, sample_rate_hz:?int, channels:?int, bits_per_sample:?int}
 */
function creative_inspect_audio(?string $path, int $size): array
{
    $none = ['container' => null, 'readable' => false, 'duration_ms' => null, 'sample_rate_hz' => null, 'channels' => null, 'bits_per_sample' => null];
    if ($path === null || !is_file($path) || $size <= 0) {
        return $none;
    }
    $head = (string) file_get_contents($path, false, null, 0, 65536);

    if (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WAVE') {
        $r = $none + [];
        $r['container'] = 'WAV';
        $pos = 12;
        $fmt = null;
        while ($pos + 8 <= strlen($head)) {
            $id = substr($head, $pos, 4);
            $len = unpack('V', substr($head, $pos + 4, 4))[1];
            if ($id === 'fmt ' && $pos + 24 <= strlen($head)) {
                $fmt = unpack('vformat/vchannels/Vrate/Vbyterate/vblock/vbits', substr($head, $pos + 8, 16));
            }
            if ($id === 'data') {
                if ($fmt !== null && $fmt['byterate'] > 0 && $pos + 8 + $len <= $size) {
                    $r['readable'] = true;
                    $r['duration_ms'] = (int) round($len * 1000 / $fmt['byterate']);
                    $r['sample_rate_hz'] = $fmt['rate'];
                    $r['channels'] = $fmt['channels'];
                    $r['bits_per_sample'] = $fmt['bits'];
                }
                break;
            }
            $pos += 8 + $len + ($len % 2);
        }
        return $r;
    }

    if (substr($head, 0, 4) === 'fLaC' && strlen($head) >= 42 && (ord($head[4]) & 0x7F) === 0) {
        $b = substr($head, 8, 34);
        $rate = (ord($b[10]) << 12) | (ord($b[11]) << 4) | (ord($b[12]) >> 4);
        $channels = ((ord($b[12]) >> 1) & 0x07) + 1;
        $bits = (((ord($b[12]) & 0x01) << 4) | (ord($b[13]) >> 4)) + 1;
        $samples = ((ord($b[13]) & 0x0F) << 32) | (ord($b[14]) << 24) | (ord($b[15]) << 16) | (ord($b[16]) << 8) | ord($b[17]);
        $ok = $rate > 0 && $samples > 0;
        return ['container' => 'FLAC', 'readable' => $ok, 'duration_ms' => $ok ? (int) round($samples * 1000 / $rate) : null,
            'sample_rate_hz' => $ok ? $rate : null, 'channels' => $ok ? $channels : null, 'bits_per_sample' => $ok ? $bits : null];
    }

    if (substr($head, 0, 4) === 'FORM' && in_array(substr($head, 8, 4), ['AIFF', 'AIFC'], true)) {
        $pos = 12;
        while ($pos + 8 <= strlen($head)) {
            $id = substr($head, $pos, 4);
            $len = unpack('N', substr($head, $pos + 4, 4))[1];
            if ($id === 'COMM' && $pos + 26 <= strlen($head)) {
                $c = unpack('nchannels/Nframes/nbits', substr($head, $pos + 8, 8));
                $ext = substr($head, $pos + 16, 10);
                $exp = ((ord($ext[0]) & 0x7F) << 8 | ord($ext[1])) - 16383;
                $mant = unpack('N', substr($ext, 2, 4))[1];
                $rate = (int) round($mant * (2 ** ($exp - 31)));
                $ok = $rate > 0 && $c['frames'] > 0;
                return ['container' => 'AIFF', 'readable' => $ok, 'duration_ms' => $ok ? (int) round($c['frames'] * 1000 / $rate) : null,
                    'sample_rate_hz' => $ok ? $rate : null, 'channels' => $ok ? $c['channels'] : null, 'bits_per_sample' => $ok ? $c['bits'] : null];
            }
            $pos += 8 + $len + ($len % 2);
        }
        return ['container' => 'AIFF'] + $none;
    }

    if (str_starts_with($head, 'ID3') || (strlen($head) > 1 && ord($head[0]) === 0xFF && (ord($head[1]) & 0xE0) === 0xE0)) {
        // Readable as MP3, but its duration is not reliably in a header: a person
        // registers a lossless file for QC, or a future adapter supplies metadata.
        return ['container' => 'MP3', 'readable' => true, 'duration_ms' => null, 'sample_rate_hz' => null, 'channels' => null, 'bits_per_sample' => null];
    }
    return $none;
}

/**
 * Technical QC of a candidate or master file.
 *
 * @param array $expected order_id, reference, job_id, attempt_number and what the request claimed
 */
function creative_technical_qc(array $audio, int $size, ?string $sha256, array $expected, array $claimed): array
{
    $policy = creative_duration_policy();
    $maxMs = (int) $policy['max_seconds'] * 1000;
    $minRate = mcb_setting('creative.min_sample_rate_hz', null);
    $minRate = is_int($minRate) && $minRate > 0 ? $minRate : (int) creative_data()['default_min_sample_rate_hz'];
    $role = $expected['role'] ?? 'AUDIO_PRODUCTION_MASTER';
    $maxBytes = function_exists('production_role_limit') ? production_role_limit($role)['configured_bytes'] : (int) mcb_setting('creative.max_audio_bytes', 250 * 1024 * 1024);
    $capability = creative_data()['audio_format_capabilities'][$audio['container'] ?? ''] ?? null;
    $d = $audio['duration_ms'];
    $checks = [
        'FILE_EXISTS' => $size > 0 ? 'PASS' : 'FAIL',
        'FILE_READABLE' => $audio['readable'] ? 'PASS' : 'FAIL',
        'SUPPORTED_TYPE' => ($capability['format_supported'] ?? false) === true ? 'PASS' : 'FAIL',
        'DURATION_READABLE' => $d !== null && $d > 0 ? 'PASS' : 'FAIL',
        'DURATION_WITHIN_CEILING' => $d !== null && $d > 0 && $d <= $maxMs ? 'PASS' : 'FAIL',
        'SAMPLE_RATE' => $audio['sample_rate_hz'] !== null && $audio['sample_rate_hz'] >= $minRate ? 'PASS' : 'FAIL',
        'CHANNELS' => in_array($audio['channels'], [1, 2], true) ? 'PASS' : 'FAIL',
        'FILE_SIZE' => $size > 0 && $size <= $maxBytes ? 'PASS' : 'FAIL',
        'HASH_RECORDED' => is_string($sha256) && strlen($sha256) === 64 ? 'PASS' : 'FAIL',
        'ORDER_MATCH' => ($claimed['order_id'] ?? null) === $expected['order_id'] && ($claimed['reference'] ?? null) === $expected['reference'] ? 'PASS' : 'FAIL',
        'JOB_MATCH' => ($claimed['job_id'] ?? null) === $expected['job_id'] ? 'PASS' : 'FAIL',
        'ATTEMPT_MATCH' => ($claimed['attempt_number'] ?? $expected['attempt_number']) === $expected['attempt_number'] ? 'PASS' : 'FAIL',
    ];
    // Not exactly 195 seconds is not a failure. Outside a configured preferred window is noted for people.
    $notes = [
        'format_supported' => ($capability['format_supported'] ?? false) === true,
        'duration_inspection_capability' => $capability['duration_inspection'] ?? 'NOT_AVAILABLE',
        'preferred_for_production' => ($capability['preferred_for_production'] ?? false) === true,
    ];
    if ($d === null && ($capability['duration_inspection'] ?? null) === 'NOT_AVAILABLE') {
        // Not "unsupported": the duration cannot be verified without an audio probe, so a duration check cannot pass.
        $notes['duration_check'] = 'DURATION_INSPECTION_NOT_AVAILABLE_FOR_FORMAT';
    }
    if ($d !== null) {
        $notes['deviation_from_target_seconds'] = round($d / 1000 - (int) $policy['target_seconds'], 1);
        if (($policy['preferred_min_seconds'] !== null && $d < $policy['preferred_min_seconds'] * 1000)
            || ($policy['preferred_max_seconds'] !== null && $d > $policy['preferred_max_seconds'] * 1000)) {
            $notes['outside_preferred_window'] = true;
        }
    }
    return [
        'status' => in_array('FAIL', $checks, true) ? 'FAIL' : 'PASS',
        'checks' => $checks,
        'notes' => $notes,
        'min_sample_rate_hz' => $minRate,
    ];
}

/* ------------------------------------------------------------------ */
/* Vinyl programme                                                     */
/* ------------------------------------------------------------------ */

/**
 * The capacity profile for a SKU: a validated, manufacturer-verified entry
 * from api/data/physical-capacity.json when one exists, otherwise the
 * catalogue profile (UNVERIFIED, no figures). Nothing is estimated.
 */
function creative_capacity_profile(string $sku): ?array
{
    $base = null;
    foreach (creative_data()['capacity_profiles'] as $p) {
        if ($p['sku'] === $sku) {
            $base = $p;
        }
    }
    if ($base === null) {
        return null;
    }
    $path = __DIR__ . '/../data/physical-capacity.json';
    $raw = is_readable($path) ? json_decode((string) file_get_contents($path), true) : null;
    foreach (is_array($raw) ? ($raw['profiles'] ?? []) : [] as $v) {
        if (($v['sku'] ?? null) !== $sku) {
            continue;
        }
        $num = static fn ($x): bool => $x === null || (is_int($x) && $x > 0);
        $valid = is_string($v['source'] ?? null) && trim($v['source']) !== ''
            && is_string($v['last_verified_date'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/', $v['last_verified_date']) === 1
            && is_int($v['version'] ?? null)
            && $num($v['verified_total_capacity_seconds'] ?? null) && $num($v['verified_per_side_seconds'] ?? null)
            && $num($v['preferred_programme_seconds'] ?? null) && $num($v['hard_manufacturing_maximum_seconds'] ?? null)
            && (($v['verified_total_capacity_seconds'] ?? null) !== null || ($v['verified_per_side_seconds'] ?? null) !== null);
        if (!$valid) {
            error_log("MCB creative: physical-capacity.json entry for {$sku} is incomplete; capacity stays UNVERIFIED.");
            continue;
        }
        return array_merge($base, [
            'verified_total_capacity_seconds' => $v['verified_total_capacity_seconds'] ?? null,
            'verified_per_side_seconds' => $v['verified_per_side_seconds'] ?? null,
            'preferred_programme_seconds' => $v['preferred_programme_seconds'] ?? null,
            'hard_manufacturing_maximum_seconds' => $v['hard_manufacturing_maximum_seconds'] ?? null,
            'source' => $v['source'], 'version' => $v['version'], 'last_verified_date' => $v['last_verified_date'],
            'mastering_notes' => $v['mastering_notes'] ?? [], 'supplier_restrictions' => $v['supplier_restrictions'] ?? [],
            'status' => 'VERIFIED',
        ]);
    }
    return $base;
}

/**
 * Track order kept; tracks split into contiguous sides so the longest side is
 * as short as possible. Informational when capacity is unverified.
 *
 * @param list<int> $seconds track durations in order
 * @return list<list<int>> track indexes per side
 */
function creative_side_allocation(array $seconds, int $sides): array
{
    $n = count($seconds);
    $sides = max(1, min($sides, max(1, $n)));
    $prefix = [0];
    foreach ($seconds as $s) {
        $prefix[] = end($prefix) + $s;
    }
    $best = array_fill(0, $sides + 1, array_fill(0, $n + 1, PHP_INT_MAX));
    $cut = array_fill(0, $sides + 1, array_fill(0, $n + 1, 0));
    $best[0][0] = 0;
    for ($k = 1; $k <= $sides; $k++) {
        for ($i = 1; $i <= $n; $i++) {
            for ($j = $k - 1; $j < $i; $j++) {
                if ($best[$k - 1][$j] === PHP_INT_MAX) {
                    continue;
                }
                $cost = max($best[$k - 1][$j], $prefix[$i] - $prefix[$j]);
                if ($cost < $best[$k][$i]) {
                    $best[$k][$i] = $cost;
                    $cut[$k][$i] = $j;
                }
            }
        }
    }
    $result = [];
    $i = $n;
    for ($k = $sides; $k >= 1; $k--) {
        $j = $cut[$k][$i];
        array_unshift($result, range($j, $i - 1));
        $i = $j;
    }
    return $result;
}

/** Programme QC against VERIFIED capacity only. Never alters audio. */
function creative_capacity_qc(array $profile, array $trackSeconds): array
{
    $allocation = creative_side_allocation(array_values($trackSeconds), (int) $profile['side_count']);
    $labels = range('A', 'Z');
    $sides = [];
    foreach ($allocation as $k => $indexes) {
        $sides[] = ['side' => $labels[$k], 'tracks' => array_map(static fn (int $i): int => $i + 1, $indexes),
            'seconds' => array_sum(array_map(static fn (int $i): int => $trackSeconds[$i], $indexes))];
    }
    $total = array_sum($trackSeconds);
    $problems = [];
    if ($profile['status'] !== 'VERIFIED') {
        $status = 'CAPACITY_UNVERIFIED';
    } else {
        if ($profile['verified_per_side_seconds'] !== null) {
            foreach ($sides as $side) {
                if ($side['seconds'] > $profile['verified_per_side_seconds']) $problems[] = "SIDE_{$side['side']}_EXCEEDS_VERIFIED_CAPACITY";
            }
        }
        if ($profile['verified_total_capacity_seconds'] !== null && $total > $profile['verified_total_capacity_seconds']) $problems[] = 'TOTAL_EXCEEDS_VERIFIED_CAPACITY';
        if ($profile['hard_manufacturing_maximum_seconds'] !== null && $total > $profile['hard_manufacturing_maximum_seconds']) $problems[] = 'TOTAL_EXCEEDS_HARD_MAXIMUM';
        $status = $problems === [] ? 'CAPACITY_PASSED' : 'AUDIO_CAPACITY_EXCEPTION';
    }
    return [
        'status' => $status,
        'total_seconds' => $total,
        'sides' => $sides,
        'problems' => $problems,
        'above_preferred_programme' => $profile['preferred_programme_seconds'] !== null && $total > $profile['preferred_programme_seconds'],
        'profile' => ['sku' => $profile['sku'], 'status' => $profile['status'], 'version' => $profile['version'], 'source' => $profile['source'], 'last_verified_date' => $profile['last_verified_date']],
        'audio_modified' => false,
    ];
}
