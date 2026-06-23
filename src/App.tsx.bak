import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import FloatingCTA from "./components/FloatingCTA";
import { useLocation } from "react-router-dom";
import Navigation from "./components/Navigation";
import PersonalizationModal from "./components/PersonalizationModal";
import HeroSection from "./sections/HeroSection";

import Footer from "./sections/Footer";

const About = lazy(() => import("./pages/About"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Occasions = lazy(() => import("./pages/Occasions"));
const Products = lazy(() => import("./pages/Products"));
const Partners = lazy(() => import("./pages/Partners"));
const Press = lazy(() => import("./pages/Press"));
const Artists = lazy(() => import("./pages/Artists"));

import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import Refund from "./pages/legal/Refund";
import ThankYou from "./pages/ThankYou";
import ArtistApply from "./pages/ArtistApply";
import ArtistThankYou from "./pages/ArtistThankYou"
import PartnerThankYou from "./pages/PartnerThankYou"
import Affiliate from "./pages/Affiliate";
import { supabase } from "./lib/supabaseClient";
import AffiliateDashboard from "./pages/AffiliateDashboard";

import { Helmet } from "react-helmet-async";
import { Package } from "lucide-react";



const AnniversarySong = lazy(() => import("./pages/AnniversarySong"));
const SongShowcaseSection = lazy(() => import("./sections/SongShowcaseSection"));
const HowItWorksSection = lazy(() => import("./sections/HowItWorksSection"));
const TestimonialsSection = lazy(() => import("./sections/TestimonialsSection"));
const PackagesSection = lazy(() => import("./sections/PackagesSection"));
const OrderFormSection = lazy(() => import("./sections/OrderFormSection"));
const ContactSection = lazy(() => import("./sections/ContactSection"));
const HospitalityCTASection = lazy(() => import("./sections/HospitalityCTASection"));




// 👇 This becomes your homepage
function MainSite() {
  const [showPersonalization, setShowPersonalization] = useState(false);
  const [, setVisitorType] = useState<string | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);

  useEffect(() => {
  const seen = sessionStorage.getItem("modalShown");
  const savedType = localStorage.getItem("customBeats_visitorType");

  if (!seen && !savedType) {
    const timer = setTimeout(() => {
      setShowPersonalization(true);
      sessionStorage.setItem("modalShown", "true");
    }, 1500);

    return () => clearTimeout(timer);
  } else if (savedType) {
    setVisitorType(savedType);
  }
}, []);

  const handleVisitorSelect = (type: string) => {
  setVisitorType(type);
  localStorage.setItem("customBeats_visitorType", type);
  setShowPersonalization(false);
  };

  useEffect(() => {
  const trackClick = async () => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");

    if (!ref) return;

    // prevent duplicate tracking (same user refresh)
    const alreadyTracked = sessionStorage.getItem(`ref_${ref}`);
    if (alreadyTracked) return;

    // find affiliate
    const { data: affiliate } = await supabase
      .from("affiliates")
      .select("id")
      .eq("username", ref)
      .single();

    if (!affiliate) return;

    // insert click record
    await supabase.from("clicks").insert([
      {
        affiliate_id: affiliate.id,
        username: ref,
        user_agent: navigator.userAgent,
      },
    ]);

    // increment total clicks
    await supabase.rpc("increment_clicks", {
      user_id: affiliate.id,
    });

    // mark as tracked (avoid duplicates)
    sessionStorage.setItem(`ref_${ref}`, "true");
  };

  trackClick();
}, []);

useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");

  if (ref) {
    localStorage.setItem("referral", ref);
  }
}, []);

  return (
    <>
  <Helmet>
    <title>Custom Songs for Weddings, Birthdays & Gifts | My Custom Beats</title>
    <meta
      name="description"
      content="Create personalised songs for weddings, birthdays, anniversaries and luxury gifts. Turn your story into music."
    />
  </Helmet>

    <div className="relative min-h-screen bg-ivory">
      <div className="grain-overlay" />

      <main className="relative">
       
        <HeroSection />

<Suspense fallback={<div className="h-40" />}>
  <SongShowcaseSection />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <HowItWorksSection />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <TestimonialsSection />
</Suspense>

{/* ✅ ADD THIS PRODUCTS TEASER HERE */}
<section className="py-20 px-6 bg-[#FBF9F6] text-center">
  <h2 className="text-4xl md:text-5xl font-light mb-6">
    More Than Just a Song
  </h2>

  <p className="text-black/60 max-w-2xl mx-auto mb-12">
    Turn your music into something you can hold, display, and relive forever.
  </p>

  {/* TOP ROW */}
<div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-8">
  {[
    { title: "Vinyl", img: "/images/products/vinyl.jpg" },
    { title: "Artwork", img: "/images/products/artwork.jpg" },
    { title: "Plaques", img: "/images/products/plaque.jpg" },
  ].map((item, i) => (
    <div key={i} className="group cursor-pointer">
      <div className="overflow-hidden rounded-xl mb-4">
        <img
          src={item.img}
          alt={item.title}
          className="w-full h-[250px] object-cover group-hover:scale-105 transition duration-500"
        />
      </div>
      <h3 className="text-lg">{item.title}</h3>
    </div>
  ))}
</div>

{/* BOTTOM ROW (CENTERED) */}
<div className="flex justify-center gap-8 max-w-4xl mx-auto">
  {[
    { title: "Memory Boxes", img: "/images/products/memory-box.jpg" },
    { title: "Music Cards", img: "/images/products/cards.jpg" },
  ].map((item, i) => (
    <div key={i} className="group cursor-pointer w-full max-w-[300px]">
      <div className="overflow-hidden rounded-xl mb-4">
        <img
          src={item.img}
          alt={item.title}
          className="w-full h-[250px] object-cover group-hover:scale-105 transition duration-500"
        />
      </div>
      <h3 className="text-lg">{item.title}</h3>
    </div>
  ))}
</div>

<a
  href="/products"
  className="group mt-16 md:mt-20 px-10 py-4 bg-gold text-espresso rounded-full font-medium 
  transition-all duration-300 hover:bg-espresso hover:text-ivory hover:scale-105 shadow-md hover:shadow-xl inline-flex items-center gap-2"
>
  <Package className="w-5 h-5" />
  Explore Keepsakes →
</a>

  <p className="mt-4 text-sm text-black/60 italic">
    Each piece is custom made — enquire for pricing
  </p>

</section>


<Suspense fallback={<div className="h-40" />}>
  <PackagesSection 
    selectedPackage={selectedPackage}
    setSelectedPackage={setSelectedPackage}
  />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <OrderFormSection selectedPackage={selectedPackage} />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <HospitalityCTASection />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <ContactSection />
</Suspense>

        <FloatingCTA />
      </main>
      </div>

      {/* ✅ THIS IS THE FIX — MODAL GOES HERE */}
      <PersonalizationModal
        isOpen={showPersonalization}
        onClose={() => setShowPersonalization(false)}
        onSelect={handleVisitorSelect}
      />
</>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navigation />
      {children}
      <FloatingCTA />
      <Footer />
    </>
  );
}

function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const element = document.querySelector(hash);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [pathname, hash]);

  return null;
}

// 👇 This handles routing
function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ScrollToTop />
      <Routes>

        {/* Home */}
        <Route
          path="/"
          element={
            <Layout>
              <MainSite />
            </Layout>
          }
        />

        <Route 
          path="/products" 
          element={
            <Layout>
              <Products />
            </Layout>
          } 
        />

        {/* Pages */}
        <Route path="/artists" element={<Layout><Artists /></Layout>} />
        <Route path="/partners" element={<Layout><Partners /></Layout>} />
        <Route path="/press" element={<Layout><Press /></Layout>} />
        
         <Route 
  path="/affiliate" 
  element={
    <Layout>
      <Affiliate />
    </Layout>
  } 
/>
     <Route path="/dashboard" element={<AffiliateDashboard />} />
         
        {/* ✅ FIXED OCCASIONS */}
        <Route 
          path="/occasions" 
          element={
            <Layout>
              <Occasions />
            </Layout>
          } 
        />
        
        <Route 
  path="/anniversary-song" 
  element={
    <Suspense fallback={<div />}>
      <AnniversarySong />
    </Suspense>
  } 
/>
        <Route path="/about" element={<Layout><About /></Layout>} />
        <Route path="/faq" element={<Layout><FAQ /></Layout>} />

        {/* Legal */}
        <Route path="/legal/terms" element={<Layout><Terms /></Layout>} />
        <Route path="/legal/privacy" element={<Layout><Privacy /></Layout>} />
        <Route path="/legal/refund" element={<Layout><Refund /></Layout>} />

        {/* Forms */}
        <Route path="/artists/apply" element={<Layout><ArtistApply /></Layout>} />

        {/* Thank You */}
        <Route path="/thank-you" element={<Layout><ThankYou /></Layout>} />
        <Route path="/artist-thank-you" element={<Layout><ArtistThankYou /></Layout>} />
        <Route path="/partner-thank-you" element={<Layout><PartnerThankYou /></Layout>} />


      </Routes>
    </Suspense>
  );
}


export default App;