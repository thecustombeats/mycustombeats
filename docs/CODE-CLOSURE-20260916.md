# MCB™ Final Code Closure & Payment-First Reconciliation

**Branch:** `mcb-release-candidate-20260914` · baseline `ab017c2c`
**Date:** 16 September 2026
**Status:** release-candidate work. Not deployed.

---

## 1. Payment starts work

**The rule.** MCB begins no creative or fulfilment work until payment is
confirmed:

```
customer input → required consents → payment → payment verified
→ ORDER.READY_FOR_PROCESSING → MCB work begins
```

**What the audit found.** The rule already held. Every production workflow was
gated on `orders.status = 'PAID'`, which is written in exactly two places, both
of which verify a real Stripe payment: the signed webhook, and staff
reconciliation of a captured payment.

**What was still wrong.** Three entry points were safe only because of *where
they were called from*, not because they checked:

| Entry point | Was protected by | Now |
|---|---|---|
| `ensure_artwork_creative_jobs()` | "an unpaid order has no artwork rows yet" | asks `require_payment_before_work()` |
| `video_staff_action()` | "a video job only exists for a paid order" | re-reads the order on every production step |
| `care_staff_action()` → `START_REMEDY` | "a remedy is only reachable from a paid order" | asks before starting a replacement or rework |

A future caller that skipped the pre-check would have inherited no protection at
all. `video_staff_action()` also stayed callable if an order was later refunded
or cancelled, because nothing re-read the order after the job was created.

The rule now lives in one documented place, `public/api/lib/payment-first.php`,
which throws rather than returning a flag a caller could ignore. `REFUNDED` is
deliberately not "paid" for the purpose of starting **new** work.

**The permanent guard.** `tests/payment-first-acceptance.sh` (43 checks) drives
a real unpaid order at every production workflow and requires a refusal:
creative, lyrics, artwork, production files, manufacturing package, video,
supplier order, shipment, dispatch, customer link, replacement. It also proves
the allowed pre-payment work is allowed (a quote, a checkout session, a capacity
hold), that payment then starts the work, and that no money moved.

---

## 2. Known impossibility vs incomplete verification

The previous sprint made new-sale safety REQUIRED, and under REQUIRED **every**
flag stopped the sale. A route whose evidence was a month stale stopped a
customer paying exactly as firmly as a country MCB provably cannot ship to.
That is the wrong trade: uncertainty is not impossibility.

| Class | Flags | Effect |
|---|---|---|
| **KNOWN_UNFULFILLABLE** | `DESTINATION_UNSUPPORTED` (positively evidenced), `PRODUCT_UNAVAILABLE` (every route suspended or out of stock), `NEGATIVE_CONTRIBUTION` (a complete costing showing a loss) | **May stop the payment**, whatever the enforcement setting. Selling what MCB knows it cannot deliver is never acceptable. |
| **VERIFICATION_INCOMPLETE** | `MISSING_ROUTE`, `ROUTE_NOT_VERIFIED`, `COMMERCIAL_DATA_MISSING`, `UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE`, `MANUFACTURING_DATA_MISSING` | **Never stops the payment.** It stops the *work* instead, on the paid order. |

An unrecognised flag is treated as KNOWN, never as safe.

**Commercially, this is the significant change in this sprint.** Vinyl that was
held before payment because manufacturer data had not arrived can now be sold;
the paid order is held for MCB to verify before anything is made or ordered.

---

## 3. The paid-order exception

When MCB discovers *after* payment that it cannot fulfil, or has not finished
verifying how, `fulfilment_check_route_verification()` raises one of two
exceptions, both blocking, both surfaced to Bella, Lewis and staff:

- **`PAID_ORDER_FULFILMENT_EXCEPTION`** — MCB now knows it cannot fulfil as
  sold. (The type existed in the vocabulary and nothing had ever raised it.)
- **`POST_PAYMENT_VERIFICATION_REQUIRED`** — new this sprint. MCB has not
  finished verifying how it will fulfil.

Neither cancels the order, changes the customer's price, substitutes a
materially different product, spends money or refunds anything. MCB owns the
resolution: an alternative route, an approved card substitution, a conversation
with the customer, or a refund review — and **a refund is decided only by Bella
or Lewis, made outside MCB, and recorded**. There is still no refund API.

---

## 4. Business time

Europe/London is the MCB business timezone. Business used it; MCB Today did not.
Through British Summer Time the same founder saw two different "todays" on one
screen, and an order paid at 00:30 London counted as today in one tile and
yesterday in another.

`public/api/lib/business-time.php` is now the single definition, used by both.
It exists as its own file because `business.php` requires `command-centre.php`,
so the Command Centre could not reuse the helpers without a circular include —
which is why it had its own UTC definition in the first place.

Closed:

- `cc_period()` now returns business-timezone boundaries, and carries an `end`.
  It returned only a `start`, so "today" meant "today and everything after".
- The fulfilment "today at a glance" block moved off SQL `UTC_DATE()`.
- Overdue dispatch and parcel checks compare against the business date.
- The video funnel counter's day bucket was **written** as `UTC_DATE()` and
  **read** with London bounds — one figure built from two different days.
- Two writes used `NOW()`, which follows the database session timezone, where
  everything else uses `UTC_TIMESTAMP()`.
- An invalid configured timezone silently fell back while still reporting
  `CONFIGURED`; it now reports `CONFIGURED_VALUE_INVALID`.

Storage is unchanged and stays UTC. Boundaries are computed with
`DateTimeImmutable` in the business timezone and converted, so PHP's timezone
database handles the transitions; arithmetic uses calendar units ("+1 day",
"monday this week"), never second counts, which is what makes the 23- and
25-hour days correct. Tests cover both 2026 transitions.

---

## 5. Dependencies

| Finding | Class | Action |
|---|---|---|
| React Router 7.13.1, 8 advisories | **Production risk** | Upgraded to **7.18.4**. All 8 cleared. |
| `ws` (memory disclosure, DoS) via `@supabase/supabase-js` → `@supabase/realtime-js` | **Not applicable / now removed** | `ws` is the Node WebSocket library; a browser build uses the native one. Supabase was a former backend, imported by nothing and absent from the bundle — **removed**, which removes the advisory rather than arguing about it. |
| `@gsap/react`, `@hookform/resolvers`, `date-fns`, `zod` | Dead weight | Declared, imported nowhere, in no bundle — removed. `@gsap/react` was named as a Vite manual chunk, which is what kept it installed; `gsap` itself is used and stays. |
| vite / launch-editor (NTLM hash disclosure on Windows, `server.fs.deny` bypass on Windows) | **Build/dev only** | Not upgraded. Dev-server issues, Windows-specific; MCB builds on macOS/Linux and ships static files. |

**`npm audit --omit=dev`: 0 vulnerabilities.** Not "zero vulnerabilities" in
general — 11 remain in dev and build tooling, listed above.

The blocker the previous sprint reported is also gone: the release-candidate
worktree's `node_modules` was a **symlink into the main checkout**, so any
upgrade would have modified a tree this sprint must not touch. The worktree now
has its own install. The main checkout is untouched and still on 7.13.1.

Bundle after all of it: **407.32 kB / 124.80 kB gzipped — byte-identical to the
baseline.**

---

## 6. Unknown addresses return 404

Every unknown path returned **HTTP 200** with the 404 UI, because the host
rewrote everything to `index.html`. Search engines index soft 404s, monitoring
cannot see them, and a mistyped internal link looked healthy.

Now: an allowlist of real app routes is rewritten to the shell and answers 200;
everything else falls through to `ErrorDocument 404 /index.html`, which serves
the same app — so the customer still sees MCB's own "not found" page — with a
real 404 status. `ErrorDocument` with a **local path** is an internal
subrequest, not a redirect, so there is no loop. (A full URL would be a 302 and
could loop; that is why it is a path.)

`public/_redirects`, read by non-Apache hosts, said `200` for every path and
would have overridden the fix; it now mirrors the allowlist and ends `404`.

**Proved against real Apache**, not asserted: 11 app routes return 200
(including `/blog/<slug>`, `/legal/terms`, `/operations/customer-care`);
`/definitely-not-a-page`, `/old-page.html`, `/legal/nonsense`, `/products/x/y`
and a missing build asset return 404; `/api/checkout/status` is unaffected; the
trailing-slash and `/full-package` 301s still work.

**The drift risk is real and is tested.** `tests/code-closure.test.mjs` builds
the host's own conditions as regexes and asks whether each `App.tsx` route would
be admitted, and whether four unknown paths would wrongly be admitted. A new
page that is added to the app but not the allowlist fails the test rather than
silently 404ing in production.

**`HOST_VERIFICATION_REQUIRED`** — production may run LiteSpeed, whose `<If>`
and `ErrorDocument` handling can differ. Final SITREP step: request
`https://www.mycustombeats.com/definitely-not-a-page` and confirm 404, then
request `/products` and `/faq` and confirm 200.

---

## 7. Legacy public surfaces

Decisions from what the code actually does, not from appearance:

| Page | Decision | Why |
|---|---|---|
| `/artists/apply` | **WITHDRAW_FROM_PUBLIC_LAUNCH** | Posts name, email and portfolio to a third-party Zapier *Interfaces* page. No MCB endpoint, no table, nothing stored on MCB's side, and a cross-origin `fetch` to a page that returns no CORS header will reject — so the applicant is likely shown an error instead of being submitted. A form that may silently lose applicants is worse than no form. |
| `/artists` | **WITHDRAW_FROM_PUBLIC_LAUNCH** | Its only function is the call to action for the form above. |
| `/affiliate` | **WITHDRAW_FROM_PUBLIC_LAUNCH (page only)** | The backend is real and credits commission: `register.php`, `dashboard.php`, `click.php`, `affiliates` and `clicks` tables, `orders.affiliate_id`, commission incremented on payment. Not needed for a B2C launch, and the page submits to three destinations (MCB, a Google Apps Script, EmailJS) with a temp-email blocklist that runs *after* the row is committed. **The backend is untouched** and existing affiliates keep their links and dashboards. |
| `/dashboard` | **KEEP** | Already unlinked, noindexed and disallowed; existing affiliates need it. Not in the launch surface. |
| `/press` | **KEEP** | No form, no data flow; publishes `hello@`, which is correct. |

Withdrawn means: the route still resolves, so an existing link is not broken,
but the page is noindexed in the app *and* by the host header, disallowed in
`robots.txt`, removed from the sitemap and removed from the footer. Nothing was
deleted and no data or backend capability was destroyed.

---

## 8. Staff accountability

**The problem.** One shared key opened every staff door, and every action
recorded the name the person *typed*. The trail reliably recorded what happened
and that *the key* was used; it could not honestly say *which person* did it.

**What was built.** Per-staff keys, in the shape the code had already
anticipated ("if MCB OS later needs per-consumer access, this becomes a keys
table without changing the calling convention"). Each person gets a long random
key; the host stores only a bcrypt hash, exactly as the founders' authorisation
codes are stored. The name recorded on an action now comes from the key that
opened the door, and **an authenticated identity overrides whatever the request
claims** — so a signed-in person cannot file an action under a colleague's name.
All 26 staff-name intakes were changed together.

The shared key still works, so nothing breaks on the day this ships and a host
can migrate one person at a time. While it is the only thing configured,
readiness reports `SHARED_KEY_ONLY` and says plainly that the trail cannot
attribute an action to a person.

No login page, no session table, no new public attack surface, and **no key or
hash in this repository**.

**Founder financial authority is unchanged and still separate.** A staff key —
shared or individual — authorises no spending. Money still needs Bella's or
Lewis's own code, a different secret checked a different way.

**`EXTERNAL_CONFIGURATION_REQUIRED`**: generating each person's key and adding
`staff_keys` to the host config file is a founder action; it cannot be done from
this repository.

---

## 9. Malware scanning

There is still **no scanner**, and MCB does not claim one.

What uploads already get, which is not virus scanning: the type is decided by
reading the file's own bytes, never its name or the browser's claim; truncated
and corrupt files are refused; disguised scripts and SVG are refused; size is
capped; the file is stored outside the web root under a random name; it is never
executed and never served inline.

What was added is the **boundary**: a provider-neutral hook that shells out to a
**local** command the host already provides (`clamdscan`/`clamscan`). Nothing is
sent anywhere — no paid API, no subscription, no service, no customer photograph
leaving the server. It is wired into all three upload paths (order photos, video
media, support evidence) and fails closed: a scanner that refuses the file means
the file is refused.

Three honest states, and readiness reports whichever is true:
`SCANNING_ACTIVE`, `SCANNER_CONNECTION_REQUIRED` (configured but the command is
not on the host — a real problem, surfaced, never silent), `SCANNING_NOT_AVAILABLE`.

`upload_scan_result()` returns `null` when there is nothing to scan with, so
"clean" and "not scanned" can never be confused.

**Final SITREP:** ask the host whether ClamAV is available, then set
`uploads.malware_scan_command` and confirm readiness reports `SCANNING_ACTIVE`.

---

## 10. HSTS

Was a commented-out line someone had to remember to edit. It is now sent only
when the host sets `MCB_HSTS`, which can be done from the hosting panel without
editing the file — so it stays off by default and a host that is not fully HTTPS
cannot be locked out by a deploy. Deliberately without `includeSubDomains` and
without `preload`: both are effectively irreversible for as long as the
`max-age` lasts.

`security.hsts_enabled` in the host config is **reporting only** — it makes
readiness tell the truth and does not enable the header.

**Final SITREP:** confirm every mycustombeats.com host MCB uses serves HTTPS,
set `SetEnv MCB_HSTS 1`, set `security.hsts_enabled`, verify the header.

---

## 11. Everything else

- **Support identity.** `hello@mycustombeats.com` unchanged and still the only
  public support identity; `support@` appears nowhere; the MCB LIVE WhatsApp
  line stays separate. Mailbox verification remains a SITREP action.
- **FAQ.** Reviewed and **not changed for an SEO myth**. Every question is
  visible; each answer renders when its question is opened; the `FAQPage`
  structured data is generated from the same array the page renders, so it can
  never answer a question the page does not ask. Semantically correct,
  keyboard-operable, not deceptive. No reason to change it.
- **Captions.** The player now renders a `<track>` the moment a real caption
  file exists; none is invented. `CONTENT_REQUIRED`.
- **Asset gaps.** Preserved unchanged in `docs/WEBSITE-READINESS-20260916.md`.
  The Lyrics Frame mockup with "Imagine Your Song Lyrics Here" baked into the
  pixels is recorded as `ASSET_REQUIRED` and is not presented as final
  photography.
- **Customer evidence.** No testimonial, review count, rating, customer number,
  award or certification appears anywhere. `PERMISSION_REQUIRED` stands.
- **External forms.** Formspree (`/partners`) and Calendly are declared
  processors and in the CSP; the Zapier endpoint behind `/artists/apply` is now
  withdrawn from the launch. None is live-verified —
  `LIVE_VERIFICATION_REQUIRED`.

---

## 12. Founder actions from this sprint

| # | Action | Class |
|---|---|---|
| 88 | Generate a key per staff member and add `staff_keys` to the host config; retire the shared key once everyone has one. | EXTERNAL_CONFIGURATION_REQUIRED |
| 89 | Ask the host whether ClamAV is available; if so set `uploads.malware_scan_command`. | EXTERNAL_CONFIGURATION_REQUIRED |
| 90 | Confirm every mycustombeats.com host serves HTTPS, then `SetEnv MCB_HSTS 1`. | F (host) |
| 91 | Confirm on the production host that an unknown path returns 404 and real routes return 200. | HOST_VERIFICATION_REQUIRED |
| 92 | Decide whether captions are produced for the anniversary example film. | F (content) |
| 93 | Confirm the withdrawal of `/artists`, `/artists/apply` and `/affiliate` from the launch surface. | F (decision) |
| 94 | Verify `hello@` receives customer email and `support@` forwards to it. | External |
| 95 | Live-verify the Formspree partner enquiry and the Calendly booking link. | External |
