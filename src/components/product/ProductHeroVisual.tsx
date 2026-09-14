import type { Product, Variant } from "../../data/catalogue";
import { PACKAGE_IMAGERY, type McbImage } from "../../data/imagery";
import FormatVisual from "../FormatVisual";
import ResponsiveImage from "../ResponsiveImage";

interface ProductHeroVisualProps {
  product: Product;
  variant: Variant;
}

/**
 * The hero visual for a product page: the experience's mood photograph, with a
 * drawn illustration of the SELECTED format laid over it.
 *
 * The photograph sets the feeling; the illustration shows exactly what is being
 * chosen. No picture-disc photograph exists, so a Keepsake is never shown as
 * the black Journey record — the drawing does that job honestly and changes
 * with the selected variant.
 */
const ProductHeroVisual = ({ product, variant }: ProductHeroVisualProps) => {
  const photo: McbImage | undefined = (PACKAGE_IMAGERY as Record<string, McbImage>)[product.id];

  return (
    <figure className="relative m-0">
      {photo ? (
        <div className="overflow-hidden rounded-[1.75rem] bg-ink/5">
          <ResponsiveImage
            image={photo}
            sizes="(min-width: 1024px) 45vw, 100vw"
            priority
            className="aspect-[4/5] h-full w-full object-cover sm:aspect-[5/4] lg:aspect-[4/5]"
          />
        </div>
      ) : (
        <div className="aspect-[5/4] rounded-[1.75rem] bg-ink" aria-hidden="true" />
      )}

      <div className="absolute -bottom-6 left-4 w-36 rounded-2xl border border-ink/10 bg-ivory p-3 shadow-[0_18px_40px_-18px_rgba(13,27,42,0.45)] sm:left-6 sm:w-44">
        <FormatVisual key={variant.sku} product={product} variant={variant} className="h-auto w-full" />
        <p className="mt-1 text-center text-xs font-medium text-espresso/70">Illustration</p>
      </div>
    </figure>
  );
};

export default ProductHeroVisual;
