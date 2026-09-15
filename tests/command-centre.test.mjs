/**
 * MCB Founder Command Centre — Sprint 1 (15 September 2026). Run: npm test
 *
 * Contracts: staff/founder only, never indexed or measured; plain founder
 * language with engineering detail kept underneath; deep links and cards only
 * open things; quality questions cover every QC criterion; unknown figures
 * are shown as unknown; no money moves; Mozart AI is founder selected with
 * integration pending and nothing calls it.
 * Server behaviour is proven against PHP in tests/command-centre-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => { const p = join(dir, name); return statSync(join(root, p)).isDirectory() ? walk(p) : [p]; });
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#|\*).*$/gm, "");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-cc-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.jsx");
writeFileSync(entryPath, `
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
export * as cc from "${root}src/lib/commandCentre.ts";
export * as creative from "${root}src/data/production/creative.ts";
export { isPrivateAnalyticsPath } from "${root}src/lib/analytics.ts";
import CommandCentre from "${root}src/pages/CommandCentre.tsx";
export const render = (path) => renderToStaticMarkup(h(HelmetProvider, null, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null, h(Route, { path: "/command-centre", element: h(CommandCentre) })))));
`);
const outFile = join(root, "node_modules", `.mcb-cc-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", jsx: "automatic", packages: "external", outfile: outFile, logLevel: "error", loader: { ".tsx": "tsx", ".ts": "ts", ".css": "empty" } });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }), location: { search: "", pathname: "/", hash: "" }, addEventListener() {}, removeEventListener() {} };
const M = await import(outFile);
const lib = read("public/api/lib/command-centre.php");
const endpoint = read("public/api/crm/command-centre.php");
const page = read("src/pages/CommandCentre.tsx");
const ui = walk("src/pages/command-centre").map(read).join("\n");

test("staff/founder only: CRM key on every request, never indexed, never measured, key kept in memory", () => {
  assert.match(endpoint, /require_crm_key\(\);/);
  assert.match(endpoint, /X-Robots-Tag: noindex, nofollow/);
  assert.match(read("public/robots.txt"), /Disallow: \/command-centre\n/);
  assert.match(read("public/.htaccess"), /operations\|command-centre\|thank-you/);
  assert.ok(M.isPrivateAnalyticsPath("/command-centre"));
  assert.match(read("public/analytics-init.js"), /operations\|command-centre/);
  assert.doesNotMatch(read("public/sitemap.xml"), /command-centre/);
  const html = M.render("/command-centre");
  assert.match(html, /noindex/);
  assert.match(html, /no-referrer/);
  assert.match(html, /Sign in/);
  for (const source of [page, ui]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie|dangerouslySetInnerHTML|gtag|trackEvent|trackPageView/);
  }
  // Standalone: no site layout, so no consent banner or analytics loader on the page.
  assert.match(read("src/App.tsx"), /<Route path="\/command-centre" element=\{<CommandCentre \/>\} \/>/);
});

test("deep links only choose what to show; unknown values are ignored, never executed", () => {
  assert.deepEqual(M.cc.parseCommandLink("#view=orders&order=MCB-2026-000123&open=approve"), { view: "orders", order: "MCB-2026-000123", open: "approve" });
  assert.deepEqual(M.cc.parseCommandLink("#view=delete&order=1;DROP&open=authorise&founder_code=x"), { view: "today", order: null, open: null });
  assert.equal(M.cc.commandLink({ view: "orders", order: "MCB-2026-000123", open: "quality" }), "#view=orders&order=MCB-2026-000123&open=quality");
  assert.ok(!M.cc.OPEN_MODES.some((m) => /authoris|pass|resolve|refund|purchase/i.test(m)));
  // Opening an order reads it: the only POSTs are explicit form submissions and decision buttons.
  const views = read("src/pages/command-centre/OrderView.tsx");
  assert.doesNotMatch(code(views).slice(code(views).indexOf("useEffect"), code(views).indexOf("if (error && !data)")), /order-action|method: "POST"|api\([^)]*,\s*\{/);
  assert.doesNotMatch(code(page).slice(code(page).indexOf("useEffect(() => {\n    if (!signedIn) return;"), code(page).indexOf("const signIn")), /order-action|command-centre", \{/);
});

test("founder language first; engineering words only under Advanced / technical", () => {
  const visible = code(page + ui).replace(/Advanced \/ technical[\s\S]*?<\/details>/g, "");
  for (const phrase of ["MCB Today", "Needs your attention", "Needs quality check", "Needs your approval", "Being made", "On the way", "Delivered", "Needs attention", "Creating", "Customers needing help", "MCB system health", "Launch readiness", "Approvals", "MCB profit snapshot", "Orders pipeline", "Paid revenue"]) {
    assert.ok(visible.includes(phrase), phrase);
  }
  const jsxText = [...visible.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
  assert.doesNotMatch(jsxText, /\b(QC|EVENT|QUEUE|STATE MACHINE|OUTBOX|WEBHOOK|RETRY)\b/);
  assert.match(lib, /'QUALITY_CHECK' => 'Quality check'/);
  assert.match(lib, /'BEING_MADE' => 'Being made', 'ON_THE_WAY' => 'On the way', 'DELIVERED' => 'Delivered'/);
  assert.match(ui, /Advanced \/ technical/);
  // "Approval" here is only the Founders' financial approval; the customer approves nothing.
  const approvalLines = code(page + ui + read("src/lib/commandCentre.ts")).split("\n").filter((l) => /approv/i.test(l));
  assert.ok(approvalLines.length > 0);
  for (const line of approvalLines) assert.doesNotMatch(line, /customer approv|approve (your|the) (song|artwork|creation)|send for approval|awaiting customer/i, line);
});

test("quality questions cover every Creative QC and visual QC criterion", () => {
  const creative = JSON.parse(read("public/api/data/creative.json")).creative_qc_criteria;
  const visual = JSON.parse(read("public/api/data/artwork.json")).visual_qc_criteria;
  const block = (name) => lib.slice(lib.indexOf(`const ${name} = [`), lib.indexOf("];", lib.indexOf(`const ${name} = [`)));
  const covered = (name) => [...block(name).matchAll(/'criteria' => \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
  assert.deepEqual(covered("CC_SONG_QUESTIONS").sort(), [...creative].sort());
  assert.deepEqual(covered("CC_ARTWORK_QUESTIONS").sort(), [...visual].sort());
  for (const label of ["Story correct?", "Names and details correct?", "Song sounds professional?", "Vocals good?", "Emotion right?", "Music and style right?", "Pronunciation right?", "Good enough for MCB?"]) assert.ok(lib.includes(label), label);
  for (const label of ["Correct customer?", "Correct photo?", "Names and dates correct?", "Spelling and title correct?", "Composition good?", "Important content safe and readable?", "Premium MCB standard?"]) assert.ok(lib.includes(label), label);
  assert.ok(M.cc.answersComplete([{ key: "a" }, { key: "b" }], { a: "YES", b: "NOT_APPLICABLE" }));
  assert.ok(!M.cc.answersComplete([{ key: "a" }, { key: "b" }], { a: "YES" }));
  assert.ok(!M.cc.canPass({ a: "YES", b: "NO" }));
  for (const label of ["Pass quality check", "Send back for internal rework", "Escalate"]) assert.ok(ui.includes(label), label);
  assert.match(ui, /The customer has not been contacted/);
});

test("unknown figures stay unknown; contribution is labelled estimated or actual and never net profit", () => {
  assert.equal(M.cc.money(null), "— Awaiting data");
  assert.equal(M.cc.money(14999), "£149.99");
  assert.equal(M.cc.money(-500), "−£5.00");
  assert.match(lib, /'label' => 'ESTIMATED'/);
  assert.match(lib, /'label' => 'ACTUAL'/);
  assert.match(lib, /never treated as zero cost|never as zero cost/);
  assert.doesNotMatch(code(page + ui), />[^<]*\bnet profit\b/i);
  assert.match(lib, /stripe_livemode = 1/, "live payments are revenue; TEST payments are shown apart");
  assert.match(lib, /status = 'REFUNDED'/, "refunds only where recorded");
});

test("no autonomous money, no Mozart call, no provider wiring", () => {
  for (const source of [lib, endpoint, page, ui]) {
    assert.doesNotMatch(code(source), /curl_init|fsockopen|file_get_contents\(\s*['"]https?:|\/v1\/refunds|\/v1\/payouts|\/v1\/transfers|api\.mozart|mozart\.ai\/api/i);
  }
  assert.match(endpoint, /'SONG_QUALITY_CHECK' =>[\s\S]*'ARTWORK_QUALITY_CHECK' =>[\s\S]*default => throw/);
  // Financial authorisation stays with crm/order-action and a founder code.
  assert.match(read("src/pages/command-centre/OrderView.tsx"), /action: "AUTHORISE_SUPPLIER_PURCHASE", founder: form\.founder, founder_code: form\.founder_code, confirm: form\.confirm === true/);
  const C = M.creative;
  assert.equal(C.PROVIDER_DECISION_STATUS, "FOUNDER_SELECTED");
  assert.equal(C.SELECTED_MUSIC_PLATFORM.account, "NOT_YET_OPENED");
  assert.equal(C.SELECTED_MUSIC_PLATFORM.integration, "PENDING");
  const mozart = C.PROVIDER_REGISTRY.find((p) => p.id === C.SELECTED_MUSIC_PLATFORM.providerId);
  assert.equal(mozart.adapter, null);
  assert.equal(mozart.role, "DISABLED");
  assert.ok(Object.values(mozart.capabilities).every((v) => v === "UNKNOWN"));
  assert.doesNotMatch(read("public/api/config.example.php"), /mozart/i, "no Mozart configuration before its capabilities are verified");
  assert.doesNotMatch(JSON.stringify(C.SELECTED_MUSIC_PLATFORM), /price|cost|£|\$/i);
});

test("readiness and the bridge are truthful; Telegram is connected only after a real Telegram delivery", () => {
  assert.match(lib, /'telegram' => \$telegram \? 'CONNECTED' : 'NOT_CONNECTED'/);
  assert.match(lib, /isset\(\$channels\['TELEGRAM'\]\)/);
  assert.match(lib, /'legal_review', 'Legal review', 'NEEDS_EXTERNAL_VERIFICATION'/);
  assert.match(lib, /'artwork_production', 'Artwork production', 'DEFERRED'/);
  for (const s of ["READY", "PARTIAL", "NOT_READY", "DEFERRED", "NEEDS_FOUNDER_ACTION", "NEEDS_EXTERNAL_VERIFICATION"]) assert.ok(M.cc.READINESS_LABELS[s], s);
});

test("accessibility basics: labelled regions, skip link, pressed states, large touch targets, status in words", () => {
  assert.match(page, /Skip to content/);
  assert.match(page, /aria-label="Command Centre"/);
  assert.match(page, /aria-current=\{current \? "page" : undefined\}/);
  assert.match(page, /aria-pressed=/);
  assert.match(read("src/pages/command-centre/styles.ts"), /min-h-12/);
  assert.match(read("src/pages/command-centre/ui.tsx"), /<span aria-hidden="true">\{good \? "✓" : "!"\}<\/span>\{label\}/, "status is words, not colour alone");
  assert.doesNotMatch(page + ui, /min-w-\[\d{3,}px\]/, "nothing forces a phone to scroll sideways");
});

test("audit: quality decisions record who, what, order and result; views are read-only", () => {
  assert.match(lib, /'FOUNDER.QUALITY_REVIEWED', \['kind' => 'SONG', 'candidate_id' => \$candidateId, 'decision' => \$decision, 'by' => \$staff/);
  assert.match(lib, /'FOUNDER.QUALITY_REVIEWED', \['kind' => 'ARTWORK'/);
  assert.match(lib, /COMMAND_CENTRE_QUALITY_VIEW/);
  for (const fn of ["cc_overview", "cc_paid_orders", "cc_revenue", "cc_profit", "cc_health", "cc_readiness", "cc_notifications", "cc_search", "cc_order_card", "cc_advanced", "cc_approvals", "cc_attention", "cc_customer_problems"]) {
    const start = lib.indexOf(`function ${fn}(`);
    const body = lib.slice(start, lib.indexOf("\n}\n", start));
    assert.doesNotMatch(body, /\b(INSERT|UPDATE|DELETE)\b/, fn);
  }
  assert.doesNotMatch(lib.slice(lib.indexOf("function cc_search("), lib.indexOf("\n}\n", lib.indexOf("function cc_search("))), /record_order_event|error_log|creative_access_log/, "search text is never recorded");
});
