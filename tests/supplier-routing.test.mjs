/**
 * MCB™ Supplier Intelligence & Commercial Routing (16 September 2026). Run: npm test
 *
 * Contracts: the 33-SKU physical registry agrees with the catalogue (cards are
 * FOUNDER DATA REQUIRED, never invented); nothing about partners, costs or
 * allowances is committed or reaches a browser; verification is calculated
 * (VERIFIED needs a source and a date; staleness is configurable, never a
 * universal period); routing uses the customer's destination only and
 * explains a recommendation that never authorises; the high-value gramophone
 * needs its delivered cost before authorisation; a route-proven unsupported
 * destination is never sold as supported; the Suppliers view only shows, and
 * its one form records a route choice. Server behaviour is proven against PHP
 * in tests/supplier-routing-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-routing-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as suppliers from "${root}src/data/production/suppliers.ts";
export * as artwork from "${root}src/data/production/artwork.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export * as cc from "${root}src/lib/commandCentre.ts";
`);
const outFile = join(root, "node_modules", `.mcb-routing-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" } };
const { suppliers: S, artwork: A, catalogue: C, cc: CC } = await import(outFile);
const routing = read("public/api/lib/routing.php");
const serverSkus = JSON.parse(read("public/api/data/catalogue.json")).skus;

test("the physical registry: 33 SKUs by family, every catalogue physical SKU mapped, the Founders' 18 cards catalogued", () => {
  assert.equal(S.EXPECTED_PHYSICAL_SKUS, 33);
  assert.deepEqual(S.PHYSICAL_FAMILIES.map((f) => [f.family, f.expected]), [["VINYL", 6], ["FRAME", 5], ["CARD", 18], ["GRAMOPHONE", 3], ["PLAQUE", 1]]);
  const physical = Object.entries(serverSkus).filter(([, s]) => s.fulfilment === "PHYSICAL").map(([k]) => k).sort();
  assert.equal(physical.length, 33);
  assert.deepEqual(S.PHYSICAL_REGISTRY.map((e) => e.sku).sort(), physical);
  for (const e of S.PHYSICAL_REGISTRY) assert.equal(e.priceMinor, serverSkus[e.sku].price_minor, e.sku);
  // The authoritative card catalogue (names and prices), in the Founders' order.
  assert.deepEqual(C.POP_UP_CARD.variants.map((v) => [v.label, v.price.minor]), [
    ["Anniversary — Gold and White", 4999], ["Anniversary — Large", 6999], ["Birthday — Candles / Music", 4999], ["Birthday — Auto-Play Music", 1999],
    ["Wedding", 4999], ["Mother's Day — Flowers", 4999], ["Christmas — Christmas Tree", 4999], ["Birthday — Tropical Bird Cage", 4999],
    ["Halloween — Pumpkin Flowers", 4999], ["Thanksgiving — Flowers", 4999], ["Thank You — Flowers", 4999], ["Congratulations — Flowers", 4999],
    ["Valentine's Day — Love Tree / Hearts", 4999], ["Cruise / Voyage — Cruise Vessel", 4999], ["Multi Flower Pop-Up Card — Pack of 4", 7999],
    ["Single Colour Flower Pop-Up Card — Pack of 4", 7999], ["Four Colour Flower Pop-Up Card — Pack of 4", 7999], ["Paper Flower Pop-Up Cards — Pack of 8", 12999],
  ]);
  assert.ok(C.POP_UP_CARD.variants.every((v) => v.fulfilment === "PHYSICAL") && C.POP_UP_CARD.deliveryClass === "CARD");
  assert.equal(C.POP_UP_CARD.image, null, "no image is invented");
  assert.deepEqual(S.CARD_PRICE_POINTS.map((p) => [p.tier, p.priceMinor]), [["SINGLE", 4999], ["LARGE_ANNIVERSARY", 6999], ["BIRTHDAY_AUTO_PLAY", 1999], ["FOUR_PACK", 7999], ["EIGHT_PACK", 12999]]);
  const json = JSON.parse(read("public/api/data/suppliers.json"));
  assert.equal(json.families.find((f) => f.family === "CARD").mapped, 18);
  assert.equal(json.registry.length, 33);
  assert.equal(json.route_freshness_days, 30);
  assert.equal(json.new_sale_safety, "REQUIRED");
  execFileSync("node", [join(root, "scripts/generate-catalogue-json.mjs"), "--check"], { cwd: root, stdio: "pipe" });
});

test("vinyl: Gatefold 12/£349, 12\" 6/£199, picture discs 4/£149.99, 3/£139.99, Heart 1/£129.99, 7\" 1/£99", () => {
  const vinyl = Object.fromEntries(S.PHYSICAL_REGISTRY.filter((e) => e.family === "VINYL").map((e) => [e.sku, [e.songs, e.priceMinor]]));
  assert.deepEqual(vinyl, {
    "journey-12": [12, 34900], "journey-6": [6, 19900], "keepsake-12-picture-disc": [4, 14999],
    "keepsake-10-picture-disc": [3, 13999], "keepsake-10-heart-picture-disc": [1, 12999], "keepsake-7-picture-disc": [1, 9900],
  });
  for (const [sku, [songs, price]] of Object.entries(vinyl)) {
    assert.equal(serverSkus[sku].song_count, songs, sku);
    assert.equal(C.getVariant(sku).variant.price.minor, price, sku);
  }
  assert.ok(!Object.values(serverSkus).some((s) => [12999].includes(s.price_minor) && s.song_count === 4), "12\" is never £129.99");
  assert.notEqual(serverSkus["keepsake-10-picture-disc"].price_minor, 11999);
  assert.notEqual(serverSkus["keepsake-7-picture-disc"].price_minor, 7999);
  // The Heart's one song is the product's song count, not a manufacturer programme duration.
  assert.equal(S.PHYSICAL_REGISTRY.find((e) => e.sku === "keepsake-10-heart-picture-disc").manufacturing.capacity, true);
});

test("manufacturing specifications are exact, and unknown values stay unknown", () => {
  const t = Object.fromEntries(A.ARTWORK_TEMPLATES.map((x) => [x.id, x]));
  assert.deepEqual(t.SLEEVE_12_FRONT.outputPx, { width: 3756, height: 3827 });
  assert.deepEqual(t.SLEEVE_12_BACK.outputPx, { width: 3756, height: 3756 });
  assert.equal(t.PICTURE_DISC_12.diameterMm, 302);
  assert.equal(t.PICTURE_DISC_12.centreHoleMm, 7.23);
  assert.equal(t.PICTURE_DISC_10.diameterMm, 250);
  assert.equal(t.PICTURE_DISC_10.centreHoleMm, null);
  assert.equal(t.PICTURE_DISC_7.diameterMm, 174);
  assert.equal(t.PICTURE_DISC_7.centreHoleMm, null);
  assert.equal(t.PICTURE_DISC_HEART.status, "TEMPLATE_REQUIRED");
  assert.equal(t.GATEFOLD_12_DOUBLE.status, "TEMPLATE_REQUIRED");
  // The manufacturing list maps what is missing; it never fills a value in.
  assert.doesNotMatch(phpFunction(routing, "manufacturing_data_items"), /centre_hole_mm'\]\s*=|safe_inset_mm'\]\s*=|=> \d+(\.\d+)? ?mm/);
  assert.deepEqual(S.MANUFACTURING_ITEM_KINDS.map((k) => k.kind), ["PROGRAMME_DURATION", "SAFE_AREA", "TRIM", "DISC_PIXEL_CANVAS", "CENTRE_HOLE", "HEART_DIELINE", "GATEFOLD_TEMPLATE", "OTHER_SPECIFICATION"]);
});

test("nothing about partners, costs or allowances is committed or reaches a browser", () => {
  const registry = code(read("src/data/production/suppliers.ts"));
  assert.doesNotMatch(registry, /prodigi|kunaki|cutsy|vinylart|art vinyl|ubuy|walmart|amazon|ritwikas|https?:\/\//i);
  assert.doesNotMatch(registry, /purchase (price|cost)|allowance|contingency|expectedCost|costMinor|_cost_minor/i);
  const committed = execFileSync("git", ["ls-files", "public/api/data"], { cwd: root }).toString();
  assert.ok(!/supplier-(routes|orders)\.json/.test(committed));
  // The customer quote learns only which items MCB confirms, by name.
  const delivery = read("public/api/lib/delivery.php");
  assert.match(phpFunction(delivery, "quote_delivery"), /DeliveryQuote::unavailable\('MCB_CONFIRMS_DELIVERY', array_values\(array_unique\(\$names\)\)\)/);
  assert.doesNotMatch(phpFunction(delivery, "delivery_route_confirmation_skus"), /route_id|supplier'|expected_cost|internal_allowance/);
  // The Suppliers screens and the registry use no internal delivery-state names.
  for (const f of ["src/pages/command-centre/Suppliers.tsx", "src/data/production/suppliers.ts"]) {
    assert.doesNotMatch(code(read(f)), /LISTING_DEPENDENT|MANUAL_REVIEW|DESTINATION_CALCULATED|shipping allowance|supplier cost|purchase price/i, f);
  }
});

test("verification is calculated: VERIFIED needs a source and a past date; issues hold it; staleness is configured, never assumed", () => {
  const v = phpFunction(routing, "route_verification");
  assert.match(v, /if \(\$source === null \|\| \(\$claimed === 'VERIFIED' && \$date === null\)\)/);
  assert.match(v, /\$holding !== \[\][\s\S]*'VERIFICATION_REQUIRED'/);
  assert.match(v, /\$days === null \? 'NOT_CONFIGURED'/);
  assert.match(phpFunction(routing, "route_valid_date"), /<= gmdate\('Y-m-d'/, "a verification cannot be dated in the future");
  assert.match(phpFunction(routing, "route_freshness_days"), /mcb_setting\('fulfilment\.route_freshness_days', null\)/);
  assert.doesNotMatch(phpFunction(routing, "route_freshness_days"), /\?\? \d+|: \d+;/, "no default freshness period");
  assert.deepEqual(S.VERIFICATION_STATES, ["VERIFIED", "PARTIALLY_VERIFIED", "VERIFICATION_REQUIRED", "STALE", "UNSUPPORTED", "SUSPENDED"]);
  assert.ok(S.ROUTE_ISSUES.find((i) => i.code === "GEOGRAPHIC_INCONSISTENCY").holdsVerification);
});

test("routing: the customer's destination only; transparent ranking; a recommendation that explains and never authorises", () => {
  assert.match(phpFunction(routing, "route_options"), /'basis' => 'CUSTOMER_DELIVERY_DESTINATION'/);
  assert.doesNotMatch(routing, /REMOTE_ADDR|client_ip\(|date_default_timezone|geoip|server_country|founders?'\]\['location/);
  const rank = phpFunction(routing, "route_rank_key");
  assert.match(rank, /'VERIFY_AT_SUPPLIER_CHECKOUT' \? 1 : /, "a marketplace 'check at checkout' never outranks a direct partner on destination certainty");
  for (const factor of ["'SUPPORTED' => 0", "'VERIFIED' => 0", "'DIRECT_MANUFACTURER' => 0", "'AVAILABLE' => 0", "total_minor", "strtotime($verified)", "$o['route_id']"]) assert.ok(rank.includes(factor), factor);
  const explain = phpFunction(routing, "route_explanation");
  for (const words of ["Direct manufacturer route", "destination verified", "lower known expected cost", "verified more recently"]) assert.ok(explain.includes(words), words);
  assert.equal(S.RECOMMENDATION_LABEL, "RECOMMENDED FOR REVIEW");
  assert.match(phpFunction(routing, "route_options"), /'authorises_purchase' => false,\s*'places_order' => false/);
  for (const phrase of S.FORBIDDEN_RECOMMENDATION_PHRASES) assert.ok(!routing.toLowerCase().includes(phrase), phrase);
  // Gramophones always go to a person; the plaque's unverified destinations too — never "not available here".
  assert.match(phpFunction(routing, "route_option"), /\$mode === 'MANUAL_AVAILABILITY_CONFIRMED'[\s\S]*'MANUAL_REVIEW'/);
  assert.match(phpFunction(routing, "route_option"), /\$mode === 'MANUAL_WHEN_UNVERIFIED'[\s\S]*'UNVERIFIED_DESTINATION_GOES_TO_A_PERSON'/);
  for (const promise of S.FORBIDDEN_DELIVERY_PROMISES) assert.ok(!routing.toLowerCase().includes(promise), promise);
});

test("the approval flow: route choice ≠ authorisation; the delivered cost gate holds in every mode", () => {
  const ops = read("public/api/lib/operations.php");
  const authorise = ops.slice(ops.indexOf("case 'AUTHORISE_SUPPLIER_PURCHASE':"), ops.indexOf("case 'CONFIRM_FULFILMENT':"));
  assert.match(authorise, /\$routeRequirements\['unmet'\] !== \[\]\) \{\s*throw new OperationsException\('delivered_cost_confirmation_required'/);
  assert.match(authorise, /\$routeRequirements\['routes_not_reviewed'\] !== \[\] && \$requiredMode/);
  assert.ok(authorise.indexOf("delivered_cost_confirmation_required") < authorise.indexOf("supplier_purchase_authorised_by = :founder"));
  const decision = phpFunction(routing, "record_route_decision");
  assert.match(decision, /deviation_reason_required/);
  assert.match(decision, /'route_unsupported'/);
  assert.doesNotMatch(decision, /supplier_purchase_authorised|INSERT INTO supplier_orders/);
  assert.ok(S.PHYSICAL_REGISTRY.find((e) => e.sku === "antique-brass-gramophone").deliveredCostConfirmationRequired);
  // New sales: an unsupported destination always goes to MCB; other flags only when the Founders require it.
  // A customer is stopped ONLY by a known impossibility. Incomplete verification
  // no longer blocks the sale — it blocks the WORK, on the paid order
  // (fulfilment_check_route_verification). See docs/CODE-CLOSURE-20260916.md.
  assert.match(phpFunction(routing, "new_sale_items_needing_confirmation"), /\['known_unfulfillable'\] !== \[\]/);
  assert.doesNotMatch(phpFunction(routing, "new_sale_items_needing_confirmation"), /verification_incomplete/);
  assert.match(phpFunction(routing, "new_sale_items_needing_verification"), /\['verification_incomplete'\] !== \[\]/);
  assert.match(phpFunction(routing, "new_sale_safety_enforcement"), /'ADVISORY'/);
  // Card alternatives are the only substitution and carry the full record.
  const record = phpFunction(read("public/api/lib/fulfilment-controller.php"), "record_supplier_order");
  assert.match(record, /customer_impact_required[\s\S]*INSERT IGNORE INTO card_alternatives/);
  assert.deepEqual(JSON.parse(read("public/api/data/fulfilment.json")).authorised_alternative_delivery_classes, ["CARD"]);
});

test("the migration adds route decisions, card alternatives and tax/duty, and the schema matches", () => {
  const migration = read("db/migrations/2026-09-16-supplier-routing.sql");
  const schema = read("db/schema.sql");
  for (const table of ["order_route_decisions", "card_alternatives"]) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(migration, /ADD COLUMN IF NOT EXISTS actual_tax_duty_minor INT NULL AFTER actual_shipping_cost_minor/);
  assert.match(schema, /actual_shipping_cost_minor\s+INT NULL,\s*actual_tax_duty_minor INT NULL,/);
  assert.doesNotMatch(migration.replace(/^--.*$/gm, ""), /^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/m);
});

test("the Suppliers view only shows; its one form records a route choice; deep links choose a section only", () => {
  assert.equal(CC.parseSupplierSection("#view=suppliers&section=orders"), "orders");
  assert.equal(CC.parseSupplierSection("#view=suppliers&section=authorise&founder_code=x"), "overview");
  assert.ok(CC.VIEWS.includes("suppliers"));
  assert.deepEqual(CC.SUPPLIER_SECTIONS.map(([s]) => CC.supplierView(s)), ["overview", "orders", "lookup", "overview", "scorecards"]);
  const ui = code(read("src/pages/command-centre/Suppliers.tsx"));
  assert.match(ui, /!data \|\| data\.section !== section/, "a section never renders the previous section's data");
  const posts = [...ui.matchAll(/api\("\/api\/crm\/suppliers", body\)/g)];
  assert.equal(posts.length, 1);
  assert.match(ui, /action: "RECORD_ROUTE_DECISION"/);
  assert.doesNotMatch(ui, /AUTHORISE_SUPPLIER_PURCHASE|founder_code|RECORD_SUPPLIER_ORDER|order-action|refund/i);
  assert.match(ui, /This does not authorise any purchase/);
  const jsxText = [...ui.matchAll(/>([^<>{}]+)</g)].map((m) => m[1]).join(" ");
  assert.doesNotMatch(jsxText, /\b(QC|EVENT|QUEUE|STATE MACHINE|OUTBOX|WEBHOOK|RETRY)\b/);
  assert.match(read("src/pages/CommandCentre.tsx"), /\{ view: "suppliers", label: "Suppliers" \}/);
  // The Business tab receives route readiness and evidence, with no ranking or switching.
  const business = read("public/api/lib/business.php");
  assert.match(business, /'suppliers' => \['supplier_routes' => biz_supplier_routes\(\$orders\), 'route_scorecards' => route_scorecards\(\$pdo\)/);
  assert.match(phpFunction(routing, "route_scorecards"), /'combined_score' => null/);
});
