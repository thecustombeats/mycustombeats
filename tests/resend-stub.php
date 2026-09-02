<?php
/**
 * TEST FIXTURE — a stand-in for https://api.resend.com/emails.
 *
 * Copied into the API directory by the acceptance-test setup only. It is not
 * part of public/ and never ships: production reads the real endpoint from
 * MCB_RESEND_ENDPOINT, and nothing in the application references this file.
 *
 * Records each request — body and headers — to a log the tests read back, so
 * they can assert what was actually sent, how many times, and that the
 * Authorization header reached the provider (while separately asserting the
 * key never reaches a webhook response or the PHP error log).
 *
 * /tmp/resend-mode selects the failure being rehearsed:
 *
 *   ok         200 {"id":"…"}          a normal accepted send
 *   http_fail  422 {"message":"…"}     Resend rejects it (bad from, bad key)
 *   timeout    sleeps past the client timeout, then answers
 *   malformed  200 but no message id   accepted-looking, not actually queued
 *   empty      200 with an empty body  a proxy or gateway answering instead
 */

declare(strict_types=1);

$mode = trim((string) @file_get_contents('/tmp/resend-mode')) ?: 'ok';

$headers = function_exists('getallheaders') ? getallheaders() : [];
file_put_contents('/tmp/resend-stub.log', json_encode([
    'body'    => json_decode(file_get_contents('php://input') ?: '', true),
    'headers' => $headers,
    'mode'    => $mode,
], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND);

header('Content-Type: application/json');

switch ($mode) {
    case 'http_fail':
        http_response_code(422);
        echo '{"statusCode":422,"name":"validation_error","message":"The from address is not verified."}';
        return;

    case 'timeout':
        // Longer than MCB_NOTIFY_TIMEOUT_SECONDS, so the client gives up first.
        sleep(8);
        http_response_code(200);
        echo '{"id":"late-but-accepted"}';
        return;

    case 'malformed':
        // 2xx that is NOT an accepted send. The client must not treat this as
        // delivered, or the customer is marked notified with nothing sent.
        http_response_code(200);
        echo '{"unexpected":"shape"}';
        return;

    case 'empty':
        http_response_code(200);
        echo '';
        return;

    default:
        http_response_code(200);
        echo '{"id":"4ef9a417-02e9-4d39-ad75-9611e0fcc33c"}';
}
