-- =====================================================================
-- Migration — Single Creative Authority customer journey
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after db/migrations/2026-09-14-sprint5-operations.sql.
--
-- The Founders retired customer song/artwork approval and refinement rounds.
-- MCB's internal quality check now gates the reveal and manufacture.
--
-- 1. order_production.stage gains QUALITY_CHECK and QC_PASSED (appended; the
--    legacy SONG_READY, AWAITING_APPROVAL, REVISION_REQUESTED and APPROVED
--    values stay so historical records keep their evidence).
-- 2. order_production gains quality-check evidence (submitted, passed, by
--    whom, the checklist, failures), the reveal (private link, when
--    revealed) and who authorised the partner purchase (BELLA or LEWIS).
-- 3. The approval-evidence CHECK is replaced: a stage past the quality check
--    must carry qc_passed_at — or, for a legacy row, the approval evidence it
--    already has. No existing row is changed or invalidated.
-- 4. order_consents gains the Creative Authority statement version and when
--    it was accepted.
-- 5. customer_communications.message_type gains CREATION_READY (the digital
--    reveal) and IN_PRODUCTION; order_service_requests.kind gains
--    INCORRECT_DETAIL (a genuine error report).
--
-- DEPRECATED, KEPT: approval_round, approval_requested_at,
-- approval_preview_url, changes_requested_at, revisions_used, approved_*,
-- approval_channel, order_change_requests and the APPROVAL link purpose. The
-- new journey never writes them; nothing is dropped.
--
-- ROLLBACK: backup first; drop the added columns; restore
-- chk_production_approval ONLY if no row is in QUALITY_CHECK/QC_PASSED or
-- relies on qc_passed_at; narrow the ENUMs ONLY if no row uses a new value.
--
-- Re-running is safe (guarded ADDs, constraint dropped before re-adding).
-- A fresh install gets all of this from db/schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE order_production
  MODIFY COLUMN stage ENUM('CREATIVE','SONG_READY','AWAITING_APPROVAL',
                           'REVISION_REQUESTED','APPROVED',
                           'PRODUCTION_LOCKED','FULFILMENT','COMPLETED',
                           'QUALITY_CHECK','QC_PASSED')
                      NOT NULL DEFAULT 'CREATIVE',
  ADD COLUMN IF NOT EXISTS qc_submitted_at   DATETIME NULL,
  ADD COLUMN IF NOT EXISTS qc_passed_at      DATETIME NULL,
  ADD COLUMN IF NOT EXISTS qc_passed_by      VARCHAR(160) NULL,
  ADD COLUMN IF NOT EXISTS qc_checklist      VARCHAR(1000) NULL,
  ADD COLUMN IF NOT EXISTS qc_failed_count   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reveal_url        VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS revealed_at       DATETIME NULL,
  ADD COLUMN IF NOT EXISTS supplier_purchase_authorised_by ENUM('BELLA','LEWIS') NULL;

ALTER TABLE order_production DROP CONSTRAINT IF EXISTS chk_production_approval;
ALTER TABLE order_production DROP CONSTRAINT IF EXISTS chk_production_evidence;
ALTER TABLE order_production ADD CONSTRAINT chk_production_evidence CHECK (
  stage IN ('CREATIVE','SONG_READY','AWAITING_APPROVAL','REVISION_REQUESTED','QUALITY_CHECK')
  OR qc_passed_at IS NOT NULL
  OR (approved_at IS NOT NULL AND approval_channel IS NOT NULL)
);

ALTER TABLE order_consents
  ADD COLUMN IF NOT EXISTS creative_authority_version     VARCHAR(32) NULL,
  ADD COLUMN IF NOT EXISTS creative_authority_accepted_at DATETIME NULL;

ALTER TABLE customer_communications
  MODIFY COLUMN message_type ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING',
                      'APPROVAL_REQUIRED','CHANGES_RECEIVED','APPROVAL_CONFIRMED',
                      'DISPATCHED','FOLLOW_UP',
                      'CREATION_READY','IN_PRODUCTION') NOT NULL;

ALTER TABLE order_service_requests
  MODIFY COLUMN kind ENUM('DAMAGED_OR_FAULTY','DELIVERY_PROBLEM','QUESTION','INCORRECT_DETAIL') NOT NULL;
