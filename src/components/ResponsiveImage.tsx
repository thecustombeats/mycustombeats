import type { ImgHTMLAttributes } from "react";
import { imageSrc, imageSrcSet, type McbImage } from "../data/imagery";

interface ResponsiveImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "alt" | "width" | "height"> {
  image: McbImage;
  /** The rendered width, e.g. "(min-width: 1024px) 25vw, 100vw". */
  sizes: string;
  /** Above-the-fold images load eagerly; everything else lazily. */
  priority?: boolean;
  /** Overrides the image's default description where context changes it. */
  alt?: string;
}

/**
 * An approved MCB photograph with a srcset and reserved dimensions, so it
 * neither over-downloads on a phone nor shifts the layout as it loads.
 */
const ResponsiveImage = ({ image, sizes, priority = false, alt, className, ...rest }: ResponsiveImageProps) => (
  <img
    src={imageSrc(image)}
    srcSet={imageSrcSet(image)}
    sizes={sizes}
    width={image.width}
    height={image.height}
    alt={alt ?? image.alt}
    loading={priority ? "eager" : "lazy"}
    decoding={priority ? "sync" : "async"}
    {...(priority ? { fetchPriority: "high" as const } : {})}
    className={className}
    {...rest}
  />
);

export default ResponsiveImage;
