/**
 * MCB customer experience — what customers actually see.
 *
 * Components are rendered to static HTML (react-dom/server) and the markup is
 * checked against the catalogue's commercial rules. Run: npm test
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const outDir = mkdtempSync(join(root, "node_modules", ".mcb-ui-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));

/**
 * Bundles a tiny entry that exports render helpers. React and friends stay
 * external so the test uses the same copies the app does.
 */
const entry = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
export * as P from "${root}src/lib/personalisation.ts";
export { default as StepChoose } from "${root}src/pages/create/StepChoose.tsx";
export { default as StepStory } from "${root}src/pages/create/StepStory.tsx";
export { default as StepExtras } from "${root}src/pages/create/StepExtras.tsx";
export { default as VariantSelector } from "${root}src/components/VariantSelector.tsx";
export * as C from "${root}src/data/catalogue/index.ts";
export const render = (component, props = {}, path = "/") =>
  renderToStaticMarkup(h(HelmetProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(component, props))));
`;
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, entry);
const outFile = join(root, "node_modules", `.mcb-ui-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts" } });
after(() => rmSync(outFile, { force: true }));
const UI = await import(outFile);
const { P, C, render } = UI;

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const noop = () => {};
const draftFor = (sku, quantity) => P.chooseVariant(P.emptyDraft(), sku, quantity);
const count = (html, pattern) => (html.match(pattern) ?? []).length;

test("Keepsake selector shows exactly the four authorised picture discs and prices", () => {
  const html = render(UI.StepChoose, { draft: P.chooseProduct(P.emptyDraft(), "keepsake"), setDraft: noop, showErrors: false, onProduct: noop, onVariant: noop });
  const t = text(html);
  assert.equal(count(html, /type="radio"[^>]*value="keepsake-/g), 4);
  for (const price of ["£99", "£129.99", "£139.99", "£149.99"]) assert.ok(t.includes(price), price);
  assert.ok(!t.includes("£79.99") && !/£79\b/.test(t), "no £79.99 variant");
  for (const phrase of ["7-inch picture disc", "heart-shaped picture disc", "10-inch heart-shaped picture disc", "10-inch picture disc", "12-inch picture disc"]) assert.ok(t.toLowerCase().includes(phrase), phrase);
  assert.ok(t.includes("4 songs") && t.includes("3 songs") && t.includes("1 song"));
});

test("Journey selector shows 6 and 12 songs, standard vinyl, and never a picture disc or 'no vinyl'", () => {
  const html = render(UI.StepChoose, { draft: P.chooseProduct(P.emptyDraft(), "journey"), setDraft: noop, showErrors: false, onProduct: noop, onVariant: noop });
  const t = text(html);
  assert.equal(count(html, /type="radio"[^>]*value="journey-/g), 2);
  assert.ok(t.includes("6 Songs") && t.includes("12 Songs"));
  assert.ok(t.includes("£199") && t.includes("£349"));
  assert.match(t, /classic black vinyl/i);
  assert.match(t, /Journey is not a Picture Disc/);
  assert.ok(!/no vinyl/i.test(t));
  assert.ok(!/\b(12|10|7)-inch (heart-shaped )?picture disc\b/i.test(t), "no picture-disc format line on Journey");
});

test("Moment is £15 and Bespoke carries no price", () => {
  const html = render(UI.StepChoose, { draft: P.emptyDraft(), setDraft: noop, showErrors: false, onProduct: noop, onVariant: noop });
  const t = text(html);
  assert.ok(t.includes("Moment") && t.includes("£15"));
  assert.ok(/Bespoke is individually quoted/.test(t));
  assert.ok(!/Heirloom/i.test(t));
  assert.ok(!/£799/.test(t));
});

test("two 12-inch Keepsakes are personalised separately, four memories each", () => {
  const draft = draftFor("keepsake-12-picture-disc", 2);
  const html = render(UI.StepStory, { draft, setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onStyleEvent: noop });
  const t = text(html);
  assert.ok(t.includes("Keepsake 1") && t.includes("Keepsake 2"));
  assert.equal(count(html, /aria-controls="panel-unit-1-memory-/g), 4, "four memory blocks on the visible Keepsake");
  assert.ok(t.includes("Memory 1 of 4") && t.includes("Memory 4 of 4"));
  assert.ok(t.includes("0 of 8 memories ready"));
});

test("Journey 12 renders twelve chapters, one open at a time, each with its own style choice", () => {
  const draft = draftFor("journey-12");
  const html = render(UI.StepStory, { draft, setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onStyleEvent: noop });
  const t = text(html);
  assert.equal(count(html, /aria-controls="panel-unit-1-memory-/g), 12);
  assert.ok(t.includes("Chapter 1 of 12") && t.includes("Chapter 12 of 12"));
  assert.equal(count(html, /<textarea/g), 1, "only the open chapter's form is rendered");
  assert.match(html, /maxLength="300"|maxlength="300"/i);
  assert.match(t, /Let MCB choose the musical style/);
  assert.match(t, /0 \/ 300/);
});

test("a Moment has one memory that is open straight away", () => {
  const html = render(UI.StepStory, { draft: draftFor("moment"), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onStyleEvent: noop });
  assert.equal(count(html, /<textarea/g), 1);
  assert.ok(text(html).includes("Your memory"));
});

test("choosing MCB's style explains that the musical direction is MCB's to choose — no refinement promise", () => {
  const draft = P.updateMemory(draftFor("journey-6"), "unit-1-memory-1", { style: "MCB Choice" });
  const t = text(render(UI.StepStory, { draft, setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onStyleEvent: noop }));
  assert.match(t, /trusting our creative judgement/);
  assert.match(t, /part of the reveal/);
  assert.doesNotMatch(t, /refinement|remake|revision/i);
});

test("a Keepsake or Journey needs a photograph; an unready photo offers another photo or the £15 Artwork Preparation Service", () => {
  const draft = draftFor("keepsake-7-picture-disc");
  const id = draft.units[0].memories[0].id;
  assert.deepEqual(P.photoIssues(draft, new Set(), new Map()).map((i) => i.kind), ["missing"]);
  assert.deepEqual(P.photoIssues(draft, new Set([id]), new Map([[id, { width: 2500, height: 2500 }]])), []);
  assert.deepEqual(P.photoIssues(draft, new Set([id]), new Map([[id, { width: 4000, height: 4020 }]])), [], "a larger square photo passes");
  assert.deepEqual(P.photoIssues(draft, new Set([id]), new Map([[id, { width: 3000, height: 2000 }]])).map((i) => i.kind), ["not_ready"]);
  assert.deepEqual(P.photoIssues(draft, new Set([id]), new Map([[id, null]])).map((i) => i.kind), ["not_ready"], "an unreadable photo is not confirmed");
  const prepared = { ...draft, artworkPreparation: true };
  assert.deepEqual(P.photoIssues(prepared, new Set([id]), new Map([[id, { width: 800, height: 600 }]])), []);
  assert.deepEqual(P.draftLines(prepared).at(-1), { sku: "artwork-preparation", quantity: 1 });
  assert.equal(P.draftLines(draft).some((l) => l.sku === "artwork-preparation"), false, "never preselected");
  assert.deepEqual(P.photoIssues(draftFor("moment"), new Set(), new Map()), [], "a Moment's photo stays optional");
  const html = render(UI.StepStory, { draft, setDraft: noop, photos: new Map([[id, new Blob()]]), photoChecks: new Map([[id, { width: 1200, height: 900 }]]), setPhoto: noop, showErrors: false, onStyleEvent: noop });
  const t = text(html);
  assert.match(t, /isn't artwork-ready/);
  assert.match(t, /Add MCB Artwork Preparation Service — £15/);
  assert.match(t, /Not every photograph can be prepared to print quality/);
});

test("the plaque is no longer a Finishing Touches upsell, and still never claims to play music", () => {
  // Founder decision, 16 September 2026: the plaque stays an active product but
  // is offered as a finishing touch to nothing.
  for (const sku of ["moment", "keepsake-12-picture-disc", "journey-6"]) {
    const t = text(render(UI.StepExtras, { draft: P.addPlaque(draftFor(sku)), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onAdd: noop }));
    assert.ok(!/Personalised Music Plaque/.test(t), `${sku} must not be offered the plaque`);
  }
  // Its own facts are unchanged wherever it IS shown.
  assert.match(C.PERSONALISED_MUSIC_PLAQUE.disclosures.join(" "), /does not play music/i);
  assert.equal(C.PERSONALISED_MUSIC_PLAQUE.variants[0].price.minor, 4999);
});

test("Priority Replacement appears only for Keepsakes and is never preselected", () => {
  const journey = text(render(UI.StepExtras, { draft: draftFor("journey-6"), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onAdd: noop }));
  assert.ok(!journey.includes("Priority Replacement"));
  const moment = text(render(UI.StepExtras, { draft: draftFor("moment"), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onAdd: noop }));
  assert.ok(!moment.includes("Priority Replacement"));

  const keepsakeHtml = render(UI.StepExtras, { draft: draftFor("keepsake-7-picture-disc", 3), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onAdd: noop });
  const keepsake = text(keepsakeHtml);
  assert.ok(keepsake.includes("MCB Priority Replacement™"));
  assert.ok(keepsake.includes("£19.99 per Keepsake"));
  assert.match(keepsake, /normal consumer rights are not affected/);
  assert.match(keepsake, /within 7 days of confirmed delivery/);
  assert.match(keepsakeHtml, /aria-live="polite">0</, "quantity starts at zero");
});

test("every price rendered in the order flow exists in the catalogue", () => {
  const allowed = new Set(C.PRODUCTS.flatMap((p) => p.variants.map((v) => C.formatMoney(v.price))));
  allowed.add("£99"); // "From £99"
  const pages = [
    render(UI.StepChoose, { draft: P.chooseProduct(P.emptyDraft(), "keepsake"), setDraft: noop, showErrors: false, onProduct: noop, onVariant: noop }),
    render(UI.StepChoose, { draft: P.chooseProduct(P.emptyDraft(), "journey"), setDraft: noop, showErrors: false, onProduct: noop, onVariant: noop }),
    render(UI.StepExtras, { draft: P.addPlaque(draftFor("keepsake-12-picture-disc", 2)), setDraft: noop, photos: new Map(), setPhoto: noop, showErrors: false, onAdd: noop }),
  ];
  for (const html of pages) {
    for (const price of text(html).match(/£[\d,]+(?:\.\d{2})?/g) ?? []) assert.ok(allowed.has(price), `unexpected price ${price}`);
  }
});
