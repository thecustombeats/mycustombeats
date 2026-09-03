/**
 * YOUR MEMORY — the cart summary.
 *
 * Presentational only. Every figure and every line comes from
 * `lib/memory.ts`; this component decides nothing about price, availability
 * or what can be checked out. That separation is what lets the same summary
 * be reused later in a review step or a checkout drawer without carrying the
 * order form's state along with it.
 *
 * TWO THINGS IT IS CAREFUL ABOUT
 * 1. A line with no approved price renders the word "Quoted", never a number
 *    and never "£0". `ProductPrice` gives it nothing else it could render.
 * 2. `Total` is the amount the customer is about to be charged — not the
 *    value of everything in the panel. Quoted pieces sit outside it and say
 *    so, because the Payment Link cannot take them. See lib/memory.ts.
 */

import { formatProductPrice, isPriced } from "../data/catalogue";
import { formatMoney, type MemorySummary } from "../lib/memory";

interface YourMemorySummaryProps {
  memory: MemorySummary;
  className?: string;
}

/** Right-hand value for one line. */
const LinePrice = ({
  line,
}: {
  line: MemorySummary["lines"][number];
}) => {
  if (!isPriced(line.price)) {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.12em] text-espresso/55">
        Quoted
      </span>
    );
  }

  if (line.includedInPackage) {
    return (
      <span className="font-mono text-xs uppercase tracking-[0.12em] text-gold-deep">
        Included
      </span>
    );
  }

  return (
    <span className="font-mono text-sm text-espresso">
      {formatProductPrice(line.price)}
    </span>
  );
};

const YourMemorySummary = ({ memory, className }: YourMemorySummaryProps) => {
  const { pkg } = memory;
  if (!pkg) return null;

  const hasQuoted = memory.quotedLines.length > 0;

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

      <p className="text-sm text-espresso/60 mt-1.5 mb-5">
        {pkg.positioning}
      </p>

      <dl className="divide-y divide-espresso/10 text-sm">
        {memory.lines.map((line) => (
          <div
            key={line.id}
            className="flex justify-between items-start gap-4 py-3"
          >
            <dt className="min-w-0">
              <span className="block text-espresso font-medium">
                {line.label}
              </span>
              {line.detail && (
                <span className="block text-xs text-espresso/55 mt-0.5">
                  {line.detail}
                </span>
              )}
            </dt>
            <dd className="text-right shrink-0 pt-0.5">
              <LinePrice line={line} />
            </dd>
          </div>
        ))}

        {/* Not a priced line — what the experience contains. */}
        <div className="flex justify-between items-start gap-4 py-3">
          <dt className="text-espresso/60">Includes</dt>
          <dd className="text-espresso/80 text-right max-w-[15rem]">
            {pkg.songCount
              ? `${pkg.songCount} personalised ${
                  pkg.songCount === 1 ? "song" : "songs"
                }, ${pkg.revisions.toLowerCase()}`
              : pkg.revisions}
          </dd>
        </div>

        {memory.requiresShipping && (
          <div className="flex justify-between items-start gap-4 py-3">
            <dt className="text-espresso/60">Delivery</dt>
            <dd className="text-espresso/80 text-right">
              Posted to your delivery address
            </dd>
          </div>
        )}

        <div className="flex justify-between items-baseline gap-4 py-3">
          <dt className="text-espresso/60">Subtotal</dt>
          <dd className="font-mono text-sm text-espresso text-right">
            {formatMoney(memory.subtotal)}
          </dd>
        </div>

        <div className="flex justify-between items-baseline gap-4 pt-4">
          <dt className="text-espresso font-medium">Total</dt>
          <dd className="text-right">
            <span className="font-serif text-2xl text-ink">
              {formatMoney(memory.chargeableTotal)}
            </span>
            <span className="font-mono text-espresso/50 text-xs ml-2">
              {formatMoney(memory.chargeableTotal, "usd")}
            </span>
          </dd>
        </div>
      </dl>

      {/*
        Shown only when something in the memory has no approved price. It
        states that those pieces are quoted rather than implying they are
        already paid for — the Payment Link is only taking the total above.
      */}
      {hasQuoted && (
        <p className="text-xs text-espresso/60 leading-relaxed mt-4 pt-4 border-t border-espresso/10">
          {memory.quotedLines.length === 1
            ? `${memory.quotedLines[0].label} is made to order and quoted individually — it is not included in the total above, and we'll confirm it with you directly.`
            : "The made-to-order pieces in this memory are quoted individually. They are not included in the total above, and we'll confirm them with you directly."}
        </p>
      )}
    </section>
  );
};

export default YourMemorySummary;
