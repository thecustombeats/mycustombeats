# MCB™ Single Creative Authority — implementation record

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `e2d83387`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION RUN. NO LIVE STRIPE. NO SUPPLIER PURCHASE.**

> The customer provides the memories. MCB creates the magic. — *You provide the memories. We create the surprise.*

## The one journey

CUSTOMER INPUT → CREATIVE-AUTHORITY CONSENT → PAYMENT → NEW ORDER READY FOR PROCESSING → MCB CREATION → INTERNAL QUALITY CHECK → QC PASSED → (physical) FULFILMENT, authorised by Bella or Lewis → CUSTOMER REVEAL → DELIVERY / FOLLOW-UP.

No song approval, artwork approval, drafts, APPROVE/REMAKE, revision allowance or refinement round remains for new orders.

## What was built

| Area | Implementation |
|---|---|
| Checkout | Separate required consent **Creative Authority & Personalised Production** (Founder wording verbatim), never pre-ticked; the server derives the requirement from `legal.json`, requires `creativeAuthorityVersion` = `2026-09-15`, and records `order_consents.creative_authority_version` + `creative_authority_accepted_at`. Review shows the promise and a "check your names, spellings, dates, places, story, music choices and photographs" reminder before the consents. |
| Photographs | Keepsake and Journey artwork is created from the customer's photograph: at least one per record (server-enforced). Artwork-ready = square (within 1%) and ≥ 2500 × 2500 px; larger squares pass. Checked in the browser on selection and again on upload; an unready photo is refused unless the order includes the service. |
| £15 MCB Artwork Preparation Service | New catalogue SKU `artwork-preparation`, £15, SERVICE, customer-selected before payment, once per order, only with Keepsake/Journey; server-priced; disclosed: "Not every photograph can be prepared to print quality." |
| Lifecycle | Stages `QUALITY_CHECK`, `QC_PASSED` added. Staff actions `SEND_TO_QUALITY_CHECK`, `PASS_QUALITY_CHECK` (13-item checklist; 9 for digital; digital needs the private https link), `FAIL_QUALITY_CHECK` (reason + internal note → back to creation), `SEND_REVEAL`. Payment records `ORDER.READY_FOR_PROCESSING` (and `notification: NEW_ORDER_READY_FOR_PROCESSING` in the dormant ops webhook). QC pass gates fulfilment; `CONFIRM_FULFILMENT` requires `purchase_authorised_by` BELLA or LEWIS. Retired actions return 410. `REOPEN` reasons: MCB_CORRECTION, REPLACEMENT, OTHER (no customer request). |
| Reveal | Digital: CREATION_READY email ("Your MCB creation is ready") → private order page shows the reveal link only after QC. Physical: delivery is the reveal; song not sent beforehand; one-way IN_PRODUCTION and "on the way" emails. |
| Support | "Something in my song or artwork is incorrect" (INCORRECT_DETAIL) → queue item explaining error vs preference; never reopens production by itself. |
| Legacy | `/approve#…` shows "This link is no longer used"; `POST /api/order-approval` answers identically and writes nothing; `POST /api/crm/production` retired. Legacy stages read as QC pending (SONG_READY, AWAITING_APPROVAL, REVISION_REQUESTED) or QC passed (APPROVED; digital → revealed). Historical approval columns, `order_change_requests` and APPROVAL tokens are kept, unused. |
| Legal | Terms/Refunds **2026-09-15.2**, Privacy **2026-09-15**, earlier editions resolvable. Clauses 4 Creative authority, 5 Personalised production and the reveal, 6 Creative preference and genuine problems, 7 Cancelling (production at payment; "may be limited as permitted by applicable law"; "Nothing in these terms affects any statutory rights that cannot legally be excluded or limited."), 9 customer responsibility for supplied information. Clauses 18 and 20 unchanged. **NEEDS PROFESSIONAL LEGAL REVIEW** (`review.ts`). |
| Copy | How it works = the five approved steps; product pages "How MCB creates your memory"; FAQ: How does MCB create my song? / Will I receive a draft? / How does the reveal work? / What if MCB gets an objective detail wrong? / What if I would personally have chosen something differently? / What photograph should I upload?; About, Occasions, blog, thank-you page, style chooser, Bespoke and concierge reconciled. Moment timing: "Revealed to you as soon as it has passed our quality check" (no hour promised); internal 24-hour objective for the staff queue only. |
| Catalogue / schema | `revisions` removed from the catalogue, public feed and structured data; feed carries `creative_process` and `artwork_preparation` rules; no QC notes, supplier data or costs. |

## Database — prepared, not run

`db/migrations/2026-09-15-single-creative-authority.sql` (additive, idempotent; verified: applied twice to the pre-change schema it equals a fresh `db/schema.sql`). Preflight check `creative_authority_migration_applied`. Must run after the Sprint 5 migration in an authorised deployment (`docs/LAUNCH-RUNBOOK.md` step 4).

## Decisions made to implement (for Founder confirmation)

1. Artwork Preparation Service charged **once per order**.
2. Photo requirement: **at least one per Keepsake record / per Journey**; plaque keeps its own photo requirement without the square rule; a Moment's photo stays optional.
3. Square tolerance **1%**; HEIC (size unreadable) is treated as not confirmed artwork-ready unless the service is chosen.
4. A specifically chosen music style is treated as part of the customer's specification (Founder brief §6).

## Verification (TEST / lab only)

Node 154/154 · backend 1,572/1,572 · TypeScript, ESLint, build clean · browser rehearsal (Moment consent → payment → QC fail → QC pass → reveal; old approval link; Keepsake photo required → not artwork-ready → £15 service → paid; artwork-ready photo → no service; wording across 11 pages) · axe 0 violations on 12 pages at 360/1440 px · 0 console errors, 0 analytics leaks · secret scan clean.
