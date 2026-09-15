/**
 * MCB CREATIVE FACTORY — policy and contracts, as data. INTERNAL.
 *
 * Generated into the server-only `api/data/creative.json` and never imported
 * by a customer page. Provider-independent: no music-generation provider is
 * selected (PROVIDER_DECISION_STATUS = DEFERRED), no provider format is the
 * canonical representation, and nothing here holds a key, a price or an
 * account.
 *
 * Two policies are deliberately separate:
 *   CREATIVE_DURATION_POLICY        how long an MCB song should be
 *   PHYSICAL_MEDIA_CAPACITY_POLICY  what a physical format can verifiably hold
 * A creative ceiling is never evidence that a vinyl can carry it.
 *
 * NOTHING HERE IS INVENTED. Unknown manufacturing capacity is UNVERIFIED with
 * null values; unknown provider capabilities are UNKNOWN.
 */

import { PRODUCTS } from "../catalogue/products";

/* ------------------------------------------------------------------ */
/* 1. Creative duration                                                 */
/* ------------------------------------------------------------------ */

export const CREATIVE_DURATION_POLICY = {
  /** The canonical MCB song: 3 minutes 15 seconds. */
  targetSeconds: 195,
  /** A ceiling, never the default. */
  maxSeconds: 300,
  /**
   * A composition plan's total must be within this percentage of its target
   * (and never above maxSeconds). Internal planning tolerance, not a customer promise.
   */
  planTolerancePercent: 10,
  /**
   * An optional preferred window for a finished song. Not set by the Founders:
   * technical QC then records the deviation from the target but rejects only
   * an unreadable, empty or over-ceiling file. Configure on the server with
   * creative.duration.preferred_min_seconds / preferred_max_seconds.
   */
  preferredMinSeconds: null as number | null,
  preferredMaxSeconds: null as number | null,
} as const;

/** The normal target programme for a product: songs × target (e.g. 4 × 195 = 780 s). */
export const targetProgrammeSeconds = (songCount: number): number => songCount * CREATIVE_DURATION_POLICY.targetSeconds;

/* ------------------------------------------------------------------ */
/* 2. Physical media capacity (never invented)                          */
/* ------------------------------------------------------------------ */

export type CapacityStatus = "UNVERIFIED" | "VERIFIED";

export interface PhysicalCapacityProfile {
  readonly sku: string;
  readonly format: string;
  readonly discCount: number;
  readonly sideCount: number;
  readonly songCount: number;
  readonly verifiedTotalCapacitySeconds: number | null;
  readonly verifiedPerSideSeconds: number | null;
  readonly preferredProgrammeSeconds: number | null;
  readonly hardManufacturingMaximumSeconds: number | null;
  readonly source: string | null;
  readonly version: number;
  readonly status: CapacityStatus;
  readonly masteringNotes: readonly string[];
  readonly supplierRestrictions: readonly string[];
  readonly lastVerifiedDate: string | null;
}

/**
 * One profile per physical record SKU, from the CURRENT catalogue. Side count
 * follows the catalogue's disc count (two sides per disc). Every capacity is
 * UNVERIFIED until the Founders supply manufacturer-verified figures, which
 * the server reads from api/data/physical-capacity.json (uploaded, validated).
 */
export const PHYSICAL_MEDIA_CAPACITY_POLICY: readonly PhysicalCapacityProfile[] = PRODUCTS.flatMap((product) =>
  product.variants
    .filter((variant) => variant.fulfilment === "PHYSICAL" && variant.vinyl && variant.songCount)
    .map((variant) => ({
      sku: variant.sku,
      format: `${variant.vinyl!.sizeInches}-inch ${variant.vinyl!.pictureDisc ? "picture disc" : "standard vinyl"}${variant.vinyl!.shape === "HEART" ? " (heart)" : ""}${variant.vinyl!.gatefold ? " gatefold" : ""}`,
      discCount: variant.vinyl!.discCount,
      sideCount: variant.vinyl!.discCount * 2,
      songCount: variant.songCount!,
      verifiedTotalCapacitySeconds: null,
      verifiedPerSideSeconds: null,
      preferredProgrammeSeconds: null,
      hardManufacturingMaximumSeconds: null,
      source: null,
      version: 1,
      status: "UNVERIFIED" as const,
      masteringNotes: [],
      supplierRestrictions: [],
      lastVerifiedDate: null,
    }))
);

/* ------------------------------------------------------------------ */
/* 3. Fact Ledger                                                       */
/* ------------------------------------------------------------------ */

export const FACT_TYPES = [
  "NAME", "RELATIONSHIP", "DATE", "YEAR", "PLACE", "OCCASION", "MILESTONE", "MEMORY", "TRAVEL_MEMORY",
  "REQUESTED_PHRASE", "MUSIC_DIRECTION", "MOOD", "EXCLUSION", "OTHER",
] as const;

/**
 * EXACT: must stay factually exact wherever used (a name, a date).
 * SEMANTIC: the meaning must stay correct (a memory, a relationship).
 * CREATIVE_GUIDANCE: MCB may interpret creatively (a mood, "let MCB choose").
 */
export const FACT_CLASSIFICATIONS = ["EXACT", "SEMANTIC", "CREATIVE_GUIDANCE"] as const;
export const FACT_IMPORTANCE = ["CRITICAL", "HIGH", "NORMAL"] as const;
export const FACT_VERIFICATION = ["CUSTOMER_SUPPLIED", "STAFF_VERIFIED", "UNVERIFIED"] as const;

/* ------------------------------------------------------------------ */
/* 4. Story, album, lyrics, music direction, composition plan           */
/* ------------------------------------------------------------------ */

export const STORY_SECTIONS = ["OPENING", "PROGRESSION", "IMPORTANT_MEMORIES", "EMOTIONAL_BUILD", "CENTRAL_STATEMENT", "CLIMAX", "RESOLUTION"] as const;

export const ALBUM_NARRATIVE_ROLES = ["OPENING", "CHAPTER", "TURNING_POINT", "REFLECTION", "CELEBRATION", "CLOSING"] as const;

export const LYRIC_SECTION_TYPES = ["INTRO", "VERSE", "PRE_CHORUS", "CHORUS", "BRIDGE", "OUTRO", "INSTRUMENTAL", "SPOKEN"] as const;

export const COMPOSITION_SECTION_TYPES = LYRIC_SECTION_TYPES;

export const ADHERENCE_IMPORTANCE = ["STRICT", "HIGH", "FLEXIBLE"] as const;

/**
 * Genre families MCB directs in. Not limited to these: a Music Direction may
 * name any genre. Artist-like requests are translated into musical
 * characteristics; the architecture never imitates a named artist.
 */
export const GENRE_FAMILIES = ["pop", "rock", "country", "dance", "ballad", "jazz", "swing", "ballroom", "waltz", "soul", "folk", "acoustic", "classical", "electronic", "latin", "reggae", "blues", "gospel", "r&b", "hip-hop", "indie", "funk", "disco", "orchestral"] as const;

/** The customer's catalogued style → a genre family and era influence. Unmapped styles keep the label as the genre. */
export const STYLE_TO_DIRECTION: Readonly<Record<string, { readonly genre: string; readonly era?: string }>> = {
  "1950s": { genre: "rock", era: "1950s" }, "1960s": { genre: "pop", era: "1960s" }, "1970s": { genre: "soft rock", era: "1970s" },
  "1980s": { genre: "pop", era: "1980s" }, "1990s": { genre: "pop", era: "1990s" },
  Ballroom: { genre: "ballroom" }, Waltz: { genre: "waltz" }, Swing: { genre: "swing" }, Jazz: { genre: "jazz" }, Soul: { genre: "soul" },
  "Motown-inspired": { genre: "soul", era: "1960s" }, Disco: { genre: "disco" }, Funk: { genre: "funk" }, Blues: { genre: "blues" },
  Gospel: { genre: "gospel" }, Classical: { genre: "classical" }, Orchestral: { genre: "orchestral" }, Pop: { genre: "pop" }, Rock: { genre: "rock" },
  "Soft Rock": { genre: "rock" }, Acoustic: { genre: "acoustic" }, Folk: { genre: "folk" }, Country: { genre: "country" }, "R&B": { genre: "r&b" },
  "Hip-Hop": { genre: "hip-hop" }, Trap: { genre: "hip-hop" }, Drill: { genre: "hip-hop" }, Indie: { genre: "indie" }, Alternative: { genre: "rock" },
  House: { genre: "dance" }, Dance: { genre: "dance" }, Electronic: { genre: "electronic" }, "Drum & Bass": { genre: "electronic" },
  Reggae: { genre: "reggae" }, Latin: { genre: "latin" }, Afrobeats: { genre: "dance" },
};

/** The fields of the MCB-owned Music Direction object. */
export const MUSIC_DIRECTION_FIELDS = [
  "genre", "subgenre", "era_influence", "bpm_min", "bpm_max", "key", "mode", "time_signature", "instrumentation", "vocal_presentation",
  "vocal_intensity", "mood", "energy", "production_character", "language", "positive_directions", "negative_directions",
  "target_duration_seconds", "max_duration_seconds",
] as const;

/* ------------------------------------------------------------------ */
/* 5. Providers — decision DEFERRED                                     */
/* ------------------------------------------------------------------ */

export const PROVIDER_DECISION_STATUS = "DEFERRED" as const;
export const PROVIDER_ROLES = ["PRIMARY", "FALLBACK", "MANUAL", "DISABLED"] as const;

export const PROVIDER_CAPABILITY_FIELDS = [
  "supplied_lyrics", "structured_composition_plans", "duration_maximum_seconds", "downloadable_audio_formats", "lossless_output",
  "stems", "reference_audio", "editing_inpainting", "asynchronous_jobs", "multilingual", "pronunciation_control",
  "seed_reproducibility", "metadata", "commercial_use_review", "privacy_review", "api_availability", "cost_model",
] as const;

type Capabilities = Readonly<Record<(typeof PROVIDER_CAPABILITY_FIELDS)[number], "UNKNOWN" | "NOT_APPLICABLE">>;
const allUnknown = Object.fromEntries(PROVIDER_CAPABILITY_FIELDS.map((f) => [f, "UNKNOWN"])) as Capabilities;

/**
 * Candidates the Founders named for later evaluation. Every capability is
 * UNKNOWN: nothing about a provider is assumed, and none has an adapter,
 * a key or a role. MANUAL is MCB staff registering audio made elsewhere.
 */
export const PROVIDER_REGISTRY: readonly { readonly id: string; readonly label: string; readonly kind: "CANDIDATE" | "MANUAL"; readonly role: (typeof PROVIDER_ROLES)[number]; readonly adapter: string | null; readonly capabilities: Capabilities }[] = [
  { id: "manual", label: "Manual generation (staff-registered audio)", kind: "MANUAL", role: "MANUAL", adapter: "MANUAL", capabilities: Object.fromEntries(PROVIDER_CAPABILITY_FIELDS.map((f) => [f, "NOT_APPLICABLE"])) as Capabilities },
  { id: "candidate-eleven-music", label: "Eleven Music (candidate, not evaluated)", kind: "CANDIDATE", role: "DISABLED", adapter: null, capabilities: allUnknown },
  { id: "candidate-mozart-ai", label: "Mozart AI (candidate, not evaluated)", kind: "CANDIDATE", role: "DISABLED", adapter: null, capabilities: allUnknown },
];

/* ------------------------------------------------------------------ */
/* 6. Generation, QC and masters                                        */
/* ------------------------------------------------------------------ */

/** Maximum generation attempts per song unless the server configures another (creative.max_generation_attempts). */
export const DEFAULT_MAX_GENERATION_ATTEMPTS = 3;

export const ATTEMPT_OUTCOMES = ["PROVIDER_FAIL", "TECHNICAL_FAIL", "FACT_FAIL", "CREATIVE_FAIL", "PASS"] as const;

export const CREATIVE_QC_CRITERIA = [
  "emotional_impact", "lyric_quality", "vocal_quality", "musical_quality", "production_quality",
  "genre_fit", "story_fit", "memorability", "pronunciation", "premium_standard",
] as const;
export const CREATIVE_QC_OUTCOMES = ["PASS", "REGENERATE", "ESCALATE"] as const;

export const ALBUM_REVIEW_CRITERIA = ["narrative_progression", "musical_cohesion", "deliberate_variation"] as const;

export const MASTER_KINDS = ["PRODUCTION_MASTER", "CUSTOMER_LISTENING_COPY", "PHYSICAL_MEDIA_MASTER"] as const;

/** Audio containers technical QC can read headers from. No format is the mandated archival master. */
export const AUDIO_CONTAINERS = ["WAV", "FLAC", "AIFF", "MP3"] as const;
/** Minimum sample rate for a production master (server-configurable: creative.min_sample_rate_hz). */
export const DEFAULT_MIN_SAMPLE_RATE_HZ = 44100;

/** Similarity above which two tracks' lyrics count as duplicated (word-shingle Jaccard). */
export const LYRIC_DUPLICATION_THRESHOLD = 0.6;
