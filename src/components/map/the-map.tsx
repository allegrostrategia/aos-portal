import Image from "next/image";
import Link from "next/link";

import { ARTWORKS, LANDSCAPE, PORTRAIT, type MapArtwork } from "@/lib/map/positions";
import { MAP_LINES, bendFor, spokePath, storyPath, strokeColourFor, yourStoryPoints } from "@/lib/map/lines";
import { flipsLabel, labelMetrics } from "@/lib/map/markers";
import { StationDot } from "./station-dot";

/**
 * The Map: the eleven stations on the town, seen from above (Build Brief §3).
 *
 * **Two pictures since 19 Sep 2026.** A landscape one for screens 768px and
 * wider, a portrait one for phones. Both are rendered, one hidden per
 * breakpoint in CSS, so the right map is there on first paint with no
 * viewport check and no flash of the wrong one. Every number about a picture
 * (positions, hub, bends, mask, tile size) lives with that picture in
 * lib/map/positions; nothing here knows which is which.
 *
 * Neither picture overflows its frame any more (the portrait fits a phone's
 * width; the landscape fits its column), so the side-scrolling, dragging and
 * keyboard panning the single 16:9 picture needed are gone with it. The
 * component is server-rendered as a result.
 *
 * Markers, since the Dots brief (19 Sep): a pulsing gold dot with a pill
 * label, and a card with the photo on hover or tap (station-dot.tsx). The
 * photo tiles that preceded them showed eleven pictures at once and read as
 * clutter. Labels flip to the left of their dot where the right would run
 * off the picture; lib/map/markers decides that and tests that every one
 * fits. The Your Story dots keep their size variable; nothing else scales.
 *
 * Lines: a coloured spoke from the fountain to each station on its line, and
 * the Your Story route along the shore between the harbour and Archivio.
 */

export type MapStation = {
  slug: string;
  name: string;
  /** The station's number, from `stations.sort_order`: the card's kicker. */
  number: number;
  /** The station's description, trimmed to a line for the card. */
  description: string | null;
};

/** The Your Story dots' size: a fraction of the picture, with a floor. */
function sizes(artwork: MapArtwork): React.CSSProperties {
  return { "--dot": `max(0.75rem, ${artwork.storyDotPercent}cqw)` } as React.CSSProperties;
}

/** One line of the description: cut at a word, with an ellipsis, past 80 characters. */
function oneLine(text: string | null): string | null {
  if (!text) return null;
  const t = text.trim();
  if (t.length <= 80) return t;
  const cut = t.slice(0, 77);
  return `${cut.slice(0, Math.max(40, cut.lastIndexOf(" ")))}…`;
}

/** A label on the map that isn't a station — Piazza itself, and Piazza Sociale. */
function PlaceLabel({
  at,
  children,
  href,
}: {
  at: { x: number; y: number };
  children: React.ReactNode;
  href?: string;
}) {
  const content = (
    <span className="block rounded-md bg-white/95 px-2.5 py-1 text-center text-[0.65rem] font-medium whitespace-nowrap text-ink shadow-md sm:text-caption">
      {children}
    </span>
  );
  const style = { left: `${at.x}%`, top: `${at.y}%` } as const;
  const position = "absolute -translate-x-1/2 -translate-y-1/2";

  return href ? (
    <Link href={href} style={style} className={`${position} rounded-md transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange`}>
      {content}
    </Link>
  ) : (
    <span style={style} className={position}>{content}</span>
  );
}

function MapLayer({
  artwork,
  stations,
  locked,
  className,
}: {
  artwork: MapArtwork;
  stations: MapStation[];
  locked: boolean;
  className: string;
}) {
  const placed = stations.filter((s) => s.slug in artwork.stations);
  const storyPoints = yourStoryPoints(artwork);
  const storyLine = MAP_LINES.find((l) => l.ownRoute);
  const shadowId = `map-line-shadow-${artwork.key}`;

  return (
    <div className={`relative rounded-xl border border-ink/10 bg-sky/10 ${className}`} style={{ containerType: "inline-size" }}>
      {/* No overflow clipping on the layer: a card near an edge opens past
          it. The picture and the lines carry the rounding themselves. */}
      <Image
        src={`/illustrations/${artwork.file}`}
        alt="The Map. The town, seen from above"
        width={artwork.width}
        height={artwork.height}
        priority={artwork.key === "landscape"}
        sizes={artwork.key === "portrait" ? "100vw" : "(min-width: 1024px) 60rem, 100vw"}
        className="h-auto w-full rounded-xl"
      />

      {/* Lines under everything. viewBox in percentages so the coordinates
          are the same numbers as the positions; non-scaling stroke so
          `preserveAspectRatio="none"` doesn't stretch the line weight along
          with the box. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full rounded-xl">
        <defs>
          {/* A soft dark shadow rather than a pale halo: half the picture is
              bright limestone and half deep blue sea, and a light casing
              vanishes on the square, where most of the lines are. */}
          <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.35" stdDeviation="0.45" floodColor="#000" floodOpacity="0.45" />
          </filter>
        </defs>

        <g filter={`url(#${shadowId})`} opacity={locked ? 0.55 : 1}>
          {MAP_LINES.filter((line) => !line.ownRoute).map((line) =>
            line.stations.map((slug, index) => {
              const pos = artwork.stations[slug];
              if (!pos) return null;
              return (
                <path
                  key={`${line.key}-${slug}`}
                  d={spokePath(pos, bendFor(index, line.stations.length), artwork.hub)}
                  fill="none"
                  stroke={strokeColourFor(line)}
                  strokeWidth={4}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            }),
          )}

          {storyLine && storyPoints.length > 1 ? (
            <path
              d={storyPath(storyPoints)}
              fill="none"
              stroke={strokeColourFor(storyLine)}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
              opacity={0.9}
            />
          ) : null}
        </g>

      </svg>

      {/* The bends on the story line, which the legend calls Your Story
          Stations: they mark where it touches down, not the stations. HTML
          rather than SVG circles: the SVG above is stretched to the picture,
          so a circle in it is an ellipse, tall on the portrait and wide on
          the landscape. */}
      {storyPoints.slice(1, -1).map((point) => (
        <span
          key={`${point.x}-${point.y}`}
          aria-hidden
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white shadow-md"
          style={{ ...sizes(artwork), left: `${point.x}%`, top: `${point.y}%`, width: "var(--dot)", height: "var(--dot)", borderColor: "var(--aos-navy)" }}
        />
      ))}

      {/* The hub and Piazza Sociale: the open square is kept clear of markers,
          so both are labels rather than tiles. */}
      <PlaceLabel at={artwork.hub} href={locked ? undefined : "/piazza"}>Piazza. Home</PlaceLabel>
      <PlaceLabel at={artwork.sociale} href={locked ? undefined : "/sociale"}>Piazza Sociale</PlaceLabel>

      {placed.map((station) => {
        const pos = artwork.stations[station.slug];
        const line = MAP_LINES.find((l) => l.stations.includes(station.slug));
        return (
          <StationDot
            key={station.slug}
            slug={station.slug}
            name={station.name}
            kicker={`${String(station.number).padStart(2, "0")} · ${line?.label ?? "Station"}`}
            description={oneLine(station.description)}
            x={pos.x}
            y={pos.y}
            flip={flipsLabel(pos, artwork, station.name.length)}
            cardAbove={pos.y > 62}
            metrics={labelMetrics(artwork)}
            href={locked ? null : `/stations/${station.slug}`}
          />
        );
      })}

      {/* The key on the picture, bottom right: the reference's placement.
          Landscape only; on the portrait it would cover the harbour. */}
      {artwork.key === "landscape" ? (
        <div className="pointer-events-none absolute right-3 bottom-3 rounded-lg bg-white/85 px-3 py-2.5 shadow-lg">
          <ul className="flex flex-col gap-1.5">
            {MAP_LINES.map((line) => (
              <li key={line.key} className="flex items-center gap-2.5">
                <span aria-hidden className="block h-1 w-6 shrink-0 rounded-full" style={{ backgroundColor: strokeColourFor(line) }} />
                <span className="text-caption whitespace-nowrap text-ink/80">{line.label}</span>
              </li>
            ))}
            <li className="flex items-center gap-2.5">
              <span aria-hidden className="block size-2.5 shrink-0 rounded-full border-2 bg-white" style={{ borderColor: "var(--aos-navy)" }} />
              <span className="text-caption whitespace-nowrap text-ink/80">Your Story Stations</span>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function TheMap({
  stations,
  locked = false,
}: {
  stations: MapStation[];
  /** Onboarding members see the town but can't walk into it yet (§3). */
  locked?: boolean;
}) {
  return (
    <div>
      {locked ? <p className="mb-3 text-small text-ink/60">Every room opens when you&rsquo;re active.</p> : null}

      {/* Both layers, one per breakpoint. `md` is where the portrait gives way
          to the landscape (Dom, 19 Sep). */}
      <MapLayer artwork={LANDSCAPE} stations={stations} locked={locked} className="hidden md:block" />
      <MapLayer artwork={PORTRAIT} stations={stations} locked={locked} className="md:hidden" />

      {/* The key below the picture on phones, where the portrait has no panel. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 md:hidden">
        {MAP_LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-2">
            <span aria-hidden className="block h-1 w-5 rounded-full" style={{ backgroundColor: strokeColourFor(line) }} />
            <span className="text-caption text-ink/60">{line.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Named so a test can ask which pictures the component draws.
export const MAP_ARTWORKS = ARTWORKS;
