/**
 * The song samples shown (and played) in the homepage showcase.
 *
 * Lifted out of SongShowcaseSection so the structured data and the carousel
 * describe the same eight recordings. Schema that claims a recording the page
 * does not actually play would be a fabrication, and the only way to guarantee
 * it isn't is for both to read this array.
 *
 * `audio` is stored exactly as the <audio> element consumes it — relative —
 * so nothing about playback changes. `sampleAudioUrl` builds the absolute form
 * that structured data requires.
 */

export interface SampleSong {
  id: string;
  /** Occasion label shown above the title, e.g. "Birthday Song • Unique Gift". */
  tag: string;
  title: string;
  story: string;
  image: string;
  /** Relative path, as used by the audio element. */
  audio: string;
}

export const SAMPLE_SONGS: readonly SampleSong[] = [
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

/** Absolute URL of a sample's audio file, for structured data. */
export const sampleAudioPath = (song: SampleSong): string =>
  song.audio.startsWith("/") ? song.audio : `/${song.audio}`;
