import { LANDSCAPE, PORTRAIT, type MapArtwork, type MapPosition } from "./positions.ts";

/**
 * Marker geometry, as pure numbers, so "does every marker fit inside the
 * frame" is answered by a test rather than on a phone.
 *
 * The sizes mirror the CSS in the-map.tsx: container-query units against
 * the picture layer, each with a pixel floor. If those change, change these.
 * A marker or a name poking out of the frame is clipped silently by the
 * layer's overflow, which is how the two top-row names were cut in half on a
 * phone on 14 Sep.
 *
 * Every number is per artwork: the portrait picture draws bigger tiles (14%
 * of its width against 8.8%) because it is shown at phone width.
 */

const REM = 16;

/** The picture layer's width in the case that matters for each artwork. */
export function typicalWidth(artwork: MapArtwork): number {
  return artwork.key === "portrait" ? 390 - 32 : 960;
}

export type MarkerSizes = {
  tile: number;
  badge: number;
  badgeText: number;
  dot: number;
  name: number;
};

/** Pixel sizes for a layer `width` px wide. Floors as in the CSS. */
export function markerSizes(artwork: MapArtwork, width: number): MarkerSizes {
  const cqw = width / 100;
  const t = artwork.tilePercent;
  return {
    tile: Math.max(artwork.tileFloorRem * REM, t * cqw),
    badge: Math.max(1.25 * REM, t * 0.3 * cqw),
    badgeText: Math.max(0.65 * REM, t * 0.13 * cqw),
    dot: Math.max(0.75 * REM, t * 0.15 * cqw),
    name: Math.max(0.65 * REM, t * 0.17 * cqw),
  };
}

export type MarkerBox = {
  /** Distance from the marker's centre to its highest and lowest pixel. */
  above: number;
  below: number;
  /** Half the marker's width at its widest — the name, always. */
  halfWidth: number;
  placement: "above" | "below";
};

/**
 * The marker's extent in pixels for a layer `width` px wide, with the name
 * placed above the tile unless that would poke out of the top of the
 * picture, in which case it goes below. `nameChars` is the station name's
 * length; Inter averages a little over half an em per character.
 */
export function markerBox(pos: MapPosition, artwork: MapArtwork, width: number, nameChars: number): MarkerBox {
  const s = markerSizes(artwork, width);
  const height = width * (artwork.height / artwork.width);
  const tileHalfHeight = (s.tile * (7 / 8)) / 2;
  // Line height inherits the body's 1.6; py-0.5 and a 4px margin to the tile.
  const nameBlock = s.name * 1.6 + 4 + 4;
  const nameWidth = nameChars * s.name * 0.56 + 16;
  const badgeOverhang = s.badge / 3;

  const cy = (pos.y / 100) * height;
  const placement: "above" | "below" = cy - tileHalfHeight - nameBlock < 0 ? "below" : "above";
  return {
    above: tileHalfHeight + (placement === "above" ? nameBlock : badgeOverhang),
    below: tileHalfHeight + (placement === "below" ? nameBlock : 0),
    halfWidth: Math.max(s.tile / 2 + badgeOverhang, nameWidth / 2),
    placement,
  };
}

/** Where the name sits for a marker, at the artwork's typical width. */
export function namePlacement(pos: MapPosition, artwork: MapArtwork): "above" | "below" {
  return markerBox(pos, artwork, typicalWidth(artwork), 22).placement;
}

/** True when the whole marker sits inside the picture: what the frame would otherwise clip. */
export function markerFits(pos: MapPosition, artwork: MapArtwork, width: number, nameChars: number): boolean {
  const height = width * (artwork.height / artwork.width);
  const box = markerBox(pos, artwork, width, nameChars);
  const cx = (pos.x / 100) * width;
  const cy = (pos.y / 100) * height;
  return cy - box.above >= 0 && cy + box.below <= height && cx - box.halfWidth >= 0 && cx + box.halfWidth <= width;
}

export { LANDSCAPE, PORTRAIT };
