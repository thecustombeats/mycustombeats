/**
 * The customer's private order links — progress, the reveal and reporting a
 * problem — client side.
 *
 * The token lives in the URL FRAGMENT (`/your-order#…`, `/approve#…`). A
 * fragment is never sent to a server, never written to an access log and
 * never included in a Referer header, so opening the listening link or a
 * tracking page from here does not hand the token to anyone. It is read once
 * and posted in a request body.
 */

import type { Workflow } from "../data/operations";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The link token from a location hash, or null if there is none worth sending. */
export const tokenFromHash = (hash: string): string | null => {
  const raw = hash.replace(/^#/, "").trim();
  return TOKEN_PATTERN.test(raw) ? raw : null;
};

export class LinkError extends Error {
  readonly code: string;
  readonly fields: Record<string, string>;

  constructor(message: string, code: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "LinkError";
    this.code = code;
    this.fields = fields;
  }
}

const CONNECTION_MESSAGE = "We couldn't reach us just then. Please check your connection and try again.";

const post = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new LinkError(CONNECTION_MESSAGE, "network");
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new LinkError(
      typeof payload?.message === "string" ? payload.message : "Something went wrong. Please try again.",
      typeof payload?.error === "string" ? payload.error : "error",
      (payload?.fields as Record<string, string> | undefined) ?? {}
    );
  }
  return payload as T;
};

export interface OrderLine {
  name: string;
  quantity: number;
}

export interface OrderProgress {
  reference: string;
  workflow: Workflow;
  lines: OrderLine[];
  stage: string | null;
  stages: { id: string; status: "done" | "current" | "upcoming" }[];
  /** The digital reveal: present only once MCB has checked and revealed the creation. */
  reveal: { url: string; revealed_on: string } | null;
  delivery: {
    carrier: string | null;
    tracking_reference: string | null;
    tracking_url: string | null;
    dispatched_on: string | null;
    delivered_on: string | null;
  } | null;
  /** One order, possibly several parcels: carrier and tracking only, never who made or sent it. */
  parcels?: {
    number: number;
    status: "BEING_MADE" | "ON_THE_WAY" | "DELIVERED";
    carrier: string | null;
    tracking_reference: string | null;
    tracking_url: string | null;
    dispatched_on: string | null;
    delivered_on: string | null;
  }[];
  items: { key: string; name: string; priority_replacement: { request_by: string | null } | null }[];
  open_requests: number;
}

export const fetchProgress = (token: string) => post<OrderProgress>("/api/order-progress", { token });

/**
 * Customer approval is retired (Single Creative Authority). An old approval
 * link gets a polite, non-actionable answer and nothing else.
 */
export interface RetiredApprovalView {
  retired: true;
  message: string;
}

export const fetchRetiredApproval = (token: string) => post<RetiredApprovalView>("/api/order-approval", { token });

export type SupportKind = "DAMAGED_OR_FAULTY" | "WRONG_ITEM" | "MANUFACTURING_DEFECT" | "DELIVERY_PROBLEM" | "INCORRECT_DETAIL" | "QUESTION";

export const sendSupportRequest = (
  token: string,
  request: { kind: SupportKind; item?: string; priorityReplacement?: boolean; description: string }
) => post<{ received: true; message: string; request_id: number; evidence: { accepted: string[]; required: false } | null }>("/api/order-support", { token, ...request });

export type EvidenceKind = "PARCEL_PHOTO" | "PRODUCT_PHOTO" | "UNBOXING_VIDEO_REFERENCE" | "OTHER";

/** Optional evidence for a report: a photo, or where a recording is kept. Never required for help. */
export const sendSupportEvidence = async (
  token: string,
  requestId: number,
  evidence: { kind: EvidenceKind; photo?: File; reference?: string }
): Promise<{ received: true; message: string }> => {
  const form = new FormData();
  form.append("token", token);
  form.append("request_id", String(requestId));
  form.append("kind", evidence.kind);
  if (evidence.photo) form.append("photo", evidence.photo);
  if (evidence.reference) form.append("reference", evidence.reference);
  let response: Response;
  try {
    response = await fetch("/api/order-evidence", { method: "POST", body: form });
  } catch {
    throw new LinkError(CONNECTION_MESSAGE, "network");
  }
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new LinkError(typeof payload?.message === "string" ? payload.message : "Something went wrong. Please try again.", typeof payload?.error === "string" ? payload.error : "error", (payload?.fields as Record<string, string> | undefined) ?? {});
  }
  return payload as { received: true; message: string };
};

/** A listening or tracking link is only ever followed if it is https. */
export const safeExternalUrl = (url: string | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};

/** "14 September 2026" for a YYYY-MM-DD date, without time-zone drift. */
export const formatDay = (isoDate: string | null): string | null => {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}/.test(isoDate)) return null;
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
};

/* ------------------------------------------------------------------ */
/* MCB LIVE enquiry                                                    */
/* ------------------------------------------------------------------ */

export const LIVE_REQUEST_TYPES = [
  { value: "AVAILABILITY", label: "Availability" },
  { value: "QUOTE", label: "A quote" },
  { value: "AVAILABILITY_AND_QUOTE", label: "Availability and a quote" },
] as const;

export const LIVE_PERFORMERS = [
  { value: "DJ_RINALDI", label: "DJ Rinaldi" },
  { value: "LADY_LAKH", label: "Lady Lakh" },
  { value: "TOGETHER", label: "DJ Rinaldi × Lady Lakh, together" },
  { value: "HELP_ME_CHOOSE", label: "Help me choose" },
] as const;

export const LIVE_DURATIONS = [
  { value: "1_HOUR", label: "1 hour" },
  { value: "2_HOURS", label: "2 hours" },
  { value: "3_HOURS", label: "3 hours" },
  { value: "EXTENDED", label: "Extended event" },
  { value: "TO_BE_DISCUSSED", label: "To be discussed" },
] as const;

export const LIVE_SONG_REVEAL = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "ALREADY_HAVE_SONG", label: "I already have an MCB song" },
] as const;

export interface LiveEnquiry {
  requestType: (typeof LIVE_REQUEST_TYPES)[number]["value"];
  name: string;
  email: string;
  phone: string;
  eventType: string;
  eventDate: string;
  location: string;
  performer: (typeof LIVE_PERFORMERS)[number]["value"];
  duration: (typeof LIVE_DURATIONS)[number]["value"];
  approximateBudget: string;
  songReveal: (typeof LIVE_SONG_REVEAL)[number]["value"];
  details: string;
}

export const EMPTY_LIVE_ENQUIRY: LiveEnquiry = {
  requestType: "AVAILABILITY",
  name: "",
  email: "",
  phone: "",
  eventType: "",
  eventDate: "",
  location: "",
  performer: "HELP_ME_CHOOSE",
  duration: "TO_BE_DISCUSSED",
  approximateBudget: "",
  songReveal: "NO",
  details: "",
};

/** The same rules the server applies, and no stricter. */
export const validateLiveEnquiry = (e: LiveEnquiry): Partial<Record<keyof LiveEnquiry, string>> => {
  const errors: Partial<Record<keyof LiveEnquiry, string>> = {};
  if (!e.name.trim()) errors.name = "Please tell us your name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email.trim())) errors.email = "Please enter a valid email address.";
  if (!e.eventType.trim()) errors.eventType = "Please tell us what kind of event it is.";
  if (!e.location.trim()) errors.location = "Please tell us where the event is.";
  return errors;
};

export const submitLiveEnquiry = (e: LiveEnquiry) =>
  post<{ reference: string; status: "RECEIVED" }>("/api/live/enquiry", {
    requestType: e.requestType,
    name: e.name.trim(),
    email: e.email.trim(),
    phone: e.phone.trim(),
    eventType: e.eventType.trim(),
    eventDate: e.eventDate,
    location: e.location.trim(),
    performer: e.performer,
    duration: e.duration,
    approximateBudget: e.approximateBudget.trim(),
    songReveal: e.songReveal,
    details: e.details.trim(),
  });
