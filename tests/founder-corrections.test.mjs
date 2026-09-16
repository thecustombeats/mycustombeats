/**
 * FOUNDER VISUAL REVIEW — CORRECTIONS 01. Permanent regression coverage.
 *
 * Pins the founders' decisions in the DATA and the RULES, never in the UI
 * alone: a section can be hidden by accident, a rule cannot.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
const load = async (entry) =>
  import(
    `data:text/javascript;base64,${Buffer.from(
      buildSync({ entryPoints: [join(root, entry)], bundle: true, write: false, platform: "node", format: "esm" }).outputFiles[0].text
    ).toString("base64")}`
  );

const catalogue = await load("src/data/catalogue/index.ts");
const personalisation = await load("src/lib/personalisation.ts");

/* ------------------------------------------------------------------ */
/* 13. The product / upsell matrix                                     */
/* ------------------------------------------------------------------ */

const PHYSICAL_SONG_SKUS = [
  "keepsake-7-picture-disc",
  "keepsake-10-heart-picture-disc",
  "keepsake-10-picture-disc",
  "keepsake-12-picture-disc",
  "journey-6",
  "journey-12",
];

test("Finishing Touches offers only what the founders authorised, per product", () => {
  // MOMENT: the video and cards. Nothing else.
  assert.deepEqual([...personalisation.finishingTouchesFor("moment")].sort(), ["memoryVideo", "popUpCards"]);

  // KEEPSAKE and JOURNEY: cards only. The video is a Moment enhancement.
  for (const id of ["keepsake", "journey"]) {
    assert.deepEqual([...personalisation.finishingTouchesFor(id)], ["popUpCards"], `${id} may be offered cards only`);
    assert.equal(personalisation.offersFinishingTouch(id, "memoryVideo"), false, `${id} must not be offered the video`);
    assert.equal(personalisation.offersFinishingTouch(id, "plaque"), false, `${id} must not be offered the plaque`);
    assert.equal(personalisation.offersFinishingTouch(id, "lyricsFrames"), false, `${id} must not be offered a lyrics frame`);
  }

  // The plaque and the lyrics frames are an upsell to NOTHING.
  for (const id of ["moment", "keepsake", "journey"]) {
    assert.equal(personalisation.offersFinishingTouch(id, "plaque"), false);
    assert.equal(personalisation.offersFinishingTouch(id, "lyricsFrames"), false);
  }

  // An unknown product is offered nothing, rather than everything.
  assert.deepEqual([...personalisation.finishingTouchesFor("something-new")], []);
});

test("the Memory Music Video is refused for anything but a Moment — in the rules, not the UI", () => {
  // Allowed: a Moment.
  const withMoment = catalogue.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "memory-music-video", quantity: 1 }]);
  assert.equal(withMoment.ok, true);
  assert.equal(withMoment.totalMinor, 6400, "Moment + Video = £64");

  // Refused: every physical song product.
  for (const sku of PHYSICAL_SONG_SKUS) {
    const preview = catalogue.previewOrder([{ sku, quantity: 1 }, { sku: "memory-music-video", quantity: 1 }]);
    assert.equal(preview.ok, false, `${sku} must not be able to buy a Memory Music Video`);
    assert.equal(preview.reason, "memory_video_ineligible");
  }

  // And the server enforces the same thing, so hiding it is not the control.
  const server = read("public/api/lib/catalogue.php");
  assert.match(server, /=== 'moment'\) === \[\]/);
  assert.match(server, /The MCB Memory Music Video is an enhancement for a Moment/);
});

test("the retired Lyrics Frames reach no customer surface", () => {
  const frames = catalogue.LYRICS_FRAME;
  assert.equal(frames.public, false, "not shown to customers");
  assert.equal(frames.variants.length, 5, "still the five FRAME-family SKUs in the registry");

  // Invisible to every list a page or a crawler builds from.
  assert.ok(!catalogue.publicProducts().some((p) => p.id === "lyrics-frame"));
  assert.ok(!catalogue.addOnProducts().some((p) => p.id === "lyrics-frame"));
  assert.ok(!catalogue.songExperiences().some((p) => p.id === "lyrics-frame"));

  // Offered as a finishing touch to nothing.
  for (const id of ["moment", "keepsake", "journey"]) {
    assert.equal(personalisation.offersFinishingTouch(id, "lyricsFrames"), false);
  }

  // And named on no customer-facing page.
  const pages = [...walk("src/pages"), ...walk("src/sections")]
    .filter((f) => /\.tsx$/.test(f) && !/command-centre|CommandCentre|Operations|CustomerCare/.test(f));
  for (const file of pages) {
    const jsxText = [...read(file).matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
    assert.doesNotMatch(jsxText, /Lyrics Frame/i, `${file} still names a Lyrics Frame`);
  }
});

test("cards may accompany a Moment, so the international card order can be paid", () => {
  const preview = catalogue.previewOrder([
    { sku: "moment", quantity: 1 },
    { sku: "pop-up-card-paper-flower-pack-8", quantity: 1 },
  ]);
  assert.equal(preview.ok, true);
  assert.equal(preview.totalMinor, 1500 + 12999, "£15 + £129.99 = £144.99");
  assert.equal(catalogue.formatMinor(preview.totalMinor), "£144.99");
  assert.equal(preview.requiresShipping, true);
});

/* ------------------------------------------------------------------ */
/* 14. ONE PHYSICAL KEEPSAKE = ONE ARTWORK PHOTO                       */
/* ------------------------------------------------------------------ */

test("every physical vinyl product asks for exactly ONE artwork photograph, whatever its song count", () => {
  for (const sku of PHYSICAL_SONG_SKUS) {
    const variant = catalogue.getVariant(sku).variant;
    const draft = personalisation.chooseVariant(personalisation.emptyDraft(), sku);
    const unit = draft.units[0];
    assert.equal(unit.memories.length, variant.songCount, `${sku}: one memory per song`);

    // One photo, on this unit, satisfies the requirement — for 1, 3, 4, 6 and 12 songs alike.
    const onePhoto = new Set([unit.memories[0].id]);
    const checks = new Map([[unit.memories[0].id, { width: 2500, height: 2500 }]]);
    assert.deepEqual(
      personalisation.photoIssues(draft, onePhoto, checks),
      [],
      `${sku} (${variant.songCount} songs) must be satisfied by ONE photograph`
    );

    // No photo at all is one complaint about the record, never one per song.
    const missing = personalisation.photoIssues(draft, new Set(), new Map());
    assert.equal(missing.length, 1, `${sku}: one missing-photo issue, not ${variant.songCount}`);
    assert.equal(missing[0].kind, "missing");
    assert.equal(missing[0].id, unit.id, "the photo belongs to the record, not to a song");
  }
});

test("the order form renders one artwork photo field per record, not one per song", () => {
  const story = read("src/pages/create/StepStory.tsx");
  // One field, outside the memory list, bound to the unit's first memory.
  assert.match(story, /ONE ARTWORK PHOTOGRAPH FOR THE WHOLE RECORD/);
  assert.match(story, /photoArtwork && unit\.memories\[0\]/);
  assert.match(story, /setPhoto\(unit\.memories\[0\]\.id, file\)/);
  // …and the per-memory editor shows none for a photo-artwork product.
  assert.match(story, /showPhoto=\{!photoArtwork\}/);
  const editor = read("src/pages/create/MemoryEditor.tsx");
  assert.match(editor, /\{showPhoto && \(/);
});

test("the £15 Artwork Preparation Service is once per order, never per song", () => {
  for (const sku of PHYSICAL_SONG_SKUS) {
    // Two of them is refused, whatever the song count.
    const twice = catalogue.previewOrder([{ sku, quantity: 1 }, { sku: "artwork-preparation", quantity: 2 }]);
    assert.equal(twice.ok, false, `${sku}: a second Artwork Preparation must be refused`);
    assert.equal(twice.reason, "artwork_preparation_ineligible");

    const once = catalogue.previewOrder([{ sku, quantity: 1 }, { sku: "artwork-preparation", quantity: 1 }]);
    assert.equal(once.ok, true, `${sku}: one Artwork Preparation is allowed`);
    const line = once.lines.find((l) => l.sku === "artwork-preparation");
    assert.equal(line.quantity, 1);
    assert.equal(line.lineMinor, 1500, "£15, once — never multiplied by songs");
  }
  // And the draft can only ever build one line for it.
  assert.match(read("src/lib/personalisation.ts"), /sku: ARTWORK_PREPARATION_SKU, quantity: 1/);
});

/* ------------------------------------------------------------------ */
/* Payment first: uncertainty never blocks payment                     */
/* ------------------------------------------------------------------ */

test("a delivery class MCB cannot price does not stop the customer paying", () => {
  const delivery = read("public/api/lib/delivery.php");
  // The old rule made the whole order unpayable. It is gone.
  assert.doesNotMatch(delivery, /return DeliveryQuote::unavailable\('MCB_CONFIRMS_DELIVERY', array_values\(array_unique\(\$review\)\)\);/);
  // Those items are arranged by MCB instead, at no extra charge.
  assert.match(delivery, /public static function arranged/);
  assert.match(delivery, /'MCB_ARRANGED'/);
  assert.match(delivery, /\$arranged\[\] ?=|array_push\(\$arranged/);
  // A known impossibility still stops the sale, from route evidence.
  assert.match(delivery, /delivery_route_confirmation_skus/);
});

test("no customer-facing copy promises to confirm delivery before payment", () => {
  const publicSource = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components"), ...walk("src/data"), ...walk("src/lib")]
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/command-centre|CommandCentre|Operations|CustomerCare/.test(f));
  const offenders = [];
  for (const file of publicSource) {
    for (const line of read(file).split("\n")) {
      if (/^\s*(\*|\/\/)/.test(line)) continue;
      // "check your details before you pay" is fine; promising MCB will confirm
      // DELIVERY or AVAILABILITY before payment is not.
      if (/(confirm|check)[^."]{0,60}(delivery|availability)[^."]{0,40}before (you pay|payment)/i.test(line)) {
        offenders.push(`${file}: ${line.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

/* ------------------------------------------------------------------ */
/* Imagery and evidence                                                */
/* ------------------------------------------------------------------ */

test("the pop-up cards carry the approved example photograph and say it is an example", () => {
  const cards = catalogue.POP_UP_CARD;
  assert.equal(cards.image, "pop-up-card");
  assert.ok(cards.imageAlt && cards.imageAlt.length > 10);
  assert.equal(cards.variants.length, 18, "one example image, all eighteen designs");

  const disclosure = cards.disclosures.join(" ");
  assert.match(disclosure, /example/i, "it must say the photograph is an example");
  assert.match(disclosure, /surprise/i, "and why every design is not shown");
  // No unverified specification, and "big" is not a size claim.
  assert.doesNotMatch(disclosure, /\bbig\b/i);
  assert.doesNotMatch(disclosure, /\d+\s*(cm|mm|inch|inches|")/i);
  assert.doesNotMatch(disclosure, /identical|the same design|exactly like/i);

  // The derivatives actually exist, so the page cannot render a broken image.
  for (const width of [480, 960, 1600]) {
    for (const ext of ["jpg", "webp"]) {
      assert.ok(existsSync(join(root, `public/images/responsive/pop-up-card-${width}.${ext}`)), `missing pop-up-card-${width}.${ext}`);
    }
  }
});

test("no plaque photograph is published, because the only candidate is the wrong product", () => {
  // public/images/products/plaque.jpg is a crystal award with a QR code and
  // "Scan to hear your custom song" — a different product, and it would imply
  // the plaque plays music. It is registered nowhere and rendered nowhere.
  const imagery = read("src/data/imagery.ts");
  assert.doesNotMatch(imagery, /plaque/i, "the plaque image must not be in the registry");
  const publicSource = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components")]
    .filter((f) => /\.tsx$/.test(f))
    .map(read)
    .join("\n");
  assert.doesNotMatch(publicSource, /products\/plaque\.jpg/);
  assert.equal(catalogue.PERSONALISED_MUSIC_PLAQUE.image, null, "MUSIC_PLAQUE_IMAGE_REQUIRED");
  // The product's own facts are unchanged, and it still never claims to play.
  assert.equal(catalogue.PERSONALISED_MUSIC_PLAQUE.variants[0].price.minor, 4999);
  assert.match(catalogue.PERSONALISED_MUSIC_PLAQUE.disclosures.join(" "), /does not play/i);
});

test("no testimonial is published without recorded permission", () => {
  const testimonials = catalogue.TESTIMONIALS ?? null;
  const mod = readFileSync(join(root, "src/data/testimonials.ts"), "utf8");
  assert.match(mod, /permissionEvidence/);
  assert.match(mod, /export const TESTIMONIALS: readonly Testimonial\[\] = \[\];/, "TESTIMONIAL_PERMISSION_REQUIRED stands");
  assert.equal(testimonials, null, "testimonials are their own module, not the catalogue");
  // Whatever is added later, one without recorded permission is never shown.
  assert.match(mod, /permissionEvidence\.trim\(\)\.length > 0/);
});

test("the onboard trust strip names guests, not partners, and says so visibly", () => {
  const trust = read("src/sections/home/TrustEvidence.tsx");
  assert.match(trust, /Used by guests on board/, "the approved heading");
  // The non-affiliation notice is rendered copy, not only a source comment.
  assert.match(trust, /not\s*\n?\s*affiliated with, endorsed by or a partner of the cruise lines shown/);
  for (const word of ["endorse", "partner with MCB", "sponsor", "recommend"]) {
    assert.doesNotMatch(trust.replace(/not\s+affiliated[\s\S]{0,120}/, ""), new RegExp(`${word}s? MCB`, "i"));
  }
  // Names as type; no logo is used, because none is licensed.
  assert.doesNotMatch(trust, /<img/);
  assert.doesNotMatch(trust, /brand\.logo/);
  // And it is actually on the page.
  assert.match(read("src/App.tsx"), /<TrustEvidence \/>/);
});

/* ------------------------------------------------------------------ */
/* Country ordering                                                    */
/* ------------------------------------------------------------------ */

test("the delivery country list leads with the United States and the United Kingdom", async () => {
  const countries = await load("src/data/countries.ts");
  const ordered = countries.COUNTRIES_FOR_DELIVERY;
  assert.equal(ordered[0].code, "US");
  assert.equal(ordered[0].name, "United States");
  assert.equal(ordered[1].code, "GB");
  assert.equal(ordered[1].name, "United Kingdom");
  // Nothing removed, nothing renamed, no code changed.
  assert.equal(ordered.length, countries.COUNTRIES.length);
  assert.deepEqual([...ordered].map((c) => c.code).sort(), [...countries.COUNTRIES].map((c) => c.code).sort());
  for (const country of ordered) {
    assert.equal(country.name, countries.COUNTRIES.find((c) => c.code === country.code).name);
  }
  // The form uses the ordered list.
  assert.match(read("src/pages/create/StepDetails.tsx"), /COUNTRIES_FOR_DELIVERY\.map/);
});

/* ------------------------------------------------------------------ */
/* The example film                                                    */
/* ------------------------------------------------------------------ */

test("the example film is discoverable, shows a poster at rest, and never autoplays", () => {
  const showcase = read("src/sections/SongShowcaseSection.tsx");
  // The poster is unconditional: the player used to be a black rectangle until
  // an IntersectionObserver fired, which is why it was reported as missing.
  assert.match(showcase, /poster=\{imageSrc\(IMAGES\.anniversaryExamplePoster/);
  assert.doesNotMatch(showcase, /nearViewport/);
  assert.doesNotMatch(showcase, /\bautoPlay\b/);
  assert.match(showcase, /preload="none"/, "no video bytes before a click");
  assert.match(showcase, /controls/);
  // A way in from the first screen.
  assert.match(read("src/sections/HeroSection.tsx"), /hash: "#samples"/);
  assert.match(read("src/sections/HeroSection.tsx"), /Watch an example/);
  // Nothing about how it was made.
  assert.doesNotMatch(showcase, /Mozart|\bAI\b/);
});
