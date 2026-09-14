#!/bin/bash
# Generates the responsive JPEG derivatives in public/images/responsive/ from
# the approved source images. macOS `sips` only; re-run after replacing a
# source image. Outputs are committed so the build needs no image tooling.
#
#   bash scripts/optimise-images.sh
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
)

for entry in "${SOURCES[@]}"; do
  name="${entry%%:*}"; src="${entry#*:}"
  srcw=$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')
  for width in 480 960 1600; do
    # Never upscale: a derivative wider than its source is larger, not sharper.
    w=$(( width < srcw ? width : srcw ))
    sips -s format jpeg -s formatOptions 72 --resampleWidth "$w" "$src" --out "$OUT/$name-$width.jpg" >/dev/null
  done
done
echo "responsive images written to public/images/$OUT"
