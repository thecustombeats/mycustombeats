-- =====================================================================
-- Migration — customer lifecycle and referral
-- =====================================================================
--
-- Adds three tables:
--
--   customer_referrals              a paid customer's own share code.
--                                   NOT an affiliate record — see below.
--   customer_referral_conversions   orders that arrived through one.
--   customer_communications         the lifecycle message ledger.
--
-- PURELY ADDITIVE. No existing table is altered, no column renamed, no
-- row modified and nothing dropped. In particular `orders`, `affiliates`
-- and `clicks` are untouched: the affiliate system is live and
-- commission-bearing, and a customer sharing a link is not an affiliate.
-- `orders.source_type` keeps its existing three values, so affiliate
-- crediting behaves exactly as it did.
--
-- Orders placed before this have no rows in any of the three. That reads
-- correctly — nothing was tracked, so there is nothing to backfill, and
-- inventing referral codes for historical customers would create share
-- links nobody asked for.
--
-- Safe to run more than once: every statement is guarded.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-09-customer-lifecycle-referral.sql
--       (or paste into phpMyAdmin -> SQL)
--
-- A fresh install gets these from db/schema.sql and does not need the file.
-- =====================================================================

SET NAMES utf8mb4;


-- ---------------------------------------------------------------------
-- customer_referrals
-- ---------------------------------------------------------------------
-- A customer's own share code. NOT an affiliate record.
--
-- WHY THIS IS NOT A ROW IN `affiliates`
-- An affiliate is a commercial arrangement: a username, a dashboard, a
-- conversion counter and, in time, commission. Someone who commissioned a
-- song for their mother and sent the link to their sister has agreed to
-- none of that. Enrolling them in the affiliate programme because they
-- shared a URL would put ordinary customers into a commercial scheme they
-- never joined, and would make the affiliate sales counter — which exists
-- to calculate money owed — count things nobody is owed money for.
--
-- ELIGIBILITY: one verified PAID order. Rows are created by the Stripe
-- webhook, never by the order endpoint, because an order that is merely
-- created may never be paid and an unpaid visitor is not a customer.
-- A Full Package enquiry creates nothing here at all.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_referrals (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id         INT UNSIGNED NOT NULL,

  -- The public code, e.g. 'MCB-R-7QK4ZM'.
  --
  -- RANDOM, NOT SEQUENTIAL, and derived from nothing. A code built from
  -- the customer id would leak how many customers MCB has and let anyone
  -- walk the space by adding one; a code built from an email would put a
  -- fact about the sender into every forwarded link. This is drawn with
  -- random_int server-side and means nothing on its own.
  code                VARCHAR(24)  NOT NULL,

  -- The paid order that made this customer eligible. Evidence of WHY the
  -- code exists, and the thing that makes "no code without a payment"
  -- checkable rather than merely intended.
  first_paid_order_id INT UNSIGNED NULL,

  -- Set to suppress a code without deleting it, so existing conversions
  -- keep resolving to the customer who earned them. NULL is active.
  revoked_at          DATETIME     NULL,

  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                               ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- One code per customer. A second would split their conversions in two
  -- and make "has this person referred anyone?" unanswerable.
  UNIQUE KEY uq_customer_referral_customer (customer_id),
  UNIQUE KEY uq_customer_referral_code (code),

  CONSTRAINT fk_customer_referrals_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_referrals_order FOREIGN KEY (first_paid_order_id)
    REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- customer_referral_conversions
-- ---------------------------------------------------------------------
-- An order that arrived through a customer's shared link.
--
-- WHY THIS IS A TABLE AND NOT A COLUMN ON `orders`
-- `orders.source_type` is ENUM('DIRECT','AFFILIATE','PARTNER') and drives
-- affiliate crediting. Adding 'CUSTOMER' to it would alter a live column
-- that the CRM filters on and the webhook reads when incrementing an
-- affiliate's sales — for a relationship that is not commercial and pays
-- nobody.
--
-- Keeping it here also settles the precedence question cleanly: an order
-- introduced by an affiliate stays source_type = AFFILIATE and the
-- affiliate is credited exactly as before, while the customer share that
-- also touched the journey is recorded HERE as influence. One sale, one
-- commission, and no information thrown away.
--
-- STATUS IS NOT DERIVED FROM PAYMENT. A conversion is ATTRIBUTED when the
-- order is created and CONFIRMED only when Stripe verifies payment, so a
-- pending or abandoned order is never counted as a successful referral.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_referral_conversions (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Who referred. Resolved SERVER-SIDE from the public code; the browser
  -- never names a referring customer.
  referral_id    BIGINT UNSIGNED NOT NULL,

  -- The order that arrived. UNIQUE: an order has one acquisition story.
  order_id       INT UNSIGNED NOT NULL,

  -- The code as it stood at the moment of attribution. A snapshot, so the
  -- record stays readable if a code is ever revoked and reissued.
  code_snapshot  VARCHAR(24)  NOT NULL,

  --   ATTRIBUTED     order created through the link; nothing confirmed.
  --   CONFIRMED      Stripe verified the payment.
  --   SELF_REFERRAL  the referrer and the buyer are the same person.
  --   REVERSED       the order was later refunded or cancelled.
  --
  -- SELF_REFERRAL is recorded rather than discarded: silently dropping it
  -- would leave nothing to look at if the same person kept trying, and it
  -- is the honest description of what happened.
  --
  -- REVERSED exists so that a refunded order can stop counting without the
  -- row being deleted. Nothing writes it yet — MCB has no refund workflow —
  -- and modelling it now costs one enum value, whereas adding it later
  -- means migrating rows that had already been counted as permanent.
  status         ENUM('ATTRIBUTED','CONFIRMED','SELF_REFERRAL','REVERSED')
                 NOT NULL DEFAULT 'ATTRIBUTED',

  attributed_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at   DATETIME NULL,
  reversed_at    DATETIME NULL,
  reversal_reason VARCHAR(160) NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_referral_conversion_order (order_id),
  KEY idx_referral_conversion_referral (referral_id, status),

  CONSTRAINT fk_referral_conversion_referral FOREIGN KEY (referral_id)
    REFERENCES customer_referrals (id) ON DELETE CASCADE,
  CONSTRAINT fk_referral_conversion_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,

  -- A CONFIRMED conversion must say when. Without the timestamp the row
  -- asserts a successful referral it cannot date, which is the same
  -- failure mode as an approval with no channel.
  CONSTRAINT chk_referral_confirmed CHECK (
    status <> 'CONFIRMED' OR confirmed_at IS NOT NULL
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- customer_communications
-- ---------------------------------------------------------------------
-- The lifecycle message ledger.
--
-- WHY IT EXISTS
-- `orders.customer_notified_at` is a single timestamp meaning "the payment
-- confirmation has been sent". It is a good claim mechanism and it stays
-- exactly as it is — but it can only ever answer one question, and MCB now
-- has more than one thing to say to a customer. Adding a second boolean
-- for the review request, and a third for completion, is how a schema ends
-- up unable to answer "what have we actually sent this person?"
--
-- So new message types are claimed here instead, by the same conditional
-- pattern: insert the row, and whoever's insert succeeds owns the send.
-- PAYMENT_CONFIRMATION deliberately keeps its existing claim on `orders`
-- rather than being migrated, because that path is live, tested and
-- carrying real customers' references.
--
-- WHAT IT DOES NOT HOLD: the message body. A ledger of what was sent and
-- when does not need a second copy of every email, and storing one would
-- put customers' stories in a table whose purpose is delivery bookkeeping.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_communications (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       INT UNSIGNED NOT NULL,
  customer_id    INT UNSIGNED NOT NULL,

  -- TRANSACTIONAL AND LIFECYCLE MESSAGES ONLY.
  --
  -- MARKETING is present as a category so the distinction is expressed in
  -- the schema rather than in someone's memory — but nothing in this
  -- repository sends it, and nothing may, because MCB has collected no
  -- marketing consent. A purchase is not an opt-in.
  message_type   ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING')
                 NOT NULL,

  --   CLAIMED  a sender has taken the right to send this and has not
  --            finished; a row stuck here means a crash mid-send.
  --   SENT     the provider accepted it.
  --   FAILED   it did not go, and may be retried — see the release path.
  status         ENUM('CLAIMED','SENT','FAILED') NOT NULL DEFAULT 'CLAIMED',

  attempted_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at        DATETIME NULL,

  -- The provider's own id, for tracing a delivery complaint back to a
  -- specific message. Not a secret and not personal data.
  provider_message_id VARCHAR(190) NULL,
  failure_code   VARCHAR(64)  NULL,

  PRIMARY KEY (id),
  -- ONE OF EACH PER ORDER. This is the idempotency: a replayed webhook, a
  -- double-clicked operator button and a retried job all collide here, and
  -- the database decides which one wins rather than the order they arrive.
  UNIQUE KEY uq_communication_order_type (order_id, message_type),
  KEY idx_communications_customer (customer_id, message_type),

  CONSTRAINT fk_communications_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_communications_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- order_production.completed_at
-- ---------------------------------------------------------------------
-- ADDITIVE. Adds a nullable column; renames nothing, drops nothing, and
-- modifies no existing row. Guarded, so re-running is a no-op.
--
-- The lifecycle messages hang off this. Sprint 8 gave the table a
-- COMPLETED stage but no timestamp for it, and "when did this become
-- complete?" cannot be answered from `updated_at`, which moves every time
-- an operator adds a note.
--
-- It is deliberately not a delivery confirmation. MCB has no carrier
-- tracking integration, so this is a person recording that the commission
-- is fulfilled — see the column comment in db/schema.sql.
-- ---------------------------------------------------------------------
ALTER TABLE order_production
  ADD COLUMN IF NOT EXISTS completed_at DATETIME NULL AFTER production_note;
