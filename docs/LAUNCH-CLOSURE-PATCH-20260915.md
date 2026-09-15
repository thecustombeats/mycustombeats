# MCB™ launch closure patch — 15 September 2026

Branch `mcb-release-candidate-20260914` · started from `3511748a`.

**NOT DEPLOYED. NOT MERGED. LIVE CHECKOUT OFF. NO LIVE STRIPE. NO SUPPLIER PURCHASE. NO FINANCIAL ACTION.**

## What changed

| Area | Change |
|---|---|
| Catalogue | Heart Picture Disc Keepsake £119.99 → **£129.99** (Founders' current price). Every physical product now carries a delivery class (VINYL, FRAME, PLAQUE, PLAYER; CARD reserved for pop-up cards). The class is in the server data only, not in the public feed. |
| Delivery (server) | Delivery pricing is decided per class, privately, in `api/lib/delivery.php`: vinyl and frames are priced from authorised rates; plaques, players and pop-up cards are **confirmed by MCB with the customer before payment** unless the Founders' rate table promotes them. A general rate prices vinyl only. Different classes are charged separately and added (split partners/parcels). No production rate exists; nothing is estimated; internal allowances (£8/£10/£20) are nowhere in the code. |
| Review page | When MCB must confirm delivery, Review names the items, says nothing has been charged, offers email and WhatsApp (+44 7340 742009) and lets the customer remove the item. Physical orders show the Founder-approved fulfilment position and the separate-parcels note. |
| Moment | Unchanged: no country, no delivery, always payable on its own. |
| Operations | Orders holding a plaque, player or pop-up card wait at **FULFILMENT.PENDING** after approval until staff record **Confirm availability and delivery** (explicit tick + note). The partner order cannot be confirmed before that. Staff console shows the requirement; tracking field accepts several parcels. No schema change. Supplier purchase remains a human action. |
| Customer wording | Founder-approved fulfilment position (§6) and damage guidance (§7) added to Terms clause 8, Refunds, FAQ, Keepsake and Journey pages, Priority Replacement, the customer order page, and the approval-confirmed and dispatch emails — always with "not a condition of getting help; your normal consumer rights are not affected". Separate-parcels note on Review, order page, emails. "Ours to put right" removed from the FAQ and the production stage text. |
| Terms 2026-09-15 / Refunds 2026-09-15 | Internal contradictions corrected only: clause 4 (refinements close at approval), clause 7 (change-of-mind wording plus damaged/faulty/not-as-described carve-out), clause 8 (courier disclaimer replaced by the approved position), clause 17 (24-hour condition and "reasonable discount price" removed; partner windows are MCB's to manage), clause 23 (future orders only). Clauses 18 and 20 unchanged and flagged. Superseded editions stay resolvable for existing orders. |
| Structured data / feed | Players (sourced per order, no stock) no longer declare `InStock`; the public feed carries an availability note instead of a stock claim; feed delivery rule updated. |

## Blocked — ACTION REQUIRED — BELLA / LEWIS

1. **Pop-Up Cards (18).** Customer-facing name, customer price, approved image and personalisation (if any) for each card. Without these nothing was built; inventing names or prices is not permitted. The software is ready for a CARD delivery class (MCB confirms delivery by default). Standalone purchase also needs a small rule change (orders currently require a Moment, Keepsake or Journey).
2. **Vinyl Frames / Wall Art (5).** The release candidate sells five **Lyrics Frames** (authorised 14 September, when "Vinyl Frame" was removed). Confirm these are the five current configurations, or supply the framed-vinyl product names, sizes and prices.
3. **Delivery rates.** `api/data/delivery-rates.json` per `docs/FOUNDER-DECISIONS-PACK.md` §2, with classes. Decide whether plaques/players stay "MCB confirms before payment".
4. **Terms/Refunds 2026-09-15.** Founder approval (in particular removing "a reasonable discount price" from clause 17) and legal review; decision on clauses 18 and 20.
5. Carried forward: retention periods; Privacy 2026-09-14 approval; GA settings; Resend domain; Stripe live webhook; `/luxury/` decision.

## Founder visual review — what to check

Use the preview build (TEST mode, stub payments). Take each path on a **desktop browser** and again on a **phone** (critical paths marked ★).

| # | Page / path | Check |
|---|---|---|
| 1 | Homepage `/` ★ | Emotion first, "Create Your Memory" obvious, cookie choice readable, approved wall-art and Rinaldi imagery unchanged. |
| 2 | `/products` | Only current products; prices match the price list; no supplier names or costs anywhere. |
| 3 | `/moment` → Create ★ | £15, no delivery asked, 300-character story, "Let MCB choose", Review shows "Delivery: Not needed". |
| 4 | `/keepsake` ★ | 12-inch £149.99 (4 songs), 10-inch £139.99 (3), Heart **£129.99** (1), 7-inch £99 (1). "Who makes and delivers my keepsake?" and "What if my keepsake arrives damaged?" read well. |
| 5 | `/journey` ★ | 6 songs £199 (12-inch), 12 songs £349 (double 12-inch gatefold), "not a Picture Disc". |
| 6 | Create → Keepsake → Finishing touches ★ | Plaque, frames, players: readable, large buttons; note that some items' delivery is confirmed personally. |
| 7 | Review with a gramophone or plaque ★ | Clear message naming the item, "Nothing has been charged", email and WhatsApp links, no price guessed; payment does not open. |
| 8 | Review with Keepsake only / with a frame ★ | Delivery line and total consistent; fulfilment position and separate-parcels note sensible; (TEST rates are labelled TEST ONLY). |
| 9 | Pop-Up Cards | Not on the site yet (awaiting item 1). |
| 10 | Frames / Gramophones / Plaque | Names, prices and pictures as expected; plaque "does not play music". |
| 11 | `/mcb-live`, `/bespoke` | Enquiry-led, no prices, no instant checkout. |
| 12 | `/legal/terms` | Version 2026-09-15; clauses 4, 7, 8, 17, 23 as described above; 18 and 20 unchanged. |
| 13 | `/legal/refund` ★ | Damage guidance, no 24-hour deadline, no "matter for the courier". |
| 14 | `/legal/privacy` | Unchanged from Sprint 7. |
| 15 | `/priority-replacement` | 7-day window is only for the optional service; damage guidance with "not a condition". |
| 16 | Your order page (staff issue a status link) ★ | "When your parcel arrives" section on physical orders only. |
| 17 | Sticky elements on phone ★ | Cookie banner, WhatsApp button and step navigation never cover the price or the pay button. |

Report anything that reads wrong; wording is data-driven and quick to adjust.

## Verification performed (lab / TEST only)

- Node tests **146/146** (139 before; +7 in `tests/launch-closure.test.mjs`). TypeScript 0 errors, ESLint 0, production build OK.
- Backend acceptance **1,541/1,541** on throwaway PHP 8.2 + MariaDB 11 (api 237, checkout 227, delivery 111, full-package 83, hardening 79, legal 133, lifecycle 117, operations 235 (+28 launch-closure checks), release 96, transaction 223). Assertions that intentionally changed: Heart price; Terms/Refunds version and clauses 4, 8, 17; the Keepsake + plaque + gramophone order now waits for MCB to confirm delivery.
- Browser rehearsal on the Apache-served build with Stripe/Resend stubs: Moment £15 digital-only paid; Keepsake 12-inch with photo paid (£149.99 + TEST £4.95); 7-inch ×2 with Priority Replacement on one (£223.99); Journey 12 (12 chapters, 2 discs, gatefold); Keepsake 7-inch + gramophone at 360 px → Review names the gramophone, "Nothing has been charged", email/WhatsApp, payment not opened, no order created; Keepsake 12-inch + Lyrics Frame → £149.99 + £49.99 + TEST vinyl £4.95 + TEST frame £6.95 = £211.88 paid; dispatch email carries separate-parcels and damage guidance; order page shows "When your parcel arrives"; Terms 2026-09-15, Refunds, FAQ, Keepsake and Priority Replacement wording verified in the rendered pages; no supplier names; 0 console errors; 0 Google requests before consent/after reject; no story or address in any third-party request.
- axe (WCAG 2.0–2.2 A/AA) on Terms, Refunds, FAQ, Keepsake, Journey, Priority Replacement, Products and Home at 360 px and 1440 px: 0 violations, no horizontal overflow.
- Clean build: no source maps, no config or test stubs, no rate table, no supplier names or internal pricing states in browser assets; generated data and `delivery.php` byte-identical to source. Secret scan of the diff: clean.

**CANNOT VERIFY WITHOUT LIVE:** live Stripe checkout and webhook delivery; real Resend delivery; production Hostinger headers/HTTPS; real partner availability, delivery cost and tracking.
