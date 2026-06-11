export default function ArtistThankYou() {

  return (

    <section className="py-32 px-[7vw] text-center max-w-3xl mx-auto">

      <h1 className="text-5xl font-serif text-espresso mb-6">
        Application Received
      </h1>

      <p className="text-lg text-espresso/70 mb-10">
        Thank you for applying to join the MyCustomBeats artist network.
        Our team reviews every submission carefully and will contact you if there
        is a fit for upcoming projects.
      </p>

      <a
        href="/"
        className="px-8 py-3 bg-gold text-espresso rounded-full hover:bg-espresso hover:text-ivory"
      >
        Return to Homepage
      </a>

    </section>

  )
}