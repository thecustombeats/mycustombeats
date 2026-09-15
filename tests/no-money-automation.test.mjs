/**
 * MCB™ PERMANENT RELEASE-SAFETY GUARD — MONEY NEVER LEAVES MCB AUTOMATICALLY.
 * (16 September 2026. Run: npm test. Do not weaken or delete.)
 *
 * Executive authority: any outgoing financial action — supplier purchase,
 * replacement purchase, refund, partial refund, subscription, paid API call,
 * customer compensation payment, credit with monetary value, transfer or other
 * financial commitment — needs explicit approval from BELLA or LEWIS.
 * Automation may observe, calculate, recommend, prepare, queue, validate and
 * notify. It may not execute outgoing money. No threshold, recommendation,
 * workflow state or customer-care resolution may override this.
 *
 * This test reads the server source and proves:
 *   1. every outbound network call in the codebase is one of a small, reviewed
 *      set, and none of them can move money out of MCB;
 *   2. no code path exists for actions MCB has not implemented (payment-provider
 *      refunds, payouts, transfers, subscriptions, credits, partner checkouts,
 *      paid model or music-platform calls);
 *   3. every action that records a financial decision (supplier purchase,
 *      replacement or reproduction remedy, refund decision, founder-only
 *      fulfilment resolutions) passes the founder-code boundary first, and
 *      nothing else writes those decisions;
 *   4. automation entry points (webhooks, workers, lifecycle runs, routing,
 *      business intelligence, notifications) never reach those decisions;
 *   5. a route recommendation, a deep link or an alert never authorises spend;
 *   6. every HTTP endpoint is in a reviewed register with its access class, so a
 *      new endpoint fails this test until someone reviews it;
 *   7. every staff action whose name touches money is reviewed and, where it
 *      decides money, sits behind the founder code;
 *   8. failure recovery can only retry idempotent, non-financial work.
 *
 * REVIEWED OUTBOUND ALLOWLIST (see REVIEWED_OUTBOUND below): Stripe Checkout
 * Sessions (money IN only), the configured transactional email service, MCB's own
 * signed operations webhook, and free public exchange-rate data. Nothing else.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
/** PHP/TS source without comments (comments may explain what must never happen). */
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|#).*$/gm, "").replace(/([^:'"])\/\/[^\n'"]*$/gm, "$1");
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
});
// Local test artefacts (the harness's stubs and config) are never committed.
const php = walk("public/api").filter((f) => f.endsWith(".php") && !/\/_test-|\/config\.php$/.test(f));
const src = Object.fromEntries(php.map((f) => [f, code(read(f))]));
const phpFunction = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf("\n}\n", start));
};

/** Every outbound call MCB makes, reviewed. None moves money out of MCB. */
const REVIEWED_OUTBOUND = {
  "public/api/lib/stripe.php": "INCOMING PAYMENT: creates a Checkout Session so a customer can pay MCB (never a refund, payout or transfer)",
  "public/api/lib/notify.php": "MESSAGING: transactional email through the already-configured email service",
  "public/api/lib/lifecycle-messages.php": "MESSAGING: customer lifecycle email through the same email service",
  "public/api/lib/lifecycle.php": "MESSAGING: customer lifecycle email through the same email service",
  "public/api/lib/ops.php": "NOTIFY: MCB's own signed operations webhook (payment received), configured by the Founders",
  "public/api/fx/rates.php": "OBSERVE: free public exchange-rate reference data, no key, no account",
};
const OUTBOUND = /\bcurl_init\s*\(|\bfsockopen\s*\(|\bstream_socket_client\s*\(|file_get_contents\s*\(\s*['"]https?:|fopen\s*\(\s*['"]https?:|\bget_headers\s*\(|new\s+\\?GuzzleHttp|\bSoapClient\b/;

test("1. every outbound network call is in the reviewed set", () => {
  const found = php.filter((f) => OUTBOUND.test(src[f])).map((f) => relative(root, join(root, f)));
  assert.deepEqual(found.sort(), Object.keys(REVIEWED_OUTBOUND).sort(), `unreviewed outbound call(s): ${found.filter((f) => !REVIEWED_OUTBOUND[f]).join(", ")}`);
});

test("1b. the payment provider is only ever asked to take a customer's payment", () => {
  const stripe = src["public/api/lib/stripe.php"];
  const endpoints = [...stripe.matchAll(/stripe_api_base\(\)\s*\.\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(endpoints.length > 0);
  for (const e of endpoints) assert.match(e, /^\/checkout\/sessions(\/|$)/, e);
  // No money-moving provider resource is named anywhere in the server.
  const moneyOut = /\/v1\/(refunds|payouts|transfers|subscriptions|invoices|credit_notes|topups|charges|payment_intents\/[^'"]*\/capture|customers\/[^'"]*\/balance_transactions|issuing|treasury)|\b(refunds|payouts|transfers|subscriptions)->create\b|\\?Stripe\\(Refund|Payout|Transfer|Subscription)\b/i;
  for (const f of php) assert.doesNotMatch(src[f], moneyOut, f);
});

test("1c. the messaging and reference-data calls cannot carry a payment instruction", () => {
  for (const f of ["public/api/lib/notify.php", "public/api/lib/lifecycle-messages.php", "public/api/lib/lifecycle.php", "public/api/lib/ops.php", "public/api/fx/rates.php"]) {
    assert.doesNotMatch(src[f], /stripe_api_base|api\.stripe\.com|\/v1\/(refunds|payouts|transfers|charges)/i, f);
  }
  assert.match(src["public/api/fx/rates.php"], /api\.frankfurter\.dev/);
});

test("2. no execution path exists for money actions MCB has not implemented", () => {
  const unimplemented = /function\s+\w*(issue_refund|execute_refund|process_refund|create_refund|send_payout|create_payout|create_transfer|transfer_funds|create_subscription|start_subscription|issue_credit|grant_credit|store_credit|compensation_payment|pay_compensation|place_supplier_order|supplier_checkout|marketplace_checkout|auto_purchase|purchase_automatically|buy_from_supplier)\w*\s*\(/i;
  for (const f of php) assert.doesNotMatch(src[f], unimplemented, f);
  // No partner, marketplace, courier, model or music-platform API is called or configured.
  const paidProviders = /api\.(openai|anthropic|mozart|suno|udio|elevenlabs|replicate)|amazon\.[a-z.]+\/(gp|api)|walmart\.(com|ca)\/api|ubuy\.[a-z.]+\/api|mws\.amazonservices|sellingpartnerapi|api\.(royalmail|dhl|fedex|ups|easypost|shippo)/i;
  for (const f of php) assert.doesNotMatch(src[f], paidProviders, f);
  // No database column or table holds a stored credit, wallet or payout.
  const schema = read("db/schema.sql");
  assert.doesNotMatch(schema, /CREATE TABLE IF NOT EXISTS \w*(wallet|payout|transfer|store_credit|credit_balance|subscription)\w*/i);
});

test("3a. a supplier purchase is authorised in exactly one place, behind a founder's own code", () => {
  const writers = php.filter((f) => /supplier_purchase_authorised_by\s*=\s*:founder/.test(src[f]));
  assert.deepEqual(writers, ["public/api/lib/operations.php"]);
  const ops = src["public/api/lib/operations.php"];
  const perform = phpFunction(ops, "perform_staff_action");
  assert.match(perform, /\$founder = \$action === 'AUTHORISE_SUPPLIER_PURCHASE' \? check_founder_authorisation_request\(\$orderId, \$in, \$staff\) : null;/);
  // The authorisation writes the founder returned by that check, never a value from the request.
  assert.match(ops, /supplier_purchase_authorised_by = :founder, supplier_purchase_authorised_at = UTC_TIMESTAMP\(\)', \[':founder' => \$founder\]/);
  // The founder check verifies a hashed personal code and audits a refusal.
  const check = phpFunction(ops, "check_founder_authorisation_request");
  assert.match(check, /password_verify|founder_code_valid|verify_founder/);
  // Recording a partner order needs that authorisation first, and nothing here checks out or pays.
  const controller = src["public/api/lib/fulfilment-controller.php"];
  assert.match(phpFunction(controller, "record_supplier_order"), /supplier_purchase_authorised_at'\] === null[\s\S]*founder_authorisation_required/);
});

test("3b. replacement remedies and refund decisions are the Founders' alone, and never executed", () => {
  const care = src["public/api/lib/customer-care.php"];
  const action = phpFunction(care, "care_staff_action");
  assert.match(action, /in_array\(\$action, \['DECIDE_REMEDY', 'DECIDE_REFUND'\], true\)/);
  assert.match(action, /check_founder_authorisation_request\(\$orderForCode, \$in, \$staff/);
  // AUTHORISED is written only by the founder decisions, with the founder from the check.
  const remedyWrites = [...care.matchAll(/'AUTHORISED' : 'DECLINED', 'authorised_by' => \$founder/g)];
  assert.equal(remedyWrites.length, 1);
  assert.match(phpFunction(care, "care_move_remedy"), /case 'DECIDE_REMEDY':[\s\S]*'purchased' => false/);
  const refund = phpFunction(care, "care_refund_action");
  assert.match(refund, /'refund_executed' => false/);
  assert.doesNotMatch(refund, /stripe|curl_|refunds->|\/v1\//i);
  // Recording a refund only stores what a person already did with the payment provider (its reference), after a founder's decision.
  assert.match(refund, /UPDATE refund_reviews SET status = 'RECORDED'[^"]*external_reference = :ref/);
  // Founder-only fulfilment resolutions (refund to be handled, substitution, proceed at paid price) need the code too.
  assert.match(src["public/api/lib/operations.php"], /RESOLVE_FULFILMENT_EXCEPTION' && in_array\(\$in\['resolution'\] \?\? null, fulfilment_data\(\)\['founder_only_resolutions'\], true\)\)\s*\{\s*\$founder = check_founder_authorisation_request/);
});

test("4. automation entry points never reach a financial decision", () => {
  const decisions = /AUTHORISE_SUPPLIER_PURCHASE|DECIDE_REMEDY|DECIDE_REFUND|RECORD_REFUND|record_supplier_order\s*\(|care_refund_action\s*\(|care_move_remedy\s*\(|perform_staff_action\s*\(|care_staff_action\s*\(/;
  const automation = [
    "public/api/stripe/webhook.php",
    "public/api/lib/routing.php", "public/api/lib/business.php", "public/api/crm/business.php", "public/api/crm/suppliers.php",
    "public/api/lib/lifecycle.php", "public/api/lib/lifecycle-messages.php", "public/api/lib/notify.php", "public/api/crm/notifications.php",
    "public/api/lib/sales-suspension.php", "public/api/lib/delivery.php", "public/api/lib/command-centre.php", "public/api/crm/command-centre.php",
    "public/api/lib/video.php", "public/api/crm/automation-events.php", "public/api/crm/reconcile.php",
    "public/api/lib/resilience.php", "public/api/crm/system.php", "public/api/crm/preflight.php",
  ].filter((f) => src[f] !== undefined);
  assert.ok(automation.length >= 12, automation.join(","));
  for (const f of automation) assert.doesNotMatch(src[f], decisions, f);
  // Only the two staff endpoints dispatch staff actions, each behind the CRM key and a named person.
  const dispatchers = php.filter((f) => /perform_staff_action\s*\(|care_staff_action\s*\(/.test(src[f]) && !/function (perform_staff_action|care_staff_action)\s*\(/.test(src[f]));
  assert.deepEqual(dispatchers.sort(), ["public/api/crm/order-action.php", "public/api/crm/support.php"]);
  for (const f of dispatchers) assert.match(src[f], /require_crm_key\(\)/, f);
  // Commercial safety and suspension never cancel, refund, re-price or purchase a paid order.
  const safety = phpFunction(src["public/api/lib/fulfilment-controller.php"], "fulfilment_check_commercials");
  assert.doesNotMatch(safety, /UPDATE orders|status = 'CANCELLED'|REFUND|total_minor\s*=|supplier_purchase_authorised/);
  assert.doesNotMatch(src["public/api/lib/sales-suspension.php"], /UPDATE orders|refund|supplier_orders/i);
});

test("5. a recommendation, a deep link or an alert never authorises spend", () => {
  const routing = src["public/api/lib/routing.php"];
  assert.match(routing, /'authorises_purchase' => false,\s*'places_order' => false/);
  assert.match(phpFunction(routing, "record_route_decision"), /'authorises_purchase' => false/);
  assert.doesNotMatch(routing, /supplier_purchase_authorised_(by|at)\s*=|UPDATE order_production|INSERT INTO supplier_orders|refund_reviews|support_remedies SET/);
  const suppliers = JSON.parse(read("public/api/data/suppliers.json"));
  for (const w of suppliers.forbidden_recommendation_phrases) assert.ok(!`${suppliers.recommendation_label} ${suppliers.recommendation_note}`.toLowerCase().includes(w));
  // Deep links only choose what to show.
  const cc = read("src/lib/commandCentre.ts");
  assert.doesNotMatch(cc.slice(cc.indexOf("export const OPEN_MODES"), cc.indexOf("\n", cc.indexOf("export const OPEN_MODES"))), /authoris|purchase|refund|pay/i);
  // Business alerts and recommendations change nothing.
  const biz = src["public/api/lib/business.php"];
  assert.doesNotMatch(phpFunction(biz, "biz_alerts"), /INSERT|UPDATE|DELETE/);
  assert.doesNotMatch(phpFunction(biz, "biz_recommendations"), /INSERT|UPDATE|DELETE/);
  // The Memory Music Video platform stays unintegrated: no call, credential or purchase.
  const video = JSON.parse(read("public/api/data/creative.json"));
  assert.notEqual(video.provider_integration_status, "INTEGRATED");
});

/**
 * Every HTTP endpoint, reviewed, with who may call it. A new endpoint must be added
 * here deliberately (and reviewed for money, isolation and privacy) or this fails.
 *   PUBLIC       no identity (rate limited where it writes)
 *   CUSTOMER     the customer's own checkout token or order link (one order only)
 *   STAFF        the CRM key and a named person
 *   WORKER       the notification bridge key (or the CRM key)
 *   WEBHOOK      Stripe's signed request (money IN only)
 */
const REVIEWED_ENDPOINTS = {
  "public/api/affiliate/click.php": "PUBLIC", "public/api/affiliate/dashboard.php": "PUBLIC", "public/api/affiliate/register.php": "PUBLIC",
  "public/api/checkout/session.php": "CUSTOMER", "public/api/checkout/status.php": "PUBLIC", "public/api/concierge/enquiry.php": "PUBLIC",
  "public/api/crm/artwork.php": "STAFF", "public/api/crm/automation-events.php": "STAFF", "public/api/crm/business.php": "STAFF", "public/api/crm/command-centre.php": "STAFF",
  "public/api/crm/concierge.php": "STAFF", "public/api/crm/creative-file.php": "STAFF", "public/api/crm/creative.php": "STAFF", "public/api/crm/customer.php": "STAFF",
  "public/api/crm/fulfilment.php": "STAFF", "public/api/crm/notifications.php": "WORKER", "public/api/crm/operations.php": "STAFF", "public/api/crm/order-action.php": "STAFF",
  "public/api/crm/order-personalisation.php": "STAFF", "public/api/crm/orders.php": "STAFF", "public/api/crm/preflight.php": "STAFF", "public/api/crm/product-sales.php": "STAFF",
  "public/api/crm/production-files.php": "STAFF", "public/api/crm/production.php": "STAFF", "public/api/crm/reconcile.php": "STAFF", "public/api/crm/review-request.php": "STAFF",
  "public/api/crm/suppliers.php": "STAFF", "public/api/crm/support.php": "STAFF", "public/api/crm/system.php": "STAFF", "public/api/crm/unreconciled.php": "STAFF",
  "public/api/crm/upload.php": "STAFF", "public/api/crm/video.php": "STAFF", "public/api/fx/rates.php": "PUBLIC", "public/api/live/enquiry.php": "PUBLIC",
  "public/api/order-approval.php": "PUBLIC", "public/api/order-evidence.php": "CUSTOMER", "public/api/order-progress.php": "CUSTOMER", "public/api/order-quote.php": "PUBLIC",
  "public/api/order-reference.php": "PUBLIC", "public/api/order-status.php": "CUSTOMER", "public/api/order-support-case.php": "CUSTOMER", "public/api/order-support.php": "CUSTOMER",
  "public/api/order-upload.php": "CUSTOMER", "public/api/order-video-media.php": "CUSTOMER", "public/api/order-video.php": "CUSTOMER", "public/api/order.php": "PUBLIC",
  "public/api/product-availability.php": "PUBLIC", "public/api/referral/check.php": "PUBLIC", "public/api/stripe/webhook.php": "WEBHOOK",
  "public/api/video-availability.php": "PUBLIC", "public/api/video-offer-event.php": "PUBLIC",
};

test("6. every HTTP endpoint is in the reviewed register, and its access class is enforced in the source", () => {
  // config.example.php is refused over HTTP by api/.htaccess (with config.php).
  const endpoints = php.filter((f) => !f.includes("/lib/") && !f.endsWith("/config.example.php")).sort();
  assert.deepEqual(endpoints, Object.keys(REVIEWED_ENDPOINTS).sort(), "a new or removed endpoint must be reviewed and registered here");
  for (const [f, cls] of Object.entries(REVIEWED_ENDPOINTS)) {
    const body = src[f];
    if (cls === "STAFF") assert.match(body, /require_crm_key\(\);/, f);
    if (cls === "WORKER") assert.match(body, /hash_equals\(\$workerKey, \$given\)[\s\S]*json_error\(401/, f);
    if (cls === "WEBHOOK") assert.match(body, /stripe_signature_valid\(/, f);
    if (cls === "CUSTOMER") assert.match(body, /find_access_token\(|find_order_by_token\(|checkoutToken/, f);
    if (cls === "PUBLIC" || cls === "CUSTOMER") assert.doesNotMatch(body, /perform_staff_action\(|care_staff_action\(|record_supplier_order\(|resilience_recover\(/, f);
  }
});

test("7. every staff action that touches money is reviewed; the ones that decide money need the founder code", () => {
  const ops = read("public/api/lib/operations.php");
  const care = read("public/api/lib/customer-care.php");
  const list = (source, name) => [...source.slice(source.indexOf(`const ${name} = [`), source.indexOf("];", source.indexOf(`const ${name} = [`))).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
  const actions = [...list(ops, "MCB_STAFF_ACTIONS"), ...list(care, "CARE_ACTIONS")];
  assert.ok(actions.length > 40);
  const MONEY_WORDS = /REFUND|PURCHASE|PAY|TRANSFER|CREDIT|SUBSCRI|COMPENSAT|REMEDY|SUPPLIER_ORDER/;
  const REVIEWED_MONEY_ACTIONS = {
    AUTHORISE_SUPPLIER_PURCHASE: "FOUNDER_CODE", RECORD_SUPPLIER_ORDER: "RECORDS_A_PURCHASE_A_PERSON_MADE_AFTER_AUTHORISATION",
    PROPOSE_REMEDY: "RECORD_ONLY", DECIDE_REMEDY: "FOUNDER_CODE", START_REMEDY: "RECORD_ONLY", COMPLETE_REMEDY: "RECORD_ONLY", CANCEL_REMEDY: "RECORD_ONLY",
    REQUEST_REFUND_REVIEW: "RECORD_ONLY", SUBMIT_REFUND_FOR_DECISION: "RECORD_ONLY", DECIDE_REFUND: "FOUNDER_CODE", RECORD_REFUND: "RECORDS_A_REFUND_A_PERSON_MADE_AFTER_DECISION",
  };
  assert.deepEqual(actions.filter((a) => MONEY_WORDS.test(a)).sort(), Object.keys(REVIEWED_MONEY_ACTIONS).sort(), "a new money-related action must be reviewed here");
  assert.match(phpFunction(src["public/api/lib/customer-care.php"], "care_staff_action"), /in_array\(\$action, \['DECIDE_REMEDY', 'DECIDE_REFUND'\], true\)/);
  assert.match(phpFunction(src["public/api/lib/fulfilment-controller.php"], "record_supplier_order"), /founder_authorisation_required/);
  assert.match(care, /case 'RECORD_REFUND':[\s\S]*?status'\] !== 'AUTHORISED'|RECORD_REFUND[\s\S]{0,600}AUTHORISED/);
});

test("8. failure recovery only retries idempotent, non-financial work", () => {
  const res = src["public/api/lib/resilience.php"];
  const recover = phpFunction(res, "resilience_recover");
  const cases = [...recover.matchAll(/case '([A-Z_]+)':/g)].map((m) => m[1]).sort();
  assert.deepEqual(cases, ["PREPARE_LIFECYCLE_HOOKS", "RECORD_PROCESSING_EVENT", "RETRY_CUSTOMER_EMAIL", "RETRY_FOUNDER_NOTIFICATION", "RETRY_PAYMENT_CONFIRMATION"]);
  assert.doesNotMatch(recover, /supplier_purchase_authorised|record_supplier_order|refund_reviews|support_remedies|stripe|curl_/i);
  assert.match(recover, /default:\s*throw new OperationsException\('no_automatic_recovery'/);
  for (const work of ["SUPPLIER_PURCHASE_AUTHORISATION", "SUPPLIER_PURCHASE", "REPLACEMENT_PURCHASE", "REFUND"]) {
    assert.match(res, new RegExp(`'${work}' => \\[[^\\]]*'retry' => 'DO_NOT_AUTO_RETRY'`), work);
  }
  // An interrupted email is never re-sent blindly.
  assert.match(recover, /status'\] !== 'FAILED'[\s\S]*not_retryable/);
});
