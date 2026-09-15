# Sprint 6 — SEO, AEO, security, accessibility, performance, machine-readable commerce
Branch `mcb-release-candidate-20260914` from 44635433 · 14–15 September 2026

**NOT DEPLOYED. LIVE CHECKOUT OFF. NO LIVE STRIPE. NO PRODUCTION MIGRATION. NO FINANCIAL ACTIONS.**

## Founder decisions recorded (no longer blockers)

Stripe public name is "My Custom Beats" (done in the Dashboard). Review requests stay off until a verified review URL exists. Article author: "My Custom Beats". Approval/listening pages are on MCB's own domain via private links. Overdue and delivery-delay thresholds stay configurable and off.

## Changes

| Area | Result |
|---|---|
| Analytics privacy (defect) | `page_view` sent `window.location.href`, which would have carried private `#tokens` and `?session_id=` to Google. GA bootstrap is now `/analytics-init.js`: nothing loads on `/approve`, `/your-order`, `/operations`; URLs and referrers reduced to origin + path + `utm_`. Chrome-verified: 0 Google requests on private pages; Stripe session id never sent. |
| Security headers | CSP (no inline script), X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP; API `default-src 'none'`; X-Robots-Tag on private/transactional/API paths; HSTS prepared, not enabled. The first browser pass caught the draft policy blocking Google Fonts, GA collection and reCAPTCHA — fixed and re-verified. |
| Other security | Checkout redirect restricted to `https://checkout.stripe.com/` in browser and server; affiliate dashboard rate limit. Full endpoint matrix in `docs/SECURITY-NOTES.md`. |
| Indexing / canonical | Trailing-slash 301 and canonical normalisation; `/contact` route; noindex on thank-you, artist/partner thank-you, dashboard; `robots.txt` disallows `/api/`; `/luxury/` showcase noindex with its own CSP. |
| Structured data | Already catalogue-driven; verified and tested. Product images added only where the photograph shows the product (Journey, frames, players); none for Moment/Keepsake/Bespoke. |
| AEO | `src/lib/productAnswers.ts`: catalogue-derived answers on product pages and the FAQ (Picture Disc Keepsake, songs per Keepsake, Keepsake vs Journey, Journey not a Picture Disc, plaque does not play music, Moment delivery, after ordering, approval). |
| Internal links | Product pages → relevant article + FAQ; articles → Moment/Keepsake/Journey. |
| Accessibility | One `<main>` landmark from the layout (13 pages had none); 55 small/low-contrast text classes raised on customer surfaces; `gold-deep` darkened to #78601F (AA on sand bands); focus now moves to the first invalid field on MCB LIVE and Bespoke; 404 rebuilt with large targets; occasion loops respect reduced motion. axe-core (WCAG 2.2 A/AA): 0 violations across 16 pages × desktop/mobile and 6 dynamic states. |
| Performance | Lab CLS: homepage 0.164 → 0.000, MCB LIVE 0.103 → 0.005 (metric-matched fallback fonts). `/occasions` transfer 10.5 MB → 3.1 MB desktop / 0.79 MB mobile (lazy, on-screen-only loops; four oversized photos resized in place). Other pages within ±5 KB. |
| Public feed | `/catalogue.json` generated from the canonical catalogue (public fields only, same hash as the server copy); `docs/AGENTIC-COMMERCE-READINESS.md`. Not submitted anywhere. |
| Lint | 5 → 0 errors: non-component exports moved to `toggle-variants.ts`, `navigation-menu-style.ts`, `form-context.ts`, `sidebar-context.ts`; skeleton width derived from `useId`. |
| Dead code | `src/archive/` and unused `components/logo.tsx` removed; stale Payment Link comments corrected. No active Heirloom, obsolete Moment price, Memory Box, old plaque, Payment Links, Apollo, LiveIntent, Cloudinary or `webhook-test.php` references. |

No database migration.

## Verification

Node 136/136 (baseline 117) · backend 1,511/1,511 (baseline 1,415; new `release` suite 96) · TypeScript, build and lint (0) pass · browser QA on the Apache-served build at desktop, tablet and mobile · lab performance before/after in the sprint report · secret scan clean.
