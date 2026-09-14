# Sprint 7 — final release audit and launch-readiness gate

Branch `mcb-release-candidate-20260914` · started from 257012ad · 15 September 2026

**NOT DEPLOYED. LIVE CHECKOUT OFF. NO LIVE STRIPE. NO PRODUCTION MIGRATION. NO FINANCIAL ACTIONS.**

## Verdict: CONDITIONAL GO

The release-candidate software has no unresolved launch-blocking defect. Production launch and live checkout still depend on Founder, legal/policy, shipping and deployment actions listed in `docs/FOUNDER-DECISIONS-PACK.md` and `docs/LAUNCH-RUNBOOK.md`.

## Defects found and fixed in this sprint

| # | Defect | Severity | Fix |
|---|---|---|---|
| 1 | Google Analytics set cookies and sent data before any consent | Launch-relevant (privacy) | GA now loads only after "Accept analytics cookies"; equal "Reject"; "Cookie settings" in the footer; GA cookies cleared on reject; private pages still never load GA. Privacy policy text, storage list and processor list updated to match. |
| 2 | Staff could not read the creative brief or open customer photos in `/operations` (only a raw API path was shown) | Operational blocker for first customer | The order view now shows every memory, style, plaque and frame detail, the delivery address, and downloads photos with the CRM key; missing photos are flagged. |
| 3 | Unsupported trust claims on legacy pages (Press "collaborates with media outlets… around the world", Artists "global network / world-class", "professional musicians and vocalists") | Trust | Softened to factual wording. |
| 4 | Copy added in Sprints 5–6 promised "that is ours to put right", contradicting Terms §8 | Policy consistency | Neutral wording: "tell us — your normal consumer rights are not affected". The underlying Terms conflict is a legal decision. |
| 5 | Privacy inventory listed storage keys the code no longer uses and "embedded video" cookies that do not exist; reCAPTCHA missing from processors | Accuracy | Corrected. |
| 6 | Privacy processor table scroll region not keyboard-focusable on phones (axe) | Accessibility | Focusable, labelled region; table text raised to 16px. |
| 7 | Thank-you headline said "Your Song" for multi-song orders | Wording | "Your Songs Are Now In Motion" when the paid order has more than one song. |
| 9 | macOS `.DS_Store` files tracked in Git, including `public/.DS_Store`, which the build copies into the deployed site (exposes folder names) | Hygiene | Removed from the index (already in `.gitignore`); files left on disk. |
| 8 | "You can follow each stage on your private order page" implied a link customers do not yet have after payment | Accuracy | Now says the private link arrives in the emails about their music. |

## Evidence summary

- End-to-end rehearsal on the Apache-served TEST stack (Stripe and Resend stubs): Moment £15 (300-character limit, refresh/resume, back/forward, quote server error with Try again, slow save + double click → one order), Keepsake 10-inch (3), 12-inch (4, photo replaced → one stored), Heart (1), 7-inch ×2 with Priority Replacement on one (both unticked by default), Journey 12 (12 chapters, mixed styles, standard vinyl ×2, gatefold), plaque/frame validation, Start again, stale saved order, full Moment lifecycle (changes → approval → follow-up → completed), Keepsake fulfilment → dispatch → delivery, staff brief with 12 chapters and address. 0 console errors; 0 Google requests before consent or after reject; no story, email, address, token or session id in any third-party request or email.
- Browser QA: 22 pages × 5 viewports (360, 430, 834, 1112, 1440 px) with axe WCAG 2.2 A/AA — one issue (fixed, #6); no horizontal scroll, broken images, duplicate ids; exactly one h1 and main; keyboard skip link and approval by keyboard; reduced motion honoured; crawl of 25 internal routes and in-page anchors: 0 broken.
- Lab performance (local preview, not field data): first-load transfer fell ~188 KB on every page because analytics no longer loads before consent; CLS remains ≤ 0.005; homepage MP4 not requested before play.
- Tests: Node 139/139 (Sprint 6: 136; +3 release-gate tests for consent, staff brief and copy claims). Backend 1,511/1,511 (one assertion updated to the new privacy wording). TypeScript, lint (0) and production build pass.
- Clean build output: no source maps, no config or test stubs, no retired products, no credentials; `robots.txt`, `sitemap.xml`, `catalogue.json`, `analytics-init.js`, both `.htaccess` files and the server data files are byte-identical to source.
