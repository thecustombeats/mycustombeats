import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "react-router-dom";
import { fetchRetiredApproval, tokenFromHash } from "../lib/customerOrder";

/**
 * /approve#<link> — RETIRED.
 *
 * Customer song and artwork approval was retired by the Single Creative
 * Authority decision (15 September 2026). Links sent under the old model
 * (historical and test orders only) land here and get a polite explanation.
 * There is nothing to approve, change or listen to on this page, and the
 * server records nothing for these requests. The page stays private
 * (noindex, no referrer, no analytics).
 */

const card = "rounded-3xl border border-ink/10 bg-white p-6 md:p-8";

const FALLBACK =
  "This link is no longer used. MCB now creates and checks your work without a separate approval step, and your finished creation is revealed on your private order page. If you need anything, reply to our email and we will help.";

const Approve = () => {
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [message, setMessage] = useState<string>(FALLBACK);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchRetiredApproval(token)
      .then((view) => !cancelled && setMessage(view.message || FALLBACK))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-ivory px-5 pb-20 pt-28 text-espresso sm:px-8 md:pt-36">
      <Helmet>
        <title>Your MCB order | My Custom Beats</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="referrer" content="no-referrer" />
      </Helmet>
      <div className="mx-auto max-w-3xl space-y-8">
        <header>
          <p className="label-uppercase text-gold-deep">Your MCB order</p>
          <h1 className="mt-3 font-serif text-4xl leading-tight text-ink md:text-5xl">This link is no longer used</h1>
        </header>
        <div role="status" className={card}>
          <p className="text-lg leading-relaxed">{message}</p>
          <p className="mt-4 text-base leading-relaxed text-espresso/80">
            You provide the memories. We create the surprise.{" "}
            <Link to="/faq" className="font-semibold text-ink underline underline-offset-4">How MCB creates</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Approve;
