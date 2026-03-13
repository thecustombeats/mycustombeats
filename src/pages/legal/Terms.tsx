import { Link } from "react-router-dom";

export default function Terms() {
  return (
    <div className="min-h-screen bg-espresso text-ivory px-6 py-20">
      <div className="max-w-4xl mx-auto space-y-10">

        <h1 className="text-3xl font-light tracking-wide text-gold">
          Terms & Conditions
        </h1>

        <p className="text-ivory/70 leading-relaxed">
          By placing an order with My Custom Beats, you agree to the following
          terms and conditions. Please read them carefully before proceeding.
        </p>

        <div className="space-y-8 text-ivory/70 leading-relaxed">

          {/* 1 */}
          <div>
            <h3 className="text-gold mb-3">1. Nature of Service</h3>
            <p>
              My Custom Beats provides personalised digital music experiences created
              based on information submitted by the customer. All products are
              digital, bespoke, and made-to-order. No physical items are shipped.
            </p>
          </div>

          {/* 2 */}
          <div>
            <h3 className="text-gold mb-3">2. Payment & Refund Policy</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Full payment is required before production begins.</li>
              <li>No refunds are available once production has started.</li>
              <li>Chargebacks or disputes after delivery may result in access suspension.</li>
            </ul>
          </div>

          {/* 3 */}
          <div>
            <h3 className="text-gold mb-3">3. Revisions</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Each order includes up to two reasonable revisions.</li>
              <li>Revisions must stay within the original concept.</li>
              <li>Major changes or additional songs may incur extra fees.</li>
            </ul>
          </div>

          {/* 4 */}
          <div>
            <h3 className="text-gold mb-3">4. Content Guidelines</h3>
            <p>By submitting information, you confirm your content does not include:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Offensive or hateful language</li>
              <li>Political messaging</li>
              <li>Abusive, defamatory, or illegal content</li>
              <li>Explicit or inappropriate material</li>
            </ul>
            <p className="mt-3">
              My Custom Beats reserves the right to refuse or modify content
              that violates these guidelines without refund.
            </p>
          </div>

          {/* 5 */}
          <div>
            <h3 className="text-gold mb-3">5. Intellectual Property</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Customer receives a personal-use licence upon final delivery.</li>
              <li>My Custom Beats retains full production and master rights.</li>
              <li>Commercial use or redistribution requires written consent.</li>
            </ul>
          </div>

          {/* 6 */}
          <div>
            <h3 className="text-gold mb-3">6. Delivery</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Delivery timelines vary by package and workload.</li>
              <li>Timelines are estimates, not guarantees.</li>
              <li>Delays due to incomplete information are not our responsibility.</li>
            </ul>
          </div>

          {/* 7 */}
          <div>
            <h3 className="text-gold mb-3">7. Liability Limitation</h3>
            <p>
              My Custom Beats is not liable for emotional dissatisfaction,
              subjective interpretation of music, or technical playback issues
              on third-party platforms. Maximum liability is limited to the
              amount paid for the service.
            </p>
          </div>

          {/* 8 */}
          <div>
            <h3 className="text-gold mb-3">8. Privacy & Data</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Customer data is used solely for order fulfillment.</li>
              <li>Data is not sold or shared with third parties.</li>
              <li>Customers may request data deletion after completion.</li>
            </ul>
          </div>

          {/* 9 */}
          <div>
            <h3 className="text-gold mb-3">9. Acceptance</h3>
            <p>
              By completing payment, you acknowledge that you have read,
              understood, and agreed to these Terms & Conditions.
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