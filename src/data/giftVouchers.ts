export const GIFT_VOUCHER_MIN_GBP = 10;

export const giftVoucherModes = {
  gift: {
    id: "gift",
    name: "MCB Gift Voucher",
    description: "A customer-selected gift value from £10 upward for someone to spend on an MCB experience.",
    minGbp: GIFT_VOUCHER_MIN_GBP,
    balanceMode: "remaining-balance",
    transferable: false,
  },
  accountCredit: {
    id: "account-credit",
    name: "MCB Account Credit",
    description: "Reloadable MCB credit linked to the customer's account and secure 10-digit code for future purchases and Bespoke commissions.",
    minGbp: GIFT_VOUCHER_MIN_GBP,
    balanceMode: "reloadable",
    transferable: false,
  },
} as const;

export const voucherRules = {
  publicMinimumGbp: GIFT_VOUCHER_MIN_GBP,
  publicMaximumGbp: null,
  platformAndRiskLimitsMayApply: true,
  secureCodeDigits: 10,
  supportsPartialRedemption: true,
  preserveRemainingBalance: true,
  accountCreditCanBeReloaded: true,
  bespokeEligible: true,
  privateSourcedGiftEligible: true,
  cashRedemption: false,
} as const;
