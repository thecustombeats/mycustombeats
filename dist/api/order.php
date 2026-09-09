<?php
/**
 * POST /api/order — create the authoritative MCB order record.
 *
 * Called when the customer submits the order form, BEFORE Stripe. That
 * ordering is deliberate: if the record were only written on payment, an
 * abandoned checkout would lose the customer, the brief, the attribution and
 * the delivery address, and there would be nothing for the Stripe webhook to
 * join back to.
 *
 * SERVER-OWNED FIELDS
 * The browser may say which package and format it wants, and may report the
 * referral string it saw. It may NOT decide:
 *   fulfilment_type   derived from the package/format rules
 *   source_type       derived from whether attribution resolves
 *   affiliate_id      resolved here from the referral username
 *   partner_id        resolved here from the partner slug
 *   amount            read from the authoritative package data
 *   status            always PENDING; only Stripe moves it to PAID
 *
 * Returns { order_id } — which becomes Stripe's client_reference_id and the
 * join between customer, order, attribution, fulfilment and payment.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/basket.php';
require_once __DIR__ . '/lib/attribution.php';
require_once __DIR__ . '/lib/legal.php';

require_method('POST');
require_same_origin();

$body = read_json_body();
$v    = new Validator($body);

// ---- Customer ---------------------------------------------------------
$firstName = $v->required('firstName', 'First name', 80);
$lastName  = $v->required('lastName', 'Last name', 80);
$email     = $v->email('email');
$phone     = $v->optional('whatsapp', 40);

// ---- Commercial selection --------------------------------------------
$package = $v->oneOf('package', valid_package_ids(), 'Package');

$formatRaw = $v->str('format', 16);
$format    = $formatRaw === '' ? null : $formatRaw;

/**
 * ---- A CONCIERGE COMMISSION IS NOT AN ORDER -------------------------
 *
 * This endpoint creates a row in `orders`: a package, a format, an amount and
 * a fulfilment route, which the CRM lists as work to produce and the webhook
 * reconciles a payment against. The Full Package has none of those settled at
 * the point of enquiry — that is what the consultation is for — so accepting
 * one here would write an order for an amount nobody agreed and put it in the
 * production queue.
 *
 * Enquiries have their own endpoint, `concierge/enquiry.php`, and their own
 * table. They are never labelled PAID or PENDING PAYMENT, because no payment
 * has been discussed.
 *
 * Refused as a validation failure on `package` rather than a 500: the request
 * is well-formed, it is simply asking this endpoint for something it does not
 * do, and the customer needs to be told where to go instead.
 */
if ($package !== '' && package_is_concierge($package)) {
    $v->fail(
        'package',
        'That experience is arranged personally with you rather than ordered online.'
    );
}

// The combination must be one MCB actually sells. Checked before anything
// is written, and independently of whatever the browser believed.
if ($package !== '' && !package_allows_format($package, $format)) {
    $v->fail('format', 'That format is not available for this experience.');
}

$fulfilment = $package === '' ? null : derive_fulfilment_type($package, $format);
if ($package !== '' && $fulfilment === null) {
    $v->fail('format', 'That format is not available for this experience.');
}

/**
 * ---- Consent, required and verified by the server -------------------
 *
 * Previously this endpoint asked for nothing. The checkout page had a
 * checkbox, but the boolean went to the fulfilment webhook and never here, so
 * MCB's own database held no evidence of consent and a request that never
 * touched the form could create an order regardless.
 *
 * The required set is DERIVED FROM THE ORDER, not taken from the request. A
 * body that omits `consents` entirely, or that reports fewer consents than
 * this order needs, is refused — the browser does not get to decide which
 * legal acknowledgements apply to what it is buying.
 */
$consentsRaw = $body['consents'] ?? null;
$consentGiven = static function (string $id) use ($consentsRaw): bool {
    // Strictly true. "true", 1 and "on" are all refused rather than coerced:
    // a consent is either an affirmative act or it is not, and a value that
    // needs interpreting is not evidence of one.
    return is_array($consentsRaw) && ($consentsRaw[$id] ?? null) === true;
};

$hasDigitalDelivery = false;
$missingConsents    = [];

if ($package !== '' && $fulfilment !== null) {
    $hasDigitalDelivery = order_has_digital_delivery($package, $format);

    foreach (required_consents($hasDigitalDelivery) as $consentId) {
        if (!$consentGiven($consentId)) {
            $missingConsents[] = $consentId;
        }
    }

    if ($missingConsents !== []) {
        $v->fail(
            'consents',
            'Please confirm the required acknowledgements before placing your order.'
        );
    }
}

/**
 * The document versions the customer accepted.
 *
 * Stored AS CLAIMED, but only if MCB actually published them. A version this
 * build does not recognise is refused rather than written: an order recorded
 * against terms that never existed is a fabricated contractual reference, and
 * worse than no reference because it looks like one.
 */
$termsVersion   = trim((string) ($body['termsVersion'] ?? ''));
$refundVersion  = trim((string) ($body['refundPolicyVersion'] ?? ''));
$privacyVersion = trim((string) ($body['privacyPolicyVersion'] ?? ''));

if ($package !== '' && $missingConsents === []) {
    if ($termsVersion === '' || !legal_version_is_known($termsVersion)) {
        $v->fail('termsVersion', 'We could not confirm which version of our terms you accepted. Please reload the page and try again.');
    }
    // The other two are recorded but not gated on: they are not separately
    // versioned documents in practice today, and refusing an order because a
    // secondary version string was absent would fail a customer over
    // bookkeeping. Defaulted to the terms version so the row is never blank.
    if ($refundVersion === '')  { $refundVersion  = $termsVersion; }
    if ($privacyVersion === '') { $privacyVersion = $termsVersion; }
}

/**
 * ---- The Complete Your Memory basket -------------------------------
 *
 * Ids and integer quantities. Priced HERE, by the same `price_basket` the
 * checkout endpoint uses, from the same generated catalogue — so the
 * fulfilment record and the eventual charge cannot disagree about what was
 * sold or what it cost.
 *
 * Nothing in the request states an amount, and there is no field through
 * which one could: a body carrying `price`, `line_gbp` or `total` is parsed
 * and never read.
 *
 * An invalid basket is a validation failure, not a silently dropped line.
 * Recording an order that quietly omits what someone chose would be worse
 * than refusing it.
 *
 * Priced BEFORE the address rules below, because what is in the basket
 * decides whether an address is needed at all.
 */
$itemsRaw = $body['enhancements'] ?? [];
if (!is_array($itemsRaw)) {
    $v->fail('enhancements', 'That basket could not be read.');
    $itemsRaw = [];
}
if (count($itemsRaw) > 20) {
    $v->fail('enhancements', 'That basket has too many items.');
    $itemsRaw = [];
}

$basketLines = [];
$basketTotalMinor = 0;
$basketNeedsAddress = false;

if ($package !== '' && $fulfilment !== null && !$v->hasErrors()) {
    $basket = price_basket($package, $format, $itemsRaw);
    if (!$basket->ok) {
        json_error(422, (string) $basket->errorCode, (string) $basket->errorMessage);
    }
    // The first line is the package itself; the rest are what the customer
    // added. Only the additions are stored — the package already has its own
    // columns on the order.
    $basketLines      = array_slice($basket->lines, 1);
    $basketTotalMinor = $basket->totalMinor;

    /**
     * A physical addition makes an otherwise-digital order shippable.
     *
     * A digital Moment with a framed lyric print still has to be posted, so
     * the address requirement is derived from the WHOLE basket rather than
     * the package alone — and derived here, on the server, so a browser that
     * skipped the address cannot get past it.
     */
    foreach ($basketLines as $line) {
        $item = catalogue_item($line['id']);
        if ($item !== null && ($item['fulfilment'] ?? '') === 'PHYSICAL') {
            $basketNeedsAddress = true;
        }
    }
}

// ---- Delivery address, required for physical fulfilment OR a physical
//      addition to an otherwise digital order --------------------------
$needsAddress = ($fulfilment === 'PHYSICAL') || $basketNeedsAddress;
$address = null;

if ($needsAddress) {
    $address = [
        'recipient_name' => $v->required('shippingName', 'Recipient name', 160),
        'address_line_1' => $v->required('shippingAddress', 'Address', 255),
        'address_line_2' => $v->optional('shippingAddress2', 255),
        'city'           => $v->required('shippingCity', 'Town or city', 120),
        'state_region'   => $v->optional('shippingState', 120),
        'postal_code'    => $v->required('shippingPostcode', 'Postcode or ZIP', 32),
        'country'        => $v->required('shippingCountry', 'Country', 120),
        // No separate delivery phone is collected by the form today, so the
        // contact number doubles as the courier contact.
        'phone'          => $phone,
    ];
}

// ---- Creative brief ---------------------------------------------------
$brief = [
    'mood'      => $v->optional('mood', 255),
    'genre'     => $v->optional('genre', 120),
    'touches'   => $v->optional('personalTouches', 2000),
    'story'     => $v->optional('story', 60000),
    'artwork'   => $v->optional('artworkUrl', 512),
];

// ---- Creative brief ---------------------------------------------------
$brief = [
    'mood'      => $v->optional('mood', 255),
    'genre'     => $v->optional('genre', 120),
    'touches'   => $v->optional('personalTouches', 2000),
    'story'     => $v->optional('story', 60000),
    'artwork'   => $v->optional('artworkUrl', 512),
];

/**
 * ---- The Complete Your Memory basket -------------------------------
 *
 * Ids and integer quantities. Priced HERE, by the same `price_basket` the
 * checkout endpoint uses, from the same generated catalogue — so the
 * fulfilment record and the eventual charge cannot disagree about what was
 * sold or what it cost.
 *
 * Nothing in the request states an amount, and there is no field through
 * which one could: a body carrying `price`, `line_gbp` or `total` is parsed
 * and never read.
 *
 * An invalid basket is a validation failure, not a silently dropped line.
 * Recording an order that quietly omits what someone chose would be worse
 * than refusing it.
 */
$itemsRaw = $body['enhancements'] ?? [];
if (!is_array($itemsRaw)) {
    $v->fail('enhancements', 'That basket could not be read.');
    $itemsRaw = [];
}
if (count($itemsRaw) > 20) {
    $v->fail('enhancements', 'That basket has too many items.');
    $itemsRaw = [];
}

$v->stopIfInvalid();

$basketLines = [];
$basketTotalMinor = 0;

if ($package !== '') {
    $basket = price_basket($package, $format, $itemsRaw);
    if (!$basket->ok) {
        json_error(422, (string) $basket->errorCode, (string) $basket->errorMessage);
    }
    // The first line is the package itself; the rest are what the customer
    // added. Only the additions are stored here — the package already has
    // its own columns on the order.
    $basketLines = array_slice($basket->lines, 1);
    $basketTotalMinor = $basket->totalMinor;
}

/**
 * A physical addition makes an otherwise-digital order shippable.
 *
 * A digital Moment with a framed lyric print still has to be posted, so the
 * address requirement is re-derived from the WHOLE basket rather than the
 * package alone — and re-derived here, on the server, so a browser that
 * skipped the address cannot get past it.
 */
foreach ($basketLines as $line) {
    $item = catalogue_item($line['id']);
    if ($item !== null && ($item['fulfilment'] ?? '') === 'PHYSICAL') {
        $needsAddressForBasket = true;
    }
}

// ---- Attribution, resolved server-side --------------------------------
// Shared with the concierge enquiry endpoint, so an affiliate or partner is
// credited identically whichever form the customer filled in. See
// lib/attribution.php.
$attribution = resolve_attribution(
    (string) ($body['referral'] ?? ''),
    (string) ($body['partner'] ?? '')
);

$sourceType     = $attribution['source_type'];
$affiliateId    = $attribution['affiliate_id'];
$partnerId      = $attribution['partner_id'];
$referralStored = $attribution['referral_raw'];

// ---- Authoritative amounts -------------------------------------------
$price = package_price($package);

// ---- Write ------------------------------------------------------------
// Customer upsert, order insert and address insert are one transaction: a
// half-written order with no address would be unfulfillable and invisible.
try {
    $orderId = db_transaction(function (PDO $pdo) use (
        $firstName, $lastName, $email, $phone,
        $package, $format, $fulfilment, $price,
        $sourceType, $affiliateId, $partnerId, $referralStored,
        $brief, $address, $basketLines,
        $termsVersion, $refundVersion, $privacyVersion, $hasDigitalDelivery
    ): int {
        $fullName = trim($firstName . ' ' . $lastName);

        // Upsert on the UNIQUE email. first_source_* is written once and then
        // preserved — it answers "how did MCB first meet this person?", which
        // a later direct order must not overwrite.
        $stmt = $pdo->prepare(
            'INSERT INTO customers (name, email, phone, first_source_type, first_affiliate_id, first_partner_id)
             VALUES (:name, :email, :phone, :src, :aff, :par)
             ON DUPLICATE KEY UPDATE
                name  = VALUES(name),
                phone = COALESCE(VALUES(phone), phone),
                id    = LAST_INSERT_ID(id)'
        );
        $stmt->execute([
            ':name'  => $fullName,
            ':email' => $email,
            ':phone' => $phone,
            ':src'   => $sourceType,
            ':aff'   => $affiliateId,
            ':par'   => $partnerId,
        ]);
        $customerId = (int) $pdo->lastInsertId();

        $stmt = $pdo->prepare(
            'INSERT INTO orders (
                customer_id, package, format, fulfilment_type,
                amount_gbp, amount_usd, currency, status,
                source_type, affiliate_id, partner_id, referral_raw,
                brief_mood, brief_genre, brief_personal_touches, brief_story, artwork_url
             ) VALUES (
                :cid, :pkg, :fmt, :ful,
                :gbp, :usd, :cur, :status,
                :src, :aff, :par, :ref,
                :mood, :genre, :touches, :story, :artwork
             )'
        );
        $stmt->execute([
            ':cid'     => $customerId,
            ':pkg'     => $package,
            ':fmt'     => $format,
            ':ful'     => $fulfilment,
            ':gbp'     => $price['gbp'],
            ':usd'     => $price['usd'],
            ':cur'     => 'GBP',
            ':status'  => 'PENDING',
            ':src'     => $sourceType,
            ':aff'     => $affiliateId,
            ':par'     => $partnerId,
            ':ref'     => $referralStored,
            ':mood'    => $brief['mood'],
            ':genre'   => $brief['genre'],
            ':touches' => $brief['touches'],
            ':story'   => $brief['story'],
            ':artwork' => $brief['artwork'],
        ]);
        $orderId = (int) $pdo->lastInsertId();

        /**
         * THE CONSENT RECORD — written in the SAME transaction as the order.
         *
         * An order that existed without its consent row would be an order
         * MCB could not evidence the customer had agreed to, and it would
         * look complete. Both rows commit or neither does.
         *
         * `digital_content_ack` is NULL, not 0, when the order never needed
         * it: a vinyl customer was not asked, and 0 would misread as asked
         * and declined. The CHECK constraint enforces the same distinction.
         */
        $stmt = $pdo->prepare(
            'INSERT INTO order_consents (
                order_id, terms_version, refund_policy_version, privacy_policy_version,
                terms_accepted_at,
                service_start_requested, service_start_at,
                digital_content_required, digital_content_ack, digital_content_ack_at,
                ip_hash, user_agent
             ) VALUES (
                :oid, :tv, :rv, :pv,
                UTC_TIMESTAMP(),
                :ssr, UTC_TIMESTAMP(),
                :dcr, :dca, :dcat,
                :iph, :ua
             )'
        );
        $stmt->execute([
            ':oid'  => $orderId,
            ':tv'   => $termsVersion,
            ':rv'   => $refundVersion,
            ':pv'   => $privacyVersion,
            ':ssr'  => 1,
            ':dcr'  => $hasDigitalDelivery ? 1 : 0,
            ':dca'  => $hasDigitalDelivery ? 1 : null,
            ':dcat' => $hasDigitalDelivery ? gmdate('Y-m-d H:i:s') : null,
            ':iph'  => hash_ip(client_ip()),
            ':ua'   => mb_substr((string) (client_user_agent() ?? ''), 0, 255) ?: null,
        ]);

        /**
         * THE PRODUCTION RECORD, opened at CREATIVE.
         *
         * Not APPROVED and not locked. This is the row that makes it possible
         * to answer "does this customer still have refinements?" without
         * inferring it from whether they paid — **PAID IS NOT
         * PRODUCTION_LOCKED**, and a customer whose card cleared moments ago
         * has every refinement their package includes.
         *
         * Approval is recorded later, through the CRM, when the customer
         * actually approves work that by definition does not exist yet.
         */
        $stmt = $pdo->prepare(
            'INSERT INTO order_production (order_id, stage, terms_version)
             VALUES (:oid, :stage, :tv)'
        );
        $stmt->execute([
            ':oid'   => $orderId,
            ':stage' => initial_production_stage(),
            ':tv'    => $termsVersion,
        ]);

        if ($address !== null) {
            $stmt = $pdo->prepare(
                'INSERT INTO delivery_addresses (
                    order_id, recipient_name, address_line_1, address_line_2,
                    city, state_region, postal_code, country, phone
                 ) VALUES (:oid, :rn, :a1, :a2, :city, :state, :zip, :country, :phone)'
            );
            $stmt->execute([
                ':oid'     => $orderId,
                ':rn'      => $address['recipient_name'],
                ':a1'      => $address['address_line_1'],
                ':a2'      => $address['address_line_2'],
                ':city'    => $address['city'],
                ':state'   => $address['state_region'],
                ':zip'     => $address['postal_code'],
                ':country' => $address['country'],
                ':phone'   => $address['phone'],
            ]);
        }

        /**
         * The fulfilment record for Complete Your Memory.
         *
         * Written in the SAME transaction as the order. An order that
         * existed without its items would be unfulfillable and, worse,
         * would look complete — the customer's frame or extra record would
         * simply never be made.
         *
         * Amounts are the server's, priced from the generated catalogue
         * moments ago. Nothing here came from the browser.
         */
        if ($basketLines !== []) {
            $stmt = $pdo->prepare(
                'INSERT INTO order_items
                    (order_id, item_id, item_name, quantity, unit_gbp, line_gbp)
                 VALUES (:oid, :iid, :name, :qty, :unit, :line)'
            );
            foreach ($basketLines as $line) {
                $stmt->execute([
                    ':oid'  => $orderId,
                    ':iid'  => $line['id'],
                    ':name' => $line['name'],
                    ':qty'  => $line['quantity'],
                    ':unit' => number_format($line['unit_minor'] / 100, 2, '.', ''),
                    ':line' => number_format($line['line_minor'] / 100, 2, '.', ''),
                ]);
            }
        }

        return $orderId;
    });
} catch (PDOException $e) {
    error_log('MCB CRM order insert failed: ' . $e->getMessage());
    json_error(500, 'order_failed', 'We could not record your order. Please try again.');
}

// Minimal response. The caller needs the id to hand to Stripe and the derived
// fulfilment to confirm what it showed the customer — nothing else.
/**
 * Minimal response. The caller needs the id to hand to Stripe and the derived
 * fulfilment to confirm what it showed the customer.
 *
 * `basket_total_gbp` is the SERVER's total, returned so the browser can check
 * its own preview against it. It is information, not authority — the charge
 * is built from this same server calculation either way.
 */
json_response(201, [
    'order_id'         => $orderId,
    'fulfilment_type'  => $fulfilment,
    'source_type'      => $sourceType,
    'basket_total_gbp' => number_format($basketTotalMinor / 100, 2, '.', ''),
]);
