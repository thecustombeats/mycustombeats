# MCB™ Customer Care & Recovery Controller

16 September 2026 · branch `mcb-release-candidate-20260914` · baseline `2634c1b1` (with the Moment price correction `db6ecc9e`).

**NOT DEPLOYED. NOT MERGED. NO PRODUCTION MIGRATION. NO LIVE STRIPE. NO REFUND. NO REPLACEMENT OR SUPPLIER PURCHASE. NO MOZART CALL. NO PAID API. NO SECRETS.**

> THE CUSTOMER BOUGHT FROM MCB. MCB OWNS THE EXPERIENCE.

Customers never need to understand suppliers, production partners, automation, providers, internal quality checks, founder approvals or supplier economics to get help.

## 1. Executive corrections applied first

**Moment price.** MCB Moment is **£15** GBP (`moment` 1500 in the catalogue, both generated feeds, checkout and structured data). Moment + one Memory Music Video (£49) = **£64**. The repository-wide correction and its regression test (`tests/moment-price.test.mjs`) are in `db6ecc9e`; this sprint re-verified them.

**Video duration safety.** The planning maximum stays **240 seconds (4:00), pending external verification**.
- A song longer than that becomes `VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED` (waiting on `PROVIDER_VERIFICATION`).
- Staff can only **escalate to the Founders**. `PROCEED_FULL_SONG` is refused with `provider_verification_required`, and no film for the full song is promised or started.
- The customer sees "We're arranging the production of your film".
- The song is never shortened or edited.
- When the platform's real maximum is verified, the planning limit changes in `src/data/production/video.ts`, and songs within it become eligible by themselves.

## 2. Support entry

**Addresses.**
- **Ordinary order support:** hello@mycustombeats.com, which is already the address on every page.
- **Replies to MCB emails:** previously went to `support@mycustombeats.com`; they now go to `mcb_support_address()`. That is `mail.support_address` in the server config, defaulting to hello@.
- **Founder action:** confirm hello@ receives mail, and keep support@ forwarding to it so replies to emails sent before this change still arrive. Command Centre readiness shows this.
- **MCB LIVE WhatsApp:** stays separate and is never ordinary order support.

**On the private order page — "Need help with your order?"** The customer picks from these choices, filtered to what the order contains:

| Choice | Offered when |
|---|---|
| I have a question | always |
| Delivery problem, Damaged item, Wrong item, Manufacturing problem | the order has something posted |
| Something is incorrect | always |
| Video problem | the order has a Memory Music Video |
| Digital delivery problem | always |
| Other | always |

Extra fields, depending on the choice:
- Which item (physical orders).
- What's happening (digital and video problems, optional).
- "It shows someone else's name, photographs or details" (wrong item, video, digital, incorrect detail).
- MCB Priority Replacement, where eligible.

No internal reason code is shown. After sending, the customer can add an optional photo.

## 3. The case

**One canonical case.** `order_service_requests` is extended rather than duplicated; evidence and fulfilment exceptions already point at it. Each case records:

| Group | Fields |
|---|---|
| Identity | case id, order, customer (through the order), type and optional issue, origin (CUSTOMER / MCB) |
| Handling | priority, opened time, status and status_since, last activity (customer, MCB), assigned staff |
| What the customer sees | customer-visible summary |
| Assessment | classification, privacy review, sentiment |
| Links (not copies) | video job, shipment, fulfilment exceptions |
| Outcome | resolution, root cause, recovery outcome, resolution note, resolved and closed times |
| Timings and follow-up | waiting-time accounting, repeat contacts, satisfaction, review-request hold |

**Separate tables:**
- **Private thread:** `support_case_messages`.
- **Remedies:** `support_remedies`.
- **Refund reviews:** `refund_reviews`.

**Audit.** Order events record the case opened, customer messages, responses, classification, remedies, decisions, refund steps, link reissues, privacy reviews and every staff view (`SUPPORT.CASE_VIEWED`). Events carry ids and types, never message text.

**States:** `NEW → REVIEWING → WAITING_FOR_MCB ⇄ WAITING_FOR_CUSTOMER → RESOLUTION_IN_PROGRESS → RESOLVED → CLOSED`. Existing rows map `OPEN → NEW`, `IN_REVIEW → REVIEWING`, `DECLINED → CLOSED`.

What the customer sees instead of the internal state:

| Internal state | Customer sees |
|---|---|
| NEW, REVIEWING, WAITING_FOR_MCB | "We're looking into this" |
| WAITING_FOR_CUSTOMER | "We need a little more from you" |
| RESOLUTION_IN_PROGRESS | "We're putting this right" |
| RESOLVED | "Resolved" |
| CLOSED | "Closed" |

**Priority** is internal only:

| Priority | Types |
|---|---|
| NORMAL | question, other |
| IMPORTANT | delivery, manufacturing, incorrect detail, digital, video |
| URGENT | damaged personalised item, wrong item, anything showing another customer's details |

**Service target.**
- **Customers are told:** "We aim to reply within one working day." Never a guarantee.
- **Tracked internally:** case age, first-response age, time waiting on MCB, time waiting on the customer, resolution time.
- **Overdue:** MCB owes the next step (NEW, REVIEWING or WAITING_FOR_MCB) and one working day (Monday–Friday, UTC) has passed since that state began.

## 4. The thread

**Four kinds of line:** `CUSTOMER_MESSAGE`, `MCB_RESPONSE` (records who sent it), `INTERNAL_NOTE`, `SYSTEM_EVENT`.

**What the customer sees:** only their own messages and MCB's replies, from "MCB". Never staff names, notes or system lines.

**Emails.** A reply sends one `SUPPORT_RESPONSE` email ("We've replied to your message") through the lifecycle ledger. It links to the private page and never carries the reply text.

**Writing on a closed case.** A customer writing on a resolved or closed case reopens it for MCB and counts a repeat contact.

## 5. Customer data minimisation

**What staff see:** name, email, order reference, product, stage and destination country, and the thread.

**Not copied into the case:** the story, photographs, song, lyrics or address. Linked records are shown as status lines (songs, videos, parcels, exceptions), with a link to the staff console.

**Evidence** is listed, and downloaded through `crm/fulfilment` with the key and a staff name (audited).

## 6. Damage, wrong item and privacy

**Damage.**
- **Evidence the customer can add:** parcel photo, product photo, unboxing video reference, or other — always optional and private.
- **Guidance** uses the approved wording ("As this is a personalised item, we recommend taking a quick photo of the parcel on arrival and recording the opening…"), always with "not a condition of getting help".

**Wrong item / cross-customer.** When someone else's details are reported:
- The case becomes `URGENT` and `PRIVACY_REVIEW_REQUIRED`.
- The Founders are notified (`CUSTOMER_SUPPORT_EXCEPTION`, reason `PRIVACY_REVIEW_REQUIRED`), and a priority card appears.
- Priority cannot be lowered while the review is open.
- Completing the review requires a note of what was checked and done. It draws no legal conclusion.
- The reporting customer never sees who else is involved.

**One occurrence, one case.**
- A customer's report links an existing open exception of the same kind rather than raising another.
- A staff-raised exception (e.g. `TRACKING_STALLED`) joins an open case of the same kind.
- `OPEN_CASE_FROM_EXCEPTION` turns an unreported customer-impacting exception into one MCB case, only once.

## 7. Objective error, subjective preference — Single Creative Authority

- **`OBJECTIVE_MCB_ERROR`**: a materially wrong name, date, artwork or song, or a production or manufacturing error.
- **`SUBJECTIVE_CREATIVE_PREFERENCE`**: a colour, arrangement, crop or lyric the customer would now prefer.

**Rules:**
- Classification needs a note of what was checked.
- `INTERNAL_CORRECTION` and `REPRODUCTION_REQUIRED` are refused unless the case is objective (`subjective_preference_not_a_revision` / `classification_required`).
- Nothing in customer care reopens production, starts creative work, or asks the customer to approve anything.
- An objective correction still goes through the existing `REOPEN` / `MCB_CORRECTION` workflow, by a person.
- Statutory rights are always stated as unaffected.

## 8. Remedies, replacements, refunds

**Remedy types:**
- `INFORMATION_PROVIDED`
- `TRACKING_UPDATE`
- `INTERNAL_CORRECTION`
- `REPRODUCTION_REQUIRED`
- `REPLACEMENT_REQUIRED`
- `DIGITAL_REDELIVERY`
- `VIDEO_REDELIVERY`
- `PARTIAL_DELIVERY_RESOLUTION`
- `CANCELLATION_REVIEW_REQUIRED`
- `REFUND_REVIEW_REQUIRED`
- `OTHER_FOUNDER_RESOLUTION`

**Which remedies need Bella or Lewis.** A remedy that costs MCB money (or might), or that is a founder resolution, is `FOUNDER_APPROVAL_REQUIRED`. It is decided with the existing founder authorisation (founder code, confirmation, 5 refusals per 15 minutes, refusals audited). Saying a remedy costs nothing requires a reason.

**Replacement.**
- The remedy links the order's prepared supplier-order pack, if one exists, and appears in **Approvals**.
- After Bella or Lewis authorise it, it is placed through the normal fulfilment workflow by a person.
- **Nothing is purchased** by customer care, and the customer is never charged.

**Refunds** (`refund_reviews`): `REFUND_REVIEW_REQUIRED → FOUNDER_DECISION_REQUIRED → AUTHORISED | DECLINED → RECORDED`.
- **Record:** gross original payment, amount, type FULL/PARTIAL, reason, founder, decision note, recorded by/at, refund date, external reference.
- **Rules:** a partial refund must be more than zero and less than what is still paid; a full refund is the remainder; one open review per order.
- **No refund API is called.** The refund is made in the payment provider's dashboard and then recorded.
- **Payment status:** a partial refund never marks the order refunded, and `orders.status` is left as the payment record says.

**Command Centre revenue.**
- **Refunds:** those recorded in the period, full and partial, for live payments. Older orders with status REFUNDED and no refund record are still counted.
- **Net paid:** gross minus refunds.
- **Order counts:** `refunded_orders` counts orders refunded in full; `partially_refunded_orders` counts the rest.

**Compensation.** No discount, credit, free product or upgrade is ever offered automatically.

## 9. Digital and video

**Songs and links.** The customer can report an access, playback or download problem, an expired link, or a wrong or corrupt file.
- `REISSUE_ORDER_LINK` issues a fresh private link, replacing the previous one.
- It is audited (`SUPPORT.ACCESS_REISSUED`) and is never a creative revision.

**Video remedies** say which film they concern (`capacity_basis`):

| Basis | What happens |
|---|---|
| `ORIGINAL_VIDEO_CAPACITY` | Re-sends the same film. |
| `REWORK_ATTEMPT` or `REPLACEMENT_VIDEO` | Objective errors only; starting it sends the same video job back to `REWORK_REQUIRED` (rework count +1). |

For a rework or replacement:
- The original capacity reservation is never touched, and no other customer's space is used or released.
- The Video Master history is kept.
- Platform allowance use is stated as `PENDING_EXTERNAL_VERIFICATION`, not invented.

## 10. Consoles

**Staff console:** `/operations/customer-care`. It sits under `/operations`, so it is already private: noindex, robots disallow, and no analytics. The CRM key is held in memory only.
- **Views:** New, Needs MCB, Waiting for customer, Urgent, Resolved, All, Metrics, Health.
- **Case cards:** case, order, safe customer name, type, age, status, next action, overdue flag.
- **Case page:**
  - conversation;
  - reply (templates, editable) and internal notes;
  - status, priority, sentiment and assignment;
  - classification with guidance;
  - privacy review;
  - customer-visible summary and link reissue;
  - linked records and evidence;
  - remedies (propose, founder decision, start, complete, cancel);
  - refund review (request, send to founders, founder decision, record);
  - resolve (outcome and root cause) or close.

**Command Centre.**
- **Customers needing help:** new, urgent, overdue MCB reply, replacement approval required, refund decision required, privacy review required, unresolved delivery issues, open cases.
- **Needs your approval:** only founder decisions (remedies needing Bella or Lewis, refund decisions).
- **Needs attention:** ordinary support work (open cases where MCB owes the next step, overdue replies, approved replacements not actioned, authorised refunds not recorded, cases resolved with a blocking exception).
- **Health** adds every support check.
- **Readiness** adds the customer care mailbox and support records retention.

**Customer case view** ("We're helping with your order"):
- **Shown:** type, date, plain status, next step, MCB's summary, the conversation, a reply box, an optional photo, and the optional "Did we resolve this for you?" (YES/NO, once, never incentivised, never published).
- **Never shown:** priority, supplier, cost, founder, internal notes, automation, legal analysis or profitability.

## 11. Recovery, satisfaction, metrics, root cause

**Recovery outcome** is required to resolve: `RESOLVED`, `REPLACED`, `CORRECTED`, `REDELIVERED`, `REFUNDED`, `PARTIALLY_REFUNDED` or `OTHER`.

**Root cause** is required for operational cases (not questions): `CREATIVE_ERROR`, `ARTWORK_ERROR`, `PRODUCTION_ERROR`, `SUPPLIER_ERROR`, `DELIVERY_ERROR`, `CUSTOMER_INPUT_ERROR`, `DIGITAL_DELIVERY_ERROR`, `VIDEO_ERROR`, `SYSTEM_ERROR` or `UNKNOWN`. It is not blame.

**Recovery cooling.**
- No review request is sent while a case is open, or for `support.review_cooling_days` (default 30) after one is resolved.
- It applies to both `crm/review-request` (outcome `recovery_cooling`, 409) and `RECORD_REVIEW_REQUEST`.
- It is kept separate from the satisfaction question.

**Sentiment** (HAPPY / NEUTRAL / UNHAPPY / UNKNOWN) is a person's observation for prioritising recovery. It is not a diagnosis, and nothing is inferred.

**Metrics** (`crm/support?view=metrics`, internal, counts and times only):
- open, new and urgent cases;
- average first response, average resolution, overdue MCB cases;
- cases by reason;
- damage rate, wrong-item rate, objective error rate, subjective-preference contact rate;
- replacement rate, refund rate, partial and full refund values;
- recovery success (share answering yes), repeat-contact rate.

Nothing penalises staff or suppliers automatically.

## 12. Templates

Eleven templates: acknowledge, answer a question, delivery taking longer, damaged item, wrong item, correcting an MCB mistake, a creative preference, song/link access, video playback, ask for a little more, all sorted.

- **Style:** warm, brief, MCB-owned, beginning "Hello {firstName}," and ending "MCB".
- **Editable:** staff edit before sending.
- **Checked when generated:** no supplier/partner/manufacturer, WhatsApp, guarantee, refund, compensation, discount, credit, legal claim or automation wording.

## 13. Health — no customer abandoned

The checks are listed below. Each appears in `crm/support?view=health`, Command Centre health, and (where it is an action) the attention list.
- `CUSTOMER_MESSAGE_WITHOUT_RESPONSE`
- `URGENT_CASE_NOT_REVIEWED` (4 hours)
- `WAITING_ON_MCB_BEYOND_TARGET`
- `RESOLUTION_STALLED` (5 working days)
- `REPLACEMENT_APPROVED_NOT_ACTIONED` (2 working days)
- `REFUND_AUTHORISED_NOT_RECORDED` (3 working days)
- `RESOLVED_WITH_BLOCKING_EXCEPTION`
- `PRIVACY_REVIEW_UNRESOLVED`

## 14. Privacy, security, retention

**Access controls:**
- **Staff API** (`crm/support`): CRM key and a staff name, no-store and noindex.
- **Customer endpoints** (`order-support`, `order-support-case`, `order-evidence`): same-origin, rate-limited, and the STATUS link token. Another order's case is "not found".
- **Evidence:** private storage with random names; downloads audited.
- **Analytics:** message and evidence content is never sent.
- **Card numbers:** refused in messages and refund references. A key-shaped refund reference (`sk_`, `rk_`, `pk_`) is refused.

**Retention.** For support communications, evidence, refund records, privacy incidents and customer-content records it is **LEGAL_REVIEW_REQUIRED**. Nothing is deleted automatically. Each kind has its own table, so policies can be applied later.

## 15. Database — prepared, not run

`db/migrations/2026-09-16-customer-care.sql` is additive and idempotent (tested twice). Applied to the previous schema it equals a fresh `db/schema.sql`, including mapping existing rows.
- **Changes:**
  - `order_service_requests`: kinds, states, new columns and indexes.
  - New tables: `support_case_messages`, `support_remedies`, `refund_reviews`.
  - `customer_communications.message_type`: adds `SUPPORT_RESPONSE`.
  - `video_jobs.duration_status`: adds `VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED`.
- **Endpoints added:** `POST /api/order-support-case`, `GET/POST /api/crm/support`. `POST /api/order-support` is rebuilt on the case library.
