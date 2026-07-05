import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Music, ChevronDown } from 'lucide-react';

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: string;
}

const sampleTracks: Track[] = [
  { id: '1', title: 'Anniversary at Sea', artist: 'Custom Beats', duration: '3:24' },
  { id: '2', title: 'Mediterranean Honeymoon', artist: 'Custom Beats', duration: '4:12' },
  { id: '3', title: 'Sunset Proposal', artist: 'Custom Beats', duration: '3:45' },
  { id: '4', title: 'Girls Trip Anthem', artist: 'Custom Beats', duration: '3:18' },
];

const AudioPlayer = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentTrack = sampleTracks[currentTrackIndex];

  useEffect(() => {
    if (isPlaying) {
      progressInterval.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            const nextIndex = (currentTrackIndex + 1) % sampleTracks.length;
            setCurrentTrackIndex(nextIndex);
            return 0;
          }
          return prev + 0.5;
        });
      }, 100);
    } else {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    }

    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, [isPlaying, currentTrackIndex]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const toggleMute = () => setIsMuted(!isMuted);

  const nextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % sampleTracks.length);
    setProgress(0);
  };

  const prevTrack = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + sampleTracks.length) % sampleTracks.length);
    setProgress(0);
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-[1001] transition-all duration-fast ${
        isExpanded ? 'w-80' : 'w-auto'
      }`}
    >
      <div
        className={`bg-espresso rounded-2xl shadow-luxury overflow-hidden transition-all duration-fast ${
          isExpanded ? 'p-5' : 'p-3'
        }`}
      >
        {/* Collapsed View */}
        {!isExpanded && (
          <button
            onClick={() => setIsExpanded(true)}
            className="flex items-center gap-3 text-ivory hover:text-gold transition-colors duration-fast"
          >
            <div className="w-10 h-10 rounded-full bg-gold/20 flex items-center justify-center">
              <Music size={18} className="text-gold" />
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs text-ivory/60">Now Playing</p>
              <p className="text-sm font-medium truncate max-w-[120px]" style={{ fontFamily: 'Arimo, sans-serif' }}>
                {currentTrack.title}
              </p>
            </div>
          </button>
        )}

        {/* Expanded View */}
        {isExpanded && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Music size={16} className="text-gold" />
                <span className="text-xs text-ivory/60 uppercase tracking-wider">Sample Player</span>
              </div>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-ivory/60 hover:text-ivory transition-colors duration-fast"
              >
                <ChevronDown size={18} />
              </button>
            </div>

            {/* Track Info */}
            <div className="text-center">
              <h4 className="font-serif text-lg text-ivory mb-1">{currentTrack.title}</h4>
              <p className="text-sm text-ivory/60">{currentTrack.artist}</p>
            </div>

            {/* Waveform Visualizer */}
            <div className="flex items-center justify-center gap-1 h-10">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-1 bg-gold rounded-full transition-all duration-fast ${
                    isPlaying ? 'animate-waveform' : ''
                  }`}
                  style={{
                    height: isPlaying
                      ? `${20 + ((i * 17) % 60)}%`
                      : `${15 + (i % 3) * 10}%`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>

            {/* Progress Bar */}
            <div className="relative h-1 bg-ivory/20 rounded-full overflow-hidden">
              <div
                className="absolute top-0 left-0 h-full bg-gold rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
              <button
                onClick={toggleMute}
                className="text-ivory/60 hover:text-ivory transition-colors duration-fast"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>

              <div className="flex items-center gap-4">
                <button
                  onClick={prevTrack}
                  className="text-ivory/60 hover:text-ivory transition-colors duration-fast"
                  aria-label="Previous track"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M15 15L10 10L15 5M10 15L5 10L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>

                <button
                  onClick={togglePlay}
                  className="w-12 h-12 rounded-full bg-gold flex items-center justify-center text-espresso hover:bg-ivory transition-colors duration-fast active:scale-95"
                  style={{ transition: 'transform 0.05s' }}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-0.5" />}
                </button>

                <button
                  onClick={nextTrack}
                  className="text-ivory/60 hover:text-ivory transition-colors duration-fast"
                  aria-label="Next track"
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 15L10 10L5 5M10 15L15 10L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>

              <div className="text-xs text-ivory/60">{currentTrack.duration}</div>
            </div>

            {/* Track List */}
            <div className="pt-3 border-t border-ivory/10">
              <p className="text-xs text-ivory/40 mb-2 uppercase tracking-wider">More Samples</p>
              <div className="space-y-1 max-h-24 overflow-y-auto scrollbar-hide">
                {sampleTracks.map((track, index) => (
                  <button
                    key={track.id}
                    onClick={() => {
                      setCurrentTrackIndex(index);
                      setProgress(0);
                      setIsPlaying(true);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all duration-fast ${
                      index === currentTrackIndex
                        ? 'bg-gold/20 text-gold'
                        : 'text-ivory/60 hover:bg-ivory/5 hover:text-ivory'
                    }`}
                  >
                    {track.title}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioPlayer;
