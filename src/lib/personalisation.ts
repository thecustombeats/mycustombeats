/**
 * MCB PERSONALISATION — what a customer tells us, per song.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE MODEL
 * ─────────────────────────────────────────────────────────────────────────
 *   OrderDraft
 *     units[]        one per song product the customer is buying:
 *                    a Moment, each individual Keepsake, a Journey
 *       memories[]   one per song on that unit (catalogue songCount):
 *                    7" and heart Keepsake 1, 10" 3, 12" 4, Journey 6 or 12
 *     plaques[]      one per Personalised Music Plaque (photo, song, artist)
 *     frames[]       one per Lyrics Frame (size, which song, heading)
 *     players[]      gramophones / record player (no personalisation)
 *     priorityReplacementQuantity   0 by default, never above the Keepsakes
 *
 * Two Keepsakes are two independent units with their own memories: quantity
 * never means "the same record twice".
 *
 * Photos are NOT part of the draft. They are held in memory by the page,
 * keyed by the memory or plaque id, and never written to storage.
 */

import {
  ORDER_LIMITS,
  PERSONALISED_MUSIC_PLAQUE,
  PRIORITY_REPLACEMENT_SKU,
  getProduct,
  getVariant,
  previewOrder,
  type OrderLineRequest,
  type OrderPreview,
} from "../data/catalogue";
import { MAX_STYLE_LABEL_LENGTH, MCB_CHOICE_VALUE, OTHER_STYLE_VALUE } from "../data/musicStyles";

export const STORY_MAX = 300;
export const ABOUT_MAX = 120;
export const SONG_TITLE_MAX = 120;
export const ARTIST_MAX = 120;
export const FRAME_HEADING_MAX = 80;
export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Song products a customer may buy several of in one order: one per memory. */
export const MULTI_UNIT_PRODUCT_IDS: ReadonlySet<string> = new Set(["keepsake"]);

export interface MemoryDraft {
  id: string;
  /** The memory, in the customer's words. Up to STORY_MAX characters. */
  story: string;
  /** Who or what the song is for or about. Optional. */
  about: string;
  /** Occasion id from data/occasions, or "". Optional. */
  occasion: string;
  /** A style label, MCB_CHOICE_VALUE, OTHER_STYLE_VALUE, or "" when unset. */
  style: string;
  /** Free text used only when style is OTHER_STYLE_VALUE. */
  customStyle: string;
}

export interface UnitDraft {
  id: string;
  sku: string;
  memories: MemoryDraft[];
}

export interface PlaqueDraft {
  id: string;
  songTitle: string;
  artist: string;
}

export interface FrameDraft {
  id: string;
  sku: string;
  /** The memory whose song's lyrics are framed. */
  memoryId: string;
  heading: string;
}

export interface PlayerDraft {
  sku: string;
  quantity: number;
}

export interface OrderDraft {
  version: typeof DRAFT_VERSION;
  productId: string;
  sku: string;
  quantity: number;
  units: UnitDraft[];
  plaques: PlaqueDraft[];
  frames: FrameDraft[];
  players: PlayerDraft[];
  priorityReplacementQuantity: number;
}

/* ------------------------------------------------------------------ */
/* Construction                                                        */
/* ------------------------------------------------------------------ */

export const emptyMemory = (id: string): MemoryDraft => ({ id, story: "", about: "", occasion: "", style: "", customStyle: "" });

export const emptyDraft = (): OrderDraft => ({
  version: DRAFT_VERSION,
  productId: "",
  sku: "",
  quantity: 1,
  units: [],
  plaques: [],
  frames: [],
  players: [],
  priorityReplacementQuantity: 0,
});

/** Songs on one unit of a variant, from the catalogue. */
export const memoriesPerUnit = (sku: string): number => getVariant(sku)?.variant.songCount ?? 0;

export const unitId = (unitIndex: number) => `unit-${unitIndex + 1}`;
export const memoryId = (unitIndex: number, memoryIndex: number) => `unit-${unitIndex + 1}-memory-${memoryIndex + 1}`;

export const isSongSku = (sku: string): boolean => {
  const ref = getVariant(sku);
  return Boolean(ref && ref.product.category === "SONG_EXPERIENCE" && ref.product.onlineCheckout && ref.product.active);
};

export const maxUnitsFor = (productId: string): number =>
  MULTI_UNIT_PRODUCT_IDS.has(productId) ? ORDER_LIMITS.maxQuantityPerLine : 1;

/**
 * Makes the units match the chosen variant and quantity.
 *
 * Existing words are kept wherever the same unit and memory position still
 * exists, so changing from a 10-inch to a 12-inch Keepsake adds a fourth
 * memory rather than wiping the first three. Units and memories that no longer
 * exist are dropped. Nothing is ever copied from one unit to another.
 */
export const reconcileUnits = (draft: OrderDraft): OrderDraft => {
  if (!isSongSku(draft.sku)) {
    // No variant yet (e.g. Keepsake chosen, picture disc not). Words already
    // written are held until one is chosen, then kept by position.
    return { ...draft, priorityReplacementQuantity: 0 };
  }
  const product = getVariant(draft.sku)!.product;
  const quantity = Math.min(Math.max(Math.trunc(draft.quantity) || 1, 1), maxUnitsFor(product.id));
  const songs = memoriesPerUnit(draft.sku);

  const units: UnitDraft[] = Array.from({ length: quantity }, (_, u) => {
    const previous = draft.units[u];
    return {
      id: unitId(u),
      sku: draft.sku,
      memories: Array.from({ length: songs }, (_, m) => {
        const kept = previous?.memories[m];
        return kept ? { ...kept, id: memoryId(u, m) } : emptyMemory(memoryId(u, m));
      }),
    };
  });

  const memoryIds = new Set(units.flatMap((unit) => unit.memories.map((memory) => memory.id)));
  const eligible = getVariant(draft.sku)!.variant.priorityReplacementEligible ? quantity : 0;

  return {
    ...draft,
    productId: product.id,
    quantity,
    units,
    // A frame whose song no longer exists points at the first song instead.
    frames: draft.frames.map((frame) => (memoryIds.has(frame.memoryId) ? frame : { ...frame, memoryId: memoryId(0, 0) })),
    priorityReplacementQuantity: Math.min(Math.max(0, Math.trunc(draft.priorityReplacementQuantity) || 0), eligible),
  };
};

/** Chooses a variant. Quantity is kept within the same product unless given. */
export const chooseVariant = (draft: OrderDraft, sku: string, quantity?: number): OrderDraft => {
  const ref = getVariant(sku);
  if (!ref) return reconcileUnits({ ...draft, productId: "", sku: "" });
  const sameProduct = ref.product.id === draft.productId;
  return reconcileUnits({ ...draft, productId: ref.product.id, sku, quantity: quantity ?? (sameProduct ? draft.quantity : 1) });
};

const hasWords = (memory: MemoryDraft) => Boolean(memory.story.trim() || memory.about.trim());

/**
 * How many memories with words in them a change to this SKU and quantity
 * would discard, so the page can ask before losing someone's chapters.
 */
export const memoriesLostBy = (draft: OrderDraft, sku: string, quantity: number): number => {
  const songs = isSongSku(sku) ? memoriesPerUnit(sku) : 0;
  return draft.units.reduce(
    (lost, unit, u) => lost + unit.memories.filter((memory, m) => hasWords(memory) && (u >= quantity || m >= songs)).length,
    0
  );
};

export const chooseProduct = (draft: OrderDraft, productId: string): OrderDraft => {
  const product = getProduct(productId);
  if (!product || product.category !== "SONG_EXPERIENCE") return draft;
  if (draft.productId === productId) return draft;
  const sku = product.variants.length === 1 ? product.variants[0].sku : "";
  return reconcileUnits({ ...draft, productId, sku, quantity: 1 });
};

export const updateMemory = (draft: OrderDraft, id: string, change: Partial<Omit<MemoryDraft, "id">>): OrderDraft => ({
  ...draft,
  units: draft.units.map((unit) => ({
    ...unit,
    memories: unit.memories.map((memory) =>
      memory.id === id
        ? {
            ...memory,
            ...change,
            ...(change.story !== undefined ? { story: change.story.slice(0, STORY_MAX) } : {}),
            ...(change.about !== undefined ? { about: change.about.slice(0, ABOUT_MAX) } : {}),
          }
        : memory
    ),
  })),
});

/* ------------------------------------------------------------------ */
/* Add-ons                                                             */
/* ------------------------------------------------------------------ */

const nextId = (prefix: string, existing: readonly { id: string }[]) => {
  const used = new Set(existing.map((item) => item.id));
  let n = existing.length + 1;
  while (used.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
};

export const addPlaque = (draft: OrderDraft): OrderDraft => ({
  ...draft,
  plaques: [...draft.plaques, { id: nextId("plaque", draft.plaques), songTitle: "", artist: "" }],
});

export const addFrame = (draft: OrderDraft, sku: string): OrderDraft => ({
  ...draft,
  frames: [...draft.frames, { id: nextId("frame", draft.frames), sku, memoryId: draft.units[0]?.memories[0]?.id ?? "", heading: "" }],
});

export const setPlayer = (draft: OrderDraft, sku: string, quantity: number): OrderDraft => {
  const others = draft.players.filter((player) => player.sku !== sku);
  const q = Math.min(Math.max(Math.trunc(quantity) || 0, 0), ORDER_LIMITS.maxQuantityPerLine);
  return { ...draft, players: q > 0 ? [...others, { sku, quantity: q }] : others };
};

/** How many Priority Replacements this order may carry: one per eligible Keepsake. */
export const priorityReplacementLimit = (draft: OrderDraft): number =>
  draft.sku && getVariant(draft.sku)?.variant.priorityReplacementEligible ? draft.units.length : 0;

/* ------------------------------------------------------------------ */
/* Lines and price preview                                             */
/* ------------------------------------------------------------------ */

/** The SKU lines this draft would order. Prices come from the catalogue. */
export const draftLines = (draft: OrderDraft): OrderLineRequest[] => {
  if (!isSongSku(draft.sku) || draft.units.length === 0) return [];
  const lines: OrderLineRequest[] = [{ sku: draft.sku, quantity: draft.units.length }];
  if (draft.plaques.length > 0) lines.push({ sku: PERSONALISED_MUSIC_PLAQUE.variants[0].sku, quantity: draft.plaques.length });
  const frameCounts = new Map<string, number>();
  for (const frame of draft.frames) frameCounts.set(frame.sku, (frameCounts.get(frame.sku) ?? 0) + 1);
  for (const [sku, quantity] of frameCounts) lines.push({ sku, quantity });
  for (const player of draft.players) if (player.quantity > 0) lines.push({ sku: player.sku, quantity: player.quantity });
  const priority = Math.min(draft.priorityReplacementQuantity, priorityReplacementLimit(draft));
  if (priority > 0) lines.push({ sku: PRIORITY_REPLACEMENT_SKU, quantity: priority });
  return lines;
};

export const previewDraft = (draft: OrderDraft): OrderPreview => previewOrder(draftLines(draft));

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

export type MemoryField = "story" | "style" | "customStyle";

export interface MemoryIssue {
  memoryId: string;
  field: MemoryField;
  message: string;
}

export const memoryIssues = (memory: MemoryDraft): MemoryIssue[] => {
  const issues: MemoryIssue[] = [];
  const story = memory.story.trim();
  if (!story) issues.push({ memoryId: memory.id, field: "story", message: "Tell us about this memory." });
  else if (memory.story.length > STORY_MAX) issues.push({ memoryId: memory.id, field: "story", message: `Please keep this to ${STORY_MAX} characters.` });
  if (!memory.style) issues.push({ memoryId: memory.id, field: "style", message: "Choose a music style, or let MCB choose." });
  if (memory.style === OTHER_STYLE_VALUE) {
    if (!memory.customStyle.trim()) issues.push({ memoryId: memory.id, field: "customStyle", message: "Tell us the style you have in mind." });
    else if (memory.customStyle.trim().length > MAX_STYLE_LABEL_LENGTH) {
      issues.push({ memoryId: memory.id, field: "customStyle", message: `Please keep this under ${MAX_STYLE_LABEL_LENGTH} characters.` });
    }
  }
  return issues;
};

export const isMemoryComplete = (memory: MemoryDraft): boolean => memoryIssues(memory).length === 0;

export const storyIssues = (draft: OrderDraft): MemoryIssue[] =>
  draft.units.flatMap((unit) => unit.memories.flatMap(memoryIssues));

export interface AddOnIssue {
  id: string;
  field: "photo" | "songTitle" | "artist" | "memoryId";
  message: string;
}

/** `photoIds` are the plaque ids that currently have a photo attached. */
export const addOnIssues = (draft: OrderDraft, photoIds: ReadonlySet<string>): AddOnIssue[] => {
  const memoryIds = new Set(draft.units.flatMap((unit) => unit.memories.map((memory) => memory.id)));
  const issues: AddOnIssue[] = [];
  for (const plaque of draft.plaques) {
    if (!photoIds.has(plaque.id)) issues.push({ id: plaque.id, field: "photo", message: "Add the photograph for your plaque." });
    if (!plaque.songTitle.trim()) issues.push({ id: plaque.id, field: "songTitle", message: "Tell us the song title." });
    if (!plaque.artist.trim()) issues.push({ id: plaque.id, field: "artist", message: "Tell us the artist." });
  }
  for (const frame of draft.frames) {
    if (!memoryIds.has(frame.memoryId)) issues.push({ id: frame.id, field: "memoryId", message: "Choose which song's lyrics to frame." });
  }
  return issues;
};

/** The chosen style in words, for summaries. */
export const styleSummary = (memory: MemoryDraft): string =>
  memory.style === MCB_CHOICE_VALUE ? "MCB will choose the style" : memory.style === OTHER_STYLE_VALUE ? memory.customStyle.trim() : memory.style;

/** True when the customer has asked MCB to choose the style for this memory. */
export const mcbChoosesStyle = (memory: MemoryDraft): boolean => memory.style === MCB_CHOICE_VALUE;

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

/** "Keepsake 2 · Memory 3 of 4", "Chapter 5 of 12", "Your memory". */
export const memoryLabel = (draft: OrderDraft, unitIndex: number, memoryIndex: number): string => {
  const product = getProduct(draft.productId);
  const songs = draft.units[unitIndex]?.memories.length ?? 0;
  if (product?.id === "journey") return `Chapter ${memoryIndex + 1} of ${songs}`;
  const memory = songs > 1 ? `Memory ${memoryIndex + 1} of ${songs}` : "Your memory";
  return draft.units.length > 1 ? `${product?.name ?? "Item"} ${unitIndex + 1} · ${memory}` : memory;
};

/* ------------------------------------------------------------------ */
/* The order payload (sent once online checkout is enabled)            */
/* ------------------------------------------------------------------ */

export interface PersonalisationPayload {
  units: { sku: string; memories: { story: string; about: string; occasion: string; style: string; customStyle: string; photoUrl: string | null }[] }[];
  plaques: { songTitle: string; artist: string; photoUrl: string | null }[];
  frames: { sku: string; unit: number; memory: number; heading: string }[];
}

/**
 * The personalisation for the server, positionally aligned with the lines.
 * `photoUrls` maps memory and plaque ids to their uploaded URLs.
 */
export const personalisationPayload = (draft: OrderDraft, photoUrls: ReadonlyMap<string, string>): PersonalisationPayload => {
  const position = new Map<string, [number, number]>();
  draft.units.forEach((unit, u) => unit.memories.forEach((memory, m) => position.set(memory.id, [u + 1, m + 1])));
  return {
    units: draft.units.map((unit) => ({
      sku: unit.sku,
      memories: unit.memories.map((memory) => ({
        story: memory.story.trim(),
        about: memory.about.trim(),
        occasion: memory.occasion,
        style: memory.style,
        customStyle: memory.style === OTHER_STYLE_VALUE ? memory.customStyle.trim() : "",
        photoUrl: photoUrls.get(memory.id) ?? null,
      })),
    })),
    plaques: draft.plaques.map((plaque) => ({
      songTitle: plaque.songTitle.trim(),
      artist: plaque.artist.trim(),
      photoUrl: photoUrls.get(plaque.id) ?? null,
    })),
    frames: draft.frames.map((frame) => {
      const [unit, memory] = position.get(frame.memoryId) ?? [1, 1];
      return { sku: frame.sku, unit, memory, heading: frame.heading.trim() };
    }),
  };
};

/* ------------------------------------------------------------------ */
/* Draft storage — this device only, no photos, no contact details     */
/* ------------------------------------------------------------------ */

export const DRAFT_STORAGE_KEY = "mcb_create_draft_v1";

export const serialiseDraft = (draft: OrderDraft, now: number): string => JSON.stringify({ savedAt: now, draft });

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");

/**
 * Restores a saved draft, or null. Anything expired, malformed or referring
 * to a SKU the catalogue no longer sells is discarded rather than trusted.
 */
export const parseDraft = (raw: string | null, now: number): OrderDraft | null => {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown; draft?: Partial<OrderDraft> };
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > DRAFT_TTL_MS || now < parsed.savedAt) return null;
    const saved = parsed.draft;
    if (!saved || saved.version !== DRAFT_VERSION || typeof saved.sku !== "string" || !isSongSku(saved.sku)) return null;

    const base = chooseVariant(emptyDraft(), saved.sku, typeof saved.quantity === "number" ? saved.quantity : 1);
    const units = base.units.map((unit, u) => ({
      ...unit,
      memories: unit.memories.map((memory, m) => {
        const from = saved.units?.[u]?.memories?.[m] as Partial<MemoryDraft> | undefined;
        return from
          ? {
              ...memory,
              story: str(from.story, STORY_MAX),
              about: str(from.about, ABOUT_MAX),
              occasion: str(from.occasion, 40),
              style: str(from.style, MAX_STYLE_LABEL_LENGTH),
              customStyle: str(from.customStyle, MAX_STYLE_LABEL_LENGTH),
            }
          : memory;
      }),
    }));
    const frames = (saved.frames ?? [])
      .filter((frame): frame is FrameDraft => typeof frame?.sku === "string" && getVariant(frame.sku)?.product.id === "lyrics-frame")
      .map((frame, i) => ({ id: `frame-${i + 1}`, sku: frame.sku, memoryId: str(frame.memoryId, 40), heading: str(frame.heading, FRAME_HEADING_MAX) }));
    const plaques = (saved.plaques ?? []).slice(0, ORDER_LIMITS.maxQuantityPerLine).map((plaque, i) => ({
      id: `plaque-${i + 1}`,
      songTitle: str(plaque?.songTitle, SONG_TITLE_MAX),
      artist: str(plaque?.artist, ARTIST_MAX),
    }));
    const players = (saved.players ?? []).filter(
      (player): player is PlayerDraft => typeof player?.sku === "string" && getVariant(player.sku)?.product.category === "PLAYER"
    );

    return reconcileUnits({
      ...base,
      units,
      frames,
      plaques,
      players: players.map((p) => ({ sku: p.sku, quantity: Math.min(Math.max(Math.trunc(p.quantity) || 0, 0), ORDER_LIMITS.maxQuantityPerLine) })).filter((p) => p.quantity > 0),
      priorityReplacementQuantity: typeof saved.priorityReplacementQuantity === "number" ? saved.priorityReplacementQuantity : 0,
    });
  } catch {
    return null;
  }
};

/** True when the customer has entered anything worth keeping. */
export const draftHasContent = (draft: OrderDraft): boolean =>
  draft.units.some((unit) => unit.memories.some((memory) => memory.story.trim() || memory.about.trim() || memory.style)) ||
  draft.plaques.some((plaque) => plaque.songTitle || plaque.artist) ||
  draft.frames.length > 0;
