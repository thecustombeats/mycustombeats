
import { Helmet } from "react-helmet-async";
import { stockedFamilies, relatedFamilies } from "../data/catalogue";
import CatalogueFamily from "../components/CatalogueFamily";
import { canonical, productsPageStructuredData } from "../lib/seo";

/**
 * Families with an approved product, in catalogue order.
 *
 * Families with none — Digital Players, Portable Gramophones, the
 * Mobile-phone Gramophone and Frames — are not given a block of their own.
 * They still appear by name wherever a relationship names them, which is
 * honest about what exists without inventing a product to photograph.
 */
const FAMILIES = stockedFamilies();

/**
 * Approved families with nothing catalogued yet, discovered through the
 * relationship map rather than listed here, so this cannot drift out of step
 * with the catalogue.
 */
const AWAITED_FAMILIES = FAMILIES.flatMap((family) =>
  relatedFamilies(family.id).filter((related) => related.products.length === 0)
).filter(
  (family, index, all) =>
    all.findIndex((candidate) => candidate.id === family.id) === index
);


const Products = () => {
  
  return (
    <>
      <Helmet>
        <title>Music Keepsakes — Vinyl, Frames, Memory Boxes & Cards | My Custom Beats</title>
        <meta
          name="description"
          content="Turn your personalised song into something you can hold: vinyl in 7, 10 and 12-inch, CD, lyrics frames, engraved plaques, luxury memory boxes and gift pop-up cards."
        />
        <meta property="og:title" content="Music Keepsakes | My Custom Beats" />
        <meta
          property="og:description"
          content="Vinyl, CD, lyrics frames, engraved plaques, luxury memory boxes and gift pop-up cards — your song, made physical."
        />
        <meta property="og:url" content={canonical("/products")} />
        <script type="application/ld+json">
          {JSON.stringify(productsPageStructuredData())}
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


        {/* PRODUCTS — every family rendered from catalogue data. */}
        <section className="px-6 max-w-6xl mx-auto py-20 space-y-20 md:space-y-24">
          {FAMILIES.map((family, index) => (
            <CatalogueFamily
              key={family.id}
              family={family}
              reverse={index % 2 === 1}
            />
          ))}

          {/* Approved product lines with no catalogue yet. Named, because
              they are a real part of the ecosystem, but given no price,
              photograph or specification that has not been supplied. */}
          {AWAITED_FAMILIES.length > 0 && (
            <div className="border-t border-black/10 pt-14">
              <h2 className="text-2xl md:text-3xl font-light mb-3">
                Also part of the collection
              </h2>
              <p className="text-black/60 mb-10 max-w-2xl leading-relaxed">
                Ways to play what you make. Each is produced individually —
                talk to us about what you have in mind.
              </p>

              {/*
                Each card is the artwork alone. These images carry their own
                title and description inside them, matching the catalogue copy
                exactly, so repeating the words underneath would print them
                twice. The heading stays in the markup for structure and
                screen readers, visually hidden.

                object-contain, not cover: the titles are printed near the
                bottom edge of the artwork and a crop could clip them.
              */}
              <ul className="grid sm:grid-cols-2 gap-6 lg:gap-8 list-none p-0 m-0">
                {AWAITED_FAMILIES.map((family) => (
                  <li key={family.id}>
                    <article className="h-full rounded-2xl border border-black/10 bg-white overflow-hidden">
                      <h3 className="sr-only">{family.name}</h3>
                      {family.image ? (
                        <img
                          src={family.image}
                          alt={family.alt ?? family.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-auto block"
                        />
                      ) : (
                        <div className="p-6">
                          <p className="text-lg font-light mb-2">{family.name}</p>
                          <p className="text-sm text-black/60 leading-relaxed">
                            {family.description}
                          </p>
                        </div>
                      )}
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 px-6 py-4 border-t border-black/5">
                        Enquire for availability
                      </p>
                    </article>
                  </li>
                ))}
              </ul>
            </div>
          )}

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
            Create Your Memory
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