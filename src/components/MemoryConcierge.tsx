import { useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BESPOKE, JOURNEY, KEEPSAKE, MOMENT, formatMinor, getVariant, requireProduct } from "../data/catalogue";
import {
  asksArrangement,
  budgetChoicesMinor,
  largestFixedSongCount,
  memoryChoices,
  recommendGuided,
  type Arrangement,
  type ConciergeOccasion,
  type ConciergeOption,
  type GuidedAnswers,
  type KeepPreference,
} from "../lib/memoryConcierge";
import { trackFunnel } from "../lib/analytics";
import { createHref, DELIVERY_NOTE } from "../lib/productDetail";
import { mcbButtonClass } from "../lib/buttonClass";
import FormatVisual from "./FormatVisual";

/**
 * MCB MEMORY CONCIERGE — "I like this, but which option is right for me?"
 *
 * Rules-based guidance over the canonical catalogue (see lib/memoryConcierge).
 * One question at a time, every question skippable or reversible, and browsing
 * without guidance is always one tap away. It never recommends upward: the
 * smallest option that fits is suggested, and a lower-priced alternative is
 * shown whenever one exists.
 *
 * Analytics: `concierge_start` on first interaction and
 * `concierge_recommendation` with catalogue ids only. No answer, occasion or
 * budget is ever sent.
 *
 * Needs no props. `headingLevel` sets the inner heading (default h3, for use
 * inside a section that has its own h2). `onChoose` is optional: when given,
 * the primary action calls it instead of linking to /create.
 */

type Step = "occasion" | "memories" | "keep" | "arrangement" | "budget" | "result";

interface Draft {
  occasion: ConciergeOccasion | null;
  memories: number | null;
  keep: KeepPreference | null;
  arrangement: Arrangement | null;
  budgetMinor: number | null;
}

const EMPTY: Draft = { occasion: null, memories: null, keep: null, arrangement: null, budgetMinor: null };

const OCCASIONS: readonly { value: ConciergeOccasion; label: string }[] = [
  { value: "trip", label: "A trip or cruise" },
  { value: "celebration", label: "A celebration" },
  { value: "gift", label: "A gift for someone" },
  { value: "remembrance", label: "Remembering someone" },
  { value: "other", label: "Something else" },
];

const MOMENT_VARIANT = MOMENT.variants[0];

const KEEP_OPTIONS: readonly { value: KeepPreference; label: string; hint: string }[] = [
  { value: "digital", label: "Digital is perfect", hint: `${MOMENT.name}${MOMENT_VARIANT?.fulfilment === "DIGITAL" ? " · delivered digitally" : ""}` },
  { value: "physical", label: "Something to hold", hint: `${KEEPSAKE.name} or ${JOURNEY.name} · a record` },
  { value: "unsure", label: "I’m not sure yet", hint: "We’ll suggest a gentle place to start" },
  { value: "bespoke", label: "Something one-of-a-kind", hint: `${BESPOKE.name} · ${BESPOKE.disclosures.join(" ").toLowerCase()}` },
];

const ARRANGEMENTS: readonly { value: Arrangement; label: string; hint: string }[] = [
  { value: "together", label: "Together on one record", hint: "One record holding all the songs" },
  { value: "separate", label: `A separate ${KEEPSAKE.name} for each`, hint: "One record per memory or per day" },
];

const MEMORY_CHOICES = memoryChoices();
const BUDGET_CHOICES = budgetChoicesMinor();
const MAX_SONGS = largestFixedSongCount();
const MEMORY_OPTIONS = MEMORY_CHOICES.map((choice) => ({ value: choice.value, label: `${choice.label} ${choice.value === 1 ? "memory" : "memories"}` }));
/** 0 stands for "prefer not to say" in the radio group; it is stored as null. */
const BUDGET_OPTIONS = [{ value: 0, label: "Prefer not to say" }, ...BUDGET_CHOICES.map((minor) => ({ value: minor, label: `Up to ${formatMinor(minor)}` }))];

const stepsFor = (draft: Draft): Step[] => {
  const steps: Step[] = ["occasion", "memories"];
  if (draft.memories !== null && draft.memories > MAX_SONGS) return [...steps, "result"];
  steps.push("keep");
  if (draft.keep === "bespoke") return [...steps, "result"];
  if (draft.memories !== null && draft.keep !== null && asksArrangement({ memories: draft.memories, keep: draft.keep })) steps.push("arrangement");
  return [...steps, "budget", "result"];
};

const QUESTION: Record<Exclude<Step, "result">, { title: string; optional: boolean }> = {
  occasion: { title: "What is the occasion?", optional: true },
  memories: { title: "How many memories or songs would you like to keep?", optional: false },
  keep: { title: "Would you like something to hold?", optional: false },
  arrangement: { title: "Kept together, or one record for each?", optional: true },
  budget: { title: "Is there an approximate budget to keep in mind?", optional: true },
};

const optionLine = (option: ConciergeOption) => `${option.name} · ${formatMinor(option.priceMinor)}`;

const choiceCard = (selected: boolean) =>
  `flex min-h-12 h-full cursor-pointer flex-col justify-center rounded-xl border-2 bg-white px-4 py-3 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
    selected ? "border-gold-dark bg-gold/10" : "border-ink/15 hover:border-gold/60"
  }`;

const textLink =
  "inline-flex min-h-12 items-center gap-2 px-1 text-base font-semibold text-ink underline underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

interface ChoiceGroupProps<T extends string | number> {
  groupId: string;
  options: readonly { value: T; label: string; hint?: string }[];
  value: T | null;
  onPick: (value: T) => void;
  columns?: string;
}

function ChoiceGroup<T extends string | number>({ groupId, options, value, onPick, columns = "sm:grid-cols-2" }: ChoiceGroupProps<T>) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {options.map((option) => {
        const id = `${groupId}-${option.value}`;
        const selected = value === option.value;
        return (
          <label key={String(option.value)} htmlFor={id} className="block">
            <input id={id} type="radio" name={groupId} checked={selected} onChange={() => onPick(option.value)} className="peer sr-only" />
            <span className={choiceCard(selected)}>
              <span className="text-base font-semibold text-ink">{option.label}</span>
              {option.hint && <span className="mt-0.5 text-sm text-espresso/75">{option.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

interface MemoryConciergeProps {
  headingLevel?: "h2" | "h3";
  onChoose?: (productId: string, sku?: string) => void;
}

export default function MemoryConcierge({ headingLevel = "h3", onChoose }: MemoryConciergeProps = {}) {
  const Heading = headingLevel;
  const SubHeading = headingLevel === "h2" ? "h3" : "h4";
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);
  const lastTracked = useRef<string | null>(null);

  const steps = stepsFor(draft);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const questionCount = steps.length - 1;

  const answers: GuidedAnswers | null =
    draft.memories === null
      ? null
      : {
          occasion: draft.occasion,
          memories: draft.memories,
          keep: draft.keep ?? "unsure",
          arrangement: draft.arrangement,
          budgetMinor: draft.budgetMinor,
        };
  const result = step === "result" && answers ? recommendGuided(answers) : null;

  useEffect(() => {
    if (!result) return;
    const key = `${result.productId}:${result.option?.sku ?? ""}`;
    if (lastTracked.current === key) return;
    lastTracked.current = key;
    trackFunnel("concierge_recommendation", {
      product_id: result.productId,
      ...(result.option ? { sku: result.option.sku } : {}),
      location: "concierge",
    });
  }, [result]);

  const start = () => {
    if (started.current) return;
    started.current = true;
    trackFunnel("concierge_start", { location: "concierge" });
  };

  const focusHeading = () => requestAnimationFrame(() => headingRef.current?.focus());
  const go = (next: number) => {
    setStepIndex(Math.max(0, next));
    focusHeading();
  };
  const update = (change: Partial<Draft>) => {
    start();
    setDraft((previous) => ({ ...previous, ...change }));
  };
  const restart = () => {
    setDraft(EMPTY);
    setStepIndex(0);
    lastTracked.current = null;
    focusHeading();
  };

  const canContinue = step === "result" ? false : QUESTION[step].optional || (step === "memories" ? draft.memories !== null : draft.keep !== null);

  const product = result ? requireProduct(result.productId) : null;
  const variantRef = result?.option ? getVariant(result.option.sku) : undefined;
  const physical = variantRef?.variant.fulfilment === "PHYSICAL";

  const primaryAction = () => {
    if (!result || !product) return null;
    if (!result.option) {
      return (
        <Link to="/bespoke" className={mcbButtonClass("primary")}>
          {BESPOKE.cta}
        </Link>
      );
    }
    const sku = result.option.sku;
    return onChoose ? (
      <button type="button" className={mcbButtonClass("primary")} onClick={() => onChoose(result.productId, sku)}>
        Create Your Memory
      </button>
    ) : (
      <Link to={createHref(sku)} className={mcbButtonClass("primary")}>
        Create Your Memory
      </Link>
    );
  };

  return (
    <div className="mt-10 rounded-3xl border border-ink/15 bg-ivory p-5 text-ink sm:p-8 md:p-10" role="region" aria-label="MCB Memory Concierge">
      <p className="label-uppercase text-gold-deep">MCB Memory Concierge</p>
      <Heading ref={headingRef} tabIndex={-1} className="mt-3 font-serif text-3xl leading-tight text-ink focus:outline-none md:text-4xl">
        {!open
          ? "Which option is right for me?"
          : step === "result"
            ? "A thoughtful place to begin"
            : QUESTION[step].title}
      </Heading>

      {!open ? (
        <>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-espresso/80 md:text-lg">
            A few quick questions and we’ll suggest where to start — with the reasons. Optional, and you can skip any question.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className={mcbButtonClass("primary")}
              onClick={() => {
                start();
                setOpen(true);
                setStepIndex(0);
                focusHeading();
              }}
            >
              Help me choose
            </button>
            <Link to="/products" className={textLink}>
              Browse on my own
            </Link>
          </div>
        </>
      ) : (
        <>
          {step !== "result" && (
            <>
              <p className="mt-2 text-base text-espresso/75" aria-live="polite">
                {`Question ${stepIndex + 1} of ${questionCount}${QUESTION[step].optional ? " · optional" : ""}`}
              </p>
              <fieldset className="mt-6">
                <legend className="sr-only">{QUESTION[step].title}</legend>
                {step === "occasion" && (
                  <ChoiceGroup groupId={`${uid}-occasion`} options={OCCASIONS} value={draft.occasion} onPick={(occasion) => update({ occasion })} columns="sm:grid-cols-2 lg:grid-cols-3" />
                )}
                {step === "memories" && (
                  <ChoiceGroup
                    groupId={`${uid}-memories`}
                    options={MEMORY_OPTIONS}
                    value={draft.memories}
                    onPick={(memories) => update({ memories, arrangement: memories > 1 ? draft.arrangement : null })}
                    columns="grid-cols-2 sm:grid-cols-3"
                  />
                )}
                {step === "keep" && (
                  <ChoiceGroup groupId={`${uid}-keep`} options={KEEP_OPTIONS} value={draft.keep} onPick={(keep) => update({ keep, arrangement: keep === "physical" ? draft.arrangement : null })} />
                )}
                {step === "arrangement" && (
                  <ChoiceGroup groupId={`${uid}-arrangement`} options={ARRANGEMENTS} value={draft.arrangement} onPick={(arrangement) => update({ arrangement })} />
                )}
                {step === "budget" && (
                  <ChoiceGroup
                    groupId={`${uid}-budget`}
                    options={BUDGET_OPTIONS}
                    value={draft.budgetMinor ?? 0}
                    onPick={(minor) => update({ budgetMinor: minor === 0 ? null : minor })}
                    columns="grid-cols-2 sm:grid-cols-4"
                  />
                )}
              </fieldset>
              {step === "memories" && (
                <p className="mt-4 text-base text-espresso/75">Choose the closest fit — a day, a person or a moment can each be one memory.</p>
              )}
              {step === "budget" && (
                <p className="mt-4 text-base text-espresso/75">Prices are in GBP. Your answer stays on this page and only shapes the suggestion.</p>
              )}

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {stepIndex > 0 && (
                  <button type="button" className={mcbButtonClass("secondary")} onClick={() => go(stepIndex - 1)}>
                    <ArrowLeft size={18} aria-hidden="true" />
                    Back
                  </button>
                )}
                <button type="button" className={mcbButtonClass("primary")} disabled={!canContinue} onClick={() => go(stepIndex + 1)}>
                  {steps[stepIndex + 1] === "result" ? "See my suggestion" : QUESTION[step].optional && !hasAnswer(step, draft) ? "Skip" : "Continue"}
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
            </>
          )}

          {result && product && (
            <div className="mt-6" aria-live="polite">
              <div className="flex flex-col gap-6 rounded-2xl border border-ink/10 bg-white p-5 sm:flex-row sm:p-6">
                {variantRef && (
                  <div className="mx-auto w-28 shrink-0 sm:mx-0" aria-hidden="true">
                    <FormatVisual product={variantRef.product} variant={variantRef.variant} className="h-auto w-full" />
                  </div>
                )}
                <div className="min-w-0">
                  <SubHeading className="font-serif text-2xl leading-snug text-ink md:text-3xl">
                    {result.option ? `${result.quantity > 1 ? `${result.quantity} × ` : ""}${result.option.name}` : product.name}
                  </SubHeading>
                  {result.option ? (
                    <p className="mt-1 font-mono text-lg text-ink">
                      {formatMinor(result.option.priceMinor)}
                      {result.quantity > 1 && result.totalMinor !== null && (
                        <span className="text-espresso/80">{` each · ${formatMinor(result.totalMinor)} in total`}</span>
                      )}
                    </p>
                  ) : (
                    <p className="mt-1 text-base font-semibold text-ink">{BESPOKE.disclosures.join(" ")}</p>
                  )}
                  <p className="mt-3 text-base leading-relaxed text-espresso/85 md:text-lg">{result.reason}</p>
                  {physical && <p className="mt-2 text-base text-espresso/80">{DELIVERY_NOTE}</p>}
                  {result.quantity > 1 && result.option && (
                    <p className="mt-2 text-base text-espresso/80">You can choose how many in the next step.</p>
                  )}
                </div>
              </div>

              {result.withinBudget === false && (
                <p className="mt-4 rounded-xl border-l-4 border-gold bg-white px-4 py-3 text-base leading-relaxed text-ink">
                  This is above the budget you mentioned. There is no need to stretch — you could start with fewer memories, or choose the lower-priced option below.
                </p>
              )}

              <ul className="m-0 mt-4 list-none space-y-2 p-0 text-base leading-relaxed text-espresso/85">
                {result.lowerPricedAlternative && (
                  <li>
                    <span className="font-semibold text-ink">For less: </span>
                    <Link to={createHref(result.lowerPricedAlternative.sku)} className="underline underline-offset-4 hover:text-gold-deep">
                      {optionLine(result.lowerPricedAlternative)}
                    </Link>
                    {` also holds ${result.quantity > 1 ? "all your" : "your"} songs.`}
                  </li>
                )}
                {result.sameCapacity.length > 0 && (
                  <li>
                    <span className="font-semibold text-ink">Same number of songs: </span>
                    {result.sameCapacity.map(optionLine).join("; ")}.
                  </li>
                )}
                {result.alsoConsider && result.alsoConsiderReason && (
                  <li>
                    <span className="font-semibold text-ink">Also worth knowing: </span>
                    {result.alsoConsiderReason}{" "}
                    <Link to={createHref(result.alsoConsider.sku)} className="underline underline-offset-4 hover:text-gold-deep">
                      {optionLine(result.alsoConsider)}
                    </Link>
                  </li>
                )}
              </ul>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {primaryAction()}
                {product.route && result.option && (
                  <Link to={product.route} className={textLink}>
                    {`About ${product.name}`}
                  </Link>
                )}
                <button type="button" className={textLink} onClick={restart}>
                  Start again
                </button>
              </div>
              <p className="mt-5 text-sm leading-relaxed text-espresso/75">
                Guidance is based on your answers and MCB’s published products. It is not a conversation with a person or a live AI service.
              </p>
            </div>
          )}

          <p className="mt-6 border-t border-ink/10 pt-4">
            <Link to="/products" className={textLink}>
              Browse without guidance
            </Link>
          </p>
        </>
      )}
    </div>
  );
}

function hasAnswer(step: Step, draft: Draft): boolean {
  switch (step) {
    case "occasion":
      return draft.occasion !== null;
    case "arrangement":
      return draft.arrangement !== null;
    case "budget":
      return draft.budgetMinor !== null;
    default:
      return true;
  }
}
