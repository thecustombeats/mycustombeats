import { useEffect, useState } from "react";
import { scrollToSection } from "../utils/scrollToSection";

const FloatingCTA = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const triggerPoint = window.innerHeight * 0.4;

      setVisible(scrollPosition > triggerPoint);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => scrollToSection("order")}
      className="fixed bottom-6 right-6 z-50 bg-gold text-white px-6 py-3 rounded-full shadow-lg hover:scale-105 transition"
    >
      🎵 Create Your Song
    </button>
  );
};

export default FloatingCTA;