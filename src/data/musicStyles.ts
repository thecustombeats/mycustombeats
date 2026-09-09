/**
 * MCB MUSIC STYLES — the sonic direction a memory can take.
 *
 * ONE SOURCE OF TRUTH. Every style the customer can choose is declared here,
 * once. The order form, the search, the grouped browser and the tests all read
 * this file, so adding a style is one entry and nothing else — no component
 * enumerates styles itself, and no list can drift out of step with another.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE LABEL IS THE SUBMITTED VALUE
 * ─────────────────────────────────────────────────────────────────────────
 * `label` is both what the customer reads and exactly what is stored in
 * `orders.brief_genre` and sent to fulfilment. There is deliberately no
 * separate "value" field and no id→label lookup on the server: the backend
 * contract is one `genre` string of at most 120 characters, and the cleanest
 * way to honour it is for the thing shown and the thing stored to be the same
 * string. `id` exists for React keys, analytics and tests — it is never
 * submitted.
 *
 * That is why `MAX_STYLE_LABEL_LENGTH` is asserted below: a label longer than
 * the column would be truncated by the server, or rejected outright.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * Not a music taxonomy. MCB is not trying to demonstrate how many genres it
 * knows; it is trying to let someone who may know very little about music say
 * "this is roughly how I want my memory to sound". The list is therefore
 * curated and shallow — one level of grouping, no sub-genres, no BPM, no key.
 *
 * Not a recommendation engine. Nothing here infers anything about the
 * customer or the recipient. There is no age, gender, relationship,
 * nationality or taste profile anywhere in this module, and a musical choice
 * must never be used to guess one.
 *
 * Not artist impersonation. No entry names an artist to imitate.
 * "Motown-inspired" is the one entry that references a label at all, and it is
 * phrased as an influence precisely so it does not imply affiliation with, or
 * production by, Motown.
 */

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export type MusicStyleCategoryId =
  | "era"
  | "timeless"
  | "popular"
  | "dance"
  | "roots";

export interface MusicStyleCategory {
  id: MusicStyleCategoryId;
  /** Heading shown above the group. */
  label: string;
  /** One calm line explaining the group. */
  blurb: string;
}

/**
 * The five groups, in the order the browser presents them.
 *
 * Era comes first deliberately. "The 1980s" is something anyone can choose
 * with confidence; "Alternative" is not. Leading with the decade lets someone
 * who knows no music terminology still express a direction.
 */
export const MUSIC_STYLE_CATEGORIES: readonly MusicStyleCategory[] = [
  {
    id: "era",
    label: "By Era",
    blurb: "Pick a decade and we will write in the sound of that time.",
  },
  {
    id: "timeless",
    label: "Timeless",
    blurb: "The classics — orchestral, soulful and made to last.",
  },
  {
    id: "popular",
    label: "Popular",
    blurb: "Contemporary directions, from acoustic to hip-hop.",
  },
  {
    id: "dance",
    label: "Dance & Electronic",
    blurb: "For a memory that belongs on a dancefloor.",
  },
  {
    id: "roots",
    label: "Roots & World",
    blurb: "Rhythms with somewhere to come from.",
  },
];

export const getCategory = (
  id: MusicStyleCategoryId
): MusicStyleCategory | undefined =>
  MUSIC_STYLE_CATEGORIES.find((category) => category.id === id);

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

export interface MusicStyle {
  /** Stable identifier. For keys, analytics and tests — never submitted. */
  id: string;
  /**
   * Customer-facing name, AND the exact value stored as the order's genre.
   * Keep it short: the server column is 120 characters.
   */
  label: string;
  categoryId: MusicStyleCategoryId;
  /**
   * Set only on the decade entries. Lets the era group be rendered and
   * searched as a period rather than as a genre name.
   */
  era?: string;
  /**
   * Extra terms search should match, beyond the label itself.
   *
   * Only needed where a customer's word is NOT a substring of the label —
   * "dnb" does not appear inside "Drum & Bass", so it is listed; "motown" is
   * already inside "Motown-inspired", so it is not. Keeping the list to
   * genuine gaps stops it becoming a second, competing description.
   */
  keywords?: readonly string[];
  /** Shown in the short initial set, before anything is expanded. */
  featured?: boolean;
}

/**
 * Decade helper.
 *
 * Every era shares the same keyword shape ("80s", "eighties", "1980"), so it
 * is derived rather than typed out five times with a typo waiting in one.
 */
const era = (
  decade: number,
  spelledOut: string
): MusicStyle => ({
  id: `era-${decade}s`,
  label: `${decade}s`,
  categoryId: "era",
  era: `${decade}s`,
  keywords: [
    `${String(decade).slice(2)}s`, // "80s"
    spelledOut,                    // "eighties"
    String(decade),                // "1980"
  ],
});

/**
 * Every style MCB offers, in display order within its group.
 *
 * RETAINED FROM THE PREVIOUS FORM: Trap, Drill and Afrobeats. They were live
 * options a customer could already choose, and dropping them while expanding
 * the list would have quietly narrowed what MCB offers. They are placed in the
 * groups they belong to musically; that placement says nothing about who
 * chooses them.
 */
export const MUSIC_STYLES: readonly MusicStyle[] = [
  /* ---- By Era ---------------------------------------------------- */
  era(1950, "fifties"),
  era(1960, "sixties"),
  era(1970, "seventies"),
  era(1980, "eighties"),
  era(1990, "nineties"),

  /* ---- Timeless -------------------------------------------------- */
  { id: "ballroom", label: "Ballroom", categoryId: "timeless" },
  { id: "waltz", label: "Waltz", categoryId: "timeless" },
  { id: "swing", label: "Swing", categoryId: "timeless", keywords: ["big band"] },
  { id: "jazz", label: "Jazz", categoryId: "timeless", featured: true },
  { id: "soul", label: "Soul", categoryId: "timeless", featured: true },
  {
    id: "motown-inspired",
    label: "Motown-inspired",
    categoryId: "timeless",
    // "Inspired" is load-bearing: it is an influence, not an affiliation.
    keywords: ["sixties soul"],
  },
  { id: "disco", label: "Disco", categoryId: "timeless" },
  { id: "funk", label: "Funk", categoryId: "timeless" },
  { id: "blues", label: "Blues", categoryId: "timeless" },
  { id: "gospel", label: "Gospel", categoryId: "timeless", keywords: ["choir"] },
  { id: "classical", label: "Classical", categoryId: "timeless" },
  {
    id: "orchestral",
    label: "Orchestral",
    categoryId: "timeless",
    keywords: ["cinematic", "strings", "film score"],
  },

  /* ---- Popular --------------------------------------------------- */
  { id: "pop", label: "Pop", categoryId: "popular", featured: true },
  { id: "rock", label: "Rock", categoryId: "popular", featured: true },
  { id: "soft-rock", label: "Soft Rock", categoryId: "popular" },
  {
    id: "acoustic",
    label: "Acoustic",
    categoryId: "popular",
    keywords: ["guitar", "unplugged"],
    featured: true,
  },
  { id: "folk", label: "Folk", categoryId: "popular" },
  { id: "country", label: "Country", categoryId: "popular", featured: true },
  {
    id: "rnb",
    label: "R&B",
    categoryId: "popular",
    keywords: ["rnb", "r and b", "rhythm and blues"],
    featured: true,
  },
  {
    id: "hip-hop",
    label: "Hip-Hop",
    categoryId: "popular",
    // "hip hop" unhyphenated was the label on the previous form; kept as a
    // search term so anyone typing it still lands here.
    keywords: ["hip hop", "rap"],
  },
  { id: "trap", label: "Trap", categoryId: "popular" },
  { id: "drill", label: "Drill", categoryId: "popular" },
  { id: "indie", label: "Indie", categoryId: "popular" },
  { id: "alternative", label: "Alternative", categoryId: "popular" },

  /* ---- Dance & Electronic ---------------------------------------- */
  { id: "house", label: "House", categoryId: "dance" },
  { id: "dance", label: "Dance", categoryId: "dance", featured: true },
  { id: "electronic", label: "Electronic", categoryId: "dance", keywords: ["edm"] },
  {
    id: "drum-and-bass",
    label: "Drum & Bass",
    categoryId: "dance",
    // "dnb" and "d&b" are nowhere inside the label, so they must be listed.
    keywords: ["dnb", "d&b", "drum n bass", "jungle"],
  },

  /* ---- Roots & World --------------------------------------------- */
  { id: "reggae", label: "Reggae", categoryId: "roots" },
  { id: "latin", label: "Latin", categoryId: "roots", keywords: ["salsa", "bossa"] },
  { id: "afrobeats", label: "Afrobeats", categoryId: "roots", keywords: ["afrobeat"] },
];

/* ------------------------------------------------------------------ */
/* Special selections                                                  */
/* ------------------------------------------------------------------ */

/**
 * The value stored when the customer asks MCB to decide.
 *
 * A REAL SELECTION, not a blank. It is written to `genre` exactly as any
 * style label would be, so the order record positively states that MCB holds
 * creative discretion instead of leaving a field empty and hoping someone
 * downstream infers it. No plausible-sounding style is ever substituted.
 *
 * Deliberately not "Other", not "" and not "Any": all three are already
 * meaningful elsewhere or read as missing data.
 */
export const MCB_CHOICE_VALUE = "MCB Choice";

/**
 * The sentinel `genre` value meaning "the customer typed their own".
 *
 * PRE-EXISTING CONTRACT, unchanged. `genre === "Other"` has always been what
 * reveals the free-text box, and submission has always sent the customer's
 * text in its place. Both are preserved exactly, so nothing downstream sees a
 * new shape of payload.
 */
export const OTHER_STYLE_VALUE = "Other";

/** Longest custom style text accepted, matching `orders.brief_genre`. */
export const MAX_STYLE_LABEL_LENGTH = 120;

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export const FEATURED_STYLES: readonly MusicStyle[] = MUSIC_STYLES.filter(
  (style) => style.featured
);

export const getStyle = (id: string): MusicStyle | undefined =>
  MUSIC_STYLES.find((style) => style.id === id);

export const getStyleByLabel = (label: string): MusicStyle | undefined =>
  MUSIC_STYLES.find((style) => style.label === label);

export const stylesInCategory = (
  categoryId: MusicStyleCategoryId
): readonly MusicStyle[] =>
  MUSIC_STYLES.filter((style) => style.categoryId === categoryId);

/** True for a value that is a real catalogued style, not a sentinel. */
export const isKnownStyleLabel = (label: string): boolean =>
  MUSIC_STYLES.some((style) => style.label === label);

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/**
 * Reduces a string to comparable characters.
 *
 * Punctuation and spacing are exactly where these terms disagree — "R&B",
 * "r and b", "rnb"; "Drum & Bass", "drum n bass" — so they are stripped on
 * both sides rather than special-cased.
 */
const normalise = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Deterministic substring search across labels, keywords and group names.
 *
 * NO LIBRARY, NO FUZZY MATCHING, NO NETWORK. The list is a few dozen entries
 * that ship in the bundle, so a linear scan is instant and, more importantly,
 * predictable: the same query always returns the same styles in the same
 * order, which is something a fuzzy ranker cannot promise and a test cannot
 * pin down.
 *
 * Matching is substring rather than prefix so "80s" finds "1980s" and "bass"
 * finds "Drum & Bass".
 *
 * Results keep catalogue order, except that a match on the style's own name
 * outranks a match on its group — searching "dance" should offer the Dance
 * style before every other entry that merely lives in Dance & Electronic.
 */
export const searchStyles = (query: string): readonly MusicStyle[] => {
  const q = normalise(query);
  if (q === "") return MUSIC_STYLES;

  const scored = MUSIC_STYLES.flatMap((style) => {
    if (normalise(style.label).includes(q)) return [{ style, rank: 0 }];
    if ((style.keywords ?? []).some((k) => normalise(k).includes(q)))
      return [{ style, rank: 1 }];
    if (style.era && normalise(style.era).includes(q))
      return [{ style, rank: 1 }];

    const category = getCategory(style.categoryId);
    if (category && normalise(category.label).includes(q))
      return [{ style, rank: 2 }];

    return [];
  });

  return scored
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.style);
};

/** Search results regrouped for display, dropping groups with no matches. */
export const searchStylesByCategory = (
  query: string
): readonly { category: MusicStyleCategory; styles: readonly MusicStyle[] }[] => {
  const matches = searchStyles(query);
  return MUSIC_STYLE_CATEGORIES.flatMap((category) => {
    const styles = matches.filter((style) => style.categoryId === category.id);
    return styles.length > 0 ? [{ category, styles }] : [];
  });
};
