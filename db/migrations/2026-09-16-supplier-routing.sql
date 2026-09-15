-- =====================================================================
-- Migration — MCB™ Supplier Intelligence & Commercial Routing
-- =====================================================================
--
-- 16 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after db/migrations/2026-09-16-business-intelligence.sql.
--
-- Decision support only: nothing here purchases, pays, refunds or commits MCB
-- to spend. Routes, partners and expected costs stay in the server-only
-- api/data/supplier-routes.json; these tables record what PEOPLE decided and
-- what a manually placed partner order actually cost.
--
-- 1. order_route_decisions   the route a person chose for an order line after
--                            reviewing the recommendation (with the reason when
--                            it differs), and a confirmed delivered cost where
--                            the product requires one before purchase. A
--                            decision never authorises spend.
-- 2. card_alternatives       the only substitution rule: an appropriate
--                            alternative card, with the original SKU, reason,
--                            authority and customer-impact assessment
-- 3. supplier_orders.actual_tax_duty_minor
--                            tax or duty actually paid, where known (separate
--                            from product and shipping; absence is UNKNOWN)
--
-- ROLLBACK: backup first; drop the two tables and the column.

CREATE TABLE IF NOT EXISTS order_route_decisions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  sku                   VARCHAR(64)  NOT NULL,
  route_id              VARCHAR(60)  NOT NULL,
  -- The route the engine recommended for review at the time (null when there was none).
  recommended_route_id  VARCHAR(60)  NULL,
  route_group           ENUM('SUPPORTED','UNVERIFIED','MANUAL_REVIEW') NOT NULL,
  -- Required when route_id differs from the recommendation.
  deviation_reason      ENUM('DESTINATION_EVIDENCE','AVAILABILITY','DELIVERY_TIME','QUALITY','CUSTOMER_REQUIREMENT','COST_CONFIRMED','OTHER') NULL,
  note                  VARCHAR(500) NULL,
  -- The customer's delivery country the route was reviewed for.
  country_code          CHAR(2)      NULL,
  -- The actual delivered cost confirmed with the partner (required before purchase for some products).
  confirmed_delivered_cost_minor INT UNSIGNED NULL,
  confirmed_delivered_currency   CHAR(3)      NULL,
  delivered_cost_evidence        VARCHAR(300) NULL,
  status                ENUM('CURRENT','SUPERSEDED') NOT NULL DEFAULT 'CURRENT',
  decided_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  superseded_at         DATETIME     NULL,
  PRIMARY KEY (id),
  KEY idx_route_decisions_order (order_id, sku, status),
  CONSTRAINT fk_route_decisions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS card_alternatives (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  supplier_order_reference VARCHAR(120) NOT NULL,
  original_sku          VARCHAR(64)  NOT NULL,
  alternative           VARCHAR(160) NOT NULL,
  reason                VARCHAR(500) NOT NULL,
  authority             ENUM('STAFF','FOUNDER') NOT NULL,
  authorised_by         VARCHAR(160) NOT NULL,
  customer_impact       ENUM('NO_MATERIAL_DIFFERENCE','CUSTOMER_TOLD','CUSTOMER_AGREED') NOT NULL,
  customer_impact_note  VARCHAR(500) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_card_alternative (order_id, supplier_order_reference, original_sku),
  CONSTRAINT fk_card_alternatives_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE supplier_orders
  ADD COLUMN IF NOT EXISTS actual_tax_duty_minor INT NULL AFTER actual_shipping_cost_minor;
