/**
 * PRODUCT PAGE — one component for /moment, /keepsake and /journey.
 *
 * Every word of commercial substance on this page — name, positioning,
 * description, variant labels, prices, song counts, features, disclosures,
 * timing and CTA destination — is read from the canonical catalogue (directly
 * or through `lib/productDetail` and `lib/formatText`). Nothing here states a
 * price or a product fact of its own, so the page cannot drift from what the
 * server charges.
 *
 * The CTA hands the selected variant to the guided order flow:
 * `/create?sku=<sku>`.
 */

import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import {
  KEEPSAKE,
  MOMENT,
  JOURNEY,
  STANDARD_VINYL_NOT_PICTURE_DISC,
  formatMoney,
  priceSummary,
  requireProduct,
  type Product,
  type ProductId,
  type Variant,
} from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";
import { trackFunnel } from "../lib/analytics";
import { formatLine, songsLabel } from "../lib/formatText";
import {
  DELIVERY_NOTE,
  createHref,
  initialVariantSku,
  isPhysical,
  personalisationSteps,
  priorityReplacementLine,
  productCtaLabel,
  vinylIncludedLine,
} from "../lib/productDetail";
import VariantSelector from "../components/VariantSelector";
import { McbButtonLink } from "../components/mcb/McbButton";
import ProductHeroVisual from "../components/product/ProductHeroVisual";
import ResponsiveImage from "../components/ResponsiveImage";
import { IMAGES } from "../data/imagery";
import RefinementOrRemake from "../components/product/RefinementOrRemake";
import { PRODUCT_PAGE_ANSWERS } from "../lib/productAnswers";

type ProductPageId = Extract<ProductId, "moment" | "keepsake" | "journey">;

/** Inspiration only — never required categories. */
const KEEPSAKE_DAY_EXAMPLES = ["Day 1 — Sailaway", "Day 3 — First Port", "Day 5 — Formal Night", "Day 8 — Sunset at Sea"];

const sectionHeading = "font-serif text-3xl leading-tight text-ink md:text-4xl";
const bodyText = "text-base leading-relaxed text-espresso/80 md:text-lg";

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

const JourneyVinylNote = ({ variant }: { variant: Variant }) => (
  <div className="rounded-2xl border-l-4 border-gold bg-ink px-5 py-4 text-ivory">
    <p className="text-base font-semibold text-ivory">{STANDARD_VINYL_NOT_PICTURE_DISC}</p>
    <p className="mt-1 text-base leading-relaxed text-ivory/85">{vinylIncludedLine(variant)}</p>
  </div>
);

const FeatureList = ({ features }: { features: readonly string[] }) => (
  <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
    {features.map((feature) => (
      <li key={feature} className="flex gap-3 rounded-xl bg-white px-4 py-3">
        <Check size={20} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
        <span className="text-base leading-snug text-ink">{feature}</span>
      </li>
    ))}
  </ul>
);

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

const ProductDetail = ({ product }: { product: Product }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sku, setSku] = useState(() => initialVariantSku(product, searchParams.get("sku")));
  const variant = product.variants.find((v) => v.sku === sku) ?? product.variants[0];
  const choosable = product.commercialModel === "VARIANT_FIXED" && product.variants.length > 1;

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackFunnel("package_view", { product_id: product.id, location: "product_page" });
  }, [product.id]);

  if (!variant) return null;

  const chooseVariant = (next: string) => {
    setSku(next);
    trackFunnel("variant_select", { product_id: product.id, sku: next, location: "product_page" });
    // Keep the address shareable and the back button honest. Search changes do
    // not scroll the page (ScrollToTop listens to pathname and hash only).
    const params = new URLSearchParams(searchParams);
    params.set("sku", next);
    setSearchParams(params, { replace: true });
  };

  const selectPackage = () =>
    trackFunnel("package_select", { product_id: product.id, sku: variant.sku, location: "product_page" });

  const cta = productCtaLabel(product);
  const songs = songsLabel(variant.songCount);
  const format = formatLine(variant);
  const physical = isPhysical(variant);
  const steps = personalisationSteps(product, variant);
  const priority = product.id === "keepsake" && variant.priorityReplacementEligible ? priorityReplacementLine() : null;

  return (
    <div className="min-h-screen bg-ivory text-espresso">
      <Helmet>
        <title>{`${product.name} — ${product.positioning} | My Custom Beats`}</title>
        <meta name="description" content={`${product.shortDescription} ${priceSummary(product)}.`} />
        <script type="application/ld+json">{JSON.stringify(productPageStructuredData(product.id))}</script>
      </Helmet>

      {/* ---- Hero ------------------------------------------------------ */}
      <section aria-labelledby="product-name" className="px-5 pb-16 pt-28 sm:px-8 md:pb-24 md:pt-32">
        <div className="mx-auto grid max-w-6xl items-start gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <ProductHeroVisual product={product} variant={variant} />
          </div>

          <div className="min-w-0 pt-4 lg:pt-0">
            <p className="label-uppercase text-gold-deep">My Custom Beats</p>
            <h1 id="product-name" className="mt-3 font-serif text-5xl leading-none text-ink md:text-6xl">
              {product.name}
            </h1>
            <p className="mt-4 font-serif text-2xl leading-snug text-ink md:text-3xl">{product.positioning}</p>
            <p className={`mt-5 max-w-xl ${bodyText}`}>{product.shortDescription}</p>

            {choosable && (
              <div className="mt-9 lg:[&_fieldset>div]:grid-cols-2">
                <VariantSelector product={product} value={variant.sku} onChange={chooseVariant} legend={`Choose your ${product.name}`} />
              </div>
            )}

            {/* The selected variant, announced when it changes. */}
            <div className="mt-8 rounded-2xl border border-ink/10 bg-white p-5 sm:p-6" aria-live="polite">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <p className="text-lg font-semibold text-ink">{choosable ? variant.name : product.name}</p>
                <p className="font-mono text-3xl text-ink">{formatMoney(variant.price)}</p>
              </div>
              <p className="mt-1 text-base text-espresso/80">{[songs, format].filter(Boolean).join(" · ")}</p>
              {product.turnaround && <p className="mt-3 text-base text-espresso/80">{product.turnaround.label}.</p>}
              {physical && <p className="mt-1 text-base font-medium text-ink">{DELIVERY_NOTE}</p>}
            </div>

            {product.id === "journey" && (
              <div className="mt-4">
                <JourneyVinylNote variant={variant} />
              </div>
            )}

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <McbButtonLink to={createHref(variant.sku)} onClick={selectPackage} className="w-full sm:w-auto">
                {cta}
                <span className="sr-only">{` — ${variant.name}`}</span>
              </McbButtonLink>
              <Link
                to="/products"
                className="inline-flex min-h-12 items-center justify-center px-2 text-base font-medium text-ink underline underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
              >
                Compare experiences
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---- What you receive ----------------------------------------- */}
      <section aria-labelledby="receive" className="bg-[#F1ECE3] px-5 py-16 sm:px-8 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 id="receive" className={sectionHeading}>
            What you receive
          </h2>
          <p className={`mt-3 ${bodyText}`}>{choosable ? `With the ${variant.name}:` : `With ${product.name}:`}</p>
          <div className="mt-7">
            <FeatureList features={variant.features} />
          </div>
        </div>
      </section>

      {/* ---- How personalisation works -------------------------------- */}
      <section aria-labelledby="personalisation" className="px-5 py-16 sm:px-8 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 id="personalisation" className={sectionHeading}>
            How personalisation works
          </h2>
          <ol className="m-0 mt-9 grid list-none gap-5 p-0 md:grid-cols-2">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4 rounded-2xl border border-ink/10 bg-white p-5 md:p-6">
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-base text-gold">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl leading-snug text-ink">{step.title}</h3>
                  <p className="mt-1 text-base leading-relaxed text-espresso/80">{step.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- Keepsake: one per memory --------------------------------- */}
      {product.id === "keepsake" && (
        <section aria-labelledby="as-many" className="bg-ink px-5 py-16 text-ivory sm:px-8 md:py-24">
          <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-2 md:items-center">
            <div>
              <h2 id="as-many" className="font-serif text-4xl leading-tight !text-ivory md:text-5xl">
                One journey. As many memories as you want.
              </h2>
              <p className="mt-5 text-lg leading-relaxed text-ivory/85">
                {`Each ${KEEPSAKE.name} is individually personalised — its own songs, its own artwork. Choose one for a single memory, or one for every day of a trip. There is no MCB maximum.`}
              </p>
              <p className="mt-4 text-base leading-relaxed text-ivory/75">A few ideas, if they help. Name yours however you like.</p>
              <ul className="m-0 mt-6 flex list-none flex-wrap gap-2 p-0">
                {KEEPSAKE_DAY_EXAMPLES.map((example) => (
                  <li key={example} className="rounded-full border border-ivory/20 px-4 py-2 font-serif text-lg text-ivory">
                    {example}
                  </li>
                ))}
              </ul>
            </div>
            <figure className="m-0">
              <ResponsiveImage
                image={IMAGES.pictureDiscWall}
                sizes="(min-width: 768px) 45vw, 92vw"
                className="aspect-[4/3] w-full rounded-[1.5rem] object-cover"
              />
              <figcaption className="mt-3 text-sm text-ivory/70">Display shown for inspiration; wall mounting isn't included.</figcaption>
            </figure>
          </div>
        </section>
      )}

      {/* ---- Good to know --------------------------------------------- */}
      <section aria-labelledby="good-to-know" className="px-5 py-16 sm:px-8 md:py-24">
        <div className="mx-auto max-w-3xl">
          <h2 id="good-to-know" className={sectionHeading}>
            Good to know
          </h2>
          <dl className="m-0 mt-8 divide-y divide-ink/10 border-y border-ink/10">
            {product.turnaround && (
              <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-base font-semibold text-ink">Timing</dt>
                <dd className="m-0 text-base text-espresso/80">{product.turnaround.label}</dd>
              </div>
            )}
            {product.revisions && (
              <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-base font-semibold text-ink">Refinements</dt>
                <dd className="m-0 text-base text-espresso/80">{product.revisions}</dd>
              </div>
            )}
            <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <dt className="text-base font-semibold text-ink">Delivery</dt>
              <dd className="m-0 text-base text-espresso/80">{physical ? DELIVERY_NOTE : "Delivered digitally."}</dd>
            </div>
            {product.disclosures.map((disclosure) => (
              <div key={disclosure} className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-base font-semibold text-ink">Please note</dt>
                <dd className="m-0 text-base text-espresso/80">{disclosure}</dd>
              </div>
            ))}
            {priority && (
              <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="text-base font-semibold text-ink">Optional</dt>
                <dd className="m-0 text-base text-espresso/80">
                  {priority}{" "}
                  <Link to="/priority-replacement" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
                    How it works
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-6">
            <RefinementOrRemake product={product} />
          </div>

          <p className={`mt-8 ${bodyText}`}>
            {product.id === "moment" && (
              <>
                {`Would you like something to hold? `}
                <Link to="/keepsake" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
                  {`${KEEPSAKE.name} puts your music on a picture disc`}
                </Link>
                .
              </>
            )}
            {product.id === "keepsake" && (
              <>
                {`Telling the story of a whole trip on one album? `}
                <Link to="/journey" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
                  {`See ${JOURNEY.name}`}
                </Link>
                .
              </>
            )}
            {product.id === "journey" && (
              <>
                {`Prefer a record for each memory? `}
                <Link to="/keepsake" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
                  {`See ${KEEPSAKE.name}`}
                </Link>
                {` — or start with a single digital `}
                <Link to="/moment" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
                  {MOMENT.name}
                </Link>
                .
              </>
            )}
          </p>
        </div>
      </section>

      {/* ---- Quick answers (visible; catalogue-derived) ---------------- */}
      <section aria-labelledby="quick-answers" className="bg-[#F1ECE3] px-5 py-16 sm:px-8 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 id="quick-answers" className={sectionHeading}>
            Questions people ask
          </h2>
          <div className="mt-8 space-y-6">
            {PRODUCT_PAGE_ANSWERS[product.id as ProductPageId].answers.map((item) => (
              <div key={item.question}>
                <h3 className="font-serif text-2xl text-ink">{item.question}</h3>
                <p className={`mt-2 ${bodyText}`}>{item.answer}</p>
              </div>
            ))}
          </div>
          <p className={`mt-8 ${bodyText}`}>
            {"Further reading: "}
            <Link to={`/blog/${PRODUCT_PAGE_ANSWERS[product.id as ProductPageId].article.slug}`} className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
              {PRODUCT_PAGE_ANSWERS[product.id as ProductPageId].article.title}
            </Link>
            {" · "}
            <Link to="/faq" className="font-medium text-ink underline underline-offset-4 hover:text-gold-deep">
              All questions
            </Link>
          </p>
        </div>
      </section>

      {/* ---- Closing action ------------------------------------------- */}
      <section aria-labelledby="begin" className="bg-ink px-5 py-16 text-center sm:px-8 md:py-20">
        <div className="mx-auto max-w-2xl">
          <h2 id="begin" className="font-serif text-4xl leading-tight !text-ivory md:text-5xl">
            Ready when you are.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ivory/85">
            {`${choosable ? variant.name : product.name} · `}
            <span className="font-mono">{formatMoney(variant.price)}</span>
          </p>
          <div className="mt-8">
            <McbButtonLink to={createHref(variant.sku)} onClick={selectPackage} tone="gold" className="w-full sm:w-auto">
              {cta}
              <span className="sr-only">{` — ${variant.name}`}</span>
            </McbButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
};

/**
 * Keyed by product so moving between /keepsake and /journey starts fresh
 * rather than carrying one product's selected SKU into the other.
 */
const ProductPage = ({ productId }: { productId: ProductPageId }) => {
  const product = requireProduct(productId);
  return <ProductDetail key={product.id} product={product} />;
};

export default ProductPage;
