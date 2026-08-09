import Image from "next/image";

export type StationCardStation = {
  slug: string;
  name: string;
  description: string | null;
};

/**
 * A station on La Strada.
 *
 * The image is found by slug — `/stations/${slug}.png` — so there's no mapping
 * table to keep in step with the database. Adding a station means adding a row
 * and a correspondingly named file, and a mismatch shows up as a missing image
 * rather than as the wrong station's picture. See public/README.md.
 */
export function StationCard({
  station,
  locked = false,
}: {
  station: StationCardStation;
  locked?: boolean;
}) {
  return (
    <article
      className={`overflow-hidden rounded-xl border border-navy/10 bg-white/60 transition ${
        locked ? "opacity-60" : "hover:border-navy/25 hover:shadow-sm"
      }`}
    >
      <div className="relative aspect-3/2 overflow-hidden bg-sky/20">
        <Image
          src={`/stations/${station.slug}.png`}
          // Empty alt: the station's name sits directly below in text, so
          // announcing it twice would only get in the way. The image is
          // atmosphere, not information.
          alt=""
          fill
          // Tells Next which widths to generate, so a phone doesn't fetch a
          // desktop-sized image.
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
          className={`object-cover ${locked ? "grayscale" : ""}`}
        />
      </div>

      <div className="p-4">
        <h3 className="font-display text-xl italic text-navy">{station.name}</h3>
        {station.description ? (
          <p className="mt-1 text-sm text-navy/70">{station.description}</p>
        ) : null}
        {locked ? (
          <p className="font-mono mt-3 text-[0.65rem] tracking-widest text-navy/50 uppercase">
            Unlocks when you&rsquo;re active
          </p>
        ) : null}
      </div>
    </article>
  );
}
