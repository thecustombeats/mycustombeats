<?php
/**
 * TEST FIXTURE — a stand-in for the Make.com webhook.
 *
 * Copied into the API directory by the acceptance-test setup only. It is not
 * part of public/ and never ships: production's Make.com URL comes from
 * configuration, and nothing in the application references this file.
 *
 * Appends each received payload to a log the tests read back, so they can
 * assert what the server actually sent and how many times it sent it.
 *
 * Writing "fail" into /tmp/make-mode makes it answer 500, which is how the
 * tests exercise the delivery-failure path without unplugging anything.
 */

declare(strict_types=1);

$mode = @file_get_contents('/tmp/make-mode');
if (is_string($mode) && trim($mode) === 'fail') {
    http_response_code(500);
    echo '{"error":"simulated outage"}';
    exit;
}

file_put_contents(
    '/tmp/make-sink.log',
    (file_get_contents('php://input') ?: '') . "\n",
    FILE_APPEND
);

http_response_code(200);
echo '{"ok":true}';
