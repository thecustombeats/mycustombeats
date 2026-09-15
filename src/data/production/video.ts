/**
 * MCB MEMORY MUSIC VIDEO™ — production and capacity policy as data. INTERNAL.
 * Generated into the server-only api/data/video.json. The customer-facing
 * product and its price live in the catalogue (src/data/catalogue).
 *
 * THE PLATFORM IS NOT VERIFIED. The Founders intend to produce videos on
 * the Founders' selected music platform (founder selected; account not yet opened). The planning figures
 * below — 45 videos per period and a 4-minute maximum — were supplied by the
 * Founders from the intended plan's description. They are PLANNING LIMITS,
 * PENDING EXTERNAL VERIFICATION, never verified platform capabilities. No
 * integration, credential, endpoint or call exists: videos are produced by a
 * person on the chosen platform and registered here (MANUAL).
 *
 * THE AUDIO MASTER IS NEVER CHANGED. A video uses the MCB Production Master by
 * reference (id, version, SHA-256). Nothing here trims, speeds up, compresses,
 * fades or overwrites it; a song longer than the planning maximum goes to a
 * person for review.
 */

export const VIDEO_SKU = "memory-music-video";

/** Founder-supplied planning limits. Not verified with the platform. */
export const VIDEO_PLANNING_LIMITS = {
  capacityPerPeriod: 45,
  maxVideoSeconds: 240,
  source: "FOUNDER_SUPPLIED_PROVIDER_LIMIT",
  verification: "PENDING_EXTERNAL_VERIFICATION",
} as const;

/** MCB's own song policy (unchanged; see src/data/production/creative.ts). */
export const SONG_TARGET_SECONDS = 195;
export const SONG_MAX_SECONDS = 300;

export const VIDEO_DURATION_STATUSES = ["PENDING_AUDIO_MASTER", "VIDEO_DURATION_ELIGIBLE", "VIDEO_DURATION_REVIEW_REQUIRED"] as const;

/** A person's decision on a song longer than the planning maximum. None edits the master. */
export const VIDEO_DURATION_DECISIONS = ["PROCEED_FULL_SONG", "ESCALATE_TO_FOUNDERS"] as const;

/**
 * The capacity period. CALENDAR_MONTH is a planning model only: how the
 * platform's allowance actually resets is not verified. Periods are stored
 * rows, so changing future boundaries never moves an existing reservation.
 */
export const VIDEO_CAPACITY_PERIOD_MODELS = ["CALENDAR_MONTH"] as const;
export const VIDEO_CAPACITY_BASIS = "PENDING_VERIFICATION" as const;

export const VIDEO_RESERVATION_STATUSES = ["HELD", "RESERVED", "COMPLETED", "RELEASED", "EXPIRED"] as const;

/** Entitlement: what a customer bought (one video for one selected song). */
export const VIDEO_ENTITLEMENT_STATUSES = ["AWAITING_PAYMENT", "ENTITLED", "CAPACITY_EXCEPTION", "CANCELLED"] as const;

export const VIDEO_JOB_STATUSES = [
  "INPUT_REQUIRED", "READY", "PRODUCTION_REQUIRED", "PRODUCTION_IN_PROGRESS", "CANDIDATE_READY",
  "QUALITY_CHECK_REQUIRED", "REWORK_REQUIRED", "READY_FOR_REVEAL", "REVEALED", "EXCEPTION",
] as const;

/** Who makes the video. Only MANUAL exists: a person produces it on the chosen platform. */
export const VIDEO_PRODUCTION_METHODS = ["MANUAL"] as const;

/** The platform's name comes from the music platform record (creative.ts SELECTED_MUSIC_PLATFORM). */
export const VIDEO_PLATFORM = {
  decision: "FOUNDER_SELECTED",
  account: "NOT_OPENED",
  integration: "PENDING",
  videoCapabilities: "PENDING_EXTERNAL_VERIFICATION",
} as const;

export const VIDEO_QC_CRITERIA = [
  "correct_customer", "correct_song", "complete_song", "correct_photographs", "correct_names_details",
  "image_timing", "transitions", "no_visual_defects", "no_wrong_customer_media", "audio_video_sync",
  "visual_quality", "emotional_impact", "premium_standard", "branding",
] as const;
/** Criteria that may honestly be "not applicable" (e.g. no MCB branding used). */
export const VIDEO_QC_OPTIONAL = ["branding"] as const;
export const VIDEO_QC_OUTCOMES = ["PASS", "REWORK", "ESCALATE"] as const;

/** Candidate files staff may register. Identified by their bytes, never by name. */
export const VIDEO_CONTAINERS = ["MP4", "MOV"] as const;
export const VIDEO_CANDIDATE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Photographs a customer supplies for their video. Separate from the square
 * print-artwork rule: a film can use landscape and portrait photographs.
 * These are MCB's own starting values, configurable on the server; the
 * platform's requirements are not yet known and are not assumed.
 */
export const VIDEO_MEDIA_POLICY = {
  acceptedTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
  maxFiles: 30,
  maxBytesPerFile: 10 * 1024 * 1024,
  minShortEdgePx: 720,
  orientationGuidance: "Landscape photographs fill the screen best; portrait photographs are welcome and are framed.",
  platformRequirements: "PENDING_EXTERNAL_VERIFICATION",
} as const;

/** The customer confirms this when adding photographs for their video. */
export const VIDEO_MEDIA_RIGHTS_STATEMENT =
  "I confirm I have the right and any permission needed to provide these photographs so MCB can use them privately to make my video. This does not give MCB permission to use them publicly.";

/** Offer events the order page may count. Counts only: never a name, story or photograph. */
export const VIDEO_OFFER_EVENTS = ["OFFER_VIEWED", "SELECTED", "DESELECTED"] as const;

/** How long a checkout holds a video space. It covers the whole life of a Stripe Checkout session. */
export const VIDEO_HOLD_MINUTES = 24 * 60 + 30;

/** Remaining spaces at or below which the Founders are told capacity is low. */
export const VIDEO_CAPACITY_LOW_THRESHOLD = 5;

/** Customer copy (premium, never "AI", "credits" or a platform name). */
export const VIDEO_COPY = {
  eyebrow: "Make your memory a film",
  title: "MCB Memory Music Video™",
  headline: ["Your memory.", "Your song.", "Your film."],
  body: "Turn your personalised MCB song into a beautiful memory film using the photographs and moments that made the story yours.",
  ideal: "Ideal for anniversaries, cruises, weddings, birthdays, family memories and special journeys.",
  optional: "Optional enhancement",
  availability: "Limited monthly availability.",
  full: "Memory Music Video is fully booked for this production month.",
  add: "Add my Memory Music Video",
  remove: "Remove my Memory Music Video",
} as const;
