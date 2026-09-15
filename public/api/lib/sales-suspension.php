<?php
/**
 * MCB — suspending NEW sales of a product.
 *
 * When a supplier can no longer make something at the agreed quality or cost,
 * staff suspend new sales of that SKU or whole product. The site then shows
 * it as CURRENTLY UNAVAILABLE, and pricing, quotes and new checkout sessions
 * refuse it. Existing PAID orders are never cancelled, refunded or changed:
 * nothing here reads or writes them.
 *
 * Suspension is a person's decision recorded with who and why. MCB does not
 * scrape supplier prices or suspend anything automatically. The Founders are
 * notified through the outbox (PRODUCT_SALES_SUSPENDED).
 */

declare(strict_types=1);

const MCB_SUSPENSION_REASONS = ['SUPPLIER_UNAVAILABLE', 'SUPPLIER_PRICE_CHANGE', 'QUALITY', 'OTHER'];

/**
 * The SKUs and product ids whose new sales are suspended now.
 *
 * @return array<string, true>
 */
function suspended_sales_subjects(): array
{
    static $subjects = null;
    if ($subjects !== null) {
        return $subjects;
    }
    try {
        $rows = db()->query('SELECT DISTINCT subject FROM product_sales_suspensions WHERE resumed_at IS NULL')->fetchAll(PDO::FETCH_COLUMN);
    } catch (PDOException $e) {
        // Before the migration the table does not exist: nothing is suspended.
        error_log('MCB sales suspension: could not read suspensions: ' . $e->getMessage());
        $rows = [];
    }
    $subjects = array_fill_keys(array_map('strval', $rows), true);
    return $subjects;
}

/** Whether new sales of this SKU (or its product) are suspended. */
function sales_suspended(string $sku, ?string $productId): bool
{
    $subjects = suspended_sales_subjects();
    return isset($subjects[$sku]) || ($productId !== null && isset($subjects[$productId]));
}

/** A catalogue SKU or product id, with its display name, or null. */
function sales_subject(string $subject): ?array
{
    $sku = catalogue_sku($subject);
    if ($sku !== null) {
        return ['subject' => $subject, 'kind' => 'SKU', 'name' => (string) $sku['name']];
    }
    $product = catalogue_product($subject);
    return $product === null ? null : ['subject' => $subject, 'kind' => 'PRODUCT', 'name' => (string) ($product['name'] ?? $subject)];
}
