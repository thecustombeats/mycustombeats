-- =====================================================================
-- MCB Commercial CRM — MariaDB schema
-- =====================================================================
--
-- The system of record for MCB customers, orders, attribution and
-- physical fulfilment. Safe to run more than once: every statement is
-- guarded with IF NOT EXISTS.
--
-- Character set is utf8mb4 throughout — customer names, delivery
-- addresses and creative briefs are free text from anywhere in the world,
-- and utf8mb3 would silently mangle anything outside the BMP.
--
-- Run:  mysql -u USER -p DATABASE < db/schema.sql
--       (or paste into phpMyAdmin → SQL)
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';


-- ---------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------
-- Future enterprise channels — cruise lines, hotels, travel advisors.
-- Deliberately seeded EMPTY. Onboarding a partner is inserting a row,
-- never changing code or schema.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partners (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  slug        VARCHAR(64)  NOT NULL,           -- the ?partner= value
  name        VARCHAR(160) NOT NULL,
  active      TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_partners_slug (slug),
  KEY idx_partners_active (active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- affiliates
-- ---------------------------------------------------------------------
-- email and username are UNIQUE at the database level. That constraint —
-- not a browser round-trip — is what makes registration race-safe.
--
-- dashboard_token_hash stores a SHA-256 of the token, never the token
-- itself, so a database leak cannot be replayed as a login.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliates (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name                  VARCHAR(160) NOT NULL,
  email                 VARCHAR(190) NOT NULL,
  username              VARCHAR(64)  NOT NULL,   -- the ?ref= value
  referral_link         VARCHAR(255) NOT NULL,
  clicks                INT UNSIGNED NOT NULL DEFAULT 0,
  sales                 INT UNSIGNED NOT NULL DEFAULT 0,
  expires_at            DATETIME     NULL,
  dashboard_token_hash  CHAR(64)     NULL,
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                     ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_affiliates_email (email),
  UNIQUE KEY uq_affiliates_username (username),
  KEY idx_affiliates_token (dashboard_token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------
-- One human, deduplicated on email.
--
-- first_source_type records how MCB first met this person and is never
-- overwritten. Per-order attribution lives on `orders`, because someone
-- introduced by an affiliate in March who returns directly in July should
-- not credit that affiliate forever.
--
-- No address column, deliberately: see delivery_addresses.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name               VARCHAR(160) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  phone              VARCHAR(40)  NULL,
  first_source_type  ENUM('DIRECT','AFFILIATE','PARTNER') NOT NULL DEFAULT 'DIRECT',
  first_affiliate_id INT UNSIGNED NULL,
  first_partner_id   INT UNSIGNED NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                  ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_first_affiliate (first_affiliate_id),
  KEY idx_customers_first_partner (first_partner_id),
  CONSTRAINT fk_customers_affiliate FOREIGN KEY (first_affiliate_id)
    REFERENCES affiliates (id) ON DELETE SET NULL,
  CONSTRAINT fk_customers_partner FOREIGN KEY (first_partner_id)
    REFERENCES partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------
-- The centre of the CRM. Written at form submission with status PENDING,
-- BEFORE payment, so an abandoned checkout still leaves MCB holding the
-- customer, the brief, the attribution and the delivery address.
--
-- stripe_session_id is UNIQUE and nullable: null until Stripe confirms,
-- then unique forever. That single constraint is what makes webhook
-- delivery idempotent — a replayed event cannot create a second sale.
--
-- fulfilment_type and source_type are DERIVED SERVER-SIDE. The browser
-- cannot set them, and cannot nominate affiliate_id or partner_id.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id            INT UNSIGNED NOT NULL,

  package                VARCHAR(32)  NOT NULL,   -- moment | keepsake | …
  format                 VARCHAR(16)  NULL,       -- vinyl | cd | mp3 | NULL (Bespoke)
  fulfilment_type        ENUM('DIGITAL','PHYSICAL') NOT NULL,

  amount_gbp             DECIMAL(10,2) NOT NULL,
  amount_usd             DECIMAL(10,2) NOT NULL,
  currency               CHAR(3)       NOT NULL DEFAULT 'GBP',

  status                 ENUM('PENDING','PAID','ABANDONED','REFUNDED')
                         NOT NULL DEFAULT 'PENDING',

  source_type            ENUM('DIRECT','AFFILIATE','PARTNER') NOT NULL DEFAULT 'DIRECT',
  affiliate_id           INT UNSIGNED NULL,
  partner_id             INT UNSIGNED NULL,
  referral_raw           VARCHAR(190) NULL,       -- the ?ref=/?partner= string as seen

  stripe_session_id      VARCHAR(255) NULL,
  stripe_payment_intent  VARCHAR(255) NULL,

  brief_mood             VARCHAR(255) NULL,
  brief_genre            VARCHAR(120) NULL,
  brief_personal_touches TEXT         NULL,
  brief_story            MEDIUMTEXT   NULL,
  artwork_url            VARCHAR(512) NULL,

  created_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                      ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_stripe_session (stripe_session_id),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_affiliate (affiliate_id),
  KEY idx_orders_partner (partner_id),
  KEY idx_orders_status (status),
  KEY idx_orders_fulfilment (fulfilment_type, status),   -- "what must we ship?"
  KEY idx_orders_created (created_at),
  CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_affiliate FOREIGN KEY (affiliate_id)
    REFERENCES affiliates (id) ON DELETE SET NULL,
  CONSTRAINT fk_orders_partner FOREIGN KEY (partner_id)
    REFERENCES partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- delivery_addresses
-- ---------------------------------------------------------------------
-- Attached to the ORDER, not the customer, and only ever created for a
-- PHYSICAL order.
--
-- MCB sells gifts: the same buyer ships an anniversary vinyl to their
-- partner and a birthday CD to their mother. An address belongs to a
-- delivery, not to a person. One row per physical order.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS delivery_addresses (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id        INT UNSIGNED NOT NULL,
  recipient_name  VARCHAR(160) NOT NULL,
  address_line_1  VARCHAR(255) NOT NULL,
  address_line_2  VARCHAR(255) NULL,
  city            VARCHAR(120) NOT NULL,
  state_region    VARCHAR(120) NULL,
  postal_code     VARCHAR(32)  NOT NULL,
  country         VARCHAR(120) NOT NULL,
  phone           VARCHAR(40)  NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_delivery_order (order_id),
  CONSTRAINT fk_delivery_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- clicks
-- ---------------------------------------------------------------------
-- One row per referral arrival. ip_hash is a salted SHA-256 — enough to
-- rate-limit and spot abuse, never the raw address.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clicks (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  affiliate_id INT UNSIGNED NOT NULL,
  username     VARCHAR(64)  NOT NULL,
  user_agent   VARCHAR(255) NULL,
  ip_hash      CHAR(64)     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_clicks_affiliate (affiliate_id),
  KEY idx_clicks_created (created_at),
  KEY idx_clicks_ratelimit (ip_hash, created_at),
  CONSTRAINT fk_clicks_affiliate FOREIGN KEY (affiliate_id)
    REFERENCES affiliates (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- stripe_events
-- ---------------------------------------------------------------------
-- Idempotency ledger for webhook delivery. Stripe retries on any non-2xx
-- and may deliver the same event more than once even on success.
--
-- Proposed rather than assumed: the alternative is relying solely on
-- orders.stripe_session_id, but that cannot distinguish "already
-- processed" from "processed and later refunded", and gives no audit
-- trail of what Stripe actually sent. This table is small, append-only,
-- and makes the money path auditable.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stripe_events (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id      VARCHAR(255) NOT NULL,   -- Stripe's evt_…
  event_type    VARCHAR(120) NOT NULL,
  order_id      INT UNSIGNED NULL,
  processed_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stripe_event (event_id),    -- the idempotency guarantee
  KEY idx_stripe_events_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
