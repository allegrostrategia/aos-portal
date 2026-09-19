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
 *   · touch: a tap opens the card (there is no hover), a second tap on the
 *     dot, a tap elsewhere, or Escape closes it; the card carries the link.
 *
 * Styling is the reference's `.hotspot-label` and `.hovercard` with one
 * property left out: `backdrop-filter: blur`. The project allows the blur in
 * two places for a reason (phones), and eleven blurred pills over a large
 * photograph is the case the rule exists for. The 62% dark fill carries the
 * look without it.
 */
export function StationDot({
  slug,
  name,
  kicker,
  description,
  x,
  y,
  flip,
  cardAbove,
  metrics,
  href,
}: {
  slug: string;
  name: string;
  kicker: string;
  description: string | null;
  x: number;
  y: number;
  /** Label (and card) to the left of the dot. */
  flip: boolean;
  /** Card opens upward, for the bottom rows. */
  cardAbove: boolean;
  metrics: LabelMetrics;
  /** Null while locked: nothing to follow. */
  href: string | null;
}) {
  const [open, setOpen] = useState(false);
  const touched = useRef(false);
  const root = useRef<HTMLDivElement>(null);

  // Tap-to-open on touch. A tap elsewhere, or Escape, closes.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const label = (
    <span
      className="map-label whitespace-nowrap rounded-[20px] border border-white/28 bg-[rgb(6_14_30/0.62)] font-medium tracking-[0.12em] text-white uppercase transition"
      style={{ fontSize: metrics.font, padding: `${(metrics.height - metrics.font * 1.2) / 2}px ${metrics.padX}px`, letterSpacing: `${metrics.tracking}em` }}
    >
      {name}
    </span>
  );

  const stop = (
    <>
      <span className="map-dot" aria-hidden />
      {label}
    </>
  );

  const stopClass = `flex items-center gap-[9px] ${flip ? "flex-row-reverse" : ""}`;

  return (
    <div
      ref={root}
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
          {stop}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={name}
          className={`${stopClass} rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold`}
          onClick={() => setOpen((o) => !o)}
        >
          {stop}
        </button>
      )}

      {/* The card: the reference's .hovercard, with the station's photo. Shown
          by CSS on hover and focus, by state on tap. */}
      <div
        role="group"
        aria-label={`About ${name}`}
        className={`map-card absolute z-20 w-[230px] rounded-[10px] border border-white/18 bg-[rgb(8_18_38/0.9)] p-4 text-white shadow-lift transition ${
          flip ? "right-0" : "left-0"
        } ${cardAbove ? "bottom-full mb-2" : "top-full mt-2"} ${
          open
            ? "pointer-events-auto translate-y-0 scale-100 opacity-100"
            : "pointer-events-none translate-y-2 scale-[0.98] opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:scale-100 group-focus-within:opacity-100"
        }`}
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
    </div>
  );
}
