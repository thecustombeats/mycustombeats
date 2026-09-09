import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from "react-helmet-async";
import { CurrencyProvider } from "./lib/currencyContext";
import './index.css'
import App from './App.tsx'

/**
 * Remove the static, homepage-specific SEO tags before React renders.
 *
 * index.html carries a description, an og:title, an og:description, an
 * og:url and an og:image so a crawler that does not execute JavaScript —
 * which is most social crawlers — still finds them in the raw HTML.
 *
 * But react-helmet-async cannot REPLACE a tag it did not create; it only
 * appends its own. Left in place, each static tag stayed in the head on every
 * route, positioned above the per-page tag that was supposed to supersede it.
 * Crawlers read the first of a duplicated meta, so /products and /faq
 * advertised the homepage description and the homepage og:url while their own
 * values sat below, unread. Only <title> escaped, because a document has one
 * title element and helmet rewrites that in place — which is exactly why the
 * problem was invisible: the titles all looked right.
 *
 * Dropping them here leaves exactly ONE of each in a rendered page, while the
 * raw HTML a non-JS crawler fetches keeps its defaults untouched.
 *
 * Marked in the HTML with `data-static-seo` rather than listed here by id, so
 * adding a fallback tag there does not require remembering to edit this file.
 */
document
  .querySelectorAll('head meta[data-static-seo]')
  .forEach((tag) => tag.remove())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      {/* Display currency is site-wide: a package card, a product block and
          the order summary must never disagree about which currency the
          customer is reading. Mounted above the router so the choice also
          survives navigation between routes. */}
      <CurrencyProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </CurrencyProvider>
    </HelmetProvider>
  </StrictMode>,
)