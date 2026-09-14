import { useId } from "react";
import { COUNTRIES } from "../../data/countries";
import { contactIssues, type ContactDetails, type ContactField } from "../../lib/createFlow";

interface StepDetailsProps {
  contact: ContactDetails;
  setContact: (update: (contact: ContactDetails) => ContactDetails) => void;
  requiresShipping: boolean;
  showErrors: boolean;
}

interface FieldSpec {
  field: ContactField;
  label: string;
  autoComplete: string;
  type?: string;
  optional?: boolean;
  hint?: string;
  wide?: boolean;
  /** Rendered as a list of ISO countries rather than free text. */
  country?: boolean;
}

const CONTACT: FieldSpec[] = [
  { field: "firstName", label: "First name", autoComplete: "given-name" },
  { field: "lastName", label: "Last name", autoComplete: "family-name" },
  { field: "email", label: "Email address", autoComplete: "email", type: "email", hint: "We'll send your order confirmation and your song here." },
  { field: "phone", label: "Phone or WhatsApp", autoComplete: "tel", type: "tel", optional: true, hint: "Include your country code, e.g. +44. Only used if we need to ask you something." },
];

const ADDRESS: FieldSpec[] = [
  { field: "shippingName", label: "Recipient's name", autoComplete: "shipping name", wide: true },
  { field: "shippingAddress", label: "Address", autoComplete: "shipping address-line1", wide: true },
  { field: "shippingAddress2", label: "Address line 2", autoComplete: "shipping address-line2", optional: true, wide: true },
  { field: "shippingCity", label: "Town or city", autoComplete: "shipping address-level2" },
  { field: "shippingState", label: "County, state or region", autoComplete: "shipping address-level1", optional: true },
  { field: "shippingPostcode", label: "Postcode or ZIP", autoComplete: "shipping postal-code" },
  { field: "shippingCountry", label: "Country", autoComplete: "shipping country", wide: true, country: true },
];

const StepDetails = ({ contact, setContact, requiresShipping, showErrors }: StepDetailsProps) => {
  const uid = useId();
  const issues = showErrors ? contactIssues(contact, requiresShipping) : {};

  const renderField = (spec: FieldSpec) => {
    const id = `${uid}-${spec.field}`;
    const error = issues[spec.field];
    const describedBy = [spec.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
    return (
      <div key={spec.field} className={spec.wide ? "sm:col-span-2" : ""} data-field={spec.field}>
        <label htmlFor={id} className="block text-base font-medium text-ink">
          {spec.label}
          {spec.optional && <span className="font-normal text-espresso/75"> (optional)</span>}
        </label>
        {spec.hint && <p id={`${id}-hint`} className="mt-1 text-sm text-espresso/65">{spec.hint}</p>}
        {spec.country ? (
          <select
            id={id}
            value={contact[spec.field]}
            autoComplete={spec.autoComplete}
            onChange={(e) => setContact((c) => ({ ...c, [spec.field]: e.target.value }))}
            aria-describedby={describedBy}
            {...(error ? { "aria-invalid": true } : {})}
            aria-required
            className={`mt-2 min-h-12 w-full rounded-xl border bg-white px-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep ${error ? "border-red-600" : "border-espresso/15"}`}
          >
            <option value="">Choose the country</option>
            {COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        ) : (
        <input
          id={id}
          type={spec.type ?? "text"}
          value={contact[spec.field]}
          autoComplete={spec.autoComplete}
          onChange={(e) => setContact((c) => ({ ...c, [spec.field]: e.target.value }))}
          aria-describedby={describedBy}
          {...(error ? { "aria-invalid": true } : {})}
          {...(!spec.optional ? { "aria-required": true } : {})}
          className={`mt-2 min-h-12 w-full rounded-xl border bg-white px-4 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep ${error ? "border-red-600" : "border-espresso/15"}`}
        />
        )}
        {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm text-red-700">{error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-10">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-2 font-serif text-2xl text-ink sm:col-span-2">How can we reach you?</legend>
        {CONTACT.map(renderField)}
      </fieldset>

      {requiresShipping && (
        <fieldset className="grid gap-5 sm:grid-cols-2">
          <legend className="mb-2 font-serif text-2xl text-ink sm:col-span-2">Where should we send it?</legend>
          <p className="text-base leading-relaxed text-espresso/75 sm:col-span-2">
            We'll show the delivery cost for this address on the next page, before you pay. If it's for a trip, choose a fixed address you'll be at — not a ship or hotel you're about to leave.
          </p>
          {ADDRESS.map(renderField)}
        </fieldset>
      )}

      <p className="text-sm leading-relaxed text-espresso/65">
        Your contact details are only kept in this page while you complete your order. They are not saved on this device.
      </p>
    </div>
  );
};

export default StepDetails;
