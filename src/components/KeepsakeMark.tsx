/**
 * Typographic stand-in for a keepsake with no approved photograph.
 *
 * NOT A PHOTOGRAPH, AND IT NAMES WHAT IT STANDS FOR
 * Used for catalogue products whose `image` is null. Showing a photograph of
 * a different product would misdescribe this one, so this names the piece
 * instead and makes no claim about how it looks.
 *
 * MVIS: Ivory ground, Midnight Ink type, one Heritage Gold hairline.
 *
 * When a real photograph is approved, set `image` on the product in
 * `data/catalogue/products.ts` and this stops being used for it.
 */
const KeepsakeMark = ({
  name,
  className = "",
}: {
  name: string;
  className?: string;
}) => (
  <div
    className={`w-full h-full flex flex-col items-center justify-center text-center px-8 ${className}`}
    role="img"
    aria-label={`${name} — photograph to follow`}
  >
    <span className="font-serif text-2xl md:text-3xl text-ink leading-tight text-balance">
      {name}
    </span>
    <span className="block h-px w-10 bg-gold/60 my-4" aria-hidden="true" />
    <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-espresso/45">
      Photograph to follow
    </span>
  </div>
);

export default KeepsakeMark;
