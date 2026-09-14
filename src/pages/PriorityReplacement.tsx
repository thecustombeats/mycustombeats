import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  KEEPSAKE,
  PRIORITY_REPLACEMENT,
  PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS,
  formatMoney,
} from "../data/catalogue";
import { productPageStructuredData } from "../lib/seo";
import { McbButtonLink } from "../components/mcb/McbButton";

/**
 * MCB Priority Replacement™ — an optional service, explained calmly.
 *
 * The one distinction this page must make unmistakable: the claim window is
 * the window for requesting the OPTIONAL priority service. It is not a time
 * limit on anyone's statutory rights. Price, window and disclosures are read
 * from the catalogue.
 */

const PRICE = PRIORITY_REPLACEMENT.variants[0]
  ? formatMoney(PRIORITY_REPLACEMENT.variants[0].price)
  : "";

/** The catalogue's statutory-rights disclosure, and everything else it requires. */
const RIGHTS = PRIORITY_REPLACEMENT.disclosures.find((d) => d.includes("consumer rights"));
const OTHER_DISCLOSURES = PRIORITY_REPLACEMENT.disclosures.filter((d) => d !== RIGHTS);

const QUESTIONS: readonly { question: string; answer: string }[] = [
  {
    question: "What does it add?",
    answer: `${PRIORITY_REPLACEMENT.shortDescription} Subject to the service terms and product eligibility.`,
  },
  {
    question: "Is it per order?",
    answer: `No. It applies only to the individual eligible ${KEEPSAKE.name} for which it was selected. If an order contains several eligible ${KEEPSAKE.name}s, each one has its own independent choice — and you can choose it for some and not others.`,
  },
  {
    question: "What information might MCB request?",
    answer:
      "Your order reference, the affected item, photographs of the damage, delivery information and other reasonable evidence needed to identify the item and arrange the replacement.",
  },
];

const PriorityReplacement = () => {
  return (
    <div className="min-h-screen bg-ivory text-espresso">
      <Helmet>
        <title>MCB Priority Replacement | My Custom Beats</title>
        <meta
          name="description"
          content="Learn how the optional MCB Priority Replacement service works for eligible keepsakes, including price, request window and your consumer rights."
        />
        <script type="application/ld+json">
          {JSON.stringify(productPageStructuredData(PRIORITY_REPLACEMENT.id))}
        </script>
      </Helmet>

      <section className="px-5 pb-12 pt-28 sm:px-8 md:pb-16 md:pt-36">
        <div className="mx-auto max-w-3xl">
          <p className="label-uppercase text-gold-deep">Optional service</p>
          <h1 className="mt-4 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">{PRIORITY_REPLACEMENT.name}</h1>
          <p className="mt-5 text-lg leading-relaxed text-espresso/80 md:text-xl">{PRIORITY_REPLACEMENT.positioning}</p>

          <dl className="m-0 mt-10 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <dt className="text-base font-semibold text-ink">Price</dt>
              <dd className="m-0 mt-1">
                <span className="font-mono text-2xl text-ink">{PRICE}</span>
                <span className="mt-1 block text-base text-espresso/80">{OTHER_DISCLOSURES.join(" ")}</span>
              </dd>
            </div>
            <div className="rounded-2xl border border-ink/10 bg-white p-5">
              <dt className="text-base font-semibold text-ink">Request window for this service</dt>
              <dd className="m-0 mt-1">
                <span className="font-mono text-2xl text-ink">{`${PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days`}</span>
                <span className="mt-1 block text-base text-espresso/80">From confirmed delivery, to request priority handling.</span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* ---- The distinction that matters ------------------------------- */}
      <section aria-labelledby="your-rights" className="px-5 pb-12 sm:px-8 md:pb-16">
        <div className="mx-auto max-w-3xl rounded-3xl bg-ink p-6 text-ivory md:p-10">
          <h2 id="your-rights" className="font-serif text-3xl leading-tight !text-ivory md:text-4xl">
            Your rights come first — with or without this service
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-ivory/90">{RIGHTS}</p>
          <p className="mt-4 text-base leading-relaxed text-ivory/85">
            {`The ${PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS}-day window applies only to requesting this optional priority service. It is not a time limit on your statutory rights, which continue to apply as the law provides.`}
          </p>
        </div>
      </section>

      <section aria-labelledby="questions" className="px-5 pb-20 sm:px-8 md:pb-28">
        <div className="mx-auto max-w-3xl">
          <h2 id="questions" className="font-serif text-3xl leading-tight text-ink md:text-4xl">
            Good to know
          </h2>
          <div className="mt-6 divide-y divide-ink/10 border-y border-ink/10">
            <section className="py-6">
              <h3 className="font-serif text-2xl leading-snug text-ink">When should I contact MCB?</h3>
              <p className="mt-2 text-base leading-relaxed text-espresso/80 md:text-lg">
                {`Please tell us as soon as reasonably possible after you discover arrival damage. If you chose ${PRIORITY_REPLACEMENT.name} for that item, request it within ${PRIORITY_REPLACEMENT_CLAIM_WINDOW_DAYS} days of confirmed delivery. After that, you can still contact us about a damaged or faulty item under your normal rights.`}
              </p>
            </section>
            {QUESTIONS.map((item) => (
              <section key={item.question} className="py-6">
                <h3 className="font-serif text-2xl leading-snug text-ink">{item.question}</h3>
                <p className="mt-2 text-base leading-relaxed text-espresso/80 md:text-lg">{item.answer}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 rounded-3xl border border-ink/10 bg-white p-6 md:p-8">
            <h2 className="font-serif text-2xl leading-tight text-ink md:text-3xl">Need help with an order?</h2>
            <p className="mt-2 text-base leading-relaxed text-espresso/80">Contact MCB and include your order reference so we can help quickly.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
              <McbButtonLink to="/#contact">Contact MCB</McbButtonLink>
              <Link to="/keepsake" className="inline-flex min-h-12 items-center justify-center px-2 text-base font-medium text-ink underline underline-offset-4 hover:text-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2">
                {`About ${KEEPSAKE.name}`}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PriorityReplacement;
