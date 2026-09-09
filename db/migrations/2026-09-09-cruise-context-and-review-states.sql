-- =====================================================================
-- Migration — cruise companions, and the two missing review states
-- =====================================================================
--
-- The seventh and final migration of this programme. It is written to be
-- run in the SAME batch as the other six, not afterwards: production has
-- not yet applied any of them, so there is no reason to make this a
-- separate post-deployment step.
--
-- ORDER MATTERS: this must run AFTER
-- 2026-09-09-legal-consent-production.sql, which creates
-- `order_production`. Running it earlier fails on a table that does not
-- exist yet.
--
-- TWO CHANGES, BOTH ADDITIVE:
--
--   1. orders.brief_cruise_companions
--      Who the customer is travelling with, in their own words. Part of
--      the creative brief, alongside the story and the mood.
--
--   2. order_production.stage gains SONG_READY and REVISION_REQUESTED
--      Widening an ENUM is additive: every existing value keeps its
--      meaning and every existing row stays valid. Nothing is renamed
--      and nothing is removed.
--
-- No column is dropped, no row is modified, nothing is renamed.
-- Guarded, so re-running is a no-op.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-cruise-context-and-review-states.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets both from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- 1. orders.brief_cruise_companions
-- ---------------------------------------------------------------------
-- STORYTELLING CONTEXT, NOT A PROFILE. "My wife and our children", "my
-- best friend Sarah". It tells the writer who is in the room when the
-- song is played.
--
-- Free text and nothing more: no age, no gender, no relationship enum,
-- no count. Recipient profiling was cancelled earlier in this programme
-- and this does not reintroduce it under a friendlier name.
--
-- Nullable at the database level even though the order form requires it.
-- The column has to accept the orders that already exist, which were
-- placed before anyone was asked the question — and a NULL there
-- correctly reads as "not asked" rather than "declined to say". The
-- requirement is enforced where it belongs, on new submissions, by
-- api/order.php.
-- ---------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS brief_cruise_companions VARCHAR(255) NULL
  AFTER brief_story;


-- ---------------------------------------------------------------------
-- 2. order_production.stage — SONG_READY and REVISION_REQUESTED
-- ---------------------------------------------------------------------
-- MODIFY rather than ADD, because widening an ENUM is the only way to
-- add a permitted value. It is still additive in effect: the existing
-- six values are listed first and unchanged, so every stored row remains
-- valid and means exactly what it meant before.
--
-- REVISION_REQUESTED is the one that mattered. Without it, an operator
-- moving an order out of AWAITING_APPROVAL had only APPROVED available —
-- so a customer who had asked for a change was recorded as having
-- approved the work, which is both false and would have closed their
-- remaining refinement.
--
-- NOT guarded by IF NOT EXISTS: MariaDB has no such guard for MODIFY.
-- It is idempotent by nature instead — applying the same column
-- definition twice leaves the same definition.
-- ---------------------------------------------------------------------
ALTER TABLE order_production
  MODIFY COLUMN stage ENUM('CREATIVE','SONG_READY','AWAITING_APPROVAL',
                           'REVISION_REQUESTED','APPROVED',
                           'PRODUCTION_LOCKED','FULFILMENT','COMPLETED')
                      NOT NULL DEFAULT 'CREATIVE';

-- The approval CHECK must recognise the two new pre-approval states, or
-- an order legitimately sitting in SONG_READY with no approval evidence
-- would be refused.
--
-- Dropped and recreated because that is the only way to change a CHECK.
-- Guarded on both halves, so a re-run is a no-op and a database that has
-- never had the constraint is not blocked by the DROP.
ALTER TABLE order_production
  DROP CONSTRAINT IF EXISTS chk_production_approval;

ALTER TABLE order_production
  ADD CONSTRAINT chk_production_approval CHECK (
    stage IN ('CREATIVE','SONG_READY','AWAITING_APPROVAL','REVISION_REQUESTED')
    OR (approved_at IS NOT NULL AND approval_channel IS NOT NULL)
  );
