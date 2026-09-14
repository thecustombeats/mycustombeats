/**
 * MCB canonical catalogue — business rules.
 *
 * Run: npm test   (or: node --test tests/*.test.mjs)
 *
 * These assert the founder-approved commercial model
 * (docs/COMMERCIAL-AUTHORITY-20260914.md) against the TypeScript catalogue,
 * the generated server copy, and the generator's failure behaviour.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;

const load = async (path) => {
  const { outputFiles } = buildSync({ entryPoints: [join(root, path)], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
};

const catalogue = await load("src/data/catalogue/index.ts");
const { PRODUCTS, getProduct, getVariant, previewOrder, validateCatalogue, formatMinor, minorToDecimal } = catalogue;

const prices = (productId) => getProduct(productId).variants.map((v) => [v.sku, v.price.minor]);
const allSkus = () => PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));

/* ------------------------------------------------------------------ */
/* Authorised prices                                                   */
/* ------------------------------------------------------------------ */

test("Moment is 1500 pence, one song, digital", () => {
  const moment = getProduct("moment");
  assert.equal(moment.commercialModel, "FIXED");
  assert.deepEqual(prices("moment"), [["moment", 1500]]);
  assert.equal(moment.variants[0].songCount, 1);
  assert.equal(moment.variants[0].fulfilment, "DIGITAL");
});

test("Keepsake is exactly four picture-disc variants with the authorised songs, sizes and prices", () => {
  const keepsake = getProduct("keepsake");
  assert.equal(keepsake.commercialModel, "VARIANT_FIXED");
  assert.deepEqual(
    keepsake.variants.map((v) => [v.sku, v.songCount, v.vinyl.sizeInches, v.vinyl.shape, v.price.minor]),
    [
      ["keepsake-12-picture-disc", 4, 12, "ROUND", 14999],
      ["keepsake-10-picture-disc", 3, 10, "ROUND", 13999],
      ["keepsake-10-heart-picture-disc", 1, 10, "HEART", 11999],
      ["keepsake-7-picture-disc", 1, 7, "ROUND", 9900],
    ]
  );
  for (const v of keepsake.variants) {
    assert.equal(v.vinyl.pictureDisc, true, `${v.sku} must be a picture disc`);
    assert.equal(v.fulfilment, "PHYSICAL");
  }
});

test("Journey is two variants on standard vinyl and never a picture disc", () => {
  const journey = getProduct("journey");
  assert.deepEqual(prices("journey"), [["journey-6", 19900], ["journey-12", 34900]]);
  const [six, twelve] = journey.variants;
  assert.equal(six.songCount, 6);
  assert.equal(twelve.songCount, 12);
  for (const v of journey.variants) {
    assert.notEqual(v.vinyl, null, `${v.sku} includes vinyl`);
    assert.equal(v.vinyl.pictureDisc, false, `${v.sku} is not a picture disc`);
    assert.equal(v.artworkIncluded, true);
    assert.equal(v.masteringIncluded, true);
    assert.equal(v.fulfilment, "PHYSICAL");
  }
  assert.deepEqual([six.vinyl.sizeInches, six.vinyl.discCount, six.vinyl.gatefold], [12, 1, false]);
  assert.deepEqual([twelve.vinyl.sizeInches, twelve.vinyl.discCount, twelve.vinyl.gatefold], [12, 2, true]);
  assert.ok(journey.disclosures.some((d) => /standard vinyl/i.test(d) && /not a picture disc/i.test(d)));
  // No customer-facing Journey line may claim a picture disc or deny vinyl.
  for (const text of [...journey.variants.flatMap((v) => v.features), journey.shortDescription, journey.positioning]) {
    assert.ok(!/no vinyl/i.test(text), text);
    assert.ok(!/picture disc/i.test(text) || /not a picture disc/i.test(text), text);
  }
});

test("Bespoke is quoted, with no public amount and Service semantics", () => {
  const bespoke = getProduct("bespoke");
  assert.equal(bespoke.commercialModel, "QUOTED");
  assert.equal(bespoke.variants.length, 0);
  assert.equal(bespoke.onlineCheckout, false);
  assert.equal(bespoke.schemaType, "Service");
  assert.equal(bespoke.route, "/bespoke");
  assert.ok(!JSON.stringify(bespoke).includes("799"));
});

test("Lyrics Frames: five sizes in inches at the authorised prices", () => {
  const frame = getProduct("lyrics-frame");
  assert.deepEqual(
    frame.variants.map((v) => [v.dimensions.widthInches, v.dimensions.heightInches, v.price.minor]),
    [[10, 15, 4999], [12, 18, 6999], [14, 21, 7999], [16, 24, 8999], [20, 30, 9999]]
  );
});

test("Personalised Music Plaque is £49.99 and says it does not play music", () => {
  const plaque = getProduct("personalised-music-plaque");
  assert.deepEqual(prices("personalised-music-plaque"), [["personalised-music-plaque", 4999]]);
  assert.ok(plaque.disclosures.some((d) => /does not play music/i.test(d)));
  assert.ok(plaque.disclosures.some((d) => /does not supply, sell, stream or license/i.test(d)));
});

test("Gramophones and record player carry the current prices; no Digital Player", () => {
  assert.deepEqual(prices("vintage-smartphone-gramophone"), [["vintage-smartphone-gramophone", 10000]]);
  assert.deepEqual(prices("antique-brass-gramophone"), [["antique-brass-gramophone", 100000]]);
  assert.deepEqual(prices("portable-suitcase-record-player"), [["portable-suitcase-record-player", 20000]]);
  assert.equal(allSkus().some((sku) => /digital-player/.test(sku)), false);
});

test("Cruise Ship DJ Bible prices are retained but not sold online", () => {
  const bible = getProduct("cruise-ship-dj-bible");
  assert.deepEqual(bible.variants.map((v) => v.price.minor), [39999, 50000, 59999]);
  assert.equal(bible.onlineCheckout, false);
});

test("Priority Replacement is exactly £19.99 and only Keepsakes are eligible", () => {
  assert.deepEqual(prices("priority-replacement"), [["priority-replacement", 1999]]);
  const eligible = PRODUCTS.flatMap((p) => p.variants.filter((v) => v.priorityReplacementEligible).map(() => p.id));
  assert.ok(eligible.length > 0);
  assert.deepEqual([...new Set(eligible)], ["keepsake"]);
});

test("Gift voucher is a stored-value concept only, from £10, no cash redemption", () => {
  const voucher = getProduct("gift-voucher");
  assert.equal(voucher.commercialModel, "STORED_VALUE");
  assert.equal(voucher.active, false);
  assert.equal(voucher.onlineCheckout, false);
  assert.equal(voucher.storedValue.minimumMinor, 1000);
  assert.equal(voucher.storedValue.cashRedemption, false);
});

/* ------------------------------------------------------------------ */
/* Removed products                                                    */
/* ------------------------------------------------------------------ */

test("retired products and prices do not exist in the catalogue", () => {
  const ids = PRODUCTS.map((p) => p.id);
  const skus = allSkus();
  const text = JSON.stringify(PRODUCTS).toLowerCase();
  for (const retired of ["heirloom", "cd", "music-box", "music-box-experience", "plaque", "engraved", "vinyl-frame", "frame", "gift-pop-up-card", "additional-vinyl-copy", "digital-player", "vinyl-12"]) {
    assert.ok(!ids.includes(retired), `product ${retired}`);
    assert.ok(!skus.some((sku) => sku === retired || sku.startsWith(`${retired}-`) && retired !== "plaque"), `sku ${retired}`);
  }
  for (const phrase of ["heirloom", "compact disc", "music box", "engraved", "vinyl frame", "pop-up card", "additional vinyl copy", "full package", "12-inch only"]) {
    assert.ok(!text.includes(phrase), phrase);
  }
  assert.equal(skus.some((sku) => /\bcd\b/.test(sku)), false);
  // No standalone vinyl at £79.99, and no 7-inch product other than the Keepsake.
  assert.equal(PRODUCTS.some((p) => p.variants.some((v) => v.price.minor === 7999 && v.vinyl)), false);
  assert.deepEqual(
    PRODUCTS.flatMap((p) => p.variants.filter((v) => v.vinyl?.sizeInches === 7).map((v) => v.sku)),
    ["keepsake-7-picture-disc"]
  );
});

test("no supplier cost or margin fields exist anywhere in the catalogue", () => {
  const keys = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) { keys.add(k.toLowerCase()); walk(v); }
  };
  walk(PRODUCTS);
  for (const key of keys) assert.ok(!/cost|margin|supplier|wholesale|markup/.test(key), key);
});

/* ------------------------------------------------------------------ */
/* Invariants and validation                                           */
/* ------------------------------------------------------------------ */

test("the catalogue passes its own validation", () => {
  assert.deepEqual(validateCatalogue(PRODUCTS), []);
});

test("every price is a positive integer in GBP", () => {
  for (const p of PRODUCTS) for (const v of p.variants) {
    assert.ok(Number.isSafeInteger(v.price.minor) && v.price.minor > 0, v.sku);
    assert.equal(v.price.currency, "GBP", v.sku);
  }
});

test("validation refuses broken catalogues", () => {
  const clone = () => structuredClone(PRODUCTS);
  const expectError = (mutate, pattern) => {
    const products = clone();
    mutate(products);
    const errors = validateCatalogue(products);
    assert.ok(errors.some((e) => pattern.test(e)), `expected ${pattern} in ${JSON.stringify(errors)}`);
  };
  const byId = (products, id) => products.find((p) => p.id === id);
  expectError((ps) => { byId(ps, "journey").variants[1].sku = "journey-6"; }, /duplicate SKU/);
  expectError((ps) => { byId(ps, "moment").id = "keepsake"; }, /duplicate product id/);
  expectError((ps) => { byId(ps, "moment").variants[0].price.minor = 14.99; }, /invalid price/);
  expectError((ps) => { byId(ps, "moment").variants[0].price.minor = 0; }, /invalid price/);
  expectError((ps) => { delete byId(ps, "moment").variants[0].price.currency; }, /currency/);
  expectError((ps) => { byId(ps, "bespoke").variants = [structuredClone(byId(ps, "moment").variants[0])]; byId(ps, "bespoke").variants[0].sku = "bespoke-from"; }, /QUOTED has fixed-price variants/);
  expectError((ps) => { byId(ps, "moment").variants = []; }, /FIXED needs exactly one variant/);
  expectError((ps) => { byId(ps, "journey").variants[0].priorityReplacementEligible = true; }, /Keepsake only/);
  expectError((ps) => { byId(ps, "cruise-ship-dj-bible").onlineCheckout = true; }, /confirmed fulfilment/);
  expectError((ps) => { ps.splice(ps.findIndex((p) => p.id === "priority-replacement"), 1); }, /unknown referenced product/);
});

/* ------------------------------------------------------------------ */
/* Order preview mirrors the server rules                              */
/* ------------------------------------------------------------------ */

test("order preview totals in integer pence and enforces the order rules", () => {
  const ok = previewOrder([
    { sku: "keepsake-7-picture-disc", quantity: 3 },
    { sku: "lyrics-frame-12x18", quantity: 1 },
    { sku: "priority-replacement", quantity: 3 },
  ]);
  assert.equal(ok.ok, true);
  assert.equal(ok.totalMinor, 3 * 9900 + 6999 + 3 * 1999);
  assert.equal(ok.requiresShipping, true);

  assert.equal(previewOrder([{ sku: "moment", quantity: 1 }]).requiresShipping, false);
  assert.equal(previewOrder([{ sku: "keepsake-7-picture-disc", quantity: 1 }, { sku: "priority-replacement", quantity: 2 }]).reason, "priority_replacement_ineligible");
  assert.equal(previewOrder([{ sku: "journey-6", quantity: 1 }, { sku: "priority-replacement", quantity: 1 }]).reason, "priority_replacement_ineligible");
  assert.equal(previewOrder([{ sku: "personalised-music-plaque", quantity: 1 }]).reason, "no_song_experience");
  assert.equal(previewOrder([{ sku: "heirloom", quantity: 1 }]).reason, "unknown_sku");
  assert.equal(previewOrder([{ sku: "cruise-ship-dj-bible-pro", quantity: 1 }]).reason, "unknown_sku");
  assert.equal(previewOrder([{ sku: "moment", quantity: 0 }]).reason, "invalid_quantity");
  assert.equal(previewOrder([{ sku: "moment", quantity: 1.5 }]).reason, "invalid_quantity");
  assert.equal(previewOrder([{ sku: "moment", quantity: 1 }, { sku: "moment", quantity: 1 }]).reason, "duplicate_sku");
  assert.equal(previewOrder([{ sku: "keepsake-12-picture-disc", quantity: 50 }]).ok, true);
});

test("money formatting is exact", () => {
  assert.equal(formatMinor(1500), "£15");
  assert.equal(formatMinor(14999), "£149.99");
  assert.equal(formatMinor(100000), "£1,000");
  assert.equal(minorToDecimal(9900), "99.00");
  assert.equal(minorToDecimal(4999), "49.99");
});

/* ------------------------------------------------------------------ */
/* Generated server catalogue                                          */
/* ------------------------------------------------------------------ */

test("generated catalogue.json has not drifted from the TypeScript catalogue", () => {
  execFileSync("node", [join(root, "scripts/generate-catalogue-json.mjs"), "--check"], { cwd: root, stdio: "pipe" });
  const json = JSON.parse(readFileSync(join(root, "public/api/data/catalogue.json"), "utf8"));
  for (const product of PRODUCTS) {
    for (const variant of product.variants) {
      const entry = json.skus[variant.sku];
      assert.ok(entry, variant.sku);
      assert.equal(entry.price_minor, variant.price.minor, variant.sku);
      assert.equal(entry.product_id, product.id);
      assert.equal(entry.orderable, product.active && product.onlineCheckout, variant.sku);
    }
  }
  assert.equal(Object.keys(json.skus).length, allSkus().length);
  assert.equal(existsSync(join(root, "public/api/data/packages.json")), false, "legacy packages.json must not return");
});

test("the generator fails loudly and leaves no stale server data behind", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "mcb-catalogue-"));
  try {
    cpSync(join(root, "scripts"), join(sandbox, "scripts"), { recursive: true });
    cpSync(join(root, "src/data"), join(sandbox, "src/data"), { recursive: true });
    symlinkSync(join(root, "node_modules"), join(sandbox, "node_modules"), "dir");
    mkdirSync(join(sandbox, "public/api/data"), { recursive: true });
    writeFileSync(join(sandbox, "public/api/data/catalogue.json"), '{"stale":true}');

    const productsPath = join(sandbox, "src/data/catalogue/products.ts");
    writeFileSync(productsPath, readFileSync(productsPath, "utf8").replace("price: gbp(1500)", "price: gbp(14.99)"));

    const result = spawnSync("node", [join(sandbox, "scripts/generate-catalogue-json.mjs")], { cwd: sandbox, encoding: "utf8" });
    assert.notEqual(result.status, 0, "generator must exit non-zero");
    assert.match(result.stderr, /invalid price/);
    assert.equal(existsSync(join(sandbox, "public/api/data/catalogue.json")), false, "stale catalogue.json must be removed");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

/* ------------------------------------------------------------------ */
/* Retired payment architecture stays retired                          */
/* ------------------------------------------------------------------ */

const sourceFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(tsx?|mjs|js|html)$/.test(name) ? [path] : [];
  });

test("no Payment Links, browser automation webhooks or localhost bridges in application source", () => {
  const files = [...sourceFiles(join(root, "src")), join(root, "index.html")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.ok(!/buy\.stripe\.com/.test(text), `Payment Link in ${file}`);
    assert.ok(!/hook\.[a-z0-9]+\.make\.com/.test(text), `Make.com webhook in ${file}`);
    assert.ok(!/localhost:18888/.test(text), `localhost bridge in ${file}`);
  }
});
