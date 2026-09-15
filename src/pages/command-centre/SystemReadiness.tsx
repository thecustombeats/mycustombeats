import { useCallback, useEffect, useState } from "react";
import { AUTOMATION_STATUS_LABELS, SYSTEM_SECTIONS, commandLink, humanise, systemLink, type Json, type SystemSection } from "../../lib/commandCentre";
import { card, eyebrow, primary, secondary } from "./styles";
import { Panel } from "./ui";

type Api = (path: string, body?: Json) => Promise<Json>;

/**
 * SYSTEM READINESS — is MCB working, and is it ready?
 *
 * Failures needing attention, configuration (described, never shown),
 * what is really automated, and what Bella and Lewis still have to do. A retry
 * button appears only for work that is safe to repeat; nothing here spends,
 * refunds, purchases or cancels anything. Technical codes stay under Advanced.
 */
const SystemReadiness = ({ section, api, staff }: { section: SystemSection; api: Api; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api(`/api/crm/system?view=${section}&staff=${encodeURIComponent(staff)}`);
      setData(result.view === section ? result : null);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, [api, section, staff]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => { if (!cancelled) { setData(null); load(); } });
    return () => { cancelled = true; };
  }, [load]);

  const retry = async (action: string, id: number, label: string) => {
    try {
      const result = await api("/api/crm/system", { action, id, staff });
      setMessage(`${label}: ${humanise(result.outcome)}.`);
      load();
    } catch (e) {
      setMessage((e as Error).message);
    }
  };

  return (
    <>
      <div>
        <p className={eyebrow}>Is MCB working, and is it ready?</p>
        <h1 className="font-serif text-4xl text-ink">System readiness</h1>
        <p className="mt-1 text-base text-ink/80">Nothing on these pages spends, refunds, purchases or cancels anything.</p>
      </div>
      <nav aria-label="System sections" className="overflow-x-auto" tabIndex={-1}>
        <ul className="m-0 flex list-none gap-2 p-0 pb-1">
          {SYSTEM_SECTIONS.map(([s, label]) => (
            <li key={s} className="shrink-0">
              <a href={systemLink(s)} aria-current={s === section ? "page" : undefined} className={s === section ? primary : secondary}>{label}</a>
            </li>
          ))}
        </ul>
      </nav>
      {message && <p role="status" className={card}>{message} <button type="button" className="ml-2 min-h-12 underline" onClick={() => setMessage(null)}>Dismiss</button></p>}
      {/* A section only ever renders its own data: never the previous section's during a switch. */}
      {!data || data.view !== section ? <p role="status">Loading…</p> : (
        <>
          {section === "failures" && <Failures data={data} onRetry={retry} />}
          {section === "readiness" && <Readiness data={data} />}
          {section === "automation" && <Automation data={data} />}
          {section === "founder-actions" && <FounderActions data={data} />}
        </>
      )}
    </>
  );
};


const Failures = ({ data, onRetry }: { data: Json; onRetry: (action: string, id: number, label: string) => void }) => {
  const open = data.checks.filter((c: Json) => c.count > 0);
  const clear = data.checks.filter((c: Json) => c.count === 0);
  return (
    <>
      <p className={`${card} text-lg font-semibold`}>{data.label}</p>
      <Panel id="failures" title="Failures needing attention">
        {open.length === 0 ? <p className={card}>Nothing found by these checks.</p> : (
          <ul className="m-0 list-none space-y-3 p-0">
            {open.map((c: Json) => (
              <li key={c.key} className={`${card} border-l-4 ${c.category === "MONEY" || c.category === "CONFIGURATION" ? "border-l-[#9B2C2C]" : "border-l-gold"}`}>
                <p className={eyebrow}>{humanise(c.category)} · {c.count}</p>
                <p className="mt-1 text-lg font-semibold text-ink">{c.label}</p>
                <p className="text-base">{c.next_action}</p>
                <p className="text-sm text-ink/70">{data.retry_labels[c.retry] ?? humanise(c.retry)}</p>
                <ul className="mt-2 space-y-2">
                  {c.items.map((i: Json, n: number) => (
                    <li key={n} className="flex flex-wrap items-center gap-3 border-t border-ink/10 pt-2">
                      {i.reference && i.order_id ? <a className="inline-flex min-h-11 items-center font-semibold underline" href={commandLink({ view: "orders", order: i.reference, open: "card" })}>{i.reference}</a> : i.reference ? <span className="font-semibold">{i.reference}</span> : null}
                      {i.detail && <span className="text-sm">{humanise(i.detail)}</span>}
                      {i.since && <span className="text-sm text-ink/70">since {i.since} UTC</span>}
                      {c.recovery_action && (i.subject_id ?? i.order_id) && (
                        <button type="button" className={secondary} onClick={() => onRetry(c.recovery_action, i.subject_id ?? i.order_id, c.label)}>
                          Try again<span className="sr-only"> for {i.reference ?? c.label}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <details className={card}>
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">Checks with nothing found ({clear.length})</summary>
        <ul className="mt-2 list-disc pl-5">{clear.map((c: Json) => <li key={c.key}>{c.label}</li>)}</ul>
      </details>
      <p className="text-sm text-ink/80">{data.note}</p>
      <details className={card}>
        <summary className="min-h-12 cursor-pointer py-3 font-semibold">Advanced / technical</summary>
        <ul className="mt-2 list-disc pl-5 font-mono text-sm">{data.checks.map((c: Json) => <li key={c.key}>{c.key} · {c.work} · {c.retry}{c.recovery_action ? ` · ${c.recovery_action}` : ""}</li>)}</ul>
      </details>
    </>
  );
};

const CLASS_LABELS: Record<string, string> = {
  REQUIRED_FOR_LAUNCH: "Required for launch",
  OPTIONAL: "Optional",
  EXTERNAL_VERIFICATION: "Needs outside verification",
  DEFERRED: "Deliberately deferred",
};

const Readiness = ({ data }: { data: Json }) => (
  <>
    {Object.keys(CLASS_LABELS).map((cls) => (
      <Panel key={cls} id={`config-${cls}`} title={CLASS_LABELS[cls]}>
        <ul className="m-0 list-none space-y-2 p-0">
          {data.configuration.filter((c: Json) => c.class === cls).map((c: Json) => (
            <li key={c.key} className={`${card} flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between`}>
              <div className="min-w-0">
                <p className="font-semibold text-ink">{c.label}</p>
                <p className="text-sm text-ink/80">{c.detail}</p>
              </div>
              <span className={`inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-sm font-semibold ${c.status === "OK" ? "bg-[#E7F2EA] text-[#1E5631]" : "bg-[#FBEAEA] text-[#8A1F1F]"}`}>
                {c.status === "OK" ? "✓ In place" : `! ${humanise(c.status)}`}
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    ))}
    <Panel id="launch" title="Launch readiness">
      <ul className="m-0 list-none space-y-2 p-0">
        {data.launch.map((r: Json) => <li key={r.key} className={card}><p className="font-semibold">{r.label} · {humanise(r.status)}</p><p className="text-sm text-ink/80">{r.detail}</p></li>)}
      </ul>
    </Panel>
  </>
);

const Automation = ({ data }: { data: Json }) => (
  <Panel id="automation" title="Automation readiness">
    <p className="text-base">A workflow is only called automated when it runs by itself and is tested — never just because code exists.</p>
    <ul className="m-0 list-none space-y-3 p-0">
      {data.workflows.map((w: Json) => (
        <li key={w.workflow} className={card}>
          <p className="text-lg font-semibold text-ink">{w.workflow}</p>
          <p className="text-base font-semibold text-[#7A5E1F]">{AUTOMATION_STATUS_LABELS[w.status] ?? humanise(w.status)}</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-3 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="font-semibold">Starts when</dt><dd className="m-0">{w.trigger}</dd>
            <dt className="font-semibold">Runs by itself</dt><dd className="m-0">{w.automated}</dd>
            <dt className="font-semibold">People do</dt><dd className="m-0">{w.human}</dd>
            <dt className="font-semibold">Bella or Lewis</dt><dd className="m-0">{w.founder}</dd>
            <dt className="font-semibold">Outside connection</dt><dd className="m-0">{w.external}</dd>
            <dt className="font-semibold">If it fails</dt><dd className="m-0">{w.recovery}</dd>
          </dl>
          <details className="mt-2"><summary className="min-h-11 cursor-pointer py-2 text-sm">Advanced / technical</summary><p className="font-mono text-sm">{w.status} · tests: {w.tests}</p></details>
        </li>
      ))}
    </ul>
  </Panel>
);

const FounderActions = ({ data }: { data: Json }) => (
  <>
    {data.categories.map((c: Json) => (
      <Panel key={c.category} id={`fa-${c.category}`} title={c.label}>
        {c.items.length === 0 ? <p className={card}>Nothing here.</p> : (
          <ul className="m-0 list-none space-y-2 p-0">
            {c.items.map((i: Json, n: number) => (
              <li key={n} className={`${card} flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between`}>
                <div className="min-w-0"><p className="text-base text-ink">{i.text}</p>{i.where && <p className="text-sm text-ink/70">{i.where}</p>}</div>
                {i.count !== null && <span className="shrink-0 font-serif text-2xl text-ink">{i.count}</span>}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ))}
  </>
);

export default SystemReadiness;
