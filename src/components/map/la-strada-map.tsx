"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { STATION_POSITIONS } from "@/lib/map/positions";
import { MAP_LINES, lineColourFor, segmentPath } from "@/lib/map/lines";

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
 */

const ZOOMS = [100, 160, 240] as const;

export type MapStation = {
  slug: string;
  name: string;
  visited: boolean;
};

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
            height={1024}
            priority
            sizes="(min-width: 1024px) 60rem, 100vw"
            className="h-auto w-full"
          />

          {/* The lines sit under the markers. viewBox in percentages so the
              coordinates are the same numbers as the positions; non-scaling
              stroke so `preserveAspectRatio="none"` doesn't stretch the weight
              of the line along with the box. */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {MAP_LINES.filter((line) => line.drawLine).map((line) =>
              line.stations.slice(0, -1).map((slug, index) => {
                const from = STATION_POSITIONS[slug];
                const to = STATION_POSITIONS[line.stations[index + 1]];
                if (!from || !to) return null;

                return (
                  <g key={`${line.key}-${index}`}>
                    {/* A pale casing underneath, so a line stays readable over
                        both the dark sea and the bright piazza. */}
                    <path
                      d={segmentPath(from, to)}
                      fill="none"
                      stroke="var(--aos-off-white)"
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeOpacity={0.55}
                      vectorEffect="non-scaling-stroke"
                    />
                    <path
                      d={segmentPath(from, to)}
                      fill="none"
                      stroke={line.colour}
                      strokeWidth={3.5}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      opacity={locked ? 0.5 : 0.95}
                    />
                  </g>
                );
              }),
            )}
          </svg>

          {placed.map((station) => {
            const pos = STATION_POSITIONS[station.slug];
            const colour = lineColourFor(station.slug) ?? "var(--aos-navy)";

            const marker = (
              <>
                <span
                  className="block size-7 overflow-hidden rounded-full border-[3px] shadow-md transition sm:size-9"
                  style={{ borderColor: colour }}
                >
                  <Image
                    src={`/stations/${station.slug}.png`}
                    alt=""
                    width={72}
                    height={72}
                    // The same eleven images the station cards use — Next serves
                    // a thumbnail-sized version rather than the 2.6MB source.
                    className={`size-full object-cover transition ${
                      station.visited || locked ? "" : "grayscale"
                    } ${locked ? "opacity-70" : "group-hover:scale-110"}`}
                  />
                </span>

                {station.visited && !locked ? (
                  <span
                    aria-hidden
                    title="Visited"
                    className="absolute -right-0.5 -bottom-0.5 block size-3 rounded-full border-2 border-white bg-orange shadow-sm"
                  />
                ) : null}

                <span
                  className={`pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-off-white/95 px-1.5 py-0.5 text-center font-mono text-[0.6rem] whitespace-nowrap text-navy uppercase shadow-sm transition ${
                    zoom === 100 ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                  }`}
                >
                  {station.name}
                </span>
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
                className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
              >
                {marker}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        {MAP_LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="block h-1 w-5 rounded-full"
              style={{
                backgroundColor: line.colour,
                // Your Story has no route, so its swatch is a dot rather than a
                // length of line — the legend shouldn't imply one exists.
                width: line.drawLine ? undefined : "0.5rem",
              }}
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
