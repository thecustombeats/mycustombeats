/**
 * Scroll to a section that may not exist yet, and stay there while the page
 * finishes loading.
 *
 * THE TWO BUGS THIS FIXES
 *
 * 1. The section is not in the DOM yet. The homepage's sections are
 *    lazy-loaded, so `#order` and `#samples` are absent when a route change
 *    or a click first asks for them. The old code called `getElementById`
 *    once, found nothing, and silently did nothing — leaving the visitor at
 *    the top of the homepage looking at the hero, and working only on a
 *    second attempt once the chunk had cached. A MutationObserver waits for
 *    the element instead of assuming it, firing the moment React inserts it.
 *
 * 2. Smooth scrolling does not complete on these pages. Measured: an instant
 *    scroll to #order lands at 7719px, while the identical smooth scroll ends
 *    back at 0. The page runs GSAP ScrollTrigger and grows continuously as
 *    lazy sections and images load, and a long smooth scroll is abandoned
 *    partway. So the scroll is instant — a scroll that silently fails is what
 *    caused the reported jump to the hero.
 *
 * Because the page keeps growing after arrival, the target is re-aligned on
 * layout changes until a short deadline, the same observer-plus-bounded-
 * failsafe shape `lib/scrollReveal` uses. Any real interaction from the
 * visitor cancels that immediately, so this can never fight someone scrolling.
 *
 * Returns a cancel function; call it when the route changes so a stale target
 * cannot hijack the page the visitor has since moved to.
 */

/** How long to wait for a lazy section to appear before giving up. */
const APPEAR_TIMEOUT_MS = 4000;

/** How long to keep the target aligned while late content shifts the page. */
const SETTLE_MS = 1200;

export const scrollToSection = (id: string): (() => void) => {
  const target = id.startsWith("#") ? id.slice(1) : id;

  let cancelled = false;
  let settleObserver: ResizeObserver | null = null;
  let settleTimer = 0;
  let appearTimer = 0;

  const userInteracted = () => cancel();

  const cancel = () => {
    if (cancelled) return;
    cancelled = true;
    appearObserver.disconnect();
    settleObserver?.disconnect();
    window.clearTimeout(appearTimer);
    window.clearTimeout(settleTimer);
    window.removeEventListener("wheel", userInteracted);
    window.removeEventListener("touchstart", userInteracted);
    window.removeEventListener("keydown", userInteracted);
  };

  const align = (element: Element) => {
    // Instant, not smooth: see the note above.
    element.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "start" });
  };

  const arrive = (element: Element) => {
    appearObserver.disconnect();
    window.clearTimeout(appearTimer);
    align(element);

    // The page is still growing beneath us; hold the target in place briefly.
    window.addEventListener("wheel", userInteracted, { passive: true, once: true });
    window.addEventListener("touchstart", userInteracted, { passive: true, once: true });
    window.addEventListener("keydown", userInteracted, { once: true });

    settleObserver = new ResizeObserver(() => {
      if (cancelled) return;
      const current = document.getElementById(target);
      if (current) align(current);
    });
    settleObserver.observe(document.body);
    settleTimer = window.setTimeout(cancel, SETTLE_MS);
  };

  const appearObserver = new MutationObserver(() => {
    const element = document.getElementById(target);
    if (element) arrive(element);
  });

  const existing = document.getElementById(target);
  if (existing) {
    arrive(existing);
    return cancel;
  }

  appearObserver.observe(document.body, { childList: true, subtree: true });
  appearTimer = window.setTimeout(cancel, APPEAR_TIMEOUT_MS);

  return cancel;
};
