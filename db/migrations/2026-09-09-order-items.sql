-- =====================================================================
-- Migration — the fulfilment record for Complete Your Memory
-- =====================================================================
--
-- Adds `order_items`: what the customer chose alongside their package,
-- with the server-priced GBP amounts as they stood at the time of sale.
--
-- PURELY ADDITIVE. No existing table is altered, no column renamed, no
-- row modified and nothing dropped. Every order placed before this has
-- no rows here, which reads correctly as "package only" — the state
-- every one of them was actually in.
--
-- Safe to run more than once: the statement is guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-order-items.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets this from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS order_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       INT UNSIGNED NOT NULL,
  item_id        VARCHAR(64)  NOT NULL,
  item_name      VARCHAR(160) NOT NULL,
  quantity       SMALLINT UNSIGNED NOT NULL,
  unit_gbp       DECIMAL(10,2) NOT NULL,
  line_gbp       DECIMAL(10,2) NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_item (order_id, item_id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
