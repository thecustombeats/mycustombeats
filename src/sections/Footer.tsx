import { Instagram, Youtube, MessageCircle, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import CurrencySelector from "../components/CurrencySelector";
import { trackWhatsAppClick, trackEvent } from "../lib/analytics";
import { BESPOKE, songExperiences } from "../data/catalogue";

/** Product pages that exist, read from the catalogue's canonical routes. */
const PRODUCT_LINKS = [...songExperiences(), BESPOKE].flatMap((product) =>
  product.route ? [{ to: product.route, label: product.name }] : []
);

interface FooterLink {
  to: string;
  label: string;
}

const GROUPS: readonly { title: string; links: readonly FooterLink[] }[] = [
  {
    title: "Experiences",
    links: [
      { to: "/create", label: "Create Your Memory" },
      ...PRODUCT_LINKS,
      { to: "/mcb-live", label: "MCB LIVE" },
    ],
  },
  {
    title: "Explore",
    links: [
      { to: "/products", label: "Keepsakes & Gifts" },
      { to: "/cruise", label: "Cruise memories" },
      { to: "/occasions", label: "Occasions" },
      { to: "/priority-replacement", label: "Priority Replacement" },
      { to: "/blog", label: "Blog" },
    ],
  },
  {
    title: "MCB",
    links: [
      { to: "/about", label: "Our Story" },
      { to: "/faq", label: "FAQ" },
      { to: "/press", label: "Press" },
      { to: "/artists", label: "Artists" },
      { to: "/partners", label: "Partners & hospitality" },
      { to: "/affiliate", label: "Affiliates" },
    ],
  },
];

const linkClass =
  "inline-flex min-h-11 items-center rounded text-base text-ivory/80 transition-colors hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

const SOCIALS = [
  {
    label: "WhatsApp",
    icon: MessageCircle,
    href: "https://wa.me/447340742009?text=Hi%20MyCustomBeats%2C%20I%20clicked%20the%20link%20in%20your%20website%20footer%20and%20would%20like%20to%20learn%20more%20about%20your%20custom%20songs.",
    onClick: () => trackWhatsAppClick("footer"),
  },
  {
    label: "Instagram",
    icon: Instagram,
    href: "https://instagram.com/djrinaldiofficial?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=footer",
    onClick: () => trackEvent("outbound_social_click", { platform: "instagram", location: "footer" }),
  },
  {
    label: "YouTube",
    icon: Youtube,
    href: "https://www.youtube.com/@MyCustomBeats?utm_source=mycustombeats.com&utm_medium=referral&utm_campaign=footer",
    onClick: () => trackEvent("outbound_social_click", { platform: "youtube", location: "footer" }),
  },
] as const;

const Footer = () => (
  // Midnight Ink. Anything on this ground states its own colour: index.css
  // gives every <p> an espresso colour that would otherwise be invisible here.
  <footer className="w-full bg-ink pb-28 pt-20 text-ivory sm:pb-12">
    <div className="mx-auto max-w-6xl px-6">
      <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
        <div>
          <Link
            to="/"
            aria-label="My Custom Beats — home"
            className="inline-block rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          >
            {/* The black mark, inverted to ivory: a 40 KB file instead of the
                1.8 MB gold master. */}
            <img
              src="/images/brand/MCB-Black-logo.png"
              alt=""
              width={144}
              height={60}
              loading="lazy"
              decoding="async"
              className="h-[60px] w-36 object-cover invert"
            />
          </Link>
          <p className="mt-6 max-w-sm font-serif text-2xl leading-snug text-ivory">
            Your moments, turned into music you can hear, keep, give and relive.
          </p>
          <p className="mt-4 text-base text-ivory/70">MCB™ — My Custom Beats</p>

          <ul className="mt-8 flex list-none flex-wrap gap-3 p-0">
            {SOCIALS.map(({ label, icon: Icon, href, onClick }) => (
              <li key={label}>
                <a
                  href={href}
                  onClick={onClick}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${label} (opens in a new tab)`}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-ivory/20 text-ivory/80 transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                >
                  <Icon size={20} aria-hidden="true" />
                </a>
              </li>
            ))}
            <li>
              <a
                href="mailto:hello@mycustombeats.com"
                onClick={() => trackEvent("contact_email_click", { location: "footer" })}
                aria-label="Email hello@mycustombeats.com"
                className="flex h-12 w-12 items-center justify-center rounded-full border border-ivory/20 text-ivory/80 transition-colors hover:border-gold hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
              >
                <Mail size={20} aria-hidden="true" />
              </a>
            </li>
          </ul>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-1 gap-10 min-[480px]:grid-cols-2 md:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="label-uppercase !text-[0.8125rem] mb-3 text-gold">{group.title}</h2>
              <ul className="m-0 list-none p-0">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Display currency: a reading preference, stated once, with the
          relationship between the estimate and the charge. */}
      <div className="mt-14 flex flex-col items-start gap-4 border-t border-ivory/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <CurrencySelector tone="light" />
        <p className="max-w-md text-sm leading-relaxed text-ivory/70 sm:text-right">
          Prices are set in GBP. Other currencies are shown as an estimate; payment is taken in GBP and your bank sets
          its own rate and any fees.
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4 border-t border-ivory/15 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-ivory/70">© My Custom Beats. All rights reserved.</p>
        <ul className="m-0 flex list-none flex-wrap gap-x-6 p-0">
          <li>
            <Link to="/legal/terms" className={linkClass}>
              Terms
            </Link>
          </li>
          <li>
            <Link to="/legal/privacy" className={linkClass}>
              Privacy
            </Link>
          </li>
          <li>
            <Link to="/legal/refund" className={linkClass}>
              Refunds
            </Link>
          </li>
          <li>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event("mcb:open-cookie-settings"))}
              className={linkClass}
            >
              Cookie settings
            </button>
          </li>
        </ul>
      </div>
    </div>
  </footer>
);

export default Footer;
