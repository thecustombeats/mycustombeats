import { useCallback, useEffect, useId, useState } from "react";
import { ago, humanise, money, type Json } from "../../lib/commandCentre";
import { CASE_STATUS_LABELS, PRIORITY_LABELS, THREAD_LABELS, hours, poundsToMinor } from "../../lib/customerCare";
import { card, eyebrow, field, primary, secondary } from "../command-centre/styles";
import { Panel, Status } from "../command-centre/ui";

type Api = (path: string, body?: Json) => Promise<Json>;

/**
 * One customer case for staff. Everything needed to help, with links to the
 * protected records instead of copies. Actions go through /api/crm/support;
 * founder decisions need Bella's or Lewis's own code; nothing here refunds,
 * purchases or starts creative work from a preference.
 */
const CaseView = ({ caseId, api, fetchBlob, staff, onMessage }: { caseId: number; api: Api; fetchBlob: (path: string) => Promise<string>; staff: string; onMessage: (m: string | null) => void }) => {
  const [data, setData] = useState<Json | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/crm/support?case_id=${caseId}&staff=${encodeURIComponent(staff)}`));
    } catch (e) {
      onMessage((e as Error).message);
    }
  }, [api, caseId, staff, onMessage]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) load(); });
    return () => { cancelled = true; };
  }, [load]);

  const act = async (action: string, extra: Json = {}, done?: string): Promise<Json | null> => {
    setBusy(true);
    onMessage(null);
    try {
      const result = await api("/api/crm/support", { action, case_id: caseId, staff, ...extra });
      const notes = [done ?? "Saved.", result.warning, result.next, result.capacity_note, result.link ? `Fresh private link (it replaces their previous link; send it to the customer yourself): ${result.link}` : null, result.email ? `Email: ${humanise(result.email)}.` : null].filter(Boolean);
      onMessage(notes.join(" "));
      await load();
      return result;
    } catch (e) {
      onMessage((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <p role="status">Loading…</p>;
  const c = data.case;
  const open = !["RESOLVED", "CLOSED"].includes(c.status);

  return (
    <div className="space-y-8">
      <header className={`${card} space-y-3 border-l-4 ${c.privacy_review === "PRIVACY_REVIEW_REQUIRED" || c.priority === "URGENT" ? "border-l-[#9B2C2C]" : "border-l-gold"}`}>
        <p className={eyebrow}>Case {c.case_id} · {PRIORITY_LABELS[c.priority]} · {c.origin === "MCB" ? "opened by MCB" : "from the customer"}</p>
        <h1 className="font-serif text-3xl text-ink">{c.type}{c.issue ? ` · ${humanise(c.issue)}` : ""}</h1>
        <p className="text-lg">{data.order.reference} · {data.order.product}</p>
        <div className="flex flex-wrap gap-2">
          <Status good={!open} label={CASE_STATUS_LABELS[c.status]} />
          {c.due && <Status good={!c.due.overdue} label={c.due.overdue ? "Reply overdue" : `Reply due ${c.due.due_at} UTC`} />}
          {c.privacy_review === "PRIVACY_REVIEW_REQUIRED" && <Status good={false} label="Privacy review required" />}
          {c.priority_replacement.requested && <Status good={c.priority_replacement.eligibility === "ELIGIBLE"} label={`Priority Replacement: ${humanise(c.priority_replacement.eligibility)}`} />}
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold">Customer</dt><dd className="m-0 break-words">{data.customer.name} · {data.customer.email}</dd>
          <dt className="font-semibold">Order stage</dt><dd className="m-0">{data.order.stage ?? "—"}{data.order.destination_country ? ` · ${data.order.destination_country}` : ""}</dd>
          <dt className="font-semibold">Opened</dt><dd className="m-0">{ago(c.opened_at)}{c.first_response_at ? ` · first reply ${ago(c.first_response_at)}` : " · no reply yet"}</dd>
          <dt className="font-semibold">Waiting</dt><dd className="m-0">on MCB {hours(c.timings.waiting_mcb_seconds)} · on customer {hours(c.timings.waiting_customer_seconds)}{c.repeat_contacts ? ` · ${c.repeat_contacts} repeat contact(s)` : ""}</dd>
          {c.satisfaction && (<><dt className="font-semibold">Resolved for them?</dt><dd className="m-0">{c.satisfaction === "YES" ? "Yes" : "No"}</dd></>)}
        </dl>
        <a className={`${secondary} self-start`} href={`/operations#order=${data.order.reference}`}>Open order in staff console</a>
      </header>

      <Panel id="thread" title="Conversation">
        <ol className="m-0 list-none space-y-3 p-0">
          {data.thread.map((m: Json) => (
            <li key={`${m.kind}-${m.id}`} className={`${card} ${m.kind === "INTERNAL_NOTE" ? "bg-[#FBF6EA]" : m.kind === "SYSTEM_EVENT" ? "bg-ivory text-sm" : m.kind === "MCB_RESPONSE" ? "bg-[#F3EEE4]" : ""}`}>
              <p className={eyebrow}>{THREAD_LABELS[m.kind]}{m.author ? ` · ${m.author}` : ""} · {ago(m.created_at)}{m.template_key ? ` · template ${humanise(m.template_key)}` : ""}{m.email_outcome ? ` · email ${humanise(m.email_outcome)}` : ""}</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-base text-ink">{m.body}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-ink/75">Internal notes and system lines are never shown to the customer.</p>
      </Panel>

      <Reply data={data} busy={busy} act={act} />

      <Panel id="details" title="Case details">
        <Details data={data} busy={busy} act={act} />
      </Panel>

      <Panel id="linked" title="Linked records">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className={card}>
            <p className={eyebrow}>Songs</p>
            {data.linked.creative.length === 0 ? <p>None.</p> : <ul className="m-0 list-none p-0">{data.linked.creative.map((j: Json) => <li key={j.job_id}>Song {j.song}: {humanise(j.status)}{j.finished ? " · finished" : ""}</li>)}</ul>}
          </div>
          <div className={card}>
            <p className={eyebrow}>Memory Music Videos</p>
            {data.linked.videos.length === 0 ? <p>None.</p> : <ul className="m-0 list-none p-0">{data.linked.videos.map((v: Json) => <li key={v.video_job_id}>Video {v.video_job_id}: {humanise(v.status)} · reworks {v.rework_count} · space {humanise(v.reservation ?? "none")}</li>)}</ul>}
          </div>
          <div className={card}>
            <p className={eyebrow}>Parcels</p>
            {data.linked.shipments.length === 0 ? <p>None.</p> : <ul className="m-0 list-none p-0">{data.linked.shipments.map((s: Json) => <li key={s.shipment_id}>Parcel {s.sequence}: {humanise(s.state)}{s.tracking_reference ? ` · ${s.carrier ?? ""} ${s.tracking_reference}` : ""}</li>)}</ul>}
          </div>
          <div className={card}>
            <p className={eyebrow}>Fulfilment exceptions</p>
            {data.linked.exceptions.length === 0 ? <p>None.</p> : <ul className="m-0 list-none p-0">{data.linked.exceptions.map((x: Json) => <li key={x.exception_id}>{humanise(x.type)} · {humanise(x.status)}{x.blocking ? " · blocking" : ""}{x.linked_to_this_case ? " · this case" : ""}</li>)}</ul>}
          </div>
        </div>
        {data.linked.other_cases.length > 0 && <p className="text-base">Other cases on this order: {data.linked.other_cases.map((o: Json) => `#${o.case_id} ${o.type} (${CASE_STATUS_LABELS[o.status]})`).join(", ")}</p>}
      </Panel>

      <Panel id="evidence" title="Evidence (optional, private)">
        {data.evidence.length === 0 ? <p className={card}>No evidence added. None is needed to help.</p> : (
          <ul className="m-0 list-none space-y-2 p-0">
            {data.evidence.map((e: Json) => (
              <li key={e.evidence_id} className={`${card} flex flex-wrap items-center justify-between gap-2`}>
                <span>{humanise(e.kind)}{e.reference ? ` · “${e.reference}”` : ""} · {ago(e.created_at)}</span>
                {e.has_file && (
                  <button type="button" className={secondary} onClick={async () => {
                    try {
                      const url = await fetchBlob(`/api/crm/fulfilment?evidence_id=${e.evidence_id}&staff=${encodeURIComponent(staff)}`);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `mcb-evidence-${e.evidence_id}`;
                      a.click();
                    } catch (err) {
                      onMessage((err as Error).message);
                    }
                  }}>Download (audited)</button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Remedies data={data} busy={busy} act={act} />
      <Refunds data={data} busy={busy} act={act} />
    </div>
  );
};

type Act = (action: string, extra?: Json, done?: string) => Promise<Json | null>;

const Reply = ({ data, busy, act }: { data: Json; busy: boolean; act: Act }) => {
  const ids = useId();
  const [template, setTemplate] = useState("");
  const [body, setBody] = useState("");
  const [next, setNext] = useState("WAITING_FOR_CUSTOMER");
  const [outcome, setOutcome] = useState("");
  const [cause, setCause] = useState("");
  const [email, setEmail] = useState(true);
  const [note, setNote] = useState("");
  const operational = !["QUESTION", "OTHER"].includes(data.case.kind);

  return (
    <Panel id="reply" title="Reply to the customer">
      <div className={`${card} space-y-4`}>
        <div>
          <label htmlFor={`${ids}-template`} className="block font-semibold">Start from a template (edit before sending)</label>
          <select id={`${ids}-template`} className={field} value={template} onChange={(e) => {
            setTemplate(e.target.value);
            const t = data.templates.find((x: Json) => x.key === e.target.value);
            if (t) setBody(t.body);
          }}>
            <option value="">Write my own</option>
            {data.templates.map((t: Json) => <option key={t.key} value={t.key}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-body`} className="block font-semibold">Message</label>
          <textarea id={`${ids}-body`} rows={8} className={field} value={body} onChange={(e) => setBody(e.target.value)} />
          <p className="mt-1 text-sm text-ink/75">The customer reads this on their private order page. The email only says MCB has replied.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block font-semibold">After sending
            <select className={field} value={next} onChange={(e) => setNext(e.target.value)}>
              <option value="WAITING_FOR_CUSTOMER">Waiting for the customer</option>
              <option value="RESOLUTION_IN_PROGRESS">We're putting it right</option>
              <option value="REVIEWING">Still reviewing</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
          <label className="flex min-h-12 items-center gap-3 font-semibold"><input type="checkbox" className="h-5 w-5" checked={email} onChange={(e) => setEmail(e.target.checked)} />Email the customer that MCB has replied</label>
        </div>
        {next === "RESOLVED" && <Resolution outcome={outcome} setOutcome={setOutcome} cause={cause} setCause={setCause} data={data} operational={operational} />}
        <button type="button" className={primary} disabled={busy || body.trim().length < 2 || (next === "RESOLVED" && (!outcome || (operational && !cause)))}
          onClick={async () => {
            const r = await act("RESPOND", { body, template_key: template || null, next_status: next, send_email: email, ...(next === "RESOLVED" ? { recovery_outcome: outcome, root_cause: cause || null } : {}) }, "Reply sent.");
            if (r) { setBody(""); setTemplate(""); }
          }}>Send reply</button>
      </div>
      <div className={`${card} space-y-3`}>
        <label htmlFor={`${ids}-note`} className="block font-semibold">Internal note (never shown to the customer)</label>
        <textarea id={`${ids}-note`} rows={3} className={field} value={note} onChange={(e) => setNote(e.target.value)} />
        <button type="button" className={secondary} disabled={busy || note.trim().length < 2} onClick={async () => { if (await act("ADD_INTERNAL_NOTE", { body: note }, "Note added.")) setNote(""); }}>Add note</button>
      </div>
    </Panel>
  );
};

const Resolution = ({ outcome, setOutcome, cause, setCause, data, operational }: { outcome: string; setOutcome: (v: string) => void; cause: string; setCause: (v: string) => void; data: Json; operational: boolean }) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
    <label className="block font-semibold">How it ended
      <select className={field} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
        <option value="">Choose</option>
        {data.policy.recovery_outcomes.map((o: string) => <option key={o} value={o}>{humanise(o)}</option>)}
      </select>
    </label>
    <label className="block font-semibold">Root cause{operational ? "" : " (optional)"} — not blame
      <select className={field} value={cause} onChange={(e) => setCause(e.target.value)}>
        <option value="">{operational ? "Choose" : "Not applicable"}</option>
        {data.policy.root_causes.map((o: string) => <option key={o} value={o}>{humanise(o)}</option>)}
      </select>
    </label>
  </div>
);

const Details = ({ data, busy, act }: { data: Json; busy: boolean; act: Act }) => {
  const c = data.case;
  const [classification, setClassification] = useState(c.classification === "UNCLASSIFIED" ? "" : c.classification);
  const [classNote, setClassNote] = useState("");
  const [summary, setSummary] = useState(c.customer_summary ?? "");
  const [assign, setAssign] = useState(c.assigned_staff ?? "");
  const [privacyNote, setPrivacyNote] = useState("");
  const [outcome, setOutcome] = useState("");
  const [cause, setCause] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const operational = !["QUESTION", "OTHER"].includes(c.kind);

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <div className={`${card} space-y-3`}>
        <p className={eyebrow}>Status and priority</p>
        <label className="block font-semibold">Status
          <select className={field} value={c.status} disabled={busy} onChange={(e) => act("SET_STATUS", { status: e.target.value }, "Status updated.")}>
            {data.policy.statuses.filter((s: string) => s !== "RESOLVED" || c.status === "RESOLVED").map((s: string) => <option key={s} value={s}>{CASE_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block font-semibold">Priority (internal)
          <select className={field} value={c.priority} disabled={busy} onChange={(e) => act("SET_PRIORITY", { priority: e.target.value }, "Priority updated.")}>
            {["NORMAL", "IMPORTANT", "URGENT"].map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </label>
        <label className="block font-semibold">How the customer seems (your observation)
          <select className={field} value={c.sentiment} disabled={busy} onChange={(e) => act("SET_SENTIMENT", { sentiment: e.target.value }, "Recorded.")}>
            {data.policy.sentiments.map((s: string) => <option key={s} value={s}>{humanise(s)}</option>)}
          </select>
        </label>
        <label className="block font-semibold">Assigned to
          <input className={field} value={assign} onChange={(e) => setAssign(e.target.value)} />
        </label>
        <button type="button" className={secondary} disabled={busy} onClick={() => act("ASSIGN", { assigned_staff: assign || null }, "Assigned.")}>Save assignment</button>
      </div>

      <div className={`${card} space-y-3`}>
        <p className={eyebrow}>Objective error or creative preference?</p>
        <p className="text-sm">{data.policy.classification_guidance.OBJECTIVE_MCB_ERROR}</p>
        <p className="text-sm">{data.policy.classification_guidance.SUBJECTIVE_CREATIVE_PREFERENCE}</p>
        <label className="block font-semibold">Classification
          <select className={field} value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="">Choose</option>
            <option value="OBJECTIVE_MCB_ERROR">Objective MCB error</option>
            <option value="SUBJECTIVE_CREATIVE_PREFERENCE">Subjective creative preference</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
          </select>
        </label>
        <label className="block font-semibold">What you checked
          <textarea rows={2} className={field} value={classNote} onChange={(e) => setClassNote(e.target.value)} />
        </label>
        <button type="button" className={secondary} disabled={busy || !classification || classNote.trim().length < 2} onClick={() => act("CLASSIFY", { classification, note: classNote }, "Classified. No creative work starts from a classification.")}>Save classification</button>
      </div>

      <div className={`${card} space-y-3`}>
        <p className={eyebrow}>Privacy</p>
        {c.privacy_review === "PRIVACY_REVIEW_REQUIRED" ? (
          <p className="font-semibold text-[#8A1F1F]">Another customer's details may be involved. Never tell this customer who. Record what was checked and done; this draws no legal conclusion.</p>
        ) : c.privacy_review === "PRIVACY_REVIEW_COMPLETED" ? (
          <p>Privacy review completed by {c.privacy_reviewed_by}.</p>
        ) : <p>No privacy review.</p>}
        <label className="block font-semibold">{c.privacy_review === "PRIVACY_REVIEW_REQUIRED" ? "What was checked and done" : "Why a privacy review is needed"}
          <textarea rows={2} className={field} value={privacyNote} onChange={(e) => setPrivacyNote(e.target.value)} />
        </label>
        <button type="button" className={secondary} disabled={busy || privacyNote.trim().length < 2}
          onClick={async () => { if (await act(c.privacy_review === "PRIVACY_REVIEW_REQUIRED" ? "COMPLETE_PRIVACY_REVIEW" : "FLAG_PRIVACY_REVIEW", { note: privacyNote }, "Privacy review updated.")) setPrivacyNote(""); }}>
          {c.privacy_review === "PRIVACY_REVIEW_REQUIRED" ? "Complete privacy review" : "Flag privacy review"}
        </button>
      </div>

      <div className={`${card} space-y-3`}>
        <p className={eyebrow}>For the customer's page</p>
        <label className="block font-semibold">Short summary the customer sees (optional)
          <input className={field} maxLength={300} value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>
        <button type="button" className={secondary} disabled={busy} onClick={() => act("SET_CUSTOMER_SUMMARY", { customer_summary: summary || null }, "Summary saved.")}>Save summary</button>
        <button type="button" className={secondary} disabled={busy} onClick={() => act("REISSUE_ORDER_LINK", {}, "A fresh private order link was issued.")}>Issue a fresh order link</button>
      </div>

      {!["RESOLVED", "CLOSED"].includes(c.status) ? (
        <div className={`${card} space-y-3 lg:col-span-2`}>
          <p className={eyebrow}>Resolve</p>
          <Resolution outcome={outcome} setOutcome={setOutcome} cause={cause} setCause={setCause} data={data} operational={operational} />
          <label className="block font-semibold">Resolution note (internal)
            <textarea rows={2} className={field} value={resolutionNote} onChange={(e) => setResolutionNote(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primary} disabled={busy || !outcome || (operational && !cause)} onClick={() => act("RESOLVE", { recovery_outcome: outcome, root_cause: cause || null, resolution_note: resolutionNote || null }, "Case resolved.")}>Resolve case</button>
            <button type="button" className={secondary} disabled={busy} onClick={() => act("CLOSE", {}, "Case closed.")}>Close without resolving</button>
          </div>
        </div>
      ) : (
        <div className={`${card} lg:col-span-2`}>
          <p className={eyebrow}>Outcome</p>
          <p>{humanise(c.recovery_outcome)}{c.root_cause ? ` · root cause ${humanise(c.root_cause)}` : ""}{c.resolution_note ? ` · ${c.resolution_note}` : ""}</p>
        </div>
      )}
    </div>
  );
};

/** Bella or Lewis, with their own code. The code is never stored. */
const FounderDecision = ({ label, busy, onDecide }: { label: string; busy: boolean; onDecide: (form: Json) => void }) => {
  const [founder, setFounder] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  return (
    <fieldset className="mt-3 space-y-3 rounded-xl border border-ink/15 p-3">
      <legend className="px-1 font-semibold">{label} — Bella or Lewis only</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block font-semibold">Founder
          <select className={field} value={founder} onChange={(e) => setFounder(e.target.value)}>
            <option value="">Choose</option><option value="BELLA">Bella</option><option value="LEWIS">Lewis</option>
          </select>
        </label>
        <label className="block font-semibold">Authorisation code<input type="password" autoComplete="off" className={field} value={code} onChange={(e) => setCode(e.target.value)} /></label>
      </div>
      <label className="block font-semibold">Decision note<textarea rows={2} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <label className="flex min-h-12 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />I confirm this decision</label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} disabled={busy || !founder || !code || !confirm || note.trim().length < 2} onClick={() => onDecide({ founder, founder_code: code, confirm: true, note, decision: "AUTHORISE" })}>Authorise</button>
        <button type="button" className={secondary} disabled={busy || !founder || !code || !confirm || note.trim().length < 2} onClick={() => onDecide({ founder, founder_code: code, confirm: true, note, decision: "DECLINE" })}>Decline</button>
      </div>
    </fieldset>
  );
};

const Remedies = ({ data, busy, act }: { data: Json; busy: boolean; act: Act }) => {
  const [type, setType] = useState("");
  const [costs, setCosts] = useState("");
  const [basis, setBasis] = useState("ORIGINAL_VIDEO_CAPACITY");
  const [note, setNote] = useState("");
  const [doneNote, setDoneNote] = useState<Record<number, string>>({});
  const choices = data.policy.remedies.filter((r: Json) => r.type !== "REFUND_REVIEW_REQUIRED");
  return (
    <Panel id="remedies" title="Remedies">
      <p className="text-base">Remedies are prepared here. Nothing is purchased, refunded or offered automatically; anything that costs MCB money needs Bella or Lewis.</p>
      {data.remedies.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0">
          {data.remedies.map((r: Json) => (
            <li key={r.remedy_id} className={card}>
              <p className="font-semibold">{humanise(r.type)} · {humanise(r.status)}</p>
              <p className="text-sm">Costs MCB: {humanise(r.costs_mcb)}{r.capacity_basis !== "NOT_APPLICABLE" ? ` · ${humanise(r.capacity_basis)} (no other customer's space is used; platform allowance pending verification)` : ""}{r.supplier_order_pack_id ? ` · uses supplier-order pack ${r.supplier_order_pack_id} (prepared, not purchased)` : ""}{r.authorised_by ? ` · ${humanise(r.status)} by ${humanise(r.authorised_by)}` : ""}</p>
              {r.note && <p className="text-sm">{r.note}</p>}
              {r.status === "FOUNDER_APPROVAL_REQUIRED" && r.type !== "REFUND_REVIEW_REQUIRED" && <FounderDecision label="Decide this remedy" busy={busy} onDecide={(form) => act("DECIDE_REMEDY", { remedy_id: r.remedy_id, ...form }, "Decision recorded.")} />}
              {["PROPOSED", "AUTHORISED", "IN_PROGRESS"].includes(r.status) && r.type !== "REFUND_REVIEW_REQUIRED" && (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {["PROPOSED", "AUTHORISED"].includes(r.status) && <button type="button" className={secondary} disabled={busy} onClick={() => act("START_REMEDY", { remedy_id: r.remedy_id }, "Remedy started.")}>Start</button>}
                  <label className="block min-w-0 flex-1 font-semibold">What was done<input className={field} value={doneNote[r.remedy_id] ?? ""} onChange={(e) => setDoneNote({ ...doneNote, [r.remedy_id]: e.target.value })} /></label>
                  <button type="button" className={secondary} disabled={busy || !(doneNote[r.remedy_id] ?? "").trim()} onClick={() => act("COMPLETE_REMEDY", { remedy_id: r.remedy_id, note: doneNote[r.remedy_id] }, "Remedy completed.")}>Complete</button>
                  <button type="button" className={secondary} disabled={busy} onClick={() => act("CANCEL_REMEDY", { remedy_id: r.remedy_id }, "Remedy cancelled.")}>Cancel</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className={`${card} space-y-3`}>
        <p className={eyebrow}>Propose a remedy</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block font-semibold">Remedy
            <select className={field} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">Choose</option>
              {choices.map((r: Json) => <option key={r.type} value={r.type}>{humanise(r.type)}{r.founder ? " (founder decision)" : ""}{r.objective_only ? " (objective error only)" : ""}</option>)}
            </select>
          </label>
          <label className="block font-semibold">Does it cost MCB money?
            <select className={field} value={costs} onChange={(e) => setCosts(e.target.value)}>
              <option value="">Use MCB's default</option><option value="YES">Yes</option><option value="NO">No (say why)</option><option value="UNKNOWN">Not known</option>
            </select>
          </label>
          {type === "VIDEO_REDELIVERY" && (
            <label className="block font-semibold">Which film
              <select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}>
                <option value="ORIGINAL_VIDEO_CAPACITY">The original film (re-send)</option>
                <option value="REWORK_ATTEMPT">A rework attempt (objective error)</option>
                <option value="REPLACEMENT_VIDEO">A replacement film (objective error)</option>
              </select>
            </label>
          )}
        </div>
        <label className="block font-semibold">Note<textarea rows={2} className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className={primary} disabled={busy || !type} onClick={async () => {
          const video = data.linked.videos[0]?.video_job_id;
          if (await act("PROPOSE_REMEDY", { type, ...(costs ? { costs_mcb: costs } : {}), note: note || null, ...(type === "VIDEO_REDELIVERY" ? { capacity_basis: basis, video_job_id: video } : {}) }, "Remedy proposed.")) { setType(""); setNote(""); }
        }}>Propose remedy</button>
      </div>
    </Panel>
  );
};

const Refunds = ({ data, busy, act }: { data: Json; busy: boolean; act: Act }) => {
  const [kind, setKind] = useState("PARTIAL");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState<Record<number, string>>({});
  const [date, setDate] = useState<Record<number, string>>({});
  const m = data.money;
  const open = data.refunds.some((r: Json) => ["REFUND_REVIEW_REQUIRED", "FOUNDER_DECISION_REQUIRED", "AUTHORISED"].includes(r.status));
  return (
    <Panel id="refunds" title="Refund review">
      <dl className={`${card} grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-base`}>
        <dt>Customer paid{m.test_payment ? " (TEST)" : ""}</dt><dd className="m-0 text-right">{money(m.gross_paid_minor, m.currency)}</dd>
        <dt>Refunds recorded</dt><dd className="m-0 text-right">{money(m.refunds_recorded_minor, m.currency)}</dd>
        <dt>Refunds under review</dt><dd className="m-0 text-right">{money(m.refunds_pending_minor, m.currency)}</dd>
        <dt className="font-semibold">Net paid</dt><dd className="m-0 text-right font-semibold">{money(m.net_paid_minor, m.currency)}</dd>
      </dl>
      <p className="text-base">MCB's system never makes a refund. Bella or Lewis decides; the refund is made in the payment provider's dashboard; then it is recorded here.</p>
      {data.refunds.map((r: Json) => (
        <div key={r.refund_id} className={card}>
          <p className="font-semibold">{humanise(r.refund_type)} refund of {money(r.amount_minor, r.currency)} · {humanise(r.status)}</p>
          <p className="text-sm">{r.reason} · requested by {r.requested_by}{r.founder ? ` · decided by ${humanise(r.founder)}` : ""}{r.external_reference ? ` · reference ${r.external_reference}` : ""}{r.refunded_on ? ` · refunded ${r.refunded_on}` : ""}</p>
          {r.status === "REFUND_REVIEW_REQUIRED" && <button type="button" className={`${secondary} mt-3`} disabled={busy} onClick={() => act("SUBMIT_REFUND_FOR_DECISION", { refund_id: r.refund_id }, "Sent to Bella or Lewis.")}>Send to Bella or Lewis</button>}
          {r.status === "FOUNDER_DECISION_REQUIRED" && <FounderDecision label="Decide this refund" busy={busy} onDecide={(form) => act("DECIDE_REFUND", { refund_id: r.refund_id, ...form }, "Refund decision recorded. Nothing has been refunded.")} />}
          {r.status === "AUTHORISED" && (
            <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
              <label className="block font-semibold">Refund reference (optional)<input className={field} value={reference[r.refund_id] ?? ""} onChange={(e) => setReference({ ...reference, [r.refund_id]: e.target.value })} /></label>
              <label className="block font-semibold">Date refunded<input type="date" className={field} value={date[r.refund_id] ?? ""} onChange={(e) => setDate({ ...date, [r.refund_id]: e.target.value })} /></label>
              <button type="button" className={primary} disabled={busy || !date[r.refund_id]} onClick={() => act("RECORD_REFUND", { refund_id: r.refund_id, external_reference: reference[r.refund_id] || null, refunded_on: date[r.refund_id] }, "Refund recorded.")}>Record refund made</button>
            </div>
          )}
        </div>
      ))}
      {!open && m.payment_status === "PAID" && m.net_paid_minor > 0 && (
        <div className={`${card} space-y-3`}>
          <p className={eyebrow}>Request a refund review</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block font-semibold">Type
              <select className={field} value={kind} onChange={(e) => setKind(e.target.value)}><option value="PARTIAL">Partial</option><option value="FULL">Full (everything still paid)</option></select>
            </label>
            {kind === "PARTIAL" && <label className="block font-semibold">Amount (£)<input inputMode="decimal" className={field} value={amount} onChange={(e) => setAmount(e.target.value)} /></label>}
          </div>
          <label className="block font-semibold">Reason<textarea rows={2} className={field} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button type="button" className={primary} disabled={busy || reason.trim().length < 2 || (kind === "PARTIAL" && poundsToMinor(amount) === null)}
            onClick={async () => { if (await act("REQUEST_REFUND_REVIEW", { refund_type: kind, ...(kind === "PARTIAL" ? { amount_minor: poundsToMinor(amount) } : {}), reason }, "Refund review requested. Nothing has been refunded.")) { setReason(""); setAmount(""); } }}>
            Request refund review
          </button>
        </div>
      )}
    </Panel>
  );
};

export default CaseView;
