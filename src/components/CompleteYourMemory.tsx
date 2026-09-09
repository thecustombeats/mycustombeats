/**
 * COMPLETE YOUR MEMORY — the enhancement stage.
 *
 * Asked after the package and format are settled, because eligibility depends
 * on both: a Keepsake on MP3 has no record, so there is nothing to make an
 * additional copy of. One commercial state, then one basket.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT HOLDS NO PRICES
 * ─────────────────────────────────────────────────────────────────────────
 * Every name, price, maximum and variant comes from `offersFor`, which reads
 * the catalogue. There is no array of products in this file. A repricing, a
 * retirement or a new approved product changes this stage without anyone
 * editing it — and an unpriced product cannot appear at all.
 *
 * Prices render through `<Price>`, the same component the packages and the
 * products page use, so the local estimate and the "charged in GBP" line read
 * identically here.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * EVERY CHOICE IS OPTIONAL
 * ─────────────────────────────────────────────────────────────────────────
 * Nothing here is required and nothing is preselected. Choosing none is a
 * complete answer and produces no error — the customer has already trusted
 * MCB with a story, and this stage asks how they would like it to live in the
 * world, not what else they will buy.
 *
 * No "customers also bought", no bundle pricing, no urgency, no scarcity.
 */

import { useId } from "react";
import { Check, Minus, Plus } from "lucide-react";
import {
  type BasketItem,
  type Offer,
} from "../lib/completeMemory";
import Price from "./Price";

interface CompleteYourMemoryProps {
  offers: readonly Offer[];
  items: readonly BasketItem[];
  onChange: (items: readonly BasketItem[]) => void;
  /** Names dropped by the last revalidation, announced to the customer. */
  removedNotice: readonly string[];
  onEvent?: (
    event: "selected" | "removed" | "quantity_changed",
    id: string,
    quantity?: number
  ) => void;
}

/** The quantity stepper, for the one offer that carries a real quantity. */
const QuantityStepper = ({
  offer,
  quantity,
  onChange,
}: {
  offer: Offer;
  quantity: number;
  onChange: (next: number) => void;
}) => {
  const id = useId();
  const atMin = quantity <= 1;
  const atMax = quantity >= offer.maxQuantity;

  return (
    <div className="mt-4 flex items-center gap-3">
      <span id={id} className="text-sm text-espresso/70">
        {/*
          Names the product, so "decrease" is never ambiguous when a screen
          reader reaches it out of context.

          Deliberately not pluralised from `unitLabel`: appending "s" turned
          "copy" into "copys", and a plural table for one word is not worth
          carrying. "How many?" is correct for every unit there will ever be.
        */}
        {offer.name} — how many?
      </span>

      <div
        role="group"
        aria-labelledby={id}
        className="inline-flex items-center rounded-full border border-espresso/15 bg-white"
      >
        <button
          type="button"
          onClick={() => onChange(quantity - 1)}
          disabled={atMin}
          aria-label={`One fewer ${offer.name}`}
          className="flex h-11 w-11 items-center justify-center rounded-l-full text-espresso/70 transition-colors hover:text-espresso disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Minus aria-hidden="true" className="h-4 w-4" />
        </button>

        {/* aria-live so the new count is announced when the stepper changes
            it, without the buttons having to describe the result. */}
        <span
          aria-live="polite"
          className="min-w-11 px-2 text-center font-mono text-sm text-espresso"
        >
          {quantity}
        </span>

        <button
          type="button"
          onClick={() => onChange(quantity + 1)}
          disabled={atMax}
          aria-label={`One more ${offer.name}`}
          className="flex h-11 w-11 items-center justify-center rounded-r-full text-espresso/70 transition-colors hover:text-espresso disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      {atMax && (
        <span className="text-xs text-espresso/55">
          {offer.maxQuantity} is the most we make to one order
        </span>
      )}
    </div>
  );
};

/** The occasion choice, shown only once the card itself is selected. */
const VariantChooser = ({
  offer,
  selectedId,
  onChange,
}: {
  offer: Offer;
  selectedId: string | undefined;
  onChange: (variantId: string) => void;
}) => {
  const id = useId();
  return (
    <div className="mt-4">
      <label
        htmlFor={id}
        className="block font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45"
      >
        Which occasion?
      </label>
      {/*
        A native select: ten occasions is a list, not a decision worth ten
        tiles, and the platform picker is better on a phone than anything
        hand-built. The value is the VARIANT'S catalogue id, so fulfilment
        receives an exact design rather than a word to interpret.
      */}
      <select
        id={id}
        value={selectedId ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 min-h-11 w-full rounded-xl border border-espresso/15 bg-white px-3 py-2 text-sm text-espresso focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep sm:w-auto"
      >
        {offer.variants?.map((variant) => (
          <option key={variant.id} value={variant.id}>
            {variant.label}
          </option>
        ))}
      </select>
    </div>
  );
};

const CompleteYourMemory = ({
  offers,
  items,
  onChange,
  removedNotice,
  onEvent,
}: CompleteYourMemoryProps) => {
  const headingId = useId();

  if (offers.length === 0) return null;

  const selected = new Map(items.map((item) => [item.id, item]));

  const toggle = (offer: Offer) => {
    if (selected.has(offer.id)) {
      onChange(items.filter((item) => item.id !== offer.id));
      onEvent?.("removed", offer.id);
      return;
    }
    onChange([
      ...items,
      {
        id: offer.id,
        quantity: 1,
        // A variant offer is given its first option, so a selected card always
        // resolves to a real design rather than sitting in a half-chosen state.
        ...(offer.variants?.length ? { variantId: offer.variants[0].id } : {}),
      },
    ]);
    onEvent?.("selected", offer.id, 1);
  };

  const setQuantity = (offer: Offer, next: number) => {
    const clamped = Math.min(Math.max(next, 1), offer.maxQuantity);
    onChange(
      items.map((item) =>
        item.id === offer.id ? { ...item, quantity: clamped } : item
      )
    );
    onEvent?.("quantity_changed", offer.id, clamped);
  };

  const setVariant = (offer: Offer, variantId: string) => {
    onChange(
      items.map((item) => (item.id === offer.id ? { ...item, variantId } : item))
    );
  };

  return (
    <section
      aria-labelledby={headingId}
      className="order-form-field space-y-5"
      data-field="completeMemory"
    >
      <div>
        <h3
          id={headingId}
          className="font-serif text-2xl leading-snug text-espresso sm:text-[1.75rem]"
        >
          Complete Your Memory
        </h3>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-espresso/65">
          Add the finishing touches that turn your MCB creation into something
          beautiful to give, display and keep. Every one of these is optional.
        </p>
      </div>

      {/*
        Announced, not just shown. A customer who changed format has already
        moved on; if something silently left their basket they would find out
        at the total, or not at all.
      */}
      {removedNotice.length > 0 && (
        <p
          role="status"
          className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-espresso/80"
        >
          {removedNotice.join(" and ")}{" "}
          {removedNotice.length === 1 ? "is" : "are"} not available with the
          format you have chosen, so {removedNotice.length === 1 ? "it has" : "they have"}{" "}
          been removed from your memory.
        </p>
      )}

      <ul className="grid gap-3 list-none p-0 m-0 sm:grid-cols-2">
        {offers.map((offer) => {
          const item = selected.get(offer.id);
          const isSelected = item !== undefined;
          const checkboxId = `enhancement-${offer.id}`;

          return (
            <li key={offer.id}>
              {/*
                A real <input type="checkbox"> inside its <label>: native
                semantics, native keyboard, native announcement of the
                selected state. The tick and the border weight mean selection
                is never carried by colour alone.
              */}
              <div
                className={`h-full rounded-2xl border p-4 transition-colors ${
                  isSelected
                    ? "border-gold-dark bg-gold/10"
                    : "border-espresso/12 bg-white"
                }`}
              >
                <label
                  htmlFor={checkboxId}
                  className="flex cursor-pointer items-start gap-3"
                >
                  <input
                    type="checkbox"
                    id={checkboxId}
                    checked={isSelected}
                    onChange={() => toggle(offer)}
                    className="peer sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
                      isSelected
                        ? "border-gold-dark bg-gold-dark text-white"
                        : "border-espresso/30 bg-white"
                    }`}
                  >
                    {isSelected && (
                      <Check strokeWidth={3} className="h-3.5 w-3.5" />
                    )}
                  </span>

                  <span className="min-w-0">
                    <span className="block font-medium leading-snug text-espresso">
                      {offer.name}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-espresso/60">
                      {offer.description}
                    </span>
                    <span className="mt-3 block">
                      <Price
                        gbp={offer.unitGbp}
                        size="sm"
                        className={offer.unitLabel ? "inline-block" : undefined}
                      />
                      {offer.unitLabel && (
                        <span className="mt-0.5 block text-xs text-espresso/55">
                          each
                        </span>
                      )}
                    </span>
                  </span>
                </label>

                {isSelected && offer.variants && offer.variants.length > 0 && (
                  <VariantChooser
                    offer={offer}
                    selectedId={item?.variantId}
                    onChange={(variantId) => setVariant(offer, variantId)}
                  />
                )}

                {isSelected && offer.maxQuantity > 1 && (
                  <QuantityStepper
                    offer={offer}
                    quantity={item?.quantity ?? 1}
                    onChange={(next) => setQuantity(offer, next)}
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {items.length === 0 && (
        <p className="text-sm text-espresso/55">
          Nothing selected — your {""}
          memory will arrive just as your experience describes.
        </p>
      )}
    </section>
  );
};

export default CompleteYourMemory;
