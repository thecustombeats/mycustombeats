/**
 * PUBLISHED CUSTOMER EVIDENCE.
 *
 * Empty, deliberately, and the site renders nothing where testimonials would
 * go until it is not.
 *
 * MCB has customer words — seven quotes on the current live site and three
 * video testimonials on its About page. None of them may be published here,
 * because in the whole repository and its history there is no record of a
 * customer agreeing to it. That is not a claim they are untrue; it is that
 * nobody has evidence either way. The release review of 12 September put it
 * exactly: "They have not been proved false; they must remain unpublished
 * until verified." Founder decision 85 is still open.
 *
 * So this file is the door, not the wall. Add an entry with its permission
 * recorded and it appears on the site; until then the section is simply not
 * rendered, and MCB claims nothing.
 *
 * TO PUBLISH ONE:
 *   1. Get the customer's agreement to show their words publicly, in writing.
 *   2. Record WHERE that agreement is (an email, a message, a signed form) in
 *      `permissionEvidence`. A description a person can go and check — never
 *      "verbal" and never a guess.
 *   3. Add the entry below. `quote` must be the customer's own words,
 *      unedited except for trimming. `attribution` is what THEY agreed to be
 *      called, which may be a first name and an initial.
 *
 * NEVER:
 *   - invent, paraphrase, embellish or translate a quote
 *   - invent a name, a place, a ship, a date or a star rating
 *   - publish private WhatsApp or message content without that person's
 *     explicit agreement to make it public
 *   - add a review count, an average score or an award
 */

export interface Testimonial {
  /** The customer's own words. Never edited beyond trimming. */
  quote: string;
  /** What the customer agreed to be called. */
  attribution: string;
  /** Optional context they agreed to — an occasion, not an address. */
  context?: string;
  /**
   * WHERE the public-use permission is recorded, specifically enough that a
   * person can go and check it. An entry without this must never be published,
   * and `publishedTestimonials()` refuses to return one.
   */
  permissionEvidence: string;
}

/**
 * Nothing is published yet. See the file header: this is not an oversight, it
 * is the standing `TESTIMONIAL_PERMISSION_REQUIRED` position.
 */
export const TESTIMONIALS: readonly Testimonial[] = [];

/**
 * The testimonials the site may show: only those whose permission is actually
 * recorded. A future edit that adds a quote and forgets the evidence publishes
 * nothing rather than publishing an unverified claim.
 */
export const publishedTestimonials = (): readonly Testimonial[] =>
  TESTIMONIALS.filter(
    (t) => t.permissionEvidence.trim().length > 0 && t.quote.trim().length > 0 && t.attribution.trim().length > 0
  );
