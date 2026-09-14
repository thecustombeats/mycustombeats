import { Link } from "react-router-dom";
import NoIndex from "../components/NoIndex";

export default function PartnerThankYou() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-32 text-center sm:px-8">
      <NoIndex title="Thank you | My Custom Beats" />
      <h1 className="mb-6 font-serif text-5xl text-espresso">Thank you for reaching out</h1>
      <p className="mb-10 text-lg leading-relaxed text-espresso/85">
        Your partnership request has been received. Our team will review your proposal and get back to you soon.
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
