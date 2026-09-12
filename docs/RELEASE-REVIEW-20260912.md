# MCB website — initial audit and integration checkpoint
Date: 12 September 2026

**STATUS: NOT A RELEASE CANDIDATE. NOT AUTHORISED FOR PRODUCTION DEPLOYMENT.**

The founder brief authorises development and testing. Only Bella or Lewis may approve the finished review build for production. This checkpoint preserves the discovered foundations and a small set of source corrections. It does not implement the entire brief.

## Repository evidence

| Ref | Observed head | Relationship to main |
|---|---|---|
| main | 9ceeb244dd2c3b354a3fe31be11055431304167b | Baseline |
| mcb-commerce-20260910 | 88ed1db7b779fdcbe6f20e6256a663f66719703f | 9 ahead, 0 behind |
| mcb-founder-approved-20260912 | 10a7f2c5cb3a8155ec669acc7af3ee6b28fa95de | 12 ahead, 0 behind |
| analytics-phase1 | f48a65344615095c920e151d82232882d3e5bf1c | 56 ahead, 0 behind |

The founder-approved branch contains all commerce commits, then adds MCB LIVE, gift/credit configuration and App changes. No independent commerce-branch merge is needed.

The crucial additional branch is analytics-phase1. It contains the PHP/MySQL CRM and orders, signed Stripe webhook/reconciliation, Resend confirmation, server basket pricing, dormant Checkout Sessions, catalogue, currency display, legal versioning and acceptance suites. Neither founder branch contains that foundation. This checkpoint uses analytics-phase1 as its base and selectively introduces the isolated founder features; it does not overwrite the newer App, Products or OrderForm with the older branch copies.

The live browser inspection is consistent with the analytics branch layout and commercial data. That is not a verified byte-for-byte deployment/commit match.

## Live website observations

The public site was reached through the browser for customer-journey inspection. Direct shell access timed out and web retrieval failed; these are access limitations, not evidence the public website is down.

Observed on the fully loaded homepage:
- Keepsake is still £79, not the newly authorised £99.
- Journey advertises a unified musical theme.
- The order form has one shared story (up to 2,000 words), one artwork upload and one musical-style selection.
- A mandatory cruise-companions question appears even before cruise applicability is established.
- Two independently controlled welcome dialogs render.
- The hero states BBC Radio/global-client claims; the footer states worldwide client trust.
- Testimonials name cruise, yacht and private-jet customers, but the inspected sources contain no verifiable evidence mapping for them. They have not been proved false; they must remain unpublished until verified.
- “Most chosen by customers” and the cruise-line usage heading make unsupported usage/popularity claims.
- Live contact and repository source both use WhatsApp +44 7340 742009.
- No test order, contact enquiry, WhatsApp message or financial transaction was submitted.

## Older-branch defects

The founder-approved branch fails npm run build with TS1484: FormEvent in MCBLive.tsx must be a type-only import.

Its OrderFormSection posts to http://localhost:18888/webhook/order before Make/Stripe. In a customer browser this addresses the customer's own computer. This defect is in the older proposed branch; it was not established as a live-site defect.

That older form also has one story/style, fixed USD values and no multi-memory wizard. Its giftVouchers.ts describes desired balances and top-ups but is not a ledger or working payment implementation.

## Changes in this checkpoint

- Preserve the complete analytics-phase1 repository as the base, including its backend, migrations, tests and public assets.
- Carry forward the founder MCB LIVE page, Priority Replacement page/configuration and gift/credit configuration.
- Fix the MCB LIVE type-only import so the combined source compiles.
- Add MCB LIVE and Priority Replacement routes to the newer App and links in the footer.
- Use Midnight Ink on MCB LIVE, add the exact worldwide availability line and align the displayed sequence to Enquire → Availability → Quote → Agreement → Deposit → Confirmation.
- Preserve the source-verified WhatsApp number and enquiry prefill. No event prices, deposit amounts or cancellation charges are introduced.
- Remove the duplicate App-owned welcome dialog; retain the existing Hero-owned dialog.
- Remove the homepage testimonial section from rendering pending evidence verification.
- Replace the unsupported hero/footer/about usage claims and Journey popularity label with descriptive copy.
- Change the cruise marquee heading so it does not claim customers sailed on every named line.

The original testimonial source is retained for evidence review, but it is no longer imported by the homepage. This is not a completed sitewide claims audit.

## Verification actually performed

- Installed repository dependencies with npm ci --ignore-scripts.
- Reproduced the founder branch TypeScript build failure.
- Ran npm run build successfully after source reconciliation/corrections. The build regenerates package/catalogue/legal JSON, runs TypeScript and bundles the app with Vite.
- git diff --check passed.
- Inspected the live homepage DOM after lazy sections loaded and checked live contact details.
- Reviewed branch histories, API structure and relevant order/checkout source.

NOT performed:
- PHP/MySQL API acceptance suites in this session: no PHP/Docker runtime was available.
- Complete desktop/tablet/mobile visual verification of the changed build.
- Full personalised-order → payment → recorded confirmation rehearsal.
- Stripe test-mode or live payment transactions.
- Complete link, accessibility, performance, schema, security or social-proof certification.

Historical commit messages report passing suites, including 843 assertions in the analytics head. Those are prior-author reports, not tests rerun here.

The local build is source/build verification only. The connected GitHub file tools did not supply binary media to the local workspace; original assets are preserved in the remote branch. The local browser cannot reach the development server (ERR_BLOCKED_BY_CLIENT). Do not interpret a successful build as successful visual QA.

## Outstanding implementation and release gates

| Requirement | Remaining work |
|---|---|
| Authoritative prices | Apply £10 / £99 / £199 / £349, individually priced Bespoke; verify the corresponding server charge path before allowing checkout. Keep GBP authoritative. |
| Vinyl | Apply standalone 12-inch price £99 plus approved delivery; remove any conflicting purchase wording. No 7-inch or 10-inch offering. |
| Discontinued Memory Box | Finish repository and built-output audit. analytics treats Music Box Experience as a distinct £600 product; do not silently conflate it with the retired Memory Box. |
| Multi-memory personalisation | Implement 1/4/6 separate briefs, each photo/style/story, 300-character live counters, independent genres, MCB-choice option and remake acknowledgement. Persist every memory for fulfilment. |
| Cruise context | Optional company/ship with Other/free text and Not applicable. |
| Journey Collection | Selected days at £99 each, no arbitrary business maximum, clear separation from physical vinyl and limits only for genuine technical/payment constraints. |
| Priority Replacement | Optional, unselected, eligibility and per-item pricing enforced server-side. Preserve ordinary rights and reconcile contradictory existing terms. |
| Stored value | Transactional ledger, unique random 10-digit reference, authenticated access independent of reference alone, balances, partial redemption, top-ups, gifting, paid-only issuance, replay/concurrency protection and no cash redemption. Configuration alone is not implementation. |
| MCB LIVE | Complete visual QA, Bespoke integration and one shared performer-aware booking calendar. Duo availability must require both performers and travel feasibility. No fixed prices or invented terms. |
| Native blog | Build maintainable article/photo-post model, index/detail pages, metadata, related content and CTA. |
| Cruise Ship DJ Bible | Locate/confirm original product assets and fulfilment; preserve supplied £399.99 / £500 / £599.99. No matching product definition was located in the inspected source paths. |
| Checkout | Implement order review, server validation, robust order/session association, failure recovery and tested Stripe-hosted Sessions. Existing client/server switches are disabled. |
| Fulfilment | Stop checkout if the authoritative order/brief cannot be saved. Current best-effort capture does not meet the new success standard. |
| Trust | Verify supplied testimonials and other claims against accessible evidence. Audit all routes and schema. |
| Legal/privacy | Existing review register records conflicting founder terms, damage deadlines and liability exclusions; reconcile against the current brief and record remaining review decisions. No legal-compliance certification has been made. |
| Release QA | Desktop/tablet/mobile, accessibility, navigation, uploads, all product paths, basket totals, signed webhook, replay, confirmation, order recording and rollback rehearsal. |
| Founder review | Provide a working preview and complete change/verification report; obtain explicit approval before production. |

## Access blocker

Hostinger hPanel presents a Cloudflare “Performing security verification” page identifying bot screening. One reload did not clear it. The browser restriction was reported; no challenge was solved or bypassed.

Next access action: Bella/Lewis can take over the shared Hostinger tab to complete the security check. Sign-in credentials must go through secure browser authentication, never chat. If Hostinger continues to reject the cloud browser, use a private PHP/MySQL staging environment and the prepared source branch through another authorised deployment path.

This access step is for a separate preview/test environment. It does not authorise changing public_html, production configuration, production data, live checkout settings or charging any card.

## Safe continuation sequence

1. Restore access to a usable private preview and PHP/MySQL test environment; retain original public assets.
2. Continue on a dedicated release branch based on analytics-phase1, carrying forward only the useful approved feature work.
3. Implement the full founder brief in test mode and prove server-side order/basket/ledger invariants.
4. Rehearse complete customer journeys and responsive layouts.
5. Deliver a finished clickable review candidate with evidence and explicit remaining blockers.
6. Deploy only after Bella/Lewis approves that exact review build.

**Current production recommendation: DO NOT DEPLOY this checkpoint.**
