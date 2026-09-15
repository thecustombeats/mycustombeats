-- =====================================================================
-- Migration — MCB™ Business & Profit Intelligence
-- =====================================================================
--
-- 16 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after db/migrations/2026-09-16-customer-care.sql.
--
-- Management intelligence only: nothing here spends, refunds, purchases or
-- changes a price. Existing records stay the single home of the costs they
-- already hold (expected economics snapshots, supplier orders, video job
-- production cost, refund reviews); this adds a home for the direct costs that
-- had none, and an audit of business views and exports.
--
-- 1. direct_cost_entries   payment processing fees, replacement costs, expected
--                          video production cost and other direct costs,
--                          EXPECTED and ACTUAL kept apart; never overwritten
--                          (a correction voids the previous entry)
-- 2. business_audit_log    who exported which management dataset, and cost
--                          entries recorded or voided
--
-- ROLLBACK: backup first; drop the two tables.

CREATE TABLE IF NOT EXISTS direct_cost_entries (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  category              ENUM('PAYMENT_PROCESSING_FEE','VIDEO_PRODUCTION_COST','REPLACEMENT_COST','OTHER_DIRECT_COST') NOT NULL,
  basis                 ENUM('EXPECTED','ACTUAL') NOT NULL,
  -- In the order's own currency. Unknown costs are simply not entered: absence is UNKNOWN, never zero.
  amount_minor          INT UNSIGNED NOT NULL,
  currency              CHAR(3)      NOT NULL,
  -- A replacement or reproduction cost belongs to its remedy.
  remedy_id             BIGINT UNSIGNED NULL,
  note                  VARCHAR(500) NULL,
  status                ENUM('CURRENT','VOIDED') NOT NULL DEFAULT 'CURRENT',
  recorded_by           VARCHAR(160) NOT NULL,
  voided_by             VARCHAR(160) NULL,
  voided_at             DATETIME     NULL,
  void_reason           VARCHAR(300) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_direct_costs_order (order_id, status),
  KEY idx_direct_costs_category (category, basis, status),
  CONSTRAINT fk_direct_costs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_direct_costs_remedy FOREIGN KEY (remedy_id) REFERENCES support_remedies (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_audit_log (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff                 VARCHAR(160) NOT NULL,
  action                ENUM('EXPORT','COST_RECORDED','COST_VOIDED') NOT NULL,
  dataset               VARCHAR(40)  NULL,
  rows_exported         INT UNSIGNED NULL,
  subject_id            BIGINT UNSIGNED NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_business_audit (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
