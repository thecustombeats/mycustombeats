import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import FloatingCTA from "./components/FloatingCTA";

import Navigation from "./components/Navigation";
import PersonalizationModal from "./components/PersonalizationModal";

import HeroSection from "./sections/HeroSection";
import GiftExperienceSection from "./sections/GiftExperienceSection";
import MemoryMapSection from "./sections/MemoryMapSection";
import TripToLyricsSection from "./sections/TripToLyricsSection";
import HowItWorksSection from "./sections/HowItWorksSection";
import SongShowcaseSection from "./sections/SongShowcaseSection";
import TestimonialsSection from "./sections/TestimonialsSection";
import PackagesSection from "./sections/PackagesSection";
import OrderFormSection from "./sections/OrderFormSection";
import AboutSection from "./sections/AboutSection";
import FAQSection from "./sections/FAQSection";
import ContactSection from "./sections/ContactSection";
import Footer from "./sections/Footer";

import Occasions from "./pages/Occasions";
import Artists from "./pages/Artists";
import Partners from "./pages/Partners";
import Press from "./pages/Press";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refund from "./pages/legal/Refund";
import ThankYou from "./pages/ThankYou";

// 👇 This becomes your homepage
function MainSite() {
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [, setVisitorType] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  useEffect(() => {
    const savedType = localStorage.getItem("customBeats_visitorType");
    if (!savedType) {
      const timer = setTimeout(() => {
        setShowPersonalization(true);
      }, 1500);
      return () => clearTimeout(timer);
    } else {
      setVisitorType(savedType);
    }
  }, []);

  const handleVisitorSelect = (type: string) => {
    setVisitorType(type);
    localStorage.setItem("customBeats_visitorType", type);
    setShowPersonalization(false);
  };

  return (
    <div className="relative min-h-screen bg-ivory">
      <div className="grain-overlay" />

      <Navigation />

      <main className="relative">
        <HeroSection />

<SongShowcaseSection />
<TripToLyricsSection />
<GiftExperienceSection />
<MemoryMapSection />
<HowItWorksSection />
<TestimonialsSection />
<PackagesSection 
  selectedPackage={selectedPackage}
  setSelectedPackage={setSelectedPackage}
/>
        <OrderFormSection selectedPackage={selectedPackage} />
        <AboutSection />
        <FAQSection />
        <ContactSection />
        <FloatingCTA />
        <Footer />
      </main>


      <PersonalizationModal
        isOpen={showPersonalization}
        onClose={() => setShowPersonalization(false)}
        onSelect={handleVisitorSelect}
      />
    </div>
  );
}


// 👇 This handles routing
function App() {
  return (
    <Routes>
      <Route path="/" element={<MainSite />} />
      <Route path="/legal/terms" element={<Terms />} />
      <Route path="/legal/privacy" element={<Privacy />} />
      <Route path="/legal/refund" element={<Refund />} />
      <Route path="/thank-you" element={<ThankYou />} />
     
     <Route
 path="/artists"
 element={
   <>
     <Navigation />
     <Artists />
     <Footer />
   </>
 }
/>

<Route
 path="/partners"
 element={
   <>
     <Navigation />
     <Partners />
     <Footer />
   </>
 }
/>

<Route
 path="/press"
 element={
   <>
     <Navigation />
     <Press />
     <Footer />
   </>
 }
/>

<Route
 path="/occasions"
 element={
   <>
     <Navigation />
     <Occasions />
     <Footer />
   </>
 }
/>
    </Routes>
  );
}

export default App;