/**
 * Automation Foundation + Production Artwork Specification (15 September 2026).
 *
 * The data and client contracts: artwork templates exactly as the Founders
 * supplied them (nothing invented), the event model, founder notifications,
 * financial authority, deep links that open and never approve, and nothing
 * production- or supplier-facing in anything public. Run: npm test
 *
 * The server behaviour (artwork planning and technical QC, the outbox and its
 * worker contract, founder authorisation, completion, sales suspension) is
 * proven against PHP in tests/automation-acceptance.sh.
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
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#|\*).*$/gm, "");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-af-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(
  entryPath,
  `export * as artwork from "${root}src/data/production/artwork.ts";
export * as ops from "${root}src/data/operations.ts";
export * as catalogue from "${root}src/data/catalogue/index.ts";
export { parseOperationsLink } from "${root}src/lib/operationsLink.ts";
export { CURRENTLY_UNAVAILABLE } from "${root}src/lib/salesAvailability.ts";
`
);
const outFile = join(root, "node_modules", `.mcb-af-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
const M = await import(outFile);
const T = Object.fromEntries(M.artwork.ARTWORK_TEMPLATES.map((t) => [t.id, t]));
const generated = JSON.parse(read("public/api/data/artwork.json"));

test("12-inch sleeve: FRONT 3756 × 3827 px with 3 mm (~35 px) bleed and top/bottom spine allowance; BACK 3756 × 3756 px with 3 mm bleed", () => {
  const front = T.SLEEVE_12_FRONT;
  assert.deepEqual(front.outputPx, { width: 3756, height: 3827 });
  assert.deepEqual(front.bleed, { min: { mm: 3, px: 35 }, max: { mm: 3, px: 35 } });
  assert.deepEqual(front.spineAllowance, { top: { mm: 3, px: 35 }, bottom: { mm: 3, px: 35 } });
  assert.equal(front.orientation, "PORTRAIT");
  const back = T.SLEEVE_12_BACK;
  assert.deepEqual(back.outputPx, { width: 3756, height: 3756 });
  assert.deepEqual(back.bleed, { min: { mm: 3, px: 35 }, max: { mm: 3, px: 35 } });
  assert.equal(back.spineAllowance, null);
  for (const t of [front, back]) {
    assert.equal(t.status, "ACTIVE");
    assert.equal(t.version, 1);
    assert.ok(t.qc.includes("EXACT_DIMENSIONS") && t.qc.includes("ORDER_ASSOCIATION") && t.qc.includes("TEMPLATE_VERSION"));
    assert.deepEqual(t.appliesToSkus, ["journey-6"]);
  }
});

test("every template carries the canonical fields: id/version, output, bleed, safe/trim, spine, centre hole, exclusion, SKUs, orientation, status, QC", () => {
  const fields = ["id", "version", "kind", "label", "status", "orientation", "outputPx", "diameterMm", "bleed", "spineAllowance", "centreHoleMm", "centreCreativeExclusion", "safeInsetMm", "trimPx", "appliesToSkus", "supplierRoute", "qc", "missing", "notes"];
  for (const t of M.artwork.ARTWORK_TEMPLATES) {
    for (const f of fields) assert.ok(f in t, `${t.id}.${f}`);
    assert.equal(t.supplierRoute, null, `${t.id} names no supplier`);
  }
});

test("picture discs: 12-inch 302 mm with a 7.23 mm hole, 10-inch 250 mm, 7-inch 174 mm, 2–3 mm bleed; pixel canvas not invented", () => {
  assert.equal(T.PICTURE_DISC_12.diameterMm, 302);
  assert.equal(T.PICTURE_DISC_12.centreHoleMm, 7.23);
  assert.equal(T.PICTURE_DISC_10.diameterMm, 250);
  assert.equal(T.PICTURE_DISC_7.diameterMm, 174);
  for (const id of ["PICTURE_DISC_12", "PICTURE_DISC_10", "PICTURE_DISC_7"]) {
    assert.deepEqual([T[id].bleed.min.mm, T[id].bleed.max.mm], [2, 3], id);
    assert.equal(T[id].outputPx, null, `${id}: supplier resolution was not supplied`);
    assert.equal(T[id].status, "GEOMETRY_ONLY");
    assert.ok(T[id].qc.includes("SQUARE_ASPECT"));
    assert.ok(T[id].notes.some((n) => /safe zone/i.test(n)) && T[id].notes.some((n) => /outer trim edge/i.test(n)));
  }
  assert.equal(T.PICTURE_DISC_10.centreHoleMm, null, "10-inch hole not supplied, so not assumed");
  assert.equal(T.PICTURE_DISC_7.centreHoleMm, null, "7-inch hole not supplied, so not assumed");
});

test("the ~1.5-inch centre creative exclusion zone is not the physical hole", () => {
  const disc = T.PICTURE_DISC_12;
  assert.deepEqual(disc.centreCreativeExclusion, { diameterInches: 1.5, diameterMm: 38.1 });
  assert.notEqual(disc.centreCreativeExclusion.diameterMm, disc.centreHoleMm);
  assert.ok(disc.notes.some((n) => /not the physical centre hole/.test(n)));
});

test("Heart picture disc: MANUAL / TEMPLATE REQUIRED — no dieline, size, diameter or bleed is invented", () => {
  const heart = T.PICTURE_DISC_HEART;
  assert.equal(heart.status, "TEMPLATE_REQUIRED");
  assert.equal(heart.outputPx, null);
  assert.equal(heart.bleed, null);
  assert.equal(heart.diameterMm, null);
  assert.ok(heart.missing.some((m) => /dieline/.test(m)));
  assert.deepEqual(M.artwork.ARTWORK_COMPONENTS_BY_SKU["keepsake-10-heart-picture-disc"], ["PICTURE_DISC_HEART"]);
  assert.equal(T.GATEFOLD_12_DOUBLE.status, "TEMPLATE_REQUIRED", "the double gatefold is not assumed from the single sleeve");
});

test("template selection covers every photo-artwork SKU, and the generated server file matches the source", () => {
  const photoSkus = M.catalogue.PRODUCTS.filter((p) => M.catalogue.PHOTO_ARTWORK_PRODUCT_IDS.has(p.id)).flatMap((p) => p.variants.map((v) => v.sku));
  for (const sku of photoSkus) assert.ok(M.artwork.ARTWORK_COMPONENTS_BY_SKU[sku]?.length, sku);
  assert.deepEqual(M.artwork.ARTWORK_COMPONENTS_BY_SKU["journey-6"], ["SLEEVE_12_FRONT", "SLEEVE_12_BACK"]);
  assert.deepEqual(M.artwork.ARTWORK_COMPONENTS_BY_SKU["keepsake-12-picture-disc"], ["PICTURE_DISC_12"]);
  assert.deepEqual(generated.components_by_sku, M.artwork.ARTWORK_COMPONENTS_BY_SKU);
  assert.equal(generated.templates.find((t) => t.id === "SLEEVE_12_FRONT").spine_allowance.bottom.px, 35);
});

test("the SOURCE photograph rule stays square ≥ 2500 px; output sizes are separate; the £15 service stays server-priced once per order", () => {
  assert.equal(M.catalogue.ARTWORK_PHOTO_MIN_PX, 2500);
  assert.equal(generated.source_min_px, 2500);
  assert.equal(M.artwork.PREPARATION_STANDARD_MAX_UNREADY_PHOTOS, 1);
  const service = M.catalogue.getProduct("artwork-preparation");
  assert.equal(service.variants[0].price.minor, 1500);
  const php = code(read("public/api/lib/uploads.php"));
  assert.match(php, /artwork_photo_min_px/);
  assert.match(code(read("public/api/lib/catalogue.php")), /artwork_preparation_ineligible/);
  // Multiple unready photographs are an internal review, never an automatic charge.
  const artworkPhp = code(read("public/api/lib/artwork.php"));
  assert.match(artworkPhp, /MULTIPLE_PREPARATION/);
  assert.doesNotMatch(artworkPhp, /price_minor|stripe|charge/i);
});

test("the Founders' event model maps each name to exactly one recorded automation event, reusing existing names", () => {
  const model = M.ops.EVENT_MODEL;
  const names = [
    "ORDER.PAID", "ORDER.READY_FOR_PROCESSING", "CREATIVE.PENDING", "CREATIVE.IN_PROGRESS", "CREATIVE.READY",
    "ARTWORK.INPUT_VALIDATED", "ARTWORK.PREPARATION_REQUIRED", "ARTWORK.TEMPLATE_REQUIRED", "ARTWORK.READY",
    "QC.REQUIRED", "QC.PASSED", "QC.FAILED", "FULFILMENT.READY", "FULFILMENT.APPROVAL_REQUIRED", "FULFILMENT.AUTHORISED",
    "SUPPLIER.ORDER_REQUIRED", "SUPPLIER.ORDER_RECORDED", "SHIPMENT.DISPATCHED", "SHIPMENT.DELIVERED",
    "REVEAL.READY", "REVEAL.SENT", "FOLLOW_UP.DUE", "FOLLOW_UP.SENT", "REVIEW.REQUESTED",
  ];
  for (const name of names) assert.ok(M.ops.AUTOMATION_EVENTS.includes(model[name]), name);
  assert.equal(model["QC.PASSED"], "QUALITY_CHECK.PASSED", "existing name reused");
  assert.equal(model["REVEAL.SENT"], "REVEALED");
  assert.equal(model["SUPPLIER.ORDER_RECORDED"], "FULFILMENT.CONFIRMED");
  assert.ok(!M.ops.AUTOMATION_EVENTS.some((e) => /REFUND|CHARGE|PURCHASE|PAYOUT/.test(e)));
});

test("founder notifications: the exception types (incl. creative and audio capacity) plus suspension; safe payload allow-list; no provider call or credential", () => {
  assert.deepEqual(M.ops.FOUNDER_NOTIFICATIONS.map((n) => n.type).sort(), [
    "ARTWORK_EXCEPTION", "AUDIO_CAPACITY_EXCEPTION", "COMMERCIAL_SAFETY_EXCEPTION", "CREATIVE_EXCEPTION", "CUSTOMER_SUPPORT_EXCEPTION", "DELIVERY_EXCEPTION", "FULFILMENT_APPROVAL_REQUIRED", "FULFILMENT_EXCEPTION",
    "MANUFACTURING_DATA_REQUIRED", "NEW_ORDER_READY_FOR_PROCESSING", "PRODUCT_SALES_SUSPENDED", "QC_EXCEPTION", "VIDEO_CAPACITY_ALERT", "VIDEO_EXCEPTION",
  ]);
  const outbox = read("public/api/lib/founder-notifications.php");
  const keys = outbox.match(/const MCB_NOTIFICATION_PAYLOAD_KEYS = \[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map((k) => k.slice(1, -1));
  assert.deepEqual(keys.sort(), ["action_url", "amount", "input", "manufacturing_package", "notification", "payment", "product", "qc", "reason", "reference", "required_action", "state", "supplier_order", "test_payment", "title"]);
  for (const forbidden of ["story", "email", "phone", "address", "photo", "name", "card", "secret", "token", "supplier_cost"]) {
    assert.ok(!keys.includes(forbidden), forbidden);
  }
  assert.match(outbox, /INSERT IGNORE INTO founder_notifications/);
  const server = walk("public/api").filter((p) => p.endsWith(".php")).map((p) => code(read(p))).join("\n");
  assert.doesNotMatch(server, /api\.telegram\.org|sendMessage\?chat_id|bot[0-9]{6,}:|tasknotify\.[a-z]/i, "no Telegram/TaskNotify call");
  assert.doesNotMatch(read("public/api/config.example.php"), /'bot_token'|'chat_id'|telegram_token/i, "provider credentials belong to the worker, not MCB config");
});

test("financial authority: Bella OR Lewis explicitly, with their own hashed code; automation and the link never authorise", () => {
  assert.deepEqual([...M.ops.FINANCIAL_AUTHORISERS], ["BELLA", "LEWIS"]);
  const ops = code(read("public/api/lib/operations.php"));
  assert.match(ops, /'AUTHORISE_SUPPLIER_PURCHASE'/);
  assert.match(ops, /password_verify\(/);
  assert.match(ops, /founder_authorisation_required/);
  assert.match(ops, /FULFILMENT\.AUTHORISATION_REFUSED/);
  assert.doesNotMatch(ops, /curl_init/, "no supplier or payment call from operations");
  assert.match(read("public/api/config.example.php"), /'authorisation_hash' => ''/);
  // Deep links open an order; they never carry a credential or approve.
  assert.deepEqual(M.parseOperationsLink("#order=MCB-2026-000123&action=AUTHORISE_SUPPLIER_PURCHASE"), { reference: "MCB-2026-000123", action: "AUTHORISE_SUPPLIER_PURCHASE" });
  assert.deepEqual(M.parseOperationsLink("#order=41&key=test_crm_key&code=abc"), { reference: null, action: null });
  assert.deepEqual(M.parseOperationsLink("#order=MCB-2026-000123&action=authorise();"), { reference: "MCB-2026-000123", action: null });
  const page = read("src/pages/Operations.tsx");
  assert.match(page, /parseOperationsLink\(hash\)/);
  assert.doesNotMatch(page.slice(page.indexOf("A notification link opens its order once")), /founder_code:\s*link|AUTHORISE_SUPPLIER_PURCHASE", staff[^}]*founder_code/, "the link never submits an authorisation");
  assert.match(page, /type: "password"/);
});

test("completion is independent of follow-up and review; no customer approval is reintroduced", () => {
  const ops = code(read("public/api/lib/operations.php"));
  assert.match(ops, /function complete_order/);
  assert.match(ops.slice(ops.indexOf("function reveal_creation")), /complete_order\(\$pdo, \$row, 'REVEALED'/);
  assert.match(ops.slice(ops.indexOf("case 'MARK_DELIVERED'")), /complete_order\(\$pdo, \$row, 'DELIVERED'/);
  assert.match(code(read("public/api/lib/lifecycle-messages.php")), /FOLLOW_UP\.SENT/);
  assert.match(code(read("public/api/lib/lifecycle.php")), /REVIEW\.REQUESTED/);
  const stages = Object.values(M.ops.CUSTOMER_STAGES).flat().map((s) => `${s.title} ${s.description}`).join(" ");
  assert.doesNotMatch(stages, /approv|authoris|supplier|founder/i);
  assert.equal(M.ops.LIFECYCLE_TEMPLATES.find((t) => t.type === "FOLLOW_UP").autoSend, false);
  assert.equal(M.ops.LIFECYCLE_TEMPLATES.find((t) => t.type === "REVIEW_REQUEST").autoSend, false);
});

test("nothing public carries production, template, founder or supplier data; the artwork spec is server-only", () => {
  const feed = read("public/catalogue.json");
  assert.doesNotMatch(feed, /3756|3827|SLEEVE_12|PICTURE_DISC_|dieline|bleed|7\.23|founder|supplier_route|AUTHORISE_SUPPLIER|purchase_authorised/i);
  const pages = walk("src").filter((p) => !p.startsWith("src/data/production/"));
  for (const p of pages) assert.doesNotMatch(read(p), /data\/production\/artwork/, `${p} must not import the artwork specification`);
  assert.match(read("public/api/.htaccess"), /RedirectMatch 403 \^\/api\/data\//);
  assert.equal(M.CURRENTLY_UNAVAILABLE, "Currently unavailable");
  const availability = code(read("public/api/product-availability.php"));
  assert.doesNotMatch(availability, /reason|suspended_by|staff/);
});

test("no secrets: no founder code, bot token or live key in source; test codes live only in tests", () => {
  const files = [...walk("src"), ...walk("public/api"), ...walk("scripts"), ...walk("docs")].filter((p) => /\.(ts|tsx|php|mjs|md|json)$/.test(p) && !/^public\/api\/(_test-|config\.php$)/.test(p));
  for (const p of files) {
    const text = read(p);
    assert.doesNotMatch(text, /test-founder-(bella|lewis)-not-real|\$2y\$10\$[A-Za-z0-9./]{53}/, `${p}: founder code or hash`);
    assert.doesNotMatch(text, /sk_live_[A-Za-z0-9]{8,}|[0-9]{8,10}:AA[A-Za-z0-9_-]{30,}/, `${p}: live key or bot token`);
  }
});
