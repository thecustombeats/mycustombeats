import { Helmet } from "react-helmet-async";

/**
 * Keeps a private or transactional page out of search results.
 *
 * Not access control: the server protects private data with tokens and the
 * CRM key. public/.htaccess sends the same instruction as an X-Robots-Tag
 * header, and robots.txt asks crawlers not to fetch these paths.
 */
const NoIndex = ({ title }: { title?: string }) => (
  <Helmet>
    {title && <title>{title}</title>}
    <meta name="robots" content="noindex, nofollow" />
  </Helmet>
);

export default NoIndex;
