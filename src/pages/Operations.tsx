import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { OPERATIONAL_STATES } from "../data/operations";

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
const ACTION_FIELDS: Record<string, { name: string; label: string; type?: "text" | "date" | "url" | "select" | "textarea" | "checkbox"; options?: string[] }[]> = {
  REQUEST_APPROVAL: [{ name: "preview_url", label: "Private listening link (https)", type: "url" }, { name: "send_email", label: "Email the customer the approval link", type: "checkbox" }],
  RECORD_APPROVAL: [{ name: "channel", label: "How they approved", type: "select", options: ["EMAIL", "WHATSAPP", "PHONE", "IN_PERSON"] }, { name: "reference", label: "Where to find it (optional)" }],
  RECORD_CHANGES_REQUEST: [{ name: "channel", label: "How they asked", type: "select", options: ["EMAIL", "WHATSAPP", "PHONE", "IN_PERSON"] }, { name: "summary", label: "What they asked for", type: "textarea" }],
  CONFIRM_FULFILMENT: [{ name: "fulfilment_reference", label: "Your order reference with the supplier (optional)" }],
  MARK_DISPATCHED: [{ name: "carrier", label: "Carrier" }, { name: "tracking_reference", label: "Tracking reference (optional)" }, { name: "tracking_url", label: "Tracking link, https (optional)", type: "url" }, { name: "dispatched_on", label: "Dispatched on", type: "date" }, { name: "send_email", label: "Email the customer", type: "checkbox" }],
  UPDATE_TRACKING: [{ name: "carrier", label: "Carrier" }, { name: "tracking_reference", label: "Tracking reference (optional)" }, { name: "tracking_url", label: "Tracking link, https (optional)", type: "url" }, { name: "dispatched_on", label: "Dispatched on", type: "date" }],
  MARK_DELIVERED: [{ name: "delivered_on", label: "Delivered on", type: "date" }],
  RECORD_FOLLOW_UP: [{ name: "send_email", label: "Send the check-in email", type: "checkbox" }],
  REOPEN: [{ name: "reason", label: "Reason", type: "select", options: ["CUSTOMER_REQUEST", "MCB_CORRECTION", "REPLACEMENT", "OTHER"] }],
  REVOKE_LINKS: [{ name: "purpose", label: "Which links", type: "select", options: ["STATUS", "APPROVAL"] }],
  ADD_NOTE: [{ name: "note", label: "Note (internal, never shown to the customer)", type: "textarea" }],
};

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
  const [fields, setFields] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

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

  const openOrder = async (orderId: number) => {
    setEnquiry(null);
    setAction("");
    setFields({});
    try {
      setOrder(await api(`/api/crm/operations?order=${orderId}`));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  const openEnquiry = async (reference: string) => {
    setOrder(null);
    try {
      setEnquiry(await api(`/api/crm/operations?enquiry=${encodeURIComponent(reference)}`));
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  useEffect(() => {
    if (signedIn) loadQueue();
  }, [signedIn, loadQueue]);

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
            <p className="text-sm text-espresso/75">The key stays in this tab only and is forgotten when you close it.</p>
          </form>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <div className="space-y-4">
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

            <div className="space-y-4">
              {message && <pre role="status" className="whitespace-pre-wrap break-all rounded-2xl bg-white p-4 text-base">{message}</pre>}

              {order && (
                <>
                  <div>
                    <h2 className="font-serif text-2xl text-ink">{order.reference ?? `Order ${order.order_id}`}</h2>
                    <p className="mt-1">{humanise(order.workflow)} · payment {order.payment_status}{order.test_payment ? " (TEST)" : ""}</p>
                    <p className="mt-2 text-lg font-semibold text-ink">{STATE_TEXT[order.operations.state] ?? order.operations.state ?? "Not paid"}</p>
                    {order.operations.next_action && <p className="mt-1">Next: {order.operations.next_action}</p>}
                  </div>

                  <Section title="Action">
                    <form onSubmit={runAction} className="space-y-3">
                      <select value={action} onChange={(e) => { setAction(e.target.value); setFields(e.target.value === "REQUEST_APPROVAL" || e.target.value === "MARK_DISPATCHED" ? { send_email: true } : {}); }} className={input} aria-label="Action">
                        <option value="">Choose an action…</option>
                        {order.operations.available_actions.map((a: string) => <option key={a} value={a}>{humanise(a)}</option>)}
                      </select>
                      {(ACTION_FIELDS[action] ?? []).map((f) => (
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
                            <input type={f.type ?? "text"} value={String(fields[f.name] ?? "")} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} className={input} />
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
                    <p className="mt-2">Revisions: {order.operations.revisions.used} used of {order.operations.revisions.included ?? "no numeric allowance — decide"}</p>
                    <p>Fulfilment: {humanise(order.operations.fulfilment.state)}{order.operations.fulfilment.pending_reason ? ` (waiting on ${humanise(order.operations.fulfilment.pending_reason)})` : ""}</p>
                    {order.operations.delivery.carrier && <p>Delivery: {order.operations.delivery.carrier} {order.operations.delivery.tracking_reference ?? ""} · sent {order.operations.delivery.dispatched_on ?? "—"} · delivered {order.operations.delivery.delivered_on ?? "not recorded"}</p>}
                    <p className="mt-2 text-sm">The full creative brief, photos and address are at {order.brief}.</p>
                  </Section>

                  {order.operations.revisions.requests.length > 0 && (
                    <Section title="Change requests">
                      <ul className="m-0 list-none space-y-3 p-0">
                        {order.operations.revisions.requests.map((r: Json, i: number) => (
                          <li key={i}><p className="text-sm text-espresso/75">Round {r.approval_round} · {humanise(r.channel)} · within allowance: {r.within_allowance}</p><p className="whitespace-pre-wrap">{r.feedback ?? "—"}</p></li>
                        ))}
                      </ul>
                    </Section>
                  )}

                  {order.service_requests.length > 0 && (
                    <Section title="Customer reports and questions">
                      <ul className="m-0 list-none space-y-3 p-0">
                        {order.service_requests.map((s: Json) => (
                          <li key={s.id}>
                            <p className="text-sm text-espresso/75">#{s.id} · {humanise(s.kind)}{s.item ? ` · ${s.item}` : ""} · {s.status}{s.priority_replacement_requested ? ` · Priority Replacement: ${humanise(s.eligibility)}` : ""}</p>
                            <p className="whitespace-pre-wrap">{s.description}</p>
                            {(s.status === "OPEN" || s.status === "IN_REVIEW") && (
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
