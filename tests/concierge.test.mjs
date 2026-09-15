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
const { recommendMemory, largestFixedSongCount, budgetChoicesMinor, recommendGuided, memoryChoices, asksArrangement } = await import(
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
  assert.deepEqual(budgetChoicesMinor(), [1500, 9900, 12999, 13999, 14999, 19900, 34900]);
});

/* ---- Guided questions ------------------------------------------------ */

const guided = (answers) =>
  recommendGuided({ occasion: null, keep: "unsure", arrangement: null, budgetMinor: null, ...answers });

test("memory choices are derived from catalogue capacities", () => {
  assert.deepEqual(
    memoryChoices().map((c) => [c.value, c.label]),
    [[1, "1"], [3, "2–3"], [4, "4"], [6, "5–6"], [12, "7–12"], [13, "More than 12"]]
  );
});

test("guided: digital and unsure single memories start with Moment, never upward", () => {
  const digital = guided({ memories: 1, keep: "digital" });
  assert.equal(digital.option.sku, "moment");
  assert.equal(digital.quantity, 1);
  const unsure = guided({ memories: 1, keep: "unsure" });
  assert.equal(unsure.option.sku, "moment");
  assert.equal(unsure.alsoConsider.sku, "keepsake-7-picture-disc");
});

test("guided: something to hold recommends the smallest record that fits", () => {
  assert.equal(guided({ memories: 1, keep: "physical" }).option.sku, "keepsake-7-picture-disc");
  assert.equal(guided({ memories: 1, keep: "physical" }).lowerPricedAlternative.sku, "moment");
  assert.equal(guided({ memories: 3, keep: "physical", arrangement: "together" }).option.sku, "keepsake-10-picture-disc");
  assert.equal(guided({ memories: 6, keep: "physical" }).option.sku, "journey-6");
  assert.equal(guided({ memories: 12, keep: "physical" }).option.sku, "journey-12");
});

test("guided: a separate Keepsake per memory, with the album shown when it is less", () => {
  const perDay = guided({ occasion: "trip", memories: 6, keep: "physical", arrangement: "separate" });
  assert.equal(perDay.option.sku, "keepsake-7-picture-disc");
  assert.equal(perDay.quantity, 6);
  assert.equal(perDay.totalMinor, 9900 * 6);
  assert.equal(perDay.lowerPricedAlternative.sku, "journey-6");
  assert.equal(asksArrangement({ memories: 3, keep: "physical" }), true);
  assert.equal(asksArrangement({ memories: 1, keep: "physical" }), false);
  assert.equal(asksArrangement({ memories: 3, keep: "digital" }), false);
});

test("guided: bespoke and beyond-capacity go to Bespoke with no price", () => {
  const bespoke = guided({ memories: 1, keep: "bespoke", budgetMinor: 1500 });
  assert.equal(bespoke.productId, "bespoke");
  assert.equal(bespoke.option, null);
  assert.equal(bespoke.totalMinor, null);
  assert.equal(bespoke.withinBudget, null);
  assert.equal(guided({ memories: 13, keep: "physical" }).productId, "bespoke");
});

test("guided: budget is disclosed, never used to change what was asked for", () => {
  const over = guided({ memories: 4, keep: "physical", budgetMinor: 9900 });
  assert.equal(over.option.sku, "keepsake-12-picture-disc");
  assert.equal(over.withinBudget, false);
  assert.equal(guided({ memories: 2, keep: "digital", budgetMinor: 3000 }).withinBudget, true);
  for (const keep of ["digital", "physical", "unsure", "bespoke"]) {
    for (let memories = 1; memories <= 13; memories++) {
      for (const arrangement of [null, "together", "separate"]) {
        assert.notEqual(guided({ memories, keep, arrangement }).productId, "heirloom");
      }
    }
  }
});
