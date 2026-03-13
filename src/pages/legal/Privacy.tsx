import { Link } from "react-router-dom";

export default function Privacy() {
  return (
    <div className="min-h-screen bg-espresso text-ivory px-6 py-20">
      <div className="max-w-4xl mx-auto space-y-10">

        {/* Title */}
        <h1 className="text-3xl font-light tracking-wide text-gold">
          Privacy Policy
        </h1>

        {/* Intro */}
        <p className="text-ivory/70 leading-relaxed">
          My Custom Beats respects your privacy and is committed to protecting
          your personal information.
        </p>

        {/* Content */}
        <div className="space-y-8 text-ivory/70 leading-relaxed">

          <div>
            <h3 className="text-gold mb-3">
              1. Information We Collect
            </h3>
            <p>
              We may collect your name, email address, project details, and
              payment information when you place an order.
            </p>
          </div>

          <div>
            <h3 className="text-gold mb-3">
              2. How We Use Your Information
            </h3>
            <p>
              Your information is used solely to create and deliver your custom
              music project and to communicate with you regarding your order.
            </p>
          </div>

          <div>
            <h3 className="text-gold mb-3">
              3. Data Protection
            </h3>
            <p>
              We do not sell, trade, or share your personal data with third
              parties except as necessary for secure payment processing.
            </p>
          </div>

          <div>
            <h3 className="text-gold mb-3">
              4. Contact
            </h3>
            <p>
              If you have any questions regarding your privacy, please contact
              us at hello@custombeats.studio.
            </p>
          </div>

        </div>

        {/* Back Button */}
        <div className="pt-6">
          <Link
            to="/"
            className="inline-block px-6 py-3 border border-gold text-gold hover:bg-gold hover:text-espresso transition-all duration-300 text-sm tracking-wide"
          >
            ← Back to Home
          </Link>
        </div>

      </div>
    </div>
  );
}