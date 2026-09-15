import SectionHeading from "../components/mcb/SectionHeading";
import { McbButtonLink } from "../components/mcb/McbButton";
import { JOURNEY, KEEPSAKE, MOMENT } from "../data/catalogue";
import { CREATIVE_JOURNEY, CREATIVE_PROMISE } from "../data/legal";

/**
 * How it works — tell us your story, choose your sound, upload your photograph,
 * trust MCB with the creativity, experience the reveal.
 *
 * Timing is read from the catalogue's own turnaround lines, never restated.
 * No animation: the steps are the content and must never depend on a scroll
 * trigger to become visible.
 */
const sentence = (label: string | undefined) => (label ? `${label.charAt(0).toLowerCase()}${label.slice(1)}` : "");

/** Timing lines, grouping experiences that share the same catalogue wording. */
const TIMINGS = [MOMENT, KEEPSAKE, JOURNEY].reduce<{ names: string; label: string }[]>((lines, product) => {
  const label = product.turnaround?.label;
  if (!label) return lines;
  const same = lines.find((line) => line.label === label);
  if (same) same.names = `${same.names} and ${product.name}`;
  else lines.push({ names: product.name, label });
  return lines;
}, []);

/** The approved five-step journey (Single Creative Authority), from legal/production.ts. */
const STEPS = CREATIVE_JOURNEY.map((step) => ({ title: step.title, body: step.detail }));

const HowItWorksSection = () => (
  <section id="how-it-works" aria-labelledby="how-it-works-heading" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        id="how-it-works-heading"
        eyebrow="How it works"
        title={CREATIVE_PROMISE}
      />

      <ol className="mt-14 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-5">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex flex-col rounded-2xl border border-ink/10 bg-ivory p-6 sm:p-7">
            <span aria-hidden="true" className="font-mono text-base text-gold-deep">
              {String(index + 1).padStart(2, "0")}
            </span>
            <h3 className="mt-3 text-ink">
              <span className="sr-only">Step {index + 1}: </span>
              {step.title}
            </h3>
            <p className="mt-3 text-base leading-relaxed text-espresso/80">{step.body}</p>
          </li>
        ))}
      </ol>

      <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-ink/10 px-6 py-5 text-center">
        <p className="text-base leading-relaxed text-espresso/80">
          {TIMINGS.map((timing, index) => (
            <span key={timing.names}>
              {index > 0 && " "}
              <strong className="font-semibold text-ink">{timing.names}:</strong> {sentence(timing.label)}.
            </span>
          ))}
        </p>
      </div>

      <div className="mt-10 text-center">
        <McbButtonLink to="/create" className="min-h-14 px-9 text-lg">
          Create Your Memory
        </McbButtonLink>
      </div>
    </div>
  </section>
);

export default HowItWorksSection;
