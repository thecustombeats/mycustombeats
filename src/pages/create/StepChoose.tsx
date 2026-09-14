import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { Minus, Plus } from "lucide-react";
import FormatVisual from "../../components/FormatVisual";
import VariantSelector from "../../components/VariantSelector";
import { BESPOKE, JOURNEY_FORMAT_NOTE, formatMoney, getProduct, getVariant, priceSummary, songExperiences } from "../../data/catalogue";
import { formatLine, songsLabel } from "../../lib/formatText";
import {
  MULTI_UNIT_PRODUCT_IDS,
  chooseProduct,
  chooseVariant,
  maxUnitsFor,
  memoriesLostBy,
  type OrderDraft,
} from "../../lib/personalisation";

interface StepChooseProps {
  draft: OrderDraft;
  setDraft: (update: (draft: OrderDraft) => OrderDraft) => void;
  showErrors: boolean;
  onProduct: (productId: string) => void;
  onVariant: (sku: string) => void;
}

const PRODUCTS = songExperiences().filter((product) => product.onlineCheckout);

type Pending = { kind: "product"; productId: string; lost: number } | { kind: "variant"; sku: string; quantity: number; lost: number };

const StepChoose = ({ draft, setDraft, showErrors, onProduct, onVariant }: StepChooseProps) => {
  const groupId = useId();
  const quantityId = useId();
  const [pending, setPending] = useState<Pending | null>(null);
  const product = getProduct(draft.productId);
  const variant = draft.sku ? getVariant(draft.sku)?.variant : undefined;
  const multi = product ? MULTI_UNIT_PRODUCT_IDS.has(product.id) : false;

  const applyProduct = (productId: string) => {
    setDraft((d) => chooseProduct(d, productId));
    onProduct(productId);
  };
  const applyVariant = (sku: string, quantity: number) => {
    setDraft((d) => chooseVariant(d, sku, quantity));
    if (sku !== draft.sku) onVariant(sku);
  };

  const requestProduct = (productId: string) => {
    if (productId === draft.productId) return;
    // Words are only lost once a variant with fewer songs is actually set.
    const target = getProduct(productId);
    const lost = target && target.variants.length === 1 ? memoriesLostBy(draft, target.variants[0].sku, 1) : 0;
    if (lost > 0) setPending({ kind: "product", productId, lost });
    else applyProduct(productId);
  };
  const requestVariant = (sku: string, quantity: number) => {
    const lost = memoriesLostBy(draft, sku, quantity);
    if (lost > 0) setPending({ kind: "variant", sku, quantity, lost });
    else applyVariant(sku, quantity);
  };

  return (
    <div className="space-y-10">
      <fieldset>
        <legend className="sr-only">Choose your experience</legend>
        <div className="grid gap-4 md:grid-cols-3">
          {PRODUCTS.map((item) => {
            const selected = item.id === draft.productId;
            const id = `${groupId}-${item.id}`;
            const sample = item.variants[item.variants.length - 1] ?? item.variants[0];
            return (
              <label key={item.id} htmlFor={id} className="block cursor-pointer">
                <input
                  type="radio"
                  id={id}
                  name={groupId}
                  checked={selected}
                  onChange={() => requestProduct(item.id)}
                  className="peer sr-only"
                />
                <span
                  className={`flex h-full flex-col rounded-2xl border-2 bg-white p-5 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
                    selected ? "border-gold-dark" : "border-espresso/10 hover:border-gold/60"
                  }`}
                >
                  <span className="flex items-center gap-4">
                    <span className="block w-16 shrink-0" aria-hidden="true">
                      <FormatVisual product={item} variant={sample} className="h-auto w-full" />
                    </span>
                    <span>
                      <span className="block font-serif text-2xl leading-tight text-ink">{item.name}</span>
                      <span className="mt-0.5 block font-mono text-sm text-ink">{priceSummary(item)}</span>
                    </span>
                  </span>
                  <span className="mt-3 block text-base leading-relaxed text-espresso/75">{item.positioning}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p className="text-base text-espresso/75">
        Have something bigger in mind?{" "}
        <Link to={BESPOKE.route ?? "/bespoke"} className="font-medium text-gold-deep underline underline-offset-4">
          {BESPOKE.name} is individually quoted
        </Link>
        .
      </p>

      {pending && (
        <div role="alertdialog" aria-labelledby="pending-title" className="rounded-2xl border-2 border-gold-dark bg-gold/10 p-5">
          <p id="pending-title" className="text-base font-medium text-ink">
            This change would remove {pending.lost === 1 ? "1 memory you've written" : `${pending.lost} memories you've written`}.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                if (pending.kind === "product") applyProduct(pending.productId);
                else applyVariant(pending.sku, pending.quantity);
                setPending(null);
              }}
              className="min-h-12 rounded-full bg-ink px-6 text-base font-semibold text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
            >
              Change anyway
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="min-h-12 rounded-full border border-ink/25 px-6 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              Keep what I have
            </button>
          </div>
        </div>
      )}

      {product && product.variants.length > 1 && (
        <div>
          <VariantSelector
            product={product}
            value={draft.sku}
            onChange={(sku) => requestVariant(sku, draft.quantity)}
            legend={product.id === "keepsake" ? "Which picture disc?" : `Which ${product.name}?`}
            error={showErrors && !draft.sku ? `Please choose which ${product.name} you would like.` : undefined}
          />
          {product.disclosures.map((disclosure) => (
            <p key={disclosure} className="mt-4 text-base leading-relaxed text-espresso/80">
              {product.id === "journey" ? JOURNEY_FORMAT_NOTE : disclosure}
            </p>
          ))}
        </div>
      )}

      {product && variant && (
        <div className="rounded-2xl bg-white p-5 sm:p-6">
          <p className="font-serif text-2xl text-ink">{variant.name}</p>
          <p className="mt-1 text-base text-espresso/75">
            {[formatLine(variant), songsLabel(variant.songCount)].filter(Boolean).join(" · ")} · {formatMoney(variant.price)}
            {multi ? " each" : ""}
          </p>
          {product.turnaround && <p className="mt-2 text-sm text-espresso/70">{product.turnaround.label}</p>}
        </div>
      )}

      {product && variant && multi && (
        <div className="space-y-4">
          <div>
            <p id={quantityId} className="font-serif text-2xl text-ink">
              One journey. As many memories as you want.
            </p>
            <p className="mt-2 text-base leading-relaxed text-espresso/75">
              Choose a separate {product.name} for each memory — every one is personalised on its own, with its own story, photo and music style. For a trip, that might be Day 1 — Sailaway, Day 3 — First Port, Day 5 — Formal Night, Day 8 — Sunset at Sea. There's no limit from us.
            </p>
          </div>
          <div role="group" aria-labelledby={quantityId} className="inline-flex items-center rounded-full border border-espresso/20 bg-white">
            <button
              type="button"
              aria-label={`One fewer ${product.name}`}
              disabled={draft.quantity <= 1}
              onClick={() => requestVariant(draft.sku, draft.quantity - 1)}
              className="flex h-12 w-12 items-center justify-center rounded-l-full text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              <Minus className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="min-w-[7rem] px-2 text-center text-base text-ink" aria-live="polite">
              {draft.quantity} {draft.quantity === 1 ? product.name : `${product.name}s`}
            </span>
            <button
              type="button"
              aria-label={`One more ${product.name}`}
              disabled={draft.quantity >= maxUnitsFor(product.id)}
              onClick={() => requestVariant(draft.sku, draft.quantity + 1)}
              className="flex h-12 w-12 items-center justify-center rounded-r-full text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {showErrors && !product && (
        <p role="alert" className="text-base text-red-700">
          Please choose an experience to begin.
        </p>
      )}
    </div>
  );
};

export default StepChoose;
