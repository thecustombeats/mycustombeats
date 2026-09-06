/**
 * PRODUCT RELATIONSHIPS — declared once, read everywhere.
 *
 * Every "you might also want" list on the site resolves through this map. No
 * page component holds its own list of related products, so a relationship is
 * added or removed by editing this file alone.
 *
 * DIRECTIONALITY IS DELIBERATE. Vinyl points at the players that can play it;
 * players do not point back at vinyl, because "buy a record for your
 * gramophone" is a different pitch from "here is how you play this". The map
 * is read exactly as declared and no reverse edges are synthesised.
 */

import type { ProductFamilyId, SongInclusion } from "./types";

/**
 * How a family's relations are introduced to the customer.
 *
 * The label lives with the relationship rather than in a component, because
 * "plays with" and "pairs with" are not interchangeable: a gramophone plays a
 * record, a memory box holds one. A page that had to choose the wording
 * itself would eventually choose differently on two different pages.
 */
export interface FamilyRelation {
  label: string;
  familyIds: readonly ProductFamilyId[];
}

export const FAMILY_RELATIONSHIPS: Readonly<
  Record<ProductFamilyId, FamilyRelation>
> = {
  vinyl: {
    label: "Plays with",
    familyIds: [
      "digital-player",
      "portable-gramophone",
      "phone-gramophone",
      "vintage-collection",
    ],
  },
  "lyrics-frame": { label: "Pairs with", familyIds: ["memory-box"] },
  "memory-box": {
    label: "Holds",
    familyIds: ["vinyl", "lyrics-frame", "gift-pop-up-card"],
  },

  // Declared empty rather than omitted, so the map stays exhaustive over
  // ProductFamilyId and a new family cannot be added without a decision
  // about what it relates to.
  cd: { label: "Pairs with", familyIds: [] },
  frame: { label: "Pairs with", familyIds: [] },
  "gift-pop-up-card": { label: "Pairs with", familyIds: [] },
  plaque: { label: "Pairs with", familyIds: [] },
  "digital-player": { label: "Plays", familyIds: [] },
  "portable-gramophone": { label: "Plays", familyIds: [] },
  "phone-gramophone": { label: "Plays", familyIds: [] },
  "vintage-collection": { label: "Plays", familyIds: [] },
};

export const relatedFamilyIds = (
  familyId: ProductFamilyId
): readonly ProductFamilyId[] =>
  FAMILY_RELATIONSHIPS[familyId]?.familyIds ?? [];

export const relationLabel = (familyId: ProductFamilyId): string =>
  FAMILY_RELATIONSHIPS[familyId]?.label ?? "Pairs with";

/**
 * What pairing two products means for the customer's song.
 *
 * A record in a memory box is not automatically a playable pressing of the
 * customer's song — that is a configuration decision the business has not
 * generalised. So a pairing only asserts `CARRIES_SONG` when BOTH products
 * independently do; anything less resolves to `CONFIGURABLE` and is settled
 * during configuration rather than promised in a product listing.
 */
export const pairedSongInclusion = (
  a: SongInclusion,
  b: SongInclusion
): SongInclusion => {
  if (a === "CARRIES_SONG" && b === "CARRIES_SONG") return "CARRIES_SONG";
  if (a === "KEEPSAKE_ONLY" && b === "KEEPSAKE_ONLY") return "KEEPSAKE_ONLY";
  return "CONFIGURABLE";
};
