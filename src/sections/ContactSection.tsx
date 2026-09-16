import { Mail, MessageCircle } from "lucide-react";
import { McbButtonLink } from "../components/mcb/McbButton";
import { trackEvent, trackWhatsAppClick } from "../lib/analytics";

/**
 * Closing call to action and the two ways to reach a person.
 */
const CONTACTS = [
  {
    label: "WhatsApp",
    value: "+44 7340 742009",
    href: "https://wa.me/447340742009?text=Hi%20MyCustomBeats%2C%20I%27m%20writing%20from%20the%20contact%20section%20on%20your%20website%20and%20would%20like%20to%20get%20in%20touch.",
    icon: MessageCircle,
    external: true,
    onClick: () => trackWhatsAppClick("contact_section"),
  },
  {
    label: "Email",
    value: "hello@mycustombeats.com",
    href: "mailto:hello@mycustombeats.com",
    icon: Mail,
    external: false,
    onClick: () => trackEvent("contact_email_click", { location: "contact_section" }),
  },
] as const;

const ContactSection = () => (
  <section id="contact" aria-labelledby="contact-heading" className="scroll-mt-24 bg-ivory px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
      <div className="min-w-0 text-center lg:text-left">
        <p className="label-uppercase mb-4 text-gold-deep">Begin</p>
        <h2 id="contact-heading" className="text-ink">
          Which moment would you like to keep?
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-espresso/80">
          Start with the story. We&rsquo;ll guide you through the rest, one simple step at a time.
        </p>
        <div className="mt-9">
          <McbButtonLink to="/create" className="min-h-14 px-9 text-lg">
            Create Your Memory
          </McbButtonLink>
        </div>
      </div>

      <div className="min-w-0 rounded-[1.5rem] border border-ink/10 bg-white p-6 sm:p-8">
        <h3 className="text-ink">Prefer to talk first?</h3>
        <p className="mt-2 text-base leading-relaxed text-espresso/80">
          Ask us anything — about an idea, a date or which experience suits your story.
        </p>
        <ul className="mt-6 list-none space-y-3 p-0">
          {CONTACTS.map(({ label, value, href, icon: Icon, external, onClick }) => (
            <li key={label}>
              <a
                href={href}
                onClick={onClick}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex min-h-16 items-center gap-4 rounded-2xl border border-ink/10 px-4 py-3 transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ivory text-ink">
                  <Icon size={22} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold uppercase tracking-[0.12em] text-espresso/75">{label}</span>
                  <span className="block text-lg text-ink [overflow-wrap:anywhere]">{value}</span>
                </span>
                {external && <span className="sr-only">(opens in a new tab)</span>}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  </section>
);

export default ContactSection;
