/**
 * YOUR MEMORY — what the customer is about to order, and what it costs.
 *
 * Every line and the total come from `previewOrder`, which prices catalogue
 * SKUs in integer pence using the rules the server applies again when the
 * order is saved. Nothing here is typed by hand.
 */
import { formatMinor, getProduct, type OrderPreview } from "../data/catalogue";
import { approximateLabel } from "../lib/currency";
import { useCurrency } from "../lib/useCurrency";

interface YourMemorySummaryProps {
  productId: string;
  preview: OrderPreview;
  className?: string;
}

const YourMemorySummary = ({ productId, preview, className }: YourMemorySummaryProps) => {
  const { currency, rates } = useCurrency();
  const product = getProduct(productId);
  if (!product || !preview.ok) return null;

  // Display only: the estimate is approximate and never charged.
  const approx = approximateLabel(preview.totalMinor / 100, currency, rates);

  return (
    <section
      aria-labelledby="your-memory-heading"
      className={`rounded-2xl border border-gold/30 bg-ivory p-5 sm:p-6 ${className ?? ""}`}
    >
      <h3
        id="your-memory-heading"
        className="font-serif text-2xl sm:text-[1.75rem] uppercase tracking-[0.14em] text-ink leading-tight"
      >
        Your Memory
      </h3>
      <p className="text-sm text-espresso/60 mt-1.5 mb-5">{product.positioning}</p>

      <dl className="divide-y divide-espresso/10 text-sm">
        {preview.lines.map((line) => (
          <div key={line.sku} className="flex justify-between items-start gap-4 py-3">
            <dt className="min-w-0">
              <span className="block text-espresso font-medium">
                {line.name}
                {line.quantity > 1 && <span className="text-espresso/60"> ×{line.quantity}</span>}
              </span>
              {line.quantity > 1 && (
                <span className="block text-xs text-espresso/55 mt-0.5">{formatMinor(line.unitMinor)} each</span>
              )}
            </dt>
            <dd className="text-right shrink-0 pt-0.5">
              <span className="font-mono text-sm text-espresso">{formatMinor(line.lineMinor)}</span>
            </dd>
          </div>
        ))}

        {product.disclosures.length > 0 && (
          <div className="py-3 text-xs leading-relaxed text-espresso/70">
            {product.disclosures.map((disclosure) => (
              <p key={disclosure}>{disclosure}</p>
            ))}
          </div>
        )}

        {product.turnaround && (
          <div className="flex justify-between items-start gap-4 py-3">
            <dt className="text-espresso/60">Timing</dt>
            <dd className="text-espresso/80 text-right max-w-[15rem]">{product.turnaround.label}</dd>
          </div>
        )}

        {preview.requiresShipping && (
          <div className="flex justify-between items-start gap-4 py-3">
            <dt className="text-espresso/60">Delivery</dt>
            <dd className="text-espresso/80 text-right">Posted to your delivery address</dd>
          </div>
        )}

        {/*
          The pound amount leads on the row that means "this is what you are
          about to be charged"; any local estimate follows, labelled approximate.
        */}
        <div className="flex justify-between items-baseline gap-4 pt-4">
          <dt className="text-espresso font-medium">Total</dt>
          <dd className="text-right">
            <span className="font-serif text-2xl text-ink">{formatMinor(preview.totalMinor)}</span>
            {approx && <span className="mt-0.5 block font-mono text-espresso/55 text-xs">{approx}</span>}
          </dd>
        </div>
      </dl>

      {approx && (
        <p className="mt-3 text-xs leading-relaxed text-espresso/55">
          Local amounts are estimates. Payment is taken in GBP, and your bank sets its own rate and any fees.
        </p>
      )}
    </section>
  );
};

export default YourMemorySummary;
