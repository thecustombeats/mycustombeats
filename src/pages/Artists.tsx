import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

export default function Artists() {


  return (
 <>
    <Helmet>
  <title>Join Our Artists Network | My Custom Beats</title>
  <meta
    name="description"
    content="Join our global network of musicians and creators. Work on premium custom music projects with My Custom Beats."
  />
</Helmet>

    <div className="bg-[#FBF9F6] text-black">

      {/* HERO */}
      <section className="pt-40 pb-24 text-center px-6">
        <h1 className="text-5xl md:text-7xl font-light mb-6">
          Join Our Artist Network
        </h1>

        <p className="text-black/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          We collaborate with talented singers, songwriters and producers 
          to create deeply personal, world-class music experiences for our clients.
        </p>

        <Link
          to="/artists/apply"
          className="inline-flex items-center justify-center px-10 py-4 
          bg-gold text-espresso rounded-full font-medium 
          transition-all duration-300 hover:bg-espresso hover:text-ivory 
          hover:scale-105 shadow-md hover:shadow-xl"
        >
          Apply as an Artist
        </Link>
      </section>

      {/* VALUE SECTION */}
      <section className="max-w-5xl mx-auto px-6 pb-24 text-center">
        <h2 className="text-3xl font-light mb-6">
          Why Work With Us
        </h2>

        <p className="text-black/60 leading-relaxed">
          Work on meaningful projects, collaborate with global clients, and turn real stories 
          into music that lasts forever. Every project is unique, emotional, and creatively fulfilling.
        </p>
      </section>

    </div>
    </>
  );
}