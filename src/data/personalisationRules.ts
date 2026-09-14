/**
 * The limits a personalised order must respect, in one place for both sides.
 *
 * The browser uses these to guide the customer; the server enforces the same
 * numbers from public/api/data/personalisation.json, generated from this file
 * by scripts/generate-catalogue-json.mjs. Nothing here may import from outside
 * src/data, so the generator can compile it on its own.
 *
 * The server REFUSES over-long text with a field error. It never truncates:
 * a memory cut short silently is a different memory.
 */

/** A memory, in the customer's words. */
export const STORY_MAX = 300;
/** Who or what a song is for or about. */
export const ABOUT_MAX = 120;
export const SONG_TITLE_MAX = 120;
export const ARTIST_MAX = 120;
export const FRAME_HEADING_MAX = 80;

/** Song products a customer may buy several of in one order: each is its own unit. */
export const MULTI_UNIT_PRODUCT_IDS: readonly string[] = ["keepsake"];

/** Largest photo accepted, in bytes. The upload endpoint enforces the same. */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Photo types accepted. Checked on the server by file signature and image
 * decoding, never by the name or the type the browser claims.
 */
export const PHOTO_MIME_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
