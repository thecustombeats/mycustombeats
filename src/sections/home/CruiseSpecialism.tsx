import ResponsiveImage from "../../components/ResponsiveImage";
import { McbButtonLink } from "../../components/mcb/McbButton";
import { IMAGES } from "../../data/imagery";

/**
 * The cruise specialism — visible, proportionate, and honest. It rests on the
 * founders' own time at sea; it names no cruise line and claims no
 * partnership, endorsement or customer numbers.
 *
 * The photograph is founder-approved: Rinaldi on deck with an MCB vinyl. The
 * portrait 4:5 crop keeps his face, the record and the sea in frame.
 */
const CruiseSpecialism = () => (
  <section aria-labelledby="cruise-heading" className="bg-ivory px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 md:grid-cols-2 lg:gap-16">
      <div className="mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-[1.5rem] bg-ink/5">
        <ResponsiveImage
          image={IMAGES.rinaldiAtSea}
          sizes="(min-width: 768px) 28rem, 92vw"
          className="h-full w-full object-cover object-[50%_45%]"
        />
      </div>

      <div>
        <p className="label-uppercase mb-4 text-gold-deep">Cruise memories</p>
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
