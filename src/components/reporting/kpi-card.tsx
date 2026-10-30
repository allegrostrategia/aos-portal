import Link from "next/link";

import { Sparkline } from "./charts/sparkline";
import { IconCircle, type IconTone, type ReportIconName } from "./icons";
import {
  CHANGE_TONE_CLASS,
  changeTone,
  formatChange,
  formatValue,
  type Unit,
} from "@/lib/reporting/format";
import { monthOnMonthChange } from "@/lib/reporting/formulas";

/**
 * The KPI card of §3's pattern list: label, big number, month-on-month change
 * with an arrow, the month it is compared against, and the shape of the last
 * twelve months.
 *
 * The sparkline is optional and the card is complete without one — a metric
 * with a single month of history has no shape to draw, and a client reading
 * their first report should not see five cards with an empty box on each.
 *
 * The arrow's colour comes from the metric's own direction, never from the
 * sign: a fall in costs is good news, and a report that congratulates
 * somebody on their costs rising is worse than one with no colour at all.
 */
export function KpiCard({
  label,
  value,
  previous,
  unit,
  goodDirection,
  currency,
  previousLabel,
  href,
  light,
  icon,
  history,
}: {
  label: string;
  value: number | null;
  previous: number | null;
  unit: Unit;
  goodDirection: "up" | "down" | "none";
  currency: string;
  previousLabel: string | null;
  href?: string;
  /**
   * §7's traffic light, worked out by `trafficLight()` against a target,
   * a benchmark or last month — in that order, using the first one the
   * client actually has.
   *
   * **Never colour alone.** The dot carries a word with it, because a
   * red and a green dot are the pair most colourblind readers cannot
   * separate, and because a dot on its own says nothing about what it
   * was measured against.
   */
  light?: { tone: "green" | "amber" | "red"; against: string } | null;
  /**
   * The mockups' tinted disc beside the label. Decorative — it repeats the
   * label, which is right there in words — so a card without one says
   * everything a card with one says.
   */
  icon?: { name: ReportIconName; tone: IconTone };
  /**
   * This metric's figure for each of the last twelve months, oldest first,
   * null where nothing was entered. Undefined on a screen that has not
   * loaded any — the card simply has no sparkline.
   */
  history?: (number | null)[];
}) {
  const change = monthOnMonthChange(value, previous);
  const tone = changeTone(change, goodDirection);
  const changeText = formatChange(change);

  const toneClass = CHANGE_TONE_CLASS[tone ?? "neutral"];

  // Colour plus a word, always. The dot alone would be the one pair a
  // colourblind reader cannot separate, and it would not say what the
  // figure was measured against either.
  const lightWord =
    light?.tone === "green"
      ? "On track"
      : light?.tone === "amber"
        ? "Close"
        : light?.tone === "red"
          ? "Off track"
          : null;
  const lightColour =
    light?.tone === "green"
      ? "#1f7a4d"
      : light?.tone === "amber"
        ? "var(--aos-orange)"
        : "var(--aos-deep-red)";

  const body = (
    <>
      {/* The label in sentence case beside the disc, not a tracked small-cap
          eyebrow (Nina, 30 Oct). The mockups read "Revenue", and at this
          size the eyebrow treatment was competing with the figure under
          it rather than introducing it.

          `gap-2.5` and `min-w-0` are what keep the longest one on a single
          line in a six-across row: at 178px a card has about 115px beside
          a 40px disc, which "Email list" fits and "Email list size" did
          not. The shortening itself is in `overview.ts`, where the wording
          lives; this is the room it needed. */}
      {icon ? (
        <div className="flex items-center gap-2.5">
          <IconCircle name={icon.name} tone={icon.tone} size="sm" />
          <span className="min-w-0 text-small font-medium text-ink/75">{label}</span>
        </div>
      ) : (
        <span className="block text-small font-medium text-ink/75">{label}</span>
      )}
      {/* **The display serif, not the mono.** CLAUDE.md gives Cormorant
          "headings and display values" and reserves the mono for numbers
          in running data — a table column, a date beside a label. A
          headline figure on a card is a display value, and it is what the
          mockups draw.
          Sized to the card, not to the page. `text-title` clamps up to
          44px, which overflows a six-across grid the moment a figure
          reaches £24,850 — caught by looking at it, not by a test. */}
      {/* **`lining-nums proportional-nums`, and it is not a preference.**
          Cormorant's default figures are OLD-STYLE: measured in Chrome
          against the actual webfont, the default rendering is pixel-for-
          pixel identical to `oldstyle-nums`, which draws "1" as a bare
          stem at x-height and sinks 0, 4 and 5 below the others —
          "184,500" reads as "I84,5oo" on a card (Dom, 30 October). `lnum`
          IS in the Google webfont and switching it on levels them at cap
          height.

          Proportional, not tabular: tabular figures exist to make columns
          line up and a headline figure is not in a column, so the face's
          own spacing is the better one. Scoped to the FIGURE rather than
          to `.font-display` everywhere, because old-style figures are
          correct inside running text and a heading — this is the one
          place where the digits are the content. */}
      <p className="font-display mt-2 text-[2rem] leading-tight font-medium text-ink lining-nums proportional-nums 2xl:text-[2.25rem]">
        {formatValue(value, unit, currency)}
      </p>
      {/* The change and the month it is against stack, with the sparkline
          beside them — the mockups' arrangement, and the one that fits:
          inline, "↑ 18% vs. Aug 2026" wrapped anyway in a six-across row,
          so the second line was already there without the shape to show
          for it. */}
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          {changeText && previousLabel ? (
            <>
              {/* Each line whole or not at all. "↑ 611%" broken after the
                  arrow is not a figure, it is three fragments. */}
              <p className={`whitespace-nowrap text-small font-medium ${toneClass}`}>
                {changeText}
              </p>
              <p className="whitespace-nowrap text-caption text-ink/45">
                vs. {previousLabel}
              </p>
            </>
          ) : (
            <p className="text-small text-ink/40">No month to compare</p>
          )}
        </div>
        {history ? (
          <Sparkline
            points={history}
            label={`${label} over the last ${history.length} months`}
          />
        ) : null}
      </div>
      {/* Each phrase wraps as a whole or not at all: six cards across,
          "On track" broke over two lines and "vs. last month" over two
          more. Seen on the rendered card, not in the markup. */}
      {light && lightWord ? (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-caption text-ink/60">
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ background: lightColour }}
            />
            {lightWord}
          </span>
          <span className="whitespace-nowrap text-ink/45">vs. {light.against}</span>
        </p>
      ) : null}
    </>
  );

  const shell =
    "block rounded-card border border-ink/8 bg-card p-5 shadow-soft transition";

  return href ? (
    <Link href={href} className={`${shell} hover:border-ink/20`}>
      {body}
    </Link>
  ) : (
    <div className={shell}>{body}</div>
  );
}
