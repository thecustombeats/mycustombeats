import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Terms() {
  return (

    <>
    <Helmet>
  <title>Terms & Conditions | My Custom Beats</title>
  <meta
    name="description"
    content="Each project with MyCustomBeats crafted uniquely for you, these terms ensure clarity,
          fairness, and a seamless experience."
  />
</Helmet>


    <div className="min-h-screen bg-[#FBF9F6] text-black px-6 py-28">
      <div className="max-w-3xl mx-auto">

        {/* HEADER */}
        <h1 className="text-5xl font-light mb-6">
          Terms & Conditions
        </h1>

        <p className="text-black/50 mb-16 text-sm">
          Last updated: {new Date().getFullYear()}
        </p>

        {/* INTRO */}
        <p className="text-lg text-black/70 leading-relaxed mb-16">
          By placing an order with MyCustomBeats, you agree to the following terms.
          Each project is crafted uniquely for you, and these terms ensure clarity,
          fairness, and a seamless experience.
        </p>

        {/* SECTIONS */}
        <div className="space-y-16">

          {[
            {
              title: "1. Nature of Service",
              text: "All products are bespoke, made-to-order experiences including custom songs and physical keepsakes. Each project is uniquely created based on your submission.",
            },
            {
              title: "2. Payment & Refunds",
              text: "Full payment is required before production begins. Due to the personalised nature of our work, refunds are not available once production has started.",
            },
            {
              title: "3. Revisions",
              text: "Revisions are included depending on your selected package. Changes must remain within the original concept.",
            },
            {
              title: "4. Content Guidelines",
              text: "We reserve the right to refuse or modify content that is offensive, inappropriate, or violates our guidelines.",
            },
            {
              title: "5. Intellectual Property",
              text: "You receive a personal-use licence. All production rights remain with MyCustomBeats unless agreed otherwise.",
            },
            {
              title: "6. Delivery",
              text: "Delivery timelines are estimates and may vary depending on project complexity and communication speed.",
            },
            {
              title: "7. Liability",
              text: "Our liability is limited to the amount paid for the service. We are not responsible for subjective interpretation.",
            },
            {
              title: "8. Privacy",
              text: "Your data is used solely for order fulfilment and is never sold or shared.",
            },
            {
              title: "9. Acceptance",
              text: "By placing an order, you confirm that you have read and agreed to these terms.",
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

        {/* CTA */}
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