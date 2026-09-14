import { useNavigate } from "react-router-dom";
import SectionHeading from "../../components/mcb/SectionHeading";
import MemoryConcierge from "../../components/MemoryConcierge";

/**
 * HELP ME CHOOSE — optional guidance, never a gate. The concierge itself is
 * owned elsewhere; this section only places it and routes its choice into the
 * guided flow at /create.
 */
const HelpMeChoose = () => {
  const navigate = useNavigate();

  const choose = (productId: string, sku?: string) => {
    const params = new URLSearchParams({ product: productId });
    if (sku) params.set("sku", sku);
    navigate(`/create?${params.toString()}`);
  };

  return (
    <section id="help-me-choose" aria-labelledby="help-me-choose-heading" className="scroll-mt-24 bg-white px-5 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-4xl">
        <SectionHeading
          id="help-me-choose-heading"
          eyebrow="Help me choose"
          title="Not sure where to begin?"
          intro={
            <p>
              Answer a few simple questions and we&rsquo;ll suggest a thoughtful place to start. Entirely optional — you
              can always browse on your own.
            </p>
          }
        />
        <MemoryConcierge onChoose={choose} />
      </div>
    </section>
  );
};

export default HelpMeChoose;
