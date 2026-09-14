import { useEffect, useId, useMemo, useState } from "react";
import { ImagePlus, X } from "lucide-react";

/** Largest photo accepted, matching the upload limit. */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

interface PhotoFieldProps {
  label: string;
  file: File | undefined;
  onChange: (file: File | undefined) => void;
  required?: boolean;
  hint?: string;
  error?: string;
}

/**
 * One photograph for one memory or plaque.
 *
 * The file stays in this browser tab until the order is placed. It is never
 * written to storage, so the hint says so plainly.
 */
const PhotoField = ({ label, file, onChange, required = false, hint, error }: PhotoFieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const [problem, setProblem] = useState<string | null>(null);
  const shownError = problem ?? error;
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const problemWith = (next: File) =>
    !next.type.startsWith("image/") ? "Please choose an image file." : next.size > MAX_PHOTO_BYTES ? "Please choose a photo under 10 MB." : null;

  return (
    <div>
      <p className="text-base font-medium text-ink">
        {label}
        {!required && <span className="font-normal text-espresso/75"> (optional)</span>}
      </p>
      {hint && (
        <p id={hintId} className="mt-1 text-sm leading-relaxed text-espresso/65">
          {hint}
        </p>
      )}

      {preview ? (
        <div className="mt-3 flex items-center gap-4">
          <img src={preview} alt="" className="h-20 w-20 rounded-xl object-cover" width={80} height={80} />
          <div className="min-w-0">
            <p className="truncate text-sm text-espresso/80">Photo added</p>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-gold-deep underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              <X className="h-4 w-4" aria-hidden="true" /> Remove photo
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={`mt-3 flex min-h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-4 text-base text-ink transition-colors focus-within:ring-2 focus-within:ring-gold-deep hover:border-gold ${
            shownError ? "border-red-600 bg-red-50/40" : "border-espresso/20 bg-white"
          }`}
        >
          <ImagePlus className="h-5 w-5 text-gold-deep" aria-hidden="true" />
          <span className="sr-only">{label}: </span>Choose a photo
          <input
            id={id}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-describedby={[hint ? hintId : null, shownError ? errorId : null].filter(Boolean).join(" ") || undefined}
            {...(shownError ? { "aria-invalid": true } : {})}
            onChange={(event) => {
              const next = event.target.files?.[0];
              if (!next) return;
              const found = problemWith(next);
              setProblem(found);
              if (found) {
                event.target.value = "";
                return;
              }
              onChange(next);
            }}
          />
        </label>
      )}

      {shownError && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">
          {shownError}
        </p>
      )}
    </div>
  );
};

export default PhotoField;
