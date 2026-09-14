/**
 * The MCB blog content model.
 *
 * Articles are structured blocks rather than an HTML string, so every page is
 * rendered as semantic HTML by React (headings, paragraphs, lists) with no
 * `dangerouslySetInnerHTML`, and a test can read every word for claims the
 * business cannot stand behind.
 */

import type { ImageKey } from "../imagery";

export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string; id: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: readonly string[] }
  | { type: "ol"; items: readonly string[] }
  | { type: "tip"; title: string; text: string }
  | { type: "cta"; text: string; label: string; to: string };

export interface BlogAuthor {
  /** An organisation, until a named person has approved being credited. */
  readonly type: "Organization";
  readonly name: string;
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly heroImage: ImageKey;
  /** Overrides the image's default alt text where the article context changes it. */
  readonly heroAlt?: string;
  readonly content: readonly BlogBlock[];
  /** ISO dates, YYYY-MM-DD. */
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly author: BlogAuthor;
  readonly categories: readonly string[];
  /** The <title>, when it should differ from the headline. */
  readonly seoTitle: string;
  readonly metaDescription: string;
  /** Slugs of related articles. */
  readonly related: readonly string[];
  /** The closing call to action. */
  readonly cta: { readonly heading: string; readonly text: string; readonly label: string; readonly to: string };
}
