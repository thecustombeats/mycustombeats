# Sprint 5 — operations, customer lifecycle, exceptions, MCB LIVE enquiries, content foundation
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914` (from 3ad6520c)

**NOT DEPLOYED. LIVE CHECKOUT OFF. NO LIVE STRIPE. NO PRODUCTION MIGRATION. NO FINANCIAL ACTIONS.**

## What was built

| Area | Result |
|---|---|
| State model | Extends `order_production` (stage + new `fulfilment_state` and timestamps). Operational state derived, never stored; payment stays in `orders.status`. `src/data/operations.ts` ↔ `public/api/lib/operations.php`. |
| Workflows | Moment: creative → approval → follow-up → completed, no physical states. Keepsake/Journey: separate creative and physical states; FULFILMENT.READY is a staff task only. |
| Customer approval | `/approve#token`: 256-bit HMAC links, SHA-256 stored, round-scoped, expiring, revocable; idempotent approve; one change request per round; closed after approval/lock unless staff reopen. |
| Revisions | Allowances from catalogue wording (Moment 1; Keepsake/Journey 1 per song); requests marked YES/NO/UNKNOWN and flagged to staff, never refused. |
| Staff operations | `/operations` console; `crm/operations` (queue, search by reference/email/order/enquiry, order detail with timeline and next action); `crm/order-action` (19 audited actions + retry). |
| Queue | Derived from persisted state, 15 kinds; acknowledgements audited against state-specific keys. |
| Priority Replacement | Item-level reports from `/your-order`; eligibility computed (7 days from staff-recorded delivery); no automatic purchase; not presented as warranty. |
| Lifecycle email | APPROVAL_REQUIRED, CHANGES_RECEIVED, APPROVAL_CONFIRMED, DISPATCHED automatic; FOLLOW_UP and REVIEW_REQUEST staff-only. Claim-by-UNIQUE with dedupe key, FAILED kept and retryable, test-mode recipient safety, no story text. |
| Customer status | `/your-order#token`: plain-English stages per workflow; tracking as entered; no lookup by reference. |
| Tracking / follow-up / referral | Carrier, reference, https URL, dispatch/delivery dates (never auto-delivered); follow-up due after delivery/approval; review only for COMPLETED with configured URL; referral attribution unchanged, no rewards. |
| MCB LIVE | Real server enquiry (`LIVE-` reference, queue, statuses without booking/deposit); WhatsApp kept on the site's existing number. |
| Bespoke | "What would you like us to create?" added; server field errors now shown (previous client read the wrong key). |
| Blog | `/blog`, `/blog/:slug`, structured content model, three articles, BlogPosting + BreadcrumbList, OG/Twitter, sitemap, footer link; no FAQ schema, statistics, testimonials or endorsements. |
| Automation events | `crm/automation-events` for the ten named events; nothing is triggered. |
| Security | Rate limits on approval, progress, support, enquiries, quote, order status/reference; same-origin on public POSTs; CRM key for staff; no DB ids/notes/supplier data on customer pages; control characters stripped; https-only external links. |
| Docs | `OPERATIONS-RUNBOOK.md`, `GIFT-VOUCHERS-ARCHITECTURE.md` (not activated), `DATA-RETENTION-ARCHITECTURE.md` (no periods, no automatic deletion), preflight and CRM API updates. |
| Privacy / review | Inventory adds MCB LIVE, change requests, support messages, tracking and private links. Cloudinary closed as a website decision (no active code, regression test); retention remains BLOCKING. |

## Migration

`db/migrations/2026-09-14-sprint5-operations.sql` — additive (plus one ENUM widening and a UNIQUE key widened to include `dedupe_key`). Proven idempotent and identical to a fresh `db/schema.sql`. Not applied anywhere but local test containers.

## Verification

Node 117/117 (baseline 92) · TypeScript and build pass · lint: the 5 pre-existing shadcn errors only · backend acceptance 1,415/1,415 (baseline 1,208; new operations suite 207) · browser evidence in the TEST stack: approval by link, dispatched Keepsake progress, MCB LIVE enquiry stored, staff console, blog desktop/mobile; no console errors; token never appeared in a request URL or Referer · main bundle +4.2 KB raw / +1.2 KB gzip (routes, footer link, blog schema builders); new pages lazy-loaded · secret scan clean.
