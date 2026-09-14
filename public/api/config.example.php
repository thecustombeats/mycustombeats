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
        'webhook_secret' => '',   // whsec_… — from the endpoint in the SAME mode as the key
        'secret_key'     => '',   // sk_test_… to rehearse; sk_live_… for real payments — server-side only

        // Server-created Checkout Sessions — the ONLY online payment path.
        // OFF until Bella/Lewis approve going live. While false,
        // /api/checkout/session returns 503 and the order form tells customers
        // online checkout is not yet available.
        //
        // TURNING IT ON REQUIRES ALL OF:
        //   - 'secret_key' above: sk_test_… rehearses in Stripe TEST mode
        //   - 'webhook_secret' above, from a TEST-mode endpoint subscribed to
        //     checkout.session.completed and checkout.session.async_payment_succeeded
        //   - 'app.site_origin' below, which builds the success/cancel URLs
        //   - every migration in db/migrations applied, including
        //     2026-09-14-sprint4-order-persistence.sql
        // The website asks GET /api/checkout/status; there is no browser switch.
        'checkout_sessions_enabled' => false,

        // LIVE PAYMENT — FOUNDER LAUNCH APPROVAL ONLY. A sk_live_… key does
        // nothing without this set to exactly true. Leave false until Bella
        // and Lewis explicitly approve taking real payments.
        'live_checkout_approved' => false,

        // Stripe's API base. Test override ONLY — the acceptance suite points
        // it at a local stub so tests never reach Stripe and need no key.
        // Leave absent in production, which then uses api.stripe.com.
        // 'api_base' => '',
    ],

    // ---- Customer communication ---------------------------------------
    // Resend (https://resend.com) sends the POST-PAYMENT customer email —
    // the one carrying the MCB reference. Fired by the Stripe webhook only
    // after the paid transaction has committed.
    //
    // While either value is empty the email is skipped entirely and logged:
    // payments, references and the CRM are completely unaffected. Nothing
    // here can fail a payment. Set them later and replay the Stripe event
    // (Developers -> Events -> Resend) to deliver the outstanding mail.
    //
    'resend' => [
        // Server-side only. Treat exactly like the Stripe secret: never
        // commit it, never expose it to the browser, never log it.
        // Create at Resend -> API Keys with "Sending access" only.
        'api_key' => '',   // re_…

        // Must be an address on a domain VERIFIED in Resend, or the send is
        // rejected. Friendly-name form is accepted:
        //     'My Custom Beats <orders@send.mycustombeats.com>'
        // A subdomain is recommended over the root domain — see
        // docs/CRM-DEPLOYMENT.md.
        'from'    => '',

        // Test override ONLY. Leave absent in production, which then uses
        // https://api.resend.com/emails. The acceptance suite points this at
        // a local stub so tests never send real mail.
        // 'api_url' => '',

        // TEST MODE. A confirmation for a Stripe TEST payment goes ONLY to this
        // mailbox (with [TEST] in the subject), never to the address the
        // customer typed. Empty = test confirmations are not sent at all.
        'test_recipient' => '',
    ],

    // ---- Delivery ------------------------------------------------------
    // No production delivery rates are authorised yet, so physical orders are
    // quoted UNAVAILABLE and cannot be paid online (see api/lib/delivery.php).
    'delivery' => [
        // TEST ONLY. Uses clearly labelled fake rates so a physical order can
        // be rehearsed end to end. Ignored unless the Stripe key is a TEST key.
        'use_test_fixtures' => false,
    ],

    // ---- Customer photos ----------------------------------------------
    // Absolute path of a private directory OUTSIDE the web root, writable by
    // PHP, e.g. /home/<user>/mcb-uploads. A directory named mcb-uploads above
    // the web root is found automatically. Without one, photos go to
    // api/storage/uploads (denied over HTTP) and are lost on a redeploy.
    'uploads' => [
        'path' => '',
    ],

    // ---- Operations workflow -------------------------------------------
    // Optional. When both are set, the Stripe webhook POSTs a signed
    // `order.paid` notice (MCB reference, lines, total — no contact details,
    // address or story) after each order is paid. HTTPS only. Server-side
    // only: never put this URL in the website bundle.
    'operations' => [
        'order_paid_webhook_url'    => '',
        'order_paid_webhook_secret' => '',   // 32+ random bytes, shared with the receiver
    ],

    // ---- Reviews ------------------------------------------------------
    // Where a customer is sent to say what their memory meant to them.
    //
    // REQUIRED IN PRODUCTION BEFORE REVIEW REQUESTS CAN BE SENT. It is empty
    // here because no verified MCB review URL exists anywhere in this
    // repository, and writing a plausible-looking Trustpilot address would
    // send real customers to a page that may not be MCB's.
    //
    // While it is empty, POST /api/crm/review-request answers
    // `not_configured` and sends nothing. Orders, completion and every other
    // part of the lifecycle are unaffected.
    //
    // Must be http(s). Anything else is refused rather than put in an inbox.
    'reviews' => [
        'url' => '',   // e.g. https://uk.trustpilot.com/evaluate/...
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
