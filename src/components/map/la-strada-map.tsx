"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { namePlacement } from "@/lib/map/markers";
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
 * §3: free-roam once active, navigated entirely by the member's own choice.
 * No per-station state is drawn at all since 14 Sep: the visited/not-visited
 * distinction (greyscale until you'd been in) was built, phone-checked and
 * then dropped by Dom. Every station is in colour, always. Visits are still
 * recorded on entry; nothing reads them for the map.
 *
 * **One fixed view, and pan is native scrolling (14 Sep).** The Fit / Closer /
 * Closest buttons are gone. On a phone the map is drawn at twice the screen's
 * width and scrolls, opening centred on the Piazza; on a laptop it fits. That
 * is the only "zoom" there is. The earlier design fitted the whole town onto a
 * phone screen at 197px tall with 36px tiles and hidden names — it was what got
 * built and phone-checked, and it was not usable. A custom pointer-and-pinch layer
 * is the obvious reach and the wrong one: it re-implements momentum, edges and
 * two-finger handling that browsers already do properly, and breaks keyboard and
 * trackpad users on the way. Scrolling a container behaves identically on a
 * phone, a trackpad, a wheel and arrow keys, and can't be got subtly wrong.
 *
 * **Drag-to-pan sits on top of that, not in place of it (4 Sep).** People reach
 * for a map expecting to drag it. The safe way to give them that is to *drive*
 * the native scroll — set `scrollLeft` and `scrollTop` on the same container the
 * browser is already scrolling — rather than to intercept events and transform
 * the content. Nothing is prevented, so bounds clamping, the wheel, the
 * trackpad, the keyboard and touch momentum all keep working exactly as they
 * did; the drag is one more thing that moves the same scroll position.
 *
 * Mouse and pen only. Handling touch pointers here would fight the momentum
 * scrolling a phone already does properly, which is the failure the paragraph
 * above is about.
 *
 * **Redrawn 4 Sep to the design reference.** Markers are photo tiles with a
 * numbered badge and a name above, lines radiate from the fountain, and the
 * legend sits on the picture rather than under it. Two things the reference
 * cannot settle, decided here: the marker is a rounded rectangle rather than a
 * circle because the station photographs are architectural and a circle crops
 * the building out of them; and the line casing is a dark shadow rather than a
 * pale halo, because half this picture is bright limestone and a light halo
 * disappears against it.
 *
 * **Markers are sized against the map, not in fixed pixels (7 Sep).** They were
 * `w-14 sm:w-20`, which on a phone made each tile ~16% of the map's width
 * against ~9% on desktop — nearly twice the share, on the screen with the least
 * room, and enough to crowd the closest stations into each other. The sizes are
 * now container-query units on the scroll viewport, so a marker is the same
 * fraction of the map at every screen size. See MARKER_SIZE.
 */

/**
 * Marker sizing, as a share of the map itself.
 *
 * `cqw` is measured against the picture layer, not the scroll viewport. That is
 * the reverse of the earlier design, and it follows from dropping zoom: with
 * one fixed view there is nothing to keep markers constant *across*, so a
 * marker should simply be the same fraction of the map everywhere. On a laptop
 * the map is ~900px wide and a tile is 80px; on a phone the map is drawn at
 * 200% of the screen (~700px) and a tile is ~62px — big enough to see the
 * building in and to hit with a thumb, which 36px was not.
 *
 * The floors are a safety net for very narrow screens, not the normal case.
 */
// Sized against the picture layer, each with a pixel floor. Mirrored as
// numbers in lib/map/markers.ts, whose test checks every marker fits the frame.
const MARKER_SIZE = {
  "--tile": "max(3.5rem, 8.8cqw)",
  "--badge": "max(1.25rem, 2.6cqw)",
  "--badge-text": "max(0.65rem, 1.15cqw)",
  "--dot": "max(0.75rem, 1.3cqw)",
  "--name": "max(0.7rem, 1.5cqw)",
} as React.CSSProperties;

export type MapStation = {
  slug: string;
  name: string;
  /** The badge number, from `stations.sort_order`. */
  number: number;
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
    <span className="block rounded-md bg-white/95 px-2.5 py-1 text-center text-[0.65rem] font-medium whitespace-nowrap text-ink shadow-md sm:text-caption">
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
  const [dragging, setDragging] = useState(false);

  const scroller = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  // Open on the Piazza. On a phone the map is wider than the screen, and a map
  // that opens on its left edge opens on the sea; scrolled so the fountain is
  // in the middle it opens on the town. No-op on a laptop, where nothing
  // overflows. Runs once: after that the position is the member's.
  useEffect(() => {
    const el = scroller.current;
    const map = layer.current;
    if (!el || !map) return;
    const overflow = map.offsetWidth - el.clientWidth;
    if (overflow <= 0) return;
    el.scrollLeft = (PIAZZA_HUB.x / 100) * map.offsetWidth - el.clientWidth / 2;
  }, []);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  // A drag that ends over a marker would otherwise navigate on release.
  const swallowClick = useRef(false);

  // Four pixels: enough that a shaky click still opens a station, small enough
  // that a deliberate drag feels immediate.
  const DRAG_THRESHOLD = 4;

  function onPointerDown(event: React.PointerEvent) {
    // Touch pans natively with momentum this can't match, so it's left alone.
    if (event.pointerType === "touch" || event.button !== 0) return;

    const element = scroller.current;
    if (!element) return;

    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: element.scrollLeft,
      top: element.scrollTop,
      moved: false,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const start = drag.current;
    const element = scroller.current;
    if (!start || !element) return;

    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;

    if (!start.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      start.moved = true;
      setDragging(true);
      // Captured only once it's a real drag, so a plain click is untouched —
      // and once captured, letting go outside the map still ends cleanly.
      element.setPointerCapture(event.pointerId);
    }

    // Driving the browser's own scroll: it clamps at the edges for us.
    element.scrollLeft = start.left - dx;
    element.scrollTop = start.top - dy;
  }

  function onPointerUp() {
    if (drag.current?.moved) swallowClick.current = true;
    drag.current = null;
    setDragging(false);
  }

  const placed = stations.filter((s) => s.slug in STATION_POSITIONS);
  const storyPoints = yourStoryPoints();
  const storyLine = MAP_LINES.find((l) => l.ownRoute);

  return (
    <div>
      {locked ? (
        <p className="mb-3 text-small text-ink/60">Every room opens when you&rsquo;re active.</p>
      ) : null}

      {/* `touch-pan-x touch-pan-y` tells the browser this is a pannable surface,
          so a drag scrolls the map rather than the page. */}
      {/* Focusable so the arrow keys work.
          
          A scroll container is only keyboard-scrollable in Chrome if it can take
          focus — Firefox allows it either way, which is why this was easy to
          miss. Without it, panning is mouse-and-touch only and there is no
          keyboard route around the map at all.
          
          The cost is one tab stop before the eleven station links, which is the
          right trade: somebody tabbing through reaches the map, can move it, and
          tabs on. `role="region"` with a name means it is announced as somewhere
          you've arrived rather than as an unlabelled box. */}
      <div
        ref={scroller}
        tabIndex={0}
        role="region"
        aria-label="La Strada map. Use the arrow keys to move around"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // The browser's own image drag would otherwise start a ghost copy the
        // moment somebody drags from a station photo.
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!swallowClick.current) return;
          swallowClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        className={`touch-pan-x touch-pan-y overflow-auto rounded-xl border border-ink/10 bg-sky/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
      >
        {/* The picture layer: twice the screen on a phone, the screen on a
            laptop. It is the container the marker sizes are measured against. */}
        <div
          ref={layer}
          className="relative w-[200%] sm:w-full"
          style={{ containerType: "inline-size" }}
        >
          <Image
            src="/illustrations/la-strada-map.png"
            alt="La Strada. The town, seen from above"
            width={1536}
            height={864}
            priority
            // Twice the screen on a phone, so the optimiser is asked for it.
            sizes="(min-width: 1024px) 60rem, (min-width: 640px) 100vw, 200vw"
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
            Piazza. Home
          </PlaceLabel>
          <PlaceLabel at={PIAZZA_SOCIALE} href={locked ? undefined : "/sociale"}>
            Piazza Sociale
          </PlaceLabel>

          {placed.map((station) => {
            const pos = STATION_POSITIONS[station.slug];
            const colour = lineColourFor(station.slug) ?? "var(--aos-navy)";
            // The top row (Studio, Cinema: y 10–11) has half a tile plus a
            // name's height above its centre, and the map's frame clips at
            // its edge; on a phone that cut the names in half (Dom, 14 Sep).
            // Those names go under the tile instead. Everything else has room.
            const nameBelow = namePlacement(pos.y) === "below";

            const marker = (
              <>
                {/* Name above the tile, badge overlapping its corner — the
                    reference's arrangement, and it keeps the label off the
                    photograph rather than sitting over the building. */}
                <span
                  className={`pointer-events-none absolute left-1/2 block -translate-x-1/2 rounded-md bg-white/95 px-2 py-0.5 text-center font-medium whitespace-nowrap text-ink shadow-md ${
                    nameBelow ? "top-full mt-1" : "bottom-full mb-1"
                  }`}
                  style={{ fontSize: "var(--name)" }}
                >
                  {station.name}
                </span>

                <span
                  aria-hidden
                  className="absolute z-10 flex items-center justify-center rounded-full font-semibold text-white shadow-md"
                  style={{
                    backgroundColor: colour,
                    width: "var(--badge)",
                    height: "var(--badge)",
                    fontSize: "var(--badge-text)",
                    // Overhanging the tile's corner by a third of itself, so the
                    // overlap looks the same at every size.
                    top: "calc(var(--badge) / -3)",
                    left: "calc(var(--badge) / -3)",
                  }}
                >
                  {station.number}
                </span>

                <span
                  className="block overflow-hidden rounded-lg border-2 shadow-lg transition"
                  style={{
                    borderColor: colour,
                    width: "var(--tile)",
                    // The source photographs are 160x140; matching that means
                    // `object-cover` never has anything to crop.
                    aspectRatio: "8 / 7",
                  }}
                >
                  <Image
                    src={`/stations/${station.slug}.jpg`}
                    alt=""
                    width={160}
                    height={140}
                    // The same eleven images the station cards use — Next serves
                    // a thumbnail-sized version rather than the full-size source.
                    // Full colour, always (Dom, 14 Sep). The visited/not-visited
                    // greyscale was built and phone-checked, and is dropped.
                    className={`size-full object-cover transition ${locked ? "" : "group-hover:scale-105"}`}
                  />
                </span>

              </>
            );

            const style = {
              ...MARKER_SIZE,
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            };

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
                aria-label={station.name}
                className="group absolute -translate-x-1/2 -translate-y-1/2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange"
              >
                {marker}
              </Link>
            );
          })}

          {/* On the picture, bottom right — the reference's placement. Hidden
              on the narrowest screens, where it would cover a third of the map
              and the legend below the image says the same thing. */}
          <div className="pointer-events-none absolute right-3 bottom-3 hidden rounded-lg bg-white/85 px-3 py-2.5 shadow-lg sm:block">
            <ul className="flex flex-col gap-1.5">
              {MAP_LINES.map((line) => (
                <li key={line.key} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="block h-1 w-6 shrink-0 rounded-full"
                    style={{ backgroundColor: strokeColourFor(line) }}
                  />
                  <span className="text-caption whitespace-nowrap text-ink/80">
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
                <span className="text-caption whitespace-nowrap text-ink/80">
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
            <span className="text-caption text-ink/60">{line.label}</span>
          </span>
        ))}
      </div>

      <p className="mt-2 text-caption text-ink/50">
        On a phone, drag or scroll sideways to move around the town; tab to the map and use the arrow keys.

      </p>
    </div>
  );
}
