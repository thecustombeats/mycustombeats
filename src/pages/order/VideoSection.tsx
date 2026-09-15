import { useId, useState } from "react";
import type { FormEvent } from "react";
import { LinkError, finishVideoPhotos, formatDay, uploadVideoPhoto, videoLink, type OrderProgress } from "../../lib/customerOrder";

/**
 * The customer's MCB Memory Music Video™ on their private order page:
 * photographs (with their confirmation of the right to provide them, which is
 * not permission for public use), a plain status, and the finished film —
 * played and downloaded through short-lived private links only.
 */

const card = "rounded-3xl border border-ink/10 bg-white p-6 md:p-8";
const button =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-60";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-ink/30 px-6 py-3 text-base font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep disabled:opacity-60";

type Video = NonNullable<OrderProgress["videos"]>[number];

const VideoCard = ({ token, video, multiple }: { token: string; video: Video; multiple: boolean }) => {
  const ids = useId();
  const [count, setCount] = useState(video.photographs);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const jobId = video.video_job_id;

  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("photos") as HTMLInputElement | null;
    const files = Array.from(input?.files ?? []);
    if (!jobId || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let latest = count;
      for (const file of files) latest = (await uploadVideoPhoto(token, jobId, file)).photographs;
      setCount(latest);
      setStatus(`${files.length === 1 ? "Photograph" : `${files.length} photographs`} added.`);
      if (input) input.value = "";
    } catch (e) {
      setError(e instanceof LinkError ? e.message : "We couldn't add that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      setStatus((await finishVideoPhotos(token, jobId)).message);
      setDone(true);
    } catch (e) {
      setError(e instanceof LinkError ? e.message : "We couldn't send that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (download: boolean) => {
    if (!jobId) return;
    setError(null);
    try {
      const { url } = await videoLink(token, jobId, download);
      if (download) window.location.assign(url);
      else setSrc(url);
    } catch (e) {
      setError(e instanceof LinkError ? e.message : "We couldn't open your video just now. Please try again.");
    }
  };

  return (
    <div className="space-y-4">
      {multiple && <p className="text-lg font-semibold text-ink">Song {video.song}</p>}
      {video.status === "READY" ? (
        <>
          <p className="text-lg leading-relaxed">Your film is ready{video.revealed_on ? ` (${formatDay(video.revealed_on)})` : ""}. Find a quiet moment, and press play.</p>
          {src ? (
            <video controls playsInline src={src} className="w-full rounded-2xl bg-ink" aria-label={`Your MCB Memory Music Video${multiple ? ` for song ${video.song}` : ""}`} />
          ) : (
            <button type="button" className={button} onClick={() => open(false)}>Watch your Memory Music Video</button>
          )}
          <button type="button" className={secondary} onClick={() => open(true)}>Download your video</button>
        </>
      ) : video.status === "PHOTOGRAPHS_WANTED" && !done ? (
        <>
          <p className="text-lg leading-relaxed">Add the photographs you'd love to see in your film. {video.orientation_guidance}</p>
          <form onSubmit={upload} className="space-y-4">
            <div>
              <label htmlFor={`${ids}-photos`} className="block text-base font-semibold text-ink">Photographs (JPEG, PNG, WebP or HEIC · up to {video.max_photographs})</label>
              <input id={`${ids}-photos`} name="photos" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="mt-2 w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base" />
            </div>
            <label className="flex cursor-pointer items-start gap-3 text-base text-ink">
              <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 h-5 w-5 accent-[#856823]" />
              <span>{video.rights_statement}</span>
            </label>
            <button type="submit" disabled={busy || !rights} className={button}>{busy ? "Adding…" : "Add photographs"}</button>
          </form>
          <p className="text-base text-espresso/80">{count} photograph{count === 1 ? "" : "s"} added so far.</p>
          <button type="button" disabled={busy} onClick={finish} className={secondary}>I've added my photographs</button>
        </>
      ) : (
        <p className="text-lg leading-relaxed">
          {video.status === "BEING_ARRANGED" ? "We're arranging the production of your film and will be in touch." : "Your film is being made. We'll let you know as soon as it's ready."}
        </p>
      )}
      {status && <p role="status" className="text-base font-semibold text-ink">{status}</p>}
      {error && <p role="alert" className="rounded-xl bg-[#FDECEC] px-4 py-3 text-base font-semibold text-[#9B2C2C]">{error}</p>}
    </div>
  );
};

const VideoSection = ({ token, progress }: { token: string; progress: OrderProgress }) => {
  const videos = progress.videos ?? [];
  if (videos.length === 0) return null;
  return (
    <section className={card} aria-labelledby="order-video">
      <p className="label-uppercase text-gold-deep">MCB Memory Music Video™</p>
      <h2 id="order-video" className="mt-2 font-serif text-2xl text-ink">Your memory. Your song. Your film.</h2>
      <div className="mt-4 space-y-8">
        {videos.map((video) => <VideoCard key={`${video.song}-${video.video_job_id}`} token={token} video={video} multiple={videos.length > 1} />)}
      </div>
    </section>
  );
};

export default VideoSection;
