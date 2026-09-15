import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { ago, humanise, money, type Json } from "../lib/commandCentre";
import { CARE_FILTERS, CASE_STATUS_LABELS, PRIORITY_LABELS, careLink, parseCareLink } from "../lib/customerCare";
import { card, eyebrow, field, primary, secondary } from "./command-centre/styles";
import { Panel, Status, Tile } from "./command-centre/ui";
import CaseView from "./customer-care/CaseView";

/**
 * /operations/customer-care — MCB's customer care console for staff.
 *
 * THE CUSTOMER BOUGHT FROM MCB. MCB OWNS THE EXPERIENCE. Structured cases,
 * not a technical ticket list: who needs help, what happened, and the next
 * action. Nothing here refunds, purchases or charges; founder decisions need
 * Bella's or Lewis's own authorisation code. The CRM key stays in memory.
 */
const CustomerCare = () => {
  const { hash } = useLocation();
  const link = parseCareLink(hash);
  const [key, setKey] = useState("");
  const [staff, setStaff] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [data, setData] = useState<Json | null>(null);

  const api = useCallback(async (path: string, body?: Json): Promise<Json> => {
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
  }, [key]);

  const fetchBlob = useCallback(async (path: string): Promise<string> => {
    const response = await fetch(path, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw new Error("That file could not be opened.");
    return URL.createObjectURL(await response.blob());
  }, [key]);

  const q = useCallback((extra: string) => `/api/crm/support?${extra}&staff=${encodeURIComponent(staff)}`, [staff]);

  useEffect(() => {
    if (!signedIn || link.caseId) return;
    let cancelled = false;
    const path = link.view === "metrics" ? q("view=metrics") : link.view === "health" ? q("view=health") : q(`view=list&filter=${link.filter}`);
    Promise.resolve()
      .then(() => { if (!cancelled) setData(null); })
      .then(() => api(path))
      .then((result) => { if (!cancelled) setData(result); })
      .catch((e) => { if (!cancelled) setMessage((e as Error).message); });
    return () => { cancelled = true; };
  }, [signedIn, link.view, link.filter, link.caseId, api, q]);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    try {
      await api(`/api/crm/support?view=list&filter=new&staff=${encodeURIComponent(staff)}`);
      setSignedIn(true);
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <Helmet>
        <title>MCB Customer Care</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <a href="#care-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-ivory">Skip to content</a>
      <header className="bg-ink px-4 py-5 text-ivory sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">My Custom Beats</p>
            <p className="font-serif text-2xl !text-ivory sm:text-3xl">Customer Care</p>
          </div>
          {signedIn && <p className="text-sm text-ivory/80">Signed in as {staff}</p>}
        </div>
        {signedIn && (
          <nav aria-label="Customer care" className="mx-auto mt-4 max-w-7xl overflow-x-auto" tabIndex={-1}>
            <ul className="m-0 flex list-none gap-2 p-0 pb-1">
              {[...CARE_FILTERS.map(([f, label]) => ({ href: careLink({ filter: f }), label, current: link.view === "cases" && !link.caseId && link.filter === f, count: data?.counts?.[f] })),
                { href: careLink({ view: "metrics" }), label: "Metrics", current: link.view === "metrics" && !link.caseId, count: undefined },
                { href: careLink({ view: "health" }), label: "Health", current: link.view === "health" && !link.caseId, count: undefined }].map((n) => (
                <li key={n.href} className="shrink-0">
                  <a href={n.href} aria-current={n.current ? "page" : undefined}
                    className={`inline-flex min-h-12 items-center rounded-full px-4 text-base font-semibold focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gold ${n.current ? "bg-gold text-ink" : "text-ivory hover:bg-white/10"}`}>
                    {n.label}{typeof n.count === "number" ? ` (${n.count})` : ""}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>

      <main id="care-main" className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-8">
        {!signedIn ? (
          <form onSubmit={signIn} className={`${card} mx-auto max-w-md space-y-4`}>
            <h1 className="font-serif text-3xl text-ink">Sign in</h1>
            <label className="block font-semibold">CRM key<input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} className={field} /></label>
            <label className="block font-semibold">Your name (for the audit trail)<input value={staff} onChange={(e) => setStaff(e.target.value)} className={field} /></label>
            <button className={primary} disabled={!key || !staff}>Open Customer Care</button>
            {message && <p role="alert" className="font-semibold text-[#8A1F1F]">{message}</p>}
            {link.caseId && <p className="text-sm">After you sign in, case {link.caseId} opens. The link itself does nothing.</p>}
            <p className="text-sm text-ink/75">The key stays in this tab only and is forgotten when you close it.</p>
          </form>
        ) : (
          <>
            {message && <p role="status" className={`${card} whitespace-pre-wrap`}>{message} <button type="button" className="ml-2 min-h-12 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}
            {link.caseId ? (
              <>
                <a className={secondary} href={careLink({ filter: link.filter })}>← All cases</a>
                <CaseView key={link.caseId} caseId={link.caseId} api={api} fetchBlob={fetchBlob} staff={staff} onMessage={setMessage} />
              </>
            ) : link.view === "metrics" ? (
              <Metrics data={data} />
            ) : link.view === "health" ? (
              <Health data={data} />
            ) : (
              <>
                <div>
                  <p className={eyebrow}>We aim to reply within one working day</p>
                  <h1 className="font-serif text-4xl text-ink">{CARE_FILTERS.find(([f]) => f === link.filter)?.[1]}</h1>
                </div>
                {!data?.cases ? <p role="status">Loading…</p> : data.cases.length === 0 ? <p className={card}>No cases here.</p> : (
                  <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
                    {data.cases.map((c: Json) => (
                      <li key={c.case_id} className={`${card} flex min-w-0 flex-col gap-3 border-l-4 ${c.privacy_review === "PRIVACY_REVIEW_REQUIRED" || c.priority === "URGENT" ? "border-l-[#9B2C2C]" : c.priority === "IMPORTANT" ? "border-l-gold" : "border-l-ink/20"}`}>
                        <div className="min-w-0">
                          <p className={eyebrow}>{c.privacy_review === "PRIVACY_REVIEW_REQUIRED" ? "Privacy review · " : ""}{PRIORITY_LABELS[c.priority]} · case {c.case_id}</p>
                          <p className="mt-1 text-lg font-semibold text-ink">{c.type}</p>
                          <p className="text-base text-ink/80">{c.reference} · {c.customer}</p>
                          <p className="break-words text-sm text-ink/70">{c.product}</p>
                        </div>
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink">
                          <dt className="font-semibold">Status</dt><dd className="m-0">{CASE_STATUS_LABELS[c.status]}{c.overdue ? " · overdue" : ""}</dd>
                          <dt className="font-semibold">Opened</dt><dd className="m-0">{ago(c.opened_at)}</dd>
                          <dt className="font-semibold">Next</dt><dd className="m-0">{c.next_action}</dd>
                        </dl>
                        {c.overdue && <Status good={false} label="Reply overdue" />}
                        <a className={`${primary} self-start`} href={careLink({ caseId: c.case_id })}>Open case<span className="sr-only"> {c.case_id} for {c.reference}</span></a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

const rate = (v: number | null | undefined) => (v === null || v === undefined ? "— Awaiting data" : `${Math.round(v * 1000) / 10}%`);

const Metrics = ({ data }: { data: Json | null }) => {
  if (!data?.metrics) return <p role="status">Loading…</p>;
  const m = data.metrics;
  return (
    <>
      <h1 className="font-serif text-4xl text-ink">Support metrics</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Open cases" value={m.open_cases} />
        <Tile label="New" value={m.new_cases} />
        <Tile label="Urgent" value={m.urgent_cases} emphasis={m.urgent_cases > 0} />
        <Tile label="Overdue MCB replies" value={m.overdue_mcb_cases} emphasis={m.overdue_mcb_cases > 0} />
      </div>
      <Panel id="care-rates" title="Service and recovery">
        <dl className={`${card} grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base`}>
          <dt>Average first response</dt><dd className="m-0 text-right">{m.average_first_response_hours === null ? "— Awaiting data" : `${m.average_first_response_hours} hours`}</dd>
          <dt>Average resolution</dt><dd className="m-0 text-right">{m.average_resolution_hours === null ? "— Awaiting data" : `${m.average_resolution_hours} hours`}</dd>
          <dt>Damage rate (physical orders)</dt><dd className="m-0 text-right">{rate(m.damage_rate)}</dd>
          <dt>Wrong-item rate</dt><dd className="m-0 text-right">{rate(m.wrong_item_rate)}</dd>
          <dt>Objective MCB error rate</dt><dd className="m-0 text-right">{rate(m.objective_mcb_error_rate)}</dd>
          <dt>Creative preference contacts</dt><dd className="m-0 text-right">{rate(m.subjective_preference_contact_rate)}</dd>
          <dt>Replacement rate</dt><dd className="m-0 text-right">{rate(m.replacement_rate)}</dd>
          <dt>Refund rate</dt><dd className="m-0 text-right">{rate(m.refund_rate)}</dd>
          <dt>Partial refunds recorded</dt><dd className="m-0 text-right">{money(m.partial_refund_value_minor)}</dd>
          <dt>Full refunds recorded</dt><dd className="m-0 text-right">{money(m.full_refund_value_minor)}</dd>
          <dt>Recovery success ("resolved for you?")</dt><dd className="m-0 text-right">{rate(m.recovery_success_rate)}</dd>
          <dt>Repeat contact rate</dt><dd className="m-0 text-right">{rate(m.repeat_contact_rate)}</dd>
        </dl>
        <p className="text-sm text-ink/80">{m.note}</p>
      </Panel>
      <Panel id="care-reasons" title="Cases by reason">
        <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
          {Object.entries(m.cases_by_reason as Record<string, number>).map(([k, v]) => <li key={k} className={card}>{humanise(k)}: {v}</li>)}
        </ul>
      </Panel>
    </>
  );
};

const Health = ({ data }: { data: Json | null }) => {
  if (!data?.labels) return <p role="status">Loading…</p>;
  return (
    <>
      <h1 className="font-serif text-4xl text-ink">No customer left waiting</h1>
      <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 md:grid-cols-2">
        {Object.entries(data.labels as Record<string, string>).map(([check, label]) => {
          const found = (data.findings as Json[]).filter((f) => f.check === check);
          return (
            <li key={check} className={`${card} space-y-2`}>
              <p className="flex items-start justify-between gap-3"><span>{label}</span><Status good={found.length === 0} label={found.length === 0 ? "OK" : String(found.length)} /></p>
              {found.map((f, i) => f.case_id ? <a key={i} className="mr-3 inline-flex min-h-12 items-center font-semibold underline" href={careLink({ caseId: f.case_id })}>{f.reference} · case {f.case_id}</a> : <span key={i} className="mr-3">{f.reference}</span>)}
            </li>
          );
        })}
      </ul>
    </>
  );
};

export default CustomerCare;
