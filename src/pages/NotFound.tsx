import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

/**
 * Catch-all for unregistered paths.
 *
 * The router previously had no `*` route, so any address that did not match
 * — a typo, an old link, a page that never existed — rendered nothing at
 * all and looked identical to a crash. Now it says what happened and offers
 * the routes people are usually looking for.
 *
 * `noindex` because a soft 404 in search results helps nobody.
 */
const NotFound = () => (
  <>
    <Helmet>
      <title>Page not found | My Custom Beats</title>
      <meta name="robots" content="noindex, follow" />
    </Helmet>

    <main className="min-h-screen bg-ivory flex items-center justify-center px-6 py-24">
      <div className="max-w-lg text-center">
        <p className="label-uppercase text-gold-deep mb-5">Page not found</p>

        <h1 className="font-serif text-espresso mb-5">
          We couldn&rsquo;t find that page
        </h1>

        <p className="text-espresso/70 leading-relaxed mb-10">
          The link may be out of date, or the address slightly off. Here is
          where most people are heading:
        </p>

        <nav
          aria-label="Popular pages"
          className="flex flex-wrap gap-3 justify-center mb-10"
        >
          {[
            { to: "/", label: "Home" },
            { to: "/#packages", label: "Experiences" },
            { to: "/products", label: "Keepsakes" },
            { to: "/faq", label: "FAQ" },
            { to: "/about", label: "Our story" },
          ].map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="px-6 py-2.5 text-[11px] tracking-[0.2em] uppercase rounded-full border border-espresso/25 text-espresso hover:bg-ink hover:text-ivory hover:border-ink transition-colors duration-300"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <p className="text-sm text-espresso/50">
          Looking for an order you&rsquo;ve already placed?{" "}
          <a
            href="mailto:hello@mycustombeats.com"
            className="text-gold-deep underline underline-offset-2"
          >
            hello@mycustombeats.com
          </a>
        </p>
      </div>
    </main>
  </>
);

export default NotFound;
