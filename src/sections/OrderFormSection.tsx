
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Upload, Info } from 'lucide-react';
import { Link } from "react-router-dom";

gsap.registerPlugin(ScrollTrigger);
<section id="order-form">
  
</section>
const moodsList = [
  'Romantic','Adventurous','Relaxed','Upbeat','Celebration',
  'Nostalgia','Gratitude','Calm','Excitement','Reflection','Cinematic'
];

const stripeLinks: Record<string, string> = {
   moment: "https://buy.stripe.com/fZu28qcHWdPV3KO6qmbsc0a",
  keepsake: "https://buy.stripe.com/7sY00i8rG5jpa9caGCbsc06",
  journey: "https://buy.stripe.com/14A9AS23ibHNftwcOKbsc07",
  heirloom: "https://buy.stripe.com/6oUaEWbDSfY39586qmbsc08",
  bespoke: "https://buy.stripe.com/5kQ8wO9vKcLR3KO3eabsc09"
};

const packageOptions = [
  { id: 'moment', name: 'Moment', price: '£29' },
  { id: "keepsake", name: "Keepsake", price: "£79" },
  { id: "journey", name: "Journey", price: "£199" },
  { id: "heirloom", name: "Heirloom", price: "£349" },
  { id: "bespoke", name: "Bespoke", price: "From £799" },
];

const contactMethods = ['Email', 'WhatsApp', 'Phone'];
type FormDataType = {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  preferredContact: string;
  package: string;
  moods: string[];
  otherMood: string;
  genre: string;
  otherGenre: string;
  personalTouches: string;
  story: string;
  artwork: File | null;
  agreeTerms: boolean;
};

type FormErrors = Partial<Record<keyof FormDataType, string>>;

interface OrderFormSectionProps {
  selectedPackage: string | null;
}

const OrderFormSection = ({ selectedPackage }: OrderFormSectionProps) => {

  const getRef = () => {
  return document.cookie
    .split("; ")
    .find(row => row.startsWith("ref="))
    ?.split("=")[1] || "";
};
  const sectionRef = useRef<HTMLDivElement>(null);

  const [showOtherMood, setShowOtherMood] = useState(false);

  const [formData, setFormData] = useState<FormDataType>({
  firstName: '',
  lastName: '',
  email: '',
  whatsapp: '',
  preferredContact: '',
  package: '',
  moods: [],
  otherMood: '',
  genre: '',
  otherGenre: '',
  personalTouches: '',
  story: '',
  artwork: null,
  agreeTerms: false,
});


const [errors, setErrors] = useState<FormErrors>({});
const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
  if (selectedPackage) {
    setFormData((prev) => ({
      ...prev,
      package: selectedPackage,
    }));
  }
}, [selectedPackage]);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      gsap.fromTo('.order-heading',{y:30,opacity:0},{y:0,opacity:1,duration:0.4});
      gsap.fromTo('.order-form-field',{y:20,opacity:0},{y:0,opacity:1,stagger:0.05,duration:0.3});
    }, section);

    return () => ctx.revert();
  }, []);

  const handleMoodToggle = (mood: string) => {
    if (mood === 'Other') {
      setShowOtherMood(!showOtherMood);
      if (showOtherMood) {
        setFormData(prev => ({ ...prev, otherMood: '' }));
      }
      return;
    }

    setFormData(prev => ({
      ...prev,
      moods: prev.moods.includes(mood)
        ? prev.moods.filter(m => m !== mood)
        : [...prev.moods, mood]
    }));
  };

  const wordCount = formData.story.trim().split(/\s+/).filter(Boolean).length;

const uploadArtwork = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "mycustombeats");

    const response = await fetch(
      "https://api.cloudinary.com/v1_1/dnx1qrfrl/image/upload",
      {
        method: "POST",
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error("Upload failed");
    }

    return await response.json();
  } catch (error) {
    console.error("Cloudinary upload failed:", error);
    return null; // VERY IMPORTANT
  }
};

const packagePrices: Record<
  string,
  { GBP: number; USD: number }
> = {
  Keepsake: { GBP: 79, USD: 99 },
  Journey: { GBP: 199, USD: 249 },
  Heirloom: { GBP: 349, USD: 449 },
  Bespoke: { GBP: 799, USD: 999 },
};

const validateForm = (): FormErrors => {
  const newErrors: FormErrors = {};
  const wordCount = formData.story.trim().split(/\s+/).filter(Boolean).length;

  if (!formData.firstName.trim())
    newErrors.firstName = "First name is required";

  if (!formData.lastName.trim())
    newErrors.lastName = "Last name is required";

  if (!formData.email.trim())
    newErrors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
    newErrors.email = "Invalid email format";

 if (!formData.whatsapp.trim()) {
  newErrors.whatsapp = "WhatsApp number is required";
} else if (!formData.whatsapp.startsWith("+")) {
  newErrors.whatsapp =
    "Please include your international dialing code (e.g. +44, +1)";
} else if (!/^\+\d{6,15}$/.test(formData.whatsapp)) {
  newErrors.whatsapp = "Please enter a valid WhatsApp number";
}

  if (!formData.preferredContact)
    newErrors.preferredContact = "Select contact method";

 if (!formData.package) {
  newErrors.package = "Please select a package";
}

  if (formData.moods.length === 0 && !formData.otherMood.trim())
    newErrors.moods = "Select at least one mood";

  if (!formData.genre)
    newErrors.genre = "Select genre";

  if (formData.genre === "Other" && !formData.otherGenre.trim())
    newErrors.otherGenre = "Please specify genre";

  if (!formData.story.trim())
    newErrors.story = "Story required";
  else if (wordCount > 2000)
    newErrors.story = "Maximum 2000 words";

  if (!formData.agreeTerms) {
  newErrors.agreeTerms = "You must agree to the Terms & Conditions";
}

  return newErrors;
};

const handleChange = <K extends keyof FormDataType>(
  field: K,
  value: FormDataType[K]
) => {
  setFormData((prev) => ({
    ...prev,
    [field]: value,
  }));

  if (errors[field]) {
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated[field];
      return updated;
    });
  }
};

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const ref = getRef();
console.log("Referral detected:", ref);

  if (isSubmitting) return;

  const validationErrors = validateForm();
  setErrors(validationErrors);

  if (Object.keys(validationErrors).length > 0) {
    const firstError = Object.keys(validationErrors)[0];

    const element = document.querySelector(
      `[data-field="${firstError}"]`
    ) as HTMLElement | null;

    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.focus();
    }

    return; // 🚨 BLOCKS STRIPE
  }

  setIsSubmitting(true);

  const selectedPackage = formData.package;
  console.log("Selected package:", selectedPackage);
  console.log("Available packages:", Object.keys(packagePrices));

  // ✅ GET PRICES HERE (TOP LEVEL)
  const normalizedPackage =
  selectedPackage.charAt(0).toUpperCase() +
  selectedPackage.slice(1).toLowerCase();

const selectedPrices =
  packagePrices[normalizedPackage as keyof typeof packagePrices] || {
    GBP: 0,
    USD: 0,
  };

const finalPrice = selectedPrices.GBP; // since you want GBP only

  let artworkUpload = null;

if (formData.artwork) {
  const uploadResult = await uploadArtwork(formData.artwork);
  artworkUpload = uploadResult?.secure_url || null;
}

  // ZAPIER 
  const zapierData = new FormData();

  zapierData.append("referral", ref);
  zapierData.append("firstName", formData.firstName);
  zapierData.append("lastName", formData.lastName);
  zapierData.append("email", formData.email);
  zapierData.append("whatsapp", formData.whatsapp);
  zapierData.append("preferredContact", formData.preferredContact);
  zapierData.append("package", selectedPackage);
  zapierData.append("price", String(finalPrice));
  zapierData.append(
    "mood",
    formData.otherMood
      ? formData.moods.join(", ") + ", " + formData.otherMood
      : formData.moods.join(", ")
  );
  zapierData.append(
    "genre",
    formData.genre === "Other"
      ? formData.otherGenre
      : formData.genre
  );
  zapierData.append("personalTouches", formData.personalTouches);
  zapierData.append("story", formData.story);
  zapierData.append("artworkUrl", artworkUpload || "");
  zapierData.append("agreeTerms", String(formData.agreeTerms));

  console.log("Sending price:", finalPrice);

  try {
    // Primary: Local OpenClaw Bridge
    await fetch(
      "http://localhost:18888/webhook/order",
      {
        method: "POST",
        body: zapierData,
      }
    );

    // Fallback/Legacy: Make.com
    await fetch(
      "https://hook.eu1.make.com/yrw2uhttk8p3kpjxsy5pks3wgwjpc7ru",
      {
        method: "POST",
        body: zapierData,
      }
    );

    } catch {
    setIsSubmitting(false);
    return;
  }

// STRIPE
  const stripeUrl = stripeLinks[formData.package];

  if (stripeUrl) {
    const referral = localStorage.getItem("referral") || "direct";
    
    // Store selected package for conversion tracking on thank you page
    localStorage.setItem("last_order_package", formData.package);

    const finalUrl = `${stripeUrl}?client_reference_id=${referral}`;
    window.location.href = finalUrl;
  }
};

  return (
    
    <div ref={sectionRef} id="order" className="relative w-full bg-misty-stone py-24">
      <div className="px-[7vw]">
        <div className="order-form-field max-w-3xl mx-auto">

          <div className="order-heading text-center mb-10">
  <p className="label-uppercase text-gold mb-3">Get Started</p>
  <h2 
    className="order-heading text-4xl md:text-5xl text-espresso mb-4"
    style={{ fontFamily: 'Playfair Display, serif' }}
  >
    Tell us your story — we’ll turn it into something unforgettable
  </h2>
  <p 
    className="order-heading text-espresso/60"
    style={{ fontFamily: 'Arimo, sans-serif' }}
  >
    Most clients hear back within 12 hours with a concept & pricing.
 </p>

    <p 
    className="order-heading text-espresso/60"
    style={{ fontFamily: 'Arimo, sans-serif' }}
  >
    Your information is secure and handled with complete confidentiality.

  </p>
</div>

<form
  onSubmit={handleSubmit}
  className="order-form bg-white rounded-3xl shadow-luxury p-8 space-y-8"
>

 {/* CONTACT */}
<div className="order-form-field space-y-4">
  <h1 className="label-uppercase text-gold">
    Step 1 — Contact Details
  </h1>

  {/* First + Last Name */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <input
  name="firstName"
      data-field="firstName"
      placeholder="First Name *"
      value={formData.firstName}
      onChange={(e) => handleChange("firstName", e.target.value)}
      className={`w-full px-4 py-3 border rounded-xl ${
        errors.firstName ? 'border-red-500' : 'border-espresso/10'
      }`}
    />

    <input
    name="lastName"
      data-field="lastName"
      placeholder="Last Name *"
      value={formData.lastName}
      onChange={(e) => handleChange("lastName", e.target.value)}
      className={`w-full px-4 py-3 border rounded-xl ${
        errors.lastName ? 'border-red-500' : 'border-espresso/10'
      }`}
    />
  </div>

  {/* Email */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <input
    name="email"
      data-field="email"
      type="email"
      placeholder="Email Address *"
      value={formData.email}
     onChange={(e) => handleChange("email", e.target.value)}
      className={`w-full px-4 py-3 border rounded-xl ${
        errors.email ? 'border-red-500' : 'border-espresso/10'
      }`}
    />

    {/* WhatsApp */}
<div className="order-form-field" data-field="whatsapp">
  <input
    name="whatsapp"
    placeholder="WhatsApp (+country code) *"
    value={formData.whatsapp}
    onChange={(e) => handleChange("whatsapp", e.target.value)}
    className={`w-full px-4 py-3 border rounded-xl ${
      errors.whatsapp
        ? "border-red-500"
        : "border-espresso/10"
    }`}
  />

  {errors.whatsapp && (
    <p className="text-red-500 text-xs mt-1">
      {errors.whatsapp}
    </p>
  )}
</div>
</div>
</div>

{/* Preferred Contact Method */}
<div className="order-form-field space-y-3">
  <div
    data-field="preferredContact"
    className={`${errors.preferredContact ? 'border border-red-500 p-3 rounded-xl' : ''}`}
  >
    <div className="flex flex-wrap gap-3 items-center">
      <span className="order-heading text-sm text-espresso/60">
        Preferred contact: *
      </span>

      {contactMethods.map((method) => (
        <button
          key={method}
          type="button"
          onClick={() =>
            setFormData({ ...formData, preferredContact: method })
          }
          className={`px-4 py-2 rounded-full text-sm transition-all duration-fast ${
            formData.preferredContact === method
              ? 'bg-gold text-espresso'
              : 'bg-ivory border border-espresso/10 text-espresso/70 hover:border-gold'
          }`}
        >
          {method}
        </button>
      ))}
    </div>
  </div>
</div>
 

  {/* Step 2 — Package Selection */}
<h1 className="label-uppercase text-gold">
  Step 2 — Package Selection
</h1>

<div
  data-field="package"
  className={`package-card ${
    errors.package ? "border-red-500 border-2 p-3 rounded-xl" : ""
  }`}
>
  <div className="flex flex-wrap gap-3">
    {packageOptions.map((pkg) => (
      <button
        key={pkg.name}
        type="button"
        onClick={() =>
          setFormData((prev) => ({
            ...prev,
            package: pkg.id,
          }))
        }
        className={`px-5 py-3 rounded-xl transition-all text-left ${
          formData.package === pkg.name.toLowerCase()
            ? "bg-gold text-espresso"
            : "bg-ivory border border-espresso/10 text-espresso/70 hover:border-gold"
        }`}
      >
        <div className="font-medium">{pkg.name}</div>
        <div className="order-heading text-sm opacity-70">
          {pkg.price}
        </div>
      </button>
    ))}
  </div>
</div>

{errors.package && (
  <p className="text-red-500 text-sm mt-2">
    {errors.package}
  </p>
)}


{/* MOOD */}
<div className="order-form-field space-y-4">
  <h1 className="label-uppercase text-gold">
    Step 3 — Mood
  </h1>

  <div
    data-field="moods"
    className={`${
      errors.moods ? 'border border-red-500 p-3 rounded-xl' : ''
    } flex flex-wrap gap-3`}
  >
    {moodsList.map((mood) => (
      <button
        key={mood}
        type="button"
        onClick={() => handleMoodToggle(mood)}
        className={`px-4 py-2 rounded-full text-sm ${
          formData.moods.includes(mood)
            ? 'bg-gold text-espresso'
            : 'bg-ivory border border-espresso/10'
        }`}
      >
        {mood}
      </button>
    ))}

    <button
      type="button"
      onClick={() => handleMoodToggle('Other')}
      className="px-4 py-2 rounded-full text-sm bg-ivory border border-espresso/10"
    >
      Other
    </button>
  </div>

  {showOtherMood && (
    <input
      placeholder="Enter your mood..."
      value={formData.otherMood}
      onChange={(e) => handleChange("otherMood", e.target.value)}
      className="w-full px-4 py-3 border border-espresso/10 rounded-xl"
    />
  )}
</div>

            {/* Genre */}
<div className="order-form-field space-y-4">
  <h1 className="label-uppercase text-gold">
    Step 4 — Genre
  </h1>

  <select
    value={formData.genre}
    onChange={(e) => handleChange("genre", e.target.value)}
    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-gold ${
      errors.genre ? 'border-red-500' : 'border-gray-300'
    }`}
  >
    <option value="">Select Genre</option>
    <option value="Hip Hop">Hip Hop</option>
    <option value="R&B">R&B</option>
    <option value="Pop">Pop</option>
    <option value="Trap">Trap</option>
    <option value="Drill">Drill</option>
    <option value="Afrobeats">Afrobeats</option>
    <option value="Gospel">Gospel</option>
    <option value="Acoustic">Acoustic</option>
    <option value="Other">Other</option>
  </select>

  {errors.genre && (
    <p className="order-heading text-red-500 text-sm mt-1">{errors.genre}</p>
  )}

  {/* If Genre = Other → show input field */}
  {formData.genre === 'Other' && (
    <div className="order-form-field mt-3">
      <input
        type="text"
        placeholder="Please specify your genre"
        value={formData.otherGenre || ''}
        onChange={(e) => handleChange("otherGenre", e.target.value)}
        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold"
      />
    </div>
  )}
</div>

            {/* Step 4: Personal Touches */}
<div className="order-form-field space-y-4">
  <h1 className="label-uppercase text-gold">
    Step 5 — Personal Touches (Optional)
  </h1>

  <input
    type="text"
    placeholder="Names, dates, phrases to include..."
    value={formData.personalTouches}
    onChange={(e) => handleChange("personalTouches", e.target.value)}
    className="w-full px-4 py-3 bg-ivory border border-espresso/10 rounded-xl text-espresso placeholder:text-espresso/40 focus:outline-none focus:ring-2 focus:ring-gold/30 transition-all duration-fast"
  />

  {/* Hidden File Input */}
  <input
    type="file"
    accept="image/png, image/jpeg"
    id="artworkUpload"
    style={{ display: 'none' }}
    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0] || null;
  handleChange("artwork", file);
}}
  />

  <div className="flex items-center gap-3 p-4 bg-ivory rounded-xl border border-espresso/10">
    <Upload size={20} className="order-heading text-gold" />

    <div className="flex-1">
      <p className="order-heading text-sm text-espresso">
        {formData.artwork
          ? formData.artwork.name
          : 'Upload photo for album artwork'}
      </p>
      <p className="order-heading text-xs text-espresso/50">
        Optional — JPG, PNG up to 10MB
      </p>
    </div>

    <button
      type="button"
      onClick={() =>
        document.getElementById('artworkUpload')?.click()
      }
      className="px-4 py-2 bg-white rounded-lg text-sm text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast"
    >
      Browse
    </button>
  </div>
</div>

            {/* STORY */}
            <div className="order-form-field space-y-4">
  <h1 className="label-uppercase text-gold">
    Step 6 — Your Words Matter
  </h1>

  <p 
    className="order-heading text-sm text-espresso/60"
    style={{ fontFamily: 'Arimo, sans-serif' }}
  >
    You do not need to write lyrics — simply share memories and feelings. (Up to 2000 words)
  </p>

  {/* Textarea */}
</div>
            <div className="order-form-field space-y-2">
              <textarea
                data-field="story"
                placeholder="Tell us about your journey, your celebration, your story *"
                value={formData.story}
                onChange={(e) => handleChange("story", e.target.value)}
                className={`w-full h-48 px-4 py-3 border rounded-xl ${errors.story?'border-red-500':'border-espresso/10'}`}
              />
              <p className={`text-sm text-right ${wordCount>2000?'text-red-500':'text-espresso/50'}`}>
                {wordCount} / 2000 words
              </p>
            </div>

  {/* TERMS */}
<h1 className="label-uppercase text-gold">
  Step 7 — Confirmation
</h1>

<div className="order-form-field" data-field="agreeTerms">
  <label
    className={`flex items-start gap-3 cursor-pointer ${
      errors.agreeTerms
        ? "border border-red-500 p-4 rounded-xl"
        : ""
    }`}
  >
    <input
      type="checkbox"
      checked={formData.agreeTerms}
      onChange={(e) =>
        handleChange("agreeTerms", e.target.checked)
      }
      className="mt-1 w-5 h-5 md:w-6 md:h-6 accent-gold cursor-pointer"
    />

    <span className="order-heading text-sm md:text-base leading-relaxed">
      I confirm that I have read and agree to the{" "}
<Link to="/legal/terms" target="_blank" className="text-gold underline">
  Terms & Conditions
</Link>,{" "}
<Link to="/legal/privacy" target="_blank" className="text-gold underline">
  Privacy Policy
</Link>, and{" "}
<Link to="/legal/refund" target="_blank" className="text-gold underline">
  Refund Policy
</Link>{" "}
of My Custom Beats, and understand that this is a personalised, made-to-order digital product.

      <span className="text-xs text-ivory/50 block mt-2">
        By proceeding, you also confirm that your submission
        does not contain offensive, political, abusive,
        or inappropriate content.
      </span>
    </span>
  </label>

  {errors.agreeTerms && (
    <p className="text-red-500 text-xs mt-2">
      {errors.agreeTerms}
    </p>
  )}
</div>

             <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-espresso text-white rounded-full transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>Processing Secure Payment...</>
              ) : (
                <>Proceed to Secure Payment</>
              )}
            </button>
<p className="text-sm text-black/50 mt-2">
  Limited production slots each week
</p>

            <p className="order-heading text-sm text-center text-espresso/50">
              <Info size={14} className="inline mr-1" />
              No lyrics required. Just memories.
            </p>

          </form>
        </div>
      </div>
    </div>
  );
};

export default OrderFormSection;