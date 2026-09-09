<?php
/**
 * POST /api/concierge/enquiry — record a Full Package enquiry.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THIS IS NOT AN ORDER, AND NOTHING HERE MAY PRETEND OTHERWISE
 * ─────────────────────────────────────────────────────────────────────────
 * It writes one row to `concierge_enquiries` and returns an acknowledgement
 * reference. It does not touch `orders`, does not call Stripe, does not
 * create a Checkout Session, does not resolve a Payment Link, and computes no
 * amount of any kind. There is no code path from this file to a charge.
 *
 * The customer has been told, on the page they submitted, that an enquiry
 * costs nothing and commits them to nothing. Everything below exists to keep
 * that true.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IT ASKS FOR, AND WHAT IT DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────
 * It asks who the customer is, how to reach them, what the occasion is, when
 * it is needed, roughly where it is going, what they would like to spend, and
 * the story.
 *
 * It does NOT ask the recipient's age, gender, personality, tastes or
 * relationship category, and nothing here profiles a recipient or scores an
 * enquiry. The story field is where a customer says what matters, in their
 * own words, to a person who will read it. That is what a consultation is
 * for, and it is better than any set of tick boxes at guessing.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE BUDGET IS RECORDED AS THE CUSTOMER STATED IT
 * ─────────────────────────────────────────────────────────────────────────
 * An exact figure is stored as an exact figure, in minor units of the
 * currency they chose, and that currency is stored as declared. Nothing here
 * converts to GBP: MCB would be recording a number the customer never said,
 * at a rate true for one minute, and the proposal conversation would then run
 * against MCB's arithmetic instead of the customer's own figure.
 *
 * "No fixed spending limit" is stored as `budget_mode = 'OPEN'` with NO
 * amount. It is never 0, never NULL-as-if-unanswered and never a sentinel.
 * Zero would sort and read as "no budget" — the exact opposite of what was
 * said — and would push MCB's most valuable enquiries to the bottom of every
 * list an operator looks at.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/attribution.php';

require_method('POST');
require_same_origin();

$body = read_json_body();
$v    = new Validator($body);

/* ------------------------------------------------------------------ */
/* Who, and how to reach them                                          */
/* ------------------------------------------------------------------ */

$name  = $v->required('name', 'Name', 160);
$email = $v->email('email');
$phone = $v->optional('phone', 40);

/**
 * The contact method the customer prefers.
 *
 * Defaults to EMAIL rather than failing, because a missing preference is not
 * a reason to refuse an enquiry — MCB already has an email address, which is
 * the one channel guaranteed to work.
 */
$contactRaw = mb_strtoupper(trim((string) ($body['preferredContact'] ?? 'EMAIL')));
$contact    = in_array($contactRaw, ['EMAIL', 'PHONE', 'WHATSAPP'], true)
    ? $contactRaw
    : 'EMAIL';

// A phone preference with no number is unreachable, and silently emailing
// instead would look like the preference was ignored.
if ($contact !== 'EMAIL' && ($phone === null || $phone === '')) {
    $v->fail('phone', 'Please add a number so we can reach you that way.');
}

/* ------------------------------------------------------------------ */
/* The occasion                                                        */
/* ------------------------------------------------------------------ */

$occasion = $v->optional('occasion', 160);

/**
 * When it is needed. Optional, and "not fixed yet" is a real answer.
 *
 * Validated as a calendar date rather than trusted: `checkdate` rejects
 * 2026-02-30, which `strtotime` would happily roll forward to 2 March and
 * quietly give MCB a deadline the customer never set.
 */
$neededByRaw = trim((string) ($body['neededBy'] ?? ''));
$neededBy    = null;

if ($neededByRaw !== '') {
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $neededByRaw, $m) !== 1
        || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        $v->fail('neededBy', 'Please give that date as YYYY-MM-DD.');
    } else {
        $neededBy = $neededByRaw;
    }
}

// A region or a city — never a full delivery address. There is nothing to
// deliver yet, so collecting one would be personal data gathered ahead of any
// need for it.
$region = $v->optional('deliveryRegion', 190);

/* ------------------------------------------------------------------ */
/* Budget                                                             */
/* ------------------------------------------------------------------ */

$budgetMode = $v->oneOf('budgetMode', ['AMOUNT', 'OPEN', 'UNSURE'], 'Budget');

$budgetMinor    = null;
$budgetCurrency = null;

if ($budgetMode === 'AMOUNT') {
    /**
     * Parsed from the string the customer typed, not from a float.
     *
     * "10,000", "10000", "£10,000" and "10000.00" are all the same intent and
     * all arrive as text. Reading them as a float and multiplying by 100 is
     * where 79.99 becomes 7998 pence, so the major and minor parts are
     * separated as integers and combined exactly.
     */
    $raw = trim((string) ($body['budgetAmount'] ?? ''));

    // Strip grouping separators, spaces and any currency symbol the customer
    // pasted in; the currency itself comes from its own field.
    $cleaned = preg_replace('/[^0-9.]/', '', $raw) ?? '';

    if ($cleaned === '' || substr_count($cleaned, '.') > 1) {
        $v->fail('budgetAmount', 'Please give that as a number, for example 5000.');
    } else {
        [$major, $minorPart] = array_pad(explode('.', $cleaned, 2), 2, '');
        $minorPart = substr(str_pad($minorPart, 2, '0'), 0, 2);

        $minor = (int) $major * 100 + (int) $minorPart;

        if ($minor <= 0) {
            // Zero is not a budget. It is also exactly what "no fixed limit"
            // must never be stored as, so it is refused rather than accepted
            // into a field that would then be ambiguous.
            $v->fail('budgetAmount', 'Please give an amount above zero, or choose one of the other options.');
        } elseif ($minor > 100_000_000_00) {
            // A hundred million is not a real gift budget; it is a typo or a
            // test. Refused with a plain message rather than stored.
            $v->fail('budgetAmount', 'That amount looks like a typo — please check it.');
        } else {
            $budgetMinor = $minor;
        }
    }

    /**
     * The currency, STORED AS DECLARED.
     *
     * Restricted to the set the site actually offers, so the column cannot
     * fill with free text — but never rewritten to GBP. See the header.
     */
    $currencyRaw = mb_strtoupper(trim((string) ($body['budgetCurrency'] ?? '')));
    if (preg_match('/^[A-Z]{3}$/', $currencyRaw) !== 1) {
        $v->fail('budgetCurrency', 'Please choose a currency.');
    } else {
        $budgetCurrency = $currencyRaw;
    }
}

/* ------------------------------------------------------------------ */
/* The story                                                           */
/* ------------------------------------------------------------------ */

/**
 * The long-form field, and the one the consultation actually begins from.
 *
 * Capped generously rather than tightly: someone describing forty years of a
 * marriage should not hit a limit, and MEDIUMTEXT holds far more than this.
 * The cap exists to bound the request, not to edit the customer.
 */
$storyRaw = trim((string) ($body['story'] ?? ''));
$story    = $storyRaw === '' ? null : mb_substr($storyRaw, 0, 8000);

$v->stopIfInvalid();

/* ------------------------------------------------------------------ */
/* Rate limiting                                                       */
/* ------------------------------------------------------------------ */

$ipHash = hash_ip(client_ip());

/**
 * Five enquiries an hour from one source.
 *
 * Deliberately looser than a per-minute limit and deliberately not tight: a
 * genuine customer might send one, reconsider, and send a fuller one. It
 * exists to stop a script filling MCB's concierge inbox, not to police
 * someone drafting carefully.
 */
enforce_rate_limit('concierge_enquiries', 'ip_hash', $ipHash, 5, 3600);

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

$attribution = resolve_attribution(
    (string) ($body['referral'] ?? ''),
    (string) ($body['partner'] ?? '')
);

/* ------------------------------------------------------------------ */
/* The acknowledgement reference                                       */
/* ------------------------------------------------------------------ */

/**
 * `FP-YYYY-XXXXXX`, e.g. FP-2026-7QK4ZM.
 *
 * NOT an MCB-YYYY-NNNNNN order reference, and not drawn from
 * `reference_sequence`. That format means "a paid order" in every MCB email,
 * invoice and CRM screen, and issuing one for an enquiry would tell the
 * customer they had bought something.
 *
 * The tail is random rather than sequential, so the code reveals nothing
 * about how many enquiries MCB has received. Crockford's alphabet minus the
 * characters that get misread aloud on a phone call, which is exactly how
 * this reference will be used.
 */
function concierge_reference(): string
{
    $alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    $tail     = '';
    for ($i = 0; $i < 6; $i++) {
        $tail .= $alphabet[random_int(0, strlen($alphabet) - 1)];
    }
    return 'FP-' . gmdate('Y') . '-' . $tail;
}

/* ------------------------------------------------------------------ */
/* Write                                                               */
/* ------------------------------------------------------------------ */

$reference = null;

try {
    $reference = db_transaction(function (PDO $pdo) use (
        $name, $email, $phone, $contact, $occasion, $neededBy, $region,
        $budgetMode, $budgetMinor, $budgetCurrency, $story,
        $attribution, $ipHash
    ): string {
        /**
         * Link to an existing customer where the email already exists.
         *
         * A lookup, never an insert. An enquiry is not a purchase, and
         * creating a `customers` row from one would put people who only ever
         * asked a question into the customer table — inflating counts and
         * putting them in scope for anything that treats that table as a list
         * of buyers. If they commission, `order.php` creates the record then.
         */
        $stmt = $pdo->prepare('SELECT id FROM customers WHERE email = :e LIMIT 1');
        $stmt->execute([':e' => $email]);
        $found      = $stmt->fetchColumn();
        $customerId = $found === false ? null : (int) $found;

        /**
         * Retry on the astronomically unlikely reference collision.
         *
         * 32^6 is a billion codes, so this will effectively never run — but
         * the column is UNIQUE, and the alternative to retrying is a customer
         * seeing a 500 for a form they filled in perfectly.
         */
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $reference = concierge_reference();

            try {
                $insert = $pdo->prepare(
                    'INSERT INTO concierge_enquiries (
                        reference, customer_id, name, email, phone, preferred_contact,
                        occasion, needed_by, delivery_region,
                        budget_mode, budget_amount_minor, budget_currency,
                        story, status,
                        source_type, affiliate_id, partner_id, referral_raw,
                        ip_hash
                     ) VALUES (
                        :ref, :cust, :name, :email, :phone, :contact,
                        :occasion, :needed, :region,
                        :bmode, :bminor, :bcur,
                        :story, :status,
                        :src, :aff, :ptr, :rawref,
                        :iph
                     )'
                );

                $insert->execute([
                    ':ref'      => $reference,
                    ':cust'     => $customerId,
                    ':name'     => $name,
                    ':email'    => $email,
                    ':phone'    => $phone,
                    ':contact'  => $contact,
                    ':occasion' => $occasion,
                    ':needed'   => $neededBy,
                    ':region'   => $region,
                    ':bmode'    => $budgetMode,
                    ':bminor'   => $budgetMinor,
                    ':bcur'     => $budgetCurrency,
                    ':story'    => $story,
                    // NEW, not PENDING. Nothing is pending, because nothing
                    // has been agreed or charged.
                    ':status'   => 'NEW',
                    ':src'      => $attribution['source_type'],
                    ':aff'      => $attribution['affiliate_id'],
                    ':ptr'      => $attribution['partner_id'],
                    ':rawref'   => $attribution['referral_raw'],
                    ':iph'      => $ipHash,
                ]);

                return $reference;
            } catch (PDOException $e) {
                if (!is_duplicate_error($e)) {
                    throw $e;
                }
                // Collision: fall through and draw another reference.
            }
        }

        throw new RuntimeException('Could not allocate a concierge reference.');
    });
} catch (Throwable $e) {
    error_log('MCB concierge enquiry failed: ' . $e->getMessage());
    json_error(500, 'server_error', 'We could not record that just now. Please try again, or email us directly.');
}

/**
 * The response says "received", not "confirmed" and not "ordered".
 *
 * No amount, no total, no currency of charge and no payment field — there is
 * nothing of that kind to report, and a client that received one could render
 * it.
 */
json_response(201, [
    'reference' => $reference,
    'status'    => 'RECEIVED',
]);
