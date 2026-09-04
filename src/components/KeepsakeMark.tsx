/**
 * Typographic stand-in for a keepsake with no approved photograph.
 *
 * NOT A PHOTOGRAPH, AND IT NAMES WHAT IT STANDS FOR
 * The Luxury Memory Box and the Gift Pop-Up Card have no product photograph:
 * the only images that existed sold discontinued concepts — a USB stick
 * inside the box, and a flat "NFC" tap card — and both were removed.
 *
 * They previously fell back to the CD disc mark, which is a drawing of a CD.
 * Showing a disc where a memory box belongs misdescribes the product just as
 * surely as the wrong photograph did, so this names the piece instead and
 * makes no claim about how it looks.
 *
 * MVIS: Ivory ground, Midnight Ink type, one Heritage Gold hairline.
 *
 * When a real photograph is supplied, set `image` on the family in
 * `data/catalogue` and this stops being used.
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
