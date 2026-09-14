-- =====================================================================
-- Migration — operations after payment, customer approval, enquiries
-- =====================================================================
--
-- Release-candidate Sprint 5. NOT APPLIED TO PRODUCTION BY THE SPRINT.
--
-- EXTENDS, DOES NOT REPLACE. Payment stays in orders.status. The creative
-- work stays in order_production.stage. This adds the physical side and the
-- timestamps the operational state is derived from (src/data/operations.ts),
-- so there is still exactly one record of where an order has got to.
--
-- 1. order_production gains: when creative work started and finished; the
--    approval round and the private listening link; the fulfilment state
--    (NOT_REQUIRED | PENDING | READY | CONFIRMED | DISPATCHED | DELIVERED)
--    with the reason it is pending; carrier and tracking as a person entered
--    them; dispatch and delivery dates; a delivery-delay flag; follow-up due
--    and done; and a reopen count. NULL fulfilment_state means "never set":
--    digital orders read as NOT_REQUIRED and physical orders as PENDING.
-- 2. customer_communications gains dedupe_key, so a message sent once per
--    approval round (not once per order) keeps the same claim-by-UNIQUE
--    idempotency, and message types for the new lifecycle emails. Existing
--    rows get dedupe_key '' and keep their meaning.
-- 3. order_access_tokens: secure customer links (progress page, approval).
--    Only a SHA-256 of each token is stored.
-- 4. order_change_requests: one per approval round — what the customer asked
--    to change, in their words, kept out of the audit trail and emails.
-- 5. order_service_requests: damaged/faulty reports (including MCB Priority
--    Replacement requests), delivery problems and questions.
-- 6. order_staff_notes: internal notes. Never shown to a customer.
-- 7. operations_acknowledgements: who acknowledged a queue item, and when.
-- 8. live_enquiries: MCB LIVE enquiries, stored on MCB's server.
-- 9. operations_events: audit and automation events whose subject is not an
--    order (enquiries, queue acknowledgements of enquiries).
-- 10. concierge_enquiries.create_request: "what would you like us to create?"
-- 11. rate_limit_hits: request counts for endpoints that write nothing else.
--
-- ROLLBACK. Additive except the ENUM widening and the communications UNIQUE
-- key. To roll back: take a backup, drop the new tables and columns; narrow
-- message_type ONLY if no row uses a new value; restore the two-column UNIQUE
-- key ONLY if no order has two rows of one type.
--
-- Guarded ADDs; re-running is safe.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-14-sprint5-operations.sql
-- A fresh install gets all of this from db/schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE order_production
  ADD COLUMN IF NOT EXISTS creative_started_at      DATETIME NULL,
  ADD COLUMN IF NOT EXISTS creative_ready_at        DATETIME NULL,
  ADD COLUMN IF NOT EXISTS approval_round           SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS approval_requested_at    DATETIME NULL,
  ADD COLUMN IF NOT EXISTS approval_preview_url     VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS changes_requested_at     DATETIME NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_state         ENUM('NOT_REQUIRED','PENDING','READY','CONFIRMED','DISPATCHED','DELIVERED') NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_pending_reason ENUM('DELIVERY_ADDRESS','PERSONALISATION','CUSTOMER_CONTACT','OTHER') NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_ready_at      DATETIME NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_confirmed_at  DATETIME NULL,
  ADD COLUMN IF NOT EXISTS fulfilment_reference     VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS carrier                  VARCHAR(80)  NULL,
  ADD COLUMN IF NOT EXISTS tracking_reference       VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS tracking_url             VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS dispatched_on            DATE NULL,
  ADD COLUMN IF NOT EXISTS delivery_delayed_at      DATETIME NULL,
  ADD COLUMN IF NOT EXISTS delivered_on             DATE NULL,
  ADD COLUMN IF NOT EXISTS follow_up_due_at         DATETIME NULL,
  ADD COLUMN IF NOT EXISTS follow_up_done_at        DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reopened_at              DATETIME NULL,
  ADD COLUMN IF NOT EXISTS reopen_count             SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  ADD KEY IF NOT EXISTS idx_production_fulfilment (fulfilment_state, updated_at);

ALTER TABLE customer_communications
  MODIFY COLUMN message_type ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING',
                      'APPROVAL_REQUIRED','CHANGES_RECEIVED','APPROVAL_CONFIRMED',
                      'DISPATCHED','FOLLOW_UP') NOT NULL;

ALTER TABLE customer_communications
  ADD COLUMN IF NOT EXISTS dedupe_key VARCHAR(40) NOT NULL DEFAULT '';

ALTER TABLE customer_communications
  DROP INDEX IF EXISTS uq_communication_order_type,
  ADD UNIQUE KEY uq_communication_order_type (order_id, message_type, dedupe_key);

CREATE TABLE IF NOT EXISTS order_access_tokens (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  -- STATUS: the customer's progress page. APPROVAL: listen and approve one
  -- approval round. A token does exactly one of these.
  purpose         ENUM('STATUS','APPROVAL') NOT NULL,
  -- Random per token. The link is an HMAC of (purpose, order, nonce) under
  -- the server's token_secret, so a database copy alone cannot rebuild it.
  nonce           CHAR(32) NOT NULL,
  -- SHA-256 of the link token: what a request is looked up by.
  token_hash      CHAR(64) NOT NULL,
  -- APPROVAL only: the round this link may answer. A link from before a
  -- change request cannot approve the version made after it.
  approval_round  SMALLINT UNSIGNED NULL,
  expires_at      DATETIME NOT NULL,
  revoked_at      DATETIME NULL,
  last_used_at    DATETIME NULL,
  created_by      VARCHAR(160) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_access_token_hash (token_hash),
  KEY idx_access_tokens_order (order_id, purpose, revoked_at),
  CONSTRAINT fk_access_tokens_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_change_requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  approval_round  SMALLINT UNSIGNED NOT NULL,
  channel         ENUM('WEBSITE','EMAIL','WHATSAPP','PHONE','IN_PERSON') NOT NULL,
  -- In the customer's words (website) or a staff summary. Never copied into
  -- order_events or any email.
  feedback        TEXT NULL,
  -- Whether this request fits the included allowance. UNKNOWN when the
  -- product has no numeric allowance: staff decide, nothing is invented.
  within_allowance ENUM('YES','NO','UNKNOWN') NOT NULL,
  recorded_by     VARCHAR(160) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  -- One change request per round: a double-submitted form is one request.
  UNIQUE KEY uq_change_request_round (order_id, approval_round),
  CONSTRAINT fk_change_requests_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_service_requests (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  -- The item it concerns, where the customer named one.
  unit_id         BIGINT UNSIGNED NULL,
  kind            ENUM('DAMAGED_OR_FAULTY','DELIVERY_PROBLEM','QUESTION') NOT NULL,
  -- The customer asked for MCB Priority Replacement handling.
  priority_replacement_requested TINYINT(1) NOT NULL DEFAULT 0,
  -- Worked out by the server at the time of the request, for staff:
  --   ELIGIBLE                Priority Replacement bought for this item and
  --                           the request is within the window after delivery
  --   NOT_PURCHASED           not bought for this item (normal rights apply)
  --   OUTSIDE_WINDOW          bought, but requested after the window
  --   DELIVERY_NOT_CONFIRMED  bought, but MCB has not recorded delivery yet
  --   NOT_APPLICABLE          not a Priority Replacement request
  eligibility     ENUM('ELIGIBLE','NOT_PURCHASED','OUTSIDE_WINDOW','DELIVERY_NOT_CONFIRMED','NOT_APPLICABLE') NOT NULL,
  description     TEXT NOT NULL,
  status          ENUM('OPEN','IN_REVIEW','RESOLVED','DECLINED') NOT NULL DEFAULT 'OPEN',
  resolution      ENUM('REPLACEMENT_ARRANGED','RESENT_OR_REPAIRED','ANSWERED','NO_ACTION_NEEDED','OTHER') NULL,
  resolved_by     VARCHAR(160) NULL,
  resolved_at     DATETIME NULL,
  ip_hash         CHAR(64) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_service_requests_order (order_id),
  KEY idx_service_requests_status (status, created_at),
  KEY idx_service_requests_ip (ip_hash, created_at),
  CONSTRAINT fk_service_requests_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_service_requests_unit FOREIGN KEY (unit_id)
    REFERENCES order_units (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_staff_notes (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  note            TEXT NOT NULL,
  staff           VARCHAR(160) NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_staff_notes_order (order_id, created_at),
  CONSTRAINT fk_staff_notes_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations_acknowledgements (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- The derived queue item, e.g. ORDER:41:CHANGES_REQUESTED:2. The key
  -- changes when the underlying state changes, so an acknowledgement never
  -- hides a new problem.
  item_key        VARCHAR(120) NOT NULL,
  staff           VARCHAR(160) NOT NULL,
  note            VARCHAR(500) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operations_ack_item (item_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS live_enquiries (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- LIVE-YYYY-XXXXXX, random tail. Not an order reference.
  reference       VARCHAR(24)  NOT NULL,
  request_type    ENUM('AVAILABILITY','QUOTE','AVAILABILITY_AND_QUOTE') NOT NULL,
  name            VARCHAR(160) NOT NULL,
  email           VARCHAR(190) NOT NULL,
  phone           VARCHAR(40)  NULL,
  event_type      VARCHAR(120) NOT NULL,
  -- NULL: the customer has not fixed a date.
  event_date      DATE         NULL,
  location        VARCHAR(190) NOT NULL,
  performer       ENUM('DJ_RINALDI','LADY_LAKH','TOGETHER','HELP_ME_CHOOSE') NOT NULL,
  duration        ENUM('1_HOUR','2_HOURS','3_HOURS','EXTENDED','TO_BE_DISCUSSED') NOT NULL,
  -- As the customer typed it, currency and all. Not parsed, not converted.
  approximate_budget VARCHAR(120) NULL,
  song_reveal     ENUM('YES','NO','ALREADY_HAVE_SONG') NOT NULL,
  details         TEXT NULL,
  -- Conversation vocabulary. No BOOKED, no DEPOSIT, no PAID.
  status          ENUM('NEW','IN_CONVERSATION','QUOTE_SENT','CLOSED','DECLINED') NOT NULL DEFAULT 'NEW',
  ip_hash         CHAR(64) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_live_enquiry_reference (reference),
  KEY idx_live_enquiries_status (status, created_at),
  KEY idx_live_enquiries_ip (ip_hash, created_at),
  KEY idx_live_enquiries_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations_events (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  subject_type      ENUM('MCB_LIVE_ENQUIRY','BESPOKE_ENQUIRY') NOT NULL,
  subject_reference VARCHAR(24)  NOT NULL,
  -- MCB_LIVE.ENQUIRY_RECEIVED, BESPOKE.ENQUIRY_RECEIVED, ENQUIRY.STATUS_CHANGED,
  -- QUEUE.ACKNOWLEDGED. Identifiers only — never what the customer wrote.
  event_type        VARCHAR(64)  NOT NULL,
  detail            VARCHAR(1000) NULL,
  dedupe_key        VARCHAR(120) NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_operations_events_dedupe (subject_type, subject_reference, dedupe_key),
  KEY idx_operations_events_subject (subject_type, subject_reference)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE concierge_enquiries
  ADD COLUMN IF NOT EXISTS create_request VARCHAR(1000) NULL;

CREATE TABLE IF NOT EXISTS rate_limit_hits (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope           VARCHAR(32) NOT NULL,
  ip_hash         CHAR(64)    NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_rate_limit_hits (scope, ip_hash, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
