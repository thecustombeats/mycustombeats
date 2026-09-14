/**
 * COMPLETE YOUR MEMORY — optional add-ons, chosen from the catalogue.
 *
 * The component holds SKUs and integer quantities only. Names, prices and the
 * statements that must accompany a product (the plaque does not play music)
 * are all read from the catalogue entry being offered.
 */
import { useId } from "react";
import { Check, Minus, Plus } from "lucide-react";
import { formatMoney, lowestPrice, type Product } from "../data/catalogue";
import { MAX_UNITS_PER_LINE, type AddOnSelection } from "../lib/orderSelection";
import Price from "./Price";

interface CompleteYourMemoryProps {
  offers: readonly Product[];
  items: readonly AddOnSelection[];
  onChange: (items: readonly AddOnSelection[]) => void;
  onEvent?: (event: "selected" | "removed" | "quantity_changed", sku: string, quantity?: number) => void;
}

const QuantityStepper = ({
  name,
  quantity,
  onChange,
}: {
  name: string;
  quantity: number;
  onChange: (next: number) => void;
}) => {
  const id = useId();
  return (
    <div className="mt-4 flex items-center gap-3">
      <span id={id} className="text-sm text-espresso/70">
        {name} — how many?
      </span>
      <div role="group" aria-labelledby={id} className="inline-flex items-center rounded-full border border-espresso/15 bg-white">
        <button
          type="button"
          onClick={() => onChange(quantity - 1)}
          disabled={quantity <= 1}
          aria-label={`One fewer ${name}`}
          className="flex h-11 w-11 items-center justify-center rounded-l-full text-espresso/70 transition-colors hover:text-espresso disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>
        <span aria-live="polite" className="min-w-11 px-2 text-center font-mono text-sm text-espresso">
          {quantity}
        </span>
        <button
          type="button"
          onClick={() => onChange(quantity + 1)}
          disabled={quantity >= MAX_UNITS_PER_LINE}
          aria-label={`One more ${name}`}
          className="flex h-11 w-11 items-center justify-center rounded-r-full text-espresso/70 transition-colors hover:text-espresso disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

const CompleteYourMemory = ({ offers, items, onChange, onEvent }: CompleteYourMemoryProps) => {
  const headingId = useId();
  if (offers.length === 0) return null;

  const selected = new Map(items.map((item) => [item.productId, item]));

  const toggle = (product: Product) => {
    const existing = selected.get(product.id);
    if (existing) {
      onChange(items.filter((item) => item.productId !== product.id));
      onEvent?.("removed", existing.sku);
      return;
    }
    const sku = product.variants[0].sku;
    onChange([...items, { productId: product.id, sku, quantity: 1 }]);
    onEvent?.("selected", sku, 1);
  };

  const update = (productId: string, change: Partial<AddOnSelection>) =>
    onChange(items.map((item) => (item.productId === productId ? { ...item, ...change } : item)));

  return (
    <section aria-labelledby={headingId} className="order-form-field space-y-5" data-field="completeMemory">
      <div>
        <h3 id={headingId} className="font-serif text-2xl leading-snug text-espresso sm:text-[1.75rem]">
          Complete Your Memory
        </h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-espresso/65">
          Add the finishing touches that turn your MCB creation into something beautiful to give, display and keep.
          Every one of these is optional.
        </p>
      </div>

      <ul className="grid gap-3 list-none p-0 m-0 sm:grid-cols-2">
        {offers.map((product) => {
          const item = selected.get(product.id);
          const isSelected = item !== undefined;
          const checkboxId = `addon-${product.id}`;
          const selectId = `${checkboxId}-variant`;
          const low = lowestPrice(product);
          const chosen = product.variants.find((v) => v.sku === item?.sku) ?? product.variants[0];

          return (
            <li key={product.id}>
              <div
                className={`h-full rounded-2xl border p-4 transition-colors ${
                  isSelected ? "border-gold-dark bg-gold/10" : "border-espresso/12 bg-white"
                }`}
              >
                <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    id={checkboxId}
                    checked={isSelected}
                    onChange={() => toggle(product)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
                      isSelected ? "border-gold-dark bg-gold-dark text-white" : "border-espresso/30 bg-white"
                    }`}
                  >
                    {isSelected && <Check strokeWidth={3} className="h-3.5 w-3.5" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug text-espresso">{product.name}</span>
                    <span className="mt-1 block text-sm leading-relaxed text-espresso/60">{product.shortDescription}</span>
                    {product.disclosures.map((disclosure) => (
                      <span key={disclosure} className="mt-1 block text-xs leading-relaxed text-espresso/70">
                        {disclosure}
                      </span>
                    ))}
                    <span className="mt-3 block">
                      {isSelected || product.variants.length === 1 ? (
                        <Price gbp={chosen.price.minor / 100} size="sm" />
                      ) : (
                        low && <span className="text-base font-light text-espresso">From {formatMoney(low)}</span>
                      )}
                    </span>
                  </span>
                </label>

                {isSelected && product.variants.length > 1 && (
                  <div className="mt-4">
                    <label
                      htmlFor={selectId}
                      className="block font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45"
                    >
                      Which size?
                    </label>
                    <select
                      id={selectId}
                      value={item.sku}
                      onChange={(e) => update(product.id, { sku: e.target.value })}
                      className="mt-2 min-h-11 w-full rounded-xl border border-espresso/15 bg-white px-3 py-2 text-sm text-espresso focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep sm:w-auto"
                    >
                      {product.variants.map((variant) => (
                        <option key={variant.sku} value={variant.sku}>
                          {variant.label} — {formatMoney(variant.price)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {isSelected && (
                  <QuantityStepper
                    name={product.name}
                    quantity={item.quantity}
                    onChange={(next) => {
                      const quantity = Math.min(Math.max(next, 1), MAX_UNITS_PER_LINE);
                      update(product.id, { quantity });
                      onEvent?.("quantity_changed", item.sku, quantity);
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default CompleteYourMemory;
