/**
 * TERMS & CONDITIONS.
 *
 * The page renders `data/legal/terms.ts` and holds no legal wording of its
 * own. That is the point: the Refunds page restates the same rules in plainer
 * language and the FAQ answers questions about them, and when those three
 * were each written by hand they each said something slightly different about
 * refunds. One source, three renderings.
 *
 * The version and effective date come from `data/legal/versions.ts` and are
 * static. The heading here used to read `Last updated: {new Date().getFullYear()}`,
 * which changed by itself every January while the document said exactly what
 * it had said in December.
 */

import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  TERMS_CLAUSES,
  TERMS_INTRO,
  TERMS_VERSION,
  TERMS_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE_DISPLAY,
  revisionEntitlements,
} from "../../data/legal";

const Terms = () => {
  const entitlements = revisionEntitlements();

  return (
    <>
      <Helmet>
        <title>Terms &amp; Conditions | My Custom Beats</title>
        <meta
          name="description"
          content="The terms that apply when you order from My Custom Beats: what is included, how refinements work, when an order can no longer be changed, and what happens if something is wrong."
        />
        {/*
          NO canonical here. App.tsx already emits one for every route from
          the current pathname, and react-helmet-async cannot replace a tag it
          did not create — so adding a second produced two <link rel=canonical>
          elements on this page, which is the same duplicate-head-tag fault
          Sprint 0 spent its time removing.
        */}
        {/*
          No Product or Offer schema on a legal page. It describes a contract,
          not a thing for sale, and emitting an Offer here would put a second
          competing description of MCB's products into search results.
        */}
      </Helmet>

      <div className="min-h-screen bg-ivory px-6 py-24 md:py-28">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-serif text-4xl leading-tight text-espresso md:text-5xl">
            Terms &amp; Conditions
          </h1>

          {/*
            Version and effective date, both static. `<time>` carries the
            machine-readable date; the version is what an order records and
            what the confirmation email names, so a customer can match the two.
          */}
          <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-espresso/55">
            Version {TERMS_VERSION} · in effect from{" "}
            <time dateTime={TERMS_EFFECTIVE_DATE}>
              {TERMS_EFFECTIVE_DATE_DISPLAY}
            </time>
          </p>

          <p className="mt-8 text-lg leading-relaxed text-espresso/75">
            {TERMS_INTRO}
          </p>

          <nav
            aria-label="On this page"
            className="mt-12 rounded-2xl border border-espresso/10 bg-white p-6"
          >
            <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-espresso/45">
              On this page
            </h2>
            <ul className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {TERMS_CLAUSES.map((clause) => (
                <li key={clause.id}>
                  <a
                    href={`#${clause.id}`}
                    className="text-sm leading-snug text-espresso/70 underline decoration-espresso/25 underline-offset-4 hover:text-espresso hover:decoration-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
                  >
                    {clause.heading}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-14 space-y-12">
            {TERMS_CLAUSES.map((clause) => (
              <section
                key={clause.id}
                id={clause.id}
                aria-labelledby={`${clause.id}-heading`}
                // scroll-mt keeps the heading clear of the fixed site header
                // when the contents links jump to it.
                className="scroll-mt-28"
              >
                <h2
                  id={`${clause.id}-heading`}
                  className="font-serif text-2xl leading-snug text-espresso"
                >
                  {clause.heading}
                </h2>

                {clause.body.map((paragraph) => (
                  <p
                    key={paragraph}
                    className="mt-4 leading-relaxed text-espresso/75"
                  >
                    {paragraph}
                  </p>
                ))}

                {clause.points && (
                  <ul className="mt-4 space-y-2 pl-5 text-espresso/70 marker:text-gold-deep">
                    {clause.points.map((point) => (
                      <li key={point} className="list-disc leading-relaxed">
                        {point}
                      </li>
                    ))}
                  </ul>
                )}

                {/*
                  The statutory-rights preservations render as a distinct
                  block rather than a trailing sentence. They are the lines a
                  customer most needs to find, and the ones a reader skimming
                  a refund clause is most likely to miss.
                */}
                {clause.footnote && (
                  <p className="mt-5 border-l-2 border-gold-dark bg-gold/5 py-3 pl-4 pr-3 text-sm leading-relaxed text-espresso/80">
                    {clause.footnote}
                  </p>
                )}

                {/*
                  Refinement counts are READ FROM THE PACKAGES, not restated.
                  A terms page that hard-coded "two refinements" would go stale
                  the first time a package changed, and the contract would then
                  disagree with the product card.
                */}
                {clause.id === "refinements" && (
                  <dl className="mt-6 divide-y divide-espresso/10 rounded-2xl border border-espresso/10 bg-white px-5">
                    {entitlements.map((entitlement) => (
                      <div
                        key={entitlement.packageName}
                        className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                      >
                        <dt className="font-medium text-espresso">
                          {entitlement.packageName}
                        </dt>
                        <dd className="text-sm leading-relaxed text-espresso/70 sm:text-right">
                          {entitlement.entitlement}
                          {entitlement.concierge && (
                            <span className="mt-1 block text-xs text-espresso/50">
                              Agreed in your written proposal.
                            </span>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}
          </div>

          <div className="mt-16 rounded-2xl border border-espresso/10 bg-white p-6">
            <p className="leading-relaxed text-espresso/75">
              The{" "}
              <Link
                to="/legal/refund"
                className="text-gold-deep underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
              >
                Refunds &amp; Cancellations
              </Link>{" "}
              page says the same things in plainer language, and the{" "}
              <Link
                to="/legal/privacy"
                className="text-gold-deep underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
              >
                Privacy Policy
              </Link>{" "}
              covers your information.
            </p>
          </div>

          <div className="mt-12 text-center">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center rounded-full border border-espresso/20 px-8 py-3 text-sm text-espresso transition-colors hover:bg-espresso hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default Terms;
