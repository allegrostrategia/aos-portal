/**
 * Turning a figure into what a client reads.
 *
 * Pure and shared, because the entry screen's "Worked out for you" card and
 * the published report must show a number the same way. A margin printed as
 * 46.4% on one screen and 46% on the other is the kind of difference that
 * makes someone doubt both.
 *
 * The em dash is the whole point of §4's divide-by-zero rule: "shows a dash,
 * never an error or 0%". It appears once, here, so no screen can decide to
 * show "0%" or "n/a" instead.
 */

export const DASH = "—";

export type Unit =
  | "count"
  | "currency"
  | "percent"
  | "hours"
  | "ratio"
  | "months"
  | "text";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
};

export function currencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? `${currency} `;
}

/**
 * How many decimals a unit is worth showing.
 *
 * Money and counts to the whole number: £24,850 and 8,386, as the mockups
 * print them. Rates to one decimal — 6.9%, not 6.94% — because the second
 * decimal of a rate is noise the client cannot act on. Ratios to one for the
 * same reason (ROAS 2.1). Hours to one, since half an hour is a real amount
 * of time.
 */
/**
 * How many decimal places a figure gets.
 *
 * Money is whole pounds — £24,650, not £24,650.00 — **except when the
 * pennies are the figure**. Cost per click is fourteen pence and cost per
 * lead is £4.50, and rounding those to the pound printed "£0" and "£5":
 * the §10.2 worked example is precisely that £6.00 blended against £4.50
 * honest, and at whole pounds the difference disappeared off the screen.
 * Found 6 Oct by a browser test expecting £4.50 and getting £5.
 *
 * The rule is the magnitude, not the metric, so nothing has to remember
 * which figures are per-unit: under a thousand and not a round number
 * keeps its pennies.
 */
function decimalsFor(unit: Unit, value: number): number {
  switch (unit) {
    case "currency":
      return Math.abs(value) < 1000 && !Number.isInteger(value) ? 2 : 0;
    case "count":
      return 0;
    case "percent":
    case "ratio":
    case "hours":
    case "months":
      return 1;
    default:
      return 0;
  }
}

/**
 * Format a figure for display.
 *
 * Null, undefined and non-finite all become the dash. A genuine zero does
 * not: "0 new clients" is an answer, and showing it as a dash would hide a
 * bad month rather than report it.
 */
export function formatValue(
  value: number | null | undefined,
  unit: Unit,
  currency = "GBP",
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return DASH;

  const decimals = decimalsFor(unit, value);
  const body = value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  switch (unit) {
    case "currency":
      // Negative money reads better as −£400 than £-400.
      return value < 0
        ? `−${currencySymbol(currency)}${Math.abs(value).toLocaleString("en-GB", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          })}`
        : `${currencySymbol(currency)}${body}`;
    case "percent":
      return `${body}%`;
    case "hours":
      return `${body}h`;
    case "months":
      return `${body} months`;
    case "ratio":
    case "count":
    default:
      return body;
  }
}

/**
 * A figure short enough for a chart's axis: £50K, 600K, 4%, 2.1.
 *
 * Not `formatValue`. An axis label is read at a glance and sits in about
 * forty pixels, and "£50,000" at that size either overlaps its neighbour or
 * shrinks the plot to make room — the mockups print £50K and 600K for
 * exactly that reason. Everywhere a figure is the answer rather than a
 * gridline, `formatValue` is still the one to use: nothing here is accurate
 * enough to quote.
 *
 * **Rounded towards the gridline it labels, never towards a nicer number.**
 * The caller picks the gridline values, so these are already round; one
 * decimal is kept only where dropping it would print two different
 * gridlines the same, as 1.2M and 1.4M would both become "1M".
 */
export function compactAxisValue(
  value: number,
  unit: Unit,
  currency = "GBP",
): string {
  const sign = value < 0 ? "−" : "";
  const size = Math.abs(value);

  const short = (() => {
    if (size >= 1_000_000) {
      const m = size / 1_000_000;
      return `${m.toLocaleString("en-GB", { maximumFractionDigits: m < 10 ? 1 : 0 })}M`;
    }
    if (size >= 1_000) {
      const k = size / 1_000;
      return `${k.toLocaleString("en-GB", { maximumFractionDigits: k < 10 ? 1 : 0 })}K`;
    }
    // Under a thousand there is nothing to shorten, so a rate keeps the
    // one decimal it is worth and everything else is whole.
    const decimals = unit === "percent" || unit === "ratio" || unit === "hours" ? 1 : 0;
    return size.toLocaleString("en-GB", {
      minimumFractionDigits: Number.isInteger(size) ? 0 : decimals,
      maximumFractionDigits: decimals,
    });
  })();

  switch (unit) {
    case "currency":
      return `${sign}${currencySymbol(currency)}${short}`;
    case "percent":
      return `${sign}${short}%`;
    case "hours":
      return `${sign}${short}h`;
    default:
      return `${sign}${short}`;
  }
}

/**
 * The month-on-month change beside a figure: "↑ 18% vs. Aug 2026".
 *
 * Returns null when there is nothing to compare against, so the caller draws
 * nothing rather than an arrow pointing at an absence.
 *
 * Which colour it wears depends on the metric, not the sign: a fall in
 * unsubscribes is good news and a rise in costs is not. That is what
 * `goodDirection` decides, and getting it from the metric list rather than
 * from the arrow's direction is the whole reason the column exists.
 */
export function changeTone(
  changePercent: number | null,
  goodDirection: "up" | "down" | "none",
): "good" | "bad" | "neutral" | null {
  if (changePercent === null || !Number.isFinite(changePercent)) return null;
  if (goodDirection === "none") return "neutral";
  if (changePercent === 0) return "neutral";
  const rose = changePercent > 0;
  return (goodDirection === "up") === rose ? "good" : "bad";
}

/**
 * The ink a change wears, by what the change means.
 *
 * Here rather than in a component because two screens draw it now — the
 * KPI cards and the "Everything else this month" list (Nina's answer of
 * 29 October) — and the one thing worse than no arrow is two screens
 * colouring the same figure differently.
 *
 * Grey covers both neutral cases, and they are different: a figure with
 * no good direction (hours delivering, ad spend) and a figure that did
 * not move. Neither is news, and neither should be read as either.
 */
export const CHANGE_TONE_CLASS: Record<"good" | "bad" | "neutral", string> = {
  good: "text-[#1f7a4d]",
  bad: "text-deep-red",
  neutral: "text-ink/55",
};

/**
 * The colour of a target bar, which the mockups vary by how close the month
 * is to its target rather than drawing every bar the same.
 *
 * Four steps, and the thresholds are the point: a bar's colour is a second
 * reading of a number already printed beside it as "4 of 6  67%", never the
 * only one. Somebody who cannot separate gold from orange still has the
 * figure, the percentage and the bar's own length.
 *
 *   met          green   — on or past it, or under it where under is the win
 *   ≥ 75%        gold    — close
 *   ≥ 50%        orange  — halfway
 *   below        blush   — a long way off
 *
 * **"Met" is not "100%".** A metric whose good direction is down — cost per
 * lead, clients who left — is met by being *under* its target, and a bar
 * showing 40% of a cost target is the best news on the page. Reading those
 * as "40%, a long way off" is exactly backwards, so the caller passes the
 * direction and this asks the right question for it.
 */
export type TargetTone = "met" | "close" | "halfway" | "far";

export function targetTone(
  value: number | null,
  target: number,
  goodDirection: "up" | "down" | "none",
): TargetTone {
  const reached = value ?? 0;

  if (goodDirection === "down") {
    // Under target is the win; there is no "nearly" worth a colour of its
    // own, so the only question is whether they are over it.
    return reached <= target ? "met" : "far";
  }

  const share = target > 0 ? (reached / target) * 100 : 0;
  if (share >= 100) return "met";
  if (share >= 75) return "close";
  if (share >= 50) return "halfway";
  return "far";
}

/** The fill for each step. Green is the one in CHANGE_TONE_CLASS. */
export const TARGET_TONE_FILL: Record<TargetTone, string> = {
  met: "#1f7a4d",
  close: "var(--aos-gold)",
  halfway: "var(--aos-orange)",
  far: "var(--aos-blush)",
};

/** "↑ 18%" / "↓ 22%". The sign is the movement; the colour is the meaning. */
export function formatChange(changePercent: number | null): string | null {
  if (changePercent === null || !Number.isFinite(changePercent)) return null;
  const arrow = changePercent > 0 ? "↑" : changePercent < 0 ? "↓" : "→";
  const size = Math.abs(changePercent).toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: changePercent !== 0 && Math.abs(changePercent) < 10 ? 1 : 0,
  });
  return `${arrow} ${size}%`;
}

/**
 * What goes in a number input.
 *
 * Deliberately NOT formatted: an input holding "24,850" is an input the
 * browser will not parse as a number and the person cannot type into
 * comfortably. Empty string for a missing figure, so the box is blank rather
 * than holding a zero nobody entered.
 */
export function toInputValue(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * What came out of one. Blank means "not entered", which is different from
 * zero and has to survive the round trip as null.
 */
export function fromInputValue(raw: string): number | null {
  const trimmed = raw.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}
