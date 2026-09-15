-- =====================================================================
-- Migration — Automation Foundation + Production Artwork Specification
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after
-- db/migrations/2026-09-15-single-creative-authority.sql.
--
-- 1. order_production.supplier_purchase_authorised_at — when Bella or Lewis
--    explicitly authorised the supplier purchase (the founder identity is
--    already in supplier_purchase_authorised_by).
-- 2. order_events.source — which part of the system recorded the event
--    (STRIPE_WEBHOOK, STAFF, CUSTOMER, SYSTEM). Observability only.
-- 3. order_artwork — one row per production artwork component per unit
--    (e.g. a Journey's sleeve front and back): the template and version it
--    must meet, the customer photograph it is made from, its status, and the
--    registered output file with its automated technical QC result.
-- 4. founder_notifications — the idempotent founder notification OUTBOX.
--    Provider-independent: a separately authorised worker (a Telegram bridge,
--    an email sender) claims, delivers and acknowledges rows. Safe payload
--    only — never a story, photo, address, payment credential or secret.
-- 5. product_sales_suspensions — NEW sales of a product or SKU suspended
--    ("currently unavailable"); existing paid orders are never touched.
--
-- ROLLBACK: backup first; drop the three tables and the two columns. Nothing
-- existing is changed or invalidated.
--
-- Re-running is safe (guarded CREATE/ADD). A fresh install gets all of this
-- from db/schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE order_production
  ADD COLUMN IF NOT EXISTS supplier_purchase_authorised_at DATETIME NULL;

ALTER TABLE order_events
  ADD COLUMN IF NOT EXISTS source VARCHAR(24) NULL;

CREATE TABLE IF NOT EXISTS order_artwork (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id            INT UNSIGNED NOT NULL,
  unit_id             BIGINT UNSIGNED NOT NULL,
  -- src/data/production/artwork.ts template id and version.
  template_id         VARCHAR(40)  NOT NULL,
  template_version    SMALLINT UNSIGNED NOT NULL,
  status              ENUM('AWAITING_INPUT','INPUT_VALIDATED','PREPARATION_REQUIRED',
                           'TEMPLATE_REQUIRED','EXCEPTION','READY') NOT NULL DEFAULT 'AWAITING_INPUT',
  -- Machine reason only (MULTIPLE_PREPARATION, SOURCE_NOT_ARTWORK_READY …).
  exception_reason    VARCHAR(40)  NULL,
  source_upload_id    BIGINT UNSIGNED NULL,
  source_width        SMALLINT UNSIGNED NULL,
  source_height       SMALLINT UNSIGNED NULL,
  source_artwork_ready TINYINT(1)  NULL,
  -- The registered production output, in private storage.
  output_stored_name  CHAR(64)     NULL,
  output_mime         VARCHAR(32)  NULL,
  output_width        SMALLINT UNSIGNED NULL,
  output_height       SMALLINT UNSIGNED NULL,
  output_byte_size    INT UNSIGNED NULL,
  output_sha256       CHAR(64)     NULL,
  -- Prepared by hand because no manufacturer template exists (e.g. Heart).
  manual              TINYINT(1)   NOT NULL DEFAULT 0,
  qc_result           VARCHAR(1000) NULL,
  ready_at            DATETIME     NULL,
  ready_by            VARCHAR(160) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_artwork_component (unit_id, template_id),
  KEY idx_order_artwork_order (order_id, status),
  CONSTRAINT fk_order_artwork_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_artwork_unit FOREIGN KEY (unit_id)
    REFERENCES order_units (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_artwork_source FOREIGN KEY (source_upload_id)
    REFERENCES order_uploads (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS founder_notifications (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_type   VARCHAR(48)  NOT NULL,
  order_id            INT UNSIGNED NULL,
  -- MCB reference, or the SKU/product for a sales suspension.
  subject_reference   VARCHAR(64)  NOT NULL,
  -- Once per business occurrence: a replayed webhook or a repeated action
  -- matches the same key and inserts nothing.
  dedupe_key          VARCHAR(120) NOT NULL,
  -- SAFE FIELDS ONLY (lib/founder-notifications.php allow-list).
  payload             VARCHAR(2000) NOT NULL,
  status              ENUM('PENDING','DELIVERING','DELIVERED','FAILED','ABANDONED') NOT NULL DEFAULT 'PENDING',
  attempts            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at     DATETIME     NULL,
  claim_token_hash    CHAR(64)     NULL,
  claimed_at          DATETIME     NULL,
  claimed_by          VARCHAR(60)  NULL,
  last_error          VARCHAR(60)  NULL,
  delivered_at        DATETIME     NULL,
  delivered_channel   VARCHAR(16)  NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_founder_notifications_dedupe (dedupe_key),
  KEY idx_founder_notifications_due (status, next_attempt_at),
  KEY idx_founder_notifications_order (order_id),
  CONSTRAINT fk_founder_notifications_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_sales_suspensions (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- A catalogue SKU or product id.
  subject             VARCHAR(64)  NOT NULL,
  reason              ENUM('SUPPLIER_UNAVAILABLE','SUPPLIER_PRICE_CHANGE','QUALITY','OTHER') NOT NULL,
  suspended_by        VARCHAR(160) NOT NULL,
  suspended_at        DATETIME     NOT NULL,
  resumed_by          VARCHAR(160) NULL,
  resumed_at          DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_sales_suspensions_active (subject, resumed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
