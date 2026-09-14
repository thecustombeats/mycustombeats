import { Link } from "react-router-dom";
import ResponsiveImage from "../../components/ResponsiveImage";
import { McbButtonLink } from "../../components/mcb/McbButton";
import SectionHeading from "../../components/mcb/SectionHeading";
import {
  LYRICS_FRAME,
  PERSONALISED_MUSIC_PLAQUE,
  priceSummary,
  publicProducts,
} from "../../data/catalogue";
import { IMAGES, type McbImage } from "../../data/imagery";

/**
 * A light teaser for Keepsakes & Gifts. Names, lines, prices and disclosures
 * come from the catalogue. The plaque has no approved photograph, so it is
 * shown typographically, and its "does not play music" disclosure travels
 * with it. Its approximate size is deliberately not shown.
 */

/** Players are shown as a family with one photograph, so no single price is
 *  put beside a picture of a different model. */
const HAS_PLAYERS = publicProducts().some((product) => product.category === "PLAYER");

interface Tile {
  key: string;
  name: string;
  line: string;
  price: string;
  image: McbImage | null;
  imageAlt?: string;
  disclosures: readonly string[];
}

const TILES: readonly Tile[] = ([
  {
    key: LYRICS_FRAME.id,
    name: LYRICS_FRAME.name,
    line: LYRICS_FRAME.positioning,
    price: priceSummary(LYRICS_FRAME),
    image: IMAGES.lyricsFrame,
    imageAlt: "A framed lyrics print standing on a sideboard",
    disclosures: LYRICS_FRAME.disclosures,
  },
  {
    key: "players",
    name: "Gramophones & record players",
    line: "Beautiful ways to play the records you keep.",
    price: "",
    image: IMAGES.brassGramophone,
    imageAlt: "A classic gramophone with a large decorated horn",
    disclosures: [],
  },
  {
    key: PERSONALISED_MUSIC_PLAQUE.id,
    name: PERSONALISED_MUSIC_PLAQUE.name,
    line: PERSONALISED_MUSIC_PLAQUE.positioning,
    price: priceSummary(PERSONALISED_MUSIC_PLAQUE),
    image: null,
    disclosures: PERSONALISED_MUSIC_PLAQUE.disclosures,
  },
] satisfies Tile[]).filter((tile) => tile.key !== "players" || HAS_PLAYERS);

const CuratedAdditions = () => (
  <section aria-labelledby="additions-heading" className="bg-[#F1ECE3] px-5 py-20 sm:px-8 md:py-28">
    <div className="mx-auto max-w-6xl">
      <SectionHeading
        id="additions-heading"
        eyebrow="Keepsakes & gifts"
        title="Pieces to live alongside the music"
        intro={<p>A few carefully chosen additions, added when you create your memory.</p>}
      />

      <ul className="mt-14 grid list-none gap-6 p-0 md:grid-cols-3">
        {TILES.map((tile) => (
          <li key={tile.key} className="flex flex-col overflow-hidden rounded-[1.5rem] bg-white">
            <div className="aspect-[4/3] overflow-hidden bg-ivory">
              {tile.image ? (
                <ResponsiveImage
                  image={tile.image}
                  alt={tile.imageAlt}
                  sizes="(min-width: 768px) 30vw, 92vw"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center border-b border-ink/5 px-8 text-center">
                  <span className="font-serif text-3xl font-semibold leading-tight text-ink">Your photograph.</span>
                  <span className="font-serif text-3xl italic leading-tight text-gold-deep">Your favourite song.</span>
                  <span aria-hidden="true" className="mt-5 h-px w-12 bg-gold" />
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-ink" style={{ fontSize: "1.7rem" }}>
                {tile.name}
              </h3>
              <p className="mt-2 text-base leading-relaxed text-espresso/80">{tile.line}</p>
              {tile.disclosures.length > 0 && (
                <ul className="mt-4 list-none space-y-2 p-0">
                  {tile.disclosures.map((disclosure) => (
                    <li key={disclosure} className="border-l-2 border-gold pl-3 text-[0.9375rem] leading-relaxed text-ink">
                      {disclosure}
                    </li>
                  ))}
                </ul>
              )}
              {tile.price && <p className="mt-auto pt-5 text-lg text-ink">{tile.price}</p>}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-12 flex flex-col items-center gap-3 text-center">
        <McbButtonLink to="/products" tone="secondary">
          Explore Keepsakes &amp; Gifts
        </McbButtonLink>
        <Link to="/create" className="inline-flex min-h-12 items-center text-base text-ink underline decoration-gold underline-offset-4 hover:text-gold-deep">
          Or start with your song
        </Link>
      </div>
    </div>
  </section>
);

export default CuratedAdditions;
