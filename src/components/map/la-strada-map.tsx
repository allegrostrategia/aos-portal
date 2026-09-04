"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import {
  PIAZZA_HUB,
  PIAZZA_SOCIALE,
  STATION_POSITIONS,
} from "@/lib/map/positions";
import {
  MAP_LINES,
  bendFor,
  lineColourFor,
  spokePath,
  storyPath,
  strokeColourFor,
  yourStoryPoints,
} from "@/lib/map/lines";

/**
 * La Strada — the town from above, with the eleven stations on it.
 *
 * §3: free-roam once active, navigated entirely by the member's own choice. The
 * only state is visited / not visited, so that is the only state drawn.
 *
 * **Pan is native scrolling, zoom is buttons.** A custom pointer-and-pinch layer
 * is the obvious reach and the wrong one: it re-implements momentum, edges and
 * two-finger handling that browsers already do properly, and breaks keyboard and
 * trackpad users on the way. Scrolling a container behaves identically on a
 * phone, a trackpad, a wheel and arrow keys, and can't be got subtly wrong.
 *
 * **Redrawn 4 Sep to the design reference.** Markers are photo tiles with a
 * numbered badge and a name above, lines radiate from the fountain, and the
 * legend sits on the picture rather than under it. Two things the reference
 * cannot settle, decided here: the marker is a rounded rectangle rather than a
 * circle because the station photographs are architectural and a circle crops
 * the building out of them; and the line casing is a dark shadow rather than a
 * pale halo, because half this picture is bright limestone and a light halo
 * disappears against it.
 */

const ZOOMS = [100, 160, 240] as const;

export type MapStation = {
  slug: string;
  name: string;
  /** The badge number, from `stations.sort_order`. */
  number: number;
  visited: boolean;
};

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
    <span className="block rounded-md bg-white/95 px-2.5 py-1 text-center text-[0.65rem] font-medium whitespace-nowrap text-navy shadow-md sm:text-caption">
      {children}
    </span>
  );

  const style = { left: `${at.x}%`, top: `${at.y}%` } as const;
  const position = "absolute -translate-x-1/2 -translate-y-1/2";

  return href ? (
    <Link
      href={href}
      style={style}
      className={`${position} rounded-md transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange`}
    >
      {content}
    </Link>
  ) : (
    <span style={style} className={position}>
      {content}
    </span>
  );
}

export function LaStradaMap({
  stations,
  locked = false,
}: {
  stations: MapStation[];
  /** Onboarding members see the town but can't walk into it yet (§3). */
  locked?: boolean;
}) {
  const [zoom, setZoom] = useState<number>(ZOOMS[0]);

  const placed = stations.filter((s) => s.slug in STATION_POSITIONS);
  const storyPoints = yourStoryPoints();
  const storyLine = MAP_LINES.find((l) => l.ownRoute);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-navy/60">
          {locked
            ? "Every room opens when you're active."
            : `${placed.filter((s) => s.visited).length} of ${placed.length} visited`}
        </p>

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          {ZOOMS.map((level, index) => (
            <button
              key={level}
              type="button"
              onClick={() => setZoom(level)}
              aria-pressed={zoom === level}
              className={`rounded-md px-3 py-1.5 text-small transition ${
                zoom === level
                  ? "bg-navy text-white"
                  : "border border-navy/20 text-navy/70 hover:text-navy"
              }`}
            >
              {index === 0 ? "Fit" : index === 1 ? "Closer" : "Closest"}
            </button>
          ))}
        </div>
      </div>

      {/* `touch-pan-x touch-pan-y` tells the browser this is a pannable surface,
          so a drag scrolls the map rather than the page. */}
      <div className="touch-pan-x touch-pan-y overflow-auto rounded-xl border border-navy/10 bg-sky/10">
        <div
          className="relative"
          style={{ width: `${zoom}%`, minWidth: zoom === 100 ? undefined : "100%" }}
        >
          <Image
            src="/illustrations/la-strada-map.png"
            alt="La Strada — the town, seen from above"
            width={1536}
            height={864}
            priority
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="h-auto w-full"
          />

          {/* Lines under everything. viewBox in percentages so the coordinates
              are the same numbers as the positions; non-scaling stroke so
              `preserveAspectRatio="none"` doesn't stretch the line weight along
              with the box. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <defs>
              {/* A soft dark shadow rather than a pale halo. Half the picture is
                  bright limestone and the other half deep blue sea; a light
                  casing vanishes on the square, where most of the lines are. */}
              <filter id="la-strada-line-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow
                  dx="0"
                  dy="0.35"
                  stdDeviation="0.45"
                  floodColor="#000"
                  floodOpacity="0.45"
                />
              </filter>
            </defs>

            <g filter="url(#la-strada-line-shadow)" opacity={locked ? 0.55 : 1}>
              {MAP_LINES.filter((line) => !line.ownRoute).map((line) =>
                line.stations.map((slug, index) => {
                  const pos = STATION_POSITIONS[slug];
                  if (!pos) return null;

                  return (
                    <path
                      key={`${line.key}-${slug}`}
                      d={spokePath(pos, bendFor(index, line.stations.length))}
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
                  vectorEffect="non-scaling-stroke"
                  opacity={0.9}
                />
              ) : null}
            </g>

            {/* The bends on the story line, which the legend calls Your Story
                Stations — they mark where it touches down, not the stations. */}
            {storyPoints.slice(1, -1).map((point) => (
              <circle
                key={`${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r={0.9}
                fill="#fff"
                stroke="var(--aos-navy)"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>

          {/* Piazza is the hub every line leaves from, and Piazza Sociale sits
              beside it — neither is a station, and §3 keeps the square itself
              clear of markers, so both are labels rather than tiles. */}
          <PlaceLabel at={PIAZZA_HUB} href={locked ? undefined : "/piazza"}>
            Piazza — Home
          </PlaceLabel>
          <PlaceLabel at={PIAZZA_SOCIALE} href={locked ? undefined : "/sociale"}>
            Piazza Sociale
          </PlaceLabel>

          {placed.map((station) => {
            const pos = STATION_POSITIONS[station.slug];
            const colour = lineColourFor(station.slug) ?? "var(--aos-navy)";

            const marker = (
              <>
                {/* Name above the tile, badge overlapping its corner — the
                    reference's arrangement, and it keeps the label off the
                    photograph rather than sitting over the building. */}
                <span
                  className={`pointer-events-none absolute bottom-full left-1/2 mb-1 block -translate-x-1/2 rounded-md bg-white/95 px-2 py-0.5 text-center text-[0.6rem] font-medium whitespace-nowrap text-navy shadow-md transition sm:text-caption ${
                    zoom === 100 ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" : "opacity-100"
                  }`}
                >
                  {station.name}
                </span>

                <span
                  aria-hidden
                  className="absolute -top-1.5 -left-1.5 z-10 flex size-5 items-center justify-center rounded-full text-[0.55rem] font-semibold text-white shadow-md sm:size-6 sm:text-[0.65rem]"
                  style={{ backgroundColor: colour }}
                >
                  {station.number}
                </span>

                <span
                  className="block h-12 w-14 overflow-hidden rounded-lg border-2 shadow-lg transition sm:h-[4.5rem] sm:w-20"
                  style={{ borderColor: colour }}
                >
                  <Image
                    src={`/stations/${station.slug}.png`}
                    alt=""
                    width={160}
                    height={140}
                    // The same eleven images the station cards use — Next serves
                    // a thumbnail-sized version rather than the 2.6MB source.
                    className={`size-full object-cover transition ${
                      station.visited || locked ? "" : "grayscale"
                    } ${locked ? "opacity-70" : "group-hover:scale-105"}`}
                  />
                </span>

                {station.visited && !locked ? (
                  <span
                    aria-hidden
                    title="Visited"
                    className="absolute -right-1 -bottom-1 block size-3 rounded-full border-2 border-white bg-orange shadow-sm"
                  />
                ) : null}
              </>
            );

            const style = { left: `${pos.x}%`, top: `${pos.y}%` } as const;

            // Locked stations aren't links — nothing to follow, and a dead link
            // is worse than plain text for anyone tabbing through.
            if (locked) {
              return (
                <span
                  key={station.slug}
                  style={style}
                  className="group absolute -translate-x-1/2 -translate-y-1/2"
                >
                  {marker}
                </span>
              );
            }

            return (
              <Link
                key={station.slug}
                href={`/stations/${station.slug}`}
                style={style}
                aria-label={`${station.name}${station.visited ? " — visited" : ""}`}
                className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
              >
                {marker}
              </Link>
            );
          })}

          {/* On the picture, bottom right — the reference's placement. Hidden
              on the narrowest screens, where it would cover a third of the map
              and the legend below the image says the same thing. */}
          <div className="pointer-events-none absolute right-3 bottom-3 hidden rounded-lg bg-white/85 px-3 py-2.5 shadow-lg backdrop-blur-sm sm:block">
            <ul className="flex flex-col gap-1.5">
              {MAP_LINES.map((line) => (
                <li key={line.key} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="block h-1 w-6 shrink-0 rounded-full"
                    style={{ backgroundColor: strokeColourFor(line) }}
                  />
                  <span className="text-caption whitespace-nowrap text-navy/80">
                    {line.label}
                  </span>
                </li>
              ))}
              <li className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="block size-2.5 shrink-0 rounded-full border-2 bg-white"
                  style={{ borderColor: "var(--aos-navy)" }}
                />
                <span className="text-caption whitespace-nowrap text-navy/80">
                  Your Story Stations
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* The same key, below the image, for phones — where the panel would take
          a third of the map. */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 sm:hidden">
        {MAP_LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="block h-1 w-5 rounded-full"
              style={{ backgroundColor: strokeColourFor(line) }}
            />
            <span className="text-caption text-navy/60">{line.label}</span>
          </span>
        ))}
      </div>

      <p className="mt-2 text-caption text-navy/50">
        Drag to move around. A dot on a photo marks somewhere you&rsquo;ve been.
      </p>
    </div>
  );
}
