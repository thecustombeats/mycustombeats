/**
 * MCB™ Customer Care & Recovery Controller (16 September 2026). Run: npm test
 *
 * Contracts: one MCB support address (never WhatsApp for ordinary orders);
 * plain customer choices and wording; a service target, never a guarantee;
 * the customer never sees internal notes, priority, classification, remedies,
 * staff names, suppliers or economics; templates are warm, MCB-owned and make
 * no legal promise; a subjective preference never becomes a revision; money
 * waits for Bella or Lewis and no refund API exists; retention waits for legal
 * review; message content never reaches analytics.
 * Server behaviour is proven against PHP in tests/customer-care-acceptance.sh.
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

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-care-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as care from "${root}src/data/production/customer-care.ts";
export * as client from "${root}src/lib/customerCare.ts";
export { isPrivateAnalyticsPath } from "${root}src/lib/analytics.ts";
`);
const outFile = join(root, "node_modules", `.mcb-care-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" } };
const { care: C, client: L, isPrivateAnalyticsPath } = await import(outFile);
const lib = read("public/api/lib/customer-care.php");
const json = JSON.parse(read("public/api/data/customer-care.json"));

test("one MCB support address; ordinary order help is never WhatsApp", () => {
  assert.equal(C.SUPPORT_EMAIL, "hello@mycustombeats.com");
  assert.equal(json.support_email, "hello@mycustombeats.com");
  assert.match(read("public/api/lib/bootstrap.php"), /function mcb_support_address\(\): string[\s\S]*'hello@mycustombeats\.com'/);
  for (const file of ["public/api/lib/lifecycle-messages.php", "public/api/lib/lifecycle.php", "public/api/lib/notify.php"]) {
    assert.match(read(file), /'reply_to'\s*=> mcb_support_address\(\)/, file);
    assert.doesNotMatch(read(file), /support@mycustombeats\.com/, file);
  }
  for (const file of ["src/pages/order/SupportSection.tsx", "public/api/order-support.php", "public/api/order-support-case.php", "src/pages/ThankYou.tsx"]) {
    assert.doesNotMatch(code(read(file)), /wa\.me|whatsapp\.com|support@mycustombeats\.com/i, file);
  }
});

test("customer choices are plain; the service target is an aim, not a guarantee", () => {
  assert.deepEqual(C.SUPPORT_CASE_TYPES.map((t) => t.label), [
    "I have a question", "Delivery problem", "Damaged item", "Wrong item", "Manufacturing problem",
    "Something is incorrect", "Video problem", "Digital delivery problem", "Other",
  ]);
  assert.equal(C.SUPPORT_SERVICE_TARGET.customerWording, "We aim to reply within one working day.");
  const customerText = JSON.stringify([C.SUPPORT_COPY, C.SUPPORT_CUSTOMER_STATUS, C.SUPPORT_CASE_TYPES.map((t) => t.label), C.SUPPORT_DIGITAL_ISSUES.map((i) => i.label)]);
  assert.doesNotMatch(customerText, /guarantee|within 24 hours|supplier|partner|manufacturer|provider|automat|\bAI\b|founder|priority|internal/i);
  assert.deepEqual(Object.keys(C.SUPPORT_CUSTOMER_STATUS), [...C.SUPPORT_CASE_STATUSES], "every state has customer words");
  for (const internal of C.SUPPORT_CASE_STATUSES) {
    assert.doesNotMatch(Object.values(C.SUPPORT_CUSTOMER_STATUS).map((s) => s.label).join(" "), new RegExp(internal), "no engineering state is shown");
  }
  assert.deepEqual([...C.SUPPORT_PRIORITIES], ["NORMAL", "IMPORTANT", "URGENT"]);
  assert.equal(C.SUPPORT_CASE_TYPES.find((t) => t.kind === "DAMAGED_OR_FAULTY").priority, "URGENT");
  assert.equal(C.SUPPORT_CASE_TYPES.find((t) => t.kind === "QUESTION").priority, "NORMAL");
  assert.equal(C.SUPPORT_CASE_TYPES.find((t) => t.kind === "DELIVERY_PROBLEM").priority, "IMPORTANT");
});

test("the customer's case view carries nothing internal", () => {
  const view = phpFunction(lib, "care_customer_cases");
  assert.match(view, /kind IN \('CUSTOMER_MESSAGE','MCB_RESPONSE'\)/, "internal notes and system events are never selected");
  assert.match(view, /'from' => \$m\['kind'\] === 'MCB_RESPONSE' \? 'MCB' : 'YOU'/, "no staff name");
  assert.doesNotMatch(view, /priority|classification|privacy_review|sentiment|root_cause|remed|author|assigned|supplier|cost|economics/);
  const isolation = phpFunction(lib, "care_customer_case");
  assert.match(isolation, /\(int\) \$case\['order_id'\] !== \$orderId/, "another order's case is not found");
  // The email only says MCB replied; the reply stays on the private page.
  const email = read("public/api/lib/lifecycle-messages.php");
  const content = email.slice(email.indexOf("'SUPPORT_RESPONSE' => ["), email.indexOf("'FOLLOW_UP' => ["));
  assert.match(content, /We've replied to your message/);
  assert.doesNotMatch(content, /body|message_text|\$c\['reply/);
});

test("templates are warm, brief and MCB-owned: no supplier policy, legal promise or compensation", () => {
  assert.ok(C.SUPPORT_TEMPLATES.length >= 10);
  for (const t of C.SUPPORT_TEMPLATES) {
    assert.match(t.body, /^Hello \{firstName\},/, t.key);
    assert.match(t.body, /MCB$/, t.key);
    assert.doesNotMatch(t.body, /supplier|partner|manufacturer|factory|whatsapp|guarantee|refund|compensation|discount|voucher|credit|legally|liable|entitled|\bAI\b|automat/i, t.key);
    assert.ok(t.body.length < 700, `${t.key} is brief`);
  }
  const preference = C.SUPPORT_TEMPLATES.find((t) => t.key === "CREATIVE_PREFERENCE").body;
  assert.match(preference, /Your normal consumer rights are not affected/);
  assert.doesNotMatch(preference, /remake|redo|new version|revision|approve/i, "a preference is never offered a revision");
  assert.match(read("src/pages/customer-care/CaseView.tsx"), /Start from a template \(edit before sending\)/);
});

test("Single Creative Authority: a subjective preference never becomes a revision; nothing asks for approval", () => {
  const propose = phpFunction(lib, "care_propose_remedy");
  assert.match(propose, /\$policy\['objective_only'\] && \$case\['classification'\] !== 'OBJECTIVE_MCB_ERROR'/);
  assert.match(propose, /subjective_preference_not_a_revision/);
  assert.deepEqual(C.SUPPORT_REMEDIES.filter((r) => r.objectiveOnly).map((r) => r.type), ["INTERNAL_CORRECTION", "REPRODUCTION_REQUIRED"]);
  assert.doesNotMatch(code(lib), /REOPEN|START_CREATIVE|creative_jobs SET|UPDATE order_production/, "no creative work starts from a support case");
  for (const file of ["public/api/lib/customer-care.php", "src/pages/order/SupportSection.tsx", "src/pages/CustomerCare.tsx", "src/pages/customer-care/CaseView.tsx"]) {
    assert.doesNotMatch(code(read(file)), /REQUEST_APPROVAL|approve your|customer approval|revision round|sign[- ]off/i, file);
  }
});

test("money waits for Bella or Lewis; no refund, payout or purchase API exists", () => {
  assert.ok(C.SUPPORT_REMEDIES.find((r) => r.type === "REFUND_REVIEW_REQUIRED").founder);
  assert.equal(C.SUPPORT_REMEDIES.find((r) => r.type === "REPLACEMENT_REQUIRED").costsMcb, "YES");
  assert.match(lib, /\$status = \$policy\['founder'\] \|\| \$costs !== 'NO' \? 'FOUNDER_APPROVAL_REQUIRED' : 'PROPOSED'/);
  assert.match(lib, /check_founder_authorisation_request\(\$orderForCode, \$in, \$staff,/);
  assert.deepEqual([...C.REFUND_REVIEW_STATUSES], ["REFUND_REVIEW_REQUIRED", "FOUNDER_DECISION_REQUIRED", "AUTHORISED", "DECLINED", "RECORDED"]);
  for (const file of ["public/api/lib/customer-care.php", "public/api/crm/support.php", "public/api/order-support.php", "public/api/order-support-case.php"]) {
    assert.doesNotMatch(code(read(file)), /curl_init|stripe_request|\/v1\/refunds|\/v1\/payouts|\/v1\/transfers|supplier_orders \(|INSERT INTO supplier_orders|api\.mozart/i, file);
  }
  // A partial refund never marks the whole order refunded.
  assert.doesNotMatch(code(lib), /UPDATE orders SET status/);
  const revenue = phpFunction(read("public/api/lib/command-centre.php"), "cc_revenue");
  assert.match(revenue, /partial_refunds_minor/);
  assert.match(revenue, /refund_reviews rr/);
});

test("the Command Centre keeps founder decisions apart from ordinary support work", () => {
  const cc = read("public/api/lib/command-centre.php");
  assert.match(phpFunction(cc, "cc_approvals"), /care_founder_decisions\(\$pdo\)/);
  const attention = phpFunction(cc, "cc_attention");
  assert.match(attention, /Ordinary support work is attention, never approval/);
  assert.match(attention, /'open' => 'care'/);
  assert.match(phpFunction(cc, "cc_health"), /CARE_HEALTH_LABELS/);
  for (const check of ["CUSTOMER_MESSAGE_WITHOUT_RESPONSE", "URGENT_CASE_NOT_REVIEWED", "WAITING_ON_MCB_BEYOND_TARGET", "REPLACEMENT_APPROVED_NOT_ACTIONED", "REFUND_AUTHORISED_NOT_RECORDED", "RESOLVED_WITH_BLOCKING_EXCEPTION", "PRIVACY_REVIEW_UNRESOLVED"]) {
    assert.match(phpFunction(lib, "care_health"), new RegExp(check), check);
  }
});

test("privacy: evidence stays private, message content never reaches analytics; the console is private", () => {
  for (const file of ["src/pages/order/SupportSection.tsx", "src/pages/CustomerCare.tsx", "src/pages/customer-care/CaseView.tsx", "src/lib/customerOrder.ts"]) {
    const text = code(read(file));
    assert.doesNotMatch(text, /trackFunnel|trackEvent|gtag|dataLayer/, `${file}: no analytics`);
    assert.doesNotMatch(text, /localStorage|sessionStorage|document\.cookie/, `${file}: nothing stored in the browser`);
  }
  assert.ok(isPrivateAnalyticsPath("/operations/customer-care"), "no analytics on the console");
  assert.match(read("public/robots.txt"), /Disallow: \/operations\n/);
  assert.match(read("src/App.tsx"), /<Route path="\/operations\/customer-care" element=\{<CustomerCare \/>\} \/>/);
  assert.match(read("src/pages/CustomerCare.tsx"), /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(read("public/api/crm/support.php"), /require_crm_key\(\);[\s\S]*X-Robots-Tag: noindex, nofollow/);
  assert.match(read("public/api/order-support-case.php"), /require_same_origin\(\);[\s\S]*enforce_scoped_rate_limit/);
  assert.match(phpFunction(lib, "care_staff_case"), /SUPPORT\.CASE_VIEWED/, "case access is audited");
});

test("retention is not invented: everything waits for legal review", () => {
  assert.deepEqual(Object.values(C.SUPPORT_RETENTION), ["LEGAL_REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED"]);
  assert.match(read("docs/DATA-RETENTION-ARCHITECTURE.md"), /Customer care/);
});

test("video remedies never take another customer's capacity; allowance use stays unverified", () => {
  assert.deepEqual([...C.SUPPORT_VIDEO_CAPACITY_BASES], ["ORIGINAL_VIDEO_CAPACITY", "REWORK_ATTEMPT", "REPLACEMENT_VIDEO"]);
  const rework = phpFunction(lib, "care_start_video_rework");
  assert.doesNotMatch(rework, /video_capacity_reservations|video_hold|video_confirm/, "the reservation is never touched");
  assert.match(rework, /PENDING_EXTERNAL_VERIFICATION/);
});

test("console helpers: deep links choose what to show; amounts are parsed strictly", () => {
  assert.deepEqual(L.parseCareLink("#case=12"), { filter: "needs_mcb", caseId: 12, view: "cases" });
  assert.deepEqual(L.parseCareLink("#filter=urgent"), { filter: "urgent", caseId: null, view: "cases" });
  assert.deepEqual(L.parseCareLink("#filter=drop%20table&case=abc"), { filter: "needs_mcb", caseId: null, view: "cases" });
  assert.equal(L.careLink({ caseId: 7 }), "#case=7");
  assert.equal(L.poundsToMinor("£12.34"), 1234);
  assert.equal(L.poundsToMinor("20"), 2000);
  assert.equal(L.poundsToMinor("0"), null);
  assert.equal(L.poundsToMinor("12.345"), null);
  assert.equal(L.poundsToMinor("-5"), null);
});

test("the Command Centre never renders one view with another view's data (found in the browser rehearsal)", () => {
  const page = read("src/pages/CommandCentre.tsx");
  for (const key of ["pending", "customers", "health", "orders", "notifications", "summary"]) {
    assert.match(page, new RegExp(`!data\\?\\.${key} \\? <p role="status">Loading…</p>`), key);
  }
});
