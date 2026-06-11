import { Helmet } from "react-helmet-async";

export default function Press() {

  return (
    <>
    <Helmet>
  <title>For press inquiries | My Custom Beats</title>
  <meta
    name="description"
    content="MyCustomBeats collaborates with media outlets, music networks
          and lifestyle publications around the world."
  />
</Helmet>

    <div className="bg-[#FBF9F6] text-black">

      {/* HERO */}
      <section className="pt-40 pb-24 text-center px-6">
        <h1 className="text-5xl md:text-7xl font-light mb-6">
          Media & Affiliations
        </h1>

        <p className="text-black/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          MyCustomBeats collaborates with media outlets, music networks
          and lifestyle publications around the world.
        </p>
      </section>

      {/* CONTACT */}
      <section className="text-center pb-24">
        <p className="text-black/60 mb-4">
          For press inquiries, please contact:
        </p>

        <p className="text-lg font-medium">
          hello@mycustombeats.com
        </p>
      </section>

    </div>
    </>
  );
}