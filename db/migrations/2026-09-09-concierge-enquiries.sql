-- =====================================================================
-- Migration — the Full Package concierge enquiry record
-- =====================================================================
--
-- Adds `concierge_enquiries`: enquiries for the Full Package, which is
-- scoped in a private consultation and priced in a written proposal
-- rather than bought online.
--
-- PURELY ADDITIVE. No existing table is altered, no column renamed, no
-- row modified and nothing dropped. `orders` is untouched, and no
-- existing order changes meaning.
--
-- It deliberately does NOT reuse `orders`. That table records a sale —
-- amount_gbp, amount_usd, a currency and a status of PENDING / PAID /
-- ABANDONED / REFUNDED. An enquiry has no agreed price and no expected
-- payment, so recording one there would invent an amount, add an unpaid
-- row to the production queue, and show an operator the word PENDING for
-- something the customer was told costs nothing.
--
-- Safe to run more than once: the statement is guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-concierge-enquiries.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets this from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- concierge_enquiries
-- ---------------------------------------------------------------------
-- The Full Package: an enquiry, not an order.
--
-- WHY THIS IS NOT A ROW IN `orders`
-- `orders` is a record of a sale. It has amount_gbp, amount_usd, a
-- currency, a fulfilment_type, an mcb_reference and a status whose
-- values are PENDING, PAID, ABANDONED and REFUNDED. Every one of those
-- presumes a price has been agreed and a payment is expected.
--
-- A Full Package enquiry has none of that. Nothing has been priced,
-- nothing has been agreed and no payment has been discussed — that is
-- what the consultation is for. Recording one as an order would put a
-- fabricated amount in the revenue tables, an unpaid row in the
-- production queue, and the word PENDING in front of an operator for
-- something the customer was explicitly told costs nothing yet.
--
-- So enquiries live here, with their own vocabulary. There is no amount
-- column, no currency-of-charge, no PAID state and no payment status of
-- any kind. If an enquiry becomes a sale, that sale is an `orders` row
-- created at that point, for the price that was actually agreed.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS concierge_enquiries (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Customer-facing acknowledgement code, e.g. 'FP-2026-7QK4ZM'.
  --
  -- Deliberately NOT the MCB-YYYY-NNNNNN order reference, and not drawn
  -- from `reference_sequence`. An order reference means a paid order in
  -- every MCB email, invoice and CRM screen; issuing one here would tell
  -- the customer they had bought something. The `FP-` prefix is
  -- unmistakable, and the random tail means the code carries no count of
  -- how many enquiries MCB has received.
  reference          VARCHAR(24)  NOT NULL,

  -- Linked when the enquirer is already known, NULL when they are not.
  -- Nullable on purpose: an enquiry must never be blocked, or silently
  -- merged into someone else's customer record, by identity resolution.
  customer_id        INT UNSIGNED NULL,

  name               VARCHAR(160) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  phone              VARCHAR(40)  NULL,
  preferred_contact  ENUM('EMAIL','PHONE','WHATSAPP') NOT NULL DEFAULT 'EMAIL',

  -- What the commission is for, in the customer's words. Free text
  -- rather than a fixed occasion list: the list exists to help someone
  -- who wants it, not to refuse an occasion MCB has not thought of.
  occasion           VARCHAR(160) NULL,

  -- When it needs to be in the recipient's hands. NULL is a real answer
  -- and means "not fixed yet", which is why there is no sentinel date.
  needed_by          DATE         NULL,

  -- Roughly where it is going, for logistics and lead time. A country or
  -- a city — never a full delivery address, which is not needed to have
  -- a conversation and would be personal data collected before there is
  -- anything to deliver.
  delivery_region    VARCHAR(190) NULL,

  -- ---- Budget ------------------------------------------------------
  --
  -- THREE MODES, AND THE DIFFERENCE BETWEEN THEM IS COMMERCIALLY REAL.
  --
  --   AMOUNT  the customer named a figure. It is in budget_amount_minor,
  --           in budget_currency, exactly as they typed it.
  --   OPEN    the customer said there is no fixed spending limit. This
  --           is an ANSWER, and a significant one — it is not a blank
  --           field and it is emphatically not zero.
  --   UNSURE  the customer would rather discuss it. Also an answer.
  --
  -- Recording OPEN as 0, or as NULL, or as a sentinel like 999999 would
  -- each destroy the distinction that matters most: 0 sorts and reads as
  -- "no budget", the exact opposite of what the customer said, and would
  -- put MCB's most valuable enquiries at the bottom of every list.
  budget_mode        ENUM('AMOUNT','OPEN','UNSURE') NOT NULL,

  -- Minor units of `budget_currency` (pence, cents), so the figure the
  -- customer typed survives exactly rather than through a float.
  -- NOT NULL only when budget_mode = 'AMOUNT'; see the CHECK below.
  budget_amount_minor BIGINT UNSIGNED NULL,

  -- THE CURRENCY THE CUSTOMER DECLARED, STORED AS DECLARED.
  --
  -- Never converted to GBP on the way in. A customer who says $10,000
  -- has said $10,000; storing £7,900 would record a number they never
  -- said, at a rate that was true for one minute, and the proposal
  -- conversation would then be conducted against MCB's arithmetic rather
  -- than the customer's own figure. Conversion, if anyone wants it, is a
  -- presentation concern for whoever is reading — not a write.
  budget_currency    CHAR(3)      NULL,

  -- The story: who it is for, and what the customer is trying to create.
  -- The only long-form field, and the one the consultation starts from.
  story              MEDIUMTEXT   NULL,

  -- ---- Handling ----------------------------------------------------
  --
  -- THE VOCABULARY OF A CONVERSATION, NOT OF A PAYMENT.
  --
  -- There is deliberately no PAID, no PENDING and no PENDING PAYMENT
  -- here. AGREED means the scope and price are settled and an `orders`
  -- row is the next step; it does not mean money has moved, and no
  -- screen may render it as though it has.
  status             ENUM('NEW','IN_CONVERSATION','PROPOSAL_SENT','AGREED','CLOSED','DECLINED')
                     NOT NULL DEFAULT 'NEW',

  -- Free-text notes from the consultation, for the person handling it.
  internal_notes     MEDIUMTEXT   NULL,

  -- Attribution, matching `orders` so a concierge enquiry that came
  -- through an affiliate or partner is not attribution-blind.
  source_type        ENUM('DIRECT','AFFILIATE','PARTNER') NOT NULL DEFAULT 'DIRECT',
  affiliate_id       INT UNSIGNED NULL,
  partner_id         INT UNSIGNED NULL,
  referral_raw       VARCHAR(190) NULL,

  -- Salted hash of the submitting IP, for rate limiting only.
  --
  -- The raw address is never stored: it is personal data that would sit here
  -- indefinitely to serve a counter that only needs to know "was this the
  -- same source". `hash_ip` salts it, so the column is also not a rainbow
  -- table of every visitor's address. Nullable because a rate-limited write
  -- must still be possible if the salt is unconfigured — see hash_ip.
  ip_hash            CHAR(64)     NULL,

  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                              ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_concierge_reference (reference),
  KEY idx_concierge_ip (ip_hash, created_at),
  KEY idx_concierge_status (status, created_at),
  KEY idx_concierge_email (email),
  KEY idx_concierge_customer (customer_id),

  -- The database refuses an amount without a currency, a currency
  -- without an amount, and either one attached to OPEN or UNSURE. The
  -- endpoint enforces the same rule; this is what makes it true of every
  -- writer, including a future import script or an operator in
  -- phpMyAdmin.
  CONSTRAINT chk_concierge_budget CHECK (
    (budget_mode = 'AMOUNT'
       AND budget_amount_minor IS NOT NULL
       AND budget_amount_minor > 0
       AND budget_currency IS NOT NULL)
    OR
    (budget_mode <> 'AMOUNT'
       AND budget_amount_minor IS NULL
       AND budget_currency IS NULL)
  ),

  CONSTRAINT fk_concierge_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE SET NULL,
  CONSTRAINT fk_concierge_affiliate FOREIGN KEY (affiliate_id)
    REFERENCES affiliates (id) ON DELETE SET NULL,
  CONSTRAINT fk_concierge_partner FOREIGN KEY (partner_id)
    REFERENCES partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
