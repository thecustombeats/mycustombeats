/**
 * Illustrative disc mark, used where a CD photograph would go.
 *
 * NOT A PHOTOGRAPH, AND NOT PRETENDING TO BE ONE
 * ----------------------------------------------
 * No CD product photograph exists, and this environment has no image
 * generation, so nothing here is presented as a real product shot. This is
 * a drawn mark: flat, obviously graphic, and deliberately restrained. It
 * fills the slot honestly until a real photograph is supplied, at which
 * point set `image` on the CD entry in `data/keepsakes.ts` and this stops
 * being used.
 *
 * It also does not reproduce the MCB logo. The lettering is plain
 * Cormorant Garamond type, not a recreation of the wordmark — the approved
 * logo artwork is a supplied asset and must never be redrawn.
 *
 * MVIS: Midnight Ink disc on Ivory, one fine Heritage Gold ring, no
 * gradients beyond a single soft radial for form, no neon, no reflections.
 */
const CdDiscMark = ({ className = "" }: { className?: string }) => (
  <svg
    viewBox="0 0 400 400"
    className={className}
    role="img"
    aria-label="Illustration of a CD"
  >
    <defs>
      {/* One soft radial to suggest a physical surface, nothing more. */}
      <radialGradient id="mcb-cd-face" cx="38%" cy="32%" r="78%">
        <stop offset="0%" stopColor="#22344A" />
        <stop offset="55%" stopColor="#132539" />
        <stop offset="100%" stopColor="#0D1B2A" />
      </radialGradient>
    </defs>

    <circle cx="200" cy="200" r="150" fill="url(#mcb-cd-face)" />

    {/* Fine Heritage Gold rim — the single accent. */}
    <circle
      cx="200"
      cy="200"
      r="150"
      fill="none"
      stroke="#C9A14A"
      strokeOpacity="0.55"
      strokeWidth="1"
    />

    {/* Inner data-edge ring, kept very quiet. */}
    <circle
      cx="200"
      cy="200"
      r="94"
      fill="none"
      stroke="#F8F5F0"
      strokeOpacity="0.10"
      strokeWidth="1"
    />

    <text
      x="200"
      y="150"
      textAnchor="middle"
      fill="#F8F5F0"
      fontFamily="'Cormorant Garamond', Georgia, serif"
      fontSize="52"
      fontWeight="600"
      letterSpacing="10"
    >
      MCB
    </text>

    {/* Hairline divider, matching the rules used across the site. */}
    <line
      x1="180"
      y1="166"
      x2="220"
      y2="166"
      stroke="#C9A14A"
      strokeOpacity="0.6"
      strokeWidth="1"
    />

    <text
      x="200"
      y="268"
      textAnchor="middle"
      fill="#F8F5F0"
      fillOpacity="0.55"
      fontFamily="'Manrope', system-ui, sans-serif"
      fontSize="9"
      fontWeight="600"
      letterSpacing="3.4"
    >
      COMPACT DISC
    </text>

    {/* Centre hole, cut through to the surface behind. */}
    <circle cx="200" cy="200" r="26" fill="#F8F5F0" />
    <circle
      cx="200"
      cy="200"
      r="26"
      fill="none"
      stroke="#0D1B2A"
      strokeOpacity="0.18"
      strokeWidth="1"
    />
  </svg>
);

export default CdDiscMark;
