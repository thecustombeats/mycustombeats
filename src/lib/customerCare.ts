/**
 * MCB customer care console — client helpers (no React).
 *
 * Deep links (#filter=urgent, #case=12, #view=metrics) only choose what to
 * show: opening anything performs no action. The CRM key stays in memory.
 */

export const CARE_FILTERS = [
  ["new", "New"],
  ["needs_mcb", "Needs MCB"],
  ["waiting_customer", "Waiting for customer"],
  ["urgent", "Urgent"],
  ["resolved", "Resolved"],
  ["all", "All"],
] as const;
export type CareFilter = (typeof CARE_FILTERS)[number][0];

export interface CareLink {
  filter: CareFilter;
  caseId: number | null;
  view: "cases" | "metrics" | "health";
}

export const parseCareLink = (hash: string): CareLink => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const filter = params.get("filter");
  const caseId = params.get("case");
  const view = params.get("view");
  return {
    filter: CARE_FILTERS.some(([f]) => f === filter) ? (filter as CareFilter) : "needs_mcb",
    caseId: caseId && /^\d{1,12}$/.test(caseId) ? Number(caseId) : null,
    view: view === "metrics" || view === "health" ? view : "cases",
  };
};

export const careLink = (link: Partial<CareLink>): string => {
  const params = new URLSearchParams();
  if (link.caseId) params.set("case", String(link.caseId));
  else if (link.view && link.view !== "cases") params.set("view", link.view);
  else params.set("filter", link.filter ?? "needs_mcb");
  return `#${params.toString()}`;
};

/** Staff words for case states. Customers see their own wording (customer-care.ts). */
export const CASE_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  REVIEWING: "Reviewing",
  WAITING_FOR_MCB: "Waiting for MCB",
  WAITING_FOR_CUSTOMER: "Waiting for customer",
  RESOLUTION_IN_PROGRESS: "Resolution in progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const PRIORITY_LABELS: Record<string, string> = { NORMAL: "Normal", IMPORTANT: "Important", URGENT: "Urgent" };

export const THREAD_LABELS: Record<string, string> = {
  CUSTOMER_MESSAGE: "Customer",
  MCB_RESPONSE: "MCB reply",
  INTERNAL_NOTE: "Internal note",
  SYSTEM_EVENT: "System",
};

/** £12.34 → 1234 minor units; null when not a positive amount with at most two decimals. */
export const poundsToMinor = (value: string): number | null => {
  const clean = value.trim().replace(/^£/, "");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(clean)) return null;
  const minor = Math.round(Number(clean) * 100);
  return minor > 0 ? minor : null;
};

export const hours = (seconds: number): string => `${Math.round((seconds / 3600) * 10) / 10} h`;
