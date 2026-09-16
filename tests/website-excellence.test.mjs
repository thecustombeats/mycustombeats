/**
 * WEBSITE EXCELLENCE, CONVERSION & EXPERIENCE CLOSURE — regression tests.
 *
 * Each test here pins a defect this sprint found and fixed on the public site,
 * so it cannot come back quietly. They read source and generated data only —
 * no server, no network, no payment. The rendered-page checks (axe, contrast,
 * overflow, tap targets, screenshots at four widths) are the browser
 * rehearsal; these are the ones a CI run can keep honest on its own.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSync } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
/** Source with comments removed: a comment may name a term the copy may not. */
const code = (source) => source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, " ");

const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });

const catalogue = await import(
  `data:text/javascript;base64,${Buffer.from(
    buildSync({
      entryPoints: [join(root, "src/data/catalogue/index.ts")],
      bundle: true,
      write: false,
      platform: "node",
      format: "esm",
    }).outputFiles[0].text
  ).toString("base64")}`
);

/* ------------------------------------------------------------------ */
/* Support identity and the MCB LIVE line                              */
/* ------------------------------------------------------------------ */

test("the MCB LIVE WhatsApp line is never offered as ordinary order support", () => {
  const WA = /wa\.me\/447340742009/;

  // The pages an existing customer uses for order help must not float a
  // WhatsApp shortcut over them.
  const cta = read("src/components/FloatingCTA.tsx");
  for (const path of ["/thank-you", "/your-order", "/approve", "/create"]) {
    assert.match(cta, new RegExp(`"${path}"`), `FloatingCTA must be hidden on ${path}`);
  }

  // The delivery-confirmation step offers email, not the booking line.
  const review = read("src/pages/create/StepReview.tsx");
  assert.doesNotMatch(review, WA);
  assert.match(review, /mailto:hello@mycustombeats\.com/);

  // Where the number IS offered, it is MCB LIVE's own page or a pre-sales
  // enquiry — never the order surfaces.
  const orderSurfaces = [...walk("src/pages/order"), "src/pages/YourOrder.tsx", "src/pages/ThankYou.tsx", "src/pages/Approve.tsx"].filter((f) => /\.tsx?$/.test(f));
  for (const file of orderSurfaces) assert.doesNotMatch(read(file), WA, `${file} offers WhatsApp for order support`);
});

test("structured data does not publish the MCB LIVE line as customer support", () => {
  const html = read("index.html");
  const org = JSON.parse(html.slice(html.indexOf("{", html.indexOf('type="application/ld+json"')), html.lastIndexOf("}") + 1));

  // The organisation declares no telephone of its own: it has no support line.
  assert.equal(org.telephone, undefined, "the MCB LIVE number is not the organisation's phone");

  const points = org.contactPoint;
  assert.ok(Array.isArray(points), "two contact points, not one merged claim");
  const support = points.find((p) => p.contactType === "customer support");
  const live = points.find((p) => p.contactType === "sales");
  assert.equal(support.telephone, undefined, "support is email, never the booking line");
  assert.equal(support.email, "hello@mycustombeats.com");
  assert.equal(live.name, "MCB LIVE");
  assert.equal(live.telephone, "+447340742009");

  // seo.ts must say the same thing: it merges into the same @id node.
  const seo = read("src/lib/seo.ts");
  assert.doesNotMatch(seo, /\n {2}telephone: /, "no organisation-level telephone");
  assert.match(seo, /contactType: "customer support",\s*\n\s*email: CONTACT_EMAIL/);
  assert.match(seo, /name: "MCB LIVE",\s*\n\s*telephone: MCB_LIVE_PHONE/);
});

test("hello@ is the public support identity and support@ is never promoted", () => {
  const publicSource = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components"), ...walk("src/data")]
    .filter((f) => /\.tsx?$/.test(f))
    .map(read)
    .join("\n");
  assert.match(publicSource, /hello@mycustombeats\.com/);
  assert.doesNotMatch(publicSource, /support@mycustombeats\.com/);
});

/* ------------------------------------------------------------------ */
/* Pop-up cards                                                        */
/* ------------------------------------------------------------------ */

test("all 18 pop-up cards are grouped by occasion, each exactly once, at catalogue prices", () => {
  assert.deepEqual(catalogue.validateCardGroups(), []);
  const grouped = catalogue.groupedCards();
  const skus = grouped.flatMap((g) => g.variants.map((v) => v.sku));
  assert.equal(skus.length, 18);
  assert.equal(new Set(skus).size, 18, "no card appears in two groups");
  assert.deepEqual(skus.sort(), catalogue.POP_UP_CARD.variants.map((v) => v.sku).sort());
  // Every group is shown to a customer with a name and a line of help.
  for (const { group, variants } of grouped) {
    assert.ok(group.label.length > 3 && group.hint.length > 10, `group ${group.id} needs a label and a hint`);
    assert.ok(variants.length > 0);
  }
  // Prices are read, never restated.
  // The grouping restates no commercial value; it names SKUs only.
  assert.doesNotMatch(code(read("src/data/catalogue/cardGroups.ts")), /£|\bgbp\(|price/i);
});

test("the order form opens one card group, not eighteen steppers", () => {
  const extras = read("src/pages/create/StepExtras.tsx");
  assert.match(extras, /groupedCards\(\)\.map/);
  assert.match(extras, /<details/, "groups collapse");
  assert.match(extras, /open=\{index === 0 \|\| chosen > 0\}/, "a group holding a chosen card stays open");
  assert.match(extras, /\{chosen\} added/, "a collapsed group still says what is in it");
});

/* ------------------------------------------------------------------ */
/* Prices, capacities and the public claims                            */
/* ------------------------------------------------------------------ */

test("the Founder-decided prices and capacities are what the catalogue holds", () => {
  const price = (sku) => catalogue.getVariant(sku).variant.price.minor;
  const songs = (sku) => catalogue.getVariant(sku).variant.songCount;
  assert.equal(price("moment"), 1500);
  assert.equal(price("memory-music-video"), 4900);
  assert.equal(price("moment") + price("memory-music-video"), 6400, "Moment + Video = £64");
  assert.equal(price("journey-12"), 34900);
  assert.equal(songs("journey-12"), 12);
  assert.equal(price("journey-6"), 19900);
  assert.equal(songs("journey-6"), 6);
  assert.equal(price("keepsake-12-picture-disc"), 14999);
  assert.equal(songs("keepsake-12-picture-disc"), 4);
  assert.equal(price("keepsake-10-picture-disc"), 13999);
  assert.equal(songs("keepsake-10-picture-disc"), 3);
  assert.equal(price("keepsake-10-heart-picture-disc"), 12999);
  assert.equal(songs("keepsake-10-heart-picture-disc"), 1);
  assert.equal(price("keepsake-7-picture-disc"), 9900);
  assert.equal(songs("keepsake-7-picture-disc"), 1);
  assert.equal(price("artwork-preparation"), 1500);
});

test("the Memory Music Video is discoverable on a public, indexable page", () => {
  // It was described only inside /create (noindex) and the token-gated order
  // page, so no browsing customer and no answer engine could find it.
  const products = read("src/pages/Products.tsx");
  assert.match(products, /VIDEO_COPY/);
  assert.match(products, /MEMORY_MUSIC_VIDEO/);
  const faq = read("src/pages/FAQ.tsx");
  assert.match(faq, /What is an \$\{MEMORY_MUSIC_VIDEO\.name\}\?/);
  // Customer language only: no platform, no AI, no credits, no allowance.
  for (const source of [products, faq]) {
    assert.doesNotMatch(code(source), /\bAI\b|Mozart|\bcredits?\b|generation allowance/i);
  }
});

test("the homepage example film is described to crawlers", () => {
  const seo = read("src/lib/seo.ts");
  assert.match(seo, /"@type": "VideoObject"/);
  assert.match(seo, /exampleVideoEntity/);
  // Only facts the page itself carries — no duration, upload date or view count.
  const entity = seo.slice(seo.indexOf("exampleVideoEntity"), seo.indexOf("sampleListEntity"));
  assert.doesNotMatch(entity, /duration|uploadDate|interactionCount|aggregateRating/);
  const showcase = read("src/sections/SongShowcaseSection.tsx");
  assert.match(showcase, /mcb-25-year-anniversary-example\.mp4/);
  assert.doesNotMatch(showcase, /\bautoPlay\b/, "the homepage video never autoplays");
  assert.match(showcase, /preload="none"/);
});

/* ------------------------------------------------------------------ */
/* Creative Authority and the absence of an approval loop              */
/* ------------------------------------------------------------------ */

test("no customer creative-approval loop is offered anywhere a customer can reach", () => {
  const review = read("src/pages/create/StepReview.tsx");
  assert.match(review, /CREATIVE_PROMISE/);
  assert.match(review, /requiredConsents/, "the acknowledgement is explicit");
  // Never preselected.
  assert.doesNotMatch(review, /checked=\{true\}|defaultChecked/);
});

/* ------------------------------------------------------------------ */
/* Dark patterns                                                       */
/* ------------------------------------------------------------------ */

test("no paid enhancement is preselected and no urgency or scarcity is invented", () => {
  const flow = [...walk("src/pages/create"), "src/pages/Products.tsx"].filter((f) => /\.tsx$/.test(f));
  for (const file of flow) {
    const source = read(file);
    assert.doesNotMatch(source, /defaultChecked/, `${file} preselects something`);
    assert.doesNotMatch(
      source,
      /only \d+ left|hurry|selling fast|\d+ people are|limited time only|act now|ends (today|soon)/i,
      `${file} invents urgency or scarcity`
    );
  }
  // Video capacity may be stated, because it is a real, measured limit.
  const offer = read("src/pages/create/VideoOffer.tsx");
  assert.match(offer, /availability/);
});

/* ------------------------------------------------------------------ */
/* Accessibility and the 55+ customer                                  */
/* ------------------------------------------------------------------ */

test("the smallest public type is 14px and public copy is 16px", () => {
  const css = read("src/index.css");
  const label = css.slice(css.indexOf(".label-uppercase"));
  assert.match(label.slice(0, label.indexOf("}")), /font-size: 0\.875rem/, "eyebrow labels are 14px, not 13px");

  // No public component forces the eyebrow back down.
  const publicFiles = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components")]
    .filter((f) => /\.tsx$/.test(f))
    .filter((f) => !/command-centre|Operations|CustomerCare|CommandCentre|\/ui\//.test(f));
  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /label-uppercase[^"`]*!text-\[0\.8/, `${file} shrinks the eyebrow below 14px`);
  }
});

test("the Terms contents list is readable and tappable", () => {
  const terms = read("src/pages/legal/Terms.tsx");
  assert.match(terms, /min-h-11 items-center text-base/, "26 stacked links need a full-size row");
});

/* ------------------------------------------------------------------ */
/* Navigation, links and dead ends                                     */
/* ------------------------------------------------------------------ */

test("no public CTA points at the retired /#order anchor", () => {
  const publicFiles = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components")].filter((f) => /\.tsx$/.test(f));
  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /href="\/#order"|href="#order"/, `${file} still links to the retired order anchor`);
  }
});

test("every page in the sitemap is reachable by an internal link", () => {
  const sitemap = read("public/sitemap.xml");
  const paths = [...sitemap.matchAll(/<loc>https:\/\/www\.mycustombeats\.com([^<]*)<\/loc>/g)]
    .map((m) => m[1] || "/")
    .filter((p) => p !== "/");
  const links = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components")]
    .filter((f) => /\.tsx$/.test(f))
    .map(read)
    .join("\n");
  // Blog articles are linked from /blog by slug, so their paths are built at
  // render time rather than written out; each must exist as a real post.
  const posts = read("src/data/blog/posts.ts");
  const orphans = paths.filter((p) => {
    if (p.startsWith("/blog/")) return !posts.includes(`slug: "${p.slice("/blog/".length)}"`);
    return !links.includes(`"${p}"`);
  });
  assert.deepEqual(orphans, [], "indexable pages nothing links to");
});

/* ------------------------------------------------------------------ */
/* SEO hygiene                                                         */
/* ------------------------------------------------------------------ */

test("the unlinked /luxury preview carries its own noindex and a robots rule", () => {
  assert.match(read("public/luxury/index.html"), /<meta name="robots" content="noindex, nofollow">/);
  assert.match(read("public/robots.txt"), /^Disallow: \/luxury$/m);
  // Still unlinked from the app.
  const app = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components")]
    .filter((f) => /\.tsx$/.test(f))
    .map(read)
    .join("\n");
  assert.doesNotMatch(app, /["'`]\/luxury/);
});

test("the guided flow is excluded from search in robots.txt as well as its meta tag", () => {
  assert.match(read("public/robots.txt"), /^Disallow: \/create$/m);
  assert.match(read("src/pages/CreateMemory.tsx"), /noindex/);
});

test("every homepage-specific head tag in index.html is removed on other routes", () => {
  const html = read("index.html");
  for (const tag of html.match(/<meta[^>]*property="og:[^"]*"[^>]*>/g) ?? []) {
    if (/og:site_name/.test(tag)) continue; // true of every page
    assert.match(tag, /data-static-seo/, `${tag} would leak the homepage value onto every route`);
  }
});

test("no public page emits a keywords meta tag", () => {
  const publicFiles = [...walk("src/pages"), ...walk("src/sections")].filter((f) => /\.tsx$/.test(f));
  for (const file of publicFiles) {
    assert.doesNotMatch(read(file), /name="keywords"/, `${file} emits an obsolete keywords tag`);
  }
});

/* ------------------------------------------------------------------ */
/* Supplier privacy on the customer-facing build                       */
/* ------------------------------------------------------------------ */

test("no supplier identity, cost, margin or route score reaches public source", () => {
  const publicSource = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components"), ...walk("src/lib")]
    .filter((f) => /\.tsx?$/.test(f))
    .filter((f) => !/command-centre|CommandCentre|Operations|CustomerCare/.test(f))
    .map((f) => `${f}\n${read(f)}`)
    .join("\n");
  for (const forbidden of [/supplier_?(name|url|cost|price)/i, /partnerGroup/, /routeScore|route_score/i, /marginMinor|margin_minor/i]) {
    assert.doesNotMatch(publicSource, forbidden, `public source mentions ${forbidden}`);
  }
});

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

test("srcset never offers two candidates at the same width", () => {
  const imagery = read("src/data/imagery.ts");
  assert.match(imagery, /const seen = new Set<number>\(\)/);
  // Prove it on a source narrower than the largest derivative width.
  const mod = buildSync({
    entryPoints: [join(root, "src/data/imagery.ts")],
    bundle: true,
    write: false,
    platform: "node",
    format: "esm",
  }).outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(mod).toString("base64")}`).then((m) => {
    for (const image of Object.values(m.IMAGES)) {
      const descriptors = m.imageSrcSet(image).split(", ").map((c) => c.split(" ")[1]);
      assert.equal(new Set(descriptors).size, descriptors.length, `${image.name} repeats a width descriptor`);
    }
  });
});

test("nothing in public/ is shipped that no page references", () => {
  // The two retired hero videos and the unoptimised founder JPEGs were 17.7 MB
  // of every deployment and were referenced nowhere.
  for (const gone of ["videos/hero-luxury.mp4", "videos/products.mp4", "images/founder1-rinaldi.jpg", "images/founder2-lakh.jpg", "images/products-poster.jpg"]) {
    assert.throws(() => readFileSync(join(root, "public", gone)), `public/${gone} is back in the deploy`);
  }
  assert.match(read("assets/retired-from-public/README.md"), /Retired from/);
});

/* ------------------------------------------------------------------ */
/* The FAQ                                                             */
/* ------------------------------------------------------------------ */

test("every FAQ question is shown under a topic heading, and none is orphaned", async () => {
  const mod = await import(
    `data:text/javascript;base64,${Buffer.from(
      buildSync({ entryPoints: [join(root, "src/lib/faqTopics.ts")], bundle: true, write: false, platform: "node", format: "esm" }).outputFiles[0].text
    ).toString("base64")}`
  );
  // The questions the page actually renders, read out of the page source.
  // Some entries are written inline; the rest are shared constants the product
  // pages reuse. Both reach the page, so both must land in a topic. Product
  // names are interpolated, so resolve them from the catalogue exactly as the
  // page does — a topic must match the words a customer actually reads.
  const names = Object.fromEntries(
    Object.entries(catalogue)
      .filter(([, value]) => value && typeof value === "object" && typeof value.name === "string" && Array.isArray(value.variants))
      .map(([key, value]) => [key, value.name])
  );
  const resolve = (text) => text.replace(/\$\{([A-Z_]+)\.name\}/g, (whole, ident) => names[ident] ?? whole);
  const pick = (source) =>
    [...source.matchAll(/^\s*question: (?:'([^']*)'|"([^"]*)"|`([^`]*)`),/gm)].map((m) => resolve(m[1] ?? m[2] ?? m[3]));

  const faqSource = read("src/pages/FAQ.tsx");
  const arrayBody = faqSource.slice(faqSource.indexOf("const faqs:"), faqSource.indexOf("\n];", faqSource.indexOf("const faqs:")));
  const answersSource = read("src/lib/productAnswers.ts");
  const constantQuestions = [...arrayBody.matchAll(/^ {2}([A-Z][A-Z0-9_]+),$/gm)].flatMap(([, name]) => {
    const at = answersSource.indexOf(`export const ${name}`);
    return at === -1 ? [] : pick(answersSource.slice(at, at + 2000)).slice(0, 1);
  });
  const questions = [...pick(arrayBody), ...constantQuestions];
  assert.ok(questions.length > 30, `expected the full FAQ, found ${questions.length}`);
  const faqs = questions.map((question) => ({ question, answer: "…" }));
  // Nothing falls into the catch-all group, and nothing is lost.
  assert.deepEqual(mod.groupingProblems(faqs), []);
  const groups = mod.groupedFaqs(faqs);
  assert.ok(groups.length >= 6, "the FAQ is grouped, not one flat list");
  for (const group of groups) assert.ok(group.title.length > 2 && group.items.length > 0);
});

test("the FAQ lets a reader open more than one answer at a time", () => {
  const faq = read("src/pages/FAQ.tsx");
  assert.match(faq, /<Accordion type="multiple"/);
  assert.doesNotMatch(faq, /<Accordion type="single"/, "opening one answer must not close the last");
  // Help is on the page, not only in the footer — and not via the MCB LIVE line.
  assert.match(faq, /mailto:hello@mycustombeats\.com/);
  assert.doesNotMatch(faq, /wa\.me/);
});
