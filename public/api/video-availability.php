<?php
/**
 * GET /api/video-availability — whether MCB Memory Music Video can be added now.
 *
 * Public and read-only. Answers from the server's capacity ledger: limited
 * monthly availability, the number of spaces only when it is small, or fully
 * booked. Never invented scarcity; never personal data. The space itself is
 * held under a lock when checkout starts, whatever this said.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/video.php';

require_method('GET');
header('Cache-Control: no-store');

try {
    json_response(200, video_customer_availability(db()));
} catch (OperationsException $e) {
    json_error($e->httpStatus, $e->errorCode, 'Memory Music Video availability could not be checked just now.');
}
