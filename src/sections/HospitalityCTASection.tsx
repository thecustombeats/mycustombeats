import { ArrowRight } from 'lucide-react';

const HospitalityCTASection = () => {
  return (
    <section className="py-24 bg-[#1a1412] relative overflow-hidden">
      {/* Background cinematic overlay */}
      <div className="absolute inset-0 opacity-20">
        <img 
          src="/images/hero-cruise.jpg" 
          alt="Luxury hospitality background" 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black to-transparent" />
      </div>

      <div className="max-w-7xl mx-auto px-6 relative z-10">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-px w-8 bg-gold" />
            <span className="text-gold text-sm tracking-[0.2em] uppercase font-medium">Enterprise & Partnerships</span>
          </div>
          
          <h2 className="text-4xl lg:text-5xl font-serif text-ivory mb-8 leading-tight">
            For Hotels, Resorts & <br />
            <em className="text-gold italic">Cruise Lines</em>
          </h2>
          
          <p className="text-xl text-ivory/70 font-light mb-12 leading-relaxed">
            Discover how My Custom Beats transforms guest memories into unforgettable musical experiences. Elevate your brand with the most personal gift in luxury hospitality.
          </p>

          <a 
            href="/luxury/index.html" 
            className="inline-flex items-center gap-3 bg-gold hover:bg-gold-light text-black px-10 py-5 
            rounded-none transition-all duration-300 group tracking-widest text-sm uppercase font-semibold"
          >
            Explore Hospitality Showcase
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </section>
  );
};

export default HospitalityCTASection;
