import SectionHeading from "../components/mcb/SectionHeading";
import { McbButtonLink } from "../components/mcb/McbButton";
import { JOURNEY, KEEPSAKE, MOMENT } from "../data/catalogue";

/**
 * How it works — remember, tell us, we create, keep and relive.
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

const STEPS = [
  {
    title: "Remember",
    body: "Choose the moment you want to keep — an anniversary, a wedding, a birthday, a family gathering, a retirement or a day at sea.",
  },
  {
    title: "Tell us your story",
    body: "Share it in your own words: the people, the places, the little details. No lyrics or musical knowledge needed. Pick a mood and style, or let MCB choose the music style for you.",
  },
  {
    title: "We create",
    body: "Your story is written into a personalised song and produced for you. Choose to keep it digitally, on a picture disc, or as a full album on vinyl.",
  },
  {
    title: "Keep, relive and share",
    body: "Play it at the celebration, give it as a gift, keep it on the shelf — and return to the moment whenever you want.",
  },
];

const HowItWorksSection = () => (
  <section id="how-it-works" aria-labelledby="how-it-works-heading" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        id="how-it-works-heading"
        eyebrow="How it works"
        title="From your story to something you can keep"
      />

      <ol className="mt-14 grid list-none gap-5 p-0 sm:grid-cols-2 lg:grid-cols-4">
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
