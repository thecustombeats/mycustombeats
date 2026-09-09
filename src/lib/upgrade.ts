/**
 * The Moment → Keepsake upgrade rule.
 *
 * Split from `components/UpgradeInvitation.tsx` — which exports the panel —
 * because a module exporting both a component and a plain function breaks
 * React fast refresh, and the tooling is right to say so.
 *
 * It also puts the RULE somewhere the tests can assert directly, rather than
 * re-implementing "is this order upgradeable?" beside the component and
 * letting the two drift.
 */

import { MOMENT } from "../data/packages";

/** Where the customer stands on the invitation. UI state, never a price. */
export type UpgradeDecision = null | "accepted" | "declined";

/**
 * Whether the upgrade invitation applies to this order.
 *
 * MOMENT ONLY, and derived from the package data rather than a hard-coded
 * string, so renaming or re-iding the package cannot leave this behind.
 *
 * Someone who already chose Keepsake, Journey, Heirloom or Bespoke has
 * nothing to upgrade — Keepsake IS the upgrade, and the others are larger
 * still. Showing them a card about upgrading would read as though MCB had not
 * noticed what they picked.
 */
export const isUpgradeEligible = (packageId: string): boolean =>
  packageId === MOMENT.id;
