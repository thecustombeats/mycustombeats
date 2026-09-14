/**
 * The idea in one breath: what MCB is, before any product is named.
 */
const PARTS = ["Your memory.", "Your story.", "Your music."];

const MemoryPromise = () => (
  <section aria-labelledby="promise-heading" className="bg-white px-5 py-20 sm:px-8 md:py-24">
    <div className="mx-auto max-w-4xl text-center">
      <h2 id="promise-heading" className="text-ink" style={{ fontSize: "clamp(2.1rem, 4.6vw, 3.6rem)" }}>
        {PARTS.map((part) => (
          <span key={part} className="inline-block px-2">
            {part}
          </span>
        ))}{" "}
        <span className="block pt-2 italic text-gold-deep">Something to keep.</span>
      </h2>
      <div aria-hidden="true" className="mx-auto my-8 h-px w-16 bg-gold" />
      <p className="mx-auto max-w-2xl text-lg leading-relaxed text-espresso/80 sm:text-xl">
        MCB is a memory company with music at its heart. You bring the moment and the people in it; we write and
        produce a song around them. Keep it as a song on your phone, a record you can hold, or a whole album of a
        journey.
      </p>
    </div>
  </section>
);

export default MemoryPromise;
