# Sprint 3.1 — approved media integration
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. CHECKOUT REMAINS OFF.** No catalogue, checkout, API, database or Stripe change.

## What changed

- **Keepsake visual** — the sleeve-artwork wall (`assets/originals/mcb-wall-art-sleeves.png`, founder file "mcb wall art 1.png") is Keepsake's primary image: homepage experience card, `/keepsake` hero, `/products`, `/keepsake` share image. (`e217570e`)
- **"One journey. As many memories as you want."** — the picture-disc wall ("MCB Wall Art 2.png") on the homepage and `/keepsake`, with Sailaway / First Port / Formal Night / Sunset at Sea as inspiration only and "wall mounting isn't included". Alt text says "Several" discs, not a count. (`e217570e`, alt corrected after)
- **25th Anniversary MCB Example** — featured in the homepage "See & hear" section, above the audio samples. Native controls, `preload="none"`, no autoplay, no forced muting, 2:3 space reserved. The poster (WebP) loads only as the section approaches; the MP4 is requested only on play. Web copy 10.9 MB (H.264 High, original AAC, faststart) from the 26.1 MB master (H.264 Constrained Baseline); 1024×1536, 4:55.
- **WebP** — every responsive derivative now has a WebP twin (69 files, 67 % smaller in total than the JPEGs). `ResponsiveImage` renders `<picture>` with the WebP source first and the JPEG `<img>` as fallback; share images stay JPEG. `scripts/optimise-images.sh` needs `cwebp` (`brew install webp`).

## Initial homepage transfer

Headless Chrome, cache disabled, local `vite preview`, no scrolling (4 s after navigation):

| Viewport | Before (`e217570e`) | After |
|---|---|---|
| Desktop 1440×900 | 860 KB | 630 KB |
| Mobile 390×844 @1x | 646 KB | 553 KB |
| Mobile 390×844 @2x | 757 KB | 587 KB |

After scrolling the whole page: desktop 2,061 → 1,513 KB, mobile @2x 2,456 → 1,367 KB. No MP4 bytes in any run until play is pressed.

This method differs from Sprint 3's reported 974 KB / 1.47 MB figures, so compare the two columns above, not across sprints.

## Blocking before production

- **Princess Cruises branding in the example** — the video artwork shows the Princess Cruises name, logo and strapline and a "DJ RINALDI" credit. Recorded as BLOCKING in `src/data/legal/review.ts`; founder clearance (or a version without third-party branding) is required before production. The video content has not been altered.

## Recorded follow-ups

- **Captions/transcript** for the example — none exist and none were invented; recorded in `RECORDED_NON_BLOCKERS`. Needs the verified lyrics.
- **LOOKING OUT TO SEA.png / WELCOME ABOARD.png** — deliberately unused for now (founder decision). Both show a man in a dark suit on a ship's deck at sunset holding an MCB record sleeve; not in the repository.
- **Committed masters** — `assets/originals/` holds about 33 MB of master media in Git history. Left in place this sprint; consider Git LFS or external storage later.
