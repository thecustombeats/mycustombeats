/**
 * One product family, rendered from catalogue data alone.
 *
 * Every family goes through this component — records, frames, boxes, cards —
 * so the Products page contains no per-product markup and adding a family or
 * a variant is a data edit. What varies between families is expressed as
 * data, not as branches here:
 *
 *   • song capacity        → the pressing table (vinyl only, because only
 *                            vinyl products declare `songCapacity`)
 *   • occasion             → the occasion selector (cards only, because only
 *                            cards declare `occasion`)
 *   • declared relations   → the "plays with" / "holds" row
 *
 * PRICING. No product in the catalogue has an approved price. Rather than
 * print a placeholder, an unpriced product states that it is made to order and
 * quoted — which is what the page already said before the catalogue existed.
 * If a price is approved later, `formatProductPrice` returns it and the same
 * markup shows it. Nothing here can invent one: a TBD `ProductPrice` carries
 * no number.
 */

import { useState } from "react";
import CdDiscMark from "./CdDiscMark";
import KeepsakeMark from "./KeepsakeMark";
import { PACKAGES } from "../data/packages";
import {
  OCCASIONS,
  availableOptionValues,
  capacityLabel,
  formatProductPrice,
  isPriced,
  relatedFamilies,
  relationLabel,
  selectableOptions,
  termsFor,
  termStatement,
  type CatalogueProduct,
  type ProductFamily,
} from "../data/catalogue";
import {
  packagesOrderableOnVinylSize,
  type VinylSizeId,
} from "../data/catalogue/vinyl";

interface CatalogueFamilyProps {
  family: ProductFamily;
  /** Mirrors the layout so consecutive families alternate down the page. */
  reverse?: boolean;
}

/** Availability phrased for a customer rather than for a database. */
const AVAILABILITY_COPY: Record<CatalogueProduct["availability"], string> = {
  AVAILABLE: "Available now",
  MADE_TO_ORDER: "Made to order",
  COMING_SOON: "Coming soon",
};

/** "£120" where approved, otherwise the enquiry line the page already used. */
const PriceLine = ({ product }: { product: CatalogueProduct }) => {
  const price = formatProductPrice(product.price);

  if (!isPriced(product.price) || price === null) {
    return (
      <p className="text-sm italic text-black/50">
        Each piece is custom made — enquire for pricing
      </p>
    );
  }

  return (
    <p className="font-mono text-base text-black">
      {price}
      <span className="text-black/45 text-sm ml-2">
        {formatProductPrice(product.price, "usd")}
      </span>
    </p>
  );
};

/**
 * The pressing table.
 *
 * "Fits" is DERIVED — the capacity rules are asked which experiences a record
 * can carry, so it cannot fall out of step with the package song counts. When
 * Heirloom went from seven songs to six, this table changed by itself.
 *
 * It asks `packagesOrderableOnVinylSize`, not the capacity rules directly: a
 * 7-inch physically fits a one-song Moment, but Moment checks out as an MP3
 * only, so listing it here would advertise a record nobody can buy.
 */
const CapacityTable = ({ products }: { products: readonly CatalogueProduct[] }) => (
  /* min-w-0 is load-bearing: without it the grid track this sits in takes
     the table's min-width as its own min-content width, and the page — not
     the table — is what ends up scrolling sideways at 320px. */
  <div className="mt-6 overflow-x-auto min-w-0">
    <table className="w-full min-w-[17rem] text-left border-collapse">
      <caption className="sr-only">
        Record sizes, song capacity and the experiences each size can carry
      </caption>
      <thead>
        <tr className="border-b border-black/10">
          <th scope="col" className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 pb-2 pr-4 font-medium">
            Size
          </th>
          <th scope="col" className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 pb-2 pr-4 font-medium">
            Holds
          </th>
          <th scope="col" className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 pb-2 font-medium">
            Fits
          </th>
        </tr>
      </thead>
      <tbody>
        {products.map((product) => {
          const fits = packagesOrderableOnVinylSize(
            product.id as VinylSizeId,
            PACKAGES
          );

          return (
            <tr key={product.id} className="border-b border-black/5 align-top">
              <th scope="row" className="py-3 pr-4 font-normal text-sm text-black whitespace-nowrap">
                {product.name}
              </th>
              <td className="py-3 pr-4 font-mono text-sm text-black/70 whitespace-nowrap">
                {product.songCapacity
                  ? capacityLabel(product.songCapacity)
                  : "—"}
              </td>
              <td className="py-3 text-sm text-black/60">
                {fits.length > 0
                  ? fits.map((pkg) => pkg.name).join(", ")
                  : "Quoted per commission"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

/**
 * Occasion selector for the Gift Pop-Up Card.
 *
 * The options are the family's own products, so a new occasion appears here
 * the moment it is added to the card catalogue.
 */
const OccasionSelector = ({
  products,
}: {
  products: readonly CatalogueProduct[];
}) => {
  const [selectedId, setSelectedId] = useState(products[0]?.id ?? "");
  const selected =
    products.find((product) => product.id === selectedId) ?? products[0];

  return (
    <div className="mt-6">
      <p
        id="occasion-selector-label"
        className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 mb-3"
      >
        Choose the occasion
      </p>

      <div
        role="group"
        aria-labelledby="occasion-selector-label"
        className="flex flex-wrap gap-2"
      >
        {products.map((product) => {
          const isSelected = product.id === selected?.id;
          return (
            <button
              key={product.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedId(product.id)}
              /* min-h-11 keeps every chip at a comfortable touch target down
                 to 320px, where these wrap to several rows. */
              className={`min-h-11 px-4 py-2 rounded-full text-sm transition-colors duration-300 ${
                isSelected
                  ? "bg-ink text-ivory"
                  : "border border-black/15 text-black/70 hover:border-gold hover:text-black"
              }`}
            >
              {product.occasion ? OCCASIONS[product.occasion].label : product.name}
            </button>
          );
        })}
      </div>

      {selected && (
        <p aria-live="polite" className="text-sm text-black/60 mt-4 leading-relaxed">
          {selected.description}
        </p>
      )}
    </div>
  );
};

const CatalogueFamily = ({ family, reverse = false }: CatalogueFamilyProps) => {
  const showsCapacity = family.products.some((p) => p.songCapacity);
  const showsOccasions = family.products.some((p) => p.occasion);

  // Variant list, for families that have several products but no richer
  // presentation of them (capacity table or occasion selector).
  const showsVariants =
    !showsCapacity && !showsOccasions && family.products.length > 1;

  const relations = relatedFamilies(family.id);

  /**
   * Options shared by every product in the family. A family whose variants
   * offer different options states none here rather than implying the first
   * product's options apply to all of them.
   */
  const options = family.products.length > 0
    ? selectableOptions(family.products[0]).filter((option) =>
        family.products.every((product) =>
          selectableOptions(product).some(
            (candidate) => candidate.id === option.id
          )
        )
      )
    : [];

  /**
   * Availability and lead time are read off the products, not the family, and
   * only stated where every product agrees — a family whose variants differ
   * says nothing here rather than generalising from the first one.
   */
  const availabilities = new Set(family.products.map((p) => p.availability));
  const availability =
    availabilities.size === 1 ? [...availabilities][0] : undefined;

  const leadTimes = new Set(
    family.products.map((p) => p.leadTime?.label ?? "")
  );
  const leadTime =
    leadTimes.size === 1 ? [...leadTimes][0] || undefined : undefined;

  /**
   * Stated only where the catalogue is genuinely undecided. A memory box may
   * hold a playable pressing or a display piece, and the business has not
   * generalised which — so the page says it is confirmed during
   * configuration rather than promising either.
   */
  const configurableSong = family.products.some(
    (p) => p.songInclusion === "CONFIGURABLE"
  );

  return (
    <div className="grid md:grid-cols-2 gap-10 lg:gap-12 items-center">
      {/* IMAGE — or a typographic panel where no photograph exists.
          Never substitute a stand-in image for a real product. */}
      <div
        className={`h-[280px] sm:h-[360px] md:h-[400px] rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-xl transition duration-500 ${
          reverse ? "md:order-2" : ""
        }`}
      >
        {family.image ? (
          <img
            src={family.image}
            alt={family.alt ?? family.name}
            loading="lazy"
            decoding="async"
            className={`w-full h-full transition duration-700 ${
              family.imageFit === "contain" ? "object-contain p-4" : "object-cover"
            }`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-ivory border border-espresso/10 rounded-2xl p-10">
            {/* The disc mark is a drawing of a CD, so it only stands in for
                the CD. Anything else names itself rather than borrowing an
                image of a different product. */}
            {family.id === "cd" ? (
              <CdDiscMark className="w-full h-full max-w-[300px]" />
            ) : (
              <KeepsakeMark name={family.name} />
            )}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <div className={`min-w-0 ${reverse ? "md:order-1" : ""}`}>
        {availability && (
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-gold-deep mb-3">
            {AVAILABILITY_COPY[availability]}
          </p>
        )}

        <h2 className="text-3xl md:text-4xl font-light mb-4">{family.name}</h2>

        <p className="text-black/60 mb-6 leading-relaxed">
          {family.description}
        </p>

        {showsCapacity && <CapacityTable products={family.products} />}
        {showsOccasions && <OccasionSelector products={family.products} />}

        {showsVariants && (
          <ul className="mt-6 space-y-3 list-none p-0 m-0">
            {family.products.map((product) => (
              <li key={product.id} className="border-b border-black/5 pb-3">
                <span className="block text-sm text-black">{product.name}</span>
                <span className="block text-sm text-black/55 leading-relaxed">
                  {product.description}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Configuration choices within the product — sleeve today, and
            colour if it is ever approved. Rendered from the option data, so a
            new option needs no change here. */}
        {options.length > 0 && (
          <dl className="mt-6 space-y-2">
            {options.map((option) => (
              <div key={option.id} className="flex gap-3 text-sm">
                <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 pt-1 shrink-0 w-16">
                  {option.label}
                </dt>
                <dd className="text-black/65 m-0">
                  {availableOptionValues(option)
                    .map((value) => value.label)
                    .join(" · ")}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {configurableSong && (
          <p className="text-sm text-black/55 mt-6 leading-relaxed">
            Whether your song is included as a playable pressing or presented as
            a display piece is confirmed with you when the piece is configured.
          </p>
        )}

        {relations.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 mb-2">
              {relationLabel(family.id)}
            </p>
            <p className="text-sm text-black/65">
              {relations.map((related) => related.name).join(" · ")}
            </p>
          </div>
        )}

        {/* Commercial terms. Only what is approved is stated; the rest says
            so plainly rather than rendering nothing, because a customer
            deciding on a fragile made-to-order object asks about delivery,
            returns and damage before they ask about anything else. */}
        {(() => {
          const terms = termsFor(family.id);
          const stated: { label: string; statement: string }[] = [
            { label: "Shipping", term: terms.shipping },
            { label: "Delivery", term: terms.delivery },
            { label: "Returns", term: terms.returns },
            { label: "Exchange", term: terms.exchange },
            { label: "If it arrives damaged", term: terms.damage },
          ].flatMap(({ label, term }) => {
            const statement = termStatement(term);
            return statement === null ? [] : [{ label, statement }];
          });

          return (
            <div className="mt-6">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-black/45 mb-2">
                Delivery &amp; care
              </p>
              {stated.length > 0 ? (
                <dl className="space-y-1.5 text-sm">
                  {stated.map(({ label, statement }) => (
                    <div key={label} className="flex gap-3">
                      <dt className="text-black/50 shrink-0 w-28">{label}</dt>
                      <dd className="text-black/70 m-0">{statement}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="text-sm text-black/60 leading-relaxed">
                  Delivery, returns and replacement are confirmed with your
                  quote — each piece is made to order, so we agree them with
                  you before anything is produced.
                </p>
              )}
            </div>
          );
        })()}

        <div className="mt-7 space-y-1">
          {/* Every product in a family shares its pricing basis today, so the
              first product speaks for the family. */}
          {family.products[0] && <PriceLine product={family.products[0]} />}

          {leadTime ? (
            <p className="font-mono text-xs text-black/50">{leadTime}</p>
          ) : (
            <p className="text-xs text-black/50">
              Based on quantity, design &amp; personalization
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CatalogueFamily;
