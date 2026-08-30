import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { Link, useLocation } from "react-router-dom";


const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const textColor = isScrolled
  ? 'text-espresso'
  : 'text-[rgba(251,249,246,0.85)]';

/**
 * Logo variant chosen by background, per MVIS.
 *
 *   scrolled    solid ivory bar           -> black mark
 *   unscrolled  transparent over the hero -> gold mark
 *
 * Same approved artwork in both cases; neither file is altered.
 *
 * The two carry different amounts of transparent padding — measured, the gold
 * mark fills 53% of its canvas height and the black one 34% — so rendering
 * both at a single CSS height would make the black mark look markedly
 * smaller. The heights below compensate so the visible mark stays the same
 * size across the scroll transition.
 */
const logoSrc = isScrolled
  ? '/images/brand/MCB-Black-logo.png'
  : '/images/brand/MCB-Logo-Final.png';

const logoSize = isScrolled
  ? 'h-[100px] lg:h-[125px]'
  : 'h-16 lg:h-20';

  const location = useLocation();
 

  useEffect(() => {
  const handleScroll = () => {
    if (location.pathname === "/" || location.pathname === "/partners") {
      setIsScrolled(window.scrollY > 80);
    } else {
      setIsScrolled(true); // always solid on other pages
    }
  };

  handleScroll(); // 👈 IMPORTANT: run once on load

  window.addEventListener("scroll", handleScroll, { passive: true });
  return () => window.removeEventListener("scroll", handleScroll);
}, [location.pathname]);

  const navLinks = [
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Samples', href: '/#samples' },
  { label: 'Packages', href: '/#packages' },
  { label: 'Products', href: '/products' },
  { label: 'Occasions', href: '/occasions' }, // ✅ ADD THIS
  { label: 'Order', href: '/#order' },
  { label: 'Contact', href: '/#contact' },
  { label: 'FAQ', href: '/faq' }, // keep but place last
];
    

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[9999] transition-all duration-300 ease-out h-20 flex items-center ${
          isScrolled
            ? 'bg-[rgba(251,249,246,0.85)] backdrop-blur-xl border-b border-[rgba(46,38,35,0.05)]'
            : 'bg-transparent'
        }`}
      >
        <div className="w-full px-6 lg:px-12">
          <div className="flex items-center justify-between">

            {/* Logo + Wordmark */}
<Link
  to="/"
  onClick={scrollToTop}
  className="flex items-center gap-2 transition-opacity hover:opacity-80"
>
  <div className="py-1.5"></div>

  <img
    src={logoSrc}
    alt="My Custom Beats"
    className={`${logoSize} w-auto object-contain`}
  />

  <div className="hidden sm:flex flex-col items-center text-center leading-tight">
    <span
      className={`text-[13px] font-medium tracking-[0.12em] ${textColor}`}
    >
      MY
    </span>

    <span
      className={`text-[16px] font-medium tracking-[0.12em] ${textColor}`}
    >
      CUSTOM
    </span>

    <span
      className={`text-[13px] font-medium tracking-[0.12em] ${textColor}`}
    >
      BEATS
    </span>
  </div>
</Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-10">
              {navLinks.map((link) => (
                <Link
  key={link.href}
  to={link.href}
  onClick={() => setIsMobileMenuOpen(false)}
  className={`text-base font-medium ${textColor} transition-colors duration-fast relative group`}
>
  {link.label}
  <span className="absolute -bottom-1 left-0 w-0 h-px bg-gold transition-all duration-fast group-hover:w-full" />
</Link>
              ))}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`lg:hidden p-2 ${textColor}`}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>

          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div
        className={`fixed inset-0 z-[999] bg-ivory transition-transform duration-300 ease-out lg:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
<div className="flex flex-col items-center justify-center h-full gap-8">
  {navLinks.map((link) => (
    <Link
      key={link.href}
      to={link.href}
      onClick={() => setIsMobileMenuOpen(false)}
      className={`font-serif text-3xl ${textColor} hover:text-gold transition-colors duration-fast`}
    >
      {link.label}
    </Link>
  ))}
</div>      </div>
    </>
  );
};

export default Navigation;