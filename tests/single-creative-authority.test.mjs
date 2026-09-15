/**
 * Single Creative Authority customer journey (15 September 2026).
 *
 * The customer provides the memories; MCB creates, quality-checks and
 * reveals. No customer approval, drafts, APPROVE/REMAKE or included
 * revisions remain in the new journey. Run: npm test
 *
 * The server lifecycle (quality check gating fulfilment, reveal, retired
 * approval endpoint, consent enforcement, artwork-ready photos, £15 service)
 * is proven against PHP in tests/operations-acceptance.sh (sections 1–8), tests/transaction-acceptance.sh (8c) and tests/legal-acceptance.sh (3).
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-sca-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entry = `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
export * as legal from "${root}src/data/legal/index.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export * as orderRequest from "${root}src/lib/orderRequest.ts";
export * as personalisation from "${root}src/lib/personalisation.ts";
export * as createFlow from "${root}src/lib/createFlow.ts";
import Approve from "${root}src/pages/Approve.tsx";
import Terms from "${root}src/pages/legal/Terms.tsx";
import Refund from "${root}src/pages/legal/Refund.tsx";
import HowItWorks from "${root}src/sections/HowItWorksSection.tsx";
const pages = { Approve, Terms, Refund, HowItWorks };
export const render = (name, path) =>
  renderToStaticMarkup(h(HelmetProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: path.split("#")[0], element: h(pages[name]) })))));
`;
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, entry);
const outFile = join(root, "node_modules", `.mcb-sca-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" } });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { search: "", pathname: "/", hash: "" }, addEventListener() {}, removeEventListener() {} };
const M = await import(outFile);
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");

const FOUNDER_CONSENT =
  "I understand that MCB™ will use the information, preferences and photographs I provide to independently create my personalised song and custom artwork. I authorise MCB™ to make the creative and production decisions required to complete my order. I understand that I will not receive song or artwork drafts for creative approval and that subjective creative revisions are not included in my order. Once personalised production begins, cancellation/refund rights may be limited as permitted by applicable law. This does not affect any statutory rights that cannot legally be excluded.";

test("Creative Authority consent: separate, required for every order, not pre-ticked, Founder wording, versioned and sent", () => {
  const consent = M.legal.getConsent("CREATIVE_AUTHORITY");
  assert.equal(consent.heading, "Creative Authority & Personalised Production");
  assert.equal(consent.label, FOUNDER_CONSENT);
  assert.equal(consent.appliesTo, "ALWAYS");
  assert.equal(M.legal.INITIAL_CONSENT_STATE.CREATIVE_AUTHORITY, false);
  for (const digital of [true, false]) assert.ok(M.legal.requiredConsents({ hasDigitalDelivery: digital }).includes("CREATIVE_AUTHORITY"));
  const server = JSON.parse(read("public/api/data/legal.json"));
  assert.deepEqual(server.consents.CREATIVE_AUTHORITY, { applies_to: "ALWAYS" }, "the server derives the requirement from the same data");
  assert.equal(server.versions.creative_authority_consent, M.legal.CREATIVE_AUTHORITY_CONSENT_VERSION);
  const draft = M.personalisation.chooseVariant(M.personalisation.emptyDraft(), "moment");
  const body = M.orderRequest.buildOrderRequest(draft, { firstName: "A", lastName: "B", email: "a@b.co", phone: "", shippingName: "", shippingAddress: "", shippingAddress2: "", shippingCity: "", shippingState: "", shippingPostcode: "", shippingCountry: "" }, { ...M.legal.INITIAL_CONSENT_STATE }, new Set(), false);
  assert.equal(body.creativeAuthorityVersion, M.legal.CREATIVE_AUTHORITY_CONSENT_VERSION);
  assert.equal(body.consents.CREATIVE_AUTHORITY, false, "the browser sends exactly what was ticked");
  // Server-side: required from legal.json, version enforced, evidence stored.
  const order = read("public/api/order.php");
  assert.match(order, /creativeAuthorityVersion/);
  assert.match(order, /creative_authority_version, creative_authority_accepted_at/);
  assert.match(read("src/data/legal/review.ts"), /NEEDS PROFESSIONAL LEGAL REVIEW/);
});

test("Terms 2026-09-15.2 and Refunds: creative authority, production at payment, preference vs genuine problem, statutory rights", () => {
  assert.equal(M.legal.TERMS_VERSION, "2026-09-15.2");
  assert.ok(M.legal.KNOWN_TERMS_VERSIONS.includes("2026-09-15"), "orders under the earlier edition stay resolvable");
  const ids = M.legal.TERMS_CLAUSES.map((c) => c.id);
  assert.ok(!ids.includes("refinements") && !ids.includes("approval") && !ids.includes("production-lock"));
  for (const id of ["creative-authority", "production-and-reveal", "preference-and-problems", "cancellation"]) assert.ok(ids.includes(id), id);
  const all = M.legal.TERMS_CLAUSES.map((c) => [c.heading, ...c.body, c.footnote ?? ""].join(" ")).join(" ");
  assert.match(all, /Personalised production begins when your payment is confirmed/);
  assert.match(all, /We do not send drafts of your song or artwork for approval/);
  assert.match(all, /Nothing in these terms affects any statutory rights that cannot legally be excluded or limited\./);
  assert.match(all, /A music style you specifically chose is part of what you asked for/);
  assert.match(all, /used the wrong photograph/);
  assert.match(all, /responsible for checking that what you send is accurate/);
  assert.doesNotMatch(all, /refinements? (can|are|close)|approve your work|approving your work|no refunds under any circumstances|reasonable discount price/i);
  assert.match(all, /MCB has no responsibility for death or personal injury/, "clause 18 is unchanged, pending legal review");
  const refunds = M.legal.REFUND_SECTIONS.map((s) => [s.heading, s.question, ...s.body].join(" ")).join(" ");
  assert.match(refunds, /If you would have chosen differently/);
  assert.match(refunds, /If we got something wrong/);
  assert.doesNotMatch(refunds, /approved your work|refinements/i);
  const terms = text(M.render("Terms", "/legal/terms"));
  assert.match(terms, /Creative authority/);
  assert.doesNotMatch(terms, /Refinements|Approving your work/);
});

test("the customer journey is the approved five steps, positive first", () => {
  assert.deepEqual(M.legal.CREATIVE_JOURNEY.map((s) => s.title), [
    "Tell us your story", "Choose your sound", "Upload your photograph", "Trust MCB with the creativity", "Experience the reveal",
  ]);
  assert.equal(M.legal.CREATIVE_PROMISE, "You provide the memories. We create the surprise.");
  const home = text(M.render("HowItWorks", "/"));
  assert.match(home, /You provide the memories\. We create the surprise\./);
  assert.match(home, /Experience the reveal/);
  assert.doesNotMatch(home, /No revisions|No approval|No changes/);
});

test("old approval links: a polite non-action page, and an endpoint that writes nothing", () => {
  const page = text(M.render("Approve", "/approve#" + "A".repeat(43)));
  assert.match(page, /This link is no longer used/);
  assert.doesNotMatch(page, /approve it|I'd like some changes|Send my changes|Listen to/i);
  const endpoint = code(read("public/api/order-approval.php"));
  assert.doesNotMatch(endpoint, /INSERT|UPDATE|approve_work|record_changes|send_lifecycle|find_access_token|record_order_event/);
  assert.match(endpoint, /'retired' => true/);
  assert.match(endpoint, /require_same_origin\(\)/);
  assert.match(endpoint, /enforce_scoped_rate_limit/);
  assert.match(read("src/lib/analytics.ts"), /your-order\|approve\|operations/, "the retired page stays private for analytics");
});

test("no customer approval, APPROVE/REMAKE or revision path remains in the server lifecycle", () => {
  const ops = code(read("public/api/lib/operations.php"));
  const actions = ops.slice(ops.indexOf("const MCB_STAFF_ACTIONS"), ops.indexOf("];", ops.indexOf("const MCB_STAFF_ACTIONS")));
  for (const retired of ["REQUEST_APPROVAL", "RECORD_APPROVAL", "RECORD_CHANGES_REQUEST", "REISSUE_APPROVAL_LINK", "MARK_CREATIVE_READY"]) {
    assert.ok(!actions.includes(`'${retired}'`), retired);
  }
  for (const current of ["SEND_TO_QUALITY_CHECK", "PASS_QUALITY_CHECK", "FAIL_QUALITY_CHECK", "SEND_REVEAL"]) assert.ok(actions.includes(`'${current}'`), current);
  assert.doesNotMatch(ops, /function approve_work|function record_changes|function included_revision_allowance|CUSTOMER_REQUEST/);
  assert.match(ops, /founder_authorisation_required/, "partner purchase is authorised by Bella or Lewis");
  const email = code(read("public/api/lib/lifecycle-messages.php"));
  assert.match(email, /const MCB_LIFECYCLE_TYPES = \['CREATION_READY', 'IN_PRODUCTION', 'DISPATCHED', 'FOLLOW_UP'\]/);
  assert.doesNotMatch(email, /Listen and approve|what you would like changed|approving/i);
  assert.match(code(read("public/api/crm/production.php")), /endpoint_retired/);
  assert.match(read("public/api/stripe/webhook.php"), /ORDER\.READY_FOR_PROCESSING/);
});

test("public catalogue and structured data carry no revisions, approval promises, QC notes or supplier details; £15 service is correct", () => {
  const feedText = read("public/catalogue.json");
  const feed = JSON.parse(feedText);
  assert.doesNotMatch(feedText, /included_revisions|"revisions"|refinement|approve|qc_|checklist|supplier/i);
  assert.match(feed.ordering_rules.creative_process, /No drafts are sent for approval/);
  const service = feed.products.find((p) => p.id === "artwork-preparation");
  assert.equal(service.variants[0].price.minor_units, 1500);
  assert.equal(service.variants[0].price.amount, "15.00");
  const server = JSON.parse(read("public/api/data/catalogue.json"));
  assert.equal(server.skus["artwork-preparation"].price_minor, 1500);
  assert.deepEqual(server.rules.photo_artwork_product_ids, ["keepsake", "journey"]);
  assert.equal(server.rules.artwork_photo_min_px, 2500);
  assert.doesNotMatch(read("src/lib/seo.ts"), /"Revisions"/);
  assert.equal(M.catalogue.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "artwork-preparation", quantity: 1 }]).ok, false, "not for a Moment");
  const ok = M.catalogue.previewOrder([{ sku: "keepsake-7-picture-disc", quantity: 1 }, { sku: "artwork-preparation", quantity: 1 }]);
  assert.equal(ok.ok && ok.totalMinor, 9900 + 1500);
  assert.equal(M.catalogue.previewOrder([{ sku: "journey-6", quantity: 1 }, { sku: "artwork-preparation", quantity: 2 }]).ok, false, "once per order");
});

/**
 * THE LEGACY-LANGUAGE SEARCH, as a test. Customer-facing source may mention
 * approval or refinement only in these reviewed, non-creative senses; any
 * other occurrence fails.
 */
test("legacy approval/refinement language: no active customer-facing creative approval or refinement promise remains", () => {
  const customerFacing = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components"), ...walk("src/data"), ...walk("src/lib"), "public/api/lib/lifecycle-messages.php", "public/api/lib/notify.php", "public/catalogue.json"]
    .filter((f) => /\.(tsx?|php|json)$/.test(f))
    .filter((f) => !/src\/components\/ui\/|src\/data\/legal\/review\.ts$|src\/data\/legal\/versions\.ts$|src\/pages\/Operations\.tsx$|src\/data\/operations\.ts$/.test(f));
  const pattern = /\b(approv\w*|refine\w*|revision\w*|remake\w*|drafts?|sign-off|changes requested)\b/gi;
  const allowed = [
    /approved (image|imagery|photograph|photography|mark|text|copy|figure|founder|marketing|price|wording|commercial|proposition|picture|square|founder note|release)/i,
    /founder-approved|Founder-approved|Approved text|none has been approved|has approved being credited|no (approved|tax treatment is approved)/i,
    /live_checkout_approved|launch approval|approve launch|approve going live/i,
    /drafts? (for|of your song|to approve|waiting for approval)|no drafts|not another draft|won't send drafts|don't send drafts|do not send drafts|will not receive song or artwork drafts|receive a draft|a draft\?/i,
    /revisions are not included|subjective creative revisions|no revision rounds|revision or refinement round|revision, remake or refund|isn't treated as an error|not a revision|revision rounds|creative approval|not a creative approval|separate approval step|nothing (more )?you need to approve|no approval|approval (step|loop|stage)|retired approval|customer approval|without a separate approval/i,
    /refined, (deeply )?personal/i,
    /DRAFT_STORAGE_KEY|mcb_create_draft|OrderDraft|draft\b|\bDraft\b/,
    // Remedies for a genuine problem, not a creative revision.
    /repair, replace, remake or refund/i,
    // Compatibility identifiers for retired links; the private-path rule.
    /\bApprove\b|RetiredApproval|order-approval|your-order\|approve/,
    // Legacy stage values kept for historical records.
    /"(SONG_READY|AWAITING_APPROVAL|REVISION_REQUESTED|APPROVED)"|Legacy/,
    /No further approval from you|decisions for you to approve/,
    /refined below/,
  ];
  const offenders = [];
  for (const file of customerFacing) {
    const source = code(read(file));
    for (const line of source.split("\n")) {
      if (!pattern.test(line)) continue;
      pattern.lastIndex = 0;
      if (allowed.some((ok) => ok.test(line))) continue;
      offenders.push(`${file}: ${line.trim().slice(0, 140)}`);
    }
  }
  assert.deepEqual(offenders, []);
});
