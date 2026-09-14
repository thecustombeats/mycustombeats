import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { trackWhatsAppClick } from "../lib/analytics";

/**
 * WhatsApp shortcut, shown once the visitor has scrolled past the first
 * screen.
 *
 * Never on the guided flow (/create) or the affiliate dashboard, where it
 * would sit over form controls and sticky actions. On phones it is a compact
 * 56px icon button in the corner, clear of the safe area, so it does not
 * cover reading content; the footer reserves space beneath its last line.
 */
const HIDDEN_ON = ["/create", "/dashboard"];

const FloatingCTA = () => {
  const [visible, setVisible] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > window.innerHeight * 0.8);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible || HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  let message = "Hi, I would like to create a personalised song.";
  if (pathname === "/products") message = "Hi, I am interested in your personalised keepsakes. Could you help me choose?";
  if (pathname === "/occasions") message = "Hi, I would like a personalised song for a special occasion.";

  const whatsappLink = `https://wa.me/447340742009?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappLink}
      onClick={() => trackWhatsAppClick("floating_cta")}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with MCB on WhatsApp (opens in a new tab)"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-40 flex h-14 w-14 items-center justify-center gap-2 rounded-full border border-ink/10 bg-ivory text-ink shadow-[0_10px_30px_rgba(13,27,42,0.18)] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 sm:bottom-6 sm:right-6 sm:h-auto sm:w-auto sm:min-h-12 sm:px-5"
    >
      <MessageCircle className="h-6 w-6 shrink-0 sm:h-5 sm:w-5" aria-hidden="true" />
      <span className="hidden text-base font-semibold sm:inline">WhatsApp us</span>
    </a>
  );
};

export default FloatingCTA;
