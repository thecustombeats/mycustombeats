import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { parseOperationsLink } from "../lib/operationsLink";
import CreativeFactoryPanel from "./operations/CreativeFactoryPanel";
import ProductionFilesPanel from "./operations/ProductionFilesPanel";
import VideoPanel from "./operations/VideoPanel";
import FulfilmentPanel, { DecisionDetails } from "./operations/FulfilmentPanel";
import { FINANCIAL_AUTHORISERS, OPERATIONAL_STATES, QC_CHECKLIST, QC_FAIL_REASONS, REOPEN_REASONS } from "../data/operations";

/**
 * /operations — the MCB staff console.
 *
 * Authenticated with the CRM key, which is held in this tab's memory only
 * (never written to browser storage or a cookie) and sent as a Bearer header; browsers
 * do not attach it on their own, so there is nothing for a forged cross-site
 * request to borrow. Everything shown is rendered as text by React.
 *
 * It reads the queue and order detail from /api/crm/operations and performs
 * actions through /api/crm/order-action. The server checks every action
 * against the order's state; the buttons here are a convenience, not the rule.
 *
 * DEEP LINKS from founder notifications — /operations#order=MCB-…&action=… —
 * only choose which order to open, after sign-in. They carry no credential
 * and approve nothing: a supplier purchase is authorised only when Bella or
 * Lewis submits AUTHORISE_SUPPLIER_PURCHASE here with their own code.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const input =
  "mt-1 w-full min-h-11 rounded-lg border border-ink/25 bg-white px-3 py-2 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep";
const btn =
  "inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 py-2 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-60";
const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-ink/40 px-5 py-2 text-base font-semibold text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep disabled:opacity-60";

const STATE_TEXT = Object.fromEntries(OPERATIONAL_STATES.map((s) => [s.state, s.staff]));

/** Extra fields each action needs. */
const ACTION_FIELDS: Record<string, { name: string; label: string; type?: "text" | "date" | "url" | "select" | "textarea" | "checkbox" | "password"; options?: string[] }[]> = {
  PASS_QUALITY_CHECK: [{ name: "reveal_url", label: "Digital only: private https link to the finished song you checked", type: "url" }, { name: "reveal_now", label: "Digital only: reveal to the customer now", type: "checkbox" }, { name: "send_email", label: "Email the customer the reveal", type: "checkbox" }],
  FAIL_QUALITY_CHECK: [{ name: "reason", label: "Why it failed", type: "select", options: [...QC_FAIL_REASONS] }, { name: "note", label: "What to correct (internal, never shown to the customer)", type: "textarea" }],
  SEND_REVEAL: [{ name: "reveal_url", label: "Private https link to the finished song (if not already added)", type: "url" }, { name: "send_email", label: "Email the customer the reveal", type: "checkbox" }],
  CONFIRM_FULFILMENT_REVIEW: [{ name: "confirmed", label: "I have confirmed availability, the destination and the actual delivery cost with the partner", type: "checkbox" }, { name: "note", label: "What was confirmed (no card or account details)", type: "textarea" }],
  AUTHORISE_SUPPLIER_PURCHASE: [{ name: "founder", label: "Founder authorising", type: "select", options: [...FINANCIAL_AUTHORISERS] }, { name: "founder_code", label: "Your founder authorisation code (never share it or send it in a message)", type: "password" }, { name: "destination_acknowledged", label: "Where the destination is not verified: it will be checked at the partner checkout before ordering", type: "checkbox" }, { name: "commercial_acknowledged", label: "I have reviewed the expected costs and contribution above (the customer's paid price is honoured)", type: "checkbox" }, { name: "confirm", label: "I authorise MCB to purchase this order from the production partner", type: "checkbox" }],
  CONFIRM_FULFILMENT: [{ name: "fulfilment_reference", label: "Your order reference with the supplier (optional)" }, { name: "send_email", label: "Tell the customer their keepsake is being made", type: "checkbox" }],
  MARK_DISPATCHED: [{ name: "carrier", label: "Carrier" }, { name: "tracking_reference", label: "Tracking reference(s) — separate several parcels with commas (optional)" }, { name: "tracking_url", label: "Tracking link, https (optional)", type: "url" }, { name: "dispatched_on", label: "Dispatched on", type: "date" }, { name: "send_email", label: "Email the customer", type: "checkbox" }],
  UPDATE_TRACKING: [{ name: "carrier", label: "Carrier" }, { name: "tracking_reference", label: "Tracking reference(s) — separate several parcels with commas (optional)" }, { name: "tracking_url", label: "Tracking link, https (optional)", type: "url" }, { name: "dispatched_on", label: "Dispatched on", type: "date" }],
  MARK_DELIVERED: [{ name: "delivered_on", label: "Delivered on", type: "date" }],
  RECORD_FOLLOW_UP: [{ name: "send_email", label: "Send the check-in email", type: "checkbox" }],
  REOPEN: [{ name: "reason", label: "Reason (MCB correction or replacement — not a creative preference)", type: "select", options: [...REOPEN_REASONS] }],
  REVOKE_LINKS: [{ name: "purpose", label: "Which links", type: "select", options: ["STATUS", "APPROVAL"] }],
  ADD_NOTE: [{ name: "note", label: "Note (internal, never shown to the customer)", type: "textarea" }],
};

/** Actions with their own structured forms in the fulfilment panel (they need parcel or exception ids). */
const PANEL_ACTIONS = ["RECORD_SUPPLIER_ORDER", "ADD_SHIPMENT", "MARK_SHIPMENT_DISPATCHED", "UPDATE_SHIPMENT", "MARK_SHIPMENT_DELIVERED", "MARK_SHIPMENT_LOST", "RAISE_FULFILMENT_EXCEPTION", "RESOLVE_FULFILMENT_EXCEPTION", "RECORD_REVIEW_REQUEST", "RECORD_CONTENT_PERMISSION"];

const humanise = (value: string) => value.replace(/[._]/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="rounded-2xl border border-ink/10 bg-white p-5">
    <h3 className="font-serif text-xl text-ink">{title}</h3>
    <div className="mt-3 text-base">{children}</div>
  </section>
);

const Operations = () => {
  const [key, setKey] = useState("");
  const [staff, setStaff] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [queue, setQueue] = useState<Json[] | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Json | null>(null);
  const [order, setOrder] = useState<Json | null>(null);
  const [enquiry, setEnquiry] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [action, setAction] = useState("");
  const [fields, setFields] = useState<Record<string, string | boolean | Record<string, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [brief, setBrief] = useState<Json | null>(null);
  const { hash } = useLocation();
  const [link] = useState(() => parseOperationsLink(hash));
  const [linkUsed, setLinkUsed] = useState(false);

  const api = useCallback(
    async (path: string, body?: Json): Promise<Json> => {
      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: { Authorization: `Bearer ${key}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        setSignedIn(false);
        throw new Error("The CRM key was not accepted.");
      }
      if (!response.ok) throw new Error(payload.message ?? `Request failed (${response.status}).`);
      return payload;
    },
    [key]
  );

  const loadQueue = useCallback(async () => {
    try {
      setQueue((await api("/api/crm/operations?view=queue")).items);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [api]);

  const openOrder = async (orderId: number, preselect?: string | null) => {
    setEnquiry(null);
    setBrief(null);
    setAction("");
    setFields({});
    try {
      const opened = await api(`/api/crm/operations?order=${orderId}`);
      setOrder(opened);
      if (preselect && opened.operations.available_actions.includes(preselect)) setAction(preselect);
      // The creative brief: every memory, style, plaque and frame detail, the
      // delivery address and the photos, so staff never need the database.
      setBrief(await api(`/api/crm/order-personalisation?order_id=${orderId}`));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const openEnquiry = async (reference: string) => {
    setOrder(null);
    setBrief(null);
    try {
      setEnquiry(await api(`/api/crm/operations?enquiry=${encodeURIComponent(reference)}`));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  useEffect(() => {
    if (signedIn) loadQueue();
  }, [signedIn, loadQueue]);

  // A notification link opens its order once, after sign-in. Opening is all it does.
  useEffect(() => {
    if (!signedIn || linkUsed || !link.reference) return;
    setLinkUsed(true);
    api(`/api/crm/operations?q=${encodeURIComponent(link.reference)}`)
      .then((found) => {
        const match = found.orders.find((o: Json) => o.reference === link.reference);
        if (!match) throw new Error(`No order ${link.reference} was found.`);
        return openOrder(match.order_id, link.action);
      })
      .catch((e) => setMessage((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, linkUsed, link, api]);


  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await api("/api/crm/operations?view=queue");
      setSignedIn(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const runAction = async (event: FormEvent) => {
    event.preventDefault();
    if (!order || !action) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await api("/api/crm/order-action", { order_id: order.order_id, action, staff, ...fields });
      const links = Object.entries(result.links ?? {}).map(([k, v]) => `${k} link: ${v}`);
      const emails = Object.entries(result.emails ?? {}).map(([k, v]) => `${humanise(k)} email: ${v}`);
      setMessage([`Done. Now: ${result.state ?? "—"}.`, result.warning, ...emails, ...links].filter(Boolean).join("\n"));
      await openOrder(order.order_id);
      await loadQueue();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  /** A structured fulfilment action from the panel. Returns whether it succeeded. */
  const runPanelAction = async (panelAction: string, body: Json): Promise<boolean> => {
    if (!order) return false;
    setMessage(null);
    try {
      const result = await api("/api/crm/order-action", { order_id: order.order_id, action: panelAction, staff, ...body });
      const emails = Object.entries(result.emails ?? {}).map(([k, v]) => `${humanise(k)} email: ${v}`);
      setMessage([`${humanise(panelAction)}: ${result.outcome}. Now: ${result.state ?? "—"}.`, result.warning, ...emails].filter(Boolean).join("\n"));
      await openOrder(order.order_id);
      await loadQueue();
      return true;
    } catch (e) {
      setMessage((e as Error).message);
      return false;
    }
  };

  /** Support evidence is private: fetched with the CRM key (audited) and saved as a download. */
  const downloadEvidence = async (evidenceId: number) => {
    try {
      const response = await fetch(`/api/crm/fulfilment?evidence_id=${evidenceId}&staff=${encodeURIComponent(staff)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error("That evidence could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mcb-evidence-${evidenceId}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  /** Photos are private: fetched with the CRM key and saved as a download. */
  const downloadPhoto = async (photoId: string) => {
    try {
      const response = await fetch(`/api/crm/upload?id=${encodeURIComponent(photoId)}`, { headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error("That photo could not be downloaded.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `mcb-photo-${photoId}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const acknowledge = async (itemKey: string) => {
    try {
      await api("/api/crm/operations", { action: "ACKNOWLEDGE", item_key: itemKey, staff });
      await loadQueue();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const setEnquiryStatus = async (reference: string, status: string) => {
    try {
      await api("/api/crm/operations", { action: "ENQUIRY_STATUS", reference, status, staff });
      await openEnquiry(reference);
      await loadQueue();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <main className="min-h-screen bg-ivory px-4 py-8 text-espresso sm:px-8">
      <Helmet>
        <title>MCB Operations</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-7xl">
        <h1 className="font-serif text-3xl text-ink">MCB Operations</h1>

        {!signedIn ? (
          <form onSubmit={signIn} className="mt-6 max-w-md space-y-4 rounded-2xl border border-ink/10 bg-white p-6">
            <label className="block font-semibold">CRM key<input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={input} /></label>
            <label className="block font-semibold">Your name (for the audit trail)<input value={staff} onChange={(e) => setStaff(e.target.value)} className={input} /></label>
            <button className={btn} disabled={!key || !staff}>Open</button>
            {message && <p role="alert" className="text-[#9B2C2C]">{message}</p>}
            {link.reference && <p className="text-sm text-espresso/75">After you sign in, order {link.reference} opens. The link itself authorises nothing.</p>}
            <p className="text-sm text-espresso/75">The key stays in this tab only and is forgotten when you close it.</p>
          </form>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="min-w-0 space-y-4">
              <form
                className="flex gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    setResults(await api(`/api/crm/operations?q=${encodeURIComponent(search.trim())}`));
                  } catch (err) {
                    setMessage((err as Error).message);
                  }
                }}
              >
                <label className="sr-only" htmlFor="ops-search">Find</label>
                <input id="ops-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="MCB reference, email, order number, LIVE-/FP- reference" className={input} />
                <button className={btn}>Find</button>
              </form>
              {results && (
                <Section title="Results">
                  <ul className="m-0 list-none space-y-2 p-0">
                    {results.orders.map((o: Json) => (
                      <li key={o.order_id}><button className="text-left underline" onClick={() => openOrder(o.order_id)}>{o.reference ?? `Order ${o.order_id}`} — {o.customer?.name} — {o.state ?? o.payment_status}</button></li>
                    ))}
                    {results.enquiries.map((e: Json) => (
                      <li key={e.reference}><button className="text-left underline" onClick={() => openEnquiry(e.reference)}>{e.reference} — {humanise(e.type)} — {e.status}</button></li>
                    ))}
                    {results.orders.length + results.enquiries.length === 0 && <li>Nothing found.</li>}
                  </ul>
                </Section>
              )}

              <div className="flex items-center justify-between">
                <h2 className="font-serif text-2xl text-ink">Queue {queue ? `(${queue.length})` : ""}</h2>
                <button className={ghost} onClick={loadQueue}>Refresh</button>
              </div>
              <ul className="m-0 list-none space-y-3 p-0">
                {(queue ?? []).map((item) => (
                  <li key={item.key} className={`rounded-2xl border bg-white p-4 ${item.priority === 1 ? "border-[#9B2C2C]/50" : "border-ink/10"}`}>
                    <p className="text-sm font-semibold uppercase tracking-wide text-gold-deep">{item.label}{item.flags?.length ? ` · ${item.flags.map(humanise).join(", ")}` : ""}</p>
                    <p className="mt-1">{item.detail}</p>
                    <p className="mt-1 text-sm text-espresso/75">{item.subject.reference ?? (item.subject.order_id ? `Order ${item.subject.order_id}` : "Payment")} · since {item.since ?? "—"}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.subject.order_id && <button className={ghost} onClick={() => openOrder(item.subject.order_id)}>Open</button>}
                      {(item.subject.type === "MCB_LIVE_ENQUIRY" || item.subject.type === "BESPOKE_ENQUIRY") && <button className={ghost} onClick={() => openEnquiry(item.subject.reference)}>Open</button>}
                      {item.acknowledged ? (
                        <span className="self-center text-sm">Seen by {item.acknowledged.staff}</span>
                      ) : (
                        <button className={ghost} onClick={() => acknowledge(item.key)}>Mark seen</button>
                      )}
                    </div>
                  </li>
                ))}
                {queue?.length === 0 && <li>Nothing needs attention.</li>}
              </ul>
            </div>

            <div className="min-w-0 space-y-4">
              {message && <pre role="status" className="whitespace-pre-wrap break-all rounded-2xl bg-white p-4 text-base">{message}</pre>}

              {order && (
                <>
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{order.reference ?? `Order ${order.order_id}`}</h2>
                    <p className="mt-1">{humanise(order.workflow)} · payment {order.payment_status}{order.test_payment ? " (TEST)" : ""}</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{STATE_TEXT[order.operations.state] ?? order.operations.state ?? "Not paid"}</p>
                    {order.operations.next_action && <p className="mt-1">Next: {order.operations.next_action}</p>}
                  </div>

                  {order.operations.fulfilment.approval?.required && (
                    <section aria-labelledby="approval-heading" className="rounded-2xl border-2 border-ink bg-white p-5">
                      <h3 id="approval-heading" className="font-serif text-xl uppercase tracking-wide text-ink">Fulfilment approval required</h3>
                      <dl className="m-0 mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                        <dt className="font-semibold">Order</dt><dd className="m-0">{order.reference}</dd>
                        <dt className="font-semibold">Product</dt><dd className="m-0">{order.lines.map((l: Json) => `${l.quantity} × ${l.name}`).join(", ")}</dd>
                        <dt className="font-semibold">Customer payment</dt><dd className="m-0">{order.operations.fulfilment.approval.customer_payment}</dd>
                        <dt className="font-semibold">MCB QC</dt><dd className="m-0">{order.operations.fulfilment.approval.mcb_qc}</dd>
                        <dt className="font-semibold">Supplier order</dt><dd className="m-0">{order.operations.fulfilment.approval.supplier_order}</dd>
                        <dt className="font-semibold">Manufacturing package</dt><dd className="m-0">{order.operations.fulfilment.approval.manufacturing_package ? `${order.operations.fulfilment.approval.manufacturing_package.status} (v${order.operations.fulfilment.approval.manufacturing_package.version})` : "not built"}</dd>
                      </dl>
                      {order.operations.fulfilment.approval.manufacturing_package?.blockers?.length > 0 && (
                        <ul className="mt-2 list-disc pl-5 text-sm">{order.operations.fulfilment.approval.manufacturing_package.blockers.map((b: string) => <li key={b}>{humanise(b)}</li>)}</ul>
                      )}
                      {order.operations.fulfilment.approval.supplier_order_pack && (
                        <div className="mt-3 text-sm">
                          <p className="font-semibold">Supplier order pack v{order.operations.fulfilment.approval.supplier_order_pack.version} (internal)</p>
                          <ul className="list-disc pl-5">
                            {order.operations.fulfilment.approval.supplier_order_pack.lines.map((l: Json, i: number) => (
                              <li key={i}>
                                {l.quantity} × {l.product}: {l.supplier_data_status === "ON_FILE" ? (
                                  <>
                                    {l.supplier ?? "supplier"}{l.configuration ? ` · ${l.configuration}` : ""}
                                    {l.expected_cost_minor !== null ? ` · estimated cost ${(l.expected_cost_minor / 100).toFixed(2)} ${l.currency ?? ""}` : ""}
                                    {l.shipping_allowance_minor !== null ? ` · delivery provision ${(l.shipping_allowance_minor / 100).toFixed(2)} ${l.currency ?? ""}` : ""}
                                    {l.product_url && <> · <a href={l.product_url} target="_blank" rel="noopener noreferrer" className="underline">supplier product page</a></>}
                                  </>
                                ) : "supplier data not on file"}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {order.operations.fulfilment.controller?.decision && <DecisionDetails decision={order.operations.fulfilment.controller.decision} />}
                      <p className="mt-3 text-sm">Only Bella or Lewis can authorise, with their own authorisation code. Opening this page authorises nothing, and nothing is purchased automatically.</p>
                      {order.operations.available_actions.includes("AUTHORISE_SUPPLIER_PURCHASE") && action !== "AUTHORISE_SUPPLIER_PURCHASE" && (
                        <button className={`${btn} mt-3`} onClick={() => { setAction("AUTHORISE_SUPPLIER_PURCHASE"); setFields({}); }}>Authorise supplier purchase…</button>
                      )}
                    </section>
                  )}

                  <Section title="Action">
                    <form onSubmit={runAction} className="space-y-3">
                      <select value={action} onChange={(e) => { setAction(e.target.value); setFields(["PASS_QUALITY_CHECK", "SEND_REVEAL", "MARK_DISPATCHED", "CONFIRM_FULFILMENT"].includes(e.target.value) ? { send_email: true, ...(e.target.value === "PASS_QUALITY_CHECK" ? { reveal_now: true, checklist: {} } : {}) } : {}); }} className={input} aria-label="Action">
                        <option value="">Choose an action…</option>
                        {order.operations.available_actions.filter((a: string) => !PANEL_ACTIONS.includes(a)).map((a: string) => <option key={a} value={a}>{humanise(a)}</option>)}
                      </select>
                      {action === "PASS_QUALITY_CHECK" && (
                        <fieldset className="rounded-xl border border-ink/15 p-3">
                          <legend className="px-1 font-semibold">Internal quality checklist — every item</legend>
                          {QC_CHECKLIST.filter((item) => (order.operations.quality_check?.items ?? []).includes(item.id)).map((item) => {
                            const list = (fields.checklist ?? {}) as Record<string, boolean>;
                            return (
                              <label key={item.id} className="flex min-h-11 items-center gap-2">
                                <input type="checkbox" checked={list[item.id] === true} onChange={(e) => setFields({ ...fields, checklist: { ...list, [item.id]: e.target.checked } })} className="h-5 w-5" />
                                {item.label}
                              </label>
                            );
                          })}
                        </fieldset>
                      )}
                      {(ACTION_FIELDS[action] ?? []).filter((f) => !(order.workflow === "PHYSICAL" && ["reveal_url", "reveal_now"].includes(f.name)) && !(order.workflow === "PHYSICAL" && action === "PASS_QUALITY_CHECK" && f.name === "send_email")).map((f) => (
                        <label key={f.name} className={f.type === "checkbox" ? "flex items-center gap-2" : "block"}>
                          {f.type === "checkbox" ? (
                            <input type="checkbox" checked={fields[f.name] === true} onChange={(e) => setFields({ ...fields, [f.name]: e.target.checked })} className="h-5 w-5" />
                          ) : null}
                          <span className="font-semibold">{f.label}</span>
                          {f.type === "select" ? (
                            <select value={String(fields[f.name] ?? "")} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} className={input}>
                              <option value="">Choose…</option>
                              {f.options?.map((o) => <option key={o} value={o}>{humanise(o)}</option>)}
                            </select>
                          ) : f.type === "textarea" ? (
                            <textarea value={String(fields[f.name] ?? "")} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} rows={3} className={input} />
                          ) : f.type !== "checkbox" ? (
                            <input type={f.type ?? "text"} autoComplete={f.type === "password" ? "off" : undefined} value={String(fields[f.name] ?? "")} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} className={input} />
                          ) : null}
                        </label>
                      ))}
                      <button className={btn} disabled={!action || busy}>{busy ? "Saving…" : "Do it"}</button>
                    </form>
                  </Section>

                  <Section title="Customer and order">
                    <p>{order.customer?.name} · {order.customer?.email}{order.customer?.phone ? ` · ${order.customer.phone}` : ""}</p>
                    <ul className="m-0 mt-2 list-disc pl-5">
                      {order.lines.map((l: Json, i: number) => <li key={i}>{l.quantity} × {l.name}</li>)}
                    </ul>
                    <p className="mt-2">
                      Quality check: {order.operations.quality_check?.passed_at ? `passed ${order.operations.quality_check.passed_at} by ${order.operations.quality_check.passed_by}` : "not passed yet"}
                      {order.operations.quality_check?.failed_count ? ` · failed ${order.operations.quality_check.failed_count} time(s) before` : ""}
                    </p>
                    {order.operations.reveal && <p>Reveal: {order.operations.reveal.revealed_at ? `revealed ${order.operations.reveal.revealed_at}` : "not revealed yet"}</p>}
                    {order.operations.fulfilment.purchase_authorised_by && <p>Supplier purchase authorised by {humanise(order.operations.fulfilment.purchase_authorised_by)}{order.operations.fulfilment.purchase_authorised_at ? ` at ${order.operations.fulfilment.purchase_authorised_at}` : ""}</p>}
                    {order.operations.lifecycle?.completed && (
                      <p>Completed {order.operations.lifecycle.completed_at} · follow-up {order.operations.lifecycle.follow_up_sent_at ? `sent ${order.operations.lifecycle.follow_up_sent_at}` : order.operations.lifecycle.follow_up_done_at ? "recorded" : "not yet"} · review {order.operations.lifecycle.review_requested_at ? `requested ${order.operations.lifecycle.review_requested_at}` : "not requested"}</p>
                    )}
                    {order.operations.legacy_approval && <p className="text-sm text-espresso/75">Legacy record (retired approval model): approved {order.operations.legacy_approval.approved_at ?? "—"} via {order.operations.legacy_approval.channel ?? "—"}</p>}
                    <p>Fulfilment: {humanise(order.operations.fulfilment.state)}{order.operations.fulfilment.pending_reason ? ` (waiting on ${humanise(order.operations.fulfilment.pending_reason)})` : ""}</p>
                    {order.operations.fulfilment.review_required && (
                      <p className={order.operations.fulfilment.review_confirmed ? "" : "font-semibold text-red-800"}>
                        {order.operations.fulfilment.review_confirmed
                          ? "Availability and delivery confirmed with the partner."
                          : "Before placing this order: confirm availability, the destination and the actual delivery cost with the partner. Nothing is bought automatically."}
                      </p>
                    )}
                    {order.operations.delivery.carrier && <p>Delivery: {order.operations.delivery.carrier} {order.operations.delivery.tracking_reference ?? ""} · sent {order.operations.delivery.dispatched_on ?? "—"} · delivered {order.operations.delivery.delivered_on ?? "not recorded"}</p>}
                  </Section>

                  {order.payment_status === "PAID" && order.operations.fulfilment.controller && (
                    <Section title="Supplier orders, parcels and exceptions">
                      <FulfilmentPanel controller={order.operations.fulfilment.controller} state={order.operations.state} actions={order.operations.available_actions} run={runPanelAction} downloadEvidence={downloadEvidence} />
                    </Section>
                  )}

                  {order.payment_status === "PAID" && order.lines.some((l: Json) => l.sku === "memory-music-video") && (
                    <Section title="MCB Memory Music Video">
                      <VideoPanel key={`v${order.order_id}`} orderId={order.order_id} reference={order.reference} apiKey={key} staff={staff} />
                    </Section>
                  )}

                  {order.payment_status === "PAID" && order.workflow === "PHYSICAL" && (
                    <Section title="Production files and manufacturing package">
                      <ProductionFilesPanel key={`p${order.order_id}`} orderId={order.order_id} reference={order.reference} apiKey={key} staff={staff} />
                    </Section>
                  )}

                  {order.payment_status === "PAID" && (
                    <Section title="Creative Factory">
                      <CreativeFactoryPanel key={order.order_id} orderId={order.order_id} reference={order.reference} apiKey={key} staff={staff} />
                    </Section>
                  )}

                  {brief && (
                    <Section title="Creative brief">
                      {brief.songs.map((song: Json, i: number) => (
                        <div key={i} className="mb-5">
                          <p className="font-semibold text-ink">
                            {humanise(song.product_id)} {song.unit}
                            {song.format ? ` · ${song.format.size_inches}-inch ${song.format.picture_disc ? "picture disc" : "standard vinyl"}${song.format.shape === "HEART" ? " (heart)" : ""}${song.format.disc_count > 1 ? ` · ${song.format.disc_count} records` : ""}${song.format.gatefold ? " · gatefold" : ""}` : " · digital"}
                            {song.priority_replacement ? " · Priority Replacement" : ""}
                          </p>
                          <ol className="m-0 mt-2 list-decimal space-y-3 pl-5">
                            {song.memories.map((m: Json) => (
                              <li key={m.song}>
                                <p className="whitespace-pre-wrap">{m.story}</p>
                                <p className="text-sm text-espresso/75">
                                  {m.about ? `About: ${m.about} · ` : ""}{m.occasion ? `Occasion: ${m.occasion} · ` : ""}Style: {m.style_choice === "MCB_CHOICE" ? "MCB to choose" : m.style}
                                </p>
                                {m.photo && (m.photo.id
                                  ? <button className={`${ghost} mt-1`} onClick={() => downloadPhoto(m.photo.id)}>Download photo</button>
                                  : <p className="text-sm font-semibold text-[#9B2C2C]">Photo expected but not received</p>)}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ))}
                      {brief.plaques.map((pl: Json) => (
                        <div key={`p${pl.plaque}`} className="mb-4">
                          <p className="font-semibold text-ink">Music plaque {pl.plaque}: “{pl.song_title}” — {pl.artist}</p>
                          {pl.photo_id ? <button className={`${ghost} mt-1`} onClick={() => downloadPhoto(pl.photo_id)}>Download photo</button> : <p className="text-sm font-semibold text-[#9B2C2C]">Photo not received</p>}
                        </div>
                      ))}
                      {brief.frames.map((f: Json) => (
                        <p key={`f${f.sku}${f.frame}`} className="mb-2">
                          Lyrics frame {f.frame} ({f.sku}): {f.lyrics ? `lyrics of ${humanise(brief.order.package)} ${f.lyrics.unit}, song ${f.lyrics.song}` : "no song chosen"}{f.heading ? ` · heading “${f.heading}”` : ""}
                        </p>
                      ))}
                      {brief.delivery_address && (
                        <div className="mt-4">
                          <p className="font-semibold text-ink">Deliver to</p>
                          <p className="whitespace-pre-line">
                            {[brief.delivery_address.recipient_name, brief.delivery_address.address_line_1, brief.delivery_address.address_line_2, brief.delivery_address.city, brief.delivery_address.state_region, brief.delivery_address.postal_code, brief.delivery_address.country, brief.delivery_address.phone].filter(Boolean).join("\n")}
                          </p>
                          {brief.order.delivery?.label && <p className="text-sm text-espresso/75">Delivery quoted: {brief.order.delivery.label}{brief.order.delivery.test_only ? " (TEST rate)" : ""}</p>}
                        </div>
                      )}
                    </Section>
                  )}

                  {order.service_requests.length > 0 && (
                    <Section title="Customer cases">
                      <ul className="m-0 list-none space-y-3 p-0">
                        {order.service_requests.map((s: Json) => (
                          <li key={s.id}>
                            <p className="text-sm text-espresso/75">#{s.id} · {humanise(s.kind)}{s.item ? ` · ${s.item}` : ""} · {s.status}{s.priority_replacement_requested ? ` · Priority Replacement: ${humanise(s.eligibility)}` : ""}</p>
                            <p className="whitespace-pre-wrap">{s.description}</p>
                            <a className={`${ghost} mt-2`} href={`/operations/customer-care#case=${s.id}`}>Open in Customer Care</a>
                            {["NEW", "REVIEWING", "WAITING_FOR_MCB", "WAITING_FOR_CUSTOMER", "RESOLUTION_IN_PROGRESS"].includes(s.status) && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {["REPLACEMENT_ARRANGED", "RESENT_OR_REPAIRED", "ANSWERED", "NO_ACTION_NEEDED"].map((resolution) => (
                                  <button key={resolution} className={ghost} onClick={async () => {
                                    try {
                                      await api("/api/crm/order-action", { order_id: order.order_id, action: "UPDATE_SERVICE_REQUEST", staff, request_id: s.id, status: "RESOLVED", resolution });
                                      await openOrder(order.order_id);
                                      await loadQueue();
                                    } catch (e) {
                                      setMessage((e as Error).message);
                                    }
                                  }}>{humanise(resolution)}</button>
                                ))}
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {order.notes.length > 0 && (
                    <Section title="Internal notes">
                      <ul className="m-0 list-none space-y-2 p-0">{order.notes.map((n: Json, i: number) => <li key={i}><span className="text-sm text-espresso/75">{n.staff} · {n.created_at}</span><p className="whitespace-pre-wrap">{n.note}</p></li>)}</ul>
                    </Section>
                  )}

                  <Section title="Emails">
                    <ul className="m-0 list-none space-y-1 p-0">
                      {order.communications.map((c: Json, i: number) => (
                        <li key={i}>
                          {humanise(c.message_type)} ({c.dedupe_key || "once"}) — {c.status}{c.failure_code ? ` (${c.failure_code})` : ""}
                          {c.status === "FAILED" && (
                            <button className={`${ghost} ml-2`} onClick={async () => {
                              try {
                                const r = await api("/api/crm/order-action", { order_id: order.order_id, action: "RETRY_MESSAGE", staff, type: c.message_type, dedupe_key: c.dedupe_key });
                                setMessage(`Retry: ${JSON.stringify(r.emails)}`);
                                await openOrder(order.order_id);
                              } catch (e) {
                                setMessage((e as Error).message);
                              }
                            }}>Retry</button>
                          )}
                        </li>
                      ))}
                      {order.communications.length === 0 && <li>None yet.</li>}
                    </ul>
                  </Section>

                  <Section title="Timeline">
                    <ol className="m-0 list-none space-y-1 p-0 text-sm">
                      {order.timeline.map((e: Json, i: number) => <li key={i}><span className="font-mono">{e.created_at}</span> · {e.event_type}</li>)}
                    </ol>
                  </Section>
                </>
              )}

              {enquiry && (
                <>
                  <h2 className="font-serif text-2xl text-ink">{enquiry.enquiry.reference}</h2>
                  <p>{humanise(enquiry.type)} · status {enquiry.enquiry.status}</p>
                  <Section title="Details">
                    <dl className="m-0 space-y-1">
                      {Object.entries(enquiry.enquiry).filter(([k]) => !["reference", "status"].includes(k)).map(([k, v]) => (
                        <div key={k}><dt className="inline font-semibold">{humanise(k)}: </dt><dd className="m-0 inline whitespace-pre-wrap">{v === null ? "—" : String(v)}</dd></div>
                      ))}
                    </dl>
                  </Section>
                  <Section title="Set status">
                    <div className="flex flex-wrap gap-2">
                      {(enquiry.type === "MCB_LIVE_ENQUIRY" ? ["IN_CONVERSATION", "QUOTE_SENT", "CLOSED", "DECLINED"] : ["IN_CONVERSATION", "PROPOSAL_SENT", "AGREED", "CLOSED", "DECLINED"]).map((status) => (
                        <button key={status} className={ghost} onClick={() => setEnquiryStatus(enquiry.enquiry.reference, status)}>{humanise(status)}</button>
                      ))}
                    </div>
                  </Section>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Operations;
