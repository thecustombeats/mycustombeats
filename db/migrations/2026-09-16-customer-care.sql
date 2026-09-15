-- =====================================================================
-- Migration — MCB™ Customer Care & Recovery Controller
-- =====================================================================
--
-- 16 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after
-- db/migrations/2026-09-15-memory-music-video.sql.
--
-- THE CUSTOMER BOUGHT FROM MCB. MCB OWNS THE EXPERIENCE.
--
-- One canonical support case: the existing order_service_requests row is
-- extended rather than duplicated (support_evidence and fulfilment_exceptions
-- already point at it).
--
-- 1. order_service_requests      the support case: customer-care states,
--                                priority, classification (objective MCB
--                                error vs subjective preference), privacy
--                                review, sentiment, root cause, recovery
--                                outcome, timings, satisfaction. Existing
--                                OPEN / IN_REVIEW / DECLINED rows map to
--                                NEW / REVIEWING / CLOSED.
-- 2. support_case_messages       the private thread: CUSTOMER_MESSAGE,
--                                MCB_RESPONSE, INTERNAL_NOTE, SYSTEM_EVENT
-- 3. support_remedies            prepared remedies; money-bearing ones wait
--                                for Bella or Lewis. Nothing is purchased.
-- 4. refund_reviews              refund review and founder decision, and the
--                                record of a refund made outside MCB's system
--                                (full or partial). No refund is executed here.
-- 5. customer_communications.message_type adds SUPPORT_RESPONSE
-- 6. video_jobs.duration_status: VIDEO_DURATION_REVIEW_REQUIRED becomes
--    VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED (no full-song promise
--    beyond the unverified 4-minute planning maximum)
--
-- RETENTION: support messages, evidence, refund records and privacy reviews
-- are kept until a retention policy is set — LEGAL_REVIEW_REQUIRED.
--
-- ROLLBACK: backup first; drop the three new tables; the added columns can be
-- dropped; map NEW/REVIEWING/CLOSED back to OPEN/IN_REVIEW/DECLINED (and the
-- other new states to IN_REVIEW) before narrowing the status ENUM.

-- 6. Video duration: no promise beyond the unverified planning maximum.
ALTER TABLE video_jobs
  MODIFY COLUMN duration_status ENUM('PENDING_AUDIO_MASTER','VIDEO_DURATION_ELIGIBLE','VIDEO_DURATION_REVIEW_REQUIRED','VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED') NOT NULL DEFAULT 'PENDING_AUDIO_MASTER';
UPDATE video_jobs SET duration_status = 'VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED', waiting_on = IF(status = 'READY', 'PROVIDER_VERIFICATION', waiting_on)
 WHERE duration_status = 'VIDEO_DURATION_REVIEW_REQUIRED';
ALTER TABLE video_jobs
  MODIFY COLUMN duration_status ENUM('PENDING_AUDIO_MASTER','VIDEO_DURATION_ELIGIBLE','VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED') NOT NULL DEFAULT 'PENDING_AUDIO_MASTER';

-- 5. The "MCB has replied" email.
ALTER TABLE customer_communications
  MODIFY COLUMN message_type ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING',
                      'APPROVAL_REQUIRED','CHANGES_RECEIVED','APPROVAL_CONFIRMED',
                      'DISPATCHED','FOLLOW_UP',
                      'CREATION_READY','IN_PRODUCTION',
                      'ADDITIONAL_PARCEL_DISPATCHED','DELIVERY_UPDATE','DELIVERED',
                      'VIDEO_READY','SUPPORT_RESPONSE') NOT NULL;

-- 1. The canonical support case.
ALTER TABLE order_service_requests
  MODIFY COLUMN kind ENUM('DAMAGED_OR_FAULTY','DELIVERY_PROBLEM','QUESTION','INCORRECT_DETAIL','WRONG_ITEM','MANUFACTURING_DEFECT',
                          'VIDEO_PROBLEM','DIGITAL_DELIVERY_PROBLEM','OTHER') NOT NULL,
  MODIFY COLUMN status ENUM('OPEN','IN_REVIEW','DECLINED',
                            'NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'NEW';
UPDATE order_service_requests SET status = CASE status WHEN 'OPEN' THEN 'NEW' WHEN 'IN_REVIEW' THEN 'REVIEWING' WHEN 'DECLINED' THEN 'CLOSED' ELSE status END
 WHERE status IN ('OPEN','IN_REVIEW','DECLINED');
ALTER TABLE order_service_requests
  MODIFY COLUMN status ENUM('NEW','REVIEWING','WAITING_FOR_MCB','WAITING_FOR_CUSTOMER','RESOLUTION_IN_PROGRESS','RESOLVED','CLOSED') NOT NULL DEFAULT 'NEW',
  -- CUSTOMER: the customer asked. MCB: staff opened it (e.g. from a delivery exception with customer impact).
  ADD COLUMN IF NOT EXISTS origin ENUM('CUSTOMER','MCB') NOT NULL DEFAULT 'CUSTOMER' AFTER kind,
  -- Internal only; never shown to the customer.
  ADD COLUMN IF NOT EXISTS priority ENUM('NORMAL','IMPORTANT','URGENT') NOT NULL DEFAULT 'NORMAL' AFTER origin,
  -- For digital and video problems: ACCESS, PLAYBACK, DOWNLOAD, EXPIRED_LINK, WRONG_FILE, CORRUPT_FILE.
  ADD COLUMN IF NOT EXISTS issue VARCHAR(40) NULL AFTER priority,
  ADD COLUMN IF NOT EXISTS classification ENUM('UNCLASSIFIED','OBJECTIVE_MCB_ERROR','SUBJECTIVE_CREATIVE_PREFERENCE','NOT_APPLICABLE') NOT NULL DEFAULT 'UNCLASSIFIED' AFTER issue,
  ADD COLUMN IF NOT EXISTS privacy_review ENUM('NOT_REQUIRED','PRIVACY_REVIEW_REQUIRED','PRIVACY_REVIEW_COMPLETED') NOT NULL DEFAULT 'NOT_REQUIRED' AFTER classification,
  ADD COLUMN IF NOT EXISTS privacy_reviewed_by VARCHAR(160) NULL AFTER privacy_review,
  ADD COLUMN IF NOT EXISTS privacy_reviewed_at DATETIME NULL AFTER privacy_reviewed_by,
  ADD COLUMN IF NOT EXISTS assigned_staff VARCHAR(160) NULL AFTER privacy_reviewed_at,
  -- Written by MCB for the customer's page. The customer's own words stay in description.
  ADD COLUMN IF NOT EXISTS customer_summary VARCHAR(300) NULL AFTER description,
  ADD COLUMN IF NOT EXISTS sentiment ENUM('HAPPY','NEUTRAL','UNHAPPY','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN' AFTER customer_summary,
  ADD COLUMN IF NOT EXISTS root_cause ENUM('CREATIVE_ERROR','ARTWORK_ERROR','PRODUCTION_ERROR','SUPPLIER_ERROR','DELIVERY_ERROR','CUSTOMER_INPUT_ERROR',
                                           'DIGITAL_DELIVERY_ERROR','VIDEO_ERROR','SYSTEM_ERROR','UNKNOWN') NULL AFTER resolution,
  ADD COLUMN IF NOT EXISTS recovery_outcome ENUM('RESOLVED','REPLACED','CORRECTED','REDELIVERED','REFUNDED','PARTIALLY_REFUNDED','OTHER') NULL AFTER root_cause,
  ADD COLUMN IF NOT EXISTS resolution_note VARCHAR(1000) NULL AFTER recovery_outcome,
  -- Links to protected records, never copies of them.
  ADD COLUMN IF NOT EXISTS video_job_id BIGINT UNSIGNED NULL AFTER unit_id,
  ADD COLUMN IF NOT EXISTS shipment_id BIGINT UNSIGNED NULL AFTER video_job_id,
  ADD COLUMN IF NOT EXISTS creative_job_id BIGINT UNSIGNED NULL AFTER shipment_id,
  ADD COLUMN IF NOT EXISTS status_since DATETIME NULL AFTER status,
  ADD COLUMN IF NOT EXISTS first_response_at DATETIME NULL AFTER status_since,
  ADD COLUMN IF NOT EXISTS last_customer_activity_at DATETIME NULL AFTER first_response_at,
  ADD COLUMN IF NOT EXISTS last_mcb_activity_at DATETIME NULL AFTER last_customer_activity_at,
  ADD COLUMN IF NOT EXISTS last_activity_at DATETIME NULL AFTER last_mcb_activity_at,
  ADD COLUMN IF NOT EXISTS waiting_mcb_seconds INT UNSIGNED NOT NULL DEFAULT 0 AFTER last_activity_at,
  ADD COLUMN IF NOT EXISTS waiting_customer_seconds INT UNSIGNED NOT NULL DEFAULT 0 AFTER waiting_mcb_seconds,
  ADD COLUMN IF NOT EXISTS repeat_contacts SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER waiting_customer_seconds,
  -- "Did we resolve this for you?" Optional, never incentivised, never published.
  ADD COLUMN IF NOT EXISTS satisfaction ENUM('YES','NO') NULL AFTER repeat_contacts,
  ADD COLUMN IF NOT EXISTS satisfaction_at DATETIME NULL AFTER satisfaction,
  -- No review request to this customer before this time (recovery cooling period).
  ADD COLUMN IF NOT EXISTS review_request_hold_until DATETIME NULL AFTER satisfaction_at,
  ADD COLUMN IF NOT EXISTS closed_at DATETIME NULL AFTER resolved_at,
  ADD INDEX IF NOT EXISTS idx_service_requests_priority (priority, status),
  ADD INDEX IF NOT EXISTS idx_service_requests_privacy (privacy_review);
UPDATE order_service_requests
   SET status_since = COALESCE(status_since, resolved_at, created_at),
       last_customer_activity_at = COALESCE(last_customer_activity_at, created_at),
       last_activity_at = COALESCE(last_activity_at, updated_at),
       priority = IF(priority = 'NORMAL', CASE kind WHEN 'DAMAGED_OR_FAULTY' THEN 'URGENT' WHEN 'WRONG_ITEM' THEN 'URGENT'
                      WHEN 'DELIVERY_PROBLEM' THEN 'IMPORTANT' WHEN 'MANUFACTURING_DEFECT' THEN 'IMPORTANT' WHEN 'INCORRECT_DETAIL' THEN 'IMPORTANT' ELSE 'NORMAL' END, priority)
 WHERE status_since IS NULL;

-- 2. The private case thread. INTERNAL_NOTE and SYSTEM_EVENT never reach the customer.
CREATE TABLE IF NOT EXISTS support_case_messages (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id               BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  kind                  ENUM('CUSTOMER_MESSAGE','MCB_RESPONSE','INTERNAL_NOTE','SYSTEM_EVENT') NOT NULL,
  body                  TEXT NOT NULL,
  -- Who sent an MCB response or wrote a note. NULL for the customer and the system.
  author                VARCHAR(160) NULL,
  template_key          VARCHAR(60)  NULL,
  -- The "MCB has replied" email outcome (sent, failed, not_configured …). The email never carries the text.
  email_outcome         VARCHAR(30)  NULL,
  ip_hash               CHAR(64)     NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_messages_case (case_id, id),
  KEY idx_support_messages_ip (ip_hash, created_at),
  CONSTRAINT fk_support_messages_case FOREIGN KEY (case_id) REFERENCES order_service_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_support_messages_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Remedies. Prepared by staff or automation; anything that costs MCB money waits for Bella or Lewis.
CREATE TABLE IF NOT EXISTS support_remedies (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id               BIGINT UNSIGNED NOT NULL,
  order_id              INT UNSIGNED NOT NULL,
  type                  ENUM('INFORMATION_PROVIDED','TRACKING_UPDATE','INTERNAL_CORRECTION','REPRODUCTION_REQUIRED','REPLACEMENT_REQUIRED',
                             'DIGITAL_REDELIVERY','VIDEO_REDELIVERY','PARTIAL_DELIVERY_RESOLUTION','CANCELLATION_REVIEW_REQUIRED',
                             'REFUND_REVIEW_REQUIRED','OTHER_FOUNDER_RESOLUTION') NOT NULL,
  status                ENUM('PROPOSED','FOUNDER_APPROVAL_REQUIRED','AUTHORISED','IN_PROGRESS','COMPLETED','DECLINED','CANCELLED') NOT NULL DEFAULT 'PROPOSED',
  costs_mcb             ENUM('YES','NO','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  -- A video remedy never takes another customer's production space.
  capacity_basis        ENUM('NOT_APPLICABLE','ORIGINAL_VIDEO_CAPACITY','REWORK_ATTEMPT','REPLACEMENT_VIDEO') NOT NULL DEFAULT 'NOT_APPLICABLE',
  video_job_id          BIGINT UNSIGNED NULL,
  shipment_id           BIGINT UNSIGNED NULL,
  supplier_order_pack_id BIGINT UNSIGNED NULL,
  refund_review_id      BIGINT UNSIGNED NULL,
  note                  VARCHAR(1000) NULL,
  proposed_by           VARCHAR(160) NOT NULL,
  authorised_by         ENUM('BELLA','LEWIS') NULL,
  decided_at            DATETIME NULL,
  decision_note         VARCHAR(1000) NULL,
  completed_by          VARCHAR(160) NULL,
  completed_at          DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_remedies_case (case_id),
  KEY idx_support_remedies_status (status, updated_at),
  CONSTRAINT fk_support_remedies_case FOREIGN KEY (case_id) REFERENCES order_service_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_support_remedies_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Refund review and record. MCB's system never calls a refund API: a founder
-- decides, the refund is made outside it, and staff record what was done.
CREATE TABLE IF NOT EXISTS refund_reviews (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  case_id               BIGINT UNSIGNED NULL,
  status                ENUM('REFUND_REVIEW_REQUIRED','FOUNDER_DECISION_REQUIRED','AUTHORISED','DECLINED','RECORDED') NOT NULL DEFAULT 'REFUND_REVIEW_REQUIRED',
  refund_type           ENUM('FULL','PARTIAL') NOT NULL,
  currency              CHAR(3) NOT NULL,
  -- The original payment, copied at the time of the review.
  gross_paid_minor      INT UNSIGNED NOT NULL,
  amount_minor          INT UNSIGNED NOT NULL,
  reason                VARCHAR(500) NOT NULL,
  requested_by          VARCHAR(160) NOT NULL,
  founder               ENUM('BELLA','LEWIS') NULL,
  decided_at            DATETIME NULL,
  decision_note         VARCHAR(1000) NULL,
  recorded_by           VARCHAR(160) NULL,
  recorded_at           DATETIME NULL,
  refunded_on           DATE NULL,
  -- The payment provider's refund reference, when the refund has been made outside MCB's system.
  external_reference    VARCHAR(120) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_refund_reviews_order (order_id),
  KEY idx_refund_reviews_status (status, updated_at),
  CONSTRAINT fk_refund_reviews_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_refund_reviews_case FOREIGN KEY (case_id) REFERENCES order_service_requests (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
