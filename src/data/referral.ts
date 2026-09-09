/**
 * CUSTOMER REFERRAL — a customer sharing MCB, which is not an affiliate link.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT THE AFFILIATE SYSTEM
 * ─────────────────────────────────────────────────────────────────────────
 * MCB already has affiliates: a commercial arrangement with a username, a
 * click ledger, a dashboard, a conversion counter and — in time — commission.
 * Someone who commissions a song for their mother and then sends the link to
 * their sister is not in that arrangement, has agreed to nothing, and must not
 * be enrolled in it because they shared a URL.
 *
 * So the two stay apart at every level: a different query parameter, a
 * different storage key, a different table, a different conversion record, and
 * no path by which one becomes the other.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY A DIFFERENT QUERY PARAMETER
 * ─────────────────────────────────────────────────────────────────────────
 * `?ref=` is the AFFILIATE namespace. `App.tsx` posts whatever it finds there
 * to `/api/affiliate/click`, which resolves it against `affiliates.username`.
 * Putting customer codes in the same parameter would mean every customer share
 * hitting the affiliate click endpoint with a code that is not an affiliate —
 * and, worse, a customer code that happened to match an affiliate username
 * would credit the wrong party a real commission.
 *
 * `?r=` is therefore its own namespace. Separate parameter, separate
 * resolution, no collision possible.
 */

/* ------------------------------------------------------------------ */
/* The code                                                            */
/* ------------------------------------------------------------------ */

/**
 * `MCB-R-XXXXXX`, e.g. MCB-R-7QK4ZM.
 *
 * WHAT IT DELIBERATELY IS NOT: the customer's database id, their order id,
 * their email, or anything derived from them. A code that encoded any of
 * those would turn every shared link into a disclosure — the recipient, and
 * anyone the link is forwarded to, would be holding a fact about the sender
 * they never agreed to publish.
 *
 * RANDOM, NOT SEQUENTIAL. A counting code would leak how many customers MCB
 * has, and would let anyone walk the space by adding one. Six characters of
 * Crockford's alphabet is a billion codes, drawn server-side with
 * `random_int`, so guessing one is not a productive activity.
 *
 * The alphabet omits I, L, O and U — the characters people misread when a
 * code is spoken aloud or written down, which is exactly how a personal
 * recommendation gets passed on.
 */
export const REFERRAL_CODE_PATTERN = /^MCB-R-[0-9A-HJKMNP-TV-Z]{6}$/;

export const isReferralCode = (value: unknown): value is string =>
  typeof value === "string" && REFERRAL_CODE_PATTERN.test(value);

/* ------------------------------------------------------------------ */
/* Attribution                                                         */
/* ------------------------------------------------------------------ */

/**
 * The query parameter a shared link carries.
 *
 * NOT `ref`. See the header — that belongs to affiliates and is resolved
 * against a table this has nothing to do with.
 */
export const REFERRAL_PARAM = "r";

/** Where the browser holds it between arriving and ordering. */
export const REFERRAL_STORAGE_KEY = "mcb_customer_referral";

/**
 * How long a customer referral stays attached to a visitor, in days.
 *
 * THIRTY, matching nothing in particular — because there is nothing to match.
 * The affiliate system has no expiry window at all: `localStorage.referral` is
 * written once and never cleared, which is defensible for a commercial partner
 * whose whole relationship is that introduction, and indefensible for a
 * personal recommendation. A link a friend sent you in January should not
 * still be claiming credit in November.
 *
 * Thirty days is a conservative choice for business review rather than a
 * promise to anyone: no reward depends on it, and nothing customer-facing
 * mentions it. If MCB later approves an incentive, this is the number that
 * conversation should start from.
 */
export const REFERRAL_WINDOW_DAYS = 30;

export interface StoredReferral {
  code: string;
  /** Unix ms when the visitor arrived on the link. */
  seenAt: number;
}

/**
 * FIRST TOUCH WINS, within the window.
 *
 * Two friends may both send a link. The one who actually prompted the visit is
 * the one whose link brought them, and a later arrival overwriting it would
 * mean whoever the customer happened to click most recently takes the credit —
 * including MCB's own re-marketing of the same page.
 *
 * Once the window lapses the slate is clear and the next link starts a new
 * attribution, so a stale code cannot claim a purchase months later.
 */
export const shouldReplaceStoredReferral = (
  existing: StoredReferral | null,
  now: number,
  windowDays: number = REFERRAL_WINDOW_DAYS
): boolean => {
  if (existing === null) return true;
  const ageMs = now - existing.seenAt;
  return ageMs > windowDays * 24 * 60 * 60 * 1000;
};

/** Reads the stored referral, discarding anything expired or malformed. */
export const readStoredReferral = (
  raw: string | null,
  now: number,
  windowDays: number = REFERRAL_WINDOW_DAYS
): StoredReferral | null => {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Anything unparseable is treated as absent rather than repaired. A
    // corrupted attribution is not a smaller attribution.
    return null;
  }

  const candidate = parsed as Partial<StoredReferral>;
  if (!isReferralCode(candidate.code)) return null;
  if (typeof candidate.seenAt !== "number" || !Number.isFinite(candidate.seenAt)) {
    return null;
  }
  if (now - candidate.seenAt > windowDays * 24 * 60 * 60 * 1000) return null;

  return { code: candidate.code, seenAt: candidate.seenAt };
};

/* ------------------------------------------------------------------ */
/* Sharing                                                             */
/* ------------------------------------------------------------------ */

/** The canonical share URL. Nothing about the order or the story is in it. */
export const referralUrl = (code: string, origin: string): string =>
  `${origin.replace(/\/$/, "")}/?${REFERRAL_PARAM}=${encodeURIComponent(code)}`;

/**
 * The message offered when a customer shares.
 *
 * Written in the FIRST PERSON but claiming nothing on the customer's behalf.
 * It says they had something made and that they are passing the link on — both
 * true by the fact of them sharing it. It does not say the gift was perfect,
 * or that the recipient will love it, because MCB does not get to put an
 * endorsement in someone else's mouth and then send it to their family.
 *
 * It is a default, and it is editable everywhere it is used.
 */
export const shareMessage = (url: string): string =>
  `I had a personal memory created with My Custom Beats. If you have a story you would like to preserve, or give to someone, this is the link I wanted to share with you: ${url}`;

/**
 * What the customer is asked, and how.
 *
 * No reward is named because none has been approved. Inventing "£10 credit"
 * would be a commercial promise this repository has no authority to make, and
 * one that would have to be honoured.
 */
export const REFERRAL_INVITATION =
  "Know someone with a story worth preserving? Share MCB with them.";

/**
 * WhatsApp, built as a plain URL.
 *
 * No SDK, no pixel, no embedded tracker — a link with a pre-filled message,
 * which is all a share needs. The message carries the referral URL and nothing
 * else: no order id, no reference, no recipient, none of the story.
 */
export const whatsappShareUrl = (message: string): string =>
  `https://wa.me/?text=${encodeURIComponent(message)}`;
