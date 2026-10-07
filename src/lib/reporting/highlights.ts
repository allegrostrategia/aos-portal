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
  // The two for a figure where falling is the good news — churn, cost
  // per lead, clients who left. Given by Nina on 6 October, after the
  // four above came out backwards on exactly those figures.
  //
  // She wrote the placeholder lower case, `{metric}`; it is `{Metric}`
  // here because in her sentence the label starts it, and that is what
  // the capital in the name means in this file. Her words are unchanged.
  goodFall: "{Metric} down {n} - exactly the direction we want",
  badRise: "{Metric} up {n} - not the direction we want, let's dig into WHY",
} as const;

/**
 * A rate and the count that drives it, where both can reach a panel.
 *
 * Dom, 7 October 2026: "when two related figures move together (Issues
 * raised and Issues per 10 clients), show only one sentence, the plain
 * count." Two sentences about one event read as two events — the panel's
 * whole job is to say what is worth looking at, and saying it twice makes
 * the list longer and the month look worse than it was.
 *
 * **Only where the count is the rate's numerator**, so the count moving is
 * what moved the rate. Retention rate is left out deliberately although it
 * is built from clients who left: it is `(start − left) ÷ start`, so it
 * moves the other way and reads as its own piece of news. So are the
 * per-offer and per-campaign rates, which never reach a panel — the
 * Overview feeds it `entity_type === null` metrics only.
 *
 * Keyed by metric, not by label, because a label is a thing somebody may
 * reword and a key is not.
 */
export const DERIVED_FROM: Record<string, string> = {
  client_experience_issues_per_10_clients: "client_experience_issues_raised",
  client_experience_churn_rate: "client_experience_clients_who_left",
  client_experience_upsell_rate: "client_experience_renewals_and_upsells",
  email_unsubscribe_rate: "email_unsubscribes",
  leads_conversions_close_rate: "leads_conversions_new_clients",
  leads_conversions_lead_to_client_rate: "leads_conversions_new_clients",
  leads_conversions_call_show_up_rate: "leads_conversions_calls_held",
  financials_profit_margin: "financials_profit",
  financials_costs_as_percent_of_revenue: "financials_total_costs",
};

export interface HighlightInput {
  /** The metric key, for the derived-figure rule. */
  key?: string;
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

  // **Nina's first four movement sentences assume higher is better.**
  // "{n} MORE" is paired with "stunning" and "{n} fewer" with "worth a
  // proper look", so on a figure where falling is the good news they
  // contradict themselves: a month where two fewer clients left came
  // out as "2 MORE clients who left than last month - stunning".
  //
  // The two below are hers too, given on 6 October for exactly this.
  // They are one shape rather than Nina's count/rate pair, because the
  // change is stated as a change — "down £1.50", "down 2.0%" — which
  // reads correctly whatever the unit, so there is no "0.4 fewer
  // unsubscribe rate" problem to avoid here.
  if (goodDirection === "down") {
    const fell = value < previous;
    return {
      key: fell ? "goodFall" : "badRise",
      panel: fell ? "wins" : "attention",
      size: previous === 0 ? 100 : (Math.abs(value - previous) / Math.abs(previous)) * 100,
      text: fill(fell ? TEMPLATES.goodFall : TEMPLATES.badRise, {
        Metric: asSentenceStart(label),
        // The size of the move, in the unit the card shows: £4.50 stays
        // £4.50 and a rate keeps its one decimal. Always positive — the
        // direction is in the word "down" or "up", and "down -2" is not
        // a sentence anybody wrote.
        n: money(Math.abs(value - previous)),
      }),
    };
  }

  const up = value > previous;
  const good = up;

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
  // One sentence per label. Two metrics share a label where one is
  // pulled from the other — "New clients" is both Leads' own figure and
  // Client Experience's copy of it — and saying it twice reads as two
  // separate pieces of news about the same thing.
  const seen = new Set<string>();
  const kept = inputs
    .map((input) => ({ input, highlight: highlightFor(input) }))
    .filter(
      (row): row is { input: HighlightInput; highlight: Highlight } => row.highlight !== null,
    )
    .sort((a, b) => b.highlight.size - a.highlight.size)
    .filter((row) => {
      const label = row.input.label.toLowerCase();
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    });

  // A rate drops out when the count it is computed from is saying the same
  // thing beside it. **Same panel is the test**, because that is what "move
  // together" means: new clients up while the close rate falls is two
  // pieces of news — more calls, converting worse — and both belong. Issues
  // raised up and issues per 10 clients up is one.
  const panelOf = new Map(kept.map((row) => [row.input.key, row.highlight.panel]));
  const all = kept
    .filter((row) => {
      const base = row.input.key ? DERIVED_FROM[row.input.key] : undefined;
      return !base || panelOf.get(base) !== row.highlight.panel;
    })
    .map((row) => row.highlight);

  return {
    attention: all.filter((h) => h.panel === "attention").slice(0, perPanel),
    wins: all.filter((h) => h.panel === "wins").slice(0, perPanel),
  };
}
