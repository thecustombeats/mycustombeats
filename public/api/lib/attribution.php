<?php
/**
 * MCB — who gets credited for this, decided by the server.
 *
 * The browser reports what it saw in the URL. This file decides what that
 * means. A browser cannot name an affiliate id, cannot award itself
 * attribution to an affiliate that does not exist, and cannot claim a partner
 * relationship that is not active.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SHARED FILE
 * ─────────────────────────────────────────────────────────────────────────
 * This logic lived inside `order.php`. When Full Package enquiries needed the
 * same attribution — an enquiry that arrives through a partner is worth
 * exactly as much as an order that does, and losing it would make concierge
 * work look like it came from nowhere — the choice was to copy fifty lines or
 * to lift them.
 *
 * Copied, the two would have drifted: a precedence rule fixed in one, a
 * sanitiser tightened in the other, and eventually two different answers to
 * "who introduced this customer" depending on which form they filled in.
 */

declare(strict_types=1);

/**
 * The resolved attribution for one submission.
 *
 * @return array{
 *   source_type:string,
 *   affiliate_id:?int,
 *   partner_id:?int,
 *   referral_raw:?string
 * }
 */
function resolve_attribution(string $referralRaw, string $partnerRaw): array
{
    $referralRaw = trim($referralRaw);
    $partnerRaw  = trim($partnerRaw);

    $sourceType  = 'DIRECT';
    $affiliateId = null;
    $partnerId   = null;

    if ($referralRaw !== '') {
        $username = preg_replace('/[^a-z0-9]/', '', mb_strtolower($referralRaw)) ?? '';
        if ($username !== '') {
            $stmt = db()->prepare('SELECT id FROM affiliates WHERE username = :u LIMIT 1');
            $stmt->execute([':u' => $username]);
            $found = $stmt->fetchColumn();
            if ($found !== false) {
                $affiliateId = (int) $found;
                $sourceType  = 'AFFILIATE';
            }
            // An unrecognised referral is recorded in referral_raw for audit
            // but never credited — the submission simply stays DIRECT.
        }
    }

    // Partner attribution takes precedence: a partner relationship is a
    // commercial contract, an affiliate link is not.
    if ($partnerRaw !== '') {
        $slug = mb_substr(preg_replace('/[^a-z0-9-]/', '', mb_strtolower($partnerRaw)) ?? '', 0, 64);
        if ($slug !== '') {
            $stmt = db()->prepare('SELECT id FROM partners WHERE slug = :s AND active = 1 LIMIT 1');
            $stmt->execute([':s' => $slug]);
            $found = $stmt->fetchColumn();
            if ($found !== false) {
                $partnerId   = (int) $found;
                $sourceType  = 'PARTNER';
                $affiliateId = null;   // one attribution per submission
            }
        }
    }

    $referralStored = $referralRaw !== ''
        ? mb_substr($referralRaw, 0, 190)
        : ($partnerRaw !== '' ? mb_substr($partnerRaw, 0, 190) : null);

    return [
        'source_type'  => $sourceType,
        'affiliate_id' => $affiliateId,
        'partner_id'   => $partnerId,
        'referral_raw' => $referralStored,
    ];
}
