/**
 * BESPOKE — the private concierge page (canonical route /bespoke).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS PAGE IS
 * ─────────────────────────────────────────────────────────────────────────
 * Bespoke has no price and no checkout, so this page cannot be a
 * product page with the price removed. What replaces the price is the
 * sequence: what happens, in what order, and exactly where payment falls in
 * it — last, and after a written agreement.
 *
 * That is stated before the form, not after it, because it is the thing a
 * customer needs to know in order to be willing to write to a company that
 * has not told them what anything costs.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT IS AN ENQUIRY FORM, AND IT SAYS SO EVERYWHERE IT MATTERS
 * ─────────────────────────────────────────────────────────────────────────
 * There is no basket, no total, no "checkout", no Stripe and no card field.
 * The submit button says what it does. The acknowledgement says "received",
 * never "confirmed" and never "order". Nothing on this page or after it uses
 * the vocabulary of a completed purchase, because none has happened.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { ArrowRight, Check } from "lucide-react";
import { BESPOKE } from "../data/catalogue";
// Separate import: tests/hardening-acceptance.sh asserts the line above verbatim.
import { MCB_LIVE } from "../data/catalogue";
import { PACKAGE_IMAGERY } from "../data/imagery";
import ResponsiveImage from "../components/ResponsiveImage";
import { productPageStructuredData } from "../lib/seo";
import { SUPPORTED_CURRENCIES, type CurrencyCode } from "../lib/currency";
import { useCurrency } from "../lib/useCurrency";
import { trackEvent } from "../lib/analytics";
import {
  BESPOKE_MAY_INCLUDE,
  BUDGET_OPTIONS,
  CONCIERGE_SEQUENCE,
  EMPTY_ENQUIRY,
  EnquiryError,
  OCCASION_SUGGESTIONS,
  submitEnquiry,
  validateEnquiry,
  type ConciergeEnquiry,
  type ContactMethod,
  type EnquiryErrors,
} from "../lib/concierge";

const CONTACT_METHODS: readonly { value: ContactMethod; label: string }[] = [
  { value: "EMAIL", label: "Email" },
  { value: "PHONE", label: "Phone" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

/**
 * Attribution as the browser saw it.
 *
 * Reported, never trusted: the server resolves what it means and a browser
 * cannot credit an affiliate that does not exist. Read here so a concierge
 * enquiry that arrived through a partner link is not attribution-blind.
 */
const attributionFromUrl = (): { referral?: string; partner?: string } => {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const referral = params.get("ref") ?? undefined;
  const partner = params.get("partner") ?? undefined;
  return { ...(referral ? { referral } : {}), ...(partner ? { partner } : {}) };
};

/* ------------------------------------------------------------------ */
/* Field scaffolding                                                   */
/* ------------------------------------------------------------------ */

const labelClass = "block mb-2 text-base font-semibold text-ink";

const inputClass =
  "w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink placeholder:text-espresso/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

/** Helper text under a field: readable size, readable contrast. */
const hintClass = "mt-2 text-sm leading-relaxed text-espresso/75";

const FieldError = ({ id, message }: { id: string; message?: string }) =>
  message ? (
    <p id={id} className="mt-2 text-base text-red-700">
      {message}
    </p>
  ) : null;

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

const Bespoke = () => {
  const [enquiry, setEnquiry] = useState<ConciergeEnquiry>(EMPTY_ENQUIRY);
  const [errors, setErrors] = useState<EnquiryErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [hasStarted, setHasStarted] = useState(false);

  const acknowledgementRef = useRef<HTMLDivElement | null>(null);
  const ids = useId();
  const fieldId = (name: string) => `${ids}-${name}`;
  const errorId = (name: string) => `${ids}-${name}-error`;

  /**
   * The customer's chosen display currency is the sensible DEFAULT for the
   * budget field — someone browsing in euros is probably thinking in euros —
   * but it is only a default. The select below is theirs to change, and what
   * they leave it on is what gets stored, unconverted.
   */
  const { currency: displayCurrency } = useCurrency();
  const [budgetCurrency, setBudgetCurrency] =
    useState<CurrencyCode>(displayCurrency);

  const attribution = useMemo(attributionFromUrl, []);

  useEffect(() => {
    /**
     * Analytics carries the MODE only — never the amount, never the currency,
     * never anything the customer typed.
     *
     * "How many people tell us there's no fixed limit?" is a question about
     * the form. "This person will spend €12,000" is that person's private
     * commercial position, and sending it to a third-party analytics vendor
     * is not something they agreed to when they asked MCB for a gift.
     */
    trackEvent("full_package_viewed");
  }, []);

  const update = <K extends keyof ConciergeEnquiry>(
    key: K,
    value: ConciergeEnquiry[K]
  ) => {
    setEnquiry((previous) => ({ ...previous, [key]: value }));

    // Fired once, on the first thing they touch. A customer who abandons the
    // form still tells MCB something, and the alternative — firing on view —
    // cannot distinguish reading from starting.
    if (!hasStarted) {
      setHasStarted(true);
      trackEvent("full_package_enquiry_started");
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;

    const found = validateEnquiry(enquiry);
    setErrors(found);
    setSubmitError(null);

    if (Object.keys(found).length > 0) {
      // Move focus to the first problem rather than announcing a count. The
      // customer needs to be at the field, not told there are three.
      const first = document.querySelector<HTMLElement>("[data-field-error]");
      first?.focus();
      return;
    }

    setIsSubmitting(true);

    try {
      const receipt = await submitEnquiry(enquiry, attribution);
      setReference(receipt.reference);
      trackEvent("full_package_enquiry_submitted", {
        // The mode, and nothing else. See the note in the view effect.
        budget_mode: enquiry.budget?.mode,
      });
    } catch (error) {
      if (error instanceof EnquiryError) {
        setErrors(error.fields);
        setSubmitError(error.message);
      } else {
        setSubmitError(
          "We couldn't send that just now. Please try again, or email us directly."
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Focus the acknowledgement once it replaces the form, so a screen-reader
  // user is taken to the outcome rather than left where the button used to be.
  useEffect(() => {
    if (reference) acknowledgementRef.current?.focus();
  }, [reference]);

  const name = BESPOKE.name;

  return (
    <>
      <Helmet>
        {/*
          ONE string child, deliberately.

          This read `{name} | A Private Concierge Commission | My Custom
          Beats`, which JSX hands to Helmet as an ARRAY of children — and
          react-helmet-async renders an empty <title> for anything that is not
          a single string. Production served this page with no title at all,
          while the <meta name="description"> in the same block applied
          normally, which is what isolated it to the interpolation.

          Composed with a template literal so the product name still comes
          from the canonical catalogue rather than being typed out here.
        */}
        <title>{`${name} | A Private Concierge Commission | My Custom Beats`}</title>
        <meta
          name="description"
          content={BESPOKE.shortDescription}
        />
        <script type="application/ld+json">
          {JSON.stringify(productPageStructuredData(BESPOKE.id))}
        </script>
        {/*
          NO PRICE IN THE META DESCRIPTION, and no Offer emitted for this page.
          There is no figure that is true before a proposal, and a price in a
          search result is one a customer would reasonably hold MCB to.
        */}
      </Helmet>

      {/* ---- Opening ------------------------------------------------- */}
      <section className="w-full bg-ink px-5 pb-16 pt-28 text-ivory sm:px-8 md:pb-24 md:pt-36">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <div className="min-w-0">
            <p className="label-uppercase text-gold">{name}</p>
            {/*
              `!text-ivory` is not decoration. The base stylesheet colours every
              h1-h6 espresso for the light pages, so a heading on the ink
              background without its own colour renders dark brown on
              near-black — invisible. Every heading in a dark band states its
              colour explicitly for that reason.
            */}
            <h1 className="mt-4 font-serif text-5xl leading-[1.05] !text-ivory md:text-6xl">
              When your idea doesn’t fit inside a box.
            </h1>
            {/* The approved copy, read from the catalogue so this page and
                the homepage cannot describe it differently. */}
            <p className="mt-6 font-serif text-2xl leading-snug text-gold md:text-3xl">{BESPOKE.positioning}</p>
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-ivory/85">{BESPOKE.shortDescription}</p>

            <p className="mt-6 max-w-2xl text-base leading-relaxed text-ivory/80">
              {BESPOKE.disclosures.join(" ")}. There is no published price,
              because no two are alike. Start with a conversation — your price is
              proposed in writing and agreed with you before anything begins.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="#enquiry"
                className="inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-8 py-3 text-base font-semibold text-ink transition-colors hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                {BESPOKE.cta}
              </a>
              <a
                href="#how-it-works"
                className="inline-flex min-h-12 items-center justify-center px-2 text-base font-medium text-ivory underline underline-offset-4 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                How it works
              </a>
            </div>
          </div>
          <div className="overflow-hidden rounded-[1.75rem]">
            <ResponsiveImage
              image={PACKAGE_IMAGERY.bespoke}
              sizes="(min-width: 1024px) 40vw, 100vw"
              priority
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>
        </div>
      </section>

      {/* ---- The sequence -------------------------------------------- */}
      <section
        id="how-it-works"
        aria-labelledby="fp-sequence"
        className="w-full bg-ivory px-5 py-16 sm:px-8 md:py-24"
      >
        <div className="mx-auto max-w-6xl">
          <h2 id="fp-sequence" className="font-serif text-4xl leading-tight text-ink">
            How it works
          </h2>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-espresso/80">
            Five steps, in this order. Nothing is charged until the fifth, and
            the fifth only happens once you have agreed the fourth.
          </p>

          <ol className="m-0 mt-10 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-5">
            {CONCIERGE_SEQUENCE.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-ink/10 bg-white p-5">
                <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full bg-ink font-mono text-base text-gold">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-serif text-2xl leading-snug text-ink">{step.title}</h3>
                <p className="mt-2 text-base leading-relaxed text-espresso/80">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>

          {BESPOKE_MAY_INCLUDE.length > 0 && (
            <div className="mt-14 border-t border-ink/10 pt-10">
              <h2 className="font-serif text-3xl leading-tight text-ink">What a commission may include</h2>
              <ul className="m-0 mt-6 grid list-none gap-x-10 gap-y-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
                {BESPOKE_MAY_INCLUDE.map((feature) => (
                  <li key={feature} className="flex gap-3">
                    <Check size={20} className="mt-0.5 shrink-0 text-gold-deep" aria-hidden="true" />
                    <span className="text-base leading-snug text-ink">{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-14 flex flex-col gap-4 rounded-3xl bg-[#F1ECE3] p-6 sm:flex-row sm:items-center sm:justify-between md:p-8">
            <div>
              <h2 className="font-serif text-2xl leading-tight text-ink md:text-3xl">Want the music played live, too?</h2>
              <p className="mt-2 max-w-xl text-base leading-relaxed text-espresso/80">{`For selected events, ${MCB_LIVE.name} can bring your song and the celebration around it to life. Every event is quoted individually.`}</p>
            </div>
            <Link
              to="/mcb-live"
              className="inline-flex min-h-12 shrink-0 items-center gap-2 text-base font-semibold text-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
            >
              {`Discover ${MCB_LIVE.name}`}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---- The enquiry --------------------------------------------- */}
      <section
        id="enquiry"
        aria-labelledby="fp-enquiry"
        className="w-full bg-white px-5 py-16 sm:px-8 md:py-24"
      >
        <div className="mx-auto max-w-[760px]">
          {reference ? (
            /* ---- Acknowledgement --------------------------------------
               "Received", not "confirmed" and not "order confirmed". Nothing
               has been confirmed: MCB has read nothing yet and agreed
               nothing. Overstating this is how a customer ends up believing
               they have bought something.
               --------------------------------------------------------- */
            <div
              ref={acknowledgementRef}
              tabIndex={-1}
              role="status"
              className="rounded-2xl border border-gold/40 bg-gold/5 p-8 md:p-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
            >
              <p className="label-uppercase mb-4 text-gold-deep">
                Enquiry received
              </p>
              <h2 className="mb-4 font-serif text-3xl leading-snug text-ink">
                Thank you — we have your enquiry.
              </h2>
              <p className="mb-6 text-lg leading-relaxed text-espresso/80">
                One of us will read it properly and come back to you personally
                to arrange your consultation. Nothing has been charged and
                nothing is committed.
              </p>
              <p className="text-base leading-relaxed text-espresso/80">
                Your enquiry reference is{" "}
                <span className="font-mono text-ink">{reference}</span>.
                Quote it if you get in touch before we do.
              </p>
            </div>
          ) : (
            <>
              <p className="label-uppercase mb-3 text-gold-deep">{BESPOKE.cta}</p>
              <h2
                id="fp-enquiry"
                className="mb-3 font-serif text-4xl leading-tight text-ink"
              >
                Tell us what you have in mind
              </h2>
              <p className="mb-2 text-lg leading-relaxed text-espresso/80">
                A little about who this is for is plenty. We will read it and
                come back to you personally.
              </p>
              {/* Said before the first field, not after the last one. */}
              <p className="mb-10 text-base leading-relaxed text-espresso/80">
                This is an enquiry, not an order. Nothing is charged and you
                are committed to nothing.
              </p>

              <form onSubmit={handleSubmit} noValidate className="space-y-8">
                {/* ---- You -------------------------------------------- */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor={fieldId("name")}>
                      Your name
                    </label>
                    <input
                      id={fieldId("name")}
                      className={inputClass}
                      value={enquiry.name}
                      onChange={(e) => update("name", e.target.value)}
                      autoComplete="name"
                      aria-invalid={errors.name ? true : undefined}
                      aria-describedby={errors.name ? errorId("name") : undefined}
                      {...(errors.name ? { "data-field-error": true } : {})}
                    />
                    <FieldError id={errorId("name")} message={errors.name} />
                  </div>

                  <div>
                    <label className={labelClass} htmlFor={fieldId("email")}>
                      Email
                    </label>
                    <input
                      id={fieldId("email")}
                      type="email"
                      className={inputClass}
                      value={enquiry.email}
                      onChange={(e) => update("email", e.target.value)}
                      autoComplete="email"
                      aria-invalid={errors.email ? true : undefined}
                      aria-describedby={errors.email ? errorId("email") : undefined}
                      {...(errors.email ? { "data-field-error": true } : {})}
                    />
                    <FieldError id={errorId("email")} message={errors.email} />
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor={fieldId("phone")}>
                      Phone <span className="font-normal text-espresso/75">(optional)</span>
                    </label>
                    <input
                      id={fieldId("phone")}
                      type="tel"
                      className={inputClass}
                      value={enquiry.phone}
                      onChange={(e) => update("phone", e.target.value)}
                      autoComplete="tel"
                      aria-invalid={errors.phone ? true : undefined}
                      aria-describedby={errors.phone ? errorId("phone") : undefined}
                      {...(errors.phone ? { "data-field-error": true } : {})}
                    />
                    <FieldError id={errorId("phone")} message={errors.phone} />
                  </div>

                  <div>
                    <label
                      className={labelClass}
                      htmlFor={fieldId("preferredContact")}
                    >
                      How should we reach you?
                    </label>
                    <select
                      id={fieldId("preferredContact")}
                      className={inputClass}
                      value={enquiry.preferredContact}
                      onChange={(e) =>
                        update(
                          "preferredContact",
                          e.target.value as ContactMethod
                        )
                      }
                    >
                      {CONTACT_METHODS.map((method) => (
                        <option key={method.value} value={method.value}>
                          {method.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ---- What to create --------------------------------- */}
                <div>
                  <label className={labelClass} htmlFor={fieldId("createRequest")}>
                    What would you like us to create? <span className="font-normal text-espresso/75">(optional)</span>
                  </label>
                  <textarea
                    id={fieldId("createRequest")}
                    className={inputClass}
                    rows={3}
                    maxLength={1000}
                    value={enquiry.createRequest}
                    onChange={(e) => update("createRequest", e.target.value)}
                    placeholder="A song, a framed lyric print, a surprise at the party — or say you'd like ideas."
                  />
                </div>

                {/* ---- The occasion ----------------------------------- */}
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className={labelClass} htmlFor={fieldId("occasion")}>
                      The occasion <span className="font-normal text-espresso/75">(optional)</span>
                    </label>
                    {/*
                      Free text with suggestions, not a closed select. Someone
                      commissioning for a reason MCB has not listed must not be
                      told their occasion is not one of the options.
                    */}
                    <input
                      id={fieldId("occasion")}
                      className={inputClass}
                      list={fieldId("occasion-list")}
                      value={enquiry.occasion}
                      onChange={(e) => update("occasion", e.target.value)}
                      placeholder="An anniversary, a retirement…"
                    />
                    <datalist id={fieldId("occasion-list")}>
                      {OCCASION_SUGGESTIONS.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className={labelClass} htmlFor={fieldId("neededBy")}>
                      Needed by <span className="font-normal text-espresso/75">(optional)</span>
                    </label>
                    <input
                      id={fieldId("neededBy")}
                      type="date"
                      className={inputClass}
                      value={enquiry.neededBy}
                      onChange={(e) => update("neededBy", e.target.value)}
                      aria-invalid={errors.neededBy ? true : undefined}
                      aria-describedby={
                        errors.neededBy ? errorId("neededBy") : undefined
                      }
                      {...(errors.neededBy ? { "data-field-error": true } : {})}
                    />
                    <FieldError
                      id={errorId("neededBy")}
                      message={errors.neededBy}
                    />
                  </div>
                </div>

                <div>
                  <label
                    className={labelClass}
                    htmlFor={fieldId("deliveryRegion")}
                  >
                    Where is it going? <span className="font-normal text-espresso/75">(optional)</span>
                  </label>
                  <input
                    id={fieldId("deliveryRegion")}
                    className={inputClass}
                    value={enquiry.deliveryRegion}
                    onChange={(e) => update("deliveryRegion", e.target.value)}
                    placeholder="A city or country is plenty"
                  />
                  {/* Says why it is not asking for more, so the vagueness
                      reads as deliberate rather than as a form that will
                      demand the rest later. */}
                  <p className={hintClass}>
                    Just enough for us to think about timings — we will not ask
                    for a full address until there is something to send.
                  </p>
                </div>

                {/* ---- Budget ----------------------------------------- */}
                <fieldset className="border-0 p-0 m-0">
                  <legend className={labelClass}>
                    What would you like to spend?
                  </legend>
                  <p className="mb-4 -mt-1 text-base leading-relaxed text-espresso/80">
                    Whatever you tell us here shapes the proposal. There is no
                    wrong answer, and no minimum.
                  </p>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {BUDGET_OPTIONS.map((option) => {
                      const selected = enquiry.budget?.mode === option.mode;
                      const id = fieldId(`budget-${option.mode}`);
                      return (
                        <div key={option.mode}>
                          {/*
                            A real radio inside its label: native semantics,
                            native arrow-key group behaviour, native
                            announcement. `peer` + `sr-only` is the pattern the
                            rest of the site uses — `has-[:focus-visible]`
                            compiles to nothing in this Tailwind version, which
                            silently removed the focus ring last time.
                          */}
                          <label
                            htmlFor={id}
                            className={`flex h-full min-h-12 cursor-pointer flex-col rounded-xl border-2 p-4 transition-colors ${
                              selected
                                ? "border-gold-dark bg-gold/10"
                                : "border-ink/15 bg-white hover:border-gold/60"
                            }`}
                          >
                            <input
                              type="radio"
                              id={id}
                              name={fieldId("budget-mode")}
                              className="peer sr-only"
                              checked={selected}
                              onChange={() =>
                                update(
                                  "budget",
                                  option.mode === "AMOUNT"
                                    ? {
                                        mode: "AMOUNT",
                                        amount:
                                          enquiry.budget?.mode === "AMOUNT"
                                            ? enquiry.budget.amount
                                            : "",
                                        currency: budgetCurrency,
                                      }
                                    : { mode: option.mode }
                                )
                              }
                            />
                            <span className="text-base font-semibold leading-snug text-ink peer-focus-visible:underline peer-focus-visible:decoration-gold-deep peer-focus-visible:decoration-2 peer-focus-visible:underline-offset-4">
                              {option.label}
                            </span>
                            <span className="mt-1.5 text-sm leading-relaxed text-espresso/75">
                              {option.hint}
                            </span>
                          </label>
                        </div>
                      );
                    })}
                  </div>

                  {errors.budget && (
                    <p
                      id={errorId("budget")}
                      className="mt-3 text-base text-red-700"
                      data-field-error
                      tabIndex={-1}
                    >
                      {errors.budget}
                    </p>
                  )}

                  {enquiry.budget?.mode === "AMOUNT" && (
                    <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_10rem]">
                      <div>
                        <label
                          className={labelClass}
                          htmlFor={fieldId("budgetAmount")}
                        >
                          Amount
                        </label>
                        {/*
                          `type="text"`, not `type="number"`. A number input
                          rejects "10,000" as most people write it, and its
                          spinner arrows are meaningless on a figure like this.
                          The string is parsed exactly, in pence, by both this
                          file and the server.
                        */}
                        <input
                          id={fieldId("budgetAmount")}
                          type="text"
                          inputMode="decimal"
                          className={inputClass}
                          value={
                            enquiry.budget.mode === "AMOUNT"
                              ? enquiry.budget.amount
                              : ""
                          }
                          onChange={(e) =>
                            update("budget", {
                              mode: "AMOUNT",
                              amount: e.target.value,
                              currency: budgetCurrency,
                            })
                          }
                          placeholder="5000"
                          aria-invalid={errors.budgetAmount ? true : undefined}
                          aria-describedby={
                            errors.budgetAmount
                              ? errorId("budgetAmount")
                              : undefined
                          }
                          {...(errors.budgetAmount
                            ? { "data-field-error": true }
                            : {})}
                        />
                        <FieldError
                          id={errorId("budgetAmount")}
                          message={errors.budgetAmount}
                        />
                      </div>

                      <div>
                        <label
                          className={labelClass}
                          htmlFor={fieldId("budgetCurrency")}
                        >
                          Currency
                        </label>
                        <select
                          id={fieldId("budgetCurrency")}
                          className={inputClass}
                          value={budgetCurrency}
                          onChange={(e) => {
                            const next = e.target.value as CurrencyCode;
                            setBudgetCurrency(next);
                            update("budget", {
                              mode: "AMOUNT",
                              amount:
                                enquiry.budget?.mode === "AMOUNT"
                                  ? enquiry.budget.amount
                                  : "",
                              currency: next,
                            });
                          }}
                        >
                          {SUPPORTED_CURRENCIES.map((currency) => (
                            <option key={currency.code} value={currency.code}>
                              {currency.code}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/*
                        Stated plainly. MCB charges in GBP, and a customer who
                        names a figure in dollars should know their figure is
                        recorded as they said it rather than quietly converted
                        into a pound number they never chose.
                      */}
                      <p className="sm:col-span-2 -mt-1 text-sm leading-relaxed text-espresso/75">
                        We record this exactly as you have written it, in{" "}
                        {budgetCurrency}. Nothing is converted.
                      </p>
                    </div>
                  )}
                </fieldset>

                {/* ---- The story -------------------------------------- */}
                <div>
                  <label className={labelClass} htmlFor={fieldId("story")}>
                    Tell us about them <span className="font-normal text-espresso/75">(optional)</span>
                  </label>
                  <textarea
                    id={fieldId("story")}
                    className={`${inputClass} min-h-[9rem] resize-y`}
                    value={enquiry.story}
                    onChange={(e) => update("story", e.target.value)}
                    placeholder="Who is this for, and what are you hoping to create for them?"
                  />
                  <p className={hintClass}>
                    Say as much or as little as you like. A person reads this,
                    not a form.
                  </p>
                </div>

                {submitError && (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base leading-relaxed text-red-700"
                  >
                    {submitError}
                  </p>
                )}

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 sm:w-auto"
                  >
                    {/* Says what it does. Not "Buy", not "Checkout", not
                        "Complete order" — none of which is what happens. */}
                    {isSubmitting ? "Sending…" : BESPOKE.cta}
                  </button>
                  <p className={hintClass}>
                    No payment is taken, now or on submission.
                  </p>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default Bespoke;
