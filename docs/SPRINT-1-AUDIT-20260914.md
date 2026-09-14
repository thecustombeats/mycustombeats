# Sprint 1 audit — repository reconciliation and safe baseline
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT A RELEASE CANDIDATE YET. DO NOT DEPLOY.** The source still carries the obsolete commercial model throughout. Commercial truth: `COMMERCIAL-AUTHORITY-20260914.md`.

## 1. Repository state

| Ref | Head | Relationship |
|---|---|---|
| `main` / `origin/main` / `cleanup-node-modules` | `9ceeb244` | Common ancestor of every MCB branch |
| `analytics-phase1` (local checkout at audit start) | `f48a6534` | 56 ahead of main |
| `origin/mcb-commerce-20260910`, `mcb-live-approved-20260912`, `mcb-vouchers-approved-20260912` | `88ed1db7` | 9 ahead of main, 56 behind analytics-phase1; lack `9701332e` |
| `origin/mcb-founder-approved-20260912` | `10a7f2c5` | 12 ahead of main (superset of commerce branch); lacks `9701332e`; fails `tsc` (TS1484 in MCBLive.tsx); older OrderForm posts to `localhost:18888` before payment |
| `origin/mcb-release-review-20260912` | `a0f06126` | 2 ahead of analytics-phase1, 0 behind; contains `9701332e`; integrates founder MCB LIVE, Priority Replacement and voucher configuration (voucher/PR files byte-identical to founder branch) |
| `mcb-release-candidate-20260914` | this branch | Created from `a0f06126` |

`9701332e` (Bespoke Product → Service) sits on analytics-phase1, 15 commits below `f48a6534`, and is not in main or any founder branch. Main does not contain the CRM/backend, so main is not a viable base.

Founder-branch content not carried forward, deliberately: `Products.tsx` (12-inch only, Journey Collection £99/day — obsolete) and the older `OrderFormSection.tsx`/`App.tsx` (USD bookkeeping, localhost bridge, single story).

## 2. Verification baseline (before Sprint 1 changes, `a0f06126`)

| Check | Result | Pre-existing? |
|---|---|---|
| `tsc -p tsconfig.app.json` / `tsconfig.node.json` | 0 errors | — |
| `npm run build` | Pass | — |
| `eslint .` | 10 errors (4 react-refresh in shadcn ui, sidebar purity, HeroSection setState-in-effect, 4 `no-explicit-any`) | Yes — identical on `f48a6534` |
| `node --test tests/release-rules.test.mjs` | 3/3 pass (pins obsolete £10/£99/£199/£349/Heirloom) | — |
| api-acceptance | 203/203 | — |
| checkout-acceptance | 97 pass / 15 fail | Stale: expects Keepsake £79 (£279/£449 baskets) |
| delivery / legal / lifecycle | 1 fail each | Stale: grep `gbp: 79` |
| full-package-acceptance | 88 / 1 fail | Stale: expects name "The Full Package" |
| hardening-acceptance | 79/79 | — |

All 19 backend failures follow from `a0f06126` changing Keepsake £79→£99 and renaming The Full Package→Bespoke without updating tests. None is a product defect. They are left failing deliberately: every one pins an obsolete value and is rewritten in Sprint 2.

After Sprint 1's payment fix: api 218/218 (15 new assertions); every other suite's failing set is identical.

## 3. Critical finding fixed on this branch

Payment Link payments were reconciled by `client_reference_id` alone (`public/api/stripe/webhook.php`). Paying the £10 Moment link with another order's id marked that order PAID, issued a reference, credited affiliates and emailed "Amount paid" at the order's price. Fixed in `8881169f`: underpayment, missing amount or wrong currency is filed as unreconciled and the order stays PENDING.

**This fix is not in production.** Whether production is exposed depends on the deployed backend and webhook configuration, which this audit could not inspect.

## 4. Open risks carried into Sprint 2 (not fixed)

- Dormant `checkout/session.php` prices the package named in the request, not the stored order's package: a session for a cheap package can be opened against a dear order and its snapshot will match.
- Session creation accepts any PENDING order id (sequential) and pre-fills that customer's email on Stripe; rate limit trusts spoofable `X-Forwarded-For`/`CF-Connecting-IP`.
- Webhook ignores `payment_status`, async payment, refund, dispute and expiry events; a second payment on an already-PAID order is not captured.
- `/api/order` has no idempotency key; a 6s client timeout plus retry duplicates orders. Failed non-Moment checkouts leave orphan PENDING orders.
- Expired Checkout Sessions are reused.
- Pre-payment Make.com webhook URL ships in the bundle and receives full PII.
- `stripe/webhook-test.php` (marked TEMPORARY) still present.
- `orders.amount_usd NOT NULL`; `orders.amount_gbp` excludes add-ons, so the confirmation email and GA4 purchase value omit them.
- `dist/` is tracked in git and stale (e.g. `dist/api/data/packages.json` Keepsake 79, pre-fix webhook). It is not a deployable artefact.
- Eight committed `*.bak` files; unused Supabase anon client; unrouted `WeddingSongs.tsx`; unused Testimonials/TrustStrip sections.
- Unsupported claims still rendered: BBC Radio, "200+ professional musicians", "worldwide" clients, video testimonials (About), "most popular gift" (FAQ), "Top affiliates earn £500+ per cruise".

## 5. Where the obsolete model lives (summary; see Sprint 1 report for line references)

Price definitions: `src/data/packages.ts` (Moment 10, Keepsake 99, Journey 199, Heirloom 349 + USD), `src/data/catalogue/keepsakeProducts.ts` (CD, Lyrics Frame £100, Vinyl Frame £200, Music Box £600, Engraved Plaque £100, Digital Player £250, gramophones £1000/£200/£100), `catalogue/enhancements.ts` (extra vinyl £60), `catalogue/giftCards.ts` (£50), `catalogue/vinyl.ts` (12-inch only, TBD), `priorityReplacement.ts` (£19.99), `giftVouchers.ts` (min £10, unimported), `legacy/retiredBespoke.ts` (£799, unimported).
Generated copies: `public/api/data/packages.json`, `catalogue.json` (and stale `dist/` copies).
Hard-coded bypasses: `MemoryConcierge.tsx` (£10/99/199/349 budgets, 1/4/6 memories), `lib/memoryConcierge.ts` (heirloom), `index.html`, `App.tsx`, `seo.ts` ("from £10"), `UpgradeInvitation.tsx`, `PriorityReplacement.tsx` (£19.99), `FAQ.tsx` (13 Heirloom mentions; Journey vinyl/CD; add-on prices).
Payment: 8 Payment Links in `packages.ts` + 1 retired; `checkoutSession.ts` Moment fallback; OrderForm Make payload prices.
Server: `lib/packages.php`, `lib/basket.php`, `order.php`, `checkout/session.php`, `crm/orders.php`, `notify.php`.
Tests: `release-rules.test.mjs`, and price/name/link-count greps in all seven shell suites.
Absent entirely: picture discs (any size), heart-shaped disc, £15 Moment, 12-song Journey, lyrics-frame sizes, £49.99 plaque, DJ Bible product, Blog, voucher ledger.
No supplier cost or margin data was found anywhere in the repository.
