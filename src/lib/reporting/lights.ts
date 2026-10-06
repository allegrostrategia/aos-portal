import { trafficLight, type GoodDirection } from "./formulas.ts";

/**
 * A figure's traffic light, and what it was measured against (§7).
 *
 * `trafficLight()` decides the colour from the first of three things the
 * client actually has: a target, then a benchmark, then last month. Which
 * of the three it used is as worth saying as the colour — "off track vs.
 * target" and "off track vs. last month" are different news — and
 * `trafficLight()` does not report it, so this works it out the same way
 * and in the same order.
 *
 * Kept beside it rather than inside it so the formula module stays a
 * module of arithmetic, and so this can be tested for the one thing that
 * matters: that the label never disagrees with the colour.
 */

export interface LightInput {
  value: number | null;
  target?: number | null;
  benchmark?: number | null;
  lastMonth?: number | null;
  goodDirection: GoodDirection;
}

export interface Light {
  tone: "green" | "amber" | "red";
  against: string;
}

const known = (figure: number | null | undefined): figure is number =>
  figure !== null && figure !== undefined && Number.isFinite(figure);

export function lightFor(input: LightInput): Light | null {
  const tone = trafficLight(input);
  if (!tone) return null;

  // The same order trafficLight() uses, and a zero is not a thing to
  // measure against in either place.
  const against =
    known(input.target) && input.target !== 0
      ? "target"
      : known(input.benchmark) && input.benchmark !== 0
        ? "benchmark"
        : "last month";

  return { tone, against };
}
