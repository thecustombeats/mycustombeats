/**
 * MCB Fulfilment Controller & customer delivery automation (15 September 2026). Run: npm test
 *
 * Contracts: MCB is the middleman — nothing buys, pays, refunds or books a
 * courier; financial authority is Bella OR Lewis, explicitly; economics and
 * supplier routes stay server-side and are never invented; internal
 * allowances are never a customer charge; one order may have many parcels
 * and completes only when every required parcel has arrived; the customer
 * page shows simple states and no partner; evidence is never a condition of
 * help; review requests and marketing permission are separate; the bridge
 * is provider-independent; ADVISORY stays the default.
 * Server behaviour is proven against PHP in tests/fulfilment-acceptance.sh.
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
/** The body of a PHP function, up to the next top-level function. */
const phpFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function ${name} exists`);
  const end = source.indexOf("\n}\n", start);
  return source.slice(start, end < 0 ? undefined : end + 2);
};

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-fc-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as fulfilment from "${root}src/data/production/fulfilment.ts";
export * as ops from "${root}src/data/operations.ts";
`);
const outFile = join(root, "node_modules", `.mcb-fc-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
const M = await import(outFile);
const F = M.fulfilment;

const controller = read("public/api/lib/fulfilment-controller.php");
const operations = read("public/api/lib/operations.php");
const schema = read("db/schema.sql");
const migration = read("db/migrations/2026-09-15-fulfilment-controller.sql");
const json = JSON.parse(read("public/api/data/fulfilment.json"));

test("policy data: routing states, separated allowances, destination and commercial statuses, every brief exception type", () => {
  assert.deepEqual(json.delivery_routing_states, ["VERIFIED_FIXED_OR_FREE", "DESTINATION_CALCULATED", "MARKETPLACE_LISTING_DEPENDENT", "MANUAL_FULFILMENT_REVIEW"]);
  assert.deepEqual([...F.INTERNAL_ALLOWANCE_COMPONENTS], ["EXPECTED_SUPPLIER_SHIPPING", "SHIPPING_CONTINGENCY", "MCB_FULFILMENT_HANDLING_ALLOWANCE", "TOTAL_INTERNAL_FULFILMENT_ALLOWANCE"]);
  assert.deepEqual([...F.DESTINATION_STATUSES], ["DESTINATION_SUPPORTED", "DESTINATION_CHECK_REQUIRED", "DESTINATION_UNSUPPORTED", "DESTINATION_UNKNOWN"]);
  assert.deepEqual([...F.COMMERCIAL_STATUSES], ["CALCULATED", "COMMERCIAL_DATA_REQUIRED", "COMMERCIAL_SAFETY_EXCEPTION"]);
  for (const t of ["SUPPLIER_DELAY", "PRODUCTION_DELAY", "TRACKING_NOT_RECEIVED", "TRACKING_STALLED", "PARCEL_DELAYED", "PARCEL_LOST", "PARCEL_DAMAGED", "WRONG_ITEM",
    "MANUFACTURING_DEFECT", "PARTIAL_DELIVERY", "DESTINATION_PROBLEM", "CUSTOMS_EXCEPTION", "SUPPLIER_CANCELLED", "OTHER_FULFILMENT_EXCEPTION", "PAID_ORDER_FULFILMENT_EXCEPTION", "SUBSTITUTION_APPROVAL_REQUIRED"]) {
    assert.ok(F.FULFILMENT_EXCEPTION_TYPES.includes(t), t);
  }
  assert.deepEqual([...F.VARIANCE_REASONS], ["SUPPLIER_PRICE_CHANGE", "SHIPPING_VARIANCE", "CURRENCY_VARIANCE", "MARKETPLACE_VARIANCE", "MANUAL_ADJUSTMENT", "OTHER"]);
  assert.deepEqual(json.variance_reasons, [...F.VARIANCE_REASONS], "generated from the TypeScript");
  // Internal delivery-state names never appear in anything a browser could load.
  for (const file of walk("src")) assert.ok(!/LISTING_DEPENDENT|DESTINATION_CALCULATED|MANUAL_REVIEW/.test(code(read(file))), file);
});

test("supplier routes are server-only, never committed and never invented; missing data is COMMERCIAL_DATA_REQUIRED", () => {
  assert.match(controller, /supplier-routes\.json/);
  const committed = readdirSync(join(root, "public/api/data"));
  assert.ok(!committed.includes("supplier-routes.json") && !committed.includes("supplier-orders.json"));
  const economics = phpFunction(controller, "fulfilment_expected_economics");
  assert.match(economics, /COMMERCIAL_DATA_REQUIRED/);
  assert.match(economics, /'total_cost_minor' => null, 'contribution_minor' => null/, "nothing estimated when data is missing");
  assert.doesNotMatch(economics, /\b(800|1000|2000)\b/, "no £8/£10/£20 allowance is hard-coded");
  // A route is VERIFIED only with a source and date.
  // VERIFIED needs a source and a (past) verification date; the state is calculated in lib/routing.php.
  assert.match(phpFunction(controller, "supplier_routes"), /route_with_verification\(/);
  assert.match(phpFunction(read("public/api/lib/routing.php"), "route_verification"), /if \(\$source === null \|\| \(\$claimed === 'VERIFIED' && \$date === null\)\) \{\s*\$state = 'VERIFICATION_REQUIRED';/);
  // Allowances never feed the customer quote.
  assert.doesNotMatch(read("public/api/lib/delivery.php"), /supplier_route|internal_allowance|fulfilment-controller/);
});

test("UNKNOWN is never SUPPORTED; marketplace listings always need a checkout check; UNSUPPORTED refuses authorisation", () => {
  const check = phpFunction(controller, "destination_check");
  assert.match(check, /'DESTINATION_UNKNOWN', 'reason' => 'DESTINATION_NOT_LISTED'/);
  assert.match(check, /MARKETPLACE_LISTING_DEPENDENT[\s\S]*DESTINATION_CHECK_REQUIRED/);
  assert.match(operations, /'destination_unsupported'/);
  assert.match(operations, /\$destination\['status'\] === 'DESTINATION_UNKNOWN' && \$requiredMode/);
  assert.match(operations, /destination_acknowledgement_required/);
});

test("founder authority: explicit code for authorisation and for founder-only resolutions; a deep link authorises nothing", () => {
  assert.deepEqual([...F.FOUNDER_ONLY_RESOLUTIONS], ["PARTIAL_DELIVERY_ACCEPTED", "SUBSTITUTION_APPROVED", "REFUND_TO_BE_HANDLED_BY_FOUNDER", "PROCEED_AT_PAID_PRICE"]);
  assert.match(operations, /RESOLVE_FULFILMENT_EXCEPTION' && in_array\(\$in\['resolution'\] \?\? null, fulfilment_data\(\)\['founder_only_resolutions'\], true\)\) \{\s*\$founder = check_founder_authorisation_request/);
  const page = read("src/pages/Operations.tsx");
  assert.match(page, /name: "destination_acknowledged"/);
  assert.match(page, /name: "commercial_acknowledged"/);
  assert.match(page, /Opening this page authorises nothing/);
  // The panel's founder-only form asks for the founder's own code; nothing submits on load.
  const panel = read("src/pages/operations/FulfilmentPanel.tsx");
  assert.match(panel, /type="password"/);
  assert.doesNotMatch(code(panel), /useEffect/);
});

test("supplier orders: only after authorisation, never payment credentials, variance needs a reason, no automatic checkout", () => {
  const record = phpFunction(controller, "record_supplier_order");
  assert.match(record, /founder_authorisation_required/);
  assert.match(record, /looks_like_card_number/);
  assert.match(record, /variance_reason_required/);
  const table = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS supplier_orders"), schema.indexOf(") ENGINE", schema.indexOf("CREATE TABLE IF NOT EXISTS supplier_orders")));
  assert.doesNotMatch(table.replace(/--.*$/gm, ""), /card|cvv|cvc|expiry|password|secret/i);
  assert.match(read("src/pages/operations/FulfilmentPanel.tsx"), /Never enter card numbers, security codes, passwords or account details/);
  for (const file of ["public/api/lib/fulfilment-controller.php", "public/api/crm/fulfilment.php", "public/api/order-evidence.php"]) {
    assert.doesNotMatch(code(read(file)), /curl_init|file_get_contents\(\s*['"]https?:|fsockopen|stream_socket_client/, file);
  }
});

test("commercial safety never cancels or alters a paid order; new-sales suspension is configurable and off by default", () => {
  const check = phpFunction(controller, "fulfilment_check_commercials");
  assert.match(check, /COMMERCIAL_SAFETY_EXCEPTION/);
  assert.doesNotMatch(check, /UPDATE orders|status = 'CANCELLED'|refund/i);
  const config = read("public/api/config.example.php");
  assert.match(config, /'min_contribution_minor' => 0/);
  assert.match(config, /'suspend_new_sales' => false/);
});

test("parcels: completion waits for every required parcel and no blocking exception; the old single-parcel path cannot skip one", () => {
  const position = phpFunction(controller, "order_delivery_position");
  assert.match(position, /'complete' => \$required !== \[\] && \$undelivered === \[\] && \$blocking === \[\]/);
  assert.match(operations, /parcels_recorded_separately/);
  assert.match(operations, /replacement_parcel_required/);
  // Completion is not tied to follow-up, review or permission.
  const complete = phpFunction(operations, "complete_if_all_delivered");
  assert.doesNotMatch(complete, /follow_up_done_at IS NOT NULL|REVIEW|customer_content_permissions/);
});

test("the customer page: parcels with simple states and tracking only; no partner, cost or internal detail", () => {
  const parcels = phpFunction(read("public/api/lib/customer-progress.php"), "customer_parcels");
  assert.match(parcels, /SELECT sequence, state, carrier, tracking_reference, tracking_url, dispatched_on, delivered_on FROM shipments/);
  assert.doesNotMatch(parcels, /supplier|route|cost|exception/i);
  const page = read("src/pages/YourOrder.tsx");
  assert.match(page, /Being made/);
  assert.match(page, /On its way/);
  assert.doesNotMatch(code(page), /supplier|partner order|route_id|contribution/i);
  assert.deepEqual(M.ops.CUSTOMER_STAGES.PHYSICAL.map((s) => s.title), ["Order received", "Creating your memory", "Quality check", "Being made", "On its way", "Delivered"]);
});

test("customer messages: new parcel, delay and delivered messages; one-way; MCB handles the partner", () => {
  const types = Object.fromEntries(M.ops.LIFECYCLE_TEMPLATES.map((t) => [t.type, t.autoSend]));
  assert.equal(types.ADDITIONAL_PARCEL_DISPATCHED, true);
  assert.equal(types.DELIVERY_UPDATE, false);
  assert.equal(types.DELIVERED, false);
  const messages = read("public/api/lib/lifecycle-messages.php");
  for (const t of ["ADDITIONAL_PARCEL_DISPATCHED", "DELIVERY_UPDATE", "DELIVERED"]) assert.match(messages, new RegExp(`'${t}' => \\[`));
  assert.doesNotMatch(messages, /contact (the )?(supplier|partner|manufacturer)|whatsapp/i);
  assert.match(messages, /nothing you need to arrange with anyone else/);
  assert.match(messages, /'reply_to' => mcb_support_address\(\)/);
});

test("support: wrong item and manufacturing defect cases; evidence private and optional", () => {
  const support = read("public/api/order-support.php");
  const care = read("public/api/lib/customer-care.php");
  assert.match(care, /'WRONG_ITEM' => 'WRONG_ITEM', 'MANUFACTURING_DEFECT' => 'MANUFACTURING_DEFECT'/);
  assert.match(support, /'required' => false/);
  const evidence = read("public/api/order-evidence.php");
  assert.match(evidence, /never a condition of\s*\n?\s*\* getting help/);
  assert.match(evidence, /require_same_origin\(\)/);
  assert.match(evidence, /enforce_scoped_rate_limit/);
  assert.match(evidence, /inspect_uploaded_image/);
  assert.match(evidence, /@chmod\(\$dir \. '\/' \. \$storedName, 0600\)/);
  assert.match(read("src/pages/order/SupportSection.tsx"), /It is not needed for us to help you/);
});

test("substitution: an ordinary product is never substituted silently; the pop-up card alternative is a separate recorded rule", () => {
  assert.deepEqual([...F.AUTHORISED_ALTERNATIVE_DELIVERY_CLASSES], ["CARD"]);
  const check = phpFunction(controller, "check_substitution_request");
  assert.match(check, /SUBSTITUTION_APPROVAL_REQUIRED/);
  assert.match(check, /substitution_is_approved_card_alternative/);
  assert.match(phpFunction(controller, "record_supplier_order"), /AUTHORISED_CARD_ALTERNATIVE[\s\S]*alternative_note_required|alternative_note_required[\s\S]*AUTHORISED_CARD_ALTERNATIVE/);
});

test("review request and marketing permission are separate; no incentive; hooks prepared, never sent", () => {
  assert.match(operations, /incentive_refused/);
  assert.match(operations, /A review is not permission/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS customer_content_permissions/);
  assert.match(migration, /requires_marketing_consent\s+TINYINT\(1\) NOT NULL DEFAULT 1/);
  const hooks = phpFunction(controller, "prepare_lifecycle_hooks");
  assert.doesNotMatch(hooks, /send_|notify|mail/i);
});

test("metrics, scorecards, health and the command centre are internal and read-only", () => {
  for (const name of ["fulfilment_health", "fulfilment_metrics", "supplier_scorecards", "fulfilment_command_centre"]) {
    assert.doesNotMatch(phpFunction(controller, name), /\b(INSERT|UPDATE|DELETE)\b/, name);
  }
  const endpoint = read("public/api/crm/fulfilment.php");
  assert.match(endpoint, /require_crm_key\(\)/);
  assert.match(endpoint, /No supplier is replaced automatically/);
  for (const check of ["PAID_ORDER_WITHOUT_PROCESSING_EVENT", "READY_PACKAGE_WITHOUT_FOUNDER_NOTIFICATION", "AUTHORISED_WITHOUT_SUPPLIER_ORDER",
    "SUPPLIER_ORDER_WITHOUT_TRACKING_AFTER_EXPECTED_DISPATCH", "DISPATCHED_PARCEL_OVERDUE", "DELIVERED_NOT_COMPLETED", "COMPLETED_WITHOUT_FOLLOW_UP", "ABANDONED_NOTIFICATION", "UNRESOLVED_FULFILMENT_EXCEPTION"]) {
    assert.match(controller, new RegExp(`'${check}'`), check);
  }
  assert.ok(!walk("src").some((f) => /crm\/fulfilment\?view=(today|metrics|scorecards)/.test(read(f)) && !/Operations|operations\//.test(f)), "no public page reads the internal views");
});

test("notifications: new founder types, provider-independent channels, no Telegram or TaskNotify credential", () => {
  const types = M.ops.FOUNDER_NOTIFICATIONS.map((n) => n.type);
  for (const t of ["NEW_ORDER_READY_FOR_PROCESSING", "FULFILMENT_APPROVAL_REQUIRED", "COMMERCIAL_SAFETY_EXCEPTION", "MANUFACTURING_DATA_REQUIRED", "FULFILMENT_EXCEPTION", "DELIVERY_EXCEPTION", "CUSTOMER_SUPPORT_EXCEPTION"]) {
    assert.ok(types.includes(t), t);
  }
  assert.match(read("public/api/crm/notifications.php"), /\['TELEGRAM', 'EMAIL_FALLBACK', 'STAFF_QUEUE', 'EMAIL', 'OTHER'\]/);
  for (const file of [...walk("public/api/lib"), ...walk("public/api/crm"), "public/api/config.example.php"].filter((f) => f.endsWith(".php"))) {
    assert.doesNotMatch(code(read(file)), /api\.telegram\.org|bot\d{6,}:|tasknotify/i, file);
  }
});

test("ADVISORY stays the default; the migration only adds; preflight reports the migration and the routes", () => {
  assert.match(read("public/api/config.example.php"), /'enforcement' => 'ADVISORY'/);
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /^\s*(DROP|DELETE|TRUNCATE|RENAME|UPDATE)\s/im);
  const preflight = read("public/api/crm/preflight.php");
  assert.match(preflight, /fulfilment_controller_migration_applied/);
  assert.match(preflight, /'supplier_routes'/);
  assert.match(schema, /Fulfilment Controller \(15 September 2026\)/);
});
