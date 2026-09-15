/**
 * MCB™ Business & Profit Intelligence (16 September 2026). Run: npm test
 *
 * Contracts: Moment £15 and Moment + video £64; gross contribution is defined
 * and never called profit; each direct cost has one home (no double counting)
 * and unknown is never zero; TEST and foreign-currency orders never enter GBP
 * totals; Europe/London and actual-first fees are founder decisions, thresholds are never invented; the
 * layer is deterministic (no model, no outbound call) and changes nothing;
 * recommendations only ask for a review; exports are formula-safe and carry no
 * private content; the Business screens are private and analytics-free.
 * Server behaviour is proven against PHP in tests/business-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-biz-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as business from "${root}src/data/production/business.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export * as cc from "${root}src/lib/commandCentre.ts";
`);
const outFile = join(root, "node_modules", `.mcb-biz-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" } };
const { business: B, catalogue: C, cc: CC } = await import(outFile);
const lib = read("public/api/lib/business.php");
const endpoint = read("public/api/crm/business.php");
const ui = read("src/pages/command-centre/Business.tsx");
const json = JSON.parse(read("public/api/data/business.json"));

test("the decided prices: Moment £15, Memory Music Video £49, together £64", () => {
  assert.equal(C.getVariant("moment").variant.price.minor, 1500);
  assert.equal(C.getVariant("memory-music-video").variant.price.minor, 4900);
  assert.equal(C.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "memory-music-video", quantity: 1 }]).totalMinor, 6400);
  assert.equal(B.VIDEO_LAUNCH_PRICE_MINOR, 4900, "the £49 launch price is authoritative");
  assert.equal(B.VIDEO_PRICE_TEST, "NOT_AUTHORISED", "no £59/£69 test is authorised");
  assert.equal(B.VIDEO_PRICE_POINTS_UNDER_REVIEW_MINOR, undefined);
});

test("financial language: gross contribution is defined and never called profit", () => {
  const terms = B.FINANCIAL_DEFINITIONS.map((d) => d.term);
  assert.deepEqual(terms, ["Revenue", "Net paid revenue", "Expected fulfilment cost", "Actual fulfilment cost", "Gross contribution"]);
  assert.match(B.FINANCIAL_DEFINITIONS.find((d) => d.term === "Gross contribution").meaning, /It is not net profit, profit after tax, EBITDA or accounting profit/);
  for (const text of [code(ui), code(lib)]) {
    assert.doesNotMatch(text.replace(/not net profit[^'"`]*/gi, ""), /\bnet profit\b|\bEBITDA\b|accounting profit|profit after tax/i);
  }
  assert.match(B.FINANCIAL_DEFINITIONS.find((d) => d.term === "Revenue").meaning, /TEST payments are rehearsals and never revenue/);
});

test("the cost model: ten categories, each with one home; hand entries only where no other record holds it", () => {
  assert.deepEqual(B.COST_CATEGORIES.map((c) => c.category), [
    "SUPPLIER_PRODUCT_COST", "SUPPLIER_SHIPPING", "SUPPLIER_TAX_DUTY", "SHIPPING_CONTINGENCY", "MCB_FULFILMENT_HANDLING_ALLOWANCE", "PAYMENT_PROCESSING_FEE",
    "VIDEO_PRODUCTION_COST", "REPLACEMENT_COST", "REFUND_VALUE", "OTHER_DIRECT_COST",
  ]);
  const entry = Object.fromEntries(B.COST_CATEGORIES.map((c) => [c.category, [...c.entry]]));
  assert.deepEqual(entry.SUPPLIER_PRODUCT_COST, []);
  assert.deepEqual(entry.REFUND_VALUE, []);
  assert.deepEqual(entry.SUPPLIER_TAX_DUTY, [], "tax or duty actually paid lives on the supplier order");
  assert.equal(B.COST_CATEGORIES.find((c) => c.category === "SUPPLIER_TAX_DUTY").expected, null, "tax or duty is never assumed");
  assert.deepEqual(entry.VIDEO_PRODUCTION_COST, ["EXPECTED"], "actual video cost lives on the video job");
  assert.equal(B.COST_CATEGORIES.find((c) => c.category === "SHIPPING_CONTINGENCY").actual, null, "an allowance is never an actual cost");
  const migration = read("db/migrations/2026-09-16-business-intelligence.sql");
  assert.match(migration, /category\s+ENUM\('PAYMENT_PROCESSING_FEE','VIDEO_PRODUCTION_COST','REPLACEMENT_COST','OTHER_DIRECT_COST'\)/);
  assert.match(phpFunction(lib, "biz_record_cost"), /recorded_elsewhere/);
  assert.match(B.INTERNAL_ALLOWANCE_NOTE, /not customer delivery charges, verified supplier quotes or universal shipping rates/);
});

test("unknown is never zero; contribution only from complete orders; replacement and video costs are not assumed", () => {
  const costs = phpFunction(lib, "biz_order_costs");
  assert.match(costs, /\$missing\[\] = 'PAYMENT_PROCESSING_FEE'/);
  assert.match(costs, /\$missing\[\] = 'VIDEO_PRODUCTION_COST'/);
  assert.match(costs, /\$missing\[\] = 'REPLACEMENT_COST'/);
  assert.match(costs, /\$total = \$complete \? array_sum\(\$costs\) : null;/);
  assert.match(costs, /\$contribution = \$complete \? \$net - \$total : null;/);
  // The only defaults to zero are the optional route allowances, which are part of a calculated expected total.
  const zeroDefaults = [...code(costs).matchAll(/\['([a-z_]+)'\] \?\? 0\)/g)].map((m) => m[1]);
  assert.deepEqual(zeroDefaults.sort(), ["contingency_minor", "handling_minor"]);
  assert.match(phpFunction(lib, "biz_contribution"), /'contribution_minor' => \$complete === \[\] \? null : \$contribution/);
  assert.match(phpFunction(lib, "biz_replacements"), /Authorisation is not spend until the actual cost is recorded/);
  assert.match(ui, /— Awaiting data/);
});

test("TEST and foreign-currency orders never enter GBP totals; nothing is converted", () => {
  assert.match(phpFunction(lib, "biz_live_gbp"), /\$o\['live'\] && \$o\['currency'\] === 'GBP'/);
  assert.doesNotMatch(code(lib), /exchange_rate|fx_rate|convert_currency|fx\.json|\/fx\/|fx_convert/i);
  assert.match(phpFunction(lib, "biz_revenue"), /'other_currencies' => array_values\(\$other\)/);
});

test("founder decisions: Europe/London, actual-first fees, no invented thresholds or fee model", () => {
  assert.match(phpFunction(lib, "biz_threshold"), /return is_int\(\$v\) \|\| is_float\(\$v\) \? \$v : null;/);
  assert.deepEqual(B.COMMERCIAL_ALERTS.map((a) => a.type), ["NEGATIVE_CONTRIBUTION", "LOW_CONTRIBUTION", "COST_VARIANCE_HIGH", "REFUND_RATE_ELEVATED", "REPLACEMENT_RATE_ELEVATED", "SUPPLIER_EXCEPTION_ELEVATED", "VIDEO_CAPACITY_LOW", "DATA_COMPLETENESS_LOW"]);
  assert.match(phpFunction(lib, "biz_alerts"), /'NOT_CONFIGURED'/);
  assert.equal(B.BUSINESS_TIMEZONE, "Europe/London");
  assert.equal(B.PAYMENT_FEE_POLICY, "ACTUAL_FIRST");
  assert.equal(B.COMMERCIAL_THRESHOLDS_POLICY, "NOT_CONFIGURED_BY_FOUNDER_DECISION");
  assert.equal(JSON.parse(read("public/api/data/business.json")).founder_decisions.business_timezone, "Europe/London");
  // The timezone is the business's, never the server's or a founder's location.
  assert.doesNotMatch(phpFunction(lib, "biz_timezone"), /date_default_timezone_get|'UTC'/);
  assert.ok(!lib.includes("function biz_payment_fee_model"), "there is no fee model");
  assert.doesNotMatch(lib, /percent_basis_points|payment_fee_model/);
  // Actual-first: the recorded actual fee is used on both bases; otherwise UNKNOWN (never £0).
  assert.match(phpFunction(lib, "biz_order_costs"), /\$fees = \$entries\('PAYMENT_PROCESSING_FEE', 'ACTUAL'\);\s*if \(\$fees === \[\] && \$basis === 'EXPECTED'\)[\s\S]*\$missing\[\] = 'PAYMENT_PROCESSING_FEE';/);
  assert.match(read("public/api/config.example.php"), /\/\/ 'business' => \[/, "business settings are commented out: nothing is configured by default");
});

test("deterministic and harmless: no model, outbound call, price change, cancellation or supplier switch", () => {
  for (const file of [lib, endpoint]) {
    assert.doesNotMatch(code(file), /curl_init|file_get_contents\(\s*['"]https?:|openai|anthropic|claude|gpt|stripe_request|\/v1\/refunds|api\.mozart/i);
    assert.doesNotMatch(code(file), /UPDATE orders SET|product_sales_suspensions|INSERT INTO supplier_orders|UPDATE order_items|UPDATE video_capacity/);
  }
  assert.deepEqual([...B.RECOMMENDATION_KINDS], ["INSIGHT", "COMPLETE_DATA", "REVIEW_PRICING", "REVIEW_PRODUCT_ECONOMICS", "REVIEW_SUPPLIER_ROUTE"]);
  for (const word of B.FORBIDDEN_RECOMMENDATION_WORDS) {
    assert.ok(!code(lib).toLowerCase().includes(word), word);
    assert.ok(!code(ui).toLowerCase().includes(word), word);
  }
});

test("sample sizes are shown; small samples are EARLY DATA, never a winner", () => {
  assert.equal(B.EARLY_DATA_BELOW_ORDERS, 30);
  assert.match(phpFunction(lib, "biz_sample"), /'EARLY DATA'/);
  assert.match(ui, /Early data · \$\{item.sample_size\}/);
});

test("privacy: structured occasions only, country codes only, no private content selected or exported", () => {
  const dataset = phpFunction(lib, "biz_dataset");
  assert.doesNotMatch(code(dataset), /\bstory\b|brief_story|description|body|email|address_line|postal_code|recipient_name|lyric/i);
  assert.match(dataset, /SELECT DISTINCT order_id, occasion FROM order_memories/);
  assert.match(phpFunction(lib, "biz_cruise"), /in_array\('cruise', \$o\['occasions'\], true\) \|\| \$o\['cruise_companions'\]/);
  assert.deepEqual([...B.EXPORT_DATASETS], ["products", "supplier_routes", "refunds", "alerts", "root_causes", "geography", "data_quality"]);
  const exports = phpFunction(lib, "biz_export_rows");
  assert.doesNotMatch(exports, /reason'|email|name'\s*=>\s*\$o|story|message/);
  assert.match(phpFunction(lib, "biz_csv_cell"), /preg_match\('\/\^\[=\+\\-@\\t\\r\]\/', \$s\) === 1/);
  assert.match(endpoint, /biz_audit\(\$pdo, \$staff, 'EXPORT', \$dataset, count\(\$rows\)\)/);
});

test("the funnel counts only what MCB records; analytics gaps are named, never estimated", () => {
  assert.deepEqual(B.FUNNEL_STAGES.filter((s) => s.source === "ANALYTICS_ONLY").map((s) => s.stage), ["PRODUCT_VIEWED", "PERSONALISATION_STARTED"]);
  assert.match(phpFunction(lib, "biz_funnel"), /'count' => null, 'coverage' => 'ANALYTICS_COVERAGE_INCOMPLETE'/);
  assert.match(ui, /Analytics coverage incomplete/);
});

test("private and analytics-free Business screens; staff-only API; aggregated queries", () => {
  assert.match(endpoint, /require_crm_key\(\);[\s\S]*Cache-Control: no-store[\s\S]*X-Robots-Tag: noindex, nofollow/);
  assert.doesNotMatch(code(ui), /trackFunnel|trackEvent|gtag|dataLayer|localStorage|sessionStorage/);
  assert.ok(CC.VIEWS.includes("business"));
  assert.equal(CC.parseBusinessSection("#view=business&section=suppliers"), "suppliers");
  assert.equal(CC.parseBusinessSection("#view=business&section=<script>"), "overview");
  assert.equal(CC.businessLink("data"), "#view=business&section=data");
  assert.equal(CC.rateText(0.1834), "18.3%");
  assert.equal(CC.rateText(null), "— Awaiting data");
  // A fixed number of set queries: none inside the per-order cost loop.
  const dataset = phpFunction(lib, "biz_dataset");
  const loop = dataset.slice(dataset.indexOf("foreach ($orders as &$o)"));
  assert.doesNotMatch(loop, /->query\(|->prepare\(/);
});

test("a Business section never renders another section's data (found in the browser rehearsal)", () => {
  assert.match(ui, /\{!data \|\| data\.section !== section \? <p role="status">Loading…<\/p> :/);
});
