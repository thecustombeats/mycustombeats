import { Helmet } from "react-helmet-async";

export default function Refund() {
  return (
    <>
    <Helmet>
  <title>Refund & Returns Policy | My Custom Beats</title>
  <meta
    name="description"
    content="At MyCustomBeats, every song and keepsake is crafted with care and intention. Due to its personalisation our policy differ from standard retail purchases"
  />
</Helmet>

    <div className="bg-[#FBF9F6] text-black px-6 py-24">
      
      <div className="max-w-4xl mx-auto">

        {/* HEADER */}
        <h1 className="text-4xl md:text-5xl font-light mb-6">
          Refund & Returns Policy
        </h1>

        <p className="text-black/60 mb-12">
          Last updated: {new Date().getFullYear()}
        </p>

        {/* INTRO */}
        <p className="text-black/70 mb-10 leading-relaxed">
          At MyCustomBeats, every song and keepsake is crafted with care and intention.
          Due to the personalised nature of our products, our refund policy differs from
          standard retail purchases. Please read the following carefully before placing your order.
        </p>

        {/* DIGITAL PRODUCTS */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium mb-4">
            Custom Digital Products (Songs & Audio)
          </h2>

          <p className="text-black/70 mb-4 leading-relaxed">
            All custom songs are created specifically for you based on the details you provide.
            As such, these are non-refundable once production has begun.
          </p>

          <ul className="list-disc pl-6 text-black/60 space-y-2">
            <li>No refunds once songwriting or production has started</li>
            <li>Revisions are included based on your selected package</li>
            <li>We work closely with you to ensure you are satisfied with the final result</li>
          </ul>
        </section>

        {/* PHYSICAL PRODUCTS */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium mb-4">
            Physical Keepsake Products
          </h2>

          <p className="text-black/70 mb-4 leading-relaxed">
            Our physical products (such as plaques, vinyls, artwork, and memory boxes) are
            custom-made and produced on demand.
          </p>

          <ul className="list-disc pl-6 text-black/60 space-y-2">
            <li>No refunds or returns for personalised items</li>
            <li>If your item arrives damaged or defective, we will replace it</li>
            <li>Issues must be reported within 48 hours of delivery</li>
          </ul>
        </section>

        {/* CANCELLATIONS */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium mb-4">
            Cancellations
          </h2>

          <p className="text-black/70 leading-relaxed">
            Orders may be cancelled within 24 hours of purchase, provided that work has not yet begun.
            Once production has started, cancellations are no longer possible.
          </p>
        </section>

        {/* EXCEPTIONS */}
        <section className="mb-12">
          <h2 className="text-2xl font-medium mb-4">
            Exceptions & Support
          </h2>

          <p className="text-black/70 leading-relaxed">
            We understand that every situation is unique. If you have concerns about your order,
            please contact us and we will do our best to find a fair solution.
          </p>
        </section>

        {/* CONTACT */}
        <section className="mb-16">
          <h2 className="text-2xl font-medium mb-4">
            Contact Us
          </h2>

          <p className="text-black/70 leading-relaxed">
            For any questions regarding your order, please reach out via our contact page or email us directly.
          </p>
        </section>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-black/60 mb-6">
            Have questions before placing your order?
          </p>

          <a
            href="/#order-form"
            className="px-10 py-4 bg-black text-white hover:bg-gold hover:text-black transition rounded-full"
          >
            Start Your Song →
          </a>
        </div>

      </div>
    </div>
    </>
  );
}