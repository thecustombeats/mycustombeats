import { useId } from "react";
import type { Product, Variant } from "../data/catalogue";
import { describeVariant } from "../lib/formatText";

/**
 * A drawn representation of what a variant physically is — not a product
 * photograph.
 *
 * MCB has no approved picture-disc photography yet, and showing the black
 * Journey record against a Keepsake would misrepresent it. Drawing the format
 * honestly shows the differences a customer is choosing between: record size
 * (to scale), round or heart, picture disc or classic black vinyl, one record
 * or a gatefold pair.
 */

interface FormatVisualProps {
  product: Pick<Product, "id" | "name">;
  variant: Variant;
  className?: string;
}

const GOLD = "#C9A14A";
const INK = "#0D1B2A";
const IVORY = "#F8F5F0";

/** Record radius on a 200-unit canvas, proportional to its real diameter. */
const RADIUS: Record<number, number> = { 12: 88, 10: 73, 7: 51 };

const HEART = "M100 172 C 58 142 22 112 22 76 C 22 50 42 32 66 32 C 82 32 94 42 100 54 C 106 42 118 32 134 32 C 158 32 178 50 178 76 C 178 112 142 142 100 172 Z";

const PictureDisc = ({ variant, uid }: { variant: Variant; uid: string }) => {
  const vinyl = variant.vinyl!;
  const art = `${uid}-art`;
  const heart = vinyl.shape === "HEART";
  const r = RADIUS[vinyl.sizeInches] ?? 70;
  return (
    <>
      <defs>
        <radialGradient id={art} cx="42%" cy="38%" r="75%">
          <stop offset="0%" stopColor="#F3E3B8" />
          <stop offset="45%" stopColor="#D8B96A" />
          <stop offset="78%" stopColor="#8A6A2C" />
          <stop offset="100%" stopColor={INK} />
        </radialGradient>
        <clipPath id={`${uid}-clip`}>{heart ? <path d={HEART} /> : <circle cx="100" cy="100" r={r} />}</clipPath>
      </defs>
      {/* Full 12-inch outline for scale, so smaller records read as smaller. */}
      {!heart && <circle cx="100" cy="100" r={88} fill="none" stroke={INK} strokeOpacity="0.12" strokeDasharray="3 4" />}
      <g clipPath={`url(#${uid}-clip)`}>
        <rect x="0" y="0" width="200" height="200" fill={`url(#${art})`} />
        {/* An abstract printed image: a horizon and a low sun. */}
        <circle cx="118" cy="92" r="16" fill={IVORY} fillOpacity="0.75" />
        <path d="M0 118 Q 50 108 100 116 T 200 112 L200 200 L0 200 Z" fill={INK} fillOpacity="0.35" />
        <path d="M0 132 Q 60 124 110 132 T 200 128" stroke={IVORY} strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
      </g>
      {heart ? (
        <path d={HEART} fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
      ) : (
        <>
          <circle cx="100" cy="100" r={r} fill="none" stroke={INK} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="100" cy="100" r={r - 6} fill="none" stroke={IVORY} strokeOpacity="0.35" />
        </>
      )}
      <circle cx="100" cy="100" r="3.5" fill={IVORY} stroke={INK} strokeOpacity="0.5" />
    </>
  );
};

const BlackVinyl = ({ variant }: { variant: Variant }) => {
  const double = variant.vinyl!.discCount === 2;
  const sleeve = (x: number) => (
    <g>
      <rect x={x} y="44" width="104" height="112" rx="3" fill={IVORY} stroke={INK} strokeOpacity="0.3" />
      <rect x={x + 14} y="58" width="76" height="60" rx="2" fill={GOLD} fillOpacity="0.35" />
      <circle cx={x + 64} cy="80" r="9" fill={IVORY} fillOpacity="0.9" />
      <path d={`M${x + 14} 104 Q ${x + 40} 96 ${x + 60} 102 T ${x + 90} 100 L${x + 90} 118 L${x + 14} 118 Z`} fill={INK} fillOpacity="0.35" />
      <rect x={x + 14} y="128" width="52" height="4" rx="2" fill={INK} fillOpacity="0.45" />
      <rect x={x + 14} y="138" width="36" height="3" rx="1.5" fill={INK} fillOpacity="0.25" />
    </g>
  );
  const record = (cx: number) => (
    <g>
      <circle cx={cx} cy="100" r="54" fill="#111418" />
      {[46, 38, 30].map((ring) => (
        <circle key={ring} cx={cx} cy="100" r={ring} fill="none" stroke="#2A2F36" strokeWidth="1" />
      ))}
      <circle cx={cx} cy="100" r="17" fill={GOLD} />
      <circle cx={cx} cy="100" r="2.5" fill={IVORY} />
    </g>
  );
  // A gatefold: two records behind one sleeve that opens like a book.
  return double ? (
    <>
      {record(150)}
      {record(126)}
      {sleeve(22)}
      <line x1="74" y1="46" x2="74" y2="154" stroke={INK} strokeOpacity="0.35" strokeDasharray="4 3" />
    </>
  ) : (
    <>
      {record(128)}
      {sleeve(32)}
    </>
  );
};

const Frame = ({ variant }: { variant: Variant }) => {
  const d = variant.dimensions!;
  const scale = 150 / Math.max(d.widthInches, d.heightInches);
  const w = d.widthInches * scale;
  const h = d.heightInches * scale;
  const x = (200 - w) / 2;
  const y = (200 - h) / 2;
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={IVORY} stroke={INK} strokeWidth="5" />
      {[0.3, 0.42, 0.54, 0.66].map((line, i) => (
        <rect key={line} x={x + w * 0.2} y={y + h * line} width={w * (i % 2 ? 0.45 : 0.6)} height={Math.max(2, h * 0.02)} rx="1" fill={INK} fillOpacity="0.35" />
      ))}
    </>
  );
};

const Digital = () => (
  <>
    <circle cx="100" cy="100" r="78" fill={INK} />
    {[-40, -28, -16, -4, 8, 20, 32, 44].map((x, i) => {
      const heights = [18, 34, 52, 30, 60, 38, 24, 14];
      return <rect key={x} x={96 + x} y={100 - heights[i] / 2} width="6" height={heights[i]} rx="3" fill={GOLD} />;
    })}
  </>
);

const FormatVisual = ({ product, variant, className }: FormatVisualProps) => {
  const uid = useId().replace(/:/g, "");
  let body;
  if (variant.vinyl?.pictureDisc) body = <PictureDisc variant={variant} uid={uid} />;
  else if (variant.vinyl) body = <BlackVinyl variant={variant} />;
  else if (variant.dimensions) body = <Frame variant={variant} />;
  else body = <Digital />;

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label={describeVariant(product, variant)} className={className}>
      {body}
    </svg>
  );
};

export default FormatVisual;
