import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from "react-helmet-async";
import './index.css'
import App from './App.tsx'

/**
 * Remove the static Open Graph image before React renders.
 *
 * index.html carries one so a crawler that does not execute JavaScript —
 * which is most social crawlers — still finds a share image in the raw HTML.
 * But react-helmet-async cannot replace a tag it did not create, so once the
 * app emits the per-route image the page would carry two og:image tags and
 * crawlers read the first: every page would share the homepage photograph.
 *
 * Dropping the static tag here leaves exactly one og:image in a rendered
 * page, while the raw HTML keeps its default untouched.
 */
document.getElementById('static-og-image')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </HelmetProvider>
  </StrictMode>,
)