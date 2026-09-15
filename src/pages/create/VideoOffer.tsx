import { useEffect, useId, useRef, useState } from "react";
import { Check } from "lucide-react";
import { MEMORY_MUSIC_VIDEO, formatMoney, getVariant } from "../../data/catalogue";
import { VIDEO_COPY } from "../../data/production/video";
import { trackFunnel } from "../../lib/analytics";
import { memoryLabel, type OrderDraft } from "../../lib/personalisation";
import { countVideoOffer, fetchVideoAvailability, type VideoAvailability } from "../../lib/videoOffer";

/**
 * MCB MEMORY MUSIC VIDEO™ — the optional enhancement, offered before payment.
 *
 * Never preselected and never included: the customer explicitly adds it for
 * one song. Availability comes from the server's capacity ledger; when the
 * month is fully booked it cannot be added. Analytics receive only the event
 * and the product — never a story, name or photograph.
 */

interface Props {
  draft: OrderDraft;
  setDraft: (update: (draft: OrderDraft) => OrderDraft) => void;
}

const VideoOffer = ({ draft, setDraft }: Props) => {
  const uid = useId();
  const [availability, setAvailability] = useState<VideoAvailability | null | undefined>(undefined);
  const counted = useRef(false);
  const price = formatMoney(MEMORY_MUSIC_VIDEO.variants[0].price);
  const songs = draft.units.flatMap((unit, u) => unit.memories.map((memory, m) => ({ id: memory.id, label: memoryLabel(draft, u, m) })));
  const chosen = draft.memoryVideo ?? null;
  const moment = draft.productId === "moment";

  useEffect(() => {
    let cancelled = false;
    fetchVideoAvailability().then((a) => { if (!cancelled) setAvailability(a); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (counted.current || !draft.productId || songs.length === 0) return;
    counted.current = true;
    countVideoOffer("OFFER_VIEWED", draft.productId);
    trackFunnel("video_offer_view", { product_id: draft.productId, location: "create", step: "extras" });
  }, [draft.productId, songs.length]);

  if (songs.length === 0) return null;
  const full = availability?.available === false;
  const unknown = availability === null;

  const choose = (memoryId: string | null) => {
    setDraft((d) => ({ ...d, memoryVideo: memoryId }));
    const event = memoryId ? "SELECTED" : "DESELECTED";
    countVideoOffer(event, draft.productId);
    trackFunnel(memoryId ? "video_select" : "video_deselect", { product_id: draft.productId, sku: MEMORY_MUSIC_VIDEO.variants[0].sku, location: "create", step: "extras" });
  };

  return (
    <section aria-labelledby={`${uid}-video`} className={`rounded-2xl border-2 p-5 sm:p-7 ${moment ? "border-gold-dark bg-ink text-ivory" : "border-gold-dark/60 bg-white"}`}>
      <p className={`label-uppercase ${moment ? "!text-gold" : "text-gold-deep"}`}>{VIDEO_COPY.eyebrow}</p>
      <h2 id={`${uid}-video`} className={`mt-2 !text-3xl ${moment ? "!text-ivory" : "text-ink"}`}>{VIDEO_COPY.title}</h2>
      <p className={`mt-2 font-serif text-2xl leading-snug ${moment ? "text-ivory" : "text-ink"}`}>{VIDEO_COPY.headline.join(" ")}</p>
      <p className={`mt-3 text-base leading-relaxed ${moment ? "text-ivory/90" : "text-espresso/80"}`}>{VIDEO_COPY.body}</p>
      <p className={`mt-2 text-base leading-relaxed ${moment ? "text-ivory/90" : "text-espresso/80"}`}>{VIDEO_COPY.ideal}</p>
      <p className={`mt-3 font-mono text-lg ${moment ? "text-ivory" : "text-ink"}`}>{VIDEO_COPY.optional} — {price}</p>
      <p className={`mt-1 text-base ${moment ? "text-ivory/85" : "text-espresso/75"}`} aria-live="polite">
        {availability ? availability.message : unknown ? VIDEO_COPY.availability : "Checking availability…"}
      </p>
      {moment && getVariant(draft.sku) && <p className="mt-1 text-sm text-ivory/80">Your Moment is {formatMoney(getVariant(draft.sku)!.variant.price)}; the film is an optional extra, not included.</p>}

      {chosen ? (
        <div className="mt-5 space-y-3">
          <p className={`flex items-center gap-2 text-base font-semibold ${moment ? "text-ivory" : "text-ink"}`}>
            <Check className="h-5 w-5" aria-hidden="true" /> Added: a Memory Music Video{songs.length > 1 ? ` for ${songs.find((s) => s.id === chosen)?.label}` : ""} · {price}
          </p>
          {songs.length > 1 && (
            <label className={`block text-base ${moment ? "text-ivory" : "text-ink"}`}>
              Which song should become your film?
              <select value={chosen} onChange={(e) => setDraft((d) => ({ ...d, memoryVideo: e.target.value }))} className="mt-2 min-h-12 w-full rounded-xl border border-espresso/20 bg-white px-4 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                {songs.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </label>
          )}
          <button type="button" onClick={() => choose(null)} className={`inline-flex min-h-12 items-center rounded-full border-2 px-6 text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold ${moment ? "border-ivory/60 text-ivory" : "border-ink/30 text-ink"}`}>
            {VIDEO_COPY.remove}
          </button>
        </div>
      ) : (
        <div className="mt-5">
          <button
            type="button"
            disabled={full}
            onClick={() => choose(songs[0].id)}
            className="inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-7 py-3 text-base font-semibold text-ink hover:bg-[#d8b35e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ivory focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {full ? VIDEO_COPY.full : `${VIDEO_COPY.add} — ${price}`}
          </button>
          {songs.length > 1 && !full && <p className={`mt-2 text-sm ${moment ? "text-ivory/80" : "text-espresso/70"}`}>One film for one song — you can choose which song next.</p>}
        </div>
      )}
    </section>
  );
};

export default VideoOffer;
