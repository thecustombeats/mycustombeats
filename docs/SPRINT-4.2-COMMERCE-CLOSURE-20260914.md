# Sprint 4.2 — commerce closure and launch-blocker cleanup
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. LIVE CHECKOUT OFF. NO LIVE STRIPE. NO PRODUCTION MIGRATION.** With this sprint, Sprint 4 is closed.

## What changed

| Item | Result |
|---|---|
| Legacy sandbox webhook | `public/api/stripe/webhook-test.php` deleted. Nothing included, routed to or tested it. Its non-blocker entry in `review.ts` is resolved. Regression: the route and file answer 404, nothing reads `webhook_secret_test`, and `GET /api/crm/preflight` FAILs `legacy_webhook_copy_absent` if an old copy is still on a server. |
| Private upload storage | No fallback inside the web root. Photos go only to `uploads.path` or an `mcb-uploads` directory above the web root, each refused if it resolves inside the web root (symlinks included). Otherwise the upload fails closed: "We couldn't securely save your photo. Please try again shortly." — no path, nothing written. Development/test storage (`uploads.development_storage`, under the system temp directory) is refused with a live key. Live checkout does not open without private storage (`private_storage_missing`). `api/storage/` removed; its HTTP denial kept. |
| Deployment preflight | `GET /api/crm/preflight` (CRM key): PASS/WARN/FAIL for private storage, Stripe key mode and webhook secret, launch approval, test overrides, delivery rates, email, origin, debug, migration, generated data, legacy webhook. Discloses no secret or path. `docs/DEPLOYMENT-PREFLIGHT.md` documents the `mcb-uploads` directory (location, ownership, permissions, not web-accessible, no listing, opaque names, backups) and every production setting. |
| Thank-you copy | The universal "Your custom composition begins within 24 hours" was still shown for every product; it is removed. Wording now follows the server's confirmed purchase. Moment: "We've received your story, and we're now creating your Moment." + the catalogue's approved turnaround ("Target delivery within 1 hour — we'll send your song to the email address you gave us."). Keepsake: "We'll now begin creating your MCB experience, and we'll keep you updated as your music and your Keepsake progress." Journey: "We'll now begin creating your Journey, and we'll keep you updated as your songs and your record progress." No manufacturing or dispatch timeline. |
| Apollo | Founder decision recorded in `review.ts`: Apollo remains removed; no Apollo, LiveIntent or equivalent identity tracking. Google Analytics unaffected. Existing regression test retained. |
| Privacy inventory | `privacy.ts` (which the Privacy page renders): Cloudinary removed (no website data flow); Hostinger now states that photos are kept in private storage outside the public website, linked to the order under a random name, retrievable only by staff; `mcb_saved_order_v1` added to the storage list. No retention period invented. The `review.ts` item stays BLOCKING for retention, Founder confirmation that Cloudinary is unused elsewhere, and approval of the 2026-09-14 edition. |
| Adaptive Pricing | Unchanged: off on every session. Regression in `checkout-acceptance.sh`, `transaction-acceptance.sh` and `order.test.mjs`. GBP, the saved amount and exact webhook matching are still required. |

## Sprint 4.1 evidence (Stripe TEST mode) — retained

- Moment £15 → paid, `MCB-2026-000001`.
- 7-inch Keepsake £99 + Priority Replacement £19.99 + TEST_ONLY delivery £4.95 = **£123.94** → paid, `MCB-2026-000002`.
- 6-song Journey £199 + TEST_ONLY delivery £4.95 = **£203.95** → paid after a declined card and resume, `MCB-2026-000003`.
- Identifiers: `docs/SPRINT-4.1-STRIPE-TEST-REHEARSAL-20260914.md`.

## Unchanged by design

- No production delivery rates. Physical orders cannot be paid live; TEST_ONLY rates are refused with a live key; a digital Moment is unaffected.
- Stripe public name ("Custom Beats" → "My Custom Beats") and payment methods are Dashboard settings for the Founder, verified at launch QA.

## Verification

Node 92/92 · TypeScript and build pass · lint 5 pre-existing shadcn errors · backend acceptance 1,208/1,208 (transaction suite 221) · secret scan: no credential values in tracked files, evidence or logs.
