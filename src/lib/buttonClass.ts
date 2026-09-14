/**
 * MCB buttons. One shape, four tones, a 48px minimum touch target and a
 * visible focus ring on every one.
 *
 *   primary    Midnight Ink on light grounds — the one main action
 *   secondary  outlined, for the alternative action
 *   gold       Heritage Gold on dark grounds
 *   ghostLight outlined ivory on dark grounds
 */
export type McbButtonTone = "primary" | "secondary" | "gold" | "ghostLight";

const TONES: Record<McbButtonTone, string> = {
  primary: "bg-ink text-ivory hover:bg-[#1c2d40] focus-visible:ring-offset-ivory",
  secondary: "border border-ink/25 bg-transparent text-ink hover:border-ink hover:bg-white/60 focus-visible:ring-offset-ivory",
  gold: "bg-gold text-ink hover:bg-gold-light focus-visible:ring-offset-ink",
  ghostLight: "border border-ivory/40 text-ivory hover:border-ivory hover:bg-white/5 focus-visible:ring-offset-ink",
};

export const mcbButtonClass = (tone: McbButtonTone = "primary", extra = "") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-7 py-3 text-base font-semibold tracking-wide transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${TONES[tone]} ${extra}`;

