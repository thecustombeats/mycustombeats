import type { ReactNode } from "react";

interface SectionHeadingProps {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  align?: "center" | "left";
  /** For dark (Midnight Ink) sections. */
  onDark?: boolean;
  /** Heading level; sections use h2 unless nested. */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/** The standard eyebrow, heading and short introduction for a section. */
const SectionHeading = ({ id, eyebrow, title, intro, align = "center", onDark = false, as: Tag = "h2", className = "" }: SectionHeadingProps) => (
  <div className={`${align === "center" ? "mx-auto text-center" : ""} max-w-2xl ${className}`}>
    {eyebrow && (
      <p className={`label-uppercase mb-4 ${onDark ? "text-gold" : "text-gold-deep"}`}>{eyebrow}</p>
    )}
    <Tag id={id} className={onDark ? "!text-ivory" : "text-ink"}>
      {title}
    </Tag>
    {intro && (
      <div className={`mt-5 text-lg leading-relaxed ${onDark ? "text-ivory/80 [&_p]:text-ivory/80" : "text-espresso/75 [&_p]:text-espresso/75"}`}>
        {intro}
      </div>
    )}
  </div>
);

export default SectionHeading;
