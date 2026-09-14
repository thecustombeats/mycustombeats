/**
 * The Moment → Keepsake invitation, offered once the brief is written.
 *
 * Only a Moment order is eligible: it is the one song experience with nothing
 * to hold. The invitation changes the product; the customer then chooses which
 * Keepsake, and every price is read from the catalogue.
 */
import { MOMENT } from "../data/catalogue";

export type UpgradeDecision = null | "accepted" | "declined";

export const isUpgradeEligible = (productId: string): boolean =>
  productId === MOMENT.id;
