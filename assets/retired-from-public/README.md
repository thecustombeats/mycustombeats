# Retired from `public/`

These files were sitting in `public/`, so every deployment shipped them, but no
page, stylesheet or script referenced any of them. Together they were 17.7 MB
of the 87 MB `public/` tree.

They are kept here rather than deleted: `assets/` is repository-only and is not
copied into `dist/`, so they stay recoverable without being served.

| File | Size | Why it is here |
|---|---|---|
| `hero-luxury.mp4` | 7.9 MB | Background video from the old hero, replaced by the responsive photograph composition. |
| `products.mp4` | 5.5 MB | Old products video; the homepage now shows the 25-year anniversary example instead. |
| `products-poster.jpg` | 100 KB | Poster for `products.mp4`. |
| `founder1-rinaldi.jpg` | 2.3 MB | Superseded by the approved founder imagery in `assets/originals/` (`rinaldi-holding-mcb-vinyl.png`, `rinaldi-looking-out-to-sea-mcb-vinyl.png`), which is what `/about` and the homepage use. Unoptimised and never referenced. |
| `founder2-lakh.jpg` | 1.9 MB | As above. No page has ever referenced it. |

Also deleted in the same change (regenerable from `scripts/optimise-images.sh`,
and no registry entry pointed at them): the `dance-deck-*` and `window-toast-*`
responsive derivative sets.
