# Sprint 3.3 — anniversary example video replacement
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. CHECKOUT REMAINS OFF.** No catalogue, checkout, API, database or Stripe change.

## Source inspected

`Temp/25 Year Anniversary MCB Example.mp4` (supplied under this new name; the Sprint 3.2 file is gone from Temp).

- SHA-256 `90c5490a95acbede90289a16491ab10679d253a84702fddf07a1d3e934c77cdb`, 32,098,612 bytes
- 4:56.56 · 940×1672 (pixel aspect 941:940) · 25 fps · H.264 Constrained Baseline, full-range yuvj420p · AAC-LC stereo 48 kHz 128 kb/s · 866 kb/s overall
- Differs from the Sprint 3.2 file (33,640,049 bytes, MD5 `6e079d35…` vs `48f9995e…` now, 1024×1536 30 fps then) and from the Sprint 3.1 master in Git.

## Branding inspection

- Every one of the 7,414 frames was compared with frame 0 (downscaled greyscale): maximum difference 1 level — the picture never changes, so one full-resolution frame represents the whole video.
- Also viewed: 0:00, 0:05, 0:10, a frame every 10 s, ~25 % / 50 % / 75 %, and 4:50–4:56. No scene changes detected.
- Text present: "25th Anniversary · Same love. New horizons.", "Together Around the World", "Memories that last a lifetime", Travelling the World / Dinner reservation at 8 / Dancing with DJ Rinaldi till late / Tour excursion in the morning, "Different Destinations, A Deeper Love", MCB logo "My Custom Beats · Turning your moments into music", tag "25 years and still our greatest adventure", "People · Places · Memories · Music · Forever".
- **No Princess Cruises name, logo or "You love, we care."; no other cruise-line name, logo, slogan or livery.** Only MCB and DJ Rinaldi branding.
- Not checked: the soundtrack's words (no verified lyrics or transcript exist).

## Implementation

- Web copy `public/videos/mcb-25-year-anniversary-example.mp4`: H.264 High, TV-range yuv420p, original AAC copied, faststart — 12.6 MB (SSIM 0.996 vs master). Command in `scripts/optimise-images.sh`.
- Poster: first frame → `assets/originals/mcb-25-year-anniversary-poster.png` → `anniversary-25-year-poster-*` (JPEG + WebP).
- Player reserves 940×1672 and is 20rem wide (was 22rem at 2:3), otherwise unchanged: controls, `playsInline`, `preload="none"`, no autoplay, no forced mute, poster deferred until the section approaches.
- Removed from the current tree (kept in Git history): the Sprint 3.1 web video, its master, its poster master and all six `anniversary-example-poster-*` derivatives.
- The Princess Cruises review item is closed (CONFIRMATORY, RESOLVED) — a visual check for that branding, not a legal certification. Captions follow-up stays open.

## Browser verification (local preview, cache disabled)

- Homepage first load, no scroll: desktop 631 KB, mobile @1x 553 KB, @2x 587 KB (unchanged from Sprint 3.2).
- MP4: 0 requests and 0 bytes on first load and after scrolling the whole page; after play the replacement streams, decodes (readyState 4) and advances ~4 s in 4 s on desktop and mobile.
- No horizontal overflow. Console: `/api/fx/rates` 404 (no PHP in local preview) and a 400 from the Apollo website tracker in `index.html` (pre-existing since `9ceeb244`); nothing from the video.
