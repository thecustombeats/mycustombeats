/**
 * MCB™ Security, Resilience & Automation Readiness (17 September 2026). Run: npm test
 *
 * Source-level regression guards for the hardening sprint. Server behaviour
 * (isolation, escalation, uploads, payments, races, recovery, REQUIRED safety,
 * migration chain) is proven against PHP in tests/security-acceptance.sh; the
 * permanent money guard is tests/no-money-automation.test.mjs.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#|\*).*$/gm, "");
const phpFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}\n", start));
};

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-sec-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as cc from "${root}src/lib/commandCentre.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export { isPrivateAnalyticsPath } from "${root}src/lib/analytics.ts";
`);
const outFile = join(root, "node_modules", `.mcb-sec-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" }, matchMedia: () => ({ matches: false }) };
const { cc: CC, catalogue: C, isPrivateAnalyticsPath } = await import(outFile);
const resilience = read("public/api/lib/resilience.php");

test("private customer and staff screens: never framed, no analytics or form origins, never measured", () => {
  const ht = read("public/.htaccess");
  const block = ht.slice(ht.indexOf('<If "%{THE_REQUEST} =~ m#^[A-Z]+ /(your-order|approve|operations|command-centre)#">'), ht.indexOf("</If>", ht.indexOf('<If "%{THE_REQUEST} =~ m#^[A-Z]+ /(your-order|approve|operations|command-centre)#">')));
  assert.match(block, /frame-ancestors 'none'/);
  assert.match(block, /X-Frame-Options "DENY"/);
  assert.match(block, /media-src 'self' blob:/, "songs and videos still play");
  assert.doesNotMatch(block, /googletagmanager|google-analytics|analytics\.google|formspree|zapier|recaptcha|doubleclick|script\.google/i);
  for (const path of ["/your-order", "/operations/customer-care", "/command-centre", "/approve"]) assert.ok(isPrivateAnalyticsPath(path), path);
  // Site-wide headers stay: nosniff, permissions policy, referrer policy; HSTS is prepared for the deployment host.
  assert.match(ht, /X-Content-Type-Options "nosniff"/);
  assert.match(ht, /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\)/);
  assert.match(ht, /<If "%\{ENV:MCB_HSTS\} == '1'">/, "HSTS is prepared, enabled only when the host switches it on");
  const api = read("public/api/.htaccess");
  assert.match(api, /RedirectMatch 403 \^\/api\/lib\//);
  assert.match(api, /RedirectMatch 403 \^\/api\/data\//);
  assert.match(api, /RedirectMatch 403 \^\/api\/storage\//);
});

test("guessing is throttled: staff key failures per address, and founder codes across all orders", () => {
  const security = read("public/api/lib/security.php");
  assert.match(phpFunction(security, "require_crm_key"), /crm_key_failure_throttle\(\);[\s\S]*json_error\(401/);
  assert.match(phpFunction(security, "crm_key_failure_throttle"), /> 100[\s\S]*json_error\(429/);
  const ops = read("public/api/lib/operations.php");
  assert.match(ops, /const MCB_FOUNDER_AUTHORISATION_ATTEMPTS_ALL_ORDERS = 15;/);
  assert.match(phpFunction(ops, "check_founder_authorisation_request"), /\$everywhere >= MCB_FOUNDER_AUTHORISATION_ATTEMPTS_ALL_ORDERS/);
  for (const endpoint of ["order-progress", "order-status", "order-support", "order-support-case", "order-evidence", "order-video", "order-quote"]) {
    assert.match(read(`public/api/${endpoint}.php`), /enforce_scoped_rate_limit\(|rate_limit\(/, endpoint);
  }
});

test("uploads: content signature, no markup, complete files (tolerating phone trailers), never the web root", () => {
  const uploads = read("public/api/lib/uploads.php");
  const inspect = phpFunction(uploads, "inspect_uploaded_image");
  assert.match(inspect, /\\xFF\\xD8\\xFF/);
  assert.match(inspect, /<\\\?php\|<\\\?=\|<script\|<html\|<svg/);
  assert.match(inspect, /strpos\(\$content, "\\xFF\\xDA"\)/, "a JPEG must reach an end-of-image marker after its scan");
  assert.match(inspect, /'image\/webp' => strlen\(\$content\) >= 12 && unpack\('V', substr\(\$content, 4, 4\)\)\[1\] \+ 8 <= strlen\(\$content\)/);
  assert.match(uploads, /function path_is_inside_web_root/);
  assert.match(read("db/schema.sql"), /stored_name     CHAR\(64\)     NOT NULL/);
});

test("the migration chain has one authoritative order, and preflight checks the whole schema", () => {
  const manifest = read("db/migrations/MANIFEST").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const files = readdirSync(join(root, "db/migrations")).filter((f) => f.endsWith(".sql")).sort();
  assert.deepEqual([...manifest].sort(), files);
  assert.ok(manifest.indexOf("2026-09-16-customer-care.sql") < manifest.indexOf("2026-09-16-business-intelligence.sql"), "business intelligence depends on customer care");
  assert.notDeepEqual(manifest, files, "filename order is not the dependency order");
  const schema = JSON.parse(read("public/api/data/schema-manifest.json"));
  assert.deepEqual(schema.migration_order, manifest);
  assert.equal(schema.tables.order_route_decisions.columns.availability_confirmed, "2026-09-17-resilience.sql");
  assert.equal(schema.tables.supplier_orders.columns.actual_tax_duty_minor, "2026-09-16-supplier-routing.sql");
  assert.match(read("public/api/crm/preflight.php"), /\$add\('schema_complete'/);
  assert.doesNotMatch(read("db/migrations/2026-09-17-resilience.sql").replace(/^--.*$/gm, ""), /^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/m);
});

test("readiness is truthful: configuration described never shown, no false all-good, honest automation statuses", () => {
  const config = phpFunction(resilience, "resilience_configuration");
  // Statuses and descriptions only: a setting's value is never placed in the output.
  assert.doesNotMatch(config, /'detail' => \$s\(|\. \$s\('(token_secret|crm_api_key|stripe\.secret_key|stripe\.webhook_secret|resend\.api_key|ip_salt)'\)/);
  for (const cls of ["REQUIRED_FOR_LAUNCH", "OPTIONAL", "EXTERNAL_VERIFICATION", "DEFERRED"]) assert.ok(config.includes(`'${cls}'`) || config.includes(`= '${cls}'`), cls);
  assert.match(config, /'malware_scanning', 'Malware scanning of uploads', \$ext, match \(\$scanner\['state'\]\)/);
  const failures = phpFunction(resilience, "resilience_failures");
  assert.match(failures, /'NO_FAILURES_FOUND' : 'ATTENTION_NEEDED'/);
  assert.match(failures, /REQUIRED_CONFIGURATION_MISSING/);
  assert.doesNotMatch(resilience, /ALL_GOOD/);
  const matrix = phpFunction(resilience, "resilience_automation_matrix");
  for (const workflow of ["Payment and order creation", "Customer confirmation", "Creative preparation", "Music generation", "Creative quality check", "Artwork preparation", "Production file generation", "Video production", "Video quality check", "Supplier routing", "Supplier purchase", "Shipment and tracking", "Delivery", "Customer support", "Replacement", "Refund", "Review request", "Business Intelligence", "Founder notifications"]) {
    assert.ok(matrix.includes(`$row('${workflow}'`), workflow);
  }
  assert.match(matrix, /\$row\('Music generation', 'AUTOMATION_READY_CONNECTION_REQUIRED'/);
  for (const w of ["Supplier purchase", "Replacement", "Refund"]) assert.match(matrix, new RegExp(`\\$row\\('${w}', 'FOUNDER_APPROVAL_REQUIRED'`));
  assert.match(matrix, /\$row\('Payment and order creation', \$liveStripe \? 'AUTOMATED_AND_TESTED' : 'AUTOMATION_READY_CONNECTION_REQUIRED'/);
  const actions = phpFunction(resilience, "resilience_founder_actions");
  for (const c of ["ONE_TIME_BEFORE_LAUNCH", "PER_ORDER", "ONLY_WHEN_EXCEPTION", "PERIODIC_BUSINESS_REVIEW"]) assert.ok(actions.includes(c), c);
  const endpoint = read("public/api/crm/system.php");
  assert.match(endpoint, /require_crm_key\(\);/);
  assert.match(endpoint, /header\('Cache-Control: no-store'\);/);
});

test("Command Centre System readiness: plain founder language, one safe retry action, deep links choose a section only", () => {
  assert.ok(CC.VIEWS.includes("system"));
  assert.equal(CC.parseSystemSection("#view=system&section=automation"), "automation");
  assert.equal(CC.parseSystemSection("#view=system&section=RETRY_PAYMENT_CONFIRMATION"), "failures");
  const ui = code(read("src/pages/command-centre/SystemReadiness.tsx"));
  assert.match(ui, /!data \|\| data\.view !== section/);
  assert.equal([...ui.matchAll(/api\("\/api\/crm\/system", \{/g)].length, 1, "the only POST is a retry of recoverable work");
  assert.doesNotMatch(ui, /founder_code|AUTHORISE_|order-action|DECIDE_|RECORD_REFUND/);
  assert.match(ui, /Advanced \/ technical/);
  const jsxText = [...ui.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
  assert.doesNotMatch(jsxText, /\b(QC|EVENT|QUEUE|STATE MACHINE|OUTBOX|WEBHOOK|RETRY)\b/);
  assert.match(read("src/pages/CommandCentre.tsx"), /\{ view: "system", label: "System readiness" \}/);
  assert.deepEqual(Object.keys(CC.AUTOMATION_STATUS_LABELS).sort(), ["AUTOMATED_AND_TESTED", "AUTOMATION_READY_CONNECTION_REQUIRED", "EXTERNAL_VERIFICATION_REQUIRED", "FOUNDER_APPROVAL_REQUIRED", "HUMAN_OPERATED_BY_DESIGN", "NOT_READY"]);
});

test("pop-up cards appear where intended, at their prices, as MCB products", () => {
  const cards = C.POP_UP_CARD;
  assert.equal(cards.variants.length, 18);
  assert.ok(cards.public && cards.active && cards.onlineCheckout);
  assert.equal(cards.category, "CARD");
  assert.ok(C.addOnProducts().some((p) => p.id === "pop-up-card"), "an add-on alongside a song experience");
  assert.equal(C.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "pop-up-card-wedding", quantity: 2 }, { sku: "pop-up-card-paper-flower-pack-8", quantity: 1 }]).totalMinor, 1500 + 2 * 4999 + 12999);
  const extras = read("src/pages/create/StepExtras.tsx");
  // Presented by occasion on both surfaces rather than as a flat wall of 18.
  assert.match(extras, /groupedCards\(\)\.map/);
  assert.match(extras, /DELIVERY_CONFIRMED_FIRST_NOTE/, "MCB confirms card delivery before payment");
  assert.match(read("src/pages/Products.tsx"), /groupedCards\(\)\.map/);
  // Grouping shows every card exactly once and names none that does not exist.
  assert.deepEqual(C.validateCardGroups(), []);
  assert.deepEqual(
    C.groupedCards().flatMap((g) => g.variants.map((v) => v.sku)).sort(),
    cards.variants.map((v) => v.sku).sort()
  );
  assert.match(read("public/api/lib/personalisation.php"), /\$line\['category'\] === 'PLAYER', \$line\['category'\] === 'CARD' => true/);
  const feed = read("public/catalogue.json");
  assert.match(feed, /pop-up-card-wedding/);
  assert.doesNotMatch(feed, /route_id|supplier|partner_group/);
});

test("the £1,000 gramophone needs cost, currency, availability, destination support and evidence; REQUIRED is the default", () => {
  const routing = read("public/api/lib/routing.php");
  const req = phpFunction(routing, "route_authorisation_requirements");
  for (const r of ["CONFIRMED_DELIVERED_COST", "AVAILABILITY_CONFIRMED", "DESTINATION_SUPPORT_CONFIRMED", "SUPPORTING_EVIDENCE"]) assert.ok(req.includes(`'${r}'`), r);
  assert.match(phpFunction(routing, "new_sale_safety_enforcement"), /\?\? 'REQUIRED'/);
  assert.match(phpFunction(routing, "route_freshness_days"), /suppliers_data\(\)\['route_freshness_days'\]/);
  // REQUIRED never touches digital sales: the route check only runs for physical delivery.
  const delivery = read("public/api/lib/delivery.php");
  assert.match(phpFunction(delivery, "quote_delivery"), /if \(\$pricing->fulfilmentType\(\) !== 'PHYSICAL'\) \{\s*return DeliveryQuote::notRequired\(\);/);
});
