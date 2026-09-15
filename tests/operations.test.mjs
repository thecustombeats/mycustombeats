/**
 * Sprint 5 — operations data, customer links, MCB LIVE, Bespoke, blog, and the
 * legacy guarantees that must still hold. Run: npm test
 *
 * The server behaviour (state transitions, links, queue, email, enquiries) is
 * exercised end to end by tests/operations-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const outDir = mkdtempSync(join(root, "node_modules", ".mcb-ops-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

const entry = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
export * as ops from "${root}src/data/operations.ts";
export * as blog from "${root}src/data/blog/posts.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export * as imagery from "${root}src/data/imagery.ts";
export * as customer from "${root}src/lib/customerOrder.ts";
export * as concierge from "${root}src/lib/concierge.ts";
export { blogPostStructuredData, blogIndexStructuredData } from "${root}src/lib/seo.ts";
import Blog from "${root}src/pages/Blog.tsx";
import BlogPost from "${root}src/pages/BlogPost.tsx";
import MCBLive from "${root}src/pages/MCBLive.tsx";
import YourOrder from "${root}src/pages/YourOrder.tsx";
import Approve from "${root}src/pages/Approve.tsx";
import Operations from "${root}src/pages/Operations.tsx";
const pages = { Blog, BlogPost, MCBLive, YourOrder, Approve, Operations };
// React 19: Helmet renders <title>, <meta> and JSON-LD in place (React hoists
// them into <head> in a browser), so the rendered markup carries the head too.
export const render = (name, path, pattern) => {
  const html = renderToStaticMarkup(
    h(HelmetProvider, null,
      h(MemoryRouter, { initialEntries: [path] },
        h(Routes, null, h(Route, { path: pattern ?? path.split("#")[0], element: h(pages[name]) }))))
  );
  return { html, head: html };
};
`;
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, entry);
const outFile = join(root, "node_modules", `.mcb-ops-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" } });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { search: "", pathname: "/", hash: "" }, addEventListener() {}, removeEventListener() {} };
const M = await import(outFile);
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

/* ------------------------------------------------------------------ */
/* Operational state model                                             */
/* ------------------------------------------------------------------ */

test("the operational states are the Single Creative Authority model: creation, quality check, reveal — no customer approval", () => {
  assert.deepEqual(M.ops.OPERATIONAL_STATES.map((s) => s.state), [
    "ORDER.PAID", "CREATIVE.PENDING", "CREATIVE.IN_PROGRESS", "QUALITY_CHECK",
    "REVEAL.READY", "REVEALED",
    "FULFILMENT.NOT_REQUIRED", "FULFILMENT.PENDING", "FULFILMENT.READY", "FULFILMENT.AUTHORISED", "FULFILMENT.CONFIRMED",
    "DISPATCHED", "DELIVERED", "FOLLOW_UP.DUE", "COMPLETED",
  ]);
  // The Founders' FINANCIAL approval of a supplier purchase is the only approval left; no customer approval exists.
  const all = JSON.stringify([M.ops.OPERATIONAL_STATES, M.ops.CUSTOMER_STAGES, M.ops.LIFECYCLE_TEMPLATES, M.ops.QUEUE_KINDS])
    .replace(/Fulfilment approval required/gi, "");
  assert.doesNotMatch(all, /APPROVAL|approve|CHANGES_REQUESTED|revision|refine/i);
  assert.doesNotMatch(JSON.stringify(M.ops.CUSTOMER_STAGES), /approv/i);
  assert.equal(M.ops.OPERATIONAL_STATES.find((s) => s.state === "CREATIVE.PENDING").staff, "New order ready for processing.");
  assert.deepEqual(M.ops.OPERATIONAL_STATES.find((s) => s.state === "REVEAL.READY").workflows, ["DIGITAL"]);
  assert.match(M.ops.OPERATIONAL_STATES.find((s) => s.state === "FULFILMENT.READY").nextAction, /Bella or Lewis .*explicitly authorises the supplier purchase/);
  assert.match(M.ops.OPERATIONAL_STATES.find((s) => s.state === "FULFILMENT.AUTHORISED").nextAction, /Place the supplier order by hand/);
});

test("a digital Moment has no physical states, on the staff model or the customer page", () => {
  const physicalOnly = ["FULFILMENT.PENDING", "FULFILMENT.READY", "FULFILMENT.AUTHORISED", "FULFILMENT.CONFIRMED", "DISPATCHED", "DELIVERED"];
  for (const state of physicalOnly) {
    assert.deepEqual(M.ops.OPERATIONAL_STATES.find((s) => s.state === state).workflows, ["PHYSICAL"], state);
  }
  const digital = M.ops.CUSTOMER_STAGES.DIGITAL;
  assert.ok(!digital.some((stage) => stage.states.some((s) => physicalOnly.includes(s))));
  assert.ok(!text(JSON.stringify(digital)).match(/dispatch|deliver|post|making your keepsake|on its way/i));
});

test("every state a workflow can reach maps to exactly one customer stage", () => {
  for (const workflow of ["DIGITAL", "PHYSICAL"]) {
    const reachable = M.ops.OPERATIONAL_STATES.filter((s) => s.workflows.includes(workflow) && s.state !== "FULFILMENT.NOT_REQUIRED").map((s) => s.state);
    for (const state of reachable) {
      const owners = M.ops.CUSTOMER_STAGES[workflow].filter((stage) => stage.states.includes(state));
      assert.equal(owners.length, 1, `${workflow} ${state}`);
    }
  }
});

test("customer stage wording is plain English with no internal codes", () => {
  for (const stages of Object.values(M.ops.CUSTOMER_STAGES)) {
    for (const stage of stages) {
      assert.doesNotMatch(`${stage.title} ${stage.description}`, /[A-Z]{2,}_|revision|allowance|fulfilment|supplier|token/i);
    }
  }
});

test("no product carries an included revision or refinement entitlement, and no timing is promised in hours", () => {
  for (const product of M.catalogue.PRODUCTS) {
    assert.equal("revisions" in product, false, product.id);
    for (const variant of product.variants) assert.ok(!variant.features.some((f) => /revision|refinement|within \d+ hour/i.test(f)), variant.sku);
  }
  assert.equal(M.ops.INCLUDED_REVISIONS, undefined);
  assert.doesNotMatch(M.catalogue.getProduct("moment").turnaround.label, /\d|hour|minute/);
  assert.match(M.catalogue.getProduct("moment").turnaround.label, /quality check/);
  // Internal operational objectives only; never shown to a customer.
  assert.deepEqual(M.ops.CREATIVE_TARGET_HOURS, { moment: 24, keepsake: 24, journey: 24 });
  const json = JSON.parse(read("public/api/data/operations.json"));
  assert.equal(json.included_revisions, undefined);
  assert.deepEqual(json.reopen_reasons, ["MCB_CORRECTION", "REPLACEMENT", "OTHER"], "no customer-request reopen");
  assert.ok(json.qc_checklist.length >= 13 && json.qc_checklist.every((i) => ["ALL", "PHYSICAL"].includes(i.applies_to)));
});

test("lifecycle templates: follow-up and review are never sent automatically", () => {
  const auto = Object.fromEntries(M.ops.LIFECYCLE_TEMPLATES.map((t) => [t.type, t.autoSend]));
  assert.equal(auto.FOLLOW_UP, false);
  assert.equal(auto.REVIEW_REQUEST, false);
  assert.equal(M.ops.LIFECYCLE_TEMPLATES.find((t) => t.type === "DISPATCHED").workflows.join(), "PHYSICAL");
});

test("automation events are the named set, with nothing financial or supplier-facing", () => {
  assert.deepEqual([...M.ops.AUTOMATION_EVENTS].sort(), [
    "ARTWORK.EXCEPTION", "ARTWORK.INPUT_VALIDATED", "ARTWORK.PREPARATION_REQUIRED", "ARTWORK.READY", "ARTWORK.TEMPLATE_REQUIRED",
    "BESPOKE.ENQUIRY_RECEIVED", "CREATIVE.IN_PROGRESS", "DELIVERED", "DISPATCHED", "FOLLOW_UP.DUE", "FOLLOW_UP.SENT",
    "FULFILMENT.AUTHORISED", "FULFILMENT.CONFIRMED", "FULFILMENT.READY", "MCB_LIVE.ENQUIRY_RECEIVED",
    "ORDER.COMPLETED", "ORDER.PAID", "ORDER.READY_FOR_PROCESSING", "QUALITY_CHECK.FAILED", "QUALITY_CHECK.PASSED", "QUALITY_CHECK.READY",
    "REVEALED", "REVIEW.REQUESTED",
  ]);
  assert.ok(!M.ops.AUTOMATION_EVENTS.some((e) => /REFUND|CHARGE|SUPPLIER|PURCHASE/.test(e)));
});

test("operations.json is generated from the TypeScript and matches it", () => {
  const json = JSON.parse(read("public/api/data/operations.json"));
  assert.equal(json.states.length, M.ops.OPERATIONAL_STATES.length);
  assert.equal(json.priority_replacement_claim_window_days, M.catalogue.PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS);
  assert.deepEqual(json.customer_stages.DIGITAL.map((s) => s.id), M.ops.CUSTOMER_STAGES.DIGITAL.map((s) => s.id));
});

/* ------------------------------------------------------------------ */
/* Customer links                                                      */
/* ------------------------------------------------------------------ */

test("link tokens are read from the fragment only, and only in their exact shape", () => {
  const token = "A".repeat(20) + "b-_" + "9".repeat(20);
  assert.equal(M.customer.tokenFromHash(`#${token}`), token);
  assert.equal(M.customer.tokenFromHash("#MCB-2026-000001"), null, "a reference is not a key");
  assert.equal(M.customer.tokenFromHash("#" + "A".repeat(42)), null);
  assert.equal(M.customer.tokenFromHash("#<script>"), null);
  assert.equal(M.customer.tokenFromHash(""), null);
});

test("listening and tracking links are only followed over https", () => {
  assert.equal(M.customer.safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(M.customer.safeExternalUrl("http://example.com/x"), null);
  assert.equal(M.customer.safeExternalUrl("data:text/html,hi"), null);
  assert.equal(M.customer.safeExternalUrl("https://track.example.com/RM1"), "https://track.example.com/RM1");
});

test("the private pages are noindex, no-referrer, and never inject HTML", () => {
  for (const [name, path] of [["YourOrder", "/your-order"], ["Approve", "/approve"], ["Operations", "/operations"]]) {
    const { head } = M.render(name, path);
    assert.match(head, /noindex/, name);
    assert.match(head, /no-referrer/, name);
  }
  for (const file of ["src/pages/YourOrder.tsx", "src/pages/Approve.tsx", "src/pages/Operations.tsx", "src/pages/Blog.tsx", "src/pages/BlogPost.tsx", "src/pages/MCBLive.tsx"]) {
    assert.doesNotMatch(read(file), /dangerouslySetInnerHTML/, file);
  }
  assert.doesNotMatch(read("src/pages/Operations.tsx"), /localStorage|sessionStorage|document\.cookie/, "the CRM key stays in memory");
  const robots = read("public/robots.txt");
  for (const path of ["/your-order", "/approve", "/operations"]) assert.match(robots, new RegExp(`Disallow: ${path}\\n`));
  const sitemap = read("public/sitemap.xml");
  assert.doesNotMatch(sitemap, /your-order|approve|operations/);
});

test("the order page without a link says so plainly", () => {
  const { html } = M.render("YourOrder", "/your-order");
  assert.match(text(html), /This link is incomplete/);
  assert.doesNotMatch(text(html), /token|undefined|null/i);
});

/* ------------------------------------------------------------------ */
/* MCB LIVE                                                            */
/* ------------------------------------------------------------------ */

test("MCB LIVE posts a real enquiry to MCB's server, with WhatsApp as a second route", () => {
  const source = read("src/pages/MCBLive.tsx");
  assert.match(source, /submitLiveEnquiry/);
  assert.doesNotMatch(source, /window\.open/, "the form no longer only opens WhatsApp");
  const { html } = M.render("MCBLive", "/mcb-live");
  const page = text(html);
  for (const phrase of ["AVAILABLE FOR SELECT EVENTS WORLDWIDE", "DJ RINALDI", "LADY LAKH", "TOGETHER", "The MCB Song Reveal Experience", "Send enquiry", "No payment is taken at this stage"]) {
    assert.ok(page.includes(phrase), phrase);
  }
  for (const label of ["Your name", "Email", "Phone", "Event type", "Event date", "Venue, city or country", "Who would you like?", "Performance duration", "Approximate budget", "revealed at your event", "Anything else"]) {
    assert.ok(page.includes(label), label);
  }
  assert.match(html, /https:\/\/wa\.me\/447340742009\?text=/, "the site's existing published number, unchanged");
  assert.doesNotMatch(page, /£\s?\d|\bdeposit of\b|guaranteed availability|we are available/i);
});

test("the only WhatsApp number anywhere is the one already published", () => {
  const numbers = new Set();
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) walk(path);
      else if (/\.(tsx?|html)$/.test(name)) for (const m of read(path).matchAll(/wa\.me\/(\d+)/g)) numbers.add(m[1]);
    }
  };
  walk("src");
  assert.deepEqual([...numbers], ["447340742009"]);
  assert.match(read("index.html"), /"telephone": "\+447340742009"/);
});

test("MCB LIVE client validation matches the server's required fields", () => {
  const errors = M.customer.validateLiveEnquiry(M.customer.EMPTY_LIVE_ENQUIRY);
  assert.deepEqual(Object.keys(errors).sort(), ["email", "eventType", "location", "name"]);
  assert.deepEqual(M.customer.LIVE_PERFORMERS.map((p) => p.value), ["DJ_RINALDI", "LADY_LAKH", "TOGETHER", "HELP_ME_CHOOSE"]);
  const php = read("public/api/live/enquiry.php").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const p of M.customer.LIVE_PERFORMERS) assert.ok(php.includes(`'${p.value}'`), p.value);
  for (const d of M.customer.LIVE_DURATIONS) assert.ok(php.includes(`'${d.value}'`), d.value);
  assert.doesNotMatch(php, /stripe|orders|price|deposit_minor|checkout/i);
});

/* ------------------------------------------------------------------ */
/* Bespoke                                                             */
/* ------------------------------------------------------------------ */

test("Bespoke asks what to create, and shows the server's field errors", () => {
  assert.equal(M.concierge.EMPTY_ENQUIRY.createRequest, "");
  assert.match(read("src/pages/Bespoke.tsx"), /What would you like us to create\?/);
  assert.match(read("src/lib/concierge.ts"), /body\.fields \?\? body\.errors/);
});

/* ------------------------------------------------------------------ */
/* Blog                                                                */
/* ------------------------------------------------------------------ */

const posts = () => M.blog.BLOG_POSTS;
const words = (post) => post.content.map((b) => [b.text, b.title, b.label, ...(b.items ?? [])].filter(Boolean).join(" ")).join(" ");

test("the three launch articles exist with the approved titles", () => {
  assert.deepEqual(posts().map((p) => p.title), [
    "How to Turn a Special Memory Into a Personalised Song",
    "How to Preserve the Memories of a Cruise Long After You Return Home",
    "Picture Disc Keepsakes: Turning Music and Memories Into Something You Can Hold",
  ]);
});

test("every article has the full content model", () => {
  const slugs = new Set();
  for (const post of posts()) {
    assert.match(post.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!slugs.has(post.slug)); slugs.add(post.slug);
    for (const key of ["title", "excerpt", "heroImage", "publishedAt", "updatedAt", "seoTitle", "metaDescription"]) assert.ok(post[key], `${post.slug} ${key}`);
    assert.match(post.publishedAt, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.updatedAt >= post.publishedAt);
    assert.ok(M.imagery.IMAGES[post.heroImage], `${post.slug} hero image exists`);
    assert.ok(post.metaDescription.length >= 70 && post.metaDescription.length <= 170, `${post.slug} meta description length ${post.metaDescription.length}`);
    assert.ok(post.categories.length > 0);
    assert.equal(post.author.type, "Organization");
    assert.ok(post.related.every((slug) => posts().some((p) => p.slug === slug) && slug !== post.slug));
    assert.ok(post.cta.to.startsWith("/"));
    assert.ok(words(post).split(/\s+/).length >= 800, `${post.slug} is a substantial article`);
    assert.equal(post.content.filter((b) => b.type === "h2").length, new Set(post.content.filter((b) => b.type === "h2").map((b) => b.id)).size);
  }
});

test("articles make no statistical, testimonial, endorsement or guarantee claims", () => {
  for (const post of posts()) {
    const body = `${post.title} ${post.excerpt} ${post.metaDescription} ${words(post)}`;
    assert.doesNotMatch(body, /\d+\s?%|per ?cent|survey|studies|research (shows|suggests)|scientifically|proven/i, `${post.slug} statistics`);
    assert.doesNotMatch(body, /testimonial|five[- ]star|★|rated|reviews?\b|customers? (say|said|told us)|our customers love/i, `${post.slug} testimonials`);
    assert.doesNotMatch(body, /endorse|official partner|partnered with|as seen (in|on)|award/i, `${post.slug} endorsements`);
    assert.doesNotMatch(body, /Princess|Carnival|Royal Caribbean|P&O|Cunard|\bMSC\b|Celebrity Cruises|Norwegian Cruise|Disney/i, `${post.slug} names no cruise line`);
    assert.doesNotMatch(body, /guarantee|heirloom|£\s?10\b/i, `${post.slug} guarantees or retired products`);
  }
});

test("articles state product facts the catalogue agrees with", () => {
  const all = posts().map(words).join(" ");
  assert.match(all, /Journey is not a picture disc|Journey is a personalised album on standard vinyl/i);
  assert.doesNotMatch(all, /Journey[^.]*on a picture disc/i);
  for (const v of M.catalogue.KEEPSAKE.variants) assert.ok(all.includes(v.label), v.label);
});

test("each article renders as semantic HTML with BlogPosting and BreadcrumbList schema", () => {
  for (const post of posts()) {
    const { html, head } = M.render("BlogPost", `/blog/${post.slug}`, "/blog/:slug");
    assert.equal((html.match(/<h1/g) ?? []).length, 1);
    assert.match(html, /<article/);
    assert.match(html, new RegExp(`<time dateTime="${post.publishedAt}"`, "i"));
    assert.match(html, /aria-label="Breadcrumb"/);
    assert.match(html, /<picture/);
    assert.ok(text(html).includes(`By ${post.author.name}`));
    assert.match(head, new RegExp(`<title[^>]*>${post.seoTitle.replace(/[|()]/g, "\\$&")}</title>`));
    assert.match(head, /property="og:type" content="article"/);
    assert.match(head, /name="twitter:card" content="summary_large_image"/);
    assert.match(head, /property="og:image" content="https:\/\/www\.mycustombeats\.com\/images\/responsive\//);
    const ld = JSON.parse(head.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)[1]);
    const types = ld["@graph"].map((n) => n["@type"]);
    assert.ok(types.includes("BlogPosting") && types.includes("BreadcrumbList"));
    assert.ok(!JSON.stringify(ld).includes("FAQPage"), "no FAQ schema on articles");
    const article = ld["@graph"].find((n) => n["@type"] === "BlogPosting");
    assert.equal(article.datePublished, post.publishedAt);
    assert.equal(article.dateModified, post.updatedAt);
    assert.equal(article.mainEntityOfPage["@id"], `https://www.mycustombeats.com/blog/${post.slug}#webpage`);
    assert.ok(article.author["@id"]);
    const crumbs = ld["@graph"].find((n) => n["@type"] === "BreadcrumbList").itemListElement.map((i) => i.name);
    assert.deepEqual(crumbs, ["Home", "Blog", post.title]);
  }
});

test("the blog index lists every article and an unknown slug is not found", () => {
  const { html, head } = M.render("Blog", "/blog");
  for (const post of posts()) assert.ok(html.includes(`href="/blog/${post.slug}"`));
  assert.match(head, /CollectionPage/);
  const missing = M.render("BlogPost", "/blog/not-a-real-article", "/blog/:slug");
  assert.doesNotMatch(missing.html, /<article/);
  assert.match(read("src/App.tsx"), /path="\/blog\/:slug"/);
  const sitemap = read("public/sitemap.xml");
  for (const post of posts()) assert.match(sitemap, new RegExp(`/blog/${post.slug}<`));
});

test("the blog is lazy-loaded: no article text in the homepage bundle graph", () => {
  const app = read("src/App.tsx");
  assert.match(app, /const Blog = lazy\(\(\) => import\("\.\/pages\/Blog"\)\)/);
  assert.match(app, /const BlogPost = lazy/);
  assert.doesNotMatch(read("src/lib/seo.ts"), /data\/blog/, "seo.ts (in the main bundle) does not import the articles");
});

/* ------------------------------------------------------------------ */
/* Legacy guarantees                                                   */
/* ------------------------------------------------------------------ */

test("legacy guarantees still hold after Sprint 5", () => {
  const catalogue = JSON.parse(read("public/api/data/catalogue.json"));
  assert.equal(catalogue.skus.moment.price_minor, 1500, "Moment is £15, not £10");
  assert.ok(!Object.keys(catalogue.products).some((id) => /heirloom/i.test(id)));
  assert.equal(catalogue.products["cruise-ship-dj-bible"].online_checkout, false, "DJ Bible is not purchasable");
  assert.ok(Object.keys(catalogue.skus).filter((s) => s.startsWith("cruise-ship-dj-bible")).every((s) => catalogue.skus[s].orderable === false));
  assert.equal(M.catalogue.getProduct("gift-voucher").active, false, "gift vouchers are not activated");
  assert.equal(catalogue.products.bespoke.online_checkout, false);
  assert.equal(catalogue.products["mcb-live"].online_checkout, false);
  assert.match(read("public/api/checkout/session.php"), /'adaptive_pricing'\s*=>\s*\['enabled'\s*=>\s*false\]/);
  const example = read("public/api/config.example.php");
  assert.match(example, /'live_checkout_approved'\s*=>\s*false/);
  assert.match(example, /'checkout_sessions_enabled'\s*=>\s*false/);
});

test("no Apollo tracker and no active Cloudinary code in the site or API", () => {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(join(root, dir))) {
      const path = join(dir, name);
      if (statSync(join(root, path)).isDirectory()) { if (name !== "data") walk(path); continue; }
      if (!/\.(tsx?|php|html|js)$/.test(name)) continue;
      const source = read(path);
      if (/apollo\.io|assets\.apollo|window\.trackingFunctions/i.test(source)) offenders.push(`${path}: apollo`);
      if (/res\.cloudinary\.com|cloudinary\.com\/v1_1|from ["']cloudinary|require\(["']cloudinary/i.test(source)) offenders.push(`${path}: cloudinary`);
    }
  };
  walk("src");
  walk("public/api");
  for (const file of ["index.html"]) {
    const source = read(file);
    if (/apollo\.io|cloudinary\.com/i.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});
