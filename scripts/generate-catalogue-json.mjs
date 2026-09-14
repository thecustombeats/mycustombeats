/**
 * Generates the server's copy of MCB's commercial and legal data:
 *
 *   public/api/data/catalogue.json   from src/data/catalogue/
 *   public/api/data/legal.json       from src/data/legal/
 *   public/api/data/personalisation.json  limits, occasions, styles, countries
 *   public/api/data/operations.json  post-payment states, revisions, templates
 *
 * The TypeScript catalogue is the only place a price is defined. PHP reads
 * this projection of it at request time and never holds a second price table.
 *
 * FAILS LOUDLY. The previous outputs are deleted before anything is compiled,
 * so a failed run leaves no stale data behind: the build stops, and a server
 * without its data refuses orders (503) rather than charging old prices.
 *
 * `--check` regenerates in memory and exits non-zero if the committed files
 * differ, so drift between the frontend and server catalogue fails CI.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = join(root, "node_modules", ".mcb-catalogue-build");
const checkOnly = process.argv.includes("--check");

const TARGETS = {
  catalogue: join(root, "public/api/data/catalogue.json"),
  legal: join(root, "public/api/data/legal.json"),
  personalisation: join(root, "public/api/data/personalisation.json"),
  operations: join(root, "public/api/data/operations.json"),
};

const fail = (message) => {
  console.error(`\n[generate-catalogue] FAILED: ${message}\n`);
  process.exit(1);
};

if (!checkOnly) {
  for (const target of Object.values(TARGETS)) rmSync(target, { force: true });
}

rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

try {
  execFileSync(
    "npx",
    [
      "tsc",
      join(root, "src/data/catalogue/index.ts"),
      join(root, "src/data/legal/index.ts"),
      join(root, "src/data/personalisationRules.ts"),
      join(root, "src/data/occasions.ts"),
      join(root, "src/data/musicStyles.ts"),
      join(root, "src/data/countries.ts"),
      join(root, "src/data/operations.ts"),
      "--outDir", tmp,
      "--rootDir", join(root, "src/data"),
      "--module", "esnext",
      "--target", "es2020",
      "--moduleResolution", "bundler",
      "--strict",
    ],
    { cwd: root, stdio: "pipe" }
  );
} catch (error) {
  fail(`TypeScript compilation of the catalogue failed.\n${error.stdout?.toString() ?? ""}${error.stderr?.toString() ?? ""}`);
}

// tsc emits extensionless relative imports, which Node's ESM loader rejects.
const addJsSuffixes = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      addJsSuffixes(path);
    } else if (entry.name.endsWith(".js")) {
      writeFileSync(
        path,
        readFileSync(path, "utf8").replace(
          /((?:from|export \* from)\s+["'])(\.\.?\/[^"']*?)(["'])/g,
          (_m, a, spec, b) => a + (spec.endsWith(".js") ? spec : spec + ".js") + b
        )
      );
    }
  }
};
addJsSuffixes(tmp);

const catalogue = await import(pathToFileURL(join(tmp, "catalogue/index.js")).href);
const legal = await import(pathToFileURL(join(tmp, "legal/index.js")).href);
const rules = await import(pathToFileURL(join(tmp, "personalisationRules.js")).href);
const occasions = await import(pathToFileURL(join(tmp, "occasions.js")).href);
const musicStyles = await import(pathToFileURL(join(tmp, "musicStyles.js")).href);
const countries = await import(pathToFileURL(join(tmp, "countries.js")).href);
const operations = await import(pathToFileURL(join(tmp, "operations.js")).href);
rmSync(tmp, { recursive: true, force: true });

const { PRODUCTS, ORDER_LIMITS, PRIORITY_REPLACEMENT_SKU, validateCatalogue } = catalogue;

const errors = validateCatalogue(PRODUCTS);
if (errors.length > 0) fail(`catalogue is invalid:\n  - ${errors.join("\n  - ")}`);

/* ------------------------------------------------------------------ */
/* catalogue.json                                                      */
/* ------------------------------------------------------------------ */

const products = {};
const skus = {};

for (const product of PRODUCTS) {
  products[product.id] = {
    name: product.name,
    commercial_model: product.commercialModel,
    category: product.category,
    active: product.active,
    online_checkout: product.onlineCheckout,
    requires_personalisation: product.requiresPersonalisation,
    revisions: product.revisions,
    turnaround: product.turnaround?.label ?? null,
    analytics_category: product.analyticsCategory,
    skus: product.variants.map((v) => v.sku),
  };

  for (const variant of product.variants) {
    skus[variant.sku] = {
      product_id: product.id,
      name: variant.name,
      price_minor: variant.price.minor,
      currency: variant.price.currency,
      // Orderable only when the product is active and sold online.
      orderable: product.active && product.onlineCheckout,
      category: product.category,
      fulfilment: variant.fulfilment,
      song_count: variant.songCount,
      vinyl: variant.vinyl
        ? {
            picture_disc: variant.vinyl.pictureDisc,
            size_inches: variant.vinyl.sizeInches,
            shape: variant.vinyl.shape,
            disc_count: variant.vinyl.discCount,
            gatefold: variant.vinyl.gatefold,
          }
        : null,
      priority_replacement_eligible: variant.priorityReplacementEligible,
    };
  }
}

// Server-side re-check of what the frontend validator already proved, on the
// projection PHP will actually read.
for (const [sku, entry] of Object.entries(skus)) {
  if (!Number.isSafeInteger(entry.price_minor) || entry.price_minor <= 0) fail(`invalid price for ${sku}`);
  if (entry.currency !== "GBP") fail(`missing currency for ${sku}`);
  if (entry.orderable && entry.fulfilment === "UNCONFIRMED") fail(`orderable ${sku} has no fulfilment`);
}
for (const [id, product] of Object.entries(products)) {
  if (product.commercial_model === "QUOTED" && (product.skus.length > 0 || product.online_checkout)) {
    fail(`quoted product ${id} carries fixed-price assumptions`);
  }
}
if (!skus[PRIORITY_REPLACEMENT_SKU]) fail(`unknown referenced SKU ${PRIORITY_REPLACEMENT_SKU}`);

const body = {
  schema_version: 2,
  currency: "GBP",
  rules: {
    max_lines: ORDER_LIMITS.maxLines,
    max_quantity_per_line: ORDER_LIMITS.maxQuantityPerLine,
    primary_category: "SONG_EXPERIENCE",
    priority_replacement_sku: PRIORITY_REPLACEMENT_SKU,
  },
  products,
  skus,
};

const catalogueOut = {
  _generated: "Do not edit. Generated from src/data/catalogue/ by scripts/generate-catalogue-json.mjs",
  catalogue_hash: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
  ...body,
};

/* ------------------------------------------------------------------ */
/* legal.json                                                          */
/* ------------------------------------------------------------------ */

const legalOut = {
  _generated: "Do not edit. Generated from src/data/legal/ by scripts/generate-catalogue-json.mjs",
  versions: {
    terms: legal.TERMS_VERSION,
    refund_policy: legal.REFUND_POLICY_VERSION,
    privacy_policy: legal.PRIVACY_POLICY_VERSION,
    terms_effective_date: legal.TERMS_EFFECTIVE_DATE,
    known_terms_versions: [...legal.KNOWN_TERMS_VERSIONS],
  },
  consents: Object.fromEntries(
    legal.CONSENTS.map((consent) => [consent.id, { applies_to: consent.appliesTo }])
  ),
  production: {
    initial_stage: legal.INITIAL_STAGE,
    stages: legal.PRODUCTION_STAGES.map((stage) => ({
      stage: stage.stage,
      revisions_open: stage.revisionsOpen,
    })),
    approval_channels: [...legal.APPROVAL_CHANNELS],
  },
};

/* ------------------------------------------------------------------ */
/* personalisation.json                                                */
/* ------------------------------------------------------------------ */

const countryCodes = countries.COUNTRIES.map((country) => country.code);
if (new Set(countryCodes).size !== countryCodes.length || countryCodes.some((code) => !/^[A-Z]{2}$/.test(code))) {
  fail("countries must be unique two-letter codes");
}
const styleLabels = musicStyles.MUSIC_STYLES.map((style) => style.label);
if (styleLabels.some((label) => label.length > musicStyles.MAX_STYLE_LABEL_LENGTH)) fail("a music style label is too long");

const personalisationOut = {
  _generated: "Do not edit. Generated from src/data/ by scripts/generate-catalogue-json.mjs",
  limits: {
    story_max: rules.STORY_MAX,
    about_max: rules.ABOUT_MAX,
    song_title_max: rules.SONG_TITLE_MAX,
    artist_max: rules.ARTIST_MAX,
    frame_heading_max: rules.FRAME_HEADING_MAX,
    style_label_max: musicStyles.MAX_STYLE_LABEL_LENGTH,
  },
  multi_unit_product_ids: [...rules.MULTI_UNIT_PRODUCT_IDS],
  uploads: { max_bytes: rules.MAX_PHOTO_BYTES, mime_types: [...rules.PHOTO_MIME_TYPES] },
  occasions: Object.keys(occasions.OCCASIONS),
  styles: styleLabels,
  countries: Object.fromEntries(countries.COUNTRIES.map((country) => [country.code, country.name])),
};

/* ------------------------------------------------------------------ */
/* operations.json                                                     */
/* ------------------------------------------------------------------ */

for (const id of Object.keys(operations.INCLUDED_REVISIONS)) {
  if (!products[id] || !products[id].revisions) fail(`included revisions for ${id} have no approved catalogue wording`);
}
for (const id of Object.keys(operations.CREATIVE_TARGET_HOURS)) {
  if (!products[id] || !products[id].turnaround) fail(`creative target for ${id} has no approved turnaround`);
}

const operationsOut = {
  _generated: "Do not edit. Generated from src/data/operations.ts by scripts/generate-catalogue-json.mjs",
  states: operations.OPERATIONAL_STATES.map((s) => ({ state: s.state, workflows: [...s.workflows], next_action: s.nextAction })),
  included_revisions: Object.fromEntries(
    Object.entries(operations.INCLUDED_REVISIONS).map(([id, r]) => [id, { count: r.count, per: r.per }])
  ),
  customer_stages: Object.fromEntries(
    Object.entries(operations.CUSTOMER_STAGES).map(([w, stages]) => [w, stages.map((s) => ({ id: s.id, states: [...s.states] }))])
  ),
  creative_target_hours: { ...operations.CREATIVE_TARGET_HOURS },
  priority_replacement_claim_window_days: operations.PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  lifecycle_templates: Object.fromEntries(
    operations.LIFECYCLE_TEMPLATES.map((t) => [t.type, { trigger: t.trigger, auto_send: t.autoSend, workflows: [...t.workflows] }])
  ),
  automation_events: [...operations.AUTOMATION_EVENTS],
  queue_kinds: Object.fromEntries(
    Object.entries(operations.QUEUE_KINDS).map(([k, v]) => [k, { label: v.label, priority: v.priority }])
  ),
};

const outputs = [
  [TARGETS.catalogue, JSON.stringify(catalogueOut, null, 2) + "\n"],
  [TARGETS.legal, JSON.stringify(legalOut, null, 2) + "\n"],
  [TARGETS.personalisation, JSON.stringify(personalisationOut, null, 2) + "\n"],
  [TARGETS.operations, JSON.stringify(operationsOut, null, 2) + "\n"],
];

if (checkOnly) {
  const stale = outputs.filter(([path, text]) => !existsSync(path) || readFileSync(path, "utf8") !== text);
  if (stale.length > 0) {
    fail(`generated data is out of date: ${stale.map(([p]) => p.replace(root + "/", "")).join(", ")}. Run npm run generate:catalogue.`);
  }
  console.log("catalogue.json, legal.json, personalisation.json and operations.json match the TypeScript sources.");
} else {
  for (const [path, text] of outputs) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }
  console.log(
    `catalogue.json generated: ${Object.keys(products).length} products, ${Object.keys(skus).length} SKUs, ` +
      `${Object.values(skus).filter((s) => s.orderable).length} orderable (hash ${catalogueOut.catalogue_hash.slice(0, 12)})`
  );
  console.log(`legal.json generated: terms ${legal.TERMS_VERSION}`);
  console.log(`personalisation.json generated: ${countryCodes.length} countries, ${styleLabels.length} styles`);
  console.log(`operations.json generated: ${operationsOut.states.length} states, ${operationsOut.automation_events.length} automation events`);
}
