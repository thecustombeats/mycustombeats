import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import {
  BESPOKE,
  JOURNEY,
  KEEPSAKE,
  LYRICS_FRAME,
  MOMENT,
  PERSONALISED_MUSIC_PLAQUE,
  PRIORITY_REPLACEMENT,
  formatMoney,
  priceSummary,
  publicProducts,
  type Product,
} from "../data/catalogue";
import { PACKAGE_IMAGERY, PRODUCT_IMAGERY } from "../data/imagery";
import ResponsiveImage from "../components/ResponsiveImage";
import FormatVisual from "../components/FormatVisual";
import SectionHeading from "../components/mcb/SectionHeading";
import { McbButtonLink } from "../components/mcb/McbButton";
import { DELIVERY_NOTE, priorityReplacementLine } from "../lib/productDetail";
import { PRODUCTS_DESCRIPTION, productsPageStructuredData } from "../lib/seo";

/**
 * /products — the collection.
 *
 * The four experiences first, each linking to its own page; then a small,
 * curated set of pieces to keep alongside a song. Names, descriptions,
 * prices, sizes and disclosures are read from `data/catalogue`; nothing
 * commercial is written in this file. Products that are not sold to consumers
 * online (the DJ guide, stored value) are not shown here.
 */

const FAMILIES: readonly Product[] = [MOMENT, KEEPSAKE, JOURNEY, BESPOKE].filter((p) => p.active && p.public);

const listed = (product: Product) => product.active && product.public && product.onlineCheckout;

const PLAQUE = listed(PERSONALISED_MUSIC_PLAQUE) ? PERSONALISED_MUSIC_PLAQUE : null;
const FRAMES = listed(LYRICS_FRAME) ? LYRICS_FRAME : null;
const PLAYERS = publicProducts().filter((p) => p.category === "PLAYER" && p.onlineCheckout);

/** What a customer provides for the plaque. Matches the order flow's fields. */
const PLAQUE_FIELDS = ["A photograph", "A song title", "The artist"];

const linkClass =
  "inline-flex min-h-12 items-center gap-2 text-base font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

const FamilyCard = ({ product }: { product: Product }) => {
  const photo = PACKAGE_IMAGERY[product.id as keyof typeof PACKAGE_IMAGERY];
  return (
    <li className="flex">
      <article className="flex w-full flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white">
        {photo && (
          <ResponsiveImage image={photo} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="aspect-[4/3] w-full object-cover" alt="" />
        )}
        <div className="flex flex-1 flex-col p-6">
          <h3 className="font-serif text-3xl leading-tight text-ink">{product.name}</h3>
          <p className="mt-2 text-base leading-relaxed text-espresso/80">{product.positioning}</p>
          <p className="mt-4 font-mono text-lg text-ink">{priceSummary(product)}</p>
          {product.route && (
            <Link to={product.route} className={`${linkClass} mt-auto pt-4`}>
              {`Explore ${product.name}`}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      </article>
    </li>
  );
};

const Disclosures = ({ product }: { product: Product }) =>
  product.disclosures.length > 0 ? (
    <ul className="m-0 mt-4 list-none space-y-2 p-0">
      {product.disclosures.map((disclosure) => (
        <li key={disclosure} className="border-l-2 border-gold pl-3 text-base leading-relaxed text-ink">
          {disclosure}
        </li>
      ))}
    </ul>
  ) : null;

const Products = () => {
  const priority = priorityReplacementLine();
  const frameImage = PRODUCT_IMAGERY["lyrics-frame"];

  return (
    <>
      <Helmet>
        <title>Personalised Songs, Decor & Players | My Custom Beats</title>
        <meta name="description" content={PRODUCTS_DESCRIPTION} />
        <meta property="og:title" content="Products | My Custom Beats" />
        <meta property="og:description" content={PRODUCTS_DESCRIPTION} />
        <script type="application/ld+json">{JSON.stringify(productsPageStructuredData())}</script>
      </Helmet>

      <div className="bg-ivory text-espresso">
        {/* ---- Opening ---------------------------------------------------- */}
        <section className="px-5 pb-12 pt-28 sm:px-8 md:pb-16 md:pt-36">
          <div className="mx-auto max-w-3xl text-center">
            <p className="label-uppercase text-gold-deep">The collection</p>
            <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">Choose how your memory is kept.</h1>
            <p className="mt-6 text-lg leading-relaxed text-espresso/80">
              Every order begins with a personalised song made from your story. Then, if you would like, add something to display it or play it.
            </p>
          </div>
        </section>

        {/* ---- The four experiences --------------------------------------- */}
        <section aria-labelledby="experiences" className="px-5 pb-20 sm:px-8 md:pb-28">
          <div className="mx-auto max-w-6xl">
            <h2 id="experiences" className="sr-only">
              The experiences
            </h2>
            <ul className="m-0 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {FAMILIES.map((product) => (
                <FamilyCard key={product.id} product={product} />
              ))}
            </ul>
          </div>
        </section>

        {/* ---- Curated additions ------------------------------------------ */}
        <section aria-labelledby="additions" className="bg-[#F1ECE3] px-5 py-20 sm:px-8 md:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              id="additions"
              eyebrow="Curated additions"
              title="Pieces to keep alongside your song"
              intro={
                <p>
                  A few things chosen to live with the music. Add-ons are ordered alongside a song experience — you add them when you create your memory.
                </p>
              }
            />

            <div className="mt-14 grid gap-6 lg:grid-cols-2">
              {PLAQUE && PLAQUE.variants[0] && (
                <article aria-labelledby="plaque" className="flex flex-col rounded-3xl bg-white p-6 sm:flex-row sm:gap-8 md:p-8">
                  <div className="mx-auto w-40 shrink-0 sm:mx-0" aria-hidden="true">
                    <FormatVisual product={PLAQUE} variant={PLAQUE.variants[0]} className="h-auto w-full" />
                  </div>
                  <div className="mt-6 min-w-0 sm:mt-0">
                    <h3 id="plaque" className="font-serif text-3xl leading-tight text-ink">
                      {PLAQUE.name}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-espresso/80">{PLAQUE.positioning}</p>
                    <p className="mt-4 text-base font-semibold text-ink">You provide</p>
                    <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
                      {PLAQUE_FIELDS.map((field) => (
                        <li key={field} className="rounded-full border border-ink/15 px-4 py-2 text-base text-ink">
                          {field}
                        </li>
                      ))}
                    </ul>
                    <Disclosures product={PLAQUE} />
                    <p className="mt-5 font-mono text-xl text-ink">{formatMoney(PLAQUE.variants[0].price)}</p>
                    <p className="mt-1 text-base text-espresso/80">{DELIVERY_NOTE}</p>
                  </div>
                </article>
              )}

              {FRAMES && (
                <article aria-labelledby="frames" className="flex flex-col rounded-3xl bg-white p-6 sm:flex-row sm:gap-8 md:p-8">
                  {frameImage && (
                    <div className="mx-auto w-40 shrink-0 overflow-hidden rounded-2xl sm:mx-0">
                      <ResponsiveImage image={frameImage} sizes="160px" className="aspect-square w-full object-cover" />
                    </div>
                  )}
                  <div className="mt-6 min-w-0 flex-1 sm:mt-0">
                    <h3 id="frames" className="font-serif text-3xl leading-tight text-ink">
                      {FRAMES.name}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-espresso/80">{FRAMES.positioning}</p>
                    <p className="mt-4 text-base font-semibold text-ink">{`${FRAMES.variants.length} sizes`}</p>
                    <ul className="m-0 mt-2 list-none divide-y divide-ink/10 p-0">
                      {FRAMES.variants.map((variant) => (
                        <li key={variant.sku} className="flex items-baseline justify-between gap-4 py-2">
                          <span className="text-base text-ink">{variant.label}</span>
                          <span className="font-mono text-base text-ink">{formatMoney(variant.price)}</span>
                        </li>
                      ))}
                    </ul>
                    <Disclosures product={FRAMES} />
                    <p className="mt-4 text-base text-espresso/80">{DELIVERY_NOTE}</p>
                  </div>
                </article>
              )}
            </div>

            {PLAYERS.length > 0 && (
              <div className="mt-16">
                <h3 className="font-serif text-3xl leading-tight text-ink">To play it</h3>
                <ul className="m-0 mt-6 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
                  {PLAYERS.map((player) => {
                    const photo = PRODUCT_IMAGERY[player.id];
                    const variant = player.variants[0];
                    return (
                      <li key={player.id} className="flex">
                        <article className="flex w-full flex-col overflow-hidden rounded-3xl bg-white">
                          {photo && (
                            <div className="bg-ivory p-4">
                              <ResponsiveImage image={photo} sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw" className="aspect-[3/2] w-full object-contain" />
                            </div>
                          )}
                          <div className="flex flex-1 flex-col p-6">
                            <h4 className="font-serif text-2xl leading-tight text-ink">{player.name}</h4>
                            <p className="mt-2 text-base leading-relaxed text-espresso/80">{player.shortDescription}</p>
                            <Disclosures product={player} />
                            <div className="mt-auto pt-4">
                              {variant && <p className="font-mono text-xl text-ink">{formatMoney(variant.price)}</p>}
                              <p className="mt-1 text-base text-espresso/80">{DELIVERY_NOTE}</p>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="mt-14 flex flex-col items-center gap-4 text-center">
              <McbButtonLink to="/create">Create Your Memory</McbButtonLink>
              <p className="max-w-xl text-base text-espresso/80">Choose your song experience first. You can add any of these pieces before you review your order.</p>
            </div>
          </div>
        </section>

        {/* ---- Quiet notes -------------------------------------------------- */}
        <section className="px-5 py-16 sm:px-8 md:py-20">
          <div className="mx-auto grid max-w-5xl gap-8 md:grid-cols-2">
            {priority && (
              <div className="rounded-3xl border border-ink/10 bg-white p-6 md:p-8">
                <h2 className="font-serif text-2xl leading-tight text-ink md:text-3xl">{PRIORITY_REPLACEMENT.name}</h2>
                <p className="mt-3 text-base leading-relaxed text-espresso/80">{PRIORITY_REPLACEMENT.positioning}</p>
                <p className="mt-2 text-base leading-relaxed text-espresso/80">{priority}</p>
                <Link to="/priority-replacement" className={`${linkClass} mt-2`}>
                  How it works
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </div>
            )}
            <div className="rounded-3xl bg-ink p-6 text-ivory md:p-8">
              <h2 className="font-serif text-2xl leading-tight !text-ivory md:text-3xl">When your idea doesn’t fit inside a box</h2>
              <p className="mt-3 text-base leading-relaxed text-ivory/85">{`${BESPOKE.name} is shaped around one person and ${BESPOKE.disclosures.join(" ").toLowerCase()}.`}</p>
              <Link
                to="/bespoke"
                className="mt-2 inline-flex min-h-12 items-center gap-2 text-base font-semibold text-gold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                {`Explore ${BESPOKE.name}`}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default Products;
