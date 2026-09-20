"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import type { LabelMetrics } from "@/lib/map/markers";

/**
 * One station on The Map: a pulsing dot, a pill label, and a card that
 * opens on hover (desktop) or tap (touch), with the station's photo and a
 * line about it (docs/aOS_TheMap_Dots_Brief.md, from allegro-final-map.html).
 *
 * The interaction, precisely, as the brief has it and unlike the reference's
 * own script (which opens on click):
 *   · a pointer that can hover: hovering opens the card, leaving closes it,
 *     and a click goes to the station. Pure CSS for the hover, so keyboard
 *     focus opens it too.
 *   · touch: a tap opens the card (there is no hover); a tap on the dot
 *     again, a tap anywhere off the card, or Escape closes it. Scrolling
 *     doesn't: closing listens for `click`, which a scroll never produces,
 *     not `pointerdown`, which it does (20 Sep: a scroll closed it at once).
 *
 * **The card is a sibling of the dot, not a child**, positioned in the
 * picture with container-query units (the layer is an inline-size
 * container). Its left edge is clamped between the picture's left edge and
 * 230px short of its right, so a card slides toward the centre as far as it
 * needs to and never leaves the picture: near the edges the first version,
 * a child fixed to one side of the dot, ran off the phone screen for La
 * Boutique, Archivio and Stazione Centrale. Vertically the same: it opens
 * just below the dot unless that would pass the picture's foot, then slides
 * up as far as it must (over the dot, on a short picture; the tap was for
 * the card). Hover opens it through the sibling selector in globals.css,
 * and the card keeps itself open while the pointer is on it.
 *
 * Styling is the reference's `.hotspot-label` and `.hovercard` with one
 * property left out: `backdrop-filter: blur`. The project allows the blur in
 * two places for a reason (phones), and eleven blurred pills over a large
 * photograph is the case the rule exists for. The 62% dark fill carries the
 * look without it.
 */

export const CARD_WIDTH = 230;
/** About what a card with a photo and one line of description stands. */
const CARD_HEIGHT = 300;

export function StationDot({
  slug,
  name,
  kicker,
  description,
  x,
  y,
  aspect,
  flip,
  metrics,
  href,
}: {
  slug: string;
  name: string;
  kicker: string;
  description: string | null;
  x: number;
  y: number;
  /** The picture's height over its width, to turn y% into cqw. */
  aspect: number;
  /** Label to the left of the dot. */
  flip: boolean;
  metrics: LabelMetrics;
  /** Null while locked: nothing to follow. */
  href: string | null;
}) {
  const [open, setOpen] = useState(false);
  const touched = useRef(false);
  const stop = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);

  // Tap-to-open on touch. A tap anywhere off the dot and its card, or
  // Escape, closes. `click`, not `pointerdown`: a scroll starts with a
  // pointerdown and never ends in a click.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (stop.current?.contains(t) || card.current?.contains(t)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("click", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const label = (
    <span
      className="map-label whitespace-nowrap rounded-[20px] border border-white/28 bg-[rgb(6_14_30/0.62)] font-medium text-white uppercase transition"
      style={{ fontSize: metrics.font, padding: `${(metrics.height - metrics.font * 1.2) / 2}px ${metrics.padX}px`, letterSpacing: `${metrics.tracking}em` }}
    >
      {name}
    </span>
  );

  const inner = (
    <>
      <span className="map-dot" aria-hidden />
      {label}
    </>
  );
  const stopClass = `flex items-center gap-[9px] ${flip ? "flex-row-reverse" : ""}`;

  // The dot's centre, in the picture's own units.
  const dotX = `${x}cqw`;
  const dotY = `${(y * aspect).toFixed(3)}cqw`;

  return (
    <>
      <div
        ref={stop}
        data-open={open}
        className="map-stop group absolute z-10"
        // Anchored on the dot's centre: the dot is 14px, first in the row or,
        // flipped, last, so the wrapper shifts by 7px from the matching edge.
        style={{ left: `${x}%`, top: `${y}%`, transform: flip ? "translate(calc(-100% + 7px), -50%)" : "translate(-7px, -50%)" }}
      >
        {href ? (
          <Link
            href={href}
            aria-label={name}
            className={`${stopClass} rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold`}
            onPointerDown={(e) => {
              touched.current = e.pointerType === "touch";
            }}
            onClick={(e) => {
              // A tap opens the card instead of navigating; the card links on.
              if (touched.current) {
                e.preventDefault();
                setOpen((o) => !o);
              }
            }}
          >
            {inner}
          </Link>
        ) : (
          <button
            type="button"
            aria-label={name}
            className={`${stopClass} rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold`}
            onClick={() => setOpen((o) => !o)}
          >
            {inner}
          </button>
        )}
      </div>

      {/* The card: the reference's .hovercard, with the station's photo.
          Shown by CSS on the dot's hover and focus, by state on tap. */}
      <div
        ref={card}
        role="group"
        aria-label={`About ${name}`}
        data-open={open}
        className={`map-card absolute z-20 rounded-[10px] border border-white/18 bg-[rgb(8_18_38/0.9)] p-4 text-white shadow-lift transition ${
          open ? "map-card-open" : ""
        }`}
        style={{
          width: CARD_WIDTH,
          left: `clamp(0px, calc(${dotX} - ${CARD_WIDTH / 2}px), calc(100cqw - ${CARD_WIDTH}px))`,
          top: `clamp(0px, calc(${dotY} + 14px), calc(${(100 * aspect).toFixed(3)}cqw - ${CARD_HEIGHT}px))`,
        }}
      >
        <Image src={`/stations/${slug}.jpg`} alt="" width={160} height={140} className="mb-3 aspect-[8/5] w-full rounded-md object-cover" />
        <p className="mb-1.5 text-[10px] tracking-[0.2em] text-gold uppercase">{kicker}</p>
        <p className="font-display mb-2 text-[19px] leading-tight font-normal text-white italic">{name}</p>
        {description ? <p className="mb-2.5 text-[12.5px] leading-[1.55] text-white/85">{description}</p> : null}
        {href ? (
          <Link href={href} className="border-b border-gold/50 pb-0.5 text-[11px] tracking-[0.06em] text-gold uppercase no-underline">
            Open {name} →
          </Link>
        ) : (
          <p className="text-[11px] tracking-[0.06em] text-white/60 uppercase">Opens when you&rsquo;re active</p>
        )}
      </div>
    </>
  );
}
