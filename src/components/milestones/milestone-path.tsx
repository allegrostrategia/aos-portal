import Image from "next/image";

import { MILESTONE_POINTS, ROAD_PATH, type PathPoint } from "@/lib/hours/milestone-path";
import { type MilestoneStep, milestonePathFraction } from "@/lib/hours/milestones";

/**
 * The milestone path — the road down the coast, with how far along it you are.
 *
 * **Zero hours is at the top and the road runs downward.** So the first thing on
 * screen is where you are now, and reaching for a later milestone means
 * scrolling toward it. The reverse — starting at the bottom and climbing — puts
 * a new member's position off-screen on load, which is the one thing this screen
 * exists to show them.
 *
 * The page scrolls normally. La Strada's pan-and-zoom container is deliberately
 * *not* used here: that map is wider than the screen and has eleven places to
 * compare, so it needs its own viewport. This is one road read top to bottom,
 * and putting it in a scroll container would mean two nested scrolls fighting
 * over the same gesture on a phone.
 *
 * Marker sizes are container-query units against the picture, so a marker is the
 * same share of the road on a phone as on a laptop — the fix already made on La
 * Strada, where fixed pixel sizes made the markers nearly twice the share of the
 * map on a narrow screen.
 *
 * The whole figure is `aria-hidden`. Everything it shows — every threshold,
 * whether it is passed, the week it was passed, how far to the next — is stated
 * in the list underneath, in more detail than the picture can carry. Announcing
 * it twice would make the screen longer to listen to and no more informative.
 */

const MARKER_SIZE = {
  "--marker": "max(2.5rem, 11cqw)",
  "--marker-text": "max(0.55rem, 2.6cqw)",
  "--here": "max(1.1rem, 5cqw)",
} as React.CSSProperties;

function polyline(points: readonly PathPoint[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function MilestonePath({
  hours,
  steps,
}: {
  hours: number;
  steps: MilestoneStep[];
}) {
  const fraction = milestonePathFraction(hours);

  // The index of the point reached, not a count — at zero hours there is no
  // travelled line to draw at all, only a marker sitting at the start.
  const index = Math.round(fraction * (ROAD_PATH.length - 1));
  const travelled = index >= 1 ? ROAD_PATH.slice(0, index + 1) : [];
  const here = ROAD_PATH[index];

  const reached = new Set(steps.filter((step) => step.reached).map((step) => step.target));

  return (
    <figure
      aria-hidden
      style={{ ...MARKER_SIZE, containerType: "inline-size" }}
      className="relative mb-8 overflow-hidden rounded-xl border border-navy/10"
    >
      <Image
        src="/illustrations/milestone-path.png"
        alt=""
        width={941}
        height={1672}
        priority
        sizes="(min-width: 768px) 42rem, 100vw"
        className="h-auto w-full"
      />

      {/* Percentages as coordinates, so the overlay is the same numbers as the
          traced path. `preserveAspectRatio="none"` stretches the box to the
          picture, which is why the stroke has to be non-scaling. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        <defs>
          <filter id="milestone-path-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.2" stdDeviation="0.3" floodColor="#000" floodOpacity="0.5" />
          </filter>
        </defs>

        <g filter="url(#milestone-path-shadow)">
          {/* The road ahead.
              
              Dashed, and at nearly full opacity. Both were arrived at by looking:
              white at 0.5 was the first attempt and it is simply invisible over
              this photograph, which is bright limestone and bright sea for most
              of its length — the drop shadow doesn't rescue it either. Dashed
              also means travelled and remaining differ in shape as well as
              colour, so the picture still reads if the orange and the white are
              hard to tell apart. */}
          <path
            d={polyline(ROAD_PATH)}
            fill="none"
            stroke="#fff"
            strokeWidth={5}
            strokeOpacity={0.9}
            strokeDasharray="8 9"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          {travelled.length > 1 ? (
            <path
              d={polyline(travelled)}
              fill="none"
              stroke="var(--aos-orange)"
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </g>
      </svg>

      {MILESTONE_POINTS.map((point) => {
        const done = reached.has(point.hours);
        return (
          <span
            key={point.hours}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              width: "var(--marker)",
              height: "var(--marker)",
              fontSize: "var(--marker-text)",
            }}
            className={`font-mono absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white font-semibold shadow-lg ${
              done ? "bg-orange text-white" : "bg-white/95 text-navy"
            }`}
          >
            {point.hours}
          </span>
        );
      })}

      {/* Where they actually are, which is the one thing the list can't show. */}
      <span
        style={{
          left: `${here.x}%`,
          top: `${here.y}%`,
          width: "var(--here)",
          height: "var(--here)",
        }}
        className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-navy shadow-lg ring-2 ring-navy/30"
      />
    </figure>
  );
}
