import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import SectionHeading from "../components/mcb/SectionHeading";
import { IMAGES, imageSrc } from "../data/imagery";
import { SAMPLE_SONGS } from "../data/sampleSongs";
import { trackEvent } from "../lib/analytics";

/**
 * SEE & HEAR — the founder-approved 25th Anniversary MCB Example, followed by
 * the sample songs (which the structured data describes; both read
 * `data/sampleSongs`).
 *
 * THE VIDEO never autoplays, is never muted-forced, and downloads nothing until
 * someone presses play (`preload="none"`). Even its poster waits until the
 * section is near the viewport, so the homepage's first load is unchanged.
 * It is presented as an example of what MCB creates — not as the customer's
 * own order, and with nothing claimed about who it was made for.
 *
 * WEB DERIVATIVE: public/videos/mcb-25-year-anniversary-example.mp4 (H.264 High +
 * original AAC audio, faststart, 940×1672). Master: assets/originals/. No
 * captions exist yet; none are invented.
 *
 * Each list item appears once (the old carousel duplicated every card for an
 * auto-scrolling loop), nothing moves by itself, and no audio is downloaded
 * until someone presses play (`preload="none"`). One sample plays at a time.
 */

const EXAMPLE_VIDEO = "/videos/mcb-25-year-anniversary-example.mp4";
const EXAMPLE_ID = "anniversary-example";

/** "Anniversary Song • Romantic Gift" → "Anniversary Song". */
const occasion = (tag: string) => tag.split("•")[0].trim();

const SongShowcaseSection = () => {
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const videoRef = useRef<HTMLVideoElement>(null);
  const exampleRef = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver the poster simply loads with the section.
  const [nearViewport, setNearViewport] = useState(() => typeof IntersectionObserver === "undefined");

  // Load the poster only as the example approaches the screen.
  useEffect(() => {
    const el = exampleRef.current;
    if (!el || nearViewport) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [nearViewport]);

  // Stop playback if the visitor leaves the homepage mid-song.
  useEffect(() => {
    const audios = audioRefs.current;
    const video = videoRef.current;
    return () => {
      Object.values(audios).forEach((audio) => audio?.pause());
      video?.pause();
    };
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
    videoRef.current?.pause();
    setPlayingId(id);
    trackEvent("sample_play", { sample_id: id, location: "homepage" });
    audio.play().catch(() => setPlayingId((current) => (current === id ? null : current)));
  };

  return (
    <section id="samples" aria-labelledby="samples-heading" className="scroll-mt-24 bg-ivory py-20 md:py-28">
      <div className="mx-auto max-w-[1400px] px-5 sm:px-8">
        <SectionHeading
          id="samples-heading"
          eyebrow="See & hear"
          title="Hear what a memory can become"
          intro={<p>Examples of what MCB creates. Every song is written for its own story, so yours will sound like yours.</p>}
        />

        {/* ---- The featured example -------------------------------------- */}
        <div ref={exampleRef} className="mx-auto mt-12 grid max-w-5xl items-center gap-8 rounded-[1.75rem] bg-ink p-5 sm:p-8 md:grid-cols-[minmax(0,20rem)_1fr] md:gap-12">
          <div className="mx-auto w-full max-w-[20rem] overflow-hidden rounded-2xl bg-black">
            <video
              ref={videoRef}
              controls
              preload="none"
              playsInline
              width={940}
              height={1672}
              poster={
                nearViewport
                  ? imageSrc(IMAGES.anniversaryExamplePoster, typeof window !== "undefined" && window.devicePixelRatio > 1 ? 960 : 480, "webp")
                  : undefined
              }
              aria-labelledby="anniversary-example-title"
              aria-describedby="anniversary-example-description"
              className="block aspect-[940/1672] h-auto w-full bg-black"
              onPlay={() => {
                if (playingId) audioRefs.current[playingId]?.pause();
                setPlayingId(null);
                trackEvent("sample_play", { sample_id: EXAMPLE_ID, location: "homepage" });
              }}
            >
              <source src={EXAMPLE_VIDEO} type="video/mp4" />
              Your browser can't play this video.
            </video>
          </div>
          <div>
            <p className="label-uppercase text-gold">An MCB example</p>
            <h3 id="anniversary-example-title" className="mt-3 !text-ivory" style={{ fontSize: "2.25rem" }}>
              25th Anniversary MCB Example
            </h3>
            <p id="anniversary-example-description" className="mt-4 text-lg leading-relaxed !text-ivory/85">
              An example of a special memory transformed into an MCB creation — a personalised song with its own artwork. Press play to watch and listen; it runs for just under five minutes.
            </p>
            <p className="mt-4 text-base leading-relaxed !text-ivory/70">
              This is an example of what MCB can create, not the song or product you will receive. Every MCB song is written for its own story.
            </p>
          </div>
        </div>

        <h3 className="mt-16 text-center text-ink">More to listen to</h3>
      </div>

      <ul className="mx-auto mt-8 flex max-w-[1400px] snap-x snap-mandatory list-none gap-4 overflow-x-auto px-5 pb-4 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-8 lg:grid-cols-4">
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
                <p className="label-uppercase text-gold-deep">{occasion(song.tag)}</p>
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
        Sample photographs are illustrative.
      </p>
    </section>
  );
};

export default SongShowcaseSection;
