import type { GoodDirection } from "./formulas.ts";
import { formatValue, type Unit } from "./format.ts";

/**
 * "Look at these first 👀" and "What went WELL this month" (§7).
 *
 * **Every word a client reads here is Nina's.** The four celebration
 * lines are as she gave them on 5 October, verbatim — the capitals, the
 * ampersand and the emoji included. The four attention lines were hers
 * too until 28 October, when she asked for their tails to come off and a
 * "Focus area" tag to carry the signal instead; what is left of each is
 * her sentence with nothing added. They are in one file so the wording
 * can be changed without touching a screen, the same arrangement as the
 * publish email and the monthly recap.
 *
 * Nothing here is generated. A template is picked and filled; no
 * sentence is composed, and no figure is described in words the
 * templates do not contain.
 *
 * **Which figures get one is `FOCUS_FLOORS`,** added 1 November: the
 * sentences were always hers and until then the choice of what to say
 * them about was "the three biggest moves there are", however small
 * those were.
 */

export const PANELS = {
  attention: "Look at these first 👀",
  wins: "What went WELL this month",
} as const;

/**
 * The tag that replaces the tails, on the lines going the wrong way.
 *
 * Nina, 28 October, reviewing the pack: three sentences in a row ending
 * "…not the direction we want, let's dig into WHY" read as templated
 * rather than written, because they were. So the four attention
 * templates below are plain statements now and the signal moved into
 * this one tag, which the panel draws beside each line.
 *
 * One tag rather than four tails is also the only version that stays
 * right as the panel fills: a tag repeated three times reads as a label,
 * where a sentence repeated three times reads as a machine.
 */
export const FOCUS_TAG = "Focus area";

export const TEMPLATES = {
  countDown: "{n} fewer {metric} than last month",
  countUp: "{n} MORE {metric} than last month - stunning",
  rateDown: "{Metric} dropped from {from} to {to}",
  rateUp: "{Metric} up from {from} to {to} & that's no accident",
  belowTarget: "{Metric} is at {pct} of your target",
  beatTarget: "{Metric} beat your target by {pct} WOOOO",
  // The two for a figure where falling is the good news — churn, cost
  // per lead, clients who left. Given by Nina on 6 October, after the
  // four above came out backwards on exactly those figures.
  //
  // She wrote the placeholder lower case, `{metric}`; it is `{Metric}`
  // here because in her sentence the label starts it, and that is what
  // the capital in the name means in this file. Her words are unchanged.
  goodFall: "{Metric} down {n} - exactly the direction we want",
  badRise: "{Metric} up {n}",
} as const;

/**
 * How big a move has to be before it is worth a sentence.
 *
 * Dom, 1 November, on an Overview screenshot: "Variable costs up £11"
 * sitting in "Look at these first" beside two real problems. £239 to
 * £250 is 4.6%, and it was there because the panel takes the three
 * biggest things it has rather than the things worth reading. With no
 * floor under it, a quiet month fills the panel with its own noise, and
 * a list of three where one matters teaches the reader to skim all
 * three.
 *
 * **Two floors, and a move has to clear both.** A share of last month,
 * and an amount in the figure's own unit. Each catches what the other
 * cannot: the share alone would keep a £1 move on a figure that lives
 * at £2, and the amount alone would drop 2 new clients becoming 3 —
 * half as many again, and the most important number on the page.
 *
 * In a map next to the wording, for the reason the wording is in this
 * file: these are Nina's to change, and changing one should not mean
 * reading a screen. They are written up for her in
 * `docs/nina-review/04-wording.md` §7.
 */
export const FOCUS_FLOORS = {
  /** Of last month's figure, as a percentage. */
  relativePct: 10,

  /**
   * And at least this much in the figure's own unit: a percentage point
   * for a rate, one of anything counted, two hours, a tenth of a ratio,
   * half a month.
   */
  absolute: {
    count: 1,
    percent: 1,
    hours: 2,
    ratio: 0.1,
    months: 0.5,
    // Never reaches here — a text figure has no good direction — and
    // listed so the map covers the unit type rather than most of it.
    text: 0,
  },

  /**
   * Money, by the size of the figure rather than by which figure it is.
   *
   * **No single amount is small for every money figure this tool
   * holds.** Cost per click lives at 14p and revenue at £24,650, so
   * £100 — right for revenue — silences a cost per click that doubled,
   * and the 5p that keeps *that* honest is nothing at all on revenue.
   * The tiers are the judgement `decimalsFor` already makes in
   * `format.ts`, for the same reason: a figure's magnitude is knowable
   * where its meaning is not.
   *
   * Read against the larger of the two months, so a figure that
   * collapses is judged at the size it was.
   */
  currency: [
    { upTo: 10, floor: 0.05 },
    { upTo: 1000, floor: 1 },
    { upTo: Infinity, floor: 100 },
  ],

  /**
   * A target missed by less than this is not a focus area.
   *
   * **Deliberately not the 1% on the win side.** "Beat your target by
   * 1% WOOOO" is a nice thing to read and costs the reader nothing;
   * "at 97% of your target" is an item on a list of jobs, and it is
   * not one.
   */
  targetMissPct: 5,

  /** And a target beaten by less than this says nothing. */
  targetBeatPct: 1,
} as const;

/** The smallest move in `unit` that counts, at the size the figure is. */
export function floorFor(unit: Unit, figure: number): number {
  if (unit === "currency") {
    const size = Math.abs(figure);
    return FOCUS_FLOORS.currency.find((tier) => size < tier.upTo)!.floor;
  }
  return FOCUS_FLOORS.absolute[unit];
}

/** Is a month-on-month move big enough to say anything about? */
export function clearsFloors(unit: Unit, value: number, previous: number): boolean {
  const moved = Math.abs(value - previous);
  const size = Math.max(Math.abs(value), Math.abs(previous));
  if (moved < floorFor(unit, size)) return false;

  // Nothing to take a share of. A figure arriving from zero is news at
  // any size that cleared the amount above — "0 to 2 new clients" is
  // not a 200% anything, it is two clients.
  if (previous === 0) return true;

  return (moved / Math.abs(previous)) * 100 >= FOCUS_FLOORS.relativePct;
}

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

/**
 * A figure that is literally another figure, copied across.
 *
 * Different from `DERIVED_FROM` above, and the difference is the whole
 * point. A rate is its own figure: new clients up while the close rate
 * falls is two pieces of news, so that map only suppresses when both land
 * in the same panel. A PULLED figure is the same number in two places —
 * Financials shows the Offers total — so there is no case where saying it
 * twice is right, and it is suppressed whatever the panels do.
 *
 * Found by Dom on an Overview screenshot, 8 October: "Total revenue from
 * offers" and "Revenue from offers" both in "What went WELL", both
 * £2,000 to £3,000. The label dedupe missed it because the two labels are
 * not the same string, which is exactly why this is keyed by metric.
 *
 * The one `pulled` metric deliberately absent is
 * `client_experience_active_clients_at_start`, which has no good
 * direction and so never gets a sentence to suppress.
 */
export const PULLED_FROM: Record<string, string> = {
  // **A true pair again, from the end of 13 November.** It stopped
  // being one that morning, when Financials' revenue moved to the Actual
  // grid and the Offers screen was still typing its own; it is one again
  // now that an offer's revenue is money received too. Same figure, two
  // screens, one sentence.
  financials_revenue_from_offers: "offers_total_revenue_from_offers",
  // Caught today by the label dedupe, because both are called "New
  // clients". Named here as well so a relabel cannot quietly reopen it.
  client_experience_new_clients: "leads_conversions_new_clients",
  // Cannot collide today — `ads_leads` is per campaign, so it never
  // reaches a panel to be said twice. Named anyway, because the
  // relationship is real and the day Ads grows a month-level leads figure
  // is not the day to rediscover it. The suppression only fires when the
  // source actually speaks, so listing it costs nothing.
  leads_conversions_new_leads_from_ads: "ads_leads",
};

/**
 * Pulled figures that are nobody's copy.
 *
 * `pulled` meant one thing when this file was written — the same figure
 * appearing on a second screen — and means two things since the grids
 * (13 November): that, and a figure derived from the Actual grid rather
 * than typed. Other income is the second kind. There is no other metric
 * it duplicates, so there is no sentence to suppress, and it must not be
 * hunted for in `PULLED_FROM`.
 */
export const PULLED_FROM_NOTHING = new Set([
  "financials_other_income",
  // The four cost totals joined them when the expense grid took them
  // (13 November). Each is its bucket's sum over the month's expense
  // rows: a figure of its own, not a copy of another metric.
  "financials_fixed_costs",
  "financials_variable_costs",
  "financials_team_costs",
  "financials_investment_spend",
  // And the forecast, which is its own figure and not a copy of the
  // revenue it sits beside.
  "financials_money_expected",
]);

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
 *
 * And a figure that moved too little to matter — `FOCUS_FLOORS`, in
 * either of the two ways a move can be too little — says nothing
 * either, which is the same judgement one step earlier.
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
      if (by < FOCUS_FLOORS.targetBeatPct) return null;
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

    // A near miss is not a job. 97% of a target is somebody who very
    // nearly did the thing, and reading it under "Look at these first"
    // is being told off for it.
    const by = Math.abs(100 - pct);
    if (by < FOCUS_FLOORS.targetMissPct) return null;

    return {
      key: "belowTarget",
      panel: "attention",
      size: by,
      text: fill(TEMPLATES.belowTarget, {
        Metric: asSentenceStart(label),
        pct: `${Math.round(pct)}%`,
      }),
    };
  }

  if (previous === null || previous === value) return null;

  // The two floors, before any of the six movement sentences: below
  // them there is a move, and no news in it.
  if (!clearsFloors(unit, value, previous)) return null;

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
  const speaking = new Set(kept.map((row) => row.input.key));
  const all = kept
    .filter((row) => {
      const key = row.input.key;
      if (!key) return true;

      // **A figure kept per row arrives as `metric|entity`** (11
      // November), so that three platforms are three separate pieces of
      // news. The two rules below are about one figure and another, and
      // they have to compare like with like — Instagram's engagement
      // rate against Instagram's likes, never LinkedIn's.
      const [metricKey, entity] = key.split("|");
      const sameRow = (other: string) => (entity ? `${other}|${entity}` : other);

      // The same number in two places: never worth saying twice.
      const pulled = PULLED_FROM[metricKey];
      if (pulled && speaking.has(sameRow(pulled))) return false;

      // A rate and the count behind it: worth saying twice only when they
      // are telling different stories, which is what different panels
      // mean.
      const base = DERIVED_FROM[metricKey];
      return !base || panelOf.get(sameRow(base)) !== row.highlight.panel;
    })
    .map((row) => row.highlight);

  return {
    attention: all.filter((h) => h.panel === "attention").slice(0, perPanel),
    wins: all.filter((h) => h.panel === "wins").slice(0, perPanel),
  };
}
