import { useState, useRef } from "react";
import { trackFormSubmit } from "../lib/analytics";
import { Helmet } from "react-helmet-async";

// ─── Inline SVG Icons ───────────────────────────────────────────────────────
const IconCruise = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path d="M4 18l3-8h14l3 8H4z" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M10 10V7l4-3 4 3v3" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M2 22h24" stroke="#B8965A" strokeWidth="1.4"/>
  </svg>
);
const IconWedding = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="10" r="4" stroke="#B8965A" strokeWidth="1.4"/>
    <path d="M6 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M11 7l3-3 3 3" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
  </svg>
);
const IconHotel = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="8" width="20" height="16" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M4 8l10-5 10 5" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <rect x="11" y="18" width="6" height="6" stroke="#B8965A" strokeWidth="1.2" fill="none"/>
    <rect x="7" y="12" width="3" height="3" stroke="#B8965A" strokeWidth="1" fill="none"/>
    <rect x="18" y="12" width="3" height="3" stroke="#B8965A" strokeWidth="1" fill="none"/>
  </svg>
);
const IconTravel = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <circle cx="14" cy="14" r="10" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M14 4c-3 3-5 6-5 10s2 7 5 10" stroke="#B8965A" strokeWidth="1.2" fill="none"/>
    <path d="M14 4c3 3 5 6 5 10s-2 7-5 10" stroke="#B8965A" strokeWidth="1.2" fill="none"/>
    <path d="M4 14h20" stroke="#B8965A" strokeWidth="1.2"/>
  </svg>
);
const IconYacht = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <path d="M14 4v14" stroke="#B8965A" strokeWidth="1.4"/>
    <path d="M14 6l8 10H14" stroke="#B8965A" strokeWidth="1.2" fill="none"/>
    <path d="M6 18h16l-2 4H8l-2-4z" stroke="#B8965A" strokeWidth="1.2" fill="none"/>
  </svg>
);
const IconEvent = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
    <rect x="4" y="6" width="20" height="18" rx="1" stroke="#B8965A" strokeWidth="1.4" fill="none"/>
    <path d="M4 12h20" stroke="#B8965A" strokeWidth="1.2"/>
    <path d="M9 4v4M19 4v4" stroke="#B8965A" strokeWidth="1.4"/>
    <path d="M9 17l2 2 4-4" stroke="#B8965A" strokeWidth="1.4"/>
  </svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
    <path d="M3 8l3.5 3.5L13 5" stroke="#B8965A" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
);
const ArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ─── Image Placeholder Component ────────────────────────────────────────────
interface ImgPlaceholderProps {
  src?: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
  overlay?: string;
}

const ImgPlaceholder: React.FC<ImgPlaceholderProps> = ({ src, alt, style, className, overlay }) => (
  <div
    className={className}
    style={{
      background: src ? undefined : "linear-gradient(135deg, #c9b99a 0%, #e8ddd0 40%, #b5956c 100%)",
      position: "relative",
      overflow: "hidden",
      ...style,
    }}
  >
    {src && (
      <img src={src} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    )}
    {overlay && (
      <div style={{
        position: "absolute", inset: 0,
        background: overlay,
      }} />
    )}
    {!src && (
      <div style={{
        position: "absolute", inset: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "rgba(255,255,255,0.35)", fontSize: "11px", letterSpacing: "0.15em",
        textTransform: "uppercase", fontFamily: "Georgia, serif",
      }}>
        {alt}
      </div>
    )}
  </div>
);

// ─── Main Component ──────────────────────────────────────────────────────────
export default function PartnersPage() {
  const formRef = useRef<HTMLDivElement>(null);
  const experiencesRef = useRef<HTMLDivElement>(null);
  const [formData, setFormData] = useState<{
    fullName: string;
    companyName: string;
    jobTitle: string;
    businessEmail: string;
    phone: string;
    website: string;
    industryType: string;
    partnershipInterest: string;
    estimatedVolume: string;
    regions: string;
    goals: string[];
    message: string;
  }>({
    fullName: "", companyName: "", jobTitle: "", businessEmail: "",
    phone: "", website: "", industryType: "", partnershipInterest: "",
    estimatedVolume: "", regions: "", goals: [], message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleGoalToggle = (goal: string) => {
    setFormData(prev => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter(g => g !== goal)
        : [...prev.goals, goal],
    }));
  };


  const handleSubmit = async () => {
    if (!formData.fullName || !formData.businessEmail) {
      alert("Please fill in the mandatory fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("https://formspree.io/f/mdajgzwp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          _subject: `New Partnership Inquiry from ${formData.fullName} (${formData.companyName})`,
        }),
      });

      if (response.ok) {
        trackFormSubmit("partner_application");
        setSubmitted(true);
      } else {
        alert("There was an error submitting the form. Please try again.");
      }
    } catch (error) {
      console.error("Submission error:", error);
      alert("Something went wrong. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const partners = [
    { icon: <IconCruise />, label: "Cruise Lines", desc: "Elevate every voyage with personalized onboard musical experiences crafted for each guest's journey.", src: "/images/hero-cruise-couple.jpg" },
    { icon: <IconWedding />, label: "Wedding Planners", desc: "Give every couple a bespoke soundtrack — a musical memory as unique as their love story.", src: "/images/moments/wedding.jpg" },
    { icon: <IconHotel />, label: "Luxury Hotels", desc: "Delight guests with curated musical experiences tailored to their stay, milestones, and moments.", src: "/images/hero-champagne.jpg" },
    { icon: <IconTravel />, label: "Travel Agencies", desc: "Elevate travel with personalized musical storytelling that turns every trip into a lifelong memory.", src: "/images/occasions/travel.jpg" },
    { icon: <IconYacht />, label: "Yacht Charters", desc: "Craft high-touch, intimate musical experiences for discerning guests at sea.", src: "/images/order-yacht-deck.jpg" },
    { icon: <IconEvent />, label: "Event Companies", desc: "Make every occasion extraordinary with songs and emotional stories personalized for each guest.", src: "/images/occasions/corporate.jpg" },
  ];

  const targetPartners = [
    {
      icon: <IconCruise />, title: "Cruise Companies",
      items: ["Guest entertainment", "Welcome experiences", "Anniversary celebrations onboard", "Birthday surprises", "Proposal packages", "VIP guest engagement", "Loyalty experiences", "Pre-cruise excitement campaigns", "Post-cruise memory retention"],
    },
    {
      icon: <IconHotel />, title: "Hospitality Groups",
      items: ["Hotels & Resorts", "Luxury stays", "Honeymoon packages", "Concierge services"],
    },
    {
      icon: <IconTravel />, title: "Corporate & Enterprise",
      items: ["Employee engagement", "Team recognition", "Client gifting", "Event experiences", "Brand activations"],
    },
    {
      icon: <IconYacht />, title: "Travel & Tourism",
      items: ["Tour operators", "Destination experiences", "Luxury travel agencies"],
    },
    {
      icon: <IconEvent />, title: "Wedding & Event Companies",
      items: ["Personalized event music", "Guest emotional experiences", "High-end celebrations"],
    },
  ];

  const steps = [
    { num: "01", title: "Guest Stories & Preferences", desc: "We gather the guest's memories, milestones, relationships, and emotional moments." },
    { num: "02", title: "Bespoke Creative Brief", desc: "Our concierge team crafts a deeply personal creative vision around the guest's story." },
    { num: "03", title: "Artisan Production", desc: "Skilled creators bring the story to life as a beautifully crafted, original musical experience." },
    { num: "04", title: "Seamless Delivery", desc: "Delivered elegantly through cruise apps, concierge teams, guest portals, and onboard touchpoints." },
  ];

  const experiences = [
    { title: "Surprise Anniversary Song", story: "A couple celebrates 20 years with a song written just for them — delivered on their cruise.", src: "/images/sample-anniversary.jpg" },
    { title: "Honeymoon Soundtrack", story: "A destination-inspired soundtrack created for a honeymoon couple on their special getaway.", src: "/images/sample-honeymoon.jpg" },
    { title: "VIP Welcome Experience", story: "A high-value guest receives a personalized musical welcome before their arrival.", src: "/images/hero-flight.jpg" },
    { title: "Employee Recognition", story: "A company celebrates top performers with a meaningful, personalized appreciation song.", src: "/images/occasions/corporate.jpg" },
  ];


  return (
    <>
      <Helmet>
        <title>Hospitality &amp; Cruise Partnerships | My Custom Beats</title>
        <meta name="description" content="Personalised music as a guest experience for hotels, resorts, cruise lines and event partners." />
      </Helmet>
    <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: "#2c2418", background: "#faf8f4" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Jost:wght@300;400;500;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .mcb-btn-primary {
          background: #1a1208;
          color: #f5f0e8;
          border: none;
          padding: 14px 32px;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .mcb-btn-primary:hover { background: #B8965A; }

        .mcb-btn-outline {
          background: transparent;
          color: #1a1208;
          border: 1px solid #1a1208;
          padding: 13px 30px;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s ease;
        }
        .mcb-btn-outline:hover { background: #1a1208; color: #f5f0e8; }

        .mcb-btn-white {
          background: #fff;
          color: #1a1208;
          border: none;
          padding: 14px 32px;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.3s ease;
        }
        .mcb-btn-white:hover { background: #B8965A; color: #fff; }

        .partner-card {
          background: #fff;
          border: 1px solid #e8e0d4;
          padding: 0 0 24px 0;
          transition: box-shadow 0.3s ease, transform 0.3s ease;
          cursor: default;
        }
        .partner-card:hover {
          box-shadow: 0 8px 40px rgba(184,150,90,0.12);
          transform: translateY(-3px);
        }

        .step-card {
          background: #fff;
          border: 1px solid #e8e0d4;
          padding: 36px 28px;
          position: relative;
          flex: 1;
        }

        .form-input {
          width: 100%;
          border: none;
          border-bottom: 1px solid #d4c9b8;
          background: transparent;
          padding: 10px 0;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          color: #2c2418;
          outline: none;
          letter-spacing: 0.04em;
          transition: border-color 0.3s;
        }
        .form-input:focus { border-bottom-color: #B8965A; }
        .form-input::placeholder { color: #a89880; }

        .form-select {
          width: 100%;
          border: none;
          border-bottom: 1px solid #d4c9b8;
          background: transparent;
          padding: 10px 0;
          font-family: 'Jost', sans-serif;
          font-size: 13px;
          color: #2c2418;
          outline: none;
          cursor: pointer;
          appearance: none;
          letter-spacing: 0.04em;
        }
        .form-select:focus { border-bottom-color: #B8965A; }

        .goal-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Jost', sans-serif;
          font-size: 12px;
          letter-spacing: 0.04em;
          color: #5a4a35;
          cursor: pointer;
          user-select: none;
        }

        .goal-checkbox {
          width: 16px; height: 16px;
          border: 1px solid #c4b49a;
          background: transparent;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: border-color 0.2s, background 0.2s;
        }
        .goal-checkbox.checked { background: #B8965A; border-color: #B8965A; }

        .section-label {
          font-family: 'Jost', sans-serif;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.25em;
          text-transform: uppercase;
          color: #B8965A;
          margin-bottom: 14px;
        }

        .divider-gold {
          width: 48px;
          height: 1px;
          background: #B8965A;
          margin: 16px auto;
        }

        @media (max-width: 900px) {
          .hero-grid { flex-direction: column !important; }
          .partners-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .steps-row { flex-direction: column !important; }
          .form-two-col { grid-template-columns: 1fr !important; }
          .enterprise-grid { flex-direction: column !important; }
          .experiences-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .bottom-row { flex-direction: column !important; }
          .target-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 600px) {
          .partners-grid { grid-template-columns: 1fr !important; }
          .experiences-grid { grid-template-columns: 1fr !important; }
          .target-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── HERO ───────────────────────────────────────────────────────────── */}
      <section style={{ position: "relative", minHeight: "88vh", display: "flex", alignItems: "stretch", overflow: "hidden" }}>
        {/* Background cinematic image */}
        <ImgPlaceholder
          src="/images/hero-cruise.jpg"
          alt="Couple on luxury cruise at sunset"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
          overlay="linear-gradient(to right, rgba(26,18,8,0.72) 0%, rgba(26,18,8,0.45) 50%, rgba(26,18,8,0.15) 100%)"
        />

        <div style={{ position: "relative", zIndex: 1, maxWidth: "1280px", margin: "0 auto", padding: "120px 48px 80px", display: "flex", alignItems: "center", width: "100%", gap: "60px" }} className="hero-grid">
          {/* Left content */}
          <div style={{ flex: "0 0 560px", maxWidth: "560px" }}>
            <p className="section-label" style={{ color: "#d4aa70" }}>Partner With My Custom Beats</p>
            <h1 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: "clamp(44px, 6vw, 76px)",
              fontWeight: "300",
              lineHeight: "1.08",
              color: "#faf7f0",
              marginBottom: "28px",
              letterSpacing: "-0.01em",
            }}>
              Transform Guest<br />Experiences Into<br /><em style={{ fontStyle: "italic", fontWeight: "300" }}>Lifelong Memories</em>
            </h1>
            <p style={{
              fontFamily: "'Jost', sans-serif",
              fontSize: "15px",
              fontWeight: "300",
              lineHeight: "1.7",
              color: "rgba(250,247,240,0.8)",
              marginBottom: "40px",
              maxWidth: "440px",
              letterSpacing: "0.02em",
            }}>
              We create bespoke songs and emotionally crafted musical experiences that elevate every moment — onboard, at the resort, and beyond. A white-glove solution for modern hospitality, travel, and events.
            </p>

            {/* Trust badges */}
            <div style={{ display: "flex", gap: "32px", marginBottom: "44px", flexWrap: "wrap" }}>
              {[
                { label: "White-Glove", sub: "Personalization" },
                { label: "Enterprise Ready", sub: "& Scalable" },
                { label: "Turnkey Solution", sub: "From Start to Finish" },
              ].map(b => (
                <div key={b.label} style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "12px", fontWeight: "500", letterSpacing: "0.1em", color: "#d4aa70", textTransform: "uppercase" }}>{b.label}</span>
                  <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "11px", color: "rgba(250,247,240,0.6)", letterSpacing: "0.05em" }}>{b.sub}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
              <button className="mcb-btn-primary" onClick={scrollToForm} style={{ background: "#B8965A", color: "#fff" }}>Become a Partner</button>
              <button 
                className="mcb-btn-outline" 
                onClick={() => window.open('https://calendly.com/thecustombeats/demo', '_blank')}
                style={{ color: "#faf7f0", borderColor: "rgba(250,247,240,0.5)" }}
              >
                Book a Demo
              </button>
            </div>
          </div>

          {/* Right — floating card (Temporarily hidden until video is ready) */}
          {/* 
          <div style={{ marginLeft: "auto", flexShrink: 0 }}>
            ... card content ...
          </div> 
          */}
        </div>
      </section>

      {/* ── WHO WE PARTNER WITH ────────────────────────────────────────────── */}
      <section style={{ background: "#faf8f4", padding: "100px 48px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <p className="section-label">Who We Partner With</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(32px, 4vw, 50px)", fontWeight: "300", color: "#1a1208", letterSpacing: "-0.01em" }}>
              Built for Industries That Create<br /><em>Unforgettable Experiences</em>
            </h2>
            <div className="divider-gold" />
          </div>

          <div className="partners-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "20px" }}>
            {partners.map((p, i) => (
              <div key={i} className="partner-card">
                <ImgPlaceholder
                  src={p.src}
                  alt={p.label}
                  style={{ height: "160px", width: "100%" }}
                  overlay="linear-gradient(to bottom, transparent 40%, rgba(26,18,8,0.3))"
                />
                <div style={{ padding: "20px 20px 0" }}>
                  <div style={{ marginBottom: "12px" }}>{p.icon}</div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "18px", fontWeight: "500", marginBottom: "8px", color: "#1a1208" }}>{p.label}</h3>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "12px", fontWeight: "300", lineHeight: "1.6", color: "#7a6a54", letterSpacing: "0.02em" }}>{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TARGET PARTNERS ───────────────────────────────────────────────── */}
      <section style={{ background: "#f4efe8", padding: "100px 48px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <p className="section-label">Target Partners</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(32px, 4vw, 50px)", fontWeight: "300", color: "#1a1208" }}>
              Solutions Designed For<br /><em>Every Guest Journey</em>
            </h2>
            <div className="divider-gold" />
          </div>

          <div className="target-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "20px" }}>
            {targetPartners.map((tp, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid #e8e0d4", padding: "32px 28px" }}>
                <div style={{ marginBottom: "16px" }}>{tp.icon}</div>
                <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "19px", fontWeight: "500", color: "#1a1208", marginBottom: "18px", lineHeight: "1.3" }}>{tp.title}</h3>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {tp.items.map((item, j) => (
                    <li key={j} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontFamily: "'Jost', sans-serif", fontSize: "12px", fontWeight: "300", color: "#7a6a54", lineHeight: "1.5", letterSpacing: "0.02em" }}>
                      <span style={{ color: "#B8965A", marginTop: "2px", flexShrink: 0 }}>·</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────── */}
      <section style={{ background: "#faf8f4", padding: "100px 48px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: "64px" }}>
            <p className="section-label">How It Works</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(32px, 4vw, 50px)", fontWeight: "300", color: "#1a1208" }}>
              A Seamless <em>4-Step Experience</em>
            </h2>
            <div className="divider-gold" />
          </div>

          <div className="steps-row" style={{ display: "flex", gap: "0", alignItems: "stretch" }}>
            {steps.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "stretch", flex: 1 }}>
                <div className="step-card">
                  <div style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "42px", fontWeight: "300", color: "#e8ddd0", lineHeight: "1", marginBottom: "20px" }}>{step.num}</div>
                  <div style={{ marginBottom: "16px" }}>
                    {i === 0 ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><circle cx="14" cy="10" r="4" stroke="#B8965A" strokeWidth="1.4"/><path d="M6 24c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke="#B8965A" strokeWidth="1.4" fill="none"/></svg>
                    : i === 1 ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 14c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z" stroke="#B8965A" strokeWidth="1.4" fill="none"/><path d="M14 4v3M14 21v3M4 14h3M21 14h3" stroke="#B8965A" strokeWidth="1.2"/></svg>
                    : i === 2 ? <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M8 20c0-4.4 2.7-8 6-8s6 3.6 6 8" stroke="#B8965A" strokeWidth="1.4" fill="none"/><path d="M14 12V6l-3 3M14 6l3 3" stroke="#B8965A" strokeWidth="1.2"/></svg>
                    : <svg width="28" height="28" viewBox="0 0 28 28" fill="none"><path d="M6 14l5 5 11-11" stroke="#B8965A" strokeWidth="1.6" strokeLinecap="round"/></svg>}
                  </div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "19px", fontWeight: "500", color: "#1a1208", marginBottom: "12px", lineHeight: "1.3" }}>{step.title}</h3>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "13px", fontWeight: "300", lineHeight: "1.65", color: "#7a6a54", letterSpacing: "0.02em" }}>{step.desc}</p>
                </div>
                {i < steps.length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", padding: "0 8px", color: "#d4c9b8", flexShrink: 0 }}>
                    <ArrowRight />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Delivery channels */}
          <div style={{ marginTop: "48px", display: "flex", justifyContent: "center", gap: "40px", flexWrap: "wrap" }}>
            {["Cruise Apps", "Email", "QR Codes", "Guest Portals", "Concierge Teams", "Onboard Experiences"].map(ch => (
              <div key={ch} style={{ fontFamily: "'Jost', sans-serif", fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880", display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#B8965A", display: "inline-block" }} />
                {ch}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ENTERPRISE SECTION ────────────────────────────────────────────── */}
      <section style={{ background: "#1a1208", overflow: "hidden" }}>
        <div className="enterprise-grid" style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", alignItems: "stretch", minHeight: "560px" }}>
          {/* Left text */}
          <div style={{ flex: "0 0 50%", padding: "90px 64px 90px 48px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <p className="section-label" style={{ color: "#B8965A" }}>A Premium Service Infrastructure</p>
            <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(32px, 3.5vw, 50px)", fontWeight: "300", color: "#faf7f0", lineHeight: "1.15", marginBottom: "24px", letterSpacing: "-0.01em" }}>
              More Than Music.<br /><em>A Scalable Guest Experience</em><br />Infrastructure.
            </h2>
            <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "14px", fontWeight: "300", lineHeight: "1.7", color: "rgba(250,247,240,0.65)", marginBottom: "40px", letterSpacing: "0.02em" }}>
              We combine human artistry with sophisticated workflow design to deliver personalized experiences at scale — without ever compromising the warmth and intimacy of the human touch.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {[
                "Seamless Workflow & Partner Integration",
                "Scalable Fulfillment & High-Volume Personalization",
                "White-Label Partnership Programs",
                "CRM & Property Management Integration",
                "Multi-Location & Multi-Brand Support",
                "Enterprise Security & Compliance Ready",
              ].map(item => (
                <div key={item} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <CheckIcon />
                  <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "13px", fontWeight: "300", color: "rgba(250,247,240,0.75)", letterSpacing: "0.04em" }}>{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right — image with floating card */}
          <div style={{ flex: 1, position: "relative" }}>
            <ImgPlaceholder
              src="/images/hero-1.jpg"
              alt="Luxury hotel lobby lounge"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
              overlay="linear-gradient(to left, transparent 60%, rgba(26,18,8,0.6))"
            />
            {/* Floating dashboard card */}
            <div style={{
              position: "absolute", bottom: "48px", right: "48px",
              background: "rgba(250,247,240,0.95)",
              backdropFilter: "blur(12px)",
              padding: "24px 28px",
              width: "220px",
              borderTop: "2px solid #B8965A",
            }}>
              <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "20px", fontWeight: "400", color: "#1a1208", lineHeight: "1.3", marginBottom: "4px" }}>
                Personalized<br />For Every Guest,<br />At Scale.
              </p>
              <div style={{ marginTop: "12px", display: "flex", gap: "4px" }}>
                {[40, 65, 50, 80, 55, 90, 70].map((h, i) => (
                  <div key={i} style={{ width: "6px", height: `${h * 0.5}px`, background: "#B8965A", opacity: 0.6 + i * 0.05 }} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── EXPERIENCE EXAMPLES + PARTNER INQUIRY ─────────────────────────── */}
      <section style={{ background: "#faf8f4", padding: "100px 48px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
          <div className="bottom-row" style={{ display: "flex", gap: "80px" }}>

            {/* Experience Examples */}
            <div style={{ flex: "0 0 520px" }} ref={experiencesRef}>
              <p className="section-label">Experience Examples</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: "300", color: "#1a1208", marginBottom: "8px" }}>
                Real Moments.<br /><em>Real Impact.</em>
              </h2>
              <div style={{ width: "48px", height: "1px", background: "#B8965A", marginBottom: "40px" }} />

              <div className="experiences-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "20px" }}>
                {experiences.map((ex, i) => (
                  <div key={i} style={{ background: "#fff", border: "1px solid #e8e0d4", overflow: "hidden" }}>
                    <div style={{ position: "relative" }}>
                      <ImgPlaceholder src={ex.src} alt={ex.title} style={{ height: "130px", width: "100%" }} overlay="linear-gradient(to bottom, transparent 50%, rgba(26,18,8,0.35))" />
                      <button 
                        style={{
                          position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                          width: "36px", height: "36px", borderRadius: "50%",
                          background: "rgba(250,247,240,0.9)",
                          border: "none", cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                        onClick={() => window.location.href = '/#showcase'}
                      >
                        <svg width="10" height="12" viewBox="0 0 10 12" fill="#B8965A">
                          <path d="M1 1l8 5-8 5V1z"/>
                        </svg>
                      </button>
                    </div>
                    <div style={{ padding: "16px" }}>
                      <h4 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "15px", fontWeight: "500", color: "#1a1208", marginBottom: "6px" }}>{ex.title}</h4>
                      <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "11px", fontWeight: "300", color: "#7a6a54", lineHeight: "1.6", letterSpacing: "0.02em" }}>{ex.story}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Partnership models */}
              <div style={{ marginTop: "48px", background: "#1a1208", padding: "36px 32px", position: "relative", overflow: "hidden" }}>
                <ImgPlaceholder
                  src="/images/hero-yacht.jpg"
                  alt="Sunset ocean"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.25 }}
                />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <p className="section-label" style={{ color: "#d4aa70" }}>Partnership Models</p>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "28px", fontWeight: "300", color: "#faf7f0", marginBottom: "24px", lineHeight: "1.3" }}>
                    Flexible Partnerships.<br /><em>Infinite Possibilities.</em>
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", marginBottom: "28px" }}>
                    {["White-Label Partnerships", "Custom Integrations", "Revenue-Sharing Arrangements", "Event Collaborations", "Enterprise Licensing", "Hospitality Partnerships"].map(m => (
                      <div key={m} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <CheckIcon />
                        <span style={{ fontFamily: "'Jost', sans-serif", fontSize: "11px", color: "rgba(250,247,240,0.7)", letterSpacing: "0.04em" }}>{m}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{
                    background: "rgba(250,247,240,0.08)", border: "1px solid rgba(250,247,240,0.1)",
                    padding: "24px", marginTop: "8px",
                  }}>
                    <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "20px", fontWeight: "300", color: "#faf7f0", lineHeight: "1.4", marginBottom: "16px" }}>
                      Let's Redefine Personalized Guest Experiences Together.
                    </p>
                    <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "12px", fontWeight: "300", color: "rgba(250,247,240,0.6)", lineHeight: "1.6", letterSpacing: "0.02em", marginBottom: "20px" }}>
                      Join forward-thinking brands who create unforgettable moments with My Custom Beats.
                    </p>
                    <button className="mcb-btn-white" onClick={scrollToForm} style={{ width: "100%", fontSize: "12px" }}>Schedule a Partnership Call</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Partner Inquiry Form */}
            <div style={{ flex: 1 }} ref={formRef}>
              <p className="section-label">Partner Inquiry</p>
              <h2 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: "300", color: "#1a1208", marginBottom: "8px" }}>
                Start the Conversation
              </h2>
              <div style={{ width: "48px", height: "1px", background: "#B8965A", marginBottom: "40px" }} />

              {submitted ? (
                <div style={{ background: "#fff", border: "1px solid #e8e0d4", padding: "64px 40px", textAlign: "center" }}>
                  <div style={{ marginBottom: "28px" }}>
                    <svg width="64" height="64" viewBox="0 0 48 48" fill="none" style={{ margin: "0 auto" }}>
                      <circle cx="24" cy="24" r="22" stroke="#B8965A" strokeWidth="1"/>
                      <path d="M15 24l6 6 12-12" stroke="#B8965A" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "32px", fontWeight: "300", color: "#1a1208", marginBottom: "20px" }}>Thank You</h3>
                  <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "15px", fontWeight: "300", color: "#7a6a54", lineHeight: "1.7", marginBottom: "32px", maxWidth: "480px", margin: "0 auto 40px" }}>
                    We’ve received your partnership inquiry.<br /><br />
                    Our team will carefully review your request and contact you shortly to explore how My Custom Beats can create bespoke guest experiences for your brand.
                  </p>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "320px", margin: "0 auto" }}>
                    <button 
                      className="mcb-btn-primary" 
                      style={{ background: "#B8965A", color: "#fff", width: "100%" }}
                      onClick={() => window.open('https://calendly.com/thecustombeats/demo', '_blank')}
                    >
                      Schedule a Call
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: "#fff", border: "1px solid #e8e0d4", padding: "40px" }}>
                  {/* ... form fields ... */}
                  {/* Row 1 */}
                  <div className="form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: "24px" }}>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Full Name *</label>
                      <input className="form-input" name="fullName" value={formData.fullName} onChange={handleChange} placeholder="Your full name" required />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Company Name *</label>
                      <input className="form-input" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Your company" required />
                    </div>
                  </div>

                  {/* Row 2 */}
                  <div className="form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: "24px" }}>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Job Title *</label>
                      <input className="form-input" name="jobTitle" value={formData.jobTitle} onChange={handleChange} placeholder="Your role" required />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Business Email *</label>
                      <input className="form-input" type="email" name="businessEmail" value={formData.businessEmail} onChange={handleChange} placeholder="your@company.com" required />
                    </div>
                  </div>

                  {/* Row 3 */}
                  <div className="form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: "24px" }}>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Phone Number</label>
                      <input className="form-input" name="phone" value={formData.phone} onChange={handleChange} placeholder="+1 (000) 000-0000" />
                    </div>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Company Website</label>
                      <input className="form-input" name="website" value={formData.website} onChange={handleChange} placeholder="www.yourcompany.com" />
                    </div>
                  </div>

                  {/* Row 4 */}
                  <div className="form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: "24px" }}>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Industry Type *</label>
                      <select className="form-select" name="industryType" value={formData.industryType} onChange={handleChange} required>
                        <option value="">Select industry</option>
                        <option>Cruise Line</option>
                        <option>Luxury Hotel / Resort</option>
                        <option>Wedding & Events</option>
                        <option>Travel Agency</option>
                        <option>Yacht Charter</option>
                        <option>Corporate</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Type of Partnership Interest</label>
                      <select className="form-select" name="partnershipInterest" value={formData.partnershipInterest} onChange={handleChange}>
                        <option value="">Select type</option>
                        <option>White-Label Partnership</option>
                        <option>Revenue-Sharing</option>
                        <option>Enterprise Integration</option>
                        <option>Event Collaboration</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Row 5 */}
                  <div className="form-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginBottom: "28px" }}>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Estimated Guest Volume</label>
                      <select className="form-select" name="estimatedVolume" value={formData.estimatedVolume} onChange={handleChange}>
                        <option value="">Select volume</option>
                        <option>Under 1,000</option>
                        <option>1,000 – 10,000</option>
                        <option>10,000 – 50,000</option>
                        <option>50,000+</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880" }}>Countries / Regions Served</label>
                      <input className="form-input" name="regions" value={formData.regions} onChange={handleChange} placeholder="e.g. North America, Europe" />
                    </div>
                  </div>

                  {/* Partnership Goals */}
                  <div style={{ marginBottom: "28px" }}>
                    <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880", display: "block", marginBottom: "16px" }}>Partnership Goals</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" }}>
                      {["Guest Entertainment", "Concierge Integration", "Hospitality Integration", "White-Label Solutions", "API / AI Integrations", "Event Experiences", "Revenue-Sharing Opportunities", "Brand Activations"].map(goal => (
                        <div key={goal} className="goal-chip" onClick={() => handleGoalToggle(goal)}>
                          <div className={`goal-checkbox ${formData.goals.includes(goal) ? "checked" : ""}`}>
                            {formData.goals.includes(goal) && <svg width="10" height="8" viewBox="0 0 10 8" fill="white"><path d="M1 4l3 3 5-6" strokeWidth="1.5" stroke="white" fill="none"/></svg>}
                          </div>
                          {goal}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Message */}
                  <div style={{ marginBottom: "36px" }}>
                    <label style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", letterSpacing: "0.15em", textTransform: "uppercase", color: "#a89880", display: "block", marginBottom: "8px" }}>Tell us about your vision or partnership opportunity *</label>
                    <textarea
                      className="form-input"
                      name="message"
                      value={formData.message}
                      onChange={handleChange}
                      placeholder="Share your vision..."
                      rows={4}
                      style={{ resize: "vertical", borderBottom: "none", border: "1px solid #d4c9b8", padding: "12px", width: "100%", fontFamily: "'Jost', sans-serif", fontSize: "13px", color: "#2c2418", outline: "none", background: "transparent" }}
                      required
                    />
                  </div>

                  <button 
                    className="mcb-btn-primary" 
                    onClick={handleSubmit} 
                    style={{ width: "100%", padding: "18px", fontSize: "13px", opacity: isSubmitting ? 0.7 : 1 }}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Sending..." : "Start Partnership Discussion"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER BADGES ─────────────────────────────────────────────────── */}
      <section style={{ background: "#f4efe8", borderTop: "1px solid #e8e0d4", padding: "40px 48px" }}>
        <div style={{ maxWidth: "1280px", margin: "0 auto", display: "flex", justifyContent: "center", gap: "60px", flexWrap: "wrap" }}>
          {[
            { title: "Enterprise Ready", sub: "Onboarding" },
            { title: "Feel-On", sub: "Hospitality Experiences" },
            { title: "Built for Scalable", sub: "Hospitality Experiences" },
            { title: "Designed for Modern", sub: "Guest Engagement" },
          ].map(b => (
            <div key={b.title} style={{ textAlign: "center" }}>
              <div style={{ marginBottom: "8px", display: "flex", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="#B8965A" strokeWidth="1.2"/>
                  <path d="M8 12l3 3 5-5" stroke="#B8965A" strokeWidth="1.2"/>
                </svg>
              </div>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "11px", fontWeight: "500", letterSpacing: "0.1em", textTransform: "uppercase", color: "#5a4a35" }}>{b.title}</p>
              <p style={{ fontFamily: "'Jost', sans-serif", fontSize: "10px", color: "#a89880", letterSpacing: "0.06em" }}>{b.sub}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
    </>
  );
}
