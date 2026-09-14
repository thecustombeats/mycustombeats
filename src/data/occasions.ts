/**
 * Occasions MCB designs for.
 *
 * Moved out of the commercial catalogue: an occasion is a customer context,
 * not something MCB sells, and nothing here carries a price.
 */

export type OccasionId =
  | "anniversary"
  | "birthday"
  | "wedding"
  | "mothers-day"
  | "christmas"
  | "easter"
  | "thank-you"
  | "congratulations"
  | "valentines-day"
  | "cruise"
  | "new-year"
  | "fourth-of-july";

export interface Occasion {
  id: OccasionId;
  /** Title case, for chips, selectors and headings. */
  label: string;
  /**
   * The same occasion inside a sentence.
   *
   * A label is not a phrase: "A pop-up card for Cruise / Voyage" and "for
   * Thank You" read like form fields, while "for a cruise or voyage" and
   * "for saying thank you" read like English. Generated copy uses this, so
   * adding an occasion means writing its phrase once, here.
   */
  prose: string;
  /**
   * True when the occasion falls in a fixed part of the calendar and can
   * therefore anchor a seasonal campaign. "Thank you" is an occasion but not
   * a season; Christmas is both.
   */
  seasonal: boolean;
}

export const OCCASIONS: Readonly<Record<OccasionId, Occasion>> = {
  anniversary: {
    id: "anniversary",
    label: "Anniversary",
    prose: "an anniversary",
    seasonal: false,
  },
  birthday: {
    id: "birthday",
    label: "Birthday",
    prose: "a birthday",
    seasonal: false,
  },
  wedding: {
    id: "wedding",
    label: "Wedding",
    prose: "a wedding",
    seasonal: false,
  },
  "mothers-day": {
    id: "mothers-day",
    label: "Mother's Day",
    prose: "Mother's Day",
    seasonal: true,
  },
  christmas: {
    id: "christmas",
    label: "Christmas",
    prose: "Christmas",
    seasonal: true,
  },
  easter: { id: "easter", label: "Easter", prose: "Easter", seasonal: true },
  "thank-you": {
    id: "thank-you",
    label: "Thank You",
    prose: "saying thank you",
    seasonal: false,
  },
  congratulations: {
    id: "congratulations",
    label: "Congratulations",
    prose: "saying congratulations",
    seasonal: false,
  },
  "valentines-day": {
    id: "valentines-day",
    label: "Valentine's Day",
    prose: "Valentine's Day",
    seasonal: true,
  },
  cruise: {
    id: "cruise",
    label: "Cruise / Voyage",
    prose: "a cruise or voyage",
    seasonal: false,
  },
  "new-year": {
    id: "new-year",
    label: "New Year",
    prose: "New Year",
    seasonal: true,
  },
  "fourth-of-july": {
    id: "fourth-of-july",
    label: "Fourth of July",
    prose: "the Fourth of July",
    seasonal: true,
  },
};

