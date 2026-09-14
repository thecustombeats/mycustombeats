/**
 * Sprint 6 — SEO, AEO, structured data, indexing, analytics privacy, security
 * configuration, the public catalogue feed, accessibility basics and legacy
 * cleanup. Run: npm test
 *
 * Served behaviour (headers, redirects, endpoint protection) is proven against
 * Apache in tests/release-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const outDir = mkdtempSync(join(root, "node_modules", ".mcb-release-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const PAGES = {
  Products: "src/pages/Products.tsx", ProductPage: "src/pages/ProductPage.tsx", Bespoke: "src/pages/Bespoke.tsx",
  MCBLive: "src/pages/MCBLive.tsx", Blog: "src/pages/Blog.tsx", BlogPost: "src/pages/BlogPost.tsx", About: "src/pages/About.tsx",
  FAQ: "src/pages/FAQ.tsx", Privacy: "src/pages/legal/Privacy.tsx", Terms: "src/pages/legal/Terms.tsx", Refund: "src/pages/legal/Refund.tsx",
  PriorityReplacement: "src/pages/PriorityReplacement.tsx", CruiseMemories: "src/pages/CruiseMemories.tsx", NotFound: "src/pages/NotFound.tsx",
  ThankYou: "src/pages/ThankYou.tsx", YourOrder: "src/pages/YourOrder.tsx", Approve: "src/pages/Approve.tsx",
  ArtistThankYou: "src/pages/ArtistThankYou.tsx", PartnerThankYou: "src/pages/PartnerThankYou.tsx", CreateMemory: "src/pages/CreateMemory.tsx",
};
const entry = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { CurrencyProvider } from "${root}src/lib/currencyContext.tsx";
${Object.entries(PAGES).map(([n, p]) => `import ${n} from "${root}${p}";`).join("\n")}
export * as seo from "${root}src/lib/seo.ts";
export * as analytics from "${root}src/lib/analytics.ts";
export * as answers from "${root}src/lib/productAnswers.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
const pages = { ${Object.keys(PAGES).join(", ")} };
export const render = (name, path, props = {}, pattern) =>
  renderToStaticMarkup(h(HelmetProvider, null, h(CurrencyProvider, null, h(MemoryRouter, { initialEntries: [path] },
    h(Routes, null, h(Route, { path: pattern ?? path.split(/[?#]/)[0], element: h(pages[name], props) }))))));
`;
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, entry);
const outFile = join(root, "node_modules", `.mcb-release-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" } });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { search: "", pathname: "/", hash: "", href: "http://localhost/" }, addEventListener() {}, removeEventListener() {} };
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.sessionStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
const M = await import(outFile);

const ld = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")));
const nodes = (graph) => graph["@graph"] ?? [graph];
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/* ------------------------------------------------------------------ */
/* Indexing and page head                                              */
/* ------------------------------------------------------------------ */

const INDEXABLE = [
  ["Products", "/products"], ["ProductPage", "/moment", { productId: "moment" }], ["ProductPage", "/keepsake", { productId: "keepsake" }],
  ["ProductPage", "/journey", { productId: "journey" }], ["Bespoke", "/bespoke"], ["MCBLive", "/mcb-live"], ["Blog", "/blog"],
  ["BlogPost", "/blog/picture-disc-keepsakes-music-and-memories-you-can-hold", {}, "/blog/:slug"], ["About", "/about"], ["FAQ", "/faq"],
  ["Privacy", "/legal/privacy"], ["Terms", "/legal/terms"], ["Refund", "/legal/refund"], ["PriorityReplacement", "/priority-replacement"], ["CruiseMemories", "/cruise"],
];
const PRIVATE = [["ThankYou", "/thank-you?session_id=cs_test_x"], ["YourOrder", "/your-order"], ["Approve", "/approve"], ["ArtistThankYou", "/artist-thank-you"], ["PartnerThankYou", "/partner-thank-you"], ["NotFound", "/nope"], ["CreateMemory", "/create"]];

test("every indexable page has one title, a description, one h1, no noindex and no duplicate ids", () => {
  for (const [name, path, props, pattern] of INDEXABLE) {
    const html = M.render(name, path, props, pattern);
    assert.equal((html.match(/<title>/g) ?? []).length, 1, `${path} title`);
    assert.match(html, /<meta name="description" content="[^"]{50,}"/, `${path} description`);
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path} h1`);
    assert.doesNotMatch(html, /name="robots" content="noindex/, `${path} is indexable`);
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), [], `${path} duplicate ids`);
    assert.doesNotMatch(html, /<main[\s>]/, `${path}: the single <main> is the layout's`);
  }
});

test("private, transactional and 404 pages are noindex", () => {
  for (const [name, path] of PRIVATE) {
    assert.match(M.render(name, path), /name="robots" content="noindex/, path);
  }
  assert.match(read("src/App.tsx"), /path="\/dashboard" element=\{<><NoIndex/);
  assert.match(read("src/App.tsx"), /<main id="main-content">\{children\}<\/main>/);
  const robots = read("public/robots.txt");
  for (const path of ["/thank-you", "/dashboard", "/your-order", "/approve", "/operations", "/api/"]) assert.match(robots, new RegExp(`^Disallow: ${path.replace("/", "\\/")}$`, "m"));
});

test("sitemap lists only canonical, public, indexable URLs", () => {
  const locs = [...read("public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const app = read("src/App.tsx");
  const slugs = [...read("src/data/blog/posts.ts").matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  for (const loc of locs) {
    assert.match(loc, /^https:\/\/www\.mycustombeats\.com\//);
    const path = loc.replace("https://www.mycustombeats.com", "");
    assert.ok(path === "/" || !path.endsWith("/"), `${loc} has no trailing slash`);
    assert.doesNotMatch(path, /[?#]|your-order|approve|operations|thank-you|dashboard|create|full-package|api\//, loc);
    assert.ok(path === "/" || app.includes(`path="${path}"`) || slugs.some((s) => path === `/blog/${s}`), `${loc} is a real route`);
  }
  for (const s of slugs) assert.ok(locs.includes(`https://www.mycustombeats.com/blog/${s}`));
});

test("canonical URLs ignore query strings and trailing slashes; legacy routes redirect", () => {
  const app = read("src/App.tsx");
  assert.match(app, /rawPathname\.replace\(\/\\\/\+\$\/, ""\)/);
  assert.match(app, /<link rel="canonical" href=\{canonical\(pathname\)\} \/>/);
  const htaccess = read("public/.htaccess");
  assert.match(htaccess, /RewriteRule \^full-package\/\?\$ \/bespoke \[R=301,L\]/);
  assert.match(htaccess, /RewriteRule \^\(\.\+\)\/\$ \/\$1 \[R=301,L\]/);
  assert.match(htaccess, /RewriteCond %\{HTTP_HOST\} \^mycustombeats\\\.com\$ \[NC\]/);
  assert.match(app, /path="\/contact" element=\{<Navigate/);
  assert.equal(M.seo.canonical("/bespoke"), "https://www.mycustombeats.com/bespoke");
});

/* ------------------------------------------------------------------ */
/* Structured data                                                     */
/* ------------------------------------------------------------------ */

const productGraph = (id) => nodes(M.seo.productPageStructuredData(id));
const allOffers = (value) => JSON.stringify(value).match(/"@type":"(Offer|AggregateOffer)"/g) ?? [];

test("Bespoke and MCB LIVE carry no Offer, price or availability", () => {
  for (const id of ["bespoke", "mcb-live"]) {
    const json = JSON.stringify(productGraph(id));
    assert.deepEqual(allOffers(productGraph(id)), [], id);
    assert.doesNotMatch(json, /"price"|priceSpecification|availability|AggregateOffer/, id);
  }
});

test("fixed-price offers are exact GBP catalogue prices; nothing claims ratings or reviews", () => {
  const prices = new Map(M.catalogue.PRODUCTS.flatMap((p) => p.variants.map((v) => [v.sku, M.catalogue.minorToDecimal(v.price.minor)])));
  for (const id of ["moment", "keepsake", "journey", "priority-replacement"]) {
    const json = JSON.stringify(productGraph(id));
    for (const m of json.matchAll(/"sku":"([^"]+)"[^}]*?"offers":\{"@type":"Offer","price":"([\d.]+)","priceCurrency":"GBP"/g)) assert.equal(m[2], prices.get(m[1]), m[1]);
    assert.doesNotMatch(json, /aggregateRating|"review"|ratingValue|gtin|supplier|cost|margin/i, id);
  }
  const homepage = JSON.stringify(M.seo.homepageStructuredData());
  assert.doesNotMatch(homepage, /aggregateRating|award|foundingDate|numberOfEmployees|"review"/i);
});

test("Journey schema is unmistakably standard vinyl: one record for 6 songs, a double gatefold for 12", () => {
  const group = productGraph("journey").find((n) => n["@type"] === "ProductGroup");
  const props = (sku) => Object.fromEntries(group.hasVariant.find((v) => v.sku === sku).additionalProperty.map((p) => [p.name, p.value]));
  assert.deepEqual([props("journey-6")["Record type"], props("journey-6")["Picture disc"], props("journey-6")["Number of records"], props("journey-6")["Gatefold sleeve"]], ["Standard vinyl", false, 1, false]);
  assert.deepEqual([props("journey-12")["Record type"], props("journey-12")["Picture disc"], props("journey-12")["Number of records"], props("journey-12")["Gatefold sleeve"]], ["Standard vinyl", false, 2, true]);
  assert.match(group.description, /not a Picture Disc/i);
  const html = M.render("ProductPage", "/journey", { productId: "journey" });
  assert.doesNotMatch(text(html).replace(/not a Picture Disc|Journey is not a Picture Disc|Does Journey include a Picture Disc\?/gi, ""), /Journey[^.]{0,40} picture disc/i);
});

test("Keepsake schema: picture discs of 1, 1, 3 and 4 songs; no product image implying wall mounting", () => {
  const group = productGraph("keepsake").find((n) => n["@type"] === "ProductGroup");
  const rows = group.hasVariant.map((v) => [v.sku, Object.fromEntries(v.additionalProperty.map((p) => [p.name, p.value]))]);
  assert.deepEqual(rows.map(([sku, p]) => [sku, p["Picture disc"], p["Personalised songs included"]]), [
    ["keepsake-12-picture-disc", true, 4], ["keepsake-10-picture-disc", true, 3], ["keepsake-10-heart-picture-disc", true, 1], ["keepsake-7-picture-disc", true, 1],
  ]);
  assert.equal(JSON.stringify(group).includes('"image"'), false);
  const momentNode = productGraph("moment").find((n) => n["@type"] === "Product");
  assert.equal("image" in momentNode, false);
  assert.match(JSON.stringify(productGraph("journey")), /"image":"https:\/\/www\.mycustombeats\.com\/images\/responsive\/vinyl-sleeve-1600\.jpg"/);
});

test("the organisation node states only verified identity", () => {
  const org = nodes(M.seo.homepageStructuredData()).find((n) => n["@type"] === "OnlineStore");
  assert.equal(org.name, "My Custom Beats");
  assert.equal(org.alternateName, "MCB");
  assert.deepEqual(org.sameAs, ["https://www.youtube.com/@MyCustomBeats"]);
  for (const key of ["foundingDate", "award", "aggregateRating", "numberOfEmployees", "memberOf", "sponsor"]) assert.ok(!(key in org), key);
  assert.doesNotMatch(JSON.stringify(org), /Princess|Carnival|Royal Caribbean|Cunard|P&O|luxury partner/i);
});

/* ------------------------------------------------------------------ */
/* Answers                                                             */
/* ------------------------------------------------------------------ */

test("visible answers agree with the catalogue", () => {
  const { answers, catalogue } = M;
  assert.match(answers.KEEPSAKE_SONG_CAPACITY.answer, /7-inch Picture Disc: 1 song/);
  assert.match(answers.KEEPSAKE_SONG_CAPACITY.answer, /Heart-Shaped Picture Disc: 1 song/);
  assert.match(answers.KEEPSAKE_SONG_CAPACITY.answer, /10-inch Picture Disc: 3 songs/);
  assert.match(answers.KEEPSAKE_SONG_CAPACITY.answer, /12-inch Picture Disc: 4 songs/);
  assert.match(answers.JOURNEY_NOT_PICTURE_DISC.answer, /^No\./);
  assert.match(answers.JOURNEY_NOT_PICTURE_DISC.answer, /6 Songs is one 12-inch standard vinyl record/);
  assert.match(answers.JOURNEY_NOT_PICTURE_DISC.answer, /12 Songs is two 12-inch standard vinyl records in a gatefold sleeve/);
  assert.match(answers.PLAQUE_PLAYS_MUSIC.answer, /^No\. This plaque does not play music\./);
  assert.match(answers.WHAT_IS_A_PICTURE_DISC_KEEPSAKE.answer, /wall mounting is not included/);
  assert.match(answers.MOMENT_DELIVERY.answer, /mp4 delivery/);
  assert.equal(catalogue.getProduct("journey").variants.every((v) => v.vinyl.pictureDisc === false), true);
});

test("the FAQ shows the new answers and its FAQPage schema mirrors exactly what is visible", () => {
  const html = M.render("FAQ", "/faq");
  const page = text(html);
  for (const q of [M.answers.AFTER_YOU_ORDER, M.answers.HOW_APPROVAL_WORKS, M.answers.JOURNEY_NOT_PICTURE_DISC, M.answers.PLAQUE_PLAYS_MUSIC, M.answers.KEEPSAKE_SONG_CAPACITY]) {
    assert.ok(page.includes(q.question), q.question);
  }
  const faq = ld(html).flatMap(nodes).find((n) => n["@type"] === "FAQPage");
  for (const item of faq.mainEntity) assert.ok(page.includes(item.name), item.name);
});

test("product pages answer common questions and link to the relevant article", () => {
  for (const [id, slug] of [["moment", "turn-a-special-memory-into-a-personalised-song"], ["keepsake", "picture-disc-keepsakes-music-and-memories-you-can-hold"], ["journey", "preserve-cruise-memories-after-you-return-home"]]) {
    const html = M.render("ProductPage", `/${id}`, { productId: id });
    assert.match(html, /id="quick-answers"/);
    assert.ok(html.includes(`href="/blog/${slug}"`), id);
    assert.ok(!ld(html).flatMap(nodes).some((n) => n["@type"] === "FAQPage"), "no FAQ schema on product pages");
  }
  const posts = read("src/data/blog/posts.ts");
  for (const to of ['to: "/keepsake"', 'to: "/journey"', 'to: "/moment"']) assert.ok(posts.includes(to), to);
});

/* ------------------------------------------------------------------ */
/* Public catalogue feed                                               */
/* ------------------------------------------------------------------ */

test("the public catalogue derives from the canonical catalogue and holds public data only", () => {
  const feed = JSON.parse(read("public/catalogue.json"));
  const internal = JSON.parse(read("public/api/data/catalogue.json"));
  assert.equal(feed.catalogue_hash, internal.catalogue_hash);
  assert.equal(feed.ordering_rules.automated_ordering, false);
  const json = JSON.stringify(feed);
  assert.doesNotMatch(json.replace("through Stripe Checkout", ""), /supplier|\bcost|margin|wholesale|routing|internal_|stripe|webhook|crm|database|"order_id"|sk_(test|live)|whsec_/i);
  const ids = feed.products.map((p) => p.id);
  assert.ok(!ids.includes("gift-voucher") && !ids.includes("cruise-ship-dj-bible"), "inactive or unsold products are absent");
  for (const p of feed.products) {
    if (p.commercial_model === "QUOTED") {
      assert.equal(p.availability, "QUOTE_ONLY_BY_ENQUIRY");
      assert.deepEqual(p.variants, []);
    }
    for (const v of p.variants) {
      assert.equal(v.price.minor_units, internal.skus[v.sku].price_minor, v.sku);
      assert.equal(v.price.currency, "GBP");
      assert.equal(v.orderable_online, internal.skus[v.sku].orderable, v.sku);
    }
  }
  const byId = Object.fromEntries(feed.products.map((p) => [p.id, p]));
  const counts = (id) => byId[id].variants.map((v) => [v.sku, v.personalisation.count, v.format?.type ?? null]);
  assert.deepEqual(counts("moment"), [["moment", 1, "DIGITAL"]]);
  assert.deepEqual(counts("keepsake"), [["keepsake-12-picture-disc", 4, "PICTURE_DISC"], ["keepsake-10-picture-disc", 3, "PICTURE_DISC"], ["keepsake-10-heart-picture-disc", 1, "PICTURE_DISC"], ["keepsake-7-picture-disc", 1, "PICTURE_DISC"]]);
  assert.deepEqual(counts("journey"), [["journey-6", 6, "STANDARD_VINYL"], ["journey-12", 12, "STANDARD_VINYL"]]);
  assert.equal(byId.journey.variants[0].personalisation.unit, "chapter");
  assert.equal(byId.journey.variants[1].format.gatefold, true);
  assert.equal(byId["personalised-music-plaque"].variants[0].order_url, null, "add-ons are not ordered on their own");
  assert.equal(byId["personalised-music-plaque"].requires_song_experience_in_order, true);
  assert.equal(byId.keepsake.image_url, null);
  assert.ok(byId.keepsake.variants.every((v) => v.add_ons.priority_replacement_eligible));
});

/* ------------------------------------------------------------------ */
/* Analytics privacy                                                   */
/* ------------------------------------------------------------------ */

test("analytics never receives a private token, Stripe session id or query value", () => {
  const { analyticsSafeLocation, isPrivateAnalyticsPath } = M.analytics;
  const token = "A".repeat(43);
  assert.equal(analyticsSafeLocation(`https://www.mycustombeats.com/approve#${token}`), "https://www.mycustombeats.com/approve");
  assert.equal(analyticsSafeLocation("https://www.mycustombeats.com/thank-you?session_id=cs_live_abc123"), "https://www.mycustombeats.com/thank-you");
  assert.equal(analyticsSafeLocation("https://www.mycustombeats.com/?utm_source=news&email=a@b.com&ref=x"), "https://www.mycustombeats.com/?utm_source=news");
  for (const p of ["/your-order", "/approve", "/operations"]) assert.ok(isPrivateAnalyticsPath(p), p);
  assert.ok(!isPrivateAnalyticsPath("/blog"));
  const src = read("src/lib/analytics.ts");
  assert.doesNotMatch(src, /page_location: window\.location\.href/);
  const init = read("public/analytics-init.js");
  assert.match(init, /var PRIVATE = \/\^\\\/\(your-order\|approve\|operations\)\(\\\/\|\$\)\//);
  assert.match(init, /page_location: safe\(window\.location\.href\)/);
  assert.match(init, /page_referrer: document\.referrer \? safe\(document\.referrer\) : ""/);
  assert.doesNotMatch(read("index.html"), /<script>/);
});

test("no analytics call sends customer content", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const n of readdirSync(join(root, dir))) {
      const p = join(dir, n);
      if (statSync(join(root, p)).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n)) {
        for (const m of read(p).matchAll(/track(?:Event|Funnel|FormSubmit)\(((?:[^()]|\([^()]*\))*)\)/g)) {
          if (/\b(story|email|phone|address|feedback|token|session_id|description|details|firstName|lastName|customer_name)\b|(?<![_\w])name:/i.test(m[1])) offenders.push(`${p}: ${m[1].slice(0, 80)}`);
        }
      }
    }
  };
  walk("src");
  assert.deepEqual(offenders, []);
});

/* ------------------------------------------------------------------ */
/* Security configuration                                              */
/* ------------------------------------------------------------------ */

test("security headers are configured without inline script and without blind HSTS", () => {
  const h = read("public/.htaccess");
  const csp = h.match(/Header always set Content-Security-Policy "([^"]+)"/)[1];
  const script = csp.match(/script-src ([^;]+)/)[1];
  assert.equal(script.trim(), "'self' https://www.googletagmanager.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/");
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "frame-src https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/;"]) assert.ok(csp.includes(d), d);
  for (const header of ['X-Content-Type-Options "nosniff"', 'Referrer-Policy "strict-origin-when-cross-origin"', "Permissions-Policy", 'X-Frame-Options "SAMEORIGIN"']) assert.ok(h.includes(header), header);
  assert.match(h, /^\s*# Header always set Strict-Transport-Security/m, "HSTS prepared but not enabled");
  assert.match(h, /THE_REQUEST[^\n]*your-order\|approve\|operations\|thank-you[^\n]*\n\s*Header always set X-Robots-Tag "noindex, nofollow"/);
  const api = read("public/api/.htaccess");
  assert.match(api, /Content-Security-Policy "default-src 'none'; frame-ancestors 'none'"/);
  assert.match(api, /X-Robots-Tag "noindex, nofollow"/);
});

test("checkout only ever redirects to Stripe's own host", () => {
  assert.match(read("src/lib/orderApi.ts"), /url\.startsWith\("https:\/\/checkout\.stripe\.com\/"\)/);
  assert.match(read("public/api/checkout/session.php"), /str_starts_with\(\(string\) \$session\['url'\], 'https:\/\/checkout\.stripe\.com\/'\)/);
});

/* ------------------------------------------------------------------ */
/* Legacy and clean-up                                                 */
/* ------------------------------------------------------------------ */

test("dead code is gone and lint-only relocations kept their exports", () => {
  assert.ok(!existsSync(join(root, "src/archive")));
  assert.ok(!existsSync(join(root, "src/components/logo.tsx")));
  for (const f of ["toggle-variants.ts", "navigation-menu-style.ts", "form-context.ts", "sidebar-context.ts"]) assert.ok(existsSync(join(root, "src/components/ui", f)), f);
  assert.doesNotMatch(read("src/components/ui/sidebar.tsx"), /Math\.random\(/);
  assert.doesNotMatch(read("public/api/fx/rates.php"), /Payment Links/);
});

test("occasion loops never autoplay on load and respect reduced motion", () => {
  const src = read("src/pages/Occasions.tsx");
  assert.doesNotMatch(src, /autoPlay/);
  assert.match(src, /preload="none"/);
  assert.match(src, /prefers-reduced-motion: reduce/);
  const anniversary = read("src/sections/SongShowcaseSection.tsx");
  assert.match(anniversary, /controls\s+preload="none"\s+playsInline/);
  assert.doesNotMatch(anniversary, /autoPlay/);
});
