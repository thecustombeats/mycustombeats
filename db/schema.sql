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

  -- The single customer-facing reference: MCB-YYYY-NNNNNN.
  -- NULL until Stripe confirms payment, then UNIQUE and immutable. An
  -- abandoned checkout therefore never consumes a customer-facing number.
  mcb_reference          VARCHAR(20)   NULL,

  -- When the post-payment customer email was handed to Make.com.
  --
  -- Claimed with a conditional UPDATE (... WHERE customer_notified_at IS NULL)
  -- so two concurrent deliveries of the same Stripe event cannot both win it.
  -- That single row-level claim is the whole duplicate-email guarantee.
  -- NULL on a PAID order means the customer is still owed their reference.
  customer_notified_at   DATETIME      NULL,

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
  UNIQUE KEY uq_orders_mcb_reference (mcb_reference),
  KEY idx_orders_customer (customer_id),
  KEY idx_orders_affiliate (affiliate_id),
  KEY idx_orders_partner (partner_id),
  KEY idx_orders_status (status),
  KEY idx_orders_fulfilment (fulfilment_type, status),   -- "what must we ship?"
  KEY idx_orders_created (created_at),
  KEY idx_orders_unnotified (status, customer_notified_at),   -- "who is owed an email?"
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
-- reference_sequence
-- ---------------------------------------------------------------------
-- Allocates the running number inside MCB-YYYY-NNNNNN, one row per year.
--
-- A counter rather than a derivation from orders.id, because the two answer
-- different questions. orders.id counts every submission including abandoned
-- ones; this counts PAID orders only, so MCB-2026-000002 really is the second
-- sale of 2026 and the customer-facing series has no unexplained gaps.
--
-- Allocation is `SELECT ... FOR UPDATE` then UPDATE inside the webhook's
-- existing transaction. The row lock serialises concurrent payments, and
-- UNIQUE(orders.mcb_reference) is the backstop if that ever fails.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reference_sequence (
  year        SMALLINT UNSIGNED NOT NULL,
  last_value  INT UNSIGNED      NOT NULL DEFAULT 0,
  updated_at  DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP
                                ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ---------------------------------------------------------------------
-- unreconciled_payments
-- ---------------------------------------------------------------------
-- Money taken that no order claims. The safety net under /api/order.
--
-- /api/order is deliberately best-effort: a CRM outage must never stop
-- someone paying. The consequence is a narrow window where a customer pays
-- and no order exists to receive it. That payment used to leave nothing
-- behind but an error_log line on shared hosting, which rotates away
-- unread — a real sale, silently lost.
--
-- One row per unclaimed paid session, keyed UNIQUE on the session id so a
-- webhook retry cannot duplicate it. It holds what Stripe itself knows
-- about the buyer, which is enough to find them and finish the order by
-- hand. Closed by POST /api/crm/reconcile, which attaches the payment to a
-- real order and issues the reference through the ONE path that issues
-- references — never by editing this table.
--
-- An empty table is the expected steady state. A row in it is an alarm.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS unreconciled_payments (
  id                    INT UNSIGNED  NOT NULL AUTO_INCREMENT,

  stripe_session_id     VARCHAR(255)  NOT NULL,
  stripe_payment_intent VARCHAR(255)  NULL,
  event_id              VARCHAR(255)  NOT NULL,

  -- NO_ORDER_REFERENCE: checkout carried no client_reference_id, so
  --                     /api/order almost certainly failed before Stripe.
  -- ORDER_NOT_FOUND:    it carried one, but no such order exists.
  -- AMOUNT_MISMATCH / CURRENCY_MISMATCH are the dynamic-checkout reasons:
  -- a signed event named a real order, but Stripe took an amount or a
  -- currency that is not what the server's snapshot expected. The order is
  -- deliberately NOT marked paid; the money is filed here for a human.
  reason                ENUM('NO_ORDER_REFERENCE','ORDER_NOT_FOUND',
                             'AMOUNT_MISMATCH','CURRENCY_MISMATCH') NOT NULL,

  -- What Stripe collected at checkout. The only identity MCB has for this
  -- buyer when its own record is missing.
  customer_email        VARCHAR(190)  NULL,
  customer_name         VARCHAR(160)  NULL,
  customer_phone        VARCHAR(40)   NULL,
  amount_total          DECIMAL(10,2) NULL,
  currency              CHAR(3)       NULL,

  resolved_order_id     INT UNSIGNED  NULL,
  resolved_at           DATETIME      NULL,
  created_at            DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_unreconciled_session (stripe_session_id),   -- retry-safe
  KEY idx_unreconciled_open (resolved_at, created_at),      -- "what is outstanding?"
  CONSTRAINT fk_unreconciled_order FOREIGN KEY (resolved_order_id)
    REFERENCES orders (id) ON DELETE SET NULL
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

-- =====================================================================
-- checkout_sessions — the immutable commercial snapshot of one checkout
-- =====================================================================
--
-- WHY THIS TABLE EXISTS
--
-- A dynamic Checkout Session charges a basket the server totalled. The
-- webhook must later confirm that Stripe took the RIGHT amount — and it
-- cannot do that by re-pricing the basket, because prices change. A
-- customer who paid £449 in September must still reconcile in November
-- after the catalogue was repriced; recalculating would declare a good
-- payment wrong.
--
-- So the expected total is frozen here at session creation and never
-- recomputed. `lines` keeps the itemisation that produced it, so an
-- operator can always see what was actually sold at what price.
--
-- IT ALSO PROVIDES IDEMPOTENCY. UNIQUE(order_id, basket_hash) means a
-- repeated click, a retry or a double-submit finds the row that already
-- exists and reuses its Stripe session instead of creating a second
-- payable one. The same hash seeds Stripe's own Idempotency-Key.
--
-- Creating a row NEVER implies payment. Only the webhook moves an order
-- PENDING -> PAID.
CREATE TABLE IF NOT EXISTS checkout_sessions (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id             INT UNSIGNED NOT NULL,

  -- Fingerprint of the priced basket: order, package, format, and every
  -- line's id, quantity and unit amount. Covers AMOUNTS as well as ids,
  -- so a repriced basket is a new checkout rather than a shared one.
  basket_hash          CHAR(64)     NOT NULL,

  package              VARCHAR(32)  NOT NULL,
  format               VARCHAR(16)  NULL,

  -- The itemisation, as JSON. Immutable once written.
  -- `lines` is reserved in MariaDB, hence the prefix.
  basket_lines         MEDIUMTEXT   NOT NULL,

  -- What the server expects Stripe to take. The webhook compares against
  -- this and nothing else.
  expected_amount_gbp  DECIMAL(10,2) NOT NULL,
  currency             CHAR(3)       NOT NULL DEFAULT 'GBP',

  stripe_session_id    VARCHAR(255) NULL,
  stripe_session_url   TEXT         NULL,

  status               ENUM('CREATED','COMPLETED','FAILED')
                       NOT NULL DEFAULT 'CREATED',

  -- Salted hash of the creating IP, for rate limiting. Never the raw address.
  ip_hash              CHAR(64)     NULL,

  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uq_checkout_order_basket (order_id, basket_hash),
  UNIQUE KEY uq_checkout_stripe_session (stripe_session_id),
  KEY idx_checkout_order (order_id),
  KEY idx_checkout_ip (ip_hash, created_at),
  CONSTRAINT fk_checkout_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- order_items — what the customer actually chose, beyond the package
-- =====================================================================
--
-- WHY THIS EXISTS SEPARATELY FROM checkout_sessions
--
-- `checkout_sessions.basket_lines` is a PAYMENT record: it exists only
-- once a Stripe session was created, and its job is to let the webhook
-- reconcile an amount. This table is a FULFILMENT record: it exists from
-- the moment the order is written, whether or not payment ever starts,
-- and its job is to let MCB make and post the right things.
--
-- Conflating them would mean an abandoned checkout left no trace of what
-- someone wanted, and that a payment-reconciliation change could alter
-- the fulfilment record.
--
-- Amounts are the SERVER'S, priced from the generated catalogue at the
-- moment the order was written. They are never recalculated, so a later
-- repricing cannot change what an old order says it sold. GBP only:
-- local currency is presentation and never a commercial record.
CREATE TABLE IF NOT EXISTS order_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id       INT UNSIGNED NOT NULL,

  -- The stable catalogue id, e.g. 'vinyl-frame' or a specific card design
  -- such as 'gift-pop-up-card-anniversary'. A chosen variant is stored as
  -- ITSELF, so fulfilment reads an exact product rather than a category
  -- plus a free-text occasion.
  item_id        VARCHAR(64)  NOT NULL,

  -- Name as it was at the time of sale. A snapshot for operators and for
  -- historical accuracy; the id remains the thing that identifies it.
  item_name      VARCHAR(160) NOT NULL,

  quantity       SMALLINT UNSIGNED NOT NULL,
  unit_gbp       DECIMAL(10,2) NOT NULL,
  line_gbp       DECIMAL(10,2) NOT NULL,

  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  -- One row per item per order: a repeated id would double a line silently.
  UNIQUE KEY uq_order_item (order_id, item_id),
  KEY idx_order_items_order (order_id),
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


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
