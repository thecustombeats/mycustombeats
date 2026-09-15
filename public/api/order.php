<?php
/**
 * POST /api/order — create the authoritative MCB order record.
 *
 * Called when the customer submits the order form, BEFORE Stripe, so an
 * abandoned checkout still leaves the customer, brief, attribution and
 * delivery address on record for the payment to join back to.
 *
 * REQUEST
 *   Header  Idempotency-Key: <16–128 chars of A-Z a-z 0-9 _ ->   (required)
 *   Body    { lines: [{ sku, quantity }], personalisation, customer, consents,
 *             address incl. shippingCountryCode … }
 *
 * PERSONALISATION (the /create flow always sends it): one unit per song
 * product, one memory per song, plaques and frames — validated and stored per
 * memory by lib/personalisation.php, which also requires `lines` to be exactly
 * what the personalisation implies. Without it an order is still recorded
 * (NOT_PROVIDED), but checkout refuses to take payment for it.
 *
 * SERVER-OWNED FIELDS — never read from the request:
 *   every price and total   priced here from the generated catalogue
 *   delivery                quoted here (lib/delivery.php) — never assumed free
 *   fulfilment_type         derived from the lines
 *   source_type, affiliate  resolved from the referral string
 *   status                  always PENDING; only Stripe moves it to PAID
 *
 * RESPONSE 201 (or 200 for an idempotent replay)
 *   { order_id, checkout_token, fulfilment_type, source_type,
 *     subtotal_minor, delivery, total_minor, currency, lines,
 *     personalisation_status, upload_slots, missing_uploads, checkout_blocker }
 *
 * `total_minor` is the PAYABLE total: subtotal plus delivery.
 *
 * `checkout_token` is stored only as a hash. Checkout for this order requires
 * it, so a sequential order id is not enough to open a payment page for
 * someone else's order. It is an HMAC of the order id and the idempotency key
 * under the server's `token_secret`, so a retry of the same request receives
 * the same token without the token itself ever being stored.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/attribution.php';
require_once __DIR__ . '/lib/legal.php';
require_once __DIR__ . '/lib/referral.php';
require_once __DIR__ . '/lib/video.php';

require_method('POST');
require_same_origin();

/* ---------------------------------------------------------------------- */
/* Idempotency                                                             */
/* ---------------------------------------------------------------------- */

$idempotencyKey = (string) ($_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? '');
if (!preg_match('/^[A-Za-z0-9_-]{16,128}$/', $idempotencyKey)) {
    json_error(400, 'idempotency_key_required', 'This request could not be processed. Please reload the page and try again.');
}
$idempotencyHash = hash('sha256', $idempotencyKey);

$tokenSecret = (string) mcb_setting('token_secret', '');
if (strlen($tokenSecret) < 32) {
    error_log('MCB CRM: token_secret is missing or too short; refusing orders.');
    json_error(503, 'service_unavailable', 'The service is temporarily unavailable.');
}

/** The checkout token for an order created with this idempotency key. */
$checkoutTokenFor = static fn (int $orderId): string =>
    hash_hmac('sha256', "mcb-checkout:{$orderId}:{$idempotencyHash}", $tokenSecret);

$body = read_json_body();

/** A stable fingerprint of the request: the same body always hashes the same. */
$canonicalise = static function (mixed $value) use (&$canonicalise): mixed {
    if (!is_array($value)) {
        return $value;
    }
    if (!array_is_list($value)) {
        ksort($value);
    }
    return array_map($canonicalise, $value);
};
$requestHash = hash('sha256', json_encode($canonicalise($body), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

/**
 * Answers a request whose key has been seen before.
 *
 * The same key with the same body is a retry — a double click, or a response
 * lost in transit — and gets the original order back, with the same checkout
 * token while it is still PENDING. The same key with a different body is a
 * client error and is refused rather than silently answered with the wrong
 * order.
 */
$replay = static function () use ($idempotencyHash, $requestHash, $checkoutTokenFor): void {
    $stmt = db()->prepare(
        'SELECT id, status, request_hash, fulfilment_type, source_type, total_minor, currency
           FROM orders WHERE idempotency_key_hash = :h LIMIT 1'
    );
    $stmt->execute([':h' => $idempotencyHash]);
    $order = $stmt->fetch();
    if ($order === false) {
        return;
    }
    if (!hash_equals((string) $order['request_hash'], $requestHash)) {
        json_error(409, 'idempotency_conflict', 'This request conflicts with an earlier one. Please reload the page and try again.');
    }

    $token = $order['status'] === 'PENDING' ? $checkoutTokenFor((int) $order['id']) : null;

    $items = db()->prepare(
        'SELECT item_id AS sku, quantity, unit_minor, line_minor FROM order_items WHERE order_id = :id ORDER BY id'
    );
    $items->execute([':id' => (int) $order['id']]);

    $summary = order_public_summary(db(), (array) find_order_row(db(), (int) $order['id']));

    json_response(200, [
        'order_id'        => (int) $order['id'],
        'checkout_token'  => $token,
        'fulfilment_type' => $order['fulfilment_type'],
        'source_type'     => $order['source_type'],
        'total_minor'     => (int) $order['total_minor'],
        'currency'        => $order['currency'],
        'lines'           => array_map(static fn (array $l): array => [
            'sku'        => $l['sku'],
            'quantity'   => (int) $l['quantity'],
            'unit_minor' => (int) $l['unit_minor'],
            'line_minor' => (int) $l['line_minor'],
        ], $items->fetchAll()),
        'replayed'        => true,
    ] + order_summary_extras($summary));
};

// A retry is answered before the rate limit: it creates nothing.
$replay();

/**
 * Ten orders an hour from one source, counted on `order_consents`, which
 * gets exactly one row per successful order. See `enforce_rate_limit`.
 */
enforce_rate_limit('order_consents', 'ip_hash', hash_ip(client_ip()), 10, 3600);

$v = new Validator($body);

// ---- Customer ---------------------------------------------------------
$firstName = $v->required('firstName', 'First name', 80);
$lastName  = $v->required('lastName', 'Last name', 80);
$email     = $v->email('email');
$phone     = $v->optional('whatsapp', 40);

// ---- What is being ordered, priced by the server ---------------------
/**
 * Quoted work (Bespoke, MCB LIVE) and anything not sold online is not in the
 * orderable catalogue, so it is refused here as an unknown SKU. Enquiries have
 * their own endpoint and table.
 */
$pricing = price_order_lines($body['lines'] ?? null);
if (!$pricing->ok) {
    json_error(422, (string) $pricing->errorCode, (string) $pricing->errorMessage);
}

$fulfilment         = $pricing->fulfilmentType();
$hasDigitalDelivery = $pricing->hasDigitalDelivery();
$subtotalMinor      = $pricing->totalMinor;

/**
 * ---- Personalisation, per memory --------------------------------------
 *
 * When present it must be complete and must agree with the lines; a
 * partial or inconsistent block is refused with field errors, never stored
 * in part.
 */
$hasPersonalisation = array_key_exists('personalisation', $body);
$personalisation = $hasPersonalisation ? validate_personalisation($body['personalisation'], $pricing) : null;
if ($personalisation !== null && !$personalisation->ok) {
    foreach ($personalisation->errors as $field => $message) {
        $v->fail($field, $message);
    }
}

/**
 * ---- Consent, required and verified by the server -------------------
 *
 * The required set is DERIVED FROM THE ORDER, not taken from the request.
 */
$consentsRaw = $body['consents'] ?? null;
$missingConsents = [];
foreach (required_consents($hasDigitalDelivery) as $consentId) {
    // Strictly true: "true", 1 and "on" are refused rather than coerced.
    if (!is_array($consentsRaw) || ($consentsRaw[$consentId] ?? null) !== true) {
        $missingConsents[] = $consentId;
    }
}
if ($missingConsents !== []) {
    $v->fail('consents', 'Please confirm the required acknowledgements before placing your order.');
}

/**
 * The document versions the customer accepted: stored as claimed, but only if
 * MCB actually published them.
 */
$creativeAuthorityVersion = '';
$termsVersion   = trim((string) ($body['termsVersion'] ?? ''));
$refundVersion  = trim((string) ($body['refundPolicyVersion'] ?? ''));
$privacyVersion = trim((string) ($body['privacyPolicyVersion'] ?? ''));

if ($missingConsents === []) {
    if ($termsVersion === '' || !legal_version_is_known($termsVersion)) {
        $v->fail('termsVersion', 'We could not confirm which version of our terms you accepted. Please reload the page and try again.');
    }
    // The Creative Authority statement: the page must have shown the version
    // MCB publishes now. A stale page is asked to reload rather than recorded
    // as accepting wording it may not have displayed.
    $creativeAuthorityVersion = (string) (legal_versions()['creative_authority_consent'] ?? '');
    if ($creativeAuthorityVersion === '' || ($body['creativeAuthorityVersion'] ?? null) !== $creativeAuthorityVersion) {
        $v->fail('consents', 'Please reload the page and confirm the Creative Authority & Personalised Production statement again.');
    }
    if ($refundVersion === '')  { $refundVersion  = $termsVersion; }
    if ($privacyVersion === '') { $privacyVersion = $termsVersion; }
}

// ---- Delivery address, required when anything must be posted ----------
$address = null;
$countryCode = null;
if ($fulfilment === 'PHYSICAL') {
    // Delivery is quoted on the ISO code. The /create form sends one; an
    // exact country name is accepted for older callers.
    $codeRaw = $body['shippingCountryCode'] ?? null;
    $countryCode = country_code_for($codeRaw, $body['shippingCountry'] ?? null);
    if ($countryCode === null && ($hasPersonalisation || $codeRaw !== null)) {
        $v->fail('shippingCountry', 'Please choose the country from the list.');
    }
    $address = [
        'recipient_name' => $v->required('shippingName', 'Recipient name', 160),
        'address_line_1' => $v->required('shippingAddress', 'Address', 255),
        'address_line_2' => $v->optional('shippingAddress2', 255),
        'city'           => $v->required('shippingCity', 'Town or city', 120),
        'state_region'   => $v->optional('shippingState', 120),
        'postal_code'    => $v->required('shippingPostcode', 'Postcode or ZIP', 32),
        'country'        => $countryCode !== null ? country_name_for($countryCode) : $v->required('shippingCountry', 'Country', 120),
        'country_code'   => $countryCode,
        // The contact number doubles as the courier contact.
        'phone'          => $phone,
    ];
}

// ---- Creative brief ---------------------------------------------------
$brief = [
    'mood'    => $v->optional('mood', 255),
    'genre'   => $v->optional('genre', 120),
    'touches' => $v->optional('personalTouches', 2000),
    'story'   => $v->optional('story', 60000),
    'artwork' => $v->optional('artworkUrl', 512),
    // Required on new submissions; 255 matches the column exactly.
    // Required on the older single-brief form; the per-memory flow carries its
    // context in each memory instead.
    'cruise'  => $hasPersonalisation
        ? $v->optional('cruiseCompanions', 255)
        : $v->required('cruiseCompanions', 'Who you are cruising with', 255),
];

$v->stopIfInvalid();

// ---- MCB Memory Music Video: not offered against a fully booked period ----
// (The space itself is held, under a lock, when checkout starts.)
if (in_array((string) catalogue_data()['rules']['memory_video_sku'], array_column($pricing->lines, 'sku'), true)
    && video_customer_availability(db())['available'] !== true) {
    json_error(409, 'video_capacity_full', 'Memory Music Video is fully booked for this production month. Please remove it to continue.');
}

// ---- Delivery, quoted by the server ------------------------------------
$delivery   = quote_delivery($pricing, $countryCode);
$totalMinor = $subtotalMinor + $delivery->minor;
$personalisationStatus = $personalisation === null
    ? 'NOT_PROVIDED'
    : ($personalisation->awaitsUploads() ? 'AWAITING_UPLOADS' : 'COMPLETE');

// ---- Attribution, resolved server-side --------------------------------
$attribution = resolve_attribution(
    (string) ($body['referral'] ?? ''),
    (string) ($body['partner'] ?? '')
);

// A customer share is influence, recorded separately from commercial credit.
$referralCode = trim((string) ($body['customerReferral'] ?? ''));
$referral     = $referralCode === '' ? null : resolve_referral_code(db(), $referralCode);

// ---- Write ------------------------------------------------------------
// Customer, order, consent, production, referral, address and every line
// commit together or not at all.
try {
    $orderId = db_transaction(function (PDO $pdo) use (
        $firstName, $lastName, $email, $phone,
        $pricing, $fulfilment, $totalMinor, $attribution,
        $brief, $address, $termsVersion, $refundVersion, $privacyVersion,
        $hasDigitalDelivery, $referral, $checkoutTokenFor, $idempotencyHash, $requestHash,
        $subtotalMinor, $delivery, $personalisation, $personalisationStatus, $creativeAuthorityVersion
    ): int {
        // Upsert on the UNIQUE email. first_source_* is written once.
        $stmt = $pdo->prepare(
            'INSERT INTO customers (name, email, phone, first_source_type, first_affiliate_id, first_partner_id)
             VALUES (:name, :email, :phone, :src, :aff, :par)
             ON DUPLICATE KEY UPDATE
                name  = VALUES(name),
                phone = COALESCE(VALUES(phone), phone),
                id    = LAST_INSERT_ID(id)'
        );
        $stmt->execute([
            ':name'  => trim($firstName . ' ' . $lastName),
            ':email' => $email,
            ':phone' => $phone,
            ':src'   => $attribution['source_type'],
            ':aff'   => $attribution['affiliate_id'],
            ':par'   => $attribution['partner_id'],
        ]);
        $customerId = (int) $pdo->lastInsertId();

        $stmt = $pdo->prepare(
            'INSERT INTO orders (
                customer_id, package, format, fulfilment_type,
                amount_gbp, amount_usd, currency, total_minor,
                subtotal_minor, delivery_minor, delivery_status, delivery_rate_source,
                delivery_rate_id, delivery_label, personalisation_status,
                checkout_token_hash, idempotency_key_hash, request_hash, status,
                source_type, affiliate_id, partner_id, referral_raw,
                brief_mood, brief_genre, brief_personal_touches, brief_story,
                brief_cruise_companions, artwork_url
             ) VALUES (
                :cid, :pkg, NULL, :ful,
                :gbp, NULL, :cur, :total,
                :subtotal, :dmin, :dstatus, :dsource,
                :drate, :dlabel, :pstatus,
                NULL, :idem, :req, :status,
                :src, :aff, :par, :ref,
                :mood, :genre, :touches, :story, :cruise, :artwork
             )'
        );
        $stmt->execute([
            ':cid'     => $customerId,
            ':pkg'     => $pricing->primaryProductId(),
            ':ful'     => $fulfilment,
            ':gbp'     => minor_to_decimal($totalMinor),
            ':cur'     => 'GBP',
            ':total'   => $totalMinor,
            ':subtotal' => $subtotalMinor,
            ':dmin'    => $delivery->minor,
            ':dstatus' => $delivery->status,
            ':dsource' => $delivery->source,
            ':drate'   => $delivery->rateId,
            ':dlabel'  => $delivery->label,
            ':pstatus' => $personalisationStatus,
            ':idem'    => $idempotencyHash,
            ':req'     => $requestHash,
            ':status'  => 'PENDING',
            ':src'     => $attribution['source_type'],
            ':aff'     => $attribution['affiliate_id'],
            ':par'     => $attribution['partner_id'],
            ':ref'     => $attribution['referral_raw'],
            ':mood'    => $brief['mood'],
            ':genre'   => $brief['genre'],
            ':touches' => $brief['touches'],
            ':story'   => $brief['story'],
            ':cruise'  => $brief['cruise'],
            ':artwork' => $brief['artwork'],
        ]);
        $orderId = (int) $pdo->lastInsertId();

        $pdo->prepare('UPDATE orders SET checkout_token_hash = :t WHERE id = :id')
            ->execute([':t' => hash('sha256', $checkoutTokenFor($orderId)), ':id' => $orderId]);

        // The consent record, in the same transaction as the order.
        // `digital_content_ack` is NULL, not 0, when the order never needed it.
        $pdo->prepare(
            'INSERT INTO order_consents (
                order_id, terms_version, refund_policy_version, privacy_policy_version,
                terms_accepted_at,
                service_start_requested, service_start_at,
                digital_content_required, digital_content_ack, digital_content_ack_at,
                creative_authority_version, creative_authority_accepted_at,
                ip_hash, user_agent
             ) VALUES (
                :oid, :tv, :rv, :pv,
                UTC_TIMESTAMP(),
                :ssr, UTC_TIMESTAMP(),
                :dcr, :dca, :dcat,
                :cav, UTC_TIMESTAMP(),
                :iph, :ua
             )'
        )->execute([
            ':oid'  => $orderId,
            ':tv'   => $termsVersion,
            ':rv'   => $refundVersion,
            ':pv'   => $privacyVersion,
            ':ssr'  => 1,
            ':dcr'  => $hasDigitalDelivery ? 1 : 0,
            ':dca'  => $hasDigitalDelivery ? 1 : null,
            ':dcat' => $hasDigitalDelivery ? gmdate('Y-m-d H:i:s') : null,
            ':cav'  => $creativeAuthorityVersion,
            ':iph'  => hash_ip(client_ip()),
            ':ua'   => mb_substr((string) (client_user_agent() ?? ''), 0, 255) ?: null,
        ]);

        // The production record, opened at CREATIVE. PAID is not PRODUCTION_LOCKED.
        $pdo->prepare(
            'INSERT INTO order_production (order_id, stage, terms_version)
             VALUES (:oid, :stage, :tv)'
        )->execute([
            ':oid'   => $orderId,
            ':stage' => initial_production_stage(),
            ':tv'    => $termsVersion,
        ]);

        // ATTRIBUTED, never CONFIRMED: only the webhook knows a payment happened.
        if ($referral !== null) {
            record_referral_attribution($pdo, $referral, $orderId, $customerId);
        }

        if ($address !== null) {
            $pdo->prepare(
                'INSERT INTO delivery_addresses (
                    order_id, recipient_name, address_line_1, address_line_2,
                    city, state_region, postal_code, country, country_code, phone
                 ) VALUES (:oid, :rn, :a1, :a2, :city, :state, :zip, :country, :cc, :phone)'
            )->execute([
                ':oid'     => $orderId,
                ':rn'      => $address['recipient_name'],
                ':a1'      => $address['address_line_1'],
                ':a2'      => $address['address_line_2'],
                ':city'    => $address['city'],
                ':state'   => $address['state_region'],
                ':zip'     => $address['postal_code'],
                ':country' => $address['country'],
                ':cc'      => $address['country_code'],
                ':phone'   => $address['phone'],
            ]);
        }

        // Every line, priced by the server moments ago. Checkout is built
        // from exactly these rows.
        $stmt = $pdo->prepare(
            'INSERT INTO order_items
                (order_id, item_id, product_id, item_name, category, fulfilment,
                 quantity, unit_gbp, line_gbp, unit_minor, line_minor)
             VALUES (:oid, :sku, :pid, :name, :cat, :ful, :qty, :unit, :line, :um, :lm)'
        );
        $itemIds = [];
        foreach ($pricing->lines as $line) {
            $stmt->execute([
                ':oid'  => $orderId,
                ':sku'  => $line['sku'],
                ':pid'  => $line['product_id'],
                ':name' => $line['name'],
                ':cat'  => $line['category'],
                ':ful'  => $line['fulfilment'],
                ':qty'  => $line['quantity'],
                ':unit' => minor_to_decimal($line['unit_minor']),
                ':line' => minor_to_decimal($line['line_minor']),
                ':um'   => $line['unit_minor'],
                ':lm'   => $line['line_minor'],
            ]);
            $itemIds[$line['sku']] = (int) $pdo->lastInsertId();
        }

        if ($personalisation !== null) {
            persist_personalisation($pdo, $orderId, $personalisation, $itemIds);
        }

        // The audit trail: amounts and states only, never customer text.
        record_order_event($pdo, $orderId, 'ORDER.CREATED', [
            'subtotal_minor'         => $subtotalMinor,
            'delivery_minor'         => $delivery->minor,
            'total_minor'            => $totalMinor,
            'delivery_status'        => $delivery->status,
            'delivery_test_only'     => $delivery->isTestOnly(),
            'personalisation_status' => $personalisationStatus,
        ], 'created');
        if ($personalisationStatus === 'COMPLETE') {
            record_order_event($pdo, $orderId, 'PERSONALISATION.COMPLETE', [], 'personalisation-complete');
        }

        return $orderId;
    });
} catch (PDOException $e) {
    if (is_duplicate_error($e)) {
        // A concurrent request with the same Idempotency-Key committed first.
        $replay();
    }
    error_log('MCB CRM order insert failed: ' . $e->getMessage());
    json_error(500, 'order_failed', 'We could not record your order. Please try again.');
}

json_response(201, [
    'order_id'        => $orderId,
    'checkout_token'  => $checkoutTokenFor($orderId),
    'fulfilment_type' => $fulfilment,
    'source_type'     => $attribution['source_type'],
    'total_minor'     => $totalMinor,
    'currency'        => 'GBP',
    'lines'           => array_map(static fn (array $l): array => [
        'sku'        => $l['sku'],
        'quantity'   => $l['quantity'],
        'unit_minor' => $l['unit_minor'],
        'line_minor' => $l['line_minor'],
    ], $pricing->lines),
] + order_summary_extras(order_public_summary(db(), (array) find_order_row(db(), $orderId))));
