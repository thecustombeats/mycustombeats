import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import ResponsiveImage from "../components/ResponsiveImage";
import { BLOG_POSTS } from "../data/blog/posts";
import { IMAGES, imageSrc } from "../data/imagery";
import { blogIndexStructuredData } from "../lib/seo";
import { formatDay } from "../lib/customerOrder";

const DESCRIPTION =
  "Guides from My Custom Beats on turning memories into personalised songs, keeping travel memories alive and choosing a vinyl keepsake.";

/** /blog — the article index, newest first. */
const Blog = () => {
  const posts = [...BLOG_POSTS].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const share = posts[0] ? IMAGES[posts[0].heroImage] : null;

  return (
    <main className="bg-ivory px-5 pb-20 pt-28 text-espresso sm:px-8 md:pt-36">
      <Helmet>
        <title>Blog — Memories, Music and Keepsakes | My Custom Beats</title>
        <meta name="description" content={DESCRIPTION} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="The My Custom Beats blog" />
        <meta property="og:description" content={DESCRIPTION} />
        <meta name="twitter:card" content="summary_large_image" />
        {share && <meta property="og:image" content={`https://www.mycustombeats.com${imageSrc(share, 1600)}`} />}
        <script type="application/ld+json">{JSON.stringify(blogIndexStructuredData(posts))}</script>
      </Helmet>
      <div className="mx-auto max-w-6xl">
        <nav aria-label="Breadcrumb" className="text-base">
          <ol className="m-0 flex list-none gap-2 p-0">
            <li><Link to="/" className="underline underline-offset-4">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page">Blog</li>
          </ol>
        </nav>
        <header className="mt-6 max-w-3xl">
          <p className="label-uppercase text-gold-deep">The MCB blog</p>
          <h1 className="mt-3 font-serif text-5xl leading-[1.05] text-ink md:text-6xl">Memories, music and keepsakes</h1>
          <p className="mt-5 text-lg leading-relaxed text-espresso/85">{DESCRIPTION}</p>
        </header>

        <ul className="m-0 mt-12 grid list-none gap-8 p-0 md:grid-cols-3">
          {posts.map((post) => (
            <li key={post.slug}>
              <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-ink/10 bg-white">
                <div className="aspect-[4/3] overflow-hidden bg-ink/5">
                  <ResponsiveImage
                    image={IMAGES[post.heroImage]}
                    alt={post.heroAlt}
                    sizes="(min-width: 768px) 33vw, 100vw"
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <p className="text-sm font-semibold uppercase tracking-wide text-gold-deep">{post.categories[0]}</p>
                  <h2 className="mt-2 font-serif text-2xl leading-snug text-ink">
                    <Link to={`/blog/${post.slug}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep">
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-3 flex-1 text-base leading-relaxed">{post.excerpt}</p>
                  <p className="mt-4 text-sm text-espresso/75">
                    <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>
                  </p>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
};

export default Blog;
