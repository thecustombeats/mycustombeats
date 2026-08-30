/**
 * Generates api/data/packages.json from src/data/packages.ts.
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
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
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
rmSync(tmp, { recursive: true, force: true });

console.log(
  `packages.json generated: ${Object.keys(packages).length} packages, ` +
  `${Object.keys(out.formats).length} formats`
);
