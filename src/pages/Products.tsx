
import { Helmet } from "react-helmet-async";
import { KEEPSAKES } from "../data/keepsakes";
import { canonical, breadcrumbStructuredData } from "../lib/seo";


const Products = () => {
  
  return (
    <>
      <Helmet>
        <title>Music Keepsakes — Vinyl, CD, Artwork & Plaques | My Custom Beats</title>
        <meta
          name="description"
          content="Turn your personalised song into something you can hold: 12-inch vinyl, CD, framed lyric artwork, engraved plaques, memory boxes and music cards."
        />
        <meta property="og:title" content="Music Keepsakes | My Custom Beats" />
        <meta
          property="og:description"
          content="Vinyl, CD, framed lyric artwork, engraved plaques, memory boxes and music cards — your song, made physical."
        />
        <meta property="og:url" content={canonical("/products")} />
        <script type="application/ld+json">
          {JSON.stringify(
            breadcrumbStructuredData([{ name: "Keepsakes", path: "/products" }])
          )}
        </script>
      </Helmet>

      <div className="bg-[#FBF9F6] text-black">
        

        {/* PRODUCT HERO — MATCHED STYLE */}
<section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden">

  {/* VIDEO */}
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

  {/* SAME OVERLAY STYLE */}
  <div className="absolute inset-0 bg-gradient-to-t from-espresso/80 via-espresso/50 to-espresso/30 backdrop-blur-[2px]" />

  {/* CONTENT */}
  <div className="relative z-10 text-center px-6">

    <span className="label-uppercase text-ivory/60 mb-6 tracking-[0.2em]">
      Luxury Keepsakes • Crafted to Last Forever
    </span>

    <h1 className="font-serif text-ivory mb-8 max-w-4xl leading-[1.05]"
      style={{ fontSize: 'clamp(2.5rem, 6vw, 4.5rem)' }}>
      Turn your song into something you can hold forever
    </h1>

    <p className="text-xl text-ivory/85 max-w-2xl mx-auto leading-relaxed">
      A song carries emotion. We transform it into a physical piece you can see, touch and relive forever.
    </p>

  </div>
</section>


        {/* PRODUCTS */}
        <section className="px-6 max-w-6xl mx-auto py-20 space-y-24">
          {KEEPSAKES.map((product) => (
            <div
              key={product.id}
              className="grid md:grid-cols-2 gap-12 items-center"
            >
             
              {/* IMAGE — or a typographic panel where no photograph exists.
                  Never substitute a stand-in image for a real product. */}
              <div className="h-[400px] rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition duration-500">
                {product.image ? (
                  <img
                    src={product.image}
                    alt={product.title}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition duration-700"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-ivory border border-espresso/10 rounded-2xl px-8 text-center">
                    <span className="font-serif text-5xl text-espresso/80">
                      {product.title}
                    </span>
                    <span className="h-px w-10 bg-gold/60 my-5" aria-hidden="true" />
                    <span className="label-uppercase text-espresso/40">
                      Available at checkout
                    </span>
                  </div>
                )}
              </div>

              {/* CONTENT */}
              <div> 
                <h2 className="text-3xl md:text-4xl font-light mb-4">
                  {product.title}
                </h2>

                <p className="text-black/60 mb-6 leading-relaxed">
                  {product.description}
                </p>

                <p className="italic text-sm mb-6 text-black/50">
                  Each piece is custom made — enquire for pricing
                </p>

<p className="text-xs text-black/50 mt-1">
  Based on quantity, design & personalization
</p>

              </div>
            </div>
          ))}
        </section>


{/* ⚙️ How it works */}

<section className="py-24 px-6 bg-white text-center">
  <h2 className="text-3xl md:text-4xl font-light mb-12">
    How It Works
  </h2>

  <div className="grid md:grid-cols-3 gap-10 max-w-5xl mx-auto">

    <div>
      <h3 className="text-xl mb-2">1. Create Your Song</h3>
      <p className="text-black/60">
        Share your story and we turn it into a professionally crafted song.
      </p>
    </div>

    <div>
      <h3 className="text-xl mb-2">2. Choose Your Keepsake</h3>
      <p className="text-black/60">
        Select how you want your song to live — vinyl, artwork or more.
      </p>
    </div>

    <div>
      <h3 className="text-xl mb-2">3. We Craft & Deliver</h3>
      <p className="text-black/60">
        Your piece is handcrafted and delivered as a timeless memory.
      </p>
    
    </div>

  </div>
</section>

{/* 💖 Moments */}

<section className="py-24 px-6 bg-[#FBF9F6] text-center">

  <h2 className="text-3xl md:text-4xl font-light mb-12">
    Perfect For Every Meaningful Moment
  </h2>

  <div className="grid grid-cols-2 md:grid-cols-3 gap-8 max-w-5xl mx-auto">

    {[
      { title: "Birthdays", img: "/images/moments/birthday.jpg" },
      { title: "Anniversaries", img: "/images/moments/anniversary.jpg" },
      { title: "Weddings", img: "/images/moments/wedding.jpg" },
      { title: "Proposals", img: "/images/moments/proposal.jpg" },
      { title: "Memorials", img: "/images/moments/memorial.jpg" },
      { title: "Luxury Gifts", img: "/images/moments/gift.jpg" },
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
            <h3 className="text-white text-lg tracking-wide">
              {item.title}
            </h3>
            
          </div>

        </div>

      </div>
    ))}

  </div>

</section>

<section className="py-24 text-center max-w-4xl mx-auto px-6">
  <h2 className="text-3xl font-light mb-6">
    Crafted, Not Manufactured
  </h2>

  <p className="text-black/60 leading-relaxed">
    Every piece is individually designed, produced, and finished by hand —
    ensuring your story is preserved with the care it deserves.
  </p>
</section>


        {/* CTA */}
        <section className="text-center py-32 px-6 border-t border-black/10">
          <h2 className="text-4xl font-light mb-6">
            Create Something They’ll Never Forget
          </h2>

          <p className="text-black/60 max-w-xl mx-auto mb-10">
            Start with your song. We’ll bring it to life.
          </p>

          <a
  href = "/#contact"
  className="inline-flex items-center gap-3 px-8 py-3 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
>
  Request Custom Quote
</a>

<p className="mt-3 text-sm text-black/60 italic">
  Pricing depends on design, materials & customization
</p>
        </section>
      </div>
    </>
  );
};

export default Products;