-- =====================================================================
-- Migration — MCB™ Security, Resilience & Automation Readiness
-- =====================================================================
--
-- 17 September 2026. NOT APPLIED TO PRODUCTION. Run only as part of an
-- authorised deployment, after db/migrations/2026-09-16-supplier-routing.sql.
--
-- Additive only. Nothing here spends, refunds or purchases.
--
-- 1. order_route_decisions.availability_confirmed / destination_confirmed
--    the £1,000 gramophone needs availability and delivery to the customer's
--    destination confirmed by a person (with evidence) before a founder can
--    authorise its purchase
--
-- ROLLBACK: backup first; drop the added columns.

ALTER TABLE order_route_decisions
  ADD COLUMN IF NOT EXISTS availability_confirmed TINYINT(1) NOT NULL DEFAULT 0 AFTER delivered_cost_evidence,
  ADD COLUMN IF NOT EXISTS destination_confirmed  TINYINT(1) NOT NULL DEFAULT 0 AFTER availability_confirmed;
