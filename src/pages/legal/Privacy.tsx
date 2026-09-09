/**
 * PRIVACY POLICY.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT SPRINT 8 CHANGED HERE, AND WHAT IT DID NOT
 * ─────────────────────────────────────────────────────────────────────────
 * This page said "We do not sell or share your data". The first half is true.
 * The second was not: a customer's order passes through Stripe, Resend,
 * Cloudinary, the site's host and MCB's own database, and it has to in order
 * for the order to exist at all. An absolute claim that is contradicted by
 * the checkout the customer just used is worse than saying less.
 *
 * That statement is corrected below. The page is NOT otherwise rewritten:
 * lawful bases, retention periods, international transfers, the full set of
 * data-subject rights and cookies all remain outstanding, and a proper UK
 * GDPR policy is a piece of work in its own right rather than a paragraph
 * appended to a terms sprint. That work is registered as BLOCKING in
 * the internal legal-review register, and must close before a production
 * release.
 *
 * The fix here is deliberately the minimum that removes a false statement,
 * because the alternative — leaving it in place until a bigger sprint gets to
 * it — means knowingly publishing something untrue.
 */

import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { PRIVACY_POLICY_VERSION, TERMS_EFFECTIVE_DATE, TERMS_EFFECTIVE_DATE_DISPLAY } from "../../data/legal";

export default function Privacy() {
  return (
    <>
    <Helmet>
  <title>Privacy Policy | My Custom Beats</title>
  <meta
    name="description"
    content="What we collect, what we use it for, who else necessarily handles it so your order can happen, and the rights you have over it."
  />
</Helmet>

    <div className="min-h-screen bg-[#FBF9F6] text-black px-6 py-28">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-5xl font-light mb-6">
          Privacy Policy
        </h1>

        <p className="mt-6 font-mono text-xs uppercase tracking-[0.14em] text-black/55">
          Version {PRIVACY_POLICY_VERSION} · in effect from{" "}
          <time dateTime={TERMS_EFFECTIVE_DATE}>
            {TERMS_EFFECTIVE_DATE_DISPLAY}
          </time>
        </p>

        <p className="text-black/60 mb-16 mt-6 text-base leading-relaxed">
          Your privacy matters to us, and so does being accurate about it. This
          page explains what we collect, what we do with it, and who else
          necessarily handles it so that your order can happen at all.
        </p>

        <div className="space-y-16">

          {[
            {
              title: "Information We Collect",
              text: "We collect your name, contact details, and project information necessary to create your custom experience.",
            },
            {
              title: "How We Use Your Data",
              text: "Your information is used to create, deliver and communicate about your order, and to keep the business records we are required to keep.",
            },
            {
              title: "We Do Not Sell Your Data",
              text: "We do not sell your personal information, and we do not share it with anyone for their own marketing.",
            },
            {
              title: "Who Else Handles It",
              text: "Running an online shop means some of your information passes through the services we use to operate: our payment processor takes your payment and we never see your card details; an email service sends your order confirmation; a media service stores artwork you upload; our website host and our own database hold your order record. They handle it only to provide those services to us, and not for their own purposes. We are working on a fuller account of each of them, with retention periods and where they operate.",
            },
            {
              title: "Your Rights",
              text: "You can ask us what we hold about you, ask us to correct it, and ask us to delete it. Some records — an order and its payment — we have to keep for a period for accounting and legal reasons, and we will tell you if that applies to a deletion request.",
            },
            {
              title: "Contact",
              text: "For any privacy concerns, contact us directly.",
            },
          ].map((section, i) => (
            <div key={i}>
              <h2 className="text-xl font-medium mb-3">
                {section.title}
              </h2>
              <p className="text-black/60 leading-relaxed">
                {section.text}
              </p>
            </div>
          ))}

        </div>

        <div className="mt-24 text-center">
          <Link
            to="/"
            className="px-8 py-3 border border-black/20 rounded-full text-sm hover:bg-black hover:text-white transition"
          >
            Back to Home
          </Link>
        </div>

      </div>
    </div>
    </>
  );
}