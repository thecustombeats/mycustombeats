/**
 * A note from the founders. Approved text — change typography only.
 * Deliberately typographic: no portrait photographs are used.
 */
const PARAGRAPHS = [
  "For years, we’ve watched people make extraordinary memories — celebrations, journeys, friendships, families and moments at sea that seem to pass far too quickly.",
  "MCB was created because we wanted those moments to have somewhere to live after the day itself was over.",
  "It is a genuine privilege when you trust us with your story. Whether we’re turning one special memory into music or creating the soundtrack to an entire journey, we never forget that what we’re working with belongs to you.",
  "Thank you for allowing us to help turn your memories into something you can keep, hear and relive.",
];

const FounderNote = () => (
  <section aria-labelledby="founder-note-heading" className="bg-ink px-5 py-20 sm:px-8 md:py-28">
    <figure className="mx-auto max-w-3xl">
      <h2 id="founder-note-heading" className="text-center !text-ivory" style={{ fontSize: "clamp(2rem, 4vw, 2.9rem)" }}>
        A note from Bella &amp; Lewis
      </h2>
      <div aria-hidden="true" className="mx-auto mb-10 mt-6 h-px w-16 bg-gold" />

      <blockquote className="m-0 space-y-6">
        {PARAGRAPHS.map((paragraph) => (
          <p key={paragraph} className="font-serif text-[1.35rem] leading-relaxed !text-ivory/90 sm:text-2xl sm:leading-relaxed">
            {paragraph}
          </p>
        ))}
      </blockquote>

      <figcaption className="mt-12 border-t border-ivory/15 pt-8 text-center">
        <span className="block font-serif text-4xl italic text-gold">Bella &amp; Lewis</span>
        <span className="mt-2 block text-base text-ivory/75">Founders, MCB™ — My Custom Beats</span>
      </figcaption>
    </figure>
  </section>
);

export default FounderNote;
