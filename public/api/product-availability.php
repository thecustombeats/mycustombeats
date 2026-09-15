<?php
/**
 * GET /api/product-availability — which SKUs or products are currently
 * unavailable for new orders.
 *
 * Public and read-only: catalogue identifiers only, no reason, no staff name,
 * no supplier detail. The site shows "Currently unavailable" for them; the
 * server refuses them at pricing and checkout whatever the browser shows.
 */

declare(strict_types=1);

require_once __DIR__ . '/lib/bootstrap.php';

require_method('GET');

json_response(200, ['unavailable' => array_keys(suspended_sales_subjects())]);
