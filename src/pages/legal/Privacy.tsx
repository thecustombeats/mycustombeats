/**
 * PRIVACY POLICY.
 *
 * Renders `data/legal/privacy.ts` and holds no policy wording of its own —
 * the same arrangement as the Terms, and for the same reason: this page and
 * the data flows it describes have to agree, and a page that restates them by
 * hand is a page that will eventually be wrong.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS PAGE IS, AND WHAT IT IS NOT
 * ─────────────────────────────────────────────────────────────────────────
 * It is an accurate account of where a customer's information actually goes,
 * with every processor read out of the source rather than assumed.
 *
 * It is NOT evidence that MCB's UK GDPR position has been reviewed. Lawful
 * bases, exact retention periods, international transfer mechanisms and the
 * cookie consent position all still need a qualified opinion, and two
 * sections say so in plain sight rather than papering over it. That review
 * remains BLOCKING in the internal register.
 */

import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  BROWSER_STORAGE,
  FX_NOTE,
  PRIVACY_INTRO,
  PRIVACY_SECTIONS,
  PRIVACY_POLICY_VERSION,
  PROCESSORS,
  TERMS_EFFECTIVE_DATE,
  TERMS_EFFECTIVE_DATE_DISPLAY,
} from "../../data/legal";

const Privacy = () => (
  <>
    <Helmet>
      <title>Privacy Policy | My Custom Beats</title>
      <meta
        name="description"
        content="What we collect, what we use it for, who else necessarily handles it so your order can happen, and the rights you have over it."
      />
      {/* No canonical here — App.tsx emits one for every route, and
          react-helmet-async cannot replace a tag it did not create. */}
    </Helmet>

    <div className="min-h-screen bg-ivory px-6 py-24 md:py-28">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-serif text-4xl leading-tight text-espresso md:text-5xl">
          Privacy Policy
        </h1>

        <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-espresso/55">
          Version {PRIVACY_POLICY_VERSION} · in effect from{" "}
          <time dateTime={TERMS_EFFECTIVE_DATE}>
            {TERMS_EFFECTIVE_DATE_DISPLAY}
          </time>
        </p>

        <p className="mt-8 text-lg leading-relaxed text-espresso/75">
          {PRIVACY_INTRO}
        </p>

        <div className="mt-14 space-y-10">
          {PRIVACY_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="font-serif text-2xl leading-snug text-espresso">
                {section.heading}
              </h2>
              {section.body.map((paragraph) => (
                <p
                  key={paragraph}
                  className="mt-4 leading-relaxed text-espresso/75"
                >
                  {paragraph}
                </p>
              ))}

              {/*
                The processor table renders inside the section that promises
                it, so the promise and the list cannot become separated by a
                later edit.
              */}
              {section.heading === "Where your information goes" && (
                <>
                  <div className="mt-6 overflow-x-auto rounded-2xl border border-espresso/10 bg-white">
                    {/*
                      A real table, and it scrolls inside its own container
                      rather than pushing the page sideways at 320px.
                    */}
                    <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-espresso/10">
                          <th scope="col" className="p-4 font-medium text-espresso">
                            Who
                          </th>
                          <th scope="col" className="p-4 font-medium text-espresso">
                            What they do for us
                          </th>
                          <th scope="col" className="p-4 font-medium text-espresso">
                            What they receive
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {PROCESSORS.map((processor) => (
                          <tr
                            key={processor.name}
                            className="border-b border-espresso/[0.07] last:border-0 align-top"
                          >
                            <th
                              scope="row"
                              className="p-4 font-medium text-espresso whitespace-nowrap"
                            >
                              {processor.name}
                            </th>
                            <td className="p-4 leading-relaxed text-espresso/70">
                              {processor.purpose}
                            </td>
                            <td className="p-4 leading-relaxed text-espresso/70">
                              {processor.receives}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-espresso/60">
                    {FX_NOTE}
                  </p>
                </>
              )}

              {section.heading === "Cookies and similar technology" && (
                <ul className="mt-5 space-y-3 rounded-2xl border border-espresso/10 bg-white p-5 list-none">
                  {BROWSER_STORAGE.map((value) => (
                    <li key={value.key} className="leading-relaxed">
                      <span className="font-mono text-xs text-espresso">
                        {value.key}
                      </span>
                      <span className="mt-1 block text-sm text-espresso/70">
                        {value.purpose}
                        {value.note && (
                          <span className="mt-0.5 block text-espresso/55">
                            {value.note}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-espresso/10 bg-white p-6">
          <p className="leading-relaxed text-espresso/75">
            Our{" "}
            <Link
              to="/legal/terms"
              className="text-gold-deep underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
            >
              Terms &amp; Conditions
            </Link>{" "}
            explain what we make and what happens if something is wrong, and{" "}
            <Link
              to="/legal/refund"
              className="text-gold-deep underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
            >
              Refunds &amp; Cancellations
            </Link>{" "}
            covers cancelling.
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

export default Privacy;
