import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Play, Pause } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const sampleSongs = [
  {
    id: "1",
    tag: "Anniversary Song • Romantic Gift",
    title: "10 Years with Emma",
    story: "A personalised anniversary song created as a surprise gift, capturing the day they met and the beautiful life they built together over 10 years.",
    image: "/images/sample-anniversary.jpg",
    audio: "audio/anniversary.mp3"
  },
  {
    id: "2",
    tag: "Honeymoon Song • Romantic Memory",
    title: "Mediterranean Honeymoon Memories",
    story: "A personalised honeymoon song created for newlyweds, turning their Mediterranean journey into a timeless musical memory they can relive forever.",
    image: "/images/sample-honeymoon.jpg",
    audio: "audio/honeymoon.mp3"
  },
  {
    id: "3",
    tag: "Family Song • Celebration Gift",
    title: "The Johnson Family Reunion",
    story: "A personalised family song created to celebrate a reunion, capturing three generations of love, laughter and unforgettable shared moments.",
    image: "/images/sample-family.jpg",
    audio: "audio/reunion.mp3"
  },
  {
    id: "4",
    tag: "Proposal Song • Romantic Surprise",
    title: "Sunset Proposal in Santorini",
    story: "A custom proposal song created as a surprise, telling their love story before a magical sunset proposal overlooking the sea.",
    image: "/images/sample-proposal.jpg",
    audio: "audio/proposal.mp3"
  },
  {
    id: "5",
    tag: "Birthday Song • Unique Gift",
    title: "Sara's 30th Birthday Surprise",
    story: "A personalised birthday song gift created by her sister, filled with childhood memories, laughter and moments that made her 30th unforgettable.",
    image: "/images/sample-birthday.jpg",
    audio: "audio/birthday.mp3"
  },
  {
    id: "6",
    tag: "Friends Song • Fun Memory",
    title: "Girls Trip to Remember",
    story: "A personalised song for friends celebrating a girls trip, capturing freedom, laughter and the kind of memories that last a lifetime.",
    image: "/images/sample-girlstrip.jpg",
    audio: "audio/girlstrip.mp3"
  },
  {
    id: "7",
    tag: "Personal Story Song • Emotional Journey",
    title: "Finding Myself at Sea",
    story: "A deeply personal song created to reflect a solo journey of growth, courage and stepping into a new chapter in life.",
    image: "/images/sample-solo.jpg",
    audio: "audio/solo.mp3"
  },
  {
    id: "8",
    tag: "Family Song • Emotional Gift",
    title: "Mother & Daughter Adventure",
    story: "A heartfelt personalised song created as a gift from a daughter to her mother, celebrating a lifetime of love, support and shared memories.",
    image: "/images/sample-motherdaughter.jpg",
    audio: "audio/motherdaughter.mp3"
  }
];

const SongShowcaseSection = () => {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  const progressRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const sectionRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [timeMap, setTimeMap] = useState<{ [key: string]: number }>({});

  const [playingId, setPlayingId] = useState<string | null>(null);

  // 🎬 Animations
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".showcase-heading", { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 });

      gsap.fromTo(".song-card", { y: 50, opacity: 0 }, {
        y: 0,
        opacity: 1,
        duration: 0.4,
        stagger: 0.05,
        scrollTrigger: {
          trigger: carouselRef.current,
          start: "top 85%"
        }
      });
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  // 🔁 AUTO SCROLL
useEffect(() => {
  const container = carouselRef.current;
  if (!container) return;

  let autoScroll: any;

  const startAutoScroll = () => {
    if (autoScroll) return;

    autoScroll = setInterval(() => {
      container.scrollLeft += 0.7;

      if (container.scrollLeft >= container.scrollWidth / 2) {
        container.scrollLeft = 0;
      }
    }, 20);
  };

  const stopAutoScroll = () => {
    if (autoScroll) {
      clearInterval(autoScroll);
      autoScroll = null;
    }
  };

  // ✅ KEY LOGIC
  if (playingId) {
    stopAutoScroll(); // stop when playing
  } else {
    startAutoScroll(); // resume when stopped
  }

  // Hover behavior (optional but nice)
  const handleMouseEnter = () => stopAutoScroll();
  const handleMouseLeave = () => {
    if (!playingId) startAutoScroll();
  };

  container.addEventListener("mouseenter", handleMouseEnter);
  container.addEventListener("mouseleave", handleMouseLeave);

  return () => {
    stopAutoScroll();
    container.removeEventListener("mouseenter", handleMouseEnter);
    container.removeEventListener("mouseleave", handleMouseLeave);
  };
}, [playingId]);


  // ▶️ Play Logic
 const fadeAudio = (audio: HTMLAudioElement, type: "in" | "out") => {
  let volume = type === "in" ? 0 : 1;
  audio.volume = volume;

  const step = 0.1;

  const fade = setInterval(() => {
    if (type === "in") {
      volume += step;
      if (volume >= 1) {
        audio.volume = 1;
        clearInterval(fade);
      } else {
        audio.volume = volume;
      }
    } else {
      volume -= step;
      if (volume <= 0) {
        audio.volume = 0;
        audio.pause();
        clearInterval(fade);
      } else {
        audio.volume = volume;
      }
    }
  }, 50);
};

const togglePlay = (id: string) => {
  const selected = audioRefs.current[id];
  if (!selected) return;

  // STOP previous
  if (playingId && playingId !== id) {
    const prev = audioRefs.current[playingId];
    if (prev) fadeAudio(prev, "out");
  }

  if (playingId === id) {
    fadeAudio(selected, "out");
    setPlayingId(null);
  } else {
    selected.currentTime = 0;
    selected.play();
    fadeAudio(selected, "in");
    setPlayingId(id);

    // ✅ AUTO CENTER CARD
    const container = carouselRef.current;
    const card = container?.querySelector(`[data-id="${id}"]`);
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest"
    });
  }
};

  // ⏱ Progress Bar
  useEffect(() => {
    const interval = setInterval(() => {
      Object.keys(audioRefs.current).forEach((id) => {
        const audio = audioRefs.current[id];
        const bar = progressRefs.current[id];

        if (audio && bar && audio.duration) {
          const percent = (audio.currentTime / audio.duration) * 100;
          bar.style.width = percent + "%";
          setTimeMap(prev => ({
  ...prev,
  [id]: audio.currentTime
}));

          if (audio.ended) {
            bar.style.width = "0%";
            if (playingId === id) setPlayingId(null);
          }
        }
      });
    }, 200);

    return () => clearInterval(interval);
  }, [playingId]);

  return (
<div id="samples" ref={sectionRef} className="w-full bg-gradient-to-b from-ivory to-[#f3efe8] py-24">

      {/* Heading */}
      <div className="showcase-heading px-[7vw] mb-12">
<h2 className="text-[#3A332F] mb-4 leading-tight tracking-tight">
              Listen to Personalised Songs Created for Real Stories
        </h2>
<p className="text-lg text-[#6B625C]/60 max-w-xl">
          Tap play to listen • Scroll to explore →
        </p>
        
      </div>

      {/* Carousel */}
      <div
    


  ref={carouselRef}
  className="flex gap-6 overflow-x-auto px-[7vw] pb-6"
>

{[...sampleSongs, ...sampleSongs].map((song, index) => {
  const uniqueId = `${song.id}-${index}`; // ✅ unique

 
  return (
  <div
    key={uniqueId}
    data-id={uniqueId}
      
     className={`song-card flex-shrink-0 w-[340px] rounded-2xl overflow-hidden shadow transition-transform duration-300 ease-out ${
  playingId === uniqueId
  ? "bg-white scale-110 shadow-[0_25px_70px_rgba(198,164,108,0.5)] ring-2 ring-[#C6A46C]/50 z-10 gold-pulse"
  : "bg-white hover:scale-[1.05] opacity-90 hover:opacity-100 hover:shadow-[0_10px_30px_rgba(0,0,0,0.08)]"
}`}

    >
      <audio
  ref={(el) => {
    audioRefs.current[uniqueId] = el;
  }}
  src={song.audio}
/>

      <div className="relative aspect-[16/10]">
        <img
  src={song.image}
  alt={`${song.tag} personalised song - ${song.title}`}
  loading="lazy"
  decoding="async"
  className="w-full h-full object-cover"
/>

        <button
          onClick={(e) => {
            const btn = e.currentTarget;
            btn.classList.add("scale-125");
            setTimeout(() => btn.classList.remove("scale-125"), 150);

            togglePlay(uniqueId);
          }}
          className={`absolute bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 z-10 ${
            playingId === uniqueId
              ? "bg-gold scale-110 shadow-md"
              : "bg-white/90 hover:scale-110 hover:shadow-lg animate-[pulse_2s_infinite]"
          }`}
        >
          {playingId === uniqueId ? (
            <Pause size={18} className="text-white" />
          ) : (
            <Play
              size={18}
              className="text-black ml-0.5"
              fill="currentColor"
            />
          )}
        </button>
      </div>

      {playingId === uniqueId && (
  <div className="flex items-end gap-[3px] h-5 px-4 mt-2">
    {[...Array(12)].map((_, i) => (
      <div
        key={i}
        className="w-[3px] bg-gold rounded-full animate-wave"
        style={{
          animationDelay: `${i * 0.1}s`,
        }}
      />
    ))}
  </div>
)}

      {/* Progress */}
     <div className="h-1 bg-[#E9E5DF] rounded-full overflow-hidden">
        <div
          ref={(el) => {
  progressRefs.current[uniqueId] = el;
}}

          
          className="h-1 bg-[#C6A46C] w-0 transition-[width] duration-150 ease-linear"
        />
      </div>

      <div className="p-4 relative">
  {playingId === uniqueId && (
    <span className="absolute top-2 right-2 text-[10px] bg-gold text-white px-2 py-1 rounded-full">
      Now Playing
    </span>
  )}

  <p className="text-xs text-[#C6A46C] tracking-wide mb-2">
    {song.tag}
  </p>

  {/* ✅ FIXED TITLE */}
  <h3 className="text-[rgba(46,38,35,0.9)] font-medium mb-3">
    {song.title}
  </h3>

  {/* ✅ STORY */}
  <p className="text-sm text-[rgba(46,38,35,0.65)] leading-relaxed">
    {song.story}
  </p>

  {/* ✅ TIMER */}
<p className="text-xs text-[rgba(46,38,35,0.5)] mt-2">
  {timeMap[uniqueId]
    ? `${Math.floor(timeMap[uniqueId])}s`
    : "0s"}
</p>
</div> {/* text content */}

</div>

);
})}

</div> {/* Carousel */}

{/* CTA */}
<div className="mt-20 flex flex-col items-center gap-4 px-[7vw]">
  <p className="text-[15px] text-[rgba(46,38,35,0.7)] leading-relaxed">
    Your story could be next — crafted into a song you’ll keep forever.
  </p>

  <a
    href="#packages"
    className="group px-10 py-4 bg-gold text-espresso rounded-full font-medium 
    transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
  >
    🎵 Create My Song →
  </a>

  <p className="text-[15px] text-[rgba(46,38,35,0.7)] leading-relaxed">
    Start your custom song in under 2 minutes.
  </p>
</div>


</div> 
);
};

export default SongShowcaseSection;