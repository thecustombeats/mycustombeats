-- =====================================================================
-- Migration — personalised order persistence, delivery, uploads, audit
-- =====================================================================
--
-- Release-candidate Sprint 4. NOT APPLIED TO PRODUCTION BY THE SPRINT.
--
-- 1. What the customer personalised is stored per song product and per
--    memory, not as one free-text brief:
--      order_units     one row per Moment, per individual Keepsake, per
--                      Journey, per plaque and per lyrics frame, with a
--                      snapshot of the physical format sold
--      order_memories  one row per song / chapter on a song unit
--    Two Keepsakes are two units with their own memories.
-- 2. order_uploads: customer photos, stored privately under random names and
--    attached to the memory or plaque they belong to. No file content in the
--    database.
-- 3. order_events: an append-only audit trail of what happened to an order
--    (created, personalisation complete, checkout session, payment, review).
--    Identifiers and amounts only — never story, contact or address text.
-- 4. orders gains:
--      subtotal_minor, delivery_minor   total_minor stays the PAYABLE total
--                                       (subtotal + delivery), which is what
--                                       checkout charges and the webhook
--                                       matches
--      delivery_status, delivery_rate_source, delivery_rate_id,
--      delivery_label                   how delivery was quoted — including
--                                       whether a TEST_ONLY fixture was used
--      personalisation_status           NOT_PROVIDED | AWAITING_UPLOADS |
--                                       COMPLETE; checkout requires COMPLETE
--                                       for every song experience
--      stripe_livemode                  the mode the payment was made in
--    and status gains PAYMENT_REVIEW (money arrived for this order but not
--    the amount or currency expected) and CANCELLED (operator use).
-- 5. delivery_addresses.country_code: the ISO code delivery is quoted on.
-- 6. checkout_sessions.livemode, and unreconciled reasons MODE_MISMATCH (a
--    payment in the other Stripe mode) and ORDER_NOT_PAYABLE (a payment for
--    an order no longer awaiting one): filed for a person, never paid.
--
-- Existing rows are untouched. Orders created before this migration keep
-- personalisation_status NOT_PROVIDED and cannot start a new checkout
-- session; their existing sessions and payment matching are unchanged.
--
-- ROLLBACK. Additive except the two ENUM widenings. To roll back: take a
-- backup, drop the four new tables and the new columns, and narrow the ENUMs
-- again ONLY if no row uses PAYMENT_REVIEW, CANCELLED, MODE_MISMATCH or ORDER_NOT_PAYABLE
-- (narrowing an ENUM with values in use fails or blanks those rows).
--
-- Guarded ADDs; the MODIFY statements are idempotent.
--
-- Run:  mysql -u USER -p DATABASE < db/migrations/2026-09-14-sprint4-order-persistence.sql
-- A fresh install gets all of this from db/schema.sql.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE orders
  MODIFY COLUMN status ENUM('PENDING','PAID','PAYMENT_REVIEW','ABANDONED','REFUNDED','CANCELLED')
    NOT NULL DEFAULT 'PENDING';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal_minor INT UNSIGNED NULL AFTER total_minor,
  ADD COLUMN IF NOT EXISTS delivery_minor INT UNSIGNED NULL AFTER subtotal_minor,
  ADD COLUMN IF NOT EXISTS delivery_status ENUM('NOT_REQUIRED','QUOTED','UNAVAILABLE') NULL AFTER delivery_minor,
  ADD COLUMN IF NOT EXISTS delivery_rate_source ENUM('TEST_ONLY_FIXTURE','RATE_TABLE') NULL AFTER delivery_status,
  ADD COLUMN IF NOT EXISTS delivery_rate_id VARCHAR(64) NULL AFTER delivery_rate_source,
  ADD COLUMN IF NOT EXISTS delivery_label VARCHAR(120) NULL AFTER delivery_rate_id,
  ADD COLUMN IF NOT EXISTS personalisation_status ENUM('NOT_PROVIDED','AWAITING_UPLOADS','COMPLETE')
    NOT NULL DEFAULT 'NOT_PROVIDED' AFTER delivery_label,
  ADD COLUMN IF NOT EXISTS stripe_livemode TINYINT(1) NULL AFTER stripe_payment_intent;

ALTER TABLE delivery_addresses
  ADD COLUMN IF NOT EXISTS country_code CHAR(2) NULL AFTER country;

ALTER TABLE checkout_sessions
  ADD COLUMN IF NOT EXISTS livemode TINYINT(1) NULL AFTER currency;

ALTER TABLE unreconciled_payments
  MODIFY COLUMN reason ENUM('NO_ORDER_REFERENCE','ORDER_NOT_FOUND',
                            'AMOUNT_MISMATCH','CURRENCY_MISMATCH',
                            'DUPLICATE_PAYMENT','ORDER_MISMATCH',
                            'MODE_MISMATCH','ORDER_NOT_PAYABLE') NOT NULL;

CREATE TABLE IF NOT EXISTS order_units (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  order_item_id   BIGINT UNSIGNED NOT NULL,
  sku             VARCHAR(64)  NOT NULL,
  product_id      VARCHAR(64)  NOT NULL,
  kind            ENUM('SONG','PLAQUE','FRAME') NOT NULL,
  -- 1-based position within its order line: Keepsake 1, Keepsake 2 …
  unit_index      SMALLINT UNSIGNED NOT NULL,
  -- Songs on this unit, from the catalogue at the time of sale.
  song_count      TINYINT UNSIGNED NULL,
  -- The physical format sold, snapshotted from the catalogue. NULL for
  -- digital units. A Journey is picture_disc = 0: standard vinyl.
  picture_disc    TINYINT(1)   NULL,
  size_inches     TINYINT UNSIGNED NULL,
  shape           VARCHAR(8)   NULL,
  disc_count      TINYINT UNSIGNED NULL,
  gatefold        TINYINT(1)   NULL,
  -- MCB Priority Replacement chosen for THIS Keepsake. Eligible units only.
  priority_replacement TINYINT(1) NOT NULL DEFAULT 0,
  -- Plaque: the song and artist printed on it. The photo is in order_uploads.
  plaque_song_title VARCHAR(120) NULL,
  plaque_artist     VARCHAR(120) NULL,
  -- Frame: which song's lyrics, and an optional heading.
  frame_memory_id  BIGINT UNSIGNED NULL,
  frame_heading    VARCHAR(80)  NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_unit_position (order_item_id, unit_index),
  KEY idx_order_units_order (order_id),
  CONSTRAINT fk_order_units_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_units_item FOREIGN KEY (order_item_id)
    REFERENCES order_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_memories (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  unit_id         BIGINT UNSIGNED NOT NULL,
  -- 1-based song / chapter number on the unit.
  sequence        TINYINT UNSIGNED NOT NULL,
  -- The memory in the customer's words. VARCHAR(300) counts characters, so
  -- the column enforces the same 300-character limit the server validates.
  story           VARCHAR(300) NOT NULL,
  about           VARCHAR(120) NULL,
  occasion        VARCHAR(40)  NULL,
  -- STYLE: a catalogued style label; CUSTOM: the customer's own words;
  -- MCB_CHOICE: the customer asked MCB to choose (style_label NULL).
  style_choice    ENUM('STYLE','CUSTOM','MCB_CHOICE') NOT NULL,
  style_label     VARCHAR(120) NULL,
  -- The customer said they would add a photo for this memory.
  photo_requested TINYINT(1)   NOT NULL DEFAULT 0,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_memory_sequence (unit_id, sequence),
  KEY idx_order_memories_order (order_id),
  CONSTRAINT fk_order_memories_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_memories_unit FOREIGN KEY (unit_id)
    REFERENCES order_units (id) ON DELETE CASCADE,
  CONSTRAINT chk_memory_style CHECK (
    (style_choice = 'MCB_CHOICE' AND style_label IS NULL)
    OR (style_choice IN ('STYLE','CUSTOM') AND style_label IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE order_units
  ADD CONSTRAINT fk_order_units_frame_memory FOREIGN KEY IF NOT EXISTS (frame_memory_id)
    REFERENCES order_memories (id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS order_uploads (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  -- Opaque identifier used everywhere outside the database. Random, never
  -- derived from the file name, the order or the time.
  public_id       CHAR(32)     NOT NULL,
  order_id        INT UNSIGNED NOT NULL,
  -- Exactly one of these: the memory photo or the plaque photo.
  memory_id       BIGINT UNSIGNED NULL,
  unit_id         BIGINT UNSIGNED NULL,
  -- Server-chosen file name in the private upload directory. No path, no
  -- customer-supplied name or extension.
  stored_name     CHAR(64)     NOT NULL,
  mime_type       VARCHAR(32)  NOT NULL,
  byte_size       INT UNSIGNED NOT NULL,
  width           SMALLINT UNSIGNED NULL,
  height          SMALLINT UNSIGNED NULL,
  sha256          CHAR(64)     NOT NULL,
  ip_hash         CHAR(64)     NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_uploads_public (public_id),
  UNIQUE KEY uq_order_uploads_memory (memory_id),
  UNIQUE KEY uq_order_uploads_unit (unit_id),
  KEY idx_order_uploads_order (order_id),
  KEY idx_order_uploads_ip (ip_hash, created_at),
  CONSTRAINT fk_order_uploads_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_uploads_memory FOREIGN KEY (memory_id)
    REFERENCES order_memories (id) ON DELETE CASCADE,
  CONSTRAINT fk_order_uploads_unit FOREIGN KEY (unit_id)
    REFERENCES order_units (id) ON DELETE CASCADE,
  CONSTRAINT chk_upload_target CHECK (
    (memory_id IS NOT NULL AND unit_id IS NULL) OR (memory_id IS NULL AND unit_id IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_events (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  -- ORDER.CREATED, PERSONALISATION.COMPLETE, UPLOAD.ATTACHED,
  -- CHECKOUT.SESSION_CREATED, PAYMENT.RECEIVED, ORDER.PAID,
  -- PAYMENT.REVIEW, CUSTOMER.CONFIRMATION.DUE, CUSTOMER.CONFIRMATION.SENT …
  event_type      VARCHAR(64)  NOT NULL,
  -- Identifiers and amounts only. Never story, contact or address text.
  detail          VARCHAR(1000) NULL,
  -- Makes a once-only event idempotent: e.g. 'paid' for ORDER.PAID.
  dedupe_key      VARCHAR(120) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_events_dedupe (order_id, dedupe_key),
  KEY idx_order_events_order (order_id, created_at),
  CONSTRAINT fk_order_events_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
