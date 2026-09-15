import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { ARTWORK_PREPARATION, formatMoney, getProduct } from "../../data/catalogue";
import {
  isArtworkReady,
  isMemoryComplete,
  photoIssues,
  usesPhotoArtwork,
  type PhotoCheck,
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
  photoChecks?: ReadonlyMap<string, PhotoCheck>;
  setPhoto: (id: string, file: File | undefined) => void;
  showErrors: boolean;
  onStyleEvent: (event: "style_selected" | "mcb_choice_selected" | "explore_opened", styleId?: string) => void;
}

const COPY: Record<string, { intro: string; prompt: string; photo: string }> = {
  moment: {
    intro: "One memory, one song. Tell us what happened and how it felt — we'll take it from there.",
    prompt: "What's the memory?",
    photo: "Optional. A photo helps us feel the moment.",
  },
  keepsake: {
    intro: "Every song on your picture disc has its own memory, photo and music style.",
    prompt: "What's the memory for this song?",
    photo: "MCB creates your picture-disc artwork from your photograph, so each Keepsake needs at least one. Square and at least 2500 × 2500 pixels is best.",
  },
  journey: {
    intro: "Your Journey is told in chapters. Each chapter becomes its own song, in its own style if you wish.",
    prompt: "What happened in this chapter?",
    photo: "MCB creates your sleeve artwork from your photographs, so your Journey needs at least one. Square and at least 2500 × 2500 pixels is best.",
  },
};

const NO_CHECKS: ReadonlyMap<string, PhotoCheck> = new Map();
const PREPARATION_PRICE = ARTWORK_PREPARATION.variants[0] ? formatMoney(ARTWORK_PREPARATION.variants[0].price) : "";

const StepStory = ({ draft, setDraft, photos, photoChecks = NO_CHECKS, setPhoto, showErrors, onStyleEvent }: StepStoryProps) => {
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

  const photoArtwork = usesPhotoArtwork(draft);
  const photoIds = new Set(photos.keys());
  const missingPhoto = photoIssues(draft, photoIds, photoChecks).find((issue) => issue.kind === "missing" && issue.id === unit.id);
  const notReadyCount = photoArtwork
    ? draft.units.reduce((n, u) => n + u.memories.filter((m) => photos.has(m.id) && photoChecks.has(m.id) && !isArtworkReady(photoChecks.get(m.id))).length, 0)
    : 0;

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
                  <span className={`font-mono text-sm ${current ? "text-ivory/75" : "text-espresso/75"}`}>
                    {done}/{u.memories.length}
                  </span>
                  {done === u.memories.length && <Check className="h-4 w-4" aria-label="ready" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {photoArtwork && (
        <p className={`rounded-2xl p-4 text-base leading-relaxed ${showErrors && missingPhoto ? "border border-red-600 bg-red-50/40 text-red-800" : "bg-ivory text-espresso/80"}`} role={showErrors && missingPhoto ? "alert" : undefined}>
          {missingPhoto
            ? `${missingPhoto.message} You can add it to any memory below.`
            : "Thank you — MCB will create your artwork from your photograph."}
        </p>
      )}

      {photoArtwork && (notReadyCount > 0 || draft.artworkPreparation) && (
        <div className="rounded-2xl border border-gold/50 bg-white p-4 sm:p-5" role="status">
          {draft.artworkPreparation ? (
            <>
              <p className="text-base leading-relaxed text-ink">
                <strong>{ARTWORK_PREPARATION.name}</strong> ({PREPARATION_PRICE}) is added to your order. Our team will prepare your photograph for your artwork as far as the original allows.
              </p>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, artworkPreparation: false }))} className="mt-3 inline-flex min-h-11 items-center rounded-full border border-ink/25 px-5 text-base font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                Remove {ARTWORK_PREPARATION.name}
              </button>
            </>
          ) : (
            <>
              <p className="text-base leading-relaxed text-ink">
                {notReadyCount === 1 ? "One of your photographs isn't" : `${notReadyCount} of your photographs aren't`} artwork-ready. For the best result we need a square photo of at least 2500 × 2500 pixels (larger is welcome).
              </p>
              <p className="mt-2 text-base leading-relaxed text-espresso/80">
                You can choose another photo below, or add the optional {ARTWORK_PREPARATION.name} for {PREPARATION_PRICE}, once for this order. {ARTWORK_PREPARATION.disclosures[1]}
              </p>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, artworkPreparation: true }))} className="mt-3 inline-flex min-h-12 items-center rounded-full bg-ink px-5 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2">
                Add {ARTWORK_PREPARATION.name} — {PREPARATION_PRICE}
              </button>
            </>
          )}
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
                    <ChevronDown aria-hidden="true" className={`h-5 w-5 shrink-0 text-espresso/75 transition-transform ${open ? "rotate-180" : ""}`} />
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
                    photoRequired={photoArtwork}
                    photoNote={
                      photoArtwork && photos.has(memory.id)
                        ? !photoChecks.has(memory.id)
                          ? "Checking your photograph…"
                          : isArtworkReady(photoChecks.get(memory.id))
                            ? "Artwork-ready."
                            : draft.artworkPreparation
                              ? `Not artwork-ready — ${ARTWORK_PREPARATION.name} will prepare it.`
                              : "Not artwork-ready: square, at least 2500 × 2500 pixels is needed. Choose another photo, or add Artwork Preparation above."
                        : undefined
                    }
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
