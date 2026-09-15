# MCB™ Memory Music Video

15 September 2026 · branch `mcb-release-candidate-20260914` · baseline `e6886a34`.

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO MOZART CALL OR PURCHASE. NO REFUND. NO SECRETS.**

## 1. Product

**MCB Memory Music Video™ — £49.** An optional digital enhancement that turns one personalised MCB song and the customer's photographs and memories into a finished memory film.

- **Scope:** one purchase is one film for one selected song.
- **Not included:** never part of Moment, Keepsake or Journey.
- **Never automatic:** never preselected, and never multiplied across a multi-song package.

**Catalogue.** SKU `memory-music-video`, category `VIDEO_ENHANCEMENT`, fulfilment `DIGITAL`. Because the video is DIGITAL, a Keepsake or Journey order with a video also asks for the digital-content consent. The public feed lists it as optional, chosen before payment, one per order at launch, with limited monthly availability.

> **Moment price (Founders' correction, 15 September 2026).** Moment is **£15** GBP (`moment` 1500). Moment + one optional Memory Music Video (£49) = **£64**. Server checkout charges exactly this; a regression test (`tests/moment-price.test.mjs`) keeps it so.

## 2. Where it is offered

**Placement.** The offer is the first card on **Finishing touches**, after personalisation and before review.
- **Moment:** strongest styling, Midnight Ink with Gold.
- **Keepsake and Journey:** a lighter card.

**Copy.** "Make your memory a film · MCB Memory Music Video™ · Your memory. Your song. Your film." — plus the film description, what it is ideal for, "Optional enhancement — £49" and the server's availability message.

**Choosing.** The customer must press **Add my Memory Music Video — £49**.
- On a multi-song order they then choose which song (default: the first).
- They can remove it at any time.
- When the period is fully booked the button is disabled: "Memory Music Video is fully booked for this production month."

**Review.** The review lists the video, and for which song.

## 3. Server rules

**Pricing** (`price_order_lines`):
- The video needs a song experience in the order.
- Quantity may not exceed the number of songs or the launch limit (1).
- Otherwise the order is refused with `memory_video_ineligible`.

**Personalisation.**
- The chosen memory carries `video: true`.
- The video line's quantity must equal the number of chosen songs.
- A line without a choice, or a choice without a line, is refused.

**Stored choice.** `video_entitlements` holds order, item, unit, memory, price and status, starting at AWAITING_PAYMENT.

**Availability.** An order with a video is refused (`video_capacity_full`) when the period is already fully booked. The authoritative check is the locked hold at checkout.

## 4. Duration and master protection

| Song | Result |
|---|---|
| ≤ 240 s (planning maximum) | `VIDEO_DURATION_ELIGIBLE` → production required |
| > 240 s (MCB allows songs up to 300 s) | `VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED` → no film for the full song is promised or started until the platform's maximum is verified; staff can only `ESCALATE_TO_FOUNDERS` (corrected 16 September 2026) |

**Nothing edits the MCB Production Master.** Nothing trims, speeds up, compresses, fades early, removes sections or overwrites it.
- **Lineage.** The job records the master's id, version, SHA-256 and duration.
- **Change check.** Registering a video is refused if the song's current master is no longer that one.
- **Staff download.** Staff download a read-only copy for production (audited).
- **Video Master.** The final Video Master is a byte-for-byte copy of the checked candidate, verified by hash, versioned, never overwritten (older versions stay, marked not current).

The 240-second limit is a **founder-supplied planning limit, pending external verification**, never described as a verified platform capability.

## 5. Capacity

**Periods.** Capacity periods are stored rows (`video_capacity_periods`).
- **Model:** the planning model is CALENDAR_MONTH; basis `PENDING_VERIFICATION`.
- **Capacity:** from `video.capacity_per_period`, defaulting to the Founders' planning figure of 45.
- **Future periods:** can be defined (future only, no overlap), so changing boundaries never moves a reservation.
- **Capacity changes:** a period's capacity cannot go below the spaces in use.

**Reservation ledger** (`video_capacity_reservations`, one row per entitlement):

```
checkout session  → HELD (period row locked FIRST; refused if full; 24 h 30 min, longer than a Stripe session)
payment (webhook) → RESERVED   (own locked transaction after the PAID commit; idempotent; retried on 1020/1205/1213)
video master      → COMPLETED
abandoned hold    → EXPIRED    (when it lapses; the space is offered again)
cancelled early   → RELEASED   (a person, with a reason, only before production starts)
```

**No overselling:**
- **Concurrent checkouts** queue on the period lock. Tested: three checkouts for the last space, exactly one succeeds, the others get 409 and no Stripe session.
- **A replayed or resent webhook** changes nothing.
- **A payment after its hold lapsed and the space was taken** becomes `CAPACITY_EXCEPTION`: the order stays paid, the Founders get `VIDEO_EXCEPTION`, and nothing is refunded or oversold.
- **Resolving that exception.** `ALLOCATE_CAPACITY` places the video in a period that has a space, only with the customer's recorded agreement. No future period is ever charged automatically (the waitlist architecture).

**What the customer is told:**
- "Limited monthly availability."
- The real number of spaces, only when 10 or fewer remain.
- "Fully booked" when full.

It is never invented, and the browser never calculates it.

## 6. Production (manual, provider-independent)

**Job states:** `INPUT_REQUIRED → READY → PRODUCTION_REQUIRED → PRODUCTION_IN_PROGRESS → CANDIDATE_READY → QUALITY_CHECK_REQUIRED → (REWORK_REQUIRED) → READY_FOR_REVEAL → REVEALED`, plus `EXCEPTION`. There is no customer approval state.

**Inputs** (`crm/video`):
- the order reference and product, song number and title;
- the protected audio master reference;
- the customer's video photographs and the memory photograph;
- the memory (story, about, occasion) and facts (names, dates, places, occasion, relationship);
- visual direction, the artwork (if any), MCB branding direction, and the planning limits.

**Never included:** address, phone, email, payment, supplier economics or credentials — nor would a future platform integration ever be given them.

**Manual workflow** (Operations → MCB Memory Music Video):
1. Confirm inputs (or the customer marks their photographs done).
2. Resolve the duration review if needed.
3. Start production (MANUAL).
4. Make the film on the chosen platform.
5. Register the MP4/MOV. MCB reads its duration and picture size from the file headers, checks it covers the whole song (±3 s), and records its hash and lineage. Cross-order registration is refused.
6. MCB quality check.
7. Reveal.

**Platform:** Mozart AI — FOUNDER_SELECTED, account NOT_OPENED, integration PENDING, video capabilities PENDING_EXTERNAL_VERIFICATION. No API call, endpoint, credential, scraping or browser automation exists.

## 7. Video quality check

**Criteria:** correct customer, correct song, complete song, correct photographs, names and details, image timing, transitions, no visual defects, no wrong-customer media, audio/video sync, visual quality, emotional impact, premium standard, and branding (may be not applicable).

**Where it is done:**
- **Command Centre:** the founder watches the film and answers fourteen plain questions.
- **Staff console:** the same check, criterion by criterion.

**Decisions:**
- **Pass:** creates Video Master vN and completes the space.
- **Send back for internal rework:** internal only; the customer is not contacted.
- **Escalate:** VIDEO_EXCEPTION.

A "no" cannot pass. Every decision is audited (`FOUNDER.QUALITY_REVIEWED`, kind VIDEO).

## 8. Customer experience

**Order page states:** "Add photographs" → "Being made" → "Ready".

**Photographs:**
- Separate rules from print artwork: JPEG/PNG/WebP/HEIC, up to 30, 10 MB each, at least 720 px on the shorter side, landscape preferred.
- The customer confirms: "I confirm I have the right and any permission needed to provide these photographs so MCB can use them privately to make my video. This does not give MCB permission to use them publicly."
- A hash of that statement is stored with each photograph.
- Marketing permission stays separate (`customer_content_permissions`, untouched).

**Delivery:**
- The film plays and downloads through **ten-minute signed links** (HMAC over order, master, expiry, disposition), with Range support, `no-store` and `noindex`.
- There is no permanent or public URL. Another order's token cannot reach it.
- Every view or download is logged with its version.
- VIDEO_READY email on reveal (once).

**Content Security Policy.** Staff players load authenticated files as `blob:` URLs. The browser rehearsal found that `media-src 'self'` blocked them — the Command Centre's song player was affected too. The policy is now `media-src 'self' blob:`, and nothing wider.

## 9. Commercial record and metrics

**Per video:** selling price (entitlement), capacity reservation and period, production method, production cost only when recorded (`RECORD_PRODUCTION_COST`), rework count, production times, contribution where cost is known. A platform allowance is **not** treated as free.

**Offer counters** (per day, product, event — no personal data): OFFER_VIEWED, SELECTED, DESELECTED. GA receives `video_offer_view`, `video_select`, `video_deselect` and `video_purchase` with product/SKU only.

**Internal metrics** (`crm/video?view=metrics`, Command Centre → Videos):
- impressions, selection rate, purchase rate
- video revenue, average selling price
- capacity utilisation, production time
- rework rate, QC failure rate
- contribution where known

No price changes automatically (future £49 / £59 / £69 comparisons).

## 10. Command Centre

**Videos view and MCB Today panel:** video orders, awaiting input, ready to make, being made, needs quality check, ready, delivered, needs attention.

**Capacity:** planned, reserved (including checkout holds), completed, remaining — labelled **PENDING MOZART VERIFICATION**.

**Attention cards:**
- video input required (after 48 h)
- video production required
- video quality check required
- duration review
- video capacity low or full
- video exception
- paid without a space

**Readiness:** "Memory Music Video capacity — Needs external verification".

## 11. Database — prepared, not run

`db/migrations/2026-09-15-memory-music-video.sql` is additive and idempotent. Applied to the previous schema it equals a fresh `db/schema.sql` (tested).
- **Tables:** `video_entitlements`, `video_capacity_periods`, `video_capacity_reservations`, `video_jobs`, `video_media`, `video_candidates`, `video_masters`, `video_access_log`, `video_offer_counters`.
- **ENUM addition:** `customer_communications.message_type` adds `VIDEO_READY`.

## 12. Cancellation

Personalised-production cancellation terms remain subject to legal review. No absolute no-refund wording was added.
- **Before production:** a person may release the space with a reason (RELEASED, entitlement CANCELLED, audited). No refund is issued by the system.
- **After production starts:** the space cannot be released, and consumed capacity is never recycled.
