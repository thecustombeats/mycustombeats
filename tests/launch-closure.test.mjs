/**
 * Launch closure patch (15 September 2026) — the current commercial
 * catalogue, private fulfilment internals, the Founder-approved delivery and
 * damage wording, and the corrected Terms/Refunds contradictions.
 * Run: npm test
 *
 * Server delivery behaviour (classes, "MCB confirms", fulfilment review) is
 * proven against PHP in tests/delivery-acceptance.sh.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

const load = async (path) => {
  const { outputFiles } = buildSync({ entryPoints: [join(root, path)], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
};

const catalogue = await load("src/data/catalogue/index.ts");
const legal = await load("src/data/legal/index.ts");

const walk = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });

test("vinyl catalogue matches the Founders' current prices and song capacities exactly", () => {
  const vinyl = catalogue.PRODUCTS.filter((p) => p.id === "keepsake" || p.id === "journey").flatMap((p) =>
    p.variants.map((v) => [v.sku, v.songCount, v.price.minor, v.vinyl?.pictureDisc, v.vinyl?.discCount, v.vinyl?.gatefold])
  );
  assert.deepEqual(vinyl, [
    ["keepsake-12-picture-disc", 4, 14999, true, 1, false],
    ["keepsake-10-picture-disc", 3, 13999, true, 1, false],
    ["keepsake-10-heart-picture-disc", 1, 12999, true, 1, false],
    ["keepsake-7-picture-disc", 1, 9900, true, 1, false],
    ["journey-6", 6, 19900, false, 1, false],
    ["journey-12", 12, 34900, false, 2, true],
  ]);
  const server = JSON.parse(read("public/api/data/catalogue.json"));
  const feed = JSON.parse(read("public/catalogue.json"));
  assert.equal(server.skus["keepsake-10-heart-picture-disc"].price_minor, 12999);
  const heart = feed.products.find((p) => p.id === "keepsake").variants.find((v) => v.sku === "keepsake-10-heart-picture-disc");
  assert.equal(heart.price.amount, "129.99");
  assert.ok(!JSON.stringify(feed).includes("119.99") && !read("public/api/data/catalogue.json").includes("11999"));
});

test("every physical product has a delivery class; the class never reaches the public feed", () => {
  for (const product of catalogue.PRODUCTS) {
    const physical = product.variants.some((v) => v.fulfilment === "PHYSICAL");
    assert.equal(product.deliveryClass !== null, physical, product.id);
  }
  const byId = Object.fromEntries(catalogue.PRODUCTS.map((p) => [p.id, p.deliveryClass]));
  assert.deepEqual(
    [byId.keepsake, byId.journey, byId["lyrics-frame"], byId["personalised-music-plaque"], byId["antique-brass-gramophone"], byId.moment],
    ["VINYL", "VINYL", "FRAME", "PLAQUE", "PLAYER", null]
  );
  const server = JSON.parse(read("public/api/data/catalogue.json"));
  assert.equal(server.skus["antique-brass-gramophone"].delivery_class, "PLAYER");
  const feedText = read("public/catalogue.json");
  assert.ok(!/delivery_class|LISTING_DEPENDENT|MANUAL_REVIEW|DESTINATION_CALCULATED/.test(feedText));
  assert.equal(catalogue.validateCatalogue(catalogue.PRODUCTS.map((p) => (p.id === "journey" ? { ...p, deliveryClass: null } : p))).some((e) => e.includes("delivery class")), true);
});

test("supplier identities, pricing states and internal shipping allowances stay out of anything a browser loads", () => {
  const browserFiles = [...walk("src"), "index.html", "public/catalogue.json", "public/robots.txt", "public/sitemap.xml"].filter((f) => /\.(tsx?|json|html|txt|xml)$/.test(f));
  const suppliers = /prodigi|kunaki|elasticstage|cutsy|vinylart|vinyl village|desertcart|ubuy|walmart|not just a print|etsy/i;
  // Comments never reach the bundle; they may explain what must stay out.
  const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const file of browserFiles) {
    const text = code(read(file));
    assert.ok(!suppliers.test(text), `supplier name in ${file}`);
    assert.ok(!/LISTING_DEPENDENT|MANUAL_REVIEW|DESTINATION_CALCULATED|confirm_availability/.test(text), `internal delivery state in ${file}`);
    assert.ok(!/shipping allowance|supplier cost|supplier price|purchase price|profit margin|our margin/i.test(text), `internal commercial wording in ${file}`);
  }
  // The server rate logic ships no production rate at all: only TEST ONLY fixtures.
  const delivery = read("public/api/lib/delivery.php");
  const rateIds = [...delivery.matchAll(/'id'\s*=>\s*'([A-Z_]+)'/g)].map((m) => m[1]);
  assert.ok(rateIds.length > 0 && rateIds.every((id) => id.startsWith("TEST_ONLY_")), rateIds.join(","));
  for (const allowance of ["800", "1000", "2000"]) assert.ok(!new RegExp(`_minor'\\s*=>\\s*${allowance}\\b`).test(delivery), allowance);
  assert.ok(!statSync(join(root, "public/api/data")).isFile());
  assert.ok(!readdirSync(join(root, "public/api/data")).includes("delivery-rates.json"), "no production rate table is committed");
});

test("the Founder-approved delivery position and damage guidance are used verbatim", () => {
  assert.deepEqual(legal.FULFILMENT_POSITION, [
    "MCB manages your order from memory to delivery.",
    "Some physical keepsakes are made for us by specialist production partners. Where a physical product is included, we'll coordinate production, delivery and tracking on your behalf. Delivery costs and estimates are confirmed before payment where applicable. If there is a problem with your order, contact MCB — we'll deal with the production partner for you.",
  ]);
  assert.equal(
    legal.DAMAGE_GUIDANCE,
    "As this is a personalised item, we recommend taking a quick photo of the parcel on arrival and recording the opening. If anything has been damaged in transit, please contact MCB as soon as possible and we'll handle it for you."
  );
  assert.match(legal.DAMAGE_GUIDANCE_NOT_A_CONDITION, /not a condition of getting help/);
  assert.match(legal.DAMAGE_GUIDANCE_NOT_A_CONDITION, /consumer rights are not affected/);
  const server = JSON.parse(read("public/api/data/legal.json"));
  assert.equal(server.customer_copy.damage_guidance, legal.DAMAGE_GUIDANCE);
  assert.equal(server.customer_copy.separate_parcels, legal.SEPARATE_PARCELS_NOTE);
  // Wherever the guidance appears, the "not a condition" line travels with it.
  for (const file of ["src/pages/YourOrder.tsx", "src/pages/PriorityReplacement.tsx", "src/lib/productAnswers.ts", "src/data/legal/terms.ts", "src/data/legal/refunds.ts"]) {
    const text = read(file);
    assert.ok(text.includes("DAMAGE_GUIDANCE") && text.includes("DAMAGE_GUIDANCE_NOT_A_CONDITION"), file);
  }
  const email = read("public/api/lib/lifecycle-messages.php");
  assert.ok(email.includes("damage_guidance_not_a_condition") && email.includes("separate_parcels"));
  // Customers are never sent to a courier or a partner to resolve a problem.
  const customerText = [...walk("src/pages"), ...walk("src/data/legal"), "src/lib/productAnswers.ts", "public/api/lib/lifecycle-messages.php"]
    .filter((f) => !f.endsWith("review.ts") && !f.endsWith("versions.ts"))
    .map(read)
    .join("\n");
  assert.ok(!/take (this|it) up with the courier|contact the (supplier|courier) directly|do not take any responsibility for courier/i.test(customerText));
  assert.ok(!/ours to put right/.test(customerText));
});

test("Terms and Refunds keep the launch-closure fixes without touching clauses 18 and 20", () => {
  // Superseded the same day by the Single Creative Authority edition; the launch-closure fixes carry forward.
  assert.equal(legal.TERMS_VERSION, "2026-09-15.2");
  assert.equal(legal.REFUND_POLICY_VERSION, "2026-09-15.2");
  assert.ok(legal.KNOWN_TERMS_VERSIONS.includes("2026-09-15"));
  assert.ok(legal.KNOWN_TERMS_VERSIONS.includes("2026-09-09.4"), "orders under the Founder's edition still resolve");
  const clause = (id) => legal.TERMS_CLAUSES.find((c) => c.id === id).body.join(" ");
  assert.match(clause("cancellation"), /does not affect your rights if an item arrives damaged, faulty or not as described/);
  assert.ok(!/courier damages|take this up with the courier|reasonable customer service price/.test(clause("if-we-get-it-wrong")));
  assert.ok(clause("if-we-get-it-wrong").includes(legal.DAMAGE_GUIDANCE));
  assert.ok(!/24 hours|discount price/.test(clause("damaged-products")));
  assert.match(clause("damaged-products"), /not a deadline on your rights/);
  assert.match(clause("changes"), /orders placed after the new version takes effect/);
  assert.ok(!/before and after/.test(clause("changes")));
  // Substantive liability terms are the Founders' and legal review's to change.
  assert.match(clause("misuse"), /MCB has no responsibility for death or personal injury/);
  assert.match(clause("content-we-can-decline"), /full responsibility if anything happens regarding a legal case/);
  const refunds = legal.REFUND_SECTIONS.map((s) => s.body.join(" ")).join(" ");
  assert.ok(!/24 hours|matter for the courier|discount price/.test(refunds));
  assert.ok(refunds.includes(legal.DAMAGE_GUIDANCE));
  const server = JSON.parse(read("public/api/data/legal.json"));
  assert.equal(server.versions.terms, "2026-09-15.2");
  assert.equal(server.versions.refund_policy, "2026-09-15.2");
  // Priority Replacement's 7-day window is still only about the optional service.
  assert.match(read("src/pages/PriorityReplacement.tsx"), /not a time limit on your statutory rights/);
});

test("MCB holds no stock: sourced physical products claim no availability", async () => {
  const feed = JSON.parse(read("public/catalogue.json"));
  const player = feed.products.find((p) => p.id === "antique-brass-gramophone");
  assert.match(player.availability_note, /Sourced for each order/);
  assert.equal(feed.products.find((p) => p.id === "keepsake").availability_note, null);
  const seo = read("src/lib/seo.ts");
  assert.match(seo, /no availability is declared for it at all/);
  assert.ok(!/LimitedAvailability|InStoreOnly|inventoryLevel/.test(seo));
});

test("Review names the items MCB confirms, offers contact and never shows an estimated charge", () => {
  const review = read("src/pages/create/StepReview.tsx");
  assert.match(review, /MCB_CONFIRMS_DELIVERY/);
  assert.match(review, /Nothing has been charged/);
  assert.match(review, /wa\.me\/447340742009/);
  assert.match(review, /FULFILMENT_POSITION/);
  const api = read("src/lib/orderApi.ts");
  assert.match(api, /reviewItems/);
  // The Moment path needs no delivery information at all.
  const quote = read("public/api/order-quote.php");
  assert.match(quote, /if \(\$pricing->fulfilmentType\(\) === 'PHYSICAL'\)/);
});
