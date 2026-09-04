import { useEffect, useState, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import FloatingCTA from "./components/FloatingCTA";
import { useLocation } from "react-router-dom";
import Navigation from "./components/Navigation";
import { trackPageView } from "./lib/analytics";
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
import AffiliateDashboard from "./pages/AffiliateDashboard";

import { Helmet } from "react-helmet-async";
import { Package } from "lucide-react";
import { Link } from "react-router-dom";
import { KEEPSAKES } from "./data/keepsakes";
import AudienceSplitSection from "./sections/AudienceSplitSection";
import SeasonalBanner from "./components/SeasonalBanner";
import CdDiscMark from "./components/CdDiscMark";
import KeepsakeMark from "./components/KeepsakeMark";
import { homepageStructuredData, canonical, shareImageFor } from "./lib/seo";
import { scrollToSection } from "./utils/scrollToSection";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import NotFound from "./pages/NotFound";



const AnniversarySong = lazy(() => import("./pages/AnniversarySong"));
const CruiseMemories = lazy(() => import("./pages/CruiseMemories"));
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
  const [, setVisitorType] = useState<string | null>(() => {
    return localStorage.getItem("customBeats_visitorType");
  });
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
    }
  }, []);

  const handleVisitorSelect = (type: string) => {
  setVisitorType(type);
  localStorage.setItem("customBeats_visitorType", type);
  setShowPersonalization(false);
  };

  useEffect(() => {
  // Capture attribution once per arrival, then tell the server.
  //
  // Replaces three Supabase round-trips (resolve username, insert click,
  // increment counter) with one call to MCB's own endpoint, which does all
  // three inside a transaction. The browser sends only the string it saw in
  // the URL; the server resolves who — if anyone — that credits.
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref");
  const partner = params.get("partner");

  // localStorage is the single authoritative attribution store. It survives
  // the journey to the order form and on to Stripe.
  if (ref) localStorage.setItem("referral", ref);
  if (partner) localStorage.setItem("partner", partner);

  if (!ref) return;

  // One click per referral per session, so a refresh cannot inflate a counter.
  if (sessionStorage.getItem(`ref_${ref}`)) return;
  sessionStorage.setItem(`ref_${ref}`, "true");

  // Fire and forget: a click that fails to record must never affect the visit.
  fetch("/api/affiliate/click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref }),
  }).catch(() => {});
}, []);

  return (
    <>
  {/* The homepage's single source of head tags. HeroSection and
      PackagesSection previously each set their own <title>, and whichever
      mounted last won — which is why the homepage was serving the packages
      title. Sections no longer set titles. */}
  <Helmet>
    <title>Personalised Songs on Vinyl, CD & MP3 | My Custom Beats</title>
    <meta
      name="description"
      content="Turn a memory into a personalised song, from £10. Choose vinyl, CD or MP3. Made for cruises, weddings, anniversaries and celebrations."
    />
    <meta property="og:url" content={canonical("/")} />
    <script type="application/ld+json">
      {JSON.stringify(homepageStructuredData())}
    </script>
  </Helmet>

    <div className="relative min-h-screen bg-ivory">
      <div className="grain-overlay" />

      <main className="relative">
       
        <HeroSection />

        {/* Renders only when a seasonal edition is switched on and in
            window. Nothing is active today. */}
        <SeasonalBanner />

        {/* The two commercial paths, immediately after the hero. */}
        <AudienceSplitSection />

<Suspense fallback={<div className="h-40" />}>
  <SongShowcaseSection />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <HowItWorksSection />
</Suspense>

<Suspense fallback={<div className="h-40" />}>
  <TestimonialsSection />
</Suspense>

{/* ---- Make the memory physical ----
    Connects the music experience to the keepsake ecosystem. Rendered from
    the shared keepsake data so it can never drift from /products. ---- */}
<section
  aria-labelledby="make-physical-heading"
  className="py-24 px-6 bg-ivory"
>
  <div className="max-w-6xl mx-auto">
    <div className="text-center max-w-2xl mx-auto mb-16">
      <p className="label-uppercase text-gold-deep mb-4">Beyond the music</p>

      <h2 id="make-physical-heading" className="text-espresso mb-5">
        Make the memory physical
      </h2>

      <p className="text-espresso/65 leading-relaxed">
        A song holds the feeling. A record, a plaque or a framed lyric puts it
        somewhere you'll see it — on a shelf, on a wall, in someone's hands.
      </p>
    </div>

    <ul className="grid grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 list-none m-0 p-0">
      {KEEPSAKES.map((item) => (
        <li key={item.id}>
          <article className="h-full">
            <div className="overflow-hidden rounded-2xl mb-4 bg-white border border-espresso/10">
              {item.image ? (
                <img
                  src={item.image}
                  alt={item.alt ?? item.title}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-[240px] object-cover"
                />
              ) : (
                <div className="w-full h-[240px] flex items-center justify-center bg-ivory p-6">
                  {item.id === "cd" ? (
                    <CdDiscMark className="h-full w-auto" />
                  ) : (
                    <KeepsakeMark name={item.title} />
                  )}
                </div>
              )}
            </div>

            <h3 className="font-serif text-xl text-espresso mb-1">
              {item.title}
            </h3>
            <p className="text-sm text-espresso/60 leading-relaxed">
              {item.description}
            </p>
          </article>
        </li>
      ))}
    </ul>

    <div className="text-center mt-16">
      <Link
        to="/products"
        className="inline-flex items-center gap-2 px-9 py-4 bg-ink text-ivory rounded-full font-medium transition-colors duration-300 hover:bg-gold hover:text-ink"
      >
        <Package className="w-5 h-5" aria-hidden="true" />
        Explore keepsakes
      </Link>

      <p className="mt-4 text-sm text-espresso/50">
        Vinyl and CD are included with your experience. Other keepsakes are
        made to order — enquire for pricing.
      </p>
    </div>
  </div>
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
  const { pathname } = useLocation();
  const share = shareImageFor(pathname);

  return (
    <>
      {/* One canonical and one share image per page, derived from the route.
          Kept here rather than in each page so no route can be missed or
          emit two. Titles and descriptions stay with their pages; crawlers
          fall back to them when og:title is absent. */}
      <Helmet>
        <link rel="canonical" href={canonical(pathname)} />
        <meta property="og:image" content={share.url} />
        <meta property="og:image:alt" content={share.alt} />
        <meta name="twitter:image" content={share.url} />
      </Helmet>
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
    trackPageView(pathname);
  }, [pathname]);

  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }

    // The homepage's sections are lazy-loaded, so #order and #samples are
    // usually absent at this moment. Waiting for the element is what stops
    // the visitor being left at the hero on the first navigation and only
    // arriving on the second. Cancelled on the next route change so a stale
    // target cannot hijack the page the visitor has since moved to.
    return scrollToSection(hash);
  }, [pathname, hash]);

  return null;
}

// 👇 This handles routing
function App() {
  return (
    // A lazy route chunk that fails to load used to unmount the whole tree,
    // leaving a blank page. The boundary catches it and recovers.
    <RouteErrorBoundary>
    <Suspense fallback={<div className="min-h-screen bg-ivory" />}>
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
            <Layout>
              <Suspense fallback={<div className="min-h-screen" />}>
                <AnniversarySong />
              </Suspense>
            </Layout>
          }
        />
        <Route path="/cruise" element={<Layout><CruiseMemories /></Layout>} />
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

        {/* Anything unmatched. Without this, a mistyped address rendered
            nothing and was indistinguishable from a crash. */}
        <Route path="*" element={<Layout><NotFound /></Layout>} />

      </Routes>
    </Suspense>
    </RouteErrorBoundary>
  );
}


export default App;