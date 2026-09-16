import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Menu, X } from "lucide-react";
import { PRIMARY_EXPERIENCES } from "../sections/home/experienceFacts";

/**
 * Site navigation.
 *
 * Deliberately short: one primary action (Create Your Memory), the four
 * experiences behind one disclosure, and four destinations. Everything else —
 * FAQ, Priority Replacement, Partners, Affiliates, Artists, legal — lives in
 * the footer.
 *
 * Nothing here depends on hover. The Experiences menu opens on click, tap or
 * Enter/Space and closes on Escape, outside click or choosing a link. The
 * mobile menu is a full-height dialog with focus kept inside it, Escape to
 * close, and the page behind it locked from scrolling.
 */

const LINKS = [
  { label: "Keepsakes & Gifts", to: "/products" },
  { label: "Cruise", to: "/cruise" },
  { label: "MCB LIVE", to: "/mcb-live" },
  { label: "Our Story", to: "/about" },
] as const;

const EXPERIENCES = PRIMARY_EXPERIENCES.flatMap((product) =>
  product.route ? [{ id: product.id, label: product.name, to: product.route, line: product.positioning }] : []
);

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 focus-visible:ring-offset-ivory";

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Logo = ({ onClick }: { onClick: () => void }) => (
  <Link to="/" onClick={onClick} className={`flex items-center gap-3 rounded-md ${focusRing}`} aria-label="My Custom Beats — home">
    {/* The approved mark sits in a square canvas with generous padding;
        object-cover crops that padding so the mark itself reads at size. */}
    <img
      src="/images/brand/MCB-Black-logo.png"
      alt=""
      width={96}
      height={40}
      className="h-10 w-24 object-cover"
    />
    <span className="hidden sm:block text-[0.8125rem] font-semibold uppercase leading-tight tracking-[0.16em] text-ink">
      My Custom
      <br />
      Beats
    </span>
  </Link>
);

const Navigation = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [experiencesOpen, setExperiencesOpen] = useState(false);

  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLDivElement>(null);
  const experiencesButton = useRef<HTMLButtonElement>(null);
  const experiencesWrap = useRef<HTMLDivElement>(null);

  const menuId = useId();
  const experiencesId = useId();

  const closeAll = useCallback(() => {
    setMenuOpen(false);
    setExperiencesOpen(false);
  }, []);

  /* ---- Desktop Experiences disclosure: Escape and outside click ---- */
  useEffect(() => {
    if (!experiencesOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExperiencesOpen(false);
        experiencesButton.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!experiencesWrap.current?.contains(event.target as Node)) setExperiencesOpen(false);
    };
    const onFocus = (event: FocusEvent) => {
      if (!experiencesWrap.current?.contains(event.target as Node)) setExperiencesOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("focusin", onFocus);
    };
  }, [experiencesOpen]);

  /* ---- Mobile menu: focus, Escape, focus trap, scroll lock ---- */
  useEffect(() => {
    if (!menuOpen) return;
    const panel = menuPanel.current;
    const toggle = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        toggle?.focus();
        return;
      }
      if (event.key !== "Tab" || !panel || !toggle) return;
      const items = [toggle, ...Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))];
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (!items.includes(active as HTMLElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    // Close if the viewport grows past the breakpoint where the menu exists.
    const desktop = window.matchMedia("(min-width: 1280px)");
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    document.addEventListener("keydown", onKey);
    desktop.addEventListener("change", onDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKey);
      desktop.removeEventListener("change", onDesktop);
    };
  }, [menuOpen]);

  const skipToContent = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const main = document.querySelector<HTMLElement>("main");
    if (!main) return;
    event.preventDefault();
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView({ block: "start" });
  };

  return (
    <>
      <a
        href="#main-content"
        onClick={skipToContent}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[10001] focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-ivory"
      >
        Skip to content
      </a>

      <header className="fixed inset-x-0 top-0 z-[9999] h-20 border-b border-ink/10 bg-ivory/95 backdrop-blur-md">
        <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <Logo onClick={closeAll} />

          {/* ---- Desktop ---- */}
          <nav aria-label="Main" className="hidden xl:block">
            <ul className="m-0 flex list-none items-center gap-1 p-0">
              <li>
                <div ref={experiencesWrap} className="relative">
                  <button
                    ref={experiencesButton}
                    type="button"
                    aria-expanded={experiencesOpen}
                    aria-controls={experiencesId}
                    onClick={() => setExperiencesOpen((open) => !open)}
                    className={`inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-base font-medium text-ink transition-colors hover:bg-ink/5 ${focusRing}`}
                  >
                    Experiences
                    <ChevronDown
                      size={18}
                      aria-hidden="true"
                      className={`transition-transform duration-200 ${experiencesOpen ? "rotate-180" : ""}`}
                    />
                  </button>

                  <div
                    id={experiencesId}
                    hidden={!experiencesOpen}
                    className="absolute left-0 top-full mt-3 w-[26rem] rounded-2xl border border-ink/10 bg-white p-3 shadow-[0_24px_60px_rgba(13,27,42,0.12)]"
                  >
                    <ul className="m-0 list-none p-0">
                      {EXPERIENCES.map((item) => (
                        <li key={item.id}>
                          <Link
                            to={item.to}
                            onClick={closeAll}
                            className={`block rounded-xl px-4 py-3 transition-colors hover:bg-ivory ${focusRing}`}
                          >
                            <span className="block font-serif text-xl font-semibold text-ink">{item.label}</span>
                            <span className="mt-0.5 block text-[0.9375rem] leading-snug text-espresso/75">{item.line}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </li>
              {LINKS.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    onClick={closeAll}
                    className={`inline-flex min-h-12 items-center rounded-full px-4 text-base font-medium text-ink transition-colors hover:bg-ink/5 ${focusRing}`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-2">
            <Link
              to="/create"
              onClick={closeAll}
              className={`hidden min-[360px]:inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-5 text-[0.9375rem] font-semibold text-ivory transition-colors hover:bg-[#1c2d40] sm:px-6 sm:text-base ${focusRing}`}
            >
              <span className="sm:hidden">Create</span>
              <span className="hidden sm:inline">Create Your Memory</span>
            </Link>

            <button
              ref={menuButton}
              type="button"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              onClick={() => setMenuOpen((open) => !open)}
              className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-ink transition-colors hover:bg-ink/5 xl:hidden ${focusRing}`}
            >
              {menuOpen ? <X size={26} aria-hidden="true" /> : <Menu size={26} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>

      {/* ---- Mobile and tablet menu ---- */}
      <div
        ref={menuPanel}
        id={menuId}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        hidden={!menuOpen}
        className="fixed inset-x-0 bottom-0 top-20 z-[9998] overflow-y-auto overscroll-contain bg-ivory xl:hidden"
      >
        <nav aria-label="Main" className="mx-auto max-w-xl px-5 pb-16 pt-6">
          <Link
            to="/create"
            onClick={closeAll}
            className={`flex min-h-14 w-full items-center justify-center rounded-full bg-ink px-6 text-lg font-semibold text-ivory ${focusRing}`}
          >
            Create Your Memory
          </Link>

          <p className="label-uppercase mt-10 mb-2 text-gold-deep">Experiences</p>
          <ul className="m-0 list-none divide-y divide-ink/10 border-y border-ink/10 p-0">
            {EXPERIENCES.map((item) => (
              <li key={item.id}>
                <Link to={item.to} onClick={closeAll} className={`block rounded-lg py-4 ${focusRing}`}>
                  <span className="block font-serif text-2xl font-semibold text-ink">{item.label}</span>
                  <span className="mt-1 block text-base leading-snug text-espresso/75">{item.line}</span>
                </Link>
              </li>
            ))}
          </ul>

          <ul className="m-0 mt-6 list-none p-0">
            {LINKS.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={closeAll}
                  className={`flex min-h-14 items-center rounded-lg font-serif text-2xl font-semibold text-ink ${focusRing}`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <ul className="m-0 mt-8 flex list-none flex-wrap gap-x-6 gap-y-1 border-t border-ink/10 p-0 pt-6">
            <li>
              <Link to="/#help-me-choose" onClick={closeAll} className={`inline-flex min-h-12 items-center text-lg text-ink underline underline-offset-4 ${focusRing}`}>
                Help me choose
              </Link>
            </li>
            <li>
              <Link to="/faq" onClick={closeAll} className={`inline-flex min-h-12 items-center text-lg text-ink underline underline-offset-4 ${focusRing}`}>
                FAQ
              </Link>
            </li>
            <li>
              <Link to="/#contact" onClick={closeAll} className={`inline-flex min-h-12 items-center text-lg text-ink underline underline-offset-4 ${focusRing}`}>
                Contact
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </>
  );
};

export default Navigation;
