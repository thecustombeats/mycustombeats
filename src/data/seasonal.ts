/**
 * SEASONAL EDITIONS — occasion-led presentations of the core experiences.
 *
 * A seasonal edition is NOT a new product. "Christmas Moment" is the Moment
 * experience, at Moment's price, presented for Christmas. The edition
 * therefore stores a `packageId` and NEVER a price of its own: the price is
 * read back through `data/packages.ts` at render time, so a seasonal campaign
 * cannot drift away from the approved figure or quietly introduce a second
 * price for the same thing.
 *
 * ACTIVATION IS CONFIGURATION, NOT CODE.
 * An edition is live only when `active` is true AND today falls inside its
 * window. Both gates are data. Launching Christmas 2026 in November is a
 * one-word edit to this file — no component, route or build step changes.
 *
 * This sprint deliberately builds the capability and no marketing automation
 * around it. Nothing schedules, emails or promotes an edition.
 */

import { getPackage, type AnyPackage, type PackageId } from "./packages";
import { OCCASIONS, type Occasion, type OccasionId } from "./catalogue/types";

export interface SeasonalEdition {
  id: string;
  occasion: OccasionId;
  /** The experience this edition presents. Its price is inherited, not set. */
  packageId: PackageId;
  /** Customer-facing name, e.g. "Christmas Moment". */
  name: string;
  /** Positioning for the season. Replaces the package's own line. */
  positioning: string;
  description: string;
  /** Master switch. False means the edition exists but is not presented. */
  active: boolean;
  /** ISO dates. Absent bounds mean "no limit at that end". */
  availableFrom?: string;
  availableUntil?: string;
}

/**
 * Christmas 2026.
 *
 * Held inactive: today is outside the campaign and the business has not
 * released it. The window below is what November's launch flips on, and the
 * price it will show is Moment's approved £10 / $14 — inherited, never
 * restated here.
 */
export const CHRISTMAS_MOMENT: SeasonalEdition = {
  id: "christmas-moment-2026",
  occasion: "christmas",
  packageId: "moment",
  name: "Christmas Moment",
  positioning: "A memory, made instantly — wrapped for Christmas.",
  description:
    "A personalised song written from your story and delivered within the hour, presented as a Christmas gift.",
  active: false,
  availableFrom: "2026-11-01",
  availableUntil: "2026-12-26",
};

export const SEASONAL_EDITIONS: readonly SeasonalEdition[] = [
  CHRISTMAS_MOMENT,
];

/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */

/** The edition's price and inclusions, resolved from its package. */
export const editionPackage = (
  edition: SeasonalEdition
): AnyPackage | undefined => getPackage(edition.packageId);

export const editionOccasion = (edition: SeasonalEdition): Occasion =>
  OCCASIONS[edition.occasion];

/** True when `date` falls inside the edition's window. Ignores `active`. */
export const isInWindow = (
  edition: SeasonalEdition,
  date: Date = new Date()
): boolean => {
  const day = date.toISOString().slice(0, 10);
  if (edition.availableFrom && day < edition.availableFrom) return false;
  if (edition.availableUntil && day > edition.availableUntil) return false;
  return true;
};

/**
 * Editions that should be presented right now.
 *
 * Both gates must pass. An edition left `active: true` past its window stops
 * showing on its own, so a forgotten campaign fails closed rather than
 * offering Christmas gifting in March.
 */
export const activeSeasonalEditions = (
  date: Date = new Date()
): readonly SeasonalEdition[] =>
  SEASONAL_EDITIONS.filter(
    (edition) => edition.active && isInWindow(edition, date)
  );

export const activeEditionsForPackage = (
  packageId: PackageId,
  date: Date = new Date()
): readonly SeasonalEdition[] =>
  activeSeasonalEditions(date).filter(
    (edition) => edition.packageId === packageId
  );
