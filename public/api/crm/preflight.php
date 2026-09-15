<?php
/**
 * GET /api/crm/preflight — is this server ready to take real payments?
 *
 * CRM key required. Run it on the deployed server BEFORE setting
 * `stripe.live_checkout_approved`, and again after. See
 * docs/DEPLOYMENT-PREFLIGHT.md.
 *
 * Each check is PASS, FAIL (blocks live checkout) or WARN (needs attention,
 * does not block a digital-only launch). `ready_for_live_checkout` is true
 * only when nothing FAILs.
 *
 * DISCLOSES NO SECRET AND NO PATH. It says whether a key is set and which mode
 * it is in, never the key; whether private storage exists and how it was
 * found, never where.
 */

declare(strict_types=1);

require_once __DIR__ . '/../lib/bootstrap.php';
require_once __DIR__ . '/../lib/operations.php';

require_method('GET');
require_crm_key();

$checks = [];
$add = static function (string $id, string $status, string $detail) use (&$checks): void {
    $checks[] = ['id' => $id, 'status' => $status, 'detail' => $detail];
};

// ---- Private photo storage ---------------------------------------------------
$storage = upload_storage();
$add('private_upload_storage',
    in_array($storage['source'], ['configured', 'above_web_root'], true) ? 'PASS' : 'FAIL',
    match ($storage['source']) {
        'configured'     => 'uploads.path is an existing, writable directory outside the web root.',
        'above_web_root' => 'An mcb-uploads directory above the web root is writable.',
        'development'    => 'Only DEVELOPMENT storage is in use. Create mcb-uploads above public_html.',
        'unsafe'         => 'The configured storage is inside the web root or not allowed. Uploads are refused.',
        default          => 'No private storage outside the web root. Create mcb-uploads above public_html.',
    });
$add('development_storage_off', mcb_setting('uploads.development_storage', false) === true ? 'FAIL' : 'PASS',
    'uploads.development_storage must be absent or false in production.');

// ---- Stripe ------------------------------------------------------------------
$keyMode = stripe_key_mode((string) mcb_setting('stripe.secret_key', ''));
$add('stripe_key_mode', $keyMode === 'live' ? 'PASS' : 'FAIL',
    $keyMode === null ? 'No recognisable Stripe secret key is configured.' : "The configured Stripe key is a {$keyMode} key.");
$whsec = (string) mcb_setting('stripe.webhook_secret', '');
$add('stripe_webhook_secret', str_starts_with($whsec, 'whsec_') ? 'PASS' : 'FAIL',
    'stripe.webhook_secret must be the signing secret of the LIVE webhook endpoint.');
$add('checkout_sessions_enabled', mcb_setting('stripe.checkout_sessions_enabled', false) === true ? 'PASS' : 'WARN',
    'stripe.checkout_sessions_enabled turns online checkout on.');
$add('live_checkout_approved', mcb_setting('stripe.live_checkout_approved', false) === true ? 'PASS' : 'WARN',
    'Founder launch approval. Leave false until the other checks pass.');
$availability = stripe_checkout_availability();
$add('checkout_available', $availability['available'] && $availability['mode'] === 'live' ? 'PASS' : 'WARN',
    $availability['available'] ? "Checkout is open in {$availability['mode']} mode." : 'Checkout is closed: ' . (string) $availability['reason'] . '.');
$add('legacy_webhook_copy_absent', is_file(__DIR__ . '/../stripe/webhook-test.php') ? 'FAIL' : 'PASS',
    'The retired sandbox webhook (stripe/webhook-test.php) must not be deployed.');

// ---- Delivery ----------------------------------------------------------------
$add('delivery_test_fixtures_off', mcb_setting('delivery.use_test_fixtures', false) === true ? 'FAIL' : 'PASS',
    'delivery.use_test_fixtures must be absent or false in production.');
$add('delivery_rate_table', delivery_rate_table() === null ? 'WARN' : 'PASS',
    delivery_rate_table() === null
        ? 'No authorised delivery rates: physical orders cannot be paid online. A digital Moment can.'
        : 'A delivery rate table is present.');

// ---- Email -------------------------------------------------------------------
$add('resend_configured', (string) mcb_setting('resend.api_key', '') !== '' && (string) mcb_setting('resend.from', '') !== '' ? 'PASS' : 'FAIL',
    'resend.api_key and resend.from send the customer confirmation.');
$add('resend_test_overrides_off',
    mcb_setting('resend.test_mode_send_to_customer', false) === true || (string) mcb_setting('resend.api_url', '') !== '' ? 'FAIL' : 'PASS',
    'resend.test_mode_send_to_customer and resend.api_url are test settings and must be absent in production.');

// ---- Application -------------------------------------------------------------
$origin = (string) mcb_setting('app.site_origin', '');
$add('site_origin_https', str_starts_with($origin, 'https://') ? 'PASS' : 'FAIL', 'app.site_origin must be the https:// site address.');
$add('debug_off', mcb_setting('app.debug', false) === true ? 'FAIL' : 'PASS', 'app.debug must be false.');
$add('stripe_api_base_default', (string) mcb_setting('stripe.api_base', '') === '' ? 'PASS' : 'FAIL', 'stripe.api_base is a test override and must be absent.');
$add('token_secret_strong', strlen((string) mcb_setting('token_secret', '')) >= 32 ? 'PASS' : 'FAIL', 'token_secret must be at least 32 random characters.');

// ---- Database ----------------------------------------------------------------
try {
    $tables = db()->query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
            AND table_name IN ('order_units','order_memories','order_uploads','order_events')"
    )->fetchColumn();
    $status = db()->query(
        "SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema = DATABASE()
            AND table_name = 'orders' AND column_name = 'status'"
    )->fetchColumn();
    $migrated = (int) $tables === 4 && str_contains((string) $status, 'PAYMENT_REVIEW');
    $add('sprint4_migration_applied', $migrated ? 'PASS' : 'FAIL',
        'db/migrations/2026-09-14-sprint4-order-persistence.sql must be applied (after a backup).');
} catch (PDOException $e) {
    error_log('MCB preflight: database check failed: ' . $e->getMessage());
    $add('sprint4_migration_applied', 'FAIL', 'The database could not be checked.');
}

try {
    $tables = db()->query(
        "SELECT COUNT(*) FROM information_schema.tables
          WHERE table_schema = DATABASE()
            AND table_name IN ('order_access_tokens','order_change_requests','order_service_requests','order_staff_notes',
                               'operations_acknowledgements','live_enquiries','operations_events','rate_limit_hits')"
    )->fetchColumn();
    $add('sprint5_migration_applied', (int) $tables === 8 ? 'PASS' : 'FAIL',
        'db/migrations/2026-09-14-sprint5-operations.sql must be applied (after a backup).');
} catch (PDOException $e) {
    error_log('MCB preflight: database check failed: ' . $e->getMessage());
    $add('sprint5_migration_applied', 'FAIL', 'The database could not be checked.');
}

try {
    $columns = db()->query(
        "SELECT COUNT(*) FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND ((table_name = 'order_production' AND column_name IN ('qc_passed_at','revealed_at','supplier_purchase_authorised_by'))
              OR (table_name = 'order_consents' AND column_name IN ('creative_authority_version','creative_authority_accepted_at')))"
    )->fetchColumn();
    $add('creative_authority_migration_applied', (int) $columns === 5 ? 'PASS' : 'FAIL',
        'db/migrations/2026-09-15-single-creative-authority.sql must be applied (after a backup). Orders cannot record the Creative Authority consent without it.');
} catch (PDOException $e) {
    error_log('MCB preflight: database check failed: ' . $e->getMessage());
    $add('creative_authority_migration_applied', 'FAIL', 'The database could not be checked.');
}

try {
    $found = db()->query(
        "SELECT (SELECT COUNT(*) FROM information_schema.tables
                  WHERE table_schema = DATABASE() AND table_name IN ('order_artwork','founder_notifications','product_sales_suspensions'))
              + (SELECT COUNT(*) FROM information_schema.columns
                  WHERE table_schema = DATABASE()
                    AND ((table_name = 'order_production' AND column_name = 'supplier_purchase_authorised_at')
                      OR (table_name = 'order_events' AND column_name = 'source')))"
    )->fetchColumn();
    $add('automation_foundation_migration_applied', (int) $found === 5 ? 'PASS' : 'FAIL',
        'db/migrations/2026-09-15-automation-foundation.sql must be applied (after a backup). Payments cannot record the founder notification without it.');
} catch (PDOException $e) {
    error_log('MCB preflight: database check failed: ' . $e->getMessage());
    $add('automation_foundation_migration_applied', 'FAIL', 'The database could not be checked.');
}

try {
    $found = db()->query(
        "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
            AND table_name IN ('creative_albums','creative_jobs','creative_artifacts','creative_generation_attempts','creative_candidates','creative_masters','creative_access_log')"
    )->fetchColumn();
    $add('creative_factory_migration_applied', (int) $found === 7 ? 'PASS' : 'FAIL',
        'db/migrations/2026-09-15-creative-factory.sql must be applied (after a backup).');
} catch (PDOException $e) {
    error_log('MCB preflight: database check failed: ' . $e->getMessage());
    $add('creative_factory_migration_applied', 'FAIL', 'The database could not be checked.');
}
require_once __DIR__ . '/../lib/creative-factory.php';
$add('creative_provider_decision', 'WARN', 'Music-generation provider decision: ' . creative_data()['provider_decision_status'] . '. Songs wait for manual generation; no provider is called.');
$add('creative_factory_enforcement', creative_enforcement() === 'REQUIRED' ? 'PASS' : 'WARN',
    'creative.enforcement is ' . creative_enforcement() . '. ADVISORY reports unfinished Creative Factory work at the quality check; REQUIRED blocks it. An exceeded VERIFIED record capacity blocks in both.');
$unverified = array_values(array_filter(creative_data()['capacity_profiles'], static fn (array $p): bool => creative_capacity_profile($p['sku'])['status'] !== 'VERIFIED'));
$add('physical_capacity_verified', $unverified === [] ? 'PASS' : 'WARN',
    $unverified === [] ? 'Every record format has manufacturer-verified capacity.' : 'Record capacity is UNVERIFIED for ' . count($unverified) . ' format(s); programme QC reports CAPACITY_UNVERIFIED until api/data/physical-capacity.json holds verified figures.');

// Supplier purchases need Bella or Lewis's own authorisation code (a password hash in config).
$configuredFounders = array_values(array_filter(MCB_FOUNDERS, 'founder_authorisation_configured'));
$add('founder_authorisation_configured', $configuredFounders === [] ? 'WARN' : 'PASS',
    $configuredFounders === []
        ? 'No founder authorisation code is configured: physical orders cannot be authorised for supplier purchase. Set founders.BELLA / founders.LEWIS authorisation_hash (password_hash output).'
        : 'Supplier purchase authorisation is configured for: ' . implode(', ', $configuredFounders) . '.');
$workerKey = (string) mcb_setting('notifications.worker_key', '');
$add('notification_worker_key', strlen($workerKey) >= 32 ? 'PASS' : 'WARN',
    'notifications.worker_key (32+ random characters) lets an authorised notification bridge claim founder notifications without the CRM key. Until then notifications wait in the outbox and the staff queue.');

// Customer order and reveal links are HMACs under token_secret.
$add('customer_links_secret', strlen((string) mcb_setting('token_secret', '')) >= 32 ? 'PASS' : 'FAIL',
    'token_secret must be at least 32 random characters: customer order and reveal links depend on it.');

// ---- Generated data ------------------------------------------------------------
foreach (['catalogue.json', 'legal.json', 'personalisation.json', 'operations.json', 'artwork.json', 'creative.json'] as $file) {
    $add('data_' . basename($file, '.json'), is_readable(__DIR__ . '/../data/' . $file) ? 'PASS' : 'FAIL', "api/data/{$file} must be deployed with the build.");
}

$ready = !in_array('FAIL', array_column($checks, 'status'), true);

json_response(200, [
    'ready_for_live_checkout' => $ready,
    'checks'                  => $checks,
]);
