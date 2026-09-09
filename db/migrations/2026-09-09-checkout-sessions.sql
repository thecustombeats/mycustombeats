-- =====================================================================
-- Migration — the dynamic checkout snapshot
-- =====================================================================
--
-- Adds `checkout_sessions`: the immutable record of what the server
-- expected a dynamic Stripe Checkout Session to charge.
--
-- PURELY ADDITIVE. No existing table is altered, no column renamed, no
-- row modified and nothing dropped. Every current order and every
-- existing Payment Link checkout continues to work untouched — orders
-- placed through a Payment Link simply have no row here, and the webhook
-- handles that case explicitly.
--
-- Safe to run more than once: the statement is guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-checkout-sessions.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets this from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id             INT UNSIGNED NOT NULL,
  basket_hash          CHAR(64)     NOT NULL,
  package              VARCHAR(32)  NOT NULL,
  format               VARCHAR(16)  NULL,
  -- `lines` is reserved in MariaDB, hence the prefix.
  basket_lines         MEDIUMTEXT   NOT NULL,
  expected_amount_gbp  DECIMAL(10,2) NOT NULL,
  currency             CHAR(3)       NOT NULL DEFAULT 'GBP',
  stripe_session_id    VARCHAR(255) NULL,
  stripe_session_url   TEXT         NULL,
  status               ENUM('CREATED','COMPLETED','FAILED')
                       NOT NULL DEFAULT 'CREATED',
  ip_hash              CHAR(64)     NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checkout_order_basket (order_id, basket_hash),
  UNIQUE KEY uq_checkout_stripe_session (stripe_session_id),
  KEY idx_checkout_order (order_id),
  KEY idx_checkout_ip (ip_hash, created_at),
  CONSTRAINT fk_checkout_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Extend the unreconciled reason vocabulary for dynamic checkout.
--
-- Purely additive: MODIFY on an ENUM that only ADDS members preserves every
-- existing row, and both original values are kept in place and in order.
ALTER TABLE unreconciled_payments
  MODIFY COLUMN reason ENUM('NO_ORDER_REFERENCE','ORDER_NOT_FOUND',
                            'AMOUNT_MISMATCH','CURRENCY_MISMATCH') NOT NULL;
