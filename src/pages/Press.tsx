import { Helmet } from "react-helmet-async";

export default function Press() {

  return (
    <>
    <Helmet>
  <title>Press and media enquiries | My Custom Beats</title>
  <meta
    name="description"
    content="Press and media enquiries for My Custom Beats, the personalised song and keepsake studio."
  />
</Helmet>

    <div className="bg-[#FBF9F6] text-black">

      {/* HERO */}
      <section className="pt-40 pb-24 text-center px-6">
        <h1 className="text-5xl md:text-7xl font-light mb-6">
          Press &amp; media
        </h1>

        <p className="text-black/75 max-w-2xl mx-auto mb-10 leading-relaxed">
          Journalists, editors and producers are welcome to get in touch about
          My Custom Beats and the personalised music we create.
        </p>
      </section>

      {/* CONTACT */}
      <section className="text-center pb-24">
        <p className="text-black/75 mb-4">
          For press enquiries, please email:
        </p>

        <p className="text-lg font-medium">
          hello@mycustombeats.com
        </p>
      </section>

    </div>
    </>
  );
}