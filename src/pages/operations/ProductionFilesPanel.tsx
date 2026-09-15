import { useCallback, useEffect, useState } from "react";

/**
 * Production File Factory on the staff console: structured forms for the
 * everyday steps (no JSON editing). Creative Art Master → MCB visual QC →
 * print production masters per template version → manufacturing package →
 * staff-only supplier order pack. The artwork provider decision is DEFERRED:
 * art is designed by people and registered here. Nothing is purchased here.
 */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const box = "rounded-xl border border-ink/15 p-3";
const btn = "inline-flex min-h-11 items-center rounded-full border border-ink/40 px-4 py-2 font-semibold text-ink hover:bg-ink/5 disabled:opacity-60";
const field = "mt-1 w-full rounded-lg border border-ink/25 bg-white px-3 py-2 text-base";
const humanise = (v: unknown) => String(v ?? "—").replace(/[._:]/g, " ").toLowerCase();
const OPTIONAL = ["facial_visibility", "mcb_branding"];

const ProductionFilesPanel = ({ orderId, reference, apiKey, staff }: { orderId: number; reference: string | null; apiKey: string; staff: string }) => {
  const [data, setData] = useState<Json | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [text, setText] = useState<Record<string, string>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [scores, setScores] = useState<Record<string, string>>({});

  const headers = { Authorization: `Bearer ${apiKey}` };
  const load = useCallback(async () => {
    const r = await fetch(`/api/crm/production-files?order_id=${orderId}&staff=${encodeURIComponent(staff)}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(payload.message ?? `Request failed (${r.status}).`);
    setData(payload);
  }, [orderId, apiKey, staff]);

  useEffect(() => {
    load().catch((e) => setMessage((e as Error).message));
  }, [load]);

  const send = async (path: string, init: RequestInit, done: (p: Json) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await fetch(path, init);
      const payload = await r.json().catch(() => ({}));
      setMessage(r.ok ? done(payload) : `${payload.message ?? r.status}`);
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const post = (body: Json, done: (p: Json) => string = () => "Saved.") =>
    send("/api/crm/production-files", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ order_id: orderId, staff, ...body }) }, done);

  if (!data) return <p>{message ?? "Loading production files…"}</p>;

  const pkg = data.manufacturing_package;
  const pack = data.supplier_order_pack;

  return (
    <div className="space-y-4">
      <p className="rounded-lg bg-ivory p-3">
        Artwork provider: <strong>{data.artwork_provider_decision}</strong> — artwork is designed by people and registered here; nothing is generated.
        {" "}Manufacturing package: <strong>{pkg ? `${humanise(pkg.status)} (v${pkg.version})` : "not built"}</strong>.
      </p>
      {message && <p role="status" className="rounded bg-white p-2 text-sm">{message}</p>}
      {pkg?.blockers?.length > 0 && (
        <ul className="list-disc pl-5 text-sm">{pkg.blockers.map((b: string) => <li key={b}>{humanise(b)}</li>)}</ul>
      )}
      <button className={btn} disabled={busy} onClick={() => post({ action: "BUILD_MANUFACTURING_PACKAGE" }, (p) => `Package v${p.version}: ${humanise(p.status)}`)}>Build / refresh manufacturing package</button>

      {data.jobs.map((job: Json) => {
        const arts = data.art_masters.filter((a: Json) => Number(a.job_id) === Number(job.id));
        const current = arts.find((a: Json) => Number(a.is_current) === 1);
        const photos = data.image_preparation.filter((p: Json) => Number(p.unit_id) === Number(job.unit_id));
        const components = data.components.filter((c: Json) => Number(c.unit_id) === Number(job.unit_id));
        const k = `job${job.id}`;
        return (
          <div key={job.id} className={box}>
            <p className="font-semibold text-ink">Record artwork · {job.sku} · {humanise(job.status)}</p>
            <label className="mt-2 block text-sm font-semibold">Visual direction (internal)
              <textarea rows={2} className={field} value={text[`${k}dir`] ?? job.visual_direction ?? ""} onChange={(e) => setText({ ...text, [`${k}dir`]: e.target.value })} />
            </label>
            <button className={`${btn} mt-1`} disabled={busy} onClick={() => post({ action: "SET_VISUAL_DIRECTION", artwork_job_id: Number(job.id), visual_direction: text[`${k}dir`] ?? job.visual_direction ?? "" })}>Save direction</button>

            <fieldset className="mt-3">
              <legend className="font-semibold">Customer source photographs</legend>
              {photos.map((p: Json) => (
                <div key={p.id} className="mt-1 text-sm">
                  Photo {p.upload_id}: {humanise(p.status)}{p.preparation_notes ? ` — ${p.preparation_notes}` : ""}
                  {["PREPARATION_REQUIRED", "EXCEPTION"].includes(p.status) && <button className={`${btn} ml-2`} disabled={busy} onClick={() => post({ action: "IMAGE_PREPARATION", upload_id: Number(p.upload_id), status: "PREPARATION_IN_PROGRESS" })}>Start preparation</button>}
                  {p.status === "PREPARATION_IN_PROGRESS" && (
                    <span className="ml-2 inline-flex flex-wrap items-center gap-2">
                      <label className="sr-only" htmlFor={`prep${p.id}`}>What was done</label>
                      <input id={`prep${p.id}`} placeholder="What was done (crop, colour, retouch…)" className="rounded border px-2 py-1" value={text[`prep${p.id}`] ?? ""} onChange={(e) => setText({ ...text, [`prep${p.id}`]: e.target.value })} />
                      <label className="inline-flex items-center gap-1"><input type="checkbox" checked={ticks[`id${p.id}`] === true} onChange={(e) => setTicks({ ...ticks, [`id${p.id}`]: e.target.checked })} />People and content preserved</label>
                      <button className={btn} disabled={busy} onClick={() => post({ action: "IMAGE_PREPARATION", upload_id: Number(p.upload_id), status: "PREPARED", notes: text[`prep${p.id}`], identity_preserved: ticks[`id${p.id}`] === true })}>Mark prepared</button>
                    </span>
                  )}
                  {!["UNUSABLE", "PREPARED"].includes(p.status) && <button className={`${btn} ml-2`} disabled={busy} onClick={() => post({ action: "IMAGE_PREPARATION", upload_id: Number(p.upload_id), status: "UNUSABLE", notes: text[`prep${p.id}`] || "Not usable for print" })}>Unusable</button>}
                </div>
              ))}
            </fieldset>

            <div className="mt-3">
              <p className="font-semibold">Creative Art Master {current ? `v${current.version} · visual QC ${humanise(current.visual_qc_status)}` : "· none yet"}</p>
              <p className="text-sm text-espresso/75">Versions: {arts.map((a: Json) => `v${a.version} ${humanise(a.creation_method)} ${a.width}×${a.height} (${humanise(a.visual_qc_status)})`).join("; ") || "—"}</p>
              <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => {
                e.preventDefault();
                const file = files[k];
                if (!file) return;
                const form = new FormData();
                const sources = photos.filter((p: Json) => ticks[`src${p.upload_id}`]).map((p: Json) => p.upload_id).join(",");
                Object.entries({ action: "REGISTER_ART_MASTER", order_id: String(orderId), reference: reference ?? "", artwork_job_id: String(job.id), staff, creation_method: text[`${k}method`] ?? "MANUAL_DESIGN", source_upload_ids: sources }).forEach(([n, v]) => form.append(n, v));
                form.append("art", file);
                void send("/api/crm/production-files", { method: "POST", headers, body: form }, (p) => `Art master v${p.version} registered: visual QC required.`);
              }}>
                <label className="block text-sm font-semibold">Art master file
                  <input type="file" accept="image/png,image/jpeg,image/tiff" className="mt-1 block" onChange={(e) => setFiles({ ...files, [k]: e.target.files?.[0] ?? null })} />
                </label>
                <label className="block text-sm font-semibold">Made by
                  <select className={field} value={text[`${k}method`] ?? "MANUAL_DESIGN"} onChange={(e) => setText({ ...text, [`${k}method`]: e.target.value })}>
                    {data.creation_methods_available.map((m: string) => <option key={m} value={m}>{humanise(m)}</option>)}
                  </select>
                </label>
                <fieldset className="text-sm"><legend className="font-semibold">Uses photographs</legend>
                  {photos.filter((p: Json) => ["SOURCE_READY", "PREPARED"].includes(p.status)).map((p: Json) => (
                    <label key={p.upload_id} className="mr-2 inline-flex items-center gap-1"><input type="checkbox" checked={ticks[`src${p.upload_id}`] === true} onChange={(e) => setTicks({ ...ticks, [`src${p.upload_id}`]: e.target.checked })} />Photo {p.upload_id}</label>
                  ))}
                </fieldset>
                <button className={btn} disabled={busy || !files[k]}>Register art master</button>
              </form>
              {current?.visual_qc_status === "PENDING" && (
                <fieldset className="mt-3">
                  <legend className="font-semibold">MCB visual QC (internal MCB check)</legend>
                  {data.visual_qc_criteria.map((c: string) => (
                    <label key={c} className="mr-3 inline-flex items-center gap-1 text-sm">{humanise(c)}
                      <select className="rounded border px-1" value={scores[`${current.id}${c}`] ?? ""} onChange={(e) => setScores({ ...scores, [`${current.id}${c}`]: e.target.value })}>
                        <option value="">—</option><option>PASS</option><option>CONCERN</option>{OPTIONAL.includes(c) && <option>NOT_APPLICABLE</option>}
                      </select>
                    </label>
                  ))}
                  <div className="mt-2 flex gap-2">
                    {["PASS", "REWORK", "ESCALATE"].map((o) => (
                      <button key={o} className={btn} disabled={busy} onClick={() => post({ action: "VISUAL_QC", art_master_id: Number(current.id), outcome: o, criteria: Object.fromEntries(data.visual_qc_criteria.map((c: string) => [c, scores[`${current.id}${c}`]])) }, (p) => `Visual QC: ${p.outcome}`)}>{o}</button>
                    ))}
                  </div>
                </fieldset>
              )}
            </div>

            {components.map((c: Json) => {
              const render = data.render_jobs.find((r: Json) => Number(r.artwork_id) === Number(c.artwork_id) && current && Number(r.art_master_id) === Number(current.id));
              const prints = data.print_masters.filter((p: Json) => Number(p.artwork_id) === Number(c.artwork_id));
              const ck = `c${c.artwork_id}`;
              return (
                <div key={c.artwork_id} className="mt-3 border-t border-ink/10 pt-2">
                  <p className="font-semibold">{c.template?.label} · template v{c.template?.version} · {humanise(c.status)}</p>
                  <p className="text-sm">{c.template?.output_px ? `Exactly ${c.template.output_px.width} × ${c.template.output_px.height} px` : c.template?.status === "TEMPLATE_REQUIRED" ? "No manufacturer template on record" : "Square output (manufacturer canvas not supplied)"} · safe zone unverified: MCB reviews it by hand.</p>
                  <p className="text-sm text-espresso/75">Print versions: {prints.map((p: Json) => `v${p.version} (template v${p.template_version}${Number(p.is_current) ? ", current" : ""})`).join("; ") || "—"}</p>
                  {render && current?.visual_qc_status === "PASS" && (
                    <form className="mt-1 flex flex-wrap items-end gap-2" onSubmit={(e) => {
                      e.preventDefault();
                      const file = files[ck];
                      if (!file) return;
                      const form = new FormData();
                      Object.entries({ order_id: String(orderId), artwork_id: String(c.artwork_id), art_master_id: String(current.id), reference: reference ?? "", sku: render.sku, template_id: render.template_id, template_version: String(render.template_version), staff }).forEach(([n, v]) => form.append(n, v));
                      if (ticks[`${ck}safe`]) form.append("safe_zone_reviewed", "true");
                      if (ticks[`${ck}manual`]) form.append("manual_template_confirmed", "true");
                      if (ticks[`${ck}exception`]) form.append("exception_reviewed", "true");
                      form.append("output", file);
                      void send("/api/crm/artwork", { method: "POST", headers, body: form }, (p) => `Print production master v${p.version}: file QC passed.`);
                    }}>
                      <label className="block text-sm font-semibold">Rendered print file
                        <input type="file" accept="image/png,image/jpeg,image/tiff" className="mt-1 block" onChange={(e) => setFiles({ ...files, [ck]: e.target.files?.[0] ?? null })} />
                      </label>
                      <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={ticks[`${ck}safe`] === true} onChange={(e) => setTicks({ ...ticks, [`${ck}safe`]: e.target.checked })} />Faces and text checked clear of trim edges and centre exclusion</label>
                      {c.status === "TEMPLATE_REQUIRED" && <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={ticks[`${ck}manual`] === true} onChange={(e) => setTicks({ ...ticks, [`${ck}manual`]: e.target.checked })} />Prepared to the manufacturer's own dieline</label>}
                      {c.status === "EXCEPTION" && <label className="inline-flex items-center gap-1 text-sm"><input type="checkbox" checked={ticks[`${ck}exception`] === true} onChange={(e) => setTicks({ ...ticks, [`${ck}exception`]: e.target.checked })} />Exception reviewed internally</label>}
                      <button className={btn} disabled={busy || !files[ck]}>Register print file</button>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {pack && (
        <div className={box}>
          <p className="font-semibold text-ink">Supplier order pack v{pack.version} · {humanise(pack.status)} (staff only)</p>
          <ul className="list-disc pl-5 text-sm">
            {pack.body.lines.map((l: Json, i: number) => (
              <li key={i}>{l.quantity} × {l.product} ({l.sku}) — {l.supplier_data ? `${l.supplier_data.supplier ?? "supplier not named"}${l.supplier_data.product_url ? ` · ${l.supplier_data.product_url}` : ""}` : "supplier data not on file"}</li>
            ))}
          </ul>
          <p className="mt-1 text-sm">Founder authorisation: {pack.founder_authorisation.authorised_by ? `${humanise(pack.founder_authorisation.authorised_by)} at ${pack.founder_authorisation.authorised_at}` : "not yet — only Bella or Lewis can authorise, on this page"}.</p>
        </div>
      )}
    </div>
  );
};

export default ProductionFilesPanel;
