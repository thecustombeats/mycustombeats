import { Instagram, Youtube, MessageCircle } from "lucide-react";
import CruiseMarquee from "../components/CruiseMarquee";
import { Link } from "react-router-dom";
import { trackWhatsAppClick, trackEvent } from "../lib/analytics";

const Footer = () => {

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    // Midnight Ink — the one place a large dark field earns its place, per
    // MVIS colour balance. Replaces an off-palette warm-black gradient.
    <footer className="w-full bg-ink text-ivory pt-24 pb-10">
      
<div className="max-w-3xl mx-auto px-6 text-center flex flex-col items-center">

        {/* ===== LOGO ===== */}
        <button
  onClick={scrollToTop}
  className="flex items-center justify-center gap-3 mb-10 mx-auto hover:opacity-80 transition"
>
  {/* Logo */}
  <img
    src="/images/brand/MCB-Logo-Final.png"
    alt="My Custom Beats"
    className="h-16 lg:h-40 w-auto object-contain"
  />

</button>

        {/* ===== TAGLINE ===== */}
        <p className="text-ivory/60 text-sm tracking-wide mb-10 text-center">
          Transform your most meaningful moments into timeless music and keepsakes.
        </p>

        {/* ===== NAVIGATION (SIMPLE ROW) ===== */}
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ivory/70 mb-8">
          <Link to="/products" className="hover:text-gold transition">Products</Link>
          <Link to="/occasions" className="hover:text-gold transition">Occasions</Link>
          <Link to="/artists" className="hover:text-gold transition">Artists</Link>
          <Link to="/partners" className="hover:text-gold transition">Partners</Link>
          <Link to="/about" className="hover:text-gold transition">Our Story</Link>
          <Link to="/faq" className="hover:text-gold transition">FAQ</Link>
          <Link to="/press" className="hover:text-gold transition">Press</Link>
          <Link to="/affiliate" className="hover:text-gold transition">Affiliate</Link>
          <a
            href="/luxury/index.html"
            className="hover:text-gold transition"
          >
            Hospitality Showcase
          </a>
        </div>

        {/* ===== TRUST LINE ===== */}
        <p className="text-ivory/40 text-xs tracking-wide mb-6">
          Crafted by professional artists worldwide • Trusted by private clients, event planners & luxury guests worldwide
        </p>

        {/* ===== SOCIALS ===== */}
        <div className="flex justify-center gap-4 mb-8">
          {[ 
            { 
              icon: MessageCircle, 
              link: "https://wa.me/447340742009?text=Hi%20MyCustomBeats%2C%20I%20clicked%20the%20link%20in%20your%20website%20footer%20and%20would%20like%20to%20learn%20more%20about%20your%20custom%20songs.",
              onClick: () => trackWhatsAppClick("footer")
            },
            { 
              icon: Instagram, 
              link: "https://instagram.com/djrinaldiofficial?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=footer",
              onClick: () => trackEvent("outbound_social_click", { platform: "instagram", location: "footer" })
            },
            { 
              icon: Youtube, 
              link: "https://www.youtube.com/@MyCustomBeats?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=footer",
              onClick: () => trackEvent("outbound_social_click", { platform: "youtube", location: "footer" })
            },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <a
                key={i}
                href={item.link}
                onClick={item.onClick}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-ivory/5 text-ivory/60 
                hover:bg-gold hover:text-espresso transition-all duration-300"
              >
                <Icon size={16} />
              </a>
            );
          })}
        </div>

        {/* ===== LEGAL ===== */}
        <div className="flex justify-center gap-6 text-xs text-ivory/50 mb-6">
          <Link to="/legal/terms" className="hover:text-gold transition">Terms</Link>
          <Link to="/legal/privacy" className="hover:text-gold transition">Privacy</Link>
          <Link to="/legal/refund" className="hover:text-gold transition">Refund</Link>
        </div>

        {/* ===== BOTTOM ===== */}
        <div className="border-t border-ivory/10 pt-6 text-xs text-ivory/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© My Custom Beats. All rights reserved.</p>
          <p>Crafted with <span className="text-gold">♥</span></p>
        </div>

      </div>

      {/* ===== CRUISE & LUXURY TRAVEL — absolute bottom of the footer ===== */}
      <div className="mt-12 px-6">
        <CruiseMarquee />
      </div>
    </footer>
  );
};

export default Footer;