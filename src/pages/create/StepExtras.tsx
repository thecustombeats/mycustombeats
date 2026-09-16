import { useId } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Plus, Trash2 } from "lucide-react";
import ResponsiveImage from "../../components/ResponsiveImage";
import {
  LYRICS_FRAME,
  PERSONALISED_MUSIC_PLAQUE,
  POP_UP_CARD,
  PRIORITY_REPLACEMENT,
  PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  formatMoney,
  getProduct,
  publicProducts,
  groupedCards,
} from "../../data/catalogue";
import { PRODUCT_IMAGERY } from "../../data/imagery";
import { DELIVERY_CONFIRMED_FIRST_NOTE } from "../../data/legal/delivery";
import {
  ARTIST_MAX,
  FRAME_HEADING_MAX,
  SONG_TITLE_MAX,
  addFrame,
  addOnIssues,
  addPlaque,
  memoryLabel,
  priorityReplacementLimit,
  setPlayer,
  setPriorityReplacement,
  type AddOnIssue,
  type OrderDraft,
} from "../../lib/personalisation";
import PhotoField from "./PhotoField";
import VideoOffer from "./VideoOffer";

interface StepExtrasProps {
  draft: OrderDraft;
  setDraft: (update: (draft: OrderDraft) => OrderDraft) => void;
  photos: ReadonlyMap<string, File>;
  setPhoto: (id: string, file: File | undefined) => void;
  showErrors: boolean;
  onAdd: (sku: string, quantity: number) => void;
}

const PLAYERS = publicProducts().filter((product) => product.category === "PLAYER" && product.onlineCheckout);

const fieldClass = (error?: string) =>
  `mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep ${error ? "border-red-600" : "border-espresso/15"}`;

const Stepper = ({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) => (
  <div role="group" aria-label={label} className="inline-flex items-center rounded-full border border-espresso/20 bg-white">
    <button type="button" aria-label={`Fewer: ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-12 w-12 items-center justify-center rounded-l-full text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
      <Minus className="h-5 w-5" aria-hidden="true" />
    </button>
    <span className="min-w-10 text-center font-mono text-base text-ink" aria-live="polite">{value}</span>
    <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-12 w-12 items-center justify-center rounded-r-full text-ink disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
      <Plus className="h-5 w-5" aria-hidden="true" />
    </button>
  </div>
);

const StepExtras = ({ draft, setDraft, photos, setPhoto, showErrors, onAdd }: StepExtrasProps) => {
  const uid = useId();
  const issues = showErrors ? addOnIssues(draft, new Set(photos.keys())) : [];
  const issue = (id: string, field: AddOnIssue["field"]) => issues.find((i) => i.id === id && i.field === field)?.message;
  const product = getProduct(draft.productId);
  const prLimit = priorityReplacementLimit(draft);
  const plaquePrice = formatMoney(PERSONALISED_MUSIC_PLAQUE.variants[0].price);
  const songs = draft.units.flatMap((unit, u) => unit.memories.map((memory, m) => ({ id: memory.id, label: memoryLabel(draft, u, m) })));

  return (
    <div className="space-y-12">
      <p className="text-lg leading-relaxed text-espresso/80">
        Everything here is optional. Add a piece to display, a way to play your record, or peace of mind for your Keepsake.
      </p>

      {/* ---- MCB Memory Music Video: optional, never preselected ---- */}
      <VideoOffer draft={draft} setDraft={setDraft} />

      {/* ---- Personalised Music Plaque ---- */}
      <section aria-labelledby={`${uid}-plaque`} className="rounded-2xl bg-white p-5 sm:p-7">
        <h2 id={`${uid}-plaque`} className="!text-3xl text-ink">{PERSONALISED_MUSIC_PLAQUE.name}</h2>
        <p className="mt-1 font-mono text-base text-ink">{plaquePrice} each</p>
        <p className="mt-3 text-base leading-relaxed text-espresso/80">{PERSONALISED_MUSIC_PLAQUE.shortDescription}</p>
        <ul className="mt-3 space-y-1 text-base text-espresso/80">
          {PERSONALISED_MUSIC_PLAQUE.disclosures.map((d) => <li key={d}>{d}</li>)}
          <li>{DELIVERY_CONFIRMED_FIRST_NOTE}</li>
        </ul>

        {draft.plaques.map((plaque, i) => (
          <fieldset key={plaque.id} className="mt-6 space-y-5 rounded-2xl border border-espresso/12 p-4 sm:p-5">
            <legend className="px-1 font-serif text-xl text-ink">Plaque {i + 1}</legend>
            <PhotoField
              label="Your photograph"
              required
              hint="The photo shown on your plaque."
              file={photos.get(plaque.id)}
              onChange={(file) => setPhoto(plaque.id, file)}
              error={issue(plaque.id, "photo")}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              {(["songTitle", "artist"] as const).map((field) => {
                const id = `${uid}-${plaque.id}-${field}`;
                const error = issue(plaque.id, field);
                return (
                  <div key={field}>
                    <label htmlFor={id} className="block text-base font-medium text-ink">
                      {field === "songTitle" ? "Song title" : "Artist"}
                    </label>
                    <input
                      id={id}
                      value={plaque[field]}
                      maxLength={field === "songTitle" ? SONG_TITLE_MAX : ARTIST_MAX}
                      onChange={(e) => setDraft((d) => ({ ...d, plaques: d.plaques.map((p) => (p.id === plaque.id ? { ...p, [field]: e.target.value } : p)) }))}
                      aria-describedby={error ? `${id}-error` : undefined}
                      {...(error ? { "aria-invalid": true } : {})}
                      className={fieldClass(error)}
                      autoComplete="off"
                    />
                    {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => { setPhoto(plaque.id, undefined); setDraft((d) => ({ ...d, plaques: d.plaques.filter((p) => p.id !== plaque.id) })); }}
              className="inline-flex min-h-11 items-center gap-2 text-base font-medium text-gold-deep underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove plaque {i + 1}
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => { setDraft(addPlaque); onAdd(PERSONALISED_MUSIC_PLAQUE.variants[0].sku, 1); }}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/25 px-6 text-base font-semibold text-ink hover:border-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> {draft.plaques.length ? "Add another plaque" : "Add a plaque"}
        </button>
      </section>

      {/* ---- Lyrics Frames ---- */}
      <section aria-labelledby={`${uid}-frames`} className="rounded-2xl bg-white p-5 sm:p-7">
        <div className="grid gap-6 sm:grid-cols-[1fr_10rem]">
          <div>
            <h2 id={`${uid}-frames`} className="!text-3xl text-ink">{LYRICS_FRAME.name}</h2>
            <p className="mt-3 text-base leading-relaxed text-espresso/80">
              The lyrics of one of your songs, set as typography and framed for the wall. Choose the song and, if you like, a heading.
            </p>
          </div>
          {PRODUCT_IMAGERY["lyrics-frame"] && (
            <ResponsiveImage image={PRODUCT_IMAGERY["lyrics-frame"]} sizes="10rem" className="hidden aspect-square w-full rounded-xl object-cover sm:block" />
          )}
        </div>

        {draft.frames.map((frame, i) => {
          const sizeId = `${uid}-${frame.id}-size`;
          const songId = `${uid}-${frame.id}-song`;
          const headingId = `${uid}-${frame.id}-heading`;
          const songError = issue(frame.id, "memoryId");
          const update = (change: Partial<typeof frame>) => setDraft((d) => ({ ...d, frames: d.frames.map((f) => (f.id === frame.id ? { ...f, ...change } : f)) }));
          return (
            <fieldset key={frame.id} className="mt-6 grid gap-5 rounded-2xl border border-espresso/12 p-4 sm:grid-cols-3 sm:p-5">
              <legend className="px-1 font-serif text-xl text-ink">Frame {i + 1}</legend>
              <div>
                <label htmlFor={sizeId} className="block text-base font-medium text-ink">Size</label>
                <select id={sizeId} value={frame.sku} onChange={(e) => update({ sku: e.target.value })} className={fieldClass()}>
                  {LYRICS_FRAME.variants.map((v) => (
                    <option key={v.sku} value={v.sku}>{v.label} — {formatMoney(v.price)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={songId} className="block text-base font-medium text-ink">Which song?</label>
                <select
                  id={songId}
                  value={frame.memoryId}
                  onChange={(e) => update({ memoryId: e.target.value })}
                  aria-describedby={songError ? `${songId}-error` : undefined}
                  className={fieldClass(songError)}
                >
                  {songs.map((song) => <option key={song.id} value={song.id}>{song.label}</option>)}
                </select>
                {songError && <p id={`${songId}-error`} role="alert" className="mt-1 text-sm text-red-700">{songError}</p>}
              </div>
              <div>
                <label htmlFor={headingId} className="block text-base font-medium text-ink">Heading <span className="font-normal text-espresso/75">(optional)</span></label>
                <input id={headingId} value={frame.heading} maxLength={FRAME_HEADING_MAX} onChange={(e) => update({ heading: e.target.value })} className={fieldClass()} placeholder="Our Song" autoComplete="off" />
              </div>
              <button
                type="button"
                onClick={() => setDraft((d) => ({ ...d, frames: d.frames.filter((f) => f.id !== frame.id) }))}
                className="inline-flex min-h-11 items-center gap-2 text-base font-medium text-gold-deep underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep sm:col-span-3"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remove frame {i + 1}
              </button>
            </fieldset>
          );
        })}
        <button
          type="button"
          disabled={songs.length === 0}
          onClick={() => { setDraft((d) => addFrame(d, LYRICS_FRAME.variants[0].sku)); onAdd(LYRICS_FRAME.variants[0].sku, 1); }}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full border border-ink/25 px-6 text-base font-semibold text-ink hover:border-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
        >
          <Plus className="h-5 w-5" aria-hidden="true" /> {draft.frames.length ? "Add another frame" : "Add a lyrics frame"}
        </button>
      </section>

      {/* ---- Players ---- */}
      <section aria-labelledby={`${uid}-players`} className="rounded-2xl bg-white p-5 sm:p-7">
        <h2 id={`${uid}-players`} className="!text-3xl text-ink">Play it at home</h2>
        <p className="mt-3 text-base leading-relaxed text-espresso/80">{DELIVERY_CONFIRMED_FIRST_NOTE} You'll see which at Review, before anything is charged.</p>
        <ul className="mt-6 grid list-none gap-5 p-0 sm:grid-cols-3">
          {PLAYERS.map((player) => {
            const sku = player.variants[0].sku;
            const quantity = draft.players.find((p) => p.sku === sku)?.quantity ?? 0;
            const image = PRODUCT_IMAGERY[player.id];
            return (
              <li key={player.id} className="flex flex-col rounded-2xl border border-espresso/12 p-4">
                {image && <ResponsiveImage image={image} sizes="(min-width: 640px) 16rem, 100vw" className="aspect-[3/2] w-full rounded-xl object-cover" />}
                <p className="mt-3 font-serif text-xl text-ink">{player.name}</p>
                <p className="mt-1 text-sm leading-relaxed text-espresso/75">{player.shortDescription}</p>
                <p className="mt-2 font-mono text-base text-ink">{formatMoney(player.variants[0].price)}</p>
                <div className="mt-auto pt-3">
                  <Stepper label={player.name} value={quantity} min={0} max={50} onChange={(n) => { setDraft((d) => setPlayer(d, sku, n)); if (n > quantity) onAdd(sku, 1); }} />
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ---- Pop-up cards ---- */}
      {POP_UP_CARD.active && POP_UP_CARD.public && POP_UP_CARD.onlineCheckout && (
        <section aria-labelledby={`${uid}-cards`} className="rounded-2xl bg-white p-5 sm:p-7">
          <h2 id={`${uid}-cards`} className="!text-3xl text-ink">{POP_UP_CARD.name}</h2>
          <p className="mt-3 text-base leading-relaxed text-espresso/80">{POP_UP_CARD.shortDescription} {DELIVERY_CONFIRMED_FIRST_NOTE}</p>
          {/* Grouped by occasion, and every group but the first is collapsed.
              Eighteen steppers opened flat was the single densest thing in the
              order form; most customers want one occasion. Nothing is hidden —
              each group says how many it holds and opens on one tap. */}
          <div className="mt-6 space-y-3">
            {groupedCards().map(({ group, variants }, index) => {
              const chosen = variants.reduce(
                (total, card) => total + (draft.players.find((p) => p.sku === card.sku)?.quantity ?? 0),
                0
              );
              return (
                <details key={group.id} open={index === 0 || chosen > 0} className="rounded-2xl border border-espresso/12 bg-ivory/60">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-lg text-ink [&::-webkit-details-marker]:hidden">
                    <span>
                      {group.label}
                      <span className="ml-2 text-base text-espresso/70">
                        ({variants.length} {variants.length === 1 ? "design" : "designs"})
                      </span>
                    </span>
                    {chosen > 0 && (
                      <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-sm font-semibold text-ivory">{chosen} added</span>
                    )}
                  </summary>
                  <div className="px-4 pb-4">
                    <p className="text-base text-espresso/75">{group.hint}</p>
                    <ul className="mt-4 grid list-none gap-4 p-0 sm:grid-cols-2">
                      {variants.map((card) => {
                        const quantity = draft.players.find((p) => p.sku === card.sku)?.quantity ?? 0;
                        return (
                          <li key={card.sku} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-espresso/12 bg-white p-4">
                            <div className="min-w-0">
                              <p className="text-lg text-ink">{card.label}</p>
                              <p className="mt-1 font-mono text-base text-ink">{formatMoney(card.price)}</p>
                            </div>
                            <Stepper label={card.name} value={quantity} min={0} max={50} onChange={(n) => { setDraft((d) => setPlayer(d, card.sku, n)); if (n > quantity) onAdd(card.sku, 1); }} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </details>
              );
            })}
          </div>
        </section>
      )}

      {/* ---- Priority Replacement: Keepsakes only, never preselected ---- */}
      {prLimit > 0 && product && (
        <section aria-labelledby={`${uid}-pr`} className="rounded-2xl border border-espresso/12 bg-ivory p-5 sm:p-7">
          <h2 id={`${uid}-pr`} className="!text-3xl text-ink">{PRIORITY_REPLACEMENT.name}</h2>
          <p className="mt-1 font-mono text-base text-ink">{formatMoney(PRIORITY_REPLACEMENT.variants[0].price)} per {product.name}</p>
          <p className="mt-3 text-base leading-relaxed text-espresso/80">{PRIORITY_REPLACEMENT.shortDescription}</p>
          <p className="mt-3 text-base leading-relaxed text-espresso/80">
            If you choose it, please request the priority service within {PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days of confirmed delivery. That window applies only to this optional service. Your normal consumer rights are not affected, and you don't need this service to use them.
          </p>
          <fieldset className="mt-5">
            <legend className="text-base font-medium text-ink">
              {prLimit === 1 ? `Add it for your ${product.name}?` : `Choose which of your ${prLimit} ${product.name}s to protect`}
            </legend>
            <ul className="m-0 mt-3 list-none space-y-3 p-0">
              {draft.units.map((unit, u) => {
                const id = `${uid}-pr-${unit.id}`;
                const first = unit.memories[0]?.story.trim();
                return (
                  <li key={unit.id}>
                    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 ${unit.priorityReplacement ? "border-gold-dark" : "border-espresso/15"}`}>
                      <span className="relative -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
                        <input
                          id={id}
                          type="checkbox"
                          checked={unit.priorityReplacement}
                          onChange={(e) => setDraft((d) => setPriorityReplacement(d, u, e.target.checked))}
                          className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-espresso/40 bg-white checked:border-gold-deep checked:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
                        />
                        <Check aria-hidden="true" strokeWidth={3.5} className="pointer-events-none absolute h-4 w-4 text-white opacity-0 peer-checked:opacity-100" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base text-ink">
                          {prLimit === 1 ? `${PRIORITY_REPLACEMENT.name} for this ${product.name}` : `${product.name} ${u + 1}`}
                          <span className="font-mono text-espresso/70"> · {formatMoney(PRIORITY_REPLACEMENT.variants[0].price)}</span>
                        </span>
                        {prLimit > 1 && first && <span className="mt-0.5 block truncate text-sm text-espresso/65">{first}</span>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
          <Link to="/priority-replacement" target="_blank" className="mt-4 inline-block text-base font-medium text-gold-deep underline underline-offset-4">
            How {PRIORITY_REPLACEMENT.name} works
          </Link>
        </section>
      )}
    </div>
  );
};

export default StepExtras;
