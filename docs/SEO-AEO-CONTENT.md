# SEO, answer-engine and content notes

Sprint 6 · Release candidate · Not deployed.

## Indexing rules

| Class | Routes | Controls |
|---|---|---|
| Indexable | `/`, `/products`, `/moment`, `/keepsake`, `/journey`, `/bespoke`, `/mcb-live`, `/priority-replacement`, `/occasions`, `/cruise`, `/faq`, `/anniversary-song`, `/about`, `/artists`, `/partners`, `/press`, `/artists/apply`, `/affiliate`, `/legal/*`, `/blog`, `/blog/:slug` | In `sitemap.xml`; one title, description, h1 and canonical each |
| Never indexed | `/your-order`, `/approve`, `/operations`, `/thank-you`, `/dashboard`, `/artist-thank-you`, `/partner-thank-you`, `/create`, 404, `/api/`, `/luxury/` | Page `robots` meta **and** `X-Robots-Tag` header; `robots.txt` Disallow for private and API paths. Access control is separate and server-side |

Canonical: `https://www.mycustombeats.com` + path, no query string, no trailing slash. Apache 301s apex → www, `/path/` → `/path`, `/full-package` → `/bespoke` (query kept). `/contact` routes to the homepage contact section. Unknown routes render a noindex 404 page; the SPA host answers them with HTTP 200 (a known single-page-app limitation, mitigated by noindex).

## Structured data

- One `OnlineStore` organisation node (name, MCB, logo, email, phone, YouTube only). No founding date, awards, ratings, review counts, employee numbers or partnerships.
- Fixed-price products: `Product`/`ProductGroup` with exact GBP `Offer`s from the catalogue; `MadeToOrder` for records; per-variant facts (songs, picture disc true/false, size, shape, number of records, gatefold).
- Bespoke and MCB LIVE: `Service` with no offer, price or availability.
- Product images only where the photograph shows the product (Journey, frames, players). Moment, Keepsake and Bespoke have none: their page photographs are lifestyle or display-wall examples, and a Keepsake includes no wall mounting.
- `FAQPage` only on `/faq`, generated from exactly the visible questions. Google limits FAQ rich results to a few site types; the markup remains accurate description. No FAQ schema on product pages or articles.
- Articles: `BlogPosting` + `BreadcrumbList`, author "My Custom Beats" (Founder decision).

## Answers (AEO)

`src/lib/productAnswers.ts` builds short visible answers from the catalogue: what a Picture Disc Keepsake is; songs per Keepsake (7-inch 1, Heart 1, 10-inch 3, 12-inch 4); Keepsake vs Journey; Journey is not a Picture Disc (6 songs: one 12-inch standard record; 12 songs: two records, gatefold); the Music Plaque does not play music; how a Moment is delivered; what happens after ordering; how approval works. They appear on the product pages ("Questions people ask") and the FAQ, so every answer engine sees the same, true text as customers.

## Internal links

Product pages → the most relevant article and the FAQ. Articles → Moment/Journey (memory article), Keepsake/Journey (cruise article), Keepsake/Journey (picture-disc article). Footer → Blog. No sitewide keyword links.

## Blog quality review

The three articles were re-read for accuracy against the catalogue (sizes, song counts, standard vinyl vs picture disc, planning days), readability, headings, internal links and CTA balance. Tests forbid statistics, research claims, testimonials, endorsements, cruise-line names and guarantees. No new articles were added.

## Images and video

All meaningful images have descriptive, non-stuffed alt text; decorative images use `alt=""`. Responsive derivatives with reserved dimensions are used for approved photography. Occasion-page photos were resized in place (memorial 1.9 MB → 181 KB); occasion loops no longer autoplay on load and stay still for reduced-motion or data-saver visitors. The anniversary example video keeps native controls, `preload="none"`, `playsInline`, no autoplay and no MP4 download before play. Captions remain a follow-up until a verified transcript exists.
