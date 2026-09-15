# Data retention and deletion — architecture

Sprint 5 · 14 September 2026 · **No retention period has been decided, none is assumed, and nothing is deleted automatically.** This document lists what MCB holds, where, and how it can be safely removed or anonymised once periods are approved (see the privacy item in `src/data/legal/review.ts`).

## Categories

| Category | Where it lives | Why it is kept | Deletion method once a period is approved |
|---|---|---|---|
| **Identity and contact** | `customers` (name, email, phone); `concierge_enquiries`, `live_enquiries` (name, email, phone) | Fulfilling orders, replying to enquiries | Anonymise in place: replace name with "Deleted customer", email with `deleted+<id>@invalid`, phone NULL. Keep the row so order and accounting records stay consistent. |
| **Delivery address** | `delivery_addresses` | Posting physical orders; handling delivery problems | Delete the row after the delivery and any replacement window has passed (order keeps `country_code` if needed for tax). |
| **Story and personalisation** | `orders.brief_*`, `order_memories`, `order_units` (plaque/frame text), `order_change_requests.feedback`, `concierge_enquiries.story`/`create_request`, `live_enquiries.details` | Creating the work; revisions; enquiry conversations | Blank the text columns (`story` → a fixed placeholder such as "[removed]", feedback/details → NULL). Keep structure (units, counts, styles) for order history. |
| **Photos** | `order_uploads` rows + files in private storage (`mcb-uploads/`) | Artwork and plaques | Delete the file from private storage first, then the `order_uploads` row, in that order, logging only the count. Include backups in the policy. |
| **Service requests and notes** | `order_service_requests.description`, `order_staff_notes.note` | Handling problems; internal context | Blank descriptions/notes after resolution + agreed period. |
| **Payment and order records** | `orders` (amounts, status, MCB reference, Stripe ids), `order_items`, `checkout_sessions`, `stripe_events`, `unreconciled_payments` | Accounting and tax obligations | Retain for the statutory period, then anonymise contact fields; never delete amounts needed for accounts before that. |
| **Consent evidence** | `order_consents` (versions, timestamp, IP hash, user agent) | Showing what was agreed | Retain with the order record; drop user agent after the claims period. |
| **Audit and operations** | `order_events`, `operations_events`, `operations_acknowledgements`, `customer_communications` | Accountability; troubleshooting | Contains no customer text by design; retain with the order, or aggregate after the period. |
| **Access links** | `order_access_tokens` | Customer order and reveal pages (legacy approval links) | Revoked/expired rows can be deleted at any time (no customer content). |
| **Rate-limit counters** | `rate_limit_hits`, `ip_hash` columns | Abuse prevention | Salted hashes only; `rate_limit_hits` already prunes rows older than a day. Blank `ip_hash` columns once a period is agreed. |

## Principles for the implementation

1. **Configurable, not hard-coded.** Periods belong in server configuration (e.g. `retention.photos_days`), each defaulting to *off*.
2. **Dry run first.** A CRM-key command that reports what *would* be removed, by category and count, before anything is removed.
3. **Staff-triggered, audited.** Each run records who, when, which categories and counts — never the removed content.
4. **Order of operations.** Files before rows; text blanking before any row deletion; everything for one order in one transaction where the database is involved.
5. **Honour holds.** Skip orders with an open service request, payment review, dispute or legal hold.
6. **Customer requests.** A verified erasure request runs the same per-order anonymisation immediately, except records the law requires MCB to keep.
7. **Backups.** The policy must state how long backups keep removed data.

## Not done in Sprint 5

No deletion job, no scheduled task and no period exists. The privacy page continues to say exact periods are being formalised.

## Creative Factory material (15 September 2026)

`creative_artifacts` (Fact Ledgers, album and story maps, lyric packages, Music Direction, composition plans), `creative_generation_attempts`, `creative_candidates` (including any transcript), `creative_masters`, the audio in private storage (`mcb-uploads/creative/`) and `creative_access_log` hold private creative material. **No retention period is set** — it is a Founder decision pending legal review (decisions pack item 29). Nothing is deleted automatically.

## Production File Factory material (15 September 2026)

Creative Art Masters, print production masters, image-preparation records, manufacturing packages and supplier order packs (which contain the delivery details needed to place the order) are private. Their files live in private storage (`mcb-uploads/production/`). **No retention period is set** — Founder decision pending legal review. Nothing is deleted automatically.
