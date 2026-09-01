<?php
/**
 * MCB CRM — configuration template.
 *
 * COPY THIS FILE, DO NOT EDIT IT.
 *
 * Preferred location (outside the web root, survives redeploys):
 *     /home/<user>/mcb-config.php
 *
 * Fallback (inside the web root — only if your host forbids the above):
 *     public_html/api/config.php
 *     …which .htaccess already denies over HTTP. Verify that yourself:
 *     https://www.mycustombeats.com/api/config.php must return 403.
 *
 * Never commit a filled-in copy. `api/config.php` is gitignored.
 */

return [
    // ---- Database -----------------------------------------------------
    // From hPanel → Databases → MySQL Databases.
    'db' => [
        'host'     => 'localhost',
        'name'     => 'uXXXXXXXX_mcb_crm',
        'user'     => 'uXXXXXXXX_mcb',
        'password' => 'REPLACE_ME',
        'charset'  => 'utf8mb4',
    ],

    // ---- Secrets ------------------------------------------------------
    // Generate each with:  php -r "echo bin2hex(random_bytes(32)), PHP_EOL;"
    // They must be long, random and different from one another.

    // Salts the SHA-256 of visitor IPs. Changing it invalidates existing
    // rate-limit history but no stored data.
    'ip_salt' => 'REPLACE_ME_WITH_32_RANDOM_BYTES_HEX',

    // Signs affiliate dashboard tokens. Changing it logs every affiliate
    // out and requires reissuing their links.
    'token_secret' => 'REPLACE_ME_WITH_32_RANDOM_BYTES_HEX',

    // Bearer key for GET /api/crm/orders. This is the governed read
    // surface for MCB OS and internal tooling — never put it in a browser.
    'crm_api_key' => 'REPLACE_ME_WITH_32_RANDOM_BYTES_HEX',

    // ---- Stripe -------------------------------------------------------
    // Leave both empty until the webhook endpoint is registered in the
    // Stripe Dashboard. While empty, /api/stripe/webhook refuses all
    // requests rather than processing unverified ones.
    'stripe' => [
        'webhook_secret' => '',   // whsec_…
        'secret_key'     => '',   // sk_live_… — server-side only, never shipped
    ],

    // ---- Customer communication ---------------------------------------
    // Make.com webhook that sends the POST-PAYMENT customer email — the one
    // carrying the MCB reference. Fired by the Stripe webhook only after the
    // paid transaction has committed.
    //
    // While this is empty the notification is skipped entirely and logged:
    // payments, references and the CRM are completely unaffected. Nothing
    // here can fail a payment.
    //
    // This is NOT the order-form webhook in the website bundle. That one
    // fires at submission, before payment, and must no longer send the
    // customer a fulfilment email.
    'make' => [
        'post_payment_webhook' => '',   // https://hook.eu1.make.com/…
    ],

    // ---- Behaviour ----------------------------------------------------
    'app' => [
        // Origin allowed to call the write endpoints. Requests whose Origin
        // header is present and does not match are rejected.
        'site_origin' => 'https://www.mycustombeats.com',

        // Affiliate dashboard token lifetime, in days.
        'token_ttl_days' => 90,

        // Set true only while diagnosing: returns error detail in responses.
        // Must be false in production.
        'debug' => false,
    ],
];
