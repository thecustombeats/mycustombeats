/**
 * MCB public site — homepage, product pages and navigation, rendered to HTML.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const outDir = mkdtempSync(join(root, "node_modules", ".mcb-site-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const sections = {
  HeroSection: "src/sections/HeroSection.tsx",
  PackagesSection: "src/sections/PackagesSection.tsx",
  EveryMemoryKeepsakes: "src/sections/home/EveryMemoryKeepsakes.tsx",
  HowItWorksSection: "src/sections/HowItWorksSection.tsx",
  HelpMeChoose: "src/sections/home/HelpMeChoose.tsx",
  CruiseSpecialism: "src/sections/home/CruiseSpecialism.tsx",
  CuratedAdditions: "src/sections/home/CuratedAdditions.tsx",
  FounderNote: "src/sections/home/FounderNote.tsx",
  SongShowcaseSection: "src/sections/SongShowcaseSection.tsx",
  MemoryPromise: "src/sections/home/MemoryPromise.tsx",
  Navigation: "src/components/Navigation.tsx",
  Footer: "src/sections/Footer.tsx",
  ProductPage: "src/pages/ProductPage.tsx",
  Products: "src/pages/Products.tsx",
  Bespoke: "src/pages/Bespoke.tsx",
  MCBLive: "src/pages/MCBLive.tsx",
  PriorityReplacement: "src/pages/PriorityReplacement.tsx",
  About: "src/pages/About.tsx",
};
const entry = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
${Object.entries(sections).map(([name, path]) => `export { default as ${name} } from "${root}${path}";`).join("\n")}
export const render = (component, props = {}, path = "/") =>
  renderToStaticMarkup(h(HelmetProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(component, props))));
`;
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, entry);
const outFile = join(root, "node_modules", `.mcb-site-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" } });
after(() => rmSync(outFile, { force: true }));

// Browser globals some components touch during render.
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { search: "", pathname: "/" }, addEventListener() {}, removeEventListener() {} };
const S = await import(outFile);

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const homepage = [
  "HeroSection", "MemoryPromise", "PackagesSection", "EveryMemoryKeepsakes", "HowItWorksSection",
  "HelpMeChoose", "CruiseSpecialism", "CuratedAdditions", "FounderNote",
].map((name) => S.render(S[name])).join("\n");
const productPages = ["moment", "keepsake", "journey"].map((id) => [id, S.render(S.ProductPage, { productId: id }, `/${id}`)]);
const otherPages = [S.render(S.Products, {}, "/products"), S.render(S.Bespoke, {}, "/bespoke"), S.render(S.MCBLive, {}, "/mcb-live"), S.render(S.PriorityReplacement, {}, "/priority-replacement")];
const chrome = S.render(S.Navigation) + S.render(S.Footer);
const everything = [homepage, chrome, ...productPages.map(([, html]) => html), ...otherPages].join("\n");

test("homepage package selector: Moment £15, Keepsake from £99, Journey from £199, Bespoke quoted", () => {
  const t = text(S.render(S.PackagesSection));
  for (const name of ["Moment", "Keepsake", "Journey", "Bespoke"]) assert.ok(t.includes(name), name);
  assert.ok(t.includes("£15"));
  assert.match(t, /From £99/);
  assert.match(t, /From £199/);
  assert.match(t, /Individually quoted/);
  assert.ok(!/£799|From £10\b|£10\b|£29\b/.test(t));
});

test("the homepage has one primary heading and a Create Your Memory call to action", () => {
  assert.equal((homepage.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.match(text(S.render(S.HeroSection)), /Create Your Memory/);
});

test("the founder note is present with the approved wording", () => {
  const t = text(S.render(S.FounderNote)).replace(/[’‘]/g, "'");
  for (const line of [
    "A note from Bella & Lewis",
    "MCB was created because we wanted those moments to have somewhere to live after the day itself was over.",
    "we never forget that what we're working with belongs to you",
    "Thank you for allowing us to help turn your memories into something you can keep, hear and relive.",
    "Founders, MCB™ — My Custom Beats",
  ]) assert.ok(t.includes(line), line);
});

test("Journey is standard vinyl and not a picture disc everywhere it is presented", () => {
  const journey = text(productPages.find(([id]) => id === "journey")[1]);
  assert.match(journey, /not a Picture Disc/i);
  assert.match(journey, /vinyl/i);
  assert.ok(!/no vinyl/i.test(everything.replace(/<[^>]+>/g, " ")));
  const card = text(S.render(S.PackagesSection)).split("Journey")[1] ?? "";
  assert.ok(!/\b(7|10|12)-inch picture disc\b/i.test(card.split("Bespoke")[0]), "Journey card never shows a picture-disc size");
});

test("Keepsake page offers the four picture discs and quiet, unselected Priority Replacement", () => {
  const html = productPages.find(([id]) => id === "keepsake")[1];
  assert.equal((html.match(/type="radio"[^>]*value="keepsake-/g) ?? []).length, 4);
  assert.ok(!/checked=""[^>]*priority|priority[^>]*checked=""/i.test(html), "Priority Replacement is not preselected");
  assert.match(text(html), /£19\.99/);
});

test("the plaque never claims to play music and its unverified size is not shown", () => {
  const pages = text(otherPages[0] + homepage);
  assert.match(pages, /does not play music/i);
  assert.ok(!/8 × 12|8 x 12/.test(pages));
});

test("MCB LIVE keeps its identity and tagline to itself, with no prices", () => {
  const live = text(otherPages[2]);
  assert.match(live, /DJ RINALDI · LADY LAKH · TOGETHER/i);
  assert.match(live, /AVAILABLE FOR SELECT EVENTS WORLDWIDE/i);
  assert.match(live, /BRING IT TO LIFE/i);
  assert.ok(!/£\d/.test(live), "no prices on MCB LIVE");
  assert.ok(!/BRING IT TO LIFE/i.test(text(homepage)), "tagline only on MCB LIVE");
});

test("no Heirloom, retired prices or unsupported trust claims appear", () => {
  const t = text(everything);
  for (const banned of [/Heirloom/i, /£799/, /7-inch[^£]{0,60}£79\.99/i, /BBC/, /200\+/, /most popular/i, /most chosen/i, /£500\+/, /world-class/i, /revolutionary/i, /once-in-a-lifetime/i, /trusted by .* worldwide/i, /clients worldwide/i, /testimonial/i]) {
    assert.ok(!banned.test(t), `found ${banned}`);
  }
});

test("every internal link points at a route the app defines", () => {
  const app = readFileSync(join(root, "src/App.tsx"), "utf8");
  const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
  const hrefs = new Set([...everything.matchAll(/href="(\/[^"#?]*)/g)].map((m) => m[1] || "/"));
  const staticFiles = (dir) => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? staticFiles(join(dir, n)) : [join(dir, n).slice(join(root, "public").length)]));
  const files = new Set(staticFiles(join(root, "public")));
  const broken = [...hrefs].filter((href) => !routes.has(href) && !files.has(href));
  assert.deepEqual(broken, []);
  assert.ok(!routes.has("/heirloom"));
  assert.ok(routes.has("/create") && routes.has("/bespoke") && routes.has("/full-package"));
});

test("every price shown on the public pages exists in the catalogue", async () => {
  const catalogue = await import(`data:text/javascript;base64,${Buffer.from(buildSync({ entryPoints: [join(root, "src/data/catalogue/index.ts")], bundle: true, write: false, platform: "node", format: "esm" }).outputFiles[0].text).toString("base64")}`);
  const allowed = new Set(catalogue.PRODUCTS.flatMap((p) => p.variants.map((v) => catalogue.formatMoney(v.price))));
  for (const price of text(everything).match(/£[\d,]+(?:\.\d{2})?/g) ?? []) assert.ok(allowed.has(price), `unexpected price ${price}`);
});


/* ------------------------------------------------------------------ */
/* Sprint 3.1 — founder-approved assets                                */
/* ------------------------------------------------------------------ */

test("Keepsake leads with the approved sleeve-artwork wall, not a drawn disc", () => {
  const card = S.render(S.PackagesSection);
  const keepsakeCard = card.slice(card.indexOf('id="experience-keepsake"') - 2000, card.indexOf('id="experience-keepsake"'));
  assert.match(keepsakeCard, /keepsake-sleeve-wall-/, "homepage Keepsake card image");
  assert.ok(!/role="img" aria-label="Illustration: \d+-inch/.test(keepsakeCard), "no drawn disc over the card image");

  const page = productPages.find(([id]) => id === "keepsake")[1];
  const hero = page.slice(0, page.indexOf("<fieldset"));
  assert.match(hero, /keepsake-sleeve-wall-/, "Keepsake product page hero");
  assert.ok(!/>Illustration</.test(hero), "no illustration overlay on the Keepsake hero");
  assert.match(page, /alt="Personalised record sleeves, each with its own photograph and message/);
  assert.ok(!/gift-at-sea/.test(page + card.slice(0, card.indexOf('id="experience-journey"'))), "the gift placeholder is gone from Keepsake");
});

test("the multiple-memories sections use the approved picture-disc wall", () => {
  const home = S.render(S.EveryMemoryKeepsakes);
  assert.match(home, /picture-disc-wall-/);
  assert.match(home, /alt="Several personalised picture discs/);
  // The picture shows seven discs; nothing may suggest seven records are included.
  assert.ok(!/alt="[^"]*\bseven\b/i.test(home + productPages.find(([id]) => id === "keepsake")[1]), "no count of discs in the alt text");
  assert.match(text(home), /wall mounting isn't included/);
  assert.match(productPages.find(([id]) => id === "keepsake")[1], /picture-disc-wall-/);
});

test("the homepage features the 25th Anniversary MCB Example without autoplay or eager loading", () => {
  const html = S.render(S.SongShowcaseSection);
  const t = text(html);
  assert.match(t, /25th Anniversary MCB Example/);
  assert.match(t, /not the song or product you will receive/);
  const video = html.match(/<video[^>]*>/)?.[0] ?? "";
  assert.ok(video, "a native video element");
  assert.match(video, /\scontrols(=""|\s|>)/, "controls available");
  assert.match(video, /preload="none"/, "not preloaded");
  assert.ok(!/autoplay/i.test(video), "no autoplay");
  assert.ok(!/\smuted/i.test(video), "sound is not forced off or on");
  assert.match(video, /aria-labelledby="anniversary-example-title"/);
  // The poster is deferred with IntersectionObserver in browsers (verified in the preview run).
  assert.match(html, /<source src="\/videos\/mcb-25-year-anniversary-example\.mp4" type="video\/mp4"/);
  assert.match(video, /width="940" height="1672"/, "space reserved for the 940×1672 replacement");
  assert.match(video, /aspect-\[940\/1672\]/);
  assert.equal((html.match(/<video/g) ?? []).length, 1, "one example, no duplicate sample section");
  assert.ok(!/<video[^>]*>/.test(S.render(S.HeroSection)), "not in the hero");
});

test("approved asset files exist, with the web video smaller than its master", () => {
  const web = join(root, "public/videos/mcb-25-year-anniversary-example.mp4");
  const master = join(root, "assets/originals/mcb-25-year-anniversary-example.mp4");
  assert.ok(existsSync(web) && existsSync(master));
  assert.ok(statSync(web).size < statSync(master).size);
  // faststart: the moov atom precedes the media data, so playback starts without downloading the whole file.
  const head = readFileSync(web).subarray(0, 1_000_000).toString("latin1");
  assert.ok(head.indexOf("moov") > 0 && head.indexOf("moov") < head.indexOf("mdat"), "moov before mdat");
  for (const name of ["keepsake-sleeve-wall", "picture-disc-wall", "anniversary-25-year-poster"]) {
    for (const w of [480, 960, 1600]) {
      for (const ext of ["jpg", "webp"]) assert.ok(existsSync(join(root, `public/images/responsive/${name}-${w}.${ext}`)), `${name}-${w}.${ext}`);
    }
  }
  assert.ok(!existsSync(join(root, "public/images/mcb-wall-art-sleeves.png")), "masters are not in the public delivery path");
});

test("every responsive image has a smaller WebP twin, offered first with the JPEG as fallback", () => {
  const dir = join(root, "public/images/responsive");
  const jpegs = readdirSync(dir).filter((f) => f.endsWith(".jpg"));
  assert.ok(jpegs.length > 0);
  for (const jpg of jpegs) {
    const webp = join(dir, jpg.replace(/\.jpg$/, ".webp"));
    assert.ok(existsSync(webp), `${jpg} has a WebP twin`);
    assert.ok(statSync(webp).size < statSync(join(dir, jpg)).size, `${jpg}: WebP is smaller`);
  }
  const html = S.render(S.EveryMemoryKeepsakes);
  assert.match(html, /<picture[^>]*><source type="image\/webp" srcSet="\/images\/responsive\/picture-disc-wall-480\.webp 480w/);
  assert.match(html, /<img src="\/images\/responsive\/picture-disc-wall-960\.jpg" srcSet="[^"]*\.jpg 480w/, "JPEG fallback");
  assert.match(S.render(S.SongShowcaseSection), /preload="none"/);
  assert.match(readFileSync(join(root, "src/sections/SongShowcaseSection.tsx"), "utf8"), /anniversaryExamplePoster,[^)]*"webp"\)/, "poster uses WebP");
});

test("only the clean replacement example is served; the superseded branded files are gone", () => {
  for (const old of [
    "public/videos/mcb-25th-anniversary-example.mp4",
    "assets/originals/25th Anniversary MCB Example.MP4",
    "assets/originals/mcb-25th-anniversary-poster.png",
    ...[480, 960, 1600].flatMap((w) => [`public/images/responsive/anniversary-example-poster-${w}.jpg`, `public/images/responsive/anniversary-example-poster-${w}.webp`]),
  ]) {
    assert.ok(!existsSync(join(root, old)), `${old} removed`);
  }
  const sources = ["index.html", "src", "public/_redirects", "public/.htaccess", "scripts"].map((p) => join(root, p)).filter(existsSync);
  const read = (p) => (statSync(p).isDirectory() ? readdirSync(p).map((f) => read(join(p, f))).join("\n") : /\.(tsx?|mjs|js|json|html|sh|htaccess|_redirects)$|_redirects$|\.htaccess$/.test(p) ? readFileSync(p, "utf8") : "");
  const all = sources.map(read).join("\n");
  assert.ok(!/mcb-25th-anniversary-example|anniversary-example-poster|25th Anniversary MCB Example\.MP4/.test(all), "no reference to the superseded video or poster");
  assert.match(all, /mcb-25-year-anniversary-example\.mp4/, "the replacement is what the site references");
  assert.equal(readdirSync(join(root, "public/videos")).filter((f) => /anniversary-example/.test(f)).length, 1, "exactly one example video is published");
});

test("the Princess Cruises clearance item is closed, and only that item", () => {
  const review = readFileSync(join(root, "src/data/legal/review.ts"), "utf8");
  const entry = review.match(/topic: "25th Anniversary MCB Example — Princess Cruises branding"[\s\S]*?question:\s*"([^"]*)"[\s\S]*?severity: "(\w+)"/);
  assert.ok(entry, "the closure is still recorded");
  assert.equal(entry[2], "CONFIRMATORY", "no longer blocking");
  assert.match(entry[0], /found the previously identified Princess Cruises name\/logo\/slogan absent/);
  assert.match(entry[1], /NOT a general copyright or legal certification/);
  // No remaining BLOCKING item concerns the example video; the unrelated blockers remain.
  const blocking = [...review.matchAll(/\{\s*topic: "([^"]*)"[\s\S]*?severity: "(\w+)"/g)].filter((m) => m[2] === "BLOCKING");
  assert.ok(blocking.length >= 8, "unrelated blocking items untouched");
  assert.ok(!blocking.some((m) => /princess|anniversary/i.test(m[0])), "no blocking item about the example remains");
  assert.match(review, /item: "25th Anniversary MCB Example — no captions or transcript"/, "captions follow-up stays open");
  assert.ok(!/princess/i.test(readFileSync(join(root, "src/sections/SongShowcaseSection.tsx"), "utf8")), "no stale clearance warning in the section");
  assert.ok(!/princess/i.test(text(S.render(S.SongShowcaseSection))), "page copy claims no cruise-line relationship");
});

test("the Rinaldi at-sea photograph leads the homepage cruise section, lazily and without a cruise line", () => {
  const cruise = S.render(S.CruiseSpecialism);
  assert.match(cruise, /<source type="image\/webp" srcSet="\/images\/responsive\/rinaldi-at-sea-480\.webp/);
  assert.match(cruise, /alt="DJ Rinaldi holding an MCB vinyl record while looking out to sea/);
  assert.match(cruise, /loading="lazy"/);
  assert.match(cruise, /width="941" height="1672"/, "dimensions reserved");
  assert.ok(!/solo-deck/.test(cruise), "the stock photograph is replaced");
  assert.ok(!/princess|carnival|royal caribbean|p&amp;o|cunard|celebrity/i.test(text(cruise)), "no cruise line named");
});

test("the Rinaldi portrait appears only on Our Story, and the founder note stays typographic", () => {
  const about = S.render(S.About, {}, "/about");
  assert.equal((about.match(/rinaldi-portrait-960\.jpg"/g) ?? []).length, 1, "once on Our Story");
  assert.match(about, /alt="DJ Rinaldi holding an MCB vinyl record on a ship&#x27;s deck at sunset"/);
  const elsewhere = [...Object.keys(sections).filter((name) => !["About", "ProductPage"].includes(name)).map((name) => S.render(S[name])), ...productPages.map(([, html]) => html)].join("");
  assert.ok(!/rinaldi-portrait/.test(elsewhere), "not on the homepage or product pages");
  assert.ok(!/<img/.test(S.render(S.FounderNote)), "no photograph in the homepage founder note");
  assert.ok(!/rinaldi-at-sea/.test(about), "the two photographs are not doubled up");
  for (const master of ["rinaldi-looking-out-to-sea-mcb-vinyl.png", "rinaldi-holding-mcb-vinyl.png"]) {
    assert.ok(existsSync(join(root, "assets/originals", master)));
    assert.ok(!existsSync(join(root, "public/images", master)), "masters are not publicly served");
  }
});

test("checkout remains disabled on both switches", () => {
  assert.match(readFileSync(join(root, "src/lib/checkoutSession.ts"), "utf8"), /export const CHECKOUT_SESSIONS_ENABLED = false;/);
  assert.match(readFileSync(join(root, "public/api/config.example.php"), "utf8"), /'checkout_sessions_enabled' => false,/);
});
