import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useLocation } from "react-router-dom";

const FloatingCTA = () => {
  const [visible, setVisible] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const triggerPoint = window.innerHeight * 0.5;
      setVisible(scrollPosition > triggerPoint);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  // ✅ Dynamic WhatsApp message based on page
  let message = "Hi I would like to create a custom song";

  if (location.pathname === "/products") {
    message =
      "Hi I am interested in your keepsake products (Vinyl/Artwork/etc). Can you share pricing?";
  }

  if (location.pathname === "/occasions") {
    message =
      "Hi I want a custom song for a special occasion (birthday, wedding, etc)";
  }

  const whatsappLink = `https://wa.me/447340742009?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappLink}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 
      bg-gold text-espresso px-6 py-3 rounded-full shadow-lg 
      hover:scale-105 transition-all duration-300"
    >
      <MessageCircle className="w-5 h-5" />
      Chat on WhatsApp
    </a>
  );
};

export default FloatingCTA;