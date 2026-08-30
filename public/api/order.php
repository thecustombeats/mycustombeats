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

// The combination must be one MCB actually sells. Checked before anything
// is written, and independently of whatever the browser believed.
if ($package !== '' && !package_allows_format($package, $format)) {
    $v->fail('format', 'That format is not available for this experience.');
}

$fulfilment = $package === '' ? null : derive_fulfilment_type($package, $format);
if ($package !== '' && $fulfilment === null) {
    $v->fail('format', 'That format is not available for this experience.');
}

// ---- Delivery address, required only for physical fulfilment ----------
$needsAddress = ($fulfilment === 'PHYSICAL');
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

$v->stopIfInvalid();

// ---- Attribution, resolved server-side --------------------------------
// The browser reports what it saw in the URL. The server decides what that
// means. A browser cannot name an affiliate id and cannot award itself
// attribution to an affiliate that does not exist.
$referralRaw = trim((string) ($body['referral'] ?? ''));
$partnerRaw  = trim((string) ($body['partner'] ?? ''));

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
        // An unrecognised referral is recorded in referral_raw for audit but
        // never credited — the order simply stays DIRECT.
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
            $affiliateId = null;   // one attribution per order
        }
    }
}

$referralStored = $referralRaw !== '' ? mb_substr($referralRaw, 0, 190)
                 : ($partnerRaw !== '' ? mb_substr($partnerRaw, 0, 190) : null);

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
        $brief, $address
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

        return $orderId;
    });
} catch (PDOException $e) {
    error_log('MCB CRM order insert failed: ' . $e->getMessage());
    json_error(500, 'order_failed', 'We could not record your order. Please try again.');
}

// Minimal response. The caller needs the id to hand to Stripe and the derived
// fulfilment to confirm what it showed the customer — nothing else.
json_response(201, [
    'order_id'        => $orderId,
    'fulfilment_type' => $fulfilment,
    'source_type'     => $sourceType,
]);
