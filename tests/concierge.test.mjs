/**
 * MCB Memory Concierge — rules-based guidance built on the catalogue.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const { outputFiles } = buildSync({ entryPoints: [join(root, "src/lib/memoryConcierge.ts")], bundle: true, write: false, platform: "node", format: "esm" });
const { recommendMemory, largestFixedSongCount, budgetChoicesMinor } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`
);

const sku = (answers) => recommendMemory({ budgetMinor: null, ...answers }).option?.sku ?? null;

test("recommends the smallest product with room for the songs", () => {
  assert.equal(sku({ intent: "quick-song", songs: 1 }), "moment");
  assert.equal(sku({ intent: "keepsake", songs: 1 }), "keepsake-7-picture-disc");
  assert.equal(sku({ intent: "keepsake", songs: 3 }), "keepsake-10-picture-disc");
  assert.equal(sku({ intent: "keepsake", songs: 4 }), "keepsake-12-picture-disc");
  assert.equal(sku({ intent: "keepsake", songs: 5 }), "journey-6");
  assert.equal(sku({ intent: "journey", songs: 7 }), "journey-12");
});

test("never recommends Heirloom and sends anything beyond Journey to Bespoke", () => {
  assert.equal(largestFixedSongCount(), 12);
  const beyond = recommendMemory({ intent: "journey", songs: 13, budgetMinor: null });
  assert.equal(beyond.productId, "bespoke");
  assert.equal(beyond.option, null);
  assert.equal(recommendMemory({ intent: "bespoke", songs: 1, budgetMinor: 100000 }).withinBudget, null);
  for (let songs = 1; songs <= 13; songs++) {
    for (const intent of ["quick-song", "keepsake", "journey", "bespoke"]) {
      assert.notEqual(recommendMemory({ intent, songs, budgetMinor: null }).productId, "heirloom");
    }
  }
});

test("discloses budget mismatch and a lower-priced alternative instead of upselling", () => {
  const journey = recommendMemory({ intent: "journey", songs: 3, budgetMinor: 15000 });
  assert.equal(journey.option.sku, "journey-6");
  assert.equal(journey.withinBudget, false);
  assert.equal(journey.lowerPricedAlternative.sku, "keepsake-10-picture-disc");
  assert.equal(recommendMemory({ intent: "keepsake", songs: 1, budgetMinor: 9900 }).withinBudget, true);
});

test("budget choices are the catalogue's own prices", () => {
  assert.deepEqual(budgetChoicesMinor(), [1500, 9900, 11999, 13999, 14999, 19900, 34900]);
});
