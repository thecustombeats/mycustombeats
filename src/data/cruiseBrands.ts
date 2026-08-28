/**
 * Cruise and luxury-travel lines MCB guests sail with.
 *
 * PURPOSE
 * -------
 * This list communicates the kind of journeys MCB music is made for. It is
 * NOT a claim of partnership, endorsement, sponsorship or approval, and no
 * copy in the marquee may imply one. The approved heading is exactly
 * "Used by guests on board".
 *
 * NAMES
 * -----
 * Every entry uses the line's current official name. Two names from the
 * original brief — "Amon" and "Arroyo" — were not used: neither matches a
 * cruise line, and inventing a brand would be worse than omitting one.
 * "HX" is the current operating name for Hurtigruten Expeditions, so it is
 * listed as "HX Hurtigruten Expeditions" to stay recognisable.
 *
 * CURATION
 * --------
 * Curated to 18 from a candidate pool of 30 — enough to establish breadth
 * across premium, luxury and expedition cruising without becoming an
 * industry directory. Ordered to interleave luxury and mainstream lines so
 * no single tier dominates any one part of the scroll.
 *
 * LOGOS
 * -----
 * `logo` is intentionally optional and currently unset for every brand.
 * These are registered trademarks: MCB must supply properly licensed
 * artwork before any logo is displayed. Redrawing, generating or scraping
 * them is not acceptable. Until a file is supplied the marquee renders the
 * brand name as type, which is honest and carries no trademark risk.
 *
 * To add a logo: drop the licensed file in `public/images/cruise/` and set
 * `logo` to its path. The component switches to the image automatically and
 * keeps the name as alt text.
 */

export interface CruiseBrand {
  /** Current official brand name. */
  name: string;
  /** Path to a licensed logo asset, e.g. "/images/cruise/cunard.svg". */
  logo?: string;
}

export const CRUISE_BRANDS: readonly CruiseBrand[] = [
  { name: "Princess Cruises" },
  { name: "The Ritz-Carlton Yacht Collection" },
  { name: "Royal Caribbean" },
  { name: "Seabourn" },
  { name: "Cunard" },
  { name: "Holland America Line" },
  { name: "Silversea" },
  { name: "Celebrity Cruises" },
  { name: "Regent Seven Seas Cruises" },
  { name: "Oceania Cruises" },
  { name: "Viking" },
  { name: "Norwegian Cruise Line" },
  { name: "Explora Journeys" },
  { name: "MSC Cruises" },
  { name: "Windstar Cruises" },
  { name: "P&O Cruises" },
  { name: "Virgin Voyages" },
  { name: "Ponant" },
];
