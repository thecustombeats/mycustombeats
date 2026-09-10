import { Helmet } from "react-helmet-async";

const products = [
  {
    id: "vinyl",
    title: "Personalised 12-Inch Vinyl Record",
    description: "Your personalised song, preserved on a full-size 12-inch record with bespoke sleeve and label artwork.",
    price: "£99 + delivery",
    note: "One record. Two playable sides. Made individually for your story."
  },
  {
    id: "artwork",
    title: "Framed Lyric Artwork",
    description: "Timeless typography and personal artwork designed to make your story part of your home.",
    price: "Made to order",
    note: "Available as a personalised enhancement to your MCB experience."
  },
  {
    id: "plaque",
    title: "Engraved Music Plaques",
    description: "Crystal or wood with a scannable code to your song.",
    price: "Made to order",
    note: "Personalised around your song, message and artwork."
  },
  {
    id: "memory-box",
    title: "Luxury Memory Boxes",
    description: "Lyrics, photos, and your song in one complete experience.",
    price: "Made to order",
    note: "Curated individually to suit your story and presentation."
  },
  {
    id: "cards",
    title: "Premium Music Cards",
    description: "A beautiful personalised card that connects the moment to your song.",
    price: "Made to order",
    note: "Selected designs available for celebrations, journeys and meaningful gifts."
  }
];

const collectionSizes = [
  { count: "1", label: "One defining memory", price: "£99" },
  { count: "3", label: "Three chapters from your journey", price: "£297" },
  { count: "5", label: "Five moments worth keeping", price: "£495" },
  { count: "7", label: "A seven-record travel story", price: "£693" },
  { count: "Your choice", label: "Choose as many days or memories as you want", price: "£99 each" }
];

const Products = () => {
  return (
    <>
      <Helmet>
        <title>Custom Vinyl & Music Keepsakes | My Custom Beats</title>
        <meta
          name="description"
          content="Turn your personalised song into a luxury 12-inch vinyl record, Journey Collection, framed artwork, music card or bespoke memory keepsake."
        />
      </Helmet>

      <div className="bg-[#FBF9F6] text-black">
        <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 overflow-hidden">
            <video
              className="w-full h-full object-cover scale-[1.05] animate-heroZoom"
              autoPlay
              loop
              muted
              playsInline
              preload="none"
              poster="/images/products-poster.jpg"
            >
              <source src="/videos/products.mp4" type="video/mp4" />
            </video>
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-espresso/50 to-espresso/30 backdrop-blur-[2px]" />
          <div className="relative z-10 text-center px-6">
            <span className="label-uppercase text-ivory/60 mb-6 tracking-[0.2em]">
              Luxury Keepsakes • Crafted to Last Forever
            </span>
            <h1
              className="font-serif text-ivory mb-8 max-w-4xl leading-[1.05]"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}
            >
              Turn your song into something you can hold forever
            </h1>
            <p className="text-xl text-ivory/85 max-w-2xl mx-auto leading-relaxed">
              A song carries emotion. We transform it into a physical piece you can see, touch and relive forever.
            </p>
          </div>
        </section>

        <section className="px-6 max-w-6xl mx-auto py-20 space-y-24">
          {products.map((product) => (
            <div key={product.id} className="grid md:grid-cols-2 gap-12 items-center">
              <div className="h-[400px] rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition duration-500">
                <img
                  src={`/images/products/${product.id}.jpg`}
                  alt={product.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover group-hover:scale-105 transition duration-700"
                />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-light mb-4">{product.title}</h2>
                <p className="text-black/60 mb-5 leading-relaxed">{product.description}</p>
                <p className="font-serif text-2xl text-gold mb-2">{product.price}</p>
                <p className="text-sm text-black/50">{product.note}</p>
                {product.id === 'vinyl' && (
                  <p className="text-xs text-black/45 mt-4">
                    MCB vinyl keepsakes are supplied exclusively as 12-inch records. Personalised production and delivery times apply.
                  </p>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="py-24 px-6 bg-espresso text-ivory">
          <div className="max-w-6xl mx-auto">
            <div className="max-w-3xl mx-auto text-center mb-14">
              <p className="label-uppercase text-gold mb-4">The MCB Journey Collection</p>
              <h2 className="font-serif text-4xl md:text-5xl mb-6">Your holiday, told one record at a time.</h2>
              <p className="text-ivory/75 text-lg leading-relaxed">
                Choose the days and memories that mattered most. We can turn each one into its own personalised 12-inch vinyl keepsake, with coordinated artwork, photographs, dates and destinations — creating a collectible musical story of your journey.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-5">
              {collectionSizes.map((option) => (
                <div key={option.count} className="border border-gold/25 rounded-2xl p-6 bg-white/5">
                  <p className="font-serif text-3xl text-gold mb-2">{option.count}</p>
                  <p className="text-sm text-ivory/80 min-h-[60px]">{option.label}</p>
                  <p className="mt-5 text-lg text-ivory">{option.price}</p>
                </div>
              ))}
            </div>

            <div className="max-w-3xl mx-auto text-center mt-12">
              <p className="text-ivory/70 leading-relaxed">
                Pick one unforgettable day or build a complete collection across your cruise or holiday. Each record can carry its own chapter while sharing one coordinated visual identity across the full set. Delivery is calculated separately for your destination.
              </p>
              <a
                href="/#order"
                className="inline-flex mt-8 items-center px-8 py-3 bg-gold text-espresso rounded-full font-medium transition-all duration-300 hover:bg-ivory hover:scale-105"
              >
                Create Your Journey Collection
              </a>
            </div>
          </div>
        </section>

        <section className="py-24 px-6 bg-white">
          <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
            <div>
              <p className="label-uppercase text-gold mb-4">The MCB Story Album™</p>
              <h2 className="font-serif text-4xl mb-6">Two records. Four sides. One extraordinary story.</h2>
              <p className="text-black/60 leading-relaxed mb-5">
                For stories that deserve a larger canvas, the MCB Story Album transforms your personalised music collection into a deluxe double 12-inch vinyl experience with up to four playable sides and a fully personalised gatefold presentation.
              </p>
              <p className="text-black/60 leading-relaxed">
                Designed for milestone anniversaries, weddings, family legacies, unforgettable journeys and once-in-a-lifetime cruises. Available as a premium upgrade for suitable Journey, Heirloom and Bespoke projects.
              </p>
              <p className="font-serif text-2xl text-gold mt-6">From £279 + delivery</p>
            </div>
            <div className="rounded-2xl border border-black/10 bg-[#FBF9F6] p-8">
              <h3 className="font-serif text-2xl mb-5">Personalise the complete story</h3>
              <ul className="space-y-3 text-black/65">
                <li>• Two full-size 12-inch records</li>
                <li>• Four playable sides</li>
                <li>• Personalised gatefold artwork</li>
                <li>• Your photographs, dates and destinations</li>
                <li>• Personalised centre labels and track listing</li>
                <li>• Optional dedication or closing message</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="py-24 px-6 bg-white text-center">
          <h2 className="text-3xl md:text-4xl font-light mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">
            <div>
              <h3 className="text-xl mb-2">1. Create Your Song</h3>
              <p className="text-black/60">Share your story and we turn it into professionally crafted music.</p>
            </div>
            <div>
              <h3 className="text-xl mb-2">2. Choose Your Keepsake</h3>
              <p className="text-black/60">Select a 12-inch vinyl, Journey Collection, artwork or another presentation.</p>
            </div>
            <div>
              <h3 className="text-xl mb-2">3. We Craft & Deliver</h3>
              <p className="text-black/60">Once your order and artwork are ready, your keepsake is individually produced and delivered.</p>
            </div>
          </div>
        </section>

        <section className="py-24 px-6 bg-[#FBF9F6] text-center">
          <h2 className="text-3xl md:text-4xl font-light mb-12">Perfect For Every Meaningful Moment</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { title: "Birthdays", img: "/images/moments/birthday.jpg" },
              { title: "Anniversaries", img: "/images/moments/anniversary.jpg" },
              { title: "Weddings", img: "/images/moments/wedding.jpg" },
              { title: "Proposals", img: "/images/moments/proposal.jpg" },
              { title: "Memorials", img: "/images/moments/memorial.jpg" },
              { title: "Cruises & Journeys", img: "/images/moments/gift.jpg" }
            ].map((item, i) => (
              <div key={i} className="group cursor-pointer">
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src={item.img}
                    alt={item.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-[200px] object-cover group-hover:scale-105 transition duration-500"
                  />
                  <div className="absolute inset-0 bg-black/30" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <h3 className="text-white text-lg tracking-wide">{item.title}</h3>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 text-center max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-light mb-6">Made Individually for Your Story</h2>
          <p className="text-black/60 leading-relaxed">
            Every MCB keepsake is individually personalised and produced after you order — preserving your story without mass-produced inventory.
          </p>
        </section>

        <section className="text-center py-32 px-6 border-t border-black/10">
          <h2 className="text-4xl font-light mb-6">Create Something They’ll Never Forget</h2>
          <p className="text-black/60 max-w-xl mx-auto mb-10">Start with your song. We’ll bring it to life.</p>
          <a
            href="/#order"
            className="inline-flex items-center gap-3 px-8 py-3 bg-gold text-espresso rounded-full font-medium transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
          >
            Begin Your Story
          </a>
          <p className="mt-3 text-sm text-black/60 italic">
            Physical keepsakes are made to order. Delivery is calculated for your destination.
          </p>
        </section>
      </div>
    </>
  );
};

export default Products;
