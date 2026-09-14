
import { useEffect, useRef, useState } from 'react';
import { Upload, Info, Check } from 'lucide-react';
import { Link, useSearchParams } from "react-router-dom";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  MAX_UNITS_PER_LINE,
  MULTI_UNIT_PRODUCT_IDS,
  EMPTY_SELECTION,
  chooseProduct,
  orderAddOns,
  previewSelection,
  priorityReplacementLimit,
  selectionLines,
  type AddOnSelection,
  type OrderSelection,
} from "../lib/orderSelection";
import {
  BESPOKE,
  PRIORITY_REPLACEMENT,
  formatMoney,
  getProduct,
  getVariant,
  priceSummary,
  songExperiences,
} from "../data/catalogue";
import {
  REFERRAL_STORAGE_KEY,
  readStoredReferral,
} from "../data/referral";
import {
  CONSENTS,
  INITIAL_CONSENT_STATE,
  getConsent,
  requiredConsents,
  TERMS_VERSION,
  REFUND_POLICY_VERSION,
  PRIVACY_POLICY_VERSION,
  type ConsentId,
} from "../data/legal";
import YourMemorySummary from "../components/YourMemorySummary";
import MusicStyleSelector from "../components/MusicStyleSelector";
import UpgradeInvitation from "../components/UpgradeInvitation";
import { isUpgradeEligible, type UpgradeDecision } from "../lib/upgrade";
import CompleteYourMemory from "../components/CompleteYourMemory";
import {
  MAX_STYLE_LABEL_LENGTH,
  OTHER_STYLE_VALUE,
} from "../data/musicStyles";
import { revealOnScroll } from "../lib/scrollReveal";
import { trackAddToCart, trackBeginCheckout, trackEvent, trackSelectItem } from "../lib/analytics";
import {
  CHECKOUT_SESSIONS_ENABLED,
  createCheckoutSession,
} from "../lib/checkoutSession";

/** The song experiences this form takes orders for, from the catalogue. */
const ORDERABLE_PRODUCTS = songExperiences().filter((product) => product.onlineCheckout);
const MOMENT_ID = "moment";
const KEEPSAKE_ID = "keepsake";

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
 * NO BROWSER AUTOMATION WEBHOOKS.
 *
 * This form used to POST every submission — contact details, address and
 * story — straight to a Make.com webhook whose URL shipped in the public
 * bundle, before anyone had paid. That integration now runs server-side,
 * after payment, with no personal data (see api/lib/ops.php). The browser
 * talks only to MCB's own API.
 */
const ORDER_TIMEOUT_MS = 15000;

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

/**
 * Saves the order with MCB and returns what checkout needs.
 *
 * The request carries SKUs and quantities, never a price: the server prices
 * the order itself. The Idempotency-Key makes a retry — a double click, or a
 * response lost to a timeout — return the original order rather than create a
 * second one.
 */
const saveOrder = async (
  payload: Record<string, unknown>,
  idempotencyKey: string
): Promise<{ orderId: number; checkoutToken: string } | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ORDER_TIMEOUT_MS);

  try {
    const response = await fetch("/api/order", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const data = await response.json();
    return typeof data?.order_id === "number" && typeof data?.checkout_token === "string"
      ? { orderId: data.order_id, checkoutToken: data.checkout_token }
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const newIdempotencyKey = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

const contactMethods = ['Email', 'WhatsApp', 'Phone'];
type FormDataType = {
  firstName: string;
  lastName: string;
  email: string;
  whatsapp: string;
  preferredContact: string;
  /** Collected only when something in the order is posted. */
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
  /**
   * Who the customer is travelling with, in their own words.
   *
   * REQUIRED, and free text. It is storytelling context — "my wife and
   * our children", "my best friend Sarah" — which tells the writer who is
   * in the room when the song is played. It is deliberately not a set of
   * tick boxes: no age, no gender, no relationship category. A sentence a
   * person chose to write is worth more to a writer than a demographic
   * form, and it is theirs to decide what goes in it.
   */
  cruiseCompanions: string;
  story: string;
  artwork: File | null;
  /**
   * THREE SEPARATE LEGAL ACTS, held separately.
   *
   * This was one boolean, `agreeTerms`, covering "Terms, Privacy and Refund
   * Policy". That is fine for accepting terms and wrong for the other two
   * things happening at the same moment: asking MCB to begin inside the
   * 14-day cancellation period, and acknowledging that supplied digital
   * content ends the right to cancel it. Both are decisions the customer has
   * to make, not consequences of a box mostly about something else.
   *
   * Keyed by `ConsentId` so the form, the server and the stored record all
   * name the same three things.
   */
  consents: Record<ConsentId, boolean>;
};

/**
 * Errors are keyed by field, and each consent gets its own key.
 *
 * A single `consents` error would put one message under three checkboxes and
 * leave the customer to work out which. Consent ids are used directly so the
 * message lands on the control it belongs to.
 */
type FormErrors = Partial<
  Record<Exclude<keyof FormDataType, "consents"> | ConsentId | "product" | "sku", string>
>;

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

  /**
   * The customer share code, if this visitor arrived through one.
   *
   * A SEPARATE read from `getRef` above, and separate all the way down: that
   * one names an affiliate and may pay commission, this one names a customer
   * and pays nobody. Expired and malformed values return null rather than
   * being sent, so the server is not asked to resolve something that has
   * already lapsed.
   *
   * The server resolves who the code belongs to. Nothing here names a
   * referring customer, and there is no field in which it could.
   */
  const getCustomerReferral = (): string | null => {
    try {
      return (
        readStoredReferral(localStorage.getItem(REFERRAL_STORAGE_KEY), Date.now())
          ?.code ?? null
      );
    } catch {
      return null;
    }
  };
  const sectionRef = useRef<HTMLDivElement>(null);

  const [showOtherMood, setShowOtherMood] = useState(false);

  const [formData, setFormData] = useState<FormDataType>({
  firstName: '',
  lastName: '',
  email: '',
  whatsapp: '',
  preferredContact: '',
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
  cruiseCompanions: '',
  story: '',
  artwork: null,
  // Nothing pre-ticked. See INITIAL_CONSENT_STATE for why that is a named
  // constant rather than three literal `false`s someone could tidy up.
  consents: { ...INITIAL_CONSENT_STATE },
});


/**
 * WHAT IS BEING ORDERED — catalogue SKUs and integer quantities only.
 *
 * Every figure the customer sees (lines, total, whether anything is posted,
 * whether digital content is supplied) is derived from this by the catalogue,
 * using the rules the server applies again when the order is saved.
 */
const [selection, setSelection] = useState<OrderSelection>(EMPTY_SELECTION);
const preview = previewSelection(selection);
const activeProduct = getProduct(selection.productId);
const activeVariant = selection.sku ? getVariant(selection.sku)?.variant : undefined;
const priorityLimit = priorityReplacementLimit(selection);

/**
 * Whether this order supplies digital content, which decides whether the
 * digital-content acknowledgement is required. Derived from the lines, as
 * `order.php` derives it, so the browser cannot ask for fewer consents than
 * the server requires.
 */
const hasDigitalDelivery = preview.ok && preview.lines.some((line) => line.fulfilment === "DIGITAL");
const needsShipping = preview.ok && preview.requiresShipping;

/**
 * One Idempotency-Key per distinct order attempt. A retry of the same order
 * reuses it, so the server returns the order it already saved; changing
 * anything in the order starts a new attempt.
 */
const attemptRef = useRef<{ key: string; signature: string } | null>(null);
/** The uploaded artwork for a given file, so a retry does not upload again. */
const artworkRef = useRef<{ file: File; url: string | null } | null>(null);

const [errors, setErrors] = useState<FormErrors>({});
const [isSubmitting, setIsSubmitting] = useState(false);
/** Reserved for genuine purchase-path failures only. */
const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
  if (selectedPackage && getProduct(selectedPackage)) {
    setSelection((prev) => chooseProduct(prev, selectedPackage));
  }
}, [selectedPackage]);

/**
 * A product page links here as /?product=<id>&sku=<sku>#order. Only ids the
 * catalogue sells online are honoured; anything else is ignored.
 */
const [searchParams] = useSearchParams();
const linkedProduct = searchParams.get("product");
const linkedSku = searchParams.get("sku");
useEffect(() => {
  const product = linkedProduct ? getProduct(linkedProduct) : undefined;
  if (product && product.onlineCheckout && product.category === "SONG_EXPERIENCE") {
    setSelection((prev) => chooseProduct(prev, product.id, linkedSku ?? undefined));
  }
}, [linkedProduct, linkedSku]);

/**
 * THE MOMENT → KEEPSAKE UPGRADE.
 *
 * `selection` stays the one record of what is being ordered. This holds only
 * the UI decision about whether the invitation is shown, never a price.
 */
const [upgradeDecision, setUpgradeDecision] = useState<UpgradeDecision>(null);

/**
 * The invitation waits until the customer has actually said something.
 *
 * Asked on page load it is an advertisement; asked after they have written
 * their story, chosen a mood and picked a musical direction it is the next
 * question in the same conversation. Mirrors the same three fields the
 * validator treats as the creative brief.
 */
const briefReady =
  formData.story.trim().length > 0 &&
  (formData.moods.length > 0 || formData.otherMood.trim().length > 0) &&
  formData.genre.trim().length > 0;

/**
 * Reported ONCE, the first time the invitation is actually seen.
 *
 * A ref rather than state: this must not re-render anything, and it must not
 * fire again as the customer keeps editing their story — which would turn one
 * impression into dozens and make the acceptance rate meaningless.
 *
 * Package ids only. No story, no style text, no contact details.
 */
const upgradeShownRef = useRef(false);
useEffect(() => {
  if (upgradeShownRef.current) return;
  if (!briefReady || !isUpgradeEligible(selection.productId)) return;
  if (upgradeDecision !== null) return;

  upgradeShownRef.current = true;
  trackEvent("moment_keepsake_upgrade_shown", {
    from_package: MOMENT_ID,
    to_package: KEEPSAKE_ID,
  });
}, [briefReady, selection.productId, upgradeDecision]);

/** Add-ons offered alongside a song experience, from the catalogue. */
const availableOffers = orderAddOns();

/**
 * Complete Your Memory comes after the song experience is settled and a
 * Moment customer has answered the upgrade invitation.
 */
const upgradeAnswered =
  !isUpgradeEligible(selection.productId) || upgradeDecision !== null;
const showCompleteMemory =
  briefReady && upgradeAnswered && Boolean(activeVariant);

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

  /**
   * ACCEPTING THE UPGRADE. The product becomes Keepsake and the customer
   * chooses which one; nothing is chosen for them.
   */
  const acceptUpgrade = () => {
    setSelection((prev) => chooseProduct(prev, KEEPSAKE_ID, ""));
    setUpgradeDecision("accepted");
    trackEvent("moment_keepsake_upgrade_accepted", {
      from_package: MOMENT_ID,
      to_package: KEEPSAKE_ID,
    });

    // Focus the choice the customer now has to make.
    window.setTimeout(() => {
      const target = document.querySelector<HTMLElement>(
        '[data-field="sku"] input, [data-field="sku"] button'
      );
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
      target?.focus();
    }, 0);
  };

  const declineUpgrade = () => {
    setUpgradeDecision("declined");
    trackEvent("moment_keepsake_upgrade_declined", {
      from_package: MOMENT_ID,
      to_package: KEEPSAKE_ID,
    });
  };

  /** Back to Moment, before payment. The creative brief is untouched. */
  const revertUpgrade = () => {
    setSelection((prev) => chooseProduct(prev, MOMENT_ID));
    setUpgradeDecision("declined");
  };

  /**
   * Basket analytics. Stable product ids and quantities only.
   *
   * No story, no musical style text, no contact details, no address — the
   * same rule the music-style events follow. A product id is a fact about the
   * catalogue; everything else here belongs to the customer.
   */
  const handleBasketEvent = (
    event: "selected" | "removed" | "quantity_changed",
    id: string,
    quantity?: number
  ) => {
    trackEvent(`memory_enhancement_${event}`, {
      item_id: id,
      ...(typeof quantity === "number" ? { quantity } : {}),
    });
    if (event === "selected") trackAddToCart(id, quantity ?? 1);
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

  if (!activeProduct) {
    newErrors.product = "Please choose an experience";
  } else if (!activeVariant) {
    newErrors.sku = `Please choose which ${activeProduct.name} you would like`;
  } else if (!preview.ok) {
    newErrors.sku = "That combination can't be ordered. Please check your choices.";
  }

  // Anything posted has to go somewhere.
  if (needsShipping) {
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

  if (!formData.cruiseCompanions.trim()) {
    newErrors.cruiseCompanions = "Please tell us who you are travelling with";
  } else if (formData.cruiseCompanions.trim().length > 255) {
    // Matches the column, so the server never has to truncate a customer's
    // own words to make them fit.
    newErrors.cruiseCompanions = "Please keep this under 255 characters";
  }

  if (!formData.story.trim())
    newErrors.story = "Story required";
  else if (wordCount > 2000)
    newErrors.story = "Maximum 2000 words";

  /**
   * Each required consent checked individually, against the same rule the
   * server applies — `requiredConsents` derives the list from whether this
   * order actually involves digital delivery, so a vinyl order is not asked
   * to acknowledge something that does not apply to it.
   */
  for (const id of requiredConsents({ hasDigitalDelivery })) {
    if (!formData.consents[id]) {
      newErrors[id] = getConsent(id)?.error ?? "Please confirm this to continue.";
    }
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

  // `consents` has its own setter — it is a record, not a scalar, and its
  // errors are keyed by consent id rather than by the field name.
  if (field !== "consents" && errors[field as keyof FormErrors]) {
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated[field as keyof FormErrors];
      return updated;
    });
  }
};

/**
 * Toggling one consent, and clearing only that consent's message.
 *
 * Separate from `handleChange` so ticking the terms box cannot clear the
 * error under the digital-content box — which is what a shared handler over a
 * record would do, and would leave a customer looking at a form that appeared
 * to have fixed itself.
 */
const setConsent = (id: ConsentId, value: boolean) => {
  setFormData((prev) => ({
    ...prev,
    consents: { ...prev.consents, [id]: value },
  }));

  if (errors[id]) {
    setErrors((prev) => {
      const updated = { ...prev };
      delete updated[id];
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

    /**
     * Consent errors are keyed by CONSENT ID, not by field name.
     *
     * The three acknowledgements share one `data-field="consents"` wrapper,
     * so a lookup on `data-field` alone would find the block but not the box,
     * and a customer missing only the digital acknowledgement would be
     * focused into the terms checkbox above it — told there was a problem
     * while being put in front of the wrong one. `data-consent` addresses the
     * individual box.
     */
    const element = (document.querySelector(`[data-field="${firstError}"]`) ??
      document.querySelector(`[data-consent="${firstError}"]`)) as
      | HTMLElement
      | null;

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

  /**
   * NO ORDER WITHOUT A WAY TO PAY.
   *
   * Server-created Checkout Sessions are the only payment path, and they stay
   * switched off until Bella and Lewis approve going live. Saving an order the
   * customer cannot pay for would leave them believing they had bought
   * something, so nothing is submitted while checkout is closed.
   */
  if (!CHECKOUT_SESSIONS_ENABLED) {
    setSubmitError(
      "Online checkout is not open yet. Nothing has been submitted or charged — please contact us and we'll help you with your order personally."
    );
    return;
  }

  const lines = selectionLines(selection);
  if (!preview.ok || lines.length === 0) {
    setSubmitError("Please check your choices — that combination can't be ordered online.");
    return;
  }

  setIsSubmitting(true);

  // Upload the artwork once per file, so a retry sends the same URL and
  // therefore the same order.
  let artworkUrl: string | null = null;
  if (formData.artwork) {
    if (artworkRef.current?.file === formData.artwork) {
      artworkUrl = artworkRef.current.url;
    } else {
      const uploadResult = await uploadArtwork(formData.artwork);
      artworkUrl = uploadResult?.secure_url || null;
      artworkRef.current = { file: formData.artwork, url: artworkUrl };
    }
  }

  const payload = {
    firstName: formData.firstName,
    lastName: formData.lastName,
    email: formData.email,
    whatsapp: formData.whatsapp,
    // SKUs and integer quantities. The server prices them; no amount is sent.
    lines,
    ...(needsShipping
      ? {
          shippingName: formData.shippingName,
          shippingAddress: formData.shippingAddress,
          shippingCity: formData.shippingCity,
          shippingPostcode: formData.shippingPostcode,
          shippingCountry: formData.shippingCountry,
        }
      : {}),
    mood: formData.otherMood
      ? [...formData.moods, formData.otherMood].join(", ")
      : formData.moods.join(", "),
    genre: formData.genre === "Other" ? formData.otherGenre : formData.genre,
    personalTouches: formData.personalTouches,
    // Sent to MCB's own record only: never to analytics or Stripe.
    cruiseCompanions: formData.cruiseCompanions,
    story: formData.story,
    artworkUrl: artworkUrl || "",
    referral: ref,
    partner: getPartner(),
    // A customer share code is recorded as influence, alongside any affiliate.
    ...(getCustomerReferral() ? { customerReferral: getCustomerReferral() } : {}),
    // The consent record and the document versions in force, verified and
    // stored by the server.
    consents: formData.consents,
    termsVersion: TERMS_VERSION,
    refundPolicyVersion: REFUND_POLICY_VERSION,
    privacyPolicyVersion: PRIVACY_POLICY_VERSION,
  };

  const signature = JSON.stringify(payload);
  if (attemptRef.current?.signature !== signature) {
    attemptRef.current = { key: newIdempotencyKey(), signature };
  }

  const saved = await saveOrder(payload, attemptRef.current.key);

  if (saved === null) {
    setSubmitError("We couldn't save your order. Your details are still here and nothing has been charged. Please try again.");
    setIsSubmitting(false);
    return;
  }

  // Catalogue ids, names and prices only. Revenue is reported later, from
  // the server's confirmed order, on the thank-you page.
  trackBeginCheckout(lines);

  const session = await createCheckoutSession(saved);

  if (session.ok) {
    window.location.href = session.url;
    return;
  }

  setSubmitError(
    "We couldn't start checkout just now. Your order is saved and nothing has been charged — please try again in a moment, or contact us and we'll complete it personally."
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
 

  {/* Step 2 — What you would like */}
<h3 className="label-uppercase text-gold-deep">
  Step 2 — Choose Your Experience
</h3>

<div
  data-field="product"
  className={errors.product ? "border-red-500 border-2 p-3 rounded-xl" : ""}
>
  <div className="flex flex-wrap gap-3">
    {ORDERABLE_PRODUCTS.map((product) => (
      <button
        key={product.id}
        type="button"
        aria-pressed={selection.productId === product.id}
        onClick={() => {
          setSelection((prev) => chooseProduct(prev, product.id));
          if (errors.product) setErrors((prev) => ({ ...prev, product: undefined }));
          // Choosing here overrides any earlier upgrade decision.
          setUpgradeDecision(isUpgradeEligible(product.id) ? null : "declined");
        }}
        className={`px-5 py-3 rounded-xl transition-all text-left ${
          selection.productId === product.id
            ? "bg-gold text-ink"
            : "bg-ivory border border-espresso/10 text-espresso/70 hover:border-gold"
        }`}
      >
        <div className="font-medium">{product.name}</div>
        <div className="text-sm opacity-70">{priceSummary(product)}</div>
      </button>
    ))}
  </div>

  {/* Quoted work is arranged personally, so it is named here rather than offered. */}
  <p className="text-sm text-espresso/55 leading-relaxed mt-4">
    Looking for {BESPOKE.name}?{" "}
    <Link
      to={BESPOKE.route ?? "/bespoke"}
      className="text-gold-deep underline underline-offset-4 hover:text-espresso focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep rounded-sm"
    >
      It is individually quoted
    </Link>
    , rather than ordered here.
  </p>
</div>

<FieldError name="product" message={errors.product} className="text-red-500 text-sm mt-2" />

{/* ---- Which variant: only where there is a genuine choice ---- */}
{activeProduct && activeProduct.variants.length > 1 && (
  <div className="order-form-field space-y-4 pt-2">
    <div>
      <h3 className="label-uppercase text-gold-deep">Which {activeProduct.name}?</h3>
      {activeProduct.disclosures.map((disclosure) => (
        <p key={disclosure} className="text-sm text-espresso/70 mt-2">{disclosure}</p>
      ))}
    </div>

    <div data-field="sku">
      <RadioGroup
        value={selection.sku}
        onValueChange={(sku) => {
          setSelection((prev) => chooseProduct(prev, activeProduct.id, sku));
          trackSelectItem(sku, "Order form");
          if (errors.sku) setErrors((prev) => ({ ...prev, sku: undefined }));
        }}
        aria-label={`Choose your ${activeProduct.name}`}
        className={`grid gap-3 sm:grid-cols-2 ${errors.sku ? "p-3 rounded-xl border border-red-500" : ""}`}
      >
        {activeProduct.variants.map((variant) => {
          const isSelected = selection.sku === variant.sku;
          const itemId = `variant-${variant.sku}`;
          return (
            <label
              key={variant.sku}
              htmlFor={itemId}
              className={`flex gap-3 items-start cursor-pointer rounded-xl border p-4 transition-all ${
                isSelected ? "border-gold bg-gold/5" : "border-espresso/10 bg-ivory hover:border-gold/50"
              }`}
            >
              <RadioGroupItem value={variant.sku} id={itemId} className="mt-1 border-espresso/30 text-gold" />
              <span className="flex flex-col gap-1">
                <span className="font-medium text-espresso text-sm">
                  {variant.label} — {formatMoney(variant.price)}
                </span>
                <span className="text-xs text-espresso/60 leading-relaxed">
                  {variant.features.slice(0, 3).join(" · ")}
                </span>
              </span>
            </label>
          );
        })}
      </RadioGroup>
      <FieldError name="sku" message={errors.sku} className="text-red-500 text-sm mt-2" />
    </div>
  </div>
)}

{/* ---- How many: a Keepsake for every memory, with no MCB maximum ---- */}
{activeProduct && activeVariant && MULTI_UNIT_PRODUCT_IDS.has(activeProduct.id) && (
  <div className="order-form-field space-y-3 pt-2">
    <label htmlFor={fieldId("quantity")} className="label-uppercase text-gold-deep block">
      How many?
    </label>
    <p className="text-sm text-espresso/60">
      Choose one for each memory or each day of your journey. Tell us about each one in your story.
    </p>
    <input
      id={fieldId("quantity")}
      type="number"
      inputMode="numeric"
      min={1}
      max={MAX_UNITS_PER_LINE}
      value={selection.quantity}
      onChange={(e) => {
        const next = Math.min(Math.max(Math.trunc(Number(e.target.value) || 1), 1), MAX_UNITS_PER_LINE);
        setSelection((prev) => ({
          ...prev,
          quantity: next,
          priorityReplacementQuantity: Math.min(prev.priorityReplacementQuantity, next),
        }));
      }}
      className="w-28 px-4 py-3 border rounded-xl border-espresso/10"
    />
  </div>
)}

{/* ---- MCB Priority Replacement: optional, never preselected ---- */}
{priorityLimit > 0 && (
  <div className="order-form-field rounded-2xl border border-espresso/12 bg-white p-4 space-y-3" data-field="priorityReplacement">
    <label htmlFor={fieldId("priorityReplacement")} className="flex items-start gap-3 cursor-pointer">
      <input
        id={fieldId("priorityReplacement")}
        type="checkbox"
        checked={selection.priorityReplacementQuantity > 0}
        onChange={(e) =>
          setSelection((prev) => ({ ...prev, priorityReplacementQuantity: e.target.checked ? 1 : 0 }))
        }
        className="mt-1 h-5 w-5"
      />
      <span className="text-sm text-espresso">
        Add {PRIORITY_REPLACEMENT.name} — {formatMoney(PRIORITY_REPLACEMENT.variants[0].price)} per Keepsake
        <span className="block text-xs text-espresso/65 mt-1 leading-relaxed">{PRIORITY_REPLACEMENT.shortDescription}</span>
        {PRIORITY_REPLACEMENT.disclosures.map((disclosure) => (
          <span key={disclosure} className="block text-xs text-espresso/65 mt-1 leading-relaxed">{disclosure}</span>
        ))}
        <Link to="/priority-replacement" target="_blank" className="block text-xs text-gold-deep underline underline-offset-4 mt-1">
          How it works
        </Link>
      </span>
    </label>
    {selection.priorityReplacementQuantity > 0 && priorityLimit > 1 && (
      <div className="flex items-center gap-3 pl-8">
        <label htmlFor={fieldId("priorityReplacementQuantity")} className="text-sm text-espresso/70">
          For how many of your {priorityLimit} Keepsakes?
        </label>
        <input
          id={fieldId("priorityReplacementQuantity")}
          type="number"
          inputMode="numeric"
          min={1}
          max={priorityLimit}
          value={selection.priorityReplacementQuantity}
          onChange={(e) => {
            const next = Math.min(Math.max(Math.trunc(Number(e.target.value) || 1), 1), priorityLimit);
            setSelection((prev) => ({ ...prev, priorityReplacementQuantity: next }));
          }}
          className="w-24 px-3 py-2 border rounded-xl border-espresso/10"
        />
      </div>
    )}
  </div>
)}

{/* ---- Delivery address: anything posted ---- */}
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

  {/*
    ---- WHO ARE YOU CRUISING WITH? -------------------------------------

    REQUIRED, and it sits with the other brief fields because that is what
    it is: part of the story, not a profile of anyone.

    It asks for a sentence, not a form. "My wife and our children" tells a
    writer more than an age, a gender and a relationship category would,
    and it lets the customer decide what is relevant about the people they
    love rather than picking from options MCB chose for them.
  */}
  <div data-field="cruiseCompanions">
    <FieldLabel name="cruiseCompanions">
      Who are you cruising with? (required)
    </FieldLabel>
    <input
      name="cruiseCompanions"
      type="text"
      maxLength={255}
      placeholder="My husband David, my parents, my best friend Sarah..."
      value={formData.cruiseCompanions}
      onChange={(e) => handleChange("cruiseCompanions", e.target.value)}
      {...fieldAria("cruiseCompanions", errors.cruiseCompanions)}
      className="w-full px-4 py-3 bg-ivory border border-espresso/10 rounded-xl text-espresso placeholder:text-espresso/40 focus:outline-none focus:ring-2 focus:ring-gold/30 transition-all duration-fast"
    />
    <p className="mt-2 text-xs leading-relaxed text-espresso/55">
      However you would describe them. It helps us write for the people who
      will actually be listening.
    </p>
    {errors.cruiseCompanions && (
      <FieldError name="cruiseCompanions" message={errors.cruiseCompanions} />
    )}
  </div>

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

            {/*
              MOMENT → KEEPSAKE.

              Placed here, after the story, deliberately: this is the first
              point at which the customer has described something worth
              holding. Rendered inline in document order rather than as a
              modal — a dialog over a half-finished form would trap focus and
              interrupt someone mid-thought.

              It shows only for Moment, and only once the brief is ready.
            */}
            <UpgradeInvitation
              currentPackage={selection.productId}
              decision={upgradeDecision}
              onAccept={acceptUpgrade}
              onDecline={declineUpgrade}
              onRevert={revertUpgrade}
              briefReady={briefReady}
            />

            {/*
              COMPLETE YOUR MEMORY.

              Deliberately after the upgrade invitation: a Moment customer may
              become a Keepsake customer, and enhancement eligibility depends
              on the FINAL package and format. Asking first would be asking
              about an order that no longer exists.
            */}
            {showCompleteMemory && (
              <CompleteYourMemory
                offers={availableOffers}
                items={selection.addOns}
                onChange={(addOns: readonly AddOnSelection[]) => setSelection((prev) => ({ ...prev, addOns }))}
                onEvent={handleBasketEvent}
              />
            )}

  {/* TERMS */}
<h3 className="label-uppercase text-gold-deep">
  Step 7 — Confirmation
</h3>

{/*
  ---- CONSENT: three acts, three boxes ----------------------------------

  This was one checkbox reading "I confirm that I have read and agree to the
  Terms, Privacy Policy and Refund Policy … and understand that this is a
  personalised, made-to-order digital product."

  That sentence was doing three jobs. Accepting the terms is one of them. The
  other two — asking MCB to begin inside the 14-day cancellation period, and
  acknowledging that supplied digital music ends the right to cancel it — are
  decisions with their own consequences, and inferring them from a box mostly
  about something else is exactly how a customer loses a right they never
  knowingly gave up.

  So: one box each, each stating its own consequence in full rather than
  behind a link, none pre-ticked, each with its own error message on its own
  control. The list is derived from `requiredConsents`, so a vinyl order is
  never asked about digital files.
------------------------------------------------------------------------ */}
<div className="order-form-field space-y-4" data-field="consents">
  {CONSENTS.filter((consent) =>
    requiredConsents({ hasDigitalDelivery }).includes(consent.id)
  ).map((consent) => {
    const checkboxId = fieldId(`consent-${consent.id}`);
    const detailId = `${checkboxId}-detail`;
    const errorMessage = errors[consent.id];

    return (
      <div
        key={consent.id}
        data-consent={consent.id}
        className={`rounded-2xl border p-4 transition-colors ${
          errorMessage
            ? "border-red-500 bg-red-50/40"
            : formData.consents[consent.id]
              ? "border-gold-dark bg-gold/5"
              : "border-espresso/12 bg-white"
        }`}
      >
        <label htmlFor={checkboxId} className="flex cursor-pointer items-start gap-3">
          {/*
            44x44 touch target around a 24x24 control. The negative margin is
            what makes both true at once: the wrapper is 44px so a fingertip
            has the full WCAG 2.5.5 target, but -10px on every side means it
            occupies only 24px of layout, so the box sits where a 24px
            checkbox would and the text alignment is unchanged.
          */}
          <span className="relative -m-2.5 flex h-11 w-11 shrink-0 items-center justify-center">
            <input
              type="checkbox"
              id={checkboxId}
              checked={formData.consents[consent.id]}
              onChange={(e) => setConsent(consent.id, e.target.checked)}
              aria-describedby={
                errorMessage ? `${detailId} ${checkboxId}-error` : detailId
              }
              aria-invalid={errorMessage ? true : undefined}
              /*
                appearance-none, then drawn explicitly. The native control was
                20px on mobile and grew to 24px on desktop — backwards, since
                the finger is on the phone — and iOS Safari renders
                `accent-color` inconsistently. Semantics are untouched: still a
                real <input type="checkbox"> inside its <label>.
              */
              className="peer h-6 w-6 shrink-0 cursor-pointer appearance-none rounded-md border-2 border-espresso/40 bg-white transition-colors checked:border-gold-deep checked:bg-gold-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
            />
            {/* pointer-events-none so the tick never eats the tap. */}
            <Check
              aria-hidden="true"
              strokeWidth={3.5}
              className="pointer-events-none absolute h-4 w-4 text-white opacity-0 transition-opacity peer-checked:opacity-100"
            />
          </span>

          <span className="min-w-0">
            <span className="order-heading block text-sm leading-relaxed text-espresso md:text-base">
              {consent.label}
            </span>

            {/*
              The consequence, in full, next to the box — not one link away.
              For the two cancellation-related acknowledgements this sentence
              IS the disclosure; a customer who has to open a policy page to
              discover what they just agreed to has not been told.
            */}
            <span
              id={detailId}
              className="mt-2 block text-xs leading-relaxed text-espresso/70"
            >
              {consent.detail}
            </span>

            {/* The links live on the terms consent, where they belong. */}
            {consent.id === "TERMS" && (
              <span className="mt-2 block text-xs leading-relaxed text-espresso/70">
                <Link to="/legal/terms" target="_blank" className="text-gold-deep underline underline-offset-4">
                  Terms &amp; Conditions
                </Link>
                {" · "}
                <Link to="/legal/refund" target="_blank" className="text-gold-deep underline underline-offset-4">
                  Refunds &amp; Cancellations
                </Link>
                {" · "}
                <Link to="/legal/privacy" target="_blank" className="text-gold-deep underline underline-offset-4">
                  Privacy Policy
                </Link>
                {/* The version the customer is accepting, named where they
                    accept it — and the same string recorded on the order. */}
                <span className="mt-1 block text-espresso/50">
                  Terms version {TERMS_VERSION}. We record this against your
                  order and name it in your confirmation email.
                </span>
              </span>
            )}
          </span>
        </label>

        {errorMessage && (
          <p
            id={`${checkboxId}-error`}
            role="alert"
            className="mt-3 pl-9 text-sm leading-relaxed text-red-600"
          >
            {errorMessage}
          </p>
        )}
      </div>
    );
  })}

  {/*
    The content undertaking. Kept out of the consent boxes above because it is
    a representation about the submission rather than a legal acknowledgement
    with a cancellation consequence, and merging it back in is how the boxes
    started doing three jobs each in the first place.
  */}
  <p className="text-xs leading-relaxed text-espresso/70">
    By placing your order you also confirm that what you have sent us is yours
    to send, and does not contain offensive, abusive or inappropriate content.
  </p>
</div>

            {/*
              ---- YOUR MEMORY: core package + format + enhancements ----

              Deliberately NOT given the `order-form-field` class.

              The reveal above is now failsafe-backed, so this is no longer
              load-bearing — but the panel states the price the customer is
              about to be charged, and there is no reason to put any animation
              between that number and the customer. It renders immediately.
            */}
            <YourMemorySummary productId={selection.productId} preview={preview} />

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
              ) : CHECKOUT_SESSIONS_ENABLED ? (
                <>Continue to Checkout</>
              ) : (
                <>Online checkout opens soon</>
              )}
            </button>

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
