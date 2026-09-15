-- =====================================================================
-- Migration — MCB Memory Music Video™ (commerce, capacity and production)
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after
-- db/migrations/2026-09-15-fulfilment-controller.sql.
--
-- An optional £49 pre-payment enhancement: one video for one selected song.
-- Capacity is a real, server-side ledger (planning capacity supplied by the
-- Founders, pending verification with the platform). No platform is called:
-- videos are produced by a person and registered. The audio Production
-- Master is referenced by id, version and SHA-256 — never changed.
--
-- 1. video_entitlements          what the customer chose (order, song)
-- 2. video_capacity_periods      the capacity periods (stored rows)
-- 3. video_capacity_reservations one reservation per entitlement: HELD at
--                                checkout, RESERVED at payment, COMPLETED
--                                with the video master, RELEASED or EXPIRED
-- 4. video_jobs                  the provider-independent production job
-- 5. video_media                 photographs the customer supplies (private)
-- 6. video_candidates            files a person registered for QC
-- 7. video_masters               immutable, versioned final videos
-- 8. video_access_log            customer and staff access to video files
-- 9. video_offer_counters        offer counts per day (no personal data)
-- 10. customer_communications.message_type adds VIDEO_READY
--
-- ROLLBACK: backup first; drop the nine tables; narrow the ENUM only if no
-- row uses VIDEO_READY.

ALTER TABLE customer_communications
  MODIFY COLUMN message_type ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING',
                      'APPROVAL_REQUIRED','CHANGES_RECEIVED','APPROVAL_CONFIRMED',
                      'DISPATCHED','FOLLOW_UP',
                      'CREATION_READY','IN_PRODUCTION',
                      'ADDITIONAL_PARCEL_DISPATCHED','DELIVERY_UPDATE','DELIVERED',
                      'VIDEO_READY') NOT NULL;

CREATE TABLE IF NOT EXISTS video_entitlements (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  order_item_id         BIGINT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  memory_id             BIGINT UNSIGNED NOT NULL,
  price_minor           INT UNSIGNED NOT NULL,
  currency              CHAR(3)      NOT NULL DEFAULT 'GBP',
  status                ENUM('AWAITING_PAYMENT','ENTITLED','CAPACITY_EXCEPTION','CANCELLED') NOT NULL DEFAULT 'AWAITING_PAYMENT',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_entitlement_memory (memory_id),
  KEY idx_video_entitlements_order (order_id),
  CONSTRAINT fk_video_entitlements_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_capacity_periods (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_key            VARCHAR(32)  NOT NULL,
  starts_at             DATETIME     NOT NULL,
  ends_at               DATETIME     NOT NULL,
  capacity              SMALLINT UNSIGNED NOT NULL,
  model                 VARCHAR(24)  NOT NULL,
  basis                 ENUM('PENDING_VERIFICATION','VERIFIED') NOT NULL DEFAULT 'PENDING_VERIFICATION',
  source                VARCHAR(60)  NOT NULL,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_capacity_period_key (period_key),
  KEY idx_video_capacity_period_time (starts_at, ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_capacity_reservations (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  period_id             BIGINT UNSIGNED NOT NULL,
  entitlement_id        BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  status                ENUM('HELD','RESERVED','COMPLETED','RELEASED','EXPIRED') NOT NULL,
  held_until            DATETIME NULL,
  reserved_at           DATETIME NULL,
  completed_at          DATETIME NULL,
  released_at           DATETIME NULL,
  released_by           VARCHAR(160) NULL,
  release_note          VARCHAR(500) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_reservation_entitlement (entitlement_id),
  KEY idx_video_reservations_period (period_id, status),
  CONSTRAINT fk_video_reservations_period FOREIGN KEY (period_id) REFERENCES video_capacity_periods (id),
  CONSTRAINT fk_video_reservations_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  entitlement_id        BIGINT UNSIGNED NOT NULL,
  status                ENUM('INPUT_REQUIRED','READY','PRODUCTION_REQUIRED','PRODUCTION_IN_PROGRESS','CANDIDATE_READY',
                             'QUALITY_CHECK_REQUIRED','REWORK_REQUIRED','READY_FOR_REVEAL','REVEALED','EXCEPTION') NOT NULL DEFAULT 'INPUT_REQUIRED',
  waiting_on            VARCHAR(40)  NULL,
  exception_reason      VARCHAR(60)  NULL,
  inputs_confirmed_at   DATETIME NULL,
  inputs_confirmed_by   VARCHAR(160) NULL,
  duration_status       ENUM('PENDING_AUDIO_MASTER','VIDEO_DURATION_ELIGIBLE','VIDEO_DURATION_REVIEW_REQUIRED') NOT NULL DEFAULT 'PENDING_AUDIO_MASTER',
  duration_decision     VARCHAR(40)  NULL,
  audio_master_id       BIGINT UNSIGNED NULL,
  audio_master_version  SMALLINT UNSIGNED NULL,
  audio_master_sha256   CHAR(64) NULL,
  audio_duration_ms     INT UNSIGNED NULL,
  visual_direction      VARCHAR(1000) NULL,
  production_method     ENUM('MANUAL') NULL,
  production_started_at DATETIME NULL,
  rework_count          SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  production_cost_minor INT UNSIGNED NULL,
  production_cost_note  VARCHAR(255) NULL,
  current_video_master_id BIGINT UNSIGNED NULL,
  revealed_at           DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_job_entitlement (entitlement_id),
  KEY idx_video_jobs_order (order_id),
  KEY idx_video_jobs_status (status),
  CONSTRAINT fk_video_jobs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_media (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id             CHAR(32)     NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  video_job_id          BIGINT UNSIGNED NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  mime_type             VARCHAR(32)  NOT NULL,
  byte_size             INT UNSIGNED NOT NULL,
  width                 INT UNSIGNED NULL,
  height                INT UNSIGNED NULL,
  sha256                CHAR(64)     NOT NULL,
  rights_confirmed_at   DATETIME     NOT NULL,
  rights_statement_sha256 CHAR(64)   NOT NULL,
  ip_hash               CHAR(64)     NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_media_public (public_id),
  KEY idx_video_media_job (video_job_id),
  CONSTRAINT fk_video_media_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_candidates (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  video_job_id          BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  container             VARCHAR(8)   NOT NULL,
  byte_size             BIGINT UNSIGNED NOT NULL,
  sha256                CHAR(64)     NOT NULL,
  duration_ms           INT UNSIGNED NULL,
  width                 INT UNSIGNED NULL,
  height                INT UNSIGNED NULL,
  audio_master_id       BIGINT UNSIGNED NOT NULL,
  audio_master_sha256   CHAR(64)     NOT NULL,
  production_method     ENUM('MANUAL') NOT NULL,
  external_reference    VARCHAR(120) NULL,
  technical_checks      TEXT NOT NULL,
  qc_status             ENUM('PENDING','PASS','REWORK','ESCALATE') NOT NULL DEFAULT 'PENDING',
  qc                    TEXT NULL,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_candidate_version (video_job_id, version),
  KEY idx_video_candidates_order (order_id),
  CONSTRAINT fk_video_candidates_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_masters (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  video_job_id          BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  candidate_id          BIGINT UNSIGNED NOT NULL,
  audio_master_id       BIGINT UNSIGNED NOT NULL,
  audio_master_version  SMALLINT UNSIGNED NOT NULL,
  audio_master_sha256   CHAR(64)     NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  container             VARCHAR(8)   NOT NULL,
  byte_size             BIGINT UNSIGNED NOT NULL,
  sha256                CHAR(64)     NOT NULL,
  duration_ms           INT UNSIGNED NULL,
  width                 INT UNSIGNED NULL,
  height                INT UNSIGNED NULL,
  qc_evidence           TEXT NOT NULL,
  is_current            TINYINT(1)   NOT NULL DEFAULT 1,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_video_master_version (video_job_id, version),
  KEY idx_video_masters_order (order_id),
  CONSTRAINT fk_video_masters_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_access_log (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  actor                 ENUM('CUSTOMER','STAFF') NOT NULL,
  staff                 VARCHAR(160) NULL,
  action                VARCHAR(40)  NOT NULL,
  subject_id            BIGINT UNSIGNED NULL,
  version               SMALLINT UNSIGNED NULL,
  ip_hash               CHAR(64)     NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_video_access_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS video_offer_counters (
  day                   DATE         NOT NULL,
  product_id            VARCHAR(64)  NOT NULL,
  event                 ENUM('OFFER_VIEWED','SELECTED','DESELECTED') NOT NULL,
  count                 INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (day, product_id, event)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
