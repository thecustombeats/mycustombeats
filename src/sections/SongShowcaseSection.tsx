import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import SectionHeading from "../components/mcb/SectionHeading";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { trackEvent } from "../lib/analytics";

/**
 * HEAR IT — the sample songs the homepage plays (and the structured data
 * describes; both read `data/sampleSongs`).
 *
 * Each list item appears once (the old carousel duplicated every card for an
 * auto-scrolling loop), nothing moves by itself, and no audio is downloaded
 * until someone presses play (`preload="none"`). One sample plays at a time.
 */

/** "Anniversary Song • Romantic Gift" → "Anniversary Song". */
const occasion = (tag: string) => tag.split("•")[0].trim();

const SongShowcaseSection = () => {
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  // Stop playback if the visitor leaves the homepage mid-song.
  useEffect(() => {
    const audios = audioRefs.current;
    return () => Object.values(audios).forEach((audio) => audio?.pause());
  }, []);

  const toggle = (id: string) => {
    const audio = audioRefs.current[id];
    if (!audio) return;

    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
      return;
    }

    if (playingId) audioRefs.current[playingId]?.pause();
    setPlayingId(id);
    trackEvent("sample_play", { sample_id: id, location: "homepage" });
    audio.play().catch(() => setPlayingId((current) => (current === id ? null : current)));
  };

  return (
    <section id="samples" aria-labelledby="samples-heading" className="scroll-mt-24 bg-ivory py-20 md:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <SectionHeading
          id="samples-heading"
          eyebrow="Hear it"
          title="Listen to what a memory can sound like"
          intro={<p>Sample songs by MCB, across different moods and occasions. Press play to listen.</p>}
        />
      </div>

      <ul className="mx-auto mt-12 flex max-w-[1400px] snap-x snap-mandatory list-none gap-4 overflow-x-auto px-5 pb-4 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-8 lg:grid-cols-4">
        {SAMPLE_SONGS.map((song) => {
          const playing = playingId === song.id;
          return (
            <li
              key={song.id}
              className={`flex w-[82%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border bg-white transition-shadow sm:w-auto ${
                playing ? "border-gold shadow-[0_18px_50px_rgba(13,27,42,0.12)]" : "border-ink/10"
              }`}
            >
              <audio
                ref={(el) => {
                  audioRefs.current[song.id] = el;
                }}
                src={song.audio}
                preload="none"
                onTimeUpdate={(event) => {
                  const audio = event.currentTarget;
                  if (audio.duration) {
                    setProgress((prev) => ({ ...prev, [song.id]: audio.currentTime / audio.duration }));
                  }
                }}
                onEnded={() => {
                  setPlayingId((current) => (current === song.id ? null : current));
                  setProgress((prev) => ({ ...prev, [song.id]: 0 }));
                }}
              />

              <div className="relative aspect-[16/10] overflow-hidden bg-ink/5">
                <img
                  src={song.image}
                  alt=""
                  width={1344}
                  height={768}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>

              <div aria-hidden="true" className="h-1 bg-ink/10">
                <div className="h-1 bg-gold-deep" style={{ width: `${Math.round((progress[song.id] ?? 0) * 100)}%` }} />
              </div>

              <div className="flex flex-1 flex-col p-5">
                <p className="label-uppercase !text-[0.8125rem] text-gold-deep">{occasion(song.tag)}</p>
                <h3 className="mt-2 text-ink" style={{ fontSize: "1.6rem" }}>
                  {song.title}
                </h3>
                <p className="mt-2 text-base leading-relaxed text-espresso/80">{song.story}</p>

                <div className="mt-auto pt-5">
                  <button
                    type="button"
                    onClick={() => toggle(song.id)}
                    aria-label={`${playing ? "Pause" : "Play"} sample: ${song.title}`}
                    className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 ${
                      playing ? "bg-ink text-ivory" : "border border-ink/25 text-ink hover:border-ink"
                    }`}
                  >
                    {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" fill="currentColor" />}
                    {playing ? "Pause" : "Play sample"}
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mx-auto mt-6 max-w-2xl px-5 text-center text-base text-espresso/70">
        Photographs are illustrative.
      </p>
    </section>
  );
};

export default SongShowcaseSection;
