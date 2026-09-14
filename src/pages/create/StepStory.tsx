import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { getProduct } from "../../data/catalogue";
import {
  isMemoryComplete,
  memoryIssues,
  memoryLabel,
  styleSummary,
  updateMemory,
  type MemoryField,
  type OrderDraft,
} from "../../lib/personalisation";
import MemoryEditor from "./MemoryEditor";

interface StepStoryProps {
  draft: OrderDraft;
  setDraft: (update: (draft: OrderDraft) => OrderDraft) => void;
  photos: ReadonlyMap<string, File>;
  setPhoto: (id: string, file: File | undefined) => void;
  showErrors: boolean;
  onStyleEvent: (event: "style_selected" | "mcb_choice_selected" | "explore_opened", styleId?: string) => void;
}

const COPY: Record<string, { intro: string; prompt: string; photo: string }> = {
  moment: {
    intro: "One memory, one song. Tell us what happened and how it felt — we'll take it from there.",
    prompt: "What's the memory?",
    photo: "A photo helps us feel the moment.",
  },
  keepsake: {
    intro: "Every song on your picture disc has its own memory, photo and music style.",
    prompt: "What's the memory for this song?",
    photo: "It can help us design your picture-disc artwork.",
  },
  journey: {
    intro: "Your Journey is told in chapters. Each chapter becomes its own song, in its own style if you wish.",
    prompt: "What happened in this chapter?",
    photo: "Your approved photographs can be used in your sleeve artwork.",
  },
};

const StepStory = ({ draft, setDraft, photos, setPhoto, showErrors, onStyleEvent }: StepStoryProps) => {
  const product = getProduct(draft.productId);
  const copy = COPY[draft.productId] ?? COPY.moment;
  const [unitIndex, setUnitIndex] = useState(0);
  const unit = draft.units[Math.min(unitIndex, draft.units.length - 1)];
  const firstIncomplete = unit?.memories.find((memory) => !isMemoryComplete(memory))?.id;
  const [openId, setOpenId] = useState<string | null>(unit?.memories.length === 1 ? unit.memories[0].id : firstIncomplete ?? null);
  const panelRefs = useRef(new Map<string, HTMLElement>());

  const total = draft.units.reduce((n, u) => n + u.memories.length, 0);
  const ready = draft.units.reduce((n, u) => n + u.memories.filter(isMemoryComplete).length, 0);

  // After a failed "Continue", open the first memory that still needs something.
  useEffect(() => {
    if (!showErrors) return;
    for (let u = 0; u < draft.units.length; u++) {
      const incomplete = draft.units[u].memories.find((memory) => !isMemoryComplete(memory));
      if (incomplete) {
        setUnitIndex(u);
        setOpenId(incomplete.id);
        window.setTimeout(() => panelRefs.current.get(incomplete.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
        return;
      }
    }
    // Only when the attempt changes, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showErrors]);

  if (!unit || !product) return null;

  const openNext = (currentIndex: number) => {
    const next = unit.memories[currentIndex + 1];
    if (next) {
      setOpenId(next.id);
      window.setTimeout(() => panelRefs.current.get(next.id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    } else if (unitIndex + 1 < draft.units.length) {
      setUnitIndex(unitIndex + 1);
      setOpenId(draft.units[unitIndex + 1].memories[0].id);
      window.setTimeout(() => window.scrollTo({ top: 0, behavior: "smooth" }), 0);
    } else {
      setOpenId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-lg leading-relaxed text-espresso/80">{copy.intro}</p>
        <p className="mt-3 font-mono text-sm text-espresso/70" aria-live="polite">
          {ready} of {total} {total === 1 ? "memory" : product.id === "journey" ? "chapters" : "memories"} ready
        </p>
      </div>

      {draft.units.length > 1 && (
        <div>
          <p id="unit-tabs-label" className="text-base font-medium text-ink">
            Your {draft.units.length} {product.name}s — each one is personalised separately
          </p>
          <div role="group" aria-labelledby="unit-tabs-label" className="mt-3 flex flex-wrap gap-2">
            {draft.units.map((u, i) => {
              const done = u.memories.filter(isMemoryComplete).length;
              const current = i === unitIndex;
              return (
                <button
                  key={u.id}
                  type="button"
                  aria-pressed={current}
                  onClick={() => {
                    setUnitIndex(i);
                    setOpenId(u.memories.find((m) => !isMemoryComplete(m))?.id ?? u.memories[0].id);
                  }}
                  className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-base transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep ${
                    current ? "border-ink bg-ink text-ivory" : "border-espresso/20 bg-white text-ink hover:border-gold"
                  }`}
                >
                  {product.name} {i + 1}
                  <span className={`font-mono text-xs ${current ? "text-ivory/75" : "text-espresso/60"}`}>
                    {done}/{u.memories.length}
                  </span>
                  {done === u.memories.length && <Check className="h-4 w-4" aria-label="ready" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ol className="m-0 list-none space-y-3 p-0">
        {unit.memories.map((memory, memoryIndex) => {
          const label = memoryLabel(draft, draft.units.indexOf(unit), memoryIndex);
          const complete = isMemoryComplete(memory);
          const open = openId === memory.id || unit.memories.length === 1;
          const errors: Partial<Record<MemoryField, string>> = {};
          if (showErrors) for (const issue of memoryIssues(memory)) errors[issue.field] ??= issue.message;
          const hasError = Object.keys(errors).length > 0;
          const panelId = `panel-${memory.id}`;

          return (
            <li
              key={memory.id}
              ref={(el) => {
                if (el) panelRefs.current.set(memory.id, el);
              }}
              className={`scroll-mt-24 rounded-2xl border bg-white ${hasError ? "border-red-600" : open ? "border-gold-dark" : "border-espresso/12"}`}
            >
              <h2 className="!text-base !font-sans !font-normal">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  disabled={unit.memories.length === 1}
                  onClick={() => setOpenId(open ? null : memory.id)}
                  className="flex min-h-16 w-full items-center gap-4 rounded-2xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep disabled:cursor-default sm:px-6"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-mono text-sm ${
                      complete ? "bg-gold-dark text-white" : "border border-espresso/25 text-ink"
                    }`}
                  >
                    {complete ? <Check className="h-4 w-4" /> : memoryIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-serif text-xl leading-tight text-ink">{label}</span>
                    <span className="mt-0.5 block truncate text-sm text-espresso/65">
                      {complete ? `Ready · ${styleSummary(memory)}` : memory.story ? memory.story : "Not started yet"}
                    </span>
                  </span>
                  {unit.memories.length > 1 && (
                    <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-espresso/60 transition-transform ${open ? "rotate-180" : ""}`} />
                  )}
                </button>
              </h2>

              {open && (
                <div id={panelId} className="border-t border-espresso/10 px-4 pb-6 pt-6 sm:px-6">
                  <MemoryEditor
                    memory={memory}
                    label={label}
                    storyPrompt={copy.prompt}
                    photoHint={copy.photo}
                    photo={photos.get(memory.id)}
                    onPhoto={(file) => setPhoto(memory.id, file)}
                    onChange={(change) => setDraft((d) => updateMemory(d, memory.id, change))}
                    errors={errors}
                    onStyleEvent={onStyleEvent}
                  />
                  {(memoryIndex + 1 < unit.memories.length || unitIndex + 1 < draft.units.length) && (
                    <button
                      type="button"
                      onClick={() => openNext(memoryIndex)}
                      className="mt-8 inline-flex min-h-12 items-center rounded-full border border-ink/25 px-6 text-base font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
                    >
                      {memoryIndex + 1 < unit.memories.length
                        ? `Next: ${memoryLabel(draft, draft.units.indexOf(unit), memoryIndex + 1)}`
                        : `Next: ${product.name} ${unitIndex + 2}`}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default StepStory;
