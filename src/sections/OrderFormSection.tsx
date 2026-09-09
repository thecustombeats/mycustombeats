
import { useEffect, useRef, useState } from 'react';
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
import { buildMemory } from "../lib/memory";
import YourMemorySummary from "../components/YourMemorySummary";
import MusicStyleSelector from "../components/MusicStyleSelector";
import {
  MAX_STYLE_LABEL_LENGTH,
  OTHER_STYLE_VALUE,
} from "../data/musicStyles";
import { revealOnScroll } from "../lib/scrollReveal";
import { trackEvent } from "../lib/analytics";
import { createCheckoutSession } from "../lib/checkoutSession";

const moodsList = [
  'Romantic','Adventurous','Relaxed','Upbeat','Celebration',
  'Nostalgia','Gratitude','Calm','Excitement','Reflection','Cinematic'
];

/* ------------------------------------------------------------------ */
/* Field accessibility                                                 */
/* ------------------------------------------------------------------ */

/**
 * WHY THESE EXIST
 *
 * Every control on this form was labelled by its `placeholder` alone, and the
 * genre select had no accessible name at all. A placeholder is not a label:
 * it is a hint that DISAPPEARS the moment someone types, so a screen-reader
 * user reviewing a half-completed form hears "edit text, blank" with no way
 * to find out what the field wanted, and anyone relying on magnification
 * loses the only description of the field they were filling in.
 *
 * The errors were worse. They were rendered as ordinary paragraphs next to
 * the input, visually adjacent and programmatically unrelated — so a screen
 * reader announced the invalid field exactly as it announced a valid one, and
 * never read the reason.
 *
 * The fix keeps the design exactly as it is. Labels are real `<label>`
 * elements that are visually hidden, so the placeholders still carry the
 * visible design and assistive technology gets a stable name underneath it.
 */

/** Stable DOM ids, derived from the field name so they cannot drift apart. */
const fieldId = (name: string) => `order-${name}`;
const fieldErrorId = (name: string) => `order-${name}-error`;

/**
 * ARIA wiring for one control.
 *
 * `aria-invalid` marks the field itself as failing; `aria-describedby` points
 * at the message explaining why, so both are announced together on focus.
 * Both are omitted entirely when valid rather than set to "false", which
 * keeps the rendered markup honest about which fields are actually in error.
 */
const fieldAria = (name: string, error?: string) => ({
  id: fieldId(name),
  ...(error
    ? { "aria-invalid": true as const, "aria-describedby": fieldErrorId(name) }
    : {}),
});

/**
 * The accessible name for a control, hidden from sight.
 *
 * `sr-only` rather than `hidden` or `display:none` — a hidden label is not
 * read by anything and would leave the field exactly as nameless as before.
 */
const FieldLabel = ({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) => (
  <label htmlFor={fieldId(name)} className="sr-only">
    {children}
  </label>
);

/**
 * One field's error message, tied to the control that owns it.
 *
 * `role="alert"` so it is announced when it appears after a failed submit,
 * not only when the field is next focused.
 */
const FieldError = ({
  name,
  message,
  className = "text-red-500 text-xs mt-1",
}: {
  name: string;
  message?: string;
  className?: string;
}) =>
  message ? (
    <p id={fieldErrorId(name)} role="alert" className={className}>
      {message}
    </p>
  ) : null;

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

/**
 * YOUR MEMORY, resolved from the current selection.
 *
 * The panel below renders this rather than reading formData itself, so what
 * the customer is shown and what the memory model computes cannot disagree.
 * No enhancements are passed: none can be charged through a fixed Payment
 * Link, so none is offered here. See lib/memory.ts for why.
 */
const memory = buildMemory({
  packageId: formData.package || null,
  formatId: formData.format || null,
});

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    /**
     * Reveal that cannot leave the form invisible.
     *
     * This was a bare `gsap.fromTo(..., { opacity: 0 }, ...)`. `fromTo`
     * renders its from-state synchronously, but the tween that clears it is
     * driven by GSAP's ticker, which runs on requestAnimationFrame — and rAF
     * does not fire while `document.visibilityState === "hidden"`. So a form
     * mounted in a background tab (opened via middle-click, "open in new
     * tab", or session restore) had `opacity: 0` written and nothing to
     * remove it: the entire order form, from "Get started" through the
     * consent row to the submit button, stayed blank.
     *
     * `revealOnScroll` keeps the same GSAP architecture but makes visibility
     * the guaranteed end state — it hides only from JavaScript, recomputes
     * trigger positions after late layout shifts, honours reduced motion, and
     * runs a failsafe that shows everything regardless. `gsap.set` and
     * `setTimeout` both work in a hidden tab, so the failsafe fires there too.
     *
     * The y-offsets, durations and stagger are the previous values.
     */
    const cleanups = [
      revealOnScroll(section, '.order-heading', { y: 30, duration: 0.4, stagger: 0 }),
      revealOnScroll(section, '.order-form-field', { y: 20, duration: 0.3, stagger: 0.05 }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, []);

  /**
   * Music-style analytics. Three events, and nothing else.
   *
   * WHAT IS DELIBERATELY NOT SENT: the customer's story, their personal
   * touches, their custom style text, and anything identifying them. A style
   * id is a product fact — "people pick Jazz" — and is all that is useful.
   * Free text a customer typed is their words, and it does not go to GA.
   *
   * `style_id` is the stable catalogue id, not the label, so renaming a label
   * for customers does not fragment a year of reporting.
   */
  const handleStyleEvent = (
    event: "style_selected" | "mcb_choice_selected" | "explore_opened",
    styleId?: string
  ) => {
    trackEvent(`music_${event}`, styleId ? { style_id: styleId } : undefined);
  };

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

  /**
   * MUSICAL STYLE.
   *
   * "Let MCB choose" is a real answer, so it satisfies this rule the same way
   * a named style does — `genre` holds "MCB Choice", which is truthy. Nothing
   * special-cases it, and nothing substitutes a plausible-sounding style in
   * its place.
   */
  if (!formData.genre)
    newErrors.genre = "Choose a musical style, or let MCB choose for you";

  if (formData.genre === OTHER_STYLE_VALUE) {
    if (!formData.otherGenre.trim())
      newErrors.otherGenre = "Tell us the style you have in mind";
    // The server column is 120 characters and rejects anything longer with a
    // 422, which would lose the CRM record silently. Caught here instead.
    else if (formData.otherGenre.trim().length > MAX_STYLE_LABEL_LENGTH)
      newErrors.otherGenre = `Please keep this under ${MAX_STYLE_LABEL_LENGTH} characters`;
  }

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

      /**
       * Focus the CONTROL, not the wrapper.
       *
       * `data-field` sits on a plain <div> for most fields, and a div is not
       * focusable — so `element.focus()` silently did nothing and a keyboard
       * or screen-reader user was scrolled to the problem without being put
       * in it, hearing no error at all. Where the marker is on the control
       * itself, `closest` finds it and this behaves exactly as before.
       */
      /**
       * Buttons count as controls here.
       *
       * Two required fields — preferred contact and mood — are groups of
       * <button>s, not inputs, so a selector that looked only for
       * `input, select, textarea` found nothing and focus silently stayed put.
       * Those were exactly the fields a customer could get stuck on, since
       * neither showed a message either. A checked radio is preferred over the
       * first one so focus lands on the current answer rather than resetting
       * the customer to the start of the group.
       */
      const SELECTOR = "input, select, textarea, button";
      const control = element.matches(SELECTOR)
        ? element
        : element.querySelector<HTMLElement>("input:checked") ??
          element.querySelector<HTMLElement>(SELECTOR);

      (control ?? element).focus();
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

  /**
   * The vinyl pressing, derived from the package's song count.
   *
   * Fulfilment cannot press a record without knowing which record: a four-song
   * Journey is 2 × 10-inch or 1 × 12-inch, and a six-song Heirloom is a single
   * 12-inch. The customer is not asked to choose — the business has not
   * approved a customer-facing pressing choice — so the recommended
   * configuration is derived and passed to operations. Empty for non-vinyl.
   *
   * Ancillary only. Nothing here reaches Stripe or affects what is charged.
   */
  zapierData.append("vinylPressing", memory.pressing?.label ?? "");

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

  /**
   * Server-created Checkout Session, if it is switched on.
   *
   * DORMANT: the flag is off, so this returns immediately without a network
   * call and `finalUrl` — the existing Payment Link — is what the customer
   * gets. The live payment path is unchanged.
   */
  const session = await createCheckoutSession({
    packageId: selectedPackage,
    formatId: orderedFormat,
    orderId: crmOrderId,
    // No basket UI exists yet, so this is always a base-package checkout and
    // the Payment Link fallback below stays permitted. When Complete Your
    // Memory populates `items`, the same call starts refusing to fall back.
  });

  if (session.ok) {
    window.location.href = session.url;
    return;
  }

  /**
   * THE FALLBACK GUARD.
   *
   * A fixed Payment Link charges one fixed amount. Falling back to one is
   * safe only while the basket is exactly what that link sells — the base
   * package. For anything more, sending the customer there would take the
   * package price for a larger order and report success: MCB would ship
   * £449 of goods against a £79 payment, and the order, the reference and
   * the confirmation email would all look perfectly healthy.
   *
   * `mayFallBackToPaymentLink` decides by basket shape, not by error type,
   * and this branch honours it. Today it is always true; it is written now
   * so the basket sprint cannot forget it.
   */
  if (session.fallbackAllowed) {
    window.location.href = finalUrl;
    return;
  }

  setSubmitError(
    "We couldn't start checkout just now. Your details are saved and nothing has been charged — please try again in a moment, or contact us and we'll complete your order personally."
  );
  setIsSubmitting(false);
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
    <div>
      <FieldLabel name="firstName">First name (required)</FieldLabel>
      <input
        name="firstName"
        data-field="firstName"
        placeholder="First Name *"
        autoComplete="given-name"
        value={formData.firstName}
        onChange={(e) => handleChange("firstName", e.target.value)}
        {...fieldAria("firstName", errors.firstName)}
        className={`w-full px-4 py-3 border rounded-xl ${
          errors.firstName ? 'border-red-500' : 'border-espresso/10'
        }`}
      />
      <FieldError name="firstName" message={errors.firstName} />
    </div>

    <div>
      <FieldLabel name="lastName">Last name (required)</FieldLabel>
      <input
        name="lastName"
        data-field="lastName"
        placeholder="Last Name *"
        autoComplete="family-name"
        value={formData.lastName}
        onChange={(e) => handleChange("lastName", e.target.value)}
        {...fieldAria("lastName", errors.lastName)}
        className={`w-full px-4 py-3 border rounded-xl ${
          errors.lastName ? 'border-red-500' : 'border-espresso/10'
        }`}
      />
      <FieldError name="lastName" message={errors.lastName} />
    </div>
  </div>

  {/* Email */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div>
      <FieldLabel name="email">Email address (required)</FieldLabel>
      <input
        name="email"
        data-field="email"
        type="email"
        placeholder="Email Address *"
        autoComplete="email"
        value={formData.email}
        onChange={(e) => handleChange("email", e.target.value)}
        {...fieldAria("email", errors.email)}
        className={`w-full px-4 py-3 border rounded-xl ${
          errors.email ? 'border-red-500' : 'border-espresso/10'
        }`}
      />
      <FieldError name="email" message={errors.email} />
    </div>

    {/* WhatsApp */}
<div className="order-form-field" data-field="whatsapp">
  <FieldLabel name="whatsapp">
    WhatsApp number, including country code (required)
  </FieldLabel>
  <input
    name="whatsapp"
    placeholder="WhatsApp (+country code) *"
    autoComplete="tel"
    inputMode="tel"
    value={formData.whatsapp}
    onChange={(e) => handleChange("whatsapp", e.target.value)}
    {...fieldAria("whatsapp", errors.whatsapp)}
    className={`w-full px-4 py-3 border rounded-xl ${
      errors.whatsapp
        ? "border-red-500"
        : "border-espresso/10"
    }`}
  />

  <FieldError name="whatsapp" message={errors.whatsapp} />
</div>
</div>
</div>

{/*
  Preferred Contact Method.

  THIS WAS A FORM TRAP. The field is required, but a failed submit rendered
  no message anywhere — only a red border. Nothing was announced, nothing was
  associated, and the focus helper skipped it entirely because it looks for
  `input, select, textarea` and these are buttons. A customer could be blocked
  from checkout with no stated reason, and a screen-reader user with no signal
  at all.

  Brought to the same standard as the mood group: a named group, buttons that
  report their own pressed state, and an error that is both visible and tied
  to the group. No visual redesign.
*/}
<div className="order-form-field space-y-3">
  <div
    data-field="preferredContact"
    role="group"
    aria-labelledby="order-preferred-contact-label"
    {...(errors.preferredContact
      ? {
          "aria-invalid": true,
          "aria-describedby": fieldErrorId("preferredContact"),
        }
      : {})}
    className={`${errors.preferredContact ? 'border border-red-500 p-3 rounded-xl' : ''}`}
  >
    <div className="flex flex-wrap gap-3 items-center">
      <span
        id="order-preferred-contact-label"
        className="order-heading text-sm text-espresso/60"
      >
        Preferred contact: *
      </span>

      {contactMethods.map((method) => (
        <button
          key={method}
          type="button"
          aria-pressed={formData.preferredContact === method}
          onClick={() =>
            setFormData({ ...formData, preferredContact: method })
          }
          className={`min-h-11 px-4 py-2 rounded-full text-sm transition-all duration-fast ${
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

  <FieldError
    name="preferredContact"
    message={errors.preferredContact}
  />
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
        <FieldLabel name="shippingName">Recipient name (required)</FieldLabel>
        <input
          name="shippingName"
          placeholder="Recipient name *"
          value={formData.shippingName}
          onChange={(e) => handleChange("shippingName", e.target.value)}
          autoComplete="name"
          {...fieldAria("shippingName", errors.shippingName)}
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingName ? "border-red-500" : "border-espresso/10"
          }`}
        />
        <FieldError name="shippingName" message={errors.shippingName} />
      </div>

      <div data-field="shippingAddress">
        <FieldLabel name="shippingAddress">Delivery address (required)</FieldLabel>
        <input
          name="shippingAddress"
          placeholder="Address *"
          value={formData.shippingAddress}
          onChange={(e) => handleChange("shippingAddress", e.target.value)}
          autoComplete="street-address"
          {...fieldAria("shippingAddress", errors.shippingAddress)}
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingAddress ? "border-red-500" : "border-espresso/10"
          }`}
        />
        <FieldError name="shippingAddress" message={errors.shippingAddress} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div data-field="shippingCity">
          <FieldLabel name="shippingCity">Town or city (required)</FieldLabel>
          <input
            name="shippingCity"
            placeholder="Town or city *"
            value={formData.shippingCity}
            onChange={(e) => handleChange("shippingCity", e.target.value)}
            autoComplete="address-level2"
            {...fieldAria("shippingCity", errors.shippingCity)}
            className={`w-full px-4 py-3 border rounded-xl ${
              errors.shippingCity ? "border-red-500" : "border-espresso/10"
            }`}
          />
          <FieldError name="shippingCity" message={errors.shippingCity} />
        </div>

        <div data-field="shippingPostcode">
          <FieldLabel name="shippingPostcode">Postcode or ZIP (required)</FieldLabel>
          <input
            name="shippingPostcode"
            placeholder="Postcode or ZIP *"
            value={formData.shippingPostcode}
            onChange={(e) => handleChange("shippingPostcode", e.target.value)}
            autoComplete="postal-code"
            {...fieldAria("shippingPostcode", errors.shippingPostcode)}
            className={`w-full px-4 py-3 border rounded-xl ${
              errors.shippingPostcode ? "border-red-500" : "border-espresso/10"
            }`}
          />
          <FieldError name="shippingPostcode" message={errors.shippingPostcode} />
        </div>
      </div>

      <div data-field="shippingCountry">
        <FieldLabel name="shippingCountry">Country (required)</FieldLabel>
        <input
          name="shippingCountry"
          placeholder="Country *"
          value={formData.shippingCountry}
          onChange={(e) => handleChange("shippingCountry", e.target.value)}
          autoComplete="country-name"
          {...fieldAria("shippingCountry", errors.shippingCountry)}
          className={`w-full px-4 py-3 border rounded-xl ${
            errors.shippingCountry ? "border-red-500" : "border-espresso/10"
          }`}
        />
        <FieldError name="shippingCountry" message={errors.shippingCountry} />
      </div>
    </div>
  </div>
)}


{/* MOOD */}
<div className="order-form-field space-y-4">
  <h3 id="order-moods-heading" className="label-uppercase text-gold-deep">
    Step 3 — Mood
  </h3>

  {/* A group with a name, and buttons that report their own state.
      Without aria-pressed a selected mood was announced identically to an
      unselected one — the only signal was the colour change. */}
  <div
    data-field="moods"
    role="group"
    aria-labelledby="order-moods-heading"
    {...(errors.moods
      ? { "aria-invalid": true, "aria-describedby": fieldErrorId("moods") }
      : {})}
    className={`${
      errors.moods ? 'border border-red-500 p-3 rounded-xl' : ''
    } flex flex-wrap gap-3`}
  >
    {moodsList.map((mood) => (
      <button
        key={mood}
        type="button"
        aria-pressed={formData.moods.includes(mood)}
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
      aria-pressed={showOtherMood}
      onClick={() => handleMoodToggle('Other')}
      className="px-4 py-2 rounded-full text-sm bg-ivory border border-espresso/10"
    >
      Other
    </button>
  </div>

  <FieldError name="moods" message={errors.moods} />

  {showOtherMood && (
    <>
      <FieldLabel name="otherMood">Tell us the mood</FieldLabel>
      <input
        name="otherMood"
        placeholder="Enter your mood..."
        value={formData.otherMood}
        onChange={(e) => handleChange("otherMood", e.target.value)}
        {...fieldAria("otherMood")}
        className="w-full px-4 py-3 border border-espresso/10 rounded-xl"
      />
    </>
  )}
</div>

            {/*
              MUSICAL STYLE — the MCB Music Style Experience.
              Replaces a nine-option <select> labelled "Genre".

              THE STATE AND THE PAYLOAD ARE UNCHANGED. It still writes to
              `formData.genre` and `formData.otherGenre`, still treats
              `genre === "Other"` as the free-text sentinel, and still submits
              one string. So `/api/order`, `orders.brief_genre` and the
              fulfilment webhook see exactly the shape they always have — only
              the range of values widened, and one new explicit value,
              "MCB Choice", was added. No schema or endpoint changed.
            */}
            <MusicStyleSelector
              value={formData.genre}
              onChange={(next) => handleChange("genre", next)}
              customValue={formData.otherGenre}
              onCustomChange={(next) => handleChange("otherGenre", next)}
              error={errors.genre}
              customError={errors.otherGenre}
              fieldId={fieldId("genre")}
              errorId={fieldErrorId("genre")}
              customFieldId={fieldId("otherGenre")}
              customErrorId={fieldErrorId("otherGenre")}
              onEvent={handleStyleEvent}
            />

            {/* Step 4: Personal Touches */}
<div className="order-form-field space-y-4">
  <h3 className="label-uppercase text-gold-deep">
    Step 5 — Personal Touches (Optional)
  </h3>

  <FieldLabel name="personalTouches">
    Personal touches — names, dates or phrases to include (optional)
  </FieldLabel>
  <input
    name="personalTouches"
    type="text"
    placeholder="Names, dates, phrases to include..."
    value={formData.personalTouches}
    onChange={(e) => handleChange("personalTouches", e.target.value)}
    {...fieldAria("personalTouches")}
    className="w-full px-4 py-3 bg-ivory border border-espresso/10 rounded-xl text-espresso placeholder:text-espresso/40 focus:outline-none focus:ring-2 focus:ring-gold/30 transition-all duration-fast"
  />

  {/* Hidden File Input.
      `display: none` keeps it out of the accessibility tree entirely, so the
      Browse button below is what a keyboard or screen-reader user actually
      reaches. It is named anyway, for any tool that surfaces it regardless. */}
  <input
    type="file"
    accept="image/png, image/jpeg"
    id="artworkUpload"
    aria-label="Album artwork image file"
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

    {/* The real control, as far as assistive technology is concerned — so it
        carries the description and the error, not the hidden input. "Browse"
        alone gave no clue what was being browsed for. */}
    <button
      type="button"
      aria-label="Browse for album artwork to upload"
      {...(errors.artwork
        ? { "aria-invalid": true, "aria-describedby": fieldErrorId("artwork") }
        : {})}
      onClick={() =>
        document.getElementById('artworkUpload')?.click()
      }
      className="px-4 py-2 bg-white rounded-lg text-sm text-espresso hover:bg-gold hover:text-espresso transition-colors duration-fast"
    >
      Browse
    </button>
  </div>

  <FieldError name="artwork" message={errors.artwork} />
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
              <FieldLabel name="story">
                Your story (required, up to 2000 words)
              </FieldLabel>
              <textarea
                name="story"
                data-field="story"
                placeholder="Tell us about your journey, your celebration, your story *"
                value={formData.story}
                onChange={(e) => handleChange("story", e.target.value)}
                id={fieldId("story")}
                {...(errors.story ? { "aria-invalid": true } : {})}
                /* Always describes the field, so the running word count is
                   announced alongside any error rather than replacing it. */
                aria-describedby={`${fieldErrorId("story")} order-story-count`}
                className={`w-full h-48 px-4 py-3 border rounded-xl ${errors.story?'border-red-500':'border-espresso/10'}`}
              />
              <FieldError name="story" message={errors.story} />
              <p
                id="order-story-count"
                aria-live="polite"
                className={`text-sm text-right ${wordCount>2000?'text-red-500':'text-espresso/50'}`}
              >
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

            {/*
              ---- YOUR MEMORY: core package + format + enhancements ----

              Deliberately NOT given the `order-form-field` class.

              The reveal above is now failsafe-backed, so this is no longer
              load-bearing — but the panel states the price the customer is
              about to be charged, and there is no reason to put any animation
              between that number and the customer. It renders immediately.
            */}
            <YourMemorySummary memory={memory} />

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
                <>Taking you to secure checkout...</>
              ) : (
                <>Continue to Checkout</>
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