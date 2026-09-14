import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import {
  PRIORITY_REPLACEMENT,
  formatMoney,
  priceSummary,
  publicProducts,
  type Category,
  type Product,
} from "../data/catalogue";
import KeepsakeMark from "../components/KeepsakeMark";
import { PRODUCTS_DESCRIPTION, productsPageStructuredData } from "../lib/seo";

/**
 * /products — every public, active product in the canonical catalogue,
 * grouped by category. Names, descriptions, prices, sizes, song counts and
 * disclosures are all read from `data/catalogue`; nothing commercial is
 * written in this file.
 *
 * Products without a public page or checkout of their own (education, stored
 * value) are excluded by the catalogue flags, not by id.
 */
const GROUPS: readonly { category: Category; title: string; intro: string }[] = [
  {
    category: "SONG_EXPERIENCE",
    title: "Song experiences",
    intro: "Every order begins with a personalised song made from your story.",
  },
  {
    category: "COMMISSION",
    title: "Individually curated",
    intro: "For something shaped entirely around one person.",
  },
  {
    category: "PERSONALISED_DECOR",
    title: "Personalised decor",
    intro: "Pieces made to display, designed from your photograph, song or lyrics.",
  },
  {
    category: "PLAYER",
    title: "Players",
    intro: "Ways to play the records you keep.",
  },
  {
    category: "LIVE_PERFORMANCE",
    title: "Live",
    intro: "For selected events.",
  },
];

const PUBLIC = publicProducts();

const productsIn = (category: Category) =>
  PUBLIC.filter((product) => product.category === category);

const songsLabel = (count: number | null) =>
  count === null ? null : count === 1 ? "1 song" : `${count} songs`;

const orderHref = (product: Product) =>
  product.route ?? `/?product=${encodeURIComponent(product.id)}#order`;

const ProductBlock = ({ product, reverse }: { product: Product; reverse: boolean }) => {
  const listsVariants = product.variants.length > 1;
  const single = product.variants.length === 1 ? product.variants[0] : null;
  const dimensions = single?.dimensions;

  return (
    <article className="grid md:grid-cols-2 gap-10 lg:gap-12 items-center">
      <div
        className={`rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition duration-500 ${
          product.image ? "aspect-[3/2]" : "h-[280px] sm:h-[360px]"
        } ${reverse ? "md:order-2" : ""}`}
      >
        {product.image ? (
          <img
            src={product.image}
            alt={product.imageAlt ?? product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-ivory border border-espresso/10 rounded-2xl p-10">
            <KeepsakeMark name={product.name} />
          </div>
        )}
      </div>

      <div className={`min-w-0 ${reverse ? "md:order-1" : ""}`}>
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-deep mb-3">
          {product.positioning}
        </p>
        <h3 className="text-3xl md:text-4xl font-light mb-4">{product.name}</h3>
        <p className="text-black/60 mb-6 leading-relaxed">{product.shortDescription}</p>

        {listsVariants && (
          <ul className="space-y-3 list-none p-0 m-0">
            {product.variants.map((variant) => (
              <li
                key={variant.sku}
                className="flex items-baseline justify-between gap-4 border-b border-black/5 pb-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-black">{variant.label}</span>
                  {songsLabel(variant.songCount) && (
                    <span className="block text-xs text-black/50">
                      {songsLabel(variant.songCount)}
                    </span>
                  )}
                </span>
                <span className="text-sm text-black shrink-0">{formatMoney(variant.price)}</span>
              </li>
            ))}
          </ul>
        )}

        {single && single.features.length > 0 && (
          <ul className="space-y-2 list-none p-0 m-0">
            {single.features.map((feature) => (
              <li key={feature} className="flex gap-2.5 text-sm text-black/70">
                <Check size={15} className="text-gold-deep mt-0.5 shrink-0" aria-hidden="true" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        {dimensions && (
          <p className="mt-4 text-sm text-black/60">
            {`${dimensions.approximate ? "Approx. " : ""}${dimensions.widthInches} × ${dimensions.heightInches} inches`}
          </p>
        )}

        {product.disclosures.length > 0 && (
          <ul className="mt-5 space-y-1.5 list-none p-0 m-0">
            {product.disclosures.map((disclosure) => (
              <li key={disclosure} className="text-sm font-medium text-black/75 leading-relaxed">
                {disclosure}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-7 space-y-1">
          <p className="text-xl font-light text-black">{priceSummary(product)}</p>
          {product.turnaround && (
            <p className="font-mono text-xs text-black/50">{product.turnaround.label}</p>
          )}
        </div>

        <Link
          to={orderHref(product)}
          className="mt-6 inline-flex items-center rounded-full bg-gold px-7 py-3 text-espresso font-medium transition hover:scale-[1.02]"
        >
          {product.route ? `Explore ${product.name}` : product.cta}
        </Link>
      </div>
    </article>
  );
};

const Products = () => {
  return (
    <>
      <Helmet>
        <title>Personalised Songs, Decor & Players | My Custom Beats</title>
        <meta name="description" content={PRODUCTS_DESCRIPTION} />
        <meta property="og:title" content="Products | My Custom Beats" />
        <meta property="og:description" content={PRODUCTS_DESCRIPTION} />
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


        {/* PRODUCTS — every public product, grouped, from catalogue data. */}
        <section className="px-6 max-w-6xl mx-auto py-20 space-y-24">
          {GROUPS.map((group) => {
            const products = productsIn(group.category);
            if (products.length === 0) return null;
            return (
              <div key={group.category}>
                <div className="mb-12 max-w-2xl">
                  <h2 className="text-3xl md:text-4xl font-light mb-3">{group.title}</h2>
                  <p className="text-black/60 leading-relaxed">{group.intro}</p>
                </div>
                <div className="space-y-20 md:space-y-24">
                  {products.map((product, index) => (
                    <ProductBlock key={product.id} product={product} reverse={index % 2 === 1} />
                  ))}
                </div>
              </div>
            );
          })}

          {/* Protection — a service, not a product to display. */}
          {PRIORITY_REPLACEMENT.active && PRIORITY_REPLACEMENT.public && (
            <div className="border-t border-black/10 pt-14 max-w-3xl">
              <h2 className="text-2xl md:text-3xl font-light mb-3">{PRIORITY_REPLACEMENT.name}</h2>
              <p className="text-black/60 mb-4 leading-relaxed">{PRIORITY_REPLACEMENT.positioning}</p>
              <p className="text-sm text-black/70 mb-6">
                {`${priceSummary(PRIORITY_REPLACEMENT)} · ${PRIORITY_REPLACEMENT.variants[0]?.label ?? ""}`}
              </p>
              <Link
                to="/priority-replacement"
                className="text-sm text-gold-deep underline underline-offset-4 hover:text-espresso"
              >
                How Priority Replacement works
              </Link>
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
        Select how you want your song to live — a record, a frame or more.
      </p>
    </div>

    <div>
      <h3 className="text-xl mb-2">3. We Craft & Deliver</h3>
      <p className="text-black/60">
        Your piece is made to order and delivered as a timeless memory.
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
    Every piece is personalised and made to order for you — so your story is
    preserved with the care it deserves.
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

          <Link
  to="/#order"
  className="inline-flex items-center gap-3 px-8 py-3 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl"
>
  Begin your order
</Link>

<p className="mt-3 text-sm text-black/60">
  Planning something individually curated?{" "}
  <Link to="/bespoke" className="underline underline-offset-4">Request a Bespoke quote</Link>
</p>
        </section>
      </div>
    </>
  );
};

export default Products;