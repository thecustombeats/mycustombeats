import { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import FloatingCTA from "./components/FloatingCTA";
import Navigation from "./components/Navigation";
import { trackPageView } from "./lib/analytics";
import {
  REFERRAL_PARAM,
  REFERRAL_STORAGE_KEY,
  isReferralCode,
  readStoredReferral,
  shouldReplaceStoredReferral,
} from "./data/referral";
import HeroSection from "./sections/HeroSection";
import MemoryPromise from "./sections/home/MemoryPromise";
import PackagesSection from "./sections/PackagesSection";
import SeasonalBanner from "./components/SeasonalBanner";

import Footer from "./sections/Footer";

const About = lazy(() => import("./pages/About"));
const FAQ = lazy(() => import("./pages/FAQ"));
const Occasions = lazy(() => import("./pages/Occasions"));
const Products = lazy(() => import("./pages/Products"));
const Partners = lazy(() => import("./pages/Partners"));
const Press = lazy(() => import("./pages/Press"));
const MCBLive = lazy(() => import("./pages/MCBLive"));
const PriorityReplacement = lazy(() => import("./pages/PriorityReplacement"));
const Artists = lazy(() => import("./pages/Artists"));
const CreateMemory = lazy(() => import("./pages/CreateMemory"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogPost = lazy(() => import("./pages/BlogPost"));
const YourOrder = lazy(() => import("./pages/YourOrder"));
const Approve = lazy(() => import("./pages/Approve"));
const Operations = lazy(() => import("./pages/Operations"));
const CommandCentre = lazy(() => import("./pages/CommandCentre"));
const CustomerCare = lazy(() => import("./pages/CustomerCare"));

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
import {
  HOMEPAGE_DESCRIPTION,
  HOMEPAGE_TITLE,
  homepageStructuredData,
  canonical,
  shareImageFor,
} from "./lib/seo";
import { scrollToSection } from "./utils/scrollToSection";
import RouteErrorBoundary from "./components/RouteErrorBoundary";
import NoIndex from "./components/NoIndex";
import ConsentBanner from "./components/ConsentBanner";
import NotFound from "./pages/NotFound";

const AnniversarySong = lazy(() => import("./pages/AnniversarySong"));
const CruiseMemories = lazy(() => import("./pages/CruiseMemories"));
const Bespoke = lazy(() => import("./pages/Bespoke"));
const ProductPage = lazy(() => import("./pages/ProductPage"));

/* Homepage sections below the first two screens load as their own chunks. */
const EveryMemoryKeepsakes = lazy(() => import("./sections/home/EveryMemoryKeepsakes"));
const HowItWorksSection = lazy(() => import("./sections/HowItWorksSection"));
const SongShowcaseSection = lazy(() => import("./sections/SongShowcaseSection"));
const HelpMeChoose = lazy(() => import("./sections/home/HelpMeChoose"));
const CruiseSpecialism = lazy(() => import("./sections/home/CruiseSpecialism"));
const CuratedAdditions = lazy(() => import("./sections/home/CuratedAdditions"));
const TrustEvidence = lazy(() => import("./sections/home/TrustEvidence"));
const FounderNote = lazy(() => import("./sections/home/FounderNote"));
const ContactSection = lazy(() => import("./sections/ContactSection"));

/**
 * Old homepage order links — `/?product=…`, `/?sku=…` and `/#order` — from
 * emails, product pages and bookmarks. The order form now lives at /create,
 * so these are forwarded there with their query string intact (product, sku
 * and any attribution parameters).
 */
const legacyCreateTarget = (search: string, hash: string): string | null => {
  const params = new URLSearchParams(search);
  if (!params.has("product") && !params.has("sku") && hash !== "#order") return null;
  return `/create${search}`;
};

// 👇 This becomes your homepage
function MainSite() {
  const location = useLocation();
  const navigate = useNavigate();
  const legacyTarget = legacyCreateTarget(location.search, location.hash);

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

  /**
   * ---- A CUSTOMER'S SHARE, WHICH IS NOT AN AFFILIATE LINK --------------
   *
   * Read from `?r=`, deliberately NOT `?ref=`. That parameter belongs to the
   * affiliate programme: whatever appears in it is posted to
   * /api/affiliate/click and resolved against `affiliates.username`. Putting
   * customer codes there would send every personal share to the affiliate
   * endpoint, and a customer code that happened to match an affiliate's
   * username would credit a real commission to the wrong party.
   *
   * FIRST TOUCH WINS, for 30 days. Two friends may both send a link; the one
   * whose link actually brought the visitor is the one who prompted the
   * visit, and letting a later arrival overwrite it would hand the credit to
   * whoever the customer happened to click most recently — including MCB's
   * own re-marketing of the same page. Once the window lapses the slate
   * clears, so a link from January cannot claim a purchase in November.
   *
   * No click is recorded. The affiliate ledger exists to compute commission;
   * a personal recommendation pays nobody, and counting visits to it would be
   * building an analytics product nobody asked for out of customers' friends.
   */
  const sharedCode = params.get(REFERRAL_PARAM);
  if (sharedCode && isReferralCode(sharedCode)) {
    try {
      const now = Date.now();
      const existing = readStoredReferral(
        localStorage.getItem(REFERRAL_STORAGE_KEY),
        now
      );
      if (shouldReplaceStoredReferral(existing, now)) {
        localStorage.setItem(
          REFERRAL_STORAGE_KEY,
          // The public code and a timestamp. Nothing about who sent it —
          // there is nothing else to store, and the code itself means
          // nothing without the database.
          JSON.stringify({ code: sharedCode, seenAt: now })
        );
      }
    } catch {
      // Private browsing, or storage disabled. Attribution is a nicety; the
      // visit must not fail because it could not be recorded.
    }
  }

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

  // Runs after attribution above has been captured, so nothing is lost.
  useEffect(() => {
    if (legacyTarget) navigate(legacyTarget, { replace: true });
  }, [legacyTarget, navigate]);

  if (legacyTarget) return <div className="min-h-screen bg-ivory" />;

  return (
    <>
      {/* The homepage's single source of head tags. Sections never set their
          own <title>. */}
      <Helmet>
        <title>{HOMEPAGE_TITLE}</title>
        <meta name="description" content={HOMEPAGE_DESCRIPTION} />
        <script type="application/ld+json">
          {JSON.stringify(homepageStructuredData())}
        </script>
      </Helmet>

      <div id="home" className="relative bg-ivory">
        <HeroSection />

        {/* Renders only when a seasonal edition is switched on and in window. */}
        <SeasonalBanner />

        <MemoryPromise />
        <PackagesSection />

        <Suspense fallback={<div className="min-h-[100vh] bg-ivory" />}>
          <EveryMemoryKeepsakes />
          <HowItWorksSection />
          <SongShowcaseSection />
          <HelpMeChoose />
          <CruiseSpecialism />
          <CuratedAdditions />
          {/* Trust before the founders speak: the customers' own words (when
              their permission is recorded) and the ships their guests sailed. */}
          <TrustEvidence />
          <FounderNote />
          <ContactSection />
        </Suspense>
      </div>
    </>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  const { pathname: rawPathname } = useLocation();
  // One canonical per page: "/bespoke/" is "/bespoke" (the server 301s too).
  const pathname = rawPathname.length > 1 ? rawPathname.replace(/\/+$/, "") || "/" : rawPathname;
  const share = shareImageFor(pathname);

  return (
    <>
      {/* Everything derived from the ROUTE lives here — one canonical, one
          og:url, one share image per page. Kept in Layout rather than in each
          page so no route can be missed or emit two.

          og:url moved here this sprint. Four pages set it themselves and the
          rest inherited the static homepage value from index.html, so most of
          the site told crawlers every page lived at the site root. It is a
          pure function of the path, exactly like the canonical beside it, so
          no page has any business restating it.

          Titles and descriptions stay with their pages; crawlers fall back to
          them when og:title and og:description are absent. */}
      <Helmet>
        <link rel="canonical" href={canonical(pathname)} />
        <meta property="og:url" content={canonical(pathname)} />
        <meta property="og:image" content={share.url} />
        <meta property="og:image:alt" content={share.alt} />
        <meta name="twitter:image" content={share.url} />
      </Helmet>
      <Navigation />
      {/* The one main landmark for every page in the layout; pages render
          their content inside it. The skip link focuses it. */}
      <main id="main-content">{children}</main>
      <FloatingCTA />
      <Footer />
      <ConsentBanner />
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

function FullPackageRedirect() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: "/bespoke", search, hash }} replace />;
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

        <Route path="/mcb-live" element={<Layout><MCBLive /></Layout>} />
        <Route path="/priority-replacement" element={<Layout><PriorityReplacement /></Layout>} />
        {/* Pages */}
        {/* WITHDRAWN FROM THE PUBLIC LAUNCH (see docs/CODE-CLOSURE-20260916.md).
            The routes stay so an existing link still opens the page, but they
            are unlinked, out of the sitemap and noindexed. /artists exists only
            to send people to /artists/apply, whose form posts to a third-party
            URL that stores nothing on MCB's side and cannot be verified. */}
        <Route path="/artists" element={<Layout><NoIndex /><Artists /></Layout>} />
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
     <Route path="/dashboard" element={<><NoIndex title="Affiliate dashboard | My Custom Beats" /><AffiliateDashboard /></>} />
         
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
        {/* The guided order and personalisation flow. Deep links:
            /create?product=<productId> or /create?sku=<sku>. */}
        <Route path="/create" element={<Layout><CreateMemory /></Layout>} />
        {/* Song experiences — one catalogue-driven page component. */}
        <Route path="/moment" element={<Layout><ProductPage productId="moment" /></Layout>} />
        <Route path="/keepsake" element={<Layout><ProductPage productId="keepsake" /></Layout>} />
        <Route path="/journey" element={<Layout><ProductPage productId="journey" /></Layout>} />
        {/* Bespoke. Its own route rather than a section of the homepage: it
            is an enquiry journey, not a card, and a customer needs to be able
            to be sent a link to it. */}
        <Route path="/bespoke" element={<Layout><Bespoke /></Layout>} />
        {/* Retired address ("The Full Package"). public/.htaccess answers it
            with a 301; this covers client-side navigation and any host that
            ignores that file. The query string is kept for attribution. */}
        <Route path="/full-package" element={<FullPackageRedirect />} />
        {/* Contact lives on the homepage; /contact is the address people type. */}
        <Route path="/contact" element={<Navigate to={{ pathname: "/", hash: "#contact" }} replace />} />
        <Route path="/about" element={<Layout><About /></Layout>} />
        <Route path="/faq" element={<Layout><FAQ /></Layout>} />

        {/* Legal */}
        <Route path="/legal/terms" element={<Layout><Terms /></Layout>} />
        <Route path="/legal/privacy" element={<Layout><Privacy /></Layout>} />
        <Route path="/legal/refund" element={<Layout><Refund /></Layout>} />

        {/* Forms */}
        <Route path="/artists/apply" element={<Layout><NoIndex /><ArtistApply /></Layout>} />

        {/* Thank You */}
        <Route path="/thank-you" element={<Layout><ThankYou /></Layout>} />
        <Route path="/blog" element={<Layout><Blog /></Layout>} />
        <Route path="/blog/:slug" element={<Layout><BlogPost /></Layout>} />
        {/* Private customer links: the token is in the URL fragment. */}
        <Route path="/your-order" element={<Layout><YourOrder /></Layout>} />
        <Route path="/approve" element={<Layout><Approve /></Layout>} />
        {/* Staff console, CRM key required by every request it makes. */}
        <Route path="/operations" element={<Operations />} />
        <Route path="/operations/customer-care" element={<CustomerCare />} />
        {/* Founder Command Centre: staff/founder only, CRM key required, no analytics. */}
        <Route path="/command-centre" element={<CommandCentre />} />
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
