import ResponsiveImage from "../../components/ResponsiveImage";
import { McbButtonLink } from "../../components/mcb/McbButton";
import { IMAGES } from "../../data/imagery";

/**
 * The cruise specialism — visible, proportionate, and honest. It rests on the
 * founders' own time at sea; it names no cruise line and claims no
 * partnership, endorsement or customer numbers.
 */
const CruiseSpecialism = () => (
  <section aria-labelledby="cruise-heading" className="bg-ivory px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-2 lg:gap-16">
      <div className="aspect-[16/11] overflow-hidden rounded-[1.5rem] bg-ink/5">
        <ResponsiveImage
          image={IMAGES.soloDeck}
          alt="A woman in a sun hat looking out to sea from the deck of a ship at sunset"
          sizes="(min-width: 768px) 46vw, 92vw"
          className="h-full w-full object-cover"
        />
      </div>

      <div>
        <p className="label-uppercase !text-[0.8125rem] mb-4 text-gold-deep">Cruise memories</p>
        <h2 id="cruise-heading" className="text-ink">
          Some of our favourite memories are made at sea
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-espresso/80">
          Life on board is something our founders know first-hand. We understand how quickly a voyage passes — the
          sailaway, the ports, the formal nights, the last sunset — and how much people want to hold on to it.
        </p>
        <p className="mt-4 text-lg leading-relaxed text-espresso/80">
          Whether it&rsquo;s a honeymoon, a milestone birthday or a family trip, we can turn your voyage into music you
          bring home.
        </p>
        <div className="mt-8">
          <McbButtonLink to="/cruise" tone="secondary">
            Explore cruise memories
          </McbButtonLink>
        </div>
      </div>
    </div>
  </section>
);

export default CruiseSpecialism;
