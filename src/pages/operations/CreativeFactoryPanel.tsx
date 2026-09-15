import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";

/**
 * The Creative Factory on the staff console — the minimum operational surface
 * (not a DAW). Private creative material, fetched with the CRM key and the
 * staff name (every read is audited server-side), rendered as text.
 *
 * Music platform: Mozart AI, founder selected, integration pending: songs wait for manual
 * generation, and staff can register a manually generated candidate.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const CRITERIA = ["emotional_impact", "lyric_quality", "vocal_quality", "musical_quality", "production_quality", "genre_fit", "story_fit", "memorability", "pronunciation", "premium_standard"];
const ALBUM_CRITERIA = ["narrative_progression", "musical_cohesion", "deliberate_variation"];
const DOC_ACTIONS: Record<string, { scope: "album" | "job"; key: string; source: (a: Json | undefined, j: Json | undefined) => unknown }> = {
  UPDATE_FACT_LEDGER: { scope: "album", key: "fact_ledger", source: (a) => a?.fact_ledger?.body },
  UPDATE_ALBUM_MAP: { scope: "album", key: "album_map", source: (a) => a?.album_map?.body },
  UPDATE_STORY_MAP: { scope: "job", key: "story_map", source: (_a, j) => j?.story_map?.body },
  SUBMIT_LYRICS: { scope: "job", key: "lyric_package", source: (_a, j) => j?.lyric_package?.body ?? { title: "", sections: [{ type: "VERSE", text: "", fact_refs: [] }] } },
  UPDATE_MUSIC_DIRECTION: { scope: "job", key: "music_direction", source: (_a, j) => j?.music_direction?.body },
  SUBMIT_PLAN: { scope: "job", key: "composition_plan", source: (_a, j) => j?.composition_plan?.body },
};

const humanise = (v: unknown) => String(v ?? "—").replace(/[._]/g, " ").toLowerCase();
const box = "rounded-xl border border-ink/15 p-3";
const btn = "inline-flex min-h-11 items-center rounded-full border border-ink/40 px-4 py-2 font-semibold text-ink hover:bg-ink/5 disabled:opacity-60";
const field = "mt-1 w-full rounded-lg border border-ink/25 bg-white px-3 py-2 text-base";

const Doc = ({ label, doc }: { label: string; doc: Json | null | undefined }) => (
  <details className="mt-1">
    <summary className="cursor-pointer">{label}{doc ? ` · v${doc.version ?? doc.body?.version ?? "?"}` : " · none yet"}</summary>
    {doc && <pre tabIndex={0} aria-label={label} className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-ivory p-2 text-xs">{JSON.stringify(doc.body ?? doc, null, 2)}</pre>}
  </details>
);

const CreativeFactoryPanel = ({ orderId, reference, apiKey, staff }: { orderId: number; reference: string | null; apiKey: string; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [docAction, setDocAction] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [docText, setDocText] = useState("");
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [transcripts, setTranscripts] = useState<Record<number, string>>({});
  const [scores, setScores] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/creative?order_id=${orderId}&staff=${encodeURIComponent(staff)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload.message ?? `Request failed (${r.status}).`);
    setData(payload);
  }, [orderId, apiKey, staff]);

  useEffect(() => {
    load().catch((e) => setMessage((e as Error).message));
  }, [load]);

  const post = async (body: Json) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch("/api/crm/creative", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId, staff, ...body }) });
      const payload = await r.json().catch(() => ({}));
      setMessage(r.ok ? `Done: ${JSON.stringify(payload).slice(0, 600)}` : `${payload.message ?? r.status}${payload.problems ? ` ${JSON.stringify(payload.problems)}` : ""}`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (job: Json) => {
    const file = files[job.job_id];
    if (!file) return;
    const form = new FormData();
    form.append("action", "REGISTER_CANDIDATE");
    form.append("order_id", String(orderId));
    form.append("reference", reference ?? "");
    form.append("job_id", String(job.job_id));
    form.append("staff", staff);
    if (transcripts[job.job_id]) form.append("transcript", transcripts[job.job_id]);
    form.append("audio", file);
    setBusy(true);
    try {
      const r = await fetch("/api/crm/creative-file", { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
      const payload = await r.json().catch(() => ({}));
      setMessage(r.ok ? `Candidate: ${payload.outcome}` : payload.message ?? `Request failed (${r.status}).`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openDoc = (action: string, id: number, album?: Json, job?: Json) => {
    setDocAction(action);
    setTarget(id);
    setDocText(JSON.stringify(DOC_ACTIONS[action].source(album, job) ?? {}, null, 2));
  };

  const submitDoc = (event: FormEvent) => {
    event.preventDefault();
    const spec = DOC_ACTIONS[docAction];
    if (!spec || target === null) return;
    try {
      const doc = JSON.parse(docText);
      void post({ action: docAction, [spec.scope === "album" ? "album_id" : "job_id"]: target, [spec.key]: doc });
    } catch {
      setMessage("That is not valid JSON.");
    }
  };

  if (!data) return <p>{message ?? "Loading the Creative Factory…"}</p>;

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-ivory p-3">
        Music-generation provider: <strong>{data.provider.decision}</strong> — {humanise(data.provider.route)}; manual generation available. No provider is called.
        {" "}Target {data.duration_policy.target_seconds} s, ceiling {data.duration_policy.max_seconds} s. Enforcement: {data.enforcement}.
        {data.gate?.reasons?.length ? ` Not yet complete: ${data.gate.reasons.map(humanise).join(", ")}.` : " Creative gates complete."}
      </p>
      {message && <pre role="status" className="whitespace-pre-wrap break-all rounded bg-white p-2 text-sm">{message}</pre>}

      {data.albums.map((album: Json) => (
        <div key={album.album_id} className={box}>
          <p className="font-semibold text-ink">Album {album.album_id} · {album.sku} · {album.track_count} track(s) · target programme {album.target_programme_seconds} s</p>
          <Doc label="Fact Ledger" doc={album.fact_ledger} />
          {album.track_count > 1 && <Doc label="Album map" doc={album.album_map} />}
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn} onClick={() => openDoc("UPDATE_FACT_LEDGER", album.album_id, album)}>Revise Fact Ledger (advanced JSON)</button>
            {album.track_count > 1 && <button className={btn} onClick={() => openDoc("UPDATE_ALBUM_MAP", album.album_id, album)}>Revise album map (advanced JSON)</button>}
          </div>
          <p className="mt-2">Album QC: {humanise(album.album_qc.status)} · Capacity: {humanise(album.capacity.status)} (profile {humanise(album.capacity.profile?.status)})</p>
          {album.capacity.result && <Doc label="Programme / side allocation" doc={{ body: album.capacity.result }} />}
          {album.album_qc.result && <Doc label="Album QC result" doc={{ body: album.album_qc.result }} />}
          {album.album_qc.status === "REVIEW_REQUIRED" && (
            <fieldset className="mt-2">
              <legend className="font-semibold">Album review</legend>
              {ALBUM_CRITERIA.map((c) => (
                <label key={c} className="mr-3 inline-flex items-center gap-1">{humanise(c)}
                  <select value={scores[`a${album.album_id}${c}`] ?? ""} onChange={(e) => setScores({ ...scores, [`a${album.album_id}${c}`]: e.target.value })} className="rounded border px-1"><option value="">—</option><option>PASS</option><option>CONCERN</option></select>
                </label>
              ))}
              {["PASS", "FAIL"].map((o) => <button key={o} className={`${btn} ml-2`} disabled={busy} onClick={() => post({ action: "ALBUM_QC_REVIEW", album_id: album.album_id, outcome: o, criteria: Object.fromEntries(ALBUM_CRITERIA.map((c) => [c, scores[`a${album.album_id}${c}`]])) })}>{o}</button>)}
            </fieldset>
          )}
          {album.capacity.status !== "NOT_APPLICABLE" && <button className={`${btn} mt-2`} disabled={busy} onClick={() => post({ action: "RUN_CAPACITY_CHECK", album_id: album.album_id })}>Run capacity check</button>}
        </div>
      ))}

      {data.jobs.map((job: Json) => (
        <div key={job.job_id} className={box}>
          <p className="font-semibold text-ink">Track {job.track_number} · {humanise(job.status)}{job.waiting_on ? ` · waiting on ${humanise(job.waiting_on)}` : ""}{job.exception_reason ? ` · ${humanise(job.exception_reason)}` : ""} · attempts {job.attempt_allowance.used}/{job.attempt_allowance.allowed}</p>
          <Doc label="Story map" doc={job.story_map} />
          <Doc label="Lyric package" doc={job.lyric_package} />
          {job.lyric_qc.result && <Doc label={`Lyric fact QC · ${job.lyric_qc.status}`} doc={{ body: job.lyric_qc.result }} />}
          <Doc label="Music Direction" doc={job.music_direction} />
          <Doc label="MCB composition plan" doc={job.composition_plan} />
          <div className="mt-2 flex flex-wrap gap-2">
            {["UPDATE_STORY_MAP", "SUBMIT_LYRICS", "UPDATE_MUSIC_DIRECTION", "SUBMIT_PLAN"].map((a) => <button key={a} className={btn} onClick={() => openDoc(a, job.job_id, undefined, job)}>{humanise(a)} (advanced JSON)</button>)}
            {job.status === "LYRICS_REVIEW_REQUIRED" && ["PASS", "FAIL"].map((o) => <button key={o} className={btn} disabled={busy} onClick={() => post({ action: "LYRICS_REVIEW", job_id: job.job_id, outcome: o })}>Lyric review {o}</button>)}
            {job.status === "EXCEPTION" && <button className={btn} disabled={busy} onClick={() => { const note = window.prompt("Why one more attempt?"); if (note) void post({ action: "RESOLVE_EXCEPTION", job_id: job.job_id, resolution: "AUTHORISE_ONE_MORE_ATTEMPT", note }); }}>Authorise one more attempt</button>}
          </div>
          {job.status === "GENERATION_REQUIRED" && (
            <div className="mt-2">
              <label className="block text-sm font-semibold">Manually generated candidate (WAV, FLAC or AIFF)
                <input type="file" accept=".wav,.flac,.aif,.aiff,audio/*" onChange={(e) => setFiles({ ...files, [job.job_id]: e.target.files?.[0] ?? null })} className="mt-1 block" />
              </label>
              <label className="block text-sm font-semibold">What was sung (optional, checked against the Fact Ledger)
                <textarea rows={3} value={transcripts[job.job_id] ?? ""} onChange={(e) => setTranscripts({ ...transcripts, [job.job_id]: e.target.value })} className={field} />
              </label>
              <button className={`${btn} mt-1`} disabled={busy || !files[job.job_id]} onClick={() => upload(job)}>Register candidate</button>
            </div>
          )}
          {job.attempts.length > 0 && (
            <div className="mt-2 overflow-x-auto" tabIndex={0} aria-label={`Track ${job.track_number} generation attempts`}>
              <table className="w-full text-sm">
                <thead><tr className="text-left"><th>#</th><th>Provider</th><th>Outcome</th><th>Duration</th><th>Technical</th><th>Fact</th><th>Creative</th><th /></tr></thead>
                <tbody>
                  {job.attempts.map((at: Json) => {
                    const c = at.candidate;
                    return (
                      <tr key={at.id} className="align-top">
                        <td>{at.attempt_number}</td><td>{at.provider_id}</td><td>{humanise(at.status)}{at.failure_reason ? ` (${humanise(at.failure_reason)})` : ""}</td>
                        <td>{at.actual_duration_ms ? `${Math.round(at.actual_duration_ms / 1000)} s` : "—"}</td>
                        <td>{c?.technical_status ?? "—"}</td><td>{c?.fact_status ?? "—"}</td><td>{c?.creative_status ?? "—"}</td>
                        <td>
                          {c && job.status === "FACT_REVIEW_REQUIRED" && c.fact_status === "REVIEW_REQUIRED" && ["PASS", "FAIL"].map((o) => <button key={o} className={btn} disabled={busy} onClick={() => post({ action: "FACT_REVIEW", candidate_id: Number(c.id), outcome: o })}>Fact {o}</button>)}
                          {c && job.status === "CREATIVE_QC_REQUIRED" && c.fact_status === "PASS" && c.creative_status === "PENDING" && (
                            <fieldset>
                              {CRITERIA.map((k) => (
                                <label key={k} className="mr-2 inline-flex items-center gap-1">{humanise(k)}
                                  <select value={scores[`c${c.id}${k}`] ?? ""} onChange={(e) => setScores({ ...scores, [`c${c.id}${k}`]: e.target.value })} className="rounded border px-1"><option value="">—</option><option>PASS</option><option>CONCERN</option></select>
                                </label>
                              ))}
                              {["PASS", "REGENERATE", "ESCALATE"].map((o) => <button key={o} className={btn} disabled={busy} onClick={() => post({ action: "CREATIVE_QC", candidate_id: Number(c.id), outcome: o, criteria: Object.fromEntries(CRITERIA.map((k) => [k, scores[`c${c.id}${k}`]])) })}>{o}</button>)}
                            </fieldset>
                          )}
                          {c && job.status === "MASTER_REQUIRED" && c.creative_status === "PASS" && <button className={btn} disabled={busy} onClick={() => post({ action: "PROMOTE_MASTER", candidate_id: Number(c.id) })}>Make master</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {job.masters.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {job.masters.map((m: Json) => <li key={m.id}>{humanise(m.kind)} v{m.version}{Number(m.is_current) ? " (current)" : ""} · {m.container} · {m.duration_ms ? `${Math.round(m.duration_ms / 1000)} s` : "—"} · sha256 {String(m.sha256).slice(0, 12)}…{m.derived_from_master_id ? ` · from master ${m.derived_from_master_id}` : ""}</li>)}
            </ul>
          )}
        </div>
      ))}

      {docAction && (
        <form onSubmit={submitDoc} className={box}>
          <p className="font-semibold">ENGINEERING / ADVANCED — {humanise(docAction)} ({DOC_ACTIONS[docAction].scope} {target}) as raw JSON; a new version, earlier versions kept</p>
          <p className="text-sm text-espresso/75">Not the normal founder workflow: structured forms cover the everyday steps.</p>
          <label className="sr-only" htmlFor="creative-doc">Document JSON</label>
          <textarea id="creative-doc" rows={14} value={docText} onChange={(e) => setDocText(e.target.value)} className={`${field} font-mono text-xs`} />
          <div className="mt-2 flex gap-2">
            <button className={btn} disabled={busy}>Save version</button>
            <button type="button" className={btn} onClick={() => setDocAction("")}>Close</button>
          </div>
        </form>
      )}
    </div>
  );
};

export default CreativeFactoryPanel;
