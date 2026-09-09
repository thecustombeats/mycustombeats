-- =====================================================================
-- Migration — consent evidence and the production lock
-- =====================================================================
--
-- Adds two tables:
--
--   order_consents    what the customer agreed to at checkout, and which
--                     version of each document was in force.
--   order_production  where the WORK is, as distinct from where the money
--                     is. `orders.status` already tracks payment; it must
--                     not be read as an answer to "can this still be
--                     changed?", because PAID IS NOT PRODUCTION_LOCKED.
--
-- PURELY ADDITIVE. No existing table is altered, no column renamed, no
-- row modified and nothing dropped. `orders` is untouched.
--
-- Orders placed before this have no row in either table. That reads
-- correctly: consent was previously collected in the browser and posted
-- to the fulfilment webhook but never to MCB's own server, so there is
-- genuinely nothing to backfill, and inventing rows would fabricate
-- evidence of consents nobody can prove were given.
--
-- Safe to run more than once: both statements are guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-legal-consent-production.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets these from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- order_consents
-- ---------------------------------------------------------------------
-- What the customer actually agreed to, and which version of it.
--
-- WHY THIS IS A TABLE AND NOT COLUMNS ON `orders`
-- Every order placed before this existed has no consent record, and that
-- is the truth: consent was collected in the browser and posted to the
-- fulfilment webhook, but never to MCB's own server. Nullable columns on
-- `orders` would make "we did not record it" and "they did not consent"
-- the same value. A missing row says the first, unambiguously.
--
-- WHY THE VERSIONS ARE STORED AND NOT LOOKED UP
-- A customer's contract is with the words that were on the page the day
-- they ordered. Resolving "which terms?" by reading the current Terms
-- page is not evidence — it is whatever the page happens to say now. The
-- version strings are written here at the moment of the order and never
-- updated.
--
-- One row per order, enforced by the UNIQUE key: an order has one
-- consent event, not a history of them.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_consents (
  id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id                INT UNSIGNED NOT NULL,

  -- The documents in force when this order was placed, as strings, exactly
  -- as the browser reported them and the server verified them against the
  -- versions it knows.
  terms_version           VARCHAR(32)  NOT NULL,
  refund_policy_version   VARCHAR(32)  NOT NULL,
  privacy_policy_version  VARCHAR(32)  NOT NULL,

  -- Acceptance of the contract. NOT NULL because an order cannot be
  -- created without it — see api/order.php.
  terms_accepted_at       DATETIME     NOT NULL,

  -- The customer's express request that MCB begin the personalised work
  -- inside the 14-day cancellation period. A SEPARATE ACT from accepting
  -- the terms, recorded separately, because it is what makes a
  -- proportionate charge on later cancellation defensible.
  service_start_requested TINYINT(1)   NOT NULL DEFAULT 0,
  service_start_at        DATETIME     NULL,

  -- Acknowledgement that digital content supplied within the cancellation
  -- period ends the right to cancel it.
  --
  -- NULL is a real and correct value: an order for a vinyl record was
  -- never asked this, and recording 0 would misread as "asked, and
  -- declined". `digital_content_required` says which case this is.
  digital_content_required TINYINT(1)  NOT NULL DEFAULT 0,
  digital_content_ack     TINYINT(1)   NULL,
  digital_content_ack_at  DATETIME     NULL,

  -- Where the acceptance came from. Salted hash only: the raw address is
  -- personal data that would sit here indefinitely to serve a question
  -- nobody asks twice. The user agent is kept in full because it is not
  -- identifying on its own and it is what distinguishes a real browser
  -- session from a scripted post if a consent is ever disputed.
  ip_hash                 CHAR(64)     NULL,
  user_agent              VARCHAR(255) NULL,

  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_order_consent (order_id),
  KEY idx_order_consents_terms (terms_version),

  -- The database refuses a digital acknowledgement that was required and
  -- not given, and refuses one recorded against an order that never
  -- needed it. The endpoint enforces the same rule; this makes it true of
  -- every writer, including an import script or an operator in phpMyAdmin.
  -- NOTE THE EXPLICIT `IS NOT NULL`. Without it this constraint does not
  -- fire on the case it exists to catch: a required acknowledgement that was
  -- never given. `digital_content_ack = 1` against NULL evaluates to NULL,
  -- not FALSE, and SQL treats a CHECK that evaluates to NULL as satisfied —
  -- so the row would have been accepted, asserting an order that required an
  -- acknowledgement and recorded none.
  CONSTRAINT chk_consent_digital CHECK (
    (digital_content_required = 1
       AND digital_content_ack IS NOT NULL
       AND digital_content_ack = 1)
    OR
    (digital_content_required = 0 AND digital_content_ack IS NULL)
  ),

  CONSTRAINT fk_order_consents_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- order_production
-- ---------------------------------------------------------------------
-- Where the WORK is, as distinct from where the MONEY is.
--
-- `orders.status` tracks payment: PENDING, PAID, ABANDONED, REFUNDED.
-- This tracks the creative lifecycle. They move independently, and the
-- reason this table exists at all is that they must never be conflated:
--
--   **PAID IS NOT PRODUCTION_LOCKED.**
--
-- A customer whose card cleared five minutes ago still has every
-- refinement their package includes. Inferring the lock from payment
-- status would close their entitlement at the moment they bought it.
--
-- The lock closes on the customer's own APPROVAL, or on the start of
-- irreversible manufacture — both of which are events MCB can evidence,
-- unlike "production has started", which named at least six different
-- moments in a business that writes, records, presses and prints.
--
-- WHAT THIS DELIBERATELY DOES NOT HOLD
-- No creative content. The approval record answers "did they approve,
-- when, and how" — it is not a second copy of the customer's story.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_production (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id            INT UNSIGNED NOT NULL,

  stage               ENUM('CREATIVE','AWAITING_APPROVAL','APPROVED',
                           'PRODUCTION_LOCKED','FULFILMENT','COMPLETED')
                      NOT NULL DEFAULT 'CREATIVE',

  -- Refinements used against the package's included allowance. An integer
  -- rather than a boolean: "have they any left" is a comparison against
  -- the package, which is where the allowance is defined, and duplicating
  -- the allowance here would be a second source of truth for it.
  revisions_used      SMALLINT UNSIGNED NOT NULL DEFAULT 0,

  -- ---- Approval ----------------------------------------------------
  --
  -- CHECKOUT ACCEPTANCE IS NOT THIS. At checkout the customer accepted
  -- the terms of a purchase for something that did not exist yet. This is
  -- them approving the finished work for manufacture, later, having heard
  -- it. Nothing may write this row from a checkout event.
  approved_at         DATETIME     NULL,

  -- MCB approves work over email and WhatsApp today; the website has no
  -- approval screen. Recording the channel that genuinely happened is
  -- better than building a screen nobody uses, or worse, implying the site
  -- captured an approval it did not. WEBSITE exists so that when an
  -- approval screen is built the record shape does not have to change.
  approval_channel    ENUM('WEBSITE','EMAIL','WHATSAPP','PHONE','IN_PERSON') NULL,

  -- Where to find the approval: a message id, an email subject, a note.
  -- Free text on purpose — an operator filing a real approval should not
  -- be blocked by a format.
  approval_reference  VARCHAR(255) NULL,

  -- Which version of the work was approved, where there is more than one.
  approved_item       VARCHAR(160) NULL,

  -- Which staff member recorded it. Accountability for the record itself.
  approved_by         VARCHAR(160) NULL,

  -- ---- The lock ----------------------------------------------------
  -- When irreversible manufacture began. Separate from approved_at: a
  -- customer can approve on Monday and the record be pressed on Thursday,
  -- and between those two points a change is expensive but possible.
  production_locked_at DATETIME    NULL,
  production_note      VARCHAR(255) NULL,

  -- The terms version this order was placed under, denormalised from
  -- order_consents so an operator answering "what can this customer
  -- change?" has the entitlement and the contract in one row.
  terms_version       VARCHAR(32)  NULL,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_order_production (order_id),
  KEY idx_production_stage (stage, updated_at),

  -- An APPROVED order must say when and how it was approved. Without both
  -- the row asserts an approval it cannot evidence, which is worse than
  -- no record because it looks like one.
  CONSTRAINT chk_production_approval CHECK (
    stage IN ('CREATIVE','AWAITING_APPROVAL')
    OR (approved_at IS NOT NULL AND approval_channel IS NOT NULL)
  ),

  CONSTRAINT fk_order_production_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
