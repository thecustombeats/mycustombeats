import { Instagram, Youtube, Facebook, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="w-full bg-espresso pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-[7vw]">

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 
                gap-y-14 lg:gap-y-0 
                gap-x-8 lg:gap-x-12">


          {/* ===== BRAND ===== */}
          <div className="space-y-6">
            <button
              onClick={scrollToTop}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <img
                src="/logo-light.png"
                alt="My Custom Beats"
                className="h-14 w-auto"
              />

              <div className="hidden sm:flex flex-col leading-tight">
                <span className="text-[12px] tracking-[0.12em] text-gold">
                  MY
                </span>
                <span className="text-[16px] font-semibold tracking-[0.10em] text-gold">
                  CUSTOM
                </span>
                <span className="text-[12px] tracking-[0.12em] text-gold">
                  BEATS
                </span>
              </div>
            </button>

            <p className="text-ivory/60 text-sm leading-relaxed max-w-xs">
              Your journey deserves more than photos. We transform your memories into music you can relive forever.
            </p>

            <div className="flex items-center gap-3">
              <a
                href="https://wa.me/447340742009"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-ivory/5 flex items-center justify-center text-ivory/60 hover:bg-gold hover:text-espresso transition-all duration-300"
              >
                <MessageCircle size={16} />
              </a>

              <a
                href="https://instagram.com/djrinaldiofficial"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-ivory/5 flex items-center justify-center text-ivory/60 hover:bg-gold hover:text-espresso transition-all duration-300"
              >
                <Instagram size={16} />
              </a>

              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-ivory/5 flex items-center justify-center text-ivory/60 hover:bg-gold hover:text-espresso transition-all duration-300"
              >
                <Facebook size={16} />
              </a>

              <a
                href="https://youtube.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-ivory/5 flex items-center justify-center text-ivory/60 hover:bg-gold hover:text-espresso transition-all duration-300"
              >
                <Youtube size={16} />
              </a>
            </div>
          </div>

          {/* ===== QUICK LINKS ===== */}
          <div>
            <h4 className="text-gold uppercase text-xs tracking-widest mb-6">
              Quick Links
            </h4>
            <ul className="space-y-4 text-sm text-ivory/60">
              <li><button onClick={() => scrollToSection("#how-it-works")} className="hover:text-ivory transition-colors">How it Works</button></li>
              <li><button onClick={() => scrollToSection("#samples")} className="hover:text-ivory transition-colors">Samples</button></li>
              <li><button onClick={() => scrollToSection("#packages")} className="hover:text-ivory transition-colors">Packages</button></li>
              <li><button onClick={() => scrollToSection("#order")} className="hover:text-ivory transition-colors">Order</button></li>
            </ul>
          </div>

          {/* ===== COMPANY ===== */}
          <div>
            <h4 className="text-gold uppercase text-xs tracking-widest mb-6">
              Company
            </h4>
            <ul className="space-y-4 text-sm text-ivory/60">
              <li><button onClick={() => scrollToSection("#about")} className="hover:text-ivory transition-colors">About Us</button></li>
              <li><button onClick={() => scrollToSection("#faq")} className="hover:text-ivory transition-colors">FAQ</button></li>
              <li><button onClick={() => scrollToSection("#contact")} className="hover:text-ivory transition-colors">Contact</button></li>
            </ul>
          </div>

          {/* ===== LEGAL ===== */}
          <div>
            <h4 className="text-gold uppercase text-xs tracking-widest mb-6">
              Legal
            </h4>
            <ul className="space-y-4 text-sm text-ivory/60">
              <li>
                <Link to="/legal/terms" className="hover:text-ivory transition-colors">
                  Terms & Conditions
                </Link>
              </li>
              <li>
                <Link to="/legal/privacy" className="hover:text-ivory transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/legal/refund" className="hover:text-ivory transition-colors">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>

        </div>

        {/* ===== BOTTOM BAR ===== */}
        <div className="mt-16 pt-8 border-t border-ivory/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-ivory/40 text-sm">
            © My Custom Beats. All rights reserved.
          </p>
          <p className="text-ivory/40 text-sm">
            Crafted with <span className="text-gold">♥</span> for your journey
          </p>
        </div>

      </div>
    </footer>
  );
};

export default Footer;