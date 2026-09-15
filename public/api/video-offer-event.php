<?php
/**
 * POST /api/video-offer-event { event: OFFER_VIEWED | SELECTED | DESELECTED, productId }
 *
 * Counts how often the Memory Music Video offer is seen and chosen, per day
 * and product, so MCB can later compare prices. A counter only: no order, no
 * name, no story, no photograph, no identifier is stored. Same-origin and
 * rate-limited.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/video.php';

require_method('POST');
require_same_origin();
enforce_scoped_rate_limit('video-offer', 120, 3600);

$body = read_json_body(512);
$event = is_string($body['event'] ?? null) ? $body['event'] : '';
$product = is_string($body['productId'] ?? null) ? $body['productId'] : '';
$songProducts = array_keys(array_filter(catalogue_data()['products'] ?? [], static fn (array $p): bool => ($p['category'] ?? '') === 'SONG_EXPERIENCE'));
if (!in_array($event, video_data()['offer_events'], true) || !in_array($product, $songProducts, true)) {
    json_error(422, 'invalid_event', 'That event is not recognised.');
}
db()->prepare('INSERT INTO video_offer_counters (day, product_id, event, count) VALUES (UTC_DATE(), :p, :e, 1) ON DUPLICATE KEY UPDATE count = count + 1')
    ->execute([':p' => $product, ':e' => $event]);
json_response(202, ['counted' => true]);
