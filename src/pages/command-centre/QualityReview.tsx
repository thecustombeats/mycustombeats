import { useEffect, useId, useState } from "react";
import { answersComplete, canPass, type Json } from "../../lib/commandCentre";
import { card, eyebrow, field, primary, secondary } from "./styles";

/**
 * Founder-friendly quality review for songs and artwork. Internal only: no
 * decision here asks the customer anything or contacts them. Rework goes back
 * to MCB's own team.
 */

interface Props {
  orderId: number;
  reference: string;
  api: (path: string, body?: Json) => Promise<Json>;
  fetchBlob: (path: string, type?: string) => Promise<string>;
  staff: string;
  onDone: (message: string) => void;
}

const Questions = ({ questions, answers, setAnswers, name }: { questions: Json[]; answers: Record<string, string>; setAnswers: (a: Record<string, string>) => void; name: string }) => (
  <div className="space-y-3">
    {questions.map((q) => (
      <fieldset key={q.key} className="rounded-xl border border-ink/15 p-3">
        <legend className="px-1 text-base font-semibold text-ink">{q.label}</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {[["YES", "Yes"], ["NO", "No"], ...(q.not_applicable ? [["NOT_APPLICABLE", q.not_applicable]] : [])].map(([value, text]) => (
            <label key={value} className={`flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-base ${answers[q.key] === value ? "border-ink bg-ink text-ivory" : "border-ink/25 text-ink"}`}>
              <input type="radio" className="h-5 w-5 accent-[#C9A14A]" name={`${name}-${q.key}`} value={value} checked={answers[q.key] === value} onChange={() => setAnswers({ ...answers, [q.key]: value })} />
              {text}
            </label>
          ))}
        </div>
      </fieldset>
    ))}
  </div>
);

const Decision = ({ answers, questions, busy, onDecide }: { answers: Record<string, string>; questions: Json[]; busy: boolean; onDecide: (decision: string, note: string) => void }) => {
  const id = useId();
  const [note, setNote] = useState("");
  const complete = answersComplete(questions, answers);
  return (
    <div className="space-y-3">
      <label htmlFor={`${id}-note`} className="block text-base font-semibold text-ink">Note for the team (optional, internal)</label>
      <textarea id={`${id}-note`} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
      {!complete && <p className="text-sm text-ink/80">Answer every question to decide.</p>}
      {complete && !canPass(answers) && <p className="text-sm font-semibold text-[#8A1F1F]">Something needs fixing, so this cannot pass. Send it back for internal rework or escalate.</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className={primary} disabled={busy || !complete || !canPass(answers)} onClick={() => onDecide("PASS", note)}>Pass quality check</button>
        <button type="button" className={secondary} disabled={busy || !complete} onClick={() => onDecide("REWORK", note)}>Send back for internal rework</button>
        <button type="button" className={secondary} disabled={busy || !complete} onClick={() => onDecide("ESCALATE", note)}>Escalate</button>
      </div>
    </div>
  );
};

const SongReview = ({ song, questions, props }: { song: Json; questions: Json[]; props: Props }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [audio, setAudio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listen = async () => {
    setError(null);
    try {
      const type = { WAV: "audio/wav", FLAC: "audio/flac", AIFF: "audio/aiff", MP3: "audio/mpeg" }[song.format as string] ?? "audio/wav";
      setAudio(await props.fetchBlob(`/api/crm/creative-file?candidate_id=${song.candidate_id}&staff=${encodeURIComponent(props.staff)}`, type));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const decide = async (decision: string, note: string) => {
    setBusy(true);
    setError(null);
    try {
      await props.api("/api/crm/command-centre", { action: "SONG_QUALITY_CHECK", order_id: props.orderId, candidate_id: song.candidate_id, answers, decision, note: note || undefined, staff: props.staff });
      props.onDone(decision === "PASS" ? `Song ${song.song} passed quality check.` : decision === "REWORK" ? `Song ${song.song} sent back for internal rework. The customer has not been contacted.` : `Song ${song.song} escalated.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`${card} space-y-4`} aria-labelledby={`song-${song.candidate_id}`}>
      <div>
        <p className={eyebrow}>Song {song.song}</p>
        <h3 id={`song-${song.candidate_id}`} className="font-serif text-2xl text-ink">{song.title ?? "Untitled song"}</h3>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
        <dt className="font-semibold">Target length</dt><dd className="m-0">{song.target_duration_seconds ? `${song.target_duration_seconds} seconds` : "— Awaiting data"}</dd>
        <dt className="font-semibold">Actual length</dt><dd className="m-0">{song.actual_duration_seconds !== null ? `${song.actual_duration_seconds} seconds` : "Not measurable for this format"}</dd>
        <dt className="font-semibold">Requested style</dt><dd className="m-0">{song.requested_style.length ? song.requested_style.join(", ") : "MCB to choose"}</dd>
        <dt className="font-semibold">Emotional direction</dt><dd className="m-0">{song.emotional_direction.length ? song.emotional_direction.join(" · ") : "— Awaiting data"}</dd>
        <dt className="font-semibold">Protected names</dt><dd className="m-0">{song.protected_names.length ? song.protected_names.join(", ") : "None recorded"}</dd>
        <dt className="font-semibold">Pronunciation</dt><dd className="m-0">{song.pronunciation_notes.length ? song.pronunciation_notes.join("; ") : "No notes"}</dd>
      </dl>
      <details className="rounded-xl border border-ink/15 p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-ink">Customer facts to check against</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-base">
          {song.facts.map((f: Json, i: number) => <li key={i}><span className="font-semibold">{f.type.replace(/_/g, " ").toLowerCase()}{f.exact ? " (must be exact)" : ""}:</span> {String(f.value ?? "")}</li>)}
        </ul>
      </details>
      <details className="rounded-xl border border-ink/15 p-3">
        <summary className="min-h-11 cursor-pointer py-2 text-base font-semibold text-ink">Lyrics</summary>
        <div className="mt-2 space-y-2 text-base">
          {song.lyrics.filter((s: Json) => s.text).map((s: Json, i: number) => <p key={i} className="whitespace-pre-wrap"><span className="block text-sm font-semibold uppercase text-ink/70">{s.type}</span>{s.text}</p>)}
        </div>
      </details>
      {audio ? (
        <audio controls src={audio} className="w-full" aria-label={`Listen to song ${song.song}`} />
      ) : (
        <button type="button" className={secondary} onClick={listen}>Listen to the song</button>
      )}
      <Questions questions={questions} answers={answers} setAnswers={setAnswers} name={`song-${song.candidate_id}`} />
      {error && <p role="alert" className="rounded-xl bg-[#FBEAEA] px-3 py-2 font-semibold text-[#8A1F1F]">{error}</p>}
      <Decision answers={answers} questions={questions} busy={busy} onDecide={decide} />
    </article>
  );
};

const ArtworkReview = ({ art, questions, props }: { art: Json; questions: Json[]; props: Props }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [image, setImage] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = async () => {
    setError(null);
    try {
      setImage(await props.fetchBlob(`/api/crm/production-files?art_master_id=${art.art_master_id}&download=1&staff=${encodeURIComponent(props.staff)}`, "image/png"));
      setPhotos(await Promise.all(art.source_photo_ids.map((id: string) => props.fetchBlob(`/api/crm/upload?id=${encodeURIComponent(id)}`))));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const decide = async (decision: string, note: string) => {
    setBusy(true);
    setError(null);
    try {
      await props.api("/api/crm/command-centre", { action: "ARTWORK_QUALITY_CHECK", order_id: props.orderId, art_master_id: art.art_master_id, answers, decision, note: note || undefined, staff: props.staff });
      props.onDone(decision === "PASS" ? "Artwork passed quality check." : decision === "REWORK" ? "Artwork sent back for internal rework. The customer has not been contacted." : "Artwork escalated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className={`${card} space-y-4`} aria-labelledby={`art-${art.art_master_id}`}>
      <div>
        <p className={eyebrow}>Artwork version {art.version}</p>
        <h3 id={`art-${art.art_master_id}`} className="font-serif text-2xl text-ink">{art.product}</h3>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
        <dt className="font-semibold">Title</dt><dd className="m-0">{art.album_title ?? "— Awaiting data"}</dd>
        <dt className="font-semibold">Names</dt><dd className="m-0">{art.names.length ? art.names.join(", ") : "None recorded"}</dd>
        <dt className="font-semibold">Dates</dt><dd className="m-0">{art.dates.length ? art.dates.join(", ") : "None recorded"}</dd>
        <dt className="font-semibold">Occasion</dt><dd className="m-0">{art.occasions.length ? art.occasions.join(", ") : "—"}</dd>
        <dt className="font-semibold">Size</dt><dd className="m-0">{art.size}</dd>
        <dt className="font-semibold">Print previews</dt><dd className="m-0">{art.print_previews.length ? art.print_previews.map((p: Json) => `${p.template} v${p.version}`).join(", ") : "Not rendered yet"}</dd>
      </dl>
      {image ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <figure className="m-0"><img src={image} alt={`Artwork version ${art.version} for ${props.reference}`} className="w-full rounded-xl border border-ink/10" /><figcaption className="mt-1 text-sm text-ink/70">MCB artwork</figcaption></figure>
          {photos.map((p, i) => <figure key={i} className="m-0"><img src={p} alt={`Customer source photograph ${i + 1}`} className="w-full rounded-xl border border-ink/10" /><figcaption className="mt-1 text-sm text-ink/70">Customer photograph {i + 1}</figcaption></figure>)}
        </div>
      ) : (
        <button type="button" className={secondary} onClick={show}>Show artwork and source photographs</button>
      )}
      <Questions questions={questions} answers={answers} setAnswers={setAnswers} name={`art-${art.art_master_id}`} />
      {error && <p role="alert" className="rounded-xl bg-[#FBEAEA] px-3 py-2 font-semibold text-[#8A1F1F]">{error}</p>}
      <Decision answers={answers} questions={questions} busy={busy} onDecide={decide} />
    </article>
  );
};

/** A Memory Music Video candidate: watch it, answer plain questions, decide. The customer is never asked. */
const VideoReview = ({ video, questions, props }: { video: Json; questions: Json[]; props: Props }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watch = async () => {
    setError(null);
    try {
      setSrc(await props.fetchBlob(`/api/crm/video?download=candidate&id=${video.candidate_id}&staff=${encodeURIComponent(props.staff)}`, video.container === "MOV" ? "video/quicktime" : "video/mp4"));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const decide = async (decision: string, note: string) => {
    setBusy(true);
    setError(null);
    try {
      await props.api("/api/crm/command-centre", { action: "VIDEO_QUALITY_CHECK", order_id: props.orderId, candidate_id: video.candidate_id, answers, decision, note: note || undefined, staff: props.staff });
      props.onDone(decision === "PASS" ? "Memory Music Video passed quality check." : decision === "REWORK" ? "Memory Music Video sent back for internal rework. The customer has not been contacted." : "Memory Music Video escalated.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const checks = video.checks ?? {};
  return (
    <article className={`${card} space-y-4`} aria-labelledby={`video-${video.candidate_id}`}>
      <div>
        <p className={eyebrow}>Memory Music Video · song {video.song} · version {video.version}</p>
        <h3 id={`video-${video.candidate_id}`} className="font-serif text-2xl text-ink">{video.song_title ?? "Untitled song"}</h3>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-base">
        <dt className="font-semibold">Song length</dt><dd className="m-0">{video.song_seconds !== null ? `${video.song_seconds} seconds` : "— Awaiting data"}</dd>
        <dt className="font-semibold">Film length</dt><dd className="m-0">{video.video_seconds !== null ? `${video.video_seconds} seconds` : "Not readable"}{checks.COVERS_WHOLE_SONG === "CONCERN" ? " — does not match the song" : ""}</dd>
        <dt className="font-semibold">Picture</dt><dd className="m-0">{video.picture ?? "Not readable"}</dd>
        <dt className="font-semibold">Photographs supplied</dt><dd className="m-0">{video.photographs}</dd>
        <dt className="font-semibold">Earlier reworks</dt><dd className="m-0">{video.rework_count}</dd>
      </dl>
      {src ? <video controls playsInline src={src} className="w-full rounded-xl bg-ink" aria-label={`Memory Music Video for song ${video.song}`} /> : <button type="button" className={secondary} onClick={watch}>Watch the video</button>}
      <Questions questions={questions} answers={answers} setAnswers={setAnswers} name={`video-${video.candidate_id}`} />
      {error && <p role="alert" className="rounded-xl bg-[#FBEAEA] px-3 py-2 font-semibold text-[#8A1F1F]">{error}</p>}
      <Decision answers={answers} questions={questions} busy={busy} onDecide={decide} />
    </article>
  );
};

const QualityReview = (props: Props) => {
  const [data, setData] = useState<Json | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { api, orderId, staff } = props;
  useEffect(() => {
    api(`/api/crm/command-centre?view=quality&order_id=${orderId}&staff=${encodeURIComponent(staff)}`).then(setData).catch((e) => setError((e as Error).message));
  }, [api, orderId, staff]);
  if (error) return <p role="alert" className="font-semibold text-[#8A1F1F]">{error}</p>;
  if (!data) return <p role="status">Loading the quality check…</p>;
  return (
    <div className="space-y-4">
      <p className="text-base text-ink/80">{data.note}</p>
      {data.songs.length === 0 && data.artwork.length === 0 && (data.videos ?? []).length === 0 && <p className={card}>Nothing on this order is waiting for a song, artwork or video quality check.</p>}
      {data.songs.map((s: Json) => <SongReview key={s.candidate_id} song={s} questions={data.song_questions} props={props} />)}
      {data.artwork.map((a: Json) => <ArtworkReview key={a.art_master_id} art={a} questions={data.artwork_questions} props={props} />)}
      {(data.videos ?? []).map((v: Json) => <VideoReview key={v.candidate_id} video={v} questions={data.video_questions} props={props} />)}
    </div>
  );
};

export default QualityReview;
