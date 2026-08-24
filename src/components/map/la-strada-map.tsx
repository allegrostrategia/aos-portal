"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { STATION_POSITIONS } from "@/lib/map/positions";

/**
 * La Strada — the town from above, with the eleven stations on it.
 *
 * §3: free-roam once active, navigated entirely by the member's own choice. The
 * only state is visited / not visited, so that is the only state drawn here.
 *
 * **Pan is native scrolling, zoom is buttons.** A custom pointer-and-pinch
 * gesture layer is the obvious thing to reach for and the wrong one: it has to
 * re-implement momentum, edge behaviour and two-finger handling that every
 * browser already does properly, and it breaks keyboard and trackpad users on
 * the way. Scrolling a container works identically on a phone, a trackpad, a
 * mouse wheel and arrow keys, and cannot be got subtly wrong.
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

      {/* Scroll container. `touch-pan-x touch-pan-y` tells the browser this is a
          pannable surface, so a drag scrolls the map rather than the page. */}
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

          {placed.map((station) => {
            const pos = STATION_POSITIONS[station.slug];

            const marker = (
              <>
                <span
                  aria-hidden
                  className={`block size-3.5 rounded-full border-2 shadow-sm transition ${
                    station.visited
                      ? "border-white bg-orange"
                      : "border-white/80 bg-navy/70 group-hover:bg-navy"
                  }`}
                />
                <span
                  className={`pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded bg-off-white/95 px-1.5 py-0.5 text-center font-mono text-[0.6rem] whitespace-nowrap text-navy uppercase shadow-sm transition ${
                    zoom === 100 ? "opacity-0 group-hover:opacity-100" : "opacity-100"
                  }`}
                >
                  {station.name}
                </span>
              </>
            );

            const style = {
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            } as const;

            // Locked stations aren't links — nothing to follow, and a dead link
            // is worse than plain text for anyone tabbing through.
            if (locked) {
              return (
                <span
                  key={station.slug}
                  style={style}
                  className="group absolute -translate-x-1/2 -translate-y-1/2 opacity-60"
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

      <p className="mt-2 text-caption text-navy/50">
        Drag to move around. Orange marks somewhere you&rsquo;ve been.
      </p>
    </div>
  );
}
