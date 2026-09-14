#!/bin/bash
# Generates the responsive JPEG and WebP derivatives in public/images/responsive/
# from the approved source images. macOS `sips` plus `cwebp`; re-run after
# replacing a source image. Outputs are committed so the build needs no image tooling.
#
#   bash scripts/optimise-images.sh
#
# The web video (public/videos/mcb-25th-anniversary-example.mp4) is made from
# its master with:
#   ffmpeg -i "assets/originals/25th Anniversary MCB Example.MP4" -map 0:v:0 -map 0:a:0 \\
#     -c:v libx264 -preset slow -crf 18 -tune stillimage -profile:v high -level 4.0 \\
#     -pix_fmt yuv420p -g 750 -keyint_min 750 -sc_threshold 0 -c:a copy \\
#     -movflags +faststart public/videos/mcb-25th-anniversary-example.mp4
set -euo pipefail
cd "$(dirname "$0")/../public/images"
OUT=responsive
mkdir -p "$OUT"

# name:source — names are what src/data/imagery.ts references.
SOURCES=(
  "celebration-deck:hero-1.jpg"
  "friends-toast:hero-2.jpg"
  "sea-toast:hero-3.jpg"
  "dance-deck:hero-4.jpg"
  "window-toast:hero-champagne.jpg"
  "cruise-couple:hero-cruise-couple.jpg"
  "cruise-dance:hero-cruise.jpg"
  "gift-at-sea:gift-box-hands.jpg"
  "travel-journal:lyrics-section.jpg"
  "family-terrace:sample-family.jpg"
  "honeymoon-deck:sample-honeymoon.jpg"
  "solo-deck:sample-solo.jpg"
  "proposal-deck:moments/proposal.jpg"
  "wedding-deck:moments/wedding.jpg"
  "anniversary:moments/anniversary.jpg"
  "vinyl-sleeve:products/vinyl.jpg"
  "lyrics-frame:products/artwork.jpg"
  "phone-gramophone:brand/phone-gramaphone.png"
  "brass-gramophone:brand/vintage-gramaphone.png"
  "suitcase-player:brand/portable-recordplayer.png"
  # Founder-approved MCB marketing assets (Sprint 3.1). Masters live outside
  # the public delivery path in assets/originals/.
  "keepsake-sleeve-wall:../../assets/originals/mcb-wall-art-sleeves.png"
  "picture-disc-wall:../../assets/originals/mcb-wall-art-picture-discs.png"
  "anniversary-example-poster:../../assets/originals/mcb-25th-anniversary-poster.png"
)

for entry in "${SOURCES[@]}"; do
  name="${entry%%:*}"; src="${entry#*:}"
  srcw=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  for width in 480 960 1600; do
    # Never upscale: a derivative wider than its source is larger, not sharper.
    w=$(( width < srcw ? width : srcw ))
    sips -s format jpeg -s formatOptions 72 --resampleWidth "$w" "$src" --out "$OUT/$name-$width.jpg" >/dev/null
    # WebP twin, encoded from the source (not the JPEG). ResponsiveImage offers
    # it through <picture>; the JPEG stays as the fallback and for share images.
    # Needs cwebp (brew install webp).
    cwebp -quiet -q 75 -m 6 -sharp_yuv -metadata none -resize "$w" 0 "$src" -o "$OUT/$name-$width.webp"
  done
done
echo "responsive images written to public/images/$OUT"
