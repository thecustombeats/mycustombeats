import { Link } from "react-router-dom";
import NoIndex from "../components/NoIndex";

export default function ArtistThankYou() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-32 text-center sm:px-8">
      <NoIndex title="Application received | My Custom Beats" />
      <h1 className="mb-6 font-serif text-5xl text-espresso">Application received</h1>
      <p className="mb-10 text-lg leading-relaxed text-espresso/85">
        Thank you for applying to join the My Custom Beats artist network. Our team reviews every submission carefully and will contact you if there is a fit for upcoming projects.
      </p>
      <Link
        to="/"
        className="inline-flex min-h-12 items-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
      >
        Return to the homepage
      </Link>
    </div>
  );
}
