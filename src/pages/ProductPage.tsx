/**
 * PRODUCT PAGE — one component for /moment, /keepsake and /journey.
 *
 * Every word of commercial substance on this page — name, positioning,
 * description, variant labels, prices, song counts, features, disclosures,
 * timing and CTA — is read from the canonical catalogue. Nothing here states
 * a price or a product fact of its own, so the page cannot drift from what
 * the server charges.
 *
 * The CTA hands the choice to the homepage order form through the query
 * string (`?product=<id>&sku=<sku>#order`); the order form reads it.
 */

import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import {
  formatMoney,
  priceSummary,
  requireProduct,
  type ProductId,
  type Variant,
} from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";

type ProductPageId = Extract<ProductId, "moment" | "keepsake" | "journey">;

const orderHref = (productId: ProductId, sku?: string) => {
  const params = new URLSearchParams({ product: productId });
  if (sku) params.set("sku", sku);
  return `/?${params.toString()}#order`;
};

const songLine = (variant: Variant) =>
  variant.songCount === null
    ? null
    : variant.songCount === 1
      ? "1 song"
      : `${variant.songCount} songs`;

const ProductPage = ({ productId }: { productId: ProductPageId }) => {
  const product = requireProduct(productId);
  const single = product.variants.length === 1;
  const summary = priceSummary(product);

  return (
    <main className="min-h-screen bg-[#FBF9F6] text-espresso">
      <Helmet>
        <title>{`${product.name} — ${product.positioning} | My Custom Beats`}</title>
        <meta
          name="description"
          content={`${product.shortDescription} ${summary}.`}
        />
        <script type="application/ld+json">
          {JSON.stringify(productPageStructuredData(product.id))}
        </script>
      </Helmet>

      {/* ---- Opening --------------------------------------------------- */}
      <section className="px-6 pt-20 pb-12 md:pt-28 md:pb-16">
        <div className="max-w-4xl mx-auto text-center">
          <p className="label-uppercase text-gold mb-4">{product.name}</p>
          <h1
            className="text-4xl md:text-6xl font-light mb-6"
            style={{ fontFamily: "Playfair Display, serif" }}
          >
            {product.positioning}
          </h1>
          <p className="text-lg md:text-xl text-espresso/70 leading-relaxed max-w-2xl mx-auto">
            {product.shortDescription}
          </p>

          {product.disclosures.length > 0 && (
            <ul className="mt-8 list-none p-0 m-0 space-y-2">
              {product.disclosures.map((disclosure) => (
                <li
                  key={disclosure}
                  className="inline-flex items-center rounded-full border border-gold/50 bg-gold/10 px-5 py-2 text-sm font-medium text-espresso"
                >
                  {disclosure}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ---- Variants -------------------------------------------------- */}
      <section
        aria-labelledby="product-options"
        className="px-6 pb-20 md:pb-28"
      >
        <div className="max-w-6xl mx-auto">
          <h2 id="product-options" className="sr-only">
            {single ? `What ${product.name} includes` : `Choose your ${product.name}`}
          </h2>

          <ul
            className={`grid gap-6 lg:gap-8 list-none p-0 m-0 ${
              single
                ? "max-w-xl mx-auto"
                : product.variants.length === 2
                  ? "md:grid-cols-2 max-w-4xl mx-auto"
                  : "sm:grid-cols-2 lg:grid-cols-4"
            }`}
          >
            {product.variants.map((variant) => {
              const songs = songLine(variant);
              return (
                <li key={variant.sku}>
                  <article className="h-full flex flex-col rounded-3xl bg-white shadow-luxury p-7 md:p-8">
                    <h3
                      className="text-2xl mb-2"
                      style={{ fontFamily: "Playfair Display, serif" }}
                    >
                      {variant.label}
                    </h3>
                    <p className="text-3xl font-light text-espresso">
                      {formatMoney(variant.price)}
                    </p>
                    {songs && (
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold-deep mt-2">
                        {songs}
                      </p>
                    )}

                    {variant.features.length > 0 && (
                      <ul className="mt-6 space-y-2.5 list-none p-0 m-0 flex-1">
                        {variant.features.map((feature) => (
                          <li key={feature} className="flex gap-2.5">
                            <Check
                              size={15}
                              className="text-gold-deep mt-1 shrink-0"
                              aria-hidden="true"
                            />
                            <span className="text-sm text-espresso/70 leading-snug">
                              {feature}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}

                    <Link
                      to={orderHref(product.id, variant.sku)}
                      className="mt-8 inline-flex justify-center items-center rounded-full bg-gold px-7 py-3 text-espresso font-medium transition hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
                    >
                      {product.cta}
                      <span className="sr-only">{` — ${variant.name}`}</span>
                    </Link>
                  </article>
                </li>
              );
            })}
          </ul>

          {/* ---- Terms that apply to every option ---------------------- */}
          <dl className="mt-12 max-w-3xl mx-auto grid gap-4 sm:grid-cols-2 text-sm">
            {product.turnaround && (
              <div className="rounded-2xl border border-espresso/10 bg-white px-6 py-5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45 mb-1.5">
                  Timing
                </dt>
                <dd className="m-0 text-espresso/70 leading-relaxed">
                  {product.turnaround.label}
                </dd>
              </div>
            )}
            {product.revisions && (
              <div className="rounded-2xl border border-espresso/10 bg-white px-6 py-5">
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45 mb-1.5">
                  Refinements
                </dt>
                <dd className="m-0 text-espresso/70 leading-relaxed">
                  {product.revisions}
                </dd>
              </div>
            )}
          </dl>

          <p className="mt-10 text-center text-sm text-espresso/55">
            Not sure which is right?{" "}
            <Link to="/#packages" className="underline underline-offset-4 hover:text-gold-deep">
              Compare every experience
            </Link>
            .
          </p>
        </div>
      </section>
    </main>
  );
};

export default ProductPage;
