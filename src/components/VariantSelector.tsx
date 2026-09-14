import { useId } from "react";
import { formatMoney, type Product } from "../data/catalogue";
import FormatVisual from "./FormatVisual";
import { formatLine, songsLabel } from "../lib/formatText";

/**
 * A visual, side-by-side choice between a product's variants.
 *
 * Native radio inputs inside labels: keyboard, screen readers and touch all
 * work without hover, and every difference that matters — the format drawn to
 * scale, song capacity, size or shape, and price — is visible on the card
 * itself rather than behind a tooltip. Everything is read from the catalogue.
 */

interface VariantSelectorProps {
  product: Product;
  value: string;
  onChange: (sku: string) => void;
  /** Accessible group name. Defaults to "Choose your <product>". */
  legend?: string;
  /** Visually hide the legend when a heading already introduces the choice. */
  hideLegend?: boolean;
  error?: string;
}

const VariantSelector = ({ product, value, onChange, legend, hideLegend = false, error }: VariantSelectorProps) => {
  const name = useId();
  const errorId = `${name}-error`;
  const compact = product.variants.length > 4;

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className={hideLegend ? "sr-only" : "mb-4 font-serif text-2xl text-ink"}>
        {legend ?? `Choose your ${product.name}`}
      </legend>

      <div
        className={`grid gap-3 sm:gap-4 ${
          compact ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-5" : product.variants.length === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4"
        }`}
      >
        {product.variants.map((variant) => {
          const id = `${name}-${variant.sku}`;
          const selected = value === variant.sku;
          const songs = songsLabel(variant.songCount);
          const format = formatLine(variant);
          return (
            <label key={variant.sku} htmlFor={id} className="group relative block cursor-pointer">
              <input
                type="radio"
                id={id}
                name={name}
                value={variant.sku}
                checked={selected}
                onChange={() => onChange(variant.sku)}
                className="peer sr-only"
                {...(error ? { "aria-invalid": true } : {})}
              />
              <span
                className={`flex h-full flex-col rounded-2xl border-2 bg-white p-4 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
                  selected ? "border-gold-dark shadow-[0_8px_30px_-12px_rgba(13,27,42,0.35)]" : "border-espresso/10 hover:border-gold/60"
                }`}
              >
                <span className="mx-auto block w-full max-w-[9.5rem]" aria-hidden="true">
                  <FormatVisual product={product} variant={variant} className="h-auto w-full" />
                </span>
                <span className="mt-3 block font-serif text-xl leading-tight text-ink">{variant.label}</span>
                {format && <span className="mt-1 block text-sm text-espresso/70">{format}</span>}
                {songs && variant.label.toLowerCase() !== songs && (
                  <span className="mt-1 block text-sm font-medium text-espresso">{songs}</span>
                )}
                <span className="mt-auto flex items-center justify-between pt-3">
                  <span className="font-mono text-base text-ink">{formatMoney(variant.price)}</span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                      selected ? "border-gold-dark bg-gold-dark" : "border-espresso/30"
                    }`}
                  >
                    {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                  </span>
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
};

export default VariantSelector;
