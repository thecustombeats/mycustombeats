# Sprint 3.2 — founder imagery (video replacement deferred)
Date: 14 September 2026 · Branch: `mcb-release-candidate-20260914`

**NOT DEPLOYED. CHECKOUT REMAINS OFF.** No catalogue, checkout, API, database or Stripe change.

## Replacement anniversary video — not adopted

The replacement `25th Anniversary MCB Example.mp4` (33.6 MB, 1024×1536, 30 fps, H.264 High + AAC-LC 253 kb/s, 4:55) was inspected frame by frame, not by filename:

- 0:00–~0:04 — MCB logos top-left and bottom-left.
- ~0:05 to the end — the **Princess Cruises** logo (top-left) and **PRINCESS / "You love, we care."** (bottom-left) are still present in every sampled frame (every 15 s, plus 1:00, 2:30, 4:54).
- The ships in the artwork carry a blue wave hull design associated with Princess Cruises.

Founder decision: keep the Sprint 3.1 video and its BLOCKING review item unchanged, and integrate the founder photographs now. The video is replaced in a follow-up once a fully clean export is supplied. The blocker in `src/data/legal/review.ts` records this finding.

Captions/transcript: still open, separately (`RECORDED_NON_BLOCKERS`).

## Founder photographs

The two supplied files are pixel-identical to the Sprint 3.1 files "LOOKING OUT TO SEA.png" and "WELCOME ABOARD.png", renamed. Founder confirmed they should be used.

- **Homepage cruise section** — `rinaldi-at-sea` (Rinaldi looking out to sea holding an MCB vinyl) replaces the stock "woman in a sun hat" photograph. Portrait 4:5 crop keeping face, record and sea; lazy-loaded; no copy change; no cruise line named.
- **Our Story (`/about`)** — `rinaldi-portrait` beside the founder cards. Not placed near the homepage founder note, which stays typographic by design.

Masters: `assets/originals/rinaldi-looking-out-to-sea-mcb-vinyl.png`, `assets/originals/rinaldi-holding-mcb-vinyl.png` (941×1672). Derivatives: JPEG + WebP at 480 and 941 px wide (the 960/1600 names are the never-upscaled 941 px copy).

## Homepage transfer (same method as Sprint 3.1, no scroll)

| Viewport | Sprint 3.1 | Sprint 3.2 |
|---|---|---|
| Desktop 1440×900 | 630 KB | 631 KB |
| Mobile @1x | 553 KB | 553 KB |
| Mobile @2x | 587 KB | 587 KB |

No MP4 bytes before play; MP4 requested after play.
