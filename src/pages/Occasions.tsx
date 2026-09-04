import { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { revealOnScroll } from "../lib/scrollReveal";

export default function Occasions() {
  const sectionRef = useRef<HTMLDivElement>(null);

  /**
   * This page animated ".fade-up" — a class no element in the codebase has
   * ever carried — so GSAP logged "target .fade-up not found" on every visit
   * and nothing animated. The selector was also unscoped, searching the whole
   * document, so it could have reached elements on other routes.
   *
   * Now it reveals the occasion cards that actually exist, scoped to this
   * page's root, through the helper that guarantees content ends up visible
   * even if the animation never runs.
   */
  useEffect(() => {
    const scope = sectionRef.current;
    if (!scope) return;
    return revealOnScroll(scope, ".occasion-card");
  }, []);

  const occasions = [
    { title: "Wedding Songs", hook: "Your love story, told in music.", desc: "From walking down the aisle to your first dance...", type: "video", src: "/videos/wedding.mp4", poster: "/images/moments/wedding.jpg" },
    { title: "Anniversary Songs", hook: "Relive every chapter together.", desc: "Celebrate your journey...", type: "video", src: "/videos/anniversary.mp4", poster: "/images/moments/anniversary.jpg" },
    { title: "Birthday Songs", hook: "More than a gift — a memory.", desc: "Turn laughter into music...", type: "video", src: "/videos/birthday.mp4", poster: "/images/moments/birthday.jpg" },
    { title: "Proposal Songs", hook: "Say it in the most unforgettable way.", desc: "Create the perfect moment...", type: "image", src: "/images/occasions/proposal.jpg" },
    { title: "Graduation Songs", hook: "Celebrate the journey and the future.", desc: "Mark this milestone...", type: "image", src: "/images/occasions/graduation.jpg" },
    { title: "Memorial Tributes", hook: "A life remembered through music.", desc: "Honour your loved ones...", type: "image", src: "/images/occasions/memorial.jpg" },
    { title: "Pet Songs 🐾", hook: "Because they’re family.", desc: "Capture your pet’s personality...", type: "image", src: "/images/occasions/pet.jpg" },
    { title: "Travel / Cruise Songs", hook: "Relive your adventures forever.", desc: "Turn trips into music...", type: "image", src: "/images/occasions/travel.jpg" },
    { title: "Corporate & VIP Gifting", hook: "A luxury gift that stands out.", desc: "Impress clients...", type: "image", src: "/images/occasions/corporate.jpg" },
  ];

  return (
    <>
      <Helmet>
        <title>Custom Songs for Every Occasion | Weddings, Birthdays & More</title>
        <meta name="description" content="Celebrate weddings, birthdays, anniversaries and special moments with a personalised song crafted by professional musicians." />
        <meta name="keywords" content="custom song, personalized music gift, wedding song, anniversary song, birthday song, proposal song, bespoke song, music gift for pets, corporate music gift" />
      </Helmet>

      <div ref={sectionRef} className="bg-[#FBF9F6] text-black">

        {/* HERO */}
        <section className="pt-32 pb-24 text-center px-6 max-w-5xl mx-auto">
          <h1 className="text-5xl md:text-7xl font-light mb-6 leading-tight">
            Not Every Moment<br />
            <span className="italic">Can Be Put Into Words</span>
          </h1>
          <p className="text-black/60 max-w-2xl mx-auto mb-10 text-lg">
            We turn your most meaningful memories into bespoke songs — crafted to be felt, remembered, and treasured forever.
          </p>
          <a
  href="/#order-form"
  className="inline-flex items-center gap-3 px-10 py-4 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
>
  Start My Song →
</a>
        </section>

        {/* STORY */}
        <section className="max-w-4xl mx-auto text-center px-6 pb-24">
          <p className="text-xl text-black/70 mb-6">Some moments deserve more than a gift.</p>
          <p className="text-black/60">A love story. A milestone. A memory you never want to fade.</p>
          <p className="mt-6 text-black/80 font-medium">We turn these into songs you can keep forever.</p>
        </section>

        {/* OCCASIONS GRID */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="grid md:grid-cols-2 gap-10">
            {occasions.map((item, index) => (
              <div key={index} className="occasion-card border border-black/10 rounded-2xl bg-white overflow-hidden hover:shadow-xl transition">
                {item.type === "video" ? (
                  <video autoPlay loop muted playsInline poster={item.poster || "/images/hero-poster.jpg"} className="w-full h-56 object-cover">
                    <source src={item.src} type="video/mp4" />
                  </video>
                ) : (
                  <img src={item.src || "/images/hero-poster.jpg"} alt={`Custom song for ${item.title}. ${item.hook} ${item.desc}`} className="w-full h-56 object-cover" />
                )}

                {/* Card Content */}
                <div className="p-8">
                  <h2 className="text-2xl mb-2 font-medium">{item.title}</h2>
                  <p className="italic text-black/50 mb-3">{item.hook}</p>
                  <p className="text-black/60 mb-6">
  {item.title === "Wedding Songs" &&
    "Celebrate your wedding day with a custom wedding song crafted by professional musicians. Each personalised track captures your love story, creating a timeless music gift for your first dance and beyond."}

  {item.title === "Anniversary Songs" &&
    "Mark your anniversary with a personalised song that reflects your journey together. Our bespoke music gifts turn memories into melodies you can relive every year."}

  {item.title === "Birthday Songs" &&
    "Make birthdays unforgettable with a custom birthday song. A unique and meaningful music gift that captures joy, laughter and personality in every note."}

  {item.title === "Proposal Songs" &&
    "Create the perfect proposal with a custom song written just for your moment. Express your love in a way words alone cannot."}

  {item.title === "Graduation Songs" &&
    "Celebrate achievements with a personalised graduation song. Honour milestones and success with music that tells a unique story."}

  {item.title === "Memorial Tributes" &&
    "Remember loved ones with a heartfelt memorial song. A deeply personal tribute that preserves memories through music."}

  {item.title === "Pet Songs 🐾" &&
    "Celebrate your furry friends with a custom pet song. Capture their personality and the joy they bring into your life."}

  {item.title === "Travel / Cruise Songs" &&
    "Relive your adventures with a bespoke travel song. Turn unforgettable journeys into music you can treasure forever."}

  {item.title === "Corporate & VIP Gifting" &&
    "Impress clients with a luxury custom song experience. A unique corporate gift designed to create lasting emotional impact."}
</p>

                  <a
  href="/#order-form"
  className="inline-flex items-center gap-3 px-10 py-4 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
>
  Start My Song →
</a>

{/* The voyage funnel has a page of its own; this card is where a guest
    looking for it actually is. */}
{item.title === "Travel / Cruise Songs" && (
  <a
    href="/cruise"
    className="block mt-4 text-sm text-gold-deep hover:underline"
  >
    See the cruise &amp; voyage journey →
  </a>
)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="max-w-6xl mx-auto px-6 py-24">
          <h2 className="text-4xl text-center font-light mb-6">How It Works</h2>
          <p className="text-center text-black/60 max-w-xl mx-auto mb-12">A simple, guided process designed to turn your story into something unforgettable.</p>
          <div className="grid md:grid-cols-4 gap-10 text-center">
            {["Tell us your story", "We craft your song", "Refine it together", "Receive your keepsake"].map((step, i) => (
              <div key={i}>
                <div className="text-3xl mb-4">0{i + 1}</div>
                <p className="text-black/60">{step}</p>
              </div>
            ))}
          </div>
        </section>

        {/* SOCIAL PROOF */}
        <section className="max-w-5xl mx-auto px-6 py-24 text-center border-t border-black/10">
          <h2 className="text-4xl font-light mb-12">What Our Clients Say</h2>
          <div className="space-y-8 text-black/70">
            <p>"I’ve never seen my wife cry like that — this was beyond a gift."</p>
            <p>"The most meaningful thing I’ve ever given."</p>
            <p>"It captured everything I couldn’t say."</p>
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="text-center py-32 px-6 border-t border-black/10">
          <h2 className="text-4xl font-light mb-6">Your Story Deserves More Than a Gift</h2>
          <p className="text-black/60 max-w-xl mx-auto mb-10">Let’s turn it into something unforgettable.</p>
          
          <a
  href="/#order-form"
  className="inline-flex items-center gap-3 px-10 py-4 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
>
  Start My Song →
</a>

          <p className="text-black/50 text-sm mt-6">Limited slots available each month.</p>
        </section>

      </div>
    </>
  );
}