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
 *       priorityReplacement   chosen for THIS Keepsake; never preselected
 *     plaques[]      one per Personalised Music Plaque (photo, song, artist)
 *     frames[]       one per Lyrics Frame (size, which song, heading)
 *     players[]      gramophones / record player (no personalisation)
 *
 * Two Keepsakes are two independent units with their own memories: quantity
 * never means "the same record twice".
 *
 * Keepsake and Journey artwork is created by MCB from the customer's
 * photograph, so each of those records needs at least one. A photograph that
 * is not artwork-ready (square, at least 2500 × 2500 pixels) needs either a
 * replacement or the optional MCB Artwork Preparation Service, chosen before
 * payment (`artworkPreparation`).
 *
 * Photos are NOT part of the draft. They are held in memory by the page,
 * keyed by the memory or plaque id, and never written to storage. When the
 * order is placed they are uploaded to MCB's server, which from then on holds
 * the only copy that matters.
 *
 * The limits below are shared with the server (src/data/personalisationRules.ts
 * → public/api/data/personalisation.json), which refuses anything over them.
 */

import {
  ARTWORK_PHOTO_MIN_PX,
  ARTWORK_PREPARATION_SKU,
  MEMORY_MUSIC_VIDEO_SKU,
  ORDER_LIMITS,
  PERSONALISED_MUSIC_PLAQUE,
  PHOTO_ARTWORK_PRODUCT_IDS,
  PRIORITY_REPLACEMENT_SKU,
  getProduct,
  getVariant,
  previewOrder,
  type OrderLineRequest,
  type OrderPreview,
} from "../data/catalogue";
import { MAX_STYLE_LABEL_LENGTH, MCB_CHOICE_VALUE, OTHER_STYLE_VALUE } from "../data/musicStyles";
import { ABOUT_MAX, ARTIST_MAX, FRAME_HEADING_MAX, MULTI_UNIT_PRODUCT_IDS as MULTI_UNIT_IDS, SONG_TITLE_MAX, STORY_MAX } from "../data/personalisationRules";

export { ABOUT_MAX, ARTIST_MAX, FRAME_HEADING_MAX, SONG_TITLE_MAX, STORY_MAX };
export const DRAFT_VERSION = 1;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Song products a customer may buy several of in one order: one per memory. */
export const MULTI_UNIT_PRODUCT_IDS: ReadonlySet<string> = new Set(MULTI_UNIT_IDS);

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
  /** MCB Priority Replacement for this Keepsake. Eligible variants only; never preselected. */
  priorityReplacement: boolean;
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
  /** The customer chose the MCB Artwork Preparation Service. Never preselected. */
  artworkPreparation: boolean;
  /**
   * The song (memory id) the customer chose for an MCB Memory Music Video, or
   * null. Optional: never preselected and never included with a package.
   */
  memoryVideo?: string | null;
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
  artworkPreparation: false,
  memoryVideo: null,
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
    return { ...draft, units: draft.units.map((unit) => ({ ...unit, priorityReplacement: false })) };
  }
  const product = getVariant(draft.sku)!.product;
  const quantity = Math.min(Math.max(Math.trunc(draft.quantity) || 1, 1), maxUnitsFor(product.id));
  const songs = memoriesPerUnit(draft.sku);

  const eligible = getVariant(draft.sku)!.variant.priorityReplacementEligible;
  const units: UnitDraft[] = Array.from({ length: quantity }, (_, u) => {
    const previous = draft.units[u];
    return {
      id: unitId(u),
      sku: draft.sku,
      priorityReplacement: eligible && previous?.priorityReplacement === true,
      memories: Array.from({ length: songs }, (_, m) => {
        const kept = previous?.memories[m];
        return kept ? { ...kept, id: memoryId(u, m) } : emptyMemory(memoryId(u, m));
      }),
    };
  });

  const memoryIds = new Set(units.flatMap((unit) => unit.memories.map((memory) => memory.id)));

  return {
    ...draft,
    productId: product.id,
    quantity,
    units,
    // A frame whose song no longer exists points at the first song instead.
    frames: draft.frames.map((frame) => (memoryIds.has(frame.memoryId) ? frame : { ...frame, memoryId: memoryId(0, 0) })),
    // A Memory Music Video is never moved to another song: if its song is gone, the choice is removed.
    memoryVideo: draft.memoryVideo && memoryIds.has(draft.memoryVideo) ? draft.memoryVideo : null,
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

/** How many Keepsakes the customer has chosen Priority Replacement for. */
export const priorityReplacementCount = (draft: OrderDraft): number =>
  priorityReplacementLimit(draft) > 0 ? draft.units.filter((unit) => unit.priorityReplacement).length : 0;

/** Chooses (or removes) Priority Replacement for one Keepsake. Ineligible units never take it. */
export const setPriorityReplacement = (draft: OrderDraft, unitIndex: number, chosen: boolean): OrderDraft => {
  if (priorityReplacementLimit(draft) === 0) return draft;
  return { ...draft, units: draft.units.map((unit, u) => (u === unitIndex ? { ...unit, priorityReplacement: chosen } : unit)) };
};

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
  if (draft.memoryVideo && draft.units.some((unit) => unit.memories.some((memory) => memory.id === draft.memoryVideo))) {
    lines.push({ sku: MEMORY_MUSIC_VIDEO_SKU, quantity: 1 });
  }
  const priority = priorityReplacementCount(draft);
  if (priority > 0) lines.push({ sku: PRIORITY_REPLACEMENT_SKU, quantity: priority });
  if (draft.artworkPreparation && usesPhotoArtwork(draft)) lines.push({ sku: ARTWORK_PREPARATION_SKU, quantity: 1 });
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

/* ------------------------------------------------------------------ */
/* Photographs for artwork                                             */
/* ------------------------------------------------------------------ */

/** A photograph's pixel size, or null when the browser cannot read it (e.g. HEIC). */
export type PhotoCheck = { width: number; height: number } | null;

/** True when MCB creates this order's artwork from the customer's photograph. */
export const usesPhotoArtwork = (draft: Pick<OrderDraft, "productId">): boolean => PHOTO_ARTWORK_PRODUCT_IDS.has(draft.productId);

/** Square within 1% and at least the artwork minimum on both sides. Larger is welcome. */
export const isArtworkReady = (check: PhotoCheck | undefined): boolean =>
  Boolean(
    check &&
      check.width >= ARTWORK_PHOTO_MIN_PX &&
      check.height >= ARTWORK_PHOTO_MIN_PX &&
      Math.abs(check.width - check.height) <= Math.floor(Math.max(check.width, check.height) * 0.01)
  );

export interface PhotoIssue {
  /** A unit id (no photo for that record) or a memory id (photo not artwork-ready). */
  id: string;
  kind: "missing" | "not_ready" | "checking";
  message: string;
}

/**
 * What stops a Keepsake or Journey going ahead for want of a suitable photo.
 * `checks` holds each attached photo's size; an attached photo not yet
 * measured is "checking".
 */
export const photoIssues = (
  draft: OrderDraft,
  photoIds: ReadonlySet<string>,
  checks: ReadonlyMap<string, PhotoCheck>
): PhotoIssue[] => {
  if (!usesPhotoArtwork(draft)) return [];
  const product = getProduct(draft.productId);
  const issues: PhotoIssue[] = [];
  draft.units.forEach((unit, u) => {
    const withPhoto = unit.memories.filter((memory) => photoIds.has(memory.id));
    if (withPhoto.length === 0) {
      const what = product?.id === "journey" ? "your Journey" : draft.units.length > 1 ? `${product?.name ?? "record"} ${u + 1}` : `your ${product?.name ?? "record"}`;
      issues.push({ id: unit.id, kind: "missing", message: `Please add a photograph for the artwork of ${what}.` });
    }
    for (const memory of withPhoto) {
      if (!checks.has(memory.id)) {
        issues.push({ id: memory.id, kind: "checking", message: "One moment — we're checking your photograph." });
      } else if (!draft.artworkPreparation && !isArtworkReady(checks.get(memory.id))) {
        issues.push({ id: memory.id, kind: "not_ready", message: "A photograph isn't artwork-ready: choose a square photo of at least 2500 × 2500 pixels, or add MCB Artwork Preparation." });
      }
    }
  });
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
/* The order personalisation, as MCB's server receives it              */
/* ------------------------------------------------------------------ */

export type StyleChoice = { choice: "MCB_CHOICE" } | { choice: "STYLE"; label: string } | { choice: "CUSTOM"; label: string };

export interface PersonalisationPayload {
  units: {
    sku: string;
    priorityReplacement: boolean;
    memories: { story: string; about: string; occasion: string; style: StyleChoice; photo: boolean; video?: true }[];
  }[];
  plaques: { songTitle: string; artist: string }[];
  frames: { sku: string; unit: number; memory: number; heading: string }[];
}

export const styleChoice = (memory: MemoryDraft): StyleChoice =>
  memory.style === MCB_CHOICE_VALUE
    ? { choice: "MCB_CHOICE" }
    : memory.style === OTHER_STYLE_VALUE
      ? { choice: "CUSTOM", label: memory.customStyle.trim() }
      : { choice: "STYLE", label: memory.style };

/**
 * The personalisation for the server, positionally aligned with the lines.
 *
 * Carries only what MCB needs to make the order. Photos are not in it: `photo`
 * says a photo will follow, and `uploadSlots` lists what to upload once the
 * order exists. `photoIds` are the memory and plaque ids that have a photo.
 */
export const personalisationPayload = (draft: OrderDraft, photoIds: ReadonlySet<string>): PersonalisationPayload => {
  const position = new Map<string, [number, number]>();
  draft.units.forEach((unit, u) => unit.memories.forEach((memory, m) => position.set(memory.id, [u + 1, m + 1])));
  const eligible = priorityReplacementLimit(draft) > 0;
  return {
    units: draft.units.map((unit) => ({
      sku: unit.sku,
      priorityReplacement: eligible && unit.priorityReplacement,
      memories: unit.memories.map((memory) => ({
        story: memory.story.trim(),
        about: memory.about.trim(),
        occasion: memory.occasion,
        style: styleChoice(memory),
        photo: photoIds.has(memory.id),
        ...(draft.memoryVideo === memory.id ? { video: true as const } : {}),
      })),
    })),
    plaques: draft.plaques.map((plaque) => ({ songTitle: plaque.songTitle.trim(), artist: plaque.artist.trim() })),
    frames: draft.frames.map((frame) => {
      const [unit, memory] = position.get(frame.memoryId) ?? [1, 1];
      return { sku: frame.sku, unit, memory, heading: frame.heading.trim() };
    }),
  };
};

/**
 * The photos to upload after the order is saved, by the slot names the server
 * uses: "memory:<unit>:<song>" and "plaque:<n>". The customer's own file is
 * sent; its name is never used by MCB.
 */
export const uploadSlots = <T>(draft: OrderDraft, photos: ReadonlyMap<string, T>): { slot: string; photoId: string; file: T }[] => {
  const slots: { slot: string; photoId: string; file: T }[] = [];
  draft.units.forEach((unit, u) =>
    unit.memories.forEach((memory, m) => {
      const file = photos.get(memory.id);
      if (file !== undefined) slots.push({ slot: `memory:${u + 1}:${m + 1}`, photoId: memory.id, file });
    })
  );
  draft.plaques.forEach((plaque, p) => {
    const file = photos.get(plaque.id);
    if (file !== undefined) slots.push({ slot: `plaque:${p + 1}`, photoId: plaque.id, file });
  });
  return slots;
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

    // Drafts saved before Priority Replacement was chosen per Keepsake held a
    // count; it is applied to the first Keepsakes rather than silently lost.
    const legacyCount = (saved as { priorityReplacementQuantity?: unknown }).priorityReplacementQuantity;
    const chosen = (u: number) =>
      saved.units?.[u]?.priorityReplacement === true || (typeof legacyCount === "number" && u < legacyCount);

    return reconcileUnits({
      ...base,
      artworkPreparation: (saved as { artworkPreparation?: unknown }).artworkPreparation === true && PHOTO_ARTWORK_PRODUCT_IDS.has(base.productId),
      memoryVideo: typeof (saved as { memoryVideo?: unknown }).memoryVideo === "string" ? str((saved as { memoryVideo: string }).memoryVideo, 40) : null,
      units: units.map((unit, u) => ({ ...unit, priorityReplacement: chosen(u) })),
      frames,
      plaques,
      players: players.map((p) => ({ sku: p.sku, quantity: Math.min(Math.max(Math.trunc(p.quantity) || 0, 0), ORDER_LIMITS.maxQuantityPerLine) })).filter((p) => p.quantity > 0),
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
