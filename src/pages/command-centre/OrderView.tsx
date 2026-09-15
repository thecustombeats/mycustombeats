import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { FINANCIAL_AUTHORISERS } from "../../data/operations";
import { FOUNDER_ONLY_RESOLUTIONS } from "../../data/production/fulfilment";
import { ago, commandLink, humanise, money, type Json, type OpenMode } from "../../lib/commandCentre";
import { DecisionDetails } from "../operations/FulfilmentPanel";
import QualityReview from "./QualityReview";
import { card, eyebrow, field, primary, secondary } from "./styles";

/**
 * The order command card. Opening it — from a link, a card or search — reads
 * the order and changes nothing. Consequential actions are separate, explicit
 * forms: a financial decision needs Bella's or Lewis's own code.
 */

interface Props {
  orderId: number;
  open: OpenMode | null;
  api: (path: string, body?: Json) => Promise<Json>;
  fetchBlob: (path: string, type?: string) => Promise<string>;
  staff: string;
}

const Section = ({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) => (
  <details className={card} open={defaultOpen}>
    <summary className="min-h-11 cursor-pointer py-2 font-serif text-xl text-ink">{title}</summary>
    <div className="mt-3 space-y-2 text-base text-ink">{children}</div>
  </details>
);

const FounderFields = ({ values, set }: { values: Record<string, string | boolean>; set: (v: Record<string, string | boolean>) => void }) => (
  <>
    <label className="block text-base font-semibold text-ink">Founder deciding
      <select className={field} value={String(values.founder ?? "")} onChange={(e) => set({ ...values, founder: e.target.value })}>
        <option value="">Choose…</option>
        {FINANCIAL_AUTHORISERS.map((f) => <option key={f} value={f}>{humanise(f)}</option>)}
      </select>
    </label>
    <label className="block text-base font-semibold text-ink">Your founder authorisation code (never share it or send it in a message)
      <input type="password" autoComplete="off" className={field} value={String(values.founder_code ?? "")} onChange={(e) => set({ ...values, founder_code: e.target.value })} />
    </label>
  </>
);

const Check = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
  <label className="flex min-h-12 cursor-pointer items-start gap-3 text-base text-ink">
    <input type="checkbox" className="mt-1 h-6 w-6 accent-[#C9A14A]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span>{label}</span>
  </label>
);

const OrderView = ({ orderId, open, api, fetchBlob, staff }: Props) => {
  const [data, setData] = useState<Json | null>(null);
  const [advanced, setAdvanced] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/crm/command-centre?view=order&order_id=${orderId}&staff=${encodeURIComponent(staff)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [api, orderId, staff]);
  useEffect(() => { load(); }, [load]);

  if (error && !data) return <p role="alert" className="font-semibold text-[#8A1F1F]">{error}</p>;
  if (!data) return <p role="status">Loading the order…</p>;
  const s = data.summary;
  const decision = data.decision;
  const openExceptions = (data.fulfilment?.exceptions ?? []).filter((x: Json) => x.status === "OPEN");
  const decisionExceptions = openExceptions.filter((x: Json) => ["COMMERCIAL_SAFETY_EXCEPTION", "SUBSTITUTION_APPROVAL_REQUIRED", "PAID_ORDER_FULFILMENT_EXCEPTION", "PARCEL_LOST", "PARTIAL_DELIVERY", "SUPPLIER_CANCELLED"].includes(x.type));
  const canAuthorise = data.available_actions.includes("AUTHORISE_SUPPLIER_PURCHASE");
  const needsDestinationAck = decision && decision.destination_status !== "DESTINATION_SUPPORTED";
  const needsCommercialAck = decision && (decision.economics?.status !== "CALCULATED" || (decision.would_block_if_required ?? []).includes("COMMERCIAL_SAFETY_EXCEPTION_UNRESOLVED"));

  const submit = async (event: FormEvent, body: Json, done: string) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api("/api/crm/order-action", { order_id: orderId, staff, ...body });
      setMessage(`${done} Now: ${humanise(result.state)}.`);
      setForm({});
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <header className={`${card} border-2 border-ink`}>
        <p className={eyebrow}>Order</p>
        <h2 className="font-serif text-3xl text-ink">{s.reference}</h2>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {[
            ["Customer", s.customer],
            ["Product", s.product],
            ["Paid", `${money(s.paid_minor, s.currency)}${s.test_payment ? " (TEST payment)" : ""}`],
            ["Current stage", s.stage_label],
            ["Next step", s.next_step ?? "Nothing needed"],
            ["In this stage", ago(s.stage_since)],
            ["Expected contribution", money(s.expected_contribution_minor, s.currency)],
            ["Delivery", s.delivery ? (s.delivery.required === 0 ? "No parcels yet" : `${s.delivery.delivered} of ${s.delivery.required} parcels delivered`) : "Not applicable"],
            ["Problems", s.problems ? "Yes — see below" : "No"],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="text-sm font-semibold text-ink/70">{k}</dt><dd className="m-0 break-words text-base text-ink">{v}</dd></div>
          ))}
        </dl>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <a className={secondary} href={commandLink({ view: "orders", order: s.reference, open: "quality" })}>Quality check</a>
          {canAuthorise && <a className={primary} href={commandLink({ view: "orders", order: s.reference, open: "approve" })}>Review &amp; authorise</a>}
          {decisionExceptions.length > 0 && <a className={primary} href={commandLink({ view: "orders", order: s.reference, open: "decide" })}>Review &amp; decide</a>}
          <a className={secondary} href={`/operations#order=${s.reference}`}>Open in staff console</a>
        </div>
      </header>

      {message && <p role="status" className={`${card} font-semibold text-ink`}>{message}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#FBEAEA] px-3 py-2 font-semibold text-[#8A1F1F]">{error}</p>}

      {open === "quality" && (
        <section aria-labelledby="qc-heading" className="space-y-3">
          <h2 id="qc-heading" className="font-serif text-2xl text-ink">Quality check</h2>
          <QualityReview orderId={orderId} reference={s.reference} api={api} fetchBlob={fetchBlob} staff={staff} onDone={(m) => { setMessage(m); load(); }} />
        </section>
      )}

      {open === "approve" && (
        <section aria-labelledby="approve-heading" className={`${card} space-y-3 border-2 border-gold`}>
          <h2 id="approve-heading" className="font-serif text-2xl text-ink">Supplier purchase approval</h2>
          {!canAuthorise ? (
            <p>{s.stage === "READY_FOR_FULFILMENT" || s.stage === "BEING_MADE" ? "This order does not need a purchase approval now." : "This order is not ready for a purchase approval."}{data.fulfilment?.workspace ? ` Authorised by ${humanise(data.fulfilment.workspace.authorised_by)} at ${data.fulfilment.workspace.authorised_at} UTC.` : ""}</p>
          ) : (
            <>
              {decision && <DecisionDetails decision={decision} />}
              <p className="text-base">Only Bella or Lewis can authorise, with their own code. Opening this page has authorised nothing, and nothing is purchased automatically: a person places the order by hand afterwards.</p>
              <form className="space-y-3" onSubmit={(e) => submit(e, {
                action: "AUTHORISE_SUPPLIER_PURCHASE", founder: form.founder, founder_code: form.founder_code, confirm: form.confirm === true,
                ...(needsDestinationAck ? { destination_acknowledged: form.destination === true } : {}),
                ...(needsCommercialAck ? { commercial_acknowledged: form.commercial === true } : {}),
              }, "Supplier purchase authorised.")}>
                <FounderFields values={form} set={setForm} />
                {needsDestinationAck && <Check label="The destination is not verified: it will be checked at the partner checkout before ordering." checked={form.destination === true} onChange={(v) => setForm({ ...form, destination: v })} />}
                {needsCommercialAck && <Check label="I have reviewed the expected costs and contribution (the customer's paid price is honoured)." checked={form.commercial === true} onChange={(v) => setForm({ ...form, commercial: v })} />}
                <Check label="I authorise MCB to purchase this order from the production partner." checked={form.confirm === true} onChange={(v) => setForm({ ...form, confirm: v })} />
                <button className={primary} disabled={busy || !form.founder || !form.founder_code || form.confirm !== true}>{busy ? "Authorising…" : "Authorise supplier purchase"}</button>
              </form>
            </>
          )}
        </section>
      )}

      {open === "decide" && (
        <section aria-labelledby="decide-heading" className="space-y-3">
          <h2 id="decide-heading" className="font-serif text-2xl text-ink">Founder decisions</h2>
          {decisionExceptions.length === 0 && <p className={card}>No founder decision is waiting on this order.</p>}
          {decisionExceptions.map((x: Json) => (
            <form key={x.id} className={`${card} space-y-3 border-2 border-gold`} onSubmit={(e) => submit(e, {
              action: "RESOLVE_FULFILMENT_EXCEPTION", exception_id: x.id, resolution: form[`r${x.id}`], note: form[`n${x.id}`],
              ...((FOUNDER_ONLY_RESOLUTIONS as readonly string[]).includes(String(form[`r${x.id}`])) ? { founder: form.founder, founder_code: form.founder_code, confirm: form.confirm === true } : {}),
            }, "Decision recorded.")}>
              <h3 className="font-serif text-xl text-ink">{humanise(x.type)}</h3>
              {x.detail && <p>{x.detail}</p>}
              {x.next_action && <p className="text-ink/80">{x.next_action}</p>}
              <label className="block font-semibold">Decision
                <select className={field} value={String(form[`r${x.id}`] ?? "")} onChange={(e) => setForm({ ...form, [`r${x.id}`]: e.target.value })}>
                  <option value="">Choose…</option>
                  {["PROCEED_AT_PAID_PRICE", "SUBSTITUTION_APPROVED", "PARTIAL_DELIVERY_ACCEPTED", "REFUND_TO_BE_HANDLED_BY_FOUNDER", "REPLACEMENT_ARRANGED", "CUSTOMER_CONTACTED", "OTHER"].map((r) => <option key={r} value={r}>{humanise(r)}</option>)}
                </select>
              </label>
              <label className="block font-semibold">What was decided (internal)
                <input className={field} value={String(form[`n${x.id}`] ?? "")} onChange={(e) => setForm({ ...form, [`n${x.id}`]: e.target.value })} />
              </label>
              {(FOUNDER_ONLY_RESOLUTIONS as readonly string[]).includes(String(form[`r${x.id}`])) && (
                <>
                  <FounderFields values={form} set={setForm} />
                  <Check label="I make this decision for MCB. It records a decision only: no refund or payment is made by this page." checked={form.confirm === true} onChange={(v) => setForm({ ...form, confirm: v })} />
                </>
              )}
              <button className={primary} disabled={busy || !form[`r${x.id}`] || !form[`n${x.id}`]}>Record decision</button>
            </form>
          ))}
        </section>
      )}

      <Section title="Creative" defaultOpen={open === "card"}>
        {data.creative.length === 0 ? <p>No songs yet.</p> : (
          <ul className="m-0 list-none space-y-1 p-0">{data.creative.map((c: Json) => <li key={c.song}>Song {c.song}: {c.title ?? "untitled"} — {c.finished ? "finished" : c.status}</li>)}</ul>
        )}
      </Section>
      {data.artwork && (
        <Section title="Artwork">
          {data.artwork.length === 0 ? <p>No artwork yet.</p> : <ul className="m-0 list-none space-y-1 p-0">{data.artwork.map((a: Json) => <li key={a.version}>Version {a.version}: quality {humanise(a.quality)}{a.current ? " (current)" : ""}</li>)}</ul>}
        </Section>
      )}
      {data.production && (
        <Section title="Production">
          <p>Manufacturing package: {data.production.package ? `${humanise(data.production.package.status)} (version ${data.production.package.version})` : "not built yet"}</p>
          {data.production.package?.blockers?.length > 0 && <ul className="list-disc pl-5">{data.production.package.blockers.map((b: string) => <li key={b}>{humanise(b)}</li>)}</ul>}
        </Section>
      )}
      {data.fulfilment && (
        <Section title="Fulfilment">
          <p>{data.fulfilment.supplier_orders.length} supplier order(s) · {data.fulfilment.shipments.length} parcel(s) · {openExceptions.length} open problem(s)</p>
          <ul className="list-disc pl-5">
            {data.fulfilment.shipments.map((p: Json) => <li key={p.id}>Parcel {p.sequence}: {humanise(p.state)}{p.tracking_reference ? ` · ${p.tracking_reference}` : ""}</li>)}
            {openExceptions.map((x: Json) => <li key={`x${x.id}`}>Problem: {humanise(x.type)}{x.blocking ? " (holding delivery)" : ""}</li>)}
          </ul>
        </Section>
      )}
      <Section title="Customer">
        <p>{data.customer.name} · {data.customer.email}</p>
        <p>{data.customer.open_problems.length === 0 ? "No open customer problems." : `${data.customer.open_problems.length} open customer problem(s): ${data.customer.open_problems.map((p: Json) => `${humanise(p.kind)} (${ago(p.since)})`).join(", ")}`}</p>
        <p>Emails: {data.customer.emails.length === 0 ? "none yet" : data.customer.emails.map((m: Json) => `${humanise(m.message_type)} — ${humanise(m.status)}`).join("; ")}</p>
      </Section>
      <Section title="Financial">
        <p>Paid: {money(data.financial.paid_minor, data.financial.currency)}</p>
        {[data.financial.estimated, data.financial.actual].map((e: Json | null, i: number) => (
          <p key={i}><span className="font-semibold">{i === 0 ? "ESTIMATED" : "ACTUAL"}:</span> {e ? `fulfilment cost ${money(e.cost_minor, data.financial.currency)} · gross contribution ${money(e.contribution_minor, data.financial.currency)}` : "— Awaiting data"}</p>
        ))}
        <p className="text-sm text-ink/70">{data.financial.note}</p>
      </Section>
      <Section title="History">
        <ol className="m-0 list-none space-y-1 p-0 text-sm">{data.history.map((h: Json, i: number) => <li key={i}><span className="font-mono">{h.at}</span> · {h.what}</li>)}</ol>
      </Section>
      <details className={card} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && !advanced) api(`/api/crm/command-centre?view=advanced&order_id=${orderId}&staff=${encodeURIComponent(staff)}`).then(setAdvanced).catch((err) => setError((err as Error).message)); }}>
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-ink/80">Advanced / technical</summary>
        {advanced ? (
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label="Technical record">
            <pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(advanced, null, 2)}</pre>
          </div>
        ) : <p className="mt-2 text-sm">Loading…</p>}
      </details>
    </div>
  );
};

export default OrderView;
