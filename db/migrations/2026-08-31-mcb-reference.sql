-- =====================================================================
-- Migration — the MCB customer-facing reference number,
--             and the unreconciled-payment safety net
-- =====================================================================
--
-- Adds `orders.mcb_reference` (MCB-YYYY-NNNNNN), the counter that
-- allocates it, and `unreconciled_payments` — the table that catches a
-- payment no order claims. Run against an EXISTING live database; a fresh
-- install gets all three from db/schema.sql and does not need this file.
--
-- Safe to run more than once: every statement is guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-08-31-mcb-reference.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- No existing row is modified. Every current order keeps mcb_reference
-- NULL; references are issued from the next confirmed payment onward.
-- Backfilling historic test orders is deliberately NOT done here, so the
-- customer-facing series starts clean at MCB-YYYY-000001.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS mcb_reference VARCHAR(20) NULL AFTER status;

ALTER TABLE orders
  ADD UNIQUE KEY IF NOT EXISTS uq_orders_mcb_reference (mcb_reference);

CREATE TABLE IF NOT EXISTS reference_sequence (
  year        SMALLINT UNSIGNED NOT NULL,
  last_value  INT UNSIGNED      NOT NULL DEFAULT 0,
  updated_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- The safety net under /api/order.
--
-- /api/order is best-effort by design, so a CRM outage cannot stop someone
-- paying. That leaves a narrow window where a customer pays and no order
-- exists to receive it. Without this table such a payment leaves nothing
-- but an error_log line, which rotates away unread.
--
-- An empty table is the expected steady state. A row in it is an alarm.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unreconciled_payments (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  stripe_session_id     VARCHAR(255)  NOT NULL,
  stripe_payment_intent VARCHAR(255)  NULL,
  event_id              VARCHAR(255)  NOT NULL,
  reason                ENUM('NO_ORDER_REFERENCE','ORDER_NOT_FOUND') NOT NULL,
  customer_email        VARCHAR(190)  NULL,
  customer_name         VARCHAR(160)  NULL,
  customer_phone        VARCHAR(40)   NULL,
  amount_total          DECIMAL(10,2) NULL,
  currency              CHAR(3)       NULL,
  resolved_order_id     INT UNSIGNED  NULL,
  resolved_at           DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unreconciled_session (stripe_session_id),
  KEY idx_unreconciled_open (resolved_at, created_at),
  CONSTRAINT fk_unreconciled_order FOREIGN KEY (resolved_order_id)
    REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- Verify:
--   SHOW COLUMNS FROM orders LIKE 'mcb_reference';
--   SHOW INDEX FROM orders WHERE Key_name = 'uq_orders_mcb_reference';
--   SELECT * FROM reference_sequence;
--   SHOW TABLES LIKE 'unreconciled_payments';
