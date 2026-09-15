-- =====================================================================
-- Migration — MCB Creative Factory core (provider-independent)
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after
-- db/migrations/2026-09-15-automation-foundation.sql.
--
-- 1. creative_albums — one per song-carrying unit: track count from the
--    catalogue at sale, target programme, album QC and physical capacity QC.
-- 2. creative_jobs — exactly one per song (per order_memories row), with
--    its pipeline status and the versions it is working from.
-- 3. creative_artifacts — IMMUTABLE, versioned documents: the Fact Ledger,
--    album map, story map, lyric package, Music Direction and MCB
--    composition plan. A change is a new version; nothing is updated.
-- 4. creative_generation_attempts — one row per generation attempt, never
--    overwritten: the versions used, provider (none selected yet: MANUAL or
--    DEFERRED), requested/actual duration, outcome, cost where known.
-- 5. creative_candidates — the audio a person or a future adapter
--    registered for an attempt, and its technical, fact and creative QC.
-- 6. creative_masters — versioned masters (production master, customer
--    listening copy, physical media master) with provenance and lineage.
-- 7. creative_access_log — who opened private creative material, when.
-- 8. founder_notifications and order_events need no change.
--
-- ROLLBACK: backup first; drop the seven tables (no existing table changes).
-- Re-running is safe (CREATE TABLE IF NOT EXISTS).
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS creative_albums (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  sku                   VARCHAR(64)  NOT NULL,
  track_count           TINYINT UNSIGNED NOT NULL,
  target_programme_seconds SMALLINT UNSIGNED NOT NULL,
  album_qc_status       ENUM('NOT_APPLICABLE','PENDING','REVIEW_REQUIRED','PASS','FAIL') NOT NULL DEFAULT 'PENDING',
  album_qc_result       TEXT NULL,
  capacity_status       ENUM('NOT_APPLICABLE','PENDING','CAPACITY_UNVERIFIED','CAPACITY_PASSED','AUDIO_CAPACITY_EXCEPTION') NOT NULL DEFAULT 'PENDING',
  capacity_result       TEXT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_albums_unit (unit_id),
  KEY idx_creative_albums_order (order_id),
  CONSTRAINT fk_creative_albums_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_creative_albums_unit FOREIGN KEY (unit_id) REFERENCES order_units (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_jobs (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  album_id              BIGINT UNSIGNED NOT NULL,
  unit_id               BIGINT UNSIGNED NOT NULL,
  memory_id             BIGINT UNSIGNED NOT NULL,
  track_number          TINYINT UNSIGNED NOT NULL,
  status                ENUM('JOB_READY','LYRICS_REQUIRED','LYRICS_QC_FAILED','LYRICS_REVIEW_REQUIRED',
                             'PLAN_REQUIRED','GENERATION_REQUIRED','CANDIDATE_QC','FACT_REVIEW_REQUIRED',
                             'CREATIVE_QC_REQUIRED','MASTER_REQUIRED','MASTER_READY','EXCEPTION') NOT NULL DEFAULT 'JOB_READY',
  -- What a person must do next when automation cannot: AWAITING_PROVIDER / MANUAL_GENERATION …
  waiting_on            VARCHAR(40)  NULL,
  exception_reason      VARCHAR(60)  NULL,
  fact_ledger_version   SMALLINT UNSIGNED NULL,
  story_map_version     SMALLINT UNSIGNED NULL,
  lyric_version         SMALLINT UNSIGNED NULL,
  lyric_qc_status       ENUM('PENDING','PASS','FAIL','REVIEW_REQUIRED') NOT NULL DEFAULT 'PENDING',
  lyric_qc_result       TEXT NULL,
  direction_version     SMALLINT UNSIGNED NULL,
  plan_version          SMALLINT UNSIGNED NULL,
  current_master_id     BIGINT UNSIGNED NULL,
  -- Extra attempts a person explicitly authorised beyond the configured maximum.
  attempt_allowance_extra TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_jobs_memory (memory_id),
  UNIQUE KEY uq_creative_jobs_track (album_id, track_number),
  KEY idx_creative_jobs_order (order_id, status),
  CONSTRAINT fk_creative_jobs_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_creative_jobs_album FOREIGN KEY (album_id) REFERENCES creative_albums (id) ON DELETE CASCADE,
  CONSTRAINT fk_creative_jobs_memory FOREIGN KEY (memory_id) REFERENCES order_memories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_artifacts (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  -- 'album:<id>' for the Fact Ledger and album map; 'job:<id>' for per-song documents.
  scope_key             VARCHAR(40)  NOT NULL,
  kind                  ENUM('FACT_LEDGER','ALBUM_MAP','STORY_MAP','LYRIC_PACKAGE','MUSIC_DIRECTION','COMPOSITION_PLAN') NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  body                  MEDIUMTEXT   NOT NULL,
  body_sha256           CHAR(64)     NOT NULL,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_artifact_version (scope_key, kind, version),
  KEY idx_creative_artifacts_order (order_id),
  CONSTRAINT fk_creative_artifacts_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_generation_attempts (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id                BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  attempt_number        SMALLINT UNSIGNED NOT NULL,
  fact_ledger_version   SMALLINT UNSIGNED NOT NULL,
  story_map_version     SMALLINT UNSIGNED NOT NULL,
  lyric_version         SMALLINT UNSIGNED NOT NULL,
  direction_version     SMALLINT UNSIGNED NOT NULL,
  plan_version          SMALLINT UNSIGNED NOT NULL,
  provider_id           VARCHAR(40)  NOT NULL,
  provider_model        VARCHAR(80)  NULL,
  provider_generation_id VARCHAR(120) NULL,
  requested_duration_seconds SMALLINT UNSIGNED NOT NULL,
  requested_output      VARCHAR(40)  NULL,
  actual_duration_ms    INT UNSIGNED NULL,
  status                ENUM('IN_PROGRESS','CANDIDATE_READY','PROVIDER_FAIL','TECHNICAL_FAIL','FACT_FAIL','CREATIVE_FAIL','PASS') NOT NULL DEFAULT 'IN_PROGRESS',
  failure_reason        VARCHAR(120) NULL,
  cost_estimated_minor  INT UNSIGNED NULL,
  cost_actual_minor     INT UNSIGNED NULL,
  cost_currency         CHAR(3)      NULL,
  created_by            VARCHAR(160) NOT NULL,
  started_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at          DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_attempt_number (job_id, attempt_number),
  KEY idx_creative_attempts_order (order_id),
  CONSTRAINT fk_creative_attempts_job FOREIGN KEY (job_id) REFERENCES creative_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_candidates (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attempt_id            BIGINT UNSIGNED NOT NULL,
  job_id                BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  stored_name           CHAR(64)     NOT NULL,
  container             VARCHAR(8)   NULL,
  byte_size             INT UNSIGNED NOT NULL,
  sha256                CHAR(64)     NOT NULL,
  duration_ms           INT UNSIGNED NULL,
  sample_rate_hz        INT UNSIGNED NULL,
  channels              TINYINT UNSIGNED NULL,
  bits_per_sample       TINYINT UNSIGNED NULL,
  -- What was actually sung, if supplied (else the lyric package is checked).
  transcript            TEXT NULL,
  technical_status      ENUM('PENDING','PASS','FAIL') NOT NULL DEFAULT 'PENDING',
  technical_qc          TEXT NULL,
  fact_status           ENUM('PENDING','PASS','FAIL','REVIEW_REQUIRED') NOT NULL DEFAULT 'PENDING',
  fact_qc               TEXT NULL,
  creative_status       ENUM('PENDING','PASS','REGENERATE','ESCALATE') NOT NULL DEFAULT 'PENDING',
  creative_qc           TEXT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_candidates_attempt (attempt_id),
  KEY idx_creative_candidates_job (job_id),
  CONSTRAINT fk_creative_candidates_attempt FOREIGN KEY (attempt_id) REFERENCES creative_generation_attempts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_masters (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id                BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  track_number          TINYINT UNSIGNED NOT NULL,
  kind                  ENUM('PRODUCTION_MASTER','CUSTOMER_LISTENING_COPY','PHYSICAL_MEDIA_MASTER') NOT NULL,
  version               SMALLINT UNSIGNED NOT NULL,
  candidate_id          BIGINT UNSIGNED NULL,
  -- Lineage: the master this copy was derived from, and how.
  derived_from_master_id BIGINT UNSIGNED NULL,
  conversion_note       VARCHAR(255) NULL,
  stored_name           CHAR(64)     NOT NULL,
  container             VARCHAR(8)   NULL,
  sha256                CHAR(64)     NOT NULL,
  byte_size             INT UNSIGNED NOT NULL,
  duration_ms           INT UNSIGNED NULL,
  sample_rate_hz        INT UNSIGNED NULL,
  channels              TINYINT UNSIGNED NULL,
  qc_evidence           TEXT NOT NULL,
  is_current            TINYINT(1)   NOT NULL DEFAULT 1,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_creative_master_version (job_id, kind, version),
  KEY idx_creative_masters_order (order_id),
  CONSTRAINT fk_creative_masters_job FOREIGN KEY (job_id) REFERENCES creative_jobs (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS creative_access_log (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  staff                 VARCHAR(160) NOT NULL,
  action                VARCHAR(40)  NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_creative_access_order (order_id, created_at),
  CONSTRAINT fk_creative_access_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
