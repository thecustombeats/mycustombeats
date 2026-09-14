/**
 * MCB public site — homepage, product pages and navigation, rendered to HTML.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  MemoryPromise: "src/sections/home/MemoryPromise.tsx",
  Navigation: "src/components/Navigation.tsx",
  Footer: "src/sections/Footer.tsx",
  ProductPage: "src/pages/ProductPage.tsx",
  Products: "src/pages/Products.tsx",
  Bespoke: "src/pages/Bespoke.tsx",
  MCBLive: "src/pages/MCBLive.tsx",
  PriorityReplacement: "src/pages/PriorityReplacement.tsx",
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
