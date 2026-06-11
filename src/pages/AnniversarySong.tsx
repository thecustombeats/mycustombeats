import { Helmet } from "react-helmet-async";

const AnniversarySong = () => {
  const scrollToOrder = () => {
  if (window.location.pathname !== "/") {
    window.location.href = "/#order";
    return;
  }

  const el = document.querySelector("#order");
  if (el) el.scrollIntoView({ behavior: "smooth" });
};

  return (
    <>
      {/* ✅ SEO */}
      <Helmet>
        <title>
          Bespoke Anniversary Song | Luxury Personalised Song Experience
        </title>
        <meta
          name="description"
          content="Commission a bespoke anniversary song crafted by professional musicians. A refined, deeply personal gift designed to capture your story in music."
        />
      </Helmet>

      {/* ✅ HERO */}
      <section className="w-full bg-ivory py-24 px-[7vw] text-center">
        <h1 className="text-4xl md:text-5xl font-serif text-espresso mb-6 leading-tight">
          A Bespoke Anniversary Song, Composed Just for You
        </h1>

        <p className="text-lg text-espresso/70 max-w-2xl mx-auto mb-6">
          Transform your story into a timeless musical composition — crafted with care, discretion, and artistic precision.
        </p>

        <p className="text-sm text-espresso/60 mb-10">
          Commissioned by discerning clients for private celebrations, luxury experiences, and meaningful occasions worldwide
        </p>

        <button
          onClick={() => window.location.href = "/#order"}
          className="px-10 py-4 bg-gold text-espresso rounded-full text-lg hover:bg-espresso hover:text-ivory transition"
        >
          Commission Your Song
        </button>
      </section>

      {/* ❤️ WHY SECTION */}
      <section className="w-full py-20 px-[7vw] bg-white text-center">
        <h2 className="text-3xl font-serif text-espresso mb-6">
          For Moments That Deserve More Than the Expected
        </h2>

        <p className="text-espresso/70 max-w-3xl mx-auto mb-4">
          Traditional gifts are appreciated, then gradually forgotten.
        </p>

        <p className="text-espresso/70 max-w-3xl mx-auto mb-4">
          A bespoke composition, however, becomes part of your story — something to return to, to relive, to remember.
        </p>

        <p className="text-espresso/70 max-w-3xl mx-auto">
          Each piece is carefully written and produced to reflect your journey, your memories, and the emotion behind them.
        </p>
      </section>

      {/* 🎵 HOW IT WORKS */}
      <section className="w-full py-20 px-[7vw] bg-[#f8f5f0] text-center">
        <h2 className="text-3xl font-serif text-espresso mb-10">
          The Process
        </h2>

        <div className="max-w-3xl mx-auto space-y-6 text-espresso/70">
          <p>
            1. Share your story — moments, memories, and details that matter
          </p>
          <p>
            2. Composition & production by professional musicians and vocalists
          </p>
          <p>
            3. A refined, personal piece delivered for your private moment
          </p>
        </div>
      </section>

      {/* 🎧 SAMPLE */}
      <section className="w-full py-20 px-[7vw] bg-white text-center">
        <h2 className="text-3xl font-serif text-espresso mb-6">
          A Selection of Compositions
        </h2>

        <p className="text-espresso/70 mb-10 max-w-2xl mx-auto">
          Each song is created individually, reflecting a unique story and moment.
        </p>

        <div className="max-w-xl mx-auto bg-[#f3efe8] rounded-2xl p-6 shadow">
          <h3 className="text-lg font-medium text-espresso mb-2">
            Ten Years Together
          </h3>

          <p className="text-sm text-espresso/60 mb-4">
            A private anniversary composition capturing a decade of shared memories and quiet moments.
          </p>

          <audio controls className="w-full">
            <source src="/audio/anniversary.mp3" type="audio/mpeg" />
          </audio>

          <p className="mt-4 text-sm text-espresso/60">
            Your story, composed with the same care and attention to detail
          </p>
        </div>
      </section>

      {/* 🎼 VALUE SECTION */}
      <section className="w-full py-20 px-[7vw] bg-[#f8f5f0] text-center">
        <h2 className="text-3xl font-serif text-espresso mb-6">
          More Than a Song — A Personal Artefact
        </h2>

        <div className="max-w-3xl mx-auto space-y-4 text-espresso/70">
          <p>• A composition created exclusively for you</p>
          <p>• Professionally written, arranged, and produced</p>
          <p>• Available in curated formats for keepsake and gifting</p>
          <p>• Designed to be experienced, revisited, and remembered</p>
        </div>
      </section>

      {/* 🎯 FINAL CTA */}
      <section className="w-full py-24 px-[7vw] bg-ivory text-center">
        <h2 className="text-3xl font-serif text-espresso mb-6">
          Commission a Gift That Endures
        </h2>

        <p className="text-espresso/70 mb-10 max-w-2xl mx-auto">
          For those seeking something deeply personal, considered, and entirely their own.
        </p>

        <button
          onClick={scrollToOrder}
          className="px-10 py-4 bg-gold text-espresso rounded-full text-lg hover:bg-espresso hover:text-ivory transition"
        >
          Begin Your Composition
        </button>
      </section>
    </>
  );
};

export default AnniversarySong;