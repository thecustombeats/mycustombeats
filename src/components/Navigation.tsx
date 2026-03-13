import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';

const Navigation = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 80);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Samples', href: '#samples' },
  { label: 'Packages', href: '#packages' },

  { label: 'Order', href: '#order' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];
    
  

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setIsMobileMenuOpen(false);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-[1000] transition-all duration-300 ease-out h-20 flex items-center ${
          isScrolled
            ? 'bg-[rgba(251,249,246,0.85)] backdrop-blur-xl border-b border-[rgba(46,38,35,0.05)]'
            : 'bg-transparent'
        }`}
      >
        <div className="w-full px-6 lg:px-12">
          <div className="flex items-center justify-between">

            {/* Logo + Wordmark */}
            <button
              onClick={scrollToTop}
              className="flex items-center gap-2 transition-opacity hover:opacity-80"
            >
              {/* Logo Image */}
              <div className="py-1.5"></div>
              <img
                src="/logo-dark.png"
                alt="My Custom Beats"
                className="h-16 lg:h-20 w-auto object-contain"
              />

              {/* Wordmark */}
              <div className="hidden sm:flex flex-col items-center text-center leading-tight">
                <span
                  className="text-[13px] font-medium tracking-[0.12em] text-espresso"
                  style={{ fontFamily: 'Arimo, sans-serif' }}
                >
                  MY
                </span>

                <span
                  className="text-[16px] font-semibold tracking-[0.10em] text-espresso"
                  style={{ fontFamily: 'Arimo, sans-serif' }}
                >
                  CUSTOM
                </span>

                <span
                  className="text-[13px] font-medium tracking-[0.12em] text-espresso"
                  style={{ fontFamily: 'Arimo, sans-serif' }}
                >
                  BEATS
                </span>
              </div>
            </button>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center gap-10">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={(e) => {
                  if (link.href.startsWith('#')) {
                  e.preventDefault();
                  scrollToSection(link.href);
                  }
                  }}

                  className="text-base font-medium text-espresso/80 hover:text-espresso transition-colors duration-fast relative group"
                  style={{ fontFamily: 'Arimo, sans-serif' }}
                >
                  {link.label}
                  <span className="absolute -bottom-1 left-0 w-0 h-px bg-gold transition-all duration-fast group-hover:w-full" />
                </a>
              ))}
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 text-espresso"
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
            <a
              key={link.href}
              href={link.href}
              onClick={(e) => {
  if (link.href.startsWith('#')) {
    e.preventDefault();
    scrollToSection(link.href);
  }
}}

              className="font-serif text-3xl text-espresso hover:text-gold transition-colors duration-fast"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </>
  );
};

export default Navigation;