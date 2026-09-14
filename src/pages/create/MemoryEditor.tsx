import { useId } from "react";
import MusicStyleSelector from "../../components/MusicStyleSelector";
import { OCCASIONS } from "../../data/occasions";
import { ABOUT_MAX, STORY_MAX, type MemoryDraft, type MemoryField } from "../../lib/personalisation";
import PhotoField from "./PhotoField";

interface MemoryEditorProps {
  memory: MemoryDraft;
  /** e.g. "Chapter 3 of 6". */
  label: string;
  /** Prompt suited to the product, e.g. "What happened on this day?". */
  storyPrompt: string;
  photoHint: string;
  photo: File | undefined;
  onPhoto: (file: File | undefined) => void;
  onChange: (change: Partial<Omit<MemoryDraft, "id">>) => void;
  errors: Partial<Record<MemoryField, string>>;
  onStyleEvent?: (event: "style_selected" | "mcb_choice_selected" | "explore_opened", styleId?: string) => void;
}

/** Everything we need for one song: the memory, who it's for, a photo and a style. */
const MemoryEditor = ({ memory, label, storyPrompt, photoHint, photo, onPhoto, onChange, errors, onStyleEvent }: MemoryEditorProps) => {
  const uid = useId();
  const storyId = `${uid}-story`;
  const counterId = `${uid}-counter`;
  const storyErrorId = `${uid}-story-error`;
  const aboutId = `${uid}-about`;
  const occasionId = `${uid}-occasion`;
  const remaining = STORY_MAX - memory.story.length;

  return (
    <div className="space-y-8">
      <div>
        <label htmlFor={storyId} className="block text-lg font-medium text-ink">
          {storyPrompt}
        </label>
        <p className="mt-1 text-sm leading-relaxed text-espresso/65">
          A few honest sentences are plenty — names, a place, a feeling, a detail only you would know. You don't need to write lyrics.
        </p>
        <textarea
          id={storyId}
          value={memory.story}
          maxLength={STORY_MAX}
          rows={5}
          onChange={(e) => onChange({ story: e.target.value })}
          aria-describedby={[counterId, errors.story ? storyErrorId : null].filter(Boolean).join(" ")}
          {...(errors.story ? { "aria-invalid": true } : {})}
          className={`mt-3 w-full rounded-2xl border bg-white px-4 py-3 text-base leading-relaxed text-ink placeholder:text-espresso/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep ${
            errors.story ? "border-red-600" : "border-espresso/15"
          }`}
          placeholder="The evening we…"
        />
        <div className="mt-1 flex items-start justify-between gap-4">
          {errors.story ? (
            <p id={storyErrorId} role="alert" className="text-sm text-red-700">
              {errors.story}
            </p>
          ) : (
            <span />
          )}
          <p id={counterId} aria-live="polite" className={`shrink-0 font-mono text-sm ${remaining < 30 ? "text-gold-deep" : "text-espresso/55"}`}>
            {memory.story.length} / {STORY_MAX}
            <span className="sr-only"> characters used</span>
          </p>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor={aboutId} className="block text-base font-medium text-ink">
            Who is it for, or about? <span className="font-normal text-espresso/60">(optional)</span>
          </label>
          <input
            id={aboutId}
            value={memory.about}
            maxLength={ABOUT_MAX}
            onChange={(e) => onChange({ about: e.target.value })}
            className="mt-2 min-h-12 w-full rounded-xl border border-espresso/15 bg-white px-4 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            placeholder="My wife, Sarah"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor={occasionId} className="block text-base font-medium text-ink">
            Occasion <span className="font-normal text-espresso/60">(optional)</span>
          </label>
          <select
            id={occasionId}
            value={memory.occasion}
            onChange={(e) => onChange({ occasion: e.target.value })}
            className="mt-2 min-h-12 w-full rounded-xl border border-espresso/15 bg-white px-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
          >
            <option value="">Not specified</option>
            {Object.values(OCCASIONS).map((occasion) => (
              <option key={occasion.id} value={occasion.id}>
                {occasion.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PhotoField label="A photo for this memory" hint={photoHint} file={photo} onChange={onPhoto} />

      <MusicStyleSelector
        heading={`Music style — ${label}`}
        value={memory.style}
        onChange={(style) => onChange({ style })}
        customValue={memory.customStyle}
        onCustomChange={(customStyle) => onChange({ customStyle })}
        error={errors.style}
        customError={errors.customStyle}
        fieldId={`${uid}-style`}
        errorId={`${uid}-style-error`}
        customFieldId={`${uid}-custom-style`}
        customErrorId={`${uid}-custom-style-error`}
        onEvent={onStyleEvent}
      />
    </div>
  );
};

export default MemoryEditor;
