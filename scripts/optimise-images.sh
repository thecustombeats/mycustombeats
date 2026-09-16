#!/bin/bash
# Generates the responsive JPEG and WebP derivatives in public/images/responsive/
# from the approved source images. macOS `sips` plus `cwebp`; re-run after
# replacing a source image. Outputs are committed so the build needs no image tooling.
#
#   bash scripts/optimise-images.sh
#
# The web video (public/videos/mcb-25-year-anniversary-example.mp4) is made from
# its master with (the master is full-range yuvj420p; the web copy is TV range):
#   ffmpeg -i assets/originals/mcb-25-year-anniversary-example.mp4 -map 0:v:0 -map 0:a:0 \\
#     -vf "scale=in_range=pc:out_range=tv,format=yuv420p" \\
#     -c:v libx264 -preset slow -crf 18 -tune stillimage -profile:v high -level 4.0 \\
#     -color_range tv -g 750 -keyint_min 750 -sc_threshold 0 -c:a copy \\
#     -movflags +faststart public/videos/mcb-25-year-anniversary-example.mp4
# Its poster master is the first frame:
#   ffmpeg -i assets/originals/mcb-25-year-anniversary-example.mp4 -frames:v 1 \\
#     assets/originals/mcb-25-year-anniversary-poster.png
set -euo pipefail
cd "$(dirname "$0")/../public/images"
OUT=responsive
mkdir -p "$OUT"

# name:source — names are what src/data/imagery.ts references.
SOURCES=(
  # The approved Pop-Up Card photograph (commit 51478af8: "a genuine pop-up
  # opening to a paper bouquet, not an NFC tap-card"). One EXAMPLE image
  # represents all eighteen designs — the card itself is part of the surprise.
  "pop-up-card:brand/Pop-Up-Card.png"
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
  "anniversary-25-year-poster:../../assets/originals/mcb-25-year-anniversary-poster.png"
  # Founder-approved photographs of Rinaldi with an MCB vinyl (Sprint 3.2).
  "rinaldi-at-sea:../../assets/originals/rinaldi-looking-out-to-sea-mcb-vinyl.png"
  "rinaldi-portrait:../../assets/originals/rinaldi-holding-mcb-vinyl.png"
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
