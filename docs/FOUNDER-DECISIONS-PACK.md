# Founder decisions pack — before production launch

Sprint 7 · 15 September 2026 · For Bella and Lewis. This is decision support, not legal advice. Nothing here sets a policy.

## 1. Retention decision table

"Deletion supported" describes the software today. No automated deletion or anonymisation exists; the method is designed in `docs/DATA-RETENTION-ARCHITECTURE.md` and would be built once periods are decided.

| Category | Where held | Why MCB holds it | Needed after the order is completed? | Deletion / anonymisation today | Decision still needed |
|---|---|---|---|---|---|
| Account / order identity (name, email, phone) | `customers`, `orders` | Contact about the order; confirmation; support | Partly: to answer later questions and link to accounting records | Manual only (database edit); design ready | How long to keep contact details after completion; whether to anonymise rather than delete |
| Delivery address | `delivery_addresses` | Posting physical items; delivery problems | Until any delivery/damage issue is settled | Manual only; design: delete the row | Period after delivery before deletion |
| Story / personalisation text | `order_memories`, plaque/frame text, legacy `brief_*` | Creating the music; refinements; re-issues | Useful if a customer asks for a remake or re-send; otherwise no | Manual only; design: blank text, keep structure | Keep for re-issues, or remove after a set period? |
| Customer uploads / photos | `order_uploads` + private `mcb-uploads/` | Artwork, plaques | Only until artwork is final and delivered | Manual only (delete file then row); design ready | Period after completion; include backups |
| Approval feedback (change requests) | `order_change_requests.feedback` | Making the requested changes; evidence of what was asked | Only as evidence if a dispute arises | Manual only; design: blank text | Period |
| Support / problem reports | `order_service_requests.description` | Resolving damaged/faulty or delivery issues | Until resolved plus any claim period | Manual only; design: blank text | Period after resolution |
| Transaction / accounting records | `orders` amounts, `order_items`, `checkout_sessions`, `stripe_events`, `unreconciled_payments` | Accounting and tax obligations; payment disputes | Yes, for the period accounting/tax rules require | Not to be deleted early; later anonymise contact fields | Confirm the applicable period with an accountant |
| Consent evidence | `order_consents` (terms version, time, IP hash, user agent) | Showing what was agreed | Yes, while claims could arise | Manual; design: drop user agent later | Period |
| Audit / security records | `order_events`, `operations_events`, acknowledgements, `customer_communications`, rate-limit hashes | Accountability; troubleshooting; abuse prevention | Yes (contain no customer text by design) | Rate-limit rows auto-prune after 1 day; others manual | Period, or keep with the order record |
| MCB LIVE / Bespoke enquiries | `live_enquiries`, `concierge_enquiries` | Replying; preparing quotes/proposals | Only if the enquiry becomes work, or for a short follow-up time | Manual only; design: anonymise | Period for enquiries that did not proceed |

After deciding: update the Privacy Policy "How long we keep it" section, then commission the deletion tool described in the architecture document.

## 2. Shipping data required to activate physical commerce

Today no production delivery rate exists, so every physical order (Keepsake, Journey, plaque, frames, players) is quoted "unavailable" and **cannot be paid live**; TEST-only rates are refused with a live key. A Moment needs no shipping.

The software reads `api/data/delivery-rates.json`. **Minimum table for launch:**

```json
{
  "currency": "GBP",
  "rates": [
    { "id": "UK_STANDARD", "label": "UK delivery", "countries": ["GB"], "first_item_minor": 0, "additional_item_minor": 0 },
    { "id": "EUROPE", "label": "Europe delivery", "countries": ["IE", "FR", "DE"], "first_item_minor": 0, "additional_item_minor": 0 },
    { "id": "REST_OF_WORLD", "label": "International delivery", "countries": "*", "first_item_minor": 0, "additional_item_minor": 0 }
  ]
}
```

(The zeros are placeholders, not proposed prices.) For each row the Founders must supply:

| Field | Meaning |
|---|---|
| Destination | ISO country codes, or `*` for "everywhere else". Omit a region entirely to refuse delivery there. |
| Label | What the customer sees at Review (e.g. "UK tracked delivery"). |
| First item charge | Pence, GBP, for the first physical item in the order. |
| Each additional item | Pence, GBP, for every further physical item. |
| Service | Optional wording inside the label (carrier/service), only if accurate. |

**Limitation to decide on:** the current model charges per physical item, the same for every product. If a gramophone or a Journey costs materially more to send than a 7-inch Keepsake, either (a) set rates that are fair across products, (b) keep players off the online order until priced separately, or (c) commission a small extension for per-product rates. That is a Founder choice; the software does not guess.

Also needed from suppliers before physical launch (operations, not code): who fulfils each physical product, and how staff place and confirm those orders manually.

## 3. Legal / policy gap inventory

Each line is an exact mismatch between current wording and actual site behaviour or other published wording. Classification: **T** technical defect (fixed this sprint), **F** Founder/policy decision, **L** professional legal review.

| # | Where | Mismatch | Class |
|---|---|---|---|
| 1 | Terms §8 "We at MCB do not take any responsibility for courier damages…" | Priority Replacement page and production-stage copy (`legal/production.ts`: "if anything is wrong with what arrives, that is ours to put right") say MCB helps; UK consumer law generally places transit risk on the trader until delivery. Already BLOCKING in `review.ts`. | L + F |
| 2 | Refunds "within 24 hours of the delivery date … at a reasonable discount price" | Priority Replacement offers a 7-day request window; statutory rights do not expire in 24 hours. | L + F |
| 3 | Terms §7 "There is a no refund policy" | No carve-out for faulty or misdescribed goods (already listed in `review.ts`). | L |
| 4 | Terms §4 "As soon as a song goes to Vinyl pressing, no refinements can be made" | The system (and product pages) close refinements at **approval**, and a Moment is never pressed. | F |
| 5 | Terms §5 "When your work is ready we send it to you" | Accurate, but does not mention the private approval link or that approval locks physical orders (the approval page says so). | F (optional wording) |
| 6 | Privacy "How long we keep it" | No periods stated; see §1. | F + L |
| 7 | Privacy cookies | **T — fixed in Sprint 7:** analytics now loads only after consent; the policy text, storage list (stale keys removed; consent key added) and processor list (reCAPTCHA added) now match the code. Whether analytics may run without consent under current UK law (including the Data (Use and Access) Act 2025 changes) is a legal question; the site now takes the conservative route. | T (done) + L |
| 8 | Customer copy written in Sprints 5–6 said "that is ours to put right" | **T — fixed in Sprint 7:** now "tell us — your normal consumer rights are not affected", which does not contradict the Terms while #1 is decided. | T (done) |
| 9 | Unsupported marketing claims (Press "collaborates with media outlets…", Artists "global network", "professional musicians") | **T — fixed in Sprint 7:** softened to factual wording. | T (done) |
| 10 | 2026-09-14 Privacy/Refunds edition | Not yet approved by the Founders or reviewed (`review.ts`). | F + L |
| 11 | Cancellation classification / digital-content consent | Existing BLOCKING review items; no software mismatch found (consents are recorded as designed). | L |

## 4. Other Founder account actions

- Google Analytics: turn off **Google signals** and **"Page changes based on browser history events"** (the app sends its own page views; the site blocks advertising pixels regardless).
- Resend: verify the sending domain.
- Stripe live: register the webhook (runbook step 8); public name already "My Custom Beats".
- Decide whether to keep `/luxury/` deployed (it is unlinked, non-indexed, isolated; it loads stock photos from images.unsplash.com, which receives visitors' IP addresses).
