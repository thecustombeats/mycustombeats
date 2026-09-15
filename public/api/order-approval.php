<?php
/**
 * POST /api/order-approval — RETIRED.
 *
 * Customer song and artwork approval was retired by the Single Creative
 * Authority decision (15 September 2026). Old approval links (historical and
 * test only) still reach this endpoint from /approve#…; it answers with a
 * polite, non-actionable state and changes NOTHING:
 *
 *  • no approval, change request, stage move, email or event is recorded;
 *  • no order detail, listening link, reference or revision position is
 *    returned, whether the link was once valid or never was, so the answer
 *    discloses nothing about any order;
 *  • it stays rate-limited and same-origin, like every customer endpoint.
 *
 * REQUEST  { token, action? }   RESPONSE 200 { retired: true, message }
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('POST');
require_same_origin();

enforce_scoped_rate_limit('approval', 30, 600);

read_json_body(8192);

json_response(200, [
    'retired' => true,
    'message' => 'This link is no longer used. MCB now creates and checks your work without a separate approval step, and your finished creation is revealed on your private order page. If you need anything, reply to our email and we will help.',
]);
