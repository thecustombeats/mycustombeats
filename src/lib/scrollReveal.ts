import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * Scroll-triggered reveal that cannot hide content permanently.
 *
 * The site previously used bare `gsap.fromTo(..., { opacity: 0 }, { scrollTrigger })`.
 * That couples visibility to the animation succeeding: when lazy-loaded sections
 * and images changed the page height after ScrollTrigger had cached its start
 * positions, the trigger never fired and the elements stayed at `opacity: 0`
 * forever. On the packages section that hid the entire price list.
 *
 * This helper keeps the same GSAP/ScrollTrigger architecture but makes
 * visibility the guaranteed end state:
 *
 *  - Elements are only hidden from JavaScript, never from the stylesheet, so if
 *    GSAP fails to load or throws, the content simply renders.
 *  - Positions are recomputed when late layout shifts land, instead of relying
 *    on the height at mount.
 *  - A failsafe reveals anything still hidden once the reveal window has passed.
 *  - `prefers-reduced-motion` skips the animation entirely (MVIS motion rules).
 *
 * @returns a cleanup function; call it from the effect's teardown.
 */
export function revealOnScroll(
  scope: HTMLElement,
  selector: string,
  options: { y?: number; duration?: number; stagger?: number; start?: string } = {}
): () => void {
  const { y = 40, duration = 0.4, stagger = 0.1, start = "top 85%" } = options;

  const targets = gsap.utils.toArray<HTMLElement>(selector, scope);
  if (!targets.length) return () => {};

  // Reduced motion: leave the content exactly as rendered.
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (reducedMotion.matches) return () => {};

  const show = () => gsap.set(targets, { opacity: 1, y: 0, clearProps: "transform" });

  const ctx = gsap.context(() => {
    gsap.fromTo(
      targets,
      { y, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration,
        stagger,
        ease: "power2.out",
        scrollTrigger: {
          trigger: scope,
          start,
          once: true,
          invalidateOnRefresh: true,
        },
      }
    );
  }, scope);

  // Late layout shifts (lazy routes, images, webfonts) move the trigger point.
  // Recompute rather than trusting the height captured at mount.
  const refresh = () => ScrollTrigger.refresh();
  window.addEventListener("load", refresh);

  const resizeObserver = new ResizeObserver(refresh);
  resizeObserver.observe(document.body);

  // Failsafe: whatever happened above, content must not stay invisible.
  const failsafe = window.setTimeout(show, 3000);

  // If the user asks for reduced motion mid-session, stop hiding immediately.
  const onPreferenceChange = (event: MediaQueryListEvent) => {
    if (event.matches) show();
  };
  reducedMotion.addEventListener("change", onPreferenceChange);

  return () => {
    window.clearTimeout(failsafe);
    window.removeEventListener("load", refresh);
    reducedMotion.removeEventListener("change", onPreferenceChange);
    resizeObserver.disconnect();
    ctx.revert();
  };
}
