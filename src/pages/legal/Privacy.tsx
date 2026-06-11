import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Privacy() {
  return (
    <>
    <Helmet>
  <title>Privacy Policy | My Custom Beats</title>
  <meta
    name="description"
    content="Your privacy matters to us. Your information is secure and handled with complete confidentiality."
  />
</Helmet>

    <div className="min-h-screen bg-[#FBF9F6] text-black px-6 py-28">
      <div className="max-w-3xl mx-auto">

        <h1 className="text-5xl font-light mb-6">
          Privacy Policy
        </h1>

        <p className="text-black/50 mb-16 text-sm">
          Your privacy matters to us.
        </p>

        <div className="space-y-16">

          {[
            {
              title: "Information We Collect",
              text: "We collect your name, contact details, and project information necessary to create your custom experience.",
            },
            {
              title: "How We Use Your Data",
              text: "Your information is used solely to create, deliver, and communicate your order.",
            },
            {
              title: "Data Protection",
              text: "We do not sell or share your data. Secure systems are used for all transactions.",
            },
            {
              title: "Your Rights",
              text: "You may request deletion of your data after your project is completed.",
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