/**
 * The /create journey: its steps, what each step needs before moving on, and
 * the customer's contact details (which are never saved to the device).
 */

import { getVariant, type OrderPreview } from "../data/catalogue";
import { getCountry } from "../data/countries";
import { requiredConsents, type ConsentId } from "../data/legal";
import { addOnIssues, isSongSku, storyIssues, type OrderDraft } from "./personalisation";

export const STEPS = [
  { id: "choose", label: "Choose", title: "Choose your experience" },
  { id: "story", label: "Your story", title: "Tell us your story" },
  { id: "extras", label: "Finishing touches", title: "Finishing touches" },
  { id: "details", label: "Your details", title: "Your details" },
  { id: "review", label: "Review", title: "Review your memory" },
] as const;

export type StepId = (typeof STEPS)[number]["id"];

export const isStepId = (value: string | null): value is StepId => STEPS.some((step) => step.id === value);

export const stepIndex = (id: StepId): number => STEPS.findIndex((step) => step.id === id);

export interface ContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  shippingName: string;
  shippingAddress: string;
  shippingAddress2: string;
  shippingCity: string;
  /** County, state or region, where the address needs one. Optional. */
  shippingState: string;
  shippingPostcode: string;
  /** ISO 3166-1 alpha-2 code, chosen from the list. Delivery is quoted on it. */
  shippingCountry: string;
}

export const EMPTY_CONTACT: ContactDetails = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  shippingName: "",
  shippingAddress: "",
  shippingAddress2: "",
  shippingCity: "",
  shippingState: "",
  shippingPostcode: "",
  shippingCountry: "",
};

export type ContactField = keyof ContactDetails;

export const contactIssues = (contact: ContactDetails, requiresShipping: boolean): Partial<Record<ContactField, string>> => {
  const issues: Partial<Record<ContactField, string>> = {};
  if (!contact.firstName.trim()) issues.firstName = "Please tell us your first name.";
  if (!contact.lastName.trim()) issues.lastName = "Please tell us your last name.";
  if (!contact.email.trim()) issues.email = "Please add your email address.";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) issues.email = "That email address doesn't look quite right.";
  if (contact.phone.trim() && !/^\+?[\d\s()-]{6,20}$/.test(contact.phone.trim())) {
    issues.phone = "Please include your country code, for example +44.";
  }
  if (requiresShipping) {
    if (!contact.shippingName.trim()) issues.shippingName = "Who should we address it to?";
    if (!contact.shippingAddress.trim()) issues.shippingAddress = "Please add the delivery address.";
    if (!contact.shippingCity.trim()) issues.shippingCity = "Please add the town or city.";
    if (!contact.shippingPostcode.trim()) issues.shippingPostcode = "Please add the postcode or ZIP.";
    if (!getCountry(contact.shippingCountry)) issues.shippingCountry = "Please choose the country.";
  }
  return issues;
};

export const hasDigitalDelivery = (preview: OrderPreview): boolean =>
  preview.ok && preview.lines.some((line) => line.fulfilment === "DIGITAL");

/** What still stands between this step and the next. Empty means ready. */
export const stepBlockers = (
  step: StepId,
  draft: OrderDraft,
  preview: OrderPreview,
  photoIds: ReadonlySet<string>,
  contact: ContactDetails,
  consents: Record<ConsentId, boolean>
): string[] => {
  switch (step) {
    case "choose":
      return isSongSku(draft.sku) && getVariant(draft.sku) ? [] : ["Choose which experience you would like."];
    case "story":
      return storyIssues(draft).map((issue) => issue.message);
    case "extras":
      return addOnIssues(draft, photoIds).map((issue) => issue.message);
    case "details":
      return Object.values(contactIssues(contact, preview.ok && preview.requiresShipping));
    case "review":
      return requiredConsents({ hasDigitalDelivery: hasDigitalDelivery(preview) })
        .filter((id) => !consents[id])
        .map(() => "Please confirm the acknowledgements above.");
  }
};

/** The furthest step a customer may open, given everything before it. */
export const furthestReachableStep = (
  draft: OrderDraft,
  preview: OrderPreview,
  photoIds: ReadonlySet<string>,
  contact: ContactDetails,
  consents: Record<ConsentId, boolean>
): number => {
  for (let i = 0; i < STEPS.length - 1; i++) {
    if (stepBlockers(STEPS[i].id, draft, preview, photoIds, contact, consents).length > 0) return i;
  }
  return STEPS.length - 1;
};
