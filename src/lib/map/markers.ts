import { LANDSCAPE, PORTRAIT, type MapArtwork, type MapPosition } from "./positions.ts";

/**
 * Marker geometry, as pure numbers, so "does every marker fit inside the
 * picture" is answered by a test rather than on a phone.
 *
 * Since 19 Sep a marker is a dot with a pill label beside it (the Dots
 * brief, from allegro-final-map.html), not a photo tile. The numbers mirror
 * the reference's CSS: a 14px dot with a 6px halo, a 9px gap, an 11px
 * uppercase label tracked at 0.12em inside 13px of padding. The portrait
 * draws the pill a size smaller (9.5px, same proportions): at 11px, "Studio
 * dell'Architetto" and "Stazione Centrale" fit on neither side of their dot
 * on a 350px phone, and the reference only ever had short names.
 *
 * A label sits to the right of its dot unless that would run off the
 * picture at the artwork's typical width and the left would not, in which
 * case it flips. Decided here, once, from the geometry, and read by the
 * component and the test alike.
 */

export const DOT = 14;
export const HALO = 6;
export const GAP = 9;

export type LabelMetrics = { font: number; padX: number; height: number; tracking: number };

export function labelMetrics(artwork: MapArtwork): LabelMetrics {
  return artwork.key === "portrait"
    ? { font: 9.5, padX: 10, height: 23, tracking: 0.1 }
    : { font: 11, padX: 13, height: 27, tracking: 0.12 };
}

export function labelWidth(artwork: MapArtwork, nameChars: number): number {
  const m = labelMetrics(artwork);
  // Inter capitals average ~0.66em, plus the tracking.
  return nameChars * m.font * (0.66 + m.tracking) + m.padX * 2;
}

/**
 * The narrowest the picture layer is drawn: a 375px phone inside the
 * portal's 20px gutters (the smallest phone still made), and a 768px tablet
 * for the landscape, where it first appears. Flips are decided here, at the
 * narrowest case, so a label that fits at 390px doesn't run off at 375.
 */
export function minWidth(artwork: MapArtwork): number {
  return artwork.key === "portrait" ? 375 - 40 : 768 - 40;
}

/** The picture layer's width in the common case for each artwork. */
export function typicalWidth(artwork: MapArtwork): number {
  return artwork.key === "portrait" ? 390 - 40 : 960;
}

function reach(artwork: MapArtwork, nameChars: number): number {
  return DOT / 2 + GAP + labelWidth(artwork, nameChars);
}

/**
 * Whether the label goes to the left of the dot: by what fits at the
 * narrowest width, or by the artwork's say-so for a station whose label
 * would otherwise run into a neighbour's.
 */
export function flipsLabel(pos: MapPosition, artwork: MapArtwork, nameChars: number, slug?: string): boolean {
  if (slug && artwork.labelLeft?.includes(slug)) return true;
  const width = minWidth(artwork);
  const cx = (pos.x / 100) * width;
  const r = reach(artwork, nameChars);
  const fitsRight = cx + r <= width;
  const fitsLeft = cx - r >= 0;
  return !fitsRight && fitsLeft;
}

export type MarkerBox = {
  /** Pixels the marker extends from the dot's centre in each direction. */
  left: number;
  right: number;
  up: number;
  down: number;
};

export function markerBox(pos: MapPosition, artwork: MapArtwork, nameChars: number, slug?: string): MarkerBox {
  const half = DOT / 2 + HALO;
  const r = reach(artwork, nameChars);
  const flip = flipsLabel(pos, artwork, nameChars, slug);
  const v = Math.max(half, labelMetrics(artwork).height / 2);
  return { left: flip ? r : half, right: flip ? half : r, up: v, down: v };
}

/** True when the dot and its label sit inside the picture at `width` px wide. */
export function markerFits(pos: MapPosition, artwork: MapArtwork, width: number, nameChars: number, slug?: string): boolean {
  const height = width * (artwork.height / artwork.width);
  const box = markerBox(pos, artwork, nameChars, slug);
  const cx = (pos.x / 100) * width;
  const cy = (pos.y / 100) * height;
  return cx - box.left >= 0 && cx + box.right <= width && cy - box.up >= 0 && cy + box.down <= height;
}

export { LANDSCAPE, PORTRAIT };
