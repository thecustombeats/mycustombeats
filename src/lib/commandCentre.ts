/**
 * Founder Command Centre — client helpers (no React).
 *
 * The CRM key is held in the page's memory only and sent as a Bearer header.
 * Deep links (#view=…&order=MCB-…&open=…) only choose what to show: opening
 * anything performs no action.
 */

export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const VIEWS = ["today", "approvals", "orders", "videos", "customers", "business", "health", "notifications", "search"] as const;
export type View = (typeof VIEWS)[number];
export const OPEN_MODES = ["card", "quality", "approve", "decide", "advanced"] as const;
export type OpenMode = (typeof OPEN_MODES)[number];

export interface CommandLink {
  view: View;
  order: string | null;
  open: OpenMode | null;
}

const REFERENCE = /^MCB-\d{4}-\d{6}$/;

/** Reads a Command Centre deep link. Anything unrecognised is ignored, never executed. */
export const parseCommandLink = (hash: string): CommandLink => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const view = params.get("view");
  const order = params.get("order");
  const open = params.get("open");
  return {
    view: (VIEWS as readonly string[]).includes(view ?? "") ? (view as View) : "today",
    order: order && REFERENCE.test(order) ? order : null,
    open: (OPEN_MODES as readonly string[]).includes(open ?? "") ? (open as OpenMode) : null,
  };
};

export const commandLink = (link: Partial<CommandLink>): string => {
  const params = new URLSearchParams();
  params.set("view", link.view ?? "today");
  if (link.order) params.set("order", link.order);
  if (link.open) params.set("open", link.open);
  return `#${params.toString()}`;
};

/** The customer care console for one case (or its list when the item has no case yet). Opening it performs nothing. */
export const careCaseHref = (caseId: number | null | undefined): string => (caseId ? `/operations/customer-care#case=${caseId}` : "/operations/customer-care#filter=needs_mcb");

/** BUSINESS sections (#view=business&section=…). Choosing one only changes what is shown. */
export const BUSINESS_SECTIONS = [
  ["overview", "Overview"],
  ["products", "Products"],
  ["videos", "Videos"],
  ["customers", "Customers"],
  ["suppliers", "Suppliers"],
  ["support", "Support & recovery"],
  ["data", "Data quality"],
] as const;
export type BusinessSection = (typeof BUSINESS_SECTIONS)[number][0];

export const parseBusinessSection = (hash: string): BusinessSection => {
  const section = new URLSearchParams(hash.replace(/^#/, "")).get("section");
  return BUSINESS_SECTIONS.some(([s]) => s === section) ? (section as BusinessSection) : "overview";
};

export const businessLink = (section: BusinessSection): string => `#view=business&section=${section}`;

/** 18.2%, or the plain truth when there is no denominator. */
export const rateText = (rate: number | null | undefined): string =>
  rate === null || rate === undefined ? "— Awaiting data" : `${Math.round(rate * 1000) / 10}%`;

/** £149.99, or the plain truth when the figure is not known. */
export const money = (minor: number | null | undefined, currency = "GBP"): string => {
  if (minor === null || minor === undefined) return "— Awaiting data";
  const symbol = currency === "GBP" ? "£" : `${currency} `;
  const sign = minor < 0 ? "−" : "";
  return `${sign}${symbol}${(Math.abs(minor) / 100).toFixed(2)}`;
};

/** "18 minutes ago" from a UTC timestamp ("YYYY-MM-DD HH:MM:SS"). */
export const ago = (utc: string | null | undefined, now = Date.now()): string => {
  if (!utc) return "—";
  const at = Date.parse(utc.replace(" ", "T") + (utc.length <= 10 ? "T00:00:00Z" : "Z"));
  if (Number.isNaN(at)) return "—";
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} days ago`;
};

export const humanise = (value: string | null | undefined): string =>
  (value ?? "").replace(/[._]/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/** Founder words for readiness statuses; the status is always spelled out, never colour alone. */
export const READINESS_LABELS: Record<string, string> = {
  READY: "Ready",
  PARTIAL: "Partial",
  NOT_READY: "Not ready",
  DEFERRED: "Deferred",
  NEEDS_FOUNDER_ACTION: "Needs founder action",
  NEEDS_EXTERNAL_VERIFICATION: "Needs external verification",
};

/** Answers keyed by question; every question needs an answer before a decision is sent. */
export const answersComplete = (questions: Json[], answers: Record<string, string>): boolean =>
  questions.every((q) => ["YES", "NO", "NOT_APPLICABLE"].includes(answers[q.key] ?? ""));

/** A pass is only offered when every answer is yes (or not applicable). */
export const canPass = (answers: Record<string, string>): boolean => !Object.values(answers).includes("NO");
