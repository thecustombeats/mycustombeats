# Sprint 3 — customer experience, visual rebuild and personalisation
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. CHECKOUT REMAINS OFF** (`CHECKOUT_SESSIONS_ENABLED = false`, `stripe.checkout_sessions_enabled => false`).

## What changed

- **Homepage** rebuilt: emotional hero with one primary action, "Your memory. Your story. Your music. Something to keep.", a visual four-card experience selector (Moment, Keepsake, Journey, Bespoke), "One journey. As many memories as you want.", how it works, song samples, Memory Concierge, cruise specialism, curated additions, the approved founder note, contact. The 7.9 MB hero video and 5 MB poster are no longer loaded.
- **Navigation** simplified: Experiences (click menu), Keepsakes & Gifts, Cruise, MCB LIVE, Our Story, and a Create Your Memory button; accessible mobile panel.
- **Product pages** (`/moment`, `/keepsake`, `/journey`) with a visual variant selector, what you receive, how personalisation works, turnaround, disclosures, "Delivery calculated separately before payment." and a CTA into `/create`.
- **`/create`** — the guided order flow: Choose → Your story → Finishing touches → Your details → Review. It replaces the single-brief homepage order form.
- **Personalisation model** (`src/lib/personalisation.ts`): one unit per song product (each Keepsake is its own unit), one memory per song from the catalogue (7"/heart 1, 10" 3, 12" 4, Journey 6 or 12), each with its own story (max 300 characters), optional photo, optional "for/about" and occasion, and its own music style or "Let MCB choose". Plaques collect photo, song title and artist; Lyrics Frames collect size, which song and an optional heading; Priority Replacement is 0 by default and capped at the number of Keepsakes.
- **Drawn format illustrations** (`FormatVisual`) show record size to scale, round or heart, picture disc or classic black vinyl, and the Journey gatefold — no misleading photographs.
- **Responsive images**: derivatives in `public/images/responsive/` via `scripts/optimise-images.sh` (never upscaled).
- **Policy versions**: Privacy and Refund `2026-09-14` (effective 14 September 2026); Terms unchanged. Registered as BLOCKING in `src/data/legal/review.ts` pending founder and legal review.

## On-device draft

`/create` saves the product choice and the words written for memories, plaques and frames to `localStorage` (`mcb_create_draft_v1`) for 7 days so a refresh does not lose a long Journey. It never stores photos, contact details, addresses or consents. "Start again" deletes it. Recorded in the privacy policy's storage list.

## Checkout state

At "Continue to secure payment" the page shows "Online payment isn't open yet" and sends nothing: no order is created, no photo uploaded, no session started (verified in a browser run: zero requests to `/api/order`, `/api/checkout` or Cloudinary). The per-memory personalisation payload (`personalisationPayload`) is defined and tested but the server does not yet store it — Sprint 4.

## Local preview

```bash
npm ci                      # once
npm run build
npx vite preview --port 4173
# open http://localhost:4173
```

Useful links: `/`, `/#packages`, `/keepsake`, `/journey`, `/moment`, `/products`, `/bespoke`, `/mcb-live`,
`/create?sku=moment&step=story`, `/create?sku=keepsake-12-picture-disc&quantity=2&step=story`, `/create?sku=journey-12&step=story`.

Screenshots and automated checks (Chrome required, macOS path):

```bash
node scripts/preview/capture.mjs   # full-page screenshots at 1440/820/390/320 + report.json
node scripts/preview/flow.mjs      # drives the whole /create flow and reports console errors
```

Output goes to `preview-output/` (git-ignored).

## Needs founder input

- Missing imagery: picture-disc / MCB Vinyl Wall Art photography (Keepsake currently uses a gift photograph plus a drawn disc), a Moment image (phone/headphones or reveal), a Personalised Music Plaque photograph, verified founder photographs.
- Approved product photos with baked-in text (lyrics frame "Imagine Your Song Lyrics Here", gramophone "Vintage Collection").
- Song sample photographs appear generated; the section says "Photographs are illustrative." Confirm the sample stories may be shown.
- Working copy to approve: Journey positioning "Every chapter of your story, on record."; homepage hero line; cruise band ("Life on board is something our founders know first-hand.").
- Founder names: the site's structured data names "Rinaldi" and "Shobha (Bella) Menezes"; the approved note is signed "Bella & Lewis".
- Privacy/Refund 2026-09-14 wording: founder and legal review before production.
