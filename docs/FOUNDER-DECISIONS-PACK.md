# Founder decisions pack — before production launch

Sprint 7 · 15 September 2026 · For Bella and Lewis. This is decision support, not legal advice. Nothing here sets a policy.

## 1. Retention decision table

"Deletion supported" describes the software today. No automated deletion or anonymisation exists; the method is designed in `docs/DATA-RETENTION-ARCHITECTURE.md` and would be built once periods are decided.

| Category | Where held | Why MCB holds it | Needed after the order is completed? | Deletion / anonymisation today | Decision still needed |
|---|---|---|---|---|---|
| Account / order identity (name, email, phone) | `customers`, `orders` | Contact about the order; confirmation; support | Partly: to answer later questions and link to accounting records | Manual only (database edit); design ready | How long to keep contact details after completion; whether to anonymise rather than delete |
| Delivery address | `delivery_addresses` | Posting physical items; delivery problems | Until any delivery/damage issue is settled | Manual only; design: delete the row | Period after delivery before deletion |
| Story / personalisation text | `order_memories`, plaque/frame text, legacy `brief_*` | Creating the music and artwork; correcting a genuine error; re-issues | Useful if a customer asks for a remake or re-send; otherwise no | Manual only; design: blank text, keep structure | Keep for re-issues, or remove after a set period? |
| Customer uploads / photos | `order_uploads` + private `mcb-uploads/` | Artwork, plaques | Only until artwork is final and delivered | Manual only (delete file then row); design ready | Period after completion; include backups |
| Legacy approval feedback (change requests, retired model) and quality-check notes | `order_change_requests.feedback` (historical only), `order_staff_notes` | Evidence of what was asked (legacy); internal corrections | Only as evidence if a dispute arises | Manual only; design: blank text | Period |
| Support / problem reports | `order_service_requests.description` | Resolving damaged/faulty or delivery issues | Until resolved plus any claim period | Manual only; design: blank text | Period after resolution |
| Transaction / accounting records | `orders` amounts, `order_items`, `checkout_sessions`, `stripe_events`, `unreconciled_payments` | Accounting and tax obligations; payment disputes | Yes, for the period accounting/tax rules require | Not to be deleted early; later anonymise contact fields | Confirm the applicable period with an accountant |
| Consent evidence | `order_consents` (terms version, time, IP hash, user agent) | Showing what was agreed | Yes, while claims could arise | Manual; design: drop user agent later | Period |
| Audit / security records | `order_events`, `operations_events`, acknowledgements, `customer_communications`, rate-limit hashes | Accountability; troubleshooting; abuse prevention | Yes (contain no customer text by design) | Rate-limit rows auto-prune after 1 day; others manual | Period, or keep with the order record |
| MCB LIVE / Bespoke enquiries | `live_enquiries`, `concierge_enquiries` | Replying; preparing quotes/proposals | Only if the enquiry becomes work, or for a short follow-up time | Manual only; design: anonymise | Period for enquiries that did not proceed |

After deciding: update the Privacy Policy "How long we keep it" section, then commission the deletion tool described in the architecture document.

## 2. Shipping data required to activate physical commerce

*Updated for the launch closure patch, 15 September 2026.*

Today no production delivery rate exists, so every physical order is quoted "unavailable" and **cannot be paid live**; TEST-only rates are refused with a live key. A Moment needs no shipping and is unaffected.

**Internal shipping estimates (£8 / £10 / £20 and similar) are planning allowances, not customer prices. Never put them in this file.** Only a delivery charge the Founders have decided to show customers belongs here.

### How each kind of item is priced (server-side, never shown to customers)

| Delivery class | Products | Default state | Priced online when | Staff must confirm availability, destination and real delivery cost before placing the partner order |
|---|---|---|---|---|
| VINYL | Keepsake (4), Journey (2) | Destination-calculated | A rate covers the destination (a general rate or one naming `VINYL`) | No |
| FRAME | Lyrics Frames (5) | Destination-calculated | A rate **naming `FRAME`** covers the destination | No |
| PLAQUE | Personalised Music Plaque | **MCB confirms delivery before payment** (manual review) | Only if the table sets `"pricing": {"PLAQUE": "DESTINATION_CALCULATED"}` **and** a rate naming `PLAQUE` covers the destination | Yes |
| PLAYER | 3 gramophones / record players | **MCB confirms before payment** (listing-dependent) | Only with a `pricing` promotion **and** a rate naming `PLAYER` | Yes |
| CARD | Pop-up cards (not yet in the catalogue) | **MCB confirms before payment** (listing-dependent) | Only with a `pricing` promotion **and** a rate naming `CARD` | Yes |

When an order holds an item MCB must confirm, the Review page names the item, says nothing has been charged, and offers email and WhatsApp (+44 7340 742009). The customer can remove the item and pay for the rest. Nothing is estimated.

### Rate table (`api/data/delivery-rates.json`, uploaded to the server only)

```json
{
  "currency": "GBP",
  "pricing": { "PLAQUE": "DESTINATION_CALCULATED" },
  "rates": [
    { "id": "UK_VINYL",     "label": "UK tracked delivery",  "countries": ["GB"], "classes": ["VINYL"],  "first_item_minor": 0, "additional_item_minor": 0 },
    { "id": "UK_FRAME",     "label": "UK frame delivery",    "countries": ["GB"], "classes": ["FRAME"],  "first_item_minor": 0, "additional_item_minor": 0 },
    { "id": "IN_PLAQUE",    "label": "Plaque delivery",      "countries": ["IN"], "classes": ["PLAQUE"], "first_item_minor": 0, "additional_item_minor": 0 }
  ]
}
```

(The zeros and countries are placeholders, not proposals. `pricing` is optional; leave a class out to keep "MCB confirms".)

| Field | Meaning |
|---|---|
| `countries` | ISO country codes, or `"*"` for everywhere else. Leave a destination out to have MCB confirm delivery there instead of charging. |
| `classes` | Which delivery classes the rate applies to. A rate without `classes` applies to **vinyl only**. |
| `label` | What the customer sees at Review. Do not name a partner. |
| `first_item_minor` / `additional_item_minor` | Pence, GBP. `0` means verified free delivery. |

Different classes are charged separately and added together (they may come from different partners in separate parcels). If any physical item in an order has no rate for the destination, the whole order waits for MCB to confirm delivery.

Also needed before physical launch (operations, not code): which partner fulfils each physical product, and how staff place, confirm and pay for those orders by hand.

## 3. Legal / policy gap inventory

Each line is an exact mismatch between current wording and actual site behaviour or other published wording. Classification: **T** technical defect (fixed this sprint), **F** Founder/policy decision, **L** professional legal review.

| # | Where | Mismatch | Class |
|---|---|---|---|
| 1 | Terms §8 "We at MCB do not take any responsibility for courier damages…" | **Corrected in the launch closure edition 2026-09-15** with the Founder-approved fulfilment and damage wording. Legal review of the new wording still required. | T (done) + L |
| 2 | Refunds / Terms §17 "within 24 hours of the delivery date … at a reasonable discount price" | **Corrected 2026-09-15**: no 24-hour condition; partner claim windows are MCB's to manage. Founders to confirm removing "a reasonable discount price". | T (done) + F + L |
| 3 | Terms §7 "There is a no refund policy" | **Corrected 2026-09-15**: "for a change of mind" plus a damaged/faulty/not-as-described carve-out. Legal review still required. | T (done) + L |
| 4 | Terms §4 "As soon as a song goes to Vinyl pressing, no refinements can be made" | **Corrected 2026-09-15**: refinements close at approval. | T (done) |
| 5 | Terms §5 | **Superseded 2026-09-15.2** by "Personalised production and the reveal" (Single Creative Authority). | T (done) |
| 6 | Privacy "How long we keep it" | No periods stated; see §1. | F + L |
| 7 | Privacy cookies | **T — fixed in Sprint 7:** analytics now loads only after consent; the policy text, storage list (stale keys removed; consent key added) and processor list (reCAPTCHA added) now match the code. Whether analytics may run without consent under current UK law (including the Data (Use and Access) Act 2025 changes) is a legal question; the site now takes the conservative route. | T (done) + L |
| 8 | Customer copy written in Sprints 5–6 said "that is ours to put right" | **T — fixed in Sprint 7:** now "tell us — your normal consumer rights are not affected", which does not contradict the Terms while #1 is decided. | T (done) |
| 9 | Unsupported marketing claims (Press "collaborates with media outlets…", Artists "global network", "professional musicians") | **T — fixed in Sprint 7:** softened to factual wording. | T (done) |
| 10 | 2026-09-14 Privacy/Refunds edition | Not yet approved by the Founders or reviewed (`review.ts`). | F + L |
| 11 | Cancellation classification / digital-content consent | Existing BLOCKING review items; no software mismatch found (consents are recorded as designed). | L |
| 12 | Terms §23 "Any change applies to orders placed before and after" | Contradicted clauses 2 and 25. **Corrected 2026-09-15**: future orders only. | T (done) + L |
| 13 | Terms §18 "MCB has no responsibility for death or personal injury caused by neglect or defective products" and §20 "full responsibility if anything happens regarding a legal case" | Substantive liability terms, left exactly as the Founder wrote them. | F + L |

## 4. Other Founder account actions

- Google Analytics: turn off **Google signals** and **"Page changes based on browser history events"** (the app sends its own page views; the site blocks advertising pixels regardless).
- Resend: verify the sending domain.
- Stripe live: register the webhook (runbook step 8); public name already "My Custom Beats".
- Decide whether to keep `/luxury/` deployed (it is unlinked, non-indexed, isolated; it loads stock photos from images.unsplash.com, which receives visitors' IP addresses).

## 5. Single Creative Authority (15 September 2026) — items still open

| # | Item | Class |
|---|---|---|
| 14 | Creative Authority checkout statement (Founder wording, implemented verbatim) — enforceability and fairness under UK consumer law; EU/US destinations | L |
| 15 | Terms 2026-09-15.2 clauses 4–7 and 9, Refunds 2026-09-15.2 and Privacy 2026-09-15 — Founder approval of the rendered wording and legal review | F + L |
| 16 | £15 MCB Artwork Preparation Service is implemented **once per order** (the brief did not say per photograph) — confirm | F |
| 17 | Photo requirement implemented as **at least one photograph per Keepsake record and per Journey** (square, ≥ 2500 × 2500 px within 1%, or the service); the plaque keeps its own required photo without the square rule — confirm | F |
| 18 | Retention period for quality-check notes (internal) — add to §1 decisions | F |

## 6. Automation Foundation (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 19 | Each founder chooses a personal authorisation code (12+ characters) and supplies only its `password_hash` for `founders.BELLA` / `founders.LEWIS`. Without one, no supplier purchase can be authorised. | F |
| 20 | Telegram / TaskNotify bridge: who builds and hosts it, bot and chat identity, and the worker key. The outbox contract is ready (`docs/AUTOMATION-FOUNDATION-20260915.md` §5). Email fallback recipient. | F |
| 21 | Manufacturer artwork data still missing: Heart dieline; double-gatefold template (Journey 12); picture-disc pixel canvas / resolution; 10- and 7-inch centre-hole diameters; sleeve safe-area and trim values. Until supplied these stay TEMPLATE_REQUIRED or shape-checked only. | F |
| 22 | Journey 6 uses the supplied single 12-inch sleeve front/back templates — confirm that is the sleeve the Journey 6 is made in. | F |
| 23 | Artwork Preparation Service: more than one unready photograph in an order is routed to an internal exception (no automatic extra charge) — confirm the threshold of one. | F |
| 24 | Largest production file size to register (currently 10 MB, the PHP upload limit) — raise the server limits if print files are larger. | F |

## 7. Creative Factory (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 25 | Music-generation provider: DEFERRED. Choosing one needs commercial-use, privacy and cost review, then an adapter. No key or account exists. | F + L |
| 26 | Manufacturer-verified programme capacity per record format (per side and/or total, hard maximum, source, date). Until supplied every record is CAPACITY_UNVERIFIED. | F |
| 27 | When to switch `creative.enforcement` from ADVISORY to REQUIRED (then songs must be mastered in the factory, album QC passed and capacity verified before MCB's quality check). | F |
| 28 | Generation attempts per song before a creative exception (default 3), and an optional preferred finished-song window around 195 s. | F |
| 29 | Retention period for creative material (ledgers, lyrics, candidates, masters, access logs). NOT SET pending legal review. | F + L |
| 30 | Minimum production sample rate (default 44.1 kHz) and the archival master format (no format is mandated). | F |

## 8. Production File Factory (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 31 | Artwork generation provider: DEFERRED (manual design today). Any future AI artwork must preserve the customer's people and content and remain subject to visual QC. | F + L |
| 32 | Manufacturer data still required: picture-disc pixel canvas (all sizes), 10- and 7-inch centre holes, heart dieline, double-gatefold template, safe-zone insets and trim for every format. Until supplied: MANUFACTURING_DATA_REQUIRED or manual safe-zone review. | F |
| 33 | Internal supplier order data (`api/data/supplier-orders.json`: supplier, product URL, configuration, estimated cost, delivery provision, destination limitations) — uploaded to the server only. | F |
| 34 | Hosting: confirm the host honours `api/crm/.user.ini` / `.htaccess` upload limits (260 MB), execution time and disk space for production files; otherwise raise the limits with the host. | F |
| 35 | MCB brand guidelines for artwork (where the brand appears, wordmark usage) — not in the repository. | F |
| 36 | Audio probing (e.g. an ffprobe-capable worker) so MP3 durations can be verified; until then WAV/FLAC/AIFF for production masters. | F |

## 9. Fulfilment Controller (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 37 | Supplier routes (`api/data/supplier-routes.json`, server only): per SKU — route id, supplier, product URL, configuration, supported / check-required / unsupported destinations, shipping model, expected purchase cost, expected supplier shipping, contingency and handling allowances, production and delivery estimates, tracking capability, customs, order instructions, cancellation cut-off, damage reporting, replacement route, authorised fallback, verification source and date. Until supplied: COMMERCIAL_DATA_REQUIRED and DESTINATION_UNKNOWN on every decision card. | F |
| 38 | Commercial safety rule: minimum expected contribution (default 0 = negative only), optional minimum margin, and whether a breach suspends new sales (default off). | F |
| 39 | When to switch `creative.enforcement` to REQUIRED. Under REQUIRED, an unknown destination, missing route data or an unresolved commercial safety exception block authorisation (the decision card lists what would block today). | F |
| 40 | Notification bridge: TaskNotify/Telegram credentials and the email fallback are not in the repository; the outbox accepts TELEGRAM, EMAIL_FALLBACK and STAFF_QUEUE acknowledgements. | F |
| 41 | Retention of support evidence, content permissions and economics snapshots — NEEDS PROFESSIONAL LEGAL REVIEW. | L |
| 42 | Review destination and marketing-content consent wording for customers (permission is recorded separately from reviews) — NEEDS PROFESSIONAL LEGAL REVIEW. | F + L |

## 10. Founder Command Centre (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 43 | Business timezone: none is configured, so "today" and "this week" (Monday start) are UTC. Choose a timezone if UK local days are wanted. | F |
| 44 | Mozart AI (founder selected): open the account, then verify its interface, output formats, commercial-use and privacy terms and cost model before any integration is designed. Until then songs are produced manually. | F + L |
| 45 | Refunds: only whole-order REFUNDED status is recorded; partial refunds and refund dates are not. Decide whether refunds should be recorded in MCB. | F |
| 46 | Who uses the Command Centre (Bella, Lewis, staff) and whether separate founder and staff sign-ins are wanted (today one CRM key plus a named person). | F |

## 11. Memory Music Video (15 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 47 | Moment price — **decided (15 September 2026)**: Moment is £15 GBP; with one optional Memory Music Video (£49) the order is £64. | Decided |
| 48 | Verify the video platform's real allowance (videos per period), how and when it resets, the maximum video/song length, output formats and resolution, commercial-use and privacy terms and cost, then set `video.capacity_per_period` and mark the period basis VERIFIED. Until then: 45 and 4 minutes are planning figures. | F + external |
| 49 | Songs longer than 4 minutes (MCB allows up to 5): until the platform's maximum length is verified, no full-song film is promised — staff escalate to the Founders (`VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED`). Nothing shortens the song. | F + external |
| 50 | Cancellation and refund wording for personalised video production — NEEDS PROFESSIONAL LEGAL REVIEW. | L |
| 51 | Whether to open "join the next available video period" to customers (the architecture exists; nothing is charged for a future period without the customer's explicit agreement). | F |
| 52 | Price testing (£49 / £59 / £69): metrics are collected; no price changes automatically. | F |

## 12. Customer Care & Recovery (16 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 53 | Customer care mailbox: confirm hello@mycustombeats.com receives mail (replies to every MCB email now go there), and keep support@mycustombeats.com forwarding to it for replies to earlier emails. Optionally set `mail.support_address`. | F |
| 54 | Retention periods for support messages, evidence, refund records and privacy reviews — NEEDS PROFESSIONAL LEGAL REVIEW (nothing is deleted meanwhile). | L |
| 55 | Privacy incidents (another customer's details sent to someone): who is notified and when, and any reporting obligations — NEEDS PROFESSIONAL LEGAL REVIEW. The system records the review; it draws no legal conclusion. | L |
| 56 | Refunds are decided by Bella or Lewis in Customer Care and made in the payment provider's dashboard, then recorded. Confirm this manual flow (no refund API is connected). | F |
| 57 | Recovery cooling period before any review request after a resolved problem (default 30 days, `support.review_cooling_days`). | F |
| 58 | Cancellation and refund wording for personalised items, and when a creative preference could ever justify goodwill — NEEDS PROFESSIONAL LEGAL REVIEW. Nothing is offered automatically. | L |

## 13. Business & Profit Intelligence (16 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 59 | ~~Business timezone~~ **DECIDED 16 Sept: Europe/London** (the business reporting timezone, never derived from where Bella or Lewis are). | Decided |
| 60 | ~~Payment fee model~~ **DECIDED 16 Sept: ACTUAL-FIRST.** Record each order's actual payment fee; until then it is UNKNOWN / AWAITING DATA, never £0. No fee model exists. | Decided |
| 61 | Commercial alert thresholds — **DECIDED 16 Sept: deliberately NOT CONFIGURED** for now (negative-contribution and commercial safety protection still apply). Revisit later. | Deferred |
| 62 | The early-data line — **DECIDED: keep 30 orders**, a display safeguard only, not statistical significance. | Decided |
| 63 | Memory Music Video production cost — **UNKNOWN** until the platform economics and real workflow are verified. | External |
| 64 | Memory Music Video price — **DECIDED: £49 launch price is authoritative; no £59 / £69 test.** | Decided |

## 14. Supplier Intelligence & Commercial Routing (16 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 65 | Upload the private `api/data/supplier-routes.json` to the server (never the repository): every route's partner, private link, product reference, route type, destinations and per-country evidence, verification source and date, costs, internal allowances, availability, risks, fallback. A route is VERIFIED only with a source and a date. | F |
| 66 | ~~Route verification freshness~~ **DECIDED 17 Sept: 30 days** (a route verified more than 30 days ago is STALE → reverify; paid orders never disabled). | Decided |
| 67 | ~~The 18 pop-up card listings~~ **CORRECTED 17 Sept: the 18 cards were already decided and are now catalogued** (names and prices in docs/SECURITY-RESILIENCE-20260917.md). Still to supply: an approved image per card; routes stay VERIFICATION_REQUIRED until evidenced. | F (images) |
| 68 | Confirm the five frame / wall-art configurations the frame routes supply are the catalogue's Lyrics Frames (or supply the correct products). | F |
| 69 | ~~New-sale commercial safety enforcement~~ **DECIDED 17 Sept: REQUIRED.** A new physical sale without enough evidence (route, destination, cost, manufacturing data) is confirmed by MCB before payment; digital products are never affected. | Decided |
| 70 | Manufacturing data from the partners: vinyl programme durations, safe areas, trim, disc pixel canvases, 10" and 7" centre holes, the Heart dieline and the Gatefold template. | External |
| 71 | The £1,000 gramophone: **DECIDED 17 Sept** — before authorisation, a person records the verified delivered cost, currency, availability, destination support and evidence (the system requires all five). | Decided (per order) |

## 15. Security, Resilience & Automation Readiness (17 September 2026) — items for the Founders

| # | Item | Class |
|---|---|---|
| 72 | Supply the manufacturer's disc pixel canvas (12", 10", 7"), the Heart dieline and the Gatefold template. Under REQUIRED safety those products are confirmed by MCB before payment until then. | External |
| 73 | Individual staff accounts (or host-level authentication in front of the Command Centre) before the team grows; rotate the staff key on any staff change. | F |
| 74 | Malware scanning of uploaded photos and evidence (host antivirus or a scanning service) — not present today. | F + external |
| 75 | Enable HSTS once every mycustombeats.com host serves HTTPS. | F (host) |
| 76 | A controlled dependency update (React Router ≥ 7.18.2 and build tooling). | Tech |
| 77 | An independent penetration test of the production host before or shortly after launch. | External |
| 78 | Approved images for the 18 pop-up cards. | F |
