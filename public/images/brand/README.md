# Brand assets

Put approved brand artwork here — logos, wordmarks, social/OG images.

## Why here and not in `dist/`

`dist/` is Vite's build output. **Vite empties it on every `npm run build`**,
so any file placed there is destroyed by the next build.

Everything in `public/` is copied into `dist/` during the build and is
referenced from the site root. A file at:

    public/images/brand/mcb-logo.png

is served at:

    /images/brand/mcb-logo.png

That survives every rebuild and is tracked in git.

## Current logo files

The site's existing logos are `public/logo-dark.png` (for light backgrounds)
and `public/logo-light.png` (for dark backgrounds), used by the header and
footer respectively. Replacements should keep transparency and be at least
2× their largest rendered size — the footer renders 160px tall on desktop.
