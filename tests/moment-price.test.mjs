/**
 * Moment price (Founders' correction, 15 September 2026). Run: npm test
 *
 * Source of truth: MCB Moment = £15 GBP. Memory Music Video = optional £49.
 * Moment + one Memory Music Video = £64. The obsolete £10 Moment price must
 * not reappear in the catalogue, the generated server/public feeds, the
 * checkout path, customer-facing code or the release documentation.
 * The server charge to Stripe is proven in tests/transaction-acceptance.sh
 * (one GBP line of 1500) and tests/video-acceptance.sh (1500 + 4900).
 */
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

const outDir = mkdtempSync(join(root, "node_modules", ".mcb-moment-test-"));
after(() => rmSync(outDir, { recursive: true, force: true }));
const entryPath = join(outDir, "entry.ts");
writeFileSync(entryPath, `export * as catalogue from "${root}src/data/catalogue/index.ts";\n`);
const outFile = join(root, "node_modules", `.mcb-moment-${process.pid}.mjs`);
buildSync({ entryPoints: [entryPath], bundle: true, platform: "node", format: "esm", packages: "external", outfile: outFile, logLevel: "error" });
after(() => rmSync(outFile, { force: true }));
globalThis.window ??= { location: { search: "", pathname: "/", hash: "" } };
const { catalogue: C } = await import(outFile);

const MOMENT_MINOR = 1500;
const VIDEO_MINOR = 4900;

test("the canonical Moment price is £15 GBP in the catalogue source", () => {
  const ref = C.getVariant("moment");
  assert.equal(ref.variant.price.minor, MOMENT_MINOR);
  assert.equal(ref.variant.price.currency, "GBP");
  assert.equal(C.MOMENT.variants.length, 1, "one Moment variant, one price");
  assert.equal(C.lowestPrice(C.MOMENT).minor, MOMENT_MINOR);
  const source = read("src/data/catalogue/products.ts");
  const block = source.slice(source.indexOf("export const MOMENT"), source.indexOf("};", source.indexOf("export const MOMENT")));
  assert.match(block, /price: gbp\(1500\)/);
  assert.doesNotMatch(block, /gbp\(1000\)/);
});

test("derived totals: Moment £15; Moment + Memory Music Video £64", () => {
  const moment = C.previewOrder([{ sku: "moment", quantity: 1 }]);
  assert.equal(moment.ok, true);
  assert.equal(moment.totalMinor, MOMENT_MINOR);
  const withVideo = C.previewOrder([{ sku: "moment", quantity: 1 }, { sku: "memory-music-video", quantity: 1 }]);
  assert.equal(withVideo.ok, true);
  assert.equal(withVideo.totalMinor, 6400);
  assert.equal(C.getVariant("memory-music-video").variant.price.minor, VIDEO_MINOR);
});

test("generated server and public feeds carry £15 (what checkout charges)", () => {
  const server = JSON.parse(read("public/api/data/catalogue.json"));
  assert.equal(server.skus.moment.price_minor, MOMENT_MINOR);
  assert.equal(server.skus.moment.currency, "GBP");
  assert.equal(server.skus["memory-music-video"].price_minor, VIDEO_MINOR);
  const feed = JSON.parse(read("public/catalogue.json"));
  const variant = feed.products.find((p) => p.id === "moment").variants.find((v) => v.sku === "moment");
  assert.deepEqual({ ...variant.price }, { amount: "15.00", minor_units: MOMENT_MINOR, currency: "GBP" });
  // The server prices every line from this file; the browser never sends a price.
  assert.match(read("public/api/lib/catalogue.php"), /\$item\['price_minor'\]/);
  assert.match(read("public/api/checkout/session.php"), /'unit_amount'\s*=>\s*\(int\) \$line\['unit_minor'\]/);
  // Built artefacts (when present) must match the source: no stale Moment price survives a build.
  const builtServer = join(root, "dist/api/data/catalogue.json");
  if (existsSync(builtServer)) assert.equal(JSON.parse(readFileSync(builtServer, "utf8")).skus.moment.price_minor, MOMENT_MINOR, "dist/api/data/catalogue.json");
  const builtFeed = join(root, "dist/catalogue.json");
  if (existsSync(builtFeed)) assert.equal(JSON.parse(readFileSync(builtFeed, "utf8")).products.find((p) => p.id === "moment").variants[0].price.minor_units, MOMENT_MINOR, "dist/catalogue.json");
});

// Lines that talk about Moment and a £10 price in any common representation.
const STALE_MOMENT = [
  /moment[^\n]{0,60}(£\s?10(?:\.00)?(?!\d|,\d)|\bGBP\s?10(?:\.00)?\b|\b10(?:\.00)?\s?GBP\b)/i,
  /(£\s?10(?:\.00)?(?!\d|,\d)|\bGBP\s?10(?:\.00)?\b)[^\n]{0,60}moment/i,
  /moment[^\n]{0,40}(price_minor|minor_units|unit_amount|priceMinor)["']?\s*[:=]\s*1000\b/i,
  /moment[^\n]{0,40}gbp\(1000\)/i,
  /\bMoment\s+10\b/,
  // The obsolete package price ladder, where £10 was the Moment price.
  /£\s?10\s*\/\s*£?\s?99\b/,
];
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const path = join(dir, name);
  if (/node_modules|\.git$|^dist$/.test(path)) return [];
  const stat = statSync(join(root, path));
  if (stat.isDirectory()) return walk(path);
  return /\.(tsx?|mjs|js|php|json|html|md|txt|xml|sql)$/.test(name) ? [path] : [];
});

test("no stale £10 Moment price on customer-facing, transaction-critical or documented surfaces", () => {
  const files = [...walk("src"), ...walk("public"), ...walk("scripts"), ...walk("docs"), ...walk("db"), "index.html"].filter((f) => existsSync(join(root, f)));
  assert.ok(files.length > 100, "the scan covers the repository");
  const hits = [];
  for (const file of files) {
    read(file).split("\n").forEach((line, i) => {
      if (STALE_MOMENT.some((re) => re.test(line))) hits.push(`${relative(root, join(root, file))}:${i + 1}: ${line.trim().slice(0, 120)}`);
    });
  }
  assert.deepEqual(hits, [], "stale Moment price found");
});

test("the scan itself catches stale forms (so it cannot silently pass)", () => {
  for (const sample of ["Moment £10", "the £10 Moment", "Moment is £10.00", "Moment GBP 10", "Moment 10, Keepsake 99", "Moment £10, Keepsake £99", "Apply £10 / £99 / £199 / £349", "£10/99/199/349 budgets", `"moment": { "price_minor": 1000`, "MOMENT price: gbp(1000)"]) {
    assert.ok(STALE_MOMENT.some((re) => re.test(sample)), sample);
  }
  for (const unrelated of ["A gift value from £10", "Bespoke £10,000", "Moment £15", "Keepsake £100", "£8 / £10 / £20 allowances"]) {
    assert.ok(!STALE_MOMENT.some((re) => re.test(unrelated)), unrelated);
  }
});
