# MCB™ Website Readiness & Asset Gap Register

**Sprint:** Website Excellence, Conversion & Experience Closure
**Branch:** `mcb-release-candidate-20260914` · baseline `8a77d8e4`
**Date:** 16 September 2026
**Status:** release-candidate work. Not deployed.

This register is written for Bella and Lewis. Plain words first; the technical
detail is in the tables beneath each section.

---

## 1. What this sprint changed, in one paragraph

The operating machinery was already hardened. This sprint looked at the site the
way a first-time customer does. The biggest thing it found was that
**`/partners` — the page a cruise line or hotel group lands on — was the worst
page MCB owns**: its own palette, its own fonts, 10px type, twenty-nine
colour-contrast failures, four buttons and three dropdowns with no name at all,
and two commercial claims MCB cannot evidence. It has been rebuilt. The second
biggest was that **the MCB LIVE WhatsApp number was being offered as MCB's
general customer-support line** — in the site's machine-readable identity, as a
floating button over the thank-you and private order pages, in the footer of
those pages, and as the way to ask MCB to confirm a delivery. That is now
separated properly. The third was that **two real products were invisible**: the
£49 Memory Music Video could only be discovered inside checkout, and the
eighteen pop-up cards were a flat wall of near-identical rows.

---

## 2. Website Readiness Register

**READY** — works, looks right, says only true things.
**NEEDS CONTENT/ASSET** — works, but a real photograph or file would make it
materially better.
**NEEDS EXTERNAL VERIFICATION** — MCB cannot confirm it without a live service.
**NEEDS FOUNDER ACTION** — waiting on a decision or a piece of information.
**BLOCKED** — should not go live as it is.

Nothing here is marked READY merely because it renders.

### Public pages

| Page | Status | Notes |
|---|---|---|
| `/` homepage | READY | Hero states the product in one line and the main action is above the fold at all four widths. Eyebrow type raised to 14px. |
| `/products` | READY | Now also shows the Memory Music Video, and the eighteen cards read by occasion. |
| `/moment` `/keepsake` `/journey` | READY | Prices, song counts and formats read from the catalogue. |
| `/bespoke` | READY | Quoted, no figure published. |
| `/cruise` | READY | Two product photographs gained real alt text. |
| `/occasions` | READY | Every "Start My Song" button pointed at the retired `/#order` anchor and forced a full page reload; all three now go straight to `/create`. |
| `/anniversary-song` | READY | Was indexable and in the sitemap but linked from nowhere on the site; now reachable from Occasions. |
| `/faq` | READY | Thirty-nine questions were one flat accordion that allowed only one open answer at a time. Grouped into eight topics with a jump list, multiple answers open at once, and `hello@` on the page rather than only in the footer. New entries for the Memory Music Video and the cards. |
| `/partners` | READY | Rebuilt. See §4. |
| `/mcb-live` | READY | Acts named, availability-and-quote enquiry, no invented price, the WhatsApp line correctly scoped to MCB LIVE. |
| `/about` | READY | Founder note preserved verbatim. |
| `/press` `/artists` `/blog` `/blog/:slug` | READY | No serious or critical accessibility issues at any width. |
| `/priority-replacement` | READY | — |
| `/legal/terms` | READY | The 26-link contents list was 14px type in 19px rows; now full-size type in 44px rows. |
| `/legal/privacy` `/legal/refund` | READY | Substantive wording still **NEEDS PROFESSIONAL LEGAL REVIEW**, as recorded previously. |
| `/artists/apply` | NEEDS FOUNDER ACTION | Works and submits, but is placeholder-only labelling and uses `alert()` for errors. Out of this sprint's scope; logged for a later pass. |
| `/affiliate`, `/dashboard` | NEEDS FOUNDER ACTION | Legacy styling, not on the customer path. Logged, not rebuilt. |
| 404 | READY | Plain language, offers a way back, `noindex, follow`. Still answers HTTP 200 because the host rewrites everything to the app — a soft 404, unchanged this sprint. |
| `/luxury/` | READY | Unlinked, and now carries its own `noindex` meta tag and a `robots.txt` rule as well as the host header, so it stays out of search even on a host that ignores `.htaccess`. |

### Customer journeys

All twelve were rehearsed in a real browser against the TEST stack. 34 of 34
checks passed, with no console errors.

| Journey | Status | Evidence |
|---|---|---|
| A — £15 Moment | READY | Paid at exactly £15, reference issued, no delivery charge, no approval promise. |
| B — Moment + Video £64 | READY | Review totals £64; £64 charged; one video space held. |
| C — one-song vinyl | READY | £99 Keepsake, artwork photograph requested once. |
| D — multi-song Journey | READY | Six memories asked for, £199 charged. |
| E — cruise memory | READY | Same as D, through the voyage wording. |
| F — anniversary | READY | Occasions → anniversary page → order form, all in-app. |
| G — card enhancement | READY | Six occasion groups, a card added from inside one, the group reports what is in it. |
| H — unusable photo + £15 preparation | READY | MCB names the photo, says what is needed, offers another photo **or** the £15 service, says plainly that not every photograph can be prepared, uses no production jargon, and waits for the customer's choice. |
| I — fulfilment confirmed before payment | READY | Rehearsed under the REQUIRED setting the release ships. Premium wording, no internal code, a clear next step, no dead end. |
| J — returning to the private order page | READY | Opens from the customer's own link; help is by email; no WhatsApp anywhere on it. |
| K — needing support | READY | FAQ answers the video, the cards and the no-draft question, and shows `hello@`. |
| L — MCB LIVE enquiry | READY | Availability/quote only, no invented price. |

### Cross-cutting

| Area | Status | Notes |
|---|---|---|
| Accessibility | READY | 88 page audits across 390/820/1280/1920 px: **zero** axe violations at any impact, zero overflow, zero broken images, zero console errors. Not a certification. |
| 55+ experience | READY | Smallest public copy is now 14px (was 13px, and 10px on `/partners`); body copy 16px+; 44px touch targets; plain language; visible focus. |
| Younger / mobile | READY | Mobile fold carries headline, proposition and the main action; photography begins immediately below it. |
| Motion | READY | Ambient loops respect `prefers-reduced-motion` and data saving; nothing is invisible if an animation fails. |
| Homepage video | READY | No autoplay, poster, `preload="none"`, real controls. Captions still missing — see the Asset Gap Register. |
| SEO | READY | Unique title and description per route; one canonical per page; `og:type` no longer leaks `website` onto blog articles; the obsolete `keywords` tag removed; `/create` and `/luxury` disallowed in robots.txt. |
| Structured data | READY | Prices read from the catalogue; no invented availability, review or rating; the homepage example film is now described as a `VideoObject`; the MCB LIVE number is declared as a sales contact point, not customer support. |
| Analytics & privacy | READY | Unchanged this sprint: no story, media, message or address reaches analytics, and private surfaces load none. |
| Dark patterns | READY | Nothing preselected, no invented urgency or scarcity, prices stated before payment. Video capacity is a real measured limit and may be stated. |
| Supplier privacy | READY | No supplier name, URL, cost, margin, route score or allowance in any customer-facing file. |
| Money safety | READY | Unchanged. No website change introduced any outgoing-money path. |
| Performance | READY | 17.7 MB of unreferenced media removed from the deploy (`public/` 87 MB → 69 MB). Invalid duplicate `srcset` candidates fixed. |

---

## 3. Asset Gap Register

Genuinely missing assets. **Nothing here was invented to make a page look
finished**, and no page depends on any of it to work.

| Asset | Where it would go | Today | Priority |
|---|---|---|---|
| Photographs of the 18 pop-up cards | `/products`, order form | No image at all; presented as named rows grouped by occasion | High — the only catalogue family with no visual |
| Picture-disc photography (12", 10", Heart, 7") | `/keepsake`, `/products`, order form | A drawn, to-scale picture-disc illustration | High — four products sold on their looks |
| Lyrics Frame photography, per size | `/products`, order form | One room mockup whose poster reads "Imagine Your Song Lyrics Here" — placeholder text baked into the image, shared by all five sizes | High |
| Personalised Music Plaque photograph | `/products`, order form | A drawn frame outline; nothing in the order form | Medium |
| Corrected player renders | `/products`, order form | Three renders with the wrong names baked in: "Mobile-phone Gramophone", "Vintage Collection", "Portable Gramophones" — none matches its catalogue name | Medium — already logged in the internal review register |
| A Memory Music Video still or example frame | `/products`, order form | Text only | Medium |
| Captions or a transcript for the 25-year anniversary example | Homepage | None; the section says so rather than inventing them | Medium — the value of the film is sung words |
| `heroAlt` for the three blog articles | `/blog`, `/blog/:slug`, share cards | Falls back to a stock-photo description | Low |
| MCB LIVE imagery | `/mcb-live` | No image or video at all | Low |
| Approved customer evidence for public use | Anywhere testimonials would go | **None used.** No testimonial, review count, rating, customer number, award or certification is claimed anywhere. Nothing was fabricated | Founder decision |

---

## 4. `/partners`, rebuilt

The page it replaces carried a 200-line stylesheet of its own, a second Google
Fonts request, its own palette (`#B8965A` / `#1a1208` / `#faf8f4`) and 10–13px
type. It was the only public page on the site with serious accessibility
failures.

| Before | After |
|---|---|
| 29 colour-contrast failures | 0 |
| 4 buttons with no accessible name | 0 |
| 3 dropdowns with no accessible name | 0 (every control has a visible `<label>`) |
| Heading level skipped (h2 → h4) | Correct order |
| Smallest text 10px | 14px floor, 16px body |
| No `<form>` element; `alert()` on error | A real form, with an inline error a screen reader announces |
| Own palette and fonts | The approved MCB identity |

Two commercial claims were removed rather than restyled, because MCB cannot
evidence them:

- **"Real Moments. Real Impact."** presented four hypothetical scenarios in the
  past tense, reading as case studies. They are now written as what MCB can
  create, under the heading "What MCB can create", with the line "Illustrations
  of the work, not client references."
- **"Join forward-thinking brands who create unforgettable moments with My
  Custom Beats"** implied existing brand partners. Removed.

The enquiry contract is unchanged: the same field names, the same Formspree
endpoint and the same Calendly link, both already declared processors in the
privacy inventory and in the Content-Security-Policy. No new third party was
introduced.

---

## 5. What MCB still cannot verify without going live

- Real payments through live Stripe.
- Real email delivery, and that `hello@` receives customer mail.
- Production response headers, and HSTS once every host serves HTTPS.
- Real Core Web Vitals from real devices and networks.
- How the site renders in Safari and on real iOS and Android hardware. The
  rehearsal ran in headless Chrome at four widths; Safari-sensitive CSS was
  reviewed by reading, and **no Safari test was run**.
- Whether Formspree and Calendly behave as expected for a real partner enquiry.

---

## 6. Remaining founder actions from this sprint

1. Supply, or approve the commissioning of, the card, picture-disc, frame and
   plaque photography in the Asset Gap Register.
2. Replace the three player renders whose baked-in names contradict the
   catalogue.
3. Decide whether captions or a transcript should be produced for the
   anniversary example film.
4. Decide whether any genuine customer evidence is cleared for public use. None
   is used today, and none will be invented.
5. Confirm whether `/artists/apply`, `/affiliate` and `/dashboard` are worth a
   rebuild pass of their own, or should be withdrawn.

---

## 7. Residual notes, stated plainly

- The FAQ publishes `FAQPage` structured data for all thirty-nine questions.
  Every question is visible on the page; each **answer** renders when its
  question is opened. This is ordinary accordion behaviour and supported, but it
  is not the same as the answer being on screen at first paint.
- The 404 page returns HTTP 200 because the host rewrites all paths to the
  application. Unchanged this sprint.
- "MCB Today" day boundaries still use UTC while Business uses Europe/London —
  carried forward from the hardening sprint, unrelated to the public site.
