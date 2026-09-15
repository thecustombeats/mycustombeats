import { ChevronDown } from "lucide-react";
import { howMcbCreates } from "../../lib/productDetail";

/**
 * "How MCB creates your memory" — the creative-authority model, positive
 * first, in a native <details> so it opens with a tap, a click, Enter or Space
 * and needs no script to be accessible.
 */
const HowMcbCreates = () => (
  <details className="group rounded-2xl border border-ink/15 bg-white">
    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-lg font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
      How MCB creates your memory
      <ChevronDown aria-hidden="true" size={20} className="shrink-0 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="space-y-3 px-5 pb-5 text-base leading-relaxed text-espresso/80">
      {howMcbCreates().map((paragraph) => (
        <p key={paragraph} className="text-espresso/80">
          {paragraph}
        </p>
      ))}
    </div>
  </details>
);

export default HowMcbCreates;
