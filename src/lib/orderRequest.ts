/**
 * The body /api/order receives, built from what the customer entered.
 *
 * Kept apart from the page so it can be read and tested on its own: what goes
 * to MCB's server is exactly this, and none of it is a price. Photos are not
 * in it (they follow as uploads) and neither is anything for analytics.
 */

import { PRIVACY_POLICY_VERSION, REFUND_POLICY_VERSION, TERMS_VERSION, type ConsentId } from "../data/legal";
import type { ContactDetails } from "./createFlow";
import { draftLines, personalisationPayload, type OrderDraft } from "./personalisation";

export const buildOrderRequest = (
  draft: OrderDraft,
  contact: ContactDetails,
  consents: Record<ConsentId, boolean>,
  photoIds: ReadonlySet<string>,
  requiresShipping: boolean
): Record<string, unknown> => ({
  lines: draftLines(draft),
  personalisation: personalisationPayload(draft, photoIds),
  firstName: contact.firstName.trim(),
  lastName: contact.lastName.trim(),
  email: contact.email.trim(),
  ...(contact.phone.trim() ? { whatsapp: contact.phone.trim() } : {}),
  consents: Object.fromEntries(Object.entries(consents).map(([id, given]) => [id, given === true])),
  termsVersion: TERMS_VERSION,
  refundPolicyVersion: REFUND_POLICY_VERSION,
  privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  ...(requiresShipping
    ? {
        shippingName: contact.shippingName.trim(),
        shippingAddress: contact.shippingAddress.trim(),
        ...(contact.shippingAddress2.trim() ? { shippingAddress2: contact.shippingAddress2.trim() } : {}),
        shippingCity: contact.shippingCity.trim(),
        ...(contact.shippingState.trim() ? { shippingState: contact.shippingState.trim() } : {}),
        shippingPostcode: contact.shippingPostcode.trim(),
        shippingCountryCode: contact.shippingCountry,
      }
    : {}),
});

/**
 * A stable fingerprint of a request body, so a repeat of the SAME order reuses
 * its Idempotency-Key and any change gets a new one.
 */
export const requestFingerprint = (body: Record<string, unknown>): string => {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(canonical)
      : value && typeof value === "object"
        ? Object.fromEntries(Object.keys(value as object).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])]))
        : value;
  return JSON.stringify(canonical(body));
};
