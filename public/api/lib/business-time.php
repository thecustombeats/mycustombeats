<?php

/**
 * MCB BUSINESS TIME — one definition of when a business day begins.
 *
 * Europe/London is the MCB business timezone (a Founder decision, recorded in
 * data/business.json). Timestamps are still STORED in UTC, which is correct and
 * unchanged; this module exists only to decide where a founder-facing day, week
 * or month starts and ends.
 *
 * WHY IT IS ITS OWN FILE. The period helpers used to live in business.php, and
 * business.php requires command-centre.php — so the Command Centre could not
 * reuse them without a circular include and kept its own UTC definition. The
 * result was two founder-facing "todays" on the same screen: Business counted a
 * day from midnight London, MCB Today from midnight UTC. Between late March and
 * late October those are different hours, so an order paid at 00:30 BST counted
 * as today in one tile and yesterday in the other. This file depends on nothing
 * but bootstrap, so both sides can use it.
 *
 * DST. Every boundary is computed with DateTimeImmutable in the business
 * timezone and then converted to UTC, so PHP's timezone database handles the
 * BST/GMT transitions. The clock-change days are genuinely 23 and 25 hours long
 * and the boundaries move with them; nothing here assumes a day is 86400
 * seconds. Arithmetic is done on calendar units ("+1 day", "monday this week"),
 * never on second counts, which is what makes that true.
 */

declare(strict_types=1);

/** The Founders' decision, read from the business policy rather than restated here. */
function mcb_business_timezone_decision(): string
{
    static $decided = null;
    if ($decided === null) {
        $raw = @file_get_contents(__DIR__ . '/../data/business.json');
        $data = is_string($raw) ? json_decode($raw, true) : null;
        $value = is_array($data) ? ($data['founder_decisions']['business_timezone'] ?? null) : null;
        $decided = is_string($value) && in_array($value, DateTimeZone::listIdentifiers(), true) ? $value : 'Europe/London';
    }
    return $decided;
}

/**
 * The business timezone and where it came from.
 *
 * A configured `business.timezone` overrides the founder decision. An invalid
 * one is REPORTED rather than silently ignored: a typo in a host's config used
 * to fall through to the default while still claiming to be configured, so
 * nobody could tell the difference between "correct" and "wrong and ignored".
 */
function mcb_business_timezone(): array
{
    $decided = mcb_business_timezone_decision();
    $configured = mcb_setting('business.timezone', null);
    if (is_string($configured) && $configured !== '') {
        if (in_array($configured, DateTimeZone::listIdentifiers(), true)) {
            return [
                'timezone' => $configured,
                'configured' => true,
                'status' => 'CONFIGURED',
                'source' => $configured === $decided ? 'FOUNDER_DECISION' : 'SERVER_CONFIGURATION',
                'note' => "Business days, weeks and months use {$configured}.",
            ];
        }
        return [
            'timezone' => $decided,
            'configured' => true,
            'status' => 'CONFIGURED_VALUE_INVALID',
            'source' => 'FOUNDER_DECISION',
            'note' => "The configured business timezone is not a known timezone, so {$decided} (the founder decision) is in use. Correct the setting.",
        ];
    }
    return [
        'timezone' => $decided,
        'configured' => true,
        'status' => 'CONFIGURED',
        'source' => 'FOUNDER_DECISION',
        'note' => "Business days, weeks and months use {$decided} (founder decision).",
    ];
}

/**
 * Period boundaries in the business timezone, returned as UTC timestamp strings
 * for the database, plus the local calendar date each period opens on.
 *
 * Every period is half-open [start, end) so no row is counted twice at a
 * boundary, and every one carries an `end` — the Command Centre's old helper
 * returned only a start, so "today" silently meant "today and everything
 * after", which on a rehearsal stack with future-dated fixtures is wrong.
 */
function mcb_business_periods(?int $now = null): array
{
    $tz = new DateTimeZone(mcb_business_timezone()['timezone']);
    $utc = new DateTimeZone('UTC');
    $at = (new DateTimeImmutable('@' . ($now ?? time())))->setTimezone($tz);
    $day = $at->setTime(0, 0);
    $week = $day->modify('monday this week');
    if ($week > $day) {
        $week = $week->modify('-7 days');
    }
    $month = $day->modify('first day of this month');
    $f = static fn (DateTimeImmutable $d): string => $d->setTimezone($utc)->format('Y-m-d H:i:s');
    $period = static fn (string $label, DateTimeImmutable $from, DateTimeImmutable $to, bool $partial): array => [
        'label' => $label,
        'start' => $f($from),
        'end' => $f($to),
        'local_date' => $from->format('Y-m-d'),
        'partial' => $partial,
    ];

    return [
        'timezone' => $tz->getName(),
        'now' => $f($at),
        'today' => $period('Today', $day, $day->modify('+1 day'), true),
        'yesterday' => $period('Yesterday', $day->modify('-1 day'), $day, false),
        'day_before' => $period('The day before', $day->modify('-2 days'), $day->modify('-1 day'), false),
        'week' => $period('This week', $week, $week->modify('+7 days'), true),
        'last_week' => $period('Last week', $week->modify('-7 days'), $week, false),
        'week_before' => $period('The week before', $week->modify('-14 days'), $week->modify('-7 days'), false),
        'month' => $period('This month', $month, $month->modify('+1 month'), true),
        'last_month' => $period('Last month', $month->modify('-1 month'), $month, false),
        'month_before' => $period('The month before', $month->modify('-2 months'), $month->modify('-1 month'), false),
        'all' => ['label' => 'All time', 'start' => null, 'end' => null, 'local_date' => null, 'partial' => false],
    ];
}

/** Half-open membership: `start <= at < end`. "All time" holds everything with a time. */
function mcb_business_in(?string $at, array $period): bool
{
    return $at !== null
        && ($period['start'] === null || ($at >= $period['start'] && $at < $period['end']));
}

/**
 * Today's date in the business timezone, as `Y-m-d`.
 *
 * This replaces `gmdate('Y-m-d')` and SQL `UTC_DATE()` wherever a FOUNDER-FACING
 * calendar day is meant. Between late March and late October those answered with
 * the previous date for the first hour of every London day.
 */
function mcb_business_date(?int $now = null): string
{
    return (new DateTimeImmutable('@' . ($now ?? time())))
        ->setTimezone(new DateTimeZone(mcb_business_timezone()['timezone']))
        ->format('Y-m-d');
}

/** A business date offset by whole calendar days — DST-safe, unlike `time() - 86400`. */
function mcb_business_date_offset(int $days, ?int $now = null): string
{
    return (new DateTimeImmutable('@' . ($now ?? time())))
        ->setTimezone(new DateTimeZone(mcb_business_timezone()['timezone']))
        ->modify(($days >= 0 ? '+' : '-') . abs($days) . ' days')
        ->format('Y-m-d');
}
