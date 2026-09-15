-- =====================================================================
-- Migration — MCB Fulfilment Controller & customer delivery automation
-- =====================================================================
--
-- 15 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after
-- db/migrations/2026-09-15-production-file-factory.sql.
--
-- MCB is the middleman: partners make and ship; MCB owns the customer
-- experience. Nothing here buys, pays, refunds or books a courier.
--
-- 1. order_economics — expected and actual internal economics snapshots
--    (content-versioned). STAFF ONLY.
-- 2. supplier_orders — each supplier order a person placed by hand after
--    Bella or Lewis authorised it: reference, route, costs, dates. Never
--    card or payment credentials.
-- 3. shipments — one order, many parcels: carrier, tracking, dates, state.
-- 4. fulfilment_exceptions — delivery, supplier, commercial and resolution
--    cases, with history and an authorised resolution.
-- 5. support_evidence — private evidence for a support case (photos, a
--    video reference). Never required to get help.
-- 6. customer_content_permissions — marketing-content permission, separate
--    from review requests.
-- 7. lifecycle_hooks — prepared re-engagement hooks (nothing is sent).
-- 8. order_service_requests.kind adds WRONG_ITEM and MANUFACTURING_DEFECT;
--    customer_communications.message_type adds ADDITIONAL_PARCEL_DISPATCHED,
--    DELIVERY_UPDATE and DELIVERED.
--
-- ROLLBACK: backup first; drop the seven tables; narrow the two ENUMs only
-- if no row uses a new value.
-- Re-running is safe.
-- =====================================================================

SET NAMES utf8mb4;

ALTER TABLE order_service_requests
  MODIFY COLUMN kind ENUM('DAMAGED_OR_FAULTY','DELIVERY_PROBLEM','QUESTION','INCORRECT_DETAIL','WRONG_ITEM','MANUFACTURING_DEFECT') NOT NULL;

ALTER TABLE customer_communications
  MODIFY COLUMN message_type ENUM('PAYMENT_CONFIRMATION','CONCIERGE_ACKNOWLEDGEMENT',
                      'PRODUCTION_UPDATE','COMPLETION','REVIEW_REQUEST',
                      'REFERRAL_INVITATION','MARKETING',
                      'APPROVAL_REQUIRED','CHANGES_RECEIVED','APPROVAL_CONFIRMED',
                      'DISPATCHED','FOLLOW_UP',
                      'CREATION_READY','IN_PRODUCTION',
                      'ADDITIONAL_PARCEL_DISPATCHED','DELIVERY_UPDATE','DELIVERED') NOT NULL;

CREATE TABLE IF NOT EXISTS order_economics (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  kind                  ENUM('EXPECTED','ACTUAL') NOT NULL,
  status                ENUM('CALCULATED','COMMERCIAL_DATA_REQUIRED','COMMERCIAL_SAFETY_EXCEPTION') NOT NULL,
  currency              CHAR(3)      NOT NULL,
  revenue_minor         INT NOT NULL,
  purchase_cost_minor   INT NULL,
  shipping_cost_minor   INT NULL,
  contingency_minor     INT NULL,
  handling_minor        INT NULL,
  total_cost_minor      INT NULL,
  contribution_minor    INT NULL,
  margin_basis_points   INT NULL,
  body                  TEXT NOT NULL,
  body_sha256           CHAR(64)     NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_order_economics_content (order_id, kind, body_sha256),
  KEY idx_order_economics_order (order_id, kind, id),
  CONSTRAINT fk_order_economics_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS supplier_orders (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  route_id              VARCHAR(60)  NULL,
  supplier_order_reference VARCHAR(120) NOT NULL,
  skus                  VARCHAR(500) NOT NULL,
  purchased_at          DATETIME     NOT NULL,
  operator              VARCHAR(160) NOT NULL,
  financial_authoriser  ENUM('BELLA','LEWIS') NOT NULL,
  currency              CHAR(3)      NOT NULL,
  expected_purchase_cost_minor INT NULL,
  expected_shipping_cost_minor INT NULL,
  expected_total_cost_minor    INT NULL,
  actual_purchase_cost_minor   INT NULL,
  actual_shipping_cost_minor   INT NULL,
  actual_total_cost_minor      INT NULL,
  variance_minor        INT NULL,
  variance_reason       ENUM('SUPPLIER_PRICE_CHANGE','SHIPPING_VARIANCE','CURRENCY_VARIANCE','MARKETPLACE_VARIANCE','MANUAL_ADJUSTMENT','OTHER') NULL,
  expected_dispatch_date DATE NULL,
  expected_delivery_date DATE NULL,
  tracking_pending      TINYINT(1)   NOT NULL DEFAULT 1,
  -- A private reference to the confirmation (e.g. the confirmation email's subject/number). Never a card number.
  confirmation_reference VARCHAR(200) NULL,
  notes                 VARCHAR(1000) NULL,
  status                ENUM('RECORDED','CANCELLED_BY_SUPPLIER') NOT NULL DEFAULT 'RECORDED',
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_supplier_order_reference (order_id, supplier_order_reference),
  KEY idx_supplier_orders_order (order_id),
  CONSTRAINT fk_supplier_orders_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS shipments (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  supplier_order_id     BIGINT UNSIGNED NULL,
  sequence              TINYINT UNSIGNED NOT NULL,
  skus                  VARCHAR(500) NULL,
  -- Counts towards commercial delivery. An authorised resolution may release it.
  required              TINYINT(1)   NOT NULL DEFAULT 1,
  state                 ENUM('AWAITING_DISPATCH','DISPATCHED','IN_TRANSIT','DELAYED','DELIVERED','LOST','CANCELLED') NOT NULL DEFAULT 'AWAITING_DISPATCH',
  carrier               VARCHAR(80)  NULL,
  tracking_reference    VARCHAR(120) NULL,
  tracking_url          VARCHAR(500) NULL,
  dispatched_on         DATE NULL,
  estimated_delivery_date DATE NULL,
  delivered_on          DATE NULL,
  created_by            VARCHAR(160) NOT NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_shipment_sequence (order_id, sequence),
  KEY idx_shipments_state (state, dispatched_on),
  CONSTRAINT fk_shipments_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_shipments_supplier_order FOREIGN KEY (supplier_order_id) REFERENCES supplier_orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS fulfilment_exceptions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  type                  VARCHAR(40)  NOT NULL,
  shipment_id           BIGINT UNSIGNED NULL,
  supplier_order_id     BIGINT UNSIGNED NULL,
  service_request_id    BIGINT UNSIGNED NULL,
  blocking              TINYINT(1)   NOT NULL DEFAULT 1,
  status                ENUM('OPEN','RESOLVED') NOT NULL DEFAULT 'OPEN',
  next_action           VARCHAR(300) NULL,
  detail                VARCHAR(1000) NULL,
  resolution            VARCHAR(40)  NULL,
  resolution_note       VARCHAR(1000) NULL,
  resolution_authorised_by ENUM('BELLA','LEWIS') NULL,
  opened_by             VARCHAR(160) NOT NULL,
  resolved_by           VARCHAR(160) NULL,
  dedupe_key            VARCHAR(120) NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at           DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_fulfilment_exception_dedupe (order_id, dedupe_key),
  KEY idx_fulfilment_exceptions_open (status, created_at),
  CONSTRAINT fk_fulfilment_exceptions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_evidence (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  service_request_id    BIGINT UNSIGNED NOT NULL,
  kind                  ENUM('PARCEL_PHOTO','PRODUCT_PHOTO','UNBOXING_VIDEO_REFERENCE','OTHER') NOT NULL,
  stored_name           CHAR(64)     NULL,
  mime_type             VARCHAR(32)  NULL,
  byte_size             INT UNSIGNED NULL,
  sha256                CHAR(64)     NULL,
  reference_text        VARCHAR(300) NULL,
  ip_hash               CHAR(64)     NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_evidence_request (service_request_id),
  CONSTRAINT fk_support_evidence_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_support_evidence_request FOREIGN KEY (service_request_id) REFERENCES order_service_requests (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_content_permissions (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  scope                 ENUM('REVIEW_QUOTE','PHOTOGRAPHS','SONG','LYRICS','STORY','VIDEO','MESSAGES') NOT NULL,
  status                ENUM('GRANTED','WITHDRAWN') NOT NULL,
  granted_via           ENUM('WRITTEN_CONSENT','EMAIL','OTHER') NOT NULL,
  evidence_reference    VARCHAR(300) NOT NULL,
  recorded_by           VARCHAR(160) NOT NULL,
  granted_at            DATETIME NULL,
  withdrawn_at          DATETIME NULL,
  updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_content_permission_scope (order_id, scope),
  CONSTRAINT fk_content_permissions_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lifecycle_hooks (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id              INT UNSIGNED NOT NULL,
  hook                  ENUM('ANOTHER_MEMORY','ANNIVERSARY_FOLLOW_UP','JOURNEY_CHAPTER','RELATED_KEEPSAKE') NOT NULL,
  status                ENUM('PREPARED','SUPPRESSED','ACTIONED') NOT NULL DEFAULT 'PREPARED',
  due_on                DATE NULL,
  requires_marketing_consent TINYINT(1) NOT NULL DEFAULT 1,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lifecycle_hook (order_id, hook),
  CONSTRAINT fk_lifecycle_hooks_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
