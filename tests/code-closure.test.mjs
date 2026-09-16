/**
 * FINAL CODE CLOSURE & PAYMENT-FIRST RECONCILIATION — regression tests.
 *
 * Source-level guards for the things this sprint closed. The behavioural proof
 * lives in tests/payment-first-acceptance.sh, which drives an unpaid order at
 * every production workflow against a real server; these are the checks a CI
 * run can make on its own, and the ones that would catch a future edit
 * quietly undoing a decision.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
  });
const api = () => walk("public/api").filter((f) => f.endsWith(".php"));

/* ------------------------------------------------------------------ */
/* Payment first                                                       */
/* ------------------------------------------------------------------ */

test("payment is the only thing that starts work, and only two places record it", () => {
  // PAID is bound as a parameter, not written as a SQL literal, so look for a
  // file that both updates orders.status and supplies the value 'PAID'.
  const writers = api().filter((f) => {
    const source = read(f);
    // One statement that sets orders.status, and 'PAID' as its bound value.
    const statements = source.match(/UPDATE\s+orders\s+SET[\s\S]{0,400}?WHERE/gi) ?? [];
    return statements.some((st) => /\bstatus\s*=/.test(st)) && /'PAID'/.test(source) && /status/.test(source);
  });
  assert.deepEqual(
    writers.sort(),
    ["public/api/crm/reconcile.php", "public/api/stripe/webhook.php"],
    "PAID must be written only by the signed webhook and staff reconciliation of a real payment"
  );
});

test("the payment-first guard exists, names every production workflow, and fails closed", () => {
  const guard = read("public/api/lib/payment-first.php");
  assert.match(guard, /function order_payment_verified/);
  assert.match(guard, /function require_payment_before_work/);
  // It throws rather than returning a flag a caller could ignore.
  assert.match(guard, /throw new OperationsException\(\s*\n?\s*'order_not_paid'/);
  for (const workflow of ["CREATIVE_JOB", "ARTWORK", "PRODUCTION_FILE", "MANUFACTURING_PACKAGE", "VIDEO", "SUPPLIER_ORDER", "SHIPMENT", "REPLACEMENT"]) {
    assert.match(guard, new RegExp(`'${workflow}'`), `${workflow} is missing from the payment-first workflow list`);
  }
  // REFUNDED is not "paid" for the purpose of starting NEW work.
  assert.match(guard, /=== 'PAID'/);
});

test("the three entry points that relied on their callers now check for themselves", () => {
  assert.match(read("public/api/lib/production-files.php"), /require_payment_before_work\(\$pdo, \$orderId, 'ARTWORK'\)/);
  assert.match(read("public/api/lib/video.php"), /require_payment_before_work\(\$pdo, \$orderId, 'VIDEO'\)/);
  assert.match(read("public/api/lib/customer-care.php"), /require_payment_before_work\(/);
});

test("the payment-first sequencing matrix covers every workflow the founders asked about", () => {
  const resilience = read("public/api/lib/resilience.php");
  assert.match(resilience, /function resilience_payment_first_matrix/);
  for (const phase of ["BEFORE_PAYMENT", "AFTER_PAYMENT_ONLY", "AFTER_QUALITY_CONTROL", "AFTER_FOUNDER_APPROVAL", "EXCEPTION_ONLY"]) {
    assert.match(resilience, new RegExp(`'${phase}'`), `${phase} missing from the matrix`);
  }
  const matrix = resilience.slice(resilience.indexOf("function resilience_payment_first_matrix"), resilience.indexOf("/* Automation readiness matrix"));
  for (const workflow of ["Creative jobs", "Artwork", "Production (print) files", "Memory Music Video production", "Manufacturing package", "Supplier routing", "Supplier purchase", "Shipment", "Customer support", "Refund", "Replacement production"]) {
    assert.ok(matrix.includes(workflow), `the matrix does not mention ${workflow}`);
  }
  // It is reachable by the founders, not just present in the code.
  assert.match(read("public/api/crm/system.php"), /'payment-first' =>/);
  assert.match(read("src/lib/commandCentre.ts"), /\["payment-first", "When work can start"\]/);
});

/* ------------------------------------------------------------------ */
/* Known impossibility vs incomplete verification                      */
/* ------------------------------------------------------------------ */

test("only a KNOWN impossibility stops a customer paying; uncertainty stops the work instead", () => {
  const routing = read("public/api/lib/routing.php");
  assert.match(routing, /MCB_UNFULFILLABLE_FLAGS/);
  assert.match(routing, /MCB_VERIFICATION_FLAGS/);

  // Known: evidenced unsupported destination, unavailable product, a complete
  // costing that loses money.
  const unfulfillable = routing.slice(routing.indexOf("const MCB_UNFULFILLABLE_FLAGS"), routing.indexOf("const MCB_VERIFICATION_FLAGS"));
  for (const flag of ["DESTINATION_UNSUPPORTED", "PRODUCT_UNAVAILABLE", "NEGATIVE_CONTRIBUTION"]) {
    assert.ok(unfulfillable.includes(flag), `${flag} should stop a sale`);
  }
  // Uncertain: evidence MCB has simply not finished recording.
  const verification = routing.slice(routing.indexOf("const MCB_VERIFICATION_FLAGS"), routing.indexOf("function new_sale_flag_certainty"));
  for (const flag of ["MISSING_ROUTE", "ROUTE_NOT_VERIFIED", "COMMERCIAL_DATA_MISSING", "UNVERIFIED_HIGH_RISK_MARKETPLACE_ROUTE", "MANUFACTURING_DATA_MISSING"]) {
    assert.ok(verification.includes(flag), `${flag} must not stop a sale`);
  }
  // An unrecognised flag is treated as blocking, never as safe.
  assert.match(routing, /return 'KNOWN_UNFULFILLABLE';/);
  // The pre-payment gate reads the known list only.
  const gate = routing.slice(routing.indexOf("function new_sale_items_needing_confirmation"), routing.indexOf("function new_sale_items_needing_verification"));
  assert.match(gate, /\['known_unfulfillable'\] !== \[\]/);
  assert.doesNotMatch(gate, /verification_incomplete/);
});

test("a paid order MCB cannot fulfil raises an exception and is never undone automatically", () => {
  const controller = read("public/api/lib/fulfilment-controller.php");
  assert.match(controller, /function fulfilment_check_route_verification/);
  assert.match(controller, /'PAID_ORDER_FULFILMENT_EXCEPTION'/);
  assert.match(controller, /'POST_PAYMENT_VERIFICATION_REQUIRED'/);
  // It only ever runs on a paid order.
  assert.match(controller, /if \(!order_payment_verified\(\$pdo, \$orderId\)\)/);
  // Both exception types are declared, not invented at the call site.
  const types = read("src/data/production/fulfilment.ts");
  assert.match(types, /"PAID_ORDER_FULFILMENT_EXCEPTION"/);
  assert.match(types, /"POST_PAYMENT_VERIFICATION_REQUIRED"/);
  const generated = JSON.parse(read("public/api/data/fulfilment.json"));
  assert.ok(generated.fulfilment_exception_types.includes("POST_PAYMENT_VERIFICATION_REQUIRED"));
  // Nothing in the new path cancels, reprices, substitutes or refunds.
  const fn = controller.slice(controller.indexOf("function fulfilment_check_route_verification"), controller.indexOf("/* Exceptions"));
  // It writes no order row, changes no price and calls nothing that moves money.
  // (The prose in `next_action` does say a refund review is one human option.)
  assert.doesNotMatch(fn, /UPDATE\s+orders|DELETE\s+FROM|total_minor\s*=|\/v1\/refunds/i);
});

/* ------------------------------------------------------------------ */
/* Money safety                                                        */
/* ------------------------------------------------------------------ */

test("no refund API exists and nothing sends money out by itself", () => {
  for (const file of api()) {
    const source = read(file);
    assert.doesNotMatch(source, /\/v1\/refunds|\/v1\/payouts|\/v1\/transfers/, `${file} calls a money-out Stripe endpoint`);
  }
});

/* ------------------------------------------------------------------ */
/* Business time                                                       */
/* ------------------------------------------------------------------ */

test("one definition of the business day, shared by Business and the Command Centre", () => {
  const shared = read("public/api/lib/business-time.php");
  assert.match(shared, /function mcb_business_periods/);
  assert.match(shared, /function mcb_business_timezone/);
  assert.match(shared, /function mcb_business_date/);
  // Europe/London by founder decision, read from the policy rather than restated.
  assert.match(shared, /founder_decisions'\]\['business_timezone'\]/);
  assert.match(shared, /'Europe\/London'/);
  // Both consumers delegate: no second definition of "today".
  assert.match(read("public/api/lib/business.php"), /return mcb_business_periods\(\$now\);/);
  assert.match(read("public/api/lib/command-centre.php"), /\$periods = mcb_business_periods\(\$now\);/);
  // A period is half-open, so nothing is counted twice or counted forever.
  assert.match(shared, /\$at >= \$period\['start'\] && \$at < \$period\['end'\]/);
});

test("no founder-facing day boundary is left on UTC, and no timestamp follows the database session", () => {
  const offenders = [];
  for (const file of api()) {
    if (file.endsWith("business-time.php")) continue;
    const source = read(file);
    for (const line of source.split("\n")) {
      if (/^\s*(\*|\/\/)/.test(line)) continue;
      // A calendar-day boundary computed in UTC.
      if (/UTC_DATE\(\)/.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
      // NOW() follows the database connection's timezone; everything else uses UTC_TIMESTAMP().
      if (/[^_A-Z]NOW\(\)/.test(line) && !/UTC_TIMESTAMP/.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("an invalid configured timezone is reported rather than silently ignored", () => {
  const shared = read("public/api/lib/business-time.php");
  assert.match(shared, /CONFIGURED_VALUE_INVALID/);
  assert.match(shared, /in_array\(\$configured, DateTimeZone::listIdentifiers\(\), true\)/);
});

/* ------------------------------------------------------------------ */
/* Dependencies                                                        */
/* ------------------------------------------------------------------ */

test("React Router is on a patched version and no dead production dependency remains", () => {
  const pkg = JSON.parse(read("package.json"));
  const router = pkg.dependencies["react-router-dom"].replace(/^[^\d]*/, "");
  const [major, minor] = router.split(".").map(Number);
  assert.ok(major > 7 || (major === 7 && minor >= 18), `react-router-dom ${router} is below the patched 7.18.2`);

  // These were declared, imported by nothing, and shipped in no bundle. Supabase
  // carried the last production advisory (its transitive `ws`).
  for (const dead of ["@supabase/supabase-js", "@gsap/react", "@hookform/resolvers", "date-fns", "zod"]) {
    assert.ok(!(dead in pkg.dependencies), `${dead} is back as a production dependency`);
  }
  const lock = JSON.parse(read("package-lock.json"));
  assert.ok(!Object.keys(lock.packages ?? {}).some((p) => p.endsWith("node_modules/@supabase/supabase-js")));
});

/* ------------------------------------------------------------------ */
/* 404 and the public surface                                          */
/* ------------------------------------------------------------------ */

test("the route allowlist and the app agree, in both directions", () => {
  const htaccess = read("public/.htaccess");
  assert.match(htaccess, /ErrorDocument 404 \/index\.html/);
  // A local path, not a URL: a URL would be a redirect and could loop.
  assert.doesNotMatch(htaccess, /ErrorDocument 404 https?:/);

  const app = read("src/App.tsx");
  const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*" && p !== "/");
  // Ask the real question: would the host's own conditions match this URL?
  // The patterns are Apache regexes over REQUEST_URI, which JavaScript reads
  // the same way, so test each route against each condition rather than trying
  // to parse the alternations by hand.
  const conditions = [...htaccess.matchAll(/RewriteCond %\{REQUEST_URI\} "([^"]+)"/g)].map((m) => new RegExp(m[1]));
  const admits = (path) => conditions.some((re) => re.test(path));
  const missing = routes.filter((route) =>
    // A dynamic segment is tested with a real slug, as the host would see it.
    !admits(route.replace("/:slug", "/turn-a-special-memory-into-a-personalised-song"))
  );
  // And a genuinely unknown path is admitted by none of them.
  for (const unknown of ["/definitely-not-a-page", "/old-page.html", "/legal/nonsense", "/products/x/y"]) {
    assert.ok(!admits(unknown), `${unknown} would wrongly be served as an app route`);
  }
  assert.deepEqual(missing, [], "app routes that the host would answer with 404");

  // And the non-Apache host file says the same thing.
  const redirects = read("public/_redirects");
  assert.match(redirects, /^\/\*\s+\/index\.html\s+404$/m, "the catch-all must be 404, not 200");
  for (const route of ["/products", "/create", "/faq", "/command-centre"]) {
    assert.ok(redirects.includes(route), `${route} is missing from _redirects`);
  }
});

test("the legacy surfaces are withdrawn from the launch, not deleted", () => {
  const app = read("src/App.tsx");
  // The routes still resolve, so an existing link is not broken …
  for (const route of ["/artists", "/artists/apply", "/affiliate", "/dashboard"]) {
    assert.match(app, new RegExp(`path="${route}"`), `${route} should still resolve`);
  }
  // … but they are noindexed, unlinked and out of the sitemap.
  assert.match(app, /path="\/artists" element=\{<Layout><NoIndex \/>/);
  assert.match(app, /path="\/artists\/apply" element=\{<Layout><NoIndex \/>/);
  const sitemap = read("public/sitemap.xml");
  for (const route of ["/artists", "/artists/apply", "/affiliate", "/dashboard"]) {
    assert.ok(!sitemap.includes(`mycustombeats.com${route}<`), `${route} is still in the sitemap`);
  }
  const footer = read("src/sections/Footer.tsx");
  for (const route of ["/artists", "/affiliate"]) {
    assert.ok(!footer.includes(`"${route}"`), `${route} is still linked from the footer`);
  }
  const robots = read("public/robots.txt");
  assert.match(robots, /^Disallow: \/artists$/m);
  assert.match(robots, /^Disallow: \/affiliate$/m);
  // The affiliate BACKEND is untouched: commission attribution still exists.
  assert.ok(read("public/api/affiliate/register.php").length > 0);
  assert.match(read("db/schema.sql"), /CREATE TABLE.*affiliates/s);
});

/* ------------------------------------------------------------------ */
/* Staff accountability, scanning, HSTS — truthfully reported          */
/* ------------------------------------------------------------------ */

test("individual staff keys are supported, and the recorded name comes from the key", () => {
  const security = read("public/api/lib/security.php");
  assert.match(security, /function staff_key_identity/);
  assert.match(security, /function crm_staff_name/);
  assert.match(security, /password_verify\(\$given, \$hash\)/, "staff keys are hashed, never stored in the clear");
  // An authenticated identity overrides whatever the request claims.
  assert.match(security, /return \$identity !== null \? \$identity\['name'\] : \$declared;/);
  // Every staff endpoint uses it, so no surface still trusts a typed name alone.
  const endpoints = walk("public/api/crm").filter((f) => f.endsWith(".php"));
  for (const file of endpoints) {
    const source = read(file);
    if (!/operations_line\(\$(?:_GET|body|in)\['staff'\]|operations_line\(\$field\('staff'\)/.test(source)) continue;
    assert.match(source, /crm_staff_name\(operations_line\(/, `${file} still trusts the declared staff name`);
  }
  // No key or hash is in the repository.
  assert.doesNotMatch(read("public/api/config.example.php"), /\$2y\$10\$[A-Za-z0-9./]{20,}/);
});

test("staff authentication, malware scanning and HSTS report what is actually true", () => {
  const security = read("public/api/lib/security.php");
  assert.match(security, /function staff_authentication_readiness/);
  for (const state of ["INDIVIDUAL_KEYS_CONFIGURED", "SHARED_KEY_ONLY"]) assert.match(security, new RegExp(state));

  const uploads = read("public/api/lib/uploads.php");
  for (const state of ["SCANNING_ACTIVE", "SCANNER_CONNECTION_REQUIRED", "SCANNING_NOT_AVAILABLE"]) {
    assert.match(uploads, new RegExp(state), `${state} missing`);
  }
  // Local command only: no paid API, no service, nothing leaves the server.
  const scanner = uploads.slice(uploads.indexOf("function upload_scanner_command"));
  assert.doesNotMatch(scanner, /https?:\/\//);
  // A scanner that refuses fails closed, and "not scanned" is distinguishable from "clean".
  assert.match(uploads, /return null;/);
  assert.match(uploads, /'clean' => \$exit === 0/);
  for (const endpoint of ["public/api/order-upload.php", "public/api/order-video-media.php", "public/api/order-evidence.php"]) {
    assert.match(read(endpoint), /upload_scan_result\(\$tmp\)/, `${endpoint} does not scan`);
  }

  // Readiness tells the truth rather than asserting a fixed answer.
  const resilience = read("public/api/lib/resilience.php");
  assert.match(resilience, /\$scanner = upload_scanner_state\(\);/);
  assert.match(resilience, /\$staffAuth = staff_authentication_readiness\(\);/);

  // HSTS: off unless the host switches it on, and never a bare enabled header.
  const htaccess = read("public/.htaccess");
  assert.match(htaccess, /<If "%\{ENV:MCB_HSTS\} == '1'">/);
  assert.match(htaccess, /Header always set Strict-Transport-Security "max-age=31536000"/);
  const hstsHeader = htaccess.split("\n").filter((l) => /Strict-Transport-Security/.test(l) && !/^\s*#/.test(l)).join("\n");
  assert.doesNotMatch(hstsHeader, /includeSubDomains|preload/, "start without either; both are effectively irreversible");
});

/* ------------------------------------------------------------------ */
/* Support identity and captions                                       */
/* ------------------------------------------------------------------ */

test("hello@ is still the public support identity and support@ never reappears", () => {
  const publicSource = [...walk("src/pages"), ...walk("src/sections"), ...walk("src/components"), ...walk("src/data")]
    .filter((f) => /\.tsx?$/.test(f))
    .map(read)
    .join("\n");
  assert.match(publicSource, /hello@mycustombeats\.com/);
  assert.doesNotMatch(publicSource, /support@mycustombeats\.com/);
});

test("the example film can carry captions the moment a real caption file exists", () => {
  const showcase = read("src/sections/SongShowcaseSection.tsx");
  // The player supports a track; none is invented while no caption file exists.
  assert.match(showcase, /CAPTIONS/);
  assert.doesNotMatch(showcase, /<track[^>]*src="[^"]+"/, "no caption file may be asserted before one exists");
});
