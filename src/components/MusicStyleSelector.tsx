/**
 * THE MCB MUSIC STYLE EXPERIENCE.
 *
 * Replaces a nine-option `<select>` labelled "Genre" with a calm, browsable
 * way to say roughly how a memory should sound — for someone who may know very
 * little about music and should never have to.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY REAL RADIO INPUTS
 * ─────────────────────────────────────────────────────────────────────────
 * Every option here — the featured styles, every style inside every group,
 * "Let MCB choose" and "Something else" — is a genuine
 * `<input type="radio">` sharing ONE `name`, visually hidden inside its
 * `<label>`.
 *
 * That single decision buys the whole accessibility contract from the platform
 * rather than reimplementing it:
 *
 *   • one accessible name per option, from the label text itself
 *   • arrow-key navigation within the group, and one tab stop for the group
 *   • the selected state announced natively, not inferred from a colour
 *   • MUTUAL EXCLUSIVITY FOR FREE — choosing a style deselects MCB Choice,
 *     and choosing MCB Choice deselects a style, because the browser cannot
 *     hold two checked radios of the same name. There is no state-juggling
 *     effect here to get wrong.
 *
 * The alternative — clickable `<div>`s with `aria-pressed` — would have meant
 * hand-writing roving focus, keyboard handling and exclusivity, and getting
 * one of them subtly wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SELECTION IS NEVER SIGNALLED BY COLOUR ALONE
 * ─────────────────────────────────────────────────────────────────────────
 * A chosen option gains a tick, a heavier border and a weight change as well
 * as the gold fill, and a plain-text summary line above the group states the
 * current direction in words.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS COMPONENT DOES NOT DO
 * ─────────────────────────────────────────────────────────────────────────
 * It asks nothing about the recipient. No age, no relationship, no gender, no
 * favourite artist, no "how should they feel". It takes a musical direction
 * and nothing else, and it makes no recommendation based on anything about
 * the person ordering.
 */

import { useId, useMemo, useState } from "react";
import { Check, ChevronDown, Search, Sparkles } from "lucide-react";
import {
  FEATURED_STYLES,
  MAX_STYLE_LABEL_LENGTH,
  MCB_CHOICE_VALUE,
  MUSIC_STYLE_CATEGORIES,
  OTHER_STYLE_VALUE,
  searchStylesByCategory,
  stylesInCategory,
  type MusicStyle,
} from "../data/musicStyles";

interface MusicStyleSelectorProps {
  /**
   * The selected value: a style label, `MCB_CHOICE_VALUE`,
   * `OTHER_STYLE_VALUE`, or "" for nothing chosen.
   *
   * Deliberately the same `genre` string the form has always held, so this
   * component slots into the existing state and payload without either
   * changing shape.
   */
  value: string;
  onChange: (value: string) => void;
  /** Free text, used only while `value` is `OTHER_STYLE_VALUE`. */
  customValue: string;
  onCustomChange: (value: string) => void;
  error?: string;
  customError?: string;
  /** DOM ids the parent form owns, so validation and focus keep working. */
  fieldId: string;
  errorId: string;
  customFieldId: string;
  customErrorId: string;
  /** Fired for the parent's analytics. Never given free text. */
  onEvent?: (event: "style_selected" | "mcb_choice_selected" | "explore_opened", styleId?: string) => void;
}

/**
 * One selectable option.
 *
 * The input is `sr-only` rather than `hidden`: a hidden input is not
 * focusable and not announced, which would remove the very semantics this
 * component exists to keep. `peer-focus-visible` puts the focus ring on the
 * visible label instead, so keyboard focus is obvious.
 */
const StyleOption = ({
  name,
  id,
  label,
  value,
  checked,
  onSelect,
  describedBy,
  invalid,
}: {
  name: string;
  id: string;
  /** What the customer reads. */
  label: string;
  /**
   * What this option submits, when that differs from the label.
   *
   * "Something else" reads as prose but submits the `Other` sentinel, and the
   * DOM `value` must be the submitted one — otherwise anything later that
   * reads `event.target.value` (a refactor, a test, a browser autofill) would
   * quietly get the wrong string. Defaults to the label.
   */
  value?: string;
  checked: boolean;
  onSelect: () => void;
  describedBy?: string;
  invalid?: boolean;
}) => (
  /*
    The input is `peer` and the VISIBLE pill is the sibling span that follows
    it, so `peer-focus-visible:` can put the focus ring on something a person
    can actually see.

    index.css sets a global `body :focus-visible` outline, but it lands on the
    `sr-only` input — a 1px clipped box — so on its own it is invisible. This
    is what makes keyboard focus obvious.
  */
  <label htmlFor={id} className="inline-flex cursor-pointer">
    <input
      type="radio"
      id={id}
      name={name}
      value={value ?? label}
      checked={checked}
      onChange={onSelect}
      className="peer sr-only"
      {...(describedBy ? { "aria-describedby": describedBy } : {})}
      {...(invalid ? { "aria-invalid": true } : {})}
    />
    <span
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
        checked
          ? "border-gold-dark bg-gold font-semibold text-espresso"
          : "border-espresso/15 bg-ivory text-espresso/80 hover:border-gold hover:text-espresso"
      }`}
    >
      {/* Second, non-colour signal that this option is the chosen one. */}
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className={`h-3.5 w-3.5 shrink-0 transition-opacity ${
          checked ? "opacity-100" : "opacity-0"
        }`}
      />
      <span className="min-w-0">{label}</span>
    </span>
  </label>
);

/** A titled group of options, used for both browsing and search results. */
const StyleGroup = ({
  heading,
  blurb,
  styles,
  name,
  idFor,
  value,
  onSelect,
}: {
  heading: string;
  blurb?: string;
  styles: readonly MusicStyle[];
  name: string;
  idFor: (style: MusicStyle) => string;
  value: string;
  onSelect: (style: MusicStyle) => void;
}) => (
  <div className="mt-6 first:mt-0">
    <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-gold-deep">
      {heading}
    </p>
    {blurb && (
      <p className="mt-1 text-sm leading-relaxed text-espresso/55">{blurb}</p>
    )}
    <div className="mt-3 flex flex-wrap gap-2">
      {styles.map((style) => (
        <StyleOption
          key={style.id}
          name={name}
          id={idFor(style)}
          label={style.label}
          checked={value === style.label}
          onSelect={() => onSelect(style)}
        />
      ))}
    </div>
  </div>
);

const MusicStyleSelector = ({
  value,
  onChange,
  customValue,
  onCustomChange,
  error,
  customError,
  fieldId,
  errorId,
  customFieldId,
  customErrorId,
  onEvent,
}: MusicStyleSelectorProps) => {
  const uid = useId();
  const radioName = `music-style-${uid}`;
  const searchId = `${uid}-style-search`;
  const panelId = `${uid}-style-panel`;
  const summaryId = `${uid}-style-summary`;

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");

  const optionId = (key: string) => `${uid}-style-${key}`;

  const isFeatured = FEATURED_STYLES.some((style) => style.label === value);
  const isMcbChoice = value === MCB_CHOICE_VALUE;
  const isOther = value === OTHER_STYLE_VALUE;

  /**
   * Open the browser automatically when the current choice lives inside it.
   *
   * Without this, choosing "Waltz", collapsing the panel and returning later
   * would show a form with no visible selection and a required field that
   * appears unanswered. The summary line below covers the collapsed case too,
   * but the honest default is to show the customer where their choice is.
   */
  const holdsSelection = value !== "" && !isFeatured && !isMcbChoice && !isOther;
  const panelOpen = expanded || holdsSelection;

  const groups = useMemo(
    () =>
      query.trim() === ""
        ? MUSIC_STYLE_CATEGORIES.map((category) => ({
            category,
            styles: stylesInCategory(category.id),
          }))
        : searchStylesByCategory(query),
    [query]
  );

  const selectStyle = (style: MusicStyle) => {
    onChange(style.label);
    onEvent?.("style_selected", style.id);
  };

  const chooseMcb = () => {
    onChange(MCB_CHOICE_VALUE);
    onEvent?.("mcb_choice_selected");
  };

  const toggleExplore = () => {
    const next = !panelOpen;
    setExpanded(next);
    if (next) onEvent?.("explore_opened");
  };

  /** The current direction, in words, for the summary line. */
  const summary = isMcbChoice
    ? "MCB will choose the musical style"
    : isOther
      ? customValue.trim() === ""
        ? "Your own style — tell us below"
        : customValue.trim()
      : value === ""
        ? null
        : value;

  return (
    <div className="order-form-field space-y-4">
      <div>
        <h3 id={fieldId} className="label-uppercase text-gold-deep">
          Step 4 — Choose Your Musical Style
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-espresso/60">
          Choose a direction you love, explore more styles, or leave the
          musical direction to MCB.
        </p>
      </div>

      {/*
        `role="radiogroup"` names the whole set for assistive technology, which
        a bare wrapper around loose radios would not do. `data-field` is what
        the form's validation uses to scroll to and focus this control.
      */}
      <div
        role="radiogroup"
        aria-labelledby={fieldId}
        aria-describedby={
          [summary ? summaryId : null, error ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
        data-field="genre"
        className={
          error ? "rounded-2xl border border-red-500 p-4" : undefined
        }
      >
        {/* ---- Let MCB choose ---------------------------------------- */}
        {/*
          A real selection, presented as the calm answer to "I don't know" —
          given its own full-width card so it reads as a considered option
          rather than a genre hiding among genres.
        */}
        <label htmlFor={optionId("mcb-choice")} className="block cursor-pointer">
          <input
            type="radio"
            id={optionId("mcb-choice")}
            name={radioName}
            value={MCB_CHOICE_VALUE}
            checked={isMcbChoice}
            onChange={chooseMcb}
            className="peer sr-only"
            {...(error ? { "aria-invalid": true } : {})}
          />
          <span
            className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-deep peer-focus-visible:ring-offset-2 ${
              isMcbChoice
                ? "border-gold-dark bg-gold/15"
                : "border-espresso/15 bg-white hover:border-gold"
            }`}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                isMcbChoice
                  ? "border-gold-dark bg-gold-dark text-white"
                  : "border-espresso/30"
              }`}
            >
              {isMcbChoice ? (
                <Check strokeWidth={3} className="h-3.5 w-3.5" />
              ) : (
                <Sparkles strokeWidth={2} className="h-3.5 w-3.5 text-gold-deep" />
              )}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-base leading-snug text-espresso ${
                  isMcbChoice ? "font-semibold" : "font-medium"
                }`}
              >
                Let MCB choose the musical style for me
              </span>
              <span className="mt-1 block text-sm leading-relaxed text-espresso/60">
                Not sure what fits your story? Leave the musical direction to MCB.
              </span>
            </span>
          </span>
        </label>

        {/* ---- Featured styles --------------------------------------- */}
        <div className="mt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45">
            Or choose a direction
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FEATURED_STYLES.map((style) => (
              <StyleOption
                key={style.id}
                name={radioName}
                id={optionId(style.id)}
                label={style.label}
                checked={value === style.label}
                onSelect={() => selectStyle(style)}
                invalid={Boolean(error)}
              />
            ))}
          </div>
        </div>

        {/* ---- Explore more ------------------------------------------ */}
        <button
          type="button"
          onClick={toggleExplore}
          aria-expanded={panelOpen}
          aria-controls={panelId}
          className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-full border border-espresso/15 bg-white px-4 py-2 text-sm text-espresso/80 transition-colors duration-300 hover:border-gold hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
        >
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform duration-300 ${
              panelOpen ? "rotate-180" : ""
            }`}
          />
          {panelOpen ? "Fewer styles" : "Explore more styles"}
        </button>

        {/*
          Rendered only when open. The selected radio can never be hidden
          inside a collapsed panel, because `panelOpen` stays true whenever the
          selection lives in here — see `holdsSelection`.
        */}
        {panelOpen && (
          <div id={panelId} className="mt-5 rounded-2xl bg-ivory/70 p-4 sm:p-5">
            <label htmlFor={searchId} className="sr-only">
              Search musical styles
            </label>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-espresso/40"
              />
              <input
                id={searchId}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search styles — try “80s”, “jazz”, “dnb”"
                className="min-h-11 w-full rounded-xl border border-espresso/15 bg-white py-3 pl-9 pr-4 text-sm text-espresso placeholder:text-espresso/40 focus:outline-none focus:ring-2 focus:ring-gold-deep"
              />
            </div>

            {/* Announced politely so a screen-reader user hears the result
                count change without the list stealing focus. */}
            <p aria-live="polite" className="sr-only">
              {groups.reduce((total, g) => total + g.styles.length, 0)} styles
              match
            </p>

            {groups.length === 0 ? (
              <p className="mt-5 text-sm leading-relaxed text-espresso/60">
                No styles match “{query.trim()}”. Try a decade such as 80s, or
                choose <strong className="font-semibold">Something else</strong>{" "}
                below and tell us in your own words.
              </p>
            ) : (
              groups.map(({ category, styles }) => (
                <StyleGroup
                  key={category.id}
                  heading={category.label}
                  blurb={query.trim() === "" ? category.blurb : undefined}
                  styles={styles}
                  name={radioName}
                  idFor={(style) => optionId(style.id)}
                  value={value}
                  onSelect={selectStyle}
                />
              ))
            )}
          </div>
        )}

        {/* ---- Something else ---------------------------------------- */}
        <div className="mt-5">
          <StyleOption
            name={radioName}
            id={optionId("other")}
            label="Something else"
            value={OTHER_STYLE_VALUE}
            checked={isOther}
            onSelect={() => onChange(OTHER_STYLE_VALUE)}
            invalid={Boolean(error)}
          />
        </div>

        {isOther && (
          <div className="mt-3">
            <label
              htmlFor={customFieldId}
              className="block text-sm text-espresso/70"
            >
              Tell us the style you have in mind
            </label>
            <input
              id={customFieldId}
              name="otherGenre"
              type="text"
              value={customValue}
              onChange={(e) => onCustomChange(e.target.value)}
              /* Capped to the server's column width. Beyond it, /api/order
                 returns 422, the CRM records nothing and the customer reaches
                 Stripe with no order id attached — a silent, expensive
                 failure for a field nobody would think to check. */
              maxLength={MAX_STYLE_LABEL_LENGTH}
              placeholder="For example, a slow acoustic waltz"
              {...(customError
                ? { "aria-invalid": true, "aria-describedby": customErrorId }
                : {})}
              className={`mt-2 min-h-11 w-full rounded-xl border bg-white px-4 py-3 text-sm text-espresso placeholder:text-espresso/40 focus:outline-none focus:ring-2 focus:ring-gold-deep ${
                customError ? "border-red-500" : "border-espresso/15"
              }`}
            />
            {customError && (
              <p id={customErrorId} role="alert" className="mt-1 text-xs text-red-500">
                {customError}
              </p>
            )}
          </div>
        )}
      </div>

      {/* The chosen direction restated in plain words — the third,
          non-visual confirmation of the selected state. */}
      {summary && (
        <p id={summaryId} className="text-sm text-espresso/70">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-espresso/45">
            Your musical direction
          </span>
          <span className="mt-1 block font-medium text-espresso">{summary}</span>
        </p>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
};

export default MusicStyleSelector;
