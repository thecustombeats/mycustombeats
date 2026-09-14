<?php
/**
 * POST /api/live/enquiry — an MCB LIVE event enquiry, stored on MCB's server.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AN ENQUIRY, NOT A BOOKING
 * ─────────────────────────────────────────────────────────────────────────
 * It writes one row to `live_enquiries` and returns a LIVE- reference. It
 * does not check or promise availability, compute a quote, take a deposit,
 * touch `orders` or call Stripe. The customer is told exactly that.
 *
 * The approximate budget is stored as the customer typed it, currency and
 * all. The details field is theirs; it never goes into an event or a log.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/operations.php';

require_method('POST');
require_same_origin();

$body = read_json_body(16384);
$v    = new Validator($body);

$name  = $v->required('name', 'Name', 160);
$email = $v->email('email');
$phone = $v->optional('phone', 40);

$requestType = $v->oneOf('requestType', ['AVAILABILITY', 'QUOTE', 'AVAILABILITY_AND_QUOTE'], 'What you would like');
$eventType   = $v->required('eventType', 'Event type', 120);
$location    = $v->required('location', 'Location', 190);
$performer   = $v->oneOf('performer', ['DJ_RINALDI', 'LADY_LAKH', 'TOGETHER', 'HELP_ME_CHOOSE'], 'Performer');
$duration    = $v->oneOf('duration', ['1_HOUR', '2_HOURS', '3_HOURS', 'EXTENDED', 'TO_BE_DISCUSSED'], 'Performance duration');
$songReveal  = $v->oneOf('songReveal', ['YES', 'NO', 'ALREADY_HAVE_SONG'], 'Song Reveal');
$budget      = $v->optional('approximateBudget', 120);

$eventDate = null;
$dateRaw = trim((string) ($body['eventDate'] ?? ''));
if ($dateRaw !== '') {
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $dateRaw, $m) !== 1 || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        $v->fail('eventDate', 'Please give the date as YYYY-MM-DD, or leave it blank if it is not fixed.');
    } elseif ($dateRaw < gmdate('Y-m-d', time() - 86400)) {
        $v->fail('eventDate', 'That date has already passed.');
    } else {
        $eventDate = $dateRaw;
    }
}

$details = operations_text($body['details'] ?? null, 4000);

// Names and single-line fields cannot carry line breaks into anything that
// later becomes an email header or subject.
foreach (['name' => $name, 'eventType' => $eventType, 'location' => $location, 'phone' => $phone, 'approximateBudget' => $budget] as $field => $value) {
    if ($value !== null && preg_match('/[\r\n\x00]/', $value) === 1) {
        $v->fail($field, 'Please remove line breaks from this field.');
    }
}

$v->stopIfInvalid();

enforce_rate_limit('live_enquiries', 'ip_hash', hash_ip(client_ip()), 5, 3600);

try {
    $reference = db_transaction(function (PDO $pdo) use (
        $requestType, $name, $email, $phone, $eventType, $eventDate, $location,
        $performer, $duration, $budget, $songReveal, $details
    ): string {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $reference = enquiry_reference('LIVE');
            try {
                $pdo->prepare(
                    'INSERT INTO live_enquiries
                        (reference, request_type, name, email, phone, event_type, event_date, location,
                         performer, duration, approximate_budget, song_reveal, details, status, ip_hash, created_at)
                     VALUES (:ref, :rt, :name, :email, :phone, :et, :ed, :loc,
                             :perf, :dur, :budget, :reveal, :details, :status, :ip, UTC_TIMESTAMP())'
                )->execute([
                    ':ref' => $reference, ':rt' => $requestType, ':name' => $name, ':email' => $email,
                    ':phone' => $phone, ':et' => $eventType, ':ed' => $eventDate, ':loc' => $location,
                    ':perf' => $performer, ':dur' => $duration, ':budget' => $budget, ':reveal' => $songReveal,
                    ':details' => $details, ':status' => 'NEW', ':ip' => hash_ip(client_ip()),
                ]);
            } catch (PDOException $e) {
                if (is_duplicate_error($e)) {
                    continue;
                }
                throw $e;
            }
            record_operations_event($pdo, 'MCB_LIVE_ENQUIRY', $reference, 'MCB_LIVE.ENQUIRY_RECEIVED', [
                'performer' => $performer, 'request_type' => $requestType, 'song_reveal' => $songReveal,
                'date_fixed' => $eventDate !== null,
            ], 'received');
            return $reference;
        }
        throw new RuntimeException('Could not allocate an MCB LIVE reference.');
    });
} catch (Throwable $e) {
    error_log('MCB LIVE enquiry failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not send that just now. Please try again in a moment.');
}

json_response(201, ['reference' => $reference, 'status' => 'RECEIVED']);
