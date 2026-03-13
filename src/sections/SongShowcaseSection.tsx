import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Play, ChevronLeft, ChevronRight } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

const sampleSongs = [
  { id: '1', title: 'Anniversary at Sea', image: '/images/sample-anniversary.jpg', duration: '1:00', audio:'audio/anniversary.mp3'},
  { id: '2', title: 'Mediterranean Honeymoon', image: '/images/sample-honeymoon.jpg', duration: '1:00', audio:'audio/honeymoon.mp3' },
  { id: '3', title: 'Family Reunion Cruise', image: '/images/sample-family.jpg', duration: '1:00', audio:'audio/reunion.mp3'},
  { id: '4', title: 'Sunset Proposal', image: '/images/sample-proposal.jpg', duration: '1:00', audio:'audio/proposal.mp3' },
  { id: '5', title: 'Birthday Voyage', image: '/images/sample-birthday.jpg', duration: '1:00', audio:'audio/birthday.mp3' },
  { id: '6', title: 'Girls Trip Anthem', image: '/images/sample-girlstrip.jpg', duration: '0:59', audio:'audio/girlstrip.mp3' },
  { id: '7', title: 'Solo Self-Discovery', image: '/images/sample-solo.jpg', duration: '1:00', audio:'audio/solo.mp3' },
  { id: '8', title: 'Mother-Daughter Journey', image: '/images/sample-motherdaughter.jpg', duration: '1:02', audio:'audio/motherdaughter.mp3' },
];

const SongShowcaseSection = () => {
  const audioRefs = useRef<{ [key: string]: HTMLAudioElement | null }>({});
  const sectionRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.showcase-heading',
        { y: 30, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 80%',
            toggleActions: 'play none none reverse',
          },
        }
      );

      gsap.fromTo(
        '.song-card',
        { y: 50, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.35,
          stagger: 0.05,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: carouselRef.current,
            start: 'top 85%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    }, section);

    return () => ctx.revert();
  }, []);

  const checkScrollPosition = () => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    setCanScrollLeft(carousel.scrollLeft > 0);
    setCanScrollRight(carousel.scrollLeft < carousel.scrollWidth - carousel.clientWidth - 10);
  };

  const scroll = (direction: 'left' | 'right') => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction === 'left' ? -400 : 400, behavior: 'smooth' });
    setTimeout(checkScrollPosition, 300);
  };

  const togglePlay = (id: string) => {
  const selectedAudio = audioRefs.current[id];

  if (!selectedAudio) return;

  // Stop any currently playing track
  if (playingId && playingId !== id) {
    const currentAudio = audioRefs.current[playingId];
    currentAudio?.pause();
    currentAudio!.currentTime = 0;
  }

  if (playingId === id) {
    selectedAudio.pause();
    setPlayingId(null);
  } else {
    selectedAudio.play();
    setPlayingId(id);
  }
};

  return (
    <div
      ref={sectionRef}
      id="samples"
      className="relative w-full bg-ivory py-24 overflow-hidden"
    >
      {/* Heading */}
      <div className="showcase-heading px-[7vw] mb-12">
        <span className="label-uppercase text-gold mb-4 block tracking-[0.15em]">
          Sample Collection
        </span>
        <h2 className="font-serif text-espresso mb-4">
          Stories we've already soundtracked
        </h2>
        <p className="text-lg text-espresso/70 max-w-2xl" style={{ fontFamily: 'Arimo, sans-serif' }}>
          Each track is built from real moments—proposals, anniversaries, reunions, and solo voyages.
        </p>
      </div>

      {/* Carousel */}
      <div className="relative">
        <button
          onClick={() => scroll('left')}
          className={`absolute left-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-luxury flex items-center justify-center transition-all duration-fast ${
            canScrollLeft ? 'opacity-100 hover:bg-espresso hover:text-ivory' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Scroll left"
        >
          <ChevronLeft size={24} />
        </button>

        <button
          onClick={() => scroll('right')}
          className={`absolute right-4 top-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full bg-white shadow-luxury flex items-center justify-center transition-all duration-fast ${
            canScrollRight ? 'opacity-100 hover:bg-espresso hover:text-ivory' : 'opacity-0 pointer-events-none'
          }`}
          aria-label="Scroll right"
        >
          <ChevronRight size={24} />
        </button>

        <div
          ref={carouselRef}
          onScroll={checkScrollPosition}
          className="flex gap-6 overflow-x-auto scrollbar-hide px-[7vw] pb-4"
        >
          {sampleSongs.map((song) => (
            <div key={song.id} className="song-card flex-shrink-0 w-[300px] lg:w-[350px] group">
              <div className="relative rounded-2xl overflow-hidden shadow-card transition-all duration-fast hover:-translate-y-1 hover:shadow-luxury">
               <audio
                  ref={(el) => {
  audioRefs.current[song.id] = el;
}}
                  src={song.audio}
                  preload="none"
                  /> 
                  
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={song.image}
                    alt={song.title}
                    className="w-full h-full object-cover transition-transform duration-fast group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-espresso/40 to-transparent" />

                  <button
                    onClick={() => togglePlay(song.id)}
                    className="absolute bottom-4 right-4 w-12 h-12 rounded-full bg-ivory flex items-center justify-center shadow-luxury transition-all duration-fast hover:bg-gold active:scale-95"
                    aria-label={playingId === song.id ? 'Pause' : 'Play'}
                  >
                    {playingId === song.id ? (
                      <div className="flex gap-0.5">
                        <span className="w-1 h-4 bg-espresso rounded-full animate-waveform" />
                        <span className="w-1 h-4 bg-espresso rounded-full animate-waveform animation-delay-100" />
                        <span className="w-1 h-4 bg-espresso rounded-full animate-waveform animation-delay-200" />
                      </div>
                    ) : (
                      <Play size={18} className="text-espresso ml-0.5" fill="currentColor" />
                    )}
                  </button>
                </div>

                <div className="p-5 bg-white">
                  <h3 className="font-serif text-lg text-espresso mb-1">{song.title}</h3>
                  <p className="text-sm text-espresso/50">{song.duration}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-20 flex flex-col items-center gap-4 px-[7vw]">
        <a
  href="#packages"
  className="px-10 py-4 bg-gold text-espresso rounded-full font-medium 
  hover:bg-espresso hover:text-ivory transition-all duration-fast"
>
  Start Your Custom Beat
</a>

        <p className="text-sm text-espresso/60">
          Choose your package and tell us your story.
        </p>
      </div>
    </div>
  );
};

export default SongShowcaseSection;
