/**
 * REFUNDS & CANCELLATIONS.
 *
 * The plain-language half of the contract. Every section names the Terms
 * clause it restates, so the two documents can be read against each other —
 * and so a disagreement between them shows up rather than hiding.
 *
 * What this page used to say, and no longer does:
 *   "No refunds once songwriting or production has started"  — blanket, and
 *      silent about MCB's own mistakes.
 *   "Issues must be reported within 48 hours of delivery"    — read as a
 *      two-day expiry on rights that do not expire in two days.
 *   "Orders may be cancelled within 24 hours of purchase"    — impossible to
 *      administer against a Moment delivered within the hour.
 */

import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  REFUND_SECTIONS,
  REFUNDS_INTRO,
  STATUTORY_RIGHTS_NOTICE,
  REFUND_POLICY_VERSION,
  TERMS_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE_DISPLAY,
} from "../../data/legal";

const Refund = () => (
  <>
    <Helmet>
      <title>Refunds &amp; Cancellations | My Custom Beats</title>
      <meta
        name="description"
        content="When you can cancel, what happens after we have started, how personalised items are treated, and what we do if something arrives wrong."
      />
      {/*
        NO canonical here. App.tsx already emits one for every route from
        the current pathname, and react-helmet-async cannot replace a tag it
        did not create — so adding a second produced two <link rel=canonical>
        elements on this page, which is the same duplicate-head-tag fault
        Sprint 0 spent its time removing.
      */}
    </Helmet>

    <div className="min-h-screen bg-ivory px-6 py-24 md:py-28">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-4xl leading-tight text-espresso md:text-5xl">
          Refunds &amp; Cancellations
        </h1>

        <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-espresso/55">
          Version {REFUND_POLICY_VERSION} · in effect from{" "}
          <time dateTime={TERMS_EFFECTIVE_DATE}>
            {TERMS_EFFECTIVE_DATE_DISPLAY}
          </time>
        </p>

        <p className="mt-8 text-lg leading-relaxed text-espresso/75">
          {REFUNDS_INTRO}
        </p>

        {/*
          The statutory-rights notice that used to sit here has been removed
          along with the wording it referred to — see `refunds.ts`. The block
          is rendered only if the constant carries text, so restoring the
          notice is a one-line change in the data rather than a change here.
        */}
        {STATUTORY_RIGHTS_NOTICE !== "" && (
          <p
            className="mt-8 rounded-2xl border border-gold-dark/40 bg-gold/10 px-5 py-4 leading-relaxed text-espresso"
            role="note"
          >
            {STATUTORY_RIGHTS_NOTICE}
          </p>
        )}

        <div className="mt-14 space-y-10">
          {REFUND_SECTIONS.map((section) => (
            <section
              key={section.heading}
              aria-labelledby={`${section.clause}-${section.heading.replace(/\W+/g, "-").toLowerCase()}`}
            >
              <h2
                id={`${section.clause}-${section.heading.replace(/\W+/g, "-").toLowerCase()}`}
                className="font-serif text-2xl leading-snug text-espresso"
              >
                {section.heading}
              </h2>

              {/*
                The customer's own question, in their words, above the answer.
                Someone scanning for their situation recognises the question
                faster than the heading.
              */}
              <p className="mt-2 text-sm italic leading-relaxed text-espresso/55">
                “{section.question}”
              </p>

              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-4 leading-relaxed text-espresso/75"
                >
                  {paragraph}
                </p>
              ))}

              {section.points && (
                <ul className="mt-4 space-y-2 pl-5 text-espresso/70 marker:text-gold-deep">
                  {section.points.map((point) => (
                    <li key={point} className="list-disc leading-relaxed">
                      {point}
                    </li>
                  ))}
                </ul>
              )}

              {/* The clause this restates, so the two documents stay checkable. */}
              <p className="mt-3 text-xs text-espresso/50">
                Terms:{" "}
                <Link
                  to={`/legal/terms#${section.clause}`}
                  className="underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
                >
                  clause “{section.clause}”
                </Link>
              </p>
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-espresso/10 bg-white p-6">
          <h2 className="font-serif text-xl text-espresso">
            If you are unsure
          </h2>
          <p className="mt-3 leading-relaxed text-espresso/75">
            Write to us. Almost everything on this page is settled in a
            conversation rather than by anyone relying on a clause, and we would
            rather hear from you early than have you assume the answer.
          </p>
        </div>

        <div className="mt-12 text-center">
          <Link
            to="/legal/terms"
            className="inline-flex min-h-11 items-center rounded-full border border-espresso/20 px-8 py-3 text-sm text-espresso transition-colors hover:bg-espresso hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
          >
            Read the full Terms
          </Link>
        </div>
      </div>
    </div>
  </>
);

export default Refund;
