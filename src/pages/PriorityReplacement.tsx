import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  PRIORITY_REPLACEMENT,
  PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  formatMoney,
} from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";

const PRICE = PRIORITY_REPLACEMENT.variants[0]
  ? formatMoney(PRIORITY_REPLACEMENT.variants[0].price)
  : "";

/** The catalogue's statutory-rights disclosure, and everything else it requires. */
const RIGHTS = PRIORITY_REPLACEMENT.disclosures.find((d) => d.includes("consumer rights"));
const OTHER_DISCLOSURES = PRIORITY_REPLACEMENT.disclosures.filter((d) => d !== RIGHTS);

const PriorityReplacement = () => {
  return (
    <main className="min-h-screen bg-[#FBF9F6] text-espresso">
      <Helmet>
        <title>MCB Priority Replacement | My Custom Beats</title>
        <meta
          name="description"
          content="Learn how the optional MCB Priority Replacement service works for eligible keepsakes, including price, claim window and customer rights."
        />
        <script type="application/ld+json">
          {JSON.stringify(productPageStructuredData(PRIORITY_REPLACEMENT.id))}
        </script>
      </Helmet>

      <section className="px-6 py-20 md:py-28">
        <div className="max-w-3xl mx-auto">
          <p className="label-uppercase text-gold mb-4">Customer Service</p>
          <h1 className="text-4xl md:text-6xl font-light mb-6" style={{ fontFamily: "Playfair Display, serif" }}>
            {PRIORITY_REPLACEMENT.name}
          </h1>
          <p className="text-lg md:text-xl text-espresso/70 leading-relaxed mb-10">
            {PRIORITY_REPLACEMENT.positioning}
          </p>

          <div className="rounded-3xl bg-white shadow-luxury p-7 md:p-10 space-y-10">
            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>How much does it cost?</h2>
              <p className="text-espresso/70 leading-relaxed">
                {PRICE}. {OTHER_DISCLOSURES.join(" ")}
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>What does it add?</h2>
              <p className="text-espresso/70 leading-relaxed">
                {PRIORITY_REPLACEMENT.shortDescription} Subject to the service terms and product eligibility.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>Does this replace my normal rights?</h2>
              <p className="text-espresso/70 leading-relaxed font-medium">
                No. {RIGHTS}
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>When should I contact MCB?</h2>
              <p className="text-espresso/70 leading-relaxed">
                Please tell us as soon as reasonably possible after discovering arrival damage. Requests for this optional priority service must be submitted within {PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days of confirmed delivery.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>Is it per order?</h2>
              <p className="text-espresso/70 leading-relaxed">
                No. It applies only to the individual eligible keepsake for which the {PRICE} service was selected. If an order contains several eligible keepsakes, each one has its own independent choice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>What information might MCB request?</h2>
              <p className="text-espresso/70 leading-relaxed">
                We may ask for your order reference, the affected keepsake, photographs of the damage, delivery information and other reasonable evidence needed to identify the item and arrange the appropriate replacement service.
              </p>
            </section>

            <section className="border-t border-espresso/10 pt-8">
              <h2 className="text-2xl mb-3" style={{ fontFamily: "Playfair Display, serif" }}>Need help with an order?</h2>
              <p className="text-espresso/70 leading-relaxed mb-5">
                Contact MCB and include your order number so we can help quickly.
              </p>
              <Link
                to="/#contact"
                className="inline-flex items-center rounded-full bg-gold px-7 py-3 text-espresso font-medium transition hover:scale-[1.02]"
              >
                Contact MCB
              </Link>
            </section>
          </div>
        </div>
      </section>
    </main>
  );
};

export default PriorityReplacement;
