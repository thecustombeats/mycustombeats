/**
 * Generates api/data/packages.json AND api/data/catalogue.json from the
 * TypeScript commercial sources.
 *
 * WHY THIS EXISTS
 * ---------------
 * The server must enforce package, format and fulfilment rules independently
 * of the browser. Hand-copying those rules into PHP would create two sources
 * of truth that drift apart the moment either is edited — and the failure mode
 * is silent: orders accepted for combinations that cannot be fulfilled, or
 * physical orders taken without an address.
 *
 * So `src/data/packages.ts` stays authoritative, and this script derives a
 * machine-readable projection of it that PHP reads at request time. Editing
 * prices or format rules still means editing exactly one file.
 *
 * Run automatically as part of `npm run build` (see package.json). If the
 * output is stale relative to the source, the build regenerates it.
 *
 * Deliberately excluded from the JSON: Stripe URLs. The server never needs
 * them — the browser resolves checkout — and keeping payment links out of a
 * server-readable file narrows what a misconfigured host could leak.
 *
 * CATALOGUE PRICES ARE EXPORTED FOR THE SAME REASON PACKAGE PRICES ARE.
 * The dynamic Checkout Session endpoint has to total a basket, and the one
 * thing it must never do is take an amount from the browser. It therefore
 * needs a server-readable price for every chargeable line — so the catalogue
 * is compiled here too, by the identical mechanism.
 *
 * ONLY APPROVED PRICES CROSS OVER. A product whose price is `TBD` is omitted
 * entirely rather than exported as zero or null: an id the server cannot
 * price is an id the server must refuse, and the cleanest way to guarantee
 * that is for it not to be in the file at all.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, "node_modules", ".mcb-packages-build");

// Compile the TypeScript source rather than parsing it, so the JSON can never
// disagree with what the application itself imports.
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

execFileSync(
  "npx",
  [
    "tsc",
    join(root, "src/data/packages.ts"),
    join(root, "src/data/catalogue/index.ts"),
    "--outDir", tmp,
    "--module", "esnext",
    "--target", "es2020",
    "--moduleResolution", "bundler",
  ],
  { cwd: root, stdio: "pipe" }
);

const { PACKAGES, FORMATS } = await import(
  pathToFileURL(join(tmp, "packages.js")).href
);

// tsc emits extensionless relative imports, which Node's ESM loader will not
// resolve. Rewriting them here is cheaper than adding a bundler to a build
// step whose only job is to read two constants out of the source of truth.
for (const file of readdirSync(join(tmp, "catalogue"))) {
  if (!file.endsWith(".js")) continue;
  const path = join(tmp, "catalogue", file);
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(
      /(from\s+["'])(\.\.?\/[^"']*?)(["'])/g,
      (_m, a, spec, b) => a + (spec.endsWith(".js") ? spec : spec + ".js") + b
    )
  );
}

const { ALL_PRODUCTS, ENHANCEMENTS, isPriced } = await import(
  pathToFileURL(join(tmp, "catalogue/index.js")).href
);

const packages = {};
for (const pkg of PACKAGES) {
  packages[pkg.id] = {
    name: pkg.name,
    price_gbp: pkg.price.gbp,
    price_usd: pkg.price.usd,
    price_prefix: pkg.price.prefix ?? null,
    song_count: pkg.songCount,
    delivery: pkg.delivery,
    formats: [...pkg.formats],
    // Derived once, here, so PHP never has to reimplement the rule.
    fulfilment: Object.fromEntries(
      pkg.formats.map((f) => [f, FORMATS[f].isPhysical ? "PHYSICAL" : "DIGITAL"])
    ),
    // Packages with no selectable format (Bespoke) are digital by default.
    default_fulfilment: pkg.formats.length === 0 ? "DIGITAL" : null,
  };
}

const out = {
  _generated: "Do not edit. Generated from src/data/packages.ts by scripts/generate-packages-json.mjs",
  formats: Object.fromEntries(
    Object.values(FORMATS).map((f) => [
      f.id,
      { name: f.name, is_physical: f.isPhysical },
    ])
  ),
  packages,
};

const target = join(root, "public/api/data/packages.json");
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2) + "\n");

/* ------------------------------------------------------------------ */
/* Catalogue — the chargeable basket lines                             */
/* ------------------------------------------------------------------ */

/**
 * Everything the checkout engine may be asked to charge for, besides the
 * package itself.
 *
 * `max_quantity` is 1 for a catalogue product: a frame or a plaque is one
 * commissioned piece, and nothing has approved buying four. The Additional
 * Vinyl Copy is the one line that carries a real quantity, and its ceiling
 * comes from `ENHANCEMENTS` rather than being written again here.
 *
 * `eligible_packages` is null when the business has stated no restriction —
 * which the server must read as "no restriction", not as "none".
 */
const items = {};

for (const product of ALL_PRODUCTS) {
  // TBD products are omitted entirely. An id with no approved price is an id
  // the server has to refuse, and leaving it out makes that automatic.
  if (!isPriced(product.price)) continue;
  items[product.id] = {
    name: product.name,
    kind: "PRODUCT",
    price_gbp: product.price.gbp,
    max_quantity: 1,
    fulfilment: product.fulfilment,
    eligible_packages: product.compatiblePackages
      ? [...product.compatiblePackages]
      : null,
    // Products carry no format restriction; only enhancements do.
    eligible_formats: null,
  };
}

for (const enhancement of ENHANCEMENTS) {
  if (enhancement.unitPrice.status !== "FIXED_GBP") continue;
  items[enhancement.id] = {
    name: enhancement.name,
    kind: "ENHANCEMENT",
    price_gbp: enhancement.unitPrice.gbp,
    max_quantity: enhancement.maxQuantity,
    fulfilment: enhancement.fulfilment,
    eligible_packages: [...enhancement.eligiblePackages],
    // An additional copy of a record needs the order to actually contain one.
    eligible_formats: enhancement.eligibleFormats
      ? [...enhancement.eligibleFormats]
      : null,
  };
}

const catalogueOut = {
  _generated:
    "Do not edit. Generated from src/data/catalogue/ by scripts/generate-packages-json.mjs",
  items,
};

const catalogueTarget = join(root, "public/api/data/catalogue.json");
writeFileSync(catalogueTarget, JSON.stringify(catalogueOut, null, 2) + "\n");

rmSync(tmp, { recursive: true, force: true });

console.log(
  `packages.json generated: ${Object.keys(packages).length} packages, ` +
  `${Object.keys(out.formats).length} formats`
);
console.log(
  `catalogue.json generated: ${Object.keys(items).length} chargeable items`
);
