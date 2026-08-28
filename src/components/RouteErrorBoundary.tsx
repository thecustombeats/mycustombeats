import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render-time errors so a failure on one route cannot blank the site.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every secondary page is `lazy()`-loaded, so React fetches its chunk on
 * demand. Chunk filenames carry a content hash, so a rebuild changes them.
 * A browser holding an older application shell therefore asks for a chunk
 * the server no longer has, `import()` rejects with "Failed to fetch
 * dynamically imported module", and — with nothing to catch it — React
 * unmounted the entire tree. The result was a blank white page on every
 * lazy route, while the homepage kept working because its chunks were
 * already cached from the first visit.
 *
 * A stale shell is self-correcting: reloading fetches a fresh index.html
 * with the current hashes. So for chunk-load failures this boundary
 * reloads once, silently, which is the actual remedy rather than a
 * cosmetic cover-up. `sessionStorage` prevents a reload loop if the chunk
 * is genuinely missing rather than merely stale.
 *
 * Any other error falls through to a calm, on-brand message with a way
 * out. Stack traces are never shown to customers.
 */

const RELOAD_FLAG = "mcb_chunk_reload_at";

/**
 * How recently a recovery reload must have happened for us to conclude that
 * reloading is not working. Long enough to cover a reload plus a lazy fetch,
 * short enough that a genuine stale shell later in the session still
 * self-heals.
 */
const RELOAD_COOLDOWN_MS = 30_000;

/**
 * True when a recovery reload already happened moments ago — meaning the
 * chunk is genuinely missing rather than merely stale, and reloading again
 * would just loop.
 */
const reloadedRecently = (): boolean => {
  const at = Number(sessionStorage.getItem(RELOAD_FLAG) ?? 0);
  return at > 0 && Date.now() - at < RELOAD_COOLDOWN_MS;
};

/** True for the family of errors browsers raise when a chunk 404s. */
const isChunkLoadError = (error: Error): boolean =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    `${error.name} ${error.message}`
  );

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error) && !reloadedRecently()) {
      // The shell is probably out of date. Reload once to pick up the
      // current hashes. The timestamp is only ever cleared by time, never
      // on mount — the boundary mounts successfully before a lazy import
      // rejects, so clearing on mount would re-arm the reload and loop.
      sessionStorage.setItem(RELOAD_FLAG, String(Date.now()));
      window.location.reload();
      return;
    }

    // Reloading did not help, or this is a genuine bug. Keep it in the
    // console for diagnosis; the customer sees the message below.
    console.error("Route failed to render:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-ivory flex items-center justify-center px-6 py-24">
        <div className="max-w-md text-center">
          <p className="label-uppercase text-gold-deep mb-5">
            Something went wrong
          </p>

          <h1 className="font-serif text-espresso mb-5">
            This page didn&rsquo;t load
          </h1>

          <p className="text-espresso/70 leading-relaxed mb-9">
            Sorry — something on our side stopped this page from opening. Your
            details are safe and nothing has been charged. Reloading usually
            fixes it.
          </p>

          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full bg-ink text-ivory hover:bg-gold hover:text-ink transition-colors duration-300"
            >
              Reload the page
            </button>

            <a
              href="/"
              className="px-7 py-3 text-[11px] tracking-[0.2em] uppercase rounded-full border border-espresso/25 text-espresso hover:border-ink transition-colors duration-300"
            >
              Back to home
            </a>
          </div>

          <p className="text-sm text-espresso/50 mt-9">
            Still stuck?{" "}
            <a
              href="mailto:hello@mycustombeats.com"
              className="text-gold-deep underline underline-offset-2"
            >
              hello@mycustombeats.com
            </a>
          </p>
        </div>
      </main>
    );
  }
}

export default RouteErrorBoundary;
