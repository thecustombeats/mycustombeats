# MCB™ Founder Command Centre — Sprint 1

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `56c1ad93`.

**NOT DEPLOYED. NOT MERGED. NO MIGRATION. NO LIVE STRIPE. NO MOZART CALL. NO SUPPLIER PURCHASE. NO REFUND. NO SECRETS.**

The Command Centre is where Bella and Lewis run MCB without needing to understand the automation underneath. It answers five questions:
- What is happening?
- What needs my attention?
- What requires my decision?
- How is the business performing?
- Is any customer or order in trouble?

## 1. Architecture

| Layer | File | Role |
|---|---|---|
| Read model | `public/api/lib/command-centre.php` | Set queries over all paid orders, reusing `operational_state`, fulfilment health, economics snapshots, the notification outbox and readiness facts. No per-order query loop. |
| Endpoint | `public/api/crm/command-centre.php` | CRM key and staff name on every request; `Cache-Control: no-store`; `X-Robots-Tag: noindex`. |
| Page | `src/pages/CommandCentre.tsx` | Standalone `/command-centre` (no site layout, consent banner or analytics). |
| Order card, quality review | `src/pages/command-centre/` | Order command card, song and artwork quality review, shared UI. |
| Client helpers | `src/lib/commandCentre.ts` | Deep-link parsing, money and "time ago" formatting, readiness labels. |

**Consequential actions.** The endpoint accepts only two founder quality decisions. Everything financial goes through `crm/order-action` with Bella's or Lewis's own code, exactly as in the staff console. Engineering state stays underneath: every summary carries its `state`, and **Advanced / technical** (closed by default) shows events, notification attempts, document versions, QC records and packages.

**No migration.** The Command Centre adds no table. Quality decisions write the existing QC records, plus an order event `FOUNDER.QUALITY_REVIEWED` (who, what, order, time, result). Opening the quality view is logged in `creative_access_log`.

## 2. Founder language

| Engineering | Founder |
|---|---|
| ORDER.PAID, CREATIVE.PENDING | New |
| CREATIVE.IN_PROGRESS | Creating |
| QUALITY_CHECK (plus song/artwork awaiting review) | Needs quality check |
| FULFILMENT.READY (and founder-only exception decisions) | Needs your approval |
| REVEAL.READY, FULFILMENT.PENDING/READY/AUTHORISED | Ready for fulfilment |
| FULFILMENT.CONFIRMED | Being made |
| DISPATCHED | On the way |
| DELIVERED, REVEALED, FOLLOW_UP.DUE, COMPLETED | Delivered |
| Open exceptions, customer problems, stranded orders | Needs attention |

## 3. MCB Today (`view=overview`)

**Period selector: Today / This week / All active.** MCB has no configured business timezone, so days are UTC and weeks start on Monday. The page says so.

**Tiles:**

| Tile | What it counts |
|---|---|
| Paid | Orders whose payment record falls in the period (All active: orders not completed) |
| New memories | Memories in those orders |
| Creating | Orders currently New or Creating |
| Needs quality check | Distinct orders with a song or artwork awaiting review, or the final MCB check |
| Needs your approval | Pending founder decisions |
| Being made, On the way | Orders currently at that stage |
| Delivered | Delivered or revealed in the period |
| Needs attention | Distinct orders with a problem card |

**Money:**
- Revenue for the period.
- Estimated and actual gross contribution, shown as "— Awaiting data" when unknown, never £0.

**Other panels on the page:** needs your attention, orders pipeline, paid revenue, profit snapshot, customers needing help, system health, music platform.

## 4. Attention and action cards

A healthy order in a routine stage creates no card.

**Card types:**
- purchase approval
- founder decision (commercial safety, substitution, paid-order exception, lost parcel or partial delivery, supplier cancelled)
- song, artwork and final quality check
- place the supplier order (staff)
- delivery or fulfilment exception
- manufacturing information required
- artwork exception
- creative exception
- customer needs help
- stranded order

**Card contents.** Each card shows the order reference, product, a safe customer name (first name and initial), how long it has waited, and one button. Purchase approval cards also show:
- customer paid
- expected fulfilment
- estimated contribution
- destination country
- payment VERIFIED
- MCB checks PASSED

**Buttons open, never act.** The button only changes the page's URL fragment (`#view=orders&order=MCB-…&open=quality|approve|decide|card`). Links are validated, and unknown values are ignored.

## 5. Quality checks

**Song (`view=quality`).** The review shows:
- title, target length and actual length;
- requested style and emotional direction;
- protected names and pronunciation notes;
- the customer facts to check against, and the lyrics;
- a *Listen* button, which fetches the candidate with the staff key (audited).

Founder questions map onto every Creative QC criterion:

| Question | Criteria |
|---|---|
| Story correct? | story_fit |
| Names and details correct? | lyric_quality |
| Song sounds professional? | production_quality |
| Vocals good? | vocal_quality |
| Emotion right? | emotional_impact |
| Music and style right? | musical_quality, genre_fit |
| Pronunciation right? | pronunciation |
| Good enough for MCB? | premium_standard, memorability |

Decisions:
- **Pass:** creative QC passes, and the candidate becomes the production master (file unchanged).
- **Send back for internal rework:** REGENERATE.
- **Escalate:** raises a creative exception.

A "no" answer cannot pass. The customer is never asked or contacted.

**Artwork.** The review shows the artwork beside the customer's source photographs, with product, title, names, dates, occasion and print previews. Questions: correct customer? correct photo? names and dates? spelling and title? composition? important content safe and readable? premium standard? faces visible (or no faces)? MCB branding (or none used)? Together they cover every visual QC criterion. Decisions are Pass, Rework or Escalate, through `production_visual_qc`.

The **final MCB check** (the order-level checklist) still opens in the staff console.

## 6. Order command card (`view=order`)

**Summary:** order, customer, product, paid, current stage, next step, time in stage, expected contribution, delivery status, problems (yes/no).

**Expandable sections:** Creative, Artwork, Production, Fulfilment, Customer (name, email, open problems, emails), Financial (ESTIMATED and ACTUAL), History, Advanced / technical.

**Forms on the card** (explicit, never automatic):
- **Supplier purchase approval:** decision details, founder, code, the acknowledgements only where needed, and confirm.
- **Founder decisions:** founder-only resolutions need the founder's code.

## 7. Revenue and profit

**Paid revenue.** Comes from the payment record, not checkout value, for Today, This week and This month.
- Gross paid, refunds, net paid.
- Refunds only where an order is recorded REFUNDED (whole order; no partial refund or refund date is recorded).
- TEST payments are shown apart and are never revenue.

**MCB profit snapshot.** ESTIMATED and ACTUAL are kept apart. Each shows revenue, fulfilment cost, gross contribution and contribution %, over physical orders that have cost data.
- Orders awaiting cost data are counted, never treated as zero cost.
- Digital orders are not costed.
- VAT, payment fees, creative time and marketing are excluded.
- Contribution is never called net profit.

## 8. Pipeline, customers, health, readiness

**Pipeline.** New, Creating, Quality check, Ready for fulfilment, Being made, On the way, Delivered, with counts. Clicking a stage filters the order list.

**Customers needing help.** Open reports ranked damaged, wrong item, manufacturing defect, delivery, incorrect detail, question; plus delivery exceptions with no report. Each shows its age. A report stays until resolved, even on a completed order. List views never show the customer's description.

**System health.** *All good* or *Action needed*, covering:
- stranded paid orders
- notifications not delivered
- supplier orders not placed 48 hours after authorisation
- overdue tracking
- overdue delivery
- unresolved exceptions
- failed customer emails
- configuration missing

No raw logs are shown.

**Launch readiness.** READY only where the server can see the thing is in place:

| Item | Status now |
|---|---|
| Supplier routes | NEEDS FOUNDER ACTION until verified routes cover every physical product |
| Manufacturer templates | NEEDS EXTERNAL VERIFICATION |
| Vinyl capacities | NEEDS EXTERNAL VERIFICATION |
| Commercial safety rule | NEEDS FOUNDER ACTION until configured |
| Founder authorisation | READY / PARTIAL / NOT READY, from the configured codes |
| Notification bridge | NOT READY without a key; NEEDS EXTERNAL VERIFICATION until Telegram has delivered |
| Music platform | NEEDS FOUNDER ACTION |
| Artwork production | DEFERRED |
| Hosting upload limits | NEEDS EXTERNAL VERIFICATION on the live host |
| Legal review | NEEDS EXTERNAL VERIFICATION |
| Live payment verification | NEEDS EXTERNAL VERIFICATION until a live payment is recorded |

## 9. Mozart AI

Founder decision: **Mozart AI** is MCB's intended music-production platform.

| Field | Value |
|---|---|
| Decision | FOUNDER SELECTED |
| Account | NOT YET OPENED |
| Integration | PENDING |

- **Registry entry:** kept in the existing provider registry, still `role: DISABLED`, `adapter: null`, every capability UNKNOWN.
- **Route:** generation still routes to AWAITING_PROVIDER, with manual generation.
- **Nothing else wired:** no credentials, configuration, pricing or API assumption, and nothing calls it.

## 10. Approvals, search, notifications

**Approvals.** Only Bella's and Lewis's decisions, pending and decided (who and when). Staff tasks are excluded.

**Search.** By reference, customer name, email or product, for paid orders only. It needs the CRM key, returns safe list fields, and never records the search text.

**Notifications.** From the existing outbox, filtered Needs action / Delivered / Failed / All. Each notification shows its channel as Telegram, Email fallback, Staff queue or Not delivered yet. Telegram shows *Connected* only once a notification has actually been delivered by Telegram.

## 11. Mobile, brand, accessibility

- **Mobile first.** One column at 390 px, with no page overflow. The navigation scrolls inside its own bar. Buttons and radio choices are at least 48 px tall, and tables are replaced by cards.
- **Brand.** Midnight Ink header, Ivory ground, Heritage Gold accents and focus rings, serif headings.
- **Accessibility.** Skip link, labelled navigation with `aria-current`, `aria-pressed` on period, filter and pipeline controls, fieldsets for questions, statuses in words with a symbol (never colour alone), and alert and status regions for messages.
