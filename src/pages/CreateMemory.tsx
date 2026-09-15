/**
 * /create — choose, personalise, add finishing touches, review.
 *
 * Deep links: /create?product=<id>, /create?sku=<sku>[&quantity=n][&step=story]
 *
 * WHAT IS SAVED ON THIS DEVICE: the choice of product and the words written
 * for each memory, plaque and frame, for 7 days, so a refresh does not lose a
 * 12-chapter Journey. Never photos, contact details, addresses or consents.
 * "Start again" clears it.
 *
 * PAYMENT: MCB's server says whether it is open (GET /api/checkout/status).
 * While it is closed, the final step says so and nothing is submitted,
 * uploaded or charged. When it is open, "Continue to secure payment":
 *   1. saves the order on the server (idempotent: a double click or a retry
 *      returns the same order)
 *   2. uploads each photo against the memory or plaque it belongs to
 *   3. confirms with the server that the order is ready
 *   4. opens the Stripe Checkout Session the server built from the SAVED order
 * Every amount on the Review step is the server's. Coming back from Stripe
 * without paying offers to resume the saved order.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronLeft } from "lucide-react";
import { formatMinor, getProduct, getVariant } from "../data/catalogue";
import { INITIAL_CONSENT_STATE, type ConsentId } from "../data/legal";
import { trackAddToCart, trackBeginCheckout, trackEvent, trackFunnel } from "../lib/analytics";
import {
  blockerMessage,
  createCheckoutSession,
  fetchCheckoutStatus,
  fetchOrderState,
  forgetSavedOrder,
  newIdempotencyKey,
  recallSavedOrder,
  rememberSavedOrder,
  requestQuote,
  submitOrder,
  uploadPhoto,
  type ApiFailure,
  type CheckoutStatus,
  type OrderState,
} from "../lib/orderApi";
import { buildOrderRequest, requestFingerprint } from "../lib/orderRequest";
import {
  EMPTY_CONTACT,
  STEPS,
  furthestReachableStep,
  isStepId,
  stepBlockers,
  stepIndex,
  type ContactDetails,
  type StepId,
} from "../lib/createFlow";
import {
  DRAFT_STORAGE_KEY,
  chooseProduct,
  chooseVariant,
  draftHasContent,
  draftLines,
  emptyDraft,
  parseDraft,
  previewDraft,
  serialiseDraft,
  uploadSlots,
  type OrderDraft,
  type PhotoCheck,
} from "../lib/personalisation";
import { readPhotoSize } from "../lib/photoSize";
import StepChoose from "./create/StepChoose";
import StepDetails from "./create/StepDetails";
import StepExtras from "./create/StepExtras";
import StepReview, { type QuoteState } from "./create/StepReview";
import StepStory from "./create/StepStory";

const readSaved = (): OrderDraft | null => {
  try {
    return parseDraft(localStorage.getItem(DRAFT_STORAGE_KEY), Date.now());
  } catch {
    return null;
  }
};

const initialDraft = (params: URLSearchParams): OrderDraft => {
  const sku = params.get("sku");
  const quantity = Number(params.get("quantity")) || undefined;
  if (sku && getVariant(sku)) return chooseVariant(emptyDraft(), sku, quantity);
  const productId = params.get("product");
  if (productId && getProduct(productId)) return chooseProduct(emptyDraft(), productId);
  return emptyDraft();
};

type PayState =
  | { phase: "idle" }
  | { phase: "saving" }
  | { phase: "uploading"; done: number; total: number }
  | { phase: "opening" }
  | { phase: "problem"; message: string };

const UNREACHABLE = "We couldn't reach MCB just now. Everything you've entered is still here — please try again.";

const problemFrom = (failure: ApiFailure): string => {
  if (failure.kind === "unreachable") return UNREACHABLE;
  if (failure.kind === "invalid") {
    const messages = [...new Set(Object.values(failure.fields))];
    return messages.length === 1 ? messages[0] : `${failure.message} ${messages.slice(0, 3).join(" ")}`;
  }
  return failure.message;
};

const CreateMemory = () => {
  const [params, setParams] = useSearchParams();
  const [draft, setDraftState] = useState<OrderDraft>(() => initialDraft(params));
  const [saved, setSaved] = useState<OrderDraft | null>(() => {
    const found = readSaved();
    return found && draftHasContent(found) ? found : null;
  });
  const [photos, setPhotos] = useState<ReadonlyMap<string, File>>(new Map());
  const [photoChecks, setPhotoChecks] = useState<ReadonlyMap<string, PhotoCheck>>(new Map());
  const photoFiles = useRef(new Map<string, File>());
  const [contact, setContact] = useState<ContactDetails>(EMPTY_CONTACT);
  const [consents, setConsents] = useState<Record<ConsentId, boolean>>({ ...INITIAL_CONSENT_STATE });
  const [showErrors, setShowErrors] = useState(false);
  const [paymentPreview, setPaymentPreview] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutStatus | null>(null);
  const [quote, setQuote] = useState<QuoteState>({ state: "loading" });
  const [quoteRequest, setQuoteRequest] = useState(0);
  const [pay, setPay] = useState<PayState>({ phase: "idle" });
  const [resume, setResume] = useState<OrderState | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const startedRef = useRef(false);
  const idempotency = useRef<{ fingerprint: string; key: string } | null>(null);
  const paying = useRef(false);

  const preview = useMemo(() => previewDraft(draft), [draft]);
  const photoIds = useMemo(() => new Set(photos.keys()), [photos]);
  const product = getProduct(draft.productId);

  const reachable = furthestReachableStep(draft, preview, photoIds, contact, consents, photoChecks);
  const requested = params.get("step");
  const step: StepId = isStepId(requested) && stepIndex(requested) <= reachable ? requested : STEPS[Math.min(stepIndex(isStepId(requested) ? requested : "choose"), reachable)].id;
  const current = stepIndex(step);

  const setDraft = useCallback((update: (d: OrderDraft) => OrderDraft) => setDraftState((d) => update(d)), []);

  const setPhoto = useCallback((id: string, file: File | undefined) => {
    setPhotos((existing) => {
      const next = new Map(existing);
      if (file) next.set(id, file);
      else next.delete(id);
      return next;
    });
    if (file) photoFiles.current.set(id, file);
    else photoFiles.current.delete(id);
    setPhotoChecks((existing) => {
      const next = new Map(existing);
      next.delete(id);
      return next;
    });
    if (file) {
      // Measured in this browser; the result only counts if the photo is still the one chosen.
      void readPhotoSize(file).then((check) => {
        if (photoFiles.current.get(id) !== file) return;
        setPhotoChecks((existing) => new Map(existing).set(id, check));
      });
    }
  }, []);

  // ---- Autosave the words (never photos or contact details) ----------------
  useEffect(() => {
    if (saved) return; // Don't overwrite a saved draft the customer hasn't answered about.
    const timer = window.setTimeout(() => {
      try {
        if (draftHasContent(draft)) localStorage.setItem(DRAFT_STORAGE_KEY, serialiseDraft(draft, Date.now()));
      } catch {
        // Storage can be unavailable (private browsing); the page still works.
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft, saved]);

  // ---- Warn before leaving with things that are not saved ------------------
  useEffect(() => {
    const unsaved = photos.size > 0 || Object.values(contact).some((value) => value.trim() !== "");
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [photos, contact]);

  // ---- Focus the step heading when the step changes -------------------------
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  useEffect(() => {
    if (step === "review") trackFunnel("order_review", { product_id: draft.productId, sku: draft.sku, quantity: draft.units.length, location: "create" });
    // Once per arrival at review.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const goTo = (target: StepId) => {
    setShowErrors(false);
    setPaymentPreview(false);
    if (!busy) setPay({ phase: "idle" });
    const next = new URLSearchParams(params);
    next.set("step", target);
    if (draft.sku) next.set("sku", draft.sku);
    else next.delete("sku");
    next.delete("product");
    next.delete("quantity");
    setParams(next, { replace: false });
  };

  // ---- What the server says about payment ----------------------------------
  useEffect(() => {
    let live = true;
    void fetchCheckoutStatus().then((status) => live && setCheckout(status));
    return () => {
      live = false;
    };
  }, []);

  // ---- Back from Stripe without paying: offer the order already saved ------
  useEffect(() => {
    if (params.get("checkout") !== "cancelled") return;
    const saved = recallSavedOrder();
    if (!saved) return;
    let live = true;
    void fetchOrderState(saved).then((result) => {
      if (!live) return;
      if (result.ok && result.order.status === "PENDING") setResume(result.order);
      else forgetSavedOrder();
    });
    return () => {
      live = false;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- The server's figures for the Review step ------------------------------
  const requiresShipping = preview.ok && preview.requiresShipping;
  const linesKey = JSON.stringify(draftLines(draft));
  const quoteCountry = requiresShipping ? contact.shippingCountry : "";
  useEffect(() => {
    if (step !== "review" || !preview.ok) return;
    let live = true;
    setQuote({ state: "loading" });
    void requestQuote(JSON.parse(linesKey), quoteCountry).then((result) => {
      if (!live) return;
      if (result.ok) setQuote({ state: "ready", quote: result.quote });
      else setQuote({ state: "error", message: result.kind === "unreachable" ? "We couldn't confirm your total just now." : problemFrom(result) });
    });
    return () => {
      live = false;
    };
    // preview.ok follows linesKey.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, linesKey, quoteCountry, quoteRequest]);

  const openCheckout = async (order: OrderState) => {
    setPay({ phase: "opening" });
    const session = await createCheckoutSession(order);
    if (!session.ok) {
      setPay({ phase: "problem", message: problemFrom(session) });
      return false;
    }
    // The server has created a real session: only now is checkout "begun".
    trackFunnel("checkout_begin", { product_id: draft.productId, sku: draft.sku, quantity: draft.units.length, location: "create" });
    trackBeginCheckout(draftLines(draft));
    window.location.assign(session.url);
    return true;
  };

  const startPayment = async () => {
    if (paying.current) return;
    paying.current = true;
    try {
      const body = buildOrderRequest(draft, contact, consents, photoIds, requiresShipping);
      const fingerprint = requestFingerprint(body);
      if (idempotency.current?.fingerprint !== fingerprint) idempotency.current = { fingerprint, key: newIdempotencyKey() };

      setPay({ phase: "saving" });
      const saved = await submitOrder(body, idempotency.current.key);
      if (!saved.ok) {
        setPay({ phase: "problem", message: problemFrom(saved) });
        return;
      }
      const order = saved.order;
      rememberSavedOrder(order);

      if (quote.state === "ready" && order.totalMinor !== quote.quote.totalMinor) {
        // The saved total is what will be charged. Show it before anything else.
        setQuoteRequest((n) => n + 1);
        setPay({ phase: "problem", message: "Your total has been updated. Please check it below, then continue to payment." });
        return;
      }

      const toUpload = uploadSlots(draft, photos).filter((slot) => order.missingUploads.includes(slot.slot));
      for (let i = 0; i < toUpload.length; i++) {
        setPay({ phase: "uploading", done: i, total: toUpload.length });
        const uploaded = await uploadPhoto(order, toUpload[i].slot, toUpload[i].file);
        if (!uploaded.ok) {
          setPay({
            phase: "problem",
            message: uploaded.kind === "unreachable" ? "One of your photos didn't upload. Please check your connection and try again." : problemFrom(uploaded),
          });
          return;
        }
      }

      const state = await fetchOrderState(order);
      if (!state.ok) {
        setPay({ phase: "problem", message: problemFrom(state) });
        return;
      }
      const blocked = blockerMessage(state.order.checkoutBlocker);
      if (blocked) {
        setPay({ phase: "problem", message: blocked });
        return;
      }
      trackFunnel("personalisation_complete", { product_id: draft.productId, sku: draft.sku, quantity: draft.units.length, location: "create" });

      await openCheckout(state.order);
    } finally {
      paying.current = false;
    }
  };

  const busy = pay.phase === "saving" || pay.phase === "uploading" || pay.phase === "opening";
  const payLabel =
    pay.phase === "saving"
      ? "Saving your order…"
      : pay.phase === "uploading"
        ? `Uploading your photos (${pay.done + 1} of ${pay.total})…`
        : pay.phase === "opening"
          ? "Opening secure payment…"
          : "Continue to secure payment";

  const blockers = stepBlockers(step, draft, preview, photoIds, contact, consents, photoChecks);

  const focusFirstProblem = () =>
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>('main [aria-invalid="true"], main [role="alert"]');
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el && el.matches("input, select, textarea, button")) el.focus();
    }, 50);

  const continueOn = () => {
    if (blockers.length > 0) {
      setShowErrors(true);
      focusFirstProblem();
      return;
    }
    trackFunnel("personalisation_step_complete", {
      product_id: draft.productId,
      sku: draft.sku,
      step,
      location: "create",
      memories: draft.units.reduce((n, unit) => n + unit.memories.length, 0),
    });
    if (step === "choose" && !startedRef.current) {
      startedRef.current = true;
      trackFunnel("personalisation_start", { product_id: draft.productId, sku: draft.sku, quantity: draft.units.length, location: "create" });
    }
    if (step === "review") {
      if (!checkout || !checkout.onlineCheckout) {
        // Payment is closed on the server: nothing is sent anywhere.
        setPaymentPreview(true);
        return;
      }
      if (quote.state !== "ready") return;
      if (!quote.quote.payable) {
        setPay({ phase: "problem", message: "We need to confirm delivery for this order before you pay, so it can't be paid online yet. Please contact MCB and we'll help." });
        return;
      }
      void startPayment();
      return;
    }
    goTo(STEPS[current + 1].id);
  };

  const startAgain = () => {
    try {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setSaved(null);
    setPhotos(new Map());
    setPhotoChecks(new Map());
    photoFiles.current.clear();
    setDraftState(emptyDraft());
    goTo("choose");
  };

  const meta = STEPS[current];

  return (
    <div id="create" className="min-h-screen bg-ivory pb-24 pt-28 sm:pt-32">
      <Helmet>
        <title>Create Your Memory | My Custom Beats</title>
        <meta name="description" content="Choose your song, tell us your story memory by memory, and review everything before you order." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        {resume && (
          <div role="region" aria-label="Your saved order" className="mb-8 rounded-2xl border-2 border-ink bg-white p-5 sm:p-6">
            <p className="font-serif text-2xl text-ink">Your order is saved</p>
            <p className="mt-2 text-base leading-relaxed text-espresso/80">
              You left payment before it was finished, so nothing has been charged.
              {resume.totalMinor !== null && <> The total is {formatMinor(resume.totalMinor)}.</>} You can continue to payment, or make changes and place it again.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const blocked = blockerMessage(resume.checkoutBlocker);
                  if (blocked) setPay({ phase: "problem", message: blocked });
                  else void openCheckout(resume);
                }}
                className="min-h-12 rounded-full bg-ink px-6 text-base font-semibold text-ivory disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
              >
                {pay.phase === "opening" ? "Opening secure payment…" : "Continue to secure payment"}
              </button>
              <button
                type="button"
                onClick={() => {
                  forgetSavedOrder();
                  setResume(null);
                  idempotency.current = null;
                  // Bring back the words saved on this device, ready to edit.
                  if (saved) {
                    setDraftState(saved);
                    setSaved(null);
                    const next = new URLSearchParams();
                    next.set("sku", saved.sku);
                    next.set("step", "story");
                    setParams(next);
                  }
                }}
                className="min-h-12 rounded-full border border-ink/25 px-6 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep"
              >
                Make changes
              </button>
            </div>
            <p className="mt-3 text-sm text-espresso/65">For your privacy, contact details and photos aren't kept on this device, so you'll add them again if you make changes.</p>
          </div>
        )}

        {saved && !resume && (
          <div role="region" aria-label="Saved progress" className="mb-8 rounded-2xl border border-gold/50 bg-white p-5">
            <p className="text-base text-ink">
              Welcome back. You started {getProduct(saved.productId)?.name ? `a ${getProduct(saved.productId)?.name}` : "a memory"} on this device. Photos aren't saved, so you may need to add them again.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraftState(saved);
                  setSaved(null);
                  const next = new URLSearchParams();
                  next.set("sku", saved.sku);
                  next.set("step", "story");
                  setParams(next);
                }}
                className="min-h-12 rounded-full bg-ink px-6 text-base font-semibold text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
              >
                Continue where I left off
              </button>
              <button type="button" onClick={startAgain} className="min-h-12 rounded-full border border-ink/25 px-6 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                Start again
              </button>
            </div>
          </div>
        )}

        <p className="label-uppercase text-gold-deep">Create your memory{product ? ` · ${product.name}` : ""}</p>
        <h1 ref={headingRef} tabIndex={-1} className="mt-3 text-[clamp(2.4rem,6vw,3.6rem)] text-ink focus:outline-none">
          {meta.title}
        </h1>

        {/* ---- Progress ---- */}
        <nav aria-label="Order progress" className="mt-6">
          <p className="mb-3 text-sm text-espresso/70 sm:hidden">Step {current + 1} of {STEPS.length}</p>
          <ol className="flex list-none flex-wrap gap-2 p-0">
            {STEPS.map((s, i) => {
              const done = i < current;
              const isCurrent = i === current;
              const canOpen = i <= reachable && !isCurrent;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => canOpen && goTo(s.id)}
                    disabled={!canOpen}
                    aria-current={isCurrent ? "step" : undefined}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep sm:px-4 sm:text-base ${
                      isCurrent ? "border-ink bg-ink text-ivory" : done ? "border-gold-dark bg-white text-ink" : "border-espresso/15 bg-transparent text-espresso/75"
                    } disabled:cursor-default`}
                  >
                    <span aria-hidden="true" className={`flex h-6 w-6 items-center justify-center rounded-full text-sm ${isCurrent ? "bg-ivory text-ink" : done ? "bg-gold-dark text-white" : "border border-espresso/30"}`}>
                      {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className={isCurrent ? "" : "sr-only sm:not-sr-only"}>{s.label}</span>
                    <span className="sr-only">{done ? " (done)" : isCurrent ? " (current step)" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div>
            {step === "choose" && (
              <StepChoose
                draft={draft}
                setDraft={setDraft}
                showErrors={showErrors}
                onProduct={(productId) => trackFunnel("package_select", { product_id: productId, location: "create" })}
                onVariant={(sku) => trackFunnel("variant_select", { product_id: getVariant(sku)?.product.id, sku, location: "create" })}
              />
            )}
            {step === "story" && (
              <StepStory
                draft={draft}
                setDraft={setDraft}
                photos={photos}
                photoChecks={photoChecks}
                setPhoto={setPhoto}
                showErrors={showErrors}
                onStyleEvent={(event, styleId) => trackEvent(`music_${event}`, styleId ? { style_id: styleId } : undefined)}
              />
            )}
            {step === "extras" && (
              <StepExtras draft={draft} setDraft={setDraft} photos={photos} setPhoto={setPhoto} showErrors={showErrors} onAdd={(sku, quantity) => trackAddToCart(sku, quantity)} />
            )}
            {step === "details" && (
              <StepDetails contact={contact} setContact={setContact} requiresShipping={preview.ok && preview.requiresShipping} showErrors={showErrors} />
            )}
            {step === "review" && (
              <StepReview
                draft={draft}
                preview={preview}
                photos={photos}
                contact={contact}
                consents={consents}
                setConsent={(id, value) => setConsents((c) => ({ ...c, [id]: value }))}
                showErrors={showErrors}
                goTo={goTo}
                quote={quote}
                onRetryQuote={() => setQuoteRequest((n) => n + 1)}
              />
            )}

            {step === "review" && checkout?.mode === "test" && (
              <p role="note" className="mt-8 rounded-2xl border-2 border-dashed border-gold-dark bg-white p-5 text-base leading-relaxed text-ink">
                <strong>Test mode.</strong> This checkout uses Stripe's test environment. No real payment will be taken and nothing will be made.
              </p>
            )}

            {paymentPreview && checkout !== null && !checkout.onlineCheckout && (
              <div role="status" className="mt-10 rounded-2xl border-2 border-ink bg-white p-6">
                <p className="font-serif text-2xl text-ink">Online payment isn't open yet</p>
                <p className="mt-2 text-base leading-relaxed text-espresso/80">
                  This is a preview of the MCB order experience. Nothing has been submitted, uploaded or charged, and no order has been created.
                </p>
              </div>
            )}

            {/* ---- Actions ---- */}
            <div className="mt-12 flex flex-col-reverse gap-3 border-t border-espresso/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
              {current > 0 ? (
                <button type="button" onClick={() => goTo(STEPS[current - 1].id)} className="inline-flex min-h-12 items-center justify-center gap-1 rounded-full px-5 text-base font-semibold text-ink hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" /> Back
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={continueOn}
                disabled={busy || (step === "review" && checkout?.onlineCheckout === true && quote.state !== "ready")}
                aria-busy={busy}
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-ink px-8 text-lg font-semibold text-ivory transition-colors hover:bg-[#1c2d40] disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
              >
                {step === "review" ? payLabel : `Continue to ${STEPS[current + 1].label.toLowerCase()}`}
              </button>
            </div>
            {step === "review" && (busy || pay.phase === "problem") && (
              <p role={pay.phase === "problem" ? "alert" : "status"} className={`mt-4 text-right text-base ${pay.phase === "problem" ? "text-red-700" : "text-espresso/80"}`}>
                {pay.phase === "problem" ? pay.message : payLabel}
              </p>
            )}
            {showErrors && blockers.length > 0 && (
              <p role="alert" className="mt-4 text-right text-base text-red-700">
                {blockers.length === 1 ? blockers[0] : `A few things still need your attention (${blockers.length}).`}
              </p>
            )}
          </div>

          {/* ---- Summary ---- */}
          <aside aria-label="Your order so far" className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-gold/40 bg-white p-5">
              <p className="label-uppercase text-gold-deep">Your memory</p>
              {step === "review" && quote.state === "ready" ? (
                // On Review, the same server figures as the order itself.
                <>
                  <ul className="mt-3 list-none space-y-2 p-0 text-base">
                    {quote.quote.lines.map((line) => (
                      <li key={line.sku} className="flex justify-between gap-3">
                        <span className="text-espresso/85">
                          {getVariant(line.sku)?.variant.name ?? line.name}
                          {line.quantity > 1 && <span className="text-espresso/75"> × {line.quantity}</span>}
                        </span>
                        <span className="font-mono text-ink">{formatMinor(line.lineMinor)}</span>
                      </li>
                    ))}
                    {quote.quote.delivery.status === "QUOTED" && (
                      <li className="flex justify-between gap-3">
                        <span className="text-espresso/85">Delivery</span>
                        <span className="font-mono text-ink">{formatMinor(quote.quote.delivery.minor)}</span>
                      </li>
                    )}
                  </ul>
                  <p className="mt-4 flex items-baseline justify-between border-t border-espresso/10 pt-3">
                    <span className="text-base font-medium text-ink">Total</span>
                    <span className="font-serif text-2xl text-ink">{formatMinor(quote.quote.totalMinor)}</span>
                  </p>
                </>
              ) : preview.ok ? (
                <>
                  <ul className="mt-3 list-none space-y-2 p-0 text-base">
                    {preview.lines.map((line) => (
                      <li key={line.sku} className="flex justify-between gap-3">
                        <span className="text-espresso/85">
                          {line.name}
                          {line.quantity > 1 && <span className="text-espresso/75"> × {line.quantity}</span>}
                        </span>
                        <span className="font-mono text-ink">{formatMinor(line.lineMinor)}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 flex items-baseline justify-between border-t border-espresso/10 pt-3">
                    <span className="text-base font-medium text-ink">Total</span>
                    <span className="font-serif text-2xl text-ink">{formatMinor(preview.totalMinor)}</span>
                  </p>
                  {preview.requiresShipping && <p className="mt-2 text-sm text-espresso/70">Delivery is confirmed on the Review step, before payment.</p>}
                </>
              ) : (
                <p className="mt-3 text-base text-espresso/70">Choose an experience to see your order here.</p>
              )}
              {draftHasContent(draft) && (
                <button type="button" onClick={startAgain} className="mt-4 min-h-11 text-sm font-medium text-gold-deep underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                  Start again and clear saved progress
                </button>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CreateMemory;
