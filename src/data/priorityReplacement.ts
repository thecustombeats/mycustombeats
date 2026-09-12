export const PRIORITY_REPLACEMENT = {
  id: "mcb-priority-replacement",
  name: "MCB Priority Replacement™",
  priceGBP: 19.99,
  currency: "GBP",
  optional: true,
  perEligibleKeepsake: true,
  defaultSelected: false,
  claimWindowDays: 7,
  scope: "priority-service-for-arrival-damage",
  customerPromise:
    "Optional priority handling and expedited replacement delivery where available for an eligible keepsake that arrived damaged or faulty.",
  statutoryRightsNotice:
    "Your normal consumer rights are not affected. You do not need to buy MCB Priority Replacement to exercise any rights you already have for faulty, damaged or misdescribed goods.",
  claimWindowNotice:
    "Please contact MCB as soon as reasonably possible after discovering arrival damage. Requests for the optional priority service must be submitted within 7 days of confirmed delivery.",
  checkoutLabel: "Add MCB Priority Replacement™ +£19.99",
  checkoutHelper:
    "Optional priority handling and expedited replacement delivery where available if this eligible keepsake arrives damaged or faulty. Your normal consumer rights remain unaffected.",
} as const;

export type PriorityReplacementConfig = typeof PRIORITY_REPLACEMENT;
