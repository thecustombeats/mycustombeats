import { ChevronDown } from "lucide-react";
import type { Product } from "../../data/catalogue";
import { refinementOrRemake } from "../../lib/productDetail";

/**
 * "Refinement or remake?" — a native <details>, so it opens with a tap, a
 * click, Enter or Space, and needs no script to be accessible.
 */
const RefinementOrRemake = ({ product }: { product: Pick<Product, "revisions"> }) => (
  <details className="group rounded-2xl border border-ink/15 bg-white">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-lg font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
      Refinement or remake?
      <ChevronDown aria-hidden="true" size={20} className="shrink-0 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-3 px-5 pb-5 text-base leading-relaxed text-espresso/80">
      {refinementOrRemake(product).map((paragraph) => (
        <p key={paragraph} className="text-espresso/80">
          {paragraph}
        </p>
      ))}
    </div>
  </details>
);

export default RefinementOrRemake;
