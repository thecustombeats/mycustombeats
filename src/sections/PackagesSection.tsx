import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import ResponsiveImage from "../components/ResponsiveImage";
import Price from "../components/Price";
import SectionHeading from "../components/mcb/SectionHeading";
import { mcbButtonClass } from "../lib/buttonClass";
import { BESPOKE, JOURNEY, KEEPSAKE, MCB_LIVE, MOMENT, type Product } from "../data/catalogue";
import { PACKAGE_IMAGERY, type McbImage } from "../data/imagery";
import { formatLine } from "../lib/formatText";
import { trackFunnel } from "../lib/analytics";
import { EXPERIENCE_HREF, lowestPounds, pictureDiscSizes, priceLine, songRange } from "./home/experienceFacts";

/**
 * THE VISUAL EXPERIENCE SELECTOR — Moment, Keepsake, Journey and Bespoke.
 *
 * Four cards, each answering at a glance: what it is, how many songs, what
 * you receive, what it costs and how long to allow. Every name, positioning
 * line, song count, format, price, disclosure and timing line is read from the
 * canonical catalogue. The sentence on each card is homepage copy; the facts
 * beneath it are not.
 *
 * Keepsake has no picture-disc photograph, so its gift image is paired with a
 * drawn picture disc (<FormatVisual>). The black-vinyl photograph belongs to
 * Journey alone.
 */

interface CardContent {
  product: Product;
  image: McbImage;
  imageAlt: string;
  proposition: string;
  facts: readonly string[];
  cta: string;
  secondary?: { label: string; to: string; track: boolean };
}

const compact = (items: readonly (string | null | false | undefined)[]): string[] =>
  items.filter((item): item is string => Boolean(item));

const CARDS: readonly CardContent[] = [
  {
    product: MOMENT,
    image: PACKAGE_IMAGERY.moment,
    imageAlt: "A glass raised at sunset over the sea",
    proposition: "One beautiful memory, turned into a personalised song and delivered digitally — ready to play, send or share.",
    facts: compact([songRange(MOMENT), MOMENT.variants[0] && formatLine(MOMENT.variants[0]), "Revealed with a private link"]),
    cta: `Create a ${MOMENT.name}`,
    secondary: { label: `About ${MOMENT.name}`, to: MOMENT.route ?? "/moment", track: true },
  },
  {
    product: KEEPSAKE,
    image: PACKAGE_IMAGERY.keepsake,
    imageAlt: PACKAGE_IMAGERY.keepsake.alt,
    proposition:
      "Your song on a picture disc printed with personalised artwork — something to hold, to display and to give. Choose one for every memory.",
    facts: compact([
      songRange(KEEPSAKE),
      pictureDiscSizes(KEEPSAKE) && `Picture disc: ${pictureDiscSizes(KEEPSAKE)}`,
      KEEPSAKE.variants.every((v) => v.artworkIncluded) && "Personalised picture-disc artwork",
    ]),
    cta: `Explore ${KEEPSAKE.name}`,
  },
  {
    product: JOURNEY,
    image: PACKAGE_IMAGERY.journey,
    imageAlt: "A classic black vinyl record beside its personalised sleeve",
    proposition:
      "A larger musical story for a cruise, a honeymoon, a wedding or a family's years together. Pressed on classic black vinyl with your personalised sleeve artwork.",
    facts: compact([
      songRange(JOURNEY),
      JOURNEY.variants.some((v) => v.songCount && v.songCount > 1) && "A different music style for each song if you wish",
      JOURNEY.variants.every((v) => v.masteringIncluded) && "Mastering included",
    ]),
    cta: `Explore ${JOURNEY.name}`,
  },
  {
    product: BESPOKE,
    image: PACKAGE_IMAGERY.bespoke,
    imageAlt: "An open travel journal and map on a table overlooking the sea",
    proposition:
      "When your idea doesn't fit inside a box: exceptional commissions, unusual memories and gifts shaped around one person.",
    facts: compact(["Individually curated with you", "An enquiry first — nothing is charged to ask"]),
    cta: `Explore ${BESPOKE.name}`,
    secondary: { label: `Live music for an event? Discover ${MCB_LIVE.name}`, to: MCB_LIVE.route ?? "/mcb-live", track: false },
  },
];

const ExperienceCard = ({ card }: { card: CardContent }) => {
  const { product } = card;
  const pounds = lowestPounds(product);
  const price = priceLine(product);
  const select = () => trackFunnel("package_select", { product_id: product.id, location: "homepage" });
  const headingId = `experience-${product.id}`;

  return (
    <article
      aria-labelledby={headingId}
      className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-ink/10 bg-white shadow-[0_18px_50px_rgba(13,27,42,0.06)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-ink/5">
        <ResponsiveImage
          image={card.image}
          alt={card.imageAlt}
          sizes="(min-width: 1280px) 22vw, (min-width: 640px) 45vw, 92vw"
          className="h-full w-full object-cover"
        />
      </div>

      <div className="flex flex-1 flex-col p-6 sm:p-7">
        <h3 id={headingId} className="text-ink" style={{ fontSize: "2.1rem" }}>
          {product.name}
        </h3>
        <p className="mt-1 font-serif text-xl italic leading-snug text-gold-deep">{product.positioning}</p>
        <p className="mt-4 text-base leading-relaxed text-espresso/80">{card.proposition}</p>

        {card.facts.length > 0 && (
          <ul className="mt-5 list-none space-y-2 p-0">
            {card.facts.map((fact) => (
              <li key={fact} className="flex gap-2.5 text-base leading-snug text-ink">
                <Check size={18} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Disclosures accompany the product wherever it is sold — except the
            one that simply repeats the price line ("Individually quoted"). */}
        {product.disclosures
          .filter((disclosure) => disclosure !== price)
          .map((disclosure) => (
            <p key={disclosure} className="mt-4 rounded-lg bg-ivory px-3 py-2 text-[0.9375rem] font-semibold text-ink">
              {disclosure}
            </p>
          ))}

        <div className="mt-auto pt-6">
          <div className="border-t border-ink/10 pt-5">
            {pounds !== null ? (
              <Price gbp={pounds} prefix={product.commercialModel === "VARIANT_FIXED" ? "From" : undefined} size="md" className="!font-normal" />
            ) : (
              <p className="text-xl text-ink">{price}</p>
            )}
            {product.turnaround && (
              <p className="mt-1 text-[0.9375rem] leading-snug text-espresso/75">{product.turnaround.label}</p>
            )}
          </div>

          <Link to={EXPERIENCE_HREF[product.id]} onClick={select} className={mcbButtonClass("primary", "mt-5 w-full")}>
            {card.cta}
          </Link>

          {card.secondary && (
            <Link
              to={card.secondary.to}
              onClick={card.secondary.track ? select : undefined}
              className="mt-2 flex min-h-12 items-center justify-center rounded-full px-3 text-center text-base font-medium text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              {card.secondary.label}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
};

const PackagesSection = () => {
  const sectionRef = useRef<HTMLElement>(null);

  // package_view, once, when the selector is genuinely on screen.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          trackFunnel("package_view", { location: "homepage" });
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="packages"
      aria-labelledby="packages-heading"
      className="scroll-mt-24 bg-ivory px-5 py-20 sm:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1400px]">
        <SectionHeading
          id="packages-heading"
          eyebrow="The experiences"
          title="Choose how you'd like to keep it"
          intro={<p>Four ways to turn a memory into music. Every one begins with your story.</p>}
        />

        <ul className="mt-14 grid list-none grid-cols-1 gap-6 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {CARDS.map((card) => (
            <li key={card.product.id} className="min-w-0">
              <ExperienceCard card={card} />
            </li>
          ))}
        </ul>

        <p className="mt-12 text-center text-lg text-espresso/80">
          Not sure which is right?{" "}
          <Link
            to={{ hash: "#help-me-choose" }}
            className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold-deep"
          >
            Let us help you choose
          </Link>
        </p>
      </div>
    </section>
  );
};

export default PackagesSection;
