/**
 * MCB Production File Factory (15 September 2026). Run: npm test
 *
 * Contracts: Creative Art Master and Print Production Master are separate;
 * templates stay exactly as supplied (missing geometry and safe zones stay
 * missing); the artwork provider is DEFERRED; file roles have their own
 * limits; MP3 format support is separate from duration inspection; supplier
 * data and costs never reach anything public; no spending path.
 * Server behaviour is proven against PHP in tests/production-acceptance.sh.
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

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-pf-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as artwork from "${root}src/data/production/artwork.ts";
export * as creative from "${root}src/data/production/creative.ts";
export * as ops from "${root}src/data/operations.ts";
`);
const outFile = join(root, "node_modules", `.mcb-pf-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
const M = await import(outFile);
const A = M.artwork;
const T = Object.fromEntries(A.ARTWORK_TEMPLATES.map((t) => [t.id, t]));
const schema = read("db/schema.sql");

test("Creative Art Master and Print Production Master are separate records with lineage and template versions", () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS artwork_art_masters/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS print_production_masters/);
  const art = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS artwork_art_masters"), schema.indexOf(") ENGINE", schema.indexOf("CREATE TABLE IF NOT EXISTS artwork_art_masters")));
  assert.doesNotMatch(art, /template_id|template_version/, "the art master does not depend on a template");
  const print = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS print_production_masters"), schema.indexOf(") ENGINE", schema.indexOf("CREATE TABLE IF NOT EXISTS print_production_masters")));
  for (const col of ["art_master_id", "render_job_id", "template_id", "template_version", "version", "sha256", "file_qc", "safe_zone_status", "is_current"]) assert.match(print, new RegExp(`\\b${col}\\b`), col);
  assert.match(schema, /UNIQUE KEY uq_render_job \(art_master_id, template_id, template_version\)/);
  assert.match(schema, /UNIQUE KEY uq_art_master_version \(job_id, version\)/);
  assert.match(schema, /UNIQUE KEY uq_print_master_version \(artwork_id, version\)/);
  const endpoint = code(read("public/api/crm/artwork.php"));
  assert.doesNotMatch(endpoint, /unlink/, "a new print master never deletes the previous file");
});

test("templates stay exactly as supplied; missing geometry and safe zones stay missing", () => {
  assert.deepEqual(T.SLEEVE_12_FRONT.outputPx, { width: 3756, height: 3827 });
  assert.deepEqual(T.SLEEVE_12_BACK.outputPx, { width: 3756, height: 3756 });
  assert.equal(T.SLEEVE_12_FRONT.spineAllowance.top.px, 35);
  assert.equal(T.PICTURE_DISC_12.diameterMm, 302);
  assert.equal(T.PICTURE_DISC_12.centreHoleMm, 7.23);
  assert.equal(T.PICTURE_DISC_12.centreCreativeExclusion.diameterMm, 38.1);
  assert.equal(T.PICTURE_DISC_10.centreHoleMm, null);
  assert.equal(T.PICTURE_DISC_7.centreHoleMm, null);
  assert.equal(T.PICTURE_DISC_HEART.status, "TEMPLATE_REQUIRED");
  assert.equal(T.GATEFOLD_12_DOUBLE.status, "TEMPLATE_REQUIRED");
  for (const t of A.ARTWORK_TEMPLATES) {
    assert.equal(t.safeZoneStatus, "UNVERIFIED", t.id);
    assert.equal(t.safeInsetMm, null, t.id);
    for (const item of t.manufacturingDataRequired) assert.ok(t.missing.includes(item), `${t.id}: ${item}`);
  }
  assert.ok(T.PICTURE_DISC_HEART.manufacturingDataRequired.length > 0 && T.GATEFOLD_12_DOUBLE.manufacturingDataRequired.length > 0);
  assert.deepEqual(T.SLEEVE_12_FRONT.manufacturingDataRequired, []);
  const qc = code(read("public/api/lib/production-files.php"));
  assert.match(qc, /'MISSING_FROM_MANUFACTURER'/);
  assert.match(qc, /\$checks\['SAFE_ZONE'\]/);
});

test("artwork provider DEFERRED; no image-generation or supplier API call anywhere", () => {
  assert.equal(A.ARTWORK_PROVIDER_DECISION_STATUS, "DEFERRED");
  assert.deepEqual([...A.ART_CREATION_METHODS_AVAILABLE], ["MANUAL_DESIGN", "MCB_INTERNAL"]);
  assert.deepEqual([...A.RENDERERS_AVAILABLE], ["MANUAL_EXTERNAL"]);
  for (const p of ["public/api/lib/production-files.php", "public/api/crm/production-files.php", "public/api/crm/artwork.php"]) {
    assert.doesNotMatch(code(read(p)), /curl_init|file_get_contents\(\s*['"]https?:|fsockopen|openai|stability|midjourney|replicate|imagick|exec\(/i, p);
  }
});

test("visual QC criteria and outcomes; image preparation states never invent identity", () => {
  for (const c of ["correct_photographs", "correct_names", "correct_dates", "correct_title", "correct_occasion", "spelling", "image_quality", "crop_composition", "facial_visibility", "text_legibility", "visual_balance", "premium_standard", "mcb_branding", "no_other_customer_material"]) assert.ok(A.VISUAL_QC_CRITERIA.includes(c), c);
  assert.deepEqual([...A.VISUAL_QC_OUTCOMES], ["PASS", "REWORK", "ESCALATE"]);
  assert.deepEqual([...A.IMAGE_PREPARATION_STATES], ["SOURCE_READY", "PREPARATION_REQUIRED", "PREPARATION_IN_PROGRESS", "PREPARED", "UNUSABLE", "EXCEPTION"]);
  assert.match(code(read("public/api/lib/production-files.php")), /identity_confirmation_required/);
});

test("file roles have configurable limits; MP3 support is separate from duration inspection", () => {
  assert.deepEqual(Object.keys(A.FILE_ROLE_LIMITS).sort(), ["AUDIO_PRODUCTION_MASTER", "CREATIVE_ART_MASTER", "CUSTOMER_LISTENING_COPY", "CUSTOMER_SOURCE_PHOTO", "PRINT_PRODUCTION_MASTER"]);
  assert.ok(A.FILE_ROLE_LIMITS.PRINT_PRODUCTION_MASTER > 10 * 1024 * 1024 && A.FILE_ROLE_LIMITS.AUDIO_PRODUCTION_MASTER > 10 * 1024 * 1024);
  assert.match(read("public/api/crm/.user.ini"), /upload_max_filesize = 260M/);
  assert.match(read("public/api/crm/.htaccess"), /php_value upload_max_filesize 260M/);
  assert.match(read("public/api/.user.ini"), /upload_max_filesize = 11M/, "the customer photo endpoint keeps its limit");
  assert.match(read("public/api/config.example.php"), /'role_limits' => \[/);
  const mp3 = M.creative.AUDIO_FORMAT_CAPABILITIES.MP3;
  assert.equal(mp3.formatSupported, true);
  assert.equal(mp3.durationInspection, "NOT_AVAILABLE");
  for (const f of ["WAV", "FLAC", "AIFF"]) assert.equal(M.creative.AUDIO_FORMAT_CAPABILITIES[f].durationInspection, "HEADER");
  assert.match(code(read("public/api/lib/creative-qc.php")), /DURATION_INSPECTION_NOT_AVAILABLE_FOR_FORMAT/);
});

test("manufacturing package states and exceptions; data required is never READY", () => {
  assert.deepEqual([...A.MANUFACTURING_PACKAGE_STATES], ["NOT_READY", "MANUFACTURING_DATA_REQUIRED", "READY", "SUPERSEDED"]);
  for (const e of ["ARTWORK_EXCEPTION", "ARTWORK_TEMPLATE_REQUIRED", "ARTWORK_SAFE_ZONE_UNVERIFIED", "PRODUCTION_FILE_EXCEPTION", "AUDIO_CAPACITY_EXCEPTION", "MANUFACTURING_DATA_REQUIRED", "FULFILMENT_EXCEPTION"]) assert.ok(A.PRODUCTION_EXCEPTIONS.includes(e), e);
  const lib = code(read("public/api/lib/production-files.php"));
  assert.match(lib, /\$blockers !== \[\] \? 'MANUFACTURING_DATA_REQUIRED' : 'READY'/);
  assert.match(lib, /UNIQUE|body_sha256/);
  assert.match(schema, /UNIQUE KEY uq_manufacturing_package_content \(order_id, body_sha256\)/);
  for (const e of ["ARTWORK.CREATIVE_JOB_READY", "ARTWORK.CREATIVE_MASTER_READY", "ARTWORK.VISUAL_QC_REQUIRED", "ARTWORK.VISUAL_QC_PASSED", "PRODUCTION.RENDER_REQUIRED", "PRODUCTION.MASTER_READY", "PRODUCTION.FILE_QC_PASSED", "MANUFACTURING.PACKAGE_REQUIRED", "MANUFACTURING.PACKAGE_READY", "MANUFACTURING.DATA_REQUIRED"]) assert.ok(M.ops.AUTOMATION_EVENTS.includes(e), e);
  assert.equal(M.ops.EVENT_MODEL["FULFILMENT.APPROVAL_REQUIRED"], "FULFILMENT.READY", "existing semantics reused");
});

test("supplier data, links and costs are staff-only: never committed, never public, never in a notification", () => {
  assert.ok(!readdirSync(join(root, "public/api/data")).includes("supplier-orders.json"));
  const browser = [...walk("src"), "public/catalogue.json"].map(read).map(code).join("\n");
  assert.doesNotMatch(browser, /expected_cost_minor"|shipping allowance|supplier cost|purchase price/i);
  const notifications = code(read("public/api/lib/founder-notifications.php"));
  const keys = notifications.match(/const MCB_NOTIFICATION_PAYLOAD_KEYS = \[([\s\S]*?)\];/)[1];
  assert.doesNotMatch(keys, /supplier_url|product_url|cost|price|address|photo|story/);
  for (const p of ["public/api/crm/production-files.php", "public/api/crm/operations.php"]) assert.match(code(read(p)), /require_crm_key\(\);/, p);
  for (const p of walk("public/api").filter((f) => f.endsWith(".php") && !f.includes("/crm/") && !f.includes("/lib/"))) {
    assert.doesNotMatch(code(read(p)), /supplier_order_pack|current_supplier_order_pack|manufacturing_package/, `${p} is public and must not expose production data`);
  }
});

test("financial control: packs are prepared automatically, never authorised by code", () => {
  const lib = code(read("public/api/lib/production-files.php"));
  assert.doesNotMatch(lib, /supplier_purchase_authorised_(by|at)\s*=/, "the factory never writes a financial authorisation");
  assert.doesNotMatch(lib, /stripe_request|refund|payout|subscription/i);
  const ops = code(read("public/api/lib/operations.php"));
  assert.match(ops, /ORDER_PLACED/);
  assert.match(ops, /founder_authorisation_required/);
  assert.match(ops, /password_verify\(/);
});

test("staff UX: structured production forms; raw JSON editing is labelled engineering/advanced", () => {
  const panel = read("src/pages/operations/ProductionFilesPanel.tsx");
  assert.match(panel, /REGISTER_ART_MASTER/);
  assert.match(panel, /VISUAL_QC/);
  assert.doesNotMatch(panel, /JSON\.parse\(|<textarea[^>]*font-mono/, "no raw JSON editing in the everyday production forms");
  assert.match(read("src/pages/operations/CreativeFactoryPanel.tsx"), /ENGINEERING \/ ADVANCED/);
  assert.match(read("src/pages/Operations.tsx"), /Manufacturing package/);
});
