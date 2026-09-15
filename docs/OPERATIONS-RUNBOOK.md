# MCB operations after payment — runbook

Sprint 5 · 14 September 2026 · **Updated for Single Creative Authority, 15 September 2026** · Not deployed.

This is how a paid order is worked through to completion, what the system does automatically, and what it deliberately leaves to a person. The principle is **automate the normal, surface the exceptions**: every routine step is one action and at most one idempotent, one-way email; everything unusual appears in the queue.

**There is no customer approval loop.** The customer provides the story, preferences and photographs and grants MCB creative authority at checkout. MCB creates, runs its own **internal quality check**, and then reveals (digital) or manufactures and delivers (physical). Customers never approve drafts, and subjective revisions are not included.

Staff console: **`/operations`** (CRM key + your name; the key is kept in the tab's memory only). The same actions are available through the API below.

## 1. One state model

| Record | Column | Answers |
|---|---|---|
| Payment | `orders.status` | Has MCB been paid? (PENDING, PAID, PAYMENT_REVIEW …) |
| Creative work | `order_production.stage` | Being created, in the quality check, or passed? |
| Digital reveal | `order_production.revealed_at` | Has the customer been sent their creation? |
| Physical side | `order_production.fulfilment_state` | Has the keepsake been placed, sent, delivered? |

The **operational state** is derived from those columns (`src/data/operations.ts`, `public/api/lib/operations.php`) and never stored separately.

| Operational state | Digital (Moment) | Physical (Keepsake, Journey, add-ons) |
|---|---|---|
| `CREATIVE.PENDING` (**new order ready for processing**) → `CREATIVE.IN_PROGRESS` | ✓ | ✓ |
| `QUALITY_CHECK` | ✓ | ✓ |
| `REVEAL.READY` → `REVEALED` | ✓ | — |
| `FULFILMENT.NOT_REQUIRED` | ✓ (fulfilment column) | — |
| `FULFILMENT.PENDING` → `.READY` → `.CONFIRMED` | — | ✓ |
| `DISPATCHED` → `DELIVERED` (the reveal) | — | ✓ |
| `FOLLOW_UP.DUE` → `COMPLETED` | ✓ | ✓ |

`ORDER.PAID` appears only for a paid order that has no production record (from before that table). Every verified payment records `ORDER.READY_FOR_PROCESSING` and, if the operations webhook is configured, sends `notification: NEW_ORDER_READY_FOR_PROCESSING` (no story, photo or contact details).

**Legacy records** from the retired approval model keep their evidence: `SONG_READY`, `AWAITING_APPROVAL` and `REVISION_REQUESTED` read as `QUALITY_CHECK`; `APPROVED` reads as quality-checked (a digital one as `REVEALED`).

## 2. The normal path

**Moment:** Start creative → Send to quality check → **Pass quality check** (every checklist item + the private https link to the checked song) → revealed at once by default (CREATION_READY email with the private order-page link) → follow-up due → Record follow-up → Mark completed → (optional) review request.

**Keepsake / Journey:** Start creative → Send to quality check → Pass quality check (every item, including photographs, artwork dimensions, production files and delivery information):
- with address and personalisation present → **FULFILMENT.READY** (a task: *Bella or Lewis authorises the partner purchase; place it by hand*; nothing is ordered automatically)
- Confirm fulfilment (**purchase authorised by BELLA or LEWIS**, optional partner reference; sets the production lock; one-way "being made" email)
- Mark dispatched (carrier, dispatch date, optional tracking) → "on the way" email
- Mark delivered (a person confirms; never automatic) → follow-up due → Record follow-up → Mark completed

**Quality check fails:** Fail quality check (reason + internal note) → back to creation for an internal correction → Send to quality check again. The customer is never part of this loop and is not told.

| Action (`POST /api/crm/order-action`) | Allowed from | Email sent |
|---|---|---|
| `START_CREATIVE` | CREATIVE | — |
| `SEND_TO_QUALITY_CHECK` | CREATIVE | — |
| `PASS_QUALITY_CHECK` `{checklist, reveal_url (digital), reveal_now, send_email}` | QUALITY_CHECK (and legacy pre-approval stages) | CREATION_READY (digital, if revealed now) |
| `FAIL_QUALITY_CHECK` `{reason, note}` | QUALITY_CHECK | — |
| `SEND_REVEAL` `{reveal_url?, send_email}` | digital, QC passed, not revealed | CREATION_READY |
| `SET_FULFILMENT_READY` | physical, QC passed, PENDING | — |
| `CONFIRM_FULFILMENT_REVIEW` `{confirmed, note}` | physical with availability-sensitive items | — |
| `CONFIRM_FULFILMENT` `{purchase_authorised_by, fulfilment_reference, send_email}` | physical, READY | IN_PRODUCTION |
| `MARK_DISPATCHED` / `UPDATE_TRACKING` | CONFIRMED / DISPATCHED | DISPATCHED (once) |
| `MARK_DELIVERY_DELAYED` | DISPATCHED | — |
| `MARK_DELIVERED` `{delivered_on}` | DISPATCHED | — |
| `RECORD_FOLLOW_UP` `{send_email}` | follow-up due | FOLLOW_UP if asked |
| `MARK_COMPLETED` | digital revealed / physical delivered | — |
| `REOPEN` `{reason: MCB_CORRECTION, REPLACEMENT, OTHER}` | QC passed or later | — (warns if already placed) |
| `ISSUE_STATUS_LINK`, `REVOKE_LINKS`, `ADD_NOTE`, `UPDATE_SERVICE_REQUEST`, `RETRY_MESSAGE` | any paid order | — |

Retired and refused with `410 action_retired`: `MARK_CREATIVE_READY`, `REQUEST_APPROVAL`, `REISSUE_APPROVAL_LINK`, `RECORD_APPROVAL`, `RECORD_CHANGES_REQUEST`. `POST /api/crm/production` is retired (410). There is no customer-request reopen: a customer's creative preference does not reopen production.

Every action needs `staff` (your name), is checked against the current state in a locked transaction, and is written to `order_events` with identifiers only — never story, notes, addresses or contact details.

## 3. Customer links, the reveal and old approval links

- The customer's private order page is `https://www.mycustombeats.com/your-order#<token>`. Tokens are 256-bit HMACs under `token_secret`, carried in the URL fragment (never in server logs or Referer), stored only as SHA-256 with a per-link nonce, expire (180 days by default) and can be revoked.
- **The reveal.** Once a digital creation is revealed, the order page shows "Your MCB creation is ready" with the private link staff entered. Nothing is shown before the quality check is passed; there are no approve, change or remake buttons. A physical keepsake is revealed on delivery; its song is not sent beforehand.
- **Old approval links** (`/approve#…`, historical/test only) show "This link is no longer used"; `POST /api/order-approval` answers every request the same way and records nothing.
- **Genuine errors.** From the order page a customer can report "Something in my song or artwork is incorrect". It appears in the queue as *Incorrect detail reported*. Check it against what they supplied: an MCB error is put right (`REOPEN` with `MCB_CORRECTION`, or `REPLACEMENT`); a creative preference is not a revision. The report never reopens production by itself.

## 4. The queue (`GET /api/crm/operations?view=queue`)

Derived from real state each time it is read: new orders ready for processing, creative work (including internal corrections after a failed check), quality check due, ready to reveal, incorrect-detail reports, missing information, payment review (PAYMENT_REVIEW orders and unresolved unreconciled payments), fulfilment ready, waiting to dispatch, delivery delay, damaged/faulty reports (Priority Replacement eligibility shown), questions, failed emails, new Bespoke enquiries (flagged: deadline within 14 days, no fixed spending limit), new MCB LIVE enquiries (flagged: event within 30 days), overdue (still being created, checked or revealed 24 hours after payment — an internal objective, never a customer promise; `operations.overdue_after_days` for other products if set), follow-up due.

"Mark seen" (`ACKNOWLEDGE`) records who and when against the item's key. The key includes the state it came from, so a new problem on the same order is never hidden by an old acknowledgement. Items leave the queue when the underlying state changes.

## 5. Emails

| Template | Sent | Contains |
|---|---|---|
| CREATION_READY | automatically with the digital reveal | "Your MCB creation is ready", private order-page link, reference (never the song link itself) |
| IN_PRODUCTION | with Confirm fulfilment (physical) | one-way "being made" note, separate-parcels note |
| DISPATCHED | automatically with Mark dispatched (physical) | "Your order is on the way", carrier/tracking as entered, damage guidance |
| FOLLOW_UP | only when staff tick it | progress link |
| REVIEW_REQUEST | only by staff, only COMPLETED orders, only if `reviews.url` is set | review link |

Each is claimed in `customer_communications` on (order, type, dedupe key) before sending, so repeats cannot send twice. A failure is kept as FAILED, shown in the queue and on the order, and can be retried. **Test payments** are emailed only to `resend.test_recipient` with `[TEST]`, or not at all. No email asks the customer to approve or reply before MCB continues, and none carries the story, quality-check notes, notes, address, amounts or supplier information. The retired approval emails are no longer sendable.

## 6. MCB Priority Replacement requests

From `/your-order`, a customer can report a damaged/faulty item, a delivery problem, an incorrect detail or a question. For a damaged item on a Keepsake that had Priority Replacement, the server records eligibility for staff: `ELIGIBLE` (within 7 days of the delivery date staff recorded), `OUTSIDE_WINDOW`, `DELIVERY_NOT_CONFIRMED` or `NOT_PURCHASED`. Nothing is approved, ordered or promised automatically. The customer is told their normal consumer rights are not affected; it is never described as a warranty or insurance. Resolve with `UPDATE_SERVICE_REQUEST` (REPLACEMENT_ARRANGED, RESENT_OR_REPAIRED, ANSWERED, NO_ACTION_NEEDED, OTHER).

## 7. Enquiries

- **MCB LIVE** (`/mcb-live` → `POST /api/live/enquiry`): stored with a `LIVE-YYYY-XXXXXX` reference; statuses NEW, IN_CONVERSATION, QUOTE_SENT, CLOSED, DECLINED. No availability promise, quote or deposit. WhatsApp (+44 7340 742009, the number already published on the site) remains a second route.
- **Bespoke** (`/bespoke` → `POST /api/concierge/enquiry`): now also asks "What would you like us to create?"; statuses unchanged.
- `POST /api/crm/operations {action: "ENQUIRY_STATUS", reference, status, staff}` — audited in `operations_events`.

## 8. Automation-ready events

`GET /api/crm/automation-events` lists ORDER.PAID, ORDER.READY_FOR_PROCESSING, QUALITY_CHECK.READY, QUALITY_CHECK.PASSED, QUALITY_CHECK.FAILED, REVEALED, FULFILMENT.READY, DISPATCHED, DELIVERED, FOLLOW_UP.DUE, MCB_LIVE.ENQUIRY_RECEIVED and BESPOKE.ENQUIRY_RECEIVED with references and non-personal detail. Reading them triggers nothing; no supplier or financial automation exists.

## 9. Referral attribution

Unchanged from the existing foundation: a paid customer gets a share code; orders through it are recorded as ATTRIBUTED, then CONFIRMED on payment, SELF_REFERRAL where applicable. No reward is defined or promised. The order detail shows the referral record.

## 10. Settings (`operations.*`)

`status_link_ttl_days` (180), `approval_link_ttl_days` (legacy links only), `follow_up_delay_days` (0), `overdue_after_days` (0 = off), `delivery_delay_days` (0 = off). `token_secret` must be 32+ characters or customer links are refused (preflight `customer_links_secret`).

## 10b. Founder decisions recorded in Sprint 6

- Review requests stay **off** until a verified official MCB review URL is configured (`reviews.url` empty → `not_configured`).
- Overdue and delivery-delay thresholds stay configurable and **off** (0) until operating data supports a figure.
- ~~Listening/approval pages on `/approve#…`~~ — superseded 15 September 2026: the reveal is shown on the private order page; staff enter the private link when passing the quality check.
- Article author identity: "My Custom Beats".
- Automation event meanings: `docs/AGENTIC-COMMERCE-READINESS.md` §4.

## 11. Rate limits (per source)

Retired approval endpoint 30 / 10 min; progress page 60 / 10 min; problem reports 8 / hour; MCB LIVE enquiries 5 / hour; Bespoke enquiries 5 / hour; delivery quote 60 / 10 min; order status 120 / 10 min; order reference 120 / 10 min; affiliate dashboard check 60 / 10 min.
