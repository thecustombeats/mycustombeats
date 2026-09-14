import { Helmet } from "react-helmet-async";
import { Link, useParams } from "react-router-dom";
import ResponsiveImage from "../components/ResponsiveImage";
import { getBlogPost } from "../data/blog/posts";
import type { BlogBlock } from "../data/blog/types";
import { IMAGES, imageSrc } from "../data/imagery";
import { blogPostStructuredData } from "../lib/seo";
import { formatDay } from "../lib/customerOrder";
import NotFound from "./NotFound";

const ctaClass =
  "inline-flex min-h-12 items-center justify-center rounded-full bg-ink px-8 py-3 text-base font-semibold text-ivory transition-colors hover:bg-[#1c2d40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-deep focus-visible:ring-offset-2";

const Block = ({ block }: { block: BlogBlock }) => {
  switch (block.type) {
    case "p":
      return <p className="mt-5 text-lg leading-relaxed">{block.text}</p>;
    case "h2":
      return <h2 id={block.id} className="mt-12 scroll-mt-28 font-serif text-3xl leading-tight text-ink">{block.text}</h2>;
    case "h3":
      return <h3 className="mt-8 font-serif text-2xl text-ink">{block.text}</h3>;
    case "ul":
      return <ul className="mt-5 list-disc space-y-2 pl-6 text-lg leading-relaxed">{block.items.map((item) => <li key={item}>{item}</li>)}</ul>;
    case "ol":
      return <ol className="mt-5 list-decimal space-y-2 pl-6 text-lg leading-relaxed">{block.items.map((item) => <li key={item}>{item}</li>)}</ol>;
    case "tip":
      return (
        <aside className="mt-6 rounded-2xl border-l-4 border-gold-dark bg-white p-5">
          <p className="font-semibold text-ink">{block.title}</p>
          <p className="mt-2 text-lg leading-relaxed">{block.text}</p>
        </aside>
      );
    case "cta":
      return (
        <p className="mt-6 text-lg leading-relaxed">
          {block.text}{" "}
          <Link to={block.to} className="font-semibold text-ink underline underline-offset-4">{block.label}</Link>
        </p>
      );
  }
};

/** /blog/:slug — one article. */
const BlogPost = () => {
  const { slug = "" } = useParams();
  const post = getBlogPost(slug);
  if (!post) return <NotFound />;

  const image = IMAGES[post.heroImage];
  const imageUrl = imageSrc(image, 1600);
  const related = post.related.map(getBlogPost).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const sections = post.content.filter((b): b is Extract<BlogBlock, { type: "h2" }> => b.type === "h2");

  return (
    <div className="bg-ivory px-5 pb-20 pt-28 text-espresso sm:px-8 md:pt-36">
      <Helmet>
        <title>{post.seoTitle}</title>
        <meta name="description" content={post.metaDescription} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.metaDescription} />
        <meta property="og:image" content={`https://www.mycustombeats.com${imageUrl}`} />
        <meta property="og:image:alt" content={post.heroAlt ?? image.alt} />
        <meta property="article:published_time" content={post.publishedAt} />
        <meta property="article:modified_time" content={post.updatedAt} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.metaDescription} />
        <meta name="twitter:image" content={`https://www.mycustombeats.com${imageUrl}`} />
        <script type="application/ld+json">
          {JSON.stringify(blogPostStructuredData({ ...post, imageUrl }))}
        </script>
      </Helmet>

      <article className="mx-auto max-w-3xl">
        <nav aria-label="Breadcrumb" className="text-base">
          <ol className="m-0 flex flex-wrap list-none gap-2 p-0">
            <li><Link to="/" className="underline underline-offset-4">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link to="/blog" className="underline underline-offset-4">Blog</Link></li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-espresso/80">{post.title}</li>
          </ol>
        </nav>

        <header className="mt-6">
          <p className="label-uppercase text-gold-deep">{post.categories.join(" · ")}</p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.1] text-ink md:text-5xl">{post.title}</h1>
          <p className="mt-5 text-xl leading-relaxed text-espresso/85">{post.excerpt}</p>
          <p className="mt-5 text-base text-espresso/80">
            By {post.author.name} · <time dateTime={post.publishedAt}>{formatDay(post.publishedAt)}</time>
            {post.updatedAt !== post.publishedAt && <> · Updated <time dateTime={post.updatedAt}>{formatDay(post.updatedAt)}</time></>}
          </p>
        </header>

        <figure className="mt-8 overflow-hidden rounded-3xl">
          <ResponsiveImage image={image} alt={post.heroAlt} sizes="(min-width: 768px) 768px, 100vw" priority className="h-auto w-full" />
        </figure>

        {sections.length > 3 && (
          <nav aria-label="In this article" className="mt-10 rounded-2xl border border-ink/10 bg-white p-6">
            <p className="font-semibold text-ink">In this article</p>
            <ol className="mt-3 list-decimal space-y-1 pl-6 text-base">
              {sections.map((s) => <li key={s.id}><a href={`#${s.id}`} className="underline underline-offset-4">{s.text}</a></li>)}
            </ol>
          </nav>
        )}

        <div className="mt-4">
          {post.content.map((block, index) => <Block key={index} block={block} />)}
        </div>

        <section aria-labelledby="post-cta" className="mt-14 rounded-3xl bg-ink p-8 text-ivory md:p-10">
          <h2 id="post-cta" className="font-serif text-3xl !text-ivory">{post.cta.heading}</h2>
          <p className="mt-3 text-lg leading-relaxed text-ivory/85">{post.cta.text}</p>
          <Link to={post.cta.to} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-8 py-3 text-base font-semibold text-ink hover:bg-gold-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-ink">
            {post.cta.label}
          </Link>
        </section>

        {related.length > 0 && (
          <section aria-labelledby="post-related" className="mt-14">
            <h2 id="post-related" className="font-serif text-3xl text-ink">Keep reading</h2>
            <ul className="m-0 mt-6 grid list-none gap-4 p-0 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug} className="rounded-2xl border border-ink/10 bg-white p-5">
                  <Link to={`/blog/${r.slug}`} className="font-serif text-xl text-ink underline-offset-4 hover:underline">{r.title}</Link>
                  <p className="mt-2 text-base leading-relaxed">{r.excerpt}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-12"><Link to="/blog" className={ctaClass}>All articles</Link></p>
      </article>
    </div>
  );
};

export default BlogPost;
