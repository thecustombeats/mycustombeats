-- =====================================================================
-- Migration — canonical catalogue orders, checkout tokens, idempotency
-- =====================================================================
--
-- 1. Orders store every line (including the song experience) in
--    `order_items` with integer-pence amounts, and the authoritative total
--    in `orders.total_minor`. Checkout is priced from these saved lines.
-- 2. `orders.checkout_token_hash`: checkout requires a secret token issued
--    to the browser that created the order, so nobody can open a payment
--    page for someone else's order by guessing its id.
-- 3. `orders.idempotency_key_hash` + `request_hash`: a retried or
--    double-clicked order submission returns the original order.
-- 4. `orders.amount_usd` becomes NULL-able. The legacy USD figure is no
--    longer a source of truth and new orders do not record one.
-- 5. Checkout sessions record their integer expected amount and expiry, so
--    an expired Stripe session is replaced rather than reused.
-- 6. Two review reasons for payments that must not be accepted
--    automatically: a second payment for a paid order, and an event whose
--    identifiers disagree with the snapshot it claims.
--
-- Existing rows are untouched. Orders placed before this migration have
-- NULL total_minor and NULL line amounts and cannot be checked out through
-- the new session path; their Payment Link reconciliation is unchanged.
--
-- The ADD statements are guarded. The MODIFY statements are not (MariaDB has
-- no guard for MODIFY) but are idempotent: re-running them sets the same
-- definition again.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-14-canonical-catalogue.sql
-- A fresh install gets all of this from db/schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE orders
  MODIFY COLUMN amount_usd DECIMAL(10,2) NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_minor INT UNSIGNED NULL AFTER currency,
  ADD COLUMN IF NOT EXISTS checkout_token_hash CHAR(64) NULL AFTER total_minor,
  ADD COLUMN IF NOT EXISTS idempotency_key_hash CHAR(64) NULL AFTER checkout_token_hash,
  ADD COLUMN IF NOT EXISTS request_hash CHAR(64) NULL AFTER idempotency_key_hash;

ALTER TABLE orders
  ADD UNIQUE KEY IF NOT EXISTS uq_orders_idempotency (idempotency_key_hash);

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS product_id VARCHAR(64) NULL AFTER item_id,
  ADD COLUMN IF NOT EXISTS category VARCHAR(32) NULL AFTER item_name,
  ADD COLUMN IF NOT EXISTS fulfilment VARCHAR(16) NULL AFTER category,
  ADD COLUMN IF NOT EXISTS unit_minor INT UNSIGNED NULL AFTER line_gbp,
  ADD COLUMN IF NOT EXISTS line_minor INT UNSIGNED NULL AFTER unit_minor;

ALTER TABLE checkout_sessions
  MODIFY COLUMN package VARCHAR(32) NULL;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS expected_minor INT UNSIGNED NULL AFTER expected_amount_gbp,
  ADD COLUMN IF NOT EXISTS stripe_expires_at DATETIME NULL AFTER stripe_session_url,
  ADD COLUMN IF NOT EXISTS attempt SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER stripe_expires_at;

ALTER TABLE checkout_sessions
  MODIFY COLUMN status ENUM('CREATED','COMPLETED','FAILED','EXPIRED')
    NOT NULL DEFAULT 'CREATED';

ALTER TABLE unreconciled_payments
  MODIFY COLUMN reason ENUM('NO_ORDER_REFERENCE','ORDER_NOT_FOUND',
                            'AMOUNT_MISMATCH','CURRENCY_MISMATCH',
                            'DUPLICATE_PAYMENT','ORDER_MISMATCH') NOT NULL;
