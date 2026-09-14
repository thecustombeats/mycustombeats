import { useEffect, useId, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import {
  LinkError,
  approveWork,
  fetchApproval,
  formatDay,
  requestChanges,
  safeExternalUrl,
  tokenFromHash,
  type ApprovalView,
} from "../lib/customerOrder";

/**
 * /approve#<link> — listen, then approve or ask for changes.
 *
 * Two clear choices and nothing else. Approving asks once more before it is
 * sent, because for a keepsake it is the point after which the music is made
 * into something physical. Nothing here uses the word "revision allowance"
 * or any other internal term.
 */

const card = "rounded-3xl border border-ink/10 bg-white p-6 md:p-8";
const primary =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";
const secondary =
  "inline-flex min-h-12 items-center justify-center rounded-full border-2 border-ink px-8 py-3 text-base font-semibold text-ink transition-colors hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2 disabled:opacity-70";

const Approve = () => {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const ids = useId();
  const [view, setView] = useState<ApprovalView | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "This link is incomplete. Please open the link from our email again.");
  const [mode, setMode] = useState<"choose" | "confirm-approve" | "changes">("choose");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const outcomeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchApproval(token)
      .then((v) => !cancelled && setView(v))
      .catch((e) => !cancelled && setError(e instanceof LinkError ? e.message : "We couldn't load this just now. Please try again."));
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (view?.outcome) outcomeRef.current?.focus();
  }, [view?.outcome]);

  const run = async (action: () => Promise<ApprovalView>) => {
    setBusy(true);
    setActionError(null);
    try {
      setView(await action());
      setMode("choose");
    } catch (e) {
      setActionError(e instanceof LinkError ? e.fields.feedback ?? e.message : "We couldn't save that just now. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const physical = view?.workflow === "PHYSICAL";
  const listen = safeExternalUrl(view?.preview_url ?? null);
  const thing = physical ? "your music" : "your song";

  return (
    <main className="min-h-screen bg-ivory px-5 pb-20 pt-28 text-espresso sm:px-8 md:pt-36">
      <Helmet>
        <title>Listen and approve | My Custom Beats</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <p className="label-uppercase text-gold-deep">Listen and approve</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-ink md:text-5xl">
            {view ? `Your ${physical ? "music" : "song"} is ready.` : "Listen and approve"}
          </h1>
          {view && (
            <p className="mt-4 text-lg">
              Reference: <span className="font-mono font-semibold text-ink">{view.reference}</span>
            </p>
          )}
        </header>

        {error && (
          <div role="alert" className={card}>
            <p className="text-lg leading-relaxed">{error}</p>
          </div>
        )}
        {!view && !error && <p className="text-lg" role="status">Loading…</p>}

        {view && view.outcome && (
          <div ref={outcomeRef} tabIndex={-1} role="status" className="rounded-3xl border-2 border-gold-dark bg-gold/10 p-6 focus:outline-none md:p-8">
            <p className="text-lg leading-relaxed">
              {view.outcome === "approved" || view.outcome === "already_approved"
                ? physical
                  ? "Thank you — you have approved your music. We'll now begin making your keepsake and email you when it is on its way."
                  : "Thank you — you have approved your song. We hope you love it."
                : "Thank you — we have your changes. We'll let you know when the new version is ready to listen to."}
            </p>
          </div>
        )}

        {view && view.position === "AWAITING_RESPONSE" && (
          <>
            <section className={card} aria-labelledby={`${ids}-listen`}>
              <h2 id={`${ids}-listen`} className="font-serif text-2xl text-ink">1. Listen</h2>
              {listen ? (
                <a href={listen} target="_blank" rel="noopener noreferrer" className={`${primary} mt-5`}>
                  Listen to {thing}<span className="sr-only"> (opens in a new window)</span>
                </a>
              ) : (
                <p className="mt-3 text-lg">The listening link is in our email to you.</p>
              )}
              <p className="mt-4 text-base text-espresso/80">Take your time. Nothing is treated as approved until you tell us.</p>
            </section>

            <section className={card} aria-labelledby={`${ids}-decide`}>
              <h2 id={`${ids}-decide`} className="font-serif text-2xl text-ink">2. Tell us what you think</h2>

              {mode === "choose" && (
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <button type="button" className={primary} onClick={() => setMode("confirm-approve")}>I'm happy — approve it</button>
                  <button type="button" className={secondary} onClick={() => setMode("changes")}>I'd like some changes</button>
                </div>
              )}

              {mode === "confirm-approve" && (
                <div className="mt-5 space-y-4">
                  <p className="text-lg leading-relaxed">
                    {physical
                      ? "Once you approve, we begin making your keepsake and the music can no longer be changed. If anything arrives wrong, that is still ours to put right."
                      : "Please confirm you are happy with your song."}
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="button" className={primary} disabled={busy} onClick={() => token && run(() => approveWork(token))}>
                      {busy ? "Saving…" : "Yes, approve it"}
                    </button>
                    <button type="button" className={secondary} disabled={busy} onClick={() => setMode("choose")}>Go back</button>
                  </div>
                </div>
              )}

              {mode === "changes" && (
                <form
                  className="mt-5 space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (feedback.trim().length < 3) {
                      setActionError("Please tell us what you would like changed.");
                      return;
                    }
                    if (token) run(() => requestChanges(token, feedback.trim()));
                  }}
                >
                  <label htmlFor={`${ids}-feedback`} className="block text-base font-semibold text-ink">What would you like changed?</label>
                  <textarea id={`${ids}-feedback`} rows={6} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} className="w-full min-h-12 rounded-xl border border-ink/25 bg-white px-4 py-3 text-base text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2" placeholder="For example: a line you'd like reworded, or the pace of the chorus." />
                  {view.revisions.included !== null && (
                    <p className="text-base text-espresso/80">
                      {view.revisions.used < view.revisions.included
                        ? "A reasonable change like this is included in your order."
                        : "We'll read your request and be in touch about it."}
                    </p>
                  )}
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button type="submit" className={primary} disabled={busy}>{busy ? "Sending…" : "Send my changes"}</button>
                    <button type="button" className={secondary} disabled={busy} onClick={() => setMode("choose")}>Go back</button>
                  </div>
                </form>
              )}

              {actionError && <p role="alert" className="mt-4 rounded-xl bg-[#FDECEC] px-4 py-3 text-base font-semibold text-[#9B2C2C]">{actionError}</p>}
            </section>
          </>
        )}

        {view && !view.outcome && view.position === "APPROVED" && (
          <div className={card} role="status">
            <p className="text-lg">You approved this{view.approved_on ? ` on ${formatDay(view.approved_on)}` : ""}. Thank you.</p>
          </div>
        )}
        {view && !view.outcome && view.position === "CHANGES_REQUESTED" && (
          <div className={card} role="status">
            <p className="text-lg">We have your changes and are working on them. We'll email you when the new version is ready.</p>
          </div>
        )}
        {view && view.position === "CLOSED" && (
          <div className={card} role="status">
            <p className="text-lg">This version can no longer be approved or changed here. If you need anything, reply to our email and we'll help.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Approve;
