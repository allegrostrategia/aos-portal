import type { GoodDirection } from "./formulas.ts";
import { formatValue, type Unit } from "./format.ts";

/**
 * "Look at these first 👀" and "What went WELL this month" (§7).
 *
 * **Every word a client reads here is Nina's**, given verbatim on
 * 5 October and reproduced below unchanged — the capitals, the ellipsis,
 * the ampersand and the emoji included. They are in one file so the
 * wording can be changed without touching a screen, the same
 * arrangement as the publish email and the monthly recap.
 *
 * Nothing here is generated. A template is picked and filled; no
 * sentence is composed, and no figure is described in words the
 * templates do not contain.
 */

export const PANELS = {
  attention: "Look at these first 👀",
  wins: "What went WELL this month",
} as const;

export const TEMPLATES = {
  countDown: "{n} fewer {metric} than last month - worth a proper look 👀",
  countUp: "{n} MORE {metric} than last month - stunning",
  rateDown: "{Metric} dropped from {from} to {to}... let's work out WHY",
  rateUp: "{Metric} up from {from} to {to} & that's no accident",
  belowTarget: "{Metric} is at {pct} of your target - not there YET",
  beatTarget: "{Metric} beat your target by {pct} WOOOO",
} as const;

export interface HighlightInput {
  label: string;
  unit: Unit;
  goodDirection: GoodDirection;
  value: number | null;
  previous: number | null;
  target?: number | null;
  currency: string;
}

export interface Highlight {
  key: keyof typeof TEMPLATES;
  text: string;
  /** Which panel it belongs in. */
  panel: "attention" | "wins";
  /** How big the move was, for ordering. Always positive. */
  size: number;
}

/**
 * "1 more new client", never "1 more new clients".
 *
 * The metric labels are written plural because that is how they read on
 * a card — "New clients", "Opt-ins". In a sentence about one of them
 * they have to be singular, and the rule that gets it right for the
 * labels this tool actually has is the simple one: drop a trailing "s"
 * unless the word ends in "ss".
 */
export function pluralise(label: string, n: number): string {
  // Lower case either way: these sit mid-sentence, after a number, and
  // "3 MORE New clients" reads like a proper noun.
  const lower = label.toLowerCase();
  if (Math.abs(n) !== 1) return lower;
  if (lower.endsWith("ss") || !lower.endsWith("s")) return lower;
  return lower.slice(0, -1);
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole);
}

/** Sentence case for a label used at the start of a sentence. */
function asSentenceStart(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The one thing worth saying about a figure, or nothing.
 *
 * A target beats a comparison with last month, because "not there YET"
 * is about something somebody chose and "dropped from" is only about
 * what happened. A figure with neither says nothing at all rather than
 * reaching for a third-best sentence.
 */
export function highlightFor(input: HighlightInput): Highlight | null {
  const { label, unit, goodDirection, value, previous, target, currency } = input;
  if (value === null || goodDirection === "none") return null;

  const money = (figure: number) => formatValue(figure, unit, currency);

  if (target !== null && target !== undefined && target !== 0) {
    const pct = (value / target) * 100;
    const beat = goodDirection === "up" ? value >= target : value <= target;

    if (beat) {
      // How far past, not how much of: "beat your target by 12%".
      const by = Math.abs(pct - 100);
      if (by < 1) return null;
      return {
        key: "beatTarget",
        panel: "wins",
        size: by,
        text: fill(TEMPLATES.beatTarget, {
          Metric: asSentenceStart(label),
          pct: `${Math.round(by)}%`,
        }),
      };
    }

    return {
      key: "belowTarget",
      panel: "attention",
      size: Math.abs(100 - pct),
      text: fill(TEMPLATES.belowTarget, {
        Metric: asSentenceStart(label),
        pct: `${Math.round(pct)}%`,
      }),
    };
  }

  if (previous === null || previous === value) return null;

  const up = value > previous;
  const good = goodDirection === "up" ? up : !up;

  // A count moved by a number of things; a rate moved from one figure to
  // another. Nina's templates say it both ways and they are not
  // interchangeable: "0.4 fewer unsubscribe rate" is not English.
  if (unit === "count") {
    const n = Math.abs(value - previous);
    if (n === 0) return null;
    return {
      key: good ? "countUp" : "countDown",
      panel: good ? "wins" : "attention",
      size: previous === 0 ? n : (n / Math.abs(previous)) * 100,
      text: fill(good ? TEMPLATES.countUp : TEMPLATES.countDown, {
        n: String(n),
        metric: pluralise(label, n),
      }),
    };
  }

  return {
    key: good ? "rateUp" : "rateDown",
    panel: good ? "wins" : "attention",
    size: previous === 0 ? 100 : (Math.abs(value - previous) / Math.abs(previous)) * 100,
    text: fill(good ? TEMPLATES.rateUp : TEMPLATES.rateDown, {
      Metric: asSentenceStart(label),
      from: money(previous),
      to: money(value),
    }),
  };
}

/**
 * The two panels, biggest movement first and at most three each.
 *
 * Three because a list of eleven things to look at first is a list of
 * nothing to look at first.
 */
export function highlights(inputs: HighlightInput[], perPanel = 3) {
  const all = inputs
    .map(highlightFor)
    .filter((h): h is Highlight => h !== null)
    .sort((a, b) => b.size - a.size);

  return {
    attention: all.filter((h) => h.panel === "attention").slice(0, perPanel),
    wins: all.filter((h) => h.panel === "wins").slice(0, perPanel),
  };
}
