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
      {/* Stated rather than inherited. index.html's fallback description is
          removed before render, so a page that sets none now has none — and
          a 404 describing itself as the homepage was never right anyway. */}
      <meta
        name="description"
        content="This page could not be found. Browse personalised songs, keepsakes and the rest of My Custom Beats."
      />
      <meta name="robots" content="noindex, follow" />
    </Helmet>

    <div className="flex min-h-screen items-center justify-center bg-ivory px-5 py-28 sm:px-8">
      <div className="max-w-xl text-center">
        <p className="label-uppercase mb-5 text-gold-deep">Page not found</p>

        <h1 className="mb-5 font-serif text-espresso">
          We couldn&rsquo;t find that page
        </h1>

        <p className="mb-10 text-lg leading-relaxed text-espresso/85">
          The link may be out of date, or the address slightly off. These will
          take you somewhere useful:
        </p>

        <nav aria-label="Popular pages" className="mb-10">
          <ul className="m-0 flex list-none flex-wrap justify-center gap-3 p-0">
            {[
              { to: "/", label: "Home" },
              { to: "/create", label: "Create your memory" },
              { to: "/products", label: "Keepsakes & gifts" },
              { to: "/blog", label: "Blog" },
              { to: "/faq", label: "FAQ" },
              { to: "/contact", label: "Contact us" },
            ].map((item) => (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className="inline-flex min-h-12 items-center rounded-full border border-espresso/30 px-6 text-base font-semibold text-espresso transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-ivory focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-base text-espresso/85">
          Looking for an order you&rsquo;ve already placed? Use the link in your
          email, or write to{" "}
          <a
            href="mailto:hello@mycustombeats.com"
            className="font-semibold text-ink underline underline-offset-2"
          >
            hello@mycustombeats.com
          </a>
          .
        </p>
      </div>
    </div>
  </>
);

export default NotFound;
