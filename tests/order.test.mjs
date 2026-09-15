/**
 * The order the browser sends, the server it asks, and what never leaves it.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const load = async (path) => {
  const { outputFiles } = buildSync({ entryPoints: [join(root, path)], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
};
const read = (path) => readFileSync(join(root, path), "utf8");
const P = await load("src/lib/personalisation.ts");
const R = await load("src/lib/orderRequest.ts");
const A = await load("src/lib/orderApi.ts");
const C = await load("src/data/countries.ts");
const { INITIAL_CONSENT_STATE } = await load("src/data/legal/index.ts");

const CONTACT = {
  firstName: " Ada ", lastName: "Lovelace", email: "ada@example.com", phone: "",
  shippingName: "Ada Lovelace", shippingAddress: "1 Harbour Row", shippingAddress2: "", shippingCity: "Southampton",
  shippingState: "", shippingPostcode: "SO14 2AA", shippingCountry: "GB",
};
const consents = Object.fromEntries(Object.keys(INITIAL_CONSENT_STATE).map((id) => [id, true]));
const MONEY = /price|minor|amount|total|currency|unit_amount|delivery_?(minor|cost)/i;

test("the order request names what is bought and how it is personalised — never a price", () => {
  let draft = P.chooseVariant(P.emptyDraft(), "moment");
  draft = P.updateMemory(draft, "unit-1-memory-1", { story: "The night on deck", style: "Jazz" });
  const body = R.buildOrderRequest(draft, CONTACT, consents, new Set(), false);
  assert.deepEqual(body.lines, [{ sku: "moment", quantity: 1 }]);
  assert.equal(body.personalisation.units[0].memories[0].story, "The night on deck");
  assert.equal(body.firstName, "Ada", "trimmed");
  assert.ok(!Object.keys(body).some((key) => MONEY.test(key)), "no money fields at the top level");
  assert.ok(!MONEY.test(JSON.stringify(body)), "and none anywhere inside");
  assert.ok(!("shippingAddress" in body), "a digital Moment sends no address");
  assert.ok(!("whatsapp" in body), "an empty phone is not sent");
});

test("a physical order sends the ISO country code delivery is quoted on", () => {
  const draft = P.chooseVariant(P.emptyDraft(), "keepsake-7-picture-disc");
  const body = R.buildOrderRequest(draft, CONTACT, consents, new Set(), true);
  assert.equal(body.shippingCountryCode, "GB");
  assert.ok(!("shippingCountry" in body), "not a free-text country");
  assert.equal(R.requestFingerprint({ b: 1, a: [{ y: 2, x: 1 }] }), R.requestFingerprint({ a: [{ x: 1, y: 2 }], b: 1 }), "fingerprint ignores key order");
});

test("the country list is ISO codes, shared with the server", () => {
  const codes = C.COUNTRIES.map((c) => c.code);
  assert.equal(new Set(codes).size, codes.length);
  assert.ok(codes.every((code) => /^[A-Z]{2}$/.test(code)));
  for (const code of ["GB", "US", "IE", "AU", "CA"]) assert.ok(codes.includes(code), code);
  const server = JSON.parse(read("public/api/data/personalisation.json"));
  assert.deepEqual(Object.keys(server.countries).sort(), [...codes].sort());
  assert.equal(server.limits.story_max, P.STORY_MAX, "the server enforces the same 300-character limit");
});

/* ---- The server conversation, with fetch and storage stood in ---------- */

const withFetch = async (responder, run) => {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    const reply = await responder(url, init);
    if (reply instanceof Error) throw reply;
    return { status: reply.status ?? 200, json: async () => reply.body };
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = original;
  }
};

test("payment is open only when the server says exactly so", async () => {
  const cases = [
    [{ body: { online_checkout: true, mode: "test" } }, { onlineCheckout: true, mode: "test" }],
    [{ body: { online_checkout: false, mode: null } }, { onlineCheckout: false, mode: null }],
    [{ body: { online_checkout: "true", mode: "live" } }, { onlineCheckout: false, mode: null }],
    [{ status: 503, body: { online_checkout: true } }, { onlineCheckout: false, mode: null }],
    [{ body: "<html>proxy</html>" }, { onlineCheckout: false, mode: null }],
    [new Error("offline"), { onlineCheckout: false, mode: null }],
  ];
  for (const [reply, expected] of cases) {
    await withFetch(() => reply, async (calls) => {
      assert.deepEqual(await A.fetchCheckoutStatus(), expected);
      assert.equal(calls[0].url, "/api/checkout/status");
    });
  }
});

test("checkout is started with the saved order's id and token and nothing else", async () => {
  const order = { orderId: 41, checkoutToken: "a".repeat(64) };
  await withFetch(() => ({ body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } }), async (calls) => {
    const result = await A.createCheckoutSession(order);
    assert.equal(result.ok, true);
    assert.deepEqual(JSON.parse(calls[0].init.body), { orderId: 41, checkoutToken: "a".repeat(64) });
  });
  await withFetch(() => ({ body: { id: "cs_x", url: "http://evil.example/pay" } }), async () => {
    assert.equal((await A.createCheckoutSession(order)).ok, false, "a non-https redirect is never followed");
  });
});

test("saving an order sends its Idempotency-Key, and field errors come back in plain words", async () => {
  await withFetch(() => ({ status: 422, body: { error: "validation_failed", message: "Please check the highlighted fields.", fields: { "personalisation.units.0.memories.0.story": "Please keep your memory to 300 characters." } } }), async (calls) => {
    const result = await A.submitOrder({ lines: [] }, "mcb-key-000000000000000000");
    assert.equal(calls[0].init.headers["Idempotency-Key"], "mcb-key-000000000000000000");
    assert.equal(result.ok, false);
    assert.equal(result.kind, "invalid");
    assert.equal(result.fields["personalisation.units.0.memories.0.story"], "Please keep your memory to 300 characters.");
  });
  assert.match(A.newIdempotencyKey(), /^mcb-[a-f0-9]{48}$/);
  assert.notEqual(A.newIdempotencyKey(), A.newIdempotencyKey());
});

test("a photo is uploaded under a neutral name, not the customer's file name", async () => {
  await withFetch(() => ({ status: 201, body: { missing_uploads: [], checkout_blocker: null } }), async (calls) => {
    const file = new File(["img"], "Our holiday — Mum & Dad.jpg", { type: "image/jpeg" });
    await A.uploadPhoto({ orderId: 7, checkoutToken: "b".repeat(64) }, "memory:1:1", file);
    const form = calls[0].init.body;
    assert.equal(form.get("slot"), "memory:1:1");
    assert.equal(form.get("photo").name, "photo");
  });
});

test("only the order id and token are remembered, for this tab, to resume a cancelled payment", () => {
  const store = new Map();
  globalThis.sessionStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  A.rememberSavedOrder({ orderId: 9, checkoutToken: "c".repeat(64), totalMinor: 1500, email: "x@example.com" });
  assert.deepEqual(JSON.parse(store.get(A.SAVED_ORDER_KEY)), { orderId: 9, checkoutToken: "c".repeat(64) });
  assert.deepEqual(A.recallSavedOrder(), { orderId: 9, checkoutToken: "c".repeat(64) });
  store.set(A.SAVED_ORDER_KEY, JSON.stringify({ orderId: 9, checkoutToken: "not-a-token" }));
  assert.equal(A.recallSavedOrder(), null, "anything malformed is not trusted");
  A.forgetSavedOrder();
  assert.equal(store.has(A.SAVED_ORDER_KEY), false);
  delete globalThis.sessionStorage;
});

/* ---- Static guarantees --------------------------------------------------- */

/** Every `track…(…)` call's argument text, found by balancing parentheses. */
const trackingCalls = (source) => {
  const calls = [];
  for (const match of source.matchAll(/\btrack[A-Za-z]*\(/g)) {
    let depth = 1;
    let i = match.index + match[0].length;
    for (; i < source.length && depth > 0; i++) {
      if (source[i] === "(") depth++;
      else if (source[i] === ")") depth--;
    }
    calls.push(source.slice(match.index + match[0].length, i - 1));
  }
  return calls;
};

const sourceFiles = (dir) => readdirSync(join(root, dir), { recursive: true }).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => join(dir, f));

test("the Review step's amounts are the server's, not the browser's arithmetic", () => {
  const review = read("src/pages/create/StepReview.tsx");
  assert.ok(!/preview\.(totalMinor|lines)/.test(review), "no browser preview totals on Review");
  assert.match(review, /quote\.quote\.totalMinor/);
  assert.match(review, /quote\.quote\.delivery/);
  const page = read("src/pages/CreateMemory.tsx");
  assert.match(page, /step === "review" && quote\.state === "ready" \?[\s\S]*?formatMinor\(quote\.quote\.totalMinor\)/, "the order summary on Review shows the same server total");
});

test("analytics never receive what a customer typed", () => {
  const analytics = read("src/lib/analytics.ts");
  const params = analytics.slice(analytics.indexOf("export interface FunnelParams"), analytics.indexOf("export const trackFunnel"));
  const keys = [...params.matchAll(/^\s+(\w+)\?:/gm)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ["location", "memories", "product_id", "quantity", "sku", "step"]);
  for (const file of [...sourceFiles("src/pages/create"), "src/pages/CreateMemory.tsx", "src/pages/ThankYou.tsx"]) {
    const calls = trackingCalls(read(file)).join("\n");
    assert.ok(!/contact\.|\.story|\.about|songTitle|artist|heading|photos|email|shipping|firstName|lastName/.test(calls), `${file} sends no customer text to analytics`);
  }
  assert.match(read("src/pages/CreateMemory.tsx"), /trackFunnel\("checkout_begin"[\s\S]*?window\.location\.assign\(session\.url\)/, "checkout_begin only after the server created a session");
});

test("the Apollo website tracker and its identity-resolution script are gone", () => {
  const html = read("index.html");
  assert.ok(!/apollo|aplo-evnt|liadm|trackingFunctions/i.test(html));
  for (const file of sourceFiles("src")) assert.ok(!/apollo\.io|aplo-evnt|liadm/i.test(read(file)), file);
  // Sprint 6: no inline executable script at all (CSP); GA is bootstrapped by
  // /analytics-init.js, which loads nothing but Google's gtag.js.
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.deepEqual(inline, [], "no inline executable script");
  const external = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(external.filter((src) => !src.startsWith("/src/")), ["/analytics-init.js"]);
  const init = read("public/analytics-init.js");
  assert.deepEqual([...init.matchAll(/https:\/\/[a-z.]+/g)].map((m) => m[0]), ["https://www.googletagmanager.com"], "no third-party script but Google Analytics");
  assert.ok(!/apollo|liadm|liveintent/i.test(init));
});

test("after a verified payment the device forgets the order's words", () => {
  const thankYou = read("src/pages/ThankYou.tsx");
  assert.match(thankYou, /if \(data\.status === "PAID"\) \{[\s\S]*?localStorage\.removeItem\(DRAFT_STORAGE_KEY\)[\s\S]*?sessionStorage\.removeItem\(SAVED_ORDER_KEY\)/);
  assert.ok(!existsSync(join(root, "src/lib/checkoutSession.ts")));
});

/* ---- Sprint 4.2 closure ---------------------------------------------------- */

test("the retired sandbox webhook cannot come back", () => {
  assert.ok(!existsSync(join(root, "public/api/stripe/webhook-test.php")));
  assert.ok(existsSync(join(root, "public/api/stripe/webhook.php")), "the real handler remains");
  const files = readdirSync(join(root, "public/api"), { recursive: true }).filter((f) => f.endsWith(".php"));
  for (const file of files) {
    const code = read(join("public/api", file));
    assert.ok(!/webhook_secret_test/.test(code), `${file} reads no sandbox webhook secret`);
    assert.ok(!/(require|include)(_once)?[^;]*webhook-test/.test(code), `${file} includes no sandbox webhook`);
  }
  assert.match(read("public/api/crm/preflight.php"), /legacy_webhook_copy_absent/, "deployment preflight FAILs if the file reappears on a server");
});

test("photo storage never falls back into the web root", () => {
  const uploads = read("public/api/lib/uploads.php");
  assert.ok(!/storage\/uploads/.test(uploads), "no api/storage/uploads fallback");
  assert.match(uploads, /path_is_inside_web_root/);
  assert.ok(!existsSync(join(root, "public/api/storage")), "no storage directory ships under api/");
  assert.match(read("public/api/order-upload.php"), /We couldn't securely save your photo\. Please try again shortly\./);
  assert.match(read("public/api/lib/stripe.php"), /private_storage_missing/, "live checkout waits for private storage");
  assert.match(read("docs/DEPLOYMENT-PREFLIGHT.md"), /mcb-uploads/);
});

test("the thank-you page promises no timeline for made-to-order records", () => {
  const page = read("src/pages/ThankYou.tsx");
  const steps = page.slice(page.indexOf("const nextSteps"), page.indexOf("/**\n * COLOUR CONTRACT"));
  assert.ok(!/within 24 hours|begins within/.test(page.replace(/\{\/\*[\s\S]*?\*\/\}/g, "")), "the universal 24-hour line is gone");
  const branch = (id) => steps.slice(steps.indexOf(`products.has("${id}")`), steps.indexOf("}", steps.indexOf(`products.has("${id}")`)));
  for (const id of ["keepsake", "journey"]) {
    assert.ok(!/\d|hour|day|week|month|dispatch|deliver/i.test(branch(id)), `${id}: no timeline or dispatch promise`);
  }
  assert.ok(!/\d|hour|minute/.test(branch("moment")), "a Moment promises no number of minutes or hours");
  assert.match(branch("moment"), /quality check[\s\S]*reveal/, "a Moment is revealed once quality-checked");
  assert.match(steps, /products\.has\("journey"\)[\s\S]*arrive as the reveal/);
  assert.ok(!/approv|refine|revision|draft/i.test(steps), "no approval step is described");
});

test("the privacy inventory matches the code: private photo storage, no Cloudinary, Apollo stays removed", () => {
  const privacy = read("src/data/legal/privacy.ts");
  assert.ok(!/Cloudinary/.test(privacy));
  assert.match(privacy, /private storage outside the public website/);
  assert.match(privacy, /key: "mcb_saved_order_v1"/);
  const review = read("src/data/legal/review.ts");
  assert.match(review, /Apollo website tracker remains removed/);
  assert.match(review, /retention and deletion period[\s\S]*none has been decided/, "no retention period is invented");
});

test("Stripe Checkout Sessions keep Adaptive Pricing off, so payment is always the saved GBP amount", () => {
  assert.match(read("public/api/checkout/session.php"), /'adaptive_pricing'\s*=>\s*\['enabled' => false\]/);
  assert.match(read("public/api/stripe/webhook.php"), /CURRENCY_MISMATCH/);
});
