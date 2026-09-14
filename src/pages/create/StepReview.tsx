import { Check } from "lucide-react";
import { Link } from "react-router-dom";
import { formatMinor, getProduct, getVariant, type OrderPreview } from "../../data/catalogue";
import { CONSENTS, TERMS_VERSION, getConsent, requiredConsents, type ConsentId } from "../../data/legal";
import { OCCASIONS, type OccasionId } from "../../data/occasions";
import { hasDigitalDelivery, type ContactDetails, type StepId } from "../../lib/createFlow";
import { memoryLabel, mcbChoosesStyle, styleSummary, type OrderDraft } from "../../lib/personalisation";

interface StepReviewProps {
  draft: OrderDraft;
  preview: OrderPreview;
  photos: ReadonlyMap<string, File>;
  contact: ContactDetails;
  consents: Record<ConsentId, boolean>;
  setConsent: (id: ConsentId, value: boolean) => void;
  showErrors: boolean;
  goTo: (step: StepId) => void;
}

const EditLink = ({ onClick, label }: { onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} className="min-h-11 text-base font-medium text-gold-deep underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
    {label}
  </button>
);

const StepReview = ({ draft, preview, photos, contact, consents, setConsent, showErrors, goTo }: StepReviewProps) => {
  const product = getProduct(draft.productId);
  const variant = getVariant(draft.sku)?.variant;
  if (!product || !variant || !preview.ok) return null;
  const required = requiredConsents({ hasDigitalDelivery: hasDigitalDelivery(preview) });
  const anyMcbChoice = draft.units.some((unit) => unit.memories.some(mcbChoosesStyle));

  return (
    <div className="space-y-10">
      {/* ---- What we'll create ---- */}
      <section aria-labelledby="review-songs" className="rounded-2xl bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="review-songs" className="!text-3xl text-ink">Your songs</h2>
          <EditLink onClick={() => goTo("story")} label="Edit your story" />
        </div>
        {draft.units.map((unit, u) => (
          <div key={unit.id} className="mt-6">
            {draft.units.length > 1 && <h3 className="!text-2xl text-ink">{product.name} {u + 1}</h3>}
            <ol className="mt-3 list-none space-y-3 p-0">
              {unit.memories.map((memory, m) => (
                <li key={memory.id} className="rounded-xl border border-espresso/10 p-4">
                  <p className="font-serif text-xl text-ink">{memoryLabel(draft, u, m).replace(`${product.name} ${u + 1} · `, "")}</p>
                  <p className="mt-1 text-base leading-relaxed text-espresso/80">{memory.story}</p>
                  <p className="mt-2 text-sm text-espresso/70">
                    {[
                      memory.about && `For ${memory.about}`,
                      memory.occasion && OCCASIONS[memory.occasion as OccasionId]?.label,
                      styleSummary(memory),
                      photos.has(memory.id) ? "Photo added" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        ))}
        {anyMcbChoice && (
          <p className="mt-5 rounded-xl bg-ivory p-4 text-base leading-relaxed text-espresso/80">
            Where you've asked MCB to choose the style, you're trusting our creative judgement. Refinements within that direction are included; asking for an entirely different genre after the song is produced is a remake rather than a refinement.{" "}
            <Link to="/faq" target="_blank" className="font-medium text-gold-deep underline underline-offset-4">Refinement or remake?</Link>
          </p>
        )}
      </section>

      {/* ---- Finishing touches ---- */}
      {(draft.plaques.length > 0 || draft.frames.length > 0 || draft.players.length > 0 || draft.priorityReplacementQuantity > 0) && (
        <section aria-labelledby="review-extras" className="rounded-2xl bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="review-extras" className="!text-3xl text-ink">Finishing touches</h2>
            <EditLink onClick={() => goTo("extras")} label="Edit" />
          </div>
          <ul className="mt-4 list-none space-y-2 p-0 text-base text-espresso/80">
            {draft.plaques.map((plaque, i) => (
              <li key={plaque.id}>Plaque {i + 1}: “{plaque.songTitle}” by {plaque.artist}{photos.has(plaque.id) ? " · photo added" : ""}</li>
            ))}
            {draft.frames.map((frame, i) => {
              const position = draft.units.flatMap((unit, u) => unit.memories.map((memory, m) => ({ id: memory.id, label: memoryLabel(draft, u, m) }))).find((s) => s.id === frame.memoryId);
              return <li key={frame.id}>Lyrics frame {i + 1}: {getVariant(frame.sku)?.variant.label} · {position?.label}{frame.heading ? ` · “${frame.heading}”` : ""}</li>;
            })}
          </ul>
        </section>
      )}

      {/* ---- Delivery and contact ---- */}
      <section aria-labelledby="review-details" className="rounded-2xl bg-white p-5 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="review-details" className="!text-3xl text-ink">Your details</h2>
          <EditLink onClick={() => goTo("details")} label="Edit" />
        </div>
        <p className="mt-3 text-base text-espresso/80">{contact.firstName} {contact.lastName} · {contact.email}</p>
        {preview.requiresShipping && (
          <p className="mt-2 text-base text-espresso/80">
            Sending to {contact.shippingName}, {[contact.shippingAddress, contact.shippingAddress2, contact.shippingCity, contact.shippingPostcode, contact.shippingCountry].filter(Boolean).join(", ")}
          </p>
        )}
        {product.turnaround && <p className="mt-2 text-sm text-espresso/70">{product.turnaround.label}</p>}
      </section>

      {/* ---- Price ---- */}
      <section aria-labelledby="review-price" className="rounded-2xl border border-gold/40 bg-ivory p-5 sm:p-7">
        <h2 id="review-price" className="!text-3xl text-ink">Your order</h2>
        <dl className="mt-4 divide-y divide-espresso/10">
          {preview.lines.map((line) => (
            <div key={line.sku} className="flex items-start justify-between gap-4 py-3 text-base">
              <dt className="text-espresso/85">
                {line.name}{line.quantity > 1 && <span className="text-espresso/60"> × {line.quantity}</span>}
              </dt>
              <dd className="font-mono text-ink">{formatMinor(line.lineMinor)}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 pt-4">
            <dt className="text-lg font-medium text-ink">Total</dt>
            <dd className="font-serif text-3xl text-ink">{formatMinor(preview.totalMinor)}</dd>
          </div>
        </dl>
        {preview.requiresShipping && (
          <p className="mt-3 text-base text-espresso/75">Delivery is calculated separately before payment.</p>
        )}
        <p className="mt-2 text-sm text-espresso/65">Prices in GBP. Payment is taken in GBP.</p>
      </section>

      {/* ---- Consent ---- */}
      <fieldset className="space-y-4" data-field="consents">
        <legend className="mb-2 font-serif text-2xl text-ink">Before we begin</legend>
        {CONSENTS.filter((consent) => required.includes(consent.id)).map((consent) => {
          const id = `consent-${consent.id}`;
          const error = showErrors && !consents[consent.id] ? getConsent(consent.id)?.error ?? "Please confirm this to continue." : undefined;
          return (
            <div key={consent.id} className={`rounded-2xl border p-4 ${error ? "border-red-600 bg-red-50/40" : consents[consent.id] ? "border-gold-dark bg-gold/5" : "border-espresso/15 bg-white"}`}>
              <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center -m-2.5">
                  <input
                    type="checkbox"
                    id={id}
                    checked={consents[consent.id]}
                    onChange={(e) => setConsent(consent.id, e.target.checked)}
                    aria-describedby={[`${id}-detail`, error ? `${id}-error` : null].filter(Boolean).join(" ")}
                    {...(error ? { "aria-invalid": true } : {})}
                    className="peer h-6 w-6 cursor-pointer appearance-none rounded-md border-2 border-espresso/40 bg-white checked:border-gold-deep checked:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
                  />
                  <Check aria-hidden="true" strokeWidth={3.5} className="pointer-events-none absolute h-4 w-4 text-white opacity-0 peer-checked:opacity-100" />
                </span>
                <span>
                  <span className="block text-base leading-relaxed text-ink">{consent.label}</span>
                  <span id={`${id}-detail`} className="mt-1 block text-sm leading-relaxed text-espresso/70">{consent.detail}</span>
                  {consent.id === "TERMS" && (
                    <span className="mt-2 block text-sm text-espresso/70">
                      <Link to="/legal/terms" target="_blank" className="text-gold-deep underline underline-offset-4">Terms &amp; Conditions</Link>
                      {" · "}
                      <Link to="/legal/refund" target="_blank" className="text-gold-deep underline underline-offset-4">Refunds &amp; Cancellations</Link>
                      {" · "}
                      <Link to="/legal/privacy" target="_blank" className="text-gold-deep underline underline-offset-4">Privacy Policy</Link>
                      <span className="mt-1 block text-espresso/60">Terms version {TERMS_VERSION}.</span>
                    </span>
                  )}
                </span>
              </label>
              {error && <p id={`${id}-error`} role="alert" className="mt-3 pl-9 text-sm text-red-700">{error}</p>}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
};

export default StepReview;
