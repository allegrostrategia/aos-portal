/**
 * Marker geometry, as pure numbers, so the "does every marker fit inside the
 * frame" question can be answered by a test rather than on a phone.
 *
 * The sizes mirror MARKER_SIZE in la-strada-map.tsx: container-query units
 * against the picture layer, each with a pixel floor. If those change, change
 * these. The test on this file is what catches a marker or a name poking out
 * of the frame, which the map's `overflow: auto` clips silently (the two
 * top-row names were cut in half on a phone, 14 Sep).
 */

/** The picture's aspect (1536×864): layer height as a fraction of its width. */
export const MAP_ASPECT = 864 / 1536;

/** Stations centred above this (in map %) carry their name under the tile. */
export const NAME_BELOW_ABOVE_Y = 18;

/** Where the name sits for a marker at this height. */
export function namePlacement(y: number): "above" | "below" {
  return y < NAME_BELOW_ABOVE_Y ? "below" : "above";
}

export type MarkerBox = {
  /** Distance from the marker's centre to its highest and lowest pixel. */
  above: number;
  below: number;
  /** Half the marker's width at its widest — the name, always. */
  halfWidth: number;
};

const REM = 16;

/**
 * The marker's extent in pixels for a layer `width` px wide. `nameChars` is
 * the station name's length; Inter averages a little over half an em per
 * character at these sizes, and the name box adds horizontal padding.
 */
export function markerBox(
  y: number,
  width: number,
  nameChars: number,
  placement: "above" | "below" = namePlacement(y),
): MarkerBox {
  const cqw = width / 100;
  const tile = Math.max(3.5 * REM, 8.8 * cqw);
  const tileHalfHeight = (tile * (7 / 8)) / 2;
  const badge = Math.max(1.25 * REM, 2.6 * cqw);
  const nameFont = Math.max(0.7 * REM, 1.5 * cqw);
  // Line height inherits the body's 1.6; py-0.5 and a 4px margin to the tile.
  const nameBlock = nameFont * 1.6 + 4 + 4;
  const nameWidth = nameChars * nameFont * 0.56 + 16;

  const badgeOverhang = badge / 3;
  return {
    above: tileHalfHeight + (placement === "above" ? nameBlock : badgeOverhang),
    below: tileHalfHeight + (placement === "below" ? nameBlock : 0),
    halfWidth: Math.max(tile / 2 + badgeOverhang, nameWidth / 2),
  };
}

/**
 * True when the whole marker sits inside a layer `width` px wide, for a marker
 * centred at (x%, y%). What the frame would otherwise clip.
 */
export function markerFits(
  pos: { x: number; y: number },
  width: number,
  nameChars: number,
): boolean {
  const height = width * MAP_ASPECT;
  const box = markerBox(pos.y, width, nameChars);
  const cx = (pos.x / 100) * width;
  const cy = (pos.y / 100) * height;
  return (
    cy - box.above >= 0 &&
    cy + box.below <= height &&
    cx - box.halfWidth >= 0 &&
    cx + box.halfWidth <= width
  );
}
