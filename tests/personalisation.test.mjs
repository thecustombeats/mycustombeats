/**
 * MCB personalisation model — one set of memories per song product unit.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { buildSync } from "esbuild";

const root = new URL("..", import.meta.url).pathname;
const load = async (path) => {
  const { outputFiles } = buildSync({ entryPoints: [join(root, path)], bundle: true, write: false, platform: "node", format: "esm" });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString("base64")}`);
};
const P = await load("src/lib/personalisation.ts");
const { MCB_CHOICE_VALUE, OTHER_STYLE_VALUE } = await load("src/data/musicStyles.ts");

const draftFor = (sku, quantity) => P.chooseVariant(P.emptyDraft(), sku, quantity);
const shape = (draft) => draft.units.map((unit) => unit.memories.length);

test("memory blocks follow the catalogue song count for every song product", () => {
  assert.deepEqual(shape(draftFor("moment")), [1]);
  assert.deepEqual(shape(draftFor("keepsake-7-picture-disc")), [1]);
  assert.deepEqual(shape(draftFor("keepsake-10-heart-picture-disc")), [1]);
  assert.deepEqual(shape(draftFor("keepsake-10-picture-disc")), [3]);
  assert.deepEqual(shape(draftFor("keepsake-12-picture-disc")), [4]);
  assert.deepEqual(shape(draftFor("journey-6")), [6]);
  assert.deepEqual(shape(draftFor("journey-12")), [12]);
});

test("multiple Keepsakes are independent units with their own memories", () => {
  let draft = draftFor("keepsake-12-picture-disc", 3);
  assert.deepEqual(shape(draft), [4, 4, 4]);
  const ids = draft.units.flatMap((u) => u.memories.map((m) => m.id));
  assert.equal(new Set(ids).size, 12, "every memory has its own id");

  draft = P.updateMemory(draft, "unit-1-memory-1", { story: "Sailaway from Southampton", style: MCB_CHOICE_VALUE });
  assert.equal(draft.units[0].memories[0].story, "Sailaway from Southampton");
  assert.equal(draft.units[1].memories[0].story, "", "a second Keepsake does not share the first one's story");
  assert.equal(draft.units[2].memories[0].style, "", "or its style");
});

test("Moment and Journey are one unit; only Keepsake takes a quantity", () => {
  assert.equal(draftFor("moment", 5).units.length, 1);
  assert.equal(draftFor("journey-12", 3).units.length, 1);
  assert.equal(draftFor("keepsake-7-picture-disc", 8).units.length, 8);
  assert.equal(draftFor("keepsake-7-picture-disc", 999).units.length, 50, "technical request limit only");
});

test("changing variant keeps existing words and warns about anything that would be lost", () => {
  let draft = draftFor("keepsake-10-picture-disc", 2);
  draft = P.updateMemory(draft, "unit-1-memory-3", { story: "Formal night" });
  draft = P.updateMemory(draft, "unit-2-memory-1", { story: "First port" });
  const bigger = P.chooseVariant(draft, "keepsake-12-picture-disc");
  assert.equal(bigger.units[0].memories[2].story, "Formal night");
  assert.equal(bigger.units[0].memories.length, 4);
  assert.equal(bigger.units.length, 2, "quantity kept within the same product");
  assert.equal(P.memoriesLostBy(draft, "keepsake-7-picture-disc", 2), 1);
  assert.equal(P.memoriesLostBy(draft, "keepsake-10-picture-disc", 1), 1);
  assert.equal(P.memoriesLostBy(draft, "keepsake-12-picture-disc", 2), 0);
});

test("every Journey chapter has its own style, and MCB can choose per chapter", () => {
  let draft = draftFor("journey-6");
  draft = P.updateMemory(draft, "unit-1-memory-1", { story: "Barcelona", style: "Jazz" });
  draft = P.updateMemory(draft, "unit-1-memory-2", { story: "Sea day", style: MCB_CHOICE_VALUE });
  draft = P.updateMemory(draft, "unit-1-memory-3", { story: "Rome", style: OTHER_STYLE_VALUE, customStyle: "Italian folk" });
  const [a, b, c, d] = draft.units[0].memories;
  assert.equal(a.style, "Jazz");
  assert.equal(P.mcbChoosesStyle(b), true);
  assert.equal(P.mcbChoosesStyle(a), false);
  assert.equal(c.customStyle, "Italian folk");
  assert.deepEqual(P.memoryIssues(a), []);
  assert.deepEqual(P.memoryIssues(b), []);
  assert.deepEqual(P.memoryIssues(c), []);
  assert.deepEqual(P.memoryIssues(d).map((i) => i.field), ["story", "style"]);
  assert.equal(P.memoryLabel(draft, 0, 4), "Chapter 5 of 6");
});

test("the story is limited to 300 characters", () => {
  assert.equal(P.STORY_MAX, 300);
  const draft = P.updateMemory(draftFor("moment"), "unit-1-memory-1", { story: "x".repeat(450), style: MCB_CHOICE_VALUE });
  assert.equal(draft.units[0].memories[0].story.length, 300);
  const over = { ...draft.units[0].memories[0], story: "y".repeat(301) };
  assert.ok(P.memoryIssues(over).some((i) => i.field === "story"));
  const custom = { ...draft.units[0].memories[0], style: OTHER_STYLE_VALUE, customStyle: "" };
  assert.ok(P.memoryIssues(custom).some((i) => i.field === "customStyle"));
});

test("labels read naturally for each product", () => {
  assert.equal(P.memoryLabel(draftFor("moment"), 0, 0), "Your memory");
  assert.equal(P.memoryLabel(draftFor("keepsake-12-picture-disc"), 0, 1), "Memory 2 of 4");
  assert.equal(P.memoryLabel(draftFor("keepsake-12-picture-disc", 2), 1, 3), "Keepsake 2 · Memory 4 of 4");
  assert.equal(P.memoryLabel(draftFor("keepsake-7-picture-disc", 3), 2, 0), "Keepsake 3 · Your memory");
});

test("Priority Replacement is chosen per Keepsake, never preselected, and only for Keepsakes", () => {
  for (const sku of ["moment", "journey-6", "journey-12", "keepsake-7-picture-disc", "keepsake-12-picture-disc"]) {
    assert.equal(P.priorityReplacementCount(draftFor(sku, 2)), 0, `${sku} starts without it`);
    assert.ok(draftFor(sku, 2).units.every((unit) => unit.priorityReplacement === false));
  }
  assert.equal(P.priorityReplacementLimit(draftFor("moment")), 0);
  assert.equal(P.priorityReplacementLimit(draftFor("journey-12")), 0);
  assert.equal(P.priorityReplacementLimit(draftFor("keepsake-10-heart-picture-disc", 3)), 3);

  let withPr = draftFor("keepsake-7-picture-disc", 3);
  withPr = P.setPriorityReplacement(withPr, 0, true);
  withPr = P.setPriorityReplacement(withPr, 2, true);
  assert.deepEqual(withPr.units.map((u) => u.priorityReplacement), [true, false, true], "for exactly the Keepsakes chosen");
  assert.equal(P.priorityReplacementCount(withPr), 2);
  assert.deepEqual(P.chooseVariant(withPr, "keepsake-7-picture-disc", 2).units.map((u) => u.priorityReplacement), [true, false], "removed with its Keepsake");
  assert.equal(P.priorityReplacementCount(P.chooseVariant(withPr, "journey-6")), 0, "removed for Journey");
  assert.equal(P.priorityReplacementCount(P.setPriorityReplacement(draftFor("journey-6"), 0, true)), 0, "a Journey cannot take it");
});

test("lines are built from the draft and priced by the catalogue", () => {
  let draft = draftFor("keepsake-12-picture-disc", 2);
  draft = P.addPlaque(draft);
  // Lyrics Frames were withdrawn from the customer surface (Founder decision,
  // 16 September 2026); a pop-up card is the physical add-on now.
  draft = P.setPlayer(draft, "pop-up-card-wedding", 2);
  draft = P.setPlayer(draft, "portable-suitcase-record-player", 1);
  draft = P.setPriorityReplacement(P.setPriorityReplacement(draft, 0, true), 1, true);
  assert.deepEqual(P.draftLines(draft), [
    { sku: "keepsake-12-picture-disc", quantity: 2 },
    { sku: "personalised-music-plaque", quantity: 1 },
    { sku: "pop-up-card-wedding", quantity: 2 },
    { sku: "portable-suitcase-record-player", quantity: 1 },
    { sku: "priority-replacement", quantity: 2 },
  ]);
  const preview = P.previewDraft(draft);
  assert.equal(preview.ok, true);
  assert.equal(preview.totalMinor, 2 * 14999 + 4999 + 2 * 4999 + 20000 + 2 * 1999);
  assert.equal(preview.requiresShipping, true);
  assert.equal(P.previewDraft(draftFor("moment")).requiresShipping, false);
});

test("a plaque needs its own photo, song title and artist", () => {
  let draft = P.addPlaque(draftFor("moment"));
  const id = draft.plaques[0].id;
  assert.deepEqual(P.addOnIssues(draft, new Set()).map((i) => i.field).sort(), ["artist", "photo", "songTitle"]);
  draft = { ...draft, plaques: [{ id, songTitle: "Moon River", artist: "Audrey Hepburn" }] };
  assert.deepEqual(P.addOnIssues(draft, new Set([id])), []);
});

test("a lyrics frame points at one of the order's songs", () => {
  let draft = P.addFrame(draftFor("journey-6"), "lyrics-frame-10x15");
  assert.equal(draft.frames[0].memoryId, "unit-1-memory-1");
  draft = { ...draft, frames: [{ ...draft.frames[0], memoryId: "unit-1-memory-5" }] };
  const payload = P.personalisationPayload(draft, new Set());
  assert.deepEqual(payload.frames, [{ sku: "lyrics-frame-10x15", unit: 1, memory: 5, heading: "" }]);
  assert.equal(P.chooseVariant(draft, "moment").frames[0].memoryId, "unit-1-memory-1", "re-pointed when the song disappears");
});

test("saved drafts restore words but never photos, and expire", () => {
  let draft = draftFor("journey-12");
  draft = P.updateMemory(draft, "unit-1-memory-12", { story: "Last night aboard", style: "Soul" });
  draft = P.addPlaque(draft);
  const now = Date.UTC(2026, 8, 14);
  const raw = P.serialiseDraft(draft, now);
  assert.ok(!/photo|blob|data:image/i.test(raw), "no photo data in storage");
  const restored = P.parseDraft(raw, now + 60_000);
  assert.equal(restored.units[0].memories[11].story, "Last night aboard");
  assert.equal(restored.plaques.length, 1);
  assert.equal(P.parseDraft(raw, now + P.DRAFT_TTL_MS + 1), null, "expired");
  assert.equal(P.parseDraft(raw.replace("journey-12", "heirloom"), now), null, "unknown SKUs are discarded");
  assert.equal(P.parseDraft("{not json", now), null);
});

test("switching product keeps words until the new variant is chosen", () => {
  let draft = P.updateMemory(draftFor("moment"), "unit-1-memory-1", { story: "Our first dance" });
  draft = P.chooseProduct(draft, "keepsake");
  assert.equal(draft.sku, "");
  assert.equal(P.draftLines(draft).length, 0, "nothing orderable until a picture disc is chosen");
  draft = P.chooseVariant(draft, "keepsake-12-picture-disc");
  assert.equal(draft.units[0].memories[0].story, "Our first dance");
  assert.equal(draft.units[0].memories.length, 4);
});

test("drafts saved with a Priority Replacement count still restore it, per Keepsake", () => {
  const now = Date.UTC(2026, 8, 14);
  const legacy = JSON.stringify({ savedAt: now, draft: { version: 1, productId: "keepsake", sku: "keepsake-7-picture-disc", quantity: 3, units: [], plaques: [], frames: [], players: [], priorityReplacementQuantity: 2 } });
  assert.deepEqual(P.parseDraft(legacy, now).units.map((u) => u.priorityReplacement), [true, true, false]);
  const current = P.serialiseDraft(P.setPriorityReplacement(draftFor("keepsake-10-picture-disc", 2), 1, true), now);
  assert.deepEqual(P.parseDraft(current, now).units.map((u) => u.priorityReplacement), [false, true]);
});

test("the server payload carries each memory, its style choice and whether a photo follows — never a photo or price", () => {
  let draft = draftFor("keepsake-10-picture-disc", 2);
  draft = P.updateMemory(draft, "unit-1-memory-1", { story: "  Sailaway  ", about: "Mum", occasion: "cruise", style: MCB_CHOICE_VALUE });
  draft = P.updateMemory(draft, "unit-1-memory-2", { story: "Lisbon", style: OTHER_STYLE_VALUE, customStyle: " Fado " });
  draft = P.updateMemory(draft, "unit-2-memory-3", { story: "Last dinner", style: "Jazz" });
  draft = P.setPriorityReplacement(draft, 1, true);
  draft = P.addPlaque(draft);
  const photos = new Map([["unit-2-memory-3", "file-a"], [draft.plaques[0].id, "file-b"]]);
  const payload = P.personalisationPayload(draft, new Set(photos.keys()));

  assert.equal(payload.units.length, 2);
  assert.deepEqual(payload.units.map((u) => u.priorityReplacement), [false, true]);
  assert.deepEqual(payload.units[0].memories[0], { story: "Sailaway", about: "Mum", occasion: "cruise", style: { choice: "MCB_CHOICE" }, photo: false });
  assert.deepEqual(payload.units[0].memories[1].style, { choice: "CUSTOM", label: "Fado" });
  assert.deepEqual(payload.units[1].memories[2].style, { choice: "STYLE", label: "Jazz" });
  assert.equal(payload.units[1].memories[2].photo, true);
  assert.ok(!/price|minor|amount|total|file-|blob/i.test(JSON.stringify(payload)), "no prices and no photo data");

  assert.deepEqual(P.uploadSlots(draft, photos).map((s) => [s.slot, s.file]), [["memory:2:3", "file-a"], ["plaque:1", "file-b"]]);
});
