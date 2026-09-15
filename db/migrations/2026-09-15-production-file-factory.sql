-- =====================================================================
-- Migration — MCB Production File Factory (provider-independent)
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after db/migrations/2026-09-15-creative-factory.sql.
--
-- CREATIVE ART MASTER ≠ PRINT PRODUCTION MASTER. The art is MCB's composition
-- for a record, independent of any manufacturer template; a print production
-- master is rendered from one art master to one template id AND version.
--
-- 1. artwork_creative_jobs — one per record unit: visual direction, status.
-- 2. artwork_art_masters — versioned Creative Art Masters (never overwritten)
--    with source photos, personalisation version, creation method, file
--    facts and MCB's visual QC.
-- 3. image_preparation_records — each customer source photograph's
--    preparation state and what was done.
-- 4. production_render_jobs — art master + template version + SKU + output
--    specification, one per combination.
-- 5. print_production_masters — versioned print files with the exact
--    template id/version, file QC and safe-zone review.
-- 6. manufacturing_packages — the canonical internal package, versioned by
--    content, with its readiness and blockers.
-- 7. supplier_order_packs — STAFF ONLY: what a person needs to place the
--    order by hand after Bella or Lewis authorises. No credentials.
-- 8. order_artwork gains art_master_id and print_master_id: the current
--    production file for each planned component.
--
-- ROLLBACK: backup first; drop the seven tables and the two columns.
-- Re-running is safe (guarded CREATE/ADD).
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE order_artwork
  ADD COLUMN IF NOT EXISTS art_master_id   BIGINT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS print_master_id BIGINT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS artwork_creative_jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  sku                   VARCHAR(64)  NOT NULL,
  status                ENUM('AWAITING_ART_MASTER','VISUAL_QC_REQUIRED','REWORK_REQUIRED','ART_READY','EXCEPTION') NOT NULL DEFAULT 'AWAITING_ART_MASTER',
  visual_direction      VARCHAR(1000) NULL,
  current_art_master_id BIGINT UNSIGNED NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_artwork_jobs_unit (unit_id),
  KEY idx_artwork_jobs_order (order_id),
  CONSTRAINT fk_artwork_jobs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_artwork_jobs_unit FOREIGN KEY (unit_id) REFERENCES order_units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS artwork_art_masters (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id                BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  creation_method       ENUM('MANUAL_DESIGN','MCB_INTERNAL','AI_PROVIDER','OTHER_APPROVED_PROVIDER') NOT NULL,
  provider_id           VARCHAR(40)  NULL,
  -- Customer source photographs used (order_uploads ids, same order only).
  source_upload_ids     VARCHAR(500) NOT NULL,
  personalisation_version SMALLINT UNSIGNED NULL,
  input_sha256          CHAR(64)     NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  mime_type             VARCHAR(32)  NOT NULL,
  width                 INT UNSIGNED NOT NULL,
  height                INT UNSIGNED NOT NULL,
  byte_size             BIGINT UNSIGNED NOT NULL,
  sha256                CHAR(64)     NOT NULL,
  visual_qc_status      ENUM('PENDING','PASS','REWORK','ESCALATE') NOT NULL DEFAULT 'PENDING',
  visual_qc             TEXT NULL,
  is_current            TINYINT(1)   NOT NULL DEFAULT 1,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_art_master_version (job_id, version),
  KEY idx_art_masters_order (order_id),
  CONSTRAINT fk_art_masters_job FOREIGN KEY (job_id) REFERENCES artwork_creative_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS image_preparation_records (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  upload_id             BIGINT UNSIGNED NOT NULL,
  status                ENUM('SOURCE_READY','PREPARATION_REQUIRED','PREPARATION_IN_PROGRESS','PREPARED','UNUSABLE','EXCEPTION') NOT NULL,
  -- What was done (crop, colour, retouch …). Never a replaced face or invented detail.
  preparation_notes     VARCHAR(1000) NULL,
  identity_preserved    TINYINT(1)   NULL,
  updated_by            VARCHAR(160) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_image_preparation_upload (upload_id),
  KEY idx_image_preparation_order (order_id),
  CONSTRAINT fk_image_preparation_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_image_preparation_upload FOREIGN KEY (upload_id) REFERENCES order_uploads (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS production_render_jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  artwork_id            BIGINT UNSIGNED NOT NULL,
  art_master_id         BIGINT UNSIGNED NOT NULL,
  sku                   VARCHAR(64)  NOT NULL,
  template_id           VARCHAR(40)  NOT NULL,
  template_version      SMALLINT UNSIGNED NOT NULL,
  output_spec           TEXT NOT NULL,
  renderer              ENUM('MANUAL_EXTERNAL','LOCAL_ADAPTER') NOT NULL DEFAULT 'MANUAL_EXTERNAL',
  status                ENUM('RENDER_REQUIRED','RENDERED','FILE_QC_FAILED') NOT NULL DEFAULT 'RENDER_REQUIRED',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_render_job (art_master_id, template_id, template_version),
  KEY idx_render_jobs_order (order_id),
  CONSTRAINT fk_render_jobs_art FOREIGN KEY (art_master_id) REFERENCES artwork_art_masters (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS print_production_masters (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  render_job_id         BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  artwork_id            BIGINT UNSIGNED NOT NULL,
  art_master_id         BIGINT UNSIGNED NOT NULL,
  sku                   VARCHAR(64)  NOT NULL,
  template_id           VARCHAR(40)  NOT NULL,
  template_version      SMALLINT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  mime_type             VARCHAR(32)  NULL,
  width                 INT UNSIGNED NULL,
  height                INT UNSIGNED NULL,
  byte_size             BIGINT UNSIGNED NOT NULL,
  sha256                CHAR(64)     NOT NULL,
  file_qc_status        ENUM('PASS','FAIL') NOT NULL,
  file_qc               TEXT NOT NULL,
  safe_zone_status      ENUM('VERIFIED','UNVERIFIED','MANUAL_REVIEW_PASSED') NOT NULL,
  manual                TINYINT(1)   NOT NULL DEFAULT 0,
  is_current            TINYINT(1)   NOT NULL DEFAULT 0,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_print_master_version (artwork_id, version),
  KEY idx_print_masters_order (order_id),
  CONSTRAINT fk_print_masters_render FOREIGN KEY (render_job_id) REFERENCES production_render_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS manufacturing_packages (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  status                ENUM('NOT_READY','MANUFACTURING_DATA_REQUIRED','READY','SUPERSEDED') NOT NULL,
  blockers              TEXT NOT NULL,
  body                  MEDIUMTEXT NOT NULL,
  body_sha256           CHAR(64)     NOT NULL,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_manufacturing_package_version (order_id, version),
  UNIQUE KEY uq_manufacturing_package_content (order_id, body_sha256),
  CONSTRAINT fk_manufacturing_packages_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_order_packs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  package_id            BIGINT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  status                ENUM('PREPARED','ORDER_PLACED','SUPERSEDED') NOT NULL DEFAULT 'PREPARED',
  -- STAFF ONLY. Supplier, product link, configuration, costs, delivery details. Never credentials.
  body                  MEDIUMTEXT NOT NULL,
  body_sha256           CHAR(64)     NOT NULL,
  placed_by             VARCHAR(160) NULL,
  placed_at             DATETIME     NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_pack_version (order_id, version),
  UNIQUE KEY uq_supplier_pack_content (order_id, body_sha256),
  CONSTRAINT fk_supplier_packs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_supplier_packs_package FOREIGN KEY (package_id) REFERENCES manufacturing_packages (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
