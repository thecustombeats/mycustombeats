
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Upload, Info, Check } from 'lucide-react';
import { Link } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  PACKAGES,
  FORMATS,
  getPackage,
  getCheckoutTarget,
  isFormatAllowed,
  requiresShippingAddress,
  formatPrice,
  type FormatId,
} from "../data/packages";

gsap.registerPlugin(ScrollTrigger);

const moodsList = [
  'Romantic','Adventurous','Relaxed','Upbeat','Celebration',
  'Nostalgia','Gratitude','Calm','Excitement','Reflection','Cinematic'
];

/**
 * Order-capture endpoints. These are ANCILLARY: they record the order for
 * fulfilment and automation. They must never gate the customer's payment.
 *
 * THIS FIRES BEFORE PAYMENT, AND MUST NOT EMAIL THE CUSTOMER.
 *
 * It runs at form submission, so at this point the customer has not paid,
 * the order is PENDING, and no MCB reference exists — the reference is
 * issued by the Stripe webhook when the money is confirmed. A scenario that
 * emails from here therefore cannot include the reference, and also mails
 * everyone who abandons checkout.
 *
 * The customer's confirmation email is now sent server-side, after payment,
 * by the Stripe webhook (see api/lib/notify.php). The payload below carries
 * `stage: "SUBMITTED"` so the receiving scenario can route on it and keep
 * its non-email work — logging, operations, fulfilment prep — while leaving
 * customer correspondence to the post-payment trigger.
 *
 * The local bridge is a developer convenience only. It is compiled out of
 * production builds so a machine-local service can never sit in front of
 * a customer's checkout.
 */
const MAKE_WEBHOOK_URL =
  "https://hook.eu1.make.com/yrw2uhttk8p3kpjxsy5pks3wgwjpc7ru";
const DEV_BRIDGE_URL = "http://localhost:18888/webhook/order";

/** Abandon an ancillary request rather than leave the customer waiting. */
const WEBHOOK_TIMEOUT_MS = 8000;
const CRM_TIMEOUT_MS = 6000;

/**
 * Largest artwork the form accepts — the same limit the upload row advertises.
 *
 * Checked here as well as at Cloudinary because the two failures look nothing
 * alike to a customer. Rejected at the preset, an oversized file uploads in
 * full, is refused, and the order continues with an empty artworkUrl and no
 * message — the customer believing their photo was attached. Rejected here, it
 * never leaves the browser and they are told immediately.
 */
const MAX_ARTWORK_BYTES = 10 * 1024 * 1024;

const ancillaryWebhookUrls = (): string[] =>
  import.meta.env.DEV ? [DEV_BRIDGE_URL, MAKE_WEBHOOK_URL] : [MAKE_WEBHOOK_URL];

/**
 * Posts order data to one ancillary endpoint. Always resolves — never throws,
 * never rejects — so no caller can be blocked by an outage here.
 */
const postOrderData = async (url: string, data: FormData): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: data,
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    // Swallowed deliberately: order capture is best-effort, checkout is not.
    return false;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Records the order in MCB's own CRM and returns its id.
 *
 * Best-effort by design, exactly like the fulfilment webhooks: a CRM outage
 * must never stop someone paying. If the endpoint is not deployed yet, or
 * fails, this returns null and checkout still proceeds — but Stripe is then
 * sent no `client_reference_id` at all, rather than a substitute.
 *
 * The browser sends what it observed. The server decides what it means:
 * fulfilment type, attribution, amount and status are all derived there, and
 * nothing posted from here can nominate an affiliate or mark an order paid.
 */
const recordOrderInCrm = async (payload: Record<string, unknown>): Promise<number | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CRM_TIMEOUT_MS);

  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.order_id === "number" ? data.order_id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

/**
 * Packages with a single format have nothing to choose, so it is selected for
 * the customer. Packages with several start empty and must be chosen.
 */
const defaultFormatFor = (packageId: string): string => {
  const pkg = getPackage(packageId);
  if (!pkg) return "";
  return pkg.formats.length === 1 ? pkg.formats[0] : "";
};

const contactMethods = ['Email', 'WhatsApp', 'Phone'];
type FormDataType = {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  preferredContact: string;
  package: string;
  /** One of the selected package's allowed formats. */
  format: string;
  /** Collected only when the chosen format is physical. */
  shippingName: string;
  shippingAddress: string;
  shippingCity: string;
  shippingPostcode: string;
  shippingCountry: string;
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

  /**
   * The single authoritative referral source.
   *
   * This previously read a `ref` cookie that nothing in the application ever
   * wrote, so every order reported an empty referral to fulfilment while the
   * Stripe hand-off used localStorage and worked. One source now, written by
   * App.tsx when a visitor arrives on ?ref= / ?partner=.
   */
  const getRef = () => localStorage.getItem("referral") || "";
  const getPartner = () => localStorage.getItem("partner") || "";
  const sectionRef = useRef<HTMLDivElement>(null);

  const [showOtherMood, setShowOtherMood] = useState(false);

  const [formData, setFormData] = useState<FormDataType>({
  firstName: '',
  lastName: '',
  email: '',
  whatsapp: '',
  preferredContact: '',
  package: '',
  format: '',
  shippingName: '',
  shippingAddress: '',
  shippingCity: '',
  shippingPostcode: '',
  shippingCountry: '',
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
/** Reserved for genuine purchase-path failures only. */
const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
  if (selectedPackage) {
    setFormData((prev) => ({
      ...prev,
      package: selectedPackage,
      // A format from a previous package may not be sold with this one.
      format: defaultFormatFor(selectedPackage),
    }));
  }
}, [selectedPackage]);

// The package currently being ordered, and everything derived from it.
const activePackage = getPackage(formData.package);
const availableFormats = activePackage?.formats ?? [];
const offersFormatChoice = availableFormats.length > 1;
const needsShipping = activePackage
  ? requiresShippingAddress(activePackage, formData.format)
  : false;

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

  // Format must be one this package actually sells — never trust the value
  // alone, since it survives a package change until reset.
  const pkg = getPackage(formData.package);
  if (pkg && pkg.formats.length > 0) {
    if (!formData.format) {
      newErrors.format = "Please choose how you'd like to receive your music";
    } else if (!isFormatAllowed(pkg, formData.format)) {
      newErrors.format = `${pkg.name} isn't available in that format`;
    }
  }

  // Physical formats have to go somewhere.
  if (pkg && requiresShippingAddress(pkg, formData.format)) {
    if (!formData.shippingName.trim())
      newErrors.shippingName = "Recipient name is required";
    if (!formData.shippingAddress.trim())
      newErrors.shippingAddress = "Delivery address is required";
    if (!formData.shippingCity.trim())
      newErrors.shippingCity = "Town or city is required";
    if (!formData.shippingPostcode.trim())
      newErrors.shippingPostcode = "Postcode or ZIP is required";
    if (!formData.shippingCountry.trim())
      newErrors.shippingCountry = "Country is required";
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

  if (isSubmitting) return;

  setSubmitError(null);

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

  // Commercial values come from the central package data — never a local copy.
  const orderedPackage = getPackage(selectedPackage);

  if (!orderedPackage) {
    setSubmitError(
      "We couldn't identify that package. Please reselect your experience and try again."
    );
    setIsSubmitting(false);
    return;
  }

  const finalPrice = orderedPackage.price.gbp;

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
  zapierData.append("packageName", orderedPackage.name);
  zapierData.append("price", String(finalPrice));
  zapierData.append("priceGBP", String(orderedPackage.price.gbp));
  zapierData.append("priceUSD", String(orderedPackage.price.usd));
  zapierData.append("delivery", orderedPackage.delivery);

  // Format must survive through to fulfilment — it determines what gets made.
  const orderedFormat = formData.format;
  zapierData.append("format", orderedFormat);
  zapierData.append(
    "formatName",
    orderedFormat ? FORMATS[orderedFormat as FormatId].name : ""
  );

  const shipping = requiresShippingAddress(orderedPackage, orderedFormat);
  zapierData.append("requiresShipping", String(shipping));

  if (shipping) {
    zapierData.append("shippingName", formData.shippingName);
    zapierData.append("shippingAddress", formData.shippingAddress);
    zapierData.append("shippingCity", formData.shippingCity);
    zapierData.append("shippingPostcode", formData.shippingPostcode);
    zapierData.append("shippingCountry", formData.shippingCountry);
  }
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

  // ---------------------------------------------------------------
  // PAYMENT PATH FIRST.
  // Resolve the checkout destination before contacting any ancillary
  // service, so a webhook/automation outage can never be mistaken for
  // — or turn into — a payment failure.
  // ---------------------------------------------------------------
  const checkout = getCheckoutTarget(orderedPackage, orderedFormat);

  if (!checkout?.url) {
    // Either an unsold combination, or a Payment Link that has not been
    // created yet. Refuse the sale rather than strand the customer on a
    // dead checkout page.
    setSubmitError(
      `${orderedPackage.name}${
        orderedFormat ? ` on ${FORMATS[orderedFormat as FormatId].name}` : ""
      } can't be checked out online just yet. Please contact us and we'll complete your order personally — your details are safe and nothing has been charged.`
    );
    setIsSubmitting(false);
    return;
  }

  const stripeUrl = checkout.url;

  // MCB's own record first, so the order id can identify this purchase to
  // Stripe. Non-blocking: null simply means we fall back to today's behaviour.
  const crmOrderId = await recordOrderInCrm({
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    whatsapp: formData.whatsapp,
    package: selectedPackage,
    format: orderedFormat,
    shippingName: formData.shippingName,
    shippingAddress: formData.shippingAddress,
    shippingCity: formData.shippingCity,
    shippingPostcode: formData.shippingPostcode,
    shippingCountry: formData.shippingCountry,
    mood: formData.otherMood
      ? [...formData.moods, formData.otherMood].join(", ")
      : formData.moods.join(", "),
    genre: formData.genre === "Other" ? formData.otherGenre : formData.genre,
    personalTouches: formData.personalTouches,
    story: formData.story,
    artworkUrl: artworkUpload || "",
    referral: ref,
    partner: getPartner(),
  });

  if (crmOrderId !== null) {
    zapierData.append("mcbOrderId", String(crmOrderId));
  }

  // Marks this as the PRE-payment capture. The post-payment notification
  // sends `event: "order.paid"` and carries the MCB reference; nothing sent
  // from the browser ever does, because at this moment it does not exist.
  zapierData.append("stage", "SUBMITTED");
  zapierData.append("paymentConfirmed", "false");

  // Ancillary order capture. Every attempt is isolated: a rejection here
  // is recorded and ignored, never propagated to the customer.
  await Promise.allSettled(
    ancillaryWebhookUrls().map((url) => postOrderData(url, zapierData))
  );

  // STRIPE

  // Carried to the thank-you page for conversion tracking and confirmation.
  localStorage.setItem("last_order_package", formData.package);
  localStorage.setItem("last_order_format", orderedFormat);

  // The order id is the join between customer, order, attribution, format,
  // delivery and payment, so Stripe carries it when the CRM recorded one.
  //
  // When the CRM did not, the parameter is OMITTED rather than filled with a
  // substitute. It previously fell back to the referral string, which is read
  // from localStorage and so is chosen by the visitor: a numeric one casts to
  // a real order id in the webhook, letting a genuine payment mark someone
  // else's order PAID and credit that order's affiliate. Sending nothing
  // leaves the webhook with no match, which it already handles.
  const finalUrl =
    crmOrderId !== null
      ? `${stripeUrl}?client_reference_id=${encodeURIComponent(String(crmOrderId))}`
      : stripeUrl;

  window.location.href = finalUrl;
};

  return (
    
    <div ref={sectionRef} id="order" className="relative w-full bg-misty-stone py-24">
      <div className="px-[7vw]">
        <div className="order-form-field max-w-3xl mx-auto">

          <div className="order-heading text-center mb-10">
  <p className="label-uppercase text-gold-deep mb-3">Get Started</p>
  <h2 
    className="order-heading text-4xl md:text-5xl text-espresso mb-4"
  >
    Tell us your story — we’ll turn it into something unforgettable
  </h2>
  <p 
    className="order-heading text-espresso/60"
  >
    Most clients hear back within 12 hours with a concept & pricing.
 </p>

    <p 
    className="order-heading text-espresso/60"
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
  <h3 className="label-uppercase text-gold-deep">
    Step 1 — Contact Details
  </h3>

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
<h3 className="label-uppercase text-gold-deep">
  Step 2 — Package Selection
</h3>

<div
  data-field="package"
  className={`package-card ${
    errors.package ? "border-red-500 border-2 p-3 rounded-xl" : ""
  }`}
>
  <div className="flex flex-wrap gap-3">
    {PACKAGES.map((pkg) => (
      <button
        key={pkg.id}
        type="button"
        aria-pressed={formData.package === pkg.id}
        onClick={() =>
          setFormData((prev) => ({
            ...prev,
            package: pkg.id,
            // Reset the format: the previous choice may not be sold here.
            format: defaultFormatFor(pkg.id),
          }))
        }
        className={`px-5 py-3 rounded-xl transition-all text-left ${
          formData.package === pkg.id
            ? "bg-gold text-ink"
            : "bg-ivory border border-espresso/10 text-espresso/70 hover:border-gold"
        }`}
      >
        <div className="font-medium">{pkg.name}</div>
        <div className="text-sm opacity-70">
          {formatPrice(pkg)}
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

{/* ---- Format: only where there is genuinely a choice to make ---- */}
{activePackage && availableFormats.length > 0 && (
  <div className="order-form-field space-y-4 pt-2">
    <div>
      <h3 className="label-uppercase text-gold-deep">
        {offersFormatChoice ? "How would you like to receive it?" : "How it arrives"}
      </h3>
      {offersFormatChoice && (
        <p className="text-sm text-espresso/60 mt-2">
          Every format costs the same — choose whichever you'd rather hold.
        </p>
      )}
    </div>

    {offersFormatChoice ? (
      <div data-field="format">
        <RadioGroup
          value={formData.format}
          onValueChange={(value) => handleChange("format", value)}
          aria-label={`Format for ${activePackage.name}`}
          className={`grid gap-3 ${
            availableFormats.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"
          } ${errors.format ? "p-3 rounded-xl border border-red-500" : ""}`}
        >
          {availableFormats.map((formatId) => {
            const format = FORMATS[formatId];
            const isSelected = formData.format === formatId;
            return (
              <label
                key={formatId}
                htmlFor={`format-${formatId}`}
                className={`flex gap-3 items-start cursor-pointer rounded-xl border p-4 transition-all ${
                  isSelected
                    ? "border-gold bg-gold/5"
                    : "border-espresso/10 bg-ivory hover:border-gold/50"
                }`}
              >
                <RadioGroupItem
                  value={formatId}
                  id={`format-${formatId}`}
                  className="mt-1 border-espresso/30 text-gold"
                />
                <span className="flex flex-col gap-1">
                  <span className="font-medium text-espresso text-sm">
                    {format.name}
                  </span>
                  <span className="text-xs text-espresso/60 leading-relaxed">
                    {format.summary}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup>

        {errors.format && (
          <p className="text-red-500 text-sm mt-2">{errors.format}</p>
        )}
      </div>
    ) : (
      <p className="text-sm text-espresso/70 bg-ivory border border-espresso/10 rounded-xl px-4 py-3">
        {FORMATS[availableFormats[0]].name} — {FORMATS[availableFormats[0]].summary}
      </p>
    )}
  </div>
)}

{/* ---- Delivery address: physical formats only ---- */}
{needsShipping && (
  <div className="order-form-field space-y-4 pt-2">
    <div>
      <h3 className="label-uppercase text-gold-deep">Where should we send it?</h3>
      <p className="text-sm text-espresso/60 mt-2">
        We only ask for this because you've chosen something we post to you.
      </p>
    </div>

    <div className="space-y-4">
      <div data-field="shippingName">
        <input
          name="shippingName"
          placeholder="Recipient name *"
          value={formData.shippingName}
          onChange={(e) => handleChange("shippingName", e.target.value)}
          autoComplete="name"
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingName ? "border-red-500" : "border-espresso/10"
          }`}
        />
        {errors.shippingName && (
          <p className="text-red-500 text-xs mt-1">{errors.shippingName}</p>
        )}
      </div>

      <div data-field="shippingAddress">
        <input
          name="shippingAddress"
          placeholder="Address *"
          value={formData.shippingAddress}
          onChange={(e) => handleChange("shippingAddress", e.target.value)}
          autoComplete="street-address"
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingAddress ? "border-red-500" : "border-espresso/10"
          }`}
        />
        {errors.shippingAddress && (
          <p className="text-red-500 text-xs mt-1">{errors.shippingAddress}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div data-field="shippingCity">
          <input
            name="shippingCity"
            placeholder="Town or city *"
            value={formData.shippingCity}
            onChange={(e) => handleChange("shippingCity", e.target.value)}
            autoComplete="address-level2"
            className={`w-full px-4 py-3 border rounded-xl ${
              errors.shippingCity ? "border-red-500" : "border-espresso/10"
            }`}
          />
          {errors.shippingCity && (
            <p className="text-red-500 text-xs mt-1">{errors.shippingCity}</p>
          )}
        </div>

        <div data-field="shippingPostcode">
          <input
            name="shippingPostcode"
            placeholder="Postcode or ZIP *"
            value={formData.shippingPostcode}
            onChange={(e) => handleChange("shippingPostcode", e.target.value)}
            autoComplete="postal-code"
            className={`w-full px-4 py-3 border rounded-xl ${
              errors.shippingPostcode ? "border-red-500" : "border-espresso/10"
            }`}
          />
          {errors.shippingPostcode && (
            <p className="text-red-500 text-xs mt-1">{errors.shippingPostcode}</p>
          )}
        </div>
      </div>

      <div data-field="shippingCountry">
        <input
          name="shippingCountry"
          placeholder="Country *"
          value={formData.shippingCountry}
          onChange={(e) => handleChange("shippingCountry", e.target.value)}
          autoComplete="country-name"
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingCountry ? "border-red-500" : "border-espresso/10"
          }`}
        />
        {errors.shippingCountry && (
          <p className="text-red-500 text-xs mt-1">{errors.shippingCountry}</p>
        )}
      </div>
    </div>
  </div>
)}


{/* MOOD */}
<div className="order-form-field space-y-4">
  <h3 className="label-uppercase text-gold-deep">
    Step 3 — Mood
  </h3>

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
  <h3 className="label-uppercase text-gold-deep">
    Step 4 — Genre
  </h3>

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
  <h3 className="label-uppercase text-gold-deep">
    Step 5 — Personal Touches (Optional)
  </h3>

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

      if (file && file.size > MAX_ARTWORK_BYTES) {
        // Cleared rather than kept, so a rejected file can never reach
        // uploadArtwork. Resetting the input's value lets the customer pick
        // the same file again after resizing it — without it, re-selecting
        // an identical filename fires no change event at all.
        setFormData((prev) => ({ ...prev, artwork: null }));
        setErrors((prev) => ({
          ...prev,
          artwork: `That image is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Please choose one under 10MB.`,
        }));
        e.target.value = "";
        return;
      }

      handleChange("artwork", file);
    }}
  />

  <div
    className={`flex items-center gap-3 p-4 bg-ivory rounded-xl border ${
      errors.artwork ? 'border-red-500' : 'border-espresso/10'
    }`}
  >
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

  {errors.artwork && (
    <p className="text-red-500 text-xs mt-1">{errors.artwork}</p>
  )}
</div>

            {/* STORY */}
            <div className="order-form-field space-y-4">
  <h3 className="label-uppercase text-gold-deep">
    Step 6 — Your Words Matter
  </h3>

  <p 
    className="order-heading text-sm text-espresso/60"
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
<h3 className="label-uppercase text-gold-deep">
  Step 7 — Confirmation
</h3>

<div className="order-form-field" data-field="agreeTerms">
  <label
    className={`flex items-start gap-3 cursor-pointer ${
      errors.agreeTerms
        ? "border border-red-500 p-4 rounded-xl"
        : ""
    }`}
  >
    {/*
      44x44 touch target around a 24x24 control.

      The negative margin is what makes both true at once: the wrapper is
      44px, so a fingertip has the full WCAG 2.5.5 target, but -10px on every
      side means it only OCCUPIES 24px of layout, so the box still sits
      exactly where a 24px checkbox would and the text alignment is
      unchanged. The overhang falls into the gap and the form's padding, so
      it cannot overflow or overlap the copy.
    */}
    <span className="relative -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
      <input
        type="checkbox"
        checked={formData.agreeTerms}
        onChange={(e) =>
          handleChange("agreeTerms", e.target.checked)
        }
        /*
          appearance-none, then drawn explicitly.

          The native control was 20px on mobile and only grew to 24px on
          desktop — backwards, since the finger is on the phone. iOS Safari
          also renders `accent-color` inconsistently and ignores sizing on
          some versions, which is exactly the "inconsistently tiny control"
          this had to stop relying on.

          Semantics are untouched: this is still a real
          <input type="checkbox"> inside its <label>, so the accessibility
          tree, screen-reader announcement, keyboard toggle and form
          behaviour are all native.
        */
        className="peer h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-espresso/40 bg-white transition-colors checked:border-gold-deep checked:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
      />

      {/* Checked state. pointer-events-none so the tick never eats the tap. */}
      <Check
        aria-hidden="true"
        strokeWidth={3.5}
        className="pointer-events-none absolute h-4 w-4 text-white opacity-0 transition-opacity peer-checked:opacity-100"
      />
    </span>

    <span className="order-heading min-w-0 text-sm md:text-base leading-relaxed text-espresso">
      I confirm that I have read and agree to the{" "}
<Link to="/legal/terms" target="_blank" className="text-gold-deep underline">
  Terms & Conditions
</Link>,{" "}
<Link to="/legal/privacy" target="_blank" className="text-gold-deep underline">
  Privacy Policy
</Link>, and{" "}
<Link to="/legal/refund" target="_blank" className="text-gold-deep underline">
  Refund Policy
</Link>{" "}
of My Custom Beats, and understand that this is a personalised, made-to-order digital product.

      {/*
        Was text-ivory/50, which measured 1.04:1 against this white card —
        invisible in practice. espresso/70 is 5.56:1 and passes AA while
        staying visibly secondary to the consent sentence above it.
      */}
      <span className="text-xs text-espresso/70 block mt-2">
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

            {/* ---- Order summary: what am I actually buying? ---- */}
            {activePackage && (
              <section
                aria-labelledby="order-summary-heading"
                className="order-form-field rounded-2xl border border-gold/30 bg-ivory p-6"
              >
                <h3
                  id="order-summary-heading"
                  className="font-serif text-2xl text-espresso mb-1"
                >
                  Your order
                </h3>
                <p className="text-sm text-espresso/60 mb-5">
                  {activePackage.positioning}
                </p>

                <dl className="divide-y divide-espresso/10 text-sm">
                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-espresso/60">Experience</dt>
                    <dd className="text-espresso font-medium text-right">
                      {activePackage.name}
                    </dd>
                  </div>

                  {formData.format && (
                    <div className="flex justify-between gap-6 py-3">
                      <dt className="text-espresso/60">Format</dt>
                      <dd className="text-espresso font-medium text-right">
                        {FORMATS[formData.format as FormatId].name}
                      </dd>
                    </div>
                  )}

                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-espresso/60">Delivery</dt>
                    <dd className="text-espresso text-right">
                      {activePackage.delivery}
                      {needsShipping && (
                        <span className="block text-xs text-espresso/50 mt-0.5">
                          Posted to your delivery address
                        </span>
                      )}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-6 py-3">
                    <dt className="text-espresso/60">Includes</dt>
                    <dd className="text-espresso/80 text-right max-w-xs">
                      {activePackage.songCount
                        ? `${activePackage.songCount} personalised ${
                            activePackage.songCount === 1 ? "song" : "songs"
                          }, ${activePackage.revisions.toLowerCase()}`
                        : activePackage.revisions}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-6 pt-4">
                    <dt className="text-espresso font-medium">Total</dt>
                    <dd className="text-right">
                      <span className="font-serif text-2xl text-espresso">
                        {formatPrice(activePackage)}
                      </span>
                      <span className="text-espresso/50 text-xs ml-2">
                        {formatPrice(activePackage, "usd")}
                      </span>
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {submitError && (
              <p
                role="alert"
                className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
              >
                {submitError}
              </p>
            )}

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