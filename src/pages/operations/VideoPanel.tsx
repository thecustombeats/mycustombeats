import { useCallback, useEffect, useState } from "react";
import { VIDEO_QC_CRITERIA, VIDEO_QC_OPTIONAL } from "../../data/production/video";

/**
 * MCB Memory Music Video™ — manual production for staff.
 *
 * No platform is connected. A person opens the inputs here (the song's
 * Production Master as a read-only reference, the customer's photographs,
 * the memory and facts), makes the film on the chosen platform, and registers
 * the finished file. MCB's quality check follows; the customer is never asked
 * to approve anything. Every file opened here is audited.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const input =
  "mt-1 w-full min-h-11 rounded-lg border border-ink/25 bg-white px-3 py-2 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep";
const ghost =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-ink/40 px-4 py-2 text-base font-semibold text-ink hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep disabled:opacity-60";
const humanise = (v: unknown) => String(v ?? "—").replace(/[._]/g, " ").toLowerCase();

const VideoPanel = ({ orderId, reference, apiKey, staff }: { orderId: number; reference: string | null; apiKey: string; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [criteria, setCriteria] = useState<Record<string, string>>({});
  const auth = { Authorization: `Bearer ${apiKey}` };

  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/video?order_id=${orderId}&staff=${encodeURIComponent(staff)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.message ?? "The video workspace could not be loaded.");
    setData(body);
  }, [orderId, apiKey, staff]);
  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(load).catch((e) => { if (!cancelled) setMessage((e as Error).message); });
    return () => { cancelled = true; };
  }, [load]);

  const act = async (jobId: number, action: string, extra: Json = {}) => {
    setMessage(null);
    const r = await fetch("/api/crm/video", { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ action, order_id: orderId, video_job_id: jobId, staff, ...extra }) });
    const body = await r.json().catch(() => ({}));
    setMessage(r.ok ? `${humanise(action)}: now ${humanise(body.job?.status ?? body.job_status)}.` : body.message ?? "That could not be done.");
    await load();
  };

  const register = async (jobId: number, file: File | undefined) => {
    if (!file || !reference) return;
    const f = new FormData();
    f.append("action", "REGISTER_CANDIDATE");
    f.append("order_id", String(orderId));
    f.append("reference", reference);
    f.append("video_job_id", String(jobId));
    f.append("staff", staff);
    if (form[`ext${jobId}`]) f.append("external_reference", form[`ext${jobId}`]);
    f.append("video", file);
    setMessage("Uploading the video…");
    const r = await fetch("/api/crm/video", { method: "POST", headers: auth, body: f });
    const body = await r.json().catch(() => ({}));
    setMessage(r.ok ? `Video version ${body.version} registered; it now needs MCB's quality check.` : body.message ?? "The video could not be registered.");
    await load();
  };

  const download = async (kind: string, id: number) => {
    const r = await fetch(`/api/crm/video?download=${kind}&id=${id}&staff=${encodeURIComponent(staff)}`, { headers: auth });
    if (!r.ok) return setMessage("That file could not be opened.");
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcb-video-${kind}-${id}`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  if (!data) return <p>{message ?? "Loading…"}</p>;
  if (data.jobs.length === 0) return <p>No Memory Music Video on this order{data.entitlements.length ? ` (${humanise(data.entitlements[0].status)})` : ""}.</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm">{data.note} Capacity {data.capacity.period_key}: {data.capacity.capacity - data.capacity.remaining} of {data.capacity.capacity} used · {humanise(data.capacity.verification)}.</p>
      {message && <p role="status" className="rounded-xl bg-ivory p-3 text-base">{message}</p>}
      {data.jobs.map((j: Json) => {
        const i = j.inputs;
        const pending = j.candidates.find((c: Json) => c.qc_status === "PENDING");
        return (
          <article key={j.video_job_id} className="space-y-3 rounded-xl border border-ink/15 p-4">
            <p className="font-semibold">Song {j.song}: {i.song_title ?? "untitled"} · {humanise(j.status)}{j.waiting_on ? ` (waiting on ${humanise(j.waiting_on)})` : ""}</p>
            <p className="text-sm">Duration: {humanise(j.duration_status)}{j.duration_decision ? ` · decision ${humanise(j.duration_decision)}` : ""} · reworks {j.rework_count}</p>
            {i.audio_master ? (
              <p className="text-sm">
                Production Master v{i.audio_master.version} · {i.audio_master.duration_seconds} s · sha256 {String(i.audio_master.sha256).slice(0, 12)}… (read-only reference){" "}
                <button type="button" className={ghost} onClick={() => download("audio", i.audio_master.id)}>Download audio reference</button>
              </p>
            ) : <p className="text-sm">The song's Production Master is not ready yet.</p>}
            <p className="text-sm">Occasion: {i.memory.occasion ?? "—"} · About: {i.memory.about ?? "—"}</p>
            <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Memory and facts</summary><p className="whitespace-pre-wrap text-sm">{i.memory.story}</p><ul className="list-disc pl-5 text-sm">{i.facts.map((f: Json, n: number) => <li key={n}>{humanise(f.type)}: {String(f.value)}</li>)}</ul></details>
            <div className="flex flex-wrap gap-2">
              {i.photographs.map((p: Json, n: number) => <button key={p.media_id} type="button" className={ghost} onClick={() => download("media", p.media_id)}>Photo {n + 1}{p.width ? ` (${p.width}×${p.height})` : ""}</button>)}
              {i.photographs.length === 0 && <span className="text-sm">No video photographs from the customer yet.</span>}
            </div>
            <label className="block text-sm font-semibold">Visual direction (internal)
              <textarea rows={2} className={input} value={form[`dir${j.video_job_id}`] ?? j.visual_direction ?? ""} onChange={(e) => setForm({ ...form, [`dir${j.video_job_id}`]: e.target.value })} />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={ghost} onClick={() => act(j.video_job_id, "SET_VISUAL_DIRECTION", { visual_direction: form[`dir${j.video_job_id}`] ?? j.visual_direction ?? "" })}>Save direction</button>
              {j.status === "INPUT_REQUIRED" && <button type="button" className={ghost} onClick={() => act(j.video_job_id, "CONFIRM_INPUTS")}>Confirm we have what we need</button>}
              {j.status === "READY" && j.duration_status === "VIDEO_DURATION_PROVIDER_VERIFICATION_REQUIRED" && (
                <>
                  <p className="w-full text-sm">This song is longer than the 4-minute planning maximum, which is not yet verified with the platform. Do not promise a film for the full song; the song is never shortened.</p>
                  <button type="button" className={ghost} onClick={() => act(j.video_job_id, "DURATION_REVIEW", { decision: "ESCALATE_TO_FOUNDERS" })}>Escalate to the Founders</button>
                </>
              )}
              {["PRODUCTION_REQUIRED", "REWORK_REQUIRED"].includes(j.status) && <button type="button" className={ghost} onClick={() => act(j.video_job_id, "START_PRODUCTION")}>Start production (manual)</button>}
              {j.status === "READY_FOR_REVEAL" && <button type="button" className={ghost} onClick={() => act(j.video_job_id, "REVEAL_VIDEO", { send_email: true })}>Reveal to the customer</button>}
            </div>
            {j.status === "PRODUCTION_IN_PROGRESS" && (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-sm font-semibold">Platform reference (optional)<input className={input} value={form[`ext${j.video_job_id}`] ?? ""} onChange={(e) => setForm({ ...form, [`ext${j.video_job_id}`]: e.target.value })} /></label>
                <label className="block text-sm font-semibold">Finished video (MP4 or MOV)<input type="file" accept="video/mp4,video/quicktime" className={input} onChange={(e) => register(j.video_job_id, e.target.files?.[0])} /></label>
              </div>
            )}
            {pending && j.status === "QUALITY_CHECK_REQUIRED" && (
              <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); const outcome = (e.nativeEvent as SubmitEvent).submitter?.getAttribute("value") ?? ""; act(j.video_job_id, "VIDEO_QC", { candidate_id: pending.id, criteria, outcome }); }}>
                <p className="text-sm font-semibold">Quality check — version {pending.version} ({pending.duration_ms ? Math.round(pending.duration_ms / 1000) : "?"} s{pending.width ? `, ${pending.width}×${pending.height}` : ""}) · <button type="button" className="underline" onClick={() => download("candidate", pending.id)}>download</button></p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {VIDEO_QC_CRITERIA.map((c) => (
                    <label key={c} className="block text-sm">{humanise(c)}
                      <select className={input} value={criteria[c] ?? ""} onChange={(e) => setCriteria({ ...criteria, [c]: e.target.value })}>
                        <option value="">Choose…</option><option value="PASS">Pass</option><option value="CONCERN">Concern</option>
                        {(VIDEO_QC_OPTIONAL as readonly string[]).includes(c) && <option value="NOT_APPLICABLE">Not applicable</option>}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  {["PASS", "REWORK", "ESCALATE"].map((o) => <button key={o} type="submit" value={o} className={ghost}>{o === "PASS" ? "Pass" : o === "REWORK" ? "Send back for internal rework" : "Escalate"}</button>)}
                </div>
              </form>
            )}
            {["INPUT_REQUIRED", "READY", "PRODUCTION_REQUIRED"].includes(j.status) && (
              <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Cancel before production (release the space)</summary>
                <label className="block text-sm">Why (no refund is made here)<input className={input} value={form[`rel${j.video_job_id}`] ?? ""} onChange={(e) => setForm({ ...form, [`rel${j.video_job_id}`]: e.target.value })} /></label>
                <button type="button" className={`${ghost} mt-2`} disabled={!form[`rel${j.video_job_id}`]} onClick={() => act(j.video_job_id, "RELEASE_CAPACITY", { note: form[`rel${j.video_job_id}`] })}>Release the space</button>
              </details>
            )}
            {j.masters.length > 0 && <p className="text-sm">Video Masters: {j.masters.map((m: Json) => `v${m.version}${Number(m.is_current) === 1 ? " (current)" : ""}`).join(", ")}</p>}
          </article>
        );
      })}
    </div>
  );
};

export default VideoPanel;
