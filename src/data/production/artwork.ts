/**
 * MCB PRODUCTION ARTWORK SPECIFICATION — internal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CUSTOMER INPUT IS NOT PRODUCTION OUTPUT
 * ─────────────────────────────────────────────────────────────────────────
 * A customer supplies a SOURCE photograph (artwork-ready: square, at least
 * 2500 × 2500 px — `ARTWORK_PHOTO_MIN_PX` in the catalogue). MCB composes the
 * PRODUCTION OUTPUT defined here, to the manufacturer's template. The two
 * are different things and neither replaces the other.
 *
 * INTERNAL ONLY. Never imported by a customer page: it is generated into the
 * server's `api/data/artwork.json` and read by the staff API. No supplier is
 * named; `supplierRoute` stays null until MCB assigns one internally.
 *
 * NOTHING HERE IS INVENTED. Values are exactly what the Founders supplied on
 * 15 September 2026. Where a value was not supplied it is `null` and the
 * template says what is missing — automation must not guess it.
 */

export type TemplateStatus =
  /** Supplied dimensions are complete enough for automated technical QC. */
  | "ACTIVE"
  /** Physical geometry supplied; the supplier's pixel resolution is not, so output size is checked for shape only. */
  | "GEOMETRY_ONLY"
  /** No manufacturer dieline/template: artwork must be prepared manually, never generated. */
  | "TEMPLATE_REQUIRED";

export type ArtworkKind = "SLEEVE_FRONT" | "SLEEVE_BACK" | "GATEFOLD" | "PICTURE_DISC";

export interface Millimetres {
  readonly mm: number;
  /** Pixel equivalent where the Founders supplied one. */
  readonly px: number | null;
}

export interface ArtworkTemplate {
  readonly id: string;
  readonly version: number;
  readonly kind: ArtworkKind;
  readonly label: string;
  readonly status: TemplateStatus;
  readonly orientation: "SQUARE" | "PORTRAIT" | null;
  /** Production canvas in pixels, where supplied. */
  readonly outputPx: { readonly width: number; readonly height: number } | null;
  /** Physical diameter of a disc. */
  readonly diameterMm: number | null;
  readonly bleed: { readonly min: Millimetres; readonly max: Millimetres } | null;
  /** Top and bottom spine allowance shown on the supplied sleeve template. */
  readonly spineAllowance: { readonly top: Millimetres; readonly bottom: Millimetres } | null;
  /** The physical spindle hole, where supplied. */
  readonly centreHoleMm: number | null;
  /**
   * CREATIVE exclusion zone for important text and faces, centred on the
   * disc. NOT the physical hole: the practical guidance is about 1.5 inches.
   */
  readonly centreCreativeExclusion: { readonly diameterInches: number; readonly diameterMm: number } | null;
  /** Safe inset from trim for important content; null where not supplied. */
  readonly safeInsetMm: number | null;
  /** Trim size; null where the supplier template defines it and it was not supplied. */
  readonly trimPx: { readonly width: number; readonly height: number } | null;
  readonly appliesToSkus: readonly string[];
  /** Internal routing only; never public; null until assigned. */
  readonly supplierRoute: string | null;
  /** Automated technical QC this template supports. */
  readonly qc: readonly ArtworkQcCheck[];
  /** What is still needed from the manufacturer, in words, for staff. */
  readonly missing: readonly string[];
  /**
   * The subset of `missing` a manufacturing package cannot do without. While
   * any is outstanding a package is MANUFACTURING_DATA_REQUIRED, never READY.
   * (A safe-zone inset is not here: an unknown safe zone is UNVERIFIED and
   * needs MCB's manual production review instead.)
   */
  readonly manufacturingDataRequired: readonly string[];
  /** Whether the manufacturer supplied safe-zone geometry. Unknown is UNVERIFIED — never invented. */
  readonly safeZoneStatus: "VERIFIED" | "UNVERIFIED";
  readonly notes: readonly string[];
}

export type ArtworkQcCheck =
  | "OUTPUT_PRESENT"
  | "FILE_TYPE"
  | "EXACT_DIMENSIONS"
  | "SQUARE_ASPECT"
  | "ORDER_ASSOCIATION"
  | "SOURCE_ASSOCIATION"
  | "TEMPLATE_VERSION";

const px35 = { mm: 3, px: 35 } as const;
const INCH_MM = 25.4;
const CENTRE_EXCLUSION = { diameterInches: 1.5, diameterMm: Math.round(1.5 * INCH_MM * 10) / 10 } as const;
const DISC_GUIDANCE = [
  "Extend artwork/background about 2–3 mm beyond the final cut line where the template requires bleed.",
  "Keep important content inside the safe zone and away from the outer trim edge.",
  "Keep important text and facial features out of the central ~1.5-inch creative exclusion zone (this is not the physical centre hole).",
];

export const ARTWORK_TEMPLATES: readonly ArtworkTemplate[] = [
  {
    id: "SLEEVE_12_FRONT", version: 1, kind: "SLEEVE_FRONT", label: "12-inch sleeve — front", status: "ACTIVE", orientation: "PORTRAIT",
    outputPx: { width: 3756, height: 3827 }, diameterMm: null,
    bleed: { min: px35, max: px35 }, spineAllowance: { top: px35, bottom: px35 },
    centreHoleMm: null, centreCreativeExclusion: null, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["journey-6"], supplierRoute: null,
    qc: ["OUTPUT_PRESENT", "FILE_TYPE", "EXACT_DIMENSIONS", "ORDER_ASSOCIATION", "SOURCE_ASSOCIATION", "TEMPLATE_VERSION"],
    missing: ["Safe-area inset", "Trim size"],
    manufacturingDataRequired: [],
    safeZoneStatus: "UNVERIFIED",
    notes: ["Founder-supplied production template (front).", "3 mm bleed ≈ 35 px; top/bottom spine allowance 3 mm ≈ 35 px."],
  },
  {
    id: "SLEEVE_12_BACK", version: 1, kind: "SLEEVE_BACK", label: "12-inch sleeve — back", status: "ACTIVE", orientation: "SQUARE",
    outputPx: { width: 3756, height: 3756 }, diameterMm: null,
    bleed: { min: px35, max: px35 }, spineAllowance: null,
    centreHoleMm: null, centreCreativeExclusion: null, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["journey-6"], supplierRoute: null,
    qc: ["OUTPUT_PRESENT", "FILE_TYPE", "EXACT_DIMENSIONS", "ORDER_ASSOCIATION", "SOURCE_ASSOCIATION", "TEMPLATE_VERSION"],
    missing: ["Safe-area inset", "Trim size"],
    manufacturingDataRequired: [],
    safeZoneStatus: "UNVERIFIED",
    notes: ["Founder-supplied production template (back).", "3 mm bleed ≈ 35 px."],
  },
  {
    id: "GATEFOLD_12_DOUBLE", version: 1, kind: "GATEFOLD", label: "Double 12-inch gatefold", status: "TEMPLATE_REQUIRED", orientation: null,
    outputPx: null, diameterMm: null, bleed: null, spineAllowance: null,
    centreHoleMm: null, centreCreativeExclusion: null, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["journey-12"], supplierRoute: null, qc: ["OUTPUT_PRESENT", "FILE_TYPE", "ORDER_ASSOCIATION"],
    missing: ["Manufacturer gatefold template (panels, spine, bleed, output size)"],
    manufacturingDataRequired: ["Manufacturer gatefold template (panels, spine, bleed, output size)"],
    safeZoneStatus: "UNVERIFIED",
    notes: ["The supplied front/back sleeve templates are single-sleeve; the gatefold dieline was not supplied and is not assumed."],
  },
  {
    id: "PICTURE_DISC_12", version: 1, kind: "PICTURE_DISC", label: "12-inch picture disc", status: "GEOMETRY_ONLY", orientation: "SQUARE",
    outputPx: null, diameterMm: 302,
    bleed: { min: { mm: 2, px: null }, max: { mm: 3, px: null } }, spineAllowance: null,
    centreHoleMm: 7.23, centreCreativeExclusion: CENTRE_EXCLUSION, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["keepsake-12-picture-disc"], supplierRoute: null,
    qc: ["OUTPUT_PRESENT", "FILE_TYPE", "SQUARE_ASPECT", "ORDER_ASSOCIATION", "SOURCE_ASSOCIATION", "TEMPLATE_VERSION"],
    missing: ["Supplier output resolution / pixel canvas", "Safe-zone inset from the outer edge"],
    manufacturingDataRequired: ["Supplier output resolution / pixel canvas"],
    safeZoneStatus: "UNVERIFIED",
    notes: DISC_GUIDANCE,
  },
  {
    id: "PICTURE_DISC_10", version: 1, kind: "PICTURE_DISC", label: "10-inch picture disc", status: "GEOMETRY_ONLY", orientation: "SQUARE",
    outputPx: null, diameterMm: 250,
    bleed: { min: { mm: 2, px: null }, max: { mm: 3, px: null } }, spineAllowance: null,
    centreHoleMm: null, centreCreativeExclusion: CENTRE_EXCLUSION, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["keepsake-10-picture-disc"], supplierRoute: null,
    qc: ["OUTPUT_PRESENT", "FILE_TYPE", "SQUARE_ASPECT", "ORDER_ASSOCIATION", "SOURCE_ASSOCIATION", "TEMPLATE_VERSION"],
    missing: ["Supplier output resolution / pixel canvas", "Centre-hole diameter", "Safe-zone inset from the outer edge"],
    manufacturingDataRequired: ["Supplier output resolution / pixel canvas"],
    safeZoneStatus: "UNVERIFIED",
    notes: DISC_GUIDANCE,
  },
  {
    id: "PICTURE_DISC_7", version: 1, kind: "PICTURE_DISC", label: "7-inch picture disc", status: "GEOMETRY_ONLY", orientation: "SQUARE",
    outputPx: null, diameterMm: 174,
    bleed: { min: { mm: 2, px: null }, max: { mm: 3, px: null } }, spineAllowance: null,
    centreHoleMm: null, centreCreativeExclusion: CENTRE_EXCLUSION, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["keepsake-7-picture-disc"], supplierRoute: null,
    qc: ["OUTPUT_PRESENT", "FILE_TYPE", "SQUARE_ASPECT", "ORDER_ASSOCIATION", "SOURCE_ASSOCIATION", "TEMPLATE_VERSION"],
    missing: ["Supplier output resolution / pixel canvas", "Centre-hole diameter", "Safe-zone inset from the outer edge"],
    manufacturingDataRequired: ["Supplier output resolution / pixel canvas"],
    safeZoneStatus: "UNVERIFIED",
    notes: DISC_GUIDANCE,
  },
  {
    id: "PICTURE_DISC_HEART", version: 1, kind: "PICTURE_DISC", label: "Heart-shaped picture disc", status: "TEMPLATE_REQUIRED", orientation: null,
    outputPx: null, diameterMm: null, bleed: null, spineAllowance: null,
    centreHoleMm: null, centreCreativeExclusion: CENTRE_EXCLUSION, safeInsetMm: null, trimPx: null,
    appliesToSkus: ["keepsake-10-heart-picture-disc"], supplierRoute: null, qc: ["OUTPUT_PRESENT", "FILE_TYPE", "ORDER_ASSOCIATION"],
    missing: ["Manufacturer heart dieline / cut line, bleed and output size"],
    manufacturingDataRequired: ["Manufacturer heart dieline / cut line, bleed and output size"],
    safeZoneStatus: "UNVERIFIED",
    notes: ["MANUAL / TEMPLATE REQUIRED: the heart cut line is never guessed. Staff prepare and register the artwork manually."],
  },
];

/** The production artwork components each SKU needs, in order. */
export const ARTWORK_COMPONENTS_BY_SKU: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...new Set(ARTWORK_TEMPLATES.flatMap((t) => t.appliesToSkus))].map((sku) => [
    sku,
    ARTWORK_TEMPLATES.filter((t) => t.appliesToSkus.includes(sku)).map((t) => t.id),
  ])
);

/**
 * The £15 Artwork Preparation Service covers standard preparation, once per
 * order. More unready source photographs than this in one order are routed to
 * ARTWORK_EXCEPTION for internal review; nothing extra is charged.
 */
export const PREPARATION_STANDARD_MAX_UNREADY_PHOTOS = 1;

/** Output file types automated technical QC can read. */
export const ARTWORK_OUTPUT_MIME_TYPES: readonly string[] = ["image/png", "image/jpeg", "image/tiff"];

/* ------------------------------------------------------------------ */
/* Production File Factory (15 September 2026)                          */
/* ------------------------------------------------------------------ */

/**
 * CREATIVE ART MASTER ≠ PRINT PRODUCTION MASTER.
 *
 * The Creative Art Master is MCB's artistic composition for a record, owned
 * by MCB and independent of any manufacturer template. A Print Production
 * Master is rendered FROM an art master TO one template id and version. A
 * template change means a new render and a new print-master version; the
 * art is never recreated and old files stay tied to their old template.
 */

/** No image-generation provider is selected. Art masters are registered by people. */
export const ARTWORK_PROVIDER_DECISION_STATUS = "DEFERRED" as const;

export const ART_CREATION_METHODS = ["MANUAL_DESIGN", "MCB_INTERNAL", "AI_PROVIDER", "OTHER_APPROVED_PROVIDER"] as const;
/** Methods usable today. AI_PROVIDER and OTHER_APPROVED_PROVIDER need a selected provider (none is). */
export const ART_CREATION_METHODS_AVAILABLE = ["MANUAL_DESIGN", "MCB_INTERNAL"] as const;

/** How a print production master is rendered. MANUAL_EXTERNAL: made in design software and registered. */
export const RENDERERS = ["MANUAL_EXTERNAL", "LOCAL_ADAPTER"] as const;
export const RENDERERS_AVAILABLE = ["MANUAL_EXTERNAL"] as const;

/** MCB's internal visual QC of a Creative Art Master. Outcomes PASS, REWORK, ESCALATE. No customer approval. */
export const VISUAL_QC_CRITERIA = [
  "correct_photographs", "correct_names", "correct_dates", "correct_title", "correct_occasion", "spelling",
  "image_quality", "crop_composition", "facial_visibility", "text_legibility", "visual_balance",
  "premium_standard", "mcb_branding", "no_other_customer_material",
] as const;
export const VISUAL_QC_OUTCOMES = ["PASS", "REWORK", "ESCALATE"] as const;

/** Customer source-photo preparation. Nothing invents or replaces faces or details. */
export const IMAGE_PREPARATION_STATES = ["SOURCE_READY", "PREPARATION_REQUIRED", "PREPARATION_IN_PROGRESS", "PREPARED", "UNUSABLE", "EXCEPTION"] as const;

/**
 * MCB brand rules the artwork job carries. General only: MCB's full brand
 * guidelines are not in this repository, so nothing more specific is assumed.
 */
export const BRAND_RULES: readonly string[] = [
  "The customer's photograph is the heart of the artwork; do not alter a person's identity or features.",
  "Names, dates, places and titles are used exactly as recorded in the Fact Ledger.",
  "Apply the My Custom Beats brand only where the product requires it, following MCB's brand guidelines.",
  "Keep important text and faces inside the safe zone and out of any centre exclusion zone.",
];

/** Configurable upload limits by file role (bytes). Server config: uploads.role_limits.<ROLE>. */
export const FILE_ROLE_LIMITS: Readonly<Record<string, number>> = {
  CUSTOMER_SOURCE_PHOTO: 10 * 1024 * 1024,
  CREATIVE_ART_MASTER: 100 * 1024 * 1024,
  PRINT_PRODUCTION_MASTER: 100 * 1024 * 1024,
  AUDIO_PRODUCTION_MASTER: 250 * 1024 * 1024,
  CUSTOMER_LISTENING_COPY: 50 * 1024 * 1024,
};

/** Manufacturing package and supplier order pack states. */
export const MANUFACTURING_PACKAGE_STATES = ["NOT_READY", "MANUFACTURING_DATA_REQUIRED", "READY", "SUPERSEDED"] as const;
export const SUPPLIER_PACK_STATES = ["PREPARED", "ORDER_PLACED", "SUPERSEDED"] as const;

export const PRODUCTION_EXCEPTIONS = [
  "ARTWORK_EXCEPTION", "ARTWORK_TEMPLATE_REQUIRED", "ARTWORK_SAFE_ZONE_UNVERIFIED", "PRODUCTION_FILE_EXCEPTION",
  "AUDIO_CAPACITY_EXCEPTION", "MANUFACTURING_DATA_REQUIRED", "FULFILMENT_EXCEPTION",
] as const;
