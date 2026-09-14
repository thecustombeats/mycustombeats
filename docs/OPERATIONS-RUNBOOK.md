# MCB operations after payment — runbook

Sprint 5 · 14 September 2026 · Not deployed.

This is how a paid order is worked through to completion, what the system does automatically, and what it deliberately leaves to a person. The principle is **automate the normal, surface the exceptions**: every routine step is one action and one idempotent email; everything unusual appears in the queue.

Staff console: **`/operations`** (CRM key + your name; the key is kept in the tab's memory only). The same actions are available through the API below.

## 1. One state model

| Record | Column | Answers |
|---|---|---|
| Payment | `orders.status` | Has MCB been paid? (PENDING, PAID, PAYMENT_REVIEW …) |
| Creative work | `order_production.stage` | Where is the music? Are refinements still open? |
| Physical side | `order_production.fulfilment_state` | Has the keepsake been placed, sent, delivered? |

The **operational state** is derived from those columns (`src/data/operations.ts`, `public/api/lib/operations.php`) and never stored separately.

| Operational state | Digital (Moment) | Physical (Keepsake, Journey, add-ons) |
|---|---|---|
| `CREATIVE.PENDING` → `CREATIVE.IN_PROGRESS` → `CREATIVE.READY` | ✓ | ✓ |
| `CUSTOMER_APPROVAL.REQUIRED` / `.CHANGES_REQUESTED` | ✓ | ✓ |
| `CUSTOMER_APPROVAL.APPROVED` | ✓ | — |
| `FULFILMENT.NOT_REQUIRED` | ✓ (fulfilment column) | — |
| `FULFILMENT.PENDING` → `.READY` → `.CONFIRMED` | — | ✓ |
| `DISPATCHED` → `DELIVERED` | — | ✓ |
| `FOLLOW_UP.DUE` → `COMPLETED` | ✓ | ✓ |

`ORDER.PAID` appears only for a paid order that has no production record (from before that table); the first action creates it.

## 2. The normal path

**Moment:** Start creative → Mark ready → Request approval (private listening link) → customer approves on `/approve` → follow-up due → Record follow-up → Mark completed → (optional) review request.

**Keepsake / Journey:** as above until approval, then:
- approval with address and personalisation present → **FULFILMENT.READY** (a task: *place the supplier order by hand*; nothing is ordered automatically)
- Confirm fulfilment (optional supplier order reference; sets the production lock)
- Mark dispatched (carrier, dispatch date, optional tracking reference/https link) → dispatch email
- Mark delivered (a person confirms; never automatic) → follow-up due → Record follow-up → Mark completed

| Action (`POST /api/crm/order-action`) | Allowed from | Email sent |
|---|---|---|
| `START_CREATIVE` | CREATIVE | — |
| `MARK_CREATIVE_READY` | CREATIVE, REVISION_REQUESTED | — |
| `REQUEST_APPROVAL` `{preview_url, send_email}` | SONG_READY | APPROVAL_REQUIRED (per round) |
| `REISSUE_APPROVAL_LINK` | AWAITING_APPROVAL | — (link returned to staff) |
| `RECORD_APPROVAL` `{channel, reference}` | SONG_READY, AWAITING_APPROVAL | APPROVAL_CONFIRMED |
| `RECORD_CHANGES_REQUEST` `{channel, summary}` | SONG_READY, AWAITING_APPROVAL | CHANGES_RECEIVED |
| `SET_FULFILMENT_READY` | physical, approved, PENDING | — |
| `CONFIRM_FULFILMENT` `{fulfilment_reference}` | physical, READY | — |
| `MARK_DISPATCHED` / `UPDATE_TRACKING` | CONFIRMED / DISPATCHED | DISPATCHED (once) |
| `MARK_DELIVERY_DELAYED` | DISPATCHED | — |
| `MARK_DELIVERED` `{delivered_on}` | DISPATCHED | — |
| `RECORD_FOLLOW_UP` `{send_email}` | follow-up due | FOLLOW_UP if asked |
| `MARK_COMPLETED` | digital approved / physical delivered | — |
| `REOPEN` `{reason}` | approved or later | — (warns if already placed) |
| `ISSUE_STATUS_LINK`, `REVOKE_LINKS`, `ADD_NOTE`, `UPDATE_SERVICE_REQUEST`, `RETRY_MESSAGE` | any paid order | — |

Every action needs `staff` (your name), is checked against the current state in a locked transaction, and is written to `order_events` with identifiers only — never story, feedback, notes, addresses or contact details.

## 3. Customer approval

- The approval link is `https://www.mycustombeats.com/approve#<token>`; the progress link is `/your-order#<token>`. Tokens are 256-bit HMACs under `token_secret`, carried in the URL fragment (never in server logs or Referer), stored only as SHA-256 with a per-link nonce, expire (180 days status / 30 days approval by default) and can be revoked.
- An approval link answers **one round**. Requesting approval again revokes the previous link, so an old link can never approve a newer version.
- Approving twice is one approval. Asking for changes twice in a round is one request.
- Once work is approved, locked, dispatched or completed, the link cannot change it. Only staff can `REOPEN`.
- The page shows the reference, what was bought, the listening link and plain-English choices. No name, email, story, note, database id or supplier detail.

**Revisions.** Included allowances come from the catalogue wording: Moment "1 revision" = 1; Keepsake and Journey "1 refinement per song" = 1 × songs on the order. Each change request is recorded as within the allowance (`YES`), beyond it (`NO`) or `UNKNOWN` (no numeric allowance — e.g. Bespoke). Requests beyond or unknown are still accepted and flagged `REVISION_ALLOWANCE` in the queue: staff decide, the system does not refuse or charge.

## 4. The queue (`GET /api/crm/operations?view=queue`)

Derived from real state each time it is read: missing information, creative work, waiting for approval, changes requested, payment review (PAYMENT_REVIEW orders and unresolved unreconciled payments), fulfilment ready, waiting to dispatch, delivery delay, damaged/faulty reports (Priority Replacement eligibility shown), questions, failed emails, new Bespoke enquiries (flagged: deadline within 14 days, no fixed spending limit), new MCB LIVE enquiries (flagged: event within 30 days), overdue (Moment past its 1-hour target; made-to-order only if `operations.overdue_after_days` is set), follow-up due.

"Mark seen" (`ACKNOWLEDGE`) records who and when against the item's key. The key includes the state it came from, so a new problem on the same order is never hidden by an old acknowledgement. Items leave the queue when the underlying state changes.

## 5. Emails

| Template | Sent | Contains |
|---|---|---|
| APPROVAL_REQUIRED | automatically with Request approval | approval link, reference |
| CHANGES_RECEIVED | automatically when changes are recorded | progress link |
| APPROVAL_CONFIRMED | automatically on approval | what happens next, progress link |
| DISPATCHED | automatically with Mark dispatched (physical) | carrier/tracking as entered, progress link |
| FOLLOW_UP | only when staff tick it | progress link |
| REVIEW_REQUEST | only by staff, only COMPLETED orders, only if `reviews.url` is set | review link |

Each is claimed in `customer_communications` on (order, type, dedupe key) before sending, so repeats cannot send twice. A failure is kept as FAILED, shown in the queue and on the order, and can be retried. **Test payments** are emailed only to `resend.test_recipient` with `[TEST]`, or not at all. No email carries the story, change requests, notes, address, amounts or supplier information.

## 6. MCB Priority Replacement requests

From `/your-order`, a customer can report a damaged/faulty item, a delivery problem or a question. For a damaged item on a Keepsake that had Priority Replacement, the server records eligibility for staff: `ELIGIBLE` (within 7 days of the delivery date staff recorded), `OUTSIDE_WINDOW`, `DELIVERY_NOT_CONFIRMED` or `NOT_PURCHASED`. Nothing is approved, ordered or promised automatically. The customer is told their normal consumer rights are not affected; it is never described as a warranty or insurance. Resolve with `UPDATE_SERVICE_REQUEST` (REPLACEMENT_ARRANGED, RESENT_OR_REPAIRED, ANSWERED, NO_ACTION_NEEDED, OTHER).

## 7. Enquiries

- **MCB LIVE** (`/mcb-live` → `POST /api/live/enquiry`): stored with a `LIVE-YYYY-XXXXXX` reference; statuses NEW, IN_CONVERSATION, QUOTE_SENT, CLOSED, DECLINED. No availability promise, quote or deposit. WhatsApp (+44 7340 742009, the number already published on the site) remains a second route.
- **Bespoke** (`/bespoke` → `POST /api/concierge/enquiry`): now also asks "What would you like us to create?"; statuses unchanged.
- `POST /api/crm/operations {action: "ENQUIRY_STATUS", reference, status, staff}` — audited in `operations_events`.

## 8. Automation-ready events

`GET /api/crm/automation-events` lists ORDER.PAID, CREATIVE.READY, CUSTOMER.APPROVAL.REQUIRED, CUSTOMER.APPROVAL.APPROVED, FULFILMENT.READY, DISPATCHED, DELIVERED, FOLLOW_UP.DUE, MCB_LIVE.ENQUIRY_RECEIVED and BESPOKE.ENQUIRY_RECEIVED with references and non-personal detail. Reading them triggers nothing; no supplier or financial automation exists.

## 9. Referral attribution

Unchanged from the existing foundation: a paid customer gets a share code; orders through it are recorded as ATTRIBUTED, then CONFIRMED on payment, SELF_REFERRAL where applicable. No reward is defined or promised. The order detail shows the referral record.

## 10. Settings (`operations.*`)

`status_link_ttl_days` (180), `approval_link_ttl_days` (30), `follow_up_delay_days` (0), `overdue_after_days` (0 = off), `delivery_delay_days` (0 = off). `token_secret` must be 32+ characters or customer links are refused (preflight `customer_links_secret`).

## 11. Rate limits (per source)

Approval page 30 / 10 min; progress page 60 / 10 min; problem reports 8 / hour; MCB LIVE enquiries 5 / hour; Bespoke enquiries 5 / hour; delivery quote 60 / 10 min; order status 120 / 10 min; order reference 120 / 10 min.
